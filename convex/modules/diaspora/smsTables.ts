import { defineTable } from "convex/server"
import { v } from "convex/values"
import { literals } from "../../lib/validators"

export const smsStatus = literals(["received", "queued", "accepted", "sent", "delivered", "failed"] as const)
export const smsTables = {
  diasporaSmsPairings: defineTable({
    networkId: v.id("networks"),
    personId: v.id("persons"),
    label: v.string(),
    digest: v.string(),
    expiresAt: v.number(),
  })
    .index("by_digest", ["digest"])
    .index("by_personId", ["personId"]),
  diasporaSmsThreads: defineTable({
    networkId: v.id("networks"),
    personId: v.id("persons"),
    label: v.string(),
    active: v.boolean(),
    updatedAt: v.number(),
  }).index("by_personId", ["personId", "updatedAt"]),
  // Private address book of the relay. A stopped route remains briefly as a fence for delayed events.
  diasporaSmsRoutes: defineTable({
    networkId: v.id("networks"),
    workspace: v.string(),
    relay: v.string(),
    phone: v.string(),
    threadId: v.optional(v.id("diasporaSmsThreads")),
    changedAt: v.number(),
  })
    .index("by_phone", ["workspace", "relay", "phone"])
    .index("by_threadId", ["threadId"]),
  diasporaSmsMessages: defineTable({
    networkId: v.id("networks"),
    threadId: v.id("diasporaSmsThreads"),
    personId: v.id("persons"),
    body: v.string(),
    incoming: v.boolean(),
    status: smsStatus,
    createdAt: v.number(),
    requestId: v.optional(v.string()),
    providerId: v.optional(v.string()),
    statusAt: v.optional(v.number()),
  })
    .index("by_threadId", ["threadId", "createdAt"])
    .index("by_personId", ["personId"])
    .index("by_request", ["threadId", "requestId"])
    .index("by_provider", ["providerId"]),
  diasporaSmsDeliveries: defineTable({ key: v.string() }).index("by_key", ["key"]),
}
