/**
 * CM-09 — ce que décident le bouton « Enregistrer » et l'écran « Mes favoris », hors de tout composant :
 * le texte d'un refus du moteur et le tri d'une page entre offres lisibles et mentions « indisponible ».
 * Aucun import React ni runtime Convex : testé en environnement `node`.
 */
import { engineErrorAppRule, engineErrorCode } from "@antsia/social-contracts/errors"
import type { api } from "@antsia/api/engine"
import type { FunctionReturnType } from "convex/server"

import type { CatalogOffer, CatalogTranslate } from "./catalog-model"

/** Une ligne de « Mes favoris », telle que le moteur la rend (une page de `savedOffers.listMine`). */
export type SavedOfferEntry = FunctionReturnType<typeof api.modules.shops.savedOffers.listMine>["page"][number]

/** Les offres à montrer, dans l'ordre du moteur, et le nombre de lignes qui ne se lisent plus (jamais affichées). */
export function splitSavedOffers(entries: readonly SavedOfferEntry[]): { offers: CatalogOffer[]; unavailable: number } {
  const offers: CatalogOffer[] = []
  let unavailable = 0
  for (const entry of entries) {
    if (entry.kind === "offer") offers.push(entry.offer)
    else unavailable += 1
  }
  return { offers, unavailable }
}

/**
 * Le texte d'un refus : le quota avec sa borne, l'offre qui ne se lit plus, le débit ; sinon un échec
 * générique. `t` est celui de l'espace `shops` ; les codes communs viennent de l'espace `errors`.
 */
export function savedOfferErrorText(error: unknown, t: CatalogTranslate): string {
  const app = engineErrorAppRule(error)
  if (app?.appRule === "saved_offer_quota") return t("saved.errors.saved_offer_quota", app.appParams)
  const code = engineErrorCode(error)
  if (code === "notFound") return t("saved.errors.notFound")
  if (code === "rateLimited" || code === "membershipSuspended" || code === "statusInsufficient") return t(`errors:${code}`)
  return t("saved.errors.failed")
}
