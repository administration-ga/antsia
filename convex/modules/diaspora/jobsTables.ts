/**
 * Tables du chantier « talents et emploi » (DG-025) de la session DIASPORALE —
 * PROPRIÉTAIRE : ce chantier ; agrégées par `tables.ts`, donc par `convex/schema.ts`.
 *
 * Noms imposés par la coordination (globaux au schéma, distincts du lot emploi
 * du moteur) : `jobOffers`, `jobApplications`, `talentProfiles`.
 *
 *   · `jobOffers` : l'offre appartient à une PAGE (entreprise ou association),
 *     jamais à la personne qui l'a saisie — aucune référence personnelle ;
 *   · `jobApplications` : la candidature PRIVÉE, à la personne qui candidate
 *     (`candidatePersonId`) ; lue par elle et par les signataires vivants de la
 *     page. Le profil de talent n'y est jamais copié : il est relu vivant, s'il
 *     est encore actif et si la personne a choisi de le joindre ;
 *   · `talentProfiles` : un profil opt-in par personne et par réseau.
 *
 * Effacement et export (classement demandé à ANTSIA, `people/dataPolicies.ts`) :
 * `jobOffers` partagée (contenu de page) ; `jobApplications` à
 * `candidatePersonId` (le signataire qui décide parle pour la page : référence
 * d'audit anonymisée à son effacement ; le motif de non-sélection suit la
 * candidature) ; `talentProfiles` à `personId`.
 */
import {
  JOB_APPLICATION_STATUSES,
  JOB_LANGUAGE_CODES,
  JOB_OFFER_CONTRACTS,
  JOB_OFFER_STATUSES,
  JOB_PAY_PERIODS,
  JOB_WORK_MODES,
  TALENT_AVAILABILITIES,
  TALENT_PROFILE_STATUSES,
  TALENT_VISIBILITIES,
} from "@diasporale/domain"
import { defineTable } from "convex/server"
import { v } from "convex/values"

import { literals } from "../../lib/validators"

export const jobOfferStatusValidator = literals(JOB_OFFER_STATUSES)
export const jobContractValidator = literals(JOB_OFFER_CONTRACTS)
export const jobWorkModeValidator = literals(JOB_WORK_MODES)
export const jobPayPeriodValidator = literals(JOB_PAY_PERIODS)
export const jobLanguageValidator = literals(JOB_LANGUAGE_CODES)
export const jobApplicationStatusValidator = literals(JOB_APPLICATION_STATUSES)
export const talentAvailabilityValidator = literals(TALENT_AVAILABILITIES)
export const talentVisibilityValidator = literals(TALENT_VISIBILITIES)
export const talentProfileStatusValidator = literals(TALENT_PROFILE_STATUSES)

/** Fourchette ANNONCÉE : entiers en unités mineures, devise ISO 4217 (vérifiée par le domaine), période. */
export const jobPayRangeValidator = v.object({
  minMinor: v.number(),
  maxMinor: v.number(),
  currency: v.string(),
  period: jobPayPeriodValidator,
})

export const jobsTables = {
  jobOffers: defineTable({
    networkId: v.id("networks"),
    /** La page qui recrute ; ses signataires VIVANTS gèrent l'offre. */
    pageId: v.id("pages"),
    title: v.string(),
    description: v.string(),
    contract: jobContractValidator,
    /** Pays ISO 3166-1 alpha-2 (jamais le Gabon) ; ville saisie facultative, sans GPS. */
    country: v.string(),
    city: v.optional(v.string()),
    /** La ville repliée (casse, accents, tirets) : clé d'index de la recherche par ville. */
    cityKey: v.optional(v.string()),
    workMode: jobWorkModeValidator,
    languages: v.array(jobLanguageValidator),
    payRange: v.optional(jobPayRangeValidator),
    /** Date limite des candidatures ; atteinte, l'offre est close (état effectif, puis écrit par le passage). */
    closesAt: v.optional(v.number()),
    /** L'état écrit ; l'état effectif tient compte de `closesAt`. */
    status: jobOfferStatusValidator,
    /** Texte replié de recherche (titre, description, ville) ; jamais de coordonnée. */
    searchText: v.string(),
    /** Toute modification l'incrémente ; une candidature cite la version lue. */
    version: v.number(),
    /** Première ouverture (création pour un brouillon) : l'ordre des résultats. */
    publishedAt: v.number(),
    closedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    // Les offres d'une page, toutes ou par état (gestion, quota).
    .index("by_network_and_page_and_status", ["networkId", "pageId", "status"])
    // La recherche : réseau + état + (pays) + (ville) + date, les plus récentes d'abord.
    .index("by_network_and_status_and_publishedAt", ["networkId", "status", "publishedAt"])
    .index("by_network_and_status_and_country_and_publishedAt", ["networkId", "status", "country", "publishedAt"])
    .index("by_network_and_status_and_country_and_cityKey_and_publishedAt", ["networkId", "status", "country", "cityKey", "publishedAt"])
    .index("by_network_and_status_and_cityKey_and_publishedAt", ["networkId", "status", "cityKey", "publishedAt"])
    // Le passage d'expiration (à planifier par ANTSIA).
    .index("by_status_and_closesAt", ["status", "closesAt"])
    .searchIndex("search_by_text", { searchField: "searchText", filterFields: ["networkId", "status", "country"] }),

  jobApplications: defineTable({
    networkId: v.id("networks"),
    offerId: v.id("jobOffers"),
    /** La page de l'offre (dénormalisée) : ses signataires vivants lisent et décident. */
    pageId: v.id("pages"),
    candidatePersonId: v.id("persons"),
    /** Le titre et la version de l'offre au moment de candidater (la personne garde ce qu'elle a lu). */
    offerTitle: v.string(),
    offerVersion: v.number(),
    /** Le message de motivation, normalisé, sans coordonnée. */
    message: v.string(),
    status: jobApplicationStatusValidator,
    /** Le consentement EXPLICITE à transmettre son nom publié à l'équipe de la page, horodaté. */
    identityConsentAt: v.number(),
    /** Le choix de joindre son profil de talent (relu vivant : masqué ou supprimé, il disparaît). */
    shareTalentProfile: v.boolean(),
    talentConsentAt: v.optional(v.number()),
    /** Contrat de commande : même clé et même empreinte = même candidature. */
    idempotencyKey: v.string(),
    idempotencyFingerprint: v.string(),
    seenAt: v.optional(v.number()),
    decidedAt: v.optional(v.number()),
    /** Le signataire vivant qui a décidé pour la page (audit) ; jamais montré à la personne qui candidate. */
    decidedByPersonId: v.optional(v.id("persons")),
    /** Note de l'équipe, jamais montrée à la personne qui candidate sans relecture. */
    notSelectedReason: v.optional(v.string()),
    withdrawnAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    // Mes candidatures, des plus récemment mises à jour.
    .index("by_network_and_candidate_and_updatedAt", ["networkId", "candidatePersonId", "updatedAt"])
    // Une candidature par personne et par offre.
    .index("by_network_and_candidate_and_offer", ["networkId", "candidatePersonId", "offerId"])
    // Le rejeu idempotent d'un envoi.
    .index("by_network_and_candidate_and_idempotencyKey", ["networkId", "candidatePersonId", "idempotencyKey"])
    // Les candidatures d'une offre, toutes ou par état, les plus récentes d'abord.
    .index("by_network_and_offer_and_createdAt", ["networkId", "offerId", "createdAt"])
    .index("by_network_and_offer_and_status_and_createdAt", ["networkId", "offerId", "status", "createdAt"])
    // DP-F1 (antsia#166) : l'export et l'effacement d'une personne lisent ces lignes par index, sans balayage.
    .index("by_decidedByPersonId", ["decidedByPersonId"]),

  talentProfiles: defineTable({
    networkId: v.id("networks"),
    personId: v.id("persons"),
    /** Titre professionnel déclaré. */
    title: v.string(),
    /** Une à quinze compétences DÉCLARÉES (aucune attestation ne les certifie). */
    skills: v.array(v.string()),
    /** Titre et compétences repliés : le texte de la recherche. */
    searchText: v.string(),
    availability: talentAvailabilityValidator,
    languages: v.array(jobLanguageValidator),
    /** Pays de recherche du talent (jamais le Gabon). Aucun âge, sexe, origine, situation familiale ni photo. */
    country: v.string(),
    /** `network` : dans la recherche des talents ; `unlisted` : joint seulement aux candidatures choisies. */
    visibility: talentVisibilityValidator,
    /** `hidden` : masqué par la personne, n'apparaît nulle part. */
    status: talentProfileStatusValidator,
    version: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_network_and_person", ["networkId", "personId"])
    // La recherche : réseau + pays + état + visibilité, les plus récemment mis à jour d'abord.
    .index("by_network_and_country_and_status_and_visibility_and_updatedAt", ["networkId", "country", "status", "visibility", "updatedAt"])
    .searchIndex("search_by_skills", { searchField: "searchText", filterFields: ["networkId", "country", "status", "visibility"] }),
}
