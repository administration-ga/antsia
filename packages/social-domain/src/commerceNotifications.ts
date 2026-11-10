/**
 * P14B (19/10/2026) — avis COMMERCE de la cloche : services P14 (devis, rendez-vous, prestations à
 * tarif fixe) et candidatures P15. Règles PURES, partagées par le moteur et les écrans.
 *
 * - Genres HORS du domaine commun (`NOTIFICATION_KINDS`) : préfixe `commerce_`, aucun nom commun
 *   avec la tranche DIASPORALE ; une cloche qui ne les connaît pas les dit « nouvelle activité ».
 * - Avis du SYSTÈME : ni acteur, ni contenu, ni montant, ni nom de boutique, ni contact. La ligne
 *   porte un genre et une référence ; l'objet est relu avec ses gardes à l'écriture, à la lecture
 *   de la cloche, avant tout transport et à l'ouverture.
 * - Seul un état CONFIRMÉ par PRO.GA (réponse corrélée, relecture, consultation, suivi) fait un
 *   avis, jamais un clic local ; DP39 ajoute un signal neutre de mise à jour À RELIRE, sans état annoncé.
 *   Une transition ne s'annonce qu'une fois (clé `genre|sujet:transition|-`).
 */
import type { CommerceBookingState, CommerceOrderState } from "./commerce/lifecycle"
import type { NotificationCategory } from "./notificationDelivery"

export const COMMERCE_NOTIFICATION_KINDS = [
  /** Signal privé corrélé : la demande doit être relue sous une session actuelle. */
  "commerce_service_followup_updated",
  // Client (demandeur P14) : décisions du PROFESSIONNEL observées chez PRO.GA.
  /** Un devis (première version) est transmis pour sa demande. */
  "commerce_service_quote_received",
  /** Une version révisée du devis est transmise : un nouvel accord serait exigé. */
  "commerce_service_quote_revised",
  /** Le professionnel confirme le rendez-vous retenu (ou le remplacement demandé). */
  "commerce_service_booking_confirmed",
  /** Le professionnel ne retient pas la demande de rendez-vous (ou de changement). */
  "commerce_service_booking_declined",
  /** Le professionnel déplace un rendez-vous ouvert (même rendez-vous, nouvel horaire). */
  "commerce_service_booking_rescheduled",
  /** Le professionnel annule un rendez-vous confirmé. */
  "commerce_service_booking_cancelled",
  /** Le professionnel accepte la commande de prestation (au-delà de « en attente »). */
  "commerce_service_order_accepted",
  /** Le professionnel refuse ou annule la commande de prestation. */
  "commerce_service_order_declined",
  // Équipe habilitée de la boutique : gestes du CLIENT confirmés par PRO.GA.
  /** Un client a accepté un devis (preuve d'acceptation rendue par PRO.GA). */
  "commerce_service_quote_accepted",
  /** Un client a retenu un créneau (demande enregistrée par l'agenda PRO.GA). */
  "commerce_service_booking_held",
  /** Un client a changé son rendez-vous (échange ou remplacement en attente). */
  "commerce_service_booking_client_changed",
  /** Un client a annulé son rendez-vous. */
  "commerce_service_booking_client_cancelled",
  // Candidat P15 : l'état AUTORISÉ de sa candidature, sans motif ni décision détaillée.
  "commerce_job_application_updated",
] as const

export type CommerceNotificationKind = (typeof COMMERCE_NOTIFICATION_KINDS)[number]

/** À qui parle un avis commerce : le client d'une demande, l'équipe habilitée de la boutique, le candidat. */
export const COMMERCE_NOTICE_AUDIENCES = ["client", "team", "candidate"] as const
export type CommerceNoticeAudience = (typeof COMMERCE_NOTICE_AUDIENCES)[number]

/** Le public de CHAQUE genre : un genre ajouté sans public ne compile pas. */
export const COMMERCE_NOTICE_AUDIENCE: Readonly<Record<CommerceNotificationKind, CommerceNoticeAudience>> = Object.freeze({
  commerce_service_followup_updated: "client",
  commerce_service_quote_received: "client",
  commerce_service_quote_revised: "client",
  commerce_service_booking_confirmed: "client",
  commerce_service_booking_declined: "client",
  commerce_service_booking_rescheduled: "client",
  commerce_service_booking_cancelled: "client",
  commerce_service_order_accepted: "client",
  commerce_service_order_declined: "client",
  commerce_service_quote_accepted: "team",
  commerce_service_booking_held: "team",
  commerce_service_booking_client_changed: "team",
  commerce_service_booking_client_cancelled: "team",
  commerce_job_application_updated: "candidate",
})

/** Un genre commerce ? Liste fermée, comparée telle quelle (aucune clé héritée). */
export function isCommerceNotificationKind(kind: string): kind is CommerceNotificationKind {
  return (COMMERCE_NOTIFICATION_KINDS as readonly string[]).includes(kind)
}

/**
 * La catégorie de préférences des avis commerce : « messages », comme le contact commercial P10.
 * Aucune catégorie nouvelle : les préférences enregistrées sont des objets fermés à six clés.
 */
export const COMMERCE_NOTIFICATION_CATEGORY: NotificationCategory = "messages"

/** Une transition est une référence ASCII bornée (objet PRO.GA, version, révision), jamais un texte libre. */
const TRANSITION = /^[A-Za-z0-9][A-Za-z0-9:._-]{0,159}$/u

export function isCommerceNoticeTransition(value: string): boolean {
  return TRANSITION.test(value)
}

/** États d'une commande qui valent ACCEPTATION par le professionnel, depuis « en attente ». */
export const COMMERCE_ORDER_ACCEPTED_STATES: readonly CommerceOrderState[] = ["confirmed", "in_progress", "ready", "shipped", "delivered", "completed"]

/** Ce qu'une relecture apprend d'un rendez-vous : référence, état servi, révision, horaire, motif d'annulation. */
export type CommerceNoticeBooking = {
  appointmentRef: string
  state: CommerceBookingState
  /** `null` : instantané PROVISOIRE (réponse à la demande, avant relecture) — aucun déplacement n'en est déduit. */
  revision: number | null
  startAt: number
  endAt: number
  cancellation: "client" | "expired" | "professional" | "rescheduled" | null
}

export type CommerceNoticeOrder = { orderRef: string; state: CommerceOrderState; revision: number }

/** L'état privé d'une demande, tel qu'ANTSIA l'a observé chez PRO.GA (avant ou après une observation). */
export type CommerceServiceObservation = {
  booking: CommerceNoticeBooking | null
  pendingReplacement: CommerceNoticeBooking | null
  order: CommerceNoticeOrder | null
  /** Motif servi ou dérivé d'une relecture (`change_declined`, `change_expired`…) ; jamais un texte libre. */
  reason: string | null
}

export type CommerceClientNotice = { kind: CommerceNotificationKind; transition: string }

const OPEN_BOOKING_STATES: readonly CommerceBookingState[] = ["requested", "confirmed"]

/**
 * Les avis que le CLIENT apprend d'une observation de PRO.GA (relecture d'un rendez-vous,
 * consultation d'une commande) — les décisions du PROFESSIONNEL seulement :
 *  - le geste du client lui-même (changement, annulation) ne lui est jamais annoncé ;
 *  - une expiration de créneau n'est pas un refus (aucun avis : la demande se relit) ;
 *  - un instantané provisoire (révision inconnue) n'annonce aucun déplacement.
 * La transition rendue porte la référence PRO.GA et la révision servie : rejouer la même
 * observation rend la même transition (la porte dédoublonne).
 */
export function commerceServiceObservationNotices(before: CommerceServiceObservation, after: CommerceServiceObservation): CommerceClientNotice[] {
  const notices: CommerceClientNotice[] = []
  const was = before.booking
  const now = after.booking
  if (was !== null && now !== null && was.appointmentRef === now.appointmentRef) {
    const transition = `booking:${now.appointmentRef}:r${now.revision ?? 0}`
    if (was.state === "requested" && now.state === "confirmed") notices.push({ kind: "commerce_service_booking_confirmed", transition })
    else if (was.state === "requested" && now.state === "cancelled_by_pro" && now.cancellation === "professional") notices.push({ kind: "commerce_service_booking_declined", transition })
    else if (was.state === "confirmed" && now.state === "cancelled_by_pro" && now.cancellation === "professional") notices.push({ kind: "commerce_service_booking_cancelled", transition })
    else if (
      OPEN_BOOKING_STATES.includes(was.state) && OPEN_BOOKING_STATES.includes(now.state) &&
      was.revision !== null && now.revision !== null && now.revision > was.revision &&
      (now.startAt !== was.startAt || now.endAt !== was.endAt)
    ) notices.push({ kind: "commerce_service_booking_rescheduled", transition })
  }
  // Remplacement demandé par le client puis TRANCHÉ par le professionnel.
  const pending = before.pendingReplacement
  if (pending !== null && after.pendingReplacement === null) {
    if (now !== null && now.appointmentRef === pending.appointmentRef && now.state === "confirmed") {
      notices.push({ kind: "commerce_service_booking_confirmed", transition: `booking:${pending.appointmentRef}:r${now.revision ?? 0}` })
    } else if (after.reason === "change_declined") {
      notices.push({ kind: "commerce_service_booking_declined", transition: `booking:${pending.appointmentRef}:declined` })
    }
  }
  const order = before.order
  const next = after.order
  if (order !== null && next !== null && order.orderRef === next.orderRef && next.revision >= order.revision && order.state !== next.state) {
    const transition = `order:${next.orderRef}:r${next.revision}`
    if (order.state === "pending" && COMMERCE_ORDER_ACCEPTED_STATES.includes(next.state)) notices.push({ kind: "commerce_service_order_accepted", transition })
    else if (next.state === "cancelled") notices.push({ kind: "commerce_service_order_declined", transition })
  }
  return notices
}
