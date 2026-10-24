import { api, type Id } from "@antsia/api/engine"
import { useMutation, useQuery } from "convex/react"
import type { FunctionReturnType } from "convex/server"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { FlatList, Text, useWindowDimensions, View, type ViewToken } from "react-native"
import { useNativeAppearance } from "../appearance"
import { GuardedMedia } from "../components/guarded-media"
import { Action, Card, Label, QueryBoundary, RuntimeNotice, Screen, Status, nativeScope, useNativeGuard, useReducedMotion } from "../components/ui"
import { nativePagingAllowed } from "../lib/accessibility"
import { canAppendNativeCursor, mergeNativePages, nativeCursorKey } from "../lib/native-pagination"
import { useNativeRuntime } from "../runtime"

type Feed = FunctionReturnType<typeof api.modules.posts.posts.myFeed>
type Cursor = NonNullable<Feed["nextCursor"]>
export type NativeFeedPost = Feed["items"][number]
const PAGE_SIZE = 20, MAX_PAGES = 10

type PostNavigation = { onOpenPage?: (handle: string) => void; onOpenOffer?: (handle: string, offerRef: string) => void }

function PostOfferAction({ postId, onOpenOffer }: { postId: Id<"posts">; onOpenOffer: (handle: string, offerRef: string) => void }) {
  const guard = useNativeGuard(), { t } = useNativeAppearance()
  const offer = useQuery(api.modules.shops.catalog.postOffer, guard.canRead ? { networkId: guard.runtime.networkId, postId } : "skip")
  if (!guard.canRead) return null
  if (offer === undefined) return <Status label={t("mobile.common.loading")} busy />
  if (!offer) return <Label muted>{t("mobile.common.unavailable")}</Label>
  return <Action label={t("mobile.post.openOffer")} accessibilityLabel={`${t("mobile.post.openOffer")} · ${offer.title}`} disabled={!guard.canAct} onPress={() => { if (guard.current()) onOpenOffer(offer.shopHandle, offer.offerRef) }} />
}

export function NativePostCard({ post, active, compact = false, onOpenPost, onOpenPage, onOpenOffer }: { post: NativeFeedPost; active: boolean; compact?: boolean; onOpenPost?: (postId: Id<"posts">) => void } & PostNavigation) {
  const { tokens, t } = useNativeAppearance(), guard = useNativeGuard()
  const media = compact ? post.media.slice(0, 1) : post.media
  const author = post.page?.name ?? post.author.displayName ?? t("mobile.post.unknownAuthor")
  const pageHandle = post.page?.handle
  const offerScope = nativeScope(guard.runtime) + ":post-offer:" + post._id
  return <Card>
    <Label strong accessibilityRole="header">{author}</Label>
    {post.origin ? <Label muted>{t("mobile.post.origin") + " " + post.origin.name}</Label> : null}
    {post.page ? <Label muted>{t("mobile.post.page")}</Label> : null}
    {pageHandle && onOpenPage ? <Action label={t("mobile.post.openPage")} accessibilityLabel={`${t("mobile.post.openPage")} · ${author}`} disabled={!guard.canAct} onPress={() => { if (guard.current()) onOpenPage(pageHandle) }} /> : null}
    <GuardedMedia items={media} active={active} />
    <Text selectable numberOfLines={compact ? 4 : undefined} style={{ color: tokens.foreground, fontSize: 15, lineHeight: 23 }}>{post.body}</Text>
    {compact && post.media.length > 1 ? <Label muted>{t("mobile.media.moreOnPost")}</Label> : null}
    {post.share ? post.share.available ? <View style={{ gap: 8, padding: 12, borderRadius: tokens.radiusCard, backgroundColor: tokens.muted }}>
      <Label strong>{post.share.page?.name ?? post.share.author.displayName ?? t("mobile.post.unknownAuthor")}</Label>
      <Label>{post.share.body}</Label>
      {!compact ? <GuardedMedia items={post.share.media} active={active && !post.media.some(item => item.kind === "video" && item.url !== null && item.withheld === null)} /> : null}
    </View> : <Label muted>{t("mobile.post.shareUnavailable")}</Label> : null}
    <Label muted>{t("mobile.post.reactions") + " " + post.reactions.total + " · " + t("mobile.post.comments") + " " + post.commentCount}</Label>
    {post.hasCommerceOffer ? <Label muted>{t("mobile.post.commerceReadOnly")}</Label> : null}
    {post.hasCommerceOffer && onOpenOffer ? <QueryBoundary key={offerScope} resetKey={offerScope} fallback={<Label muted>{t("mobile.common.unavailable")}</Label>}><PostOfferAction postId={post._id} onOpenOffer={onOpenOffer} /></QueryBoundary> : null}
    {onOpenPost ? <Action label={t("mobile.post.open")} accessibilityLabel={`${t("mobile.post.open")} · ${author}`} disabled={!guard.canAct} onPress={() => { if (guard.current()) onOpenPost(post._id) }} /> : null}
  </Card>
}
function FeedPage({ cursor, onPage }: { cursor: Cursor | null; onPage: (key: string, page: Feed | undefined) => void }) {
  const guard = useNativeGuard()
  const page = useQuery(api.modules.posts.posts.myFeed, guard.canRead ? { networkId: guard.runtime.networkId, limit: PAGE_SIZE, ...(cursor ? { cursor } : {}) } : "skip")
  const key = nativeCursorKey(cursor)
  useEffect(() => { if (guard.canRead) onPage(key, page) }, [guard.canRead, key, onPage, page])
  return null
}
function FeedBody({ onOpenPost, onOpenPage, onOpenOffer, focused, refresh }: { onOpenPost: (postId: Id<"posts">) => void; focused: boolean; refresh: () => void } & PostNavigation) {
  const guard = useNativeGuard(), { t } = useNativeAppearance()
  const reducedMotion = useReducedMotion(), { fontScale } = useWindowDimensions()
  const [cursors, setCursors] = useState<(Cursor | null)[]>([null])
  const [pages, setPages] = useState<Record<string, Feed | undefined>>({})
  const [immersive, setImmersive] = useState(false), [height, setHeight] = useState(0), [activeId, setActiveId] = useState<string | null>(null)
  const prepare = useMutation(api.modules.posts.feedMaterialization.prepareMyFeed)
  const prepared = useRef<string | null>(null)
  const [preparationError, setPreparationError] = useState(false)
  const onPage = useCallback((key: string, page: Feed | undefined) => setPages(previous => previous[key] === page ? previous : { ...previous, [key]: page }), [])
  const items = useMemo(() => mergeNativePages(cursors.map(cursor => pages[nativeCursorKey(cursor)]?.items ?? []), post => String(post._id)), [cursors, pages])
  const first = pages.first, tail = pages[nativeCursorKey(cursors[cursors.length - 1] ?? null)]
  const next = tail?.nextCursor
  const canMore = canAppendNativeCursor(cursors, next, MAX_PAGES)
  const paging = nativePagingAllowed({ immersive, reducedMotion, fontScale, viewportHeight: height })
  const loadingMore = tail === undefined && cursors.length > 1
  const viewable = useRef(({ viewableItems }: { viewableItems: ViewToken<NativeFeedPost>[] }) => {
    const firstVisible = viewableItems.find(item => item.isViewable)
    setActiveId(firstVisible ? String(firstVisible.item._id) : null)
  }).current
  const viewConfig = useRef({ itemVisiblePercentThreshold: 60 }).current
  useEffect(() => {
    if (!first?.preparing || !guard.canAct || !focused) return
    const key = first.preparationKey ?? "preparing"
    if (prepared.current === key) return
    prepared.current = key
    const current = guard.capture()
    void prepare({ networkId: guard.runtime.networkId }).catch(() => { if (current()) setPreparationError(true) })
  }, [first?.preparing, first?.preparationKey, focused, guard.canAct, guard.capture, guard.runtime.networkId, prepare])
  if (!guard.canRead) return <Label>{t("mobile.common.privateUnavailable")}</Label>
  return <View style={{ flex: 1, gap: 8 }}>
    {cursors.map(cursor => <FeedPage key={nativeCursorKey(cursor)} cursor={cursor} onPage={onPage} />)}
    <View style={{ flex: 1 }} onLayout={event => setHeight(event.nativeEvent.layout.height)}>
      <FlatList key={immersive ? "immersive" : "list"} accessibilityLabel={t("mobile.feed.title")} accessibilityState={{ busy: first === undefined || loadingMore }} data={items} keyExtractor={post => String(post._id)} scrollEnabled={guard.canAct} pagingEnabled={paging} decelerationRate={paging ? "fast" : "normal"} showsVerticalScrollIndicator={!paging} onViewableItemsChanged={viewable} viewabilityConfig={viewConfig} initialNumToRender={2} maxToRenderPerBatch={3} windowSize={5} removeClippedSubviews={false}
        ListHeaderComponent={<View style={{ gap: 8, paddingBottom: 12 }}>
    <RuntimeNotice />
    <Action label={t("mobile.common.refresh")} disabled={!guard.canAct} onPress={() => { if (guard.current()) refresh() }} />
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      <Action label={t("mobile.feed.listModeLabel")} accessibilityRole="radio" checked={!immersive} disabled={!guard.canAct} onPress={() => { if (guard.current()) { setActiveId(null); setImmersive(false) } }} />
      <Action label={t("mobile.feed.immersiveMode")} accessibilityRole="radio" checked={immersive} disabled={!guard.canAct} onPress={() => { if (guard.current()) { setActiveId(null); setImmersive(true) } }} />
    </View>
    <Status label={first?.preparing ? t("mobile.feed.preparing") : ""} busy={first?.preparing === true} />
    <Status label={cursors.some(cursor => pages[nativeCursorKey(cursor)]?.lacunar) ? t("mobile.feed.lacunar") : ""} />
    <Status label={preparationError ? t("mobile.common.unavailable") : ""} error />
    <Status label={first === undefined ? t("mobile.common.loading") : items.length === 0 ? t("mobile.feed.empty") : ""} busy={first === undefined} />
        </View>}
        renderItem={({ item }) => <View style={paging ? { minHeight: height, paddingBottom: 8 } : undefined}><NativePostCard post={item} compact={immersive} active={focused && String(item._id) === activeId} onOpenPost={onOpenPost} onOpenPage={onOpenPage} onOpenOffer={onOpenOffer} /></View>}
        ListFooterComponent={<View style={{ gap: 8 }}>
          <Status label={loadingMore ? t("mobile.common.loading") : ""} busy={loadingMore} />
          {canMore || loadingMore ? <Action label={t("mobile.common.loadMore")} pending={loadingMore} disabled={!guard.canAct} onPress={() => { if (guard.current() && canAppendNativeCursor(cursors, next, MAX_PAGES)) setCursors(previous => [...previous, next]) }} /> : null}
          {next !== null && next !== undefined && !canMore ? <Label muted>{t("mobile.common.windowLimit")}</Label> : null}
        </View>} />
    </View>
  </View>
}
export function FeedScreen({ onOpenPost, onOpenPage, onOpenOffer, focused = true }: { onOpenPost: (postId: Id<"posts">) => void; focused?: boolean } & PostNavigation) {
  const runtime = useNativeRuntime(), { t } = useNativeAppearance()
  const [version, setVersion] = useState(0), key = nativeScope(runtime) + ":" + version
  return <Screen title={t("mobile.feed.title")}>{!runtime.ready ? <RuntimeNotice /> : <QueryBoundary key={key} resetKey={key} fallback={<Card><Status label={t("mobile.common.unavailable")} error /><Action label={t("mobile.common.refresh")} disabled={!runtime.foreground || !runtime.online} onPress={() => { if (runtime.isCurrent() && runtime.foreground && runtime.online) setVersion(value => value + 1) }} /></Card>}><FeedBody onOpenPost={onOpenPost} onOpenPage={onOpenPage} onOpenOffer={onOpenOffer} focused={focused} refresh={() => setVersion(value => value + 1)} /></QueryBoundary>}</Screen>
}
