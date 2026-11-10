import { readableStorefrontTerms } from "../shops/storefrontTerms"
/** P07 : vitrine commerciale publique dédiée, sans élargir les pages officielles. */
import { computePageBadge } from "@antsia/social-domain/badges"
import { effectiveActivityConfiguration, visibleActivityBlocks } from "@antsia/social-domain/activityConfiguration"
import { v } from "convex/values"

import { query } from "../../_generated/server"
import { servableUrl } from "../files/storageGuard"
import { findPageByHandle } from "../pages/access"
import { publicStorefrontPage, shopOfPage } from "../shops/access"
import { type PublicDailySpecial, type PublicStorefront, type PublicStorefrontPause, publicDailySpecialValidator, publicStorefrontPauseValidator, publicStorefrontValidator } from "../shops/validators"
import { isShopPaused } from "@antsia/social-domain/shopPause"
import { originDto, publicContext } from "./access"
import { catalogStorefrontBlocks, resolveCatalogOffer } from "../shops/catalogRead"

/** @publicProjection Vitrine consentie, origine/portée/modération/gérants/médias relus, sans identifiant interne ni contact. */
export const getStorefront = query({
  args: { networkId: v.id("networks"), handle: v.string() },
  returns: v.union(publicStorefrontValidator, v.null()),
  handler: async (ctx, args): Promise<PublicStorefront | null> => {
    const context = await publicContext(ctx, args.networkId)
    const page = await findPageByHandle(ctx, args.handle)
    if (!page) return null
    const shop = await shopOfPage(ctx, page._id)
    if (!shop) return null
    const exposed = await publicStorefrontPage(ctx, context.root, shop, context.reader?.personId)
    if (!exposed) return null
    const configuration = effectiveActivityConfiguration(shop.activityConfiguration, shop.model)
    const [logoUrl, bannerUrl] = await Promise.all([
      page.logoStorageId ? servableUrl(ctx, page.logoStorageId) : null,
      page.bannerStorageId ? servableUrl(ctx, page.bannerStorageId) : null,
    ])
    const storefrontTerms = await readableStorefrontTerms(ctx, context.root, shop._id, context.reader?.personId)
    return {
      ...(storefrontTerms ? { storefrontTerms } : {}),
      handle: page.handle,
      name: page.name,
      description: page.description ?? null,
      logoUrl,
      bannerUrl,
      model: shop.model,
      activityConfiguration: configuration,
      specialty: shop.specialty ?? null,
      serviceArea: shop.serviceArea ?? null,
      hours: shop.hours ?? null,
      badge: computePageBadge(page.trust),
      // Catalogue P09 sous sa porte publique ; les publications community restent fermées.
      blocks: visibleActivityBlocks(configuration, [...await catalogStorefrontBlocks(ctx, context.root, shop, context.reader?.personId), "about"]),
      publishedAt: shop.publishedAt ?? shop.updatedAt,
      origin: originDto(exposed.origin),
    }
  },
})

/**
 * @publicProjection SU06 : désignation datée et produit public relu avec ses médias gardés.
 * Le jour n'est pas une autorisation : l'écran n'annonce le plat que pendant ce jour à Libreville,
 * y compris quand aucune écriture ne relance la requête au passage de minuit.
 */
export const getDailySpecial = query({
  args: { networkId: v.id("networks"), handle: v.string() },
  returns: v.union(publicDailySpecialValidator, v.null()),
  handler: async (ctx, args): Promise<PublicDailySpecial | null> => {
    const context = await publicContext(ctx, args.networkId)
    const page = await findPageByHandle(ctx, args.handle)
    const shop = page ? await shopOfPage(ctx, page._id) : null
    if (!shop?.dailySpecial) return null
    const configuration = effectiveActivityConfiguration(shop.activityConfiguration, shop.model)
    if (configuration.template !== "food" || !visibleActivityBlocks(configuration, ["catalog"]).includes("catalog")) return null
    if (!await publicStorefrontPage(ctx, context.root, shop, context.reader?.personId)) return null
    const offer = await resolveCatalogOffer(ctx, { root: context.root, readerPersonId: context.reader?.personId }, shop._id, shop.dailySpecial.offerRef)
    return offer?.kind === "product" ? { version: 1, day: shop.dailySpecial.day, offer } : null
  },
})

/**
 * @publicProjection CM-10 : instant de réouverture d'une vitrine publique en pause, à part du DTO strict de la vitrine
 * (un front ancien l'ignore) ; mêmes conditions que `getStorefront`, `now` arrondi par le serveur de l'écran.
 */
export const getStorefrontPause = query({
  args: { networkId: v.id("networks"), handle: v.string(), now: v.number() },
  returns: v.union(publicStorefrontPauseValidator, v.null()),
  handler: async (ctx, args): Promise<PublicStorefrontPause | null> => {
    const context = await publicContext(ctx, args.networkId)
    if (!Number.isFinite(args.now)) return null
    const page = await findPageByHandle(ctx, args.handle)
    const shop = page ? await shopOfPage(ctx, page._id) : null
    const pausedUntil = shop?.pausedUntil
    if (!shop || !isShopPaused(pausedUntil, args.now)) return null
    if (!await publicStorefrontPage(ctx, context.root, shop, context.reader?.personId)) return null
    return { version: 1, pausedUntil }
  },
})
