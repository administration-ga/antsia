/** P09 : projection publique commune ; aucun privilège de gestion ne traverse le DTO. */
import { parseCommerceRef } from "@antsia/social-domain/commerce/primitives"
import { parseCommerceServiceProfile } from "@antsia/social-domain/commerce/serviceProfile"
import { catalogFacetsMatchKind, parseCommerceCatalogFacets } from "@antsia/social-domain/commerce/catalogFacets"
import { effectiveActivityConfiguration, visibleActivityBlocks, type ActivityBlock } from "@antsia/social-domain/activityConfiguration"
import { commerceOfferPublicView, type CommerceAvailabilityEvent, parseCommercePublicBody } from "@antsia/social-domain/commerce/projection"
import type { OrderedQuery, PaginationOptions } from "convex/server"

import type { DataModel, Doc, Id } from "../../_generated/dataModel"
import type { QueryCtx } from "../../_generated/server"
import { fail } from "../../lib/errors"
import { contactEnabledForShop } from "../commercialMessaging/access"
import { catalogMediaDto } from "../federation/commerceCatalogMedia"
import { canReadModeratedContent, contentState } from "../moderation/policy"
import { findPageByHandle } from "../pages/access"
import { isStorefrontInReadingContext, shopOfPage } from "./access"
import { headBelongsToCurrentCatalog, readableCatalogMapping } from "./catalogAccess"
import { catalogServiceProfileDto, type CatalogList, type CatalogOffer } from "./catalogValidators"
import { demoCatalogForShop, isDemoCollectionRef, isDemoOfferRef, resolveDemoCatalogOffer } from "./demoCatalog"
import { catalogFacetsDto } from "./catalogFacetValidators"
import { applyServiceDiscoveryFilters, serviceDiscoveryOfferMatches, marketplaceFiltersOf, type MarketplaceFilters, type NormalizedMarketplaceFilters } from "./catalogSearchRules"
import { CATALOG_LOCAL_INDEX_VERSION, MARKETPLACE_DISCOVERY_VERSION, normalizeMarketplaceText } from "./marketplaceIndexFields"
import { sha256Hex } from "./commerceLinkCrypto"

export type CatalogReadContext = { root: Doc<"networks">; readerPersonId?: Id<"persons">; network?: Doc<"networks"> }
export type CatalogReadCtx = Pick<QueryCtx, "db"> & Partial<Pick<QueryCtx, "runQuery">>
type ReadCtx = CatalogReadCtx
export type CatalogListArgs = MarketplaceFilters & { handle: string; collectionRef?: string; paginationOpts: PaginationOptions }
const STALE_MS = 15 * 60 * 1000


async function contextFor(ctx: ReadCtx, context: CatalogReadContext, shopId: Id<"shops">) {
  const live = await readableCatalogMapping(ctx, context.root, shopId, context.readerPersonId)
  return live && (!context.network || await isStorefrontInReadingContext(ctx, live.shop, context.network)) ? live : null
}

async function project(ctx: ReadCtx, context: CatalogReadContext, head: Doc<"commerceCatalogHeads">, live: NonNullable<Awaited<ReturnType<typeof contextFor>>>): Promise<CatalogOffer | null> {
  if (head.state !== "active" || head.sequence !== "catalog" || head.objectKind !== "offer" || !headBelongsToCurrentCatalog(head, live)) return null
  // Même son administrateur ne transforme pas une prélecture en projection publique.
  if ((await contentState(ctx, "commerceOffer", head._id))?.status !== "published" || !await canReadModeratedContent(ctx, "commerceOffer", head._id, context.readerPersonId)) return null
  const parsed = parseCommercePublicBody(head.body, Date.now())
  if (!parsed.ok || (parsed.value.payload.type !== "offer.published" && parsed.value.payload.type !== "offer.updated")) return null
  if (!live.emitter.allowedContracts.includes(parsed.value.contract)) return null
  const offer = parsed.value.payload
  if (offer.kind === "service" && !effectiveActivityConfiguration(live.shop.activityConfiguration, live.shop.model).capabilities.includes("services")) return null
  const serviceProfile = offer.serviceProfile ? parseCommerceServiceProfile(offer.serviceProfile, offer.media.length) : null
  if (offer.serviceProfile && (!serviceProfile || offer.kind !== "service")) return null
  const facets = parseCommerceCatalogFacets(offer.facets)
  if (facets && !catalogFacetsMatchKind(facets, offer.kind)) return null
  const available = await ctx.db.query("commerceCatalogHeads").withIndex("by_emitter_object_sequence", (q) => q.eq("emitterId", head.emitterId).eq("objectRef", head.objectRef).eq("sequence", "availability")).unique()
  let availability: CommerceAvailabilityEvent | null = null
  if (available?.state === "active" && headBelongsToCurrentCatalog(available, live)) {
    const snapshot = parseCommercePublicBody(available.body, Date.now())
    if (snapshot.ok && live.emitter.allowedContracts.includes(snapshot.value.contract) && snapshot.value.payload.type === "offer.availabilityChanged") availability = snapshot.value.payload
  }
  // Une réception/signature de transport récente ne rajeunit jamais un ancien fait métier.
  const stale = availability === null || availability.changedAt < offer.changedAt || Date.now() - availability.changedAt > STALE_MS
  const view = commerceOfferPublicView(offer, stale ? null : availability, { nowMs: Date.now(), purchase: false, quote: false })
  const collections = live.parent.collections.filter((collection) => offer.collectionRefs.includes(collection.collectionRef)).sort((a, b) => a.position - b.position || a.collectionRef.localeCompare(b.collectionRef)).map(({ collectionRef, label }) => ({ collectionRef, label }))
  return {
    offerRef: view.offerRef, shopHandle: live.page.handle, kind: view.kind, title: view.title, description: view.description,
    price: view.price, revision: view.revision, changedAt: offer.changedAt, collections,
    tags: [...view.tags], variantAxes: [...view.variantAxes],
    variants: view.variants.map((variant) => ({ variantRef: variant.variantRef, label: variant.label, options: [...variant.options], amount: variant.amount, unit: variant.unit ?? null, availability: variant.availability })),
    media: await catalogMediaDto(ctx, head, offer.media),
    availability: { state: view.availability, indicative: true, updatedAt: offer.showsAvailability ? availability?.changedAt ?? null : null, stale: offer.showsAvailability ? stale : false },
    leadTimeDays: view.leadTimeDays ?? null, zone: view.zone ?? null,
    actions: { contact: await contactEnabledForShop(ctx, live.shop._id, context.network?._id ?? context.root._id), quote: false, purchase: false },
    ...(facets ? { facets: catalogFacetsDto(facets) } : {}),
    ...(serviceProfile ? { serviceProfile: catalogServiceProfileDto(serviceProfile) } : {}),
  }
}

/** Relecture intégrale d'un candidat global ; les champs de recherche n'accordent aucun droit. */
export async function projectCatalogHead(ctx: CatalogReadCtx, context: CatalogReadContext, head: Doc<"commerceCatalogHeads">): Promise<CatalogOffer | null> {
  const live = await contextFor(ctx, context, head.shopId)
  return live ? await project(ctx, context, head, live) : null
}

export async function resolveCatalogOffer(ctx: ReadCtx, context: CatalogReadContext, shopId: Id<"shops">, offerRef: string): Promise<CatalogOffer | null> {
  if (isDemoOfferRef(offerRef)) return await resolveDemoCatalogOffer(ctx, context, shopId, offerRef)
  if (parseCommerceRef(offerRef)?.kind !== "offer") return null
  const live = await contextFor(ctx, context, shopId)
  if (!live) return null
  const head = await ctx.db.query("commerceCatalogHeads").withIndex("by_emitter_object_sequence", (q) => q.eq("emitterId", live.mapping.emitterId).eq("objectRef", offerRef).eq("sequence", "catalog")).unique()
  return head ? await project(ctx, context, head, live) : null
}

export async function resolvePostOffer(ctx: ReadCtx, post: Doc<"posts">, context: CatalogReadContext): Promise<CatalogOffer | null> {
  const reference = post.commerceOffer
  return post.status === "published" && reference ? await resolveCatalogOffer(ctx, context, reference.shopId, reference.offerRef) : null
}

export async function catalogOfferByHandle(ctx: ReadCtx, context: CatalogReadContext, handle: string, offerRef: string): Promise<CatalogOffer | null> {
  const page = await findPageByHandle(ctx, handle)
  const shop = page ? await shopOfPage(ctx, page._id) : null
  return shop ? await resolveCatalogOffer(ctx, context, shop._id, offerRef) : null
}

type HeadQuery = OrderedQuery<DataModel["commerceCatalogHeads"]>
function invalidCatalog(field: string): never { return fail("invalidArgument", { field }) }

function catalogCandidates(ctx: ReadCtx, shop: Doc<"shops">, filters: NormalizedMarketplaceFilters, collectionRef: string | undefined): HeadQuery {
  let source: HeadQuery
  if (filters.query) source = ctx.db.query("commerceCatalogHeads").withSearchIndex("search_marketplace", q => {
    let search = q.search("searchText", filters.query).eq("networkId", shop.networkId).eq("shopId", shop._id).eq("objectKind", "offer").eq("sequence", "catalog").eq("state", "active").eq("discoveryVersion", MARKETPLACE_DISCOVERY_VERSION).eq("localIndexVersion", CATALOG_LOCAL_INDEX_VERSION)
    if (filters.kind) search = search.eq("kind", filters.kind)
    return search
  })
  else {
    const index = filters.sort === "price_asc" ? "by_catalog_price_asc" : filters.sort === "price_desc" ? "by_catalog_price_desc" : "by_catalog_newest"
    source = ctx.db.query("commerceCatalogHeads").withIndex(index, q => q.eq("networkId", shop.networkId).eq("shopId", shop._id).eq("objectKind", "offer").eq("sequence", "catalog").eq("state", "active").eq("localIndexVersion", CATALOG_LOCAL_INDEX_VERSION)).order(filters.sort === "newest" ? "desc" : "asc")
    source = source.filter(q => q.eq(q.field("discoveryVersion"), MARKETPLACE_DISCOVERY_VERSION))
  }
  if (filters.kind) source = source.filter(q => q.eq(q.field("kind"), filters.kind!))
  if (collectionRef) source = source.filter(q => q.or(...(["collection1", "collection2", "collection3", "collection4", "collection5"] as const).map(key => q.eq(q.field(key), collectionRef))))
  if (filters.category) source = source.filter(q => q.or(...filters.category!.flatMap(category => [q.eq(q.field("category1"), category), q.eq(q.field("category2"), category), q.eq(q.field("category3"), category)])))
  for (const key of ["brand", "material", "color", "audience", "serviceMode"] as const) {
    const values = filters[key]
    if (values) source = source.filter(q => q.or(...values.map(value => q.eq(q.field(key), value))))
  }
  if (filters.minPrice !== undefined) source = source.filter(q => q.and(q.neq(q.field("maxPrice"), undefined), q.gte(q.field("maxPrice"), filters.minPrice!)))
  if (filters.maxPrice !== undefined) source = source.filter(q => q.and(q.neq(q.field("minPrice"), undefined), q.lte(q.field("minPrice"), filters.maxPrice!)))
  return applyServiceDiscoveryFilters(source, filters)
}

function catalogCursor(raw: string | null, scope: string): string | null {
  if (raw === null) return null
  if (!raw || raw.length > 8192) return invalidCatalog("cursor")
  try {
    const cursor: unknown = JSON.parse(raw)
    if (!cursor || typeof cursor !== "object" || Array.isArray(cursor)) return invalidCatalog("cursor")
    const row = cursor as Record<string, unknown>
    if (Object.keys(row).length !== 3 || row.version !== 2 || row.scope !== scope || typeof row.cursor !== "string" || !row.cursor) return invalidCatalog("cursor")
    return row.cursor
  } catch { return invalidCatalog("cursor") }
}

function demoMatches(offer: CatalogOffer, filters: NormalizedMarketplaceFilters, collectionRef?: string): boolean {
  if (!serviceDiscoveryOfferMatches(offer, filters)) return false
  if (filters.kind && filters.kind !== offer.kind || collectionRef && !offer.collections.some(item => item.collectionRef === collectionRef)) return false
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
}

export async function listCatalog(ctx: ReadCtx, context: CatalogReadContext, args: CatalogListArgs): Promise<CatalogList> {
  const filters = marketplaceFiltersOf(args)
  if (!Number.isSafeInteger(args.paginationOpts.numItems) || args.paginationOpts.numItems < 1) return invalidCatalog("paginationOpts")
  if (args.collectionRef && !isDemoCollectionRef(args.collectionRef) && parseCommerceRef(args.collectionRef)?.kind !== "offer_collection") return invalidCatalog("collectionRef")
  const empty: CatalogList = { page: [], isDone: true, continueCursor: "", collections: [], filteredWindow: false }
  const page = await findPageByHandle(ctx, args.handle)
  const shop = page ? await shopOfPage(ctx, page._id) : null
  const demo = shop ? await demoCatalogForShop(ctx, context, shop._id) : null
  const numItems = Math.min(12, args.paginationOpts.numItems)
  if (demo) {
    // Registre fictif fermé (au plus treize offres par activité) : filtrage et tri portent sur toute cette sélection.
    const selected = demo.offers.filter(offer => demoMatches(offer, filters, args.collectionRef))
    if (filters.sort === "newest") selected.sort((a, b) => b.changedAt - a.changedAt)
    if (filters.sort === "price_asc" || filters.sort === "price_desc") selected.sort((a, b) => {
      if (a.price.mode === "quote") return b.price.mode === "quote" ? a.offerRef.localeCompare(b.offerRef) : 1
      if (b.price.mode === "quote") return -1
      const lowA = a.price.mode === "range" ? a.price.minAmount : a.price.amount, lowB = b.price.mode === "range" ? b.price.minAmount : b.price.amount
      const highA = a.price.mode === "range" ? a.price.maxAmount : a.price.amount, highB = b.price.mode === "range" ? b.price.maxAmount : b.price.amount
      return (filters.sort === "price_asc" ? lowA - lowB : highB - highA) || a.offerRef.localeCompare(b.offerRef)
    })
    const scope = await sha256Hex(JSON.stringify(["demo-catalog-v2", context.root._id, context.network?._id ?? null, context.readerPersonId ?? null, shop!._id, filters, args.collectionRef ?? null]))
    const raw = catalogCursor(args.paginationOpts.cursor, scope), offset = raw === null ? 0 : Number(raw)
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > selected.length || raw !== null && String(offset) !== raw) return invalidCatalog("cursor")
    const end = Math.min(selected.length, offset + numItems)
    return { page: selected.slice(offset, end), isDone: end >= selected.length, continueCursor: end < selected.length ? JSON.stringify({ version: 2, scope, cursor: String(end) }) : "", collections: demo.collections, filteredWindow: false }
  }
  if (args.collectionRef && isDemoCollectionRef(args.collectionRef)) return empty
  const live = shop ? await contextFor(ctx, context, shop._id) : null
  if (!live) return empty
  const collections = [...live.parent.collections].sort((a, b) => a.position - b.position || a.collectionRef.localeCompare(b.collectionRef)).map(({ collectionRef, label }) => ({ collectionRef, label }))
  if (args.collectionRef && !collections.some(collection => collection.collectionRef === args.collectionRef)) return { ...empty, collections }
  // Une seule recherche d'index suffit à détecter une tête héritée, même au-delà de la première page.
  const legacy = await ctx.db.query("commerceCatalogHeads").withIndex("by_catalog_newest", q => q.eq("networkId", live.shop.networkId).eq("shopId", live.shop._id).eq("objectKind", "offer").eq("sequence", "catalog").eq("state", "active").eq("localIndexVersion", undefined)).first()
  const oldVersion = await ctx.db.query("commerceCatalogHeads").withIndex("by_catalog_newest", q => q.eq("networkId", live.shop.networkId).eq("shopId", live.shop._id).eq("objectKind", "offer").eq("sequence", "catalog").eq("state", "active").eq("localIndexVersion", 1)).first()
  const indexed = !legacy && !oldVersion
  const index = await ctx.db.query("commerceCatalogIndexes").withIndex("by_network", q => q.eq("networkId", context.root._id)).unique()
  const advanced = !!(filters.query || args.collectionRef || filters.category || filters.brand || filters.material || filters.color || filters.audience || filters.serviceMode || filters.commercialMode || filters.languageCode || filters.serviceZone || filters.minDurationMinutes !== undefined || filters.maxDurationMinutes !== undefined || filters.minPrice !== undefined || filters.maxPrice !== undefined || filters.sort !== "newest")
  if (!indexed && advanced) return { ...empty, collections, indexStatus: "building" }
  const scope = await sha256Hex(JSON.stringify(["catalog-v3", CATALOG_LOCAL_INDEX_VERSION, context.root._id, context.network?._id ?? null, context.readerPersonId ?? null, live.shop._id, live.mapping._id, live.mapping.generation, live.parentHead.activationRevision, index?.generation ?? 0, indexed, filters, args.collectionRef ?? null]))
  const cursor = catalogCursor(args.paginationOpts.cursor, scope)
  let source: HeadQuery
  if (indexed) source = catalogCandidates(ctx, live.shop, filters, args.collectionRef)
  else {
    source = ctx.db.query("commerceCatalogHeads").withIndex("by_network_shop_kind_state_changedAt", q => q.eq("networkId", live.shop.networkId).eq("shopId", live.shop._id).eq("objectKind", "offer").eq("sequence", "catalog").eq("state", "active")).order("desc")
    if (filters.kind) source = source.filter(q => q.eq(q.field("kind"), filters.kind!))
  }
  let window: { page: Doc<"commerceCatalogHeads">[]; isDone: boolean; continueCursor: string }
  try { window = await source.paginate({ cursor, numItems, maximumRowsRead: 128, maximumBytesRead: 1024 * 1024 }) }
  catch (error) { if (cursor !== null) return invalidCatalog("cursor"); throw error }
  const result: CatalogOffer[] = []
  for (const head of window.page) {
    const offer = await project(ctx, context, head, live)
    if (offer) result.push(offer)
  }
  return { page: result, isDone: window.isDone, continueCursor: window.isDone ? "" : JSON.stringify({ version: 2, scope, cursor: window.continueCursor }), collections, filteredWindow: result.length !== window.page.length || !window.isDone && window.page.length === 0, ...(!indexed ? { indexStatus: "building" as const } : {}) }
}

/** Prévisualisation P07 : fenêtre explicite de douze, jamais prétendue exhaustive. */
export async function catalogStorefrontBlocks(ctx: ReadCtx, root: Doc<"networks">, shop: Doc<"shops">, readerPersonId?: Id<"persons">): Promise<Array<"catalog" | "services">> {
  const configuration = effectiveActivityConfiguration(shop.activityConfiguration, shop.model)
  const commercialBlocks = (available: readonly ActivityBlock[]): Array<"catalog" | "services"> => visibleActivityBlocks(configuration, available).filter((block): block is "catalog" | "services" => block === "catalog" || block === "services")
  const demo = await demoCatalogForShop(ctx, { root, readerPersonId }, shop._id)
  if (demo) return commercialBlocks(demo.offers.map((offer) => offer.kind === "service" ? "services" : "catalog"))
  const context = { root, readerPersonId }, live = await contextFor(ctx, context, shop._id)
  if (!live) return []
  const heads = await ctx.db.query("commerceCatalogHeads").withIndex("by_network_shop_kind_state_changedAt", (q) => q.eq("networkId", shop.networkId).eq("shopId", shop._id).eq("objectKind", "offer").eq("sequence", "catalog").eq("state", "active")).order("desc").take(12)
  const available = new Set<ActivityBlock>()
  for (const head of heads) {
    const offer = await project(ctx, context, head, live)
    if (offer) available.add(offer.kind === "service" ? "services" : "catalog")
    if (available.size === 2) break
  }
  return commercialBlocks([...available])
}
