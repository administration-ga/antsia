/**
 * Identité PA4 : les preuves viennent du callback OIDC et du composant Better
 * Auth, jamais des arguments publics. Aucun nom civil, contact ni adhésion
 * n'est recopié à la première session ; les seuls contacts conservés dans le
 * moteur sont des empreintes de canaux vérifiés.
 */
import { hasStrongIdentity } from "@antsia/social-domain/badges"
import { entryStatusFor, isActiveStatus } from "@antsia/social-domain/membership"
import { v } from "convex/values"

import { components, internal } from "../../_generated/api"
import type { Doc, Id } from "../../_generated/dataModel"
import { internalMutation, mutation, type MutationCtx, type QueryCtx } from "../../_generated/server"
import { getMembership, getRootNetwork } from "../../lib/access"
import { fail, notFound } from "../../lib/errors"
import { enforceRateLimit } from "../../lib/rateLimit"
import { getActiveIdentity } from "../../lib/session"
import { revokeAdministrationForPerson } from "../federation/agentLifecycle"
import { MANAGED_MEMBERSHIP_REDERIVERS } from "../networks/sliceRegistry"
import { syncPersonDirectory } from "./directory"
import { idnLoaValidator, idnProfileTypeValidator } from "./tables"

type AuthUser = {
  _id: string
  email: string
  emailVerified: boolean
  phoneNumber?: string | null
  phoneNumberVerified?: boolean | null
}
type IdnAccount = { accountId: string; providerId: string; userId: string }
type LinkInput = Pick<Doc<"identityLinks">, "provider" | "subject"> &
  Partial<Pick<Doc<"identityLinks">, "loa" | "nationality" | "profileType" | "channel">>

async function authUserOf(ctx: QueryCtx, authUserId: string): Promise<AuthUser | null> {
  try {
    return await ctx.runQuery(components.betterAuth.adapter.findOne, {
      model: "user",
      where: [{ field: "_id", value: authUserId }],
      select: ["_id", "email", "emailVerified", "phoneNumber", "phoneNumberVerified"],
    }) as AuthUser | null
  } catch (error) {
    // Un sujet qui n'est pas un ID du composant n'a aucune preuve utilisateur.
    // Toute panne du composant est relancée, sans accorder une identité forte.
    if (error instanceof Error && (/Invalid argument `id`, expected ID/i.test(error.message) || /(?:Invalid|not a valid|is not a valid) (?:Convex )?(?:document )?ID\b/i.test(error.message))) return null
    throw error
  }
}

/** Le sujet opaque IDN : aucune normalisation susceptible de changer son identité. */
function assertSubject(subject: string): void {
  if (subject.length === 0 || subject.length > 512 || subject.trim() !== subject || /[\u0000-\u001f\u007f]/u.test(subject)) fail("invalidArgument", { field: "subject" })
}

/** Seul le callback serveur ayant lu `/userinfo` peut déposer cette preuve. */
export const recordIdnProof = internalMutation({
  args: {
    subject: v.string(),
    loa: v.optional(idnLoaValidator),
    nationality: v.optional(v.string()),
    profileType: v.optional(idnProfileTypeValidator),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    assertSubject(args.subject)
    if (args.nationality !== undefined && (args.nationality.length === 0 || args.nationality.length > 100)) fail("invalidArgument", { field: "nationality" })
    const existing = await ctx.db.query("idnProofs").withIndex("by_subject", (q) => q.eq("subject", args.subject)).unique()
    const proof = { ...args, observedAt: Date.now() }
    if (existing) await ctx.db.patch(existing._id, { ...proof, loa: args.loa, nationality: args.nationality, profileType: args.profileType })
    else await ctx.db.insert("idnProofs", proof)
    if ((args.loa ?? 0) < 2 || (args.loa ?? 0) < (existing?.loa ?? 0)) {
      const link = await ctx.db.query("identityLinks").withIndex("by_provider_and_subject", (q) => q.eq("provider", "idn").eq("subject", args.subject)).unique()
      if (link) await revokeAdministrationForPerson(ctx, link.personId)
    }
    return null
  },
})

async function idnAccountOf(ctx: QueryCtx, authUserId: string): Promise<IdnAccount | null> {
  // borné : un compte IDN par utilisateur ; deux lignes ou une suite ambiguë sont refusées.
  const result = await ctx.runQuery(components.betterAuth.adapter.findMany, {
    model: "account",
    where: [{ field: "providerId", value: "idn" }, { field: "userId", value: authUserId }],
    select: ["accountId", "providerId", "userId"],
    paginationOpts: { cursor: null, numItems: 2 },
  }) as { page: IdnAccount[]; isDone: boolean }
  if (!result.isDone || result.page.length > 1) return notFound()
  const account = result.page[0] ?? null
  if (account && (account.userId !== authUserId || account.providerId !== "idn")) return notFound()
  return account
}

async function ownLink(ctx: QueryCtx, personId: Id<"persons">, provider: LinkInput["provider"]) {
  return await ctx.db.query("identityLinks").withIndex("by_person_and_provider", (q) => q.eq("personId", personId).eq("provider", provider)).unique()
}

/** Sujet IDN confirmé côté serveur : compte, lien vivant et preuve doivent encore concorder. */
export async function currentVerifiedIdnSubjectOf(ctx: QueryCtx | MutationCtx, person: Doc<"persons">): Promise<string | null> {
  if (person.erasedAt !== undefined || person.deletionRequestedAt !== undefined) return null
  const user = await authUserOf(ctx, person.authUserId)
  if (!user || user._id !== person.authUserId) return null
  const account = await idnAccountOf(ctx, person.authUserId)
  if (!account) return null
  const link = await ownLink(ctx, person._id, "idn")
  const proof = await ctx.db.query("idnProofs").withIndex("by_subject", (q) => q.eq("subject", account.accountId)).unique()
  if (!link || link.revokedAt !== undefined || link.subject !== account.accountId || (link.loa ?? 0) < 2 || !proof || (proof.loa ?? 0) < 2) return null
  assertSubject(account.accountId)
  return account.accountId
}

/** Upsert unique : une identité déjà liée à une autre personne reste refusée, même révoquée. */
async function writeLink(ctx: MutationCtx, person: Doc<"persons">, input: LinkInput, linkedAt: number): Promise<boolean> {
  const other = await ctx.db.query("identityLinks").withIndex("by_provider_and_subject", (q) => q.eq("provider", input.provider).eq("subject", input.subject)).unique()
  if (other && other.personId !== person._id) return notFound()
  const existing = await ownLink(ctx, person._id, input.provider)
  if (existing && existing.revokedAt === undefined && existing.subject === input.subject && existing.loa === input.loa && existing.nationality === input.nationality && existing.profileType === input.profileType && existing.channel === input.channel) return false
  await enforceRateLimit(ctx, "person.identity", person._id)
  if (input.provider === "idn" && (existing?.subject !== input.subject || existing?.revokedAt !== undefined || (input.loa ?? 0) < 2 || (input.loa ?? 0) < (existing?.loa ?? 0))) {
    await revokeAdministrationForPerson(ctx, person._id)
  }
  const fields = { ...input, loa: input.loa, nationality: input.nationality, profileType: input.profileType, channel: input.channel, linkedAt, revokedAt: undefined }
  if (existing) await ctx.db.patch(existing._id, fields)
  else await ctx.db.insert("identityLinks", { personId: person._id, ...input, linkedAt })
  return true
}

async function revokeLink(ctx: MutationCtx, person: Doc<"persons">, provider: LinkInput["provider"]): Promise<boolean> {
  if (provider === "idn") await revokeAdministrationForPerson(ctx, person._id)
  const existing = await ownLink(ctx, person._id, provider)
  if (!existing || existing.revokedAt !== undefined) return false
  await enforceRateLimit(ctx, "person.identity", person._id)
  await ctx.db.patch(existing._id, { revokedAt: Date.now() })
  return true
}

async function linkIdnForPerson(ctx: MutationCtx, person: Doc<"persons">, requireProof: boolean): Promise<boolean> {
  const account = await idnAccountOf(ctx, person.authUserId)
  const proof = account ? await ctx.db.query("idnProofs").withIndex("by_subject", (q) => q.eq("subject", account.accountId)).unique() : null
  if (!account || !proof) {
    if (requireProof) return notFound()
    // Une preuve disparue ne laisse pas un ancien niveau de garantie actif.
    return await revokeLink(ctx, person, "idn")
  }
  assertSubject(account.accountId)
  return await writeLink(ctx, person, { provider: "idn", subject: account.accountId, loa: proof.loa, nationality: proof.nationality, profileType: proof.profileType }, proof.observedAt)
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")
}

function verifiedEmail(user: AuthUser): string | null {
  const email = user.email.trim().toLowerCase()
  return user.emailVerified === true && email.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email) ? email : null
}

async function localProofOf(user: AuthUser): Promise<LinkInput | null> {
  const email = verifiedEmail(user)
  if (email) return { provider: "local", subject: await sha256Hex(email), channel: "email" }
  const phone = user.phoneNumber
  if (user.phoneNumberVerified === true && typeof phone === "string" && /^\+[1-9]\d{6,14}$/u.test(phone)) return { provider: "local", subject: await sha256Hex(phone), channel: "phone" }
  return null
}

async function linkLocalForPerson(ctx: MutationCtx, person: Doc<"persons">, user: AuthUser, required: boolean): Promise<void> {
  const proof = await localProofOf(user)
  if (!proof) {
    if (required) return notFound()
    await revokeLink(ctx, person, "local")
    return
  }
  await writeLink(ctx, person, proof, Date.now())
}

async function activePerson(ctx: MutationCtx): Promise<{ person: Doc<"persons">; user: AuthUser }> {
  const identity = await getActiveIdentity(ctx)
  if (!identity) return fail("unauthenticated")
  const person = await ctx.db.query("persons").withIndex("by_authUserId", (q) => q.eq("authUserId", identity.subject)).unique()
  const user = await authUserOf(ctx, identity.subject)
  if (!person || !user || user._id !== identity.subject) return fail("unauthenticated")
  return { person, user }
}

const MEMBERSHIP_BATCH = 50

/**
 * Maintient seulement les adhésions déjà choisies ; chaque transaction relit les liens actuels.
 * Un réseau gouverné par une tranche (`managedBy`) est relu par SON gestionnaire, inscrit au registre
 * des tranches (`networks/sliceRegistry`) ; sans gestionnaire, il est sauté. Départ et sanction ne
 * sont jamais confiés à la tranche.
 */
async function reconcileMemberships(ctx: MutationCtx, personId: Id<"persons">, cursor: string | null): Promise<{ changed: number; done: boolean }> {
  const links = await ctx.db.query("identityLinks").withIndex("by_person_and_provider", (q) => q.eq("personId", personId)).take(16)
  const strongIdentity = hasStrongIdentity(links)
  const externalVerification = links.some((link) => link.provider === "consular_attestation" && link.revokedAt === undefined)
  const root = await getRootNetwork(ctx)
  const rootMembership = root ? await getMembership(ctx, root._id, personId) : null
  if (rootMembership && !isActiveStatus(rootMembership.status)) return { changed: 0, done: true }
  // borné : MEMBERSHIP_BATCH adhésions par transaction, la suite par passage planifié ; au plus une relecture
  // de tranche par adhésion de la page (aucune lecture de plus pour un réseau sans gestionnaire).
  const page = await ctx.db.query("networkMemberships").withIndex("by_person_and_status", (q) => q.eq("personId", personId)).paginate({ cursor, numItems: MEMBERSHIP_BATCH })
  const now = Date.now()
  let changed = 0
  for (const membership of page.page) {
    if (!isActiveStatus(membership.status)) continue
    const network = await ctx.db.get(membership.networkId)
    if (!network || network.status !== "active") continue
    if (network.managedBy !== undefined) {
      // Réseau gouverné : sa tranche relit l'adhésion selon SES règles (idempotente) ; sans gestionnaire, rien ne change.
      const rederive = MANAGED_MEMBERSHIP_REDERIVERS[network.managedBy]
      if (rederive !== null && (await rederive(ctx, membership, now)) !== membership.status) changed += 1
      continue
    }
    const target = entryStatusFor(network.membershipPolicy, { strongIdentity, externalVerification: network.kind === "root" && externalVerification, sponsored: membership.sponsorPersonId !== undefined })
    if (!target) continue
    const upgrade = strongIdentity && (membership.status === "en_attente" || (membership.status === "declaree" && target === "verifiee"))
    const downgrade = membership.status === "verifiee" && membership.verifiedBy === "idn" && !strongIdentity && !externalVerification && target !== "verifiee"
    if (!upgrade && !downgrade) continue
    await ctx.db.patch(membership._id, { status: target, verifiedBy: target === "verifiee" ? "idn" : undefined, statusChangedAt: Date.now() })
    changed += 1
  }
  if (changed > 0) await syncPersonDirectory(ctx, personId)
  if (!page.isDone) await ctx.scheduler.runAfter(0, internal.modules.people.identity.reconcileIdentityMemberships, { personId, cursor: page.continueCursor })
  return { changed, done: page.isDone }
}

export const reconcileIdentityMemberships = internalMutation({
  args: { personId: v.id("persons"), cursor: v.union(v.string(), v.null()) },
  returns: v.object({ changed: v.number(), done: v.boolean() }),
  handler: async (ctx, { personId, cursor }): Promise<{ changed: number; done: boolean }> => await reconcileMemberships(ctx, personId, cursor),
})

/** Synchronisation après une session valide ; aucun choix de profil ni adhésion n'est ajouté. */
export async function syncIdentityForPerson(ctx: MutationCtx, person: Doc<"persons">): Promise<void> {
  const identity = await getActiveIdentity(ctx)
  if (!identity || identity.subject !== person.authUserId) return fail("unauthenticated")
  const user = await authUserOf(ctx, identity.subject)
  if (!user || user._id !== identity.subject) {
    const changed = await revokeLink(ctx, person, "idn")
    await revokeLink(ctx, person, "local")
    if (changed) await reconcileMemberships(ctx, person._id, null)
    return
  }
  const changed = await linkIdnForPerson(ctx, person, false)
  await linkLocalForPerson(ctx, person, user, false)
  if (changed) await reconcileMemberships(ctx, person._id, null)
}

/** @selfScoped La personne de la session lie l'identité IDN prouvée par son compte Better Auth. */
export const linkIdn = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const { person } = await activePerson(ctx)
    await enforceRateLimit(ctx, "person.write", person._id)
    const changed = await linkIdnForPerson(ctx, person, true)
    if (changed) await reconcileMemberships(ctx, person._id, null)
    return null
  },
})

/** @selfScoped La personne de la session lie son canal vérifié, sans transmettre son contact. */
export const linkLocal = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const { person, user } = await activePerson(ctx)
    await enforceRateLimit(ctx, "person.write", person._id)
    await linkLocalForPerson(ctx, person, user, true)
    return null
  },
})

/** Sujet serveur du contrat consulaire : seule l'empreinte de l'adresse actuellement vérifiée sort du helper. */
export async function verifiedEmailHashOf(ctx: QueryCtx, personId: Id<"persons">): Promise<string | null> {
  const person = await ctx.db.get(personId)
  if (!person) return null
  const user = await authUserOf(ctx, person.authUserId)
  if (!user || user._id !== person.authUserId) return null
  const email = verifiedEmail(user)
  return email ? await sha256Hex(email) : null
}
