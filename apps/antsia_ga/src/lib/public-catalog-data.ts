import type { CatalogOffer } from "@convex/modules/shops/catalogValidators"
import { api } from "@convex/_generated/api"
import { COMMERCE_PUBLIC_LIMITS as L } from "@antsia/social-domain/commerce/projection"
import { COMMERCE_MAX_AMOUNT_XAF } from "@antsia/social-domain/commerce/primitives"
import { parseCommerceCatalogFacets, catalogFacetsMatchKind } from "@antsia/social-domain/commerce/catalogFacets"
import { parseCommerceServiceProfile } from "@antsia/social-domain/commerce/serviceProfile"
import { cache } from "react"
import { z } from "zod"

import type { CatalogPage } from "@/components/shops/catalog-model"
import { CATALOG_PAGE_SIZE, catalogFilters, type CatalogFilters } from "./catalog-search"
import { demoCatalogDeclaration, isDemoCatalogAssetPath, isDemoCatalogCollectionRef, isDemoCatalogOfferRef } from "./demo-catalog-projection"
import { projected } from "./public-data"

const timestamp = z.number().int().nonnegative().max(8_640_000_000_000_000)
const amount = z.number().int().nonnegative().max(COMMERCE_MAX_AMOUNT_XAF)
const unit = z.string().min(1).max(L.unitMax)
const ref = (kind: string) => z.string().regex(new RegExp(`^pro\\.ga:${kind}:[0-9A-HJKMNP-TV-Z]{10,32}$`))
const collection = z.object({ collectionRef: ref("offer_collection"), label: z.string().min(1).max(L.collectionLabelMax) }).strict()
const availabilityState = z.enum(["in_stock", "out_of_stock", "unknown"]).nullable()
const assetUrl = z.string().url().max(8192).refine((value) => {
  try { const url = new URL(value); return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password } catch { return false }
})
const catalogMedia = z.object({ url: assetUrl.nullable(), altText: z.string().max(L.mediaAltMax).nullable(), width: z.number().int().positive().max(L.mediaDimensionMax).nullable(), height: z.number().int().positive().max(L.mediaDimensionMax).nullable(), withheld: z.enum(["fileScanPending", "fileQuarantined"]).nullable() }).strict()
const price = z.union([
  z.object({ mode: z.literal("fixed"), amount, currency: z.literal("XAF") }).strict(),
  z.object({ mode: z.literal("unit"), amount, currency: z.literal("XAF"), unit }).strict(),
  z.object({ mode: z.literal("range"), minAmount: amount, maxAmount: amount, currency: z.literal("XAF"), unit: unit.optional() }).strict().refine((value) => value.minAmount <= value.maxAmount),
  z.object({ mode: z.literal("quote"), currency: z.literal("XAF") }).strict(),
])

/** Objet fermé : pas de liaison, stock chiffré, origine machine ou URL de gestion. */
const proCatalogOfferSchema = z.object({
  offerRef: ref("offer"), shopHandle: z.string().min(1).max(200), kind: z.enum(["product", "service"]),
  title: z.string().min(L.offerTitleMin).max(L.offerTitleMax), description: z.string().max(L.offerDescriptionMax),
  price, revision: z.number().int().positive(), changedAt: timestamp,
  facets: z.custom<NonNullable<CatalogOffer["facets"]>>(value => parseCommerceCatalogFacets(value) !== null).optional(),
  // Validation du manifeste dans superRefine : aucun profil autonome sans les médias de l'offre.
  serviceProfile: z.custom<NonNullable<CatalogOffer["serviceProfile"]>>().optional(),
  collections: z.array(collection).max(L.offerCollectionsMax), tags: z.array(z.string().max(L.tagMax)).max(L.tagsMax),
  variantAxes: z.array(z.string().max(L.variantAxisMax)).max(L.variantAxesMax),
  variants: z.array(z.object({ variantRef: ref("offer_variant"), label: z.string().min(1).max(L.variantLabelMax), options: z.array(z.string().max(L.variantOptionMax)).max(L.variantAxesMax), amount, unit: unit.nullable(), availability: availabilityState }).strict()).max(L.variantsMax),
  media: z.array(catalogMedia).max(L.mediaMax),
  availability: z.object({ state: availabilityState, indicative: z.literal(true), updatedAt: timestamp.nullable(), stale: z.boolean() }).strict(),
  leadTimeDays: z.number().int().nonnegative().max(L.leadTimeDaysMax).nullable(), zone: z.string().max(L.zoneMax).nullable(),
  actions: z.object({ contact: z.boolean(), quote: z.literal(false), purchase: z.literal(false) }).strict(),
}).strict()

const demoCollection = collection.extend({ collectionRef: z.string().refine(isDemoCatalogCollectionRef) }).strict()
const demoCatalogOfferSchema = proCatalogOfferSchema.extend({
  facets: z.never().optional(),
  serviceProfile: z.never().optional(),
  offerRef: z.string().refine(isDemoCatalogOfferRef),
  collections: z.array(demoCollection).length(1),
  variantAxes: proCatalogOfferSchema.shape.variantAxes.max(0),
  variants: proCatalogOfferSchema.shape.variants.max(0),
  media: z.array(catalogMedia.extend({ url: z.string().max(8192).refine(isDemoCatalogAssetPath) }).strict()).length(1),
}).strict().superRefine((offer, ctx) => {
  const declaration = demoCatalogDeclaration(offer.offerRef)
  if (!declaration || offer.shopHandle !== declaration.shopHandle || offer.kind !== declaration.kind || offer.collections[0]?.collectionRef !== declaration.collectionRef || offer.media[0]?.url !== declaration.imagePath || offer.actions.contact) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "invalidDemoProjection" })
  }
})

/** Le contrat PRO.GA reste inchangé ; la démo possède sa propre branche fermée. */
export const catalogOfferSchema: z.ZodType<CatalogOffer> = z.union([proCatalogOfferSchema.superRefine((offer, ctx) => {
  if (offer.serviceProfile !== undefined && (offer.kind !== "service" || parseCommerceServiceProfile(offer.serviceProfile, offer.media.length) === null)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["serviceProfile"], message: "invalidServiceProfile" })
  if (offer.facets !== undefined) {
    const facets = parseCommerceCatalogFacets(offer.facets)
    if (!facets || !catalogFacetsMatchKind(facets, offer.kind)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["facets"], message: "invalidCatalogFacets" })
  }
}), demoCatalogOfferSchema])
export const catalogPageSchema: z.ZodType<CatalogPage> = z.object({ page: z.array(catalogOfferSchema).max(CATALOG_PAGE_SIZE), continueCursor: z.string().max(8192), isDone: z.boolean(), collections: z.array(z.union([collection, demoCollection])).max(L.shopCollectionsMax), filteredWindow: z.boolean(), indexStatus: z.enum(["building", "ready"]).optional() }).strict().superRefine((catalog, ctx) => {
  const demoOffers = catalog.page.filter((offer) => demoCatalogDeclaration(offer.offerRef) !== undefined)
  const demoCollections = catalog.collections.filter((item) => item.collectionRef.startsWith("demo:"))
  if (demoOffers.length && (demoOffers.length !== catalog.page.length || catalog.collections.length !== 1 || demoOffers.some((offer) => offer.collections[0]?.collectionRef !== catalog.collections[0]?.collectionRef)) || !demoOffers.length && catalog.page.length && demoCollections.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "invalidDemoProjection" })
  }
})

/** Les métadonnées et le rendu partagent une lecture même si leurs objets de filtres diffèrent. */
const loadRequestCatalog = cache((handle: string, serializedFilters: string, cursor: string | null, handoff: boolean) => {
  const filters: CatalogFilters = JSON.parse(serializedFilters)
  return projected(api.modules.public.catalog.list, { handle, ...filters, paginationOpts: { cursor, numItems: CATALOG_PAGE_SIZE } }, catalogPageSchema, handoff)
})

/** Porte SSR commune : aucun repli anonyme d'une session refusée ou d'un OTT. */
export function loadPublicCatalog(handle: string, filters: CatalogFilters = {}, cursor: string | null = null, handoff = false) {
  return loadRequestCatalog(handle, JSON.stringify(catalogFilters(filters)), cursor, handoff)
}

export const loadPublicOffer = cache((handle: string, offerRef: string, handoff = false) =>
  projected(api.modules.public.catalog.offer, { handle, offerRef }, catalogOfferSchema.nullable(), handoff),
)
export const loadPublicPostOffer = cache((postId: string, handoff = false) =>
  projected(api.modules.public.catalog.postOffer, { postId }, catalogOfferSchema.nullable(), handoff),
)
