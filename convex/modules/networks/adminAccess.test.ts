// @vitest-environment edge-runtime
/**
 * ADR-0042 (CH-815, lot A1) — l'administrateur d'un réseau gouverné, en session d'identité
 * numérique PROUVÉE, depuis l'application qui administre CE réseau, accès journalisé.
 *
 * Recette d'acceptation, écrite avant le code : sur les quatre portes du lot (`myNetworkAdmin`,
 * `recordAccess`, `features.settings`, `features.setFeature`), un membre, un modérateur, un
 * administrateur en session par code, un administrateur dont la session a été scellée pour
 * l'application des membres, pour la console ou avant ADR-0042, un administrateur d'un autre réseau,
 * un rôle retiré, une garantie IDN tombée ou une preuve expirée reçoivent TOUS le même refus que
 * le non-membre. La session prouvée de l'application d'administration lit son entrée et journalise
 * son accès (une ligne, une seule fois) ; ensuite seulement les réglages s'ouvrent. Une session
 * d'administration du réseau n'ouvre jamais la console, et une session de console jamais
 * l'administration du réseau.
 */
import { CONSOLE_MIN_LOA } from "@antsia/social-domain/badges"
import { ConvexError } from "convex/values"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { api, components, internal } from "../../_generated/api"
import type { Id } from "../../_generated/dataModel"
import { SEED_CONFIRMATION } from "../../seeds/foundations"
import { createTestSession, testConvex } from "../../test.setup"
import { NETWORK_ADMIN_APPLICATION_KEY } from "../../tests/networkAdminCatalog.fixture"

// L'application d'administration au catalogue (contrat CH-815) : posée tant que l'entrée réelle n'est pas fusionnée.
vi.mock("../../../deploy/catalog.json", async (importOriginal) => {
  const { withNetworkAdminApplication } = await import("../../tests/networkAdminCatalog.fixture")
  return withNetworkAdminApplication(await importOriginal())
})

type T = ReturnType<typeof testConvex>
type As = ReturnType<T["withIdentity"]>
type Session = { sessionId: string; as: As }
type Account = Session & { authUserId: string; personId: Id<"persons">; idnSubject: string }

const NOW = Date.UTC(2026, 10, 23, 10)
const A = api.modules.networks.adminAccess
const F = api.modules.networks.features
const ADMIN_APP = NETWORK_ADMIN_APPLICATION_KEY
const MEMBERS_APP = "diaspora_ga"
const CONSOLE_APP = "admin_antsia_ga"
const REASON = "Ouverture décidée pour le pilote du réseau."
/** Le refus du non-membre : celui que reçoit TOUT appel refusé du lot. */
const REFUSAL = { code: "notFound" }

beforeEach(() => {
  vi.stubEnv("CONVEX_CLOUD_URL", "http://127.0.0.1:3210")
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

function idOf(row: unknown): string {
  if (!row || typeof row !== "object" || !("_id" in row) || typeof row._id !== "string") throw new Error("Document de fixture absent")
  return row._id
}

/** Les données du refus (`ConvexError`), ou `null` si l'appel passe. */
async function refusalOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise
  } catch (error) {
    return error instanceof ConvexError ? error.data : { unexpected: String(error) }
  }
  return null
}

async function openSession(t: T, authUserId: string): Promise<Session> {
  const sessionId = await createTestSession(t, authUserId)
  return { sessionId, as: t.withIdentity({ subject: authUserId, sessionId }) }
}

/**
 * Une personne entrée dans DIASPORA.GA (IDN de garantie 2, compte IDN lié), au rôle de réseau
 * demandé ; sa première session est une session ordinaire, NON scellée (code, ou IDN d'avant ADR-0042).
 */
async function account(t: T, network: Id<"networks">, handle: string, role?: "network_admin" | "network_moderator"): Promise<Account> {
  const authUserId = idOf(await t.mutation(components.betterAuth.adapter.create, { input: { model: "user", data: { name: "Nom civil fictif non recopié", email: `${handle}@example.test`, emailVerified: true, createdAt: NOW, updatedAt: NOW } } }))
  const idnSubject = `idn-${handle}`
  await t.mutation(components.betterAuth.adapter.create, { input: { model: "account", data: { userId: authUserId, providerId: "idn", accountId: idnSubject, createdAt: NOW, updatedAt: NOW } } })
  await t.mutation(internal.modules.people.identity.recordIdnProof, { subject: idnSubject, loa: 2 })
  const session = await openSession(t, authUserId)
  const personId = await session.as.mutation(api.modules.people.persons.ensureMyPerson, {})
  await session.as.mutation(api.modules.people.consents.recordConsent, { purpose: "social_profile", origin: "onboarding" })
  await session.as.mutation(api.modules.people.profile.publishMyProfile, { handle, displayName: handle })
  await linkIdn(t, personId, idnSubject)
  await session.as.mutation(api.modules.diaspora.membership.joinDiasporaGa, { networkId: network, facet: { countryOfResidence: "FR", city: "Paris" } })
  if (role) await setRole(t, network, personId, role)
  return { ...session, authUserId, personId, idnSubject }
}

/** Le lien IDN de la personne (posé dès sa création par son compte IDN, ou ici), garantie 2, nationalité gabonaise. */
async function linkIdn(t: T, personId: Id<"persons">, subject: string) {
  await t.run(async (ctx) => {
    const link = await ctx.db.query("identityLinks").withIndex("by_person_and_provider", (q) => q.eq("personId", personId).eq("provider", "idn")).unique()
    if (link) await ctx.db.patch(link._id, { subject, loa: 2, nationality: "GA", revokedAt: undefined })
    else await ctx.db.insert("identityLinks", { personId, provider: "idn", subject, loa: 2, nationality: "GA", linkedAt: NOW })
  })
}

async function setRole(t: T, networkId: Id<"networks">, personId: Id<"persons">, role: "member" | "network_admin" | "network_moderator") {
  await t.run(async (ctx) => {
    const row = await ctx.db.query("networkMemberships").withIndex("by_network_and_person", (q) => q.eq("networkId", networkId).eq("personId", personId)).unique()
    if (!row) throw new Error("Adhésion de fixture absente")
    await ctx.db.patch(row._id, { role })
  })
}

/** Le retour IDN scelle une NOUVELLE session de la personne, pour `application` (absente : preuve d'avant ADR-0042). */
async function idnSession(t: T, who: Account, application?: string, loa: 1 | 2 | 3 = 2): Promise<Session> {
  const session = await openSession(t, who.authUserId)
  await t.mutation(internal.modules.people.identity.recordIdnProof, { subject: who.idnSubject, loa })
  await t.mutation(internal.modules.platform.operatorAccess.recordIdnSession, {
    sessionId: session.sessionId, authUserId: who.authUserId, idnSubject: who.idnSubject, loa, ...(application ? { application } : {}),
  })
  return session
}

/** Une session prouvée de l'application d'administration ; accès journalisé sauf `logged: false`. */
async function adminSession(t: T, who: Account, networkId: Id<"networks">, { logged = true, loa = 2 }: { logged?: boolean; loa?: 1 | 2 | 3 } = {}): Promise<Session> {
  const session = await idnSession(t, who, ADMIN_APP, loa)
  if (logged) await session.as.mutation(A.recordAccess, { networkId })
  return session
}

async function fixture() {
  const t = testConvex({ automaticSessions: false })
  const { root, testClosed } = await t.mutation(internal.seeds.foundations.run, { confirmNonProduction: SEED_CONFIRMATION })
  const { network } = await t.mutation(internal.modules.diaspora.seed.run, { confirmNonProduction: SEED_CONFIRMATION })
  const admin = await account(t, network, "admin.reseau", "network_admin")
  return { t, root, testClosed, network, admin }
}

type Fixture = Awaited<ReturnType<typeof fixture>>

/** Les quatre portes du lot, pour une session et un réseau. */
function doors(as: As, networkId: Id<"networks">) {
  return {
    myNetworkAdmin: () => as.query(A.myNetworkAdmin, { networkId }),
    recordAccess: () => as.mutation(A.recordAccess, { networkId }),
    settings: () => as.query(F.settings, { networkId }),
    setFeature: () => as.mutation(F.setFeature, { networkId, feature: "pages", enabled: true, reason: REASON }),
  }
}

/** Ce que les portes du lot écrivent : les lignes d'accès au journal et les décisions de fonctionnalités. */
async function writes(f: Fixture) {
  return { audit: await adminAccessAudit(f), features: await f.t.run(async (ctx) => await ctx.db.query("networkFeatures").take(20)) }
}

/** Les quatre portes refusent, toutes du refus du non-membre ; rien n'est écrit. */
async function expectAllRefused(f: Fixture, as: As, networkId: Id<"networks">, label: string) {
  const before = await writes(f)
  for (const [door, call] of Object.entries(doors(as, networkId))) expect(await refusalOf(call()), `${label} — ${door}`).toEqual(REFUSAL)
  expect(await writes(f), label).toEqual(before)
}

async function adminAccessAudit(f: Fixture) {
  return await f.t.run(async (ctx) => {
    const rows = await ctx.db.query("engineAudit").withIndex("by_at").take(100)
    return rows.filter((row) => row.action === "network.admin_access").map((row) => ({ capacity: row.capacity, actorPersonId: row.actorPersonId, networkId: row.networkId, subjectTable: row.subjectTable, subjectId: row.subjectId }))
  })
}

async function proofOf(t: T, sessionId: string) {
  return await t.run(async (ctx) => await ctx.db.query("operatorSessionProofs").withIndex("by_session", (q) => q.eq("sessionId", sessionId)).unique())
}

describe("ADR-0042 — l'administrateur du réseau, en session prouvée de l'application d'administration", () => {
  it("le refus de référence : un non-membre, puis un membre, puis un modérateur du réseau", async () => {
    const f = await fixture()
    // Une personne qui n'est PAS entrée dans DIASPORA.GA, en session prouvée de l'application d'administration.
    const outsiderUser = idOf(await f.t.mutation(components.betterAuth.adapter.create, { input: { model: "user", data: { name: "Nom civil fictif", email: "hors.reseau@example.test", emailVerified: true, createdAt: NOW, updatedAt: NOW } } }))
    await f.t.mutation(components.betterAuth.adapter.create, { input: { model: "account", data: { userId: outsiderUser, providerId: "idn", accountId: "idn-hors-reseau", createdAt: NOW, updatedAt: NOW } } })
    const outsiderSession = await openSession(f.t, outsiderUser)
    const outsiderId = await outsiderSession.as.mutation(api.modules.people.persons.ensureMyPerson, {})
    await linkIdn(f.t, outsiderId, "idn-hors-reseau")
    const outsider: Account = { ...outsiderSession, authUserId: outsiderUser, personId: outsiderId, idnSubject: "idn-hors-reseau" }
    await expectAllRefused(f, (await idnSession(f.t, outsider, ADMIN_APP)).as, f.network, "non-membre")

    const reader = await account(f.t, f.network, "lectrice.reseau")
    await expectAllRefused(f, (await idnSession(f.t, reader, ADMIN_APP)).as, f.network, "membre")
    const moderator = await account(f.t, f.network, "moderatrice.reseau", "network_moderator")
    await expectAllRefused(f, (await idnSession(f.t, moderator, ADMIN_APP)).as, f.network, "modérateur")
  })

  it("l'administrateur en session par code (aucune preuve IDN) est refusé, même si une AUTRE de ses sessions est prouvée", async () => {
    const f = await fixture()
    await expectAllRefused(f, f.admin.as, f.network, "session par code")
    await adminSession(f.t, f.admin, f.network, { logged: false })
    await expectAllRefused(f, f.admin.as, f.network, "session par code, une autre session prouvée")
  })

  it("une preuve scellée pour l'application des membres, pour la console ou avant ADR-0042 est refusée", async () => {
    const f = await fixture()
    for (const [label, application] of [["application des membres", MEMBERS_APP], ["console du moteur", CONSOLE_APP], ["preuve sans application", undefined]] as const) {
      const session = await idnSession(f.t, f.admin, application)
      await expectAllRefused(f, session.as, f.network, label)
    }
  })

  it("session prouvée sans accès journalisé : l'entrée se lit et journalise ; les réglages restent fermés jusque-là", async () => {
    const f = await fixture()
    const session = await adminSession(f.t, f.admin, f.network, { logged: false })
    const door = doors(session.as, f.network)
    expect(await refusalOf(door.settings())).toEqual(REFUSAL)
    expect(await refusalOf(door.setFeature())).toEqual(REFUSAL)
    expect(await door.myNetworkAdmin()).toEqual({
      personId: f.admin.personId, displayName: "admin.reseau", networkId: f.network, networkSlug: "diaspora-ga", networkName: expect.any(String), accessLogged: false,
    })
    expect(await adminAccessAudit(f)).toEqual([])

    expect(await door.recordAccess()).toBeNull()
    expect(await door.recordAccess()).toBeNull()
    expect(await adminAccessAudit(f)).toEqual([{ capacity: "network_admin", actorPersonId: f.admin.personId, networkId: f.network, subjectTable: "networks", subjectId: f.network }])
    expect((await door.myNetworkAdmin()).accessLogged).toBe(true)
    // L'accès du réseau est DISTINCT de celui de la console : la preuve ne porte pas `accessLoggedAt`.
    const proof = await proofOf(f.t, session.sessionId)
    expect(proof?.accessLoggedAt).toBeUndefined()
    expect(proof?.application).toBe(ADMIN_APP)
    expect(proof?.networkAdminAccess).toEqual({ networkId: f.network, loggedAt: NOW })

    expect((await door.settings()).map((row) => row.feature)).toContain("pages")
    expect(await door.setFeature()).toEqual({ changed: true })
    const decisions = await f.t.run(async (ctx) => (await ctx.db.query("engineAudit").withIndex("by_network_at", (q) => q.eq("networkId", f.network)).take(20)).filter((row) => row.action === "network.feature_set"))
    expect(decisions.map((row) => ({ capacity: row.capacity, actorPersonId: row.actorPersonId }))).toEqual([{ capacity: "network_admin", actorPersonId: f.admin.personId }])
  })

  it("le rôle retiré (redevenu membre) est refusé dès l'appel suivant, sur une session déjà journalisée", async () => {
    const f = await fixture()
    const session = await adminSession(f.t, f.admin, f.network)
    expect(await doors(session.as, f.network).settings()).toHaveLength(8)
    await setRole(f.t, f.network, f.admin.personId, "member")
    for (const [door, call] of Object.entries(doors(session.as, f.network))) expect(await refusalOf(call()), door).toEqual(REFUSAL)
  })

  it("l'administrateur d'un AUTRE réseau, ou un autre identifiant de réseau, est refusé", async () => {
    const f = await fixture()
    // Administrateur du réseau fermé de test, simple membre de DIASPORA.GA, session de l'application d'administration.
    const other = await account(f.t, f.network, "admin.autre.reseau")
    await f.t.run(async (ctx) => {
      await ctx.db.insert("networkMemberships", { networkId: f.testClosed, personId: other.personId, status: "declaree", role: "network_admin", joinedAt: NOW, statusChangedAt: NOW })
    })
    const otherSession = await idnSession(f.t, other, ADMIN_APP)
    await expectAllRefused(f, otherSession.as, f.network, "administrateur d'un autre réseau, sur DIASPORA.GA")
    await expectAllRefused(f, otherSession.as, f.testClosed, "administrateur d'un autre réseau, sur son réseau : l'application ne l'administre pas")
    // L'administrateur de DIASPORA.GA, journalisé, vers un réseau dont il n'est pas membre, et vers la racine.
    const session = await adminSession(f.t, f.admin, f.network)
    await expectAllRefused(f, session.as, f.testClosed, "autre réseau")
    await setRole(f.t, f.root, f.admin.personId, "network_admin")
    await expectAllRefused(f, session.as, f.root, "racine")
  })

  it("une garantie IDN tombée sous le seuil ou une preuve de session expirée est refusée", async () => {
    expect(CONSOLE_MIN_LOA).toBe(1)
    const f = await fixture()
    const session = await adminSession(f.t, f.admin, f.network)
    expect(await doors(session.as, f.network).settings()).toHaveLength(8)
    // IDN observe de nouveau le sujet, SANS niveau de garantie : sous le seuil de la console.
    await f.t.mutation(internal.modules.people.identity.recordIdnProof, { subject: f.admin.idnSubject })
    for (const [door, call] of Object.entries(doors(session.as, f.network))) expect(await refusalOf(call()), `garantie tombée — ${door}`).toEqual(REFUSAL)

    const fresh = await adminSession(f.t, f.admin, f.network)
    expect(await doors(fresh.as, f.network).settings()).toHaveLength(8)
    // La session Better Auth vit encore (rafraîchie), la preuve scellée au retour IDN a expiré.
    await f.t.run(async (ctx) => {
      const proof = await ctx.db.query("operatorSessionProofs").withIndex("by_session", (q) => q.eq("sessionId", fresh.sessionId)).unique()
      if (proof) await ctx.db.patch(proof._id, { expiresAt: NOW - 1 })
    })
    for (const [door, call] of Object.entries(doors(fresh.as, f.network))) expect(await refusalOf(call()), `preuve expirée — ${door}`).toEqual(REFUSAL)
  })

  it("un administrateur suspendu reçoit le refus de tout membre suspendu, ni plus ni moins", async () => {
    const f = await fixture()
    const reader = await account(f.t, f.network, "membre.suspendu")
    const session = await adminSession(f.t, f.admin, f.network)
    await f.t.run(async (ctx) => {
      for (const personId of [f.admin.personId, reader.personId]) {
        const row = await ctx.db.query("networkMemberships").withIndex("by_network_and_person", (q) => q.eq("networkId", f.network).eq("personId", personId)).unique()
        if (row) await ctx.db.patch(row._id, { status: "suspendue", statusBeforeSuspension: "declaree" })
      }
    })
    const memberRefusal = await refusalOf(reader.as.query(F.open, { networkId: f.network }))
    expect(memberRefusal).toEqual({ code: "membershipSuspended" })
    for (const [door, call] of Object.entries(doors(session.as, f.network))) expect(await refusalOf(call()), door).toEqual(memberRefusal)
  })
})

describe("ADR-0042 — console et administration du réseau ne se valent jamais l'une l'autre", () => {
  it("la session de l'application d'administration n'ouvre jamais la console, même pour un opérateur", async () => {
    const f = await fixture()
    await f.t.run(async (ctx) => { await ctx.db.insert("operators", { personId: f.admin.personId, role: "platform_admin", grantedAt: NOW }) })
    const session = await adminSession(f.t, f.admin, f.network)
    const operatorRequired = { code: "operatorRequired" }
    expect(await refusalOf(session.as.query(api.modules.platform.operatorAccess.myOperator, {}))).toEqual(operatorRequired)
    expect(await refusalOf(session.as.mutation(api.modules.platform.operatorAccess.recordAccess, {}))).toEqual(operatorRequired)
    expect(await refusalOf(session.as.query(api.modules.networks.networks.listForConsole, {}))).toEqual(operatorRequired)
    expect(await refusalOf(session.as.query(F.operatorSettings, { networkId: f.network }))).toEqual(operatorRequired)
    expect((await proofOf(f.t, session.sessionId))?.accessLoggedAt).toBeUndefined()
  })

  it("une session de console journalisée n'ouvre jamais l'administration du réseau", async () => {
    const f = await fixture()
    await f.t.run(async (ctx) => { await ctx.db.insert("operators", { personId: f.admin.personId, role: "platform_admin", grantedAt: NOW }) })
    const session = await idnSession(f.t, f.admin, CONSOLE_APP)
    await session.as.mutation(api.modules.platform.operatorAccess.recordAccess, {})
    expect((await session.as.query(api.modules.platform.operatorAccess.myOperator, {})).role).toBe("platform_admin")
    await expectAllRefused(f, session.as, f.network, "console")
    expect((await proofOf(f.t, session.sessionId))?.networkAdminAccess).toBeUndefined()
    // Revue CH-815 F3 : une preuve sans application (d'avant ADR-0042) n'ouvre plus la console, ni l'administration.
    const unsealed = await idnSession(f.t, f.admin, undefined)
    const operatorRequired = { code: "operatorRequired" }
    expect(await refusalOf(unsealed.as.mutation(api.modules.platform.operatorAccess.recordAccess, {}))).toEqual(operatorRequired)
    expect(await refusalOf(unsealed.as.query(api.modules.platform.operatorAccess.myOperator, {}))).toEqual(operatorRequired)
    await expectAllRefused(f, unsealed.as, f.network, "preuve sans application")
  })
})

/** Les portes du lot refusent toutes du MÊME refus que `reference` (celui d'un membre, ou d'un anonyme). */
async function expectAllRefusedLike(f: Fixture, as: As, networkId: Id<"networks">, reference: unknown, label: string) {
  const before = await writes(f)
  for (const [door, call] of Object.entries(doors(as, networkId))) expect(await refusalOf(call()), `${label} — ${door}`).toEqual(reference)
  expect(await writes(f), label).toEqual(before)
}

async function setMembership(t: T, networkId: Id<"networks">, personId: Id<"persons">, patch: { status: "en_attente" | "declaree" | "suspendue"; statusBeforeSuspension?: "declaree" }) {
  await t.run(async (ctx) => {
    const row = await ctx.db.query("networkMemberships").withIndex("by_network_and_person", (q) => q.eq("networkId", networkId).eq("personId", personId)).unique()
    if (!row) throw new Error("Adhésion de fixture absente")
    await ctx.db.patch(row._id, patch)
  })
}

describe("revue CH-815 A1b — les admissions et les refus que la recette d'A1 ne couvrait pas", () => {
  it("une identité de garantie 1, le seuil de la console (ADR-0039), est admise", async () => {
    expect(CONSOLE_MIN_LOA).toBe(1)
    const f = await fixture()
    await f.t.run(async (ctx) => {
      const link = await ctx.db.query("identityLinks").withIndex("by_person_and_provider", (q) => q.eq("personId", f.admin.personId).eq("provider", "idn")).unique()
      if (link) await ctx.db.patch(link._id, { loa: 1 })
    })
    const session = await adminSession(f.t, f.admin, f.network, { loa: 1 })
    expect((await proofOf(f.t, session.sessionId))?.loa).toBe(1)
    expect(await doors(session.as, f.network).settings()).toHaveLength(8)
    expect(await doors(session.as, f.network).setFeature()).toEqual({ changed: true })
  })

  it("un lien IDN révoqué est refusé, sur une session déjà journalisée", async () => {
    const f = await fixture()
    const session = await adminSession(f.t, f.admin, f.network)
    expect(await doors(session.as, f.network).settings()).toHaveLength(8)
    await f.t.run(async (ctx) => {
      const link = await ctx.db.query("identityLinks").withIndex("by_person_and_provider", (q) => q.eq("personId", f.admin.personId).eq("provider", "idn")).unique()
      if (link) await ctx.db.patch(link._id, { revokedAt: NOW })
    })
    await expectAllRefused(f, session.as, f.network, "lien IDN révoqué")
  })

  it("une session supprimée par « Se déconnecter partout » est refusée comme une personne sans session", async () => {
    const f = await fixture()
    const session = await adminSession(f.t, f.admin, f.network)
    expect(await doors(session.as, f.network).settings()).toHaveLength(8)
    // La porte partagée révoque TOUTES les sessions Better Auth de la personne.
    for (const sessionId of [session.sessionId, f.admin.sessionId]) {
      await f.t.mutation(components.betterAuth.adapter.deleteOne, { input: { model: "session", where: [{ field: "_id", value: sessionId }] } })
    }
    const anonymous = await refusalOf(f.t.query(A.myNetworkAdmin, { networkId: f.network }))
    expect(anonymous).toEqual({ code: "unauthenticated" })
    await expectAllRefusedLike(f, session.as, f.network, anonymous, "session révoquée")
  })

  it("une suspension à la racine rend le refus de tout membre suspendu", async () => {
    const f = await fixture()
    const reader = await account(f.t, f.network, "membre.suspendu.racine")
    const session = await adminSession(f.t, f.admin, f.network)
    for (const personId of [f.admin.personId, reader.personId]) await setMembership(f.t, f.root, personId, { status: "suspendue", statusBeforeSuspension: "declaree" })
    const memberRefusal = await refusalOf(reader.as.query(F.open, { networkId: f.network }))
    expect(memberRefusal).toEqual({ code: "membershipSuspended" })
    await expectAllRefusedLike(f, session.as, f.network, memberRefusal, "suspension racine")
  })

  it("une suspension du compte sur ordre du juge rend le refus de tout membre suspendu", async () => {
    const f = await fixture()
    const reader = await account(f.t, f.network, "membre.mesure.juge")
    const session = await adminSession(f.t, f.admin, f.network)
    await f.t.run(async (ctx) => {
      for (const personId of [f.admin.personId, reader.personId]) {
        await ctx.db.insert("judicialMeasures", {
          networkId: f.root, kind: "suspend_account", target: { kind: "person", id: personId }, targetKind: "person", targetId: personId, subjectPersonId: personId,
          orderReference: "RG FICTIF 2026/0815", status: "active", startsAt: NOW - 1, executedAt: NOW - 1, createdByPersonId: reader.personId,
          effects: { membershipSuspended: true, pageDeactivated: false, contentRemoved: false }, createdAt: NOW - 1, updatedAt: NOW - 1,
        })
      }
    })
    const memberRefusal = await refusalOf(reader.as.query(F.open, { networkId: f.network }))
    expect(memberRefusal).toEqual({ code: "membershipSuspended" })
    await expectAllRefusedLike(f, session.as, f.network, memberRefusal, "mesure du juge")
  })

  it("un administrateur dont l'adhésion est revenue « en attente » ne peut exercer le rôle : refus indistinct", async () => {
    const f = await fixture()
    const session = await adminSession(f.t, f.admin, f.network)
    await setMembership(f.t, f.network, f.admin.personId, { status: "en_attente" })
    await expectAllRefused(f, session.as, f.network, "adhésion en attente")
  })

  it("un réseau archivé : refus indistinct", async () => {
    const f = await fixture()
    const session = await adminSession(f.t, f.admin, f.network)
    await f.t.run(async (ctx) => { await ctx.db.patch(f.network, { status: "archived" }) })
    await expectAllRefused(f, session.as, f.network, "réseau archivé")
  })

  it("la garde d'écriture de la modération : réduit au silence dans le réseau, l'administrateur lit mais ne décide pas", async () => {
    const f = await fixture()
    const session = await adminSession(f.t, f.admin, f.network)
    await f.t.run(async (ctx) => {
      const target = { kind: "person" as const, id: f.admin.personId }
      const reportId = await ctx.db.insert("reports", { networkId: f.network, target, targetKind: "person", targetId: f.admin.personId, ownerPersonId: f.admin.personId, reason: "Recette de garde", level: "network", status: "actioned", createdAt: NOW, updatedAt: NOW })
      await ctx.db.insert("sanctions", { networkId: f.network, reportId, personId: f.admin.personId, kind: "mute", status: "active", reason: "Recette de garde", target, createdAt: NOW, updatedAt: NOW })
    })
    const before = await writes(f)
    expect(await doors(session.as, f.network).settings()).toHaveLength(8)
    expect(await refusalOf(doors(session.as, f.network).setFeature())).toEqual({ code: "policyRefused" })
    expect(await writes(f)).toEqual(before)
  })
})

describe("revue CH-815 A1b — le sceau de la preuve (`recordIdnSession`)", () => {
  it("refuse une clé d'application inconnue ou native, et un nouveau sceau différent ; le même sceau est idempotent", async () => {
    const f = await fixture()
    const operatorRequired = { code: "operatorRequired" }
    const sealWith = async (session: Session, application?: string) => {
      await f.t.mutation(internal.modules.people.identity.recordIdnProof, { subject: f.admin.idnSubject, loa: 2 })
      return await refusalOf(f.t.mutation(internal.modules.platform.operatorAccess.recordIdnSession, {
        sessionId: session.sessionId, authUserId: f.admin.authUserId, idnSubject: f.admin.idnSubject, loa: 2, ...(application !== undefined ? { application } : {}),
      }))
    }
    const fresh = await openSession(f.t, f.admin.authUserId)
    for (const application of ["inconnue", "antsia_mobile", "", "__proto__"]) expect(await sealWith(fresh, application), application).toEqual(operatorRequired)
    expect(await proofOf(f.t, fresh.sessionId)).toBeNull()

    const sealed = await idnSession(f.t, f.admin, ADMIN_APP)
    const proof = await proofOf(f.t, sealed.sessionId)
    for (const application of [MEMBERS_APP, CONSOLE_APP, undefined]) expect(await sealWith(sealed, application), String(application)).toEqual(operatorRequired)
    expect(await sealWith(sealed, ADMIN_APP)).toBeNull()
    expect(await proofOf(f.t, sealed.sessionId)).toEqual(proof)
  })
})
