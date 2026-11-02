import { NativeText as Text } from "../components/native-text"
import { useEffect, useState, type ReactNode } from "react"
import { AppState, Image, Linking, Pressable, ScrollView, View } from "react-native"
import { useQuery } from "convex/react"
import { useVideoPlayer, VideoView } from "expo-video"
import { api, type Id } from "@antsia/api/engine"
import { BRAND_NAME } from "@antsia/social-contracts/brand"
import type { PostMediaDto } from "@antsia/social-contracts/media"
import type { PublicAuthor, PublicPost } from "@antsia/social-contracts/publicNetwork"
import { GABON_PROVINCES, type ProvinceSlug } from "@antsia/social-domain/provinces"
import { splitBodyRich } from "@antsia/social-domain/richText"
import { useNativeAppearance } from "../appearance"
import { NativeIcon } from "../components/icon"
import { Action, Label, QueryBoundary, Status } from "../components/ui"
import { nativeBusinessMediaUrl, nativeBusinessPrice } from "../lib/native-business"
import { nativeEntryText, nativePublicNext, type NativePublicLegalKind } from "../lib/native-entry-model"
import { nativeWebRoutes } from "../lib/routes"

type PublicRoute = { name: "discover" } | { name: "post"; id: string } | { name: "profile"; handle: string; kind: "person" | "page" }
type PublicNavigation = { openPost: (id: string) => void; openProfile: (handle: string, kind: "person" | "page") => void; openTag: (tag: string) => void; onSignIn?: (postId?: string) => void }
export type PublicEntryScreenProps = {
  kind?: "discover" | NativePublicLegalKind
  onClose?: () => void
  onSignIn?: (postId?: string) => void
  webUrl?: string
}
const LEGAL_SECTIONS = { about: ["purpose", "contexts", "trust"], legal: ["publisher", "law", "publication"], privacy: ["controller", "data", "profile", "cookies", "recipients", "retention", "device", "rights"] } as const
function usePublicForeground() {
  const [foreground, setForeground] = useState(AppState.currentState === "active")
  useEffect(() => { const listener = AppState.addEventListener("change", state => setForeground(state === "active")); return () => listener.remove() }, [])
  return foreground
}
function PublicLink({ children, onPress }: { children: ReactNode; onPress: () => void }) {
  const { tokens } = useNativeAppearance()
  return <Pressable accessibilityRole="button" onPress={onPress} style={{ minHeight: 44, justifyContent: "center", paddingVertical: 8 }}><Text style={{ color: tokens.primaryInk, fontSize: 14, lineHeight: 20, textDecorationLine: "underline" }}>{children}</Text></Pressable>
}
function PublicImage({ url, label, webUrl, ratio = 1.5, portrait = false, square = false }: { url: string | null; label: string; webUrl?: string; ratio?: number; portrait?: boolean; square?: boolean }) {
  const { tokens, t } = useNativeAppearance(), [failed, setFailed] = useState(false)
  const safe = nativeBusinessMediaUrl(url, webUrl)
  if (!safe || failed) return portrait ? <View style={{ width: 44, height: 44, borderRadius: square ? 10 : 22, backgroundColor: tokens.muted, alignItems: "center", justifyContent: "center" }}><NativeIcon name="user" color={tokens.mutedForeground} size={22} /></View> : url ? <Label muted>{t("mobile.public.media.unavailable")}</Label> : null
  return <Image source={{ uri: safe }} alt={label} accessibilityLabel={label} accessible={!portrait} resizeMode={portrait ? "cover" : "contain"} onError={() => setFailed(true)} style={portrait ? { width: 44, height: 44, borderRadius: square ? 10 : 22, backgroundColor: tokens.muted } : { width: "100%", aspectRatio: Math.max(0.3, Math.min(3, ratio)), maxHeight: 600, borderRadius: tokens.radiusMedia, backgroundColor: tokens.muted }} />
}
function PublicVideo({ url }: { url: string }) {
  const player = useVideoPlayer({ uri: url }, instance => { instance.loop = false; instance.muted = true })
  useEffect(() => () => { try { player.pause() } catch { /* useVideoPlayer owns final disposal. */ } }, [player])
  return <VideoView player={player} nativeControls contentFit="contain" style={{ width: "100%", height: 240 }} />
}
function PublicMedia({ items, webUrl, owner, activeVideo, onVideo }: { items: readonly PostMediaDto[]; webUrl?: string; owner: string; activeVideo: string | null; onVideo: (key: string) => void }) {
  const { tokens, t } = useNativeAppearance()
  return <View style={{ gap: 10 }}>{items.slice(0, 20).map((item, index) => {
    const key = `${owner}:${index}:${item.url ?? item.withheld}`
    if (item.withheld !== null || !item.url) return <Label muted key={key}>{t(item.withheld === "fileQuarantined" ? "mobile.public.media.quarantined" : item.withheld === "fileScanPending" ? "mobile.public.media.pending" : "mobile.public.media.unavailable")}</Label>
    const safe = nativeBusinessMediaUrl(item.url, webUrl)
    if (!safe) return <Label muted key={key}>{t("mobile.public.media.unavailable")}</Label>
    if (item.kind === "video") return <View key={key} style={{ borderRadius: tokens.radiusMedia, backgroundColor: tokens.muted, overflow: "hidden" }}>{activeVideo === key ? <PublicVideo url={safe} /> : <Pressable accessibilityRole="button" accessibilityLabel={item.altText ?? t("mobile.public.media.video")} onPress={() => onVideo(key)} style={{ minHeight: 120, alignItems: "center", justifyContent: "center", gap: 8 }}><NativeIcon name="play" size={30} /><Text style={{ color: tokens.foreground }}>{t("mobile.public.media.video")}</Text></Pressable>}</View>
    return <PublicImage key={key} url={safe} webUrl={webUrl} label={item.altText ?? t("mobile.public.media.image")} ratio={item.width && item.height && item.width > 0 && item.height > 0 ? item.width / item.height : 1.5} />
  })}</View>
}
function PublicIdentity({ author, webUrl, openProfile }: { author: PublicAuthor; webUrl?: string; openProfile?: PublicNavigation["openProfile"] }) {
  const { tokens, t } = useNativeAppearance(), label = author.displayName ?? t("mobile.public.post.withdrawnAuthor")
  return <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
    <PublicImage key={author.avatarUrl} portrait square={author.kind === "page"} url={author.avatarUrl} label={label} webUrl={webUrl} />
    <View style={{ flex: 1, minWidth: 0 }}>
      {author.handle && openProfile ? <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={() => openProfile(author.handle!, author.kind)} style={{ minHeight: 44, justifyContent: "center" }}><Text style={{ color: tokens.foreground, fontWeight: "700", fontSize: 16, lineHeight: 21 }}>{label}</Text><Text style={{ color: tokens.mutedForeground, fontSize: 13, lineHeight: 18 }}>@{author.handle}</Text></Pressable> : <><Text style={{ color: tokens.foreground, fontWeight: "700", fontSize: 16 }}>{label}</Text>{author.handle ? <Text style={{ color: tokens.mutedForeground, fontSize: 13, lineHeight: 18 }}>@{author.handle}</Text> : null}</>}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{author.badges.map(badge => <Text key={badge} style={{ color: tokens.mutedForeground, fontSize: 12, lineHeight: 18 }}>{t(`mobile.public.badges.${badge}`)}</Text>)}</View>
    </View>
  </View>
}
function PublicBodyText({ body, navigation }: { body: string; navigation: PublicNavigation }) {
  const { tokens } = useNativeAppearance()
  return <Text selectable style={{ color: tokens.foreground, fontSize: 16, lineHeight: 24 }}>{splitBodyRich(body).map((part, index) => part.type === "text" ? part.value : <Text key={index} accessibilityRole="link" style={{ color: tokens.primaryInk, textDecorationLine: "underline" }} onPress={() => part.type === "tag" ? navigation.openTag(part.value) : navigation.openProfile(part.value, "person")}>{part.type === "tag" ? "#" : "@"}{part.value}</Text>)}</Text>
}
function PublicOfferSlot({ networkId, postId }: { networkId: Id<"networks">; postId: string }) {
  const offer = useQuery(api.modules.public.catalog.postOffer, { networkId, postId }), { t, locale, tokens } = useNativeAppearance()
  if (!offer) return null
  return <View style={{ padding: 12, borderWidth: 1, borderColor: tokens.border, borderRadius: tokens.radiusField, gap: 6 }}><Text style={{ color: tokens.foreground, fontWeight: "700", fontSize: 15 }}>{offer.title}</Text><Label muted>{nativeBusinessPrice(offer.price, locale, t)}</Label></View>
}
function PublicPostCard({ post, networkId, webUrl, navigation, activeVideo, onVideo, full = false }: { post: PublicPost; networkId: Id<"networks">; webUrl?: string; navigation: PublicNavigation; activeVideo: string | null; onVideo: (key: string) => void; full?: boolean }) {
  const { t, tokens, locale } = useNativeAppearance(), [expanded, setExpanded] = useState(false)
  const text = (key: string, values: Record<string, string | number>) => nativeEntryText(t, key, values)
  const truncated = !full && !expanded && post.body.length > 350, body = truncated ? post.body.slice(0, 350) + "…" : post.body
  const date = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(post.publishedAt)
  return <View style={{ borderRadius: tokens.radiusCard, backgroundColor: tokens.card, padding: 16, gap: 12 }}>
    <PublicIdentity author={post.author} webUrl={webUrl} openProfile={navigation.openProfile} />
    <Text style={{ color: tokens.mutedForeground, fontSize: 12 }}>{date}</Text>
    <Text style={{ color: tokens.mutedForeground, fontSize: 12, lineHeight: 18, borderLeftWidth: 2, borderLeftColor: tokens.primary, paddingLeft: 10 }}>{text("mobile.public.post.origin", { name: post.origin.name })}</Text>
    <PublicBodyText body={body} navigation={navigation} />
    {truncated || expanded && !full ? <PublicLink onPress={() => setExpanded(value => !value)}>{t(expanded ? "mobile.public.post.readLess" : "mobile.public.post.readMore")}</PublicLink> : null}
    <PublicMedia items={post.media} webUrl={webUrl} owner={post.id} activeVideo={activeVideo} onVideo={onVideo} />
    {post.shared ? post.shared.available ? <View style={{ borderWidth: 1, borderColor: tokens.border, padding: 12, borderRadius: tokens.radiusField, gap: 10 }}><PublicIdentity author={post.shared.author} webUrl={webUrl} openProfile={navigation.openProfile} /><PublicBodyText body={post.shared.body} navigation={navigation} /><PublicMedia items={post.shared.media} webUrl={webUrl} owner={post.shared.id} activeVideo={activeVideo} onVideo={onVideo} /><PublicLink onPress={() => { if (post.shared?.available) navigation.openPost(post.shared.id) }}>{t("mobile.public.post.original")}</PublicLink></View> : <Label muted>{t("mobile.public.post.originalUnavailable")}</Label> : null}
    {post.hasCommerceOffer ? <PublicOfferSlot networkId={networkId} postId={post.id} /> : null}
    <View style={{ borderTopWidth: 1, borderTopColor: tokens.border, paddingTop: 8, flexDirection: "row", flexWrap: "wrap", columnGap: 16 }}>
      {navigation.onSignIn ? <PublicLink onPress={() => navigation.onSignIn?.(post.id)}>{t("mobile.public.post.participate")}</PublicLink> : null}
      {!full ? <PublicLink onPress={() => navigation.openPost(post.id)}>{t("mobile.public.post.open")}</PublicLink> : null}
    </View>
    <Text style={{ color: tokens.mutedForeground, fontSize: 12 }}>{t("mobile.public.post.publicAudience")}</Text>
    {post.editedAt ? <Text style={{ color: tokens.mutedForeground, fontSize: 12 }}>{text("mobile.public.post.edited", { date: new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(post.editedAt) })}</Text> : null}
  </View>
}
function PublicLegal({ kind, onSignIn }: { kind: NativePublicLegalKind; onSignIn?: () => void }) {
  const { t, tokens } = useNativeAppearance(), [linkFailed, setLinkFailed] = useState(false)
  const text = (key: string) => nativeEntryText(t, key, { brand: BRAND_NAME })
  const reference = (url: string) => { void Linking.openURL(url).catch(() => setLinkFailed(true)) }
  return <View style={{ gap: 24 }}>
    <View style={{ gap: 12 }}><Text style={{ color: tokens.primaryInk, fontWeight: "500" }}>{text("mobile.public.legal.eyebrow")}</Text><Text variant="display" accessibilityRole="header" style={{ color: tokens.foreground, fontSize: 30, lineHeight: 36, fontWeight: "700" }}>{text(`mobile.public.legal.${kind}.title`)}</Text><Text style={{ color: tokens.mutedForeground, fontSize: 16, lineHeight: 24 }}>{text(`mobile.public.legal.${kind}.lead`)}</Text></View>
    {kind !== "about" ? <View style={{ backgroundColor: tokens.muted, borderRadius: tokens.radiusField, padding: 16 }}><Status label={text("mobile.public.legal.draft")} /></View> : null}
    {LEGAL_SECTIONS[kind].map(section => <View key={section} style={{ gap: 10 }}><Text variant="display" accessibilityRole="header" style={{ color: tokens.foreground, fontWeight: "600", fontSize: 20, lineHeight: 26 }}>{text(`mobile.public.legal.${kind}.${section}.title`)}</Text><Text selectable style={{ color: tokens.foreground, fontSize: 15, lineHeight: 23 }}>{text(`mobile.public.legal.${kind}.${section}.body`)}</Text></View>)}
    {kind !== "about" ? <View style={{ gap: 6, borderTopWidth: 1, borderTopColor: tokens.border, paddingTop: 16 }}><Text variant="display" accessibilityRole="header" style={{ color: tokens.foreground, fontWeight: "600", fontSize: 20 }}>{t("mobile.public.legal.sources")}</Text><PublicLink onPress={() => reference(nativeWebRoutes.apdpvp())}>{t("mobile.public.legal.apdpvp")}</PublicLink><PublicLink onPress={() => reference(nativeWebRoutes.officialJournal())}>{t("mobile.public.legal.journal")}</PublicLink><PublicLink onPress={() => reference(nativeWebRoutes.gdpr())}>{t("mobile.public.legal.gdpr")}</PublicLink><Status error={linkFailed} label={linkFailed ? t("mobile.public.states.unavailable.body") : ""} /></View> : null}
    {onSignIn ? <PublicLink onPress={onSignIn}>{t("mobile.public.nav.enter")}</PublicLink> : null}
  </View>
}
function PublicEntryBody({ kind = "discover", onClose, onSignIn, webUrl }: PublicEntryScreenProps) {
  const { t, tokens } = useNativeAppearance(), foreground = usePublicForeground()
  const [history, setHistory] = useState<PublicRoute[]>([{ name: "discover" }]), route = history[history.length - 1]!
  const [selection, setSelection] = useState<{ province?: ProvinceSlug; tag?: string; cursors: (string | null)[] }>({ cursors: [null] })
  const { province, tag, cursors } = selection
  const [pagePaging, setPagePaging] = useState<{ handle: string | null; cursors: (string | null)[] }>({ handle: null, cursors: [null] })
  const pageCursors = route.name === "profile" && pagePaging.handle === route.handle ? pagePaging.cursors : [null]
  const [activeVideo, setActiveVideo] = useState<string | null>(null)
  const network = useQuery(api.modules.networks.networks.getBySlug, foreground && kind === "discover" ? { slug: "antsia" } : "skip")
  const networkId = network?._id
  const snapshot = useQuery(api.modules.public.projections.snapshot, networkId && foreground && route.name === "discover" ? { networkId } : "skip")
  const posts = useQuery(api.modules.public.projections.listRootPosts, networkId && foreground && route.name === "discover" ? { networkId, paginationOpts: { numItems: 20, cursor: cursors[cursors.length - 1] ?? null }, ...(province ? { province } : {}), ...(tag ? { tag } : {}) } : "skip")
  const post = useQuery(api.modules.public.projections.getPost, networkId && foreground && route.name === "post" ? { networkId, postId: route.id } : "skip")
  const profile = useQuery(api.modules.public.projections.getProfile, networkId && foreground && route.name === "profile" && route.kind === "person" ? { networkId, handle: route.handle } : "skip")
  const page = useQuery(api.modules.public.projections.getOfficialPage, networkId && foreground && route.name === "profile" && route.kind === "page" ? { networkId, handle: route.handle } : "skip")
  const pagePosts = useQuery(api.modules.public.projections.pagePosts, networkId && foreground && route.name === "profile" && route.kind === "page" && page ? { networkId, handle: route.handle, paginationOpts: { numItems: 20, cursor: pageCursors[pageCursors.length - 1] ?? null } } : "skip")
  useEffect(() => { if (!foreground) setActiveVideo(null) }, [foreground])
  const push = (next: PublicRoute) => { setActiveVideo(null); setHistory(previous => [...previous.slice(-19), next]) }
  const navigation: PublicNavigation = {
    openPost: id => push({ name: "post", id }),
    openProfile: (handle, authorKind) => { setPagePaging({ handle, cursors: [null] }); push({ name: "profile", handle, kind: authorKind }) },
    openTag: value => { setSelection({ tag: value, cursors: [null] }); setHistory([{ name: "discover" }]); setActiveVideo(null) },
    onSignIn,
  }
  const back = () => { setActiveVideo(null); if (history.length > 1) setHistory(previous => previous.slice(0, -1)); else onClose?.() }
  const next = nativePublicNext(cursors, posts), pageNext = nativePublicNext(pageCursors, pagePosts)
  const text = (key: string, values: Record<string, string | number> = {}) => nativeEntryText(t, key, { brand: BRAND_NAME, ...values })
  const cards = (items: PublicPost[], full = false) => networkId ? items.map(item => <PublicPostCard key={item.id} post={item} networkId={networkId} webUrl={webUrl} navigation={navigation} activeVideo={activeVideo} onVideo={setActiveVideo} full={full} />) : null
  const empty = (filtered: boolean) => <View style={{ gap: 8, paddingVertical: 12 }}><Text variant="display" accessibilityRole="header" style={{ color: tokens.foreground, fontWeight: "600", fontSize: 18 }}>{t("mobile.public.feed.emptyTitle")}</Text><Label muted>{t(filtered ? "mobile.public.feed.filteredWindow" : "mobile.public.feed.emptyBody")}</Label></View>
  return <View style={{ flex: 1, backgroundColor: tokens.background }}>
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: tokens.border }}>
      {history.length > 1 || onClose ? <Pressable accessibilityRole="button" accessibilityLabel={t("mobile.entry.back")} onPress={back} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}><NativeIcon name="back" /></Pressable> : null}
      <Text style={{ flex: 1, color: tokens.primaryInk, fontSize: 23, fontWeight: "700", letterSpacing: -0.7 }}>{BRAND_NAME}</Text>
      {onSignIn ? <Pressable accessibilityRole="button" onPress={() => onSignIn()} style={{ minHeight: 44, paddingHorizontal: 10, justifyContent: "center" }}><Text style={{ color: tokens.primaryInk, fontWeight: "600", fontSize: 14 }}>{t("mobile.public.nav.enter")}</Text></Pressable> : null}
    </View>
    {!foreground ? <View style={{ padding: 20 }}><Status label={t("mobile.common.background")} /></View> : <ScrollView key={kind === "discover" ? JSON.stringify(route) : kind} onScrollBeginDrag={() => setActiveVideo(null)} contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 32 }}>
      {kind !== "discover" ? <PublicLegal kind={kind} onSignIn={onSignIn} /> : network === undefined ? <Status busy label={t("mobile.common.loading")} /> : network === null ? <Status error label={t("mobile.public.states.unavailable.body")} /> : <>
        {route.name === "discover" ? <>
          <View style={{ gap: 12 }}><Text variant="display" accessibilityRole="header" style={{ color: tokens.foreground, fontWeight: "700", fontSize: 30, lineHeight: 36 }}>{tag ? text("mobile.public.tag.title", { tag }) : t("mobile.public.discover.title")}</Text><Label muted>{t("mobile.public.discover.lead")}</Label></View>
          <View style={{ gap: 8 }}><Text variant="display" accessibilityRole="header" style={{ color: tokens.foreground, fontWeight: "600", fontSize: 17 }}>{t("mobile.public.provinces.title")}</Text><Label muted>{t("mobile.public.provinces.lead")}</Label><View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>{GABON_PROVINCES.map(item => <Pressable key={item.slug} accessibilityRole="button" accessibilityState={{ selected: province === item.slug }} onPress={() => { setSelection(previous => ({ province: previous.province === item.slug ? undefined : item.slug, cursors: [null] })); setActiveVideo(null) }} style={{ minHeight: 44, paddingHorizontal: 12, justifyContent: "center", borderRadius: 22, backgroundColor: province === item.slug ? tokens.primary : tokens.muted }}><Text style={{ color: province === item.slug ? tokens.primaryOn : tokens.foreground, fontSize: 13 }}>{item.name}</Text></Pressable>)}</View></View>
          {snapshot?.trends.length ? <View style={{ gap: 6 }}><Text variant="display" accessibilityRole="header" style={{ color: tokens.foreground, fontWeight: "600", fontSize: 17 }}>{t("mobile.public.discover.trends")}</Text><View style={{ flexDirection: "row", flexWrap: "wrap", columnGap: 16 }}>{snapshot.trends.map(trend => <PublicLink key={trend.tag} onPress={() => navigation.openTag(trend.tag)}>#{trend.tag} · {trend.posts}</PublicLink>)}</View>{snapshot.bounded ? <Label muted>{t("mobile.public.snapshot.bounded")}</Label> : null}</View> : null}
          {onSignIn ? <Action label={t("mobile.public.discover.member")} tone="primary" onPress={() => onSignIn()} /> : null}
          {posts === undefined ? <Status busy label={t("mobile.common.loading")} /> : posts.page.length ? cards(posts.page) : empty(!posts.isDone)}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{cursors.length > 1 ? <Action label={t("mobile.public.feed.first")} onPress={() => { setSelection(previous => ({ ...previous, cursors: [null] })); setActiveVideo(null) }} /> : null}{next ? <Action label={t("mobile.public.feed.next")} onPress={() => { setSelection(previous => previous.province === province && previous.tag === tag && nativePublicNext(previous.cursors, posts) === next ? { ...previous, cursors: [...previous.cursors, next] } : previous); setActiveVideo(null) }} /> : null}</View>
          {cursors.length >= 10 && posts && !posts.isDone ? <Label muted>{t("mobile.common.windowLimit")}</Label> : null}
        </> : route.name === "post" ? <>
          <Text variant="display" accessibilityRole="header" style={{ color: tokens.foreground, fontWeight: "700", fontSize: 24 }}>{t("mobile.public.post.title")}</Text>
          {post === undefined ? <Status busy label={t("mobile.common.loading")} /> : post === null ? <Status error label={t("mobile.public.states.refused.title")} /> : cards([post], true)}
        </> : route.kind === "person" ? profile === undefined ? <Status busy label={t("mobile.common.loading")} /> : profile === null ? <Status error label={t("mobile.public.states.refused.title")} /> : <View style={{ backgroundColor: tokens.card, borderRadius: tokens.radiusCard, padding: 20, gap: 16 }}>
          <Label muted>{t("mobile.public.profile.public")}</Label><PublicIdentity author={{ kind: "person", handle: profile.handle, displayName: profile.displayName, avatarUrl: profile.avatarUrl, badges: profile.badges }} webUrl={webUrl} />
          {profile.headline ? <Label>{profile.headline}</Label> : null}{profile.publicAgent ? <View style={{ gap: 8 }}><Label strong>{profile.publicAgent.administrationName}</Label><Label>{profile.publicAgent.roleLabel}</Label><PublicLink onPress={() => navigation.openProfile(profile.publicAgent!.administrationHandle, "page")}>@{profile.publicAgent.administrationHandle}</PublicLink></View> : null}
          <Label muted>{t("mobile.public.profile.reduced")}</Label>{onSignIn ? <Action label={t("mobile.public.profile.member")} tone="primary" onPress={() => onSignIn()} /> : null}
        </View> : page === undefined ? <Status busy label={t("mobile.common.loading")} /> : page === null ? <Status error label={t("mobile.public.states.refused.title")} /> : <>
          <View style={{ backgroundColor: tokens.card, borderRadius: tokens.radiusCard, padding: 20, gap: 14 }}>
            {page.bannerUrl ? <PublicImage key={page.bannerUrl} url={page.bannerUrl} label={page.name} webUrl={webUrl} ratio={3} /> : null}
            <PublicIdentity author={{ kind: "page", handle: page.handle, displayName: page.name, avatarUrl: page.logoUrl, badges: [page.badge] }} webUrl={webUrl} />
            {page.description ? <Label>{page.description}</Label> : null}<Label muted>{text("mobile.public.post.origin", { name: page.origin.name })}</Label>{onSignIn ? <Action label={t("mobile.public.page.member")} tone="primary" onPress={() => onSignIn()} /> : null}
          </View>
          {pagePosts === undefined ? <Status busy label={t("mobile.common.loading")} /> : pagePosts.page.length ? cards(pagePosts.page) : empty(!pagePosts.isDone)}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{pageCursors.length > 1 ? <Action label={t("mobile.public.feed.first")} onPress={() => { setPagePaging({ handle: route.handle, cursors: [null] }); setActiveVideo(null) }} /> : null}{pageNext ? <Action label={t("mobile.public.feed.next")} onPress={() => { setPagePaging(previous => previous.handle === route.handle && nativePublicNext(previous.cursors, pagePosts) === pageNext ? { ...previous, cursors: [...previous.cursors, pageNext] } : previous); setActiveVideo(null) }} /> : null}</View>
        </>}
      </>}
    </ScrollView>}
  </View>
}
/** Self-contained public reader under the parent's anonymous ConvexProvider; no member runtime. */
export function PublicEntryScreen(props: PublicEntryScreenProps) {
  const { t } = useNativeAppearance(), [version, setVersion] = useState(0)
  return <QueryBoundary key={version} resetKey={String(version)} fallback={<View style={{ padding: 20, gap: 16 }}><Status error label={t("mobile.public.states.unavailable.body")} /><Action label={t("mobile.public.states.retry")} onPress={() => setVersion(value => value + 1)} />{props.onClose ? <Action label={t("mobile.entry.back")} onPress={props.onClose} /> : null}</View>}><PublicEntryBody {...props} /></QueryBoundary>
}
