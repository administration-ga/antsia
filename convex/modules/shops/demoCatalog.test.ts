// @vitest-environment edge-runtime
/** Illustrations démo : vrais comptes, gardes de publication et aucun mandat PRO.GA simulé. */
import { readFileSync } from "node:fs"

import { engineErrorCode } from "@antsia/social-contracts/errors"
import { COMMERCE_PUBLIC_CONTRACT, commerceCanonicalJson, parseCommerceRef } from "@antsia/social-domain/commerce/primitives"
import { COMMERCE_LINK_CONSENT_VERSION } from "@antsia/social-domain/commerce-link"
import { makeFunctionReference } from "convex/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { api, components, internal } from "../../_generated/api"
import type { Doc, Id } from "../../_generated/dataModel"
import { DEMO_CONTENT_DEPLOYMENT, demoContentAllowed } from "../../seeds/demoContentConfig"
import { SEED_CONFIRMATION } from "../../seeds/foundations"
import { createTestSession, testConvex } from "../../test.setup"
import { moderateContentWrite, setContentModerationStatus } from "../moderation/policy"
import { catalogStorefrontBlocks, listCatalog, resolveCatalogOffer } from "./catalogRead"
import { readCommerceLinkConfig } from "./commerceLinkConfig"
import type { CatalogOffer } from "./catalogValidators"
import type { MarketplaceFilters, MarketplacePage, MarketplaceSearchArgs } from "./marketplaceRead"
import { SHOP_PUBLIC_LISTING_TEXT_VERSION } from "./rules"
import type { PublicDailySpecial } from "./validators"

type T = ReturnType<typeof testConvex>
const NOW = Date.UTC(2026, 9, 20, 12)
const FIRST = { cursor: null, numItems: 8 }
const PRODUCT_HANDLE = "epicerie-moussavou-demo"
const demoSelection = makeFunctionReference<"query", MarketplaceFilters & { networkId: Id<"networks"> }, CatalogOffer[]>("modules/shops/marketplace:demoSelection")
const marketplaceSearch = makeFunctionReference<"query", MarketplaceSearchArgs & { networkId: Id<"networks"> }, MarketplacePage>("modules/shops/marketplace:search")
const publicDailySpecial = makeFunctionReference<"query", { networkId: Id<"networks">; handle: string }, PublicDailySpecial | null>("modules/public/shops:getDailySpecial")

function idOf(row: unknown): string {
  if (!row || typeof row !== "object" || !("_id" in row) || typeof row._id !== "string") throw new Error("Compte de fixture absent")
  return row._id
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  vi.stubEnv("ANTSIA_DEV_TOOLS", "true")
  vi.stubEnv("CONVEX_CLOUD_URL", "http://127.0.0.1:3210")
  vi.stubEnv("ANTSIA_DEMO_DEPLOYMENT", "")
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs() })

async function shopFixture(t: T, root: Id<"networks">, options: { handle?: string; ownerHandle?: string; email?: string; verified?: boolean; model?: Doc<"shops">["model"] } = {}) {
  const handle = options.handle ?? PRODUCT_HANDLE
  const ownerHandle = options.ownerHandle ?? "commercant.demo"
  const authUserId = idOf(await t.mutation(components.betterAuth.adapter.create, { input: { model: "user", data: { name: "Compte FICTIF", email: options.email ?? "commercant@demo.antsia.test", emailVerified: options.verified ?? true, createdAt: NOW, updatedAt: NOW } } }))
  const sessionId = await createTestSession(t, authUserId)
  const entities = await t.run(async (ctx) => {
    const personId = await ctx.db.insert("persons", { authUserId, handle: ownerHandle, displayName: "Patrick MOUSSAVOU", publishedAt: NOW, createdAt: NOW, updatedAt: NOW })
    const membershipId = await ctx.db.insert("networkMemberships", { networkId: root, personId, status: "declaree", role: "member", joinedAt: NOW, statusChangedAt: NOW })
    await moderateContentWrite(ctx, { networkId: root, ownerPersonId: personId, kind: "person", id: personId, text: "Compte fictif de démonstration" })
    const pageId = await ctx.db.insert("pages", { networkId: root, handle, name: "Activité fictive Démo", description: "Activité de démonstration", ownerKind: "company", trust: "community", trustRank: 1, visibility: "network", onRoot: true, status: "active", createdByPersonId: personId, searchText: "activité fictive démo", createdAt: NOW, updatedAt: NOW })
    const signatoryId = await ctx.db.insert("pageSignatories", { networkId: root, pageId, personId, role: "admin", acceptedAt: NOW, createdAt: NOW, updatedAt: NOW })
    await moderateContentWrite(ctx, { networkId: root, ownerPersonId: personId, kind: "page", id: pageId, text: "Activité fictive Démo" })
    const shopId = await ctx.db.insert("shops", { networkId: root, pageId, preparedByPersonId: personId, model: options.model ?? "products", storefront: "published", visibility: "network", publicConsentAt: NOW, publicConsentTextVersion: SHOP_PUBLIC_LISTING_TEXT_VERSION, publicConsentByPersonId: personId, publishedAt: NOW, createdAt: NOW, updatedAt: NOW })
    return { personId, membershipId, pageId, signatoryId, shopId }
  })
  return { ...entities, as: t.withIdentity({ subject: authUserId, sessionId }), authUserId, handle }
}

async function fixture(options: Parameters<typeof shopFixture>[2] = {}) {
  const t = testConvex({ automaticSessions: false })
  const { root, testClosed: child } = await t.mutation(internal.seeds.foundations.run, { confirmNonProduction: SEED_CONFIRMATION })
  await t.run(async (ctx) => ctx.db.insert("shopNetworkPolicies", { networkId: root, storefront: "review", updatedAt: NOW }))
  return { t, root, child, ...await shopFixture(t, root, options) }
}
type Fixture = Awaited<ReturnType<typeof fixture>>

async function read(f: Fixture, options: Partial<Parameters<typeof listCatalog>[2]> = {}) {
  return await f.as.query(api.modules.shops.catalog.list, { networkId: f.root, handle: f.handle, paginationOpts: FIRST, ...options })
}
/** Toutes les pages d'un même filtre, par tranches de douze (borne du catalogue fictif). */
async function readAll(f: Fixture, options: Partial<Parameters<typeof listCatalog>[2]> = {}) {
  const items: CatalogOffer[] = []
  let cursor: string | null = null
  for (let pages = 0; pages < 10; pages += 1) {
    const result = await read(f, { ...options, paginationOpts: { cursor, numItems: 12 } })
    items.push(...result.page)
    if (result.isDone) return items
    cursor = result.continueCursor
  }
  throw new Error("Pagination sans fin")
}
async function offer(f: Fixture, offerRef = "demo:offer:epicerie-produits") {
  return await f.as.query(api.modules.shops.catalog.offer, { networkId: f.root, handle: f.handle, offerRef })
}
async function selectDemo(f: Fixture, filters: MarketplaceFilters = {}) {
  return await f.as.query(demoSelection, { networkId: f.root, ...filters })
}

describe("catalogue fictif — activation et propriété", () => {
  it("refuse la production même avec les drapeaux de la démo recopiés", async () => {
    const f = await fixture()
    vi.stubEnv("CONVEX_CLOUD_URL", "https://production.convex.cloud")
    vi.stubEnv("ANTSIA_DEMO_DEPLOYMENT", DEMO_CONTENT_DEPLOYMENT)
    expect(await offer(f)).toBeNull()
    expect((await read(f)).page).toEqual([])
    expect(demoContentAllowed({ CONVEX_CLOUD_URL: `https://${DEMO_CONTENT_DEPLOYMENT}.convex.cloud`, ANTSIA_DEMO_DEPLOYMENT: DEMO_CONTENT_DEPLOYMENT })).toBe(true)
  })
  it("reste fermé localement sans la déclaration des outils démo", async () => {
    const f = await fixture()
    vi.stubEnv("ANTSIA_DEV_TOOLS", "false")
    expect(await offer(f)).toBeNull()
  })
  it.each([
    { email: "commercant@example.test" },
    { verified: false },
    { ownerHandle: "proprietaire.reel" },
    { handle: "autre-boutique" },
    { model: "quote_services" as const },
  ])("refuse une boutique ou une identité hors de la déclaration : %j", async (options) => {
    const f = await fixture(options)
    expect(await offer(f)).toBeNull()
    expect((await read(f)).page).toEqual([])
  })
  it("ne confond pas une racine présentée par l'appelant avec la vraie racine ANTSIA", async () => {
    const f = await fixture()
    const result = await f.t.run(async (ctx) => {
      const root = (await ctx.db.get(f.root))!, child = (await ctx.db.get(f.child))!
      return await resolveCatalogOffer(ctx, { root, network: { ...child, kind: "root" } }, f.shopId, "demo:offer:epicerie-produits")
    })
    expect(result).toBeNull()
  })
})

describe("catalogue fictif — publication vivante et portée publique", () => {
  it.each(["withdrawn", "suspended"] as const)("ferme immédiatement une vitrine %s", async (storefront) => {
    const f = await fixture()
    expect(await offer(f)).not.toBeNull()
    await f.t.run(async (ctx) => ctx.db.patch(f.shopId, { storefront }))
    expect(await offer(f)).toBeNull()
  })
  it("refuse un propriétaire retiré ou dont le mandat n'est plus accepté", async () => {
    const f = await fixture()
    await f.t.run(async (ctx) => ctx.db.patch(f.personId, { withdrawnAt: NOW }))
    expect(await offer(f)).toBeNull()
    await f.t.run(async (ctx) => { await ctx.db.patch(f.personId, { withdrawnAt: undefined }); await ctx.db.patch(f.signatoryId, { acceptedAt: undefined }) })
    expect(await offer(f)).toBeNull()
  })
  it("ferme la vitrine d'un propriétaire suspendu et une page en prélecture, même pour son propriétaire", async () => {
    const f = await fixture()
    await f.t.run(async (ctx) => ctx.db.patch(f.membershipId, { status: "suspendue" }))
    expect(await f.t.run(async (ctx) => resolveCatalogOffer(ctx, { root: (await ctx.db.get(f.root))! }, f.shopId, "demo:offer:epicerie-produits"))).toBeNull()
    await f.t.run(async (ctx) => {
      await ctx.db.patch(f.membershipId, { status: "declaree" })
      const state = await ctx.db.query("moderationContentStates").withIndex("by_target", (q) => q.eq("targetKind", "page").eq("targetId", f.pageId)).unique()
      await ctx.db.patch(state!._id, { status: "pending_review" })
    })
    expect(await offer(f)).toBeNull()
  })
  it("respecte le retrait de page et le consentement public dans les lectures membre et anonyme", async () => {
    const f = await fixture()
    const args = { networkId: f.root, handle: f.handle, offerRef: "demo:offer:epicerie-produits" }
    expect(await f.t.query(api.modules.public.catalog.offer, args)).not.toBeNull()
    await f.t.run(async (ctx) => ctx.db.patch(f.shopId, { publicConsentRevokedAt: NOW }))
    expect(await offer(f)).toBeNull()
    expect(await f.t.query(api.modules.public.catalog.offer, args)).toBeNull()
    await f.t.run(async (ctx) => { await ctx.db.patch(f.shopId, { publicConsentRevokedAt: undefined }); await ctx.db.patch(f.pageId, { status: "inactive" }) })
    expect(await offer(f)).toBeNull()
  })
  it("respecte la modération retirée de la page et la fermeture de politique", async () => {
    const f = await fixture()
    await f.t.run(async (ctx) => setContentModerationStatus(ctx, { networkId: f.root, kind: "page", id: f.pageId }, "removed"))
    expect(await offer(f)).toBeNull()
    await f.t.run(async (ctx) => {
      await setContentModerationStatus(ctx, { networkId: f.root, kind: "page", id: f.pageId }, "published")
      const policy = await ctx.db.query("shopNetworkPolicies").withIndex("by_network", (q) => q.eq("networkId", f.root)).unique()
      await ctx.db.patch(policy!._id, { storefront: "closed" })
    })
    expect(await offer(f)).toBeNull()
  })
})

describe("catalogue fictif — données et lectures raccordées", () => {
  it("sert treize produits illustrés, sans disponibilité réelle ni action commerciale", async () => {
    const f = await fixture()
    const result = await read(f, { paginationOpts: { cursor: null, numItems: 12 } })
    expect(result.page).toHaveLength(12)
    expect(result.isDone).toBe(false)
    const all = await readAll(f)
    expect(all.map((item) => item.price)).toEqual([1500, 6500, 4000, 1500, 7500, 3500, 2000, 1000, 1200, 2000, 1000, 2500, 8500].map((amount) => ({ mode: "fixed", currency: "XAF", amount })))
    for (const item of all) {
      expect(item.offerRef).toMatch(/^demo:offer:/)
      expect(parseCommerceRef(item.offerRef)).toBeNull()
      expect(item.actions).toEqual({ contact: false, quote: false, purchase: false })
      expect(item.availability).toEqual({ state: "unknown", indicative: true, updatedAt: null, stale: false })
      expect(item.media[0]?.url).toMatch(/^\/demo-media\/(animation-20261020\/[a-z-]+\.png|photos-20261021\/[a-z0-9-]+\.jpg)$/)
      expect(item.media[0]?.altText).toMatch(/^(Illustration générée|Photo d'illustration) pour la démonstration : /)
      expect(item.media[0]?.width).toBeGreaterThan(0)
      expect(item.media[0]?.height).toBeGreaterThan(0)
    }
    // Les photos libres de droits illustrent les produits frais ; les illustrations générées restent.
    expect(all.filter((item) => item.media[0]?.url?.endsWith(".jpg"))).toHaveLength(10)
    expect(await f.t.run(async (ctx) => catalogStorefrontBlocks(ctx, (await ctx.db.get(f.root))!, (await ctx.db.get(f.shopId))!))).toEqual(["catalog"])
    const checkout = await f.as.query(api.modules.shops.checkout.context, { networkId: f.root, handle: f.handle, offerRef: result.page[0]!.offerRef })
    expect(checkout.available).toBe(false)
    expect(await f.t.run(async (ctx) => (await ctx.db.query("shopCommerceLinks").take(1)).length)).toBe(0)
  })
  it("filtre par texte sans accents, type et collection ; pagine sans doublon ni curseur croisé", async () => {
    const f = await fixture()
    expect((await read(f, { query: "epicerie" })).page.map((item) => item.offerRef)).toEqual(["demo:offer:epicerie-produits"])
    expect((await read(f, { kind: "service" })).page).toEqual([])
    const first = await read(f, { paginationOpts: { cursor: null, numItems: 5 } })
    const second = await read(f, { paginationOpts: { cursor: first.continueCursor, numItems: 5 } })
    const third = await read(f, { paginationOpts: { cursor: second.continueCursor, numItems: 5 } })
    expect([first.isDone, second.isDone, third.isDone]).toEqual([false, false, true])
    expect(new Set([...first.page, ...second.page, ...third.page].map((item) => item.offerRef)).size).toBe(13)
    expect(await readAll(f, { collectionRef: first.collections[0]!.collectionRef })).toHaveLength(13)
    expect((await read(f, { collectionRef: "demo:collection:autre" })).page).toEqual([])
    let error: unknown
    try { await read(f, { query: "wax", paginationOpts: { cursor: first.continueCursor, numItems: 2 } }) } catch (caught) { error = caught }
    expect(engineErrorCode(error)).toBe("invalidArgument")
  })
  it("affiche les vingt prestations dans Découvrir sans ouvrir la politique des commandes", async () => {
    const f = await fixture()
    await shopFixture(f.t, f.root, { handle: "studio-objectif-demo", ownerHandle: "verifie.demo", email: "verifie@demo.antsia.test", model: "quote_services" })
    await shopFixture(f.t, f.root, { handle: "atelier-tech-demo", ownerHandle: "membre.demo", email: "membre@demo.antsia.test", model: "quote_services" })
    expect(await f.as.query(api.modules.shops.services.discoverAvailability, { networkId: f.root })).toEqual({ available: true })
    const result = await f.as.query(api.modules.shops.services.discoverServices, { networkId: f.root, paginationOpts: { cursor: null, numItems: 24 } })
    expect(result.page).toHaveLength(20)
    expect(result.isDone).toBe(true)
    expect(result.page.every((item) => item.kind === "service" && !item.actions.purchase && !item.actions.quote && !item.actions.contact)).toBe(true)
    expect(result.page.find((item) => item.offerRef === "demo:offer:reportage-photo")?.price).toEqual({ mode: "quote", currency: "XAF" })
    expect(await f.t.run(async (ctx) => (await ctx.db.query("commerceServicePolicies").take(1)).length)).toBe(0)
    expect(await f.t.run(async (ctx) => (await ctx.db.query("commerceServiceRequests").take(1)).length)).toBe(0)
  })
  it("laisse une projection PRO.GA réellement lisible remplacer les illustrations démo", async () => {
    const f = await fixture()
    expect(await selectDemo(f)).toHaveLength(13)
    vi.stubEnv("FEDERATION_ENVIRONMENT", "sandbox")
    vi.stubEnv("ANTSIA_COMMERCE_ENVIRONMENT", "sandbox")
    vi.stubEnv("ANTSIA_COMMERCE_SOURCE", "antsia")
    vi.stubEnv("ANTSIA_COMMERCE_PRO_HTTP_ORIGIN", "http://localhost:4010")
    vi.stubEnv("ANTSIA_COMMERCE_PRO_APP_ORIGIN", "http://localhost:4011")
    vi.stubEnv("ANTSIA_COMMERCE_ORIGIN", "http://localhost:3030")
    vi.stubEnv("ANTSIA_COMMERCE_KEY_ID", "catalog-fixture-real")
    vi.stubEnv("ANTSIA_COMMERCE_SIGNING_KEY", "fixture-only-catalogue-sandbox-0123456789")
    const config = await readCommerceLinkConfig()
    if (!config) throw new Error("Configuration de fixture absente")
    const shopRef = "pro.ga:structure:01JA00000000000000000000S1", linkRef = "pro.ga:commerce_link:01JA00000000000000000000K1", offerRef = "pro.ga:offer:01JA00000000000000000000P1"
    await f.t.run(async (ctx) => {
      await ctx.db.insert("shopCommerceLinks", { networkId: f.root, shopId: f.shopId, pageId: f.pageId, personId: f.personId, state: "active", source: "antsia", environment: "sandbox", configFingerprint: config.fingerprint, subjectRef: `antsia:sub:${"a".repeat(32)}`, antsiaShopRef: `antsia:shop:${"b".repeat(32)}`, shopRef, linkRef, permissions: ["publish_catalog"], consentTextVersion: COMMERCE_LINK_CONSENT_VERSION, consentedAt: NOW, linkedAt: NOW, createdAt: NOW, updatedAt: NOW })
      await ctx.db.insert("shopCatalogPolicies", { networkId: f.root, enabled: true, updatedAt: NOW })
      const emitterId = await ctx.db.insert("federationEmitters", { networkId: f.root, slug: "catalog-fixture-real", environment: "sandbox", enabled: true, keyEnvName: "CATALOG_FIXTURE_KEY", allowedContracts: [COMMERCE_PUBLIC_CONTRACT], revision: 1, createdAt: NOW, updatedAt: NOW })
      const mappingId = await ctx.db.insert("commerceCatalogMappings", { networkId: f.root, shopId: f.shopId, emitterId, environment: "sandbox", shopRef, linkRef, enabled: true, generation: 1, createdAt: NOW, updatedAt: NOW })
      const fields = { networkId: f.root, shopId: f.shopId, mappingId, mappingGeneration: 1, emitterId, environment: "sandbox" as const, shopRef, sequence: "catalog" as const, state: "active" as const, revision: 1, digest: "a".repeat(64), changedAt: NOW, receivedAt: NOW, activationRevision: 1, gap: false }
      await ctx.db.insert("commerceCatalogHeads", { ...fields, objectRef: shopRef, objectKind: "shop", parentActivationRevision: 0, body: commerceCanonicalJson({ contract: COMMERCE_PUBLIC_CONTRACT, eventId: "real-shop-fixture", objectRef: shopRef, version: 1, payload: { type: "shop.published", shopRef, linkRef, revision: 1, changedAt: NOW, commercialName: "Catalogue réel", country: "GA", currency: "XAF", sellerVerification: "unverified", capabilities: ["catalog"], collections: [] } })! })
      const headId = await ctx.db.insert("commerceCatalogHeads", { ...fields, objectRef: offerRef, objectKind: "offer", kind: "product", parentActivationRevision: 1, body: commerceCanonicalJson({ contract: COMMERCE_PUBLIC_CONTRACT, eventId: "real-offer-fixture", objectRef: offerRef, version: 1, payload: { type: "offer.published", shopRef, offerRef, revision: 1, changedAt: NOW, kind: "product", title: "Catalogue réel", description: "Projection contractuelle de fixture.", collectionRefs: [], tags: [], price: { mode: "fixed", currency: "XAF", amount: 42 }, showsAvailability: false, variants: [], variantAxes: [], media: [] } })! })
      await setContentModerationStatus(ctx, { networkId: f.root, kind: "commerceOffer", id: headId }, "published")
    })
    expect((await read(f)).page.map((item) => item.offerRef)).toEqual([offerRef])
    expect(await offer(f)).toBeNull()
    expect(await selectDemo(f)).toEqual([])
  })
})

describe("MP04 — sélection démo explicite de la marketplace", () => {
  it("rend les trente-trois offres des trois activités gardées sans contaminer l'index réel", async () => {
    const f = await fixture()
    await shopFixture(f.t, f.root, { handle: "studio-objectif-demo", ownerHandle: "verifie.demo", email: "verifie@demo.antsia.test", model: "quote_services" })
    await shopFixture(f.t, f.root, { handle: "atelier-tech-demo", ownerHandle: "membre.demo", email: "membre@demo.antsia.test", model: "quote_services" })
    const selected = await selectDemo(f)
    expect(selected).toHaveLength(33)
    expect(new Set(selected.map(item => item.offerRef)).size).toBe(33)
    expect(new Set(selected.map(item => item.shopHandle))).toEqual(new Set([PRODUCT_HANDLE, "studio-objectif-demo", "atelier-tech-demo"]))
    expect(selected.every(item => item.offerRef.startsWith("demo:offer:") && !item.actions.contact && !item.actions.quote && !item.actions.purchase)).toBe(true)
    expect(JSON.stringify(selected)).not.toContain("@demo.antsia.test")
    expect(await f.as.query(marketplaceSearch, { networkId: f.root, paginationOpts: FIRST })).toMatchObject({ indexStatus: "building", page: [] })
    expect(await f.t.run(async ctx => (await ctx.db.query("commerceCatalogHeads").take(1)).length)).toBe(0)
    expect(await f.t.run(async ctx => (await ctx.db.query("commerceCatalogIndexes").take(1)).length)).toBe(0)
    expect(await f.t.run(async ctx => (await ctx.db.query("commerceServiceRequests").take(1)).length)).toBe(0)
  })

  it("réutilise les filtres serveur sans inventer les facettes manquantes ni des prix de devis", async () => {
    const f = await fixture()
    await shopFixture(f.t, f.root, { handle: "studio-objectif-demo", ownerHandle: "verifie.demo", email: "verifie@demo.antsia.test", model: "quote_services" })
    await shopFixture(f.t, f.root, { handle: "atelier-tech-demo", ownerHandle: "membre.demo", email: "membre@demo.antsia.test", model: "quote_services" })
    expect(await selectDemo(f, { kind: "product" })).toHaveLength(13)
    expect(await selectDemo(f, { kind: "service" })).toHaveLength(20)
    expect((await selectDemo(f, { query: "ÉPICERIE" })).map(item => item.offerRef)).toEqual(["demo:offer:epicerie-produits"])
    expect((await selectDemo(f, { query: "photo", kind: "service" })).map(item => item.offerRef).sort()).toEqual(["demo:offer:location-studio", "demo:offer:photo-identite", "demo:offer:photo-portrait", "demo:offer:photos-produits", "demo:offer:prises-de-vue-drone", "demo:offer:reportage-mariage", "demo:offer:reportage-photo", "demo:offer:retouche-photo", "demo:offer:seance-famille", "demo:offer:tirages-photo"])
    expect((await selectDemo(f, { maxPrice: 3_000, sort: "price_asc" })).map(item => item.price)).toEqual([500, 1000, 1000, 1200, 1500, 1500, 2000, 2000, 2000, 2500, 3000].map(amount => ({ mode: "fixed", currency: "XAF", amount })))
    const pricedServices = await selectDemo(f, { kind: "service", minPrice: 0, sort: "price_desc" })
    expect(pricedServices.map(item => item.offerRef)).toEqual(["seance-famille", "photos-produits", "formation-bureautique", "photo-portrait", "location-studio", "maintenance-informatique", "installation-logiciels", "depannage-imprimante", "diagnostic-informatique", "photo-identite", "retouche-photo", "tirages-photo"].map(slug => `demo:offer:${slug}`))
    for (const filters of [{ category: ["fashion", "food"] }, { brand: "demo" }, { material: ["raphia", "wax"] }, { serviceMode: ["remote", "onsite"] as Array<"remote" | "onsite"> }]) expect(await selectDemo(f, filters)).toEqual([])
  })

  it("referme la branche globale lorsque l'environnement ou la propriété démo ne sont plus admis", async () => {
    const f = await fixture()
    expect(await selectDemo(f)).toHaveLength(13)
    vi.stubEnv("ANTSIA_DEV_TOOLS", "false")
    expect(await selectDemo(f)).toEqual([])
    vi.stubEnv("ANTSIA_DEV_TOOLS", "true")
    vi.stubEnv("CONVEX_CLOUD_URL", "https://production.convex.cloud")
    vi.stubEnv("ANTSIA_DEMO_DEPLOYMENT", DEMO_CONTENT_DEPLOYMENT)
    expect(await selectDemo(f)).toEqual([])
    vi.stubEnv("CONVEX_CLOUD_URL", "http://127.0.0.1:3210")
    vi.stubEnv("ANTSIA_DEMO_DEPLOYMENT", "")
    await f.t.run(async ctx => ctx.db.patch(f.personId, { handle: "proprietaire.reel" }))
    expect(await selectDemo(f)).toEqual([])
  })

  it("relit la modération et le consentement et ne projette pas la démo vers un réseau enfant", async () => {
    const f = await fixture()
    await f.t.run(async ctx => ctx.db.insert("networkMemberships", { networkId: f.child, personId: f.personId, status: "declaree", role: "member", joinedAt: NOW, statusChangedAt: NOW }))
    expect(await f.as.query(demoSelection, { networkId: f.child })).toEqual([])
    await f.t.run(async ctx => setContentModerationStatus(ctx, { networkId: f.root, kind: "page", id: f.pageId }, "removed"))
    expect(await selectDemo(f)).toEqual([])
    await f.t.run(async ctx => {
      await setContentModerationStatus(ctx, { networkId: f.root, kind: "page", id: f.pageId }, "published")
      await ctx.db.patch(f.shopId, { publicConsentRevokedAt: NOW })
    })
    expect(await selectDemo(f)).toEqual([])
  })
})


describe("MP05d — filtres du catalogue fictif borné", () => {
  it("filtre et trie la sélection complète, sans inventer de catégorie ni ouvrir le paiement", async () => {
    const f = await fixture()
    const ascending = await readAll(f, { sort: "price_asc" })
    expect(ascending).toHaveLength(13)
    const amounts = ascending.map(item => item.price.mode === "fixed" || item.price.mode === "unit" ? item.price.amount : -1)
    expect(amounts).toEqual([...amounts].sort((a, b) => a - b))
    const descending = await readAll(f, { sort: "price_desc" })
    // Prix égaux : l'ordre des références départage dans les deux sens, seuls les montants se renversent.
    expect(descending.map(item => item.price.mode === "fixed" || item.price.mode === "unit" ? item.price.amount : -1)).toEqual([...amounts].reverse())
    expect(new Set(descending.map(item => item.offerRef))).toEqual(new Set(ascending.map(item => item.offerRef)))
    const minimum = amounts[1]!
    const filtered = await read(f, { minPrice: minimum, sort: "price_asc" })
    expect(filtered.page.length).toBeGreaterThan(0)
    expect(filtered.page.every(item => (item.price.mode === "fixed" || item.price.mode === "unit") && item.price.amount >= minimum)).toBe(true)
    for (const filters of [{ category: ["fashion"] }, { brand: ["demo"] }, { material: ["raphia"] }, { audience: ["women"] as Array<"women"> }]) expect((await read(f, filters)).page).toEqual([])
    expect(ascending.every(item => item.facets === undefined && !item.actions.purchase && !item.actions.quote)).toBe(true)
  })
  it("ne réutilise pas un curseur démo sous un autre prix, tri ou lecteur", async () => {
    const f = await fixture(), first = await read(f, { sort: "price_asc", paginationOpts: { cursor: null, numItems: 1 } })
    for (const filters of [{ sort: "price_desc" as const }, { sort: "price_asc" as const, minPrice: 0 }]) {
      let error: unknown
      try { await read(f, { ...filters, paginationOpts: { cursor: first.continueCursor, numItems: 1 } }) } catch (caught) { error = caught }
      expect(engineErrorCode(error)).toBe("invalidArgument")
    }
  })
})

it("MP06 — la démo ne fabrique pas de profil pour les filtres et conserve sa pagination bornée", async () => {
  const f = await fixture()
  await shopFixture(f.t, f.root, { handle: "studio-objectif-demo", ownerHandle: "verifie.demo", email: "verifie@demo.antsia.test", model: "quote_services" })
  await shopFixture(f.t, f.root, { handle: "atelier-tech-demo", ownerHandle: "membre.demo", email: "membre@demo.antsia.test", model: "quote_services" })
  const args = { networkId: f.root, paginationOpts: { cursor: null, numItems: 8 } }
  const first = await f.as.query(api.modules.shops.services.discoverServices, args)
  expect(first).toMatchObject({ selection: "demo", isDone: false })
  expect(first.page).toHaveLength(8)
  const second = await f.as.query(api.modules.shops.services.discoverServices, { ...args, paginationOpts: { cursor: first.continueCursor, numItems: 8 } })
  const third = await f.as.query(api.modules.shops.services.discoverServices, { ...args, paginationOpts: { cursor: second.continueCursor, numItems: 8 } })
  expect(second).toMatchObject({ selection: "demo", isDone: false })
  expect(third).toMatchObject({ selection: "demo", isDone: true })
  const pages = [...first.page, ...second.page, ...third.page]
  expect(new Set(pages.map(item => item.offerRef)).size).toBe(20)
  expect(pages.every(item => item.serviceProfile === undefined)).toBe(true)
  for (const filters of [{ commercialMode: "quote" as const }, { languageCode: "fr" }, { serviceZone: "Libreville" }, { minDurationMinutes: 1 }]) {
    expect(await selectDemo(f, { kind: "service", ...filters })).toEqual([])
    expect((await f.as.query(api.modules.shops.services.discoverServices, { ...args, ...filters })).page).toEqual([])
  }
  let error: unknown
  try { await f.as.query(api.modules.shops.services.discoverServices, { ...args, query: "photo", paginationOpts: { cursor: first.continueCursor, numItems: 2 } }) } catch (caught) { error = caught }
  expect(engineErrorCode(error)).toBe("invalidArgument")
})

it("MP06 — retirer la capacité services ferme aussi les offres fictives et leurs détails publics", async () => {
  const f = await fixture({ handle: "studio-objectif-demo", ownerHandle: "verifie.demo", email: "verifie@demo.antsia.test", model: "quote_services" })
  const args = { networkId: f.root, handle: f.handle, offerRef: "demo:offer:photo-portrait" }
  expect(await f.t.query(api.modules.public.catalog.offer, args)).not.toBeNull()
  await f.t.run(async ctx => ctx.db.patch(f.shopId, { activityConfiguration: { version: 1, capabilities: ["media"], template: "media", blocks: ["publications", "about"] } }))
  expect(await f.as.query(api.modules.shops.catalog.offer, args)).toBeNull()
  expect(await f.t.query(api.modules.public.catalog.offer, args)).toBeNull()
  expect((await read(f)).page).toEqual([])
  expect(await selectDemo(f)).toEqual([])
})

it("le miroir du site déclare chaque offre fictive du moteur avec la même image", async () => {
  const f = await fixture()
  await shopFixture(f.t, f.root, { handle: "studio-objectif-demo", ownerHandle: "verifie.demo", email: "verifie@demo.antsia.test", model: "quote_services" })
  await shopFixture(f.t, f.root, { handle: "atelier-tech-demo", ownerHandle: "membre.demo", email: "membre@demo.antsia.test", model: "quote_services" })
  const mirror = readFileSync(new URL("../../../apps/antsia_ga/src/lib/demo-catalog-projection.ts", import.meta.url), "utf8")
    .replaceAll("${illustrationRoot}", "/demo-media/animation-20261020").replaceAll("${photoRoot}", "/demo-media/photos-20261021")
  const selected = await selectDemo(f)
  expect(selected).toHaveLength(33)
  for (const item of selected) expect(mirror, item.offerRef).toContain(`offerRef: "${item.offerRef}", shopHandle: "${item.shopHandle}", kind: "${item.kind}"`)
  for (const item of selected) expect(mirror, item.offerRef).toMatch(new RegExp(`offerRef: "${item.offerRef}"[^\\n]*imagePath: \`${item.media[0]!.url!.replaceAll(".", "\\.")}\``))
  expect(mirror.match(/offerRef: "demo:offer:/g)).toHaveLength(33)
})


describe("SU06 — plat du jour d'une adresse « Alimentation et restauration »", () => {
  const setSpecial = (f: Fixture, offerRef: string | null, as = f.as) => as.mutation(api.modules.shops.shops.setDailySpecial, { networkId: f.root, shopId: f.shopId, offerRef })
  const storefrontOf = async (f: Fixture) => await f.as.query(api.modules.shops.shops.storefront, { networkId: f.root, handle: f.handle })
  async function refusal(promise: Promise<unknown>) {
    try { await promise; return null } catch (error) { return engineErrorCode(error) }
  }

  it("réservé au gabarit food, au gérant et à un produit de son propre menu", async () => {
    const f = await fixture()
    expect(await refusal(setSpecial(f, "demo:offer:epicerie-produits"))).toBe("notFound")
    await f.t.run(async (ctx) => ctx.db.patch(f.shopId, { activityConfiguration: { version: 1, capabilities: ["products"], template: "food", blocks: ["catalog", "publications", "about"] } }))
    expect(await refusal(setSpecial(f, "demo:offer:inconnue"))).toBe("notFound")
    expect(await refusal(setSpecial(f, "x".repeat(201)))).toBe("notFound")
    // Une offre d'une autre boutique n'est pas au menu, et un autre membre ne gère pas celle-ci.
    expect(await refusal(setSpecial(f, "demo:offer:photo-portrait"))).toBe("notFound")
    const other = await shopFixture(f.t, f.root, { handle: "studio-objectif-demo", ownerHandle: "verifie.demo", email: "verifie@demo.antsia.test", model: "quote_services" })
    expect(await refusal(setSpecial(f, "demo:offer:epicerie-produits", other.as))).toBe("notFound")
    expect(await f.t.run(async (ctx) => (await ctx.db.get(f.shopId))?.dailySpecial ?? null)).toBeNull()
  })

  it("date le plat à Libreville, le montre à la vitrine, à l'éditeur et à la carte, n'écrit rien deux fois et se retire", async () => {
    const f = await fixture()
    await f.t.run(async (ctx) => ctx.db.patch(f.shopId, { activityConfiguration: { version: 1, capabilities: ["products"], template: "food", blocks: ["catalog", "publications", "about"] }, hours: "Du lundi au samedi, de 8 h à 20 h" }))
    expect(await setSpecial(f, "demo:offer:epicerie-produits")).toEqual({ changed: true })
    expect(await setSpecial(f, "demo:offer:epicerie-produits")).toEqual({ changed: false })
    const special = { offerRef: "demo:offer:epicerie-produits", day: "2026-10-20" }
    expect((await storefrontOf(f))?.dailySpecial).toEqual(special)
    expect((await f.as.query(api.modules.shops.shops.getMyShop, { networkId: f.root, shopId: f.shopId }))?.dailySpecial).toEqual(special)
    const card = (await f.as.query(api.modules.shops.marketplaceShops.search, { networkId: f.root, paginationOpts: FIRST })).page.find((item) => item.handle === f.handle)
    expect(card).toMatchObject({ template: "food", hours: "Du lundi au samedi, de 8 h à 20 h", dailySpecial: special })
    // Le lendemain, la même désignation se redate ; `null` retire le plat, une seule fois.
    vi.setSystemTime(NOW + 24 * 60 * 60 * 1000)
    expect(await setSpecial(f, "demo:offer:epicerie-produits")).toEqual({ changed: true })
    expect((await storefrontOf(f))?.dailySpecial).toEqual({ ...special, day: "2026-10-21" })
    expect(await setSpecial(f, null)).toEqual({ changed: true })
    expect(await setSpecial(f, null)).toEqual({ changed: false })
    expect((await storefrontOf(f))?.dailySpecial).toBeNull()
  })

  it("sert le même produit fictif au visiteur public et ferme immédiatement la désignation retirée", async () => {
    const f = await fixture()
    await f.t.run(async (ctx) => ctx.db.patch(f.shopId, { activityConfiguration: { version: 1, capabilities: ["products"], template: "food", blocks: ["catalog", "about"] } }))
    const args = { networkId: f.root, handle: f.handle }
    expect(await f.t.query(publicDailySpecial, args)).toBeNull()
    await setSpecial(f, "demo:offer:epicerie-produits")
    const product = await f.t.query(api.modules.public.catalog.offer, { ...args, offerRef: "demo:offer:epicerie-produits" })
    expect(product).not.toBeNull()
    expect(await f.t.query(publicDailySpecial, args)).toEqual({ version: 1, day: "2026-10-20", offer: product })
    await setSpecial(f, null)
    expect(await f.t.query(publicDailySpecial, args)).toBeNull()
  })

  it("ne transporte pas un plat fictif vers la production même avec sa désignation conservée", async () => {
    const f = await fixture()
    await f.t.run(async (ctx) => ctx.db.patch(f.shopId, { activityConfiguration: { version: 1, capabilities: ["products"], template: "food", blocks: ["catalog", "about"] } }))
    await setSpecial(f, "demo:offer:epicerie-produits")
    const args = { networkId: f.root, handle: f.handle }
    expect(await f.t.query(publicDailySpecial, args)).not.toBeNull()
    vi.stubEnv("CONVEX_CLOUD_URL", "https://production.convex.cloud")
    vi.stubEnv("ANTSIA_DEMO_DEPLOYMENT", DEMO_CONTENT_DEPLOYMENT)
    expect(await f.t.query(publicDailySpecial, args)).toBeNull()
  })
})
