/** MP04 : découverte de boutiques dans tous les résultats admissibles, pas dans une fenêtre client. */
import type { PaginationOptions } from "convex/server"
import type { Doc, Id } from "../../_generated/dataModel"
import type { QueryCtx } from "../../_generated/server"
import { fail } from "../../lib/errors"
import { isStorefrontInReadingContext, servableStorefrontPage, shopOfPage, storefrontPolicyOf } from "./access"
import { sha256Hex } from "./commerceLinkCrypto"
import { MARKETPLACE_BYTES_MAX, MARKETPLACE_PAGE_MAX, MARKETPLACE_ROWS_MAX, normalizeMarketplaceQuery } from "./marketplaceRead"
import { storefrontsOpen } from "./rules"
import { cardOf } from "./shops"
import type { StorefrontCard } from "./validators"

export type MarketplaceShopsPage = { page: StorefrontCard[]; isDone: boolean; continueCursor: string; filteredWindow: boolean }
type ReadCtx = Pick<QueryCtx, "db" | "storage">
type Context = { network: Doc<"networks">; readerPersonId: Id<"persons"> }
export type MarketplaceShopsArgs = { query?: string; paginationOpts: PaginationOptions }
function invalidCursor(): never { return fail("invalidArgument", { field: "cursor" }) }
function readCursor(raw: string | null, scope: string): string | null {
  if (raw === null) return null
  if (!raw || raw.length > 8192) return invalidCursor()
  try {
    const row: unknown = JSON.parse(raw)
    if (!row || typeof row !== "object" || Array.isArray(row)) return invalidCursor()
    const value = row as Record<string, unknown>
    if (Object.keys(value).length !== 3 || value.version !== 1 || value.scope !== scope || typeof value.cursor !== "string" || !value.cursor) return invalidCursor()
    return value.cursor
  } catch { return invalidCursor() }
}
function result(window: { page: unknown[]; isDone: boolean; continueCursor: string }, page: StorefrontCard[], scope: string): MarketplaceShopsPage {
  return { page, isDone: window.isDone, continueCursor: window.isDone ? "" : JSON.stringify({ version: 1, scope, cursor: window.continueCursor }), filteredWindow: page.length !== window.page.length || !window.isDone && window.page.length === 0 }
}

export async function searchMarketplaceShops(ctx: ReadCtx, context: Context, args: MarketplaceShopsArgs): Promise<MarketplaceShopsPage> {
  const query = normalizeMarketplaceQuery(args.query)
  if (!Number.isSafeInteger(args.paginationOpts.numItems) || args.paginationOpts.numItems < 1) return fail("invalidArgument", { field: "paginationOpts" })
  const scope = await sha256Hex(JSON.stringify(["marketplace-shops-v1", context.network._id, context.readerPersonId, query ? "pages-search" : "shops-index", query]))
  const cursor = readCursor(args.paginationOpts.cursor, scope)
  if (!storefrontsOpen(await storefrontPolicyOf(ctx, context.network._id))) return { page: [], isDone: true, continueCursor: "", filteredWindow: false }
  const opts = { cursor, numItems: Math.min(args.paginationOpts.numItems, MARKETPLACE_PAGE_MAX), maximumRowsRead: MARKETPLACE_ROWS_MAX, maximumBytesRead: MARKETPLACE_BYTES_MAX }
  const isRoot = context.network.kind === "root"
  try {
    if (query) {
      const window = await ctx.db.query("pages").withSearchIndex("search_name_v1", q => {
        const source = q.search("searchText", query).eq("status", "active")
        return isRoot ? source.eq("onRoot", true) : source.eq("networkId", context.network._id)
      }).filter(q => q.neq(q.field("ownerKind"), "institution")).paginate(opts)
      const page: StorefrontCard[] = []
      for (const candidate of window.page) {
        const shop = await shopOfPage(ctx, candidate._id)
        if (!shop || !await isStorefrontInReadingContext(ctx, shop, context.network)) continue
        const current = await servableStorefrontPage(ctx, shop, context.readerPersonId)
        if (current) page.push(await cardOf(ctx, shop, current))
      }
      return result(window, page, scope)
    }
    const source = isRoot
      ? ctx.db.query("shops").withIndex("by_storefront_publishedAt", q => q.eq("storefront", "published")).order("desc").filter(q => q.or(q.eq(q.field("networkId"), context.network._id), q.eq(q.field("visibility"), "root")))
      : ctx.db.query("shops").withIndex("by_network_storefront_publishedAt", q => q.eq("networkId", context.network._id).eq("storefront", "published")).order("desc")
    const window = await source.paginate(opts)
    const page: StorefrontCard[] = []
    for (const shop of window.page) {
      if (!await isStorefrontInReadingContext(ctx, shop, context.network)) continue
      const current = await servableStorefrontPage(ctx, shop, context.readerPersonId)
      if (current) page.push(await cardOf(ctx, shop, current))
    }
    return result(window, page, scope)
  } catch (error) {
    if (cursor !== null) return invalidCursor()
    throw error
  }
}
