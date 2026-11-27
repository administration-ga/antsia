// @vitest-environment edge-runtime
/**
 * ADR-0042, amendement A6 (CH-815) — « le bureau traite, l'administration décide » (fiche D5).
 *
 * Recette d'acceptation, écrite avant le code. Les décisions du réseau DIASPORA.GA quittent le
 * bureau de l'application des membres pour l'application d'administration :
 *
 *   · les fonctions propres à la tranche (recours montés au réseau, équipe, responsables, mesure du
 *     pilote) passent sous `networkAdminQuery` / `networkAdminMutation`, MÊMES noms, MÊMES arguments ;
 *   · les fonctions partagées par le moteur (`moderation/cases` : recours, équipes, réglages, mots
 *     bloqués ; `moderation/networkAppeals.paginate`) gardent leur comportement pour la racine et tout
 *     réseau sans application d'administration, refusent un réseau qui en a une, et ont un jumeau
 *     d'administration (`moderation/networkAdmin`) ;
 *   · le journal du réseau se lit par l'administration (`platform/audit.paginateNetworkAdminAudit`).
 *
 * Pour chaque porte : un administrateur en session de l'application des membres (par code, ou IDN
 * scellée pour diaspora.ga), un modérateur et un membre reçoivent le refus du non-membre, sans rien
 * écrire ; la session prouvée et journalisée de l'application d'administration passe, et chaque
 * décision entre au journal à titre de `network_admin`. Le modérateur garde son bureau quotidien.
 *
 * Amendement A3 (suite) : le PAYS d'une équipe (`moderationTeams.country`, ISO alpha-2, facultatif).
 * Le jumeau `createTeam` l'accepte (`country?`), `setTeamCountry` le pose, le change ou le retire,
 * chaque changement au journal (`moderation.team_country_set`) ; l'original `cases.createTeam` garde
 * ses arguments (un pays y est refusé par le validateur) et une équipe créée sans pays reste sans pays.
 * Données de fixture fictives.
 */
import { MODERATION_POLICY_DEFAULTS } from "@antsia/social-domain/moderationPolicy"
import { ConvexError } from "convex/values"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { api, internal } from "../_generated/api"
import type { Doc, Id } from "../_generated/dataModel"
import { SEED_CONFIRMATION } from "../seeds/foundations"
import { joinDeclaredDiasporaFixture, openNetworkFeatures, openTestNetworkAdminSession, testConvex } from "../test.setup"

type T = ReturnType<typeof testConvex>
type As = ReturnType<T["withIdentity"]>
type Member = { as: As; personId: Id<"persons"> }
type Role = Doc<"networkMemberships">["role"]

const NOW = Date.UTC(2026, 10, 23, 10)
const PAGE = { cursor: null, numItems: 20 }
const ALL = { kind: "all" as const }
const REASON = "Décision de l'administration du réseau (fixture)."
const MEMBERS_APP = "diaspora_ga"
/** Le refus du non-membre : celui que reçoit TOUT appel refusé du lot. */
const REFUSAL = { code: "notFound" }

const D = api.modules.diaspora.moderationDesk
const MEMBERSHIP = api.modules.diaspora.membership
const PILOT = api.modules.diaspora.pilotMetrics
const NA = api.modules.moderation.networkAdmin
const CASES = api.modules.moderation.cases
const APPEALS = api.modules.moderation.networkAppeals
const AUDIT = api.modules.platform.audit
const FEATURES = api.modules.networks.features

beforeEach(() => {
  vi.stubEnv("CONVEX_CLOUD_URL", "http://127.0.0.1:3210")
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

/** Les données du refus (`ConvexError`), ou `null` si l'appel passe. */
async function refusalOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise
  } catch (error) {
    return error instanceof ConvexError ? error.data : { unexpected: String(error) }
  }
  return null
}

/** Un membre DÉCLARÉ de DIASPORA.GA (IDN de garantie 2), au rôle de réseau demandé ; sa session est celle de l'application des membres. */
async function member(t: T, networkId: Id<"networks">, handle: string, role?: Role): Promise<Member> {
  const as = t.withIdentity({ subject: `a6-${handle}` })
  const personId = await as.mutation(api.modules.people.persons.ensureMyPerson, {})
  await as.mutation(api.modules.people.consents.recordConsent, { purpose: "social_profile", origin: "onboarding" })
  await as.mutation(api.modules.people.profile.publishMyProfile, { handle, displayName: handle })
  await t.run(async (ctx) => {
    await ctx.db.insert("identityLinks", { personId, provider: "idn", subject: `idn-${personId}`, loa: 2, nationality: "GA", linkedAt: NOW })
  })
  await joinDeclaredDiasporaFixture(as, { networkId, facet: { countryOfResidence: "FR" } })
  if (role) await setRole(t, networkId, personId, role)
  return { as, personId }
}

async function setRole(t: T, networkId: Id<"networks">, personId: Id<"persons">, role: Role) {
  await t.run(async (ctx) => {
    const row = await ctx.db.query("networkMemberships").withIndex("by_network_and_person", (q) => q.eq("networkId", networkId).eq("personId", personId)).unique()
    if (!row) throw new Error("Adhésion de fixture absente")
    await ctx.db.patch(row._id, { role })
  })
}

/** Un dossier d'équipe tranché par la modératrice, une sanction, et le recours de l'auteur monté au réseau ; un dossier ouvert du réseau. */
async function cases(t: T, networkId: Id<"networks">, people: { author: Member; reader: Member; moderator: Member }) {
  return await t.run(async (ctx) => {
    const teamId = await ctx.db.insert("moderationTeams", { networkId, name: "France (fixture)", active: true, createdAt: NOW })
    const postId = await ctx.db.insert("posts", {
      networkId, authorPersonId: people.author.personId, body: "Corps privé de fixture", audience: "public", visibility: "network", onRoot: false,
      status: "published", searchText: "corps prive de fixture", reach: "local", country: "FR", publishedAt: NOW, createdAt: NOW, updatedAt: NOW,
    })
    const target = { kind: "post" as const, id: postId }
    const decidedId = await ctx.db.insert("reports", {
      networkId, target, targetKind: "post", targetId: postId, ownerPersonId: people.author.personId, reporterPersonId: people.reader.personId,
      reason: "harassment", teamId, level: "team", status: "actioned", reviewedByPersonId: people.moderator.personId, reviewedAt: NOW,
      decisionReason: "Propos insultants confirmés.", createdAt: NOW, updatedAt: NOW,
    })
    await ctx.db.insert("sanctions", { networkId, reportId: decidedId, personId: people.author.personId, target, kind: "warning", status: "active", reason: "Propos insultants confirmés.", createdAt: NOW, updatedAt: NOW })
    const appealId = await ctx.db.insert("appeals", { networkId, reportId: decidedId, personId: people.author.personId, reason: "Je demande un réexamen.", level: "network", status: "open", createdAt: NOW, updatedAt: NOW })
    const openId = await ctx.db.insert("reports", {
      networkId, target, targetKind: "post", targetId: postId, ownerPersonId: people.author.personId, reporterPersonId: people.reader.personId,
      reason: "spam", level: "network", status: "open", createdAt: NOW + 1, updatedAt: NOW + 1,
    })
    return { teamId, appealId, openId }
  })
}

async function fixture() {
  const t = testConvex()
  const { root, testClosed } = await t.mutation(internal.seeds.foundations.run, { confirmNonProduction: SEED_CONFIRMATION })
  const { network } = await t.mutation(internal.modules.diaspora.seed.run, { confirmNonProduction: SEED_CONFIRMATION })
  await openNetworkFeatures(t, network)
  const author = await member(t, network, "auteur.a6")
  const reader = await member(t, network, "lectrice.a6")
  const moderator = await member(t, network, "moderatrice.a6", "network_moderator")
  const admin = await member(t, network, "admin.a6", "network_admin")
  const ids = await cases(t, network, { author, reader, moderator })
  // Les sessions : la session de l'application d'administration, prouvée et journalisée, et celles qui ne le sont pas.
  const adminApp = await openTestNetworkAdminSession(t, admin.as, admin.personId, network)
  const refused: Record<string, Member> = {
    "administrateur, session par code de l'application des membres": admin,
    "administrateur, session IDN de l'application des membres": { personId: admin.personId, as: await openTestNetworkAdminSession(t, admin.as, admin.personId, network, { application: MEMBERS_APP, logged: false }) },
    "modérateur, session de l'application des membres": moderator,
    "modérateur, session IDN de l'application d'administration": { personId: moderator.personId, as: await openTestNetworkAdminSession(t, moderator.as, moderator.personId, network, { logged: false }) },
    "membre, session de l'application des membres": reader,
    "membre, session IDN de l'application d'administration": { personId: reader.personId, as: await openTestNetworkAdminSession(t, reader.as, reader.personId, network, { logged: false }) },
  }
  return { t, root, testClosed, network, author, reader, moderator, admin, adminApp, refused, ...ids }
}

type Fixture = Awaited<ReturnType<typeof fixture>>

/** Les portes déménagées : en place (tranche) ou jumelles (moteur), pour une personne et sa session. */
function movedDoors(f: Fixture, who: Pick<Member, "personId">, as: As, networkId: Id<"networks"> = f.network) {
  const expectedPersonId = who.personId
  const { maxLinks, maxWrites, windowMs } = MODERATION_POLICY_DEFAULTS
  return {
    // Recours
    appealQueue: () => as.query(D.appealQueue, { networkId, expectedPersonId, zone: ALL, paginationOpts: PAGE }),
    reviewNetworkAppeal: () => as.mutation(NA.reviewNetworkAppeal, { networkId, appealId: f.appealId, overturn: false, reason: REASON }),
    // Équipe et responsables
    teamRoster: () => as.query(D.teamRoster, { networkId, expectedPersonId, teamId: f.teamId }),
    teamCandidate: () => as.query(D.teamCandidate, { networkId, expectedPersonId, handle: "@lectrice.a6" }),
    responsibles: () => as.query(D.responsibles, { networkId, expectedPersonId }),
    createTeam: () => as.mutation(NA.createTeam, { networkId, name: "Belgique (fixture)", reason: REASON }),
    setTeamMember: () => as.mutation(NA.setTeamMember, { networkId, teamId: f.teamId, personId: f.reader.personId, active: true, reason: REASON }),
    setTeamCountry: () => as.mutation(NA.setTeamCountry, { networkId, teamId: f.teamId, country: "FR", reason: REASON }),
    setResponsibleRole: () => as.mutation(MEMBERSHIP.setResponsibleRole, { networkId, personId: f.reader.personId, role: "network_moderator", reason: REASON }),
    // Règles
    policies: () => as.query(NA.policies, { networkId }),
    blockedTermsPage: () => as.query(NA.blockedTermsPage, { networkId, paginationOpts: PAGE }),
    setPolicy: () => as.mutation(NA.setPolicy, { networkId, surface: "diasporaJobOffer", preReview: true, maxLinks, maxWrites, windowMs, reason: REASON }),
    setBlockedTerm: () => as.mutation(NA.setBlockedTerm, { networkId, term: "Consulat", active: true, reason: REASON }),
    // Mesure
    pilotMetrics: () => as.query(PILOT.pilotMetrics, { networkId, days: 30 }),
    pilotMetricsAccess: () => as.query(PILOT.pilotMetricsAccess, { networkId }),
    // Journal ; la dernière décision de chaque module (section « Modules »)
    journal: () => as.query(AUDIT.paginateNetworkAdminAudit, { networkId, paginationOpts: PAGE }),
    lastDecisions: () => as.query(FEATURES.lastDecisions, { networkId }),
  }
}

/** Les fonctions partagées d'origine, appelées sur un réseau. */
function originalDoors(f: Fixture, as: As, networkId: Id<"networks">, teamId: Id<"moderationTeams">, appealId: Id<"appeals">) {
  const { maxLinks, maxWrites, windowMs } = MODERATION_POLICY_DEFAULTS
  return {
    reviewNetworkAppeal: () => as.mutation(CASES.reviewNetworkAppeal, { networkId, appealId, overturn: false, reason: REASON }),
    networkAppeals: () => as.query(APPEALS.paginate, { networkId, paginationOpts: PAGE }),
    createTeam: () => as.mutation(CASES.createTeam, { networkId, name: "Équipe de l'origine (fixture)", reason: REASON }),
    setTeamMember: () => as.mutation(CASES.setTeamMember, { networkId, teamId, personId: f.reader.personId, active: true, reason: REASON }),
    policies: () => as.query(CASES.policies, { networkId }),
    blockedTermsPage: () => as.query(CASES.blockedTermsPage, { networkId, paginationOpts: PAGE }),
    setPolicy: () => as.mutation(CASES.setPolicy, { networkId, surface: "post", preReview: false, maxLinks, maxWrites, windowMs, reason: REASON }),
    setBlockedTerm: () => as.mutation(CASES.setBlockedTerm, { networkId, term: "arnaque", active: true, reason: REASON }),
  }
}

/** Ce que les portes du lot écrivent dans le réseau : décisions et journal. */
async function writes(f: Fixture, networkId: Id<"networks"> = f.network) {
  return await f.t.run(async (ctx) => ({
    audit: (await ctx.db.query("engineAudit").withIndex("by_network_at", (q) => q.eq("networkId", networkId)).take(200)).length,
    teams: (await ctx.db.query("moderationTeams").withIndex("by_network_active", (q) => q.eq("networkId", networkId)).take(20)).map((row) => [row.name, row.country ?? null]),
    members: (await ctx.db.query("moderationTeamMembers").withIndex("by_team_person", (q) => q.eq("teamId", f.teamId)).take(20)).map((row) => [row.personId, row.active]),
    policies: (await ctx.db.query("moderationPolicies").withIndex("by_network_surface", (q) => q.eq("networkId", networkId)).take(20)).length,
    terms: (await ctx.db.query("blockedTerms").withIndex("by_network_active", (q) => q.eq("networkId", networkId)).take(20)).length,
    appeal: (await ctx.db.get(f.appealId))?.status ?? null,
    readerRole: (await ctx.db.query("networkMemberships").withIndex("by_network_and_person", (q) => q.eq("networkId", networkId).eq("personId", f.reader.personId)).unique())?.role ?? null,
  }))
}

/** Les décisions du réseau inscrites au journal par les portes jumelles et déménagées. */
async function decisions(f: Fixture) {
  const actions = new Set(["moderation.appeal_decide", "moderation.team_create", "moderation.team_member_set", "membership.role_set", "moderation.policy_set", "moderation.term_set"])
  return await f.t.run(async (ctx) =>
    (await ctx.db.query("engineAudit").withIndex("by_network_at", (q) => q.eq("networkId", f.network)).take(200))
      .filter((row) => actions.has(row.action))
      .map((row) => ({ action: row.action, capacity: row.capacity, actorPersonId: row.actorPersonId, reason: row.details?.reason })),
  )
}

describe("A6 — les décisions du réseau ne se prennent plus depuis l'application des membres", () => {
  it("toute porte déménagée refuse l'administrateur en session de l'application des membres, le modérateur et le membre, sans rien écrire", async () => {
    const f = await fixture()
    const before = await writes(f)
    for (const [label, who] of Object.entries(f.refused)) {
      for (const [door, call] of Object.entries(movedDoors(f, who, who.as))) expect(await refusalOf(call()), `${label} — ${door}`).toEqual(REFUSAL)
    }
    expect(await writes(f)).toEqual(before)
  })

  it("la session prouvée et journalisée de l'application d'administration ouvre chaque porte ; chaque décision entre au journal à titre de network_admin", async () => {
    const f = await fixture()
    const door = movedDoors(f, f.admin, f.adminApp)
    // Recours
    expect((await door.appealQueue()).items).toEqual([expect.objectContaining({ appealId: f.appealId, country: "FR", party: null })])
    expect(await door.reviewNetworkAppeal()).toBeNull()
    expect((await door.appealQueue()).items).toEqual([])
    // Équipe et responsables
    expect(await door.teamCandidate()).toEqual({ personId: f.reader.personId, handle: "lectrice.a6", displayName: "lectrice.a6" })
    expect(await door.setTeamMember()).toBeNull()
    expect(await door.teamRoster()).toEqual({ members: [{ personId: f.reader.personId, handle: "lectrice.a6", displayName: "lectrice.a6", inNetwork: true, isMe: false }], more: false })
    expect(await door.createTeam()).toEqual({ teamId: expect.any(String) })
    expect(await door.setResponsibleRole()).toEqual({ role: "network_moderator", changed: true })
    const responsibles = (await door.responsibles()).members.map((row) => [row.personId, row.role])
    expect(responsibles[0]).toEqual([f.admin.personId, "network_admin"])
    expect(responsibles).toHaveLength(3)
    expect(responsibles).toEqual(expect.arrayContaining([[f.moderator.personId, "network_moderator"], [f.reader.personId, "network_moderator"]]))
    // Règles
    expect((await door.policies()).defaults).toEqual(MODERATION_POLICY_DEFAULTS)
    expect(await door.setPolicy()).toEqual({ policyId: expect.any(String) })
    expect(await door.setBlockedTerm()).toEqual({ termId: expect.any(String) })
    expect((await door.policies()).surfaces.find((row) => row.surface === "diasporaJobOffer")?.policy).toMatchObject({ preReview: true })
    expect((await door.blockedTermsPage()).page.map((row) => row.term)).toEqual(["consulat"])
    // Mesure : avant tout passage, la mesure se dit non faite.
    expect(await door.pilotMetricsAccess()).toEqual({ allowed: true })
    expect(await door.pilotMetrics()).toMatchObject({ measured: false, country: null, days: 30 })
    // Modules : la recette les a ouverts sans décision au journal — aucun n'a de dernière décision à montrer.
    expect(await door.lastDecisions()).toEqual([])

    const journal = await decisions(f)
    expect(journal.map((row) => row.action).sort()).toEqual(["membership.role_set", "moderation.appeal_decide", "moderation.policy_set", "moderation.team_create", "moderation.team_member_set", "moderation.term_set"])
    expect(journal.every((row) => row.capacity === "network_admin" && row.actorPersonId === f.admin.personId && row.reason === REASON)).toBe(true)
  })

  it("le journal du réseau se lit par l'administration, filtré par action : acteur, qualité, action, motif, sujet, date", async () => {
    const f = await fixture()
    const door = movedDoors(f, f.admin, f.adminApp)
    const { teamId } = await door.createTeam()
    await door.setBlockedTerm()
    const all = await door.journal()
    expect(all.page.map((row) => row.action)).toEqual(expect.arrayContaining(["moderation.team_create", "moderation.term_set", "network.admin_access"]))
    const created = await f.adminApp.query(AUDIT.paginateNetworkAdminAudit, { networkId: f.network, action: "moderation.team_create", paginationOpts: PAGE })
    expect(created.page).toEqual([expect.objectContaining({
      action: "moderation.team_create",
      capacity: "network_admin",
      actor: { personId: f.admin.personId, displayName: "admin.a6", handle: "admin.a6" },
      reason: REASON,
      subject: { table: "moderationTeams", id: teamId },
      at: NOW,
    })])
    // Un filtre qui ne trouve rien rend une fenêtre vide, sans erreur.
    expect((await f.adminApp.query(AUDIT.paginateNetworkAdminAudit, { networkId: f.network, action: "moderation.appeal_decide", paginationOpts: PAGE })).page).toEqual([])
  })

  it("la mesure reste gardée par sa clé : fermée, l'administration reçoit le refus indistinct ; rouverte, elle lit", async () => {
    const f = await fixture()
    const close = async (enabled: boolean) => await f.t.run(async (ctx) => {
      const row = await ctx.db.query("networkFeatures").withIndex("by_network_feature", (q) => q.eq("networkId", f.network).eq("feature", "pilotMetrics")).first()
      if (row) await ctx.db.patch(row._id, { enabled })
    })
    const door = movedDoors(f, f.admin, f.adminApp)
    await close(false)
    expect(await refusalOf(door.pilotMetricsAccess())).toEqual(REFUSAL)
    expect(await refusalOf(door.pilotMetrics())).toEqual(REFUSAL)
    await close(true)
    expect(await door.pilotMetricsAccess()).toEqual({ allowed: true })
  })

  it("une session d'administration de DIASPORA.GA ne décide rien ailleurs : racine et autre réseau, refus indistinct", async () => {
    const f = await fixture()
    await setRole(f.t, f.root, f.admin.personId, "network_admin")
    for (const networkId of [f.root, f.testClosed]) {
      for (const [door, call] of Object.entries(movedDoors(f, f.admin, f.adminApp, networkId))) expect(await refusalOf(call()), `${networkId} — ${door}`).toEqual(REFUSAL)
    }
  })
})

describe("A6 — les fonctions partagées du moteur : refusées pour un réseau administré, inchangées ailleurs", () => {
  it("sur DIASPORA.GA, les originaux refusent l'administrateur, quelle que soit sa session, sans rien écrire", async () => {
    const f = await fixture()
    const before = await writes(f)
    for (const [label, as] of [["application des membres", f.admin.as], ["application d'administration", f.adminApp]] as const) {
      for (const [door, call] of Object.entries(originalDoors(f, as, f.network, f.teamId, f.appealId))) expect(await refusalOf(call()), `${label} — ${door}`).toEqual(REFUSAL)
    }
    expect(await writes(f)).toEqual(before)
  })

  it("à la racine, l'administrateur du réseau décide par les originaux comme avant, en session ordinaire", async () => {
    const f = await fixture()
    await setRole(f.t, f.root, f.admin.personId, "network_admin")
    const team = await f.admin.as.mutation(CASES.createTeam, { networkId: f.root, name: "Publications (fixture)", scope: "post", reason: REASON })
    const root = originalDoors(f, f.admin.as, f.root, team.teamId, f.appealId)
    expect(await root.setTeamMember()).toBeNull()
    expect((await root.policies()).defaults).toEqual(MODERATION_POLICY_DEFAULTS)
    expect(await root.setPolicy()).toEqual({ policyId: expect.any(String) })
    expect(await root.setBlockedTerm()).toEqual({ termId: expect.any(String) })
    expect((await root.blockedTermsPage()).page.map((row) => row.term)).toEqual(["arnaque"])
    expect(await root.networkAppeals()).toMatchObject({ page: [], isDone: true })
    const audit = await f.t.run(async (ctx) => (await ctx.db.query("engineAudit").withIndex("by_network_at", (q) => q.eq("networkId", f.root)).take(50)).map((row) => [row.action, row.capacity]))
    expect(audit).toEqual(expect.arrayContaining([["moderation.team_create", "network_admin"], ["moderation.team_member_set", "network_admin"], ["moderation.policy_set", "network_admin"], ["moderation.term_set", "network_admin"]]))
  })
})

describe("A6 — le bureau de diaspora.ga garde le travail quotidien des modérateurs", () => {
  it("la modératrice lit son bureau, sa file, un dossier, la relecture et les pages à vérifier, et tranche un dossier", async () => {
    const f = await fixture()
    const expectedPersonId = f.moderator.personId
    const as = f.moderator.as
    expect(await as.query(D.myDesk, { networkId: f.network, expectedPersonId })).toMatchObject({ role: "network_moderator", networkWide: true })
    expect((await as.query(D.queue, { networkId: f.network, expectedPersonId, zone: ALL, paginationOpts: PAGE })).items.map((row) => row.reportId)).toEqual([f.openId])
    expect((await as.query(D.caseDetail, { networkId: f.network, expectedPersonId, reportId: f.openId })).case).toMatchObject({ reportId: f.openId, country: "FR" })
    expect(await as.query(D.pendingQueue, { networkId: f.network, expectedPersonId, zone: ALL, paginationOpts: PAGE })).toMatchObject({ items: [] })
    expect(await as.query(D.pageClaimQueue, { networkId: f.network, expectedPersonId, zone: ALL, paginationOpts: PAGE })).toMatchObject({ items: [] })
    expect(await as.mutation(CASES.decide, { networkId: f.network, reportId: f.openId, decision: "dismissed", reason: "Signalement non fondé après examen.", sanctions: [] })).toEqual({ status: "dismissed" })
  })

  it("l'administrateur, depuis l'application des membres, garde aussi le bureau quotidien", async () => {
    const f = await fixture()
    const expectedPersonId = f.admin.personId
    expect(await f.admin.as.query(D.myDesk, { networkId: f.network, expectedPersonId })).toMatchObject({ role: "network_admin", networkWide: true })
    expect((await f.admin.as.query(D.queue, { networkId: f.network, expectedPersonId, zone: ALL, paginationOpts: PAGE })).items.map((row) => row.reportId)).toEqual([f.openId])
  })
})

/** Les lignes `moderation.team_*` du journal d'un réseau, dans l'ordre d'écriture. */
async function teamDecisions(f: Fixture, networkId: Id<"networks"> = f.network) {
  return await f.t.run(async (ctx) =>
    (await ctx.db.query("engineAudit").withIndex("by_network_at", (q) => q.eq("networkId", networkId)).take(200))
      .filter((row) => row.action === "moderation.team_create" || row.action === "moderation.team_country_set")
      .map((row) => ({ action: row.action, capacity: row.capacity, actorPersonId: row.actorPersonId, subject: { table: row.subjectTable, id: row.subjectId }, details: row.details })),
  )
}

async function teamRow(f: Fixture, teamId: Id<"moderationTeams">) {
  const row = await f.t.run(async (ctx) => await ctx.db.get(teamId))
  if (!row) throw new Error("Équipe de fixture absente")
  return row
}

describe("A3 (suite) — le pays d'une équipe de modération, par l'administration du réseau", () => {
  it("l'original cases.createTeam garde ses arguments : un pays y est refusé ; une équipe créée sans pays reste sans pays, au journal inchangé", async () => {
    const f = await fixture()
    await setRole(f.t, f.root, f.admin.personId, "network_admin")
    const before = await writes(f, f.root)
    await expect(f.admin.as.mutation(CASES.createTeam, { networkId: f.root, name: "Publications (fixture)", scope: "post", country: "FR", reason: REASON } as never)).rejects.toThrow()
    expect(await writes(f, f.root)).toEqual(before)
    const { teamId } = await f.admin.as.mutation(CASES.createTeam, { networkId: f.root, name: "Publications (fixture)", scope: "post", reason: REASON })
    const row = await teamRow(f, teamId)
    expect(Object.keys(row)).not.toContain("country")
    expect(await teamDecisions(f, f.root)).toEqual([
      { action: "moderation.team_create", capacity: "network_admin", actorPersonId: f.admin.personId, subject: { table: "moderationTeams", id: teamId }, details: { reason: REASON, scope: "post" } },
    ])
    // Le jumeau, sans pays : la même équipe, le même journal, aucun champ de plus.
    const twin = await f.adminApp.mutation(NA.createTeam, { networkId: f.network, name: "Sans pays (fixture)", reason: REASON })
    expect(Object.keys(await teamRow(f, twin.teamId))).not.toContain("country")
    expect((await teamDecisions(f)).map((row) => row.details)).toEqual([{ reason: REASON, scope: null }])
  })

  it("le jumeau createTeam pose le pays d'une équipe et l'inscrit au journal ; un pays mal formé est refusé sans rien écrire", async () => {
    const f = await fixture()
    const { teamId } = await f.adminApp.mutation(NA.createTeam, { networkId: f.network, name: "Belgique (fixture)", country: "BE", reason: REASON })
    expect((await teamRow(f, teamId)).country).toBe("BE")
    expect(await teamDecisions(f)).toEqual([
      { action: "moderation.team_create", capacity: "network_admin", actorPersonId: f.admin.personId, subject: { table: "moderationTeams", id: teamId }, details: { reason: REASON, scope: null, country: "BE" } },
    ])
    const before = await writes(f)
    for (const country of ["be", "BEL", "B", "", "B1"]) {
      expect(await refusalOf(f.adminApp.mutation(NA.createTeam, { networkId: f.network, name: "Mal formé (fixture)", country, reason: REASON })), country).toEqual({ code: "invalidArgument", field: "country" })
    }
    expect(await writes(f)).toEqual(before)
  })

  it("setTeamCountry pose, change puis retire le pays ; chaque changement entre au journal à titre de network_admin ; sans changement, rien n'est écrit", async () => {
    const f = await fixture()
    expect(await f.adminApp.mutation(NA.setTeamCountry, { networkId: f.network, teamId: f.teamId, country: "FR", reason: REASON })).toBeNull()
    expect((await teamRow(f, f.teamId)).country).toBe("FR")
    const unchanged = await writes(f)
    expect(await f.adminApp.mutation(NA.setTeamCountry, { networkId: f.network, teamId: f.teamId, country: "FR", reason: REASON })).toBeNull()
    expect(await writes(f)).toEqual(unchanged)
    expect(await f.adminApp.mutation(NA.setTeamCountry, { networkId: f.network, teamId: f.teamId, country: "BE", reason: REASON })).toBeNull()
    expect(await f.adminApp.mutation(NA.setTeamCountry, { networkId: f.network, teamId: f.teamId, country: null, reason: REASON })).toBeNull()
    expect(Object.keys(await teamRow(f, f.teamId))).not.toContain("country")
    const subject = { table: "moderationTeams", id: f.teamId }
    expect(await teamDecisions(f)).toEqual([
      { action: "moderation.team_country_set", capacity: "network_admin", actorPersonId: f.admin.personId, subject, details: { reason: REASON, country: "FR", previousCountry: null } },
      { action: "moderation.team_country_set", capacity: "network_admin", actorPersonId: f.admin.personId, subject, details: { reason: REASON, country: "BE", previousCountry: "FR" } },
      { action: "moderation.team_country_set", capacity: "network_admin", actorPersonId: f.admin.personId, subject, details: { reason: REASON, country: null, previousCountry: "BE" } },
    ])
  })

  it("setTeamCountry refuse l'équipe d'un autre réseau, une équipe retirée, un pays mal formé et un motif trop court, sans rien écrire", async () => {
    const f = await fixture()
    const { rootTeam, retired } = await f.t.run(async (ctx) => ({
      rootTeam: await ctx.db.insert("moderationTeams", { networkId: f.root, name: "Racine (fixture)", active: true, createdAt: NOW }),
      retired: await ctx.db.insert("moderationTeams", { networkId: f.network, name: "Retirée (fixture)", active: false, createdAt: NOW }),
    }))
    const before = await writes(f)
    const call = (teamId: Id<"moderationTeams">, country: string | null, reason = REASON) => f.adminApp.mutation(NA.setTeamCountry, { networkId: f.network, teamId, country, reason })
    expect(await refusalOf(call(rootTeam, "FR"))).toEqual(REFUSAL)
    expect(await refusalOf(call(retired, "FR"))).toEqual(REFUSAL)
    for (const country of ["fr", "FRA", "", "F1"]) expect(await refusalOf(call(f.teamId, country)), country).toEqual({ code: "invalidArgument", field: "country" })
    expect(await refusalOf(call(f.teamId, "FR", "ab"))).toMatchObject({ code: "invalidArgument" })
    expect(await writes(f)).toEqual(before)
    expect(Object.keys(await teamRow(f, rootTeam))).not.toContain("country")
    expect(Object.keys(await teamRow(f, retired))).not.toContain("country")
  })

  it("le bureau des membres montre le pays de chaque équipe (null sans pays)", async () => {
    const f = await fixture()
    const { teamId } = await f.adminApp.mutation(NA.createTeam, { networkId: f.network, name: "Canada (fixture)", country: "CA", reason: REASON })
    const desk = await f.admin.as.query(D.myDesk, { networkId: f.network, expectedPersonId: f.admin.personId })
    expect(desk?.teams.map((row) => [row.teamId, row.country])).toEqual(expect.arrayContaining([[f.teamId, null], [teamId, "CA"]]))
  })
})
