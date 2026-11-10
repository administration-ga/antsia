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

/** Ce qu'un réseau règle pour une surface : relecture préalable, plafond de liens et cadence (écritures par fenêtre). */
export type ModerationPolicyValues = { readonly preReview: boolean; readonly maxLinks: number; readonly maxWrites: number; readonly windowMs: number }

/**
 * MC-02 — les bornes d'un réglage, celles qu'admet `cases.setPolicy` depuis PA5. La cadence ne dépasse
 * jamais `MODERATION_SCAN_LIMIT` : la garde ne compte pas plus loin (`take(MODERATION_SCAN_LIMIT + 1)`).
 */
export const MODERATION_POLICY_BOUNDS = {
  maxLinks: { min: 0, max: 20 },
  maxWrites: { min: 1, max: MODERATION_SCAN_LIMIT },
  windowMs: { min: 1_000, max: 24 * 60 * 60 * 1000 },
} as const

/**
 * MC-02 (plan 12, décision 3 du propriétaire du 9/11/2026 : « des défauts prudents, relâchés après mesure
 * sur le pilote ; les valeurs exactes sont soumises au propriétaire dans le lot ») — la règle du moteur pour
 * une surface SANS réglage explicite du réseau. Avant MC-02 : pas de relecture, 20 liens (le maximum
 * admis), 100 écritures par minute (le maximum admis, jamais atteint sous les seaux de débit). Proposées,
 * à valider par le propriétaire :
 * - `preReview: false` : une relecture de tout, sans réglage, retiendrait chaque écriture de chaque membre
 *   (publications, commentaires, messages de groupe) ; elle reste un geste explicite du réseau (EXF-AN-30) ;
 * - `maxLinks: 2` : le partage ordinaire porte un lien, parfois deux (l'article et sa source) ; au-delà,
 *   la liste de liens est la signature du spam visé par la « détection simple (fréquence, liens) »
 *   d'EXF-AN-30, et le contenu passe en relecture (il n'est pas refusé). C'est la valeur que les tests PA5
 *   et les réglages des évènements de page employaient déjà ;
 * - `maxWrites: 30` par `windowMs: 60 000` : 30 par minute est la cadence soutenue du seau le plus large
 *   d'une surface modérée (`message.send`, messages de groupe) ; une conversation vive reste publiée, mais
 *   plus de 30 écritures modérées en une minute, toutes surfaces confondues, ne se font qu'en inondant
 *   plusieurs surfaces à la fois.
 * Restent hors de ces défauts : les contenus portés par une page (DG-016) et les avis de prestation, en
 * relecture tant qu'aucun réglage n'est posé ; les contenus de la vague H de DIASPORALE, publiés sans règle
 * tant qu'aucun réglage n'est posé (tranche `diaspora`).
 */
export const MODERATION_POLICY_DEFAULTS: ModerationPolicyValues = Object.freeze({ preReview: false, maxLinks: 2, maxWrites: 30, windowMs: 60_000 })

/** La règle qui s'applique : le réglage explicite du réseau, sinon les défauts prudents du moteur. */
export function effectiveModerationPolicy(policy: ModerationPolicyValues | null | undefined): ModerationPolicyValues {
  return policy ? { preReview: policy.preReview, maxLinks: policy.maxLinks, maxWrites: policy.maxWrites, windowMs: policy.windowMs } : MODERATION_POLICY_DEFAULTS
}

/** Le premier champ hors bornes d'un réglage (entiers seulement), ou `null` s'il est admissible. */
export function moderationPolicyProblem(values: Omit<ModerationPolicyValues, "preReview">): "maxLinks" | "maxWrites" | "windowMs" | null {
  for (const field of ["maxLinks", "maxWrites", "windowMs"] as const) {
    const value = values[field], { min, max } = MODERATION_POLICY_BOUNDS[field]
    if (!Number.isSafeInteger(value) || value < min || value > max) return field
  }
  return null
}

/** Un mot bloqué, une fois normalisé, compte de 2 à 80 caractères ; un réseau en garde 100 actifs au plus. */
export const BLOCKED_TERM_LENGTH = { min: 2, max: 80 } as const
export const BLOCKED_TERMS_ACTIVE_MAX = MODERATION_SCAN_LIMIT

export function normalizeBlockedTerm(value: string): string {
  return value.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().trim().replace(/\s+/g, " ")
}

/** Le mot normalisé s'il est admissible, sinon `null`. */
export function admissibleBlockedTerm(value: string): string | null {
  const term = normalizeBlockedTerm(value)
  return term.length >= BLOCKED_TERM_LENGTH.min && term.length <= BLOCKED_TERM_LENGTH.max ? term : null
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
