/** MP05 : conditions publiques figées, jamais le brouillon du vendeur. */
import { parseCommerceStorefrontTerms } from "@antsia/social-domain/commerce/storefrontTerms"
import { type Infer, v } from "convex/values"
import type { Doc, Id } from "../../_generated/dataModel"
import type { QueryCtx } from "../../_generated/server"
import { canReadModeratedContent, contentState } from "../moderation/policy"
import { readableCatalogMapping } from "./catalogAccess"

const money = v.object({ amount: v.number(), currency: v.literal("XAF") })
export const storefrontTermsValidator = v.object({
  version: v.literal(1), publishedAt: v.number(),
  pickup: v.optional(v.object({ points: v.array(v.object({ establishmentRef: v.string(), label: v.string() })) })),
  delivery: v.optional(v.object({ country: v.literal("GA"), localities: v.array(v.string()), label: v.string(), fee: money, leadTimeDays: v.optional(v.number()) })),
  fees: v.optional(v.array(v.object({ kind: v.union(v.literal("packaging"), v.literal("service")), label: v.string(), amount: money }))),
  returns: v.optional(v.object({ summary: v.string() })), warranty: v.optional(v.object({ summary: v.string() })),
})
export type StorefrontTermsDto = Infer<typeof storefrontTermsValidator>
export async function readableStorefrontTerms(ctx: Pick<QueryCtx, "db">, root: Doc<"networks">, shopId: Id<"shops">, reader?: Id<"persons">): Promise<StorefrontTermsDto | undefined> {
  const live = await readableCatalogMapping(ctx, root, shopId, reader)
  if (!live || (await contentState(ctx, "commerceStorefront", live.parentHead._id))?.status !== "published" || !await canReadModeratedContent(ctx, "commerceStorefront", live.parentHead._id, reader)) return undefined
  const terms = parseCommerceStorefrontTerms(live.parent.storefrontTerms)
  if (!terms) return undefined
  return { version: 1, publishedAt: terms.publishedAt,
    ...(terms.pickup ? { pickup: { points: terms.pickup.points.map(point => ({ ...point })) } } : {}),
    ...(terms.delivery ? { delivery: { ...terms.delivery, localities: [...terms.delivery.localities], fee: { ...terms.delivery.fee } } } : {}),
    ...(terms.fees ? { fees: terms.fees.map(fee => ({ ...fee, amount: { ...fee.amount } })) } : {}),
    ...(terms.returns ? { returns: { ...terms.returns } } : {}), ...(terms.warranty ? { warranty: { ...terms.warranty } } : {}),
  }
}
