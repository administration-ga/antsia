// @vitest-environment jsdom
/** P16 : accord public versionné et portée affichée, scénarios écrits non exécutés. */
import { createAppI18n } from "@antsia/social-features/i18n"
import { act, type ReactNode } from "react"
import { createRoot, type Root } from "react-dom/client"
import { I18nextProvider } from "react-i18next"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { appResources } from "@/i18n/resources"
const mocks = vi.hoisted(() => ({ audience: vi.fn(), other: vi.fn(), dirty: vi.fn(), prepare: vi.fn(), network: { networkId: "network-a", personId: "person-a" } }))
vi.mock("@antsia/api/engine", () => ({ api: { modules: { shops: { shops: { setStorefrontAudience: "audience", requestStorefrontPublication: "request", cancelPublicationRequest: "cancel", withdrawStorefront: "withdraw" } } } } }))
vi.mock("@antsia/api/network", () => ({ useNetwork: () => mocks.network }))
vi.mock("@antsia/api/sign-out-everywhere", () => ({ isSigningOutEverywhere: () => false }))
vi.mock("convex/react", () => ({ useConvexAuth: () => ({ isAuthenticated: true }), useMutation: (ref: string) => ref === "audience" ? mocks.audience : mocks.other }))
vi.mock("@/components/member-chrome", () => ({ MemberPage: ({ children }: { children: ReactNode }) => <main>{children}</main> }))
import { ShopPublicationForm } from "./shop-publication-form"
import { editorFixture } from "./__tests__/fixtures"
import type { ShopEditorData } from "./shop-model"
const i18n = createAppI18n({ locale: "fr", appResources, defaultNS: "shops" })
let root: Root, container: HTMLDivElement, shop: ShopEditorData
async function render() { await act(async () => root.render(<I18nextProvider i18n={i18n}><ShopPublicationForm shop={shop} dirty={false} onDirty={mocks.dirty} onPrepare={mocks.prepare} /></I18nextProvider>)) }
async function check() { await act(async () => container.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click()) }
async function submit() { await act(async () => container.querySelector<HTMLButtonElement>('button[type="submit"]')!.click()) }
beforeEach(() => {
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  shop = editorFixture(); mocks.network = { networkId: "network-a", personId: "person-a" }
  for (const mock of [mocks.audience, mocks.other, mocks.dirty, mocks.prepare]) mock.mockReset()
  mocks.audience.mockResolvedValue({ changed: true })
  container = document.createElement("div"); document.body.append(container); root = createRoot(container)
})
afterEach(async () => { await act(async () => root.unmount()); container.remove() })
describe("nouvel accord de diffusion publique", () => {
  it("ne pré-coche jamais un nouvel accord depuis celui conservé, et permet son retrait réel", async () => {
    shop = { ...shop, audience: { ...shop.audience, publicListing: true, publicNow: true, consentTextVersion: shop.audience.currentTextVersion } }
    await render()
    expect(container.querySelector<HTMLInputElement>('input[type="checkbox"]')!.checked).toBe(false)
    expect(container.textContent).toContain(i18n.t("publication.publicNow"))
    expect(container.querySelector<HTMLButtonElement>('button[type="submit"]')!.textContent).toBe(i18n.t("publication.withdrawPublicConsent"))
    await submit()
    expect(mocks.audience).toHaveBeenCalledWith({ networkId: "network-a", shopId: shop.shopId, publicListing: false })
    expect(mocks.audience.mock.calls[0]![0]).not.toHaveProperty("textVersion")
  })
  it("transmet la version précisément acceptée, puis annule la case pour un prochain accord", async () => {
    await render(); await check(); await submit()
    expect(mocks.audience).toHaveBeenCalledWith({ networkId: "network-a", shopId: shop.shopId, publicListing: true, textVersion: "2026-10-18" })
    expect(container.querySelector<HTMLInputElement>('input[type="checkbox"]')!.checked).toBe(false)
  })
  it("une nouvelle version annule l'ancien coche et nécessite un nouveau geste", async () => {
    await render(); await check()
    shop = { ...shop, updatedAt: 2, audience: { ...shop.audience, currentTextVersion: "version-suivante" } }; await render()
    expect(container.querySelector<HTMLInputElement>('input[type="checkbox"]')!.checked).toBe(false)
    await submit(); expect(mocks.audience).not.toHaveBeenCalled()
    await check(); await submit()
    expect(mocks.audience.mock.calls[0]![0]).toMatchObject({ publicListing: true, textVersion: "version-suivante" })
  })
  it("un changement de portée annule l'accord et ne renouvelle rien implicitement", async () => {
    shop = { ...shop, audience: { ...shop.audience, rootNetwork: false } }
    await render(); await check()
    await act(async () => {
      const select = container.querySelector("select")!; select.value = "root"; select.dispatchEvent(new Event("change", { bubbles: true }))
    })
    expect(container.querySelector<HTMLInputElement>('input[type="checkbox"]')!.checked).toBe(false)
    await submit()
    expect(mocks.audience).toHaveBeenCalledWith({ networkId: "network-a", shopId: shop.shopId, publicListing: false, visibility: "root" })
    await check(); await submit()
    expect(mocks.audience.mock.calls[1]![0]).toMatchObject({ publicListing: true, visibility: "root", textVersion: shop.audience.currentTextVersion })
  })
  it("un acteur remplacé doit redonner son propre accord", async () => {
    await render(); await check()
    mocks.network = { networkId: "network-a", personId: "person-b" }; await render()
    expect(container.querySelector<HTMLInputElement>('input[type="checkbox"]')!.checked).toBe(false)
    await submit()
    expect(mocks.audience).not.toHaveBeenCalled()
  })
})

describe("réponse d'accord tardive", () => {
  it("une réponse d'une ancienne portée ne confirme pas la nouvelle", async () => {
    let finish!: (value: { changed: boolean }) => void
    mocks.audience.mockImplementation(() => new Promise(resolve => { finish = resolve }))
    await render(); await check(); await submit()
    shop = { ...shop, updatedAt: 2, audience: { ...shop.audience, currentTextVersion: "nouvelle-version" } }; await render()
    await act(async () => finish({ changed: true }))
    expect(container.textContent).not.toContain(i18n.t("publication.audienceSaved"))
    expect(container.querySelector<HTMLInputElement>('input[type="checkbox"]')!.checked).toBe(false)
  })
})
