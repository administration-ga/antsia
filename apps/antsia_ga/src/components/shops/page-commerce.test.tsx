// @vitest-environment jsdom
/** La fiche d'une page qui vend, selon sa nature (décision du propriétaire du 22/10/2026). */
import { createAppI18n } from "@antsia/social-features/i18n"
import { act, type ReactNode } from "react"
import { createRoot, type Root } from "react-dom/client"
import { I18nextProvider } from "react-i18next"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ answers: {} as Record<string, unknown> }))
vi.mock("@antsia/api/engine", () => ({ api: { modules: { pages: { pages: { getPage: "getPage" } }, shops: { shops: { storefront: "storefront" }, catalog: { list: "list" } } } } }))
vi.mock("@antsia/api/hooks", () => ({ useAuthenticatedConvexQuery: (reference: string) => ({ data: mocks.answers[reference], isPending: mocks.answers[reference] === undefined, isError: false, isFetching: false, refetch: vi.fn() }) }))
vi.mock("@antsia/api/network", () => ({ useNetwork: () => ({ networkId: "root", personId: "reader" }) }))
vi.mock("@antsia/api/sign-out-everywhere", () => ({ isSigningOutEverywhere: () => false }))
vi.mock("convex/react", () => ({ useConvexAuth: () => ({ isAuthenticated: true }), useMutation: () => vi.fn() }))
vi.mock("@/components/member-chrome", () => ({ MemberPage: ({ children }: { children: ReactNode }) => <main>{children}</main> }))
// Le moteur pose ce que l'application lui donne : un double qui montre la présentation reçue.
vi.mock("@antsia/social-features/reseau-personnel", () => ({
  ProfilPagePage: ({ handle, commerce }: { handle: string; commerce?: { presentation: string; hero?: ReactNode; lead?: ReactNode; interleave?: (rank: number) => ReactNode } }) => <div data-page={handle} data-presentation={commerce?.presentation ?? "page"}>{commerce?.hero}{commerce?.lead}{commerce?.interleave ? <div data-interleave>{commerce.interleave(1)}</div> : null}</div>,
}))
vi.mock("./member-storefront-screen", () => ({
  StorefrontHero: ({ shop }: { shop: { name: string } }) => <h1 data-hero>{shop.name}</h1>,
  StorefrontBody: ({ publications = true }: { publications?: boolean }) => <div data-body data-publications={String(publications)} />,
}))
vi.mock("@/components/cart/offer-quick-add", () => ({ OfferQuickAdd: ({ offer }: { offer: { offerRef: string } }) => <button type="button" data-quick-add={offer.offerRef} /> }))

import { appResources } from "@/i18n/resources"
import { routes } from "@/lib/routes"
import { catalogOfferFixture, catalogPageFixture } from "./__tests__/catalog-fixtures"
import { storefrontFixture } from "./__tests__/fixtures"
import { PageWithCommerce } from "./page-commerce"

const i18n = createAppI18n({ locale: "fr", appResources, defaultNS: "shops" })
let root: Root, container: HTMLDivElement
const offer = (index: number) => catalogOfferFixture({ offerRef: `pro.ga:offer:01JA0000000000000000000${index}A`, title: `Offre ${index}`, variants: [], variantAxes: [], price: { mode: "fixed", currency: "XAF", amount: 1000 * index } })
async function render() { await act(async () => root.render(<I18nextProvider i18n={i18n}><PageWithCommerce handle="atelier" /></I18nextProvider>)) }
const presentation = () => container.querySelector("[data-presentation]")?.getAttribute("data-presentation")
const titles = (scope: Element | null) => [...(scope?.querySelectorAll("[data-offer-card] h3") ?? [])].map(node => node.textContent)

beforeEach(() => {
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  mocks.answers = { getPage: { ownerKind: "association" }, storefront: storefrontFixture(), list: catalogPageFixture({ page: [offer(1), offer(2)] }) }
  container = document.createElement("div"); document.body.append(container); root = createRoot(container)
})
afterEach(async () => { await act(async () => root.unmount()); container.remove() })

describe("La fiche d'une page qui vend, selon sa nature", () => {
  it("tant qu'on ne sait pas si la page vend, on attend : la fiche ne change pas de visage", async () => {
    mocks.answers.storefront = undefined
    await render()
    expect(container.querySelector("[data-page]")).toBeNull()
    expect(container.querySelector("[role=status]")?.textContent).toBe(i18n.t("common.loading"))
  })

  it("une page sans boutique reste la fiche d'une page", async () => {
    mocks.answers.storefront = null
    await render()
    expect(presentation()).toBe("page")
  })

  it("une entreprise qui vend se présente comme sa boutique ; ses publications suivent, sans bloc en double", async () => {
    mocks.answers.getPage = { ownerKind: "company" }
    await render()
    expect(presentation()).toBe("shop")
    expect(container.querySelector("[data-hero]")?.textContent).toBe("Atelier des rives")
    expect(container.querySelector("[data-body]")?.getAttribute("data-publications")).toBe("false")
  })

  it("une association : ses produits en tête, en grandes cartes jusqu'à trois avec l'ajout direct, sans rappel entre les publications", async () => {
    await render()
    expect(presentation()).toBe("products")
    const lead = container.querySelector("[data-page-offers]")
    expect(lead?.querySelector("h2")?.textContent).toBe(i18n.t("pageShop.products"))
    expect(titles(lead)).toEqual(["Offre 1", "Offre 2"])
    expect(lead?.querySelectorAll("[data-quick-add]")).toHaveLength(2)
    expect([...(lead?.querySelectorAll("a") ?? [])].find(link => link.textContent === i18n.t("pageShop.seeShop"))?.getAttribute("href")).toBe(routes.storefront("atelier"))
    expect(container.querySelector("[data-interleave]")).toBeNull()
  })

  it("au-delà de trois offres, elles défilent, et d'autres reviennent toutes les trois publications, chaque fois plus loin", async () => {
    mocks.answers.getPage = { ownerKind: "media" }
    mocks.answers.list = catalogPageFixture({ page: [1, 2, 3, 4, 5].map(offer) })
    await render()
    expect(presentation()).toBe("products")
    expect(titles(container.querySelector("[data-page] > [data-rail]"))).toEqual(["Offre 1", "Offre 2", "Offre 3", "Offre 4", "Offre 5"])
    const interleaved = container.querySelector("[data-interleave] [data-rail]")
    expect(interleaved?.querySelector("h3")?.textContent).toBe(i18n.t("pageShop.inShop"))
    expect(titles(interleaved)).toEqual(["Offre 4", "Offre 5", "Offre 1", "Offre 2", "Offre 3"])
  })
})
