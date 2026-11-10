/** CM-09 : l'écran « Mes favoris » (chargement, offres relues, mention des indisponibles, vide, « Voir plus ») et la case de la carte. */
import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

const state = vi.hoisted(() => ({
  status: "LoadingFirstPage" as "LoadingFirstPage" | "CanLoadMore" | "LoadingMore" | "Exhausted",
  results: [] as unknown[],
  queries: [] as unknown[],
}))
vi.mock("@antsia/api/engine", () => ({ api: { modules: { shops: { savedOffers: { listMine: "listMine", pruneUnavailable: "prune" } } } } }))
vi.mock("@antsia/api/hooks", () => ({ useAuthenticatedPaginatedQuery: (query: string, args: unknown, options: unknown) => { state.queries.push([query, args, options]); return { results: state.results, status: state.status, loadMore: vi.fn(), isLoading: state.status === "LoadingFirstPage" } } }))
vi.mock("@antsia/api/network", () => ({ useNetwork: () => ({ networkId: "network-fixture", personId: "reader-fixture" }) }))
vi.mock("convex/react", () => ({ useMutation: () => vi.fn() }))
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock("@/components/member-chrome", () => ({ MemberPage: ({ children }: { children: import("react").ReactNode }) => <main>{children}</main> }))
vi.mock("@/components/cart/offer-quick-add", () => ({ OfferQuickAdd: () => null }))
vi.mock("./save-offer-button", () => ({ SaveOfferButton: ({ offer }: { offer: { offerRef: string } }) => <button type="button" data-save-stub={offer.offerRef} /> }))
vi.mock("react-i18next", () => ({ useTranslation: () => ({ i18n: { resolvedLanguage: "fr" }, t: (key: string) => key }) }))

import { routes } from "@/lib/routes"
import { catalogOfferFixture } from "./__tests__/catalog-fixtures"
import { OfferCard } from "./offer-card"
import { SavedOffersScreen } from "./saved-offers-screen"

const t = (key: string) => key
beforeEach(() => { state.status = "LoadingFirstPage"; state.results = []; state.queries.length = 0 })

describe("CM-09 — écran « Mes favoris »", () => {
  it("lit MES favoris de ce réseau par pages de douze, et dit le chargement", () => {
    const html = renderToStaticMarkup(<SavedOffersScreen />)
    expect(state.queries).toContainEqual(["listMine", { networkId: "network-fixture" }, { initialNumItems: 12 }])
    expect(html).toContain("saved.title")
    expect(html).toContain("saved.privacy")
    expect(html).toContain('role="status"')
    expect(html).toContain("saved.loading")
  })

  it("montre les offres relues avec leur bouton, mentionne les indisponibles sans rien en dire, et propose « Voir plus »", () => {
    const offer = catalogOfferFixture({ title: "Sac artisanal enregistré" })
    state.status = "CanLoadMore"
    state.results = [{ kind: "offer", savedAt: 2, offer }, { kind: "unavailable", savedAt: 1 }]
    const html = renderToStaticMarkup(<SavedOffersScreen />)
    expect(html).toContain("Sac artisanal enregistré")
    expect(html).toContain(`data-save-stub="${offer.offerRef}"`)
    expect(html).toContain("saved.hidden")
    expect(html).toContain("saved.prune")
    expect(html).toContain("saved.more")
    expect(html).not.toContain("saved.empty")
    expect(html.match(/data-offer-card="true"/g)).toHaveLength(1)
  })

  it("sans favori : un état vide qui mène à la marketplace ; sans indisponible : aucune mention", () => {
    state.status = "Exhausted"
    const html = renderToStaticMarkup(<SavedOffersScreen />)
    expect(html).toContain("saved.empty")
    expect(html).toContain(`href="${routes.marketplace()}"`)
    expect(html).toContain("saved.browse")
    expect(html).not.toContain("saved.hidden")
    expect(html).not.toContain("saved.more")
  })

  it("plein écran : aucune largeur bornée et centrée", () => {
    state.status = "Exhausted"
    expect(renderToStaticMarkup(<SavedOffersScreen />)).not.toMatch(/mx-auto[^"]*max-w-|max-w-[^"]*mx-auto/)
  })
})

describe("CM-09 — la case « Enregistrer » de la carte d'offre", () => {
  it("pose le bouton du membre dans le coin de la photo, et rien sur une carte publique", () => {
    const offer = catalogOfferFixture()
    const member = renderToStaticMarkup(<OfferCard offer={offer} audience="member" locale="fr" t={t} save={<button type="button" data-save-stub="card" />} />)
    expect(member).toMatch(/<div class="absolute right-2 top-2 z-10" data-offer-card-save="true"><button type="button" data-save-stub="card"><\/button><\/div>/)
    const compact = renderToStaticMarkup(<OfferCard offer={offer} audience="member" locale="fr" t={t} compact save={<button type="button" data-save-stub="row" />} />)
    expect(compact).toContain('data-save-stub="row"')
    const anonymous = renderToStaticMarkup(<OfferCard offer={offer} audience="public" locale="fr" t={t} />)
    expect(anonymous).not.toContain("data-offer-card-save")
  })
})
