// @vitest-environment edge-runtime
/**
 * CH-831 (ADR-0043, brouillon de l'architecte) — l'amorçage du PREMIER administrateur d'un réseau
 * administré, sur le déploiement de démonstration, par une fonction INTERNE que le propriétaire lance
 * de son terminal (`nameFirst`), et son retrait (`withdraw`).
 *
 * Recette écrite avant le code :
 * - fermée hors du développement local et de la démonstration DÉCLARÉE (une variable recopiée sur un
 *   autre déploiement n'ouvre rien) ;
 * - chaque refus est DISTINCT pour l'opérateur (code stable, aucune donnée de personne) : phrase de
 *   confirmation, réseau sans application d'administration, identifiant inconnu, adhésion absente ou en
 *   attente, compte de démonstration, lien IDN absent, motif court, vrai administrateur déjà présent ;
 * - un compte de démonstration qui tient déjà le rôle ne compte pas ;
 * - le succès pose le rôle et écrit UNE ligne `membership.role_set` (qualité `system`, sans acteur,
 *   `origin: "bootstrap"`) ; rejoué, rien n'est écrit ;
 * - la garde d'ADR-0042 ne change pas : la personne nommée n'entre dans l'administration qu'avec une
 *   session IDN prouvée de l'application d'administration ;
 * - le retrait est journalisé de même, et l'acte suivant de l'ancien administrateur est refusé.
 *
 * Noms de déploiement FICTIFS (cliquet `no-deployment-identifiers`).
 */
import { ConvexError } from "convex/values"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { api, components, internal } from "../../_generated/api"
import type { Id } from "../../_generated/dataModel"
import { DIASPORA_GA_DEMO_EMAIL_DOMAIN } from "../../lib/devTools"
import { SEED_CONFIRMATION } from "../../seeds/foundations"
import { joinDeclaredDiasporaFixture, createTestSession, testConvex } from "../../test.setup"
import { BOOTSTRAP_AUDIT_ORIGIN, nameFirstConfirmation, withdrawConfirmation } from "./networkAdminBootstrap"
import { NETWORK_ROLE_REASON_MIN } from "./networkRoles"

type T = ReturnType<typeof testConvex>
type As = ReturnType<T["withIdentity"]>
type Session = { sessionId: string; as: As }
type Account = Session & { authUserId: string; personId: Id<"persons">; idnSubject: string; handle: string }

const NOW = Date.UTC(2026, 10, 23, 10)
const B = internal.modules.platform.networkAdminBootstrap
const A = api.modules.networks.adminAccess
const F = api.modules.networks.features
/** L'application qui administre diaspora-ga au catalogue (`administers_network`). */
const ADMIN_APP = "admin_diaspora_ga"
const MEMBERS_APP = "diaspora_ga"
const SLUG = "diaspora-ga"
const REASON = "Premier administrateur de la démonstration, nommé par le propriétaire."
const DEMO_NAME = "demo-antsia-831"

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(NOW)
  declareDemo()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

/** La démonstration déclarée : en nuage, sous son propre nom, sans outil de développement. */
function declareDemo() {
  vi.stubEnv("ANTSIA_DEV_TOOLS", undefined)
  vi.stubEnv("ANTIA_DEV_TOOLS", undefined)
  vi.stubEnv("CONVEX_CLOUD_URL", `https://${DEMO_NAME}.convex.cloud`)
  vi.stubEnv("ANTSIA_DEMO_DEPLOYMENT", DEMO_NAME)
}

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
 * Une personne (compte IDN lié, garantie 2), profil publié ; entrée dans diaspora-ga sauf `join: false`.
 * Sa première session est une session ordinaire, NON scellée.
 */
async function account(t: T, network: Id<"networks">, handle: string, { email, join = true }: { email?: string; join?: boolean } = {}): Promise<Account> {
  const authUserId = idOf(await t.mutation(components.betterAuth.adapter.create, { input: { model: "user", data: { name: "Nom civil fictif non recopié", email: email ?? `${handle}@example.test`, emailVerified: true, createdAt: NOW, updatedAt: NOW } } }))
  const idnSubject = `idn-${handle}`
  await t.mutation(components.betterAuth.adapter.create, { input: { model: "account", data: { userId: authUserId, providerId: "idn", accountId: idnSubject, createdAt: NOW, updatedAt: NOW } } })
  await t.mutation(internal.modules.people.identity.recordIdnProof, { subject: idnSubject, loa: 2 })
  const session = await openSession(t, authUserId)
  const personId = await session.as.mutation(api.modules.people.persons.ensureMyPerson, {})
  await session.as.mutation(api.modules.people.consents.recordConsent, { purpose: "social_profile", origin: "onboarding" })
  await session.as.mutation(api.modules.people.profile.publishMyProfile, { handle, displayName: handle })
  await t.run(async (ctx) => {
    const link = await ctx.db.query("identityLinks").withIndex("by_person_and_provider", (q) => q.eq("personId", personId).eq("provider", "idn")).unique()
    if (link) await ctx.db.patch(link._id, { subject: idnSubject, loa: 2, nationality: "GA", revokedAt: undefined })
    else await ctx.db.insert("identityLinks", { personId, provider: "idn", subject: idnSubject, loa: 2, nationality: "GA", linkedAt: NOW })
  })
  if (join) await joinDeclaredDiasporaFixture(session.as, { networkId: network, facet: { countryOfResidence: "FR", city: "Paris" } })
  return { ...session, authUserId, personId, idnSubject, handle }
}

/** Prépare une adhésion fictive préexistante, puis restitue le déploiement hébergé testé. */
async function historicalDemoAccount(t: T, network: Id<"networks">, actor: string) {
  vi.stubEnv("CONVEX_CLOUD_URL", "http://127.0.0.1:3210")
  vi.stubEnv("ANTSIA_DEV_TOOLS", "true")
  try {
    return await account(t, network, `demo.${actor}`, { email: `${actor}@${DIASPORA_GA_DEMO_EMAIL_DOMAIN}` })
  } finally {
    declareDemo()
  }
}

async function patchMembership(t: T, networkId: Id<"networks">, personId: Id<"persons">, fields: { role?: "member" | "network_admin" | "network_moderator"; status?: "en_attente" | "declaree" | "verifiee" }) {
  await t.run(async (ctx) => {
    const row = await ctx.db.query("networkMemberships").withIndex("by_network_and_person", (q) => q.eq("networkId", networkId).eq("personId", personId)).unique()
    if (!row) throw new Error("Adhésion de fixture absente")
    await ctx.db.patch(row._id, fields)
  })
}

async function roleOf(t: T, networkId: Id<"networks">, personId: Id<"persons">) {
  return await t.run(async (ctx) => (await ctx.db.query("networkMemberships").withIndex("by_network_and_person", (q) => q.eq("networkId", networkId).eq("personId", personId)).unique())?.role ?? null)
}

/** Les lignes de changement de rôle au journal, dans l'ordre d'écriture. */
async function roleAudit(t: T) {
  return await t.run(async (ctx) => {
    const rows = await ctx.db.query("engineAudit").withIndex("by_at").take(200)
    return rows
      .filter((row) => row.action === "membership.role_set")
      .map((row) => ({ capacity: row.capacity, actorPersonId: row.actorPersonId, networkId: row.networkId, subjectTable: row.subjectTable, subjectId: row.subjectId, details: row.details }))
  })
}

/** Une NOUVELLE session de la personne, scellée par le retour IDN pour `application`. */
async function idnSession(t: T, who: Account, application: string): Promise<Session> {
  const session = await openSession(t, who.authUserId)
  await t.mutation(internal.modules.people.identity.recordIdnProof, { subject: who.idnSubject, loa: 2 })
  await t.mutation(internal.modules.platform.operatorAccess.recordIdnSession, { sessionId: session.sessionId, authUserId: who.authUserId, idnSubject: who.idnSubject, loa: 2, application })
  return session
}

function nameArgs(who: { handle: string }, overrides: Partial<{ confirmation: string; networkSlug: string; handle: string; reason: string }> = {}) {
  const networkSlug = overrides.networkSlug ?? SLUG
  const handle = overrides.handle ?? who.handle
  return { confirmation: nameFirstConfirmation(networkSlug, handle), networkSlug, handle, reason: REASON, ...overrides }
}

function withdrawArgs(who: { handle: string }, overrides: Partial<{ confirmation: string; reason: string }> = {}) {
  return { confirmation: withdrawConfirmation(SLUG, who.handle), networkSlug: SLUG, handle: who.handle, reason: REASON, ...overrides }
}

async function fixture() {
  const t = testConvex({ automaticSessions: false })
  await t.mutation(internal.seeds.foundations.run, { confirmNonProduction: SEED_CONFIRMATION })
  const { network } = await t.mutation(internal.modules.diaspora.seed.run, { confirmNonProduction: SEED_CONFIRMATION })
  const target = await account(t, network, "premiere.admin")
  return { t, network, target }
}

/** Le refus d'amorçage attendu : son code d'erreur du moteur et son code stable. */
function bootstrapRefusal(code: string, appRule: string) {
  return { code, appRule, appParams: {} }
}

/** Le résultat attendu d'un geste : la personne visée (identifiant NORMALISÉ), et son rôle d'avant et d'après. */
function result(who: Account, changed: boolean, from: string, to: string) {
  return { changed, from, to, personId: who.personId, handle: who.handle }
}

/** Le compte d'authentification de la personne, supprimé : son adresse ne se relit plus. */
async function deleteAuthUser(t: T, who: Account) {
  await t.mutation(components.betterAuth.adapter.deleteOne, { input: { model: "user", where: [{ field: "_id", value: who.authUserId }] } })
}

async function revokeIdnLink(t: T, who: Account) {
  await t.run(async (ctx) => {
    const link = await ctx.db.query("identityLinks").withIndex("by_person_and_provider", (q) => q.eq("personId", who.personId).eq("provider", "idn")).unique()
    if (!link) throw new Error("Lien IDN de fixture absent")
    await ctx.db.patch(link._id, { revokedAt: NOW })
  })
}

async function suspend(t: T, networkId: Id<"networks">, who: Account) {
  await t.run(async (ctx) => {
    const row = await ctx.db.query("networkMemberships").withIndex("by_network_and_person", (q) => q.eq("networkId", networkId).eq("personId", who.personId)).unique()
    if (!row) throw new Error("Adhésion de fixture absente")
    await ctx.db.patch(row._id, { status: "suspendue", statusBeforeSuspension: row.status === "verifiee" ? "verifiee" : "declaree" })
  })
}

describe("CH-831 — amorçage du premier administrateur : fermé hors démonstration déclarée", () => {
  it("la phrase de confirmation est ASCII, construite des arguments, distincte pour le retrait", () => {
    expect(nameFirstConfirmation("diaspora-ga", "premiere.admin")).toBe("NAME_FIRST_NETWORK_ADMIN diaspora-ga premiere.admin")
    expect(withdrawConfirmation("diaspora-ga", "premiere.admin")).toBe("WITHDRAW_NETWORK_ADMIN diaspora-ga premiere.admin")
    expect(nameFirstConfirmation("diaspora-ga", "premiere.admin")).toMatch(/^[\x20-\x7e]+$/)
  })

  it("refusée sans démonstration déclarée, quand la déclaration ne correspond pas au déploiement, ou par la seule variable des outils en nuage ; rien n'est écrit", async () => {
    const f = await fixture()
    const before = await roleAudit(f.t)
    // En nuage, sans déclaration.
    vi.stubEnv("ANTSIA_DEMO_DEPLOYMENT", undefined)
    expect(await refusalOf(f.t.mutation(B.nameFirst, nameArgs(f.target)))).toEqual(bootstrapRefusal("policyRefused", "bootstrap_closed"))
    // Déclaration recopiée sur un autre déploiement (la production, par exemple) : son nom ne correspond pas.
    vi.stubEnv("CONVEX_CLOUD_URL", "https://production-antsia-456.convex.cloud")
    vi.stubEnv("ANTSIA_DEMO_DEPLOYMENT", DEMO_NAME)
    expect(await refusalOf(f.t.mutation(B.nameFirst, nameArgs(f.target)))).toEqual(bootstrapRefusal("policyRefused", "bootstrap_closed"))
    expect(await refusalOf(f.t.mutation(B.withdraw, withdrawArgs(f.target)))).toEqual(bootstrapRefusal("policyRefused", "bootstrap_closed"))
    // Les outils de développement ne s'ouvrent jamais en nuage.
    vi.stubEnv("ANTSIA_DEMO_DEPLOYMENT", undefined)
    vi.stubEnv("ANTSIA_DEV_TOOLS", "true")
    expect(await refusalOf(f.t.mutation(B.nameFirst, nameArgs(f.target)))).toEqual(bootstrapRefusal("policyRefused", "bootstrap_closed"))
    expect(await roleOf(f.t, f.network, f.target.personId)).toBe("member")
    expect(await roleAudit(f.t)).toEqual(before)
  })

  it("ouverte en développement local (outils de développement sur un moteur local)", async () => {
    const f = await fixture()
    vi.stubEnv("ANTSIA_DEMO_DEPLOYMENT", undefined)
    vi.stubEnv("CONVEX_CLOUD_URL", "http://127.0.0.1:3210")
    vi.stubEnv("ANTSIA_DEV_TOOLS", "true")
    expect(await f.t.mutation(B.nameFirst, nameArgs(f.target))).toEqual(result(f.target, true, "member", "network_admin"))
  })
})

describe("CH-831 — chaque refus est distinct pour l'opérateur, et n'écrit rien", () => {
  it("phrase de confirmation fausse, ou celle de l'autre geste", async () => {
    const f = await fixture()
    expect(await refusalOf(f.t.mutation(B.nameFirst, nameArgs(f.target, { confirmation: "oui" })))).toEqual(bootstrapRefusal("invalidArgument", "bootstrap_confirmation"))
    expect(await refusalOf(f.t.mutation(B.nameFirst, nameArgs(f.target, { confirmation: withdrawConfirmation(SLUG, f.target.handle) })))).toEqual(bootstrapRefusal("invalidArgument", "bootstrap_confirmation"))
    // La phrase d'un autre identifiant ne vaut pas pour celui-ci.
    expect(await refusalOf(f.t.mutation(B.nameFirst, nameArgs(f.target, { confirmation: nameFirstConfirmation(SLUG, "autre.personne") })))).toEqual(bootstrapRefusal("invalidArgument", "bootstrap_confirmation"))
    expect(await refusalOf(f.t.mutation(B.withdraw, withdrawArgs(f.target, { confirmation: nameFirstConfirmation(SLUG, f.target.handle) })))).toEqual(bootstrapRefusal("invalidArgument", "bootstrap_confirmation"))
    expect(await roleAudit(f.t)).toEqual([])
  })

  it("réseau inconnu, archivé, ou sans application d'administration au catalogue", async () => {
    const f = await fixture()
    expect(await refusalOf(f.t.mutation(B.nameFirst, nameArgs(f.target, { networkSlug: "reseau-inconnu" })))).toEqual(bootstrapRefusal("notFound", "bootstrap_network_unknown"))
    // `test-closed` (graine des fondations) : actif, mais aucune application ne l'administre.
    expect(await refusalOf(f.t.mutation(B.nameFirst, nameArgs(f.target, { networkSlug: "test-closed" })))).toEqual(bootstrapRefusal("policyRefused", "bootstrap_network_not_administered"))
    await f.t.run(async (ctx) => { await ctx.db.patch(f.network, { status: "archived" }) })
    expect(await refusalOf(f.t.mutation(B.nameFirst, nameArgs(f.target)))).toEqual(bootstrapRefusal("policyRefused", "bootstrap_network_inactive"))
    expect(await roleAudit(f.t)).toEqual([])
  })

  it("identifiant inconnu", async () => {
    const f = await fixture()
    expect(await refusalOf(f.t.mutation(B.nameFirst, nameArgs(f.target, { handle: "personne.inconnue" })))).toEqual(bootstrapRefusal("notFound", "bootstrap_person_unknown"))
    expect(await refusalOf(f.t.mutation(B.nameFirst, nameArgs(f.target, { handle: "" })))).toEqual(bootstrapRefusal("notFound", "bootstrap_person_unknown"))
  })

  it("adhésion absente (jamais créée d'office), ou en attente", async () => {
    const f = await fixture()
    const outsider = await account(f.t, f.network, "hors.reseau", { join: false })
    expect(await refusalOf(f.t.mutation(B.nameFirst, nameArgs(outsider)))).toEqual(bootstrapRefusal("notFound", "bootstrap_membership_missing"))
    expect(await f.t.run(async (ctx) => await ctx.db.query("networkMemberships").withIndex("by_network_and_person", (q) => q.eq("networkId", f.network).eq("personId", outsider.personId)).unique())).toBeNull()
    await patchMembership(f.t, f.network, f.target.personId, { status: "en_attente" })
    expect(await refusalOf(f.t.mutation(B.nameFirst, nameArgs(f.target)))).toEqual(bootstrapRefusal("statusInsufficient", "bootstrap_membership_inactive"))
    expect(await roleOf(f.t, f.network, f.target.personId)).toBe("member")
    expect(await roleAudit(f.t)).toEqual([])
  })

  it("compte de démonstration (domaine réservé), même entré dans le réseau avec un lien IDN", async () => {
    const f = await fixture()
    const demo = await historicalDemoAccount(f.t, f.network, "figurant")
    expect(await refusalOf(f.t.mutation(B.nameFirst, nameArgs(demo)))).toEqual(bootstrapRefusal("policyRefused", "bootstrap_demo_account"))
    expect(await roleOf(f.t, f.network, demo.personId)).toBe("member")
  })

  it("aucun lien IDN vivant", async () => {
    const f = await fixture()
    await f.t.run(async (ctx) => {
      const link = await ctx.db.query("identityLinks").withIndex("by_person_and_provider", (q) => q.eq("personId", f.target.personId).eq("provider", "idn")).unique()
      if (!link) throw new Error("Lien IDN de fixture absent")
      await ctx.db.patch(link._id, { revokedAt: NOW })
    })
    expect(await refusalOf(f.t.mutation(B.nameFirst, nameArgs(f.target)))).toEqual(bootstrapRefusal("policyRefused", "bootstrap_idn_link_missing"))
    expect(await roleAudit(f.t)).toEqual([])
  })

  it("motif trop court (la borne de la console)", async () => {
    const f = await fixture()
    expect(await refusalOf(f.t.mutation(B.nameFirst, nameArgs(f.target, { reason: "   court   " })))).toEqual({ code: "invalidArgument", rule: "DECISION_REASON_LENGTH", params: { min: NETWORK_ROLE_REASON_MIN, max: 500 } })
    expect(await roleAudit(f.t)).toEqual([])
  })

  it("un vrai administrateur actif (compte non de démonstration) est déjà là : refusé, par l'amorçage comme par une nomination antérieure", async () => {
    const f = await fixture()
    const second = await account(f.t, f.network, "seconde.admin")
    expect((await f.t.mutation(B.nameFirst, nameArgs(f.target))).changed).toBe(true)
    expect(await refusalOf(f.t.mutation(B.nameFirst, nameArgs(second)))).toEqual(bootstrapRefusal("conflict", "bootstrap_admin_present"))
    expect(await roleOf(f.t, f.network, second.personId)).toBe("member")
    expect(await roleAudit(f.t)).toHaveLength(1)
  })

  it("effacement demandé ou fait : la personne n'est pas nommée", async () => {
    const f = await fixture()
    await f.t.run(async (ctx) => { await ctx.db.patch(f.target.personId, { deletionRequestedAt: NOW }) })
    expect(await refusalOf(f.t.mutation(B.nameFirst, nameArgs(f.target)))).toEqual(bootstrapRefusal("policyRefused", "bootstrap_person_erasing"))
    await f.t.run(async (ctx) => { await ctx.db.patch(f.target.personId, { deletionRequestedAt: undefined, erasedAt: NOW }) })
    expect(await refusalOf(f.t.mutation(B.nameFirst, nameArgs(f.target)))).toEqual(bootstrapRefusal("policyRefused", "bootstrap_person_erasing"))
    expect(await roleOf(f.t, f.network, f.target.personId)).toBe("member")
    expect(await roleAudit(f.t)).toEqual([])
  })

  it("fermé par défaut : un administrateur au compte d'authentification illisible compte comme un vrai administrateur", async () => {
    const f = await fixture()
    const holder = await account(f.t, f.network, "admin.illisible")
    await patchMembership(f.t, f.network, holder.personId, { role: "network_admin" })
    await deleteAuthUser(f.t, holder)
    expect(await refusalOf(f.t.mutation(B.nameFirst, nameArgs(f.target)))).toEqual(bootstrapRefusal("conflict", "bootstrap_admin_present"))
    expect(await roleOf(f.t, f.network, f.target.personId)).toBe("member")
  })

  it("un administrateur sans lien IDN compte encore : le propriétaire le retire, puis nomme", async () => {
    const f = await fixture()
    const holder = await account(f.t, f.network, "admin.sans.idn")
    await patchMembership(f.t, f.network, holder.personId, { role: "network_admin" })
    await revokeIdnLink(f.t, holder)
    expect(await refusalOf(f.t.mutation(B.nameFirst, nameArgs(f.target)))).toEqual(bootstrapRefusal("conflict", "bootstrap_admin_present"))
    expect(await f.t.mutation(B.withdraw, withdrawArgs(holder))).toEqual(result(holder, true, "network_admin", "member"))
    expect(await f.t.mutation(B.nameFirst, nameArgs(f.target))).toEqual(result(f.target, true, "member", "network_admin"))
  })
})

describe("CH-831 — le succès : rôle posé, une ligne au journal, rejeu sans effet", () => {
  it("accepté même si un compte de démonstration tient déjà le rôle (le catalogue de démonstration l'équipe)", async () => {
    const f = await fixture()
    const demoAdmin = await historicalDemoAccount(f.t, f.network, "administrateur")
    await patchMembership(f.t, f.network, demoAdmin.personId, { role: "network_admin" })
    expect(await f.t.mutation(B.nameFirst, nameArgs(f.target))).toEqual(result(f.target, true, "member", "network_admin"))
    expect(await roleOf(f.t, f.network, f.target.personId)).toBe("network_admin")
  })

  it("un vrai administrateur SUSPENDU ne compte pas (il n'exerce plus le rôle)", async () => {
    const f = await fixture()
    const suspended = await account(f.t, f.network, "admin.suspendu")
    await patchMembership(f.t, f.network, suspended.personId, { role: "network_admin" })
    await suspend(f.t, f.network, suspended)
    expect(await f.t.mutation(B.nameFirst, nameArgs(f.target))).toEqual(result(f.target, true, "member", "network_admin"))
  })

  it("un identifiant non normalisé (`@Premiere.Admin`) est accepté ; le résultat rend l'identifiant normalisé", async () => {
    const f = await fixture()
    const typed = "  @Premiere.Admin "
    expect(await f.t.mutation(B.nameFirst, nameArgs(f.target, { handle: typed }))).toEqual(result(f.target, true, "member", "network_admin"))
    expect(f.target.handle).toBe("premiere.admin")
    expect(await f.t.mutation(B.withdraw, { confirmation: withdrawConfirmation(SLUG, typed), networkSlug: SLUG, handle: typed, reason: REASON })).toEqual(result(f.target, true, "network_admin", "member"))
  })

  it("une ligne `membership.role_set` du système (sans acteur), origine `bootstrap` ; rejoué, rien de plus", async () => {
    const f = await fixture()
    expect(await f.t.mutation(B.nameFirst, nameArgs(f.target))).toEqual(result(f.target, true, "member", "network_admin"))
    const line = { capacity: "system", actorPersonId: undefined, networkId: f.network, subjectTable: "persons", subjectId: f.target.personId, details: { reason: REASON, from: "member", to: "network_admin", origin: BOOTSTRAP_AUDIT_ORIGIN } }
    expect(BOOTSTRAP_AUDIT_ORIGIN).toBe("bootstrap")
    expect(await roleAudit(f.t)).toEqual([line])
    // Rejeu (même phrase) : rien ne change, aucune seconde ligne.
    expect(await f.t.mutation(B.nameFirst, nameArgs(f.target))).toEqual(result(f.target, false, "network_admin", "network_admin"))
    expect(await roleAudit(f.t)).toEqual([line])
  })

  it("la garde d'ADR-0042 ne change pas : la personne nommée n'administre qu'en session IDN prouvée de l'application d'administration", async () => {
    const f = await fixture()
    await f.t.mutation(B.nameFirst, nameArgs(f.target))
    // Sa session ordinaire (code) et une session IDN de l'application des membres : le refus du non-membre.
    expect(await refusalOf(f.target.as.query(A.myNetworkAdmin, { networkId: f.network }))).toEqual({ code: "notFound" })
    const members = await idnSession(f.t, f.target, MEMBERS_APP)
    expect(await refusalOf(members.as.query(A.myNetworkAdmin, { networkId: f.network }))).toEqual({ code: "notFound" })
    // La session prouvée de l'application d'administration : entrée, accès journalisé, puis une lecture d'administration.
    const admin = await idnSession(f.t, f.target, ADMIN_APP)
    expect(await admin.as.query(A.myNetworkAdmin, { networkId: f.network })).toMatchObject({ personId: f.target.personId, networkSlug: SLUG, accessLogged: false })
    await admin.as.mutation(A.recordAccess, { networkId: f.network })
    expect(await refusalOf(admin.as.query(F.settings, { networkId: f.network }))).toBeNull()
  })
})

describe("CH-831 — le retrait (`withdraw`), chemin de retour de l'amorçage", () => {
  it("journalisé de même, et l'acte suivant de l'ancien administrateur est refusé", async () => {
    const f = await fixture()
    // Un compte de démonstration administrateur reste : le retrait ne laisse pas le réseau sans administrateur actif.
    const demoAdmin = await historicalDemoAccount(f.t, f.network, "administrateur")
    await patchMembership(f.t, f.network, demoAdmin.personId, { role: "network_admin" })
    await f.t.mutation(B.nameFirst, nameArgs(f.target))
    const admin = await idnSession(f.t, f.target, ADMIN_APP)
    await admin.as.mutation(A.recordAccess, { networkId: f.network })
    expect(await refusalOf(admin.as.query(F.settings, { networkId: f.network }))).toBeNull()

    expect(await f.t.mutation(B.withdraw, withdrawArgs(f.target))).toEqual(result(f.target, true, "network_admin", "member"))
    expect(await roleOf(f.t, f.network, f.target.personId)).toBe("member")
    const line = (from: string, to: string) => ({ capacity: "system", actorPersonId: undefined, networkId: f.network, subjectTable: "persons", subjectId: f.target.personId, details: { reason: REASON, from, to, origin: "bootstrap" } })
    expect(await roleAudit(f.t)).toEqual([line("member", "network_admin"), line("network_admin", "member")])
    // Le rôle est relu à chaque appel : la même session prouvée et journalisée ne décide plus rien.
    expect(await refusalOf(admin.as.query(F.settings, { networkId: f.network }))).toEqual({ code: "notFound" })
    expect(await refusalOf(admin.as.query(A.myNetworkAdmin, { networkId: f.network }))).toEqual({ code: "notFound" })
  })

  it("refusé si la personne ne tient pas le rôle ; rien n'est écrit", async () => {
    const f = await fixture()
    expect(await refusalOf(f.t.mutation(B.withdraw, withdrawArgs(f.target)))).toEqual(bootstrapRefusal("conflict", "bootstrap_not_admin"))
    expect(await roleAudit(f.t)).toEqual([])
  })

  it("le DERNIER administrateur actif est retiré (option `allowLastAdmin`, démonstration seulement) ; deux lignes au journal, puis une autre personne est nommée", async () => {
    const f = await fixture()
    const other = await account(f.t, f.network, "autre.admin")
    await f.t.mutation(B.nameFirst, nameArgs(f.target))
    expect(await f.t.mutation(B.withdraw, withdrawArgs(f.target))).toEqual(result(f.target, true, "network_admin", "member"))
    expect(await roleOf(f.t, f.network, f.target.personId)).toBe("member")
    expect((await roleAudit(f.t)).map((row) => row.details)).toEqual([
      { reason: REASON, from: "member", to: "network_admin", origin: "bootstrap" },
      { reason: REASON, from: "network_admin", to: "member", origin: "bootstrap" },
    ])
    // Plus aucun vrai administrateur actif : l'amorçage nomme quelqu'un d'autre.
    expect(await f.t.mutation(B.nameFirst, nameArgs(other))).toEqual(result(other, true, "member", "network_admin"))
    expect(await roleAudit(f.t)).toHaveLength(3)
  })

  it("« retirer un pouvoir n'attend jamais » : lien IDN révoqué après la nomination → accepté et journalisé", async () => {
    const f = await fixture()
    await f.t.mutation(B.nameFirst, nameArgs(f.target))
    await revokeIdnLink(f.t, f.target)
    expect(await f.t.mutation(B.withdraw, withdrawArgs(f.target))).toEqual(result(f.target, true, "network_admin", "member"))
    expect((await roleAudit(f.t)).at(-1)).toMatchObject({ capacity: "system", subjectId: f.target.personId, details: { from: "network_admin", to: "member", origin: "bootstrap" } })
  })

  it("adhésion suspendue → accepté", async () => {
    const f = await fixture()
    await f.t.mutation(B.nameFirst, nameArgs(f.target))
    await suspend(f.t, f.network, f.target)
    expect(await f.t.mutation(B.withdraw, withdrawArgs(f.target))).toEqual(result(f.target, true, "network_admin", "member"))
    expect(await roleAudit(f.t)).toHaveLength(2)
  })

  it("compte d'authentification illisible → accepté", async () => {
    const f = await fixture()
    await f.t.mutation(B.nameFirst, nameArgs(f.target))
    await deleteAuthUser(f.t, f.target)
    expect(await f.t.mutation(B.withdraw, withdrawArgs(f.target))).toEqual(result(f.target, true, "network_admin", "member"))
    expect(await roleAudit(f.t)).toHaveLength(2)
  })

  it("`demo.administrateur` (compte de démonstration lisible) : son rôle appartient au catalogue de démonstration → refusé", async () => {
    const f = await fixture()
    const demoAdmin = await historicalDemoAccount(f.t, f.network, "administrateur")
    await patchMembership(f.t, f.network, demoAdmin.personId, { role: "network_admin" })
    expect(await refusalOf(f.t.mutation(B.withdraw, withdrawArgs(demoAdmin)))).toEqual(bootstrapRefusal("policyRefused", "bootstrap_demo_account"))
    expect(await roleOf(f.t, f.network, demoAdmin.personId)).toBe("network_admin")
    expect(await roleAudit(f.t)).toEqual([])
  })
})
