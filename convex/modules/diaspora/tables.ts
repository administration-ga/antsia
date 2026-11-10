/**
 * Tables de la tranche `diaspora` — ce que DIASPORALE ajoute au moteur, et que
 * le moteur générique ne porte pas (DIASPORALE PD1, cahier DIASPORALE §7, §11) :
 *
 * - `countryHubs` : un hub par pays et ses compteurs MATÉRIALISÉS par le passage
 *   nocturne (jamais calculés à la lecture). L'ouverture d'un pays ne se recopie
 *   pas ici : elle se lit dans `networks.openCountries`, réglage tracé de la console ;
 * - `sponsorships` : les parrainages, retraits compris (le journal reste) ;
 * - `consularAttestations` : les demandes d'attestation consulaire
 *   (`DIASPORA-ATTESTATION-V1`) — l'EMPREINTE du sujet, jamais le sujet ; la
 *   réponse minimale (pays, poste, date), jamais une donnée consulaire ;
 * - `communityImports` : les éléments publics importés de consulat.ga
 *   (`DIASPORA-COMMUNAUTE-V1`, PD5) ;
 * - `memberPrivacy` : les niveaux FINS de la facette et le niveau d'annuaire
 *   (le moteur générique ne connaît que `hidden`, `network` et `root`).
 *
 * Toutes portent `networkId` : la tranche ne sert que le réseau qu'elle
 * gouverne (`networks.managedBy = "diaspora"`), dans un moteur multi-réseaux.
 * Fichier écrit par la session DIASPORALE ; agrégé par `convex/schema.ts`.
 */
import { ATTESTATION_SUBJECT_KINDS, DIRECTORY_VISIBILITY_LEVELS, FIELD_VISIBILITY_LEVELS } from "@diasporale/domain"
import { defineTable } from "convex/server"
import { v } from "convex/values"

import { literals } from "../../lib/validators"
import { associationsTables } from "./associationsTables"
import { serviceRequestsTables } from "./serviceRequestsTables"
import { serviceReviewsTables } from "./serviceReviewsTables"
import { mutualAidTables } from "./mutualAidTables"
import { arrivalKitTables } from "./arrivalKitTables"
import { mentoringTables } from "./mentoringTables"
import { jobsTables } from "./jobsTables"
import { pilotMetricsTables } from "./pilotMetricsTables"
import { servicesTables } from "./servicesTables"

/** Niveau fin de visibilité d'un champ de facette (`only_me` ⊂ `connections` ⊂ `country` ⊂ `network`). */
export const fieldVisibilityValidator = literals(FIELD_VISIBILITY_LEVELS)

/** Les niveaux fins des six champs de la facette diaspora (`FACET_FIELDS` du domaine). */
export const facetLevelsValidator = v.object({
  countryOfResidence: fieldVisibilityValidator,
  city: fieldVisibilityValidator,
  postSlug: fieldVisibilityValidator,
  associationIds: fieldVisibilityValidator,
  arrivedAt: fieldVisibilityValidator,
  helpAvailable: fieldVisibilityValidator,
})

export const directoryVisibilityValidator = literals(DIRECTORY_VISIBILITY_LEVELS)

/** Qui a retiré un parrainage : le parrain, la modération, ou le départ de la personne parrainée. */
export const SPONSORSHIP_REVOKERS = ["sponsor", "moderator", "departure"] as const

/** Issue d'une demande d'attestation : en cours, confirmée, non confirmée (sans la raison consulaire), en échec technique. */
export const ATTESTATION_RESULTS = ["pending", "verified", "not_confirmed", "failed"] as const

/** Natures des éléments publics de `DIASPORA-COMMUNAUTE-V1` (copie consommateur du contrat). */
export const COMMUNITY_IMPORT_KINDS = ["consular_posts", "associations", "companies", "events", "communiques"] as const

export const COMMUNITY_IMPORT_STATUSES = ["pending", "applied", "rejected"] as const

export const diasporaTables = {
  countryHubs: defineTable({
    networkId: v.id("networks"),
    /** ISO 3166-1 alpha-2, jamais le Gabon. */
    country: v.string(),
    /** Membres listés dans l'annuaire du pays (opt-in) — publiés au-dessus d'un seuil seulement. */
    members: v.number(),
    associations: v.number(),
    companies: v.number(),
    /** Évènements à venir ouverts au réseau des associations du pays ; zéro non mesuré tant que la date ci-dessous manque. */
    upcomingEvents: v.number(),
    /** Dernier passage nocturne ; absent tant qu'aucun passage n'a compté. */
    countersComputedAt: v.optional(v.number()),
    /** HB-02 : dernier passage qui a compté EXACTEMENT les évènements à venir ; absent, le compteur n'est pas mesuré. */
    upcomingEventsComputedAt: v.optional(v.number()),
    updatedAt: v.number(),
  }).index("by_network_and_country", ["networkId", "country"]),

  sponsorships: defineTable({
    networkId: v.id("networks"),
    sponsorPersonId: v.id("persons"),
    sponsoredPersonId: v.id("persons"),
    createdAt: v.number(),
    revokedAt: v.optional(v.number()),
    revokedBy: v.optional(literals(SPONSORSHIP_REVOKERS)),
  })
    .index("by_network_and_sponsor_and_createdAt", ["networkId", "sponsorPersonId", "createdAt"])
    .index("by_network_and_sponsored", ["networkId", "sponsoredPersonId"]),

  consularAttestations: defineTable({
    networkId: v.id("networks"),
    personId: v.id("persons"),
    /** Nature du sujet présenté à consulat.ga (`idnSub` ou `emailHash`)… */
    subjectKind: literals(ATTESTATION_SUBJECT_KINDS),
    /** …et son empreinte : le sujet lui-même n'est jamais conservé. */
    subjectHash: v.string(),
    /** Le consentement `consular_attestation` en vigueur au moment du geste. */
    consentId: v.id("consents"),
    /** Référence opaque transmise à consulat.ga (idempotence de la demande). */
    consentRef: v.string(),
    result: literals(ATTESTATION_RESULTS),
    country: v.optional(v.string()),
    postSlug: v.optional(v.string()),
    since: v.optional(v.number()),
    attestedAt: v.optional(v.number()),
    requestedAt: v.number(),
    respondedAt: v.optional(v.number()),
  })
    .index("by_person_and_requestedAt", ["personId", "requestedAt"])
    .index("by_consentRef", ["consentRef"]),

  communityImports: defineTable({
    networkId: v.id("networks"),
    /** Référence stable de l'élément importé (nature et identifiant public chez consulat.ga). */
    importRef: v.string(),
    kind: literals(COMMUNITY_IMPORT_KINDS),
    status: literals(COMMUNITY_IMPORT_STATUSES),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_network_and_importRef", ["networkId", "importRef"]),

  memberPrivacy: defineTable({
    networkId: v.id("networks"),
    personId: v.id("persons"),
    facetLevels: facetLevelsValidator,
    directoryVisibility: directoryVisibilityValidator,
    updatedAt: v.number(),
  }).index("by_network_and_person", ["networkId", "personId"]),

  // Plan global (docs/14 de DIASPORALE) : chaque chantier tient ses tables dans son fichier.
  ...servicesTables,
  ...serviceRequestsTables,
  ...associationsTables,
  ...serviceReviewsTables,
  ...mutualAidTables,
  ...arrivalKitTables,
  ...mentoringTables,
  ...jobsTables,
  ...pilotMetricsTables,
}
