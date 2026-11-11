// @vitest-environment jsdom
/**
 * CM-02 — le motif des catégories encadrées dans l'éditeur de boutique : rien tant que la liste ne frappe aucune
 * offre ; la catégorie réglementée qui fait relire la vitrine ; les offres refusées, sans aucun contenu d'offre.
 */
import { createAppI18n } from "@antsia/social-features/i18n"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { I18nextProvider } from "react-i18next"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { appResources } from "@/i18n/resources"

const mocks = vi.hoisted(() => ({ query: vi.fn() }))
vi.mock("@antsia/api/engine", () => ({ api: { modules: { shops: { catalogControl: { categoryRulings: "categoryRulings" } } } } }))
vi.mock("@antsia/api/hooks", () => ({ useAuthenticatedConvexQuery: (reference: string, args: unknown) => mocks.query(reference, args) }))
vi.mock("@antsia/api/network", () => ({ useNetwork: () => ({ networkId: "network-a", personId: "person-a" }) }))

import { CatalogCategoryNotice } from "./catalog-category-notice"

const i18n = createAppI18n({ locale: "fr", appResources, defaultNS: "shops" })
const shopId = "shop-a" as Parameters<typeof CatalogCategoryNotice>[0]["shopId"]
const REFUSED_AT = Date.UTC(2026, 10, 11, 9)
let root: Root, container: HTMLDivElement
const answer = (data: unknown, isError = false) => mocks.query.mockReturnValue({ data, isError, refetch: vi.fn() })
async function render(only?: "regulated") { await act(async () => root.render(<I18nextProvider i18n={i18n}><CatalogCategoryNotice shopId={shopId} {...(only ? { only } : {})} /></I18nextProvider>)) }

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  mocks.query.mockReset()
  container = document.createElement("div"); document.body.append(container); root = createRoot(container)
})
afterEach(async () => { await act(async () => root.unmount()); container.remove() })

describe("CM-02 — motif des catégories pour le gérant", () => {
  it("lit les décisions de SA boutique dans son réseau", async () => {
    answer({ listVersion: 1, refusals: [], truncated: false, regulatedCategory: null })
    await render()
    expect(mocks.query).toHaveBeenCalledWith("categoryRulings", { networkId: "network-a", shopId })
  })

  it("n'affiche rien tant que la liste ne frappe aucune offre (liste vide), ni en chargement, ni en panne", async () => {
    answer({ listVersion: 1, refusals: [], truncated: false, regulatedCategory: null })
    await render()
    expect(container.innerHTML).toBe("")
    answer(undefined)
    await render()
    expect(container.innerHTML).toBe("")
    answer({ listVersion: 1, refusals: [{ offerRef: "pro.ga:offer:X", categoryKey: "electronics.phones", listVersion: 1, revision: 1, withdrewReflection: false, refusedAt: REFUSED_AT }], truncated: false, regulatedCategory: "beauty" }, true)
    await render()
    expect(container.innerHTML).toBe("")
  })

  it("dit la catégorie réglementée qui fait relire la vitrine, par son chemin traduit", async () => {
    answer({ listVersion: 2, refusals: [], truncated: false, regulatedCategory: "electronics.phones" })
    await render()
    expect(container.textContent).toContain(i18n.t("catalog.categoryRules.title"))
    expect(container.textContent).toContain(i18n.t("catalog.categoryRules.regulated", { category: "Électronique / Téléphones" }))
    expect(container.querySelector('[role="status"]')).not.toBeNull()
  })

  it("liste les offres refusées par catégorie et référence, avec la date et le retrait de la vitrine, sans contenu d'offre", async () => {
    answer({
      listVersion: 2, truncated: true, regulatedCategory: null,
      refusals: [
        { offerRef: "pro.ga:offer:01JA00000000000000000000P2", categoryKey: "electronics.phones", listVersion: 2, revision: 3, withdrewReflection: true, refusedAt: REFUSED_AT },
        { offerRef: "pro.ga:offer:01JA00000000000000000000P3", categoryKey: "beauty", listVersion: 2, revision: 1, withdrewReflection: false, refusedAt: REFUSED_AT },
      ],
    })
    await render()
    const text = container.textContent ?? ""
    const date = new Intl.DateTimeFormat("fr", { dateStyle: "medium", timeZone: "Africa/Libreville" }).format(REFUSED_AT)
    expect(text).toContain(i18n.t("catalog.categoryRules.refusedLead"))
    expect(text).toContain(i18n.t("catalog.categoryRules.refusedCategory", { category: "Électronique / Téléphones" }))
    expect(text).toContain(i18n.t("catalog.categoryRules.refusedCategory", { category: "Beauté" }))
    expect(text).toContain(i18n.t("catalog.categoryRules.reference", { reference: "pro.ga:offer:01JA00000000000000000000P2" }))
    expect(text).toContain(i18n.t("catalog.categoryRules.withdrawnOn", { date }))
    expect(text).toContain(i18n.t("catalog.categoryRules.refusedOn", { date }))
    expect(text).toContain(i18n.t("catalog.categoryRules.truncated", { limit: 2 }))
    expect(text).toContain(i18n.t("catalog.categoryRules.howToFix"))
    expect(container.querySelectorAll("li")).toHaveLength(2)
  })

  it("à l'étape Publier, ne montre que la catégorie réglementée", async () => {
    answer({ listVersion: 2, truncated: false, regulatedCategory: "beauty", refusals: [{ offerRef: "pro.ga:offer:X", categoryKey: "electronics.phones", listVersion: 2, revision: 1, withdrewReflection: false, refusedAt: REFUSED_AT }] })
    await render("regulated")
    expect(container.textContent).toContain(i18n.t("catalog.categoryRules.regulated", { category: "Beauté" }))
    expect(container.querySelector("li")).toBeNull()
    answer({ listVersion: 2, truncated: false, regulatedCategory: null, refusals: [{ offerRef: "pro.ga:offer:X", categoryKey: "electronics.phones", listVersion: 2, revision: 1, withdrewReflection: false, refusedAt: REFUSED_AT }] })
    await render("regulated")
    expect(container.innerHTML).toBe("")
  })
})
