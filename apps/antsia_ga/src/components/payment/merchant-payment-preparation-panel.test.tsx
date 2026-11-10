// @vitest-environment jsdom
import type { Id } from "@antsia/api/engine"
import { COMMERCE_PAYMENT_PREPARATION_MISSING, COMMERCE_PAYMENT_PREPARATION_RAILS } from "@antsia/social-domain/commerce-payment-preparation"
import { createAppI18n } from "@antsia/social-features/i18n"
import type { PaymentPreparationResult } from "@convex/modules/shops/paymentPreparationRules"
import { act, type ReactNode } from "react"
import { createRoot, type Root } from "react-dom/client"
import { I18nextProvider } from "react-i18next"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ network: { networkId: "network-a", personId: "person-a" }, read: vi.fn(), href: vi.fn(), mutation: vi.fn(), action: vi.fn() }))
vi.mock("@antsia/api/engine", () => ({ api: { modules: { shops: { paymentPreparationActions: { read: "paymentRead" } } } } }))
vi.mock("@antsia/api/network", () => ({ useNetwork: () => mocks.network }))
vi.mock("convex/react", () => ({ useConvexAuth: () => ({ isAuthenticated: true }), useAction: (reference: unknown) => { mocks.action(reference); return mocks.read }, useMutation: mocks.mutation }))
vi.mock("@/lib/routes", () => ({ proFinancialPreparationHref: (...args: unknown[]) => mocks.href(...args) }))
vi.mock("@antsia/api/sign-out-everywhere", () => ({ isSigningOutEverywhere: () => false }))
vi.mock("@/components/member-chrome", () => ({ MemberPage: ({ children }: { children: ReactNode }) => <main>{children}</main> }))
import { appResources } from "@/i18n/resources"
import { MerchantPaymentPreparationPanel } from "./merchant-payment-preparation-panel"

type Ready = Extract<PaymentPreparationResult, { outcome: "ready" }>
const now = Date.UTC(2026, 9, 21, 12)
const shopId = "shop-a" as Id<"shops">
function ready(changes: Partial<Ready["preparation"]> = {}): Ready {
  return { outcome: "ready", preparation: { environment: "sandbox", currency: "XAF", checkedAt: now, expiresAt: now + 60_000, countryScope: { platformCountry: null, sellerCountry: null }, collection: { state: "closed", missing: ["merchant_contract_missing", "collection_disabled"] }, payout: { state: "closed", missing: ["payout_not_implemented"] }, beneficiary: { state: "not_configured", label: null }, policy: null, rails: COMMERCE_PAYMENT_PREPARATION_RAILS.map(rail => ({ rail, qualified: false, capabilities: { collect: false, lookup: false, refund: false, payout: false }, missing: ["merchant_contract_missing", "adapter_unqualified"] })), target: "payments", ...changes }, proAppOrigin: "https://merchant.example", proShopRef: "pro.ga:structure:01JA000000000000000000S1" }
}
const policy = { textVersion: "seller-policy-v3", revision: 8, platformRevision: 4, mode: "custom_platform_retention" as const, platformBps: 3333, sellerBps: 6667, accepted: true, acceptanceRevision: 8 }
let root: Root, container: HTMLDivElement, online: boolean
async function render(dirty = false, locale: "fr" | "en" = "fr", currentShop = shopId) { await act(async () => root.render(<I18nextProvider i18n={createAppI18n({ locale, appResources, defaultNS: "paymentPreparation" })}><MerchantPaymentPreparationPanel shopId={currentShop} dirty={dirty} /></I18nextProvider>)) }
async function clickRead() { const button = container.querySelector("button")!; await act(async () => button.click()) }
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(now)
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  online = true; vi.spyOn(navigator, "onLine", "get").mockImplementation(() => online)
  mocks.network = { networkId: "network-a", personId: "person-a" }
  mocks.read.mockReset().mockResolvedValue(ready()); mocks.href.mockReset().mockReturnValue("https://merchant.example/authorized-payments"); mocks.mutation.mockReset(); mocks.action.mockReset()
  container = document.createElement("div"); document.body.append(container); root = createRoot(container)
})
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); vi.useRealTimers() })

describe("MP07c — préparation financière explicite, sans activation", () => {
  it("présente les quatre moyens sans aucune lecture initiale puis affiche leur fermeture réelle", async () => {
    const write = vi.spyOn(Storage.prototype, "setItem")
    await render()
    expect(mocks.read).not.toHaveBeenCalled()
    for (const name of ["Airtel Money", "Moov Money", "Carte bancaire", "PayPal"]) expect(container.textContent).toContain(name)
    await clickRead()
    expect(mocks.read).toHaveBeenCalledWith({ networkId: "network-a", shopId })
    expect(container.querySelectorAll("[data-payment-rail]")).toHaveLength(4)
    expect(container.textContent).toContain("Encaissement fermé pour cette activité")
    expect(container.textContent).toContain("Contrat de paiement marchand manquant")
    expect(container.textContent).toContain("Reversement fermé")
    expect(container.querySelector("form, input, select, h1, main")).toBeNull()
    expect(mocks.mutation).not.toHaveBeenCalled(); expect(write).not.toHaveBeenCalled()
    expect(mocks.action.mock.calls.every(call => call[0] === "paymentRead")).toBe(true)
  })
  it("garde dans l'ordre encaissement, politique/répartition, remboursement et reversement", async () => {
    await render(); await clickRead()
    const collection = container.querySelector("[data-payment-collection]")!
    const allocation = container.querySelector("[data-payment-policy]")!
    const refund = container.querySelector("[data-payment-refund]")!
    const payout = container.querySelector("[data-payment-payout]")!
    expect(collection.compareDocumentPosition(allocation) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(allocation.compareDocumentPosition(refund) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(refund.compareDocumentPosition(payout) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(container.querySelector("[data-payment-allocation]")?.textContent).toContain("Aucune répartition n’est communiquée")
  })
  it("ne déduit aucun pays, taux ou accord d'une absence de politique", async () => {
    await render(); await clickRead()
    expect(container.textContent).not.toMatch(/90\s*%|85\s*%/u)
    expect(container.textContent).not.toContain("Gabon")
    expect(container.textContent).toContain("Non confirmé")
    expect(container.textContent).toContain("XAF")
    expect(container.textContent).not.toContain("Accord vendeur enregistré")
    expect(container.textContent).not.toContain("pro.ga:structure")
  })
  it("affiche exclusivement les parts et révisions réellement retournées sans accord local", async () => {
    mocks.read.mockResolvedValue(ready({ policy, countryScope: { platformCountry: "GA", sellerCountry: null } }))
    await render(); await clickRead()
    const summary = container.querySelector("[data-payment-policy]")!
    expect(summary.textContent).toContain("seller-policy-v3")
    expect(summary.textContent).toContain("33,33")
    expect(summary.textContent).toContain("66,67")
    expect(summary.textContent).toContain("Révision de l’accord enregistré : 8")
    expect(summary.querySelector("input, button, form")).toBeNull()
    expect(container.textContent).toContain("Gabon")
    expect(container.textContent).toContain("Non confirmé")
  })
  it("un contrat individuel sans parts ne reçoit aucune répartition par défaut", async () => {
    mocks.read.mockResolvedValue(ready({ policy: { ...policy, mode: "per_seller_contract", accepted: false, platformBps: null, sellerBps: null, acceptanceRevision: null } }))
    await render(); await clickRead()
    const summary = container.querySelector("[data-payment-policy]")!
    expect(summary.textContent).toContain("Accord propre au vendeur")
    expect(summary.textContent).toContain("Non communiquée")
    expect(summary.textContent).toContain("L’accord vendeur courant n’est pas enregistré")
    expect(summary.textContent).not.toMatch(/\d\s*%/u)
  })
  it("ne confond pas les capacités d'encaisser, suivre, rembourser et reverser", async () => {
    const result = ready()
    result.preparation.rails[0] = { ...result.preparation.rails[0]!, qualified: true, capabilities: { collect: true, lookup: true, refund: false, payout: false }, missing: [] }
    mocks.read.mockResolvedValue(result)
    await render(); await clickRead()
    const rail = container.querySelector('[data-payment-rail="airtel_money"]')!
    const values = [...rail.querySelectorAll("dd")].map(node => node.textContent)
    expect(values).toEqual(["Capacité déclarée prête", "Capacité déclarée prête", "Capacité non prête", "Capacité non prête"])
    expect(container.querySelector("[data-payment-collection]")?.textContent).toContain("Encaissement fermé")
    expect(container.querySelector("[data-payment-payout]")?.textContent).toContain("Reversement fermé")
  })
  it("traduit chacun des motifs fermés du contrat", async () => {
    mocks.read.mockResolvedValue(ready({ collection: { state: "closed", missing: [...COMMERCE_PAYMENT_PREPARATION_MISSING] } }))
    await render(); await clickRead()
    expect(container.querySelectorAll('[data-payment-collection] li')).toHaveLength(COMMERCE_PAYMENT_PREPARATION_MISSING.length)
    expect(container.querySelector("[data-payment-collection]")?.textContent).not.toContain("missing.")
  })
  it("ne construit que la cible paiements passée au helper parent", async () => {
    await render(); await clickRead()
    expect(mocks.href).toHaveBeenCalledWith(ready().proAppOrigin, ready().proShopRef, "payments")
    const link = container.querySelector("a")!
    expect(link.getAttribute("href")).toBe("https://merchant.example/authorized-payments")
    expect(link.target).toBe("_blank"); expect(link.rel).toContain("noopener")
  })
  it("l'absence de cible ou un rejet du registre parent ne produit aucun lien", async () => {
    mocks.read.mockResolvedValueOnce(ready({ target: null }))
    await render(); await clickRead()
    expect(container.querySelector("a")).toBeNull()
    mocks.href.mockReturnValue(null)
    await clickRead()
    expect(container.querySelector("a")).toBeNull()
  })
  it("retire liens, autorisations courantes et libellé bénéficiaire à l'expiration", async () => {
    mocks.read.mockResolvedValue(ready({ policy, beneficiary: { state: "verified", label: "Atelier privé" } }))
    await render(); await clickRead()
    await act(async () => { vi.advanceTimersByTime(60_020) })
    expect(container.querySelector("a")).toBeNull()
    expect(container.textContent).toContain("Cette vérification a expiré")
    expect(container.textContent).not.toContain("Accord vendeur enregistré pour cette politique")
    expect(container.textContent).not.toContain("Atelier privé")
    expect(mocks.read).toHaveBeenCalledOnce()
  })
  it("interdit aussi l'ouverture à une échéance dépassée avant le réveil de l'horloge", async () => {
    await render(); await clickRead()
    vi.setSystemTime(now + 60_001)
    const event = new MouseEvent("click", { bubbles: true, cancelable: true })
    await act(async () => { container.querySelector("a")!.dispatchEvent(event) })
    expect(event.defaultPrevented).toBe(true)
  })
  it("dirty efface la lecture et l'enregistrement ne restaure pas une ancienne autorisation", async () => {
    await render(); await clickRead(); await render(true)
    expect(container.querySelector("a, [data-payment-policy]")).toBeNull()
    expect(container.querySelector("button")?.disabled).toBe(true)
    await render(false)
    expect(container.querySelector("a")).toBeNull()
    expect(mocks.read).toHaveBeenCalledOnce()
  })
  it("efface le succès pendant une relecture puis conserve la fermeture après panne", async () => {
    await render(); await clickRead()
    let fail!: (reason: Error) => void
    mocks.read.mockReturnValueOnce(new Promise((_resolve, reject) => { fail = reject }))
    await clickRead()
    expect(container.querySelector("a, [data-payment-policy]")).toBeNull()
    await act(async () => fail(new Error("sensitive internal detail")))
    expect(container.querySelector("a, [data-payment-policy]")).toBeNull()
    expect(container.querySelector('[role="alert"]')).not.toBeNull()
    expect(container.textContent).not.toContain("sensitive internal detail")
  })
  it.each(["refused", "unavailable"])("un résultat %s ne réutilise aucune donnée d'un succès précédent", async outcome => {
    await render(); await clickRead()
    mocks.read.mockResolvedValue({ outcome }); await clickRead()
    expect(container.querySelector("a, [data-payment-policy], [data-payment-collection]")).toBeNull()
    expect(container.querySelector('[role="alert"]')).not.toBeNull()
  })
  it.each(["person", "network", "shop", "dirty"])("ignore une réponse tardive après changement %s", async change => {
    let finish!: (value: unknown) => void
    mocks.read.mockReturnValueOnce(new Promise(resolve => { finish = resolve }))
    await render(); await clickRead()
    if (change === "person") mocks.network = { ...mocks.network, personId: "person-b" }
    if (change === "network") mocks.network = { ...mocks.network, networkId: "network-b" }
    await render(change === "dirty", "fr", change === "shop" ? "shop-b" as Id<"shops"> : shopId)
    if (change === "dirty") await render(false)
    await act(async () => finish(ready()))
    expect(container.querySelector("a, [data-payment-policy]")).toBeNull()
  })
  it("une coupure puis un retour réseau retire l'ancienne lecture sans requête automatique", async () => {
    await render(); await clickRead()
    await act(async () => { online = false; window.dispatchEvent(new Event("offline")) })
    expect(container.querySelector("a, [data-payment-policy]")).toBeNull()
    await act(async () => { online = true; window.dispatchEvent(new Event("online")) })
    expect(container.querySelector("a")).toBeNull()
    expect(mocks.read).toHaveBeenCalledOnce()
  })
  it.each([390, 834, 1440])("garde la lecture seule et les statuts accessibles à %ipx", async width => {
    vi.stubGlobal("innerWidth", width)
    await render(); await clickRead()
    expect(container.querySelectorAll("[data-payment-rail]")).toHaveLength(4)
    expect(container.querySelector('section[aria-label="Préparer mes paiements"]')).not.toBeNull()
    expect(container.querySelector('[role="status"]')).not.toBeNull()
    expect(container.querySelector("form, input, select")).toBeNull()
    vi.unstubAllGlobals()
  })
  it("présente les mêmes états en anglais", async () => {
    await render(false, "en"); await clickRead()
    expect(container.textContent).toContain("Prepare my payments")
    expect(container.textContent).toContain("Bank card")
    expect(container.textContent).toContain("Merchant payment contract missing")
    expect(container.textContent).not.toContain("paymentPreparation:")
  })
})
