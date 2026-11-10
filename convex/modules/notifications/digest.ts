/** PA5 — digest par réseau, compte vérifié relu, texte neutre et réservation durable. */
import { neutralNotificationMessage } from "@antsia/social-domain/notificationDelivery"
import { BRAND_NAME } from "@antsia/social-contracts/brand"
import { Resend } from "@convex-dev/resend"
import { v } from "convex/values"
import { components, internal } from "../../_generated/api"
import { internalAction, internalMutation } from "../../_generated/server"
import { prepareDelivery } from "./deliveries"

export const deliver = internalAction({ args: { jobId: v.id("notificationDeliveryJobs") }, returns: v.null(), handler: async (ctx, args): Promise<null> => {
  const job = await ctx.runMutation(internal.modules.notifications.deliveries.claim, args)
  if (!job || job.channel !== "digest") return null
  try {
    await ctx.runMutation(internal.modules.notifications.digest.sendReserved, { ...args, leaseToken: job.leaseToken })
  } catch { await ctx.runMutation(internal.modules.notifications.deliveries.finish, { ...args, leaseToken: job.leaseToken, state: "queued", resultCode: "transport" }) }
  return null
} })

/** Le composant Resend et le statut du job sont écrits dans LA MÊME transaction. */
export const sendReserved = internalMutation({ args: { jobId: v.id("notificationDeliveryJobs"), leaseToken: v.string() }, returns: v.null(), handler: async (ctx, args): Promise<null> => {
    const job = await ctx.db.get(args.jobId)
    if (!job || job.channel !== "digest" || job.state !== "delivering" || job.leaseToken !== args.leaseToken || (job.leaseUntil ?? 0) <= Date.now()) return null
    const finish = async (state: "sent" | "cancelled" | "unavailable", resultCode?: "configuration" | "policy") => await ctx.db.patch(job._id, { state, resultCode, leaseToken: undefined, leaseUntil: undefined, updatedAt: Date.now() })
    if (!process.env.RESEND_API_KEY?.trim() || !process.env.RESEND_FROM_ADDRESS?.trim()) { await finish("unavailable", "configuration"); return null }
    const first = await prepareDelivery(ctx, args.jobId, args.leaseToken)
    if (!first?.authUserId) { await finish("cancelled", "policy"); return null }
    const user: unknown = await ctx.runQuery(components.betterAuth.adapter.findOne, { model: "user", where: [{ field: "_id", value: first.authUserId }], select: ["_id", "email", "emailVerified"] })
    if (!user || typeof user !== "object" || !("_id" in user) || user._id !== first.authUserId || !("emailVerified" in user) || user.emailVerified !== true || !("email" in user) || typeof user.email !== "string" || user.email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(user.email)) { await finish("cancelled", "policy"); return null }
    // Une révocation pendant la lecture du compte ferme aussi le transport.
    const current = await prepareDelivery(ctx, args.jobId, args.leaseToken)
    if (!current || current.authUserId !== first.authUserId || !("locale" in current.payload)) { await finish("cancelled", "policy"); return null }
    await new Resend(components.resend, { testMode: false }).sendEmail(ctx as unknown as Parameters<Resend["sendEmail"]>[0], { from: process.env.RESEND_FROM_ADDRESS, to: user.email, subject: BRAND_NAME, text: `${neutralNotificationMessage(current.payload.locale, current.payload.count)}\n${current.payload.url}` })
    // « sent » signifie admission par le composant ; la réception e-mail relève de la recette fournisseur.
    await finish("sent")
    return null
} })
