// @vitest-environment jsdom
import { createAppI18n } from "@antsia/social-features/i18n"
import { act, type AnchorHTMLAttributes, type ReactNode } from "react"
import { createRoot, type Root } from "react-dom/client"
import { I18nextProvider } from "react-i18next"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { appResources } from "@/i18n/resources"
import { routes } from "@/lib/routes"

const mocks = vi.hoisted(() => ({ publish: vi.fn(), opened: vi.fn(), authenticated: true, signingOut: false }))
vi.mock("@antsia/api/engine", () => ({ api: { modules: { stories: { stories: { publishDailySpecial: "publish" } } } } }))
vi.mock("@antsia/api/network", () => ({ useNetwork: () => ({ networkId: "network", personId: "person" }) }))
vi.mock("@antsia/api/sign-out-everywhere", () => ({ isSigningOutEverywhere: () => mocks.signingOut }))
vi.mock("@antsia/social-features/features/stories/stories-entry", () => ({ markStoriesOpenedFromApp: mocks.opened }))
vi.mock("convex/react", () => ({ useConvexAuth: () => ({ isAuthenticated: mocks.authenticated }), useMutation: () => mocks.publish }))
vi.mock("@/components/member-chrome", () => ({ MemberPage: ({ children }: { children: ReactNode }) => <main>{children}</main> }))
vi.mock("next/link", () => ({ default: ({ href, children, onClick, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => <a {...rest} href={href} onClick={event => { event.preventDefault(); onClick?.(event) }}>{children}</a> }))

import { DailySpecialStoryShare } from "./daily-special-story-share"

const i18n = createAppI18n({ locale: "fr", appResources, defaultNS: "shops" })
const initial = { shopId: "shop" as import("@antsia/api/engine").Id<"shops">, offerRef: "pro:offer:poisson", day: "2026-10-24", title: "Poisson fumé", available: true, dirty: false }
const result = { storyId: "story", created: true, expiresAt: Date.UTC(2026, 9, 24, 23) }
let root: Root
let container: HTMLDivElement
async function render(props: Partial<typeof initial> = {}) { await act(async () => root.render(<I18nextProvider i18n={i18n}><DailySpecialStoryShare {...initial} {...props} /></I18nextProvider>)) }
const share = () => container.querySelector<HTMLButtonElement>("button")!
async function clickShare() { await act(async () => { share().click() }) }

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
  vi.clearAllMocks()
  mocks.authenticated = true
  mocks.signingOut = false
  mocks.publish.mockResolvedValue(result)
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
})
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals() })

describe("SU06 — partage explicite du plat du jour", () => {
  it("n'écrit rien au montage et envoie la sélection attendue seulement après le geste", async () => {
    await render()
    expect(mocks.publish).not.toHaveBeenCalled()
    expect(container.textContent).toContain("minuit à Libreville")
    expect(share().getAttribute("aria-label")).toContain("Poisson fumé")
    await clickShare()
    expect(mocks.publish).toHaveBeenCalledExactlyOnceWith({ networkId: "network", shopId: "shop", expectedOfferRef: initial.offerRef, expectedDay: initial.day })
    expect(container.querySelector('[role="status"]')?.textContent).toBe(i18n.t("dailySpecial.story.created"))
  })

  it.each([{ dirty: true }, { available: false }])("ferme le geste pour une présentation modifiée ou une offre/photo indisponible (%o)", async props => {
    await render(props)
    expect(share().disabled).toBe(true)
    await clickShare()
    expect(mocks.publish).not.toHaveBeenCalled()
    expect(container.querySelector("a")).toBeNull()
  })

  it("verrouille le double geste pendant la réponse et confirme un replay sans inventer une nouvelle Story", async () => {
    let finish!: (value: typeof result) => void
    mocks.publish.mockReturnValue(new Promise<typeof result>(resolve => { finish = resolve }))
    await render()
    await clickShare()
    await clickShare()
    expect(mocks.publish).toHaveBeenCalledTimes(1)
    expect(share().disabled).toBe(true)
    await act(async () => finish({ ...result, created: false }))
    expect(container.querySelector('[role="status"]')?.textContent).toBe(i18n.t("dailySpecial.story.existing"))
  })

  it("ouvre les vraies Stories en conservant leur retour vers l'éditeur", async () => {
    await render()
    await clickShare()
    const link = container.querySelector<HTMLAnchorElement>("a")!
    expect(link.getAttribute("href")).toBe(routes.stories())
    expect(mocks.opened).not.toHaveBeenCalled()
    await act(async () => link.click())
    expect(mocks.opened).toHaveBeenCalledTimes(1)
  })

  it("dit le refus du serveur sans annoncer ni proposer une Story créée", async () => {
    mocks.publish.mockRejectedValue(new Error("source changed"))
    await render()
    await clickShare()
    expect(container.querySelector('[role="alert"]')?.textContent).toBe(i18n.t("common.actionFailed"))
    expect(container.querySelector('[role="status"], a')).toBeNull()
  })

  it("n'adopte pas une réponse tardive après la sortie de session", async () => {
    let finish!: (value: typeof result) => void
    mocks.publish.mockReturnValue(new Promise<typeof result>(resolve => { finish = resolve }))
    await render()
    await clickShare()
    mocks.signingOut = true
    await act(async () => finish(result))
    expect(container.querySelector('[role="status"], a')).toBeNull()
  })
})
