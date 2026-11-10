// @vitest-environment jsdom
import { createAppI18n } from "@antsia/social-features/i18n"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { I18nextProvider } from "react-i18next"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ query: vi.fn(), network: { networkId: "root-a", personId: "person-a" } }))
vi.mock("@antsia/api/hooks", () => ({ useAuthenticatedConvexQuery: (...args: unknown[]) => mocks.query(...args) }))
vi.mock("@antsia/api/network", () => ({ useNetwork: () => mocks.network }))

import { appResources } from "@/i18n/resources"
import { routes } from "@/lib/routes"
import { MemberShopDirectory } from "./member-shop-directory"

const storefront = { handle: "atelier", name: "Atelier partagé", logoUrl: null as string | null, model: "products", specialty: "Artisanat", serviceArea: "Libreville", badge: "community", publishedAt: 1_700_000_000_000 }
const i18n = () => createAppI18n({ locale: "fr", appResources, defaultNS: "shops" })
const ui = () => <I18nextProvider i18n={i18n()}><MemberShopDirectory /></I18nextProvider>

function result(data: { page: typeof storefront[]; isDone: boolean; continueCursor: string } | undefined, error = false) {
  return { data, isPending: data === undefined && !error, isFetching: false, isError: error, refetch: vi.fn(), error: error ? new Error("private backend detail") : null }
}

// Rendu par la racine React et `act`, comme les autres suites de l'application (aucune
// bibliothèque de test n'y est déclarée) ; un rôle attendu doit être UNIQUE, comme `getByRole`.
let root: Root, container: HTMLDivElement
async function render() { await act(async () => root.render(ui())) }
async function click(node: HTMLElement | undefined) {
  if (!node) throw new Error("élément à activer absent")
  await act(async () => node.click())
}
const button = (name: string) => [...container.querySelectorAll("button")].find((node) => node.textContent === name)
const link = (name: RegExp) => [...container.querySelectorAll("a")].find((node) => name.test(node.textContent ?? ""))
function single(role: "status" | "alert") {
  const nodes = container.querySelectorAll(`[role="${role}"]`)
  expect(nodes).toHaveLength(1)
  return nodes[0]
}

beforeEach(() => {
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  mocks.query.mockReset(); mocks.network = { networkId: "root-a", personId: "person-a" }
  container = document.createElement("div"); document.body.append(container); root = createRoot(container)
})
afterEach(async () => { await act(async () => root.unmount()); container.remove() })

describe("annuaire membre de vitrines P07", () => {
  it("une fenêtre vide non terminale conserve la page suivante et le réseau courant", async () => {
    mocks.query.mockReturnValue(result({ page: [], isDone: false, continueCursor: "page-2" }))
    await render()
    expect(single("status")?.textContent).toBe(i18n().t("directory.filteredWindow"))
    await click(button(i18n().t("directory.loadMore")))
    expect(mocks.query.mock.calls.at(-1)?.[1]).toEqual({ networkId: "root-a", paginationOpts: { cursor: "page-2", numItems: 12 } })
    expect(button(i18n().t("directory.previousPage"))).toBeTruthy()
  })

  it("rend la vraie identité de page et une destination membre, puis permet le retour à la fenêtre précédente", async () => {
    mocks.query.mockReturnValue(result({ page: [], isDone: false, continueCursor: "page-2" }))
    await render()
    await click(button(i18n().t("directory.loadMore")))
    mocks.query.mockReturnValue(result({ page: [storefront], isDone: true, continueCursor: "" }))
    await render()
    expect(link(/Atelier partagé/)?.getAttribute("href")).toBe(routes.storefront("atelier"))
    expect(link(/Ma boutique/)?.getAttribute("href")).toBe(routes.myShops())
    expect(button(i18n().t("directory.loadMore"))).toBeUndefined()
    await click(button(i18n().t("directory.previousPage")))
    expect(mocks.query.mock.calls.at(-1)?.[1]).toEqual({ networkId: "root-a", paginationOpts: { cursor: null, numItems: 12 } })
  })

  it("distingue chargement, absence terminale et panne sans divulguer la raison backend", async () => {
    mocks.query.mockReturnValue(result(undefined))
    await render()
    expect(single("status")?.textContent).toBe(i18n().t("directory.loading"))
    mocks.query.mockReturnValue(result({ page: [], isDone: true, continueCursor: "" }))
    await render()
    expect(single("status")?.textContent).toBe(i18n().t("directory.empty"))
    expect(button(i18n().t("directory.loadMore"))).toBeUndefined()
    const failed = result(undefined, true)
    mocks.query.mockReturnValue(failed)
    await render()
    expect(single("alert")?.textContent).toContain(i18n().t("directory.errorMessage"))
    expect(single("alert")?.textContent).not.toContain("private backend detail")
    await click(button(i18n().t("directory.retry")))
    expect(failed.refetch).toHaveBeenCalledOnce()
  })

  it("ne reprend pas le curseur d’une autre personne", async () => {
    mocks.query.mockReturnValue(result({ page: [], isDone: false, continueCursor: "page-2" }))
    await render()
    await click(button(i18n().t("directory.loadMore")))
    mocks.network = { networkId: "root-a", personId: "person-b" }
    await render()
    expect(mocks.query.mock.calls.at(-1)?.[1]).toEqual({ networkId: "root-a", paginationOpts: { cursor: null, numItems: 12 } })
  })

  it("valorise le logo admis et le badge projeté sans inventer de produits, avec une action vers la même boutique", async () => {
    const logoUrl = "https://media.example/atelier-logo.jpg"
    mocks.query.mockReturnValue(result({ page: [{ ...storefront, logoUrl }], isDone: true, continueCursor: "" }))
    await render()
    expect(container.querySelector("article img")?.getAttribute("src")).toBe(logoUrl)
    expect(container.querySelector("article")?.textContent).toContain(i18n().t("badges.community"))
    expect(container.querySelector("article")?.textContent).toContain(storefront.specialty)
    expect(container.querySelector("article")?.textContent).toContain(storefront.serviceArea)
    expect(link(new RegExp(i18n().t("storefront.viewStorefront")))?.getAttribute("href")).toBe(routes.storefront(storefront.handle))
    expect(container.querySelector("article ul, article button")).toBeNull()
    mocks.query.mockReturnValue(result({ page: [storefront], isDone: true, continueCursor: "" }))
    await render()
    expect(container.querySelector("article img")).toBeNull()
    expect(link(new RegExp(i18n().t("storefront.viewStorefront")))?.getAttribute("href")).toBe(routes.storefront(storefront.handle))
  })
})
