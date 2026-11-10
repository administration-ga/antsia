/** MP03 : données de recherche dérivées uniquement d'un fait public validé. */
import { catalogFacetsMatchKind, parseCommerceCatalogFacets } from "@antsia/social-domain/commerce/catalogFacets"
import { parseCommerceServiceProfile, commerceServiceZoneKey } from "@antsia/social-domain/commerce/serviceProfile"
import { COMMERCE_MAX_AMOUNT_XAF } from "@antsia/social-domain/commerce/primitives"
import { parseCommercePublicBody } from "@antsia/social-domain/commerce/projection"

export const MARKETPLACE_DISCOVERY_VERSION = 2 as const
export const CATALOG_LOCAL_INDEX_VERSION = 2 as const
export const MARKETPLACE_QUOTE_SORT = COMMERCE_MAX_AMOUNT_XAF + 1
export const MARKETPLACE_SEARCH_TEXT_MAX = 32_768
export const normalizeMarketplaceText = (value: string): string => value.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/gu, " ").trim()
export type MarketplaceIndexFields = {
  discoveryVersion: 2 | undefined; searchText: string
  localIndexVersion: 2 | undefined
  collection1: string | undefined; collection2: string | undefined; collection3: string | undefined; collection4: string | undefined; collection5: string | undefined
  category1: string | undefined; category2: string | undefined; category3: string | undefined
  brand: string | undefined; material: string | undefined; color: string | undefined
  audience: "women" | "men" | "kids" | "unisex" | undefined
  serviceMode: "onsite" | "remote" | "hybrid" | undefined
  commercialQuote: boolean | undefined; commercialBooking: boolean | undefined; commercialFixedOrder: boolean | undefined
  language1: string | undefined; language2: string | undefined; language3: string | undefined; language4: string | undefined; language5: string | undefined; language6: string | undefined
  serviceZone1: string | undefined; serviceZone2: string | undefined; serviceZone3: string | undefined; serviceZone4: string | undefined; serviceZone5: string | undefined; serviceZone6: string | undefined; serviceZone7: string | undefined; serviceZone8: string | undefined
  durationMinutes: number | undefined
  minPrice: number | undefined; maxPrice: number | undefined; priceAsc: number | undefined; priceDesc: number | undefined
}

function empty(): MarketplaceIndexFields {
  return { commercialQuote: undefined, commercialBooking: undefined, commercialFixedOrder: undefined, language1: undefined, language2: undefined, language3: undefined, language4: undefined, language5: undefined, language6: undefined, serviceZone1: undefined, serviceZone2: undefined, serviceZone3: undefined, serviceZone4: undefined, serviceZone5: undefined, serviceZone6: undefined, serviceZone7: undefined, serviceZone8: undefined, durationMinutes: undefined, localIndexVersion: undefined, collection1: undefined, collection2: undefined, collection3: undefined, collection4: undefined, collection5: undefined, discoveryVersion: undefined, searchText: "", category1: undefined, category2: undefined, category3: undefined, brand: undefined, material: undefined, color: undefined, audience: undefined, serviceMode: undefined, minPrice: undefined, maxPrice: undefined, priceAsc: undefined, priceDesc: undefined }
}

/** Les `undefined` retirent aussi les anciens champs lors d'un patch/retrait. */
export function marketplaceIndexFields(rawBody: string, state: "active" | "withdrawn" | "closed", objectKind: "shop" | "offer", sequence: "catalog" | "availability", nowMs: number): MarketplaceIndexFields {
  const fields = empty()
  if (state !== "active" || objectKind !== "offer" || sequence !== "catalog") return fields
  fields.localIndexVersion = CATALOG_LOCAL_INDEX_VERSION
  const parsed = parseCommercePublicBody(rawBody, nowMs)
  if (!parsed.ok || parsed.value.payload.type !== "offer.published" && parsed.value.payload.type !== "offer.updated") return fields
  const offer = parsed.value.payload
  const facets = parseCommerceCatalogFacets(offer.facets)
  if (facets && !catalogFacetsMatchKind(facets, offer.kind)) return fields
  fields.discoveryVersion = MARKETPLACE_DISCOVERY_VERSION
  for (const [index, key] of (["collection1", "collection2", "collection3", "collection4", "collection5"] as const).entries()) fields[key] = offer.collectionRefs[index]
  fields.category1 = facets?.categoryPath[0]
  fields.category2 = facets?.categoryPath[1]
  fields.category3 = facets?.categoryPath[2]
  const terms = [offer.title, offer.description, ...offer.tags]
  for (const attribute of facets?.attributes ?? []) {
    if (attribute.type === "text") {
      fields[attribute.key] = normalizeMarketplaceText(attribute.value)
      terms.push(attribute.value)
    } else if (attribute.key === "audience") { fields.audience = attribute.value; terms.push(attribute.value) }
    else if (attribute.key === "serviceMode") { fields.serviceMode = attribute.value; terms.push(attribute.value) }
    else if (attribute.key === "durationMinutes" && offer.kind === "service") { fields.durationMinutes = attribute.value; terms.push(String(attribute.value)) }
    else terms.push(String(attribute.value))
  }
  const profile = offer.kind === "service" ? parseCommerceServiceProfile(offer.serviceProfile, offer.media.length) : null
  if (profile) {
    fields.commercialQuote = profile.commercialModes.includes("quote")
    fields.commercialBooking = profile.commercialModes.includes("booking")
    fields.commercialFixedOrder = profile.commercialModes.includes("fixed_order")
    for (const [index, key] of (["language1", "language2", "language3", "language4", "language5", "language6"] as const).entries()) fields[key] = profile.languageCodes[index]
    for (const [index, key] of (["serviceZone1", "serviceZone2", "serviceZone3", "serviceZone4", "serviceZone5", "serviceZone6", "serviceZone7", "serviceZone8"] as const).entries()) fields[key] = profile.zones[index] ? commerceServiceZoneKey(profile.zones[index]!.locality) ?? undefined : undefined
    terms.push(...profile.commercialModes, ...profile.languageCodes, ...profile.zones.map(zone => zone.locality), ...profile.deliverables, ...profile.inclusions, ...profile.exclusions, ...profile.portfolio.flatMap(item => [item.title, item.description]))
  }
  fields.searchText = normalizeMarketplaceText(terms.join(" ")).slice(0, MARKETPLACE_SEARCH_TEXT_MAX)
  if (offer.price.mode === "quote") fields.priceAsc = fields.priceDesc = MARKETPLACE_QUOTE_SORT
  else {
    fields.minPrice = offer.price.mode === "range" ? offer.price.minAmount : offer.price.amount
    fields.maxPrice = offer.price.mode === "range" ? offer.price.maxAmount : offer.price.amount
    fields.priceAsc = fields.minPrice
    fields.priceDesc = -fields.maxPrice
  }
  return fields
}
