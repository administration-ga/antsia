/**
 * Tables du mentorat bénévole DIASPORALE (DG-024, troisième tranche, lot G8
 * point 2) — PROPRIÉTAIRE : chantier « mentorat » de la session DIASPORALE ;
 * agrégées par `tables.ts`, donc par `convex/schema.ts`.
 *
 * - `mentorProfiles` : l'OPT-IN explicite d'un membre, un profil par personne et
 *   par réseau (`optedInAt` horodaté, `retiredAt` à la révocation) ; ni tarif ni
 *   coordonnée. La ville se montre selon la visibilité de la facette du mentor ;
 *   le nombre de mentorés actifs se RELIT dans la transaction (aucun compteur
 *   recopié) ;
 * - `mentorListings` : une ligne par domaine d'un profil non retiré, pour trouver
 *   les mentors par réseau, état, pays et domaine (un tableau ne s'indexe pas) ;
 *   recopiée à chaque écriture du profil, jamais saisie ;
 * - `mentoringRequests` : la demande consentie d'un mentoré à un mentor
 *   (domaine, objectif, message, créneaux souhaités), puis le mentorat qui en
 *   naît (créneau proposé, clôture). Aucune conversation ici : le contact passe
 *   par la messagerie du moteur une fois la demande acceptée.
 *
 * Instants en millisecondes UTC ; un fuseau IANA canonique accompagne chaque
 * heure pensée par une personne.
 *
 * Effacement et export (classement demandé à ANTSIA, `people/dataPolicies.ts`) :
 * `mentorProfiles` et `mentorListings` appartiennent au mentor (`personId`),
 * les lignes d'annuaire suivent aussi leur profil (`mentorProfileId`) ;
 * `mentoringRequests` appartient aux DEUX parties (`menteePersonId`,
 * `mentorPersonId`) et suit son profil (`mentorProfileId`).
 */
import {
  MENTOR_LANGUAGE_CODES,
  MENTOR_LISTING_STATES,
  MENTOR_PROFILE_STATES,
  MENTORING_CLOSERS,
  MENTORING_DOMAINS,
  MENTORING_REQUEST_STATUSES,
} from "@diasporale/domain"
import { defineTable } from "convex/server"
import { v } from "convex/values"

import { literals } from "../../lib/validators"

export const mentoringDomainValidator = literals(MENTORING_DOMAINS)
export const mentorLanguageValidator = literals(MENTOR_LANGUAGE_CODES)
export const mentorProfileStateValidator = literals(MENTOR_PROFILE_STATES)
export const mentorListingStateValidator = literals(MENTOR_LISTING_STATES)
export const mentoringRequestStatusValidator = literals(MENTORING_REQUEST_STATUSES)
export const mentoringCloserValidator = literals(MENTORING_CLOSERS)

/** Un créneau souhaité : début inclus, fin exclue (UTC). */
export const mentoringSlotValidator = v.object({ startAt: v.number(), endAt: v.number() })

/** Le créneau proposé par le mentor : son fuseau canonique et l'instant de la proposition. */
export const mentoringProposedSlotValidator = v.object({
  startAt: v.number(),
  endAt: v.number(),
  timeZone: v.string(),
  proposedAt: v.number(),
})

export const mentoringTables = {
  mentorProfiles: defineTable({
    networkId: v.id("networks"),
    personId: v.id("persons"),
    state: mentorProfileStateValidator,
    /** Un à cinq domaines, dans l'ordre canonique. */
    domains: v.array(mentoringDomainValidator),
    presentation: v.string(),
    languages: v.array(mentorLanguageValidator),
    /** Le pays où le mentor aide (ISO 3166-1 alpha-2), jamais le Gabon. */
    country: v.string(),
    /** Facultative ; montrée selon la visibilité de la ville de la facette du mentor. */
    city: v.optional(v.string()),
    /** La disponibilité DÉCLARÉE, en texte borné : jamais un agenda. */
    availability: v.string(),
    /** Le plafond de mentorés actifs choisi par le mentor (1 à 10). */
    maxActiveMentees: v.number(),
    /** Version entière croissante : toute modification cite la version lue. */
    version: v.number(),
    /** L'opt-in explicite en vigueur (premier, ou renouvelé après un retrait). */
    optedInAt: v.number(),
    /** Le début de la présence courante dans l'annuaire : l'ordre des résultats. */
    listedAt: v.number(),
    pausedAt: v.optional(v.number()),
    /** La révocation de l'opt-in. */
    retiredAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    // Mon profil de mentor : un par personne et par réseau.
    .index("by_network_and_person", ["networkId", "personId"])
    // Chercher par pays, tous domaines confondus, les plus récemment listés d'abord.
    .index("by_network_and_state_and_country_and_listedAt", ["networkId", "state", "country", "listedAt"]),

  mentorListings: defineTable({
    networkId: v.id("networks"),
    mentorProfileId: v.id("mentorProfiles"),
    personId: v.id("persons"),
    state: mentorListingStateValidator,
    country: v.string(),
    domain: mentoringDomainValidator,
    listedAt: v.number(),
  })
    // Chercher par pays ET domaine.
    .index("by_network_and_state_and_country_and_domain_and_listedAt", ["networkId", "state", "country", "domain", "listedAt"])
    // Recopier ou retirer les lignes d'un profil.
    .index("by_mentor_profile", ["mentorProfileId"])
    // DP-F1 (antsia#166) : l'export et l'effacement d'une personne lisent ces lignes par index, sans balayage.
    .index("by_personId", ["personId"]),

  mentoringRequests: defineTable({
    networkId: v.id("networks"),
    /** Le profil de mentor demandé, et la personne qui le porte. */
    mentorProfileId: v.id("mentorProfiles"),
    mentorPersonId: v.id("persons"),
    menteePersonId: v.id("persons"),
    /** Le domaine demandé, parmi ceux du mentor à l'envoi. */
    domain: mentoringDomainValidator,
    /** L'objectif (une ligne) et le message, normalisés, sans coordonnée ni adresse exacte. */
    goal: v.string(),
    message: v.string(),
    /** Zéro à trois créneaux souhaités, triés. */
    wishedSlots: v.array(mentoringSlotValidator),
    /** Le fuseau CANONIQUE du mentoré. */
    timeZone: v.string(),
    /** L'état écrit ; l'état effectif tient compte de `expiresAt` (expiration constatée). */
    status: mentoringRequestStatusValidator,
    /** Le consentement explicite du mentoré à montrer son nom et son message au mentor, horodaté. */
    consentAt: v.number(),
    /** Contrat de commande : même clé et même empreinte = même demande. */
    idempotencyKey: v.string(),
    idempotencyFingerprint: v.string(),
    /** L'échéance de la demande sans réponse : quatorze jours après l'envoi. */
    expiresAt: v.number(),
    /** Le créneau proposé par le mentor une fois la demande acceptée. */
    slot: v.optional(mentoringProposedSlotValidator),
    /** La version du créneau proposé ; zéro avant toute proposition. */
    slotVersion: v.number(),
    acceptedAt: v.optional(v.number()),
    closedBy: v.optional(mentoringCloserValidator),
    closedReason: v.optional(v.string()),
    closedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    // Mes demandes (comme mentoré), des plus récemment mises à jour.
    .index("by_network_and_mentee_and_updatedAt", ["networkId", "menteePersonId", "updatedAt"])
    // Le rejeu idempotent d'un envoi.
    .index("by_network_and_mentee_and_idempotencyKey", ["networkId", "menteePersonId", "idempotencyKey"])
    // Le plafond des demandes en attente d'un mentoré (non échues).
    .index("by_network_and_mentee_and_status_and_expiresAt", ["networkId", "menteePersonId", "status", "expiresAt"])
    // La paire : une seule demande ouverte par mentoré et par mentor.
    .index("by_network_and_mentee_and_mentor_and_status", ["networkId", "menteePersonId", "mentorPersonId", "status"])
    // Les demandes reçues (comme mentor), toutes ou par état ; le plafond des mentorés actifs.
    .index("by_network_and_mentor_and_updatedAt", ["networkId", "mentorPersonId", "updatedAt"])
    .index("by_network_and_mentor_and_status_and_updatedAt", ["networkId", "mentorPersonId", "status", "updatedAt"])
    // La boîte d'un mentor : ses demandes en attente non échues.
    .index("by_network_and_mentor_and_status_and_expiresAt", ["networkId", "mentorPersonId", "status", "expiresAt"])
    // Le passage d'expiration (à planifier par ANTSIA).
    .index("by_status_and_expiresAt", ["status", "expiresAt"])
    // DP-F1 (antsia#166) : l'export et l'effacement d'une personne lisent ces lignes par index, sans balayage.
    .index("by_mentorProfileId", ["mentorProfileId"]),
}
