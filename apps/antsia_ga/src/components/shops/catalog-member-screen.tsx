"use client"

import { api } from "@antsia/api/engine"
import { useAuthenticatedConvexQuery } from "@antsia/api/hooks"
import { useNetwork } from "@antsia/api/network"
import { effectiveActivityConfiguration } from "@antsia/social-domain/activityConfiguration"
import { Sheet, SheetBody, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@antsia/ui/sheet"
import { LayoutGrid, List, SlidersHorizontal } from "lucide-react"
import Link from "next/link"
import { useTranslation } from "react-i18next"
import { useRouter, useSearchParams } from "next/navigation"
import { Suspense, useEffect, useState } from "react"

import { OfferQuickAdd } from "@/components/cart/offer-quick-add"
import { Button } from "@/components/shared/controls"
import { Rail } from "@/components/shared/rail"
import { useMinWidth } from "@/components/shared/use-min-width"
import { CATALOG_PAGE_SIZE, catalogFilters, catalogSearchFromParams, type CatalogFilters, type CatalogSearch } from "@/lib/catalog-search"
import { MARKETPLACE_FACETS } from "@/lib/marketplace-search"
import { routes } from "@/lib/routes"
import type { OfferInitialSelection } from "@/lib/offer-variant-selection"
import { CatalogFiltersForm } from "./catalog-filters"
import { CatalogGrid, CatalogPagination } from "./catalog-grid"
import type { CatalogOffer, CatalogPage } from "./catalog-model"
import { OfferCard, OfferDetails } from "./offer-card"
import { CheckoutPrepareLink } from "../checkout/checkout-prepare-link"
import { OfferCartActions, OfferShareButton } from "../cart/offer-cart-actions"
import { ServiceOfferActions } from "../services/service-offer-actions"
import { ShopFrame, ShopLink, ShopQueryFailure } from "./shop-ui"
import { StorefrontTerms } from "./storefront-terms"

/** Les collections d'une boutique qui défilent sur sa vitrine, au plus quatre (les autres restent dans le catalogue). */
const VITRINE_COLLECTIONS_MAX = 4
const VIEW_STORAGE_KEY = "antsia:catalog-view"
const TOOL_CLASS = "inline-flex min-h-11 items-center gap-2 whitespace-nowrap rounded-[var(--ui2-button-radius)] bg-[var(--esp-chip-bg,var(--muted))] px-4 text-sm font-semibold text-foreground hover:brightness-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-[current=page]:bg-[var(--role-commerce-fill,var(--primary-fill))] aria-[current=page]:text-[color:var(--role-commerce-on,var(--primary-fill-on))] aria-pressed:bg-[var(--role-commerce-fill,var(--primary-fill))] aria-pressed:text-[color:var(--role-commerce-on,var(--primary-fill-on))]"

/** Le gabarit nomme le catalogue, sans accorder de droit supplémentaire. */
function useFoodCatalog(handle: string, provider: boolean) {
  const { networkId } = useNetwork()
  const query = useAuthenticatedConvexQuery(api.modules.shops.shops.storefront, provider ? "skip" : { networkId, handle })
  return !provider && !query.isError && query.data ? effectiveActivityConfiguration(query.data.activityConfiguration, query.data.model).template === "food" : false
}

export function MemberCatalogScreen({ handle, search, provider = false }: { handle: string; search: CatalogSearch | null; provider?: boolean }) {
  const { t } = useTranslation("shops")
  const { t: providerT } = useTranslation("provider")
  const food = useFoodCatalog(handle, provider)
  return <ShopFrame title={provider ? providerT("catalog.title") : t(food ? "food.menu" : "catalog.title")}><ShopLink href={provider ? routes.provider(handle) : routes.storefront(handle)}>{provider ? providerT("catalog.backToProvider") : t("catalog.backToShop")}</ShopLink><Suspense fallback={<p role="status">{t("catalog.loading")}</p>}><MemberCatalogSelection handle={handle} initialSearch={search} provider={provider} /></Suspense></ShopFrame>
}

/** L'URL courante pilote aussi les transitions SPA, sans attendre un nouveau snapshot serveur. */
function MemberCatalogSelection({ handle, initialSearch, provider }: { handle: string; initialSearch: CatalogSearch | null; provider: boolean }) {
  const params = useSearchParams()
  const { networkId, personId } = useNetwork()
  const parsed = params === null ? initialSearch : catalogSearchFromParams(params)
  const search = parsed && (!provider || parsed.kind !== "product") ? { ...parsed, ...(provider ? { kind: "service" as const } : {}) } : null
  return search ? <MemberCatalogWindow key={JSON.stringify([networkId, personId, handle, search])} handle={handle} search={search} provider={provider} /> : <ShopQueryFailure href={provider ? routes.providerCatalog(handle) : routes.shopCatalog(handle)} />
}

/** La présentation choisie (grille ou lignes), gardée pour ce lecteur dans ce navigateur ; la grille par défaut. */
function useCatalogLayout(): ["grid" | "list", (layout: "grid" | "list") => void] {
  const [layout, setLayout] = useState<"grid" | "list">("grid")
  useEffect(() => { try { if (window.localStorage.getItem(VIEW_STORAGE_KEY) === "list") setLayout("list") } catch { /* stockage indisponible : la grille */ } }, [])
  return [layout, next => { setLayout(next); try { window.localStorage.setItem(VIEW_STORAGE_KEY, next) } catch { /* stockage indisponible : choix pour cette page */ } }]
}

function MemberCatalogWindow({ handle, search, preview = false, provider = false }: { handle: string; search: CatalogSearch; preview?: boolean; provider?: boolean }) {
  const { networkId } = useNetwork()
  const food = useFoodCatalog(handle, provider)
  const { t, i18n } = useTranslation("shops")
  const [layout, setLayout] = useCatalogLayout()
  const filters = catalogFilters(search)
  const query = useAuthenticatedConvexQuery(api.modules.shops.catalog.list, { networkId, handle, ...filters, paginationOpts: { cursor: search.cursor, numItems: CATALOG_PAGE_SIZE } })
  if (query.isError) return <div role="alert" className="grid gap-3 rounded-[var(--ui2-card-radius)] border border-[color:var(--esp-surface-border)] bg-card p-4 "><p>{t("catalog.unavailable")}</p><Button variant="outline" pending={query.isFetching} onClick={() => { void query.refetch() }}>{t("common.retry")}</Button></div>
  if (query.isPending || !query.data) return <p role="status" className="text-sm text-muted-foreground">{t("catalog.loading")}</p>
  const page: CatalogPage = query.data
  const translate = (key: string, options?: Record<string, unknown>) => t(key, options)
  return <div className="mp-page" aria-busy={query.isFetching || undefined}>
    {!preview ? <CatalogToolbar handle={handle} filters={filters} collections={page.collections} provider={provider} layout={layout} onLayout={setLayout} /> : null}
    {preview && page.collections.length >= 2 ? page.collections.slice(0, VITRINE_COLLECTIONS_MAX).map(collection => <CollectionRail key={collection.collectionRef} handle={handle} collection={collection} kind={search.kind} provider={provider} />) : null}
    {page.indexStatus === "building" ? <p role="status" className="text-sm text-muted-foreground">{t("catalog.indexBuilding")}</p> : null}
    {page.indexStatus !== "building" || page.page.length ? <CatalogGrid page={page} audience="member" locale={i18n.resolvedLanguage ?? "fr"} t={translate} layout={preview ? "grid" : layout} preview={preview} renderAction={offer => <OfferQuickAdd offer={offer} />} /> : null}
    {page.page.length === 0 && page.indexStatus !== "building" ? <p className="text-sm text-muted-foreground">{t("catalog.publicConsentHint")}</p> : null}
    {preview ? <ShopLink href={provider ? routes.providerCatalog(handle, filters) : routes.shopCatalog(handle, filters)}>{t(food ? "food.seeMenu" : "catalog.openCatalog")}</ShopLink> : <CatalogPagination page={page} handle={handle} audience="member" filters={filters} cursor={search.cursor} t={translate} provider={provider} />}
  </div>
}

/**
 * La barre du catalogue (modèle des ventes privées, 22/10/2026) : « Filtrer » ouvre le formulaire complet dans une
 * feuille ; les collections de la boutique se choisissent en pastilles ; les filtres actifs se retirent d'un geste ;
 * la grille ou les lignes. Aucun total d'offres n'est annoncé : le moteur n'en donne pas.
 */
function CatalogToolbar({ handle, filters, collections, provider, layout, onLayout }: { handle: string; filters: CatalogFilters; collections: CatalogPage["collections"]; provider: boolean; layout: "grid" | "list"; onLayout: (layout: "grid" | "list") => void }) {
  const { t } = useTranslation("shops")
  const { t: marketplaceT } = useTranslation("marketplace")
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const wide = useMinWidth(768)
  const href = (next: CatalogFilters) => provider ? routes.providerCatalog(handle, { ...next, kind: "service" }) : routes.shopCatalog(handle, next)
  const chips: { key: string; label: string; next: CatalogFilters }[] = []
  if (filters.query) chips.push({ key: "query", label: filters.query, next: { ...filters, query: undefined, sort: filters.sort === "relevance" ? undefined : filters.sort } })
  for (const facet of MARKETPLACE_FACETS) for (const value of filters[facet] ?? []) {
    const label = facet === "category" ? t(`catalog.facets.categories.${value}.label`) : facet === "audience" || facet === "serviceMode" ? t(`catalog.facets.choices.${facet}.${value}`) : facet === "commercialMode" ? marketplaceT(`commercialModes.${value}`) : value
    chips.push({ key: `${facet}:${value}`, label, next: { ...filters, [facet]: filters[facet]?.filter(current => current !== value) } })
  }
  for (const field of ["minPrice", "maxPrice"] as const) if (filters[field] !== undefined) chips.push({ key: field, label: `${t(`catalog.filters.${field}`)} : ${filters[field]}`, next: { ...filters, [field]: undefined } })
  for (const field of ["minDurationMinutes", "maxDurationMinutes"] as const) if (filters[field] !== undefined) chips.push({ key: field, label: `${marketplaceT(`filters.${field}`)} : ${filters[field]}`, next: { ...filters, [field]: undefined } })
  const count = chips.length - (filters.query ? 1 : 0)
  return <div className="grid min-w-0 gap-3" data-catalog-toolbar>
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild><button type="button" aria-haspopup="dialog" className={TOOL_CLASS}><SlidersHorizontal aria-hidden className="size-4" />{count ? marketplaceT("home.filterCount", { count }) : marketplaceT("home.filter")}</button></SheetTrigger>
        <SheetContent side={wide ? "right" : "bottom"} closeLabel={marketplaceT("home.close")} className="sm:max-w-md">
          <SheetHeader><SheetTitle>{t("catalog.filters.title")}</SheetTitle></SheetHeader>
          <SheetBody className="overflow-y-auto overscroll-contain px-4 pb-0"><CatalogFiltersForm key={JSON.stringify(filters)} handle={handle} filters={filters} collections={collections} audience="member" provider={provider} variant="sheet" onApplied={() => setOpen(false)} /></SheetBody>
        </SheetContent>
      </Sheet>
      <div role="group" aria-label={t("catalog.layout.label")} className="ml-auto flex items-center gap-1">
        <button type="button" aria-pressed={layout === "grid"} aria-label={t("catalog.layout.grid")} onClick={() => onLayout("grid")} className={`${TOOL_CLASS} size-11 justify-center px-0`}><LayoutGrid aria-hidden className="size-5" /></button>
        <button type="button" aria-pressed={layout === "list"} aria-label={t("catalog.layout.list")} onClick={() => onLayout("list")} className={`${TOOL_CLASS} size-11 justify-center px-0`}><List aria-hidden className="size-5" /></button>
      </div>
    </div>
    {collections.length ? <nav aria-label={t("catalog.collections")} className="min-w-0 overflow-x-auto overscroll-x-contain pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <ul className="flex w-max gap-2">
        <li><Link href={href({ ...filters, collectionRef: undefined })} prefetch={false} aria-current={filters.collectionRef ? undefined : "page"} className={TOOL_CLASS}>{t("catalog.allCollections")}</Link></li>
        {collections.map(collection => <li key={collection.collectionRef}><Link href={href({ ...filters, collectionRef: collection.collectionRef })} prefetch={false} aria-current={filters.collectionRef === collection.collectionRef ? "page" : undefined} className={TOOL_CLASS}>{collection.label}</Link></li>)}
      </ul>
    </nav> : null}
    {chips.length ? <ul aria-label={marketplaceT("filters.active")} className="flex min-w-0 flex-wrap gap-2">{chips.map(chip => <li key={chip.key} className="min-w-0"><button type="button" className={`${TOOL_CLASS} max-w-full whitespace-normal`} aria-label={marketplaceT("filters.remove", { value: chip.label })} onClick={() => router.push(href(chip.next))}><span className="break-words">{chip.label}</span><span aria-hidden>×</span></button></li>)}</ul> : null}
  </div>
}

/** Une collection de la boutique qui défile, avec son lien vers le catalogue filtré ; rien si elle est vide. */
function CollectionRail({ handle, collection, kind, provider }: { handle: string; collection: CatalogPage["collections"][number]; kind?: "product" | "service"; provider: boolean }) {
  const { networkId } = useNetwork()
  const { t, i18n } = useTranslation("shops")
  const query = useAuthenticatedConvexQuery(api.modules.shops.catalog.list, { networkId, handle, collectionRef: collection.collectionRef, ...(kind ? { kind } : {}), paginationOpts: { cursor: null, numItems: CATALOG_PAGE_SIZE } })
  if (query.isError || query.isPending || !query.data?.page.length) return null
  const filters: CatalogFilters = { collectionRef: collection.collectionRef, ...(kind ? { kind } : {}) }
  return <Rail size="product" title={collection.label} level={3} href={provider ? routes.providerCatalog(handle, filters) : routes.shopCatalog(handle, filters)} linkLabel={t("catalog.seeCollection")}>{query.data.page.map((offer, index) => <OfferCard key={offer.offerRef} offer={offer} audience="member" locale={i18n.resolvedLanguage ?? "fr"} t={(key, options) => t(key, options)} eager={index === 0} seller={false} action={<OfferQuickAdd offer={offer} />} />)}</Rail>
}

/** `title` : le nom du bloc quand le gabarit en donne un (« Menu » d'une adresse « Alimentation et restauration »). */
export function MemberCatalogPreview({ handle, kind, title }: { handle: string; kind?: "product" | "service"; title?: string }) {
  const { networkId, personId } = useNetwork()
  const { t } = useTranslation("shops")
  return <section aria-labelledby={`member-shop-catalog-${kind ?? "all"}`} className="grid min-w-0 gap-4"><h2 id={`member-shop-catalog-${kind ?? "all"}`} className="mp-subtitle">{title ?? t(kind === "service" ? "blocks.services" : "catalog.title")}</h2><MemberCatalogWindow key={JSON.stringify([networkId, personId, handle])} handle={handle} search={{ cursor: null, ...(kind ? { kind } : {}) }} preview /></section>
}

export function MemberOfferScreen({ handle, offerRef, initialSelection, provider = false }: { handle: string; offerRef: string; initialSelection?: OfferInitialSelection; provider?: boolean }) {
  const { networkId, personId } = useNetwork()
  return <MemberOfferQuery key={JSON.stringify([networkId, personId, handle, offerRef, initialSelection])} handle={handle} offerRef={offerRef} initialSelection={initialSelection} provider={provider} />
}
function MemberOfferQuery({ handle, offerRef, initialSelection, provider }: { handle: string; offerRef: string; initialSelection?: OfferInitialSelection; provider: boolean }) {
  const { networkId } = useNetwork()
  const food = useFoodCatalog(handle, provider)
  const { t, i18n } = useTranslation("shops")
  const { t: providerT } = useTranslation("provider")
  const catalogHref = provider ? routes.providerCatalog(handle) : routes.shopCatalog(handle)
  const query = useAuthenticatedConvexQuery(api.modules.shops.catalog.offer, { networkId, handle, offerRef })
  const candidate = !query.isError && !query.isPending ? query.data : null
  const offer = provider && candidate?.kind !== "service" ? null : candidate
  const demo = offer?.offerRef.startsWith("demo:offer:") === true
  // Une fiche lue porte le titre de l'écran (le nom de l'offre en `h1`) ; sinon, le titre générique.
  return <ShopFrame title={provider ? providerT("detail.title") : t("catalog.offerTitle")} header={offer ? null : undefined}><ShopLink href={catalogHref}>{provider ? providerT("actions.catalog") : t(food ? "food.backToMenu" : "catalog.backToCatalog")}</ShopLink>{query.isError ? <ShopQueryFailure href={catalogHref} retry={() => { void query.refetch() }} /> : query.isPending || query.data === undefined ? <p role="status">{t("catalog.loading")}</p> : !offer ? <ShopQueryFailure href={catalogHref} /> : <>
    <OfferDetails offer={offer} audience="member" titleAs="h1" locale={i18n.resolvedLanguage ?? "fr"} t={(key, options) => t(key, options)} providerT={(key, options) => providerT(key, options)} actionSlot={<div className="grid w-full gap-4">{demo ? <p className="text-sm text-muted-foreground">{t("publicActions.demoNotice")}</p> : offer.kind === "service" ? <ServiceOfferActions offer={offer} /> : <OfferCartActions offer={offer} initialSelection={initialSelection} layout="page" />}<div className="flex flex-wrap gap-3">{!demo && offer.actions.contact ? <ShopLink variant="message" href={routes.shopContact(offer.shopHandle, offer.offerRef)}>{t("contact.ask")}</ShopLink> : null}{!demo && offer.kind !== "service" ? <CheckoutPrepareLink handle={offer.shopHandle} offerRef={offer.offerRef} /> : null}<OfferShareButton handle={offer.shopHandle} offerRef={offer.offerRef} kind={offer.kind} /></div></div>} />
    <OfferShopTerms handle={offer.shopHandle} />
    <SameShopRail offer={offer} provider={provider} />
  </>}</ShopFrame>
}

/** Les conditions déclarées par la boutique (retrait, livraison, frais, retours, garantie), sous la fiche. */
function OfferShopTerms({ handle }: { handle: string }) {
  const { networkId } = useNetwork()
  const { t, i18n } = useTranslation("shops")
  const query = useAuthenticatedConvexQuery(api.modules.shops.shops.storefront, { networkId, handle })
  if (query.isError || !query.data) return null
  return <StorefrontTerms value={query.data.storefrontTerms} locale={i18n.resolvedLanguage === "en" ? "en" : "fr"} t={t} />
}

/** « Dans la même boutique » : d'autres offres du même genre, qui défilent ; rien s'il n'y en a pas d'autre. */
function SameShopRail({ offer, provider }: { offer: CatalogOffer; provider: boolean }) {
  const { networkId } = useNetwork()
  const food = useFoodCatalog(offer.shopHandle, provider)
  const { t, i18n } = useTranslation("shops")
  const query = useAuthenticatedConvexQuery(api.modules.shops.catalog.list, { networkId, handle: offer.shopHandle, kind: offer.kind, paginationOpts: { cursor: null, numItems: CATALOG_PAGE_SIZE } })
  const others = !query.isError && query.data ? query.data.page.filter(entry => entry.offerRef !== offer.offerRef) : []
  if (!others.length) return null
  return <Rail size="product" title={t("catalog.sameShop")} href={provider ? routes.providerCatalog(offer.shopHandle) : routes.shopCatalog(offer.shopHandle)} linkLabel={t(food ? "food.seeMenu" : "catalog.openCatalog")}>{others.map(entry => <OfferCard key={entry.offerRef} offer={entry} audience="member" locale={i18n.resolvedLanguage ?? "fr"} t={(key, options) => t(key, options)} seller={false} action={<OfferQuickAdd offer={entry} />} />)}</Rail>
}
