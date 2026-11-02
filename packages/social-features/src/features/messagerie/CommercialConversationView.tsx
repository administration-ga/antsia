"use client"

import { useNetwork } from "@antsia/api/network"
import { useViewerTimeZone } from "@antsia/api/viewer-preferences"
import { COMMERCIAL_ATTACHMENTS_MAX, commercialText } from "@antsia/social-domain/commercialContact"
import { CONTENT_REPORT_REASONS } from "@antsia/social-domain/moderation"
import { zodResolver } from "@hookform/resolvers/zod"
import { useConvexAuth } from "convex/react"
import { useEffect, useRef, useState, type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { useCallStore } from "../../stores/call-store"
import { refusalEndKind } from "../iappel/call-phase"
import { COMMERCIAL_MESSAGING_SOURCE as source, orderedCommercialMessages, type CommercialAttachment, type CommercialMessage, type CommercialThread, type CommercialThreadId } from "./commercial-messaging-source"
import { ConversationHeader } from "./ConversationHeader"
import { MessageAttachment } from "./MessageAttachment"
import { MessageComposer } from "./MessageComposer"
import { messageErreurLisible } from "./messagerie-erreur"
import { AbandonedMessageSend } from "./messagerie-send-intent"
import { resultatAppelDe } from "./messagerie-source"
import { useConversationSend } from "./use-conversation-send"

export interface CommercialConversationViewProps {
	threadId: string
	onBack: () => void
	onOpenOffer?: (handle: string, offerRef: string) => void
	renderExtras?: (thread: CommercialThread) => ReactNode
}

/** P10 : un canal commercial, sans façade de fil personnel ni accord CRM implicite. */
export function CommercialConversationView(props: CommercialConversationViewProps) {
	const { networkId, personId } = useNetwork()
	return <CommercialConversation key={JSON.stringify([networkId, personId, props.threadId])} {...props} />
}

function CommercialConversation({ threadId: rawId, onBack, onOpenOffer, renderExtras }: CommercialConversationViewProps) {
	const { t, i18n } = useTranslation("shops")
	const timeZone = useViewerTimeZone()
	const { networkId, personId } = useNetwork()
	const { isAuthenticated } = useConvexAuth()
	// Conversion de la seule référence commerciale reçue de la route ; le serveur rejoue les gardes.
	const threadId = rawId as CommercialThreadId
	const query = source.useThread(threadId)
	const thread = query.data
	const [cursors, setCursors] = useState<(string | null)[]>([null])
	const cursor = cursors.at(-1) ?? null
	const messages = source.useMessages(threadId, cursor, !!thread)
	const writes = source.useWrites()
	const sender = useConversationSend(JSON.stringify([networkId, personId]), `commerce:${rawId}`, isAuthenticated)
	const [text, setText] = useState("")
	const [error, setError] = useState<string | null>(null)
	const [saved, setSaved] = useState(false)
	const [busy, setBusy] = useState(false)
	const lock = useRef(false)
	const [confirmation, setConfirmation] = useState<"decline" | "block" | "close" | null>(null)
	const [respondent, setRespondent] = useState("")
	const [reporting, setReporting] = useState<CommercialMessage["messageId"] | null>(null)
	const [reportSaved, setReportSaved] = useState(false)
	const [removingMessage, setRemovingMessage] = useState<CommercialMessage["messageId"] | null>(null)
	const calls = useCallStore()
	const date = (at: number) => new Intl.DateTimeFormat(i18n.resolvedLanguage ?? "fr", { dateStyle: "medium", timeStyle: "short", timeZone }).format(at)
	async function run<T,>(operation: () => Promise<T>): Promise<T | undefined> {
		if (lock.current || !sender.isCurrent()) return undefined
		lock.current = true
		setBusy(true)
		setError(null)
		setSaved(false)
		try {
			const value = await operation()
			if (!sender.isCurrent()) return undefined
			setSaved(true)
			return value
		} catch (reason) {
			if (sender.isCurrent()) setError(messageErreurLisible(reason, t))
			return undefined
		} finally {
			lock.current = false
			if (sender.isCurrent()) setBusy(false)
		}
	}
	const read = useRef(writes.read)
	read.current = writes.read
	const seen = useRef<string | null>(null)
	useEffect(() => {
		if (cursor !== null || !thread?.unread || !messages.data || !sender.isCurrent()) return
		const receipt = `${thread.threadId}:${thread.lastMessageAt}`
		if (seen.current === receipt) return
		seen.current = receipt
		void read.current(thread.threadId).catch((reason: unknown) => { if (sender.isCurrent()) { seen.current = null; setError(messageErreurLisible(reason, t)) } })
	}, [cursor, thread?.threadId, thread?.unread, thread?.lastMessageAt, messages.data, sender.isCurrent, t])

	if (query.isError) return <div className="grid gap-3 p-5" role="alert"><p>{t("contact.unavailable")}</p><button type="button" className="msg-tool-btn" onClick={() => void query.refetch()}>{t("common.retry")}</button><button type="button" className="msg-tool-btn" onClick={onBack}>{t("common.back")}</button></div>
	if (thread === undefined) return <p role="status" className="p-5">{t("common.loading")}</p>
	if (thread === null) return <div className="grid gap-3 p-5"><p role="status">{t("contact.unavailable")}</p><button type="button" className="msg-tool-btn" onClick={onBack}>{t("common.back")}</button></div>
	const counterpart = thread.viewerKind === "requester" ? thread.shop.name : thread.requester.displayName ?? thread.requester.handle ?? t("contact.person")
	const eligibleRespondents = thread.respondents.filter((item) => item.callConsent)
	const selectedRespondent = eligibleRespondents.find((item) => String(item.personId) === respondent) ?? eligibleRespondents[0]
	const doCall = (mediaType: "audio" | "video") => void run(async () => {
		const raw = await writes.call({ threadId, mediaType, ...(thread.viewerKind === "requester" && selectedRespondent ? { respondentPersonId: selectedRespondent.personId } : {}) })
		if (!sender.isCurrent()) return
		const result = resultatAppelDe(raw, { adresse: "", mediaType })
		const callee = { userId: result.targetUserId, name: thread.viewerKind === "requester" ? selectedRespondent?.displayName ?? thread.shop.name : thread.requester.displayName, handle: thread.viewerKind === "requester" ? selectedRespondent?.handle ?? null : thread.requester.handle, avatarUrl: null }
		if (!result.admitted) calls.openRefusedCall({ meetingId: result.meetingId, mediaType, endKind: refusalEndKind(result.reason), message: null, voicemailOffered: false, scope: "personnel", callee })
		else calls.openOutgoingCall({ meetingId: result.meetingId, participantUserId: result.targetUserId, mediaType: result.mediaType, startedAt: Date.now(), scope: "personnel", callee })
	})
	return <>
		<ConversationHeader variant="page" kind="draft" title={counterpart} subtitle={t(`contact.states.${thread.state}`)} onBack={onBack} />
		<div className="msg-body grid content-start gap-4 p-4" style={{ fontSize: "var(--esp-content-font-size, inherit)", lineHeight: "var(--esp-content-line-height, inherit)" }} aria-busy={busy || undefined}>
			<p className="text-sm text-muted-foreground">{t("contact.privateChannel")}</p>
			{thread.offer ? <button type="button" className="msg-tool-btn justify-self-start" onClick={() => onOpenOffer?.(thread.shop.handle, thread.offer!.offerRef)} disabled={!onOpenOffer}>{t("contact.offerContext", { title: thread.offer.title })}</button> : <p className="text-xs text-muted-foreground">{t("contact.noOffer")}</p>}
			<p role="status" className="text-sm">{t(`contact.stateHelp.${thread.state}`)}</p>
			<div className="flex flex-wrap gap-2">
				{thread.capabilities.canDecide ? <><button data-role="success" type="button" className="msg-tool-btn" disabled={busy} onClick={() => void run(() => writes.decide({ threadId, expectedRevision: thread.revision, decision: "accept" }))}>{t("contact.accept")}</button><button data-role="danger" type="button" className="msg-tool-btn" disabled={busy} onClick={() => setConfirmation("decline")}>{t("contact.decline")}</button></> : null}
				{thread.capabilities.canBlock ? <button data-role={thread.state === "blocked" ? "success" : "danger"} type="button" className="msg-tool-btn" disabled={busy} onClick={() => thread.state === "blocked" ? void run(() => writes.block({ threadId, blocked: false })) : setConfirmation("block")}>{t(thread.state === "blocked" ? "contact.unblock" : "contact.block")}</button> : null}
				{thread.capabilities.canClose ? <button data-role="danger" type="button" className="msg-tool-btn" disabled={busy} onClick={() => setConfirmation("close")}>{t("contact.close")}</button> : null}
			</div>
			{confirmation ? <div className="grid gap-2 rounded-[var(--esp-primitive-card-radius,0.75rem)] border border-border p-[var(--esp-card-padding,0.75rem)]"><p>{t(`contact.confirm.${confirmation}`)}</p><div className="flex gap-2"><button data-role="danger" type="button" className="msg-tool-btn" disabled={busy} onClick={() => void run(async () => { if (confirmation === "decline") await writes.decide({ threadId, expectedRevision: thread.revision, decision: "decline" }); else if (confirmation === "block") await writes.block({ threadId, blocked: true }); else await writes.close(threadId); if (sender.isCurrent()) setConfirmation(null) })}>{t("contact.confirm.action")}</button><button type="button" className="msg-tool-btn" disabled={busy} onClick={() => setConfirmation(null)}>{t("contact.cancel")}</button></div></div> : null}
			{error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
			{saved ? <p role="status" className="text-sm">{t("contact.recorded")}</p> : null}
			{reportSaved ? <p role="status" className="text-sm">{t("contact.reportRecorded")}</p> : null}
			{reporting !== null ? <CommercialReport key={reporting} pending={busy} onCancel={() => setReporting(null)} onSubmit={async (reason) => { const result = await run(() => writes.report(reporting, reason)); if (result !== undefined && sender.isCurrent()) { setReporting(null); setReportSaved(true) } }} /> : null}
			{removingMessage !== null ? <div className="grid gap-2 rounded-[var(--esp-primitive-card-radius,0.75rem)] border border-border p-[var(--esp-card-padding,0.75rem)]"><p>{t("contact.confirmRemove")}</p><div className="flex flex-wrap gap-2"><button data-role="danger" type="button" className="msg-tool-btn" disabled={busy} onClick={() => void run(async () => { await writes.remove({ threadId, messageId: removingMessage }); if (sender.isCurrent()) setRemovingMessage(null) })}>{t("contact.confirm.action")}</button><button type="button" className="msg-tool-btn" disabled={busy} onClick={() => setRemovingMessage(null)}>{t("contact.cancel")}</button></div></div> : null}
			{messages.isError ? <div role="alert"><p>{t("contact.messagesUnavailable")}</p><button type="button" className="msg-tool-btn" onClick={() => void messages.refetch()}>{t("common.retry")}</button></div> : messages.data === undefined ? <p role="status">{t("common.loading")}</p> : <>
				<nav className="flex flex-wrap gap-2" aria-label={t("contact.messagePages")}><button type="button" className="msg-tool-btn" disabled={cursors.length <= 1 || messages.isFetching} onClick={() => setCursors((items) => items.slice(0, -1))}>{t("contact.newerMessages")}</button><button type="button" className="msg-tool-btn" disabled={messages.data.isDone || messages.isFetching} onClick={() => { if (messages.data && !messages.data.isDone) setCursors((items) => [...items, messages.data.continueCursor]) }}>{t("contact.olderMessages")}</button></nav>
				{messages.data.page.length === 0 ? <p role="status">{t("contact.noMessages")}</p> : null}
				<ol className="grid gap-3">{orderedCommercialMessages(messages.data.page).map((message) => <li key={message.messageId} className={`max-w-full rounded-[var(--esp-primitive-card-radius,0.75rem)] border border-[var(--esp-primitive-surface-border,var(--border))] p-[var(--esp-card-padding,0.75rem)] ${message.isMine ? "bg-muted" : "bg-card"}`}><p className="text-xs font-medium">{message.senderKind === "shop" ? t("contact.replyAuthor", { shop: thread.shop.name, name: message.sender.displayName ?? message.sender.handle ?? t("contact.person") }) : message.sender.displayName ?? message.sender.handle ?? t("contact.person")}</p>{message.deleted || message.withheld ? <p className="text-sm italic">{t(message.withheld ? "contact.withheld" : "contact.deleted")}</p> : <><p className="whitespace-pre-wrap break-words">{message.content}</p>{message.attachmentFiles.map((attachment, index) => <MessageAttachment key={index} attachment={attachment} />)}</>}<div className="mt-2 flex flex-wrap items-center gap-2"><time className="text-xs text-muted-foreground" dateTime={new Date(message.createdAt).toISOString()}>{date(message.createdAt)}</time>{message.isMine && !message.deleted ? <button data-role="danger" type="button" className="msg-tool-btn" disabled={busy} onClick={() => setRemovingMessage(message.messageId)}>{t("contact.removeMessage")}</button> : null}{!message.isMine && !message.deleted && !message.withheld ? <button data-role="danger" type="button" className="msg-tool-btn" disabled={busy} onClick={() => { setReporting(message.messageId); setReportSaved(false) }}>{t("contact.reportMessage")}</button> : null}</div></li>)}</ol>
			</>}
			{thread.capabilities.canSetCallConsent && (thread.state === "accepted" || thread.callConsent) ? <section className="grid gap-2 rounded-[var(--esp-primitive-card-radius,0.75rem)] border border-border p-[var(--esp-card-padding,0.75rem)]"><label className="flex min-h-11 items-center gap-3"><input type="checkbox" checked={thread.callConsent} disabled={busy} onChange={(event) => void run(() => writes.consent({ threadId, allowed: event.target.checked }))} /><span>{t("contact.calls.consent")}</span></label><p className="text-xs text-muted-foreground">{t("contact.calls.help")}</p>{thread.viewerKind === "requester" && eligibleRespondents.length > 1 ? <label className="grid gap-1 text-sm">{t("contact.calls.respondent")}<select className="min-h-11 rounded-[var(--esp-input-radius,0.5rem)] border border-input bg-background p-2" value={String(selectedRespondent?.personId ?? "")} disabled={busy} onChange={(event) => setRespondent(event.target.value)}>{eligibleRespondents.map((item) => <option key={item.personId} value={item.personId}>{item.displayName ?? item.handle ?? t("contact.person")}</option>)}</select></label> : null}<div className="flex gap-2"><button type="button" className="msg-tool-btn" disabled={busy || !thread.capabilities.canCall || calls.globalActiveMeetingId !== null} onClick={() => doCall("audio")}>{t("contact.calls.audio")}</button><button type="button" className="msg-tool-btn" disabled={busy || !thread.capabilities.canCall || calls.globalActiveMeetingId !== null} onClick={() => doCall("video")}>{t("contact.calls.video")}</button></div></section> : null}
			{renderExtras?.(thread)}
		</div>
		{thread.capabilities.canSend ? <MessageComposer key={`${threadId}:${thread.capabilities.canAttach}`} contextKey={`${networkId}:${personId}:commerce:${threadId}`} isContextCurrent={sender.isCurrent} value={text} onChange={setText} placeholder={t("contact.messagePlaceholder")} ariaLabel={t("contact.messageLabel")} allowVoice={false} allowAttachments={thread.capabilities.canAttach} maxAttachments={COMMERCIAL_ATTACHMENTS_MAX} disabled={busy} generateUploadUrl={() => writes.upload(threadId)} onError={setError} onSend={async (payload) => {
			if (commercialText(payload.text, payload.attachments.length > 0) === null) { setError(t("contact.validation.message")); throw new AbandonedMessageSend() }
			if (payload.attachments.length > COMMERCIAL_ATTACHMENTS_MAX) { setError(t("contact.validation.attachments", { max: COMMERCIAL_ATTACHMENTS_MAX })); throw new AbandonedMessageSend() }
			const result = await run(() => sender.perform({ text: payload.text, attachments: payload.attachments, replyTo: null }, (idempotencyKey) => writes.send({ threadId, text: payload.text, attachments: payload.attachments.map((item) => ({ ...item, storageId: item.storageId as CommercialAttachment["storageId"] })), idempotencyKey })))
			if (result === undefined) throw new AbandonedMessageSend()
			if (sender.isCurrent()) setCursors([null])
		}} /> : null}
	</>
}

const reportSchema = z.object({ reason: z.enum(CONTENT_REPORT_REASONS) })
function CommercialReport({ pending, onCancel, onSubmit }: { pending: boolean; onCancel: () => void; onSubmit: (reason: (typeof CONTENT_REPORT_REASONS)[number]) => Promise<void> }) {
	const { t } = useTranslation("shops")
	const form = useForm<z.infer<typeof reportSchema>>({ resolver: zodResolver(reportSchema), defaultValues: { reason: "harassment" } })
	return <form className="grid gap-2 rounded-[var(--esp-primitive-card-radius,0.75rem)] border border-border p-[var(--esp-card-padding,0.75rem)]" onSubmit={form.handleSubmit(async (values) => onSubmit(values.reason))}><label className="grid gap-2 text-sm font-medium">{t("contact.reportReason")}<select className="min-h-11 rounded-[var(--esp-input-radius,0.5rem)] border border-input bg-background p-2" disabled={pending} {...form.register("reason")}>{CONTENT_REPORT_REASONS.map((reason) => <option key={reason} value={reason}>{t(`reseau:reportContentDialog.reasons.${reason}`)}</option>)}</select></label><div className="flex flex-wrap gap-2"><button data-role="danger" type="submit" className="msg-tool-btn" disabled={pending}>{t("contact.reportSubmit")}</button><button type="button" className="msg-tool-btn" disabled={pending} onClick={onCancel}>{t("contact.cancel")}</button></div></form>
}
