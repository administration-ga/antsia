// Dupliqué de socle/convex/modules/reseauPersonnel/validators.ts (l. 347-361, motifs et statuts d'un signalement) @ ad2e7fdc2 — adaptations : règles PURES sorties du backend ; transitions d'un dossier explicites (le socle les tenait en ligne dans `decide`) ; bornes de la note du déclarant.
/**
 * Signalements — motifs, statuts, transitions d'un dossier.
 *
 * Un dossier s'ouvre (`open`), peut passer en examen (`reviewing`), et se
 * ferme une fois pour toutes : classé (`dismissed`) ou suivi d'effet
 * (`actioned`, le contenu est retiré). Une décision terminale ne se refait pas :
 * le recours est un autre chemin (PA5).
 */
/**
 * SU01d (21/10/2026) : six motifs ajoutés pour les délais et les interdits de l'ordonnance
 * n° 0011/PR/2026 — `minor_harm`, contenu préjudiciable impliquant un mineur (art. 24) ;
 * `deepfake_of_me`, hypertrucage qui représente le déclarant sans son accord (art. 33) ;
 * `prohibited_ai_content` et `institution_impersonation`, contenus d'IA interdits (art. 32) ;
 * `impersonation`, usurpation d'identité (art. 52) ; `privacy_or_honor`, atteinte à la vie
 * privée ou à l'honneur (contenu illicite, art. 3).
 */
export const CONTENT_REPORT_REASONS = [
  "harassment",
  "minor_harm",
  "hate",
  "violence",
  "sexual_content",
  "deepfake_of_me",
  "prohibited_ai_content",
  "institution_impersonation",
  "impersonation",
  "privacy_or_honor",
  "misinformation",
  "other",
] as const
export type ContentReportReason = (typeof CONTENT_REPORT_REASONS)[number]

export const CONTENT_REPORT_STATUSES = ["open", "reviewing", "dismissed", "actioned"] as const
export type ContentReportStatus = (typeof CONTENT_REPORT_STATUSES)[number]

/** SU01d : le fondement d'un délai légal de traitement, article de l'ordonnance n° 0011/PR/2026. */
export const REPORT_LEGAL_BASES = ["art24", "art32", "art33"] as const
export type ReportLegalBasis = (typeof REPORT_LEGAL_BASES)[number]

const HOUR_MS = 3_600_000

/** Art. 24 : accuser réception sous 24 h. Le moteur l'émet à la transmission même, dans sa transaction. */
export const REPORT_ACKNOWLEDGEMENT_DELAY_MS = 24 * HOUR_MS

/**
 * Le délai de décision par fondement : 72 h pour notifier la décision (art. 24) ; 24 h pour
 * retirer l'hypertrucage d'une personne qui le signale (art. 33), et, par prudence, les autres
 * contenus d'IA interdits (art. 32, passibles du référé immédiat).
 */
export const REPORT_DECISION_DELAY_MS: Readonly<Record<ReportLegalBasis, number>> = Object.freeze({
  art24: 72 * HOUR_MS,
  art32: 24 * HOUR_MS,
  art33: 24 * HOUR_MS,
})

/**
 * Le fondement du délai légal d'un motif, `null` hors délai légal. Tout harcèlement suit
 * l'article 24, mineur ou non : le texte ne dit pas si « impliquant un mineur » vise aussi le
 * cyberharcèlement (analyse SU01).
 */
export function reportLegalBasis(reason: string): ReportLegalBasis | null {
  if (reason === "harassment" || reason === "minor_harm") return "art24"
  if (reason === "deepfake_of_me") return "art33"
  if (reason === "prohibited_ai_content" || reason === "institution_impersonation") return "art32"
  return null
}

/** L'échéance de décision d'un signalement transmis à `createdAt`, `null` hors délai légal. */
export function reportDecisionDueAt(reason: string, createdAt: number): number | null {
  const basis = reportLegalBasis(reason)
  return basis === null ? null : createdAt + REPORT_DECISION_DELAY_MS[basis]
}

/** Le délai de décision d'un fondement, en heures : pour le dire (`/transparence`), jamais pour le calculer. */
export function reportDecisionDelayHours(basis: ReportLegalBasis): number {
  return REPORT_DECISION_DELAY_MS[basis] / HOUR_MS
}

/** Le texte qui fixe ces délais, cité tel quel sur les surfaces publiques. */
export const REPORT_DEADLINES_ORDINANCE = "0011/PR/2026"

/**
 * SU01d — l'issue d'une échéance légale, pour les indicateurs publiés de `/transparence` : tenue
 * si le dossier est tranché (classé ou suivi d'effet) à l'échéance ou avant ; manquée si
 * l'échéance est passée sans décision à temps ; à venir sinon. La décision part au déclarant
 * dans la même transaction : sa date est celle de l'avis.
 */
export const REPORT_DEADLINE_OUTCOMES = ["met", "missed", "pending"] as const
export type ReportDeadlineOutcome = (typeof REPORT_DEADLINE_OUTCOMES)[number]

export function reportDeadlineOutcome(report: { status: ContentReportStatus; dueAt: number; decidedAt: number | null }, now: number): ReportDeadlineOutcome {
  if (isTerminalReportStatus(report.status) && report.decidedAt !== null && report.decidedAt <= report.dueAt) return "met"
  return report.dueAt <= now ? "missed" : "pending"
}

/**
 * Ce que le DÉCLARANT apprend d'un dossier : l'effet sur le contenu, jamais la sanction ni le
 * motif écrit par la modération (ils regardent l'auteur seul).
 */
export const REPORT_OUTCOMES = ["pending", "removed", "actioned", "dismissed"] as const
export type ReportOutcome = (typeof REPORT_OUTCOMES)[number]

export function reportOutcome(status: ContentReportStatus, removedTarget: boolean | undefined): ReportOutcome {
  if (status === "open" || status === "reviewing") return "pending"
  if (status === "dismissed") return "dismissed"
  return removedTarget === true ? "removed" : "actioned"
}

/** Les décisions qu'un modérateur peut prendre sur un dossier. */
export const CONTENT_REPORT_DECISIONS = ["reviewing", "dismissed", "actioned"] as const
export type ContentReportDecision = (typeof CONTENT_REPORT_DECISIONS)[number]

/** La note facultative du déclarant. */
export const CONTENT_REPORT_NOTE_MAX = 1000

/** Un dossier fermé ne se rouvre pas par une décision. */
export function isTerminalReportStatus(status: ContentReportStatus): boolean {
  return status === "dismissed" || status === "actioned"
}

/** La décision est-elle permise depuis ce statut ? Examen : seulement depuis l'ouverture. */
export function canDecideReport(from: ContentReportStatus, to: ContentReportDecision): boolean {
  if (isTerminalReportStatus(from)) return false
  if (to === "reviewing") return from === "open"
  return true
}
