/** P09 : mapping explicite, têtes indépendantes catalogue/disponibilité et médias importés. */
import { COMMERCE_ENVIRONMENTS } from "@antsia/social-domain/commerce/primitives"
import { defineTable } from "convex/server"
import { v } from "convex/values"

import { literals } from "../../lib/validators"
import { catalogKindValidator } from "./catalogValidators"

export const catalogTables = {
  shopCatalogPolicies: defineTable({ networkId: v.id("networks"), enabled: v.boolean(), updatedAt: v.number(), updatedByPersonId: v.optional(v.id("persons")) }).index("by_network", ["networkId"]),
  commerceCatalogMappings: defineTable({
    networkId: v.id("networks"), shopId: v.id("shops"), emitterId: v.id("federationEmitters"), environment: literals(COMMERCE_ENVIRONMENTS),
    shopRef: v.string(), linkRef: v.string(), enabled: v.boolean(), generation: v.number(),
    createdAt: v.number(), updatedAt: v.number(), updatedByPersonId: v.optional(v.id("persons")),
  }).index("by_network_shop", ["networkId", "shopId"]).index("by_emitter_shop_ref", ["emitterId", "shopRef"]),
  commerceCatalogHeads: defineTable({
    networkId: v.id("networks"), shopId: v.id("shops"), mappingId: v.id("commerceCatalogMappings"), mappingGeneration: v.number(),
    emitterId: v.id("federationEmitters"), environment: literals(COMMERCE_ENVIRONMENTS), objectRef: v.string(), shopRef: v.string(),
    sequence: v.union(v.literal("catalog"), v.literal("availability")), objectKind: v.union(v.literal("shop"), v.literal("offer")),
    kind: v.optional(catalogKindValidator), state: v.union(v.literal("active"), v.literal("withdrawn"), v.literal("closed")),
    revision: v.number(), digest: v.string(), body: v.string(), changedAt: v.number(), receivedAt: v.number(),
    activationRevision: v.number(), parentActivationRevision: v.number(), gap: v.boolean(),
    mediaState: v.optional(v.union(v.literal("pending"), v.literal("running"), v.literal("attached"), v.literal("failed"))),
    mediaAttempts: v.optional(v.number()), mediaLeaseToken: v.optional(v.string()), mediaLeaseUntil: v.optional(v.number()), mediaStaged: v.optional(v.array(v.id("_storage"))),
    mediaError: v.optional(v.union(v.literal("configuration"), v.literal("download"), v.literal("obsolete"), v.literal("admission"))),
    localIndexVersion: v.optional(v.union(v.literal(1), v.literal(2))),
    collection1: v.optional(v.string()), collection2: v.optional(v.string()), collection3: v.optional(v.string()), collection4: v.optional(v.string()), collection5: v.optional(v.string()),
    discoveryVersion: v.optional(v.union(v.literal(1), v.literal(2))), searchText: v.optional(v.string()),
    category1: v.optional(v.string()), category2: v.optional(v.string()), category3: v.optional(v.string()),
    brand: v.optional(v.string()), material: v.optional(v.string()), color: v.optional(v.string()),
    audience: v.optional(v.union(v.literal("women"), v.literal("men"), v.literal("kids"), v.literal("unisex"))),
    serviceMode: v.optional(v.union(v.literal("onsite"), v.literal("remote"), v.literal("hybrid"))),
    commercialQuote: v.optional(v.boolean()), commercialBooking: v.optional(v.boolean()), commercialFixedOrder: v.optional(v.boolean()),
    language1: v.optional(v.string()), language2: v.optional(v.string()), language3: v.optional(v.string()), language4: v.optional(v.string()), language5: v.optional(v.string()), language6: v.optional(v.string()),
    serviceZone1: v.optional(v.string()), serviceZone2: v.optional(v.string()), serviceZone3: v.optional(v.string()), serviceZone4: v.optional(v.string()), serviceZone5: v.optional(v.string()), serviceZone6: v.optional(v.string()), serviceZone7: v.optional(v.string()), serviceZone8: v.optional(v.string()),
    durationMinutes: v.optional(v.number()),
    minPrice: v.optional(v.number()), maxPrice: v.optional(v.number()), priceAsc: v.optional(v.number()), priceDesc: v.optional(v.number()),
  }).index("by_emitter_object_sequence", ["emitterId", "objectRef", "sequence"])
    .index("by_network_shop_kind_state_changedAt", ["networkId", "shopId", "objectKind", "sequence", "state", "changedAt"])
    .index("by_catalog_newest", ["networkId", "shopId", "objectKind", "sequence", "state", "localIndexVersion", "changedAt"])
    .index("by_catalog_price_asc", ["networkId", "shopId", "objectKind", "sequence", "state", "localIndexVersion", "priceAsc"])
    .index("by_catalog_price_desc", ["networkId", "shopId", "objectKind", "sequence", "state", "localIndexVersion", "priceDesc"])
    .index("by_media_state", ["mediaState"])
    .index("by_marketplace_kind_newest", ["objectKind", "sequence", "state", "discoveryVersion", "kind", "changedAt"])
    .index("by_marketplace_kind_price_asc", ["objectKind", "sequence", "state", "discoveryVersion", "kind", "priceAsc"])
    .index("by_marketplace_kind_price_desc", ["objectKind", "sequence", "state", "discoveryVersion", "kind", "priceDesc"])
    .index("by_marketplace_newest", ["objectKind", "sequence", "state", "discoveryVersion", "changedAt"])
    .index("by_marketplace_price_asc", ["objectKind", "sequence", "state", "discoveryVersion", "priceAsc"])
    .index("by_marketplace_price_desc", ["objectKind", "sequence", "state", "discoveryVersion", "priceDesc"])
    .searchIndex("search_marketplace", { searchField: "searchText", filterFields: ["objectKind", "sequence", "state", "discoveryVersion", "kind", "networkId", "shopId", "localIndexVersion"] }),
  /** État collectif d'une construction bornée : ni titulaire personnel ni secret. */
  commerceCatalogIndexes: defineTable({
    networkId: v.id("networks"), version: v.optional(v.literal(2)), generation: v.number(), status: v.union(v.literal("building"), v.literal("ready")), cursor: v.optional(v.string()), updatedAt: v.number(),
  }).index("by_network", ["networkId"]),
  commerceCatalogMediaAssets: defineTable({
    networkId: v.id("networks"), headId: v.id("commerceCatalogHeads"), revision: v.number(), digest: v.string(),
    index: v.number(), publicToken: v.string(), storageId: v.id("_storage"), createdAt: v.number(),
  }).index("by_head", ["headId"]).index("by_public_token", ["publicToken"]).index("by_storage", ["storageId"]),
}
