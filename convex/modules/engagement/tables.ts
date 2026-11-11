// Dupliqué de socle/convex/modules/reseauPersonnel/tables.ts (l. 278-346) @ ad2e7fdc2 — adaptations : réactions et commentaires en personnes, avec le réseau ; compteur de réactions FRAGMENTÉ (`postReactionShards`) au lieu des champs `reactionCount(s)` de la publication (D01) ; commentaires comptés par l'agrégat `engineCounters` (plus de `commentCount`) ; index des commentaires réunissant racines et réponses, pagination par racine (D03) — `by_parent_and_createdAt` non recopié (D35).
import { defineTable } from "convex/server"
import { v } from "convex/values"

import { postStatusValidator, reactionKindValidator } from "../../lib/validators"

export const engagementTables = {
  /** UNE réaction par (publication, personne) : changer de genre remplace, jamais n'empile. */
  postReactions: defineTable({
    networkId: v.id("networks"),
    postId: v.id("posts"),
    personId: v.id("persons"),
    kind: reactionKindValidator,
    createdAt: v.number(),
  })
    .index("by_post_and_person", ["postId", "personId"])
    .index("by_person", ["personId"]),

  /**
   * Commentaire d'une publication — UN seul niveau de réponse : répondre à une
   * réponse rattache à la même racine (le serveur décide de la profondeur).
   * Vit dans le réseau de la publication. Retiré, pas supprimé.
   */
  postComments: defineTable({
    networkId: v.id("networks"),
    postId: v.id("posts"),
    authorPersonId: v.id("persons"),
    body: v.string(),
    /** La RACINE à laquelle répond ce commentaire ; absent pour une racine. */
    parentCommentId: v.optional(v.id("postComments")),
    mentionedPersonIds: v.optional(v.array(v.id("persons"))),
    status: postStatusValidator,
    createdAt: v.number(),
    updatedAt: v.number(),
    editedAt: v.optional(v.number()),
    removedAt: v.optional(v.number()),
  })
    // Racines (parent absent) ET réponses d'une racine, vivantes, dans l'ordre : une pagination par racine (D03).
    .index("by_post_parent_status_createdAt", ["postId", "parentCommentId", "status", "createdAt"])
    .index("by_authorPersonId", ["authorPersonId"]),

  /** Fragments du compteur de réactions d'une publication (somme des fragments = total). */
  postReactionShards: defineTable({
    postId: v.id("posts"),
    shard: v.number(),
    like: v.number(),
    bravo: v.number(),
    soutien: v.number(),
    instructif: v.number(),
  }).index("by_post_and_shard", ["postId", "shard"]),
}
