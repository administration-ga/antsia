// @vitest-environment edge-runtime
/**
 * ADR-0042, lot A3 (CH-815) — la cohorte fondatrice et le tableau de bord du réseau, par SON
 * administrateur (fiche § 4.2, sections « Fondateurs » et « Tableau de bord »).
 *
 * Recette d'acceptation, écrite avant le code :
 *
 *   · `diaspora/founders` : les jumeaux publics, bornés au réseau, des décisions d'exploitation
 *     `admitFoundingMember` / `withdrawFoundingMember` et de la lecture de console
 *     `listFoundingAdmissions` — lire la cohorte (plafond, nombre, qui a admis qui, pourquoi,
 *     dispense d'ancienneté, date), admettre une personne DÉJÀ entrée (rien d'office), retirer,
 *     chercher un candidat par son identifiant ; cohorte pleine et non-membre refusés par les codes
 *     du domaine ; chaque décision au journal à titre de `network_admin` ;
 *   · `diaspora/networkSettings.overview` : les seuls compteurs TENUS par le moteur (modules ouverts,
 *     cohorte, pays ouverts) ; un compte qui n'est pas tenu n'est pas rendu.
 *
 * Pour chaque porte : un membre, un modérateur, un administrateur en session de l'application des
 * membres (par code, ou IDN scellée pour diaspora_ga) et l'administrateur d'un autre réseau reçoivent
 * le refus du non-membre, sans rien écrire ; la session prouvée et journalisée de l'application
 * d'administration passe. Aucune réponse ne porte la preuve de session. Données de fixture fictives.
 */
import { FOUNDING_COHORT_MAX } from "@diaspora-ga/domain"
import { NETWORK_FEATURES } from "@antsia/social-domain/networkFeatures"
import { ConvexError } from "convex/values"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { api, internal } from "../../_generated/api"
import type { Doc, Id } from "../../_generated/dataModel"
import { SEED_CONFIRMATION } from "../../seeds/foundations"
import { openNetworkFeatures, openTestNetworkAdminSession, testConvex } from "../../test.setup"

type T = ReturnType<typeof testConvex>
type As = ReturnType<T["withIdentity"]>
type Member = { as: As; personId: Id<"persons"> }
type Role = Doc<"networkMemberships">["role"]

const NOW = Date.UTC(2026, 10, 23, 11)
const REASON = "Présidente d'une association relais du pilote (fixture)."
const WITHDRAWAL = "Retrait demandé par la personne admise (fixture)."
const MEMBERS_APP = "diaspora_ga"
const REFUSAL = { code: "notFound" }

const F = api.modules.diaspora.founders
const SETTINGS = api.modules.diaspora.networkSettings

beforeEach(() => {
  vi.stubEnv("CONVEX_CLOUD_URL", "http://127.0.0.1:3210")
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

async function refusalOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise
  } catch (error) {
    return error instanceof ConvexError ? error.data : { unexpected: String(error) }
  }
  return null
}

function expectNoSessionProof(value: unknown) {
  const text = JSON.stringify(value)
  for (const field of ["adminSession", "idnSubject", "sessionId", "networkAdminAccess", "application"]) expect(text, field).not.toContain(field)
}

async function person(t: T, handle: string): Promise<Member> {
  const as = t.withIdentity({ subject: `a3-${handle}` })
  const personId = await as.mutation(api.modules.people.persons.ensureMyPerson, {})
  await as.mutation(api.modules.people.consents.recordConsent, { purpose: "social_profile", origin: "onboarding" })
  await as.mutation(api.modules.people.profile.publishMyProfile, { handle, displayName: handle })
  await t.run(async (ctx) => {
    await ctx.db.insert("identityLinks", { personId, provider: "idn", subject: `idn-${personId}`, loa: 2, nationality: "GA", linkedAt: NOW })
  })
  return { as, personId }
}

async function member(t: T, networkId: Id<"networks">, handle: string, role?: Role): Promise<Member> {
  const someone = await person(t, handle)
  await someone.as.mutation(api.modules.diaspora.membership.joinDiasporaGa, { networkId, facet: { countryOfResidence: "FR" } })
  if (role) await setRole(t, networkId, someone.personId, role)
  return someone
}

async function setRole(t: T, networkId: Id<"networks">, personId: Id<"persons">, role: Role) {
  await t.run(async (ctx) => {
    const row = await ctx.db.query("networkMemberships").withIndex("by_network_and_person", (q) => q.eq("networkId", networkId).eq("personId", personId)).unique()
    if (!row) throw new Error("Adhésion de fixture absente")
    await ctx.db.patch(row._id, { role })
  })
}

async function fixture() {
  const t = testConvex()
  const { root, testClosed } = await t.mutation(internal.seeds.foundations.run, { confirmNonProduction: SEED_CONFIRMATION })
  const { network } = await t.mutation(internal.modules.diaspora.seed.run, { confirmNonProduction: SEED_CONFIRMATION })
  await openNetworkFeatures(t, network)
  const reader = await member(t, network, "lectrice.a3")
  const moderator = await member(t, network, "moderatrice.a3", "network_moderator")
  const admin = await member(t, network, "admin.a3", "network_admin")
  const founder = await member(t, network, "fondatrice.a3")
  const pioneer = await member(t, network, "pionnier.a3")
  const outsider = await person(t, "hors.reseau.a3")
  const otherAdmin = await member(t, network, "admin.racine.a3")
  await setRole(t, root, otherAdmin.personId, "network_admin")
  // Une opératrice de plateforme vivante, qui a admis un pionnier par la décision d'exploitation.
  const operator = await person(t, "operatrice.a3")
  await t.run(async (ctx) => {
    await ctx.db.insert("operators", { personId: operator.personId, role: "platform_operator", grantedAt: NOW })
  })
  await t.mutation(internal.modules.diaspora.founders.admitFoundingMember, { networkId: network, personId: pioneer.personId, operatorPersonId: operator.personId, reason: "Pionnier du pilote, admis à la console (fixture).", seniorityWaiver: false })
  const adminApp = await openTestNetworkAdminSession(t, admin.as, admin.personId, network)
  const refused: Record<string, Member> = {
    "membre, session de l'application des membres": reader,
    "membre, session IDN de l'application d'administration": { personId: reader.personId, as: await openTestNetworkAdminSession(t, reader.as, reader.personId, network, { logged: false }) },
    "modérateur, session de l'application des membres": moderator,
    "modérateur, session IDN de l'application d'administration": { personId: moderator.personId, as: await openTestNetworkAdminSession(t, moderator.as, moderator.personId, network, { logged: false }) },
    "administrateur, session par code de l'application des membres": admin,
    "administrateur, session IDN de l'application des membres": { personId: admin.personId, as: await openTestNetworkAdminSession(t, admin.as, admin.personId, network, { application: MEMBERS_APP, logged: false }) },
    "administrateur d'un autre réseau, session IDN de l'application d'administration": { personId: otherAdmin.personId, as: await openTestNetworkAdminSession(t, otherAdmin.as, otherAdmin.personId, network, { logged: false }) },
  }
  return { t, root, testClosed, network, reader, moderator, admin, founder, pioneer, outsider, otherAdmin, operator, adminApp, refused }
}

type Fixture = Awaited<ReturnType<typeof fixture>>

function doors(f: Fixture, as: As, networkId: Id<"networks"> = f.network) {
  return {
    cohort: () => as.query(F.cohort, { networkId }),
    candidate: () => as.query(F.candidate, { networkId, handle: "@fondatrice.a3" }),
    admit: () => as.mutation(F.admit, { networkId, personId: f.founder.personId, reason: REASON, seniorityWaiver: true }),
    withdraw: () => as.mutation(F.withdraw, { networkId, personId: f.pioneer.personId, reason: WITHDRAWAL }),
    overview: () => as.query(SETTINGS.overview, { networkId }),
  }
}

async function writes(f: Fixture) {
  return await f.t.run(async (ctx) => ({
    admissions: (await ctx.db.query("foundingAdmissions").withIndex("by_network_and_person", (q) => q.eq("networkId", f.network)).take(100)).map((row) => [row.personId, row.withdrawnAt ?? null]),
    audit: (await ctx.db.query("engineAudit").withIndex("by_network_at", (q) => q.eq("networkId", f.network)).take(200)).length,
  }))
}

async function founderDecisions(f: Fixture) {
  return await f.t.run(async (ctx) =>
    (await ctx.db.query("engineAudit").withIndex("by_network_at", (q) => q.eq("networkId", f.network)).take(200))
      .filter((row) => row.action.startsWith("diaspora.founder_"))
      .map((row) => ({ action: row.action, capacity: row.capacity, actorPersonId: row.actorPersonId, subject: { table: row.subjectTable, id: row.subjectId }, details: row.details })),
  )
}

async function statusOf(f: Fixture, personId: Id<"persons">) {
  return await f.t.run(async (ctx) => (await ctx.db.query("networkMemberships").withIndex("by_network_and_person", (q) => q.eq("networkId", f.network).eq("personId", personId)).unique())?.status ?? null)
}

describe("A3 — seule l'application d'administration, en session prouvée, lit et décide la cohorte fondatrice", () => {
  it("chaque porte refuse membre, modérateur, administrateur en session des membres et administrateur d'un autre réseau, sans rien écrire", async () => {
    const f = await fixture()
    const before = await writes(f)
    for (const [label, who] of Object.entries(f.refused)) {
      for (const [door, call] of Object.entries(doors(f, who.as))) expect(await refusalOf(call()), `${label} — ${door}`).toEqual(REFUSAL)
    }
    expect(await writes(f)).toEqual(before)
  })

  it("une session d'administration de DIASPORA.GA ne décide rien ailleurs : racine et autre réseau, refus indistinct", async () => {
    const f = await fixture()
    await setRole(f.t, f.root, f.admin.personId, "network_admin")
    for (const networkId of [f.root, f.testClosed]) {
      for (const [door, call] of Object.entries(doors(f, f.adminApp, networkId))) expect(await refusalOf(call()), `${networkId} — ${door}`).toEqual(REFUSAL)
    }
  })
})

describe("A3 — la cohorte fondatrice, depuis l'application d'administration", () => {
  it("la cohorte se lit : plafond, nombre, qui a admis qui, pourquoi, dispense et date", async () => {
    const f = await fixture()
    const cohort = await f.adminApp.query(F.cohort, { networkId: f.network })
    expect(cohort).toEqual({
      cohortMax: FOUNDING_COHORT_MAX,
      activeCount: 1,
      active: [{
        admissionId: expect.any(String),
        personId: f.pioneer.personId,
        person: { handle: "pionnier.a3", displayName: "pionnier.a3" },
        reason: "Pionnier du pilote, admis à la console (fixture).",
        seniorityWaiver: false,
        admittedAt: NOW,
        admittedBy: { personId: f.operator.personId, handle: "operatrice.a3", displayName: "operatrice.a3" },
        withdrawnAt: null,
        withdrawnBy: null,
        withdrawnByPerson: null,
        withdrawalReason: null,
      }],
      withdrawn: [],
    })
    expectNoSessionProof(cohort)
  })

  it("admettre un membre déjà entré, avec dispense : il devient vérifié, la cohorte le montre, le journal le dit à titre de network_admin", async () => {
    const f = await fixture()
    const admitted = await f.adminApp.mutation(F.admit, { networkId: f.network, personId: f.founder.personId, reason: REASON, seniorityWaiver: true })
    expect(admitted).toEqual({ admissionId: expect.any(String), status: "verifiee" })
    expectNoSessionProof(admitted)
    const cohort = await f.adminApp.query(F.cohort, { networkId: f.network })
    expect(cohort.activeCount).toBe(2)
    expect(cohort.active.find((row) => row.personId === f.founder.personId)).toMatchObject({
      reason: REASON, seniorityWaiver: true, admittedAt: NOW, admittedBy: { personId: f.admin.personId, handle: "admin.a3", displayName: "admin.a3" },
    })
    expect(await founderDecisions(f)).toEqual([{
      action: "diaspora.founder_admit", capacity: "network_admin", actorPersonId: f.admin.personId,
      subject: { table: "persons", id: f.founder.personId }, details: { reason: REASON, seniorityWaiver: true },
    }])
  })

  it("retirer : le statut retombe selon les faits, la cohorte garde la décision et son retrait, le journal le dit", async () => {
    const f = await fixture()
    const before = await statusOf(f, f.founder.personId)
    await f.adminApp.mutation(F.admit, { networkId: f.network, personId: f.founder.personId, reason: REASON, seniorityWaiver: false })
    const withdrawn = await f.adminApp.mutation(F.withdraw, { networkId: f.network, personId: f.founder.personId, reason: WITHDRAWAL })
    expect(withdrawn).toEqual({ status: before })
    const cohort = await f.adminApp.query(F.cohort, { networkId: f.network })
    expect(cohort.activeCount).toBe(1)
    expect(cohort.withdrawn).toEqual([expect.objectContaining({
      personId: f.founder.personId, withdrawnAt: NOW, withdrawnBy: "operator", withdrawalReason: WITHDRAWAL,
      withdrawnByPerson: { personId: f.admin.personId, handle: "admin.a3", displayName: "admin.a3" },
    })])
    expect((await founderDecisions(f)).map((row) => [row.action, row.capacity, row.actorPersonId, row.details])).toEqual([
      ["diaspora.founder_admit", "network_admin", f.admin.personId, { reason: REASON, seniorityWaiver: false }],
      ["diaspora.founder_withdraw", "network_admin", f.admin.personId, { reason: WITHDRAWAL, cause: "operator" }],
    ])
  })

  it("rien d'office : une personne hors du réseau est refusée par le code du domaine, rien n'est écrit", async () => {
    const f = await fixture()
    const before = await writes(f)
    expect(await refusalOf(f.adminApp.mutation(F.admit, { networkId: f.network, personId: f.outsider.personId, reason: REASON, seniorityWaiver: false }))).toEqual({ code: "notFound", appRule: "founding_target_not_member", appParams: {} })
    expect(await writes(f)).toEqual(before)
  })

  it("cohorte pleine : refusée par le code du domaine, plafond rendu, rien n'est écrit", async () => {
    const f = await fixture()
    await f.t.run(async (ctx) => {
      // Une cohorte remplie jusqu'au plafond (le pionnier compte déjà pour un).
      for (let index = 1; index < FOUNDING_COHORT_MAX; index += 1) {
        await ctx.db.insert("foundingAdmissions", { networkId: f.network, personId: f.reader.personId, reason: "Admission de remplissage (fixture).", seniorityWaiver: false, admittedAt: NOW - index })
      }
    })
    const before = await writes(f)
    expect(await refusalOf(f.adminApp.mutation(F.admit, { networkId: f.network, personId: f.founder.personId, reason: REASON, seniorityWaiver: false }))).toEqual({ code: "conflict", appRule: "founding_cohort_full", appParams: { limit: FOUNDING_COHORT_MAX } })
    expect(await writes(f)).toEqual(before)
  })

  it("retirer une personne qui n'est pas admise, ou décider sans motif suffisant : refusé, rien n'est écrit", async () => {
    const f = await fixture()
    const before = await writes(f)
    expect(await refusalOf(f.adminApp.mutation(F.withdraw, { networkId: f.network, personId: f.founder.personId, reason: WITHDRAWAL }))).toEqual({ code: "notFound", appRule: "founding_not_admitted", appParams: {} })
    expect(await refusalOf(f.adminApp.mutation(F.admit, { networkId: f.network, personId: f.founder.personId, reason: "Court", seniorityWaiver: false }))).toMatchObject({ code: "invalidArgument" })
    expect(await refusalOf(f.adminApp.mutation(F.withdraw, { networkId: f.network, personId: f.pioneer.personId, reason: "Court" }))).toMatchObject({ code: "invalidArgument" })
    expect(await writes(f)).toEqual(before)
  })

  it("le candidat se cherche par son identifiant : membre publié du réseau, sinon null", async () => {
    const f = await fixture()
    expect(await f.adminApp.query(F.candidate, { networkId: f.network, handle: "@fondatrice.a3" })).toEqual({ personId: f.founder.personId, handle: "fondatrice.a3", displayName: "fondatrice.a3" })
    expect(await f.adminApp.query(F.candidate, { networkId: f.network, handle: "hors.reseau.a3" })).toBeNull()
    expect(await f.adminApp.query(F.candidate, { networkId: f.network, handle: "" })).toBeNull()
  })
})

describe("A3 — le tableau de bord : les compteurs tenus par le moteur, rien d'estimé", () => {
  it("modules ouverts, cohorte, pays ouverts — et seulement eux", async () => {
    const f = await fixture()
    const network = await f.t.run(async (ctx) => await ctx.db.get(f.network))
    const overview = await f.adminApp.query(SETTINGS.overview, { networkId: f.network })
    expect(overview).toEqual({
      modules: { open: NETWORK_FEATURES.length, total: NETWORK_FEATURES.length },
      founders: { active: 1, cap: FOUNDING_COHORT_MAX },
      countries: { open: (network?.openCountries ?? []).length },
    })
    expectNoSessionProof(overview)
    await f.t.run(async (ctx) => {
      const row = await ctx.db.query("networkFeatures").withIndex("by_network_feature", (q) => q.eq("networkId", f.network).eq("feature", "pilotMetrics")).first()
      if (row) await ctx.db.patch(row._id, { enabled: false })
    })
    expect((await f.adminApp.query(SETTINGS.overview, { networkId: f.network })).modules).toEqual({ open: NETWORK_FEATURES.length - 1, total: NETWORK_FEATURES.length })
  })
})
