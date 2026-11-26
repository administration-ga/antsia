// @vitest-environment edge-runtime
/**
 * MD-01 et LX-03 — les responsables de DIASPORA.GA, SANS la porte de démonstration : la
 * console du moteur nomme le premier administrateur (`platform/networkRoles`) ; celui-ci
 * nomme, change et retire les responsables dans la tranche (`membership.setResponsibleRole`),
 * motif à l'appui, par l'aide du moteur ; le rôle ouvre ou ferme la file au geste suivant ; la
 * liste des responsables ne montre que des profils publiés.
 * CH-815 A6 (ADR-0042) : nommer, lire les responsables, les recours et la mesure du pilote se fait
 * depuis l'application d'administration, en session prouvée et journalisée ; la mesure n'est plus
 * lue par la modération. La file reste au bureau des membres. Données de fixture fictives.
 */
import { engineErrorCode, engineErrorRule } from "@antsia/social-contracts/errors"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { api, internal } from "../../_generated/api"
import type { Doc, Id } from "../../_generated/dataModel"
import { SEED_CONFIRMATION } from "../../seeds/foundations"
import { joinDeclaredDiasporaFixture, createTestOperatorProof, openNetworkFeatures, openTestNetworkAdminSession, testConvex } from "../../test.setup"

type T = ReturnType<typeof testConvex>
type As = ReturnType<T["withIdentity"]>
type Member = { as: As; personId: Id<"persons"> }

const M = api.modules.diaspora.membership
const D = api.modules.diaspora.moderationDesk
const PILOT = api.modules.diaspora.pilotMetrics
const CONSOLE = api.modules.platform.networkRoles
const NOW = Date.UTC(2026, 10, 10, 9)
const PAGE = { cursor: null, numItems: 20 }
const ALL = { kind: "all" as const }
const REASON = "Nomination décidée par l'administration du réseau (fixture)."

beforeEach(() => {
  vi.stubEnv("CONVEX_CLOUD_URL", "http://127.0.0.1:3210")
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

async function codeOf(promise: Promise<unknown>): Promise<string | null> {
  try {
    await promise
    return null
  } catch (error) {
    return engineErrorRule(error)?.rule ?? engineErrorCode(error)
  }
}

/** Une personne au profil publié ; membre de DIASPORA.GA par le vrai chemin d'entrée, DÉCLARÉE si elle a une IDN. */
async function member(t: T, networkId: Id<"networks">, handle: string, displayName: string, options: { idn?: boolean } = {}): Promise<Member> {
  const as = t.withIdentity({ subject: `responsables-${handle}` })
  const personId = await as.mutation(api.modules.people.persons.ensureMyPerson, {})
  await as.mutation(api.modules.people.consents.recordConsent, { purpose: "social_profile", origin: "onboarding" })
  await as.mutation(api.modules.people.profile.publishMyProfile, { handle, displayName })
  if (options.idn !== false) {
    await t.run(async (ctx) => {
      await ctx.db.insert("identityLinks", { personId, provider: "idn", subject: `idn-${personId}`, loa: 1, nationality: "GA", linkedAt: NOW })
    })
  }
  await joinDeclaredDiasporaFixture(as, { networkId, facet: { countryOfResidence: "FR" } })
  return { as, personId }
}

/** Un administrateur de la PLATEFORME, membre de la racine, avec sa preuve d'opérateur. */
async function platformAdmin(t: T, root: Id<"networks">): Promise<Member> {
  const as = t.withIdentity({ subject: "responsables-operateur" })
  const personId = await as.mutation(api.modules.people.persons.ensureMyPerson, {})
  await t.run(async (ctx) => {
    await ctx.db.patch(personId, { handle: "operateur.fixture", displayName: "Opérateur FIXTURE", publishedAt: NOW })
    await ctx.db.insert("networkMemberships", { networkId: root, personId, status: "declaree", role: "member", joinedAt: NOW, statusChangedAt: NOW })
    await ctx.db.insert("operators", { personId, role: "platform_admin", grantedAt: NOW })
  })
  await createTestOperatorProof(t, as, personId)
  return { as, personId }
}

/** DIASPORA.GA réelle (graine du réseau), un opérateur, et le premier administrateur nommé PAR LA CONSOLE. */
async function fixture() {
  const t = testConvex()
  const { root } = await t.mutation(internal.seeds.foundations.run, { confirmNonProduction: SEED_CONFIRMATION })
  const { network } = await t.mutation(internal.modules.diaspora.seed.run, { confirmNonProduction: SEED_CONFIRMATION })
  await openNetworkFeatures(t, network)
  const operator = await platformAdmin(t, root)
  const admin = await member(t, network, "awa.fixture", "Awa OGOOUÉ")
  const moderator = await member(t, network, "ruth.fixture", "Ruth NZÉ")
  const plain = await member(t, network, "jean.fixture", "Jean MBA")
  expect(await operator.as.mutation(CONSOLE.setNetworkRole, { networkId: network, personId: admin.personId, role: "network_admin", reason: "Premier administrateur du réseau (fixture)." })).toEqual({ role: "network_admin", changed: true })
  return { t, root, network, operator, admin, moderator, plain, adminSessions: new Map<Id<"persons">, As>() }
}
type Fixture = Awaited<ReturnType<typeof fixture>>

/**
 * CH-815 A6 — la session de l'application d'administration de la personne, ouverte une fois par le
 * retour IDN (preuve scellée), et dont l'accès est journalisé dès qu'elle administre le réseau
 * (`recordAccess`, idempotent ; refusé tant qu'elle ne l'administre pas). La MÊME session sert
 * avant et après un changement de rôle : le rôle se relit au geste suivant.
 */
async function adminApp(f: Fixture, who: Member): Promise<As> {
  let as = f.adminSessions.get(who.personId)
  if (!as) {
    as = await openTestNetworkAdminSession(f.t, who.as, who.personId, f.network, { logged: false })
    f.adminSessions.set(who.personId, as)
  }
  const refusal = await codeOf(as.mutation(api.modules.networks.adminAccess.recordAccess, { networkId: f.network }))
  if (refusal !== null && refusal !== "notFound") throw new Error(`Journalisation de l'accès refusée : ${refusal}`)
  return as
}

async function name(f: Fixture, who: Member, role: Doc<"networkMemberships">["role"], by: Member = f.admin, reason = REASON) {
  return (await adminApp(f, by)).mutation(M.setResponsibleRole, { networkId: f.network, personId: who.personId, role, reason })
}

const queueOf = (f: Fixture, who: Member) => who.as.query(D.queue, { networkId: f.network, expectedPersonId: who.personId, zone: ALL, paginationOpts: PAGE })
const appealsOf = async (f: Fixture, who: Member) => (await adminApp(f, who)).query(D.appealQueue, { networkId: f.network, expectedPersonId: who.personId, zone: ALL, paginationOpts: PAGE })
const pilotOf = async (f: Fixture, who: Member) => (await adminApp(f, who)).query(PILOT.pilotMetrics, { networkId: f.network, days: 30 })
const pilotAccessOf = async (f: Fixture, who: Member) => (await adminApp(f, who)).query(PILOT.pilotMetricsAccess, { networkId: f.network })
const responsiblesOf = async (f: Fixture, who: Member, expected: Member = who) => (await adminApp(f, who)).query(D.responsibles, { networkId: f.network, expectedPersonId: expected.personId })

async function roleOf(t: T, networkId: Id<"networks">, personId: Id<"persons">) {
  return await t.run(async (ctx) => (await ctx.db.query("networkMemberships").withIndex("by_network_and_person", (q) => q.eq("networkId", networkId).eq("personId", personId)).unique())?.role ?? null)
}

async function roleJournal(t: T) {
  return (await t.run(async (ctx) => await ctx.db.query("engineAudit").withIndex("by_at").take(200))).filter((row) => row.action === "membership.role_set")
}

describe("MD-01 — nommer les responsables du réseau, sans la porte de démonstration", () => {
  it("l'administrateur nommé par la console nomme une modératrice : elle lit toute la file ; la mesure et les recours restent à l'administration ; le retrait lui ferme la file au geste suivant", async () => {
    const f = await fixture()
    expect(await codeOf(queueOf(f, f.moderator))).toBe("notFound")
    expect(await codeOf(pilotAccessOf(f, f.moderator))).toBe("notFound")

    expect(await name(f, f.moderator, "network_moderator")).toEqual({ role: "network_moderator", changed: true })
    expect(await f.moderator.as.query(D.myDesk, { networkId: f.network, expectedPersonId: f.moderator.personId })).toMatchObject({ role: "network_moderator", networkWide: true, canReviewAppeals: false, canManageTeams: false })
    expect(await queueOf(f, f.moderator)).toMatchObject({ items: [], isDone: true })
    // CH-815 A6 : la mesure du pilote et les recours se lisent par l'administration du réseau seule, même en session prouvée.
    expect(await codeOf(pilotAccessOf(f, f.moderator))).toBe("notFound")
    expect(await codeOf(pilotOf(f, f.moderator))).toBe("notFound")
    expect(await codeOf(appealsOf(f, f.moderator))).toBe("notFound")

    expect(await name(f, f.moderator, "member")).toEqual({ role: "member", changed: true })
    expect(await f.moderator.as.query(D.myDesk, { networkId: f.network, expectedPersonId: f.moderator.personId })).toBeNull()
    expect(await codeOf(queueOf(f, f.moderator))).toBe("notFound")
    expect(await codeOf(pilotOf(f, f.moderator))).toBe("notFound")

    const journal = await roleJournal(f.t)
    expect(journal.map((row) => [row.capacity, row.actorPersonId, row.subjectId, row.details?.from, row.details?.to])).toEqual([
      ["platform_admin", f.operator.personId, f.admin.personId, "member", "network_admin"],
      ["network_admin", f.admin.personId, f.moderator.personId, "member", "network_moderator"],
      ["network_admin", f.admin.personId, f.moderator.personId, "network_moderator", "member"],
    ])
    expect(journal[1]?.details?.reason).toBe(REASON)
    expect(journal.every((row) => row.networkId === f.network)).toBe(true)
  })

  it("refus indistinct pour qui n'administre pas le réseau, avant tout jugement des arguments ; rien n'est écrit", async () => {
    const f = await fixture()
    await name(f, f.moderator, "network_moderator")
    const before = (await roleJournal(f.t)).length
    expect(await codeOf(name(f, f.plain, "network_admin", f.plain))).toBe("notFound")
    expect(await codeOf(name(f, f.plain, "network_moderator", f.plain, "court"))).toBe("notFound")
    expect(await codeOf(name(f, f.plain, "network_moderator", f.moderator))).toBe("notFound")
    expect(await codeOf(name(f, f.moderator, "member", f.moderator))).toBe("notFound")
    // Un autre réseau que DIASPORA.GA : la tranche ne gouverne que le sien.
    expect(await codeOf((await adminApp(f, f.admin)).mutation(M.setResponsibleRole, { networkId: f.root, personId: f.plain.personId, role: "network_moderator", reason: REASON }))).toBe("notFound")
    // CH-815 A6 : depuis le bureau des membres, l'administrateur lui-même ne nomme plus.
    expect(await codeOf(f.admin.as.mutation(M.setResponsibleRole, { networkId: f.network, personId: f.plain.personId, role: "network_moderator", reason: REASON }))).toBe("notFound")
    expect(await roleOf(f.t, f.network, f.plain.personId)).toBe("member")
    expect(await roleOf(f.t, f.network, f.moderator.personId)).toBe("network_moderator")
    expect(await roleJournal(f.t)).toHaveLength(before)
  })

  it("motif exigé ; ni adhésion créée ni rôle confié hors d'une adhésion active « déclarée » au moins ; un rôle déjà posé n'écrit rien", async () => {
    const f = await fixture()
    expect(await codeOf(name(f, f.moderator, "network_moderator", f.admin, "  court  "))).toBe("DECISION_REASON_LENGTH")
    // Une personne sans adhésion à DIASPORA.GA : aucune adhésion n'est créée.
    const outsiderId = await f.t.withIdentity({ subject: "responsables-hors-reseau" }).mutation(api.modules.people.persons.ensureMyPerson, {})
    expect(await codeOf((await adminApp(f, f.admin)).mutation(M.setResponsibleRole, { networkId: f.network, personId: outsiderId, role: "network_moderator", reason: REASON }))).toBe("notFound")
    expect(await roleOf(f.t, f.network, outsiderId)).toBeNull()
    // Une adhésion EN ATTENTE (aucune preuve) ne reçoit aucun rôle.
    const pending = await member(f.t, f.network, "attente.fixture", "Paul ATTENTE", { idn: false })
    expect(await codeOf(name(f, pending, "network_moderator"))).toBe("notFound")
    expect(await roleOf(f.t, f.network, pending.personId)).toBe("member")

    expect(await name(f, f.moderator, "network_moderator")).toEqual({ role: "network_moderator", changed: true })
    const before = (await roleJournal(f.t)).length
    expect(await name(f, f.moderator, "network_moderator")).toEqual({ role: "network_moderator", changed: false })
    expect(await roleJournal(f.t)).toHaveLength(before)
  })

  it("le dernier administrateur actif reste ; à deux, l'un se retire et perd l'administration au geste suivant", async () => {
    const f = await fixture()
    expect(await codeOf(name(f, f.admin, "member"))).toBe("NETWORK_LAST_ADMIN")
    expect(await codeOf(name(f, f.admin, "network_moderator"))).toBe("NETWORK_LAST_ADMIN")
    expect(await roleOf(f.t, f.network, f.admin.personId)).toBe("network_admin")

    expect(await name(f, f.plain, "network_admin")).toEqual({ role: "network_admin", changed: true })
    expect(await name(f, f.admin, "member")).toEqual({ role: "member", changed: true })
    expect(await codeOf(responsiblesOf(f, f.admin))).toBe("notFound")
    expect(await codeOf(name(f, f.moderator, "network_moderator"))).toBe("notFound")
    // Le nouvel administrateur est désormais le dernier : il ne se retire pas.
    expect(await codeOf(name(f, f.plain, "member", f.plain))).toBe("NETWORK_LAST_ADMIN")
  })

  it("le dernier administrateur actif ne quitte pas DIASPORA.GA : refus avant toute écriture ; à deux, l'un part", async () => {
    const f = await fixture()
    const statusOf = async (who: Member) =>
      await f.t.run(async (ctx) => (await ctx.db.query("networkMemberships").withIndex("by_network_and_person", (q) => q.eq("networkId", f.network).eq("personId", who.personId)).unique())?.status ?? null)
    const before = await statusOf(f.admin)
    expect(await codeOf(f.admin.as.mutation(M.leaveDiasporaGa, { networkId: f.network }))).toBe("NETWORK_LAST_ADMIN")
    expect(await statusOf(f.admin)).toBe(before)
    expect(await roleOf(f.t, f.network, f.admin.personId)).toBe("network_admin")

    expect(await name(f, f.plain, "network_admin")).toEqual({ role: "network_admin", changed: true })
    expect(await f.admin.as.mutation(M.leaveDiasporaGa, { networkId: f.network })).toBeNull()
    expect(await statusOf(f.admin)).toBe("partie")
    expect(await roleOf(f.t, f.network, f.admin.personId)).toBe("member")
    // Le remplaçant est désormais le dernier : il ne part pas à son tour.
    expect(await codeOf(f.plain.as.mutation(M.leaveDiasporaGa, { networkId: f.network }))).toBe("NETWORK_LAST_ADMIN")
  })
})

describe("LX-03 — lecteurs du tableau du pilote et de la file des recours", () => {
  it("un administrateur nommé ouvre la mesure et la file des recours (application d'administration) ; retiré, il reçoit le refus indistinct", async () => {
    const f = await fixture()
    expect(await codeOf(pilotOf(f, f.plain))).toBe("notFound")
    expect(await codeOf(appealsOf(f, f.plain))).toBe("notFound")

    await name(f, f.plain, "network_admin")
    expect(await pilotAccessOf(f, f.plain)).toEqual({ allowed: true })
    expect(await codeOf(pilotOf(f, f.plain))).toBeNull()
    expect(await appealsOf(f, f.plain)).toMatchObject({ items: [], isDone: true })

    await name(f, f.plain, "member")
    expect(await codeOf(pilotAccessOf(f, f.plain))).toBe("notFound")
    expect(await codeOf(pilotOf(f, f.plain))).toBe("notFound")
    expect(await codeOf(appealsOf(f, f.plain))).toBe("notFound")
  })
})

describe("MD-01 — la liste des responsables", () => {
  it("administration puis modération, par le profil publié seul ; réservée à l'administration du réseau", async () => {
    const f = await fixture()
    await name(f, f.moderator, "network_moderator")
    expect(await responsiblesOf(f, f.admin)).toEqual({
      members: [
        { personId: f.admin.personId, role: "network_admin", handle: "awa.fixture", displayName: "Awa OGOOUÉ", active: true, isMe: true },
        { personId: f.moderator.personId, role: "network_moderator", handle: "ruth.fixture", displayName: "Ruth NZÉ", active: true, isMe: false },
      ],
      more: false,
    })
    expect(await codeOf(responsiblesOf(f, f.moderator))).toBe("notFound")
    expect(await codeOf(responsiblesOf(f, f.plain))).toBe("notFound")
    expect(await codeOf(responsiblesOf(f, f.admin, f.plain))).toBe("notFound")
  })

  it("une adhésion suspendue garde le rôle sans le faire valoir ; un départ du réseau le retire", async () => {
    const f = await fixture()
    await name(f, f.moderator, "network_moderator")
    await name(f, f.plain, "network_moderator")
    await f.t.run(async (ctx) => {
      const row = await ctx.db.query("networkMemberships").withIndex("by_network_and_person", (q) => q.eq("networkId", f.network).eq("personId", f.moderator.personId)).unique()
      if (row) await ctx.db.patch(row._id, { status: "suspendue" })
    })
    await f.plain.as.mutation(M.leaveDiasporaGa, { networkId: f.network })
    const list = await responsiblesOf(f, f.admin)
    expect(list.members.map((row) => [row.personId, row.role, row.active])).toEqual([
      [f.admin.personId, "network_admin", true],
      [f.moderator.personId, "network_moderator", false],
    ])
    expect(await roleOf(f.t, f.network, f.plain.personId)).toBe("member")
  })
})
