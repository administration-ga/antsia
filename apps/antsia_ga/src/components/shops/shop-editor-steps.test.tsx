// @vitest-environment jsdom
/**
 * P18b (A14, WCAG 2.4.3) — changer d'étape depuis un panneau porte le focus
 * sur le titre du panneau ouvert (il ne tombe plus sur `<body>`), et tout
 * changement d'étape s'annonce « Étape n sur 4 : … ».
 */
import { createAppI18n } from "@antsia/social-features/i18n"
import { act, type ReactNode } from "react"
import { createRoot, type Root } from "react-dom/client"
import { I18nextProvider } from "react-i18next"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@antsia/api/engine", () => ({ api: { modules: { shops: { shops: { updateShop: "updateShop", getMyShop: "getMyShop" } } } } }))
vi.mock("@antsia/api/hooks", () => ({ useAuthenticatedConvexQuery: () => ({ data: undefined, isError: false, refetch: vi.fn() }) }))
vi.mock("@antsia/api/network", () => ({ useNetwork: () => ({ networkId: "network", personId: "person" }) }))
vi.mock("convex/react", () => ({ useMutation: () => vi.fn(), useConvexAuth: () => ({ isAuthenticated: true }) }))
vi.mock("./shop-ui", () => ({
  SHOP_SELECT_CLASS: "",
  ShopFrame: ({ children }: { children: ReactNode }) => <>{children}</>,
  ShopLink: ({ children }: { children: ReactNode }) => <>{children}</>,
  ShopQueryFailure: () => null,
  useShopAction: () => ({ run: vi.fn(), pending: false, error: null, current: () => true }),
  useShopDirtyGuard: () => undefined,
}))
vi.mock("./shop-presentation-form", () => ({ ShopPresentationForm: () => <section><h2>Ma présentation</h2></section> }))
vi.mock("./shop-publication-form", () => ({
  ShopPublicationForm: ({ onPrepare }: { onPrepare: () => void }) => <section><h2>Publier</h2><button type="button" onClick={onPrepare}>préparer</button></section>,
}))
vi.mock("../payment/merchant-payment-preparation-panel", () => ({ MerchantPaymentPreparationPanel: () => <section data-payment-preparation /> }))
vi.mock("./shop-commerce-link", () => ({ ShopCommerceLink: () => null }))
vi.mock("./catalog-reconcile-panel", () => ({ CatalogReconcilePanel: () => null }))
vi.mock("./catalog-post-linker", () => ({ CatalogPostLinker: () => null }))
vi.mock("./contact-team-panel", () => ({ ContactTeamPanel: () => null }))

import { appResources } from "@/i18n/resources"
import { ShopEditor } from "./shop-editor-screen"
import type { ShopEditorData } from "./shop-model"

const i18n = createAppI18n({ locale: "fr", appResources, defaultNS: "shops" })
const SHOP = {
  shopId: "shop-1",
  name: "Atelier partagé",
  model: "products",
  page: null,
  storefront: { state: "draft" },
  blocks: [],
  checkout: { missing: [] },
} as unknown as ShopEditorData

let root: Root
let container: HTMLDivElement
const button = (label: string) => [...container.querySelectorAll("button")].find((node) => node.textContent === label)

beforeEach(async () => {
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
  await act(async () => root.render(<I18nextProvider i18n={i18n}><ShopEditor shop={SHOP} /></I18nextProvider>))
})
afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
})

describe("étapes de l'éditeur de boutique (P18b, A14)", () => {
  it("monte la préparation financière dans la configuration réelle des offres", async () => {
    await act(async () => button(`3. ${i18n.t("steps.offers")}`)!.click())
    expect(container.querySelector("[data-payment-preparation]")?.closest("[hidden]")).toBeNull()
    expect(container.querySelector("[data-payment-preparation]")).not.toBeNull()
  })
  it("« Ma présentation » depuis le panneau d'activité porte le focus sur le titre du panneau ouvert et l'annonce", async () => {
    const next = [...container.querySelectorAll("form button")].find((node) => node.textContent === i18n.t("steps.presentation"))!
    ;(next as HTMLButtonElement).focus()
    await act(async () => (next as HTMLButtonElement).click())

    const heading = [...container.querySelectorAll("h2")].find((node) => node.textContent === "Ma présentation")!
    expect(document.activeElement).toBe(heading)
    expect(heading.getAttribute("tabindex")).toBe("-1")
    expect(container.querySelector('[role="status"].sr-only')?.textContent).toBe(i18n.t("editor.stepPosition", { current: 2, total: 4, name: i18n.t("steps.presentation") }))
  })

  it("un bouton d'étape de la navigation annonce l'étape sans déplacer le focus", async () => {
    const step = button(`4. ${i18n.t("steps.publish")}`)!
    step.focus()
    await act(async () => step.click())

    expect(document.activeElement).toBe(step)
    expect(container.querySelector('[role="status"].sr-only')?.textContent).toBe(i18n.t("editor.stepPosition", { current: 4, total: 4, name: i18n.t("steps.publish") }))
  })

  it("« préparer » depuis la publication ramène à la présentation, focus sur son titre", async () => {
    await act(async () => button(`4. ${i18n.t("steps.publish")}`)!.click())
    await act(async () => button("préparer")!.click())

    expect(document.activeElement?.textContent).toBe("Ma présentation")
  })
})
