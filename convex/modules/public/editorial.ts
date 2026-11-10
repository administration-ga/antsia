/** MP13 : lecture éditoriale consentie, distincte de la porte des pages officielles. */
import { paginationOptsValidator } from "convex/server"
import { v } from "convex/values"
import { query } from "../../_generated/server"
import { readPublicArticle, readPublicMedia } from "../editorial/read"
import { editorialPublishedArticleValidator, editorialPublishedMediaValidator } from "../editorial/validators"
import { publicContext } from "./access"

/** @publicProjection Version publiée courante et consentements relus ; aucun brouillon ou habilitation. */
export const media = query({
  args: { networkId: v.id("networks"), handle: v.string(), paginationOpts: paginationOptsValidator, section: v.optional(v.string()) },
  returns: v.union(editorialPublishedMediaValidator, v.null()),
  handler: async (ctx, args) => {
    const context = await publicContext(ctx, args.networkId)
    return readPublicMedia(ctx, { root: context.root, readerPersonId: context.reader?.personId }, args.handle, args.paginationOpts, args.section)
  },
})

/** @publicProjection Corps structuré uniquement, avec délivrance gardée des illustrations. */
export const article = query({
  args: { networkId: v.id("networks"), handle: v.string(), articleKey: v.string() },
  returns: v.union(editorialPublishedArticleValidator, v.null()),
  handler: async (ctx, args) => {
    const context = await publicContext(ctx, args.networkId)
    return readPublicArticle(ctx, { root: context.root, readerPersonId: context.reader?.personId }, args.handle, args.articleKey)
  },
})
