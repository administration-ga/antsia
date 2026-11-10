/** MP13 : une discussion sociale canonique par article, sans copie de contenu éditorial. */
import { defineTable } from "convex/server"
import { v } from "convex/values"

export const editorialSocialTables = {
  editorialSocialLinks: defineTable({
    networkId: v.id("networks"), pageId: v.id("pages"), articleId: v.id("editorialArticles"), postId: v.id("posts"),
    commentsEnabled: v.boolean(), revision: v.number(), announcedByPersonId: v.id("persons"), announcedAt: v.number(),
    updatedByPersonId: v.id("persons"), updatedAt: v.number(),
  }).index("by_article", ["articleId"]).index("by_post", ["postId"]).index("by_page", ["pageId"]).index("by_actor", ["announcedByPersonId"]),
}
