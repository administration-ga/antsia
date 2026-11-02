// @vitest-environment edge-runtime
/** MP03 : index réel du harnais, filtres avant pagination et admission actuelle. */
import { engineErrorCode } from "@antsia/social-contracts/errors"
import { COMMERCE_INQUIRY_CONSENT_VERSION } from "@antsia/social-domain/commerce-inquiry"
import { COMMERCE_SERVICE_CONSENTS } from "@antsia/social-domain/commerce-services"
import { COMMERCE_LINK_CONSENT_VERSION } from "@antsia/social-domain/commerce-link"
import { COMMERCE_PUBLIC_CONTRACT, COMMERCE_PUBLIC_CONTRACT_V2, commerceCanonicalJson, type CommercePublicContract } from "@antsia/social-domain/commerce/primitives"
import type { CommerceServiceProfile } from "@antsia/social-domain/commerce/serviceProfile"
import type { CommerceOfferEvent, CommerceShopEvent } from "@antsia/social-domain/commerce/projection"
import { makeFunctionReference } from "convex/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { api, internal } from "../../_generated/api"
import type { Id } from "../../_generated/dataModel"
import { SEED_CONFIRMATION } from "../../seeds/foundations"
import { testConvex } from "../../test.setup"
import { readCommerceLinkConfig } from "./commerceLinkConfig"
import { marketplaceIndexFields } from "./marketplaceIndexFields"
import { marketplaceFiltersOf } from "./marketplaceRead"
import type { MarketplacePage, MarketplaceSearchArgs } from "./marketplaceRead"
import { commerceActivationReady } from "./commerceActivation"
import { SHOP_PUBLIC_LISTING_TEXT_VERSION } from "./rules"

const NOW = Date.UTC(2026, 9, 21, 12)
const SHOP = "pro.ga:structure:01JA00000000000000000000S1"
const LINK = "pro.ga:commerce_link:01JA00000000000000000000K1"
const search = makeFunctionReference<"query", MarketplaceSearchArgs & { networkId: Id<"networks"> }, MarketplacePage>("modules/shops/marketplace:search")
const searchServices = makeFunctionReference<"query", MarketplaceSearchArgs & { networkId: Id<"networks"> }, MarketplacePage>("modules/shops/services:search")
const start = makeFunctionReference<"mutation", { networkId: Id<"networks"> }, { generation: number }>("modules/shops/marketplaceIndex:start")
const build = makeFunctionReference<"mutation", { networkId: Id<"networks">; generation: number; cursor: string | null }, null>("modules/shops/marketplaceIndex:build")
const ref = (index: number) => `pro.ga:offer:${String(index).padStart(26, "0")}`
function body(payload: CommerceOfferEvent | CommerceShopEvent, contract: CommercePublicContract = COMMERCE_PUBLIC_CONTRACT_V2) {
  return commerceCanonicalJson({ contract, version: 1, eventId: `marketplace-${payload.type}-${payload.revision}`, objectRef: "offerRef" in payload ? payload.offerRef : payload.shopRef, payload })!
}

beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(NOW)
  vi.stubEnv("FEDERATION_ENVIRONMENT", "sandbox")
  vi.stubEnv("ANTSIA_COMMERCE_ENVIRONMENT", "sandbox")
  vi.stubEnv("ANTSIA_COMMERCE_SOURCE", "antsia")
  vi.stubEnv("ANTSIA_COMMERCE_PRO_HTTP_ORIGIN", "http://localhost:4010")
  vi.stubEnv("ANTSIA_COMMERCE_PRO_APP_ORIGIN", "http://localhost:4011")
  vi.stubEnv("ANTSIA_COMMERCE_ORIGIN", "http://localhost:3030")
  vi.stubEnv("ANTSIA_COMMERCE_KEY_ID", "marketplace-test-key")
  vi.stubEnv("ANTSIA_COMMERCE_SIGNING_KEY", "marketplace-fixture-secret-key-sandbox-0123456789")
  vi.stubEnv("FILE_GUARD", "off")
})
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllEnvs() })

async function fixture(ready = true) {
  const t = testConvex()
  const { root, testClosed } = await t.mutation(internal.seeds.foundations.run, { confirmNonProduction: SEED_CONFIRMATION })
  const as = t.withIdentity({ subject: "marketplace-owner-fixture" })
  const personId = await as.mutation(api.modules.people.persons.ensureMyPerson, {})
  await as.mutation(api.modules.people.consents.recordConsent, { purpose: "social_profile", origin: "onboarding" })
  await as.mutation(api.modules.people.profile.publishMyProfile, { handle: "marketplace-owner", displayName: "Recette marketplace" })
  await as.mutation(api.modules.people.memberships.joinNetwork, { networkId: root })
  const config = await readCommerceLinkConfig()
  if (!config) throw new Error("Configuration de fixture absente")
  const owned = await t.run(async ctx => {
    const pageId = await ctx.db.insert("pages", { networkId: root, handle: "marketplace-shop", name: "Atelier de recette", ownerKind: "company", trust: "community", trustRank: 1, visibility: "network", onRoot: true, status: "active", createdByPersonId: personId, searchText: "atelier recette", createdAt: NOW, updatedAt: NOW })
    await ctx.db.insert("pageSignatories", { networkId: root, pageId, personId, role: "admin", acceptedAt: NOW, createdAt: NOW, updatedAt: NOW })
    const shopId = await ctx.db.insert("shops", { networkId: root, pageId, preparedByPersonId: personId, model: "products", activityConfiguration: { version: 1, capabilities: ["products", "services"], template: "general", blocks: ["catalog", "services", "about"] }, storefront: "published", visibility: "network", publicConsentAt: NOW, publicConsentTextVersion: SHOP_PUBLIC_LISTING_TEXT_VERSION, publicConsentByPersonId: personId, publishedAt: NOW, createdAt: NOW, updatedAt: NOW })
    await ctx.db.insert("shopNetworkPolicies", { networkId: root, storefront: "review", updatedAt: NOW })
    await ctx.db.insert("shopCatalogPolicies", { networkId: root, enabled: true, updatedAt: NOW })
    const emitterId = await ctx.db.insert("federationEmitters", { networkId: root, slug: "marketplace-fixture", environment: "sandbox", enabled: true, keyEnvName: "ANTSIA_MARKETPLACE_FIXTURE_KEY", allowedContracts: [COMMERCE_PUBLIC_CONTRACT, COMMERCE_PUBLIC_CONTRACT_V2], revision: 1, createdAt: NOW, updatedAt: NOW })
    const mappingId = await ctx.db.insert("commerceCatalogMappings", { networkId: root, shopId, emitterId, environment: "sandbox", shopRef: SHOP, linkRef: LINK, enabled: true, generation: 1, createdAt: NOW, updatedAt: NOW })
    const linkId = await ctx.db.insert("shopCommerceLinks", { networkId: root, shopId, pageId, personId, state: "active", source: "antsia", environment: "sandbox", configFingerprint: config.fingerprint, subjectRef: `antsia:sub:${"a".repeat(32)}`, antsiaShopRef: `antsia:shop:${"b".repeat(32)}`, shopRef: SHOP, linkRef: LINK, permissions: ["publish_catalog"], consentTextVersion: COMMERCE_LINK_CONSENT_VERSION, consentedAt: NOW, linkedAt: NOW, createdAt: NOW, updatedAt: NOW })
    const payload: CommerceShopEvent = { type: "shop.published", shopRef: SHOP, linkRef: LINK, revision: 1, changedAt: NOW, commercialName: "Atelier", country: "GA", currency: "XAF", sellerVerification: "unverified", capabilities: ["catalog"], collections: [] }
    const parentBody = body(payload)
    const parentId = await ctx.db.insert("commerceCatalogHeads", { networkId: root, shopId, mappingId, mappingGeneration: 1, emitterId, environment: "sandbox", objectRef: SHOP, shopRef: SHOP, sequence: "catalog", objectKind: "shop", state: "active", revision: 1, digest: "a".repeat(64), body: parentBody, changedAt: NOW, receivedAt: NOW, activationRevision: 1, parentActivationRevision: 1, gap: false, ...marketplaceIndexFields(parentBody, "active", "shop", "catalog", NOW) })
    if (ready) await ctx.db.insert("commerceCatalogIndexes", { networkId: root, version: 2, generation: 1, status: "ready", updatedAt: NOW })
    return { pageId, shopId, emitterId, mappingId, linkId, parentId }
  })
  return { t, as, root, testClosed, personId, ...owned }
}
type Fixture = Awaited<ReturnType<typeof fixture>>
async function addOffer(f: Fixture, index: number, extra: Partial<CommerceOfferEvent> = {}, indexed = true, contract: CommercePublicContract = COMMERCE_PUBLIC_CONTRACT_V2) {
  const payload: CommerceOfferEvent = {
    type: "offer.published", shopRef: SHOP, offerRef: ref(index), revision: 1, changedAt: NOW - index * 1000,
    kind: "product", title: `Veste élégante ${index}`, description: "Une création publique en lin.", collectionRefs: [], tags: ["mode"],
    price: { mode: "fixed", currency: "XAF", amount: index * 100 }, showsAvailability: false, variants: [], variantAxes: [], media: [], ...extra,
  }
  const raw = body(payload, contract)
  return await f.t.run(async ctx => {
    const headId = await ctx.db.insert("commerceCatalogHeads", { networkId: f.root, shopId: f.shopId, mappingId: f.mappingId, mappingGeneration: 1, emitterId: f.emitterId, environment: "sandbox", objectRef: payload.offerRef, shopRef: SHOP, sequence: "catalog", objectKind: "offer", kind: payload.kind, state: "active", revision: 1, digest: "b".repeat(64), body: raw, changedAt: payload.changedAt, receivedAt: NOW, activationRevision: 1, parentActivationRevision: 1, gap: false, ...(indexed ? marketplaceIndexFields(raw, "active", "offer", "catalog", NOW) : {}) })
    const moderationId = await ctx.db.insert("moderationContentStates", { networkId: f.root, targetKind: "commerceOffer", targetId: headId, ownerPageId: f.pageId, status: "published", createdAt: NOW, updatedAt: NOW })
    return { headId, moderationId }
  })
}
function read(f: Fixture, args: Partial<MarketplaceSearchArgs> = {}) { return f.as.query(search, { networkId: f.root, paginationOpts: { cursor: null, numItems: 24 }, ...args }) }
async function code(work: Promise<unknown>) { try { await work; return null } catch (error) { return engineErrorCode(error) } }

const FOOD_CATEGORIES = ["food.groceries", "food.beverages", "food.prepared"] as const
const foodFacets = (category: typeof FOOD_CATEGORIES[number] | "food") => ({ taxonomyVersion: 1 as const, categoryPath: category === "food" ? ["food"] as const : ["food", category] as const, attributes: [] })

/** Ces fixtures indexées éprouvent la recherche ; la réception signée est prouvée dans federation/commerceCatalog.test.ts. */
describe("SU06 — catégories alimentaires du catalogue reflété", () => {
  it("réunit les trois rayons sous food et garde chaque sélection enfant exclusive", async () => {
    const f = await fixture()
    for (const [index, category] of FOOD_CATEGORIES.entries()) await addOffer(f, index + 1, { title: "Produit classé par son émetteur", facets: foodFacets(category) })
    await addOffer(f, 4, { facets: foodFacets("food") })
    await addOffer(f, 5, { title: "Restaurant, épicerie et plats du jour", tags: ["food"], facets: { taxonomyVersion: 1, categoryPath: ["fashion"], attributes: [] } })
    await addOffer(f, 6, { title: "Poisson et boissons sans classement V2", tags: ["food", "épicerie"] })
    await addOffer(f, 7, { title: "Épicerie V1 sans classement", tags: ["food"] }, true, COMMERCE_PUBLIC_CONTRACT)
    expect((await read(f, { kind: "product" })).page.map(item => item.offerRef)).toEqual([1, 2, 3, 4, 5, 6, 7].map(ref))
    expect((await read(f, { kind: "product", category: ["food"] })).page.map(item => item.offerRef)).toEqual([1, 2, 3, 4].map(ref))
    for (const [index, category] of FOOD_CATEGORIES.entries()) {
      // Une sélection enfant ne s'accompagne pas de food : la facette compose ses valeurs par OU.
      expect((await read(f, { kind: "product", category: [category] })).page.map(item => item.offerRef)).toEqual([ref(index + 1)])
    }
    expect((await read(f, { kind: "product", category: ["food.groceries", "food.beverages"] })).page.map(item => item.offerRef)).toEqual([ref(1), ref(2)])
  })

  it("filtre food avant pagination et conserve la continuation d'une fenêtre vidée par la modération", async () => {
    const f = await fixture()
    for (let index = 1; index <= 30; index++) await addOffer(f, index, { facets: { taxonomyVersion: 1, categoryPath: ["fashion"], attributes: [] } })
    for (let index = 31; index <= 60; index++) {
      const offer = await addOffer(f, index, { facets: foodFacets("food.prepared") })
      if (index <= 54) await f.t.run(async ctx => ctx.db.patch(offer.moderationId, { status: "removed" }))
    }
    const first = await read(f, { kind: "product", category: ["food.prepared"] })
    expect(first).toMatchObject({ indexStatus: "ready", page: [], filteredWindow: true, isDone: false })
    expect(first.continueCursor).not.toBe("")
    const next = await read(f, { kind: "product", category: ["food.prepared"], paginationOpts: { cursor: first.continueCursor, numItems: 24 } })
    expect(next.page.map(item => item.offerRef)).toEqual([55, 56, 57, 58, 59, 60].map(ref))
    expect(next.isDone).toBe(true)
    expect(await code(read(f, { kind: "product", category: ["food.beverages"], paginationOpts: { cursor: first.continueCursor, numItems: 24 } }))).toBe("invalidArgument")
  })

  it.each(["parent", "link", "contract"] as const)("referme la racine et le rayon alimentaire après révocation %s sans effacer la tête", async gate => {
    const f = await fixture(), offer = await addOffer(f, 1, { facets: foodFacets("food.beverages") })
    expect((await read(f, { kind: "product", category: ["food.beverages"] })).page.map(item => item.offerRef)).toEqual([ref(1)])
    await f.t.run(async ctx => {
      if (gate === "parent") await ctx.db.patch(f.parentId, { state: "withdrawn" })
      if (gate === "link") await ctx.db.patch(f.linkId, { state: "revoked" })
      if (gate === "contract") {
        const parent = await ctx.db.get(f.parentId)
        const previous = JSON.parse(parent!.body) as Record<string, unknown>
        // Un parent V1 encore permis isole bien la révocation du contrat V2 de l'offre.
        await ctx.db.patch(f.parentId, { body: commerceCanonicalJson({ ...previous, contract: COMMERCE_PUBLIC_CONTRACT })! })
        await ctx.db.patch(f.emitterId, { allowedContracts: [COMMERCE_PUBLIC_CONTRACT] })
      }
    })
    for (const category of ["food", "food.beverages"] as const) expect((await read(f, { kind: "product", category: [category] })).page).toEqual([])
    expect(await f.t.run(ctx => ctx.db.get(offer.headId))).toMatchObject({ state: "active", category1: "food", category2: "food.beverages" })
  })
})

describe("MP03 — recherche globale et gardes actuelles", () => {
  it("trouve une offre classée au-delà de la première fenêtre brute avec filtres métier avant pagination", async () => {
    const f = await fixture()
    for (let index = 1; index <= 30; index++) await addOffer(f, index, { facets: { taxonomyVersion: 1, categoryPath: ["fashion", "fashion.men"], attributes: [{ key: "material", type: "text", value: "Coton" }] } })
    await addOffer(f, 31, { price: { mode: "fixed", currency: "XAF", amount: 2_800 }, facets: { taxonomyVersion: 1, categoryPath: ["fashion", "fashion.women", "fashion.women.clothing"], attributes: [{ key: "material", type: "text", value: "Lin" }, { key: "audience", type: "choice", value: "women" }] } })
    const result = await read(f, { category: "fashion.women", material: "LIN", audience: "women", minPrice: 2_500, maxPrice: 3_000 })
    expect(result.indexStatus).toBe("ready")
    expect(result.page.map(offer => offer.offerRef)).toEqual([ref(31)])
    expect(result.page[0]?.facets?.categoryPath).toEqual(["fashion", "fashion.women", "fashion.women.clothing"])
    expect((await read(f, { query: "elegante", sort: "relevance", material: "lin" })).page.map(offer => offer.offerRef)).toEqual([ref(31)])
  })

  it("conserve la continuation d'une page vidée par la modération et relit parent/liaison/contrat", async () => {
    const f = await fixture()
    for (let index = 1; index <= 30; index++) {
      const offer = await addOffer(f, index)
      if (index <= 24) await f.t.run(async ctx => ctx.db.patch(offer.moderationId, { status: "removed" }))
    }
    const first = await read(f)
    expect(first.page).toEqual([])
    expect(first.filteredWindow).toBe(true)
    expect(first.isDone).toBe(false)
    expect(first.continueCursor).not.toBe("")
    const next = await read(f, { paginationOpts: { cursor: first.continueCursor, numItems: 24 } })
    expect(next.page.map(offer => offer.offerRef)).toEqual([25, 26, 27, 28, 29, 30].map(ref))
    await f.t.run(async ctx => ctx.db.patch(f.parentId, { activationRevision: 2 }))
    expect((await read(f)).page).toEqual([])
    await f.t.run(async ctx => {
      const parent = await ctx.db.get(f.parentId)
      const previous = JSON.parse(parent!.body) as Record<string, unknown>
      // Le parent V1 reste admis : c'est bien l'autorisation exacte de l'offre V2 qui ferme sa projection.
      await ctx.db.patch(f.parentId, { activationRevision: 1, body: commerceCanonicalJson({ ...previous, contract: COMMERCE_PUBLIC_CONTRACT })! })
      await ctx.db.patch(f.emitterId, { allowedContracts: [COMMERCE_PUBLIC_CONTRACT] })
    })
    expect((await read(f)).page).toEqual([])
    await f.t.run(async ctx => { await ctx.db.patch(f.emitterId, { allowedContracts: [COMMERCE_PUBLIC_CONTRACT, COMMERCE_PUBLIC_CONTRACT_V2] }); await ctx.db.patch(f.linkId, { state: "revoked" }) })
    expect((await read(f)).page).toEqual([])
  })

  it("trie les prix publiés, écarte les devis d'un filtre prix et refuse un curseur d'une autre recherche", async () => {
    const f = await fixture()
    await addOffer(f, 1, { price: { mode: "fixed", currency: "XAF", amount: 10_000 } })
    await addOffer(f, 2, { price: { mode: "range", currency: "XAF", minAmount: 3_000, maxAmount: 6_000 } })
    await addOffer(f, 3, { price: { mode: "quote", currency: "XAF" } })
    expect((await read(f, { sort: "price_asc" })).page.map(offer => offer.offerRef)).toEqual([ref(2), ref(1), ref(3)])
    expect((await read(f, { sort: "price_desc" })).page.map(offer => offer.offerRef)).toEqual([ref(1), ref(2), ref(3)])
    expect((await read(f, { maxPrice: 4_000 })).page.map(offer => offer.offerRef)).toEqual([ref(2)])
    const first = await read(f, { paginationOpts: { cursor: null, numItems: 1 } })
    expect(await code(read(f, { sort: "price_asc", paginationOpts: { cursor: first.continueCursor, numItems: 1 } }))).toBe("invalidArgument")
    expect(await code(read(f, { paginationOpts: { cursor: "not-a-cursor", numItems: 1 } }))).toBe("invalidArgument")
    expect(await code(read(f, { query: "veste", sort: "price_asc" }))).toBe("invalidArgument")
    expect(await code(read(f, { query: Array.from({ length: 17 }, () => "a").join(" ") }))).toBe("invalidArgument")
    expect(await code(read(f, { category: "private-unknown" }))).toBe("invalidArgument")
    expect(await code(read(f, { minPrice: 5_000, maxPrice: 100 }))).toBe("invalidArgument")
  })

  it("filtre un réseau enfant avant pagination et garde le refus réseau indistinct", async () => {
    const f = await fixture()
    await addOffer(f, 1)
    expect(await code(f.as.query(search, { networkId: f.testClosed, paginationOpts: { cursor: null, numItems: 24 } }))).toBe("notFound")
    await f.t.run(async ctx => ctx.db.insert("networkMemberships", { networkId: f.testClosed, personId: f.personId, status: "declaree", role: "member", joinedAt: NOW, statusChangedAt: NOW }))
    const child = await f.as.query(search, { networkId: f.testClosed, paginationOpts: { cursor: null, numItems: 24 } })
    expect(child.page).toEqual([])
    expect(child.isDone).toBe(true)
    expect((await read(f)).page).toHaveLength(1)
  })
})

describe("MP04 — facettes multiples et recherche canonique", () => {
  it("applique OU dans chaque facette et ET entre facettes avant la fenêtre paginée", async () => {
    const f = await fixture()
    for (let index = 1; index <= 30; index++) await addOffer(f, index, { facets: { taxonomyVersion: 1, categoryPath: ["fashion", "fashion.kids"], attributes: [{ key: "material", type: "text", value: "Coton" }] } })
    await addOffer(f, 31, { facets: { taxonomyVersion: 1, categoryPath: ["fashion", "fashion.women", "fashion.women.clothing"], attributes: [{ key: "brand", type: "text", value: "Élan" }, { key: "material", type: "text", value: "Lin" }, { key: "color", type: "text", value: "Bleu" }, { key: "audience", type: "choice", value: "women" }] } })
    await addOffer(f, 32, { facets: { taxonomyVersion: 1, categoryPath: ["fashion", "fashion.men", "fashion.men.clothing"], attributes: [{ key: "brand", type: "text", value: "Atelier" }, { key: "material", type: "text", value: "Coton" }, { key: "color", type: "text", value: "Vert" }, { key: "audience", type: "choice", value: "men" }] } })
    await addOffer(f, 33, { facets: { taxonomyVersion: 1, categoryPath: ["fashion", "fashion.women"], attributes: [{ key: "brand", type: "text", value: "Autre marque" }, { key: "material", type: "text", value: "Lin" }, { key: "color", type: "text", value: "Bleu" }, { key: "audience", type: "choice", value: "women" }] } })
    const filters = { category: ["fashion.women", "fashion.men"], brand: ["ELAN", "atelier"], material: ["LIN", "coton"], color: ["bleu", "vert"], audience: ["women", "men"] as Array<"women" | "men"> }
    expect((await read(f, filters)).page.map(item => item.offerRef)).toEqual([ref(31), ref(32)])
    expect((await read(f, { ...filters, query: "élégante" })).page.map(item => item.offerRef).sort()).toEqual([ref(31), ref(32)])
    await addOffer(f, 34, { kind: "service", facets: { taxonomyVersion: 1, categoryPath: ["services", "services.digital"], attributes: [{ key: "serviceMode", type: "choice", value: "remote" }] } })
    await addOffer(f, 35, { kind: "service", facets: { taxonomyVersion: 1, categoryPath: ["services", "services.creative"], attributes: [{ key: "serviceMode", type: "choice", value: "hybrid" }] } })
    expect((await read(f, { kind: "service", category: "services", serviceMode: ["remote", "onsite"] })).page.map(item => item.offerRef)).toEqual([ref(34)])
  })

  it("lie la continuation à la sélection normalisée plutôt qu'à l'ordre ou aux doublons", async () => {
    const f = await fixture()
    for (let index = 1; index <= 3; index++) await addOffer(f, index, { facets: { taxonomyVersion: 1, categoryPath: ["fashion", "fashion.women"], attributes: [{ key: "brand", type: "text", value: "Élan" }, { key: "material", type: "text", value: "Lin" }] } })
    const first = await read(f, { brand: [" ÉLAN ", "autre", "elan"], material: " LIN ", paginationOpts: { cursor: null, numItems: 1 } })
    const next = await read(f, { brand: ["autre", "elan"], material: ["lin", "LIN"], paginationOpts: { cursor: first.continueCursor, numItems: 1 } })
    expect(next.page.map(item => item.offerRef)).toEqual([ref(2)])
    expect(await code(read(f, { brand: "autre", material: "lin", paginationOpts: { cursor: first.continueCursor, numItems: 1 } }))).toBe("invalidArgument")
    const canonical = marketplaceFiltersOf({ brand: [" Élan ", "elan", "Atelier"], material: " Lin " })
    expect(canonical).toMatchObject({ brand: ["atelier", "elan"], material: ["lin"] })
    expect(marketplaceFiltersOf({ brand: "Élan" })).toEqual(marketplaceFiltersOf({ brand: ["elan", "ÉLAN"] }))
  })

  it("refuse les sélections vides, trop longues ou inconnues et les textes hors limites", async () => {
    const f = await fixture()
    for (const args of [
      { brand: [] }, { material: Array.from({ length: 7 }, (_, i) => `matiere-${i}`) },
      { color: [" "] }, { category: ["fashion", "private-unknown"] },
      { query: "mot ".repeat(17) }, { query: Array.from({ length: 17 }, () => "a").join("-") }, { query: "a".repeat(121) }, { query: "!!!" },
      { minPrice: -1 }, { maxPrice: Number.MAX_SAFE_INTEGER },
    ]) expect(await code(read(f, args))).toBe("invalidArgument")
    expect((await read(f, { query: Array.from({ length: 16 }, () => "a").join(" ") })).page).toEqual([])
  })
})

describe("MP03 — reprise de construction par génération", () => {
  it("reste fermée sans état prêt, avance par tranches et ignore une tâche ancienne ou rejouée", async () => {
    const f = await fixture(false)
    for (let index = 1; index <= 31; index++) await addOffer(f, index, {}, false)
    expect(await read(f)).toEqual({ indexStatus: "building", page: [], isDone: true, continueCursor: "", filteredWindow: false })
    const initial = await f.t.mutation(start, { networkId: f.root })
    await f.t.mutation(build, { networkId: f.root, generation: initial.generation, cursor: null })
    const first = await f.t.run(async ctx => ctx.db.query("commerceCatalogIndexes").withIndex("by_network", q => q.eq("networkId", f.root)).unique())
    expect(first?.status).toBe("building")
    expect(first?.cursor).toBeTruthy()
    expect((await read(f)).indexStatus).toBe("building")
    const replacement = await f.t.mutation(start, { networkId: f.root })
    expect(replacement.generation).toBe(initial.generation + 1)
    await f.t.mutation(build, { networkId: f.root, generation: initial.generation, cursor: first!.cursor! })
    let current = await f.t.run(async ctx => ctx.db.query("commerceCatalogIndexes").withIndex("by_network", q => q.eq("networkId", f.root)).unique())
    expect(current).toMatchObject({ generation: replacement.generation, status: "building" })
    expect(current?.cursor).toBeUndefined()
    for (let step = 0; step < 10 && current?.status !== "ready"; step++) {
      const cursor = current?.cursor ?? null
      await f.t.mutation(build, { networkId: f.root, generation: replacement.generation, cursor })
      // Le même job ne passe pas deux fois le CAS de son ancien curseur.
      await f.t.mutation(build, { networkId: f.root, generation: replacement.generation, cursor })
      current = await f.t.run(async ctx => ctx.db.query("commerceCatalogIndexes").withIndex("by_network", q => q.eq("networkId", f.root)).unique())
    }
    expect(current?.status).toBe("ready")
    const result = await read(f)
    expect(result.page).toHaveLength(24)
    expect(result.isDone).toBe(false)
    expect((await read(f, { paginationOpts: { cursor: result.continueCursor, numItems: 24 } })).page).toHaveLength(7)
    expect(await code(f.t.mutation(start, { networkId: f.testClosed }))).toBe("notFound")
  })
})


const SERVICE_PROFILE: CommerceServiceProfile = { version: 1, commercialModes: ["quote", "booking"], languageCodes: ["fr-GA", "en"], zones: [{ countryCode: "GA", locality: "Île témoin" }], deliverables: ["Rapport"], inclusions: ["Diagnostic"], exclusions: [], portfolio: [{ title: "Projet public", description: "Réalisation publique", mediaIndexes: [] }] }
describe("MP06 — recherche de prestations déclarées", () => {
  it("applique modes, langues, zones et durées avant pagination au-delà d'une première fenêtre", async () => {
    const f = await fixture()
    for (let index = 1; index <= 28; index++) await addOffer(f, index, { kind: "service", serviceProfile: { ...SERVICE_PROFILE, commercialModes: ["quote"], languageCodes: ["en"], zones: [{ countryCode: "GA", locality: "Owendo" }] } })
    await addOffer(f, 29, { kind: "service", serviceProfile: SERVICE_PROFILE, facets: { taxonomyVersion: 1, categoryPath: ["services", "services.digital"], attributes: [{ key: "durationMinutes", type: "number", value: 90 }] } })
    const filters = { kind: "service" as const, commercialMode: ["booking", "fixed_order"] as Array<"booking" | "fixed_order">, languageCode: ["FR-ga", "pt"], serviceZone: ["ÎLE TÉMOIN", "Libreville"], minDurationMinutes: 60, maxDurationMinutes: 120 }
    const result = await read(f, filters)
    expect(result.page.map(item => item.offerRef)).toEqual([ref(29)])
    expect(result.page[0]?.serviceProfile).toEqual(SERVICE_PROFILE)
    expect((await read(f, { ...filters, query: "realisation" })).page.map(item => item.offerRef)).toEqual([ref(29)])
    expect((await read(f, { ...filters, maxDurationMinutes: 80 })).page).toEqual([])
  })
  it("garde les services hérités consultables mais inconnus pour les nouveaux filtres", async () => {
    const f = await fixture()
    await addOffer(f, 1, { kind: "service", zone: "Libreville", price: { mode: "quote", currency: "XAF" } })
    expect((await read(f, { kind: "service" })).page).toHaveLength(1)
    for (const filters of [{ commercialMode: "quote" as const }, { languageCode: "fr" }, { serviceZone: "Libreville" }, { minDurationMinutes: 1 }]) expect((await read(f, { kind: "service", ...filters })).page).toEqual([])
  })
  it("n'admet pas un ancien état ready comme preuve de la nouvelle génération de champs", async () => {
    const f = await fixture()
    await addOffer(f, 1, { kind: "service", serviceProfile: SERVICE_PROFILE })
    await f.t.run(async ctx => { const state = await ctx.db.query("commerceCatalogIndexes").withIndex("by_network", q => q.eq("networkId", f.root)).unique(); await ctx.db.patch(state!._id, { version: undefined }) })
    expect(await read(f, { kind: "service", commercialMode: "booking" })).toMatchObject({ indexStatus: "building", page: [] })
    const started = await f.t.mutation(start, { networkId: f.root })
    await f.t.mutation(build, { networkId: f.root, generation: started.generation, cursor: null })
    expect((await read(f, { kind: "service", commercialMode: "booking" })).page.map(item => item.offerRef)).toEqual([ref(1)])
  })
  it("normalise les signatures et ferme les langues, zones, modes et durées invalides", async () => {
    const f = await fixture()
    await addOffer(f, 1, { kind: "service", serviceProfile: SERVICE_PROFILE }); await addOffer(f, 2, { kind: "service", serviceProfile: SERVICE_PROFILE })
    const first = await read(f, { kind: "service", languageCode: "FR-ga", serviceZone: "Île témoin", paginationOpts: { cursor: null, numItems: 1 } })
    expect((await read(f, { kind: "service", languageCode: ["fr-GA"], serviceZone: ["ile temoin"], paginationOpts: { cursor: first.continueCursor, numItems: 1 } })).page.map(item => item.offerRef)).toEqual([ref(2)])
    expect(await code(read(f, { kind: "service", languageCode: "en", paginationOpts: { cursor: first.continueCursor, numItems: 1 } }))).toBe("invalidArgument")
    for (const args of [{ languageCode: "bad_language" }, { languageCode: Array.from({ length: 7 }, () => "fr") }, { serviceZone: "https://private.example" }, { serviceZone: "x".repeat(121) }, { minDurationMinutes: 0 }, { maxDurationMinutes: 43201 }, { minDurationMinutes: 90, maxDurationMinutes: 30 }]) expect(await code(read(f, { kind: "service", ...args }))).toBe("invalidArgument")
  })
})

it("MP06 — l'annuaire consulte les profils publiés sans ouvrir demandes, commandes ou rendez-vous P14", async () => {
  const f = await fixture()
  expect(commerceActivationReady("services")).toBe(false)
  await addOffer(f, 1, { kind: "service", serviceProfile: { ...SERVICE_PROFILE, commercialModes: ["quote", "booking", "fixed_order"] } })
  // Même une ligne de politique permissive ne remplace pas la décision d'activation.
  const threadId = await f.t.run(async ctx => {
    await ctx.db.insert("commerceServicePolicies", { networkId: f.root, enabled: true, updatedAt: NOW })
    await ctx.db.patch(f.linkId, { permissions: ["publish_catalog", "receive_inquiries", "receive_bookings", "receive_orders"] })
    return await ctx.db.insert("commercialThreads", { networkId: f.root, shopId: f.shopId, requesterPersonId: f.personId, offerRef: ref(1), conversationRef: `antsia:conv:${"c".repeat(64)}`, state: "accepted", revision: 2, buyerCallsAllowed: false, createdAt: NOW, updatedAt: NOW, lastMessageAt: NOW })
  })
  const result = await f.as.query(searchServices, { networkId: f.root, languageCode: "FR-ga", paginationOpts: { cursor: null, numItems: 1 } })
  expect(result).toMatchObject({ indexStatus: "ready", isDone: true, page: [{ offerRef: ref(1), serviceProfile: { commercialModes: ["quote", "booking", "fixed_order"] }, actions: { quote: false, purchase: false } }] })
  expect(await f.as.query(api.modules.shops.services.discoverServices, { networkId: f.root, paginationOpts: { cursor: null, numItems: 1 } })).toMatchObject({ page: [], isDone: true })
  expect(await f.as.action(api.modules.shops.serviceActions.options, { networkId: f.root, handle: "marketplace-shop", offerRef: ref(1) })).toEqual({ outcome: "unavailable" })
  expect(await f.as.action(api.modules.shops.serviceActions.requestQuote, { networkId: f.root, handle: "marketplace-shop", offerRef: ref(1), threadId, need: "Un diagnostic public à préciser", attachmentMessageIds: [], consentTextVersion: COMMERCE_INQUIRY_CONSENT_VERSION, clientRequestId: "mp06-quote-closed-0001" })).toEqual({ outcome: "refused" })
  expect(await f.as.action(api.modules.shops.serviceActions.book, { networkId: f.root, handle: "marketplace-shop", offerRef: ref(1), serviceRef: `pro.ga:agenda_service:${"0".repeat(25)}1`, serviceLabel: "Diagnostic", startAt: NOW + 86_400_000, endAt: NOW + 86_400_000 + 3_600_000, consentTextVersion: COMMERCE_SERVICE_CONSENTS.booking.textVersion, clientRequestId: "mp06-booking-closed-0001" })).toEqual({ outcome: "refused" })
  expect(await f.as.action(api.modules.shops.serviceActions.orderService, { networkId: f.root, handle: "marketplace-shop", offerRef: ref(1), quantity: 1, expectedUnitAmount: { amount: 100, currency: "XAF" }, expectedCatalogRevision: 1, consentTextVersion: COMMERCE_SERVICE_CONSENTS.service_order.textVersion, clientRequestId: "mp06-order-closed-0001" })).toEqual({ outcome: "refused" })
  expect(await f.t.run(async ctx => ({ requests: await ctx.db.query("commerceServiceRequests").take(1), commands: await ctx.db.query("commerceServiceCommands").take(1) }))).toEqual({ requests: [], commands: [] })
})

it("MP06 — l'annuaire pagine les services sans fenêtre de boutiques ou de produits et relit la capacité locale", async () => {
  const f = await fixture()
  for (let index = 1; index <= 26; index++) await addOffer(f, index)
  await addOffer(f, 27, { kind: "service", serviceProfile: SERVICE_PROFILE })
  await addOffer(f, 28, { kind: "service", serviceProfile: SERVICE_PROFILE })
  const args = { networkId: f.root, paginationOpts: { cursor: null, numItems: 1 } }
  const first = await f.as.query(searchServices, args)
  expect(first.page.map(item => item.offerRef)).toEqual([ref(27)])
  expect(first.isDone).toBe(false)
  expect((await f.as.query(searchServices, { ...args, paginationOpts: { cursor: first.continueCursor, numItems: 1 } })).page.map(item => item.offerRef)).toEqual([ref(28)])
  expect(await code(f.as.query(searchServices, { ...args, kind: "product" }))).toBe("invalidArgument")
  await f.t.run(async ctx => ctx.db.patch(f.shopId, { activityConfiguration: { version: 1, capabilities: ["products"], template: "general", blocks: ["catalog", "about"] } }))
  expect(await f.as.query(searchServices, args)).toMatchObject({ page: [], filteredWindow: true })
  expect((await read(f, { kind: "product" })).page).toHaveLength(24)
})
