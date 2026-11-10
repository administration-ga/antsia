import { api, type Id } from "@antsia/api/engine"
import { MESSAGE_MAX_LENGTH } from "@antsia/social-contracts/messaging"
import type { PostMediaDto } from "@antsia/social-contracts/media"
import { useMutation, usePaginatedQuery, useQuery } from "convex/react"
import type { FunctionReturnType } from "convex/server"
import * as Crypto from "expo-crypto"
import { useEffect, useMemo, useRef, useState } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { useController, useForm } from "react-hook-form"
import { z } from "zod"
import { FlatList, KeyboardAvoidingView, Platform, View } from "react-native"
import { useNativeAppearance } from "../appearance"
import { GuardedMedia } from "../components/guarded-media"
import { Action, Card, Field, Label, QueryBoundary, RuntimeNotice, Screen, nativeScope, useNativeGuard } from "../components/ui"
import { admittedMessageIntent, beginMessageIntent, uncertainMessageIntent, type MessageIntent, type MessageIntentScope } from "../lib/message-intent"
import { useNativeRuntime } from "../runtime"
import { useNativeCalls } from "../calls"

type Message = FunctionReturnType<typeof api.modules.messaging.messages.paginateMessages>["page"][number]
const PAGE_SIZE = 20, MAX_PAGES = 10
function MessageCard({ message, active, onPlay, enabled }: { message: Message; active: boolean; onPlay: () => void; enabled: boolean }) {
  const { t } = useNativeAppearance()
  const media: PostMediaDto[] = message.attachmentFiles.filter(file => file.mimeType.startsWith("image/") || file.mimeType.startsWith("video/")).map(file => ({ kind: file.mimeType.startsWith("image/") ? "image" : "video", url: file.url, withheld: file.withheld, mimeType: file.mimeType, altText: file.filename }))
  return <Card>
    <Label strong>{message.isMine ? t("mobile.messages.me") : message.sender.displayName ?? t("mobile.messages.unknownPerson")}</Label>
    {message.deleted ? <Label muted>{t("mobile.messages.deleted")}</Label> : <>
      {message.replyTo ? <Label muted>{message.replyTo.deleted ? t("mobile.messages.quoteDeleted") : message.replyTo.excerpt}</Label> : null}
      {message.type !== "text" ? <Label muted>{t(message.type === "system" ? "mobile.messages.systemEvent" : "mobile.messages.callEvent")}</Label> : null}
      {message.content ? <Label>{message.content}</Label> : null}
      {message.forwarded ? <Label muted>{t("mobile.messages.forwarded")}</Label> : null}
      <GuardedMedia items={media} active={active} />
      {media.some(item => item.kind === "video" && item.url !== null && item.withheld === null) ? <Action label={t(active ? "mobile.media.stop" : "mobile.media.play")} disabled={!enabled} onPress={onPlay} /> : null}
      {message.attachmentFiles.filter(file => !file.mimeType.startsWith("image/") && !file.mimeType.startsWith("video/")).map((file, index) => <View key={String(index)}><Label>{file.filename}</Label><Label muted>{t(file.withheld === "fileQuarantined" ? "mobile.media.quarantined" : file.withheld !== null || file.url === null ? "mobile.media.withheld" : "mobile.messages.attachmentReadOnly")}</Label></View>)}
      {message.isMine ? <Label muted>{t(message.readAt !== null ? "mobile.messages.read" : "mobile.messages.sent")}</Label> : null}
    </>}
  </Card>
}
function ConversationBody({ threadId, focused }: { threadId: Id<"personalThreads">; focused: boolean }) {
  const guard = useNativeGuard(), { t } = useNativeAppearance(), calls = useNativeCalls()
  const thread = useQuery(api.modules.messaging.inbox.getThread, guard.canRead ? { networkId: guard.runtime.networkId, threadId } : "skip")
  const page = usePaginatedQuery(api.modules.messaging.messages.paginateMessages, guard.canRead && thread ? { networkId: guard.runtime.networkId, threadId } : "skip", { initialNumItems: PAGE_SIZE })
  const send = useMutation(api.modules.messaging.messages.sendMessage), read = useMutation(api.modules.messaging.messages.markRead)
  const schema = useMemo(() => z.object({ message: z.string().trim().min(1, t("mobile.messages.invalidText")).max(MESSAGE_MAX_LENGTH, t("mobile.messages.invalidText")) }), [t])
  const form = useForm<{ message: string }>({ resolver: zodResolver(schema), defaultValues: { message: "" } })
  const { field: messageField } = useController({ name: "message", control: form.control })
  const text = messageField.value
  const [intent, setIntent] = useState<MessageIntent | null>(null), [lastReceipt, setLastReceipt] = useState<MessageIntent | null>(null)
  const intentRef = useRef<MessageIntent | null>(null), receipt = useRef<string | null>(null)
  const [readError, setReadError] = useState(false), [loads, setLoads] = useState(1)
  const [activeMedia, setActiveMedia] = useState<string | null>(null)
  const scope: MessageIntentScope = { networkId: String(guard.runtime.networkId), personId: String(guard.runtime.personId), sessionId: guard.runtime.sessionId, epoch: guard.runtime.epoch, threadId: String(threadId) }
  useEffect(() => guard.runtime.registerCleanup(() => { intentRef.current = null; receipt.current = null; setIntent(null); setLastReceipt(null); form.reset({ message: "" }); setActiveMedia(null) }), [form.reset, guard.owner, guard.runtime.registerCleanup])
  useEffect(() => {
    if ((!guard.canAct || !guard.runtime.canWrite) && intentRef.current?.state === "pending") {
      const next = uncertainMessageIntent(intentRef.current); intentRef.current = next; setIntent(next)
    }
    if (!guard.canAct || !focused) setActiveMedia(null)
  }, [focused, guard.canAct, guard.runtime.canWrite])
  const latestMessage = page.results[0]?.messageId
  useEffect(() => {
    if (!guard.canAct || !focused || !thread || !latestMessage) return
    const key = String(threadId) + ":" + String(latestMessage)
    if (receipt.current === key) return
    receipt.current = key
    const current = guard.capture()
    void read({ networkId: guard.runtime.networkId, threadId }).then(() => { if (current()) setReadError(false) }).catch(() => {
      if (current() && receipt.current === key) setReadError(true)
    })
  }, [focused, guard.canAct, guard.capture, guard.runtime.networkId, latestMessage, read, thread, threadId])
  useEffect(() => {
    if (lastReceipt && page.results.some(message => String(message.messageId) === lastReceipt.messageId)) setLastReceipt(null)
  }, [page.results, lastReceipt])
  const submit = async (input: string) => {
    if (!guard.current() || !guard.runtime.canWrite || !focused || !thread) return
    let next: MessageIntent | null
    try { next = beginMessageIntent(intentRef.current, scope, intentRef.current?.state === "uncertain" ? intentRef.current.text : input, () => Crypto.randomUUID()) }
    catch { form.setError("message", { message: t("mobile.messages.invalidText") }); return }
    if (!next) return
    intentRef.current = next; setIntent(next); form.clearErrors("message")
    const current = guard.capture()
    try {
      const result = await send({ networkId: guard.runtime.networkId, threadId, content: next.text, idempotencyKey: next.key })
      if (!current() || intentRef.current?.key !== next.key) return
      const admitted = admittedMessageIntent(next, String(result.messageId)); setLastReceipt(admitted); intentRef.current = null; setIntent(null); form.reset({ message: "" })
    } catch {
      if (!current() || intentRef.current?.key !== next.key) return
      const uncertain = uncertainMessageIntent(next); intentRef.current = uncertain; setIntent(uncertain)
    }
  }
  if (!guard.canRead) return <RuntimeNotice />
  if (thread === undefined) return <Label>{t("mobile.common.loading")}</Label>
  if (thread === null) return <Label>{t("mobile.messages.threadUnavailable")}</Label>
  return <KeyboardAvoidingView style={{ flex: 1, gap: 8 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
    <RuntimeNotice /><Label strong>{thread.counterpart.displayName ?? t("mobile.messages.unknownPerson")}</Label>
    {calls.available ? <View style={{ gap: 8 }}>
      {!calls.systemEnabled ? <Action label={t("mobile.calls.enable")} disabled={!guard.canAct || !guard.runtime.canWrite || calls.busy} onPress={() => { void calls.enableSystemCalls() }} /> : null}
      <View style={{ flexDirection: "row", gap: 8 }}>
        <View style={{ flex: 1, minWidth: 0 }}><Action label={t("mobile.calls.audio")} disabled={!guard.canAct || !guard.runtime.canWrite || calls.busy || !calls.systemEnabled} onPress={() => { if (guard.current()) void calls.startCall(thread.counterpart.personId, "audio") }} /></View>
        <View style={{ flex: 1, minWidth: 0 }}><Action label={t("mobile.calls.video")} disabled={!guard.canAct || !guard.runtime.canWrite || calls.busy || !calls.systemEnabled} onPress={() => { if (guard.current()) void calls.startCall(thread.counterpart.personId, "video") }} /></View>
      </View>
    </View> : null}
    <Label muted>{t("mobile.messages.noDeliveryProof")}</Label>
    {readError ? <View style={{ gap: 8 }}><Label muted>{t("mobile.messages.readUnknown")}</Label><Action label={t("mobile.messages.retryRead")} disabled={!guard.canAct || !focused} onPress={() => {
      if (!guard.current() || !focused) return
      const current = guard.capture()
      void read({ networkId: guard.runtime.networkId, threadId }).then(() => { if (current()) setReadError(false) }).catch(() => { if (current()) setReadError(true) })
    }} /></View> : null}
    <FlatList inverted data={page.results} accessibilityLabel={t("mobile.messages.conversationTitle")} keyboardShouldPersistTaps="handled" keyExtractor={message => String(message.messageId)} scrollEnabled={guard.canAct} initialNumToRender={10} maxToRenderPerBatch={10} windowSize={5}
      onScrollBeginDrag={() => setActiveMedia(null)}
      renderItem={({ item }) => <MessageCard message={item} active={focused && activeMedia === String(item.messageId)} enabled={guard.canAct && focused} onPlay={() => { if (guard.current() && focused) setActiveMedia(previous => previous === String(item.messageId) ? null : String(item.messageId)) }} />}
      ListEmptyComponent={<Label>{t(page.status === "LoadingFirstPage" ? "mobile.common.loading" : "mobile.messages.noMessages")}</Label>}
      ListFooterComponent={<View style={{ gap: 8 }}>
        {page.status === "LoadingMore" ? <Label>{t("mobile.common.loading")}</Label> : null}
        {page.status === "CanLoadMore" && loads < MAX_PAGES ? <Action label={t("mobile.messages.loadOlder")} disabled={!guard.canAct} onPress={() => { if (guard.current()) { setLoads(value => value + 1); page.loadMore(PAGE_SIZE) } }} /> : null}
        {page.status === "CanLoadMore" && loads >= MAX_PAGES ? <Label muted>{t("mobile.common.windowLimit")}</Label> : null}
      </View>} />
    {intent ? <Card><Label>{intent.text}</Label><Label muted>{t(intent.state === "pending" ? "mobile.messages.sending" : intent.state === "admitted" ? "mobile.messages.sent" : "mobile.messages.uncertain")}</Label></Card> : null}
    {lastReceipt ? <Card><Label>{lastReceipt.text}</Label><Label muted>{t("mobile.messages.sent")}</Label></Card> : null}
    <Field label={t("mobile.messages.message")} value={text} onChangeText={messageField.onChange} multiline error={form.formState.errors.message?.message} maxLength={MESSAGE_MAX_LENGTH} disabled={!guard.canAct || !guard.runtime.canWrite || intent !== null} />
    <Action label={t(intent?.state === "uncertain" ? "mobile.messages.retryExact" : "mobile.messages.send")} tone="primary" disabled={!guard.canAct || !guard.runtime.canWrite || !focused || intent?.state === "pending" || intent?.state === "admitted" || intent === null && text.trim().length === 0} pending={intent?.state === "pending"} onPress={() => { void form.handleSubmit(({ message }) => submit(message))() }} />
  </KeyboardAvoidingView>
}
export function ConversationScreen({ threadId, focused = true }: { threadId: Id<"personalThreads">; focused?: boolean }) {
  const runtime = useNativeRuntime(), { t } = useNativeAppearance(), [version, setVersion] = useState(0)
  const key = nativeScope(runtime) + ":" + threadId + ":" + version
  return <Screen title={t("mobile.messages.conversationTitle")}><QueryBoundary key={key} resetKey={key} fallback={<Card><Label>{t("mobile.common.unavailable")}</Label><Action label={t("mobile.common.refresh")} disabled={!runtime.foreground || !runtime.online} onPress={() => { if (runtime.isCurrent() && runtime.foreground && runtime.online) setVersion(value => value + 1) }} /></Card>}><ConversationBody threadId={threadId} focused={focused} /></QueryBoundary></Screen>
}
