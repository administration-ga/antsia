/** MP06c : vue privée minimale de préparation ; aucune opération ni donnée de planning. */
import { COMMERCE_MERCHANT_CAPABILITIES, COMMERCE_MERCHANT_MISSING, COMMERCE_MERCHANT_TARGETS, type CommerceMerchantReadAccepted } from "@antsia/social-domain/commerce-merchant"
import { type Infer, v } from "convex/values"

import { literals } from "../../lib/validators"

export const merchantPreparationViewValidator = v.object({
  checkedAt: v.number(), expiresAt: v.number(),
  publishedCatalog: v.object({ available: v.boolean(), revision: v.union(v.number(), v.null()) }),
  servicesEnabled: v.boolean(),
  capabilities: v.array(v.object({ key: literals(COMMERCE_MERCHANT_CAPABILITIES), canOpen: v.boolean(), target: v.union(literals(COMMERCE_MERCHANT_TARGETS), v.null()), missing: v.array(literals(COMMERCE_MERCHANT_MISSING)) })),
})
export type MerchantPreparationView = Infer<typeof merchantPreparationViewValidator>
export const merchantPreparationResultValidator = v.union(
  v.object({ outcome: v.literal("ready"), preparation: merchantPreparationViewValidator, proAppOrigin: v.string(), proShopRef: v.string() }),
  v.object({ outcome: v.union(v.literal("unavailable"), v.literal("refused")) }),
)
export type MerchantPreparationResult = Infer<typeof merchantPreparationResultValidator>

/** Champs explicitement destinés au panneau ; l'enveloppe et ses corrélations restent internes. */
export function merchantPreparationView(value: CommerceMerchantReadAccepted): MerchantPreparationView {
  return {
    checkedAt: value.checkedAt, expiresAt: value.expiresAt, publishedCatalog: { ...value.publishedCatalog }, servicesEnabled: value.servicesEnabled,
    capabilities: value.capabilities.map(capability => ({ key: capability.key, canOpen: capability.canOpen, target: capability.target, missing: [...capability.missing] })),
  }
}

/** Opt-in de lecture seulement ; il ne remplace ni consentement ni mandat PRO. */
export function merchantPreparationEnabled(): boolean {
  return process.env.ANTSIA_COMMERCE_MERCHANT_READ_ENABLED === "true"
}
