/** MP06c : admission et arrivée d'une lecture privée du titulaire de liaison. Aucune table ajoutée. */
import {
  COMMERCE_MERCHANT_READ_CONTRACT, COMMERCE_MERCHANT_READ_TTL_MS,
  parseCommerceMerchantReadRequest, parseCommerceMerchantReadResponse,
} from "@antsia/social-domain/commerce-merchant"
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
import { merchantPreparationEnabled, merchantPreparationResultValidator, merchantPreparationView, type MerchantPreparationResult } from "./merchantPreparationRules"

export const merchantPreparationAdmissionValidator = v.object({
  shopId: v.id("shops"), pageId: v.id("pages"), personId: v.id("persons"), linkId: v.id("shopCommerceLinks"),
  sessionDigest: v.string(), configFingerprint: v.string(), linkUpdatedAt: v.number(), rawBody: v.string(),
})
export type MerchantPreparationAdmission = Infer<typeof merchantPreparationAdmissionValidator>

async function authority(ctx: QueryCtx, networkId: Id<"networks">, shopId: Id<"shops">) {
  const access = await requireMembership(ctx, networkId, "declaree")
  if (!merchantPreparationEnabled() || access.person.erasedAt !== undefined || access.person.deletionRequestedAt !== undefined) return null
  const identity = await getActiveIdentity(ctx), config = await readCommerceLinkConfig()
  if (!identity || typeof identity.sessionId !== "string" || !config) return null
  const managed = await managedShopOrNull(ctx, networkId, access.person._id, shopId)
  if (!managed?.page || managed.shop.storefront === "suspended" || await isFederatedPage(ctx, managed.page._id)) return null
  const link = await liveShopCommerceLink(ctx, networkId, shopId)
  // Même administrateur de la page : une autre personne n'est jamais le titulaire PRO de CE lien.
  if (!link || link.personId !== access.person._id || link.pageId !== managed.page._id || link.configFingerprint !== config.fingerprint || parseCommerceRef(link.shopRef)?.kind !== "structure") return null
  return { access, config, managed, link, sessionDigest: await sha256Hex(identity.sessionId) }
}

async function currentAdmission(ctx: QueryCtx, networkId: Id<"networks">, admission: MerchantPreparationAdmission) {
  const current = await authority(ctx, networkId, admission.shopId)
  if (!current || current.access.person._id !== admission.personId || current.managed.page!._id !== admission.pageId || current.link._id !== admission.linkId || current.link.updatedAt !== admission.linkUpdatedAt ||
    current.sessionDigest !== admission.sessionDigest || current.config.fingerprint !== admission.configFingerprint) return null
  const parsed = parseCommerceMerchantReadRequest(admission.rawBody, { source: current.config.source, environment: current.config.environment, nowMs: Date.now() })
  if (!parsed.ok || parsed.value.subject.ref !== current.link.subjectRef || parsed.value.linkRef !== current.link.linkRef || parsed.value.shopRef !== current.link.shopRef || parsed.value.antsiaShopRef !== current.link.antsiaShopRef) return null
  return { ...current, request: parsed.value }
}

export const admit = internalMutation({
  args: { networkId: v.id("networks"), shopId: v.id("shops"), requestId: v.string(), configFingerprint: v.string() }, returns: v.union(merchantPreparationAdmissionValidator, v.null()),
  handler: async (ctx, args): Promise<MerchantPreparationAdmission | null> => {
    const current = await authority(ctx, args.networkId, args.shopId)
    if (!current || current.config.fingerprint !== args.configFingerprint || !commerceIsOpaqueId(args.requestId)) return null
    await enforceRateLimit(ctx, "shop.service.read", current.access.person._id)
    const now = Date.now(), link = current.link
    const rawBody = commerceCanonicalJson({ contract: COMMERCE_MERCHANT_READ_CONTRACT, version: 1, operation: "merchant.preparation.read", source: current.config.source, environment: current.config.environment, requestId: args.requestId,
      subject: { kind: "seller_operator", ref: link.subjectRef, authVerifiedAt: now }, issuedAt: now, expiresAt: now + COMMERCE_MERCHANT_READ_TTL_MS, linkRef: link.linkRef, shopRef: link.shopRef, antsiaShopRef: link.antsiaShopRef })
    if (!rawBody || !parseCommerceMerchantReadRequest(rawBody, { source: current.config.source, environment: current.config.environment, nowMs: now }).ok) return null
    return { shopId: args.shopId, pageId: current.managed.page!._id, personId: current.access.person._id, linkId: link._id, sessionDigest: current.sessionDigest, configFingerprint: current.config.fingerprint, linkUpdatedAt: link.updatedAt, rawBody }
  },
})

export const authorize = internalQuery({
  args: { networkId: v.id("networks"), admission: merchantPreparationAdmissionValidator }, returns: v.boolean(),
  handler: async (ctx, args) => !!await currentAdmission(ctx, args.networkId, args.admission),
})

export const finish = internalQuery({
  args: { networkId: v.id("networks"), admission: merchantPreparationAdmissionValidator, rawResponse: v.optional(v.string()), httpStatus: v.optional(v.number()) }, returns: merchantPreparationResultValidator,
  handler: async (ctx, args): Promise<MerchantPreparationResult> => {
    const current = await currentAdmission(ctx, args.networkId, args.admission)
    if (!current || args.rawResponse === undefined) return { outcome: "unavailable" }
    const parsed = parseCommerceMerchantReadResponse(args.rawResponse, { request: current.request, requestSha256: await sha256Hex(args.admission.rawBody), nowMs: Date.now() })
    if (!parsed.ok) return { outcome: "unavailable" }
    if (parsed.value.outcome === "refused") return { outcome: "refused" }
    if (args.httpStatus !== 200) return { outcome: "unavailable" }
    return { outcome: "ready", preparation: merchantPreparationView(parsed.value), proAppOrigin: current.config.proAppOrigin, proShopRef: current.link.shopRef }
  },
})
