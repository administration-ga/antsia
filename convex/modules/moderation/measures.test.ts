// @vitest-environment edge-runtime
/**
 * SU01h — mesures sur ordre du juge (référé numérique, ordonnance n° 0011/PR/2026, art. 39 à 44), à
 * horloge simulée : chaque genre s'exécute tout de suite, s'affiche, se confirme par un SECOND
 * opérateur (jamais par l'exécutant) et se lève seul à son échéance ; l'art. 44 est plafonné à 72 h ;
 * une mesure non confirmée ne se lève pas d'elle-même ; un déréférencement ne supprime aucun contenu.
 * Références d'ordonnance et comptes FICTIFS.
 */
import { engineErrorCode } from "@antsia/social-contracts/errors"
import { ARTICLE_44_MAX_MS, JUDICIAL_CONFIRMATION_DELAY_MS, JUDICIAL_MEASURE_RETENTION_MS } from "@antsia/social-domain/judicialMeasures"
import { afterEach, describe, expect, it, vi } from "vitest"

import { api, internal } from "../../_generated/api"
import type { Doc, Id } from "../../_generated/dataModel"
import { requireMembership } from "../../lib/access"
import { SEED_CONFIRMATION } from "../../seeds/foundations"
import { createTestOperatorProof, testConvex } from "../../test.setup"
import { exportableRecord } from "../people/dataInventory"
import { restoreTarget } from "./targets"

type T = ReturnType<typeof testConvex>
type Person = { as: ReturnType<T["withIdentity"]>; personId: Id<"persons">; subject: string }

const MEASURES = api.modules.moderation.measures
const RUN = internal.modules.moderation.measures.runDueMeasures
const HOUR = 3_600_000
const START = Date.UTC(2026, 10, 11, 8, 0, 0)
const ORDER = "RG FICTIF 2026/0042"
const PAGE = { cursor: null, numItems: 20 }

afterEach(() => vi.useRealTimers())

async function enter(t: T, root: Id<"networks">, subject: string): Promise<Person> {
  const as = t.withIdentity({ subject })
  const personId = await as.mutation(api.modules.people.persons.ensureMyPerson, {})
  await as.mutation(api.modules.people.consents.recordConsent, { purpose: "social_profile", origin: "onboarding" })
  await as.mutation(api.modules.people.profile.publishMyProfile, { handle: subject, displayName: subject })
  await as.mutation(api.modules.people.memberships.joinNetwork, { networkId: root })
  return { as, personId, subject }
}

async function makeOperator(t: T, person: Person, role: "platform_operator" | "platform_admin" = "platform_operator"): Promise<Person> {
  await t.run(async (ctx) => { await ctx.db.insert("operators", { personId: person.personId, role, grantedAt: Date.now() }) })
  await createTestOperatorProof(t, person.as, person.personId)
  return person
}

async function fixture() {
  vi.useFakeTimers()
  vi.setSystemTime(START)
  const t = testConvex()
  const { root } = await t.mutation(internal.seeds.foundations.run, { confirmNonProduction: SEED_CONFIRMATION })
  const first = await makeOperator(t, await enter(t, root, "operatrice-une"), "platform_admin")
  const second = await makeOperator(t, await enter(t, root, "operateur-deux"))
  const awa = await enter(t, root, "awa-fictive")
  const reader = await enter(t, root, "lecteur-fictif")
  return { t, root, first, second, awa, reader }
}

async function code(promise: Promise<unknown>): Promise<string | null> {
  try { await promise; return null } catch (error) { return engineErrorCode(error) ?? String(error) }
}

async function measure(t: T, id: Id<"judicialMeasures">): Promise<Doc<"judicialMeasures"> | null> {
  return await t.run(async (ctx) => await ctx.db.get(id))
}

async function rootStatus(t: T, root: Id<"networks">, personId: Id<"persons">) {
  return await t.run(async (ctx) => (await ctx.db.query("networkMemberships").withIndex("by_network_and_person", (q) => q.eq("networkId", root).eq("personId", personId)).unique())?.status)
}

async function journal(t: T, id: Id<"judicialMeasures">) {
  return await t.run(async (ctx) => await ctx.db.query("engineAudit").withIndex("by_subject_at", (q) => q.eq("subjectTable", "judicialMeasures").eq("subjectId", id)).collect())
}

async function publicPost(t: T, root: Id<"networks">, author: Person, body: string) {
  return (await author.as.mutation(api.modules.posts.posts.publish, { networkId: root, body, alsoOnRoot: true })).postId
}

describe("SU01h — suspension d'un compte sur ordre, confirmée par un second opérateur", () => {
  it("exécute tout de suite, refuse l'auto-confirmation, journalise qui, quand, quelle référence, et se lève seule à l'échéance", async () => {
    const f = await fixture()
    const endsAt = START + 48 * HOUR
    const opened = await f.first.as.mutation(MEASURES.openMeasure, { kind: "suspend_account", target: { kind: "person", id: f.awa.personId }, orderReference: ORDER, startsAt: START - HOUR, endsAt, reason: "Ordonnance de référé reçue ce matin." })
    expect(opened.created).toBe(true)
    // Effet immédiat : suspendue partout, la garde refuse.
    expect(await rootStatus(f.t, f.root, f.awa.personId)).toBe("suspendue")
    await f.awa.as.run(async (ctx) => { await expect(requireMembership(ctx, f.root, "en_attente")).rejects.toMatchObject({ data: { code: "membershipSuspended" } }) })
    // Un double clic n'exécute pas deux fois.
    expect((await f.first.as.mutation(MEASURES.openMeasure, { kind: "suspend_account", target: { kind: "person", id: f.awa.personId }, orderReference: ORDER, startsAt: START - HOUR, endsAt, reason: "Ordonnance de référé reçue ce matin." })).created).toBe(false)
    // Une levée manuelle de la suspension ne passe pas outre l'ordre du juge.
    expect(await code(f.second.as.mutation(api.modules.people.memberships.liftSuspension, { personId: f.awa.personId, reason: "Levée manuelle, essai." }))).toBe("conflict")

    // La double validation : l'exécutante ne se confirme pas ; le second opérateur confirme.
    expect(await code(f.first.as.mutation(MEASURES.confirmMeasure, { measureId: opened.measureId, reason: "Je confirme ma propre mesure." }))).toBe("policyRefused")
    expect(await f.second.as.mutation(MEASURES.confirmMeasure, { measureId: opened.measureId, reason: "Ordonnance relue, cible vérifiée." })).toEqual({ confirmed: true })
    const confirmed = await measure(f.t, opened.measureId)
    expect(confirmed).toMatchObject({ status: "active", executedAt: START, confirmedByPersonId: f.second.personId, createdByPersonId: f.first.personId, effects: { membershipSuspended: true } })

    const lines = await journal(f.t, opened.measureId)
    expect(lines.map((line) => [line.action, line.actorPersonId, line.at])).toEqual([["judicial.measure_open", f.first.personId, START], ["judicial.measure_confirm", f.second.personId, START]])
    expect(lines[0]?.details).toMatchObject({ orderReference: ORDER, kind: "suspend_account", targetKind: "person", endsAt })

    // Avant l'échéance, le passage ne lève rien ; à l'échéance, il lève et rétablit le statut d'avant.
    vi.setSystemTime(endsAt - 1)
    await f.t.mutation(RUN, {})
    expect((await measure(f.t, opened.measureId))?.status).toBe("active")
    vi.setSystemTime(endsAt + 1)
    await f.t.mutation(RUN, {})
    expect(await measure(f.t, opened.measureId)).toMatchObject({ status: "lifted", liftCause: "expired" })
    expect(await rootStatus(f.t, f.root, f.awa.personId)).toBe("declaree")
    expect((await journal(f.t, opened.measureId)).map((line) => [line.action, line.capacity])).toContainEqual(["judicial.measure_expire", "system"])
  })

  it("une mesure non confirmée dans le délai ne se lève pas d'elle-même", async () => {
    const f = await fixture()
    const opened = await f.first.as.mutation(MEASURES.openMeasure, { kind: "suspend_account", target: { kind: "person", id: f.awa.personId }, orderReference: ORDER, startsAt: START, reason: "Ordonnance de référé reçue ce matin." })
    vi.setSystemTime(START + JUDICIAL_CONFIRMATION_DELAY_MS + 6 * HOUR)
    await f.t.mutation(RUN, {})
    expect(await measure(f.t, opened.measureId)).toMatchObject({ status: "active" })
    expect(await rootStatus(f.t, f.root, f.awa.personId)).toBe("suspendue")
    await createTestOperatorProof(f.t, f.first.as, f.first.personId)
    const clock = await f.first.as.query(MEASURES.activeMeasureClock, {})
    expect(clock.measures.map((row) => row.measureId)).toEqual([opened.measureId])
    expect(clock.measures[0]?.confirmedAt).toBeUndefined()
  })
})

describe("SU01h — article 44 : restriction de fonction et suspension d'accès, 72 h au plus", () => {
  it("refuse une échéance au-delà de 72 h ; coupe la publication du réseau, puis la rend à l'échéance", async () => {
    const f = await fixture()
    const base = { kind: "restrict_feature" as const, target: { kind: "network" as const, id: f.root }, orderReference: ORDER, startsAt: START, feature: "publish" as const, reason: "Troubles graves : restriction ordonnée." }
    expect(await code(f.first.as.mutation(MEASURES.openMeasure, { ...base, endsAt: START + ARTICLE_44_MAX_MS + 1 }))).toBe("invalidArgument")
    expect(await code(f.first.as.mutation(MEASURES.openMeasure, { ...base }))).toBe("invalidArgument")
    const opened = await f.first.as.mutation(MEASURES.openMeasure, { ...base, endsAt: START + ARTICLE_44_MAX_MS })
    expect(await code(f.awa.as.mutation(api.modules.posts.posts.publish, { networkId: f.root, body: "Publication pendant la restriction" }))).toBe("policyRefused")
    // Une autre fonction n'est pas coupée : lire reste possible.
    expect(await code(f.awa.as.query(api.modules.discovery.discovery.rootFeed, { networkId: f.root, paginationOpts: PAGE }))).toBeNull()
    expect((await f.awa.as.query(MEASURES.myJudicialMeasures, {})).general.map((row) => [row.kind, row.feature])).toEqual([["restrict_feature", "publish"]])
    vi.setSystemTime(START + ARTICLE_44_MAX_MS + 1)
    await f.t.mutation(RUN, {})
    expect((await measure(f.t, opened.measureId))?.status).toBe("lifted")
    expect(await code(f.awa.as.mutation(api.modules.posts.posts.publish, { networkId: f.root, body: "Publication après la restriction" }))).toBeNull()
  })

  it("une suspension d'accès ferme le réseau aux membres comme aux lectures sans compte ; « Mes données » reste ouverte", async () => {
    const f = await fixture()
    const post = await publicPost(f.t, f.root, f.awa, "Avant la suspension d'accès")
    expect(await f.t.query(api.modules.public.projections.getPost, { networkId: f.root, postId: post })).not.toBeNull()
    const opened = await f.first.as.mutation(MEASURES.openMeasure, { kind: "suspend_access", target: { kind: "network", id: f.root }, orderReference: ORDER, startsAt: START, endsAt: START + 12 * HOUR, reason: "Troubles graves : accès suspendu." })
    expect(await code(f.awa.as.query(api.modules.discovery.discovery.rootFeed, { networkId: f.root, paginationOpts: PAGE }))).toBe("policyRefused")
    expect(await code(f.t.query(api.modules.public.projections.getPost, { networkId: f.root, postId: post }))).toBe("notFound")
    expect((await f.awa.as.query(MEASURES.myJudicialMeasures, {})).general.map((row) => row.kind)).toEqual(["suspend_access"])
    await f.second.as.mutation(MEASURES.liftMeasure, { measureId: opened.measureId, reason: "Mainlevée ordonnée par le juge." })
    expect(await measure(f.t, opened.measureId)).toMatchObject({ status: "lifted", liftCause: "operator", liftedByPersonId: f.second.personId })
    expect(await f.t.query(api.modules.public.projections.getPost, { networkId: f.root, postId: post })).not.toBeNull()
  })
})

describe("SU01h — déréférencement, correctif et étiquette d'origine", () => {
  it("un déréférencement retire de la recherche, de Découvrir et des lectures publiques sans rien supprimer", async () => {
    const f = await fixture()
    const post = await publicPost(f.t, f.root, f.awa, "Communique fictif sur la saison des pluies")
    const visible = async () => ({
      search: (await f.reader.as.query(api.modules.posts.posts.search, { networkId: f.root, query: "saison" })).items.map((item) => item._id),
      discover: (await f.reader.as.query(api.modules.discovery.discovery.rootFeed, { networkId: f.root, paginationOpts: PAGE })).page.map((item) => item._id),
      public: (await f.t.query(api.modules.public.projections.getPost, { networkId: f.root, postId: post }))?.id ?? null,
      list: (await f.t.query(api.modules.public.projections.listRootPosts, { networkId: f.root, paginationOpts: PAGE })).page.map((item) => item.id),
    })
    expect(await visible()).toEqual({ search: [post], discover: [post], public: post, list: [post] })
    const opened = await f.first.as.mutation(MEASURES.openMeasure, { kind: "delist", target: { kind: "post", id: post }, orderReference: ORDER, startsAt: START, endsAt: START + 6 * HOUR, reason: "Déréférencement ciblé ordonné." })
    expect(await visible()).toEqual({ search: [], discover: [], public: null, list: [] })
    // Rien n'est supprimé : la publication demeure, publiée, lisible par son auteure.
    expect(await f.t.run(async (ctx) => (await ctx.db.get(post))?.status)).toBe("published")
    expect(await f.awa.as.query(api.modules.posts.posts.getPost, { networkId: f.root, postId: post })).toMatchObject({ _id: post })
    expect((await measure(f.t, opened.measureId))?.effects).toEqual({ membershipSuspended: false, pageDeactivated: false, contentRemoved: false })
    vi.setSystemTime(START + 6 * HOUR + 1)
    await f.t.mutation(RUN, {})
    expect(await visible()).toEqual({ search: [post], discover: [post], public: post, list: [post] })
  })

  it("le correctif et l'étiquette s'affichent au-dessus du contenu et du profil, pour les membres et sans compte, jusqu'à la levée", async () => {
    const f = await fixture()
    const post = await publicPost(f.t, f.root, f.awa, "Publication visée par un correctif")
    const correction = await f.first.as.mutation(MEASURES.openMeasure, { kind: "pin_correction", target: { kind: "post", id: post }, orderReference: ORDER, startsAt: START, correctionText: "Correctif ordonné : l'information publiée ici est inexacte.", reason: "Publication d'un correctif ordonnée." })
    await f.first.as.mutation(MEASURES.openMeasure, { kind: "origin_label", target: { kind: "person", id: f.awa.personId }, orderReference: ORDER, startsAt: START, originLabel: "Origine : compte relayant un tiers non identifié", reason: "Marquage d'origine ordonné." })
    expect(await f.reader.as.query(MEASURES.judicialNotices, { networkId: f.root, target: { kind: "post", id: post } })).toEqual([{ kind: "pin_correction", text: "Correctif ordonné : l'information publiée ici est inexacte.", startsAt: START }])
    expect(await f.reader.as.query(MEASURES.judicialNotices, { networkId: f.root, target: { kind: "person", handle: f.awa.subject } })).toEqual([{ kind: "origin_label", text: "Origine : compte relayant un tiers non identifié", startsAt: START }])
    expect(await f.t.query(api.modules.public.judicialNotices.notices, { networkId: f.root, target: { kind: "post", id: post } })).toHaveLength(1)
    // Le fil : une lecture partagée par toutes les cartes, les seuls avis des publications visibles.
    expect(await f.reader.as.query(MEASURES.visiblePostNotices, { networkId: f.root })).toEqual([{ postId: post, kind: "pin_correction", text: "Correctif ordonné : l'information publiée ici est inexacte.", startsAt: START }])
    // La personne visée lit ses deux mesures, sans la référence de l'ordonnance.
    const mine = await f.awa.as.query(MEASURES.myJudicialMeasures, {})
    expect(mine.personal.map((row) => row.kind).sort()).toEqual(["origin_label", "pin_correction"])
    expect(JSON.stringify(mine)).not.toContain(ORDER)
    expect((await f.reader.as.query(MEASURES.myJudicialMeasures, {})).personal).toEqual([])
    await f.second.as.mutation(MEASURES.liftMeasure, { measureId: correction.measureId, reason: "Mainlevée : correctif publié." })
    expect(await f.reader.as.query(MEASURES.judicialNotices, { networkId: f.root, target: { kind: "post", id: post } })).toEqual([])
  })
})

describe("SU01h — suspension d'un contenu et d'une page", () => {
  it("un contenu suspendu est retiré, aucun recours ne le rétablit pendant la mesure, la levée le rend", async () => {
    const f = await fixture()
    const post = await publicPost(f.t, f.root, f.awa, "Publication suspendue sur ordre")
    const opened = await f.first.as.mutation(MEASURES.openMeasure, { kind: "suspend_content", target: { kind: "post", id: post }, orderReference: ORDER, startsAt: START, reason: "Suspension du contenu ordonnée." })
    const state = async () => await f.t.run(async (ctx) => (await ctx.db.query("moderationContentStates").withIndex("by_target", (q) => q.eq("targetKind", "post").eq("targetId", post)).unique())?.status)
    expect(await state()).toBe("removed")
    expect(await measure(f.t, opened.measureId)).toMatchObject({ subjectPersonId: f.awa.personId, effects: { contentRemoved: true } })
    expect(await code(f.reader.as.query(api.modules.posts.posts.getPost, { networkId: f.root, postId: post }))).toBe("notFound")
    // Un rétablissement par un autre chemin (recours, sanction échue) est différé à la levée.
    await f.t.run(async (ctx) => { await restoreTarget(ctx, { target: { kind: "post", id: post }, networkId: f.root, ownerPersonId: f.awa.personId }) })
    expect(await state()).toBe("removed")
    await f.second.as.mutation(MEASURES.liftMeasure, { measureId: opened.measureId, reason: "Mainlevée ordonnée par le juge." })
    expect(await state()).toBe("published")
    expect(await f.reader.as.query(api.modules.posts.posts.getPost, { networkId: f.root, postId: post })).toMatchObject({ _id: post })
  })

  it("une page mise hors ligne sur ordre ne se rétablit pas à la main ; la levée la rend", async () => {
    const f = await fixture()
    const pageId = await f.t.run(async (ctx) => await ctx.db.insert("pages", { networkId: f.root, handle: "page-fictive", name: "Page fictive", ownerKind: "association", trust: "community", trustRank: 0, visibility: "root", onRoot: true, status: "active", searchText: "page fictive", createdAt: START, updatedAt: START }))
    const opened = await f.second.as.mutation(MEASURES.openMeasure, { kind: "suspend_account", target: { kind: "page", id: pageId }, orderReference: ORDER, startsAt: START, reason: "Suspension de la page ordonnée." })
    expect(await f.t.run(async (ctx) => (await ctx.db.get(pageId))?.status)).toBe("inactive")
    expect(await code(f.first.as.mutation(api.modules.pages.admin.setPageStatus, { pageId, status: "active", reason: "Rétablissement manuel, essai." }))).toBe("conflict")
    await f.first.as.mutation(MEASURES.liftMeasure, { measureId: opened.measureId, reason: "Mainlevée ordonnée par le juge." })
    expect(await f.t.run(async (ctx) => (await ctx.db.get(pageId))?.status)).toBe("active")
  })
})

describe("SU01h — données personnelles et conservation", () => {
  it("l'export de la personne visée omet la référence et les opérateurs ; la mesure levée est purgée au terme de la conservation", async () => {
    const f = await fixture()
    const opened = await f.first.as.mutation(MEASURES.openMeasure, { kind: "origin_label", target: { kind: "person", id: f.awa.personId }, orderReference: ORDER, startsAt: START, endsAt: START + HOUR, originLabel: "Origine : compte relayant un tiers", reason: "Marquage d'origine ordonné." })
    const row = await measure(f.t, opened.measureId)
    if (!row) throw new Error("mesure absente")
    const exported = exportableRecord("judicialMeasures", row as unknown as Parameters<typeof exportableRecord>[1], f.awa.personId)
    expect(exported).toMatchObject({ kind: "origin_label", originLabel: "Origine : compte relayant un tiers", status: "active" })
    expect(exported).not.toHaveProperty("orderReference")
    expect(exported).not.toHaveProperty("createdByPersonId")
    expect(exportableRecord("judicialMeasures", row as unknown as Parameters<typeof exportableRecord>[1], f.reader.personId)).toBeNull()
    vi.setSystemTime(START + HOUR + 1)
    await f.t.mutation(RUN, {})
    expect((await measure(f.t, opened.measureId))?.status).toBe("lifted")
    vi.setSystemTime(START + HOUR + 1 + JUDICIAL_MEASURE_RETENTION_MS - 1)
    await f.t.mutation(RUN, {})
    expect(await measure(f.t, opened.measureId)).not.toBeNull()
    vi.setSystemTime(START + HOUR + 2 + JUDICIAL_MEASURE_RETENTION_MS)
    await f.t.mutation(RUN, {})
    expect(await measure(f.t, opened.measureId)).toBeNull()
    // Le journal garde la preuve minimale : qui, quand, quelle référence.
    expect((await journal(f.t, opened.measureId)).map((line) => line.action)).toEqual(["judicial.measure_open", "judicial.measure_expire"])
  })

  it("un membre n'ouvre aucune mesure ; une cible inconnue ou incompatible est refusée", async () => {
    const f = await fixture()
    expect(await code(f.awa.as.mutation(MEASURES.openMeasure, { kind: "delist", target: { kind: "person", id: f.reader.personId }, orderReference: ORDER, startsAt: START, reason: "Essai sans habilitation." }))).toBe("operatorRequired")
    expect(await code(f.first.as.mutation(MEASURES.openMeasure, { kind: "delist", target: { kind: "network", id: f.root }, orderReference: ORDER, startsAt: START, reason: "Cible incompatible, essai." }))).toBe("invalidArgument")
    expect(await code(f.first.as.mutation(MEASURES.openMeasure, { kind: "delist", target: { kind: "person", id: f.reader.personId }, orderReference: ORDER, startsAt: START, reason: "court" }))).toBe("invalidArgument")
    expect(await f.first.as.query(MEASURES.previewTarget, { kind: "person", ref: "@awa-fictive" })).toMatchObject({ target: { kind: "person", id: f.awa.personId }, networkId: f.root, label: "@awa-fictive", activeMeasures: 0 })
    expect(await f.first.as.query(MEASURES.previewTarget, { kind: "post", ref: "inconnu" })).toBeNull()
  })
})
