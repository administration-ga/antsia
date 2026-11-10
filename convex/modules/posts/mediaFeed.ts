/** U04 : découverte média et Clips, lecture bornée et gardée côté serveur. */
import { foldSearchQuery } from "@antsia/social-domain/searchText"
import { paginationOptsValidator } from "convex/server"
import { v } from "convex/values"

import { fail } from "../../lib/errors"
import { networkQuery } from "../../lib/functions"
import { readerMarks } from "../marks/marks"
import { isBlockedBetween } from "../graph/graph"
import { findPublishedPersonByHandle } from "../people/miniProfile"
import { exactFeedHidden, exactFeedMuted, liveFeedReason } from "./feedPolicy"
import { hasNativePostAuthor } from "./nativeAuthor"
import { enrichment, feedItemValidator, readerOf, toFeedItem, type FeedItem } from "./posts"

/**
 * Le curseur natif avance sur une fenêtre brute de 30 lignes au plus : une
 * fenêtre sans vidéo ne signifie pas la fin. Aucun scan pour remplir la page,
 * aucun nouveau champ/index ni média dénormalisé à révoquer.
 */
export const paginate = networkQuery({
  args: {
    kind: v.union(v.literal("video"), v.literal("media")),
    authorHandle: v.optional(v.string()),
    query: v.optional(v.string()),
    // Une souscription neuve après une coupure ne réadopte pas le résultat
    // local d'avant coupure. Ce nonce ne confère aucun droit et n'est stocké.
    revalidationToken: v.optional(v.string()),
    paginationOpts: paginationOptsValidator,
  },
  returns: v.object({ page: v.array(feedItemValidator), isDone: v.boolean(), continueCursor: v.string() }),
  handler: async (ctx, args) => {
    if ((args.query?.length ?? 0) > 80 || (args.authorHandle?.length ?? 0) > 80 || (args.revalidationToken?.length ?? 0) > 128) return fail("invalidArgument")
    const query = foldSearchQuery(args.query ?? "")
    const reader = readerOf(ctx)
    const author = args.authorHandle === undefined ? null : await findPublishedPersonByHandle(ctx, ctx.networkId, args.authorHandle)
    if (args.authorHandle !== undefined && author === null) return { page: [], isDone: true, continueCursor: "" }
    if (author !== null && author._id !== reader.personId && await isBlockedBetween(ctx, reader.personId, author._id)) return { page: [], isDone: true, continueCursor: "" }
    const options = { ...args.paginationOpts, numItems: Math.min(30, Math.max(1, Math.trunc(args.paginationOpts.numItems))), maximumRowsRead: 30, maximumBytesRead: 1_048_576 }
    const rows = author !== null
      ? ctx.network.kind === "root"
        ? ctx.db.query("posts").withIndex("by_root_author_status_publishedAt", q => q.eq("onRoot", true).eq("authorPersonId", author._id).eq("status", "published"))
        : ctx.db.query("posts").withIndex("by_network_author_status_publishedAt", q => q.eq("networkId", ctx.networkId).eq("authorPersonId", author._id).eq("status", "published"))
      : ctx.network.kind === "root"
        ? ctx.db.query("posts").withIndex("by_root_status_publishedAt", q => q.eq("onRoot", true).eq("status", "published"))
        : ctx.db.query("posts").withIndex("by_network_status_publishedAt", q => q.eq("networkId", ctx.networkId).eq("status", "published"))
    const result = await rows.order("desc").paginate(options)
    const enrich = enrichment(ctx, await readerMarks(ctx, ctx.networkId, reader.personId))
    const page: FeedItem[] = []
    for (const post of result.page) {
      if (!(post.media ?? []).some(media => args.kind === "media" || media.kind === "video")) continue
      if (author !== null && (post.pageId !== undefined || post.audience === "group")) continue
      if (query && !foldSearchQuery(post.searchText).includes(query)) continue
      const reason = await liveFeedReason(ctx, reader, post, "recents")
      if (reason === null || await exactFeedHidden(ctx, ctx.networkId, reader.personId, post._id)) continue
      if (post.pageId === undefined && hasNativePostAuthor(post) && await exactFeedMuted(ctx, ctx.networkId, reader.personId, post.authorPersonId)) continue
      const item = await toFeedItem(ctx, post, reader, reason, enrich)
      // La garde de délivrance a le dernier mot ; un média retenu n'a pas de
      // vignette ou de lecture de secours, même si son type brut est vidéo.
      if (!item.media.some(media => media.url !== null && media.withheld === null && (args.kind === "media" || media.kind === "video"))) continue
      page.push(item)
    }
    return { page, isDone: result.isDone, continueCursor: result.continueCursor }
  },
})
