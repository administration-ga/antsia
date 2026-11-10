// @vitest-environment edge-runtime
/** Comptes de démonstration : développement local seulement, vraie session, actes réservés à l'acteur de l'adresse. */
import { engineErrorCode } from "@antsia/social-contracts/errors"
import { afterEach, describe, expect, it, vi } from "vitest"

import { api, components, internal } from "../../_generated/api"
import { SEED_CONFIRMATION } from "../../seeds/foundations"
import { createTestSession, testConvex } from "../../test.setup"
import { liveSignatoryRole } from "../pages/access"
import { servableStorefrontPage } from "../shops/access"
import { DEMO_ACTORS, DEMO_EMAIL_DOMAIN, type DemoActor, demoEmailOf } from "./demoAccounts"

type T = ReturnType<typeof testConvex>

function idOf(row: unknown): string {
  if (!row || typeof row !== "object" || !("_id" in row) || typeof row._id !== "string") throw new Error("Document de fixture absent")
  return row._id
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

afterEach(() => {
  vi.unstubAllEnvs()
})

async function fixture() {
  const t = testConvex({ automaticSessions: false })
  await t.mutation(internal.seeds.foundations.run, { confirmNonProduction: SEED_CONFIRMATION })
  return t
}

/** Une vraie session Better Auth sur cette adresse vérifiée, et sa personne. */
async function signedIn(t: T, email: string) {
  const now = Date.now()
  const authUserId = idOf(await t.mutation(components.betterAuth.adapter.create, { input: { model: "user", data: { name: "ANTSIA", email, emailVerified: true, createdAt: now, updatedAt: now } } }))
  const sessionId = await createTestSession(t, authUserId)
  const as = t.withIdentity({ subject: authUserId, sessionId })
  const personId = await as.mutation(api.modules.people.persons.ensureMyPerson, {})
  return { as, authUserId, personId }
}

/** L'accueil réel (consentement, profil publié), comme l'automate de l'application le rejoue. */
async function welcomed(t: T, email: string, profile: { handle: string; displayName: string; headline?: string }) {
  const user = await signedIn(t, email)
  await user.as.mutation(api.modules.people.consents.recordConsent, { purpose: "social_profile", origin: "onboarding" })
  await user.as.mutation(api.modules.people.profile.publishMyProfile, profile)
  return user
}

async function demoActor(t: T, actor: DemoActor) {
  const entry = (await t.query(api.modules.platform.demoAccounts.catalogue, {})).find((candidate) => candidate.actor === actor)
  if (!entry?.profile) throw new Error(`Acteur sans profil : ${actor}`)
  return { ...(await welcomed(t, entry.email, entry.profile)), entry }
}

async function pageOf(t: T, handle: string) {
  return await t.run(async (ctx) => await ctx.db.query("pages").withIndex("by_handle", (q) => q.eq("handle", handle)).unique())
}

describe("comptes de démonstration — garde de développement", () => {
  it("fermés sans les outils de développement : catalogue vide et équipement refusé", async () => {
    const t = await fixture()
    expect(await t.query(api.modules.platform.demoAccounts.catalogue, {})).toEqual([])
    const user = await welcomed(t, demoEmailOf("membre"), { handle: "membre.demo", displayName: "Awa MBA" })
    expect(await code(user.as.mutation(api.modules.platform.demoAccounts.equipMyDemoAccount, { actor: "membre" }))).toBe("policyRefused")
  })

  it("une variable posée sur un déploiement en nuage n'ouvre rien", async () => {
    vi.stubEnv("ANTSIA_DEV_TOOLS", "true")
    vi.stubEnv("CONVEX_CLOUD_URL", "https://exemple.convex.cloud")
    const t = await fixture()
    expect(await t.query(api.modules.platform.demoAccounts.catalogue, {})).toEqual([])
  })

  it("la démonstration déclarée ouvre le catalogue et l'équipement d'un acteur", async () => {
    vi.stubEnv("CONVEX_CLOUD_URL", "https://demo-antsia-123.convex.cloud")
    vi.stubEnv("ANTSIA_DEMO_DEPLOYMENT", "demo-antsia-123")
    const t = await fixture()
    expect((await t.query(api.modules.platform.demoAccounts.catalogue, {})).map((entry) => entry.actor)).toEqual([...DEMO_ACTORS])
    const { as } = await demoActor(t, "membre")
    expect(await as.mutation(api.modules.platform.demoAccounts.equipMyDemoAccount, { actor: "membre" })).toEqual({ actor: "membre", status: "declaree", role: "member" })
  })

  it("la déclaration recopiée sur un autre déploiement (la production comprise) n'ouvre rien", async () => {
    vi.stubEnv("CONVEX_CLOUD_URL", "https://production-antsia-456.convex.cloud")
    vi.stubEnv("ANTSIA_DEMO_DEPLOYMENT", "demo-antsia-123")
    const t = await fixture()
    expect(await t.query(api.modules.platform.demoAccounts.catalogue, {})).toEqual([])
    const user = await welcomed(t, demoEmailOf("membre"), { handle: "membre.demo", displayName: "Awa MBA" })
    expect(await code(user.as.mutation(api.modules.platform.demoAccounts.equipMyDemoAccount, { actor: "membre" }))).toBe("policyRefused")
  })

  it("le catalogue nomme chaque acteur en Prénom NOM, sur le domaine réservé", async () => {
    openDevTools()
    const t = await fixture()
    const entries = await t.query(api.modules.platform.demoAccounts.catalogue, {})
    expect(entries.map((entry) => entry.actor)).toEqual([...DEMO_ACTORS])
    for (const entry of entries) expect(entry.email).toBe(`${entry.actor}@${DEMO_EMAIL_DOMAIN}`)
    const names = Object.fromEntries(entries.map((entry) => [entry.actor, entry.profile?.displayName ?? null]))
    expect(names).toMatchObject({ membre: "Awa MBA", verifie: "Jean-Rémy NDONG", administration: "Paul-Henri NZE", nouveau: null })
  })

  it("refuse une session dont l'adresse n'est pas celle de l'acteur demandé", async () => {
    openDevTools()
    const t = await fixture()
    const intruder = await welcomed(t, "intrus@example.test", { handle: "intrus.recette", displayName: "Intrus RECETTE" })
    expect(await code(intruder.as.mutation(api.modules.platform.demoAccounts.equipMyDemoAccount, { actor: "membre" }))).toBe("policyRefused")
  })

  it("exige l'accueil réel : profil publié avant tout équipement", async () => {
    openDevTools()
    const t = await fixture()
    const user = await signedIn(t, demoEmailOf("membre"))
    expect(await code(user.as.mutation(api.modules.platform.demoAccounts.equipMyDemoAccount, { actor: "membre" }))).toBe("profileRequired")
  })

  it("le nouvel arrivant n'a rien à équiper : l'accueil reste à remplir", async () => {
    openDevTools()
    const t = await fixture()
    const user = await welcomed(t, demoEmailOf("nouveau"), { handle: "nouveau.recette", displayName: "Nouveau RECETTE" })
    expect(await code(user.as.mutation(api.modules.platform.demoAccounts.equipMyDemoAccount, { actor: "nouveau" }))).toBe("policyRefused")
  })
})

describe("comptes de démonstration — un acteur par compte", () => {
  it("membre : entrée déclarée par la vraie règle d'admission, badge Communauté", async () => {
    openDevTools()
    const t = await fixture()
    const { as } = await demoActor(t, "membre")
    expect(await as.mutation(api.modules.platform.demoAccounts.equipMyDemoAccount, { actor: "membre" })).toEqual({ actor: "membre", status: "declaree", role: "member" })
    expect((await as.query(api.modules.people.persons.getMyPerson, {}))?.badges).toEqual(["community"])
  })

  it("presse : identité IDN fictive, adhésion vérifiée, page média vérifiée qu'elle administre ; rejouable", async () => {
    openDevTools()
    const t = await fixture()
    const { as, personId } = await demoActor(t, "presse")
    expect(await as.mutation(api.modules.platform.demoAccounts.equipMyDemoAccount, { actor: "presse" })).toEqual({ actor: "presse", status: "verifiee", role: "member" })
    expect((await as.query(api.modules.people.persons.getMyPerson, {}))?.badges).toContain("verified")
    const page = await pageOf(t, "gabon-actu-demo")
    expect(page).toMatchObject({ ownerKind: "media", trust: "verified", status: "active", createdByPersonId: personId })

    // Un second appel ne recrée rien.
    await as.mutation(api.modules.platform.demoAccounts.equipMyDemoAccount, { actor: "presse" })
    const counts = await t.run(async (ctx) => ({
      pages: (await ctx.db.query("pages").withIndex("by_handle", (q) => q.eq("handle", "gabon-actu-demo")).take(5)).length,
      signatories: (await ctx.db.query("pageSignatories").withIndex("by_person", (q) => q.eq("personId", personId)).take(5)).length,
      idnLinks: (await ctx.db.query("identityLinks").withIndex("by_person_and_provider", (q) => q.eq("personId", personId).eq("provider", "idn")).take(5)).length,
    }))
    expect(counts).toEqual({ pages: 1, signatories: 1, idnLinks: 1 })
  })

  it("l'identité fictive survit à la synchronisation d'une nouvelle session", async () => {
    openDevTools()
    const t = await fixture()
    const { as } = await demoActor(t, "verifie")
    await as.mutation(api.modules.platform.demoAccounts.equipMyDemoAccount, { actor: "verifie" })
    // Une nouvelle ouverture de session relit l'identité (ensureMyPerson → synchronisation réelle).
    await as.mutation(api.modules.people.persons.ensureMyPerson, {})
    expect((await as.query(api.modules.people.persons.getMyPerson, {}))?.badges).toContain("verified")
  })

  it("administration : page officielle d'institution, signée par une identité forte", async () => {
    openDevTools()
    const t = await fixture()
    const { as, personId } = await demoActor(t, "administration")
    expect(await as.mutation(api.modules.platform.demoAccounts.equipMyDemoAccount, { actor: "administration" })).toMatchObject({ status: "verifiee" })
    const page = await pageOf(t, "mairie-demo")
    expect(page).toMatchObject({ ownerKind: "institution", trust: "official", trustRank: 2 })
    expect(await t.run(async (ctx) => (page ? await liveSignatoryRole(ctx, page, personId) : null))).toBe("admin")
  })

  it("commerçant : page d'entreprise et vitrine publiée", async () => {
    openDevTools()
    const t = await fixture()
    const { as } = await demoActor(t, "commercant")
    expect(await as.mutation(api.modules.platform.demoAccounts.equipMyDemoAccount, { actor: "commercant" })).toMatchObject({ status: "declaree" })
    const page = await pageOf(t, "epicerie-moussavou-demo")
    expect(page).toMatchObject({ ownerKind: "company", trust: "community" })
    const shop = await t.run(async (ctx) => (page ? await ctx.db.query("shops").withIndex("by_page", (q) => q.eq("pageId", page._id)).unique() : null))
    expect(shop).toMatchObject({ model: "products", storefront: "published" })
    // La racine n'avait aucune politique (fermée) : la démonstration l'ouvre à l'examen, et la vitrine se sert.
    expect(await t.run(async (ctx) => (shop ? (await servableStorefrontPage(ctx, shop))?.handle ?? null : null))).toBe("epicerie-moussavou-demo")
  })

  it("une politique des vitrines déjà décidée n'est jamais touchée", async () => {
    openDevTools()
    const t = await fixture()
    await t.run(async (ctx) => {
      const root = await ctx.db.query("networks").withIndex("by_slug", (q) => q.eq("slug", "antsia")).unique()
      if (root) await ctx.db.insert("shopNetworkPolicies", { networkId: root._id, storefront: "closed", updatedAt: Date.now() })
    })
    const { as } = await demoActor(t, "commercant")
    await as.mutation(api.modules.platform.demoAccounts.equipMyDemoAccount, { actor: "commercant" })
    expect(await t.run(async (ctx) => (await ctx.db.query("shopNetworkPolicies").take(5)).map((row) => row.storefront))).toEqual(["closed"])
  })

  it("association : page d'association qu'elle administre", async () => {
    openDevTools()
    const t = await fixture()
    const { as } = await demoActor(t, "association")
    await as.mutation(api.modules.platform.demoAccounts.equipMyDemoAccount, { actor: "association" })
    expect(await pageOf(t, "jeunes-lambarene-demo")).toMatchObject({ ownerKind: "association", trust: "community" })
  })

  it("modération : modératrice de la racine, adhésion vérifiée", async () => {
    openDevTools()
    const t = await fixture()
    const { as } = await demoActor(t, "moderateur")
    expect(await as.mutation(api.modules.platform.demoAccounts.equipMyDemoAccount, { actor: "moderateur" })).toEqual({ actor: "moderateur", status: "verifiee", role: "network_moderator" })
  })
})

describe("figurants de démonstration — ambiance, hors de l'écran de connexion", () => {
  it("fermés sans les outils de développement : catalogue vide et entrée refusée", async () => {
    const t = await fixture()
    expect(await t.query(api.modules.platform.demoAccounts.figurantCatalogue, {})).toEqual([])
    const user = await welcomed(t, "figurant-1@demo.antsia.test", { handle: "kevin.mounguengui.demo", displayName: "Kévin MOUNGUENGUI" })
    expect(await code(user.as.mutation(api.modules.platform.demoAccounts.equipMyDemoFigurant, { slot: 1 }))).toBe("policyRefused")
  })

  it("dix figurants sur l'adresse réservée, NOM en capitales, absents du catalogue de connexion", async () => {
    openDevTools()
    const t = await fixture()
    const figurants = await t.query(api.modules.platform.demoAccounts.figurantCatalogue, {})
    expect(figurants.map((figurant) => figurant.slot)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    for (const figurant of figurants) {
      expect(figurant.email).toBe(`figurant-${figurant.slot}@${DEMO_EMAIL_DOMAIN}`)
      expect(figurant.profile.handle).toMatch(/^[a-z]+\.[a-z]+\.demo$/)
      expect(figurant.profile.headline).toContain("Démo")
      // Prénom capitalisé, NOM en capitales (normaliseur partagé de l'état civil).
      expect(figurant.profile.displayName).toMatch(/^\p{Lu}\p{Ll}+ \p{Lu}+$/u)
    }
    expect(figurants.find((figurant) => figurant.slot === 4)?.profile.displayName).toBe("Inès OBAME")
    const actors = await t.query(api.modules.platform.demoAccounts.catalogue, {})
    expect(actors.some((entry) => entry.email.startsWith("figurant-"))).toBe(false)
  })

  it("entre dans la racine par la vraie règle, sans identité ni rôle ; refuse une autre adresse ou un profil absent", async () => {
    openDevTools()
    const t = await fixture()
    const entry = (await t.query(api.modules.platform.demoAccounts.figurantCatalogue, {})).find((figurant) => figurant.slot === 3)
    if (!entry) throw new Error("Figurant absent")
    const intruder = await welcomed(t, "figurant-2@demo.antsia.test", { handle: "intrus.demo", displayName: "Intrus FICTIF" })
    expect(await code(intruder.as.mutation(api.modules.platform.demoAccounts.equipMyDemoFigurant, { slot: 3 }))).toBe("policyRefused")
    const unpublished = await signedIn(t, "figurant-5@demo.antsia.test")
    expect(await code(unpublished.as.mutation(api.modules.platform.demoAccounts.equipMyDemoFigurant, { slot: 5 }))).toBe("profileRequired")
    expect(await code(unpublished.as.mutation(api.modules.platform.demoAccounts.equipMyDemoFigurant, { slot: 11 }))).toBe("policyRefused")
    const user = await welcomed(t, entry.email, entry.profile)
    expect(await user.as.mutation(api.modules.platform.demoAccounts.equipMyDemoFigurant, { slot: 3 })).toEqual({ slot: 3, status: "declaree" })
    expect(await user.as.mutation(api.modules.platform.demoAccounts.equipMyDemoFigurant, { slot: 3 })).toEqual({ slot: 3, status: "declaree" })
    const membership = await t.run(async (ctx) => {
      const root = await ctx.db.query("networks").withIndex("by_slug", (q) => q.eq("slug", "antsia")).unique()
      return root ? await ctx.db.query("networkMemberships").withIndex("by_network_and_person", (q) => q.eq("networkId", root._id).eq("personId", user.personId)).unique() : null
    })
    expect(membership).toMatchObject({ status: "declaree", role: "member" })
  })
})

