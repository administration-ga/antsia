// Dupliqué de socle/convex/modules/reseauPersonnel/tables.ts (l. 500-595 : `reseauPersonnel_stories`, `…StoryViews`) @ ad2e7fdc2 — adaptations : `networkId` sur la story et la vue (une story vit dans le réseau où elle est publiée) ; personnes ; surfaces `reseau`/`icom` (ADR-0079 du socle) retirées ; `viewCount` retiré du document (agrégat `engineCounters`, D02) ; média au validateur commun des médias du moteur ; index du plateau et de « ce que j'ai vu » préfixés par le réseau.
/**
 * Les STORIES — le contenu ÉPHÉMÈRE, 24 heures. Table à part, et non une
 * publication à date d'expiration : une story n'entre dans aucune fenêtre du
 * fil, n'est pas cherchable, et son blob EST purgé (avec sa ligne d'analyse).
 */
import { PERSONAL_REACH_AUDIENCES } from "@antsia/social-domain/content"
import { defineTable } from "convex/server"
import { v } from "convex/values"

import { literals } from "../../lib/validators"
import { storedMediaValidator } from "../media/media"

/** Une référence de catalogue ne possède ni copie du contenu, ni blob. */
export const dailySpecialMediaValidator = v.object({
  kind: v.literal("daily_special"),
  shopId: v.id("shops"),
  offerRef: v.string(),
  day: v.string(),
  revision: v.number(),
})

export const storiesTables = {
  /**
   * Une story : UN média (métadonnées RÉELLES du stockage), une légende courte,
   * vingt-quatre heures. `expiresAt` n'est jamais prolongé ; le retrait pose
   * `removedAt` et ramène `expiresAt` à maintenant — un seul chemin de purge.
   */
  stories: defineTable({
    networkId: v.id("networks"),
    authorPersonId: v.id("persons"),
    media: v.union(storedMediaValidator, dailySpecialMediaValidator),
    caption: v.optional(v.string()),
    /** `public` ou `connections`, rejugée à CHAQUE lecture : rompre une connexion referme la story. */
    audience: literals(PERSONAL_REACH_AUDIENCES),
    publishedAt: v.number(),
    expiresAt: v.number(),
    removedAt: v.optional(v.number()),
    idempotencyKey: v.optional(v.string()),
  })
    // Le plateau : les stories VIVANTES d'un auteur dans un réseau, dans l'index.
    .index("by_network_author_expiresAt", ["networkId", "authorPersonId", "expiresAt"])
    .index("by_network_daily_special_expiresAt", ["networkId", "media.shopId", "media.revision", "expiresAt"])
    // La fenêtre de la purge, la plus ancienne d'abord.
    .index("by_expiresAt", ["expiresAt"])
    .index("by_author_idempotency", ["authorPersonId", "idempotencyKey"]),

  /** « Vu » — une ligne par (story, spectateur) ; l'auteur n'en écrit jamais pour lui-même. */
  storyViews: defineTable({
    networkId: v.id("networks"),
    storyId: v.id("stories"),
    viewerPersonId: v.id("persons"),
    seenAt: v.number(),
  })
    .index("by_story_viewer", ["storyId", "viewerPersonId"])
    // « Vu par » — que SEUL l'auteur lit, les plus récents d'abord.
    .index("by_story_seenAt", ["storyId", "seenAt"])
    // Ce que J'AI vu dans ce réseau sur la fenêtre des 24 dernières heures : UNE lecture par plateau.
    .index("by_network_viewer_seenAt", ["networkId", "viewerPersonId", "seenAt"]),
}
