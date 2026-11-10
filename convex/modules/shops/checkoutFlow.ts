/** P11 : chaque HTTP est encadré par deux mutations corrélées à la session vivante. */
import { COMMERCE_COMMAND_SCOPES, parseCommerceCommandRequest, parseCommerceCommandResponse } from "@antsia/social-domain/commerce/command"
import type { CommerceCheckoutLineInput, CommerceCheckoutResult } from "@antsia/social-domain/commerce/command"
import { COMMERCE_COMMAND_CONTRACT, commerceCanonicalJson } from "@antsia/social-domain/commerce/primitives"
import { COMMERCE_CHECKOUT_CONSENT_VERSION, COMMERCE_CHECKOUT_CONTROL_CONTRACT, parseCommerceCheckoutControlRequest, parseCommerceCheckoutControlResponse } from "@antsia/social-domain/commerce-checkout"
import { makeFunctionReference } from "convex/server"
import { type Infer, v } from "convex/values"

import type { Doc, Id } from "../../_generated/dataModel"
import { internalMutation, type MutationCtx, type QueryCtx } from "../../_generated/server"
import { requireMembership } from "../../lib/access"
import { enforceRateLimit } from "../../lib/rateLimit"
import { getActiveIdentity } from "../../lib/session"
import { assertSocialWriteAllowed } from "../moderation/policy"
import { findPageByHandle } from "../pages/access"
import { isStorefrontInReadingContext, shopOfPage } from "./access"
import { readableCatalogMapping } from "./catalogAccess"
import { resolveCatalogOffer } from "./catalogRead"
import { ensureCommerceBuyerSubject } from "./commerceBuyerSubjects"
import { readCommerceLinkConfig } from "./commerceLinkConfig"
import { sha256Hex, validLinkToken } from "./commerceLinkCrypto"
import { checkoutAuthorityFields } from "./checkoutTables"
import { refuseNewEngagementWithShop } from "./shopPause"
import { CHECKOUT_BODY_TTL_MS, CHECKOUT_HOLD_MAX_MS, CHECKOUT_LEASE_MS, CHECKOUT_LINES_MAX, CHECKOUT_REQUEST_TTL_MS, checkoutActionResultValidator, checkoutFulfillmentValidator, checkoutLineValidator, checkoutMoneyValidator, checkoutOptionsResultValidator, checkoutResponseRequest, copyCheckoutLines, copyCheckoutResult, type CheckoutActionResult } from "./checkoutRules"

export const checkoutAuthorityValidator = v.object(checkoutAuthorityFields)
export type CheckoutAuthority = Infer<typeof checkoutAuthorityValidator>
export const checkoutDeliveryValidator = v.object({ requestId: v.string(), rawBody: v.string(), leaseToken: v.string(), kind: v.union(v.literal("prepare"), v.literal("options"), v.literal("status"), v.literal("release"), v.literal("request_status")), attemptId: v.optional(v.string()) })
export type CheckoutDelivery = Infer<typeof checkoutDeliveryValidator>
export const checkoutAdmissionValidator = v.union(checkoutDeliveryValidator, v.null())
const expirePrivateRef = makeFunctionReference<"mutation", { networkId: Id<"networks">; requestId: string; attemptId?: string }, null>("modules/shops/checkoutFlow:expirePrivate")
const opaque = (value: string) => value.length >= 8 && value.length <= 100 && /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value)

export async function checkoutPolicyOpen(ctx: Pick<QueryCtx, "db">, networkId: Id<"networks">): Promise<boolean> {
  return (await ctx.db.query("shopCheckoutPolicies").withIndex("by_network", (q) => q.eq("networkId", networkId)).unique())?.enabled === true
}

/** P12 : la réserve d'un paiement ne s'abandonne pas par la porte P11. */
export async function checkoutHasPayment(ctx: Pick<QueryCtx, "db">, row: Pick<Doc<"checkoutAttempts">, "personId" | "networkId" | "attemptId">): Promise<boolean> {
  return !!await ctx.db.query("shopPaymentAttempts").withIndex("by_person_checkout", q => q.eq("personId", row.personId).eq("networkId", row.networkId).eq("checkoutAttemptId", row.attemptId)).unique()
}

export async function checkoutCatalogAuthority(ctx: QueryCtx | MutationCtx, networkId: Id<"networks">, handle: string) {
  const access = await requireMembership(ctx, networkId, "declaree")
  if (access.person.erasedAt !== undefined || access.person.deletionRequestedAt !== undefined) return null
  const identity = await getActiveIdentity(ctx), config = await readCommerceLinkConfig()
  if (!identity || typeof identity.sessionId !== "string" || !config) return null
  const page = await findPageByHandle(ctx, handle), shop = page ? await shopOfPage(ctx, page._id) : null
  if (!shop || !await isStorefrontInReadingContext(ctx, shop, access.network) || !await checkoutPolicyOpen(ctx, networkId) || (shop.networkId !== networkId && !await checkoutPolicyOpen(ctx, shop.networkId))) return null
  const live = await readableCatalogMapping(ctx, access.rootNetwork, shop._id, access.person._id)
  if (!live || !live.link.permissions.includes("receive_orders") || live.link.configFingerprint !== config.fingerprint) return null
  return { access, config, live, sessionDigest: await sha256Hex(identity.sessionId) }
}

async function initialAuthority(ctx: MutationCtx, networkId: Id<"networks">, handle: string): Promise<CheckoutAuthority | null> {
  const current = await checkoutCatalogAuthority(ctx, networkId, handle)
  if (!current) return null
  await assertSocialWriteAllowed(ctx, networkId, current.access.person._id)
  const { live, config, access } = current
  return { networkId, shopId: live.shop._id, personId: access.person._id, handle: live.page.handle, sessionDigest: current.sessionDigest, configFingerprint: config.fingerprint, source: config.source, environment: config.environment,
    mappingId: live.mapping._id, mappingGeneration: live.mapping.generation, parentActivationRevision: live.parentHead.activationRevision, linkRef: live.link.linkRef, shopRef: live.link.shopRef,
    subjectRef: await ensureCommerceBuyerSubject(ctx, { networkId, shopId: live.shop._id, personId: access.person._id, source: config.source, environment: config.environment }) }
}

/** Les contrôles privés existants ne créent aucun hold : ils restent annulables après retrait public. */
async function sameAuthority(ctx: MutationCtx, before: CheckoutAuthority, preparing: boolean): Promise<boolean> {
  const access = await requireMembership(ctx, before.networkId, "declaree")
  if (access.person._id !== before.personId || access.person.deletionRequestedAt !== undefined || access.person.erasedAt !== undefined) return false
  const identity = await getActiveIdentity(ctx), config = await readCommerceLinkConfig()
  if (!identity || typeof identity.sessionId !== "string" || await sha256Hex(identity.sessionId) !== before.sessionDigest || config?.fingerprint !== before.configFingerprint) return false
  await assertSocialWriteAllowed(ctx, before.networkId, access.person._id)
  if (!preparing) return true
  const live = await checkoutCatalogAuthority(ctx, before.networkId, before.handle)
  return !!live && live.live.shop._id === before.shopId && live.live.mapping._id === before.mappingId && live.live.mapping.generation === before.mappingGeneration && live.live.parentHead.activationRevision === before.parentActivationRevision && live.live.link.linkRef === before.linkRef && live.live.link.shopRef === before.shopRef
}

async function owned(ctx: MutationCtx, networkId: Id<"networks">, attemptId: string) {
  const access = await requireMembership(ctx, networkId, "declaree")
  if (!opaque(attemptId)) return null
  const attempt = await ctx.db.query("checkoutAttempts").withIndex("by_attempt", (q) => q.eq("attemptId", attemptId)).unique()
  return attempt && attempt.networkId === networkId && attempt.personId === access.person._id && !attempt.cancelledAt ? attempt : null
}

async function schedulePrivate(ctx: MutationCtx, networkId: Id<"networks">, requestId: string, attemptId?: string) {
  await ctx.scheduler.runAfter(CHECKOUT_BODY_TTL_MS, expirePrivateRef, { networkId, requestId, ...(attemptId ? { attemptId } : {}) })
}

export const beginOptions = internalMutation({
  args: { networkId: v.id("networks"), handle: v.string(), requestId: v.string(), leaseToken: v.string(), configFingerprint: v.string() }, returns: checkoutAdmissionValidator,
  handler: async (ctx, args): Promise<CheckoutDelivery | null> => {
    const authority = await initialAuthority(ctx, args.networkId, args.handle)
    if (!authority || authority.configFingerprint !== args.configFingerprint || !opaque(args.requestId) || !validLinkToken(args.leaseToken)) return null
    await enforceRateLimit(ctx, "checkout.control", authority.personId)
    const now = Date.now()
    const rawBody = commerceCanonicalJson({ contract: COMMERCE_CHECKOUT_CONTROL_CONTRACT, version: 1, operation: "options", source: authority.source, environment: authority.environment, requestId: args.requestId, shopRef: authority.shopRef, subject: { kind: "buyer", ref: authority.subjectRef, authVerifiedAt: now }, issuedAt: now, expiresAt: now + CHECKOUT_REQUEST_TTL_MS, payload: {} })
    if (!rawBody || !parseCommerceCheckoutControlRequest(rawBody, { source: authority.source, environment: authority.environment, nowMs: now }).ok) return null
    await ctx.db.insert("checkoutRequests", { ...authority, kind: "options", requestId: args.requestId, rawBody, bodySha256: await sha256Hex(rawBody), expiresAt: now + CHECKOUT_REQUEST_TTL_MS, privateUntil: now + CHECKOUT_BODY_TTL_MS, leaseToken: args.leaseToken, leaseUntil: now + CHECKOUT_LEASE_MS, createdAt: now })
    await schedulePrivate(ctx, args.networkId, args.requestId)
    return { kind: "options", requestId: args.requestId, rawBody, leaseToken: args.leaseToken }
  },
})

export const authorize = internalMutation({
  args: { networkId: v.id("networks"), delivery: checkoutDeliveryValidator, configFingerprint: v.string() }, returns: v.boolean(),
  handler: async (ctx, args) => {
    const d = args.delivery
    if (d.kind === "prepare") {
      const attempt = d.attemptId ? await owned(ctx, args.networkId, d.attemptId) : null
      if (!attempt || attempt.state !== "unknown" || attempt.leaseToken !== d.leaseToken || (attempt.leaseUntil ?? 0) <= Date.now() || attempt.requestExpiresAt <= Date.now() || attempt.rawBody !== d.rawBody || attempt.requestId !== d.requestId || attempt.configFingerprint !== args.configFingerprint || await sha256Hex(d.rawBody) !== attempt.bodySha256) return false
      if (!await sameAuthority(ctx, attempt, true)) return false
      return await linesReadable(ctx, attempt, attempt.expectedLines)
    }
    const row = await ctx.db.query("checkoutRequests").withIndex("by_request", (q) => q.eq("requestId", d.requestId)).unique()
    return !!row && row.networkId === args.networkId && !row.cancelledAt && row.kind === d.kind && row.rawBody === d.rawBody && row.leaseToken === d.leaseToken && (row.leaseUntil ?? 0) > Date.now() && row.expiresAt > Date.now() && row.configFingerprint === args.configFingerprint && await sha256Hex(d.rawBody) === row.bodySha256 && await sameAuthority(ctx, row, row.kind === "options")
  },
})

export const finishOptions = internalMutation({
  args: { networkId: v.id("networks"), delivery: checkoutDeliveryValidator, rawResponse: v.optional(v.string()) }, returns: checkoutOptionsResultValidator,
  handler: async (ctx, args) => {
    await requireMembership(ctx, args.networkId, "declaree")
    const row = await ctx.db.query("checkoutRequests").withIndex("by_request", (q) => q.eq("requestId", args.delivery.requestId)).unique()
    if (!row || row.networkId !== args.networkId || row.kind !== "options" || row.cancelledAt || row.leaseToken !== args.delivery.leaseToken || (row.leaseUntil ?? 0) <= Date.now() || !row.rawBody || !await sameAuthority(ctx, row, true)) return { outcome: "refused" as const }
    const request = parseCommerceCheckoutControlRequest(row.rawBody, { source: row.source, environment: row.environment, nowMs: row.createdAt })
    const response = args.rawResponse && request.ok ? parseCommerceCheckoutControlResponse(args.rawResponse, { request: request.value, requestSha256: row.bodySha256 }) : null
    await ctx.db.patch(row._id, { leaseToken: undefined, leaseUntil: undefined })
    if (!response?.ok || response.value.outcome !== "accepted" || !("pickup" in response.value.result) || row.expiresAt <= Date.now()) return { outcome: "unavailable" as const }
    const options = response.value.result
    await ctx.db.patch(row._id, { options, completedAt: Date.now() })
    return { outcome: "ready" as const, policyVersion: options.policyVersion, pickup: options.pickup, fees: options.fees.map((fee) => ({ ...fee, amount: { ...fee.amount } })), sellerDelivery: options.sellerDelivery }
  },
})

async function linesReadable(ctx: MutationCtx, authority: CheckoutAuthority, lines: readonly CommerceCheckoutLineInput[]): Promise<boolean> {
  if (lines.length < 1 || lines.length > CHECKOUT_LINES_MAX) return false
  const access = await requireMembership(ctx, authority.networkId, "declaree")
  for (const line of lines) {
    const offer = await resolveCatalogOffer(ctx, { root: access.rootNetwork, network: access.network, readerPersonId: access.person._id }, authority.shopId, line.offerRef)
    if (!offer || (line.variantRef ? !offer.variants.some((variant) => variant.variantRef === line.variantRef) : offer.variants.length > 0 || !["fixed", "unit"].includes(offer.price.mode))) return false
  }
  return true
}

export const createAttempt = internalMutation({
  args: { networkId: v.id("networks"), handle: v.string(), lines: v.array(checkoutLineValidator), fulfillment: checkoutFulfillmentValidator, consentTextVersion: v.string(), expectedPolicyVersion: v.number(), clientRequestId: v.string(), note: v.optional(v.string()), optionsRequestId: v.string(), attemptId: v.string(), requestId: v.string(), leaseToken: v.string(), configFingerprint: v.string(), reconfirmAttemptId: v.optional(v.string()), acceptedTotal: v.optional(checkoutMoneyValidator) },
  returns: v.union(checkoutDeliveryValidator, checkoutActionResultValidator),
  handler: async (ctx, args): Promise<CheckoutDelivery | CheckoutActionResult> => {
    const authority = await initialAuthority(ctx, args.networkId, args.handle)
    if (!authority || authority.configFingerprint !== args.configFingerprint || args.consentTextVersion !== COMMERCE_CHECKOUT_CONSENT_VERSION || args.lines.length < 1 || args.lines.length > CHECKOUT_LINES_MAX || (args.note?.length ?? 0) > 500 || !opaque(args.clientRequestId) || !opaque(args.attemptId) || !opaque(args.requestId) || !validLinkToken(args.leaseToken)) return { outcome: "refused" }
    await enforceRateLimit(ctx, "checkout.prepare", authority.personId)
    const option = await ctx.db.query("checkoutRequests").withIndex("by_request", (q) => q.eq("requestId", args.optionsRequestId)).unique()
    if (!option?.options || option.networkId !== args.networkId || option.cancelledAt || option.kind !== "options" || option.expiresAt <= Date.now() || option.personId !== authority.personId || option.shopId !== authority.shopId || option.sessionDigest !== authority.sessionDigest || !await sameAuthority(ctx, option, true)) return { outcome: "unavailable" }
    if (args.expectedPolicyVersion !== option.options.policyVersion) return { outcome: "refused" }
    const fulfillment = args.fulfillment
    if (fulfillment.mode === "pickup" ? !option.options.pickup.some((p) => p.establishmentRef === fulfillment.establishmentRef) : option.options.sellerDelivery === null) return { outcome: "refused" }
    const intent = commerceCanonicalJson({ handle: args.handle, lines: args.lines, fulfillment: args.fulfillment, consentTextVersion: args.consentTextVersion, expectedPolicyVersion: args.expectedPolicyVersion, ...(args.note === undefined ? {} : { note: args.note }), ...(args.reconfirmAttemptId ? { reconfirmAttemptId: args.reconfirmAttemptId, acceptedTotal: args.acceptedTotal } : {}) })
    if (!intent) return { outcome: "refused" }
    const intentDigest = await sha256Hex(intent)
    const existing = await ctx.db.query("checkoutAttempts").withIndex("by_client", (q) => q.eq("personId", authority.personId).eq("networkId", args.networkId).eq("clientRequestId", args.clientRequestId)).unique()
    if (existing) return existing.intentDigest === intentDigest && existing.shopId === authority.shopId ? { outcome: "attempt", attemptId: existing.attemptId } : { outcome: "refused" }
    // CM-10 : une boutique en pause refuse une NOUVELLE préparation (règle `SHOP_PAUSED`, avec la réouverture) ; le
    // rejeu ci-dessus et la reconfirmation d'une préparation déjà engagée suivent leur cours.
    if (!args.reconfirmAttemptId) await refuseNewEngagementWithShop(ctx, authority.shopId)
    // Même transaction que l'insertion finale : une fermeture gagnante interdit l'ancien envoi.
    if (await ctx.db.query("checkoutClientIntentFences").withIndex("by_client", (q) => q.eq("personId", authority.personId).eq("networkId", args.networkId).eq("clientRequestId", args.clientRequestId)).unique()) return { outcome: "refused" }
    // Index du verrou temporaire : ni scan historique ni troncature masquant un hold vivant.
    const active = await ctx.db.query("checkoutAttempts").withIndex("by_person_shop_blocks", (q) => q.eq("personId", authority.personId).eq("networkId", args.networkId).eq("shopId", authority.shopId).gt("blocksUntil", Date.now())).take(2)
    if (active.some((a) => !a.cancelledAt && a.attemptId !== args.reconfirmAttemptId)) return { outcome: "unavailable" }
    if (args.reconfirmAttemptId) {
      const prior = await owned(ctx, args.networkId, args.reconfirmAttemptId)
      if (!prior || prior.shopId !== authority.shopId || !prior.result || prior.state !== "released" || prior.reason !== "reconfirm_release" || prior.reconfirmedByAttemptId || !args.acceptedTotal || args.acceptedTotal.amount !== prior.result.total.amount || args.acceptedTotal.currency !== prior.result.total.currency || commerceCanonicalJson(args.lines) !== commerceCanonicalJson(prior.result.lines.map((line) => ({ offerRef: line.offerRef, quantity: line.quantity, expectedCatalogRevision: line.catalogRevision, expectedUnitAmount: line.unitAmount, ...(line.variantRef ? { variantRef: line.variantRef } : {}) })))) return { outcome: "refused" }
    }
    if (!await linesReadable(ctx, authority, args.lines)) return { outcome: "refused" }
    const now = Date.now()
    const request = { contract: COMMERCE_COMMAND_CONTRACT, version: 1, command: "checkout.prepare", scope: COMMERCE_COMMAND_SCOPES["checkout.prepare"], source: authority.source, environment: authority.environment, requestId: args.requestId, issuedAt: now, expiresAt: now + CHECKOUT_REQUEST_TTL_MS,
      subject: { kind: "buyer", ref: authority.subjectRef, authVerifiedAt: now }, payload: { shopRef: authority.shopRef, lines: args.lines, fulfillment: args.fulfillment, consent: { purpose: "commerce_checkout", textVersion: args.consentTextVersion, givenAt: now }, ...(args.note === undefined ? {} : { note: args.note }) } }
    const rawBody = commerceCanonicalJson(request)
    if (!rawBody || !parseCommerceCommandRequest(rawBody, { source: authority.source, environment: authority.environment, nowMs: now }).ok) return { outcome: "refused" }
    const expectedFees = option.options.fees.map((fee) => ({ ...fee, amount: { ...fee.amount } }))
    if (fulfillment.mode === "seller_delivery" && option.options.sellerDelivery) expectedFees.push({ kind: "delivery", label: option.options.sellerDelivery.label, amount: { ...option.options.sellerDelivery.fee } })
    await ctx.db.insert("checkoutAttempts", { ...authority, attemptId: args.attemptId, clientRequestId: args.clientRequestId, intentDigest, state: "unknown", requestId: args.requestId, bodySha256: await sha256Hex(rawBody), rawBody, issuedAt: now, requestExpiresAt: now + CHECKOUT_REQUEST_TTL_MS, privateUntil: now + CHECKOUT_BODY_TTL_MS, blocksUntil: now + CHECKOUT_BODY_TTL_MS, expectedLines: copyCheckoutLines(args.lines), expectedFees, expectedPolicyVersion: option.options.policyVersion, ...(args.acceptedTotal ? { acceptedTotal: args.acceptedTotal } : {}), consentedAt: now, consentTextVersion: args.consentTextVersion, leaseToken: args.leaseToken, leaseUntil: now + CHECKOUT_LEASE_MS, createdAt: now, updatedAt: now })
    if (args.reconfirmAttemptId) {
      const prior = await owned(ctx, args.networkId, args.reconfirmAttemptId)
      if (prior) await ctx.db.patch(prior._id, { reconfirmedByAttemptId: args.attemptId })
    }
    await schedulePrivate(ctx, args.networkId, args.requestId, args.attemptId)
    return { kind: "prepare", attemptId: args.attemptId, requestId: args.requestId, rawBody, leaseToken: args.leaseToken }
  },
})

export const beginAttemptOperation = internalMutation({
  args: { networkId: v.id("networks"), attemptId: v.string(), operation: v.union(v.literal("retry"), v.literal("status"), v.literal("release")), requestId: v.string(), leaseToken: v.string(), configFingerprint: v.string(), forReconfirm: v.optional(v.boolean()), acceptedTotal: v.optional(checkoutMoneyValidator) }, returns: checkoutAdmissionValidator,
  handler: async (ctx, args): Promise<CheckoutDelivery | null> => {
    const attempt = await owned(ctx, args.networkId, args.attemptId)
    if (!attempt || attempt.configFingerprint !== args.configFingerprint || !opaque(args.requestId) || !validLinkToken(args.leaseToken) || (attempt.leaseUntil ?? 0) > Date.now() || !await sameAuthority(ctx, attempt, args.operation === "retry")) return null
    if (args.operation !== "status" && await checkoutHasPayment(ctx, attempt)) return null
    await enforceRateLimit(ctx, "checkout.control", attempt.personId)
    const now = Date.now()
    if (args.operation === "retry") {
      if (attempt.state !== "unknown" || attempt.lookupState !== "unknown" || (attempt.lastLookupAt ?? 0) < now - 10_000 || !attempt.rawBody || attempt.requestExpiresAt <= now || !await linesReadable(ctx, attempt, attempt.expectedLines) || await sha256Hex(attempt.rawBody) !== attempt.bodySha256) return null
      await ctx.db.patch(attempt._id, { leaseToken: args.leaseToken, leaseUntil: now + CHECKOUT_LEASE_MS, updatedAt: now })
      return { kind: "prepare", attemptId: attempt.attemptId, requestId: attempt.requestId, rawBody: attempt.rawBody, leaseToken: args.leaseToken }
    }
    if (args.operation === "release" && (!attempt.checkoutRef || !["held", "reconfirm", "unknown"].includes(attempt.state) || (args.forReconfirm && (attempt.state !== "reconfirm" || !attempt.rawBody || !args.acceptedTotal || args.acceptedTotal.amount !== attempt.result?.total.amount || args.acceptedTotal.currency !== attempt.result?.total.currency)))) return null
    const kind = args.operation === "status" && !attempt.checkoutRef ? "request_status" as const : args.operation
    const base = { source: attempt.source, environment: attempt.environment, requestId: args.requestId, issuedAt: now, expiresAt: now + CHECKOUT_REQUEST_TTL_MS, subject: { kind: "buyer", ref: attempt.subjectRef, authVerifiedAt: now } }
    const rawBody = commerceCanonicalJson(kind === "request_status" ? { ...base, contract: COMMERCE_COMMAND_CONTRACT, version: 1, command: "request.status", scope: COMMERCE_COMMAND_SCOPES["request.status"], payload: { targetCommand: "checkout.prepare", targetRequestId: attempt.requestId, targetRequestSha256: attempt.bodySha256 } } : { ...base, contract: COMMERCE_CHECKOUT_CONTROL_CONTRACT, version: 1, operation: kind, shopRef: attempt.shopRef, payload: { checkoutRef: attempt.checkoutRef } })
    if (!rawBody) return null
    await ctx.db.insert("checkoutRequests", { ...authorityCopy(attempt), attemptId: attempt.attemptId, kind, requestId: args.requestId, bodySha256: await sha256Hex(rawBody), rawBody, expiresAt: now + CHECKOUT_REQUEST_TTL_MS, privateUntil: now + CHECKOUT_BODY_TTL_MS, leaseToken: args.leaseToken, leaseUntil: now + CHECKOUT_LEASE_MS, createdAt: now })
    await ctx.db.patch(attempt._id, { leaseToken: args.leaseToken, leaseUntil: now + CHECKOUT_LEASE_MS, ...(args.forReconfirm ? { reason: "reconfirm_release_pending" } : {}), updatedAt: now })
    await schedulePrivate(ctx, args.networkId, args.requestId)
    return { kind, attemptId: attempt.attemptId, requestId: args.requestId, rawBody, leaseToken: args.leaseToken }
  },
})

function authorityCopy(row: CheckoutAuthority): CheckoutAuthority {
  return { networkId: row.networkId, shopId: row.shopId, personId: row.personId, handle: row.handle, sessionDigest: row.sessionDigest, configFingerprint: row.configFingerprint, source: row.source, environment: row.environment, mappingId: row.mappingId, mappingGeneration: row.mappingGeneration, parentActivationRevision: row.parentActivationRevision, linkRef: row.linkRef, shopRef: row.shopRef, subjectRef: row.subjectRef }
}

async function applyPreparedReply(ctx: MutationCtx, attempt: Doc<"checkoutAttempts">, rawResponse: string, httpStatus?: number): Promise<boolean> {
  const response = parseCommerceCommandResponse(rawResponse, { request: checkoutResponseRequest(attempt), requestSha256: attempt.bodySha256 }, Date.now())
  if (!response.ok) return false
  const value = response.value
  if ((value.outcome === "accepted" || value.outcome === "reconfirm_required") && (httpStatus === undefined || httpStatus === 200)) {
    const result = value.result
    if (!result || !("checkoutRef" in result) || !("lines" in result) || !("fees" in result) || !("total" in result) || !("state" in result) || result.state !== "held" || result.expiresAt > value.respondedAt + CHECKOUT_HOLD_MAX_MS) return false
    const feesChanged = commerceCanonicalJson(attempt.expectedFees) !== commerceCanonicalJson(result.fees)
    const totalChanged = !!attempt.acceptedTotal && (attempt.acceptedTotal.amount !== result.total.amount || attempt.acceptedTotal.currency !== result.total.currency)
    await ctx.db.patch(attempt._id, { state: result.expiresAt <= Date.now() ? "expired" : value.outcome === "reconfirm_required" || feesChanged || totalChanged ? "reconfirm" : "held", result: copyCheckoutResult(result as CommerceCheckoutResult), checkoutRef: result.checkoutRef, blocksUntil: result.expiresAt, reason: feesChanged ? "fees_changed" : totalChanged ? "total_changed" : undefined, updatedAt: Date.now() })
    return true
  }
  if (value.outcome === "rejected" && (httpStatus === undefined || httpStatus === 422)) {
    await ctx.db.patch(attempt._id, { state: "rejected", reason: value.reason, blocksUntil: 0, updatedAt: Date.now(), rawBody: undefined }); return true
  }
  return false
}

export const finishAttemptOperation = internalMutation({
  args: { networkId: v.id("networks"), delivery: checkoutDeliveryValidator, rawResponse: v.optional(v.string()), httpStatus: v.optional(v.number()) }, returns: checkoutActionResultValidator,
  handler: async (ctx, args): Promise<CheckoutActionResult> => {
    const d = args.delivery, attempt = d.attemptId ? await owned(ctx, args.networkId, d.attemptId) : null
    if (!attempt || attempt.leaseToken !== d.leaseToken || (attempt.leaseUntil ?? 0) <= Date.now() || !await sameAuthority(ctx, attempt, d.kind === "prepare")) return { outcome: "refused" }
    await ctx.db.patch(attempt._id, { leaseToken: undefined, leaseUntil: undefined, updatedAt: Date.now() })
    if (d.kind === "prepare") {
      if (attempt.requestId !== d.requestId || attempt.rawBody !== d.rawBody || !await linesReadable(ctx, attempt, attempt.expectedLines)) return { outcome: "refused" }
      if (args.rawResponse) await applyPreparedReply(ctx, attempt, args.rawResponse, args.httpStatus)
      return { outcome: "attempt", attemptId: attempt.attemptId }
    }
    const row = await ctx.db.query("checkoutRequests").withIndex("by_request", (q) => q.eq("requestId", d.requestId)).unique()
    if (!row || row.networkId !== args.networkId || row.attemptId !== attempt.attemptId || row.cancelledAt || row.leaseToken !== d.leaseToken || !row.rawBody || row.rawBody !== d.rawBody || !await sameAuthority(ctx, row, false)) return { outcome: "refused" }
    await ctx.db.patch(row._id, { leaseToken: undefined, leaseUntil: undefined, completedAt: Date.now(), rawBody: undefined })
    if (!args.rawResponse) return { outcome: "attempt", attemptId: attempt.attemptId }
    if (row.kind === "request_status") {
      const request = parseCommerceCommandRequest(row.rawBody, { source: row.source, environment: row.environment, nowMs: row.createdAt })
      const response = request.ok ? parseCommerceCommandResponse(args.rawResponse, { request: request.value, requestSha256: row.bodySha256 }, Date.now()) : null
      if (args.httpStatus === 200 && response?.ok && response.value.outcome === "accepted" && response.value.result && "targetRequestId" in response.value.result) {
        const status = response.value.result
        await ctx.db.patch(attempt._id, { lastLookupAt: Date.now(), lookupState: status.state })
        if (status.state === "completed" && status.recordedResponse && status.recordedResponseSha256 === await sha256Hex(status.recordedResponse)) await applyPreparedReply(ctx, attempt, status.recordedResponse)
      }
    } else {
      const request = parseCommerceCheckoutControlRequest(row.rawBody, { source: row.source, environment: row.environment, nowMs: row.createdAt })
      const response = request.ok ? parseCommerceCheckoutControlResponse(args.rawResponse, { request: request.value, requestSha256: row.bodySha256 }) : null
      if (response?.ok && response.value.outcome === "accepted" && "checkoutRef" in response.value.result) {
        const state = response.value.result
        if (state.revision > (attempt.controlRevision ?? 0) && state.checkoutRef === attempt.checkoutRef) {
          // Une lecture held ne retire pas la confirmation locale de frais modifiés.
          const next = attempt.state === "consumed" ? "consumed" : state.state === "held" ? state.confirmationRequired || attempt.state === "reconfirm" ? "reconfirm" : "held" : state.state
          const reconfirmReleased = (state.state === "released" || state.state === "expired") && attempt.reason === "reconfirm_release_pending"
          await ctx.db.patch(attempt._id, { state: next, controlRevision: state.revision, blocksUntil: state.state === "held" ? state.expiresAt : 0, reason: state.state === "consumed" ? "consumed" : reconfirmReleased ? "reconfirm_release" : state.state === "held" ? attempt.reason : undefined, ...(state.state === "released" && !reconfirmReleased ? { rawBody: undefined } : {}), updatedAt: Date.now() })
        }
      }
    }
    return { outcome: "attempt", attemptId: attempt.attemptId }
  },
})

/** L'adresse reste serveur. Une reconfirmation explicite peut la réutiliser avant sa purge,
 * seulement après un reçu certain de libération et avec les nouveaux attendus affichés. */
export const reconfirmInput = internalMutation({
  args: { networkId: v.id("networks"), attemptId: v.string(), clientRequestId: v.string(), acceptedTotal: checkoutMoneyValidator },
  returns: v.union(v.null(), v.object({ existingAttemptId: v.string() }), v.object({ handle: v.string(), lines: v.array(checkoutLineValidator), fulfillment: checkoutFulfillmentValidator, note: v.optional(v.string()) })),
  handler: async (ctx, args) => {
    const prior = await owned(ctx, args.networkId, args.attemptId)
    if (prior && await checkoutHasPayment(ctx, prior)) return null
    if (prior?.reconfirmedByAttemptId && prior.result?.total.amount === args.acceptedTotal.amount && prior.result.total.currency === args.acceptedTotal.currency) {
      const child = await owned(ctx, args.networkId, prior.reconfirmedByAttemptId)
      return child?.clientRequestId === args.clientRequestId ? { existingAttemptId: child.attemptId } : null
    }
    if (!prior?.rawBody || prior.privateUntil <= Date.now() || !prior.result || prior.state !== "released" || prior.reason !== "reconfirm_release" || prior.reconfirmedByAttemptId || !await sameAuthority(ctx, prior, true) || prior.result.total.amount !== args.acceptedTotal.amount || prior.result.total.currency !== args.acceptedTotal.currency) return null
    const request = parseCommerceCommandRequest(prior.rawBody, { source: prior.source, environment: prior.environment, nowMs: prior.issuedAt })
    if (!request.ok || request.value.command !== "checkout.prepare") return null
    return { handle: prior.handle, lines: prior.result.lines.map((line) => ({ offerRef: line.offerRef, quantity: line.quantity, expectedCatalogRevision: line.catalogRevision, expectedUnitAmount: line.unitAmount, ...(line.variantRef ? { variantRef: line.variantRef } : {}) })), fulfillment: request.value.payload.fulfillment, ...(request.value.payload.note === undefined ? {} : { note: request.value.payload.note }) }
  },
})

export const expirePrivate = internalMutation({
  args: { networkId: v.id("networks"), requestId: v.string(), attemptId: v.optional(v.string()) }, returns: v.null(),
  handler: async (ctx, args) => {
    if (args.attemptId) {
      const row = await ctx.db.query("checkoutAttempts").withIndex("by_attempt", (q) => q.eq("attemptId", args.attemptId!)).unique()
      if (row?.networkId === args.networkId && row.requestId === args.requestId && row.privateUntil <= Date.now()) await ctx.db.patch(row._id, { rawBody: undefined, leaseToken: undefined, leaseUntil: undefined })
    } else {
      const row = await ctx.db.query("checkoutRequests").withIndex("by_request", (q) => q.eq("requestId", args.requestId)).unique()
      if (row?.networkId === args.networkId && row.privateUntil <= Date.now()) await ctx.db.patch(row._id, { rawBody: undefined, options: undefined, leaseToken: undefined, leaseUntil: undefined })
    }
    return null
  },
})
