// Dupliqué de socle/convex/modules/reseauPersonnel/tables.ts (l. 1135-1165, `reseauPersonnel_suggestionDismissals`) @ ad2e7fdc2 — adaptations : `networkId` (un masquage vaut dans le réseau où il est fait) ; personnes ; index préfixés par le réseau (D17).
/**
 * « Ne me proposez plus cette personne » — une préférence DURABLE et
 * réversible, propre à qui l'exprime : elle ne bloque rien et ne dit rien à
 * l'autre.
 */
import { defineTable } from "convex/server"
import { v } from "convex/values"

export const suggestionsTables = {
  suggestionDismissals: defineTable({
    networkId: v.id("networks"),
    personId: v.id("persons"),
    dismissedPersonId: v.id("persons"),
    createdAt: v.number(),
  })
    .index("by_network_person_dismissed", ["networkId", "personId", "dismissedPersonId"])
    .index("by_network_person_createdAt", ["networkId", "personId", "createdAt"])
    .index("by_dismissedPersonId", ["dismissedPersonId"]),
}
