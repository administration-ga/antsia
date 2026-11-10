import { api } from "@antsia/api/engine"
import { nativeRequest } from "@antsia/social-native/request"
import { useMutation, useQuery } from "convex/react"
import type { FunctionReturnType } from "convex/server"
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactElement } from "react"
import { FlatList, Image, ScrollView, View, type ViewToken } from "react-native"
import { useNativeAppearance } from "../appearance"
import { Action, Card, Label, QueryBoundary, RuntimeNotice, Screen, Status, nativeScope, useNativeGuard } from "../components/ui"
import { canAppendNativeCursor, mergeNativePages, nativeCursorKey } from "../lib/native-pagination"
import { NATIVE_PAGE_WINDOW_SIZE, NATIVE_PAGE_WINDOWS_MAX, nativeLinkedPageCursors, nativePageFollowResultMatches, nativePageHandle, nativePostsForPage } from "../lib/native-pages"
import { NativePostCard, type NativeFeedPost } from "./feed-screen"

type Page = NonNullable<FunctionReturnType<typeof api.modules.pages.pages.getPage>>
type Posts = FunctionReturnType<typeof api.modules.pages.pages.pagePosts>
type PostCursor = NonNullable<Posts["nextCursor"]>
export type PageScreenProps = {
  handle: string
  onOpenPost: (id: string) => void
  onOpenShop: (handle: string) => void
  onOpenPage?: (handle: string) => void
  onOpenOffer?: (handle: string, offerRef: string) => void
  onManagePage?: (handle: string) => void
  focused?: boolean
}

function PageImage({ uri, name, banner = false }: { uri: string; name: string; banner?: boolean }) {
  const { tokens, t } = useNativeAppearance()
  const [failed, setFailed] = useState(false)
  const imageLabel = `${t(banner ? "mobile.pages.banner" : "mobile.pages.logo")} · ${name}`
  return failed ? <Label muted>{t("mobile.media.unavailable")}</Label> : <Image source={{ uri }} alt={imageLabel} accessibilityLabel={imageLabel} resizeMode={banner ? "cover" : "contain"} onError={() => setFailed(true)} style={banner ? { width: "100%", aspectRatio: 2.5, borderRadius: tokens.radiusMedia, backgroundColor: tokens.muted } : { width: 80, height: 80, borderRadius: tokens.radiusMedia, backgroundColor: tokens.muted }} />
}

function PageIdentity({ page }: { page: Page }) {
  const { t } = useNativeAppearance()
  return <View style={{ gap: 12 }}>
    {page.bannerUrl ? <PageImage key={page.bannerUrl} uri={page.bannerUrl} name={page.name} banner /> : null}
    {page.logoUrl ? <PageImage key={page.logoUrl} uri={page.logoUrl} name={page.name} /> : null}
    <Label strong accessibilityRole="header">{page.name}</Label>
    {page.shortName ? <Label>{page.shortName}</Label> : null}
    <Label muted>{t(`mobile.pages.ownerKind.${page.ownerKind}`) + " · " + t(`mobile.pages.badge.${page.badge}`)}</Label>
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
      <Label>{t("mobile.pages.followers") + " · " + page.followerCount}</Label>
      <Label>{t("mobile.pages.postCount") + " · " + page.postCount}</Label>
    </View>
  </View>
}

function PageAbout({ page }: { page: Page }) {
  const { t } = useNativeAppearance()
  return <Card>
    <Label strong accessibilityRole="header">{t("mobile.pages.about")}</Label>
    <Label>{page.description || t("mobile.pages.noDescription")}</Label>
    {page.city ? <Label>{t("mobile.pages.city") + " · " + page.city}</Label> : null}
    {page.country ? <Label>{t("mobile.pages.country") + " · " + page.country}</Label> : null}
    {page.ownerKind === "association" && page.associationType ? <Label>{t("mobile.pages.associationType") + " · " + t(`mobile.pages.associationType.${page.associationType}`)}</Label> : null}
    {page.ownerKind === "company" && page.sector ? <Label>{t("mobile.pages.sector") + " · " + t(`mobile.pages.sector.${page.sector}`)}</Label> : null}
  </Card>
}

function PostWindow({ handle, cursor, onPage }: { handle: string; cursor: PostCursor | null; onPage: (key: string, page: Posts | undefined) => void }) {
  const { canRead, canAct, current, runtime } = useNativeGuard()
  const page = useQuery(api.modules.pages.pages.pagePosts, canRead ? {
    networkId: runtime.networkId, handle, limit: NATIVE_PAGE_WINDOW_SIZE, ...(cursor ? { cursor } : {}),
  } : "skip")
  const key = nativeCursorKey(cursor)
  useEffect(() => { if (current()) onPage(key, page) }, [canAct, current, key, onPage, page])
  return null
}

function PagePublications({ page, focused, header, onOpenPost, onOpenPage, onOpenOffer }: { page: Page; focused: boolean; header: ReactElement; onOpenPost: (id: string) => void; onOpenPage?: (handle: string) => void; onOpenOffer?: (handle: string, offerRef: string) => void }) {
  const guard = useNativeGuard(), { t } = useNativeAppearance()
  const [requested, setRequested] = useState<(PostCursor | null)[]>([null])
  const [windows, setWindows] = useState<Record<string, Posts | undefined>>({})
  const [activeId, setActiveId] = useState<string | null>(null)
  const onPage = useCallback((key: string, value: Posts | undefined) => setWindows(previous => previous[key] === value ? previous : { ...previous, [key]: value }), [])
  const cursors = nativeLinkedPageCursors(requested, cursor => windows[nativeCursorKey(cursor)], value => value.nextCursor)
  const items = nativePostsForPage(
    mergeNativePages(cursors.map(cursor => windows[nativeCursorKey(cursor)]?.items ?? []), post => String(post._id), NATIVE_PAGE_WINDOW_SIZE * NATIVE_PAGE_WINDOWS_MAX),
    page,
  )
  const first = windows.first, tail = windows[nativeCursorKey(cursors[cursors.length - 1] ?? null)], next = tail?.nextCursor
  const canMore = canAppendNativeCursor(cursors, next, NATIVE_PAGE_WINDOWS_MAX)
  const loadingMore = tail === undefined && cursors.length > 1
  const [viewable] = useState(() => ({ viewableItems }: { viewableItems: ViewToken<NativeFeedPost>[] }) => {
    const firstVisible = viewableItems.find(item => item.isViewable)
    setActiveId(firstVisible ? String(firstVisible.item._id) : null)
  })
  const [viewConfig] = useState(() => ({ itemVisiblePercentThreshold: 60 }))
  return <View style={{ flex: 1 }}>
    {cursors.map(cursor => <PostWindow key={nativeCursorKey(cursor)} handle={page.handle} cursor={cursor} onPage={onPage} />)}
    <FlatList accessibilityLabel={t("mobile.pages.posts")} accessibilityState={{ busy: first === undefined || loadingMore }} data={items} keyExtractor={post => String(post._id)} scrollEnabled={guard.canAct} onViewableItemsChanged={viewable} viewabilityConfig={viewConfig} initialNumToRender={2} maxToRenderPerBatch={3} windowSize={5} removeClippedSubviews={false}
      ListHeaderComponent={<View style={{ gap: 8 }}>{header}<Status label={first === undefined ? t("mobile.common.loading") : items.length === 0 ? t(next == null ? "mobile.pages.emptyPosts" : "mobile.pages.emptyWindow") : ""} busy={first === undefined} /></View>}
      renderItem={({ item }) => <NativePostCard post={item} active={focused && guard.canAct && String(item._id) === activeId} onOpenPost={onOpenPost} onOpenPage={onOpenPage} onOpenOffer={onOpenOffer} />}
      ListFooterComponent={<View style={{ gap: 8 }}>
        <Status label={loadingMore ? t("mobile.common.loading") : ""} busy={loadingMore} />
        {canMore || loadingMore ? <Action label={t("mobile.common.loadMore")} pending={loadingMore} disabled={!guard.canAct} onPress={() => {
          if (guard.current() && canAppendNativeCursor(cursors, next, NATIVE_PAGE_WINDOWS_MAX)) setRequested([...cursors, next])
        }} /> : null}
        {next != null && !canMore ? <Label muted>{t("mobile.common.windowLimit")}</Label> : null}
      </View>} />
  </View>
}

function PageBody({ handle, onOpenPost, onOpenShop, onOpenPage, onOpenOffer, onManagePage, focused, refresh }: Omit<PageScreenProps, "focused"> & { focused: boolean; refresh: () => void }) {
  const guard = useNativeGuard(), { t } = useNativeAppearance()
  const page = useQuery(api.modules.pages.pages.getPage, guard.canRead ? { networkId: guard.runtime.networkId, handle } : "skip")
  const shop = useQuery(api.modules.shops.shops.storefront, guard.canRead && page?.handle === handle ? { networkId: guard.runtime.networkId, handle } : "skip")
  const mine = useQuery(api.modules.pages.pages.myPages, guard.canRead && page && onOpenPage ? { networkId: guard.runtime.networkId } : "skip")
  const follow = useMutation(api.modules.pages.pages.follow), unfollow = useMutation(api.modules.pages.pages.unfollow)
  const [section, setSection] = useState<"posts" | "about">("posts")
  const [pending, setPending] = useState(false), [followFailed, setFollowFailed] = useState(false)
  const busy = useRef(false)
  const { owner, canAct } = guard, pageId = page?.pageId
  const latestTarget = useRef({ owner, pageId, handle })
  useLayoutEffect(() => { latestTarget.current = { owner, pageId, handle } }, [owner, pageId, handle])
  useEffect(() => { if (canAct && !busy.current) setPending(false) }, [canAct])

  const changeFollowing = async () => {
    if (!page || page.handle !== handle || busy.current || !guard.current() || !guard.runtime.canWrite) return
    const target = { owner: guard.owner, pageId: page.pageId, handle: page.handle, following: !page.viewer.following }
    const current = guard.capture()
    const matches = () => latestTarget.current.owner === target.owner && latestTarget.current.pageId === target.pageId && latestTarget.current.handle === target.handle
    busy.current = true; setPending(true); setFollowFailed(false)
    try {
      const result = target.following
        ? await nativeRequest(() => follow({ networkId: guard.runtime.networkId, handle: target.handle }))
        : await nativeRequest(() => unfollow({ networkId: guard.runtime.networkId, pageId: target.pageId }))
      if (current() && matches() && !nativePageFollowResultMatches(target, result)) setFollowFailed(true)
      // The live getPage DTO alone updates following/counts; no optimistic state is invented.
    } catch { if (current() && matches()) setFollowFailed(true) }
    finally {
      busy.current = false
      if (guard.current()) setPending(false)
    }
  }

  if (!guard.canRead) return <Label>{t("mobile.common.privateUnavailable")}</Label>
  if (!page || page.handle !== handle) return <View style={{ gap: 8 }}><RuntimeNotice /><Status label={page === undefined ? t("mobile.common.loading") : t("mobile.common.unavailable")} busy={page === undefined} error={page !== undefined} /><Action label={t("mobile.common.refresh")} disabled={!guard.canAct} onPress={() => { if (guard.current()) refresh() }} /></View>
  const related = (mine ?? []).filter(item => item.pageId !== page.pageId && nativePageHandle(item.handle) === item.handle)
  const readableShop = shop?.pageId === page.pageId && shop.handle === page.handle ? shop : null
  const header = <View style={{ gap: 8 }}>
    <RuntimeNotice />
    <Action label={t("mobile.common.refresh")} disabled={!guard.canAct || pending} onPress={() => { if (guard.current() && !busy.current) refresh() }} />
    <Card>
      <PageIdentity page={page} />
      <Label muted>{t(page.viewer.following ? "mobile.pages.following" : "mobile.pages.notFollowing")}</Label>
      {page.viewer.role ? <Label muted>{t(`mobile.pages.role.${page.viewer.role}`)}</Label> : null}
      <Action label={t(page.viewer.following ? "mobile.pages.unfollow" : "mobile.pages.follow")} pending={pending} disabled={!guard.canAct || !guard.runtime.canWrite} onPress={() => { void changeFollowing() }} />
      <Status label={followFailed ? t("mobile.pages.followFailed") : ""} error />
      {readableShop ? <Action label={t("mobile.pages.openShop")} disabled={!guard.canAct} onPress={() => { if (guard.current()) onOpenShop(readableShop.handle) }} /> : null}
      {page.viewer.role === "admin" && onManagePage && guard.runtime.canWrite ? <Action label={t("mobile.pages.manage")} disabled={!guard.canAct} onPress={() => { if (guard.current() && guard.runtime.canWrite) onManagePage(page.handle) }} /> : <Label muted>{t("mobile.pages.readOnly")}</Label>}
    </Card>
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      <Action label={t("mobile.pages.posts")} accessibilityRole="tab" selected={section === "posts"} disabled={!guard.canAct} onPress={() => { if (guard.current()) setSection("posts") }} />
      <Action label={t("mobile.pages.about")} accessibilityRole="tab" selected={section === "about"} disabled={!guard.canAct} onPress={() => { if (guard.current()) setSection("about") }} />
    </View>
  </View>
  return section === "posts" ? <PagePublications key={String(page.pageId)} page={page} header={header} focused={focused} onOpenPost={onOpenPost} onOpenPage={onOpenPage} onOpenOffer={onOpenOffer} /> : <ScrollView accessibilityLabel={t("mobile.pages.about")} scrollEnabled={guard.canAct} contentContainerStyle={{ gap: 8, paddingBottom: 12 }}>
    {header}<PageAbout page={page} />
    {onOpenPage && related.length ? <Card><Label strong accessibilityRole="header">{t("mobile.pages.otherManagedPages")}</Label>{related.map(item => <Action key={String(item.pageId)} label={item.name} accessibilityLabel={`${t("mobile.pages.openPage")} · ${item.name}`} disabled={!guard.canAct} onPress={() => { if (guard.current()) onOpenPage(item.handle) }} />)}</Card> : null}
  </ScrollView>
}

export function PageScreen({ handle: rawHandle, focused = true, ...callbacks }: PageScreenProps) {
  const guard = useNativeGuard(), { t } = useNativeAppearance(), [version, setVersion] = useState(0)
  const handle = nativePageHandle(rawHandle)
  const key = JSON.stringify([nativeScope(guard.runtime), "page", handle, version])
  const refresh = () => { if (guard.current()) setVersion(value => value + 1) }
  return <Screen title={t("mobile.pages.pageTitle")}>
    {!guard.runtime.ready ? <RuntimeNotice /> : !handle ? <Status label={t("mobile.common.unavailable")} error /> : <QueryBoundary key={key} resetKey={key} fallback={<Card><Status label={t("mobile.common.unavailable")} error /><Action label={t("mobile.common.refresh")} disabled={!guard.canAct} onPress={refresh} /></Card>}>
      <PageBody handle={handle} focused={focused} refresh={refresh} {...callbacks} />
    </QueryBoundary>}
  </Screen>
}
