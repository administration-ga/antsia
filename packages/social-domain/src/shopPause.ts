/**
 * CM-10 — la BOUTIQUE EN PAUSE (« Fermer temporairement jusqu'au… », plan 08 de la finalisation). Règle pure,
 * partagée par le moteur et les écrans.
 *
 * La pause se LIT : une boutique est en pause tant que son échéance (`pausedUntil`) est dans le futur. Aucune
 * écriture n'a lieu à l'échéance : la boutique rouvre seule. Le vendeur choisit un JOUR de réouverture, jour civil
 * de Libreville (UTC+1 toute l'année) ; la boutique rouvre à minuit, heure de Libreville, au début de ce jour.
 * Pendant la pause, la vitrine reste lisible ; seuls les NOUVEAUX engagements sont refusés (règle `SHOP_PAUSED`).
 */
import { librevilleDay } from "./dailySpecial"

/** Libreville vit à UTC+1 toute l'année. */
const LIBREVILLE_OFFSET_MS = 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000
const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/**
 * Plafond d'une pause : 90 jours après aujourd'hui (Libreville). Choix prudent, à valider par le propriétaire :
 * il couvre des congés annuels ou une saison creuse ; au-delà, retirer la vitrine dit plus honnêtement qu'elle ne
 * vend plus, plutôt qu'une boutique affichée « fermée » pendant des mois.
 */
export const SHOP_PAUSE_MAX_DAYS = 90

/** En pause à cet instant ? Une échéance absente, invalide ou passée : la boutique est ouverte. */
export function isShopPaused(pausedUntil: number | null | undefined, nowMs: number): pausedUntil is number {
  return typeof pausedUntil === "number" && Number.isFinite(pausedUntil) && pausedUntil > nowMs
}

/** L'instant de réouverture d'un jour civil de Libreville (`AAAA-MM-JJ`) : minuit, heure de Libreville, au début de ce jour. */
export function shopPauseReopensAt(day: string): number | null {
  if (!DAY_PATTERN.test(day)) return null
  const midnightUtc = Date.parse(`${day}T00:00:00.000Z`)
  if (!Number.isFinite(midnightUtc) || new Date(midnightUtc).toISOString().slice(0, 10) !== day) return null
  return midnightUtc - LIBREVILLE_OFFSET_MS
}

/** Les jours de réouverture admis à cet instant : de demain jusqu'à `SHOP_PAUSE_MAX_DAYS` jours (jours civils de Libreville). */
export function shopPauseDayBounds(nowMs: number): { min: string; max: string } {
  const today = Date.parse(`${librevilleDay(nowMs)}T00:00:00.000Z`)
  return { min: new Date(today + DAY_MS).toISOString().slice(0, 10), max: new Date(today + SHOP_PAUSE_MAX_DAYS * DAY_MS).toISOString().slice(0, 10) }
}

export type ShopPauseDayCheck =
  | { ok: true; pausedUntil: number }
  | { ok: false; reason: "invalid" | "past" | "too_long" }

/** Le jour de réouverture choisi, jugé à cet instant : `past` avant demain, `too_long` au-delà du plafond. */
export function checkShopPauseDay(day: string, nowMs: number): ShopPauseDayCheck {
  const reopensAt = shopPauseReopensAt(day)
  if (reopensAt === null) return { ok: false, reason: "invalid" }
  const { min, max } = shopPauseDayBounds(nowMs)
  if (day < min) return { ok: false, reason: "past" }
  if (day > max) return { ok: false, reason: "too_long" }
  return { ok: true, pausedUntil: reopensAt }
}

/** Le jour civil de Libreville où la boutique rouvre (pour préremplir le champ de date de l'écran). */
export function shopPauseReopenDay(pausedUntil: number): string {
  return librevilleDay(pausedUntil)
}
