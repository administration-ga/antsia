/** P10 : consentement privé et outbox de demande CRM ; aucun contact direct importé. */
import { defineTable } from "convex/server"
import { v } from "convex/values"

export const crmTransferState = v.union(v.literal("queued"), v.literal("submitting"), v.literal("submitted"), v.literal("withdrawal_pending"), v.literal("withdrawn"), v.literal("failed"))
export const commercialCrmTables = {
  shopCommerceBuyerSubjects: defineTable({
    networkId: v.id("networks"), personId: v.id("persons"), shopId: v.id("shops"), source: v.string(),
    environment: v.union(v.literal("sandbox"), v.literal("production")), subjectRef: v.string(), createdAt: v.number(),
  }).index("by_scope", ["networkId", "personId", "shopId", "source", "environment"]).index("by_person", ["personId"]),
  commercialCrmTransfers: defineTable({
    networkId: v.id("networks"), personId: v.id("persons"), threadId: v.id("commercialThreads"), shopId: v.id("shops"),
    source: v.string(), environment: v.union(v.literal("sandbox"), v.literal("production")), configFingerprint: v.string(), sessionId: v.optional(v.string()),
    // Origine figée du consentement ; les anciennes lignes sans liaison ne peuvent plus être envoyées.
    originLinkRef: v.optional(v.string()), originShopRef: v.optional(v.string()),
    authorizationAuthUserId: v.optional(v.string()), authorizedAt: v.optional(v.number()), authorizationUntil: v.optional(v.number()),
    authorizationRequired: v.optional(v.boolean()), leaseSessionId: v.optional(v.string()),
    unknownConfirmedAt: v.optional(v.number()), unknownRequestSha256: v.optional(v.string()),
    // Un retrait non confirmé reste dû, même après épuisement d'une série de tentatives.
    withdrawalNeedsAttention: v.optional(v.boolean()), withdrawalFailures: v.optional(v.number()),
    subjectRef: v.string(), conversationRef: v.string(), requestId: v.string(), requestSha256: v.string(),
    withdrawalBody: v.optional(v.string()), withdrawalExpiresAt: v.optional(v.number()),
    requestExpiresAt: v.number(), rawBody: v.optional(v.string()), idempotencyKey: v.string(), intentionSha256: v.string(),
    selectedText: v.optional(v.string()), displayName: v.optional(v.string()), textVersion: v.string(), consentedAt: v.number(),
    state: crmTransferState, revokedAt: v.optional(v.number()), dispatchedAt: v.optional(v.number()), inquiryRef: v.optional(v.string()), submittedAt: v.optional(v.number()),
    attempts: v.number(), nextAttemptAt: v.number(), generation: v.number(), leaseUntil: v.optional(v.number()),
    lastOutcome: v.optional(v.union(v.literal("unavailable"), v.literal("rejected"), v.literal("expired"))),
    createdAt: v.number(), updatedAt: v.number(),
  }).index("by_thread", ["threadId"]).index("by_person", ["personId"]).index("by_person_state", ["personId", "state"])
    .index("by_state_nextAttemptAt", ["state", "nextAttemptAt"]),
}
