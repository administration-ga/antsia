// Dupliqué de socle/convex/functions/chats.ts (l. 503-980 et 1378-1573 : `listMessages`, `paginateMessages`, `generateAttachmentUploadUrl`, `sendMessage`, `markReadBatchForParticipant`, `markRead`, `markReadBatch`, `deleteMessage`, `editMessage`, `deleteMessageForMe`) @ ad2e7fdc2 — adaptations : participant, réseau et BLOCAGE par la garde du fil (D13 : un bloqué n'écrit plus) ; `sendMessage` réécrit — adhésion par le constructeur, débit, contenu borné par le contrat, pièces vérifiées par la garde des fichiers (`verifyDeclaredAttachments`), aperçu en nature (D39 : jugé sur les pièces VÉRIFIÉES), pastille de l'autre, par le point d'insertion unique (`appendPersonalMessage`) ; `listMessages` (fenêtre par instant, ex æquo perdus) non recopiée, la pagination native seule ; push reporté (PA5, D20) ; standard et iAsted retirés ; un événement (appel, système) ne se modifie ni ne se retire ; retrait « pour tout le monde » rembobine l'aperçu sur le dernier message survivant ou l'efface (plus de « [Message supprimé] » écrit en base) et RETIRE le contenu (`undefined`, D37) ; refus à code.
/**
 * Les messages d'un fil personnel : lire, envoyer, marquer lu, modifier,
 * retirer pour tous, masquer pour soi.
 *
 * ⚠️ Deux suppressions, deux droits : retirer POUR TOUS est réservé à
 * l'expéditeur, dans la fenêtre d'édition ; masquer POUR MOI est ouvert à tout
 * participant, sans fenêtre, sans effet ailleurs. Les confondre donnerait à
 * n'importe qui le droit d'effacer le message d'un tiers.
 */
import { assertMessageContent, isWithinEditWindow, MESSAGE_EDIT_WINDOW_MS } from "@antsia/social-contracts/messaging"
import { paginationOptsValidator, type PaginationResult } from "convex/server"
import { v } from "convex/values"

import { internal } from "../../_generated/api"
import type { Doc, Id } from "../../_generated/dataModel"
import { internalMutation, type MutationCtx } from "../../_generated/server"
import { checked, failRule, notFound } from "../../lib/errors"
import { networkMutation, networkQuery } from "../../lib/functions"
import { enforceRateLimit } from "../../lib/rateLimit"
import { guardUploadUrl } from "../../lib/uploadPolicy"
import { attachmentFileValidator, verifyDeclaredAttachments } from "./attachmentStorage"
import { enrichMessagePage, isPersonalMessageServedTo, type MessageDto, requireSameThreadReply, requireThread } from "./participation"
import { adjustPersonalUnreadTotal, appendPersonalMessage, assertMessageIdempotencyKey, findIdempotentReplay, isHiddenFor, isUnreadFor, otherParticipant, previewColumns } from "./threads"

/** Marquage par lots bornés, poursuivi par continuation interne. */
const MARK_READ_BATCH = 100

/**
 * L'historique d'un fil, du plus récent au plus ancien, à curseur NATIF : aucun
 * message ne devient inatteignable, les ex æquo reposent sur le curseur total.
 * Un message masqué pour moi n'est pas servi (la page peut être plus courte).
 */
export const paginateMessages = networkQuery({
  args: { threadId: v.id("personalThreads"), paginationOpts: paginationOptsValidator },
  handler: async (ctx, args): Promise<PaginationResult<MessageDto>> => {
    const { thread } = await requireThread(ctx, ctx.networkId, args.threadId, ctx.person._id)
    const result = await ctx.db
      .query("personalMessages")
      .withIndex("by_thread_createdAt", (q) => q.eq("threadId", thread._id))
      .order("desc")
      .paginate(args.paginationOpts)
    // MC-01 : un message retiré par la modération, ou signalé par moi, n'est plus servi (comme un message masqué pour moi).
    const visible: Doc<"personalMessages">[] = []
    for (const message of result.page) if (await isPersonalMessageServedTo(ctx, message, ctx.person._id)) visible.push(message)
    return { ...result, page: await enrichMessagePage(ctx, thread, ctx.person._id, visible) }
  },
})

/**
 * URL de dépôt d'une pièce de conversation — le temps 1 de la politique de
 * dépôt ; le temps 2 (liste blanche, poids réel, analyse) est à l'envoi.
 */
export const generateAttachmentUploadUrl = networkMutation({
  minStatus: "declaree",
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    await enforceRateLimit(ctx, "upload.url", ctx.person._id)
    return await guardUploadUrl(ctx, "chat_attachment")
  },
})

/**
 * Envoyer un message dans un fil existant. Gardes : débit, participation sans
 * blocage, fil actif, contenu (vide seulement avec des pièces), idempotence
 * (la clé rejouée rend le message EXISTANT), citation du même fil, pièces
 * vérifiées au stockage. La pastille de l'autre compte un non-lu de plus.
 */
export const sendMessage = networkMutation({
  minStatus: "declaree",
  args: {
    threadId: v.id("personalThreads"),
    content: v.string(),
    attachmentFiles: v.optional(v.array(attachmentFileValidator)),
    replyToMessageId: v.optional(v.id("personalMessages")),
    idempotencyKey: v.optional(v.string()),
  },
  returns: v.object({ messageId: v.id("personalMessages"), deduplicated: v.boolean() }),
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, "message.send", ctx.person._id)
    const { thread } = await requireThread(ctx, ctx.networkId, args.threadId, ctx.person._id)
    if (thread.status !== "active") return failRule("THREAD_ARCHIVED")
    assertMessageIdempotencyKey(args.idempotencyKey)
    const replay = await findIdempotentReplay(ctx, thread._id, args.idempotencyKey)
    if (replay) {
      if (replay.senderPersonId !== ctx.person._id) return notFound()
      return { messageId: replay._id, deduplicated: true }
    }
    const content = checked(() => assertMessageContent(args.content, (args.attachmentFiles?.length ?? 0) > 0))
    const replyToMessageId = await requireSameThreadReply(ctx, thread._id, args.replyToMessageId)
    const attachmentFiles = await verifyDeclaredAttachments(ctx, args.attachmentFiles, { actorPersonId: ctx.person._id, networkId: ctx.networkId, source: "message" })
    const messageId = await appendPersonalMessage(ctx, thread, {
      senderPersonId: ctx.person._id,
      content,
      ...(attachmentFiles ? { attachmentFiles } : {}),
      ...(replyToMessageId ? { replyToMessageId } : {}),
      ...(args.idempotencyKey !== undefined ? { idempotencyKey: args.idempotencyKey } : {}),
    })
    return { messageId, deduplicated: false }
  },
})

/**
 * Marque lus les messages de l'AUTRE dans ce fil, par lots bornés ; la
 * pastille ne perd que ce qu'elle avait compté (un message retiré ou masqué
 * n'y était pas).
 */
async function markReadBatchForReader(ctx: MutationCtx, thread: Doc<"personalThreads">, readerId: Id<"persons">): Promise<number> {
  const other = otherParticipant(thread, readerId)
  if (other === null) return 0
  const unread = await ctx.db
    .query("personalMessages")
    .withIndex("by_thread_sender_read", (q) => q.eq("threadId", thread._id).eq("senderPersonId", other).eq("readAt", undefined))
    .take(MARK_READ_BATCH)
  const counted = thread.status === "active" ? unread.filter((message) => isUnreadFor(message, readerId)).length : 0
  const now = Date.now()
  for (const message of unread) await ctx.db.patch(message._id, { readAt: now })
  if (counted > 0) await adjustPersonalUnreadTotal(ctx, thread.networkId, readerId, -counted)
  if (unread.length === MARK_READ_BATCH) {
    await ctx.scheduler.runAfter(0, internal.modules.messaging.messages.markReadBatch, { threadId: thread._id, readerId })
  }
  return unread.length
}

/** Marquer lus les messages reçus dans un fil. */
export const markRead = networkMutation({
  minStatus: "en_attente",
  args: { threadId: v.id("personalThreads") },
  returns: v.object({ markedCount: v.number() }),
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, "message.read", ctx.person._id)
    const { thread } = await requireThread(ctx, ctx.networkId, args.threadId, ctx.person._id)
    return { markedCount: await markReadBatchForReader(ctx, thread, ctx.person._id) }
  },
})

/** Suite interne bornée de `markRead` pour les conversations volumineuses. */
export const markReadBatch = internalMutation({
  args: { threadId: v.id("personalThreads"), readerId: v.id("persons") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const thread = await ctx.db.get(args.threadId)
    if (thread) await markReadBatchForReader(ctx, thread, args.readerId)
    return null
  },
})

/** Le message, dans un fil de CE réseau où je suis partie sans blocage — sinon le refus indistinct. */
async function requireMessage(ctx: MutationCtx & { networkId: Id<"networks"> }, messageId: Id<"personalMessages">, personId: Id<"persons">) {
  const message = await ctx.db.get(messageId)
  if (!message) return notFound()
  const { thread, otherPersonId } = await requireThread(ctx, ctx.networkId, message.threadId, personId)
  return { message, thread, otherPersonId }
}

/**
 * Retirer MON message POUR TOUT LE MONDE, dans la fenêtre d'édition. La ligne
 * demeure (`deletedAt`, contenu vidé) ; l'épingle tombe ; un non-lu de l'autre
 * sort de sa pastille ; l'aperçu se rembobine sur le dernier survivant.
 */
export const deleteMessage = networkMutation({
  minStatus: "en_attente",
  args: { messageId: v.id("personalMessages") },
  returns: v.object({ deleted: v.literal(true), alreadyDeleted: v.boolean() }),
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, "message.edit", ctx.person._id)
    const { message, thread, otherPersonId } = await requireMessage(ctx, args.messageId, ctx.person._id)
    if (message.senderPersonId !== ctx.person._id) return notFound()
    if (message.type !== undefined && message.type !== "text") return failRule("MESSAGE_NOT_EDITABLE")
    if (message.deletedAt !== undefined) return { deleted: true as const, alreadyDeleted: true }
    const now = Date.now()
    if (!isWithinEditWindow(message.createdAt, now)) return failRule("MESSAGE_EDIT_WINDOW_EXPIRED", { minutes: MESSAGE_EDIT_WINDOW_MS / 60_000 })
    await ctx.db.patch(message._id, { deletedAt: now, content: undefined })
    if (thread.pinnedMessageId === message._id) await ctx.db.patch(thread._id, { pinnedMessageId: undefined })
    if (thread.status === "active" && isUnreadFor(message, otherPersonId)) await adjustPersonalUnreadTotal(ctx, ctx.networkId, otherPersonId, -1)
    if (thread.lastMessageAt === message.createdAt) {
      const recent = await ctx.db
        .query("personalMessages")
        .withIndex("by_thread_createdAt", (q) => q.eq("threadId", thread._id))
        .order("desc")
        .take(5)
      const survivor = recent.find((row) => row._id !== message._id && row.deletedAt === undefined)
      await ctx.db.patch(
        thread._id,
        survivor
          ? { ...previewColumns(survivor.content ?? "", survivor.attachmentFiles ?? []), lastMessageAt: survivor.createdAt, lastMessageByPersonId: survivor.senderPersonId }
          : { lastMessageText: undefined, lastMessageKind: undefined, lastMessageAttachmentCount: undefined },
      )
    }
    return { deleted: true as const, alreadyDeleted: false }
  },
})

/** Modifier MON message dans la fenêtre d'édition ; l'aperçu suit s'il était le dernier. */
export const editMessage = networkMutation({
  minStatus: "declaree",
  args: { messageId: v.id("personalMessages"), content: v.string() },
  returns: v.object({ editedAt: v.number() }),
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, "message.edit", ctx.person._id)
    const { message, thread } = await requireMessage(ctx, args.messageId, ctx.person._id)
    if (message.senderPersonId !== ctx.person._id) return notFound()
    if (message.type !== undefined && message.type !== "text") return failRule("MESSAGE_NOT_EDITABLE")
    if (message.deletedAt !== undefined) return failRule("MESSAGE_ALREADY_DELETED")
    const now = Date.now()
    if (!isWithinEditWindow(message.createdAt, now)) return failRule("MESSAGE_EDIT_WINDOW_EXPIRED", { minutes: MESSAGE_EDIT_WINDOW_MS / 60_000 })
    const content = checked(() => assertMessageContent(args.content, false))
    await ctx.db.patch(message._id, { content, editedAt: now })
    if (thread.lastMessageAt === message.createdAt) await ctx.db.patch(thread._id, previewColumns(content, message.attachmentFiles ?? []))
    return { editedAt: now }
  },
})

/**
 * Retirer un message DE MA VUE — jamais de celle de l'autre. Ouvert à tout
 * participant, sans fenêtre. Idempotent. Un non-lu masqué sort de ma pastille.
 */
export const deleteMessageForMe = networkMutation({
  minStatus: "en_attente",
  args: { messageId: v.id("personalMessages") },
  returns: v.object({ hidden: v.literal(true) }),
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, "message.edit", ctx.person._id)
    const { message, thread } = await requireMessage(ctx, args.messageId, ctx.person._id)
    if (isHiddenFor(message, ctx.person._id)) return { hidden: true as const }
    await ctx.db.patch(message._id, { hiddenForPersonIds: [...(message.hiddenForPersonIds ?? []), ctx.person._id] })
    if (thread.status === "active" && message.senderPersonId !== ctx.person._id && isUnreadFor(message, ctx.person._id)) {
      await adjustPersonalUnreadTotal(ctx, ctx.networkId, ctx.person._id, -1)
    }
    return { hidden: true as const }
  },
})
