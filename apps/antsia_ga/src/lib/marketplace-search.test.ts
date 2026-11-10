import { COMMERCE_MAX_AMOUNT_XAF } from "@antsia/social-domain/commerce/primitives"
import { describe, expect, it } from "vitest"
import { marketplaceSearch, marketplaceSearchParams, type MarketplaceSearch } from "./marketplace-search"

function read(params: URLSearchParams) {
  const record: Record<string, string | string[]> = {}
  for (const key of new Set(params.keys())) { const values = params.getAll(key); record[key] = values.length === 1 ? values[0]! : values }
  return marketplaceSearch(record)
}

describe("MP04 — recherche marketplace fermée et partageable", () => {
  it("ouvre les produits sans filtre et garde les vues explicites", () => {
    expect(marketplaceSearch({})).toEqual({ view: "products", cursor: null })
    expect(marketplaceSearch({ vue: "services" })).toEqual({ view: "services", cursor: null })
    expect(marketplaceSearch({ vue: "boutiques", recherche: " Atelier   local " })).toEqual({ view: "shops", query: "Atelier local", cursor: null })
  })
  it("préserve plusieurs valeurs par facette et les bornes avant sérialisation canonique", () => {
    const parsed = marketplaceSearch({ vue: "produits", categorie: ["fashion.women.clothing", "fashion"], marque: ["Zèbre", "Atelier"], matiere: ["Lin", "Coton"], couleur: ["Écru", "Rouge"], public: ["women", "unisex"], prixMin: "0", prixMax: "25000", tri: "price_asc", curseur: "signed-window" })!
    expect(parsed.category).toEqual(["fashion", "fashion.women.clothing"])
    expect(parsed.brand).toEqual(["Atelier", "Zèbre"])
    expect(parsed.minPrice).toBe(0)
    expect(parsed.maxPrice).toBe(25000)
    expect(read(marketplaceSearchParams(parsed))).toEqual(parsed)
    expect([...marketplaceSearchParams(parsed).keys()]).toEqual(["vue", "categorie", "categorie", "marque", "marque", "matiere", "matiere", "couleur", "couleur", "public", "public", "prixMin", "prixMax", "tri", "curseur"])
  })
  it("les services gardent plusieurs modes et un chemin de leur propre catégorie", () => {
    expect(marketplaceSearch({ vue: "services", categorie: ["services", "services.digital"], mode: ["remote", "hybrid"] })).toMatchObject({ view: "services", category: ["services", "services.digital"], serviceMode: ["hybrid", "remote"] })
    expect(marketplaceSearch({ vue: "services", categorie: "fashion" })).toBeNull()
    expect(marketplaceSearch({ categorie: "services.digital" })).toBeNull()
  })
  it("la vue boutiques efface les filtres d'offres tout en gardant la recherche", () => {
    expect(marketplaceSearch({ vue: "boutiques", recherche: "couture", categorie: "fashion", marque: "Atelier", public: "women", prixMin: "100", tri: "price_desc" })).toEqual({ view: "shops", query: "couture", cursor: null })
    expect(marketplaceSearchParams({ view: "shops", query: "couture", category: ["fashion"], minPrice: 100, sort: "price_desc", cursor: null }).toString()).toBe("vue=boutiques&recherche=couture")
  })
  it.each([
    { autre: "private" }, { vue: ["produits", "services"] }, { recherche: ["sac", "robe"] }, { tri: ["newest", "price_asc"] }, { curseur: ["a", "b"] }, { prixMin: ["1", "2"] },
    { vue: "unknown" }, { categorie: "fashion.unknown" }, { public: "private" }, { mode: "unknown" }, { marque: ["Atelier", " atelier "] }, { categorie: ["fashion", "fashion"] }, { marque: [] }, { marque: Array.from({ length: 7 }, (_, index) => `M${index}`) }, { marque: "A".repeat(81) }, { matiere: "Lin\nsecret" },
    { prixMin: "-1" }, { prixMin: "1.5" }, { prixMin: "01" }, { prixMin: "1e3" }, { prixMax: String(COMMERCE_MAX_AMOUNT_XAF + 1) }, { prixMin: "20", prixMax: "10" }, { recherche: "x".repeat(121) }, { recherche: Array.from({ length: 17 }, () => "mot").join(" ") }, { recherche: "robe\u0000" }, { curseur: "a".repeat(8193) }, { curseur: "a\n" }, { recherche: "robe", tri: "price_asc" }, { tri: "relevance" },
  ])("refuse une URL incohérente ou répétée : %j", (params) => {
    expect(marketplaceSearch(params)).toBeNull()
  })
  it("normalise Unicode et espaces, puis conserve les caractères de l'URL par encodage", () => {
    const parsed = marketplaceSearch({ recherche: " Cafe\u0301  & sacs ", marque: " L’Atelier ", tri: "relevance" })!
    expect(parsed.query).toBe("Café & sacs")
    expect(read(marketplaceSearchParams(parsed))).toEqual(parsed)
    expect(marketplaceSearchParams(parsed).toString()).toContain("%26")
  })
  it("admet six valeurs distinctes et un curseur opaque borné, sans le transformer en filtre", () => {
    const search: MarketplaceSearch = { view: "products", brand: ["A", "B", "C", "D", "E", "F"], cursor: '{"generation":1,"cursor":"opaque"}' }
    expect(read(marketplaceSearchParams(search))).toEqual(search)
  })
  it("compte aussi les termes séparés par ponctuation dans la borne de recherche", () => {
    expect(marketplaceSearch({ recherche: Array.from({ length: 17 }, () => "a").join("-") })).toBeNull()
    expect(marketplaceSearch({ recherche: Array.from({ length: 16 }, () => "a").join("-") })).not.toBeNull()
  })
})

describe("MP06 — filtres publics de services", () => {
  it("canonise les langues et localités avec les helpers contractuels et conserve la durée", () => {
    const search = marketplaceSearch({ vue: "services", modeCommercial: ["quote", "booking"], langue: ["fr-ga", "en"], zone: ["  Port-Gentil ", "Lambaréné"], dureeMin: "30", dureeMax: "43200", tri: "newest", curseur: "next" })!
    expect(search).toMatchObject({ commercialMode: ["booking", "quote"], languageCode: ["en", "fr-GA"], serviceZone: ["lambarene", "port-gentil"], minDurationMinutes: 30, maxDurationMinutes: 43200, cursor: "next" })
    expect(read(marketplaceSearchParams(search))).toEqual(search)
  })
  it.each([
    { modeCommercial: "quote" }, { vue: "services", modeCommercial: "fixed" }, { vue: "services", langue: ["fr-ga", "fr-GA"] }, { vue: "services", langue: "invalid_language" }, { vue: "services", zone: ["Lambaréné", "lambarene"] }, { vue: "services", zone: "www.example.test" }, { vue: "services", dureeMin: "0" }, { vue: "services", dureeMin: "01" }, { vue: "services", dureeMax: "43201" }, { vue: "services", dureeMin: "60", dureeMax: "30" }, { vue: "services", dureeMin: ["1", "2"] },
  ])("refuse une facette ou durée incompatible : %j", params => { expect(marketplaceSearch(params)).toBeNull() })
})
