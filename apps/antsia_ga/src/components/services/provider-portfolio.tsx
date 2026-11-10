import Link from "next/link"

import type { CatalogAudience, CatalogOffer, CatalogTranslate } from "@/components/shops/catalog-model"
import { OfferMedia } from "@/components/shops/offer-card"
import { SHOP_ACTION_CLASS } from "@/components/shops/offer-experience-styles"
import { routes } from "@/lib/routes"
import { serviceProfileOf } from "./service-profile-details"

/** Pas de regroupement de médias entre offres : chaque indice garde son manifeste. */
export function providerPortfolio(offers: readonly CatalogOffer[], handle: string) {
  return offers.filter(offer => offer.shopHandle === handle && offer.kind === "service").flatMap(offer => (serviceProfileOf(offer)?.portfolio ?? []).map((entry, index) => ({ offer, entry, key: `${offer.offerRef}:${index}` })))
}

export function ProviderPortfolio({ offers, handle, audience, t }: { offers: readonly CatalogOffer[]; handle: string; audience: CatalogAudience; t: CatalogTranslate }) {
  const entries = providerPortfolio(offers, handle)
  const mediaT: CatalogTranslate = key => t(key === "catalog.mediaWithheld" ? "portfolio.mediaWithheld" : "portfolio.noMedia")
  return <div className="grid min-w-0 gap-4" data-provider-portfolio>
    <p className="text-sm text-muted-foreground">{t("portfolio.notice")}</p>
    {entries.length ? <ul className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-3">{entries.map(({ offer, entry, key }) => <li key={key} className="grid min-w-0 content-start gap-3 rounded-[var(--ui2-card-radius)] border border-border bg-card p-4">
      <h3 className="break-words font-semibold">{entry.title}</h3>
      {entry.description ? <p className="whitespace-pre-wrap break-words text-sm">{entry.description}</p> : null}
      {entry.mediaIndexes.length ? <ul aria-label={t("portfolio.media")} className="grid min-w-0 gap-2">{entry.mediaIndexes.map(index => <li key={index}><OfferMedia media={offer.media[index]} title={entry.title} t={mediaT} className="aspect-[4/3]" /></li>)}</ul> : <p className="text-sm text-muted-foreground">{t("portfolio.noMedia")}</p>}
      <Link className={`${SHOP_ACTION_CLASS} justify-self-start`} prefetch={false} href={audience === "public" ? routes.publicProviderOffer(handle, offer.offerRef) : routes.providerOffer(handle, offer.offerRef)}>{t("portfolio.fromOffer", { title: offer.title })}</Link>
    </li>)}</ul> : <p role="status" className="rounded-[var(--ui2-card-radius)] border border-dashed border-border p-4 text-sm text-muted-foreground">{t("portfolio.empty")}</p>}
  </div>
}
