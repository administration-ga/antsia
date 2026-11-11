/** P10 : autorité commerciale relue, distincte des relations et des droits CRM. */
import { COMMERCIAL_TEAM_MAX } from "@antsia/social-domain/commercialContact"
import { isConsentInForce } from "@antsia/social-domain/consent"

import type { Doc, Id } from "../../_generated/dataModel"
import type { QueryCtx } from "../../_generated/server"
import { memberHasStatus } from "../../lib/access"
import { notFound } from "../../lib/errors"
import { evaluateCallAdmission } from "../calls/evaluate"
import { isBlockedBetween } from "../graph/graph"
import { liveSignatoryRole } from "../pages/access"
import { livePersonProfile } from "../people/miniProfile"
import { isStorefrontInReadingContext, managedShopOrNull, servableStorefrontPage } from "../shops/access"

export type ReadCtx = Pick<QueryCtx, "db"> & { commercialEligibility?: Map<string, Promise<boolean>> }
/** Cache local à UNE requête paginée, jamais global et jamais persisté. */
export function withCommercialEligibility<T extends Pick<QueryCtx, "db">>(ctx: T): T & ReadCtx {
  return { ...ctx, commercialEligibility: new Map<string, Promise<boolean>>() }
}
export type CommercialAccess = {
  thread: Doc<"commercialThreads">; shop: Doc<"shops">; page: Doc<"pages">;
  viewerKind: "requester" | "shop"; mandate: Doc<"shopContactMandates"> | null; blocked: boolean;
}
export async function livingMember(ctx: ReadCtx, networkId: Id<"networks">, personId: Id<"persons">): Promise<boolean> {
  const key = `${networkId}:${personId}`
  const cached = ctx.commercialEligibility?.get(key)
  if (cached) return await cached
  const work = (async () => {
    if (!await livePersonProfile(ctx, personId) || !await memberHasStatus(ctx, networkId, personId, "declaree")) return false
    const records = await ctx.db.query("consents").withIndex("by_person_and_purpose", (q) => q.eq("personId", personId).eq("purpose", "social_profile")).take(101)
    // Même borne que l'historique des consentements ; un dépassement ferme l'admission.
    return records.length <= 100 && isConsentInForce(records.filter((record) => record.networkId === undefined || record.networkId === networkId), "social_profile")
  })()
  ctx.commercialEligibility?.set(key, work)
  return await work
}
export async function contactNetworkEnabled(ctx: ReadCtx, networkId: Id<"networks">): Promise<boolean> {
  return (await ctx.db.query("commercialNetworkPolicies").withIndex("by_network", (q) => q.eq("networkId", networkId)).unique())?.enabled === true
}
export async function contactSettings(ctx: ReadCtx, shopId: Id<"shops">): Promise<Doc<"shopContactSettings"> | null> {
  return await ctx.db.query("shopContactSettings").withIndex("by_shop", (q) => q.eq("shopId", shopId)).unique()
}
/** Capacité publique indicative ; l'écriture relit aussi l'adhésion et les intentions de blocage. */
export async function contactEnabledForShop(ctx: ReadCtx, shopId: Id<"shops">, readingNetworkId?: Id<"networks">): Promise<boolean> {
  const shop = await ctx.db.get(shopId)
  if (!shop || !await contactNetworkEnabled(ctx, shop.networkId) || !(await contactSettings(ctx, shopId))?.acceptRequests || !await servableStorefrontPage(ctx, shop)) return false
  if (readingNetworkId === undefined) return true
  const network = await ctx.db.get(readingNetworkId)
  return network !== null && await contactNetworkEnabled(ctx, readingNetworkId) && await isStorefrontInReadingContext(ctx, shop, network)
}
export async function mandateOf(ctx: ReadCtx, shopId: Id<"shops">, personId: Id<"persons">): Promise<Doc<"shopContactMandates"> | null> {
  return await ctx.db.query("shopContactMandates").withIndex("by_shop_person", (q) => q.eq("shopId", shopId).eq("personId", personId)).unique()
}
export async function readStateOf(ctx: ReadCtx, threadId: Id<"commercialThreads">, personId: Id<"persons">): Promise<Doc<"commercialReadStates"> | null> {
  return await ctx.db.query("commercialReadStates").withIndex("by_thread_person", (q) => q.eq("threadId", threadId).eq("personId", personId)).unique()
}
export async function liveMandate(ctx: ReadCtx, shop: Doc<"shops">, personId: Id<"persons">, conversationNetworkId?: Id<"networks">): Promise<Doc<"shopContactMandates"> | null> {
  const mandate = await mandateOf(ctx, shop._id, personId)
  if (!mandate || mandate.networkId !== shop.networkId || mandate.revokedAt !== undefined || mandate.acceptedAt === undefined || !mandate.canRead || shop.pageId === undefined) return null
  if (!await livingMember(ctx, shop.networkId, personId) || (conversationNetworkId !== undefined && conversationNetworkId !== shop.networkId && !await livingMember(ctx, conversationNetworkId, personId))) return null
  const page = await ctx.db.get(shop.pageId)
  return page && await liveSignatoryRole(ctx, page, personId) !== null ? mandate : null
}
export async function requireContactManager(ctx: ReadCtx, networkId: Id<"networks">, personId: Id<"persons">, shopId: Id<"shops">) {
  const shop = await ctx.db.get(shopId)
  if (!shop || !await livingMember(ctx, networkId, personId) || !await livingMember(ctx, shop.networkId, personId)) return notFound()
  const managed = await managedShopOrNull(ctx, shop.networkId, personId, shopId)
  const network = await ctx.db.get(networkId)
  if (!managed || !managed.page || !network || !await isStorefrontInReadingContext(ctx, shop, network)) return notFound()
  return { shop, page: managed.page }
}
export async function commercialThreadAccess(ctx: ReadCtx, networkId: Id<"networks">, personId: Id<"persons">, threadId: Id<"commercialThreads">, includeBlocked = false): Promise<CommercialAccess | null> {
  const thread = await ctx.db.get(threadId)
  if (!thread || thread.networkId !== networkId || !await livingMember(ctx, networkId, personId) || !await livingMember(ctx, networkId, thread.requesterPersonId) || !await contactNetworkEnabled(ctx, networkId)) return null
  const shop = await ctx.db.get(thread.shopId)
  const network = await ctx.db.get(networkId)
  if (!shop || !network || !await contactNetworkEnabled(ctx, shop.networkId) || !await isStorefrontInReadingContext(ctx, shop, network)) return null
  const page = await servableStorefrontPage(ctx, shop, personId)
  if (!page) return null
  const viewerKind = personId === thread.requesterPersonId ? "requester" : "shop"
  const mandate = viewerKind === "shop" ? await liveMandate(ctx, shop, personId, networkId) : null
  if (viewerKind === "shop" && (!mandate || await isBlockedBetween(ctx, personId, thread.requesterPersonId))) return null
  const blocked = (await ctx.db.query("commercialBlocks").withIndex("by_pair", (q) => q.eq("networkId", networkId).eq("shopId", shop._id).eq("requesterPersonId", thread.requesterPersonId)).take(2)).length > 0
  return blocked && !includeBlocked ? null : { thread, shop, page, viewerKind, mandate, blocked }
}
export async function requireCommercialThread(ctx: ReadCtx, networkId: Id<"networks">, personId: Id<"persons">, threadId: Id<"commercialThreads">, includeBlocked = false): Promise<CommercialAccess> {
  return await commercialThreadAccess(ctx, networkId, personId, threadId, includeBlocked) ?? notFound()
}
export async function canReadCommercialThread(ctx: ReadCtx, networkId: Id<"networks">, personId: Id<"persons">, threadId: Id<"commercialThreads">): Promise<boolean> {
  return await commercialThreadAccess(ctx, networkId, personId, threadId) !== null
}
export async function canReadCommercialMessage(ctx: ReadCtx, networkId: Id<"networks">, personId: Id<"persons">, messageId: Id<"commercialMessages">): Promise<boolean> {
  const message = await ctx.db.get(messageId)
  return message !== null && message.networkId === networkId && message.deletedAt === undefined && await canReadCommercialThread(ctx, networkId, personId, message.threadId)
}
export async function liveRespondents(ctx: ReadCtx, access: Pick<CommercialAccess, "thread" | "shop">): Promise<Doc<"shopContactMandates">[]> {
  const rows = await ctx.db.query("shopContactMandates").withIndex("by_shop_revoked", (q) => q.eq("shopId", access.shop._id).eq("revokedAt", undefined)).take(COMMERCIAL_TEAM_MAX + 1)
  const out: Doc<"shopContactMandates">[] = []
  for (const row of rows.slice(0, COMMERCIAL_TEAM_MAX)) {
    if (!row.canReply || await isBlockedBetween(ctx, row.personId, access.thread.requesterPersonId)) continue
    const live = await liveMandate(ctx, access.shop, row.personId, access.thread.networkId)
    if (live) out.push(live)
  }
  return out
}
export async function respondentCallConsent(ctx: ReadCtx, threadId: Id<"commercialThreads">, mandate: Doc<"shopContactMandates">): Promise<boolean> {
  const state = await readStateOf(ctx, threadId, mandate.personId)
  return mandate.canCall && state?.callsAllowed === true && state.callConsentMandateRevision === mandate.revision
}
/** Relit LES DEUX parties ; une ancienne participation ne prolonge aucun droit. */
export async function commercialCallPairAllowed(ctx: ReadCtx, thread: Doc<"commercialThreads">, first: Id<"persons">, second: Id<"persons">): Promise<boolean> {
  if (first === second || (first !== thread.requesterPersonId && second !== thread.requesterPersonId) || thread.state !== "accepted" || !thread.buyerCallsAllowed) return false
  if (!await livePersonProfile(ctx, first) || !await livePersonProfile(ctx, second)) return false
  const respondent = first === thread.requesterPersonId ? second : first
  const [buyer, seller] = await Promise.all([commercialThreadAccess(ctx, thread.networkId, thread.requesterPersonId, thread._id), commercialThreadAccess(ctx, thread.networkId, respondent, thread._id)])
  return buyer !== null && seller !== null && seller.mandate !== null && seller.mandate.canReply && await respondentCallConsent(ctx, thread._id, seller.mandate) && !await isBlockedBetween(ctx, first, second)
}
export async function canParticipateCommercialCall(ctx: ReadCtx, call: Doc<"calls">, personId: Id<"persons">): Promise<boolean> {
  if (!call.commercialThreadId || call.kind !== "direct" || !call.calleePersonId || (personId !== call.createdByPersonId && personId !== call.calleePersonId)) return false
  const thread = await ctx.db.get(call.commercialThreadId)
  if (!thread || thread.networkId !== call.networkId || !await commercialCallPairAllowed(ctx, thread, call.createdByPersonId, call.calleePersonId)) return false
  // Avant décrochage, un nouveau silence, une occupation ou une absence ne sont pas photographiés au départ.
  if (call.status === "active" && call.answeredAt === undefined) {
    // IC-04 : la paire vient d'être relue avec ses deux accords d'appel — ils lèvent le réglage « hors de mes relations », comme au départ.
    const admission = await evaluateCallAdmission(ctx, { networkId: call.networkId, calleePersonId: call.calleePersonId, callerPersonId: call.createdByPersonId, now: Date.now(), viaCommercialConsent: true })
    if (!admission.decision.admitted) return false
  }
  return true
}
