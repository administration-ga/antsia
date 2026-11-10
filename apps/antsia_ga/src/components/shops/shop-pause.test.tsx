// @vitest-environment jsdom
/**
 * CM-10 — la boutique en pause à l'écran : le bandeau du membre (lecture à part, instant arrondi, extinction seule
 * à l'échéance), le geste du gérant à l'étape Publier (date bornée, confirmation, « Rouvrir maintenant ») et sa
 * présence pour une vitrine publiée seulement.
 */
import { createAppI18n } from "@antsia/social-features/i18n"
import { shopPauseDayBounds, shopPauseReopensAt } from "@antsia/social-domain/shopPause"
import { act, type ReactNode } from "react"
import { createRoot, type Root } from "react-dom/client"
import { I18nextProvider } from "react-i18next"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { appResources } from "@/i18n/resources"

const mocks = vi.hoisted(() => ({ query: vi.fn(), pause: vi.fn(), resume: vi.fn(), other: vi.fn() }))
vi.mock("@antsia/api/engine", () => ({ api: { modules: { shops: { shops: { storefrontPause: "storefrontPause", pauseStorefront: "pause", resumeStorefront: "resume", setStorefrontAudience: "audience", requestStorefrontPublication: "request", cancelPublicationRequest: "cancel", withdrawStorefront: "withdraw" } } } } }))
vi.mock("@antsia/api/hooks", () => ({ useAuthenticatedConvexQuery: (reference: string, args: unknown) => mocks.query(reference, args) }))
vi.mock("@antsia/api/network", () => ({ useNetwork: () => ({ networkId: "network-a", personId: "person-a" }) }))
vi.mock("@antsia/api/sign-out-everywhere", () => ({ isSigningOutEverywhere: () => false }))
vi.mock("convex/react", () => ({ useConvexAuth: () => ({ isAuthenticated: true }), useMutation: (reference: string) => reference === "pause" ? mocks.pause : reference === "resume" ? mocks.resume : mocks.other }))
vi.mock("@/components/member-chrome", () => ({ MemberPage: ({ children }: { children: ReactNode }) => <main>{children}</main> }))

import { editorFixture } from "./__tests__/fixtures"
import type { ShopEditorData } from "./shop-model"
import { ShopPauseBanner } from "./shop-pause"
import { ShopPauseForm } from "./shop-pause-form"
import { ShopPublicationForm } from "./shop-publication-form"

const i18n = createAppI18n({ locale: "fr", appResources, defaultNS: "shops" })
const DAY = 86_400_000
let root: Root, container: HTMLDivElement

async function render(node: ReactNode) { await act(async () => root.render(<I18nextProvider i18n={i18n}>{node}</I18nextProvider>)) }
async function flush() { for (let index = 0; index < 5; index++) await act(async () => { await Promise.resolve() }) }
function published(extra: Partial<ShopEditorData> = {}): ShopEditorData {
  const base = editorFixture()
  return { ...base, page: { handle: "atelier", badge: "community" }, storefront: { ...base.storefront, state: "published", publishedAt: 1 }, ...extra }
}
function button(label: string) { return [...container.querySelectorAll("button")].find((node) => node.textContent === label) }
async function chooseDay(value: string) {
  const input = container.querySelector<HTMLInputElement>('[data-shop-pause-editor] input[type="date"]')!
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value)
    input.dispatchEvent(new Event("input", { bubbles: true }))
    input.dispatchEvent(new Event("change", { bubbles: true }))
  })
}
async function submitPause() {
  await act(async () => { container.querySelector("[data-shop-pause-editor] form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })) })
  await flush()
}

beforeEach(() => {
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  for (const mock of [mocks.query, mocks.pause, mocks.resume, mocks.other]) mock.mockReset()
  container = document.createElement("div"); document.body.append(container); root = createRoot(container)
})
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); vi.useRealTimers() })

describe("CM-10 — le bandeau d'une boutique en pause", () => {
  it("lit l'échéance à part avec un instant arrondi à la minute, et dit la réouverture", async () => {
    const pausedUntil = Date.UTC(2030, 10, 14, 23)
    mocks.query.mockReturnValue({ data: { pausedUntil }, isError: false, isPending: false })
    await render(<ShopPauseBanner handle="atelier" />)
    const [reference, args] = mocks.query.mock.calls[0]! as [string, { networkId: string; handle: string; now: number }]
    expect(reference).toBe("storefrontPause")
    expect(args).toMatchObject({ networkId: "network-a", handle: "atelier" })
    expect(args.now % 60_000).toBe(0)
    const banner = container.querySelector("[data-shop-pause]")
    expect(banner?.getAttribute("role")).toBe("status")
    expect(banner?.textContent).toContain(i18n.t("pause.bannerTitle"))
    expect(banner?.textContent).toContain("Réouverture le 15 novembre 2030")
  })

  it.each([
    ["ouverte", { data: null, isError: false, isPending: false }],
    ["en lecture", { data: undefined, isError: false, isPending: true }],
    ["en panne", { data: undefined, isError: true, isPending: false }],
  ])("boutique %s : aucun bandeau (la garde du serveur reste l'autorité)", async (_label, answer) => {
    mocks.query.mockReturnValue(answer)
    await render(<ShopPauseBanner handle="atelier" />)
    expect(container.querySelector("[data-shop-pause]")).toBeNull()
  })

  it("s'éteint seul à l'échéance et relance la lecture avec un instant postérieur", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] })
    const now = Date.UTC(2026, 10, 10, 11, 30, 15)
    vi.setSystemTime(now)
    const pausedUntil = now + 90_000
    mocks.query.mockImplementation((_reference: string, args: { now: number }) => ({ data: args.now >= pausedUntil ? null : { pausedUntil }, isError: false, isPending: false }))
    await render(<ShopPauseBanner handle="atelier" />)
    expect(container.querySelector("[data-shop-pause]")).not.toBeNull()
    await act(async () => { vi.advanceTimersByTime(90_100) })
    expect(container.querySelector("[data-shop-pause]")).toBeNull()
    const lastNow = (mocks.query.mock.calls.at(-1)![1] as { now: number }).now
    expect(lastNow).toBeGreaterThanOrEqual(pausedUntil)
    expect(lastNow % 60_000).toBe(0)
  })
})

describe("CM-10 — « Fermer temporairement » à l'étape Publier", () => {
  it("n'apparaît que pour une vitrine publiée, avant « Retirer la vitrine »", async () => {
    await render(<ShopPublicationForm shop={editorFixture()} dirty={false} onDirty={vi.fn()} onPrepare={vi.fn()} />)
    expect(container.querySelector("[data-shop-pause-editor]")).toBeNull()
    await render(<ShopPublicationForm shop={published()} dirty={false} onDirty={vi.fn()} onPrepare={vi.fn()} />)
    const editor = container.querySelector("[data-shop-pause-editor]")
    expect(editor?.textContent).toContain(i18n.t("pause.editorTitle"))
    const withdraw = button(i18n.t("publication.withdraw"))!
    expect(editor!.compareDocumentPosition(withdraw) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it("exige une date, de demain au plafond, puis ferme après confirmation", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true)
    mocks.pause.mockResolvedValue({ pausedUntil: 1 })
    const shop = published()
    await render(<ShopPauseForm shop={shop} />)
    const bounds = shopPauseDayBounds(Date.now())
    const input = container.querySelector<HTMLInputElement>('[data-shop-pause-editor] input[type="date"]')!
    expect([input.min, input.max]).toEqual([bounds.min, bounds.max])
    await submitPause()
    expect(container.textContent).toContain(i18n.t("pause.required"))
    const today = new Date(Date.parse(`${bounds.min}T00:00:00.000Z`) - DAY).toISOString().slice(0, 10)
    await chooseDay(today); await submitPause()
    expect(container.textContent).toContain(i18n.t("rules:SHOP_PAUSE_END_PAST"))
    const beyond = new Date(Date.parse(`${bounds.max}T00:00:00.000Z`) + DAY).toISOString().slice(0, 10)
    await chooseDay(beyond); await submitPause()
    expect(container.textContent).toContain(i18n.t("rules:SHOP_PAUSE_TOO_LONG", { days: 90 }))
    expect(mocks.pause).not.toHaveBeenCalled()
    await chooseDay(bounds.min); await submitPause()
    expect(confirm).toHaveBeenCalledWith(i18n.t("pause.closeConfirm", { until: shopPauseReopensAt(bounds.min) }))
    expect(mocks.pause).toHaveBeenCalledWith({ networkId: "network-a", shopId: shop.shopId, reopenDay: bounds.min })
    expect(container.textContent).toContain(i18n.t("pause.saved"))
  })

  it("sans confirmation, rien n'est envoyé ; un refus du serveur se dit par sa règle", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false)
    const day = shopPauseDayBounds(Date.now()).min
    await render(<ShopPauseForm shop={published()} />)
    await chooseDay(day); await submitPause()
    expect(mocks.pause).not.toHaveBeenCalled()
    confirm.mockReturnValue(true)
    mocks.pause.mockRejectedValue(Object.assign(new Error("refus"), { data: { code: "invalidArgument", rule: "SHOP_PAUSE_TOO_LONG", params: { days: 90 } } }))
    await submitPause()
    expect(container.querySelector('[data-shop-pause-editor] [role="alert"]')?.textContent).toBe(i18n.t("rules:SHOP_PAUSE_TOO_LONG", { days: 90 }))
  })

  it("en pause : dit la réouverture, préremplit le jour, et « Rouvrir maintenant » lève la pause après confirmation", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true)
    mocks.resume.mockResolvedValue({ resumed: true })
    const day = shopPauseDayBounds(Date.now()).max
    const pausedUntil = shopPauseReopensAt(day)!
    const shop = published({ pausedUntil })
    await render(<ShopPauseForm shop={shop} />)
    expect(container.textContent).toContain(i18n.t("pause.closedNow", { until: pausedUntil }))
    expect(container.querySelector<HTMLInputElement>('[data-shop-pause-editor] input[type="date"]')!.value).toBe(day)
    expect(button(i18n.t("pause.change"))).toBeDefined()
    await act(async () => button(i18n.t("pause.reopenNow"))!.click())
    await flush()
    expect(mocks.resume).toHaveBeenCalledWith({ networkId: "network-a", shopId: shop.shopId })
    expect(container.textContent).toContain(i18n.t("pause.reopened"))
  })

  it("une échéance passée n'est plus une pause : ni phrase de fermeture, ni « Rouvrir maintenant »", async () => {
    await render(<ShopPauseForm shop={published({ pausedUntil: Date.now() - 1 })} />)
    expect(container.textContent).not.toContain(i18n.t("pause.reopenNow"))
    expect(button(i18n.t("pause.close"))).toBeDefined()
  })
})
