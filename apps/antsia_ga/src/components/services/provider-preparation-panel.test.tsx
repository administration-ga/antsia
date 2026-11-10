// @vitest-environment jsdom
import type { Id } from "@antsia/api/engine"
import type { CommerceMerchantCapability } from "@antsia/social-domain/commerce-merchant"
import { createAppI18n } from "@antsia/social-features/i18n"
import { act, type ReactNode } from "react"
import { createRoot, type Root } from "react-dom/client"
import { I18nextProvider } from "react-i18next"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ network: { networkId: "network-a", personId: "person-a" }, read: vi.fn(), href: vi.fn() }))
vi.mock("@antsia/api/engine", () => ({ api: { modules: { shops: { merchantPreparationActions: { read: "read" } } } } }))
vi.mock("@antsia/api/network", () => ({ useNetwork: () => mocks.network }))
vi.mock("convex/react", () => ({ useConvexAuth: () => ({ isAuthenticated: true }), useAction: () => mocks.read }))
vi.mock("@/lib/routes", () => ({ proMerchantTargetHref: (...args: unknown[]) => mocks.href(...args) }))
vi.mock("@antsia/api/sign-out-everywhere", () => ({ isSigningOutEverywhere: () => false }))
vi.mock("@/components/member-chrome", () => ({ MemberPage: ({ children }: { children: ReactNode }) => <main>{children}</main> }))
import { appResources } from "@/i18n/resources"
import { ProviderPreparationPanel } from "./provider-preparation-panel"

const now = Date.UTC(2026, 9, 21, 12)
const shopId = "shop-a" as Id<"shops">
const capabilities: CommerceMerchantCapability[] = [
  { key: "catalog", canOpen: true, target: "catalog", missing: ["catalog_unpublished"] },
  { key: "quotes", canOpen: true, target: "quotes", missing: [] },
  { key: "agenda", canOpen: false, target: null, missing: ["task_denied", "service_disabled"] },
  { key: "fixed_packages", canOpen: false, target: null, missing: ["permission_missing"] },
]
const ready = () => ({ outcome: "ready", preparation: { checkedAt: now, expiresAt: now + 60_000, publishedCatalog: { available: false, revision: null }, servicesEnabled: false, capabilities }, proAppOrigin: "https://merchant.example", proShopRef: "pro.ga:structure:01JA000000000000000000S1" })
let root: Root, container: HTMLDivElement, online: boolean
async function render(dirty = false, locale: "fr" | "en" = "fr") { await act(async () => root.render(<I18nextProvider i18n={createAppI18n({ locale, appResources, defaultNS: "providerPreparation" })}><ProviderPreparationPanel shopId={shopId} dirty={dirty} /></I18nextProvider>)) }
async function clickRead() { const button = container.querySelector("button")!; await act(async () => button.click()) }
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(now)
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  online = true; vi.spyOn(navigator, "onLine", "get").mockImplementation(() => online)
  mocks.network = { networkId: "network-a", personId: "person-a" }
  mocks.read.mockReset().mockResolvedValue(ready())
  mocks.href.mockReset().mockReturnValue("https://merchant.example/authorized-screen")
  container = document.createElement("div"); document.body.append(container); root = createRoot(container)
})
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); vi.useRealTimers() })

describe("MP06c — préparation prestataire sous mandat PRO", () => {
  it("lit seulement au geste et affiche capacités/manques exacts sans formulaire de gestion", async () => {
    await render()
    expect(mocks.read).not.toHaveBeenCalled()
    await clickRead()
    expect(mocks.read).toHaveBeenCalledWith({ networkId: "network-a", shopId })
    expect(container.querySelectorAll("h4")).toHaveLength(4)
    expect(container.textContent).toContain("Le catalogue n’est pas publié")
    expect(container.textContent).toContain("Cette tâche ne vous est pas autorisée")
    expect(container.textContent).toContain("Les services sont désactivés")
    expect(container.textContent).toContain("Désactivée dans PRO.GA")
    expect(container.querySelectorAll("a")).toHaveLength(2)
    expect(container.querySelector("form, input, h1, main")).toBeNull()
    expect(container.textContent).not.toContain("pro.ga:structure")
  })
  it("ne dérive aucun lien d'un manque ni d'un rôle local : seules les cibles autorisées vont au helper", async () => {
    await render(); await clickRead()
    expect(mocks.href).toHaveBeenCalledWith(ready().proAppOrigin, ready().proShopRef, "catalog")
    expect(mocks.href).toHaveBeenCalledWith(ready().proAppOrigin, ready().proShopRef, "quotes")
    expect(mocks.href.mock.calls.every(call => call[2] === "catalog" || call[2] === "quotes")).toBe(true)
    expect([...container.querySelectorAll("a")].every(link => link.target === "_blank" && link.rel.includes("noopener"))).toBe(true)
  })
  it("retire les accès dès expiration et attend une nouvelle lecture explicite", async () => {
    await render(); await clickRead()
    await act(async () => { vi.advanceTimersByTime(60_020) })
    expect(container.querySelector("a")).toBeNull()
    expect(container.textContent).toContain("Cette vérification a expiré")
    expect(mocks.read).toHaveBeenCalledOnce()
  })
  it("dirty ferme les accès et le retour après enregistrement ne réutilise pas l'ancienne preuve", async () => {
    await render(); await clickRead()
    await render(true)
    expect(container.querySelector("a")).toBeNull()
    expect(container.querySelector("button")?.disabled).toBe(true)
    expect(container.textContent).toContain("Enregistrez vos modifications")
    await render(false)
    expect(container.querySelector("a")).toBeNull()
    expect(mocks.read).toHaveBeenCalledOnce()
  })
  it("une relecture lente retire d'abord les accès et une panne ne recycle aucun ancien succès", async () => {
    await render(); await clickRead()
    let fail!: (reason: Error) => void
    mocks.read.mockReturnValueOnce(new Promise((_resolve, reject) => { fail = reject }))
    await clickRead()
    expect(container.querySelector("a")).toBeNull()
    await act(async () => fail(new Error("private backend detail")))
    expect(container.querySelector("a")).toBeNull()
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("n’est pas accessible")
    expect(container.textContent).not.toContain("private backend detail")
  })
  it.each(["refused", "unavailable"])("un résultat %s ne produit aucune gestion factice", async outcome => {
    mocks.read.mockResolvedValue({ outcome })
    await render(); await clickRead()
    expect(container.querySelector("a, form, input")).toBeNull()
    expect(container.querySelector('[role="alert"]')).not.toBeNull()
  })
  it("une cible que le registre parent refuse ne devient pas une URL libre", async () => {
    mocks.href.mockReturnValue(null)
    await render(); await clickRead()
    expect(container.querySelector("a")).toBeNull()
  })
  it("un changement d'acteur ignore la réponse ancienne et réclame une lecture de la nouvelle portée", async () => {
    let finish!: (value: unknown) => void
    mocks.read.mockReturnValueOnce(new Promise(resolve => { finish = resolve }))
    await render(); await clickRead()
    mocks.network = { networkId: "network-b", personId: "person-b" }; await render()
    await act(async () => finish(ready()))
    expect(container.querySelector("a")).toBeNull()
    expect(container.querySelector("h4")).toBeNull()
  })
  it("une édition commencée pendant la lecture rend aussi son retour tardif caduc", async () => {
    let finish!: (value: unknown) => void
    mocks.read.mockReturnValueOnce(new Promise(resolve => { finish = resolve }))
    await render(); await clickRead(); await render(true); await render(false)
    await act(async () => finish(ready()))
    expect(container.querySelector("a")).toBeNull()
  })
  it("un passage hors ligne puis en ligne ne relance pas la lecture ni ne restaure les accès", async () => {
    await render(); await clickRead()
    await act(async () => { online = false; window.dispatchEvent(new Event("offline")) })
    expect(container.querySelector("a")).toBeNull()
    await act(async () => { online = true; window.dispatchEvent(new Event("online")) })
    expect(container.querySelector("a")).toBeNull()
    expect(mocks.read).toHaveBeenCalledOnce()
  })
  it("traduit la préparation en anglais", async () => {
    await render(false, "en"); await clickRead()
    expect(container.textContent).toContain("Prepare my services")
    expect(container.textContent).toContain("A required permission is missing")
    expect(container.textContent).not.toContain("providerPreparation:")
  })
})
