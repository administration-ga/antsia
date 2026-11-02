import type { ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ load: vi.fn(), catalog: vi.fn(), special: vi.fn() }))
vi.mock("@/lib/public-shops-data", () => ({ loadPublicStorefront: mocks.load, loadPublicDailySpecial: mocks.special }))
vi.mock("@/lib/public-catalog-data", () => ({ loadPublicCatalog: mocks.catalog, loadPublicOffer: vi.fn(), loadPublicPostOffer: vi.fn() }))
vi.mock("@/lib/server-session", () => ({ getPublicLocale: async () => "fr", configuredMetadataOrigin: () => "https://antsia.ga", getServerViewer: vi.fn(), withinBridgeDeadline: (work: () => Promise<unknown>) => work() }))
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("TEST_NOT_FOUND") } }))
vi.mock("@/components/public/public-shell", () => ({ PUBLIC_LINK: "public-link", PublicShell: ({ viewer, children }: { viewer: string; children: ReactNode }) => <main data-viewer={viewer}>{children}</main> }))
vi.mock("@/components/public/public-status", () => ({ PublicStatus: ({ status }: { status: string }) => <p data-status={status}>{status}</p> }))

import { routes } from "@/lib/routes"
import { PublicStorefrontMetadata, PublicStorefrontScreen } from "./public-storefront-route"
import { catalogOfferFixture, catalogPageFixture } from "./__tests__/catalog-fixtures"

const storefront = { handle: "atelier", name: "Atelier partagé", description: "Notre présentation publique.", logoUrl: null, bannerUrl: null, model: "products", specialty: null, serviceArea: "Libreville", hours: null, badge: "community", blocks: ["about"], publishedAt: 1_700_000_000_000, origin: { slug: "antsia", name: "ANTSIA" } }
const props = () => ({ params: Promise.resolve({ handle: "atelier" }), searchParams: Promise.resolve({}) })

beforeEach(() => {
  mocks.load.mockReset()
  mocks.catalog.mockReset()
  mocks.special.mockReset()
  mocks.special.mockResolvedValue({ status: "ready", data: null, viewer: "anonymous" })
  mocks.catalog.mockResolvedValue({ status: "ready", data: catalogPageFixture(), viewer: "anonymous" })
  mocks.load.mockResolvedValue({ status: "ready", data: storefront, viewer: "anonymous" })
})

describe("route de vitrine publique SSR", () => {
  it("sert le contenu réel et une adresse canonique publique distincte de la route membre", async () => {
    const metadata = await PublicStorefrontMetadata(props())
    expect(metadata.title).toBe(storefront.name)
    expect(metadata.robots).toEqual({ index: true, follow: true })
    expect(metadata.alternates?.canonical).toBe(`https://antsia.ga${routes.publicStorefront("atelier")}`)
    const html = renderToStaticMarkup(await PublicStorefrontScreen(props()))
    expect(html).toContain("Atelier partagé")
    expect(html).toContain(`href="${routes.storefront("atelier")}"`)
    expect(html).toContain('data-viewer="anonymous"')
  })

  it("un retrait n’expose plus nom, description ou métadonnées canoniques", async () => {
    mocks.load.mockResolvedValue({ status: "ready", data: null, viewer: "anonymous" })
    const metadata = await PublicStorefrontMetadata(props())
    expect(metadata.robots).toEqual({ index: false, follow: false })
    expect(metadata.alternates).toBeUndefined()
    expect(metadata.openGraph).toBeUndefined()
    expect(JSON.stringify(metadata)).not.toContain(storefront.name)
    await expect(PublicStorefrontScreen(props())).rejects.toThrow("TEST_NOT_FOUND")
  })

  it.each(["refused", "unavailable"])("une lecture %s ne rend aucune vitrine et reste noindex", async (status) => {
    mocks.load.mockResolvedValue({ status })
    const metadata = await PublicStorefrontMetadata(props())
    expect(metadata.robots).toEqual({ index: false, follow: false })
    const html = renderToStaticMarkup(await PublicStorefrontScreen(props()))
    expect(html).toContain(`data-viewer="${status}"`)
    expect(html).toContain(`data-status="${status}"`)
    expect(html).not.toContain(storefront.name)
  })

  it("transmet le handoff OTT à la porte commune et ne rend pas de boutique pendant son adoption", async () => {
    mocks.load.mockResolvedValue({ status: "handoff" })
    const input = { params: Promise.resolve({ handle: "atelier" }), searchParams: Promise.resolve({ ott: "" }) }
    const metadata = await PublicStorefrontMetadata(input)
    const html = renderToStaticMarkup(await PublicStorefrontScreen(input))
    expect(mocks.load).toHaveBeenCalledWith("atelier", true)
    expect(metadata.robots).toEqual({ index: false, follow: false })
    expect(html).toContain('data-status="handoff"')
    expect(html).not.toContain(storefront.name)
  })

  it("ne requête aucun handle mal encodé", async () => {
    const input = { params: Promise.resolve({ handle: "%E0" }) }
    expect((await PublicStorefrontMetadata(input)).robots).toEqual({ index: false, follow: false })
    await expect(PublicStorefrontScreen(input)).rejects.toThrow("TEST_NOT_FOUND")
    expect(mocks.load).not.toHaveBeenCalled()
  })

  it("branche les offres réelles seulement dans un bloc catalogue admis", async () => {
    mocks.load.mockResolvedValue({ status: "ready", data: { ...storefront, blocks: ["about", "catalog"] }, viewer: "anonymous" })
    const html = renderToStaticMarkup(await PublicStorefrontScreen(props()))
    expect(mocks.catalog).toHaveBeenCalledWith("atelier", {}, null, false)
    expect(html).toContain("Sac artisanal")
    expect(html).toContain(routes.publicShopCatalog("atelier"))
  })

  it("un refus lors de la lecture du catalogue remplace le contenu déjà chargé", async () => {
    mocks.load.mockResolvedValue({ status: "ready", data: { ...storefront, blocks: ["about", "catalog"] }, viewer: "anonymous" })
    mocks.catalog.mockResolvedValue({ status: "refused" })
    const html = renderToStaticMarkup(await PublicStorefrontScreen(props()))
    expect(html).toContain('data-status="refused"')
    expect(html).not.toContain(storefront.name)
    expect(html).not.toContain("Sac artisanal")
  })
})


describe("SU06 — vitrine food et projection facultative", () => {
  const foodStorefront = () => ({ ...storefront, blocks: ["catalog", "about"], activityConfiguration: { version: 1, capabilities: ["products"], template: "food", blocks: ["catalog", "about"] } })

  it("branche le plat public admis et appelle le catalogue Menu", async () => {
    mocks.load.mockResolvedValue({ status: "ready", data: foodStorefront(), viewer: "anonymous" })
    const day = new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 10)
    mocks.special.mockResolvedValue({ status: "ready", viewer: "anonymous", data: { version: 1, day, offer: catalogOfferFixture({ title: "Plat publiquement admis" }) } })
    const html = renderToStaticMarkup(await PublicStorefrontScreen(props()))
    expect(mocks.special).toHaveBeenCalledWith("atelier", false)
    expect(html).toContain("Plat publiquement admis")
    expect(html).toContain("data-daily-special")
    expect(html).toContain(">Menu</h2>")
    expect(html).toContain("Voir le menu")
  })

  it("laisse la vitrine lisible si l'ancien backend ignore le complément", async () => {
    mocks.load.mockResolvedValue({ status: "ready", data: foodStorefront(), viewer: "anonymous" })
    mocks.special.mockResolvedValue({ status: "unavailable" })
    const html = renderToStaticMarkup(await PublicStorefrontScreen(props()))
    expect(html).toContain(storefront.name)
    expect(html).toContain("Sac artisanal")
    expect(html).not.toContain("data-daily-special")
  })

  it.each(["refused", "handoff"])("un complément %s ferme le rendu sans conserver le contenu déjà chargé", async status => {
    mocks.load.mockResolvedValue({ status: "ready", data: foodStorefront(), viewer: "anonymous" })
    mocks.special.mockResolvedValue({ status })
    const html = renderToStaticMarkup(await PublicStorefrontScreen(props()))
    expect(html).toContain(`data-status="${status}"`)
    expect(html).not.toContain(storefront.name)
    expect(html).not.toContain("Sac artisanal")
  })

  it("ne consulte pas le complément pour une activité ordinaire", async () => {
    await PublicStorefrontScreen(props())
    expect(mocks.special).not.toHaveBeenCalled()
  })
})
