"use client"

import { StorefrontTerms } from "./storefront-terms"

import { api } from "@antsia/api/engine"
import { useAuthenticatedConvexQuery } from "@antsia/api/hooks"
import { useNetwork } from "@antsia/api/network"
import { useMutation } from "convex/react"
import { effectiveActivityConfiguration } from "@antsia/social-domain/activityConfiguration"
import { Clock, MapPin } from "lucide-react"
import { useTranslation } from "react-i18next"
import Image from "next/image"
import { useState } from "react"
import { Button, Card, CenteredStatus } from "@/components/shared/controls"
import { routes } from "@/lib/routes"
import type { StorefrontData } from "./shop-model"
import { ShopFrame, ShopLink, ShopLogo, ShopQueryFailure, useShopAction } from "./shop-ui"
import { MemberCatalogPreview } from "./catalog-member-screen"
import { DailySpecialCard, useTodaysSpecialRef } from "./daily-special"
import { MemberShopJobsPreview } from "@/components/jobs/member-shop-jobs-screen"

export function MemberStorefrontScreen({ handle }: { handle: string }) {
  const { networkId, personId } = useNetwork()
  return <StorefrontQuery key={`${networkId}:${personId}:${handle}`} handle={handle} />
}
function StorefrontQuery({ handle }: { handle: string }) {
  const { t } = useTranslation("shops")
  const { networkId } = useNetwork()
  const query = useAuthenticatedConvexQuery(api.modules.shops.shops.storefront, { networkId, handle })
  const directory = routes.marketplace({ view: "shops" })
  const shop = query.isError ? null : query.data ?? null
  // Une vitrine lue porte son propre titre (l'en-tête de la boutique) ; sinon, le titre générique et le retour.
  return <ShopFrame title={t("storefront.title")} header={shop ? null : undefined}>
    {shop ? null : <ShopLink href={directory}>{t("directory.title")}</ShopLink>}
    {query.isError ? <ShopQueryFailure href={directory} retry={() => void query.refetch()} /> : query.data === undefined ? <CenteredStatus label={t("common.loading")} /> : query.data === null ? <ShopQueryFailure href={directory} /> : <MemberStorefront shop={query.data} />}
  </ShopFrame>
}

/**
 * La vitrine d'une boutique, sur le modèle des ventes privées (décision du propriétaire du 22/10/2026) : l'en-tête
 * de la boutique (bannière de sa page, logo, nom, badge calculé, spécialité et zone, actions), puis son corps.
 */
export function MemberStorefront({ shop }: { shop: StorefrontData }) {
  const configuration = effectiveActivityConfiguration(shop.activityConfiguration, shop.model)
  return <div className="grid min-w-0 gap-8" data-activity-template={configuration.template}>
    <StorefrontHero shop={shop} />
    <StorefrontBody shop={shop} />
  </div>
}

/**
 * Le corps de la vitrine : ses blocs dans l'ordre configuré — offres (collections qui défilent et grille),
 * présentation, publications —, ses conditions déclarées et ses offres d'emploi. `publications={false}` quand le
 * mur de la page suit déjà (une page d'entreprise présentée comme sa boutique). À poser dans une grille à `gap-8`.
 * Une adresse « Alimentation et restauration » (SU06) ouvre sur son plat du jour, et son catalogue s'appelle
 * « Menu » ; ses horaires sont dans l'en-tête.
 */
export function StorefrontBody({ shop, publications = true }: { shop: StorefrontData; publications?: boolean }) {
  const { t, i18n } = useTranslation("shops")
  const { t: ux } = useTranslation("commerceExperience")
  const food = effectiveActivityConfiguration(shop.activityConfiguration, shop.model).template === "food"
  const special = useTodaysSpecialRef(food ? shop.dailySpecial : null)
  const facts = food ? (["specialty", "serviceArea"] as const) : (["specialty", "serviceArea", "hours"] as const)
  return <>
    {shop.viewer.manages ? <p className="-mt-4 text-sm text-muted-foreground">{ux("storefront.manageHint")}</p> : null}
    {special ? <DailySpecialCard handle={shop.handle} offerRef={special} /> : null}
    {shop.blocks.map((block) => block === "catalog" || block === "services" ? <MemberCatalogPreview key={block} handle={shop.handle} kind={block === "catalog" ? "product" : "service"} title={food && block === "catalog" ? t("food.menu") : undefined} /> : block === "about" ? <Card key={block}><div className="grid gap-4"><h2 className="mp-subtitle">{t("storefront.about")}</h2>{shop.description ? <p className="whitespace-pre-wrap">{shop.description}</p> : null}<dl className="grid gap-4 sm:grid-cols-2">{facts.map((field) => shop[field] ? <div key={field}><dt className="text-sm font-medium text-muted-foreground">{t(`storefront.${field}`)}</dt><dd className="whitespace-pre-wrap">{shop[field]}</dd></div> : null)}</dl></div></Card> : block === "publications" && publications ? <Card key={block}><div className="grid justify-items-start gap-3"><h2 className="mp-subtitle">{t("blocks.publications")}</h2><p className="text-sm text-muted-foreground">{t("storefront.publicationsHint")}</p><ShopLink href={routes.page(shop.handle)}>{t("storefront.socialPage")}</ShopLink></div></Card> : null)}
    <StorefrontTerms value={shop.storefrontTerms} locale={i18n.resolvedLanguage === "en" ? "en" : "fr"} t={t} />
    <MemberShopJobsPreview handle={shop.handle} />
  </>
}

const HERO_TAG = "inline-flex min-h-8 items-center gap-1.5 rounded-[var(--esp-chip-radius,var(--radius-md))] bg-[var(--esp-chip-bg,var(--muted))] px-3 text-xs font-semibold"

/**
 * L'en-tête de la boutique : la bannière de sa page en photo (le nom et le logo posés dessus, lisibles grâce au
 * voile), sinon une carte neutre ; puis les mentions réelles et les actions (offres, suivi de la page, échange déjà
 * ouvert, gestion, version publique). Le nom est le titre de l'écran — aussi sur la fiche d'une page d'entreprise
 * présentée comme sa boutique.
 */
export function StorefrontHero({ shop }: { shop: StorefrontData }) {
  const { t } = useTranslation("shops")
  const configuration = effectiveActivityConfiguration(shop.activityConfiguration, shop.model)
  const capabilities = configuration.capabilities.map(capability => t(`activityConfiguration:capabilities.${capability}`))
  // Une adresse « Alimentation et restauration » montre ses horaires dès l'en-tête : on y vient pour commander.
  const food = configuration.template === "food"
  const { t: ux } = useTranslation("commerceExperience")
  const { networkId } = useNetwork()
  const follow = useMutation(api.modules.pages.pages.follow)
  const unfollow = useMutation(api.modules.pages.pages.unfollow)
  const action = useShopAction()
  const [failedBanner, setFailedBanner] = useState<string | null>(null)
  const banner = shop.bannerUrl && failedBanner !== shop.bannerUrl ? shop.bannerUrl : null
  const hasCatalog = shop.blocks.includes("catalog") || shop.blocks.includes("services")
  const identity = <div className="flex min-w-0 items-end gap-3">
    <span className="shrink-0 rounded-xl"><ShopLogo url={shop.logoUrl} name={shop.name} /></span>
    <div className="grid min-w-0 gap-1">
      <h1 className={`break-words font-display text-2xl font-bold leading-tight min-[768px]:text-3xl ${banner ? "text-[color:var(--esp-on-banner)]" : ""}`}>{shop.name}</h1>
      <p className={`break-all text-sm ${banner ? "text-[color:var(--esp-on-banner-muted)]" : "text-muted-foreground"}`}>@{shop.handle}</p>
    </div>
  </div>
  return <header className="grid min-w-0 gap-4" data-storefront-hero>
    {/* Sur grand écran, la bannière garde toute la largeur et son format 3:1 sans dépasser 22 rem de haut (largeur explicite :
        la hauteur maximale ne la rétrécit pas par le rapport) ; la photo est recadrée. */}
    {banner ? <div className="relative aspect-[16/9] w-full overflow-hidden rounded-[var(--ui2-card-radius)] bg-muted min-[768px]:aspect-[3/1] min-[768px]:max-h-[22rem]">
      <Image unoptimized src={banner} alt="" fill sizes="100vw" loading="eager" className="object-cover" onError={() => setFailedBanner(banner)} />
      <span aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(to_bottom,transparent_35%,var(--ui2-scrim)_100%)]" />
      <div className="absolute inset-x-0 bottom-0 p-4 min-[768px]:p-6">{identity}</div>
    </div> : <div className="rounded-[var(--ui2-card-radius)] bg-card p-4 min-[768px]:p-6">{identity}</div>}
    <ul aria-label={t("storefront.facts")} className="flex min-w-0 flex-wrap gap-2">
      <li className={HERO_TAG}>{t(`badges.${shop.badge}`)}</li>
      {capabilities.map(capability => <li key={capability} className={HERO_TAG}>{capability}</li>)}
      {shop.specialty ? <li className={HERO_TAG}>{shop.specialty}</li> : null}
      {shop.serviceArea ? <li className={HERO_TAG}><MapPin aria-hidden className="size-3.5 shrink-0" />{shop.serviceArea}</li> : null}
    </ul>
    {food && shop.hours ? <p className="flex min-w-0 items-start gap-2 text-sm" data-storefront-hours><Clock aria-hidden className="mt-0.5 size-4 shrink-0" /><span className="min-w-0"><span className="font-semibold">{t("food.hours")}</span> · <span className="whitespace-pre-wrap">{shop.hours}</span></span></p> : null}
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      {hasCatalog ? <ShopLink variant="commerce" href={routes.shopCatalog(shop.handle)}>{food ? t("food.seeMenu") : ux("storefront.offers")}</ShopLink> : null}
      <Button type="button" variant="outline" pending={action.pending} aria-pressed={shop.viewer.following} onClick={() => void action.run(async (): Promise<{ following: boolean }> => shop.viewer.following ? await unfollow({ networkId, pageId: shop.pageId }) : await follow({ networkId, handle: shop.handle }))}>{t(shop.viewer.following ? "storefront.unfollow" : "storefront.follow")}</Button>
      <StorefrontExistingContact handle={shop.handle} />
      {shop.viewer.manages ? <ShopLink href={routes.myShops()}>{t("storefront.manage")}</ShopLink> : null}
      {shop.publicListing ? <ShopLink href={routes.publicStorefront(shop.handle)}>{t("storefront.publicVersion")}</ShopLink> : null}
    </div>
    {action.error ? <p role="alert" className="text-sm text-destructive">{action.error}</p> : null}
  </header>
}

/** Sans readiness de contact général, seule une conversation déjà autorisée est proposée. */
function StorefrontExistingContact({ handle }: { handle: string }) {
  const { networkId } = useNetwork()
  const { t } = useTranslation("commerceExperience")
  const thread = useAuthenticatedConvexQuery(api.modules.commercialMessaging.threads.findMyThread, { networkId, shopHandle: handle })
  if (thread.isError || thread.isPending || !thread.data) return null
  return <ShopLink variant="message" href={routes.commercialConversation(thread.data.threadId)}>{t("storefront.existingConversation")}</ShopLink>
}
