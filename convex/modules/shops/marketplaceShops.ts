/** MP04 : annuaire recherché, sous garde d'adhésion et relecture des vitrines. */
import { paginationOptsValidator } from "convex/server"
import { v } from "convex/values"
import { networkQuery } from "../../lib/functions"
import { searchMarketplaceShops } from "./marketplaceShopsRead"
import { storefrontCardValidator } from "./validators"

export const marketplaceShopsPageValidator = v.object({ page: v.array(storefrontCardValidator), isDone: v.boolean(), continueCursor: v.string(), filteredWindow: v.boolean() })
export const search = networkQuery({
  args: { query: v.optional(v.string()), paginationOpts: paginationOptsValidator }, returns: marketplaceShopsPageValidator,
  handler: async (ctx, args) => await searchMarketplaceShops(ctx, { network: ctx.network, readerPersonId: ctx.person._id }, args),
})
