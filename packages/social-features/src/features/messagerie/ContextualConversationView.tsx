"use client"

/**
 * CC-5 (contrat CONVERSATION-CONTEXTUELLE-V1 §3, §5, §8, §10.1, §11.2 ; ADR-0025) —
 * ContextualConversationView : UNE conversation contextuelle (mise en relation ouverte par un
 * objet déjà accepté), en page, au téléphone comme au bureau.
 *
 * Elle COMPOSE les sous-composants partagés de la messagerie, sans fork (§11.2) : l'en-tête
 * (`ConversationHeader`), les bulles accessibles P18b (`MessageBubble` : auteur dit aux lecteurs
 * d'écran, bouton d'actions distinct, contrôles atteignables), les pièces servies par la garde
 * (`MessageAttachment`), le composeur (`MessageComposer`), la pastille de retard, la région polie
 * des arrivées (`conversation-arrivals`) et la trace locale des envois (`OutboxMessages`).
 *
 * Ce qu'elle tient de PROPRE à la famille contextuelle :
 *  · l'en-tête dit le CONTEXTE (nature, rôle, état, phase par le refus explicite) et la VOIX :
 *    une page parle d'une seule voix — le demandeur ne voit jamais le signataire qui écrit ;
 *  · les états VISIBLES d'une partie (ouverte, fermée, indisponible) ; « bloquée » et « absente »
 *    reçoivent la MÊME phrase neutre, sans cause (§3.4) ;
 *  · l'envoi idempotent : une intention locale (clé = identifiant local) raccordée à l'admission
 *    serveur (`messageId`), effacée seulement quand le message est projeté ; le double appui ne
 *    crée jamais deux messages, un réessai identique garde sa clé ;
 *  · les refus explicites traduits (`rules:CONTEXT_*`, et le code de la tranche par l'application) ;
 *  · les pièces UNIQUEMENT par l'URL de dépôt gardée (`chat_attachment`, deux au plus, D9) ;
 *  · l'accord d'appel et le démarrage (CC-4), avec l'effet de MES réglages, jamais ceux d'en face ;
 *  · aucun accusé de lecture, aucun « livré », aucune réaction, aucun transfert, aucune épingle.
 *
 * Aucune adresse n'est écrite ici : le retour et l'écran de l'objet sont des gestes injectés.
 */
import { formatViewerDate } from "@antsia/api/civil-date"
import type { Id } from "@antsia/api/engine"
import { useNetwork } from "@antsia/api/network"
import { useViewerTimeZone } from "@antsia/api/viewer-preferences"
import { CONTEXTUAL_ATTACHMENTS_MAX, contextualText, type ContextualSide } from "@antsia/social-domain/contextualMessaging"
import { CONTENT_REPORT_REASONS, type ContentReportReason } from "@antsia/social-domain/moderation"
import { useVisualViewport } from "@antsia/ui/overlay"
import { Sheet, SheetBody, SheetContent, SheetHeader, SheetTitle } from "@antsia/ui/sheet"
import { zodResolver } from "@hookform/resolvers/zod"
import { useConvexAuth } from "convex/react"
import { History, Phone, Video } from "lucide-react"
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"
import { useForm } from "react-hook-form"
import { useTranslation } from "react-i18next"
import { z } from "zod"

import { ReseauPaginatedErrorBoundary } from "../../shell/ReseauPaginatedErrorBoundary"
import { useCallStore } from "../../stores/call-store"
import { refusalEndKind } from "../iappel/call-phase"
import { Avatar } from "../reseau-personnel/Avatar"
import { arrivalAnnouncement } from "./conversation-arrivals"
import { croissanceDuFil, initialScrollState, isNearBottom, reduceOnMessages, type CroissanceDuFil } from "./conversation-scroll"
import { ConversationHeader } from "./ConversationHeader"
import {
  contextualBubbles,
  contextualCallee,
  contextualCallNeedsTarget,
  contextualCallNotes,
  contextualCallsRelevant,
  contextualCounterpartAvatar,
  contextualCounterpartName,
  contextualDraftKey,
  contextualDraftStore,
  contextualErrorText,
  contextualKindLabel,
  contextualLabelName,
  contextualMessageActions,
  contextualReadReceipt,
  contextualRoleLabel,
  contextualSendBlockKey,
  contextualVisibleState,
  contextualVoiceText,
  type ContextualAppRuleDescriber,
  legacyContextualObjectRef,
  type ContextualAnyObjectRefView,
  type ContextualMessageAction,
  type ContextualObjectRefView,
  type ContextualThreadView,
} from "./contextual-conversation-model"
import {
  CONTEXTUAL_MESSAGES_PAGE,
  CONTEXTUAL_MESSAGING_SOURCE,
  type ContextualAttachment,
  type ContextualMessage,
  type ContextualMessageId,
  type ContextualMessagingSource,
  type ContextualThread,
  type ContextualThreadId,
  type ContextualWrites,
} from "./contextual-messaging-source"
import { MessageBubble } from "./MessageBubble"
import { MessageComposer, type UploadedAttachment } from "./MessageComposer"
import { groupMessages } from "./messagerie-bulles"
import { contextualConversationKey } from "./messagerie-dock"
import { outboxStore, useOutbox } from "./messagerie-outbox"
import { AbandonedMessageSend } from "./messagerie-send-intent"
import { resultatAppelDe } from "./messagerie-source"
import { MessagerieStyles } from "./messagerie-styles"
import { NewMessagesPill } from "./NewMessagesPill"
import { OutboxMessages } from "./OutboxMessages"
import { useConversationSend } from "./use-conversation-send"

/**
 * Une espace insécable ajoutée à une annonce IDENTIQUE à la précédente — sans elle, une région
 * vivante ne relirait pas « Texte copié. » au second geste (même mécanique que P18b, A04).
 */
const REPEAT_MARK = String.fromCharCode(0xa0)

/** Les gestes de la bulle historique (réponse, réaction, action) n'existent pas ici. */
const ignore = () => undefined

export interface ContextualConversationViewProps {
  /** L'identifiant du fil, tel que la route ou la notification le porte ; le serveur rejoue toutes les gardes. */
  threadId: string
  /** Revenir à la liste (Messages, filtre « Mises en relation », ou l'écran de l'objet). */
  onBack: () => void
  /** Ouvrir l'écran de l'objet (demande, mentorat, candidature) — l'application compose l'adresse. Contrat V1 : trois natures. */
  onOpenObject?: (object: ContextualObjectRefView) => void
  /** Ouvrir un objet de toute nature, collaboration professionnelle comprise : geste explicite, prioritaire sur `onOpenObject`. */
  onOpenContextualObject?: (object: ContextualAnyObjectRefView) => void
  /** Où en est l'objet, dans les mots de l'application (« Proposition à accepter »), quand elle le sait. */
  describeObject?: (thread: ContextualThreadView) => string | null
  /** Traduire un code FERMÉ de la tranche (`appRule`, ex. `context_address_forbidden`) dans l'espace de noms de l'application. */
  describeAppRule?: ContextualAppRuleDescriber
  /** D'où viennent le fil et ses messages — par défaut, la source contextuelle du moteur. */
  source?: ContextualMessagingSource
}

export function ContextualConversationView(props: ContextualConversationViewProps) {
  const { networkId, personId } = useNetwork()
  const { isAuthenticated } = useConvexAuth()
  // Changer de lecteur, de fil ou perdre la session invalide les promesses du composeur
  // précédent, avant tout effet sur le brouillon ou la trace locale.
  return <ContextualConversation key={JSON.stringify([networkId, personId, props.threadId, isAuthenticated])} {...props} />
}

function ContextualConversation({ threadId: rawId, onBack, onOpenObject, onOpenContextualObject, describeObject, describeAppRule, source = CONTEXTUAL_MESSAGING_SOURCE }: ContextualConversationViewProps) {
  const { t } = useTranslation("messagerie")
  const { networkId, personId } = useNetwork()
  const { isAuthenticated } = useConvexAuth()
  // La hauteur VISIBLE (clavier compris) : sans elle, le composeur repasse derrière le clavier iOS.
  useVisualViewport()
  // La seule référence reçue de la route, convertie ici : le serveur relit TOUT (§4.2) et rend
  // `null` pour un identifiant inventé, d'une autre nature ou d'un autre réseau.
  const threadId = rawId as ContextualThreadId
  const query = source.useThread(threadId)
  const thread = query.data
  const writes = source.useWrites()
  const owner = JSON.stringify([networkId, personId, source.espace])
  const conversationKey = contextualConversationKey(rawId)
  const sender = useConversationSend(owner, conversationKey, isAuthenticated)
  const isCurrent = sender.isCurrent
  const draftKey = contextualDraftKey(owner, rawId)
  const draft = useSyncExternalStore(contextualDraftStore.subscribe, () => contextualDraftStore.get(draftKey), () => "")
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState("")
  const [busy, setBusy] = useState(false)
  const lock = useRef(false)
  const [confirmClose, setConfirmClose] = useState(false)
  const [callsOpen, setCallsOpen] = useState(false)
  const titleId = useId()
  const contextTitleId = useId()
  const callsPanelId = useId()
  const closeQuestionId = useId()
  const closeTriggerRef = useRef<HTMLButtonElement>(null)
  const closeCancelRef = useRef<HTMLButtonElement>(null)
  const closeWasOpen = useRef(false)
  const callsRelevant = thread !== undefined && thread !== null && contextualCallsRelevant(thread)
  const calls = useCallStore()

  const announce = useCallback((text: string) => {
    setNotice((previous) => (previous === text ? `${text}${REPEAT_MARK}` : text))
  }, [])

  /** Un geste à la fois : verrou immédiat, refus traduit, rien d'un contexte quitté. */
  const run = useCallback(async <T,>(operation: () => Promise<T>): Promise<T | undefined> => {
    if (lock.current || !isCurrent()) return undefined
    lock.current = true
    setBusy(true)
    setError(null)
    try {
      const value = await operation()
      return isCurrent() ? value : undefined
    } catch (reason) {
      if (isCurrent()) setError(contextualErrorText(reason, t, describeAppRule))
      return undefined
    } finally {
      lock.current = false
      if (isCurrent()) setBusy(false)
    }
  }, [isCurrent, t, describeAppRule])

  // La confirmation de clôture reçoit le focus ; renoncer le rend au bouton qui l'a ouverte.
  useEffect(() => {
    if (confirmClose) closeCancelRef.current?.focus()
    else if (closeWasOpen.current) closeTriggerRef.current?.focus()
    closeWasOpen.current = confirmClose
  }, [confirmClose])

  /**
   * L'envoi : règle neutre du domaine AVANT tout aller-retour (même règle que le serveur), puis
   * l'intention idempotente — sa clé est l'identifiant local de l'envoi, raccordé à l'admission.
   * Un refus garde texte et pièces dans le composeur (AbandonedMessageSend) et se dit ICI, traduit.
   */
  const send = useCallback(async (payload: { text: string; attachments: UploadedAttachment[] }): Promise<void> => {
    if (!isCurrent()) throw new AbandonedMessageSend()
    setError(null)
    const checked = contextualText(payload.text, payload.attachments.length > 0)
    if (!checked.ok) {
      setError(t(`rules:${checked.rule}`, checked.params))
      throw new AbandonedMessageSend()
    }
    if (payload.attachments.length > CONTEXTUAL_ATTACHMENTS_MAX) {
      setError(t("rules:ATTACHMENTS_TOO_MANY", { max: CONTEXTUAL_ATTACHMENTS_MAX }))
      throw new AbandonedMessageSend()
    }
    const attachments = payload.attachments.map(declaredAttachment)
    try {
      await sender.perform({ text: payload.text, attachments: payload.attachments, replyTo: null }, (idempotencyKey) =>
        writes.send({ threadId, text: payload.text, ...(attachments.length > 0 ? { attachments } : {}), idempotencyKey }),
      )
    } catch (reason) {
      if (!(reason instanceof AbandonedMessageSend) && isCurrent()) setError(contextualErrorText(reason, t, describeAppRule))
      throw new AbandonedMessageSend()
    }
    if (!isCurrent()) throw new AbandonedMessageSend()
    // Une frappe plus récente que l'envoi n'est jamais effacée par son admission.
    if (contextualDraftStore.get(draftKey).trim() === payload.text) contextualDraftStore.set(draftKey, "")
  }, [isCurrent, sender.perform, writes, threadId, draftKey, t, describeAppRule])

  const closeThread = useCallback((revision: number) => {
    void run(async () => {
      await writes.close({ threadId, expectedRevision: revision })
      return true
    }).then((done) => {
      if (done === undefined || !isCurrent()) return
      setConfirmClose(false)
      announce(t("contextualConversation.close.done"))
    })
  }, [run, writes, threadId, isCurrent, announce, t])

  const setConsent = useCallback((allowed: boolean) => {
    void run(async () => {
      await writes.setCallConsent({ threadId, allowed })
      return true
    }).then((done) => {
      if (done === undefined || !isCurrent()) return
      announce(t(allowed ? "contextualConversation.calls.saved" : "contextualConversation.calls.withdrawn"))
    })
  }, [run, writes, threadId, isCurrent, announce, t])

  const startCall = useCallback((current: ContextualThread, mediaType: "audio" | "video", targetPersonId: Id<"persons"> | null) => {
    void run(async () => {
      const raw = await writes.startCall({ threadId, mediaType, ...(targetPersonId === null ? {} : { targetPersonId }) })
      return resultatAppelDe(raw, { adresse: "", mediaType })
    }).then((result) => {
      if (result === undefined || !isCurrent()) return
      // La fenêtre d'appel nomme le signataire CHOISI (il a consenti à l'être), sinon la personne d'en face.
      const peer = contextualCallee(current, targetPersonId === null ? null : String(targetPersonId), t)
      const callee = { userId: result.targetUserId, name: peer.name, handle: peer.handle, avatarUrl: peer.avatarUrl }
      // Aucune messagerie vocale dans un fil contextuel (§5.8) : un refus ouvre l'écran de fin, sans dépôt.
      if (!result.admitted) {
        calls.openRefusedCall({ meetingId: result.meetingId, mediaType, endKind: refusalEndKind(result.reason), message: null, voicemailOffered: false, scope: "personnel", callee })
        return
      }
      calls.openOutgoingCall({ meetingId: result.meetingId, participantUserId: result.targetUserId, mediaType: result.mediaType, startedAt: Date.now(), scope: "personnel", callee })
    })
  }, [run, writes, threadId, isCurrent, calls, t])

  const removeMessage = useCallback(async (messageId: ContextualMessageId): Promise<string | null> => {
    try {
      await writes.remove({ threadId, messageId })
      if (isCurrent()) announce(t("contextualConversation.actions.removed"))
      return null
    } catch (reason) {
      return contextualErrorText(reason, t, describeAppRule)
    }
  }, [writes, threadId, isCurrent, announce, t, describeAppRule])

  const reportMessage = useCallback(async (messageId: ContextualMessageId, reason: ContentReportReason): Promise<string | null> => {
    try {
      await writes.report(messageId, reason)
      if (isCurrent()) announce(t("contextualConversation.actions.reported"))
      return null
    } catch (failure) {
      return contextualErrorText(failure, t, describeAppRule)
    }
  }, [writes, isCurrent, announce, t, describeAppRule])

  const copyMessage = useCallback((text: string) => {
    void navigator.clipboard?.writeText(text).then(() => {
      if (isCurrent()) announce(t("contextualConversation.actions.copied"))
    }, ignore)
  }, [isCurrent, announce, t])

  if (query.isError) {
    return (
      <>
        <MessagerieStyles />
        <div className="msg-scroller">
          <div className="msg-body">
            <div className="msg-empty" role="alert">
              <p className="m-0">{t("contextualConversation.loadError")}</p>
              <div className="mt-2 flex flex-wrap justify-center gap-2">
                <button type="button" className="msg-filter-btn" onClick={query.refetch}>{t("contextualConversation.retry")}</button>
                <button type="button" className="msg-filter-btn" onClick={onBack}>{t("contextualConversation.back")}</button>
              </div>
            </div>
          </div>
        </div>
      </>
    )
  }
  if (thread === undefined) {
    return (
      <>
        <MessagerieStyles />
        <p className="msg-empty" role="status">{t("contextualConversation.loading")}</p>
      </>
    )
  }
  // Refus INDISTINCT (§3.4, §5.3) : bloquée, absente, autre réseau, objet invisible — une seule
  // phrase, aucune cause, aucun message demandé.
  if (thread === null) {
    return (
      <>
        <MessagerieStyles />
        <div className="msg-scroller">
          <div className="msg-body">
            <div className="msg-empty">
              <p className="m-0" role="status">{t("contextualConversation.unavailable")}</p>
              <button type="button" className="msg-filter-btn mt-2" onClick={onBack}>{t("contextualConversation.back")}</button>
            </div>
          </div>
        </div>
      </>
    )
  }

  const name = contextualCounterpartName(thread, t)
  const avatar = contextualCounterpartAvatar(thread)
  const visible = contextualVisibleState(thread)
  const kindLabel = contextualKindLabel(thread.kind, t)
  const objectStatus = describeObject?.(thread) ?? null
  const sendBlockKey = contextualSendBlockKey(thread)
  const objectRef = thread.object
  // Une nature postérieure à V1 ne s'ouvre que par le geste explicite : jamais par le rappel historique.
  const legacyRef = objectRef === null ? null : legacyContextualObjectRef(objectRef)
  const openObject = onOpenContextualObject !== undefined && objectRef !== null ? () => onOpenContextualObject(objectRef)
    : onOpenObject !== undefined && legacyRef !== null ? () => onOpenObject(legacyRef) : null

  return (
    <>
      <MessagerieStyles />
      <ConversationHeader
        variant="page"
        // Aucun bouton d'appel d'en-tête : un appel contextuel passe par l'accord explicite (§5.8).
        kind="draft"
        title={name}
        titleId={titleId}
        subtitle={t("contextualConversation.header.subtitle", { kind: kindLabel, state: t(`contextualConversation.stateShort.${visible}`) })}
        avatar={<Avatar displayName={name} avatarUrl={avatar.url} hasIdentity={avatar.hasIdentity} shape={avatar.shape} size={34} />}
        onBack={onBack}
      />

      <section className="flex flex-col gap-1 border-b border-border px-4 py-2 text-sm" aria-labelledby={contextTitleId}>
        <h2 id={contextTitleId} className="sr-only">{t("contextualConversation.context.title")}</h2>
        <p className="m-0 font-medium">{t("contextualConversation.context.summary", { kind: kindLabel, role: contextualRoleLabel(thread.kind, thread.viewer.side, t) })}</p>
        {objectStatus !== null ? <p className="m-0">{t("contextualConversation.context.objectStatus", { status: objectStatus })}</p> : null}
        <p className="m-0" role="status">{t(`contextualConversation.state.${visible}`)}</p>
        <p className="m-0 text-xs text-muted-foreground">{contextualVoiceText(thread, t)}</p>
        <p className="m-0 text-xs text-muted-foreground">{t("contextualConversation.context.privacy")}</p>
        <div className="flex flex-wrap gap-2 pt-1">
          {openObject !== null ? (
            <button type="button" className="msg-tool-btn" onClick={openObject}>
              {t(`contextualConversation.openObject.${thread.kind}`)}
            </button>
          ) : null}
          {callsRelevant ? (
            <button type="button" className="msg-tool-btn" aria-expanded={callsOpen} aria-controls={callsPanelId} onClick={() => setCallsOpen((open) => !open)}>
              <Phone aria-hidden="true" size={15} />
              {t("contextualConversation.calls.toggle")}
            </button>
          ) : null}
          {thread.capabilities.canClose ? (
            <button ref={closeTriggerRef} type="button" className="msg-tool-btn" disabled={busy} onClick={() => setConfirmClose(true)}>
              {t("contextualConversation.close.action")}
            </button>
          ) : null}
        </div>
      </section>

      {confirmClose && thread.capabilities.canClose ? (
        <div className="flex flex-col gap-2 border-b border-border px-4 py-3 text-sm" role="group" aria-labelledby={closeQuestionId}>
          <p id={closeQuestionId} className="m-0">{t("contextualConversation.close.confirm")}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="msg-tool-btn" disabled={busy} onClick={() => closeThread(thread.revision)}>
              {t("contextualConversation.close.confirmAction")}
            </button>
            <button ref={closeCancelRef} type="button" className="msg-tool-btn" disabled={busy} onClick={() => setConfirmClose(false)}>
              {t("contextualConversation.close.cancel")}
            </button>
          </div>
        </div>
      ) : null}

      {callsRelevant && callsOpen ? (
        <ContextualCallPanel
          id={callsPanelId}
          thread={thread}
          counterpartName={name}
          busy={busy}
          callActive={calls.globalActiveMeetingId !== null}
          onConsent={setConsent}
          onCall={(mediaType, targetPersonId) => startCall(thread, mediaType, targetPersonId)}
        />
      ) : null}

      <div className="msg-scroller">
        <ReseauPaginatedErrorBoundary resetKey={rawId} title={t("contextualConversation.messages.errorTitle")} message={t("contextualConversation.messages.errorMessage")}>
          <ContextualThreadMessages
            source={source}
            writes={writes}
            threadId={threadId}
            thread={thread}
            titleId={titleId}
            selfId={String(personId)}
            owner={owner}
            conversationKey={conversationKey}
            onCopy={copyMessage}
            onRemove={removeMessage}
            onReport={reportMessage}
          />
        </ReseauPaginatedErrorBoundary>
      </div>

      {/* Région PERSISTANTE des confirmations (copie, retrait, signalement, clôture, accord) :
          elle existe avant son texte, si bien qu'un lecteur d'écran l'entend changer. */}
      <p className={notice.length > 0 ? "msg-success" : "sr-only"} role="status">{notice}</p>
      {error !== null ? <p className="msg-error" role="alert">{error}</p> : null}

      {sendBlockKey === null ? (
        <>
          {!thread.capabilities.canAttach ? <p className="msg-file-meta px-4">{t("rules:CONTEXT_ATTACHMENTS_CLOSED")}</p> : null}
          <MessageComposer
            key={`${rawId}:${String(thread.capabilities.canAttach)}`}
            contextKey={`${owner}:${conversationKey}`}
            isContextCurrent={isCurrent}
            value={draft}
            onChange={(text) => contextualDraftStore.set(draftKey, text)}
            placeholder={t("contextualConversation.composer.placeholder")}
            ariaLabel={t("contextualConversation.composer.label", { name })}
            // Un vocal est une pièce sonore : il suit la capacité de joindre (§6.2).
            allowVoice={thread.capabilities.canAttach}
            allowAttachments={thread.capabilities.canAttach}
            maxAttachments={CONTEXTUAL_ATTACHMENTS_MAX}
            // La SEULE porte d'une pièce : l'URL de dépôt gardée du fil (`chat_attachment`).
            generateUploadUrl={() => writes.generateUploadUrl(threadId)}
            onSend={send}
            onError={setError}
            onEscape={onBack}
          />
        </>
      ) : (
        // L'envoi est fermé : le refus explicite (liste fermée), jamais la cause d'un retrait.
        <p className="msg-empty" role="status">{t(sendBlockKey)}</p>
      )}
    </>
  )
}

/** Une pièce montée par le composeur, telle que l'envoi la DÉCLARE (la garde la relit au stockage). */
function declaredAttachment(item: UploadedAttachment): ContextualAttachment {
  return {
    storageId: item.storageId as ContextualAttachment["storageId"],
    filename: item.filename,
    mimeType: item.mimeType,
    sizeBytes: item.sizeBytes,
    ...(item.durationMs === undefined ? {} : { durationMs: item.durationMs }),
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Le fil : messages, bulles P18b, arrivées, trace locale, lecture marquée
// ═══════════════════════════════════════════════════════════════════════════

/**
 * ⚠️ Monté DANS `ReseauPaginatedErrorBoundary` : une page de messages refusée (perte de droit entre
 * deux lectures) lève au rendu ; la frontière la dit, et le fil relu rend la phrase neutre.
 */
function ContextualThreadMessages({
  source,
  writes,
  threadId,
  thread,
  titleId,
  selfId,
  owner,
  conversationKey,
  onCopy,
  onRemove,
  onReport,
}: {
  source: ContextualMessagingSource
  writes: ContextualWrites
  threadId: ContextualThreadId
  thread: ContextualThread
  titleId: string
  selfId: string
  owner: string
  conversationKey: string
  onCopy: (text: string) => void
  onRemove: (messageId: ContextualMessageId) => Promise<string | null>
  onReport: (messageId: ContextualMessageId, reason: ContentReportReason) => Promise<string | null>
}) {
  const { t, i18n } = useTranslation("messagerie")
  const timeZone = useViewerTimeZone()
  const page = source.useMessages(threadId)
  const viewerSide = thread.viewer.side
  const loading = page.status === "LoadingFirstPage"
  const bubbles = useMemo(() => contextualBubbles(page.results, { selfId, viewerSide }, t), [page.results, selfId, viewerSide, t])
  const byId = useMemo(() => new Map(page.results.map((message) => [String(message.messageId), message])), [page.results])
  const rows = useMemo(
    () => groupMessages(bubbles, { selfId, counterpartId: null, now: Date.now(), locale: i18n.language, timeZone }, t),
    [bubbles, selfId, i18n.language, timeZone, t],
  )
  // L'équipe voit le coéquipier qui a parlé au nom de la page ; le demandeur, jamais.
  const showSender = viewerSide === "responder" && thread.viewer.voice === "page"

  // ── Trace locale des envois : elle s'efface quand CE message est projeté ───────────────
  const outbox = useOutbox(owner, conversationKey)
  const visibleOutbox = outbox.filter((entry) => entry.messageId === null || !bubbles.some((bubble) => bubble.id === entry.messageId))
  useEffect(() => {
    outboxStore.acknowledge(owner, conversationKey, bubbles.map((bubble) => bubble.id))
  }, [outbox, bubbles, owner, conversationKey])

  // ── Lecture marquée : une fois par dernier message, aucune trace montrée à l'autre côté ──
  const receipt = contextualReadReceipt(thread, !loading)
  const sentReceipt = useRef<string | null>(null)
  const markRead = writes.markRead
  useEffect(() => {
    if (receipt === null || sentReceipt.current === receipt) return
    sentReceipt.current = receipt
    void markRead(threadId).catch(() => {
      // Un échec autorise un nouvel essai ; un acquittement plus récent n'est jamais effacé.
      if (sentReceipt.current === receipt) sentReceipt.current = null
    })
  }, [receipt, markRead, threadId])

  // ── Suivi du bas (conversation-scroll) ─────────────────────────────────────────────────
  const bodyRef = useRef<HTMLDivElement>(null)
  const previousCountRef = useRef(0)
  const lastIdRef = useRef<string | null>(null)
  const heightBeforeRef = useRef(0)
  const growthRef = useRef<CroissanceDuFil>({ enBas: 0, enHaut: 0 })
  const [scroll, setScroll] = useState(initialScrollState)
  const jumpToBottom = useCallback(() => {
    const body = bodyRef.current
    if (body !== null) body.scrollTop = body.scrollHeight
    setScroll((state) => reduceOnMessages(state, { kind: "jump" }))
  }, [])
  // Charger des anciens PRÉPEND : la distance au bas est rendue avant la peinture.
  useLayoutEffect(() => {
    const growth = croissanceDuFil({
      totalAvant: previousCountRef.current,
      totalApres: bubbles.length,
      dernierIdAvant: lastIdRef.current,
      dernierIdApres: bubbles.at(-1)?.id ?? null,
    })
    growthRef.current = growth
    const body = bodyRef.current
    if (body === null) return
    if (growth.enHaut > 0) body.scrollTop = body.scrollHeight - heightBeforeRef.current
    heightBeforeRef.current = body.scrollHeight - body.scrollTop
  }, [bubbles])
  useEffect(() => {
    previousCountRef.current = bubbles.length
    lastIdRef.current = bubbles.at(-1)?.id ?? null
    const added = growthRef.current.enBas
    growthRef.current = { enBas: 0, enHaut: 0 }
    if (added <= 0) return
    const fromMe = bubbles.at(-1)?.senderId === selfId
    setScroll((state) => {
      const next = reduceOnMessages(state, { kind: "messages", added, fromMe })
      if (next.pinned) {
        requestAnimationFrame(() => {
          const body = bodyRef.current
          if (body !== null) body.scrollTop = body.scrollHeight
        })
      }
      return next
    })
  }, [bubbles, selfId])

  // ── P18b (A04) : les ARRIVÉES s'annoncent, elles seules ────────────────────────────────
  const arrivalBaselineRef = useRef<{ lastId: string | null } | null>(null)
  const [arrivalText, setArrivalText] = useState("")
  useEffect(() => {
    if (loading) return
    const previous = arrivalBaselineRef.current
    arrivalBaselineRef.current = { lastId: bubbles.at(-1)?.id ?? null }
    const announcement = arrivalAnnouncement({ previous, messages: bubbles, selfId, pinned: scroll.pinned, unseen: scroll.unseen }, t)
    if (announcement === null) return
    setArrivalText((previousText) => (previousText === announcement ? `${announcement}${REPEAT_MARK}` : announcement))
  }, [loading, bubbles, selfId, scroll.pinned, scroll.unseen, t])

  return (
    <>
      <div
        className="msg-body"
        ref={bodyRef}
        // Une région NOMMÉE par le titre de la conversation (P18b, A04).
        role="region"
        aria-labelledby={titleId}
        onScroll={(event) => {
          const node = event.currentTarget
          heightBeforeRef.current = node.scrollHeight - node.scrollTop
          setScroll((state) => reduceOnMessages(state, {
            kind: "scroll",
            nearBottom: isNearBottom({ scrollTop: node.scrollTop, scrollHeight: node.scrollHeight, clientHeight: node.clientHeight }),
          }))
        }}
      >
        {loading ? (
          <p className="msg-empty" role="status">{t("contextualConversation.loading")}</p>
        ) : rows.length === 0 && visibleOutbox.length === 0 ? (
          <p className="msg-empty">{t("contextualConversation.messages.empty")}</p>
        ) : (
          <div className="msg-thread">
            {/* En TÊTE du fil, à la demande : le passé ne se charge jamais au défilement. */}
            {page.status === "CanLoadMore" ? (
              <button type="button" className="msg-infos-mini self-center" onClick={() => page.loadMore(CONTEXTUAL_MESSAGES_PAGE)}>
                <History aria-hidden="true" size={13} className="mr-1.5 inline align-[-2px]" />
                {t("messagerieConversationView.loadOlder")}
              </button>
            ) : null}
            {page.status === "LoadingMore" ? <span className="msg-day">{t("messagerieConversationView.loadingOlder")}</span> : null}
            {rows.map((row) =>
              row.kind === "date" ? (
                <span key={row.id} className="msg-day">{row.label}</span>
              ) : (
                <span key={row.id} id={`msg-ctx-${row.id}`}>
                  <MessageBubble
                    row={row}
                    // Aucun accusé : `readAt` est absent des bulles contextuelles, aucune coche n'est dessinée.
                    conversationKind="chat"
                    showSender={showSender}
                    canReply={false}
                    onReply={ignore}
                    onReact={ignore}
                    onAction={ignore}
                    renderActionsSheet={({ open, onOpenChange }) => {
                      const message = byId.get(row.id)
                      return message === undefined ? null : (
                        <ContextualMessageActionsSheet
                          open={open}
                          onOpenChange={onOpenChange}
                          message={message}
                          viewerSide={viewerSide}
                          onCopy={onCopy}
                          onRemove={onRemove}
                          onReport={onReport}
                        />
                      )
                    }}
                  />
                </span>
              ),
            )}
          </div>
        )}
        <OutboxMessages entries={visibleOutbox} />
      </div>
      <NewMessagesPill count={scroll.unseen} onJump={jumpToBottom} />
      {/* P18b (A04) : la région polie des arrivées, persistante tant que le fil est ouvert. */}
      <p className="sr-only" role="status">{arrivalText}</p>
    </>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// La feuille d'actions d'une bulle : copier, retirer le sien, signaler celui d'en face
// ═══════════════════════════════════════════════════════════════════════════

const ACTION_LABEL_KEYS: Readonly<Record<ContextualMessageAction, string>> = {
  copier: "contextualConversation.actions.copy",
  retirer: "contextualConversation.actions.remove",
  signaler: "contextualConversation.actions.report",
}

function ContextualMessageActionsSheet({
  open,
  onOpenChange,
  message,
  viewerSide,
  onCopy,
  onRemove,
  onReport,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  message: ContextualMessage
  viewerSide: ContextualSide
  onCopy: (text: string) => void
  onRemove: (messageId: ContextualMessageId) => Promise<string | null>
  onReport: (messageId: ContextualMessageId, reason: ContentReportReason) => Promise<string | null>
}) {
  const { t } = useTranslation("messagerie")
  const [step, setStep] = useState<"menu" | "remove" | "report">("menu")
  const [pending, setPending] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const removeQuestionId = useId()
  const actions = contextualMessageActions(message, viewerSide)
  const change = (next: boolean) => {
    // Une transmission en cours ne se ferme pas : sa réponse doit être dite ici.
    if (!next && pending) return
    if (!next) {
      setStep("menu")
      setFailure(null)
    }
    onOpenChange(next)
  }
  const choose = (action: ContextualMessageAction) => {
    setFailure(null)
    if (action === "copier") {
      onCopy(message.content ?? "")
      change(false)
      return
    }
    setStep(action === "retirer" ? "remove" : "report")
  }
  const remove = async () => {
    if (pending) return
    setPending(true)
    const refusal = await onRemove(message.messageId)
    setPending(false)
    if (refusal === null) change(false)
    else setFailure(refusal)
  }
  const report = async (reason: ContentReportReason) => {
    if (pending) return
    setPending(true)
    const refusal = await onReport(message.messageId, reason)
    setPending(false)
    if (refusal === null) change(false)
    else setFailure(refusal)
  }

  return (
    <Sheet open={open} onOpenChange={change}>
      <SheetContent side="bottom" closeLabel={t("contextualConversation.actions.close")} className="max-h-[70dvh] rounded-t-2xl border-border/60 bg-secondary">
        <SheetHeader className="pr-16">
          <SheetTitle>{t("contextualConversation.actions.title")}</SheetTitle>
        </SheetHeader>
        <SheetBody>
          {step === "menu" ? (
            actions.length === 0 ? (
              <p className="m-0 text-sm">{t("contextualConversation.actions.none")}</p>
            ) : (
              <ul className="msg-list">
                {actions.map((action) => (
                  <li key={action}>
                    <button type="button" className="msg-row" onClick={() => choose(action)}>
                      <span className="msg-row-main">
                        <span className="msg-row-name">{t(ACTION_LABEL_KEYS[action])}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )
          ) : null}
          {step === "remove" ? (
            <div className="flex flex-col gap-2" role="group" aria-labelledby={removeQuestionId}>
              <p id={removeQuestionId} className="m-0 text-sm">{t("contextualConversation.actions.removeConfirm")}</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="msg-tool-btn" disabled={pending} onClick={() => void remove()}>
                  {t("contextualConversation.actions.removeConfirmAction")}
                </button>
                <button type="button" className="msg-tool-btn" disabled={pending} onClick={() => setStep("menu")}>
                  {t("contextualConversation.actions.cancel")}
                </button>
              </div>
            </div>
          ) : null}
          {step === "report" ? <ContextualReportForm pending={pending} onCancel={() => setStep("menu")} onSubmit={report} /> : null}
          {/* Le refus est dit DANS la feuille : la page derrière est inerte tant qu'elle est ouverte. */}
          {failure !== null ? <p className="msg-error" role="alert">{failure}</p> : null}
        </SheetBody>
      </SheetContent>
    </Sheet>
  )
}

const reportSchema = z.object({ reason: z.enum(CONTENT_REPORT_REASONS) })

/** Le signalement d'un message d'en face : un motif fermé, rien d'autre n'est transmis. */
function ContextualReportForm({ pending, onCancel, onSubmit }: { pending: boolean; onCancel: () => void; onSubmit: (reason: ContentReportReason) => Promise<void> }) {
  const { t } = useTranslation("messagerie")
  const reasonId = useId()
  const form = useForm<z.infer<typeof reportSchema>>({ resolver: zodResolver(reportSchema), defaultValues: { reason: "harassment" } })
  return (
    <form className="flex flex-col gap-2" onSubmit={form.handleSubmit(async (values) => onSubmit(values.reason))}>
      <div className="flex flex-col gap-1 text-sm font-medium">
        <label htmlFor={reasonId}>{t("contextualConversation.actions.reportReason")}</label>
        <select id={reasonId} className="min-h-11 rounded-lg border border-input bg-background p-2" disabled={pending} {...form.register("reason")}>
          {CONTENT_REPORT_REASONS.map((reason) => (
            <option key={reason} value={reason}>{t(`reseau:reportContentDialog.reasons.${reason}`)}</option>
          ))}
        </select>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="submit" className="msg-tool-btn" disabled={pending}>{t("contextualConversation.actions.reportSubmit")}</button>
        <button type="button" className="msg-tool-btn" disabled={pending} onClick={onCancel}>{t("contextualConversation.actions.cancel")}</button>
      </div>
    </form>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// Appels (CC-4) : accord explicite, effet de MES réglages, démarrage
// ═══════════════════════════════════════════════════════════════════════════

function ContextualCallPanel({
  id,
  thread,
  counterpartName,
  busy,
  callActive,
  onConsent,
  onCall,
}: {
  id: string
  thread: ContextualThread
  counterpartName: string
  busy: boolean
  callActive: boolean
  onConsent: (allowed: boolean) => void
  onCall: (mediaType: "audio" | "video", targetPersonId: Id<"persons"> | null) => void
}) {
  const { t, i18n } = useTranslation("messagerie")
  const timeZone = useViewerTimeZone()
  const titleId = useId()
  // MES réglages, tels que la projection du fil les porte (CC-4, D5 amendé) — jamais ceux d'en face.
  const settings = thread.callSettings
  const notes = contextualCallNotes({ consent: thread.callConsent, settings, now: Date.now() })
  const dndUntil = settings.dndUntil === null ? "" : formatViewerDate(settings.dndUntil, i18n.language, { weekday: "short", hour: "2-digit", minute: "2-digit" }, timeZone)
  const needsTarget = contextualCallNeedsTarget(thread)
  const targets = needsTarget ? thread.callTargets : []
  return (
    <section id={id} className="flex flex-col gap-2 border-b border-border px-4 py-3 text-sm" aria-labelledby={titleId}>
      <h2 id={titleId} className="m-0 text-sm font-semibold">{t("contextualConversation.calls.title")}</h2>
      {/* Le signataire qui consent accepte d'être NOMMÉ : un texte d'accord distinct le lui dit (§5.8, point 3). */}
      <p className="m-0 text-xs text-muted-foreground">
        {thread.viewer.voice === "page"
          ? t("contextualConversation.calls.consentPage", { counterpart: counterpartName })
          : t("contextualConversation.calls.consentPerson")}
      </p>
      {thread.callConsent ? <p className="m-0">{t("contextualConversation.calls.given")}</p> : null}
      <div className="flex flex-wrap gap-2">
        {/* Jamais prérempli : l'accord se donne par ce geste, et se retire toujours. */}
        {thread.callConsent ? (
          <button type="button" className="msg-tool-btn" disabled={busy} onClick={() => onConsent(false)}>{t("contextualConversation.calls.withdraw")}</button>
        ) : thread.capabilities.canSetCallConsent ? (
          <button type="button" className="msg-tool-btn" disabled={busy} onClick={() => onConsent(true)}>{t("contextualConversation.calls.give")}</button>
        ) : null}
      </div>
      <ul className="m-0 flex list-none flex-col gap-1 p-0 text-xs text-muted-foreground">
        {notes.map((note) => <li key={note}>{t(`contextualConversation.calls.${note}`, { until: dndUntil })}</li>)}
      </ul>
      {thread.capabilities.canCall ? (
        <ContextualCallStartForm
          key={targets.map((target) => String(target.personId)).join(",")}
          needsTarget={needsTarget}
          targets={targets}
          disabled={busy || callActive}
          onCall={onCall}
        />
      ) : null}
      {callActive ? <p className="m-0 text-xs">{t("contextualConversation.calls.busy")}</p> : null}
    </section>
  )
}

const callTargetSchema = z.object({ target: z.string() })

/**
 * Le démarrage : en face d'une page, le demandeur choisit parmi les signataires CONSENTANTS ;
 * ailleurs, la cible est unique et le serveur la déduit de l'objet. Rien ne sonne avant ce geste.
 */
function ContextualCallStartForm({
  needsTarget,
  targets,
  disabled,
  onCall,
}: {
  needsTarget: boolean
  targets: ContextualThread["callTargets"]
  disabled: boolean
  onCall: (mediaType: "audio" | "video", targetPersonId: Id<"persons"> | null) => void
}) {
  const { t } = useTranslation("messagerie")
  const targetId = useId()
  const first = targets[0]
  const form = useForm<z.infer<typeof callTargetSchema>>({ resolver: zodResolver(callTargetSchema), defaultValues: { target: first === undefined ? "" : String(first.personId) } })
  const noTarget = needsTarget && targets.length === 0
  const call = (mediaType: "audio" | "video") => form.handleSubmit((values) => {
    if (!needsTarget) {
      onCall(mediaType, null)
      return
    }
    const target = targets.find((candidate) => String(candidate.personId) === values.target)
    if (target === undefined) {
      form.setError("target", { message: t("contextualConversation.calls.noTarget") })
      return
    }
    onCall(mediaType, target.personId)
  })
  const targetError = form.formState.errors.target?.message
  return (
    <form className="flex flex-col gap-2" noValidate onSubmit={(event) => event.preventDefault()}>
      {needsTarget && targets.length > 1 ? (
        <div className="flex flex-col gap-1 text-sm">
          <label htmlFor={targetId}>{t("contextualConversation.calls.target")}</label>
          <select id={targetId} className="min-h-11 rounded-lg border border-input bg-background p-2" disabled={disabled} {...form.register("target")}>
            {targets.map((target) => (
              <option key={String(target.personId)} value={String(target.personId)}>
                {contextualLabelName(target.label) ?? t("contextualConversation.counterpart.person")}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      {noTarget ? <p className="m-0 text-xs">{t("contextualConversation.calls.noTarget")}</p> : null}
      <div className="flex flex-wrap gap-2">
        <button type="button" className="msg-tool-btn" disabled={disabled || noTarget} onClick={(event) => void call("audio")(event)}>
          <Phone aria-hidden="true" size={15} />
          {t("contextualConversation.calls.audio")}
        </button>
        <button type="button" className="msg-tool-btn" disabled={disabled || noTarget} onClick={(event) => void call("video")(event)}>
          <Video aria-hidden="true" size={15} />
          {t("contextualConversation.calls.video")}
        </button>
      </div>
      {targetError !== undefined ? <p className="msg-error" role="alert">{targetError}</p> : null}
    </form>
  )
}
