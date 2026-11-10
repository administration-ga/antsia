import { describe, expect, it } from "vitest"
import { COMMERCE_PUBLIC_CONTRACT, COMMERCE_PUBLIC_CONTRACT_V2, commerceCanonicalJson } from "@antsia/social-domain/commerce/primitives"
import type { CommerceServiceProfile } from "@antsia/social-domain/commerce/serviceProfile"
import type { CommerceOfferEvent } from "@antsia/social-domain/commerce/projection"
import { marketplaceIndexFields, MARKETPLACE_QUOTE_SORT, MARKETPLACE_SEARCH_TEXT_MAX } from "./marketplaceIndexFields"

const NOW = Date.UTC(2026, 9, 21, 12)
const OFFER = "pro.ga:offer:01JA00000000000000000000P1"
const offer: CommerceOfferEvent = {
  type: "offer.published", shopRef: "pro.ga:structure:01JA00000000000000000000S1", offerRef: OFFER,
  revision: 1, changedAt: NOW, kind: "product", title: "Veste élégante", description: "Création en lin.",
  collectionRefs: [], tags: ["mode"], price: { mode: "fixed", currency: "XAF", amount: 12_000 },
  showsAvailability: false, variants: [], variantAxes: [], media: [],
}
function raw(payload = offer, contract: typeof COMMERCE_PUBLIC_CONTRACT | typeof COMMERCE_PUBLIC_CONTRACT_V2 = COMMERCE_PUBLIC_CONTRACT_V2) {
  return commerceCanonicalJson({ contract, version: 1, eventId: "marketplace-event-fixture", objectRef: OFFER, payload })!
}

describe("MP03 — projection d'index sans autorité commerciale", () => {
  it("normalise les attributs autorisés et le texte, avec le chemin de catégorie", () => {
    const result = marketplaceIndexFields(raw({ ...offer, facets: { taxonomyVersion: 1, categoryPath: ["fashion", "fashion.women", "fashion.women.clothing"], attributes: [{ key: "brand", type: "text", value: "Créations NDONG" }, { key: "material", type: "text", value: "Lin" }, { key: "color", type: "text", value: "Écru" }, { key: "audience", type: "choice", value: "women" }] } }), "active", "offer", "catalog", NOW)
    expect(result).toMatchObject({ discoveryVersion: 2, category1: "fashion", category2: "fashion.women", category3: "fashion.women.clothing", brand: "creations ndong", material: "lin", color: "ecru", audience: "women", minPrice: 12_000, maxPrice: 12_000, priceAsc: 12_000, priceDesc: -12_000 })
    expect(result.searchText).toContain("veste elegante")
    expect(result.searchText).toContain("creations ndong")
    expect(result.searchText.length).toBeLessThanOrEqual(MARKETPLACE_SEARCH_TEXT_MAX)
    expect(Object.keys(result)).not.toContain("stock")
    expect(Object.keys(result)).not.toContain("sku")
  })

  it("conserve les offres V1 sans inventer de facettes", () => {
    const result = marketplaceIndexFields(raw(offer, COMMERCE_PUBLIC_CONTRACT), "active", "offer", "catalog", NOW)
    expect(result.discoveryVersion).toBe(2)
    expect(result.category1).toBeUndefined()
    expect(result.material).toBeUndefined()
    expect(result.searchText).toBe("veste elegante creation en lin. mode")
  })

  it("place les devis après les prix dans les deux tris et indexe la fourchette publiée", () => {
    const quote = marketplaceIndexFields(raw({ ...offer, price: { mode: "quote", currency: "XAF" } }), "active", "offer", "catalog", NOW)
    expect(quote).toMatchObject({ priceAsc: MARKETPLACE_QUOTE_SORT, priceDesc: MARKETPLACE_QUOTE_SORT })
    expect(quote.minPrice).toBeUndefined()
    expect(quote.maxPrice).toBeUndefined()
    const range = marketplaceIndexFields(raw({ ...offer, price: { mode: "range", currency: "XAF", minAmount: 3_000, maxAmount: 6_000 } }), "active", "offer", "catalog", NOW)
    expect(range).toMatchObject({ minPrice: 3_000, maxPrice: 6_000, priceAsc: 3_000, priceDesc: -6_000 })
  })

  it.each([
    ["withdrawn", "offer", "catalog"], ["closed", "offer", "catalog"], ["active", "shop", "catalog"], ["active", "offer", "availability"],
  ] as const)("retire tous les anciens champs de recherche pour %s/%s/%s", (state, kind, sequence) => {
    const result = marketplaceIndexFields(raw(), state, kind, sequence, NOW)
    expect(result.searchText).toBe("")
    expect(Object.entries(result).filter(([key, value]) => key !== "searchText" && value !== undefined)).toEqual([])
  })

  it("n'indexe pas un corps invalide, V1 enrichi illicitement ou une catégorie d'un autre métier", () => {
    for (const body of ["{", raw({ ...offer, facets: { taxonomyVersion: 1, categoryPath: ["services", "services.digital"], attributes: [] } }), raw({ ...offer, facets: { taxonomyVersion: 1, categoryPath: ["fashion"], attributes: [] } }, COMMERCE_PUBLIC_CONTRACT)]) {
      const result = marketplaceIndexFields(body, "active", "offer", "catalog", NOW)
      expect(result.discoveryVersion).toBeUndefined()
      expect(result.searchText).toBe("")
    }
  })
})


const SERVICE_PROFILE: CommerceServiceProfile = { version: 1, commercialModes: ["quote", "booking", "fixed_order"], languageCodes: ["fr", "en", "fr-GA", "es", "de", "pt"], zones: Array.from({ length: 8 }, (_, index) => ({ countryCode: "GA" as const, locality: index === 7 ? "Île témoin" : `Zone ${index}` })), deliverables: ["Rapport public"], inclusions: ["Diagnostic"], exclusions: ["Matériel"], portfolio: [{ title: "Projet public", description: "Résultat de démonstration", mediaIndexes: [] }] }
describe("MP06 — index du profil service publié", () => {
  it("dérive uniquement les modes, six langues, huit zones et la durée déclarés", () => {
    const payload: CommerceOfferEvent = { ...offer, kind: "service", serviceProfile: SERVICE_PROFILE, facets: { taxonomyVersion: 1, categoryPath: ["services", "services.digital"], attributes: [{ key: "durationMinutes", type: "number", value: 90 }] } }
    const fields = marketplaceIndexFields(raw(payload), "active", "offer", "catalog", NOW)
    expect(fields).toMatchObject({ discoveryVersion: 2, localIndexVersion: 2, commercialQuote: true, commercialBooking: true, commercialFixedOrder: true, language3: "fr-GA", language6: "pt", serviceZone8: "ile temoin", durationMinutes: 90 })
    expect(fields.searchText).toContain("rapport public diagnostic materiel projet public resultat de demonstration")
  })
  it("ne déduit aucun mode ou langue d'un prix, d'une ancienne zone ou d'un profil absent", () => {
    const fields = marketplaceIndexFields(raw({ ...offer, kind: "service", price: { mode: "quote", currency: "XAF" }, zone: "Libreville", title: "Service français sur rendez-vous" }), "active", "offer", "catalog", NOW)
    for (const key of ["commercialQuote", "commercialBooking", "commercialFixedOrder", "language1", "serviceZone1", "durationMinutes"] as const) expect(fields[key]).toBeUndefined()
  })
  it("retire tous les champs du profil à sa suppression ou au retrait de l'offre", () => {
    const fields = marketplaceIndexFields(raw({ ...offer, kind: "service", serviceProfile: SERVICE_PROFILE }), "withdrawn", "offer", "catalog", NOW)
    expect(Object.entries(fields).filter(([key, value]) => key !== "searchText" && value !== undefined)).toEqual([])
    const updated = marketplaceIndexFields(raw({ ...offer, kind: "service", type: "offer.updated", revision: 2 }), "active", "offer", "catalog", NOW)
    expect(updated.commercialBooking).toBeUndefined()
    expect(updated.language6).toBeUndefined()
    expect(updated.serviceZone8).toBeUndefined()
  })
})
