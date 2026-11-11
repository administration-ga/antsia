import { NativeText as Text } from "../components/native-text"
import { useEffect, useMemo, useRef, useState } from "react"
import { Alert, Pressable, ScrollView, Share } from "react-native"
import { Controller, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { randomUUID } from "expo-crypto"
import { useMutation } from "convex/react"
import { api, type Id } from "@antsia/api/engine"
import { PERSONAL_POST_MAX_LENGTH } from "@antsia/social-domain/content"
import { useNativeAppearance } from "../appearance"
import { NativeIcon } from "../components/icon"
import { Action, Field, Label, Status, useNativeGuard } from "../components/ui"
import { nativeCanonicalPostUrl, nativeQuoteIntent, type NativeQuoteIntent } from "../lib/feed-presentation"
import { nativeReportAcknowledgementKey, nativeReportNote, nativeSafetyOutcome, nativeSafetySteps, type NativeReportForm, type NativeSafetyStep } from "../lib/native-safety"
import type { NativeFeedPost } from "./feed-screen"

import { PostSheet } from "../components/sheet"
import { confirmNativeBlock, nativeSafetyBlockLabel, NativeReportFormView, useNativeSafetyRunner, type NativeSafetyPerson } from "./safety-actions"

export { PostSheet }

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

/**
 * Le menu « … » d'une publication. PF-04 / MB-04 : « Bloquer l'auteur »
 * (personne seulement, jamais soi ni une page) et le formulaire de signalement
 * commun, qui propose de bloquer aussi l'auteur — le signalement part d'abord.
 * Signaler et bloquer suivent la garde de session sans exiger `canWrite` (le
 * moteur les admet dès l'adhésion en attente) ; masquer, mettre en sourdine,
 * épingler et supprimer gardent leur règle.
 */
export function PostOverflowAction({ post }: { post: NativeFeedPost }) {
  const { t, tokens } = useNativeAppearance(), guard = useNativeGuard(), safety = useNativeSafetyRunner()
  const [open, setOpen] = useState(false), [reporting, setReporting] = useState<{ alsoBlock: boolean } | null>(null)
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(""), [error, setError] = useState(false)
  const lock = useRef(false), mounted = useRef(true)
  const { registerCleanup } = guard.runtime
  useEffect(() => { mounted.current = true; const unregister = registerCleanup(() => { setOpen(false); setReporting(null) }); return () => { mounted.current = false; unregister() } }, [registerCleanup])
  const hide = useMutation(api.modules.marks.marks.hidePost), mute = useMutation(api.modules.marks.marks.muteAuthor)
  const report = useMutation(api.modules.moderation.moderation.reportPost), remove = useMutation(api.modules.posts.posts.remove), pin = useMutation(api.modules.posts.posts.pinOnMyWall)
  const block = useMutation(api.modules.graph.connections.blockPerson)
  const author: NativeSafetyPerson | null = post.page === null && post.author.personId && post.author.personId !== guard.runtime.personId && !post.isMine ? { personId: post.author.personId, name: post.author.displayName } : null
  const act = async (kind: "hide" | "mute" | "remove" | "pin") => {
    if (lock.current || !guard.current() || !guard.runtime.canWrite) return
    lock.current = true; setBusy(true); setMessage(""); setError(false)
    const current = guard.capture()
    try {
      const args = { networkId: guard.runtime.networkId, postId: post._id }
      if (kind === "hide") await hide(args)
      else if (kind === "mute" && post.page === null && post.author.personId && post.author.personId !== guard.runtime.personId) await mute({ networkId: guard.runtime.networkId, targetPersonId: post.author.personId })
      else if (kind === "remove" && post.isMine) await remove(args)
      else if (kind === "pin" && post.isMine && !post.page && post.audience !== "group") await pin(args)
      else return
      if (current()) { setOpen(false); setMessage(t(`mobile.feedUi.${kind === "hide" ? "hidden" : kind === "mute" ? "muted" : kind === "pin" ? "pinned" : "removed"}`)) }
    } catch { if (current()) { setError(true); setMessage(t("mobile.common.unavailable")) } }
    finally { lock.current = false; if (mounted.current) setBusy(false) }
  }
  const protect = async (steps: readonly NativeSafetyStep[], form?: NativeReportForm) => {
    let reportAck: string | undefined
    const networkId = guard.runtime.networkId
    const result = await safety.run(steps, async step => {
      if (step === "report" && form && !post.isMine) reportAck = nativeReportAcknowledgementKey(await report({ networkId, postId: post._id, reason: form.reason, ...nativeReportNote("post", form.note) }))
      else if (step === "block" && author) await block({ networkId, targetPersonId: author.personId })
      else throw new Error("nativeSafetyStepUnavailable")
    })
    const outcome = nativeSafetyOutcome(t, result, { name: author?.name ?? null, reportAck })
    if (!outcome) return
    // Le masque du déclarant ou le blocage retire souvent la publication : l'avis de session survit à la carte.
    safety.notify(outcome.text, outcome.error)
    if (mounted.current) {
      setMessage(outcome.text); setError(outcome.error)
      if (!outcome.error || result.status === "failed" && result.completed.length > 0) { setOpen(false); setReporting(null) }
    }
  }
  const pending = busy || safety.pending
  if (!guard.canRead) return null
  return <>
    <Pressable accessibilityRole="button" accessibilityLabel={t("mobile.feedUi.menu")} accessibilityState={{ expanded: open, disabled: !guard.canAct }} disabled={!guard.canAct} onPress={() => { if (guard.current()) { setOpen(true); setReporting(null); setMessage(""); setError(false) } }} style={{ width: 44, minHeight: 44, alignItems: "center", justifyContent: "center" }}><Text accessible={false} style={{ color: tokens.foreground, fontSize: 26, fontWeight: "700" }}>⋯</Text></Pressable>
    <PostSheet title={t(reporting ? "mobile.feedUi.report" : "mobile.feedUi.menu")} open={open} onClose={() => { if (!pending) { setOpen(false); setReporting(null) } }}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, gap: 12 }}>
      {reporting && !post.isMine ? <NativeReportFormView kind="post" {...(author ? { blockName: author.name } : {})} initialAlsoBlock={reporting.alsoBlock} pending={safety.pending} onSubmit={form => { void protect(nativeSafetySteps({ report: true, block: form.alsoBlock && author !== null }), form) }} /> : <>
        <Action label={t("mobile.feedUi.hide")} disabled={pending || !guard.runtime.canWrite} onPress={() => { void act("hide") }} />
        {!post.page && post.author.personId && post.author.personId !== guard.runtime.personId ? <Action label={t("mobile.feedUi.mute")} disabled={pending || !guard.runtime.canWrite} onPress={() => { void act("mute") }} /> : null}
        {!post.isMine ? <Action label={t("mobile.feedUi.report")} disabled={pending} onPress={() => { setReporting({ alsoBlock: false }); setMessage(""); setError(false) }} /> : <>
          {!post.page && post.audience !== "group" ? <Action label={t("mobile.feedUi.pin")} disabled={pending || !guard.runtime.canWrite} onPress={() => { void act("pin") }} /> : null}
          <Action label={t("mobile.feedUi.remove")} tone="danger" disabled={pending || !guard.runtime.canWrite} onPress={() => Alert.alert(t("mobile.feedUi.removeConfirm"), undefined, [{ text: t("mobile.feedUi.cancel"), style: "cancel" }, { text: t("mobile.feedUi.remove"), style: "destructive", onPress: () => { void act("remove") } }])} />
        </>}
        {author ? <Action label={t("mobile.safety.block.authorAction")} accessibilityLabel={nativeSafetyBlockLabel(t, author.name)} tone="danger" pending={safety.pending} disabled={pending} onPress={() => confirmNativeBlock(t, author.name, () => { void protect(["block"]) }, () => { setReporting({ alsoBlock: true }); setMessage(""); setError(false) })} /> : null}
      </>}
      <Status error={error} label={message} />
    </ScrollView></PostSheet>
  </>
}
