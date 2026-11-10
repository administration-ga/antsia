// Dupliqué de socle/convex/functions/chats.ts (l. 1635-1726, `setPinnedMessage`, `getPinnedMessage`) @ ad2e7fdc2 — adaptations : participant, réseau et blocage par la garde du fil ; refus à code de règle ; l'expéditeur nommé par le contrat `counterpartLabel` (jamais d'e-mail) ; débit.
/**
 * LE message épinglé d'un fil — un seul : épingler remplace. Les deux
 * participants peuvent épingler ; l'épingle vit sur le fil, visible des deux.
 */
import { replyExcerpt } from "@antsia/social-contracts/attachments"
import type { CounterpartLabel } from "@antsia/social-contracts/counterpart"
import { v } from "convex/values"

import type { Id } from "../../_generated/dataModel"
import { failRule, notFound } from "../../lib/errors"
import { networkMutation, networkQuery } from "../../lib/functions"
import { enforceRateLimit } from "../../lib/rateLimit"
import { counterpartOf, isPersonalMessageServedTo, requireThread } from "./participation"

/** Épingler — ou désépingler (`messageId: null`). Idempotent. */
export const setPinnedMessage = networkMutation({
  minStatus: "declaree",
  args: { threadId: v.id("personalThreads"), messageId: v.union(v.id("personalMessages"), v.null()) },
  returns: v.object({ pinnedMessageId: v.union(v.id("personalMessages"), v.null()) }),
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, "message.edit", ctx.person._id)
    const { thread } = await requireThread(ctx, ctx.networkId, args.threadId, ctx.person._id)
    if (args.messageId === null) {
      if (thread.pinnedMessageId !== undefined) await ctx.db.patch(thread._id, { pinnedMessageId: undefined })
      return { pinnedMessageId: null }
    }
    const message = await ctx.db.get(args.messageId)
    // Un message d'un AUTRE fil et un message inconnu se disent pareil.
    if (!message || message.threadId !== thread._id) return notFound()
    if (message.type !== undefined && message.type !== "text") return failRule("MESSAGE_PIN_NOT_TEXT")
    if (message.deletedAt !== undefined) return failRule("MESSAGE_PIN_DELETED")
    if (thread.pinnedMessageId !== message._id) await ctx.db.patch(thread._id, { pinnedMessageId: message._id })
    return { pinnedMessageId: message._id }
  },
})

export type PinnedMessageDto = {
  messageId: Id<"personalMessages">
  senderPersonId: Id<"persons">
  sender: CounterpartLabel
  excerpt: string
  hasAttachments: boolean
}

/**
 * Le message épinglé, RELU — la bande d'en-tête de la conversation ouverte.
 * `null` sans épingle, ou quand son contenu ne peut plus être servi À CE
 * lecteur (retiré pour tous, masqué de sa vue).
 */
export const getPinnedMessage = networkQuery({
  args: { threadId: v.id("personalThreads") },
  handler: async (ctx, args): Promise<PinnedMessageDto | null> => {
    const { thread } = await requireThread(ctx, ctx.networkId, args.threadId, ctx.person._id)
    if (thread.pinnedMessageId === undefined) return null
    const message = await ctx.db.get(thread.pinnedMessageId)
    // MC-01 : retiré par la modération ou signalé par ce lecteur, il quitte aussi la bande d'en-tête.
    if (!message || message.threadId !== thread._id || message.deletedAt !== undefined || !(await isPersonalMessageServedTo(ctx, message, ctx.person._id))) return null
    return {
      messageId: message._id,
      senderPersonId: message.senderPersonId,
      sender: await counterpartOf(ctx, message.senderPersonId),
      excerpt: replyExcerpt(message.content),
      hasAttachments: (message.attachmentFiles ?? []).length > 0,
    }
  },
})
