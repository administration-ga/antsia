// Dupliqué de socle/convex/modules/messagerieScope/threads.ts @ ad2e7fdc2 — adaptations : fils PERSONNELS par réseau seulement (postes, fils institutionnels et standard retirés : `findPosteThread`, `findInstitutionalThread`, `listPosteThreadsFor`, branches ancrées) ; `openOrContinuePersonalThread(ctx, { network, initiatorPersonId, targetPersonId, … })` au lieu d'`openOrContinueThread` ; pièces par la garde du moteur (`verifyDeclaredAttachments`) ; contenu jugé par le contrat (`assertMessageContent`) ; aperçu en NATURE ; pastille de non-lus par (réseau, personne) — `isUnreadFor`, `recomputePersonalUnreadTotal` gardés, la réconciliation écarte les fils d'un correspondant BLOQUÉ (le blocage met le compteur à jour à l'écriture, D38) ; push reporté (PA5) ; refus à code. ; IC-09 (diverge du socle) : chaque message déposé (`appendPersonalMessage`) émet la cloche neutre `personal_message` du destinataire par la porte unique (`notifyPerson`), une ligne par fil ; `personalMessageNoticeThread` relit le fil qu'un tel avis désigne.
/**
 * Trouver et OUVRIR un fil personnel, et tenir sa pastille de non-lus.
 *
 * Le compteur `unreadTotals` suit le MESSAGE, pas la surface qui le montre :
 * envoyer, lire, retirer, masquer, bloquer le déplacent ; la pastille ne fait
 * que le lire. Deux prédicats décident, les mêmes pour l'écriture et la
 * réconciliation : `isUnreadFor` (ce message est-il non lu pour ce lecteur ?)
 * et l'état du fil (actif, correspondant non bloqué).
 */
import { messagePreviewFor, type AttachmentInput } from "@antsia/social-contracts/attachments"
import { assertMessageContent } from "@antsia/social-contracts/messaging"

import type { Doc, Id } from "../../_generated/dataModel"
import type { MutationCtx, QueryCtx } from "../../_generated/server"
import { checked, fail, failRule, notFound } from "../../lib/errors"
import { isBlockedBetween } from "../graph/graph"
import { notifyPerson } from "../notifications/notify"
import { type DeclaredAttachment, type StoredAttachment, verifyDeclaredAttachments } from "./attachmentStorage"
import type { ForwardedFrom } from "./forwardedFrom"

type ReadCtx = Pick<QueryCtx, "db">
type WriteCtx = Pick<MutationCtx, "db">

/** La paire ORDONNÉE de personnes — point unique. */
export function sortPair(a: Id<"persons">, b: Id<"persons">): { personLow: Id<"persons">; personHigh: Id<"persons"> } {
  return a < b ? { personLow: a, personHigh: b } : { personLow: b, personHigh: a }
}

/** Le fil personnel entre ces deux personnes dans ce réseau, ou `null`. */
export async function findPersonalThread(ctx: ReadCtx, networkId: Id<"networks">, a: Id<"persons">, b: Id<"persons">): Promise<Doc<"personalThreads"> | null> {
  const { personLow, personHigh } = sortPair(a, b)
  return await ctx.db
    .query("personalThreads")
    .withIndex("by_network_pair", (q) => q.eq("networkId", networkId).eq("personLow", personLow).eq("personHigh", personHigh))
    .first()
}

/**
 * IC-09 — le fil à deux que désigne un avis `personal_message`, relu MAINTENANT pour son
 * destinataire : celui de la paire (destinataire, expéditeur) dans ce réseau, ACTIF, sans
 * blocage entre eux. `null` sinon (fil fermé, blocage, expéditeur effacé donc anonymisé) :
 * l'avis n'est alors ni écrit, ni montré, ni transporté, ni ouvert.
 */
export async function personalMessageNoticeThread(
  ctx: ReadCtx,
  networkId: Id<"networks">,
  recipientPersonId: Id<"persons">,
  senderPersonId: Id<"persons">,
): Promise<Doc<"personalThreads"> | null> {
  if (recipientPersonId === senderPersonId) return null
  const thread = await findPersonalThread(ctx, networkId, recipientPersonId, senderPersonId)
  if (thread === null || thread.status !== "active") return null
  if (await isBlockedBetween(ctx, recipientPersonId, senderPersonId)) return null
  return thread
}

/** L'autre participant, vu de moi — `null` si je ne suis pas partie au fil. */
export function otherParticipant(thread: Pick<Doc<"personalThreads">, "personLow" | "personHigh">, me: Id<"persons">): Id<"persons"> | null {
  if (thread.personLow === me) return thread.personHigh
  if (thread.personHigh === me) return thread.personLow
  return null
}

/** Ce message est-il caché POUR ce lecteur (suppression « pour moi ») ? */
export function isHiddenFor(message: Pick<Doc<"personalMessages">, "hiddenForPersonIds">, personId: Id<"persons">): boolean {
  return (message.hiddenForPersonIds ?? []).includes(personId)
}

/** Ce message est-il NON LU pour ce lecteur ? Ce qu'on ne montrera jamais ne se compte pas. */
export function isUnreadFor(message: Pick<Doc<"personalMessages">, "readAt" | "deletedAt" | "hiddenForPersonIds">, readerId: Id<"persons">): boolean {
  return message.readAt === undefined && message.deletedAt === undefined && !isHiddenFor(message, readerId)
}

/** Non-lus d'un fil pour MOI, bornés, sans balayer le fil : les messages de l'autre. */
export async function unreadForThread(ctx: ReadCtx, thread: Doc<"personalThreads">, readerId: Id<"persons">, cap: number): Promise<{ count: number; capped: boolean }> {
  const other = otherParticipant(thread, readerId)
  if (other === null) return { count: 0, capped: false }
  const rows = await ctx.db
    .query("personalMessages")
    .withIndex("by_thread_sender_read", (q) => q.eq("threadId", thread._id).eq("senderPersonId", other).eq("readAt", undefined))
    .take(cap + 1)
  const alive = rows.filter((row) => isUnreadFor(row, readerId))
  return { count: Math.min(alive.length, cap), capped: alive.length > cap }
}

// ═══════════════════════════════════════════════════════════════
// La pastille de non-lus — un document par (réseau, personne)
// ═══════════════════════════════════════════════════════════════

async function unreadTotalDoc(ctx: ReadCtx, networkId: Id<"networks">, personId: Id<"persons">): Promise<Doc<"unreadTotals"> | null> {
  // `.first()` et non `.unique()` : un doublon improbable ne doit pas faire lever toutes les lectures.
  return await ctx.db
    .query("unreadTotals")
    .withIndex("by_network_person", (q) => q.eq("networkId", networkId).eq("personId", personId))
    .first()
}

/** Les deux parts de la pastille : les fils 1:1 et les conversations de groupe (lot 11). */
export type UnreadPart = "personal" | "groups"

/** Une part de la pastille d'une personne dans un réseau — `0` sans document. */
export async function readUnreadPart(ctx: ReadCtx, networkId: Id<"networks">, personId: Id<"persons">, part: UnreadPart): Promise<number> {
  const doc = await unreadTotalDoc(ctx, networkId, personId)
  return doc === null ? 0 : Math.max(0, doc[part])
}

/** Déplacer une part de `delta`, clampée à zéro — le seul geste des points d'écriture. */
export async function adjustUnreadPart(ctx: WriteCtx, networkId: Id<"networks">, personId: Id<"persons">, part: UnreadPart, delta: number): Promise<number> {
  const doc = await unreadTotalDoc(ctx, networkId, personId)
  if (delta === 0) return doc === null ? 0 : Math.max(0, doc[part])
  const now = Date.now()
  if (doc === null) {
    const value = Math.max(0, delta)
    await ctx.db.insert("unreadTotals", { networkId, personId, personal: part === "personal" ? value : 0, groups: part === "groups" ? value : 0, updatedAt: now })
    return value
  }
  const value = Math.max(0, doc[part] + delta)
  await ctx.db.patch(doc._id, { [part]: value, updatedAt: now })
  return value
}

/** Poser une valeur ABSOLUE sur une part — réconciliation seulement. */
export async function setUnreadPart(ctx: WriteCtx, networkId: Id<"networks">, personId: Id<"persons">, part: UnreadPart, total: number): Promise<void> {
  const value = Math.max(0, Math.trunc(total))
  const doc = await unreadTotalDoc(ctx, networkId, personId)
  if (doc === null) {
    if (value > 0) await ctx.db.insert("unreadTotals", { networkId, personId, personal: part === "personal" ? value : 0, groups: part === "groups" ? value : 0, updatedAt: Date.now() })
    return
  }
  if (doc[part] !== value) await ctx.db.patch(doc._id, { [part]: value, updatedAt: Date.now() })
}

/** Le total des non-lus 1:1 d'une personne dans un réseau — `0` sans document. */
export async function readPersonalUnreadTotal(ctx: ReadCtx, networkId: Id<"networks">, personId: Id<"persons">): Promise<number> {
  return await readUnreadPart(ctx, networkId, personId, "personal")
}

/** Déplacer la part 1:1 de `delta`, clampée à zéro. */
export async function adjustPersonalUnreadTotal(ctx: WriteCtx, networkId: Id<"networks">, personId: Id<"persons">, delta: number): Promise<number> {
  return await adjustUnreadPart(ctx, networkId, personId, "personal", delta)
}

/** Poser une valeur ABSOLUE sur la part 1:1 — réconciliation seulement. */
export async function setPersonalUnreadTotal(ctx: WriteCtx, networkId: Id<"networks">, personId: Id<"persons">, total: number): Promise<void> {
  await setUnreadPart(ctx, networkId, personId, "personal", total)
}

/**
 * Le total RECALCULÉ par balayage — la référence du compteur (réconciliation,
 * tests). Borné deux fois ; `truncated` le dit plutôt que de mentir en silence.
 * Mêmes règles que les points d'écriture : fil actif, correspondant non bloqué.
 */
export async function recomputePersonalUnreadTotal(
  ctx: ReadCtx,
  networkId: Id<"networks">,
  personId: Id<"persons">,
  bounds: { threadScan: number; unreadScan: number },
): Promise<{ total: number; truncated: boolean }> {
  const [asLow, asHigh] = await Promise.all([
    ctx.db
      .query("personalThreads")
      .withIndex("by_network_low_lastMessageAt", (q) => q.eq("networkId", networkId).eq("personLow", personId))
      .take(bounds.threadScan),
    ctx.db
      .query("personalThreads")
      .withIndex("by_network_high_lastMessageAt", (q) => q.eq("networkId", networkId).eq("personHigh", personId))
      .take(bounds.threadScan),
  ])
  let truncated = asLow.length >= bounds.threadScan || asHigh.length >= bounds.threadScan
  let total = 0
  for (const thread of [...asLow, ...asHigh]) {
    if (thread.status !== "active") continue
    const other = otherParticipant(thread, personId)
    if (other === null || (await isBlockedBetween(ctx, personId, other))) continue
    const unread = await unreadForThread(ctx, thread, personId, bounds.unreadScan)
    total += unread.count
    if (unread.capped) truncated = true
  }
  return { total, truncated }
}

/** Bornes de la réconciliation au blocage : un fil très bavard ne fait pas une lecture non bornée. */
const BLOCK_UNREAD_SCAN = 500

/**
 * Le BLOCAGE déplace la pastille à l'écriture (D38 — le socle la corrigeait à
 * la lecture, borné à 100) : bloquer retire de chaque côté les non-lus du fil
 * de l'autre, dans chaque réseau ; débloquer les rend. Le fil d'un bloqué est
 * invisible et fermé à l'écriture : rien ne s'y accumule entre-temps.
 */
export async function onPairBlockChanged(ctx: MutationCtx, a: Id<"persons">, b: Id<"persons">, blocked: boolean): Promise<void> {
  const { personLow, personHigh } = sortPair(a, b)
  // borné : une paire a au plus un fil par réseau, et une personne appartient à peu de réseaux.
  const threads = await ctx.db
    .query("personalThreads")
    .withIndex("by_pair", (q) => q.eq("personLow", personLow).eq("personHigh", personHigh))
    .take(50)
  for (const thread of threads) {
    if (thread.status !== "active") continue
    for (const reader of [personLow, personHigh]) {
      const unread = await unreadForThread(ctx, thread, reader, BLOCK_UNREAD_SCAN)
      if (unread.count > 0) await adjustPersonalUnreadTotal(ctx, thread.networkId, reader, blocked ? -unread.count : unread.count)
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// Aperçu et ouverture d'un fil
// ═══════════════════════════════════════════════════════════════

/** Longueur de l'aperçu dénormalisé dans la liste des fils. */
export const PREVIEW_MAX_LENGTH = 100

/** Les colonnes d'aperçu d'un fil, pour un message (texte, vocal, pièces). */
export function previewColumns(text: string, files: readonly AttachmentInput[]): Pick<Doc<"personalThreads">, "lastMessageText" | "lastMessageKind" | "lastMessageAttachmentCount"> {
  const preview = messagePreviewFor(text, files)
  if (preview === null) return { lastMessageText: undefined, lastMessageKind: undefined, lastMessageAttachmentCount: undefined }
  if (preview.kind === "text") return { lastMessageText: preview.text.slice(0, PREVIEW_MAX_LENGTH), lastMessageKind: "text", lastMessageAttachmentCount: undefined }
  if (preview.kind === "voice") return { lastMessageText: undefined, lastMessageKind: "voice", lastMessageAttachmentCount: 1 }
  return { lastMessageText: undefined, lastMessageKind: "attachments", lastMessageAttachmentCount: preview.count }
}

/**
 * Le fil ACTIF de la paire dans le réseau : continué s'il existe, CRÉÉ sinon —
 * le seul chemin de création d'un fil. Les gardes de la porte (identifiant
 * publié, blocage, relation) sont posées AVANT, par l'appelant.
 */
export async function ensurePersonalThread(
  ctx: MutationCtx,
  networkId: Id<"networks">,
  initiatorPersonId: Id<"persons">,
  targetPersonId: Id<"persons">,
): Promise<{ thread: Doc<"personalThreads">; created: boolean }> {
  if (targetPersonId === initiatorPersonId) return failRule("THREAD_SELF")
  const existing = await findPersonalThread(ctx, networkId, initiatorPersonId, targetPersonId)
  if (existing !== null) {
    if (existing.status !== "active") return failRule("THREAD_ARCHIVED")
    return { thread: existing, created: false }
  }
  const threadId = await ctx.db.insert("personalThreads", {
    networkId,
    ...sortPair(initiatorPersonId, targetPersonId),
    initiatedByPersonId: initiatorPersonId,
    status: "active",
    createdAt: Date.now(),
  })
  const thread = await ctx.db.get(threadId)
  if (thread === null) return notFound()
  return { thread, created: true }
}

/** Une clé opaque bornée, commune au premier message et aux envois suivants. */
export function assertMessageIdempotencyKey(key: string | undefined): void {
  // Clés opaques existantes et UUID conservés, sans imposer un nouveau format.
  // Aucun caractère de contrôle, aucune clé vide, au plus 256 caractères.
  if (key !== undefined && (key.trim().length === 0 || key.length > 256 || Array.from(key).some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127))) fail("invalidArgument", { field: "idempotencyKey" })
}

/** Le message déjà déposé sous cette clé d'idempotence dans ce fil, ou `null`. */
export async function findIdempotentReplay(ctx: ReadCtx, threadId: Id<"personalThreads">, idempotencyKey: string | undefined): Promise<Doc<"personalMessages"> | null> {
  if (idempotencyKey === undefined) return null
  return await ctx.db
    .query("personalMessages")
    .withIndex("by_thread_idempotency", (q) => q.eq("threadId", threadId).eq("idempotencyKey", idempotencyKey))
    .first()
}

export type AppendMessageInput = {
  senderPersonId: Id<"persons">
  /** Contenu DÉJÀ jugé par le contrat (`assertMessageContent`). */
  content: string
  /** Pièces DÉJÀ vérifiées au stockage (`verifyDeclaredAttachments`). */
  attachmentFiles?: StoredAttachment[]
  replyToMessageId?: Id<"personalMessages">
  idempotencyKey?: string
  forwardedFrom?: ForwardedFrom
}

/**
 * Déposer un message texte dans un fil ACTIF — le seul point d'insertion, que
 * partagent l'envoi, l'ouverture et le transfert : la ligne, l'aperçu en
 * nature, un non-lu de plus dans la pastille de l'autre.
 */
export async function appendPersonalMessage(ctx: MutationCtx, thread: Doc<"personalThreads">, input: AppendMessageInput): Promise<Id<"personalMessages">> {
  const recipient = otherParticipant(thread, input.senderPersonId)
  if (recipient === null) return notFound()
  if (thread.status !== "active") return failRule("THREAD_ARCHIVED")
  const now = Date.now()
  const messageId = await ctx.db.insert("personalMessages", {
    networkId: thread.networkId,
    threadId: thread._id,
    senderPersonId: input.senderPersonId,
    ...(input.content.length > 0 ? { content: input.content } : {}),
    ...(input.attachmentFiles ? { attachmentFiles: input.attachmentFiles } : {}),
    ...(input.replyToMessageId ? { replyToMessageId: input.replyToMessageId } : {}),
    type: "text",
    ...(input.idempotencyKey !== undefined ? { idempotencyKey: input.idempotencyKey } : {}),
    ...(input.forwardedFrom ? { forwardedFrom: input.forwardedFrom } : {}),
    createdAt: now,
  })
  await ctx.db.patch(thread._id, { ...previewColumns(input.content, input.attachmentFiles ?? []), lastMessageAt: now, lastMessageByPersonId: input.senderPersonId })
  await adjustPersonalUnreadTotal(ctx, thread.networkId, recipient, 1)
  // IC-09 : la cloche NEUTRE du destinataire, par la porte unique — aucun sujet, aucun contenu :
  // la paire désigne le fil. Une ligne par fil (clé `genre|-|expéditeur`), rafraîchie à chaque
  // message ; seul le premier geste admet un push (règle de la porte). La porte refuse soi-même,
  // le blocage et le non-membre ; elle relit le fil (`personalMessageNoticeThread`).
  await notifyPerson(ctx, { networkId: thread.networkId, recipientPersonId: recipient, actorPersonId: input.senderPersonId, kind: "personal_message" })
  return messageId
}

export type OpenThreadInput = {
  network: Doc<"networks">
  initiatorPersonId: Id<"persons">
  targetPersonId: Id<"persons">
  initialMessage: string
  initialAttachmentFiles?: DeclaredAttachment[]
  /** Une intention initiale peut être rejouée après une réponse réseau perdue. */
  idempotencyKey?: string
}

/**
 * Ouvrir un fil personnel — ou le continuer s'il existe — et y déposer le
 * premier message, dont les pièces sont des dépôts NEUFS de l'initiateur.
 */
export async function openOrContinuePersonalThread(
  ctx: MutationCtx,
  input: OpenThreadInput,
): Promise<{ threadId: Id<"personalThreads">; messageId: Id<"personalMessages">; created: boolean }> {
  if (input.targetPersonId === input.initiatorPersonId) return failRule("THREAD_SELF")
  const { thread, created } = await ensurePersonalThread(ctx, input.network._id, input.initiatorPersonId, input.targetPersonId)
  assertMessageIdempotencyKey(input.idempotencyKey)
  // Les gardes réseau/relation/blocage précèdent cet appel. Un rejeu ne
  // réadmet pas des fichiers qui sont déjà rattachés au premier message.
  const replay = await findIdempotentReplay(ctx, thread._id, input.idempotencyKey)
  if (replay !== null) {
    if (replay.senderPersonId !== input.initiatorPersonId) return notFound()
    return { threadId: thread._id, messageId: replay._id, created: false }
  }
  const content = checked(() => assertMessageContent(input.initialMessage, (input.initialAttachmentFiles?.length ?? 0) > 0))
  const attachmentFiles = await verifyDeclaredAttachments(ctx, input.initialAttachmentFiles, {
    actorPersonId: input.initiatorPersonId,
    networkId: input.network._id,
    source: "message",
  })
  const messageId = await appendPersonalMessage(ctx, thread, {
    senderPersonId: input.initiatorPersonId,
    content,
    ...(attachmentFiles ? { attachmentFiles } : {}),
    ...(input.idempotencyKey !== undefined ? { idempotencyKey: input.idempotencyKey } : {}),
  })
  return { threadId: thread._id, messageId, created }
}
