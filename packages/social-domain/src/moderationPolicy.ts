/** Règles pures PA5 : bornes, sanctions et jugement de relecture sans contenu conservé. */
export const MODERATION_SURFACES = ["post", "comment", "groupMessage", "event", "page", "person", "live", "story", "album", "serviceReview", "serviceReviewReply", "commerceOffer", "commerceStorefront", "commercialMessage", "contextualMessage", "professionalProfile", "professionalCollaboration", "editorialVersion", "editorialMedia", "commerceJob", "diasporaAidQuestion", "diasporaAidAnswer", "diasporaAidMission", "diasporaMentorProfile", "diasporaMentoringRequest", "diasporaKitResource", "diasporaJobOffer", "diasporaTalentProfile", "diasporaJobApplication"] as const
export type ModerationSurface = (typeof MODERATION_SURFACES)[number]
export const SANCTION_KINDS = ["warning", "removal", "mute", "suspension", "exclusion"] as const
export type SanctionKind = (typeof SANCTION_KINDS)[number]
export const MODERATION_SCAN_LIMIT = 100
export const MODERATION_MAX_DURATION_MS = 365 * 24 * 60 * 60 * 1000
export const TRANSPARENCY_MIN_CASES = 5

/** Les échéances légales d'une période, comptées par le passage de transparence (SU01d). */
export type LegalDeadlineCounts = { periodEnd: number; generatedAt: number; legalMet?: number; legalMissed?: number; legalAuthors?: number }
/** Ce que `/transparence` en publie : un nombre, ou `null` pour « moins de `TRANSPARENCY_MIN_CASES` ». */
export type LegalDeadlineDisclosure = { met: number | null; missed: number | null }

/**
 * SU01d — les échéances légales tombées pendant une période ne se publient que si la période était
 * close au calcul (aucune échéance encore à venir), et qu'elle en compte au moins
 * `TRANSPARENCY_MIN_CASES` sur autant d'auteurs distincts. Chaque nombre sous le seuil se dit
 * « moins de » (`null`), zéro compris, et la base n'est jamais publiée : aucune inférence par
 * différence (règle des petites cohortes de la transparence et de l'ADR-0011).
 */
export function legalDeadlineDisclosure(row: LegalDeadlineCounts): LegalDeadlineDisclosure | null {
  const { legalMet, legalMissed, legalAuthors } = row
  if (legalMet === undefined || legalMissed === undefined || legalAuthors === undefined || row.generatedAt < row.periodEnd) return null
  if (legalMet + legalMissed < TRANSPARENCY_MIN_CASES || legalAuthors < TRANSPARENCY_MIN_CASES) return null
  return { met: legalMet >= TRANSPARENCY_MIN_CASES ? legalMet : null, missed: legalMissed >= TRANSPARENCY_MIN_CASES ? legalMissed : null }
}

/** L'état des échéances légales d'une période dans l'export de la console d'exploitation. */
export const LEGAL_DEADLINE_STATUSES = ["unmeasured", "suppressed", "disclosed"] as const
export type LegalDeadlineStatus = (typeof LEGAL_DEADLINE_STATUSES)[number]

/**
 * SU01d — ce que l'export des opérateurs dit des échéances légales d'une période : « non mesurée »
 * tant que le second passage n'a pas écrit ses accumulateurs sur une période close au calcul,
 * « masquée » quand `legalDeadlineDisclosure` ne publie rien, « publiée » sinon. L'état n'ajoute
 * aucun nombre à la règle de `/transparence` : ses chiffres restent ceux de la disclosure.
 */
export function legalDeadlineStatus(row: LegalDeadlineCounts): LegalDeadlineStatus {
  if (row.legalMet === undefined || row.legalMissed === undefined || row.legalAuthors === undefined || row.generatedAt < row.periodEnd) return "unmeasured"
  return legalDeadlineDisclosure(row) === null ? "suppressed" : "disclosed"
}

export function normalizeBlockedTerm(value: string): string {
  return value.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().trim().replace(/\s+/g, " ")
}

export function validSanctionDuration(kind: SanctionKind, until: number | undefined, now: number): boolean {
  if (kind === "exclusion") return until === undefined
  if (until === undefined) return kind === "warning" || kind === "removal"
  return Number.isFinite(until) && until > now && until - now <= MODERATION_MAX_DURATION_MS
}

export function isSanctionLive(sanction: { status: string; until?: number }, now: number): boolean {
  return sanction.status === "active" && (sanction.until === undefined || sanction.until > now)
}

export function contentNeedsReview(input: { text: string; preReview: boolean; blockedTerms: readonly string[]; maxLinks: number; recentWrites: number; maxWrites: number }): boolean {
  if (input.preReview || input.recentWrites >= input.maxWrites) return true
  const normalized = normalizeBlockedTerm(input.text)
  if (input.blockedTerms.some((term) => term.length > 0 && normalized.includes(term))) return true
  const links = input.text.match(/(?:https?:\/\/|www\.)\S+/gi)?.length ?? 0
  return links > input.maxLinks
}
