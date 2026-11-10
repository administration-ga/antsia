/** MP09 : données volontaires bornées ; ni identité recopiée ni pièce jointe. */
import { defineTable } from "convex/server"
import { v } from "convex/values"

import { professionalCollaborationStatusValidator, professionalCollaborationTypeValidator, professionalEditableFields, professionalStateValidator } from "./validators"

export const professionalsTables = {
  professionalProfiles: defineTable({
    networkId: v.id("networks"), personId: v.id("persons"), revision: v.number(), state: professionalStateValidator,
    ...professionalEditableFields, consentTextVersion: v.string(), consentedAt: v.number(),
    publicConsentTextVersion: v.optional(v.string()), publicConsentAt: v.optional(v.number()), publicConsentRevokedAt: v.optional(v.number()),
    searchText: v.string(), createdAt: v.number(), updatedAt: v.number(), publishedAt: v.optional(v.number()), pausedAt: v.optional(v.number()),
  })
    .index("by_network_person", ["networkId", "personId"])
    .index("by_person", ["personId"])
    .index("by_network_state_updatedAt", ["networkId", "state", "updatedAt"])
    .searchIndex("search_profiles_v1", { searchField: "searchText", filterFields: ["networkId", "state", "visibility"] }),
  professionalCollaborations: defineTable({
    networkId: v.id("networks"), personIdLow: v.id("persons"), personIdHigh: v.id("persons"), fromPersonId: v.id("persons"), toPersonId: v.id("persons"),
    collaborationType: professionalCollaborationTypeValidator, message: v.string(), status: professionalCollaborationStatusValidator,
    revision: v.number(), createdAt: v.number(), proposedAt: v.number(), updatedAt: v.number(), respondedAt: v.optional(v.number()), cancelledAt: v.optional(v.number()), cancelledByPersonId: v.optional(v.id("persons")), cooldownUntil: v.number(),
  })
    .index("by_network_pair_status", ["networkId", "personIdLow", "personIdHigh", "status"])
    .index("by_network_pair_updatedAt", ["networkId", "personIdLow", "personIdHigh", "updatedAt"])
    .index("by_network_from_updatedAt", ["networkId", "fromPersonId", "updatedAt"])
    .index("by_network_to_updatedAt", ["networkId", "toPersonId", "updatedAt"])
    .index("by_from", ["fromPersonId"])
    .index("by_to", ["toPersonId"]),
}
