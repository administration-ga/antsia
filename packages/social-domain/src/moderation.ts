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

/**
 * UM-03 (plan 09, 11/11/2026) — les motifs PROPRES à une nature d'objet : proposés pour elle seule, en tête
 * de sa liste, et refusés par le moteur pour toute autre cible. `CONTENT_REPORT_REASONS` reste la liste
 * proposée pour TOUT objet (et le validateur des publications et commentaires) : un motif d'emploi n'y entre
 * pas, il n'apparaît donc ni sous une publication, ni dans l'application mobile, ni dans DIASPORALE.
 *
 * Poste (`commerceJob`) : `job_fee_requested`, frais demandés au candidat ; `job_impersonation`,
 * usurpation d'une entreprise. AUCUN délai réglementé (`reportLegalBasis` → `null`) : l'art. 24 de
 * l'ordonnance n° 0011/PR/2026 ne vise que le cyberharcèlement et le contenu préjudiciable impliquant un
 * mineur (étude SU01, ligne 24) ; une fausse offre d'emploi n'en relève pas.
 */
export const TARGET_REPORT_REASONS = Object.freeze({
  commerceJob: Object.freeze(["job_fee_requested", "job_impersonation"] as const),
})
export type TargetReportReasonKind = keyof typeof TARGET_REPORT_REASONS
export type TargetReportReason = (typeof TARGET_REPORT_REASONS)[TargetReportReasonKind][number]
/** Tout motif que le registre sait nommer : ceux de tout objet et ceux d'une nature. */
export type KnownReportReason = ContentReportReason | TargetReportReason
/** Les motifs proposés pour une nature d'objet `K` (union distribuée sur les natures). */
export type ReportReasonFor<K extends string> = K extends TargetReportReasonKind ? (typeof TARGET_REPORT_REASONS)[K][number] | ContentReportReason : ContentReportReason

function targetReasonsOf(kind: string): readonly TargetReportReason[] {
  return Object.prototype.hasOwnProperty.call(TARGET_REPORT_REASONS, kind) ? TARGET_REPORT_REASONS[kind as TargetReportReasonKind] : []
}

/** Les motifs proposés pour une nature d'objet : les siens d'abord, puis ceux de tout objet (« autre » en dernier). */
export function reportReasonsFor<K extends string>(kind: K): readonly ReportReasonFor<K>[] {
  // Les motifs propres à une nature n'y entrent que pour elle : la liste a bien le type `ReportReasonFor<K>`,
  // que TypeScript ne sait pas déduire d'un type conditionnel générique.
  return [...targetReasonsOf(kind), ...CONTENT_REPORT_REASONS] as readonly KnownReportReason[] as unknown as readonly ReportReasonFor<K>[]
}

/** Un code que le registre nomme (libellé connu) ; tout autre code se dit tel quel ou « autre ». */
export function isKnownReportReason(reason: string): reason is KnownReportReason {
  return (CONTENT_REPORT_REASONS as readonly string[]).includes(reason) || Object.values(TARGET_REPORT_REASONS).some((reasons) => (reasons as readonly string[]).includes(reason))
}

/** Un motif propre à une nature n'est admis que pour elle ; tout autre code bien formé reste admis (avis, codes historiques). */
export function isReportReasonAllowedFor(reason: string, kind: string): boolean {
  const owners = Object.entries(TARGET_REPORT_REASONS).filter(([, reasons]) => (reasons as readonly string[]).includes(reason)).map(([owner]) => owner)
  return owners.length === 0 || owners.includes(kind)
}

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

/** L'état d'un recours (PA5) : déposé, décision confirmée, décision annulée. */
export type AppealStatus = "open" | "upheld" | "overturned"

/**
 * MD-07 (plan 14 de DIASPORALE, décision 6 du propriétaire ; antsia#99) — ce que l'AUTEUR d'un
 * contenu apprend d'un dossier, ou, pour un contenu sans auteur personnel, le signataire de la page
 * qui le porte : une mesure prise (`actioned` : retrait, avertissement, sourdine, suspension,
 * exclusion), et cette même mesure une fois annulée sur son recours (le dossier repasse alors à
 * `dismissed` et garde le recours `overturned`). Jamais un dossier ouvert ou en examen, jamais un
 * classement sans suite ni une relecture préalable approuvée : dans une conversation à deux ou un
 * petit groupe, apprendre qu'un dossier s'ouvre ou se classe peut désigner la personne qui a
 * signalé. `null` : le dossier ne se montre pas à l'auteur et ne lui est pas annoncé.
 */
export type AuthorDecisionOutcome = "actioned" | "overturned"

export function authorDecisionOutcome(status: ContentReportStatus, appealStatuses: readonly AppealStatus[]): AuthorDecisionOutcome | null {
  if (status === "actioned") return "actioned"
  return status === "dismissed" && appealStatuses.includes("overturned") ? "overturned" : null
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
