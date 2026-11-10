// @vitest-environment edge-runtime
/**
 * SU01d — ordonnance n° 0011/PR/2026, art. 24, 32 et 33 : délais légaux, accusé de réception et
 * décision notifiée au déclarant, file prioritaire des modérateurs, « Mes signalements ».
 * Mesuré de bout en bout sur des comptes fictifs (critère de sortie de SU01).
 */
import { engineErrorCode } from "@antsia/social-contracts/errors"
import { afterEach, describe, expect, it, vi } from "vitest"

import { api, internal } from "../../_generated/api"
import type { Id } from "../../_generated/dataModel"
import { SEED_CONFIRMATION } from "../../seeds/foundations"
import { testConvex } from "../../test.setup"
import { reporterNoticeRecipient } from "../notifications/policy"

type T = ReturnType<typeof testConvex>
type Person = { as: ReturnType<T["withIdentity"]>; personId: Id<"persons"> }
const M = api.modules.moderation.cases
const L = api.modules.moderation.moderation
const P = api.modules.posts.posts
const BELL = api.modules.notifications.bell
const PAGE = { numItems: 25, cursor: null }
const HOUR = 3_600_000
afterEach(() => vi.useRealTimers())

async function enter(t: T, root: Id<"networks">, name: string, role?: "network_moderator" | "network_admin"): Promise<Person> {
  const as = t.withIdentity({ subject: `su01d-${name}` })
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
  const { root, testClosed } = await t.mutation(internal.seeds.foundations.run, { confirmNonProduction: SEED_CONFIRMATION })
  const author = await enter(t, root, "auteur")
  const reader = await enter(t, root, "lectrice")
  const moderator = await enter(t, root, "moderateur", "network_moderator")
  const { postId } = await author.as.mutation(P.publish, { networkId: root, body: "Publication de recette SU01d" })
  return { t, root, testClosed, author, reader, moderator, postId }
}

async function errorCode(promise: Promise<unknown>) {
  try { await promise; return null } catch (error) { return engineErrorCode(error) }
}

async function noticesOf(t: T, networkId: Id<"networks">, personId: Id<"persons">) {
  return await t.run(async (ctx) => await ctx.db.query("notifications").withIndex("by_network_recipient_dedupKey", (q) => q.eq("networkId", networkId).eq("recipientPersonId", personId)).take(50))
}

describe("SU01d — accusé de réception à la transmission (art. 24)", () => {
  it("pose l'échéance de 72 h d'un harcèlement et accuse réception au seul déclarant, sans acteur ni contenu", async () => {
    const f = await fixture()
    const { reportId } = await f.reader.as.mutation(M.report, { networkId: f.root, target: { kind: "post", id: f.postId }, reason: "harassment" })
    const row = await f.t.run(async (ctx) => await ctx.db.get(reportId))
    expect(row).toMatchObject({ legalBasis: "art24", reporterNetworkId: f.root })
    expect(row!.dueAt).toBe(row!.createdAt + 72 * HOUR)
    // L'accusé part dans la transaction de la transmission : bien avant l'échéance de 24 h.
    expect(row!.acknowledgedAt).toBeGreaterThanOrEqual(row!.createdAt)
    expect(row!.acknowledgedAt! - row!.createdAt).toBeLessThan(24 * HOUR)
    const notices = await noticesOf(f.t, f.root, f.reader.personId)
    const received = notices.filter((notice) => notice.kind === "report_received")
    expect(received).toHaveLength(1)
    expect(received[0]).toMatchObject({ subjectReportId: reportId })
    expect(received[0]!.actorPersonId).toBeUndefined()
    expect(JSON.stringify(notices)).not.toContain("Publication de recette")
    // L'auteur n'apprend rien de la transmission ni de l'identité du déclarant.
    const authorNotices = await noticesOf(f.t, f.root, f.author.personId)
    expect(authorNotices.some((notice) => notice.kind === "report_received" || notice.kind === "report_decided")).toBe(false)
  })

  it("rattache l'hypertrucage au délai de 24 h (art. 33), un contenu d'IA interdit au même délai (art. 32), et laisse la désinformation sans délai légal", async () => {
    const f = await fixture()
    const other = await enter(f.t, f.root, "deuxieme")
    const third = await enter(f.t, f.root, "troisieme")
    const a = await f.reader.as.mutation(M.report, { networkId: f.root, target: { kind: "post", id: f.postId }, reason: "deepfake_of_me" })
    const b = await other.as.mutation(M.report, { networkId: f.root, target: { kind: "post", id: f.postId }, reason: "institution_impersonation" })
    const c = await third.as.mutation(M.report, { networkId: f.root, target: { kind: "post", id: f.postId }, reason: "misinformation" })
    const rows = await f.t.run(async (ctx) => await Promise.all([a, b, c].map(async (item) => await ctx.db.get(item.reportId))))
    expect(rows[0]).toMatchObject({ legalBasis: "art33" })
    expect(rows[0]!.dueAt).toBe(rows[0]!.createdAt + 24 * HOUR)
    expect(rows[1]).toMatchObject({ legalBasis: "art32" })
    expect(rows[1]!.dueAt).toBe(rows[1]!.createdAt + 24 * HOUR)
    expect(rows[2]!.legalBasis).toBeUndefined()
    expect(rows[2]!.dueAt).toBeUndefined()
    // Hors délai légal aussi, le déclarant reçoit son accusé de réception.
    expect(rows[2]!.acknowledgedAt).toBeDefined()
  })

  it("un second signalement de la même cible ne redouble ni le dossier ni l'accusé", async () => {
    const f = await fixture()
    const first = await f.reader.as.mutation(M.report, { networkId: f.root, target: { kind: "post", id: f.postId }, reason: "harassment" })
    const again = await f.reader.as.mutation(M.report, { networkId: f.root, target: { kind: "post", id: f.postId }, reason: "minor_harm" })
    expect(again).toMatchObject({ reportId: first.reportId, created: false })
    expect((await noticesOf(f.t, f.root, f.reader.personId)).filter((notice) => notice.kind === "report_received")).toHaveLength(1)
  })
})

describe("SU01d — décision notifiée au déclarant (art. 24)", () => {
  it("mesure de bout en bout : transmission, accusé, décision à 71 h, avis au déclarant, sans sanction ni motif de modération", async () => {
    const f = await fixture()
    const start = Date.now()
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(start)
    const { reportId } = await f.reader.as.mutation(M.report, { networkId: f.root, target: { kind: "post", id: f.postId }, reason: "harassment" })
    vi.setSystemTime(start + 71 * HOUR)
    await f.moderator.as.mutation(M.decide, { networkId: f.root, reportId, decision: "actioned", reason: "Harcèlement confirmé, publication retirée.", sanctions: [{ kind: "removal" }, { kind: "warning" }] })
    const row = await f.t.run(async (ctx) => await ctx.db.get(reportId))
    expect(row!.reviewedAt).toBeLessThanOrEqual(row!.dueAt!)
    expect(row!.reporterNotifiedAt).toBe(start + 71 * HOUR)
    const decided = (await noticesOf(f.t, f.root, f.reader.personId)).filter((notice) => notice.kind === "report_decided")
    expect(decided).toHaveLength(1)
    expect(decided[0]!.actorPersonId).toBeUndefined()
    // L'auteur garde son propre avis de décision.
    expect((await noticesOf(f.t, f.root, f.author.personId)).some((notice) => notice.kind === "moderation_decision")).toBe(true)
    const mine = await f.reader.as.query(M.myReports, { paginationOpts: PAGE })
    expect(mine.page).toHaveLength(1)
    expect(mine.page[0]).toMatchObject({ reportId, reason: "harassment", legalBasis: "art24", outcome: "removed", decidedAt: start + 71 * HOUR })
    const text = JSON.stringify(mine)
    for (const hidden of ["Harcèlement confirmé", "warning", "removal", f.author.personId, f.moderator.personId]) expect(text).not.toContain(hidden)
  })

  it("un classement dit « aucun manquement retenu », une mesure sans retrait dit « mesure prise »", async () => {
    const f = await fixture()
    const other = await enter(f.t, f.root, "autre")
    const dismissed = await f.reader.as.mutation(M.report, { networkId: f.root, target: { kind: "post", id: f.postId }, reason: "hate" })
    const warned = await other.as.mutation(M.report, { networkId: f.root, target: { kind: "post", id: f.postId }, reason: "violence" })
    await f.moderator.as.mutation(M.decide, { networkId: f.root, reportId: dismissed.reportId, decision: "dismissed", reason: "Aucun manquement constaté.", sanctions: [] })
    await f.moderator.as.mutation(M.decide, { networkId: f.root, reportId: warned.reportId, decision: "actioned", reason: "Avertissement donné.", sanctions: [{ kind: "warning" }] })
    expect((await f.reader.as.query(M.myReports, { paginationOpts: PAGE })).page[0]).toMatchObject({ outcome: "dismissed" })
    expect((await other.as.query(M.myReports, { paginationOpts: PAGE })).page[0]).toMatchObject({ outcome: "actioned" })
    expect((await noticesOf(f.t, f.root, other.personId)).some((notice) => notice.kind === "report_decided")).toBe(true)
  })

  it("le chemin historique des publications pose le délai, accuse réception et notifie la fermeture, pas l'examen", async () => {
    const f = await fixture()
    const filed = await f.reader.as.mutation(L.reportPost, { networkId: f.root, postId: f.postId, reason: "minor_harm", note: "Un mineur est visé." })
    const legacy = await f.t.run(async (ctx) => await ctx.db.get(filed.reportId))
    const linked = await f.t.run(async (ctx) => legacy?.reportId ? await ctx.db.get(legacy.reportId) : null)
    expect(linked).toMatchObject({ legalBasis: "art24", reporterNetworkId: f.root })
    expect(linked!.acknowledgedAt).toBeDefined()
    await f.moderator.as.mutation(L.decide, { networkId: f.root, reportId: filed.reportId, status: "reviewing", decisionReason: "Examen en cours." })
    expect((await noticesOf(f.t, f.root, f.reader.personId)).some((notice) => notice.kind === "report_decided")).toBe(false)
    await f.moderator.as.mutation(L.decide, { networkId: f.root, reportId: filed.reportId, status: "dismissed", decisionReason: "Contenu conforme." })
    expect((await noticesOf(f.t, f.root, f.reader.personId)).some((notice) => notice.kind === "report_decided")).toBe(true)
    expect((await f.reader.as.query(M.myReports, { paginationOpts: PAGE })).page[0]).toMatchObject({ outcome: "dismissed", legalBasis: "art24" })
  })
})

describe("SU01d — file prioritaire des délais légaux", () => {
  it("présente l'échéance la plus proche d'abord, garde la file ordinaire à part et refuse un simple membre", async () => {
    const f = await fixture()
    const other = await enter(f.t, f.root, "second")
    const third = await enter(f.t, f.root, "tiers")
    const start = Date.now()
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(start)
    const harassment = await f.reader.as.mutation(M.report, { networkId: f.root, target: { kind: "post", id: f.postId }, reason: "harassment" })
    vi.setSystemTime(start + HOUR)
    const deepfake = await other.as.mutation(M.report, { networkId: f.root, target: { kind: "post", id: f.postId }, reason: "deepfake_of_me" })
    const ordinary = await third.as.mutation(M.report, { networkId: f.root, target: { kind: "post", id: f.postId }, reason: "misinformation" })
    const queue = await f.moderator.as.query(M.deadlineQueue, { networkId: f.root })
    // 24 h depuis H+1 avant 72 h depuis H : l'hypertrucage passe en tête.
    expect(queue.items.map((item) => item.reportId)).toEqual([deepfake.reportId, harassment.reportId])
    expect(queue.items[0]).toMatchObject({ legalBasis: "art33", dueAt: start + HOUR + 24 * HOUR })
    expect(queue.items.every((item) => item.acknowledgedAt !== null)).toBe(true)
    expect(queue.truncated).toBe(false)
    expect(JSON.stringify(queue)).not.toContain(f.reader.personId)
    const lane = await f.moderator.as.query(M.paginateQueue, { networkId: f.root, lane: "ordinary", paginationOpts: PAGE })
    expect(lane.page.map((item) => item.reportId)).toEqual([ordinary.reportId])
    const all = await f.moderator.as.query(M.paginateQueue, { networkId: f.root, paginationOpts: PAGE })
    expect(all.page).toHaveLength(3)
    expect(await errorCode(f.reader.as.query(M.deadlineQueue, { networkId: f.root }))).toBe("notFound")
    // Une fois tranché, le dossier sort de la file des délais.
    await f.moderator.as.mutation(M.decide, { networkId: f.root, reportId: deepfake.reportId, decision: "actioned", reason: "Hypertrucage retiré.", sanctions: [{ kind: "removal" }] })
    expect((await f.moderator.as.query(M.deadlineQueue, { networkId: f.root })).items.map((item) => item.reportId)).toEqual([harassment.reportId])
  })

  it("suit la compétence d'équipe : une équipe des commentaires ne voit pas l'échéance d'une publication", async () => {
    const f = await fixture()
    const admin = await enter(f.t, f.root, "administratrice", "network_admin")
    const { teamId } = await admin.as.mutation(M.createTeam, { networkId: f.root, name: "Commentaires", scope: "comment", reason: "Équipe spécialisée." })
    await admin.as.mutation(M.setTeamMember, { networkId: f.root, teamId, personId: f.moderator.personId, active: true, reason: "Habilitation explicite." })
    await f.reader.as.mutation(M.report, { networkId: f.root, target: { kind: "post", id: f.postId }, reason: "harassment" })
    expect((await f.moderator.as.query(M.deadlineQueue, { networkId: f.root, teamId })).items).toEqual([])
    expect((await admin.as.query(M.deadlineQueue, { networkId: f.root })).items).toHaveLength(1)
  })
})

describe("SU01d — la cloche du déclarant", () => {
  it("montre l'accusé au déclarant avec la destination « Mes signalements », et à lui seul", async () => {
    const f = await fixture()
    await f.reader.as.mutation(M.report, { networkId: f.root, target: { kind: "post", id: f.postId }, reason: "privacy_or_honor" })
    const bell = (await f.reader.as.query(BELL.paginateNotifications, { networkId: f.root, paginationOpts: PAGE })).page
    const received = bell.find((row) => row.kind === "report_received")
    expect(received).toMatchObject({ actor: null, target: { kind: "personalReports" } })
    const authorBell = (await f.author.as.query(BELL.paginateNotifications, { networkId: f.root, paginationOpts: PAGE })).page
    expect(authorBell.some((row) => row.kind === "report_received")).toBe(false)
  })

  it("ne vise que le déclarant, dans le réseau où il a signalé, jamais un tiers", async () => {
    const f = await fixture()
    const reportId = await f.t.run(async (ctx) => await ctx.db.insert("reports", {
      networkId: f.testClosed, target: { kind: "post", id: f.postId }, targetKind: "post", targetId: f.postId, reporterPersonId: f.reader.personId,
      reporterNetworkId: f.root, reason: "harassment", level: "network", status: "open", createdAt: Date.now(), updatedAt: Date.now(),
    }))
    const verdicts = await f.t.run(async (ctx) => [
      await reporterNoticeRecipient(ctx, f.root, f.reader.personId, reportId),
      await reporterNoticeRecipient(ctx, f.testClosed, f.reader.personId, reportId),
      await reporterNoticeRecipient(ctx, f.root, f.author.personId, reportId),
    ])
    expect(verdicts).toEqual([true, false, false])
  })

  it("« Mes signalements » ne montre que les dossiers de la personne", async () => {
    const f = await fixture()
    const other = await enter(f.t, f.root, "voisine")
    await f.reader.as.mutation(M.report, { networkId: f.root, target: { kind: "post", id: f.postId }, reason: "impersonation" })
    await other.as.mutation(M.report, { networkId: f.root, target: { kind: "post", id: f.postId }, reason: "prohibited_ai_content" })
    const mine = await f.reader.as.query(M.myReports, { paginationOpts: PAGE })
    expect(mine.page.map((row) => row.reason)).toEqual(["impersonation"])
    expect(mine.page[0]).toMatchObject({ outcome: "pending", legalBasis: null, dueAt: null })
  })
})

describe("SU01d — délais tenus publiés sur /transparence", () => {
  const DAY = 86_400_000
  const DEADLINES = api.modules.public.projections.transparencyDeadlines

  /** Mesure la période comme le passage quotidien (`aggregateTransparency`), second passage compris. */
  async function measure(f: Awaited<ReturnType<typeof fixture>>, periodStart: number) {
    await f.t.mutation(internal.modules.moderation.maintenance.aggregateNetwork, { networkId: f.root, periodStart, periodEnd: periodStart + DAY, cursor: null, cases: 0, distinctAuthors: 0, actioned: 0, dismissed: 0 })
    await f.t.finishAllScheduledFunctions(vi.runAllTimers)
    return await f.t.run(async (ctx) => await ctx.db.query("moderationTransparency").withIndex("by_network_period", (q) => q.eq("networkId", f.root).eq("periodStart", periodStart)).unique())
  }

  it("compte chaque échéance le jour où elle tombe, tenue ou manquée, et ne publie que des nombres d'au moins cinq, jamais leur base", async () => {
    const f = await fixture()
    const second = await enter(f.t, f.root, "seconde")
    const authors = [f.author]
    for (const name of ["auteur2", "auteur3", "auteur4", "auteur5", "auteur6"]) authors.push(await enter(f.t, f.root, name))
    vi.useFakeTimers()
    const start = Math.ceil(Date.now() / DAY) * DAY + 10 * HOUR
    vi.setSystemTime(start)
    const posts = [f.postId]
    for (const author of authors.slice(1)) posts.push((await author.as.mutation(P.publish, { networkId: f.root, body: "Publication signalée" })).postId)
    const harassment: Id<"reports">[] = []
    for (const postId of posts.slice(0, 5)) harassment.push((await f.reader.as.mutation(M.report, { networkId: f.root, target: { kind: "post", id: postId }, reason: "harassment" })).reportId)
    harassment.push((await second.as.mutation(M.report, { networkId: f.root, target: { kind: "post", id: posts[5]! }, reason: "harassment" })).reportId)
    // Un hypertrucage échoit au bout de 24 h, un autre jour ; une désinformation n'a pas d'échéance légale.
    await second.as.mutation(M.report, { networkId: f.root, target: { kind: "post", id: posts[1]! }, reason: "deepfake_of_me" })
    await second.as.mutation(M.report, { networkId: f.root, target: { kind: "post", id: posts[2]! }, reason: "misinformation" })
    vi.setSystemTime(start + HOUR)
    for (const [n, reportId] of harassment.slice(0, 5).entries()) {
      await f.moderator.as.mutation(M.decide, n < 2
        ? { networkId: f.root, reportId, decision: "dismissed", reason: "Aucun manquement constaté.", sanctions: [] }
        : { networkId: f.root, reportId, decision: "actioned", reason: "Avertissement donné.", sanctions: [{ kind: "warning" }] })
    }
    // Le sixième harcèlement reste ouvert au-delà de son échéance de 72 h : manquée.
    const dueDay = Math.floor((start + 72 * HOUR) / DAY) * DAY
    vi.setSystemTime(dueDay + DAY + 4 * HOUR + 10 * 60_000)
    expect(await measure(f, dueDay)).toMatchObject({ cases: 0, legalMet: 5, legalMissed: 1, legalAuthors: 5 })
    const deepfakeDay = Math.floor((start + 24 * HOUR) / DAY) * DAY
    expect(await measure(f, deepfakeDay)).toMatchObject({ legalMet: 0, legalMissed: 1, legalAuthors: 1 })

    const published = await f.t.query(DEADLINES, { networkId: f.root })
    expect(published.threshold).toBe(5)
    expect(published.periods).toHaveLength(12)
    expect(published.periods[0]).toEqual({ periodStart: dueDay, periodEnd: dueDay + DAY, legal: { met: 5, missed: null } })
    // Une échéance seule ne se publie pas ; aucune autre période n'a d'échéances.
    expect(published.periods.filter((period) => period.legal !== null)).toHaveLength(1)
    const text = JSON.stringify(published)
    for (const hidden of [f.reader.personId, second.personId, f.author.personId, f.moderator.personId, "harassment", "deepfake"]) expect(text).not.toContain(hidden)
  })

  it("ne publie pas les échéances d'un seul auteur, même tenues", async () => {
    const f = await fixture()
    const reporters = [f.reader]
    for (const name of ["declarant2", "declarant3", "declarant4", "declarant5", "declarant6"]) reporters.push(await enter(f.t, f.root, name))
    vi.useFakeTimers()
    const start = Math.ceil(Date.now() / DAY) * DAY + 10 * HOUR
    vi.setSystemTime(start)
    const filed: Id<"reports">[] = []
    for (const reporter of reporters) filed.push((await reporter.as.mutation(M.report, { networkId: f.root, target: { kind: "post", id: f.postId }, reason: "harassment" })).reportId)
    for (const reportId of filed) await f.moderator.as.mutation(M.decide, { networkId: f.root, reportId, decision: "dismissed", reason: "Aucun manquement constaté.", sanctions: [] })
    const dueDay = Math.floor((start + 72 * HOUR) / DAY) * DAY
    vi.setSystemTime(dueDay + DAY + 4 * HOUR)
    expect(await measure(f, dueDay)).toMatchObject({ legalMet: 6, legalMissed: 0, legalAuthors: 1 })
    expect((await f.t.query(DEADLINES, { networkId: f.root })).periods.every((period) => period.legal === null)).toBe(true)
  })
})
