/**
 * CM-10 — la BOUTIQUE EN PAUSE, côté moteur : la garde des NOUVEAUX engagements, sans fonction Convex.
 *
 * Une boutique en pause (`shops.pausedUntil` dans le futur, règle pure `isShopPaused`) garde sa vitrine, son
 * catalogue et ses conversations ; elle refuse seulement ce qui CRÉE un engagement nouveau avec elle :
 * préparation de commande (`checkoutFlow.createAttempt`), lancement d'un paiement (`paymentFlow.createStart`),
 * demande de devis, de rendez-vous ou de prestation (`serviceFlow.admit*`), candidature (`jobApplications.apply`).
 * Le refus est la règle du domaine `SHOP_PAUSED`, qui porte l'instant de réouverture (`until`).
 *
 * Deux règles de placement, à chaque appel :
 *  - APRÈS les gardes de lecture de la boutique : à un lecteur qui ne la voit pas, le refus reste indistinct
 *    (`notFound` ou `refused`), la pause d'une vitrine illisible ne se révèle pas ;
 *  - APRÈS le rejeu idempotent (même clé, même intention) et HORS des reprises d'un engagement existant
 *    (reconfirmation d'un total, d'un prix) : ce qui a commencé avant la pause suit son cours.
 */
import { isShopPaused } from "@antsia/social-domain/commerce/shopPause"

import type { Doc, Id } from "../../_generated/dataModel"
import type { QueryCtx } from "../../_generated/server"
import { failRule } from "../../lib/errors"

/** Refuse un nouvel engagement avec cette boutique si elle est en pause à cet instant (instant du serveur). */
export function refuseNewEngagementWhenPaused(shop: Pick<Doc<"shops">, "pausedUntil"> | null, nowMs: number = Date.now()): void {
  if (shop && isShopPaused(shop.pausedUntil, nowMs)) failRule("SHOP_PAUSED", { until: shop.pausedUntil })
}

/** Même garde, relue en base par l'identifiant de la boutique. */
export async function refuseNewEngagementWithShop(ctx: Pick<QueryCtx, "db">, shopId: Id<"shops">): Promise<void> {
  refuseNewEngagementWhenPaused(await ctx.db.get(shopId))
}
