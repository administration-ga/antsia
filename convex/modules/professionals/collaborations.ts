/** MP09 : propositions privées bornées, sans relation personnelle ni message automatique. */
import { canonicalPair } from "@antsia/social-domain/connectionState"
import { parseProfessionalCollaborationMessage, PROFESSIONAL_COLLABORATION_COOLDOWN_MS } from "@antsia/social-domain/professionals"
import { paginationOptsValidator, type PaginationOptions } from "convex/server"
import { v } from "convex/values"

import type { Id } from "../../_generated/dataModel"
import type { QueryCtx } from "../../_generated/server"
import { fail, notFound } from "../../lib/errors"
import { networkMutation, networkQuery } from "../../lib/functions"
import { enforceRateLimit } from "../../lib/rateLimit"
import { openContextualConversation, syncContextualConversation } from "../contextualMessaging/hooks"
import { isBlockedBetween } from "../graph/graph"
import { moderateContentWrite } from "../moderation/policy"
import { findPublishedPersonByHandle } from "../people/miniProfile"
import { readableProfessionalCollaboration, readableProfessionalProfile, professionalPublishedModeration } from "./read"
import { expectedProfessionalRevision, PROFESSIONAL_BYTES_MAX, PROFESSIONAL_ROWS_MAX, professionalCursorScope, professionalPageSize, readProfessionalCursor, writeProfessionalCursor } from "./rules"
import {
  professionalCollaborationMutationValidator, professionalCollaborationPageValidator, professionalCollaborationStatusValidator,
  professionalCollaborationTypeValidator, type ProfessionalCollaboration,
} from "./validators"

export const propose = networkMutation({
  minStatus: "declaree",
  args: { toHandle: v.string(), collaborationType: professionalCollaborationTypeValidator, message: v.string() }, returns: professionalCollaborationMutationValidator,
  handler: async (ctx, args) => {
    const message = parseProfessionalCollaborationMessage(args.message)
    if (!message) return fail("invalidArgument", { field: "message" })
    const target = await findPublishedPersonByHandle(ctx, ctx.networkId, args.toHandle)
    if (!target || target._id === ctx.person._id) return notFound()
    const [from, to] = await Promise.all([
      readableProfessionalProfile(ctx, ctx.networkId, ctx.person._id, ctx.person._id), readableProfessionalProfile(ctx, ctx.networkId, target._id, ctx.person._id),
    ])
    if (!from || !to || await isBlockedBetween(ctx, ctx.person._id, target._id) || to.profile.availability === "unavailable" || !to.profile.collaborationTypes.includes(args.collaborationType)) return notFound()
    const { low, high } = canonicalPair(ctx.person._id, target._id)
    const pending = await ctx.db.query("professionalCollaborations").withIndex("by_network_pair_status", q => q.eq("networkId", ctx.networkId).eq("personIdLow", low).eq("personIdHigh", high).eq("status", "pending")).unique()
    if (pending) {
      if (pending.fromPersonId === ctx.person._id && pending.message === message && pending.collaborationType === args.collaborationType) return { collaborationId: pending._id, revision: pending.revision, status: pending.status, changed: false }
      return fail("conflict", { field: "collaboration" })
    }
    const latest = await ctx.db.query("professionalCollaborations").withIndex("by_network_pair_updatedAt", q => q.eq("networkId", ctx.networkId).eq("personIdLow", low).eq("personIdHigh", high)).order("desc").first()
    const now = Date.now()
    if (latest && latest.cooldownUntil > now) return fail("policyRefused", { field: "collaboration" })
    // Le rejeu sans effet d'un pending identique ne consomme pas une seconde sollicitation.
    await enforceRateLimit(ctx, "professional.collaboration.propose", ctx.person._id)
    const collaborationId = await ctx.db.insert("professionalCollaborations", { networkId: ctx.networkId, personIdLow: low, personIdHigh: high, fromPersonId: ctx.person._id, toPersonId: target._id,
      collaborationType: args.collaborationType, message, status: "pending", revision: 1, createdAt: now, proposedAt: now, updatedAt: now, cooldownUntil: 0 })
    await moderateContentWrite(ctx, { networkId: ctx.networkId, ownerPersonId: ctx.person._id, kind: "professionalCollaboration", id: collaborationId, text: message })
    await syncContextualConversation(ctx, { kind: "professionalCollaboration", id: collaborationId })
    return { collaborationId, revision: 1, status: "pending" as const, changed: true }
  },
})
export const respond = networkMutation({
  minStatus: "declaree", writeBucket: "professional.collaboration.respond",
  args: { collaborationId: v.id("professionalCollaborations"), expectedRevision: v.number(), decision: v.union(v.literal("accepted"), v.literal("declined")) }, returns: professionalCollaborationMutationValidator,
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.collaborationId)
    if (!row || row.networkId !== ctx.networkId || row.toPersonId !== ctx.person._id) return notFound()
    expectedProfessionalRevision(args.expectedRevision, row.revision)
    if (row.status !== "pending") return fail("conflict", { field: "collaboration" })
    if (!await readableProfessionalCollaboration(ctx, row, ctx.person._id) || !await professionalPublishedModeration(ctx, "professionalCollaboration", row._id, ctx.person._id)) return notFound()
    const now = Date.now(), revision = row.revision + 1
    await ctx.db.patch(row._id, { status: args.decision, revision, respondedAt: now, updatedAt: now, cooldownUntil: args.decision === "declined" ? now + PROFESSIONAL_COLLABORATION_COOLDOWN_MS : 0 })
    if (args.decision === "accepted") await openContextualConversation(ctx, { kind: "professionalCollaboration", id: row._id })
    else await syncContextualConversation(ctx, { kind: "professionalCollaboration", id: row._id })
    return { collaborationId: row._id, revision, status: args.decision, changed: true }
  },
})
export const cancel = networkMutation({
  minStatus: "declaree", writeBucket: "professional.collaboration.cancel",
  args: { collaborationId: v.id("professionalCollaborations"), expectedRevision: v.number() }, returns: professionalCollaborationMutationValidator,
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.collaborationId)
    if (!row || row.networkId !== ctx.networkId || row.fromPersonId !== ctx.person._id && row.toPersonId !== ctx.person._id) return notFound()
    if (row.status === "cancelled" && row.cancelledByPersonId === ctx.person._id && (args.expectedRevision === row.revision || args.expectedRevision === row.revision - 1)) return { collaborationId: row._id, revision: row.revision, status: row.status, changed: false }
    expectedProfessionalRevision(args.expectedRevision, row.revision)
    if (row.status !== "accepted" && (row.status !== "pending" || row.fromPersonId !== ctx.person._id)) return fail("conflict", { field: "collaboration" })
    // Retirer SON invitation ne requiert pas de republier un profil retiré, ni de relire le message d'autrui.
    const now = Date.now(), revision = row.revision + 1
    await ctx.db.patch(row._id, { status: "cancelled", revision, cancelledAt: now, cancelledByPersonId: ctx.person._id, updatedAt: now, cooldownUntil: now + PROFESSIONAL_COLLABORATION_COOLDOWN_MS })
    await syncContextualConversation(ctx, { kind: "professionalCollaboration", id: row._id })
    return { collaborationId: row._id, revision, status: "cancelled" as const, changed: true }
  },
})

type ListArgs = { status?: "pending" | "accepted" | "declined" | "cancelled"; paginationOpts: PaginationOptions }
async function listFor(ctx: QueryCtx, networkId: Id<"networks">, personId: Id<"persons">, direction: "sent" | "received", args: ListArgs) {
  const scope = await professionalCursorScope(["professional-collaborations-v1", networkId, personId, direction, args.status ?? null])
  const cursor = readProfessionalCursor(args.paginationOpts.cursor, scope)
  let query = direction === "sent"
    ? ctx.db.query("professionalCollaborations").withIndex("by_network_from_updatedAt", q => q.eq("networkId", networkId).eq("fromPersonId", personId)).order("desc")
    : ctx.db.query("professionalCollaborations").withIndex("by_network_to_updatedAt", q => q.eq("networkId", networkId).eq("toPersonId", personId)).order("desc")
  if (args.status) query = query.filter(q => q.eq(q.field("status"), args.status!))
  const window = await query.paginate({ cursor, numItems: professionalPageSize(args.paginationOpts.numItems), maximumRowsRead: PROFESSIONAL_ROWS_MAX, maximumBytesRead: PROFESSIONAL_BYTES_MAX })
  const page: ProfessionalCollaboration[] = []
  for (const row of window.page) {
    const live = await readableProfessionalCollaboration(ctx, row, personId)
    if (!live) continue
    const published = live.moderationStatus === "published"
    page.push({ collaborationId: row._id, revision: row.revision, status: row.status, collaborationType: row.collaborationType, message: row.message, direction,
      from: { handle: live.from.person.handle!, displayName: live.from.person.displayName! }, to: { handle: live.to.person.handle!, displayName: live.to.person.displayName! },
      proposedAt: row.proposedAt, respondedAt: row.respondedAt ?? null, cancelledAt: row.cancelledAt ?? null, updatedAt: row.updatedAt,
      canRespond: published && direction === "received" && row.status === "pending", canCancel: row.status === "accepted" || direction === "sent" && row.status === "pending",
      moderationStatus: published ? "published" : "pending_review", acceptedSource: published && row.status === "accepted" ? { kind: "professionalCollaboration", id: row._id } : null })
  }
  return { page, isDone: window.isDone, continueCursor: writeProfessionalCursor(window.continueCursor, scope, window.isDone), filteredWindow: page.length !== window.page.length || !window.isDone && window.page.length === 0 }
}
const listArgs = { status: v.optional(professionalCollaborationStatusValidator), paginationOpts: paginationOptsValidator }
export const listMine = networkQuery({ minStatus: "declaree", args: listArgs, returns: professionalCollaborationPageValidator,
  handler: async (ctx, args) => await listFor(ctx, ctx.networkId, ctx.person._id, "sent", args) })
export const listIncoming = networkQuery({ minStatus: "declaree", args: listArgs, returns: professionalCollaborationPageValidator,
  handler: async (ctx, args) => await listFor(ctx, ctx.networkId, ctx.person._id, "received", args) })
