/** Passages PA5 bornés : échéances, restauration de réponses et transparence agrégée (délais légaux SU01d compris). */
import { isTerminalReportStatus, reportDeadlineOutcome } from "@antsia/social-domain/moderation"
import { TRANSPARENCY_MIN_CASES } from "@antsia/social-domain/moderationPolicy"
import { v } from "convex/values"

import { internal } from "../../_generated/api"
import { internalMutation } from "../../_generated/server"
import { networkQuery } from "../../lib/functions"
import { appendAudit } from "../platform/audit"
import { recordComment } from "../posts/counters"
import { refreshSuspension } from "./sanctions"
import { restoreTarget } from "./targets"

export const expireSanctions = internalMutation({
  args: {}, returns: v.null(),
  handler: async (ctx): Promise<null> => {
    const now = Date.now()
    const rows = await ctx.db.query("sanctions").withIndex("by_status_until", (q) => q.eq("status", "active").gte("until", 0).lte("until", now)).take(50)
    for (const row of rows) {
      await ctx.db.patch(row._id, { status: "expired", updatedAt: now })
      await refreshSuspension(ctx, row.personId)
      if (row.kind === "removal") {
        const report = await ctx.db.get(row.reportId)
        if (report) {
          await ctx.db.patch(report._id, { removedTarget: false, updatedAt: now })
          const remaining = await ctx.db.query("reports").withIndex("by_target_status", (q) => q.eq("targetKind", report.targetKind).eq("targetId", report.targetId).eq("status", "actioned")).take(101)
          if (remaining.length < 101 && !remaining.some((item) => item.removedTarget)) await restoreTarget(ctx, { target: report.target, networkId: report.networkId, ownerPersonId: report.ownerPersonId })
        }
      }
      await appendAudit(ctx, { action: "moderation.sanction_expire", capacity: "system", networkId: row.networkId, subject: { table: "sanctions", id: row._id }, details: { kind: row.kind }, at: now })
    }
    if (rows.length === 50) await ctx.scheduler.runAfter(0, internal.modules.moderation.maintenance.expireSanctions, {})
    return null
  },
})

export const restoreCommentReplies = internalMutation({
  args: { rootId: v.id("postComments"), removedAt: v.number() }, returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const root = await ctx.db.get(args.rootId)
    if (!root || root.status !== "published") return null
    const rows = await ctx.db.query("postComments").withIndex("by_post_parent_status_createdAt", (q) => q.eq("postId", root.postId).eq("parentCommentId", root._id).eq("status", "removed")).filter((q) => q.eq(q.field("removedAt"), args.removedAt)).take(100)
    for (const row of rows) {
      await ctx.db.patch(row._id, { status: "published", removedAt: undefined, updatedAt: Date.now() })
      await recordComment(ctx, row)
    }
    if (rows.length === 100) await ctx.scheduler.runAfter(0, internal.modules.moderation.maintenance.restoreCommentReplies, args)
    return null
  },
})

export const aggregateTransparency = internalMutation({
  args: { cursor: v.optional(v.union(v.string(), v.null())) }, returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const periodEnd = Math.floor(Date.now() / 86_400_000) * 86_400_000
    const networks = await ctx.db.query("networks").paginate({ numItems: 5, cursor: args.cursor ?? null })
    for (const network of networks.page) if (network.status === "active") await ctx.scheduler.runAfter(0, internal.modules.moderation.maintenance.aggregateNetwork, { networkId: network._id, periodStart: periodEnd - 86_400_000, periodEnd, cursor: null, cases: 0, distinctAuthors: 0, actioned: 0, dismissed: 0 })
    if (!networks.isDone) await ctx.scheduler.runAfter(0, internal.modules.moderation.maintenance.aggregateTransparency, { cursor: networks.continueCursor })
    return null
  },
})

export const aggregateNetwork = internalMutation({
  args: { networkId: v.id("networks"), periodStart: v.number(), periodEnd: v.number(), cursor: v.union(v.string(), v.null()), cases: v.number(), distinctAuthors: v.number(), actioned: v.number(), dismissed: v.number() }, returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const result = await ctx.db.query("reports").withIndex("by_network_createdAt", (q) => q.eq("networkId", args.networkId).gte("createdAt", args.periodStart).lt("createdAt", args.periodEnd)).paginate({ cursor: args.cursor, numItems: 100 })
    const cases = args.cases + result.page.length
    // Borne inférieure prudente : pas de liste d'identités transmise ni stockée entre lots.
    const distinctAuthors = Math.max(args.distinctAuthors, Math.min(TRANSPARENCY_MIN_CASES, new Set(result.page.flatMap((row) => row.ownerPersonId ? [row.ownerPersonId] : [])).size))
    const actioned = args.actioned + result.page.filter((row) => row.status === "actioned").length
    const dismissed = args.dismissed + result.page.filter((row) => row.status === "dismissed").length
    if (!result.isDone) {
      await ctx.scheduler.runAfter(0, internal.modules.moderation.maintenance.aggregateNetwork, { ...args, cursor: result.continueCursor, cases, distinctAuthors, actioned, dismissed })
      return null
    }
    const data = { networkId: args.networkId, periodStart: args.periodStart, periodEnd: args.periodEnd, cases, distinctAuthors, actioned, dismissed, generatedAt: Date.now() }
    const existing = await ctx.db.query("moderationTransparency").withIndex("by_network_period", (q) => q.eq("networkId", args.networkId).eq("periodStart", args.periodStart)).unique()
    const reportId = existing?._id ?? await ctx.db.insert("moderationTransparency", data)
    if (existing) await ctx.db.patch(existing._id, data)
    await appendAudit(ctx, { action: "moderation.transparency_compute", capacity: "system", networkId: args.networkId, subject: { table: "moderationTransparency", id: reportId }, details: { periodStart: args.periodStart, periodEnd: args.periodEnd } })
    await ctx.scheduler.runAfter(0, internal.modules.moderation.maintenance.aggregateNetworkDeadlines, { networkId: args.networkId, periodStart: args.periodStart, periodEnd: args.periodEnd, cursor: null, met: 0, missed: 0, authors: 0 })
    return null
  },
})

/**
 * SU01d — second passage : les échéances légales TOMBÉES pendant la période (`dueAt`), tenues ou
 * manquées (`reportDeadlineOutcome`). Le passage quotidien mesure la veille : à son heure, toutes
 * ses échéances sont passées et chaque issue est définitive. Mêmes bornes que le premier passage :
 * cent dossiers par mutation, tous statuts mêlés, aucune identité transmise entre lots.
 */
export const aggregateNetworkDeadlines = internalMutation({
  args: { networkId: v.id("networks"), periodStart: v.number(), periodEnd: v.number(), cursor: v.union(v.string(), v.null()), met: v.number(), missed: v.number(), authors: v.number() }, returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const now = Date.now()
    const result = await ctx.db.query("reports").withIndex("by_network_dueAt", (q) => q.eq("networkId", args.networkId).gte("dueAt", args.periodStart).lt("dueAt", args.periodEnd)).paginate({ cursor: args.cursor, numItems: 100 })
    let { met, missed } = args
    for (const row of result.page) {
      if (row.dueAt === undefined) continue
      const outcome = reportDeadlineOutcome({ status: row.status, dueAt: row.dueAt, decidedAt: isTerminalReportStatus(row.status) ? row.reviewedAt ?? row.updatedAt : null }, now)
      if (outcome === "met") met++
      else if (outcome === "missed") missed++
    }
    // Borne inférieure prudente, comme le premier passage : pas de liste d'identités entre lots.
    const authors = Math.max(args.authors, Math.min(TRANSPARENCY_MIN_CASES, new Set(result.page.flatMap((row) => row.ownerPersonId ? [row.ownerPersonId] : [])).size))
    if (!result.isDone) {
      await ctx.scheduler.runAfter(0, internal.modules.moderation.maintenance.aggregateNetworkDeadlines, { ...args, cursor: result.continueCursor, met, missed, authors })
      return null
    }
    const row = await ctx.db.query("moderationTransparency").withIndex("by_network_period", (q) => q.eq("networkId", args.networkId).eq("periodStart", args.periodStart)).unique()
    if (row) await ctx.db.patch(row._id, { legalMet: met, legalMissed: missed, legalAuthors: authors })
    return null
  },
})

export const transparency = networkQuery({
  args: { periodStart: v.number() },
  handler: async (ctx, args) => {
    const row = await ctx.db.query("moderationTransparency").withIndex("by_network_period", (q) => q.eq("networkId", ctx.networkId).eq("periodStart", args.periodStart)).unique()
    if (!row || row.cases < TRANSPARENCY_MIN_CASES || row.distinctAuthors < TRANSPARENCY_MIN_CASES) return null
    // Une sous-catégorie trop petite est supprimée, sans permettre le calcul par différence.
    return { periodStart: row.periodStart, periodEnd: row.periodEnd, cases: row.cases, actioned: row.actioned >= TRANSPARENCY_MIN_CASES && row.cases - row.actioned >= TRANSPARENCY_MIN_CASES ? row.actioned : null, dismissed: row.dismissed >= TRANSPARENCY_MIN_CASES && row.cases - row.dismissed >= TRANSPARENCY_MIN_CASES ? row.dismissed : null }
  },
})
