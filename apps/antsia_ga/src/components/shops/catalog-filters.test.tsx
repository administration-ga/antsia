// @vitest-environment jsdom
import { createAppI18n } from "@antsia/social-features/i18n"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { I18nextProvider } from "react-i18next"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { appResources } from "@/i18n/resources"
import { routes } from "@/lib/routes"
import type { CatalogFilters } from "@/lib/catalog-search"
import { COLLECTION_REF } from "./__tests__/catalog-fixtures"

const mocks = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }))
import { CatalogFiltersForm } from "./catalog-filters"

let root: Root, container: HTMLDivElement
const collections = [{ collectionRef: COLLECTION_REF, label: "Créations locales" }]
async function render(filters: CatalogFilters = {}, audience: "public" | "member" = "member", locale: "fr" | "en" = "fr", provider = false) {
  await act(async () => root.render(<I18nextProvider i18n={createAppI18n({ locale, appResources, defaultNS: "shops" })}><CatalogFiltersForm key={JSON.stringify([filters, audience, locale, provider])} handle="atelier" filters={filters} collections={collections} audience={audience} provider={provider} /></I18nextProvider>))
}
async function input(selector: string, value: string) {
  const field = container.querySelector<HTMLInputElement>(selector)!
  if (!field) throw new Error(`Champ absent : ${selector}`)
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(field, value); field.dispatchEvent(new Event("input", { bubbles: true })); field.dispatchEvent(new Event("change", { bubbles: true })) })
}
async function select(name: string, value: string) { const field = container.querySelector<HTMLSelectElement>(`select[name="${name}"]`)!; await act(async () => { field.value = value; field.dispatchEvent(new Event("change", { bubbles: true })) }) }
async function click(element: HTMLElement | null | undefined) { if (!element) throw new Error("Commande absente"); await act(async () => element.click()) }
async function submit() { await act(async () => container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))) }
beforeEach(() => { (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true; mocks.push.mockReset(); container = document.createElement("div"); document.body.append(container); root = createRoot(container) })
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals() })

describe("MP05d — filtres communs du catalogue", () => {
  it.each([390, 834, 1440])("garde un seul formulaire accessible à %ipx et replie les catégories", async width => {
    vi.stubGlobal("innerWidth", width)
    await render()
    expect(container.querySelectorAll("form")).toHaveLength(1)
    expect(container.querySelector("details")?.open).toBe(false)
    await click(container.querySelector("summary"))
    expect(container.querySelector("details")?.open).toBe(true)
    const categories = container.querySelector<HTMLDetailsElement>("details[data-catalog-categories]")!
    expect(categories.open).toBe(false)
    await click(categories.querySelector("summary"))
    expect(categories.open).toBe(true)
    const checkbox = categories.querySelector<HTMLInputElement>('input[value="fashion.women"]')!
    expect(checkbox.getAttribute("aria-label")).toContain("Mode")
    await click(checkbox)
    expect(checkbox.checked).toBe(true)
    expect(container.querySelectorAll("h1")).toHaveLength(0)
  })
  it.each(["member", "public"] as const)("applique collections, catégories OU, prix et tri via les routes %s", async audience => {
    await render({}, audience)
    await select("type", "product"); await select("collection", COLLECTION_REF)
    await click(container.querySelector('input[value="fashion"]')); await click(container.querySelector('input[value="fashion.women"]'))
    await input('input[name="minPrice"]', "0"); await input('input[name="maxPrice"]', "25000"); await select("sort", "price_asc")
    await submit()
    const filters = { kind: "product" as const, collectionRef: COLLECTION_REF, category: ["fashion", "fashion.women"], minPrice: 0, maxPrice: 25000, sort: "price_asc" as const }
    expect(mocks.push).toHaveBeenCalledWith(audience === "member" ? routes.shopCatalog("atelier", filters) : routes.publicShopCatalog("atelier", filters))
  })
  it("ajoute et retire les valeurs de facettes sans dépasser six, sans doublon", async () => {
    await render({ brand: ["Maison"] })
    const add = () => [...container.querySelectorAll("button")].find(node => node.getAttribute("aria-label") === "Ajouter une valeur à Marques")!
    const field = container.querySelector<HTMLInputElement>(`input[id="${add().parentElement!.querySelector("input")!.id}"]`)!
    await input(`input[id="${field.id}"]`, "Atelier"); await click(add())
    expect(container.querySelector('[aria-label="Retirer Atelier"]')).not.toBeNull()
    await input(`input[id="${field.id}"]`, "maison"); await click(add())
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("valeurs distinctes")
    await click(container.querySelector('[aria-label="Retirer Maison"]'))
    await submit()
    expect(new URL(mocks.push.mock.calls.at(-1)![0], "https://example.test").searchParams.getAll("marque")).toEqual(["Atelier"])
  })
  it("un changement de type retire les catégories étrangères et le tri suit la recherche", async () => {
    await render({ kind: "product", category: ["fashion.women"], audience: ["women"], sort: "price_asc" })
    await select("type", "service")
    expect(container.querySelector('input[name="category"][value="fashion"]')).toBeNull()
    expect(container.querySelector('input[name="serviceMode"][value="remote"]')).not.toBeNull()
    await input('input[name="query"]', "photo")
    expect(container.querySelector<HTMLSelectElement>('select[name="sort"]')?.value).toBe("relevance")
    await submit()
    expect(mocks.push).toHaveBeenCalledWith(routes.shopCatalog("atelier", { kind: "service", query: "photo", sort: "relevance" }))
  })
  it("refuse les prix inversés et une recherche de dix-sept mots séparés par ponctuation", async () => {
    await render(); await input('input[name="minPrice"]', "200"); await input('input[name="maxPrice"]', "100"); await submit()
    expect(mocks.push).not.toHaveBeenCalled(); expect(container.querySelector('[role="alert"]')).not.toBeNull()
    await render({}); await input('input[name="query"]', "a-b-c-d-e-f-g-h-i-j-k-l-m-n-o-p-q"); await submit()
    expect(mocks.push).not.toHaveBeenCalled()
  })
  it("traduit les filtres anglais et réinitialise sans reprendre un curseur", async () => {
    await render({ minPrice: 100 }, "public", "en")
    expect(container.textContent).toContain("Filter and sort")
    await click([...container.querySelectorAll("button")].find(node => node.textContent === "Reset all"))
    expect(mocks.push).toHaveBeenCalledWith(routes.publicShopCatalog("atelier"))
  })
})


it.each(["member", "public"] as const)("MP06 — le formulaire prestataire %s impose les services et les garde au reset", async audience => {
  await render({ kind: "service" }, audience, "fr", true)
  expect(container.querySelector('select[name="type"]')).toBeNull()
  expect(container.querySelector('input[name="category"][value="fashion"]')).toBeNull()
  expect(container.querySelector('[aria-label="Ajouter une valeur à Marques"]')).toBeNull()
  await click(container.querySelector('input[name="commercialMode"][value="quote"]'))
  await input('input[name="minDurationMinutes"]', "30")
  await input('input[name="maxDurationMinutes"]', "60")
  await submit()
  const filters = { kind: "service" as const, commercialMode: ["quote" as const], minDurationMinutes: 30, maxDurationMinutes: 60, sort: "newest" as const }
  expect(mocks.push).toHaveBeenCalledWith(audience === "public" ? routes.publicProviderCatalog("atelier", filters) : routes.providerCatalog("atelier", filters))
  await click([...container.querySelectorAll("button")].find(button => button.textContent === "Tout réinitialiser"))
  expect(mocks.push).toHaveBeenLastCalledWith(audience === "public" ? routes.publicProviderCatalog("atelier", { kind: "service" }) : routes.providerCatalog("atelier", { kind: "service" }))
})

it("MP06 — propose des langues lisibles et transmet le code canonique sans titre technique", async () => {
  await render({ kind: "service" }, "member", "fr", true)
  expect(container.textContent).not.toContain("BCP 47")
  const field = container.querySelector<HTMLSelectElement>('select[id$="-language"]')!
  expect([...field.options].map(option => option.textContent)).toContain("Français")
  await act(async () => { field.value = "fr"; field.dispatchEvent(new Event("change", { bubbles: true })) })
  await submit()
  expect(new URL(mocks.push.mock.calls.at(-1)![0], "https://example.test").searchParams.getAll("langue")).toEqual(["fr"])
})
