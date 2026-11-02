import { StorefrontTerms } from "./storefront-terms"
import { effectiveActivityConfiguration } from "@antsia/social-domain/activityConfiguration"
import { Fragment } from "react"
import type { Locale } from "@antsia/social-features/i18n"
import Image from "next/image"
import Link from "next/link"
import type { ReactNode } from "react"

import { getAppT } from "@/i18n/server"
import type { PublicDailySpecial as PublicDailySpecialData, PublicStorefront } from "@/lib/public-shops-data"
import { routes } from "@/lib/routes"
import { SHOP_ACTION_CLASS } from "./offer-experience-styles"
import { catalogPrice } from "./catalog-model"
import { OfferMedia } from "./offer-media"
import { PublicDailySpecial } from "./public-daily-special"

/** SSR : identité et catalogue admis ; aucun état privé du lecteur. */
export function PublicStorefrontCard({ storefront, locale, catalog, dailySpecial }: { storefront: PublicStorefront; locale: Locale; catalog?: ReactNode; dailySpecial?: PublicDailySpecialData | null }) {
  const { t } = getAppT(locale)
  const configuration = effectiveActivityConfiguration(storefront.activityConfiguration, storefront.model)
  const food = configuration.template === "food"
  const special = food && dailySpecial?.offer.shopHandle === storefront.handle ? dailySpecial : null
  const translate = (key: string, options?: Record<string, unknown>) => t(`shops:${key}`, options)
  const catalogIndex = storefront.blocks.findIndex(block => block === "catalog" || block === "services")
  const details = [
    { key: "specialty", value: storefront.specialty },
    { key: "serviceArea", value: storefront.serviceArea },
    { key: "hours", value: storefront.hours },
  ] as const

  return <article data-activity-template={configuration.template} className="mx-auto w-full max-w-5xl overflow-hidden rounded-2xl border border-border bg-card text-card-foreground [overflow-wrap:anywhere]">
    {storefront.bannerUrl ? <div className="bg-muted"><Image unoptimized src={storefront.bannerUrl} width={1200} height={400} alt="" loading="eager" className="aspect-[3/1] max-h-96 w-full object-cover" /></div> : null}
    <div className="flex flex-col gap-6 p-5 sm:p-8">
      <header className="flex flex-col gap-4">
        <p className="text-sm font-medium text-primary">{t("shops:publicStorefront.title", { name: storefront.name })}</p>
        <div className="flex items-start gap-4">
          {storefront.logoUrl ? <Image unoptimized src={storefront.logoUrl} width={88} height={88} alt="" loading="lazy" className="size-20 shrink-0 rounded-[var(--esp-avatar-page-radius)] object-cover object-center sm:size-22" /> : <span aria-hidden="true" className="flex size-20 shrink-0 items-center justify-center rounded-[var(--esp-avatar-page-radius)] bg-muted text-2xl font-semibold">{storefront.name.slice(0, 1)}</span>}
          <div className="flex min-w-0 flex-col gap-2">
            <h1 className="mp-title break-words">{storefront.name}</h1>
            <p className="break-all text-sm text-muted-foreground">@{storefront.handle}</p>
            <p className="self-start rounded-[var(--esp-social-action-radius,var(--ui2-button-radius))] bg-muted px-2 py-1 text-xs font-semibold">{t(`shops:badges.${storefront.badge}`)}</p>
          </div>
        </div>
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-[var(--ui2-card-radius)] bg-muted p-4">
          <div className="grid min-w-0 flex-1 gap-1"><p className="text-sm font-semibold text-[color:var(--role-commerce-ink,var(--foreground))]">{t(`shops:models.${storefront.model}`)}</p>{storefront.specialty ? <p className="break-words text-sm text-muted-foreground">{storefront.specialty}</p> : null}</div>
          {storefront.blocks.includes("catalog") || storefront.blocks.includes("services") ? <Link href={routes.publicShopCatalog(storefront.handle)} prefetch={false} className={SHOP_ACTION_CLASS}>{t(food ? "shops:food.seeMenu" : "shops:catalog.openCatalog")}</Link> : null}
        </div>
        <p className="border-l-2 border-primary pl-3 text-sm text-muted-foreground">{t("shops:publicStorefront.origin", { name: storefront.origin.name })}</p>
        <p className="text-xs text-muted-foreground">{t("shops:publicStorefront.publicAudience")}</p>
      </header>

      {special ? <PublicDailySpecial special={{ day: special.day, offerRef: special.offer.offerRef }}><section aria-labelledby="public-daily-special" data-daily-special className="@container grid min-w-0 gap-3 rounded-[var(--ui2-card-radius)] bg-card p-3 text-card-foreground [overflow-wrap:anywhere]">
        <h2 id="public-daily-special" className="mp-subtitle">{t("shops:food.todaysSpecial")}</h2>
        <div className="grid min-w-0 items-center gap-3 @[480px]:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <Link href={routes.publicShopOffer(storefront.handle, special.offer.offerRef)} prefetch={false} aria-label={t("shops:catalog.openOfferNamed", { title: special.offer.title })} className="block rounded-[var(--esp-media-radius)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><OfferMedia media={special.offer.media[0]} title={special.offer.title} t={translate} eager className="aspect-[4/3] bg-muted @[720px]:aspect-[2/1]" /></Link>
          <div className="grid min-w-0 content-center gap-2"><p className="text-lg font-semibold leading-snug">{special.offer.title}</p><p className="text-lg font-bold text-[color:var(--role-commerce-ink,var(--foreground))]">{catalogPrice(special.offer.price, locale, translate)}</p>{special.offer.description ? <p className="line-clamp-3 text-sm text-muted-foreground">{special.offer.description}</p> : null}<Link href={routes.publicShopOffer(storefront.handle, special.offer.offerRef)} prefetch={false} className={`${SHOP_ACTION_CLASS} justify-self-start`}>{t("shops:postFormula.actions.orderProduct")}</Link></div>
        </div>
      </section></PublicDailySpecial> : null}

      {storefront.blocks.map((block, index) => <Fragment key={block}>{block === "about" ? <section aria-labelledby="public-storefront-about" className="flex flex-col gap-4 border-t border-border pt-6">
        <h2 id="public-storefront-about" className="mp-subtitle">{t("shops:storefront.about")}</h2>
        <p className="whitespace-pre-wrap break-words leading-relaxed">{storefront.description ?? t("shops:publicStorefront.descriptionFallback", { name: storefront.name })}</p>
        {details.some((detail) => detail.value) ? <dl className="grid gap-4 sm:grid-cols-2">
          {details.map((detail) => detail.value ? <div key={detail.key} className="min-w-0">
            <dt className="text-sm font-semibold">{t(`shops:storefront.${detail.key}`)}</dt>
            <dd className="mt-1 whitespace-pre-wrap break-words text-sm text-muted-foreground">{detail.value}</dd>
          </div> : null)}
        </dl> : null}
      </section> : index === catalogIndex ? catalog : null}</Fragment>)}
      <StorefrontTerms value={storefront.storefrontTerms} locale={locale} t={(key, options) => t(`shops:${key}`, options)} />
      <Link href={routes.storefront(storefront.handle)} prefetch={false} className={`${SHOP_ACTION_CLASS} self-start`}>{t("shops:publicStorefront.memberLink")}</Link>
    </div>
  </article>
}
