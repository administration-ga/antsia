// Dupliqué de socle/packages/agent-features/src/features/direct/DirectCommentsPanel.tsx @ ad2e7fdc2 — adaptations : commentaires et réactions abonnés seulement dans le volet ouvert, API moteur et réseau, formulaire RHF/Zod, modération par permission serveur et i18n ; couleurs par fonction (ADR-0027) : réactions du direct à la teinte des réactions (`--role-react-soft`, `--role-react-label`), facture du bouton fantôme en repli.
"use client"

import { themedActionStyle } from "../themed-action-style"
import { api } from "@antsia/api/engine"
import { useAuthenticatedConvexQuery } from "@antsia/api/hooks"
import { useNetwork } from "@antsia/api/network"
import { DIRECT_COMMENT_MAX_LENGTH } from "@antsia/social-domain/live/domain"
import { Button } from "@antsia/ui"
import { zodResolver } from "@hookform/resolvers/zod"
import { useMutation } from "convex/react"
import type { CSSProperties } from "react"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { z } from "zod"
import type { DirectSession } from "./DirectPage"
import { useDirectCommand } from "./use-direct-command"

const commentSchema = z.object({ body: z.string().trim().min(1).max(DIRECT_COMMENT_MAX_LENGTH) })
const reactionKinds = ["like", "bravo", "soutien", "instructif"] as const
// Réactions : couleur des réactions (ADR-0027), facture du bouton fantôme en repli.
const REACTION_BUTTON_STYLE = { background: "var(--role-react-soft, transparent)", color: "var(--role-react-label, var(--ink-700))" } satisfies CSSProperties

export function DirectDiscussionPanel({ session }: { session: DirectSession }) {
  const { t } = useTranslation("direct")
  const { networkId } = useNetwork()
  const query = useAuthenticatedConvexQuery(api.modules.live.comments.list, { networkId, sessionId: session.sessionId })
  const reactions = useAuthenticatedConvexQuery(api.modules.live.reactions.summary, { networkId, sessionId: session.sessionId })
  const send = useMutation(api.modules.live.comments.send)
  const remove = useMutation(api.modules.live.comments.remove)
  const react = useMutation(api.modules.live.reactions.react)
  const chat = useMutation(api.modules.live.sessions.setChatMode)
  const command = useDirectCommand()
  const { register, handleSubmit, reset, formState: { errors } } = useForm<z.infer<typeof commentSchema>>({ resolver: zodResolver(commentSchema), defaultValues: { body: "" } })
  if (query.isError) return <div role="alert"><p>{t("discussion.failed")}</p><Button variant="ghost" onClick={() => void query.refetch()}>{t("retry")}</Button></div>
  if (!query.data) return <p role="status">{t("loading")}</p>
  return <div className="flex flex-col gap-4" style={{ fontSize: "var(--esp-content-font-size, inherit)", lineHeight: "var(--esp-content-line-height, inherit)" }}>
    {session.permissions.closeChat ? <Button variant="ghost" disabled={command.pending} onClick={() => void command.run(() => chat({ networkId, sessionId: session.sessionId, chatMode: session.chatMode === "open" ? "closed" : "open" }))}>{t(session.chatMode === "open" ? "discussion.close" : "discussion.open")}</Button> : null}
    <div aria-label={t("discussion.comments")} className="max-h-96 overflow-y-auto">
      {query.data.length === 0 ? <p className="text-sm text-muted-foreground">{t("discussion.empty")}</p> : <ol className="flex flex-col gap-3">{query.data.map((comment) => <li key={comment.commentId} className="flex flex-col gap-1 border-b border-border pb-2"><span className="text-sm font-medium">{comment.author.displayName ?? t("person")}</span><p className="whitespace-pre-wrap break-words">{comment.body}</p>{comment.isMine || session.permissions.moderateChat ? <Button style={themedActionStyle("danger", "ghost")} size="sm" variant="danger" disabled={command.pending} onClick={() => void command.run(() => remove({ networkId, commentId: comment.commentId }))}>{t("discussion.remove")}</Button> : null}</li>)}</ol>}
    </div>
    {session.chatMode === "closed" ? <p role="status">{t("discussion.closed")}</p> : <form onSubmit={handleSubmit(async ({ body }) => { if (await command.run(() => send({ networkId, sessionId: session.sessionId, body }))) reset() })} className="flex flex-col gap-2"><label className="flex flex-col gap-2">{t("discussion.write")}<textarea {...register("body")} maxLength={DIRECT_COMMENT_MAX_LENGTH} rows={3} aria-invalid={!!errors.body} style={{ minHeight: "var(--esp-textarea-min-height, 6rem)", fontSize: "var(--esp-field-font-size, inherit)", lineHeight: "var(--esp-field-line-height, inherit)" }} className="min-h-24 rounded-[var(--esp-input-radius,0.5rem)] border border-input bg-background p-3" /></label>{errors.body ? <p role="alert">{t("discussion.invalid", { max: DIRECT_COMMENT_MAX_LENGTH })}</p> : null}<Button type="submit" style={{ background: "var(--role-message-fill, var(--primary-fill))", color: "var(--role-message-on, var(--primary-fill-on, var(--on-fill)))", borderColor: "var(--role-message-fill, var(--primary-fill))" }} disabled={command.pending}>{t("discussion.send")}</Button></form>}
    <div className="flex flex-wrap gap-2" aria-label={t("discussion.reactions")}>
      {reactions.isError ? <p role="alert">{t("discussion.reactionsFailed")}</p> : !reactions.data ? <p role="status">{t("loading")}</p> : reactionKinds.map((kind) => <Button key={kind} size="sm" variant="ghost" style={REACTION_BUTTON_STYLE} disabled={command.pending} onClick={() => void command.run(() => react({ networkId, sessionId: session.sessionId, kind, burst: 1 }))}>{t(`discussion.reaction.${kind}`, { count: reactions.data!.byKind.find((row) => row.kind === kind)?.count ?? 0 })}</Button>)}
    </div>
    {command.error ? <p role="alert">{command.error}</p> : null}
  </div>
}
