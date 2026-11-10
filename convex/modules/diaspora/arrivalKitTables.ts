/**
 * Tables du chantier « kit d'arrivée » (DG-024 b) de la session DIASPORALE —
 * PROPRIÉTAIRE : ce chantier ; agrégées par `tables.ts`, donc par `convex/schema.ts`.
 * Règles pures dans `@diasporale/domain` (arrival-kit), fonctions dans `arrivalKit.ts`.
 *
 * - `kitResources` : une ressource pratique DATÉE d'un pays (et d'une ville
 *   facultative), avec sa source citée et sa date de dernière vérification. Elle
 *   porte sa version COURANTE : toute modification incrémente `revision`, repasse
 *   par la relecture et remet à zéro ses signalements. Ressource PERSONNELLE
 *   (`authorPersonId`) ou portée par une PAGE (`pageId`, jamais les deux) ; dans
 *   ce second cas, la page parle : la personne qui propose ou modifie n'est
 *   qu'une référence d'audit. Aucun badge stocké (calculé à la lecture), aucune
 *   coordonnée, aucun nom (le nom affiché vient du profil publié ou de la page).
 * - `kitResourceReviews` : le JOURNAL des relectures (publiée, renvoyée, marquée
 *   « à revoir »), une ligne par décision ; qui a décidé n'est jamais montré
 *   pour un renvoi.
 * - `kitOutdatedFlags` : un signalement « information périmée » par personne ET
 *   par version, au motif fermé (aucun texte libre).
 *
 * Toutes portent `networkId` : la tranche ne sert que le réseau qu'elle gouverne.
 */
import { ARRIVAL_KIT_CATEGORIES, ARRIVAL_KIT_OUTDATED_REASONS, ARRIVAL_KIT_REVIEW_OUTCOMES, ARRIVAL_KIT_STATUSES } from "@diasporale/domain"
import { defineTable } from "convex/server"
import { v } from "convex/values"

import { literals } from "../../lib/validators"

export const arrivalKitStatusValidator = literals(ARRIVAL_KIT_STATUSES)
export const arrivalKitCategoryValidator = literals(ARRIVAL_KIT_CATEGORIES)
export const arrivalKitOutdatedReasonValidator = literals(ARRIVAL_KIT_OUTDATED_REASONS)
export const arrivalKitReviewOutcomeValidator = literals(ARRIVAL_KIT_REVIEW_OUTCOMES)

export const arrivalKitTables = {
  kitResources: defineTable({
    networkId: v.id("networks"),
    /** Ressource PERSONNELLE : son auteur (absent pour une ressource portée par une page). */
    authorPersonId: v.optional(v.id("persons")),
    /** Ressource portée par une PAGE (absente pour une ressource personnelle) ; ses signataires vivants la gèrent. */
    pageId: v.optional(v.id("pages")),
    /** Qui l'a proposée (« Mes propositions », audit) ; pour une page, une référence anonymisable. */
    proposedByPersonId: v.id("persons"),
    /** Qui a écrit la version COURANTE : ni elle ni l'équipe de la page ne la relit. */
    revisedByPersonId: v.id("persons"),
    title: v.string(),
    summary: v.string(),
    body: v.string(),
    category: arrivalKitCategoryValidator,
    /** Pays ISO 3166-1 alpha-2, jamais le Gabon. */
    country: v.string(),
    /** Ville saisie (sans GPS) ; absente, la ressource vaut pour tout le pays. */
    city: v.optional(v.string()),
    /** La ville repliée (`""` : tout le pays) — clé des index de lecture. */
    cityKey: v.string(),
    sourceName: v.string(),
    /** Adresse https normalisée, sans identifiant de suivi (règle du domaine). */
    sourceUrl: v.string(),
    /** Dernière vérification auprès de la source, déclarée par qui écrit la version. */
    lastVerifiedAt: v.number(),
    /** L'état ENREGISTRÉ ; l'état effectif (ancienneté, signalements) se calcule à la lecture. */
    status: arrivalKitStatusValidator,
    /** Dénormalisé de `status` (publiée ou à revoir) à chaque écriture : la clé des index du kit public. */
    listed: v.boolean(),
    /** Le motif du dernier renvoi ou de la mise « à revoir » (lu par qui gère ou relit). */
    statusReason: v.optional(v.string()),
    /** Numéro de la version du CONTENU : signalements et relectures s'y rapportent. */
    revision: v.number(),
    /** Version de la ligne : tout geste l'incrémente ; un geste cite la version lue. */
    version: v.number(),
    /** Signalements distincts sur la version courante (compteur tenu par la mutation, remis à zéro à chaque version). */
    outdatedFlags: v.number(),
    /** Qui a relu et publié la version courante, et quand (montrés sur la ressource publiée). */
    reviewedByPersonId: v.optional(v.id("persons")),
    reviewedAt: v.optional(v.number()),
    /** Dernière soumission à la relecture (ordre de la file). */
    submittedAt: v.optional(v.number()),
    /** Date de la version courante. */
    revisedAt: v.number(),
    archivedAt: v.optional(v.number()),
    /**
     * ET-04 — le texte cherché : titre et résumé de la version courante, en mots repliés
     * (`arrivalKitSearchText`). Facultatif pour les lignes d'avant le champ : elles restent
     * listées, seule la recherche par mots ne les trouve pas avant leur prochaine version.
     */
    searchText: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    // Le kit public d'un pays : tout le pays, ou une rubrique ; les plus récemment vérifiées d'abord.
    .index("by_network_listed_country", ["networkId", "listed", "country", "lastVerifiedAt"])
    .index("by_network_listed_country_category", ["networkId", "listed", "country", "category", "lastVerifiedAt"])
    // Une ville saisie, ou les seules ressources nationales (`cityKey` vide).
    .index("by_network_listed_city", ["networkId", "listed", "country", "cityKey", "lastVerifiedAt"])
    .index("by_network_listed_city_category", ["networkId", "listed", "country", "cityKey", "category", "lastVerifiedAt"])
    // La file de relecture d'un pays, les plus anciennes soumissions d'abord.
    .index("by_network_status_country_submitted", ["networkId", "status", "country", "submittedAt"])
    // « Mes propositions », les plus récemment changées d'abord ; et le plafond par état.
    .index("by_network_proposer_updated", ["networkId", "proposedByPersonId", "updatedAt"])
    .index("by_network_proposer_status", ["networkId", "proposedByPersonId", "status"])
    // ET-04 — chercher par mots dans le kit public d'un pays, par rubrique (la ville se rejuge).
    .searchIndex("search_by_text", { searchField: "searchText", filterFields: ["networkId", "listed", "country", "category"] }),

  kitResourceReviews: defineTable({
    networkId: v.id("networks"),
    resourceId: v.id("kitResources"),
    /** La version relue. */
    revision: v.number(),
    reviewerPersonId: v.id("persons"),
    outcome: arrivalKitReviewOutcomeValidator,
    /** Obligatoire pour un renvoi ou une mise « à revoir » (borné par le domaine). */
    reason: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_resource_and_createdAt", ["resourceId", "createdAt"]),

  kitOutdatedFlags: defineTable({
    networkId: v.id("networks"),
    resourceId: v.id("kitResources"),
    /** La version signalée : une nouvelle version repart sans signalement. */
    revision: v.number(),
    personId: v.id("persons"),
    reason: arrivalKitOutdatedReasonValidator,
    createdAt: v.number(),
  }).index("by_resource_and_revision_and_person", ["resourceId", "revision", "personId"]),
}
