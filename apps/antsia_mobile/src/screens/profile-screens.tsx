import { api } from "@antsia/api/engine"
import { useMutation, useQuery } from "convex/react"
import type { FunctionReturnType } from "convex/server"
import { useCallback, useEffect, useRef, useState, type ReactElement } from "react"
import { FlatList, Image, Pressable, ScrollView, View, type ViewToken } from "react-native"
import { useNativeAppearance } from "../appearance"
import { NativeIcon } from "../components/icon"
import { NativeText as Text } from "../components/native-text"
import { Action, Card, Label, QueryBoundary, RuntimeNotice, Status, nativeScope, useNativeGuard } from "../components/ui"
import { nativeRelativeTime } from "../lib/feed-presentation"
import { canAppendNativeCursor, mergeNativePages, nativeCursorKey } from "../lib/native-pagination"
import { nativeLinkedPageCursors } from "../lib/native-pages"
import { NATIVE_PROFILE_ENTRIES, PROFILE_MAX_ITEMS, PROFILE_MAX_PAGES, PROFILE_PAGE_SIZE, nativeBookmarkIdentity, nativePostsForProfile, nativeProfileText, nativePublishedProfileHandle, type NativeProfileEntry } from "../lib/native-profile-view"
import type { NativeAccountSection } from "../lib/routes"
import { useNativeRuntime } from "../runtime"
import { NativePostCard, type NativeFeedPost, type NativePostNavigation } from "./feed-screen"

type PublicProfile = NonNullable<FunctionReturnType<typeof api.modules.people.profile.getPublicProfile>>
type ProfilePosts = FunctionReturnType<typeof api.modules.posts.posts.personPosts>
type ProfileCursor = NonNullable<ProfilePosts["nextCursor"]>
type Bookmarks = FunctionReturnType<typeof api.modules.marks.marks.paginateBookmarks>
type Bookmark = Bookmarks["page"][number]
type OpenPost = (postId: string) => void

function ProfilePicture({ delivery, name, cover = false, size = 80, square = false, initialsAllowed = true }: {
  delivery: { url: string | null; withheld: string | null }
  name: string
  cover?: boolean
  size?: number
  square?: boolean
  initialsAllowed?: boolean
}) {
  const { tokens, locale } = useNativeAppearance()
  const [failed, setFailed] = useState(false)
  const dimensions = cover ? { width: "100%" as const, aspectRatio: 2.5 } : { width: size, height: size }
  const radius = cover ? tokens.radiusCard : square ? tokens.radiusMedia : size / 2
  const initials = name.trim().split(/\s+/u).slice(0, 2).map(part => Array.from(part)[0] ?? "").join("").toLocaleUpperCase(locale)
  if (delivery.withheld !== null || !delivery.url || failed) return <View accessible={false} style={{ ...dimensions, borderRadius: radius, backgroundColor: tokens.muted, alignItems: "center", justifyContent: "center" }}>{cover ? null : initialsAllowed && initials ? <Text style={{ color: tokens.foreground, fontSize: Math.max(16, size / 3), fontWeight: "600" }}>{initials}</Text> : <NativeIcon name="user" size={Math.min(24, size / 2)} color={tokens.mutedForeground} />}</View>
  return <Image alt="" accessible={false} source={{ uri: delivery.url }} onError={() => setFailed(true)} resizeMode="cover" style={{ ...dimensions, borderRadius: radius, backgroundColor: tokens.muted }} />
}

function RefreshFailure({ message, onRefresh }: { message: string; onRefresh: () => void }) {
  const { t } = useNativeAppearance(), guard = useNativeGuard()
  return <Card><Status label={message} error /><Action label={t("mobile.common.refresh")} disabled={!guard.canAct} onPress={() => { if (guard.current()) onRefresh() }} /></Card>
}

function HubProfileCard({ handle, displayName, onOpenProfile }: { handle: string; displayName: string; onOpenProfile: (handle: string) => void }) {
  const guard = useNativeGuard(), { tokens, t } = useNativeAppearance()
  const profile = useQuery(api.modules.people.profile.getPublicProfile, guard.canRead ? { networkId: guard.runtime.networkId, handle } : "skip")
  if (!guard.canRead) return null
  if (profile === null) return <Status label={nativeProfileText(t, "refusedMessage")} />
  return <View style={{ padding: 16, borderWidth: 1, borderColor: tokens.border, borderRadius: tokens.radiusCard, backgroundColor: tokens.card, gap: 14 }}>
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
      <ProfilePicture key={profile?.avatar.url ?? handle} delivery={profile?.avatar ?? { url: null, withheld: null }} name={profile?.displayName ?? displayName} size={56} />
      <View style={{ flex: 1, minWidth: 0, gap: 4 }}><Text style={{ color: tokens.foreground, fontSize: 18, fontWeight: "600" }}>{profile?.displayName ?? displayName}</Text><Text style={{ color: tokens.mutedForeground, fontSize: 14 }}>@{profile?.handle ?? handle}</Text></View>
    </View>
    <Text style={{ color: tokens.mutedForeground, fontSize: 14, lineHeight: 21 }}>{nativeProfileText(t, "profileHint")}</Text>
    {profile ? <Action label={nativeProfileText(t, "profileLabel")} disabled={!guard.canAct} onPress={() => { if (guard.current()) onOpenProfile(profile.handle) }} /> : <Status label={t("mobile.common.loading")} busy />}
  </View>
}

export type ProfileHubScreenProps = {
  handle?: string
  displayName: string
  onOpenProfile: (handle: string) => void
  onBookmarks: () => void
  onSettings: () => void
  onActivities: () => void
  onWebSection: (section: NativeAccountSection) => void
  onSignOut: () => void
  onDemoOptions?: () => void
}

export function ProfileHubScreen(props: ProfileHubScreenProps) {
  const { tokens, t } = useNativeAppearance(), guard = useNativeGuard()
  const [profileVersion, setProfileVersion] = useState(0), [signingOut, setSigningOut] = useState(false)
  const handle = nativePublishedProfileHandle(props.handle)
  const scope = nativeScope(guard.runtime) + ":hub-profile:" + (handle ?? "") + ":" + profileVersion
  const openEntry = (entry: NativeProfileEntry) => {
    if (!guard.current()) return
    if (entry.id === "bookmarks") props.onBookmarks()
    else if (entry.id === "activities") props.onActivities()
    else if (entry.id === "settings") props.onSettings()
    else props.onWebSection(entry.id)
  }
  if (!guard.canRead) return <RuntimeNotice />
  return <ScrollView accessibilityLabel={nativeProfileText(t, "title")} scrollEnabled={guard.canAct} contentContainerStyle={{ padding: 16, paddingBottom: 32, gap: 24 }}>
    <RuntimeNotice />
    <View style={{ gap: 10 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <Text variant="display" accessibilityRole="header" style={{ color: tokens.foreground, fontSize: 24, fontWeight: "600" }}>{nativeProfileText(t, "title")}</Text>
        <Pressable accessibilityRole="button" accessibilityState={{ disabled: !guard.canAct }} disabled={!guard.canAct} onPress={() => { if (guard.current()) props.onSettings() }} style={{ minHeight: 44, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, borderWidth: 1, borderColor: tokens.border, borderRadius: tokens.radiusField, backgroundColor: tokens.card }}><NativeIcon name="settings" size={18} /><Text style={{ color: tokens.foreground, fontWeight: "600" }}>{nativeProfileText(t, "settings")}</Text></Pressable>
      </View>
      <Text style={{ color: tokens.mutedForeground, fontSize: 16, lineHeight: 24 }}>{nativeProfileText(t, "lead")}</Text>
    </View>
    {handle ? <QueryBoundary key={scope} resetKey={scope} fallback={<RefreshFailure message={nativeProfileText(t, "profileUnavailable")} onRefresh={() => setProfileVersion(value => value + 1)} />}><HubProfileCard handle={handle} displayName={props.displayName} onOpenProfile={props.onOpenProfile} /></QueryBoundary> : null}
    {(["activity", "preferences", "account"] as const).map(group => <View key={group} style={{ gap: 12 }}>
      <Text accessibilityRole="header" style={{ color: tokens.foreground, fontSize: 18, fontWeight: "600" }}>{nativeProfileText(t, `${group}Title`)}</Text>
      {NATIVE_PROFILE_ENTRIES.filter(entry => entry.group === group).map(entry => <Pressable key={entry.id} accessibilityRole="button" accessibilityState={{ disabled: !guard.canAct }} disabled={!guard.canAct} onPress={() => openEntry(entry)} style={({ pressed }) => ({ minHeight: 44, flexDirection: "row", alignItems: "flex-start", gap: 12, padding: 16, borderWidth: 1, borderColor: tokens.border, borderRadius: tokens.radiusField, backgroundColor: pressed ? tokens.muted : tokens.card })}>
        <View style={{ flex: 1, minWidth: 0, gap: 5 }}><Text style={{ color: tokens.foreground, fontSize: 16, fontWeight: "600" }}>{nativeProfileText(t, entry.label)}</Text><Text style={{ color: tokens.mutedForeground, fontSize: 14, lineHeight: 21 }}>{nativeProfileText(t, entry.hint)}</Text></View><View style={{ transform: [{ rotate: "180deg" }] }}><NativeIcon name="back" size={18} color={tokens.mutedForeground} /></View>
      </Pressable>)}
      {group === "account" ? <View style={{ gap: 12 }}>{props.onDemoOptions ? <Action label={nativeProfileText(t, "demoOptions")} disabled={!guard.canAct} onPress={() => { if (guard.current()) props.onDemoOptions?.() }} /> : null}<Action label={nativeProfileText(t, "signOut")} pending={signingOut} disabled={!guard.canAct || signingOut} onPress={() => { if (guard.current() && !signingOut) { setSigningOut(true); props.onSignOut() } }} /></View> : null}
    </View>)}
  </ScrollView>
}

export type PublicProfileScreenProps = {
  handle: string
  onOpenPost: OpenPost
  onOpenProfile?: (handle: string) => void
  onOpenPage?: (handle: string) => void
  onOpenOffer?: (handle: string, offerRef: string) => void
  onSearchTag?: (tag: string) => void
}

function PublicProfileIdentity({ profile }: { profile: PublicProfile }) {
  const { tokens, t } = useNativeAppearance()
  const badges = [...new Set(profile.badges.filter(badge => badge !== "community"))]
  return <View style={{ paddingBottom: 18, gap: 12 }}>
    <ProfilePicture key={profile.cover.url ?? "cover"} delivery={profile.cover} name={profile.displayName} cover />
    <View style={{ marginTop: -46, paddingHorizontal: 14, gap: 10 }}>
      <View style={{ alignSelf: "flex-start", padding: 4, borderRadius: 52, backgroundColor: tokens.background }}><ProfilePicture key={profile.avatar.url ?? "avatar"} delivery={profile.avatar} name={profile.displayName} size={96} /></View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" }}><Text variant="display" accessibilityRole="header" style={{ color: tokens.foreground, fontSize: 24, fontWeight: "600", flexShrink: 1 }}>{profile.displayName}</Text>{profile.isMe ? <Text style={{ color: tokens.primaryInk, fontSize: 13, fontWeight: "600" }}>{nativeProfileText(t, "you")}</Text> : null}</View>
      <Text style={{ color: tokens.mutedForeground, fontSize: 15 }}>@{profile.handle}</Text>
      {badges.length ? <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>{badges.map(badge => <View key={badge} style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: tokens.tabActive }}><Text style={{ color: tokens.tabActiveInk, fontSize: 12, fontWeight: "600" }}>{nativeProfileText(t, `badge.${badge}`)}</Text></View>)}</View> : null}
      {profile.headline ? <Text style={{ color: tokens.foreground, fontSize: 16, lineHeight: 24 }}>{profile.headline}</Text> : null}
      {profile.isMe ? <Text style={{ color: tokens.mutedForeground, fontSize: 13, lineHeight: 20 }}>{nativeProfileText(t, "selfNote")}</Text> : null}
      <Text accessibilityRole="header" style={{ color: tokens.foreground, fontSize: 18, fontWeight: "600", marginTop: 8 }}>{nativeProfileText(t, "publications")}</Text>
    </View>
  </View>
}

function ProfilePostsWindow({ handle, cursor, onPage }: { handle: string; cursor: ProfileCursor | null; onPage: (key: string, result: ProfilePosts | undefined) => void }) {
  const { canRead, canAct, current, runtime } = useNativeGuard()
  const page = useQuery(api.modules.posts.posts.personPosts, canRead ? { networkId: runtime.networkId, handle, limit: PROFILE_PAGE_SIZE, ...(cursor ? { cursor } : {}) } : "skip")
  const key = nativeCursorKey(cursor)
  useEffect(() => { if (current()) onPage(key, page) }, [canAct, current, key, onPage, page])
  return null
}

function ProfilePublications({ profile, header, onOpenPost, ...navigation }: { profile: PublicProfile; header: ReactElement; onOpenPost: OpenPost } & NativePostNavigation) {
  const guard = useNativeGuard(), { t } = useNativeAppearance()
  const [requested, setRequested] = useState<(ProfileCursor | null)[]>([null])
  const [windows, setWindows] = useState<Record<string, ProfilePosts | undefined>>({})
  const [activeId, setActiveId] = useState<string | null>(null)
  const onPage = useCallback((key: string, page: ProfilePosts | undefined) => setWindows(previous => previous[key] === page ? previous : { ...previous, [key]: page }), [])
  const cursors = nativeLinkedPageCursors<ProfileCursor, ProfilePosts>(requested, cursor => windows[nativeCursorKey(cursor)], page => page.nextCursor, PROFILE_MAX_PAGES)
  const first = windows.first, tail = windows[nativeCursorKey(cursors[cursors.length - 1] ?? null)], next = tail?.nextCursor
  const pinned = nativePostsForProfile(first?.pinned ? [first.pinned] : [], profile.personId)
  const items = nativePostsForProfile(mergeNativePages([pinned, ...cursors.map(cursor => windows[nativeCursorKey(cursor)]?.items ?? [])], post => String(post._id), PROFILE_MAX_ITEMS), profile.personId)
  const canMore = items.length < PROFILE_MAX_ITEMS && canAppendNativeCursor(cursors, next, PROFILE_MAX_PAGES)
  const loadingMore = tail === undefined && cursors.length > 1
  const [viewable] = useState(() => ({ viewableItems }: { viewableItems: ViewToken<NativeFeedPost>[] }) => setActiveId(String(viewableItems.find(item => item.isViewable)?.item._id ?? "")))
  const [viewConfig] = useState(() => ({ itemVisiblePercentThreshold: 60 }))
  return <View style={{ flex: 1 }}>
    {cursors.map(cursor => <ProfilePostsWindow key={nativeCursorKey(cursor)} handle={profile.handle} cursor={cursor} onPage={onPage} />)}
    <FlatList accessibilityLabel={nativeProfileText(t, "publications")} accessibilityState={{ busy: first === undefined || loadingMore }} data={items} keyExtractor={post => String(post._id)} scrollEnabled={guard.canAct} onViewableItemsChanged={viewable} viewabilityConfig={viewConfig} initialNumToRender={2} maxToRenderPerBatch={3} windowSize={5} removeClippedSubviews={false}
      ListHeaderComponent={<View>{header}<Status label={first === undefined ? t("mobile.common.loading") : items.length === 0 && next == null ? nativeProfileText(t, profile.isMe ? "emptySelf" : "emptyOther") : ""} busy={first === undefined} /></View>}
      renderItem={({ item }) => <View>{pinned.some(post => post._id === item._id) ? <Label muted>{nativeProfileText(t, "pinned")}</Label> : null}<NativePostCard post={item} active={guard.canAct && String(item._id) === activeId} onOpenPost={onOpenPost} {...navigation} /></View>}
      ListFooterComponent={<View style={{ paddingHorizontal: 14, paddingBottom: 24, gap: 8 }}><Status label={loadingMore ? t("mobile.common.loading") : ""} busy={loadingMore} />{canMore || loadingMore ? <Action label={nativeProfileText(t, "morePosts")} pending={loadingMore} disabled={!guard.canAct} onPress={() => { if (guard.current() && canMore && canAppendNativeCursor(cursors, next, PROFILE_MAX_PAGES)) setRequested([...cursors, next]) }} /> : null}{next != null && !canMore ? <Label muted>{t("mobile.common.windowLimit")}</Label> : null}</View>} />
  </View>
}

function PublicProfileBody({ handle, onOpenPost, ...navigation }: PublicProfileScreenProps) {
  const guard = useNativeGuard(), { t } = useNativeAppearance(), publishedHandle = nativePublishedProfileHandle(handle)
  const profile = useQuery(api.modules.people.profile.getPublicProfile, guard.canRead && publishedHandle ? { networkId: guard.runtime.networkId, handle: publishedHandle } : "skip")
  if (!guard.canRead) return <RuntimeNotice />
  if (!publishedHandle || profile === null) return <Card><Label strong>{nativeProfileText(t, "refusedTitle")}</Label><Label muted>{nativeProfileText(t, "refusedMessage")}</Label></Card>
  if (profile === undefined) return <Status label={t("mobile.common.loading")} busy />
  return <ProfilePublications key={profile.personId} profile={profile} header={<PublicProfileIdentity profile={profile} />} onOpenPost={onOpenPost} {...navigation} />
}

export function PublicProfileScreen(props: PublicProfileScreenProps) {
  const runtime = useNativeRuntime(), { t } = useNativeAppearance(), [version, setVersion] = useState(0)
  const scope = nativeScope(runtime) + ":public-profile:" + props.handle + ":" + version
  return <View style={{ flex: 1 }}><RuntimeNotice /><QueryBoundary key={scope} resetKey={scope} fallback={<RefreshFailure message={nativeProfileText(t, "profileUnavailable")} onRefresh={() => setVersion(value => value + 1)} />}><PublicProfileBody {...props} /></QueryBoundary></View>
}

function BookmarksWindow({ cursor, onPage }: { cursor: string | null; onPage: (key: string, result: Bookmarks | undefined) => void }) {
  const { canRead, canAct, current, runtime } = useNativeGuard()
  const page = useQuery(api.modules.marks.marks.paginateBookmarks, canRead ? { networkId: runtime.networkId, paginationOpts: { numItems: PROFILE_PAGE_SIZE, cursor } } : "skip")
  const key = nativeCursorKey(cursor)
  useEffect(() => { if (current()) onPage(key, page) }, [canAct, current, key, onPage, page])
  return null
}

function BookmarkRow({ item, onOpenPost }: { item: Bookmark; onOpenPost: OpenPost }) {
  const guard = useNativeGuard(), { tokens, t, locale } = useNativeAppearance(), toggleMark = useMutation(api.modules.marks.marks.toggleMark)
  const [pending, setPending] = useState(false), [failed, setFailed] = useState(false), busy = useRef(false), mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const identity = nativeBookmarkIdentity(item, nativeProfileText(t, "bookmarksUnknown"))
  const dates = nativeProfileText(t, "bookmarksDates", { published: nativeRelativeTime(item.publishedAt, Date.now(), locale, t), marked: nativeRelativeTime(item.markedAt, Date.now(), locale, t) })
  const remove = async () => {
    if (busy.current || !guard.current() || !guard.runtime.canWrite) return
    busy.current = true; setPending(true); setFailed(false)
    const current = guard.capture()
    try { await toggleMark({ networkId: guard.runtime.networkId, postId: item.postId, kind: "bookmark" }) }
    catch { if (current()) setFailed(true) }
    finally { busy.current = false; if (mounted.current) setPending(false) }
  }
  return <View style={{ marginBottom: 12, gap: 12, padding: 16, borderWidth: 1, borderColor: tokens.border, borderRadius: tokens.radiusCard, backgroundColor: tokens.card }}>
    <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}><ProfilePicture key={identity.imageUrl ?? identity.name} delivery={{ url: identity.imageUrl, withheld: null }} name={identity.name} size={40} square={identity.square} initialsAllowed={identity.hasIdentity} /><View style={{ flex: 1, minWidth: 0, gap: 3 }}><Text style={{ color: tokens.foreground, fontWeight: "600", fontSize: 15 }}>{identity.name}</Text><Text style={{ color: tokens.mutedForeground, fontSize: 12, lineHeight: 18 }}>{dates}</Text></View></View>
    {item.body ? <Text style={{ color: tokens.foreground, fontSize: 15, lineHeight: 23 }}>{item.body.length > 220 ? item.body.slice(0, 220) + "…" : item.body}</Text> : null}
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}><Action label={nativeProfileText(t, "bookmarksOpen")} disabled={!guard.canAct} onPress={() => { if (guard.current()) onOpenPost(item.postId) }} /><Action label={nativeProfileText(t, "bookmarksRemove")} pending={pending} disabled={!guard.canAct || !guard.runtime.canWrite || pending} onPress={() => { void remove() }} /></View>
    <Status label={failed ? nativeProfileText(t, "bookmarksRemoveFailed") : ""} error={failed} />
  </View>
}

function BookmarksBody({ onOpenPost }: { onOpenPost: OpenPost }) {
  const guard = useNativeGuard(), { t, tokens } = useNativeAppearance()
  const [requested, setRequested] = useState<(string | null)[]>([null]), [windows, setWindows] = useState<Record<string, Bookmarks | undefined>>({})
  const onPage = useCallback((key: string, page: Bookmarks | undefined) => setWindows(previous => previous[key] === page ? previous : { ...previous, [key]: page }), [])
  const nextCursor = (page: Bookmarks) => page.isDone ? null : page.continueCursor
  const cursors = nativeLinkedPageCursors<string, Bookmarks>(requested, cursor => windows[nativeCursorKey(cursor)], nextCursor, PROFILE_MAX_PAGES)
  const items = mergeNativePages(cursors.map(cursor => windows[nativeCursorKey(cursor)]?.page ?? []), item => String(item.postId), PROFILE_MAX_ITEMS)
  const first = windows.first, tail = windows[nativeCursorKey(cursors[cursors.length - 1] ?? null)], next = tail ? nextCursor(tail) : null
  const canMore = items.length < PROFILE_MAX_ITEMS && canAppendNativeCursor(cursors, next, PROFILE_MAX_PAGES), loadingMore = tail === undefined && cursors.length > 1
  if (!guard.canRead) return <RuntimeNotice />
  return <View style={{ flex: 1 }}>
    {cursors.map(cursor => <BookmarksWindow key={nativeCursorKey(cursor)} cursor={cursor} onPage={onPage} />)}
    <FlatList accessibilityLabel={nativeProfileText(t, "bookmarksLabel")} accessibilityState={{ busy: first === undefined || loadingMore }} data={items} keyExtractor={item => String(item.postId)} scrollEnabled={guard.canAct} contentContainerStyle={{ padding: 16 }} initialNumToRender={6} maxToRenderPerBatch={6} windowSize={5} removeClippedSubviews={false}
      ListHeaderComponent={<View style={{ gap: 12, paddingBottom: 16 }}><Text variant="display" accessibilityRole="header" style={{ color: tokens.foreground, fontSize: 24, fontWeight: "600" }}>{nativeProfileText(t, "bookmarksLabel")}</Text><Text style={{ color: tokens.mutedForeground, fontSize: 15, lineHeight: 23 }}>{nativeProfileText(t, "bookmarksHint")}</Text><Status label={first === undefined ? t("mobile.common.loading") : items.length === 0 && next == null ? nativeProfileText(t, "bookmarksEmpty") : ""} busy={first === undefined} /></View>}
      renderItem={({ item }) => <BookmarkRow item={item} onOpenPost={onOpenPost} />}
      ListFooterComponent={<View style={{ gap: 8, paddingBottom: 16 }}><Status label={loadingMore ? t("mobile.common.loading") : ""} busy={loadingMore} />{canMore || loadingMore ? <Action label={nativeProfileText(t, "bookmarksMore")} pending={loadingMore} disabled={!guard.canAct} onPress={() => { if (guard.current() && canMore && canAppendNativeCursor(cursors, next, PROFILE_MAX_PAGES)) setRequested([...cursors, next]) }} /> : null}{next != null && !canMore ? <Label muted>{t("mobile.common.windowLimit")}</Label> : null}</View>} />
  </View>
}

export function BookmarksScreen(props: { onOpenPost: OpenPost }) {
  const runtime = useNativeRuntime(), { t } = useNativeAppearance(), [version, setVersion] = useState(0)
  const scope = nativeScope(runtime) + ":bookmarks:" + version
  return <View style={{ flex: 1 }}><RuntimeNotice /><QueryBoundary key={scope} resetKey={scope} fallback={<RefreshFailure message={nativeProfileText(t, "bookmarksUnavailable")} onRefresh={() => setVersion(value => value + 1)} />}><BookmarksBody {...props} /></QueryBoundary></View>
}
