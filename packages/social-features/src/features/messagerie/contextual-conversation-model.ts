/**
 * CC-5 (contrat CONVERSATION-CONTEXTUELLE-V1 §3.3, §3.4, §5.3, §5.8, §8, §10.1, §11.3 ;
 * ADR-0025) — ce que l'interface d'une conversation CONTEXTUELLE décide, hors de tout composant.
 *
 * Une conversation contextuelle est ouverte et fermée par un OBJET déjà accepté (demande de
 * service, mentorat accepté, candidature présélectionnée). Elle n'est ni un fil personnel ni un
 * fil commercial P10 : ses messages, ses clés et ses gestes ne se convertissent jamais d'une
 * famille à l'autre. Ce module tranche, à partir de la SEULE projection du moteur :
 *
 *  · l'ordre et la mise en bulles des messages, et QUI parle — une page parle d'une seule voix :
 *    le demandeur ne voit jamais le signataire qui a écrit, même si une réponse le portait par
 *    erreur ; l'équipe, elle, voit son coéquipier pour se coordonner ;
 *  · les états VISIBLES d'une partie (ouverte, fermée, indisponible) — « bloquée » et « absente »
 *    ne sont pas des états : le moteur rend `null`, et l'écran dit la même phrase neutre ;
 *  · le refus explicite d'un envoi (règles `CONTEXT_*` traduites), et le code FERMÉ d'une tranche
 *    (`appRule`, par exemple `context_address_forbidden`), traduit par l'application qui l'a défini ;
 *  · les gestes d'une bulle (copier, retirer le sien, signaler celui d'en face) — ni réaction, ni
 *    transfert, ni épingle, ni modification en V1 ;
 *  · l'effet de MES propres réglages d'appel, jamais ceux de l'autre côté (D5 amendé) ;
 *  · la recherche locale, le brouillon en mémoire et l'acquittement de lecture.
 *
 * Aucun accusé de lecture ni statut « livré » n'est fabriqué ici : le moteur n'en prouve aucun
 * (§2). Module PUR : aucun React, aucun appel au moteur — testé en environnement `node`.
 */
import { engineErrorAppRule, engineErrorCode, type AppRuleParams } from "@antsia/social-contracts/errors"
import type { MediaWithheld } from "@antsia/social-contracts/media"
import { CONTEXTUAL_LEGACY_V1_KINDS, type ContextualKind, type ContextualLegacyV1Kind, type ContextualRefusal, type ContextualSide, type ContextualVoice } from "@antsia/social-domain/contextualMessaging"
import type { TFunction } from "i18next"
import type { ReactNode } from "react"

import type { MessageAttachmentData } from "./MessageAttachment"
import type { BubbleMessage } from "./MessageBubble"
import { messageErreurLisible } from "./messagerie-erreur"
import { normaliseRecherche } from "./messagerie-liste"
import { MessageSendInProgress } from "./messagerie-send-intent"

// ═══════════════════════════════════════════════════════════════════════════
// Le point d'injection de l'application (CC-6) — même forme que le canal P10
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Ce qu'une application injecte dans `MessagesRoute` / `IcomMessagesPage` pour servir ses
 * conversations contextuelles : la liste du filtre « Mises en relation » et la conversation
 * ouverte. `useContextualMessages()` en fournit une implémentation prête à monter.
 */
export interface ContextualMessagesInjection {
  /** La liste du filtre « Mises en relation » — `query` est la recherche de la liste Messages. */
  renderList: (query: string) => ReactNode
  /** La conversation `threadId` (identifiant du moteur, tel que la route le porte). */
  renderConversation: (threadId: string) => ReactNode
}

/** Traduire un code fermé de la tranche (`appRule`) dans l'espace de noms de l'application. */
export type ContextualAppRuleDescriber = (appRule: string, params: AppRuleParams) => string | null

// ═══════════════════════════════════════════════════════════════════════════
// Formes lues de la projection (§10.1) — sous-ensembles structurels du DTO du moteur
// ═══════════════════════════════════════════════════════════════════════════

/** Le libellé publié d'une personne, tel que le moteur le projette. */
export interface ContextualLabelView {
  displayName: string | null
  handle: string | null
  avatarUrl: string | null
}

/** La carte d'une page (logo servi par la garde des fichiers). */
export interface ContextualPageCardView {
  name: string
  handle: string
  logoUrl: string | null
}

/**
 * L'objet ouvrant du contrat V1 : sa nature parmi les trois natures V1 et son identifiant, rien
 * de son contenu. Type stable des tranches historiques (DIASPORALE), qui rouvrent ces trois natures.
 */
export interface ContextualObjectRefView {
  kind: ContextualLegacyV1Kind
  id: string
}

/** L'objet ouvrant de toute nature du moteur, collaboration professionnelle (MP09) comprise. */
export interface ContextualAnyObjectRefView {
  kind: ContextualKind
  id: string
}

/** La projection V1 d'un objet (nature et identifiant) ; `null` pour une nature postérieure à V1. */
export function legacyContextualObjectRef(object: ContextualAnyObjectRefView): ContextualObjectRefView | null {
  const kind = CONTEXTUAL_LEGACY_V1_KINDS.find((legacy) => legacy === object.kind)
  return kind === undefined ? null : { kind, id: object.id }
}

export interface ContextualThreadView {
  threadId: string
  kind: ContextualKind
  object: ContextualAnyObjectRefView | null
  viewer: { side: ContextualSide; voice: ContextualVoice }
  counterpart:
    | { kind: "person"; label: ContextualLabelView }
    | { kind: "page"; page: ContextualPageCardView | null }
  state: { kind: "open" } | { kind: "read_only"; reason: "closed" | "unavailable" }
  capabilities: { canSend: boolean; canAttach: boolean; canClose: boolean; canSetCallConsent: boolean; canCall: boolean }
  sendRefusal: ContextualRefusal | null
  callConsent: boolean
  callTargets: readonly { personId: string; label: ContextualLabelView }[]
  /** CC-4 (D5 amendé) : l'effet de SES PROPRES réglages d'appel sur ce fil — jamais ceux d'en face. */
  callSettings: ContextualCallSettingsView
  unread: boolean
  revision: number
  lastMessageAt: number
  createdAt: number
}

export interface ContextualMessageView {
  messageId: string
  side: ContextualSide
  voice: ContextualVoice
  sender:
    | { kind: "person"; label: ContextualLabelView }
    | { kind: "page"; page: ContextualPageCardView | null; teammate: ContextualLabelView | null }
  isMine: boolean
  content: string | null
  deleted: boolean
  withheld: boolean
  attachmentFiles: readonly {
    filename: string
    mimeType: string
    sizeBytes: number
    durationMs: number | null
    url: string | null
    withheld: MediaWithheld | null
  }[]
  createdAt: number
}

// ═══════════════════════════════════════════════════════════════════════════
// Libellés : nature, rôle, autre côté
// ═══════════════════════════════════════════════════════════════════════════

const KEYS = "messagerie:contextualConversation"

/** Le nom de la nature (liste fermée du moteur). */
export function contextualKindLabel(kind: ContextualKind, t: TFunction): string {
  return t(`${KEYS}.kinds.${kind}`)
}

/** Le rôle traduit d'un côté, par nature (§3.3) : client et prestataire, mentoré et mentor… */
export function contextualRoleLabel(kind: ContextualKind, side: ContextualSide, t: TFunction): string {
  return t(`${KEYS}.roles.${kind}.${side}`)
}

/** Le nom publié d'un libellé, sinon son identifiant public, sinon `null` (jamais un identifiant interne). */
export function contextualLabelName(label: ContextualLabelView | null | undefined): string | null {
  if (label === null || label === undefined) return null
  const name = (label.displayName ?? "").trim()
  if (name.length > 0) return name
  const handle = (label.handle ?? "").trim()
  return handle.length > 0 ? `@${handle}` : null
}

/** L'autre côté tel que le lecteur le voit : la page (jamais un signataire), ou la personne. */
export function contextualCounterpartName(thread: Pick<ContextualThreadView, "counterpart">, t: TFunction): string {
  if (thread.counterpart.kind === "page") return thread.counterpart.page?.name ?? t(`${KEYS}.counterpart.page`)
  return contextualLabelName(thread.counterpart.label) ?? t(`${KEYS}.counterpart.person`)
}

/** L'avatar de l'autre côté : le logo servi de la page, ou celui de la personne. */
export function contextualCounterpartAvatar(thread: Pick<ContextualThreadView, "counterpart">): { url: string | null; shape: "square" | "round"; hasIdentity: boolean } {
  if (thread.counterpart.kind === "page") return { url: thread.counterpart.page?.logoUrl ?? null, shape: "square", hasIdentity: thread.counterpart.page !== null }
  return { url: thread.counterpart.label.avatarUrl, shape: "round", hasIdentity: contextualLabelName(thread.counterpart.label) !== null }
}

/**
 * La phrase de VOIX du lecteur (§3.3, D3) : signataire qui écrit au nom de la page (son nom n'est
 * jamais montré au demandeur), demandeur face à une page (une seule voix), ou personne. La
 * projection ne porte que la carte de l'AUTRE côté : le signataire lit « la page », sans nom.
 */
export function contextualVoiceText(thread: Pick<ContextualThreadView, "viewer" | "counterpart">, t: TFunction): string {
  if (thread.viewer.voice === "page") return t(`${KEYS}.voice.page`, { counterpart: contextualCounterpartName(thread, t) })
  if (thread.counterpart.kind === "page") return t(`${KEYS}.voice.facingPage`, { page: contextualCounterpartName(thread, t) })
  return t(`${KEYS}.voice.person`)
}

// ═══════════════════════════════════════════════════════════════════════════
// États visibles (§3.4) et refus explicites (§5.3)
// ═══════════════════════════════════════════════════════════════════════════

export type ContextualVisibleState = "open" | "closed" | "unavailable"

/** L'état qu'une PARTIE voit. « Bloquée » et « absente » n'en sont pas : le moteur rend `null`. */
export function contextualVisibleState(thread: Pick<ContextualThreadView, "state">): ContextualVisibleState {
  return thread.state.kind === "open" ? "open" : thread.state.reason
}

/**
 * La clé de la phrase qui REMPLACE le composeur quand l'envoi est fermé : le refus explicite du
 * moteur (`rules:CONTEXT_*`, liste fermée, sans jamais dire qui a retiré quoi), sinon le statut
 * d'adhésion insuffisant. `null` : le composeur est offert.
 */
export function contextualSendBlockKey(thread: Pick<ContextualThreadView, "capabilities" | "sendRefusal">): string | null {
  if (thread.capabilities.canSend) return null
  return thread.sendRefusal !== null ? `rules:${thread.sendRefusal}` : "errors:statusInsufficient"
}

/**
 * Le texte d'un refus, tel qu'on peut le MONTRER à la partie émettrice :
 *  1. un envoi déjà en cours dans cette conversation (double appui, autre pose) ;
 *  2. un code FERMÉ de la tranche (`appRule`) — traduit par l'APPLICATION qui l'a défini
 *     (`describeAppRule`), sinon une phrase neutre de la messagerie : jamais le code brut ;
 *  3. CC-4 : un appel sans choix alors que plusieurs signataires ont consenti (`invalidArgument`,
 *     champ `targetPersonId`) — « choisissez la personne à appeler » ;
 *  4. une règle du domaine ou un code du moteur (`messageErreurLisible`) — jamais une trace serveur.
 */
export function contextualErrorText(error: unknown, t: TFunction, describeAppRule?: ContextualAppRuleDescriber): string {
  if (error instanceof MessageSendInProgress) return t("messagerie:messageComposer.sendAlreadyPending")
  const appRule = engineErrorAppRule(error)
  if (appRule !== null) {
    const described = describeAppRule?.(appRule.appRule, appRule.appParams) ?? null
    return described !== null && described.trim().length > 0 ? described : t(`${KEYS}.errors.appRule`)
  }
  if (engineErrorCode(error) === "invalidArgument" && engineErrorField(error) === "targetPersonId") return t(`${KEYS}.calls.chooseTarget`)
  return messageErreurLisible(error, t)
}

/** Le champ fautif d'un `invalidArgument` (jamais une valeur), lu dans la charge d'une `ConvexError`. */
function engineErrorField(error: unknown): string | null {
  if (typeof error !== "object" || error === null || !("data" in error)) return null
  const data = (error as { data: unknown }).data
  if (typeof data !== "object" || data === null || !("field" in data)) return null
  const field = (data as { field: unknown }).field
  return typeof field === "string" ? field : null
}

// ═══════════════════════════════════════════════════════════════════════════
// Messages : ordre, voix, bulles (P18b)
// ═══════════════════════════════════════════════════════════════════════════

/** Dédoublonnage d'une fenêtre (la dernière projection d'un message gagne), puis ordre chronologique. */
export function orderedContextualMessages<M extends { messageId: string; createdAt: number }>(messages: readonly M[]): M[] {
  return [...new Map(messages.map((message) => [String(message.messageId), message])).values()]
    .sort((a, b) => a.createdAt - b.createdAt || String(a.messageId).localeCompare(String(b.messageId)))
}

/**
 * L'expéditeur d'une bulle, pour la mise en salves : MOI, la page (une seule voix pour le
 * demandeur — tous les signataires se fondent en elle), le coéquipier (vu de l'équipe), ou la
 * personne d'un côté. Aucun identifiant de personne n'est inventé ni lu d'ailleurs.
 */
export function contextualSenderId(message: Pick<ContextualMessageView, "isMine" | "voice" | "side" | "sender">, selfId: string, viewerSide: ContextualSide): string {
  if (message.isMine) return selfId
  if (message.voice === "page") {
    const teammate = viewerSide === "responder" && message.sender.kind === "page" ? contextualLabelName(message.sender.teammate) : null
    return teammate === null ? `page:${message.side}` : `page:${message.side}:${teammate}`
  }
  return `person:${message.side}`
}

/**
 * Le nom DIT d'un expéditeur. En voix de page, la page seule — et, pour l'équipe uniquement,
 * « Awa pour Atelier Mbolo ». Le demandeur ne reçoit jamais de coéquipier du moteur (D3, N33) ;
 * s'il en recevait un par erreur, il ne serait pas montré.
 */
export function contextualSenderName(message: Pick<ContextualMessageView, "sender">, viewerSide: ContextualSide, t: TFunction): string {
  if (message.sender.kind === "person") return contextualLabelName(message.sender.label) ?? t(`${KEYS}.counterpart.person`)
  const page = message.sender.page?.name ?? t(`${KEYS}.counterpart.page`)
  const teammate = viewerSide === "responder" ? contextualLabelName(message.sender.teammate) : null
  return teammate === null ? page : t(`${KEYS}.messages.teammate`, { name: teammate, page })
}

/** Une pièce telle que la garde des fichiers l'a délivrée : URL servie, ou retenue nommée. */
function contextualAttachment(file: ContextualMessageView["attachmentFiles"][number]): MessageAttachmentData {
  return { filename: file.filename, mimeType: file.mimeType, sizeBytes: file.sizeBytes, durationMs: file.durationMs, url: file.url, withheld: file.withheld }
}

/**
 * Les messages, NORMALISÉS pour la bulle accessible P18b (`MessageBubble`) : ni citation, ni
 * réaction, ni transfert, ni épingle, ni accusé de lecture (`readAt` absent : aucune coche n'est
 * dessinée). Un message retenu (relecture, retrait par la modération, masque du signaleur) se lit
 * « masqué », sans contenu ni pièce ; un message retiré par son émetteur, « supprimé ».
 */
export function contextualBubbles(messages: readonly ContextualMessageView[], options: { selfId: string; viewerSide: ContextualSide }, t: TFunction): BubbleMessage[] {
  return orderedContextualMessages(messages).map((message) => ({
    id: String(message.messageId),
    senderId: contextualSenderId(message, options.selfId, options.viewerSide),
    createdAt: message.createdAt,
    deleted: message.deleted,
    masked: !message.deleted && message.withheld,
    text: message.deleted || message.withheld ? null : message.content,
    senderName: contextualSenderName(message, options.viewerSide, t),
    attachments: message.deleted || message.withheld ? [] : message.attachmentFiles.map(contextualAttachment),
    reply: null,
    reactions: null,
    editedAt: null,
    forwarded: false,
    pinned: false,
    systemText: null,
  }))
}

// ═══════════════════════════════════════════════════════════════════════════
// Gestes d'une bulle (§2, §8, §10.1)
// ═══════════════════════════════════════════════════════════════════════════

export type ContextualMessageAction = "copier" | "retirer" | "signaler"

/**
 * Les gestes offerts sur une bulle, dans l'ordre d'affichage :
 *  · copier un texte lisible ;
 *  · RETIRER son propre message (auteur, ou signataire qui a porté la voix de page), tant qu'il lit ;
 *  · SIGNALER celui d'en face — jamais le sien, jamais la voix de sa propre page, jamais un message
 *    illisible (§8) : le serveur le refuserait, l'offrir promettrait un geste qui échoue.
 * Un message retiré n'offre plus rien.
 */
export function contextualMessageActions(
  message: Pick<ContextualMessageView, "isMine" | "deleted" | "withheld" | "voice" | "side" | "content">,
  viewerSide: ContextualSide,
): readonly ContextualMessageAction[] {
  if (message.deleted) return []
  const actions: ContextualMessageAction[] = []
  if (!message.withheld && (message.content ?? "").trim().length > 0) actions.push("copier")
  if (message.isMine && message.side === viewerSide) actions.push("retirer")
  const ownPageVoice = message.voice === "page" && message.side === viewerSide
  if (!message.isMine && !message.withheld && !ownPageVoice) actions.push("signaler")
  return actions
}

// ═══════════════════════════════════════════════════════════════════════════
// Appels (§5.8, D5 amendé) : MES réglages, jamais ceux d'en face
// ═══════════════════════════════════════════════════════════════════════════

/**
 * MES propres réglages d'appel, tels que la projection du fil les porte (CC-4, `callSettings`) :
 * le moteur les lit pour le seul lecteur ; rien de l'autre côté n'y figure.
 */
export interface ContextualCallSettingsView {
  /** Mon « hors de mes relations : silencieux » est actif — il ne s'applique pas à mon accord dans CE fil. */
  outsideRelationsSilenceWaived: boolean
  /** Fin de mon « ne pas déranger » (toujours appliqué), `null` sans silence ; l'écran compare à son horloge. */
  dndUntil: number | null
  /** Mon silence automatique de réunion est activé (toujours appliqué). */
  meetingSilence: boolean
  /** J'ai coupé le signal d'appel en attente : déjà en ligne, je suis indiqué « occupé ». */
  callWaitingOff: boolean
  /** J'ai coupé la sonnerie poussée hors de l'onglet. */
  incomingPushOff: boolean
}

export type ContextualCallNote = "rule" | "silentOverride" | "silentOverrideIfConsent" | "dndActive" | "meetingSilence" | "callWaitingOff" | "incomingPushOff"

/**
 * Ce que l'écran dit de l'effet de MES réglages sur cette conversation (D5 amendé, option (a)) :
 * l'accord donné ICI vaut admission pour ce seul fil au-dessus de « hors de mes relations :
 * silencieux » ; « ne pas déranger », le silence de réunion et « occupé » restent appliqués. Un
 * « ne pas déranger » échu (`dndUntil` passé à l'instant `now`) ne se dit plus. Rien n'est dit des
 * réglages de l'autre côté.
 */
export function contextualCallNotes(input: { consent: boolean; settings: ContextualCallSettingsView; now: number }): readonly ContextualCallNote[] {
  const notes: ContextualCallNote[] = ["rule"]
  const { settings } = input
  if (settings.outsideRelationsSilenceWaived) notes.push(input.consent ? "silentOverride" : "silentOverrideIfConsent")
  if (settings.dndUntil !== null && settings.dndUntil > input.now) notes.push("dndActive")
  if (settings.meetingSilence) notes.push("meetingSilence")
  if (settings.callWaitingOff) notes.push("callWaitingOff")
  if (settings.incomingPushOff) notes.push("incomingPushOff")
  return notes
}

/** Le panneau d'appel a-t-il lieu d'être ? Un accord donné se retire TOUJOURS, même fil fermé. */
export function contextualCallsRelevant(thread: Pick<ContextualThreadView, "capabilities" | "callConsent">): boolean {
  return thread.capabilities.canSetCallConsent || thread.capabilities.canCall || thread.callConsent
}

/**
 * Le demandeur face à une PAGE choisit parmi les signataires CONSENTANTS (§5.8, point 3) ; partout
 * ailleurs, la cible est unique et le serveur la déduit de l'objet.
 */
export function contextualCallNeedsTarget(thread: Pick<ContextualThreadView, "viewer" | "counterpart">): boolean {
  return thread.viewer.side === "requester" && thread.counterpart.kind === "page"
}

/**
 * QUI la fenêtre d'appel nomme pendant la sonnerie : le signataire choisi (il a consenti à être
 * nommé), sinon la personne d'en face. Jamais un signataire qui n'aurait pas consenti.
 */
export function contextualCallee(
  thread: Pick<ContextualThreadView, "viewer" | "counterpart" | "callTargets">,
  targetPersonId: string | null,
  t: TFunction,
): { name: string; handle: string | null; avatarUrl: string | null } {
  if (contextualCallNeedsTarget(thread)) {
    const target = thread.callTargets.find((candidate) => String(candidate.personId) === targetPersonId) ?? null
    return {
      name: contextualLabelName(target?.label) ?? contextualCounterpartName(thread, t),
      handle: target?.label.handle ?? null,
      avatarUrl: target?.label.avatarUrl ?? null,
    }
  }
  if (thread.counterpart.kind === "person") {
    return { name: contextualCounterpartName(thread, t), handle: thread.counterpart.label.handle, avatarUrl: thread.counterpart.label.avatarUrl }
  }
  return { name: contextualCounterpartName(thread, t), handle: null, avatarUrl: null }
}

// ═══════════════════════════════════════════════════════════════════════════
// Liste : recherche locale, lecture marquée
// ═══════════════════════════════════════════════════════════════════════════

/**
 * La recherche de la liste « Mises en relation », LOCALE aux fils chargés (la vue le dit) : sur le
 * nom de l'autre côté, son identifiant public et la nature. Une requête vide rend la même liste.
 */
export function filterContextualThreads<T extends Pick<ContextualThreadView, "counterpart" | "kind">>(threads: readonly T[], query: string, t: TFunction): readonly T[] {
  const term = normaliseRecherche(query)
  if (term.length === 0) return threads
  return threads.filter((thread) => {
    const handle = thread.counterpart.kind === "page" ? (thread.counterpart.page?.handle ?? "") : (thread.counterpart.label.handle ?? "")
    return [contextualCounterpartName(thread, t), handle, contextualKindLabel(thread.kind, t)].some((value) => normaliseRecherche(value).includes(term))
  })
}

/**
 * L'intention d'acquitter la lecture : un fil non lu dont les messages sont à l'écran, une seule
 * fois par dernier message. Aucune autre trace : rien n'est montré à l'autre côté (§2).
 */
export function contextualReadReceipt(thread: Pick<ContextualThreadView, "threadId" | "unread" | "lastMessageAt">, messagesShown: boolean): string | null {
  return thread.unread && messagesShown ? `${String(thread.threadId)}:${String(thread.lastMessageAt)}` : null
}

// ═══════════════════════════════════════════════════════════════════════════
// Brouillon : en MÉMOIRE seulement, par lecteur et par fil
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Le texte en cours de frappe survit au démontage de la conversation (changer de pose, revenir à
 * la liste), mais n'entre dans AUCUN stockage du navigateur : le magasin du dock purgerait une clé
 * qu'il ne connaît pas, et une saisie n'a rien à faire dans un stockage qu'une session suivante
 * relirait. Le remplacement du document (déconnexion, changement de compte) l'efface.
 */
const drafts = new Map<string, string>()
const draftListeners = new Set<() => void>()

/** La clé d'un brouillon : le lecteur (réseau, personne) ET le fil — une autre personne ne le lit jamais. */
export function contextualDraftKey(owner: string, threadId: string): string {
  return JSON.stringify([owner, threadId])
}

export const contextualDraftStore = {
  get(key: string): string {
    return drafts.get(key) ?? ""
  },
  set(key: string, text: string): void {
    if ((drafts.get(key) ?? "") === text) return
    if (text.length === 0) drafts.delete(key)
    else drafts.set(key, text)
    for (const listener of draftListeners) listener()
  },
  subscribe(listener: () => void): () => void {
    draftListeners.add(listener)
    return () => {
      draftListeners.delete(listener)
    }
  },
  /** Remise à zéro — RÉSERVÉE AUX TESTS. */
  __resetForTests(): void {
    drafts.clear()
    for (const listener of draftListeners) listener()
  },
}
