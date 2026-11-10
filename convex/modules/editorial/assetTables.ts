/** MP12 : fichiers de rédaction admis ; aucune URL persistée ni média repris d'autrui. */
import { defineTable } from "convex/server"
import { v } from "convex/values"

export const editorialAssetTables = {
  editorialAssets: defineTable({
    networkId: v.id("networks"), pageId: v.id("pages"), uploadedByPersonId: v.id("persons"),
    storageId: v.id("_storage"), mimeType: v.string(), sizeBytes: v.number(),
    altText: v.string(), credit: v.string(), rightsConsentTextVersion: v.string(), rightsConsentedAt: v.number(),
    createdAt: v.number(),
  }).index("by_page", ["pageId"]).index("by_network_uploader", ["networkId", "uploadedByPersonId"]),
}
