// @vitest-environment jsdom
import { createAppI18n } from "@antsia/social-features/i18n"
import { act, type ReactNode } from "react"
import { createRoot, type Root } from "react-dom/client"
import { I18nextProvider } from "react-i18next"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ query: vi.fn(), push: vi.fn(), params: null as URLSearchParams | null, network: { networkId: "root-a", personId: "person-a" }, toastSuccess: vi.fn(), toastError: vi.fn() }))
vi.mock("@antsia/api/engine", () => ({ api: { modules: { shops: { marketplace: { search: "offers", demoSelection: "demo" }, marketplaceShops: { search: "shops" } } } } }))
vi.mock("@antsia/api/hooks", () => ({ useAuthenticatedConvexQuery: (...args: unknown[]) => mocks.query(...args) }))
vi.mock("@antsia/api/network", () => ({ useNetwork: () => mocks.network }))
vi.mock("@/components/member-chrome", () => ({ MemberPage: ({ children }: { children: ReactNode }) => <main data-member-page>{children}</main> }))
vi.mock("@/components/network-shell", () => ({ useMemberSession: () => ({ person: { displayName: "Awa MBA" } }) }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }), useSearchParams: () => mocks.params }))
vi.mock("sonner", () => ({ toast: { success: mocks.toastSuccess, error: mocks.toastError } }))

import { appResources } from "@/i18n/resources"
import { catalogOfferFixture } from "@/components/shops/__tests__/catalog-fixtures"
import { readCartBook } from "@/lib/cart-book"
import { routes } from "@/lib/routes"
import type { MarketplaceSearch } from "@/lib/marketplace-search"
import { MarketplaceScreen } from "./marketplace-screen"

type QueryState = { data: unknown; isPending: boolean; isError: boolean; isFetching: boolean; refetch: ReturnType<typeof vi.fn> }
const state = (data: unknown, changes: Partial<QueryState> = {}): QueryState => ({ data, isPending: data === undefined, isError: false, isFetching: false, refetch: vi.fn(), ...changes })
const page = (changes: Record<string, unknown> = {}) => ({ indexStatus: "ready", page: [catalogOfferFixture()], isDone: true, continueCursor: "", filteredWindow: false, ...changes })
const storefront = { handle: "atelier", name: "Atelier partagé", logoUrl: null, bannerUrl: "https://media.example/banniere-atelier.jpg", model: "products", specialty: "Artisanat", serviceArea: "Libreville", badge: "community", publishedAt: 1_700_000_000_000 }
const provider = { ...storefront, handle: "studio", name: "Studio Objectif", bannerUrl: null, model: "quote_services", specialty: null, serviceArea: null }
const defaultSearch: MarketplaceSearch = { view: "products", cursor: null }
let root: Root, container: HTMLDivElement, offerState: QueryState, serviceState: QueryState, shopState: QueryState, demoState: QueryState, demoServiceState: QueryState, width: number
const widthListeners = new Set<() => void>()
const appI18n = (locale: "fr" | "en" = "fr") => createAppI18n({ locale, appResources, defaultNS: "marketplace" })
async function render(search: MarketplaceSearch | null = defaultSearch, locale: "fr" | "en" = "fr", home = false) { await act(async () => root.render(<I18nextProvider i18n={appI18n(locale)}><MarketplaceScreen search={search} home={home} /></I18nextProvider>)) }
const link = (label: string) => [...container.querySelectorAll("a")].find(node => node.textContent === label)
const button = (label: string) => [...document.querySelectorAll("button")].find(node => node.textContent === label)
const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]')
async function click(node: Element | undefined | null) { if (!(node instanceof HTMLElement)) throw new Error("Élément de recette absent"); await act(async () => node.click()) }
async function input(selector: string, value: string) {
  const node = dialog()?.querySelector<HTMLInputElement>(selector) ?? container.querySelector<HTMLInputElement>(selector)
  if (!node) throw new Error(`Champ de recette absent : ${selector}`)
  await setInput(node, value)
}
async function setInput(node: HTMLInputElement, value: string) {
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(node, value); node.dispatchEvent(new Event("input", { bubbles: true })); node.dispatchEvent(new Event("change", { bubbles: true })) })
}
/** Le formulaire de filtres vit dans la feuille « Filtrer » : l'ouvrir d'abord. */
async function openFilters() {
  await click([...document.querySelectorAll("button")].find(node => node.textContent?.startsWith("Filtrer") || node.textContent?.startsWith("Filter")))
  const sheet = dialog()
  if (!sheet) throw new Error("Feuille de filtres absente")
  return sheet
}
async function submitFilters() { await act(async () => dialog()!.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))) }
/** La feuille rend le focus au tour suivant de sa fermeture (Radix). */
async function settle() { await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)) }) }

beforeEach(() => {
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  width = 390; mocks.params = null; widthListeners.clear(); mocks.query.mockReset(); mocks.push.mockReset(); mocks.toastSuccess.mockReset(); mocks.toastError.mockReset(); mocks.network = { networkId: "root-a", personId: "person-a" }
  window.sessionStorage.clear()
  vi.stubGlobal("matchMedia", vi.fn((query: string) => ({ media: query, get matches() { const min = /min-width:\s*(\d+)px/u.exec(query); return min ? width >= Number(min[1]) : false }, addEventListener: (_name: string, listener: () => void) => widthListeners.add(listener), removeEventListener: (_name: string, listener: () => void) => widthListeners.delete(listener) })))
  offerState = state(page()); serviceState = state(page({ page: [] })); shopState = state({ page: [storefront], isDone: true, continueCursor: "", filteredWindow: false }); demoState = state([]); demoServiceState = state([])
  mocks.query.mockImplementation((reference: unknown, args: { kind?: string }) => reference === "demo" ? args.kind === "service" ? demoServiceState : demoState : reference === "shops" ? shopState : args.kind === "service" && serviceState !== offerState ? serviceState : offerState)
  container = document.createElement("div"); document.body.append(container); root = createRoot(container)
})
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals() })

describe("MP04 — résultats de la marketplace : vues, rayons, recherche et fenêtres autorisées", () => {
  it("interroge les produits bornés et rend les vraies cartes, avec l'ajout au panier mais sans préparation", async () => {
    await render()
    expect(mocks.query).toHaveBeenCalledWith("offers", { networkId: "root-a", kind: "product", paginationOpts: { cursor: null, numItems: 12 } })
    expect(mocks.query).toHaveBeenCalledWith("demo", { networkId: "root-a", kind: "product" })
    expect(container.querySelectorAll("h1")).toHaveLength(1)
    expect(container.querySelector("h1")?.textContent).toBe("Bonjour Awa MBA")
    expect(container.textContent).toContain("Sac artisanal")
    expect(container.querySelector("[data-offer-card] a")?.getAttribute("href")).toBe(routes.shopOffer("atelier", catalogOfferFixture().offerRef))
    // L'offre a une variante : elle se choisit avant tout ajout ; aucune préparation ni paiement depuis la carte.
    expect(container.querySelector("[data-offer-card-action] button")?.textContent).toBe("Choisir")
    expect(container.querySelector("[data-offer-card] form, [data-checkout]")).toBeNull()
    expect(container.querySelector('a[aria-label^="Mes paniers"]')?.getAttribute("href")).toBe(routes.cart())
    expect(link("Accueil")?.getAttribute("href")).toBe(routes.marketplaceHome())
    expect(link("Produits")?.getAttribute("aria-current")).toBe("page")
  })

  it("les rayons et les vues conservent la recherche et retirent les facettes", async () => {
    const search: MarketplaceSearch = { view: "products", query: "atelier", category: ["fashion"], brand: ["Atelier"], sort: "relevance", cursor: "page-2" }
    await render(search)
    expect(link("Services")?.getAttribute("href")).toBe(routes.marketplace({ view: "services", query: "atelier", cursor: null }))
    expect(link("Boutiques")?.getAttribute("href")).toBe(routes.marketplace({ view: "shops", query: "atelier", cursor: null }))
    expect(link("Mode")?.getAttribute("href")).toBe(routes.marketplace({ view: "products", category: ["fashion"], query: "atelier", cursor: null }))
    // Une marque filtrée en plus du rayon : aucune pastille ne prétend résumer la recherche.
    expect(container.querySelector('[data-marketplace-pills] [aria-current="page"]')).toBeNull()
    await render({ view: "shops", query: "atelier", cursor: null })
    expect(mocks.query).toHaveBeenCalledWith("shops", { networkId: "root-a", query: "atelier", paginationOpts: { cursor: null, numItems: 12 } })
    const card = container.querySelector("[data-shop-card]")!
    expect(card.textContent).toContain("Atelier partagé")
    expect(card.querySelector("a")?.getAttribute("href")).toBe(routes.storefront("atelier"))
    expect(card.querySelector("img")?.getAttribute("src")).toBe(storefront.bannerUrl)
    expect(card.textContent).toContain("Communauté")
    expect(card.textContent).toContain("Libreville")
    expect(document.querySelector('input[name="category"]')).toBeNull()
    expect(container.querySelector("[data-marketplace-demo]")).toBeNull()
    expect(link("Boutiques")?.getAttribute("aria-current")).toBe("page")
    await render({ view: "services", serviceMode: ["remote", "hybrid"], cursor: null })
    expect(mocks.query).toHaveBeenCalledWith("offers", { networkId: "root-a", kind: "service", serviceMode: ["remote", "hybrid"], paginationOpts: { cursor: null, numItems: 12 } })
    const sheet = await openFilters()
    expect(sheet.querySelector('input[name="serviceMode"][value="remote"]')).not.toBeNull()
  })

  it("une fenêtre vide non terminale continue avec tous les filtres et le curseur dans l'URL", async () => {
    offerState = state(page({ page: [], isDone: false, continueCursor: "signed-next", filteredWindow: true }))
    const search: MarketplaceSearch = { view: "products", category: ["fashion", "fashion.women.clothing"], brand: ["Atelier", "Maison"], audience: ["women", "unisex"], minPrice: 0, maxPrice: 25000, sort: "price_asc", cursor: null }
    await render(search)
    expect(container.textContent).toContain("La suivante peut en contenir")
    expect(link("Page suivante")?.getAttribute("href")).toBe(routes.marketplace({ ...search, cursor: "signed-next" }))
    await render({ ...search, cursor: "signed-next" })
    expect(mocks.query).toHaveBeenCalledWith("offers", { networkId: "root-a", kind: "product", category: search.category, brand: search.brand, audience: search.audience, minPrice: 0, maxPrice: 25000, sort: "price_asc", paginationOpts: { cursor: "signed-next", numItems: 12 } })
    expect(link("Première page")?.getAttribute("href")).toBe(routes.marketplace(search))
    expect(container.textContent).not.toMatch(/résultats au total|sur \d+ résultats/u)
  })

  it("distingue chargement, index en préparation et absence terminale sans recycler d'offre", async () => {
    offerState = state(undefined)
    await render()
    expect(container.textContent).toContain("Recherche en cours")
    offerState = state(page({ indexStatus: "building" }))
    await render()
    expect(container.textContent).toContain("Le catalogue se prépare")
    expect(container.textContent).not.toContain("Sac artisanal")
    const retry = offerState.refetch
    await click(button("Réessayer")); expect(retry).toHaveBeenCalledOnce()
    offerState = state(page({ page: [] }))
    await render()
    expect(container.textContent).toContain("Aucun résultat pour ces filtres")
    expect(link("Page suivante")).toBeUndefined()
  })

  it("masque les anciennes cartes lors d'une panne et permet une nouvelle lecture", async () => {
    offerState = state(page(), { isError: true })
    await render()
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("La marketplace ne peut pas être chargée")
    expect(container.textContent).not.toContain("Sac artisanal")
    await click(button("Réessayer"))
    expect(offerState.refetch).toHaveBeenCalledOnce()
    offerState = state(page(), { isFetching: true })
    await render()
    expect(container.textContent).toContain("Actualisation des résultats")
  })

  it("présente la démo séparément et ne la transforme pas en catalogue ou bouton d'achat", async () => {
    offerState = state(page({ page: [] }))
    demoState = state([catalogOfferFixture({ offerRef: "demo:offer:epicerie-produits", title: "Panier fictif", shopHandle: "epicerie-moussavou-demo", variants: [], variantAxes: [], media: [] })])
    await render()
    const selection = container.querySelector("[data-marketplace-demo]")!
    expect(selection.textContent).toContain("Sélection de démonstration")
    expect(selection.textContent).toContain("Offres fictives")
    expect(selection.textContent).toContain("n’est pas le catalogue général")
    expect(selection.textContent).toContain("Panier fictif")
    expect(selection.querySelector("button, form, [data-checkout]")).toBeNull()
    expect(container.textContent).toContain("Aucun résultat pour ces filtres")
    demoState = state([catalogOfferFixture()], { isError: true })
    await render()
    expect(container.querySelector("[data-marketplace-demo]")?.textContent).not.toContain("Sac artisanal")
  })

  it("garde catalogue et démo distincts sans erreur React après changement de filtres et pagination", async () => {
    const errors = vi.spyOn(console, "error")
    try {
      demoState = state([catalogOfferFixture({ offerRef: "demo:offer:epicerie-produits", title: "Offre fictive", shopHandle: "epicerie-moussavou-demo", variants: [], variantAxes: [], media: [] })])
      await render()
      const filtered: MarketplaceSearch = { view: "products", brand: ["Atelier"], cursor: null }
      await render(filtered)
      await render({ ...filtered, cursor: "next-window" })
      await render(filtered)
      expect(Array.from(container.querySelectorAll("[data-offer-card] h3")).map(node => node.textContent)).toEqual(["Sac artisanal", "Offre fictive"])
      expect(container.querySelectorAll("[data-marketplace-demo]")).toHaveLength(1)
      expect(errors).not.toHaveBeenCalled()
    } finally { errors.mockRestore() }
  })

  it("une URL invalide n'émet aucune recherche, et les clés de réseau changent avec la personne", async () => {
    await render(null)
    expect(mocks.query).not.toHaveBeenCalled()
    expect(container.textContent).toContain("Ce lien de recherche n’est pas valide")
    expect(link("Recommencer la recherche")?.getAttribute("href")).toBe(routes.marketplaceHome())
    await render({ view: "products", cursor: "other-window" })
    mocks.query.mockClear(); mocks.network = { networkId: "root-b", personId: "person-b" }; offerState = state(undefined)
    await render({ view: "products", cursor: null })
    expect(mocks.query).toHaveBeenCalledWith("offers", { networkId: "root-b", kind: "product", paginationOpts: { cursor: null, numItems: 12 } })
    expect(container.textContent).not.toContain("Sac artisanal")
  })

  it("retire une facette appliquée par une nouvelle URL sans reprendre le curseur", async () => {
    await render({ view: "products", brand: ["Atelier", "Maison"], cursor: "signed-next" })
    const active = container.querySelector('ul[aria-label="Filtres actifs"]')!
    await click(active.querySelector<HTMLButtonElement>('button[aria-label="Retirer Atelier"]'))
    expect(mocks.push).toHaveBeenCalledWith(routes.marketplace({ view: "products", brand: ["Maison"], cursor: null }), { scroll: false })
    expect(document.activeElement).toBe(container.querySelector("h1"))
  })

  it.each([320, 390, 834, 1440])("un seul déclencheur de filtres à %i px : flottant sous 1 024 px, dans la barre au-delà", async (nextWidth) => {
    width = nextWidth
    await render()
    expect(container.querySelectorAll("[data-member-page]")).toHaveLength(1)
    expect([...document.querySelectorAll("button")].filter(node => node.textContent?.startsWith("Filtrer"))).toHaveLength(1)
    // Flottant, le bouton vit dans une couche portée hors de l'écran (jamais cadré par un conteneur de requêtes).
    expect(document.querySelector("[data-marketplace-filter-float]") !== null).toBe(nextWidth < 1024)
    expect(container.querySelector("[data-marketplace-filter-float]")).toBeNull()
    // Le seul formulaire de l'écran est la recherche : les filtres attendent l'ouverture de leur feuille.
    expect(container.querySelectorAll("form")).toHaveLength(1)
    expect(container.querySelector("[data-offer-card]")).not.toBeNull()
  })

  it("le déclencheur suit un changement de format sans se doubler", async () => {
    await render()
    expect(document.querySelector("[data-marketplace-filter-float]")).not.toBeNull()
    await act(async () => { width = 1440; widthListeners.forEach(listener => listener()) })
    expect(document.querySelector("[data-marketplace-filter-float]")).toBeNull()
    expect([...document.querySelectorAll("button")].filter(node => node.textContent?.startsWith("Filtrer"))).toHaveLength(1)
  })

  it("applique les choix hiérarchiques, plusieurs marques et les prix puis rend le focus au titre", async () => {
    width = 1440
    await render({ view: "products", cursor: "old-window" })
    const sheet = await openFilters()
    const categories = sheet.querySelector<HTMLDetailsElement>("[data-marketplace-categories]")!
    expect(categories.open).toBe(false)
    await click(categories.querySelector("summary"))
    expect(categories.open).toBe(true)
    await click(sheet.querySelector<HTMLInputElement>('input[name="category"][value="fashion.women.clothing"]'))
    const brandField = () => [...sheet.querySelectorAll("fieldset")].find(field => field.querySelector("legend")?.textContent === "Marques")!
    const brandInput = brandField().querySelector<HTMLInputElement>("input")!
    await setInput(brandInput, "Atelier")
    await click(brandField().querySelector("button"))
    await setInput(brandInput, "Maison")
    await click(brandField().querySelector("button"))
    await input('input[name="minPrice"]', "1000")
    await input('input[name="maxPrice"]', "20000")
    await submitFilters()
    expect(mocks.push).toHaveBeenCalledWith(routes.marketplace({ view: "products", category: ["fashion.women.clothing"], brand: ["Atelier", "Maison"], minPrice: 1000, maxPrice: 20000, sort: "newest", cursor: null }), { scroll: false })
    expect(dialog()).toBeNull()
    await settle()
    expect(document.activeElement).toBe(container.querySelector("h1"))
  })

  it("refuse un intervalle inversé, puis garde pertinence pour une vraie recherche", async () => {
    width = 1440
    await render()
    await openFilters()
    await input('input[name="minPrice"]', "20000"); await input('input[name="maxPrice"]', "1000")
    await submitFilters()
    expect(mocks.push).not.toHaveBeenCalled()
    expect(dialog()?.querySelector('[role="alert"]')?.textContent).toContain("Vérifiez les filtres")
    await input('input[name="minPrice"]', ""); await input('input[name="maxPrice"]', ""); await input('input[name="query"]', "robe en lin")
    expect([...dialog()!.querySelectorAll('select[name="sort"] option')].map(option => option.textContent)).toEqual(["Pertinence"])
    await submitFilters()
    expect(mocks.push).toHaveBeenCalledWith(routes.marketplace({ view: "products", query: "robe en lin", sort: "relevance", cursor: null }), { scroll: false })
  })

  it("une marque répétée reste refusée et un choix peut être retiré avant validation", async () => {
    width = 1440
    await render({ view: "products", brand: ["Atelier"], cursor: null })
    const sheet = await openFilters()
    const field = [...sheet.querySelectorAll("fieldset")].find(node => node.querySelector("legend")?.textContent === "Marques")!
    await setInput(field.querySelector("input")!, "atelier")
    await click(field.querySelector("button"))
    expect(field.querySelector('[role="alert"]')?.textContent).toContain("6 valeurs distinctes")
    expect(field.querySelectorAll("li")).toHaveLength(1)
    await click(field.querySelector<HTMLButtonElement>('button[aria-label="Retirer Atelier"]'))
    expect(field.querySelector("li")).toBeNull()
    await submitFilters()
    expect(mocks.push).toHaveBeenCalledWith(routes.marketplace({ view: "products", sort: "newest", cursor: null }), { scroll: false })
  })

  it("borne les catégories à six sans verrouiller les choix déjà cochés", async () => {
    width = 1440
    await render()
    const sheet = await openFilters()
    await click(sheet.querySelector<HTMLElement>("[data-marketplace-categories] summary"))
    for (const value of ["fashion", "food", "craft", "electronics", "beauty", "home"]) await click(sheet.querySelector<HTMLInputElement>(`input[name="category"][value="${value}"]`))
    expect(sheet.querySelector<HTMLInputElement>('input[name="category"][value="fashion.women"]')?.disabled).toBe(true)
    expect(sheet.querySelector<HTMLInputElement>('input[name="category"][value="fashion"]')?.disabled).toBe(false)
    await click(sheet.querySelector<HTMLInputElement>('input[name="category"][value="fashion"]'))
    expect(sheet.querySelector<HTMLInputElement>('input[name="category"][value="fashion.women"]')?.disabled).toBe(false)
  })

  it("refuse aussi dix-sept mots séparés par tirets dans le formulaire", async () => {
    width = 1440
    await render()
    await openFilters()
    await input('input[name="query"]', Array.from({ length: 17 }, () => "a").join("-"))
    await submitFilters()
    expect(mocks.push).not.toHaveBeenCalled()
    expect(dialog()?.querySelector('[role="alert"]')?.textContent).toContain("16 mots au maximum")
  })

  it("rend les libellés anglais réels et remet les filtres à zéro dans la même vue", async () => {
    await render({ view: "services", query: "design", cursor: "window" }, "en")
    expect(container.textContent).toContain("Products")
    const sheet = await openFilters()
    expect(sheet.textContent).toContain("Service delivery")
    expect(sheet.textContent).not.toContain("filters.serviceMode")
    await click(button("Reset all"))
    expect(mocks.push).toHaveBeenCalledWith(routes.marketplace({ view: "services", cursor: null }), { scroll: false })
  })
})

describe("Accueil de la marketplace (modèle des ventes privées, 22/10/2026)", () => {
  const fixedOffer = () => catalogOfferFixture({ title: "Savon au karité", variants: [], variantAxes: [], price: { mode: "fixed", currency: "XAF", amount: 2500 } })

  it("salue le membre, montre les boutiques en grandes cartes et les moments qui défilent, sans rien d'inventé", async () => {
    shopState = state({ page: [storefront, provider], isDone: true, continueCursor: "", filteredWindow: false })
    offerState = state(page({ page: [fixedOffer()] }))
    serviceState = state(page({ page: [catalogOfferFixture({ offerRef: "pro.ga:offer:01JA00000000000000000000S1", kind: "service", title: "Portrait en studio", variants: [], price: { mode: "quote", currency: "XAF" } })] }))
    demoState = state([catalogOfferFixture({ offerRef: "demo:offer:epicerie-produits", title: "Panier fictif", shopHandle: "epicerie-moussavou-demo", variants: [], variantAxes: [], media: [] })])
    await render(defaultSearch, "fr", true)
    expect(container.querySelector("[data-marketplace-home]")).not.toBeNull()
    expect(container.querySelector("h1")?.textContent).toBe("Bonjour Awa MBA")
    expect(mocks.query).toHaveBeenCalledWith("shops", { networkId: "root-a", paginationOpts: { cursor: null, numItems: 12 } })
    expect(mocks.query).toHaveBeenCalledWith("offers", { networkId: "root-a", kind: "product", paginationOpts: { cursor: null, numItems: 12 } })
    expect(mocks.query).toHaveBeenCalledWith("offers", { networkId: "root-a", kind: "service", paginationOpts: { cursor: null, numItems: 12 } })
    expect(link("Accueil")?.getAttribute("aria-current")).toBe("page")
    expect(container.querySelectorAll('[data-marketplace-pills] [aria-current="page"]')).toHaveLength(1)
    // Les vitrines de produits en grandes cartes ; les prestataires dans un carrousel de grandes cartes.
    const shops = container.querySelector("[data-marketplace-shops]")!
    expect(shops.querySelectorAll("[data-shop-card]")).toHaveLength(1)
    expect(shops.querySelector("img")?.getAttribute("src")).toBe(storefront.bannerUrl)
    expect(container.querySelector('[data-rail="card"]')?.textContent).toContain("Studio Objectif")
    expect(container.querySelector('[data-rail="card"]')?.textContent).toContain("Services sur devis")
    expect(container.textContent).toContain("Savon au karité")
    expect(container.textContent).toContain("Portrait en studio")
    // Une prestation sur devis se consulte depuis sa carte : aucun bouton d'ajout.
    const service = [...container.querySelectorAll("[data-offer-card]")].find(card => card.textContent?.includes("Portrait en studio"))!
    expect(service.querySelector("a")?.getAttribute("href")).toBe(routes.providerOffer("atelier", "pro.ga:offer:01JA00000000000000000000S1"))
    expect(service.querySelector("[data-offer-card-action] button, [data-offer-card-action] a")).toBeNull()
    expect(container.querySelector("[data-marketplace-demo]")?.textContent).toContain("Offres fictives")
    expect(link("Créer ou gérer mon activité")?.getAttribute("href")).toBe(routes.myShops())
    expect(container.textContent).not.toMatch(/Sponsoris|Publicit|Livraison offerte|-\d+ ?%/u)
  })

  it("une section vide, un index en préparation ou une démonstration absente disparaissent", async () => {
    shopState = state({ page: [], isDone: true, continueCursor: "", filteredWindow: false })
    offerState = state(page({ indexStatus: "building", page: [] }))
    await render(defaultSearch, "fr", true)
    expect(container.textContent).toContain("Aucune vitrine n’est encore publiée")
    expect(container.querySelector("[data-rail]")).toBeNull()
    expect(container.querySelector("[data-marketplace-demo]")).toBeNull()
  })

  it("la recherche suggère un vrai rayon, mène aux résultats et refuse une saisie trop longue", async () => {
    await render(defaultSearch, "fr", true)
    const field = container.querySelector<HTMLInputElement>('form[role="search"] input')!
    expect(field.placeholder).toBe("Je cherche « épicerie »")
    await setInput(field, Array.from({ length: 17 }, () => "a").join(" "))
    await act(async () => container.querySelector('form[role="search"]')!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })))
    expect(mocks.push).not.toHaveBeenCalled()
    expect(container.querySelector('form[role="search"] [role="alert"]')?.textContent).toContain("16 mots au maximum")
    await setInput(field, "savon")
    await act(async () => container.querySelector('form[role="search"]')!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })))
    expect(mocks.push).toHaveBeenCalledWith(routes.marketplace({ view: "products", query: "savon" }))
  })

  it("ajoute d'un geste une offre au prix exact sans variante dans le panier de SA boutique", async () => {
    offerState = state(page({ page: [fixedOffer()] }))
    await render(defaultSearch, "fr", true)
    expect(container.querySelector('a[aria-label^="Mes paniers"]')?.getAttribute("aria-label")).toBe("Mes paniers : 0 ligne")
    const add = button("Au panier")!
    expect(add.getAttribute("aria-label")).toBe("Ajouter « Savon au karité » au panier")
    await click(add)
    const book = readCartBook(window.sessionStorage, "root-a", "person-a", Date.now())
    expect(book?.drafts.map(draft => [draft.handle, draft.items])).toEqual([["atelier", [{ offerRef: fixedOffer().offerRef, quantity: 1 }]]])
    expect(mocks.toastSuccess).toHaveBeenCalledWith("Article ajouté au brouillon du panier.", expect.objectContaining({ action: expect.objectContaining({ label: "Ouvrir mes paniers" }) }))
    expect(container.querySelector('a[aria-label^="Mes paniers"]')?.getAttribute("aria-label")).toBe("Mes paniers : 1 ligne")
  })
})

it("MP06 — l'URL vivante remplace le snapshot initial sans rechargement", async () => {
  mocks.params = new URLSearchParams("vue=services&modeCommercial=quote&langue=fr-GA&zone=Libreville&dureeMin=30")
  await render(defaultSearch)
  expect(mocks.query).toHaveBeenCalledWith("offers", { networkId: "root-a", kind: "service", commercialMode: ["quote"], languageCode: ["fr-GA"], serviceZone: ["libreville"], minDurationMinutes: 30, paginationOpts: { cursor: null, numItems: 12 } })
  const sheet = await openFilters()
  expect(sheet.querySelector('input[name="commercialMode"][value="quote"]:checked')).not.toBeNull()
  await act(async () => { document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })) })
  mocks.params = new URLSearchParams("vue=services&langue=fr&langue=FR")
  await render(defaultSearch)
  expect(container.textContent).toContain("Ce lien de recherche n’est pas valide")
  expect(container.querySelector("[data-offer-card]")).toBeNull()
})

it("MP06 — sélectionne une langue par son nom dans la recherche de prestations", async () => {
  await render({ view: "services", cursor: null })
  const sheet = await openFilters()
  const field = sheet.querySelector<HTMLSelectElement>('select[id$="-language"]')!
  expect([...field.options].map(option => option.textContent)).toContain("Anglais")
  await act(async () => { field.value = "en"; field.dispatchEvent(new Event("change", { bubbles: true })) })
  await submitFilters()
  expect(mocks.push).toHaveBeenLastCalledWith(routes.marketplace({ view: "services", languageCode: ["en"], sort: "newest", cursor: null }), { scroll: false })
})

it("MP06 — l'accueil n'apparaît que sans paramètre : une URL de résultats ne le rend jamais", async () => {
  mocks.params = new URLSearchParams("")
  await render(defaultSearch)
  expect(container.querySelector("[data-marketplace-home]")).not.toBeNull()
  mocks.params = new URLSearchParams("vue=produits")
  await render(defaultSearch, "fr", true)
  expect(container.querySelector("[data-marketplace-home]")).toBeNull()
})
