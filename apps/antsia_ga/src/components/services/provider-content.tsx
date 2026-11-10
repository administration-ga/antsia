import { effectiveActivityConfiguration } from "@antsia/social-domain/activityConfiguration"
import type { PublicStorefront } from "@convex/modules/shops/validators"
import Image from "next/image"
import Link from "next/link"

import { CatalogGrid } from "@/components/shops/catalog-grid"
import type { CatalogAudience, CatalogPage, CatalogTranslate } from "@/components/shops/catalog-model"
import { SHOP_ACTION_CLASS } from "@/components/shops/offer-experience-styles"
import { StorefrontTerms } from "@/components/shops/storefront-terms"
import type { CatalogSearch } from "@/lib/catalog-search"
import { routes } from "@/lib/routes"
import { ProviderPortfolio } from "./provider-portfolio"

export type ProviderPresentation = Pick<PublicStorefront, "handle" | "name" | "description" | "logoUrl" | "bannerUrl" | "model" | "activityConfiguration" | "specialty" | "serviceArea" | "hours" | "badge" | "blocks" | "storefrontTerms">
const sections = ["presentation", "services", "portfolio", "availability", "reviews", "about"] as const

/** Même activité et mêmes DTO que la boutique ; seule la présentation se spécialise. */
export function ProviderContent({ storefront, catalog, audience, locale, viewer, t, shopT, search = { kind: "service", cursor: null } }: { storefront: ProviderPresentation; catalog: CatalogPage; audience: CatalogAudience; locale: "fr" | "en"; viewer: "anonymous" | "authenticated"; t: CatalogTranslate; shopT: CatalogTranslate; search?: CatalogSearch }) {
  const configuration = effectiveActivityConfiguration(storefront.activityConfiguration, storefront.model)
  if (!configuration.capabilities.includes("services")) return null
  const catalogHref = (cursor?: string) => audience === "public" ? routes.publicProviderCatalog(storefront.handle, { ...search, kind: "service" }, cursor) : routes.providerCatalog(storefront.handle, { ...search, kind: "service" }, cursor)
  const Heading = audience === "public" ? "h1" : "h2"
  const services = { ...catalog, page: catalog.page.filter(offer => offer.kind === "service" && offer.shopHandle === storefront.handle) }
  return <article className="grid min-w-0 gap-6 [overflow-wrap:anywhere]" data-provider-content data-activity-template={configuration.template}>
    <header className="grid min-w-0 gap-4 rounded-[var(--ui2-card-radius)] border border-border bg-card p-4">
      {storefront.bannerUrl ? <Image unoptimized src={storefront.bannerUrl} width={1200} height={400} alt="" loading="eager" className="aspect-[3/1] max-h-72 w-full rounded-[var(--esp-media-radius)] object-cover" /> : null}
      <div className="flex min-w-0 items-start gap-4">{storefront.logoUrl ? <Image unoptimized src={storefront.logoUrl} width={88} height={88} alt="" className="size-20 shrink-0 rounded-[var(--esp-avatar-page-radius)] bg-muted object-contain" /> : <span aria-hidden className="flex size-20 shrink-0 items-center justify-center rounded-[var(--esp-avatar-page-radius)] bg-muted text-2xl font-semibold">{Array.from(storefront.name)[0]}</span>}<div className="grid min-w-0 gap-2"><Heading className="mp-title break-words">{storefront.name}</Heading><p className="text-sm text-muted-foreground">@{storefront.handle}</p><p className="text-sm">{shopT(`badges.${storefront.badge}`)}</p>{storefront.specialty ? <p className="break-words font-medium">{storefront.specialty}</p> : null}</div></div>
      <p className="text-sm text-muted-foreground">{t("presentation.sameActivity")}</p>
      <div className="flex flex-wrap gap-2"><Link className={SHOP_ACTION_CLASS} href={catalogHref()} prefetch={false}>{t("actions.catalog")}</Link><Link className={SHOP_ACTION_CLASS} href={routes.page(storefront.handle)}>{t(viewer === "anonymous" ? "actions.signInSocial" : "actions.socialPage")}</Link></div>
    </header>
    <nav aria-label={t("navigation")} className="flex min-w-0 flex-wrap gap-2">{sections.map(section => <a key={section} href={`#provider-${section}`} className={SHOP_ACTION_CLASS}>{t(`sections.${section}`)}</a>)}</nav>
    <section id="provider-presentation" className="scroll-mt-24 grid min-w-0 gap-3"><h2 className="mp-subtitle">{t("sections.presentation")}</h2><p className="whitespace-pre-wrap break-words leading-relaxed">{storefront.description || t("presentation.empty")}</p></section>
    <section id="provider-services" className="scroll-mt-24 grid min-w-0 gap-4"><h2 className="mp-subtitle">{t("sections.services")}</h2>{catalog.indexStatus === "building" ? <p role="status" className="text-sm text-muted-foreground">{t("status.building")}</p> : null}{catalog.indexStatus !== "building" || services.page.length ? <CatalogGrid page={services} audience={audience} locale={locale} t={shopT} /> : null}<div className="flex flex-wrap gap-3"><Link href={catalogHref()} prefetch={false} className={SHOP_ACTION_CLASS}>{t("actions.catalog")}</Link>{!catalog.isDone && catalog.continueCursor ? <Link href={catalogHref(catalog.continueCursor)} prefetch={false} className={SHOP_ACTION_CLASS}>{t("actions.nextCatalog")}</Link> : null}</div></section>
    <section id="provider-portfolio" className="scroll-mt-24 grid min-w-0 gap-4"><h2 className="mp-subtitle">{t("sections.portfolio")}</h2><ProviderPortfolio offers={services.page} handle={storefront.handle} audience={audience} t={t} /><Link href={catalogHref()} prefetch={false} className={`${SHOP_ACTION_CLASS} justify-self-start`}>{t("actions.catalog")}</Link></section>
    <section id="provider-availability" className="scroll-mt-24 grid min-w-0 gap-3 rounded-[var(--ui2-card-radius)] bg-muted p-4"><h2 className="mp-subtitle">{t("sections.availability")}</h2><p>{t("availability.onRequest")}</p><p className="text-sm text-muted-foreground">{t("availability.noCalendar")}</p><Link href={catalogHref()} prefetch={false} className={`${SHOP_ACTION_CLASS} justify-self-start`}>{t("availability.openServices")}</Link></section>
    <section id="provider-reviews" className="scroll-mt-24 grid min-w-0 gap-3"><h2 className="mp-subtitle">{t("sections.reviews")}</h2><p role="status" className="text-sm text-muted-foreground">{t("reviews.unavailable")}</p>{viewer === "authenticated" ? <Link href={routes.serviceRequests()} className={`${SHOP_ACTION_CLASS} justify-self-start`}>{t("reviews.requests")}</Link> : null}</section>
    <section id="provider-about" className="scroll-mt-24 grid min-w-0 gap-4"><h2 className="mp-subtitle">{t("sections.about")}</h2><dl className="grid min-w-0 gap-4 sm:grid-cols-2">{(["specialty", "serviceArea", "hours"] as const).map(field => storefront[field] ? <div key={field}><dt className="text-sm font-semibold">{t(`presentation.${field === "serviceArea" ? "area" : field}`)}</dt><dd className="mt-1 whitespace-pre-wrap break-words">{storefront[field]}</dd></div> : null)}</dl>{storefront.storefrontTerms ? <StorefrontTerms value={storefront.storefrontTerms} locale={locale} t={shopT} /> : null}</section>
  </article>
}
