/**
 * Tables des BOUTIQUES (P07, ADR-0019) — la boutique est une CAPACITÉ d'une
 * page sociale, liée à une activité : ni un réseau, ni un second profil.
 *
 * QUI GÈRE : tant qu'une boutique n'a pas de page, son PRÉPARATEUR seul
 * (`ownerPersonId`) ; dès qu'une page la porte (page créée à l'admission de la
 * vitrine, ou page existante rattachée), les ADMINISTRATEURS VIVANTS de cette
 * page — relus à chaque geste — et le préparateur n'est plus qu'une trace
 * (`preparedByPersonId`). L'identité (nom, description, logo) vit alors sur la
 * PAGE, une seule source : ce que lit la modération de la page est ce que
 * montre la vitrine.
 *
 * AUCUN catalogue, prix, stock ni état d'encaissement ici : les offres
 * canoniques sont celles de PRO.GA (P08/P09), et l'encaissement reste absent.
 */
import { defineTable } from "convex/server"
import { v } from "convex/values"

import { contentVisibilityValidator } from "../../lib/validators"
import { jobTables } from "./jobTables"
import { savedOfferTables } from "./savedOfferTables"
import { serviceTables } from "./serviceTables"
import { activityConfigurationValidator, shopModelValidator, storefrontPolicyValidator, storefrontStateValidator } from "./validators"

export const shopsTables = {
  // P15 : emploi public reflété et candidatures privées (préfixes commerceJob*/commerceApplication*).
  ...jobTables,
  // P14 : services, devis et rendez-vous (préfixe commerceService*).
  ...serviceTables,
  // CM-09 : favoris d'offres, privés, références seules.
  ...savedOfferTables,
  shops: defineTable({
    networkId: v.id("networks"),
    /** Le préparateur d'un brouillon SANS page — seul à le gérer ; absent dès qu'une page porte la boutique. */
    ownerPersonId: v.optional(v.id("persons")),
    /** Qui a préparé la boutique : trace et export, retirée à l'effacement de la personne. */
    preparedByPersonId: v.optional(v.id("persons")),
    /** La page sociale qui porte la boutique ; absente tant que la vitrine n'est pas admise. */
    pageId: v.optional(v.id("pages")),
    model: shopModelValidator,
    /** MP02 : facultatif pour les lignes historiques ; aucune donnée économique ni référence personnelle. */
    activityConfiguration: v.optional(activityConfigurationValidator),
    /** Identité du BROUILLON sans page ; avec une page, c'est la page qui la porte (ces champs sont vidés). */
    draftName: v.optional(v.string()),
    draftDescription: v.optional(v.string()),
    /** Logo du brouillon, ADMIS par la garde des fichiers (usage `page_logo`, source `page`) : il deviendra celui de la page. */
    draftLogoStorageId: v.optional(v.id("_storage")),
    specialty: v.optional(v.string()),
    /** Zone approximative choisie par la boutique (jamais une adresse). */
    serviceArea: v.optional(v.string()),
    hours: v.optional(v.string()),
    /** Le plat du jour d'une adresse « Alimentation et restauration » : une offre de son menu, pour un jour civil de Libreville. */
    dailySpecial: v.optional(v.object({ offerRef: v.string(), day: v.string() })),
    /** Incarnation de la désignation : retirer puis remettre ne ressuscite aucune Story. */
    dailySpecialRevision: v.optional(v.number()),
    storefront: storefrontStateValidator,
    /** Motif de la dernière décision de l'équipe de la plateforme (refus, suspension) — rendu aux seuls gérants. */
    decisionReason: v.optional(v.string()),
    requestedAt: v.optional(v.number()),
    decidedAt: v.optional(v.number()),
    /** Dernière mise en vitrine (ordre de l'annuaire). */
    publishedAt: v.optional(v.number()),
    /** La règle de lecture hors de la racine : `root`, la vitrine se lit aussi depuis la racine. Sans objet dans la racine. */
    visibility: contentVisibilityValidator,
    /** Consentement à la diffusion PUBLIQUE (lecture sans compte) : horodaté, versionné, révocable. */
    publicConsentAt: v.optional(v.number()),
    publicConsentTextVersion: v.optional(v.string()),
    publicConsentByPersonId: v.optional(v.id("persons")),
    publicConsentRevokedAt: v.optional(v.number()),
    /**
     * CM-10 : la boutique est EN PAUSE tant que cet instant (réouverture, minuit à Libreville) est dans le futur.
     * La pause se lit, rien ne s'écrit à l'échéance ; facultatif : les boutiques historiques ne l'ont pas. Donnée de
     * l'activité, sans référence personnelle (aucun auteur stocké).
     */
    pausedUntil: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    // Mes brouillons sans page dans un réseau (et leur quota).
    .index("by_network_owner", ["networkId", "ownerPersonId"])
    // La boutique d'une page : une au plus.
    .index("by_page", ["pageId"])
    // L'annuaire d'un réseau : vitrines publiées, les plus récentes d'abord.
    .index("by_network_storefront_publishedAt", ["networkId", "storefront", "publishedAt"])
    // Racine : candidats publiés de tous les réseaux, puis origine/portée/droits relus.
    .index("by_storefront_publishedAt", ["storefront", "publishedAt"])
    // La file d'admission : d'un réseau, ou de tous, la plus ancienne d'abord.
    .index("by_network_storefront_requestedAt", ["networkId", "storefront", "requestedAt"])
    .index("by_storefront_requestedAt", ["storefront", "requestedAt"])
    .index("by_preparedByPersonId", ["preparedByPersonId"])
    .index("by_publicConsentByPersonId", ["publicConsentByPersonId"]),

  /**
   * La POLITIQUE de publication des vitrines d'un réseau, réglée par un
   * opérateur de la plateforme (décision tracée). Aucune ligne : FERMÉE.
   */
  shopNetworkPolicies: defineTable({
    networkId: v.id("networks"),
    storefront: storefrontPolicyValidator,
    automaticDecisionVersion: v.optional(v.string()),
    updatedAt: v.number(),
    updatedByPersonId: v.optional(v.id("persons")),
  }).index("by_network", ["networkId"])
    .index("by_updatedByPersonId", ["updatedByPersonId"]),
}
