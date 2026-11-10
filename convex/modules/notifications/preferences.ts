/** PA5 — les choix de livraison d'une personne dans un réseau ; aucun consentement implicite. */
import { DEFAULT_WEEKLY_NOTIFICATION_LIMIT, MAX_WEEKLY_NOTIFICATION_LIMIT, NOTIFICATION_CATEGORIES, type NotificationCategory } from "@antsia/social-domain/notificationDelivery"
import { v } from "convex/values"
import type { Id } from "../../_generated/dataModel"
import type { QueryCtx } from "../../_generated/server"
import { getMembership, isActiveMember } from "../../lib/access"
import { notificationConsent } from "./consent"
import { fail, notFound } from "../../lib/errors"
import { personMutation, personQuery } from "../../lib/functions"
import { enforceRateLimit } from "../../lib/rateLimit"
import { notificationCategorySettingsValidator } from "./tables"

export type CategorySettings = Record<NotificationCategory, boolean>
export function defaultCategorySettings(): CategorySettings {
  return Object.fromEntries(NOTIFICATION_CATEGORIES.map((category) => [category, true])) as CategorySettings
}

export async function deliveryPreferences(ctx: Pick<QueryCtx, "db">, networkId: Id<"networks">, personId: Id<"persons">) {
  const row = await ctx.db.query("notificationPreferences").withIndex("by_network_person", (q) => q.eq("networkId", networkId).eq("personId", personId)).unique()
  return { pushCategories: row?.pushCategories ?? defaultCategorySettings(), digestCategories: row?.digestCategories ?? defaultCategorySettings(), emailDigest: row?.emailDigest ?? false, weeklyLimit: row?.weeklyLimit ?? DEFAULT_WEEKLY_NOTIFICATION_LIMIT }
}

/** @selfScoped Réglages personnels : accessibles même suspendu, sans contenu du réseau. */
export const getMine = personQuery({ args: { networkId: v.id("networks") }, handler: async (ctx, args) => {
  if (!(await getMembership(ctx, args.networkId, ctx.person._id))) return notFound()
  const prefs = await deliveryPreferences(ctx, args.networkId, ctx.person._id)
  return { ...prefs, emailDigest: prefs.emailDigest && await notificationConsent(ctx, args.networkId, ctx.person._id, "email_digest") }
} })

/** @selfScoped Seules ses préférences ; une personne inactive peut réduire/revoquer mais pas activer. */
export const update = personMutation({
  args: { networkId: v.id("networks"), pushCategories: v.optional(notificationCategorySettingsValidator), digestCategories: v.optional(notificationCategorySettingsValidator), emailDigest: v.optional(v.boolean()), weeklyLimit: v.optional(v.number()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, "notification.settings", ctx.person._id)
    if (args.weeklyLimit !== undefined && (!Number.isInteger(args.weeklyLimit) || args.weeklyLimit < 0 || args.weeklyLimit > MAX_WEEKLY_NOTIFICATION_LIMIT)) return fail("invalidArgument", { field: "weeklyLimit" })
    const current = await deliveryPreferences(ctx, args.networkId, ctx.person._id)
    if (!(await getMembership(ctx, args.networkId, ctx.person._id))) return notFound()
    if (!(await isActiveMember(ctx, args.networkId, ctx.person._id))) {
      const enables = (args.emailDigest === true && !current.emailDigest)
        || (args.weeklyLimit !== undefined && args.weeklyLimit > current.weeklyLimit)
        || Object.entries(args.pushCategories ?? {}).some(([key, value]) => value && !current.pushCategories[key as NotificationCategory])
        || Object.entries(args.digestCategories ?? {}).some(([key, value]) => value && !current.digestCategories[key as NotificationCategory])
      if (enables) return notFound()
    }
    const row = await ctx.db.query("notificationPreferences").withIndex("by_network_person", (q) => q.eq("networkId", args.networkId).eq("personId", ctx.person._id)).unique()
    const { networkId, ...updates } = args
    const fields = { ...current, ...updates, updatedAt: Date.now() }
    if (row) await ctx.db.patch(row._id, fields)
    else await ctx.db.insert("notificationPreferences", { networkId, personId: ctx.person._id, ...fields })
    return null
  },
})
