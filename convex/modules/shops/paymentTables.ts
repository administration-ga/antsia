/** P12 : aucun jeton fournisseur ni instrument de paiement dans ANTSIA. */
import { defineTable } from "convex/server"
import { v } from "convex/values"
import { checkoutMoneyValidator } from "./checkoutRules"
import { paymentActionValidator, paymentLocalStateValidator, paymentOptionsValidator, paymentSnapshotValidator } from "./paymentRules"

export const paymentScopeFields = {
  networkId: v.id("networks"), personId: v.id("persons"), shopId: v.id("shops"), checkoutAttemptId: v.string(), checkoutRef: v.string(), handle: v.string(),
  sessionDigest: v.string(), configFingerprint: v.string(), source: v.string(), environment: v.union(v.literal("sandbox"), v.literal("production")), shopRef: v.string(), subjectRef: v.string(),
}
export const paymentTables = {
  shopPaymentPolicies: defineTable({ networkId: v.id("networks"), enabled: v.boolean(), updatedAt: v.number(), updatedByPersonId: v.optional(v.id("persons")) }).index("by_network", ["networkId"])
    .index("by_updatedByPersonId", ["updatedByPersonId"]),
  shopPaymentOptions: defineTable({ ...paymentScopeFields, options: paymentOptionsValidator, observedAt: v.number(), validUntil: v.number() }).index("by_person_checkout", ["personId", "networkId", "checkoutAttemptId"]).index("by_person", ["personId"]).index("by_validUntil", ["validUntil"]),
  shopPaymentAttempts: defineTable({
    ...paymentScopeFields, paymentAttemptId: v.string(), clientRequestId: v.string(), readinessRef: v.string(), intentionSha256: v.string(),
    amount: checkoutMoneyValidator, consentedAt: v.number(), consentTextVersion: v.string(), state: paymentLocalStateValidator,
    requestId: v.string(), requestSha256: v.string(), rawBody: v.optional(v.string()), issuedAt: v.number(), requestExpiresAt: v.number(), privateUntil: v.number(),
    leaseToken: v.optional(v.string()), leaseUntil: v.optional(v.number()), generation: v.number(), dispatchedAt: v.optional(v.number()), authorizationExpiresAt: v.optional(v.number()), lastLookupAt: v.optional(v.number()), lookupState: v.optional(v.union(v.literal("unknown"), v.literal("in_progress"), v.literal("completed"))), privatePurgedAt: v.optional(v.number()),
    paymentRef: v.optional(v.string()), orderRef: v.optional(v.string()), paymentState: v.optional(v.union(v.literal("pending"), v.literal("requires_action"), v.literal("processing"), v.literal("succeeded"), v.literal("failed"), v.literal("cancelled"))), startAction: v.optional(paymentActionValidator), snapshot: v.optional(paymentSnapshotValidator), observedAt: v.optional(v.number()), reason: v.optional(v.string()),
    privacyRevokedAt: v.optional(v.number()), createdAt: v.number(), updatedAt: v.number(),
  }).index("by_attempt", ["paymentAttemptId"]).index("by_person_checkout", ["personId", "networkId", "checkoutAttemptId"]).index("by_person_network", ["personId", "networkId"]).index("by_person", ["personId"]).index("by_person_revoked", ["personId", "privacyRevokedAt"]).index("by_client", ["personId", "networkId", "clientRequestId"]).index("by_privateUntil", ["privatePurgedAt", "privateUntil"]),
  shopPaymentRequests: defineTable({
    ...paymentScopeFields, paymentAttemptId: v.optional(v.string()), kind: v.union(v.literal("options"), v.literal("authorize_start"), v.literal("request_status"), v.literal("status"), v.literal("refund_request")),
    requestId: v.string(), rawBody: v.optional(v.string()), bodySha256: v.string(), leaseToken: v.string(), leaseUntil: v.number(), generation: v.number(), doneAt: v.optional(v.number()), expiresAt: v.number(), privateUntil: v.number(), createdAt: v.number(), clientRequestId: v.optional(v.string()), intentionSha256: v.optional(v.string()),
  }).index("by_request", ["requestId"]).index("by_person", ["personId"]).index("by_privateUntil", ["privateUntil"]).index("by_client", ["personId", "networkId", "kind", "clientRequestId"]),
}
