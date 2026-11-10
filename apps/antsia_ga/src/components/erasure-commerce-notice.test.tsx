// @vitest-environment jsdom
/** P16 : scénarios écrits sans exécution ; le décompte n'est jamais une autorisation d'effacement distant. */
import { createAppI18n } from "@antsia/social-features/i18n"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { I18nextProvider } from "react-i18next"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { appResources } from "@/i18n/resources"
import { routes } from "@/lib/routes"
const state = vi.hoisted(() => ({ data: undefined as { count: number; truncated: boolean } | undefined, pending: true, error: false }))
vi.mock("@antsia/api/engine", () => ({ api: { modules: { shops: { serviceLifecycle: { myUpcomingBookings: "upcoming" } } } } }))
vi.mock("@antsia/api/hooks", () => ({ useAuthenticatedConvexQuery: () => ({ data: state.data, isPending: state.pending, isError: state.error }) }))
import { ErasureCommerceNotice } from "./erasure-commerce-notice"
const i18n = createAppI18n({ locale: "fr", appResources, defaultNS: "antsia" })
let root: Root, container: HTMLDivElement
async function render() { await act(async () => root.render(<I18nextProvider i18n={i18n}><ErasureCommerceNotice /></I18nextProvider>)) }
beforeEach(() => {
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  state.data = undefined; state.pending = true; state.error = false
  container = document.createElement("div"); document.body.append(container); root = createRoot(container)
})
afterEach(async () => { await act(async () => root.unmount()); container.remove() })
describe("avertissement avant effacement", () => {
  it("reste permanent avant tout résultat et dit que le nombre est inconnu", async () => {
    await render()
    expect(container.textContent).toContain(i18n.t("personal.eraseCommerce"))
    expect(container.textContent).toContain(i18n.t("personal.eraseBookingsUnknown"))
    expect([...container.querySelectorAll("a")].map(link => link.getAttribute("href"))).toEqual([routes.serviceRequests(), routes.purchases()])
  })
  it("une erreur ou un chargement avec ancien DTO ne présente jamais son décompte comme courant", async () => {
    state.data = { count: 37, truncated: false }; state.error = true; state.pending = false
    await render()
    expect(container.textContent).toContain(i18n.t("personal.eraseBookingsUnknown"))
    expect(container.textContent).not.toContain("37")
    state.error = false; state.pending = true; await render()
    expect(container.textContent).not.toContain("37")
  })
  it("zéro connu ne masque pas les engagements et ne prétend pas qu'ils sont tous absents", async () => {
    state.data = { count: 0, truncated: false }; state.pending = false; await render()
    expect(container.querySelector('[role="note"]')).not.toBeNull()
    expect(container.textContent).toContain(i18n.t("personal.eraseBookingsNone"))
    expect(container.textContent).toContain(i18n.t("personal.eraseCommerce"))
    expect(container.querySelector("button")).toBeNull()
  })
  it("distingue une fenêtre tronquée et un décompte effectivement observé", async () => {
    state.pending = false; state.data = { count: 0, truncated: true }; await render()
    expect(container.textContent).toContain(i18n.t("personal.eraseBookingsEmptyWindow"))
    state.data = { count: 3, truncated: true }; await render()
    expect(container.textContent).toContain(i18n.t("personal.eraseBookingsMany", { count: 3 }))
  })
})
