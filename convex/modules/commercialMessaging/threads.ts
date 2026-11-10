import { COMMERCIAL_RETENTION_MS, commercialCanSend, commercialIdempotencyKey, commercialText } from "@antsia/social-domain/commercialContact"
import { makeFunctionReference, type PaginationResult, paginationOptsValidator, paginationResultValidator } from "convex/server"
import { type Infer, v } from "convex/values"

import type { Doc, Id } from "../../_generated/dataModel"
import type { MutationCtx, QueryCtx } from "../../_generated/server"
import { getRootNetwork } from "../../lib/access"
import { fail, notFound } from "../../lib/errors"
import { networkMutation, networkQuery } from "../../lib/functions"
import { enforceRateLimit } from "../../lib/rateLimit"
import { finishCall } from "../calls/state"
import { servableUrl } from "../files/storageGuard"
import { counterpartOf } from "../messaging/participation"
import { findPageByHandle } from "../pages/access"
import { isStorefrontInReadingContext, servableStorefrontPage, shopOfPage } from "../shops/access"
import { resolveCatalogOffer } from "../shops/catalogRead"
import { type CommercialAccess, commercialThreadAccess, contactNetworkEnabled, contactSettings, liveMandate, liveRespondents, livingMember, readStateOf, requireCommercialThread, respondentCallConsent, withCommercialEligibility } from "./access"
import { onCommercialActivity } from "./hooks"
import { commercialStateValidator } from "./tables"

const personLabel = v.object({ displayName: v.union(v.string(), v.null()), handle: v.union(v.string(), v.null()) })
const revalidateCommercialCalls = makeFunctionReference<"mutation", { cursor?: string }, number>("modules/commercialMessaging/retention:revalidateCalls")
export const commercialThreadValidator = v.object({
  threadId: v.id("commercialThreads"), conversationRef: v.string(), networkId: v.id("networks"),
  shop: v.object({ shopId: v.id("shops"), pageId: v.id("pages"), handle: v.string(), name: v.string(), logoUrl: v.union(v.string(), v.null()) }),
  offer: v.union(v.object({ offerRef: v.string(), title: v.string(), kind: v.union(v.literal("product"), v.literal("service")) }), v.null()),
  state: commercialStateValidator, revision: v.number(), viewerKind: v.union(v.literal("requester"), v.literal("shop")),
  requesterPersonId: v.id("persons"), requester: personLabel,
  createdAt: v.number(), updatedAt: v.number(), lastMessageAt: v.number(), unread: v.boolean(), callConsent: v.boolean(),
  capabilities: v.object({ canSend: v.boolean(), canAttach: v.boolean(), canDecide: v.boolean(), canBlock: v.boolean(), canClose: v.boolean(), canSetCallConsent: v.boolean(), canCall: v.boolean() }),
  respondents: v.array(v.object({ personId: v.id("persons"), displayName: v.union(v.string(), v.null()), handle: v.union(v.string(), v.null()), callConsent: v.boolean() })),
})
export type CommercialThreadDto = Infer<typeof commercialThreadValidator>
export async function commercialDigest(value: unknown): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(value))))
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("")
}
export async function stopCommercialCalls(ctx: MutationCtx, threadId: Id<"commercialThreads">): Promise<void> {
  // Au plus un appel vivant par fil ; deux permettent de fermer une ancienne anomalie sans balayage.
  const calls = await ctx.db.query("calls").withIndex("by_commercial_thread_status", (q) => q.eq("commercialThreadId", threadId).eq("status", "active")).take(2)
  for (const call of calls) await finishCall(ctx, call, { callStatus: "ended", endReason: "normal" }, Date.now())
}
export async function projectCommercialThread(ctx: QueryCtx, access: CommercialAccess, personId: Id<"persons">): Promise<CommercialThreadDto> {
  const { thread, shop, page, viewerKind, mandate, blocked } = access
  const state = await readStateOf(ctx, thread._id, personId)
  const ownCallConsent = viewerKind === "requester" ? thread.buyerCallsAllowed : mandate !== null && await respondentCallConsent(ctx, thread._id, mandate)
  const respondents = []
  if (!blocked) for (const respondent of await liveRespondents(ctx, access)) {
    const who = await counterpartOf(ctx, respondent.personId)
    respondents.push({ personId: respondent.personId, displayName: who.displayName, handle: who.handle, callConsent: await respondentCallConsent(ctx, thread._id, respondent) })
  }
  const canSend = commercialCanSend(thread.state, blocked, viewerKind === "requester" || mandate?.canReply === true)
  const requester = await counterpartOf(ctx, thread.requesterPersonId)
  const root = await getRootNetwork(ctx)
  const network = await ctx.db.get(thread.networkId)
  const offer = thread.offerRef && root && network ? await resolveCatalogOffer(ctx, { root, network, readerPersonId: personId }, shop._id, thread.offerRef) : null
  return {
    threadId: thread._id, conversationRef: thread.conversationRef, networkId: thread.networkId,
    shop: { shopId: shop._id, pageId: page._id, handle: page.handle, name: page.name, logoUrl: page.logoStorageId ? await servableUrl(ctx, page.logoStorageId) : null },
    offer: offer ? { offerRef: offer.offerRef, title: offer.title, kind: offer.kind } : null,
    state: blocked ? "blocked" : thread.state, revision: thread.revision, viewerKind, requesterPersonId: thread.requesterPersonId,
    requester: { displayName: requester.displayName, handle: requester.handle }, createdAt: thread.createdAt, updatedAt: thread.updatedAt, lastMessageAt: thread.lastMessageAt,
    unread: !blocked && thread.lastMessageAt > (state?.readAt ?? 0), callConsent: ownCallConsent,
    capabilities: {
      canSend, canAttach: canSend,
      canDecide: !blocked && thread.state === "requested" && mandate?.canDecide === true,
      canBlock: viewerKind === "requester" || mandate?.canDecide === true,
      canClose: !blocked && (viewerKind === "requester" || mandate?.canDecide === true) && (thread.state === "accepted" || thread.state === "requested"),
      canSetCallConsent: viewerKind === "requester" || (mandate?.canReply === true && mandate.canCall === true),
      canCall: canSend && ownCallConsent && thread.buyerCallsAllowed && (viewerKind === "requester" ? respondents.some((row) => row.callConsent) : mandate?.canCall === true),
    }, respondents,
  }
}
export const requestContact = networkMutation({
  args: { shopHandle: v.string(), offerRef: v.optional(v.string()), text: v.string(), idempotencyKey: v.string() },
  returns: v.object({ threadId: v.id("commercialThreads"), messageId: v.id("commercialMessages"), deduplicated: v.boolean() }),
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, "commercial.request.member", ctx.person._id)
    // Une illustration fictive ne devient jamais l'objet d'un contact commercial réel.
    if (args.offerRef?.startsWith("demo:")) return notFound()
    const text = commercialText(args.text)
    if (text === null || !commercialIdempotencyKey(args.idempotencyKey)) return fail("invalidArgument", { field: text === null ? "text" : "idempotencyKey" })
    const page = await findPageByHandle(ctx, args.shopHandle)
    const shop = page ? await shopOfPage(ctx, page._id) : null
    if (!shop || !await livingMember(ctx, ctx.networkId, ctx.person._id) || !await contactNetworkEnabled(ctx, ctx.networkId) || !await contactNetworkEnabled(ctx, shop.networkId) || !await isStorefrontInReadingContext(ctx, shop, ctx.network) || !await servableStorefrontPage(ctx, shop, ctx.person._id)) return notFound()
    const digest = await commercialDigest(["request", shop._id, args.offerRef ?? null, text])
    const replay = await ctx.db.query("commercialMessages").withIndex("by_network_sender_key", (q) => q.eq("networkId", ctx.networkId).eq("senderPersonId", ctx.person._id).eq("idempotencyKey", args.idempotencyKey)).unique()
    if (replay) {
      if (replay.digest !== digest || replay.deletedAt !== undefined || !await commercialThreadAccess(ctx, ctx.networkId, ctx.person._id, replay.threadId)) return notFound()
      return { threadId: replay.threadId, messageId: replay._id, deduplicated: true }
    }
    if (!(await contactSettings(ctx, shop._id))?.acceptRequests) return notFound()
    if ((await ctx.db.query("commercialBlocks").withIndex("by_pair", (q) => q.eq("networkId", ctx.networkId).eq("shopId", shop._id).eq("requesterPersonId", ctx.person._id)).take(1)).length > 0) return notFound()
    const existing = await ctx.db.query("commercialThreads").withIndex("by_requester_shop_offer", (q) => q.eq("networkId", ctx.networkId).eq("requesterPersonId", ctx.person._id).eq("shopId", shop._id).eq("offerRef", args.offerRef)).order("desc").first()
    if (existing && (existing.state === "requested" || existing.state === "accepted" || existing.state === "blocked")) return notFound()
    // Un mandat propre n'autorise pas à se fabriquer une demande côté client.
    if (await liveMandate(ctx, shop, ctx.person._id, ctx.networkId)) return notFound()
    await enforceRateLimit(ctx, "commercial.request.pair", `${ctx.person._id}:${shop._id}`)
    await enforceRateLimit(ctx, "commercial.request.shop", shop._id)
    if (args.offerRef !== undefined) {
      const root = await getRootNetwork(ctx)
      if (!root || !await resolveCatalogOffer(ctx, { root, network: ctx.network, readerPersonId: ctx.person._id }, shop._id, args.offerRef)) return notFound()
    }
    const now = Date.now()
    const threadId = await ctx.db.insert("commercialThreads", { networkId: ctx.networkId, shopId: shop._id, requesterPersonId: ctx.person._id, ...(args.offerRef ? { offerRef: args.offerRef } : {}), conversationRef: "pending", state: "requested", revision: 1, buyerCallsAllowed: false, createdAt: now, updatedAt: now, lastMessageAt: now })
    await ctx.db.patch(threadId, { conversationRef: `antsia:conv:${await commercialDigest([threadId, ctx.networkId, ctx.person._id, now])}` })
    const messageId = await ctx.db.insert("commercialMessages", { networkId: ctx.networkId, threadId, senderPersonId: ctx.person._id, senderKind: "requester", content: text, idempotencyKey: args.idempotencyKey, digest, createdAt: now })
    await ctx.db.insert("commercialReadStates", { networkId: ctx.networkId, threadId, personId: ctx.person._id, readAt: now, updatedAt: now })
    await onCommercialActivity(ctx, { threadId, actorPersonId: ctx.person._id, kind: "requested", messageId })
    return { threadId, messageId, deduplicated: false }
  },
})
export const getThread = networkQuery({
  args: { threadId: v.optional(v.id("commercialThreads")), conversationRef: v.optional(v.string()) }, returns: v.union(commercialThreadValidator, v.null()),
  handler: async (ctx, args): Promise<CommercialThreadDto | null> => {
    if ((args.threadId === undefined) === (args.conversationRef === undefined)) return fail("invalidArgument", { field: "threadId" })
    if (args.conversationRef !== undefined && !/^antsia:conv:[a-f0-9]{64}$/u.test(args.conversationRef)) return null
    const thread = args.threadId ? await ctx.db.get(args.threadId) : await ctx.db.query("commercialThreads").withIndex("by_conversationRef", (q) => q.eq("conversationRef", args.conversationRef!)).unique()
    const access = thread ? await commercialThreadAccess(ctx, ctx.networkId, ctx.person._id, thread._id, true) : null
    return access ? await projectCommercialThread(ctx, access, ctx.person._id) : null
  },
})
export const findMyThread = networkQuery({
  args: { shopHandle: v.string(), offerRef: v.optional(v.string()) }, returns: v.union(commercialThreadValidator, v.null()),
  handler: async (ctx, args): Promise<CommercialThreadDto | null> => {
    const page = await findPageByHandle(ctx, args.shopHandle)
    const shop = page ? await shopOfPage(ctx, page._id) : null
    if (!shop) return null
    const row = await ctx.db.query("commercialThreads").withIndex("by_requester_shop_offer", (q) => q.eq("networkId", ctx.networkId).eq("requesterPersonId", ctx.person._id).eq("shopId", shop._id).eq("offerRef", args.offerRef)).order("desc").first()
    if (!row || row.state === "closed" || row.state === "declined") return null
    const access = await commercialThreadAccess(ctx, ctx.networkId, ctx.person._id, row._id, true)
    return access ? await projectCommercialThread(ctx, access, ctx.person._id) : null
  },
})
const listArgs = { paginationOpts: paginationOptsValidator, query: v.optional(v.string()) }
function searchQuery(value: string | undefined): string {
  const query = value?.normalize("NFC").trim().toLocaleLowerCase() ?? ""
  if (query.length > 120) return fail("invalidArgument", { field: "query" })
  return query
}
async function projectWindow(ctx: QueryCtx, networkId: Id<"networks">, personId: Id<"persons">, window: PaginationResult<Doc<"commercialThreads">>, query: string): Promise<PaginationResult<CommercialThreadDto>> {
  const shared = withCommercialEligibility(ctx)
  const page: CommercialThreadDto[] = []
  for (const row of window.page) {
    const access = await commercialThreadAccess(shared, networkId, personId, row._id, true)
    if (!access) continue
    const dto = await projectCommercialThread(shared, access, personId)
    if (!query || [dto.shop.name, dto.shop.handle, dto.offer?.title, dto.requester.displayName, dto.requester.handle].some((part) => part?.toLocaleLowerCase().includes(query))) page.push(dto)
  }
  return { ...window, page }
}
export const paginateMyThreads = networkQuery({
  args: listArgs, returns: paginationResultValidator(commercialThreadValidator),
  handler: async (ctx, args): Promise<PaginationResult<CommercialThreadDto>> => {
    const query = searchQuery(args.query)
    const window = await ctx.db.query("commercialThreads").withIndex("by_network_requester_activity", (q) => q.eq("networkId", ctx.networkId).eq("requesterPersonId", ctx.person._id)).order("desc").paginate({ ...args.paginationOpts, numItems: Math.min(30, Math.max(1, args.paginationOpts.numItems)), maximumRowsRead: 60, maximumBytesRead: 512 * 1024 })
    return await projectWindow(ctx, ctx.networkId, ctx.person._id, window, query)
  },
})
export const paginateShopThreads = networkQuery({
  args: { ...listArgs, shopId: v.id("shops") }, returns: paginationResultValidator(commercialThreadValidator),
  handler: async (ctx, args): Promise<PaginationResult<CommercialThreadDto>> => {
    const shop = await ctx.db.get(args.shopId)
    if (!shop || !await liveMandate(ctx, shop, ctx.person._id, ctx.networkId)) return notFound()
    const query = searchQuery(args.query)
    const window = await ctx.db.query("commercialThreads").withIndex("by_network_shop_activity", (q) => q.eq("networkId", ctx.networkId).eq("shopId", shop._id)).order("desc").paginate({ ...args.paginationOpts, numItems: Math.min(30, Math.max(1, args.paginationOpts.numItems)), maximumRowsRead: 60, maximumBytesRead: 512 * 1024 })
    return await projectWindow(ctx, ctx.networkId, ctx.person._id, window, query)
  },
})
export const decideRequest = networkMutation({
  writeBucket: "commercial.manage", args: { threadId: v.id("commercialThreads"), expectedRevision: v.number(), decision: v.union(v.literal("accept"), v.literal("decline")) }, returns: v.null(),
  handler: async (ctx, args) => {
    const { thread, mandate } = await requireCommercialThread(ctx, ctx.networkId, ctx.person._id, args.threadId)
    if (!mandate?.canDecide) return notFound()
    if (thread.revision !== args.expectedRevision || thread.state !== "requested") return fail("invalidArgument", { field: "expectedRevision" })
    const now = Date.now()
    await ctx.db.patch(thread._id, { state: args.decision === "accept" ? "accepted" : "declined", revision: thread.revision + 1, updatedAt: now, buyerCallsAllowed: false, assignedRespondentPersonId: mandate.canReply ? ctx.person._id : undefined, purgeAt: args.decision === "decline" ? now + COMMERCIAL_RETENTION_MS : undefined })
    await onCommercialActivity(ctx, { threadId: thread._id, actorPersonId: ctx.person._id, kind: args.decision === "accept" ? "accepted" : "declined" })
    return null
  },
})
export const setThreadBlock = networkMutation({
  writeBucket: "commercial.manage", args: { threadId: v.id("commercialThreads"), blocked: v.boolean() }, returns: v.null(),
  handler: async (ctx, args) => {
    const { thread, viewerKind, mandate } = await requireCommercialThread(ctx, ctx.networkId, ctx.person._id, args.threadId, true)
    if (viewerKind === "shop" && !mandate?.canDecide) return notFound()
    const old = await ctx.db.query("commercialBlocks").withIndex("by_pair_side", (q) => q.eq("networkId", ctx.networkId).eq("shopId", thread.shopId).eq("requesterPersonId", thread.requesterPersonId).eq("side", viewerKind)).unique()
    if (args.blocked === (old !== null)) return null
    const now = Date.now()
    if (args.blocked) {
      await ctx.db.insert("commercialBlocks", { networkId: ctx.networkId, threadId: thread._id, shopId: thread.shopId, requesterPersonId: thread.requesterPersonId, personId: ctx.person._id, side: viewerKind, createdAt: now })
      await ctx.db.patch(thread._id, { state: "blocked", ...(thread.state !== "blocked" ? { stateBeforeBlock: thread.state } : {}), revision: thread.revision + 1, updatedAt: now, buyerCallsAllowed: false, purgeAt: now + COMMERCIAL_RETENTION_MS })
      await stopCommercialCalls(ctx, thread._id)
      await ctx.scheduler.runAfter(0, revalidateCommercialCalls, {})
      await onCommercialActivity(ctx, { threadId: thread._id, actorPersonId: ctx.person._id, kind: "blocked" })
    } else {
      await ctx.db.delete(old!._id)
      const origin = await ctx.db.get(old!.threadId)
      const others = await ctx.db.query("commercialBlocks").withIndex("by_thread", (q) => q.eq("threadId", old!.threadId)).take(2)
      if (others.length === 0 && origin) {
        const restored = origin.stateBeforeBlock ?? "closed"
        await ctx.db.patch(origin._id, { state: restored, stateBeforeBlock: undefined, revision: origin.revision + 1, updatedAt: now, buyerCallsAllowed: false, purgeAt: restored === "closed" || restored === "declined" ? now + COMMERCIAL_RETENTION_MS : undefined })
      }
    }
    return null
  },
})
export const close = networkMutation({
  writeBucket: "commercial.manage", args: { threadId: v.id("commercialThreads") }, returns: v.null(),
  handler: async (ctx, args) => {
    const { thread, viewerKind, mandate } = await requireCommercialThread(ctx, ctx.networkId, ctx.person._id, args.threadId)
    if (viewerKind === "shop" && !mandate?.canDecide) return notFound()
    if (thread.state === "closed" || thread.state === "declined") return null
    const now = Date.now()
    await ctx.db.patch(thread._id, { state: "closed", revision: thread.revision + 1, updatedAt: now, buyerCallsAllowed: false, purgeAt: now + COMMERCIAL_RETENTION_MS })
    await stopCommercialCalls(ctx, thread._id)
    await onCommercialActivity(ctx, { threadId: thread._id, actorPersonId: ctx.person._id, kind: "closed" })
    return null
  },
})
export const markRead = networkMutation({
  writeBucket: "commercial.message", args: { threadId: v.id("commercialThreads") }, returns: v.null(),
  handler: async (ctx, args) => {
    await requireCommercialThread(ctx, ctx.networkId, ctx.person._id, args.threadId)
    const old = await readStateOf(ctx, args.threadId, ctx.person._id)
    const now = Date.now()
    if (old) await ctx.db.patch(old._id, { readAt: now, updatedAt: now })
    else await ctx.db.insert("commercialReadStates", { networkId: ctx.networkId, threadId: args.threadId, personId: ctx.person._id, readAt: now, updatedAt: now })
    return null
  },
})
