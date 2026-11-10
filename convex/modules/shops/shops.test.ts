// @vitest-environment edge-runtime
import { engineErrorAppRule, engineErrorCode } from "@antsia/social-contracts/errors"
import type { ActivityConfiguration } from "@antsia/social-domain/activityConfiguration"
import { makeFunctionReference } from "convex/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { api, internal } from "../../_generated/api"
import type { Doc, Id } from "../../_generated/dataModel"
import { SEED_CONFIRMATION } from "../../seeds/foundations"
import { testConvex } from "../../test.setup"
import { applyStorefrontPolicy, setStorefrontSuspended } from "./decisions"
import { storefrontPolicyOf } from "./access"
import { SHOP_DRAFTS_PER_PERSON_MAX, SHOP_MANAGEMENT_PAGES_MAX, SHOP_PUBLIC_LISTING_TEXT_VERSION } from "./rules"
import type { PublicStorefront } from "./validators"

type T = ReturnType<typeof testConvex>
type Person = { as: ReturnType<T["withIdentity"]>; personId: Id<"persons"> }
const S = api.modules.shops.shops
// La nouvelle porte n'exige pas de modifier les fichiers générés pour écrire ses tests.
const getPublicStorefront = makeFunctionReference<"query", { networkId: Id<"networks">; handle: string }, PublicStorefront | null>("modules/public/shops:getStorefront")
const PAGE = { cursor: null, numItems: 20 }

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(Date.UTC(2026, 9, 18, 12))
  vi.stubEnv("CONVEX_CLOUD_URL", "http://127.0.0.1:3210")
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs() })

async function member(t: T, root: Id<"networks">, handle: string, child?: Id<"networks">): Promise<Person> {
  vi.setSystemTime(Date.now() + 1000)
  const as = t.withIdentity({ subject: `shop-test-${handle}` })
  const personId = await as.mutation(api.modules.people.persons.ensureMyPerson, {})
  await as.mutation(api.modules.people.consents.recordConsent, { purpose: "social_profile", origin: "onboarding" })
  await as.mutation(api.modules.people.profile.publishMyProfile, { handle, displayName: handle })
  await as.mutation(api.modules.people.memberships.joinNetwork, { networkId: root })
  if (child) {
    await as.mutation(api.modules.people.memberships.joinNetwork, { networkId: child, facet: { values: { countryOfResidence: "FR" }, visibilities: {} } })
    await status(t, child, personId, "declaree")
  }
  return { as, personId }
}

async function status(t: T, networkId: Id<"networks">, personId: Id<"persons">, value: "declaree" | "verifiee" | "suspendue") {
  await t.run(async (ctx) => {
    const row = await ctx.db.query("networkMemberships").withIndex("by_network_and_person", (q) => q.eq("networkId", networkId).eq("personId", personId)).unique()
    if (!row) throw new Error("Adhésion de fixture absente")
    await ctx.db.patch(row._id, { status: value })
  })
}

async function fixture() {
  const t = testConvex()
  const { root, testClosed: child } = await t.mutation(internal.seeds.foundations.run, { confirmNonProduction: SEED_CONFIRMATION })
  const owner = await member(t, root, "boutique-a", child)
  const reader = await member(t, root, "boutique-b")
  return { t, root, child, owner, reader }
}

/** Préconditions de lecture placées dans le harnais seulement, sans activer un environnement. */
async function openPolicy(t: T, networkId: Id<"networks">) {
  await t.run(async (ctx) => {
    const row = await ctx.db.query("shopNetworkPolicies").withIndex("by_network", (q) => q.eq("networkId", networkId)).unique()
    if (row) await ctx.db.patch(row._id, { storefront: "review", updatedAt: Date.now() })
    else await ctx.db.insert("shopNetworkPolicies", { networkId, storefront: "review", updatedAt: Date.now() })
  })
}

async function page(t: T, networkId: Id<"networks">, owner: Person, handle: string, extra: Partial<Doc<"pages">> = {}) {
  return await t.run(async (ctx) => {
    const now = Date.now()
    const pageId = await ctx.db.insert("pages", {
      networkId, handle, name: `Activité ${handle}`, description: "Une présentation commerciale suffisamment complète.",
      ownerKind: "company", trust: "community", trustRank: 1, visibility: "network", onRoot: (await ctx.db.get(networkId))?.kind === "root",
      status: "active", createdByPersonId: owner.personId, searchText: handle, createdAt: now, updatedAt: now, ...extra,
    })
    const signatureId = await ctx.db.insert("pageSignatories", { networkId, pageId, personId: owner.personId, role: "admin", acceptedAt: now, createdAt: now, updatedAt: now })
    return { pageId, signatureId, handle }
  })
}

async function publishedShop(t: T, networkId: Id<"networks">, owner: Person, handle: string, extra: Partial<Doc<"shops">> = {}) {
  await openPolicy(t, networkId)
  const identity = await page(t, networkId, owner, handle)
  const shopId = await t.run(async (ctx) => ctx.db.insert("shops", {
    networkId, pageId: identity.pageId, preparedByPersonId: owner.personId, model: "products", storefront: "published", visibility: "network",
    publicConsentAt: Date.now(), publicConsentTextVersion: SHOP_PUBLIC_LISTING_TEXT_VERSION, publicConsentByPersonId: owner.personId,
    publishedAt: Date.now(), createdAt: Date.now(), updatedAt: Date.now(), ...extra,
  }))
  return { ...identity, shopId }
}

async function caught(work: Promise<unknown>): Promise<unknown> {
  try { await work; return null } catch (error) { return error }
}

/**
 * Refus MÉTIER des boutiques (`SHOP_RULES`, levés par `failAppRule`) : ils voyagent dans
 * `appRule` — `rule` reste réservé aux règles du domaine du moteur (`DOMAIN_RULES`,
 * contrat `@antsia/social-contracts/errors`) ; l'écran les lit de même (`shopErrorText`).
 */
function shopRefusal(error: unknown) {
  return { code: engineErrorCode(error), appRule: engineErrorAppRule(error)?.appRule ?? null }
}

const MIXED_ACTIVITY: ActivityConfiguration = { version: 1, capabilities: ["products", "services"], template: "fashion", blocks: ["publications", "services", "about", "catalog"] }

describe("MP02 — configuration progressive de l'activité", () => {
  it("conserve les anciens clients et projette une configuration héritée sans backfill", async () => {
    const f = await fixture()
    const { shopId } = await f.owner.as.mutation(S.startShop, { networkId: f.root, model: "quote_services", name: "Studio historique" })
    expect(await f.owner.as.query(S.getMyShop, { networkId: f.root, shopId })).toMatchObject({ activityConfiguration: { version: 1, capabilities: ["services"], template: "local", blocks: ["services", "publications", "about"] } })
    expect(await f.t.run(async (ctx) => ctx.db.get(shopId))).not.toHaveProperty("activityConfiguration")
    const explicit: ActivityConfiguration = { version: 1, capabilities: ["services"], template: "local", blocks: ["services", "publications", "about"] }
    expect(await f.owner.as.mutation(S.updateShop, { networkId: f.root, shopId, activityConfiguration: explicit })).toEqual({ changed: true })
    expect(await f.t.run(async (ctx) => ctx.db.get(shopId))).toMatchObject({ activityConfiguration: explicit })
  })

  it("prépare une activité mixte sans page, publication ni encaissement implicites", async () => {
    const f = await fixture()
    const { shopId } = await f.owner.as.mutation(S.startShop, { networkId: f.root, model: "products", name: "Atelier mixte", activityConfiguration: MIXED_ACTIVITY })
    const editor = await f.owner.as.query(S.getMyShop, { networkId: f.root, shopId })
    expect(editor).toMatchObject({ activityConfiguration: MIXED_ACTIVITY, page: null, policy: "closed", checkout: { available: false } })
    expect(editor?.blocks).toEqual([{ id: "publications", state: "awaiting_page" }, { id: "services", state: "awaiting_pro_link" }, { id: "about", state: "active" }, { id: "catalog", state: "awaiting_pro_link" }])
    expect(await f.t.run(async (ctx) => ctx.db.get(shopId))).toMatchObject({ activityConfiguration: MIXED_ACTIVITY, storefront: "draft" })
    await f.owner.as.mutation(S.updateShop, { networkId: f.root, shopId, description: "Produits et prestations préparés dans notre atelier local." })
    const refusal = await caught(f.owner.as.mutation(S.requestStorefrontPublication, { networkId: f.root, shopId }))
    expect(shopRefusal(refusal).appRule).toBe("shop_publication_closed")
  })

  it("enregistre la configuration sur une page administrée sans changer sa nature ni ses droits", async () => {
    const f = await fixture()
    const identity = await page(f.t, f.root, f.owner, "activite-mixte")
    const { shopId } = await f.owner.as.mutation(S.startShop, { networkId: f.root, model: "products", pageId: identity.pageId, activityConfiguration: MIXED_ACTIVITY })
    expect(await f.t.run(async (ctx) => ctx.db.get(shopId))).toMatchObject({ activityConfiguration: MIXED_ACTIVITY, pageId: identity.pageId, storefront: "draft" })
    expect(await f.t.run(async (ctx) => ctx.db.get(identity.pageId))).toMatchObject({ ownerKind: "company", trust: "community" })
    expect(await caught(f.reader.as.mutation(S.updateShop, { networkId: f.root, shopId, activityConfiguration: { ...MIXED_ACTIVITY, template: "media" } }))).not.toBeNull()
    expect(await f.t.run(async (ctx) => ctx.db.get(shopId))).toMatchObject({ activityConfiguration: MIXED_ACTIVITY })
    const institution = await page(f.t, f.root, f.owner, "institution-protegee", { ownerKind: "institution", trust: "official", trustRank: 3 })
    const previousRefusal = await caught(f.owner.as.mutation(S.startShop, { networkId: f.root, model: "products", pageId: institution.pageId }))
    const configuredRefusal = await caught(f.owner.as.mutation(S.startShop, { networkId: f.root, model: "products", pageId: institution.pageId, activityConfiguration: MIXED_ACTIVITY }))
    expect(configuredRefusal).not.toBeNull()
    expect(shopRefusal(configuredRefusal)).toEqual(shopRefusal(previousRefusal))
  })

  it("ne perd pas la configuration lors d'une sauvegarde ancienne et ne réécrit pas un état identique", async () => {
    const f = await fixture()
    const { shopId } = await f.owner.as.mutation(S.startShop, { networkId: f.root, model: "products", name: "Atelier durable", activityConfiguration: MIXED_ACTIVITY })
    const before = await f.t.run(async (ctx) => ctx.db.get(shopId))
    vi.setSystemTime(Date.now() + 1000)
    expect(await f.owner.as.mutation(S.updateShop, { networkId: f.root, shopId, activityConfiguration: { ...MIXED_ACTIVITY, capabilities: ["services", "products"] } })).toEqual({ changed: false })
    const reorderedKeys: ActivityConfiguration = { blocks: [...MIXED_ACTIVITY.blocks], template: MIXED_ACTIVITY.template, capabilities: [...MIXED_ACTIVITY.capabilities], version: 1 }
    expect(await f.owner.as.mutation(S.updateShop, { networkId: f.root, shopId, activityConfiguration: reorderedKeys })).toEqual({ changed: false })
    expect((await f.t.run(async (ctx) => ctx.db.get(shopId)))?.updatedAt).toBe(before?.updatedAt)
    await f.owner.as.mutation(S.updateShop, { networkId: f.root, shopId, description: "Une présentation modifiée par un ancien client." })
    expect(await f.t.run(async (ctx) => ctx.db.get(shopId))).toMatchObject({ activityConfiguration: MIXED_ACTIVITY })
    const changed = { ...MIXED_ACTIVITY, blocks: ["about", "services", "catalog", "publications"] } satisfies ActivityConfiguration
    expect(await f.owner.as.mutation(S.updateShop, { networkId: f.root, shopId, activityConfiguration: changed })).toEqual({ changed: true })
    expect(await f.owner.as.query(S.getMyShop, { networkId: f.root, shopId })).toMatchObject({ activityConfiguration: changed })
  })

  it("refuse une mise à jour incohérente avant toute modification d'identité ou de configuration", async () => {
    const f = await fixture()
    const { shopId } = await f.owner.as.mutation(S.startShop, { networkId: f.root, model: "products", name: "Atelier conservé", activityConfiguration: MIXED_ACTIVITY })
    const error = await caught(f.owner.as.mutation(S.updateShop, { networkId: f.root, shopId, name: "Nom qui ne doit pas être enregistré", activityConfiguration: { ...MIXED_ACTIVITY, capabilities: ["products"] } }))
    expect(engineErrorCode(error)).toBe("invalidArgument")
    expect(await f.t.run(async (ctx) => ctx.db.get(shopId))).toMatchObject({ draftName: "Atelier conservé", activityConfiguration: MIXED_ACTIVITY })
  })

  it.each([
    { ...MIXED_ACTIVITY, capabilities: [] },
    { ...MIXED_ACTIVITY, capabilities: ["products", "products"] },
    { ...MIXED_ACTIVITY, blocks: ["about", "about"] },
    { ...MIXED_ACTIVITY, capabilities: ["products"] },
    { ...MIXED_ACTIVITY, version: 2 },
    { ...MIXED_ACTIVITY, template: "unrestricted" },
    { ...MIXED_ACTIVITY, permissions: ["payments"] },
  ])("refuse la configuration incohérente ou étrangère sans écriture", async (raw) => {
    const f = await fixture()
    const activityConfiguration = raw as unknown as ActivityConfiguration
    expect(await caught(f.owner.as.mutation(S.startShop, { networkId: f.root, model: "products", name: "Atelier refusé", activityConfiguration }))).not.toBeNull()
    expect((await f.owner.as.query(S.myShops, { networkId: f.root })).items).toEqual([])
  })

  it("projette la configuration publique mais masque les blocs sans offre et les publications community", async () => {
    const f = await fixture()
    const shop = await publishedShop(f.t, f.root, f.owner, "composition-publique", { activityConfiguration: MIXED_ACTIVITY })
    const memberView = await f.reader.as.query(S.storefront, { networkId: f.root, handle: shop.handle })
    const publicView = await f.t.query(getPublicStorefront, { networkId: f.root, handle: shop.handle })
    expect(memberView).toMatchObject({ activityConfiguration: MIXED_ACTIVITY, blocks: ["publications", "about"] })
    expect(publicView).toMatchObject({ activityConfiguration: MIXED_ACTIVITY, blocks: ["about"] })
    expect(publicView).not.toHaveProperty("viewer")
    expect(publicView).not.toHaveProperty("pageId")
    expect(await f.t.query(api.modules.public.projections.getOfficialPage, { networkId: f.root, handle: shop.handle })).toBeNull()
  })
})

describe("P16 — admission automatique sans décision validée", () => {
  it("refuse la bascule serveur, même si un client l'envoie directement", async () => {
    const f = await fixture()
    const error = await caught(f.t.run(async (ctx) => await applyStorefrontPolicy(ctx, f.root, "auto_verified", f.owner.personId)))
    expect(shopRefusal(error)).toEqual({ code: "policyRefused", appRule: "shop_publication_closed" })
    expect(await f.t.run(async (ctx) => await storefrontPolicyOf(ctx, f.root))).toBe("closed")
  })

  it("une ancienne bascule automatique envoie même un membre vérifié en revue", async () => {
    const f = await fixture()
    await status(f.t, f.root, f.owner.personId, "verifiee")
    await f.t.run(async (ctx) => await ctx.db.insert("shopNetworkPolicies", { networkId: f.root, storefront: "auto_verified", updatedAt: Date.now() }))
    const { shopId } = await f.owner.as.mutation(S.startShop, { networkId: f.root, model: "products", name: "Atelier en revue" })
    await f.owner.as.mutation(S.updateShop, { networkId: f.root, shopId, description: "Produits fabriqués dans un atelier local." })
    await f.owner.as.mutation(S.requestStorefrontPublication, { networkId: f.root, shopId })
    const queuedShop = await f.t.run(async (ctx) => await ctx.db.get(shopId))
    expect(queuedShop).toMatchObject({ storefront: "pending_review" })
    expect(queuedShop).not.toHaveProperty("pageId")
  })

  it("conserve les vitrines déjà admises et permet le remplacement explicite par la revue", async () => {
    const f = await fixture()
    const shop = await publishedShop(f.t, f.root, f.owner, "vitrine-historique")
    await f.t.run(async (ctx) => {
      const policy = await ctx.db.query("shopNetworkPolicies").withIndex("by_network", (q) => q.eq("networkId", f.root)).unique()
      if (!policy) throw new Error("Politique de fixture absente")
      await ctx.db.patch(policy._id, { storefront: "auto_verified", automaticDecisionVersion: "ancienne-decision" })
    })
    expect(await f.owner.as.query(S.storefront, { networkId: f.root, handle: "vitrine-historique" })).not.toBeNull()
    expect(await f.t.run(async (ctx) => await applyStorefrontPolicy(ctx, f.root, "review", f.owner.personId))).toEqual({ changed: true, previous: "auto_verified" })
    expect(await f.t.run(async (ctx) => await storefrontPolicyOf(ctx, f.root))).toBe("review")
    expect(await f.t.run(async (ctx) => (await ctx.db.get(shop.shopId))?.storefront)).toBe("published")
    const reviewedPolicy = await f.t.run(async (ctx) => await ctx.db.query("shopNetworkPolicies").withIndex("by_network", (q) => q.eq("networkId", f.root)).unique())
    expect(reviewedPolicy).toMatchObject({ storefront: "review" })
    expect(reviewedPolicy).not.toHaveProperty("automaticDecisionVersion")
  })
})

describe("P07 — préparation et autorité", () => {
  it("rétablir une vitrine suspendue ne contourne pas la politique de publication fermée", async () => {
    const f = await fixture()
    const shop = await publishedShop(f.t, f.root, f.owner, "retablissement-test", { storefront: "suspended" })
    await f.t.run(async (ctx) => {
      const policy = await ctx.db.query("shopNetworkPolicies").withIndex("by_network", (q) => q.eq("networkId", f.root)).unique()
      if (policy) await ctx.db.patch(policy._id, { storefront: "closed" })
    })
    const refusal = await caught(f.t.run(async (ctx) => {
      const row = await ctx.db.get(shop.shopId)
      if (!row) throw new Error("Boutique de fixture absente")
      return await setStorefrontSuspended(ctx, row, false, "Rétablissement de recette", Date.now())
    }))
    expect(shopRefusal(refusal)).toEqual({ code: "policyRefused", appRule: "shop_publication_closed" })
    expect(await f.t.run(async (ctx) => (await ctx.db.get(shop.shopId))?.storefront)).toBe("suspended")
  })

  it("un membre déclaré prépare son brouillon ; publication fermée, aucune page ni offre créée", async () => {
    const f = await fixture()
    const { shopId } = await f.owner.as.mutation(S.startShop, { networkId: f.root, model: "products", name: "Atelier Ndjobi" })
    await f.owner.as.mutation(S.updateShop, { networkId: f.root, shopId, description: "Produits fabriqués dans notre atelier local." })
    expect(await f.owner.as.query(S.getMyShop, { networkId: f.root, shopId })).toMatchObject({ role: "owner", page: null, policy: "closed", publication: { outcome: "closed" }, checkout: { available: false } })
    expect(await f.owner.as.query(S.myShops, { networkId: f.root })).toMatchObject({ items: [{ shopId, storefront: "draft" }], truncated: false })
    const refusal = await caught(f.owner.as.mutation(S.requestStorefrontPublication, { networkId: f.root, shopId }))
    expect(shopRefusal(refusal)).toEqual({ code: "policyRefused", appRule: "shop_publication_closed" })
    expect(await f.t.run(async (ctx) => (await ctx.db.query("pages").take(1)).length)).toBe(0)
    expect((await f.owner.as.query(S.directory, { networkId: f.root, paginationOpts: PAGE })).page).toEqual([])
  })

  it("un tiers n'obtient ni éditeur ni droit de modifier un brouillon", async () => {
    const f = await fixture()
    const { shopId } = await f.owner.as.mutation(S.startShop, { networkId: f.root, model: "quote_services", name: "Services Ndjobi" })
    expect(await f.reader.as.query(S.getMyShop, { networkId: f.root, shopId })).toBeNull()
    expect(engineErrorCode(await caught(f.reader.as.mutation(S.updateShop, { networkId: f.root, shopId, name: "Autre nom" })))).toBe("notFound")
    expect(await f.reader.as.query(S.myShops, { networkId: f.root })).toEqual({ items: [], truncated: false })
  })

  it("une institution ou une page officielle ne devient pas boutique, même avec un rôle stocké", async () => {
    const f = await fixture()
    const institution = await page(f.t, f.root, f.owner, "institution-test", { ownerKind: "institution", trust: "official", trustRank: 3 })
    expect(await caught(f.owner.as.mutation(S.startShop, { networkId: f.root, pageId: institution.pageId, model: "products" }))).not.toBeNull()
    expect((await f.owner.as.query(S.eligibleShopPages, { networkId: f.root })).items).toEqual([])
    expect(await f.t.run(async (ctx) => (await ctx.db.get(institution.pageId))?.trust)).toBe("official")
  })

  it("un administrateur révoqué perd sa gestion et ne maintient plus une vitrine sans autre gérant", async () => {
    const f = await fixture()
    const shop = await publishedShop(f.t, f.root, f.owner, "role-revoque")
    expect(await f.t.query(getPublicStorefront, { networkId: f.root, handle: shop.handle })).not.toBeNull()
    await f.t.run(async (ctx) => ctx.db.patch(shop.signatureId, { role: "signatory" }))
    expect(await f.owner.as.query(S.getMyShop, { networkId: f.root, shopId: shop.shopId })).toBeNull()
    expect(engineErrorCode(await caught(f.owner.as.mutation(S.updateShop, { networkId: f.root, shopId: shop.shopId, hours: "Lundi" })))).toBe("notFound")
    expect(await f.t.query(getPublicStorefront, { networkId: f.root, handle: shop.handle })).toBeNull()
  })

  it("la suspension racine ferme aussi la gestion enfant et sa vitrine publique", async () => {
    const f = await fixture()
    const shop = await publishedShop(f.t, f.child, f.owner, "suspension-test", { visibility: "root" })
    await status(f.t, f.root, f.owner.personId, "suspendue")
    expect(await caught(f.owner.as.query(S.getMyShop, { networkId: f.child, shopId: shop.shopId }))).not.toBeNull()
    expect(await f.t.query(getPublicStorefront, { networkId: f.root, handle: shop.handle })).toBeNull()
  })
})

describe("P07 — fenêtre de gestion explicitement bornée", () => {
  it("signale la limite de pages gérées dans les deux listes, sans réutiliser le plafond par page", async () => {
    const f = await fixture()
    await f.t.run(async (ctx) => {
      for (let index = 0; index < SHOP_MANAGEMENT_PAGES_MAX + 1; index += 1) {
        const pageId = await ctx.db.insert("pages", {
          networkId: f.root, handle: `gestion-${index}`, name: `Activité ${index}`, ownerKind: "company", trust: "community", trustRank: 1,
          visibility: "network", onRoot: true, status: "active", createdByPersonId: f.owner.personId, searchText: `gestion-${index}`, createdAt: 1, updatedAt: 1,
        })
        await ctx.db.insert("pageSignatories", { networkId: f.root, pageId, personId: f.owner.personId, role: "admin", acceptedAt: 1, createdAt: 1, updatedAt: 1 })
        if (index % 2 === 0) await ctx.db.insert("shops", { networkId: f.root, pageId, preparedByPersonId: f.owner.personId, model: "products", storefront: "draft", visibility: "network", createdAt: 1, updatedAt: 1 })
      }
    })
    const shops = await f.owner.as.query(S.myShops, { networkId: f.root })
    const eligible = await f.owner.as.query(S.eligibleShopPages, { networkId: f.root })
    expect(shops.truncated).toBe(true)
    expect(eligible.truncated).toBe(true)
    expect(shops.items.length).toBeGreaterThan(20)
    expect(shops.items.length).toBeLessThanOrEqual(SHOP_MANAGEMENT_PAGES_MAX + SHOP_DRAFTS_PER_PERSON_MAX)
    expect(eligible.items.length).toBeGreaterThan(20)
    expect(eligible.items.length).toBeLessThanOrEqual(SHOP_MANAGEMENT_PAGES_MAX)
  })
})

describe("P07 — projection publique commerciale", () => {
  it("horodate aussi le retrait explicite d'un consentement historique périmé", async () => {
    const f = await fixture()
    const shop = await publishedShop(f.t, f.root, f.owner, "retrait-historique", { publicConsentTextVersion: "obsolete" })
    expect(await f.t.query(getPublicStorefront, { networkId: f.root, handle: shop.handle })).toBeNull()
    await f.owner.as.mutation(S.setStorefrontAudience, { networkId: f.root, shopId: shop.shopId, publicListing: false })
    expect(await f.t.run(async (ctx) => (await ctx.db.get(shop.shopId))?.publicConsentRevokedAt)).toBe(Date.now())
  })

  it.each(["policy", "page", "storefront"] as const)("rejette une vitrine dès que %s la ferme", async (gate) => {
    const f = await fixture()
    const shop = await publishedShop(f.t, f.root, f.owner, `fermeture-${gate}`)
    await f.t.run(async (ctx) => {
      if (gate === "page") await ctx.db.patch(shop.pageId, { status: "inactive" })
      if (gate === "storefront") await ctx.db.patch(shop.shopId, { storefront: "suspended" })
      if (gate === "policy") {
        const row = await ctx.db.query("shopNetworkPolicies").withIndex("by_network", (q) => q.eq("networkId", f.root)).unique()
        if (row) await ctx.db.patch(row._id, { storefront: "closed" })
      }
    })
    expect(await f.t.query(getPublicStorefront, { networkId: f.root, handle: shop.handle })).toBeNull()
    expect(await f.reader.as.query(S.storefront, { networkId: f.root, handle: shop.handle })).toBeNull()
  })

  it("un reflet avec de faux signataires locaux n'est pas une boutique native", async () => {
    const f = await fixture()
    const shop = await publishedShop(f.t, f.root, f.owner, "reflet-test")
    await f.t.run(async (ctx) => {
      const emitterId = await ctx.db.insert("federationEmitters", { networkId: f.root, slug: "source-test", environment: "sandbox", enabled: true, keyEnvName: "TEST_ONLY_KEY", allowedContracts: [], revision: 1, createdAt: 1, updatedAt: 1 })
      await ctx.db.insert("mirrors", { networkId: f.root, emitterId, environment: "sandbox", contract: "test-only", objectRef: "test/page", localTable: "pages", localId: shop.pageId, updatedAt: 1 })
    })
    expect(await f.t.query(getPublicStorefront, { networkId: f.root, handle: shop.handle })).toBeNull()
    expect(await f.owner.as.query(S.getMyShop, { networkId: f.root, shopId: shop.shopId })).toBeNull()
  })

  it("projette seulement la présentation autorisée, sans identifiant interne, signataire ni état lecteur", async () => {
    const f = await fixture()
    const shop = await publishedShop(f.t, f.root, f.owner, "projection-test")
    const dto = await f.t.query(getPublicStorefront, { networkId: f.root, handle: shop.handle })
    expect(dto).toMatchObject({ handle: shop.handle, badge: "community", blocks: ["about"], logoUrl: null, bannerUrl: null })
    expect(Object.keys(dto!).sort()).toEqual(["activityConfiguration", "badge", "bannerUrl", "blocks", "description", "handle", "hours", "logoUrl", "model", "name", "origin", "publishedAt", "serviceArea", "specialty"].sort())
    const json = JSON.stringify(dto)
    expect(json).not.toContain(f.owner.personId)
    expect(json).not.toContain(shop.pageId)
    expect(json).not.toContain(shop.shopId)
    expect(await f.t.query(api.modules.public.projections.getOfficialPage, { networkId: f.root, handle: shop.handle })).toBeNull()
  })

  it("refuse diffusion absente, version périmée, révocation et retrait de vitrine", async () => {
    const f = await fixture()
    const shop = await publishedShop(f.t, f.root, f.owner, "consentement-test", { publicConsentAt: undefined })
    const args = { networkId: f.root, handle: shop.handle }
    expect(await f.t.query(getPublicStorefront, args)).toBeNull()
    const outdated = await caught(f.owner.as.mutation(S.setStorefrontAudience, { networkId: f.root, shopId: shop.shopId, publicListing: true, textVersion: "obsolete" }))
    expect(shopRefusal(outdated)).toEqual({ code: "consentRequired", appRule: "shop_consent_outdated" })
    await f.owner.as.mutation(S.setStorefrontAudience, { networkId: f.root, shopId: shop.shopId, publicListing: true, textVersion: SHOP_PUBLIC_LISTING_TEXT_VERSION })
    expect(await f.t.query(getPublicStorefront, args)).not.toBeNull()
    await f.t.run(async (ctx) => ctx.db.patch(shop.shopId, { publicConsentTextVersion: "obsolete" }))
    expect(await f.t.query(getPublicStorefront, args)).toBeNull()
    await f.owner.as.mutation(S.setStorefrontAudience, { networkId: f.root, shopId: shop.shopId, publicListing: true, textVersion: SHOP_PUBLIC_LISTING_TEXT_VERSION })
    await f.owner.as.mutation(S.setStorefrontAudience, { networkId: f.root, shopId: shop.shopId, publicListing: false })
    expect(await f.t.query(getPublicStorefront, args)).toBeNull()
    await f.owner.as.mutation(S.withdrawStorefront, { networkId: f.root, shopId: shop.shopId })
    expect(await f.t.query(getPublicStorefront, args)).toBeNull()
  })

  it("exige le geste root de l'origine enfant, puis rejette une origine fermée ou détachée", async () => {
    const f = await fixture()
    const shop = await publishedShop(f.t, f.child, f.owner, "origine-test")
    const args = { networkId: f.root, handle: shop.handle }
    expect(await f.t.query(getPublicStorefront, args)).toBeNull()
    await f.owner.as.mutation(S.setStorefrontAudience, { networkId: f.child, shopId: shop.shopId, publicListing: true, visibility: "root" })
    expect(await f.t.query(getPublicStorefront, args)).not.toBeNull()
    await f.t.run(async (ctx) => ctx.db.patch(f.child, { parentId: undefined }))
    expect(await f.t.query(getPublicStorefront, args)).toBeNull()
    await f.t.run(async (ctx) => ctx.db.patch(f.child, { parentId: f.root, status: "archived" }))
    expect(await f.t.query(getPublicStorefront, args)).toBeNull()
  })

  it("refuse prélecture même au propriétaire, retrait de modération et masque du lecteur courant", async () => {
    const f = await fixture()
    const shop = await publishedShop(f.t, f.root, f.owner, "moderation-test")
    const args = { networkId: f.root, handle: shop.handle }
    const stateId = await f.t.run(async (ctx) => ctx.db.insert("moderationContentStates", { networkId: f.root, targetKind: "page", targetId: shop.pageId, ownerPersonId: f.owner.personId, status: "pending_review", createdAt: 1, updatedAt: 1 }))
    expect(await f.t.query(getPublicStorefront, args)).toBeNull()
    expect(await f.owner.as.query(getPublicStorefront, args)).toBeNull()
    await f.t.run(async (ctx) => ctx.db.patch(stateId, { status: "removed" }))
    expect(await f.t.query(getPublicStorefront, args)).toBeNull()
    await f.t.run(async (ctx) => {
      await ctx.db.patch(stateId, { status: "published" })
      await ctx.db.insert("reports", { networkId: f.root, target: { kind: "page", id: shop.pageId }, targetKind: "page", targetId: shop.pageId, reporterPersonId: f.reader.personId, reason: "Signalement de recette", level: "network", status: "open", createdAt: 1, updatedAt: 1 })
    })
    expect(await f.reader.as.query(getPublicStorefront, args)).toBeNull()
    expect(await f.t.query(getPublicStorefront, args)).not.toBeNull()
  })

  it("une image retenue n'expose jamais d'URL ni d'identifiant de stockage", async () => {
    const f = await fixture()
    const shop = await publishedShop(f.t, f.root, f.owner, "media-test")
    const storageId = await f.t.run(async (ctx) => {
      const id = await ctx.storage.store(new Blob([new Uint8Array(64)], { type: "image/png" }))
      await (ctx.db as unknown as { patch: (table: "_storage", id: Id<"_storage">, value: { contentType: string }) => Promise<void> }).patch("_storage", id, { contentType: "image/png" })
      return id
    })
    const uploaded = await f.owner.as.mutation(S.setShopLogo, { networkId: f.root, shopId: shop.shopId, storageId, mimeType: "image/png" })
    expect(uploaded).toMatchObject({ url: null, withheld: "fileScanPending" })
    const args = { networkId: f.root, handle: shop.handle }
    expect(await f.t.query(getPublicStorefront, args)).toMatchObject({ logoUrl: null })
    await f.t.run(async (ctx) => {
      const scan = await ctx.db.query("fileScans").withIndex("by_storageId", (q) => q.eq("storageId", storageId)).unique()
      if (!scan) throw new Error("Analyse de fixture absente")
      await ctx.db.patch(scan._id, { status: "clean", updatedAt: Date.now() })
    })
    expect(await f.t.query(getPublicStorefront, args)).toMatchObject({ logoUrl: expect.any(String) })
    expect(JSON.stringify(await f.t.query(getPublicStorefront, args))).not.toContain(storageId)
  })
})

describe("P07 — annuaire racine", () => {
  it("conserve le curseur brut d'une fenêtre devenue vide après relecture des droits", async () => {
    const f = await fixture()
    await publishedShop(f.t, f.root, f.owner, "encore-visible")
    const hidden = await publishedShop(f.t, f.root, f.owner, "candidat-retire", { publishedAt: Date.now() + 1 })
    await f.t.run(async (ctx) => ctx.db.patch(hidden.pageId, { status: "inactive" }))
    const first = await f.reader.as.query(S.directory, { networkId: f.root, paginationOpts: { cursor: null, numItems: 1 } })
    expect(first.page).toEqual([])
    expect(first.isDone).toBe(false)
    expect(first.continueCursor).not.toBe("")
    const next = await f.reader.as.query(S.directory, { networkId: f.root, paginationOpts: { cursor: first.continueCursor, numItems: 1 } })
    expect(next.page.map((row) => row.handle)).toEqual(["encore-visible"])
  })

  it("inclut les vitrines enfants explicitement root, puis relit leur retrait et la politique", async () => {
    const f = await fixture()
    const rootShop = await publishedShop(f.t, f.root, f.owner, "annuaire-racine")
    const childShop = await publishedShop(f.t, f.child, f.owner, "annuaire-enfant", { visibility: "root" })
    await publishedShop(f.t, f.child, f.owner, "annuaire-prive")
    const args = { networkId: f.root, paginationOpts: PAGE }
    expect((await f.reader.as.query(S.directory, args)).page.map((row) => row.handle).sort()).toEqual([rootShop.handle, childShop.handle].sort())
    await f.owner.as.mutation(S.withdrawStorefront, { networkId: f.child, shopId: childShop.shopId })
    expect((await f.reader.as.query(S.directory, args)).page.map((row) => row.handle)).toEqual([rootShop.handle])
    await f.t.run(async (ctx) => {
      const policy = await ctx.db.query("shopNetworkPolicies").withIndex("by_network", (q) => q.eq("networkId", f.root)).unique()
      if (policy) await ctx.db.patch(policy._id, { storefront: "closed" })
    })
    expect((await f.reader.as.query(S.directory, args)).page).toEqual([])
  })
})
