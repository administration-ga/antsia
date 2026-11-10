/** MP03 : découverte membre du catalogue admissible, sous garde de réseau. */
import { paginationOptsValidator } from "convex/server"
import { v } from "convex/values"
import { networkQuery } from "../../lib/functions"
import { catalogOfferValidator, marketplaceFilterArgs } from "./catalogValidators"
import { searchMarketplace, selectDemoMarketplace } from "./marketplaceRead"

export const marketplacePageValidator = v.object({ indexStatus: v.union(v.literal("building"), v.literal("ready")), page: v.array(catalogOfferValidator), isDone: v.boolean(), continueCursor: v.string(), filteredWindow: v.boolean() })
export { marketplaceFilterArgs } from "./catalogValidators"
export const search = networkQuery({
  args: { ...marketplaceFilterArgs, paginationOpts: paginationOptsValidator },
  returns: marketplacePageValidator,
  handler: async (ctx, args) => await searchMarketplace(ctx, { root: ctx.rootNetwork, network: ctx.network, readerPersonId: ctx.person._id }, args),
})

/** Huit offres fictives au plus, séparées du catalogue canonique et sans commande réelle. */
export const demoSelection = networkQuery({
  args: marketplaceFilterArgs, returns: v.array(catalogOfferValidator),
  handler: async (ctx, args) => await selectDemoMarketplace(ctx, { root: ctx.rootNetwork, network: ctx.network, readerPersonId: ctx.person._id }, args),
})
