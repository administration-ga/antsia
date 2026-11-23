// @vitest-environment edge-runtime
/** Comptes de démonstration de DIASPORA.GA : développement local ou démonstration déclarée (ADR-0038), vraie session, actes réservés à l'acteur de l'adresse. */
import { engineErrorCode } from "@antsia/social-contracts/errors"
import { NETWORK_FEATURES, type NetworkFeature } from "@antsia/social-domain/networkFeatures"
import {
  DAY_MS,
  DIASPORA_GA_DEMO_ACTOR_SPECS,
  DIASPORA_GA_DEMO_ACTORS,
  DIASPORA_GA_DEMO_COUNTRIES,
  type DiasporaGaDemoActor,
  diasporaGaDemoActorsOffered,
  diasporaGaDemoDisplayName,
  diasporaGaDemoEmailOf,
  type MembershipStatus,
} from "@diaspora-ga/domain"
import { afterEach, describe, expect, it, vi } from "vitest"

import { api, components, internal } from "../../_generated/api"
import type { Id } from "../../_generated/dataModel"
import { demoGateDigest } from "../../lib/demoGate"
import { DIASPORA_GA_DEMO_EMAIL_DOMAIN } from "../../lib/devTools"
import { SEED_CONFIRMATION } from "../../seeds/foundations"
import { createTestSession, openNetworkFeatures, openTestNetworkAdminSession, testConvex } from "../../test.setup"
import { liveSignatoryRole } from "../pages/access"
import { admitRequestImpl, allowPhonesImpl, completeVerifyImpl, DEMO_GATE_SESSION_TTL_MS, revokePhonesImpl } from "../platform/demoGate"

type T = ReturnType<typeof testConvex>
type As = ReturnType<T["withIdentity"]>

/** L'équipe de modération de démonstration et le domaine réservé, écrits en clair : une dérive du module doit casser le test. */
const DEMO_TEAM_NAME = "Équipe de démonstration"
const DEMO_EMAIL_DOMAIN = "demo.diaspora-ga.test"

function idOf(row: unknown): string {
  if (!row || typeof row !== "object" || !("_id" in row) || typeof row._id !== "string") throw new Error("Document de fixture absent")
  return row._id
}

function present<Row>(row: Row | null | undefined, label: string): Row {
  if (row === null || row === undefined) throw new Error(`Document de fixture absent : ${label}`)
  return row
}

async function code(promise: Promise<unknown>) {
  try {
    await promise
    return null
  } catch (error) {
    return engineErrorCode(error)
  }
}

/** La double garde ouverte : variable posée ET backend local. */
function openDevTools() {
  vi.stubEnv("ANTSIA_DEV_TOOLS", "true")
  vi.stubEnv("CONVEX_CLOUD_URL", "http://127.0.0.1:3210")
}

/** La garde fermée quoi que le shell de la personne qui lance les tests ait posé (déclaration de démonstration comprise). */
function closeDevTools() {
  vi.stubEnv("ANTSIA_DEV_TOOLS", "false")
  vi.stubEnv("ANTIA_DEV_TOOLS", "false")
  vi.stubEnv("ANTSIA_DEMO_DEPLOYMENT", "")
}

/** Le déploiement de démonstration déclaré (ADR-0029, ADR-0038) : en nuage, sous son propre nom, sans aucun outil de développement. */
function declareDemo(name = "demo-antsia-123") {
  closeDevTools()
  vi.stubEnv("CONVEX_CLOUD_URL", "https://demo-antsia-123.convex.cloud")
  vi.stubEnv("ANTSIA_DEMO_DEPLOYMENT", name)
}

afterEach(() => {
  vi.unstubAllEnvs()
})

/**
 * Le moteur semé comme en développement local : fondations (la racine), puis le réseau diaspora-ga (la France
 * ouverte), avec les modules donnés ouverts (tous par défaut).
 */
async function fixture(features: readonly NetworkFeature[] = NETWORK_FEATURES) {
  const t = testConvex({ automaticSessions: false })
  const foundations = await t.mutation(internal.seeds.foundations.run, { confirmNonProduction: SEED_CONFIRMATION })
  const seeded = await t.mutation(internal.modules.diaspora.seed.run, { confirmNonProduction: SEED_CONFIRMATION })
  if (features.length > 0) await openNetworkFeatures(t, seeded.network, features)
  return { t, diasporaGa: seeded.network, root: foundations.root }
}

/** Des pays ouverts comme l'administration du réseau les ouvrirait (la graine n'ouvre que la France ; l'équipement n'en ouvre aucun). */
async function openCountries(t: T, diasporaGa: Id<"networks">, countries: readonly string[]) {
  await t.run(async (ctx) => {
    const network = present(await ctx.db.get(diasporaGa), "réseau")
    const open = network.openCountries ?? []
    await ctx.db.patch(diasporaGa, { openCountries: [...open, ...countries.filter((country) => !open.includes(country))] })
  })
}

/** Les acteurs que la règle propose (tous modules ouverts, la France seule ouverte par défaut) : en local, ou sur la démonstration en ligne. */
function offeredWith(local: boolean, countries: readonly string[] = ["FR"], features: readonly NetworkFeature[] = NETWORK_FEATURES) {
  return diasporaGaDemoActorsOffered({ openFeatures: features, openCountries: countries, local })
}

/** Les entrées du catalogue attendues pour ces acteurs (porte non armée : aucune échéance). */
function entriesOf(actors: readonly DiasporaGaDemoActor[]) {
  return actors.map((actor) => ({ actor, email: `${actor}@${DEMO_EMAIL_DOMAIN}` }))
}

// ─── La porte des comptes de démonstration (CH-817 E2), armée pour les tests du lot E3 ───
// Valeurs FICTIVES : numéro de la plage réservée à la fiction (Ofcom, 07700 900xxx), domaine `.test`.
const GATE_SECRET = "fictional-demo-gate-secret-0123456789abcdef"
const GATE_WHATSAPP = {
  WHATSAPP_PROVIDER: "bird",
  WHATSAPP_ENDPOINT: "https://whatsapp.example.test/messages",
  WHATSAPP_API_KEY: "fictional-access-key-0123456789",
  WHATSAPP_TEMPLATE: "fictional-project:fictional-version",
}
const GATE_PHONE = "+447700900123"
const GATE_TOKEN = "fictional_session_token_0123456789abcdefABC"
const GATE_SCOPE = "diaspora-ga" as const
const GATED_DEMO_ENV = {
  CONVEX_CLOUD_URL: "https://demo-antsia-123.convex.cloud",
  ANTSIA_DEMO_DEPLOYMENT: "demo-antsia-123",
  ANTSIA_DEMO_GATE_SECRET: GATE_SECRET,
  ...GATE_WHATSAPP,
}

/** La démonstration déclarée, porte ARMÉE (secret et envoi WhatsApp configurés). */
function armGate() {
  declareDemo()
  vi.stubEnv("ANTSIA_DEMO_GATE_SECRET", GATE_SECRET)
  for (const [key, value] of Object.entries(GATE_WHATSAPP)) vi.stubEnv(key, value)
}

/**
 * Une session de porte ouverte par le vrai chemin du magasin (liste, défi, vérification) à
 * l'instant `now` : elle vaut trente minutes à partir de là. Rend son échéance.
 */
async function openGateSession(t: T, now: number, label = "e3"): Promise<number> {
  await t.run((ctx) => allowPhonesImpl(ctx, { scope: GATE_SCOPE, phones: [GATE_PHONE] }, now, GATED_DEMO_ENV))
  const challengeId = `${label}-challenge`.padEnd(32, "x")
  const codeDigest = await demoGateDigest(GATE_SECRET, "demo-gate-code", label)
  const phoneHash = await demoGateDigest(GATE_SECRET, "demo-gate-phone", GATE_PHONE)
  const tokenDigest = await demoGateDigest(GATE_SECRET, "demo-gate-session", GATE_TOKEN)
  expect(await t.run((ctx) => admitRequestImpl(ctx, { scope: GATE_SCOPE, phoneHash, ipKeyHash: "1".repeat(64), challengeId, codeDigest }, now))).toEqual({ status: "decided", deliver: true })
  const verified = await t.run((ctx) => completeVerifyImpl(ctx, { scope: GATE_SCOPE, challengeId, expectedCodeDigest: codeDigest, codeMatches: true, tokenDigest }, now))
  if (!verified.ok) throw new Error("session de porte de test non ouverte")
  return verified.expiresAt
}

/** Une vraie session Better Auth sur cette adresse, et sa personne. */
async function signedIn(t: T, email: string, emailVerified = true) {
  const now = Date.now()
  const authUserId = idOf(await t.mutation(components.betterAuth.adapter.create, { input: { model: "user", data: { name: "ANTSIA", email, emailVerified, createdAt: now, updatedAt: now } } }))
  const sessionId = await createTestSession(t, authUserId)
  const as = t.withIdentity({ subject: authUserId, sessionId })
  const personId = await as.mutation(api.modules.people.persons.ensureMyPerson, {})
  return { as, authUserId, personId }
}

/** L'accueil réel (consentement, profil publié), comme l'automate de l'application le rejoue. */
async function welcomed(t: T, options: { email: string; handle: string; displayName: string; emailVerified?: boolean }) {
  const user = await signedIn(t, options.email, options.emailVerified)
  await user.as.mutation(api.modules.people.consents.recordConsent, { purpose: "social_profile", origin: "onboarding" })
  await user.as.mutation(api.modules.people.profile.publishMyProfile, { handle: options.handle, displayName: options.displayName })
  return user
}

/** L'accueil puis l'entrée réelle dans diaspora-ga (annuaire masqué : aucun consentement d'annuaire à rejouer). */
async function joinedAs(t: T, diasporaGa: Id<"networks">, options: { email: string; handle: string; displayName: string; country: string; emailVerified?: boolean }) {
  const user = await welcomed(t, options)
  await user.as.mutation(api.modules.diaspora.membership.joinDiasporaGa, {
    networkId: diasporaGa,
    facet: { countryOfResidence: options.country },
    directoryVisibility: "hidden",
  })
  return user
}

/** L'adresse réservée, l'identifiant, le nom affiché et le pays qu'un acteur du catalogue porte à l'accueil. */
function optionsOf(actor: DiasporaGaDemoActor) {
  const spec = DIASPORA_GA_DEMO_ACTOR_SPECS[actor]
  const displayName = diasporaGaDemoDisplayName(actor)
  if (spec.profile === null || displayName === null) throw new Error(`Acteur sans profil : ${actor}`)
  return { email: diasporaGaDemoEmailOf(actor), handle: spec.profile.handle, displayName, country: spec.country }
}

/** Un acteur du catalogue connecté sur son adresse réservée, l'accueil réel rejoué (sans entrer dans le réseau). */
async function welcomedActor(t: T, actor: DiasporaGaDemoActor) {
  return { ...(await welcomed(t, optionsOf(actor))), actor }
}

/** Un acteur du catalogue connecté sur son adresse réservée, avec l'accueil et l'entrée que l'application rejoue pour lui. */
async function joinedActor(t: T, diasporaGa: Id<"networks">, actor: DiasporaGaDemoActor) {
  return { ...(await joinedAs(t, diasporaGa, optionsOf(actor))), actor }
}

async function equip(as: As, actor: DiasporaGaDemoActor) {
  return await as.mutation(api.modules.diaspora.demoAccounts.equipMyDemoAccount, { actor })
}

async function networkOf(t: T, diasporaGa: Id<"networks">) {
  return present(await t.run(async (ctx) => await ctx.db.get(diasporaGa)), "réseau")
}

async function membershipOf(t: T, diasporaGa: Id<"networks">, personId: Id<"persons">) {
  return present(
    await t.run(async (ctx) => await ctx.db.query("networkMemberships").withIndex("by_network_and_person", (q) => q.eq("networkId", diasporaGa).eq("personId", personId)).unique()),
    "adhésion",
  )
}

async function linkOf(t: T, personId: Id<"persons">, provider: "idn" | "consular_attestation") {
  return await t.run(async (ctx) => await ctx.db.query("identityLinks").withIndex("by_person_and_provider", (q) => q.eq("personId", personId).eq("provider", provider)).unique())
}

/** Les comptes IDN d'un utilisateur, lus dans le composant d'authentification (où ils vivent). */
async function idnAccountIdsOf(t: T, authUserId: string): Promise<string[]> {
  const result: { page: { accountId: string }[] } = await t.query(components.betterAuth.adapter.findMany, {
    model: "account",
    where: [{ field: "providerId", value: "idn" }, { field: "userId", value: authUserId }],
    paginationOpts: { cursor: null, numItems: 5 },
  })
  return result.page.map((account) => account.accountId)
}

async function attestationRowsOf(t: T, personId: Id<"persons">) {
  return await t.run(async (ctx) => await ctx.db.query("consularAttestations").withIndex("by_person_and_requestedAt", (q) => q.eq("personId", personId)).take(10))
}

async function sponsorshipsOf(t: T, diasporaGa: Id<"networks">) {
  return await t.run(async (ctx) => await ctx.db.query("sponsorships").withIndex("by_network_and_sponsored", (q) => q.eq("networkId", diasporaGa)).take(10))
}

async function pageOf(t: T, handle: string) {
  return await t.run(async (ctx) => await ctx.db.query("pages").withIndex("by_handle", (q) => q.eq("handle", handle)).unique())
}

async function pagesOf(t: T, diasporaGa: Id<"networks">) {
  return await t.run(async (ctx) => await ctx.db.query("pages").withIndex("by_network_status_trustRank_createdAt", (q) => q.eq("networkId", diasporaGa)).take(10))
}

async function signatoriesOf(t: T, personId: Id<"persons">) {
  return await t.run(async (ctx) => await ctx.db.query("pageSignatories").withIndex("by_person", (q) => q.eq("personId", personId)).take(10))
}

async function hubsOf(t: T, diasporaGa: Id<"networks">) {
  return await t.run(async (ctx) => await ctx.db.query("countryHubs").withIndex("by_network_and_country", (q) => q.eq("networkId", diasporaGa)).take(10))
}

async function teamsOf(t: T, diasporaGa: Id<"networks">) {
  return await t.run(async (ctx) => await ctx.db.query("moderationTeams").withIndex("by_network_active", (q) => q.eq("networkId", diasporaGa)).take(10))
}

async function teamMembersOf(t: T, teamId: Id<"moderationTeams">) {
  return await t.run(async (ctx) => await ctx.db.query("moderationTeamMembers").withIndex("by_team_person", (q) => q.eq("teamId", teamId)).take(10))
}

async function rootMembershipOf(t: T, root: Id<"networks">, personId: Id<"persons">) {
  return await t.run(async (ctx) => await ctx.db.query("networkMemberships").withIndex("by_network_and_person", (q) => q.eq("networkId", root).eq("personId", personId)).unique())
}

/** Les intentions de blocage posées contre une personne (celles qu'écrit `blockPerson`). */
async function blocksAgainst(t: T, personId: Id<"persons">) {
  return await t.run(async (ctx) => await ctx.db.query("personBlocks").withIndex("by_target_createdAt", (q) => q.eq("targetPersonId", personId)).take(10))
}

/** Les lignes de relation fermées par une personne, tous réseaux. */
async function blockedRowsBy(t: T, personId: Id<"persons">) {
  return await t.run(async (ctx) => await ctx.db.query("connections").withIndex("by_blocker_status_updatedAt", (q) => q.eq("blockedByPersonId", personId).eq("status", "blocked")).take(10))
}

/** Une lecture de membre ordinaire, jugée par la garde du moteur (adhésion, statut, suspension racine) : `null` si elle passe. */
async function readsNetwork(as: As, networkId: Id<"networks">) {
  return await code(as.query(api.modules.graph.blocks.paginateMine, { networkId, source: "intents", paginationOpts: { cursor: null, numItems: 5 } }))
}

/** Ce que l'équipement écrit, relu d'un coup : un refus doit le laisser exactement ainsi. */
async function footprintOf(t: T, diasporaGa: Id<"networks">, personId: Id<"persons">) {
  const membership = await membershipOf(t, diasporaGa, personId)
  return {
    status: membership.status,
    role: membership.role,
    idn: (await linkOf(t, personId, "idn")) !== null,
    attestation: (await linkOf(t, personId, "consular_attestation")) !== null,
    pages: (await signatoriesOf(t, personId)).length,
    openCountries: (await networkOf(t, diasporaGa)).openCountries,
  }
}

const UNTOUCHED = { status: "en_attente", role: "member", idn: false, attestation: false, pages: 0, openCountries: ["FR"] }

/** Le parrain de la démonstration est vérifié depuis plus de 30 jours (le délai de parrainage, strictement). */
async function expectSeasonedSponsor(t: T, diasporaGa: Id<"networks">, personId: Id<"persons">) {
  const membership = await membershipOf(t, diasporaGa, personId)
  expect(membership.status).toBe("verifiee")
  expect(Date.now() - membership.statusChangedAt).toBeGreaterThan(30 * DAY_MS)
}

describe("comptes de démonstration DIASPORA.GA — garde de développement", () => {
  it("fermés sans les outils de développement : catalogue vide et équipement refusé", async () => {
    closeDevTools()
    const { t, diasporaGa } = await fixture()
    expect(await t.query(api.modules.diaspora.demoAccounts.catalogue, {})).toEqual([])
    const institution = await joinedActor(t, diasporaGa, "institution")
    expect(await code(equip(institution.as, "institution"))).toBe("policyRefused")
    // Le refus ne laisse aucune trace : ni faits fictifs, ni page, ni pays ouverts.
    expect(await footprintOf(t, diasporaGa, institution.personId)).toEqual(UNTOUCHED)
    expect(await pageOf(t, "demo-poste-consulaire")).toBeNull()

    // Contrôle : la garde seule refusait. Ouverte, le même appel de la même session aboutit.
    openDevTools()
    expect(await t.query(api.modules.diaspora.demoAccounts.catalogue, {})).toHaveLength(offeredWith(true).length)
    expect(await equip(institution.as, "institution")).toMatchObject({ status: "verifiee", pageCreated: true })
    expect(await footprintOf(t, diasporaGa, institution.personId)).toMatchObject({ status: "verifiee", idn: true, attestation: true, pages: 1 })
  })

  it("une variable posée sur un déploiement en nuage n'ouvre rien", async () => {
    vi.stubEnv("ANTSIA_DEV_TOOLS", "true")
    vi.stubEnv("CONVEX_CLOUD_URL", "https://exemple.convex.cloud")
    const { t, diasporaGa } = await fixture()
    expect(await t.query(api.modules.diaspora.demoAccounts.catalogue, {})).toEqual([])
    const institution = await joinedActor(t, diasporaGa, "institution")
    expect(await code(equip(institution.as, "institution"))).toBe("policyRefused")
    expect(await footprintOf(t, diasporaGa, institution.personId)).toEqual(UNTOUCHED)

    // Contrôle : la même variable sur un backend local ouvre bien la garde.
    vi.stubEnv("CONVEX_CLOUD_URL", "http://127.0.0.1:3210")
    expect(await t.query(api.modules.diaspora.demoAccounts.catalogue, {})).toHaveLength(offeredWith(true).length)
    expect(await equip(institution.as, "institution")).toMatchObject({ status: "verifiee" })
  })

  it("le catalogue nomme les acteurs PROPOSÉS par la règle, dans l'ordre du domaine, sur le domaine réservé (CH-817 E3)", async () => {
    openDevTools()
    const { t, diasporaGa } = await fixture()
    const entries = await t.query(api.modules.diaspora.demoAccounts.catalogue, {})
    // En local, tous modules ouverts, la France seule ouverte : tous sauf la Belgique et le Canada.
    expect(entries).toHaveLength(offeredWith(true).length)
    expect(entries.map((entry) => entry.actor)).toEqual(DIASPORA_GA_DEMO_ACTORS.filter((actor) => actor !== "belgique" && actor !== "canada"))
    expect(entries).toEqual(entriesOf(offeredWith(true)))
    // Les vingt et un acteurs déclarés reparaissent tous quand leurs pays s'ouvrent : la liste déclarée ne change pas.
    await openCountries(t, diasporaGa, ["BE", "CA"])
    expect(await t.query(api.modules.diaspora.demoAccounts.catalogue, {})).toEqual(entriesOf(DIASPORA_GA_DEMO_ACTORS))
  })
})

describe("comptes de démonstration DIASPORA.GA — démonstration déclarée (ADR-0038)", () => {
  it("ouverts sur le déploiement de démonstration déclaré, sans outil de développement : catalogue de la règle et modératrice équipée", async () => {
    declareDemo()
    const { t, diasporaGa } = await fixture()
    // En ligne : ni les acteurs de recette, ni ceux d'un pays fermé (CH-817 E3).
    expect(await t.query(api.modules.diaspora.demoAccounts.catalogue, {})).toEqual(entriesOf(offeredWith(false)))
    const { as, personId } = await joinedActor(t, diasporaGa, "moderateur")
    expect(await equip(as, "moderateur")).toEqual({ actor: "moderateur", status: "verifiee", role: "network_moderator", pageId: null, pageCreated: false })
    const team = present((await teamsOf(t, diasporaGa))[0], "équipe")
    expect(team.name).toBe(DEMO_TEAM_NAME)
    expect(await teamMembersOf(t, team._id)).toEqual([expect.objectContaining({ personId, active: true })])
  })

  it("la déclaration recopiée sur un autre déploiement (la production comprise) n'ouvre rien ; contrôle : sous son nom, si", async () => {
    declareDemo("demo-antsia-123")
    vi.stubEnv("CONVEX_CLOUD_URL", "https://production-antsia-456.convex.cloud")
    const { t, diasporaGa } = await fixture()
    expect(await t.query(api.modules.diaspora.demoAccounts.catalogue, {})).toEqual([])
    const institution = await joinedActor(t, diasporaGa, "institution")
    expect(await code(equip(institution.as, "institution"))).toBe("policyRefused")
    expect(await footprintOf(t, diasporaGa, institution.personId)).toEqual(UNTOUCHED)

    vi.stubEnv("CONVEX_CLOUD_URL", "https://demo-antsia-123.convex.cloud")
    expect(await t.query(api.modules.diaspora.demoAccounts.catalogue, {})).toHaveLength(offeredWith(false).length)
    expect(await equip(institution.as, "institution")).toMatchObject({ status: "verifiee", pageCreated: true })
  })

  it("le domaine réservé du moteur est celui des adresses de la tranche", () => {
    expect(DIASPORA_GA_DEMO_EMAIL_DOMAIN).toBe(DEMO_EMAIL_DOMAIN)
    for (const actor of DIASPORA_GA_DEMO_ACTORS) expect(diasporaGaDemoEmailOf(actor).endsWith(`@${DIASPORA_GA_DEMO_EMAIL_DOMAIN}`)).toBe(true)
  })
})

describe("comptes de démonstration DIASPORA.GA — refus", () => {
  it("refuse une session dont l'adresse vérifiée est celle d'un autre acteur, ou hors du domaine réservé", async () => {
    openDevTools()
    const { t, diasporaGa } = await fixture()
    // Un compte léger qui réclame le rôle d'administrateur : l'adresse fait foi, jamais l'argument.
    const light = await joinedActor(t, diasporaGa, "leger")
    expect(await code(equip(light.as, "administrateur"))).toBe("policyRefused")
    expect(await footprintOf(t, diasporaGa, light.personId)).toEqual(UNTOUCHED)
    // Une adresse ordinaire, même avec un profil publié et une adhésion.
    const intruder = await joinedAs(t, diasporaGa, { email: "intrus@example.test", handle: "intrus.recette", displayName: "Intrus RECETTE", country: "FR" })
    expect(await code(equip(intruder.as, "leger"))).toBe("policyRefused")
    expect(await footprintOf(t, diasporaGa, intruder.personId)).toEqual(UNTOUCHED)
  })

  it("refuse une adresse réservée mais non vérifiée", async () => {
    openDevTools()
    const { t, diasporaGa } = await fixture()
    const unverified = await joinedAs(t, diasporaGa, { ...optionsOf("institution"), emailVerified: false })
    expect(await code(equip(unverified.as, "institution"))).toBe("policyRefused")
    expect(await footprintOf(t, diasporaGa, unverified.personId)).toEqual(UNTOUCHED)

    // Contrôle : une fois l'adresse vérifiée par le composant d'authentification, la même session est équipée.
    await t.mutation(components.betterAuth.adapter.updateOne, { input: { model: "user", where: [{ field: "_id", value: unverified.authUserId }], update: { emailVerified: true } } })
    expect(await equip(unverified.as, "institution")).toMatchObject({ status: "verifiee", pageCreated: true })
  })

  it("le nouvel arrivant n'a rien à équiper : l'accueil reste à remplir", async () => {
    openDevTools()
    const { t, diasporaGa } = await fixture()
    // Il a rempli l'accueil lui-même et rejoint le réseau : le refus tient au catalogue, pas à l'absence d'adhésion.
    const newcomer = await joinedAs(t, diasporaGa, { email: diasporaGaDemoEmailOf("nouveau"), handle: "nouveau.recette", displayName: "Nouveau RECETTE", country: "FR" })
    expect(await code(equip(newcomer.as, "nouveau"))).toBe("policyRefused")
    expect(await footprintOf(t, diasporaGa, newcomer.personId)).toEqual(UNTOUCHED)
  })

  it("exige l'adhésion faite par le vrai accueil : sans elle, introuvable", async () => {
    openDevTools()
    const { t, diasporaGa } = await fixture()
    // Profil publié et consentement donnés, mais l'entrée dans le réseau (joinDiasporaGa) jamais faite.
    const user = await welcomedActor(t, "leger")
    expect(await code(equip(user.as, "leger"))).toBe("notFound")
    const membership = await t.run(async (ctx) => await ctx.db.query("networkMemberships").withIndex("by_network_and_person", (q) => q.eq("networkId", diasporaGa).eq("personId", user.personId)).unique())
    expect(membership).toBeNull()
    // Rien n'a été créé à sa place : les pays de la démonstration ne sont pas ouverts non plus.
    expect((await networkOf(t, diasporaGa)).openCountries).toEqual(["FR"])
  })

  it("une adhésion quittée ne s'équipe pas non plus", async () => {
    openDevTools()
    const { t, diasporaGa } = await fixture()
    const leger = await joinedActor(t, diasporaGa, "leger")
    await leger.as.mutation(api.modules.diaspora.membership.leaveDiasporaGa, { networkId: diasporaGa })
    expect(await code(equip(leger.as, "leger"))).toBe("notFound")
    expect(await membershipOf(t, diasporaGa, leger.personId)).toMatchObject({ status: "partie" })
  })

  it("sans le réseau diaspora-ga semé, introuvable", async () => {
    openDevTools()
    const t = testConvex({ automaticSessions: false })
    await t.mutation(internal.seeds.foundations.run, { confirmNonProduction: SEED_CONFIRMATION })
    const user = await welcomedActor(t, "leger")
    expect(await code(equip(user.as, "leger"))).toBe("notFound")
  })
})

describe("comptes de démonstration DIASPORA.GA — statut dérivé des faits fictifs", () => {
  const derived: [DiasporaGaDemoActor, MembershipStatus][] = [
    ["leger", "en_attente"],
    ["declare", "declaree"],
    ["verifie", "verifiee"],
    ["canada", "declaree"],
    ["institution", "verifiee"],
  ]

  it.each(derived)("%s : le statut dérivé est « %s », celui du catalogue et de l'adhésion stockée", async (actor, status) => {
    openDevTools()
    const { t, diasporaGa } = await fixture()
    // Le Canada ouvert par l'administration du réseau : sans lui, l'acteur « canada » n'est pas proposé (CH-817 E3).
    await openCountries(t, diasporaGa, ["CA"])
    const { as, personId } = await joinedActor(t, diasporaGa, actor)
    const equipped = await equip(as, actor)
    expect(DIASPORA_GA_DEMO_ACTOR_SPECS[actor].expectedStatus).toBe(status)
    expect(equipped).toMatchObject({ actor, status, role: "member" })
    // Le statut rendu est celui qui est stocké : la vraie dérivation l'a écrit, la démonstration ne l'écrit jamais.
    expect((await membershipOf(t, diasporaGa, personId)).status).toBe(status)
    expect(await as.query(api.modules.diaspora.membership.myMembership, { networkId: diasporaGa })).toMatchObject({ status })
  })

  it("leger : aucun fait fictif n'est posé", async () => {
    openDevTools()
    const { t, diasporaGa } = await fixture()
    const { as, personId } = await joinedActor(t, diasporaGa, "leger")
    await equip(as, "leger")
    expect(await linkOf(t, personId, "idn")).toBeNull()
    expect(await linkOf(t, personId, "consular_attestation")).toBeNull()
    expect(await attestationRowsOf(t, personId)).toEqual([])
    expect(await sponsorshipsOf(t, diasporaGa)).toEqual([])
  })

  it("declare : compte IDN et preuve fictifs de niveau 1, nationalité gabonaise, lien relu par la vraie synchronisation", async () => {
    openDevTools()
    const { t, diasporaGa } = await fixture()
    const { as, authUserId, personId } = await joinedActor(t, diasporaGa, "declare")
    await equip(as, "declare")
    const link = await linkOf(t, personId, "idn")
    expect(link).toMatchObject({ provider: "idn", subject: "diaspora-ga-demo-idn-declare", loa: 1, nationality: "GA" })
    expect(link?.revokedAt).toBeUndefined()
    // Le compte IDN vit dans le composant d'authentification, la preuve dans le moteur : un seul de chaque.
    expect(await idnAccountIdsOf(t, authUserId)).toEqual(["diaspora-ga-demo-idn-declare"])
    const proofs = await t.run(async (ctx) => await ctx.db.query("idnProofs").withIndex("by_subject", (q) => q.eq("subject", "diaspora-ga-demo-idn-declare")).take(5))
    expect(proofs).toHaveLength(1)
    expect(proofs[0]).toMatchObject({ loa: 1, nationality: "GA" })
    // Ni attestation ni parrain : l'IDN seule déclare.
    expect(await linkOf(t, personId, "consular_attestation")).toBeNull()
    expect(await attestationRowsOf(t, personId)).toEqual([])
  })

  it("canada : identité IDN fictive de niveau 2 sans attestation ni parrain, déclarée seulement", async () => {
    openDevTools()
    const { t, diasporaGa } = await fixture()
    await openCountries(t, diasporaGa, ["CA"])
    const { as, personId } = await joinedActor(t, diasporaGa, "canada")
    expect(await equip(as, "canada")).toMatchObject({ status: "declaree" })
    expect(await linkOf(t, personId, "idn")).toMatchObject({ subject: "diaspora-ga-demo-idn-canada", loa: 2, nationality: "GA" })
    expect(await linkOf(t, personId, "consular_attestation")).toBeNull()
    expect(await attestationRowsOf(t, personId)).toEqual([])
    expect(await sponsorshipsOf(t, diasporaGa)).toEqual([])
    expect(await membershipOf(t, diasporaGa, personId)).toMatchObject({ status: "declaree" })
  })

  it("verifie : attestation consulaire fictive (lien d'identité et demande vérifiée avec son consentement)", async () => {
    openDevTools()
    const { t, diasporaGa } = await fixture()
    const { as, personId } = await joinedActor(t, diasporaGa, "verifie")
    const equipped = await equip(as, "verifie")
    expect(equipped.status).toBe("verifiee")
    expect((await membershipOf(t, diasporaGa, personId)).status).toBe(equipped.status)
    expect(await membershipOf(t, diasporaGa, personId)).toMatchObject({ verifiedBy: "consulat" })
    // Le lien d'identité que lisent les faits : le pays de l'acteur et le poste FICTIF.
    expect(await linkOf(t, personId, "consular_attestation")).toMatchObject({ provider: "consular_attestation", subject: "diaspora-ga-demo-attestation-verifie", country: "FR", postSlug: "poste-de-demonstration" })
    expect(await linkOf(t, personId, "idn")).toBeNull()
    // La demande « vérifiée » que lit l'écran des réglages, avec le consentement en vigueur et sans donnée consulaire.
    const rows = await attestationRowsOf(t, personId)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ networkId: diasporaGa, personId, subjectKind: "emailHash", result: "verified", country: "FR", postSlug: "poste-de-demonstration" })
    expect(rows[0]?.subjectHash).toMatch(/^[0-9a-f]{64}$/)
    const consent = await t.run(async (ctx) => (rows[0] ? await ctx.db.get(rows[0].consentId) : null))
    expect(consent).toMatchObject({ personId, networkId: diasporaGa, purpose: "consular_attestation" })
    expect(consent?.revokedAt).toBeUndefined()
    expect(await as.query(api.modules.diaspora.membership.myMembership, { networkId: diasporaGa })).toMatchObject({
      status: "verifiee",
      attestation: { outcome: "verified", postSlug: "poste-de-demonstration" },
    })
  })

  it("belgique : l'attestation porte le pays de l'acteur, et sa vérification n'est pas antidatée", async () => {
    openDevTools()
    const { t, diasporaGa } = await fixture()
    await openCountries(t, diasporaGa, ["BE"])
    const { as, personId } = await joinedActor(t, diasporaGa, "belgique")
    expect(await equip(as, "belgique")).toMatchObject({ status: "verifiee" })
    expect(await linkOf(t, personId, "consular_attestation")).toMatchObject({ country: "BE" })
    expect((await attestationRowsOf(t, personId))[0]).toMatchObject({ country: "BE", result: "verified" })
    // Seul l'acteur « verifie » est antidaté : un autre membre vérifié ne peut pas encore parrainer.
    expect(DIASPORA_GA_DEMO_ACTOR_SPECS.belgique.canSponsor).toBe(false)
    expect(Date.now() - (await membershipOf(t, diasporaGa, personId)).statusChangedAt).toBeLessThan(DAY_MS)
    expect(await as.query(api.modules.diaspora.membership.sponsorDashboard, { networkId: diasporaGa })).toMatchObject({ eligible: false, refusal: "sponsor_too_recent" })
  })

  it("fondateur (EA-01) : vérifiée par la seule décision du réseau, elle parraine aussitôt, sans antidate ; rejouer ne double rien", async () => {
    openDevTools()
    const { t, diasporaGa } = await fixture()
    const { as, personId } = await joinedActor(t, diasporaGa, "fondateur")
    expect(await equip(as, "fondateur")).toMatchObject({ status: "verifiee", role: "member" })
    expect(await linkOf(t, personId, "consular_attestation")).toBeNull()
    expect(await linkOf(t, personId, "idn")).toBeNull()
    expect(await membershipOf(t, diasporaGa, personId)).toMatchObject({ status: "verifiee", verifiedBy: "operator" })
    const admissions = async () => await t.run(async (ctx) => await ctx.db.query("foundingAdmissions").withIndex("by_network_and_person", (q) => q.eq("networkId", diasporaGa).eq("personId", personId)).take(5))
    const rows = await admissions()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ networkId: diasporaGa, personId, seniorityWaiver: true })
    expect(rows[0]?.admittedByPersonId).toBeUndefined()
    // La dispense : éligible au parrainage dès l'équipement, sans ancienneté posée à la main.
    expect(Date.now() - (await membershipOf(t, diasporaGa, personId)).statusChangedAt).toBeLessThan(DAY_MS)
    expect(await as.query(api.modules.diaspora.membership.sponsorDashboard, { networkId: diasporaGa })).toMatchObject({ eligible: true, refusal: null })
    expect(await as.query(api.modules.diaspora.membership.myMembership, { networkId: diasporaGa })).toMatchObject({ status: "verifiee", badges: ["verified"], statusOutdated: false })
    await equip(as, "fondateur")
    expect(await admissions()).toHaveLength(1)
  })

  it("institution : identité IDN de niveau 2 et attestation consulaire, deux faits indépendants", async () => {
    openDevTools()
    const { t, diasporaGa } = await fixture()
    const { as, personId } = await joinedActor(t, diasporaGa, "institution")
    expect(await equip(as, "institution")).toMatchObject({ status: "verifiee" })
    expect(await linkOf(t, personId, "idn")).toMatchObject({ subject: "diaspora-ga-demo-idn-institution", loa: 2, nationality: "GA" })
    expect(await linkOf(t, personId, "consular_attestation")).toMatchObject({ subject: "diaspora-ga-demo-attestation-institution" })
    expect((await attestationRowsOf(t, personId))[0]).toMatchObject({ result: "verified" })
    // L'attestation vérifie en premier : la source de vérification est le consulat.
    expect(await membershipOf(t, diasporaGa, personId)).toMatchObject({ verifiedBy: "consulat" })
  })

  it("rejouer l'équipement ne recrée aucun fait", async () => {
    openDevTools()
    const { t, diasporaGa } = await fixture()
    const { as, authUserId, personId } = await joinedActor(t, diasporaGa, "institution")
    const first = await equip(as, "institution")
    const count = async () => ({
      idnLinks: (await t.run(async (ctx) => await ctx.db.query("identityLinks").withIndex("by_person_and_provider", (q) => q.eq("personId", personId).eq("provider", "idn")).take(5))).length,
      attestationLinks: (await t.run(async (ctx) => await ctx.db.query("identityLinks").withIndex("by_person_and_provider", (q) => q.eq("personId", personId).eq("provider", "consular_attestation")).take(5))).length,
      attestations: (await attestationRowsOf(t, personId)).length,
      consents: (await t.run(async (ctx) => await ctx.db.query("consents").withIndex("by_person_and_purpose", (q) => q.eq("personId", personId).eq("purpose", "consular_attestation")).take(5))).length,
      idnAccounts: (await idnAccountIdsOf(t, authUserId)).length,
      idnProofs: (await t.run(async (ctx) => await ctx.db.query("idnProofs").withIndex("by_subject", (q) => q.eq("subject", "diaspora-ga-demo-idn-institution")).take(5))).length,
      pages: (await pagesOf(t, diasporaGa)).length,
      signatories: (await signatoriesOf(t, personId)).length,
    })
    const before = await count()
    expect(before).toEqual({ idnLinks: 1, attestationLinks: 1, attestations: 1, consents: 1, idnAccounts: 1, idnProofs: 1, pages: 1, signatories: 1 })
    const second = await equip(as, "institution")
    expect(await count()).toEqual(before)
    expect(second).toEqual({ ...first, pageCreated: false })
  })
})

describe("comptes de démonstration DIASPORA.GA — parrainage", () => {
  it("le filleul équipé avant son parrain attend, puis est déclaré dès que le parrain est équipé", async () => {
    openDevTools()
    const { t, diasporaGa } = await fixture()
    // Le filleul d'abord : le parrain n'a pas encore de profil, rien ne peut le parrainer.
    const sponsored = await joinedActor(t, diasporaGa, "parraine")
    expect(await equip(sponsored.as, "parraine")).toMatchObject({ status: "en_attente" })
    expect(await sponsorshipsOf(t, diasporaGa)).toEqual([])
    // Le parrain ensuite : vérifié et antidaté, il complète le filleul déjà équipé.
    const sponsor = await joinedActor(t, diasporaGa, "verifie")
    expect(await equip(sponsor.as, "verifie")).toMatchObject({ status: "verifiee" })
    const rows = await sponsorshipsOf(t, diasporaGa)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ networkId: diasporaGa, sponsorPersonId: sponsor.personId, sponsoredPersonId: sponsored.personId })
    expect(rows[0]?.revokedAt).toBeUndefined()
    expect(await membershipOf(t, diasporaGa, sponsored.personId)).toMatchObject({ status: "declaree", sponsorPersonId: sponsor.personId })
    await expectSeasonedSponsor(t, diasporaGa, sponsor.personId)
    // La vraie règle de parrainage le reconnaît : éligible, avec le filleul dans son journal.
    const dashboard = await sponsor.as.query(api.modules.diaspora.membership.sponsorDashboard, { networkId: diasporaGa })
    expect(dashboard).toMatchObject({ eligible: true, refusal: null })
    expect(dashboard.given.map((entry) => entry.sponsored.handle)).toEqual(["demo.parraine"])
  })

  it("le parrain équipé d'abord : le filleul est déclaré dès son équipement", async () => {
    openDevTools()
    const { t, diasporaGa } = await fixture()
    const sponsor = await joinedActor(t, diasporaGa, "verifie")
    expect(await equip(sponsor.as, "verifie")).toMatchObject({ status: "verifiee" })
    expect(await sponsorshipsOf(t, diasporaGa)).toEqual([])
    await expectSeasonedSponsor(t, diasporaGa, sponsor.personId)
    const sponsored = await joinedActor(t, diasporaGa, "parraine")
    expect(await equip(sponsored.as, "parraine")).toMatchObject({ status: "declaree" })
    const rows = await sponsorshipsOf(t, diasporaGa)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ networkId: diasporaGa, sponsorPersonId: sponsor.personId, sponsoredPersonId: sponsored.personId })
    expect(rows[0]?.revokedAt).toBeUndefined()
    expect(await membershipOf(t, diasporaGa, sponsored.personId)).toMatchObject({ status: "declaree", sponsorPersonId: sponsor.personId })
    await expectSeasonedSponsor(t, diasporaGa, sponsor.personId)
  })

  it("rejouer l'équipement du parrain ou du filleul ne double pas le parrainage", async () => {
    openDevTools()
    const { t, diasporaGa } = await fixture()
    const sponsored = await joinedActor(t, diasporaGa, "parraine")
    await equip(sponsored.as, "parraine")
    const sponsor = await joinedActor(t, diasporaGa, "verifie")
    await equip(sponsor.as, "verifie")
    await equip(sponsor.as, "verifie")
    await equip(sponsored.as, "parraine")
    expect(await sponsorshipsOf(t, diasporaGa)).toHaveLength(1)
    expect(await membershipOf(t, diasporaGa, sponsored.personId)).toMatchObject({ status: "declaree" })
    await expectSeasonedSponsor(t, diasporaGa, sponsor.personId)
  })

  it("une autre personne vérifiée qui porte l'identifiant du parrain n'est jamais prise pour parrain", async () => {
    openDevTools()
    const { t, diasporaGa } = await fixture()
    // Elle a pris « demo.verifie » sur une adresse ordinaire, et elle est vérifiée de longue date.
    const homonym = await joinedAs(t, diasporaGa, { email: "homonyme@example.test", handle: "demo.verifie", displayName: "Homonyme RECETTE", country: "FR" })
    await t.run(async (ctx) => {
      const membership = present(await ctx.db.query("networkMemberships").withIndex("by_network_and_person", (q) => q.eq("networkId", diasporaGa).eq("personId", homonym.personId)).unique(), "adhésion")
      await ctx.db.patch(membership._id, { status: "verifiee", statusChangedAt: Date.now() - 60 * DAY_MS })
    })
    const sponsored = await joinedActor(t, diasporaGa, "parraine")
    expect(await equip(sponsored.as, "parraine")).toMatchObject({ status: "en_attente" })
    expect(await sponsorshipsOf(t, diasporaGa)).toEqual([])
  })

  it("une autre personne qui porte l'identifiant du filleul n'est jamais parrainée", async () => {
    openDevTools()
    const { t, diasporaGa } = await fixture()
    const homonym = await joinedAs(t, diasporaGa, { email: "homonyme@example.test", handle: "demo.parraine", displayName: "Homonyme RECETTE", country: "FR" })
    const sponsor = await joinedActor(t, diasporaGa, "verifie")
    expect(await equip(sponsor.as, "verifie")).toMatchObject({ status: "verifiee" })
    expect(await sponsorshipsOf(t, diasporaGa)).toEqual([])
    expect(await membershipOf(t, diasporaGa, homonym.personId)).toMatchObject({ status: "en_attente" })
  })
})

describe("comptes de démonstration DIASPORA.GA — rôles", () => {
  it("moderateur : rôle de modération du réseau et membre actif de l'équipe de démonstration", async () => {
    openDevTools()
    const { t, diasporaGa } = await fixture()
    const { as, personId } = await joinedActor(t, diasporaGa, "moderateur")
    expect(await equip(as, "moderateur")).toEqual({ actor: "moderateur", status: "verifiee", role: "network_moderator", pageId: null, pageCreated: false })
    expect(await membershipOf(t, diasporaGa, personId)).toMatchObject({ status: "verifiee", role: "network_moderator" })
    const teams = await teamsOf(t, diasporaGa)
    expect(teams.map((team) => team.name)).toEqual([DEMO_TEAM_NAME])
    const team = present(teams[0], "équipe")
    expect(team).toMatchObject({ networkId: diasporaGa, active: true })
    expect(team.scope).toBeUndefined()
    expect(await teamMembersOf(t, team._id)).toEqual([expect.objectContaining({ networkId: diasporaGa, teamId: team._id, personId, active: true })])
    // Rejouer ne crée ni seconde équipe ni seconde ligne de membre.
    await equip(as, "moderateur")
    expect(await teamsOf(t, diasporaGa)).toHaveLength(1)
    expect(await teamMembersOf(t, team._id)).toHaveLength(1)
  })

  it("administrateur : rôle d'administrateur du réseau, sans équipe de modération", async () => {
    openDevTools()
    const { t, diasporaGa } = await fixture()
    const { as, personId } = await joinedActor(t, diasporaGa, "administrateur")
    expect(await equip(as, "administrateur")).toEqual({ actor: "administrateur", status: "verifiee", role: "network_admin", pageId: null, pageCreated: false })
    expect(await membershipOf(t, diasporaGa, personId)).toMatchObject({ status: "verifiee", role: "network_admin" })
    expect(await teamsOf(t, diasporaGa)).toEqual([])
  })

  it("un acteur sans rôle particulier reste simple membre", async () => {
    openDevTools()
    const { t, diasporaGa } = await fixture()
    const { as, personId } = await joinedActor(t, diasporaGa, "mentor")
    expect(await equip(as, "mentor")).toMatchObject({ status: "verifiee", role: "member" })
    expect(await membershipOf(t, diasporaGa, personId)).toMatchObject({ role: "member" })
    expect(await teamsOf(t, diasporaGa)).toEqual([])
  })
})

describe("comptes de démonstration DIASPORA.GA — pages", () => {
  it("entreprise : page d'entreprise du réseau diaspora-ga qu'elle administre ; rejouable sans doublon", async () => {
    openDevTools()
    const { t, diasporaGa } = await fixture()
    const { as, personId } = await joinedActor(t, diasporaGa, "entreprise")
    const first = await equip(as, "entreprise")
    expect(first).toMatchObject({ actor: "entreprise", status: "verifiee", role: "member", pageCreated: true })
    expect(first.pageId).not.toBeNull()
    const page = present(await pageOf(t, "demo-saveurs-du-gabon"), "page")
    expect(page._id).toBe(first.pageId)
    expect(page).toMatchObject({
      networkId: diasporaGa,
      ownerKind: "company",
      trust: "community",
      trustRank: 0,
      sector: "food",
      city: "Paris",
      country: "FR",
      visibility: "network",
      onRoot: false,
      status: "active",
      createdByPersonId: personId,
    })
    // La personne en est l'administratrice acceptée, et ce droit est vivant (page active, membre active).
    const signatories = await signatoriesOf(t, personId)
    expect(signatories).toHaveLength(1)
    expect(signatories[0]).toMatchObject({ networkId: diasporaGa, pageId: page._id, personId, role: "admin" })
    expect(signatories[0]?.acceptedAt).toEqual(expect.any(Number))
    expect(await t.run(async (ctx) => await liveSignatoryRole(ctx, page, personId))).toBe("admin")

    // Un second appel ne recrée rien et rend la même page, non créée.
    const second = await equip(as, "entreprise")
    expect(second).toMatchObject({ pageCreated: false, pageId: first.pageId })
    expect(await pagesOf(t, diasporaGa)).toHaveLength(1)
    expect(await signatoriesOf(t, personId)).toHaveLength(1)
  })

  it("institution : page officielle, signée par une identité forte", async () => {
    openDevTools()
    const { t, diasporaGa } = await fixture()
    const { as, personId } = await joinedActor(t, diasporaGa, "institution")
    const equipped = await equip(as, "institution")
    expect(equipped).toMatchObject({ status: "verifiee", pageCreated: true })
    const page = present(await pageOf(t, "demo-poste-consulaire"), "page")
    expect(page._id).toBe(equipped.pageId)
    expect(page).toMatchObject({ networkId: diasporaGa, ownerKind: "institution", trust: "official", trustRank: 2, city: "Paris", country: "FR", status: "active" })
    // Une page officielle n'engage que ses signataires d'identité forte : l'IDN de niveau 2 le prouve.
    expect(await t.run(async (ctx) => await liveSignatoryRole(ctx, page, personId))).toBe("admin")
  })

  it("une page du même identifiant créée par une autre personne n'est jamais reprise", async () => {
    openDevTools()
    const { t, diasporaGa } = await fixture()
    const other = await joinedAs(t, diasporaGa, { email: "autre@example.test", handle: "autre.recette", displayName: "Autre RECETTE", country: "FR" })
    const now = Date.now()
    await t.run(async (ctx) => {
      await ctx.db.insert("pages", {
        networkId: diasporaGa,
        handle: "demo-saveurs-du-gabon",
        name: "Page d'une autre personne",
        ownerKind: "company",
        trust: "community",
        trustRank: 0,
        visibility: "network",
        onRoot: false,
        status: "active",
        createdByPersonId: other.personId,
        searchText: "page d'une autre personne demo-saveurs-du-gabon",
        createdAt: now,
        updatedAt: now,
      })
    })
    const { as, personId } = await joinedActor(t, diasporaGa, "entreprise")
    expect(await code(equip(as, "entreprise"))).toBe("conflict")
    expect(await signatoriesOf(t, personId)).toEqual([])
    expect(await pagesOf(t, diasporaGa)).toHaveLength(1)
    // Le refus défait tout l'équipement (une seule transaction) : ni attestation, ni statut, ni pays ouverts.
    expect(await footprintOf(t, diasporaGa, personId)).toEqual(UNTOUCHED)
    expect(await attestationRowsOf(t, personId)).toEqual([])
  })
})

describe("comptes de démonstration DIASPORA.GA — suspension", () => {
  it("suspendu : adhésion suspendue en dernier, statut antérieur gardé ; rejouable sans erreur", async () => {
    openDevTools()
    const { t, diasporaGa } = await fixture()
    const { as, personId } = await joinedActor(t, diasporaGa, "suspendu")
    const first = await equip(as, "suspendu")
    expect(first).toMatchObject({ actor: "suspendu", status: "suspendue", role: "member" })
    expect(DIASPORA_GA_DEMO_ACTOR_SPECS.suspendu.expectedStatus).toBe("suspendue")
    // Les faits vérifient, puis la sanction (jamais dérivée) prend la main et garde le statut à rendre à sa levée.
    expect(await membershipOf(t, diasporaGa, personId)).toMatchObject({ status: "suspendue", statusBeforeSuspension: "verifiee" })
    expect(await as.query(api.modules.diaspora.membership.myMembership, { networkId: diasporaGa })).toMatchObject({ status: "suspendue" })

    // Un second appel ne lève rien et laisse la sanction en place.
    const second = await equip(as, "suspendu")
    expect(second).toMatchObject({ status: "suspendue" })
    expect(await membershipOf(t, diasporaGa, personId)).toMatchObject({ status: "suspendue", statusBeforeSuspension: "verifiee" })
  })

  it("suspendu : la sanction reste dans DIASPORA.GA, la racine reste ouverte", async () => {
    openDevTools()
    const { t, diasporaGa, root } = await fixture()
    const { as, personId } = await joinedActor(t, diasporaGa, "suspendu")
    await equip(as, "suspendu")
    expect(await readsNetwork(as, diasporaGa)).toBe("membershipSuspended")
    // La racine n'est pas touchée : la même personne y lit toujours.
    expect(await rootMembershipOf(t, root, personId)).toMatchObject({ status: "verifiee" })
    expect(await readsNetwork(as, root)).toBeNull()
  })
})

describe("comptes de démonstration DIASPORA.GA — suspension à la racine", () => {
  it("suspendu-racine : la racine suspendue en dernier, par le chemin de la console ; la suspension vaut partout", async () => {
    openDevTools()
    const { t, diasporaGa, root } = await fixture()
    const { as, personId } = await joinedActor(t, diasporaGa, "suspendu-racine")
    // Contrôle : entrée par le vrai accueil, la personne lit DIASPORA.GA et la racine.
    expect(await readsNetwork(as, diasporaGa)).toBeNull()
    expect(await readsNetwork(as, root)).toBeNull()

    expect(await equip(as, "suspendu-racine")).toEqual({ actor: "suspendu-racine", status: "suspendue", role: "member", pageId: null, pageCreated: false })
    expect(DIASPORA_GA_DEMO_ACTOR_SPECS["suspendu-racine"].expectedStatus).toBe("suspendue")
    // La racine porte la suspension, sans échéance, et le statut à rendre à sa levée.
    const rootMembership = present(await rootMembershipOf(t, root, personId), "adhésion racine")
    expect(rootMembership).toMatchObject({ status: "suspendue", statusBeforeSuspension: "verifiee" })
    expect(rootMembership.suspendedUntil).toBeUndefined()
    // L'adhésion DIASPORA.GA garde son statut propre : c'est la racine qui ferme, partout.
    const own = await membershipOf(t, diasporaGa, personId)
    expect(own.status).toBe("verifiee")
    expect(own.statusBeforeSuspension).toBeUndefined()
    expect(await as.query(api.modules.diaspora.membership.myMembership, { networkId: diasporaGa })).toMatchObject({ status: "suspendue", root: { status: "suspendue" } })
    expect(await readsNetwork(as, diasporaGa)).toBe("membershipSuspended")
    expect(await readsNetwork(as, root)).toBe("membershipSuspended")
  })

  it("rejouer l'équipement ne lève rien et ne réécrit pas la suspension", async () => {
    openDevTools()
    const { t, diasporaGa, root } = await fixture()
    const { as, personId } = await joinedActor(t, diasporaGa, "suspendu-racine")
    const first = await equip(as, "suspendu-racine")
    const suspended = present(await rootMembershipOf(t, root, personId), "adhésion racine")
    expect(await equip(as, "suspendu-racine")).toEqual(first)
    expect(await rootMembershipOf(t, root, personId)).toMatchObject({ status: "suspendue", statusBeforeSuspension: "verifiee", statusChangedAt: suspended.statusChangedAt })
    expect((await membershipOf(t, diasporaGa, personId)).status).toBe("verifiee")
  })
})

describe("comptes de démonstration DIASPORA.GA — membre bloqué", () => {
  it("bloque : bloqué par « verifie » par le vrai blocage personnel, son statut intact ; vu des deux côtés", async () => {
    openDevTools()
    const { t, diasporaGa } = await fixture()
    const blocker = await joinedActor(t, diasporaGa, "verifie")
    await equip(blocker.as, "verifie")
    const blocked = await joinedActor(t, diasporaGa, "bloque")
    expect(DIASPORA_GA_DEMO_ACTOR_SPECS.bloque.blockedBy).toBe("verifie")
    // Contrôle : avant l'équipement, rien ne les sépare.
    expect(await blocked.as.query(api.modules.graph.connections.connectionWith, { networkId: diasporaGa, otherPersonId: blocker.personId })).toEqual({ state: "none" })
    expect(await blocksAgainst(t, blocked.personId)).toEqual([])

    expect(await equip(blocked.as, "bloque")).toEqual({ actor: "bloque", status: "verifiee", role: "member", pageId: null, pageCreated: false })
    // L'intention de son auteur et la ligne de la paire dans le réseau, comme `blockPerson` les écrit.
    const intents = await blocksAgainst(t, blocked.personId)
    expect(intents).toHaveLength(1)
    expect(intents[0]).toMatchObject({ networkId: diasporaGa, blockerPersonId: blocker.personId, targetPersonId: blocked.personId })
    const rows = await blockedRowsBy(t, blocker.personId)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ networkId: diasporaGa, status: "blocked", blockedByPersonId: blocker.personId })
    // Un blocage protège, il ne sanctionne pas : le statut du bloqué reste le sien.
    expect(await membershipOf(t, diasporaGa, blocked.personId)).toMatchObject({ status: "verifiee" })
    // Le bloqueur le voit dans ses protections ; le bloqué ne voit rien (refus indistinct).
    expect(await blocker.as.query(api.modules.graph.connections.connectionWith, { networkId: diasporaGa, otherPersonId: blocked.personId })).toMatchObject({ state: "blocked_by_me" })
    expect(await blocked.as.query(api.modules.graph.connections.connectionWith, { networkId: diasporaGa, otherPersonId: blocker.personId })).toEqual({ state: "none" })
    const mine = await blocker.as.query(api.modules.graph.blocks.paginateMine, { networkId: diasporaGa, source: "intents", paginationOpts: { cursor: null, numItems: 5 } })
    expect(mine.page.map((entry) => entry.targetPersonId)).toEqual([blocked.personId])
    // Une demande de relation du bloqué rend la réponse d'une demande envoyée, sans rien écrire (D12).
    expect(await blocked.as.mutation(api.modules.graph.connections.requestConnection, { networkId: diasporaGa, targetPersonId: blocker.personId })).toEqual({ status: "requested" })
    expect(await t.run(async (ctx) => await ctx.db.query("connections").withIndex("by_network_low_status", (q) => q.eq("networkId", diasporaGa)).take(10))).toHaveLength(1)
  })

  it("le bloqué équipé avant son bloqueur : le blocage se pose dès que le bloqueur est équipé", async () => {
    openDevTools()
    const { t, diasporaGa } = await fixture()
    const blocked = await joinedActor(t, diasporaGa, "bloque")
    expect(await equip(blocked.as, "bloque")).toMatchObject({ status: "verifiee" })
    expect(await blocksAgainst(t, blocked.personId)).toEqual([])
    const blocker = await joinedActor(t, diasporaGa, "verifie")
    expect(await equip(blocker.as, "verifie")).toMatchObject({ status: "verifiee" })
    expect((await blocksAgainst(t, blocked.personId)).map((row) => row.blockerPersonId)).toEqual([blocker.personId])
    expect(await blocker.as.query(api.modules.graph.connections.connectionWith, { networkId: diasporaGa, otherPersonId: blocked.personId })).toMatchObject({ state: "blocked_by_me" })
  })

  it("rejouer l'équipement de l'un ou de l'autre ne double pas le blocage", async () => {
    openDevTools()
    const { t, diasporaGa } = await fixture()
    const blocker = await joinedActor(t, diasporaGa, "verifie")
    await equip(blocker.as, "verifie")
    const blocked = await joinedActor(t, diasporaGa, "bloque")
    await equip(blocked.as, "bloque")
    await equip(blocked.as, "bloque")
    await equip(blocker.as, "verifie")
    expect(await blocksAgainst(t, blocked.personId)).toHaveLength(1)
    expect(await blockedRowsBy(t, blocker.personId)).toHaveLength(1)
  })

  it("une autre personne qui porte l'identifiant du bloqueur ne bloque jamais ; contrôle : sur l'adresse réservée, si", async () => {
    openDevTools()
    const { t, diasporaGa } = await fixture()
    // Elle a pris « demo.verifie » sur une adresse ordinaire.
    const homonym = await joinedAs(t, diasporaGa, { email: "homonyme@example.test", handle: "demo.verifie", displayName: "Homonyme RECETTE", country: "FR" })
    const blocked = await joinedActor(t, diasporaGa, "bloque")
    await equip(blocked.as, "bloque")
    expect(await blocksAgainst(t, blocked.personId)).toEqual([])
    // Contrôle : la même personne, sur l'adresse réservée vérifiée de l'acteur, est bien le bloqueur.
    await t.mutation(components.betterAuth.adapter.updateOne, {
      input: { model: "user", where: [{ field: "_id", value: homonym.authUserId }], update: { email: diasporaGaDemoEmailOf("verifie"), emailVerified: true } },
    })
    await equip(blocked.as, "bloque")
    expect((await blocksAgainst(t, blocked.personId)).map((row) => row.blockerPersonId)).toEqual([homonym.personId])
  })

  it("un bloqueur sorti du réseau ne bloque pas ; contrôle : revenu, il bloque", async () => {
    openDevTools()
    const { t, diasporaGa } = await fixture()
    const blocker = await joinedActor(t, diasporaGa, "verifie")
    await equip(blocker.as, "verifie")
    await blocker.as.mutation(api.modules.diaspora.membership.leaveDiasporaGa, { networkId: diasporaGa })
    const blocked = await joinedActor(t, diasporaGa, "bloque")
    await equip(blocked.as, "bloque")
    expect(await blocksAgainst(t, blocked.personId)).toEqual([])
    // Contrôle : de retour dans le réseau, le même bloqueur pose le blocage au prochain équipement.
    await blocker.as.mutation(api.modules.diaspora.membership.joinDiasporaGa, { networkId: diasporaGa, facet: { countryOfResidence: "FR" }, directoryVisibility: "hidden" })
    await equip(blocked.as, "bloque")
    expect((await blocksAgainst(t, blocked.personId)).map((row) => row.blockerPersonId)).toEqual([blocker.personId])
  })

  it("une cible dont l'effacement est demandé n'est pas bloquée ; contrôle : demande retirée, elle l'est", async () => {
    openDevTools()
    const { t, diasporaGa } = await fixture()
    const blocked = await joinedActor(t, diasporaGa, "bloque")
    await equip(blocked.as, "bloque")
    await t.run(async (ctx) => {
      await ctx.db.patch(blocked.personId, { deletionRequestedAt: Date.now() })
    })
    const blocker = await joinedActor(t, diasporaGa, "verifie")
    await equip(blocker.as, "verifie")
    expect(await blocksAgainst(t, blocked.personId)).toEqual([])
    // Contrôle : la demande retirée, le prochain équipement du bloqueur pose le blocage.
    await t.run(async (ctx) => {
      await ctx.db.patch(blocked.personId, { deletionRequestedAt: undefined })
    })
    await equip(blocker.as, "verifie")
    expect((await blocksAgainst(t, blocked.personId)).map((row) => row.blockerPersonId)).toEqual([blocker.personId])
  })
})

describe("comptes de démonstration DIASPORA.GA — extérieur au réseau", () => {
  it("exterieur : équipé sans adhésion — admis à la racine par la vraie règle, rien dans DIASPORA.GA", async () => {
    openDevTools()
    const { t, diasporaGa, root } = await fixture()
    // L'accueil d'ANTSIA seulement (consentement, profil publié), comme l'application le rejoue : jamais joinDiasporaGa.
    const outsider = await welcomedActor(t, "exterieur")
    expect(DIASPORA_GA_DEMO_ACTOR_SPECS.exterieur).toMatchObject({ outsider: true, expectedStatus: null })
    expect(await equip(outsider.as, "exterieur")).toEqual({ actor: "exterieur", status: null, role: null, pageId: null, pageCreated: false })
    // Un compte ANTSIA : membre déclaré de la racine (politique ouverte, sans identité forte), qui y lit.
    expect(await rootMembershipOf(t, root, outsider.personId)).toMatchObject({ status: "declaree", role: "member" })
    expect(await readsNetwork(outsider.as, root)).toBeNull()
    // Aucune adhésion DIASPORA.GA : le réseau fermé lui reste fermé, d'un refus indistinct.
    expect(await t.run(async (ctx) => await ctx.db.query("networkMemberships").withIndex("by_network_and_person", (q) => q.eq("networkId", diasporaGa).eq("personId", outsider.personId)).unique())).toBeNull()
    expect(await outsider.as.query(api.modules.diaspora.membership.myMembership, { networkId: diasporaGa })).toBeNull()
    expect(await readsNetwork(outsider.as, diasporaGa)).toBe("notFound")
    // Rien d'autre n'est posé : ni fait fictif, ni pays ouvert.
    expect(await linkOf(t, outsider.personId, "idn")).toBeNull()
    expect(await linkOf(t, outsider.personId, "consular_attestation")).toBeNull()
    expect((await networkOf(t, diasporaGa)).openCountries).toEqual(["FR"])
  })

  it("exige l'accueil d'ANTSIA : profil publié puis consentement ; sans eux, aucune adhésion", async () => {
    openDevTools()
    const { t, root } = await fixture()
    const user = await signedIn(t, diasporaGaDemoEmailOf("exterieur"))
    expect(await code(equip(user.as, "exterieur"))).toBe("profileRequired")
    // Le profil publié, mais pas le consentement au profil social.
    await user.as.mutation(api.modules.people.profile.publishMyProfile, { handle: "demo.exterieur", displayName: "Brice MOUNDOUNGA" })
    expect(await code(equip(user.as, "exterieur"))).toBe("consentRequired")
    expect(await rootMembershipOf(t, root, user.personId)).toBeNull()
    // Contrôle : le consentement donné, le même compte est admis à la racine.
    await user.as.mutation(api.modules.people.consents.recordConsent, { purpose: "social_profile", origin: "onboarding" })
    expect(await equip(user.as, "exterieur")).toMatchObject({ status: null, role: null })
    expect(await rootMembershipOf(t, root, user.personId)).toMatchObject({ status: "declaree" })
  })

  it("passe les mêmes gardes : outils fermés ou adresse d'un autre acteur ; contrôle : ouverts, sur son adresse, admis", async () => {
    closeDevTools()
    const { t, root } = await fixture()
    const outsider = await welcomedActor(t, "exterieur")
    expect(await code(equip(outsider.as, "exterieur"))).toBe("policyRefused")
    openDevTools()
    // Un compte léger qui se dit extérieur : l'adresse fait foi, jamais l'argument.
    const light = await welcomedActor(t, "leger")
    expect(await code(equip(light.as, "exterieur"))).toBe("policyRefused")
    expect(await rootMembershipOf(t, root, outsider.personId)).toBeNull()
    expect(await rootMembershipOf(t, root, light.personId)).toBeNull()
    // Contrôle : outils ouverts, l'acteur de l'adresse réservée est admis.
    expect(await equip(outsider.as, "exterieur")).toMatchObject({ status: null })
    expect(await rootMembershipOf(t, root, outsider.personId)).toMatchObject({ status: "declaree" })
  })

  it("rejouer ne crée rien ; une adhésion prise de lui-même reste la sienne, sans rien d'autre", async () => {
    openDevTools()
    const { t, diasporaGa, root } = await fixture()
    const outsider = await welcomedActor(t, "exterieur")
    await equip(outsider.as, "exterieur")
    expect(await equip(outsider.as, "exterieur")).toEqual({ actor: "exterieur", status: null, role: null, pageId: null, pageCreated: false })
    const memberships = await t.run(async (ctx) => await ctx.db.query("networkMemberships").withIndex("by_person_and_status", (q) => q.eq("personId", outsider.personId)).take(10))
    expect(memberships.map((row) => row.networkId)).toEqual([root])
    // Entré de lui-même dans DIASPORA.GA : l'équipement rend son statut et n'y pose rien.
    await outsider.as.mutation(api.modules.diaspora.membership.joinDiasporaGa, { networkId: diasporaGa, facet: { countryOfResidence: "FR" }, directoryVisibility: "hidden" })
    expect(await equip(outsider.as, "exterieur")).toEqual({ actor: "exterieur", status: "en_attente", role: "member", pageId: null, pageCreated: false })
    expect(await footprintOf(t, diasporaGa, outsider.personId)).toEqual(UNTOUCHED)
  })
})

describe("comptes de démonstration DIASPORA.GA — pays ouverts", () => {
  it("CH-817 E3 : n'ouvre AUCUN pays ; la Belgique et le Canada restent fermés, leurs acteurs ni proposés ni équipés", async () => {
    openDevTools()
    const { t, diasporaGa } = await fixture()
    // La graine n'ouvre que la France.
    expect((await networkOf(t, diasporaGa)).openCountries).toEqual(["FR"])
    expect((await hubsOf(t, diasporaGa)).map((hub) => hub.country)).toEqual(["FR"])
    expect([...DIASPORA_GA_DEMO_COUNTRIES].sort()).toEqual(["BE", "CA", "FR"])
    const { as } = await joinedActor(t, diasporaGa, "leger")
    await equip(as, "leger")
    await equip(as, "leger")
    // Avant CH-817, l'équipement ouvrait la Belgique et le Canada d'office : plus jamais.
    expect((await networkOf(t, diasporaGa)).openCountries).toEqual(["FR"])
    expect((await hubsOf(t, diasporaGa)).map((hub) => hub.country)).toEqual(["FR"])
    // Les acteurs d'un pays fermé : ni au catalogue, ni équipés (refus indistinct), rien d'écrit.
    const catalogued = (await t.query(api.modules.diaspora.demoAccounts.catalogue, {})).map((entry) => entry.actor)
    expect(catalogued).not.toContain("belgique")
    expect(catalogued).not.toContain("canada")
    const belgian = await joinedActor(t, diasporaGa, "belgique")
    expect(await code(equip(belgian.as, "belgique"))).toBe("policyRefused")
    expect(await footprintOf(t, diasporaGa, belgian.personId)).toEqual(UNTOUCHED)
    const canadian = await joinedActor(t, diasporaGa, "canada")
    expect(await code(equip(canadian.as, "canada"))).toBe("policyRefused")
    expect(await footprintOf(t, diasporaGa, canadian.personId)).toEqual(UNTOUCHED)
  })

  it("un pays ouvert par l'administration fait reparaître son acteur ; l'équipement ne crée que le hub qui lui manquait", async () => {
    openDevTools()
    const { t, diasporaGa } = await fixture()
    // La Belgique ouverte sans hub (une ouverture hors de `setOpenCountry`) : le Canada, lui, reste fermé.
    await openCountries(t, diasporaGa, ["BE"])
    expect((await t.query(api.modules.diaspora.demoAccounts.catalogue, {})).map((entry) => entry.actor)).toContain("belgique")
    const belgian = await joinedActor(t, diasporaGa, "belgique")
    expect(await equip(belgian.as, "belgique")).toMatchObject({ status: "verifiee" })
    await equip(belgian.as, "belgique")
    expect((await networkOf(t, diasporaGa)).openCountries).toEqual(["FR", "BE"])
    const hubs = await hubsOf(t, diasporaGa)
    expect(hubs.map((hub) => hub.country).sort()).toEqual(["BE", "FR"])
    // Le hub créé commence à zéro jusqu'au premier passage nocturne ; rejoué, rien ne double.
    const belgianHub = present(hubs.find((hub) => hub.country === "BE"), "hub belge")
    expect(belgianHub).toMatchObject({ networkId: diasporaGa, members: 0, associations: 0, companies: 0, upcomingEvents: 0 })
    expect(belgianHub.countersComputedAt).toBeUndefined()
  })

  it("une décision déjà prise sur les pays du réseau n'est jamais touchée", async () => {
    openDevTools()
    const { t, diasporaGa } = await fixture()
    // Le propriétaire a décidé : seule la Belgique reste ouverte (trace dans l'historique des réglages).
    await t.run(async (ctx) => {
      const network = present(await ctx.db.get(diasporaGa), "réseau")
      const settings = {
        name: network.name,
        membershipPolicy: network.membershipPolicy,
        defaultVisibility: network.defaultVisibility,
        ...(network.facetSchema ? { facetSchema: network.facetSchema } : {}),
        reachValues: network.reachValues,
        openCountries: ["BE"],
        theme: network.theme,
        status: network.status,
      }
      await ctx.db.patch(diasporaGa, { openCountries: ["BE"] })
      await ctx.db.insert("networkSettingsHistory", { networkId: diasporaGa, kind: "updated", settings, reason: "Décision de test sur les pays ouverts", at: Date.now() })
    })
    // L'acteur belge est équipé ; celui d'un pays que la décision ferme (la France) ne l'est plus (CH-817 E3).
    const belgian = await joinedActor(t, diasporaGa, "belgique")
    await equip(belgian.as, "belgique")
    await equip(belgian.as, "belgique")
    const { as, personId } = await joinedActor(t, diasporaGa, "leger")
    expect(await code(equip(as, "leger"))).toBe("policyRefused")
    expect(await footprintOf(t, diasporaGa, personId)).toEqual({ ...UNTOUCHED, openCountries: ["BE"] })
    expect((await networkOf(t, diasporaGa)).openCountries).toEqual(["BE"])
    // Aucun hub pour un pays que la décision laisse fermé.
    const countries = (await hubsOf(t, diasporaGa)).map((hub) => hub.country)
    expect(countries).not.toContain("CA")
    expect(countries.filter((country) => country === "BE")).toHaveLength(1)
  })

  it("CH-815 A3 : une fermeture décidée par l'administration du réseau (setOpenCountry) n'est jamais rouverte par la démonstration", async () => {
    openDevTools()
    const { t, diasporaGa } = await fixture()
    // L'administratrice du réseau, en session prouvée de l'application d'administration (adresse fictive hors du domaine réservé).
    const admin = await welcomed(t, { email: "admin.pays@exemple.test", handle: "admin.pays", displayName: "Admin pays" })
    await t.run(async (ctx) => {
      await ctx.db.insert("identityLinks", { personId: admin.personId, provider: "idn", subject: `idn-${admin.personId}`, loa: 2, nationality: "GA", linkedAt: Date.now() })
    })
    await admin.as.mutation(api.modules.diaspora.membership.joinDiasporaGa, { networkId: diasporaGa, facet: { countryOfResidence: "FR" }, directoryVisibility: "hidden" })
    await t.run(async (ctx) => {
      const row = await ctx.db.query("networkMemberships").withIndex("by_network_and_person", (q) => q.eq("networkId", diasporaGa).eq("personId", admin.personId)).unique()
      await ctx.db.patch(present(row, "adhésion")._id, { role: "network_admin" })
    })
    const adminApp = await openTestNetworkAdminSession(t, admin.as, admin.personId, diasporaGa)
    expect(await adminApp.mutation(api.modules.diaspora.networkSettings.setOpenCountry, { networkId: diasporaGa, country: "FR", open: false, reason: "Fermeture décidée par l'administration (fixture)." })).toEqual({ open: false, changed: true })
    // La France fermée : l'acteur « leger » (France) n'est plus proposé, son équipement est refusé (CH-817 E3).
    expect(await t.query(api.modules.diaspora.demoAccounts.catalogue, {})).toEqual([])
    const { as } = await joinedActor(t, diasporaGa, "leger")
    expect(await code(equip(as, "leger"))).toBe("policyRefused")
    expect((await networkOf(t, diasporaGa)).openCountries).toEqual([])
    const countries = (await hubsOf(t, diasporaGa)).map((hub) => hub.country)
    expect(countries).not.toContain("BE")
    expect(countries).not.toContain("CA")
  })
})

describe("comptes de démonstration DIASPORA.GA — le catalogue entier", () => {
  it("chaque acteur équipé obtient le statut, le rôle, la page et les accès de sa fiche, dans l'ordre du panneau", async () => {
    openDevTools()
    const { t, diasporaGa, root } = await fixture()
    // Tous les pays de la démonstration ouverts par l'administration du réseau : la règle propose alors tout le monde, en local.
    await openCountries(t, diasporaGa, ["BE", "CA"])
    expect(offeredWith(true, DIASPORA_GA_DEMO_COUNTRIES)).toEqual([...DIASPORA_GA_DEMO_ACTORS])
    const members = new Map<DiasporaGaDemoActor, Awaited<ReturnType<typeof welcomedActor>>>()
    const results = new Map<DiasporaGaDemoActor, Awaited<ReturnType<typeof equip>>>()
    for (const actor of DIASPORA_GA_DEMO_ACTORS) {
      const spec = DIASPORA_GA_DEMO_ACTOR_SPECS[actor]
      if (spec.profile === null) continue
      // L'extérieur ne rejoue que l'accueil d'ANTSIA ; tous les autres entrent dans le réseau.
      const member = spec.outsider ? await welcomedActor(t, actor) : await joinedActor(t, diasporaGa, actor)
      members.set(actor, member)
      results.set(actor, await equip(member.as, actor))
    }
    expect([...members.keys()]).toHaveLength(20)

    for (const [actor, member] of members) {
      const spec = DIASPORA_GA_DEMO_ACTOR_SPECS[actor]
      const result = results.get(actor)
      const seen = await member.as.query(api.modules.diaspora.membership.myMembership, { networkId: diasporaGa })
      const rootMembership = present(await rootMembershipOf(t, root, member.personId), `racine de ${actor}`)
      // Seule la suspension de la racine suspend la racine.
      expect(rootMembership.status === "suspendue", `racine de ${actor}`).toBe(spec.grounds.suspendedAtRoot)
      if (spec.outsider) {
        expect(result, `rendu de ${actor}`).toEqual({ actor, status: null, role: null, pageId: null, pageCreated: false })
        expect(seen, `adhésion de ${actor}`).toBeNull()
        expect(rootMembership.status, `racine de ${actor}`).toBe("declaree")
        continue
      }
      // Le statut que lit l'application est celui de la fiche ; celui de l'adhésion aussi, sauf quand la racine suspend.
      expect(seen?.status, `statut lu par ${actor}`).toBe(spec.expectedStatus)
      const stored = await membershipOf(t, diasporaGa, member.personId)
      expect(stored.status, `statut de ${actor}`).toBe(spec.grounds.suspendedAtRoot ? "verifiee" : spec.expectedStatus)
      expect(stored.role, `rôle de ${actor}`).toBe(spec.role)
      // Le rendu de l'équipement est le statut lu, sauf pour le filleul : il précède son parrain dans l'ordre du panneau,
      // il est rendu « en attente » puis complété par l'équipement du parrain (d'où la relecture ci-dessus).
      if (spec.grounds.sponsored) expect(result?.status, `rendu de ${actor}`).toBe("en_attente")
      else expect(result?.status, `rendu de ${actor}`).toBe(spec.expectedStatus)
      expect(result?.pageCreated, `page créée pour ${actor}`).toBe(spec.page !== null)
      if (spec.page) {
        const page = present(await pageOf(t, spec.page.handle), `page de ${actor}`)
        expect(page._id).toBe(result?.pageId)
        expect(page).toMatchObject({
          networkId: diasporaGa,
          ownerKind: spec.page.kind,
          trust: spec.page.trust,
          name: spec.page.name,
          city: spec.page.city,
          country: spec.country,
          status: "active",
          createdByPersonId: member.personId,
          ...(spec.page.associationType !== null ? { associationType: spec.page.associationType } : {}),
          ...(spec.page.sector !== null ? { sector: spec.page.sector } : {}),
        })
        expect(await t.run(async (ctx) => await liveSignatoryRole(ctx, page, member.personId)), `signature de ${actor}`).toBe("admin")
      } else {
        expect(result?.pageId, `aucune page pour ${actor}`).toBeNull()
      }
    }
    // Cinq pages, une par nature, et rien d'autre dans le réseau.
    expect((await pagesOf(t, diasporaGa)).map((page) => page.ownerKind).sort()).toEqual(["association", "community", "company", "institution", "media"])
    // Un seul parrainage : le filleul est celui de la fiche, son parrain l'acteur « verifie ».
    const sponsorships = await sponsorshipsOf(t, diasporaGa)
    expect(sponsorships).toHaveLength(1)
    expect(sponsorships[0]).toMatchObject({ sponsorPersonId: members.get("verifie")?.personId, sponsoredPersonId: members.get("parraine")?.personId })
    // Un seul blocage : le bloqué de la fiche, par son bloqueur, qui ne bloque personne d'autre.
    const blocker = present(members.get("verifie"), "bloqueur")
    const blocked = present(members.get("bloque"), "bloqué")
    expect((await blocksAgainst(t, blocked.personId)).map((row) => row.blockerPersonId)).toEqual([blocker.personId])
    const placed = await t.run(async (ctx) => await ctx.db.query("personBlocks").withIndex("by_blocker_createdAt", (q) => q.eq("blockerPersonId", blocker.personId)).take(5))
    expect(placed.map((row) => row.targetPersonId)).toEqual([blocked.personId])
  })
})

/** Les acteurs que rend le catalogue, avec ou sans jeton de porte. */
async function cataloguedActors(t: T, gateToken?: string) {
  return (await t.query(api.modules.diaspora.demoAccounts.catalogue, gateToken === undefined ? {} : { gateToken })).map((entry) => entry.actor)
}

describe("comptes de démonstration DIASPORA.GA — catalogue par règle (CH-817 E3)", () => {
  it("en ligne au lancement (le socle, les pages, la France) : onze acteurs, dans l'ordre du panneau", async () => {
    declareDemo()
    const { t } = await fixture(["pages"])
    const launch = ["nouveau", "leger", "declare", "parraine", "verifie", "fondateur", "association", "entreprise", "institution", "moderateur", "administrateur"]
    expect(await cataloguedActors(t)).toEqual(launch)
    expect(offeredWith(false, ["FR"], ["pages"])).toEqual(launch)
  })

  it("la mentore reparaît dès que le mentorat s'ouvre, le talent avec l'emploi ; un module fermé les retire", async () => {
    declareDemo()
    const { t, diasporaGa } = await fixture(["pages"])
    expect(await cataloguedActors(t)).not.toContain("mentor")
    await openNetworkFeatures(t, diasporaGa, ["mentoring"])
    expect(await cataloguedActors(t)).toContain("mentor")
    expect(await cataloguedActors(t)).not.toContain("talent")
    await openNetworkFeatures(t, diasporaGa, ["jobs"])
    expect(await cataloguedActors(t)).toContain("talent")
    // Les pages fermées : l'emploi (leur enfant) et les acteurs de page disparaissent avec elles ; la mentore reste.
    await t.run(async (ctx) => {
      const row = present(await ctx.db.query("networkFeatures").withIndex("by_network_feature", (q) => q.eq("networkId", diasporaGa).eq("feature", "pages")).first(), "module des pages")
      await ctx.db.patch(row._id, { enabled: false })
    })
    const closed = await cataloguedActors(t)
    for (const actor of ["talent", "association", "entreprise", "institution"]) expect(closed).not.toContain(actor)
    expect(closed).toContain("mentor")
  })

  it("les accès restreints, le média et le collectif : proposés en développement local seulement", async () => {
    declareDemo()
    const { t } = await fixture()
    const recette = ["media", "communaute", "suspendu", "suspendu-racine", "bloque", "exterieur"] as const
    for (const actor of recette) expect(DIASPORA_GA_DEMO_ACTOR_SPECS[actor].audience).toBe("recette")
    const online = await cataloguedActors(t)
    for (const actor of recette) expect(online).not.toContain(actor)
    openDevTools()
    const local = await cataloguedActors(t)
    for (const actor of recette) expect(local).toContain(actor)
  })

  it("un acteur que la règle ne propose pas ne s'équipe pas : refus indistinct, rien n'est écrit ; contrôle : proposé, il l'est", async () => {
    declareDemo()
    const { t, diasporaGa, root } = await fixture(["pages"])
    // Un acteur de recette, en ligne.
    const blocked = await joinedActor(t, diasporaGa, "bloque")
    expect(await code(equip(blocked.as, "bloque"))).toBe("policyRefused")
    expect(await footprintOf(t, diasporaGa, blocked.personId)).toEqual(UNTOUCHED)
    // L'extérieur, en ligne : aucune admission à la racine non plus.
    const outsider = await welcomedActor(t, "exterieur")
    expect(await code(equip(outsider.as, "exterieur"))).toBe("policyRefused")
    expect(await rootMembershipOf(t, root, outsider.personId)).toBeNull()
    // Un module fermé : la mentore.
    const mentor = await joinedActor(t, diasporaGa, "mentor")
    expect(await code(equip(mentor.as, "mentor"))).toBe("policyRefused")
    expect(await footprintOf(t, diasporaGa, mentor.personId)).toEqual(UNTOUCHED)
    // Contrôle : le mentorat ouvert, la même session est équipée.
    await openNetworkFeatures(t, diasporaGa, ["mentoring"])
    expect(await equip(mentor.as, "mentor")).toMatchObject({ actor: "mentor", status: "verifiee" })
  })
})

describe("comptes de démonstration DIASPORA.GA — porte armée (CH-817 E3)", () => {
  it("sans session de porte valide, le catalogue est vide ; avec, celui de la règle et l'échéance de la session, jamais le jeton", async () => {
    armGate()
    const { t } = await fixture()
    expect(await t.query(api.modules.diaspora.demoAccounts.catalogue, {})).toEqual([])
    expect(await t.query(api.modules.diaspora.demoAccounts.catalogue, { gateToken: GATE_TOKEN })).toEqual([])
    const expiresAt = await openGateSession(t, Date.now())
    const entries = await t.query(api.modules.diaspora.demoAccounts.catalogue, { gateToken: GATE_TOKEN })
    expect(entries).toEqual(offeredWith(false).map((actor) => ({ actor, email: `${actor}@${DEMO_EMAIL_DOMAIN}`, gateExpiresAt: expiresAt })))
    expect(JSON.stringify(entries)).not.toContain(GATE_TOKEN)
    // La session existe, mais l'appel ne la présente pas, ou présente un autre jeton (bien formé ou non) : rien.
    expect(await t.query(api.modules.diaspora.demoAccounts.catalogue, {})).toEqual([])
    for (const gateToken of ["x".repeat(43), `${GATE_TOKEN}x`, "", GATE_TOKEN.toLowerCase()]) {
      expect(await t.query(api.modules.diaspora.demoAccounts.catalogue, { gateToken })).toEqual([])
    }
  })

  it("une session échue, retirée de la liste ou ouverte sous un autre secret ne vaut rien", async () => {
    armGate()
    const expired = await fixture()
    // Ouverte il y a plus de trente minutes : échue.
    await openGateSession(expired.t, Date.now() - DEMO_GATE_SESSION_TTL_MS - 1_000)
    expect(await expired.t.query(api.modules.diaspora.demoAccounts.catalogue, { gateToken: GATE_TOKEN })).toEqual([])

    const revoked = await fixture()
    await openGateSession(revoked.t, Date.now())
    expect(await cataloguedActors(revoked.t, GATE_TOKEN)).toEqual(offeredWith(false))
    await revoked.t.run((ctx) => revokePhonesImpl(ctx, { scope: GATE_SCOPE, phones: [GATE_PHONE] }, Date.now(), GATED_DEMO_ENV))
    expect(await cataloguedActors(revoked.t, GATE_TOKEN)).toEqual([])

    const rotated = await fixture()
    await openGateSession(rotated.t, Date.now())
    expect(await cataloguedActors(rotated.t, GATE_TOKEN)).toEqual(offeredWith(false))
    vi.stubEnv("ANTSIA_DEMO_GATE_SECRET", `${GATE_SECRET}-renouvele`)
    expect(await cataloguedActors(rotated.t, GATE_TOKEN)).toEqual([])
  })

  it("porte indisponible (envoi WhatsApp non configuré) : vide pour tous, session comprise ; production : vide quoi qu'on présente", async () => {
    armGate()
    const { t } = await fixture()
    await openGateSession(t, Date.now())
    expect(await cataloguedActors(t, GATE_TOKEN)).toEqual(offeredWith(false))
    vi.stubEnv("WHATSAPP_PROVIDER", "")
    expect(await cataloguedActors(t, GATE_TOKEN)).toEqual([])
    vi.stubEnv("WHATSAPP_PROVIDER", "bird")
    expect(await cataloguedActors(t, GATE_TOKEN)).toEqual(offeredWith(false))
    // La même configuration sur un autre déploiement (la production comprise) : fermé, session ou pas.
    vi.stubEnv("CONVEX_CLOUD_URL", "https://production-antsia-456.convex.cloud")
    expect(await cataloguedActors(t, GATE_TOKEN)).toEqual([])
    expect(await cataloguedActors(t)).toEqual([])
  })

  it("porte non armée (secret absent) : le comportement d'avant la porte, un jeton présenté est ignoré", async () => {
    declareDemo()
    const { t } = await fixture()
    expect(await t.query(api.modules.diaspora.demoAccounts.catalogue, {})).toEqual(entriesOf(offeredWith(false)))
    expect(await t.query(api.modules.diaspora.demoAccounts.catalogue, { gateToken: GATE_TOKEN })).toEqual(entriesOf(offeredWith(false)))
  })

  it("le verrou est le code, pas l'équipement : une session déjà ouverte sur l'adresse réservée s'équipe, porte armée", async () => {
    armGate()
    const { t, diasporaGa } = await fixture()
    const { as } = await joinedActor(t, diasporaGa, "moderateur")
    expect(await equip(as, "moderateur")).toMatchObject({ actor: "moderateur", status: "verifiee", role: "network_moderator" })
  })
})
