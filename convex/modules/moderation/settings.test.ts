// @vitest-environment edge-runtime
/** MC-02 — réglages de modération du réseau : lectures bornées, droits, journal, défauts prudents et mots bloqués. */
import { engineErrorCode, engineErrorRule } from "@antsia/social-contracts/errors"
import { MODERATION_POLICY_DEFAULTS, MODERATION_SURFACES } from "@antsia/social-domain/moderationPolicy"
import { afterEach, describe, expect, it, vi } from "vitest"

import { api, internal } from "../../_generated/api"
import type { Id } from "../../_generated/dataModel"
import { SEED_CONFIRMATION } from "../../seeds/foundations"
import { createTestOperatorProof, testConvex } from "../../test.setup"
import { DIASPORA_MODERATION_SURFACES } from "../diaspora/moderationContent"

type T = ReturnType<typeof testConvex>
type Person = { as: ReturnType<T["withIdentity"]>; personId: Id<"persons"> }
const M = api.modules.moderation.cases
const C = api.modules.platform.console
const P = api.modules.posts.posts
const PAGE = { numItems: 25, cursor: null }
afterEach(() => vi.useRealTimers())

async function enter(t: T, root: Id<"networks">, name: string, role?: "network_moderator" | "network_admin"): Promise<Person> {
  const as = t.withIdentity({ subject: `mc02-${name}` })
  const personId = await as.mutation(api.modules.people.persons.ensureMyPerson, {})
  await as.mutation(api.modules.people.consents.recordConsent, { purpose: "social_profile", origin: "onboarding" })
  await as.mutation(api.modules.people.profile.publishMyProfile, { handle: name, displayName: name })
  await as.mutation(api.modules.people.memberships.joinNetwork, { networkId: root })
  if (role) await t.run(async (ctx) => {
    const row = await ctx.db.query("networkMemberships").withIndex("by_network_and_person", (q) => q.eq("networkId", root).eq("personId", personId)).unique()
    if (row) await ctx.db.patch(row._id, { role })
  })
  return { as, personId }
}

async function fixture() {
  const t = testConvex()
  const { root } = await t.mutation(internal.seeds.foundations.run, { confirmNonProduction: SEED_CONFIRMATION })
  const author = await enter(t, root, "auteur")
  const reader = await enter(t, root, "lectrice")
  const moderator = await enter(t, root, "moderateur", "network_moderator")
  const admin = await enter(t, root, "administratrice", "network_admin")
  return { t, root, author, reader, moderator, admin }
}

async function caught(promise: Promise<unknown>): Promise<unknown> {
  try { await promise; return null } catch (error) { return error }
}
const errorCode = async (promise: Promise<unknown>) => engineErrorCode(await caught(promise))

async function stateOf(t: T, postId: Id<"posts">) {
  return await t.run(async (ctx) => await ctx.db.query("moderationContentStates").withIndex("by_target", (q) => q.eq("targetKind", "post").eq("targetId", postId)).unique())
}

async function auditOf(t: T, root: Id<"networks">, action: "moderation.policy_set" | "moderation.term_set") {
  return await t.run(async (ctx) => (await ctx.db.query("engineAudit").withIndex("by_network_at", (q) => q.eq("networkId", root)).take(100)).filter((row) => row.action === action))
}

describe("MC-02 — un mot bloqué met en relecture la publication suivante qui le contient", () => {
  it("ajouté par l'administrateur, il retient la publication suivante (casse et accents compris) sans garder son texte ; retiré, il ne retient plus rien", async () => {
    const f = await fixture()
    const before = await f.author.as.mutation(P.publish, { networkId: f.root, body: "Une arnaque au transfert d'argent circule" })
    expect((await stateOf(f.t, before.postId))?.status).toBe("published")

    await f.admin.as.mutation(M.setBlockedTerm, { networkId: f.root, term: "  Arnaque ", active: true, reason: "Vague de fraudes signalée." })
    expect((await f.admin.as.query(M.blockedTermsPage, { networkId: f.root, paginationOpts: PAGE })).page.map((row) => row.term)).toEqual(["arnaque"])

    const body = "Nouvelle ARNÂQUE au transfert, méfiez-vous"
    const { postId } = await f.author.as.mutation(P.publish, { networkId: f.root, body })
    const state = await stateOf(f.t, postId)
    expect(state?.status).toBe("pending_review")
    expect(JSON.stringify(state)).not.toContain("transfert")
    expect(await errorCode(f.reader.as.query(P.getPost, { networkId: f.root, postId }))).toBe("notFound")
    // La publication antérieure n'est pas rejugée : le réglage vaut pour les écritures suivantes.
    expect((await stateOf(f.t, before.postId))?.status).toBe("published")

    await f.admin.as.mutation(M.setBlockedTerm, { networkId: f.root, term: "arnaque", active: false, reason: "Vague de fraudes terminée." })
    expect((await f.admin.as.query(M.blockedTermsPage, { networkId: f.root, paginationOpts: PAGE })).page).toEqual([])
    const after = await f.author.as.mutation(P.publish, { networkId: f.root, body: "Encore une arnaque signalée" })
    expect((await stateOf(f.t, after.postId))?.status).toBe("published")

    const audit = await auditOf(f.t, f.root, "moderation.term_set")
    expect(audit.map((row) => [row.capacity, row.actorPersonId, row.details?.active, row.details?.reason])).toEqual([
      ["network_admin", f.admin.personId, true, "Vague de fraudes signalée."],
      ["network_admin", f.admin.personId, false, "Vague de fraudes terminée."],
    ])
    // Le journal ne recopie aucun contenu de membre.
    expect(JSON.stringify(audit)).not.toContain("transfert")
  })
})

describe("MC-02 — lectures bornées et journal des réglages", () => {
  it("l'administrateur lit chaque surface (réglage posé, ou défauts du moteur), pose un réglage motivé et le retrouve au journal", async () => {
    const f = await fixture()
    const initial = await f.admin.as.query(M.policies, { networkId: f.root })
    expect(initial.defaults).toEqual(MODERATION_POLICY_DEFAULTS)
    expect(initial.surfaces.map((row) => row.surface)).toEqual([...MODERATION_SURFACES])
    expect(initial.surfaces.every((row) => row.policy === null)).toBe(true)
    // Sans réglage, l'écran dit la règle réelle de chaque surface : défauts, relecture d'office, ou aucune règle (DIASPORALE).
    const rule = (surface: string) => initial.surfaces.find((row) => row.surface === surface)?.withoutPolicy
    expect(["post", "comment", "groupMessage", "person", "page"].map(rule)).toEqual(["defaults", "defaults", "defaults", "defaults", "defaults"])
    expect(initial.surfaces.filter((row) => row.withoutPolicy === "held").map((row) => row.surface)).toEqual(["serviceReview", "serviceReviewReply", "commerceOffer", "commerceStorefront", "commerceJob"])
    expect(initial.surfaces.filter((row) => row.withoutPolicy === "unchecked").map((row) => row.surface)).toEqual([...DIASPORA_MODERATION_SURFACES])

    await f.admin.as.mutation(M.setPolicy, { networkId: f.root, surface: "comment", preReview: true, maxLinks: 1, maxWrites: 10, windowMs: 120_000, reason: "Relecture des commentaires pendant le pilote." })
    const settings = await f.admin.as.query(M.policies, { networkId: f.root })
    expect(settings.surfaces.find((row) => row.surface === "comment")?.policy).toMatchObject({ preReview: true, maxLinks: 1, maxWrites: 10, windowMs: 120_000 })
    expect(settings.surfaces.filter((row) => row.policy !== null)).toHaveLength(1)

    await f.admin.as.mutation(M.setPolicy, { networkId: f.root, surface: "comment", preReview: false, maxLinks: 2, maxWrites: 30, windowMs: 60_000, reason: "Fin de la relecture des commentaires." })
    const rows = await f.t.run(async (ctx) => await ctx.db.query("moderationPolicies").withIndex("by_network_surface", (q) => q.eq("networkId", f.root).eq("surface", "comment")).take(5))
    expect(rows).toHaveLength(1)
    const audit = await auditOf(f.t, f.root, "moderation.policy_set")
    expect(audit.map((row) => row.details)).toEqual([
      { reason: "Relecture des commentaires pendant le pilote.", surface: "comment", preReview: true, maxLinks: 1, maxWrites: 10, windowMs: 120_000, replaced: false },
      { reason: "Fin de la relecture des commentaires.", surface: "comment", preReview: false, maxLinks: 2, maxWrites: 30, windowMs: 60_000, replaced: true },
    ])
    expect(audit.every((row) => row.capacity === "network_admin" && row.actorPersonId === f.admin.personId && row.subjectTable === "moderationPolicies" && row.subjectId === rows[0]?._id)).toBe(true)
  })

  it("la liste des mots bloqués se lit par pages de 50 au plus, mots actifs seulement", async () => {
    const f = await fixture()
    await f.t.run(async (ctx) => {
      for (let n = 0; n < 60; n++) await ctx.db.insert("blockedTerms", { networkId: f.root, term: `motactif${n}`, active: true, updatedAt: n })
      await ctx.db.insert("blockedTerms", { networkId: f.root, term: "motretire", active: false, updatedAt: 1 })
    })
    const first = await f.admin.as.query(M.blockedTermsPage, { networkId: f.root, paginationOpts: { numItems: 500, cursor: null } })
    expect(first.page).toHaveLength(50)
    expect(first.isDone).toBe(false)
    const second = await f.admin.as.query(M.blockedTermsPage, { networkId: f.root, paginationOpts: { numItems: 500, cursor: first.continueCursor } })
    expect(second.page).toHaveLength(10)
    expect([...first.page, ...second.page].some((row) => row.term === "motretire")).toBe(false)
  })

  it("refuse un réglage hors bornes, un motif trop court, un mot trop court et un 101e mot actif", async () => {
    const f = await fixture()
    const base = { networkId: f.root, surface: "post" as const, preReview: false, maxLinks: 2, maxWrites: 30, windowMs: 60_000, reason: "Réglage du pilote." }
    for (const wrong of [{ maxLinks: 21 }, { maxWrites: 0 }, { maxWrites: 101 }, { windowMs: 500 }, { maxLinks: 1.5 }]) {
      expect(await errorCode(f.admin.as.mutation(M.setPolicy, { ...base, ...wrong }))).toBe("invalidArgument")
    }
    expect(engineErrorRule(await caught(f.admin.as.mutation(M.setPolicy, { ...base, reason: "no" })))?.rule).toBe("DECISION_REASON_LENGTH")
    expect(await errorCode(f.admin.as.mutation(M.setBlockedTerm, { networkId: f.root, term: " é ", active: true, reason: "Mot trop court." }))).toBe("invalidArgument")
    await f.t.run(async (ctx) => { for (let n = 0; n < 100; n++) await ctx.db.insert("blockedTerms", { networkId: f.root, term: `plafond${n}`, active: true, updatedAt: n }) })
    expect(await errorCode(f.admin.as.mutation(M.setBlockedTerm, { networkId: f.root, term: "cent-unieme", active: true, reason: "Au-delà du plafond." }))).toBe("policyRefused")
    // Retirer reste possible au plafond.
    await f.admin.as.mutation(M.setBlockedTerm, { networkId: f.root, term: "plafond0", active: false, reason: "Mot devenu inutile." })
    expect(await f.t.run(async (ctx) => (await ctx.db.query("moderationPolicies").withIndex("by_network_surface", (q) => q.eq("networkId", f.root)).take(5)).length)).toBe(0)
  })
})

describe("MC-02 — seul l'administrateur du réseau règle la modération (refus indistinct)", () => {
  it("un modérateur sans rôle d'administrateur et un simple membre reçoivent le même refus, sans écriture ni journal", async () => {
    const f = await fixture()
    expect(await f.moderator.as.query(M.myCapacity, { networkId: f.root })).toMatchObject({ networkWide: true, canManagePolicy: false })
    expect(await f.admin.as.query(M.myCapacity, { networkId: f.root })).toMatchObject({ canManagePolicy: true })
    for (const person of [f.moderator, f.reader]) {
      expect(await errorCode(person.as.query(M.policies, { networkId: f.root }))).toBe("notFound")
      expect(await errorCode(person.as.query(M.blockedTermsPage, { networkId: f.root, paginationOpts: PAGE }))).toBe("notFound")
      expect(await errorCode(person.as.mutation(M.setPolicy, { networkId: f.root, surface: "post", preReview: true, maxLinks: 0, maxWrites: 1, windowMs: 1_000, reason: "Tentative sans droit." }))).toBe("notFound")
      expect(await errorCode(person.as.mutation(M.setBlockedTerm, { networkId: f.root, term: "bonjour", active: true, reason: "Tentative sans droit." }))).toBe("notFound")
    }
    // Même refus pour le modérateur que pour le simple membre : rien ne distingue « pas le droit » de « rien à lire ».
    const counts = await f.t.run(async (ctx) => ({
      policies: (await ctx.db.query("moderationPolicies").withIndex("by_network_surface", (q) => q.eq("networkId", f.root)).take(5)).length,
      terms: (await ctx.db.query("blockedTerms").withIndex("by_network_active", (q) => q.eq("networkId", f.root)).take(5)).length,
    }))
    expect(counts).toEqual({ policies: 0, terms: 0 })
    expect([...await auditOf(f.t, f.root, "moderation.policy_set"), ...await auditOf(f.t, f.root, "moderation.term_set")]).toEqual([])
  })
})

describe("MC-02 — défauts prudents du moteur sans réglage", () => {
  it("trois liens passent en relecture, deux sont publiés", async () => {
    const f = await fixture()
    const two = await f.author.as.mutation(P.publish, { networkId: f.root, body: "À lire : https://exemple.test/article et www.source.test" })
    expect((await stateOf(f.t, two.postId))?.status).toBe("published")
    const three = await f.author.as.mutation(P.publish, { networkId: f.root, body: "https://a.test https://b.test https://c.test" })
    expect((await stateOf(f.t, three.postId))?.status).toBe("pending_review")
    // Un réglage explicite du réseau remplace le défaut.
    await f.admin.as.mutation(M.setPolicy, { networkId: f.root, surface: "post", preReview: false, maxLinks: 5, maxWrites: 30, windowMs: 60_000, reason: "Les listes de liens sont admises." })
    const relaxed = await f.author.as.mutation(P.publish, { networkId: f.root, body: "https://a.test https://b.test https://c.test" })
    expect((await stateOf(f.t, relaxed.postId))?.status).toBe("published")
  })

  it("au-delà de trente écritures modérées dans la minute, la suivante passe en relecture ; la minute écoulée, elle est publiée", async () => {
    vi.useFakeTimers()
    const f = await fixture()
    const now = Date.now()
    // Trente écritures récentes de l'auteur, toutes surfaces confondues (sans texte : la table n'en garde aucun).
    await f.t.run(async (ctx) => {
      for (let n = 0; n < MODERATION_POLICY_DEFAULTS.maxWrites; n++) await ctx.db.insert("moderationContentStates", { networkId: f.root, targetKind: "comment", targetId: `recent-${n}`, ownerPersonId: f.author.personId, status: "published", createdAt: now, updatedAt: now })
    })
    const flooded = await f.author.as.mutation(P.publish, { networkId: f.root, body: "Encore un message" })
    expect((await stateOf(f.t, flooded.postId))?.status).toBe("pending_review")
    vi.setSystemTime(now + MODERATION_POLICY_DEFAULTS.windowMs + 1_000)
    const calm = await f.author.as.mutation(P.publish, { networkId: f.root, body: "Un message plus tard" })
    expect((await stateOf(f.t, calm.postId))?.status).toBe("published")
  })
})

describe("MC-02 — le même réglage depuis la console", () => {
  it("l'opérateur lit et règle un réseau actif, motif au journal à sa qualité ; un non-opérateur est refusé", async () => {
    const f = await fixture()
    const operator = await enter(f.t, f.root, "operatrice")
    await f.t.run(async (ctx) => await ctx.db.insert("operators", { personId: operator.personId, role: "platform_operator", grantedAt: Date.now() }))
    await createTestOperatorProof(f.t, operator.as, operator.personId)

    expect(await errorCode(f.admin.as.query(C.moderationPolicies, { networkId: f.root }))).toBe("operatorRequired")
    expect(await errorCode(f.admin.as.mutation(C.setModerationPolicy, { networkId: f.root, surface: "post", preReview: true, maxLinks: 2, maxWrites: 30, windowMs: 60_000, reason: "Tentative sans droit." }))).toBe("operatorRequired")
    expect(await errorCode(f.admin.as.mutation(C.setBlockedTerm, { networkId: f.root, term: "arnaque", active: true, reason: "Tentative sans droit." }))).toBe("operatorRequired")

    await operator.as.mutation(C.setModerationPolicy, { networkId: f.root, surface: "groupMessage", preReview: false, maxLinks: 1, maxWrites: 40, windowMs: 60_000, reason: "Messages de groupe : un lien au plus." })
    await operator.as.mutation(C.setBlockedTerm, { networkId: f.root, term: "Arnaque", active: true, reason: "Vague de fraudes signalée." })
    expect((await operator.as.query(C.moderationPolicies, { networkId: f.root })).surfaces.find((row) => row.surface === "groupMessage")?.policy).toMatchObject({ maxLinks: 1, maxWrites: 40 })
    expect((await operator.as.query(C.blockedTerms, { networkId: f.root, paginationOpts: PAGE })).page.map((row) => row.term)).toEqual(["arnaque"])
    // Ce que pose l'opérateur, l'administrateur du réseau le lit.
    expect((await f.admin.as.query(M.blockedTermsPage, { networkId: f.root, paginationOpts: PAGE })).page.map((row) => row.term)).toEqual(["arnaque"])

    const audit = [...await auditOf(f.t, f.root, "moderation.policy_set"), ...await auditOf(f.t, f.root, "moderation.term_set")]
    expect(audit.map((row) => [row.action, row.capacity, row.actorPersonId, row.details?.reason])).toEqual([
      ["moderation.policy_set", "platform_operator", operator.personId, "Messages de groupe : un lien au plus."],
      ["moderation.term_set", "platform_operator", operator.personId, "Vague de fraudes signalée."],
    ])

    await f.t.run(async (ctx) => await ctx.db.patch(f.root, { status: "archived" }))
    expect(await errorCode(operator.as.query(C.moderationPolicies, { networkId: f.root }))).toBe("notFound")
    expect(await errorCode(operator.as.mutation(C.setBlockedTerm, { networkId: f.root, term: "fraude", active: true, reason: "Réseau archivé." }))).toBe("notFound")
  })
})
