/** P16 : preuve courte du geste CRM, distincte du consentement et de l'autorité de retrait. */
import { COMMERCE_COMMAND_LIMITS } from "@antsia/social-domain/commerce/command"
import { COMMERCE_INQUIRY_CONSENT_VERSION } from "@antsia/social-domain/commerce-inquiry"

import { components } from "../../_generated/api"
import type { Doc, Id } from "../../_generated/dataModel"
import type { MutationCtx } from "../../_generated/server"
import { memberHasStatus } from "../../lib/access"
import { getActiveIdentity } from "../../lib/session"
import { readCommerceLinkConfig } from "../shops/commerceLinkConfig"
import { liveShopCommerceLink } from "../shops/commerceLinkLifecycle"
import { commercialThreadAccess } from "./access"

type Transfer = Doc<"commercialCrmTransfers">
export type CrmAuthorization = { sessionId: string; authorizationAuthUserId: string; authorizedAt: number; authorizationUntil: number }

async function sessionExpiry(ctx: MutationCtx, sessionId: string, subject: string): Promise<number | null> {
  let session: unknown
  try { session = await ctx.runQuery(components.betterAuth.adapter.findOne, { model: "session", where: [{ field: "_id", value: sessionId }] }) }
  catch { return null }
  return session && typeof session === "object" && "_id" in session && session._id === sessionId && "userId" in session && session.userId === subject &&
    "expiresAt" in session && typeof session.expiresAt === "number" && Number.isFinite(session.expiresAt) && session.expiresAt > Date.now() ? session.expiresAt : null
}

/** Uniquement depuis la mutation du geste authentifié, jamais depuis un cron. */
export async function captureCrmAuthorization(ctx: MutationCtx, personId: Id<"persons">): Promise<CrmAuthorization | null> {
  const person = await ctx.db.get(personId), identity = await getActiveIdentity(ctx), now = Date.now()
  if (!person || person.erasedAt !== undefined || person.deletionRequestedAt !== undefined || !identity || typeof identity.sessionId !== "string" || person.authUserId !== identity.subject) return null
  const expiresAt = await sessionExpiry(ctx, identity.sessionId, identity.subject)
  return expiresAt === null ? null : { sessionId: identity.sessionId, authorizationAuthUserId: identity.subject, authorizedAt: now, authorizationUntil: Math.min(expiresAt, now + COMMERCE_COMMAND_LIMITS.authMaxAgeMs) }
}

/** Historique sous propriétaire : aucune réadoption de session, de liaison ou de boutique depuis le job. */
export async function liveCrmAuthorization(ctx: MutationCtx, row: Transfer): Promise<boolean> {
  const now = Date.now(), person = await ctx.db.get(row.personId), config = await readCommerceLinkConfig()
  return !!person && person.erasedAt === undefined && person.deletionRequestedAt === undefined && row.revokedAt === undefined &&
    !!row.sessionId && !!row.authorizationAuthUserId && person.authUserId === row.authorizationAuthUserId && row.authorizedAt !== undefined &&
    row.authorizedAt <= now && now - row.authorizedAt <= COMMERCE_COMMAND_LIMITS.authMaxAgeMs && (row.authorizationUntil ?? 0) > now &&
    await sessionExpiry(ctx, row.sessionId, row.authorizationAuthUserId) !== null && await memberHasStatus(ctx, row.networkId, row.personId, "declaree") &&
    !!config && config.fingerprint === row.configFingerprint && config.source === row.source && config.environment === row.environment
}

/** Nouvel envoi : le consentement reste lié à CETTE conversation et CETTE incarnation vendeur. */
export async function liveCrmOrigin(ctx: MutationCtx, row: Transfer): Promise<boolean> {
  if (!row.originLinkRef || !row.originShopRef || row.textVersion !== COMMERCE_INQUIRY_CONSENT_VERSION) return false
  const access = await commercialThreadAccess(ctx, row.networkId, row.personId, row.threadId)
  if (!access || access.viewerKind !== "requester" || access.blocked || access.thread.state !== "accepted" || access.shop._id !== row.shopId || access.thread.conversationRef !== row.conversationRef) return false
  const link = await liveShopCommerceLink(ctx, access.shop.networkId, access.shop._id)
  return !!link && link.linkRef === row.originLinkRef && link.shopRef === row.originShopRef && link.configFingerprint === row.configFingerprint &&
    link.source === row.source && link.environment === row.environment && link.permissions.includes("receive_inquiries")
}
