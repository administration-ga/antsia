import { api } from "@antsia/api/engine"
import { useQuery } from "convex/react"
import type { FunctionReturnType } from "convex/server"
import { useCallback, useEffect, useState } from "react"
import { FlatList, Image, View } from "react-native"
import { useNativeAppearance } from "../appearance"
import { Action, Card, Field, Label, QueryBoundary, RuntimeNotice, Status, nativeScope, useNativeGuard } from "../components/ui"
import { canAppendNativeCursor, mergeNativePages, nativeCursorKey } from "../lib/native-pagination"
import { NATIVE_PAGE_SEARCH_MAX, NATIVE_PAGE_WINDOW_SIZE, NATIVE_PAGE_WINDOWS_MAX, nativeAssociationPages, nativeLinkedPageCursors, nativePageSearch } from "../lib/native-pages"

type Directory = FunctionReturnType<typeof api.modules.pages.pages.paginateDiscover>
type OwnPage = FunctionReturnType<typeof api.modules.pages.pages.myPages>[number]
type CardPage = Pick<OwnPage, "pageId" | "handle" | "name" | "logoUrl" | "badge" | "ownerKind" | "country"> & {
  description?: string | null
  city?: string | null
  associationType?: string | null
  followerCount?: number
}

function AssociationCard({ page, onOpenPage }: { page: CardPage; onOpenPage: (handle: string) => void }) {
  const guard = useNativeGuard(), { tokens, t } = useNativeAppearance()
  const [failedLogo, setFailedLogo] = useState<string | null>(null)
  const logoLabel = `${t("mobile.pages.logo")} · ${page.name}`
  return <Card>
    {page.logoUrl && failedLogo !== page.logoUrl ? <Image source={{ uri: page.logoUrl }} alt={logoLabel} accessibilityLabel={logoLabel} resizeMode="contain" onError={() => setFailedLogo(page.logoUrl)} style={{ width: 64, height: 64, borderRadius: tokens.radiusMedia, backgroundColor: tokens.muted }} /> : null}
    <Label strong accessibilityRole="header">{page.name}</Label>
    <Label muted>{t(`mobile.pages.badge.${page.badge}`)}</Label>
    {page.description ? <Label>{page.description}</Label> : null}
    {page.city ? <Label muted>{t("mobile.pages.city") + " · " + page.city}</Label> : null}
    {page.country ? <Label muted>{t("mobile.pages.country") + " · " + page.country}</Label> : null}
    {page.associationType ? <Label muted>{t("mobile.pages.associationType") + " · " + t(`mobile.pages.associationType.${page.associationType}`)}</Label> : null}
    {page.followerCount !== undefined ? <Label muted>{t("mobile.pages.followers") + " · " + page.followerCount}</Label> : null}
    <Action label={t("mobile.pages.openPage")} accessibilityLabel={`${t("mobile.pages.openPage")} · ${page.name}`} disabled={!guard.canAct} onPress={() => { if (guard.current()) onOpenPage(page.handle) }} />
  </Card>
}

function AssociationWindow({ cursor, query, onPage }: { cursor: string | null; query: string; onPage: (key: string, page: Directory | undefined) => void }) {
  const { canRead, canAct, current, runtime } = useNativeGuard()
  const page = useQuery(api.modules.pages.pages.paginateDiscover, canRead ? {
    networkId: runtime.networkId, ownerKind: "association", ...(query ? { query } : {}),
    paginationOpts: { cursor, numItems: NATIVE_PAGE_WINDOW_SIZE },
  } : "skip")
  const key = nativeCursorKey(cursor)
  useEffect(() => { if (current()) onPage(key, page) }, [canAct, current, key, onPage, page])
  return null
}

function AssociationDirectoryBody({ query, onOpenPage }: { query: string; onOpenPage: (handle: string) => void }) {
  const guard = useNativeGuard(), { t } = useNativeAppearance()
  const mine = useQuery(api.modules.pages.pages.myPages, guard.canRead ? { networkId: guard.runtime.networkId } : "skip")
  const [requested, setRequested] = useState<(string | null)[]>([null])
  const [windows, setWindows] = useState<Record<string, Directory | undefined>>({})
  const onPage = useCallback((key: string, page: Directory | undefined) => setWindows(previous => previous[key] === page ? previous : { ...previous, [key]: page }), [])
  const cursors = nativeLinkedPageCursors(requested, cursor => windows[nativeCursorKey(cursor)], page => page.isDone ? null : page.continueCursor || null)
  const owned = nativeAssociationPages(mine ?? [])
  const ownIds = new Set(owned.map(page => String(page.pageId)))
  const items = mergeNativePages(cursors.map(cursor => windows[nativeCursorKey(cursor)]?.page ?? []), page => String(page.pageId), NATIVE_PAGE_WINDOW_SIZE * NATIVE_PAGE_WINDOWS_MAX)
    .filter(page => page.ownerKind === "association" && !ownIds.has(String(page.pageId)))
  const first = windows.first, tail = windows[nativeCursorKey(cursors[cursors.length - 1] ?? null)]
  const next = tail?.isDone === false ? tail.continueCursor || null : null
  const canMore = canAppendNativeCursor(cursors, next, NATIVE_PAGE_WINDOWS_MAX)
  const loadingMore = tail === undefined && cursors.length > 1
  if (!guard.canRead) return <Label>{t("mobile.common.privateUnavailable")}</Label>
  return <View style={{ flex: 1, gap: 8 }}>
    {cursors.map(cursor => <AssociationWindow key={nativeCursorKey(cursor)} cursor={cursor} query={query} onPage={onPage} />)}
    <FlatList accessibilityLabel={t("mobile.pages.directory")} accessibilityState={{ busy: first === undefined || mine === undefined || loadingMore }} data={items} keyExtractor={page => String(page.pageId)} scrollEnabled={guard.canAct} initialNumToRender={4} maxToRenderPerBatch={4} windowSize={5} removeClippedSubviews={false}
      ListHeaderComponent={<View style={{ gap: 8 }}>
        <RuntimeNotice />
        {owned.length ? <View style={{ gap: 8 }}><Label strong accessibilityRole="header">{t("mobile.pages.ownedAssociations")}</Label>{owned.map(page => <AssociationCard key={String(page.pageId)} page={page} onOpenPage={onOpenPage} />)}</View> : null}
        <Label strong accessibilityRole="header">{t("mobile.pages.directory")}</Label>
        <Status label={first === undefined || mine === undefined ? t("mobile.common.loading") : items.length === 0 && owned.length === 0 ? t(first.isDone ? "mobile.pages.emptyAssociations" : "mobile.pages.emptyWindow") : ""} busy={first === undefined || mine === undefined} />
      </View>}
      renderItem={({ item }) => <AssociationCard page={item} onOpenPage={onOpenPage} />}
      ListFooterComponent={<View style={{ gap: 8 }}>
        <Status label={loadingMore ? t("mobile.common.loading") : ""} busy={loadingMore} />
        {canMore || loadingMore ? <Action label={t("mobile.common.loadMore")} pending={loadingMore} disabled={!guard.canAct} onPress={() => {
          if (guard.current() && canAppendNativeCursor(cursors, next, NATIVE_PAGE_WINDOWS_MAX)) setRequested([...cursors, next])
        }} /> : null}
        {tail?.isDone === false && !canMore ? <Label muted>{t("mobile.common.windowLimit")}</Label> : null}
      </View>} />
  </View>
}

function AssociationDirectoryControls({ onOpenPage }: { onOpenPage: (handle: string) => void }) {
  const guard = useNativeGuard(), { t } = useNativeAppearance()
  const [draft, setDraft] = useState(""), [query, setQuery] = useState(""), [version, setVersion] = useState(0)
  const key = JSON.stringify([nativeScope(guard.runtime), "associations", query, version])
  const refresh = () => { if (guard.current()) setVersion(value => value + 1) }
  return <View style={{ flex: 1, gap: 12 }}>
    <Label strong accessibilityRole="header">{t("mobile.pages.associationsTitle")}</Label>
    <Field label={t("mobile.pages.search")} hint={t("mobile.pages.searchHint")} value={draft} maxLength={NATIVE_PAGE_SEARCH_MAX} disabled={!guard.canAct} onChangeText={setDraft} />
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      <Action label={t("mobile.pages.searchAction")} disabled={!guard.canAct} onPress={() => { if (guard.current()) { setQuery(nativePageSearch(draft)); setVersion(value => value + 1) } }} />
      <Action label={t("mobile.common.refresh")} disabled={!guard.canAct} onPress={refresh} />
    </View>
    {!guard.runtime.ready ? <RuntimeNotice /> : <QueryBoundary key={key} resetKey={key} fallback={<Card><Status label={t("mobile.common.unavailable")} error /><Action label={t("mobile.common.refresh")} disabled={!guard.canAct} onPress={refresh} /></Card>}>
      <AssociationDirectoryBody query={query} onOpenPage={onOpenPage} />
    </QueryBoundary>}
  </View>
}

/** A section with its own list, intended for the association tab rather than a nested ScrollView. */
export function AssociationDirectorySection({ onOpenPage }: { onOpenPage: (handle: string) => void }) {
  const guard = useNativeGuard()
  return <AssociationDirectoryControls key={nativeScope(guard.runtime)} onOpenPage={onOpenPage} />
}
