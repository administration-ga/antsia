// Dupliqué de socle/convex/modules/reseauPersonnel/moderation.ts @ ad2e7fdc2 — adaptations : signaler dans un réseau (`networkMutation`, adhésion, débit), contenu re-gardé par la garde du moteur (contexte de lecture, blocage) ; la file et la décision passent du back-office de plateforme (`isPlatformAdmin`) aux MODÉRATEURS et ADMINISTRATEURS du réseau du contenu, l'opérateur de plateforme en dernier ressort (`decideAsOperator`) ; motifs et transitions du domaine ; motif de décision borné (`assertDecisionReason`) ; `appendContextAudit` → journal du moteur (`appendAudit`, avec la qualité du décideur) ; retrait par les aides du moteur (agrégats décomptés) ; refus à code.
/**
 * Signalement lecteur et file de modération du réseau.
 *
 * Les DTO de file ne contiennent ni corps de contenu, ni identité du déclarant,
 * ni auteur : l'auteur ne peut jamais apprendre qui l'a signalé, et une file ne
 * devient pas une voie de lecture dérobée — le modérateur ouvre le contenu par
 * les lectures ordinaires, avec leur garde.
 */
import { assertDecisionReason, type AuditCapacity } from "@antsia/social-domain/audit"
import { canDecideReport, CONTENT_REPORT_DECISIONS, CONTENT_REPORT_NOTE_MAX, type ContentReportDecision } from "@antsia/social-domain/moderation"
import { paginationOptsValidator, type PaginationResult } from "convex/server"
import { v } from "convex/values"

import type { Doc, Id } from "../../_generated/dataModel"
import type { MutationCtx } from "../../_generated/server"
import { checked, fail, notFound } from "../../lib/errors"
import { networkMutation, networkQuery, operatorMutation } from "../../lib/functions"
import { enforceRateLimit } from "../../lib/rateLimit"
import { literals } from "../../lib/validators"
import { appendAudit, type AuditEntry, networkRoleCapacity, operatorCapacity } from "../platform/audit"
import { notifyPerson } from "../notifications/notify"
import { assertVisiblePost, type ReaderContext } from "../posts/access"
import { markCommentRemoved, markPostRemoved } from "../posts/contentRemoval"
import { requireReportCapacity } from "./cases"
import { acknowledgeReport, legalDeadlineColumns, notifyReporterOfDecision } from "./reporterNotices"
import { contentReportReasonValidator, contentReportStatusValidator } from "./tables"

const readerOf = (ctx: { person: Doc<"persons">; network: Doc<"networks"> }): ReaderContext => ({ personId: ctx.person._id, network: ctx.network })

/** La note facultative du déclarant, nettoyée et bornée. */
function boundedNote(note: string | undefined): string | undefined {
  const trimmed = note?.trim()
  if (!trimmed) return undefined
  if (trimmed.length > CONTENT_REPORT_NOTE_MAX) return fail("invalidArgument", { field: "note" })
  return trimmed
}

/** Signaler, c'est aussi ne plus voir : la publication est masquée pour le déclarant, dans le réseau où il signale. */
async function hideForReporter(ctx: MutationCtx, networkId: Id<"networks">, personId: Id<"persons">, postId: Id<"posts">): Promise<void> {
  const existing = await ctx.db
    .query("postMarks")
    .withIndex("by_network_person_kind_post", (q) => q.eq("networkId", networkId).eq("personId", personId).eq("kind", "hidden").eq("postId", postId))
    .unique()
  if (!existing) await ctx.db.insert("postMarks", { networkId, personId, postId, kind: "hidden", createdAt: Date.now() })
}

const reportResultValidator = v.object({ reportId: v.id("contentReports"), created: v.boolean(), hidden: v.literal(true) })

async function fileReport(
  ctx: MutationCtx & { networkId: Id<"networks">; person: Doc<"persons"> },
  target: { kind: "post" | "comment"; post: Doc<"posts">; commentId?: Id<"postComments"> },
  reason: Doc<"contentReports">["reason"],
  note: string | undefined,
) {
  const existing = await ctx.db
    .query("contentReports")
    .withIndex("by_reporter_target", (q) => q.eq("reporterPersonId", ctx.person._id).eq("targetKind", target.kind).eq("postId", target.post._id).eq("commentId", target.commentId))
    .unique()
  await hideForReporter(ctx, ctx.networkId, ctx.person._id, target.post._id)
  if (existing) return { reportId: existing._id, created: false, hidden: true as const }
  const now = Date.now()
  const comment = target.commentId ? await ctx.db.get(target.commentId) : null
  const polymorphicTarget = target.kind === "post" ? { kind: "post" as const, id: target.post._id } : { kind: "comment" as const, id: target.commentId! }
  const teams = await ctx.db.query("moderationTeams").withIndex("by_network_active", (q) => q.eq("networkId", target.post.networkId).eq("active", true)).take(101)
  if (teams.length > 100) return fail("policyRefused")
  const team = teams.find((row) => row.scope === target.kind) ?? teams.find((row) => row.scope === undefined)
  const polymorphicId = await ctx.db.insert("reports", { networkId: target.post.networkId, target: polymorphicTarget, targetKind: target.kind, targetId: polymorphicTarget.id, ownerPersonId: comment?.authorPersonId ?? target.post.authorPersonId, reporterPersonId: ctx.person._id, reporterNetworkId: ctx.networkId, reason, ...legalDeadlineColumns(reason, now), ...(team ? { teamId: team._id } : {}), level: team ? "team" : "network", status: "open", createdAt: now, updatedAt: now })
  const reportId = await ctx.db.insert("contentReports", {
    networkId: target.post.networkId,
    reportId: polymorphicId,
    targetKind: target.kind,
    postId: target.post._id,
    ...(target.commentId !== undefined ? { commentId: target.commentId } : {}),
    reporterPersonId: ctx.person._id,
    reason,
    ...(note !== undefined ? { note } : {}),
    status: "open",
    createdAt: now,
    updatedAt: now,
  })
  // SU01d (art. 24) : l'accusé de réception part avec la transmission.
  await acknowledgeReport(ctx, polymorphicId)
  return { reportId, created: true, hidden: true as const }
}

/** Signaler une publication qu'on VOIT — jamais la sienne (refus indistinct). Un second signalement se dédoublonne. */
export const reportPost = networkMutation({
  minStatus: "en_attente",
  args: { postId: v.id("posts"), reason: contentReportReasonValidator, note: v.optional(v.string()) },
  returns: reportResultValidator,
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, "report.create", ctx.person._id)
    const note = boundedNote(args.note)
    const prior = await ctx.db.query("contentReports").withIndex("by_reporter_target", (q) => q.eq("reporterPersonId", ctx.person._id).eq("targetKind", "post").eq("postId", args.postId).eq("commentId", undefined)).unique()
    if (prior) return { reportId: prior._id, created: false, hidden: true as const }
    const post = await assertVisiblePost(ctx, readerOf(ctx), args.postId)
    if (post.authorPersonId === ctx.person._id || post.status !== "published") return notFound()
    return await fileReport(ctx, { kind: "post", post }, args.reason, note)
  },
})

/** Signaler un commentaire vivant d'une publication qu'on VOIT — jamais le sien. */
export const reportComment = networkMutation({
  minStatus: "en_attente",
  args: { commentId: v.id("postComments"), reason: contentReportReasonValidator, note: v.optional(v.string()) },
  returns: reportResultValidator,
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, "report.create", ctx.person._id)
    const note = boundedNote(args.note)
    const comment = await ctx.db.get(args.commentId)
    if (!comment || comment.status !== "published") return notFound()
    const prior = await ctx.db.query("contentReports").withIndex("by_reporter_target", (q) => q.eq("reporterPersonId", ctx.person._id).eq("targetKind", "comment").eq("postId", comment.postId).eq("commentId", comment._id)).unique()
    if (prior) return { reportId: prior._id, created: false, hidden: true as const }
    const post = await assertVisiblePost(ctx, readerOf(ctx), comment.postId)
    if (comment.authorPersonId === ctx.person._id) return notFound()
    return await fileReport(ctx, { kind: "comment", post, commentId: comment._id }, args.reason, note)
  },
})

export type QueueItemDto = {
  reportId: Id<"contentReports">
  targetKind: "post" | "comment"
  postId: Id<"posts">
  commentId: Id<"postComments"> | null
  reason: Doc<"contentReports">["reason"]
  note: string | null
  status: Doc<"contentReports">["status"]
  createdAt: number
  reviewedAt: number | null
  decisionReason: string | null
}

/**
 * La file du réseau, la plus ancienne d'abord — ses modérateurs et
 * administrateurs. Tout autre membre reçoit le refus indistinct.
 */
export const paginateQueue = networkQuery({
  minStatus: "declaree",
  args: { status: v.optional(contentReportStatusValidator), paginationOpts: paginationOptsValidator },
  handler: async (ctx, args): Promise<PaginationResult<QueueItemDto>> => {
    if (!networkRoleCapacity(ctx.membership.role)) return notFound()
    const result = await ctx.db
      .query("contentReports")
      .withIndex("by_network_status_createdAt", (q) => q.eq("networkId", ctx.networkId).eq("status", args.status ?? "open"))
      .paginate(args.paginationOpts)
    const eligible: Doc<"contentReports">[] = []
    for (const row of result.page) {
      const linked = row.reportId ? await ctx.db.get(row.reportId) : null
      if (!linked || await requireReportCapacity(ctx, ctx, linked)) eligible.push(row)
    }
    return {
      ...result,
      page: eligible.map((row) => ({
        reportId: row._id,
        targetKind: row.targetKind,
        postId: row.postId,
        commentId: row.commentId ?? null,
        reason: row.reason,
        note: row.note ?? null,
        status: row.status,
        createdAt: row.createdAt,
        reviewedAt: row.reviewedAt ?? null,
        decisionReason: row.decisionReason ?? null,
      })),
    }
  },
})

/**
 * Trancher un dossier : motivé, et — s'il est suivi d'effet — le contenu est
 * retiré (agrégats décomptés). Rend la ligne de journal que le DÉCIDEUR écrit
 * lui-même (`appendAudit`, cliquet `operator-audit`) : qui, à quel titre,
 * avant/après et pourquoi, avec les seuls identifiants de la cible — ni le
 * texte, ni la note, ni l'identité du déclarant.
 */
async function decideReport(
  ctx: MutationCtx,
  args: { report: Doc<"contentReports">; status: ContentReportDecision; decisionReason: string; actorPersonId: Id<"persons">; capacity: AuditCapacity },
): Promise<AuditEntry> {
  const { report } = args
  if (!canDecideReport(report.status, args.status)) return fail("conflict")
  const decisionReason = checked(() => assertDecisionReason(args.decisionReason, 3))
  const now = Date.now()
  await ctx.db.patch(report._id, { status: args.status, decisionReason, reviewedByPersonId: args.actorPersonId, reviewedAt: now, updatedAt: now })
  if (report.reportId) await ctx.db.patch(report.reportId, { status: args.status, decisionReason, reviewedByPersonId: args.actorPersonId, reviewedAt: now, updatedAt: now, removedTarget: args.status === "actioned" })
  let targetRemoved = false
  if (args.status === "actioned") {
    if (report.targetKind === "post") {
      const post = await ctx.db.get(report.postId)
      if (post) {
        targetRemoved = post.status !== "removed"
        await markPostRemoved(ctx, post, now)
      }
    } else if (report.commentId) {
      const comment = await ctx.db.get(report.commentId)
      if (comment) {
        targetRemoved = comment.status !== "removed"
        await markCommentRemoved(ctx, comment, now)
      }
    }
  }
  if (report.reportId && args.status === "actioned") {
    const linked = await ctx.db.get(report.reportId)
    if (linked?.ownerPersonId) await notifyPerson(ctx, { networkId: linked.networkId, recipientPersonId: linked.ownerPersonId, kind: "moderation_decision", subject: { report: linked._id } })
  }
  // SU01d (art. 24) : un dossier fermé (classé ou suivi d'effet) est notifié au déclarant ; l'examen n'est pas une décision.
  if (report.reportId && args.status !== "reviewing") await notifyReporterOfDecision(ctx, report.reportId)
  return {
    action: "moderation.report_decide",
    capacity: args.capacity,
    actorPersonId: args.actorPersonId,
    networkId: report.networkId,
    subject: { table: "contentReports", id: report._id },
    details: {
      targetKind: report.targetKind,
      postId: report.postId,
      commentId: report.commentId ?? null,
      reportReason: report.reason,
      previousStatus: report.status,
      status: args.status,
      decisionReason,
      targetRemoved,
    },
    at: now,
  }
}

const decisionArgs = { reportId: v.id("contentReports"), status: literals(CONTENT_REPORT_DECISIONS), decisionReason: v.string() }

/** Trancher un dossier de MON réseau — modérateur ou administrateur. */
export const decide = networkMutation({
  minStatus: "declaree",
  args: decisionArgs,
  returns: v.object({ status: literals(CONTENT_REPORT_DECISIONS) }),
  handler: async (ctx, args) => {
    const report = await ctx.db.get(args.reportId)
    if (!report || report.networkId !== ctx.networkId) return notFound()
    const linked = report.reportId ? await ctx.db.get(report.reportId) : null
    const capacity = linked ? await requireReportCapacity(ctx, ctx, linked) : networkRoleCapacity(ctx.membership.role)
    if (!capacity) return notFound()
    await enforceRateLimit(ctx, "moderation.decide", ctx.person._id)
    await appendAudit(ctx, await decideReport(ctx, { report, status: args.status, decisionReason: args.decisionReason, actorPersonId: ctx.person._id, capacity }))
    return { status: args.status }
  },
})

/** L'opérateur de plateforme, en DERNIER RESSORT, sur un dossier de n'importe quel réseau — tracé comme tel. */
export const decideAsOperator = operatorMutation({
  args: decisionArgs,
  returns: v.object({ status: literals(CONTENT_REPORT_DECISIONS) }),
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, "moderation.decide", ctx.person._id)
    const report = await ctx.db.get(args.reportId)
    if (!report) return notFound()
    await appendAudit(ctx, await decideReport(ctx, { report, status: args.status, decisionReason: args.decisionReason, actorPersonId: ctx.person._id, capacity: operatorCapacity(ctx.operator) }))
    return { status: args.status }
  },
})
