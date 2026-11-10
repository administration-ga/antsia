/** MP07b : admission et arrivée d'une lecture privée du titulaire de liaison. Aucune table ajoutée. */
import {
  COMMERCE_PAYMENT_PREPARATION_CONTRACT, COMMERCE_PAYMENT_PREPARATION_TTL_MS,
  parseCommercePaymentPreparationRequest, parseCommercePaymentPreparationResponse,
} from "@antsia/social-domain/commerce-payment-preparation"
import { commerceCanonicalJson, commerceIsOpaqueId, parseCommerceRef } from "@antsia/social-domain/commerce/primitives"
import { type Infer, v } from "convex/values"

import type { Id } from "../../_generated/dataModel"
import { internalMutation, internalQuery, type QueryCtx } from "../../_generated/server"
import { requireMembership } from "../../lib/access"
import { enforceRateLimit } from "../../lib/rateLimit"
import { getActiveIdentity } from "../../lib/session"
import { isFederatedPage } from "../federation/mirrorAccess"
import { managedShopOrNull } from "./access"
import { readCommerceLinkConfig } from "./commerceLinkConfig"
import { sha256Hex } from "./commerceLinkCrypto"
import { liveShopCommerceLink } from "./commerceLinkLifecycle"
import { paymentPreparationEnabled, paymentPreparationResultValidator, paymentPreparationView, type PaymentPreparationResult } from "./paymentPreparationRules"

export const paymentPreparationAdmissionValidator = v.object({
  shopId: v.id("shops"), pageId: v.id("pages"), personId: v.id("persons"), linkId: v.id("shopCommerceLinks"),
  sessionDigest: v.string(), configFingerprint: v.string(), linkUpdatedAt: v.number(), rawBody: v.string(),
})
export type PaymentPreparationAdmission = Infer<typeof paymentPreparationAdmissionValidator>

async function authority(ctx: QueryCtx, networkId: Id<"networks">, shopId: Id<"shops">) {
  const access = await requireMembership(ctx, networkId, "declaree")
  if (!paymentPreparationEnabled() || access.person.erasedAt !== undefined || access.person.deletionRequestedAt !== undefined) return null
  const identity = await getActiveIdentity(ctx), config = await readCommerceLinkConfig()
  if (!identity || typeof identity.sessionId !== "string" || !config) return null
  const managed = await managedShopOrNull(ctx, networkId, access.person._id, shopId)
  if (!managed?.page || managed.shop.storefront === "suspended" || await isFederatedPage(ctx, managed.page._id)) return null
  const link = await liveShopCommerceLink(ctx, networkId, shopId)
  // Même administrateur de la page : une autre personne n'est jamais le titulaire PRO de CE lien.
  if (!link || link.personId !== access.person._id || link.pageId !== managed.page._id || link.source !== config.source || link.environment !== config.environment || link.configFingerprint !== config.fingerprint || parseCommerceRef(link.shopRef)?.kind !== "structure") return null
  return { access, config, managed, link, sessionDigest: await sha256Hex(identity.sessionId) }
}

async function currentAdmission(ctx: QueryCtx, networkId: Id<"networks">, admission: PaymentPreparationAdmission) {
  const current = await authority(ctx, networkId, admission.shopId)
  if (!current || current.access.person._id !== admission.personId || current.managed.page!._id !== admission.pageId || current.link._id !== admission.linkId || current.link.updatedAt !== admission.linkUpdatedAt ||
    current.sessionDigest !== admission.sessionDigest || current.config.fingerprint !== admission.configFingerprint) return null
  const parsed = parseCommercePaymentPreparationRequest(admission.rawBody, { source: current.config.source, environment: current.config.environment, nowMs: Date.now() })
  if (!parsed.ok || parsed.value.subject.ref !== current.link.subjectRef || parsed.value.linkRef !== current.link.linkRef || parsed.value.shopRef !== current.link.shopRef || parsed.value.antsiaShopRef !== current.link.antsiaShopRef) return null
  return { ...current, request: parsed.value }
}

export const admit = internalMutation({
  args: { networkId: v.id("networks"), shopId: v.id("shops"), requestId: v.string(), configFingerprint: v.string() }, returns: v.union(paymentPreparationAdmissionValidator, v.null()),
  handler: async (ctx, args): Promise<PaymentPreparationAdmission | null> => {
    const current = await authority(ctx, args.networkId, args.shopId)
    if (!current || current.config.fingerprint !== args.configFingerprint || !commerceIsOpaqueId(args.requestId)) return null
    await enforceRateLimit(ctx, "shop.service.read", current.access.person._id)
    const now = Date.now(), link = current.link
    const rawBody = commerceCanonicalJson({ contract: COMMERCE_PAYMENT_PREPARATION_CONTRACT, version: 1, operation: "payment.preparation.read", source: current.config.source, environment: current.config.environment, requestId: args.requestId,
      subject: { kind: "seller_operator", ref: link.subjectRef, authVerifiedAt: now }, issuedAt: now, expiresAt: now + COMMERCE_PAYMENT_PREPARATION_TTL_MS, linkRef: link.linkRef, shopRef: link.shopRef, antsiaShopRef: link.antsiaShopRef })
    if (!rawBody || !parseCommercePaymentPreparationRequest(rawBody, { source: current.config.source, environment: current.config.environment, nowMs: now }).ok) return null
    return { shopId: args.shopId, pageId: current.managed.page!._id, personId: current.access.person._id, linkId: link._id, sessionDigest: current.sessionDigest, configFingerprint: current.config.fingerprint, linkUpdatedAt: link.updatedAt, rawBody }
  },
})

export const authorize = internalQuery({
  args: { networkId: v.id("networks"), admission: paymentPreparationAdmissionValidator }, returns: v.boolean(),
  handler: async (ctx, args) => !!await currentAdmission(ctx, args.networkId, args.admission),
})

export const finish = internalQuery({
  args: { networkId: v.id("networks"), admission: paymentPreparationAdmissionValidator, rawResponse: v.optional(v.string()), httpStatus: v.optional(v.number()) }, returns: paymentPreparationResultValidator,
  handler: async (ctx, args): Promise<PaymentPreparationResult> => {
    const current = await currentAdmission(ctx, args.networkId, args.admission)
    if (!current || args.rawResponse === undefined) return { outcome: "unavailable" }
    const parsed = parseCommercePaymentPreparationResponse(args.rawResponse, { request: current.request, requestSha256: await sha256Hex(args.admission.rawBody), nowMs: Date.now() })
    if (!parsed.ok) return { outcome: "unavailable" }
    if (parsed.value.outcome === "refused") return { outcome: "refused" }
    if (args.httpStatus !== 200) return { outcome: "unavailable" }
    return { outcome: "ready", preparation: paymentPreparationView(parsed.value), proAppOrigin: current.config.proAppOrigin, proShopRef: current.link.shopRef }
  },
})
