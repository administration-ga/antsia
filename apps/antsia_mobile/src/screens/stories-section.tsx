import { NativeText as Text } from "../components/native-text"
import { useEffect, useRef, useState } from "react"
import { Image, Pressable, ScrollView, View } from "react-native"
import { useMutation, useQuery } from "convex/react"
import type { FunctionReturnType } from "convex/server"
import { api } from "@antsia/api/engine"
import { useNativeAppearance } from "../appearance"
import { GuardedMedia } from "../components/guarded-media"
import { NativeIcon } from "../components/icon"
import { Action, Label, QueryBoundary, Status, useNativeGuard } from "../components/ui"
import { nativeBusinessMediaUrl, nativeBusinessPrice } from "../lib/native-business"
import { nativeFeedText } from "../lib/feed-presentation"
import { PostSheet } from "./post-actions"

type StoryGroup = FunctionReturnType<typeof api.modules.stories.stories.tray>["groups"][number]
function useStoryInstant() {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 30_000) * 30_000)
  useEffect(() => { const timer = setInterval(() => setNow(Math.floor(Date.now() / 30_000) * 30_000), 15_000); return () => clearInterval(timer) }, [])
  return now
}

function StoryReader({ group, now, focused, onOpenOffer }: { group: StoryGroup; now: number; focused: boolean; onOpenOffer?: (handle: string, offerRef: string) => void }) {
  const guard = useNativeGuard(), { t, locale, tokens } = useNativeAppearance()
  const own = group.author.personId === guard.runtime.personId, handle = group.author.handle
  const other = useQuery(api.modules.stories.stories.listByAuthor, guard.canRead && !own && handle ? { networkId: guard.runtime.networkId, handle, now } : "skip")
  const mine = useQuery(api.modules.stories.stories.myActive, guard.canRead && own ? { networkId: guard.runtime.networkId, now } : "skip")
  const data = own ? mine : other
  const items = data?.filter(story => story.expiresAt > Date.now())
  const [index, setIndex] = useState(0), [failed, setFailed] = useState(false)
  const story = items?.[Math.min(index, Math.max(0, items.length - 1))]
  const seen = useRef(new Set<string>()), markSeen = useMutation(api.modules.stories.stories.markSeen)
  const mediaReady = () => {
    if (!story || story.isOwn || seen.current.has(String(story.storyId)) || !guard.current() || !guard.runtime.canWrite) return
    seen.current.add(String(story.storyId))
    const current = guard.capture()
    void markSeen({ networkId: guard.runtime.networkId, storyId: story.storyId }).catch(() => { if (current()) setFailed(true) })
  }
  if (!guard.canAct) return null
  const media = story?.dailySpecial && story.media.url?.startsWith("/") ? { ...story.media, url: nativeBusinessMediaUrl(story.media.url, guard.runtime.webUrl) } : story?.media
  return <ScrollView contentContainerStyle={{ gap: 12, paddingBottom: 20 }}>
    <View style={{ paddingHorizontal: 16, paddingTop: 12 }}><Status busy={data === undefined} label={data === undefined ? t("mobile.common.loading") : !story ? t("mobile.feedUi.storyUnavailable") : ""} /></View>
    {story && media ? <>
      <GuardedMedia key={String(story.storyId)} items={[media]} active={focused && guard.canAct} edgeToEdge onReady={mediaReady} />
      <View style={{ paddingHorizontal: 16, gap: 10 }}>
        {story.caption ? <Label>{story.caption}</Label> : null}
        {story.dailySpecial ? <><Label strong>{story.dailySpecial.title}</Label><Label strong>{nativeBusinessPrice(story.dailySpecial.price, locale, t)}</Label>{onOpenOffer ? <Action label={t("mobile.post.openOffer")} onPress={() => { if (guard.current() && story.dailySpecial && story.expiresAt > Date.now()) onOpenOffer(story.dailySpecial.shopHandle, story.dailySpecial.offerRef) }} /> : null}</> : null}
        <Text style={{ color: tokens.mutedForeground, fontSize: 13 }}>{nativeFeedText(t, "storyPosition", { index: Math.min(index + 1, items?.length ?? 0), count: items?.length ?? 0 })}</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {index > 0 ? <Action label={t("mobile.feedUi.storyPrevious")} disabled={!guard.canAct} onPress={() => { if (guard.current()) setIndex(value => Math.max(0, value - 1)) }} /> : null}
          {index + 1 < (items?.length ?? 0) ? <Action label={t("mobile.feedUi.storyNext")} disabled={!guard.canAct} onPress={() => { if (guard.current()) setIndex(value => value + 1) }} /> : null}
        </View>
        <Status error label={failed ? t("mobile.common.unavailable") : ""} />
      </View>
    </> : null}
  </ScrollView>
}

export function StoriesSection({ focused = true, onCreateStory, onOpenOffer }: { focused?: boolean; onCreateStory?: () => void; onOpenOffer?: (handle: string, offerRef: string) => void }) {
  const guard = useNativeGuard(), { t, tokens } = useNativeAppearance(), now = useStoryInstant()
  const tray = useQuery(api.modules.stories.stories.tray, guard.canRead ? { networkId: guard.runtime.networkId, now, limit: 20 } : "skip")
  const [selected, setSelected] = useState<StoryGroup | null>(null)
  const { registerCleanup } = guard.runtime
  useEffect(() => registerCleanup(() => setSelected(null)), [registerCleanup])
  if (!guard.canRead || (!tray?.groups.length && !onCreateStory)) return null
  const hasOwn = tray?.groups.some(group => group.author.personId === guard.runtime.personId) ?? false
  return <View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} accessibilityLabel={t("mobile.feedUi.stories")} contentContainerStyle={{ gap: 12, paddingVertical: 10 }}>
      {onCreateStory && !hasOwn ? <Pressable accessibilityRole="button" accessibilityLabel={t("mobile.feedUi.storyCreate")} disabled={!guard.canAct || !guard.runtime.canWrite} onPress={() => { if (guard.current() && guard.runtime.canWrite) onCreateStory() }} style={{ width: 68, alignItems: "center", gap: 5 }}><View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: tokens.muted, alignItems: "center", justifyContent: "center" }}><NativeIcon name="plus" /></View><Text style={{ color: tokens.foreground, fontSize: 12 }}>{t("mobile.feedUi.you")}</Text></Pressable> : null}
      {tray?.groups.map(group => {
        const own = group.author.personId === guard.runtime.personId
        const name = own ? t("mobile.feedUi.you") : group.author.displayName ?? t("mobile.post.unknownAuthor")
        const image = group.cover.kind === "image" ? group.cover.url.startsWith("/") ? nativeBusinessMediaUrl(group.cover.url, guard.runtime.webUrl) : group.cover.url : group.author.avatarUrl
        return <View key={String(group.author.personId)} style={{ width: 68 }}><Pressable accessibilityRole="button" accessibilityLabel={nativeFeedText(t, "storyOpen", { name })} disabled={!guard.canAct || !own && !group.author.handle} onPress={() => { if (guard.current()) setSelected(group) }} style={{ width: 68, alignItems: "center", gap: 5 }}>
          <View style={{ width: 60, height: 60, borderRadius: 30, borderWidth: group.unseenCount > 0 ? 2.5 : 1, borderColor: group.unseenCount > 0 ? tokens.primary : tokens.border, padding: 3, alignItems: "center", justifyContent: "center", overflow: "hidden" }}>{image ? <Image accessible={false} alt="" source={{ uri: image }} style={{ width: "100%", height: "100%", borderRadius: 26, backgroundColor: tokens.muted }} /> : <NativeIcon name="user" />}</View>
          <Text numberOfLines={1} style={{ color: tokens.foreground, fontSize: 12, textAlign: "center" }}>{name}</Text>
        </Pressable>{own && onCreateStory ? <Pressable accessibilityRole="button" accessibilityLabel={t("mobile.feedUi.storyCreate")} disabled={!guard.canAct || !guard.runtime.canWrite} onPress={() => { if (guard.current() && guard.runtime.canWrite) onCreateStory() }} style={{ position: "absolute", top: 30, right: -4, minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" }}><View style={{ width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: tokens.primary }}><NativeIcon name="plus" size={17} color={tokens.primaryOn} /></View></Pressable> : null}</View>
      })}
    </ScrollView>
    <PostSheet title={selected?.author.displayName ?? t("mobile.feedUi.stories")} open={selected !== null} onClose={() => setSelected(null)}>{selected && guard.canAct ? <QueryBoundary key={`${guard.owner}:${selected.author.personId}`} resetKey={`${guard.owner}:${selected.author.personId}`} fallback={<View style={{ padding: 20 }}><Status error label={t("mobile.feedUi.storyUnavailable")} /></View>}><StoryReader group={selected} now={now} focused={focused} onOpenOffer={onOpenOffer} /></QueryBoundary> : null}</PostSheet>
  </View>
}
