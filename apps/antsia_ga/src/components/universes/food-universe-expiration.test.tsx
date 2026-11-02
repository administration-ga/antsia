// @vitest-environment jsdom
import { act, type ReactNode } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

const state = vi.hoisted(() => ({ storefronts: [] as unknown[] }))
vi.mock("@antsia/api/engine", () => ({ api: { modules: { shops: { marketplaceShops: { search: "shops" }, marketplace: { search: "offers", demoSelection: "demo" } } } } }))
vi.mock("@antsia/api/network", () => ({ useNetwork: () => ({ networkId: "root", personId: "reader" }) }))
vi.mock("@antsia/api/hooks", () => ({ useAuthenticatedConvexQuery: (reference: string) => ({
  data: reference === "shops" ? { page: state.storefronts } : reference === "demo" ? [] : { page: [], indexStatus: "ready", isDone: true, continueCursor: "", filteredWindow: false },
  isError: false, isPending: false,
}) }))
vi.mock("next/navigation", () => ({ useSearchParams: () => null }))
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock("@/components/member-chrome", () => ({ MemberPage: ({ children }: { children: ReactNode }) => <main>{children}</main> }))
vi.mock("@/components/marketplace/marketplace-home", () => ({ OfferCards: () => null, SHOWCASE_GRID: "grid" }))
vi.mock("@/components/marketplace/shop-showcase-card", () => ({ ShopShowcaseCard: ({ storefront }: { storefront: { name: string } }) => <div>{storefront.name}</div> }))
vi.mock("@/components/shops/daily-special", () => ({ DailySpecialTile: ({ shopName }: { shopName: string }) => <li>{shopName}</li> }))

import { FoodUniverseScreen } from "./food-universe-screen"

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
  vi.setSystemTime(Date.UTC(2026, 9, 23, 22, 59, 59, 900))
  state.storefronts = [
    { handle: "old", name: "Ancien plat", template: "food", dailySpecial: { day: "2026-10-22", offerRef: "old-dish" } },
    { handle: "food", name: "Restaurant", template: "food", dailySpecial: { day: "2026-10-23", offerRef: "dish" } },
  ]
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

it("retire toute la rangée des plats à minuit, tout en gardant les adresses de l'univers", () => {
  const container = document.createElement("div")
  const root = createRoot(container)
  try {
    act(() => root.render(<FoodUniverseScreen />))
    expect(container.querySelectorAll("[data-universe-specials] li")).toHaveLength(1)
    expect(container.querySelector("[data-universe-shops]")?.textContent).toContain("Restaurant")
    act(() => vi.advanceTimersByTime(121))
    expect(container.querySelector("[data-universe-specials]")).toBeNull()
    expect(container.querySelector("[data-universe-shops]")?.textContent).toContain("Restaurant")
  } finally { act(() => root.unmount()); container.remove() }
})
