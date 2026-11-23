/** PA8 : file réseau des recours, capacité administrateur vivante et projection réduite. */
import { paginationOptsValidator } from "convex/server"
import { v } from "convex/values"

import { fail, notFound } from "../../lib/errors"
import { networkQuery } from "../../lib/functions"
import { isAdministeredNetwork } from "../../lib/networkAdminIdentity"
import { sanctionKindValidator } from "./tables"

const appealRowValidator = v.object({
  appealId: v.id("appeals"), reportId: v.id("reports"), reason: v.string(), createdAt: v.number(),
  decisionReason: v.union(v.string(), v.null()),
  sanctions: v.array(v.object({ kind: sanctionKindValidator, until: v.union(v.number(), v.null()) })),
  canDecide: v.boolean(),
})

/**
 * Seules les décisions existantes reviewNetworkAppeal peuvent écrire ; cette porte n'octroie aucun rôle.
 * CH-815 A6 (ADR-0042) : un réseau qui a son application d'administration juge ses recours là
 * (`diaspora/moderationDesk.appealQueue`, `moderation/networkAdmin.reviewNetworkAppeal`) : refus indistinct ici.
 */
export const paginate = networkQuery({
  minStatus: "declaree",
  args: { paginationOpts: paginationOptsValidator },
  returns: v.object({ page: v.array(appealRowValidator), isDone: v.boolean(), continueCursor: v.string() }),
  handler: async (ctx, args) => {
    if (ctx.membership.role !== "network_admin" || isAdministeredNetwork(ctx.network)) return notFound()
    if (ctx.network.kind === "closed" && ctx.network.parentId !== ctx.rootNetwork._id) return notFound()
    const options = { ...args.paginationOpts, numItems: Math.min(20, Math.max(1, Math.trunc(args.paginationOpts.numItems))), maximumRowsRead: 20, maximumBytesRead: 1_048_576 }
    const result = await ctx.db.query("appeals").withIndex("by_network_status_createdAt", (q) => q.eq("networkId", ctx.networkId).eq("status", "open")).order("desc").paginate(options)
    const page = []
    for (const appeal of result.page) {
      if (appeal.level !== "network") continue
      const report = await ctx.db.get(appeal.reportId)
      if (!report || report.networkId !== ctx.networkId || report.level !== "team") continue
      const sanctions = await ctx.db.query("sanctions").withIndex("by_report", (q) => q.eq("reportId", report._id)).take(6)
      if (sanctions.length > 5) return fail("policyRefused")
      if (sanctions.some((sanction) => sanction.networkId !== ctx.networkId)) continue
      page.push({
        appealId: appeal._id, reportId: report._id, reason: appeal.reason, createdAt: appeal.createdAt,
        decisionReason: report.decisionReason ?? null,
        sanctions: sanctions.map((sanction) => ({ kind: sanction.kind, until: sanction.until ?? null })),
        canDecide: report.reviewedByPersonId !== ctx.person._id && appeal.personId !== ctx.person._id,
      })
    }
    return { page, isDone: result.isDone, continueCursor: result.continueCursor }
  },
})
