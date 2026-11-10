import { notFound } from "next/navigation"
import { effectiveActivityConfiguration } from "@antsia/social-domain/activityConfiguration"

import { PublicShell, PUBLIC_LINK } from "@/components/public/public-shell"
import { PublicStatus } from "@/components/public/public-status"
import { buttonClassName } from "@/components/shared/button-class"
import { PublicOfferSelection } from "@/components/cart/offer-cart-actions"
import { getAppT } from "@/i18n/server"
import { catalogFilters, catalogSearch } from "@/lib/catalog-search"
import { loadPublicCatalog, loadPublicOffer } from "@/lib/public-catalog-data"
import { publicMetadata, publicSearch } from "@/lib/public-data"
import { loadPublicStorefront } from "@/lib/public-shops-data"
import { decodeRouteSegment } from "@/lib/route-params"
import { offerSelectionFromSearch, routes } from "@/lib/routes"
import { getPublicLocale } from "@/lib/server-session"
import Link from "next/link"
import { CatalogFiltersForm } from "./catalog-filters"
import { PublicCatalogNavigation } from "./catalog-public-navigation"
import { CatalogGrid, CatalogPagination } from "./catalog-grid"
import type { CatalogPage } from "./catalog-model"
import { OfferDetails } from "./offer-card"

type Props = { params: Promise<{ handle: string; offerRef?: string }>; searchParams?: Promise<Record<string, string | string[] | undefined>>; provider?: boolean }
async function input(props: Props) {
  const params = await props.params
  const search = await props.searchParams ?? {}
  const handle = decodeRouteSegment(params.handle)
  const offerRef = params.offerRef ? decodeRouteSegment(params.offerRef) : null
  const ordinary = Object.fromEntries(Object.entries(search).filter(([key]) => key !== "ott"))
  const selection = handle && offerRef ? offerSelectionFromSearch(handle, offerRef, ordinary) : undefined
  const parsed = catalogSearch(ordinary)
  const catalog = parsed && (!props.provider || parsed.kind !== "product") ? { ...parsed, ...(props.provider ? { kind: "service" as const } : {}) } : null
  return { handle, offerRef, search: catalog, handoff: publicSearch(search).handoff, selection }
}

export function PublicCatalogPreview({ page, handle, locale, food = false }: { page: CatalogPage; handle: string; locale: "fr" | "en"; food?: boolean }) {
  const { t } = getAppT(locale)
  const translate = (key: string, options?: Record<string, unknown>) => t(`shops:${key}`, options)
  return <section aria-labelledby="public-shop-catalog" className="grid gap-4 border-t border-border pt-6"><h2 id="public-shop-catalog" className="mp-subtitle">{t(food ? "shops:food.menu" : "shops:catalog.title")}</h2>{page.indexStatus === "building" ? <p role="status" className="text-sm text-muted-foreground">{t("shops:catalog.indexBuilding")}</p> : null}{page.indexStatus !== "building" || page.page.length ? <CatalogGrid page={page} audience="public" locale={locale} t={translate} /> : null}{page.page.length === 0 && page.indexStatus !== "building" ? <p className="text-sm text-muted-foreground">{t("shops:catalog.publicConsentHint")}</p> : null}<Link href={routes.publicShopCatalog(handle)} prefetch={false} className={`${PUBLIC_LINK} justify-self-start`}>{t(food ? "shops:food.seeMenu" : "shops:catalog.openCatalog")}</Link></section>
}

export async function PublicCatalogMetadata(props: Props) {
  const { t } = getAppT(await getPublicLocale())
  const request = await input(props)
  const unavailable = () => publicMetadata(t("shops:catalog.unavailableTitle"), t("shops:catalog.descriptionMeta"), routes.home(), false)
  if (!request.handle || !request.search) return unavailable()
  const shop = await loadPublicStorefront(request.handle, request.handoff)
  if (shop.status !== "ready" || !shop.data) return unavailable()
  const food = !props.provider && effectiveActivityConfiguration(shop.data.activityConfiguration, shop.data.model).template === "food"
  const filters = catalogFilters(request.search)
  const catalog = await loadPublicCatalog(request.handle, filters, request.search.cursor, request.handoff)
  if (catalog.status !== "ready") return unavailable()
  return publicMetadata(t(props.provider ? "provider:catalog.namedTitle" : food ? "shops:food.namedMenu" : "shops:catalog.namedTitle", { name: shop.data.name }), t(props.provider ? "provider:catalog.descriptionMeta" : "shops:catalog.descriptionMeta"), props.provider ? routes.publicProviderCatalog(request.handle) : routes.publicShopCatalog(request.handle), !request.search.cursor && Object.keys(filters).length === (props.provider ? 1 : 0))
}

export async function PublicCatalogScreen(props: Props) {
  const { handle, search, handoff } = await input(props)
  if (!handle || !search) notFound()
  const locale = await getPublicLocale()
  const { t } = getAppT(locale)
  const shop = await loadPublicStorefront(handle, handoff)
  if (shop.status !== "ready") return <PublicShell viewer={shop.status}><PublicStatus status={shop.status} locale={locale} /></PublicShell>
  if (!shop.data) notFound()
  const food = !props.provider && effectiveActivityConfiguration(shop.data.activityConfiguration, shop.data.model).template === "food"
  const filters = catalogFilters(search)
  const catalog = await loadPublicCatalog(handle, filters, search.cursor, handoff)
  if (catalog.status !== "ready") return <PublicShell viewer={catalog.status}><PublicStatus status={catalog.status} locale={locale} /></PublicShell>
  const translate = (key: string, options?: Record<string, unknown>) => t(`shops:${key}`, options)
  return <PublicShell viewer={catalog.viewer} specialized={{ kind: props.provider ? "provider_catalog" : "catalog", handle }} food={food}><div className="mp-page mp-copy mx-auto w-full max-w-5xl"><header className="mp-page-header"><h1 className="mp-title">{t(props.provider ? "provider:catalog.namedTitle" : food ? "shops:food.namedMenu" : "shops:catalog.namedTitle", { name: shop.data.name })}</h1><Link href={props.provider ? routes.publicProvider(handle) : routes.publicStorefront(handle)} prefetch={false} className={`${PUBLIC_LINK} justify-self-start`}>{t(props.provider ? "provider:catalog.backToProvider" : "shops:catalog.backToShop")}</Link></header><PublicCatalogNavigation handle={handle} search={search} snapshotId={crypto.randomUUID()} provider={props.provider}><CatalogFiltersForm key={JSON.stringify(filters)} handle={handle} filters={filters} collections={catalog.data.collections} audience="public" provider={props.provider} />{catalog.data.indexStatus === "building" ? <p role="status" className="text-sm text-muted-foreground">{t("shops:catalog.indexBuilding")}</p> : null}{catalog.data.indexStatus !== "building" || catalog.data.page.length ? <CatalogGrid page={catalog.data} audience="public" locale={locale} t={translate} /> : null}{catalog.data.page.length === 0 && catalog.data.indexStatus !== "building" ? <p className="text-sm text-muted-foreground">{t("shops:catalog.publicConsentHint")}</p> : null}<CatalogPagination page={catalog.data} handle={handle} audience="public" filters={filters} cursor={search.cursor} t={translate} provider={props.provider} /></PublicCatalogNavigation></div></PublicShell>
}

export async function PublicOfferMetadata(props: Props) {
  const locale = await getPublicLocale()
  const { t } = getAppT(locale)
  const { handle, offerRef, handoff } = await input(props)
  const result = handle && offerRef ? await loadPublicOffer(handle, offerRef, handoff) : null
  if (result?.status !== "ready" || !result.data) return publicMetadata(t("shops:catalog.unavailableTitle"), t("shops:catalog.offerUnavailable"), routes.home(), false)
  if (props.provider && result.data.kind !== "service") return publicMetadata(t("shops:catalog.unavailableTitle"), t("shops:catalog.offerUnavailable"), routes.home(), false)
  return publicMetadata(result.data.title, result.data.description.replace(/\s+/g, " ").slice(0, 180), props.provider ? routes.publicProviderOffer(result.data.shopHandle, result.data.offerRef) : routes.publicShopOffer(result.data.shopHandle, result.data.offerRef))
}

export async function PublicOfferScreen(props: Props) {
  const { handle, offerRef, handoff, selection } = await input(props)
  if (!handle || !offerRef) notFound()
  const locale = await getPublicLocale()
  const { t } = getAppT(locale)
  const result = await loadPublicOffer(handle, offerRef, handoff)
  if (result.status !== "ready") return <PublicShell viewer={result.status}><PublicStatus status={result.status} locale={locale} /></PublicShell>
  if (!result.data) notFound()
  if (props.provider && result.data.kind !== "service") notFound()
  const shop = !props.provider ? await loadPublicStorefront(handle, handoff) : null
  if (shop?.status === "refused" || shop?.status === "handoff") return <PublicShell viewer={shop.status}><PublicStatus status={shop.status} locale={locale} /></PublicShell>
  const food = shop?.status === "ready" && shop.data ? effectiveActivityConfiguration(shop.data.activityConfiguration, shop.data.model).template === "food" : false
  const contact = { kind: "shop_contact" as const, handle: result.data.shopHandle, offerRef: result.data.offerRef }
  const contactHref = result.viewer === "authenticated" ? routes.shopContact(contact.handle, contact.offerRef) : routes.signIn(undefined, undefined, undefined, contact)
  return <PublicShell viewer={result.viewer} specialized={props.provider ? { kind: "service_offer", handle, offerRef } : { kind: "offer", handle, offerRef, ...(selection?.variantRef ? { variantRef: selection.variantRef } : {}), ...(selection?.quantity !== undefined ? { quantity: selection.quantity } : {}) }} food={food}><div className="mp-page mp-copy mx-auto w-full max-w-5xl"><Link href={props.provider ? routes.publicProviderCatalog(handle) : routes.publicShopCatalog(handle)} prefetch={false} className={`${PUBLIC_LINK} justify-self-start`}>{t(props.provider ? "provider:actions.catalog" : food ? "shops:food.backToMenu" : "shops:catalog.backToCatalog")}</Link><OfferDetails offer={result.data} audience="public" locale={locale} t={(key, options) => t(`shops:${key}`, options)} providerT={(key, options) => t(`provider:${key}`, options)} publicActionSlot={<>{result.data.kind === "service" ? <Link href={result.viewer === "authenticated" ? routes.providerOffer(handle, offerRef) : routes.signIn(undefined, undefined, undefined, undefined, { kind: "service_offer", handle, offerRef })} prefetch={false} className={buttonClassName("commerce", "justify-self-start")}>{t("provider:actions.openOptions")}</Link> : <PublicOfferSelection offer={result.data} viewer={result.viewer} initialSelection={selection} />}{result.data.actions.contact && !result.data.offerRef.startsWith("demo:offer:") ? <Link href={contactHref} prefetch={false} className={buttonClassName("message", "justify-self-start")}>{t("shops:contact.ask")}</Link> : null}</>} /></div></PublicShell>
}
