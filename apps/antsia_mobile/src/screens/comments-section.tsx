import { NativeText as Text } from "../components/native-text"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Alert, Keyboard, Pressable, View } from "react-native"
import { Controller, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { useMutation, useQuery } from "convex/react"
import type { FunctionReturnType } from "convex/server"
import { api, type Id } from "@antsia/api/engine"
import { PERSONAL_COMMENT_MAX_LENGTH } from "@antsia/social-domain/content"
import { useNativeAppearance } from "../appearance"
import { Action, Field, Label, QueryBoundary, Status, useNativeGuard } from "../components/ui"
import { nativeFeedText, nativeMediaCanAdvance, nativeRelativeTime } from "../lib/feed-presentation"
import { mergeNativePages, nativeCursorKey } from "../lib/native-pagination"

type CommentPage = FunctionReturnType<typeof api.modules.engagement.engagement.paginateComments>
type ReplyPage = FunctionReturnType<typeof api.modules.engagement.engagement.paginateReplies>
type RootComment = CommentPage["page"][number]
type Reply = ReplyPage["page"][number]
type DiscussionProps = { postId: Id<"posts">; commentsOpen: boolean; onOpenProfile?: (handle: string) => void }
const PAGE_SIZE = 20, MAX_PAGES = 10

function CommentWriter({ postId, parentCommentId, onSubmitted, onRefresh }: { postId: Id<"posts">; parentCommentId?: Id<"postComments">; onSubmitted: () => void; onRefresh: () => void }) {
  const guard = useNativeGuard(), { t } = useNativeAppearance()
  const schema = useMemo(() => z.object({ body: z.string().trim().min(1, t("mobile.feedUi.commentInvalid")).max(PERSONAL_COMMENT_MAX_LENGTH, t("mobile.feedUi.commentInvalid")) }), [t])
  const form = useForm<{ body: string }>({ resolver: zodResolver(schema), defaultValues: { body: "" } })
  const send = useMutation(api.modules.engagement.engagement.comment)
  const [pending, setPending] = useState(false), [uncertain, setUncertain] = useState(false)
  const lock = useRef(false), mounted = useRef(true)
  const { registerCleanup } = guard.runtime
  useEffect(() => { mounted.current = true; const unregister = registerCleanup(() => { form.reset(); setUncertain(false) }); return () => { mounted.current = false; unregister() } }, [registerCleanup, form])
  const submit = () => form.handleSubmit(async ({ body }) => {
    if (lock.current || uncertain || !guard.current() || !guard.runtime.canWrite) return
    lock.current = true; setPending(true)
    const current = guard.capture()
    try {
      await send({ networkId: guard.runtime.networkId, postId, body, ...(parentCommentId ? { parentCommentId } : {}) })
      if (current()) { form.reset(); Keyboard.dismiss(); onSubmitted() }
    } catch { if (current()) setUncertain(true) }
    finally { lock.current = false; if (mounted.current) setPending(false) }
  })()
  return <View style={{ gap: 8 }}>
    <Controller control={form.control} name="body" render={({ field }) => <Field label={t(parentCommentId ? "mobile.feedUi.replyBody" : "mobile.feedUi.commentBody")} value={field.value} onChangeText={field.onChange} multiline maxLength={PERSONAL_COMMENT_MAX_LENGTH} disabled={pending || uncertain || !guard.canAct || !guard.runtime.canWrite} error={form.formState.errors.body?.message} />} />
    <Status error label={uncertain ? t("mobile.feedUi.commentUncertain") : ""} />
    {uncertain ? <Action label={t("mobile.feedUi.refreshComments")} disabled={!guard.canAct} onPress={() => { if (guard.current()) onRefresh() }} /> : <Action label={t("mobile.feedUi.send")} tone="primary" pending={pending} disabled={!guard.canAct || !guard.runtime.canWrite} onPress={() => { void submit() }} />}
  </View>
}

function CommentLine({ comment, onReply, onOpenProfile }: { comment: Reply; onReply?: () => void; onOpenProfile?: (handle: string) => void }) {
  const guard = useNativeGuard(), { t, tokens, locale } = useNativeAppearance()
  const [pending, setPending] = useState(false), [error, setError] = useState(false)
  const lock = useRef(false), mounted = useRef(true), remove = useMutation(api.modules.engagement.engagement.removeComment)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const name = comment.author.displayName ?? t("mobile.post.unknownAuthor"), handle = comment.author.handle
  const removeOwn = async () => {
    if (lock.current || !comment.isMine || !guard.current() || !guard.runtime.canWrite) return
    lock.current = true; setPending(true); setError(false)
    const current = guard.capture()
    try { await remove({ networkId: guard.runtime.networkId, commentId: comment.commentId }) }
    catch { if (current()) setError(true) }
    finally { lock.current = false; if (mounted.current) setPending(false) }
  }
  return <View style={{ gap: 5, padding: 12, borderRadius: 14, backgroundColor: tokens.muted }}>
    {handle && onOpenProfile ? <Pressable accessibilityRole="button" accessibilityLabel={nativeFeedText(t, "openProfile", { name })} disabled={!guard.canAct} onPress={() => { if (guard.current()) onOpenProfile(handle) }} style={{ minHeight: 44, justifyContent: "center" }}><Label strong>{name}</Label><Label muted>@{handle}</Label></Pressable> : <Label strong>{name}</Label>}
    <Text selectable style={{ color: tokens.foreground, fontSize: 15, lineHeight: 22 }}>{comment.body}</Text>
    <Text style={{ color: tokens.mutedForeground, fontSize: 12 }}>{nativeRelativeTime(comment.createdAt, Date.now(), locale, t)}</Text>
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
      {onReply ? <Action label={t("mobile.feedUi.reply")} disabled={!guard.canAct || !guard.runtime.canWrite} onPress={() => { if (guard.current()) onReply() }} /> : null}
      {comment.isMine ? <Action label={t("mobile.feedUi.commentRemove")} pending={pending} disabled={!guard.canAct || !guard.runtime.canWrite} onPress={() => Alert.alert(t("mobile.feedUi.commentRemoveConfirm"), undefined, [{ text: t("mobile.feedUi.cancel"), style: "cancel" }, { text: t("mobile.feedUi.commentRemove"), style: "destructive", onPress: () => { void removeOwn() } }])} /> : null}
    </View>
    <Status error label={error ? t("mobile.common.unavailable") : ""} />
  </View>
}

function ReplyWindow({ postId, commentId, cursor, onPage }: { postId: Id<"posts">; commentId: Id<"postComments">; cursor: string | null; onPage: (key: string, page: ReplyPage | undefined) => void }) {
  const guard = useNativeGuard()
  const page = useQuery(api.modules.engagement.engagement.paginateReplies, guard.canRead ? { networkId: guard.runtime.networkId, postId, commentId, paginationOpts: { numItems: PAGE_SIZE, cursor } } : "skip")
  const key = nativeCursorKey(cursor)
  useEffect(() => { if (guard.canRead) onPage(key, page) }, [guard.canRead, key, page, onPage])
  return null
}

function ReplyList({ postId, commentId, onOpenProfile }: { postId: Id<"posts">; commentId: Id<"postComments">; onOpenProfile?: (handle: string) => void }) {
  const guard = useNativeGuard(), { t } = useNativeAppearance()
  const [cursors, setCursors] = useState<(string | null)[]>([null]), [pages, setPages] = useState<Record<string, ReplyPage | undefined>>({})
  const onPage = useCallback((key: string, page: ReplyPage | undefined) => setPages(previous => previous[key] === page ? previous : { ...previous, [key]: page }), [])
  const items = mergeNativePages(cursors.map(cursor => pages[nativeCursorKey(cursor)]?.page ?? []), item => String(item.commentId))
  const tail = pages[nativeCursorKey(cursors[cursors.length - 1] ?? null)]
  const canMore = nativeMediaCanAdvance(cursors, tail?.continueCursor, tail?.isDone ?? false, MAX_PAGES)
  if (!guard.canRead) return null
  return <View style={{ gap: 8, paddingLeft: 12 }}>
    {cursors.map(cursor => <ReplyWindow key={nativeCursorKey(cursor)} postId={postId} commentId={commentId} cursor={cursor} onPage={onPage} />)}
    {items.map(comment => <CommentLine key={String(comment.commentId)} comment={comment} onOpenProfile={onOpenProfile} />)}
    <Status busy={tail === undefined} label={tail === undefined ? t("mobile.common.loading") : ""} />
    {canMore ? <Action label={t("mobile.feedUi.moreReplies")} disabled={!guard.canAct} onPress={() => { if (guard.current()) setCursors(previous => nativeMediaCanAdvance(previous, tail?.continueCursor, tail?.isDone ?? false, MAX_PAGES) ? [...previous, tail!.continueCursor] : previous) }} /> : null}
    {tail && !tail.isDone && !canMore ? <Label muted>{t("mobile.common.windowLimit")}</Label> : null}
  </View>
}

function CommentRoot({ comment, postId, commentsOpen, onOpenProfile, onRefresh }: { comment: RootComment; onRefresh: () => void } & DiscussionProps) {
  const { t } = useNativeAppearance(), guard = useNativeGuard()
  const [replying, setReplying] = useState(false), [expanded, setExpanded] = useState(false), [version, setVersion] = useState(0)
  return <View style={{ gap: 8 }}>
    <CommentLine comment={comment} onReply={commentsOpen ? () => setReplying(value => !value) : undefined} onOpenProfile={onOpenProfile} />
    {expanded ? <QueryBoundary key={version} resetKey={String(version)} fallback={<Status error label={t("mobile.common.unavailable")} />}><ReplyList postId={postId} commentId={comment.commentId} onOpenProfile={onOpenProfile} /></QueryBoundary> : <View style={{ paddingLeft: 12, gap: 8 }}>{comment.replies.map(reply => <CommentLine key={String(reply.commentId)} comment={reply} onOpenProfile={onOpenProfile} />)}{comment.replyCount > comment.replies.length ? <Action label={nativeFeedText(t, "replies", { count: comment.replyCount })} disabled={!guard.canAct} onPress={() => setExpanded(true)} /> : null}</View>}
    {replying && commentsOpen ? <View style={{ paddingLeft: 12, gap: 8 }}><Label muted>{nativeFeedText(t, "replyTo", { name: comment.author.displayName ?? t("mobile.post.unknownAuthor") })}</Label><CommentWriter postId={postId} parentCommentId={comment.commentId} onRefresh={onRefresh} onSubmitted={() => { setExpanded(true); setVersion(value => value + 1); setReplying(false) }} /></View> : null}
  </View>
}

function CommentWindow({ postId, cursor, onPage }: { postId: Id<"posts">; cursor: string | null; onPage: (key: string, page: CommentPage | undefined) => void }) {
  const guard = useNativeGuard()
  const page = useQuery(api.modules.engagement.engagement.paginateComments, guard.canRead ? { networkId: guard.runtime.networkId, postId, paginationOpts: { numItems: PAGE_SIZE, cursor } } : "skip")
  const key = nativeCursorKey(cursor)
  useEffect(() => { if (guard.canRead) onPage(key, page) }, [guard.canRead, key, page, onPage])
  return null
}

function CommentBody({ postId, commentsOpen, onOpenProfile, onRefresh }: DiscussionProps & { onRefresh: () => void }) {
  const guard = useNativeGuard(), { t } = useNativeAppearance()
  const [cursors, setCursors] = useState<(string | null)[]>([null]), [pages, setPages] = useState<Record<string, CommentPage | undefined>>({})
  const onPage = useCallback((key: string, page: CommentPage | undefined) => setPages(previous => previous[key] === page ? previous : { ...previous, [key]: page }), [])
  const items = mergeNativePages(cursors.map(cursor => pages[nativeCursorKey(cursor)]?.page ?? []), item => String(item.commentId))
  const first = pages.first, tail = pages[nativeCursorKey(cursors[cursors.length - 1] ?? null)]
  const canMore = nativeMediaCanAdvance(cursors, tail?.continueCursor, tail?.isDone ?? false, MAX_PAGES)
  if (!guard.canRead) return null
  return <View style={{ gap: 12 }}>
    {cursors.map(cursor => <CommentWindow key={nativeCursorKey(cursor)} postId={postId} cursor={cursor} onPage={onPage} />)}
    <Status busy={first === undefined} label={first === undefined ? t("mobile.common.loading") : items.length === 0 ? t("mobile.feedUi.commentsEmpty") : ""} />
    {items.map(comment => <CommentRoot key={String(comment.commentId)} postId={postId} comment={comment} commentsOpen={commentsOpen} onOpenProfile={onOpenProfile} onRefresh={onRefresh} />)}
    {canMore ? <Action label={t("mobile.feedUi.moreComments")} disabled={!guard.canAct} onPress={() => { if (guard.current()) setCursors(previous => nativeMediaCanAdvance(previous, tail?.continueCursor, tail?.isDone ?? false, MAX_PAGES) ? [...previous, tail!.continueCursor] : previous) }} /> : null}
    {tail && !tail.isDone && !canMore ? <Label muted>{t("mobile.common.windowLimit")}</Label> : null}
    {commentsOpen ? <CommentWriter postId={postId} onSubmitted={onRefresh} onRefresh={onRefresh} /> : <Label muted>{t("mobile.feedUi.commentsClosed")}</Label>}
  </View>
}

export function CommentsSection(props: DiscussionProps) {
  const guard = useNativeGuard(), { t } = useNativeAppearance()
  const [version, setVersion] = useState(0), key = `${guard.owner}:${props.postId}:${version}`
  const refresh = () => { if (guard.current()) setVersion(value => value + 1) }
  return <View style={{ padding: 14, gap: 12 }}><Label strong accessibilityRole="header">{t("mobile.feedUi.comments")}</Label><QueryBoundary key={key} resetKey={key} fallback={<><Status error label={t("mobile.common.unavailable")} /><Action label={t("mobile.feedUi.refreshComments")} disabled={!guard.canAct} onPress={refresh} /></>}><CommentBody {...props} onRefresh={refresh} /></QueryBoundary></View>
}
