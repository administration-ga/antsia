import { api, type Id } from "@antsia/api/engine"
import { MESSAGE_MAX_LENGTH } from "@antsia/social-contracts/messaging"
import type { PostMediaDto } from "@antsia/social-contracts/media"
import { useMutation, usePaginatedQuery, useQuery } from "convex/react"
import type { FunctionReturnType } from "convex/server"
import * as Crypto from "expo-crypto"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
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
import { nativeNamedKey } from "../lib/native-safety"
import { NativeSafetyMenu, NativeUnblockAction, type NativeSafetyPerson } from "./safety-actions"

type Message = FunctionReturnType<typeof api.modules.messaging.messages.paginateMessages>["page"][number]
const PAGE_SIZE = 20, MAX_PAGES = 10
/** MB-04 : Signaler un message reçu (cible `personalMessage`, motif seul) et bloquer son expéditeur ; le signalement part d'abord. */
function MessageSafetyMenu({ message, onBlocked }: { message: Message; onBlocked: (person: NativeSafetyPerson) => void }) {
  const guard = useNativeGuard(), { t } = useNativeAppearance()
  const report = useMutation(api.modules.moderation.cases.report)
  const menu = nativeNamedKey("mobile.safety.menu.message", message.sender.displayName)
  return <NativeSafetyMenu label={t(menu.key, menu.values)} person={{ personId: message.senderPersonId, name: message.sender.displayName }} onBlocked={onBlocked}
    report={{ kind: "personalMessage", actionLabel: t("mobile.safety.report.action.personalMessage"), send: form => report({ networkId: guard.runtime.networkId, target: { kind: "personalMessage", id: message.messageId }, reason: form.reason }) }} />
}

/** MB-04 : depuis la conversation, Signaler la personne et la Bloquer. */
function CounterpartSafetyMenu({ person, onBlocked }: { person: NativeSafetyPerson; onBlocked: (person: NativeSafetyPerson) => void }) {
  const guard = useNativeGuard(), { t } = useNativeAppearance()
  const report = useMutation(api.modules.moderation.cases.report)
  const menu = nativeNamedKey("mobile.safety.menu.person", person.name), action = nativeNamedKey("mobile.safety.report.action.person", person.name)
  return <NativeSafetyMenu label={t(menu.key, menu.values)} person={person} onBlocked={onBlocked}
    report={{ kind: "person", actionLabel: t(action.key, action.values), send: form => report({ networkId: guard.runtime.networkId, target: { kind: "person", id: person.personId }, reason: form.reason }) }} />
}

function MessageCard({ message, active, onPlay, enabled, onBlocked }: { message: Message; active: boolean; onPlay: () => void; enabled: boolean; onBlocked: (person: NativeSafetyPerson) => void }) {
  const { t } = useNativeAppearance()
  const media: PostMediaDto[] = message.attachmentFiles.filter(file => file.mimeType.startsWith("image/") || file.mimeType.startsWith("video/")).map(file => ({ kind: file.mimeType.startsWith("image/") ? "image" : "video", url: file.url, withheld: file.withheld, mimeType: file.mimeType, altText: file.filename }))
  const reportable = !message.isMine && !message.deleted && message.type === "text"
  return <Card>
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}><View style={{ flex: 1, minWidth: 0 }}><Label strong>{message.isMine ? t("mobile.messages.me") : message.sender.displayName ?? t("mobile.messages.unknownPerson")}</Label></View>{reportable ? <MessageSafetyMenu message={message} onBlocked={onBlocked} /> : null}</View>
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
function ConversationBody({ threadId, focused, onBlocked }: { threadId: Id<"personalThreads">; focused: boolean; onBlocked: (person: NativeSafetyPerson) => void }) {
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
    <RuntimeNotice /><View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}><View style={{ flex: 1, minWidth: 0 }}><Label strong>{thread.counterpart.displayName ?? t("mobile.messages.unknownPerson")}</Label></View><CounterpartSafetyMenu person={{ personId: thread.counterpart.personId, name: thread.counterpart.displayName }} onBlocked={onBlocked} /></View>
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
      renderItem={({ item }) => <MessageCard message={item} onBlocked={onBlocked} active={focused && activeMedia === String(item.messageId)} enabled={guard.canAct && focused} onPlay={() => { if (guard.current() && focused) setActiveMedia(previous => previous === String(item.messageId) ? null : String(item.messageId)) }} />}
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
/**
 * Après un blocage depuis la conversation, le fil devient refusé (`getThread`
 * rend `null`) : l'écran garde, pour cette ouverture seulement, la personne
 * bloquée, pour dire pourquoi et offrir « Débloquer ». Au retour, le blocage se
 * lève depuis Réglages › Personnes bloquées.
 */
function BlockedConversation({ person, onUnblocked }: { person: NativeSafetyPerson; onUnblocked: () => void }) {
  const { t } = useNativeAppearance(), { key, values } = nativeNamedKey("mobile.safety.conversation.blocked", person.name)
  return <Card><Label>{t(key, values)}</Label><NativeUnblockAction person={person} onUnblocked={onUnblocked} /></Card>
}

export function ConversationScreen({ threadId, focused = true }: { threadId: Id<"personalThreads">; focused?: boolean }) {
  const runtime = useNativeRuntime(), { t } = useNativeAppearance(), [version, setVersion] = useState(0)
  const [blocked, setBlocked] = useState<{ owner: string; person: NativeSafetyPerson } | null>(null)
  const owner = nativeScope(runtime), key = owner + ":" + threadId + ":" + version
  const onBlocked = useCallback((person: NativeSafetyPerson) => setBlocked({ owner, person }), [owner])
  return <Screen title={t("mobile.messages.conversationTitle")}>{blocked?.owner === owner ? <BlockedConversation person={blocked.person} onUnblocked={() => { setBlocked(null); setVersion(value => value + 1) }} /> : <QueryBoundary key={key} resetKey={key} fallback={<Card><Label>{t("mobile.common.unavailable")}</Label><Action label={t("mobile.common.refresh")} disabled={!runtime.foreground || !runtime.online} onPress={() => { if (runtime.isCurrent() && runtime.foreground && runtime.online) setVersion(value => value + 1) }} /></Card>}><ConversationBody threadId={threadId} focused={focused} onBlocked={onBlocked} /></QueryBoundary>}</Screen>
}
