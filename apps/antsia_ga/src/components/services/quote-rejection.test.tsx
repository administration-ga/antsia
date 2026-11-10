// @vitest-environment jsdom
import { createAppI18n } from "@antsia/social-features/i18n"
import { COMMERCE_SERVICE_CONSENTS, COMMERCE_SERVICE_CONTROL_CONTRACT, COMMERCE_SERVICE_CONTROL_CONTRACT_V2 } from "@antsia/social-domain/commerce-services"
import type { ServiceQuoteResult, ServiceRequestDto } from "@convex/modules/shops/serviceRules"
import { act, type ReactNode } from "react"
import { createRoot, type Root } from "react-dom/client"
import { I18nextProvider } from "react-i18next"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { appResources } from "@/i18n/resources"
import { routes } from "@/lib/routes"
import { serviceIntentKey, type ServiceIntentScope } from "@/lib/service-intent"

const mocks = vi.hoisted(() => ({ person: "person-a", contract: "PRO-COMMERCE-SERVICE-CONTROL-V2", controlError: false, lookup: { outcome: "absent" } as unknown, queryError: false, push: vi.fn(), stop: vi.fn(), refetch: vi.fn(), actions: { quotes: vi.fn(), quote: vi.fn(), acceptQuote: vi.fn(), rejectQuote: vi.fn() } }))
vi.mock("@antsia/api/engine", () => ({ api: { modules: { shops: { services: { findByClientRequestId: "lookup", quoteControl: "control", stopClientIntent: "stop" }, serviceActions: { quotes: "quotes", quote: "quote", acceptQuote: "acceptQuote", rejectQuote: "rejectQuote" } } } } }))
vi.mock("@antsia/api/network", () => ({ useNetwork: () => ({ networkId: "network-a", personId: mocks.person }) }))
vi.mock("@antsia/api/hooks", () => ({ useAuthenticatedConvexQuery: (_reference: unknown, args: unknown) => ({ data: _reference === "control" ? { quoteControlContract: mocks.contract } : args === "skip" ? undefined : mocks.lookup, isError: _reference === "control" ? mocks.controlError : mocks.queryError, isPending: false, isFetching: false, refetch: mocks.refetch }) }))
vi.mock("convex/react", () => ({ useConvexAuth: () => ({ isAuthenticated: true }), useAction: (reference: keyof typeof mocks.actions) => mocks.actions[reference], useMutation: () => mocks.stop }))
vi.mock("next/navigation", () => ({ useRouter: () => router }))
vi.mock("@antsia/api/sign-out-everywhere", () => ({ isSigningOutEverywhere: () => false }))
vi.mock("@/components/member-chrome", () => ({ MemberPage: ({ children }: { children: ReactNode }) => <main>{children}</main> }))
import { QuotePanel } from "./service-request-panels"

const router = { push: mocks.push }
const now = Date.UTC(2026, 9, 21, 12)
const scope: ServiceIntentScope = { networkId: "network-a", personId: "person-a", mode: "quote_rejection", handle: "atelier", offerRef: "pro.ga:offer:test", requestRowId: "request-private" }
const i18n = createAppI18n({ locale: "fr", appResources, defaultNS: "services" })
type ReadyQuote = Extract<ServiceQuoteResult, { outcome: "ready" }>
function request(changes: Partial<ServiceRequestDto> = {}): ServiceRequestDto {
  return { requestRowId: "request-private", mode: "quote", handle: scope.handle, offerRef: scope.offerRef, offerTitle: "Prestation", state: "active", reason: null, createdAt: now, updatedAt: now, desiredDate: null, inquiryRef: "pro.ga:inquiry:test", threadId: null, chosenAttachmentCount: null, serviceLabel: "Prestation", booking: null, pendingReplacement: null, order: null, acceptedQuote: null, lastCommand: null, canChange: false, canCancel: false, consentVersions: { inquiry: "v1", quote_accept: "v1", quote_reject: COMMERCE_SERVICE_CONSENTS.quote_rejection.textVersion, booking: "v1", reschedule: "v1", cancel: "v1", order: "v1" }, paymentAvailable: false, ...changes }
}
function quoteResult(changes: Partial<ReadyQuote["quote"]> = {}): ReadyQuote {
  return { outcome: "ready", consentTextVersion: "acceptance-version", rejectionConsentTextVersion: COMMERCE_SERVICE_CONSENTS.quote_rejection.textVersion, quote: { quoteRef: "pro.ga:quote:test", inquiryRef: "pro.ga:inquiry:test", reference: "DEVIS-TEST", title: "Devis professionnel", version: 7, total: { amount: 1500, currency: "XAF" }, validUntil: now + 60_000, state: "sent", sentAt: now, current: true, acceptable: true, rejectable: true, clientAcceptance: null, clientRejection: null, notes: null, sellerLabel: "Atelier", lines: [{ label: "Prestation", quantity: 1, unitAmount: { amount: 1500, currency: "XAF" }, lineAmount: { amount: 1500, currency: "XAF" } }], ...changes } }
}
let root: Root, container: HTMLDivElement, online: boolean
const button = (key: string) => [...container.querySelectorAll("button")].find(node => node.textContent === i18n.t(key))
async function click(node: Element | undefined | null) { if (!node) throw new Error("Commande de recette absente"); await act(async () => (node as HTMLElement).click()) }
async function render(value = request()) { await act(async () => root.render(<I18nextProvider i18n={i18n}><QuotePanel key={mocks.person} request={value} /></I18nextProvider>)) }
async function open() { await click(button("quotes.load")); await click(button("quotes.readAndAccept")); await click(button("quotes.loadDetail")) }
const rejectionForm = () => button("quotes.reject")?.closest("form")
async function agreeRejection() { await click(rejectionForm()?.querySelector('input[type="checkbox"]')) }
async function submit(form: HTMLFormElement | null | undefined = rejectionForm()) { if (!form) throw new Error("Formulaire de recette absent"); await act(async () => form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))) }
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(now)
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  online = true; vi.spyOn(navigator, "onLine", "get").mockImplementation(() => online)
  sessionStorage.clear(); mocks.person = "person-a"; mocks.contract = COMMERCE_SERVICE_CONTROL_CONTRACT_V2; mocks.controlError = false; mocks.lookup = { outcome: "absent" }; mocks.queryError = false
  for (const action of Object.values(mocks.actions)) action.mockReset()
  mocks.push.mockReset(); mocks.stop.mockReset(); mocks.refetch.mockReset()
  const ready = quoteResult(); mocks.actions.quote.mockResolvedValue(ready); mocks.actions.quotes.mockResolvedValue({ outcome: "ready", quotes: [ready.quote], truncated: false }); mocks.actions.rejectQuote.mockRejectedValue(new Error("lost response"))
  container = document.createElement("div"); document.body.append(container); root = createRoot(container)
})
afterEach(async () => { await act(async () => root.unmount()); container.remove(); sessionStorage.clear(); vi.restoreAllMocks(); vi.useRealTimers() })

describe("MP06b — refus client explicite et reprise sans doublon", () => {
  it("lit V2 explicitement, expose version/état/échéance et exige une confirmation décochée", async () => {
    await render(); await open()
    expect(mocks.actions.quotes).toHaveBeenCalledWith({ networkId: "network-a", requestRowId: "request-private", contract: COMMERCE_SERVICE_CONTROL_CONTRACT_V2 })
    expect(mocks.actions.quote).toHaveBeenCalledWith({ networkId: "network-a", requestRowId: "request-private", quoteRef: "pro.ga:quote:test", contract: COMMERCE_SERVICE_CONTROL_CONTRACT_V2 })
    expect(container.textContent).toContain("Version 7")
    expect(container.textContent).toContain(i18n.t("quoteStates.sent"))
    expect(container.textContent).toContain("Valable jusqu’au")
    expect(rejectionForm()?.querySelector<HTMLInputElement>('input[type="checkbox"]')?.checked).toBe(false)
    await submit(); expect(mocks.actions.rejectQuote).not.toHaveBeenCalled()
    expect(rejectionForm()?.textContent).toContain(i18n.t("validation.consent"))
  })
  it("réserve l'intention avant HTTP pour la version affichée, sans total, motif libre ni double envoi", async () => {
    mocks.actions.rejectQuote.mockImplementation(async args => { expect(JSON.parse(sessionStorage.getItem(serviceIntentKey(scope))!).clientRequestId).toBe(args.clientRequestId); throw new Error("lost") })
    await render(); await open(); await agreeRejection(); await submit()
    expect(mocks.actions.rejectQuote).toHaveBeenCalledWith({ networkId: "network-a", requestRowId: "request-private", quoteRef: "pro.ga:quote:test", quoteVersion: 7, consentTextVersion: COMMERCE_SERVICE_CONSENTS.quote_rejection.textVersion, clientRequestId: expect.any(String) })
    expect(mocks.actions.rejectQuote.mock.calls[0]![0]).not.toHaveProperty("acceptedTotal")
    await submit(); expect(mocks.actions.rejectQuote).toHaveBeenCalledOnce()
    expect(button("quotes.accept")?.disabled).toBe(true)
    expect(mocks.actions.acceptQuote).not.toHaveBeenCalled()
  })
  it("après rechargement, recherche le résultat sans nouveau refus et ne libère pas une absence incertaine", async () => {
    await render(); await open(); await agreeRejection(); await submit()
    await act(async () => root.unmount()); root = createRoot(container)
    mocks.lookup = { outcome: "request", requestRowId: "request-private" }
    await render(); await click(button("quotes.load")); await click(button("quotes.readAndAccept"))
    expect(mocks.actions.rejectQuote).toHaveBeenCalledOnce()
    expect(mocks.push).toHaveBeenCalledWith(routes.serviceRequests())
    expect(sessionStorage.getItem(serviceIntentKey(scope))).toBeNull()
  })
  it("une erreur de recherche préserve la clé et ne propose aucun nouvel envoi", async () => {
    await render(); await open(); await agreeRejection(); await submit()
    mocks.queryError = true; await render()
    expect(button("recovery.stop")).toBeUndefined()
    expect(sessionStorage.getItem(serviceIntentKey(scope))).not.toBeNull()
    await submit(); expect(mocks.actions.rejectQuote).toHaveBeenCalledOnce()
  })
  it("une réponse certaine utilise le suivi serveur et distingue le refus client de celui du professionnel", async () => {
    mocks.actions.rejectQuote.mockResolvedValue({ outcome: "request", requestRowId: "request-private", state: "accepted", reason: null })
    await render(); await open(); await agreeRejection(); await submit()
    expect(sessionStorage.getItem(serviceIntentKey(scope))).toBeNull()
    expect(mocks.push).toHaveBeenCalledWith(routes.serviceRequests())
  })
  it.each([
    { rejectable: false }, { current: false }, { state: "withdrawn" as const }, { state: "accepted" as const }, { validUntil: now - 1 },
  ])("n'invente pas un droit de refus pour %j", async changes => {
    mocks.actions.quote.mockResolvedValue(quoteResult(changes))
    await render(); await open()
    expect(button("quotes.reject")).toBeUndefined()
    expect(mocks.actions.rejectQuote).not.toHaveBeenCalled()
  })
  it("une lecture V1 sans consentement V2 ne suffit jamais à montrer le refus", async () => {
    const ready = quoteResult(); delete ready.rejectionConsentTextVersion
    mocks.actions.quote.mockResolvedValue(ready)
    await render(); await open()
    expect(button("quotes.reject")).toBeUndefined()
  })
  it("l'expiration pendant la confirmation retire les deux gestes", async () => {
    await render(); await open(); await agreeRejection()
    await act(async () => { vi.advanceTimersByTime(60_020) })
    expect(button("quotes.reject")).toBeUndefined()
    expect(button("quotes.accept")).toBeUndefined()
    expect(mocks.actions.rejectQuote).not.toHaveBeenCalled()
  })
  it("une relecture de nouvelle version décoche l'accord sans envoyer ni adopter l'ancien accord", async () => {
    await render(); await open(); await agreeRejection()
    mocks.actions.quote.mockResolvedValue(quoteResult({ version: 8 }))
    await click(button("quotes.reloadDetail"))
    expect(rejectionForm()?.querySelector<HTMLInputElement>('input[type="checkbox"]')?.checked).toBe(false)
    expect(container.textContent).toContain("Version 8")
    expect(mocks.actions.rejectQuote).not.toHaveBeenCalled()
  })
  it("hors ligne puis reconnecté, attend une relecture et un nouvel accord", async () => {
    await render(); await open(); await agreeRejection()
    await act(async () => { online = false; window.dispatchEvent(new Event("offline")) }); await submit()
    expect(mocks.actions.rejectQuote).not.toHaveBeenCalled()
    await act(async () => { online = true; window.dispatchEvent(new Event("online")) })
    expect(rejectionForm()?.querySelector<HTMLInputElement>('input[type="checkbox"]')?.checked).toBe(false)
    await click(button("recovery.review"))
    expect(mocks.actions.rejectQuote).not.toHaveBeenCalled()
  })
  it("une preuve de refus reçue s'affiche avec sa version et sa date sans formulaire de nouvelle décision", async () => {
    mocks.actions.quote.mockResolvedValue(quoteResult({ state: "rejected", acceptable: false, rejectable: false, clientRejection: { quoteVersion: 7, rejectedAt: now } }))
    await render(); await open()
    expect(container.textContent).toContain("Refusé par vous : version 7")
    expect(button("quotes.reject")).toBeUndefined()
  })
})


it("V1 reste lisible et acceptable tant que la capacité serveur n'a pas explicitement choisi V2", async () => {
  mocks.contract = COMMERCE_SERVICE_CONTROL_CONTRACT
  mocks.actions.quote.mockResolvedValue(quoteResult({ rejectable: false, clientRejection: null }))
  await render(); await open()
  expect(mocks.actions.quote.mock.calls[0]![0].contract).toBe(COMMERCE_SERVICE_CONTROL_CONTRACT)
  expect(button("quotes.accept")).toBeDefined()
  expect(button("quotes.reject")).toBeUndefined()
})
it("une panne de la capacité serveur ou une erreur V2 ne déclenche aucun repli V1", async () => {
  mocks.controlError = true
  await render()
  expect(button("quotes.load")).toBeUndefined()
  expect(mocks.actions.quotes).not.toHaveBeenCalled()
  mocks.controlError = false; await render()
  mocks.actions.quotes.mockResolvedValue({ outcome: "unavailable" })
  await click(button("quotes.load"))
  expect(mocks.actions.quotes).toHaveBeenCalledOnce()
  expect(mocks.actions.quotes.mock.calls[0]![0].contract).toBe(COMMERCE_SERVICE_CONTROL_CONTRACT_V2)
})

it("une relecture identique réclame aussi une nouvelle confirmation explicite", async () => {
  await render(); await open(); await agreeRejection()
  await click(button("quotes.reloadDetail"))
  expect(rejectionForm()?.querySelector<HTMLInputElement>('input[type="checkbox"]')?.checked).toBe(false)
  expect(mocks.actions.rejectQuote).not.toHaveBeenCalled()
})
it("un changement de capacité serveur retire le résultat V2 sans conserver son droit de refus", async () => {
  await render(); await open(); await agreeRejection()
  mocks.contract = COMMERCE_SERVICE_CONTROL_CONTRACT
  await render()
  expect(button("quotes.reject")).toBeUndefined()
  expect(button("quotes.loadDetail")).toBeUndefined()
  expect(mocks.actions.rejectQuote).not.toHaveBeenCalled()
})
it("le retour tardif d'un autre acteur ne navigue pas et ne supprime pas son intention", async () => {
  let finish!: (value: unknown) => void
  mocks.actions.rejectQuote.mockReturnValue(new Promise(resolve => { finish = resolve }))
  await render(); await open(); await agreeRejection(); await submit()
  mocks.person = "person-b"; await render()
  await act(async () => finish({ outcome: "request", requestRowId: "request-private", state: "accepted", reason: null }))
  expect(mocks.push).not.toHaveBeenCalled()
  expect(sessionStorage.getItem(serviceIntentKey(scope))).not.toBeNull()
})
