import { commerceActivationReady } from "./commerceActivation"
/** P12 : propriété historique pour le suivi, autorité courante pour tout nouveau débit. */
import type { Id } from "../../_generated/dataModel"
import type { MutationCtx, QueryCtx } from "../../_generated/server"
import { requireMembership } from "../../lib/access"
import { getActiveIdentity } from "../../lib/session"
import { assertSocialWriteAllowed } from "../moderation/policy"
import { checkoutCatalogAuthority } from "./checkoutFlow"
import { readCommerceLinkConfig } from "./commerceLinkConfig"
import { sha256Hex } from "./commerceLinkCrypto"

type ReadCtx = Pick<QueryCtx, "db">
export const paymentOpaque = (value: string) => /^[A-Za-z0-9][A-Za-z0-9._:-]{7,99}$/u.test(value)
export async function paymentPolicyOpen(ctx: ReadCtx, networkId: Id<"networks">): Promise<boolean> {
  if (!commerceActivationReady("payments")) return false
  return (await ctx.db.query("shopPaymentPolicies").withIndex("by_network", (q) => q.eq("networkId", networkId)).unique())?.enabled === true
}
export async function ownedPaymentCheckout(ctx: ReadCtx, networkId: Id<"networks">, personId: Id<"persons">, attemptId: string) {
  if (!paymentOpaque(attemptId)) return null
  const row = await ctx.db.query("checkoutAttempts").withIndex("by_attempt", (q) => q.eq("attemptId", attemptId)).unique()
  return row && row.networkId === networkId && row.personId === personId && row.cancelledAt === undefined ? row : null
}
export async function ownedPaymentAttempt(ctx: ReadCtx, networkId: Id<"networks">, personId: Id<"persons">, attemptId: string) {
  if (!paymentOpaque(attemptId)) return null
  const row = await ctx.db.query("shopPaymentAttempts").withIndex("by_attempt", (q) => q.eq("paymentAttemptId", attemptId)).unique()
  return row && row.networkId === networkId && row.personId === personId && row.privacyRevokedAt === undefined ? row : null
}

export async function paymentAuthority(ctx: QueryCtx | MutationCtx, networkId: Id<"networks">, checkoutAttemptId: string, newPayment: boolean) {
  const access = await requireMembership(ctx, networkId, "declaree")
  if (access.person.erasedAt !== undefined || access.person.deletionRequestedAt !== undefined) return null
  const checkout = await ownedPaymentCheckout(ctx, networkId, access.person._id, checkoutAttemptId)
  const identity = await getActiveIdentity(ctx), config = await readCommerceLinkConfig()
  if (!checkout || !checkout.checkoutRef || !checkout.result || !identity || typeof identity.sessionId !== "string" || !config || config.environment !== "sandbox" || config.source !== checkout.source || config.environment !== checkout.environment) return null
  const sessionDigest = await sha256Hex(identity.sessionId)
  if (newPayment) {
    if (checkout.configFingerprint !== config.fingerprint || checkout.result.expiresAt <= Date.now() || checkout.state !== "held" || !await paymentPolicyOpen(ctx, networkId)) return null
    const current = await checkoutCatalogAuthority(ctx, networkId, checkout.handle)
    if (!current || current.sessionDigest !== checkout.sessionDigest || sessionDigest !== checkout.sessionDigest || current.live.shop._id !== checkout.shopId || current.live.mapping._id !== checkout.mappingId || current.live.mapping.generation !== checkout.mappingGeneration || current.live.parentHead.activationRevision !== checkout.parentActivationRevision || current.live.link.linkRef !== checkout.linkRef || !await paymentPolicyOpen(ctx, current.live.shop.networkId)) return null
    await assertSocialWriteAllowed(ctx, networkId, access.person._id)
  }
  return { access, checkout, config, scope: {
    networkId, personId: access.person._id, shopId: checkout.shopId, checkoutAttemptId, checkoutRef: checkout.checkoutRef, handle: checkout.handle,
    sessionDigest, configFingerprint: config.fingerprint, source: config.source, environment: config.environment, shopRef: checkout.shopRef, subjectRef: checkout.subjectRef,
  } }
}
