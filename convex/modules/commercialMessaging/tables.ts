/** P10 : canal commercial autonome. Aucun pointeur vers personalThreads, aucun carnet CRM. */
import { defineTable } from "convex/server"
import { v } from "convex/values"

import { storedAttachmentValidator } from "../messaging/tables"

export const commercialStateValidator = v.union(v.literal("requested"), v.literal("accepted"), v.literal("declined"), v.literal("blocked"), v.literal("closed"))
export const commercialMessagingTables = {
  commercialThreads: defineTable({
    networkId: v.id("networks"), shopId: v.id("shops"), requesterPersonId: v.id("persons"),
    offerRef: v.optional(v.string()), conversationRef: v.string(), state: commercialStateValidator,
    /** L'état antérieur au premier blocage ; seul le dernier déblocage le restaure. */
    stateBeforeBlock: v.optional(v.union(v.literal("requested"), v.literal("accepted"), v.literal("declined"), v.literal("closed"))),
    revision: v.number(), buyerCallsAllowed: v.boolean(), assignedRespondentPersonId: v.optional(v.id("persons")),
    createdAt: v.number(), updatedAt: v.number(), lastMessageAt: v.number(), purgeAt: v.optional(v.number()),
  })
    .index("by_conversationRef", ["conversationRef"])
    .index("by_network_requester_activity", ["networkId", "requesterPersonId", "lastMessageAt"])
    .index("by_network_shop_activity", ["networkId", "shopId", "lastMessageAt"])
    .index("by_requester_shop_offer", ["networkId", "requesterPersonId", "shopId", "offerRef", "lastMessageAt"])
    .index("by_requester", ["requesterPersonId"])
    .index("by_shop", ["shopId"])
    .index("by_purgeAt", ["purgeAt"])
    .index("by_assignedRespondentPersonId", ["assignedRespondentPersonId"]),
  commercialMessages: defineTable({
    networkId: v.id("networks"), threadId: v.id("commercialThreads"), senderPersonId: v.id("persons"),
    senderKind: v.union(v.literal("requester"), v.literal("shop")), content: v.optional(v.string()),
    attachmentFiles: v.optional(v.array(storedAttachmentValidator)), idempotencyKey: v.string(), digest: v.string(),
    createdAt: v.number(), deletedAt: v.optional(v.number()),
  })
    .index("by_thread_createdAt", ["threadId", "createdAt"])
    .index("by_network_sender_key", ["networkId", "senderPersonId", "idempotencyKey"])
    .index("by_thread", ["threadId"])
    .index("by_sender", ["senderPersonId"]),
  shopContactMandates: defineTable({
    /** Origine de la boutique, jamais le réseau de lecture du demandeur. */
    networkId: v.id("networks"), shopId: v.id("shops"), personId: v.id("persons"),
    canRead: v.boolean(), canReply: v.boolean(), canDecide: v.boolean(), canCall: v.boolean(), revision: v.number(),
    acceptedAt: v.optional(v.number()), revokedAt: v.optional(v.number()), createdAt: v.number(), updatedAt: v.number(),
  }).index("by_shop_person", ["shopId", "personId"])
    .index("by_shop_revoked", ["shopId", "revokedAt"])
    .index("by_person_acceptance", ["personId", "revokedAt", "acceptedAt"])
    .index("by_person", ["personId"]),
  commercialBlocks: defineTable({
    networkId: v.id("networks"), threadId: v.id("commercialThreads"), personId: v.id("persons"),
    shopId: v.id("shops"), requesterPersonId: v.id("persons"),
    side: v.union(v.literal("requester"), v.literal("shop")), createdAt: v.number(),
  }).index("by_thread_side", ["threadId", "side"]).index("by_thread", ["threadId"]).index("by_person", ["personId"])
    .index("by_pair", ["networkId", "shopId", "requesterPersonId"])
    .index("by_pair_side", ["networkId", "shopId", "requesterPersonId", "side"])
    .index("by_requesterPersonId", ["requesterPersonId"]),
  commercialReadStates: defineTable({
    networkId: v.id("networks"), threadId: v.id("commercialThreads"), personId: v.id("persons"),
    readAt: v.optional(v.number()), callsAllowed: v.optional(v.boolean()), callConsentMandateRevision: v.optional(v.number()), updatedAt: v.number(),
  }).index("by_thread_person", ["threadId", "personId"]).index("by_thread", ["threadId"]).index("by_person", ["personId"]),
  shopContactSettings: defineTable({
    networkId: v.id("networks"), shopId: v.id("shops"), acceptRequests: v.boolean(),
    updatedAt: v.number(), updatedByPersonId: v.optional(v.id("persons")),
  }).index("by_shop", ["shopId"]).index("by_person", ["updatedByPersonId"]),
  commercialNetworkPolicies: defineTable({
    networkId: v.id("networks"), enabled: v.boolean(), updatedAt: v.number(), updatedByPersonId: v.optional(v.id("persons")),
  }).index("by_network", ["networkId"]).index("by_person", ["updatedByPersonId"]),
}
