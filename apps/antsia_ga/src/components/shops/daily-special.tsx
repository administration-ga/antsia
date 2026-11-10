"use client"

import { api } from "@antsia/api/engine"
import { useAuthenticatedConvexQuery } from "@antsia/api/hooks"
import { useNetwork } from "@antsia/api/network"
import { UtensilsCrossed } from "lucide-react"
import Link from "next/link"
import { useId } from "react"
import { useTranslation } from "react-i18next"

import { routes } from "@/lib/routes"
import { catalogPrice, type CatalogOffer, type CatalogTranslate } from "./catalog-model"
import { OfferMedia } from "./offer-media"
import { ShopLink } from "./shop-ui"

export { useTodaysSpecialRef } from "./use-daily-special-clock"

/**
 * Le PLAT DU JOUR d'une adresse « Alimentation et restauration » (SU06, étude des sept univers, § 5.4) : une offre
 * du menu désignée par l'adresse pour aujourd'hui. Son geste est « Commander » : la fiche du plat, puis le panier
 * et « Demander la préparation », réglée à la remise. L'offre est relue comme le membre la lit : retirée ou
 * illisible, elle ne laisse rien à l'écran.
 */

function useDailySpecialOffer(handle: string, offerRef: string): CatalogOffer | null {
  const { networkId } = useNetwork()
  const query = useAuthenticatedConvexQuery(api.modules.shops.catalog.offer, { networkId, handle, offerRef })
  const offer = query.isError ? null : query.data ?? null
  return offer?.kind === "product" ? offer : null
}

/**
 * Sur la vitrine : le plat, sa photo sur les deux tiers dès 480 px de carte (en 2:1 dès 720 px, pour que la carte
 * reste une bannière au bureau), son prix et « Commander ».
 */
export function DailySpecialCard({ handle, offerRef }: { handle: string; offerRef: string }) {
  const { t, i18n } = useTranslation("shops")
  const translate: CatalogTranslate = (key, options) => t(key, options)
  const id = useId()
  const offer = useDailySpecialOffer(handle, offerRef)
  if (!offer) return null
  const href = routes.shopOffer(handle, offer.offerRef)
  return <section aria-labelledby={id} data-daily-special className="@container grid min-w-0 gap-3 rounded-[var(--ui2-card-radius)] bg-card p-3 text-card-foreground [overflow-wrap:anywhere]">
    <h2 id={id} className="mp-subtitle flex items-center gap-2"><UtensilsCrossed aria-hidden className="size-5 shrink-0" />{t("food.todaysSpecial")}</h2>
    <div className="grid min-w-0 items-center gap-3 @[480px]:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <Link href={href} prefetch={false} aria-label={t("catalog.openOfferNamed", { title: offer.title })} className="block rounded-[var(--esp-media-radius)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <OfferMedia media={offer.media[0]} title={offer.title} t={translate} eager className="aspect-[4/3] bg-muted @[720px]:aspect-[2/1]" />
      </Link>
      <div className="grid min-w-0 content-center gap-2">
        <p className="text-lg font-semibold leading-snug">{offer.title}</p>
        <p className="text-lg font-bold text-[color:var(--role-commerce-ink,var(--foreground))]">{catalogPrice(offer.price, i18n.resolvedLanguage ?? "fr", translate)}</p>
        {offer.description ? <p className="line-clamp-3 text-sm text-muted-foreground">{offer.description}</p> : null}
        <ShopLink variant="commerce" href={href}>{t("postFormula.actions.orderProduct")}</ShopLink>
      </div>
    </div>
  </section>
}

/**
 * Dans l'univers : une tuile de la rangée « Plats du jour », en hauteur comme une Story — la photo du plat,
 * l'adresse, le prix et « Commander ». Rien quand l'offre n'est plus lisible (aucune case vide dans la rangée).
 */
export function DailySpecialTile({ handle, shopName, offerRef }: { handle: string; shopName: string; offerRef: string }) {
  const { t, i18n } = useTranslation("shops")
  const translate: CatalogTranslate = (key, options) => t(key, options)
  const offer = useDailySpecialOffer(handle, offerRef)
  if (!offer) return null
  const href = routes.shopOffer(handle, offer.offerRef)
  return <li className="w-[min(15rem,72vw)] shrink-0 snap-start" data-daily-special-tile>
    <article className="flex h-full min-w-0 flex-col gap-2 rounded-[var(--ui2-card-radius)] bg-card p-2 pb-3 text-card-foreground [overflow-wrap:anywhere]">
      <Link href={href} prefetch={false} aria-label={t("catalog.openOfferNamed", { title: offer.title })} className="block rounded-[var(--esp-media-radius)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <OfferMedia media={offer.media[0]} title={offer.title} t={translate} className="aspect-[4/5] bg-muted" />
      </Link>
      <div className="grid min-w-0 flex-1 content-start gap-1 px-2">
        <Link href={routes.storefront(handle)} prefetch={false} className="inline-flex min-h-11 min-w-0 max-w-full items-center justify-self-start truncate rounded text-xs font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{shopName}</Link>
        <h3 className="line-clamp-2 text-sm font-semibold leading-snug">{offer.title}</h3>
        <p className="break-words text-base font-bold text-[color:var(--role-commerce-ink,var(--foreground))]">{catalogPrice(offer.price, i18n.resolvedLanguage ?? "fr", translate)}</p>
      </div>
      <div className="grid px-2"><ShopLink variant="commerce" href={href}>{t("postFormula.actions.orderProduct")}</ShopLink></div>
    </article>
  </li>
}
