// Dupliqué de socle/convex/modules/reseauPersonnel/tables.ts (l. 1031-1097 : `reseauPersonnel_events`, `…EventParticipants`) @ ad2e7fdc2 — adaptations : `networkId` sur l'évènement et la participation ; personnes ; `participantCount` et `acceptedCount` retirés du document (agrégat `engineCounters`, D02) ; `eventStartAt` OBLIGATOIRE (le chemin hérité est supprimé) ; agenda indexé par réseau (`[networkId, organisateur, startAt]`, `[networkId, personne, eventStartAt]`) ; `by_user_and_status` non recopié (jamais lu).
/**
 * Évènements personnels et collectifs de page. Une page organisatrice ne porte
 * aucun propriétaire personnel ; son créateur n'est qu'une trace d'audit.
 * L'invitation et la réponse sont LA MÊME ligne de participation.
 */
import { PAGE_EVENT_CANCELLATION_REASONS, PERSONAL_EVENT_PARTICIPATION_STATUSES, PERSONAL_EVENT_STATUSES } from "@antsia/social-domain/events"
import { defineTable } from "convex/server"
import { v } from "convex/values"

import { literals } from "../../lib/validators"

export const eventStatusValidator = literals(PERSONAL_EVENT_STATUSES)
export const eventParticipationStatusValidator = literals(PERSONAL_EVENT_PARTICIPATION_STATUSES)
/** EV-03 : motif d'annulation d'un événement de page, liste fermée (aucun texte libre). */
export const pageEventCancellationReasonValidator = literals(PAGE_EVENT_CANCELLATION_REASONS)

export const eventsTables = {
  events: defineTable({
    networkId: v.id("networks"),
    organizerPersonId: v.optional(v.id("persons")),
    organizerPageId: v.optional(v.id("pages")),
    createdByPersonId: v.optional(v.id("persons")),
    pageAudience: v.optional(v.union(v.literal("network"), v.literal("association"))),
    /** DG-023 : absence = sans limite ; réservé aux événements de page. */
    pageCapacity: v.optional(v.number()),
    /** Clôture UTC exclusive ; absence = clôture au début de l'événement. */
    pageRegistrationClosesAt: v.optional(v.number()),
    /** Allocation FIFO monotone, indépendante de la version éditoriale. */
    pageRegistrationSequence: v.optional(v.number()),
    /** Les événements personnels historiques restent à la version implicite 1. */
    version: v.optional(v.number()),
    title: v.string(),
    description: v.optional(v.string()),
    location: v.optional(v.string()),
    startAt: v.number(),
    endAt: v.number(),
    /** Le fuseau FIXÉ à la création — celui dans lequel l'évènement a été pensé. */
    timeZone: v.string(),
    status: eventStatusValidator,
    cancelledAt: v.optional(v.number()),
    /** EV-03 : motif d'annulation d'un événement de PAGE, facultatif ; lu sur la fiche, jamais recopié dans un avis. */
    pageCancellationReason: v.optional(pageEventCancellationReasonValidator),
    /** La publication qui l'annonce : UNE seule (c'est l'idempotence de l'annonce). */
    announcePostId: v.optional(v.id("posts")),
    idempotencyKey: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_organizer_idempotency", ["organizerPersonId", "idempotencyKey"])
    .index("by_network_organizer_startAt", ["networkId", "organizerPersonId", "startAt"])
    .index("by_network_page_startAt", ["networkId", "organizerPageId", "startAt"])
    .index("by_page_idempotency", ["organizerPageId", "idempotencyKey"])
    .index("by_createdByPersonId", ["createdByPersonId"]),

  /** Une ligne par (évènement, personne) : pending = invitation personnelle, ou attente de page avec séquence. */
  eventParticipants: defineTable({
    networkId: v.id("networks"),
    eventId: v.id("events"),
    personId: v.id("persons"),
    invitedByPersonId: v.id("persons"),
    status: eventParticipationStatusValidator,
    /** DG-023 : pending + séquence = attente volontaire d'un événement de page. */
    pageRegistrationSequence: v.optional(v.number()),
    /** Le début de l'évènement, recopié : l'agenda filtre DANS l'index, avant la limite. */
    eventStartAt: v.number(),
    /** Préférence personnelle et jetons de jobs ; aucun contenu ni identité recopiés. */
    pageReminderEnabled: v.optional(v.boolean()),
    pageReminderGeneration: v.optional(v.number()),
    pageReminderScheduledGeneration: v.optional(v.number()),
    pageReminderScheduledForStartAt: v.optional(v.number()),
    pageReminderCompletedGeneration: v.optional(v.number()),
    /** Reçu conservé après retrait/réinscription : au plus un rappel par début. */
    pageReminderRecordedAt: v.optional(v.number()),
    pageReminderRecordedForStartAt: v.optional(v.number()),
    /** Billet QR opaque : seule son empreinte persiste ; version implicite 0. */
    pageAttendanceTokenHash: v.optional(v.string()),
    pageAttendanceTokenExpiresAt: v.optional(v.number()),
    pageAttendanceCheckedInAt: v.optional(v.number()),
    pageAttendanceVersion: v.optional(v.number()),
    createdAt: v.number(),
    respondedAt: v.optional(v.number()),
  })
    .index("by_event_person", ["eventId", "personId"])
    .index("by_event_status", ["eventId", "status"])
    .index("by_event_status_pageRegistrationSequence", ["eventId", "status", "pageRegistrationSequence"])
    .index("by_event_pageAttendanceTokenHash", ["eventId", "pageAttendanceTokenHash"])
    .index("by_event_pageAttendanceCheckedInAt", ["eventId", "pageAttendanceCheckedInAt"])
    .index("by_network_person_eventStartAt", ["networkId", "personId", "eventStartAt"])
    .index("by_invitedByPersonId", ["invitedByPersonId"]),
}
