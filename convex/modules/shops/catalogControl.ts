/** P09 : seule une décision opérateur ouvre politique/mapping ; aucune configuration exécutée ici. */
import { assertDecisionReason } from "@antsia/social-domain/audit"
import { isCommercePublicContract } from "@antsia/social-domain/commerce/primitives"
import { federationEnvironment } from "@antsia/social-domain/federationProtocol"
import { paginationOptsValidator } from "convex/server"
import { v } from "convex/values"

import { checked, fail, notFound } from "../../lib/errors"
import { networkQuery, operatorMutation, operatorQuery } from "../../lib/functions"
import { enforceRateLimit } from "../../lib/rateLimit"
import { isLocalCatalogEmitter, requireCatalogAdmin } from "../federation/access"
import { federationEnvironmentValidator } from "../federation/tables"
import { appendAudit, operatorCapacity } from "../platform/audit"
import { liveShopCommerceLink } from "./commerceLinkLifecycle"
import { requireManagedShop } from "./access"
import { liveCatalogMapping } from "./catalogAccess"

/** Finitions (DP-37) : la décision courante d'un réseau, lue par la console de l'administration de la plateforme seule. */
export const getPolicy = operatorQuery({
  args: { networkId: v.id("networks") },
  returns: v.object({ networkId: v.id("networks"), enabled: v.boolean(), configured: v.boolean(), updatedAt: v.union(v.number(), v.null()) }),
  handler: async (ctx, args) => {
    await requireCatalogAdmin(ctx, ctx, args.networkId)
    if ((await ctx.db.get(args.networkId))?.status !== "active") return notFound()
    const row = await ctx.db.query("shopCatalogPolicies").withIndex("by_network", (q) => q.eq("networkId", args.networkId)).unique()
    return { networkId: args.networkId, enabled: row?.enabled === true, configured: row !== null, updatedAt: row?.updatedAt ?? null }
  },
})

/** Une fenêtre opérateur : identité de la page, liaison vivante et décision courante, sans secret ni catalogue. */
export const paginateMappings = operatorQuery({
  args: { networkId: v.id("networks"), paginationOpts: paginationOptsValidator },
  returns: v.object({
    page: v.array(v.object({
      shopId: v.id("shops"), name: v.union(v.string(), v.null()), handle: v.union(v.string(), v.null()),
      link: v.union(v.null(), v.object({ environment: federationEnvironmentValidator, publishCatalog: v.boolean() })),
      mapping: v.union(v.null(), v.object({ emitterId: v.id("federationEmitters"), emitterSlug: v.union(v.string(), v.null()), enabled: v.boolean(), generation: v.number() })),
    })),
    isDone: v.boolean(), continueCursor: v.string(),
  }),
  handler: async (ctx, args) => {
    await requireCatalogAdmin(ctx, ctx, args.networkId)
    if ((await ctx.db.get(args.networkId))?.status !== "active") return notFound()
    const requested = args.paginationOpts.numItems
    const numItems = Number.isFinite(requested) ? Math.min(20, Math.max(1, Math.floor(requested))) : 20
    const window = await ctx.db.query("shops").withIndex("by_network_storefront_publishedAt", (q) => q.eq("networkId", args.networkId)).paginate({ ...args.paginationOpts, numItems })
    const page = []
    for (const shop of window.page) {
      const identity = shop.pageId ? await ctx.db.get(shop.pageId) : null
      const visiblePage = identity?.networkId === args.networkId && identity.status === "active" ? identity : null
      const link = await liveShopCommerceLink(ctx, args.networkId, shop._id)
      const mapping = await ctx.db.query("commerceCatalogMappings").withIndex("by_network_shop", (q) => q.eq("networkId", args.networkId).eq("shopId", shop._id)).unique()
      const emitter = mapping ? await ctx.db.get(mapping.emitterId) : null
      page.push({
        shopId: shop._id,
        name: visiblePage?.name ?? (shop.pageId ? null : shop.draftName ?? null),
        handle: visiblePage?.handle ?? null,
        link: link ? { environment: link.environment, publishCatalog: link.permissions.includes("publish_catalog") } : null,
        mapping: mapping ? { emitterId: mapping.emitterId, emitterSlug: emitter?.networkId === args.networkId ? emitter.slug : null, enabled: mapping.enabled, generation: mapping.generation } : null,
      })
    }
    return { page, isDone: window.isDone, continueCursor: window.continueCursor }
  },
})

export const setPolicy = operatorMutation({
  args: { networkId: v.id("networks"), enabled: v.boolean(), reason: v.string() }, returns: v.null(),
  handler: async (ctx, args) => {
    await requireCatalogAdmin(ctx, ctx, args.networkId)
    await enforceRateLimit(ctx, "catalog.configure", ctx.person._id)
    const reason = checked(() => assertDecisionReason(args.reason, 10))
    if ((await ctx.db.get(args.networkId))?.status !== "active") return notFound()
    const previous = await ctx.db.query("shopCatalogPolicies").withIndex("by_network", (q) => q.eq("networkId", args.networkId)).unique()
    const fields = { networkId: args.networkId, enabled: args.enabled, updatedAt: Date.now(), updatedByPersonId: ctx.person._id }
    if (previous) await ctx.db.patch(previous._id, fields)
    else await ctx.db.insert("shopCatalogPolicies", fields)
    await appendAudit(ctx, { action: "catalog.policy_set", capacity: operatorCapacity(ctx.operator), actorPersonId: ctx.person._id, networkId: args.networkId, subject: { table: "networks", id: args.networkId }, details: { reason, enabled: args.enabled } })
    return null
  },
})

export const configureMapping = operatorMutation({
  args: { networkId: v.id("networks"), shopId: v.id("shops"), emitterId: v.id("federationEmitters"), enabled: v.boolean(), reason: v.string() }, returns: v.null(),
  handler: async (ctx, args) => {
    const admission = await requireCatalogAdmin(ctx, ctx, args.networkId)
    await enforceRateLimit(ctx, "catalog.configure", ctx.person._id)
    const reason = checked(() => assertDecisionReason(args.reason, 10))
    const shop = await ctx.db.get(args.shopId)
    if (!shop || shop.networkId !== args.networkId) return notFound()
    const previous = await ctx.db.query("commerceCatalogMappings").withIndex("by_network_shop", (q) => q.eq("networkId", args.networkId).eq("shopId", args.shopId)).unique()
    if (admission === "local") {
      const emitter = await ctx.db.get(args.enabled ? args.emitterId : previous?.emitterId ?? args.emitterId)
      if (!isLocalCatalogEmitter(emitter) || emitter?.networkId !== args.networkId) return fail("policyRefused")
    }
    const now = Date.now()
    if (!args.enabled) {
      if (previous) await ctx.db.patch(previous._id, { enabled: false, generation: previous.generation + 1, updatedAt: now, updatedByPersonId: ctx.person._id })
    } else {
      const link = await liveShopCommerceLink(ctx, args.networkId, args.shopId)
      const emitter = await ctx.db.get(args.emitterId)
      if (!link || !link.permissions.includes("publish_catalog") || !emitter?.enabled || emitter.networkId !== args.networkId || emitter.environment !== link.environment || emitter.environment !== federationEnvironment(process.env.FEDERATION_ENVIRONMENT) || !emitter.allowedContracts.some(isCommercePublicContract)) return fail("policyRefused")
      const other = await ctx.db.query("commerceCatalogMappings").withIndex("by_emitter_shop_ref", (q) => q.eq("emitterId", emitter._id).eq("shopRef", link.shopRef)).unique()
      if (other && other._id !== previous?._id) return fail("conflict")
      const fields = { networkId: args.networkId, shopId: args.shopId, emitterId: emitter._id, environment: emitter.environment, shopRef: link.shopRef, linkRef: link.linkRef, enabled: true, generation: (previous?.generation ?? 0) + 1, updatedAt: now, updatedByPersonId: ctx.person._id }
      if (previous) await ctx.db.patch(previous._id, fields)
      else await ctx.db.insert("commerceCatalogMappings", { ...fields, createdAt: now })
    }
    await appendAudit(ctx, { action: "catalog.mapping_set", capacity: operatorCapacity(ctx.operator), actorPersonId: ctx.person._id, networkId: args.networkId, subject: { table: "shops", id: args.shopId }, details: { reason, enabled: args.enabled } })
    return null
  },
})

/** Mesure d'une FENÊTRE, sans compteur national ni parcours caché de tout le catalogue. */
export const syncStatus = networkQuery({
  args: { shopId: v.id("shops") },
  returns: v.object({ available: v.boolean(), sampled: v.number(), truncated: v.boolean(), gapDetected: v.boolean(), latestReceivedAt: v.union(v.number(), v.null()), needsReconciliation: v.boolean() }),
  handler: async (ctx, args) => {
    await requireManagedShop(ctx, { networkId: ctx.networkId, personId: ctx.person._id }, args.shopId)
    const live = await liveCatalogMapping(ctx, ctx.networkId, args.shopId)
    const window = await ctx.db.query("commerceCatalogHeads").withIndex("by_network_shop_kind_state_changedAt", (q) => q.eq("networkId", ctx.networkId).eq("shopId", args.shopId).eq("objectKind", "offer").eq("sequence", "catalog")).order("desc").take(21)
    const sample = window.slice(0, 20), gapDetected = sample.some((head) => head.gap) || live?.parentHead?.gap === true
    const latestReceivedAt = sample.length ? Math.max(...sample.map((head) => head.receivedAt)) : live?.parentHead?.receivedAt ?? null
    return { available: live !== null, sampled: sample.length, truncated: window.length > 20, gapDetected, latestReceivedAt, needsReconciliation: gapDetected || latestReceivedAt === null || Date.now() - latestReceivedAt > 15 * 60 * 1000 }
  },
})
