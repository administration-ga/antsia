import { NativeText as Text } from "../components/native-text"
import { api, type Id } from "@antsia/api/engine"
import { useMutation, useQuery } from "convex/react"
import type { FunctionReturnType } from "convex/server"
import { PERSONAL_REACTION_KINDS, type FeedScope, type PersonalReactionKind } from "@antsia/social-domain/content"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { FlatList, Image, Pressable, ScrollView, useWindowDimensions, View, type ViewToken } from "react-native"
import { useNativeAppearance } from "../appearance"
import { GuardedMedia } from "../components/guarded-media"
import { NativeIcon } from "../components/icon"
import { BusinessMedia } from "../components/business-media"
import { Action, Card, Label, QueryBoundary, RuntimeNotice, Status, nativeScope, useNativeGuard, useReducedMotion } from "../components/ui"
import { nativePagingAllowed } from "../lib/accessibility"
import { canAppendNativeCursor, mergeNativePages, nativeCursorKey } from "../lib/native-pagination"
import { useNativeRuntime } from "../runtime"
import { nativeBusinessPrice } from "../lib/native-business"
import { nativeFeedText, nativePostMetadata, nativePostTextParts, nativeReactionPresentation } from "../lib/feed-presentation"
import { PostOverflowAction, PostShareAction, PostSheet } from "./post-actions"
import { StoriesSection } from "./stories-section"

type Feed = FunctionReturnType<typeof api.modules.posts.posts.myFeed>
type Cursor = NonNullable<Feed["nextCursor"]>
export type NativeFeedPost = Feed["items"][number]
const PAGE_SIZE = 20, MAX_PAGES = 10

export type NativePostNavigation = { onOpenPage?: (handle: string) => void; onOpenOffer?: (handle: string, offerRef: string) => void; onOpenProfile?: (handle: string) => void; onSearchTag?: (tag: string) => void; onSharePost?: (postId: Id<"posts">) => void | Promise<void> }
type PostNavigation = NativePostNavigation
type ComposerProps = { onCompose?: () => void; onCreateStory?: () => void; displayName?: string }
type SuggestedPerson = FunctionReturnType<typeof api.modules.suggestions.suggestions.paginate>["page"][number]

function SuggestionAvatar({ url, name, square = false }: { url: string | null; name: string; square?: boolean }) {
  const { tokens } = useNativeAppearance(), [failed, setFailed] = useState(false)
  useEffect(() => setFailed(false), [url])
  return url && !failed ? <Image accessible={false} alt="" source={{ uri: url }} onError={() => setFailed(true)} style={{ width: 58, height: 58, borderRadius: square ? 12 : 29, backgroundColor: tokens.muted }} /> : <View accessible={false} style={{ width: 58, height: 58, borderRadius: square ? 12 : 29, backgroundColor: tokens.tabActive, alignItems: "center", justifyContent: "center" }}><Text style={{ color: tokens.tabActiveInk, fontWeight: "700", fontSize: 20 }}>{Array.from(name)[0]?.toLocaleUpperCase() ?? ""}</Text></View>
}

function SuggestionButton({ label, onPress, disabled, primary = false }: { label: string; onPress: () => void; disabled?: boolean; primary?: boolean }) {
  const { tokens } = useNativeAppearance()
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress} style={{ minHeight: 44, justifyContent: "center", flex: 1, opacity: disabled ? 0.5 : 1 }}><View style={{ minHeight: 28, paddingHorizontal: 10, paddingVertical: 5, alignItems: "center", justifyContent: "center", borderRadius: 8, backgroundColor: primary ? tokens.social : tokens.muted }}><Text style={{ color: primary ? tokens.socialOn : tokens.foreground, fontSize: 12, fontWeight: "600", textAlign: "center" }}>{label}</Text></View></Pressable>
}

function PeopleSuggestions({ onOpenProfile }: Pick<PostNavigation, "onOpenProfile">) {
  const guard = useNativeGuard(), { t, tokens } = useNativeAppearance()
  const suggestions = useQuery(api.modules.suggestions.suggestions.paginate, guard.canRead ? { networkId: guard.runtime.networkId, paginationOpts: { numItems: 20, cursor: null } } : "skip")
  const follow = useMutation(api.modules.graph.follows.follow), connect = useMutation(api.modules.graph.connections.requestConnection), dismiss = useMutation(api.modules.suggestions.suggestions.dismiss)
  const [retained, setRetained] = useState<SuggestedPerson[]>([]), [followed, setFollowed] = useState<ReadonlySet<string>>(new Set()), [dismissed, setDismissed] = useState<ReadonlySet<string>>(new Set())
  const [requested, setRequested] = useState<Record<string, "requested" | "accepted">>({})
  const [busy, setBusy] = useState<string | null>(null), [error, setError] = useState(""), [retryAt, setRetryAt] = useState(0), [now, setNow] = useState(Date.now)
  const lock = useRef(false), mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  useEffect(() => { if (retryAt <= Date.now()) return; const timer = setInterval(() => { const instant = Date.now(); setNow(instant); if (instant >= retryAt) clearInterval(timer) }, 1000); return () => clearInterval(timer) }, [retryAt])
  const rows = mergeNativePages([suggestions?.page ?? [], retained], person => person.handle).filter(person => !person.dismissed && !dismissed.has(person.handle)).slice(0, 6)
  const wait = Math.max(0, Math.ceil((retryAt - now) / 1000))
  const act = async (person: SuggestedPerson, kind: "follow" | "connect" | "dismiss") => {
    if (lock.current || !guard.current() || !guard.runtime.canWrite || kind === "connect" && retryAt > Date.now()) return
    lock.current = true; setBusy(person.handle); setError("")
    const current = guard.capture()
    try {
      if (kind === "follow") {
        await follow({ networkId: guard.runtime.networkId, handle: person.handle })
        if (current()) { setRetained(previous => previous.some(item => item.handle === person.handle) ? previous : [...previous, person]); setFollowed(previous => new Set([...previous, person.handle])) }
      } else if (kind === "connect") {
        const result = await connect({ networkId: guard.runtime.networkId, handle: person.handle, returnRateLimit: true })
        if (current() && result.status === "rateLimited") { setNow(Date.now()); setRetryAt(Date.now() + result.retryAfterMs) }
        else if (current() && result.status !== "rateLimited") { const status = result.status; setRequested(previous => ({ ...previous, [person.handle]: status })) }
      } else {
        await dismiss({ networkId: guard.runtime.networkId, handle: person.handle })
        if (current()) setDismissed(previous => new Set([...previous, person.handle]))
      }
    } catch { if (current()) setError(t("mobile.common.unavailable")) }
    finally { lock.current = false; if (mounted.current) setBusy(null) }
  }
  if (!guard.canRead || !rows.length) return null
  return <View style={{ paddingVertical: 12, gap: 8 }}><View style={{ paddingHorizontal: 14 }}><Label strong accessibilityRole="header">{t("mobile.feedUi.peopleSuggestions")}</Label></View><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 14, gap: 10 }}>{rows.map(person => <View key={person.handle} style={{ width: 176, borderRadius: 16, padding: 12, gap: 6, backgroundColor: tokens.card, borderWidth: 1, borderColor: tokens.border }}>
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}><SuggestionAvatar url={person.avatarUrl} name={person.displayName} /><Pressable accessibilityRole="button" accessibilityLabel={t("mobile.feedUi.dismissSuggestion")} disabled={!guard.canAct || busy !== null || !guard.runtime.canWrite} onPress={() => { void act(person, "dismiss") }} style={{ width: 44, minHeight: 44, alignItems: "center", justifyContent: "center" }}><NativeIcon name="close" size={16} /></Pressable></View>
    <Pressable accessibilityRole="button" accessibilityLabel={nativeFeedText(t, "openProfile", { name: person.displayName })} disabled={!guard.canAct || !onOpenProfile} onPress={() => { if (guard.current()) onOpenProfile?.(person.handle) }} style={{ minHeight: 44, justifyContent: "center" }}><Text numberOfLines={1} style={{ color: tokens.foreground, fontSize: 14, fontWeight: "700" }}>{person.displayName}</Text><Text numberOfLines={1} style={{ color: tokens.mutedForeground, fontSize: 12 }}>@{person.handle}</Text></Pressable>
    {person.headline ? <Text numberOfLines={2} style={{ minHeight: 32, color: tokens.mutedForeground, fontSize: 12, lineHeight: 16 }}>{person.headline}</Text> : null}
    <View style={{ flexDirection: "row", gap: 6 }}><SuggestionButton primary label={t(followed.has(person.handle) ? "mobile.feedUi.followed" : person.followsYou ? "mobile.feedUi.followBack" : "mobile.feedUi.follow")} disabled={!guard.canAct || !guard.runtime.canWrite || busy !== null || followed.has(person.handle)} onPress={() => { void act(person, "follow") }} />{person.relationState === "none" && !requested[person.handle] ? <SuggestionButton label={t("mobile.feedUi.add")} disabled={!guard.canAct || !guard.runtime.canWrite || busy !== null || wait > 0} onPress={() => { void act(person, "connect") }} /> : null}</View>
    {person.relationState !== "none" ? <Text style={{ color: tokens.mutedForeground, fontSize: 12 }}>{t(person.relationState === "requested_by_me" ? "mobile.feedUi.requestSent" : "mobile.feedUi.requestReceived")}</Text> : null}
    {person.relationState === "none" && requested[person.handle] ? <Text style={{ color: tokens.mutedForeground, fontSize: 12 }}>{t(requested[person.handle] === "accepted" ? "mobile.feedUi.connected" : "mobile.feedUi.requestPending")}</Text> : null}
  </View>)}</ScrollView><View style={{ paddingHorizontal: 14 }}><Status error label={error} />{wait > 0 ? <Label muted>{nativeFeedText(t, "requestWait", { count: wait })}</Label> : null}</View></View>
}

function PageSuggestions({ onOpenPage }: Pick<PostNavigation, "onOpenPage">) {
  const guard = useNativeGuard(), { t, tokens } = useNativeAppearance()
  const pages = useQuery(api.modules.pages.pages.discover, guard.canRead ? { networkId: guard.runtime.networkId, limit: 8 } : "skip")
  const follow = useMutation(api.modules.pages.pages.follow)
  const [followed, setFollowed] = useState<ReadonlySet<string>>(new Set()), [busy, setBusy] = useState<string | null>(null), [error, setError] = useState(false)
  const lock = useRef(false), mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const rows = pages?.filter(page => !page.following && !followed.has(page.handle)).slice(0, 6) ?? []
  const followPage = async (handle: string) => {
    if (lock.current || !guard.current() || !guard.runtime.canWrite) return
    lock.current = true; setBusy(handle); setError(false)
    const current = guard.capture()
    try { await follow({ networkId: guard.runtime.networkId, handle }); if (current()) setFollowed(previous => new Set([...previous, handle])) }
    catch { if (current()) setError(true) }
    finally { lock.current = false; if (mounted.current) setBusy(null) }
  }
  if (!guard.canRead) return null
  if (pages === undefined || !rows.length) return <View style={{ marginHorizontal: 14, marginVertical: 12, padding: 16, gap: 8, borderRadius: tokens.radiusCard, backgroundColor: tokens.card }}><Label strong accessibilityRole="header">{t("mobile.feedUi.pageSuggestions")}</Label><Status busy={pages === undefined} label={pages === undefined ? t("mobile.common.loading") : t("mobile.feedUi.pageSuggestionsEmpty")} /></View>
  return <View style={{ paddingVertical: 12, gap: 8 }}><View style={{ paddingHorizontal: 14 }}><Label strong accessibilityRole="header">{t("mobile.feedUi.pageSuggestions")}</Label></View><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 14, gap: 10 }}>{rows.map(page => <View key={String(page.pageId)} style={{ width: 176, borderRadius: 16, padding: 12, gap: 6, backgroundColor: tokens.card, borderWidth: 1, borderColor: tokens.border }}>
    <SuggestionAvatar url={page.logoUrl} name={page.name} square />
    <Pressable accessibilityRole="button" accessibilityLabel={`${t("mobile.post.openPage")} · ${page.name}`} disabled={!guard.canAct || !onOpenPage} onPress={() => { if (guard.current()) onOpenPage?.(page.handle) }} style={{ minHeight: 44, justifyContent: "center" }}><Text numberOfLines={2} style={{ color: tokens.foreground, fontSize: 14, fontWeight: "700" }}>{page.name}</Text></Pressable>
    {page.badge !== "community" ? <Text style={{ color: tokens.primaryInk, fontSize: 12 }}>{t(`mobile.feedUi.${page.badge}`)}</Text> : null}
    <Text style={{ color: tokens.mutedForeground, fontSize: 12 }}>{nativeFeedText(t, page.followerCount === 1 ? "follower" : "followers", { count: page.followerCount })}</Text>
    <SuggestionButton primary label={t("mobile.feedUi.follow")} disabled={!guard.canAct || !guard.runtime.canWrite || busy !== null} onPress={() => { void followPage(page.handle) }} />
  </View>)}</ScrollView><View style={{ paddingHorizontal: 14 }}><Status error label={error ? t("mobile.common.unavailable") : ""} /></View></View>
}

function FeedSuggestions({ onOpenPage, onOpenProfile }: Pick<PostNavigation, "onOpenPage" | "onOpenProfile">) {
  const guard = useNativeGuard()
  return <View><QueryBoundary resetKey={`${guard.owner}:people`} fallback={null}><PeopleSuggestions onOpenProfile={onOpenProfile} /></QueryBoundary><QueryBoundary resetKey={`${guard.owner}:pages`} fallback={null}><PageSuggestions onOpenPage={onOpenPage} /></QueryBoundary></View>
}

function FeedIconButton({ name, label, visibleLabel, showIcon = true, onPress, onLongPress, disabled = false, selected, pending = false, count }: { name: "heart" | "comment" | "bookmark" | "refresh" | "list" | "grid"; label: string; visibleLabel?: string; showIcon?: boolean; onPress: () => void; onLongPress?: () => void; disabled?: boolean; selected?: boolean; pending?: boolean; count?: number }) {
  const { tokens, t } = useNativeAppearance()
  const ink = selected ? name === "heart" ? tokens.react : tokens.primaryInk : tokens.foreground
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: disabled || pending, busy: pending, selected }} disabled={disabled || pending} onPress={onPress} onLongPress={onLongPress} accessibilityActions={onLongPress ? [{ name: "longpress", label: t("mobile.feedUi.chooseReaction") }] : undefined} onAccessibilityAction={onLongPress ? event => { if (event.nativeEvent.actionName === "longpress") onLongPress() } : undefined} style={({ pressed }) => ({ minWidth: 44, minHeight: 44, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderRadius: 12, backgroundColor: selected && name !== "heart" && name !== "bookmark" ? tokens.tabActive : undefined, opacity: disabled || pending ? 0.45 : pressed ? 0.65 : 1 })}>
    {showIcon ? <NativeIcon name={name} size={22} color={ink} /> : null}
    {visibleLabel ? <Text style={{ color: ink, fontSize: 13, fontWeight: "600" }}>{visibleLabel}</Text> : null}
    {count !== undefined && count > 0 ? <Text style={{ color: ink, fontSize: 13, fontWeight: "600" }}>{count}</Text> : null}
  </Pressable>
}

function PostOfferAction({ postId, hasPostMedia, onOpenOffer }: { postId: Id<"posts">; hasPostMedia: boolean; onOpenOffer: (handle: string, offerRef: string) => void }) {
  const guard = useNativeGuard(), { t, tokens, locale } = useNativeAppearance()
  const offer = useQuery(api.modules.shops.catalog.postOffer, guard.canRead ? { networkId: guard.runtime.networkId, postId } : "skip")
  if (!guard.canRead) return null
  if (offer === undefined) return <Status label={t("mobile.common.loading")} busy />
  if (!offer) return <Label muted>{t("mobile.common.unavailable")}</Label>
  const action = offer.shopTemplate === "food" ? "order" : offer.price.mode === "quote" ? "getQuote" : offer.kind === "service" ? "reserve" : "buy"
  return <View style={{ gap: 10, padding: 14, backgroundColor: tokens.muted }}>
    {!hasPostMedia ? <BusinessMedia media={offer.media} compact /> : null}
    <Label strong>{offer.title}</Label><Label strong>{nativeBusinessPrice(offer.price, locale, t)}</Label>
    <Action label={t(`mobile.feedUi.${action}`)} accessibilityLabel={`${t(`mobile.feedUi.${action}`)} · ${offer.title}`} disabled={!guard.canAct} onPress={() => { if (guard.current()) onOpenOffer(offer.shopHandle, offer.offerRef) }} />
  </View>
}

export function NativePostText({ body, collapsed, onSearchTag, onOpenProfile }: { body: string; collapsed?: boolean; onSearchTag?: (tag: string) => void; onOpenProfile?: (handle: string) => void }) {
  const guard = useNativeGuard(), { t, tokens } = useNativeAppearance(), [expanded, setExpanded] = useState(false)
  return <View style={{ gap: 4 }}><Text selectable numberOfLines={collapsed && !expanded ? 3 : undefined} style={{ color: tokens.foreground, fontSize: 15, lineHeight: 23 }}>{nativePostTextParts(body).map((part, index) => {
    const open = part.kind === "tag" ? onSearchTag : part.kind === "mention" ? onOpenProfile : undefined
    return <Text key={index} accessibilityRole={open ? "link" : undefined} onPress={open && guard.canAct ? () => { if (guard.current()) open(part.value) } : undefined} style={open ? { color: tokens.primaryInk, fontWeight: "600" } : undefined}>{part.text}</Text>
  })}</Text>{collapsed && body.length > 140 ? <Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={() => setExpanded(value => !value)} style={{ minHeight: 44, justifyContent: "center" }}><Text style={{ color: tokens.mutedForeground, fontSize: 14, fontWeight: "600" }}>{t(expanded ? "mobile.feedUi.showLess" : "mobile.feedUi.showMore")}</Text></Pressable> : null}</View>
}

export function NativePostCard({ post, active, compact = false, edgeToEdge = false, onOpenPost, onOpenPage, onOpenOffer, onOpenProfile, onSearchTag, onSharePost }: { post: NativeFeedPost; active: boolean; compact?: boolean; edgeToEdge?: boolean; onOpenPost?: (postId: Id<"posts">) => void } & PostNavigation) {
  const { tokens, t, locale } = useNativeAppearance(), guard = useNativeGuard()
  const toggleReaction = useMutation(api.modules.engagement.engagement.toggleReaction)
  const toggleMark = useMutation(api.modules.marks.marks.toggleMark)
  const [pending, setPending] = useState<"reaction" | "bookmark" | null>(null), [actionError, setActionError] = useState(false)
  const [reactionChoices, setReactionChoices] = useState(false)
  const pendingRef = useRef(false), mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const media = compact ? post.media.slice(0, 1) : post.media
  const author = post.page?.name ?? post.author.displayName ?? t("mobile.post.unknownAuthor")
  const pageHandle = post.page?.handle
  const avatarUrl = post.page ? post.page.logoUrl : post.author.avatarUrl
  const [avatarFailed, setAvatarFailed] = useState(false)
  useEffect(() => { setAvatarFailed(false) }, [avatarUrl])
  const initials = author.trim().split(/\s+/).slice(0, 2).map(word => Array.from(word)[0] ?? "").join("").toLocaleUpperCase(locale)
  const metadata = nativePostMetadata(post, Date.now(), locale, t)
  const reaction = nativeReactionPresentation(post.reactions.mine, post.reactions.total, t)
  const textOnly = media.length === 0 && post.share === null
  const body = post.body ? <NativePostText body={post.body} collapsed={!textOnly || compact} onSearchTag={onSearchTag} onOpenProfile={onOpenProfile} /> : null
  const badges = (post.page ? [post.page.badge] : post.author.badges).filter(badge => badge !== "community")
  const identity = <><View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 5 }}><Label strong accessibilityRole="header">{author}</Label>{badges.map(badge => <Text key={badge} accessibilityLabel={t(`mobile.feedUi.${badge}`)} style={{ color: tokens.primaryInk, fontSize: 12, fontWeight: "700" }}>{badge === "verified" ? "✓" : t(`mobile.feedUi.${badge}`)}</Text>)}</View><Text accessibilityLabel={`${metadata.visible}. ${metadata.context}`} style={{ color: tokens.mutedForeground, fontSize: 12, lineHeight: 18 }}>{metadata.visible}</Text></>
  const offerScope = nativeScope(guard.runtime) + ":post-offer:" + post._id
  const act = async (kind: "reaction" | "bookmark", reactionKind?: PersonalReactionKind) => {
    if (pendingRef.current || !guard.current() || !guard.runtime.canWrite) return
    pendingRef.current = true; setPending(kind); setActionError(false)
    const current = guard.capture()
    try {
      if (kind === "reaction") await toggleReaction({ networkId: guard.runtime.networkId, postId: post._id, kind: reactionKind ?? post.reactions.mine ?? "like" })
      else await toggleMark({ networkId: guard.runtime.networkId, postId: post._id, kind: "bookmark" })
      if (current()) setReactionChoices(false)
    } catch { if (current()) setActionError(true) }
    finally { pendingRef.current = false; if (mounted.current) setPending(null) }
  }
  if (!guard.canRead) return null
  return <View style={{ marginBottom: 16, backgroundColor: tokens.card, borderRadius: edgeToEdge ? 0 : tokens.radiusCard, overflow: "hidden" }}>
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 12 }}>
      {avatarUrl && !avatarFailed ? <Image accessible={false} alt="" source={{ uri: avatarUrl }} onError={() => setAvatarFailed(true)} style={{ width: 40, height: 40, borderRadius: post.page ? 12 : 20, backgroundColor: tokens.muted }} /> : <View accessible={false} style={{ width: 40, height: 40, borderRadius: post.page ? 12 : 20, alignItems: "center", justifyContent: "center", backgroundColor: tokens.tabActive }}><Text style={{ color: tokens.tabActiveInk, fontSize: 15, fontWeight: "700" }}>{initials}</Text></View>}
      <View style={{ flex: 1, minWidth: 0 }}>
        {pageHandle && onOpenPage ? <Pressable accessibilityRole="button" accessibilityLabel={`${t("mobile.post.openPage")} · ${author}`} disabled={!guard.canAct} onPress={() => { if (guard.current()) onOpenPage(pageHandle) }} style={{ minHeight: 44, justifyContent: "center" }}>{identity}</Pressable> : !post.page && post.author.handle && onOpenProfile ? <Pressable accessibilityRole="button" accessibilityLabel={nativeFeedText(t, "openProfile", { name: author })} disabled={!guard.canAct} onPress={() => { if (guard.current() && post.author.handle) onOpenProfile(post.author.handle) }} style={{ minHeight: 44, justifyContent: "center" }}>{identity}</Pressable> : identity}
      </View>
      <PostOverflowAction post={post} />
    </View>
    {textOnly && body ? <View style={{ paddingHorizontal: 14, paddingBottom: 8 }}>{body}</View> : null}
    <GuardedMedia items={media} active={active} edgeToEdge={edgeToEdge} />
    {post.hasCommerceOffer && onOpenOffer ? <QueryBoundary key={offerScope} resetKey={offerScope} fallback={<Label muted>{t("mobile.common.unavailable")}</Label>}><PostOfferAction postId={post._id} hasPostMedia={media.length > 0} onOpenOffer={onOpenOffer} /></QueryBoundary> : null}
    <View style={{ flexDirection: "row", alignItems: "center", gap: 2, paddingHorizontal: 4, paddingTop: 2 }}>
      <FeedIconButton name="heart" label={reaction.accessibilityLabel} visibleLabel={reaction.label} showIcon={reaction.kind === "like"} selected={reaction.selected} count={post.reactions.total} pending={pending === "reaction"} disabled={!guard.canAct || !guard.runtime.canWrite || pending !== null} onPress={() => { void act("reaction") }} onLongPress={() => setReactionChoices(true)} />
      <Pressable accessibilityRole="button" accessibilityLabel={t("mobile.feedUi.chooseReaction")} accessibilityState={{ expanded: reactionChoices, disabled: !guard.canAct || !guard.runtime.canWrite || pending !== null }} disabled={!guard.canAct || !guard.runtime.canWrite || pending !== null} onPress={() => { if (guard.current()) setReactionChoices(true) }} style={{ minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" }}><Text accessible={false} style={{ color: tokens.react, fontSize: 22 }}>⌄</Text></Pressable>
      {onOpenPost ? <FeedIconButton name="comment" label={`${t("mobile.post.open")} · ${t("mobile.post.comments")} ${post.commentCount}`} count={post.commentCount} disabled={!guard.canAct} onPress={() => { if (guard.current()) onOpenPost(post._id) }} /> : <View style={{ minHeight: 44, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10 }} accessible accessibilityLabel={`${t("mobile.post.comments")} ${post.commentCount}`}><NativeIcon name="comment" color={tokens.foreground} size={22} /><Text style={{ color: tokens.foreground, fontSize: 13 }}>{post.commentCount}</Text></View>}
      <PostShareAction post={post} onSharePost={onSharePost} />
      <View style={{ flex: 1 }} />
      <FeedIconButton name="bookmark" label={t(post.viewer.bookmarked ? "mobile.post.unsave" : "mobile.post.save")} selected={post.viewer.bookmarked} pending={pending === "bookmark"} disabled={!guard.canAct || !guard.runtime.canWrite || pending !== null} onPress={() => { void act("bookmark") }} />
    </View>
    <View style={{ gap: 8, paddingHorizontal: 14, paddingBottom: 14 }}>
    {!textOnly ? body : null}
    {compact && post.media.length > 1 ? <Label muted>{t("mobile.media.moreOnPost")}</Label> : null}
    {post.share ? post.share.available ? <View style={{ gap: 8, padding: 12, borderRadius: tokens.radiusCard, backgroundColor: tokens.muted }}>
      <Label strong>{post.share.page?.name ?? post.share.author.displayName ?? t("mobile.post.unknownAuthor")}</Label>
      <NativePostText body={post.share.body} onSearchTag={onSearchTag} onOpenProfile={onOpenProfile} />
      {!compact ? <GuardedMedia items={post.share.media} active={active && !post.media.some(item => item.kind === "video" && item.url !== null && item.withheld === null)} /> : null}
    </View> : <Label muted>{t("mobile.post.shareUnavailable")}</Label> : null}
    <Status label={actionError ? t("mobile.common.unavailable") : ""} error={actionError} />
    <PostSheet title={t("mobile.feedUi.chooseReaction")} open={reactionChoices} onClose={() => setReactionChoices(false)}><View style={{ padding: 20, gap: 10 }}>{PERSONAL_REACTION_KINDS.map(kind => <Action key={kind} label={t(`mobile.feedUi.reaction.${kind}`)} accessibilityRole="radio" checked={post.reactions.mine === kind} disabled={!guard.canAct || !guard.runtime.canWrite || pending !== null} onPress={() => { void act("reaction", kind) }} />)}</View></PostSheet>
    </View>
  </View>
}
function FeedPage({ cursor, onPage, scope, tag }: { cursor: Cursor | null; onPage: (key: string, page: Feed | undefined) => void; scope: FeedScope; tag?: string }) {
  const guard = useNativeGuard()
  const page = useQuery(api.modules.posts.posts.myFeed, guard.canRead ? { networkId: guard.runtime.networkId, limit: PAGE_SIZE, ...(scope === "recents" ? { scope } : {}), ...(tag ? { tag } : {}), ...(cursor ? { cursor } : {}) } : "skip")
  const key = nativeCursorKey(cursor)
  useEffect(() => { if (guard.canRead) onPage(key, page) }, [guard.canRead, key, onPage, page])
  return null
}
function FeedBody({ onOpenPost, focused, refresh, onCreateStory, scope, tag, onScopeChange, immersive, onImmersiveChange, ...navigation }: { onOpenPost: (postId: Id<"posts">) => void; focused: boolean; refresh: () => void; scope: FeedScope; tag?: string; onScopeChange: (scope: FeedScope) => void; immersive: boolean; onImmersiveChange: (immersive: boolean) => void } & PostNavigation & ComposerProps) {
  const guard = useNativeGuard(), { t, tokens } = useNativeAppearance()
  const reducedMotion = useReducedMotion(), { fontScale } = useWindowDimensions()
  const [cursors, setCursors] = useState<(Cursor | null)[]>([null])
  const [pages, setPages] = useState<Record<string, Feed | undefined>>({})
  const [height, setHeight] = useState(0), [activeId, setActiveId] = useState<string | null>(null)
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
  const viewable = useCallback(({ viewableItems }: { viewableItems: ViewToken<NativeFeedPost>[] }) => {
    const firstVisible = viewableItems.find(item => item.isViewable)
    setActiveId(firstVisible ? String(firstVisible.item._id) : null)
  }, [])
  const viewConfig = useMemo(() => ({ itemVisiblePercentThreshold: 60 }), [])
  const { canAct, capture } = guard, networkId = guard.runtime.networkId
  useEffect(() => {
    if (!first?.preparing || !canAct || !focused) return
    const key = first.preparationKey ?? "preparing"
    if (prepared.current === key) return
    prepared.current = key
    const current = capture()
    void prepare({ networkId }).catch(() => { if (current()) setPreparationError(true) })
  }, [first?.preparing, first?.preparationKey, focused, canAct, capture, networkId, prepare])
  if (!guard.canRead) return <Label>{t("mobile.common.privateUnavailable")}</Label>
  return <View style={{ flex: 1 }}>
    {cursors.map(cursor => <FeedPage key={nativeCursorKey(cursor)} cursor={cursor} onPage={onPage} scope={scope} tag={tag} />)}
    <View style={{ flex: 1 }} onLayout={event => setHeight(event.nativeEvent.layout.height)}>
      <FlatList key={immersive ? "immersive" : "list"} accessibilityLabel={t("mobile.feed.title")} accessibilityState={{ busy: first === undefined || loadingMore }} data={items} keyExtractor={post => String(post._id)} scrollEnabled={guard.canAct} pagingEnabled={paging} decelerationRate={paging ? "fast" : "normal"} showsVerticalScrollIndicator={!paging} onViewableItemsChanged={viewable} viewabilityConfig={viewConfig} initialNumToRender={2} maxToRenderPerBatch={3} windowSize={5} removeClippedSubviews={false} refreshing={first === undefined && guard.canAct} onRefresh={() => { if (guard.current()) refresh() }}
        ListHeaderComponent={<View style={{ paddingHorizontal: 14, paddingBottom: 6 }}>
    <RuntimeNotice />
    {tag ? <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 6 }}><View style={{ flex: 1 }}><Label strong>#{tag}</Label></View>{navigation.onSearchTag ? <Action label={t("mobile.navigation.clearTag")} onPress={() => { if (guard.current()) navigation.onSearchTag?.("") }} /> : null}</View> : null}
    {!tag ? <QueryBoundary resetKey={guard.owner} fallback={<Status error label={t("mobile.common.unavailable")} />}><StoriesSection onCreateStory={onCreateStory} onOpenOffer={navigation.onOpenOffer} focused={focused} /></QueryBoundary> : null}
    <View accessibilityRole="tablist" style={{ flexDirection: "row", gap: 8, paddingTop: 12, paddingBottom: 6 }}>{(["pour_vous", "recents"] as const).map(value => <Pressable key={value} accessibilityRole="tab" accessibilityState={{ selected: scope === value }} onPress={() => { if (guard.current()) onScopeChange(value) }} style={{ minHeight: 44, paddingHorizontal: 16, alignItems: "center", justifyContent: "center", borderRadius: 9, backgroundColor: scope === value ? tokens.primary : tokens.muted }}><Text style={{ color: scope === value ? tokens.primaryOn : tokens.mutedForeground, fontSize: 13, fontWeight: "600" }}>{t(`mobile.feedUi.${value}`)}</Text></Pressable>)}</View>
    <Text style={{ fontSize: 12, lineHeight: 18, color: tokens.mutedForeground }}>{t(scope === "pour_vous" ? "mobile.navigation.scopeForYou" : "mobile.navigation.scopeRecent")}</Text>
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 6, paddingVertical: 6 }}>
      <View style={{ flex: 1 }} />
      {([false, true] as const).map(value => <Pressable key={String(value)} accessibilityRole="radio" accessibilityLabel={t(value ? "mobile.feedUi.immersive" : "mobile.feedUi.list")} accessibilityState={{ checked: immersive === value, disabled: !guard.canAct }} disabled={!guard.canAct} onPress={() => { if (guard.current()) { setActiveId(null); onImmersiveChange(value) } }} style={{ minHeight: 44, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: immersive === value ? tokens.tabActive : tokens.muted, borderRadius: 12 }}><NativeIcon name={value ? "grid" : "list"} size={18} color={immersive === value ? tokens.tabActiveInk : tokens.foreground} /><Text style={{ fontSize: 13, fontWeight: "600", color: immersive === value ? tokens.tabActiveInk : tokens.foreground }}>{t(value ? "mobile.feedUi.immersive" : "mobile.feedUi.list")}</Text></Pressable>)}
    </View>
    <Status label={first?.preparing ? t("mobile.feed.preparing") : ""} busy={first?.preparing === true} />
    <Status label={cursors.some(cursor => pages[nativeCursorKey(cursor)]?.lacunar) ? t("mobile.feed.lacunar") : ""} />
    <Status label={preparationError ? t("mobile.common.unavailable") : ""} error />
    <Status label={first === undefined ? t("mobile.common.loading") : items.length === 0 ? t("mobile.feed.empty") : ""} busy={first === undefined} />
    {first !== undefined && items.length === 0 && !tag && !immersive ? <FeedSuggestions onOpenPage={navigation.onOpenPage} onOpenProfile={navigation.onOpenProfile} /> : null}
        </View>}
        renderItem={({ item, index }) => <View style={paging ? { minHeight: height, paddingBottom: 8 } : undefined}><NativePostCard post={item} edgeToEdge compact={immersive} active={focused && String(item._id) === activeId} onOpenPost={onOpenPost} {...navigation} />{!tag && !immersive && index === Math.min(2, items.length - 1) ? <FeedSuggestions onOpenPage={navigation.onOpenPage} onOpenProfile={navigation.onOpenProfile} /> : null}</View>}
        ListFooterComponent={<View style={{ gap: 8, paddingHorizontal: 14, paddingBottom: 12 }}>
          <Status label={loadingMore ? t("mobile.common.loading") : ""} busy={loadingMore} />
          {canMore || loadingMore ? <Action label={t("mobile.common.loadMore")} pending={loadingMore} disabled={!guard.canAct} onPress={() => { if (guard.current() && canAppendNativeCursor(cursors, next, MAX_PAGES)) setCursors(previous => [...previous, next]) }} /> : null}
          {next !== null && next !== undefined && !canMore ? <Label muted>{t("mobile.common.windowLimit")}</Label> : null}
        </View>} />
    </View>
  </View>
}
export function FeedScreen({ onOpenPost, focused = true, tag, ...navigation }: { onOpenPost: (postId: Id<"posts">) => void; focused?: boolean; tag?: string } & PostNavigation & ComposerProps) {
  const runtime = useNativeRuntime(), { t, tokens } = useNativeAppearance()
  const [version, setVersion] = useState(0), [scope, setScope] = useState<FeedScope>("pour_vous")
  // Query resets must not reset the member's chosen display mode.
  const [immersive, setImmersive] = useState(false)
  const key = JSON.stringify([nativeScope(runtime), scope, tag ?? null, version])
  return <View style={{ flex: 1, backgroundColor: tokens.background }}>

    {!runtime.ready ? <RuntimeNotice /> : <QueryBoundary key={key} resetKey={key} fallback={<Card><Status label={t("mobile.common.unavailable")} error /><Action label={t("mobile.common.refresh")} disabled={!runtime.foreground || !runtime.online} onPress={() => { if (runtime.isCurrent() && runtime.foreground && runtime.online) setVersion(value => value + 1) }} /></Card>}><FeedBody onOpenPost={onOpenPost} focused={focused} refresh={() => setVersion(value => value + 1)} scope={scope} tag={tag} onScopeChange={setScope} immersive={immersive} onImmersiveChange={setImmersive} {...navigation} /></QueryBoundary>}
  </View>
}
