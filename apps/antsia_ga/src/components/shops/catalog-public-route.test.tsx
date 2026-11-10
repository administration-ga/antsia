import type { ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ shop: vi.fn(), catalog: vi.fn(), offer: vi.fn(), slot: vi.fn() }))
vi.mock("@/lib/public-shops-data", () => ({ loadPublicStorefront: mocks.shop }))
vi.mock("@/lib/public-catalog-data", () => ({ loadPublicCatalog: mocks.catalog, loadPublicOffer: mocks.offer, loadPublicPostOffer: mocks.slot }))
vi.mock("@/lib/server-session", () => ({ getPublicLocale: async () => "fr", configuredMetadataOrigin: () => "https://antsia.ga", getServerViewer: vi.fn(), withinBridgeDeadline: (work: () => Promise<unknown>) => work() }))
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("TEST_NOT_FOUND") }, useSearchParams: () => null, useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock("@/components/public/public-shell", () => ({ PUBLIC_LINK: "public-link", PublicShell: ({ viewer, children }: { viewer: string; children: ReactNode }) => <main data-viewer={viewer}>{children}</main> }))
vi.mock("@/components/public/public-status", () => ({ PublicStatus: ({ status }: { status: string }) => <p data-status={status}>{status}</p> }))
vi.mock("./catalog-filters", () => ({ CatalogFiltersForm: () => <form data-testid="catalog-filters" /> }))

import { routes } from "@/lib/routes"
import { PublicCatalogMetadata, PublicCatalogScreen, PublicOfferMetadata, PublicOfferScreen } from "./catalog-public-route"
import { PublicOfferPostSlot } from "./public-offer-post-slot"
import { catalogOfferFixture, catalogPageFixture, OFFER_REF, VARIANT_REF } from "./__tests__/catalog-fixtures"

const input = () => ({ params: Promise.resolve({ handle: "atelier", offerRef: OFFER_REF, VARIANT_REF }), searchParams: Promise.resolve({}) })
beforeEach(() => {
  mocks.shop.mockReset(); mocks.catalog.mockReset(); mocks.offer.mockReset(); mocks.slot.mockReset()
  mocks.shop.mockResolvedValue({ status: "ready", viewer: "anonymous", data: { name: "Atelier", handle: "atelier" } })
  mocks.catalog.mockResolvedValue({ status: "ready", viewer: "anonymous", data: catalogPageFixture() })
  mocks.offer.mockResolvedValue({ status: "ready", viewer: "anonymous", data: catalogOfferFixture() })
})

describe("catalogue et fiche en SSR public réel", () => {
  it("rend les vraies offres, les liens publics et leurs métadonnées", async () => {
    const html = renderToStaticMarkup(await PublicCatalogScreen(input()))
    expect(html).toContain("Sac artisanal")
    expect(html).toContain(routes.publicShopOffer("atelier", OFFER_REF))
    expect(html).not.toContain("linkRef")
    const metadata = await PublicOfferMetadata(input())
    expect(metadata.title).toBe("Sac artisanal")
    expect(metadata.robots).toEqual({ index: true, follow: true })
    expect(metadata.alternates?.canonical).toBe(`https://antsia.ga${routes.publicShopOffer("atelier", OFFER_REF)}`)
    const detail = renderToStaticMarkup(await PublicOfferScreen(input()))
    expect(detail).toContain("Description complète de l’offre.")
    expect(detail).toContain("Rouge")
    expect(detail).not.toContain("data-checkout")
  })
  it("CM-09 : sans compte, « Enregistrer » invite à se connecter et ramène à la fiche ; connecté, mène à l'espace membre", async () => {
    const anonymous = renderToStaticMarkup(await PublicOfferScreen(input()))
    const signIn = routes.signIn(undefined, undefined, undefined, undefined, { kind: "offer", handle: "atelier", offerRef: OFFER_REF }).replaceAll("&", "&amp;")
    const saveLink = (html: string) => /<a[^>]*data-public-save-offer[^>]*>/.exec(html)?.[0] ?? ""
    expect(saveLink(anonymous)).toContain(`href="${signIn}"`)
    expect(anonymous).toContain("Se connecter pour enregistrer")
    mocks.offer.mockResolvedValue({ status: "ready", viewer: "authenticated", data: catalogOfferFixture() })
    const member = renderToStaticMarkup(await PublicOfferScreen(input()))
    expect(saveLink(member)).toContain(`href="${routes.shopOffer("atelier", OFFER_REF)}"`)
    expect(member).toContain("Enregistrer dans mes favoris")
  })
  it("MP06 : le catalogue prestataire impose service et garde les liens de pagination", async () => {
    mocks.catalog.mockResolvedValue({ status: "ready", viewer: "anonymous", data: catalogPageFixture({ page: [], isDone: false, continueCursor: "next-service", filteredWindow: true }) })
    const props = { params: Promise.resolve({ handle: "atelier" }), searchParams: Promise.resolve({ langue: "fr", modeCommercial: "quote" }), provider: true }
    const html = renderToStaticMarkup(await PublicCatalogScreen(props))
    expect(mocks.catalog).toHaveBeenCalledWith("atelier", { kind: "service", languageCode: ["fr"], commercialMode: ["quote"] }, null, false)
    expect(html).toContain("/prestataires/atelier/prestations?type=service")
    expect(html).toContain("curseur=next-service")
    await expect(PublicCatalogScreen({ ...props, searchParams: Promise.resolve({ type: "product" }) })).rejects.toThrow("TEST_NOT_FOUND")
  })
  it("MP06 : la fiche prestataire refuse un produit et la fiche service revient en consultation", async () => {
    await expect(PublicOfferScreen({ ...input(), provider: true })).rejects.toThrow("TEST_NOT_FOUND")
    const service = catalogOfferFixture({ kind: "service", variants: [], variantAxes: [], price: { mode: "quote", currency: "XAF" } })
    mocks.offer.mockResolvedValue({ status: "ready", viewer: "anonymous", data: service })
    const html = renderToStaticMarkup(await PublicOfferScreen({ ...input(), provider: true }))
    expect(html).toContain("Voir les modalités")
    expect(html).toContain("espaceType=service_offer")
    expect(html).not.toContain('type="submit"')
    expect((await PublicOfferMetadata({ ...input(), provider: true })).alternates?.canonical).toBe(`https://antsia.ga${routes.publicProviderOffer("atelier", OFFER_REF)}`)
  })
  it("une offre retirée garde une réponse indistincte sans ancien titre ni canonique", async () => {
    mocks.offer.mockResolvedValue({ status: "ready", viewer: "anonymous", data: null })
    const metadata = await PublicOfferMetadata(input())
    expect(metadata.robots).toEqual({ index: false, follow: false })
    expect(metadata.alternates).toBeUndefined()
    expect(JSON.stringify(metadata)).not.toContain("Sac artisanal")
    await expect(PublicOfferScreen(input())).rejects.toThrow("TEST_NOT_FOUND")
  })
  it("un catalogue indisponible ne conserve pas de métadonnées indexables de la boutique", async () => {
    mocks.catalog.mockResolvedValue({ status: "unavailable" })
    const metadata = await PublicCatalogMetadata(input())
    expect(metadata.robots).toEqual({ index: false, follow: false })
    expect(metadata.alternates).toBeUndefined()
    expect(JSON.stringify(metadata)).not.toContain("Atelier")
    const html = renderToStaticMarkup(await PublicCatalogScreen(input()))
    expect(html).toContain('data-status="unavailable"')
    expect(html).not.toContain("Sac artisanal")
  })
  it.each(["refused", "unavailable", "handoff"])("une lecture %s ne retombe pas sur le contenu anonyme", async (status) => {
    mocks.offer.mockResolvedValue({ status })
    const metadata = await PublicOfferMetadata(input())
    expect(metadata.robots).toEqual({ index: false, follow: false })
    const html = renderToStaticMarkup(await PublicOfferScreen(input()))
    expect(html).toContain(`data-status="${status}"`)
    expect(html).not.toContain("Sac artisanal")
  })
  it("conserve filtres et curseur sur une fenêtre vide, sans promettre un total", async () => {
    mocks.catalog.mockResolvedValue({ status: "ready", viewer: "anonymous", data: catalogPageFixture({ page: [], isDone: false, continueCursor: "next-window", filteredWindow: true }) })
    const props = { params: Promise.resolve({ handle: "atelier" }), searchParams: Promise.resolve({ type: "service", recherche: "couture", curseur: "old-window" }) }
    const html = renderToStaticMarkup(await PublicCatalogScreen(props))
    expect(mocks.catalog).toHaveBeenCalledWith("atelier", { kind: "service", query: "couture" }, "old-window", false)
    expect(html).toContain("La suivante peut en contenir")
    expect(html).toContain("type=service&amp;recherche=couture&amp;curseur=next-window")
    expect(html).toContain("l’accord de diffusion publique")
    expect((await PublicCatalogMetadata(props)).robots).toEqual({ index: false, follow: false })
  })
  it("ne consulte rien pour un handle mal encodé ou des filtres répétés", async () => {
    await expect(PublicCatalogScreen({ params: Promise.resolve({ handle: "%E0" }) })).rejects.toThrow("TEST_NOT_FOUND")
    await expect(PublicCatalogScreen({ params: Promise.resolve({ handle: "atelier" }), searchParams: Promise.resolve({ type: ["product", "service"] }) })).rejects.toThrow("TEST_NOT_FOUND")
    expect(mocks.catalog).not.toHaveBeenCalled()
  })
  it("le slot SSR ne rend que l'offre encore admissible et n'utilise aucun fournisseur membre", async () => {
    mocks.slot.mockResolvedValue({ status: "ready", viewer: "anonymous", data: catalogOfferFixture() })
    const html = renderToStaticMarkup(await PublicOfferPostSlot({ postId: "post-test", locale: "fr" }))
    expect(mocks.slot).toHaveBeenCalledWith("post-test")
    expect(html).toContain("Sac artisanal")
    for (const result of [{ status: "refused" }, { status: "unavailable" }, { status: "ready", viewer: "anonymous", data: null }]) {
      mocks.slot.mockResolvedValue(result)
      expect(await PublicOfferPostSlot({ postId: "post-test", locale: "fr" })).toBeNull()
    }
  })
})


describe("MP05d — filtres SSR et sélection publique", () => {
  it("applique les mêmes filtres publics et conserve la continuation sans total", async () => {
    mocks.catalog.mockResolvedValue({ status: "ready", viewer: "anonymous", data: catalogPageFixture({ page: [], isDone: false, continueCursor: "next", filteredWindow: true }) })
    const props = { params: Promise.resolve({ handle: "atelier" }), searchParams: Promise.resolve({ type: "product", categorie: ["fashion", "fashion.women"], matiere: ["Lin", "Coton"], public: "women", prixMin: "0", prixMax: "25000", tri: "price_asc" }) }
    const value = renderToStaticMarkup(await PublicCatalogScreen(props))
    expect(mocks.catalog).toHaveBeenCalledWith("atelier", { kind: "product", category: ["fashion", "fashion.women"], material: ["Coton", "Lin"], audience: ["women"], minPrice: 0, maxPrice: 25000, sort: "price_asc" }, null, false)
    expect(value).toContain("matiere=Coton&amp;matiere=Lin")
    expect(value).toContain("curseur=next")
  })
  it("annonce l'indexation sans déduire une absence de produits", async () => {
    mocks.catalog.mockResolvedValue({ status: "ready", viewer: "anonymous", data: catalogPageFixture({ page: [], indexStatus: "building" }) })
    const value = renderToStaticMarkup(await PublicCatalogScreen({ params: Promise.resolve({ handle: "atelier" }) }))
    expect(value).toContain("en cours d’indexation")
    expect(value).not.toContain("Aucune offre disponible")
  })
  it("garde variante et quantité du lien public sans les confondre avec le handoff ni acheter", async () => {
    const props = { params: Promise.resolve({ handle: "atelier", offerRef: OFFER_REF }), searchParams: Promise.resolve({ variante: VARIANT_REF, quantite: "2" }) }
    const value = renderToStaticMarkup(await PublicOfferScreen(props))
    expect(value).toContain("espaceVariante=pro.ga%3Aoffer_variant%3A")
    expect(value).toContain("espaceQuantite=2")
    expect(value).not.toContain('button type="submit"')
    expect((await PublicOfferMetadata(props)).alternates?.canonical).toBe(`https://antsia.ga${routes.publicShopOffer("atelier", OFFER_REF)}`)
    await PublicCatalogScreen({ params: Promise.resolve({ handle: "atelier" }), searchParams: Promise.resolve({ ott: "opaque" }) })
    expect(mocks.shop).toHaveBeenLastCalledWith("atelier", true)
  })
})


describe("SU06 — le menu public d'une adresse food", () => {
  it("nomme le H1, les métadonnées et le retour de fiche Menu", async () => {
    mocks.shop.mockResolvedValue({ status: "ready", viewer: "anonymous", data: { name: "Atelier", handle: "atelier", model: "products", activityConfiguration: { version: 1, capabilities: ["products"], template: "food", blocks: ["catalog", "about"] } } })
    const metadata = await PublicCatalogMetadata(input())
    expect(metadata.title).toBe("Le menu de Atelier")
    const html = renderToStaticMarkup(await PublicCatalogScreen(input()))
    expect(html).toContain(">Le menu de Atelier</h1>")
    expect(html).not.toContain("Le catalogue de Atelier")
    const detail = renderToStaticMarkup(await PublicOfferScreen(input()))
    expect(detail).toContain(">Revenir au menu</a>")
  })

  it("une activité ordinaire garde son catalogue", async () => {
    expect((await PublicCatalogMetadata(input())).title).toBe("Le catalogue de Atelier")
    expect(renderToStaticMarkup(await PublicOfferScreen(input()))).toContain(">Revenir au catalogue</a>")
  })
})
