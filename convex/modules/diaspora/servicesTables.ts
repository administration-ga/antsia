/**
 * Tables du catalogue des services DIASPORALE (DG-011/012) — PROPRIÉTAIRE :
 * chantier « catalogue des services » de la session DIASPORALE ; agrégées par
 * `tables.ts`, donc par `convex/schema.ts`.
 *
 * CONTRAT posé par le coordinateur et consommé par le chantier « demandes et
 * rendez-vous » : `serviceOffers` garde `networkId`, `pageId`, `title`, `status`,
 * `version`, `pricing` et `durationMinutes` (noms et sens). On peut AJOUTER des
 * champs facultatifs ou des index ; jamais renommer ni retirer ceux-là.
 *
 * Une offre appartient à une PAGE (association ou entreprise), jamais à la
 * personne qui l'a saisie : aucune référence personnelle n'y est stockée.
 * Mise en relation seulement : un tarif annoncé n'est ni un encaissement ni une
 * commande.
 */
import { SERVICE_CATEGORIES, SERVICE_DELIVERY_MODES, SERVICE_OFFER_STATUSES } from "@diasporale/domain"
import { defineTable } from "convex/server"
import { v } from "convex/values"

import { literals } from "../../lib/validators"
import { serviceLocationValidator } from "./serviceRequestsTables"

/** Tarif annoncé : montant ENTIER en unités mineures et devise ISO 4217, ou sur devis. */
export const servicePricingValidator = v.union(
  v.object({ mode: v.literal("fixed"), amountMinor: v.number(), currency: v.string() }),
  v.object({ mode: v.literal("from"), amountMinor: v.number(), currency: v.string() }),
  v.object({ mode: v.literal("quote") }),
)

export const serviceOfferStatusValidator = literals(SERVICE_OFFER_STATUSES)

/**
 * SV-04 : les réglages de prestation d'une offre, lus par l'équipe de sa page
 * seulement, repris dans chaque nouvelle proposition. Un champ absent n'est pas
 * réglé. Jamais une adresse exacte ni une coordonnée (règle du domaine).
 * SV-09 : `bookingCapacity`, les rendez-vous simultanés admis (absent : un).
 */
export const serviceProviderSettingsValidator = v.object({
  timeZone: v.optional(v.string()),
  location: v.optional(serviceLocationValidator),
  cancellationTerms: v.optional(v.string()),
  bookingCapacity: v.optional(v.number()),
})

export const servicesTables = {
  serviceOffers: defineTable({
    networkId: v.id("networks"),
    /** La page professionnelle qui propose ; ses signataires vivants gèrent l'offre. */
    pageId: v.id("pages"),
    title: v.string(),
    description: v.string(),
    category: literals(SERVICE_CATEGORIES),
    /** Zone de service : pays ISO 3166-1 alpha-2 (jamais le Gabon) et ville saisie, sans GPS. */
    country: v.string(),
    city: v.string(),
    /** La ville repliée (casse, accents, espaces) : clé d'index de recherche. */
    cityKey: v.string(),
    delivery: literals(SERVICE_DELIVERY_MODES),
    /** Langues de la prestation (codes BCP 47 courts : `fr`, `en`…). */
    languages: v.array(v.string()),
    /** Durée indicative, en minutes. */
    durationMinutes: v.optional(v.number()),
    pricing: servicePricingValidator,
    status: serviceOfferStatusValidator,
    /** Texte replié de recherche (titre, description, ville) ; jamais de coordonnée. */
    searchText: v.string(),
    /** Version de l'offre : toute modification l'incrémente ; une demande cite la version lue. */
    version: v.number(),
    /** SV-04, SV-09 : réglages de prestation (fuseau, lieu, conditions, capacité), pour l'équipe seulement ; absent, rien n'est réglé. */
    providerSettings: v.optional(serviceProviderSettingsValidator),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_network_and_page_and_status", ["networkId", "pageId", "status"])
    .index("by_network_and_status_and_country_and_category", ["networkId", "status", "country", "category"])
    .index("by_network_and_status_and_country_and_cityKey", ["networkId", "status", "country", "cityKey"])
    // Chantier « catalogue » : le catalogue sans filtre (les plus récentes d'abord), par
    // catégorie seule, par ville seule (une ville saisie se cherche sans choisir de pays).
    .index("by_network_and_status", ["networkId", "status"])
    .index("by_network_and_status_and_category", ["networkId", "status", "category"])
    .index("by_network_and_status_and_cityKey", ["networkId", "status", "cityKey"])
    .searchIndex("search_by_text", { searchField: "searchText", filterFields: ["networkId", "status", "country", "category"] }),
}
