// Dupliqué de socle/convex/functions/chats.ts (l. 118-320 : `validateParticipation`, `requireSameChatReply`, `isDeletedForUser`, `projectChatReplyTo`, `enrichChatMessagePage`) @ ad2e7fdc2 — adaptations : participant ET réseau (le fil appartient au réseau de la fonction appelée) ; un BLOCAGE entre les deux participants ferme le fil (refus indistinct, D13) ; postes et fils standard retirés ; DTO ALLOWLISTÉ (plus de `...message` : ni identifiant de stockage, ni clé d'idempotence, ni liste de masquage), expéditeur nommé par le contrat `counterpartLabel` (profil publié, sinon nom choisi — plus après une demande d'effacement —, jamais d'e-mail — D21) ; pièces par la garde des fichiers (URL ou retenue nommée) ; réponse citée et provenance relues. ; IC-04 : accusé « Lu » servi à l'expéditeur seulement si les DEUX personnes du fil ont laissé leurs accusés de lecture actifs (`readReceiptsServed`, réciprocité).
/**
 * La garde d'un fil personnel et la projection de ses messages.
 *
 * Être partie au fil, dans CE réseau, sans blocage entre les deux : sinon le
 * même refus que pour un fil inventé — un fil n'est pas un oracle.
 */
import type { MediaWithheld } from "@antsia/social-contracts/media"
import { replyExcerpt } from "@antsia/social-contracts/attachments"
import { type CounterpartLabel, counterpartLabel } from "@antsia/social-contracts/counterpart"
import { emptyMessageReactionCounts, type MessageReactionCounts, type MessageReactionKind } from "@antsia/social-contracts/messageReactions"
import { deletedAccountReply, type MessageReplyQuote } from "@antsia/social-contracts/messaging"

import type { Doc, Id } from "../../_generated/dataModel"
import type { QueryCtx } from "../../_generated/server"
import { notFound } from "../../lib/errors"
import { readReceiptsEnabledFor } from "../calls/preferences"
import { resolveFileDelivery, withheldCodeOf } from "../files/storageGuard"
import { isBlockedBetween } from "../graph/graph"
import { miniProfileCache, type PersonMiniProfile, publishedMiniProfile } from "../people/miniProfile"
import type { StoredAttachment } from "./attachmentStorage"
import { isForwardedOriginAlive } from "./forwardedFrom"
import { isHiddenFor, otherParticipant } from "./threads"

type ReadCtx = Pick<QueryCtx, "db">

/** MES réactions sur une conversation, lues UNE fois par page — jamais par message. */
const MY_REACTIONS_SCAN = 200

/**
 * Le fil, si j'y suis partie dans CE réseau et qu'aucun blocage ne nous
 * sépare ; sinon le refus indistinct. Rend aussi l'autre participant.
 */
export async function requireThread(
  ctx: ReadCtx,
  networkId: Id<"networks">,
  threadId: Id<"personalThreads">,
  personId: Id<"persons">,
): Promise<{ thread: Doc<"personalThreads">; otherPersonId: Id<"persons"> }> {
  const thread = await ctx.db.get(threadId)
  if (!thread || thread.networkId !== networkId) return notFound()
  const otherPersonId = otherParticipant(thread, personId)
  if (otherPersonId === null) return notFound()
  if (await isBlockedBetween(ctx, personId, otherPersonId)) return notFound()
  return { thread, otherPersonId }
}

/**
 * Le message CITÉ doit appartenir AU MÊME fil — sinon citer l'identifiant d'un
 * message d'ailleurs ferait relire son extrait sous la garde du fil courant.
 */
export async function requireSameThreadReply(
  ctx: ReadCtx,
  threadId: Id<"personalThreads">,
  replyToMessageId: Id<"personalMessages"> | undefined,
): Promise<Id<"personalMessages"> | undefined> {
  if (replyToMessageId === undefined) return undefined
  const cited = await ctx.db.get(replyToMessageId)
  if (!cited || cited.threadId !== threadId) return notFound()
  return replyToMessageId
}

export type ReplyToDto = MessageReplyQuote<Id<"personalMessages">, Id<"persons">>

/**
 * L'aperçu d'un message cité, RELU : retiré pour tous ou masqué pour moi, il
 * ne ressurgit pas dans la citation d'un tiers — `deleted` et pas un mot.
 */
export async function projectReplyTo(ctx: ReadCtx, replyToMessageId: Id<"personalMessages"> | undefined, readerId: Id<"persons">, authorDeleted = false): Promise<ReplyToDto | null> {
  if (authorDeleted) return deletedAccountReply()
  if (replyToMessageId === undefined) return null
  const cited = await ctx.db.get(replyToMessageId)
  if (!cited) return null
  const deleted = cited.deletedAt !== undefined || isHiddenFor(cited, readerId)
  return { messageId: cited._id, senderPersonId: cited.senderPersonId, excerpt: deleted ? "" : replyExcerpt(cited.content), deleted }
}

export type AttachmentDto = {
  filename: string
  mimeType: string
  sizeBytes: number
  durationMs: number | null
  /** URL servie par la garde des fichiers ; `null` tant que le fichier est retenu. */
  url: string | null
  withheld: MediaWithheld | null
}

export type MessageDto = {
  messageId: Id<"personalMessages">
  senderPersonId: Id<"persons">
  sender: CounterpartLabel
  isMine: boolean
  type: "text" | "system" | "call_started" | "call_ended"
  /** `null` : pièces seules, ou message retiré pour tous. */
  content: string | null
  deleted: boolean
  attachmentFiles: AttachmentDto[]
  replyTo: ReplyToDto | null
  reactions: { counts: MessageReactionCounts; mine: MessageReactionKind | null }
  /** « Transféré » — relu : l'original retiré emporte la marque. */
  forwarded: boolean
  createdAt: number
  editedAt: number | null
  /** Lu par l'autre — l'accusé n'a de sens que pour MES messages, et n'est servi que si les deux personnes les ont actifs (IC-04). */
  readAt: number | null
}

type ProfileCtx = Pick<QueryCtx, "db" | "storage">

/**
 * Nommer UNE personne vue d'un fil : profil publié, sinon le nom qu'elle a
 * CHOISI — plus après une demande d'effacement —, sinon le libellé neutre.
 */
export async function counterpartOf(
  ctx: ProfileCtx,
  personId: Id<"persons">,
  profileOf: (id: Id<"persons">) => Promise<PersonMiniProfile> = (id) => publishedMiniProfile(ctx, id),
): Promise<CounterpartLabel> {
  const [published, person] = await Promise.all([profileOf(personId), ctx.db.get(personId)])
  return counterpartLabel(published, person !== null && person.deletionRequestedAt === undefined ? person : null)
}

/** Nommer les expéditeurs d'une page, chacun une fois. */
function senderLabels(ctx: ProfileCtx) {
  const profileOf = miniProfileCache(ctx)
  const cache = new Map<string, CounterpartLabel>()
  return async (personId: Id<"persons">): Promise<CounterpartLabel> => {
    const hit = cache.get(personId)
    if (hit) return hit
    const label = await counterpartOf(ctx, personId, profileOf)
    cache.set(personId, label)
    return label
  }
}

/** Les pièces d'un message, servies par la garde des fichiers (URL, ou retenue nommée). */
export async function deliverAttachments(ctx: Pick<QueryCtx, "db" | "storage">, files: readonly StoredAttachment[]): Promise<AttachmentDto[]> {
  const out: AttachmentDto[] = []
  for (const file of files) {
    const delivery = await resolveFileDelivery(ctx, file.storageId)
    out.push({
      filename: file.filename,
      mimeType: file.mimeType,
      sizeBytes: file.sizeBytes,
      durationMs: file.durationMs ?? null,
      url: delivery.url,
      withheld: withheldCodeOf(delivery.scan),
    })
  }
  return out
}

/**
 * IC-04 — les accusés de lecture sont RÉCIPROQUES : le « Lu » d'un fil à deux n'est servi au lecteur
 * que si lui ET l'autre personne les ont laissés actifs. Qui les coupe n'en émet plus (l'autre ne
 * voit plus quand il lit) et n'en voit plus (il ne sait plus quand l'autre lit). Les lectures restent
 * enregistrées (`readAt`, pastille du lecteur) : elles cessent seulement d'être servies, et
 * reviennent si les deux les rallument. Le réglage de l'autre ne se lit qu'à travers ce « Lu »
 * absent, indistinct d'un message pas encore lu.
 */
export async function readReceiptsServed(ctx: Pick<QueryCtx, "db">, thread: Doc<"personalThreads">, readerId: Id<"persons">): Promise<boolean> {
  const other = otherParticipant(thread, readerId)
  if (other === null) return false
  if (!(await readReceiptsEnabledFor(ctx, readerId))) return false
  return await readReceiptsEnabledFor(ctx, other)
}

/** Projette UNE page bornée de messages — la seule projection, partagée par toutes les lectures. */
export async function enrichMessagePage(ctx: QueryCtx, thread: Doc<"personalThreads">, readerId: Id<"persons">, messages: readonly Doc<"personalMessages">[]): Promise<MessageDto[]> {
  const receiptsServed = await readReceiptsServed(ctx, thread, readerId)
  const myReactionRows = await ctx.db
    .query("personalMessageReactions")
    .withIndex("by_thread_and_person", (q) => q.eq("threadId", thread._id).eq("personId", readerId))
    .take(MY_REACTIONS_SCAN)
  const mine = new Map<string, MessageReactionKind>(myReactionRows.map((row) => [row.messageId, row.kind]))
  const labelOf = senderLabels(ctx)
  const out: MessageDto[] = []
  for (const message of messages) {
    const deleted = message.deletedAt !== undefined
    const attachmentFiles = deleted ? [] : await deliverAttachments(ctx, message.attachmentFiles ?? [])
    out.push({
      messageId: message._id,
      senderPersonId: message.senderPersonId,
      sender: await labelOf(message.senderPersonId),
      isMine: message.senderPersonId === readerId,
      type: message.type ?? "text",
      content: deleted ? null : (message.content ?? null),
      deleted,
      attachmentFiles,
      replyTo: await projectReplyTo(ctx, message.replyToMessageId, readerId, message.replyToDeletedAccount === true),
      reactions: { counts: message.reactionCounts ?? emptyMessageReactionCounts(), mine: mine.get(message._id) ?? null },
      forwarded: await isForwardedOriginAlive(ctx, message.forwardedFrom),
      createdAt: message.createdAt,
      editedAt: message.editedAt ?? null,
      readAt: message.senderPersonId === readerId && receiptsServed ? (message.readAt ?? null) : null,
    })
  }
  return out
}
