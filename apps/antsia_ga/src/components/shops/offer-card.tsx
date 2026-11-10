import { parseCommerceCatalogFacets } from "@antsia/social-domain/commerce/catalogFacets"
import { ArrowUpRight, Store } from "lucide-react"
import Link from "next/link"
import type { ReactNode } from "react"

import { routes } from "@/lib/routes"
import { catalogAvailability, catalogDate, catalogPrice, catalogVariantPrice, type CatalogAudience, type CatalogOffer, type CatalogTranslate } from "./catalog-model"
import { OFFER_DETAIL_CSS } from "./offer-experience-styles"
import { OfferFacets } from "./offer-facets"
import { OfferMedia } from "./offer-media"
import { OfferGallery } from "./offer-gallery"
import { OfferMediaCarousel } from "./offer-media-carousel"
import { ServiceProfileDetails } from "../services/service-profile-details"

export { OfferMedia }

const linkClass = "inline-flex min-h-11 items-center rounded-[var(--esp-social-action-radius,var(--ui2-button-radius))] text-sm font-medium text-primary underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
const TAG_CLASS = "rounded-[var(--esp-chip-radius,var(--radius-md))] bg-muted px-2 py-0.5 text-xs font-semibold"

/** La fiche d'une offre : la boutique pour un produit, le prestataire pour un service ; publique ou membre. */
export function offerHref(offer: Pick<CatalogOffer, "kind" | "shopHandle" | "offerRef">, audience: CatalogAudience): string {
  if (offer.kind === "service") return audience === "public" ? routes.publicProviderOffer(offer.shopHandle, offer.offerRef) : routes.providerOffer(offer.shopHandle, offer.offerRef)
  return audience === "public" ? routes.publicShopOffer(offer.shopHandle, offer.offerRef) : routes.shopOffer(offer.shopHandle, offer.offerRef)
}

/** La vitrine du vendeur d'une offre : la boutique pour un produit, l'espace prestataire pour un service. */
export function offerStorefrontHref(offer: Pick<CatalogOffer, "kind" | "shopHandle">, audience: CatalogAudience): string {
  if (offer.kind === "service") return audience === "public" ? routes.publicProvider(offer.shopHandle) : routes.provider(offer.shopHandle)
  return audience === "public" ? routes.publicStorefront(offer.shopHandle) : routes.storefront(offer.shopHandle)
}

/** La marque et la couleur PUBLIÉES par PRO.GA (facettes), jamais déduites du titre. */
function offerAttributes(offer: CatalogOffer): { brand: string | null; color: string | null } {
  const attributes = parseCommerceCatalogFacets(offer.facets)?.attributes ?? []
  const text = (key: "brand" | "color") => { const attribute = attributes.find(entry => entry.key === key); return attribute?.type === "text" ? attribute.value : null }
  return { brand: text("brand"), color: text("color") }
}

/** Une indisponibilité RÉCENTE se signale sur la carte ; le reste de la disponibilité se lit sur la fiche. */
function recentlyOutOfStock(offer: CatalogOffer, nowMs = Date.now()): boolean {
  const { state, updatedAt, stale } = offer.availability
  return state === "out_of_stock" && updatedAt !== null && !stale && nowMs - updatedAt <= 15 * 60 * 1000
}

/**
 * La carte d'une offre, sur le modèle des ventes privées (décision du propriétaire du 22/10/2026) : galerie à
 * points, marque, nom, couleur ou nombre de variantes, prix exact et vendeur, puis l'action que la surface lui
 * passe (l'ajout au panier du membre). Rien d'inventé : ni prix barré ni remise, le moteur n'en porte pas.
 * `save` : le bouton « Enregistrer » du membre (CM-09), dans le coin de la photo (ou en bout de ligne, `compact`).
 * `compact` : la carte en ligne d'une publication liée à une offre. Présentation commune SSR/membre : aucun hook
 * de compte ni fournisseur requis.
 */
export function OfferCard({ offer, audience, locale, t, compact = false, eager = false, seller = true, action, save }: { offer: CatalogOffer; audience: CatalogAudience; locale: string; t: CatalogTranslate; compact?: boolean; eager?: boolean; seller?: boolean; action?: ReactNode; save?: ReactNode }) {
  const href = offerHref(offer, audience)
  const { brand, color } = offerAttributes(offer)
  const detail = color ?? (offer.variants.length ? t("catalog.hasVariants", { count: offer.variants.length }) : null)
  const price = catalogPrice(offer.price, locale, t)
  // La boutique s'identifie à part du titre : un lien vers SA vitrine (ou son espace prestataire).
  const shop = seller ? <Link href={offerStorefrontHref(offer, audience)} prefetch={false} className="inline-flex min-h-11 min-w-0 max-w-full items-center gap-1.5 justify-self-start rounded text-xs font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><Store aria-hidden className="size-3.5 shrink-0 text-[color:var(--role-commerce-ink,var(--primary))]" /><span className="truncate">{t("catalog.soldBy", { handle: offer.shopHandle })}</span></Link> : null
  if (compact) return <article data-offer-card data-offer-compact className="grid min-w-0 grid-cols-[6rem_minmax(0,1fr)] items-center gap-3 overflow-hidden rounded-[var(--ui2-card-radius)] bg-card pr-2 text-card-foreground [overflow-wrap:anywhere]">
    <Link href={href} prefetch={false} aria-label={t("catalog.openOfferNamed", { title: offer.title })} className="block rounded-[var(--esp-media-radius)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><OfferMedia media={offer.media[0]} title={offer.title} t={t} eager={eager} className="aspect-square bg-background" /></Link>
    <div className="grid min-w-0 gap-0.5 pr-2">
      {brand ? <p className="truncate text-xs font-bold">{brand}</p> : null}
      <h3 className="line-clamp-2 text-sm font-semibold leading-snug">{offer.title}</h3>
      {detail ? <p className="truncate text-xs text-muted-foreground">{detail}</p> : null}
      <p className="break-words font-bold text-[color:var(--role-commerce-ink,var(--foreground))]">{price}</p>
      <div className="flex min-w-0 flex-wrap items-center gap-x-3">{shop}<Link href={href} prefetch={false} className={linkClass}>{t("catalog.openOffer")}<ArrowUpRight className="ml-1 size-4 shrink-0" aria-hidden /></Link>{save ? <span className="ml-auto inline-flex" data-offer-card-save>{save}</span> : null}</div>
    </div>
    {action ? <div className="col-span-full grid min-w-0 px-1 pb-1 empty:hidden" data-offer-card-action>{action}</div> : null}
  </article>
  return <article data-offer-card className="flex h-full min-w-0 flex-col gap-3 overflow-hidden rounded-[var(--ui2-card-radius)] bg-card pb-3 text-card-foreground [overflow-wrap:anywhere]">
    {/* CM-09 : le bouton « Enregistrer » du membre, posé dans le coin de la photo ; aucun sur une carte publique. */}
    <div className="relative min-w-0">
      <OfferMediaCarousel media={offer.media} title={offer.title} href={href} labels={{ photos: t("catalog.offerPhotos"), openOffer: t("catalog.openOfferNamed", { title: offer.title }), openPhotos: offer.media.map((_, index) => t("catalog.openOfferPhoto", { title: offer.title, index: index + 1 })), noPhoto: t("catalog.noPhoto"), mediaWithheld: t("catalog.mediaWithheld") }} eager={eager} />
      {save ? <div className="absolute right-2 top-2 z-10" data-offer-card-save>{save}</div> : null}
    </div>
    <div className="grid min-w-0 flex-1 content-start gap-1 px-2">
      {brand ? <p className="truncate text-sm font-bold">{brand}</p> : null}
      <h3 className="line-clamp-2 text-sm leading-snug"><Link href={href} prefetch={false} className="rounded text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{offer.title}</Link></h3>
      {detail ? <p className="truncate text-xs text-muted-foreground">{detail}</p> : null}
      <p className="mt-1 break-words text-lg font-bold leading-tight text-[color:var(--role-commerce-ink,var(--foreground))]">{price}</p>
      {offer.kind === "service" || recentlyOutOfStock(offer) ? <p className="flex flex-wrap gap-1.5">{offer.kind === "service" ? <span className={TAG_CLASS}>{t("catalog.kinds.service")}</span> : null}{recentlyOutOfStock(offer) ? <span className={TAG_CLASS}>{t("catalog.card.outOfStock")}</span> : null}</p> : null}
      {shop}
    </div>
    {/* Une action qui ne rend rien (offre à consulter) ne laisse ni case ni écart. */}
    {action ? <div className="grid min-w-0 px-2 empty:hidden" data-offer-card-action>{action}</div> : null}
  </article>
}

/**
 * La fiche d'une offre (modèle des ventes privées, 22/10/2026) : la galerie d'abord, puis la marque, le nom, la
 * couleur ou les variantes, le prix exact et le vendeur, avec l'action du lecteur ; ensuite la description, les
 * caractéristiques publiées, les variantes, la disponibilité et la remise. Toutes les variantes actives restent
 * dans le HTML, avec leur montant exact. `titleAs` : le niveau du nom, `h1` quand la fiche porte le titre de
 * l'écran (publique, ou membre sans en-tête générique).
 */
export function OfferDetails({ offer, audience, locale, t, providerT, actionSlot, publicActionSlot, titleAs }: { offer: CatalogOffer; audience: CatalogAudience; locale: string; t: CatalogTranslate; providerT?: CatalogTranslate; actionSlot?: ReactNode; publicActionSlot?: ReactNode; titleAs?: "h1" | "h2" }) {
  const storefront = offerStorefrontHref(offer, audience)
  const Heading = titleAs ?? (audience === "public" ? "h1" : "h2")
  const { brand, color } = offerAttributes(offer)
  const detail = color ?? (offer.variants.length ? t("catalog.hasVariants", { count: offer.variants.length }) : null)
  return <div data-offer-detail-frame><style>{OFFER_DETAIL_CSS}</style><article className="offer-detail-layout min-w-0 gap-6 rounded-[var(--ui2-card-radius)] bg-card p-4 text-card-foreground min-[768px]:p-6 [overflow-wrap:anywhere]">
    <div className="offer-detail-media min-w-0"><OfferGallery media={offer.media} title={offer.title} labels={{ photos: t("catalog.offerPhotos"), choosePhoto: t("catalog.choosePhoto"), showPhotos: offer.media.map((_, index) => t("catalog.showPhoto", { index: index + 1 })), noPhoto: t("catalog.noPhoto"), mediaWithheld: t("catalog.mediaWithheld") }} /></div>
    <header className="offer-detail-heading grid min-w-0 gap-3">
      {brand ? <p className="text-sm font-bold uppercase tracking-wide">{brand}</p> : null}
      <Heading className="mp-title break-words">{offer.title}</Heading>
      {detail ? <p className="text-sm text-muted-foreground">{detail}</p> : null}
      {offer.kind === "service" ? <p className={`${TAG_CLASS} justify-self-start`}>{t("catalog.kinds.service")}</p> : null}
      <p className="break-words font-display text-3xl font-bold leading-tight text-[color:var(--role-commerce-ink,var(--foreground))]">{catalogPrice(offer.price, locale, t)}</p>
      <p className="text-xs text-muted-foreground">{t("catalog.displayedPriceHint")}</p>
      <Link href={storefront} prefetch={false} className={`${linkClass} justify-self-start`}><Store aria-hidden className="mr-1.5 size-4 shrink-0" />{t("catalog.soldBy", { handle: offer.shopHandle })}</Link>
      {audience === "member" && actionSlot ? <div data-offer-actions className="grid min-w-0 gap-3">{actionSlot}</div> : null}
      {audience === "public" && publicActionSlot ? <div data-public-offer-actions className="grid min-w-0 gap-3">{publicActionSlot}</div> : null}
    </header>
    <section className="offer-detail-full grid min-w-0 gap-3"><h2 className="text-lg font-semibold">{t("catalog.description")}</h2><p className="whitespace-pre-wrap break-words leading-relaxed">{offer.description || t("catalog.noDescription")}</p></section>
    <OfferFacets facets={offer.facets} t={t} />
    {offer.kind === "service" && providerT ? <ServiceProfileDetails offer={offer} locale={locale} t={providerT} /> : null}
    {offer.variants.length ? <details className="offer-detail-full rounded-xl border border-border p-4" open={offer.variants.length <= 6}><summary className="min-h-11 cursor-pointer font-semibold">{t("catalog.variants", { count: offer.variants.length })}</summary><ul className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(min(100%,15rem),1fr))] gap-3">{offer.variants.map((variant) => <li key={variant.variantRef} className="grid min-w-0 gap-1 rounded-lg bg-background p-3"><h3 className="break-words font-medium">{variant.label}</h3>{variant.options.length ? <p className="break-words text-sm text-muted-foreground">{variant.options.map((option, index) => offer.variantAxes[index] ? `${offer.variantAxes[index]} : ${option}` : option).join(" · ")}</p> : null}<p className="font-semibold">{catalogVariantPrice(offer.price, variant, locale, t)}</p><p className="text-xs text-muted-foreground">{catalogAvailability(offer.availability, t, variant.availability)}</p></li>)}</ul></details> : null}
    <section className="offer-detail-full grid min-w-0 gap-3 rounded-xl bg-background p-4"><h2 className="font-semibold">{t("catalog.availability.title")}</h2><p>{catalogAvailability(offer.availability, t)}</p><p className="text-sm text-muted-foreground">{t("catalog.availability.indicative")}</p>{offer.availability.updatedAt !== null ? <p className="text-xs text-muted-foreground">{t("catalog.availability.updated", { date: catalogDate(offer.availability.updatedAt, locale) })}</p> : null}</section>
    {offer.zone || offer.leadTimeDays !== null || offer.collections.length ? <dl className="offer-detail-full grid min-w-0 gap-4 sm:grid-cols-2">{offer.zone ? <div><dt className="text-sm font-medium text-muted-foreground">{t("catalog.zone")}</dt><dd className="break-words">{offer.zone}</dd></div> : null}{offer.leadTimeDays !== null ? <div><dt className="text-sm font-medium text-muted-foreground">{t("catalog.leadTime")}</dt><dd>{t("catalog.leadTimeDays", { count: offer.leadTimeDays })}</dd></div> : null}{offer.collections.length ? <div><dt className="text-sm font-medium text-muted-foreground">{t("catalog.collections")}</dt><dd className="break-words">{offer.collections.map((collection) => collection.label).join(" · ")}</dd></div> : null}</dl> : null}
    <p className="offer-detail-full text-xs text-muted-foreground">{t("catalog.updated", { date: catalogDate(offer.changedAt, locale) })}</p>
  </article></div>
}
