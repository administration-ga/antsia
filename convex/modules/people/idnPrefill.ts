/**
 * ADR-0044 (lot M1) — l'accueil pré-rempli par IDN.
 *
 * Au retour d'IDN, le rappel OIDC dépose ce que l'accueil propose AVANT le geste : prénoms, nom de
 * famille, identifiant IDN (`idnEntryPrefill`, `betterAuth/settings.ts`). La ligne est éphémère
 * (24 h, purge quotidienne), à part de la preuve (`idnProofs`), de la personne et de Better Auth, qui
 * ne reçoivent toujours aucun nom civil. Rien n'en naît d'office : le profil naît au bouton de
 * l'accueil (`publishMyProfile`), qui efface aussitôt la part d'identité.
 *
 * La ligne est rangée sous l'utilisateur Better Auth de la session (`persons.authUserId`) : pendant le
 * rappel, la personne n'existe pas encore (elle naît ensuite, par `ensureMyPerson`), et le greffon
 * `engine-idn-session-proof` ne l'écrit qu'une fois la session réellement ouverte — une connexion
 * refusée ou un simple rattachement de compte n'en laissent aucune.
 */
import { DISPLAY_NAME_MAX_LENGTH } from "@antsia/social-domain/content"
import { normalizeCivilName } from "@antsia/social-domain/civilName"
import { idnHandleLadder } from "@antsia/social-domain/handleSuggestion"
import { v } from "convex/values"

import { internal } from "../../_generated/api"
import type { Doc } from "../../_generated/dataModel"
import { internalMutation, type MutationCtx, type QueryCtx } from "../../_generated/server"
import { civilNameClaim, isIdnIdentifier } from "../../betterAuth/settings"
import { personQuery } from "../../lib/functions"
import { isHandleFreeFor } from "./handleAvailability"

/** Durée de vie d'un pré-remplissage (choix du propriétaire, 25/11/2026). */
export const IDN_PREFILL_TTL_MS = 24 * 60 * 60 * 1000
const PURGE_BATCH = 100
const AUTH_USER_ID_MAX_LENGTH = 256

/** Ce que lit l'accueil. `residence` reste `null` au lot M1 (la résidence vient au lot M2). */
const entryPrefillValidator = v.object({
  displayName: v.union(v.string(), v.null()),
  handles: v.array(v.object({ handle: v.string(), available: v.boolean() })),
  residence: v.null(),
})

async function prefillOf(ctx: QueryCtx, authUserId: string): Promise<Doc<"idnPrefills"> | null> {
  return await ctx.db.query("idnPrefills").withIndex("by_authUserId", (q) => q.eq("authUserId", authUserId)).unique()
}

/** L'identité d'IDN ne sert qu'avant le premier profil : jamais pour un profil publié, ni pendant un effacement. */
function awaitsFirstProfile(person: Doc<"persons">): boolean {
  return person.publishedAt === undefined && person.erasedAt === undefined && person.deletionRequestedAt === undefined
}

/** « NDONG MBA Jean-Rémy Éloïse » : NOM(S) puis Prénom(s), par le normaliseur partagé ; `null` sans nom ou trop long. */
function civilDisplayName(givenNames: string | undefined, familyName: string | undefined): string | null {
  const parts = normalizeCivilName({ firstName: givenNames ?? "", lastName: familyName ?? "" })
  const name = [parts.lastName, parts.firstName].filter((part) => part.length > 0).join(" ")
  return name.length > 0 && name.length <= DISPLAY_NAME_MAX_LENGTH ? name : null
}

/**
 * Seul le greffon `engine-idn-session-proof` (`betterAuth/auth.ts`) l'appelle, au rappel OIDC, une
 * fois la session ouverte (cliquet `idn-prefill-writer`). Remplace la ligne de l'utilisateur au lieu
 * d'en ajouter une. Revalide chaque champ ; une valeur hors bornes est écartée sans lever. Aucune
 * identité n'est écrite pour une personne au profil déjà publié ou en cours d'effacement.
 */
export const recordIdnPrefill = internalMutation({
  args: {
    authUserId: v.string(),
    givenNames: v.optional(v.string()),
    familyName: v.optional(v.string()),
    idnIdentifier: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    if (args.authUserId.length === 0 || args.authUserId.length > AUTH_USER_ID_MAX_LENGTH) return null
    const existing = await prefillOf(ctx, args.authUserId)
    const person = await ctx.db.query("persons").withIndex("by_authUserId", (q) => q.eq("authUserId", args.authUserId)).unique()
    const givenNames = civilNameClaim(args.givenNames)
    const familyName = civilNameClaim(args.familyName)
    const idnIdentifier = args.idnIdentifier !== undefined && isIdnIdentifier(args.idnIdentifier) ? args.idnIdentifier : undefined
    const nothing = givenNames === undefined && familyName === undefined && idnIdentifier === undefined
    if (nothing || (person !== null && !awaitsFirstProfile(person))) {
      // Lot M1 : la ligne ne porte que l'identité ; elle part entière.
      if (existing) await ctx.db.delete(existing._id)
      return null
    }
    const now = Date.now()
    const row = {
      authUserId: args.authUserId,
      ...(givenNames !== undefined ? { givenNames } : {}),
      ...(familyName !== undefined ? { familyName } : {}),
      ...(idnIdentifier !== undefined ? { idnIdentifier } : {}),
      observedAt: now,
      expiresAt: now + IDN_PREFILL_TTL_MS,
    }
    if (existing) await ctx.db.replace(existing._id, row)
    else await ctx.db.insert("idnPrefills", row)
    return null
  },
})

/**
 * La publication du profil (`publishMyProfile`) efface la part d'identité : nom civil et identifiant
 * IDN n'ont plus d'objet une fois le profil né du geste. Au lot M1, la ligne ne porte qu'elle : elle
 * part entière (le lot M2 y gardera la résidence, qui sert encore à entrer dans DIASPORA.GA).
 */
export async function clearIdnPrefillIdentity(ctx: MutationCtx, authUserId: string): Promise<void> {
  const row = await prefillOf(ctx, authUserId)
  if (row) await ctx.db.delete(row._id)
}

/** Export personnel (`erasure.ts`) : les champs reçus d'IDN et leurs dates, jamais la clé de compte. */
export function idnPrefillExportRecord(row: Doc<"idnPrefills">): Record<string, unknown> {
  return {
    _id: row._id,
    _creationTime: row._creationTime,
    ...(row.givenNames !== undefined ? { givenNames: row.givenNames } : {}),
    ...(row.familyName !== undefined ? { familyName: row.familyName } : {}),
    ...(row.idnIdentifier !== undefined ? { idnIdentifier: row.idnIdentifier } : {}),
    observedAt: row.observedAt,
    expiresAt: row.expiresAt,
  }
}

/** Effacement de la personne (`erasure.ts`, phase des comptes) : la ligne part entière, quoi qu'elle porte. */
export async function eraseIdnPrefill(ctx: MutationCtx, authUserId: string): Promise<void> {
  const row = await prefillOf(ctx, authUserId)
  if (row) await ctx.db.delete(row._id)
}

/** Rétention quotidienne par lots bornés (modèle : `platform/operatorAccess.purgeExpiredProofs`). La lecture refuse déjà toute ligne échue. */
export const purgeExpiredIdnPrefills = internalMutation({
  args: { before: v.optional(v.number()) }, returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const before = args.before ?? Date.now()
    const rows = await ctx.db.query("idnPrefills").withIndex("by_expiry", (q) => q.lte("expiresAt", before)).take(PURGE_BATCH)
    for (const row of rows) await ctx.db.delete(row._id)
    if (rows.length === PURGE_BATCH) await ctx.scheduler.runAfter(0, internal.modules.people.idnPrefill.purgeExpiredIdnPrefills, { before })
    return null
  },
})

/**
 * @selfScoped La personne de la session lit SON pré-remplissage d'accueil : le nom civil composé au
 * serveur, et la disponibilité de SES SEULS candidats d'identifiant (aucun argument : aucune nouvelle
 * énumération d'identifiants). `null` sans ligne (entrée sans IDN), ligne échue ou d'autrui, ou dès que
 * le profil est publié. `residence` reste `null` au lot M1.
 */
export const myEntryPrefill = personQuery({
  args: {},
  returns: v.union(v.null(), entryPrefillValidator),
  handler: async (ctx) => {
    if (!awaitsFirstProfile(ctx.person)) return null
    const row = await prefillOf(ctx, ctx.person.authUserId)
    if (!row || row.expiresAt <= Date.now()) return null
    const displayName = civilDisplayName(row.givenNames, row.familyName)
    const handles: { handle: string; available: boolean }[] = []
    // borné : six candidats au plus (`IDN_HANDLE_LADDER_MAX`), chacun lu par index.
    for (const handle of idnHandleLadder({ givenNames: row.givenNames, familyName: row.familyName, idnIdentifier: row.idnIdentifier })) {
      handles.push({ handle, available: await isHandleFreeFor(ctx, handle, ctx.person._id) })
    }
    if (displayName === null && handles.length === 0) return null
    return { displayName, handles, residence: null }
  },
})
