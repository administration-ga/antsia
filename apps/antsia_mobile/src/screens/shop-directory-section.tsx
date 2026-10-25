import { api } from "@antsia/api/engine"
import { useQuery } from "convex/react"
import { useState } from "react"
import { Keyboard, ScrollView, View } from "react-native"
import { useNativeAppearance } from "../appearance"
import { BusinessImage, BusinessPager } from "../components/business-media"
import { Action, Card, Field, Label, QueryBoundary, RuntimeNotice, Status, useNativeGuard } from "../components/ui"
import { NATIVE_BUSINESS_PAGE_SIZE, nativeBusinessAdvance, nativeBusinessCanAdvance, nativeBusinessHandle, nativeBusinessPrevious, nativeBusinessQuery, type NativeBusinessFilters } from "../lib/native-business"
import { BusinessOfferCard } from "./offer-screen"

type DirectoryProps = { mode: "shops" | "services"; onOpenShop: (handle: string) => void; onOpenPage: (handle: string) => void }
function MyShops({ onOpenShop, onOpenPage }: Pick<DirectoryProps, "onOpenShop" | "onOpenPage">) {
  const guard = useNativeGuard(), { t } = useNativeAppearance()
  const result = useQuery(api.modules.shops.shops.myShops, guard.canRead ? { networkId: guard.runtime.networkId } : "skip")
  if (!guard.canRead) return null
  if (result === undefined) return <Status label={t("mobile.business.loading")} busy />
  if (!result.items.length) return null
  return <View style={{ gap: 8 }}>
    <Label strong accessibilityRole="header">{t("mobile.business.myShops")}</Label>
    {result.items.slice(0, 24).map(shop => {
      const handle = shop.pageHandle, validHandle = nativeBusinessHandle(handle)
      return <Card key={String(shop.shopId)}>
        <View style={{ width: 72 }}><BusinessImage url={shop.logoUrl} altText={shop.name} width={1} height={1} /></View>
        <Label strong>{shop.name ?? t("mobile.business.draftShop")}</Label>
        <Label muted>{t("mobile.business.managed")}</Label>
        {validHandle && shop.storefront === "published" ? <Action label={t("mobile.business.openShop")} disabled={!guard.canAct} onPress={() => { if (guard.current()) onOpenShop(handle) }} /> : <Label muted>{t("mobile.business.draftShop")}</Label>}
        {validHandle ? <Action label={t("mobile.business.openPage")} disabled={!guard.canAct} onPress={() => { if (guard.current()) onOpenPage(handle) }} /> : null}
      </Card>
    })}
    {result.truncated || result.items.length > 24 ? <Label muted>{t("mobile.business.windowLimit")}</Label> : null}
  </View>
}
function StorefrontDirectory({ onOpenShop, onOpenPage }: Pick<DirectoryProps, "onOpenShop" | "onOpenPage">) {
  const guard = useNativeGuard(), { t } = useNativeAppearance(), [cursors, setCursors] = useState<(string | null)[]>([null])
  const cursor = cursors[cursors.length - 1] ?? null
  const result = useQuery(api.modules.shops.shops.directory, guard.canRead ? { networkId: guard.runtime.networkId, paginationOpts: { cursor, numItems: NATIVE_BUSINESS_PAGE_SIZE } } : "skip")
  if (!guard.canRead) return null
  if (result === undefined) return <Status label={t("mobile.business.loading")} busy />
  const canNext = nativeBusinessCanAdvance(cursors, result.continueCursor, result.isDone)
  return <View style={{ gap: 8 }}>
    <Label strong accessibilityRole="header">{t("mobile.business.directory")}</Label>
    {!result.page.length ? <Label muted>{t(result.isDone ? "mobile.business.empty" : "mobile.business.filteredWindow")}</Label> : null}
    {result.page.slice(0, NATIVE_BUSINESS_PAGE_SIZE).map(shop => {
      const valid = nativeBusinessHandle(shop.handle)
      return <Card key={shop.handle}>
        <BusinessImage url={shop.bannerUrl ?? shop.logoUrl} altText={shop.name} />
        <Label strong accessibilityRole="header">{shop.name}</Label>
        {shop.specialty ? <Label>{shop.specialty}</Label> : null}
        {shop.serviceArea ? <Label muted>{t("mobile.business.serviceArea") + " · " + shop.serviceArea}</Label> : null}
        {shop.hours ? <Label muted>{t("mobile.business.hours") + " · " + shop.hours}</Label> : null}
        <Action label={t("mobile.business.openShop")} accessibilityLabel={`${t("mobile.business.openShop")} · ${shop.name}`} disabled={!guard.canAct || !valid} onPress={() => { if (guard.current() && valid) onOpenShop(shop.handle) }} />
        <Action label={t("mobile.business.openPage")} accessibilityLabel={`${t("mobile.business.openPage")} · ${shop.name}`} disabled={!guard.canAct || !valid} onPress={() => { if (guard.current() && valid) onOpenPage(shop.handle) }} />
      </Card>
    })}
    <BusinessPager previous={cursors.length > 1} next={canNext} limited={!result.isDone && !canNext} onPrevious={() => setCursors(previous => nativeBusinessPrevious(previous))} onNext={() => setCursors(previous => nativeBusinessAdvance(previous, result.continueCursor, result.isDone))} />
  </View>
}
function SearchWindow({ filters, onOpenShop }: { filters: NativeBusinessFilters; onOpenShop: DirectoryProps["onOpenShop"] }) {
  const guard = useNativeGuard(), { t } = useNativeAppearance(), [cursors, setCursors] = useState<(string | null)[]>([null])
  const cursor = cursors[cursors.length - 1] ?? null
  const result = useQuery(api.modules.shops.marketplace.search, guard.canRead ? { networkId: guard.runtime.networkId, ...filters, paginationOpts: { cursor, numItems: NATIVE_BUSINESS_PAGE_SIZE } } : "skip")
  if (!guard.canRead) return null
  if (result === undefined) return <Status label={t("mobile.business.loading")} busy />
  const canNext = nativeBusinessCanAdvance(cursors, result.continueCursor, result.isDone)
  return <View style={{ gap: 8 }}>
    <Status label={result.indexStatus === "building" ? t("mobile.business.building") : ""} busy={result.indexStatus === "building"} />
    {!result.page.length ? <Label muted>{t(result.filteredWindow || !result.isDone ? "mobile.business.filteredWindow" : "mobile.business.empty")}</Label> : null}
    {result.page.slice(0, NATIVE_BUSINESS_PAGE_SIZE).map(offer => <BusinessOfferCard key={JSON.stringify([offer.shopHandle, offer.offerRef])} offer={offer} onOpenShop={onOpenShop} />)}
    <BusinessPager previous={cursors.length > 1} next={canNext} limited={!result.isDone && !canNext} onPrevious={() => setCursors(previous => nativeBusinessPrevious(previous))} onNext={() => setCursors(previous => nativeBusinessAdvance(previous, result.continueCursor, result.isDone))} />
  </View>
}
function DemoSelection({ filters, onOpenShop }: { filters: NativeBusinessFilters; onOpenShop: DirectoryProps["onOpenShop"] }) {
  const guard = useNativeGuard(), { t } = useNativeAppearance(), [page, setPage] = useState(0)
  const result = useQuery(api.modules.shops.marketplace.demoSelection, guard.canRead ? { networkId: guard.runtime.networkId, ...filters } : "skip")
  if (!guard.canRead) return null
  if (result === undefined) return <Status label={t("mobile.business.loading")} busy />
  if (!result.length) return null
  // The published query is bounded to 40 synthetic offers; no local copy survives its live replacement.
  const items = result.slice(0, 40), pages = Math.ceil(items.length / NATIVE_BUSINESS_PAGE_SIZE)
  const current = Math.min(page, Math.max(0, pages - 1))
  return <View style={{ gap: 8 }}>
    <Label strong accessibilityRole="header">{t("mobile.business.demoTitle")}</Label><Label muted>{t("mobile.business.demoNotice")}</Label>
    {items.slice(current * NATIVE_BUSINESS_PAGE_SIZE, (current + 1) * NATIVE_BUSINESS_PAGE_SIZE).map(offer => <BusinessOfferCard key={JSON.stringify([offer.shopHandle, offer.offerRef])} offer={offer} onOpenShop={onOpenShop} />)}
    <BusinessPager previous={current > 0} next={current + 1 < pages} limited={result.length > 40} onPrevious={() => setPage(Math.max(0, current - 1))} onNext={() => setPage(Math.min(pages - 1, current + 1))} />
  </View>
}
function DirectoryBody({ mode, onOpenShop, onOpenPage }: DirectoryProps) {
  const guard = useNativeGuard(), { t } = useNativeAppearance()
  const [draft, setDraft] = useState(""), [query, setQuery] = useState(""), [invalid, setInvalid] = useState(false)
  const filters: NativeBusinessFilters = { kind: mode === "shops" ? "product" : "service", ...(query ? { query } : {}), sort: query ? "relevance" : "newest" }
  const key = JSON.stringify([guard.owner, mode, filters])
  const submit = () => {
    if (!guard.current()) return
    const value = nativeBusinessQuery(draft)
    setInvalid(value === null)
    if (value !== null) { setQuery(value); Keyboard.dismiss() }
  }
  if (!guard.canRead) return <RuntimeNotice />
  return <ScrollView automaticallyAdjustKeyboardInsets keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" style={{ flex: 1 }} contentContainerStyle={{ gap: 12, paddingBottom: 24 }} scrollEnabled={guard.canAct}>
    <RuntimeNotice />
    <Label strong accessibilityRole="header">{t(mode === "shops" ? "mobile.business.shopsTitle" : "mobile.business.servicesTitle")}</Label>
    <MyShops onOpenShop={onOpenShop} onOpenPage={onOpenPage} />
    {mode === "shops" ? <StorefrontDirectory onOpenShop={onOpenShop} onOpenPage={onOpenPage} /> : null}
    <Label strong accessibilityRole="header">{t("mobile.business.catalog")}</Label>
    <Field label={t("mobile.business.search")} value={draft} maxLength={120} disabled={!guard.canAct} error={invalid ? t("mobile.business.invalidSearch") : undefined} onChangeText={value => { if (guard.current()) { setDraft(value); setInvalid(false) } }} returnKeyType="search" onSubmit={submit} />
    <Action label={t("mobile.business.searchSubmit")} disabled={!guard.canAct} onPress={submit} />
    {query ? <Action label={t("mobile.business.clearFilters")} disabled={!guard.canAct} onPress={() => { if (guard.current()) { setDraft(""); setQuery(""); setInvalid(false) } }} /> : null}
    <SearchWindow key={`search:${key}`} filters={filters} onOpenShop={onOpenShop} />
    <DemoSelection key={`demo:${key}`} filters={filters} onOpenShop={onOpenShop} />
  </ScrollView>
}
export function ShopDirectorySection(props: DirectoryProps) {
  const guard = useNativeGuard(), { t } = useNativeAppearance(), [version, setVersion] = useState(0)
  const key = JSON.stringify([guard.owner, props.mode, version])
  return <View style={{ flex: 1, gap: 8 }}><Action label={t("mobile.business.refresh")} disabled={!guard.canAct} onPress={() => { if (guard.current()) setVersion(value => value + 1) }} /><QueryBoundary key={key} resetKey={key} fallback={<Card><Status label={t("mobile.business.error")} error /></Card>}><DirectoryBody {...props} /></QueryBoundary></View>
}
