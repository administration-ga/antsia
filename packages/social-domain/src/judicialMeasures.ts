/**
 * SU01h — mesures sur ordre du juge (référé numérique, ordonnance n° 0011/PR/2026, art. 39 à 44).
 *
 * Règles PURES, sans Convex : les sept genres de mesure, les cibles que chacun admet, le plafond de
 * 72 h des mesures de l'article 44, le délai de confirmation par un second opérateur, le rappel de
 * caducité (art. 43), le registre FERMÉ des fonctions qu'une restriction peut couper, les bornes des
 * textes saisis et la conservation après la levée.
 *
 * Décidé par le propriétaire le 9/11/2026 (plan 12, décision 2) : un opérateur exécute TOUT DE SUITE,
 * un second confirme ensuite. Une mesure non confirmée dans le délai ne se lève pas d'elle-même (ce
 * serait désobéir au juge) : la console la signale en alerte.
 *
 * Ce module n'est pas un avis juridique : les valeurs marquées « à valider » attendent le propriétaire
 * et l'arbitrage A12 du juriste (`SU01_CONFORMITE_ORDONNANCE_0011.md`, § 3).
 */
import { REPORT_DECISION_DELAY_MS } from "./moderation"
import { MODERATION_MAX_DURATION_MS, MODERATION_SURFACES, type ModerationSurface } from "./moderationPolicy"

const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS

/**
 * Les sept genres (art. 42 et 44) : suspendre un compte (une personne, ou une page), suspendre un
 * contenu, déréférencer (recherche, Découvrir, lectures publiques, sans rien supprimer), épingler un
 * correctif, apposer une étiquette d'origine, restreindre une fonction d'un réseau, suspendre l'accès
 * à un réseau.
 */
export const JUDICIAL_MEASURE_KINDS = ["suspend_account", "suspend_content", "delist", "pin_correction", "origin_label", "restrict_feature", "suspend_access"] as const
export type JudicialMeasureKind = (typeof JUDICIAL_MEASURE_KINDS)[number]

/** Art. 44 : en cas de troubles graves — restriction de fonctions, suspension d'accès —, 72 h au plus. */
export const ARTICLE_44_KINDS = ["restrict_feature", "suspend_access"] as const satisfies readonly JudicialMeasureKind[]
export const ARTICLE_44_MAX_MS = 72 * HOUR_MS

export function isArticle44Kind(kind: JudicialMeasureKind): boolean {
  return (ARTICLE_44_KINDS as readonly string[]).includes(kind)
}

export const JUDICIAL_MEASURE_STATUSES = ["active", "lifted"] as const
export type JudicialMeasureStatus = (typeof JUDICIAL_MEASURE_STATUSES)[number]

/** Une mesure se lève sur geste motivé d'un opérateur (mainlevée, caducité, erreur) ou à son échéance. */
export const JUDICIAL_LIFT_CAUSES = ["operator", "expired"] as const
export type JudicialLiftCause = (typeof JUDICIAL_LIFT_CAUSES)[number]

/** Une cible : un contenu ou un compte de la modération, ou un réseau entier (art. 44). */
export const JUDICIAL_TARGET_KINDS = [...MODERATION_SURFACES, "network"] as const
export type JudicialTargetKind = (typeof JUDICIAL_TARGET_KINDS)[number]

/** Les cibles dont la page publique, le profil ou la carte affichent un correctif ou une étiquette. */
export const JUDICIAL_NOTICE_TARGET_KINDS = ["person", "page", "post"] as const satisfies readonly ModerationSurface[]
export type JudicialNoticeTargetKind = (typeof JUDICIAL_NOTICE_TARGET_KINDS)[number]

/** Les deux mesures qui s'AFFICHENT au-dessus du contenu ou du profil. */
export const JUDICIAL_NOTICE_KINDS = ["pin_correction", "origin_label"] as const satisfies readonly JudicialMeasureKind[]
export type JudicialNoticeKind = (typeof JUDICIAL_NOTICE_KINDS)[number]

const ACCOUNT_TARGETS: readonly JudicialTargetKind[] = ["person", "page"]
const CONTENT_TARGETS: readonly JudicialTargetKind[] = MODERATION_SURFACES.filter((surface) => surface !== "person" && surface !== "page")
const NETWORK_TARGETS: readonly JudicialTargetKind[] = ["network"]

/**
 * Ce que chaque genre vise. Un compte : une personne (suspension racine, qui vaut partout) ou une
 * page (mise hors ligne). Un contenu : tout contenu signalable, page et personne exceptées. Le
 * déréférencement, le correctif et l'étiquette : un profil, une page ou une publication — les seuls
 * objets que la recherche, Découvrir et les lectures publiques référencent. Un réseau pour l'art. 44.
 */
export const JUDICIAL_TARGETS_BY_KIND: Readonly<Record<JudicialMeasureKind, readonly JudicialTargetKind[]>> = Object.freeze({
  suspend_account: ACCOUNT_TARGETS,
  suspend_content: CONTENT_TARGETS,
  delist: JUDICIAL_NOTICE_TARGET_KINDS,
  pin_correction: JUDICIAL_NOTICE_TARGET_KINDS,
  origin_label: JUDICIAL_NOTICE_TARGET_KINDS,
  restrict_feature: NETWORK_TARGETS,
  suspend_access: NETWORK_TARGETS,
})

export function judicialTargetAllowed(kind: JudicialMeasureKind, targetKind: JudicialTargetKind): boolean {
  return JUDICIAL_TARGETS_BY_KIND[kind].includes(targetKind)
}

/**
 * Le registre FERMÉ des fonctions qu'une restriction (art. 44) peut couper pour un réseau. Chaque
 * fonction correspond, côté moteur, à des seaux de débit précis (`convex/lib/rateLimit.ts`) : publier
 * (publications, partages et publications de page), commenter (publications et directs), transférer
 * un message, lancer un direct, publier une Story, déposer un fichier. Liste à valider par le
 * propriétaire.
 */
export const RESTRICTABLE_FEATURES = ["publish", "comment", "forward", "live", "stories", "media_upload"] as const
export type RestrictableFeature = (typeof RESTRICTABLE_FEATURES)[number]

/**
 * Délai de confirmation par un SECOND opérateur, compté depuis l'exécution : 24 h, le délai légal le
 * plus court que le moteur applique déjà (SU01d, art. 33 : décision sous 24 h). À valider par le
 * propriétaire.
 */
export const JUDICIAL_CONFIRMATION_DELAY_MS = REPORT_DECISION_DELAY_MS.art33

/**
 * Art. 43 : la mesure est caduque sans action au fond dans le mois. Le rappel tombe au 28e jour après
 * la date d'effet — le mois le plus court —, pour qu'il ne vienne jamais APRÈS la caducité.
 */
export const JUDICIAL_LAPSE_REMINDER_MS = 28 * DAY_MS

/**
 * Conservation d'une mesure LEVÉE : 90 jours, puis la ligne est purgée ; le journal des décisions
 * garde la preuve minimale (qui, quand, quel genre, quelle référence). Même durée que les pièces des
 * revendications tranchées (PG-01) ; elle couvre la caducité d'un mois. À valider par le propriétaire
 * et le juriste (A12).
 */
export const JUDICIAL_MEASURE_RETENTION_MS = 90 * DAY_MS

/** Borne de sûreté d'une mesure de l'art. 42 : la durée maximale d'une sanction du moteur (365 jours). */
export const JUDICIAL_MEASURE_MAX_MS = MODERATION_MAX_DURATION_MS
/** La date d'effet de l'ordonnance : au plus un mois avant l'exécution, quelques minutes d'avance d'horloge admises. */
export const JUDICIAL_STARTS_AT_MAX_AGE_MS = 31 * DAY_MS
export const JUDICIAL_CLOCK_SKEW_MS = 5 * MINUTE_MS

export const JUDICIAL_ORDER_REFERENCE_MIN = 3
export const JUDICIAL_ORDER_REFERENCE_MAX = 120
export const JUDICIAL_CORRECTION_MIN = 10
export const JUDICIAL_CORRECTION_MAX = 1000
export const JUDICIAL_ORIGIN_LABEL_MIN = 3
export const JUDICIAL_ORIGIN_LABEL_MAX = 160
/** Motif d'ouverture, de confirmation, de levée : dix caractères au moins, comme une suspension. */
export const JUDICIAL_REASON_MIN = 10

export type JudicialMeasureInput = {
  kind: JudicialMeasureKind
  targetKind: JudicialTargetKind
  orderReference: string
  startsAt: number
  endsAt?: number
  feature?: string
  correctionText?: string
  originLabel?: string
}

/** Le premier champ fautif d'une mesure à ouvrir, ou `null` si elle est bien formée. */
export function judicialMeasureProblem(input: JudicialMeasureInput, now: number): string | null {
  if (!judicialTargetAllowed(input.kind, input.targetKind)) return "target"
  const reference = input.orderReference.trim()
  if (reference.length < JUDICIAL_ORDER_REFERENCE_MIN || reference.length > JUDICIAL_ORDER_REFERENCE_MAX || /[\r\n\t]/.test(reference)) return "orderReference"
  if (!Number.isSafeInteger(input.startsAt) || input.startsAt > now + JUDICIAL_CLOCK_SKEW_MS || input.startsAt < now - JUDICIAL_STARTS_AT_MAX_AGE_MS) return "startsAt"
  if (input.endsAt !== undefined) {
    if (!Number.isSafeInteger(input.endsAt) || input.endsAt <= now || input.endsAt <= input.startsAt) return "endsAt"
    if (input.endsAt - input.startsAt > (isArticle44Kind(input.kind) ? ARTICLE_44_MAX_MS : JUDICIAL_MEASURE_MAX_MS)) return "endsAt"
  } else if (isArticle44Kind(input.kind)) return "endsAt"
  const restricts = input.kind === "restrict_feature"
  if (restricts !== (input.feature !== undefined)) return "feature"
  if (restricts && !(RESTRICTABLE_FEATURES as readonly string[]).includes(input.feature ?? "")) return "feature"
  const correction = input.correctionText?.trim()
  if ((input.kind === "pin_correction") !== (correction !== undefined)) return "correctionText"
  if (correction !== undefined && (correction.length < JUDICIAL_CORRECTION_MIN || correction.length > JUDICIAL_CORRECTION_MAX)) return "correctionText"
  const label = input.originLabel?.trim()
  if ((input.kind === "origin_label") !== (label !== undefined)) return "originLabel"
  if (label !== undefined && (label.length < JUDICIAL_ORIGIN_LABEL_MIN || label.length > JUDICIAL_ORIGIN_LABEL_MAX || /[\r\n\t]/.test(label))) return "originLabel"
  return null
}

/** Le plafond d'échéance qu'un formulaire peut proposer pour ce genre et cette date d'effet. */
export function judicialMeasureLatestEnd(kind: JudicialMeasureKind, startsAt: number): number {
  return startsAt + (isArticle44Kind(kind) ? ARTICLE_44_MAX_MS : JUDICIAL_MEASURE_MAX_MS)
}

export type JudicialMeasureTiming = { status: JudicialMeasureStatus; startsAt: number; endsAt?: number; executedAt: number; confirmedAt?: number; meritsActionNotedAt?: number }

/** Vivante : active et non échue (la garde le relit sans attendre le passage de levée). */
export function isJudicialMeasureLive(measure: Pick<JudicialMeasureTiming, "status" | "endsAt">, now: number): boolean {
  return measure.status === "active" && (measure.endsAt === undefined || measure.endsAt > now)
}

export function judicialConfirmationDueAt(measure: Pick<JudicialMeasureTiming, "executedAt">): number {
  return measure.executedAt + JUDICIAL_CONFIRMATION_DELAY_MS
}

/** Active, non confirmée, délai de confirmation passé : l'alerte de la console (aucune levée d'office). */
export function isJudicialConfirmationOverdue(measure: JudicialMeasureTiming, now: number): boolean {
  return isJudicialMeasureLive(measure, now) && measure.confirmedAt === undefined && now >= judicialConfirmationDueAt(measure)
}

export function judicialLapseReminderAt(measure: Pick<JudicialMeasureTiming, "startsAt">): number {
  return measure.startsAt + JUDICIAL_LAPSE_REMINDER_MS
}

/** Art. 43 : active au-delà du 28e jour sans action au fond notée — vérifier la caducité. */
export function isJudicialLapseReminderDue(measure: JudicialMeasureTiming, now: number): boolean {
  return isJudicialMeasureLive(measure, now) && measure.meritsActionNotedAt === undefined && now >= judicialLapseReminderAt(measure)
}
