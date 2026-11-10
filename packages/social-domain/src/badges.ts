/**
 * Badges de confiance — CALCULÉS, jamais déclarés (cahier §5 invariant 5,
 * §6.4, ADR-0002). Aucun champ de base ne porte un badge comme vérité : on le
 * recalcule à chaque projection à partir des liens d'identité (personnes) et
 * de la nature de la page (pages).
 *
 *   Officiel      page d'institution (fédération, import contractuel, opérateur tracé)
 *   Vérifié       lien IDN de garantie ≥ 2, ou attestation consulaire ; page revendiquée validée
 *   Agent public  lien « administration » vivant (reflet consenti du socle)
 *   Communauté    aucun des précédents
 */

export const BADGES = ["official", "verified", "public_agent", "community"] as const
export type Badge = (typeof BADGES)[number]

export const IDENTITY_PROVIDERS = ["idn", "local", "administration", "consular_attestation"] as const
export type IdentityProvider = (typeof IDENTITY_PROVIDERS)[number]

/** Garde minimale du niveau de garantie IDN pour le badge Vérifié (`loa ≥ 2`). */
export const VERIFIED_MIN_LOA = 2

/**
 * Garde minimale du niveau de garantie IDN pour entrer dans la console d'exploitation (ADR-0039,
 * décision du propriétaire du 22/10/2026). L'habilitation d'opérateur, la session IDN scellée par le
 * callback et sa fraîcheur restent exigées ; le badge Vérifié et les agents publics gardent
 * `VERIFIED_MIN_LOA`.
 */
export const CONSOLE_MIN_LOA = 1

export type IdentityLinkFacts = {
  provider: IdentityProvider
  /** Niveau de garantie IDN (1 à 3), pour `idn` seulement. */
  loa?: number
  revokedAt?: number
}

const isLive = (link: IdentityLinkFacts) => link.revokedAt === undefined

/** Une identité est-elle FORTE (IDN `loa ≥ 2` vivant) ? Sert aussi au statut d'entrée. */
export function hasStrongIdentity(links: readonly IdentityLinkFacts[]): boolean {
  return links.some((link) => isLive(link) && link.provider === "idn" && (link.loa ?? 0) >= VERIFIED_MIN_LOA)
}

/**
 * Badges d'une PERSONNE, dans un ordre stable. Une personne peut être à la fois
 * Vérifiée et Agent public ; « Communauté » n'apparaît que seul.
 */
export function computePersonBadges(links: readonly IdentityLinkFacts[]): Badge[] {
  const badges: Badge[] = []
  const live = links.filter(isLive)
  if (hasStrongIdentity(live) || live.some((link) => link.provider === "consular_attestation")) badges.push("verified")
  if (live.some((link) => link.provider === "administration")) badges.push("public_agent")
  return badges.length > 0 ? badges : ["community"]
}

export const PAGE_TRUST_LEVELS = ["official", "verified", "community"] as const
export type PageTrust = (typeof PAGE_TRUST_LEVELS)[number]

export const PAGE_OWNER_KINDS = ["institution", "association", "company", "media", "community"] as const
export type PageOwnerKind = (typeof PAGE_OWNER_KINDS)[number]

/** Badge d'une PAGE : sa confiance, posée par une décision tracée (jamais par le signataire). */
export function computePageBadge(trust: PageTrust): Badge {
  return trust
}

/** Une page `official` n'est jamais revendicable (EXF-AN-17). */
export function isPageClaimable(trust: PageTrust): boolean {
  return trust !== "official"
}

/**
 * Seule une page d'institution peut être Officiel ; une autre nature plafonne à
 * Vérifié. Protège contre une « association » promue Officiel par erreur.
 */
export function isTrustAllowedForOwner(ownerKind: PageOwnerKind, trust: PageTrust): boolean {
  return trust !== "official" || ownerKind === "institution"
}
