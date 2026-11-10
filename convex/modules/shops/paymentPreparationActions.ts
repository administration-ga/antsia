/** MP07b : lecture privée volontaire du titulaire exact ; aucune opération de gestion exécutée. */
import { makeFunctionReference } from "convex/server"
import { v } from "convex/values"

import type { Id } from "../../_generated/dataModel"
import { networkAction } from "../../lib/functions"
import { readCommerceLinkConfig } from "./commerceLinkConfig"
import { randomLinkId } from "./commerceLinkCrypto"
import type { PaymentPreparationAdmission } from "./paymentPreparation"
import { sendPaymentPreparation } from "./paymentPreparationClient"
import { paymentPreparationEnabled, paymentPreparationResultValidator, type PaymentPreparationResult } from "./paymentPreparationRules"

type Net = { networkId: Id<"networks"> }
const admit = makeFunctionReference<"mutation", Net & { shopId: Id<"shops">; requestId: string; configFingerprint: string }, PaymentPreparationAdmission | null>("modules/shops/paymentPreparation:admit")
const authorize = makeFunctionReference<"query", Net & { admission: PaymentPreparationAdmission }, boolean>("modules/shops/paymentPreparation:authorize")
const finish = makeFunctionReference<"query", Net & { admission: PaymentPreparationAdmission; rawResponse?: string; httpStatus?: number }, PaymentPreparationResult>("modules/shops/paymentPreparation:finish")

export const read = networkAction({
  minStatus: "declaree", args: { shopId: v.id("shops") }, returns: paymentPreparationResultValidator,
  handler: async (ctx, args): Promise<PaymentPreparationResult> => {
    if (!paymentPreparationEnabled()) return { outcome: "unavailable" }
    const config = await readCommerceLinkConfig()
    if (!config) return { outcome: "unavailable" }
    const admission = await ctx.runMutation(admit, { networkId: ctx.networkId, shopId: args.shopId, requestId: randomLinkId(), configFingerprint: config.fingerprint })
    if (!admission || !await ctx.runQuery(authorize, { networkId: ctx.networkId, admission })) return { outcome: "unavailable" }
    const response = await sendPaymentPreparation(config, admission.rawBody)
    return await ctx.runQuery(finish, { networkId: ctx.networkId, admission, ...(response ?? {}) })
  },
})
