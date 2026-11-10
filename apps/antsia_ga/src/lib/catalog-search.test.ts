import { afterEach, describe, expect, it, vi } from "vitest"
import { COLLECTION_REF, OFFER_REF } from "@/components/shops/__tests__/catalog-fixtures"
import { catalogFilters, catalogSearch, catalogSearchFromParams } from "./catalog-search"
import { routes } from "./routes"

afterEach(() => { vi.unstubAllEnvs() })

describe("filtres et routes catalogue bornés", () => {
  it("normalise une recherche sans inventer de filtre ou de curseur", () => {
    expect(catalogSearch({})).toEqual({ cursor: null })
    expect(catalogSearch({ type: "service", collection: COLLECTION_REF, recherche: "  couture  ", curseur: "page-2" })).toEqual({ kind: "service", collectionRef: COLLECTION_REF, query: "couture", cursor: "page-2" })
  })
  it("refuse filtres répétés, type inconnu, référence privée et entrées trop longues", () => {
    for (const value of [{ type: ["product", "service"] }, { type: "job" }, { collection: "convex-id" }, { recherche: "x".repeat(121) }, { recherche: "bad\nquery" }, { curseur: "x".repeat(8193) }]) expect(catalogSearch(value)).toBeNull()
  })
  it("encode chaque segment et conserve les filtres sur la pagination sans URL libre", () => {
    expect(routes.shopOffer("a/b", OFFER_REF)).toContain("/boutique/a%2Fb/offres/pro.ga%3Aoffer%3A")
    expect(routes.publicShopOffer("a/b", OFFER_REF)).toContain("/boutiques/a%2Fb/offres/")
    const route = routes.publicShopCatalog("atelier", { kind: "product", collectionRef: COLLECTION_REF, query: "sac & tissu" }, "page/2")
    expect(route).toContain("type=product")
    expect(route).toContain("recherche=sac+%26+tissu")
    expect(route).toContain("curseur=page%2F2")
    expect(routes.shopCatalog("atelier")).toBe("/boutique/atelier/catalogue")
  })
  it.each(["http://127.0.0.1:3210", "http://localhost:3210", "https://vivid-hedgehog-655.convex.cloud"])("accepte seulement les trois collections démo déclarées sur %s", (backendUrl) => {
    vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", backendUrl)
    for (const handle of ["epicerie-moussavou-demo", "studio-objectif-demo", "atelier-tech-demo"]) {
      const collectionRef = `demo:collection:${handle}`
      expect(catalogSearch({ collection: collectionRef })).toEqual({ collectionRef, cursor: null })
    }
    for (const collection of ["demo:collection:autre", "demo:collection:atelier-tech-demo/extra", "demo:collection:ATELIER-TECH-DEMO"]) expect(catalogSearch({ collection })).toBeNull()
  })
  it.each(["https://production.convex.cloud", "https://other.convex.cloud", "https://vivid-hedgehog-655.convex.cloud.evil.test", "http://localhost:3211"])("refuse les collections démo sur %s et conserve les références PRO.GA", (backendUrl) => {
    vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", backendUrl)
    vi.stubEnv("ANTSIA_DEMO_DEPLOYMENT", "vivid-hedgehog-655")
    expect(catalogSearch({ collection: "demo:collection:atelier-tech-demo" })).toBeNull()
    expect(catalogSearch({ collection: COLLECTION_REF })).toEqual({ collectionRef: COLLECTION_REF, cursor: null })
  })
})


describe("MP05d — URL des filtres de boutique", () => {
  it("conserve les listes OU, les prix et le tri sur toutes les pages membre et publiques", () => {
    const input = { type: "product", collection: COLLECTION_REF, categorie: ["fashion.women", "fashion"], marque: ["Maison", "Atelier"], matiere: ["Lin", "Coton"], couleur: "Écru", public: ["women", "unisex"], prixMin: "0", prixMax: "50000", tri: "price_asc", curseur: "next" }
    const search = catalogSearch(input)!
    expect(search).toMatchObject({ kind: "product", category: ["fashion", "fashion.women"], audience: ["unisex", "women"], minPrice: 0, maxPrice: 50000, sort: "price_asc", cursor: "next" })
    for (const href of [routes.shopCatalog("atelier", catalogFilters(search), search.cursor), routes.publicShopCatalog("atelier", catalogFilters(search), search.cursor)]) {
      const url = new URL(href, "https://example.test")
      expect(url.searchParams.getAll("marque")).toEqual(["Atelier", "Maison"])
      expect(url.searchParams.get("prixMin")).toBe("0")
      expect(url.searchParams.get("curseur")).toBe("next")
    }
    expect(catalogFilters(search)).not.toHaveProperty("cursor")
  })
  it("un catalogue mixte peut choisir un rayon de service sans transformer le modèle de boutique", () => {
    expect(catalogSearch({ categorie: "services" })).toEqual({ category: ["services"], cursor: null })
    expect(catalogSearch({ type: "product", categorie: "services" })).toBeNull()
  })
  it.each([{ inconnue: "x" }, { categorie: "private" }, { marque: ["Écru", "ecru"] }, { marque: Array.from({ length: 7 }, (_, index) => String(index)) }, { public: "adult" }, { mode: "private" }, { prixMin: "-1" }, { prixMin: "1.5" }, { prixMin: "100", prixMax: "99" }, { tri: "relevance" }, { recherche: "veste", tri: "newest" }, { recherche: "a-b-c-d-e-f-g-h-i-j-k-l-m-n-o-p-q" }, { recherche: "…" }])("ferme les combinaisons invalides : %j", params => {
    expect(catalogSearch(params)).toBeNull()
  })
})


it("analyse l'URL vivante en conservant les tableaux et en refusant les scalaires répétés", () => {
  expect(catalogSearchFromParams(new URLSearchParams("matiere=Lin&matiere=Coton&prixMin=2500&tri=price_desc"))).toEqual({ material: ["Coton", "Lin"], minPrice: 2500, sort: "price_desc", cursor: null })
  expect(catalogSearchFromParams(new URLSearchParams("prixMin=2500&prixMin=0"))).toBeNull()
})

describe("MP06 — catalogue prestataire", () => {
  it("conserve les filtres normalisés jusqu'à la prochaine page membre et publique", () => {
    const search = catalogSearch({ type: "service", modeCommercial: ["quote", "fixed_order"], langue: "fr-ga", zone: "Lambaréné", dureeMin: "30", dureeMax: "120", curseur: "next" })!
    expect(search).toMatchObject({ kind: "service", commercialMode: ["fixed_order", "quote"], languageCode: ["fr-GA"], serviceZone: ["lambarene"], minDurationMinutes: 30, maxDurationMinutes: 120 })
    for (const route of [routes.providerCatalog("atelier", catalogFilters(search), search.cursor), routes.publicProviderCatalog("atelier", catalogFilters(search), search.cursor)]) expect(catalogSearchFromParams(new URL(route, "https://example.test").searchParams)).toEqual(search)
    expect(catalogFilters(search)).not.toHaveProperty("cursor")
  })
  it.each([{ type: "product", modeCommercial: "quote" }, { type: "service", langue: ["fr", "FR"] }, { type: "service", zone: ["Lambaréné", "lambarene"] }, { type: "service", modeCommercial: "unknown" }, { type: "service", dureeMax: "43201" }, { type: "service", dureeMin: "60", dureeMax: "30" }, { type: "service", dureeMax: ["30", "60"] }])("ferme la combinaison %j", params => { expect(catalogSearch(params)).toBeNull() })
})
