"use client"

import { api } from "@antsia/api/engine"
import { useAuthenticatedConvexQuery } from "@antsia/api/hooks"
import { useNetwork } from "@antsia/api/network"
import { ProfilPagePage, type PageCommerce } from "@antsia/social-features/reseau-personnel"
import { useId } from "react"
import { useTranslation } from "react-i18next"
import { OfferQuickAdd } from "@/components/cart/offer-quick-add"
import { CenteredStatus } from "@/components/shared/controls"
import { Rail } from "@/components/shared/rail"
import { CATALOG_PAGE_SIZE } from "@/lib/catalog-search"
import { routes } from "@/lib/routes"
import type { CatalogOffer } from "./catalog-model"
import { StorefrontBody, StorefrontHero } from "./member-storefront-screen"
import { OfferCard } from "./offer-card"
import type { StorefrontData } from "./shop-model"
import { ShopLink } from "./shop-ui"

/** Jusqu'à ce nombre d'offres, « Nos produits » les montre en grandes cartes ; au-delà, elles défilent. */
const PAGE_PRODUCTS_LARGE_MAX = 3

/**
 * La fiche d'une page du réseau, et de sa boutique si elle en a une (décision du propriétaire du 22/10/2026,
 * « selon la nature ») :
 *  - une entreprise : la page se présente comme sa boutique (son en-tête, sa vitrine), ses publications à la suite ;
 *  - une association, un média, une communauté (ou toute autre nature) : l'identité de la page, ses produits en
 *    tête, puis ses publications, avec d'autres produits toutes les trois publications au-delà de trois offres ;
 *  - une page sans boutique : la fiche d'une page, inchangée.
 * Les gestes de la page (gérer, revendiquer, publier, son mur) restent ceux du moteur.
 */
export function PageWithCommerce({ handle }: { handle: string }) {
  const { networkId } = useNetwork()
  const { t } = useTranslation("shops")
  const page = useAuthenticatedConvexQuery(api.modules.pages.pages.getPage, { networkId, handle })
  const storefront = useAuthenticatedConvexQuery(api.modules.shops.shops.storefront, { networkId, handle })
  // Tant qu'on ne sait pas si la page vend, on attend : la fiche ne change pas de visage sous les yeux.
  if (!storefront.isError && storefront.data === undefined) return <CenteredStatus label={t("common.loading")} />
  const shop = storefront.isError ? null : storefront.data ?? null
  const ownerKind = page.isError ? null : page.data?.ownerKind ?? null
  if (!shop || ownerKind === null) return <ProfilPagePage handle={handle} />
  if (ownerKind === "company") return <ProfilPagePage handle={handle} commerce={{ presentation: "shop", hero: <StorefrontHero shop={shop} />, lead: <div className="grid min-w-0 gap-8"><StorefrontBody shop={shop} publications={false} /></div> }} />
  return <ProductsFirstPage handle={handle} shop={shop} />
}

/** Une page qui vend sans être une entreprise : ses offres en tête, puis d'autres entre ses publications. */
function ProductsFirstPage({ handle, shop }: { handle: string; shop: StorefrontData }) {
  const { networkId } = useNetwork()
  const query = useAuthenticatedConvexQuery(api.modules.shops.catalog.list, { networkId, handle, paginationOpts: { cursor: null, numItems: CATALOG_PAGE_SIZE } })
  const offers = !query.isError && query.data ? query.data.page : []
  const commerce: PageCommerce = {
    presentation: "products",
    lead: <PageOffers shop={shop} offers={offers} />,
    ...(offers.length > PAGE_PRODUCTS_LARGE_MAX ? { interleave: (rank: number) => <PageOffersRail shop={shop} offers={rotated(offers, rank)} /> } : {}),
  }
  return <ProfilPagePage handle={handle} commerce={commerce} />
}

/** Chaque rappel entre les publications commence plus loin dans le catalogue : jamais deux fois le même début. */
function rotated(offers: readonly CatalogOffer[], rank: number): CatalogOffer[] {
  const start = (rank * PAGE_PRODUCTS_LARGE_MAX) % offers.length
  return [...offers.slice(start), ...offers.slice(0, start)]
}

/** Une offre sur la fiche de la page : sa carte, avec l'ajout direct ; le vendeur (la page) ne se répète pas. */
function PageOfferCard({ offer, eager }: { offer: CatalogOffer; eager: boolean }) {
  const { t, i18n } = useTranslation("shops")
  return <OfferCard offer={offer} audience="member" locale={i18n.resolvedLanguage ?? "fr"} t={(key, options) => t(key, options)} eager={eager} seller={false} action={<OfferQuickAdd offer={offer} />} />
}

/**
 * « Nos produits » (« Nos offres » si la boutique propose aussi des prestations) : jusqu'à trois offres en grandes
 * cartes avec l'ajout direct ; au-delà, elles défilent. Toujours le chemin de la boutique entière.
 */
function PageOffers({ shop, offers }: { shop: StorefrontData; offers: readonly CatalogOffer[] }) {
  const { t } = useTranslation("shops")
  const titleId = useId()
  if (!offers.length) return null
  const title = t(offers.every(offer => offer.kind === "product") ? "pageShop.products" : "pageShop.offers")
  if (offers.length > PAGE_PRODUCTS_LARGE_MAX) return <Rail size="product" title={title} href={routes.storefront(shop.handle)} linkLabel={t("pageShop.seeShop")}>{offers.map((offer, index) => <PageOfferCard key={offer.offerRef} offer={offer} eager={index === 0} />)}</Rail>
  return <section aria-labelledby={titleId} className="@container grid min-w-0 gap-3" data-page-offers>
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-3"><h2 id={titleId} className="mp-subtitle">{title}</h2><ShopLink href={routes.storefront(shop.handle)}>{t("pageShop.seeShop")}</ShopLink></div>
    <ul className="grid min-w-0 grid-cols-1 gap-3 min-[768px]:gap-gutter @min-[36rem]:grid-cols-2 @min-[54rem]:grid-cols-3">{offers.map((offer, index) => <li key={offer.offerRef} className="min-w-0"><PageOfferCard offer={offer} eager={index === 0} /></li>)}</ul>
  </section>
}

/** Entre les publications : d'autres offres de la boutique, qui défilent (titre de niveau 3, sous « Publications »). */
function PageOffersRail({ shop, offers }: { shop: StorefrontData; offers: readonly CatalogOffer[] }) {
  const { t } = useTranslation("shops")
  return <Rail size="product" level={3} title={t("pageShop.inShop")} href={routes.storefront(shop.handle)} linkLabel={t("pageShop.seeShop")}>{offers.map((offer, index) => <PageOfferCard key={offer.offerRef} offer={offer} eager={index === 0} />)}</Rail>
}
