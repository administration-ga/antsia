// @vitest-environment edge-runtime
/** Comptes de démonstration de DIASPORALE : développement local ou démonstration déclarée (ADR-0038), vraie session, actes réservés à l'acteur de l'adresse. */
import { engineErrorCode } from "@antsia/social-contracts/errors"
import {
  DAY_MS,
  DIASPORALE_DEMO_ACTOR_SPECS,
  DIASPORALE_DEMO_ACTORS,
  DIASPORALE_DEMO_COUNTRIES,
  type DiasporaleDemoActor,
  diasporaleDemoDisplayName,
  diasporaleDemoEmailOf,
  type MembershipStatus,
} from "@diasporale/domain"
import { afterEach, describe, expect, it, vi } from "vitest"

import { api, components, internal } from "../../_generated/api"
import type { Id } from "../../_generated/dataModel"
import { DIASPORALE_DEMO_EMAIL_DOMAIN } from "../../lib/devTools"
import { SEED_CONFIRMATION } from "../../seeds/foundations"
import { createTestSession, testConvex } from "../../test.setup"
import { liveSignatoryRole } from "../pages/access"

type T = ReturnType<typeof testConvex>
type As = ReturnType<T["withIdentity"]>

/** L'équipe de modération de démonstration et le domaine réservé, écrits en clair : une dérive du module doit casser le test. */
const DEMO_TEAM_NAME = "Équipe de démonstration"
const DEMO_EMAIL_DOMAIN = "demo.diasporale.test"

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

/** Le moteur semé comme en développement local : fondations (la racine), puis le réseau diasporale (la France ouverte). */
async function fixture() {
  const t = testConvex({ automaticSessions: false })
  const foundations = await t.mutation(internal.seeds.foundations.run, { confirmNonProduction: SEED_CONFIRMATION })
  const seeded = await t.mutation(internal.modules.diaspora.seed.run, { confirmNonProduction: SEED_CONFIRMATION })
  return { t, diasporale: seeded.network, root: foundations.root }
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

/** L'accueil puis l'entrée réelle dans diasporale (annuaire masqué : aucun consentement d'annuaire à rejouer). */
async function joinedAs(t: T, diasporale: Id<"networks">, options: { email: string; handle: string; displayName: string; country: string; emailVerified?: boolean }) {
  const user = await welcomed(t, options)
  await user.as.mutation(api.modules.diaspora.membership.joinDiasporale, {
    networkId: diasporale,
    facet: { countryOfResidence: options.country },
    directoryVisibility: "hidden",
  })
  return user
}

/** L'adresse réservée, l'identifiant, le nom affiché et le pays qu'un acteur du catalogue porte à l'accueil. */
function optionsOf(actor: DiasporaleDemoActor) {
  const spec = DIASPORALE_DEMO_ACTOR_SPECS[actor]
  const displayName = diasporaleDemoDisplayName(actor)
  if (spec.profile === null || displayName === null) throw new Error(`Acteur sans profil : ${actor}`)
  return { email: diasporaleDemoEmailOf(actor), handle: spec.profile.handle, displayName, country: spec.country }
}

/** Un acteur du catalogue connecté sur son adresse réservée, l'accueil réel rejoué (sans entrer dans le réseau). */
async function welcomedActor(t: T, actor: DiasporaleDemoActor) {
  return { ...(await welcomed(t, optionsOf(actor))), actor }
}

/** Un acteur du catalogue connecté sur son adresse réservée, avec l'accueil et l'entrée que l'application rejoue pour lui. */
async function joinedActor(t: T, diasporale: Id<"networks">, actor: DiasporaleDemoActor) {
  return { ...(await joinedAs(t, diasporale, optionsOf(actor))), actor }
}

async function equip(as: As, actor: DiasporaleDemoActor) {
  return await as.mutation(api.modules.diaspora.demoAccounts.equipMyDemoAccount, { actor })
}

async function networkOf(t: T, diasporale: Id<"networks">) {
  return present(await t.run(async (ctx) => await ctx.db.get(diasporale)), "réseau")
}

async function membershipOf(t: T, diasporale: Id<"networks">, personId: Id<"persons">) {
  return present(
    await t.run(async (ctx) => await ctx.db.query("networkMemberships").withIndex("by_network_and_person", (q) => q.eq("networkId", diasporale).eq("personId", personId)).unique()),
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

async function sponsorshipsOf(t: T, diasporale: Id<"networks">) {
  return await t.run(async (ctx) => await ctx.db.query("sponsorships").withIndex("by_network_and_sponsored", (q) => q.eq("networkId", diasporale)).take(10))
}

async function pageOf(t: T, handle: string) {
  return await t.run(async (ctx) => await ctx.db.query("pages").withIndex("by_handle", (q) => q.eq("handle", handle)).unique())
}

async function pagesOf(t: T, diasporale: Id<"networks">) {
  return await t.run(async (ctx) => await ctx.db.query("pages").withIndex("by_network_status_trustRank_createdAt", (q) => q.eq("networkId", diasporale)).take(10))
}

async function signatoriesOf(t: T, personId: Id<"persons">) {
  return await t.run(async (ctx) => await ctx.db.query("pageSignatories").withIndex("by_person", (q) => q.eq("personId", personId)).take(10))
}

async function hubsOf(t: T, diasporale: Id<"networks">) {
  return await t.run(async (ctx) => await ctx.db.query("countryHubs").withIndex("by_network_and_country", (q) => q.eq("networkId", diasporale)).take(10))
}

async function teamsOf(t: T, diasporale: Id<"networks">) {
  return await t.run(async (ctx) => await ctx.db.query("moderationTeams").withIndex("by_network_active", (q) => q.eq("networkId", diasporale)).take(10))
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
async function footprintOf(t: T, diasporale: Id<"networks">, personId: Id<"persons">) {
  const membership = await membershipOf(t, diasporale, personId)
  return {
    status: membership.status,
    role: membership.role,
    idn: (await linkOf(t, personId, "idn")) !== null,
    attestation: (await linkOf(t, personId, "consular_attestation")) !== null,
    pages: (await signatoriesOf(t, personId)).length,
    openCountries: (await networkOf(t, diasporale)).openCountries,
  }
}

const UNTOUCHED = { status: "en_attente", role: "member", idn: false, attestation: false, pages: 0, openCountries: ["FR"] }

/** Le parrain de la démonstration est vérifié depuis plus de 30 jours (le délai de parrainage, strictement). */
async function expectSeasonedSponsor(t: T, diasporale: Id<"networks">, personId: Id<"persons">) {
  const membership = await membershipOf(t, diasporale, personId)
  expect(membership.status).toBe("verifiee")
  expect(Date.now() - membership.statusChangedAt).toBeGreaterThan(30 * DAY_MS)
}

describe("comptes de démonstration DIASPORALE — garde de développement", () => {
  it("fermés sans les outils de développement : catalogue vide et équipement refusé", async () => {
    closeDevTools()
    const { t, diasporale } = await fixture()
    expect(await t.query(api.modules.diaspora.demoAccounts.catalogue, {})).toEqual([])
    const institution = await joinedActor(t, diasporale, "institution")
    expect(await code(equip(institution.as, "institution"))).toBe("policyRefused")
    // Le refus ne laisse aucune trace : ni faits fictifs, ni page, ni pays ouverts.
    expect(await footprintOf(t, diasporale, institution.personId)).toEqual(UNTOUCHED)
    expect(await pageOf(t, "demo-poste-consulaire")).toBeNull()

    // Contrôle : la garde seule refusait. Ouverte, le même appel de la même session aboutit.
    openDevTools()
    expect(await t.query(api.modules.diaspora.demoAccounts.catalogue, {})).toHaveLength(20)
    expect(await equip(institution.as, "institution")).toMatchObject({ status: "verifiee", pageCreated: true })
    expect(await footprintOf(t, diasporale, institution.personId)).toMatchObject({ status: "verifiee", idn: true, attestation: true, pages: 1 })
  })

  it("une variable posée sur un déploiement en nuage n'ouvre rien", async () => {
    vi.stubEnv("ANTSIA_DEV_TOOLS", "true")
    vi.stubEnv("CONVEX_CLOUD_URL", "https://exemple.convex.cloud")
    const { t, diasporale } = await fixture()
    expect(await t.query(api.modules.diaspora.demoAccounts.catalogue, {})).toEqual([])
    const institution = await joinedActor(t, diasporale, "institution")
    expect(await code(equip(institution.as, "institution"))).toBe("policyRefused")
    expect(await footprintOf(t, diasporale, institution.personId)).toEqual(UNTOUCHED)

    // Contrôle : la même variable sur un backend local ouvre bien la garde.
    vi.stubEnv("CONVEX_CLOUD_URL", "http://127.0.0.1:3210")
    expect(await t.query(api.modules.diaspora.demoAccounts.catalogue, {})).toHaveLength(20)
    expect(await equip(institution.as, "institution")).toMatchObject({ status: "verifiee" })
  })

  it("le catalogue nomme les vingt acteurs dans l'ordre du domaine, sur le domaine réservé", async () => {
    openDevTools()
    const { t } = await fixture()
    const entries = await t.query(api.modules.diaspora.demoAccounts.catalogue, {})
    expect(entries).toHaveLength(20)
    expect(entries.map((entry) => entry.actor)).toEqual([...DIASPORALE_DEMO_ACTORS])
    expect(entries).toEqual(DIASPORALE_DEMO_ACTORS.map((actor) => ({ actor, email: `${actor}@${DEMO_EMAIL_DOMAIN}` })))
  })
})

describe("comptes de démonstration DIASPORALE — démonstration déclarée (ADR-0038)", () => {
  it("ouverts sur le déploiement de démonstration déclaré, sans outil de développement : catalogue entier et modératrice équipée", async () => {
    declareDemo()
    const { t, diasporale } = await fixture()
    expect(await t.query(api.modules.diaspora.demoAccounts.catalogue, {})).toEqual(DIASPORALE_DEMO_ACTORS.map((actor) => ({ actor, email: `${actor}@${DEMO_EMAIL_DOMAIN}` })))
    const { as, personId } = await joinedActor(t, diasporale, "moderateur")
    expect(await equip(as, "moderateur")).toEqual({ actor: "moderateur", status: "verifiee", role: "network_moderator", pageId: null, pageCreated: false })
    const team = present((await teamsOf(t, diasporale))[0], "équipe")
    expect(team.name).toBe(DEMO_TEAM_NAME)
    expect(await teamMembersOf(t, team._id)).toEqual([expect.objectContaining({ personId, active: true })])
  })

  it("la déclaration recopiée sur un autre déploiement (la production comprise) n'ouvre rien ; contrôle : sous son nom, si", async () => {
    declareDemo("demo-antsia-123")
    vi.stubEnv("CONVEX_CLOUD_URL", "https://production-antsia-456.convex.cloud")
    const { t, diasporale } = await fixture()
    expect(await t.query(api.modules.diaspora.demoAccounts.catalogue, {})).toEqual([])
    const institution = await joinedActor(t, diasporale, "institution")
    expect(await code(equip(institution.as, "institution"))).toBe("policyRefused")
    expect(await footprintOf(t, diasporale, institution.personId)).toEqual(UNTOUCHED)

    vi.stubEnv("CONVEX_CLOUD_URL", "https://demo-antsia-123.convex.cloud")
    expect(await t.query(api.modules.diaspora.demoAccounts.catalogue, {})).toHaveLength(20)
    expect(await equip(institution.as, "institution")).toMatchObject({ status: "verifiee", pageCreated: true })
  })

  it("le domaine réservé du moteur est celui des adresses de la tranche", () => {
    expect(DIASPORALE_DEMO_EMAIL_DOMAIN).toBe(DEMO_EMAIL_DOMAIN)
    for (const actor of DIASPORALE_DEMO_ACTORS) expect(diasporaleDemoEmailOf(actor).endsWith(`@${DIASPORALE_DEMO_EMAIL_DOMAIN}`)).toBe(true)
  })
})

describe("comptes de démonstration DIASPORALE — refus", () => {
  it("refuse une session dont l'adresse vérifiée est celle d'un autre acteur, ou hors du domaine réservé", async () => {
    openDevTools()
    const { t, diasporale } = await fixture()
    // Un compte léger qui réclame le rôle d'administrateur : l'adresse fait foi, jamais l'argument.
    const light = await joinedActor(t, diasporale, "leger")
    expect(await code(equip(light.as, "administrateur"))).toBe("policyRefused")
    expect(await footprintOf(t, diasporale, light.personId)).toEqual(UNTOUCHED)
    // Une adresse ordinaire, même avec un profil publié et une adhésion.
    const intruder = await joinedAs(t, diasporale, { email: "intrus@example.test", handle: "intrus.recette", displayName: "Intrus RECETTE", country: "FR" })
    expect(await code(equip(intruder.as, "leger"))).toBe("policyRefused")
    expect(await footprintOf(t, diasporale, intruder.personId)).toEqual(UNTOUCHED)
  })

  it("refuse une adresse réservée mais non vérifiée", async () => {
    openDevTools()
    const { t, diasporale } = await fixture()
    const unverified = await joinedAs(t, diasporale, { ...optionsOf("institution"), emailVerified: false })
    expect(await code(equip(unverified.as, "institution"))).toBe("policyRefused")
    expect(await footprintOf(t, diasporale, unverified.personId)).toEqual(UNTOUCHED)

    // Contrôle : une fois l'adresse vérifiée par le composant d'authentification, la même session est équipée.
    await t.mutation(components.betterAuth.adapter.updateOne, { input: { model: "user", where: [{ field: "_id", value: unverified.authUserId }], update: { emailVerified: true } } })
    expect(await equip(unverified.as, "institution")).toMatchObject({ status: "verifiee", pageCreated: true })
  })

  it("le nouvel arrivant n'a rien à équiper : l'accueil reste à remplir", async () => {
    openDevTools()
    const { t, diasporale } = await fixture()
    // Il a rempli l'accueil lui-même et rejoint le réseau : le refus tient au catalogue, pas à l'absence d'adhésion.
    const newcomer = await joinedAs(t, diasporale, { email: diasporaleDemoEmailOf("nouveau"), handle: "nouveau.recette", displayName: "Nouveau RECETTE", country: "FR" })
    expect(await code(equip(newcomer.as, "nouveau"))).toBe("policyRefused")
    expect(await footprintOf(t, diasporale, newcomer.personId)).toEqual(UNTOUCHED)
  })

  it("exige l'adhésion faite par le vrai accueil : sans elle, introuvable", async () => {
    openDevTools()
    const { t, diasporale } = await fixture()
    // Profil publié et consentement donnés, mais l'entrée dans le réseau (joinDiasporale) jamais faite.
    const user = await welcomedActor(t, "leger")
    expect(await code(equip(user.as, "leger"))).toBe("notFound")
    const membership = await t.run(async (ctx) => await ctx.db.query("networkMemberships").withIndex("by_network_and_person", (q) => q.eq("networkId", diasporale).eq("personId", user.personId)).unique())
    expect(membership).toBeNull()
    // Rien n'a été créé à sa place : les pays de la démonstration ne sont pas ouverts non plus.
    expect((await networkOf(t, diasporale)).openCountries).toEqual(["FR"])
  })

  it("une adhésion quittée ne s'équipe pas non plus", async () => {
    openDevTools()
    const { t, diasporale } = await fixture()
    const leger = await joinedActor(t, diasporale, "leger")
    await leger.as.mutation(api.modules.diaspora.membership.leaveDiasporale, { networkId: diasporale })
    expect(await code(equip(leger.as, "leger"))).toBe("notFound")
    expect(await membershipOf(t, diasporale, leger.personId)).toMatchObject({ status: "partie" })
  })

  it("sans le réseau diasporale semé, introuvable", async () => {
    openDevTools()
    const t = testConvex({ automaticSessions: false })
    await t.mutation(internal.seeds.foundations.run, { confirmNonProduction: SEED_CONFIRMATION })
    const user = await welcomedActor(t, "leger")
    expect(await code(equip(user.as, "leger"))).toBe("notFound")
  })
})

describe("comptes de démonstration DIASPORALE — statut dérivé des faits fictifs", () => {
  const derived: [DiasporaleDemoActor, MembershipStatus][] = [
    ["leger", "en_attente"],
    ["declare", "declaree"],
    ["verifie", "verifiee"],
    ["canada", "declaree"],
    ["institution", "verifiee"],
  ]

  it.each(derived)("%s : le statut dérivé est « %s », celui du catalogue et de l'adhésion stockée", async (actor, status) => {
    openDevTools()
    const { t, diasporale } = await fixture()
    const { as, personId } = await joinedActor(t, diasporale, actor)
    const equipped = await equip(as, actor)
    expect(DIASPORALE_DEMO_ACTOR_SPECS[actor].expectedStatus).toBe(status)
    expect(equipped).toMatchObject({ actor, status, role: "member" })
    // Le statut rendu est celui qui est stocké : la vraie dérivation l'a écrit, la démonstration ne l'écrit jamais.
    expect((await membershipOf(t, diasporale, personId)).status).toBe(status)
    expect(await as.query(api.modules.diaspora.membership.myMembership, { networkId: diasporale })).toMatchObject({ status })
  })

  it("leger : aucun fait fictif n'est posé", async () => {
    openDevTools()
    const { t, diasporale } = await fixture()
    const { as, personId } = await joinedActor(t, diasporale, "leger")
    await equip(as, "leger")
    expect(await linkOf(t, personId, "idn")).toBeNull()
    expect(await linkOf(t, personId, "consular_attestation")).toBeNull()
    expect(await attestationRowsOf(t, personId)).toEqual([])
    expect(await sponsorshipsOf(t, diasporale)).toEqual([])
  })

  it("declare : compte IDN et preuve fictifs de niveau 1, nationalité gabonaise, lien relu par la vraie synchronisation", async () => {
    openDevTools()
    const { t, diasporale } = await fixture()
    const { as, authUserId, personId } = await joinedActor(t, diasporale, "declare")
    await equip(as, "declare")
    const link = await linkOf(t, personId, "idn")
    expect(link).toMatchObject({ provider: "idn", subject: "diasporale-demo-idn-declare", loa: 1, nationality: "GA" })
    expect(link?.revokedAt).toBeUndefined()
    // Le compte IDN vit dans le composant d'authentification, la preuve dans le moteur : un seul de chaque.
    expect(await idnAccountIdsOf(t, authUserId)).toEqual(["diasporale-demo-idn-declare"])
    const proofs = await t.run(async (ctx) => await ctx.db.query("idnProofs").withIndex("by_subject", (q) => q.eq("subject", "diasporale-demo-idn-declare")).take(5))
    expect(proofs).toHaveLength(1)
    expect(proofs[0]).toMatchObject({ loa: 1, nationality: "GA" })
    // Ni attestation ni parrain : l'IDN seule déclare.
    expect(await linkOf(t, personId, "consular_attestation")).toBeNull()
    expect(await attestationRowsOf(t, personId)).toEqual([])
  })

  it("canada : identité IDN fictive de niveau 2 sans attestation ni parrain, déclarée seulement", async () => {
    openDevTools()
    const { t, diasporale } = await fixture()
    const { as, personId } = await joinedActor(t, diasporale, "canada")
    expect(await equip(as, "canada")).toMatchObject({ status: "declaree" })
    expect(await linkOf(t, personId, "idn")).toMatchObject({ subject: "diasporale-demo-idn-canada", loa: 2, nationality: "GA" })
    expect(await linkOf(t, personId, "consular_attestation")).toBeNull()
    expect(await attestationRowsOf(t, personId)).toEqual([])
    expect(await sponsorshipsOf(t, diasporale)).toEqual([])
    expect(await membershipOf(t, diasporale, personId)).toMatchObject({ status: "declaree" })
  })

  it("verifie : attestation consulaire fictive (lien d'identité et demande vérifiée avec son consentement)", async () => {
    openDevTools()
    const { t, diasporale } = await fixture()
    const { as, personId } = await joinedActor(t, diasporale, "verifie")
    const equipped = await equip(as, "verifie")
    expect(equipped.status).toBe("verifiee")
    expect((await membershipOf(t, diasporale, personId)).status).toBe(equipped.status)
    expect(await membershipOf(t, diasporale, personId)).toMatchObject({ verifiedBy: "consulat" })
    // Le lien d'identité que lisent les faits : le pays de l'acteur et le poste FICTIF.
    expect(await linkOf(t, personId, "consular_attestation")).toMatchObject({ provider: "consular_attestation", subject: "diasporale-demo-attestation-verifie", country: "FR", postSlug: "poste-de-demonstration" })
    expect(await linkOf(t, personId, "idn")).toBeNull()
    // La demande « vérifiée » que lit l'écran des réglages, avec le consentement en vigueur et sans donnée consulaire.
    const rows = await attestationRowsOf(t, personId)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ networkId: diasporale, personId, subjectKind: "emailHash", result: "verified", country: "FR", postSlug: "poste-de-demonstration" })
    expect(rows[0]?.subjectHash).toMatch(/^[0-9a-f]{64}$/)
    const consent = await t.run(async (ctx) => (rows[0] ? await ctx.db.get(rows[0].consentId) : null))
    expect(consent).toMatchObject({ personId, networkId: diasporale, purpose: "consular_attestation" })
    expect(consent?.revokedAt).toBeUndefined()
    expect(await as.query(api.modules.diaspora.membership.myMembership, { networkId: diasporale })).toMatchObject({
      status: "verifiee",
      attestation: { outcome: "verified", postSlug: "poste-de-demonstration" },
    })
  })

  it("belgique : l'attestation porte le pays de l'acteur, et sa vérification n'est pas antidatée", async () => {
    openDevTools()
    const { t, diasporale } = await fixture()
    const { as, personId } = await joinedActor(t, diasporale, "belgique")
    expect(await equip(as, "belgique")).toMatchObject({ status: "verifiee" })
    expect(await linkOf(t, personId, "consular_attestation")).toMatchObject({ country: "BE" })
    expect((await attestationRowsOf(t, personId))[0]).toMatchObject({ country: "BE", result: "verified" })
    // Seul l'acteur « verifie » est antidaté : un autre membre vérifié ne peut pas encore parrainer.
    expect(DIASPORALE_DEMO_ACTOR_SPECS.belgique.canSponsor).toBe(false)
    expect(Date.now() - (await membershipOf(t, diasporale, personId)).statusChangedAt).toBeLessThan(DAY_MS)
    expect(await as.query(api.modules.diaspora.membership.sponsorDashboard, { networkId: diasporale })).toMatchObject({ eligible: false, refusal: "sponsor_too_recent" })
  })

  it("institution : identité IDN de niveau 2 et attestation consulaire, deux faits indépendants", async () => {
    openDevTools()
    const { t, diasporale } = await fixture()
    const { as, personId } = await joinedActor(t, diasporale, "institution")
    expect(await equip(as, "institution")).toMatchObject({ status: "verifiee" })
    expect(await linkOf(t, personId, "idn")).toMatchObject({ subject: "diasporale-demo-idn-institution", loa: 2, nationality: "GA" })
    expect(await linkOf(t, personId, "consular_attestation")).toMatchObject({ subject: "diasporale-demo-attestation-institution" })
    expect((await attestationRowsOf(t, personId))[0]).toMatchObject({ result: "verified" })
    // L'attestation vérifie en premier : la source de vérification est le consulat.
    expect(await membershipOf(t, diasporale, personId)).toMatchObject({ verifiedBy: "consulat" })
  })

  it("rejouer l'équipement ne recrée aucun fait", async () => {
    openDevTools()
    const { t, diasporale } = await fixture()
    const { as, authUserId, personId } = await joinedActor(t, diasporale, "institution")
    const first = await equip(as, "institution")
    const count = async () => ({
      idnLinks: (await t.run(async (ctx) => await ctx.db.query("identityLinks").withIndex("by_person_and_provider", (q) => q.eq("personId", personId).eq("provider", "idn")).take(5))).length,
      attestationLinks: (await t.run(async (ctx) => await ctx.db.query("identityLinks").withIndex("by_person_and_provider", (q) => q.eq("personId", personId).eq("provider", "consular_attestation")).take(5))).length,
      attestations: (await attestationRowsOf(t, personId)).length,
      consents: (await t.run(async (ctx) => await ctx.db.query("consents").withIndex("by_person_and_purpose", (q) => q.eq("personId", personId).eq("purpose", "consular_attestation")).take(5))).length,
      idnAccounts: (await idnAccountIdsOf(t, authUserId)).length,
      idnProofs: (await t.run(async (ctx) => await ctx.db.query("idnProofs").withIndex("by_subject", (q) => q.eq("subject", "diasporale-demo-idn-institution")).take(5))).length,
      pages: (await pagesOf(t, diasporale)).length,
      signatories: (await signatoriesOf(t, personId)).length,
    })
    const before = await count()
    expect(before).toEqual({ idnLinks: 1, attestationLinks: 1, attestations: 1, consents: 1, idnAccounts: 1, idnProofs: 1, pages: 1, signatories: 1 })
    const second = await equip(as, "institution")
    expect(await count()).toEqual(before)
    expect(second).toEqual({ ...first, pageCreated: false })
  })
})

describe("comptes de démonstration DIASPORALE — parrainage", () => {
  it("le filleul équipé avant son parrain attend, puis est déclaré dès que le parrain est équipé", async () => {
    openDevTools()
    const { t, diasporale } = await fixture()
    // Le filleul d'abord : le parrain n'a pas encore de profil, rien ne peut le parrainer.
    const sponsored = await joinedActor(t, diasporale, "parraine")
    expect(await equip(sponsored.as, "parraine")).toMatchObject({ status: "en_attente" })
    expect(await sponsorshipsOf(t, diasporale)).toEqual([])
    // Le parrain ensuite : vérifié et antidaté, il complète le filleul déjà équipé.
    const sponsor = await joinedActor(t, diasporale, "verifie")
    expect(await equip(sponsor.as, "verifie")).toMatchObject({ status: "verifiee" })
    const rows = await sponsorshipsOf(t, diasporale)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ networkId: diasporale, sponsorPersonId: sponsor.personId, sponsoredPersonId: sponsored.personId })
    expect(rows[0]?.revokedAt).toBeUndefined()
    expect(await membershipOf(t, diasporale, sponsored.personId)).toMatchObject({ status: "declaree", sponsorPersonId: sponsor.personId })
    await expectSeasonedSponsor(t, diasporale, sponsor.personId)
    // La vraie règle de parrainage le reconnaît : éligible, avec le filleul dans son journal.
    const dashboard = await sponsor.as.query(api.modules.diaspora.membership.sponsorDashboard, { networkId: diasporale })
    expect(dashboard).toMatchObject({ eligible: true, refusal: null })
    expect(dashboard.given.map((entry) => entry.sponsored.handle)).toEqual(["demo.parraine"])
  })

  it("le parrain équipé d'abord : le filleul est déclaré dès son équipement", async () => {
    openDevTools()
    const { t, diasporale } = await fixture()
    const sponsor = await joinedActor(t, diasporale, "verifie")
    expect(await equip(sponsor.as, "verifie")).toMatchObject({ status: "verifiee" })
    expect(await sponsorshipsOf(t, diasporale)).toEqual([])
    await expectSeasonedSponsor(t, diasporale, sponsor.personId)
    const sponsored = await joinedActor(t, diasporale, "parraine")
    expect(await equip(sponsored.as, "parraine")).toMatchObject({ status: "declaree" })
    const rows = await sponsorshipsOf(t, diasporale)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ networkId: diasporale, sponsorPersonId: sponsor.personId, sponsoredPersonId: sponsored.personId })
    expect(rows[0]?.revokedAt).toBeUndefined()
    expect(await membershipOf(t, diasporale, sponsored.personId)).toMatchObject({ status: "declaree", sponsorPersonId: sponsor.personId })
    await expectSeasonedSponsor(t, diasporale, sponsor.personId)
  })

  it("rejouer l'équipement du parrain ou du filleul ne double pas le parrainage", async () => {
    openDevTools()
    const { t, diasporale } = await fixture()
    const sponsored = await joinedActor(t, diasporale, "parraine")
    await equip(sponsored.as, "parraine")
    const sponsor = await joinedActor(t, diasporale, "verifie")
    await equip(sponsor.as, "verifie")
    await equip(sponsor.as, "verifie")
    await equip(sponsored.as, "parraine")
    expect(await sponsorshipsOf(t, diasporale)).toHaveLength(1)
    expect(await membershipOf(t, diasporale, sponsored.personId)).toMatchObject({ status: "declaree" })
    await expectSeasonedSponsor(t, diasporale, sponsor.personId)
  })

  it("une autre personne vérifiée qui porte l'identifiant du parrain n'est jamais prise pour parrain", async () => {
    openDevTools()
    const { t, diasporale } = await fixture()
    // Elle a pris « demo.verifie » sur une adresse ordinaire, et elle est vérifiée de longue date.
    const homonym = await joinedAs(t, diasporale, { email: "homonyme@example.test", handle: "demo.verifie", displayName: "Homonyme RECETTE", country: "FR" })
    await t.run(async (ctx) => {
      const membership = present(await ctx.db.query("networkMemberships").withIndex("by_network_and_person", (q) => q.eq("networkId", diasporale).eq("personId", homonym.personId)).unique(), "adhésion")
      await ctx.db.patch(membership._id, { status: "verifiee", statusChangedAt: Date.now() - 60 * DAY_MS })
    })
    const sponsored = await joinedActor(t, diasporale, "parraine")
    expect(await equip(sponsored.as, "parraine")).toMatchObject({ status: "en_attente" })
    expect(await sponsorshipsOf(t, diasporale)).toEqual([])
  })

  it("une autre personne qui porte l'identifiant du filleul n'est jamais parrainée", async () => {
    openDevTools()
    const { t, diasporale } = await fixture()
    const homonym = await joinedAs(t, diasporale, { email: "homonyme@example.test", handle: "demo.parraine", displayName: "Homonyme RECETTE", country: "FR" })
    const sponsor = await joinedActor(t, diasporale, "verifie")
    expect(await equip(sponsor.as, "verifie")).toMatchObject({ status: "verifiee" })
    expect(await sponsorshipsOf(t, diasporale)).toEqual([])
    expect(await membershipOf(t, diasporale, homonym.personId)).toMatchObject({ status: "en_attente" })
  })
})

describe("comptes de démonstration DIASPORALE — rôles", () => {
  it("moderateur : rôle de modération du réseau et membre actif de l'équipe de démonstration", async () => {
    openDevTools()
    const { t, diasporale } = await fixture()
    const { as, personId } = await joinedActor(t, diasporale, "moderateur")
    expect(await equip(as, "moderateur")).toEqual({ actor: "moderateur", status: "verifiee", role: "network_moderator", pageId: null, pageCreated: false })
    expect(await membershipOf(t, diasporale, personId)).toMatchObject({ status: "verifiee", role: "network_moderator" })
    const teams = await teamsOf(t, diasporale)
    expect(teams.map((team) => team.name)).toEqual([DEMO_TEAM_NAME])
    const team = present(teams[0], "équipe")
    expect(team).toMatchObject({ networkId: diasporale, active: true })
    expect(team.scope).toBeUndefined()
    expect(await teamMembersOf(t, team._id)).toEqual([expect.objectContaining({ networkId: diasporale, teamId: team._id, personId, active: true })])
    // Rejouer ne crée ni seconde équipe ni seconde ligne de membre.
    await equip(as, "moderateur")
    expect(await teamsOf(t, diasporale)).toHaveLength(1)
    expect(await teamMembersOf(t, team._id)).toHaveLength(1)
  })

  it("administrateur : rôle d'administrateur du réseau, sans équipe de modération", async () => {
    openDevTools()
    const { t, diasporale } = await fixture()
    const { as, personId } = await joinedActor(t, diasporale, "administrateur")
    expect(await equip(as, "administrateur")).toEqual({ actor: "administrateur", status: "verifiee", role: "network_admin", pageId: null, pageCreated: false })
    expect(await membershipOf(t, diasporale, personId)).toMatchObject({ status: "verifiee", role: "network_admin" })
    expect(await teamsOf(t, diasporale)).toEqual([])
  })

  it("un acteur sans rôle particulier reste simple membre", async () => {
    openDevTools()
    const { t, diasporale } = await fixture()
    const { as, personId } = await joinedActor(t, diasporale, "mentor")
    expect(await equip(as, "mentor")).toMatchObject({ status: "verifiee", role: "member" })
    expect(await membershipOf(t, diasporale, personId)).toMatchObject({ role: "member" })
    expect(await teamsOf(t, diasporale)).toEqual([])
  })
})

describe("comptes de démonstration DIASPORALE — pages", () => {
  it("entreprise : page d'entreprise du réseau diasporale qu'elle administre ; rejouable sans doublon", async () => {
    openDevTools()
    const { t, diasporale } = await fixture()
    const { as, personId } = await joinedActor(t, diasporale, "entreprise")
    const first = await equip(as, "entreprise")
    expect(first).toMatchObject({ actor: "entreprise", status: "verifiee", role: "member", pageCreated: true })
    expect(first.pageId).not.toBeNull()
    const page = present(await pageOf(t, "demo-saveurs-du-gabon"), "page")
    expect(page._id).toBe(first.pageId)
    expect(page).toMatchObject({
      networkId: diasporale,
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
    expect(signatories[0]).toMatchObject({ networkId: diasporale, pageId: page._id, personId, role: "admin" })
    expect(signatories[0]?.acceptedAt).toEqual(expect.any(Number))
    expect(await t.run(async (ctx) => await liveSignatoryRole(ctx, page, personId))).toBe("admin")

    // Un second appel ne recrée rien et rend la même page, non créée.
    const second = await equip(as, "entreprise")
    expect(second).toMatchObject({ pageCreated: false, pageId: first.pageId })
    expect(await pagesOf(t, diasporale)).toHaveLength(1)
    expect(await signatoriesOf(t, personId)).toHaveLength(1)
  })

  it("institution : page officielle, signée par une identité forte", async () => {
    openDevTools()
    const { t, diasporale } = await fixture()
    const { as, personId } = await joinedActor(t, diasporale, "institution")
    const equipped = await equip(as, "institution")
    expect(equipped).toMatchObject({ status: "verifiee", pageCreated: true })
    const page = present(await pageOf(t, "demo-poste-consulaire"), "page")
    expect(page._id).toBe(equipped.pageId)
    expect(page).toMatchObject({ networkId: diasporale, ownerKind: "institution", trust: "official", trustRank: 2, city: "Paris", country: "FR", status: "active" })
    // Une page officielle n'engage que ses signataires d'identité forte : l'IDN de niveau 2 le prouve.
    expect(await t.run(async (ctx) => await liveSignatoryRole(ctx, page, personId))).toBe("admin")
  })

  it("une page du même identifiant créée par une autre personne n'est jamais reprise", async () => {
    openDevTools()
    const { t, diasporale } = await fixture()
    const other = await joinedAs(t, diasporale, { email: "autre@example.test", handle: "autre.recette", displayName: "Autre RECETTE", country: "FR" })
    const now = Date.now()
    await t.run(async (ctx) => {
      await ctx.db.insert("pages", {
        networkId: diasporale,
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
    const { as, personId } = await joinedActor(t, diasporale, "entreprise")
    expect(await code(equip(as, "entreprise"))).toBe("conflict")
    expect(await signatoriesOf(t, personId)).toEqual([])
    expect(await pagesOf(t, diasporale)).toHaveLength(1)
    // Le refus défait tout l'équipement (une seule transaction) : ni attestation, ni statut, ni pays ouverts.
    expect(await footprintOf(t, diasporale, personId)).toEqual(UNTOUCHED)
    expect(await attestationRowsOf(t, personId)).toEqual([])
  })
})

describe("comptes de démonstration DIASPORALE — suspension", () => {
  it("suspendu : adhésion suspendue en dernier, statut antérieur gardé ; rejouable sans erreur", async () => {
    openDevTools()
    const { t, diasporale } = await fixture()
    const { as, personId } = await joinedActor(t, diasporale, "suspendu")
    const first = await equip(as, "suspendu")
    expect(first).toMatchObject({ actor: "suspendu", status: "suspendue", role: "member" })
    expect(DIASPORALE_DEMO_ACTOR_SPECS.suspendu.expectedStatus).toBe("suspendue")
    // Les faits vérifient, puis la sanction (jamais dérivée) prend la main et garde le statut à rendre à sa levée.
    expect(await membershipOf(t, diasporale, personId)).toMatchObject({ status: "suspendue", statusBeforeSuspension: "verifiee" })
    expect(await as.query(api.modules.diaspora.membership.myMembership, { networkId: diasporale })).toMatchObject({ status: "suspendue" })

    // Un second appel ne lève rien et laisse la sanction en place.
    const second = await equip(as, "suspendu")
    expect(second).toMatchObject({ status: "suspendue" })
    expect(await membershipOf(t, diasporale, personId)).toMatchObject({ status: "suspendue", statusBeforeSuspension: "verifiee" })
  })

  it("suspendu : la sanction reste dans DIASPORALE, la racine reste ouverte", async () => {
    openDevTools()
    const { t, diasporale, root } = await fixture()
    const { as, personId } = await joinedActor(t, diasporale, "suspendu")
    await equip(as, "suspendu")
    expect(await readsNetwork(as, diasporale)).toBe("membershipSuspended")
    // La racine n'est pas touchée : la même personne y lit toujours.
    expect(await rootMembershipOf(t, root, personId)).toMatchObject({ status: "verifiee" })
    expect(await readsNetwork(as, root)).toBeNull()
  })
})

describe("comptes de démonstration DIASPORALE — suspension à la racine", () => {
  it("suspendu-racine : la racine suspendue en dernier, par le chemin de la console ; la suspension vaut partout", async () => {
    openDevTools()
    const { t, diasporale, root } = await fixture()
    const { as, personId } = await joinedActor(t, diasporale, "suspendu-racine")
    // Contrôle : entrée par le vrai accueil, la personne lit DIASPORALE et la racine.
    expect(await readsNetwork(as, diasporale)).toBeNull()
    expect(await readsNetwork(as, root)).toBeNull()

    expect(await equip(as, "suspendu-racine")).toEqual({ actor: "suspendu-racine", status: "suspendue", role: "member", pageId: null, pageCreated: false })
    expect(DIASPORALE_DEMO_ACTOR_SPECS["suspendu-racine"].expectedStatus).toBe("suspendue")
    // La racine porte la suspension, sans échéance, et le statut à rendre à sa levée.
    const rootMembership = present(await rootMembershipOf(t, root, personId), "adhésion racine")
    expect(rootMembership).toMatchObject({ status: "suspendue", statusBeforeSuspension: "verifiee" })
    expect(rootMembership.suspendedUntil).toBeUndefined()
    // L'adhésion DIASPORALE garde son statut propre : c'est la racine qui ferme, partout.
    const own = await membershipOf(t, diasporale, personId)
    expect(own.status).toBe("verifiee")
    expect(own.statusBeforeSuspension).toBeUndefined()
    expect(await as.query(api.modules.diaspora.membership.myMembership, { networkId: diasporale })).toMatchObject({ status: "suspendue", root: { status: "suspendue" } })
    expect(await readsNetwork(as, diasporale)).toBe("membershipSuspended")
    expect(await readsNetwork(as, root)).toBe("membershipSuspended")
  })

  it("rejouer l'équipement ne lève rien et ne réécrit pas la suspension", async () => {
    openDevTools()
    const { t, diasporale, root } = await fixture()
    const { as, personId } = await joinedActor(t, diasporale, "suspendu-racine")
    const first = await equip(as, "suspendu-racine")
    const suspended = present(await rootMembershipOf(t, root, personId), "adhésion racine")
    expect(await equip(as, "suspendu-racine")).toEqual(first)
    expect(await rootMembershipOf(t, root, personId)).toMatchObject({ status: "suspendue", statusBeforeSuspension: "verifiee", statusChangedAt: suspended.statusChangedAt })
    expect((await membershipOf(t, diasporale, personId)).status).toBe("verifiee")
  })
})

describe("comptes de démonstration DIASPORALE — membre bloqué", () => {
  it("bloque : bloqué par « verifie » par le vrai blocage personnel, son statut intact ; vu des deux côtés", async () => {
    openDevTools()
    const { t, diasporale } = await fixture()
    const blocker = await joinedActor(t, diasporale, "verifie")
    await equip(blocker.as, "verifie")
    const blocked = await joinedActor(t, diasporale, "bloque")
    expect(DIASPORALE_DEMO_ACTOR_SPECS.bloque.blockedBy).toBe("verifie")
    // Contrôle : avant l'équipement, rien ne les sépare.
    expect(await blocked.as.query(api.modules.graph.connections.connectionWith, { networkId: diasporale, otherPersonId: blocker.personId })).toEqual({ state: "none" })
    expect(await blocksAgainst(t, blocked.personId)).toEqual([])

    expect(await equip(blocked.as, "bloque")).toEqual({ actor: "bloque", status: "verifiee", role: "member", pageId: null, pageCreated: false })
    // L'intention de son auteur et la ligne de la paire dans le réseau, comme `blockPerson` les écrit.
    const intents = await blocksAgainst(t, blocked.personId)
    expect(intents).toHaveLength(1)
    expect(intents[0]).toMatchObject({ networkId: diasporale, blockerPersonId: blocker.personId, targetPersonId: blocked.personId })
    const rows = await blockedRowsBy(t, blocker.personId)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ networkId: diasporale, status: "blocked", blockedByPersonId: blocker.personId })
    // Un blocage protège, il ne sanctionne pas : le statut du bloqué reste le sien.
    expect(await membershipOf(t, diasporale, blocked.personId)).toMatchObject({ status: "verifiee" })
    // Le bloqueur le voit dans ses protections ; le bloqué ne voit rien (refus indistinct).
    expect(await blocker.as.query(api.modules.graph.connections.connectionWith, { networkId: diasporale, otherPersonId: blocked.personId })).toMatchObject({ state: "blocked_by_me" })
    expect(await blocked.as.query(api.modules.graph.connections.connectionWith, { networkId: diasporale, otherPersonId: blocker.personId })).toEqual({ state: "none" })
    const mine = await blocker.as.query(api.modules.graph.blocks.paginateMine, { networkId: diasporale, source: "intents", paginationOpts: { cursor: null, numItems: 5 } })
    expect(mine.page.map((entry) => entry.targetPersonId)).toEqual([blocked.personId])
    // Une demande de relation du bloqué rend la réponse d'une demande envoyée, sans rien écrire (D12).
    expect(await blocked.as.mutation(api.modules.graph.connections.requestConnection, { networkId: diasporale, targetPersonId: blocker.personId })).toEqual({ status: "requested" })
    expect(await t.run(async (ctx) => await ctx.db.query("connections").withIndex("by_network_low_status", (q) => q.eq("networkId", diasporale)).take(10))).toHaveLength(1)
  })

  it("le bloqué équipé avant son bloqueur : le blocage se pose dès que le bloqueur est équipé", async () => {
    openDevTools()
    const { t, diasporale } = await fixture()
    const blocked = await joinedActor(t, diasporale, "bloque")
    expect(await equip(blocked.as, "bloque")).toMatchObject({ status: "verifiee" })
    expect(await blocksAgainst(t, blocked.personId)).toEqual([])
    const blocker = await joinedActor(t, diasporale, "verifie")
    expect(await equip(blocker.as, "verifie")).toMatchObject({ status: "verifiee" })
    expect((await blocksAgainst(t, blocked.personId)).map((row) => row.blockerPersonId)).toEqual([blocker.personId])
    expect(await blocker.as.query(api.modules.graph.connections.connectionWith, { networkId: diasporale, otherPersonId: blocked.personId })).toMatchObject({ state: "blocked_by_me" })
  })

  it("rejouer l'équipement de l'un ou de l'autre ne double pas le blocage", async () => {
    openDevTools()
    const { t, diasporale } = await fixture()
    const blocker = await joinedActor(t, diasporale, "verifie")
    await equip(blocker.as, "verifie")
    const blocked = await joinedActor(t, diasporale, "bloque")
    await equip(blocked.as, "bloque")
    await equip(blocked.as, "bloque")
    await equip(blocker.as, "verifie")
    expect(await blocksAgainst(t, blocked.personId)).toHaveLength(1)
    expect(await blockedRowsBy(t, blocker.personId)).toHaveLength(1)
  })

  it("une autre personne qui porte l'identifiant du bloqueur ne bloque jamais ; contrôle : sur l'adresse réservée, si", async () => {
    openDevTools()
    const { t, diasporale } = await fixture()
    // Elle a pris « demo.verifie » sur une adresse ordinaire.
    const homonym = await joinedAs(t, diasporale, { email: "homonyme@example.test", handle: "demo.verifie", displayName: "Homonyme RECETTE", country: "FR" })
    const blocked = await joinedActor(t, diasporale, "bloque")
    await equip(blocked.as, "bloque")
    expect(await blocksAgainst(t, blocked.personId)).toEqual([])
    // Contrôle : la même personne, sur l'adresse réservée vérifiée de l'acteur, est bien le bloqueur.
    await t.mutation(components.betterAuth.adapter.updateOne, {
      input: { model: "user", where: [{ field: "_id", value: homonym.authUserId }], update: { email: diasporaleDemoEmailOf("verifie"), emailVerified: true } },
    })
    await equip(blocked.as, "bloque")
    expect((await blocksAgainst(t, blocked.personId)).map((row) => row.blockerPersonId)).toEqual([homonym.personId])
  })

  it("un bloqueur sorti du réseau ne bloque pas ; contrôle : revenu, il bloque", async () => {
    openDevTools()
    const { t, diasporale } = await fixture()
    const blocker = await joinedActor(t, diasporale, "verifie")
    await equip(blocker.as, "verifie")
    await blocker.as.mutation(api.modules.diaspora.membership.leaveDiasporale, { networkId: diasporale })
    const blocked = await joinedActor(t, diasporale, "bloque")
    await equip(blocked.as, "bloque")
    expect(await blocksAgainst(t, blocked.personId)).toEqual([])
    // Contrôle : de retour dans le réseau, le même bloqueur pose le blocage au prochain équipement.
    await blocker.as.mutation(api.modules.diaspora.membership.joinDiasporale, { networkId: diasporale, facet: { countryOfResidence: "FR" }, directoryVisibility: "hidden" })
    await equip(blocked.as, "bloque")
    expect((await blocksAgainst(t, blocked.personId)).map((row) => row.blockerPersonId)).toEqual([blocker.personId])
  })

  it("une cible dont l'effacement est demandé n'est pas bloquée ; contrôle : demande retirée, elle l'est", async () => {
    openDevTools()
    const { t, diasporale } = await fixture()
    const blocked = await joinedActor(t, diasporale, "bloque")
    await equip(blocked.as, "bloque")
    await t.run(async (ctx) => {
      await ctx.db.patch(blocked.personId, { deletionRequestedAt: Date.now() })
    })
    const blocker = await joinedActor(t, diasporale, "verifie")
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

describe("comptes de démonstration DIASPORALE — extérieur au réseau", () => {
  it("exterieur : équipé sans adhésion — admis à la racine par la vraie règle, rien dans DIASPORALE", async () => {
    openDevTools()
    const { t, diasporale, root } = await fixture()
    // L'accueil d'ANTSIA seulement (consentement, profil publié), comme l'application le rejoue : jamais joinDiasporale.
    const outsider = await welcomedActor(t, "exterieur")
    expect(DIASPORALE_DEMO_ACTOR_SPECS.exterieur).toMatchObject({ outsider: true, expectedStatus: null })
    expect(await equip(outsider.as, "exterieur")).toEqual({ actor: "exterieur", status: null, role: null, pageId: null, pageCreated: false })
    // Un compte ANTSIA : membre déclaré de la racine (politique ouverte, sans identité forte), qui y lit.
    expect(await rootMembershipOf(t, root, outsider.personId)).toMatchObject({ status: "declaree", role: "member" })
    expect(await readsNetwork(outsider.as, root)).toBeNull()
    // Aucune adhésion DIASPORALE : le réseau fermé lui reste fermé, d'un refus indistinct.
    expect(await t.run(async (ctx) => await ctx.db.query("networkMemberships").withIndex("by_network_and_person", (q) => q.eq("networkId", diasporale).eq("personId", outsider.personId)).unique())).toBeNull()
    expect(await outsider.as.query(api.modules.diaspora.membership.myMembership, { networkId: diasporale })).toBeNull()
    expect(await readsNetwork(outsider.as, diasporale)).toBe("notFound")
    // Rien d'autre n'est posé : ni fait fictif, ni pays ouvert.
    expect(await linkOf(t, outsider.personId, "idn")).toBeNull()
    expect(await linkOf(t, outsider.personId, "consular_attestation")).toBeNull()
    expect((await networkOf(t, diasporale)).openCountries).toEqual(["FR"])
  })

  it("exige l'accueil d'ANTSIA : profil publié puis consentement ; sans eux, aucune adhésion", async () => {
    openDevTools()
    const { t, root } = await fixture()
    const user = await signedIn(t, diasporaleDemoEmailOf("exterieur"))
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
    const { t, diasporale, root } = await fixture()
    const outsider = await welcomedActor(t, "exterieur")
    await equip(outsider.as, "exterieur")
    expect(await equip(outsider.as, "exterieur")).toEqual({ actor: "exterieur", status: null, role: null, pageId: null, pageCreated: false })
    const memberships = await t.run(async (ctx) => await ctx.db.query("networkMemberships").withIndex("by_person_and_status", (q) => q.eq("personId", outsider.personId)).take(10))
    expect(memberships.map((row) => row.networkId)).toEqual([root])
    // Entré de lui-même dans DIASPORALE : l'équipement rend son statut et n'y pose rien.
    await outsider.as.mutation(api.modules.diaspora.membership.joinDiasporale, { networkId: diasporale, facet: { countryOfResidence: "FR" }, directoryVisibility: "hidden" })
    expect(await equip(outsider.as, "exterieur")).toEqual({ actor: "exterieur", status: "en_attente", role: "member", pageId: null, pageCreated: false })
    expect(await footprintOf(t, diasporale, outsider.personId)).toEqual(UNTOUCHED)
  })
})

describe("comptes de démonstration DIASPORALE — pays ouverts", () => {
  it("ouvre la France, la Belgique et le Canada avec un hub chacun, si personne n'a décidé des pays", async () => {
    openDevTools()
    const { t, diasporale } = await fixture()
    // La graine n'ouvre que la France.
    expect((await networkOf(t, diasporale)).openCountries).toEqual(["FR"])
    expect((await hubsOf(t, diasporale)).map((hub) => hub.country)).toEqual(["FR"])
    const { as } = await joinedActor(t, diasporale, "leger")
    await equip(as, "leger")
    const sorted = [...DIASPORALE_DEMO_COUNTRIES].sort()
    expect(sorted).toEqual(["BE", "CA", "FR"])
    expect([...((await networkOf(t, diasporale)).openCountries ?? [])].sort()).toEqual(sorted)
    const hubs = await hubsOf(t, diasporale)
    expect(hubs.map((hub) => hub.country).sort()).toEqual(sorted)
    // Les hubs créés commencent à zéro jusqu'au premier passage nocturne.
    for (const hub of hubs) expect(hub).toMatchObject({ networkId: diasporale, members: 0, associations: 0, companies: 0, upcomingEvents: 0 })
    for (const hub of hubs) expect(hub.countersComputedAt).toBeUndefined()

    // Rejoué, et par un autre acteur : rien ne double.
    await equip(as, "leger")
    const belgian = await joinedActor(t, diasporale, "belgique")
    await equip(belgian.as, "belgique")
    expect([...((await networkOf(t, diasporale)).openCountries ?? [])].sort()).toEqual(sorted)
    expect(await hubsOf(t, diasporale)).toHaveLength(3)
  })

  it("une décision déjà prise sur les pays du réseau n'est jamais touchée", async () => {
    openDevTools()
    const { t, diasporale } = await fixture()
    // Le propriétaire a décidé : seule la Belgique reste ouverte (trace dans l'historique des réglages).
    await t.run(async (ctx) => {
      const network = present(await ctx.db.get(diasporale), "réseau")
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
      await ctx.db.patch(diasporale, { openCountries: ["BE"] })
      await ctx.db.insert("networkSettingsHistory", { networkId: diasporale, kind: "updated", settings, reason: "Décision de test sur les pays ouverts", at: Date.now() })
    })
    const { as } = await joinedActor(t, diasporale, "leger")
    await equip(as, "leger")
    await equip(as, "leger")
    expect((await networkOf(t, diasporale)).openCountries).toEqual(["BE"])
    // Aucun hub pour un pays que la décision laisse fermé.
    const countries = (await hubsOf(t, diasporale)).map((hub) => hub.country)
    expect(countries).not.toContain("CA")
    expect(countries.filter((country) => country === "BE")).toHaveLength(1)
  })
})

describe("comptes de démonstration DIASPORALE — le catalogue entier", () => {
  it("chaque acteur équipé obtient le statut, le rôle, la page et les accès de sa fiche, dans l'ordre du panneau", async () => {
    openDevTools()
    const { t, diasporale, root } = await fixture()
    const members = new Map<DiasporaleDemoActor, Awaited<ReturnType<typeof welcomedActor>>>()
    const results = new Map<DiasporaleDemoActor, Awaited<ReturnType<typeof equip>>>()
    for (const actor of DIASPORALE_DEMO_ACTORS) {
      const spec = DIASPORALE_DEMO_ACTOR_SPECS[actor]
      if (spec.profile === null) continue
      // L'extérieur ne rejoue que l'accueil d'ANTSIA ; tous les autres entrent dans le réseau.
      const member = spec.outsider ? await welcomedActor(t, actor) : await joinedActor(t, diasporale, actor)
      members.set(actor, member)
      results.set(actor, await equip(member.as, actor))
    }
    expect([...members.keys()]).toHaveLength(19)

    for (const [actor, member] of members) {
      const spec = DIASPORALE_DEMO_ACTOR_SPECS[actor]
      const result = results.get(actor)
      const seen = await member.as.query(api.modules.diaspora.membership.myMembership, { networkId: diasporale })
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
      const stored = await membershipOf(t, diasporale, member.personId)
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
          networkId: diasporale,
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
    expect((await pagesOf(t, diasporale)).map((page) => page.ownerKind).sort()).toEqual(["association", "community", "company", "institution", "media"])
    // Un seul parrainage : le filleul est celui de la fiche, son parrain l'acteur « verifie ».
    const sponsorships = await sponsorshipsOf(t, diasporale)
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
