"use client"

import { api } from "@antsia/api/engine"
import { useAuthenticatedConvexQuery } from "@antsia/api/hooks"
import { useNetwork } from "@antsia/api/network"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { Suspense, useId, useRef } from "react"
import { useTranslation } from "react-i18next"

import { OfferQuickAdd } from "@/components/cart/offer-quick-add"
import { MemberPage } from "@/components/member-chrome"
import { Button } from "@/components/shared/controls"
import { OfferCard } from "@/components/shops/offer-card"
import { SHOP_ACTION_CLASS } from "@/components/shops/offer-experience-styles"
import { OFFER_GRID } from "@/components/shops/offer-grid"
import { MARKETPLACE_FACETS, MARKETPLACE_PAGE_SIZE, marketplaceSearchFromParams, type MarketplaceSearch } from "@/lib/marketplace-search"
import { routes } from "@/lib/routes"
import { activeMarketplacePill, MarketplaceBackToTop, MarketplaceFilterSheet, MarketplaceHeader, MarketplacePills } from "./marketplace-chrome"
import { MarketplaceHome, SHOWCASE_GRID } from "./marketplace-home"
import { ShopShowcaseCard } from "./shop-showcase-card"


/**
 * `/marketplace` sans paramètre : l'accueil (boutiques en grandes cartes et moments qui défilent). Avec une
 * recherche, une vue ou un rayon : les résultats, en grille, avec les mêmes en-tête, rayons et filtres.
 */
export function MarketplaceScreen({ search, home = false }: { search: MarketplaceSearch | null; home?: boolean }) {
  const { networkId, personId } = useNetwork()
  const { t } = useTranslation("marketplace")
  return <MemberPage><Suspense fallback={<p role="status">{t("results.loading")}</p>}><MarketplaceContent key={JSON.stringify([networkId, personId])} search={search} home={home} /></Suspense></MemberPage>
}

/** L'URL courante pilote aussi les transitions SPA, sans attendre un nouveau snapshot serveur. */
function MarketplaceContent({ search: initialSearch, home: initialHome }: { search: MarketplaceSearch | null; home: boolean }) {
  const params = useSearchParams()
  const home = params === null ? initialHome : [...params.keys()].length === 0
  if (home) return <MarketplaceHome />
  return <MarketplaceResults search={params === null ? initialSearch : marketplaceSearchFromParams(params)} />
}

function appliedCount(search: MarketplaceSearch): number {
  const facets = MARKETPLACE_FACETS.reduce((sum, facet) => sum + (search[facet]?.length ?? 0), 0)
  const ranges = (["minPrice", "maxPrice", "minDurationMinutes", "maxDurationMinutes"] as const).filter(field => search[field] !== undefined).length
  return facets + ranges + (search.sort && search.sort !== "relevance" && search.sort !== "newest" ? 1 : 0)
}

function MarketplaceResults({ search }: { search: MarketplaceSearch | null }) {
  const { t } = useTranslation("marketplace")
  const { networkId, personId } = useNetwork()
  const heading = useRef<HTMLHeadingElement>(null)
  const router = useRouter()
  const navigate = (next: MarketplaceSearch) => router.push(routes.marketplace(next), { scroll: false })
  const apply = (next: MarketplaceSearch) => { navigate(next); heading.current?.focus() }
  return <div className="@container grid w-full min-w-0 gap-6 pb-24 [overflow-wrap:anywhere]" data-marketplace>
    <div className="grid min-w-0 gap-4">
      <MarketplaceHeader ref={heading} query={search?.query} />
      {search ? <div className="flex min-w-0 items-center gap-3"><div className="min-w-0 flex-1"><MarketplacePills active={activeMarketplacePill(search)} query={search.query} /></div><MarketplaceFilterSheet key={JSON.stringify(search)} search={search} count={appliedCount(search)} onApply={navigate} onApplied={() => heading.current?.focus()} /></div> : null}
    </div>
    {search ? <section className="grid min-w-0 gap-6" aria-label={t("results.title")}>
      <AppliedFilters search={search} onApply={apply} />
      <MarketplaceWindow key={JSON.stringify(["catalog", networkId, personId, search])} search={search} />
      {search.view !== "shops" ? <DemoSelection key={JSON.stringify(["demo", networkId, personId, { ...search, cursor: null }])} search={search} /> : null}
    </section> : <div role="alert" className="grid gap-3"><p>{t("results.invalid")}</p><Link href={routes.marketplaceHome()} prefetch={false} className={`${SHOP_ACTION_CLASS} justify-self-start`}>{t("results.restart")}</Link></div>}
    <MarketplaceBackToTop />
  </div>
}

function AppliedFilters({ search, onApply }: { search: MarketplaceSearch; onApply: (search: MarketplaceSearch) => void }) {
  const { t } = useTranslation("marketplace")
  const { t: shopT } = useTranslation("shops")
  const chips: { key: string; label: string; remove: () => void }[] = []
  if (search.query) chips.push({ key: "query", label: search.query, remove: () => onApply({ ...search, query: undefined, sort: search.sort === "relevance" ? undefined : search.sort, cursor: null }) })
  for (const facet of MARKETPLACE_FACETS) for (const value of search[facet] ?? []) {
    const label = facet === "category" ? shopT(`catalog.facets.categories.${value}.label`) : facet === "audience" || facet === "serviceMode" ? shopT(`catalog.facets.choices.${facet}.${value}`) : facet === "commercialMode" ? t(`commercialModes.${value}`) : value
    chips.push({ key: `${facet}:${value}`, label, remove: () => onApply({ ...search, [facet]: search[facet]?.filter(current => current !== value), cursor: null }) })
  }
  for (const field of ["minPrice", "maxPrice", "minDurationMinutes", "maxDurationMinutes"] as const) if (search[field] !== undefined) chips.push({ key: field, label: `${t(`filters.${field}`)} : ${search[field]}`, remove: () => onApply({ ...search, [field]: undefined, cursor: null }) })
  if (!chips.length) return null
  return <ul aria-label={t("filters.active")} className="flex min-w-0 flex-wrap gap-2">{chips.map(chip => <li key={chip.key} className="min-w-0"><button type="button" className="inline-flex min-h-11 max-w-full items-center gap-2 rounded-[var(--ui2-button-radius)] bg-[var(--esp-chip-bg,var(--muted))] px-4 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={t("filters.remove", { value: chip.label })} onClick={chip.remove}><span className="break-words">{chip.label}</span><span aria-hidden>×</span></button></li>)}</ul>
}

function QueryFailure({ retry, pending }: { retry: () => void; pending: boolean }) {
  const { t } = useTranslation("marketplace")
  return <div role="alert" className="grid min-w-0 gap-3"><p>{t("results.failed")}</p><Button variant="outline" className="justify-self-start" pending={pending} onClick={retry}>{t("results.retry")}</Button></div>
}

function MarketplaceWindow({ search }: { search: MarketplaceSearch }) {
  return search.view === "shops" ? <ShopWindow search={search} /> : <OfferWindow search={search} />
}

function offerFilters(search: MarketplaceSearch) {
  return {
    kind: search.view === "services" ? "service" as const : "product" as const,
    ...(search.query !== undefined ? { query: search.query } : {}),
    ...(search.category !== undefined ? { category: search.category } : {}),
    ...(search.brand !== undefined ? { brand: search.brand } : {}),
    ...(search.material !== undefined ? { material: search.material } : {}),
    ...(search.color !== undefined ? { color: search.color } : {}),
    ...(search.audience !== undefined ? { audience: search.audience } : {}),
    ...(search.serviceMode !== undefined ? { serviceMode: search.serviceMode } : {}),
    ...(search.commercialMode !== undefined ? { commercialMode: search.commercialMode } : {}),
    ...(search.languageCode !== undefined ? { languageCode: search.languageCode } : {}),
    ...(search.serviceZone !== undefined ? { serviceZone: search.serviceZone } : {}),
    ...(search.minDurationMinutes !== undefined ? { minDurationMinutes: search.minDurationMinutes } : {}),
    ...(search.maxDurationMinutes !== undefined ? { maxDurationMinutes: search.maxDurationMinutes } : {}),
    ...(search.minPrice !== undefined ? { minPrice: search.minPrice } : {}),
    ...(search.maxPrice !== undefined ? { maxPrice: search.maxPrice } : {}),
    ...(search.sort !== undefined ? { sort: search.sort } : {}),
  }
}

function OfferWindow({ search }: { search: MarketplaceSearch }) {
  const { networkId } = useNetwork()
  const { t } = useTranslation("marketplace")
  const { t: shopT, i18n } = useTranslation("shops")
  const query = useAuthenticatedConvexQuery(api.modules.shops.marketplace.search, { networkId, ...offerFilters(search), paginationOpts: { cursor: search.cursor, numItems: MARKETPLACE_PAGE_SIZE } })
  if (query.isError) return <QueryFailure pending={query.isFetching} retry={() => { void query.refetch() }} />
  if (query.isPending || !query.data) return <p role="status">{t("results.loading")}</p>
  const result = query.data
  if (result.indexStatus !== "ready") return <div className="grid gap-3"><p role="status">{t("results.building")}</p><Button variant="outline" className="justify-self-start" pending={query.isFetching} onClick={() => { void query.refetch() }}>{t("results.retry")}</Button></div>
  return <div className="grid min-w-0 gap-4" aria-busy={query.isFetching || undefined}>
    {query.isFetching ? <p role="status" className="text-sm text-muted-foreground">{t("results.refreshing")}</p> : null}
    {result.page.length ? <ul className={OFFER_GRID}>{result.page.map((offer, index) => <li key={offer.offerRef} className="min-w-0"><OfferCard offer={offer} eager={index === 0} audience="member" locale={i18n.resolvedLanguage ?? "fr"} t={(key, options) => shopT(key, options)} action={<OfferQuickAdd offer={offer} />} /></li>)}</ul> : <p role="status">{t(result.isDone ? "results.empty" : "results.window")}</p>}
    {result.filteredWindow ? <p className="text-sm text-muted-foreground">{t("results.filtered")}</p> : null}
    <MarketplacePagination search={search} isDone={result.isDone} cursor={result.continueCursor} />
  </div>
}

function ShopWindow({ search }: { search: MarketplaceSearch }) {
  const { networkId } = useNetwork()
  const { t } = useTranslation("marketplace")
  const query = useAuthenticatedConvexQuery(api.modules.shops.marketplaceShops.search, { networkId, ...(search.query ? { query: search.query } : {}), paginationOpts: { cursor: search.cursor, numItems: MARKETPLACE_PAGE_SIZE } })
  if (query.isError) return <QueryFailure pending={query.isFetching} retry={() => { void query.refetch() }} />
  if (query.isPending || !query.data) return <p role="status">{t("results.loading")}</p>
  const result = query.data
  return <div className="grid min-w-0 gap-4" aria-busy={query.isFetching || undefined}>
    {query.isFetching ? <p role="status" className="text-sm text-muted-foreground">{t("results.refreshing")}</p> : null}
    {result.page.length ? <ul className={SHOWCASE_GRID}>{result.page.map((storefront, index) => <li key={storefront.handle} className="min-w-0"><ShopShowcaseCard storefront={storefront} eager={index < 2} /></li>)}</ul> : <p role="status">{t(result.isDone ? "results.empty" : "results.window")}</p>}
    {result.filteredWindow ? <p className="text-sm text-muted-foreground">{t("results.filtered")}</p> : null}
    <MarketplacePagination search={search} isDone={result.isDone} cursor={result.continueCursor} />
  </div>
}

function MarketplacePagination({ search, isDone, cursor }: { search: MarketplaceSearch; isDone: boolean; cursor: string }) {
  const { t } = useTranslation("marketplace")
  if (search.cursor === null && (isDone || !cursor)) return null
  return <nav aria-label={t("results.pagination")} className="flex min-w-0 flex-wrap items-center justify-between gap-3">{search.cursor ? <Link href={routes.marketplace({ ...search, cursor: null })} prefetch={false} className={SHOP_ACTION_CLASS}>{t("results.first")}</Link> : <span />}{!isDone && cursor ? <Link href={routes.marketplace({ ...search, cursor })} prefetch={false} className={SHOP_ACTION_CLASS}>{t("results.next")}</Link> : null}</nav>
}

function DemoSelection({ search }: { search: MarketplaceSearch }) {
  const { networkId } = useNetwork()
  const { t } = useTranslation("marketplace")
  const { t: shopT, i18n } = useTranslation("shops")
  const id = useId()
  const query = useAuthenticatedConvexQuery(api.modules.shops.marketplace.demoSelection, { networkId, ...offerFilters(search) })
  if (!query.isError && !query.isPending && query.data?.length === 0) return null
  return <section aria-labelledby={id} className="grid min-w-0 gap-4 pt-2" data-marketplace-demo><div className="grid min-w-0 gap-1"><h2 id={id} className="mp-subtitle">{t("demo.title")}</h2><p className="text-sm text-muted-foreground">{t("demo.notice")}</p></div>{query.isError ? <p role="status">{t("demo.unavailable")}</p> : query.isPending || !query.data ? <p role="status">{t("demo.loading")}</p> : <ul className={OFFER_GRID}>{query.data.map((offer, index) => <li key={offer.offerRef} className="min-w-0"><OfferCard offer={offer} eager={index === 0} audience="member" locale={i18n.resolvedLanguage ?? "fr"} t={(key, options) => shopT(key, options)} action={<OfferQuickAdd offer={offer} />} /></li>)}</ul>}</section>
}
