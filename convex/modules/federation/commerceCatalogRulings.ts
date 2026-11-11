/**
 * CM-02 : ce que la liste des catégories (`@antsia/social-domain/commerce-prohibited-categories`) fait d'une offre
 * reçue au reflet du catalogue. Aucune fonction Convex ici.
 *
 * INTERDITE : l'offre n'entre ni dans l'index de la marketplace ni dans la vitrine. Une tête déjà reflétée et
 * active sort de l'une et de l'autre : ses médias sont purgés, ses champs d'index retirés, son état passe à
 * `withdrawn` (sa révision et son dernier corps admis restent, pour qu'une révision suivante admise la rétablisse
 * et qu'un ancien instantané ne la ressuscite pas). Le refus est consigné sans contenu
 * (`commerceCatalogCategoryRulings`) et audité ; la lettre morte ne garde pas le corps
 * (`isContentFreeFederationFailure`).
 *
 * RÉGLEMENTÉE : l'offre est reflétée ; la ligne consignée fait passer sa vitrine sous la politique `review`
 * (`shops/decisions.ts`, `storefrontPublicationOutcome`).
 */
import { COMMERCE_CATEGORY_RULES, commerceCategoryRuling, type CommerceCategoryRuling } from "@antsia/social-domain/commerce-prohibited-categories"
import type { CommercePublicEvent } from "@antsia/social-domain/commerce/projection"

import type { Doc, Id } from "../../_generated/dataModel"
import type { MutationCtx } from "../../_generated/server"
import { appendAudit } from "../platform/audit"
import { marketplaceIndexFields } from "../shops/marketplaceIndexFields"
import { purgeCatalogHeadMedia } from "./commerceCatalogMedia"

/** La règle de la liste qui frappe une offre publiée ou mise à jour, ou `null` (autre événement, catégorie hors liste). */
export function catalogOfferCategoryRuling(event: CommercePublicEvent): CommerceCategoryRuling | null {
  if (event.type !== "offer.published" && event.type !== "offer.updated") return null
  return event.facets ? commerceCategoryRuling(event.facets.categoryPath, COMMERCE_CATEGORY_RULES) : null
}

type RulingInput = {
  mapping: Doc<"commerceCatalogMappings">
  emitter: Doc<"federationEmitters">
  objectRef: string
  revision: number
  ruling: CommerceCategoryRuling
  now: number
}

async function recordRuling(ctx: MutationCtx, input: RulingInput, withdrew: boolean): Promise<void> {
  const { mapping, emitter, now } = input
  const existing = await ctx.db.query("commerceCatalogCategoryRulings").withIndex("by_emitter_object", (q) => q.eq("emitterId", emitter._id).eq("objectRef", input.objectRef)).unique()
  const fields = {
    networkId: mapping.networkId, shopId: mapping.shopId, mappingId: mapping._id, mappingGeneration: mapping.generation,
    emitterId: emitter._id, environment: emitter.environment, objectRef: input.objectRef,
    rule: input.ruling.rule, categoryKey: input.ruling.key, listVersion: input.ruling.version, revision: input.revision,
    withdrewReflection: input.ruling.rule === "prohibited" && (withdrew || (existing?.rule === "prohibited" && existing.withdrewReflection)),
    updatedAt: now,
  }
  if (existing) await ctx.db.patch(existing._id, fields)
  else await ctx.db.insert("commerceCatalogCategoryRulings", { ...fields, firstAt: now })
}

/** Refus d'une offre interdite ; retire la tête active déjà reflétée ; consigne et audite, sans contenu. */
export async function refuseProhibitedOffer(ctx: MutationCtx, input: RulingInput & { previous: Doc<"commerceCatalogHeads"> | null }): Promise<void> {
  const { previous, now } = input
  const withdrew = previous !== null && previous.state === "active" && previous.objectKind === "offer" && previous.sequence === "catalog"
  if (withdrew) {
    await purgeCatalogHeadMedia(ctx, previous)
    await ctx.db.patch(previous._id, { state: "withdrawn", receivedAt: now, ...marketplaceIndexFields(previous.body, "withdrawn", "offer", "catalog", now) })
  }
  await recordRuling(ctx, input, withdrew)
  // Une décision du système sur un contenu : aucune personne n'agit, la boutique en est le sujet.
  await appendAudit(ctx, {
    action: "moderation.content_review", capacity: "system", networkId: input.mapping.networkId,
    subject: { table: "shops", id: input.mapping.shopId },
    details: { approve: false, surface: "commerceOffer", rule: "prohibited", categoryKey: input.ruling.key, listVersion: input.ruling.version, offerRef: input.objectRef, revision: input.revision, withdrew },
    at: now,
  })
}

/** Après application d'une révision de l'offre (ou de son retrait) : consigne sa catégorie réglementée, sinon efface la ligne courante. */
export async function settleCatalogOfferRuling(ctx: MutationCtx, input: Omit<RulingInput, "ruling"> & { ruling: CommerceCategoryRuling | null }): Promise<void> {
  if (input.ruling?.rule === "regulated") return await recordRuling(ctx, { ...input, ruling: input.ruling }, false)
  await clearCatalogOfferRuling(ctx, input.emitter._id, input.objectRef)
}

export async function clearCatalogOfferRuling(ctx: MutationCtx, emitterId: Id<"federationEmitters">, objectRef: string): Promise<void> {
  const existing = await ctx.db.query("commerceCatalogCategoryRulings").withIndex("by_emitter_object", (q) => q.eq("emitterId", emitterId).eq("objectRef", objectRef)).unique()
  if (existing) await ctx.db.delete(existing._id)
}
