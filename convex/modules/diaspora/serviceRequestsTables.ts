/**
 * Tables des demandes de service, propositions et rendez-vous DIASPORALE
 * (DG-014/015) — PROPRIÉTAIRE : chantier « demandes et rendez-vous » de la
 * session DIASPORALE ; agrégées par `tables.ts`, donc par `convex/schema.ts`.
 *
 * Mise en relation SEULEMENT : un montant proposé n'est ni encaissé ni facturé
 * par la plateforme. Aucune coordonnée, aucune adresse exacte : le lieu est
 * approximatif (ville, quartier) ou « à distance ». Instants en millisecondes
 * UTC ; le fuseau IANA dit comment l'heure a été pensée.
 *
 * Effacement et export (classement demandé à ANTSIA, `people/dataPolicies.ts`) :
 * `serviceRequests` appartient au DEMANDEUR (`requesterPersonId`) ;
 * `serviceProposals` et `serviceBookings` suivent leur demande (`requestId`) —
 * le signataire auteur d'une proposition parle au nom de la page, il n'en est
 * pas propriétaire (référence anonymisée à son effacement).
 */
import {
  SERVICE_BOOKING_STATUSES,
  SERVICE_PROPOSAL_STATES,
  SERVICE_REQUEST_ACTORS,
  SERVICE_REQUEST_CLOSERS,
  SERVICE_REQUEST_STATUSES,
} from "@diasporale/domain"
import { defineTable } from "convex/server"
import { v } from "convex/values"

import { literals } from "../../lib/validators"

export const serviceRequestStatusValidator = literals(SERVICE_REQUEST_STATUSES)
export const serviceProposalStateValidator = literals(SERVICE_PROPOSAL_STATES)
export const serviceBookingStatusValidator = literals(SERVICE_BOOKING_STATUSES)
export const serviceRequestActorValidator = literals(SERVICE_REQUEST_ACTORS)
export const serviceRequestCloserValidator = literals(SERVICE_REQUEST_CLOSERS)

/** Une fenêtre souhaitée ou un créneau : début inclus, fin exclue (UTC). */
export const serviceWindowValidator = v.object({ startAt: v.number(), endAt: v.number() })

/**
 * SV-03 : un nouvel horaire proposé pour un rendez-vous confirmé — même durée,
 * mêmes conditions — par l'une ou l'autre partie, en attente de l'accord de
 * l'autre jusqu'à son échéance. Aucune référence personnelle : seul le rôle
 * de qui propose est gardé.
 */
export const serviceRescheduleValidator = v.object({
  startAt: v.number(),
  endAt: v.number(),
  timeZone: v.string(),
  proposedBy: serviceRequestActorValidator,
  proposedAt: v.number(),
  expiresAt: v.number(),
})

/** Un lieu APPROXIMATIF (ville, quartier), jamais une adresse ; ou à distance. */
export const serviceLocationValidator = v.union(
  v.object({ mode: v.literal("remote") }),
  v.object({ mode: v.literal("onsite"), area: v.string() }),
)

export const serviceRequestsTables = {
  serviceRequests: defineTable({
    networkId: v.id("networks"),
    /** L'offre demandée, la version LUE par le demandeur et son titre à cet instant. */
    offerId: v.id("serviceOffers"),
    offerVersion: v.number(),
    offerTitle: v.string(),
    /** La page qui propose l'offre : ses signataires VIVANTS répondent. */
    pageId: v.id("pages"),
    requesterPersonId: v.id("persons"),
    /** Le besoin, normalisé, sans coordonnée ni adresse exacte. */
    need: v.string(),
    /** Une à trois fenêtres souhaitées, triées. */
    windows: v.array(serviceWindowValidator),
    /** Le fuseau CANONIQUE du demandeur. */
    timeZone: v.string(),
    /** L'état écrit ; l'état effectif tient compte de `deadlineAt` (expiration constatée). */
    status: serviceRequestStatusValidator,
    /** Le consentement explicite à montrer son nom à l'équipe de la page, horodaté. */
    identityConsentAt: v.number(),
    /** Contrat de commande : même clé et même empreinte = même demande. */
    idempotencyKey: v.string(),
    idempotencyFingerprint: v.string(),
    /** Échéance de la demande sans proposition : la fin de sa dernière fenêtre. */
    expiresAt: v.number(),
    /** L'échéance qui COURT (demande, puis proposition courante) ; absente après l'accord ou la clôture. */
    deadlineAt: v.optional(v.number()),
    currentProposalId: v.optional(v.id("serviceProposals")),
    /** La version de la proposition courante ; zéro avant toute proposition. */
    proposalVersion: v.number(),
    bookingId: v.optional(v.id("serviceBookings")),
    closedBy: v.optional(serviceRequestCloserValidator),
    /** La personne qui a clos (le demandeur, ou le signataire qui a parlé pour la page). */
    closedByPersonId: v.optional(v.id("persons")),
    closedReason: v.optional(v.string()),
    closedAt: v.optional(v.number()),
    /** DG-015 : la contestation d'une absence par le demandeur (une seule ; l'état reste `no_show`). */
    contestedAt: v.optional(v.number()),
    /** Le motif de la contestation, normalisé, sans coordonnée ni adresse exacte : le demandeur en est l'auteur. */
    contestReason: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    // Mes demandes, des plus récemment mises à jour.
    .index("by_network_and_requester_and_updatedAt", ["networkId", "requesterPersonId", "updatedAt"])
    // Le rejeu idempotent d'un envoi.
    .index("by_network_and_requester_and_idempotencyKey", ["networkId", "requesterPersonId", "idempotencyKey"])
    // Une seule demande ouverte par personne et par offre.
    .index("by_network_and_requester_and_offer_and_status", ["networkId", "requesterPersonId", "offerId", "status"])
    // Les demandes reçues par une page, toutes ou par état.
    .index("by_network_and_page_and_updatedAt", ["networkId", "pageId", "updatedAt"])
    .index("by_network_and_page_and_status_and_updatedAt", ["networkId", "pageId", "status", "updatedAt"])
    // Le passage d'expiration (à planifier par ANTSIA).
    .index("by_status_and_deadlineAt", ["status", "deadlineAt"]),

  serviceProposals: defineTable({
    networkId: v.id("networks"),
    requestId: v.id("serviceRequests"),
    pageId: v.id("pages"),
    /** Version entière croissante ; une nouvelle version remplace la précédente. */
    version: v.number(),
    /** Le signataire vivant qui a parlé pour la page (audit) ; jamais montré au demandeur. */
    authorPersonId: v.id("persons"),
    /** Le montant proposé, entier en unités mineures, et sa devise ISO 4217. */
    amountMinor: v.number(),
    currency: v.string(),
    durationMinutes: v.number(),
    startAt: v.number(),
    endAt: v.number(),
    timeZone: v.string(),
    location: serviceLocationValidator,
    /** Le contenu de la prestation proposée. */
    details: v.string(),
    cancellationTerms: v.string(),
    /** L'échéance de l'accord : future, à 14 jours au plus, avant le début. */
    expiresAt: v.number(),
    state: serviceProposalStateValidator,
    /** SV-03 : la version qu'un déplacement accepté a remplacée (seuls l'horaire et le fuseau changent). */
    rescheduledFrom: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_request_and_version", ["requestId", "version"]),

  serviceBookings: defineTable({
    networkId: v.id("networks"),
    requestId: v.id("serviceRequests"),
    /** La proposition ACCEPTÉE : ses conditions ne changent plus sans nouvel accord. */
    proposalId: v.id("serviceProposals"),
    pageId: v.id("pages"),
    startAt: v.number(),
    endAt: v.number(),
    timeZone: v.string(),
    status: serviceBookingStatusValidator,
    /** SV-09 : les rendez-vous simultanés que la prestation admettait à l'accord (absent : un). */
    capacity: v.optional(v.number()),
    /** SV-03 : le nouvel horaire proposé, en attente de l'accord de l'autre partie ; absent sinon. */
    reschedule: v.optional(serviceRescheduleValidator),
    closedBy: v.optional(serviceRequestActorValidator),
    reason: v.optional(v.string()),
    closedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    // Le contrôle de collision : les rendez-vous confirmés d'une page, par début.
    .index("by_network_and_page_and_status_and_startAt", ["networkId", "pageId", "status", "startAt"])
    .index("by_request", ["requestId"]),
}
