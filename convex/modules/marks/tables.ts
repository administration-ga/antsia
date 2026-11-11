// Dupliqué de socle/convex/modules/reseauPersonnel/tables.ts (l. 465-500, `reseauPersonnel_postMarks` et `reseauPersonnel_mutes`) @ ad2e7fdc2 — adaptations : `networkId` (le réseau DEPUIS lequel la marque est posée) en tête des index du lecteur ; personnes ; `by_post_and_kind` (les abonnés aux commentaires d'une publication, lus par la diffusion par lots).
/**
 * Marques d'un LECTEUR sur une publication (enregistrer, masquer, suivre les
 * commentaires) et mises en sourdine — des gestes silencieux, invisibles de
 * l'auteur, réversibles et listables. Une marque vaut dans le réseau où elle
 * est posée.
 */
import { defineTable } from "convex/server"
import { v } from "convex/values"

import { literals } from "../../lib/validators"

/** `bookmark` : enregistrer ; `hidden` : masquer de mon fil ; `notify` : suivre les commentaires. */
export const POST_MARK_KINDS = ["bookmark", "hidden", "notify"] as const
export type PostMarkKind = (typeof POST_MARK_KINDS)[number]
export const postMarkKindValidator = literals(POST_MARK_KINDS)

export const marksTables = {
  postMarks: defineTable({
    networkId: v.id("networks"),
    personId: v.id("persons"),
    postId: v.id("posts"),
    kind: postMarkKindValidator,
    createdAt: v.number(),
  })
    // Unicité et test d'existence en un seul coup.
    .index("by_network_person_kind_post", ["networkId", "personId", "kind", "postId"])
    // Mes marques d'un genre, les plus récentes d'abord.
    .index("by_network_person_kind_createdAt", ["networkId", "personId", "kind", "createdAt"])
    // Qui suit CETTE publication — la diffusion d'un nouveau commentaire (D08).
    .index("by_post_and_kind", ["postId", "kind"]),

  /**
   * SOURDINE — « ne plus voir les publications de cette personne dans mon
   * fil ». Ce n'est PAS le blocage : unilatérale, silencieuse, réversible, elle
   * ne vaut que pour le fil (la personne reste trouvable, son mur lisible).
   */
  mutes: defineTable({
    networkId: v.id("networks"),
    personId: v.id("persons"),
    mutedPersonId: v.id("persons"),
    createdAt: v.number(),
  })
    .index("by_network_person_muted", ["networkId", "personId", "mutedPersonId"])
    .index("by_network_person_createdAt", ["networkId", "personId", "createdAt"])
    .index("by_mutedPersonId", ["mutedPersonId"]),
}
