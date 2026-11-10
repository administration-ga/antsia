// @vitest-environment edge-runtime
/** MP09 : comptes synthétiques uniquement, sessions/débits/adhésions/modération réels. */
import { engineErrorCode } from "@antsia/social-contracts/errors"
import { PROFESSIONAL_PROFILE_CONSENT_VERSION, PROFESSIONAL_PUBLIC_CONSENT_VERSION } from "@antsia/social-domain/professionals"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { api, internal } from "../../_generated/api"
import { SEED_CONFIRMATION } from "../../seeds/foundations"
import { testConvex } from "../../test.setup"
import { PROFESSIONAL_CONVERSATION_CONTEXTS } from "./conversationContexts"
import type { ProfessionalProfileWriteInput } from "./validators"
import { SHOP_PUBLIC_LISTING_TEXT_VERSION } from "../shops/rules"

const NOW = Date.UTC(2026, 9, 21, 18)
const firstPage = { cursor: null, numItems: 12 }
const input = (extra: Partial<ProfessionalProfileWriteInput> = {}): ProfessionalProfileWriteInput => ({ title: "Designer indépendant", bio: "Présentation professionnelle volontaire", skills: ["Design"], languageCodes: ["fr"], zone: "Libreville",
  availability: "available", collaborationTypes: ["project", "partnership", "mentoring"], portfolio: [{ title: "Projet déclaré", description: "Réalisation textuelle." }], activityPageIds: [], visibility: "network", publicFields: [],
  consentTextVersion: PROFESSIONAL_PROFILE_CONSENT_VERSION, ...extra })
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(NOW) })
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers() })
async function fixture(withProfiles = true) {
  const t = testConvex(), { root, testClosed } = await t.mutation(internal.seeds.foundations.run, { confirmNonProduction: SEED_CONFIRMATION })
  async function person(handle: string) {
    const as = t.withIdentity({ subject: `professional-fixture-${handle}` })
    const personId = await as.mutation(api.modules.people.persons.ensureMyPerson, {})
    await as.mutation(api.modules.people.consents.recordConsent, { purpose: "social_profile", origin: "onboarding" })
    await as.mutation(api.modules.people.profile.publishMyProfile, { handle, displayName: `Recette ${handle}` })
    await as.mutation(api.modules.people.memberships.joinNetwork, { networkId: root })
    return { as, personId, handle }
  }
  const owner = await person("pro-owner"), target = await person("pro-target"), other = await person("pro-other")
  async function publish(who: typeof owner, data = input()) {
    const saved = await who.as.mutation(api.modules.professionals.profiles.saveProfile, { networkId: root, expectedRevision: 0, input: data })
    return await who.as.mutation(api.modules.professionals.profiles.setState, { networkId: root, expectedRevision: saved.revision, state: "published" })
  }
  if (withProfiles) { await publish(owner); await publish(target, input({ skills: ["Céramique"] })) }
  return { t, root, testClosed, owner, target, other, publish }
}
type Fixture = Awaited<ReturnType<typeof fixture>>
async function propose(f: Fixture) {
  return await f.owner.as.mutation(api.modules.professionals.collaborations.propose, { networkId: f.root, toHandle: f.target.handle, collaborationType: "project", message: "Construisons un projet ensemble." })
}
async function accepted(f: Fixture) {
  const pending = await propose(f)
  return await f.target.as.mutation(api.modules.professionals.collaborations.respond, { networkId: f.root, collaborationId: pending.collaborationId, expectedRevision: pending.revision, decision: "accepted" })
}
async function errorCode(work: Promise<unknown>) {
  try { await work; return null } catch (error) { return engineErrorCode(error) }
}
async function publicProfile(f: Fixture, handle = f.owner.handle) {
  return await f.t.query(api.modules.public.professionals.profile, { networkId: f.root, handle })
}
async function memberProfile(f: Fixture, handle = f.target.handle) {
  return await f.owner.as.query(api.modules.professionals.read.getByHandle, { networkId: f.root, handle })
}

describe("MP09 — profils choisis et visibilité", () => {
  it("ne crée aucun profil depuis une adhésion ou l'ouverture de l'annuaire", async () => {
    const f = await fixture(false)
    expect(await f.owner.as.query(api.modules.professionals.profiles.myProfile, { networkId: f.root })).toBeNull()
    expect(await f.owner.as.query(api.modules.professionals.read.search, { networkId: f.root, filters: {}, paginationOpts: firstPage })).toMatchObject({ page: [], isDone: true })
    expect(await f.t.run(async ctx => ctx.db.query("professionalProfiles").take(1))).toEqual([])
  })
  it("sauve un brouillon privé puis publie par geste distinct", async () => {
    const f = await fixture(false)
    const saved = await f.owner.as.mutation(api.modules.professionals.profiles.saveProfile, { networkId: f.root, expectedRevision: 0, input: input() })
    expect(saved).toMatchObject({ revision: 1, state: "draft", changed: true })
    expect(await memberProfile(f, f.owner.handle)).toBeNull()
    expect(await publicProfile(f)).toBeNull()
    await f.owner.as.mutation(api.modules.professionals.profiles.setState, { networkId: f.root, expectedRevision: 1, state: "published" })
    expect(await memberProfile(f, f.owner.handle)).toMatchObject({ title: "Designer indépendant", isMe: true, canPropose: false })
    expect(await memberProfile(f, f.owner.handle)).not.toHaveProperty("avatarUrl")
  })
  it("exige le consentement professionnel courant et refuse une révision concurrente", async () => {
    const f = await fixture(false)
    expect(await errorCode(f.owner.as.mutation(api.modules.professionals.profiles.saveProfile, { networkId: f.root, expectedRevision: 0, input: input({ consentTextVersion: "old" }) }))).toBe("invalidArgument")
    await f.publish(f.owner)
    expect(await errorCode(f.owner.as.mutation(api.modules.professionals.profiles.saveProfile, { networkId: f.root, expectedRevision: 1, input: input({ title: "Modification concurrente" }) }))).toBe("conflict")
    expect(await memberProfile(f, f.owner.handle)).toMatchObject({ revision: 2, title: "Designer indépendant" })
  })
  it("garde un save identique idempotent et retire toute modification publiée jusqu'au nouveau geste Publier", async () => {
    const f = await fixture()
    expect(await f.owner.as.mutation(api.modules.professionals.profiles.saveProfile, { networkId: f.root, expectedRevision: 2, input: input() })).toMatchObject({ revision: 2, state: "published", changed: false })
    expect(await f.owner.as.mutation(api.modules.professionals.profiles.saveProfile, { networkId: f.root, expectedRevision: 2, input: input({ title: "Nouveau titre" }) })).toMatchObject({ revision: 3, state: "draft", changed: true })
    expect(await memberProfile(f, f.owner.handle)).toBeNull()
    const own = await f.owner.as.query(api.modules.professionals.profiles.myProfile, { networkId: f.root })
    expect(own).toMatchObject({ state: "draft", title: "Nouveau titre", revision: 3 })
    expect(await f.t.run(async ctx => ctx.db.get(own!.profileId))).not.toHaveProperty("publishedAt")
    await f.owner.as.mutation(api.modules.professionals.profiles.setState, { networkId: f.root, expectedRevision: 3, state: "published" })
    expect(await memberProfile(f, f.owner.handle)).toMatchObject({ revision: 4, title: "Nouveau titre" })
  })
  it("n'expose publiquement que les champs choisis, avec consentement public séparé", async () => {
    const f = await fixture(false)
    await f.publish(f.owner, input({ visibility: "public", publicFields: ["title", "skills"], publicConsentTextVersion: PROFESSIONAL_PUBLIC_CONSENT_VERSION }))
    expect(await publicProfile(f)).toEqual({ handle: f.owner.handle, displayName: `Recette ${f.owner.handle}`, title: "Designer indépendant", skills: ["Design"] })
    const own = await f.owner.as.query(api.modules.professionals.profiles.myProfile, { networkId: f.root })
    expect(own).toMatchObject({ consentedAt: NOW, publicConsentAt: NOW, publicConsentTextVersion: PROFESSIONAL_PUBLIC_CONSENT_VERSION })
    await f.owner.as.mutation(api.modules.professionals.profiles.setState, { networkId: f.root, expectedRevision: 2, state: "paused" })
    expect(await publicProfile(f)).toBeNull()
  })
  it("unlisted reste consultable par handle entre membres, absent de la recherche et du public", async () => {
    const f = await fixture(false)
    await f.publish(f.target, input({ visibility: "unlisted" }))
    expect(await memberProfile(f)).toMatchObject({ visibility: "unlisted" })
    expect(await f.owner.as.query(api.modules.professionals.read.search, { networkId: f.root, filters: {}, paginationOpts: firstPage })).toMatchObject({ page: [], isDone: true })
    expect(await publicProfile(f, f.target.handle)).toBeNull()
  })
  it.each(["paused", "erased", "left", "blocked", "person_private"])("relit la garde %s avant chaque découverte", async gate => {
    const f = await fixture()
    await f.t.run(async ctx => {
      const profile = await ctx.db.query("professionalProfiles").withIndex("by_network_person", q => q.eq("networkId", f.root).eq("personId", f.target.personId)).unique()
      if (gate === "paused") await ctx.db.patch(profile!._id, { state: "paused" })
      if (gate === "erased") await ctx.db.patch(f.target.personId, { erasedAt: NOW })
      if (gate === "person_private") await ctx.db.patch(f.target.personId, { privateAt: NOW })
      if (gate === "blocked") await ctx.db.insert("personBlocks", { networkId: f.root, blockerPersonId: f.target.personId, targetPersonId: f.owner.personId, createdAt: NOW, updatedAt: NOW })
      if (gate === "left") { const member = await ctx.db.query("networkMemberships").withIndex("by_network_and_person", q => q.eq("networkId", f.root).eq("personId", f.target.personId)).unique(); await ctx.db.patch(member!._id, { status: "partie" }) }
    })
    const page = await f.owner.as.query(api.modules.professionals.read.search, { networkId: f.root, filters: {}, paginationOpts: firstPage })
    expect(page.page.map(row => row.handle)).not.toContain(f.target.handle)
    if (gate !== "person_private") expect(await memberProfile(f)).toBeNull()
  })
  it("ne transforme pas une session publique refusée en lecture anonyme", async () => {
    const f = await fixture(false)
    await f.publish(f.owner, input({ visibility: "public", publicFields: ["title"], publicConsentTextVersion: PROFESSIONAL_PUBLIC_CONSENT_VERSION }))
    expect(await publicProfile(f)).not.toBeNull()
    const residual = f.t.withIdentity({ subject: "unknown-professional-session", sessionId: "invalid-session" })
    expect(await errorCode(residual.query(api.modules.public.professionals.profile, { networkId: f.root, handle: f.owner.handle }))).toBe("unauthenticated")
  })
  it("ferme les prélectures au répertoire et ne republie pas un profil retiré par simple sauvegarde", async () => {
    const f = await fixture(), own = await f.owner.as.query(api.modules.professionals.profiles.myProfile, { networkId: f.root })
    await f.t.run(async ctx => { const state = await ctx.db.query("moderationContentStates").withIndex("by_target", q => q.eq("targetKind", "professionalProfile").eq("targetId", own!.profileId)).unique(); await ctx.db.patch(state!._id, { status: "pending_review" }) })
    expect(await memberProfile(f, f.owner.handle)).toBeNull()
    expect(await f.owner.as.query(api.modules.professionals.profiles.myProfile, { networkId: f.root })).toMatchObject({ moderationStatus: "pending_review" })
    await f.t.run(async ctx => { const state = await ctx.db.query("moderationContentStates").withIndex("by_target", q => q.eq("targetKind", "professionalProfile").eq("targetId", own!.profileId)).unique(); await ctx.db.patch(state!._id, { status: "removed" }) })
    expect(await errorCode(f.owner.as.mutation(api.modules.professionals.profiles.saveProfile, { networkId: f.root, expectedRevision: 2, input: input({ bio: "Texte modifié" }) }))).toBe("policyRefused")
  })
})

describe("MP09 — propositions privées et contexte distinct", () => {
  it("idempotent pending ne consomme pas une deuxième sollicitation et l'inverse n'accepte rien", async () => {
    const f = await fixture(), first = await propose(f)
    expect(await propose(f)).toMatchObject({ ...first, changed: false })
    expect(await errorCode(f.target.as.mutation(api.modules.professionals.collaborations.propose, { networkId: f.root, toHandle: f.owner.handle, collaborationType: "project", message: "Proposition inverse" }))).toBe("conflict")
    expect(await f.t.run(async ctx => ctx.db.query("professionalCollaborations").take(3))).toHaveLength(1)
    expect(await f.t.run(async ctx => ctx.db.get(first.collaborationId))).toMatchObject({ status: "pending", revision: 1 })
  })
  it("un tiers ne répond pas, deux décisions concurrentes ne valent qu'une transition", async () => {
    const f = await fixture(), pending = await propose(f)
    expect(await errorCode(f.other.as.mutation(api.modules.professionals.collaborations.respond, { networkId: f.root, collaborationId: pending.collaborationId, expectedRevision: 1, decision: "accepted" }))).toBe("notFound")
    const decisions = await Promise.allSettled(["accepted", "declined"].map(decision => f.target.as.mutation(api.modules.professionals.collaborations.respond, { networkId: f.root, collaborationId: pending.collaborationId, expectedRevision: 1, decision: decision as "accepted" | "declined" })))
    expect(decisions.filter(row => row.status === "fulfilled")).toHaveLength(1)
    expect(decisions.filter(row => row.status === "rejected")).toHaveLength(1)
    expect(await f.t.run(async ctx => ctx.db.get(pending.collaborationId))).toMatchObject({ revision: 2 })
  })
  it("respecte le cooldown de24h après refus, puis permet un nouveau geste", async () => {
    const f = await fixture(), pending = await propose(f)
    await f.target.as.mutation(api.modules.professionals.collaborations.respond, { networkId: f.root, collaborationId: pending.collaborationId, expectedRevision: 1, decision: "declined" })
    expect(await errorCode(propose(f))).toBe("policyRefused")
    vi.setSystemTime(NOW + 24 * 60 * 60 * 1000 + 1)
    expect(await propose(f)).toMatchObject({ revision: 1, status: "pending", changed: true })
  })
  it("annuler un pending reste réservé à son auteur", async () => {
    const f = await fixture(), pending = await propose(f)
    expect(await errorCode(f.target.as.mutation(api.modules.professionals.collaborations.cancel, { networkId: f.root, collaborationId: pending.collaborationId, expectedRevision: 1 }))).toBe("conflict")
    expect(await f.owner.as.mutation(api.modules.professionals.collaborations.cancel, { networkId: f.root, collaborationId: pending.collaborationId, expectedRevision: 1 })).toMatchObject({ revision: 2, status: "cancelled" })
  })
  it("le destinataire peut retirer une collaboration acceptée, sans message ni droit personnel ; rejeu sans nouvel effet", async () => {
    const f = await fixture(), result = await accepted(f)
    const snapshot = await f.t.run(async ctx => PROFESSIONAL_CONVERSATION_CONTEXTS.professionalCollaboration.load(ctx, result.collaborationId, NOW))
    expect(snapshot).toMatchObject({ phase: "open", callsEngaged: false, attachments: { requester: false, responder: false } })
    const incoming = await f.target.as.query(api.modules.professionals.collaborations.listIncoming, { networkId: f.root, paginationOpts: firstPage })
    expect(incoming.page[0]).toMatchObject({ canCancel: true, acceptedSource: { kind: "professionalCollaboration", id: result.collaborationId } })
    const args = { networkId: f.root, collaborationId: result.collaborationId, expectedRevision: 2 }
    expect(await f.target.as.mutation(api.modules.professionals.collaborations.cancel, args)).toMatchObject({ revision: 3, status: "cancelled", changed: true })
    expect(await f.target.as.mutation(api.modules.professionals.collaborations.cancel, args)).toMatchObject({ revision: 3, status: "cancelled", changed: false })
    expect(await f.t.run(async ctx => ctx.db.get(result.collaborationId))).toMatchObject({ cancelledByPersonId: f.target.personId, revision: 3 })
    expect(await f.t.run(async ctx => PROFESSIONAL_CONVERSATION_CONTEXTS.professionalCollaboration.load(ctx, result.collaborationId, NOW))).toMatchObject({ phase: "closed", callsEngaged: false })
    const empty = await f.t.run(async ctx => ({ graph: await ctx.db.query("connections").take(1), follows: await ctx.db.query("follows").take(1), personal: await ctx.db.query("personalThreads").take(1), messages: await ctx.db.query("personalMessages").take(1), contextual: await ctx.db.query("contextualMessages").take(1), calls: await ctx.db.query("calls").take(1) }))
    expect(empty).toEqual({ graph: [], follows: [], personal: [], messages: [], contextual: [], calls: [] })
  })
  it.each(["pause", "block", "moderation"])("retire immédiatement la source acceptée après %s", async gate => {
    const f = await fixture(), result = await accepted(f)
    await f.t.run(async ctx => {
      if (gate === "pause") { const row = await ctx.db.query("professionalProfiles").withIndex("by_network_person", q => q.eq("networkId", f.root).eq("personId", f.target.personId)).unique(); await ctx.db.patch(row!._id, { state: "paused" }) }
      if (gate === "block") await ctx.db.insert("personBlocks", { networkId: f.root, blockerPersonId: f.target.personId, targetPersonId: f.owner.personId, createdAt: NOW, updatedAt: NOW })
      if (gate === "moderation") { const state = await ctx.db.query("moderationContentStates").withIndex("by_target", q => q.eq("targetKind", "professionalCollaboration").eq("targetId", result.collaborationId)).unique(); await ctx.db.patch(state!._id, { status: "removed" }) }
    })
    expect(await f.t.run(async ctx => PROFESSIONAL_CONVERSATION_CONTEXTS.professionalCollaboration.load(ctx, result.collaborationId, NOW))).toBeNull()
    expect(await f.owner.as.query(api.modules.professionals.collaborations.listMine, { networkId: f.root, paginationOpts: firstPage })).toMatchObject({ page: [] })
  })
  it("ne livre une motivation en relecture qu'à son auteur", async () => {
    const f = await fixture(), pending = await propose(f)
    await f.t.run(async ctx => { const state = await ctx.db.query("moderationContentStates").withIndex("by_target", q => q.eq("targetKind", "professionalCollaboration").eq("targetId", pending.collaborationId)).unique(); await ctx.db.patch(state!._id, { status: "pending_review" }) })
    expect(await f.owner.as.query(api.modules.professionals.collaborations.listMine, { networkId: f.root, paginationOpts: firstPage })).toMatchObject({ page: [{ moderationStatus: "pending_review", acceptedSource: null }] })
    expect(await f.target.as.query(api.modules.professionals.collaborations.listIncoming, { networkId: f.root, paginationOpts: firstPage })).toMatchObject({ page: [] })
    expect(await errorCode(f.target.as.mutation(api.modules.professionals.collaborations.respond, { networkId: f.root, collaborationId: pending.collaborationId, expectedRevision: 1, decision: "accepted" }))).toBe("notFound")
  })
  it.each(["pause", "block"])("refuse l'acceptation si %s survient après l'invitation", async gate => {
    const f = await fixture(), pending = await propose(f)
    await f.t.run(async ctx => {
      if (gate === "pause") { const profile = await ctx.db.query("professionalProfiles").withIndex("by_network_person", q => q.eq("networkId", f.root).eq("personId", f.owner.personId)).unique(); await ctx.db.patch(profile!._id, { state: "paused" }) }
      else await ctx.db.insert("personBlocks", { networkId: f.root, blockerPersonId: f.target.personId, targetPersonId: f.owner.personId, createdAt: NOW, updatedAt: NOW })
    })
    expect(await errorCode(f.target.as.mutation(api.modules.professionals.collaborations.respond, { networkId: f.root, collaborationId: pending.collaborationId, expectedRevision: 1, decision: "accepted" }))).toBe("notFound")
    expect(await f.t.run(async ctx => ctx.db.get(pending.collaborationId))).toMatchObject({ status: "pending", revision: 1 })
    expect(await f.t.run(async ctx => ctx.db.query("contextualThreads").take(1))).toEqual([])
  })
  it("ne livre ni liste ni décision d'une autre personne à un tiers", async () => {
    const f = await fixture(), pending = await propose(f)
    expect(await f.other.as.query(api.modules.professionals.collaborations.listMine, { networkId: f.root, paginationOpts: firstPage })).toMatchObject({ page: [] })
    expect(await f.other.as.query(api.modules.professionals.collaborations.listIncoming, { networkId: f.root, paginationOpts: firstPage })).toMatchObject({ page: [] })
    expect(await errorCode(f.other.as.mutation(api.modules.professionals.collaborations.cancel, { networkId: f.root, collaborationId: pending.collaborationId, expectedRevision: 1 }))).toBe("notFound")
  })
})

describe("MP09 — activités et continuation native", () => {
  async function activity(f: Fixture, handle: string) {
    return await f.t.run(async ctx => {
      const pageId = await ctx.db.insert("pages", { networkId: f.root, handle, name: `Activité ${handle}`, ownerKind: "company", trust: "community", trustRank: 1,
        visibility: "network", onRoot: true, status: "active", createdByPersonId: f.owner.personId, searchText: handle, createdAt: NOW, updatedAt: NOW })
      const signatoryId = await ctx.db.insert("pageSignatories", { networkId: f.root, pageId, personId: f.owner.personId, role: "admin", acceptedAt: NOW, createdAt: NOW, updatedAt: NOW })
      return { pageId, signatoryId, handle }
    })
  }
  it("admet seulement les mandats admin vivants, relus aussi après sauvegarde", async () => {
    const f = await fixture(false), page = await activity(f, "professional-activity")
    await f.publish(f.owner, input({ activityPageIds: [page.pageId] }))
    expect(await f.owner.as.query(api.modules.professionals.read.managedActivities, { networkId: f.root, paginationOpts: firstPage })).toMatchObject({ page: [{ pageId: page.pageId }] })
    expect(await f.target.as.query(api.modules.professionals.read.managedActivities, { networkId: f.root, paginationOpts: firstPage })).toMatchObject({ page: [] })
    expect(await f.target.as.query(api.modules.professionals.read.getByHandle, { networkId: f.root, handle: f.owner.handle })).toMatchObject({ activities: [{ kind: "page", handle: page.handle }] })
    await f.t.run(async ctx => ctx.db.patch(page.signatoryId, { role: "signatory" }))
    expect(await f.target.as.query(api.modules.professionals.read.getByHandle, { networkId: f.root, handle: f.owner.handle })).toMatchObject({ activities: [] })
    expect(await errorCode(f.owner.as.mutation(api.modules.professionals.profiles.saveProfile, { networkId: f.root, expectedRevision: 2, input: input({ activityPageIds: [page.pageId] }) }))).toBe("pageRoleRequired")
  })
  it("ne présente en public que la devanture déjà consentie, sans ouvrir les pages community", async () => {
    const f = await fixture(false), hidden = await activity(f, "professional-hidden"), visible = await activity(f, "professional-shop")
    const shopId = await f.t.run(async ctx => {
      await ctx.db.insert("shopNetworkPolicies", { networkId: f.root, storefront: "review", updatedAt: NOW })
      return await ctx.db.insert("shops", { networkId: f.root, pageId: visible.pageId, preparedByPersonId: f.owner.personId, model: "products", storefront: "published", visibility: "network",
        publicConsentAt: NOW, publicConsentTextVersion: SHOP_PUBLIC_LISTING_TEXT_VERSION, publicConsentByPersonId: f.owner.personId, publishedAt: NOW, createdAt: NOW, updatedAt: NOW })
    })
    await f.publish(f.owner, input({ visibility: "public", publicFields: ["activities"], publicConsentTextVersion: PROFESSIONAL_PUBLIC_CONSENT_VERSION, activityPageIds: [hidden.pageId, visible.pageId] }))
    expect(await publicProfile(f)).toEqual({ handle: f.owner.handle, displayName: `Recette ${f.owner.handle}`, activities: [{ kind: "shop", handle: visible.handle, name: `Activité ${visible.handle}` }] })
    await f.t.run(async ctx => ctx.db.patch(shopId, { publicConsentRevokedAt: NOW }))
    expect(await publicProfile(f)).toEqual({ handle: f.owner.handle, displayName: `Recette ${f.owner.handle}`, activities: [] })
  })
  it("continue au-delà d'une première fenêtre entièrement filtrée et lie le curseur au lecteur/aux filtres", async () => {
    const f = await fixture()
    await f.t.run(async ctx => {
      for (let index = 0; index < 13; index += 1) {
        const personId = await ctx.db.insert("persons", { authUserId: `professional-window-${index}`, handle: `window-pro-${index}`, displayName: `Recette fenêtre ${index}`, publishedAt: NOW, createdAt: NOW, updatedAt: NOW })
        await ctx.db.insert("networkMemberships", { networkId: f.root, personId, status: "declaree", role: "member", joinedAt: NOW, statusChangedAt: NOW })
        const profileId = await ctx.db.insert("professionalProfiles", { networkId: f.root, personId, ...input(), revision: 1, state: "published", consentedAt: NOW, searchText: "designer", createdAt: NOW, updatedAt: NOW + index + 1, publishedAt: NOW })
        await ctx.db.insert("moderationContentStates", { networkId: f.root, targetKind: "professionalProfile", targetId: profileId, ownerPersonId: personId, status: "published", createdAt: NOW, updatedAt: NOW })
      }
    })
    const filters = { skills: ["ceramique"] }
    const first = await f.owner.as.query(api.modules.professionals.read.search, { networkId: f.root, filters, paginationOpts: firstPage })
    expect(first).toMatchObject({ page: [], isDone: false, filteredWindow: true })
    expect(first.continueCursor).not.toBe("")
    expect(await errorCode(f.owner.as.query(api.modules.professionals.read.search, { networkId: f.root, filters: { skills: ["design"] }, paginationOpts: { ...firstPage, cursor: first.continueCursor } }))).toBe("invalidArgument")
    expect(await errorCode(f.target.as.query(api.modules.professionals.read.search, { networkId: f.root, filters, paginationOpts: { ...firstPage, cursor: first.continueCursor } }))).toBe("invalidArgument")
    const next = await f.owner.as.query(api.modules.professionals.read.search, { networkId: f.root, filters, paginationOpts: { ...firstPage, cursor: first.continueCursor } })
    expect(next.page.map(profile => profile.handle)).toEqual([f.target.handle])
    expect(next).toMatchObject({ isDone: true, continueCursor: "" })
  })
  it("refuse une lecture d'un autre réseau sans faire suivre une appartenance professionnelle", async () => {
    const f = await fixture()
    expect(await errorCode(f.owner.as.query(api.modules.professionals.read.search, { networkId: f.testClosed, filters: {}, paginationOpts: firstPage }))).toBe("notFound")
  })
})
