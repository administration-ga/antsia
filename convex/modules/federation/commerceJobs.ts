/**
 * P15 : application réelle des emplois publics — JOBS-V1 complet, ou `job.*` de
 * PUBLIC-V1 normalisé. Aucune boutique, page, personne ni adhésion créée depuis
 * une charge ; mapping explicite, politique du réseau, lien `publish_jobs` et
 * parent publié avec la capacité `jobs` relus. Révisions monotones, tombes :
 * un ancien événement ne réactive jamais une offre retirée ou close.
 */
import { COMMERCE_JOBS_CONTRACT, commerceJobsEffect, parseCommerceJobsBody, type CommerceJobsEvent } from "@antsia/social-domain/commerce-jobs"
import { commerceCanonicalJson, type CommercePublicContract } from "@antsia/social-domain/commerce/primitives"
import { decideCommercePublicRevision, parseCommercePublicBody } from "@antsia/social-domain/commerce/projection"

import type { Doc } from "../../_generated/dataModel"
import type { MutationCtx } from "../../_generated/server"
import { contentState, moderatePageContentWrite } from "../moderation/policy"
import { liveJobMapping } from "../shops/jobAccess"
import type { FederationApplyResult } from "./reseauPublic"
import { federationBodyDigest } from "./signature"

export type CommerceJobInput = {
  contract: CommercePublicContract | typeof COMMERCE_JOBS_CONTRACT
  objectRef: string
  rawBody: string
  event: CommerceJobsEvent
}

/** JOBS-V1 : corps exact relu avant tout effet (la garde canonique de l'inbox l'a déjà admis). */
export async function applyCommerceJobsEnvelope(ctx: MutationCtx, emitter: Doc<"federationEmitters">, rawBody: string | undefined, now: number): Promise<FederationApplyResult> {
  const parsed = rawBody === undefined ? null : parseCommerceJobsBody(rawBody, now)
  if (!parsed?.ok || rawBody === undefined) return { applied: false, reason: "invalid_payload" }
  return await applyCommerceJob(ctx, emitter, { contract: COMMERCE_JOBS_CONTRACT, objectRef: parsed.value.objectRef, rawBody, event: parsed.value.payload }, now)
}

export async function applyCommerceJob(ctx: MutationCtx, emitter: Doc<"federationEmitters">, input: CommerceJobInput, now: number): Promise<FederationApplyResult> {
  if (!emitter.allowedContracts.includes(input.contract)) return { applied: false, reason: "contract_not_allowed" }
  const event = input.event
  if (event.jobRef !== input.objectRef) return { applied: false, reason: "invalid_payload" }
  const mapping = await ctx.db.query("commerceCatalogMappings").withIndex("by_emitter_shop_ref", (q) => q.eq("emitterId", emitter._id).eq("shopRef", event.shopRef)).unique()
  if (!mapping || mapping.networkId !== emitter.networkId || mapping.environment !== emitter.environment) return { applied: false, reason: "contract_not_allowed" }
  const live = await liveJobMapping(ctx, mapping.networkId, mapping.shopId)
  if (!live || live.mapping._id !== mapping._id || !live.emitter.allowedContracts.includes(input.contract)) return { applied: false, reason: "contract_not_allowed" }
  const effect = commerceJobsEffect(event)
  const previous = await ctx.db.query("commerceJobHeads").withIndex("by_emitter_object", (q) => q.eq("emitterId", emitter._id).eq("objectRef", input.objectRef)).unique()
  if (previous && (previous.networkId !== mapping.networkId || previous.shopId !== mapping.shopId || previous.mappingId !== mapping._id ||
    previous.shopRef !== event.shopRef || previous.environment !== emitter.environment)) return { applied: false, reason: "source_conflict" }
  // Empreinte du modèle NORMALISÉ : la même révision ne peut changer de contenu en changeant de contrat.
  const normalized = commerceCanonicalJson(event)
  if (normalized === null) return { applied: false, reason: "invalid_payload" }
  const digest = await federationBodyDigest(normalized)
  const decision = decideCommercePublicRevision(previous ? { revision: previous.revision, digest: previous.digest, state: previous.state } : null, { revision: effect.revision, digest, effect: effect.effect })
  if (decision.action === "conflict") return { applied: false, reason: "source_conflict" }
  if (decision.action === "stale") return { applied: true }
  const parent = live.parentHead
  const parentActive = !!parent && parent.state === "active" && parent.mappingId === mapping._id && parent.mappingGeneration === mapping.generation
  if (effect.effect === "upsert") {
    if (!parentActive || !parent) return { applied: false, reason: "source_conflict" }
    const parentBody = parseCommercePublicBody(parent.body, now)
    if (!parentBody.ok || !live.emitter.allowedContracts.includes(parentBody.value.contract) || (parentBody.value.payload.type !== "shop.published" && parentBody.value.payload.type !== "shop.updated") || !parentBody.value.payload.capabilities.includes("jobs")) return { applied: false, reason: "contract_not_allowed" }
  }
  const parentActivationRevision = parentActive && parent ? parent.activationRevision : previous?.parentActivationRevision ?? 0
  if (decision.action === "duplicate") {
    // Une ancienne révision ne ressuscite pas après retrait/republication du parent.
    if (previous?.mappingGeneration !== mapping.generation || previous.parentActivationRevision !== parentActivationRevision) return { applied: false, reason: "source_conflict" }
    await ctx.db.patch(previous._id, { receivedAt: now, contract: input.contract, body: input.rawBody })
    return { applied: true }
  }
  const published = event.type === "job.published" ? event : null
  // Close : le dernier contenu publié reste pour un lien connu ; retrait : plus aucun contenu servi.
  const contentJson = published ? normalized : decision.state === "closed" ? previous?.contentJson : undefined
  const fields = {
    networkId: mapping.networkId, shopId: mapping.shopId, mappingId: mapping._id, mappingGeneration: mapping.generation,
    emitterId: emitter._id, environment: emitter.environment, contract: input.contract, objectRef: input.objectRef, shopRef: event.shopRef,
    state: decision.state, ...(event.type === "job.closed" ? { closure: event.reason } : {}),
    revision: effect.revision, digest, body: input.rawBody, ...(contentJson === undefined ? {} : { contentJson }),
    changedAt: event.changedAt, receivedAt: now, parentActivationRevision, gap: (previous?.gap ?? false) || decision.gap,
    ...(published ? { contractType: published.contractType, ...(published.closesOn === undefined ? {} : { closesOn: published.closesOn }) }
      : previous?.contractType === undefined ? {} : { contractType: previous.contractType, ...(previous.closesOn === undefined ? {} : { closesOn: previous.closesOn }) }),
  }
  const headId = previous?._id ?? await ctx.db.insert("commerceJobHeads", fields)
  if (previous) await ctx.db.replace(previous._id, fields)
  if (published && (await contentState(ctx, "commerceJob", headId))?.status !== "removed") {
    await moderatePageContentWrite(ctx, {
      networkId: mapping.networkId, pageId: live.page._id, kind: "commerceJob", id: headId,
      text: [published.title, published.description, published.location ?? "", published.skills.join(" ")].join(" "),
    })
  }
  return { applied: true }
}
