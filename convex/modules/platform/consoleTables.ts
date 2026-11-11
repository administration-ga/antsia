/** PA7 : incidents opérateurs et comptages matérialisés, jamais des données de télémétrie externe. */
import { defineTable } from "convex/server"
import { v } from "convex/values"

export const incidentSeverityValidator = v.union(v.literal("info"), v.literal("warning"), v.literal("critical"))
export const metricStageValidator = v.union(v.literal("members"), v.literal("reports"), v.literal("appeals"), v.literal("files"), v.literal("deadLetters"), v.literal("done"))
export const metricCountsValidator = v.object({ members: v.number(), openReports: v.number(), openAppeals: v.number(), pendingFiles: v.number(), deadLetters: v.number() })

export const consoleTables = {
  consoleIncidents: defineTable({
    networkId: v.optional(v.id("networks")),
    title: v.string(),
    severity: incidentSeverityValidator,
    status: v.union(v.literal("open"), v.literal("resolved")),
    createdAt: v.number(),
    updatedAt: v.number(),
    openedByPersonId: v.optional(v.id("persons")),
    resolvedByPersonId: v.optional(v.id("persons")),
  }).index("by_network_createdAt", ["networkId", "createdAt"]).index("by_createdAt", ["createdAt"])
    .index("by_openedByPersonId", ["openedByPersonId"])
    .index("by_resolvedByPersonId", ["resolvedByPersonId"]),

  consoleMetrics: defineTable({
    networkId: v.id("networks"),
    generation: v.number(),
    stage: metricStageValidator,
    cursor: v.union(v.string(), v.null()),
    status: v.union(v.literal("building"), v.literal("ready")),
    counts: metricCountsValidator,
    startedAt: v.number(),
    generatedAt: v.optional(v.number()),
  }).index("by_network", ["networkId"]),
}
