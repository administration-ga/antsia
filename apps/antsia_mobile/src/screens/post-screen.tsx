import { api, type Id } from "@antsia/api/engine"
import { useQuery } from "convex/react"
import { useState } from "react"
import { ScrollView } from "react-native"
import { useNativeAppearance } from "../appearance"
import { Action, Card, Label, QueryBoundary, RuntimeNotice, Screen, Status, nativeScope, useNativeGuard } from "../components/ui"
import { useNativeRuntime } from "../runtime"
import { NativePostCard } from "./feed-screen"

type PostNavigation = { onOpenPage?: (handle: string) => void; onOpenOffer?: (handle: string, offerRef: string) => void }

function PostBody({ postId, focused, onOpenPage, onOpenOffer }: { postId: Id<"posts">; focused: boolean } & PostNavigation) {
  const guard = useNativeGuard(), { t } = useNativeAppearance()
  const post = useQuery(api.modules.posts.posts.getPost, guard.canRead ? { networkId: guard.runtime.networkId, postId } : "skip")
  if (!guard.canRead) return <Label>{t("mobile.common.privateUnavailable")}</Label>
  return <ScrollView accessibilityLabel={t("mobile.post.title")} accessibilityState={{ busy: post === undefined }} scrollEnabled={guard.canAct} contentContainerStyle={{ paddingBottom: 12 }}><RuntimeNotice /><Status label={post === undefined ? t("mobile.common.loading") : post === null ? t("mobile.common.unavailable") : ""} busy={post === undefined} error={post === null} />{post ? <NativePostCard post={post} active={focused} onOpenPage={onOpenPage} onOpenOffer={onOpenOffer} /> : null}</ScrollView>
}
export function PostScreen({ postId, focused = true, onOpenPage, onOpenOffer }: { postId: Id<"posts">; focused?: boolean } & PostNavigation) {
  const runtime = useNativeRuntime(), { t } = useNativeAppearance(), [version, setVersion] = useState(0)
  const key = nativeScope(runtime) + ":" + postId + ":" + version
  return <Screen title={t("mobile.post.title")}>{!runtime.ready ? <RuntimeNotice /> : <QueryBoundary key={key} resetKey={key} fallback={<Card><Status label={t("mobile.common.unavailable")} error /><Action label={t("mobile.common.refresh")} disabled={!runtime.foreground || !runtime.online} onPress={() => { if (runtime.isCurrent() && runtime.foreground && runtime.online) setVersion(value => value + 1) }} /></Card>}><PostBody postId={postId} focused={focused} onOpenPage={onOpenPage} onOpenOffer={onOpenOffer} /></QueryBoundary>}</Screen>
}
