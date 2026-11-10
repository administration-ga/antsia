import { getFunctionName } from "convex/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { DEMO_BACKEND_HOST, DEMO_DEPLOYMENT_NAME } from "@/lib/demo-backend"
import { catalogOfferFixture, catalogPageFixture, COLLECTION_REF, OFFER_REF } from "@/components/shops/__tests__/catalog-fixtures"

const mocks = vi.hoisted(() => ({ query: vi.fn(), viewer: vi.fn() }))
vi.mock("convex/nextjs", () => ({ fetchQuery: mocks.query }))
vi.mock("./server-session", () => ({ getServerViewer: mocks.viewer, withinBridgeDeadline: (work: () => Promise<unknown>) => work(), configuredMetadataOrigin: () => "https://antsia.ga" }))

import { catalogOfferSchema, catalogPageSchema, loadPublicCatalog, loadPublicOffer, loadPublicPostOffer } from "./public-catalog-data"
import { DEMO_CATALOG_DECLARATIONS } from "./demo-catalog-projection"

beforeEach(() => {
  mocks.query.mockReset(); mocks.viewer.mockReset()
  mocks.viewer.mockResolvedValue({ status: "anonymous" })
  vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", "http://localhost:3210")
})
afterEach(() => { vi.unstubAllEnvs() })

function demoOfferFixture() {
  return catalogOfferFixture({
    offerRef: "demo:offer:epicerie-produits", shopHandle: "epicerie-moussavou-demo",
    collections: [{ collectionRef: "demo:collection:epicerie-moussavou-demo", label: "Produits de démonstration" }],
    variantAxes: [], variants: [], media: [{ url: "/demo-media/animation-20261020/epicerie-produits.png", altText: "Illustration générée pour la démonstration", width: null, height: null, withheld: null }],
    availability: { state: "unknown", indicative: true, updatedAt: null, stale: false },
  })
}

function fashionFacetsFixture(): NonNullable<ReturnType<typeof catalogOfferFixture>["facets"]> {
  return { taxonomyVersion: 1, categoryPath: ["fashion", "fashion.women", "fashion.women.clothing"], attributes: [{ key: "material", type: "text", value: "Lin" }, { key: "audience", type: "choice", value: "women" }] }
}

describe("catalogue SSR — projection strictement allowlistée", () => {
  it("MP06 : valide le profil avec le manifeste exact de la même offre", () => {
    const profile = { version: 1, commercialModes: ["quote"], languageCodes: ["fr"], zones: [{ countryCode: "GA", locality: "Libreville" }], deliverables: [], inclusions: [], exclusions: [], portfolio: [{ title: "Réalisation", description: "Présentation déclarée", mediaIndexes: [0] }] }
    const offer = catalogOfferFixture({ kind: "service", variants: [], variantAxes: [] })
    expect(catalogOfferSchema.safeParse({ ...offer, serviceProfile: profile }).success).toBe(true)
    for (const candidate of [{ ...profile, tenantId: "private" }, { ...profile, languageCodes: ["fr-fr"] }, { ...profile, portfolio: [{ ...profile.portfolio[0], mediaIndexes: [1] }] }, { ...profile, commercialModes: ["fixed_order"], deliverables: [] }]) expect(catalogOfferSchema.safeParse({ ...offer, serviceProfile: candidate }).success).toBe(false)
    expect(catalogOfferSchema.safeParse({ ...offer, kind: "product", serviceProfile: profile }).success).toBe(false)
    expect(catalogOfferSchema.safeParse({ ...demoOfferFixture(), serviceProfile: profile }).success).toBe(false)
  })
  it("admet le DTO gelé et refuse chaque champ privé même imbriqué", () => {
    const offer = catalogOfferFixture()
    expect(catalogOfferSchema.safeParse(offer).success).toBe(true)
    for (const extra of [{ linkRef: "private" }, { source: "private" }, { stockQuantity: 10 }, { proUrl: "https://pro.example/gestion" }, { pageId: "private" }]) expect(catalogOfferSchema.safeParse({ ...offer, ...extra }).success).toBe(false)
    expect(catalogOfferSchema.safeParse({ ...offer, variants: [{ ...offer.variants[0], stockQuantity: 2 }] }).success).toBe(false)
    expect(catalogOfferSchema.safeParse({ ...offer, actions: { ...offer.actions, purchase: true } }).success).toBe(false)
  })
  it("refuse prix fractionnaire, devis chiffré, intervalle inversé et protocole média actif", () => {
    const offer = catalogOfferFixture()
    for (const price of [{ mode: "fixed", amount: 1.5, currency: "XAF" }, { mode: "quote", amount: 0, currency: "XAF" }, { mode: "range", minAmount: 20, maxAmount: 10, currency: "XAF" }]) expect(catalogOfferSchema.safeParse({ ...offer, price }).success).toBe(false)
    expect(catalogOfferSchema.safeParse({ ...offer, media: [{ ...offer.media[0], url: "javascript:alert(1)" }] }).success).toBe(false)
    expect(catalogPageSchema.safeParse(catalogPageFixture({ page: Array.from({ length: 13 }, () => offer) })).success).toBe(false)
    expect(catalogPageSchema.safeParse({ ...catalogPageFixture(), privateCursorData: "forbidden" }).success).toBe(false)
  })
  it("préserve handoff et refus de session sans consultation anonyme", async () => {
    expect(await loadPublicCatalog("atelier", {}, null, true)).toEqual({ status: "handoff" })
    expect(mocks.viewer).not.toHaveBeenCalled()
    mocks.viewer.mockResolvedValue({ status: "refused" })
    expect(await loadPublicCatalog("atelier", {}, null, false)).toEqual({ status: "refused" })
    expect(await loadPublicOffer("atelier", OFFER_REF)).toEqual({ status: "refused" })
    expect(mocks.query).not.toHaveBeenCalled()
  })
  it("une panne de session ne se transforme pas en lecture publique", async () => {
    mocks.viewer.mockResolvedValue({ status: "unavailable" })
    expect(await loadPublicCatalog("atelier")).toEqual({ status: "unavailable" })
    expect(await loadPublicPostOffer("post-test")).toEqual({ status: "unavailable" })
    expect(mocks.query).not.toHaveBeenCalled()
  })
  it("transmet le réseau, la fenêtre, les filtres et le bearer uniquement à la projection serveur", async () => {
    mocks.viewer.mockResolvedValue({ status: "authenticated", token: "TEST-JWT" })
    mocks.query.mockImplementation(async (reference, args, options) => {
      if (getFunctionName(reference).endsWith(":getBySlug")) return { _id: "root-test" }
      expect(getFunctionName(reference)).toBe("modules/public/catalog:list")
      expect(args).toEqual({ networkId: "root-test", handle: "atelier", kind: "service", collectionRef: COLLECTION_REF, query: "couture", paginationOpts: { cursor: "page-2", numItems: 12 } })
      expect(options.token).toBe("TEST-JWT")
      return catalogPageFixture()
    })
    expect(await loadPublicCatalog("atelier", { kind: "service", collectionRef: COLLECTION_REF, query: "couture" }, "page-2")).toEqual({ status: "ready", data: catalogPageFixture(), viewer: "authenticated" })
  })
  it("conserve un retrait sous null et refuse un DTO élargi", async () => {
    mocks.query.mockImplementation(async (reference) => getFunctionName(reference).endsWith(":getBySlug") ? { _id: "root-test" } : null)
    expect(await loadPublicOffer("atelier", OFFER_REF)).toEqual({ status: "ready", data: null, viewer: "anonymous" })
    mocks.query.mockImplementation(async (reference) => getFunctionName(reference).endsWith(":getBySlug") ? { _id: "root-test" } : { ...catalogOfferFixture(), source: "private" })
    expect(await loadPublicOffer("atelier", OFFER_REF)).toEqual({ status: "unavailable" })
  })
  it("refuse un catalogue contenant un champ privé", async () => {
    mocks.query.mockImplementation(async (reference) => getFunctionName(reference).endsWith(":getBySlug") ? { _id: "root-test" } : { ...catalogPageFixture(), privateCursorData: "forbidden" })
    const filters = { kind: "service" as const, collectionRef: COLLECTION_REF, query: "couture" }
    expect(await loadPublicCatalog("atelier", { ...filters }, "page-2")).toEqual({ status: "unavailable" })
  })
})

describe("catalogue SSR — projection illustrative de démonstration", () => {
  it.each(["http://localhost:3210", "http://127.0.0.1:3210", "http://localhost:3260", "http://127.0.0.1:3260", `https://${DEMO_BACKEND_HOST}`])("admet le registre fermé des déclarations uniquement sur %s", (backendUrl) => {
    vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", backendUrl)
    for (const declaration of DEMO_CATALOG_DECLARATIONS) {
      const base = demoOfferFixture()
      const offer = { ...base, offerRef: declaration.offerRef, shopHandle: declaration.shopHandle, kind: declaration.kind, collections: [{ collectionRef: declaration.collectionRef, label: "Démonstration" }], media: [{ ...base.media[0]!, url: declaration.imagePath }] }
      expect(catalogOfferSchema.safeParse(offer).success).toBe(true)
      expect(catalogPageSchema.safeParse(catalogPageFixture({ page: [offer], collections: offer.collections })).success).toBe(true)
    }
  })
  it.each(["https://production.convex.cloud", "https://other.convex.cloud", `https://${DEMO_BACKEND_HOST}.evil.test`, `https://${DEMO_BACKEND_HOST}@evil.test`, `https://${DEMO_BACKEND_HOST}:444`, "http://localhost:3211"])("refuse la démo sur %s et conserve le contrat PRO.GA", (backendUrl) => {
    vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", backendUrl)
    vi.stubEnv("ANTSIA_DEMO_DEPLOYMENT", DEMO_DEPLOYMENT_NAME)
    expect(catalogOfferSchema.safeParse(demoOfferFixture()).success).toBe(false)
    expect(catalogPageSchema.safeParse(catalogPageFixture({ page: [], collections: demoOfferFixture().collections })).success).toBe(false)
    expect(catalogOfferSchema.safeParse(catalogOfferFixture({ media: [{ url: "https://assets.example.test/catalogue/image.png", altText: "Produit", width: 800, height: 800, withheld: null }] })).success).toBe(true)
  })
  it("refuse toute incohérence offre, boutique, collection, image, variante ou action", () => {
    const offer = demoOfferFixture()
    const mismatches = [
      { offerRef: "demo:offer:inconnue" }, { offerRef: OFFER_REF }, { shopHandle: "studio-objectif-demo" }, { kind: "service" },
      { collections: [{ collectionRef: "demo:collection:atelier-tech-demo", label: "Autre" }] },
      { variants: catalogOfferFixture().variants }, { variantAxes: ["Couleur"] },
      { actions: { contact: true, quote: false, purchase: false } }, { actions: { contact: false, quote: true, purchase: false } },
      ...["/demo-media/animation-20261020/panier-raphia.png", "/demo-media/animation-20261020/association-lecture.png", "/demo-media/autre.png", "//evil.test/image.png", "https://assets.example.test/image.png", null].map((url) => ({ media: [{ ...offer.media[0]!, url }] })),
    ]
    for (const mismatch of mismatches) expect(catalogOfferSchema.safeParse({ ...offer, ...mismatch }).success).toBe(false)
    expect(catalogPageSchema.safeParse(catalogPageFixture({ page: [offer] })).success).toBe(false)
    expect(catalogOfferSchema.safeParse({ ...catalogOfferFixture(), media: offer.media }).success).toBe(false)
  })
  it("fait traverser la porte SSR anonyme au catalogue, à la fiche et à la carte du fil", async () => {
    const offer = demoOfferFixture(), page = catalogPageFixture({ page: [offer], collections: offer.collections })
    mocks.query.mockImplementation(async (reference) => {
      const name = getFunctionName(reference)
      return name.endsWith(":getBySlug") ? { _id: "root-test" } : name.endsWith(":list") ? page : offer
    })
    expect(await loadPublicCatalog(offer.shopHandle)).toEqual({ status: "ready", data: page, viewer: "anonymous" })
    expect(await loadPublicOffer(offer.shopHandle, offer.offerRef)).toEqual({ status: "ready", data: offer, viewer: "anonymous" })
    expect(await loadPublicPostOffer("demo-post")).toEqual({ status: "ready", data: offer, viewer: "anonymous" })
  })
})

describe("MP03 — facettes publiques PRO.GA strictes", () => {
  it("conserve les anciennes offres sans facettes et admet les facettes produit ou service compatibles", () => {
    const legacy = catalogOfferSchema.parse(catalogOfferFixture())
    expect(legacy).not.toHaveProperty("facets")
    const product = catalogOfferFixture({ facets: fashionFacetsFixture() })
    expect(catalogOfferSchema.parse(product)).toEqual(product)
    const service = catalogOfferFixture({ kind: "service", facets: { taxonomyVersion: 1, categoryPath: ["services", "services.digital"], attributes: [{ key: "serviceMode", type: "choice", value: "remote" }, { key: "durationMinutes", type: "number", value: 60 }] } })
    expect(catalogOfferSchema.parse(service)).toEqual(service)
  })

  it("refuse les deux incompatibilités entre type d'offre et catégorie", () => {
    expect(catalogOfferSchema.safeParse(catalogOfferFixture({ kind: "service", facets: fashionFacetsFixture() })).success).toBe(false)
    expect(catalogOfferSchema.safeParse(catalogOfferFixture({ facets: { taxonomyVersion: 1, categoryPath: ["services", "services.digital"], attributes: [] } })).success).toBe(false)
  })

  it.each([
    { name: "objet incomplet sans chemin", facets: {} },
    { name: "version inconnue", facets: { ...fashionFacetsFixture(), taxonomyVersion: 2 } },
    { name: "chemin vide", facets: { ...fashionFacetsFixture(), categoryPath: [] } },
    { name: "parent intermédiaire sauté", facets: { ...fashionFacetsFixture(), categoryPath: ["fashion", "fashion.women.clothing"] } },
    { name: "branche étrangère", facets: { ...fashionFacetsFixture(), categoryPath: ["fashion", "fashion.women", "fashion.men.clothing"] } },
    { name: "attribut répété", facets: { ...fashionFacetsFixture(), attributes: [{ key: "material", type: "text", value: "Lin" }, { key: "material", type: "text", value: "Coton" }] } },
    { name: "type d'attribut erroné", facets: { ...fashionFacetsFixture(), attributes: [{ key: "ecoLabel", type: "text", value: "true" }] } },
    { name: "durée hors borne", facets: { taxonomyVersion: 1, categoryPath: ["services"], attributes: [{ key: "durationMinutes", type: "number", value: 43_201 }] } },
    { name: "texte hors borne", facets: { ...fashionFacetsFixture(), attributes: [{ key: "brand", type: "text", value: "A".repeat(81) }] } },
    { name: "champ de gestion imbriqué", facets: { ...fashionFacetsFixture(), attributes: [{ key: "material", type: "text", value: "Lin", stockQuantity: 2 }] } },
    { name: "valeur privée imbriquée", facets: { ...fashionFacetsFixture(), attributes: [{ key: "brand", type: "text", value: { costPrice: 12 } }] } },
    { name: "champ privé dans la facette", facets: { ...fashionFacetsFixture(), source: { shopId: "private" } } },
  ])("refuse sans lever une exception : $name", ({ facets }) => {
    expect(catalogOfferSchema.safeParse({ ...catalogOfferFixture(), facets }).success).toBe(false)
  })

  it.each(["http://localhost:3210", `https://${DEMO_BACKEND_HOST}`])("une offre de démonstration ne peut pas revendiquer des facettes PRO.GA sur %s", (backendUrl) => {
    vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", backendUrl)
    const demo = demoOfferFixture()
    expect(catalogOfferSchema.safeParse(demo).success).toBe(true)
    expect(catalogOfferSchema.safeParse({ ...demo, facets: fashionFacetsFixture() }).success).toBe(false)
    expect(catalogPageSchema.safeParse({ ...catalogPageFixture({ page: [demo], collections: demo.collections }), page: [{ ...demo, facets: fashionFacetsFixture() }] }).success).toBe(false)
  })

  it("conserve les facettes dans la fiche, le catalogue et la carte du fil lors de la projection SSR", async () => {
    const offer = catalogOfferFixture({ facets: fashionFacetsFixture() })
    const page = catalogPageFixture({ page: [offer] })
    mocks.query.mockImplementation(async (reference) => {
      const name = getFunctionName(reference)
      return name.endsWith(":getBySlug") ? { _id: "root-test" } : name.endsWith(":list") ? page : offer
    })
    expect(await loadPublicOffer(offer.shopHandle, offer.offerRef)).toEqual({ status: "ready", data: offer, viewer: "anonymous" })
    expect(await loadPublicCatalog(offer.shopHandle)).toEqual({ status: "ready", data: page, viewer: "anonymous" })
    expect(await loadPublicPostOffer("classified-post")).toEqual({ status: "ready", data: offer, viewer: "anonymous" })
  })

  it("une facette privée n'est ni nettoyée ni rendue par les lecteurs SSR", async () => {
    const offer = { ...catalogOfferFixture(), facets: { ...fashionFacetsFixture(), attributes: [{ key: "material", type: "text", value: "Lin", private: { stockQuantity: 2 } }] } }
    mocks.query.mockImplementation(async (reference) => {
      const name = getFunctionName(reference)
      return name.endsWith(":getBySlug") ? { _id: "root-test" } : name.endsWith(":list") ? { ...catalogPageFixture(), page: [offer] } : offer
    })
    expect(await loadPublicOffer("atelier", OFFER_REF)).toEqual({ status: "unavailable" })
    expect(await loadPublicCatalog("atelier")).toEqual({ status: "unavailable" })
    expect(await loadPublicPostOffer("invalid-classified-post")).toEqual({ status: "unavailable" })
  })
})


describe("MP05d — contrat SSR des filtres et migration", () => {
  it("admet uniquement les états d'index fermés, sans champ de gestion", () => {
    expect(catalogPageSchema.safeParse(catalogPageFixture({ indexStatus: "building" })).success).toBe(true)
    expect(catalogPageSchema.safeParse({ ...catalogPageFixture(), indexStatus: "all" }).success).toBe(false)
  })
  it("passe les facettes, les prix et le tri à la même API publique sous bearer", async () => {
    mocks.viewer.mockResolvedValue({ status: "authenticated", token: "TEST-JWT" })
    const filters = { category: ["fashion.women"], brand: ["Maison"], material: ["Lin"], audience: ["women"] as Array<"women">, minPrice: 0, maxPrice: 25000, sort: "price_asc" as const }
    mocks.query.mockImplementation(async (reference, args, options) => {
      if (getFunctionName(reference).endsWith(":getBySlug")) return { _id: "root-test" }
      expect(getFunctionName(reference)).toBe("modules/public/catalog:list")
      expect(args).toEqual({ networkId: "root-test", handle: "atelier", ...filters, paginationOpts: { cursor: "next", numItems: 12 } })
      expect(options.token).toBe("TEST-JWT")
      return catalogPageFixture()
    })
    expect((await loadPublicCatalog("atelier", filters, "next")).status).toBe("ready")
  })
})
