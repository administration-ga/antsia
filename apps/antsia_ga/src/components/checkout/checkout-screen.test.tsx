// @vitest-environment jsdom
import { createAppI18n } from "@antsia/social-features/i18n"
import type { CheckoutAttempt } from "@convex/modules/shops/checkoutRules"
import { act, type ReactNode } from "react"
import { createRoot, type Root } from "react-dom/client"
import { I18nextProvider } from "react-i18next"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import fr from "@/i18n/locales/fr/checkout.json"
import en from "@/i18n/locales/en/checkout.json"
import { appResources } from "@/i18n/resources"
import { routes } from "@/lib/routes"

const mocks = vi.hoisted(() => ({ person: "person-a", error: false, attempt: null as CheckoutAttempt | null, context: null as unknown, pause: null as unknown, read: vi.fn(), action: vi.fn(), push: vi.fn(), refetch: vi.fn() }))
vi.mock("@antsia/api/engine", () => ({ api: { modules: { shops: { shops: { storefrontPause: "storefrontPause" }, checkout: { context: "context", getAttempt: "attempt", listMy: "list" }, checkoutActions: { options: "options", prepare: "prepare", status: "status", retry: "retry", release: "release", reconfirm: "reconfirm" } } } } }))
vi.mock("@antsia/api/network", () => ({ useNetwork: () => ({ networkId: "root", personId: mocks.person }) }))
vi.mock("@antsia/api/hooks", () => ({ useAuthenticatedConvexQuery: (reference: string, args: unknown) => { mocks.read(reference, args); return { isPending: false, isError: mocks.error, refetch: mocks.refetch, data: reference === "list" ? { page: mocks.attempt ? [mocks.attempt] : [], isDone: false, continueCursor: "next-page" } : reference === "storefrontPause" ? mocks.pause : reference === "context" && mocks.context !== null ? mocks.context : mocks.attempt } } }))
vi.mock("convex/react", () => ({ useAction: (reference: string) => (args: unknown) => mocks.action(reference, args), useConvexAuth: () => ({ isAuthenticated: true }) }))
vi.mock("@antsia/api/sign-out-everywhere", () => ({ isSigningOutEverywhere: () => false }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }))
vi.mock("@/components/payment/payment-checkout-panel", () => ({ PaymentCheckoutPanel: () => null }))
vi.mock("@/components/member-chrome", () => ({ MemberPage: ({ children }: { children: ReactNode }) => <main>{children}</main> }))

import { CheckoutAttemptScreen, CheckoutOrdersScreen, CheckoutPrepareScreen } from "./checkout-screen"
import { checkoutDate } from "./checkout-model"
import { catalogOfferFixture, checkoutAttemptFixture, checkoutResultFixture, NOW, OFFER_REF } from "./checkout-fixtures.test-support"

const i18n = createAppI18n({ locale: "fr", appResources: { fr: { ...appResources.fr, checkout: fr }, en: { ...appResources.en, checkout: en } }, defaultNS: "checkout" })
let root: Root
let container: HTMLDivElement
async function render(children: ReactNode = <CheckoutAttemptScreen attemptId="attempt-opaque-a" />) { await act(async () => root.render(<I18nextProvider i18n={i18n}>{children}</I18nextProvider>)) }
const button = (label: string) => [...container.querySelectorAll("button")].find((node) => node.textContent === label)
async function click(node: HTMLElement) { await act(async () => node.click()) }
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(NOW)
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement("div"); document.body.append(container); root = createRoot(container)
  mocks.person = "person-a"; mocks.error = false; mocks.attempt = checkoutAttemptFixture(); mocks.context = null; mocks.pause = null
  mocks.read.mockClear(); mocks.action.mockReset(); mocks.push.mockReset(); mocks.refetch.mockReset()
  mocks.action.mockResolvedValue({ outcome: "attempt", attemptId: "attempt-opaque-a" })
})
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.useRealTimers() })

describe("suivi privé et reprise de préparation", () => {
  it("reprend le résultat inconnu par le même identifiant, sans préparer une autre commande", async () => {
    mocks.attempt = checkoutAttemptFixture({ state: "unknown", result: null, expiresAt: null, canRetry: true, canRelease: false })
    await render()
    expect(container.textContent).toContain("Résultat inconnu")
    expect(mocks.action).not.toHaveBeenCalled()
    await click(button("Reprendre cette tentative")!)
    expect(mocks.action).toHaveBeenCalledWith("retry", { networkId: "root", attemptId: "attempt-opaque-a" })
    expect(mocks.action.mock.calls.some(([reference]) => reference === "prepare")).toBe(false)
  })
  it("compare les conditions puis exige un accord neuf et le total actuellement affiché", async () => {
    const original = checkoutResultFixture()
    const result = checkoutResultFixture({ lines: [{ ...original.lines[0]!, unitAmount: { amount: 28000, currency: "XAF" }, lineAmount: { amount: 28000, currency: "XAF" }, catalogRevision: 4 }], total: { amount: 28200, currency: "XAF" } })
    mocks.attempt = checkoutAttemptFixture({ state: "reconfirm", canReconfirm: true, result })
    await render()
    expect(container.textContent).toContain("Conditions demandées")
    expect(container.textContent).toContain("Conditions proposées")
    expect(button("Reconfirmer ces conditions")!.disabled).toBe(true)
    const checkbox = container.querySelector('input[type="checkbox"]') as HTMLInputElement
    expect(checkbox.checked).toBe(false)
    await click(checkbox); await click(button("Reconfirmer ces conditions")!)
    expect(mocks.action).toHaveBeenCalledWith("reconfirm", { networkId: "root", attemptId: "attempt-opaque-a", consentTextVersion: "version-serveur-courante", acceptedTotal: result.total, clientRequestId: expect.any(String) })
  })
  it("bloque la reconfirmation à l'échéance locale sans demander de prolongation", async () => {
    mocks.attempt = checkoutAttemptFixture({ state: "reconfirm", canReconfirm: true, expiresAt: NOW + 1000 })
    await render()
    expect(button("Reconfirmer ces conditions")).toBeDefined()
    await act(async () => { vi.advanceTimersByTime(1020) })
    expect(container.textContent).toContain("Échéance dépassée")
    expect(button("Reconfirmer ces conditions")).toBeUndefined()
    expect(mocks.action).not.toHaveBeenCalled()
  })
  it("P18b (A17) : la réserve s'annonce deux minutes avant son échéance, sans aucune prolongation proposée", async () => {
    mocks.attempt = checkoutAttemptFixture({ state: "held", expiresAt: NOW + 5 * 60_000 })
    await render()
    const status = container.querySelector('[role="status"].sr-only')!
    expect(status.textContent).toBe("")
    await act(async () => { vi.advanceTimersByTime(3 * 60_000 + 20) })
    const expected = i18n.t("expiringSoon", { date: checkoutDate(NOW + 5 * 60_000, "fr") })
    expect(status.textContent).toBe(expected)
    expect(container.textContent).toContain(expected)
    expect([...container.querySelectorAll("button")].some((node) => /prolong/i.test(node.textContent ?? ""))).toBe(false)
    expect(mocks.action).not.toHaveBeenCalled()
    await act(async () => { vi.advanceTimersByTime(2 * 60_000) })
    expect(status.textContent).toBe("")
    expect(container.textContent).toContain("Échéance dépassée")
  })
  it("reprend une reconfirmation interrompue avec la même clé et ouvre sa nouvelle tentative", async () => {
    mocks.attempt = checkoutAttemptFixture({ state: "reconfirm", canReconfirm: true })
    mocks.action.mockRejectedValueOnce(new Error("response lost")).mockResolvedValueOnce({ outcome: "attempt", attemptId: "reconfirmed-attempt" })
    await render()
    await click(container.querySelector('input[type="checkbox"]') as HTMLInputElement)
    await click(button("Reconfirmer ces conditions")!)
    const first = mocks.action.mock.calls[0]!
    await click(button("Reconfirmer ces conditions")!)
    expect(mocks.action.mock.calls[1]).toEqual(first)
    expect(mocks.push).toHaveBeenCalledWith(routes.checkoutAttempt("reconfirmed-attempt"))
  })
  it("n'abandonne qu'après une confirmation explicite et appelle release réel", async () => {
    await render()
    expect(button("Abandonner et libérer la réserve")!.disabled).toBe(true)
    await click(container.querySelector('input[type="checkbox"]') as HTMLInputElement)
    await click(button("Abandonner et libérer la réserve")!)
    expect(mocks.action).toHaveBeenCalledWith("release", { networkId: "root", attemptId: "attempt-opaque-a" })
  })
  it("un refus de lecture masque le DTO précédent et ses anciens montants", async () => {
    await render()
    expect(container.textContent).toContain("Sac artisanal")
    mocks.error = true
    await render()
    expect(container.textContent).toContain("Cette préparation est indisponible")
    expect(container.textContent).not.toContain("Sac artisanal")
    expect(button("Abandonner et libérer la réserve")).toBeUndefined()
  })
  it("un refus d'action ferme immédiatement l'ancien récapitulatif", async () => {
    mocks.action.mockResolvedValue({ outcome: "refused" })
    await render()
    await click(button("Consulter le statut serveur")!)
    expect(container.textContent).toContain("Cette préparation est indisponible")
    expect(container.textContent).not.toContain("Sac artisanal")
    expect(button("Abandonner et libérer la réserve")).toBeUndefined()
  })
  it("une réponse tardive d'une autre session ne provoque ni navigation ni réadoption du reçu", async () => {
    mocks.attempt = checkoutAttemptFixture({ state: "unknown", result: null, canRetry: true, canRelease: false })
    let resolve!: (value: unknown) => void
    mocks.action.mockReturnValue(new Promise((done) => { resolve = done }))
    await render(); await click(button("Reprendre cette tentative")!)
    mocks.person = "person-b"; mocks.attempt = null
    await render()
    await act(async () => resolve({ outcome: "attempt", attemptId: "foreign-attempt" }))
    expect(mocks.push).not.toHaveBeenCalled()
    expect(mocks.refetch).not.toHaveBeenCalled()
  })
  it("ouvre une liste privée paginée et son suivi réel, sans inventer un total", async () => {
    await render(<CheckoutOrdersScreen />)
    expect(mocks.read).toHaveBeenCalledWith("list", { networkId: "root", paginationOpts: { cursor: null, numItems: 10 } })
    expect(container.querySelector(`a[href="${routes.checkoutAttempt("attempt-opaque-a")}"]`)).not.toBeNull()
    await click(button("Page suivante")!)
    expect(mocks.read).toHaveBeenLastCalledWith("list", { networkId: "root", paginationOpts: { cursor: "next-page", numItems: 10 } })
    expect(container.textContent).not.toContain("préparations au total")
  })
})

describe("CM-10 — préparation d'une boutique fermée temporairement", () => {
  const context = () => ({ available: true, reason: null, pending: null, consentTextVersion: "version-serveur", offer: catalogOfferFixture() })
  it("le bandeau dit la réouverture et aucune préparation ne s'ouvre d'ici là", async () => {
    mocks.context = context(); mocks.pause = { pausedUntil: NOW + 2 * 86_400_000 }
    await render(<CheckoutPrepareScreen handle="atelier" offerRef={OFFER_REF} />)
    expect(mocks.read).toHaveBeenCalledWith("storefrontPause", expect.objectContaining({ networkId: "root", handle: "atelier" }))
    expect(container.querySelector("[data-shop-pause]")?.textContent).toContain(i18n.t("shops:pause.bannerTitle"))
    expect(button(i18n.t("loadOptions"))?.disabled).toBe(true)
  })
  it("boutique ouverte : ni bandeau ni blocage", async () => {
    mocks.context = context()
    await render(<CheckoutPrepareScreen handle="atelier" offerRef={OFFER_REF} />)
    expect(container.querySelector("[data-shop-pause]")).toBeNull()
    expect(button(i18n.t("loadOptions"))?.disabled).toBe(false)
  })
})
