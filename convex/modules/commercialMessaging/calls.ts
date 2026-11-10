/** P10 : tête-à-tête consenti ; aucun droit personnel ou CRM dérivé de ce fil. */
import { v } from "convex/values"

import { notFound } from "../../lib/errors"
import { networkMutation } from "../../lib/functions"
import { enforceRateLimit } from "../../lib/rateLimit"
import { directCallResultValidator, placeDirectCall, type DirectCallResult } from "../calls/direct"
import { callMediaTypeValidator } from "../calls/validators"
import { commercialCallPairAllowed, liveRespondents, readStateOf, requireCommercialThread } from "./access"
import { stopCommercialCalls } from "./threads"

export const setCallConsent = networkMutation({
  writeBucket: "commercial.manage", args: { threadId: v.id("commercialThreads"), allowed: v.boolean() }, returns: v.null(),
  handler: async (ctx, args) => {
    const { thread, viewerKind, mandate } = await requireCommercialThread(ctx, ctx.networkId, ctx.person._id, args.threadId, !args.allowed)
    if (args.allowed && thread.state !== "accepted") return notFound()
    if (viewerKind === "shop" && (!mandate?.canReply || !mandate.canCall)) return notFound()
    const now = Date.now()
    if (viewerKind === "requester") await ctx.db.patch(thread._id, { buyerCallsAllowed: args.allowed, revision: thread.revision + 1, updatedAt: now })
    else {
      const old = await readStateOf(ctx, thread._id, ctx.person._id)
      const fields = { callsAllowed: args.allowed, callConsentMandateRevision: mandate!.revision, updatedAt: now }
      if (old) await ctx.db.patch(old._id, fields)
      else await ctx.db.insert("commercialReadStates", { networkId: ctx.networkId, threadId: thread._id, personId: ctx.person._id, ...fields })
    }
    if (!args.allowed) await stopCommercialCalls(ctx, thread._id)
    return null
  },
})
export const startCall = networkMutation({
  args: { threadId: v.id("commercialThreads"), respondentPersonId: v.optional(v.id("persons")), mediaType: callMediaTypeValidator }, returns: directCallResultValidator,
  handler: async (ctx, args): Promise<DirectCallResult> => {
    await enforceRateLimit(ctx, "commercial.message", ctx.person._id)
    const access = await requireCommercialThread(ctx, ctx.networkId, ctx.person._id, args.threadId)
    if (access.thread.state !== "accepted") return notFound()
    const targetId = access.viewerKind === "requester" ? args.respondentPersonId ?? access.thread.assignedRespondentPersonId : access.thread.requesterPersonId
    if (!targetId || (access.viewerKind === "shop" && args.respondentPersonId !== undefined && args.respondentPersonId !== ctx.person._id)) return notFound()
    if (access.viewerKind === "requester" && !(await liveRespondents(ctx, access)).some((row) => row.personId === targetId)) return notFound()
    if (!await commercialCallPairAllowed(ctx, access.thread, ctx.person._id, targetId)) return notFound()
    const active = await ctx.db.query("calls").withIndex("by_commercial_thread_status", (q) => q.eq("commercialThreadId", args.threadId).eq("status", "active")).first()
    if (active) return notFound()
    // L'admission personnelle est conservée (silence, présence, occupation, préférences) ; IC-04 : les accords d'appel du fil lèvent le seul réglage « hors de mes relations ».
    return await placeDirectCall(ctx, { target: { personId: targetId }, mediaType: args.mediaType, commercialThreadId: args.threadId })
  },
})
