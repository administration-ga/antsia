/** P11 : corps privés transitoires et reçus acheteur durables, sans catalogue ni paiement. */
import { COMMERCE_ENVIRONMENTS } from "@antsia/social-domain/commerce/primitives"
import { defineTable } from "convex/server"
import { v } from "convex/values"

import { literals } from "../../lib/validators"
import { checkoutFeeValidator, checkoutLineValidator, checkoutMoneyValidator, checkoutOptionsValidator, checkoutResultValidator, checkoutStateValidator } from "./checkoutRules"

export const checkoutAuthorityFields = {
  networkId: v.id("networks"), shopId: v.id("shops"), personId: v.id("persons"), handle: v.string(), sessionDigest: v.string(), configFingerprint: v.string(), source: v.string(), environment: literals(COMMERCE_ENVIRONMENTS),
  mappingId: v.id("commerceCatalogMappings"), mappingGeneration: v.number(), parentActivationRevision: v.number(), linkRef: v.string(), shopRef: v.string(), subjectRef: v.string(),
}
export const checkoutTables = {
  /** Barrière anti-rejeu durable : aucune adresse, corps, prix ni consentement. Effacement seul. */
  checkoutClientIntentFences: defineTable({ networkId: v.id("networks"), personId: v.id("persons"), clientRequestId: v.string(), stoppedAt: v.number() }).index("by_client", ["personId", "networkId", "clientRequestId"]),
  shopCheckoutPolicies: defineTable({ networkId: v.id("networks"), enabled: v.boolean(), updatedAt: v.number(), updatedByPersonId: v.optional(v.id("persons")) }).index("by_network", ["networkId"])
    .index("by_updatedByPersonId", ["updatedByPersonId"]),
  checkoutAttempts: defineTable({
    ...checkoutAuthorityFields, attemptId: v.string(), clientRequestId: v.string(), intentDigest: v.string(), state: checkoutStateValidator,
    requestId: v.string(), bodySha256: v.string(), rawBody: v.optional(v.string()), issuedAt: v.number(), requestExpiresAt: v.number(), privateUntil: v.number(), privatePurgedAt: v.optional(v.number()),
    expectedLines: v.array(checkoutLineValidator), expectedFees: v.array(checkoutFeeValidator), expectedPolicyVersion: v.number(), acceptedTotal: v.optional(checkoutMoneyValidator), consentedAt: v.number(), consentTextVersion: v.string(), result: v.optional(checkoutResultValidator), checkoutRef: v.optional(v.string()), reason: v.optional(v.string()),
    controlRevision: v.optional(v.number()), lastLookupAt: v.optional(v.number()), lookupState: v.optional(v.union(v.literal("unknown"), v.literal("in_progress"), v.literal("completed"))), leaseToken: v.optional(v.string()), leaseUntil: v.optional(v.number()), cancelledAt: v.optional(v.number()), reconfirmedByAttemptId: v.optional(v.string()),
    blocksUntil: v.number(), createdAt: v.number(), updatedAt: v.number(),
  }).index("by_attempt", ["attemptId"]).index("by_person_network", ["personId", "networkId"]).index("by_person_cancelled", ["personId", "cancelledAt"]).index("by_person_shop", ["personId", "networkId", "shopId"]).index("by_person_shop_blocks", ["personId", "networkId", "shopId", "blocksUntil"]).index("by_client", ["personId", "networkId", "clientRequestId"]).index("by_private_until", ["privateUntil"]).index("by_purged_private_until", ["privatePurgedAt", "privateUntil"]),
  checkoutRequests: defineTable({
    ...checkoutAuthorityFields, requestId: v.string(), kind: v.union(v.literal("options"), v.literal("status"), v.literal("release"), v.literal("request_status")), attemptId: v.optional(v.string()),
    bodySha256: v.string(), rawBody: v.optional(v.string()), expiresAt: v.number(), privateUntil: v.number(), privatePurgedAt: v.optional(v.number()), leaseToken: v.optional(v.string()), leaseUntil: v.optional(v.number()),
    options: v.optional(checkoutOptionsValidator), completedAt: v.optional(v.number()), cancelledAt: v.optional(v.number()), createdAt: v.number(),
  }).index("by_request", ["requestId"]).index("by_person", ["personId"]).index("by_person_cancelled", ["personId", "cancelledAt"]).index("by_private_until", ["privateUntil"]).index("by_purged_private_until", ["privatePurgedAt", "privateUntil"]),
}
