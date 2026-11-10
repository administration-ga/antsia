/** MP06c : lecture privée volontaire du titulaire exact ; aucune opération de gestion exécutée. */
import { makeFunctionReference } from "convex/server"
import { v } from "convex/values"

import type { Id } from "../../_generated/dataModel"
import { networkAction } from "../../lib/functions"
import { readCommerceLinkConfig } from "./commerceLinkConfig"
import { randomLinkId } from "./commerceLinkCrypto"
import type { MerchantPreparationAdmission } from "./merchantPreparation"
import { sendMerchantPreparation } from "./merchantPreparationClient"
import { merchantPreparationEnabled, merchantPreparationResultValidator, type MerchantPreparationResult } from "./merchantPreparationRules"

type Net = { networkId: Id<"networks"> }
const admit = makeFunctionReference<"mutation", Net & { shopId: Id<"shops">; requestId: string; configFingerprint: string }, MerchantPreparationAdmission | null>("modules/shops/merchantPreparation:admit")
const authorize = makeFunctionReference<"query", Net & { admission: MerchantPreparationAdmission }, boolean>("modules/shops/merchantPreparation:authorize")
const finish = makeFunctionReference<"query", Net & { admission: MerchantPreparationAdmission; rawResponse?: string; httpStatus?: number }, MerchantPreparationResult>("modules/shops/merchantPreparation:finish")

export const read = networkAction({
  minStatus: "declaree", args: { shopId: v.id("shops") }, returns: merchantPreparationResultValidator,
  handler: async (ctx, args): Promise<MerchantPreparationResult> => {
    if (!merchantPreparationEnabled()) return { outcome: "unavailable" }
    const config = await readCommerceLinkConfig()
    if (!config) return { outcome: "unavailable" }
    const admission = await ctx.runMutation(admit, { networkId: ctx.networkId, shopId: args.shopId, requestId: randomLinkId(), configFingerprint: config.fingerprint })
    if (!admission || !await ctx.runQuery(authorize, { networkId: ctx.networkId, admission })) return { outcome: "unavailable" }
    const response = await sendMerchantPreparation(config, admission.rawBody)
    return await ctx.runQuery(finish, { networkId: ctx.networkId, admission, ...(response ?? {}) })
  },
})
