import { NativeText as Text } from "../components/native-text"
import { useCallback, useEffect, useMemo, useState } from "react"
import { FlatList, Image, Keyboard, Pressable, useWindowDimensions, View, type ViewToken } from "react-native"
import { randomUUID } from "expo-crypto"
import { useQuery } from "convex/react"
import type { FunctionReturnType } from "convex/server"
import { api, type Id } from "@antsia/api/engine"
import { useNativeAppearance } from "../appearance"
import { GuardedMedia } from "../components/guarded-media"
import { NativeIcon } from "../components/icon"
import { Action, Field, Label, QueryBoundary, RuntimeNotice, Status, useNativeGuard, useReducedMotion } from "../components/ui"
import { nativeFeedText, nativeMediaCanAdvance } from "../lib/feed-presentation"
import { mergeNativePages, nativeCursorKey } from "../lib/native-pagination"
import { NativePostCard, type NativeFeedPost, type NativePostNavigation } from "./feed-screen"
import { PostShareAction } from "./post-actions"

type MediaPage = FunctionReturnType<typeof api.modules.posts.mediaFeed.paginate>
export type MediaFeedScreenProps = { kind: "video" | "media"; onOpenPost: (postId: Id<"posts">) => void; authorHandle?: string; focused?: boolean; onOpenExplore?: () => void; onOpenClips?: () => void; onOpenBusiness?: () => void } & NativePostNavigation
const WINDOW_SIZE = 20, MAX_WINDOWS = 10

function MediaPageSubscription({ kind, authorHandle, query, cursor, token, onPage }: { kind: "video" | "media"; authorHandle?: string; query: string; cursor: string | null; token: string; onPage: (key: string, page: MediaPage | undefined) => void }) {
  const guard = useNativeGuard()
  const page = useQuery(api.modules.posts.mediaFeed.paginate, guard.canAct ? { networkId: guard.runtime.networkId, kind, ...(authorHandle ? { authorHandle } : {}), ...(query ? { query } : {}), revalidationToken: token, paginationOpts: { numItems: WINDOW_SIZE, cursor } } : "skip")
  const key = nativeCursorKey(cursor)
  useEffect(() => { if (guard.canAct) onPage(key, page) }, [guard.canAct, key, onPage, page])
  return null
}

function MediaTile({ post, columns, onOpenPost, onOpenProfile }: { post: NativeFeedPost; columns: number; onOpenPost: (id: Id<"posts">) => void; onOpenProfile?: (handle: string) => void }) {
  const guard = useNativeGuard(), { t, tokens } = useNativeAppearance(), [failed, setFailed] = useState(false)
  const media = post.media.find(item => item.url !== null && item.withheld === null)
  const name = post.page?.name ?? post.author.displayName ?? t("mobile.post.unknownAuthor")
  if (!guard.canAct || !media?.url) return null
  return <View style={{ width: `${100 / columns}%`, minWidth: 0, padding: 3 }}>
    <Pressable accessibilityRole="button" accessibilityLabel={nativeFeedText(t, "mediaOpen", { name })} onPress={() => { if (guard.current()) onOpenPost(post._id) }} style={{ aspectRatio: 4 / 5, overflow: "hidden", borderRadius: tokens.radiusMedia, backgroundColor: tokens.muted }}>
      {media.kind === "image" && !failed ? <Image accessible={false} alt="" source={{ uri: media.url }} resizeMode="cover" onError={() => setFailed(true)} style={{ width: "100%", height: "100%" }} /> : <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}><NativeIcon name={media.kind === "video" ? "grid" : "image"} /></View>}
      <View style={{ position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: tokens.card, padding: 6 }}><Text numberOfLines={1} style={{ color: tokens.foreground, fontSize: 11 }}>{name}</Text></View>
    </Pressable>
    {!post.page && post.author.handle && onOpenProfile ? <Pressable accessibilityRole="button" accessibilityLabel={nativeFeedText(t, "openProfile", { name })} onPress={() => { if (guard.current() && post.author.handle) onOpenProfile(post.author.handle) }} style={{ minHeight: 44, justifyContent: "center" }}><Text numberOfLines={1} style={{ color: tokens.mutedForeground, fontSize: 11 }}>@{post.author.handle}</Text></Pressable> : null}
  </View>
}

function ClipItem({ post, height, active, onOpenPost, onOpenProfile, onSharePost }: { post: NativeFeedPost; height: number; active: boolean; onOpenPost: (id: Id<"posts">) => void } & NativePostNavigation) {
  const guard = useNativeGuard(), { t, tokens } = useNativeAppearance()
  const media = post.media.find(item => item.kind === "video" && item.url !== null && item.withheld === null)
  const name = post.page?.name ?? post.author.displayName ?? t("mobile.post.unknownAuthor")
  if (!guard.canAct || !media) return null
  return <View style={{ height, backgroundColor: tokens.background, overflow: "hidden" }}>
    <GuardedMedia items={[media]} active={active} edgeToEdge frameHeight={height} />
    <View style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: 14, gap: 8, backgroundColor: tokens.card }}>
      {!post.page && post.author.handle && onOpenProfile ? <Pressable accessibilityRole="button" accessibilityLabel={nativeFeedText(t, "openProfile", { name })} onPress={() => { if (guard.current() && post.author.handle) onOpenProfile(post.author.handle) }} style={{ minHeight: 44, justifyContent: "center" }}><Label strong>{name}</Label></Pressable> : <Label strong>{name}</Label>}
      {post.body ? <Text numberOfLines={2} style={{ color: tokens.foreground, fontSize: 14, lineHeight: 20 }}>{post.body}</Text> : null}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}><View style={{ flex: 1 }}><Action label={t("mobile.post.open")} onPress={() => { if (guard.current()) onOpenPost(post._id) }} /></View><PostShareAction post={post} onSharePost={onSharePost} /></View>
    </View>
  </View>
}

function MediaFeedBody({ kind, authorHandle, focused = true, query, token, ...navigation }: MediaFeedScreenProps & { query: string; token: string }) {
  const guard = useNativeGuard(), { t, tokens } = useNativeAppearance(), { width, fontScale } = useWindowDimensions(), reduced = useReducedMotion()
  const [cursors, setCursors] = useState<(string | null)[]>([null]), [pages, setPages] = useState<Record<string, MediaPage | undefined>>({})
  const [immersive, setImmersive] = useState(false), [height, setHeight] = useState(480), [activeId, setActiveId] = useState<string | null>(null)
  const onPage = useCallback((key: string, page: MediaPage | undefined) => setPages(previous => previous[key] === page ? previous : { ...previous, [key]: page }), [])
  const posts = useMemo(() => mergeNativePages(cursors.map(cursor => pages[nativeCursorKey(cursor)]?.page ?? []), post => String(post._id)).filter(post => post.media.some(item => item.url !== null && item.withheld === null && (kind === "media" || item.kind === "video"))), [cursors, pages, kind])
  const first = pages.first, tail = pages[nativeCursorKey(cursors[cursors.length - 1] ?? null)]
  const more = nativeMediaCanAdvance(cursors, tail?.continueCursor, tail?.isDone ?? false, MAX_WINDOWS)
  const columns = width >= 1440 ? 6 : width >= 1024 ? 5 : width >= 768 ? 4 : 3
  const paged = immersive && !reduced && fontScale <= 1.3 && height >= 480
  const viewable = useCallback(({ viewableItems }: { viewableItems: ViewToken<NativeFeedPost>[] }) => setActiveId(viewableItems.find(item => item.isViewable)?.item._id ?? null), [])
  const viewability = useMemo(() => ({ itemVisiblePercentThreshold: 70 }), [])
  if (!guard.canAct) return <RuntimeNotice />
  const footer = <View style={{ padding: 14, gap: 8 }}><Status busy={tail === undefined} label={tail === undefined ? t("mobile.common.loading") : posts.length === 0 ? t(tail?.isDone ? "mobile.mediaDiscovery.empty" : "mobile.mediaDiscovery.emptyWindow") : ""} />{more ? <Action label={t("mobile.mediaDiscovery.more")} onPress={() => { if (guard.current()) setCursors(previous => nativeMediaCanAdvance(previous, tail?.continueCursor, tail?.isDone ?? false, MAX_WINDOWS) ? [...previous, tail!.continueCursor] : previous) }} /> : null}{tail && !tail.isDone && !more ? <Label muted>{t("mobile.common.windowLimit")}</Label> : null}</View>
  return <View style={{ flex: 1 }}>
    {cursors.map(cursor => <MediaPageSubscription key={nativeCursorKey(cursor)} kind={kind} authorHandle={authorHandle} query={query} cursor={cursor} token={token} onPage={onPage} />)}
    {kind === "video" ? <View style={{ flexDirection: "row", gap: 6, paddingHorizontal: 14, paddingVertical: 4 }}>{([false, true] as const).map(value => <Pressable key={String(value)} accessibilityRole="radio" accessibilityState={{ checked: immersive === value }} onPress={() => { if (guard.current()) { setActiveId(null); setImmersive(value) } }} style={{ minHeight: 44, paddingHorizontal: 14, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: immersive === value ? tokens.tabActive : tokens.muted }}><Text style={{ color: immersive === value ? tokens.tabActiveInk : tokens.foreground, fontSize: 13, fontWeight: "600" }}>{t(value ? "mobile.mediaDiscovery.immersive" : "mobile.mediaDiscovery.list")}</Text></Pressable>)}</View> : null}
    <View style={{ flex: 1 }} onLayout={event => setHeight(Math.max(240, event.nativeEvent.layout.height))}>
      <FlatList key={kind === "media" ? `grid:${columns}` : immersive ? "clips" : "list"} data={posts} keyExtractor={post => String(post._id)} numColumns={kind === "media" ? columns : 1} pagingEnabled={paged} decelerationRate={paged ? "fast" : "normal"} onViewableItemsChanged={viewable} viewabilityConfig={viewability} initialNumToRender={kind === "media" ? 9 : 2} maxToRenderPerBatch={kind === "media" ? 9 : 2} windowSize={5} removeClippedSubviews={false} ListEmptyComponent={<View style={{ padding: 14 }}><Status busy={first === undefined} label={first === undefined ? t("mobile.common.loading") : ""} /></View>} ListFooterComponent={footer} renderItem={({ item }) => kind === "media" ? <MediaTile post={item} columns={columns} onOpenPost={navigation.onOpenPost} onOpenProfile={navigation.onOpenProfile} /> : immersive ? <ClipItem post={item} height={height} active={focused && String(item._id) === activeId} {...navigation} /> : <NativePostCard post={item} edgeToEdge active={focused && String(item._id) === activeId} {...navigation} />} />
    </View>
  </View>
}

export function MediaFeedScreen({ kind, authorHandle, onOpenExplore, onOpenClips, onOpenBusiness, ...navigation }: MediaFeedScreenProps) {
  const guard = useNativeGuard(), { t, tokens } = useNativeAppearance()
  const [draft, setDraft] = useState(""), [query, setQuery] = useState(""), [version, setVersion] = useState(0)
  const key = JSON.stringify([guard.owner, kind, authorHandle ?? null, query, version])
  return <View style={{ flex: 1 }}>
    {kind === "video" ? <View style={{ paddingHorizontal: 14, paddingTop: 6 }}>{onOpenExplore ? <Pressable accessibilityRole="button" onPress={onOpenExplore} style={{ minHeight: 44, justifyContent: "center" }}><Text style={{ color: tokens.primaryInk, textDecorationLine: "underline" }}>{t("mobile.mediaDiscovery.back")}</Text></Pressable> : null}<Text variant="display" accessibilityRole="header" style={{ fontSize: 24, fontWeight: "600", color: tokens.foreground }}>{t("mobile.mediaDiscovery.clips")}</Text></View> : null}
    <View style={{ paddingHorizontal: 14, paddingVertical: 6 }}><Field label={t("mobile.mediaDiscovery.search")} hint={t("mobile.mediaDiscovery.searchHint")} value={draft} onChangeText={setDraft} maxLength={80} returnKeyType="search" submitLabel={t("mobile.feedUi.apply")} disabled={!guard.canAct} onSubmit={() => { if (guard.current()) { setQuery(draft.trim().normalize("NFC")); Keyboard.dismiss() } }} /></View>
    <View accessibilityLabel={t("mobile.mediaDiscovery.filters")} style={{ flexDirection: "row", gap: 6, paddingHorizontal: 14, paddingBottom: 6 }}>{([{ key: "all", selected: kind === "media", open: onOpenExplore }, { key: "clips", selected: kind === "video", open: onOpenClips }, { key: "shops", selected: false, open: onOpenBusiness }] as const).filter(item => item.open).map(item => <Pressable key={item.key} accessibilityRole="button" accessibilityState={{ selected: item.selected }} onPress={item.open} style={{ minHeight: 44, paddingHorizontal: 12, justifyContent: "center", borderRadius: 22, backgroundColor: item.selected ? tokens.tabActive : tokens.muted }}><Text style={{ color: item.selected ? tokens.tabActiveInk : tokens.foreground, fontSize: 13 }}>{t(`mobile.mediaDiscovery.${item.key}`)}</Text></Pressable>)}</View>
    {!guard.canAct ? <RuntimeNotice /> : <QueryBoundary key={key} resetKey={key} fallback={<View style={{ padding: 14, gap: 12 }}><Status error label={t("mobile.common.unavailable")} /><Action label={t("mobile.common.retry")} onPress={() => { if (guard.current()) setVersion(value => value + 1) }} /></View>}><ConnectedMediaFeed kind={kind} authorHandle={authorHandle} query={query} {...navigation} /></QueryBoundary>}
  </View>
}

/** Unmounted on every offline/background transition: a reconnect always gets a fresh subscription token. */
function ConnectedMediaFeed(props: MediaFeedScreenProps & { query: string }) {
  const [token] = useState(randomUUID)
  return <MediaFeedBody {...props} token={token} />
}
