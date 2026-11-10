/** MP03 : filtres avant pagination, puis droits/projections actuels pour chaque candidat. */
import type { OrderedQuery, PaginationOptions } from "convex/server"
import type { DataModel, Doc } from "../../_generated/dataModel"
import { fail } from "../../lib/errors"
import { sha256Hex } from "./commerceLinkCrypto"
import { projectCatalogHead, type CatalogReadContext, type CatalogReadCtx } from "./catalogRead"
import type { CatalogOffer } from "./catalogValidators"
import { MARKETPLACE_DISCOVERY_VERSION, normalizeMarketplaceText } from "./marketplaceIndexFields"
import { demoMarketplaceOffers } from "./demoCatalog"
import { applyServiceDiscoveryFilters, serviceDiscoveryOfferMatches, marketplaceFiltersOf, type MarketplaceFilters, type NormalizedMarketplaceFilters } from "./catalogSearchRules"
export { MARKETPLACE_SORTS, MARKETPLACE_FACET_VALUES_MAX, marketplaceFiltersOf, normalizeMarketplaceQuery } from "./catalogSearchRules"
export type { MarketplaceSort, MarketplaceFacetSelection, MarketplaceFilters, NormalizedMarketplaceFilters } from "./catalogSearchRules"
type NormalizedFilters = NormalizedMarketplaceFilters
function invalid(field: string): never { return fail("invalidArgument", { field }) }

export const MARKETPLACE_PAGE_MAX = 24
export const MARKETPLACE_ROWS_MAX = 128
export const MARKETPLACE_BYTES_MAX = 1024 * 1024
export type MarketplaceSearchArgs = MarketplaceFilters & { paginationOpts: PaginationOptions }
export type MarketplacePage = { indexStatus: "building" | "ready"; page: CatalogOffer[]; isDone: boolean; continueCursor: string; filteredWindow: boolean }
type HeadQuery = OrderedQuery<DataModel["commerceCatalogHeads"]>


function candidates(ctx: CatalogReadCtx, context: CatalogReadContext, filters: NormalizedFilters): HeadQuery {
  let query: HeadQuery
  if (filters.query) query = ctx.db.query("commerceCatalogHeads").withSearchIndex("search_marketplace", q => {
    let source = q.search("searchText", filters.query).eq("objectKind", "offer").eq("sequence", "catalog").eq("state", "active").eq("discoveryVersion", MARKETPLACE_DISCOVERY_VERSION)
    if (filters.kind) source = source.eq("kind", filters.kind)
    if (context.network && context.network.kind !== "root") source = source.eq("networkId", context.network._id)
    return source
  })
  else {
    if (filters.kind) {
      const index = filters.sort === "price_asc" ? "by_marketplace_kind_price_asc" : filters.sort === "price_desc" ? "by_marketplace_kind_price_desc" : "by_marketplace_kind_newest"
      query = ctx.db.query("commerceCatalogHeads").withIndex(index, q => q.eq("objectKind", "offer").eq("sequence", "catalog").eq("state", "active").eq("discoveryVersion", MARKETPLACE_DISCOVERY_VERSION).eq("kind", filters.kind!)).order(filters.sort === "newest" ? "desc" : "asc")
    } else {
      const index = filters.sort === "price_asc" ? "by_marketplace_price_asc" : filters.sort === "price_desc" ? "by_marketplace_price_desc" : "by_marketplace_newest"
      query = ctx.db.query("commerceCatalogHeads").withIndex(index, q => q.eq("objectKind", "offer").eq("sequence", "catalog").eq("state", "active").eq("discoveryVersion", MARKETPLACE_DISCOVERY_VERSION)).order(filters.sort === "newest" ? "desc" : "asc")
    }
  }
  if (context.network && context.network.kind !== "root") query = query.filter(q => q.eq(q.field("networkId"), context.network!._id))
  if (filters.kind) query = query.filter(q => q.eq(q.field("kind"), filters.kind!))
  if (filters.category) query = query.filter(q => q.or(...filters.category!.flatMap(category => [q.eq(q.field("category1"), category), q.eq(q.field("category2"), category), q.eq(q.field("category3"), category)])))
  for (const key of ["brand", "material", "color", "audience", "serviceMode"] as const) {
    const values = filters[key]
    if (values) query = query.filter(q => q.or(...values.map(value => q.eq(q.field(key), value))))
  }
  if (filters.minPrice !== undefined) query = query.filter(q => q.and(q.neq(q.field("maxPrice"), undefined), q.gte(q.field("maxPrice"), filters.minPrice!)))
  if (filters.maxPrice !== undefined) query = query.filter(q => q.and(q.neq(q.field("minPrice"), undefined), q.lte(q.field("minPrice"), filters.maxPrice!)))
  return applyServiceDiscoveryFilters(query, filters)
}

function rawCursor(value: string | null, generation: number, scope: string): string | null {
  if (value === null) return null
  if (!value || value.length > 8192) return invalid("cursor")
  try {
    const row: unknown = JSON.parse(value)
    if (!row || typeof row !== "object" || Array.isArray(row)) return invalid("cursor")
    const data = row as Record<string, unknown>
    if (Object.keys(data).length !== 4 || data.version !== 1 || data.generation !== generation || data.scope !== scope || typeof data.cursor !== "string" || !data.cursor) return invalid("cursor")
    return data.cursor
  } catch { return invalid("cursor") }
}

export async function searchMarketplace(ctx: CatalogReadCtx, context: CatalogReadContext, args: MarketplaceSearchArgs, admission?: { scope: string; admit: (head: Doc<"commerceCatalogHeads">) => Promise<boolean> }): Promise<MarketplacePage> {
  const filters = marketplaceFiltersOf(args)
  if (!Number.isSafeInteger(args.paginationOpts.numItems) || args.paginationOpts.numItems < 1) return invalid("paginationOpts")
  const index = await ctx.db.query("commerceCatalogIndexes").withIndex("by_network", q => q.eq("networkId", context.root._id)).unique()
  if (index?.status !== "ready" || index.version !== MARKETPLACE_DISCOVERY_VERSION) return { indexStatus: "building", page: [], isDone: true, continueCursor: "", filteredWindow: false }
  const scope = await sha256Hex(JSON.stringify(["marketplace-v2", MARKETPLACE_DISCOVERY_VERSION, context.root._id, context.network?._id ?? context.root._id, context.readerPersonId ?? null, admission?.scope ?? "marketplace", filters]))
  const cursor = rawCursor(args.paginationOpts.cursor, index.generation, scope)
  let window: { page: Doc<"commerceCatalogHeads">[]; isDone: boolean; continueCursor: string }
  try {
    window = await candidates(ctx, context, filters).paginate({ cursor, numItems: Math.min(args.paginationOpts.numItems, MARKETPLACE_PAGE_MAX), maximumRowsRead: MARKETPLACE_ROWS_MAX, maximumBytesRead: MARKETPLACE_BYTES_MAX })
  } catch (error) {
    if (cursor !== null) return invalid("cursor")
    throw error
  }
  const page: CatalogOffer[] = []
  for (const head of window.page) {
    if (admission && !await admission.admit(head)) continue
    const offer = await projectCatalogHead(ctx, context, head)
    if (offer) page.push(offer)
  }
  return { indexStatus: "ready", page, isDone: window.isDone, continueCursor: window.isDone ? "" : JSON.stringify({ version: 1, generation: index.generation, scope, cursor: window.continueCursor }), filteredWindow: page.length !== window.page.length || !window.isDone && window.page.length === 0 }
}

/** La sélection fictive reste une réponse distincte : jamais une génération d'index réelle. */
export async function selectDemoMarketplace(ctx: CatalogReadCtx, context: CatalogReadContext, args: MarketplaceFilters): Promise<CatalogOffer[]> {
  const filters = marketplaceFiltersOf(args)
  const selected = (await demoMarketplaceOffers(ctx, context)).filter(offer => {
    if (filters.kind && offer.kind !== filters.kind || !serviceDiscoveryOfferMatches(offer, filters)) return false
    if (filters.query) {
      const text = normalizeMarketplaceText([offer.title, offer.description, ...offer.tags].join(" "))
      if (!filters.query.split(/[^\p{L}\p{N}]+/u).filter(Boolean).some(term => text.includes(term))) return false
    }
    if (filters.category && !filters.category.some(category => offer.facets?.categoryPath.includes(category))) return false
    for (const key of ["brand", "material", "color", "audience", "serviceMode"] as const) {
      const values: readonly string[] | undefined = filters[key]
      if (values && !offer.facets?.attributes.some(attribute => attribute.key === key && typeof attribute.value === "string" && values.includes(normalizeMarketplaceText(attribute.value)))) return false
    }
    if (filters.minPrice !== undefined || filters.maxPrice !== undefined) {
      if (offer.price.mode === "quote") return false
      const low = offer.price.mode === "range" ? offer.price.minAmount : offer.price.amount
      const high = offer.price.mode === "range" ? offer.price.maxAmount : offer.price.amount
      if (filters.minPrice !== undefined && high < filters.minPrice || filters.maxPrice !== undefined && low > filters.maxPrice) return false
    }
    return true
  })
  if (filters.sort === "price_asc" || filters.sort === "price_desc") selected.sort((a, b) => {
    if (a.price.mode === "quote") return b.price.mode === "quote" ? a.offerRef.localeCompare(b.offerRef) : 1
    if (b.price.mode === "quote") return -1
    const lowA = a.price.mode === "range" ? a.price.minAmount : a.price.amount
    const lowB = b.price.mode === "range" ? b.price.minAmount : b.price.amount
    const highA = a.price.mode === "range" ? a.price.maxAmount : a.price.amount
    const highB = b.price.mode === "range" ? b.price.maxAmount : b.price.amount
    return (filters.sort === "price_asc" ? lowA - lowB : highB - highA) || a.offerRef.localeCompare(b.offerRef)
  })
  else if (filters.sort === "newest") selected.sort((a, b) => b.changedAt - a.changedAt || a.offerRef.localeCompare(b.offerRef))
  return selected
}
