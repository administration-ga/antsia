// Dupliqué de socle/convex/modules/reseauPersonnel/tables.ts (l. 922-1030, `reseauPersonnel_thematicGroups`, `…ThematicGroupMembers`, `…ThematicGroupInvites`) @ ad2e7fdc2 — adaptations : `networkId` sur le groupe, l'appartenance et l'invitation ; personnes ; `memberCount` retiré du document (agrégat `engineCounters`, D02) ; découverte indexée PAR RÉSEAU (`by_network_createdAt`, recherche `search_name` filtrée par réseau, D17) ; appartenances et invitations indexées par réseau (« mes groupes », « mes invitations ») ; pays facultatif du groupe et vitrine par pays (demande DIASPORALE, EXF-DG-24) ; page d'association facultative du groupe (le groupe d'adhérents d'une association, EXF-DG-26) ; règles du groupe versionnées et version acceptée par chaque membre, membres indexés par rôle pour le transfert de propriété (PG-02).
/**
 * Groupes THÉMATIQUES d'un réseau — des lieux de PUBLICATION autour d'un thème,
 * découvrables dans leur réseau, ouverts à l'adhésion. Ni une messagerie (les
 * conversations de groupe), ni un canal d'organisation.
 */
import { THEMATIC_GROUP_ROLES } from "@antsia/social-domain/thematicGroups"
import { defineTable } from "convex/server"
import { v } from "convex/values"

import { literals } from "../../lib/validators"

export const thematicGroupRoleValidator = literals(THEMATIC_GROUP_ROLES)

/** Une invitation : en attente, acceptée ou déclinée — une ligne par (groupe, invité). */
export const THEMATIC_GROUP_INVITE_STATUSES = ["pending", "accepted", "declined"] as const
export const thematicGroupInviteStatusValidator = literals(THEMATIC_GROUP_INVITE_STATUSES)

export const thematicGroupsTables = {
  thematicGroups: defineTable({
    networkId: v.id("networks"),
    name: v.string(),
    /** Le thème, dit en clair. Facultatif — un nom peut suffire. */
    description: v.optional(v.string()),
    /** Le pays du groupe (deux lettres), facultatif : la découverte d'un pays rend ses groupes et ceux sans pays. */
    country: v.optional(v.string()),
    /**
     * La PAGE d'association dont ce groupe est le groupe d'adhérents (EXF-DG-26),
     * posée à la création par un administrateur de la page, dans son réseau.
     */
    associationPageId: v.optional(v.id("pages")),
    createdByPersonId: v.id("persons"),
    /**
     * Publication ÉPINGLÉE en tête du mur — un acte de MODÉRATION du groupe.
     * Relue AVEC SA GARDE à chaque lecture : retirée, elle disparaît d'elle-même.
     */
    pinnedPostId: v.optional(v.id("posts")),
    /** Nom et description, originaux et repliés sans accents — ce que lit la découverte. */
    searchText: v.string(),
    /** Tirée au montage du formulaire — même règle que les publications. */
    idempotencyKey: v.string(),
    /** Fermé : plus aucune adhésion, invitation, publication ni modération ; l'historique reste. */
    closedAt: v.optional(v.number()),
    /** Archivé : fermeture renforcée et retrait de la découverte, jamais une suppression. */
    archivedAt: v.optional(v.number()),
    /** Suppression définitive demandée : les gardes ferment pendant la cascade bornée. */
    deletingAt: v.optional(v.number()),
    /**
     * Les RÈGLES du groupe (PG-02) : le texte de son propriétaire, borné
     * (`THEMATIC_GROUP_RULES_MAX_LENGTH`), montré avant toute adhésion. Absentes :
     * l'adhésion reste libre. Contenu collectif du groupe, comme la description :
     * effacées avec lui.
     */
    rules: v.optional(v.string()),
    /** Compteur des versions émises, jamais redescendu ; la version EN VIGUEUR n'existe qu'avec `rules`. */
    rulesVersion: v.optional(v.number()),
    /** Dernier changement des règles (texte posé, modifié ou retiré). */
    rulesUpdatedAt: v.optional(v.number()),
    createdAt: v.number(),
    /** Dernière activité (adhésion, publication, réglage) — l'ordre de « mes groupes ». */
    updatedAt: v.number(),
  })
    .index("by_creator_and_idempotencyKey", ["createdByPersonId", "idempotencyKey"])
    // La vitrine d'un réseau : ses groupes les plus récents.
    .index("by_network_createdAt", ["networkId", "createdAt"])
    // La vitrine d'un PAYS : ses groupes, et (pays absent) ceux de tout le réseau.
    .index("by_network_country_createdAt", ["networkId", "country", "createdAt"])
    // Les groupes d'adhérents d'une page d'association.
    .index("by_network_associationPage_createdAt", ["networkId", "associationPageId", "createdAt"])
    .searchIndex("search_name", { searchField: "searchText", filterFields: ["networkId"] }),

  /**
   * L'appartenance d'une personne à un groupe thématique. Le DÉPART est une
   * date, pas une suppression : une ré-adhésion REPREND la ligne (en simple
   * membre). Un membre parti est un non-membre partout.
   */
  thematicGroupMembers: defineTable({
    networkId: v.id("networks"),
    groupId: v.id("thematicGroups"),
    personId: v.id("persons"),
    role: thematicGroupRoleValidator,
    joinedAt: v.number(),
    leftAt: v.optional(v.number()),
    /**
     * La version des règles que cette personne a acceptée (PG-02), et quand.
     * Exportées avec l'appartenance, effacées avec elle. Une version nouvelle
     * ne renvoie personne : l'écran la montre au membre jusqu'à son acceptation.
     */
    acceptedRulesVersion: v.optional(v.number()),
    acceptedRulesAt: v.optional(v.number()),
  })
    .index("by_group_and_person", ["groupId", "personId"])
    // Les MODÉRATEURS vivants d'un groupe — ceux qui peuvent recevoir la propriété (PG-02).
    .index("by_group_role_leftAt", ["groupId", "role", "leftAt"])
    // Les membres VIVANTS d'un groupe, par ancienneté (liste paginée, cascade).
    .index("by_group_leftAt_joinedAt", ["groupId", "leftAt", "joinedAt"])
    // MES groupes dans un réseau.
    .index("by_network_person_leftAt", ["networkId", "personId", "leftAt"]),

  /**
   * Une invitation — une SUGGESTION (l'adhésion reste libre). UNE ligne par
   * (groupe, invité) : réinviter rafraîchit la ligne en attente ou rouvre une
   * ligne déclinée. Le refus n'émet rien.
   */
  thematicGroupInvites: defineTable({
    networkId: v.id("networks"),
    groupId: v.id("thematicGroups"),
    inviteePersonId: v.id("persons"),
    invitedByPersonId: v.id("persons"),
    status: thematicGroupInviteStatusValidator,
    createdAt: v.number(),
    respondedAt: v.optional(v.number()),
  })
    .index("by_group_and_invitee", ["groupId", "inviteePersonId"])
    .index("by_group_and_status", ["groupId", "status"])
    // MES invitations en attente dans un réseau.
    .index("by_network_invitee_status", ["networkId", "inviteePersonId", "status"])
    .index("by_invitedByPersonId", ["invitedByPersonId"]),
}
