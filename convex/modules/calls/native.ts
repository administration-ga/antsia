/** P17c — une référence de sonnerie n'accorde ni acceptation ni jeton ; le geste gagne atomiquement. */
import { isNativeCallUuid, NATIVE_CALL_RING_MAX_MS, type NativeCallBinding } from "@antsia/social-contracts/native-calls"
import { MAX_PUSH_SUBSCRIPTIONS } from "@antsia/social-domain/notificationDelivery"
import { isTerminalCallStatus } from "@antsia/social-domain/callJournal"
import { v } from "convex/values"
import type { Doc, Id } from "../../_generated/dataModel"
import { internalQuery, type QueryCtx } from "../../_generated/server"
import { requireMembership } from "../../lib/access"
import { networkMutation, networkQuery, personMutation } from "../../lib/functions"
import { notFound } from "../../lib/errors"
import { enforceRateLimit } from "../../lib/rateLimit"
import { notificationApplications, nativeCallApplication } from "../notifications/configuration"
import { nativeSubscriptionAllowed } from "../notifications/nativeChannels"
import { incomingCallAllowed } from "../notifications/policy"
import { publishedMiniProfile } from "../people/miniProfile"
import { counterpartOf } from "../messaging/participation"
import { participationOf, requireCallParticipant, isLiveMemberOfThreadCall } from "./access"
import { activeCallSession, claimNativeParticipant, isNativeOwner, nativeBindingFields, systemUuid, validNativeBinding } from "./deviceOwnership"
import { joinParticipant, leaveParticipant } from "./lifecycle"
import { callMediaTypeValidator } from "./validators"
import { declineGroupInvite, finishCall } from "./state"
import { conversationFieldsOfCall } from "./conversation"

export const configuration = networkQuery({
  args: {}, returns: v.object({ enabled: v.boolean(), applicationIds: v.array(v.string()) }),
  handler: async ctx => {
    const applicationIds = notificationApplications().filter(app => nativeCallApplication(app.applicationId, ctx.network.slug) !== null).map(app => app.applicationId)
    return { enabled: applicationIds.length > 0, applicationIds }
  },
})

/** La durée d'un signal natif reste bornée même si la fenêtre Web est plus longue. */
async function incomingDeadline(ctx: Pick<QueryCtx, "db" | "runQuery">, call: Doc<"calls">, personId: Id<"persons">, binding: NativeCallBinding, sessionId: string): Promise<number> {
  const jobs = await ctx.db.query("notificationDeliveryJobs").withIndex("by_call_recipient", q => q.eq("callId", call._id).eq("recipientPersonId", personId)).take(MAX_PUSH_SUBSCRIPTIONS + 1)
  if (jobs.length > MAX_PUSH_SUBSCRIPTIONS) return 0
  const matching = jobs.filter(job => job.applicationId === binding.applicationId && job.nativeBindingId === binding.bindingId)
  if (matching.length) {
    const network = await ctx.db.get(call.networkId)
    if (!network) return 0
    let deadline = 0
    for (const job of matching) {
      const sub = job.subscriptionId ? await ctx.db.get(job.subscriptionId) : null
      if (!sub || ["cancelled", "failed", "unavailable"].includes(job.state) || sub.personId !== personId || sub.networkId !== call.networkId || sub.applicationId !== binding.applicationId || sub.deviceId !== binding.deviceId || sub.nativeBindingId !== binding.bindingId || sub.sessionId !== sessionId || sub.sessionGeneration !== job.sessionGeneration || !job.sessionGeneration || !(await nativeSubscriptionAllowed(ctx, sub, network.slug))) continue
      deadline = Math.max(deadline, job.nativeExpiresAt ?? 0)
    }
    return deadline
  }
  // Appel au premier plan sans push : ne prolonge pas la sonnerie depuis le clic.
  const invite = call.kind === "group" ? await ctx.db.query("callInvites").withIndex("by_call_person", q => q.eq("callId", call._id).eq("personId", personId)).unique() : null
  return (invite?.invitedAt ?? call.startedAt) + NATIVE_CALL_RING_MAX_MS
}

export const resolveIncoming = networkQuery({
  minStatus: "declaree", args: { ...nativeBindingFields, reference: v.id("notificationDeliveryJobs") },
  returns: v.union(v.null(), v.object({ callId: v.id("calls"), uuid: v.string(), media: callMediaTypeValidator, expiresAt: v.number(), caller: v.union(v.null(), v.object({ displayName: v.union(v.string(), v.null()), handle: v.union(v.string(), v.null()) })) })),
  handler: async (ctx, args) => {
    if (!validNativeBinding(args) || !nativeCallApplication(args.applicationId, ctx.network.slug)) return null
    const sessionId = await activeCallSession(ctx), job = await ctx.db.get(args.reference)
    if (!job || job.networkId !== ctx.networkId || job.recipientPersonId !== ctx.person._id || job.channel !== "call" || ["cancelled", "failed", "unavailable"].includes(job.state) || job.applicationId !== args.applicationId || !job.callId || job.nativeBindingId !== args.bindingId || !job.sessionGeneration || !job.nativeExpiresAt || job.nativeExpiresAt <= Date.now()) return null
    const subscription = job.subscriptionId ? await ctx.db.get(job.subscriptionId) : null
    if (!subscription || subscription.networkId !== ctx.networkId || subscription.personId !== ctx.person._id || subscription.applicationId !== args.applicationId || subscription.deviceId !== args.deviceId || subscription.nativeBindingId !== args.bindingId || subscription.sessionId !== sessionId || subscription.sessionGeneration !== job.sessionGeneration || !(await nativeSubscriptionAllowed(ctx, subscription, ctx.network.slug))) return null
    if (!(await incomingCallAllowed(ctx, ctx.networkId, ctx.person._id, job.callId))) return null
    const call = await ctx.db.get(job.callId), participant = await participationOf(ctx, job.callId, ctx.person._id)
    if (!call || !isNativeCallUuid(call.systemCallUuid) || !participant || participant.leftAt !== undefined || participant.joinedAt !== undefined || participant.ownerSessionId !== undefined) return null
    const caller = await publishedMiniProfile(ctx, call.createdByPersonId)
    return { callId: call._id, uuid: call.systemCallUuid, media: call.mediaType, expiresAt: job.nativeExpiresAt, caller: { displayName: caller.displayName, handle: caller.handle } }
  },
})

export const join = networkMutation({
  args: { callId: v.id("calls"), ...nativeBindingFields },
  returns: v.object({ callId: v.id("calls"), uuid: v.string(), media: callMediaTypeValidator }),
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, "call.respond", ctx.person._id)
    if (!validNativeBinding(args) || !nativeCallApplication(args.applicationId, ctx.network.slug)) return notFound()
    const { call, participation } = await requireCallParticipant(ctx, ctx.networkId, args.callId, ctx.person._id)
    if (call.status !== "active" || isTerminalCallStatus(call.callStatus)) return notFound()
    const sessionId = await activeCallSession(ctx)
    if (call.createdByPersonId !== ctx.person._id && !isNativeOwner(participation, sessionId, args)) {
      const invite = call.kind === "group" ? await ctx.db.query("callInvites").withIndex("by_call_person", q => q.eq("callId", call._id).eq("personId", ctx.person._id)).unique() : null
      const foregroundThreadJoin = call.kind === "group" && call.groupThreadId !== undefined && invite === null
      if (!foregroundThreadJoin && (!(await incomingCallAllowed(ctx, ctx.networkId, ctx.person._id, call._id)) || await incomingDeadline(ctx, call, ctx.person._id, args, sessionId) <= Date.now())) return notFound()
    }
    await claimNativeParticipant(ctx, participation, args)
    await joinParticipant(ctx, call, participation, ctx.person._id)
    return { callId: call._id, uuid: await systemUuid(ctx, call), media: call.mediaType }
  },
})

/** @selfScoped Quitter SA participation reste permis si les droits du réseau viennent d'être retirés. */
export const release = personMutation({
  args: { networkId: v.id("networks"), callId: v.id("calls"), ...nativeBindingFields }, returns: v.object({ ended: v.boolean() }),
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, "call.leave", ctx.person._id)
    const call = await ctx.db.get(args.callId)
    if (!call || call.networkId !== args.networkId || !validNativeBinding(args)) return { ended: false }
    const participant = await participationOf(ctx, call._id, ctx.person._id)
    if (!participant) return { ended: false }
    const sessionId = await activeCallSession(ctx)
    // Lancement annulé avant join : la porte de création a déjà réservé l'hôte
    // à sa vraie session, mais aucun appareil/Web n'a encore gagné de média.
    // Cette sortie ne convertit jamais une participation déjà revendiquée.
    const reservedHost = call.createdByPersonId === ctx.person._id && participant.role === "host" &&
      participant.ownerSessionId === sessionId && participant.ownerKind === undefined &&
      participant.ownerApplicationId === undefined && participant.ownerDeviceId === undefined && participant.ownerBindingId === undefined
    if (reservedHost) {
      await leaveParticipant(ctx, call, participant, true)
      return { ended: (await ctx.db.get(call._id))?.status === "ended" }
    }
    if (!isNativeOwner(participant, sessionId, args)) {
      // Refus système avant acceptation : le premier geste valide gagne aussi, sans ouvrir caméra/micro.
      if (participant.ownerSessionId !== undefined || participant.joinedAt !== undefined || participant.leftAt !== undefined) return { ended: false }
      const { network } = await requireMembership(ctx, args.networkId, "declaree")
      if (!nativeCallApplication(args.applicationId, network.slug) || !(await incomingCallAllowed(ctx, args.networkId, ctx.person._id, call._id)) || await incomingDeadline(ctx, call, ctx.person._id, args, sessionId) <= Date.now()) return { ended: false }
      await claimNativeParticipant(ctx, participant, args)
      if (call.kind === "group") await declineGroupInvite(ctx, call._id, ctx.person._id, Date.now())
      else await finishCall(ctx, call, { callStatus: "declined", endReason: "declined" }, Date.now())
    } else await leaveParticipant(ctx, call, participant, true)
    return { ended: (await ctx.db.get(call._id))?.status === "ended" }
  },
})

export const authorizeNativeToken = internalQuery({
  args: { networkId: v.id("networks"), callId: v.id("calls"), ...nativeBindingFields },
  returns: v.union(v.null(), v.object({ roomName: v.string(), mediaType: callMediaTypeValidator, personId: v.id("persons"), displayName: v.union(v.string(), v.null()), sessionId: v.string(), commercialThreadId: v.optional(v.id("commercialThreads")), contextualThreadId: v.optional(v.id("contextualThreads")) })),
  handler: async (ctx, args) => {
    const { person, network } = await requireMembership(ctx, args.networkId, "declaree")
    if (!validNativeBinding(args) || !nativeCallApplication(args.applicationId, network.slug)) return null
    const call = await ctx.db.get(args.callId)
    if (!call || call.networkId !== args.networkId || call.status !== "active" || isTerminalCallStatus(call.callStatus)) return null
    const row = await participationOf(ctx, call._id, person._id), sessionId = await activeCallSession(ctx)
    if (!row || row.joinedAt === undefined || row.leftAt !== undefined || !isNativeOwner(row, sessionId, args) || (await isLiveMemberOfThreadCall(ctx, call, person._id)) === false) return null
    const label = await counterpartOf(ctx, person._id)
    return { roomName: call.roomName, mediaType: call.mediaType, personId: person._id, displayName: label.displayName, sessionId, ...conversationFieldsOfCall(call) }
  },
})
