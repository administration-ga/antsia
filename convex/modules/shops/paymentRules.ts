/** P12 : vues privées, jamais une preuve tirée du retour navigateur. */
import { COMMERCE_ORDER_STATES, COMMERCE_PAYMENT_STATES } from "@antsia/social-domain/commerce/lifecycle"
import { COMMERCE_PAYMENT_CONSENT_VERSION } from "@antsia/social-domain/commerce-payment"
import { type Infer, v } from "convex/values"
import type { Doc } from "../../_generated/dataModel"
import { literals } from "../../lib/validators"
import { checkoutMoneyValidator } from "./checkoutRules"

export const PAYMENT_CONSENT_VERSION = COMMERCE_PAYMENT_CONSENT_VERSION
export const PAYMENT_REQUEST_TTL_MS = 60_000
export const PAYMENT_PRIVATE_TTL_MS = 30 * 60_000
export const PAYMENT_LEASE_MS = 30_000
export const paymentLocalStateValidator = literals(["prepared", "submitting", "pending", "requires_action", "processing", "succeeded", "failed", "cancelled", "unavailable", "unknown", "refused"] as const)
export const paymentActionValidator = v.union(v.object({ kind: v.literal("none") }), v.object({ kind: v.literal("await_provider_confirmation") }), v.object({ kind: v.literal("provider_redirect"), url: v.string() }))
export const paymentOptionsValidator = v.object({ checkoutRef: v.string(), available: v.boolean(), reason: v.union(literals(["configuration_missing", "policy_closed", "provider_not_configured", "checkout_unavailable"] as const), v.null()), amount: checkoutMoneyValidator, expiresAt: v.number(), providerLabel: v.union(v.string(), v.null()), beneficiaryLabel: v.union(v.string(), v.null()), modes: v.array(v.string()), consentTextVersion: v.string(), readinessRef: v.union(v.string(), v.null()), readinessExpiresAt: v.union(v.number(), v.null()) })
export const paymentSnapshotValidator = v.object({ checkoutRef: v.string(), paymentRef: v.string(), orderRef: v.string(), paymentState: literals(COMMERCE_PAYMENT_STATES), orderState: literals(COMMERCE_ORDER_STATES), stockState: literals(["held", "consumed", "expired", "released"] as const), refundState: literals(["none", "requested", "processing", "confirmed", "failed", "rejected"] as const), reviewRequired: v.boolean(), revision: v.number(), updatedAt: v.number(), amount: checkoutMoneyValidator, action: v.union(paymentActionValidator, v.null()) })
export const paymentAttemptValidator = v.object({
  paymentAttemptId: v.string(), checkoutAttemptId: v.string(), state: paymentLocalStateValidator, amount: checkoutMoneyValidator, checkoutRef: v.string(),
  paymentRef: v.union(v.string(), v.null()), orderRef: v.union(v.string(), v.null()), paymentState: v.union(literals(COMMERCE_PAYMENT_STATES), v.null()), orderState: v.union(literals(COMMERCE_ORDER_STATES), v.null()), stockState: v.union(literals(["held", "consumed", "expired", "released"] as const), v.null()), refundState: v.union(literals(["none", "requested", "processing", "confirmed", "failed", "rejected"] as const), v.null()), reviewRequired: v.boolean(), revision: v.number(), observedAt: v.union(v.number(), v.null()), createdAt: v.number(), updatedAt: v.number(), action: v.union(paymentActionValidator, v.null()), canRetry: v.boolean(), canRefresh: v.boolean(), canRequestRefund: v.boolean(), reason: v.union(v.string(), v.null()),
})
export type PaymentAttempt = Infer<typeof paymentAttemptValidator>
export const paymentContextValidator = v.object({ checkoutAttemptId: v.string(), available: v.boolean(), reason: v.union(literals(["configuration_missing", "policy_closed", "provider_not_configured", "checkout_unavailable", "refresh_required"] as const), v.null()), amount: v.union(checkoutMoneyValidator, v.null()), expiresAt: v.union(v.number(), v.null()), providerLabel: v.union(v.string(), v.null()), beneficiaryLabel: v.union(v.string(), v.null()), modes: v.array(v.string()), consentTextVersion: v.string(), readinessRef: v.union(v.string(), v.null()), readinessExpiresAt: v.union(v.number(), v.null()), existing: v.union(paymentAttemptValidator, v.null()) })
export type PaymentContext = Infer<typeof paymentContextValidator>
export const paymentActionResultValidator = v.union(v.object({ outcome: v.literal("attempt"), attempt: paymentAttemptValidator }), v.object({ outcome: v.union(v.literal("unavailable"), v.literal("refused")) }))
export type PaymentActionResult = Infer<typeof paymentActionResultValidator>
export const paymentOptionsResultValidator = v.object({ outcome: v.union(v.literal("ready"), v.literal("unavailable"), v.literal("refused")) })
export type PaymentOptionsResult = Infer<typeof paymentOptionsResultValidator>
export const paymentRefundReasonValidator = literals(["changed_mind", "duplicate_payment", "late_payment", "other"] as const)

/** Les redirections sont une action facultative vers une origine configurée côté serveur. */
export function paymentActionAllowed(action: Infer<typeof paymentActionValidator> | null): boolean {
  if (!action || action.kind !== "provider_redirect") return true
  try {
    const url = new URL(action.url)
    const origins = (process.env.ANTSIA_COMMERCE_PAYMENT_REDIRECT_ORIGINS ?? "").split(",").map((value: string) => value.trim()).filter(Boolean)
    return url.protocol === "https:" && !url.username && !url.password && !url.hash && origins.some((value: string) => value === url.origin)
  } catch { return false }
}

export function projectPaymentAttempt(row: Doc<"shopPaymentAttempts">, controlsAllowed = false): PaymentAttempt {
  const snapshot = row.snapshot
  const action = snapshot?.action ?? row.startAction ?? null
  return {
    paymentAttemptId: row.paymentAttemptId, checkoutAttemptId: row.checkoutAttemptId, state: row.state, amount: row.amount, checkoutRef: row.checkoutRef,
    paymentRef: snapshot?.paymentRef ?? row.paymentRef ?? null, orderRef: snapshot?.orderRef ?? row.orderRef ?? null,
    paymentState: snapshot?.paymentState ?? row.paymentState ?? null, orderState: snapshot?.orderState ?? null, stockState: snapshot?.stockState ?? null, refundState: snapshot?.refundState ?? null,
    reviewRequired: snapshot?.reviewRequired ?? false, revision: snapshot?.revision ?? 0, observedAt: row.observedAt ?? null, createdAt: row.createdAt, updatedAt: row.updatedAt,
    action: paymentActionAllowed(action) ? action : null,
    canRetry: controlsAllowed && row.state === "unknown" && row.rawBody !== undefined && row.requestExpiresAt > Date.now() && (row.authorizationExpiresAt ?? 0) > Date.now(),
    canRefresh: controlsAllowed && row.dispatchedAt !== undefined,
    canRequestRefund: controlsAllowed && snapshot?.paymentState === "succeeded" && (snapshot.refundState === "none" || snapshot.refundState === "failed" || snapshot.refundState === "rejected"), reason: !paymentActionAllowed(action) ? "provider_redirect_refused" : row.reason ?? null,
  }
}
