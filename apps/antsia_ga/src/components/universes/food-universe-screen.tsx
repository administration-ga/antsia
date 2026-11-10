"use client"

import { api } from "@antsia/api/engine"
import { useAuthenticatedConvexQuery } from "@antsia/api/hooks"
import { useNetwork } from "@antsia/api/network"
import { todaysSpecialRef } from "@antsia/social-domain/dailySpecial"
import { Clock } from "lucide-react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { Suspense, useId } from "react"
import { useTranslation } from "react-i18next"

import { OfferQuickAdd } from "@/components/cart/offer-quick-add"
import { SaveOfferButton } from "@/components/shops/save-offer-button"
import { OfferCards, SHOWCASE_GRID } from "@/components/marketplace/marketplace-home"
import { MemberPage } from "@/components/member-chrome"
import { ShopShowcaseCard, type ShowcaseStorefront } from "@/components/marketplace/shop-showcase-card"
import { Button } from "@/components/shared/controls"
import { DailySpecialTile } from "@/components/shops/daily-special"
import { OfferCard } from "@/components/shops/offer-card"
import { OFFER_GRID } from "@/components/shops/offer-grid"
import { useDailySpecialClock } from "@/components/shops/use-daily-special-clock"
import { SHOP_ACTION_CLASS } from "@/components/shops/offer-experience-styles"
import { DEFAULT_FOOD_UNIVERSE_SEARCH, FOOD_CATEGORY_KEYS, foodUniverseSearchFromParams, type FoodUniverseSearch } from "@/lib/food-universe-search"
import { MARKETPLACE_PAGE_SIZE } from "@/lib/marketplace-search"
import { routes } from "@/lib/routes"

const FOOD_CATEGORY_CLASS = "inline-flex min-h-11 w-full min-w-0 items-center justify-center whitespace-nowrap rounded-[var(--ui2-button-radius)] bg-[var(--esp-chip-bg,var(--muted))] px-3 text-sm font-semibold text-foreground hover:brightness-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-[current=page]:bg-[var(--role-commerce-fill,var(--primary-fill))] aria-[current=page]:text-[color:var(--role-commerce-on,var(--primary-fill-on))] min-[640px]:w-auto"

/** Les vitrines de l'univers : celles dont le gabarit d'activité est « Alimentation et restauration ». */
export function foodStorefronts(page: readonly ShowcaseStorefront[]): ShowcaseStorefront[] {
  return page.filter(storefront => storefront.template === "food")
}

/** Les plats du jour annoncés AUJOURD'HUI par les adresses de l'univers, dans l'ordre de leurs cartes. */
export function todaysSpecials(storefronts: readonly ShowcaseStorefront[], now: number): { handle: string; shopName: string; offerRef: string }[] {
  return storefronts.flatMap(storefront => {
    const offerRef = todaysSpecialRef(storefront.dailySpecial, now)
    return offerRef ? [{ handle: storefront.handle, shopName: storefront.name, offerRef }] : []
  })
}

/**
 * Les vitrines de l'univers, lues dans la même fenêtre que l'accueil de la marketplace : l'univers n'existe pour
 * Découvrir que lorsqu'il compte au moins une adresse (aucune tuile vide, ADR-0034).
 */
export function useFoodStorefronts() {
  const { networkId } = useNetwork()
  const query = useAuthenticatedConvexQuery(api.modules.shops.marketplaceShops.search, { networkId, paginationOpts: { cursor: null, numItems: MARKETPLACE_PAGE_SIZE } })
  return { query, storefronts: query.data ? foodStorefronts(query.data.page) : [] }
}

/**
 * L'univers « Alimentation et restauration » (étude des sept univers, § 5.4) : restaurants, traiteurs et épiceries,
 * séparés de la mode. D'abord l'index des produits classés dans PRO.GA, puis les plats du jour (en hauteur, comme
 * des Stories), puis les adresses en grandes cartes avec leurs horaires ; la commande passe par le panier de la boutique et « Demander la
 * préparation », sans paiement en ligne : on règle à la remise. Les offres de la démonstration restent à part, avec
 * leur mention. Monté dans la coque du membre, comme la marketplace.
 */
export function FoodUniverseScreen({ search = DEFAULT_FOOD_UNIVERSE_SEARCH }: { search?: FoodUniverseSearch }) {
  const { networkId, personId } = useNetwork()
  const { t } = useTranslation("marketplace")
  return <MemberPage><Suspense fallback={<p role="status">{t("results.loading")}</p>}><FoodUniverseRoute key={JSON.stringify([networkId, personId])} initialSearch={search} /></Suspense></MemberPage>
}

/** L'URL active pilote aussi les changements de catégorie et les retours d'historique SPA. */
function FoodUniverseRoute({ initialSearch }: { initialSearch: FoodUniverseSearch }) {
  const { t } = useTranslation("marketplace")
  const params = useSearchParams()
  const search = params === null ? initialSearch : foodUniverseSearchFromParams(params)
  if (!search) return <div className="grid min-w-0 justify-items-start gap-3" role="alert"><h1 className="text-2xl font-semibold tracking-tight">{t("food.title")}</h1><p>{t("food.catalog.invalid")}</p><Link href={routes.foodUniverse()} prefetch={false} className={SHOP_ACTION_CLASS}>{t("food.catalog.restart")}</Link></div>
  return <FoodUniverseContent key={JSON.stringify([search.category, search.cursor])} search={search} />
}

function FoodUniverseContent({ search }: { search: FoodUniverseSearch }) {
  const { t } = useTranslation("marketplace")
  const { networkId } = useNetwork()
  const titleId = useId()
  const shopsId = useId()
  const specialsId = useId()
  const { query, storefronts } = useFoodStorefronts()
  const now = useDailySpecialClock(storefronts.map(storefront => storefront.dailySpecial))
  const specials = todaysSpecials(storefronts, now)
  const handles = new Set(storefronts.map(storefront => storefront.handle))
  const demo = useAuthenticatedConvexQuery(api.modules.shops.marketplace.demoSelection, { networkId, kind: "product" })
  const demoOffers = search.category === "food" && !demo.isError && !demo.isPending ? (demo.data ?? []).filter(offer => handles.has(offer.shopHandle)) : []
  return <div className="@container grid w-full min-w-0 gap-8 pb-24 [overflow-wrap:anywhere]" data-universe="food">
    <header className="grid min-w-0 gap-2" aria-labelledby={titleId}>
      <h1 id={titleId} className="text-2xl font-semibold tracking-tight">{t("food.title")}</h1>
      <p className="text-base text-muted-foreground">{t("food.lead")}</p>
      <Link href={routes.marketplaceHome()} prefetch={false} className={`${SHOP_ACTION_CLASS} justify-self-start`}>{t("food.allMarketplace")}</Link>
    </header>
    <FoodCatalog search={search} />
    {/* Une rangée dont aucun plat n'est plus lisible disparaît : pas de titre au-dessus du vide. */}
    {specials.length ? <section aria-labelledby={specialsId} className="grid min-w-0 gap-3 [&:not(:has(li))]:hidden" data-universe-specials>
      <h2 id={specialsId} className="mp-subtitle">{t("food.specials")}</h2>
      <ul className="flex min-w-0 snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">{specials.map(special => <DailySpecialTile key={special.handle} {...special} />)}</ul>
    </section> : null}
    {query.isError ? <div role="alert" className="flex flex-wrap items-center gap-3 text-sm"><p>{t("home.sectionFailed")}</p><Button variant="outline" pending={query.isFetching} onClick={() => { void query.refetch() }}>{t("food.retry")}</Button></div>
      : query.isPending ? <p role="status" className="text-sm text-muted-foreground">{t("results.loading")}</p>
      : storefronts.length === 0 ? <div className="grid justify-items-start gap-3 rounded-[var(--ui2-card-radius)] bg-card p-4"><p role="status" className="text-sm text-muted-foreground">{t("food.empty")}</p><Link href={routes.myShops()} prefetch={false} className={SHOP_ACTION_CLASS}>{t("food.openActivity")}</Link></div>
      : <section aria-labelledby={shopsId} className="grid min-w-0 gap-3" data-universe-shops>
        <h2 id={shopsId} className="mp-subtitle">{t("food.shops")}</h2>
        <ul className={SHOWCASE_GRID}>{storefronts.map((storefront, index) => <li key={storefront.handle} className="grid min-w-0 content-start gap-2"><ShopShowcaseCard storefront={storefront} eager={index < 2} />{storefront.hours ? <p className="flex min-w-0 items-start gap-1.5 px-1 text-sm text-muted-foreground" data-universe-hours><Clock aria-hidden className="mt-0.5 size-4 shrink-0" /><span className="min-w-0"><span className="font-medium text-foreground">{t("shops:food.hours")}</span> · <span className="whitespace-pre-wrap">{storefront.hours}</span></span></p> : null}</li>)}</ul>
      </section>}
    {demoOffers.length ? <section className="grid min-w-0 gap-2" data-universe-demo>
      <p className="text-sm text-muted-foreground">{t("demo.notice")}</p>
      <OfferCards title={t("food.demoOffers")} offers={demoOffers} />
    </section> : null}
  </div>
}

/** Les catégories viennent du contrat publié ; ni le nom du produit ni le gabarit de boutique ne les déduisent. */
function FoodCatalog({ search }: { search: FoodUniverseSearch }) {
  const { networkId } = useNetwork()
  const { t } = useTranslation("marketplace")
  const { t: shopT, i18n } = useTranslation("shops")
  const titleId = useId()
  const query = useAuthenticatedConvexQuery(api.modules.shops.marketplace.search, { networkId, kind: "product", category: [search.category], paginationOpts: { cursor: search.cursor, numItems: MARKETPLACE_PAGE_SIZE } })
  const result = query.data
  return <section aria-labelledby={titleId} className="grid min-w-0 gap-4" data-universe-catalog>
    <div className="grid min-w-0 gap-1"><h2 id={titleId} className="mp-subtitle">{t("food.offers")}</h2><p className="text-sm text-muted-foreground">{t("food.categories.lead")}</p></div>
    <nav aria-label={t("food.categories.label")} className="min-w-0 pb-1" data-universe-categories>
      <ul className="grid min-w-0 grid-cols-2 gap-2 min-[640px]:flex min-[640px]:flex-wrap">{FOOD_CATEGORY_KEYS.map(category => <li key={category} className="min-w-0"><Link href={routes.foodUniverse({ category, cursor: null })} prefetch={false} aria-current={search.category === category ? "page" : undefined} className={FOOD_CATEGORY_CLASS}>{category === "food" ? t("food.categories.all") : shopT(`catalog.facets.categories.${category}.label`)}</Link></li>)}</ul>
    </nav>
    {query.isError ? <div role="alert" className="grid justify-items-start gap-3"><p>{t("food.catalog.failed")}</p><div className="flex min-w-0 flex-wrap gap-3"><Button variant="outline" pending={query.isFetching} onClick={() => { void query.refetch() }}>{t("results.retry")}</Button>{search.cursor ? <Link href={routes.foodUniverse({ ...search, cursor: null })} prefetch={false} className={SHOP_ACTION_CLASS}>{t("results.first")}</Link> : null}</div></div>
      : query.isPending || !result ? <p role="status">{t("results.loading")}</p>
      : result.indexStatus !== "ready" ? <div className="grid justify-items-start gap-3"><p role="status">{t("food.catalog.building")}</p><Button variant="outline" pending={query.isFetching} onClick={() => { void query.refetch() }}>{t("results.retry")}</Button></div>
      : <div className="grid min-w-0 gap-4" aria-busy={query.isFetching || undefined}>
        {query.isFetching ? <p role="status" className="text-sm text-muted-foreground">{t("results.refreshing")}</p> : null}
        {result.page.length ? <ul className={OFFER_GRID}>{result.page.map((offer, index) => <li key={offer.offerRef} className="min-w-0"><OfferCard offer={offer} eager={index === 0} audience="member" locale={i18n.resolvedLanguage ?? "fr"} t={(key, options) => shopT(key, options)} action={<OfferQuickAdd offer={offer} />} save={<SaveOfferButton offer={offer} />} /></li>)}</ul> : <p role="status">{t(result.isDone ? "food.catalog.empty" : "results.window")}</p>}
        {result.filteredWindow ? <p className="text-sm text-muted-foreground">{t("results.filtered")}</p> : null}
        {search.cursor !== null || !result.isDone && result.continueCursor ? <nav aria-label={t("food.catalog.pagination")} className="flex min-w-0 flex-wrap items-center justify-between gap-3">
          {search.cursor ? <Link href={routes.foodUniverse({ ...search, cursor: null })} prefetch={false} className={SHOP_ACTION_CLASS}>{t("results.first")}</Link> : <span />}
          {!result.isDone && result.continueCursor ? <Link href={routes.foodUniverse({ ...search, cursor: result.continueCursor })} prefetch={false} className={SHOP_ACTION_CLASS}>{t("results.next")}</Link> : null}
        </nav> : null}
      </div>}
  </section>
}
