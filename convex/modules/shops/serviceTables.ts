/**
 * P14 : tables privées des services, devis et rendez-vous (préfixe réservé `commerceService*`).
 *
 * - `commerceServicePolicies` : ouverture d'un réseau, FERMÉE par défaut (aucune ligne).
 * - `commerceServiceRequests` : « Mes demandes » de l'acheteur, références et états servis
 *   par PRO.GA, sans texte privé (besoin, note et nom restent dans les corps transitoires).
 * - `commerceServiceCommands` : octets signés d'une commande (transitoires, 30 minutes) et
 *   champs de corrélation non privés pour relire un reçu après une réponse perdue.
 */
import { COMMERCE_ENVIRONMENTS } from "@antsia/social-domain/commerce/primitives"
import { defineTable } from "convex/server"
import { v } from "convex/values"

import { literals } from "../../lib/validators"
import {
  serviceAcceptedQuoteValidator, serviceRejectedQuoteValidator, serviceBookingSnapshotValidator, serviceCommandKindValidator, serviceCommandStateValidator,
  serviceModeValidator, serviceMoneyValidator, serviceOrderSnapshotValidator, serviceRequestStateValidator,
} from "./serviceRules"

/** Autorité figée à l'admission, relue avant et après chaque échange. */
export const serviceAuthorityFields = {
  networkId: v.id("networks"), shopId: v.id("shops"), personId: v.id("persons"), handle: v.string(),
  sessionDigest: v.string(), configFingerprint: v.string(), source: v.string(), environment: literals(COMMERCE_ENVIRONMENTS),
  linkRef: v.string(), shopRef: v.string(), subjectRef: v.string(),
}

export const serviceTables = {
  // DP39 : preuve privée du signal, sans état métier ni corps de service ; effaçable par personne.
  commerceServiceFollowupNotices: defineTable({
    networkId: v.id("networks"), personId: v.id("persons"), requestId: v.id("commerceServiceRequests"),
    objectKind: v.union(v.literal("appointment"), v.literal("quote"), v.literal("order")), objectRef: v.string(),
    revision: v.number(), changedAt: v.number(), payloadSha256: v.string(), transition: v.string(), receivedAt: v.number(),
  }).index("by_request_object_revision", ["requestId", "objectRef", "revision"])
    .index("by_request_transition", ["requestId", "transition"])
    .index("by_person", ["personId"]),

  // Barrière durable d'une intention sans commande : aucune donnée de formulaire, aucune purge TTL.
  serviceClientIntentFences: defineTable({
    networkId: v.id("networks"), personId: v.id("persons"), clientRequestId: v.string(), stoppedAt: v.number(),
  }).index("by_client", ["personId", "networkId", "clientRequestId"])
    .index("by_person", ["personId"]),

  commerceServicePolicies: defineTable({
    networkId: v.id("networks"), enabled: v.boolean(), updatedAt: v.number(), updatedByPersonId: v.optional(v.id("persons")),
  }).index("by_network", ["networkId"]),

  commerceServiceRequests: defineTable({
    networkId: v.id("networks"), shopId: v.id("shops"), personId: v.id("persons"), handle: v.string(),
    requestRowId: v.string(), mode: serviceModeValidator, offerRef: v.string(), offerTitle: v.string(),
    source: v.string(), environment: literals(COMMERCE_ENVIRONMENTS), shopRef: v.string(), linkRef: v.string(), subjectRef: v.string(),
    state: serviceRequestStateValidator, reason: v.optional(v.string()),
    // Demande de devis : conversation commerciale acceptée (P10) et nombre de pièces choisies.
    threadId: v.optional(v.id("commercialThreads")), conversationRef: v.optional(v.string()), inquiryRef: v.optional(v.string()),
    desiredDate: v.optional(v.string()), chosenAttachmentCount: v.optional(v.number()),
    // Rendez-vous : prestation, rendez-vous tenu et éventuel remplacement en attente.
    serviceRef: v.optional(v.string()), serviceLabel: v.optional(v.string()),
    booking: v.optional(serviceBookingSnapshotValidator), pendingReplacement: v.optional(serviceBookingSnapshotValidator),
    // Commande (prestation à tarif fixe ou devis accepté) et preuve d'acceptation renvoyée.
    order: v.optional(serviceOrderSnapshotValidator), acceptedQuote: v.optional(serviceAcceptedQuoteValidator), rejectedQuote: v.optional(serviceRejectedQuoteValidator),
    purgeAt: v.optional(v.number()), cancelledAt: v.optional(v.number()),
    createdAt: v.number(), updatedAt: v.number(),
  }).index("by_request", ["requestRowId"])
    .index("by_person_network_updated", ["personId", "networkId", "updatedAt"])
    .index("by_person_cancelled", ["personId", "cancelledAt"])
    .index("by_purgeAt", ["purgeAt"]),

  commerceServiceCommands: defineTable({
    ...serviceAuthorityFields, requestRowId: v.string(), commandId: v.string(), kind: serviceCommandKindValidator,
    clientRequestId: v.string(), intentDigest: v.string(),
    requestId: v.string(), bodySha256: v.string(), rawBody: v.optional(v.string()),
    issuedAt: v.number(), expiresAt: v.number(), privateUntil: v.number(), privatePurgedAt: v.optional(v.number()),
    state: serviceCommandStateValidator, reason: v.optional(v.string()),
    lookupState: v.optional(v.union(v.literal("unknown"), v.literal("in_progress"), v.literal("completed"))), lastLookupAt: v.optional(v.number()),
    leaseToken: v.optional(v.string()), leaseUntil: v.optional(v.number()),
    // Le consentement garde sa session d'origine ; chaque bail fige la session de sa reprise.
    leaseSessionDigest: v.optional(v.string()), lookupSessionDigest: v.optional(v.string()),
    // Preuves locales P10 transitoires, jamais exportées ni envoyées à PRO.GA.
    inquiryAttachmentMessageIds: v.optional(v.array(v.id("commercialMessages"))),
    consentTextVersion: v.string(), consentedAt: v.number(),
    // Corrélation non privée (validation d'un reçu tardif ou consulté), jamais un texte libre.
    quoteRef: v.optional(v.string()), quoteVersion: v.optional(v.number()), acceptedTotal: v.optional(serviceMoneyValidator),
    serviceRef: v.optional(v.string()), slotStartAt: v.optional(v.number()), slotEndAt: v.optional(v.number()),
    appointmentRef: v.optional(v.string()), expectedRevision: v.optional(v.number()),
    offerRef: v.optional(v.string()), quantity: v.optional(v.number()), expectedUnitAmount: v.optional(serviceMoneyValidator), expectedCatalogRevision: v.optional(v.number()),
    // Exigence locale de projection publique ; aucun mandat ni champ du contrat privé.
    publishedPackage: v.optional(v.literal(true)),
    // Résultat validé : versions/montants à reconfirmer ou références obtenues.
    currentVersion: v.optional(v.number()), currentTotal: v.optional(serviceMoneyValidator),
    currentUnitAmount: v.optional(serviceMoneyValidator), currentCatalogRevision: v.optional(v.number()),
    resultRef: v.optional(v.string()),
    cancelledAt: v.optional(v.number()), createdAt: v.number(), updatedAt: v.number(),
  }).index("by_command", ["commandId"])
    .index("by_network_source_environment_requestId", ["networkId", "source", "environment", "requestId"])
    .index("by_request_row", ["requestRowId", "createdAt"])
    .index("by_client", ["personId", "networkId", "clientRequestId"])
    .index("by_person_cancelled", ["personId", "cancelledAt"])
    // Effacement demandé : corps privés et baux de la personne expurgés tout de suite.
    .index("by_person_private", ["personId", "privatePurgedAt"])
    .index("by_private_until", ["privatePurgedAt", "privateUntil"]),
}
