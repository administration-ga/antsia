/** P09 : SSR catalogue sous projection publique explicite, sans repli de session. */
import { paginationOptsValidator } from "convex/server"
import { v } from "convex/values"

import { query } from "../../_generated/server"
import { catalogOfferByHandle, listCatalog, resolvePostOffer } from "../shops/catalogRead"
import { catalogFilterArgs, catalogListValidator, catalogOfferValidator } from "../shops/catalogValidators"
import { publicContext, publicPostEligible } from "./access"

/** @publicProjection DTO de vitrine/catégories et copies média admises, aucun privilège de membre. */
export const list = query({
  args: { networkId: v.id("networks"), handle: v.string(), ...catalogFilterArgs, paginationOpts: paginationOptsValidator }, returns: catalogListValidator,
  handler: async (ctx, args) => {
    const context = await publicContext(ctx, args.networkId)
    return await listCatalog(ctx, { root: context.root, readerPersonId: context.reader?.personId }, args)
  },
})
/** @publicProjection Source, parent, lien, gérants, consentement et modération relus pour la fiche. */
export const offer = query({
  args: { networkId: v.id("networks"), handle: v.string(), offerRef: v.string() }, returns: v.union(catalogOfferValidator, v.null()),
  handler: async (ctx, args) => {
    const context = await publicContext(ctx, args.networkId)
    return await catalogOfferByHandle(ctx, { root: context.root, readerPersonId: context.reader?.personId }, args.handle, args.offerRef)
  },
})
/** @publicProjection La publication doit déjà être éligible à la lecture sans compte. */
export const postOffer = query({
  args: { networkId: v.id("networks"), postId: v.string() }, returns: v.union(catalogOfferValidator, v.null()),
  handler: async (ctx, args) => {
    const context = await publicContext(ctx, args.networkId)
    const postId = ctx.db.normalizeId("posts", args.postId)
    const post = postId ? await ctx.db.get(postId) : null
    if (!post || !await publicPostEligible(ctx, context, post)) return null
    return await resolvePostOffer(ctx, post, { root: context.root, readerPersonId: context.reader?.personId })
  },
})
