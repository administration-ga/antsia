// @vitest-environment jsdom
import { createAppI18n } from "@antsia/social-features/i18n"
import { act, type ReactNode } from "react"
import { createRoot, type Root } from "react-dom/client"
import { I18nextProvider } from "react-i18next"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import fr from "@/i18n/locales/fr/checkout.json"
import en from "@/i18n/locales/en/checkout.json"
import { appResources } from "@/i18n/resources"
import { CheckoutPreparationForm } from "./checkout-form"
import { checkoutAmount } from "./checkout-model"
import { catalogOfferFixture, ESTABLISHMENT_REF, OFFER_REF, optionsFixture, VARIANT_REF } from "./checkout-fixtures.test-support"

vi.mock("convex/react", () => ({ useConvexAuth: () => ({ isAuthenticated: true }) }))
vi.mock("@antsia/api/sign-out-everywhere", () => ({ isSigningOutEverywhere: () => false }))
vi.mock("@/components/member-chrome", () => ({ MemberPage: ({ children }: { children: ReactNode }) => children }))

const i18n = createAppI18n({ locale: "fr", appResources: { fr: { ...appResources.fr, checkout: fr }, en: { ...appResources.en, checkout: en } }, defaultNS: "checkout" })
let root: Root
let container: HTMLDivElement
const prepare = vi.fn()
const onAttempt = vi.fn()
async function render(consentTextVersion = "version-serveur") { await act(async () => root.render(<I18nextProvider i18n={i18n}><CheckoutPreparationForm offer={catalogOfferFixture()} options={optionsFixture} consentTextVersion={consentTextVersion} prepare={prepare} onAttempt={onAttempt} /></I18nextProvider>)) }
// Les modes de remise et les établissements se choisissent en cartes (boutons radio) ; le reste en listes.
async function select(name: string, value: string) { await act(async () => { const radio = container.querySelector<HTMLInputElement>(`input[type="radio"][name="${name}"][value="${value}"]`); if (radio) { radio.click(); return } const node = container.querySelector(`select[name="${name}"]`) as HTMLSelectElement; node.value = value; node.dispatchEvent(new Event("change", { bubbles: true })) }) }
async function click(node: Element) { await act(async () => (node as HTMLElement).click()) }
async function submit() { await act(async () => { container.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })) }) }
async function valid() { await select("variantRef", VARIANT_REF); await select("fulfillmentMode", "pickup"); await select("establishmentRef", ESTABLISHMENT_REF); await click(container.querySelector('input[name="consent"]')!) }
beforeEach(() => {
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement("div"); document.body.append(container); root = createRoot(container)
  prepare.mockReset(); onAttempt.mockReset()
  prepare.mockResolvedValue({ outcome: "attempt", attemptId: "attempt-real" })
})
afterEach(async () => { await act(async () => root.unmount()); container.remove() })

describe("préparation explicite sans paiement", () => {
  it("ne choisit aucune variante ni remise et ne coche pas l'accord", async () => {
    await render()
    expect((container.querySelector('select[name="variantRef"]') as HTMLSelectElement).value).toBe("")
    expect(container.querySelectorAll('input[type="radio"][name="fulfillmentMode"]')).toHaveLength(2)
    expect(container.querySelector('input[name="fulfillmentMode"]:checked')).toBeNull()
    expect((container.querySelector('input[name="consent"]') as HTMLInputElement).checked).toBe(false)
    expect(prepare).not.toHaveBeenCalled()
    await submit()
    expect(prepare).not.toHaveBeenCalled()
  })
  it("envoie uniquement les choix et attentes de l'offre réelle, après accord", async () => {
    await render(); await valid(); await submit()
    expect(prepare).toHaveBeenCalledOnce()
    expect(prepare.mock.calls[0]![0]).toEqual({ lines: [{ offerRef: OFFER_REF, variantRef: VARIANT_REF, quantity: 1, expectedCatalogRevision: catalogOfferFixture().revision, expectedUnitAmount: { amount: catalogOfferFixture().variants[0]!.amount, currency: "XAF" } }], fulfillment: { mode: "pickup", establishmentRef: ESTABLISHMENT_REF }, consentTextVersion: "version-serveur", clientRequestId: expect.any(String), expectedPolicyVersion: optionsFixture.policyVersion })
    expect(onAttempt).toHaveBeenCalledWith("attempt-real")
    expect(JSON.stringify(prepare.mock.calls[0]![0])).not.toContain("person")
  })
  it("conserve exactement la même clé et la même charge après une réponse perdue", async () => {
    prepare.mockRejectedValueOnce(new Error("request response lost")).mockResolvedValueOnce({ outcome: "attempt", attemptId: "attempt-existing" })
    await render(); await valid(); await submit()
    const first = prepare.mock.calls[0]![0]
    expect(container.querySelector("fieldset")!.disabled).toBe(true)
    const resume = [...container.querySelectorAll("button")].find((node) => node.textContent === "Reprendre la même demande")!
    await click(resume)
    expect(prepare.mock.calls[1]![0]).toEqual(first)
    expect(onAttempt).toHaveBeenCalledWith("attempt-existing")
  })
  it("ferme le double envoi avant même le rendu React suivant", async () => {
    prepare.mockReturnValue(new Promise(() => {}))
    await render(); await valid()
    await act(async () => { const form = container.querySelector("form")!; form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })) })
    expect(prepare).toHaveBeenCalledOnce()
  })
  it("une livraison commence avec une adresse entièrement vide et sans copie du profil", async () => {
    await render(); await select("fulfillmentMode", "seller_delivery")
    for (const name of ["country", "locality", "line1", "line2", "instructions"]) expect((container.querySelector(`[name="${name}"]`) as HTMLInputElement | HTMLSelectElement).value).toBe("")
    expect(container.textContent).toContain("jamais reprise de votre profil")
    await submit()
    expect(prepare).not.toHaveBeenCalled()
  })
  it("ne navigue pas vers une réussite lors d'un refus de préparation", async () => {
    prepare.mockResolvedValue({ outcome: "refused" })
    await render(); await valid(); await submit()
    expect(onAttempt).not.toHaveBeenCalled()
    expect(container.textContent).toContain("Cette action n’est pas disponible")
    expect(container.textContent).not.toContain("Payé")
  })
  it("un changement de version du consentement décoche un accord qui n'a pas encore été envoyé", async () => {
    await render(); await valid()
    expect((container.querySelector('input[name="consent"]') as HTMLInputElement).checked).toBe(true)
    await render("version-serveur-suivante")
    expect((container.querySelector('input[name="consent"]') as HTMLInputElement).checked).toBe(false)
    await submit()
    expect(prepare).not.toHaveBeenCalled()
  })
  it("P18b (A16) : l'adresse de livraison porte les jetons de remplissage du navigateur, et reste vide au départ", async () => {
    await render(); await select("fulfillmentMode", "seller_delivery")
    const token = (name: string) => container.querySelector(`[name="${name}"]`)?.getAttribute("autocomplete")
    expect(token("country")).toBe("shipping country")
    expect(token("locality")).toBe("shipping address-level2")
    expect(token("line1")).toBe("shipping address-line1")
    expect(token("line2")).toBe("shipping address-line2")
    expect(token("instructions")).toBe("off")
    for (const name of ["country", "locality", "line1", "line2"]) expect((container.querySelector(`[name="${name}"]`) as HTMLInputElement | HTMLSelectElement).value).toBe("")
  })
  it("les modes de remise se choisissent en cartes : le retrait et son établissement, la livraison avec le libellé et les frais du vendeur", async () => {
    await render()
    const cards = [...container.querySelectorAll('input[type="radio"][name="fulfillmentMode"]')].map(input => input.closest("label")?.textContent ?? "")
    expect(cards[0]).toContain(i18n.t("pickup")); expect(cards[0]).toContain("Retrait centre-ville")
    expect(cards[1]).toContain(i18n.t("seller_delivery")); expect(cards[1]).toContain("Livraison locale"); expect(cards[1]).toContain(checkoutAmount(1500, "fr"))
    // Les établissements n'apparaissent qu'au retrait, et aucun n'est choisi d'office.
    expect(container.querySelector('input[name="establishmentRef"]')).toBeNull()
    await select("fulfillmentMode", "pickup")
    expect(container.querySelectorAll('input[type="radio"][name="establishmentRef"]')).toHaveLength(1)
    expect(container.querySelector('input[name="establishmentRef"]:checked')).toBeNull()
  })
  it("au panier, le total et l'envoi restent ensemble dans la barre collée du téléphone", async () => {
    await act(async () => root.render(<I18nextProvider i18n={i18n}><CheckoutPreparationForm offer={catalogOfferFixture()} options={optionsFixture} consentTextVersion="version-serveur" prepare={prepare} onAttempt={onAttempt} stickyActions /></I18nextProvider>))
    const actions = container.querySelector("[data-checkout-actions]")!
    expect(actions.className).toContain("sticky")
    expect(actions.querySelector('button[type="submit"]')?.textContent).toBe(i18n.t("prepare"))
    // Aucun total avant le choix de la remise ; ensuite, celui du récapitulatif.
    expect(actions.textContent).not.toContain("XAF")
    await select("variantRef", VARIANT_REF); await select("fulfillmentMode", "pickup")
    expect(actions.textContent).toContain(checkoutAmount(17500 + 200, "fr"))
  })
})
