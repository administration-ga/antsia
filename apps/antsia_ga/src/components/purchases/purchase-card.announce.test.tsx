// @vitest-environment jsdom
/** K12/AC03 : scénarios d'annonce écrits, non exécutés. */
import type { Purchase } from "@convex/modules/shops/purchaseRules"
import { createAppI18n } from "@antsia/social-features/i18n"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { I18nextProvider } from "react-i18next"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { appResources } from "@/i18n/resources"
import { PurchaseCard } from "./purchase-card"
import { orderFixture, PURCHASE_NOW, purchaseFixture } from "./purchase-fixtures.test-support"

const languages = {
  fr: createAppI18n({ locale: "fr", appResources, defaultNS: "purchases" }),
  en: createAppI18n({ locale: "en", appResources, defaultNS: "purchases" }),
}
let root: Root, container: HTMLDivElement
async function render(purchase: Purchase, compact = false, locale: "fr" | "en" = "fr") {
  await act(async () => root.render(<I18nextProvider i18n={languages[locale]}><PurchaseCard purchase={purchase} compact={compact} /></I18nextProvider>))
}
const region = () => container.querySelector('[role="status"].sr-only')
beforeEach(() => {
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement("div"); document.body.append(container); root = createRoot(container)
})
afterEach(async () => { await act(async () => root.unmount()); container.remove() })

describe("achat : transitions métier polies et séparées", () => {
  it("monte une région vide et stable, sans annoncer l'état déjà connu", async () => {
    await render(purchaseFixture())
    const host = region()
    expect(host?.textContent).toBe("")
    expect(host?.getAttribute("aria-live")).toBe("polite")
    expect(host?.getAttribute("aria-atomic")).toBe("true")
    await render(purchaseFixture({ order: orderFixture({ refundState: "processing" }) }))
    expect(region()).toBe(host)
    expect(region()?.textContent).toContain(languages.fr.t("payment:refundStates.processing"))
  })
  it.each(["fr", "en"] as const)("annonce les dimensions changées en %s sans nom ni contenu privé", async locale => {
    await render(purchaseFixture(), false, locale)
    await render(purchaseFixture({ order: orderFixture({
      stockState: "expired", refundState: "processing",
      fulfillment: { mode: "seller_delivery", state: "ready", locality: "Adresse privée", leadTimeDays: 2 },
    }) }), false, locale)
    const text = region()?.textContent ?? "", i18n = languages[locale]
    expect(text).toContain(i18n.t("payment:stockStates.expired"))
    expect(text).toContain(i18n.t("payment:refundStates.processing"))
    expect(text).toContain(i18n.t("fulfillmentStates.ready"))
    for (const privateText of ["Atelier de recette", "Commande de recette", "Sac", "Adresse privée", "payment-private"]) expect(text).not.toContain(privateText)
    expect(text).not.toContain(i18n.t("announcements.receiptConfirmed"))
    expect(text).not.toContain(i18n.t("settlementStates.paid"))
  })
  it("ignore les nouvelles dates, révisions, pages d'historique et messages du même état", async () => {
    await render(purchaseFixture())
    const host = region()
    await render(purchaseFixture({
      observedAt: PURCHASE_NOW + 60000, stale: false,
      order: orderFixture({
        revision: 99, paymentRevision: 10, updatedAt: PURCHASE_NOW + 60000,
        history: [{ status: "confirmed", at: PURCHASE_NOW - 60000 }, { status: "confirmed", at: PURCHASE_NOW }],
        historyTruncated: true,
        messages: [{ messageRef: "private", side: "seller", text: "Texte privé supplémentaire", createdAt: PURCHASE_NOW }],
      }),
    }))
    expect(region()).toBe(host)
    expect(region()?.textContent).toBe("")
  })
  it("annonce seulement le passage du suivi à périmé, pas ses dates de lecture suivantes", async () => {
    await render(purchaseFixture())
    await render(purchaseFixture({ stale: true }))
    expect(region()?.textContent).toContain(languages.fr.t("stale"))
    const node = region()?.firstChild
    await render(purchaseFixture({ stale: true, observedAt: PURCHASE_NOW + 60000 }))
    expect(region()?.firstChild).toBe(node)
    await render(purchaseFixture({ stale: false }))
    expect(region()?.textContent).toBe("")
  })
  it("une attestation ne déduit ni remise ni reversement et sa date seule ne réannonce rien", async () => {
    await render(purchaseFixture())
    const receipt = { confirmationRef: "private-receipt", confirmedAt: PURCHASE_NOW }
    await render(purchaseFixture({ order: orderFixture({ receipt }) }))
    const text = region()?.textContent, node = region()?.firstChild
    expect(text).toContain(languages.fr.t("announcements.receiptConfirmed"))
    expect(text).not.toContain(languages.fr.t("settlementStates.paid"))
    expect(text).not.toContain(languages.fr.t("fulfillmentStates.delivered"))
    await render(purchaseFixture({ order: orderFixture({ receipt: { ...receipt, confirmedAt: PURCHASE_NOW + 60000 } }) }))
    expect(region()?.textContent).toBe(text)
    expect(region()?.firstChild).toBe(node)
  })
  it("annonce un refus d'action sans son motif privé et ne le répète pas au prochain poll", async () => {
    await render(purchaseFixture())
    const action = { actionId: "private-action", operation: "cancel_request" as const, state: "refused" as const, reason: "Motif privé", createdAt: PURCHASE_NOW, canRetry: false }
    await render(purchaseFixture({ pendingActions: [action] }))
    const node = region()?.firstChild
    expect(region()?.textContent).toContain(languages.fr.t("refused"))
    expect(region()?.textContent).not.toContain("Motif privé")
    await render(purchaseFixture({ pendingActions: [{ ...action, actionId: "new-ref", createdAt: PURCHASE_NOW + 1 }] }))
    expect(region()?.firstChild).toBe(node)
  })
  it("annonce annulation et retour refusés uniquement lorsqu'ils sont servis", async () => {
    await render(purchaseFixture())
    await render(purchaseFixture({ order: orderFixture({ cancellationState: "rejected", returnState: "rejected" }) }))
    expect(region()?.textContent).toContain(languages.fr.t("cancellationStates.rejected"))
    expect(region()?.textContent).toContain(languages.fr.t("returnStates.rejected"))
  })
  it("un snapshot absent puis chargé reste silencieux et conserve le même hôte", async () => {
    await render(purchaseFixture({ order: null }))
    const host = region()
    await render(purchaseFixture())
    expect(region()).toBe(host)
    expect(region()?.textContent).toBe("")
    await render(purchaseFixture({ order: orderFixture({ refundState: "processing" }) }))
    await render(purchaseFixture({ order: null }))
    expect(region()).toBe(host)
    expect(region()?.textContent).toBe("")
  })
  it("la liste compacte reste muette et un autre achat repart sans ancien message", async () => {
    await render(purchaseFixture(), true)
    await render(purchaseFixture({ order: orderFixture({ refundState: "processing" }) }), true)
    expect(region()).toBeNull()
    await render(purchaseFixture())
    await render(purchaseFixture({ order: orderFixture({ refundState: "processing" }) }))
    await render(purchaseFixture({ purchaseId: "another-private-purchase" }))
    expect(region()?.textContent).toBe("")
  })
})
