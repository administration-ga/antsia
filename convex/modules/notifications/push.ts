"use node"

/** PA5 — une action sous bail, relecture serveur, aucun aperçu ni erreur fournisseur exposée. */
import { v } from "convex/values"
import { internal } from "../../_generated/api"
import { internalAction } from "../../_generated/server"
import { deliverPush, readExpoReceipt } from "./transports"

export const deliver = internalAction({
  args: { jobId: v.id("notificationDeliveryJobs") }, returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const job = await ctx.runMutation(internal.modules.notifications.deliveries.claim, args)
    if (!job || job.channel === "digest") return null
    const prepared = await ctx.runQuery(internal.modules.notifications.deliveries.deliveryContext, { ...args, leaseToken: job.leaseToken })
    const finish = async (state: "sent" | "queued" | "accepted" | "cancelled" | "unavailable" | "failed", resultCode?: "configuration" | "invalid_subscription" | "transport" | "policy", providerReceiptId?: string) => {
      await ctx.runMutation(internal.modules.notifications.deliveries.finish, { ...args, leaseToken: job.leaseToken, state, ...(resultCode ? { resultCode } : {}), ...(providerReceiptId ? { providerReceiptId } : {}) })
    }
    if (!prepared?.subscription) { await finish("cancelled", "policy"); return null }
    if (job.providerReceiptId && Date.now() - job.createdAt > 24 * 60 * 60_000) { await finish("failed", "transport"); return null }
    // Un reçu en attente est consulté, jamais réémis comme un nouveau push.
    const guard = async () => (await ctx.runQuery(internal.modules.notifications.deliveries.deliveryContext, { ...args, leaseToken: job.leaseToken })) !== null
    const result = job.providerReceiptId ? await readExpoReceipt(job.providerReceiptId) : await deliverPush(prepared.subscription.credential, prepared.payload, job.channel === "call", guard, prepared.application)
    if (result.status === "sent") await finish("sent")
    else if (result.status === "accepted") {
      // Expo recommande de vérifier les reçus ; 24 h est la borne locale.
      if (Date.now() - job.createdAt > 24 * 60 * 60_000) await finish("failed", "transport")
      else await finish("accepted", undefined, result.receiptId)
    } else if (result.status === "unavailable") await finish("unavailable", "configuration")
    else if (result.status === "cancelled") await finish("cancelled", "policy")
    else if (result.status === "invalid") await finish("failed", "invalid_subscription")
    else await finish(job.providerReceiptId ? "accepted" : "queued", "transport")
    return null
  },
})
