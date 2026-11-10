import { COMMERCE_CATALOG_CATEGORIES } from "@antsia/social-domain/commerce/catalogFacets"
import { COMMERCE_MAX_AMOUNT_XAF } from "@antsia/social-domain/commerce/primitives"
import { COMMERCE_SERVICE_COMMERCIAL_MODES, commerceServiceZoneKey, normalizeCommerceServiceLanguageCode } from "@antsia/social-domain/commerce/serviceProfile"

export const MARKETPLACE_PAGE_SIZE = 12
export const MARKETPLACE_QUERY_MAX = 120
export const MARKETPLACE_QUERY_WORDS_MAX = 16
export const MARKETPLACE_FACET_MAX = 6
export const MARKETPLACE_SORTS = ["newest", "price_asc", "price_desc", "relevance"] as const
export const MARKETPLACE_AUDIENCES = ["women", "men", "kids", "unisex"] as const
export const MARKETPLACE_SERVICE_MODES = ["onsite", "remote", "hybrid"] as const
export const MARKETPLACE_FACETS = ["category", "brand", "material", "color", "audience", "serviceMode", "commercialMode", "languageCode", "serviceZone"] as const
export const MARKETPLACE_COMMERCIAL_MODES = COMMERCE_SERVICE_COMMERCIAL_MODES
export const SERVICE_DURATION_MAX = 43_200
export type MarketplaceFacet = typeof MARKETPLACE_FACETS[number]
export type MarketplaceSearch = {
  view: "products" | "shops" | "services"
  query?: string
  category?: string[]
  brand?: string[]
  material?: string[]
  color?: string[]
  audience?: (typeof MARKETPLACE_AUDIENCES[number])[]
  serviceMode?: (typeof MARKETPLACE_SERVICE_MODES[number])[]
  commercialMode?: (typeof COMMERCE_SERVICE_COMMERCIAL_MODES[number])[]
  languageCode?: string[]
  serviceZone?: string[]
  minDurationMinutes?: number
  maxDurationMinutes?: number
  minPrice?: number
  maxPrice?: number
  sort?: typeof MARKETPLACE_SORTS[number]
  cursor: string | null
}

export const MARKETPLACE_FACET_PARAMS = { category: "categorie", brand: "marque", material: "matiere", color: "couleur", audience: "public", serviceMode: "mode", commercialMode: "modeCommercial", languageCode: "langue", serviceZone: "zone" } as const
const urlFacets = MARKETPLACE_FACET_PARAMS
const views = { produits: "products", boutiques: "shops", services: "services" } as const
const urlViews = { products: "produits", shops: "boutiques", services: "services" } as const
const keys = ["vue", "recherche", ...Object.values(urlFacets), "prixMin", "prixMax", "dureeMin", "dureeMax", "tri", "curseur"]
const invalidText = /[\p{Cc}\uD800-\uDFFF]/u
const text = (value: string) => value.normalize("NFC").trim().replace(/\s+/gu, " ")
const facetIdentity = (value: string) => value.toLocaleLowerCase("fr")
const isAudience = (value: string): value is typeof MARKETPLACE_AUDIENCES[number] => MARKETPLACE_AUDIENCES.some(candidate => candidate === value)
const isServiceMode = (value: string): value is typeof MARKETPLACE_SERVICE_MODES[number] => MARKETPLACE_SERVICE_MODES.some(candidate => candidate === value)
export const isCommercialMode = (value: string): value is typeof COMMERCE_SERVICE_COMMERCIAL_MODES[number] => COMMERCE_SERVICE_COMMERCIAL_MODES.some(candidate => candidate === value)
export function serviceDurationFilter(raw: string | string[] | undefined): number | undefined | null {
  if (raw === undefined || raw === "") return undefined
  if (typeof raw !== "string" || !/^[1-9]\d*$/u.test(raw)) return null
  const value = Number(raw)
  return Number.isSafeInteger(value) && value <= SERVICE_DURATION_MAX ? value : null
}
export const marketplaceQueryWordCount = (value: string): number => value.split(/[^\p{L}\p{N}]+/u).filter(Boolean).length

/** URL fermée : les répétitions sont réservées aux facettes OU ; aucune redirection libre. */
export function marketplaceSearch(params: Record<string, string | string[] | undefined>): MarketplaceSearch | null {
  try {
    if (Object.getPrototypeOf(params) !== Object.prototype && Object.getPrototypeOf(params) !== null || Reflect.ownKeys(params).some(key => typeof key !== "string" || !keys.includes(key))) return null
    for (const key of ["vue", "recherche", "prixMin", "prixMax", "dureeMin", "dureeMax", "tri", "curseur"]) if (params[key] !== undefined && typeof params[key] !== "string") return null
    const rawView = params.vue
    if (rawView !== undefined && (typeof rawView !== "string" || !Object.hasOwn(views, rawView))) return null
    const view = rawView === undefined ? "products" : views[rawView as keyof typeof views]
    const rawQuery = params.recherche as string | undefined
    if (rawQuery !== undefined && (rawQuery.length > MARKETPLACE_QUERY_MAX || invalidText.test(rawQuery))) return null
    const query = text(rawQuery ?? "")
    if (marketplaceQueryWordCount(query) > MARKETPLACE_QUERY_WORDS_MAX) return null
    const facets: Partial<Record<MarketplaceFacet, string[]>> = {}
    for (const facet of MARKETPLACE_FACETS) {
      const raw = params[urlFacets[facet]]
      if (raw === undefined) continue
      const values = typeof raw === "string" ? [raw] : raw
      if (!Array.isArray(values) || values.length < 1 || values.length > MARKETPLACE_FACET_MAX) return null
      const normalized: string[] = []
      for (const value of values) {
        if (typeof value !== "string" || value.length > (facet === "serviceZone" ? 120 : 80) || invalidText.test(value)) return null
        const normalizedValue = facet === "languageCode" ? normalizeCommerceServiceLanguageCode(value) : facet === "serviceZone" ? commerceServiceZoneKey(value) : text(value)
        if (!normalizedValue) return null
        if (facet === "category" && !COMMERCE_CATALOG_CATEGORIES.some(category => category.key === normalizedValue)) return null
        if (facet === "audience" && !isAudience(normalizedValue)) return null
        if (facet === "serviceMode" && !isServiceMode(normalizedValue)) return null
        if (facet === "commercialMode" && !isCommercialMode(normalizedValue)) return null
        normalized.push(normalizedValue)
      }
      if (new Set(normalized.map(facetIdentity)).size !== normalized.length) return null
      facets[facet] = normalized.sort()
    }
    const money = (raw: string | string[] | undefined): number | undefined | null => {
      if (raw === undefined || raw === "") return undefined
      if (typeof raw !== "string" || !/^(?:0|[1-9]\d*)$/u.test(raw)) return null
      const value = Number(raw)
      return Number.isSafeInteger(value) && value <= COMMERCE_MAX_AMOUNT_XAF ? value : null
    }
    const minPrice = money(params.prixMin), maxPrice = money(params.prixMax)
    if (minPrice === null || maxPrice === null || minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) return null
    const minDurationMinutes = serviceDurationFilter(params.dureeMin), maxDurationMinutes = serviceDurationFilter(params.dureeMax)
    if (minDurationMinutes === null || maxDurationMinutes === null || minDurationMinutes !== undefined && maxDurationMinutes !== undefined && minDurationMinutes > maxDurationMinutes) return null
    const rawSort = params.tri
    if (rawSort !== undefined && !MARKETPLACE_SORTS.some(sort => sort === rawSort)) return null
    const sort = rawSort as MarketplaceSearch["sort"]
    const rawCursor = params.curseur as string | undefined
    if (rawCursor !== undefined && (rawCursor.length > 8192 || invalidText.test(rawCursor))) return null
    const base = { view, ...(query ? { query } : {}), cursor: rawCursor || null }
    // L'annuaire de boutiques ne reçoit aucun filtre d'offre ni ordre de prix.
    if (view === "shops") return base
    if (view === "products" && (facets.commercialMode || facets.languageCode || facets.serviceZone || minDurationMinutes !== undefined || maxDurationMinutes !== undefined)) return null
    if (facets.category?.some(key => COMMERCE_CATALOG_CATEGORIES.find(category => category.key === key)?.kind !== (view === "services" ? "service" : "product"))) return null
    if (sort && (query ? sort !== "relevance" : sort === "relevance")) return null
    const { audience, serviceMode, commercialMode, ...textFacets } = facets
    return { ...base, ...textFacets, ...(audience ? { audience: audience.filter(isAudience) } : {}), ...(serviceMode ? { serviceMode: serviceMode.filter(isServiceMode) } : {}), ...(commercialMode ? { commercialMode: commercialMode.filter(isCommercialMode) } : {}), ...(minPrice !== undefined ? { minPrice } : {}), ...(maxPrice !== undefined ? { maxPrice } : {}), ...(minDurationMinutes !== undefined ? { minDurationMinutes } : {}), ...(maxDurationMinutes !== undefined ? { maxDurationMinutes } : {}), ...(sort ? { sort } : {}) }
  } catch { return null }
}

/** Ordre stable des clés et valeurs ; aucune dépendance au registre des routes. */
export function marketplaceSearchParams(search: MarketplaceSearch): URLSearchParams {
  const params = new URLSearchParams({ vue: urlViews[search.view] })
  if (search.query) params.set("recherche", search.query)
  if (search.view !== "shops") {
    for (const facet of MARKETPLACE_FACETS) for (const value of [...(search[facet] ?? [])].sort()) params.append(urlFacets[facet], value)
    if (search.minPrice !== undefined) params.set("prixMin", String(search.minPrice))
    if (search.maxPrice !== undefined) params.set("prixMax", String(search.maxPrice))
    if (search.minDurationMinutes !== undefined) params.set("dureeMin", String(search.minDurationMinutes))
    if (search.maxDurationMinutes !== undefined) params.set("dureeMax", String(search.maxDurationMinutes))
    if (search.sort) params.set("tri", search.sort)
  }
  if (search.cursor) params.set("curseur", search.cursor)
  return params
}

export function marketplaceSearchFromParams(params: Pick<URLSearchParams, "keys" | "getAll">): MarketplaceSearch | null {
  return marketplaceSearch(Object.fromEntries([...new Set(params.keys())].map(key => { const values = params.getAll(key); return [key, values.length === 1 ? values[0]! : values] })))
}
