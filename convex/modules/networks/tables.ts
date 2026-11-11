/**
 * Tables du module `networks` (cahier §7, §11) : un réseau = une ligne. Aucune
 * suppression : un réseau s'archive. Chaque changement de réglage laisse une
 * trace dans `networkSettingsHistory`.
 */
import { defineTable } from "convex/server"
import { v } from "convex/values"

import {
  contentVisibilityValidator,
  facetSchemaValidator,
  membershipPolicyValidator,
  networkKindValidator,
  networkSliceValidator,
  networkStatusValidator,
} from "../../lib/validators"

/** Réglages d'un réseau — ce que la console modifie et ce que l'historique fige. */
export const networkSettingsFields = {
  name: v.string(),
  membershipPolicy: membershipPolicyValidator,
  defaultVisibility: contentVisibilityValidator,
  facetSchema: v.optional(facetSchemaValidator),
  reachValues: v.array(v.string()),
  openCountries: v.optional(v.array(v.string())),
  theme: v.string(),
}

export const networksTables = {
  networkArchiveRequests: defineTable({
    networkId: v.id("networks"), requestedByPersonId: v.optional(v.id("persons")),
    requesterSessionProofId: v.id("operatorSessionProofs"),
    reason: v.string(), expectedUpdatedAt: v.number(),
    settingsVersion: v.optional(v.id("networkSettingsHistory")),
    status: v.union(v.literal("pending"), v.literal("approved"), v.literal("cancelled")),
    requestedAt: v.number(), expiresAt: v.number(),
    approvedByPersonId: v.optional(v.id("persons")), decidedAt: v.optional(v.number()),
  }).index("by_network_status_expiry", ["networkId", "status", "expiresAt"])
    .index("by_approvedByPersonId", ["approvedByPersonId"])
    .index("by_requestedByPersonId", ["requestedByPersonId"]),

  networks: defineTable({
    slug: v.string(),
    kind: networkKindValidator,
    parentId: v.optional(v.id("networks")),
    /**
     * La tranche qui GOUVERNE l'entrée et les facettes (`NETWORK_SLICES`) : posée
     * à la création, jamais par un réglage de console. Les chemins génériques
     * refusent alors (`policyRefused`) ; quitter reste ouvert.
     */
    managedBy: v.optional(networkSliceValidator),
    ...networkSettingsFields,
    status: networkStatusValidator,
    createdAt: v.number(),
    updatedAt: v.number(),
    archivedAt: v.optional(v.number()),
  })
    .index("by_slug", ["slug"])
    .index("by_kind_and_status", ["kind", "status"])
    .index("by_parent_and_status", ["parentId", "status"]),

  networkSettingsHistory: defineTable({
    networkId: v.id("networks"),
    actorPersonId: v.optional(v.id("persons")),
    kind: v.union(v.literal("created"), v.literal("updated"), v.literal("archived")),
    settings: v.object({ ...networkSettingsFields, status: networkStatusValidator }),
    reason: v.optional(v.string()),
    at: v.number(),
  }).index("by_network_and_at", ["networkId", "at"])
    .index("by_actorPersonId", ["actorPersonId"]),
}
