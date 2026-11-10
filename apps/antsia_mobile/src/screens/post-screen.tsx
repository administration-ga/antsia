import { api, type Id } from "@antsia/api/engine"
import { useQuery } from "convex/react"
import { useState } from "react"
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native"
import { useNativeAppearance } from "../appearance"
import { Action, Card, Label, QueryBoundary, RuntimeNotice, Status, nativeScope, useNativeGuard } from "../components/ui"
import { useNativeRuntime } from "../runtime"
import { NativePostCard, type NativePostNavigation } from "./feed-screen"
import { CommentsSection } from "./comments-section"

type PostNavigation = NativePostNavigation

function PostBody({ postId, focused, ...navigation }: { postId: Id<"posts">; focused: boolean } & PostNavigation) {
  const guard = useNativeGuard(), { t } = useNativeAppearance()
  const post = useQuery(api.modules.posts.posts.getPost, guard.canRead ? { networkId: guard.runtime.networkId, postId } : "skip")
  if (!guard.canRead) return <Label>{t("mobile.common.privateUnavailable")}</Label>
  return <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}><ScrollView keyboardShouldPersistTaps="handled" accessibilityLabel={t("mobile.post.title")} accessibilityState={{ busy: post === undefined }} scrollEnabled={guard.canAct} contentContainerStyle={{ paddingBottom: 24 }}><RuntimeNotice /><Status label={post === undefined ? t("mobile.common.loading") : post === null ? t("mobile.common.unavailable") : ""} busy={post === undefined} error={post === null} />{post ? <><NativePostCard post={post} edgeToEdge active={focused} {...navigation} /><CommentsSection key={String(post.canonicalDiscussionPostId ?? post._id)} postId={post.canonicalDiscussionPostId ?? post._id} commentsOpen={post.commentsOpen !== false} onOpenProfile={navigation.onOpenProfile} /></> : null}</ScrollView></KeyboardAvoidingView>
}
export function PostScreen({ postId, focused = true, ...navigation }: { postId: Id<"posts">; focused?: boolean } & PostNavigation) {
  const runtime = useNativeRuntime(), { t } = useNativeAppearance(), [version, setVersion] = useState(0)
  const key = nativeScope(runtime) + ":" + postId + ":" + version
  return <View style={{ flex: 1 }}>{!runtime.ready ? <RuntimeNotice /> : <QueryBoundary key={key} resetKey={key} fallback={<Card><Status label={t("mobile.common.unavailable")} error /><Action label={t("mobile.common.refresh")} disabled={!runtime.foreground || !runtime.online} onPress={() => { if (runtime.isCurrent() && runtime.foreground && runtime.online) setVersion(value => value + 1) }} /></Card>}><PostBody postId={postId} focused={focused} {...navigation} /></QueryBoundary>}</View>
}
