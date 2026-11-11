/**
 * Tables du module `people` (cahier §6, §11) : la personne unique, ses liens
 * d'identité, ses adhésions par réseau, ses facettes, ses consentements et
 * l'historique de ses identifiants.
 *
 * - `persons` : UNE ligne par être humain, quel que soit le nombre de réseaux
 *   (invariant 2). Créée à la première session SANS identifiant ni nom : rien
 *   n'est recopié d'un état civil, rien n'est publié avant le geste de la
 *   personne (invariant 7). Les champs de profil reprennent les noms du profil
 *   du socle (`reseauPersonnel_profiles`) pour la duplication de PA3.
 * - Aucun badge n'est stocké : il se calcule (invariant 5, test de schéma).
 */
import { defineTable } from "convex/server"
import { v } from "convex/values"

import {
  activeMembershipStatusValidator,
  consentOriginValidator,
  consentPurposeValidator,
  facetValueValidator,
  facetVisibilityValidator,
  identityProviderValidator,
  localeValidator,
  membershipRoleValidator,
  membershipStatusValidator,
  storedMemberThemeValidator,
  verificationSourceValidator,
} from "../../lib/validators"

export const idnLoaValidator = v.union(v.literal(1), v.literal(2), v.literal(3))
export const idnProfileTypeValidator = v.union(v.literal("citizen"), v.literal("resident"), v.literal("visitor"), v.literal("developer"))

export const peopleTables = {
  persons: defineTable({
    /** Sujet du jeton Better Auth (`identity.subject`) : le lien session → personne. */
    authUserId: v.string(),
    /** Identifiant public unique (minuscules, 3 à 30 caractères), choisi par la personne. */
    handle: v.optional(v.string()),
    /** Nom affiché, choisi par la personne — jamais recopié d'un état civil sans geste. */
    displayName: v.optional(v.string()),
    headline: v.optional(v.string()),
    avatarStorageId: v.optional(v.id("_storage")),
    coverStorageId: v.optional(v.id("_storage")),
    /** Profil publié (fin de l'accueil) ; absent tant que la personne n'a pas choisi. */
    publishedAt: v.optional(v.number()),
    withdrawnAt: v.optional(v.number()),
    privateAt: v.optional(v.number()),
    locale: v.optional(localeValidator),
    timeZone: v.optional(v.string()),
    /** Thème choisi en session (Préférences > Thème) ; absent tant que la personne n'en a choisi aucun. */
    theme: v.optional(storedMemberThemeValidator),
    deletionRequestedAt: v.optional(v.number()),
    /** Marque anonyme commune aux références conservées après effacement. */
    erasedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_authUserId", ["authUserId"])
    .index("by_handle", ["handle"]),

  identityLinks: defineTable({
    personId: v.id("persons"),
    provider: identityProviderValidator,
    /** `idn` : sub ; `local` : empreinte de canal ; `administration` : empreinte IDN cloisonnée par émetteur/environnement ; attestation : empreinte. */
    subject: v.string(),
    loa: v.optional(v.number()),
    nationality: v.optional(v.string()),
    profileType: v.optional(idnProfileTypeValidator),
    channel: v.optional(v.union(v.literal("email"), v.literal("phone"))),
    orgRef: v.optional(v.string()),
    country: v.optional(v.string()),
    postSlug: v.optional(v.string()),
    linkedAt: v.number(),
    revokedAt: v.optional(v.number()),
  })
    .index("by_person_and_provider", ["personId", "provider"])
    .index("by_provider_and_subject", ["provider", "subject"]),

  /** Preuve minimale issue de `/userinfo`, écrite uniquement par le callback OIDC serveur. Aucun profil ni adhésion n'en naît. */
  idnProofs: defineTable({
    subject: v.string(),
    loa: v.optional(idnLoaValidator),
    nationality: v.optional(v.string()),
    profileType: v.optional(idnProfileTypeValidator),
    observedAt: v.number(),
  }).index("by_subject", ["subject"]),

  networkMemberships: defineTable({
    networkId: v.id("networks"),
    personId: v.id("persons"),
    status: membershipStatusValidator,
    role: membershipRoleValidator,
    /** Adhésion DÉRIVÉE : le réseau enfant qui l'a fait naître (invariant 3). */
    derivedFrom: v.optional(v.id("networks")),
    verifiedBy: v.optional(verificationSourceValidator),
    sponsorPersonId: v.optional(v.id("persons")),
    /** Statut à rendre à la levée d'une suspension. */
    statusBeforeSuspension: v.optional(activeMembershipStatusValidator),
    suspendedUntil: v.optional(v.number()),
    /**
     * La personne a CHOISI de paraître dans l'annuaire de ce réseau. Lu pour un
     * réseau gouverné par une tranche (`networks.managedBy`), dont l'annuaire
     * est opt-in : sans ce choix, la personne n'y est pas listée. Posé par la
     * tranche (`setDirectoryListed`), remis à zéro à un retour après départ.
     * Sans effet pour un réseau générique (le profil découvrable y suffit).
     */
    directoryListed: v.optional(v.boolean()),
    /** La publication ÉPINGLÉE en tête de mon mur DANS CE RÉSEAU (relue avec sa garde à chaque lecture). */
    pinnedPostId: v.optional(v.id("posts")),
    joinedAt: v.number(),
    statusChangedAt: v.number(),
    leftAt: v.optional(v.number()),
  })
    .index("by_network_and_person", ["networkId", "personId"])
    .index("by_person_and_status", ["personId", "status"])
    .index("by_network_and_status", ["networkId", "status"])
    // Les modérateurs et administrateurs d'un réseau, sans balayer ses membres.
    .index("by_network_and_role", ["networkId", "role"])
    .index("by_sponsorPersonId", ["sponsorPersonId"]),

  personFacets: defineTable({
    networkId: v.id("networks"),
    personId: v.id("persons"),
    values: v.record(v.string(), facetValueValidator),
    visibilities: v.record(v.string(), facetVisibilityValidator),
    updatedAt: v.number(),
  }).index("by_network_and_person", ["networkId", "personId"]),

  consents: defineTable({
    personId: v.id("persons"),
    networkId: v.optional(v.id("networks")),
    purpose: consentPurposeValidator,
    textVersion: v.string(),
    origin: consentOriginValidator,
    grantedAt: v.number(),
    revokedAt: v.optional(v.number()),
  }).index("by_person_and_purpose", ["personId", "purpose"]),

  /**
   * L'ANNUAIRE d'un réseau : une projection cherchable par (réseau, personne),
   * dénormalisée depuis le profil et l'adhésion. Elle n'existe que pour une
   * adhésion ACTIVE, et n'est `listed` que pour un profil publié, non privé, sans
   * suspension à la racine : la recherche ne rend jamais un non-membre ni une
   * personne qui ne veut pas être trouvée (`filterFields`). Écrite par
   * `syncPersonDirectory` seulement.
   */
  peopleDirectory: defineTable({
    networkId: v.id("networks"),
    personId: v.id("persons"),
    /** Nom affiché et identifiant, avec leur repli sans accents (`buildSearchableText`). */
    searchName: v.string(),
    listed: v.boolean(),
    updatedAt: v.number(),
  })
    .index("by_network_and_person", ["networkId", "personId"])
    .index("by_person", ["personId"])
    // Suggestions d'abonnement : les membres découvrables, les plus récents d'abord.
    .index("by_network_listed", ["networkId", "listed"])
    .searchIndex("search_name", { searchField: "searchName", filterFields: ["networkId", "listed"] }),

  handleHistory: defineTable({
    personId: v.id("persons"),
    handle: v.string(),
    from: v.number(),
    until: v.optional(v.number()),
  })
    .index("by_handle", ["handle"])
    .index("by_person", ["personId"]),
}
