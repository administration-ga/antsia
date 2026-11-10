// @vitest-environment edge-runtime
/** PA7 : les fonctions réelles, leurs projections, les limites et les jobs matérialisés. */
import { engineErrorCode } from "@antsia/social-contracts/errors"
import { afterEach, describe, expect, it, vi } from "vitest"

import { api, components, internal } from "../../_generated/api"
import type { Doc, Id } from "../../_generated/dataModel"
import { SEED_CONFIRMATION } from "../../seeds/foundations"
import { createTestSession, testConvex } from "../../test.setup"

type T = ReturnType<typeof testConvex>
const C = api.modules.platform.console
const PAGE = { cursor: null, numItems: 25 }
const REASON = "Décision prise après examen de la situation."
afterEach(() => vi.useRealTimers())

function componentId(value: unknown): string {
  if (typeof value === "object" && value !== null && "_id" in value && typeof value._id === "string") return value._id
  throw new Error("Document Better Auth de fixture absent")
}

/** Isolé pour pouvoir suivre la preuve de session IDN de la porte console PA7. */
async function operator(t: T, networkId: Id<"networks">, loa: 1 | 2 = 2) {
  const now = Date.now()
  const userId = componentId(await t.mutation(components.betterAuth.adapter.create, { input: { model: "user", data: { name: "Nom civil non exposé", email: "console@example.test", emailVerified: true, createdAt: now, updatedAt: now } } }))
  const subject = `idn-console-${userId}`
  await t.mutation(components.betterAuth.adapter.create, { input: { model: "account", data: { userId, providerId: "idn", accountId: subject, createdAt: now, updatedAt: now } } })
  const sessionId = await createTestSession(t, userId)
  const as = t.withIdentity({ subject: userId, sessionId, applicationOrigin: "admin_antsia", issuer: "fixture-engine" })
  await t.mutation(internal.modules.people.identity.recordIdnProof, { subject, loa })
  await t.mutation(internal.modules.platform.operatorAccess.recordIdnSession, { sessionId, authUserId: userId, idnSubject: subject, loa })
  const personId = await as.mutation(api.modules.people.persons.ensureMyPerson, {})
  await t.run(async (ctx) => {
    await ctx.db.insert("operators", { personId, role: "platform_operator", grantedAt: now })
    await ctx.db.insert("networkMemberships", { networkId, personId, status: "declaree", role: "member", joinedAt: now, statusChangedAt: now })
  })
  await as.mutation(api.modules.platform.operatorAccess.recordAccess, {})
  return { as, personId, userId, sessionId, subject }
}

async function person(t: T, networkId: Id<"networks">, handle: string, extra: Partial<Pick<Doc<"persons">, "privateAt" | "withdrawnAt" | "erasedAt">> = {}) {
  return await t.run(async (ctx) => {
    const now = Date.now()
    const personId = await ctx.db.insert("persons", { authUserId: `console-${handle}`, handle, displayName: handle, publishedAt: now, createdAt: now, updatedAt: now, ...extra })
    await ctx.db.insert("networkMemberships", { networkId, personId, status: "declaree", role: "member", joinedAt: now, statusChangedAt: now })
    return personId
  })
}

async function fixture() {
  const t = testConvex()
  const { root } = await t.mutation(internal.seeds.foundations.run, { confirmNonProduction: SEED_CONFIRMATION })
  const actor = await operator(t, root)
  const other = await t.run(async (ctx) => await ctx.db.insert("networks", { slug: "console-voisin", name: "Réseau voisin", kind: "closed", parentId: root, membershipPolicy: "open", defaultVisibility: "network", reachValues: [], theme: "antsia", status: "active", createdAt: Date.now(), updatedAt: Date.now() }))
  return { t, root, other, actor }
}

async function errorCode(promise: Promise<unknown>) {
  try { await promise; return null } catch (error) { return engineErrorCode(error) }
}

/** Les assertions métier laissent la preuve d'accès aux tests dédiés de la porte console. */
async function decisionAudit(t: T) {
  return (await t.run(async (ctx) => await ctx.db.query("engineAudit").withIndex("by_at").take(200))).filter((line) => line.action !== "console.access")
}

/** Avance les tranches immédiates, avec une limite explicite du harnais. */
async function finishMetrics(t: T, networkId: Id<"networks">) {
  for (let tranche = 0; tranche < 40; tranche++) {
    await vi.advanceTimersByTimeAsync(1)
    await t.finishInProgressScheduledFunctions()
    const row = await t.run(async (ctx) => await ctx.db.query("consoleMetrics").withIndex("by_network", (q) => q.eq("networkId", networkId)).unique())
    if (row?.status === "ready") return
  }
  throw new Error("Le calcul des métriques dépasse les quarante tranches attendues par la fixture")
}

describe("PA7 / équipes opérateur", () => {
  it("seul un opérateur vivant lit ou décide ; les coordonnées ne sont jamais projetées", async () => {
    const f = await fixture()
    const member = await person(f.t, f.root, "awa")
    const { teamId } = await f.actor.as.mutation(C.createTeam, { networkId: f.root, name: "Équipe des publications", scope: "post", reason: REASON })
    await f.actor.as.mutation(C.setTeamMember, { networkId: f.root, teamId, personId: member, active: true, reason: REASON })
    expect(await f.actor.as.query(C.listTeams, { networkId: f.root })).toEqual([{ teamId, name: "Équipe des publications", scope: "post", active: true, members: [{ personId: member, handle: "awa", displayName: "awa", active: true }] }])
    expect(await f.actor.as.query(C.findMember, { networkId: f.root, handle: "@AWA" })).toEqual({ personId: member, handle: "awa", displayName: "awa" })
    const as = f.t.withIdentity({ subject: "console-awa" })
    expect(await errorCode(as.query(C.listTeams, { networkId: f.root }))).toBe("operatorRequired")
    await f.t.run(async (ctx) => {
      const row = await ctx.db.query("operators").withIndex("by_person", (q) => q.eq("personId", f.actor.personId)).unique()
      if (row) await ctx.db.patch(row._id, { revokedAt: Date.now() })
    })
    expect(await errorCode(f.actor.as.mutation(C.createTeam, { networkId: f.root, name: "Autre équipe", reason: REASON }))).toBe("operatorRequired")
  })

  it("les profils privés, retirés et les non-membres restent indistincts ; le DTO d'une ancienne capacité devient neutre", async () => {
    const f = await fixture()
    const member = await person(f.t, f.root, "awa")
    await person(f.t, f.root, "prive", { privateAt: Date.now() })
    await person(f.t, f.root, "retire", { withdrawnAt: Date.now() })
    await person(f.t, f.other, "voisin")
    const { teamId } = await f.actor.as.mutation(C.createTeam, { networkId: f.root, name: "Équipe", reason: REASON })
    await f.actor.as.mutation(C.setTeamMember, { networkId: f.root, teamId, personId: member, active: true, reason: REASON })
    for (const handle of ["prive", "retire", "voisin", "inconnu"]) expect(await f.actor.as.query(C.findMember, { networkId: f.root, handle })).toBeNull()
    await f.t.run(async (ctx) => await ctx.db.patch(member, { privateAt: Date.now() }))
    expect((await f.actor.as.query(C.listTeams, { networkId: f.root }))[0]?.members).toEqual([{ personId: member, handle: null, displayName: null, active: true }])
  })

  it("l'annuaire opt-in d'un réseau gouverné est relu, même si le handle global est connu", async () => {
    const f = await fixture()
    const member = await person(f.t, f.other, "diop")
    await f.t.run(async (ctx) => {
      await ctx.db.patch(f.other, { managedBy: "diaspora" })
      await ctx.db.insert("networkMemberships", { networkId: f.root, personId: member, status: "declaree", role: "member", joinedAt: Date.now(), statusChangedAt: Date.now() })
    })
    expect(await f.actor.as.query(C.findMember, { networkId: f.other, handle: "diop" })).toBeNull()
    await f.t.run(async (ctx) => {
      const membership = await ctx.db.query("networkMemberships").withIndex("by_network_and_person", (q) => q.eq("networkId", f.other).eq("personId", member)).unique()
      if (membership) await ctx.db.patch(membership._id, { directoryListed: true })
    })
    expect(await f.actor.as.query(C.findMember, { networkId: f.other, handle: "diop" })).toMatchObject({ personId: member, handle: "diop" })
  })

  it("refuse une équipe voisine et une nouvelle capacité après départ ou suspension racine, sans créer d'adhésion", async () => {
    const f = await fixture()
    const member = await person(f.t, f.root, "awa")
    const { teamId } = await f.actor.as.mutation(C.createTeam, { networkId: f.other, name: "Équipe voisine", reason: REASON })
    expect(await errorCode(f.actor.as.mutation(C.setTeamMember, { networkId: f.root, teamId, personId: member, active: true, reason: REASON }))).toBe("notFound")
    expect(await errorCode(f.actor.as.mutation(C.setTeamMember, { networkId: f.other, teamId, personId: member, active: true, reason: REASON }))).toBe("notFound")
    expect(await f.t.run(async (ctx) => await ctx.db.query("networkMemberships").withIndex("by_network_and_person", (q) => q.eq("networkId", f.other).eq("personId", member)).unique())).toBeNull()
    const own = await f.actor.as.mutation(C.createTeam, { networkId: f.root, name: "Équipe racine", reason: REASON })
    await f.actor.as.mutation(C.setTeamMember, { networkId: f.root, teamId: own.teamId, personId: member, active: true, reason: REASON })
    await f.t.run(async (ctx) => {
      const membership = await ctx.db.query("networkMemberships").withIndex("by_network_and_person", (q) => q.eq("networkId", f.root).eq("personId", member)).unique()
      if (membership) await ctx.db.patch(membership._id, { status: "suspendue" })
    })
    expect((await f.actor.as.query(C.listTeams, { networkId: f.root }))[0]?.members[0]).toMatchObject({ active: false, handle: null })
    expect(await errorCode(f.actor.as.mutation(C.setTeamMember, { networkId: f.root, teamId: own.teamId, personId: member, active: true, reason: REASON }))).toBe("notFound")
    // Retirer une capacité périmée reste possible et ne rétablit pas l'adhésion.
    await f.actor.as.mutation(C.setTeamMember, { networkId: f.root, teamId: own.teamId, personId: member, active: false, reason: REASON })
  })

  it("les motifs et noms invalides ne créent ni équipe ni audit ; le quota de 100 équipes s'applique", async () => {
    const f = await fixture()
    expect(await errorCode(f.actor.as.mutation(C.createTeam, { networkId: f.root, name: "x", reason: REASON }))).toBe("invalidArgument")
    expect(await errorCode(f.actor.as.mutation(C.createTeam, { networkId: f.root, name: "Équipe", reason: "x" }))).toBe("invalidArgument")
    expect(await decisionAudit(f.t)).toEqual([])
    await f.t.run(async (ctx) => {
      for (let i = 0; i < 100; i++) await ctx.db.insert("moderationTeams", { networkId: f.root, name: `Équipe ${i}`, active: true, createdAt: Date.now() })
    })
    expect(await errorCode(f.actor.as.mutation(C.createTeam, { networkId: f.root, name: "Équipe supplémentaire", reason: REASON }))).toBe("policyRefused")
  })

  it("100 membres au plus ; modifier un membre existant ne consomme pas une nouvelle place", async () => {
    const f = await fixture()
    const { teamId } = await f.actor.as.mutation(C.createTeam, { networkId: f.root, name: "Équipe", reason: REASON })
    const first = await person(f.t, f.root, "premier")
    const extra = await person(f.t, f.root, "extra")
    await f.t.run(async (ctx) => {
      for (let i = 0; i < 100; i++) {
        const personId = i === 0 ? first : await ctx.db.insert("persons", { authUserId: `capacity-${i}`, createdAt: Date.now(), updatedAt: Date.now() })
        await ctx.db.insert("moderationTeamMembers", { networkId: f.root, teamId, personId, active: true, updatedAt: Date.now() })
      }
    })
    expect(await errorCode(f.actor.as.mutation(C.setTeamMember, { networkId: f.root, teamId, personId: extra, active: true, reason: REASON }))).toBe("policyRefused")
    await f.actor.as.mutation(C.setTeamMember, { networkId: f.root, teamId, personId: first, active: false, reason: REASON })
    const audit = (await decisionAudit(f.t)).filter((line) => line.networkId === f.root)
    expect(audit.map((row) => row.action)).toEqual(["moderation.team_create", "moderation.team_member_set"])
    expect(audit.every((row) => row.capacity === "platform_operator")).toBe(true)
  })
})

describe("PA7 / incidents", () => {
  it("ouverture et résolution sont auditées, la liste n'expose pas les acteurs ni les motifs", async () => {
    const f = await fixture()
    const global = await f.actor.as.mutation(C.createIncident, { title: "  Service ralenti  ", severity: "warning", reason: REASON })
    const scoped = await f.actor.as.mutation(C.createIncident, { networkId: f.root, title: "Fédération en attente", severity: "critical", reason: REASON })
    await f.actor.as.mutation(C.resolveIncident, { incidentId: scoped.incidentId, reason: REASON })
    expect(await errorCode(f.actor.as.mutation(C.resolveIncident, { incidentId: scoped.incidentId, reason: REASON }))).toBe("policyRefused")
    const own = await f.actor.as.query(C.paginateIncidents, { networkId: f.root, paginationOpts: PAGE })
    expect(own.page).toEqual([{ incidentId: scoped.incidentId, networkId: f.root, title: "Fédération en attente", severity: "critical", status: "resolved", createdAt: expect.any(Number), updatedAt: expect.any(Number) }])
    expect((await f.actor.as.query(C.paginateIncidents, { paginationOpts: PAGE })).page.map((row) => row.incidentId).sort()).toEqual([global.incidentId, scoped.incidentId].sort())
    const audit = await decisionAudit(f.t)
    expect(audit.map((row) => row.action)).toEqual(["console.incident_open", "console.incident_open", "console.incident_resolve"])
    expect(audit.every((row) => row.capacity === "platform_operator" && row.actorPersonId === f.actor.personId)).toBe(true)
  })

  it("titre, motif et pagination sont bornés ; un réseau archivé refuse une nouvelle ouverture", async () => {
    const f = await fixture()
    for (const title of ["x", "x".repeat(161)]) expect(await errorCode(f.actor.as.mutation(C.createIncident, { title, severity: "info", reason: REASON }))).toBe("invalidArgument")
    expect(await errorCode(f.actor.as.mutation(C.createIncident, { title: "Incident", severity: "info", reason: "x".repeat(501) }))).toBe("invalidArgument")
    expect(await errorCode(f.actor.as.query(C.paginateIncidents, { paginationOpts: { cursor: null, numItems: 51 } }))).toBe("invalidArgument")
    await f.t.run(async (ctx) => await ctx.db.patch(f.other, { status: "archived" }))
    expect(await errorCode(f.actor.as.mutation(C.createIncident, { networkId: f.other, title: "Incident", severity: "info", reason: REASON }))).toBe("notFound")
    expect(await decisionAudit(f.t)).toEqual([])
  })
})

describe("PA7 / métriques matérialisées", () => {
  it("parcourt plusieurs tranches et les cinq tables, sans inclure le réseau voisin ni les états terminaux", async () => {
    vi.useFakeTimers()
    const f = await fixture()
    await f.t.run(async (ctx) => {
      for (let i = 0; i < 105; i++) {
        const personId = await ctx.db.insert("persons", { authUserId: `metrics-${i}`, createdAt: Date.now(), updatedAt: Date.now() })
        await ctx.db.insert("networkMemberships", { networkId: f.root, personId, status: i === 104 ? "partie" : "declaree", role: "member", joinedAt: Date.now(), statusChangedAt: Date.now() })
      }
      for (const networkId of [f.root, f.other]) {
        const reportId = await ctx.db.insert("reports", { networkId, target: { kind: "person", id: f.actor.personId }, targetKind: "person", targetId: f.actor.personId, reason: "other", level: "platform", status: "open", createdAt: Date.now(), updatedAt: Date.now() })
        await ctx.db.insert("reports", { networkId, target: { kind: "person", id: f.actor.personId }, targetKind: "person", targetId: f.actor.personId, reason: "other", level: "network", status: "reviewing", createdAt: Date.now(), updatedAt: Date.now() })
        await ctx.db.insert("reports", { networkId, target: { kind: "person", id: f.actor.personId }, targetKind: "person", targetId: f.actor.personId, reason: "other", level: "network", status: "actioned", createdAt: Date.now(), updatedAt: Date.now() })
        await ctx.db.insert("appeals", { networkId, reportId, personId: f.actor.personId, reason: REASON, level: "platform", status: "open", createdAt: Date.now(), updatedAt: Date.now() })
        await ctx.db.insert("appeals", { networkId, reportId, personId: f.actor.personId, reason: REASON, level: "network", status: "upheld", createdAt: Date.now(), updatedAt: Date.now() })
        for (const status of ["pending", "running", "clean"] as const) {
          const storageId = await ctx.storage.store(new Blob(["fichier de fixture"]))
          await ctx.db.insert("fileScans", { networkId, storageId, status, source: "post_media", attempts: 0, createdAt: Date.now(), updatedAt: Date.now() })
        }
        const emitterId = await ctx.db.insert("federationEmitters", { networkId, slug: `fixture-${networkId}`, environment: "sandbox", enabled: true, keyEnvName: "FIXTURE_KEY", allowedContracts: [], revision: 1, createdAt: Date.now(), updatedAt: Date.now() })
        const receiptId = await ctx.db.insert("federationInboxReceipts", { networkId, emitterId, environment: "sandbox", eventId: "event", contract: "fixture", version: 1, objectRef: "ref", bodySha256: "hash", status: "dead_letter", receivedAt: Date.now(), updatedAt: Date.now() })
        for (const status of ["dead_letter", "resolved"] as const) await ctx.db.insert("federationDeadLetters", { networkId, emitterId, receiptId, environment: "sandbox", eventId: status, contract: "fixture", objectRef: "ref", bodySha256: "hash", rawBody: "{}", reason: "unsupported_contract", status, attempts: 0, firstFailedAt: Date.now(), lastAttemptAt: Date.now() })
      }
    })
    expect(await f.actor.as.query(C.getMetrics, { networkId: f.root })).toBeNull()
    await f.actor.as.mutation(C.refreshMetrics, { networkId: f.root })
    expect(await f.actor.as.query(C.getMetrics, { networkId: f.root })).toEqual({ status: "building", generatedAt: null, counts: { members: 0, openReports: 0, openAppeals: 0, pendingFiles: 0, deadLetters: 0 } })
    await finishMetrics(f.t, f.root)
    expect(await f.actor.as.query(C.getMetrics, { networkId: f.root })).toEqual({ status: "ready", generatedAt: expect.any(Number), counts: { members: 105, openReports: 2, openAppeals: 1, pendingFiles: 2, deadLetters: 1 } })
    expect(await f.actor.as.query(C.getMetrics, { networkId: f.other })).toBeNull()
  })

  it("une nouvelle génération invalide les anciens jobs ; la même tranche rejouée n'additionne pas deux fois", async () => {
    vi.useFakeTimers()
    const f = await fixture()
    await person(f.t, f.root, "awa")
    await f.actor.as.mutation(C.refreshMetrics, { networkId: f.root })
    await f.actor.as.mutation(C.refreshMetrics, { networkId: f.root })
    const args = { networkId: f.root, generation: 1, stage: "members" as const, cursor: null }
    await f.t.mutation(internal.modules.platform.console.recomputeMetrics, args)
    expect((await f.actor.as.query(C.getMetrics, { networkId: f.root }))?.counts.members).toBe(0)
    await f.t.mutation(internal.modules.platform.console.recomputeMetrics, { ...args, generation: 2 })
    await f.t.mutation(internal.modules.platform.console.recomputeMetrics, { ...args, generation: 2 })
    expect((await f.actor.as.query(C.getMetrics, { networkId: f.root }))?.counts.members).toBe(2)
    await finishMetrics(f.t, f.root)
    expect((await f.actor.as.query(C.getMetrics, { networkId: f.root }))?.counts.members).toBe(2)
    expect(await f.t.run(async (ctx) => await ctx.db.query("consoleMetrics").withIndex("by_network", (q) => q.eq("networkId", f.root)).take(3))).toHaveLength(1)
  })

  it("un réseau archivé interrompt les jobs et n'obtient pas un snapshot prêt", async () => {
    vi.useFakeTimers()
    const f = await fixture()
    await f.actor.as.mutation(C.refreshMetrics, { networkId: f.other })
    await f.t.run(async (ctx) => await ctx.db.patch(f.other, { status: "archived" }))
    await vi.advanceTimersByTimeAsync(1)
    await f.t.finishInProgressScheduledFunctions()
    const row = await f.t.run(async (ctx) => await ctx.db.query("consoleMetrics").withIndex("by_network", (q) => q.eq("networkId", f.other)).unique())
    expect(row).toMatchObject({ status: "building", generation: 1, stage: "members" })
    expect(await errorCode(f.actor.as.mutation(C.refreshMetrics, { networkId: f.other }))).toBe("notFound")
  })
})

describe("PA7 / export agrégé", () => {
  it("masque une sous-catégorie inférieure à cinq et celle dont le complément est inférieur à cinq", async () => {
    const f = await fixture()
    await f.t.run(async (ctx) => await ctx.db.insert("moderationTransparency", { networkId: f.root, periodStart: 1, periodEnd: 2, cases: 15, distinctAuthors: 5, actioned: 1, dismissed: 14, generatedAt: Date.now() }))
    expect((await f.actor.as.query(C.aggregateExport, { networkId: f.root })).periods).toEqual([{ periodStart: 1, periodEnd: 2, cases: 15, actioned: null, dismissed: null, suppressed: false, legalStatus: "unmeasured", legalMet: null, legalMissed: null }])
  })

  it("conserve les sous-catégories lorsque leur effectif et leur complément atteignent cinq", async () => {
    const f = await fixture()
    await f.t.run(async (ctx) => await ctx.db.insert("moderationTransparency", { networkId: f.root, periodStart: 1, periodEnd: 2, cases: 15, distinctAuthors: 5, actioned: 5, dismissed: 10, generatedAt: Date.now() }))
    expect((await f.actor.as.query(C.aggregateExport, { networkId: f.root })).periods).toEqual([{ periodStart: 1, periodEnd: 2, cases: 15, actioned: 5, dismissed: 10, suppressed: false, legalStatus: "unmeasured", legalMet: null, legalMissed: null }])
  })

  it("supprime tous les chiffres si les cas OU les auteurs sont moins de cinq ; conserve seulement les dernières 12 périodes du réseau", async () => {
    const f = await fixture()
    await f.t.run(async (ctx) => {
      for (let i = 0; i < 14; i++) await ctx.db.insert("moderationTransparency", { networkId: f.root, periodStart: i, periodEnd: i + 1, cases: i === 13 ? 4 : 15, distinctAuthors: i === 12 ? 4 : 5, actioned: 5, dismissed: 5, generatedAt: Date.now() })
      await ctx.db.insert("moderationTransparency", { networkId: f.other, periodStart: 99, periodEnd: 100, cases: 999, distinctAuthors: 999, actioned: 999, dismissed: 0, generatedAt: Date.now() })
    })
    const exported = await f.actor.as.query(C.aggregateExport, { networkId: f.root })
    expect(exported.threshold).toBe(5)
    expect(exported.periods).toHaveLength(12)
    expect(exported.periods.slice(0, 2)).toEqual([
      { periodStart: 13, periodEnd: 14, cases: null, actioned: null, dismissed: null, suppressed: true, legalStatus: "unmeasured", legalMet: null, legalMissed: null },
      { periodStart: 12, periodEnd: 13, cases: null, actioned: null, dismissed: null, suppressed: true, legalStatus: "unmeasured", legalMet: null, legalMissed: null },
    ])
    expect(exported.periods[2]).toEqual({ periodStart: 11, periodEnd: 12, cases: 15, actioned: 5, dismissed: 5, suppressed: false, legalStatus: "unmeasured", legalMet: null, legalMissed: null })
    expect(exported.periods.every((row) => Object.keys(row).sort().join(",") === "actioned,cases,dismissed,legalMet,legalMissed,legalStatus,periodEnd,periodStart,suppressed")).toBe(true)
  })
})

describe("SU01d / délais légaux dans la console", () => {
  const DAY = 86_400_000
  const HOUR = 3_600_000
  type LegalCounts = Partial<Pick<Doc<"moderationTransparency">, "legalMet" | "legalMissed" | "legalAuthors">>
  type ReportExtra = Partial<Pick<Doc<"reports">, "legalBasis" | "dueAt" | "reviewedAt">>
  const minute = (at: number) => Math.floor(at / 60_000) * 60_000

  /** Un dossier de fixture : la cible et son auteur ne doivent jamais ressortir de la console. */
  async function report(t: T, networkId: Id<"networks">, ownerPersonId: Id<"persons">, status: Doc<"reports">["status"], extra: ReportExtra, at = Date.now()) {
    return await t.run(async (ctx) => await ctx.db.insert("reports", { networkId, target: { kind: "person", id: ownerPersonId }, targetKind: "person", targetId: ownerPersonId, ownerPersonId, reason: "harassment", level: "network", status, createdAt: at, updatedAt: at, ...extra }))
  }

  it("l'export suit la règle de /transparence : tenues et manquées d'au moins cinq, jamais la base, état non mesuré ou masqué", async () => {
    const f = await fixture()
    await f.t.run(async (ctx) => {
      const period = async (day: number, legal: LegalCounts, generatedAt = (day + 1) * DAY + HOUR) => await ctx.db.insert("moderationTransparency", { networkId: f.root, periodStart: day * DAY, periodEnd: (day + 1) * DAY, cases: 15, distinctAuthors: 5, actioned: 5, dismissed: 10, generatedAt, ...legal })
      await period(6, { legalMet: 7, legalMissed: 0, legalAuthors: 5 })
      await period(5, { legalMet: 3, legalMissed: 6, legalAuthors: 5 })
      await period(4, { legalMet: 3, legalMissed: 1, legalAuthors: 5 })
      await period(3, { legalMet: 9, legalMissed: 9, legalAuthors: 4 })
      await period(2, {})
      // Calculée avant la fin de sa période, une échéance pouvait encore tomber : rien n'est final.
      await period(1, { legalMet: 9, legalMissed: 9, legalAuthors: 5 }, 1.5 * DAY)
    })
    const { periods } = await f.actor.as.query(C.aggregateExport, { networkId: f.root })
    expect(periods.map(({ periodStart, legalStatus, legalMet, legalMissed }) => ({ day: periodStart / DAY, legalStatus, legalMet, legalMissed }))).toEqual([
      { day: 6, legalStatus: "disclosed", legalMet: 7, legalMissed: null },
      { day: 5, legalStatus: "disclosed", legalMet: null, legalMissed: 6 },
      { day: 4, legalStatus: "suppressed", legalMet: null, legalMissed: null },
      { day: 3, legalStatus: "suppressed", legalMet: null, legalMissed: null },
      { day: 2, legalStatus: "unmeasured", legalMet: null, legalMissed: null },
      { day: 1, legalStatus: "unmeasured", legalMet: null, legalMissed: null },
    ])
    // Les dossiers de la période restent masqués à part : les deux règles ne se mêlent pas.
    expect(periods[0]).toMatchObject({ cases: 15, actioned: 5, dismissed: 10, suppressed: false })
    expect(JSON.stringify(periods)).not.toContain("legalAuthors")
  })

  it("mesure de bout en bout : les deux passages réels, puis l'export de la console", async () => {
    const f = await fixture()
    const owners: Id<"persons">[] = []
    for (let n = 0; n < 6; n++) owners.push(await person(f.t, f.root, `auteur${n}`))
    vi.useFakeTimers()
    const start = Math.ceil(Date.now() / DAY) * DAY + 10 * HOUR
    vi.setSystemTime(start)
    const dueAt = start + 72 * HOUR
    // Cinq harcèlements tranchés dans le délai de l'art. 24, un sixième resté ouvert au-delà.
    for (const [n, owner] of owners.entries()) await report(f.t, f.root, owner, n < 5 ? "dismissed" : "open", { legalBasis: "art24", dueAt, ...(n < 5 ? { reviewedAt: start + HOUR } : {}) }, start)
    const dueDay = Math.floor(dueAt / DAY) * DAY
    vi.setSystemTime(dueDay + DAY + 4 * HOUR + 10 * 60_000)
    await f.t.mutation(internal.modules.moderation.maintenance.aggregateNetwork, { networkId: f.root, periodStart: dueDay, periodEnd: dueDay + DAY, cursor: null, cases: 0, distinctAuthors: 0, actioned: 0, dismissed: 0 })
    await f.t.finishAllScheduledFunctions(vi.runAllTimers)
    const { periods } = await f.actor.as.query(C.aggregateExport, { networkId: f.root })
    expect(periods).toEqual([{ periodStart: dueDay, periodEnd: dueDay + DAY, cases: null, actioned: null, dismissed: null, suppressed: true, legalStatus: "disclosed", legalMet: 5, legalMissed: null }])
    // L'alerte voit encore le dossier ouvert, échéance dépassée.
    expect((await f.actor.as.query(C.legalDeadlineAlert, { networkId: f.root })).deadlines).toEqual([{ dueAt, basis: "art24" }])
  })

  it("l'alerte rend les échéances ouvertes ou en examen, la plus proche d'abord, à la minute, sans dossier, motif ni personne", async () => {
    const f = await fixture()
    const owner = await person(f.t, f.root, "auteur-alerte")
    vi.useFakeTimers({ toFake: ["Date"] })
    // Une transmission à la seconde près : l'échéance sort à la minute inférieure.
    const now = Date.UTC(2026, 9, 22, 8, 17, 42, 512)
    vi.setSystemTime(now)
    await report(f.t, f.root, owner, "open", { legalBasis: "art24", dueAt: now + 72 * HOUR })
    await report(f.t, f.root, owner, "reviewing", { legalBasis: "art33", dueAt: now - HOUR })
    await report(f.t, f.root, owner, "open", { legalBasis: "art32", dueAt: now + 2 * HOUR })
    // Ni la file ordinaire, ni les dossiers tranchés, ni le réseau voisin.
    await report(f.t, f.root, owner, "open", {})
    await report(f.t, f.root, owner, "actioned", { legalBasis: "art24", dueAt: now - 2 * HOUR, reviewedAt: now })
    await report(f.t, f.root, owner, "dismissed", { legalBasis: "art24", dueAt: now - 3 * HOUR, reviewedAt: now })
    await report(f.t, f.other, owner, "open", { legalBasis: "art24", dueAt: now - 4 * HOUR })
    const alert = await f.actor.as.query(C.legalDeadlineAlert, { networkId: f.root })
    expect(alert).toEqual({ limit: 50, horizon: null, deadlines: [
      { dueAt: Date.UTC(2026, 9, 22, 7, 17), basis: "art33" },
      { dueAt: Date.UTC(2026, 9, 22, 10, 17), basis: "art32" },
      { dueAt: Date.UTC(2026, 9, 25, 8, 17), basis: "art24" },
    ] })
    const text = JSON.stringify(alert)
    for (const hidden of [owner, "harassment", "person", f.actor.personId, String(now + 2 * HOUR)]) expect(text).not.toContain(hidden)
    expect(await f.actor.as.query(C.legalDeadlineAlert, { networkId: f.other })).toEqual({ limit: 50, horizon: null, deadlines: [{ dueAt: minute(now - 4 * HOUR), basis: "art24" }] })
  })

  it("l'alerte est bornée par statut et dit son horizon ; seul un opérateur vivant la lit, jamais pour un réseau archivé", async () => {
    const f = await fixture()
    const owner = await person(f.t, f.root, "auteur-borne")
    const now = Date.now()
    for (let n = 0; n < 52; n++) await report(f.t, f.root, owner, "open", { legalBasis: "art24", dueAt: now + n * HOUR })
    await report(f.t, f.root, owner, "reviewing", { legalBasis: "art33", dueAt: now + 100 * HOUR })
    const alert = await f.actor.as.query(C.legalDeadlineAlert, { networkId: f.root })
    // Cinquante ouverts lus, le cinquante et unième fixe l'horizon ; le dossier en examen est lu à part.
    expect(alert.deadlines).toHaveLength(51)
    expect(alert.horizon).toBe(minute(now + 50 * HOUR))
    expect(alert.deadlines.slice(0, 50).every((item, n) => item.dueAt === minute(now + n * HOUR) && item.basis === "art24")).toBe(true)
    expect(alert.deadlines[50]).toEqual({ dueAt: minute(now + 100 * HOUR), basis: "art33" })

    // Un membre du réseau, même auteur des dossiers, n'est pas un opérateur.
    const member = f.t.withIdentity({ subject: "console-auteur-borne" })
    expect(await errorCode(member.query(C.legalDeadlineAlert, { networkId: f.root }))).toBe("operatorRequired")
    await f.t.run(async (ctx) => await ctx.db.patch(f.other, { status: "archived" }))
    expect(await errorCode(f.actor.as.query(C.legalDeadlineAlert, { networkId: f.other }))).toBe("notFound")
  })

  it("l'horizon est la plus proche des échéances non lues, quel que soit le statut tronqué le plus tôt", async () => {
    const f = await fixture()
    const owner = await person(f.t, f.root, "auteur-horizon")
    const now = Date.now()
    // Racine : la file ouverte est tronquée la première ; réseau voisin : la file en examen.
    for (let n = 0; n <= 50; n++) {
      await report(f.t, f.root, owner, "open", { legalBasis: "art24", dueAt: now + n * HOUR })
      await report(f.t, f.root, owner, "reviewing", { legalBasis: "art33", dueAt: now + (100 + n) * HOUR })
      await report(f.t, f.other, owner, "open", { legalBasis: "art24", dueAt: now + (100 + n) * HOUR })
      await report(f.t, f.other, owner, "reviewing", { legalBasis: "art33", dueAt: now + n * HOUR })
    }
    for (const networkId of [f.root, f.other]) {
      const alert = await f.actor.as.query(C.legalDeadlineAlert, { networkId })
      expect(alert.horizon).toBe(minute(now + 50 * HOUR))
      expect(alert.deadlines).toHaveLength(100)
    }
  })
})
