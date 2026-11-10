/** P09 : un DTO allowlist identique pour membre, SSR public et slot de publication. */
import { type Infer, v } from "convex/values"
import type { CommerceServiceProfile } from "@antsia/social-domain/commerce/serviceProfile"

import { withheldCodeValidator } from "../files/storageGuard"
import { catalogFacetsValidator } from "./catalogFacetValidators"

export const catalogKindValidator = v.union(v.literal("product"), v.literal("service"))
export const catalogAvailabilityValidator = v.union(v.literal("in_stock"), v.literal("out_of_stock"), v.literal("unknown"))
export const catalogPriceValidator = v.union(
  v.object({ mode: v.literal("fixed"), currency: v.literal("XAF"), amount: v.number() }),
  v.object({ mode: v.literal("unit"), currency: v.literal("XAF"), amount: v.number(), unit: v.string() }),
  v.object({ mode: v.literal("range"), currency: v.literal("XAF"), minAmount: v.number(), maxAmount: v.number(), unit: v.optional(v.string()) }),
  v.object({ mode: v.literal("quote"), currency: v.literal("XAF") }),
)
export const catalogCollectionValidator = v.object({ collectionRef: v.string(), label: v.string() })
const commercialModeValue = v.union(v.literal("quote"), v.literal("booking"), v.literal("fixed_order"))
export const catalogServiceProfileValidator = v.object({
  version: v.literal(1), commercialModes: v.array(commercialModeValue), languageCodes: v.array(v.string()),
  zones: v.array(v.object({ countryCode: v.literal("GA"), locality: v.string() })),
  deliverables: v.array(v.string()), inclusions: v.array(v.string()), exclusions: v.array(v.string()),
  portfolio: v.array(v.object({ title: v.string(), description: v.string(), mediaIndexes: v.array(v.number()) })),
})
export type CatalogServiceProfile = Infer<typeof catalogServiceProfileValidator>
/** Copie mutable fermée du profil validé du snapshot publié, sans donnée de travail. */
export function catalogServiceProfileDto(profile: CommerceServiceProfile): CatalogServiceProfile {
  return { version: 1, commercialModes: [...profile.commercialModes], languageCodes: [...profile.languageCodes], zones: profile.zones.map(zone => ({ ...zone })), deliverables: [...profile.deliverables], inclusions: [...profile.inclusions], exclusions: [...profile.exclusions], portfolio: profile.portfolio.map(item => ({ title: item.title, description: item.description, mediaIndexes: [...item.mediaIndexes] })) }
}
export const catalogOfferValidator = v.object({
  offerRef: v.string(), shopHandle: v.string(), kind: catalogKindValidator, title: v.string(), description: v.string(),
  price: catalogPriceValidator, revision: v.number(), changedAt: v.number(), collections: v.array(catalogCollectionValidator),
  tags: v.array(v.string()), variantAxes: v.array(v.string()),
  variants: v.array(v.object({ variantRef: v.string(), label: v.string(), options: v.array(v.string()), amount: v.number(), unit: v.union(v.string(), v.null()), availability: v.union(catalogAvailabilityValidator, v.null()) })),
  media: v.array(v.object({ url: v.union(v.string(), v.null()), altText: v.union(v.string(), v.null()), width: v.union(v.number(), v.null()), height: v.union(v.number(), v.null()), withheld: v.union(withheldCodeValidator, v.null()) })),
  availability: v.object({ state: v.union(catalogAvailabilityValidator, v.null()), indicative: v.literal(true), updatedAt: v.union(v.number(), v.null()), stale: v.boolean() }),
  leadTimeDays: v.union(v.number(), v.null()), zone: v.union(v.string(), v.null()),
  actions: v.object({ contact: v.boolean(), quote: v.literal(false), purchase: v.literal(false) }),
  facets: v.optional(catalogFacetsValidator), serviceProfile: v.optional(catalogServiceProfileValidator),
})
export type CatalogOffer = Infer<typeof catalogOfferValidator>
export const catalogListValidator = v.object({ page: v.array(catalogOfferValidator), isDone: v.boolean(), continueCursor: v.string(), collections: v.array(catalogCollectionValidator), filteredWindow: v.boolean(), indexStatus: v.optional(v.union(v.literal("building"), v.literal("ready"))) })
export type CatalogList = Infer<typeof catalogListValidator>

/** Référence durable, jamais un snapshot de prix ou une URL. */
export const catalogPostReferenceValidator = v.object({ shopId: v.id("shops"), offerRef: v.string() })
export type CatalogPostReference = Infer<typeof catalogPostReferenceValidator>

/** MP05 : mêmes filtres fermés pour les projections membre et publique. */
const catalogTextSelection = v.union(v.string(), v.array(v.string()))
const catalogAudienceValue = v.union(v.literal("women"), v.literal("men"), v.literal("kids"), v.literal("unisex"))
const catalogServiceModeValue = v.union(v.literal("onsite"), v.literal("remote"), v.literal("hybrid"))

export const serviceDiscoveryFilterArgs = {
  commercialMode: v.optional(v.union(commercialModeValue, v.array(commercialModeValue))),
  languageCode: v.optional(catalogTextSelection), serviceZone: v.optional(catalogTextSelection),
  minDurationMinutes: v.optional(v.number()), maxDurationMinutes: v.optional(v.number()),
}

export const marketplaceFilterArgs = {
  ...serviceDiscoveryFilterArgs,
  kind: v.optional(catalogKindValidator), query: v.optional(v.string()), category: v.optional(catalogTextSelection),
  brand: v.optional(catalogTextSelection), material: v.optional(catalogTextSelection), color: v.optional(catalogTextSelection),
  audience: v.optional(v.union(catalogAudienceValue, v.array(catalogAudienceValue))), serviceMode: v.optional(v.union(catalogServiceModeValue, v.array(catalogServiceModeValue))),
  minPrice: v.optional(v.number()), maxPrice: v.optional(v.number()), sort: v.optional(v.union(v.literal("newest"), v.literal("price_asc"), v.literal("price_desc"), v.literal("relevance"))),
}

export const catalogFilterArgs = { ...marketplaceFilterArgs, collectionRef: v.optional(v.string()) }
