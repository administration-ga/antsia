/** P09 : toute lecture rejuge source, politique, boutique et mandat du lien ; fermé par défaut. */
import { isCommercePublicContract } from "@antsia/social-domain/commerce/primitives"
import { parseCommercePublicBody } from "@antsia/social-domain/commerce/projection"
import { federationEnvironment } from "@antsia/social-domain/federationProtocol"

import type { Doc, Id } from "../../_generated/dataModel"
import type { QueryCtx } from "../../_generated/server"
import { publicStorefrontPage } from "./access"
import { liveShopCommerceLink } from "./commerceLinkLifecycle"

type ReadCtx = Pick<QueryCtx, "db">

export async function catalogPolicyOpen(ctx: ReadCtx, networkId: Id<"networks">): Promise<boolean> {
  return (await ctx.db.query("shopCatalogPolicies").withIndex("by_network", (q) => q.eq("networkId", networkId)).unique())?.enabled === true
}

export async function liveCatalogMapping(ctx: ReadCtx, networkId: Id<"networks">, shopId: Id<"shops">) {
  if (!await catalogPolicyOpen(ctx, networkId)) return null
  const mapping = await ctx.db.query("commerceCatalogMappings").withIndex("by_network_shop", (q) => q.eq("networkId", networkId).eq("shopId", shopId)).unique()
  if (!mapping?.enabled || mapping.environment !== federationEnvironment(process.env.FEDERATION_ENVIRONMENT)) return null
  const link = await liveShopCommerceLink(ctx, networkId, shopId)
  if (!link || link.environment !== mapping.environment || link.shopRef !== mapping.shopRef || link.linkRef !== mapping.linkRef || !link.permissions.includes("publish_catalog")) return null
  const emitter = await ctx.db.get(mapping.emitterId)
  const network = await ctx.db.get(networkId)
  if (!network || network.status !== "active" || !emitter?.enabled || emitter.environment !== mapping.environment || emitter.networkId !== networkId || !emitter.allowedContracts.some(isCommercePublicContract)) return null
  const shop = await ctx.db.get(shopId)
  const page = shop?.pageId ? await ctx.db.get(shop.pageId) : null
  if (!shop || !page || page._id !== link.pageId) return null
  const parentHead = await ctx.db.query("commerceCatalogHeads").withIndex("by_emitter_object_sequence", (q) => q.eq("emitterId", emitter._id).eq("objectRef", mapping.shopRef).eq("sequence", "catalog")).unique()
  return { mapping, link, shop, page, parentHead, emitter }
}

/** PUBLIC et membre partagent exactement les règles de diffusion explicite de la vitrine. */
export async function readableCatalogMapping(ctx: ReadCtx, root: Doc<"networks">, shopId: Id<"shops">, readerPersonId?: Id<"persons">) {
  const shop = await ctx.db.get(shopId)
  if (!shop) return null
  const live = await liveCatalogMapping(ctx, shop.networkId, shopId)
  if (!live || !await publicStorefrontPage(ctx, root, live.shop, readerPersonId)) return null
  const head = live.parentHead
  if (!head || head.mappingId !== live.mapping._id || head.mappingGeneration !== live.mapping.generation || head.state !== "active") return null
  const parsed = parseCommercePublicBody(head.body, Date.now())
  if (!parsed.ok || !live.emitter.allowedContracts.includes(parsed.value.contract) || (parsed.value.payload.type !== "shop.published" && parsed.value.payload.type !== "shop.updated") || parsed.value.payload.linkRef !== live.link.linkRef || !parsed.value.payload.capabilities.includes("catalog")) return null
  return { ...live, parentHead: head, parent: parsed.value.payload }
}

/** Aucun accès de membre ni d'anonyme ne suffit à ouvrir une ancienne incarnation. */
export function headBelongsToCurrentCatalog(head: Doc<"commerceCatalogHeads">, live: NonNullable<Awaited<ReturnType<typeof readableCatalogMapping>>>): boolean {
  return head.networkId === live.shop.networkId && head.shopId === live.shop._id && head.mappingId === live.mapping._id && head.mappingGeneration === live.mapping.generation && head.emitterId === live.mapping.emitterId && head.environment === live.mapping.environment && head.shopRef === live.mapping.shopRef && head.parentActivationRevision === live.parentHead.activationRevision
}
