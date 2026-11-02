import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ storefront: vi.fn(), locale: "fr" as "fr" | "en" }))
vi.mock("@/lib/public-shops-data", () => ({ loadPublicStorefront: mocks.storefront }))
vi.mock("@/lib/server-session", () => ({ getPublicLocale: async () => mocks.locale }))
vi.mock("@/components/shops/catalog-member-screen", () => ({ MemberCatalogScreen: () => null }))

import { generateMetadata } from "@/app/(membre)/boutique/[handle]/catalogue/page"

const props = () => ({ params: Promise.resolve({ handle: "atelier" }) })
const configuration = (template: "food" | "fashion") => ({ version: 1, capabilities: ["products"], template, blocks: ["catalog", "about"] })
beforeEach(() => { mocks.storefront.mockReset(); mocks.locale = "fr" })

describe("SU06 — métadonnée du catalogue membre", () => {
  it.each([["fr", "Menu"], ["en", "Menu"]] as const)("le gabarit food déjà public nomme le document Menu (%s)", async (locale, title) => {
    mocks.locale = locale
    mocks.storefront.mockResolvedValue({ status: "ready", viewer: "anonymous", data: { model: "products", activityConfiguration: configuration("food"), name: "Nom non nécessaire au titre" } })
    const metadata = await generateMetadata(props())
    expect(metadata).toEqual({ title, robots: { index: false, follow: false } })
    expect(mocks.storefront).toHaveBeenCalledExactlyOnceWith("atelier")
    expect(metadata).not.toHaveProperty("openGraph")
  })

  it("une activité ordinaire garde Catalogue sans exposer son nom", async () => {
    mocks.storefront.mockResolvedValue({ status: "ready", viewer: "authenticated", data: { model: "products", activityConfiguration: configuration("fashion"), name: "Nom non nécessaire au titre" } })
    expect(await generateMetadata(props())).toEqual({ title: "Catalogue", robots: { index: false, follow: false } })
  })

  it("refus, panne, transfert et boutique privée conservent le titre neutre sans nouvelle lecture", async () => {
    for (const result of [{ status: "refused" }, { status: "unavailable" }, { status: "handoff" }, { status: "ready", viewer: "authenticated", data: null }]) {
      mocks.storefront.mockReset().mockResolvedValue(result)
      expect(await generateMetadata(props())).toEqual({ title: "Catalogue", robots: { index: false, follow: false } })
      expect(mocks.storefront).toHaveBeenCalledExactlyOnceWith("atelier")
    }
  })

  it("un handle mal encodé ne déclenche aucune lecture", async () => {
    expect(await generateMetadata({ params: Promise.resolve({ handle: "%E0" }) })).toEqual({ title: "Catalogue", robots: { index: false, follow: false } })
    expect(mocks.storefront).not.toHaveBeenCalled()
  })
})
