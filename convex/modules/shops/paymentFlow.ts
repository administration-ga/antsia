/** P12 : octets durables, accord lié au bénéficiaire, baux et session recontrôlés autour du HTTP. */
import { COMMERCE_COMMAND_SCOPES, parseCommerceCommandRequest, parseCommerceCommandResponse, type CommerceCommandRequest } from "@antsia/social-domain/commerce/command"
import { COMMERCE_COMMAND_CONTRACT, commerceCanonicalJson } from "@antsia/social-domain/commerce/primitives"
import { COMMERCE_PAYMENT_CONTROL_CONTRACT, parseCommercePaymentControlRequest, parseCommercePaymentControlResponse, type CommercePaymentControlRequest } from "@antsia/social-domain/commerce-payment"
import { type Infer, v } from "convex/values"
import type { Doc } from "../../_generated/dataModel"
import { internalMutation, type MutationCtx } from "../../_generated/server"
import { requireMembership } from "../../lib/access"
import { enforceRateLimit } from "../../lib/rateLimit"
import { ownedPaymentAttempt, paymentAuthority, paymentOpaque } from "./paymentAccess"
import { sha256Hex, validLinkToken } from "./commerceLinkCrypto"
import { checkoutMoneyValidator } from "./checkoutRules"
import { PAYMENT_CONSENT_VERSION, PAYMENT_LEASE_MS, PAYMENT_PRIVATE_TTL_MS, PAYMENT_REQUEST_TTL_MS, paymentActionAllowed, paymentActionResultValidator, paymentOptionsResultValidator, paymentRefundReasonValidator, projectPaymentAttempt, type PaymentActionResult, type PaymentOptionsResult } from "./paymentRules"
import { paymentScopeFields } from "./paymentTables"
import { refuseNewEngagementWithShop } from "./shopPause"

const scopeValidator = v.object(paymentScopeFields)
type Scope = Infer<typeof scopeValidator>
export const paymentDeliveryValidator = v.object({ requestId: v.string(), rawBody: v.string(), leaseToken: v.string(), generation: v.number(), kind: v.union(v.literal("options"), v.literal("authorize_start"), v.literal("start"), v.literal("request_status"), v.literal("status"), v.literal("refund_request")), paymentAttemptId: v.optional(v.string()) })
export type PaymentDelivery = Infer<typeof paymentDeliveryValidator>
const admissionValidator = v.union(paymentDeliveryValidator, paymentActionResultValidator)
type Admission = PaymentDelivery | PaymentActionResult
type StartRequest = Extract<CommerceCommandRequest, { command: "payment.start" }>
const net = { networkId: v.id("networks") }
const deliveryArgs = { ...net, delivery: paymentDeliveryValidator }
const leaseArgs = { requestId: v.string(), leaseToken: v.string(), configFingerprint: v.string() }
const validLease = (value: { requestId: string; leaseToken: string }) => paymentOpaque(value.requestId) && validLinkToken(value.leaseToken)
const sameMoney = (left: { amount: number; currency: string }, right: { amount: number; currency: string }) => left.amount === right.amount && left.currency === right.currency

function copyScope(row: Scope): Scope {
  return { networkId: row.networkId, personId: row.personId, shopId: row.shopId, checkoutAttemptId: row.checkoutAttemptId, checkoutRef: row.checkoutRef, handle: row.handle, sessionDigest: row.sessionDigest, configFingerprint: row.configFingerprint, source: row.source, environment: row.environment, shopRef: row.shopRef, subjectRef: row.subjectRef }
}
async function currentAuthority(ctx: MutationCtx, scope: Scope, debit = false) {
  const current = await paymentAuthority(ctx, scope.networkId, scope.checkoutAttemptId, debit)
  return current && current.scope.personId === scope.personId && current.scope.sessionDigest === scope.sessionDigest && current.config.fingerprint === scope.configFingerprint && current.scope.subjectRef === scope.subjectRef && current.scope.shopRef === scope.shopRef ? current : null
}
function originalRequest(row: Doc<"shopPaymentAttempts">): StartRequest {
  // Exactement les octets initiaux ; aucun contact ou instrument bancaire dans cette projection.
  return { contract: COMMERCE_COMMAND_CONTRACT, version: 1, command: "payment.start", scope: COMMERCE_COMMAND_SCOPES["payment.start"], source: row.source, environment: row.environment, requestId: row.requestId, issuedAt: row.issuedAt, expiresAt: row.requestExpiresAt, subject: { kind: "buyer", ref: row.subjectRef, authVerifiedAt: row.issuedAt }, payload: { checkoutRef: row.checkoutRef, shopRef: row.shopRef, expectedTotal: row.amount, consent: { givenAt: row.consentedAt, purpose: "commerce_payment", textVersion: row.consentTextVersion } } }
}
async function requestRecord(ctx: MutationCtx, scope: Scope, request: CommercePaymentControlRequest | Extract<CommerceCommandRequest, { command: "request.status" }>, kind: Doc<"shopPaymentRequests">["kind"], leaseToken: string, generation: number, paymentAttemptId?: string): Promise<PaymentDelivery | null> {
  const rawBody = commerceCanonicalJson(request)
  if (!rawBody) return null
  await ctx.db.insert("shopPaymentRequests", { ...copyScope(scope), ...(paymentAttemptId ? { paymentAttemptId } : {}), kind, requestId: request.requestId, rawBody, bodySha256: await sha256Hex(rawBody), leaseToken, leaseUntil: Date.now() + PAYMENT_LEASE_MS, generation, expiresAt: request.expiresAt, privateUntil: Date.now() + PAYMENT_PRIVATE_TTL_MS, createdAt: Date.now() })
  return { kind, requestId: request.requestId, rawBody, leaseToken, generation, ...(paymentAttemptId ? { paymentAttemptId } : {}) }
}
function controlBase(scope: Scope, requestId: string, now: number): Omit<CommercePaymentControlRequest, "operation" | "payload"> {
  return { contract: COMMERCE_PAYMENT_CONTROL_CONTRACT, version: 1 as const, source: scope.source, environment: scope.environment, requestId, shopRef: scope.shopRef, issuedAt: now, expiresAt: now + PAYMENT_REQUEST_TTL_MS, subject: { kind: "buyer" as const, ref: scope.subjectRef, authVerifiedAt: now } }
}
async function dto(ctx: MutationCtx, row: Doc<"shopPaymentAttempts">): Promise<PaymentActionResult> {
  const fresh = await ctx.db.get(row._id)
  if (!fresh || fresh.privacyRevokedAt !== undefined) return { outcome: "refused" }
  const current = await paymentAuthority(ctx, fresh.networkId, fresh.checkoutAttemptId, false)
  const attempt = projectPaymentAttempt(fresh, !!current)
  return { outcome: "attempt", attempt: { ...attempt, canRetry: attempt.canRetry && !!await currentAuthority(ctx, fresh, true) } }
}

export const beginOptions = internalMutation({
  args: { ...net, ...leaseArgs, checkoutAttemptId: v.string() }, returns: v.union(paymentDeliveryValidator, v.null()),
  handler: async (ctx, args): Promise<PaymentDelivery | null> => {
    const current = await paymentAuthority(ctx, args.networkId, args.checkoutAttemptId, true)
    if (!current || current.config.fingerprint !== args.configFingerprint || !validLease(args)) return null
    await enforceRateLimit(ctx, "payment.control", current.access.person._id)
    return await requestRecord(ctx, current.scope, { ...controlBase(current.scope, args.requestId, Date.now()), operation: "options", payload: { checkoutRef: current.scope.checkoutRef } }, "options", args.leaseToken, 1)
  },
})

export const createStart = internalMutation({
  args: { ...net, ...leaseArgs, checkoutAttemptId: v.string(), paymentAttemptId: v.string(), authorizationRequestId: v.string(), expectedTotal: checkoutMoneyValidator, consentTextVersion: v.string(), readinessRef: v.string(), clientRequestId: v.string() }, returns: admissionValidator,
  handler: async (ctx, args): Promise<Admission> => {
    const access = await requireMembership(ctx, args.networkId, "declaree")
    if (!paymentOpaque(args.clientRequestId) || !paymentOpaque(args.paymentAttemptId) || !paymentOpaque(args.authorizationRequestId) || !validLease(args) || args.consentTextVersion !== PAYMENT_CONSENT_VERSION || !paymentOpaque(args.readinessRef)) return { outcome: "refused" }
    const intent = commerceCanonicalJson({ checkoutAttemptId: args.checkoutAttemptId, expectedTotal: args.expectedTotal, consentTextVersion: args.consentTextVersion, readinessRef: args.readinessRef })
    if (!intent) return { outcome: "refused" }
    const intentionSha256 = await sha256Hex(intent)
    const prior = await ctx.db.query("shopPaymentAttempts").withIndex("by_client", (q) => q.eq("personId", access.person._id).eq("networkId", args.networkId).eq("clientRequestId", args.clientRequestId)).unique()
    if (prior) return prior.intentionSha256 === intentionSha256 && prior.privacyRevokedAt === undefined ? await dto(ctx, prior) : { outcome: "refused" }
    const current = await paymentAuthority(ctx, args.networkId, args.checkoutAttemptId, true)
    if (!current || current.config.fingerprint !== args.configFingerprint || !current.checkout.result || !sameMoney(args.expectedTotal, current.checkout.result.total) || !Number.isSafeInteger(args.expectedTotal.amount) || args.expectedTotal.amount < 1) return { outcome: "refused" }
    // Une préparation ne reçoit qu'une intention. Une réponse perdue n'autorise pas un nouveau débit.
    const existing = await ctx.db.query("shopPaymentAttempts").withIndex("by_person_checkout", (q) => q.eq("personId", access.person._id).eq("networkId", args.networkId).eq("checkoutAttemptId", args.checkoutAttemptId)).unique()
    if (existing) return existing.privacyRevokedAt === undefined ? await dto(ctx, existing) : { outcome: "refused" }
    // CM-10 : lancer un paiement crée la commande chez PRO.GA, un engagement NOUVEAU : une boutique en pause le refuse
    // (`SHOP_PAUSED`). La préparation tenue n'est pas touchée ; un paiement déjà lancé suit son cours (rejeu ci-dessus).
    await refuseNewEngagementWithShop(ctx, current.scope.shopId)
    const cached = await ctx.db.query("shopPaymentOptions").withIndex("by_person_checkout", (q) => q.eq("personId", access.person._id).eq("networkId", args.networkId).eq("checkoutAttemptId", args.checkoutAttemptId)).unique()
    const now = Date.now()
    if (!cached || cached.sessionDigest !== current.scope.sessionDigest || cached.configFingerprint !== current.config.fingerprint || cached.validUntil <= now || !cached.options.available || cached.options.readinessRef !== args.readinessRef || (cached.options.readinessExpiresAt ?? 0) <= now || !sameMoney(cached.options.amount, args.expectedTotal)) return { outcome: "unavailable" }
    await enforceRateLimit(ctx, "payment.start", access.person._id)
    const request: StartRequest = { contract: COMMERCE_COMMAND_CONTRACT, version: 1, command: "payment.start", scope: COMMERCE_COMMAND_SCOPES["payment.start"], source: current.scope.source, environment: current.scope.environment, requestId: args.requestId, issuedAt: now, expiresAt: now + PAYMENT_REQUEST_TTL_MS, subject: { kind: "buyer", ref: current.scope.subjectRef, authVerifiedAt: now }, payload: { checkoutRef: current.scope.checkoutRef, shopRef: current.scope.shopRef, expectedTotal: args.expectedTotal, consent: { givenAt: now, purpose: "commerce_payment", textVersion: args.consentTextVersion } } }
    const rawBody = commerceCanonicalJson(request)
    if (!rawBody || !parseCommerceCommandRequest(rawBody, { source: current.scope.source, environment: current.scope.environment, nowMs: now }).ok) return { outcome: "refused" }
    const requestSha256 = await sha256Hex(rawBody)
    const delivery = await requestRecord(ctx, current.scope, { ...controlBase(current.scope, args.authorizationRequestId, now), operation: "authorize_start", payload: { checkoutRef: current.scope.checkoutRef, readinessRef: args.readinessRef, commandRequestId: request.requestId, commandRequestSha256: requestSha256 } }, "authorize_start", args.leaseToken, 1, args.paymentAttemptId)
    if (!delivery) return { outcome: "refused" }
    await ctx.db.insert("shopPaymentAttempts", { ...current.scope, paymentAttemptId: args.paymentAttemptId, clientRequestId: args.clientRequestId, readinessRef: args.readinessRef, intentionSha256, amount: args.expectedTotal, consentedAt: now, consentTextVersion: args.consentTextVersion, state: "prepared", requestId: request.requestId, requestSha256, rawBody, issuedAt: now, requestExpiresAt: request.expiresAt, privateUntil: now + PAYMENT_PRIVATE_TTL_MS, leaseToken: args.leaseToken, leaseUntil: now + PAYMENT_LEASE_MS, generation: 1, createdAt: now, updatedAt: now })
    return delivery
  },
})

export const beginOperation = internalMutation({
  args: { ...net, ...leaseArgs, paymentAttemptId: v.string(), operation: v.union(v.literal("status"), v.literal("retry"), v.literal("refund_request")), expectedRevision: v.optional(v.number()), reason: v.optional(paymentRefundReasonValidator), clientRequestId: v.optional(v.string()) }, returns: v.union(paymentDeliveryValidator, v.null()),
  handler: async (ctx, args): Promise<PaymentDelivery | null> => {
    const access = await requireMembership(ctx, args.networkId, "declaree")
    const row = await ownedPaymentAttempt(ctx, args.networkId, access.person._id, args.paymentAttemptId)
    const current = row ? await paymentAuthority(ctx, args.networkId, row.checkoutAttemptId, args.operation === "retry") : null
    if (!row || !current || current.config.fingerprint !== args.configFingerprint || !validLease(args) || (row.leaseUntil ?? 0) > Date.now()) return null
    await enforceRateLimit(ctx, args.operation === "refund_request" ? "payment.refund" : "payment.control", access.person._id)
    const now = Date.now(), generation = row.generation + 1
    if (args.operation === "retry") {
      // Reprise explicite seulement après lookup inconnu, avec les octets et l'accord initiaux encore valides.
      if (row.state !== "unknown" || row.lookupState !== "unknown" || (row.lastLookupAt ?? 0) < now - 10_000 || !row.rawBody || row.requestExpiresAt <= now || (row.authorizationExpiresAt ?? 0) <= now || row.sessionDigest !== current.scope.sessionDigest || row.configFingerprint !== current.config.fingerprint || await sha256Hex(row.rawBody) !== row.requestSha256) return null
      await ctx.db.patch(row._id, { leaseToken: args.leaseToken, leaseUntil: now + PAYMENT_LEASE_MS, generation, updatedAt: now })
      return { kind: "start", requestId: row.requestId, paymentAttemptId: row.paymentAttemptId, rawBody: row.rawBody, leaseToken: args.leaseToken, generation }
    }
    if (args.operation === "refund_request" && (!row.paymentRef || !row.snapshot || row.snapshot.paymentState !== "succeeded" || !["none", "failed", "rejected"].includes(row.snapshot.refundState) || row.snapshot.revision !== args.expectedRevision || !args.reason || !args.clientRequestId || !paymentOpaque(args.clientRequestId))) return null
    const refundIntention = args.operation === "refund_request" ? await sha256Hex(commerceCanonicalJson({ paymentAttemptId: row.paymentAttemptId, expectedRevision: args.expectedRevision, reason: args.reason }) ?? "") : null
    if (args.operation === "refund_request") {
      const prior = await ctx.db.query("shopPaymentRequests").withIndex("by_client", q => q.eq("personId", row.personId).eq("networkId", args.networkId).eq("kind", "refund_request").eq("clientRequestId", args.clientRequestId)).unique()
      if (prior) {
        // La même clé ne recrée pas un remboursement et ne renouvelle pas son délai.
        if (prior.intentionSha256 !== refundIntention || prior.paymentAttemptId !== row.paymentAttemptId || prior.doneAt !== undefined || !prior.rawBody || prior.expiresAt <= now || prior.sessionDigest !== current.scope.sessionDigest || prior.configFingerprint !== current.config.fingerprint) return null
        await ctx.db.patch(prior._id, { leaseToken: args.leaseToken, leaseUntil: now + PAYMENT_LEASE_MS, generation })
        await ctx.db.patch(row._id, { leaseToken: args.leaseToken, leaseUntil: now + PAYMENT_LEASE_MS, generation, updatedAt: now })
        return { kind: "refund_request", requestId: prior.requestId, rawBody: prior.rawBody, leaseToken: args.leaseToken, generation, paymentAttemptId: row.paymentAttemptId }
      }
    }
    const base = controlBase(current.scope, args.requestId, now)
    const kind = row.paymentRef ? args.operation : "request_status"
    if (args.operation === "refund_request" && kind === "request_status") return null
    const request: CommercePaymentControlRequest | Extract<CommerceCommandRequest, { command: "request.status" }> = kind === "request_status" ? { contract: COMMERCE_COMMAND_CONTRACT, version: 1, source: row.source, environment: row.environment, requestId: args.requestId, issuedAt: now, expiresAt: now + PAYMENT_REQUEST_TTL_MS, subject: base.subject, command: "request.status", scope: COMMERCE_COMMAND_SCOPES["request.status"], payload: { targetCommand: "payment.start", targetRequestId: row.requestId, targetRequestSha256: row.requestSha256 } } : kind === "refund_request" ? { ...base, operation: "refund_request", payload: { paymentRef: row.paymentRef!, expectedRevision: args.expectedRevision!, reason: args.reason! } } : { ...base, operation: "status", payload: { paymentRef: row.paymentRef! } }
    const delivery = await requestRecord(ctx, current.scope, request, kind, args.leaseToken, generation, row.paymentAttemptId)
    if (delivery) {
      if (kind === "refund_request") {
        const stored = await ctx.db.query("shopPaymentRequests").withIndex("by_request", q => q.eq("requestId", delivery.requestId)).unique()
        if (stored) await ctx.db.patch(stored._id, { clientRequestId: args.clientRequestId, intentionSha256: refundIntention! })
      }
      await ctx.db.patch(row._id, { leaseToken: args.leaseToken, leaseUntil: now + PAYMENT_LEASE_MS, generation, updatedAt: now })
    }
    return delivery
  },
})

export const authorize = internalMutation({
  args: { ...deliveryArgs, configFingerprint: v.string() }, returns: v.boolean(),
  handler: async (ctx, args) => {
    const access = await requireMembership(ctx, args.networkId, "declaree"), d = args.delivery
    if (d.kind === "start") {
      const row = d.paymentAttemptId ? await ownedPaymentAttempt(ctx, args.networkId, access.person._id, d.paymentAttemptId) : null
      if (!row || row.configFingerprint !== args.configFingerprint || row.generation !== d.generation || row.leaseToken !== d.leaseToken || (row.leaseUntil ?? 0) <= Date.now() || row.requestId !== d.requestId || row.rawBody !== d.rawBody || row.requestExpiresAt <= Date.now() || (row.authorizationExpiresAt ?? 0) <= Date.now() || !await currentAuthority(ctx, row, true) || await sha256Hex(d.rawBody) !== row.requestSha256) return false
      await ctx.db.patch(row._id, { state: "submitting", dispatchedAt: row.dispatchedAt ?? Date.now(), updatedAt: Date.now() })
      return true
    }
    const row = await ctx.db.query("shopPaymentRequests").withIndex("by_request", (q) => q.eq("requestId", d.requestId)).unique()
    if (!row || row.networkId !== args.networkId || row.personId !== access.person._id || row.doneAt !== undefined || row.generation !== d.generation || row.leaseToken !== d.leaseToken || row.leaseUntil <= Date.now() || row.expiresAt <= Date.now() || row.rawBody !== d.rawBody || row.configFingerprint !== args.configFingerprint || !await currentAuthority(ctx, row, d.kind === "options" || d.kind === "authorize_start") || await sha256Hex(d.rawBody) !== row.bodySha256) return false
    if (row.paymentAttemptId) {
      const attempt = await ownedPaymentAttempt(ctx, args.networkId, access.person._id, row.paymentAttemptId)
      if (!attempt || attempt.generation !== d.generation || attempt.leaseToken !== d.leaseToken) return false
    }
    return true
  },
})

export const finishOptions = internalMutation({
  args: { ...deliveryArgs, rawResponse: v.optional(v.string()) }, returns: paymentOptionsResultValidator,
  handler: async (ctx, args): Promise<PaymentOptionsResult> => {
    const access = await requireMembership(ctx, args.networkId, "declaree"), d = args.delivery
    const row = await ctx.db.query("shopPaymentRequests").withIndex("by_request", (q) => q.eq("requestId", d.requestId)).unique()
    if (!row || row.networkId !== args.networkId || row.personId !== access.person._id || row.kind !== "options" || row.doneAt !== undefined || row.generation !== d.generation || row.leaseToken !== d.leaseToken || row.leaseUntil <= Date.now() || row.rawBody !== d.rawBody || !await currentAuthority(ctx, row, true)) return { outcome: "refused" }
    await ctx.db.patch(row._id, { doneAt: Date.now(), rawBody: undefined })
    const request = parseCommercePaymentControlRequest(d.rawBody, { source: row.source, environment: row.environment, nowMs: row.createdAt })
    const reply = request.ok && args.rawResponse ? parseCommercePaymentControlResponse(args.rawResponse, { request: request.value, requestSha256: row.bodySha256, nowMs: Date.now() }) : null
    if (!reply?.ok || reply.value.outcome !== "accepted" || !("available" in reply.value.result)) return { outcome: reply?.ok && reply.value.outcome === "refused" ? "refused" : "unavailable" }
    const options = reply.value.result
    const checkout = await ctx.db.query("checkoutAttempts").withIndex("by_attempt", (q) => q.eq("attemptId", row.checkoutAttemptId)).unique()
    if (!checkout?.result || options.checkoutRef !== row.checkoutRef || !sameMoney(options.amount, checkout.result.total) || options.expiresAt !== checkout.result.expiresAt) return { outcome: "refused" }
    const cached = await ctx.db.query("shopPaymentOptions").withIndex("by_person_checkout", (q) => q.eq("personId", row.personId).eq("networkId", args.networkId).eq("checkoutAttemptId", row.checkoutAttemptId)).unique()
    // La réponse la plus récente gagne ; une ancienne réponse ne remplace pas le bénéficiaire affiché.
    if (cached && cached.observedAt > row.createdAt) return { outcome: "unavailable" }
    const fields = { ...copyScope(row), options, observedAt: row.createdAt, validUntil: Math.min(options.expiresAt, options.readinessExpiresAt ?? Date.now() + PAYMENT_REQUEST_TTL_MS, Date.now() + PAYMENT_REQUEST_TTL_MS) }
    if (cached) await ctx.db.replace(cached._id, fields)
    else await ctx.db.insert("shopPaymentOptions", fields)
    return { outcome: options.available ? "ready" : "unavailable" }
  },
})

async function applyStartReply(ctx: MutationCtx, row: Doc<"shopPaymentAttempts">, rawResponse: string, httpStatus?: number): Promise<boolean> {
  const reconstructed = commerceCanonicalJson(originalRequest(row))
  if (!reconstructed || await sha256Hex(reconstructed) !== row.requestSha256) return false
  const parsed = parseCommerceCommandResponse(rawResponse, { request: originalRequest(row), requestSha256: row.requestSha256 }, Date.now())
  if (!parsed.ok) return false
  const value = parsed.value
  if (value.outcome === "accepted" && (httpStatus === undefined || httpStatus === 200) && value.result && "paymentRef" in value.result && "orderRef" in value.result && "state" in value.result && "action" in value.result) {
    // payment.start n'est que l'admission. Seul le statut privé prouvé confirme le règlement.
    await ctx.db.patch(row._id, { state: value.result.state, paymentState: value.result.state, paymentRef: value.result.paymentRef, orderRef: value.result.orderRef, startAction: paymentActionAllowed(value.result.action) ? value.result.action : undefined, reason: paymentActionAllowed(value.result.action) ? undefined : "provider_redirect_refused", observedAt: Date.now(), updatedAt: Date.now() })
    return true
  }
  if (value.outcome === "rejected" && (httpStatus === undefined || httpStatus === 422)) {
    await ctx.db.patch(row._id, { state: "refused", reason: value.reason, updatedAt: Date.now() }); return true
  }
  if (value.outcome === "unavailable" && (httpStatus === undefined || httpStatus === 503)) {
    await ctx.db.patch(row._id, { state: "unavailable", reason: value.reason, updatedAt: Date.now() }); return true
  }
  return false
}

export const finish = internalMutation({
  args: { ...deliveryArgs, rawResponse: v.optional(v.string()), httpStatus: v.optional(v.number()) }, returns: admissionValidator,
  handler: async (ctx, args): Promise<Admission> => {
    const access = await requireMembership(ctx, args.networkId, "declaree"), d = args.delivery
    const attempt = d.paymentAttemptId ? await ownedPaymentAttempt(ctx, args.networkId, access.person._id, d.paymentAttemptId) : null
    if (!attempt || attempt.generation !== d.generation || attempt.leaseToken !== d.leaseToken || (attempt.leaseUntil ?? 0) <= Date.now()) return { outcome: "refused" }
    if (d.kind === "start") {
      if (attempt.requestId !== d.requestId || attempt.rawBody !== d.rawBody || !await currentAuthority(ctx, attempt)) return { outcome: "refused" }
      await ctx.db.patch(attempt._id, { state: "unknown", leaseToken: undefined, leaseUntil: undefined, updatedAt: Date.now() })
      if (args.rawResponse) await applyStartReply(ctx, attempt, args.rawResponse, args.httpStatus)
      return await dto(ctx, attempt)
    }
    const row = await ctx.db.query("shopPaymentRequests").withIndex("by_request", (q) => q.eq("requestId", d.requestId)).unique()
    if (!row || row.networkId !== args.networkId || row.personId !== access.person._id || row.paymentAttemptId !== attempt.paymentAttemptId || row.doneAt !== undefined || row.generation !== d.generation || row.leaseToken !== d.leaseToken || row.leaseUntil <= Date.now() || row.rawBody !== d.rawBody || !await currentAuthority(ctx, row)) return { outcome: "refused" }
    if (row.kind === "refund_request") await ctx.db.patch(row._id, { leaseUntil: Date.now() })
    else await ctx.db.patch(row._id, { doneAt: Date.now(), rawBody: undefined })
    await ctx.db.patch(attempt._id, { leaseToken: undefined, leaseUntil: undefined, updatedAt: Date.now() })
    if (row.kind === "request_status") {
      const request = parseCommerceCommandRequest(d.rawBody, { source: row.source, environment: row.environment, nowMs: row.createdAt })
      const reply = request.ok && args.rawResponse ? parseCommerceCommandResponse(args.rawResponse, { request: request.value, requestSha256: row.bodySha256 }, Date.now()) : null
      if (args.httpStatus === 200 && reply?.ok && reply.value.outcome === "accepted" && reply.value.result && "targetRequestId" in reply.value.result) {
        const status = reply.value.result
        await ctx.db.patch(attempt._id, { lastLookupAt: Date.now(), lookupState: status.state })
        if (status.state === "completed" && status.recordedResponse && status.recordedResponseSha256 === await sha256Hex(status.recordedResponse)) await applyStartReply(ctx, attempt, status.recordedResponse)
      }
      return await dto(ctx, attempt)
    }
    const request = parseCommercePaymentControlRequest(d.rawBody, { source: row.source, environment: row.environment, nowMs: row.createdAt })
    const reply = request.ok && args.rawResponse ? parseCommercePaymentControlResponse(args.rawResponse, { request: request.value, requestSha256: row.bodySha256, nowMs: Date.now() }) : null
    if (row.kind === "refund_request" && reply?.ok && reply.value.outcome !== "unavailable") await ctx.db.patch(row._id, { doneAt: Date.now(), rawBody: undefined })
    if (!reply?.ok || reply.value.outcome !== "accepted") {
      if (row.kind === "authorize_start") await ctx.db.patch(attempt._id, { state: reply?.ok && reply.value.outcome === "refused" ? "refused" : "unavailable", reason: reply?.ok && reply.value.outcome !== "accepted" ? reply.value.reason : "authorization_unavailable", updatedAt: Date.now() })
      return await dto(ctx, attempt)
    }
    const result = reply.value.result
    if (row.kind === "authorize_start" && "authorized" in result && attempt.rawBody && result.commandRequestId === attempt.requestId && result.commandRequestSha256 === attempt.requestSha256 && result.readinessRef === attempt.readinessRef && result.checkoutRef === attempt.checkoutRef && await currentAuthority(ctx, attempt, true)) {
      await ctx.db.patch(attempt._id, { authorizationExpiresAt: result.expiresAt, leaseToken: d.leaseToken, leaseUntil: Date.now() + PAYMENT_LEASE_MS, updatedAt: Date.now() })
      return { kind: "start", requestId: attempt.requestId, rawBody: attempt.rawBody, leaseToken: d.leaseToken, generation: attempt.generation, paymentAttemptId: attempt.paymentAttemptId }
    }
    if ((row.kind === "status" || row.kind === "refund_request") && "paymentState" in result && result.paymentRef === attempt.paymentRef && result.orderRef === attempt.orderRef && result.checkoutRef === attempt.checkoutRef && sameMoney(result.amount, attempt.amount) && result.revision >= (attempt.snapshot?.revision ?? 0)) {
      // Une même révision doit être immuable, y compris le remboursement et le stock.
      if (attempt.snapshot && result.revision === attempt.snapshot.revision && commerceCanonicalJson(result) !== commerceCanonicalJson(attempt.snapshot)) return await dto(ctx, attempt)
      const snapshot = { ...result, action: paymentActionAllowed(result.action) ? result.action : null }
      await ctx.db.patch(attempt._id, { state: result.paymentState, paymentState: result.paymentState, snapshot, startAction: undefined, observedAt: Date.now(), reason: paymentActionAllowed(result.action) ? undefined : "provider_redirect_refused", updatedAt: Date.now() })
      if (result.stockState === "consumed") {
        const checkout = await ctx.db.query("checkoutAttempts").withIndex("by_attempt", (q) => q.eq("attemptId", attempt.checkoutAttemptId)).unique()
        if (checkout?.personId === attempt.personId && checkout.networkId === attempt.networkId && checkout.checkoutRef === attempt.checkoutRef) await ctx.db.patch(checkout._id, { state: "consumed", blocksUntil: 0, updatedAt: Date.now() })
      }
    }
    return await dto(ctx, attempt)
  },
})

/** Les corps courts expirent indépendamment d'une session ou d'une vitrine vivante. */
export const purgeExpired = internalMutation({
  args: {}, returns: v.null(), handler: async (ctx) => {
    const now = Date.now()
    const attempts = await ctx.db.query("shopPaymentAttempts").withIndex("by_privateUntil", (q) => q.eq("privatePurgedAt", undefined).lte("privateUntil", now)).take(25)
    for (const row of attempts) await ctx.db.patch(row._id, { rawBody: undefined, startAction: undefined, ...(row.snapshot ? { snapshot: { ...row.snapshot, action: null } } : {}), leaseToken: undefined, leaseUntil: undefined, privatePurgedAt: now, generation: row.generation + 1 })
    const requests = await ctx.db.query("shopPaymentRequests").withIndex("by_privateUntil", (q) => q.lte("privateUntil", now)).take(25)
    for (const row of requests) await ctx.db.delete(row._id)
    const options = await ctx.db.query("shopPaymentOptions").withIndex("by_validUntil", (q) => q.lte("validUntil", now)).take(25)
    for (const row of options) await ctx.db.delete(row._id)
    return null
  },
})
