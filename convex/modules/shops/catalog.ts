/** P09 : catalogue membre, même DTO public et mêmes consentements, jamais un aperçu gérant. */
import { effectiveActivityConfiguration } from "@antsia/social-domain/activityConfiguration"
import { paginationOptsValidator } from "convex/server"
import { v } from "convex/values"

import { networkQuery } from "../../lib/functions"
import { canSeePostDoc } from "../posts/access"
import { catalogOfferByHandle, listCatalog, resolvePostOffer } from "./catalogRead"
import { catalogFilterArgs, catalogListValidator, catalogOfferValidator } from "./catalogValidators"
import { activityTemplateValidator } from "./validators"

/** L'offre attachée à une publication, avec le gabarit de sa boutique : une adresse `food` y dit « Commander ». */
const postOfferValidator = v.object({ ...catalogOfferValidator.fields, shopTemplate: activityTemplateValidator })

export const list = networkQuery({
  args: { handle: v.string(), ...catalogFilterArgs, paginationOpts: paginationOptsValidator }, returns: catalogListValidator,
  handler: async (ctx, args) => await listCatalog(ctx, { root: ctx.rootNetwork, readerPersonId: ctx.person._id, network: ctx.network }, args),
})
export const offer = networkQuery({
  args: { handle: v.string(), offerRef: v.string() }, returns: v.union(catalogOfferValidator, v.null()),
  handler: async (ctx, args) => await catalogOfferByHandle(ctx, { root: ctx.rootNetwork, readerPersonId: ctx.person._id, network: ctx.network }, args.handle, args.offerRef),
})
export const postOffer = networkQuery({
  args: { postId: v.id("posts") }, returns: v.union(postOfferValidator, v.null()),
  handler: async (ctx, args) => {
    const post = await ctx.db.get(args.postId)
    if (!post || !await canSeePostDoc(ctx, { network: ctx.network, personId: ctx.person._id }, post)) return null
    const offer = await resolvePostOffer(ctx, post, { root: ctx.rootNetwork, readerPersonId: ctx.person._id, network: ctx.network })
    const shop = offer && post.commerceOffer ? await ctx.db.get(post.commerceOffer.shopId) : null
    return offer && shop ? { ...offer, shopTemplate: effectiveActivityConfiguration(shop.activityConfiguration, shop.model).template } : null
  },
})
