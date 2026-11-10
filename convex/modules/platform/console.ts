/** PA7 : console opérateur. Les constructeurs exigent la session et le rôle vivants ; chaque décision est auditée. */
import { assertDecisionReason } from "@antsia/social-domain/audit"
import type { ReportLegalBasis } from "@antsia/social-domain/moderation"
import { legalDeadlineDisclosure, legalDeadlineStatus, TRANSPARENCY_MIN_CASES } from "@antsia/social-domain/moderationPolicy"
import { paginationOptsValidator, type PaginationResult } from "convex/server"
import { v } from "convex/values"

import { internal } from "../../_generated/api"
import type { Doc, Id } from "../../_generated/dataModel"
import { internalMutation, type QueryCtx } from "../../_generated/server"
import { getMembership, isActiveMember } from "../../lib/access"
import { checked, fail, notFound } from "../../lib/errors"
import { operatorMutation, operatorQuery } from "../../lib/functions"
import { enforceRateLimit } from "../../lib/rateLimit"
import { moderationSurfaceValidator, reportLegalBasisValidator } from "../moderation/tables"
import { findPublishedPersonByHandle, isDiscoverablePerson, livePersonProfile } from "../people/miniProfile"
import { appendAudit, operatorCapacity } from "./audit"
import { incidentSeverityValidator, metricStageValidator } from "./consoleTables"

type ReadCtx = Pick<QueryCtx, "db">
type Counts = Doc<"consoleMetrics">["counts"]
type Stage = Doc<"consoleMetrics">["stage"]
const TEAM_LIMIT = 100
const MEMBER_LIMIT = 100
// La projection non paginée protège aussi le budget de lecture d'une requête.
const TEAM_PROJECTION_LIMIT = 500
const METRIC_BATCH = 50
// SU01d : échéances lues par statut pour l'alerte, la même borne que la file prioritaire des modérateurs.
const LEGAL_ALERT_LIMIT = 50
const minuteOf = (at: number) => Math.floor(at / 60_000) * 60_000
const emptyCounts = (): Counts => ({ members: 0, openReports: 0, openAppeals: 0, pendingFiles: 0, deadLetters: 0 })
const motiveOf = (reason: string) => checked(() => assertDecisionReason(reason, 3))

async function activeNetwork(ctx: ReadCtx, networkId: Id<"networks">): Promise<Doc<"networks">> {
  const network = await ctx.db.get(networkId)
  if (!network || network.status !== "active") return notFound()
  return network
}

/** L'opérateur peut gérer une capacité existante ; aucun profil caché n'est rendu découvrable. */
async function publishedMember(ctx: ReadCtx, network: Doc<"networks">, personId: Id<"persons">, knownActive = false) {
  const person = await livePersonProfile(ctx, personId)
  if (!person || !isDiscoverablePerson(person) || (!knownActive && !(await isActiveMember(ctx, network._id, personId)))) return null
  if (network.managedBy !== undefined && (await getMembership(ctx, network._id, personId))?.directoryListed !== true) return null
  return person
}

export const listTeams = operatorQuery({
  args: { networkId: v.id("networks") },
  handler: async (ctx, args) => {
    const network = await activeNetwork(ctx, args.networkId)
    const teams = await ctx.db.query("moderationTeams").withIndex("by_network_active", (q) => q.eq("networkId", network._id)).take(TEAM_LIMIT + 1)
    if (teams.length > TEAM_LIMIT) return fail("policyRefused")
    let projected = 0
    const profileCache = new Map<Id<"persons">, { handle: string | null; displayName: string | null; active: boolean }>()
    const result = []
    for (const team of teams) {
      const rows = await ctx.db.query("moderationTeamMembers").withIndex("by_team_person", (q) => q.eq("teamId", team._id)).take(MEMBER_LIMIT + 1)
      projected += rows.length
      if (rows.length > MEMBER_LIMIT || projected > TEAM_PROJECTION_LIMIT) return fail("policyRefused")
      const members = []
      for (const row of rows) {
        if (row.networkId !== network._id) return fail("policyRefused")
        let profile = profileCache.get(row.personId)
        if (!profile) {
          const active = await isActiveMember(ctx, network._id, row.personId)
          const person = active ? await publishedMember(ctx, network, row.personId, true) : null
          profile = { handle: person?.handle ?? null, displayName: person?.displayName ?? null, active }
          profileCache.set(row.personId, profile)
        }
        members.push({ personId: row.personId, handle: profile.handle, displayName: profile.displayName, active: row.active && profile.active })
      }
      result.push({ teamId: team._id, name: team.name, scope: team.scope ?? null, active: team.active, members })
    }
    return result
  },
})

export const findMember = operatorQuery({
  args: { networkId: v.id("networks"), handle: v.string() },
  handler: async (ctx, args) => {
    const network = await activeNetwork(ctx, args.networkId)
    if (args.handle.length > 64) return null
    const handle = args.handle.trim().replace(/^@/, "")
    const found = await findPublishedPersonByHandle(ctx, network._id, handle, { requireDiscoverable: true })
    const person = found ? await publishedMember(ctx, network, found._id, true) : null
    return person ? { personId: person._id, handle: person.handle ?? null, displayName: person.displayName ?? null } : null
  },
})

export const createTeam = operatorMutation({
  args: { networkId: v.id("networks"), name: v.string(), scope: v.optional(moderationSurfaceValidator), reason: v.string() },
  handler: async (ctx, args) => {
    const network = await activeNetwork(ctx, args.networkId)
    await enforceRateLimit(ctx, "moderation.decide", ctx.person._id)
    const name = args.name.trim()
    if (name.length < 2 || name.length > 100) return fail("invalidArgument", { field: "name" })
    const reason = motiveOf(args.reason)
    const teams = await ctx.db.query("moderationTeams").withIndex("by_network_active", (q) => q.eq("networkId", network._id)).take(TEAM_LIMIT)
    if (teams.length >= TEAM_LIMIT) return fail("policyRefused")
    const teamId = await ctx.db.insert("moderationTeams", { networkId: network._id, name, ...(args.scope === undefined ? {} : { scope: args.scope }), active: true, createdAt: Date.now() })
    await appendAudit(ctx, { action: "moderation.team_create", capacity: operatorCapacity(ctx.operator), actorPersonId: ctx.person._id, networkId: network._id, subject: { table: "moderationTeams", id: teamId }, details: { reason, scope: args.scope ?? null } })
    return { teamId }
  },
})

export const setTeamMember = operatorMutation({
  args: { networkId: v.id("networks"), teamId: v.id("moderationTeams"), personId: v.id("persons"), active: v.boolean(), reason: v.string() },
  handler: async (ctx, args) => {
    const network = await activeNetwork(ctx, args.networkId)
    await enforceRateLimit(ctx, "moderation.decide", ctx.person._id)
    const reason = motiveOf(args.reason)
    const team = await ctx.db.get(args.teamId)
    if (!team || team.networkId !== network._id || !team.active || (args.active && !(await isActiveMember(ctx, network._id, args.personId)))) return notFound()
    const member = await ctx.db.query("moderationTeamMembers").withIndex("by_team_person", (q) => q.eq("teamId", team._id).eq("personId", args.personId)).unique()
    if (member?.networkId !== undefined && member.networkId !== network._id) return notFound()
    if (!member) {
      // Une suppression absente est idempotente, sans créer une fausse adhésion d'équipe.
      if (args.active) {
        const members = await ctx.db.query("moderationTeamMembers").withIndex("by_team_person", (q) => q.eq("teamId", team._id)).take(MEMBER_LIMIT)
        if (members.length >= MEMBER_LIMIT) return fail("policyRefused")
        await ctx.db.insert("moderationTeamMembers", { networkId: network._id, teamId: team._id, personId: args.personId, active: true, updatedAt: Date.now() })
      }
    } else await ctx.db.patch(member._id, { active: args.active, updatedAt: Date.now() })
    await appendAudit(ctx, { action: "moderation.team_member_set", capacity: operatorCapacity(ctx.operator), actorPersonId: ctx.person._id, networkId: network._id, subject: { table: "moderationTeams", id: team._id }, details: { reason, personId: args.personId, active: args.active } })
    return null
  },
})

type IncidentDto = { incidentId: Id<"consoleIncidents">; networkId: Id<"networks"> | null; title: string; severity: Doc<"consoleIncidents">["severity"]; status: Doc<"consoleIncidents">["status"]; createdAt: number; updatedAt: number }

export const paginateIncidents = operatorQuery({
  args: { networkId: v.optional(v.id("networks")), paginationOpts: paginationOptsValidator },
  handler: async (ctx, args): Promise<PaginationResult<IncidentDto>> => {
    if (args.networkId !== undefined) await activeNetwork(ctx, args.networkId)
    if (!Number.isInteger(args.paginationOpts.numItems) || args.paginationOpts.numItems < 1 || args.paginationOpts.numItems > 50) return fail("invalidArgument", { field: "paginationOpts" })
    // Les métadonnées natives restent intactes ; seule la consommation maximale est resserrée.
    const options = { ...args.paginationOpts, maximumRowsRead: Math.min(args.paginationOpts.maximumRowsRead ?? 50, 50), maximumBytesRead: Math.min(args.paginationOpts.maximumBytesRead ?? 262_144, 262_144) }
    const result = args.networkId === undefined
      ? await ctx.db.query("consoleIncidents").withIndex("by_createdAt").order("desc").paginate(options)
      : await ctx.db.query("consoleIncidents").withIndex("by_network_createdAt", (q) => q.eq("networkId", args.networkId)).order("desc").paginate(options)
    return { ...result, page: result.page.map((row) => ({ incidentId: row._id, networkId: row.networkId ?? null, title: row.title, severity: row.severity, status: row.status, createdAt: row.createdAt, updatedAt: row.updatedAt })) }
  },
})

export const createIncident = operatorMutation({
  args: { networkId: v.optional(v.id("networks")), title: v.string(), severity: incidentSeverityValidator, reason: v.string() },
  handler: async (ctx, args) => {
    if (args.networkId !== undefined) await activeNetwork(ctx, args.networkId)
    const title = args.title.trim()
    if (title.length < 2 || title.length > 160) return fail("invalidArgument", { field: "title" })
    const reason = motiveOf(args.reason)
    const now = Date.now()
    const incidentId = await ctx.db.insert("consoleIncidents", { ...(args.networkId === undefined ? {} : { networkId: args.networkId }), title, severity: args.severity, status: "open", createdAt: now, updatedAt: now, openedByPersonId: ctx.person._id })
    await appendAudit(ctx, { action: "console.incident_open", capacity: operatorCapacity(ctx.operator), actorPersonId: ctx.person._id, ...(args.networkId === undefined ? {} : { networkId: args.networkId }), subject: { table: "consoleIncidents", id: incidentId }, details: { reason, severity: args.severity } })
    return { incidentId }
  },
})

export const resolveIncident = operatorMutation({
  args: { incidentId: v.id("consoleIncidents"), reason: v.string() },
  handler: async (ctx, args) => {
    const reason = motiveOf(args.reason)
    const incident = await ctx.db.get(args.incidentId)
    if (!incident) return notFound()
    if (incident.status === "resolved") return fail("policyRefused")
    await ctx.db.patch(incident._id, { status: "resolved", updatedAt: Date.now(), resolvedByPersonId: ctx.person._id })
    await appendAudit(ctx, { action: "console.incident_resolve", capacity: operatorCapacity(ctx.operator), actorPersonId: ctx.person._id, ...(incident.networkId === undefined ? {} : { networkId: incident.networkId }), subject: { table: "consoleIncidents", id: incident._id }, details: { reason } })
    return null
  },
})

export const getMetrics = operatorQuery({
  args: { networkId: v.id("networks") },
  handler: async (ctx, args) => {
    await activeNetwork(ctx, args.networkId)
    const row = await ctx.db.query("consoleMetrics").withIndex("by_network", (q) => q.eq("networkId", args.networkId)).unique()
    return row ? { status: row.status, generatedAt: row.generatedAt ?? null, counts: row.counts } : null
  },
})

export const refreshMetrics = operatorMutation({
  args: { networkId: v.id("networks") },
  handler: async (ctx, args): Promise<null> => {
    await activeNetwork(ctx, args.networkId)
    const row = await ctx.db.query("consoleMetrics").withIndex("by_network", (q) => q.eq("networkId", args.networkId)).unique()
    const generation = (row?.generation ?? 0) + 1
    const data = { networkId: args.networkId, generation, stage: "members" as const, cursor: null, status: "building" as const, counts: emptyCounts(), startedAt: Date.now(), generatedAt: undefined }
    const metricsId = row?._id ?? await ctx.db.insert("consoleMetrics", data)
    if (row) await ctx.db.patch(row._id, data)
    await ctx.scheduler.runAfter(0, internal.modules.platform.console.recomputeMetrics, { networkId: args.networkId, generation, stage: "members", cursor: null })
    await appendAudit(ctx, { action: "console.metrics_refresh", capacity: operatorCapacity(ctx.operator), actorPersonId: ctx.person._id, networkId: args.networkId, subject: { table: "consoleMetrics", id: metricsId }, details: { generation } })
    return null
  },
})

/** Tranches datées, non atomiques entre elles. Un job ancien ou rejoué ne compte rien deux fois. */
export const recomputeMetrics = internalMutation({
  args: { networkId: v.id("networks"), generation: v.number(), stage: metricStageValidator, cursor: v.union(v.string(), v.null()) },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const network = await ctx.db.get(args.networkId)
    if (!network || network.status !== "active") return null
    const row = await ctx.db.query("consoleMetrics").withIndex("by_network", (q) => q.eq("networkId", args.networkId)).unique()
    if (!row || row.generation !== args.generation || row.status !== "building" || row.stage !== args.stage || row.cursor !== args.cursor || args.stage === "done") return null
    const options = { numItems: METRIC_BATCH, cursor: args.cursor, maximumRowsRead: METRIC_BATCH, maximumBytesRead: 1_048_576 }
    const counts = { ...row.counts }
    let result: { isDone: boolean; continueCursor: string }
    if (args.stage === "members") {
      const page = await ctx.db.query("networkMemberships").withIndex("by_network_and_person", (q) => q.eq("networkId", args.networkId)).paginate(options)
      for (const member of page.page) if (await isActiveMember(ctx, args.networkId, member.personId)) counts.members += 1
      result = page
    } else if (args.stage === "reports") {
      const page = await ctx.db.query("reports").withIndex("by_network_createdAt", (q) => q.eq("networkId", args.networkId)).paginate(options)
      counts.openReports += page.page.filter((item) => item.status === "open" || item.status === "reviewing").length
      result = page
    } else if (args.stage === "appeals") {
      const page = await ctx.db.query("appeals").withIndex("by_network_status_createdAt", (q) => q.eq("networkId", args.networkId)).paginate(options)
      counts.openAppeals += page.page.filter((item) => item.status === "open").length
      result = page
    } else if (args.stage === "files") {
      const page = await ctx.db.query("fileScans").withIndex("by_network_status", (q) => q.eq("networkId", args.networkId)).paginate(options)
      counts.pendingFiles += page.page.filter((item) => item.status === "pending" || item.status === "running").length
      result = page
    } else {
      const page = await ctx.db.query("federationDeadLetters").withIndex("by_network_status_failedAt", (q) => q.eq("networkId", args.networkId)).paginate(options)
      counts.deadLetters += page.page.filter((item) => item.status === "dead_letter").length
      result = page
    }
    const next: Record<Exclude<Stage, "done">, Stage> = { members: "reports", reports: "appeals", appeals: "files", files: "deadLetters", deadLetters: "done" }
    const stage = result.isDone ? next[args.stage] : args.stage
    const cursor = result.isDone ? null : result.continueCursor
    await ctx.db.patch(row._id, { stage, cursor, counts, ...(stage === "done" ? { status: "ready" as const, generatedAt: Date.now() } : {}) })
    if (stage !== "done") await ctx.scheduler.runAfter(0, internal.modules.platform.console.recomputeMetrics, { networkId: args.networkId, generation: args.generation, stage, cursor })
    return null
  },
})

/**
 * Export fermé : douze périodes, aucun texte ni identité, suppression de toute petite cohorte. SU01d :
 * les échéances légales tenues et manquées suivent la règle de `/transparence` (`legalDeadlineDisclosure`),
 * leur base jamais exportée ; l'état distingue une période non mesurée d'une cohorte masquée.
 */
export const aggregateExport = operatorQuery({
  args: { networkId: v.id("networks") },
  handler: async (ctx, args) => {
    await activeNetwork(ctx, args.networkId)
    const rows = await ctx.db.query("moderationTransparency").withIndex("by_network_period", (q) => q.eq("networkId", args.networkId)).order("desc").take(12)
    return { threshold: TRANSPARENCY_MIN_CASES, periods: rows.map((row) => {
      const suppressed = row.cases < TRANSPARENCY_MIN_CASES || row.distinctAuthors < TRANSPARENCY_MIN_CASES
      // Une petite sous-catégorie ou son complément n'est pas déductible du total.
      const actioned = row.actioned >= TRANSPARENCY_MIN_CASES && row.cases - row.actioned >= TRANSPARENCY_MIN_CASES ? row.actioned : null
      const dismissed = row.dismissed >= TRANSPARENCY_MIN_CASES && row.cases - row.dismissed >= TRANSPARENCY_MIN_CASES ? row.dismissed : null
      const legal = legalDeadlineDisclosure(row)
      return { periodStart: row.periodStart, periodEnd: row.periodEnd, cases: suppressed ? null : row.cases, actioned: suppressed ? null : actioned, dismissed: suppressed ? null : dismissed, suppressed, legalStatus: legalDeadlineStatus(row), legalMet: legal?.met ?? null, legalMissed: legal?.missed ?? null }
    }) }
  },
})

/**
 * SU01d (ordonnance n° 0011/PR/2026, art. 24, 32, 33) — l'alerte d'exploitation des délais légaux :
 * les échéances des dossiers encore ouverts ou en examen, la plus proche d'abord, avec leur seul
 * fondement légal (qui dit la classe du motif, jamais le motif). Ni dossier, ni cible, ni personne :
 * la file prioritaire des modérateurs les traite. L'écran compte les retards avec son horloge, car
 * une requête n'est pas relue quand le temps passe. `horizon` est l'échéance la plus proche restée
 * hors lecture : avant elle, les comptes de l'écran sont exacts ; à partir d'elle, des minimums.
 * Échéances et horizon sont arrondis à la minute inférieure : l'écran compte à la minute, l'heure
 * exacte d'une transmission n'a pas à sortir, et un retard s'annonce au plus tôt, jamais en retard.
 */
export const legalDeadlineAlert = operatorQuery({
  args: { networkId: v.id("networks") },
  returns: v.object({ limit: v.number(), horizon: v.union(v.number(), v.null()), deadlines: v.array(v.object({ dueAt: v.number(), basis: reportLegalBasisValidator })) }),
  handler: async (ctx, args) => {
    const network = await activeNetwork(ctx, args.networkId)
    const deadlines: { dueAt: number; basis: ReportLegalBasis }[] = []
    let horizon: number | null = null
    for (const status of ["open", "reviewing"] as const) {
      // borné : les LEGAL_ALERT_LIMIT + 1 échéances les plus proches de chaque statut ; `dueAt` absent est exclu par la borne basse.
      const batch = await ctx.db.query("reports").withIndex("by_network_status_dueAt", (q) => q.eq("networkId", network._id).eq("status", status).gte("dueAt", 0)).take(LEGAL_ALERT_LIMIT + 1)
      const beyond = batch[LEGAL_ALERT_LIMIT]?.dueAt
      if (beyond !== undefined) horizon = horizon === null ? minuteOf(beyond) : Math.min(horizon, minuteOf(beyond))
      for (const row of batch.slice(0, LEGAL_ALERT_LIMIT)) if (row.dueAt !== undefined && row.legalBasis !== undefined) deadlines.push({ dueAt: minuteOf(row.dueAt), basis: row.legalBasis })
    }
    deadlines.sort((a, b) => a.dueAt - b.dueAt)
    return { limit: LEGAL_ALERT_LIMIT, horizon, deadlines }
  },
})
