// @vitest-environment jsdom
import { createAppI18n } from "@antsia/social-features/i18n"
import { act, type ReactNode } from "react"
import { createRoot, type Root } from "react-dom/client"
import { I18nextProvider } from "react-i18next"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { appResources } from "@/i18n/resources"
import { CheckoutPreparationForm, type CheckoutCartLine } from "@/components/checkout/checkout-form"
import { catalogOfferFixture, ESTABLISHMENT_REF, optionsFixture, VARIANT_REF } from "@/components/checkout/checkout-fixtures.test-support"
import { checkoutAmount } from "@/components/checkout/checkout-model"

vi.mock("convex/react", () => ({ useConvexAuth: () => ({ isAuthenticated: true }) }))
vi.mock("@antsia/api/sign-out-everywhere", () => ({ isSigningOutEverywhere: () => false }))
vi.mock("@/components/member-chrome", () => ({ MemberPage: ({ children }: { children: ReactNode }) => children }))

const i18n = createAppI18n({ locale: "fr", appResources, defaultNS: "checkout" })
let root: Root, container: HTMLDivElement, online: boolean
const prepare = vi.fn(), onAttempt = vi.fn(), lookup = vi.fn(), persist = vi.fn()
const lines = (): CheckoutCartLine[] => [{ offer: catalogOfferFixture(), variantRef: VARIANT_REF, quantity: 2 }, { offer: catalogOfferFixture({ offerRef: "pro.ga:offer:second", title: "Service à prix fixe", variants: [], price: { mode: "fixed", amount: 3000, currency: "XAF" } }), quantity: 3 }]
async function render(items = lines(), recoveredRequestId?: string) { await act(async () => root.render(<I18nextProvider i18n={i18n}><CheckoutPreparationForm offer={items[0]!.offer} cartLines={items} options={optionsFixture} consentTextVersion="checkout-consent" prepare={prepare} onAttempt={onAttempt} onIntent={persist} beforeResume={lookup} recoveredRequestId={recoveredRequestId} /></I18nextProvider>)) }
// Les modes de remise et les établissements se choisissent en cartes (boutons radio) ; le reste en listes.
async function change(name: string, value: string) { await act(async () => { const radio = container.querySelector<HTMLInputElement>(`input[type="radio"][name="${name}"][value="${value}"]`); if (radio) { radio.click(); return } const input = container.querySelector(`select[name="${name}"]`) as HTMLSelectElement; input.value = value; input.dispatchEvent(new Event("change", { bubbles: true })) }) }
async function click(node: Element) { await act(async () => (node as HTMLElement).click()) }
async function consent() { await change("fulfillmentMode", "pickup"); await change("establishmentRef", ESTABLISHMENT_REF); await click(container.querySelector('[name="consent"]')!) }
async function submit() { await act(async () => { container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })) }) }
beforeEach(() => {
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  online = true; vi.spyOn(navigator, "onLine", "get").mockImplementation(() => online)
  container = document.createElement("div"); document.body.append(container); root = createRoot(container)
  prepare.mockReset(); lookup.mockReset(); persist.mockReset(); onAttempt.mockReset()
  prepare.mockResolvedValue({ outcome: "attempt", attemptId: "prepared-private" }); lookup.mockResolvedValue({ outcome: "absent" }); persist.mockResolvedValue(true)
})
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks() })

describe("préparation réelle d'un panier mono-vendeur", () => {
  it("envoie les deux lignes exactes sans sélection de prix ou variante implicite", async () => {
    await render(); expect(container.querySelector('[name="variantRef"]')).toBeNull()
    await consent(); await submit()
    expect(prepare).toHaveBeenCalledOnce()
    expect(prepare.mock.calls[0]![0].lines).toEqual([{ offerRef: lines()[0]!.offer.offerRef, variantRef: VARIANT_REF, quantity: 2, expectedCatalogRevision: 3, expectedUnitAmount: { amount: 17500, currency: "XAF" } }, { offerRef: "pro.ga:offer:second", quantity: 3, expectedCatalogRevision: 3, expectedUnitAmount: { amount: 3000, currency: "XAF" } }])
    expect(prepare.mock.calls[0]![0].expectedPolicyVersion).toBe(optionsFixture.policyVersion)
    expect(persist.mock.invocationCallOrder[0]).toBeLessThan(prepare.mock.invocationCallOrder[0]!)
  })
  it("récapitule chaque ligne à son prix, variante comprise, sans déclarer le panier inexact", async () => {
    await render()
    const summary = container.querySelector("section")!
    expect(summary.textContent).not.toContain(i18n.t("notPurchasable"))
    expect(summary.textContent).not.toContain(i18n.t("cart:notExact"))
    expect(summary.textContent).not.toContain(i18n.t("unitAmount"))
    expect(summary.textContent).toContain(`${i18n.t("cart:itemsAmount")} : ${checkoutAmount(17500 * 2 + 3000 * 3, "fr")}`)
    expect((container.querySelector('button[type="submit"]') as HTMLButtonElement).disabled).toBe(false)
  })
  it.each([
    ["un devis", [{ offer: catalogOfferFixture({ variants: [], price: { mode: "quote", currency: "XAF" } }), quantity: 1 }]],
    ["une variante retirée", [lines()[1]!, { ...lines()[0]!, variantRef: "pro.ga:variant:retiree" }]],
  ])("%s dans le panier : montant inexact annoncé et préparation fermée", async (_case, items) => {
    await render(items as CheckoutCartLine[])
    const summary = container.querySelector("section")!
    expect(summary.textContent).toContain(i18n.t("cart:notExact"))
    expect(summary.textContent).not.toContain(i18n.t("cart:itemsAmount"))
    expect((container.querySelector('button[type="submit"]') as HTMLButtonElement).disabled).toBe(true)
    await consent()
    // Aucun montant de repli (prix de base, -1) ne fabrique un total.
    expect(summary.textContent).not.toContain(`${i18n.t("total")} :`)
    expect((container.querySelector('button[type="submit"]') as HTMLButtonElement).disabled).toBe(true)
    await submit()
    expect(prepare).not.toHaveBeenCalled()
  })
  it("un vendeur différent refusé à l'envoi le dit au lieu de se taire", async () => {
    await render([lines()[0]!, { ...lines()[1]!, offer: { ...lines()[1]!.offer, shopHandle: "autre" } }]); await consent(); await submit()
    expect(prepare).not.toHaveBeenCalled()
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(i18n.t("validation.choiceChanged"))
  })
  it("un devis ou un vendeur différent n'est pas rendu payable par le panier", async () => {
    await render([{ offer: catalogOfferFixture({ variants: [], price: { mode: "quote", currency: "XAF" } }), quantity: 1 }]); await consent(); await submit()
    expect(prepare).not.toHaveBeenCalled()
    await render([lines()[0]!, { ...lines()[1]!, offer: { ...lines()[1]!.offer, shopHandle: "autre" } }]); await consent(); await submit()
    expect(prepare).not.toHaveBeenCalled()
  })
  it("suspend l'envoi hors ligne, conserve le mode saisi et décoche l'accord au retour", async () => {
    await render(); await consent()
    await act(async () => { online = false; window.dispatchEvent(new Event("offline")) })
    await submit(); expect(prepare).not.toHaveBeenCalled()
    expect((container.querySelector('[name="fulfillmentMode"]') as HTMLSelectElement).value).toBe("pickup")
    await act(async () => { online = true; window.dispatchEvent(new Event("online")) })
    expect((container.querySelector('[name="consent"]') as HTMLInputElement).checked).toBe(false)
  })
  it("une reprise après reload recherche d'abord puis conserve la clé récupérée", async () => {
    await render(lines(), "existing-client-request-key"); await consent(); await submit()
    expect(lookup.mock.invocationCallOrder[0]).toBeLessThan(prepare.mock.invocationCallOrder[0]!)
    expect(prepare.mock.calls[0]![0].clientRequestId).toBe("existing-client-request-key")
  })
  it("une empreinte différente n'envoie rien", async () => {
    persist.mockResolvedValue(false)
    await render(lines(), "existing-client-request-key"); await consent(); await submit()
    expect(prepare).not.toHaveBeenCalled(); expect(onAttempt).not.toHaveBeenCalled()
  })
  it.each(["existing", "error"])("une recherche %s ne devient jamais une nouvelle préparation", async (mode) => {
    if (mode === "existing") lookup.mockResolvedValue({ outcome: "attempt", attemptId: "already-prepared" })
    else lookup.mockRejectedValue(new Error("unreachable"))
    await render(lines(), "existing-client-request-key"); await consent(); await submit()
    expect(prepare).not.toHaveBeenCalled()
    if (mode === "existing") expect(onAttempt).toHaveBeenCalledWith("already-prepared")
    else expect(onAttempt).not.toHaveBeenCalled()
  })
})
