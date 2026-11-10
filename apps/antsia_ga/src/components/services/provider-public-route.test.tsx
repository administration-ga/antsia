import type { ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ shop: vi.fn(), catalog: vi.fn() }))
vi.mock("@/lib/public-shops-data", () => ({ loadPublicStorefront: mocks.shop }))
vi.mock("@/lib/public-catalog-data", () => ({ loadPublicCatalog: mocks.catalog }))
vi.mock("@/lib/server-session", () => ({ getPublicLocale: async () => "fr", configuredMetadataOrigin: () => "https://antsia.ga" }))
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("TEST_NOT_FOUND") } }))
vi.mock("@/components/public/public-shell", () => ({ PublicShell: ({ viewer, children }: { viewer: string; children: ReactNode }) => <main data-viewer={viewer}>{children}</main> }))
vi.mock("@/components/public/public-status", () => ({ PublicStatus: ({ status }: { status: string }) => <p data-status={status}>{status}</p> }))
vi.mock("./provider-public-content", () => ({ PublicProviderContent: ({ storefront }: { storefront: { name: string } }) => <h1>{storefront.name}</h1> }))

import { PublicProviderMetadata, PublicProviderScreen } from "./provider-public-route"
import { routes } from "@/lib/routes"

const input = () => ({ params: Promise.resolve({ handle: "atelier" }) })
beforeEach(() => {
  vi.clearAllMocks()
  mocks.shop.mockResolvedValue({ status: "ready", viewer: "anonymous", data: { handle: "atelier", name: "Expert atelier", model: "quote_services", description: "Services déclarés" } })
  mocks.catalog.mockResolvedValue({ status: "ready", viewer: "anonymous", data: { page: [], isDone: true, continueCursor: "", collections: [], filteredWindow: false } })
})

describe("MP06 : projection publique de l'espace prestataire", () => {
  it("charge seulement les services et fournit leur canonique", async () => {
    expect(renderToStaticMarkup(await PublicProviderScreen(input()))).toContain("Expert atelier")
    expect(mocks.catalog).toHaveBeenCalledWith("atelier", { kind: "service" }, null, false)
    expect((await PublicProviderMetadata(input())).alternates?.canonical).toBe(`https://antsia.ga${routes.publicProvider("atelier")}`)
  })
  it.each(["handoff", "refused", "unavailable"])("un statut %s ne réadmet aucun contenu anonyme", async status => {
    mocks.shop.mockResolvedValue({ status })
    const html = renderToStaticMarkup(await PublicProviderScreen(input()))
    expect(html).toContain(`data-status="${status}"`)
    expect(mocks.catalog).not.toHaveBeenCalled()
    expect((await PublicProviderMetadata(input())).robots).toEqual({ index: false, follow: false })
  })
  it("refuse une activité produit sans capacité services et ne lance pas son catalogue", async () => {
    mocks.shop.mockResolvedValue({ status: "ready", viewer: "anonymous", data: { handle: "atelier", name: "Produit", model: "products" } })
    await expect(PublicProviderScreen(input())).rejects.toThrow("TEST_NOT_FOUND")
    expect(mocks.catalog).not.toHaveBeenCalled()
    expect((await PublicProviderMetadata(input())).robots).toEqual({ index: false, follow: false })
  })
  it("propage le handoff au catalogue et masque la présentation s'il est refusé", async () => {
    mocks.catalog.mockResolvedValue({ status: "refused" })
    const html = renderToStaticMarkup(await PublicProviderScreen({ ...input(), searchParams: Promise.resolve({ ott: "TEST_OPAQUE" }) }))
    expect(mocks.shop).toHaveBeenCalledWith("atelier", true)
    expect(mocks.catalog).toHaveBeenCalledWith("atelier", { kind: "service" }, null, true)
    expect(html).not.toContain("Expert atelier")
    expect(html).toContain('data-status="refused"')
  })
})
