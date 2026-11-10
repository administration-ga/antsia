/** MP07b : préparation financière privée, sans compte ni autorisation de paiement. */
import {
  COMMERCE_PAYMENT_PREPARATION_MISSING, COMMERCE_PAYMENT_PREPARATION_POLICY_MODES,
  COMMERCE_PAYMENT_PREPARATION_RAILS, COMMERCE_PAYMENT_PREPARATION_TARGETS,
  type CommercePaymentPreparationAccepted,
} from "@antsia/social-domain/commerce-payment-preparation"
import { type Infer, v } from "convex/values"

import { literals } from "../../lib/validators"

const missingValidator = v.array(literals(COMMERCE_PAYMENT_PREPARATION_MISSING))
const nullableNumber = v.union(v.number(), v.null())

export const paymentPreparationViewValidator = v.object({
  environment: v.union(v.literal("sandbox"), v.literal("production")),
  currency: v.literal("XAF"), checkedAt: v.number(), expiresAt: v.number(),
  countryScope: v.object({ platformCountry: v.union(v.string(), v.null()), sellerCountry: v.union(v.string(), v.null()) }),
  collection: v.object({ state: v.union(v.literal("closed"), v.literal("ready")), missing: missingValidator }),
  payout: v.object({ state: v.literal("closed"), missing: missingValidator }),
  beneficiary: v.object({ state: literals(["not_configured", "not_verified", "verified"] as const), label: v.union(v.string(), v.null()) }),
  policy: v.union(v.object({
    textVersion: v.string(), revision: v.number(), platformRevision: v.number(),
    mode: literals(COMMERCE_PAYMENT_PREPARATION_POLICY_MODES), platformBps: nullableNumber, sellerBps: nullableNumber,
    accepted: v.boolean(), acceptanceRevision: nullableNumber,
  }), v.null()),
  rails: v.array(v.object({
    rail: literals(COMMERCE_PAYMENT_PREPARATION_RAILS), qualified: v.boolean(),
    capabilities: v.object({ collect: v.boolean(), lookup: v.boolean(), refund: v.boolean(), payout: v.literal(false) }),
    missing: missingValidator,
  })),
  target: v.union(literals(COMMERCE_PAYMENT_PREPARATION_TARGETS), v.null()),
})
export type PaymentPreparationView = Infer<typeof paymentPreparationViewValidator>

export const paymentPreparationResultValidator = v.union(
  v.object({ outcome: v.literal("ready"), preparation: paymentPreparationViewValidator, proAppOrigin: v.string(), proShopRef: v.string() }),
  v.object({ outcome: v.union(v.literal("unavailable"), v.literal("refused")) }),
)
export type PaymentPreparationResult = Infer<typeof paymentPreparationResultValidator>

/** L'enveloppe corrélée et les références privées ne sont jamais transmises au panneau. */
export function paymentPreparationView(value: CommercePaymentPreparationAccepted): PaymentPreparationView {
  return {
    environment: value.environment, currency: value.currency, checkedAt: value.checkedAt, expiresAt: value.expiresAt,
    countryScope: { platformCountry: value.countryScope.platformCountry, sellerCountry: value.countryScope.sellerCountry },
    collection: { state: value.collection.state, missing: [...value.collection.missing] },
    payout: { state: value.payout.state, missing: [...value.payout.missing] },
    beneficiary: { state: value.beneficiary.state, label: value.beneficiary.label },
    policy: value.policy === null ? null : {
      textVersion: value.policy.textVersion, revision: value.policy.revision, platformRevision: value.policy.platformRevision,
      mode: value.policy.mode, platformBps: value.policy.platformBps, sellerBps: value.policy.sellerBps,
      accepted: value.policy.accepted, acceptanceRevision: value.policy.acceptanceRevision,
    },
    rails: value.rails.map(rail => ({ rail: rail.rail, qualified: rail.qualified,
      capabilities: { collect: rail.capabilities.collect, lookup: rail.capabilities.lookup, refund: rail.capabilities.refund, payout: rail.capabilities.payout },
      missing: [...rail.missing],
    })),
    target: value.target,
  }
}

/** Opt-in indépendant : aucune modification des mandats ni de la configuration héritée. */
export function paymentPreparationEnabled(): boolean {
  return process.env.ANTSIA_COMMERCE_PAYMENT_PREPARATION_ENABLED === "true"
}
