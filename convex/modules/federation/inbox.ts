// Dupliqué de socle/convex/modules/reseau/federation.ts @ 25398f565 — adaptations : environnement explicite, signature rejugée et quota avant effet, digest exact ; PA9A branche les pages officielles sans création de personne/adhésion.
import { FEDERATION_BODY_MAX_BYTES, federationEnvironment, freshFederationTimestamp, parseFederationEnvelope } from "@antsia/social-domain/federationProtocol"
import { v } from "convex/values"

import { internalMutation } from "../../_generated/server"
import { enforceRateLimit } from "../../lib/rateLimit"
import { federationBodyDigest, verifyFederationSignature } from "./signature"
import { federationApplicationStatusValidator, federationEnvironmentValidator, federationReceiptStatusValidator } from "./tables"
import { applyFederationEnvelope, isContentFreeFederationFailure, isPersonalFederationEnvelope, validImplementedFederationPayload } from "./reseauPublic"
import { correlatedFederationReceipt, validateCommerceTransportBody } from "./commerceTransport"

export const admit = internalMutation({
  args: { emitterId: v.id("federationEmitters"), emitterRevision: v.number(), environment: federationEnvironmentValidator, timestamp: v.string(), signature: v.string(), rawBody: v.string() },
  returns: v.object({ outcome: v.union(v.literal("accepted"), v.literal("duplicate"), v.literal("conflict"), v.literal("unauthorized"), v.literal("unavailable"), v.literal("invalid_envelope")), status: v.optional(federationReceiptStatusValidator), eventId: v.optional(v.string()), bodySha256: v.optional(v.string()), applicationStatus: v.optional(federationApplicationStatusValidator) }),
  handler: async (ctx, args) => {
    const deployedEnvironment = federationEnvironment(process.env.FEDERATION_ENVIRONMENT)
    if (!deployedEnvironment) return { outcome: "unavailable" as const }
    if (args.environment !== deployedEnvironment || !freshFederationTimestamp(args.timestamp, Date.now()) || new TextEncoder().encode(args.rawBody).byteLength > FEDERATION_BODY_MAX_BYTES) return { outcome: "unauthorized" as const }
    const emitter = await ctx.db.get(args.emitterId)
    if (!emitter?.enabled || emitter.environment !== args.environment || emitter.revision !== args.emitterRevision) return { outcome: "unauthorized" as const }
    const network = await ctx.db.get(emitter.networkId)
    if (!network || network.status !== "active") return { outcome: "unauthorized" as const }
    // Le passage HTTP a vérifié la signature. Rejouer ici avec la révision et
    // la clé COURANTES ferme la course à la désactivation/rotation de clé.
    const signature = await verifyFederationSignature({ ...args, keyEnvName: emitter.keyEnvName })
    if (signature !== "valid") return { outcome: signature === "unavailable" ? "unavailable" as const : "unauthorized" as const }
    await enforceRateLimit(ctx, "federation.receive", `${emitter._id}:${emitter.environment}`)
    const parsed = parseFederationEnvelope(args.rawBody)
    if (!parsed.ok) return { outcome: "invalid_envelope" as const }
    const envelope = parsed.envelope
    if (!emitter.allowedContracts.includes(envelope.contract)) return { outcome: "unauthorized" as const }
    const transportBody = validateCommerceTransportBody(args.rawBody, envelope, args.environment, Date.now())
    if (transportBody !== "valid") return { outcome: transportBody === "unauthorized" ? "unauthorized" as const : "invalid_envelope" as const }
    const bodySha256 = await federationBodyDigest(args.rawBody)
    const existing = await ctx.db.query("federationInboxReceipts").withIndex("by_emitter_environment_event", (q) => q.eq("emitterId", emitter._id).eq("environment", emitter.environment).eq("eventId", envelope.eventId)).unique()
    if (existing) {
      if (existing.bodySha256 !== bodySha256 || existing.networkId !== emitter.networkId) return { outcome: "conflict" as const }
      return { outcome: "duplicate" as const, status: existing.status, ...correlatedFederationReceipt(envelope.eventId, bodySha256, existing.status) }
    }
    const now = Date.now()
    if (!await validImplementedFederationPayload(envelope, now)) return { outcome: "invalid_envelope" as const }
    const receiptId = await ctx.db.insert("federationInboxReceipts", { networkId: emitter.networkId, emitterId: emitter._id, environment: emitter.environment, eventId: envelope.eventId, contract: envelope.contract, version: envelope.version, objectRef: envelope.objectRef, bodySha256, status: "received", receivedAt: now, updatedAt: now })
    const application = await applyFederationEnvelope(ctx, emitter, envelope, now, args.rawBody)
    if (application.applied) {
      await ctx.db.patch(receiptId, { status: "applied", updatedAt: now })
      return { outcome: "accepted" as const, status: "applied" as const, ...correlatedFederationReceipt(envelope.eventId, bodySha256, "applied") }
    }
    if (isPersonalFederationEnvelope(envelope)) {
      await ctx.db.patch(receiptId, { status: "discarded", updatedAt: now })
      return { outcome: "accepted" as const, status: "discarded" as const, ...correlatedFederationReceipt(envelope.eventId, bodySha256, "discarded") }
    }
    // CM-02 : un refus sans contenu ne garde pas le corps ; décision définitive, la lettre est close d'emblée.
    const contentFree = isContentFreeFederationFailure(application.reason)
    await ctx.db.insert("federationDeadLetters", { networkId: emitter.networkId, emitterId: emitter._id, environment: emitter.environment, receiptId, eventId: envelope.eventId, contract: envelope.contract, objectRef: envelope.objectRef, bodySha256, rawBody: contentFree ? "" : args.rawBody, reason: application.reason, status: contentFree ? "resolved" : "dead_letter", attempts: 1, firstFailedAt: now, lastAttemptAt: now, ...(contentFree ? { resolvedAt: now } : {}) })
    await ctx.db.patch(receiptId, { status: "dead_letter", updatedAt: now })
    return { outcome: "accepted" as const, status: "dead_letter" as const, ...correlatedFederationReceipt(envelope.eventId, bodySha256, "dead_letter") }
  },
})
