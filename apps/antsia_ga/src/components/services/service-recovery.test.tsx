// @vitest-environment jsdom
import { createAppI18n } from "@antsia/social-features/i18n"
import type { ServiceRequestDto, ServiceQuoteResult } from "@convex/modules/shops/serviceRules"
import { act, type ReactNode } from "react"
import { createRoot, type Root } from "react-dom/client"
import { I18nextProvider } from "react-i18next"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { catalogOfferFixture } from "@/components/shops/__tests__/catalog-fixtures"
import { appResources } from "@/i18n/resources"
import { serviceIntentKey, SERVICE_INTENT_TTL_MS, type ServiceIntentScope } from "@/lib/service-intent"
import { routes } from "@/lib/routes"

const mocks = vi.hoisted(() => ({ person: "person-a", catalog: null as unknown, lookup: { outcome: "absent" } as unknown, queryError: false, push: vi.fn(), stop: vi.fn(), refetch: vi.fn(),
  actions: { options: vi.fn(), orderService: vi.fn(), slots: vi.fn(), quotes: vi.fn(), quote: vi.fn(), acceptQuote: vi.fn(), rejectQuote: vi.fn(), refresh: vi.fn(), reschedule: vi.fn(), cancel: vi.fn() } }))
vi.mock("@antsia/api/engine", () => ({ api: { modules: { shops: { catalog: { offer: "catalog" }, services: { findByClientRequestId: "lookup", quoteControl: "control", stopClientIntent: "stop" }, serviceActions: { options: "options", orderService: "orderService", slots: "slots", quotes: "quotes", quote: "quote", acceptQuote: "acceptQuote", rejectQuote: "rejectQuote", refresh: "refresh", reschedule: "reschedule", cancel: "cancel" } } } } }))
vi.mock("@antsia/api/network", () => ({ useNetwork: () => ({ networkId: "network-a", personId: mocks.person }) }))
vi.mock("@antsia/api/hooks", () => ({ useAuthenticatedConvexQuery: (_ref: string, args: unknown) => ({ data: _ref === "catalog" ? mocks.catalog : _ref === "control" ? { quoteControlContract: "PRO-COMMERCE-SERVICE-CONTROL-V1" } : args === "skip" ? undefined : mocks.lookup, isError: mocks.queryError, isPending: false, isFetching: false, refetch: mocks.refetch }) }))
vi.mock("convex/react", () => ({ useConvexAuth: () => ({ isAuthenticated: true }), useAction: (ref: keyof typeof mocks.actions) => mocks.actions[ref], useMutation: () => mocks.stop }))
vi.mock("next/navigation", () => ({ useRouter: () => router } ))
vi.mock("@antsia/api/sign-out-everywhere", () => ({ isSigningOutEverywhere: () => false }))
vi.mock("@/components/member-chrome", () => ({ MemberPage: ({ children }: { children: ReactNode }) => <main>{children}</main> }))
import { ServiceInitialIntentBoundary, useServiceReview } from "./service-intent-guard"
import { ServiceOrderForm } from "./service-order-screen"
import { BookingPanel, QuotePanel } from "./service-request-panels"
import { ServiceSlotPicker } from "./service-slot-picker"

const router = { push: mocks.push }
const now = Date.UTC(2026, 9, 20, 12)
const scope: ServiceIntentScope = { networkId: "network-a", personId: "person-a", mode: "fixed_order", handle: "atelier", offerRef: "pro.ga:offer:test" }
const fixed = { unitAmount: { amount: 1500, currency: "XAF" as const }, unit: null, catalogRevision: 3, quantityMax: 10, leadTimeDays: null }
const i18n = createAppI18n({ locale: "fr", appResources, defaultNS: "services" })
let root: Root, container: HTMLDivElement, online: boolean
const button = (key: string) => [...container.querySelectorAll("button")].find((node) => node.textContent === i18n.t(key))!
const entry = () => <ServiceInitialIntentBoundary key={mocks.person} mode="fixed_order" handle={scope.handle} offerRef={scope.offerRef}><ServiceOrderForm handle={scope.handle} offerRef={scope.offerRef} fixedOrder={fixed} /></ServiceInitialIntentBoundary>
async function render(children: ReactNode = entry()) { await act(async () => root.render(<I18nextProvider i18n={i18n}>{children}</I18nextProvider>)) }
async function click(node: Element) { await act(async () => (node as HTMLElement).click()) }
async function agree() { await click(container.querySelector('input[type="checkbox"]')!) }
async function submit() { await act(async () => { container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })) }) }
async function remount() { await act(async () => root.unmount()); root = createRoot(container); await render() }
function request(): ServiceRequestDto {
  return { requestRowId: "request-private", mode: "booking", handle: scope.handle, offerRef: scope.offerRef, offerTitle: "Prestation", state: "active", reason: null, createdAt: now, updatedAt: now, desiredDate: null, inquiryRef: "pro.ga:inquiry:test", threadId: null, chosenAttachmentCount: null, serviceLabel: "Prestation",
    booking: { appointmentRef: "pro.ga:appointment:test", serviceRef: "pro.ga:service:test", serviceLabel: "Prestation", resourceLabel: null, startAt: now + 86_400_000, endAt: now + 90_000_000, timeZone: "Africa/Libreville", state: "confirmed", holdExpiresAt: null, revision: 4, updatedAt: now, cancellation: null, replacementRef: null, replacesRef: null, policy: { changeUntil: now + 86_400_000, cancelUntil: now + 86_400_000, changeRequiresConfirmation: true, deposit: "unavailable" }, observedAt: now },
    pendingReplacement: null, order: null, acceptedQuote: null, lastCommand: null, canChange: true, canCancel: true, consentVersions: { inquiry: "v1", quote_accept: "v1", quote_reject: "v2", booking: "v1", reschedule: "v1", cancel: "v1", order: "v1" }, paymentAvailable: false }
}
function quoteResult(): Extract<ServiceQuoteResult, { outcome: "ready" }> {
  return { outcome: "ready", consentTextVersion: "quote-consent-version", quote: { quoteRef: "pro.ga:quote:test", inquiryRef: "pro.ga:inquiry:test", reference: "DEVIS-TEST", title: "Devis", version: 7, total: { amount: 1500, currency: "XAF" }, validUntil: now + 1000, state: "sent", sentAt: now, current: true, acceptable: true, clientAcceptance: null, rejectable: false, clientRejection: null, notes: null, sellerLabel: "Atelier", lines: [{ label: "Prestation", quantity: 1, unitAmount: { amount: 1500, currency: "XAF" }, lineAmount: { amount: 1500, currency: "XAF" } }] } }
}
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(now)
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  online = true; vi.spyOn(navigator, "onLine", "get").mockImplementation(() => online)
  sessionStorage.clear(); mocks.person = "person-a"; mocks.lookup = { outcome: "absent" }; mocks.queryError = false
  for (const action of Object.values(mocks.actions)) action.mockReset()
  mocks.stop.mockReset(); mocks.push.mockReset(); mocks.refetch.mockReset()
  mocks.catalog = catalogOfferFixture({ kind: "service", offerRef: scope.offerRef, price: { mode: "fixed", currency: "XAF", amount: fixed.unitAmount.amount }, revision: fixed.catalogRevision, variants: [], leadTimeDays: null, serviceProfile: { version: 1, commercialModes: ["fixed_order"], languageCodes: [], zones: [], deliverables: ["Prestation définie"], inclusions: [], exclusions: [], portfolio: [] } })
  mocks.refetch.mockImplementation(async () => ({ data: mocks.catalog, isError: false }))
  mocks.actions.orderService.mockRejectedValue(new Error("lost response"))
  mocks.actions.options.mockResolvedValue({ outcome: "ready", fixedOrder: fixed, offerRef: scope.offerRef, timeZone: "Africa/Libreville", quote: { available: true }, booking: null })
  mocks.actions.refresh.mockResolvedValue("updated")
  mocks.actions.slots.mockImplementation(async (args: { fromAt: number; toAt: number; serviceRef: string }) => ({ outcome: "ready", ...args, timeZone: "Africa/Libreville", durationMinutes: 30, truncated: false, slots: [1, 2].map((hour) => ({ startAt: now + hour * 3_600_000, endAt: now + hour * 3_600_000 + 1_800_000, resourceRef: "resource-test", resourceLabel: null })) }))
  const quote = quoteResult(); mocks.actions.quote.mockResolvedValue(quote); mocks.actions.quotes.mockResolvedValue({ outcome: "ready", quotes: [quote.quote], truncated: false })
  container = document.createElement("div"); document.body.append(container); root = createRoot(container)
})
afterEach(async () => { await act(async () => root.unmount()); container.remove(); sessionStorage.clear(); vi.restoreAllMocks(); vi.useRealTimers() })

describe("intention persistée avant HTTP et reprise sans doublon", () => {
  it("persiste la clé avant l'action, puis gèle le formulaire après réponse perdue", async () => {
    mocks.actions.orderService.mockImplementation(async () => { expect(sessionStorage.getItem(serviceIntentKey(scope))).not.toBeNull(); throw new Error("lost") })
    await render(); await agree(); await submit()
    const sent = mocks.actions.orderService.mock.calls[0]![0]
    const saved = JSON.parse(sessionStorage.getItem(serviceIntentKey(scope))!)
    expect(saved.clientRequestId).toBe(sent.clientRequestId)
    expect(Object.keys(saved).sort()).toEqual(["version", "networkId", "personId", "mode", "handle", "offerRef", "clientRequestId", "createdAt"].sort())
    expect(container.querySelector("fieldset")!.disabled).toBe(true)
    await submit(); expect(mocks.actions.orderService).toHaveBeenCalledOnce()
  })
  it("un reload retrouve la demande avant de présenter une nouvelle intention", async () => {
    await render(); await agree(); await submit()
    mocks.lookup = { outcome: "request", requestRowId: "existing-request" }
    await remount()
    expect(mocks.push).toHaveBeenCalledWith(routes.serviceRequest("existing-request"))
    expect(mocks.actions.orderService).toHaveBeenCalledOnce()
  })
  it("absent ne libère la clé qu'après stopped ; une erreur ne la libère jamais", async () => {
    await render(); await agree(); await submit()
    mocks.stop.mockRejectedValueOnce(new Error("lost stop")); await click(button("recovery.stop"))
    expect(sessionStorage.getItem(serviceIntentKey(scope))).not.toBeNull()
    mocks.stop.mockResolvedValue({ outcome: "stopped" }); await click(button("recovery.stop"))
    expect(sessionStorage.getItem(serviceIntentKey(scope))).toBeNull()
    expect((container.querySelector('input[type="checkbox"]') as HTMLInputElement).checked).toBe(false)
    expect(container.querySelector("fieldset")!.disabled).toBe(true)
    expect(mocks.actions.orderService).toHaveBeenCalledOnce()
  })
  it("une clé âgée de plus de 24 h reste réservée à recherche/fence", async () => {
    sessionStorage.setItem(serviceIntentKey(scope), JSON.stringify({ ...scope, version: 1, clientRequestId: "expired-but-still-searchable", createdAt: now - SERVICE_INTENT_TTL_MS - 1 }))
    await render()
    expect(container.querySelector("form")).toBeNull()
    expect(button("recovery.lookup")).toBeDefined()
    expect(mocks.actions.orderService).not.toHaveBeenCalled()
  })
  it("un refus de lookup ne devient pas une absence certaine", async () => {
    await render(); await agree(); await submit(); mocks.queryError = true; await render()
    expect(button("recovery.stop")).toBeUndefined()
    expect(mocks.stop).not.toHaveBeenCalled()
    expect(sessionStorage.getItem(serviceIntentKey(scope))).not.toBeNull()
  })
  it("un remplacement d'acteur ignore le retour tardif de l'ancien envoi", async () => {
    let finish!: (value: unknown) => void; mocks.actions.orderService.mockReturnValue(new Promise((resolve) => { finish = resolve }))
    await render(); await agree(); await submit()
    mocks.person = "person-b"; await render()
    await act(async () => finish({ outcome: "request", requestRowId: "old-person-request", state: "unknown", reason: null }))
    expect(mocks.push).not.toHaveBeenCalled()
  })
  it("aucun envoi hors ligne et un retour réseau réclame relecture et nouvel accord", async () => {
    await render(); await agree()
    await act(async () => { online = false; window.dispatchEvent(new Event("offline")) })
    await submit(); expect(mocks.actions.orderService).not.toHaveBeenCalled()
    await act(async () => { online = true; window.dispatchEvent(new Event("online")) })
    expect((container.querySelector('input[type="checkbox"]') as HTMLInputElement).checked).toBe(false)
    expect(container.querySelector("fieldset")!.disabled).toBe(true)
    await click(button("recovery.review"))
    expect(mocks.actions.options).toHaveBeenCalledOnce()
    expect(mocks.actions.orderService).not.toHaveBeenCalled()
  })
})

describe("accord exact et lecture de créneaux corrélée", () => {
  it("un autre créneau décoche l'accord de changement", async () => {
    await render(<BookingPanel request={request()} />); await click(button("change.open"))
    await click(container.querySelectorAll("button[aria-pressed]")[0]!)
    await agree(); expect((container.querySelector('input[type="checkbox"]') as HTMLInputElement).checked).toBe(true)
    await click(container.querySelectorAll("button[aria-pressed]")[1]!)
    expect((container.querySelector('input[type="checkbox"]') as HTMLInputElement).checked).toBe(false)
    expect(mocks.actions.reschedule).not.toHaveBeenCalled()
  })
  it("un devis expire pendant sa lecture et ne peut plus être accepté", async () => {
    await render(<QuotePanel request={{ ...request(), mode: "quote" }} />)
    await click(button("quotes.load")); await click(button("quotes.readAndAccept")); await click(button("quotes.loadDetail"))
    await agree()
    await act(async () => { vi.advanceTimersByTime(1020) })
    expect(button("quotes.accept")).toBeUndefined()
    expect(container.textContent).toContain(i18n.t("quotes.expired"))
    expect(mocks.actions.acceptQuote).not.toHaveBeenCalled()
  })
  it("l'acceptation porte exactement version, total et consentement affichés, puis se fige", async () => {
    mocks.actions.acceptQuote.mockRejectedValue(new Error("lost"))
    await render(<QuotePanel request={{ ...request(), mode: "quote" }} />)
    await click(button("quotes.load")); await click(button("quotes.readAndAccept")); await click(button("quotes.loadDetail")); await agree()
    await act(async () => { container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })) })
    expect(mocks.actions.acceptQuote).toHaveBeenCalledWith({ networkId: "network-a", requestRowId: "request-private", quoteRef: "pro.ga:quote:test", quoteVersion: 7, acceptedTotal: { amount: 1500, currency: "XAF" }, consentTextVersion: "quote-consent-version", clientRequestId: expect.any(String) })
    expect((container.querySelector('input[type="checkbox"]') as HTMLInputElement).disabled).toBe(true)
  })
  it("un résultat tardif d'une autre prestation ne crée aucune cible cliquable", async () => {
    let old!: (value: unknown) => void
    mocks.actions.slots.mockImplementationOnce(() => new Promise((resolve) => { old = resolve })).mockResolvedValueOnce({ outcome: "refused" })
    const pick = vi.fn()
    await render(<ServiceSlotPicker handle="atelier" offerRef={scope.offerRef} serviceRef="service-old" selected={null} onPick={pick} />)
    await render(<ServiceSlotPicker handle="atelier" offerRef={scope.offerRef} serviceRef="service-new" selected={null} onPick={pick} />)
    await act(async () => old({ outcome: "ready", serviceRef: "service-old", timeZone: "Africa/Libreville", durationMinutes: 30, fromAt: now, toAt: now + 7 * 86_400_000, truncated: false, slots: [{ startAt: now + 3600_000, endAt: now + 5400_000, resourceRef: "old", resourceLabel: "OLD" }] }))
    expect(container.querySelector("button[aria-pressed]")).toBeNull()
    expect(container.textContent).not.toContain("OLD"); expect(pick).not.toHaveBeenCalled()
  })
  it("une réponse de relecture n'acquitte pas des conditions modifiées en vol", async () => {
    let finish!: (value: boolean) => void
    const read = vi.fn(() => new Promise<boolean>((resolve) => { finish = resolve }))
    function Harness({ conditions }: { conditions: string }) { const review = useServiceReview(conditions); return <button data-paused={String(review.paused)} onClick={() => { void review.refresh(read) }}>Relire</button> }
    await render(<Harness conditions="revision-a" />)
    await render(<Harness conditions="revision-b" />); await click(container.querySelector("button")!)
    await render(<Harness conditions="revision-c" />); await act(async () => finish(true))
    expect(container.querySelector("button")!.dataset.paused).toBe("true")
  })
})
