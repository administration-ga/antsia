/**
 * P15 : toute lecture d'emploi rejuge la politique du réseau, le lien vivant
 * (`publish_jobs`), le mapping émetteur/boutique, le parent publié avec la
 * capacité `jobs` et la diffusion publique de la vitrine. Fermé par défaut.
 */
import { parseCommercePublicBody } from "@antsia/social-domain/commerce/projection"

import type { Doc, Id } from "../../_generated/dataModel"
import type { QueryCtx } from "../../_generated/server"
import { publicStorefrontPage } from "./access"
import { liveCatalogMapping } from "./catalogAccess"
import { commerceActivationReady } from "./commerceActivation"

type ReadCtx = Pick<QueryCtx, "db">

export type JobPolicy = { jobs: boolean; applications: boolean }

/** Aucune ligne : emplois et candidatures fermés ; les candidatures exigent aussi les emplois. */
export async function jobPolicyOf(ctx: ReadCtx, networkId: Id<"networks">): Promise<JobPolicy> {
  const row = await ctx.db.query("commerceJobPolicies").withIndex("by_network", (q) => q.eq("networkId", networkId)).unique()
  const jobs = row?.jobsEnabled === true
  return { jobs, applications: commerceActivationReady("applications") && jobs && row?.applicationsEnabled === true }
}

/** Le parent boutique reste celui du catalogue P09 ; le lien doit en plus porter `publish_jobs`. */
export async function liveJobMapping(ctx: ReadCtx, networkId: Id<"networks">, shopId: Id<"shops">) {
  if (!(await jobPolicyOf(ctx, networkId)).jobs) return null
  const live = await liveCatalogMapping(ctx, networkId, shopId)
  if (!live || !live.link.permissions.includes("publish_jobs")) return null
  const emitter = await ctx.db.get(live.mapping.emitterId)
  if (!emitter?.enabled) return null
  return { ...live, emitter }
}

export type LiveJobMapping = NonNullable<Awaited<ReturnType<typeof liveJobMapping>>>

/** Lecture membre ou anonyme : mêmes règles de diffusion explicite que le catalogue public. */
export async function readableJobMapping(ctx: ReadCtx, root: Doc<"networks">, shopId: Id<"shops">, readerPersonId?: Id<"persons">) {
  const shop = await ctx.db.get(shopId)
  if (!shop) return null
  const live = await liveJobMapping(ctx, shop.networkId, shopId)
  if (!live || !await publicStorefrontPage(ctx, root, live.shop, readerPersonId)) return null
  const head = live.parentHead
  if (!head || head.mappingId !== live.mapping._id || head.mappingGeneration !== live.mapping.generation || head.state !== "active") return null
  const parsed = parseCommercePublicBody(head.body, Date.now())
  if (!parsed.ok || !live.emitter.allowedContracts.includes(parsed.value.contract) || (parsed.value.payload.type !== "shop.published" && parsed.value.payload.type !== "shop.updated")) return null
  const parent = parsed.value.payload
  if (parent.linkRef !== live.link.linkRef || !parent.capabilities.includes("jobs")) return null
  return { ...live, parentHead: head, parent }
}

export type ReadableJobMapping = NonNullable<Awaited<ReturnType<typeof readableJobMapping>>>

/** Une ancienne incarnation (mapping, parent republié, contrat retiré de l'émetteur) ne se lit jamais. */
export function jobHeadBelongsToCurrent(head: Doc<"commerceJobHeads">, live: ReadableJobMapping): boolean {
  return head.networkId === live.shop.networkId && head.shopId === live.shop._id && head.mappingId === live.mapping._id &&
    head.mappingGeneration === live.mapping.generation && head.emitterId === live.mapping.emitterId &&
    head.environment === live.mapping.environment && head.shopRef === live.mapping.shopRef &&
    head.parentActivationRevision === live.parentHead.activationRevision && live.emitter.allowedContracts.includes(head.contract)
}
