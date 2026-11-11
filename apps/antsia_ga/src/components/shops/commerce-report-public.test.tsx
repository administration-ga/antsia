/**
 * UM-03 — « Signaler » sur la fiche d'offre et la vitrine PUBLIQUES : sans compte, une invitation à se connecter
 * qui ramène à la fiche ; connecté, rien (la page publique ne sait pas qui gère la boutique : on signale depuis la
 * fiche membre) ; une offre fictive de démonstration n'a rien à signaler ; sans conditions publiées, rien non plus.
 */
import type { ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ shop: vi.fn(), catalog: vi.fn(), offer: vi.fn(), special: vi.fn(), pause: vi.fn() }))
vi.mock("@/lib/public-shops-data", () => ({ loadPublicStorefront: mocks.shop, loadPublicDailySpecial: mocks.special, loadPublicStorefrontPause: mocks.pause }))
vi.mock("@/lib/public-catalog-data", () => ({ loadPublicCatalog: mocks.catalog, loadPublicOffer: mocks.offer, loadPublicPostOffer: vi.fn() }))
vi.mock("@/lib/server-session", () => ({ getPublicLocale: async () => "fr", configuredMetadataOrigin: () => "https://antsia.ga", getServerViewer: vi.fn(), withinBridgeDeadline: (work: () => Promise<unknown>) => work() }))
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("TEST_NOT_FOUND") }, useSearchParams: () => null, useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock("@/components/public/public-shell", () => ({ PUBLIC_LINK: "public-link", PublicShell: ({ viewer, children }: { viewer: string; children: ReactNode }) => <main data-viewer={viewer}>{children}</main> }))
vi.mock("@/components/public/public-status", () => ({ PublicStatus: ({ status }: { status: string }) => <p data-status={status}>{status}</p> }))
vi.mock("./catalog-filters", () => ({ CatalogFiltersForm: () => <form data-testid="catalog-filters" /> }))

import { routes } from "@/lib/routes"
import { catalogOfferFixture, catalogPageFixture, OFFER_REF } from "./__tests__/catalog-fixtures"
import { PublicOfferScreen } from "./catalog-public-route"
import { PublicStorefrontScreen } from "./public-storefront-route"

const TERMS = { version: 1, publishedAt: 1_792_281_600_000, returns: { summary: "Contactez la boutique avant tout retour." } }
const storefront = { handle: "atelier", name: "Atelier partagé", description: "Notre présentation publique.", logoUrl: null, bannerUrl: null, model: "products", specialty: null, serviceArea: "Libreville", hours: null, badge: "community", blocks: ["about"], publishedAt: 1_700_000_000_000, origin: { slug: "antsia", name: "ANTSIA" } }
const offerInput = () => ({ params: Promise.resolve({ handle: "atelier", offerRef: OFFER_REF }), searchParams: Promise.resolve({}) })
const shopInput = () => ({ params: Promise.resolve({ handle: "atelier" }), searchParams: Promise.resolve({}) })
const invite = (html: string) => /<a[^>]*data-public-report[^>]*>/.exec(html)?.[0] ?? ""

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset()
  mocks.shop.mockResolvedValue({ status: "ready", viewer: "anonymous", data: { ...storefront, storefrontTerms: TERMS } })
  mocks.catalog.mockResolvedValue({ status: "ready", viewer: "anonymous", data: catalogPageFixture() })
  mocks.offer.mockResolvedValue({ status: "ready", viewer: "anonymous", data: catalogOfferFixture() })
  mocks.special.mockResolvedValue({ status: "ready", data: null, viewer: "anonymous" })
  mocks.pause.mockResolvedValue({ status: "ready", data: null, viewer: "anonymous" })
})

describe("UM-03 — fiche d'offre publique", () => {
  it("sans compte : « Se connecter pour signaler », qui ramène à la fiche", async () => {
    const html = renderToStaticMarkup(await PublicOfferScreen(offerInput()))
    const signIn = routes.signIn(undefined, undefined, undefined, undefined, { kind: "offer", handle: "atelier", offerRef: OFFER_REF }).replaceAll("&", "&amp;")
    expect(invite(html)).toContain(`href="${signIn}"`)
    expect(invite(html)).toContain('rel="nofollow"')
    expect(html).toContain("Se connecter pour signaler")
  })

  it("connecté, ou offre fictive : aucune invitation", async () => {
    mocks.offer.mockResolvedValue({ status: "ready", viewer: "authenticated", data: catalogOfferFixture() })
    expect(renderToStaticMarkup(await PublicOfferScreen(offerInput()))).not.toContain("data-public-report")
    mocks.offer.mockResolvedValue({ status: "ready", viewer: "anonymous", data: catalogOfferFixture({ offerRef: "demo:offer:savon-artisanal" }) })
    expect(renderToStaticMarkup(await PublicOfferScreen(offerInput()))).not.toContain("data-public-report")
  })
})

describe("UM-03 — conditions de la vitrine publique", () => {
  it("sans compte : l'invitation sous les conditions publiées ramène à la vitrine", async () => {
    const html = renderToStaticMarkup(await PublicStorefrontScreen(shopInput()))
    const signIn = routes.signIn(undefined, undefined, undefined, undefined, { kind: "storefront", handle: "atelier" }).replaceAll("&", "&amp;")
    expect(invite(html)).toContain(`href="${signIn}"`)
    expect(html.indexOf("data-public-report")).toBeGreaterThan(html.indexOf("data-storefront-terms"))
  })

  it("connecté, ou aucune condition publiée : aucune invitation", async () => {
    mocks.shop.mockResolvedValue({ status: "ready", viewer: "authenticated", data: { ...storefront, storefrontTerms: TERMS } })
    expect(renderToStaticMarkup(await PublicStorefrontScreen(shopInput()))).not.toContain("data-public-report")
    mocks.shop.mockResolvedValue({ status: "ready", viewer: "anonymous", data: storefront })
    expect(renderToStaticMarkup(await PublicStorefrontScreen(shopInput()))).not.toContain("data-public-report")
  })
})
