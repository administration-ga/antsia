/** DG-023 : galerie collective, dépôt atomique et audience actuelle de l'événement. */
import { assertPostContent, assertPostMedia, assertPostVideoDuration } from "@antsia/social-domain/content"
import { isAssociationEventGalleryOpen } from "../diaspora/associationEventRules"
import { paginationOptsValidator } from "convex/server"
import { v } from "convex/values"

import type { Doc } from "../../_generated/dataModel"
import { checked, fail, failAppRule, notFound } from "../../lib/errors"
import { networkMutation, networkQuery } from "../../lib/functions"
import { enforceRateLimit } from "../../lib/rateLimit"
import { assertDiasporaNetwork } from "../diaspora/facts"
import { declaredMediaValidator, verifyDeclaredMedia, type DeclaredMedia } from "../media/media"
import { contentState } from "../moderation/policy"
import { canSeePostDoc } from "../posts/access"
import { markPostRemoved } from "../posts/contentRemoval"
import { enrichment, feedItemValidator, pageViewingReason, toFeedItem, type FeedItem } from "../posts/posts"
import { writePost } from "../posts/postWrite"
import { readableGalleryEvent } from "./pageEventGalleryAccess"

const PAGE_MAX = 50
const PAGE_BYTES = 2 * 1024 * 1024

function requireOpen(event: Doc<"events">): void {
  if (!isAssociationEventGalleryOpen(event, Date.now())) failAppRule("association_event_gallery_not_open")
}

/** Compare le média déclaré au média déjà admis, sans réadmettre son stockage. */
function sameMedia(post: Doc<"posts">, declared: readonly DeclaredMedia[]): boolean {
  const previous = post.media ?? []
  return previous.length === declared.length && previous.every((item, index) => {
    const next = declared[index]
    return next !== undefined && item.storageId === next.storageId && item.kind === next.kind && item.mimeType === next.mimeType && item.sizeBytes === next.sizeBytes &&
      (item.altText ?? "") === (next.altText?.trim() ?? "") && item.width === next.width && item.height === next.height && item.durationMs === next.durationMs
  })
}

export const get = networkQuery({
  // refreshKey ne porte aucune autorité temporelle : seul Date.now serveur tranche.
  args: { eventId: v.id("events"), expectedReaderPersonId: v.id("persons"), refreshKey: v.optional(v.number()) },
  returns: v.union(v.null(), v.object({ eventId: v.id("events"), available: v.boolean(), canPublish: v.boolean(), audience: v.union(v.literal("network"), v.literal("association")) })),
  handler: async (ctx, args) => {
    assertDiasporaNetwork(ctx.network)
    if (ctx.person._id !== args.expectedReaderPersonId) return notFound()
    const found = await readableGalleryEvent(ctx, ctx.networkId, args.eventId, ctx.person._id)
    if (!found) return null
    const available = isAssociationEventGalleryOpen(found.event, Date.now())
    return { eventId: found.event._id, available, canPublish: available && found.canManage, audience: found.event.pageAudience ?? "association" }
  },
})

export const list = networkQuery({
  args: { eventId: v.id("events"), paginationOpts: paginationOptsValidator, expectedReaderPersonId: v.id("persons") },
  returns: v.object({ items: v.array(v.object({ post: feedItemValidator, canRemove: v.boolean() })), continueCursor: v.union(v.string(), v.null()), isDone: v.boolean() }),
  handler: async (ctx, args) => {
    assertDiasporaNetwork(ctx.network)
    if (ctx.person._id !== args.expectedReaderPersonId) return notFound()
    const found = await readableGalleryEvent(ctx, ctx.networkId, args.eventId, ctx.person._id)
    if (!found) return notFound()
    requireOpen(found.event)
    const requested = args.paginationOpts.numItems, bytes = args.paginationOpts.maximumBytesRead
    const numItems = Number.isFinite(requested) ? Math.min(Math.max(Math.trunc(requested), 1), PAGE_MAX) : 20
    const maximumBytesRead = bytes === undefined || !Number.isFinite(bytes) ? PAGE_BYTES : Math.min(Math.max(Math.trunc(bytes), 1), PAGE_BYTES)
    const result = await ctx.db.query("posts")
      .withIndex("by_network_eventGallery_status_publishedAt", (q) => q.eq("networkId", ctx.networkId).eq("pageEventGalleryId", found.event._id).eq("status", "published"))
      .order("desc").paginate({ ...args.paginationOpts, numItems, maximumBytesRead })
    const reader = { personId: ctx.person._id, network: ctx.network }
    let enrich: ReturnType<typeof enrichment> | undefined
    const items: { post: FeedItem; canRemove: boolean }[] = []
    for (const post of result.page) {
      if (!(await canSeePostDoc(ctx, reader, post))) continue
      // FeedItem n'annonce pas un état pending comme s'il était publié.
      if ((await contentState(ctx, "post", post._id))?.status !== "published") continue
      enrich ??= enrichment(ctx)
      items.push({ post: await toFeedItem(ctx, post, reader, await pageViewingReason(ctx, reader, found.page._id), enrich), canRemove: found.canManage })
    }
    return { items, continueCursor: result.isDone ? null : result.continueCursor, isDone: result.isDone }
  },
})

export const publish = networkMutation({
  args: { eventId: v.id("events"), body: v.string(), media: v.array(declaredMediaValidator), idempotencyKey: v.string() },
  returns: v.object({ postId: v.id("posts"), created: v.boolean() }),
  handler: async (ctx, args) => {
    assertDiasporaNetwork(ctx.network)
    await enforceRateLimit(ctx, "page.publish", ctx.person._id)
    const found = await readableGalleryEvent(ctx, ctx.networkId, args.eventId, ctx.person._id)
    if (!found?.canManage) return notFound()
    requireOpen(found.event)
    const key = args.idempotencyKey.trim()
    if (key.length === 0 || key.length > 128) return fail("invalidArgument", { field: "idempotencyKey" })
    if (args.media.length === 0) return failAppRule("association_event_gallery_media_required")
    // Juger la forme et le texte AVANT toute consommation d'un dépôt neuf.
    checked(() => assertPostMedia(args.media))
    // SD-03 : la durée DÉCLARÉE d'une vidéo, même borne qu'une publication.
    checked(() => assertPostVideoDuration(args.media))
    const body = checked(() => assertPostContent({ body: args.body, mediaCount: args.media.length, isShare: false }))
    const existing = await ctx.db.query("posts")
      .withIndex("by_network_eventGallery_key", (q) => q.eq("networkId", ctx.networkId).eq("pageEventGalleryId", found.event._id).eq("idempotencyKey", key)).unique()
    if (existing) {
      if (existing.pageId !== found.page._id) return notFound()
      if (existing.body !== body || !sameMedia(existing, args.media)) return fail("conflict")
      return { postId: existing._id, created: false }
    }
    const media = await verifyDeclaredMedia(ctx, { actorPersonId: ctx.person._id, networkId: ctx.networkId, usage: "media_social", source: "post_media", declared: args.media })
    checked(() => assertPostMedia(media))
    const { postId } = await writePost(ctx, {
      network: ctx.network, authorPersonId: ctx.person._id, pageId: found.page._id, pageEventGalleryId: found.event._id,
      body, media, audience: "public", visibility: "network", reach: "diaspora", idempotencyKey: key,
    })
    return { postId, created: true }
  },
})

export const remove = networkMutation({
  args: { eventId: v.id("events"), postId: v.id("posts") }, returns: v.null(),
  handler: async (ctx, args) => {
    assertDiasporaNetwork(ctx.network)
    await enforceRateLimit(ctx, "page.manage", ctx.person._id)
    const found = await readableGalleryEvent(ctx, ctx.networkId, args.eventId, ctx.person._id, { allowCancelled: true })
    if (!found?.canManage) return notFound()
    const post = await ctx.db.get(args.postId)
    if (!post || post.networkId !== ctx.networkId || post.pageId !== found.page._id || post.pageEventGalleryId !== found.event._id) return notFound()
    await markPostRemoved(ctx, post, Date.now())
    return null
  },
})
