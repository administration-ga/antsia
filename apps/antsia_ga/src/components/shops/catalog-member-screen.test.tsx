import type { ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { I18nextProvider } from "react-i18next"
import { createAppI18n } from "@antsia/social-features/i18n"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { appResources } from "@/i18n/resources"
import { routes } from "@/lib/routes"
import { catalogOfferFixture, catalogPageFixture, OFFER_REF } from "./__tests__/catalog-fixtures"
import { centeringClasses, frameClasses } from "./__tests__/frame-classes"

const mocks = vi.hoisted(() => ({ query: vi.fn() }))
vi.mock("@antsia/api/engine", () => ({ api: { modules: { shops: { catalog: { list: "list", offer: "offer", postOffer: "postOffer" }, shops: { storefront: "storefront" }, checkout: { context: "checkoutContext" } } } } }))
vi.mock("@antsia/api/network", () => ({ useNetwork: () => ({ networkId: "root", personId: "reader" }) }))
vi.mock("@antsia/api/hooks", () => ({ useAuthenticatedConvexQuery: mocks.query }))
vi.mock("@/components/member-chrome", () => ({ MemberPage: ({ children }: { children: ReactNode }) => <main>{children}</main> }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), useSearchParams: () => null }))
vi.mock("convex/react", () => ({ useConvexAuth: () => ({ isAuthenticated: true }) }))
vi.mock("@antsia/api/sign-out-everywhere", () => ({ isSigningOutEverywhere: () => false }))

import type { Id } from "@antsia/api/engine"
import { MemberProviderScreen } from "../services/provider-screen"
import { MemberCatalogScreen, MemberOfferScreen } from "./catalog-member-screen"
import { OFFER_DETAIL_CSS } from "./offer-experience-styles"
import { OfferPostSlot } from "./offer-post-slot"
import { ShopFrame } from "./shop-ui"
import { SCREEN_SUBMIT } from "@/components/shared/screen-layout"

const i18n = createAppI18n({ locale: "fr", appResources, defaultNS: "shops" })
function html(children: ReactNode) { return renderToStaticMarkup(<I18nextProvider i18n={i18n}>{children}</I18nextProvider>) }
beforeEach(() => mocks.query.mockReset())

describe("catalogue membre et slot reliés aux projections réelles", () => {
  it("requête une fenêtre bornée avec filtres et propose de vraies fiches", () => {
    mocks.query.mockReturnValue({ data: catalogPageFixture(), isError: false, isPending: false, isFetching: false })
    const value = html(<MemberCatalogScreen handle="atelier" search={{ kind: "product", query: "sac", cursor: "page-2" }} />)
    expect(mocks.query).toHaveBeenCalledWith("list", { networkId: "root", handle: "atelier", kind: "product", query: "sac", paginationOpts: { cursor: "page-2", numItems: 12 } })
    expect(value).toContain("Sac artisanal")
    // Le formulaire complet s'ouvre dans la feuille « Filtrer » ; la recherche en cours se lit et se retire dans la barre.
    expect(value).toContain(">Filtrer</button>")
    expect(value).toContain("aria-label=\"Retirer sac\"")
    expect(value).toContain("Première page")
  })
  it("un refus ne conserve aucune offre provenant d'un DTO précédent", () => {
    mocks.query.mockReturnValue({ data: catalogPageFixture(), isError: true, isPending: false, isFetching: false })
    const value = html(<MemberCatalogScreen handle="atelier" search={{ cursor: null }} />)
    expect(value).toContain("Le catalogue ne peut pas être chargé")
    expect(value).not.toContain("Sac artisanal")
  })
  it("annonce la portée d'une fenêtre filtrée vide et le consentement public requis", () => {
    mocks.query.mockReturnValue({ data: catalogPageFixture({ page: [], isDone: false, filteredWindow: true, continueCursor: "next" }), isError: false, isPending: false, isFetching: false })
    const value = html(<MemberCatalogScreen handle="atelier" search={{ cursor: null }} />)
    expect(value).toContain("La suivante peut en contenir")
    expect(value).toContain("l’accord de diffusion publique")
    expect(value).toContain("Page suivante")
  })
  it("une fiche retirée ne rend ni titre précédent ni prix", () => {
    mocks.query.mockReturnValue({ data: null, isError: false, isPending: false })
    const value = html(<MemberOfferScreen handle="atelier" offerRef={OFFER_REF} />)
    expect(value).toContain("Boutique indisponible")
    expect(value).not.toContain("Sac artisanal")
  })
  it("le slot lit le post autorisé et n'affiche aucune offre en son absence", () => {
    const props = { networkId: "root" as Id<"networks">, postId: "post-test" as Id<"posts"> }
    mocks.query.mockReturnValue({ data: catalogOfferFixture(), isError: false, isPending: false })
    expect(html(<OfferPostSlot {...props} />)).toContain("Sac artisanal")
    expect(mocks.query).toHaveBeenCalledWith("postOffer", props)
    mocks.query.mockReturnValue({ data: null, isError: false, isPending: false })
    expect(html(<OfferPostSlot {...props} />)).toBe("")
    mocks.query.mockReturnValue({ data: catalogOfferFixture(), isError: true, isPending: false })
    expect(html(<OfferPostSlot {...props} />)).not.toContain("Sac artisanal")
  })
})


describe("MP05d — catalogue membre filtré", () => {
  it("transmet toutes les facettes et conserve le prochain lien même si la fenêtre est vide", () => {
    mocks.query.mockReturnValue({ data: catalogPageFixture({ page: [], isDone: false, continueCursor: "next", filteredWindow: true }), isError: false, isPending: false, isFetching: false })
    const search = { kind: "product" as const, collectionRef: "pro.ga:offer_collection:01JA00000000000000000000C1", category: ["fashion.women"], material: ["Lin", "Coton"], audience: ["women"] as Array<"women">, minPrice: 0, maxPrice: 25000, sort: "price_asc" as const, cursor: null }
    const value = html(<MemberCatalogScreen handle="atelier" search={search} />)
    expect(mocks.query).toHaveBeenCalledWith("list", { networkId: "root", handle: "atelier", kind: "product", collectionRef: search.collectionRef, category: search.category, material: ["Coton", "Lin"], audience: search.audience, minPrice: 0, maxPrice: 25000, sort: "price_asc", paginationOpts: { cursor: null, numItems: 12 } })
    expect(value).toContain("categorie=fashion.women")
    expect(value).toContain("matiere=Coton&amp;matiere=Lin")
    expect(value).toContain("curseur=next")
  })
  it("annonce une indexation en cours sans présenter la fenêtre vide comme absence exhaustive", () => {
    mocks.query.mockReturnValue({ data: catalogPageFixture({ page: [], indexStatus: "building" }), isError: false, isPending: false, isFetching: false })
    const value = html(<MemberCatalogScreen handle="atelier" search={{ category: ["fashion"], cursor: null }} />)
    expect(value).toContain("en cours d’indexation")
    expect(value).not.toContain("Aucune offre disponible")
  })
})

describe("pleine largeur des écrans de boutique (décisions du propriétaire du 22/10/2026)", () => {
  it("le catalogue, l'offre et la présentation du prestataire occupent toute la colonne, retour aligné sur le titre", () => {
    mocks.query.mockReturnValue({ data: undefined, isError: true, isPending: false, isFetching: false, refetch: vi.fn() })
    for (const screen of [<MemberCatalogScreen key="catalog" handle="atelier" search={{ cursor: null }} />, <MemberOfferScreen key="offer" handle="atelier" offerRef={OFFER_REF} />, <MemberProviderScreen key="provider" handle="atelier" />]) {
      const classes = frameClasses(html(screen))
      expect(classes).toContain("min-[768px]:[&>a]:self-start")
      expect(centeringClasses(classes)).toEqual([])
    }
  })
  it("les formulaires aussi : toute la colonne, et dès 768 px leur bouton d'envoi garde sa largeur", () => {
    const classes = frameClasses(html(<ShopFrame title="Contacter la boutique"><p>Formulaire</p></ShopFrame>))
    expect(centeringClasses(classes)).toEqual([])
    expect(classes).toContain("min-[768px]:[&>a]:self-start")
    expect(classes).toContain(SCREEN_SUBMIT)
  })
  it("en deux colonnes, l'en-tête de la fiche reste groupé en haut au lieu de s'étirer sur la hauteur du média", () => {
    expect(OFFER_DETAIL_CSS).toMatch(/\.offer-detail-heading \{ grid-column: 2; grid-row: 1; align-content: start; \}/)
  })
})


describe("SU06 — le menu d'une adresse food", () => {
  it("nomme la page Menu et le retour de la fiche sans changer les liens", () => {
    mocks.query.mockImplementation((reference: string) => ({ data: reference === "storefront" ? { model: "products", activityConfiguration: { version: 1, capabilities: ["products"], template: "food", blocks: ["catalog", "about"] } } : reference === "offer" ? catalogOfferFixture() : reference === "checkoutContext" ? { available: false, offer: null, pending: null } : catalogPageFixture(), isError: false, isPending: false, isFetching: false }))
    const value = html(<MemberCatalogScreen handle="atelier" search={{ cursor: null }} />)
    expect(value).toContain(">Menu</h1>")
    const detail = html(<MemberOfferScreen handle="atelier" offerRef={OFFER_REF} />)
    expect(detail).toContain(">Revenir au menu</a>")
    expect(detail).toContain(routes.shopCatalog("atelier"))
  })
})
