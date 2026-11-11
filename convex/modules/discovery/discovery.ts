/** PA8 : portée Nationale, province et mot-dièse, même garde et carte que le fil membre. */
import { PROVINCE_SLUGS } from "@antsia/social-domain/provinces"
import { paginationOptsValidator } from "convex/server"
import { v } from "convex/values"

import { notFound } from "../../lib/errors"
import { networkQuery } from "../../lib/functions"
import { literals } from "../../lib/validators"
import { readerMarks } from "../marks/marks"
import { judicialDelistReader } from "../moderation/judicialHolds"
import { canSeePostDoc } from "../posts/access"
import { hasNativePostAuthor } from "../posts/nativeAuthor"
import { enrichment, feedItemValidator, readerOf, toFeedItem, type FeedItem } from "../posts/posts"

/** National contient uniquement l'audience publique, native ou explicitement venue d'un enfant. */
export const rootFeed = networkQuery({
  args: { paginationOpts: paginationOptsValidator, province: v.optional(literals(PROVINCE_SLUGS)), tag: v.optional(v.string()) },
  returns: v.object({ page: v.array(feedItemValidator), isDone: v.boolean(), continueCursor: v.string() }),
  handler: async (ctx, args) => {
    if (ctx.network.kind !== "root") return notFound()
    const options = { ...args.paginationOpts, numItems: Math.min(30, Math.max(1, Math.trunc(args.paginationOpts.numItems))), maximumRowsRead: 30, maximumBytesRead: 1_048_576 }
    const result = args.province === undefined
      ? await ctx.db.query("posts").withIndex("by_root_status_publishedAt", (q) => q.eq("onRoot", true).eq("status", "published")).order("desc").paginate(options)
      : await ctx.db.query("posts").withIndex("by_root_province_status_publishedAt", (q) => q.eq("onRoot", true).eq("province", args.province).eq("status", "published")).order("desc").paginate(options)
    const reader = readerOf(ctx)
    const tag = args.tag?.trim().toLowerCase()
    const enriched = enrichment(ctx, await readerMarks(ctx, ctx.networkId, ctx.person._id))
    // SU01h : une publication déréférencée sur ordre du juge sort de Découvrir, sans être supprimée.
    const delisted = await judicialDelistReader(ctx)
    const page: FeedItem[] = []
    for (const post of result.page) {
      if (post.audience !== "public" || tag && !(post.tags ?? []).includes(tag) || await delisted("post", post._id) || !await canSeePostDoc(ctx, reader, post)) continue
      const hidden = await ctx.db.query("postMarks").withIndex("by_network_person_kind_post", (q) => q.eq("networkId", ctx.networkId).eq("personId", ctx.person._id).eq("kind", "hidden").eq("postId", post._id)).unique()
      if (hidden) continue
      if (post.pageId === undefined) {
        if (!hasNativePostAuthor(post)) continue
        const muted = await ctx.db.query("mutes").withIndex("by_network_person_muted", (q) => q.eq("networkId", ctx.networkId).eq("personId", ctx.person._id).eq("mutedPersonId", post.authorPersonId)).unique()
        if (muted) continue
      }
      page.push(await toFeedItem(ctx, post, reader, post.pageId === undefined && post.authorPersonId === ctx.person._id ? "own" : "public", enriched))
    }
    return { page, isDone: result.isDone, continueCursor: result.continueCursor }
  },
})
