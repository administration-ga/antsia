/** PA5 — file sans contenu, budget réservé une seule fois, baux et reprises bornées. */
import { CALL_RING_WINDOW_MS } from "@antsia/social-contracts/calls"
import { isNativeCallUuid, NATIVE_CALL_RING_MAX_MS, type NativeCallPushPayload } from "@antsia/social-contracts/native-calls"
import { systemUuid } from "../calls/deviceOwnership"
import { nativeSubscriptionAllowed } from "./nativeChannels"
import { DELIVERY_LEASE_MS, DELIVERY_MAX_ATTEMPTS, MAX_PUSH_SUBSCRIPTIONS, notificationWeekStart, type NeutralNotificationPayload, WEEK_MS } from "@antsia/social-domain/notificationDelivery"
import { v } from "convex/values"
import { internal } from "../../_generated/api"
import type { Doc, Id } from "../../_generated/dataModel"
import { internalMutation, internalQuery, type MutationCtx, type QueryCtx } from "../../_generated/server"
import { isActiveMember } from "../../lib/access"
import { applicationNotificationUrl, notificationApplication, notificationApplications, type NotificationApplication } from "./configuration"
import { subscriptionIsLive } from "./sessionBinding"
import { incomingCallAllowed, notificationConsent, notificationRowCategory, notificationStillVisible, pushAllowed } from "./policy"
import { deliveryPreferences } from "./preferences"
import { deliveryStateValidator } from "./tables"

type WriteCtx = Pick<MutationCtx, "db" | "runQuery"> & Partial<Pick<MutationCtx, "scheduler">>
export type DeliveryContext = { subscription: Doc<"pushSubscriptions"> | null; authUserId: string | null; payload: NeutralNotificationPayload | NativeCallPushPayload; application?: NotificationApplication }
export async function reserveNotificationBudget(ctx: Pick<MutationCtx, "db">, networkId: Id<"networks">, personId: Id<"persons">, at = Date.now()): Promise<number | null> {
  const prefs = await deliveryPreferences(ctx, networkId, personId)
  const weekStart = notificationWeekStart(at)
  const usage = await ctx.db.query("notificationWeeklyUsage").withIndex("by_network_person_week", (q) => q.eq("networkId", networkId).eq("personId", personId).eq("weekStart", weekStart)).unique()
  if ((usage?.reserved ?? 0) >= prefs.weeklyLimit) return null
  if (usage) await ctx.db.patch(usage._id, { reserved: usage.reserved + 1 })
  else await ctx.db.insert("notificationWeeklyUsage", { networkId, personId, weekStart, reserved: 1 })
  return weekStart
}

export async function enqueueNotificationPush(ctx: WriteCtx, notificationId: Id<"notifications">): Promise<number> {
  const row = await ctx.db.get(notificationId)
  if (!row || !(await pushAllowed(ctx, row))) return 0
  const candidates = await ctx.db.query("pushSubscriptions").withIndex("by_network_person_active", (q) => q.eq("networkId", row.networkId).eq("personId", row.recipientPersonId).eq("active", true)).take(MAX_PUSH_SUBSCRIPTIONS)
  const subscriptions: Doc<"pushSubscriptions">[] = []
  for (const candidate of candidates) if (candidate.provider !== "apns_voip" && ctx.runQuery && await subscriptionIsLive({ db: ctx.db, runQuery: ctx.runQuery }, candidate)) subscriptions.push(candidate)
  if (!subscriptions.length) return 0
  // Même si cette aide est rejouée par erreur, ne réserve jamais une deuxième fois.
  const existing = await ctx.db.query("notificationDeliveryJobs").withIndex("by_notification", (q) => q.eq("notificationId", notificationId)).first()
  if (existing) return 0
  const weekStart = await reserveNotificationBudget(ctx, row.networkId, row.recipientPersonId)
  if (weekStart === null) return 0
  const now = Date.now()
  for (const subscription of subscriptions) {
    const jobId = await ctx.db.insert("notificationDeliveryJobs", { networkId: row.networkId, recipientPersonId: row.recipientPersonId, notificationId, channel: "push", subscriptionId: subscription._id, applicationId: subscription.applicationId, category: notificationRowCategory(row.kind), dedupKey: `notification:${notificationId}:${subscription._id}`, weekStart, state: "queued", attempts: 0, nextAttemptAt: now, createdAt: now, updatedAt: now })
    if (ctx.scheduler) await ctx.scheduler.runAfter(0, internal.modules.notifications.push.deliver, { jobId })
  }
  return subscriptions.length
}

/** Appel entrant : même file, pas de copie du nom ou du message de l'appelant. */
export async function enqueueIncomingCallPush(ctx: WriteCtx, networkId: Id<"networks">, recipientPersonId: Id<"persons">, callId: Id<"calls">): Promise<boolean> {
  if (!(await incomingCallAllowed(ctx, networkId, recipientPersonId, callId))) return false
  const candidates = await ctx.db.query("pushSubscriptions").withIndex("by_network_person_active", (q) => q.eq("networkId", networkId).eq("personId", recipientPersonId).eq("active", true)).take(MAX_PUSH_SUBSCRIPTIONS)
  const network = await ctx.db.get(networkId), call = await ctx.db.get(callId)
  if (!network || !call) return false
  const subscriptions: Doc<"pushSubscriptions">[] = []
  for (const candidate of candidates) {
    if (!ctx.runQuery) continue
    const application = notificationApplication(candidate.applicationId, network.slug)
    if (!application) continue
    if (application.native) {
      if (!(await nativeSubscriptionAllowed({ db: ctx.db, runQuery: ctx.runQuery }, candidate, network.slug))) continue
    } else if (candidate.provider === "apns_voip" || !(await subscriptionIsLive({ db: ctx.db, runQuery: ctx.runQuery }, candidate))) continue
    subscriptions.push(candidate)
  }
  if (!subscriptions.length) return false
  const now = Date.now()
  const invite = call.kind === "group" ? await ctx.db.query("callInvites").withIndex("by_call_person", q => q.eq("callId", callId).eq("personId", recipientPersonId)).unique() : null
  const nativeExpiresAt = Math.min((invite?.invitedAt ?? call.startedAt) + CALL_RING_WINDOW_MS, now + NATIVE_CALL_RING_MAX_MS)
  if (subscriptions.some(row => row.nativeBindingId)) await systemUuid(ctx, call)
  if (await ctx.db.query("notificationDeliveryJobs").withIndex("by_call_recipient", (q) => q.eq("callId", callId).eq("recipientPersonId", recipientPersonId)).first()) return true
  const weekStart = await reserveNotificationBudget(ctx, networkId, recipientPersonId)
  if (weekStart === null) return false
  for (const subscription of subscriptions) {
    if (subscription.nativeBindingId && nativeExpiresAt <= now) continue
    const native = subscription.nativeBindingId ? { nativeBindingId: subscription.nativeBindingId, sessionGeneration: subscription.sessionGeneration, nativeExpiresAt } : {}
    const jobId = await ctx.db.insert("notificationDeliveryJobs", { ...native, networkId, recipientPersonId, callId, channel: "call", subscriptionId: subscription._id, applicationId: subscription.applicationId, category: "calls", dedupKey: `call:${callId}:${subscription._id}`, weekStart, state: "queued", attempts: 0, nextAttemptAt: now, createdAt: now, updatedAt: now })
    if (ctx.scheduler) await ctx.scheduler.runAfter(0, internal.modules.notifications.push.deliver, { jobId })
  }
  return true
}

export async function digestCount(ctx: Pick<QueryCtx, "db">, networkId: Id<"networks">, personId: Id<"persons">, now: number): Promise<number> {
  if (!(await isActiveMember(ctx, networkId, personId)) || !(await notificationConsent(ctx, networkId, personId, "email_digest"))) return 0
  const person = await ctx.db.get(personId)
  if (!person || person.deletionRequestedAt !== undefined) return 0
  const prefs = await deliveryPreferences(ctx, networkId, personId)
  if (!prefs.emailDigest || prefs.weeklyLimit === 0) return 0
  // Cinq sujets relus : les publications peuvent être volumineuses. Le digest
  // compte ces avis récents retenus, pas un total exhaustif du réseau.
  const rows = await ctx.db.query("notifications").withIndex("by_network_recipient_readAt_createdAt", (q) => q.eq("networkId", networkId).eq("recipientPersonId", personId).eq("readAt", undefined).gte("createdAt", now - WEEK_MS)).order("desc").take(5)
  let count = 0
  for (const row of rows) if (prefs.digestCategories[notificationRowCategory(row.kind)] && await notificationStillVisible(ctx, row)) count += 1
  return count
}

export const reserveDigests = internalMutation({
  args: { cursor: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, args): Promise<{ queued: number; done: boolean }> => {
    const page = await ctx.db.query("notificationPreferences").paginate({ cursor: args.cursor ?? null, numItems: 1 })
    const now = Date.now(), weekStart = notificationWeekStart(now)
    let queued = 0
    for (const preference of page.page) {
      if (!preference.emailDigest || await digestCount(ctx, preference.networkId, preference.personId, now) === 0) continue
      const previous = await ctx.db.query("notificationDigestReceipts").withIndex("by_network_person_week", (q) => q.eq("networkId", preference.networkId).eq("personId", preference.personId).eq("weekStart", weekStart)).unique()
      if (previous) continue
      const network = await ctx.db.get(preference.networkId)
      const application = network ? notificationApplications().find((item) => item.networkSlug === network.slug) : null
      if (!application || await reserveNotificationBudget(ctx, preference.networkId, preference.personId, now) === null) continue
      const jobId = await ctx.db.insert("notificationDeliveryJobs", { networkId: preference.networkId, recipientPersonId: preference.personId, channel: "digest", applicationId: application.applicationId, category: "social", dedupKey: `digest:${preference.networkId}:${preference.personId}:${weekStart}`, weekStart, state: "queued", attempts: 0, nextAttemptAt: now, createdAt: now, updatedAt: now })
      await ctx.db.insert("notificationDigestReceipts", { networkId: preference.networkId, personId: preference.personId, weekStart, jobId, createdAt: now })
      queued += 1
    }
    if (!page.isDone) await ctx.scheduler.runAfter(0, internal.modules.notifications.deliveries.reserveDigests, { cursor: page.continueCursor })
    return { queued, done: page.isDone }
  },
})

/** Filet de reprise : au plus 25 jobs d'un état ; chaque livraison demeure sous bail. */
export const drain = internalMutation({ args: {}, handler: async (ctx): Promise<{ scheduled: number }> => {
  const now = Date.now()
  let scheduled = 0
  for (const state of ["queued", "accepted", "delivering"] as const) {
    const rows = await ctx.db.query("notificationDeliveryJobs").withIndex("by_state_due", (q) => q.eq("state", state).lte("nextAttemptAt", now)).take(25)
    for (const row of rows) {
      if (row.state === "delivering" && (row.leaseUntil ?? 0) > now) continue
      await ctx.scheduler.runAfter(0, row.channel === "digest" ? internal.modules.notifications.digest.deliver : internal.modules.notifications.push.deliver, { jobId: row._id })
      scheduled += 1
    }
  }
  return { scheduled }
} })

/** Un job terminé, doublonné ou déjà sous bail n'est jamais repris par un second actionnaire. */
export const claim = internalMutation({ args: { jobId: v.id("notificationDeliveryJobs") }, handler: async (ctx, { jobId }): Promise<(Doc<"notificationDeliveryJobs"> & { leaseToken: string }) | null> => {
  const job = await ctx.db.get(jobId), now = Date.now()
  if (!job || !["queued", "accepted", "delivering"].includes(job.state) || job.nextAttemptAt > now || (job.state === "delivering" && (job.leaseUntil ?? 0) > now)) return null
  if (job.attempts >= DELIVERY_MAX_ATTEMPTS && !job.providerReceiptId) { await ctx.db.patch(jobId, { state: "failed", resultCode: "transport", updatedAt: now }); return null }
  const leaseToken = crypto.randomUUID()
  await ctx.db.patch(jobId, { state: "delivering", attempts: job.attempts + 1, leaseToken, leaseUntil: now + DELIVERY_LEASE_MS, nextAttemptAt: now + DELIVERY_LEASE_MS, updatedAt: now })
  return { ...job, leaseToken, attempts: job.attempts + 1 }
} })

/** Relecture immédiatement avant transport : rien n'est accordé par l'instantané d'admission. */
export const deliveryContext = internalQuery({ args: { jobId: v.id("notificationDeliveryJobs"), leaseToken: v.string() }, handler: async (ctx, args): Promise<DeliveryContext | null> => await prepareDelivery(ctx, args.jobId, args.leaseToken) })

export async function prepareDelivery(ctx: Pick<QueryCtx, "db" | "runQuery">, jobId: Id<"notificationDeliveryJobs">, leaseToken: string): Promise<DeliveryContext | null> {
  const job = await ctx.db.get(jobId)
  if (!job || job.state !== "delivering" || job.leaseToken !== leaseToken || (job.leaseUntil ?? 0) <= Date.now()) return null
  const network = await ctx.db.get(job.networkId), person = await ctx.db.get(job.recipientPersonId)
  if (!network || network.status !== "active" || !person || person.deletionRequestedAt !== undefined) return null
  const application = notificationApplication(job.applicationId, network.slug)
  if (!application) return null
  const prefs = await deliveryPreferences(ctx, job.networkId, job.recipientPersonId)
  const usage = await ctx.db.query("notificationWeeklyUsage").withIndex("by_network_person_week", (q) => q.eq("networkId", job.networkId).eq("personId", job.recipientPersonId).eq("weekStart", job.weekStart)).unique()
  if (!usage || usage.reserved > prefs.weeklyLimit || job.weekStart !== notificationWeekStart(Date.now())) return null
  let count = 1
  if (job.channel === "digest") { count = await digestCount(ctx, job.networkId, job.recipientPersonId, Date.now()); if (!count) return null }
  else if (job.channel === "call") { if (!job.callId || !(await incomingCallAllowed(ctx, job.networkId, job.recipientPersonId, job.callId))) return null }
  else { const notification = job.notificationId ? await ctx.db.get(job.notificationId) : null; if (!notification || notification.networkId !== job.networkId || notification.recipientPersonId !== job.recipientPersonId || !(await pushAllowed(ctx, notification))) return null }
  const subscription = job.subscriptionId ? await ctx.db.get(job.subscriptionId) : null
  if (job.channel !== "digest" && (!subscription || !subscription.active || subscription.networkId !== job.networkId || subscription.personId !== job.recipientPersonId || subscription.applicationId !== job.applicationId)) return null
  if (subscription && !(await subscriptionIsLive(ctx, subscription))) return null
  if (job.channel === "call" && application.native) {
    if (!subscription || !job.callId || !job.nativeBindingId || !job.sessionGeneration || !job.nativeExpiresAt || job.nativeExpiresAt <= Date.now() ||
      job.nativeBindingId !== subscription.nativeBindingId || job.sessionGeneration !== subscription.sessionGeneration || !(await nativeSubscriptionAllowed(ctx, subscription, network.slug))) return null
    const call = await ctx.db.get(job.callId)
    if (!call || !isNativeCallUuid(call.systemCallUuid)) return null
    return { subscription, authUserId: null, application, payload: { version: 1, kind: "antsia.call", phase: "ring", networkId: job.networkId, reference: job._id, applicationId: job.applicationId, bindingId: job.nativeBindingId, uuid: call.systemCallUuid, expiresAt: job.nativeExpiresAt } }
  }
  // Une ancienne incarnation native ne devient jamais une sonnerie Web après un changement de configuration.
  if (job.nativeBindingId !== undefined || subscription?.provider === "apns_voip") return null
  return { subscription, authUserId: job.channel === "digest" ? person.authUserId : null, payload: { version: 1 as const, networkId: job.networkId, reference: job._id, count, locale: person.locale ?? "fr" as const, url: applicationNotificationUrl(application) } }
}

export const finish = internalMutation({
  args: { jobId: v.id("notificationDeliveryJobs"), leaseToken: v.string(), state: deliveryStateValidator, resultCode: v.optional(v.union(v.literal("configuration"), v.literal("invalid_subscription"), v.literal("transport"), v.literal("policy"), v.literal("expired"))), providerReceiptId: v.optional(v.string()) },
  returns: v.null(), handler: async (ctx, args) => {
    const job = await ctx.db.get(args.jobId)
    if (!job || job.state !== "delivering" || job.leaseToken !== args.leaseToken) return null
    const now = Date.now()
    const state = args.state === "queued" && job.attempts >= DELIVERY_MAX_ATTEMPTS ? "failed" : args.state
    await ctx.db.patch(job._id, { state, resultCode: args.resultCode, providerReceiptId: args.providerReceiptId ?? job.providerReceiptId, leaseUntil: undefined, leaseToken: undefined, nextAttemptAt: now + (args.providerReceiptId || job.providerReceiptId ? 15 * 60_000 : 30_000 * 2 ** job.attempts), updatedAt: now })
    if (args.resultCode === "invalid_subscription" && job.subscriptionId) {
      const subscription = await ctx.db.get(job.subscriptionId)
      if (subscription && (job.sessionGeneration === undefined || job.sessionGeneration === subscription.sessionGeneration && job.nativeBindingId === subscription.nativeBindingId)) await ctx.db.patch(subscription._id, { active: false, failureCount: subscription.failureCount + 1, updatedAt: now })
    }
    return null
  },
})
