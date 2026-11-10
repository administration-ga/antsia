/**
 * La CONSOLE des boutiques (P07) — l'équipe de la plateforme, opérateur vivant
 * (session IDN forte, accès journalisé). Chaque décision laisse sa ligne dans
 * le journal du moteur (`appendAudit`, cliquet `operator-audit`) :
 *  · la POLITIQUE de publication des vitrines d'un réseau (administrateur de la
 *    plateforme seulement : décision ouverte du propriétaire, ADR-0019) ;
 *  · la FILE D'ADMISSION (politique `review`, ou adhésion déclarée sous
 *    `auto_verified`) : admettre — la page de la boutique naît alors — ou refuser ;
 *  · la SUSPENSION d'une vitrine publiée, et son rétablissement.
 */
import { assertDecisionReason } from "@antsia/social-domain/audit"
import { effectiveActivityConfiguration } from "@antsia/social-domain/activityConfiguration"
import { paginationOptsValidator, type PaginationResult } from "convex/server"
import { v } from "convex/values"

import type { Doc } from "../../_generated/dataModel"
import type { QueryCtx } from "../../_generated/server"
import { effectiveMembershipStatus, getMembership } from "../../lib/access"
import { checked, notFound } from "../../lib/errors"
import { operatorMutation, operatorQuery } from "../../lib/functions"
import { requirePlatformAdmin } from "../../lib/operatorIdentity"
import { enforceRateLimit } from "../../lib/rateLimit"
import { servableUrl } from "../files/storageGuard"
import { miniProfileCache, type PersonMiniProfile } from "../people/miniProfile"
import { appendAudit, operatorCapacity } from "../platform/audit"
import { shopIdentityOf, storefrontPolicyOf } from "./access"
import { admitStorefront, applyStorefrontPolicy, rejectStorefront, setStorefrontSuspended } from "./decisions"
import { type StorefrontReviewItem, storefrontDecisionValidator, storefrontPolicyValidator, storefrontReviewItemValidator, storefrontStateValidator } from "./validators"

/** Lignes de la file, plafond dur. */
const QUEUE_PAGE_MAX = 25

type ReadCtx = Pick<QueryCtx, "db" | "storage">

async function reviewItemOf(ctx: ReadCtx, shop: Doc<"shops">, profileOf: (personId: NonNullable<Doc<"shops">["preparedByPersonId"]>) => Promise<PersonMiniProfile>): Promise<StorefrontReviewItem> {
  const page = shop.pageId ? await ctx.db.get(shop.pageId) : null
  const network = await ctx.db.get(shop.networkId)
  const identity = shopIdentityOf(shop, page)
  let preparer: StorefrontReviewItem["preparer"] = null
  if (shop.preparedByPersonId) {
    const profile = await profileOf(shop.preparedByPersonId)
    const membership = await getMembership(ctx, shop.networkId, shop.preparedByPersonId)
    preparer = { displayName: profile.displayName, handle: profile.handle, membership: effectiveMembershipStatus(membership) }
  }
  return {
    shopId: shop._id,
    networkId: shop.networkId,
    networkSlug: network?.slug ?? "",
    storefront: shop.storefront,
    model: shop.model,
    activityConfiguration: effectiveActivityConfiguration(shop.activityConfiguration, shop.model),
    name: identity.name,
    description: identity.description,
    specialty: shop.specialty ?? null,
    serviceArea: shop.serviceArea ?? null,
    hours: shop.hours ?? null,
    logoUrl: identity.logoStorageId ? await servableUrl(ctx, identity.logoStorageId) : null,
    pageHandle: page?.handle ?? null,
    requestedAt: shop.requestedAt ?? null,
    preparer,
  }
}

/** Console : la politique de publication des vitrines d'un réseau (aucune ligne : fermée). */
export const storefrontPolicy = operatorQuery({
  args: { networkId: v.id("networks") },
  returns: v.object({ policy: storefrontPolicyValidator, updatedAt: v.union(v.number(), v.null()) }),
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("shopNetworkPolicies")
      .withIndex("by_network", (q) => q.eq("networkId", args.networkId))
      .unique()
    return { policy: await storefrontPolicyOf(ctx, args.networkId), updatedAt: row?.updatedAt ?? null }
  },
})

/**
 * Console : RÉGLER la politique d'un réseau — administrateur de la plateforme,
 * motif obligatoire. Fermer retire aussitôt les vitrines de la découverte sans
 * rien effacer ; les demandes en file y restent (elles se refusent, elles ne
 * s'admettent plus tant que la politique est fermée).
 */
export const setStorefrontPolicy = operatorMutation({
  args: { networkId: v.id("networks"), policy: storefrontPolicyValidator, reason: v.string() },
  returns: v.object({ changed: v.boolean() }),
  handler: async (ctx, args) => {
    requirePlatformAdmin(ctx)
    await enforceRateLimit(ctx, "shop.decide", ctx.person._id)
    const motive = checked(() => assertDecisionReason(args.reason, 10))
    const network = await ctx.db.get(args.networkId)
    if (!network || network.status !== "active") return notFound()
    const result = await applyStorefrontPolicy(ctx, network._id, args.policy, ctx.person._id)
    if (!result.changed) return { changed: false }
    await appendAudit(ctx, {
      action: "shop.policy_set",
      capacity: operatorCapacity(ctx.operator),
      actorPersonId: ctx.person._id,
      networkId: network._id,
      subject: { table: "networks", id: network._id },
      details: { reason: motive, previousPolicy: result.previous, policy: args.policy },
    })
    return { changed: true }
  },
})

/** Console : la FILE D'ADMISSION, d'un réseau ou de tous, la plus ancienne demande d'abord. */
export const storefrontQueue = operatorQuery({
  args: { networkId: v.optional(v.id("networks")), paginationOpts: paginationOptsValidator },
  handler: async (ctx, args): Promise<PaginationResult<StorefrontReviewItem>> => {
    const opts = { ...args.paginationOpts, numItems: Math.min(Math.max(Math.trunc(args.paginationOpts.numItems), 1), QUEUE_PAGE_MAX) }
    const networkId = args.networkId
    const result =
      networkId === undefined
        ? await ctx.db
            .query("shops")
            .withIndex("by_storefront_requestedAt", (q) => q.eq("storefront", "pending_review"))
            .order("asc")
            .paginate(opts)
        : await ctx.db
            .query("shops")
            .withIndex("by_network_storefront_requestedAt", (q) => q.eq("networkId", networkId).eq("storefront", "pending_review"))
            .order("asc")
            .paginate(opts)
    const profileOf = miniProfileCache(ctx)
    const page: StorefrontReviewItem[] = []
    for (const shop of result.page) page.push(await reviewItemOf(ctx, shop, profileOf))
    return { ...result, page }
  },
})

/**
 * Console : DÉCIDER d'une demande en file — admettre (la page de la boutique
 * naît si elle n'en a pas ; politique ouverte, préparateur actif) ou refuser
 * (motif rendu aux gérants). Motif obligatoire, ligne d'audit.
 */
export const decideStorefront = operatorMutation({
  args: { shopId: v.id("shops"), decision: storefrontDecisionValidator, reason: v.string() },
  returns: v.object({ storefront: storefrontStateValidator, pageHandle: v.union(v.string(), v.null()) }),
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, "shop.decide", ctx.person._id)
    const motive = checked(() => assertDecisionReason(args.reason, 3))
    const shop = await ctx.db.get(args.shopId)
    if (!shop || shop.storefront !== "pending_review") return notFound()
    const now = Date.now()
    let pageHandle: string | null = null
    let pageCreated = false
    if (args.decision === "admit") {
      const admitted = await admitStorefront(ctx, shop, now)
      pageHandle = admitted.handle
      pageCreated = admitted.pageCreated
    } else {
      await rejectStorefront(ctx, shop, motive, now)
    }
    await appendAudit(ctx, {
      action: "shop.storefront_decide",
      capacity: operatorCapacity(ctx.operator),
      actorPersonId: ctx.person._id,
      networkId: shop.networkId,
      subject: { table: "shops", id: shop._id },
      details: { reason: motive, decision: args.decision, pageCreated },
      at: now,
    })
    return { storefront: args.decision === "admit" ? ("published" as const) : ("rejected" as const), pageHandle }
  },
})

/**
 * Console : SUSPENDRE une vitrine publiée (retrait par l'équipe de la
 * plateforme : elle quitte aussitôt toutes les lectures, rien n'est effacé), ou
 * la RÉTABLIR. Motif obligatoire, ligne d'audit ; les gérants ne lèvent pas une
 * suspension par une nouvelle demande.
 */
export const setStorefrontSuspension = operatorMutation({
  args: { shopId: v.id("shops"), suspended: v.boolean(), reason: v.string() },
  returns: v.object({ storefront: storefrontStateValidator, changed: v.boolean() }),
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, "shop.decide", ctx.person._id)
    const motive = checked(() => assertDecisionReason(args.reason, 10))
    const shop = await ctx.db.get(args.shopId)
    if (!shop) return notFound()
    const now = Date.now()
    const result = await setStorefrontSuspended(ctx, shop, args.suspended, motive, now)
    if (!result.changed) return { storefront: result.storefront, changed: false }
    await appendAudit(ctx, {
      action: "shop.storefront_status_set",
      capacity: operatorCapacity(ctx.operator),
      actorPersonId: ctx.person._id,
      networkId: shop.networkId,
      subject: { table: "shops", id: shop._id },
      details: { reason: motive, previousStorefront: shop.storefront, storefront: result.storefront },
      at: now,
    })
    return { storefront: result.storefront, changed: true }
  },
})
