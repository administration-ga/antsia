import Link from "next/link"
import type { ReactNode } from "react"

import type { CatalogFilters } from "@/lib/catalog-search"
import { routes } from "@/lib/routes"
import { buttonClassName } from "@/components/shared/button-class"
import type { CatalogAudience, CatalogOffer, CatalogPage, CatalogTranslate } from "./catalog-model"
import { OfferCard } from "./offer-card"
import { OFFER_GRID, OFFER_LIST } from "./offer-grid"

/**
 * Les offres d'une boutique (modèle des ventes privées, 22/10/2026) : en grille (deux colonnes au téléphone) ou en
 * lignes. La grille porte son propre conteneur de requêtes : ses colonnes suivent la place réelle, aussi dans les
 * pages publiques. Dans sa propre boutique, le vendeur ne se répète pas sur chaque carte. En aperçu (la vitrine),
 * seulement des rangées complètes : à cinq colonnes, les deux dernières des douze offres attendent le catalogue.
 */
export function CatalogGrid({ page, audience, locale, t, layout = "grid", preview = false, renderAction }: { page: CatalogPage; audience: CatalogAudience; locale: string; t: CatalogTranslate; layout?: "grid" | "list"; preview?: boolean; renderAction?: (offer: CatalogOffer) => ReactNode }) {
  return page.page.length ? <div className="@container min-w-0"><ul className={layout === "list" ? OFFER_LIST : OFFER_GRID} data-catalog-layout={layout}>{page.page.map((offer, index) => <li key={offer.offerRef} className={preview ? "min-w-0 @min-[70rem]:@max-[90rem]:nth-[n+11]:hidden" : "min-w-0"}><OfferCard offer={offer} audience={audience} locale={locale} t={t} eager={index === 0} compact={layout === "list"} seller={false} action={renderAction?.(offer)} /></li>)}</ul></div> : <p role="status" className="rounded-[var(--ui2-card-radius)] border border-dashed border-[color:var(--esp-surface-border)] bg-card p-4 text-sm text-muted-foreground">{t(page.filteredWindow || !page.isDone ? "catalog.filteredWindow" : "catalog.empty")}</p>
}

export function CatalogPagination({ page, handle, audience, filters, cursor, t, provider = false }: { page: CatalogPage; handle: string; audience: CatalogAudience; filters: CatalogFilters; cursor: string | null; t: CatalogTranslate; provider?: boolean }) {
  const href = (next?: string) => provider ? audience === "public" ? routes.publicProviderCatalog(handle, filters, next) : routes.providerCatalog(handle, filters, next) : audience === "public" ? routes.publicShopCatalog(handle, filters, next) : routes.shopCatalog(handle, filters, next)
  const linkClass = buttonClassName("outline", "rounded-[var(--esp-social-action-radius,var(--ui2-button-radius))]")
  return cursor || (!page.isDone && page.continueCursor) ? <nav aria-label={t("catalog.pagination")} className="flex flex-wrap justify-between gap-3">{cursor ? <Link href={href()} prefetch={false} className={linkClass}>{t("catalog.firstPage")}</Link> : <span />}{!page.isDone && page.continueCursor && page.continueCursor !== cursor ? <Link href={href(page.continueCursor)} prefetch={false} className={linkClass}>{t("catalog.nextPage")}</Link> : null}</nav> : null
}
