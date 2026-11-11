// @vitest-environment edge-runtime
/**
 * MD-01 et LX-03 — les responsables de DIASPORALE, SANS la porte de démonstration : la
 * console du moteur nomme le premier administrateur (`platform/networkRoles`) ; celui-ci
 * nomme, change et retire les responsables dans la tranche (`membership.setResponsibleRole`),
 * motif à l'appui, par l'aide du moteur ; le rôle ouvre ou ferme la file, les recours et
 * `/pilote` au geste suivant ; la liste des responsables ne montre que des profils publiés.
 * Données de fixture fictives.
 */
import { engineErrorCode, engineErrorRule } from "@antsia/social-contracts/errors"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { api, internal } from "../../_generated/api"
import type { Doc, Id } from "../../_generated/dataModel"
import { SEED_CONFIRMATION } from "../../seeds/foundations"
import { createTestOperatorProof, testConvex } from "../../test.setup"

type T = ReturnType<typeof testConvex>
type Member = { as: ReturnType<T["withIdentity"]>; personId: Id<"persons"> }

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

/** Une personne au profil publié ; membre de DIASPORALE par le vrai chemin d'entrée, DÉCLARÉE si elle a une IDN. */
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
  await as.mutation(M.joinDiasporale, { networkId, facet: { countryOfResidence: "FR" } })
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

/** DIASPORALE réelle (graine du réseau), un opérateur, et le premier administrateur nommé PAR LA CONSOLE. */
async function fixture() {
  const t = testConvex()
  const { root } = await t.mutation(internal.seeds.foundations.run, { confirmNonProduction: SEED_CONFIRMATION })
  const { network } = await t.mutation(internal.modules.diaspora.seed.run, { confirmNonProduction: SEED_CONFIRMATION })
  const operator = await platformAdmin(t, root)
  const admin = await member(t, network, "awa.fixture", "Awa OGOOUÉ")
  const moderator = await member(t, network, "ruth.fixture", "Ruth NZÉ")
  const plain = await member(t, network, "jean.fixture", "Jean MBA")
  expect(await operator.as.mutation(CONSOLE.setNetworkRole, { networkId: network, personId: admin.personId, role: "network_admin", reason: "Premier administrateur du réseau (fixture)." })).toEqual({ role: "network_admin", changed: true })
  return { t, root, network, operator, admin, moderator, plain }
}
type Fixture = Awaited<ReturnType<typeof fixture>>

function name(f: Fixture, who: Member, role: Doc<"networkMemberships">["role"], by: Member = f.admin, reason = REASON) {
  return by.as.mutation(M.setResponsibleRole, { networkId: f.network, personId: who.personId, role, reason })
}

const queueOf = (f: Fixture, who: Member) => who.as.query(D.queue, { networkId: f.network, expectedPersonId: who.personId, zone: ALL, paginationOpts: PAGE })
const appealsOf = (f: Fixture, who: Member) => who.as.query(D.appealQueue, { networkId: f.network, expectedPersonId: who.personId, zone: ALL, paginationOpts: PAGE })
const pilotOf = (f: Fixture, who: Member) => who.as.query(PILOT.pilotMetrics, { networkId: f.network, days: 30 })
const pilotAccessOf = (f: Fixture, who: Member) => who.as.query(PILOT.pilotMetricsAccess, { networkId: f.network })
const responsiblesOf = (f: Fixture, who: Member, expected: Member = who) => who.as.query(D.responsibles, { networkId: f.network, expectedPersonId: expected.personId })

async function roleOf(t: T, networkId: Id<"networks">, personId: Id<"persons">) {
  return await t.run(async (ctx) => (await ctx.db.query("networkMemberships").withIndex("by_network_and_person", (q) => q.eq("networkId", networkId).eq("personId", personId)).unique())?.role ?? null)
}

async function roleJournal(t: T) {
  return (await t.run(async (ctx) => await ctx.db.query("engineAudit").withIndex("by_at").take(200))).filter((row) => row.action === "membership.role_set")
}

describe("MD-01 — nommer les responsables du réseau, sans la porte de démonstration", () => {
  it("l'administrateur nommé par la console nomme une modératrice : elle lit toute la file et /pilote ; le retrait les lui ferme au geste suivant", async () => {
    const f = await fixture()
    expect(await codeOf(queueOf(f, f.moderator))).toBe("notFound")
    expect(await pilotAccessOf(f, f.moderator)).toEqual({ allowed: false })

    expect(await name(f, f.moderator, "network_moderator")).toEqual({ role: "network_moderator", changed: true })
    expect(await f.moderator.as.query(D.myDesk, { networkId: f.network, expectedPersonId: f.moderator.personId })).toMatchObject({ role: "network_moderator", networkWide: true, canReviewAppeals: false, canManageTeams: false })
    expect(await queueOf(f, f.moderator)).toMatchObject({ items: [], isDone: true })
    expect(await pilotAccessOf(f, f.moderator)).toEqual({ allowed: true })
    expect(await codeOf(pilotOf(f, f.moderator))).toBeNull()
    // La modération du réseau ne juge pas les recours : ils restent à l'administration.
    expect(await codeOf(appealsOf(f, f.moderator))).toBe("notFound")

    expect(await name(f, f.moderator, "member")).toEqual({ role: "member", changed: true })
    expect(await f.moderator.as.query(D.myDesk, { networkId: f.network, expectedPersonId: f.moderator.personId })).toBeNull()
    expect(await codeOf(queueOf(f, f.moderator))).toBe("notFound")
    expect(await codeOf(pilotOf(f, f.moderator))).toBe("notFound")
    expect(await pilotAccessOf(f, f.moderator)).toEqual({ allowed: false })

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
    // Un autre réseau que DIASPORALE : la tranche ne gouverne que le sien.
    expect(await codeOf(f.admin.as.mutation(M.setResponsibleRole, { networkId: f.root, personId: f.plain.personId, role: "network_moderator", reason: REASON }))).toBe("notFound")
    expect(await roleOf(f.t, f.network, f.plain.personId)).toBe("member")
    expect(await roleOf(f.t, f.network, f.moderator.personId)).toBe("network_moderator")
    expect(await roleJournal(f.t)).toHaveLength(before)
  })

  it("motif exigé ; ni adhésion créée ni rôle confié hors d'une adhésion active « déclarée » au moins ; un rôle déjà posé n'écrit rien", async () => {
    const f = await fixture()
    expect(await codeOf(name(f, f.moderator, "network_moderator", f.admin, "  court  "))).toBe("DECISION_REASON_LENGTH")
    // Une personne sans adhésion à DIASPORALE : aucune adhésion n'est créée.
    const outsiderId = await f.t.withIdentity({ subject: "responsables-hors-reseau" }).mutation(api.modules.people.persons.ensureMyPerson, {})
    expect(await codeOf(f.admin.as.mutation(M.setResponsibleRole, { networkId: f.network, personId: outsiderId, role: "network_moderator", reason: REASON }))).toBe("notFound")
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

  it("le dernier administrateur actif ne quitte pas DIASPORALE : refus avant toute écriture ; à deux, l'un part", async () => {
    const f = await fixture()
    const statusOf = async (who: Member) =>
      await f.t.run(async (ctx) => (await ctx.db.query("networkMemberships").withIndex("by_network_and_person", (q) => q.eq("networkId", f.network).eq("personId", who.personId)).unique())?.status ?? null)
    const before = await statusOf(f.admin)
    expect(await codeOf(f.admin.as.mutation(M.leaveDiasporale, { networkId: f.network }))).toBe("NETWORK_LAST_ADMIN")
    expect(await statusOf(f.admin)).toBe(before)
    expect(await roleOf(f.t, f.network, f.admin.personId)).toBe("network_admin")

    expect(await name(f, f.plain, "network_admin")).toEqual({ role: "network_admin", changed: true })
    expect(await f.admin.as.mutation(M.leaveDiasporale, { networkId: f.network })).toBeNull()
    expect(await statusOf(f.admin)).toBe("partie")
    expect(await roleOf(f.t, f.network, f.admin.personId)).toBe("member")
    // Le remplaçant est désormais le dernier : il ne part pas à son tour.
    expect(await codeOf(f.plain.as.mutation(M.leaveDiasporale, { networkId: f.network }))).toBe("NETWORK_LAST_ADMIN")
  })
})

describe("LX-03 — lecteurs du tableau du pilote et de la file des recours", () => {
  it("un administrateur nommé ouvre /pilote et la file des recours ; retiré, il reçoit le refus indistinct", async () => {
    const f = await fixture()
    expect(await codeOf(pilotOf(f, f.plain))).toBe("notFound")
    expect(await codeOf(appealsOf(f, f.plain))).toBe("notFound")

    await name(f, f.plain, "network_admin")
    expect(await pilotAccessOf(f, f.plain)).toEqual({ allowed: true })
    expect(await codeOf(pilotOf(f, f.plain))).toBeNull()
    expect(await appealsOf(f, f.plain)).toMatchObject({ items: [], isDone: true })

    await name(f, f.plain, "member")
    expect(await pilotAccessOf(f, f.plain)).toEqual({ allowed: false })
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
    await f.plain.as.mutation(M.leaveDiasporale, { networkId: f.network })
    const list = await responsiblesOf(f, f.admin)
    expect(list.members.map((row) => [row.personId, row.role, row.active])).toEqual([
      [f.admin.personId, "network_admin", true],
      [f.moderator.personId, "network_moderator", false],
    ])
    expect(await roleOf(f.t, f.network, f.plain.personId)).toBe("member")
  })
})
