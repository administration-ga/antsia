/**
 * Le PLAT DU JOUR d'une adresse « Alimentation et restauration » (étude des sept univers, § 5.4) : une offre de
 * son menu, désignée pour un jour civil de Libreville (UTC+1, sans heure d'été). Le lendemain, plus rien ne
 * l'annonce tant que l'adresse n'en désigne pas un autre. Règle pure, partagée par le serveur et l'application :
 * le serveur date la désignation, l'écran juge si elle vaut encore aujourd'hui (une requête n'est pas relancée
 * au passage de minuit).
 */

/** Libreville vit à UTC+1 toute l'année. */
const LIBREVILLE_OFFSET_MS = 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

export type DailySpecial = Readonly<{ offerRef: string; day: string }>

/** Le jour civil à Libreville (`AAAA-MM-JJ`) d'un instant. */
export function librevilleDay(nowMs: number): string {
  return new Date(nowMs + LIBREVILLE_OFFSET_MS).toISOString().slice(0, 10)
}

/** Minuit à Libreville après ce jour civil ; un jour invalide ne programme aucun réveil. */
export function dailySpecialExpiresAt(day: string | null | undefined): number | null {
  if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return null
  const midnightUtc = Date.parse(`${day}T00:00:00.000Z`)
  if (!Number.isFinite(midnightUtc) || new Date(midnightUtc).toISOString().slice(0, 10) !== day) return null
  return midnightUtc + DAY_MS - LIBREVILLE_OFFSET_MS
}

/** L'offre désignée pour aujourd'hui, ou `null` : un plat d'un autre jour n'est jamais annoncé. */
export function todaysSpecialRef(special: DailySpecial | null | undefined, nowMs: number): string | null {
  return special && special.day === librevilleDay(nowMs) ? special.offerRef : null
}
