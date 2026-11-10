/**
 * CC-1 (contrat CONVERSATION-CONTEXTUELLE-V1 accepté, ADR-0025) — règles PURES d'une
 * conversation contextuelle : une conversation ouverte et fermée par un OBJET déjà accepté par son
 * propre parcours (demande de service, mentorat accepté, candidature présélectionnée, collaboration professionnelle acceptée), jamais par
 * une relation sociale. Elle n'ouvre pas la messagerie personnelle et ne duplique pas le canal
 * commercial P10.
 *
 * Aucune dépendance d'exécution, aucun stockage, aucune liste de personnes : le moteur relit
 * l'objet par le résolveur de la tranche, puis l'adhésion, la vivacité, les signataires vivants,
 * les blocages et la politique, à CHAQUE lecture et à CHAQUE écriture. Les fonctions ci-dessous
 * jugent des faits déjà relus ; elles ne décident jamais d'un accès à partir d'un cache.
 */
import type { ActiveMembershipStatus } from "./membership"
import type { ModerationSurface } from "./moderationPolicy"
import type { NotificationKind, NotificationSubjectKind } from "./notifications"
import type { DomainRule } from "./violation"

// ═══════════════════════════════════════════════════════════════
// Natures (§3.1) — liste FERMÉE
// ═══════════════════════════════════════════════════════════════

/** Les natures V1. Ajouter une nature est un changement du moteur (§10.5), jamais une chaîne libre. */
export const CONTEXTUAL_LEGACY_V1_KINDS = ["diasporaServiceRequest", "diasporaMentoring", "diasporaJobApplication"] as const
export type ContextualLegacyV1Kind = (typeof CONTEXTUAL_LEGACY_V1_KINDS)[number]
/** Export V1 stable pour les tranches historiques qui n'implémentent que ces trois résolveurs. */
export const CONTEXTUAL_KINDS = CONTEXTUAL_LEGACY_V1_KINDS
/** Registre exhaustif du moteur, à employer pour les validateurs, politiques et projections. */
export const CONTEXTUAL_SUPPORTED_KINDS = [...CONTEXTUAL_LEGACY_V1_KINDS, "professionalCollaboration"] as const
export type ContextualKind = (typeof CONTEXTUAL_SUPPORTED_KINDS)[number]

/**
 * Noms RÉSERVÉS, refusés par le validateur V1 : `commerceJobApplication` (P15, D11 — quatre
 * conditions préalables, §11.5) et `shopContact` (voie de convergence facultative de P10, §11.4).
 */
export const CONTEXTUAL_RESERVED_KINDS = ["commerceJobApplication", "shopContact"] as const
export type ContextualReservedKind = (typeof CONTEXTUAL_RESERVED_KINDS)[number]

/** Une nature admise ? Une nature réservée ou inconnue ne l'est jamais. */
export function isContextualKind(value: unknown): value is ContextualKind {
  return typeof value === "string" && (CONTEXTUAL_SUPPORTED_KINDS as readonly string[]).includes(value)
}

/** Un nom réservé (refusé en V1, à ne jamais réattribuer à une autre nature) ? */
export function isReservedContextualKind(value: unknown): value is ContextualReservedKind {
  return typeof value === "string" && (CONTEXTUAL_RESERVED_KINDS as readonly string[]).includes(value)
}

/** La colonne de référence TYPÉE de chaque nature : un fil porte exactement celle de sa nature. */
export const CONTEXTUAL_REFERENCE_FIELDS = {
  diasporaServiceRequest: "serviceRequestId",
  diasporaMentoring: "mentoringRequestId",
  diasporaJobApplication: "jobApplicationId",
  professionalCollaboration: "professionalCollaborationId",
} as const satisfies Readonly<Record<ContextualKind, string>>
export type ContextualReferenceField = (typeof CONTEXTUAL_REFERENCE_FIELDS)[ContextualKind]

/** Toutes les colonnes de référence, dans l'ordre des natures (classification des données : parents). */
export const CONTEXTUAL_REFERENCE_FIELD_LIST: readonly ContextualReferenceField[] = CONTEXTUAL_SUPPORTED_KINDS.map((kind) => CONTEXTUAL_REFERENCE_FIELDS[kind])

/** La table de l'objet ouvrant de chaque nature (lecture par le résolveur de sa tranche seulement). */
export const CONTEXTUAL_REFERENCE_TABLES = {
  diasporaServiceRequest: "serviceRequests",
  diasporaMentoring: "mentoringRequests",
  diasporaJobApplication: "jobApplications",
  professionalCollaboration: "professionalCollaborations",
} as const satisfies Readonly<Record<ContextualKind, string>>
export type ContextualReferenceTable<K extends ContextualKind = ContextualKind> = (typeof CONTEXTUAL_REFERENCE_TABLES)[K]

/** Le côté répondant de chaque nature : une PAGE (ses signataires vivants, D2) ou une PERSONNE. */
export const CONTEXTUAL_RESPONDER_KINDS = {
  diasporaServiceRequest: "page",
  diasporaMentoring: "person",
  diasporaJobApplication: "page",
  professionalCollaboration: "person",
} as const satisfies Readonly<Record<ContextualKind, "page" | "person">>

/**
 * Les références d'un fil sont-elles cohérentes avec sa nature ? EXACTEMENT une colonne
 * renseignée, celle de la nature (contrôle à l'insertion, §3.2).
 */
export function contextualReferencesConsistent(kind: ContextualKind, refs: Readonly<Partial<Record<ContextualReferenceField, string | undefined>>>): boolean {
  return CONTEXTUAL_REFERENCE_FIELD_LIST.every((field) => {
    const value = refs[field]
    const present = typeof value === "string" && value.length > 0
    return present === (field === CONTEXTUAL_REFERENCE_FIELDS[kind])
  })
}

// ═══════════════════════════════════════════════════════════════
// Clé de contexte (§3.2) — ouverture idempotente
// ═══════════════════════════════════════════════════════════════

/** Un identifiant d'objet du moteur : court, sans séparateur ni espace. */
const OBJECT_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/u

/**
 * La clé « nature:identifiant » d'un objet : UNE conversation par objet. Rend `null` pour une
 * nature non admise ou un identifiant mal formé (jamais une clé fabriquée à partir d'une chaîne libre).
 */
export function contextualKey(kind: string, objectId: string): string | null {
  if (!isContextualKind(kind) || !OBJECT_ID_PATTERN.test(objectId)) return null
  return `${kind}:${objectId}`
}

/** Relit une clé de contexte ; `null` si elle ne désigne pas une nature V1. */
export function parseContextualKey(key: string): { kind: ContextualKind; objectId: string } | null {
  const separator = key.indexOf(":")
  if (separator <= 0) return null
  const kind = key.slice(0, separator)
  const objectId = key.slice(separator + 1)
  return isContextualKind(kind) && OBJECT_ID_PATTERN.test(objectId) ? { kind, objectId } : null
}

// ═══════════════════════════════════════════════════════════════
// Phases, côtés, voix, états (§3.3, §3.4, §6.2)
// ═══════════════════════════════════════════════════════════════

/** La phase que la règle pure de la tranche déduit de l'état EFFECTIF de l'objet. */
export const CONTEXTUAL_PHASES = ["not_open", "open", "closed"] as const
export type ContextualPhase = (typeof CONTEXTUAL_PHASES)[number]

export const CONTEXTUAL_SIDES = ["requester", "responder"] as const
export type ContextualSide = (typeof CONTEXTUAL_SIDES)[number]

export const CONTEXTUAL_VOICES = ["person", "page"] as const
export type ContextualVoice = (typeof CONTEXTUAL_VOICES)[number]

/** Cache d'état d'un fil — jamais une vérité d'accès (§6.3). */
export const CONTEXTUAL_THREAD_STATUSES = ["open", "closed"] as const
export type ContextualThreadStatus = (typeof CONTEXTUAL_THREAD_STATUSES)[number]

/** `object` : l'objet s'est fermé (cache) ; `side` : un côté a clos (D12, fait irréversible). */
export const CONTEXTUAL_CLOSED_CAUSES = ["object", "side"] as const
export type ContextualClosedCause = (typeof CONTEXTUAL_CLOSED_CAUSES)[number]

/** Ce qu'une partie voit. « Bloquée » et « absente » sont des refus indistincts, pas des états. */
export const CONTEXTUAL_VIEW_STATES = ["open", "closed", "unavailable"] as const
export type ContextualViewState = (typeof CONTEXTUAL_VIEW_STATES)[number]

export function otherContextualSide(side: ContextualSide): ContextualSide {
  return side === "requester" ? "responder" : "requester"
}

/** La voix d'un côté : le demandeur parle sous son nom ; le répondant, sous celui de la page ou le sien. */
export function contextualVoiceOf(kind: ContextualKind, side: ContextualSide): ContextualVoice {
  return side === "requester" ? "person" : CONTEXTUAL_RESPONDER_KINDS[kind]
}

/**
 * Le côté d'un lecteur, à partir de faits RELUS. Le demandeur d'abord : une personne qui serait
 * aussi signataire de la page répondante n'agit QUE comme demandeur (§3.3, N08). Personne ne
 * parle des deux côtés.
 */
export function contextualViewerSide(input: {
  viewerPersonId: string
  requesterPersonId: string
  /** Présent pour une nature à côté répondant PERSONNE seulement. */
  responderPersonId?: string
  /** Signataire vivant de la page de l'objet (relu par le moteur), pour une nature à côté PAGE. */
  viewerIsLiveResponderSignatory: boolean
}): ContextualSide | null {
  if (input.viewerPersonId === input.requesterPersonId) return "requester"
  if (input.responderPersonId !== undefined) return input.responderPersonId === input.viewerPersonId ? "responder" : null
  return input.viewerIsLiveResponderSignatory ? "responder" : null
}

/**
 * L'état vu par une partie (§3.4). Fermée l'emporte sur indisponible : une phase hors
 * d'ouverture (`closed`, ou `not_open` — fil incohérent, lecture seule), une clôture par un côté
 * ou une politique fermée (D10) ferment ; sinon, sans personne vivante habilitée en face, la
 * conversation est indisponible (réversible).
 */
export function contextualViewState(input: { phase: ContextualPhase; closedBySide: boolean; policyOpen: boolean; counterpartAvailable: boolean }): ContextualViewState {
  if (input.phase !== "open" || input.closedBySide || !input.policyOpen) return "closed"
  return input.counterpartAvailable ? "open" : "unavailable"
}

/**
 * Le cache après relecture de l'objet (`syncContextualConversation`). La clôture par un côté est
 * un FAIT irréversible pour cet objet ; une fermeture par l'objet suit l'objet (un retrait par la
 * modération levé par un recours le rouvre). Le cache n'est jamais lu comme une vérité d'accès.
 */
export function nextContextualCache(
  current: { status: ContextualThreadStatus; closedCause?: ContextualClosedCause },
  phase: ContextualPhase,
): "unchanged" | "close" | "reopen" {
  if (current.closedCause === "side") return "unchanged"
  if (phase === "open") return current.status === "closed" ? "reopen" : "unchanged"
  return current.status === "open" ? "close" : "unchanged"
}

// ═══════════════════════════════════════════════════════════════
// Refus explicites (§5.3) — liste FERMÉE, règles du domaine
// ═══════════════════════════════════════════════════════════════

/**
 * Les refus traduits qu'une PARTIE reçoit (un tiers reçoit toujours le refus indistinct). Aucun ne
 * dit qui a retiré quoi. `CONTEXT_UNAVAILABLE` et `CONTEXT_TEXT_CONTROL` sont des ajouts de CC-1
 * (précision d'implémentation des décisions validées).
 */
export const CONTEXTUAL_REFUSALS = [
  "CONTEXT_NOT_OPEN",
  "CONTEXT_CLOSED",
  "CONTEXT_UNAVAILABLE",
  "CONTEXT_WAITING_RESPONDER",
  "CONTEXT_ATTACHMENTS_CLOSED",
  "CONTEXT_CALLS_CLOSED",
  "CONTEXT_CALL_CONSENT_REQUIRED",
  "CONTEXT_IDEMPOTENCY_CONFLICT",
  "CONTEXT_TEXT_CONTROL",
] as const satisfies readonly DomainRule[]
export type ContextualRefusal = (typeof CONTEXTUAL_REFUSALS)[number]

// ═══════════════════════════════════════════════════════════════
// Capacités (§6.2) — à partir de faits relus
// ═══════════════════════════════════════════════════════════════

export type ContextualCapabilityInput = {
  phase: ContextualPhase
  /** Un côté a clos le fil (D12) : fait stocké, irréversible. */
  closedBySide: boolean
  /** La politique de la nature dans ce réseau (fermée par défaut, §5.9). */
  policyOpen: boolean
  /** L'autre côté a au moins une personne vivante habilitée. */
  counterpartAvailable: boolean
  side: ContextualSide
  /** La phase de l'objet fait attendre le premier mot du répondant (D4). */
  responderFirst: boolean
  /** Le premier mot du répondant est acquis (son message, ou un geste de l'objet qui vaut réponse). */
  firstWordAcquired: boolean
  /** Pièces admises par côté dans cette phase (fourni par la tranche). */
  attachments: { readonly requester: boolean; readonly responder: boolean }
  /** Le lecteur satisfait le statut d'écriture que la tranche exige pour son côté. */
  writeStatusSatisfied: boolean
}

export type ContextualCapabilities = {
  viewState: ContextualViewState
  canSend: boolean
  canAttach: boolean
  canClose: boolean
  /** Le refus explicite d'un envoi (`null` : envoi possible ou refus de statut, porté ailleurs). */
  sendRefusal: ContextualRefusal | null
  /** Le refus explicite d'une pièce, quand l'envoi est possible mais pas la pièce. */
  attachRefusal: ContextualRefusal | null
}

/** Le refus d'écriture d'une partie, dans l'ordre : phase, clôture/politique, disponibilité, premier mot. */
function writeRefusal(input: ContextualCapabilityInput): ContextualRefusal | null {
  if (input.phase === "not_open") return "CONTEXT_NOT_OPEN"
  if (input.phase === "closed" || input.closedBySide || !input.policyOpen) return "CONTEXT_CLOSED"
  if (!input.counterpartAvailable) return "CONTEXT_UNAVAILABLE"
  if (input.side === "requester" && input.responderFirst && !input.firstWordAcquired) return "CONTEXT_WAITING_RESPONDER"
  return null
}

export function contextualCapabilities(input: ContextualCapabilityInput): ContextualCapabilities {
  const viewState = contextualViewState(input)
  const sendRefusal = writeRefusal(input)
  const canSend = sendRefusal === null && input.writeStatusSatisfied
  const attachmentsAllowed = input.attachments[input.side]
  return {
    viewState,
    canSend,
    canAttach: canSend && attachmentsAllowed,
    // Sortir reste possible tant que l'objet est ouvert et qu'aucun côté n'a clos (D12).
    canClose: input.phase === "open" && !input.closedBySide,
    sendRefusal,
    attachRefusal: sendRefusal ?? (attachmentsAllowed ? null : "CONTEXT_ATTACHMENTS_CLOSED"),
  }
}

/**
 * Accord d'appel (CC-4, §5.8) : l'ACTIVER exige une conversation ouverte, une phase engagée pour les
 * appels et le statut d'écriture ; le RETIRER est toujours possible.
 */
export function contextualCallConsentAllowed(input: { viewState: ContextualViewState; callsEngaged: boolean; writeStatusSatisfied: boolean; allowed: boolean }): boolean {
  if (!input.allowed) return true
  return input.viewState === "open" && input.callsEngaged && input.writeStatusSatisfied
}

/** Un appel (CC-4) : conversation ouverte, phase engagée, accord explicite DES DEUX côtés dans ce fil. */
export function contextualCallAllowed(input: { viewState: ContextualViewState; callsEngaged: boolean; ownConsent: boolean; targetConsent: boolean }): ContextualRefusal | null {
  if (input.viewState !== "open") return "CONTEXT_CLOSED"
  if (!input.callsEngaged) return "CONTEXT_CALLS_CLOSED"
  if (!input.ownConsent || !input.targetConsent) return "CONTEXT_CALL_CONSENT_REQUIRED"
  return null
}

/**
 * La clé d'autorité d'un accord d'appel (§5.8) : côté page, la ligne de signataire ET sa date
 * d'acceptation ; côté personne, la qualité de partie de l'objet. Une autorité perdue puis
 * retrouvée produit une autre clé : l'ancien accord ne revit pas.
 */
export function contextualCallAuthorityKey(input: { kind: "page"; signatoryRowId: string; acceptedAt: number } | { kind: "person"; contextKey: string; side: ContextualSide }): string {
  return input.kind === "page" ? `page:${input.signatoryRowId}:${input.acceptedAt}` : `person:${input.contextKey}:${input.side}`
}

// ═══════════════════════════════════════════════════════════════
// Vivacité (§4.2, point 5) — la règle de `livingMember` (P10), à partir de faits relus
// ═══════════════════════════════════════════════════════════════

/**
 * Une personne vivante pour la conversation : profil publié et non effacé, adhésion au statut
 * requis (suspension racine ou sanction globale comprises), consentement `social_profile` en
 * vigueur. Le moteur relit chacun de ces faits ; aucun n'est stocké dans le fil.
 */
export function isContextualPartyLive(facts: { profileLive: boolean; memberAtRequiredStatus: boolean; socialProfileConsentInForce: boolean }): boolean {
  return facts.profileLive && facts.memberAtRequiredStatus && facts.socialProfileConsentInForce
}

/** Le statut minimal d'une lecture (et des gestes de sortie) et celui d'un geste d'écriture (§5.1). */
export const CONTEXTUAL_READ_MIN_STATUS: ActiveMembershipStatus = "en_attente"
export const CONTEXTUAL_WRITE_MIN_STATUS: ActiveMembershipStatus = "declaree"

const STATUS_RANK: Readonly<Record<ActiveMembershipStatus, number>> = { en_attente: 0, declaree: 1, verifiee: 2 }

/**
 * Le plus exigeant de deux statuts : le moteur exige `declaree` pour écrire, la tranche peut
 * exiger davantage pour un côté (`writeMinStatus`) ; elle ne peut jamais exiger moins.
 */
export function strictestStatus(first: ActiveMembershipStatus, second: ActiveMembershipStatus): ActiveMembershipStatus {
  return STATUS_RANK[first] >= STATUS_RANK[second] ? first : second
}

// ═══════════════════════════════════════════════════════════════
// Texte, clé et empreinte (§5.5, §5.6) — règle NEUTRE
// ═══════════════════════════════════════════════════════════════

/** La borne du contrat partagé (`MESSAGE_MAX_LENGTH`, `social-contracts/messaging.ts`), test de parité côté moteur. */
export const CONTEXTUAL_TEXT_MAX = 4000

/** Les caractères de contrôle refusés : ceux de `commercialText` (P10), tabulation et fins de ligne admises. */
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u

export type ContextualTextResult =
  | { ok: true; text: string }
  | { ok: false; rule: Extract<DomainRule, "MESSAGE_EMPTY" | "MESSAGE_TOO_LONG" | "CONTEXT_TEXT_CONTROL">; params: Readonly<Record<string, number>> }

/**
 * Le texte d'un message : contrôles refusés, normalisation NFC, espaces de bord retirés ; vide
 * seulement avec des pièces ; 4 000 caractères au plus. Rend un code fermé, jamais une phrase.
 */
export function contextualText(value: string, hasAttachments: boolean): ContextualTextResult {
  if (CONTROL_CHARACTERS.test(value)) return { ok: false, rule: "CONTEXT_TEXT_CONTROL", params: {} }
  const text = value.normalize("NFC").trim()
  if (text.length === 0 && !hasAttachments) return { ok: false, rule: "MESSAGE_EMPTY", params: {} }
  if (text.length > CONTEXTUAL_TEXT_MAX) return { ok: false, rule: "MESSAGE_TOO_LONG", params: { max: CONTEXTUAL_TEXT_MAX } }
  return { ok: true, text }
}

/** Une clé d'idempotence : 8 à 128 caractères `[A-Za-z0-9_-]` (règle de `commercialIdempotencyKey`). */
export function contextualIdempotencyKey(value: string): boolean {
  return /^[A-Za-z0-9_-]{8,128}$/u.test(value)
}

export type ContextualDigestAttachment = { storageId: string; filename: string; mimeType: string; sizeBytes: number; durationMs?: number }

/**
 * Le JSON CANONIQUE dont le moteur prend le SHA-256 (modèle `commercialDigest`) : marque de
 * version, nature, fil, texte normalisé, pièces DÉCLARÉES dans leur ordre. Un tableau positionnel
 * de scalaires : aucune ambiguïté d'ordre de clés.
 */
export function contextualDigestMaterial(input: { kind: ContextualKind; threadId: string; text: string; attachments: readonly ContextualDigestAttachment[] }): string {
  return JSON.stringify([
    "contextual.message.v1",
    input.kind,
    input.threadId,
    input.text,
    input.attachments.map((file) => [file.storageId, file.filename, file.mimeType, file.sizeBytes, file.durationMs ?? null]),
  ])
}

/**
 * Le rejeu d'une clé d'idempotence (§5.6), à partir des lignes déjà admises sous cette clé DANS ce
 * fil : la ligne de l'émetteur, et elle seule, compte. Même empreinte : le message déjà admis ;
 * autre empreinte : conflit ; clé d'une autre personne : ni faux succès, ni conflit (nouvel envoi).
 */
export function contextualReplay<T extends { emitterPersonId: string | null; digest: string }>(rows: readonly T[], emitterPersonId: string, digest: string): { kind: "new" } | { kind: "replay"; row: T } | { kind: "conflict" } {
  const mine = rows.find((row) => row.emitterPersonId === emitterPersonId)
  if (!mine) return { kind: "new" }
  return mine.digest === digest ? { kind: "replay", row: mine } : { kind: "conflict" }
}

// ═══════════════════════════════════════════════════════════════
// Politique, bornes et conservation (§5.7, §5.9, §6.6, §7)
// ═══════════════════════════════════════════════════════════════

/** L'absence de ligne vaut « fermé » : une nature ne s'ouvre que par une décision tracée. */
export function contextualPolicyOpen(row: { enabled: boolean } | null | undefined): boolean {
  return row?.enabled === true
}

/** Le motif d'une décision de politique : dix caractères au moins (audit `contextual.policy_set`). */
export const CONTEXTUAL_POLICY_REASON_MIN = 10

/** D9 : deux pièces par message, comme P10 (le contrat partagé en admet cinq). */
export const CONTEXTUAL_ATTACHMENTS_MAX = 2

/** Avis d'équipe : vingt signataires vivants au plus, administrateurs d'abord. */
export const CONTEXTUAL_TEAM_NOTICE_MAX = 20

/** Pages de lecture. */
export const CONTEXTUAL_THREADS_PAGE_MAX = 30
export const CONTEXTUAL_MESSAGES_PAGE_MAX = 40
export const CONTEXTUAL_MESSAGES_ROWS_MAX = 80
export const CONTEXTUAL_PAGE_BYTES_MAX = 512 * 1024

/** Purge par tranches : vingt messages (et leurs blobs) par transaction. */
export const CONTEXTUAL_PURGE_SLICE = 20

/**
 * D7 : AUCUNE durée de conservation inventée. Aucune purge temporelle ne s'exécute et aucune
 * tâche planifiée n'existe tant que le propriétaire n'a pas fixé une durée avec un conseil
 * compétent. Les 90 jours de P10 ne sont pas hérités.
 */
export const CONTEXTUAL_RETENTION: null = null

/** Les avis neutres (catégorie `messages`) et leur sujet ; les transitions de l'objet gardent leurs avis. */
export const CONTEXTUAL_NOTIFICATION_KINDS = ["contextual_message", "contextual_closed"] as const satisfies readonly NotificationKind[]
export type ContextualNotificationKind = (typeof CONTEXTUAL_NOTIFICATION_KINDS)[number]
export const CONTEXTUAL_NOTIFICATION_SUBJECT: NotificationSubjectKind = "contextualThread"

export function isContextualNotificationKind(kind: string): kind is ContextualNotificationKind {
  return (CONTEXTUAL_NOTIFICATION_KINDS as readonly string[]).includes(kind)
}

/** La surface UNIQUE de modération des messages contextuels. */
export const CONTEXTUAL_MODERATION_SURFACE: ModerationSurface = "contextualMessage"

/** La nature affichée au guichet, DÉRIVÉE du fil côté serveur (jamais de la personne qui signale). */
export function contextualModerationLabel(kind: ContextualKind): string {
  return `${CONTEXTUAL_MODERATION_SURFACE} · ${kind}`
}

/**
 * Les destinataires d'un avis d'équipe : administrateurs d'abord, puis signataires, au plus
 * vingt. Le moteur relit ensuite CHAQUE destinataire (vivacité, blocage, lecture du fil).
 */
export function orderTeamRecipients<T extends { role: "admin" | "signatory" }>(rows: readonly T[], max: number = CONTEXTUAL_TEAM_NOTICE_MAX): T[] {
  return [...rows.filter((row) => row.role === "admin"), ...rows.filter((row) => row.role === "signatory")].slice(0, Math.max(0, max))
}

/** Non lu pour un lecteur : un message postérieur à sa dernière lecture (ou à l'ouverture, sans lecture). */
export function contextualUnread(input: { lastMessageAt: number; createdAt: number; readAt?: number }): boolean {
  return input.lastMessageAt > (input.readAt ?? input.createdAt)
}
