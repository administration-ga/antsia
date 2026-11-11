/**
 * Tables des avis admissibles DIASPORALE (DG-016) — PROPRIÉTAIRE : chantier
 * « avis » de la session DIASPORALE ; agrégées par `tables.ts`, donc par
 * `convex/schema.ts`.
 *
 * L'avis appartient au demandeur. La réponse appartient à la PAGE ; son
 * signataire n'est qu'une référence d'audit, à anonymiser lors de son effacement.
 * Les deux retraits sont terminaux : une réservation ne redonne pas un avis,
 * et une page ne recrée pas une réponse retirée sous une autre identité.
 */
import { SERVICE_REVIEW_PROOFS, SERVICE_REVIEW_STATUSES } from "@diasporale/domain"
import { defineTable } from "convex/server"
import { v } from "convex/values"

import { literals } from "../../lib/validators"

export const serviceReviewProofValidator = literals(SERVICE_REVIEW_PROOFS)
export const serviceReviewStatusValidator = literals(SERVICE_REVIEW_STATUSES)

export const serviceReviewsTables = {
  serviceReviews: defineTable({
    networkId: v.id("networks"),
    requestId: v.id("serviceRequests"),
    bookingId: v.id("serviceBookings"),
    offerId: v.id("serviceOffers"),
    pageId: v.id("pages"),
    authorPersonId: v.id("persons"),
    rating: v.number(),
    body: v.string(),
    proof: serviceReviewProofValidator,
    /** Consentement explicite de publication, révoqué par le retrait. */
    consentToPublishAt: v.number(),
    version: v.number(),
    status: serviceReviewStatusValidator,
    createdAt: v.number(),
    updatedAt: v.number(),
    withdrawnAt: v.optional(v.number()),
  })
    // La lecture de cette plage rend l'unicité transactionnelle (y compris après retrait).
    .index("by_booking_and_author", ["bookingId", "authorPersonId"])
    .index("by_network_and_offer_and_createdAt", ["networkId", "offerId", "createdAt"])
    .index("by_network_and_page_and_createdAt", ["networkId", "pageId", "createdAt"])
    // DP-F1 (antsia#166) : l'export et l'effacement d'une personne lisent ces lignes par index, sans balayage.
    .index("by_authorPersonId", ["authorPersonId"])
    .index("by_requestId", ["requestId"]),

  serviceReviewReplies: defineTable({
    networkId: v.id("networks"),
    reviewId: v.id("serviceReviews"),
    pageId: v.id("pages"),
    /** Référence au signataire qui a parlé pour la page, jamais un propriétaire. */
    authorPersonId: v.id("persons"),
    body: v.string(),
    version: v.number(),
    status: serviceReviewStatusValidator,
    createdAt: v.number(),
    updatedAt: v.number(),
    withdrawnAt: v.optional(v.number()),
  }).index("by_review", ["reviewId"])
    // DP-F1 (antsia#166) : l'export et l'effacement d'une personne lisent ces lignes par index, sans balayage.
    .index("by_authorPersonId", ["authorPersonId"]),
}
