// Dupliqué de socle/convex/modules/reseau/federation.ts @ 25398f565 — adaptations : rejeu par administrateur IDN vivant, même reçu/corps signé, journal moteur ; PA9A réapplique le traitement de page sans re-provisionnement.
import { assertDecisionReason } from "@antsia/social-domain/audit"
import { FEDERATION_BODY_MAX_BYTES, federationEnvironment, parseFederationEnvelope } from "@antsia/social-domain/federationProtocol"
import { paginationOptsValidator } from "convex/server"
import { v } from "convex/values"

import { checked, fail, notFound } from "../../lib/errors"
import { operatorMutation, operatorQuery } from "../../lib/functions"
import { enforceRateLimit } from "../../lib/rateLimit"
import { appendAudit, operatorCapacity } from "../platform/audit"
import { requireFederationAdmin } from "./access"
import { federationBodyDigest } from "./signature"
import { applyFederationEnvelope, isContentFreeFederationFailure, isPersonalFederationEnvelope } from "./reseauPublic"
import { validateCommerceTransportBody } from "./commerceTransport"

export const replay = operatorMutation({
  args: { deadLetterId: v.id("federationDeadLetters"), reason: v.string() },
  returns: v.object({ outcome: v.union(v.literal("deduplicated"), v.literal("still_failing"), v.literal("applied"), v.literal("discarded")), eventId: v.string() }),
  handler: async (ctx, args) => {
    await requireFederationAdmin(ctx, ctx)
    await enforceRateLimit(ctx, "moderation.decide", ctx.person._id)
    const reason = checked(() => assertDecisionReason(args.reason, 10))
    const row = await ctx.db.get(args.deadLetterId)
    if (!row) return notFound()
    const deployedEnvironment = federationEnvironment(process.env.FEDERATION_ENVIRONMENT)
    const emitter = await ctx.db.get(row.emitterId)
    const network = await ctx.db.get(row.networkId)
    if (!deployedEnvironment || row.environment !== deployedEnvironment || !emitter?.enabled || emitter.environment !== row.environment || emitter.networkId !== row.networkId || !network || network.status !== "active" || !emitter.allowedContracts.includes(row.contract)) return fail("policyRefused")
    if (new TextEncoder().encode(row.rawBody).byteLength > FEDERATION_BODY_MAX_BYTES) return fail("conflict")
    const envelope = parseFederationEnvelope(row.rawBody)
    const digest = await federationBodyDigest(row.rawBody)
    const receipt = await ctx.db.get(row.receiptId)
    if (!envelope.ok || !receipt || digest !== row.bodySha256 || receipt.bodySha256 !== digest || receipt.emitterId !== row.emitterId || receipt.environment !== row.environment || receipt.networkId !== row.networkId || receipt.eventId !== row.eventId || envelope.envelope.eventId !== row.eventId || envelope.envelope.contract !== row.contract || envelope.envelope.objectRef !== row.objectRef) return fail("conflict")
    const now = Date.now()
    // Une ancienne lettre personnelle n'est jamais réappliquée : son corps est expurgé.
    // L'émetteur devra produire un nouvel événement sur un accord local courant.
    if (isPersonalFederationEnvelope(envelope.envelope)) {
      await ctx.db.patch(row._id, { rawBody: "", objectRef: "personal-event-redacted", status: "resolved", resolvedAt: now, lastAttemptAt: now, attempts: row.attempts + 1 })
      await ctx.db.patch(receipt._id, { status: "discarded", objectRef: "personal-event-redacted", updatedAt: now })
      await ctx.db.insert("federationReplayAudit", { networkId: row.networkId, emitterId: row.emitterId, environment: row.environment, deadLetterId: row._id, eventId: row.eventId, requestedByPersonId: ctx.person._id, reason, outcome: "discarded", requestedAt: now })
      await appendAudit(ctx, { action: "federation.replay", capacity: operatorCapacity(ctx.operator), actorPersonId: ctx.person._id, networkId: row.networkId, subject: { table: "federationDeadLetters", id: row._id }, details: { reason, outcome: "discarded" }, at: now })
      return { outcome: "discarded" as const, eventId: row.eventId }
    }
    const transportBody = validateCommerceTransportBody(row.rawBody, envelope.envelope, row.environment, now)
    if (transportBody !== "valid") return fail(transportBody === "unauthorized" ? "policyRefused" : "conflict")
    const application = receipt.status === "applied" ? null : await applyFederationEnvelope(ctx, emitter, envelope.envelope, now, row.rawBody)
    const outcome = application === null ? "deduplicated" as const : application.applied ? "applied" as const : "still_failing" as const
    if (application !== null && !application.applied && isContentFreeFederationFailure(application.reason)) {
      // CM-02 : le rejeu tombe sur une catégorie interdite : le corps est expurgé, la lettre close (décision définitive).
      await ctx.db.patch(row._id, { status: "resolved", reason: application.reason, rawBody: "", attempts: row.attempts + 1, lastAttemptAt: now, resolvedAt: now })
      await ctx.db.patch(receipt._id, { status: "dead_letter", updatedAt: now })
    } else if (application !== null && !application.applied) {
      await ctx.db.patch(row._id, { status: "dead_letter", reason: application.reason, attempts: row.attempts + 1, lastAttemptAt: now, resolvedAt: undefined })
      await ctx.db.patch(receipt._id, { status: "dead_letter", updatedAt: now })
    } else if (application !== null) {
      await ctx.db.patch(row._id, { status: "resolved", attempts: row.attempts + 1, lastAttemptAt: now, resolvedAt: row.resolvedAt ?? now })
      if (receipt.status !== "applied") await ctx.db.patch(receipt._id, { status: "applied", updatedAt: now })
    } else if (row.status !== "resolved") {
      // Dédoublonnage (reçu déjà appliqué) : aucune tentative n'a lieu, `attempts` et `lastAttemptAt`
      // restent ceux des vraies tentatives (PA5). Une lettre encore ouverte est seulement close, le
      // reçu appliqué faisant foi du succès (ADR-0013 §5) ; la demande de rejeu vit dans l'audit.
      await ctx.db.patch(row._id, { status: "resolved", resolvedAt: now })
    }
    await ctx.db.insert("federationReplayAudit", { networkId: row.networkId, emitterId: row.emitterId, environment: row.environment, deadLetterId: row._id, eventId: row.eventId, requestedByPersonId: ctx.person._id, reason, outcome, requestedAt: now })
    await appendAudit(ctx, { action: "federation.replay", capacity: operatorCapacity(ctx.operator), actorPersonId: ctx.person._id, networkId: row.networkId, subject: { table: "federationDeadLetters", id: row._id }, details: { reason, eventId: row.eventId, outcome }, at: now })
    return { outcome, eventId: row.eventId }
  },
})

export const getDeadLetter = operatorQuery({
  args: { deadLetterId: v.id("federationDeadLetters") },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.deadLetterId)
    if (!row) return notFound()
    return deadLetterMetadata(row)
  },
})

export const paginateDeadLetters = operatorQuery({
  args: { networkId: v.id("networks"), status: v.union(v.literal("dead_letter"), v.literal("resolved")), paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const result = await ctx.db.query("federationDeadLetters").withIndex("by_network_status_failedAt", (q) => q.eq("networkId", args.networkId).eq("status", args.status)).order("desc").paginate({ ...args.paginationOpts, numItems: Math.min(20, Math.max(1, args.paginationOpts.numItems)) })
    return { ...result, page: result.page.map(deadLetterMetadata) }
  },
})

function deadLetterMetadata(row: import("../../_generated/dataModel").Doc<"federationDeadLetters">) {
  return { _id: row._id, networkId: row.networkId, emitterId: row.emitterId, environment: row.environment, contract: row.contract, status: row.status, reason: row.reason, attempts: row.attempts, firstFailedAt: row.firstFailedAt, lastAttemptAt: row.lastAttemptAt, resolvedAt: row.resolvedAt ?? null, eventId: row.eventId, receiptId: row.receiptId }
}

export const paginateReceipts = operatorQuery({
  args: { networkId: v.id("networks"), paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => await ctx.db.query("federationInboxReceipts").withIndex("by_network_receivedAt", (q) => q.eq("networkId", args.networkId)).order("desc").paginate({ ...args.paginationOpts, numItems: Math.min(50, Math.max(1, args.paginationOpts.numItems)) }),
})
