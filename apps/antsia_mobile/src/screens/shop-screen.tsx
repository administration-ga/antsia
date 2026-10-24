import { api } from "@antsia/api/engine"
import { useQuery } from "convex/react"
import type { FunctionReturnType } from "convex/server"
import { useState } from "react"
import { ScrollView, View } from "react-native"
import { useNativeAppearance } from "../appearance"
import { BusinessImage, BusinessPager } from "../components/business-media"
import { Action, Card, Field, Label, QueryBoundary, RuntimeNotice, Screen, Status, useNativeGuard } from "../components/ui"
import { NATIVE_BUSINESS_PAGE_SIZE, nativeBusinessAdvance, nativeBusinessCanAdvance, nativeBusinessHandle, nativeBusinessMoney, nativeBusinessPrevious, nativeBusinessQuery, nativeBusinessText, type NativeBusinessFilters, type NativeStorefront } from "../lib/native-business"
import { NativePostCard } from "./feed-screen"
import { BusinessOfferCard } from "./offer-screen"

type ShopScreenProps = { handle: string; onOpenOffer: (handle: string, offerRef: string) => void; onOpenPage: (handle: string) => void; onOpenPost: (id: string) => void }
type PagePosts = FunctionReturnType<typeof api.modules.pages.pages.pagePosts>
type PostsCursor = NonNullable<PagePosts["nextCursor"]>
type Sort = "newest" | "price_asc" | "price_desc"
const sorts: readonly { value: Sort; label: string }[] = [{ value: "newest", label: "newest" }, { value: "price_asc", label: "priceAscending" }, { value: "price_desc", label: "priceDescending" }]

function CatalogWindow({ handle, filters, onOpenOffer, onCollection }: { handle: string; filters: NativeBusinessFilters; onOpenOffer: ShopScreenProps["onOpenOffer"]; onCollection: (collectionRef: string) => void }) {
  const guard = useNativeGuard(), { t } = useNativeAppearance()
  const [cursors, setCursors] = useState<(string | null)[]>([null])
  const cursor = cursors[cursors.length - 1] ?? null
  const page = useQuery(api.modules.shops.catalog.list, guard.canRead ? { networkId: guard.runtime.networkId, handle, ...filters, paginationOpts: { cursor, numItems: NATIVE_BUSINESS_PAGE_SIZE } } : "skip")
  if (!guard.canRead) return null
  if (page === undefined) return <Status label={t("mobile.business.loading")} busy />
  const canNext = nativeBusinessCanAdvance(cursors, page.continueCursor, page.isDone)
  return <View style={{ gap: 8 }}>
    {page.collections.length ? <View style={{ gap: 8 }}><Label strong>{t("mobile.business.collections")}</Label><View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{page.collections.map(collection => <Action key={collection.collectionRef} label={collection.label} selected={filters.collectionRef === collection.collectionRef} disabled={!guard.canAct} onPress={() => { if (guard.current()) onCollection(collection.collectionRef) }} />)}</View></View> : null}
    <Status label={page.indexStatus === "building" ? t("mobile.business.building") : ""} busy={page.indexStatus === "building"} />
    {!page.page.length ? <Label muted>{t(page.filteredWindow || !page.isDone ? "mobile.business.filteredWindow" : "mobile.business.empty")}</Label> : null}
    {page.page.slice(0, NATIVE_BUSINESS_PAGE_SIZE).map(offer => <BusinessOfferCard key={JSON.stringify([offer.shopHandle, offer.offerRef])} offer={offer} onOpenOffer={onOpenOffer} />)}
    <BusinessPager previous={cursors.length > 1} next={canNext} limited={!page.isDone && !canNext} onPrevious={() => setCursors(previous => nativeBusinessPrevious(previous))} onNext={() => setCursors(previous => nativeBusinessAdvance(previous, page.continueCursor, page.isDone))} />
  </View>
}
function Catalog({ handle, onOpenOffer }: Pick<ShopScreenProps, "handle" | "onOpenOffer">) {
  const guard = useNativeGuard(), { t } = useNativeAppearance()
  const [kind, setKind] = useState<"all" | "product" | "service">("all"), [draft, setDraft] = useState(""), [query, setQuery] = useState(""), [invalid, setInvalid] = useState(false), [collectionRef, setCollection] = useState<string | undefined>(), [sort, setSort] = useState<Sort>("newest")
  const filters: NativeBusinessFilters = { ...(kind === "all" ? {} : { kind }), ...(query ? { query } : {}), ...(collectionRef ? { collectionRef } : {}), sort: query ? "relevance" : sort }
  const key = JSON.stringify([guard.owner, handle, filters])
  return <View style={{ gap: 12 }}>
    <Label strong accessibilityRole="header">{t("mobile.business.catalog")}</Label>
    <Field label={t("mobile.business.search")} value={draft} maxLength={120} disabled={!guard.canAct} error={invalid ? t("mobile.business.invalidSearch") : undefined} onChangeText={value => { if (guard.current()) { setDraft(value); setInvalid(false) } }} />
    <Action label={t("mobile.business.searchSubmit")} disabled={!guard.canAct} onPress={() => { if (!guard.current()) return; const value = nativeBusinessQuery(draft); setInvalid(value === null); if (value !== null) { setQuery(value); setCollection(undefined) } }} />
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{(["all", "product", "service"] as const).map(value => <Action key={value} label={t(`mobile.business.${value === "product" ? "products" : value === "service" ? "servicesTitle" : "all"}`)} selected={kind === value} accessibilityRole="radio" checked={kind === value} disabled={!guard.canAct} onPress={() => { if (guard.current()) { setKind(value); setCollection(undefined) } }} />)}</View>
    {!query ? <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{sorts.map(item => <Action key={item.value} label={t(`mobile.business.${item.label}`)} accessibilityRole="radio" checked={sort === item.value} disabled={!guard.canAct} onPress={() => { if (guard.current()) setSort(item.value) }} />)}</View> : null}
    {query || collectionRef || kind !== "all" || sort !== "newest" ? <Action label={t("mobile.business.clearFilters")} disabled={!guard.canAct} onPress={() => { if (guard.current()) { setDraft(""); setQuery(""); setInvalid(false); setKind("all"); setCollection(undefined); setSort("newest") } }} /> : null}
    <CatalogWindow key={key} handle={handle} filters={filters} onOpenOffer={onOpenOffer} onCollection={setCollection} />
  </View>
}
function ShopPosts({ handle, onOpenPost, onOpenPage, onOpenOffer }: ShopScreenProps) {
  const guard = useNativeGuard(), { t } = useNativeAppearance(), [cursors, setCursors] = useState<(PostsCursor | null)[]>([null])
  const cursor = cursors[cursors.length - 1] ?? null
  const page = useQuery(api.modules.pages.pages.pagePosts, guard.canRead ? { networkId: guard.runtime.networkId, handle, limit: NATIVE_BUSINESS_PAGE_SIZE, ...(cursor ? { cursor } : {}) } : "skip")
  if (!guard.canRead) return null
  if (page === undefined) return <Status label={t("mobile.business.loading")} busy />
  const canNext = nativeBusinessCanAdvance(cursors, page.nextCursor)
  return <View style={{ gap: 8 }}>
    <Label strong accessibilityRole="header">{t("mobile.business.publications")}</Label>
    {!page.items.length ? <Label muted>{t(page.nextCursor ? "mobile.business.filteredWindow" : "mobile.business.empty")}</Label> : null}
    {page.items.slice(0, NATIVE_BUSINESS_PAGE_SIZE).map(post => <NativePostCard key={String(post._id)} post={post} active={false} compact onOpenPost={id => { if (guard.current()) onOpenPost(String(id)) }} onOpenPage={onOpenPage} onOpenOffer={onOpenOffer} />)}
    <BusinessPager previous={cursors.length > 1} next={canNext} limited={page.nextCursor !== null && !canNext} onPrevious={() => setCursors(previous => nativeBusinessPrevious(previous))} onNext={() => setCursors(previous => nativeBusinessAdvance(previous, page.nextCursor))} />
  </View>
}
function StorefrontTerms({ shop }: { shop: NativeStorefront }) {
  const { t, locale } = useNativeAppearance(), terms = shop.storefrontTerms
  if (!terms) return null
  return <Card>
    {terms.pickup ? <View style={{ gap: 4 }}><Label strong>{t("mobile.business.pickup")}</Label>{terms.pickup.points.map(point => <Label key={point.establishmentRef}>{point.label}</Label>)}</View> : null}
    {terms.delivery ? <View style={{ gap: 4 }}><Label strong>{t("mobile.business.delivery")}</Label><Label>{terms.delivery.label}</Label><Label>{terms.delivery.localities.join(" · ")}</Label><Label>{nativeBusinessMoney(terms.delivery.fee.amount, locale) ?? t("mobile.business.priceUnavailable")}</Label>{terms.delivery.leadTimeDays !== undefined ? <Label muted>{nativeBusinessText(t, "leadTime", { days: terms.delivery.leadTimeDays })}</Label> : null}</View> : null}
    {terms.fees?.map((fee, index) => <Label key={index}>{fee.label + " · " + (nativeBusinessMoney(fee.amount.amount, locale) ?? t("mobile.business.priceUnavailable"))}</Label>)}
    {terms.returns ? <View style={{ gap: 4 }}><Label strong>{t("mobile.business.returns")}</Label><Label>{terms.returns.summary}</Label></View> : null}
    {terms.warranty ? <View style={{ gap: 4 }}><Label strong>{t("mobile.business.warranty")}</Label><Label>{terms.warranty.summary}</Label></View> : null}
  </Card>
}
function ShopBody({ handle, onOpenOffer, onOpenPage, onOpenPost }: ShopScreenProps) {
  const guard = useNativeGuard(), { t } = useNativeAppearance()
  const shop = useQuery(api.modules.shops.shops.storefront, guard.canRead && nativeBusinessHandle(handle) ? { networkId: guard.runtime.networkId, handle } : "skip")
  if (!guard.canRead) return <RuntimeNotice />
  if (!nativeBusinessHandle(handle)) return <Label>{t("mobile.business.unavailable")}</Label>
  if (shop === undefined) return <Status label={t("mobile.business.loading")} busy />
  if (shop === null || shop.handle !== handle) return <Label>{t("mobile.business.unavailable")}</Label>
  const badgeKey = shop.badge === "official" ? "badgeOfficial" : shop.badge === "verified" ? "badgeVerified" : shop.badge === "public_agent" ? "badgePublicAgent" : "badgeCommunity"
  return <ScrollView contentContainerStyle={{ gap: 12, paddingBottom: 24 }} scrollEnabled={guard.canAct}>
    <RuntimeNotice />
    <Card>
      <BusinessImage url={shop.bannerUrl} altText={shop.name} width={2} height={1} />
      <View style={{ width: 72 }}><BusinessImage url={shop.logoUrl} altText={shop.name} width={1} height={1} /></View>
      <Label strong accessibilityRole="header">{shop.name}</Label><Label muted>{t(`mobile.business.${badgeKey}`)}</Label>
      {shop.viewer.manages ? <Label muted>{t("mobile.business.managed")}</Label> : null}
      {shop.description ? <View style={{ gap: 4 }}><Label strong>{t("mobile.business.about")}</Label><Label>{shop.description}</Label></View> : null}
      {shop.specialty ? <Label>{t("mobile.business.specialty") + " · " + shop.specialty}</Label> : null}
      {shop.serviceArea ? <Label>{t("mobile.business.serviceArea") + " · " + shop.serviceArea}</Label> : null}
      {shop.hours ? <Label>{t("mobile.business.hours") + " · " + shop.hours}</Label> : null}
      <Action label={t("mobile.business.openPage")} disabled={!guard.canAct} onPress={() => { if (guard.current()) onOpenPage(handle) }} />
    </Card>
    <StorefrontTerms shop={shop} />
    {shop.blocks.includes("catalog") || shop.blocks.includes("services") ? <Catalog handle={handle} onOpenOffer={onOpenOffer} /> : null}
    {shop.blocks.includes("publications") ? <ShopPosts handle={handle} onOpenPost={onOpenPost} onOpenPage={onOpenPage} onOpenOffer={onOpenOffer} /> : null}
  </ScrollView>
}
export function ShopScreen(props: ShopScreenProps) {
  const guard = useNativeGuard(), { t } = useNativeAppearance(), [version, setVersion] = useState(0)
  const key = JSON.stringify([guard.owner, props.handle, version])
  return <Screen title={t("mobile.business.openShop")}>
    <Action label={t("mobile.business.refresh")} disabled={!guard.canAct} onPress={() => { if (guard.current()) setVersion(value => value + 1) }} />
    <QueryBoundary key={key} resetKey={key} fallback={<Card><Status label={t("mobile.business.error")} error /></Card>}><ShopBody {...props} /></QueryBoundary>
  </Screen>
}
