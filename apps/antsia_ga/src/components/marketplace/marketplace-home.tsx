"use client"

import { api } from "@antsia/api/engine"
import { useAuthenticatedConvexQuery } from "@antsia/api/hooks"
import { useNetwork } from "@antsia/api/network"
import type { CatalogOffer } from "@convex/modules/shops/catalogValidators"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useId, useRef } from "react"
import { useTranslation } from "react-i18next"

import { OfferQuickAdd } from "@/components/cart/offer-quick-add"
import { Button } from "@/components/shared/controls"
import { Rail } from "@/components/shared/rail"
import { OfferCard } from "@/components/shops/offer-card"
import { SHOP_ACTION_CLASS } from "@/components/shops/offer-experience-styles"
import { MARKETPLACE_PAGE_SIZE, type MarketplaceSearch } from "@/lib/marketplace-search"
import { routes } from "@/lib/routes"
import { MarketplaceBackToTop, MarketplaceFilterSheet, MarketplaceHeader, MarketplacePills } from "./marketplace-chrome"
import { ShopShowcaseCard, type ShowcaseStorefront } from "./shop-showcase-card"

/**
 * Les grandes cartes de boutiques : une par ligne au téléphone, deux, puis trois, puis quatre selon la colonne ;
 * l'écart vaut la marge de la page (12 px au téléphone, la gouttière dès 768 px).
 */
export const SHOWCASE_GRID = "grid min-w-0 grid-cols-1 gap-3 min-[768px]:gap-gutter @min-[36rem]:grid-cols-2 @min-[54rem]:grid-cols-3 @min-[76rem]:grid-cols-4"
const HOME_FILTERS: MarketplaceSearch = { view: "products", cursor: null }

/**
 * L'accueil de la marketplace (modèle des ventes privées, décision du propriétaire du 22/10/2026). Toutes les
 * sections viennent du moteur, sans mise en avant inventée :
 * - « Boutiques » : les vitrines de produits les plus récemment publiées, en grandes cartes ;
 * - « Nouveautés » et « Services » : les offres les plus récentes, en carrousel ;
 * - « Prestataires » : les vitrines de services sur devis, en carrousel de grandes cartes ;
 * - la sélection de démonstration, quand le moteur la sert, avec sa mention.
 * Une section vide disparaît ; une section en panne se relit seule.
 */
export function MarketplaceHome() {
  const { t } = useTranslation("marketplace")
  const router = useRouter()
  const heading = useRef<HTMLHeadingElement>(null)
  return <div className="@container grid w-full min-w-0 gap-8 pb-24 [overflow-wrap:anywhere]" data-marketplace data-marketplace-home>
    <div className="grid min-w-0 gap-4">
      <MarketplaceHeader ref={heading} />
      <div className="flex min-w-0 items-center gap-3"><div className="min-w-0 flex-1"><MarketplacePills active="welcome" /></div><MarketplaceFilterSheet search={HOME_FILTERS} count={0} onApply={next => router.push(routes.marketplace(next))} /></div>
    </div>
    <ShopSections />
    <OfferRail kind="product" title={t("home.sections.newOffers")} href={routes.marketplace({ view: "products" })} />
    <OfferRail kind="service" title={t("home.sections.services")} href={routes.marketplace({ view: "services" })} />
    <DemoSections />
    <p className="flex min-w-0 flex-wrap items-center gap-3 text-sm text-muted-foreground"><span>{t("home.sellerLead")}</span><Link href={routes.myShops()} prefetch={false} className={SHOP_ACTION_CLASS}>{t("manageActivity")}</Link></p>
    <MarketplaceBackToTop />
  </div>
}

function SectionFailure({ title, retry, pending }: { title: string; retry: () => void; pending: boolean }) {
  const { t } = useTranslation("marketplace")
  return <section aria-label={title} className="grid min-w-0 gap-2"><h2 className="mp-subtitle">{title}</h2><div role="alert" className="flex flex-wrap items-center gap-3 text-sm"><p>{t("home.sectionFailed")}</p><Button variant="outline" pending={pending} onClick={retry}>{t("results.retry")}</Button></div></section>
}

/** Les vitrines les plus récentes du réseau, réparties par modèle : boutiques empilées, prestataires qui défilent. */
function ShopSections() {
  const { t } = useTranslation("marketplace")
  const { networkId } = useNetwork()
  const id = useId()
  const query = useAuthenticatedConvexQuery(api.modules.shops.marketplaceShops.search, { networkId, paginationOpts: { cursor: null, numItems: MARKETPLACE_PAGE_SIZE } })
  if (query.isError) return <SectionFailure title={t("home.sections.shops")} pending={query.isFetching} retry={() => { void query.refetch() }} />
  if (query.isPending || !query.data) return <p role="status" className="text-sm text-muted-foreground">{t("results.loading")}</p>
  const shops: ShowcaseStorefront[] = query.data.page.filter(storefront => storefront.model === "products")
  const providers: ShowcaseStorefront[] = query.data.page.filter(storefront => storefront.model === "quote_services")
  if (!shops.length && !providers.length) return <p role="status" className="rounded-[var(--ui2-card-radius)] bg-card p-4 text-sm text-muted-foreground">{t("home.noShops")}</p>
  return <>
    {shops.length ? <section aria-labelledby={id} className="grid min-w-0 gap-3" data-marketplace-shops>
      <div className="flex min-w-0 items-center justify-between gap-3"><h2 id={id} className="mp-subtitle">{t("home.sections.shops")}</h2><Link href={routes.marketplace({ view: "shops" })} prefetch={false} className="inline-flex min-h-11 shrink-0 items-center rounded-[var(--ui2-button-radius)] px-3 text-sm font-semibold text-[color:var(--role-commerce-ink,var(--primary))] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{t("home.seeAll")}</Link></div>
      <ul className={SHOWCASE_GRID}>{shops.map((storefront, index) => <li key={storefront.handle} className="min-w-0"><ShopShowcaseCard storefront={storefront} eager={index < 2} /></li>)}</ul>
    </section> : null}
    <Rail size="card" title={t("home.sections.providers")} href={routes.marketplace({ view: "shops" })} linkLabel={t("home.seeAll")}>{providers.map(storefront => <ShopShowcaseCard key={storefront.handle} storefront={storefront} />)}</Rail>
  </>
}

/** Les offres les plus récentes d'un genre ; rien tant que l'index n'est pas prêt ou si la fenêtre est vide. */
function OfferRail({ kind, title, href }: { kind: CatalogOffer["kind"]; title: string; href: string }) {
  const { t } = useTranslation("marketplace")
  const { networkId } = useNetwork()
  const query = useAuthenticatedConvexQuery(api.modules.shops.marketplace.search, { networkId, kind, paginationOpts: { cursor: null, numItems: MARKETPLACE_PAGE_SIZE } })
  if (query.isError) return <SectionFailure title={title} pending={query.isFetching} retry={() => { void query.refetch() }} />
  if (query.isPending || !query.data || query.data.indexStatus !== "ready" || !query.data.page.length) return null
  return <OfferCards title={title} href={href} linkLabel={t("home.seeAll")} offers={query.data.page} />
}

export function OfferCards({ title, href, linkLabel, offers, level }: { title: string; href?: string; linkLabel?: string; offers: CatalogOffer[]; level?: 2 | 3 }) {
  const { t: shopT, i18n } = useTranslation("shops")
  return <Rail size="product" title={title} href={href} linkLabel={linkLabel} level={level}>{offers.map((offer, index) => <OfferCard key={offer.offerRef} offer={offer} audience="member" locale={i18n.resolvedLanguage ?? "fr"} t={(key, options) => shopT(key, options)} eager={index === 0} action={<OfferQuickAdd offer={offer} />} />)}</Rail>
}

/** La sélection fictive de la démonstration : à part, avec sa mention, jamais confondue avec le catalogue. */
function DemoSections() {
  const { t } = useTranslation("marketplace")
  const { networkId } = useNetwork()
  const id = useId()
  const products = useAuthenticatedConvexQuery(api.modules.shops.marketplace.demoSelection, { networkId, kind: "product" })
  const services = useAuthenticatedConvexQuery(api.modules.shops.marketplace.demoSelection, { networkId, kind: "service" })
  const productOffers = !products.isError ? products.data ?? [] : []
  const serviceOffers = !services.isError ? services.data ?? [] : []
  if (!productOffers.length && !serviceOffers.length) return null
  return <section aria-labelledby={id} className="grid min-w-0 gap-4" data-marketplace-demo>
    <div className="grid min-w-0 gap-1"><h2 id={id} className="mp-subtitle">{t("demo.title")}</h2><p className="text-sm text-muted-foreground">{t("demo.notice")}</p></div>
    {productOffers.length ? <OfferCards title={t("home.sections.demoProducts")} offers={productOffers} level={3} /> : null}
    {serviceOffers.length ? <OfferCards title={t("home.sections.demoServices")} offers={serviceOffers} level={3} /> : null}
  </section>
}
