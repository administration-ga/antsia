// @vitest-environment jsdom
/** SU06 : l'index consomme les catégories canoniques, avec une URL vivante et des fenêtres bornées. */
import { createAppI18n } from "@antsia/social-features/i18n"
import { act, type ReactNode } from "react"
import { createRoot, type Root } from "react-dom/client"
import { I18nextProvider } from "react-i18next"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ query: vi.fn(), push: vi.fn(), search: "", liveParams: false, listeners: new Set<() => void>(), network: { networkId: "root-a", personId: "person-a" } }))
vi.mock("@antsia/api/engine", () => ({ api: { modules: { shops: { marketplace: { search: "offers", demoSelection: "demo" }, marketplaceShops: { search: "shops" } } } } }))
vi.mock("@antsia/api/hooks", () => ({ useAuthenticatedConvexQuery: (...args: unknown[]) => mocks.query(...args) }))
vi.mock("@antsia/api/network", () => ({ useNetwork: () => mocks.network }))
vi.mock("@/components/member-chrome", () => ({ MemberPage: ({ children }: { children: ReactNode }) => <main data-member-page>{children}</main> }))
vi.mock("@/components/network-shell", () => ({ useMemberSession: () => ({ person: { displayName: "Awa MBA" } }) }))
vi.mock("@/components/marketplace/shop-showcase-card", () => ({ ShopShowcaseCard: ({ storefront }: { storefront: { name: string } }) => <article data-shop-card>{storefront.name}</article> }))
vi.mock("@/components/shops/daily-special", () => ({ DailySpecialTile: ({ shopName }: { shopName: string }) => <li>{shopName}</li> }))
vi.mock("next/navigation", async () => {
  const { useSyncExternalStore } = await import("react")
  return { useRouter: () => ({ push: mocks.push }), useSearchParams: () => {
    const search = useSyncExternalStore(callback => { mocks.listeners.add(callback); return () => { mocks.listeners.delete(callback) } }, () => mocks.search, () => "")
    return mocks.liveParams ? new URLSearchParams(search) : null
  } }
})

import { catalogOfferFixture } from "@/components/shops/__tests__/catalog-fixtures"
import { appResources } from "@/i18n/resources"
import { DEFAULT_FOOD_UNIVERSE_SEARCH, type FoodUniverseSearch } from "@/lib/food-universe-search"
import { routes } from "@/lib/routes"
import { FoodUniverseScreen } from "./food-universe-screen"

type QueryState = { data: unknown; isPending: boolean; isError: boolean; isFetching: boolean; refetch: ReturnType<typeof vi.fn> }
const state = (data: unknown, changes: Partial<QueryState> = {}): QueryState => ({ data, isPending: data === undefined, isError: false, isFetching: false, refetch: vi.fn(), ...changes })
const grocery = catalogOfferFixture({ offerRef: "pro.ga:offer:groceries", shopHandle: "autre-adresse", title: "Une offre publiée", facets: { taxonomyVersion: 1, categoryPath: ["food", "food.groceries"], attributes: [] } })
const beverage = catalogOfferFixture({ offerRef: "pro.ga:offer:beverages", title: "Une autre offre", facets: { taxonomyVersion: 1, categoryPath: ["food", "food.beverages"], attributes: [] } })
const page = (changes: Record<string, unknown> = {}) => ({ indexStatus: "ready", page: [grocery], isDone: true, continueCursor: "", filteredWindow: false, ...changes })
const storefront = { handle: "epicerie", name: "Adresse alimentaire", template: "food", model: "products", dailySpecial: null }
const demoOffer = catalogOfferFixture({ offerRef: "demo:offer:savon", shopHandle: storefront.handle, title: "Savon fictif non classé", facets: undefined })
let root: Root, container: HTMLDivElement, offerState: QueryState, shopState: QueryState, demoState: QueryState
const catalog = () => container.querySelector<HTMLElement>("[data-universe-catalog]")!
const links = () => [...container.querySelectorAll<HTMLAnchorElement>("[data-universe-categories] a")]
const link = (label: string) => [...container.querySelectorAll<HTMLAnchorElement>("a")].find(node => node.textContent === label)
const cards = () => [...catalog().querySelectorAll("[data-offer-card]")]
async function render(search: FoodUniverseSearch = DEFAULT_FOOD_UNIVERSE_SEARCH, locale: "fr" | "en" = "fr") {
  await act(async () => root.render(<I18nextProvider i18n={createAppI18n({ locale, appResources, defaultNS: "marketplace" })}><FoodUniverseScreen search={search} /></I18nextProvider>))
}
async function navigate(search: string) {
  await act(async () => {
    mocks.liveParams = true; mocks.search = search
    window.history.pushState(window.history.state, "", `/restauration${search}`)
    for (const listener of mocks.listeners) listener()
  })
}
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
  mocks.query.mockReset(); mocks.push.mockReset(); mocks.listeners.clear(); mocks.liveParams = false; mocks.search = ""; mocks.network = { networkId: "root-a", personId: "person-a" }
  offerState = state(page()); shopState = state({ page: [storefront] }); demoState = state([])
  mocks.query.mockImplementation((reference: unknown) => reference === "offers" ? offerState : reference === "demo" ? demoState : shopState)
  window.history.replaceState({}, "", "/restauration")
  container = document.createElement("div"); document.body.append(container); root = createRoot(container)
})
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); window.history.replaceState({}, "", "/") })

describe("SU06 — catalogue alimentaire classé", () => {
  it("rend les quatre catégories canoniques, les vraies cartes et une seule catégorie par requête", async () => {
    await render({ category: "food.groceries", cursor: "page-2" })
    expect(links().map(node => node.textContent)).toEqual(["Tous les produits", "Épicerie", "Boissons", "Plats préparés"])
    expect(links().map(node => node.getAttribute("href"))).toEqual([routes.foodUniverse(), routes.foodUniverse({ category: "food.groceries" }), routes.foodUniverse({ category: "food.beverages" }), routes.foodUniverse({ category: "food.prepared" })])
    expect(links().filter(node => node.getAttribute("aria-current") === "page").map(node => node.textContent)).toEqual(["Épicerie"])
    expect(mocks.query).toHaveBeenCalledWith("offers", { networkId: "root-a", kind: "product", category: ["food.groceries"], paginationOpts: { cursor: "page-2", numItems: 12 } })
    expect(cards()).toHaveLength(1)
    // Cette adresse ne figure pas dans la fenêtre des vitrines : le classement canonique reste la source.
    expect(cards()[0]?.textContent).toContain(grocery.title)
    expect(cards()[0]?.querySelector("a")?.getAttribute("href")).toBe(routes.shopOffer(grocery.shopHandle, grocery.offerRef))
    expect(cards()[0]?.querySelector("[data-offer-card-action] button")?.textContent).toBe("Choisir")
    expect(link("Première page")?.getAttribute("href")).toBe(routes.foodUniverse({ category: "food.groceries" }))
  })

  it("conserve la continuation d'une fenêtre filtrée vide et son contexte de catégorie", async () => {
    offerState = state(page({ page: [], isDone: false, continueCursor: "suite-canonique", filteredWindow: true }))
    await render({ category: "food.prepared", cursor: null })
    expect(cards()).toHaveLength(0)
    expect(catalog().textContent).toContain("La suivante peut en contenir")
    expect(catalog().textContent).toContain("Aucun total global n’est annoncé")
    expect(link("Page suivante")?.getAttribute("href")).toBe(routes.foodUniverse({ category: "food.prepared", cursor: "suite-canonique" }))
    expect(link("Première page")).toBeUndefined()
    expect(catalog().textContent).not.toContain("Aucun produit diffusé")
  })

  it("distingue la dernière fenêtre vide et permet de revenir à la première catégorie conservée", async () => {
    offerState = state(page({ page: [], isDone: true }))
    await render({ category: "food.beverages", cursor: "derniere" })
    expect(catalog().textContent).toContain("Aucun produit diffusé n’est disponible dans cette catégorie")
    expect(link("Page suivante")).toBeUndefined()
    expect(link("Première page")?.getAttribute("href")).toBe(routes.foodUniverse({ category: "food.beverages" }))
  })

  it("les transitions et retours SPA remplacent la requête sans réadopter la prop serveur initiale", async () => {
    const initial = { category: "food.groceries" as const, cursor: "ancien" }
    await render(initial)
    offerState = state(page({ page: [beverage], continueCursor: "encore", isDone: false }))
    await navigate("?categorie=food.beverages")
    expect(mocks.query).toHaveBeenCalledWith("offers", { networkId: "root-a", kind: "product", category: ["food.beverages"], paginationOpts: { cursor: null, numItems: 12 } })
    expect(cards()[0]?.textContent).toContain(beverage.title)
    expect(catalog().textContent).not.toContain(grocery.title)
    expect(links().find(node => node.getAttribute("aria-current") === "page")?.textContent).toBe("Boissons")
    await navigate("?categorie=food.groceries&curseur=ancien")
    expect(mocks.query).toHaveBeenLastCalledWith("offers", { networkId: "root-a", kind: "product", category: ["food.groceries"], paginationOpts: { cursor: "ancien", numItems: 12 } })
    expect(initial).toEqual({ category: "food.groceries", cursor: "ancien" })
  })

  it.each(["?categorie=fashion", "?categorie=services.digital", "?categorie=food&categorie=food", "?categorie=food.prepared&curseur=a&curseur=b"])("une transition hors contrat ferme l'ancien écran et toute lecture : %s", async params => {
    await render()
    const before = mocks.query.mock.calls.length
    await navigate(params)
    expect(container.querySelector("[data-universe-catalog]")).toBeNull()
    expect(container.querySelector("[data-universe-shops]")).toBeNull()
    expect(container.textContent).not.toContain(grocery.title)
    expect(container.textContent).toContain("Ce lien vers les catégories alimentaires n’est pas valide")
    expect(mocks.query).toHaveBeenCalledTimes(before)
    expect(link("Voir tous les produits alimentaires")?.getAttribute("href")).toBe(routes.foodUniverse())
  })

  it("garde les exemples fictifs à part à la racine, sans les classer par leur titre ni leur boutique", async () => {
    demoState = state([demoOffer, { ...demoOffer, offerRef: "demo:offer:riz", title: "Riz fictif non classé" }])
    await render()
    expect(container.querySelector("[data-universe-demo]")?.textContent).toContain("Exemples de boutiques — démonstration")
    expect(container.querySelector("[data-universe-demo]")?.textContent).toContain(demoOffer.title)
    expect(catalog().textContent).not.toContain(demoOffer.title)
    expect(container.querySelector("[data-universe-demo]")?.textContent).toContain("n’est pas le catalogue général")
    await render({ category: "food.groceries", cursor: null })
    expect(container.querySelector("[data-universe-demo]")).toBeNull()
    expect(catalog().textContent).not.toContain("Riz fictif")
  })

  it("un défaut des adresses ne masque pas les produits canoniques et une erreur ne garde aucune ancienne carte", async () => {
    shopState = state({ page: [] }, { isError: true })
    await render()
    expect(cards()).toHaveLength(1)
    expect(container.textContent).toContain("Cette section ne peut pas être chargée")
    offerState = state(page(), { isError: true })
    await render()
    expect(cards()).toHaveLength(0)
    expect(catalog().textContent).toContain("Les produits alimentaires ne peuvent pas être chargés")
    const retry = [...catalog().querySelectorAll("button")].find(node => node.textContent === "Réessayer")!
    await act(async () => retry.click())
    expect(offerState.refetch).toHaveBeenCalledOnce()
  })

  it("un curseur devenu invalide propose la première page de la même catégorie", async () => {
    offerState = state(page(), { isError: true })
    await render({ category: "food.prepared", cursor: "ancienne-generation" })
    expect(cards()).toHaveLength(0)
    expect(link("Première page")?.getAttribute("href")).toBe(routes.foodUniverse({ category: "food.prepared" }))
    expect(link("Page suivante")).toBeUndefined()
  })

  it.each(["loading", "building"])("l'état %s cache toute carte précédente et ne prétend pas avoir reçu un reflet", async status => {
    offerState = state(page({ indexStatus: status === "building" ? "building" : "ready" }), { isPending: status === "loading" })
    await render()
    expect(cards()).toHaveLength(0)
    expect(catalog().textContent).toContain(status === "building" ? "L’index des produits alimentaires est en cours de préparation" : "Recherche en cours")
    expect(link("Page suivante")).toBeUndefined()
  })

  it("un changement d'identité réseau emploie le nouveau contexte et ne conserve aucune offre de l'ancien", async () => {
    await render()
    mocks.network = { networkId: "root-b", personId: "person-b" }
    offerState = state(page({ page: [] })); shopState = state({ page: [] }); demoState = state([])
    await render()
    expect(mocks.query).toHaveBeenCalledWith("offers", { networkId: "root-b", kind: "product", category: ["food"], paginationOpts: { cursor: null, numItems: 12 } })
    expect(cards()).toHaveLength(0)
    expect(container.textContent).not.toContain(grocery.title)
  })

  it("les libellés existent aussi en anglais", async () => {
    await render(undefined, "en")
    expect(container.querySelector("h1")?.textContent).toBe("Food and restaurants")
    expect(links().map(node => node.textContent)).toEqual(["All products", "Groceries", "Drinks", "Prepared food"])
    expect(container.querySelector('nav[aria-label="Food categories"]')).not.toBeNull()
  })
})
