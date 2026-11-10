/** SU06 : une Story référence une désignation vivante, sans s'approprier le catalogue. */
import { effectiveActivityConfiguration, visibleActivityBlocks } from "@antsia/social-domain/activityConfiguration"
import { dailySpecialExpiresAt, librevilleDay } from "@antsia/social-domain/dailySpecial"

import type { Doc, Id } from "../../_generated/dataModel"
import type { MutationCtx } from "../../_generated/server"
import { managedShopOrNull } from "../shops/access"
import { resolveCatalogOffer, type CatalogReadContext, type CatalogReadCtx } from "../shops/catalogRead"
import type { CatalogOffer } from "../shops/catalogValidators"

export type DailySpecialReference = Extract<Doc<"stories">["media"], { kind: "daily_special" }>
export type DailySpecialDto = { shopHandle: string; shopName: string; offerRef: string; title: string; price: CatalogOffer["price"]; day: string }
export type DailySpecialSource = {
  reference: DailySpecialReference
  dailySpecial: DailySpecialDto
  media: { url: string; withheld: null; kind: "image"; mimeType: string; width?: number; height?: number }
  expiresAt: number
}

/** L'auteur doit toujours gérer l'adresse ; chaque lecteur repasse les gardes publiques du catalogue. */
export async function resolveDailySpecialSource(ctx: CatalogReadCtx, context: CatalogReadContext & { network: Doc<"networks"> }, input: { shopId: Id<"shops">; authorPersonId: Id<"persons">; now: number; reference?: DailySpecialReference }): Promise<DailySpecialSource | null> {
  if (!Number.isFinite(input.now)) return null
  const managed = await managedShopOrNull(ctx, context.network._id, input.authorPersonId, input.shopId)
  if (!managed?.page) return null
  const { shop, page } = managed
  const configuration = effectiveActivityConfiguration(shop.activityConfiguration, shop.model)
  if (configuration.template !== "food" || !visibleActivityBlocks(configuration, ["catalog"]).includes("catalog")) return null
  const designation = shop.dailySpecial
  if (!designation || designation.day !== librevilleDay(input.now)) return null
  const revision = shop.dailySpecialRevision ?? 0
  const reference: DailySpecialReference = { kind: "daily_special", shopId: shop._id, offerRef: designation.offerRef, day: designation.day, revision }
  if (input.reference && (input.reference.shopId !== reference.shopId || input.reference.offerRef !== reference.offerRef || input.reference.day !== reference.day || input.reference.revision !== revision)) return null
  const expiresAt = dailySpecialExpiresAt(designation.day)
  if (expiresAt === null || expiresAt <= input.now) return null
  const offer = await resolveCatalogOffer(ctx, context, shop._id, designation.offerRef)
  if (!offer || offer.kind !== "product") return null
  const image = offer.media.find(item => item.url !== null && item.withheld === null)
  if (!image?.url) return null
  return {
    reference,
    dailySpecial: { shopHandle: page.handle, shopName: page.name, offerRef: offer.offerRef, title: offer.title, price: offer.price, day: designation.day },
    media: { url: image.url, withheld: null, kind: "image", mimeType: "image/*", ...(image.width !== null ? { width: image.width } : {}), ...(image.height !== null ? { height: image.height } : {}) },
    expiresAt,
  }
}

/** Une seule entrée active est créée par la porte atomique ; l'index borne aussi sa fermeture. */
export async function activeDailySpecialStory(ctx: Pick<CatalogReadCtx, "db">, networkId: Id<"networks">, shopId: Id<"shops">, revision: number, now: number): Promise<Doc<"stories"> | null> {
  return await ctx.db.query("stories").withIndex("by_network_daily_special_expiresAt", q => q.eq("networkId", networkId).eq("media.shopId", shopId).eq("media.revision", revision).gt("expiresAt", now)).first()
}

export async function closeDailySpecialStory(ctx: Pick<MutationCtx, "db">, shop: Doc<"shops">, now: number): Promise<void> {
  const story = await activeDailySpecialStory(ctx, shop.networkId, shop._id, shop.dailySpecialRevision ?? 0, now)
  if (story) await ctx.db.patch(story._id, { removedAt: now, expiresAt: now })
}
