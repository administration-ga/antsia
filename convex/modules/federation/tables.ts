// Dupliqué de socle/convex/modules/reseau/federationTables.ts @ 25398f565 — adaptations : réseaux du moteur, émetteur/environnement, empreinte du corps exact, payload borné signé, aucun graphe externe créé ; PA9A ajoute révision et tombe des pages reflétées.
import { FEDERATION_ENVIRONMENTS } from "@antsia/social-domain/federationProtocol"
import { defineTable } from "convex/server"
import { v } from "convex/values"

import { literals } from "../../lib/validators"
import { federationMediaValidator } from "./mediaValidators"

export const federationEnvironmentValidator = literals(FEDERATION_ENVIRONMENTS)
export const federationReceiptStatusValidator = v.union(v.literal("received"), v.literal("applied"), v.literal("dead_letter"), v.literal("discarded"))
export const federationApplicationStatusValidator = v.union(v.literal("received"), v.literal("applied"), v.literal("rejected"))
export const federationFailureValidator = v.union(
  v.literal("unsupported_contract"), v.literal("contract_not_allowed"),
  v.literal("invalid_payload"), v.literal("unsupported_event"),
  v.literal("unsupported_media"), v.literal("source_conflict"),
  v.literal("consent_required"), v.literal("identity_not_linked"),
  // CM-02 : offre de catégorie interdite, lettre morte sans corps (`isContentFreeFederationFailure`).
  v.literal("prohibited_category"),
)

export const federationTables = {
  /** Accord personnel : supprimé avec la personne, jamais une tombe transport partagée. */
  federationAgentGrants: defineTable({
    networkId: v.id("networks"), personId: v.id("persons"), emitterId: v.id("federationEmitters"),
    environment: federationEnvironmentValidator, subjectDigest: v.string(),
    consentRef: v.string(), agentRef: v.string(), consentId: v.id("consents"), generation: v.number(),
    grantedAt: v.number(), revokedAt: v.optional(v.number()),
    status: v.union(v.literal("waiting"), v.literal("active"), v.literal("revoked")),
    sourceRevision: v.optional(v.number()), sourceDigest: v.optional(v.string()), sourceConsentedAt: v.optional(v.number()),
    orgRef: v.optional(v.string()), roleLabel: v.optional(v.string()),
    identityLinkId: v.optional(v.id("identityLinks")), membershipId: v.optional(v.id("networkMemberships")),
    transferTokenHash: v.optional(v.string()), transferExpiresAt: v.optional(v.number()),
    transferUsedAt: v.optional(v.number()), transferRevision: v.optional(v.number()),
    createdAt: v.number(), updatedAt: v.number(),
  }).index("by_person", ["personId"])
    .index("by_person_network", ["personId", "networkId"])
    .index("by_agent_ref", ["agentRef"])
    .index("by_transfer_token_hash", ["transferTokenHash"]),
  federationEmitters: defineTable({
    networkId: v.id("networks"), slug: v.string(), environment: federationEnvironmentValidator,
    enabled: v.boolean(), keyEnvName: v.string(), allowedContracts: v.array(v.string()),
    revision: v.number(), createdAt: v.number(), updatedAt: v.number(),
  }).index("by_slug_environment", ["slug", "environment"]).index("by_key_env", ["keyEnvName"]).index("by_network", ["networkId"]),

  federationInboxReceipts: defineTable({
    networkId: v.id("networks"), emitterId: v.id("federationEmitters"), environment: federationEnvironmentValidator,
    eventId: v.string(), contract: v.string(), version: v.literal(1), objectRef: v.string(), bodySha256: v.string(),
    status: federationReceiptStatusValidator, receivedAt: v.number(), updatedAt: v.number(),
  }).index("by_emitter_environment_event", ["emitterId", "environment", "eventId"]).index("by_network_receivedAt", ["networkId", "receivedAt"]),

  federationDeadLetters: defineTable({
    networkId: v.id("networks"), emitterId: v.id("federationEmitters"), environment: federationEnvironmentValidator,
    receiptId: v.id("federationInboxReceipts"), eventId: v.string(), contract: v.string(), objectRef: v.string(),
    bodySha256: v.string(), rawBody: v.string(), reason: federationFailureValidator,
    status: v.union(v.literal("dead_letter"), v.literal("resolved")), attempts: v.number(),
    firstFailedAt: v.number(), lastAttemptAt: v.number(), resolvedAt: v.optional(v.number()),
  }).index("by_receipt", ["receiptId"]).index("by_network_status_failedAt", ["networkId", "status", "firstFailedAt"]),

  federationReplayAudit: defineTable({
    networkId: v.id("networks"), emitterId: v.id("federationEmitters"), environment: federationEnvironmentValidator,
    deadLetterId: v.id("federationDeadLetters"), eventId: v.string(), requestedByPersonId: v.id("persons"),
    reason: v.string(), outcome: v.union(v.literal("deduplicated"), v.literal("still_failing"), v.literal("applied"), v.literal("discarded")), requestedAt: v.number(),
  }).index("by_dead_letter_at", ["deadLetterId", "requestedAt"]).index("by_network_at", ["networkId", "requestedAt"]),

  /** Les tombes sans objet local ferment une remise en ligne par révision ancienne. */
  mirrors: defineTable({
    networkId: v.id("networks"), emitterId: v.id("federationEmitters"), environment: federationEnvironmentValidator,
    contract: v.string(), objectRef: v.string(), localTable: v.union(v.literal("pages"), v.literal("posts"), v.literal("persons")),
    localId: v.optional(v.string()), updatedAt: v.number(),
    sourceRevision: v.optional(v.number()), sourceDigest: v.optional(v.string()),
    sourceVerifiedAt: v.optional(v.number()),
    sourceState: v.optional(v.union(v.literal("active"), v.literal("withdrawn"))),
    parentObjectRef: v.optional(v.string()),
    parentSourceRevision: v.optional(v.number()),
    mediaManifest: v.optional(v.array(federationMediaValidator)),
    mediaStatus: v.optional(v.union(v.literal("pending"), v.literal("running"), v.literal("attached"), v.literal("failed"))),
    mediaAttempts: v.optional(v.number()), mediaLeaseToken: v.optional(v.string()), mediaLeaseUntil: v.optional(v.number()),
    mediaError: v.optional(v.union(v.literal("configuration"), v.literal("download"), v.literal("obsolete"), v.literal("admission"))),
    mediaStored: v.optional(v.array(v.id("_storage"))),
  }).index("by_emitter_environment_object", ["emitterId", "environment", "objectRef"])
    .index("by_network", ["networkId"])
    .index("by_media_status", ["mediaStatus"])
    .index("by_parent", ["emitterId", "environment", "parentObjectRef"])
    .index("by_local", ["localTable", "localId"]),
}
