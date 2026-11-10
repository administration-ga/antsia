/** MP05 : règles de recherche pures communes, sans dépendance de projection. */
import { COMMERCE_CATALOG_CATEGORIES } from "@antsia/social-domain/commerce/catalogFacets"
import { COMMERCE_SERVICE_COMMERCIAL_MODES, commerceServiceZoneKey, normalizeCommerceServiceLanguageCode, type CommerceServiceCommercialMode } from "@antsia/social-domain/commerce/serviceProfile"
import type { OrderedQuery } from "convex/server"
import type { DataModel } from "../../_generated/dataModel"
import type { CatalogOffer } from "./catalogValidators"
import { COMMERCE_MAX_AMOUNT_XAF } from "@antsia/social-domain/commerce/primitives"
import { fail } from "../../lib/errors"
import { normalizeMarketplaceText } from "./marketplaceIndexFields"

export const MARKETPLACE_SORTS = ["newest", "price_asc", "price_desc", "relevance"] as const
export type MarketplaceSort = typeof MARKETPLACE_SORTS[number]
export const MARKETPLACE_FACET_VALUES_MAX = 6
export type MarketplaceFacetSelection<T extends string = string> = T | T[]
export type ServiceDiscoveryFilters = {
  commercialMode?: MarketplaceFacetSelection<CommerceServiceCommercialMode>; languageCode?: MarketplaceFacetSelection; serviceZone?: MarketplaceFacetSelection
  minDurationMinutes?: number; maxDurationMinutes?: number
}
export type NormalizedServiceDiscoveryFilters = {
  commercialMode?: CommerceServiceCommercialMode[]; languageCode?: string[]; serviceZone?: string[]; minDurationMinutes?: number; maxDurationMinutes?: number
}
export type MarketplaceFilters = ServiceDiscoveryFilters & {
  query?: string; kind?: "product" | "service"; category?: MarketplaceFacetSelection
  brand?: MarketplaceFacetSelection; material?: MarketplaceFacetSelection; color?: MarketplaceFacetSelection; audience?: MarketplaceFacetSelection<"women" | "men" | "kids" | "unisex">
  serviceMode?: MarketplaceFacetSelection<"onsite" | "remote" | "hybrid">; minPrice?: number; maxPrice?: number; sort?: MarketplaceSort
}

export type NormalizedMarketplaceFilters = NormalizedServiceDiscoveryFilters & { query: string; sort: MarketplaceSort; kind?: "product" | "service"; category?: string[]; brand?: string[]; material?: string[]; color?: string[]; audience?: Array<"women" | "men" | "kids" | "unisex">; serviceMode?: Array<"onsite" | "remote" | "hybrid">; minPrice?: number; maxPrice?: number }
type NormalizedFilters = NormalizedMarketplaceFilters
function invalid(field: string): never { return fail("invalidArgument", { field }) }
export function normalizeMarketplaceQuery(value?: string): string {
  const query = normalizeMarketplaceText(value ?? "")
  const terms = query.split(/[^\p{L}\p{N}]+/u).filter(Boolean)
  if ((value?.length ?? 0) > 120 || /[\p{Cc}]/u.test(value ?? "") || terms.length > 16 || query && terms.length === 0) return invalid("query")
  return query
}
function facetValues<T extends string>(value: MarketplaceFacetSelection<T> | undefined, field: string, allowed?: readonly T[]): T[] | undefined {
  if (value === undefined) return undefined
  const values = typeof value === "string" ? [value] : value
  if (!Array.isArray(values) || values.length === 0 || values.length > MARKETPLACE_FACET_VALUES_MAX) return invalid(field)
  const normalized = values.map(item => {
    if (typeof item !== "string" || item.length === 0 || item.length > 80 || /[\p{Cc}]/u.test(item)) return invalid(field)
    const entry = normalizeMarketplaceText(item) as T
    if (!entry || allowed && !allowed.includes(entry)) return invalid(field)
    return entry
  })
  return [...new Set(normalized)].sort()
}
/** Un scalaire historique et une liste d'un élément ont la même signature de recherche. */
export function marketplaceFiltersOf(args: MarketplaceFilters): NormalizedFilters {
  const query = normalizeMarketplaceQuery(args.query)
  const sort = args.sort ?? (query ? "relevance" : "newest")
  if (!MARKETPLACE_SORTS.includes(sort) || query && sort !== "relevance" || !query && sort === "relevance") return invalid("sort")
  if (args.kind !== undefined && args.kind !== "product" && args.kind !== "service") return invalid("kind")
  const categories = facetValues(args.category, "category")
  for (const value of categories ?? []) {
    const category = COMMERCE_CATALOG_CATEGORIES.find(item => item.key === value)
    if (!category || args.kind && category.kind !== args.kind) return invalid("category")
  }
  const audience = facetValues(args.audience, "audience", ["women", "men", "kids", "unisex"])
  const serviceMode = facetValues(args.serviceMode, "serviceMode", ["onsite", "remote", "hybrid"])
  const textFields: Pick<NormalizedFilters, "brand" | "material" | "color"> = {}
  for (const key of ["brand", "material", "color"] as const) {
    const value = facetValues(args[key], key)
    if (value) textFields[key] = value
  }
  for (const key of ["minPrice", "maxPrice"] as const) if (args[key] !== undefined && (!Number.isSafeInteger(args[key]) || args[key]! < 0 || args[key]! > COMMERCE_MAX_AMOUNT_XAF)) return invalid(key)
  if (args.minPrice !== undefined && args.maxPrice !== undefined && args.minPrice > args.maxPrice) return invalid("price")
  return { ...serviceDiscoveryFiltersOf(args), query, sort, ...(args.kind ? { kind: args.kind } : {}), ...(categories ? { category: categories } : {}), ...textFields, ...(audience ? { audience } : {}), ...(serviceMode ? { serviceMode } : {}), ...(args.minPrice !== undefined ? { minPrice: args.minPrice } : {}), ...(args.maxPrice !== undefined ? { maxPrice: args.maxPrice } : {}) }
}



function serviceValues(value: MarketplaceFacetSelection | undefined, field: string, normalize: (entry: string) => string | null, maxLength = 120): string[] | undefined {
  if (value === undefined) return undefined
  const values = typeof value === "string" ? [value] : value
  if (!Array.isArray(values) || !values.length || values.length > MARKETPLACE_FACET_VALUES_MAX) return invalid(field)
  const normalized = values.map(entry => {
    if (typeof entry !== "string" || entry.length > maxLength || /[\p{Cc}\uD800-\uDFFF]/u.test(entry)) return invalid(field)
    return normalize(entry) ?? invalid(field)
  })
  return [...new Set(normalized)].sort()
}
export function serviceDiscoveryFiltersOf(args: ServiceDiscoveryFilters): NormalizedServiceDiscoveryFilters {
  const modes = serviceValues(args.commercialMode, "commercialMode", value => COMMERCE_SERVICE_COMMERCIAL_MODES.find(mode => mode === value) ?? null)
  const commercialMode = modes?.filter((mode): mode is CommerceServiceCommercialMode => COMMERCE_SERVICE_COMMERCIAL_MODES.some(value => value === mode))
  const languageCode = serviceValues(args.languageCode, "languageCode", normalizeCommerceServiceLanguageCode, 35)
  const serviceZone = serviceValues(args.serviceZone, "serviceZone", commerceServiceZoneKey)
  for (const key of ["minDurationMinutes", "maxDurationMinutes"] as const) if (args[key] !== undefined && (!Number.isSafeInteger(args[key]) || args[key]! < 1 || args[key]! > 43_200)) return invalid(key)
  if (args.minDurationMinutes !== undefined && args.maxDurationMinutes !== undefined && args.minDurationMinutes > args.maxDurationMinutes) return invalid("durationMinutes")
  return { ...(commercialMode ? { commercialMode } : {}), ...(languageCode ? { languageCode } : {}), ...(serviceZone ? { serviceZone } : {}), ...(args.minDurationMinutes !== undefined ? { minDurationMinutes: args.minDurationMinutes } : {}), ...(args.maxDurationMinutes !== undefined ? { maxDurationMinutes: args.maxDurationMinutes } : {}) }
}

/** Tous ces prédicats précèdent paginate ; aucun champ historique ne remplit une donnée absente. */
export function applyServiceDiscoveryFilters(source: OrderedQuery<DataModel["commerceCatalogHeads"]>, filters: NormalizedServiceDiscoveryFilters): OrderedQuery<DataModel["commerceCatalogHeads"]> {
  const modes = { quote: "commercialQuote", booking: "commercialBooking", fixed_order: "commercialFixedOrder" } as const
  if (filters.commercialMode) source = source.filter(q => q.or(...filters.commercialMode!.map(mode => q.eq(q.field(modes[mode]), true))))
  if (filters.languageCode) source = source.filter(q => q.or(...filters.languageCode!.flatMap(code => (["language1", "language2", "language3", "language4", "language5", "language6"] as const).map(key => q.eq(q.field(key), code)))))
  if (filters.serviceZone) source = source.filter(q => q.or(...filters.serviceZone!.flatMap(zone => (["serviceZone1", "serviceZone2", "serviceZone3", "serviceZone4", "serviceZone5", "serviceZone6", "serviceZone7", "serviceZone8"] as const).map(key => q.eq(q.field(key), zone)))))
  if (filters.minDurationMinutes !== undefined) source = source.filter(q => q.and(q.neq(q.field("durationMinutes"), undefined), q.gte(q.field("durationMinutes"), filters.minDurationMinutes!)))
  if (filters.maxDurationMinutes !== undefined) source = source.filter(q => q.and(q.neq(q.field("durationMinutes"), undefined), q.lte(q.field("durationMinutes"), filters.maxDurationMinutes!)))
  return source
}
/** La sélection démo n'invente aucun profil ou durée pour satisfaire un filtre. */
export function serviceDiscoveryOfferMatches(offer: CatalogOffer, filters: NormalizedServiceDiscoveryFilters): boolean {
  if ((filters.commercialMode || filters.languageCode || filters.serviceZone || filters.minDurationMinutes !== undefined || filters.maxDurationMinutes !== undefined) && offer.kind !== "service") return false
  const profile = offer.serviceProfile
  if (filters.commercialMode && !filters.commercialMode.some(mode => profile?.commercialModes.includes(mode))) return false
  if (filters.languageCode && !filters.languageCode.some(code => profile?.languageCodes.includes(code))) return false
  if (filters.serviceZone && !filters.serviceZone.some(key => profile?.zones.some(zone => commerceServiceZoneKey(zone.locality) === key))) return false
  if (filters.minDurationMinutes !== undefined || filters.maxDurationMinutes !== undefined) {
    const duration = offer.facets?.attributes.find(attribute => attribute.key === "durationMinutes")
    if (duration?.key !== "durationMinutes" || filters.minDurationMinutes !== undefined && duration.value < filters.minDurationMinutes || filters.maxDurationMinutes !== undefined && duration.value > filters.maxDurationMinutes) return false
  }
  return true
}
