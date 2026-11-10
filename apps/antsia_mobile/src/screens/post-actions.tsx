import { NativeText as Text } from "../components/native-text"
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { Alert, Modal, Pressable, ScrollView, Share, View } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { Controller, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { randomUUID } from "expo-crypto"
import { useMutation } from "convex/react"
import { api, type Id } from "@antsia/api/engine"
import { PERSONAL_POST_MAX_LENGTH } from "@antsia/social-domain/content"
import { CONTENT_REPORT_REASONS, type ContentReportReason } from "@antsia/social-domain/moderation"
import { useNativeAppearance } from "../appearance"
import { NativeIcon } from "../components/icon"
import { Action, Field, Label, Status, useNativeGuard } from "../components/ui"
import { nativeCanonicalPostUrl, nativeFeedText, nativeQuoteIntent, type NativeQuoteIntent } from "../lib/feed-presentation"
import type { NativeFeedPost } from "./feed-screen"

export function PostSheet({ title, open, onClose, children }: { title: string; open: boolean; onClose: () => void; children: ReactNode }) {
  const { tokens, t } = useNativeAppearance(), guard = useNativeGuard()
  return <Modal visible={open && guard.canAct} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
    <SafeAreaView style={{ flex: 1, backgroundColor: tokens.background }}>
      <View style={{ minHeight: 56, flexDirection: "row", alignItems: "center", paddingHorizontal: 16, gap: 12, borderBottomColor: tokens.border, borderBottomWidth: 1 }}>
        <Text variant="display" accessibilityRole="header" style={{ flex: 1, color: tokens.foreground, fontSize: 19, fontWeight: "700" }}>{title}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={t("mobile.feedUi.close")} onPress={onClose} style={{ minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" }}><NativeIcon name="close" /></Pressable>
      </View>
      {children}
    </SafeAreaView>
  </Modal>
}

export function PostShareAction({ post, onSharePost }: { post: NativeFeedPost; onSharePost?: (postId: Id<"posts">) => void | Promise<void> }) {
  const { t, tokens } = useNativeAppearance(), guard = useNativeGuard()
  const [open, setOpen] = useState(false), [quote, setQuote] = useState(false), [busy, setBusy] = useState(false), [uncertain, setUncertain] = useState(false), [message, setMessage] = useState(""), [hasIntent, setHasIntent] = useState(false)
  const lock = useRef(false), intent = useRef<NativeQuoteIntent | null>(null), mounted = useRef(true)
  const publish = useMutation(api.modules.posts.posts.publish)
  const schema = useMemo(() => z.object({ body: z.string().trim().max(PERSONAL_POST_MAX_LENGTH) }), [])
  const form = useForm<{ body: string }>({ resolver: zodResolver(schema), defaultValues: { body: "" } })
  const { registerCleanup } = guard.runtime
  useEffect(() => { mounted.current = true; const unregister = registerCleanup(() => { intent.current = null; setHasIntent(false); form.reset(); setOpen(false) }); return () => { mounted.current = false; unregister() } }, [registerCleanup, form])
  const url = nativeCanonicalPostUrl(guard.runtime.webUrl, String(post._id), guard.runtime.webBasePath)
  const canQuote = post.audience === "public" && post.share?.available !== false
  const share = async () => {
    if (lock.current || !guard.current()) return
    lock.current = true; setBusy(true); setMessage("")
    const current = guard.capture()
    try {
      if (onSharePost) await onSharePost(post._id)
      else if (url) await Share.share({ message: url, url })
      if (current()) setOpen(false)
    } catch { if (current()) setMessage(t("mobile.common.unavailable")) }
    finally { lock.current = false; if (mounted.current) setBusy(false) }
  }
  const sendQuote = () => form.handleSubmit(async ({ body }) => {
    if (lock.current || !guard.current() || !guard.runtime.canWrite || !canQuote) return
    let next: NativeQuoteIntent | null
    try { next = nativeQuoteIntent(intent.current, guard.owner, String(post._id), body, randomUUID) }
    catch { setMessage(t("mobile.common.unavailable")); return }
    if (!next) return
    intent.current = next; setHasIntent(true); lock.current = true; setBusy(true); setUncertain(false); setMessage("")
    const current = guard.capture()
    try {
      await publish({ networkId: guard.runtime.networkId, sharedPostId: post._id, body: next.body, audience: "connections", idempotencyKey: next.key })
      if (current()) { intent.current = null; setHasIntent(false); form.reset(); setQuote(false); setOpen(false); setMessage(t("mobile.feedUi.quotePublished")) }
    } catch { if (current()) setUncertain(true) }
    finally { lock.current = false; if (mounted.current) setBusy(false) }
  })()
  if (!guard.canRead || (!url && !onSharePost && !canQuote)) return null
  return <>
    <Pressable accessibilityRole="button" accessibilityLabel={`${t("mobile.feedUi.share")} · ${post.shareCount}`} accessibilityState={{ disabled: !guard.canAct }} disabled={!guard.canAct} onPress={() => { if (guard.current()) setOpen(true) }} style={{ minWidth: 44, minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingHorizontal: 10 }}><NativeIcon name="share" size={22} />{post.shareCount > 0 ? <Text style={{ fontSize: 13, fontWeight: "600", color: tokens.foreground }}>{post.shareCount}</Text> : null}</Pressable>
    <PostSheet title={t("mobile.feedUi.share")} open={open} onClose={() => { if (!busy) setOpen(false) }}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, gap: 16 }}>
      <Label strong>{post.page?.name ?? post.author.displayName ?? t("mobile.post.unknownAuthor")}</Label>
      <Text numberOfLines={4} style={{ fontSize: 15, lineHeight: 22, color: tokens.foreground }}>{post.body}</Text>
      {url || onSharePost ? <Action label={t("mobile.feedUi.shareLink")} pending={busy && !quote} disabled={busy} onPress={() => { void share() }} /> : null}
      {canQuote && !quote ? <Action label={t("mobile.feedUi.quote")} disabled={!guard.runtime.canWrite || busy} onPress={() => setQuote(true)} /> : null}
      {quote && canQuote ? <><Label muted>{t("mobile.feedUi.quoteAudience")}</Label><Controller control={form.control} name="body" render={({ field }) => <Field label={t("mobile.feedUi.quoteBody")} value={field.value} onChangeText={field.onChange} multiline maxLength={PERSONAL_POST_MAX_LENGTH} disabled={busy || hasIntent} error={form.formState.errors.body?.message} />} /><Status error label={uncertain ? t("mobile.feedUi.quoteUncertain") : ""} /><Action label={t(uncertain ? "mobile.feedUi.retry" : "mobile.feedUi.quote")} tone="primary" pending={busy} disabled={!guard.canAct || !guard.runtime.canWrite} onPress={() => { void sendQuote() }} /></> : null}
      <Status error label={message} />
    </ScrollView></PostSheet>
  </>
}

export function PostOverflowAction({ post }: { post: NativeFeedPost }) {
  const { t, tokens } = useNativeAppearance(), guard = useNativeGuard()
  const [open, setOpen] = useState(false), [reporting, setReporting] = useState(false), [reason, setReason] = useState<ContentReportReason>("other")
  const [note, setNote] = useState(""), [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [error, setError] = useState(false)
  const lock = useRef(false), mounted = useRef(true)
  const { registerCleanup } = guard.runtime
  useEffect(() => { mounted.current = true; const unregister = registerCleanup(() => { setOpen(false); setNote("") }); return () => { mounted.current = false; unregister() } }, [registerCleanup])
  const hide = useMutation(api.modules.marks.marks.hidePost), mute = useMutation(api.modules.marks.marks.muteAuthor)
  const report = useMutation(api.modules.moderation.moderation.reportPost), remove = useMutation(api.modules.posts.posts.remove), pin = useMutation(api.modules.posts.posts.pinOnMyWall)
  const act = async (kind: "hide" | "mute" | "report" | "remove" | "pin") => {
    if (lock.current || !guard.current() || !guard.runtime.canWrite) return
    lock.current = true; setBusy(true); setMessage(""); setError(false)
    const current = guard.capture()
    try {
      const args = { networkId: guard.runtime.networkId, postId: post._id }
      if (kind === "hide") await hide(args)
      else if (kind === "mute" && post.page === null && post.author.personId && post.author.personId !== guard.runtime.personId) await mute({ networkId: guard.runtime.networkId, targetPersonId: post.author.personId })
      else if (kind === "report" && !post.isMine) await report({ ...args, reason, ...(note.trim() ? { note: note.trim() } : {}) })
      else if (kind === "remove" && post.isMine) await remove(args)
      else if (kind === "pin" && post.isMine && !post.page && post.audience !== "group") await pin(args)
      else return
      if (current()) { setOpen(false); setMessage(t(`mobile.feedUi.${kind === "hide" ? "hidden" : kind === "mute" ? "muted" : kind === "report" ? "reported" : kind === "pin" ? "pinned" : "removed"}`)) }
    } catch { if (current()) { setError(true); setMessage(t("mobile.common.unavailable")) } }
    finally { lock.current = false; if (mounted.current) setBusy(false) }
  }
  if (!guard.canRead) return null
  return <>
    <Pressable accessibilityRole="button" accessibilityLabel={t("mobile.feedUi.menu")} accessibilityState={{ expanded: open, disabled: !guard.canAct }} disabled={!guard.canAct} onPress={() => { if (guard.current()) { setOpen(true); setReporting(false) } }} style={{ width: 44, minHeight: 44, alignItems: "center", justifyContent: "center" }}><Text accessible={false} style={{ color: tokens.foreground, fontSize: 26, fontWeight: "700" }}>⋯</Text></Pressable>
    <PostSheet title={t(reporting ? "mobile.feedUi.report" : "mobile.feedUi.menu")} open={open} onClose={() => { if (!busy) setOpen(false) }}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, gap: 12 }}>
      {reporting ? <><Label strong>{t("mobile.feedUi.reportReason")}</Label>{CONTENT_REPORT_REASONS.map(value => <Action key={value} label={nativeFeedText(t, `reason.${value}`)} accessibilityRole="radio" checked={reason === value} tone={reason === value ? "primary" : "neutral"} disabled={busy} onPress={() => setReason(value)} />)}<Field label={t("mobile.feedUi.reportNote")} value={note} onChangeText={setNote} maxLength={1000} multiline disabled={busy} /><Action label={t("mobile.feedUi.reportSend")} tone="primary" pending={busy} disabled={!guard.runtime.canWrite} onPress={() => { void act("report") }} /></> : <>
        <Action label={t("mobile.feedUi.hide")} disabled={busy || !guard.runtime.canWrite} onPress={() => { void act("hide") }} />
        {!post.page && post.author.personId && post.author.personId !== guard.runtime.personId ? <Action label={t("mobile.feedUi.mute")} disabled={busy || !guard.runtime.canWrite} onPress={() => { void act("mute") }} /> : null}
        {!post.isMine ? <Action label={t("mobile.feedUi.report")} disabled={busy || !guard.runtime.canWrite} onPress={() => setReporting(true)} /> : <>
          {!post.page && post.audience !== "group" ? <Action label={t("mobile.feedUi.pin")} disabled={busy || !guard.runtime.canWrite} onPress={() => { void act("pin") }} /> : null}
          <Action label={t("mobile.feedUi.remove")} tone="danger" disabled={busy || !guard.runtime.canWrite} onPress={() => Alert.alert(t("mobile.feedUi.removeConfirm"), undefined, [{ text: t("mobile.feedUi.cancel"), style: "cancel" }, { text: t("mobile.feedUi.remove"), style: "destructive", onPress: () => { void act("remove") } }])} />
        </>}
      </>}
      <Status error={error} label={message} />
    </ScrollView></PostSheet>
  </>
}
