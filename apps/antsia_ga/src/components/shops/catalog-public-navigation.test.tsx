// @vitest-environment jsdom
/** Formulaire réel puis nouvelle lecture SSR du catalogue, sans client Convex privé. */
import { createAppI18n } from "@antsia/social-features/i18n"
import { act, type ReactNode } from "react"
import { createRoot, type Root } from "react-dom/client"
import { I18nextProvider } from "react-i18next"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { appResources } from "@/i18n/resources"
import { catalogOfferFixture } from "./__tests__/catalog-fixtures"
import type { CatalogFilters } from "@/lib/catalog-search"

const mocks = vi.hoisted(() => ({ shop: vi.fn(), catalog: vi.fn(), push: vi.fn(), privateQuery: vi.fn(), refresh: vi.fn(), search: "", listeners: new Set<() => void>() }))
vi.mock("@/lib/public-shops-data", () => ({ loadPublicStorefront: mocks.shop }))
vi.mock("@/lib/public-catalog-data", () => ({ loadPublicCatalog: mocks.catalog }))
vi.mock("@/lib/server-session", () => ({ getPublicLocale: async () => "fr", configuredMetadataOrigin: () => "https://antsia.ga", getServerViewer: vi.fn(), withinBridgeDeadline: (work: () => Promise<unknown>) => work() }))
vi.mock("next/navigation", async () => {
  const { useSyncExternalStore } = await import("react")
  const router = { push: mocks.push, refresh: mocks.refresh }
  return { notFound: () => { throw new Error("TEST_NOT_FOUND") }, useRouter: () => router, useSearchParams: () => new URLSearchParams(useSyncExternalStore(callback => { mocks.listeners.add(callback); return () => { mocks.listeners.delete(callback) } }, () => mocks.search, () => "")) }
})
vi.mock("@/components/public/public-shell", () => ({ PUBLIC_LINK: "public-link", PublicShell: ({ viewer, children }: { viewer: string; children: ReactNode }) => <main data-viewer={viewer}>{children}</main> }))
vi.mock("@/components/public/public-status", () => ({ PublicStatus: ({ status }: { status: string }) => <p data-status={status}>{status}</p> }))
vi.mock("@antsia/api/hooks", () => ({ useAuthenticatedConvexQuery: () => { mocks.privateQuery(); throw new Error("Aucun hook privé dans le catalogue public") } }))
import { PublicCatalogScreen } from "./catalog-public-route"

const handle = "epicerie-moussavou-demo", collectionRef = `demo:collection:${handle}`
const offers = [1500, 8500, 2500, 12000].map((amount, index) => catalogOfferFixture({ offerRef: `demo:offer:${["epicerie-produits", "panier-raphia", "savon-artisanal", "sac-wax"][index]}`, shopHandle: handle, title: `Offre ${amount}`, price: { mode: "fixed", currency: "XAF", amount }, collections: [{ collectionRef, label: "Démo" }], variants: [], variantAxes: [], actions: { contact: false, quote: false, purchase: false } }))
let root: Root, container: HTMLDivElement, navigation: Promise<void> | null
async function page(href: string) {
  const url = new URL(href, window.location.origin)
  const searchParams: Record<string, string | string[]> = Object.fromEntries([...new Set(url.searchParams.keys())].map(key => { const values = url.searchParams.getAll(key); return [key, values.length === 1 ? values[0]! : values] }))
  const content = await PublicCatalogScreen({ params: Promise.resolve({ handle }), searchParams: Promise.resolve(searchParams) })
  root.render(<I18nextProvider i18n={createAppI18n({ locale: "fr", appResources, defaultNS: "shops" })}>{content}</I18nextProvider>)
}
async function input(name: string, value: string) { const field = container.querySelector<HTMLInputElement>(`input[name="${name}"]`)!; await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(field, value); field.dispatchEvent(new Event("input", { bubbles: true })); field.dispatchEvent(new Event("change", { bubbles: true })) }) }
async function apply() {
  await act(async () => container.querySelector("summary")!.click())
  await input("minPrice", "2500")
  const sort = container.querySelector<HTMLSelectElement>('select[name="sort"]')!
  await act(async () => { sort.value = "price_desc"; sort.dispatchEvent(new Event("change", { bubbles: true })) })
  await act(async () => { container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); await Promise.resolve() })
  await act(async () => { if (navigation) await navigation })
}
beforeEach(() => {
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  mocks.push.mockReset(); mocks.shop.mockReset(); mocks.catalog.mockReset(); mocks.privateQuery.mockReset(); mocks.refresh.mockReset(); mocks.search = ""; mocks.listeners.clear(); navigation = null
  window.history.replaceState({}, "", `/boutiques/${handle}/catalogue`)
  mocks.shop.mockImplementation(async (_handle, handoff) => handoff ? { status: "handoff" } : { status: "ready", viewer: "anonymous", data: { name: "Épicerie démo", handle } })
  mocks.catalog.mockImplementation(async (_handle, filters: CatalogFilters) => ({ status: "ready", viewer: "anonymous", data: { page: filters.minPrice === 2500 && filters.sort === "price_desc" ? [offers[3], offers[1], offers[2]] : offers, collections: [{ collectionRef, label: "Démo" }], isDone: true, continueCursor: "", filteredWindow: false } }))
  mocks.push.mockImplementation((href: string) => { window.history.pushState(window.history.state, "", href); mocks.search = window.location.search; for (const listener of mocks.listeners) listener() })
  mocks.refresh.mockImplementation(() => { navigation = page(window.location.href) })
  container = document.createElement("div"); document.body.append(container); root = createRoot(container)
})
afterEach(async () => { await act(async () => root.unmount()); container.remove(); window.history.replaceState({}, "", "/"); vi.useRealTimers() })

describe("MP05d — intégration formulaire et SSR public", () => {
  it("lit à nouveau les filtres validés côté serveur et rend les trois prix dans le bon ordre", async () => {
    await act(async () => page(window.location.href))
    expect(container.querySelectorAll("[data-offer-card]")).toHaveLength(4)
    await apply()
    expect(window.location.search).toBe("?prixMin=2500&tri=price_desc")
    expect(mocks.refresh).toHaveBeenCalledTimes(1)
    expect(mocks.catalog).toHaveBeenLastCalledWith(handle, { minPrice: 2500, sort: "price_desc" }, null, false)
    expect([...container.querySelectorAll("[data-offer-card] h3")].map(node => node.textContent)).toEqual(["Offre 12000", "Offre 8500", "Offre 2500"])
    expect(container.querySelector<HTMLDetailsElement>("details")?.open).toBe(false)
    expect(mocks.privateQuery).not.toHaveBeenCalled()
  })
  it("un refus de session pendant la navigation retire les anciennes cartes et interdit tout repli anonyme", async () => {
    await act(async () => page(window.location.href))
    mocks.shop.mockResolvedValue({ status: "refused" })
    const calls = mocks.catalog.mock.calls.length
    await apply()
    expect(container.querySelectorAll("[data-offer-card]")).toHaveLength(0)
    expect(container.querySelector('[data-status="refused"]')).not.toBeNull()
    expect(mocks.catalog).toHaveBeenCalledTimes(calls)
    expect(mocks.privateQuery).not.toHaveBeenCalled()
  })
  it("masque les anciennes offres dès l'URL changée, sans boucler avant le nouveau snapshot SSR", async () => {
    await act(async () => page(window.location.href))
    mocks.refresh.mockImplementation(() => undefined)
    await apply()
    expect(mocks.refresh).toHaveBeenCalledTimes(1)
    expect(container.querySelectorAll("[data-offer-card]")).toHaveLength(0)
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull()
    // Un nouveau rendu de l'ancienne prop serveur ne réactive ni les cartes ni la requête.
    await act(async () => page(`/boutiques/${handle}/catalogue`))
    expect(mocks.refresh).toHaveBeenCalledTimes(1)
    expect(container.querySelectorAll("[data-offer-card]")).toHaveLength(0)
    await act(async () => page(window.location.href))
    expect(container.querySelectorAll("[data-offer-card]")).toHaveLength(3)
    expect(container.querySelector('[aria-busy="true"]')).toBeNull()
  })
  it("une revalidation bloquée ferme l'affichage puis ne réessaie que sur geste explicite", async () => {
    await act(async () => page(window.location.href))
    vi.useFakeTimers()
    mocks.refresh.mockImplementation(() => undefined)
    await apply()
    expect(mocks.refresh).toHaveBeenCalledTimes(1)
    await act(async () => vi.advanceTimersByTime(15_001))
    expect(container.querySelectorAll("[data-offer-card]")).toHaveLength(0)
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("ne peut pas être chargé")
    expect(mocks.refresh).toHaveBeenCalledTimes(1)
    await act(async () => container.querySelector("button")!.click())
    expect(mocks.refresh).toHaveBeenCalledTimes(2)
    expect(mocks.privateQuery).not.toHaveBeenCalled()
  })

  it("une arrivée avec OTT passe au handoff existant sans monter le verrou du catalogue", async () => {
    vi.useFakeTimers()
    mocks.search = "?ott=valid-token&prixMin=2500&tri=price_desc"
    window.history.replaceState({}, "", `/boutiques/${handle}/catalogue${mocks.search}`)
    await act(async () => page(window.location.href))
    expect(mocks.shop).toHaveBeenCalledWith(handle, true)
    expect(mocks.catalog).not.toHaveBeenCalled()
    expect(container.querySelector('[data-status="handoff"]')).not.toBeNull()
    expect(container.querySelectorAll("[data-offer-card]")).toHaveLength(0)
    expect(mocks.refresh).not.toHaveBeenCalled()
    await act(async () => vi.advanceTimersByTime(15_001))
    expect(container.querySelector('[role="alert"]')).toBeNull()
    expect(mocks.privateQuery).not.toHaveBeenCalled()
  })
  it("deux jetons différents sont isolés et leur retrait ne réadmet pas l'ancien snapshot SSR", async () => {
    await act(async () => page(window.location.href))
    mocks.refresh.mockImplementation(() => undefined)
    const navigate = async (search: string) => { await act(async () => mocks.push(`/boutiques/${handle}/catalogue${search}`)) }
    await navigate("?ott=token-A")
    expect(container.querySelectorAll("[data-offer-card]")).toHaveLength(0)
    expect(mocks.refresh).toHaveBeenCalledTimes(1)
    await navigate("?ott=token-B")
    expect(container.querySelectorAll("[data-offer-card]")).toHaveLength(0)
    expect(mocks.refresh).toHaveBeenCalledTimes(2)
    // Le SDK nettoie l'URL avant la preuve : une prop antérieure ne suffit pas.
    await navigate("")
    expect(container.querySelectorAll("[data-offer-card]")).toHaveLength(0)
    expect(mocks.refresh).toHaveBeenCalledTimes(3)
    mocks.shop.mockResolvedValue({ status: "refused" })
    await act(async () => page(window.location.href))
    expect(container.querySelector('[data-status="refused"]')).not.toBeNull()
    expect(container.querySelectorAll("[data-offer-card]")).toHaveLength(0)
    expect(container.textContent).not.toContain("token-A")
    expect(container.textContent).not.toContain("token-B")
    expect(mocks.privateQuery).not.toHaveBeenCalled()
  })
  it("après nettoyage d'un OTT, seule une nouvelle projection serveur sans OTT peut rouvrir le catalogue", async () => {
    await act(async () => page(window.location.href))
    mocks.refresh.mockImplementation(() => undefined)
    await act(async () => mocks.push(`/boutiques/${handle}/catalogue?ott=valid-token`))
    await act(async () => mocks.push(`/boutiques/${handle}/catalogue`))
    expect(container.querySelectorAll("[data-offer-card]")).toHaveLength(0)
    await act(async () => page(window.location.href))
    expect(container.querySelectorAll("[data-offer-card]")).toHaveLength(4)
    expect(container.querySelector('[aria-busy="true"]')).toBeNull()
  })

})
