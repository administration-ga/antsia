/**
 * CC-2b (contrat CONVERSATION-CONTEXTUELLE-V1 §3.2 accepté, ADR-0025) — tables des
 * conversations contextuelles, toutes à préfixe réservé `contextual`.
 *
 * Aucune liste de participants, aucun nom, aucun rôle vivant, aucune copie du contenu de l'objet
 * (besoin, objectif, message, titre), aucun aperçu de message : les parties sont CALCULÉES à
 * chaque lecture et à chaque écriture par le résolveur de la tranche et les gardes du moteur.
 * Ce module n'écrit jamais dans `personalThreads`, `personalMessages`, `connections`, `follows`
 * ni `unreadTotals`.
 */
import { CONTEXTUAL_CLOSED_CAUSES, CONTEXTUAL_SUPPORTED_KINDS, CONTEXTUAL_SIDES, CONTEXTUAL_THREAD_STATUSES, CONTEXTUAL_VOICES } from "@antsia/social-domain/contextualMessaging"
import { defineTable } from "convex/server"
import { v } from "convex/values"

import { literals } from "../../lib/validators"
import { storedAttachmentValidator } from "../messaging/tables"

export const contextualKindValidator = literals(CONTEXTUAL_SUPPORTED_KINDS)
export const contextualSideValidator = literals(CONTEXTUAL_SIDES)
export const contextualVoiceValidator = literals(CONTEXTUAL_VOICES)
export const contextualThreadStatusValidator = literals(CONTEXTUAL_THREAD_STATUSES)
export const contextualClosedCauseValidator = literals(CONTEXTUAL_CLOSED_CAUSES)

/**
 * L'objet ouvrant, tel qu'un client ou une tranche le désigne : une nature V1 et son identifiant
 * TYPÉ. Une nature réservée (`commerceJobApplication`, `shopContact`) ou inconnue est refusée
 * par ce validateur ; l'identifiant d'une autre table aussi.
 */
export const contextualContextValidator = v.union(
  v.object({ kind: v.literal("diasporaServiceRequest"), id: v.id("serviceRequests") }),
  v.object({ kind: v.literal("diasporaMentoring"), id: v.id("mentoringRequests") }),
  v.object({ kind: v.literal("diasporaJobApplication"), id: v.id("jobApplications") }),
  v.object({ kind: v.literal("professionalCollaboration"), id: v.id("professionalCollaborations") }),
)

export const contextualMessagingTables = {
  /** Une ligne par objet (`contextKey`), dans le réseau de l'objet, figé à l'ouverture. */
  contextualThreads: defineTable({
    networkId: v.id("networks"),
    kind: contextualKindValidator,
    /** « nature:identifiant » : l'ouverture idempotente. */
    contextKey: v.string(),
    /** EXACTEMENT une référence typée, celle de la nature (contrôlée à l'insertion). */
    serviceRequestId: v.optional(v.id("serviceRequests")),
    mentoringRequestId: v.optional(v.id("mentoringRequests")),
    jobApplicationId: v.optional(v.id("jobApplications")),
    professionalCollaborationId: v.optional(v.id("professionalCollaborations")),
    /**
     * Clés d'index recopiées de l'objet, IMMUABLES et SANS autorité : elles servent aux listes.
     * Divergentes de l'objet relu, elles rendent la conversation absente pour tous.
     */
    requesterPersonId: v.id("persons"),
    responderPageId: v.optional(v.id("pages")),
    responderPersonId: v.optional(v.id("persons")),
    /** Cache d'état : jamais une vérité d'accès (§6.3). */
    status: contextualThreadStatusValidator,
    closedAt: v.optional(v.number()),
    closedCause: v.optional(contextualClosedCauseValidator),
    /** Le CÔTÉ qui a clos (D12), jamais une personne. */
    closedBySide: v.optional(contextualSideValidator),
    /** Premier mot du répondant acquis : son message, ou un geste de l'objet qui vaut réponse (D4). */
    responderSpokeAt: v.optional(v.number()),
    revision: v.number(),
    /** Clé d'activité des listes (l'ouverture, puis le dernier message). */
    lastMessageAt: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
    /** D7 : absent tant qu'aucune durée n'est décidée ; posé par une purge demandée (traçabilité). */
    purgeAt: v.optional(v.number()),
  })
    .index("by_contextKey", ["contextKey"])
    .index("by_network_requester_activity", ["networkId", "requesterPersonId", "lastMessageAt"])
    .index("by_network_responder_person_activity", ["networkId", "responderPersonId", "lastMessageAt"])
    .index("by_network_responder_page_activity", ["networkId", "responderPageId", "lastMessageAt"])
    .index("by_serviceRequest", ["serviceRequestId"])
    .index("by_mentoringRequest", ["mentoringRequestId"])
    .index("by_jobApplication", ["jobApplicationId"])
    .index("by_professionalCollaboration", ["professionalCollaborationId"])
    .index("by_purgeAt", ["purgeAt"]),

  contextualMessages: defineTable({
    networkId: v.id("networks"),
    threadId: v.id("contextualThreads"),
    side: contextualSideValidator,
    voice: contextualVoiceValidator,
    /** Voix de PERSONNE seulement : le propriétaire du message. */
    authorPersonId: v.optional(v.id("persons")),
    /** Voix de PAGE seulement : référence d'audit, jamais montrée au demandeur, effacée avec la personne. */
    pageSpeakerPersonId: v.optional(v.id("persons")),
    content: v.optional(v.string()),
    attachmentFiles: v.optional(v.array(storedAttachmentValidator)),
    idempotencyKey: v.string(),
    digest: v.string(),
    createdAt: v.number(),
    deletedAt: v.optional(v.number()),
  })
    .index("by_thread_createdAt", ["threadId", "createdAt"])
    .index("by_thread_key", ["threadId", "idempotencyKey"]),

  /** Une ligne par personne et par fil, créée au premier geste. Elle ne confère AUCUN droit. */
  contextualPersonStates: defineTable({
    networkId: v.id("networks"),
    threadId: v.id("contextualThreads"),
    personId: v.id("persons"),
    readAt: v.optional(v.number()),
    /** Accord d'appel explicite (CC-4), jamais prérempli, lié à l'autorité qui l'a permis. */
    callsAllowed: v.optional(v.boolean()),
    callAuthorityKey: v.optional(v.string()),
    updatedAt: v.number(),
  })
    .index("by_thread_person", ["threadId", "personId"])
    .index("by_thread", ["threadId"])
    .index("by_person", ["personId"])
    // CC-4 : les accords d'appel posés dans un fil (cibles d'appel du demandeur face à une page), relus un à un.
    .index("by_thread_calls", ["threadId", "callsAllowed"]),

  /** Une ligne par couple (réseau, nature). L'ABSENCE de ligne vaut « fermé » (§5.9). */
  contextualPolicies: defineTable({
    networkId: v.id("networks"),
    kind: contextualKindValidator,
    enabled: v.boolean(),
    updatedAt: v.number(),
    updatedByPersonId: v.optional(v.id("persons")),
  }).index("by_network_kind", ["networkId", "kind"]),
}
