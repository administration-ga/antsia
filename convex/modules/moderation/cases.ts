/** PA5 : dossiers polymorphes, compétence vivante, décisions et recours sans copie de contenu. */
import { assertDecisionReason, type AuditCapacity } from "@antsia/social-domain/audit"
import { reportOutcome } from "@antsia/social-domain/moderation"
import { normalizeBlockedTerm, validSanctionDuration } from "@antsia/social-domain/moderationPolicy"
import { parseCommercePublicBody } from "@antsia/social-domain/commerce/projection"
import { paginationOptsValidator } from "convex/server"
import { v } from "convex/values"

import type { Doc, Id } from "../../_generated/dataModel"
import type { MutationCtx, QueryCtx } from "../../_generated/server"
import { getMembership, getRootNetwork, isActiveMember } from "../../lib/access"
import { checked, fail, notFound } from "../../lib/errors"
import { networkMutation, networkQuery, operatorMutation, operatorQuery, personMutation, personQuery } from "../../lib/functions"
import { enforceRateLimit } from "../../lib/rateLimit"
import { contextualDecisionConflict } from "../contextualMessaging/access"
import { editorialAccessOrNull } from "../editorial/access"
import { notifyPerson } from "../notifications/notify"
import { liveSignatoryRole, signatoryRowsOf } from "../pages/access"
import { appendAudit, networkRoleCapacity, operatorCapacity } from "../platform/audit"
import { contentState, owningPageOfReport } from "./policy"
import { professionalReviewSource } from "./professionalReviewSource"
import { editorialMediaReviewSource, editorialReviewSource } from "./editorialReviewSource"
import { acknowledgeReport, legalDeadlineColumns, notifyReporterOfDecision } from "./reporterNotices"
import { refreshSuspension } from "./sanctions"
import { contentReportStatusValidator, moderationSurfaceValidator, moderationTargetValidator, sanctionKindValidator } from "./tables"
import { removeTarget, resolveVisibleTarget, restoreTarget } from "./targets"

type ReadCtx = Pick<QueryCtx, "db">
type NetworkActor = { networkId: Id<"networks">; person: Doc<"persons">; membership: Doc<"networkMemberships"> }

const motiveOf = (reason: string) => checked(() => assertDecisionReason(reason, 3))
const pageOptions = (opts: { cursor: string | null; numItems: number }) => ({ ...opts, numItems: Math.max(1, Math.min(50, opts.numItems)) })

/** Une signature de page ne permet jamais de modérer son propre contenu collectif. */
async function assertNoPageDecisionConflict(ctx: ReadCtx, actorPersonId: Id<"persons">, target: Doc<"reports">["target"]): Promise<void> {
  // CC-2b : une partie au fil contextuel, ou un signataire vivant de sa page, ne tranche jamais un dossier de ce fil.
  if (target.kind === "contextualMessage" && (await contextualDecisionConflict(ctx, target.id, actorPersonId))) return notFound()
  if (target.kind === "professionalCollaboration") {
    const collaboration = await ctx.db.get(target.id)
    if (collaboration && (collaboration.fromPersonId === actorPersonId || collaboration.toPersonId === actorPersonId)) return notFound()
  }
  if (target.kind === "editorialMedia") {
    const media = await ctx.db.get(target.id)
    if (media && (media.createdByPersonId === actorPersonId || await editorialAccessOrNull(ctx, { networkId: media.networkId, personId: actorPersonId }, media.pageId))) return notFound()
  }
  if (target.kind === "editorialVersion") {
    const version = await ctx.db.get(target.id)
    if (version && (version.authorPersonId === actorPersonId || await editorialAccessOrNull(ctx, { networkId: version.networkId, personId: actorPersonId }, version.pageId))) return notFound()
  }
  const state = await contentState(ctx, target.kind, target.id)
  if (!state?.ownerPageId) return
  const page = await ctx.db.get(state.ownerPageId)
  if (page && await liveSignatoryRole(ctx, page, actorPersonId) !== null) return notFound()
}

/** Une décision commerciale ou professionnelle porte sur la révision effectivement présentée. */
async function assertCatalogReviewSource(ctx: ReadCtx, networkId: Id<"networks">, target: Doc<"reports">["target"], expectedRevision?: number, expectedDigest?: string): Promise<void> {
  if (target.kind === "editorialMedia") {
    if (expectedRevision === undefined || !Number.isSafeInteger(expectedRevision) || expectedRevision < 1 || expectedDigest === undefined || !/^[a-f0-9]{64}$/.test(expectedDigest)) return notFound()
    const source = await editorialMediaReviewSource(ctx, networkId, target.id)
    if (!source || source.sourceRevision !== expectedRevision || source.sourceDigest !== expectedDigest) return notFound()
    return
  }
  if (target.kind === "editorialVersion") {
    if (expectedRevision === undefined || !Number.isSafeInteger(expectedRevision) || expectedRevision < 1 || expectedDigest === undefined || !/^[a-f0-9]{64}$/.test(expectedDigest)) return notFound()
    const source = await editorialReviewSource(ctx, networkId, target.id)
    if (!source || source.sourceRevision !== expectedRevision || source.sourceDigest !== expectedDigest) return notFound()
    return
  }
  if (target.kind === "professionalProfile" || target.kind === "professionalCollaboration") {
    if (expectedRevision === undefined || !Number.isSafeInteger(expectedRevision) || expectedRevision < 1 || expectedDigest === undefined || !/^[a-f0-9]{64}$/.test(expectedDigest)) return notFound()
    const source = await professionalReviewSource(ctx, networkId, target)
    if (!source || source.sourceRevision !== expectedRevision || source.sourceDigest !== expectedDigest) return notFound()
    return
  }
  if (target.kind !== "commerceStorefront" && target.kind !== "commerceOffer") return
  // Dette historique distincte : les anciens appelants commerceOffer sans preuve gardent
  // leur admission. Les nouveaux aperçus/UI transmettent toujours la paire ; aucun repli
  // n'est admis pour les conditions de vitrine ajoutées par MP05.
  const head = await ctx.db.get(target.id)
  if (target.kind === "commerceOffer" && expectedRevision === undefined && expectedDigest === undefined) {
    if (!head || head.networkId !== networkId || head.objectKind !== "offer" || head.sequence !== "catalog" || head.state !== "active") return notFound()
    const parsed = parseCommercePublicBody(head.body, Date.now())
    if (!parsed.ok || (parsed.value.payload.type !== "offer.published" && parsed.value.payload.type !== "offer.updated")) return notFound()
    if (!parsed.value.payload.serviceProfile) return
  }
  if (expectedRevision === undefined || !Number.isSafeInteger(expectedRevision) || expectedRevision < 1 || expectedDigest === undefined || !/^[a-f0-9]{64}$/.test(expectedDigest)) return notFound()
  if (!head || head.networkId !== networkId || head.objectKind !== (target.kind === "commerceStorefront" ? "shop" : "offer") || head.sequence !== "catalog" || head.state !== "active" || head.revision !== expectedRevision || head.digest !== expectedDigest) return notFound()
}

/**
 * P16 : un dossier SANS propriétaire personnel (contenu porté par une page : offre ou poste
 * reflétés, réponse d'avis, évènement de page, contenus de page DIASPORALE) s'annonce par un
 * avis NEUTRE — ni acteur, ni contenu, ni motif dans la cloche — à chaque signataire VIVANT de
 * cette page (borné par le plafond des signataires). La porte des avis relit ce droit.
 */
async function notifyPageCase(ctx: MutationCtx, row: Pick<Doc<"reports">, "_id" | "networkId" | "ownerPersonId" | "target">): Promise<void> {
  const page = await owningPageOfReport(ctx, row)
  if (!page) return
  for (const signatory of await signatoryRowsOf(ctx, page._id)) {
    if (signatory.acceptedAt === undefined || (await liveSignatoryRole(ctx, page, signatory.personId)) === null) continue
    await notifyPerson(ctx, { networkId: row.networkId, recipientPersonId: signatory.personId, kind: "moderation_decision", subject: { report: row._id } })
  }
}

export async function teamCapacity(ctx: ReadCtx, actor: NetworkActor, scope: string, teamId?: Id<"moderationTeams">): Promise<AuditCapacity | null> {
  if (actor.membership.role === "network_admin") return "network_admin"
  if (teamId === undefined) return networkRoleCapacity(actor.membership.role)
  const team = await ctx.db.get(teamId)
  if (!team || !team.active || team.networkId !== actor.networkId || (team.scope !== undefined && team.scope !== scope)) return null
  const member = await ctx.db.query("moderationTeamMembers").withIndex("by_team_person", (q) => q.eq("teamId", teamId).eq("personId", actor.person._id)).unique()
  return member?.active ? "network_moderator" : null
}

export async function requireReportCapacity(ctx: ReadCtx, actor: NetworkActor, row: Doc<"reports">): Promise<AuditCapacity | null> {
  return await teamCapacity(ctx, actor, row.targetKind, row.teamId)
}

async function requireNetworkAdmin(actor: NetworkActor): Promise<void> {
  if (actor.membership.role !== "network_admin") return notFound()
}

function queueDto(row: Doc<"reports">) {
  return { reportId: row._id, networkId: row.networkId, target: row.target, teamId: row.teamId ?? null, level: row.level, reason: row.reason, status: row.status, createdAt: row.createdAt, decisionReason: row.decisionReason ?? null }
}

/** SU01d : la ligne d'une file de modération, avec son délai légal et la date de l'accusé de réception — jamais le déclarant. */
function moderatorQueueDto(row: Doc<"reports">) {
  return { ...queueDto(row), legalBasis: row.legalBasis ?? null, dueAt: row.dueAt ?? null, acknowledgedAt: row.acknowledgedAt ?? null }
}

/** SU01d : la file des délais légaux montre au plus les 50 échéances les plus proches. */
export const DEADLINE_QUEUE_MAX = 50

/** Capacités vivantes pour l'entrée nationale, sans création de rôle ni divulgation des coéquipiers. */
export const myCapacity = networkQuery({
  minStatus: "declaree",
  args: {},
  returns: v.object({ networkWide: v.boolean(), canReviewAppeals: v.boolean(), teams: v.array(v.object({ teamId: v.id("moderationTeams"), name: v.string(), scope: v.union(moderationSurfaceValidator, v.null()) })) }),
  handler: async (ctx) => {
    const rows = await ctx.db.query("moderationTeams").withIndex("by_network_active", (q) => q.eq("networkId", ctx.networkId).eq("active", true)).take(101)
    if (rows.length > 100) return fail("policyRefused")
    const teams = []
    for (const team of rows) {
      const member = await ctx.db.query("moderationTeamMembers").withIndex("by_team_person", (q) => q.eq("teamId", team._id).eq("personId", ctx.person._id)).unique()
      if (ctx.membership.role === "network_admin" || member?.active) teams.push({ teamId: team._id, name: team.name, scope: team.scope ?? null })
    }
    return { networkWide: ctx.membership.role === "network_admin" || ctx.membership.role === "network_moderator", canReviewAppeals: ctx.membership.role === "network_admin", teams }
  },
})

export const report = networkMutation({
  minStatus: "en_attente",
  args: { target: moderationTargetValidator, reason: v.string() },
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, "report.create", ctx.person._id)
    const reason = args.reason.trim()
    if (!/^[a-z][a-z0-9_]{2,79}$/.test(reason)) return fail("invalidArgument", { field: "reason" })
    const existing = await ctx.db.query("reports").withIndex("by_reporter_target", (q) => q.eq("reporterPersonId", ctx.person._id).eq("targetKind", args.target.kind).eq("targetId", args.target.id)).unique()
    if (existing) return { reportId: existing._id, created: false, hidden: true }
    const target = await resolveVisibleTarget(ctx, ctx.network, ctx.person._id, args.target)
    if (target.ownerPersonId === ctx.person._id) return notFound()
    const teams = await ctx.db.query("moderationTeams").withIndex("by_network_active", (q) => q.eq("networkId", target.networkId).eq("active", true)).take(101)
    if (teams.length > 100) return fail("policyRefused")
    const team = teams.find((row) => row.scope === args.target.kind) ?? teams.find((row) => row.scope === undefined)
    const now = Date.now()
    const reportId = await ctx.db.insert("reports", { ...target, targetKind: args.target.kind, targetId: args.target.id, reporterPersonId: ctx.person._id, reporterNetworkId: ctx.networkId, reason, ...legalDeadlineColumns(reason, now), ...(team ? { teamId: team._id } : {}), level: team ? "team" : "network", status: "open", createdAt: now, updatedAt: now })
    // SU01d (art. 24) : l'accusé de réception part avec la transmission.
    await acknowledgeReport(ctx, reportId)
    return { reportId, created: true, hidden: true }
  },
})

export const createTeam = networkMutation({
  args: { name: v.string(), scope: v.optional(moderationSurfaceValidator), reason: v.string() },
  handler: async (ctx, args) => {
    await requireNetworkAdmin(ctx)
    await enforceRateLimit(ctx, "moderation.decide", ctx.person._id)
    const name = args.name.trim()
    if (name.length < 2 || name.length > 100) return fail("invalidArgument", { field: "name" })
    const reason = motiveOf(args.reason)
    const existing = await ctx.db.query("moderationTeams").withIndex("by_network_active", (q) => q.eq("networkId", ctx.networkId).eq("active", true)).take(100)
    if (existing.length >= 100) return fail("policyRefused")
    const teamId = await ctx.db.insert("moderationTeams", { networkId: ctx.networkId, name, ...(args.scope ? { scope: args.scope } : {}), active: true, createdAt: Date.now() })
    await appendAudit(ctx, { action: "moderation.team_create", capacity: "network_admin", actorPersonId: ctx.person._id, networkId: ctx.networkId, subject: { table: "moderationTeams", id: teamId }, details: { reason, scope: args.scope ?? null } })
    return { teamId }
  },
})

export const setTeamMember = networkMutation({
  args: { teamId: v.id("moderationTeams"), personId: v.id("persons"), active: v.boolean(), reason: v.string() },
  handler: async (ctx, args) => {
    await requireNetworkAdmin(ctx)
    await enforceRateLimit(ctx, "moderation.decide", ctx.person._id)
    const reason = motiveOf(args.reason)
    const team = await ctx.db.get(args.teamId)
    if (!team || team.networkId !== ctx.networkId || !team.active || (args.active && !(await isActiveMember(ctx, ctx.networkId, args.personId)))) return notFound()
    const member = await ctx.db.query("moderationTeamMembers").withIndex("by_team_person", (q) => q.eq("teamId", team._id).eq("personId", args.personId)).unique()
    if (member) await ctx.db.patch(member._id, { active: args.active, updatedAt: Date.now() })
    else await ctx.db.insert("moderationTeamMembers", { networkId: ctx.networkId, teamId: team._id, personId: args.personId, active: args.active, updatedAt: Date.now() })
    await appendAudit(ctx, { action: "moderation.team_member_set", capacity: "network_admin", actorPersonId: ctx.person._id, networkId: ctx.networkId, subject: { table: "moderationTeams", id: team._id }, details: { reason, personId: args.personId, active: args.active } })
    return null
  },
})

async function assertQueueCapacity(ctx: ReadCtx, actor: NetworkActor, teamId: Id<"moderationTeams"> | undefined): Promise<void> {
  if (teamId) {
    const team = await ctx.db.get(teamId)
    if (!team || !(await teamCapacity(ctx, actor, team.scope ?? "", team._id))) return notFound()
  } else if (!networkRoleCapacity(actor.membership.role)) return notFound()
}

/**
 * La file d'un réseau ou d'une équipe, la plus ancienne d'abord. SU01d : `lane: "ordinary"`
 * écarte les dossiers à délai légal, que `deadlineQueue` présente à part ; sans `lane`, la file
 * entière, comme avant.
 */
export const paginateQueue = networkQuery({
  args: { teamId: v.optional(v.id("moderationTeams")), status: v.optional(contentReportStatusValidator), lane: v.optional(v.literal("ordinary")), paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    await assertQueueCapacity(ctx, ctx, args.teamId)
    const status = args.status ?? "open"
    const options = pageOptions(args.paginationOpts)
    const result = args.teamId
      ? args.lane === "ordinary"
        ? await ctx.db.query("reports").withIndex("by_team_status_dueAt", (q) => q.eq("teamId", args.teamId).eq("status", status).eq("dueAt", undefined)).paginate(options)
        : await ctx.db.query("reports").withIndex("by_team_status_createdAt", (q) => q.eq("teamId", args.teamId).eq("status", status)).paginate(options)
      : args.lane === "ordinary"
        ? await ctx.db.query("reports").withIndex("by_network_status_dueAt", (q) => q.eq("networkId", ctx.networkId).eq("status", status).eq("dueAt", undefined)).paginate(options)
        : await ctx.db.query("reports").withIndex("by_network_status_createdAt", (q) => q.eq("networkId", ctx.networkId).eq("status", status)).paginate(options)
    const page = []
    for (const row of result.page) if (await teamCapacity(ctx, ctx, row.targetKind, row.teamId)) page.push(moderatorQueueDto(row))
    return { ...result, page }
  },
})

/**
 * SU01d (ordonnance n° 0011/PR/2026, art. 24, 32, 33) — les dossiers à délai légal encore
 * ouverts ou en examen, l'échéance la plus proche d'abord, avec la même compétence que la file.
 * Bornée aux `DEADLINE_QUEUE_MAX` plus urgents ; `truncated` dit qu'il en reste au-delà.
 */
export const deadlineQueue = networkQuery({
  args: { teamId: v.optional(v.id("moderationTeams")) },
  handler: async (ctx, args) => {
    await assertQueueCapacity(ctx, ctx, args.teamId)
    const rows: Doc<"reports">[] = []
    let full = false
    for (const status of ["open", "reviewing"] as const) {
      // borné : les DEADLINE_QUEUE_MAX + 1 échéances les plus proches de chaque statut ; `dueAt` absent est exclu par la borne basse.
      const batch = args.teamId
        ? await ctx.db.query("reports").withIndex("by_team_status_dueAt", (q) => q.eq("teamId", args.teamId).eq("status", status).gte("dueAt", 0)).take(DEADLINE_QUEUE_MAX + 1)
        : await ctx.db.query("reports").withIndex("by_network_status_dueAt", (q) => q.eq("networkId", ctx.networkId).eq("status", status).gte("dueAt", 0)).take(DEADLINE_QUEUE_MAX + 1)
      full ||= batch.length > DEADLINE_QUEUE_MAX
      rows.push(...batch)
    }
    rows.sort((a, b) => (a.dueAt ?? 0) - (b.dueAt ?? 0) || a.createdAt - b.createdAt)
    const items = []
    let eligible = 0
    for (const row of rows) {
      if (!(await teamCapacity(ctx, ctx, row.targetKind, row.teamId))) continue
      eligible += 1
      if (items.length < DEADLINE_QUEUE_MAX) items.push(moderatorQueueDto(row))
    }
    return { items, truncated: full || eligible > DEADLINE_QUEUE_MAX }
  },
})

export const paginatePlatformQueue = operatorQuery({
  args: { networkId: v.optional(v.id("networks")), paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const page = args.networkId
      ? await ctx.db.query("appeals").withIndex("by_network_status_createdAt", (q) => q.eq("networkId", args.networkId as Id<"networks">).eq("status", "open")).paginate(pageOptions(args.paginationOpts))
      : await ctx.db.query("appeals").withIndex("by_level_status_createdAt", (q) => q.eq("level", "platform").eq("status", "open")).paginate(pageOptions(args.paginationOpts))
    return { ...page, page: page.page.filter((row) => row.level === "platform").map((row) => ({ appealId: row._id, reportId: row.reportId, networkId: row.networkId, status: row.status, reason: row.reason, createdAt: row.createdAt })) }
  },
})

const sanctionInput = v.object({ kind: sanctionKindValidator, until: v.optional(v.number()) })

async function applyDecision(ctx: MutationCtx, row: Doc<"reports">, actorPersonId: Id<"persons">, capacity: AuditCapacity, decision: "dismissed" | "actioned", reason: string, sanctions: { kind: Doc<"sanctions">["kind"]; until?: number }[]) {
  if (row.status !== "open" && row.status !== "reviewing") return fail("conflict")
  if (sanctions.length > 5 || new Set(sanctions.map((item) => item.kind)).size !== sanctions.length || (decision === "dismissed" && sanctions.length > 0)) return fail("invalidArgument", { field: "sanctions" })
  const now = Date.now()
  for (const item of sanctions) if (!validSanctionDuration(item.kind, item.until, now)) return fail("invalidArgument", { field: "until" })
  if (row.ownerPersonId === actorPersonId) return notFound()
  await assertNoPageDecisionConflict(ctx, actorPersonId, row.target)
  const root = await getRootNetwork(ctx)
  const membership = row.ownerPersonId && root ? await getMembership(ctx, root._id, row.ownerPersonId) : null
  const previous = membership?.status === "suspendue" ? membership.statusBeforeSuspension : membership?.status
  if (membership?.status === "suspendue" && sanctions.some((item) => item.kind === "suspension" || item.kind === "exclusion")) {
    const active = await ctx.db.query("sanctions").withIndex("by_person_status", (q) => q.eq("personId", membership.personId).eq("status", "active")).take(101)
    if (!active.some((item) => item.kind === "suspension" || item.kind === "exclusion")) return fail("conflict")
  }
  const removesTarget = decision === "actioned" && (sanctions.length === 0 || sanctions.some((item) => item.kind === "removal"))
  if (removesTarget) await removeTarget(ctx, { target: row.target, networkId: row.networkId, ownerPersonId: row.ownerPersonId })
  for (const item of sanctions) {
    if (!row.ownerPersonId) { if (item.kind !== "removal") return fail("invalidArgument", { field: "sanctions" }); continue }
    if ((item.kind === "suspension" || item.kind === "exclusion") && (!membership || previous === "partie" || previous === undefined)) return notFound()
    await ctx.db.insert("sanctions", { networkId: row.networkId, reportId: row._id, target: row.target, personId: row.ownerPersonId, kind: item.kind, status: "active", reason, ...(item.until !== undefined ? { until: item.until } : {}), ...(previous === "en_attente" || previous === "declaree" || previous === "verifiee" ? { previousMembershipStatus: previous } : {}), createdAt: now, updatedAt: now })
  }
  if (row.ownerPersonId && sanctions.some((item) => item.kind === "suspension" || item.kind === "exclusion")) await refreshSuspension(ctx, row.ownerPersonId)
  await ctx.db.patch(row._id, { status: decision, decisionReason: reason, reviewedByPersonId: actorPersonId, reviewedAt: now, updatedAt: now, removedTarget: removesTarget })
  const legacy = await ctx.db.query("contentReports").withIndex("by_reportId", (q) => q.eq("reportId", row._id)).unique()
  if (legacy) await ctx.db.patch(legacy._id, { status: decision, decisionReason: reason, reviewedByPersonId: actorPersonId, reviewedAt: now, updatedAt: now })
  await appendAudit(ctx, { action: "moderation.report_decide", capacity, actorPersonId, networkId: row.networkId, subject: { table: "reports", id: row._id }, details: { reason, targetKind: row.targetKind, decision, sanctionCount: sanctions.length } })
  if (row.ownerPersonId) await notifyPerson(ctx, { networkId: row.networkId, recipientPersonId: row.ownerPersonId, kind: "moderation_decision", subject: { report: row._id } })
  else await notifyPageCase(ctx, row)
  // SU01d (art. 24) : la décision est notifiée au déclarant, dans la même transaction.
  await notifyReporterOfDecision(ctx, row._id)
  return { status: decision }
}

export const decide = networkMutation({
  args: { reportId: v.id("reports"), decision: v.union(v.literal("dismissed"), v.literal("actioned")), reason: v.string(), sanctions: v.array(sanctionInput), expectedSourceRevision: v.optional(v.number()), expectedSourceDigest: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.reportId)
    if (!row || row.networkId !== ctx.networkId) return notFound()
    const capacity = await teamCapacity(ctx, ctx, row.targetKind, row.teamId)
    if (!capacity) return notFound()
    await enforceRateLimit(ctx, "moderation.decide", ctx.person._id)
    if (row.target.kind === "editorialVersion" || row.target.kind === "editorialMedia") await assertCatalogReviewSource(ctx, ctx.networkId, row.target, args.expectedSourceRevision, args.expectedSourceDigest)
    return await applyDecision(ctx, row, ctx.person._id, capacity, args.decision, motiveOf(args.reason), args.sanctions)
  },
})

async function ownsCase(ctx: ReadCtx, row: Doc<"reports">, personId: Id<"persons">): Promise<boolean> {
  if (row.ownerPersonId === personId) return true
  // P16 : sans propriétaire personnel, la page porteuse (la page elle-même, ou le contenu qu'elle
  // porte : offre, poste, réponse d'avis, évènement, contenus de page DIASPORALE) se défend par
  // un signataire VIVANT, comme la page déjà ; un suspendu ne parle pour aucune page.
  const page = await owningPageOfReport(ctx, row)
  return page !== null && (await liveSignatoryRole(ctx, page, personId)) !== null
}

/** @selfScoped L'auteur (même suspendu) conteste uniquement sa décision, jamais un contenu d'autrui. */
export const fileAppeal = personMutation({
  args: { reportId: v.id("reports"), reason: v.string() },
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, "moderation.appeal", ctx.person._id)
    const row = await ctx.db.get(args.reportId)
    if (!row || row.status !== "actioned" || !(await ownsCase(ctx, row, ctx.person._id))) return notFound()
    const reason = motiveOf(args.reason)
    const first = await ctx.db.query("appeals").withIndex("by_report_level", (q) => q.eq("reportId", row._id).eq("level", "network")).unique()
    const level = row.level === "team" && first?.status !== "upheld" ? "network" as const : "platform" as const
    const existing = await ctx.db.query("appeals").withIndex("by_report_level", (q) => q.eq("reportId", row._id).eq("level", level)).unique()
    if (existing) return { appealId: existing._id, created: false }
    const now = Date.now()
    const appealId = await ctx.db.insert("appeals", { networkId: row.networkId, reportId: row._id, personId: ctx.person._id, level, reason, status: "open", createdAt: now, updatedAt: now })
    await appendAudit(ctx, { action: "moderation.appeal_file", capacity: "member", actorPersonId: ctx.person._id, networkId: row.networkId, subject: { table: "appeals", id: appealId }, details: { level } })
    return { appealId, created: true }
  },
})

async function decideAppeal(ctx: MutationCtx, appeal: Doc<"appeals">, actorPersonId: Id<"persons">, capacity: AuditCapacity, overturn: boolean, reason: string) {
  const row = await ctx.db.get(appeal.reportId)
  if (!row || appeal.status !== "open") return fail("conflict")
  if (row.reviewedByPersonId === actorPersonId || appeal.personId === actorPersonId) return notFound()
  // P16 : un signataire de la page porteuse ne juge pas le recours de sa propre page.
  await assertNoPageDecisionConflict(ctx, actorPersonId, row.target)
  if (overturn) {
    const sanctions = await ctx.db.query("sanctions").withIndex("by_report", (q) => q.eq("reportId", row._id)).take(6)
    for (const sanction of sanctions) if (sanction.status === "active") await ctx.db.patch(sanction._id, { status: "revoked", updatedAt: Date.now() })
    if (row.ownerPersonId) await refreshSuspension(ctx, row.ownerPersonId)
    await ctx.db.patch(row._id, { status: "dismissed", updatedAt: Date.now() })
    const remaining = await ctx.db.query("reports").withIndex("by_target_status", (q) => q.eq("targetKind", row.targetKind).eq("targetId", row.targetId).eq("status", "actioned")).take(101)
    if (row.removedTarget && remaining.length < 101 && !remaining.some((item) => item.removedTarget)) await restoreTarget(ctx, { target: row.target, networkId: row.networkId, ownerPersonId: row.ownerPersonId })
  }
  await ctx.db.patch(appeal._id, { status: overturn ? "overturned" : "upheld", decisionReason: reason, reviewedByPersonId: actorPersonId, updatedAt: Date.now() })
  if (row.ownerPersonId) await notifyPerson(ctx, { networkId: row.networkId, recipientPersonId: row.ownerPersonId, kind: "moderation_decision", subject: { report: row._id } })
  else await notifyPageCase(ctx, row)
  return { action: "moderation.appeal_decide" as const, capacity, actorPersonId, networkId: row.networkId, subject: { table: "appeals" as const, id: appeal._id }, details: { reason, overturn, level: appeal.level } }
}

export const reviewNetworkAppeal = networkMutation({
  args: { appealId: v.id("appeals"), overturn: v.boolean(), reason: v.string() },
  handler: async (ctx, args) => {
    await requireNetworkAdmin(ctx)
    await enforceRateLimit(ctx, "moderation.decide", ctx.person._id)
    const row = await ctx.db.get(args.appealId)
    if (!row || row.networkId !== ctx.networkId || row.level !== "network") return notFound()
    await appendAudit(ctx, await decideAppeal(ctx, row, ctx.person._id, "network_admin", args.overturn, motiveOf(args.reason)))
    return null
  },
})

export const reviewPlatformAppeal = operatorMutation({
  args: { appealId: v.id("appeals"), overturn: v.boolean(), reason: v.string() },
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, "moderation.decide", ctx.person._id)
    const row = await ctx.db.get(args.appealId)
    if (!row || row.level !== "platform") return notFound()
    await appendAudit(ctx, await decideAppeal(ctx, row, ctx.person._id, operatorCapacity(ctx.operator), args.overturn, motiveOf(args.reason)))
    return null
  },
})

/** @selfScoped Décisions et sanctions de la personne appelante, y compris suspendue. Aucun déclarant ni contenu. */
export const myDecisions = personQuery({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const result = await ctx.db.query("reports").withIndex("by_owner_createdAt", (q) => q.eq("ownerPersonId", ctx.person._id)).order("desc").paginate(pageOptions(args.paginationOpts))
    const page = []
    for (const row of result.page) {
      const sanctions = await ctx.db.query("sanctions").withIndex("by_report", (q) => q.eq("reportId", row._id)).take(6)
      const appeals = await ctx.db.query("appeals").withIndex("by_report_level", (q) => q.eq("reportId", row._id)).take(2)
      page.push({ ...queueDto(row), sanctions: sanctions.map((sanction) => ({ sanctionId: sanction._id, kind: sanction.kind, status: sanction.status, until: sanction.until ?? null, reason: sanction.reason })), appeals: appeals.map((appeal) => ({ appealId: appeal._id, level: appeal.level, status: appeal.status, decisionReason: appeal.decisionReason ?? null })) })
    }
    return { ...result, page }
  },
})

/**
 * @selfScoped SU01d — MES signalements, le plus récent d'abord : le motif, l'échéance légale,
 * l'accusé de réception et l'issue pour le contenu. Ni l'auteur, ni le motif écrit par la
 * modération, ni la sanction : ils ne regardent pas le déclarant.
 */
export const myReports = personQuery({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const result = await ctx.db.query("reports").withIndex("by_reporter_createdAt", (q) => q.eq("reporterPersonId", ctx.person._id)).order("desc").paginate(pageOptions(args.paginationOpts))
    return {
      ...result,
      page: result.page.map((row) => ({
        reportId: row._id,
        targetKind: row.targetKind,
        reason: row.reason,
        createdAt: row.createdAt,
        legalBasis: row.legalBasis ?? null,
        dueAt: row.dueAt ?? null,
        acknowledgedAt: row.acknowledgedAt ?? null,
        outcome: reportOutcome(row.status, row.removedTarget),
        decidedAt: row.status === "dismissed" || row.status === "actioned" ? row.reviewedAt ?? row.updatedAt : null,
      })),
    }
  },
})

/**
 * P16 : les décisions qui ont RETIRÉ un contenu porté par une page (offre, poste, réponse d'avis,
 * évènement, contenus de page DIASPORALE), lues par un signataire VIVANT de cette page dans son
 * réseau, avec l'état des recours. Ni déclarant, ni contenu, ni identité du modérateur ; une
 * fenêtre dont les contenus sont tous publiés reste vide et garde sa continuation. Le recours
 * passe par `fileAppeal` (signature inchangée), ouvert au signataire vivant de la page porteuse.
 */
export const pageDecisions = networkQuery({
  args: { pageId: v.id("pages"), paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const page = await ctx.db.get(args.pageId)
    if (!page || page.networkId !== ctx.networkId || (await liveSignatoryRole(ctx, page, ctx.person._id)) === null) return notFound()
    const result = await ctx.db.query("moderationContentStates").withIndex("by_network_page_updatedAt", (q) => q.eq("networkId", ctx.networkId).eq("ownerPageId", page._id)).order("desc").paginate(pageOptions(args.paginationOpts))
    const decisions = []
    for (const state of result.page) {
      if (state.status !== "removed") continue
      // borné : trois décisions au plus par contenu retiré (une par dossier ouvert sur la cible).
      const reports = await ctx.db.query("reports").withIndex("by_target_status", (q) => q.eq("targetKind", state.targetKind).eq("targetId", state.targetId).eq("status", "actioned")).take(3)
      for (const row of reports) {
        if (row.networkId !== ctx.networkId || row.ownerPersonId !== undefined) continue
        const appeals = await ctx.db.query("appeals").withIndex("by_report_level", (q) => q.eq("reportId", row._id)).take(2)
        decisions.push({ ...queueDto(row), appeals: appeals.map((appeal) => ({ appealId: appeal._id, level: appeal.level, status: appeal.status, decisionReason: appeal.decisionReason ?? null })) })
      }
    }
    return { ...result, page: decisions }
  },
})

export const setPolicy = networkMutation({
  args: { surface: moderationSurfaceValidator, preReview: v.boolean(), maxLinks: v.number(), maxWrites: v.number(), windowMs: v.number(), reason: v.string() },
  handler: async (ctx, args) => {
    await requireNetworkAdmin(ctx)
    await enforceRateLimit(ctx, "moderation.decide", ctx.person._id)
    const reason = motiveOf(args.reason)
    if (![args.maxLinks, args.maxWrites, args.windowMs].every(Number.isSafeInteger) || args.maxLinks < 0 || args.maxLinks > 20 || args.maxWrites < 1 || args.maxWrites > 100 || args.windowMs < 1_000 || args.windowMs > 86_400_000) return fail("invalidArgument")
    const existing = await ctx.db.query("moderationPolicies").withIndex("by_network_surface", (q) => q.eq("networkId", ctx.networkId).eq("surface", args.surface)).unique()
    const data = { networkId: ctx.networkId, surface: args.surface, preReview: args.preReview, maxLinks: args.maxLinks, maxWrites: args.maxWrites, windowMs: args.windowMs, updatedAt: Date.now() }
    const policyId = existing ? existing._id : await ctx.db.insert("moderationPolicies", data)
    if (existing) await ctx.db.patch(existing._id, data)
    await appendAudit(ctx, { action: "moderation.policy_set", capacity: "network_admin", actorPersonId: ctx.person._id, networkId: ctx.networkId, subject: { table: "moderationPolicies", id: policyId }, details: { reason, surface: args.surface, preReview: args.preReview } })
    return { policyId }
  },
})

export const setBlockedTerm = networkMutation({
  args: { term: v.string(), active: v.boolean(), reason: v.string() },
  handler: async (ctx, args) => {
    await requireNetworkAdmin(ctx)
    await enforceRateLimit(ctx, "moderation.decide", ctx.person._id)
    const reason = motiveOf(args.reason)
    const term = normalizeBlockedTerm(args.term)
    if (term.length < 2 || term.length > 80) return fail("invalidArgument", { field: "term" })
    const existing = await ctx.db.query("blockedTerms").withIndex("by_network_term", (q) => q.eq("networkId", ctx.networkId).eq("term", term)).unique()
    const active = await ctx.db.query("blockedTerms").withIndex("by_network_active", (q) => q.eq("networkId", ctx.networkId).eq("active", true)).take(100)
    if (args.active && !existing?.active && active.length >= 100) return fail("policyRefused")
    const termId = existing ? existing._id : await ctx.db.insert("blockedTerms", { networkId: ctx.networkId, term, active: args.active, updatedAt: Date.now() })
    if (existing) await ctx.db.patch(existing._id, { active: args.active, updatedAt: Date.now() })
    await appendAudit(ctx, { action: "moderation.term_set", capacity: "network_admin", actorPersonId: ctx.person._id, networkId: ctx.networkId, subject: { table: "blockedTerms", id: termId }, details: { reason, active: args.active } })
    return { termId }
  },
})

export const reviewContent = networkMutation({
  args: { target: moderationTargetValidator, approve: v.boolean(), reason: v.string(), expectedSourceRevision: v.optional(v.number()), expectedSourceDigest: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, "moderation.decide", ctx.person._id)
    const state = await contentState(ctx, args.target.kind, args.target.id)
    if (!state || state.networkId !== ctx.networkId || state.status !== "pending_review") return notFound()
    if (state.ownerPersonId === ctx.person._id) return notFound()
    await assertNoPageDecisionConflict(ctx, ctx.person._id, args.target)
    const teams = await ctx.db.query("moderationTeams").withIndex("by_network_active", (q) => q.eq("networkId", ctx.networkId).eq("active", true)).take(101)
    const team = teams.find((row) => row.scope === args.target.kind) ?? teams.find((row) => row.scope === undefined)
    const capacity = await teamCapacity(ctx, ctx, args.target.kind, team?._id)
    if (!capacity) return notFound()
    // Lecture dans la même transaction que l'approbation OU le refus : une livraison R+1
    // concurrente force la relecture, jamais une décision sur son contenu non présenté.
    await assertCatalogReviewSource(ctx, ctx.networkId, args.target, args.expectedSourceRevision, args.expectedSourceDigest)
    const reason = motiveOf(args.reason)
    if (args.approve) await restoreTarget(ctx, { target: args.target, networkId: ctx.networkId, ownerPersonId: state.ownerPersonId })
    else await removeTarget(ctx, { target: args.target, networkId: ctx.networkId, ownerPersonId: state.ownerPersonId })
    const now = Date.now()
    const reportId = await ctx.db.insert("reports", { networkId: ctx.networkId, target: args.target, targetKind: args.target.kind, targetId: args.target.id, ...(state.ownerPersonId ? { ownerPersonId: state.ownerPersonId } : {}), source: "pre_review", reason: "pre_review", ...(team ? { teamId: team._id } : {}), level: team ? "team" : "network", status: args.approve ? "dismissed" : "actioned", removedTarget: !args.approve, decisionReason: reason, reviewedByPersonId: ctx.person._id, reviewedAt: now, createdAt: now, updatedAt: now })
    if (state.ownerPersonId) await notifyPerson(ctx, { networkId: ctx.networkId, recipientPersonId: state.ownerPersonId, kind: "moderation_decision", subject: { report: reportId } })
    else {
      const created = await ctx.db.get(reportId)
      if (created) await notifyPageCase(ctx, created)
    }
    await appendAudit(ctx, { action: "moderation.content_review", capacity, actorPersonId: ctx.person._id, networkId: ctx.networkId, subject: { table: "moderationContentStates", id: state._id }, details: { reason, approve: args.approve, surface: args.target.kind } })
    return null
  },
})

export const paginatePending = networkQuery({
  args: { teamId: v.optional(v.id("moderationTeams")), paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    if (args.teamId) {
      const team = await ctx.db.get(args.teamId)
      if (!team || !(await teamCapacity(ctx, ctx, team.scope ?? "", team._id))) return notFound()
    } else if (!networkRoleCapacity(ctx.membership.role)) return notFound()
    const teams = await ctx.db.query("moderationTeams").withIndex("by_network_active", (q) => q.eq("networkId", ctx.networkId).eq("active", true)).take(101)
    if (teams.length > 100) return notFound()
    const result = await ctx.db.query("moderationContentStates").withIndex("by_network_status_updatedAt", (q) => q.eq("networkId", ctx.networkId).eq("status", "pending_review")).paginate(pageOptions(args.paginationOpts))
    const page = []
    for (const row of result.page) {
      const team = teams.find((item) => item.scope === row.targetKind) ?? teams.find((item) => item.scope === undefined)
      if (args.teamId && team?._id !== args.teamId) continue
      if (await teamCapacity(ctx, ctx, row.targetKind, team?._id)) page.push({ stateId: row._id, targetKind: row.targetKind, targetId: row.targetId, updatedAt: row.updatedAt })
    }
    return { ...result, page }
  },
})
