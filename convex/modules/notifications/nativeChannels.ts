/** P17c — preuve bornée d'un canal natif ; un booléen d'abonnement ne suffit pas. */
import { isNativeCallUuid } from "@antsia/social-contracts/native-calls"
import { MAX_PUSH_SUBSCRIPTIONS, notificationWeekStart } from "@antsia/social-domain/notificationDelivery"
import type { Doc, Id } from "../../_generated/dataModel"
import type { QueryCtx } from "../../_generated/server"
import { memberHasStatus } from "../../lib/access"
import { nativeCallApplication } from "./configuration"
import { notificationConsent } from "./consent"
import { deliveryPreferences } from "./preferences"
import { subscriptionIsLive } from "./sessionBinding"

type ReadCtx = Pick<QueryCtx, "db" | "runQuery">
export async function nativeSubscriptionAllowed(ctx: ReadCtx, subscription: Doc<"pushSubscriptions">, networkSlug: string): Promise<boolean> {
  const app = nativeCallApplication(subscription.applicationId, networkSlug)
  return !!app?.native && /^[A-Za-z0-9_-]{8,128}$/u.test(subscription.deviceId) && subscription.credential.provider === subscription.provider && isNativeCallUuid(subscription.nativeBindingId) && /^[a-f0-9]{64}$/u.test(subscription.sessionGeneration ?? "") &&
    (app.native.platform === "ios" ? subscription.provider === "apns_voip" : subscription.provider === "fcm") && await subscriptionIsLive(ctx, subscription)
}

export async function hasLiveNativeCallChannel(ctx: ReadCtx, networkId: Id<"networks">, personId: Id<"persons">, now: number): Promise<boolean> {
  const network = await ctx.db.get(networkId)
  if (!network || network.status !== "active" || !(await memberHasStatus(ctx, networkId, personId, "declaree"))) return false
  const calls = await ctx.db.query("callPreferences").withIndex("by_person", q => q.eq("personId", personId)).unique()
  if (calls?.pushIncoming === false || calls?.dnd && calls.dnd.until > now) return false
  const delivery = await deliveryPreferences(ctx, networkId, personId)
  if (!delivery.pushCategories.calls || delivery.weeklyLimit <= 0 || !(await notificationConsent(ctx, networkId, personId, "notifications"))) return false
  const usage = await ctx.db.query("notificationWeeklyUsage").withIndex("by_network_person_week", q => q.eq("networkId", networkId).eq("personId", personId).eq("weekStart", notificationWeekStart(now))).unique()
  if ((usage?.reserved ?? 0) >= delivery.weeklyLimit) return false
  const rows = await ctx.db.query("pushSubscriptions").withIndex("by_network_person_active", q => q.eq("networkId", networkId).eq("personId", personId).eq("active", true)).take(MAX_PUSH_SUBSCRIPTIONS + 1)
  if (rows.length > MAX_PUSH_SUBSCRIPTIONS) return false
  for (const row of rows) if (await nativeSubscriptionAllowed(ctx, row, network.slug)) return true
  return false
}
