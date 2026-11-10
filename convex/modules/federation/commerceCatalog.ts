/** P09 : application réelle du contrat PUBLIC, aucune boutique ni page créée depuis PRO.GA. */
import { isCommercePublicContract, commerceCanonicalJson } from "@antsia/social-domain/commerce/primitives"
import { commercePublicEffect, decideCommercePublicRevision, parseCommercePublicBody } from "@antsia/social-domain/commerce/projection"

import type { Doc } from "../../_generated/dataModel"
import type { MutationCtx } from "../../_generated/server"
import { contentState, moderatePageContentWrite } from "../moderation/policy"
import { commerceOfferModerationText } from "../moderation/commerceOfferText"
import { liveCatalogMapping } from "../shops/catalogAccess"
import { marketplaceIndexFields } from "../shops/marketplaceIndexFields"
import { purgeCatalogHeadMedia, queueCatalogMedia, queueShopCatalogMediaWithdrawal } from "./commerceCatalogMedia"
import { applyCommerceJob } from "./commerceJobs"
import { commerceJobsFromPublic } from "@antsia/social-domain/commerce-jobs"
import type { FederationApplyResult } from "./reseauPublic"
import { federationBodyDigest } from "./signature"

export async function applyCommerceCatalog(ctx: MutationCtx, emitter: Doc<"federationEmitters">, rawBody: string | undefined, now: number): Promise<FederationApplyResult> {
  const parsed = rawBody === undefined ? null : parseCommercePublicBody(rawBody, now)
  if (!parsed?.ok || !isCommercePublicContract(parsed.value.contract)) return { applied: false, reason: "invalid_payload" }
  const envelope = parsed.value, event = envelope.payload
  if (!emitter.allowedContracts.includes(envelope.contract)) return { applied: false, reason: "contract_not_allowed" }
  // P15 : les emplois PUBLIC §5.6 sont normalisés puis appliqués par leur propre handler (têtes distinctes).
  if (event.type === "job.published" || event.type === "job.closed") {
    return rawBody === undefined ? { applied: false, reason: "invalid_payload" }
      : await applyCommerceJob(ctx, emitter, { contract: envelope.contract, objectRef: envelope.objectRef, rawBody, event: commerceJobsFromPublic(event) }, now)
  }
  const mapping = await ctx.db.query("commerceCatalogMappings").withIndex("by_emitter_shop_ref", (q) => q.eq("emitterId", emitter._id).eq("shopRef", event.shopRef)).unique()
  if (!mapping || mapping.networkId !== emitter.networkId || mapping.environment !== emitter.environment) return { applied: false, reason: "contract_not_allowed" }
  const live = await liveCatalogMapping(ctx, mapping.networkId, mapping.shopId)
  if (!live || live.mapping._id !== mapping._id || !live.emitter.allowedContracts.includes(envelope.contract)) return { applied: false, reason: "contract_not_allowed" }
  const shopEvent = event.type === "shop.published" || event.type === "shop.updated" || event.type === "shop.withdrawn"
  if (shopEvent && event.linkRef !== live.link.linkRef) return { applied: false, reason: "consent_required" }
  const effect = commercePublicEffect(event)
  const previous = await ctx.db.query("commerceCatalogHeads").withIndex("by_emitter_object_sequence", (q) => q.eq("emitterId", emitter._id).eq("objectRef", envelope.objectRef).eq("sequence", effect.sequence)).unique()
  if (previous && (previous.networkId !== mapping.networkId || previous.shopId !== mapping.shopId || previous.mappingId !== mapping._id || previous.shopRef !== event.shopRef || previous.environment !== emitter.environment)) return { applied: false, reason: "source_conflict" }
  const digest = await federationBodyDigest(commerceCanonicalJson(event)!)
  const decision = decideCommercePublicRevision(previous ? { revision: previous.revision, digest: previous.digest, state: previous.state } : null, { revision: effect.revision, digest, effect: effect.effect })
  if (decision.action === "conflict") return { applied: false, reason: "source_conflict" }
  if (decision.action === "stale") return { applied: true }
  const parent = live.parentHead
  if (!shopEvent && effect.effect === "upsert" && (!parent || parent.state !== "active" || parent.mappingGeneration !== mapping.generation)) return { applied: false, reason: "source_conflict" }
  const parentBody = parent ? parseCommercePublicBody(parent.body, now) : null
  if (!shopEvent && effect.effect === "upsert" && (!parentBody?.ok || !live.emitter.allowedContracts.includes(parentBody.value.contract) || (parentBody.value.payload.type !== "shop.published" && parentBody.value.payload.type !== "shop.updated") || !parentBody.value.payload.capabilities.includes("catalog"))) return { applied: false, reason: "contract_not_allowed" }
  const parentActivationRevision = shopEvent ? 0 : parent?.activationRevision ?? 0
  // Une ancienne révision enfant ne ressuscite pas après retrait/republication du parent.
  if (decision.action === "duplicate") {
    if (previous?.mappingGeneration !== mapping.generation) return { applied: false, reason: "source_conflict" }
    if (!shopEvent && previous?.parentActivationRevision !== parentActivationRevision) return { applied: false, reason: "source_conflict" }
    // Un nouveau snapshot signé confirme les mêmes valeurs ; une simple
    // redélivrance du même eventId est arrêtée par l'inbox avant ce point.
    if (previous) await ctx.db.patch(previous._id, { receivedAt: now, body: rawBody!, ...marketplaceIndexFields(rawBody!, previous.state, previous.objectKind, previous.sequence, now) })
    if (previous?.objectKind === "offer" && previous.state === "active" && previous.sequence === "catalog") await queueCatalogMedia(ctx, previous._id)
    return { applied: true }
  }
  if (previous) await purgeCatalogHeadMedia(ctx, previous)
  const offer = event.type === "offer.published" || event.type === "offer.updated" ? event : null
  const enablesCatalog = (event.type === "shop.published" || event.type === "shop.updated") && event.capabilities.includes("catalog")
  const previousBody = shopEvent && previous ? parseCommercePublicBody(previous.body, now) : null
  const wasCatalogEnabled = previousBody?.ok && (previousBody.value.payload.type === "shop.published" || previousBody.value.payload.type === "shop.updated") && previousBody.value.payload.capabilities.includes("catalog")
  const fields = {
    networkId: mapping.networkId, shopId: mapping.shopId, mappingId: mapping._id, mappingGeneration: mapping.generation,
    emitterId: emitter._id, environment: emitter.environment, objectRef: envelope.objectRef, shopRef: event.shopRef,
    sequence: effect.sequence, objectKind: shopEvent ? "shop" as const : "offer" as const, kind: offer?.kind,
    state: decision.state, revision: effect.revision, digest, body: rawBody!, changedAt: event.changedAt, receivedAt: now,
    activationRevision: shopEvent && decision.state === "active" && (previous?.state !== "active" || previous.mappingGeneration !== mapping.generation || enablesCatalog && !wasCatalogEnabled) ? effect.revision : previous?.activationRevision ?? effect.revision,
    parentActivationRevision, gap: (previous?.gap ?? false) || decision.gap,
    ...marketplaceIndexFields(rawBody!, decision.state, shopEvent ? "shop" : "offer", effect.sequence, now),
  }
  const headId = previous?._id ?? await ctx.db.insert("commerceCatalogHeads", fields)
  if (previous) await ctx.db.replace(previous._id, fields)
  if (shopEvent && (decision.state !== "active" || !enablesCatalog)) await queueShopCatalogMediaWithdrawal(ctx, mapping.networkId, mapping.shopId, fields.activationRevision)
  if ((event.type === "shop.published" || event.type === "shop.updated") && event.storefrontTerms) {
    const terms = event.storefrontTerms
    if ((await contentState(ctx, "commerceStorefront", headId))?.status !== "removed") await moderatePageContentWrite(ctx, { networkId: mapping.networkId, pageId: live.page._id, kind: "commerceStorefront", id: headId, text: [
      ...(terms.pickup?.points.map(point => point.label) ?? []), terms.delivery?.label, ...(terms.delivery?.localities ?? []), ...(terms.fees?.map(fee => fee.label) ?? []), terms.returns?.summary, terms.warranty?.summary,
    ].filter(Boolean).join(" ") })
  }
  if (offer) {
    if ((await contentState(ctx, "commerceOffer", headId))?.status !== "removed") await moderatePageContentWrite(ctx, { networkId: mapping.networkId, pageId: live.page._id, kind: "commerceOffer", id: headId, text: `${offer.title} ${commerceOfferModerationText(offer)}` })
    await queueCatalogMedia(ctx, headId)
  }
  return { applied: true }
}
