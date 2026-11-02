// @vitest-environment jsdom
import { act } from "react"
import { createRoot } from "react-dom/client"
import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const state = vi.hoisted(() => ({ offer: null as unknown, list: null as unknown }))
vi.mock("@antsia/api/engine", () => ({ api: { modules: { stories: { stories: { publishDailySpecial: "publishDailySpecial" } }, shops: { shops: { storefront: "storefront", setDailySpecial: "setDailySpecial" }, catalog: { offer: "offer", list: "list" } }, pages: { pages: { follow: "follow", unfollow: "unfollow" } }, commercialMessaging: { threads: { findMyThread: "existingThread" } } } } }))
vi.mock("@antsia/api/hooks", () => ({ useAuthenticatedConvexQuery: (reference: string) => ({ data: reference === "offer" ? state.offer : reference === "list" ? state.list : null, isError: false, isPending: false, refetch: vi.fn() }) }))
vi.mock("@antsia/api/network", () => ({ useNetwork: () => ({ networkId: "root", personId: "reader" }) }))
vi.mock("@antsia/api/sign-out-everywhere", () => ({ isSigningOutEverywhere: () => false }))
vi.mock("convex/react", () => ({ useConvexAuth: () => ({ isAuthenticated: true }), useMutation: () => vi.fn() }))
vi.mock("react-i18next", () => ({ useTranslation: () => ({ i18n: { resolvedLanguage: "fr" }, t: (key: string, options?: Record<string, unknown>) => typeof options?.title === "string" ? `${key}:${options.title}` : key }) }))
vi.mock("@/components/member-chrome", () => ({ MemberPage: ({ children }: { children: import("react").ReactNode }) => <main>{children}</main> }))
vi.mock("@/components/jobs/member-shop-jobs-screen", () => ({ MemberShopJobsPreview: () => null }))
vi.mock("./catalog-member-screen", () => ({ MemberCatalogPreview: ({ title }: { title?: string }) => <div data-testid="catalog-preview">{title ?? "catalog.title"}</div> }))

import { routes } from "@/lib/routes"
import { DailySpecialPanel } from "./daily-special-panel"
import { MemberStorefront } from "./member-storefront-screen"
import { PublicDailySpecial } from "./public-daily-special"
import type { StorefrontData } from "./shop-model"
import { catalogOfferFixture, catalogPageFixture, OFFER_REF } from "./__tests__/catalog-fixtures"
import { storefrontFixture } from "./__tests__/fixtures"

/** Le 23/10/2026 à 10 h à Libreville. */
const TODAY = "2026-10-23"
const DISH = catalogOfferFixture({ title: "Poulet DG", description: "Plantain, légumes du marché.", price: { mode: "fixed", currency: "XAF", amount: 6500 } })
const foodStorefront = (changes: Partial<StorefrontData> = {}): StorefrontData => ({
  ...storefrontFixture(),
  activityConfiguration: { version: 1, capabilities: ["products"], template: "food", blocks: ["catalog", "about"] },
  blocks: ["catalog", "about"],
  hours: "Du lundi au samedi, de 8 h à 20 h",
  dailySpecial: { offerRef: OFFER_REF, day: TODAY },
  ...changes,
})

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(Date.UTC(2026, 9, 23, 9))
  state.offer = DISH
  state.list = catalogPageFixture({ page: [DISH, catalogOfferFixture({ offerRef: "pro.ga:offer:01JA00000000000000000000F2", title: "Brochettes" })] })
})
afterEach(() => { vi.useRealTimers() })

describe("SU06 — la vitrine d'une adresse « Alimentation et restauration »", () => {
  it("ouvre sur le plat du jour et son geste « Commander », montre les horaires dans l'en-tête et appelle son catalogue « Menu »", () => {
    const html = renderToStaticMarkup(<MemberStorefront shop={foodStorefront()} />)
    expect(html).toContain("data-daily-special")
    expect(html).toContain("food.todaysSpecial")
    expect(html).toContain("Poulet DG")
    expect(html).toContain(`href="${routes.shopOffer("atelier", OFFER_REF)}"`)
    expect(html).toContain(">postFormula.actions.orderProduct<")
    expect(html.indexOf("data-daily-special")).toBeLessThan(html.indexOf("catalog-preview"))
    expect(html).toContain("data-storefront-hours")
    expect(html).toContain("Du lundi au samedi, de 8 h à 20 h")
    expect(html).toContain(">food.seeMenu<")
    expect(html).toContain(">food.menu<")
    // Les horaires sont dans l'en-tête : la présentation ne les répète pas.
    expect(html).not.toContain("storefront.hours")
  })

  it("un plat d'un autre jour, une offre illisible ou une prestation : aucun plat du jour annoncé", () => {
    expect(renderToStaticMarkup(<MemberStorefront shop={foodStorefront({ dailySpecial: { offerRef: OFFER_REF, day: "2026-10-22" } })} />)).not.toContain("data-daily-special")
    state.offer = null
    expect(renderToStaticMarkup(<MemberStorefront shop={foodStorefront()} />)).not.toContain("data-daily-special")
    state.offer = { ...DISH, kind: "service" }
    expect(renderToStaticMarkup(<MemberStorefront shop={foodStorefront()} />)).not.toContain("data-daily-special")
  })

  it("une autre activité garde son catalogue, ses offres et ses horaires dans la présentation, sans plat du jour", () => {
    const html = renderToStaticMarkup(<MemberStorefront shop={foodStorefront({ activityConfiguration: { version: 1, capabilities: ["products"], template: "fashion", blocks: ["catalog", "about"] } })} />)
    expect(html).not.toContain("data-daily-special")
    expect(html).not.toContain("data-storefront-hours")
    expect(html).toContain(">catalog.title<")
    expect(html).toContain(">storefront.offers<")
    expect(html).toContain("storefront.hours")
  })
})

describe("SU06 — le plat du jour dans l'éditeur", () => {
  it("nomme le plat du jour, propose les produits du menu et permet de le retirer", () => {
    const html = renderToStaticMarkup(<DailySpecialPanel shopId={"shops_fixture" as never} handle="atelier" special={{ offerRef: OFFER_REF, day: TODAY }} dirty={false} />)
    expect(html).toContain("dailySpecial.current:Poulet DG")
    expect(html).toContain(`<option value="${OFFER_REF}">Poulet DG</option>`)
    expect(html).toContain(">Brochettes</option>")
    expect(html).toContain(">dailySpecial.set<")
    expect(html).toContain(">dailySpecial.clear<")
  })

  it("sans plat aujourd'hui, rien à retirer ; un menu vide le dit ; des changements non enregistrés ferment la désignation", () => {
    const yesterday = renderToStaticMarkup(<DailySpecialPanel shopId={"shops_fixture" as never} handle="atelier" special={{ offerRef: OFFER_REF, day: "2026-10-22" }} dirty={false} />)
    expect(yesterday).toContain("dailySpecial.none")
    expect(yesterday).not.toContain("dailySpecial.clear")
    state.list = catalogPageFixture({ page: [] })
    expect(renderToStaticMarkup(<DailySpecialPanel shopId={"shops_fixture" as never} handle="atelier" special={null} dirty={false} />)).toContain("dailySpecial.emptyMenu")
    state.list = catalogPageFixture({ page: [DISH] })
    const dirty = renderToStaticMarkup(<DailySpecialPanel shopId={"shops_fixture" as never} handle="atelier" special={null} dirty />)
    expect(dirty).toContain("link.saveFirst")
    expect(dirty).toMatch(/<fieldset disabled=""/)
  })
})

describe("SU06 — expiration d'un écran laissé ouvert", () => {
  it("retire le plat des vitrines publique et membre et de l'éditeur après minuit à Libreville, sans donnée nouvelle", () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
    vi.setSystemTime(Date.UTC(2026, 9, 23, 22, 59, 59, 900))
    const container = document.createElement("div")
    document.body.append(container)
    const root = createRoot(container)
    try {
      act(() => root.render(<>
        <MemberStorefront shop={foodStorefront()} />
        <PublicDailySpecial special={{ offerRef: OFFER_REF, day: TODAY }}><p data-public-special>Plat public</p></PublicDailySpecial>
        <DailySpecialPanel shopId={"shops_fixture" as never} handle="atelier" special={{ offerRef: OFFER_REF, day: TODAY }} dirty={false} />
      </>))
      expect(container.querySelector("[data-daily-special]")).not.toBeNull()
      expect(container.querySelector("[data-public-special]")).not.toBeNull()
      expect(container.querySelector("[data-daily-special-panel]")?.textContent).toContain("dailySpecial.current:Poulet DG")
      act(() => vi.advanceTimersByTime(121))
      expect(container.querySelector("[data-daily-special]")).toBeNull()
      expect(container.querySelector("[data-public-special]")).toBeNull()
      expect(container.querySelector("[data-daily-special-panel]")?.textContent).toContain("dailySpecial.none")
      expect(container.querySelector("[data-daily-special-panel]")?.textContent).not.toContain("dailySpecial.clear")
    } finally {
      act(() => root.unmount())
      container.remove()
      vi.unstubAllGlobals()
    }
  })

  it.each(["focus", "visibilitychange"])("réévalue le plat au retour de veille (%s), sans attendre le minuteur suspendu", event => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
    vi.setSystemTime(Date.UTC(2026, 9, 23, 22, 59))
    const container = document.createElement("div")
    const root = createRoot(container)
    try {
      act(() => root.render(<MemberStorefront shop={foodStorefront()} />))
      expect(container.querySelector("[data-daily-special]")).not.toBeNull()
      vi.setSystemTime(Date.UTC(2026, 9, 24, 5))
      act(() => (event === "focus" ? window : document).dispatchEvent(new Event(event)))
      expect(container.querySelector("[data-daily-special]")).toBeNull()
    } finally {
      act(() => root.unmount())
      container.remove()
      vi.unstubAllGlobals()
    }
  })
})
