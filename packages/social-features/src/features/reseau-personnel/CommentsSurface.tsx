// Dupliqué de socle/packages/agent-features/src/features/reseau-personnel/CommentsSurface.tsx @ ad2e7fdc2 — adaptations : commentaires du moteur avec le réseau courant (`useNetwork().networkId`) — `engagement.engagement.paginateComments` (racines PAGINÉES, « Voir plus de commentaires », aperçu des réponses et leur nombre) au lieu de `listComments` (100 racines, 10 réponses, sans curseur), la suite des réponses par `paginateReplies`, `comment`, `removeComment`, et `editComment` (« Modifier » sur ses propres commentaires) ; une requête paginée LÈVE ses erreurs : l'état d'échec (« Réessayer ») est rendu par une frontière d'erreur dans le cadre du dialogue ; le nombre de conversations ne s'affiche qu'une fois la liste complète (jamais un plancher présenté comme un total) ; nom neutre traduit pour un profil non publié ; identifiants `Id<"posts">` et `Id<"postComments">` ; portail porté par la charte du réseau (`useNetwork().charte`) ; libellés et toasts par l'i18n (clés `reseau:commentsSurface.*`, accords au nombre) ; refus du moteur dit par son code (`postEngineErrorText`) ; voile et ombres par les jetons (`--ui2-scrim`, `--shadow-xl`) au lieu de couleurs littérales ; feuille de style sortie du JSX dans une constante de module (`COMMENTS_SURFACE_CSS`) — un littéral enfant de `<style>` passerait pour une chaîne d'interface — règles inchangées. ; PA6 : dates et jours civils dans le fuseau personnel du lecteur (repli appareil). ; P18b (A06, A07) : la liste n'est plus une région vivante ; seuls l'ajout (« Commentaire publié. ») et l'échec s'annoncent, par deux régions persistantes hors de la vue, l'échec étant redit hors du toast.
"use client"

import { themedActionStyle } from "../themed-action-style"
import { useViewerTimeZone } from "@antsia/api/viewer-preferences"
import { api } from "@antsia/api/engine"
import type { Id } from "@antsia/api/engine"
import { useAuthenticatedPaginatedQuery } from "@antsia/api/hooks"
import { useNetwork } from "@antsia/api/network"
import { Button, TextArea, useModalA11y } from "@antsia/ui"
import { useBodyScrollLock, useVisualViewport } from "@antsia/ui/overlay"
import { useMutation } from "convex/react"
import { X } from "lucide-react"
import { Component, useEffect, useId, useRef, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

import { ReseauPaginatedErrorBoundary } from "../../shell/ReseauPaginatedErrorBoundary"
import { Avatar } from "./Avatar"
import { postEngineErrorText } from "./post-overflow"
import { RichText } from "./RichText"
import { COMMENT_MAX_LENGTH, formatRelativeDate } from "./shared"

type PostId = Id<"posts">
type CommentId = Id<"postComments">

/** Racines chargées par page — « Voir plus » en ajoute autant. */
const COMMENTS_PAGE_SIZE = 20
/** Réponses chargées par page quand on déplie la suite d'une racine. */
const REPLIES_PAGE_SIZE = 20
/**
 * P18b (A06) : une espace insécable ajoutée à une annonce IDENTIQUE à la
 * précédente — sans elle, la région vivante ne la relirait pas.
 */
const REPEAT_MARK = String.fromCharCode(0xa0)

interface CommentsSurfaceProps {
  postId: PostId
  /** MP13 : lecture des preuves conservée ; aucun ajout/réponse/édition quand fermé. */
  readOnly?: boolean
  now: number
  onClose: () => void
  onTag?: (tag: string) => void
  onMention?: (handle: string) => void
  onReportComment: (commentId: CommentId) => void
}

/** Ce que le moteur rend d'un auteur de commentaire (`ReplyDto.author`). */
interface CommentAuthor {
  personId: Id<"persons">
  /** `null` : profil non publié — le nom NEUTRE traduit s'affiche. */
  displayName: string | null
  handle: string | null
  avatarUrl: string | null
}

/** Une ligne de commentaire, racine ou réponse (`ReplyDto` du moteur). */
interface CommentRow {
  commentId: CommentId
  author: CommentAuthor
  body: string
  createdAt: number
  editedAt: number | null
  isMine: boolean
}

/**
 * La feuille de la surface, hors du JSX : un littéral enfant de `<style>`
 * passerait pour une chaîne d'interface (cliquet `no-hardcoded-strings`).
 */
const COMMENTS_SURFACE_CSS = `
        .rp-comments-overlay {
          position: fixed;
          inset: 0;
          z-index: 70;
          height: var(--vv-height, 100dvh);
          display: flex;
          align-items: flex-end;
          justify-content: stretch;
          padding-top: env(safe-area-inset-top, 0px);
          background: var(--ui2-scrim);
          color: var(--ink-900);
          overscroll-behavior: contain;
        }
        .rp-comments-surface {
          width: 100%;
          max-height: min(88dvh, calc(var(--vv-height, 100dvh) - env(safe-area-inset-top, 0px)));
          display: flex;
          flex-direction: column;
          overflow: hidden;
          outline: none;
          border-radius: 18px 18px 0 0;
          background: var(--esp-surface-raised, var(--ink-0));
          box-shadow: var(--shadow-xl);
          animation: rp-comments-sheet-in 180ms ease-out both;
        }
        .rp-comments-surface button:focus-visible,
        .rp-comments-surface textarea:focus-visible {
          outline: 3px solid var(--primary-300, var(--primary-500));
          outline-offset: 2px;
        }
        .rp-comments-list {
          scrollbar-gutter: stable;
          -webkit-overflow-scrolling: touch;
        }
        @keyframes rp-comments-sheet-in {
          from { opacity: 0; transform: translateY(18px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @media (min-width: 768px) {
          .rp-comments-overlay {
            align-items: stretch;
            justify-content: flex-end;
            padding-top: 0;
          }
          .rp-comments-surface {
            width: clamp(380px, 32vw, 420px);
            height: var(--vv-height, 100dvh);
            max-height: none;
            border-radius: 16px 0 0 16px;
            box-shadow: var(--shadow-xl);
            animation-name: rp-comments-drawer-in;
          }
        }
        @keyframes rp-comments-drawer-in {
          from { opacity: 0; transform: translateX(18px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @media (prefers-reduced-motion: reduce) {
          .rp-comments-surface { animation: none; }
          .rp-comments-list { scroll-behavior: auto; }
        }
      `

/**
 * Enveloppe portalée : la requête et les mutations ne montent qu'une fois la
 * surface effectivement ouverte par PostCard. Le portail sort du containment
 * du fil et garantit que le voile couvre le viewport complet.
 */
export function CommentsSurface(props: CommentsSurfaceProps) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  if (!mounted) return null
  return createPortal(<CommentsSurfaceContent {...props} />, document.body)
}

function CommentsSurfaceContent({
  postId,
  readOnly = false,
  now,
  onClose,
  onTag,
  onMention,
  onReportComment,
}: CommentsSurfaceProps) {
  const { t } = useTranslation("reseau")
  const { networkId, charte } = useNetwork()
  const [body, setBody] = useState("")
  const [replyTo, setReplyTo] = useState<CommentId | null>(null)
  const [sending, setSending] = useState(false)
  /** Ce que la liste sait d'elle-même — le sous-titre ne compte que ce qui est entier. */
  const [listState, setListState] = useState<{ loaded: number; complete: boolean }>({ loaded: 0, complete: false })
  /** Remonter la liste après un échec : une nouvelle frontière, un nouvel abonnement. */
  const [attempt, setAttempt] = useState(0)
  /**
   * P18b (A06, A07) : seuls l'AJOUT et l'ÉCHEC s'annoncent, par deux régions
   * persistantes hors de la vue — la liste entière n'est plus une région
   * vivante (chaque commentaire reçu, page chargée, retrait relisait de larges
   * blocs). L'échec, dit aussi par un toast, est redit ici : dans une modale,
   * la région des toasts peut rester hors d'atteinte des aides techniques.
   */
  const [published, setPublished] = useState("")
  const [failure, setFailure] = useState("")
  const sayFailure = (text: string) => setFailure((previous) => (previous === text ? `${text}${REPEAT_MARK}` : text))
  const dialogRef = useRef<HTMLElement>(null)
  const titleId = useId()

  const comment = useMutation(api.modules.engagement.engagement.comment)
  const removeComment = useMutation(api.modules.engagement.engagement.removeComment)
  const editComment = useMutation(api.modules.engagement.engagement.editComment)

  useVisualViewport()
  useBodyScrollLock(true)
  useModalA11y({ containerRef: dialogRef, onClose })

  const trimmed = body.trim()
  const tooLong = trimmed.length > COMMENT_MAX_LENGTH

  const handleSend = async () => {
    if (readOnly || trimmed.length === 0 || tooLong) return
    setSending(true)
    try {
      await comment({
        networkId,
        postId,
        body: trimmed,
        ...(replyTo ? { parentCommentId: replyTo } : {}),
      })
      setBody("")
      setReplyTo(null)
      const done = t("commentsSurface.published")
      setPublished((previous) => (previous === done ? `${done}${REPEAT_MARK}` : done))
    } catch (error) {
      const text = postEngineErrorText(error, "reseau:commentsSurface.toast.publishFailed", t)
      toast.error(text)
      sayFailure(text)
    } finally {
      setSending(false)
    }
  }

  const closeThenReport = (commentId: CommentId) => {
    // Deux modales simultanées se disputeraient l'inertage et le focus. Une
    // nouvelle tâche laisse React démonter ce drawer avant le signalement.
    onClose()
    window.setTimeout(() => onReportComment(commentId), 0)
  }

  const actions: CommentActions = {
    now,
    readOnly,
    onTag,
    onMention,
    onRemove: (commentId) =>
      void removeComment({ networkId, commentId }).catch((error: unknown) => {
        const text = postEngineErrorText(error, "reseau:commentsSurface.toast.removeFailed", t)
        toast.error(text)
        sayFailure(text)
      }),
    onEdit: async (commentId, nextBody) => {
      if (readOnly) return false
      try {
        await editComment({ networkId, commentId, body: nextBody })
        return true
      } catch (error) {
        const text = postEngineErrorText(error, "reseau:commentsSurface.toast.editFailed", t)
        toast.error(text)
        sayFailure(text)
        return false
      }
    },
    onReply: (commentId) => { if (!readOnly) setReplyTo(commentId) },
    onReport: closeThenReport,
  }

  const subtitle =
    listState.complete && listState.loaded > 0
      ? t("commentsSurface.conversations", { count: listState.loaded })
      : t("commentsSurface.join")

  return (
    <div
      className="rp-comments-overlay"
      data-charte={charte}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="rp-comments-surface"
      >
        <header
          style={{
            minHeight: 60,
            padding: "8px 10px 8px 16px",
            borderBottom: "1px solid var(--ink-150)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            flex: "0 0 auto",
          }}
        >
          <div style={{ minWidth: 0 }}>
            <h2
              id={titleId}
              style={{
                margin: 0,
                color: "var(--ink-900)",
                fontFamily: "inherit",
                fontSize: "17px",
                fontWeight: "inherit",
                lineHeight: "1.25",
                letterSpacing: "normal",
              }}
            >
              {t("commentsSurface.title")}
            </h2>
            <p
              style={{
                margin: "2px 0 0",
                color: "var(--ink-500)",
                fontSize: 12.5,
              }}
            >
              {subtitle}
            </p>
          </div>
          <button
            type="button"
            aria-label={t("commentsSurface.close")}
            title={t("commentsSurface.closeTitle")}
            onClick={onClose}
            style={{
              width: 44,
              height: 44,
              flex: "0 0 44px",
              display: "inline-grid",
              placeItems: "center",
              border: "none",
              borderRadius: "10px",
              background: "transparent",
              color: "var(--ink-700)",
              cursor: "pointer",
            }}
          >
            <X aria-hidden="true" size={21} />
          </button>
        </header>

        {/* P18b (A06) : la liste n'est plus une région vivante ; seuls l'ajout
            et l'échec s'annoncent, par ces deux régions persistantes. */}
        <p role="status" className="sr-only">
          {published}
        </p>
        <p role="alert" className="sr-only">
          {failure}
        </p>
        <div
          className="rp-comments-list"
          style={{
            flex: "1 1 auto",
            minHeight: 0,
            overflowY: "auto",
            overscrollBehavior: "contain",
            padding: 16,
          }}
        >
          <CommentsListBoundary
            key={attempt}
            fallback={
              <CommentsState
                message={t("commentsSurface.unavailable")}
                action={
                  <Button
                    size="sm"
                    variant="secondary"
                    style={{ minHeight: 44 }}
                    onClick={() => setAttempt((value) => value + 1)}
                  >
                    {t("commentsSurface.retry")}
                  </Button>
                }
              />
            }
          >
            <CommentsList postId={postId} actions={actions} onListState={setListState} />
          </CommentsListBoundary>
        </div>

        {readOnly ? <p role="status" className="border-t border-border px-4 py-4 text-sm text-muted-foreground">{t("commentsSurface.closed")}</p> : <div
          className="rp-comments-composer"
          style={{
            flex: "0 0 auto",
            display: "flex",
            flexDirection: "column",
            gap: 7,
            padding: "10px 14px calc(10px + env(safe-area-inset-bottom, 0px))",
            borderTop: "1px solid var(--ink-150)",
            background: "var(--ink-0)",
          }}
        >
          {replyTo ? (
            <div
              style={{
                minHeight: 32,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 8,
                color: "var(--ink-600)",
                fontSize: 12.5,
              }}
            >
              <span>{t("commentsSurface.replyingTo")}</span>
              <Button
                variant="outline"
                size="sm"
                style={themedActionStyle("cancel", "link", { minHeight: "32px" })}
                onClick={() => setReplyTo(null)}
              >
                {t("commentsSurface.cancel")}
              </Button>
            </div>
          ) : null}
          <TextArea
            rows={2}
            value={body}
            maxLength={COMMENT_MAX_LENGTH + 100}
            onChange={(event) => setBody(event.target.value)}
            placeholder={t("commentsSurface.placeholder")}
            aria-label={t("commentsSurface.inputLabel")}
          />
          <div
            style={{
              minHeight: 44,
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-end",
              gap: 8,
            }}
          >
            {tooLong ? (
              <span
                role="alert"
                style={{ fontSize: 12, color: "var(--danger-600)" }}
              >
                {t("commentsSurface.tooLong", { count: trimmed.length - COMMENT_MAX_LENGTH })}
              </span>
            ) : null}
            <Button
              size="sm"
              style={{ minHeight: 44 }}
              disabled={sending || trimmed.length === 0 || tooLong}
              onClick={() => void handleSend()}
            >
              {sending ? t("commentsSurface.sending") : t("commentsSurface.send")}
            </Button>
          </div>
        </div>}
      </section>

      <style>{COMMENTS_SURFACE_CSS}</style>
    </div>
  )
}

/** Les gestes d'une ligne, décidés par la surface et passés à chaque ligne. */
interface CommentActions {
  now: number
  readOnly: boolean
  onTag?: (tag: string) => void
  onMention?: (handle: string) => void
  onRemove: (commentId: CommentId) => void
  /** Rend `true` si la modification est enregistrée (la ligne referme alors son édition). */
  onEdit: (commentId: CommentId, body: string) => Promise<boolean>
  onReply: (commentId: CommentId) => void
  onReport: (commentId: CommentId) => void
}

/**
 * La frontière d'erreur de la LISTE : une requête paginée lève ses erreurs au
 * rendu. L'état d'échec reste DANS le dialogue — en-tête, fermeture et
 * composeur demeurent ; seule la liste dit qu'elle n'a pas pu être lue.
 */
class CommentsListBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  override state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  override componentDidCatch() {
    // Convex/React conserve le détail technique dans sa télémétrie : l'erreur
    // et sa pile n'ont rien à faire ici.
  }

  override render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

/** Les racines, paginées dans l'ordre du moteur (des plus anciennes aux plus récentes). */
function CommentsList({
  postId,
  actions,
  onListState,
}: {
  postId: PostId
  actions: CommentActions
  onListState: (state: { loaded: number; complete: boolean }) => void
}) {
  const { t } = useTranslation("reseau")
  const { networkId } = useNetwork()
  const comments = useAuthenticatedPaginatedQuery(
    api.modules.engagement.engagement.paginateComments,
    { networkId, postId },
    { initialNumItems: COMMENTS_PAGE_SIZE }
  )
  const roots = comments.results
  const complete = comments.status === "Exhausted"

  useEffect(() => {
    onListState({ loaded: roots.length, complete })
  }, [roots.length, complete, onListState])

  if (comments.status === "LoadingFirstPage") {
    return <CommentsState message={t("commentsSurface.loading")} />
  }
  if (roots.length === 0) {
    return <CommentsState message={t("commentsSurface.empty")} />
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <ul
        style={{
          listStyle: "none",
          margin: 0,
          padding: 0,
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        {roots.map((root) => (
          <li key={root.commentId}>
            <CommentLine
              row={root}
              actions={actions}
              onReply={() => actions.onReply(root.commentId)}
            />
            <RootReplies postId={postId} root={root} actions={actions} />
          </li>
        ))}
      </ul>
      {comments.status === "CanLoadMore" || comments.status === "LoadingMore" ? (
        <div style={{ display: "flex", justifyContent: "center" }}>
          <Button
            size="sm"
            variant="secondary"
            style={{ minHeight: 44 }}
            disabled={comments.status === "LoadingMore"}
            onClick={() => comments.loadMore(COMMENTS_PAGE_SIZE)}
          >
            {comments.status === "LoadingMore" ? t("commentsSurface.loadingMore") : t("commentsSurface.loadMore")}
          </Button>
        </div>
      ) : null}
    </div>
  )
}

/**
 * Les réponses d'une racine : l'APERÇU rendu avec elle, puis — à la demande —
 * la suite paginée, qui reprend depuis la première réponse et remplace
 * l'aperçu (jamais deux fois la même ligne).
 */
function RootReplies({
  postId,
  root,
  actions,
}: {
  postId: PostId
  root: CommentRow & { replyCount: number; replies: CommentRow[] }
  actions: CommentActions
}) {
  const { t } = useTranslation("reseau")
  const [expanded, setExpanded] = useState(false)
  const hasMore = root.replyCount > root.replies.length

  if (root.replies.length === 0 && !hasMore) return null

  // Le moteur range toute réponse sous SA racine (un seul niveau) : répondre
  // à une réponse rattache donc à la racine.
  const replyToRoot = () => actions.onReply(root.commentId)

  return (
    <div style={{ margin: "12px 0 0 14px", padding: "0 0 0 14px", borderLeft: "2px solid var(--ink-150)", display: "flex", flexDirection: "column", gap: 12 }}>
      {expanded ? (
        <ReseauPaginatedErrorBoundary
          resetKey={root.commentId}
          title={t("commentsSurface.repliesErrorTitle")}
          message={t("commentsSurface.repliesErrorMessage")}
        >
          <RepliesList postId={postId} rootId={root.commentId} actions={actions} onReply={replyToRoot} />
        </ReseauPaginatedErrorBoundary>
      ) : (
        <>
          <RepliesUl rows={root.replies} actions={actions} onReply={replyToRoot} />
          {hasMore ? (
            <div>
              <CommentAction onClick={() => setExpanded(true)}>
                {t("commentsSurface.showAllReplies", { count: root.replyCount })}
              </CommentAction>
            </div>
          ) : null}
        </>
      )}
    </div>
  )
}

/** La suite paginée des réponses d'une racine. */
function RepliesList({
  postId,
  rootId,
  actions,
  onReply,
}: {
  postId: PostId
  rootId: CommentId
  actions: CommentActions
  onReply: () => void
}) {
  const { t } = useTranslation("reseau")
  const { networkId } = useNetwork()
  const replies = useAuthenticatedPaginatedQuery(
    api.modules.engagement.engagement.paginateReplies,
    { networkId, postId, commentId: rootId },
    { initialNumItems: REPLIES_PAGE_SIZE }
  )

  if (replies.status === "LoadingFirstPage") {
    return <p style={{ margin: 0, color: "var(--ink-600)", fontSize: 13 }}>{t("commentsSurface.loadingReplies")}</p>
  }

  return (
    <>
      <RepliesUl rows={replies.results} actions={actions} onReply={onReply} />
      {replies.status === "CanLoadMore" || replies.status === "LoadingMore" ? (
        <div>
          <CommentAction
            disabled={replies.status === "LoadingMore"}
            onClick={() => replies.loadMore(REPLIES_PAGE_SIZE)}
          >
            {t("commentsSurface.moreReplies")}
          </CommentAction>
        </div>
      ) : null}
    </>
  )
}

function RepliesUl({
  rows,
  actions,
  onReply,
}: {
  rows: readonly CommentRow[]
  actions: CommentActions
  onReply: () => void
}) {
  if (rows.length === 0) return null
  return (
    <ul
      style={{
        listStyle: "none",
        margin: 0,
        padding: 0,
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      {rows.map((reply) => (
        <li key={reply.commentId}>
          <CommentLine row={reply} actions={actions} onReply={onReply} />
        </li>
      ))}
    </ul>
  )
}

function CommentsState({
  message,
  action,
}: {
  message: string
  action?: ReactNode
}) {
  return (
    <div
      role="status"
      style={{
        minHeight: 140,
        display: "grid",
        placeItems: "center",
        alignContent: "center",
        gap: 12,
        textAlign: "center",
        color: "var(--ink-600)",
        fontSize: 13.5,
      }}
    >
      <p style={{ margin: 0 }}>{message}</p>
      {action}
    </div>
  )
}

function CommentLine({
  row,
  actions,
  onReply,
}: {
  row: CommentRow
  actions: CommentActions
  onReply?: () => void
}) {
  const { t } = useTranslation("reseau")
  const timeZone = useViewerTimeZone()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(row.body)
  const [saving, setSaving] = useState(false)
  const name = row.author.displayName ?? t("commentsSurface.unknownAuthor")
  const trimmedDraft = draft.trim()
  const draftTooLong = trimmedDraft.length > COMMENT_MAX_LENGTH

  const save = async () => {
    if (actions.readOnly || trimmedDraft.length === 0 || draftTooLong) return
    setSaving(true)
    const saved = await actions.onEdit(row.commentId, trimmedDraft)
    setSaving(false)
    if (saved) setEditing(false)
  }

  return (
    <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
      <Avatar
        displayName={name}
        avatarUrl={row.author.avatarUrl}
        size={32}
        hasIdentity={row.author.handle !== null}
      />
      <div
        style={{
          minWidth: 0,
          flex: 1,
          display: "flex",
          flexDirection: "column",
          gap: 5,
        }}
      >
        <p style={{ margin: 0, fontSize: 13.5 }}>
          <span style={{ fontWeight: 700, color: "var(--ink-900)" }}>
            {name}
          </span>{" "}
          <time
            dateTime={new Date(row.createdAt).toISOString()}
            style={{ color: "var(--ink-500)", fontSize: 12 }}
          >
            {formatRelativeDate(row.createdAt, actions.now, t, timeZone)}
          </time>
        </p>
        {editing && !actions.readOnly ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <TextArea
              rows={2}
              value={draft}
              maxLength={COMMENT_MAX_LENGTH + 100}
              onChange={(event) => setDraft(event.target.value)}
              aria-label={t("commentsSurface.editLabel")}
            />
            {draftTooLong ? (
              <span role="alert" style={{ fontSize: 12, color: "var(--danger-600)" }}>
                {t("commentsSurface.tooLong", { count: trimmedDraft.length - COMMENT_MAX_LENGTH })}
              </span>
            ) : null}
            <div style={{ display: "flex", gap: 8 }}>
              <Button
                variant="success"
                size="sm"
                style={themedActionStyle("success", "primary", { minHeight: 44 })}
                disabled={saving || trimmedDraft.length === 0 || draftTooLong}
                onClick={() => void save()}
              >
                {t("commentsSurface.save")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                style={themedActionStyle("cancel", "ghost", { minHeight: 44 })}
                onClick={() => {
                  setDraft(row.body)
                  setEditing(false)
                }}
              >
                {t("commentsSurface.cancel")}
              </Button>
            </div>
          </div>
        ) : (
          <div style={{ fontSize: 14.5, color: "var(--ink-800)" }}>
            <RichText body={row.body} onTag={actions.onTag} onMention={actions.onMention} />
          </div>
        )}
        {editing && !actions.readOnly ? null : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 2 }}>
            {onReply && !actions.readOnly ? (
              <CommentAction onClick={onReply}>{t("commentsSurface.reply")}</CommentAction>
            ) : null}
            {row.isMine && !actions.readOnly ? (
              <CommentAction
                onClick={() => {
                  setDraft(row.body)
                  setEditing(true)
                }}
              >
                {t("commentsSurface.edit")}
              </CommentAction>
            ) : null}
            {row.isMine ? (
              <CommentAction onClick={() => actions.onRemove(row.commentId)}>{t("commentsSurface.remove")}</CommentAction>
            ) : null}
            {!row.isMine ? (
              <CommentAction onClick={() => actions.onReport(row.commentId)}>{t("commentsSurface.report")}</CommentAction>
            ) : null}
          </div>
        )}
      </div>
    </div>
  )
}

function CommentAction({
  children,
  onClick,
  disabled = false,
}: {
  children: ReactNode
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        minWidth: 44,
        minHeight: 44,
        padding: "8px 7px",
        border: "none",
        borderRadius: "8px",
        background: "transparent",
        color: "var(--primary-600)",
        fontFamily: "inherit",
        fontSize: 12.5,
        fontWeight: 700,
        cursor: disabled ? "progress" : "pointer",
      }}
    >
      {children}
    </button>
  )
}
