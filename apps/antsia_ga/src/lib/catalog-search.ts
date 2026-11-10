import { COMMERCE_CATALOG_CATEGORIES } from "@antsia/social-domain/commerce/catalogFacets"
import { COMMERCE_MAX_AMOUNT_XAF } from "@antsia/social-domain/commerce/primitives"
import { commerceServiceZoneKey, normalizeCommerceServiceLanguageCode } from "@antsia/social-domain/commerce/serviceProfile"
import { isDemoCatalogCollectionRef } from "./demo-catalog-projection"
import { MARKETPLACE_AUDIENCES, MARKETPLACE_SERVICE_MODES, MARKETPLACE_SORTS, MARKETPLACE_FACETS, MARKETPLACE_FACET_MAX, MARKETPLACE_FACET_PARAMS, MARKETPLACE_COMMERCIAL_MODES, isCommercialMode, serviceDurationFilter, marketplaceQueryWordCount } from "./marketplace-search"

/** Entrées publiques bornées ; mêmes filtres pour un membre et une lecture SSR. */
export type CatalogFilters = {
  kind?: "product" | "service"; collectionRef?: string; query?: string
  category?: string[]; brand?: string[]; material?: string[]; color?: string[]
  audience?: (typeof MARKETPLACE_AUDIENCES[number])[]; serviceMode?: (typeof MARKETPLACE_SERVICE_MODES[number])[]
  commercialMode?: (typeof MARKETPLACE_COMMERCIAL_MODES[number])[]; languageCode?: string[]; serviceZone?: string[]
  minDurationMinutes?: number; maxDurationMinutes?: number
  minPrice?: number; maxPrice?: number; sort?: typeof MARKETPLACE_SORTS[number]
}
export type CatalogSearch = CatalogFilters & { cursor: string | null }
export const CATALOG_PAGE_SIZE = 12
export const CATALOG_QUERY_MAX_LENGTH = 120
export const CATALOG_FACET_PARAMS = MARKETPLACE_FACET_PARAMS
const keys = ["type", "collection", "recherche", "curseur", "prixMin", "prixMax", "dureeMin", "dureeMax", "tri", ...Object.values(CATALOG_FACET_PARAMS)]
const invalidText = /[\p{Cc}\uD800-\uDFFF]/u
const normalize = (value: string) => value.normalize("NFC").trim().replace(/\s+/gu, " ")
const identity = (value: string) => value.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase()
const isAudience = (value: string): value is typeof MARKETPLACE_AUDIENCES[number] => MARKETPLACE_AUDIENCES.some(item => item === value)
const isMode = (value: string): value is typeof MARKETPLACE_SERVICE_MODES[number] => MARKETPLACE_SERVICE_MODES.some(item => item === value)

export function catalogSearch(params: Record<string, string | string[] | undefined>): CatalogSearch | null {
  try {
    if (Object.getPrototypeOf(params) !== Object.prototype && Object.getPrototypeOf(params) !== null || Reflect.ownKeys(params).some(key => typeof key !== "string" || !keys.includes(key))) return null
    for (const key of ["type", "collection", "recherche", "curseur", "prixMin", "prixMax", "dureeMin", "dureeMax", "tri"]) if (params[key] !== undefined && typeof params[key] !== "string") return null
    const kind = params.type, collection = params.collection, rawQuery = params.recherche
    if (kind !== undefined && kind !== "" && kind !== "product" && kind !== "service") return null
    if (typeof collection === "string" && collection !== "" && !/^pro\.ga:offer_collection:[0-9A-HJKMNP-TV-Z]{10,32}$/u.test(collection) && !isDemoCatalogCollectionRef(collection)) return null
    if (typeof rawQuery === "string" && (rawQuery.length > CATALOG_QUERY_MAX_LENGTH || invalidText.test(rawQuery))) return null
    const query = normalize(typeof rawQuery === "string" ? rawQuery : "")
    if (marketplaceQueryWordCount(query) > 16 || query && marketplaceQueryWordCount(query) === 0) return null
    const facets: Partial<Record<typeof MARKETPLACE_FACETS[number], string[]>> = {}
    for (const facet of MARKETPLACE_FACETS) {
      const raw = params[CATALOG_FACET_PARAMS[facet]]
      if (raw === undefined) continue
      const values = typeof raw === "string" ? [raw] : raw
      if (!Array.isArray(values) || !values.length || values.length > MARKETPLACE_FACET_MAX) return null
      const normalized: string[] = []
      for (const value of values) {
        if (typeof value !== "string" || value.length > (facet === "serviceZone" ? 120 : 80) || invalidText.test(value)) return null
        const entry = facet === "languageCode" ? normalizeCommerceServiceLanguageCode(value) : facet === "serviceZone" ? commerceServiceZoneKey(value) : normalize(value)
        if (!entry || facet === "category" && !COMMERCE_CATALOG_CATEGORIES.some(item => item.key === entry && (!kind || item.kind === kind)) || facet === "audience" && !isAudience(entry) || facet === "serviceMode" && !isMode(entry) || facet === "commercialMode" && !isCommercialMode(entry)) return null
        normalized.push(entry)
      }
      if (new Set(normalized.map(identity)).size !== normalized.length) return null
      facets[facet] = normalized.sort()
    }
    const money = (raw: string | string[] | undefined): number | undefined | null => {
      if (raw === undefined || raw === "") return undefined
      if (typeof raw !== "string" || !/^(?:0|[1-9]\d*)$/u.test(raw)) return null
      const amount = Number(raw)
      return Number.isSafeInteger(amount) && amount <= COMMERCE_MAX_AMOUNT_XAF ? amount : null
    }
    const minPrice = money(params.prixMin), maxPrice = money(params.prixMax)
    if (minPrice === null || maxPrice === null || minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) return null
    const minDurationMinutes = serviceDurationFilter(params.dureeMin), maxDurationMinutes = serviceDurationFilter(params.dureeMax)
    if (minDurationMinutes === null || maxDurationMinutes === null || minDurationMinutes !== undefined && maxDurationMinutes !== undefined && minDurationMinutes > maxDurationMinutes) return null
    if (kind === "product" && (facets.commercialMode || facets.languageCode || facets.serviceZone || minDurationMinutes !== undefined || maxDurationMinutes !== undefined)) return null
    const rawSort = params.tri
    if (rawSort !== undefined && !MARKETPLACE_SORTS.some(sort => sort === rawSort)) return null
    const sort = rawSort as CatalogFilters["sort"]
    if (sort && (query ? sort !== "relevance" : sort === "relevance")) return null
    const rawCursor = params.curseur
    if (typeof rawCursor === "string" && (rawCursor.length > 8192 || invalidText.test(rawCursor))) return null
    const { audience, serviceMode, commercialMode, ...textFacets } = facets
    return { ...(kind === "product" || kind === "service" ? { kind } : {}), ...(typeof collection === "string" && collection ? { collectionRef: collection } : {}), ...(query ? { query } : {}), ...textFacets, ...(audience ? { audience: audience.filter(isAudience) } : {}), ...(serviceMode ? { serviceMode: serviceMode.filter(isMode) } : {}), ...(commercialMode ? { commercialMode: commercialMode.filter(isCommercialMode) } : {}), ...(minDurationMinutes !== undefined ? { minDurationMinutes } : {}), ...(maxDurationMinutes !== undefined ? { maxDurationMinutes } : {}), ...(minPrice !== undefined ? { minPrice } : {}), ...(maxPrice !== undefined ? { maxPrice } : {}), ...(sort ? { sort } : {}), cursor: typeof rawCursor === "string" && rawCursor ? rawCursor : null }
  } catch { return null }
}

export function catalogFilters(search: CatalogFilters): CatalogFilters {
  const result: CatalogFilters = {}
  if (search.kind) result.kind = search.kind
  if (search.collectionRef) result.collectionRef = search.collectionRef
  if (search.query) result.query = search.query
  for (const key of ["category", "brand", "material", "color", "languageCode", "serviceZone"] as const) if (search[key]?.length) result[key] = [...search[key]!].sort()
  if (search.audience?.length) result.audience = [...search.audience].sort()
  if (search.serviceMode?.length) result.serviceMode = [...search.serviceMode].sort()
  if (search.commercialMode?.length) result.commercialMode = [...search.commercialMode].sort()
  if (search.minDurationMinutes !== undefined) result.minDurationMinutes = search.minDurationMinutes
  if (search.maxDurationMinutes !== undefined) result.maxDurationMinutes = search.maxDurationMinutes
  if (search.minPrice !== undefined) result.minPrice = search.minPrice
  if (search.maxPrice !== undefined) result.maxPrice = search.maxPrice
  if (search.sort) result.sort = search.sort
  return result
}


/** Préserve chaque valeur répétée de l'URL vivante avant sa validation fermée. */
export function catalogSearchFromParams(params: Pick<URLSearchParams, "keys" | "getAll">): CatalogSearch | null {
  const input: Record<string, string | string[]> = Object.fromEntries([...new Set(params.keys())].map(key => {
    const values = params.getAll(key)
    return [key, values.length === 1 ? values[0]! : values]
  }))
  return catalogSearch(input)
}
