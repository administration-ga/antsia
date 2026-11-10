// Dupliqué de socle/convex/modules/reseauPersonnel/domain.ts (l. 990-1140) @ ad2e7fdc2 — adaptations : section des évènements isolée dans son module ; `ReseauPersonnelViolation` → `DomainViolation` ; validation du fuseau par `Intl` sans locale imposée.
/**
 * Évènements personnels — règles PURES.
 *
 * L'agenda d'une PERSONNE : un évènement appartient à son organisateur et à ses
 * invités, dans un réseau, jamais à une organisation. L'invitation et la
 * réponse sont LA MÊME LIGNE de participation : `pending` est l'invitation, les
 * trois autres statuts sont des réponses.
 */
import { DomainViolation } from "./violation"

export const PERSONAL_EVENT_TITLE_MIN_LENGTH = 3
export const PERSONAL_EVENT_TITLE_MAX_LENGTH = 120
export const PERSONAL_EVENT_DESCRIPTION_MAX_LENGTH = 2000
export const PERSONAL_EVENT_LOCATION_MAX_LENGTH = 200
/**
 * Borne haute d'une durée (14 jours) : au-delà, ce n'est plus un évènement
 * d'agenda mais une période.
 */
export const PERSONAL_EVENT_MAX_DURATION_MS = 14 * 24 * 60 * 60 * 1000

export const PERSONAL_EVENT_STATUSES = ["scheduled", "cancelled"] as const
export type PersonalEventStatus = (typeof PERSONAL_EVENT_STATUSES)[number]

export const PERSONAL_EVENT_PARTICIPATION_STATUSES = ["pending", "accepted", "declined", "maybe"] as const
export type PersonalEventParticipationStatus = (typeof PERSONAL_EVENT_PARTICIPATION_STATUSES)[number]

/** Les RÉPONSES possibles — `pending` n'en est pas une, c'est l'invitation. */
export const PERSONAL_EVENT_RESPONSES = ["accepted", "declined", "maybe"] as const
export type PersonalEventResponse = (typeof PERSONAL_EVENT_RESPONSES)[number]

export function assertPersonalEventTitle(raw: string): string {
  const title = raw.trim()
  if (title.length < PERSONAL_EVENT_TITLE_MIN_LENGTH || title.length > PERSONAL_EVENT_TITLE_MAX_LENGTH) {
    throw new DomainViolation("EVENT_TITLE_LENGTH", { min: PERSONAL_EVENT_TITLE_MIN_LENGTH, max: PERSONAL_EVENT_TITLE_MAX_LENGTH })
  }
  return title
}

export function assertPersonalEventDescription(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined
  const trimmed = raw.trim()
  if (trimmed.length === 0) return undefined
  if (trimmed.length > PERSONAL_EVENT_DESCRIPTION_MAX_LENGTH) {
    throw new DomainViolation("EVENT_DESCRIPTION_TOO_LONG", { max: PERSONAL_EVENT_DESCRIPTION_MAX_LENGTH })
  }
  return trimmed
}

export function assertPersonalEventLocation(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined
  const trimmed = raw.trim()
  if (trimmed.length === 0) return undefined
  if (trimmed.length > PERSONAL_EVENT_LOCATION_MAX_LENGTH) {
    throw new DomainViolation("EVENT_LOCATION_TOO_LONG", { max: PERSONAL_EVENT_LOCATION_MAX_LENGTH })
  }
  return trimmed
}

/**
 * La fenêtre temporelle : des instants FINIS, une fin STRICTEMENT après le
 * début, une durée bornée. Le passé est PERMIS — consigner a posteriori une
 * rencontre d'hier est un usage d'agenda.
 */
export function assertPersonalEventWindow(input: { startAt: number; endAt: number }): void {
  if (!Number.isFinite(input.startAt) || !Number.isFinite(input.endAt) || input.endAt <= input.startAt) {
    throw new DomainViolation("EVENT_WINDOW_INVALID")
  }
  if (input.endAt - input.startAt > PERSONAL_EVENT_MAX_DURATION_MS) {
    throw new DomainViolation("EVENT_TOO_LONG", { maxDays: PERSONAL_EVENT_MAX_DURATION_MS / (24 * 60 * 60 * 1000) })
  }
}

/**
 * Le fuseau, FIXÉ À LA CRÉATION et jamais réécrit : les instants stockés sont
 * des millisecondes UTC, le fuseau dit comment l'évènement a été PENSÉ. Validé
 * par le moteur `Intl` lui-même : toute liste maintenue à la main serait fausse
 * un jour.
 */
export function assertPersonalEventTimeZone(raw: string): string {
  const timeZone = raw.trim()
  if (timeZone.length === 0 || timeZone.length > 64) throw new DomainViolation("EVENT_TIMEZONE_INVALID")
  try {
    new Intl.DateTimeFormat(undefined, { timeZone })
  } catch {
    throw new DomainViolation("EVENT_TIMEZONE_INVALID")
  }
  return timeZone
}

/**
 * Peut-on RÉPONDRE ? Une ligne à soi, et un évènement non annulé.
 * L'organisateur n'a pas de ligne : il ne se répond pas à lui-même.
 */
export function canRespondToPersonalEvent(input: { eventStatus: PersonalEventStatus; isOwnParticipation: boolean }): boolean {
  return input.eventStatus === "scheduled" && input.isOwnParticipation
}

/**
 * EV-03 (issue antsia#97) — le MOTIF d'annulation d'un événement de PAGE, pris dans une liste
 * FERMÉE, sans texte libre : rien à modérer dans l'urgence (plan 08 de DIASPORALE, décision 2,
 * recommandation reprise telle quelle : lieu indisponible, météo, organisateur empêché, autre).
 * Facultatif (les écrans déjà en ligne annulent sans motif), stocké sur l'événement et lu sur sa
 * fiche avec les droits du lecteur ; JAMAIS recopié dans un avis de la cloche.
 */
export const PAGE_EVENT_CANCELLATION_REASONS = ["venue_unavailable", "weather", "organizer_unavailable", "other"] as const
export type PageEventCancellationReason = (typeof PAGE_EVENT_CANCELLATION_REASONS)[number]

/** Un motif de la liste fermée ? Comparé tel quel : aucune normalisation d'un texte libre. */
export function isPageEventCancellationReason(value: unknown): value is PageEventCancellationReason {
  return typeof value === "string" && (PAGE_EVENT_CANCELLATION_REASONS as readonly string[]).includes(value)
}
