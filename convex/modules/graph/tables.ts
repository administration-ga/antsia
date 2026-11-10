// Dupliqué de socle/convex/modules/reseau/tables.ts (l. 96-122) @ ad2e7fdc2 — adaptations : personnes et réseaux (`networkId`, `personIdLow`/`personIdHigh`) ; `recipientPersonId` dénormalisé pour lister les demandes reçues par un index, sans `.filter()` ; paire indexée AUSSI sans réseau, pour que le blocage se lise sur toute la paire ; table `follows` reprise de socle/convex/modules/reseauPersonnel/tables.ts (l. 375-389), index préfixés par le réseau.
/**
 * Tables du graphe : connexions symétriques (par réseau) et abonnements
 * unilatéraux (par réseau).
 *
 * Une paire est stockée UNE fois par réseau, avec `personIdLow`/`personIdHigh`
 * ordonnés : sans cet ordre canonique, A→B et B→A seraient deux lignes, et
 * « sommes-nous connectés ? » exigerait deux lectures et une réconciliation.
 *
 * Le BLOCAGE vaut pour toute la paire, dans tous les réseaux : bloquer quelqu'un
 * dans un réseau pour le retrouver dans un autre ne protégerait de rien. Il est
 * écrit sur chaque ligne de la paire, et lu sur toute la paire (`by_pair`).
 */
import { CONNECTION_STATUSES } from "@antsia/social-domain/connectionState"
import { defineTable } from "convex/server"
import { v } from "convex/values"

import { literals } from "../../lib/validators"

export const connectionStatusValidator = literals(CONNECTION_STATUSES)

export const graphTables = {
  connections: defineTable({
    networkId: v.id("networks"),
    personIdLow: v.id("persons"),
    personIdHigh: v.id("persons"),
    requestedByPersonId: v.id("persons"),
    /** L'autre partie de la demande : celle qui doit répondre. */
    recipientPersonId: v.id("persons"),
    status: connectionStatusValidator,
    /** Qui a posé le blocage — unilatéral : seul son auteur le lève, l'autre n'en sait rien. */
    blockedByPersonId: v.optional(v.id("persons")),
    message: v.optional(v.string()),
    requestedAt: v.number(),
    /** Version de demande annulée par son auteur, pour le seul rejeu de cette annulation. */
    cancelledRequestedAt: v.optional(v.number()),
    respondedAt: v.optional(v.number()),
    updatedAt: v.number(),
  })
    .index("by_network_pair", ["networkId", "personIdLow", "personIdHigh"])
    // La paire dans TOUS les réseaux : le blocage se lit ici.
    .index("by_pair", ["personIdLow", "personIdHigh"])
    .index("by_network_low_status", ["networkId", "personIdLow", "status"])
    .index("by_network_high_status", ["networkId", "personIdHigh", "status"])
    .index("by_network_recipient_status", ["networkId", "recipientPersonId", "status"])
    // Les demandes que J'AI envoyées, encore sans réponse (« invitations envoyées », lot 12c).
    .index("by_network_requester_status", ["networkId", "requestedByPersonId", "status"])
    // Les blocages d'une personne, tous réseaux (filtres du fil, des suggestions).
    .index("by_low_status", ["personIdLow", "status"])
    .index("by_high_status", ["personIdHigh", "status"])
    .index("by_blocker_status_updatedAt", ["blockedByPersonId", "status", "updatedAt"]),

  /** Intentions personnelles indépendantes ; le réseau est seulement la porte d'entrée autorisée. */
  personBlocks: defineTable({
    networkId: v.id("networks"),
    blockerPersonId: v.id("persons"),
    targetPersonId: v.id("persons"),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_blocker_target", ["blockerPersonId", "targetPersonId"])
    .index("by_blocker_createdAt", ["blockerPersonId", "createdAt"])
    .index("by_target_createdAt", ["targetPersonId", "createdAt"]),

  /**
   * Abonnement : suivre quelqu'un sans son accord. Il N'EST PAS une connexion —
   * asymétrique, unilatéral, il n'ouvre rien de plus que ce qui est déjà
   * `public`. La garde d'audience reste la connexion.
   */
  follows: defineTable({
    networkId: v.id("networks"),
    followerPersonId: v.id("persons"),
    targetPersonId: v.id("persons"),
    createdAt: v.number(),
  })
    .index("by_network_follower_target", ["networkId", "followerPersonId", "targetPersonId"])
    .index("by_network_follower_createdAt", ["networkId", "followerPersonId", "createdAt"])
    .index("by_network_target_createdAt", ["networkId", "targetPersonId", "createdAt"])
    // L'abonnement d'une personne à une autre dans TOUS les réseaux : bloquer le retire partout (PF-01, D1).
    .index("by_follower_target", ["followerPersonId", "targetPersonId"]),
}
