import { renderToStaticMarkup } from "react-dom/server"
import { I18nextProvider } from "react-i18next"
import { createAppI18n } from "@antsia/social-features/i18n"
import { describe, expect, it } from "vitest"

import { appResources } from "@/i18n/resources"
import { routes } from "@/lib/routes"
import { catalogOfferFixture, catalogVariantFixture } from "./__tests__/catalog-fixtures"
import { offerActionHref, offerPostActions, offerPostVisual, offerSheetRatio, OfferPostFormula, type PostMediaSummary } from "./offer-post-formula"
import type { CatalogOffer } from "./catalog-model"

const i18n = createAppI18n({ locale: "fr", appResources, defaultNS: "shops" })
const t = (key: string, options?: Record<string, unknown>) => i18n.t(key, { ns: "shops", ...options })
const photo = (index: number): CatalogOffer["media"][number] => ({ url: `/media/photo-${index}.jpg`, withheld: null, altText: `Vue ${index}`, width: 800, height: 1000 })
const service = (modes: Array<"quote" | "booking" | "fixed_order">, changes: Partial<CatalogOffer> = {}) => catalogOfferFixture({
  kind: "service", title: "Location de berline", price: { mode: "fixed", currency: "XAF", amount: 45000 },
  serviceProfile: { version: 1, commercialModes: modes, languageCodes: ["fr"], zones: [{ countryCode: "GA", locality: "Libreville" }], deliverables: [], inclusions: [], exclusions: [], portfolio: [] },
  ...changes,
})
const NO_MEDIA: PostMediaSummary = { count: 0, hasVideo: false }
const html = (offer: CatalogOffer, postMedia: PostMediaSummary) => renderToStaticMarkup(<I18nextProvider i18n={i18n}><OfferPostFormula offer={offer} postMedia={postMedia} locale="fr" t={t} /></I18nextProvider>)

describe("formules des boutiques — le geste (ADR-0037)", () => {
  it("un service sur rendez-vous se réserve, le devis en second quand il est aussi ouvert", () => {
    expect(offerPostActions(service(["booking"]))).toEqual({ primary: "book", secondary: null })
    expect(offerPostActions(service(["booking", "quote"]))).toEqual({ primary: "book", secondary: "quote" })
    expect(offerPostActions(service(["quote"]))).toEqual({ primary: "quote", secondary: null })
    expect(offerPostActions(service(["fixed_order"]))).toEqual({ primary: "order", secondary: null })
  })

  it("un produit à prix affiché s'achète ; « sur devis », il mène à sa fiche, jamais à un paiement", () => {
    expect(offerPostActions(catalogOfferFixture())).toEqual({ primary: "buy", secondary: null })
    expect(offerPostActions(catalogOfferFixture({ price: { mode: "quote", currency: "XAF" } }))).toEqual({ primary: "view", secondary: null })
  })

  it("chaque geste mène à sa vraie page", () => {
    const rental = service(["booking", "quote"])
    expect(offerActionHref(rental, "book")).toBe(routes.serviceBooking("atelier", rental.offerRef))
    expect(offerActionHref(rental, "quote")).toBe(routes.serviceQuote("atelier", rental.offerRef))
    expect(offerActionHref(rental, "view")).toBe(routes.providerOffer("atelier", rental.offerRef))
    expect(offerActionHref(catalogOfferFixture(), "buy")).toBe(routes.shopOffer("atelier", catalogOfferFixture().offerRef))
  })
})

describe("formules des boutiques — la mise en scène (ADR-0037)", () => {
  it("jamais d'images de l'offre quand la publication a les siennes", () => {
    const offer = catalogOfferFixture({ media: [photo(1), photo(2), photo(3)] })
    expect(offerPostVisual(offer, { count: 2, hasVideo: false })).toBeNull()
    expect(offerPostVisual(offer, NO_MEDIA)).toBe("three_views")
    expect(offerPostVisual(catalogOfferFixture({ media: [photo(1)] }), NO_MEDIA)).toBe("sheet")
    // Une photo retenue par la garde ne compte pas.
    expect(offerPostVisual(catalogOfferFixture(), NO_MEDIA)).toBeNull()
  })

  it("une vidéo et des variantes : la rangée des modèles", () => {
    expect(offerPostVisual(catalogOfferFixture({ variants: [catalogVariantFixture()] }), { count: 1, hasVideo: true })).toBe("models")
    expect(offerPostVisual(catalogOfferFixture({ variants: [] }), { count: 1, hasVideo: true })).toBeNull()
  })

  it("trois vues : une grande et deux petites, le titre et le prix, puis le seul geste Acheter", () => {
    const value = html(catalogOfferFixture({ media: [photo(1), photo(2), photo(3), photo(4)] }), NO_MEDIA)
    expect(value).toContain('data-offer-formula="three_views"')
    expect(value.match(/<img/g)).toHaveLength(3)
    expect(value).toContain("Acheter")
    // Le bandeau ne répète ni le titre ni le prix ; son nom accessible rappelle l'offre.
    expect(value).toContain('aria-label="Acheter : Sac artisanal"')
    expect(value.match(/Sac artisanal/g)?.length).toBeGreaterThanOrEqual(1)
  })

  it("fiche produit : la photo garde son format, borné comme les médias du fil, jamais de bandes", () => {
    expect(offerSheetRatio({ width: 800, height: 1000 })).toBe(0.8)
    expect(offerSheetRatio({ width: 800, height: 1600 })).toBe(0.8)
    expect(offerSheetRatio({ width: 1920, height: 800 })).toBe(1.91)
    expect(offerSheetRatio({ width: null, height: null })).toBe(1)
    const value = html(catalogOfferFixture({ media: [photo(1)] }), NO_MEDIA)
    expect(value).toContain('data-offer-formula="sheet"')
    expect(value).toContain("aspect-ratio:0.8")
  })

  it("la location se réserve depuis le bandeau collé au média, le devis reste offert", () => {
    const value = html(service(["booking", "quote"]), { count: 1, hasVideo: false })
    expect(value).toContain('data-offer-formula="cta"')
    expect(value).toContain("Réserver")
    expect(value).toContain("Obtenir un devis")
    expect(value).toContain(routes.serviceBooking("atelier", catalogOfferFixture().offerRef).replaceAll("&", "&amp;"))
    expect(value).not.toContain("<img")
  })

  it("vidéo et modèles : chaque modèle a son prix exact et mène à sa sélection", () => {
    const variant = catalogVariantFixture()
    const value = html(catalogOfferFixture({ variants: [variant] }), { count: 1, hasVideo: true })
    expect(value).toContain('data-offer-formula="models"')
    expect(value).toContain(variant.label)
    expect(value).toContain(routes.shopOffer("atelier", catalogOfferFixture().offerRef, { variantRef: variant.variantRef }).replaceAll("&", "&amp;"))
  })
})
