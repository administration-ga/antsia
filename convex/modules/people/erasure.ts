// Dupliqué de socle/convex/crons/dataSubjectErasure.ts @ 25398f565 — adaptations : droits personnels, confirmation/délai/annulation, inventaire du schéma social, cascade/anonymisation bornée avec progression persistée et reprise, export et effacement par index de propriétaire et de parent (DP-F1) ; aucune donnée administrative ni export externe.
import { v } from "convex/values"
import { components, internal } from "../../_generated/api"
import type { Doc, Id, TableNames } from "../../_generated/dataModel"
import { internalMutation, type MutationCtx, type QueryCtx } from "../../_generated/server"
import { fail, notFound } from "../../lib/errors"
import { personMutation, personQuery } from "../../lib/functions"
import { enforceRateLimit, erasePersonalRateLimits, rateLimiter } from "../../lib/rateLimit"
import { appendAudit } from "../platform/audit"
import { followerCounts } from "../graph/follows"
import { unrecordComment, unrecordGroupMember, unrecordPageFollower, unrecordPagePost, unrecordShare, applyReactionDelta } from "../posts/counters"
import { unrecordPageEventParticipation } from "../events/pageEventRegistrations"
import { removeDiasporaCounters } from "../diaspora/contentCounters"
import { DATA_TABLE_POLICIES } from "./dataPolicies"
import { accessGaps, carrierRelations, childRelations, dependentRelations, ERASURE_EXCLUDED_TABLES, exportPlans, isResidualScanTable, isShortLivedTable, matchesPlan, ownerPlans, parseUnitCursor, readUnits, referencePlans, relationsFor, type IndexPlan, type ReadBudget, type UnitCursor } from "./dataAccess"
import { revokeAdministrationForPerson } from "../federation/agentLifecycle"
import { revokeCommercialCrmForPerson } from "../commercialMessaging/crm"
import { revokeCrmPersonRef } from "../commercialMessaging/crmPrivacy"
import { revokeCommerceForPerson } from "../shops/commerceLinkLifecycle"
import { revokeCheckoutsForPerson } from "../shops/checkoutLifecycle"
import { revokePurchaseDataForPerson } from "../shops/purchaseLifecycle"
import { continueJobRevocationRef, revokeJobApplicationsForPerson } from "../shops/jobApplicationLifecycle"
import { continueServiceRevocationRef, revokeServicesForPerson } from "../shops/serviceLifecycle"
import { adjustPersonalUnreadTotal, adjustUnreadPart } from "../messaging/threads"
import { anonymizeReferences, dataTableNames, directlyOwned, exportableRecord, referencesIn, shapeFor, unclassifiedDataTables, type DataRecord } from "./dataInventory"

export const ERASURE_GRACE_MS = 30 * 24 * 60 * 60 * 1000
const PAGE_SIZE = 20
const PAGE_BYTES = 2 * 1024 * 1024
/** Export : une page de lignes de la personne, lue par index (plafond d'octets ci-dessus). */
const EXPORT_PAGE_SIZE = 100
/** Sondes d'index (une lecture au plus chacune) par appel d'export et par transaction d'effacement. */
const EXPORT_MAX_OPS = 128
const ERASURE_MAX_OPS = 64
const ANONYMOUS_AUTH_ID = "erased-account"

/** P11 : fermer localement avant l'appel distant, sans attendre sa disponibilité. */
async function revokeCheckoutPreparations(ctx: MutationCtx, personId: Id<"persons">): Promise<boolean> {
  const result = await revokeCheckoutsForPerson(ctx, personId)
  for (const release of result.releases) await ctx.scheduler.runAfter(0, internal.modules.shops.checkoutLifecycle.releaseAfterErasure, { release })
  return result.done
}

/** P12 : invalidation locale bornée, sans ordre distant ni changement d'état financier. */
export async function revokePaymentDataForPerson(ctx: MutationCtx, personId: Id<"persons">): Promise<boolean> {
  if (!await revokePurchaseDataForPerson(ctx, personId)) return false
  const now = Date.now()
  const attempts = await ctx.db.query("shopPaymentAttempts").withIndex("by_person_revoked", q => q.eq("personId", personId).eq("privacyRevokedAt", undefined)).take(PAGE_SIZE + 1)
  for (const row of attempts.slice(0, PAGE_SIZE)) await ctx.db.patch(row._id, {
    privacyRevokedAt: now, generation: row.generation + 1, rawBody: undefined, leaseToken: undefined, leaseUntil: undefined,
    authorizationExpiresAt: undefined, startAction: undefined, snapshot: row.snapshot ? { ...row.snapshot, action: null } : undefined,
    privateUntil: Math.min(row.privateUntil, now), updatedAt: now,
  })
  // Reçus/requêtes éphémères supprimés : une réponse tardive ne trouve plus son bail.
  const options = await ctx.db.query("shopPaymentOptions").withIndex("by_person", q => q.eq("personId", personId)).take(PAGE_SIZE + 1)
  for (const row of options.slice(0, PAGE_SIZE)) await ctx.db.delete(row._id)
  const requests = await ctx.db.query("shopPaymentRequests").withIndex("by_person", q => q.eq("personId", personId)).take(PAGE_SIZE + 1)
  for (const row of requests.slice(0, PAGE_SIZE)) await ctx.db.delete(row._id)
  return attempts.length <= PAGE_SIZE && options.length <= PAGE_SIZE && requests.length <= PAGE_SIZE
}

/** @selfScoped Une personne exerce son droit sans ouvrir les contenus d'un réseau, même suspendue. */
export const requestErasure = personMutation({
  args: { confirmation: v.literal("DELETE_MY_ANTSIA_ACCOUNT") },
  returns: v.object({ dueAt: v.number() }),
  handler: async (ctx) => {
    await enforceRateLimit(ctx, "person.profile", ctx.person._id)
    const existing = await ctx.db.query("dataErasureJobs").withIndex("by_person", (q) => q.eq("personId", ctx.person._id)).unique()
    if (existing) return { dueAt: existing.dueAt }
    const now = Date.now()
    const links = await ctx.db.query("identityLinks").withIndex("by_person_and_provider", (q) => q.eq("personId", ctx.person._id)).take(16)
    const user: unknown = await ctx.runQuery(components.betterAuth.adapter.findOne, { model: "user", where: [{ field: "_id", value: ctx.person.authUserId }] })
    const contacts: string[] = []
    if (user && typeof user === "object") {
      for (const field of ["email", "phoneNumber"] as const) {
        const value = (user as Record<string, unknown>)[field]
        if (typeof value === "string" && value.length <= 320) contacts.push(value)
      }
    }
    const dueAt = now + ERASURE_GRACE_MS
    const id = await ctx.db.insert("dataErasureJobs", { personId: ctx.person._id, authUserId: ctx.person.authUserId, phase: "waiting", requestedAt: now, dueAt, updatedAt: now, tableIndex: 0, cursor: null, changed: false, passes: 0, erasedRows: 0, identitySubjects: links.filter((link) => link.provider === "idn").map((link) => link.subject), contacts })
    await ctx.db.patch(ctx.person._id, { deletionRequestedAt: now, updatedAt: now })
    if (!await revokePaymentDataForPerson(ctx, ctx.person._id)) await ctx.scheduler.runAfter(0, internal.modules.people.erasure.continuePaymentRevocation, { personId: ctx.person._id })
    if (!await revokeCheckoutPreparations(ctx, ctx.person._id)) await ctx.scheduler.runAfter(0, internal.modules.people.erasure.continueCheckoutRevocation, { personId: ctx.person._id })
    if (!await revokeCommercialCrmForPerson(ctx, ctx.person._id)) await ctx.scheduler.runAfter(60_000, revokeCrmPersonRef, { personId: ctx.person._id })
    await revokeAdministrationForPerson(ctx, ctx.person._id)
    if (!await revokeCommerceForPerson(ctx, ctx.person._id)) await ctx.scheduler.runAfter(0, internal.modules.people.erasure.continueCommerceRevocation, { personId: ctx.person._id })
    // P15 : candidatures retirées dès la demande ; les copies PRO.GA sont révoquées par le canal privé.
    if (!await revokeJobApplicationsForPerson(ctx, ctx.person._id)) await ctx.scheduler.runAfter(60_000, continueJobRevocationRef, { personId: ctx.person._id })
    // P14 : corps signés et baux des demandes de services expurgés dès la demande ; aucune réponse tardive appliquée.
    if (!await revokeServicesForPerson(ctx, ctx.person._id)) await ctx.scheduler.runAfter(0, continueServiceRevocationRef, { personId: ctx.person._id })
    await appendAudit(ctx, { action: "data.erasure_request", capacity: "member", actorPersonId: ctx.person._id, subject: { table: "dataErasureJobs", id } })
    return { dueAt }
  },
})

/** @selfScoped Annulation uniquement pendant la grâce : aucune promesse de restauration après purge. */
export const cancelErasure = personMutation({
  args: {}, returns: v.null(),
  handler: async (ctx) => {
    await enforceRateLimit(ctx, "data.erasure.cancel", ctx.person._id)
    const job = await ctx.db.query("dataErasureJobs").withIndex("by_person", (q) => q.eq("personId", ctx.person._id)).unique()
    if (!job) return null
    if (job.phase !== "waiting" || Date.now() >= job.dueAt) return fail("invalidArgument", { field: "erasurePhase" })
    await ctx.db.delete(job._id)
    await ctx.db.patch(ctx.person._id, { deletionRequestedAt: undefined, updatedAt: Date.now() })
    await appendAudit(ctx, { action: "data.erasure_cancel", capacity: "member", actorPersonId: ctx.person._id, subject: { table: "persons", id: ctx.person._id } })
    return null
  },
})

/** @selfScoped État minimal de sa demande ; aucun identifiant du composant ou contact exposé. */
export const myErasure = personQuery({
  args: {}, returns: v.union(v.null(), v.object({ requestedAt: v.number(), dueAt: v.number(), canCancel: v.boolean() })),
  handler: async (ctx) => {
    const job = await ctx.db.query("dataErasureJobs").withIndex("by_person", (q) => q.eq("personId", ctx.person._id)).unique()
    return job ? { requestedAt: job.requestedAt, dueAt: job.dueAt, canCancel: job.phase === "waiting" && Date.now() < job.dueAt } : null
  },
})

/** @selfScoped Export personnel paginé ; la permission est relue à chaque page, jamais d'URL de blob. */
export const exportMyData = personMutation({
  args: {}, returns: v.object({ exportId: v.id("dataExports"), expiresAt: v.number(), tableCount: v.number(), accountJson: v.string() }),
  handler: async (ctx) => {
    await enforceRateLimit(ctx, "person.profile", ctx.person._id)
    if (unclassifiedDataTables().length) return fail("invalidArgument", { field: "dataInventory" })
    const now = Date.now(), expiresAt = now + 24 * 60 * 60 * 1000
    const exportId = await ctx.db.insert("dataExports", { personId: ctx.person._id, requestedAt: now, expiresAt })
    const user = await ctx.runQuery(components.betterAuth.adapter.findOne, { model: "user", where: [{ field: "_id", value: ctx.person.authUserId }] })
    const account = user ? { name: user.name, email: user.email, emailVerified: user.emailVerified, phoneNumber: user.phoneNumber, phoneNumberVerified: user.phoneNumberVerified, createdAt: user.createdAt, updatedAt: user.updatedAt } : null
    const links = await ctx.db.query("identityLinks").withIndex("by_person_and_provider", (q) => q.eq("personId", ctx.person._id)).take(16)
    const proofs = []
    for (const link of links) if (link.provider === "idn") {
      const proof = await ctx.db.query("idnProofs").withIndex("by_subject", (q) => q.eq("subject", link.subject)).unique()
      if (proof) proofs.push({ subject: proof.subject, loa: proof.loa, observedAt: proof.observedAt, nationality: proof.nationality, profileType: proof.profileType })
    }
    await appendAudit(ctx, { action: "data.export_request", capacity: "member", actorPersonId: ctx.person._id, subject: { table: "dataExports", id: exportId } })
    return { exportId, expiresAt, tableCount: dataTableNames().length, accountJson: JSON.stringify({ account, identityProofs: proofs }) }
  },
})

/** Une page de l'export d'une table : `{ table, json, nextTableIndex, cursor, done }`, contrat lu par DIASPORALE. */
export type ExportTablePage = { table: string; json: string; nextTableIndex: number; cursor: string | null; done: boolean }

/**
 * DP-F1 : une table par appel ; ses lignes viennent des index des champs qui ouvrent l'export
 * (`exportKeyFields`), jamais d'un balayage — sauf les tables résiduelles nommées. La personne
 * fixe chaque plage d'index ; le curseur n'en porte que la position.
 */
export async function exportTablePage(db: QueryCtx["db"], input: { personId: Id<"persons">; requestedAt: number; tableIndex: number; cursor: string | null }): Promise<ExportTablePage> {
  if (accessGaps().length) return fail("invalidArgument", { field: "dataInventory" })
  const names = dataTableNames()
  if (!Number.isInteger(input.tableIndex) || input.tableIndex < 0 || input.tableIndex >= names.length) return fail("invalidArgument", { field: "tableIndex" })
  const table = names[input.tableIndex]! as TableNames, personId = input.personId
  const page = (rows: DataRecord[], cursor: string | null, planIndex = -1, plans: readonly IndexPlan[] = []): ExportTablePage => {
    const records = rows.flatMap((row) => {
      if (row._creationTime > input.requestedAt) return []
      // Une ligne atteinte par un champ précédent de la même table est déjà rendue.
      if (plans.slice(0, Math.max(planIndex, 0)).some((plan) => matchesPlan(plan, row, personId))) return []
      const record = exportableRecord(table, row, personId)
      return record ? [record] : []
    })
    const nextTableIndex = input.tableIndex + (cursor === null ? 1 : 0)
    return { table, json: JSON.stringify(records), nextTableIndex, cursor, done: nextTableIndex === names.length }
  }
  if (table === "persons") {
    if (input.cursor !== null) return fail("invalidArgument", { field: "cursor" })
    const own = await db.get(personId)
    return page(own ? [own as unknown as DataRecord] : [], null)
  }
  // Signaux de quelques secondes, purgés chaque minute (`SHORT_LIVED_TABLES`) : rien à lire.
  if (isShortLivedTable(table)) return page([], null)
  if (isResidualScanTable(table)) {
    const scan = await db.query(table).paginate({ numItems: EXPORT_PAGE_SIZE, cursor: input.cursor, maximumBytesRead: PAGE_BYTES })
    return page(scan.page as unknown as DataRecord[], scan.isDone ? null : scan.continueCursor)
  }
  const plans = exportPlans(table)
  let from: UnitCursor | null = null
  if (input.cursor !== null) {
    let parsed: unknown
    try { parsed = JSON.parse(input.cursor) } catch { return fail("invalidArgument", { field: "cursor" }) }
    from = parseUnitCursor(db, parsed, plans)
  }
  const read = await readUnits(db, plans, personId, from, { ops: 0, paginated: false, maxOps: EXPORT_MAX_OPS }, { numItems: EXPORT_PAGE_SIZE, maximumBytesRead: PAGE_BYTES })
  return page(read.rows, read.next === null ? null : JSON.stringify(read.next), read.planIndex, plans)
}

/** @selfScoped Les curseurs ne donnent aucun droit : la personne de la session fixe chaque plage d'index. */
export const exportMyDataPage = personQuery({
  args: { exportId: v.id("dataExports"), tableIndex: v.number(), cursor: v.union(v.string(), v.null()) },
  returns: v.object({ table: v.string(), json: v.string(), nextTableIndex: v.number(), cursor: v.union(v.string(), v.null()), done: v.boolean() }),
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.exportId)
    if (!job || job.personId !== ctx.person._id || job.expiresAt <= Date.now()) return notFound()
    return await exportTablePage(ctx.db, { personId: ctx.person._id, requestedAt: job.requestedAt, tableIndex: args.tableIndex, cursor: args.cursor })
  },
})

async function marked(ctx: MutationCtx, jobId: Id<"dataErasureJobs">, targetId: string): Promise<boolean> {
  return (await ctx.db.query("dataErasureTargets").withIndex("by_job_target", (q) => q.eq("jobId", jobId).eq("targetId", targetId)).unique()) !== null
}
async function mark(ctx: MutationCtx, jobId: Id<"dataErasureJobs">, table: string, targetId: string): Promise<boolean> {
  if (await marked(ctx, jobId, targetId)) return false
  await ctx.db.insert("dataErasureTargets", { jobId, table, targetId })
  return true
}
async function inheritedOwnership(ctx: MutationCtx, job: Doc<"dataErasureJobs">, table: string, row: DataRecord): Promise<boolean> {
  for (const field of DATA_TABLE_POLICIES[table]?.parents ?? []) {
    if (typeof row[field] === "string" && await marked(ctx, job._id, row[field])) return true
  }
  return false
}
async function anonymousPerson(ctx: MutationCtx): Promise<Id<"persons">> {
  const person = await ctx.db.query("persons").withIndex("by_authUserId", (q) => q.eq("authUserId", ANONYMOUS_AUTH_ID)).unique()
  if (person) return person._id
  const now = Date.now()
  return await ctx.db.insert("persons", { authUserId: ANONYMOUS_AUTH_ID, erasedAt: now, createdAt: now, updatedAt: now })
}
async function purgeBlobs(ctx: MutationCtx, row: DataRecord, table: string) {
  const ids = new Set(referencesIn(row, shapeFor(table)).filter((ref) => ref.table === "_storage").map((ref) => ref.id))
  for (const id of ids) {
    const storageId = id as Id<"_storage">
    if (await ctx.db.system.get("_storage", storageId)) await ctx.storage.delete(storageId)
  }
}
async function removeCounters(ctx: MutationCtx, table: string, row: DataRecord) {
  // Vague H DIASPORALE (G9, délégué) : compteurs de nos tables seulement (réponses, inscriptions, signalements « périmée »).
  await removeDiasporaCounters(ctx, table, row)
  if (table === "commercialThreads" && typeof row.requesterPersonId === "string" && typeof row.shopId === "string") await rateLimiter.reset(ctx, "commercial.request.pair", { key: `${row.requesterPersonId}:${row.shopId}` })
  // CC-2b : le budget d'un fil contextuel effacé disparaît avec lui (les clés personnelles sont remises à zéro à la fin).
  if (table === "contextualThreads") await rateLimiter.reset(ctx, "contextual.thread", { key: row._id })
  if (table === "eventParticipants") await unrecordPageEventParticipation(ctx, row as unknown as Doc<"eventParticipants">)
  if (table === "postComments") await unrecordComment(ctx, row as unknown as Doc<"postComments">)
  if (table === "posts") { await unrecordShare(ctx, row as unknown as Doc<"posts">); await unrecordPagePost(ctx, row as unknown as Doc<"posts">) }
  if (table === "follows") await followerCounts.deleteIfExists(ctx, row as unknown as Doc<"follows">)
  if (table === "thematicGroupMembers") await unrecordGroupMember(ctx, row as unknown as Doc<"thematicGroupMembers">)
  if (table === "pageFollows") await unrecordPageFollower(ctx, row as unknown as Doc<"pageFollows">)
  if (table === "groupMembers") {
    const member = row as unknown as Doc<"groupMembers">
    if (member.unreadCount > 0) await adjustUnreadPart(ctx, member.networkId, member.personId, "groups", -member.unreadCount)
  }
  if (table === "personalMessages") {
    const message = row as unknown as Doc<"personalMessages">
    const thread = await ctx.db.get(message.threadId)
    if (thread && !message.readAt && !message.deletedAt && (message.type === undefined || message.type === "text")) {
      const recipient = message.senderPersonId === thread.personLow ? thread.personHigh : thread.personLow
      if (!message.hiddenForPersonIds?.includes(recipient)) await adjustPersonalUnreadTotal(ctx, thread.networkId, recipient, -1)
    }
  }
  if (table === "postReactions") {
    const reaction = row as unknown as Doc<"postReactions">
    if (await ctx.db.get(reaction.postId)) await applyReactionDelta(ctx, reaction.postId, reaction.personId, reaction.kind, -1)
  }
}

/** L'aperçu dénormalisé doit perdre aussi le contenu d'une copie effacée. */
async function clearMessagePreview(ctx: MutationCtx, table: string, row: DataRecord): Promise<void> {
  if (table === "personalMessages") {
    const message = row as unknown as Doc<"personalMessages">, thread = await ctx.db.get(message.threadId)
    if (thread && thread.lastMessageAt === message.createdAt && thread.lastMessageByPersonId === message.senderPersonId) await ctx.db.patch(thread._id, { lastMessageText: undefined, lastMessageKind: undefined, lastMessageAttachmentCount: undefined })
    if (thread?.pinnedMessageId === message._id) await ctx.db.patch(thread._id, { pinnedMessageId: undefined })
  } else if (table === "groupMessages") {
    const message = row as unknown as Doc<"groupMessages">, thread = await ctx.db.get(message.threadId)
    if (thread?.lastMessageId === message._id) await ctx.db.patch(thread._id, { lastMessageText: undefined, lastMessageKind: undefined, lastMessageAttachmentCount: undefined })
    if (thread?.pinnedMessageId === message._id) await ctx.db.patch(thread._id, { pinnedMessageId: undefined })
  }
}

/** Efface aussi les copies transférées ; les messages d'autres auteurs gardent une tombe sans contenu. */
async function anonymizeRow(ctx: MutationCtx, job: Doc<"dataErasureJobs">, table: TableNames, row: DataRecord, anonymousId: Id<"persons">): Promise<boolean> {
  const normalized = anonymizeReferences(row, shapeFor(table), job.personId, anonymousId) as Record<string, unknown>
  if (["engineAudit", "networkSettingsHistory", "pageIdentityHistory"].includes(table) && row.actorPersonId === job.personId) {
    delete normalized.details; delete normalized.reason
  }
  if (["contentReports", "reports"].includes(table) && row.reporterPersonId === job.personId) delete normalized.note
  if (table === "reports" && row.ownerPersonId === job.personId) { delete normalized.note; delete normalized.decisionReason }
  if (table === "reports" && row.targetKind === "person" && row.targetId === job.personId) normalized.targetId = anonymousId
  // SU01h : la mesure demeure (preuve d'exécution), sans la personne : le texte ordonné qui la visait part avec elle.
  if (table === "judicialMeasures" && row.subjectPersonId === job.personId) { delete normalized.correctionText; delete normalized.originLabel }
  if (table === "judicialMeasures" && row.targetKind === "person" && row.targetId === job.personId) normalized.targetId = anonymousId
  if ((table === "personalMessages" || table === "groupMessages") && typeof row.replyToMessageId === "string" && await marked(ctx, job._id, row.replyToMessageId)) {
    delete normalized.replyToMessageId
    normalized.replyToDeletedAccount = true
  }
  const forwarded = row.forwardedFrom
  if ((table === "personalMessages" || table === "groupMessages") && forwarded && typeof forwarded === "object" && "messageId" in forwarded && typeof forwarded.messageId === "string" && await marked(ctx, job._id, forwarded.messageId)) {
    await clearMessagePreview(ctx, table, row)
    delete normalized.content; delete normalized.attachmentFiles; delete normalized.forwardedFrom
    normalized.deletedAt = Date.now()
  }
  // Une prévisualisation dénormalisée ne doit pas conserver le texte de l'auteur effacé.
  if ((table === "personalThreads" || table === "groupThreads") && row.lastMessageByPersonId === job.personId) {
    for (const key of ["lastMessagePreview", "lastMessageText", "lastMessageContent"]) delete normalized[key]
  }
  if (table === "engineAudit" && row.subjectTable === "persons" && row.subjectId === job.personId) normalized.subjectId = "erased"
  const patch: Record<string, unknown> = {}
  for (const key of new Set([...Object.keys(row), ...Object.keys(normalized)])) {
    if (key === "_id" || key === "_creationTime") continue
    if (JSON.stringify(row[key]) !== JSON.stringify(normalized[key])) patch[key] = normalized[key]
  }
  if (!Object.keys(patch).length) return false
  await ctx.db.patch(row._id as Id<TableNames>, patch as Partial<Doc<TableNames>>)
  return true
}

/**
 * DP-F1 : progression des phases `discover` et `erase`, persistée dans `cursor` (JSON, `v: 2`).
 * Découverte : lignes possédées par index de propriétaire, puis enfants des lignes marquées par
 * index de parent, jusqu'au point fixe (une passe sans nouvelle marque). Effacement : références
 * anonymisées par index, copies et réponses des messages marqués, appels tenus par la personne,
 * suppression des lignes marquées (blobs, compteurs, aperçus), puis relecture des enfants nés
 * entre-temps ; une nouvelle marque relance une passe. Un curseur d'un parcours antérieur
 * (balayage) fait reprendre la phase au début : les marques sont idempotentes.
 */
type TargetRef = { t: string; i: string }
type SocialState =
  | { v: 2; s: "owned" | "anonymize"; t: number; u: UnitCursor | null }
  | { v: 2; s: "expand" | "verify" | "dependents"; at: TargetRef | null; r: number; u: UnitCursor | null }
  | { v: 2; s: "carriers" | "delete"; at: TargetRef | null }
  | { v: 2; s: "residual"; t: number; c: string | null }

// Listes dérivées du schéma à la première étape (jamais au chargement du module : le schéma importe les modules).
let tableLists: { generic: string[]; residual: string[]; dependentParents: string[]; carrierChildren: string[] } | null = null
function erasureTableLists() {
  return tableLists ??= {
    generic: dataTableNames().filter((name) => !ERASURE_EXCLUDED_TABLES.has(name) && !isResidualScanTable(name) && !isShortLivedTable(name)),
    residual: dataTableNames().filter((name) => !ERASURE_EXCLUDED_TABLES.has(name) && isResidualScanTable(name)),
    dependentParents: [...new Set(dependentRelations().flatMap((relation) => relation.parents === "*" ? [] : relation.parents))].sort(),
    carrierChildren: [...new Set(carrierRelations().map((relation) => relation.table))].sort(),
  }
}

function initialSocialState(phase: "discover" | "erase"): SocialState {
  return { v: 2, s: phase === "discover" ? "owned" : "anonymize", t: 0, u: null }
}

function decodeSocialState(phase: "discover" | "erase", cursor: string | null): SocialState {
  if (cursor === null) return initialSocialState(phase)
  let parsed: unknown
  try { parsed = JSON.parse(cursor) } catch { return initialSocialState(phase) }
  if (typeof parsed !== "object" || parsed === null || (parsed as { v?: unknown }).v !== 2) return initialSocialState(phase)
  const stages = phase === "discover" ? ["owned", "expand", "residual"] : ["anonymize", "dependents", "carriers", "residual", "delete", "verify"]
  return stages.includes(String((parsed as { s?: unknown }).s)) ? parsed as SocialState : initialSocialState(phase)
}

/** Cible suivante du travail, dans l'ordre (table, identifiant), sans pagination. */
async function nextTarget(ctx: MutationCtx, jobId: Id<"dataErasureJobs">, tables: readonly string[] | null, after: TargetRef | null): Promise<TargetRef | null> {
  const targets = () => ctx.db.query("dataErasureTargets")
  if (tables === null) {
    const row = after === null
      ? await targets().withIndex("by_job_table_target", (q) => q.eq("jobId", jobId)).first()
      : await targets().withIndex("by_job_table_target", (q) => q.eq("jobId", jobId).eq("table", after.t).gt("targetId", after.i)).first()
        ?? await targets().withIndex("by_job_table_target", (q) => q.eq("jobId", jobId).gt("table", after.t)).first()
    return row ? { t: row.table, i: row.targetId } : null
  }
  for (const table of tables.slice(after === null ? 0 : Math.max(tables.indexOf(after.t), 0))) {
    const row = await targets().withIndex("by_job_table_target", (q) => {
      const prefix = q.eq("jobId", jobId).eq("table", table)
      return after !== null && after.t === table ? prefix.gt("targetId", after.i) : prefix
    }).first()
    if (row) return { t: row.table, i: row.targetId }
  }
  return null
}

async function targetRow(ctx: MutationCtx, target: TargetRef): Promise<DataRecord | null> {
  const id = ctx.db.normalizeId(target.t as TableNames, target.i)
  return id ? await ctx.db.get(id) as unknown as DataRecord | null : null
}


type Progress = { phase: "discover" | "erase" | "auth"; state: SocialState; changed: boolean; passes: number; erasedRows: number }

/** Fin d'une passe : une nouvelle marque en relance une, sinon la phase suivante commence. */
function endOfPass(progress: Progress): void {
  if (progress.changed) {
    progress.state = progress.phase === "discover" ? { v: 2, s: "expand", at: null, r: 0, u: null } : initialSocialState("erase")
    progress.changed = false; progress.passes += 1
  } else if (progress.phase === "discover") {
    progress.phase = "erase"; progress.state = initialSocialState("erase"); progress.passes = 0
  } else progress.phase = "auth"
}

/** Les cibles d'une étape sont épuisées : étape suivante de la passe. */
function afterTargets(progress: Progress, stage: "expand" | "verify" | "dependents" | "carriers" | "delete"): void {
  const residual: SocialState = { v: 2, s: "residual", t: 0, c: null }
  if (stage === "expand") { if (erasureTableLists().residual.length) progress.state = residual; else endOfPass(progress) }
  else if (stage === "dependents") progress.state = { v: 2, s: "carriers", at: null }
  else if (stage === "carriers") progress.state = erasureTableLists().residual.length ? residual : { v: 2, s: "delete", at: null }
  else if (stage === "delete") progress.state = { v: 2, s: "verify", at: null, r: 0, u: null }
  else endOfPass(progress)
}

export async function socialErasureStep(ctx: MutationCtx, job: Doc<"dataErasureJobs">): Promise<void> {
  const personId = job.personId, jobId = job._id
  const startPhase = job.phase === "discover" ? "discover" : "erase"
  const progress: Progress = { phase: startPhase, state: decodeSocialState(startPhase, job.cursor), changed: job.changed, passes: job.passes, erasedRows: job.erasedRows }
  const budget: ReadBudget = { ops: 0, paginated: false, maxOps: ERASURE_MAX_OPS }
  const options = { numItems: PAGE_SIZE, maximumBytesRead: PAGE_BYTES }
  let rowsWork = 0, anonymous: Id<"persons"> | null = null
  const anonymousId = async () => (anonymous ??= await anonymousPerson(ctx))
  const owned = async (table: string, row: DataRecord) => directlyOwned(table, row, personId) || await inheritedOwnership(ctx, job, table, row)
  const markNew = async (table: string, row: DataRecord) => { if (await mark(ctx, jobId, table, row._id)) progress.changed = true }
  while (progress.phase !== "auth" && budget.ops < ERASURE_MAX_OPS && rowsWork < PAGE_SIZE) {
    const state = progress.state
    if (state.s === "owned" || state.s === "anonymize") {
      const table = erasureTableLists().generic[state.t]
      if (!table) {
        // La première expansion relit toutes les cibles : les marques initiales n'exigent pas de passe de plus.
        if (state.s === "owned") { progress.state = { v: 2, s: "expand", at: null, r: 0, u: null }; progress.changed = false }
        else progress.state = { v: 2, s: "dependents", at: null, r: 0, u: null }
        continue
      }
      const read = await readUnits(ctx.db, state.s === "owned" ? ownerPlans(table) : referencePlans(table), personId, state.u, budget, options)
      for (const row of read.rows) {
        if (state.s === "owned") await mark(ctx, jobId, table, row._id)
        else if (await marked(ctx, jobId, row._id)) continue
        else if (await owned(table, row)) await markNew(table, row)
        else await anonymizeRow(ctx, job, table as TableNames, row, await anonymousId())
      }
      rowsWork += read.rows.length
      progress.state = read.next === null ? { ...state, t: state.t + 1, u: null } : { ...state, u: read.next }
      if (read.stop) break
    } else if (state.s === "expand" || state.s === "verify" || state.s === "dependents") {
      const dependents = state.s === "dependents"
      const tables = dependents ? erasureTableLists().dependentParents : null
      const at = state.at
      const relation = at === null ? undefined : relationsFor(dependents ? dependentRelations() : childRelations(), at.t)[state.r]
      if (at === null || !relation) {
        budget.ops += 1
        const next = await nextTarget(ctx, jobId, tables, at)
        if (next) progress.state = { ...state, at: next, r: 0, u: null }
        else afterTargets(progress, state.s)
        continue
      }
      const read = await readUnits(ctx.db, [relation.plan], at.i, state.u, budget, options)
      for (const row of read.rows) {
        if (!dependents) await markNew(relation.plan.table, row)
        else if (!await marked(ctx, jobId, row._id)) await anonymizeRow(ctx, job, relation.plan.table, row, await anonymousId())
      }
      rowsWork += read.rows.length
      progress.state = read.next === null ? { ...state, r: state.r + 1, u: null } : { ...state, u: read.next }
      if (read.stop) break
    } else if (state.s === "carriers" || state.s === "delete") {
      budget.ops += 1
      const next = await nextTarget(ctx, jobId, state.s === "carriers" ? erasureTableLists().carrierChildren : null, state.at)
      if (!next) { afterTargets(progress, state.s); continue }
      progress.state = { ...state, at: next }
      rowsWork += 1
      const row = await targetRow(ctx, next)
      if (!row) continue
      if (state.s === "delete") {
        await purgeBlobs(ctx, row, next.t)
        await clearMessagePreview(ctx, next.t, row)
        await removeCounters(ctx, next.t, row)
        await ctx.db.delete(row._id as Id<TableNames>)
        progress.erasedRows += 1
        continue
      }
      // L'appel que la personne tenait en attente perd son identifiant (tableau `heldBy`).
      for (const relation of carrierRelations()) {
        const parentId = row[relation.field]
        if (relation.table !== next.t || typeof parentId !== "string" || await marked(ctx, jobId, parentId)) continue
        const parent = await targetRow(ctx, { t: relation.parent, i: parentId })
        if (parent) await anonymizeRow(ctx, job, relation.parent as TableNames, parent, await anonymousId())
      }
    } else if (state.s === "residual") {
      const table = erasureTableLists().residual[state.t]
      if (!table) {
        if (progress.phase === "discover") endOfPass(progress)
        else progress.state = { v: 2, s: "delete", at: null }
        continue
      }
      // Tranche diaspora encore sans index (exception nommée) : balayage de sa seule table.
      if (budget.paginated) break
      budget.paginated = true; budget.ops += 1
      const scan = await ctx.db.query(table as TableNames).paginate({ numItems: PAGE_SIZE, cursor: state.c, maximumBytesRead: PAGE_BYTES })
      for (const item of scan.page) {
        const row = item as unknown as DataRecord
        if (progress.phase !== "discover" && await marked(ctx, jobId, row._id)) continue
        if (await owned(table, row)) await markNew(table, row)
        else if (progress.phase !== "discover") await anonymizeRow(ctx, job, table as TableNames, row, await anonymousId())
      }
      rowsWork += scan.page.length
      progress.state = scan.isDone ? { ...state, t: state.t + 1, c: null } : { ...state, c: scan.continueCursor }
      break
    }
  }
  await ctx.db.patch(jobId, progress.phase === "auth"
    ? { phase: "auth", tableIndex: 0, cursor: null, changed: false, erasedRows: progress.erasedRows, passes: progress.passes, updatedAt: Date.now() }
    : { phase: progress.phase, cursor: JSON.stringify(progress.state), changed: progress.changed, erasedRows: progress.erasedRows, passes: progress.passes, updatedAt: Date.now() })
}

/** Page interne d'un travail confirmé et échu. L'état persisté rend toute reprise idempotente. */
export const continueErasure = internalMutation({
  args: { jobId: v.id("dataErasureJobs") }, returns: v.null(),
  handler: async (ctx, { jobId }) => {
    const job = await ctx.db.get(jobId)
    if (!job || job.dueAt > Date.now()) return null
    const person = await ctx.db.get(job.personId)
    if (!person || person.deletionRequestedAt !== job.requestedAt) return null
    if (unclassifiedDataTables().length || accessGaps().length) throw new Error("Incomplete erasure inventory")
    if (job.phase === "waiting") {
      if (!await revokePaymentDataForPerson(ctx, job.personId)) {
        await ctx.scheduler.runAfter(0, internal.modules.people.erasure.continueErasure, { jobId })
        return null
      }
      if (!await revokeCheckoutPreparations(ctx, job.personId)) {
        await ctx.scheduler.runAfter(0, internal.modules.people.erasure.continueErasure, { jobId })
        return null
      }
      if (!await revokeCommercialCrmForPerson(ctx, job.personId)) {
        await ctx.scheduler.runAfter(60_000, internal.modules.people.erasure.continueErasure, { jobId })
        return null
      }
      await revokeAdministrationForPerson(ctx, job.personId)
      if (!await revokeCommerceForPerson(ctx, job.personId)) {
        await ctx.scheduler.runAfter(0, internal.modules.people.erasure.continueErasure, { jobId })
        return null
      }
      // P15 : aucun effacement générique tant qu'un retrait de candidature attend PRO.GA (tentatives bornées).
      if (!await revokeJobApplicationsForPerson(ctx, job.personId)) {
        await ctx.scheduler.runAfter(60_000, internal.modules.people.erasure.continueErasure, { jobId })
        return null
      }
      // P14 : reprise bornée de l'expurgation des commandes de services avant l'effacement générique.
      if (!await revokeServicesForPerson(ctx, job.personId)) {
        await ctx.scheduler.runAfter(0, internal.modules.people.erasure.continueErasure, { jobId })
        return null
      }
      const links = await ctx.db.query("identityLinks").withIndex("by_person_and_provider", (q) => q.eq("personId", job.personId)).take(16)
      const currentUser: unknown = await ctx.runQuery(components.betterAuth.adapter.findOne, { model: "user", where: [{ field: "_id", value: job.authUserId }] })
      const contacts = new Set(job.contacts)
      if (currentUser && typeof currentUser === "object") for (const field of ["email", "phoneNumber"] as const) {
        const value = (currentUser as Record<string, unknown>)[field]
        if (typeof value === "string" && value.length <= 320) contacts.add(value)
      }
      await ctx.db.patch(jobId, { identitySubjects: [...new Set([...job.identitySubjects, ...links.filter((link) => link.provider === "idn").map((link) => link.subject)])], contacts: [...contacts] })
      await ctx.db.patch(jobId, { phase: "verification", cursor: null, updatedAt: Date.now() })
    } else if (job.phase === "verification") {
      // L'identifiant de vérification n'a pas d'index par utilisateur ; parcourir avec curseur,
      // sans reprendre indéfiniment la première page ni persister un token.
      const page = await ctx.runQuery(components.betterAuth.adapter.findMany, { model: "verification", paginationOpts: { cursor: job.cursor, numItems: 20 } })
      const identifiers = new Set(job.contacts.flatMap((contact) => [contact, ...["sign-in", "email-verification", "forget-password", "change-email"].map((kind) => `${kind}-otp-${contact}`)]))
      for (const item of page.page) {
        let owns = identifiers.has(item.identifier)
        if (!owns && item.identifier.startsWith("one-time-token:")) {
          const session = await ctx.runQuery(components.betterAuth.adapter.findOne, { model: "session", where: [{ field: "token", value: item.value }] })
          owns = session?.userId === job.authUserId
        }
        if (owns) await ctx.runMutation(components.betterAuth.adapter.deleteOne, { input: { model: "verification", where: [{ field: "_id", value: item._id }] } })
      }
      await ctx.db.patch(jobId, { phase: page.isDone ? "revoke" : "verification", cursor: page.isDone ? null : page.continueCursor, updatedAt: Date.now() })
    } else if (job.phase === "revoke") {
      // Couper les sessions avant les contenus ; la garde JWT bloque déjà les écritures à l'échéance.
      const sessions: unknown = await ctx.runMutation(components.betterAuth.adapter.deleteMany, { input: { model: "session", where: [{ field: "userId", value: job.authUserId }] }, paginationOpts: { cursor: null, numItems: 20 } })
      if (typeof sessions !== "object" || sessions === null || !("isDone" in sessions) || sessions.isDone !== true) {
        await ctx.scheduler.runAfter(0, internal.modules.people.erasure.continueErasure, { jobId })
        return null
      }
      await ctx.db.patch(jobId, { phase: "discover", tableIndex: 0, cursor: null, changed: false, updatedAt: Date.now() })
    } else if (job.phase === "discover" || job.phase === "erase") {
      await socialErasureStep(ctx, job)
    } else if (job.phase === "auth") {
      const models = ["session", "account", "twoFactor", "oauthAccessToken", "oauthConsent", "oauthApplication"] as const
      const model = models[job.tableIndex]
      if (model) {
        const result: unknown = await ctx.runMutation(components.betterAuth.adapter.deleteMany, { input: { model, where: [{ field: "userId", value: job.authUserId }] }, paginationOpts: { cursor: null, numItems: 20 } })
        const done = typeof result === "object" && result !== null && "isDone" in result && result.isDone === true
        if (done) await ctx.db.patch(jobId, { tableIndex: job.tableIndex + 1, updatedAt: Date.now() })
      } else {
        for (const subject of job.identitySubjects) {
          const proof = await ctx.db.query("idnProofs").withIndex("by_subject", (q) => q.eq("subject", subject)).unique()
          if (proof) await ctx.db.delete(proof._id)
        }
        for (const contact of job.contacts) {
          const code = await ctx.db.query("devOtpCodes").withIndex("by_email", (q) => q.eq("email", contact)).unique()
          if (code) await ctx.db.delete(code._id)
          for (const identifier of [contact, ...["sign-in", "email-verification", "forget-password", "change-email"].map((kind) => `${kind}-otp-${contact}`)]) {
            const result = await ctx.runMutation(components.betterAuth.adapter.deleteMany, { input: { model: "verification", where: [{ field: "identifier", value: identifier }] }, paginationOpts: { cursor: null, numItems: 20 } })
            if (!result.isDone) { await ctx.scheduler.runAfter(0, internal.modules.people.erasure.continueErasure, { jobId }); return null }
          }
        }
        await ctx.runMutation(components.betterAuth.adapter.deleteOne, { input: { model: "user", where: [{ field: "_id", value: job.authUserId }] } })
        await erasePersonalRateLimits(ctx, job.personId, job.authUserId, job.contacts)
        await purgeBlobs(ctx, person as unknown as DataRecord, "persons")
        await ctx.db.patch(jobId, { phase: "cleanup", updatedAt: Date.now(), contacts: [], identitySubjects: [] })
      }
    } else {
      const targets = await ctx.db.query("dataErasureTargets").withIndex("by_job", (q) => q.eq("jobId", jobId)).take(50)
      for (const target of targets) await ctx.db.delete(target._id)
      if (targets.length === 0) {
        await ctx.db.delete(job.personId)
        await ctx.db.delete(jobId)
        const receipt = await ctx.db.insert("dataErasureReceipts", { completedAt: Date.now(), erasedRows: job.erasedRows, event: "person.erased.v1" })
        await appendAudit(ctx, { action: "data.erasure_complete", capacity: "system", subject: { table: "dataErasureJobs", id: receipt }, details: { rows: job.erasedRows } })
        return null
      }
    }
    await ctx.scheduler.runAfter(0, internal.modules.people.erasure.continueErasure, { jobId })
    return null
  },
})

/** P12 : poursuite locale avant suppression, fermée dès l'annulation de la demande d'effacement. */
export const continuePaymentRevocation = internalMutation({
  args: { personId: v.id("persons") }, returns: v.null(),
  handler: async (ctx, { personId }) => {
    const person = await ctx.db.get(personId)
    if (person?.deletionRequestedAt === undefined) return null
    const job = await ctx.db.query("dataErasureJobs").withIndex("by_person", q => q.eq("personId", personId)).unique()
    if (!job || job.requestedAt !== person.deletionRequestedAt) return null
    if (!await revokePaymentDataForPerson(ctx, personId)) await ctx.scheduler.runAfter(0, internal.modules.people.erasure.continuePaymentRevocation, { personId })
    return null
  },
})

/** P11 : poursuite bornée de l'invalidation des préparations, avant toute suppression. */
export const continueCheckoutRevocation = internalMutation({
  args: { personId: v.id("persons") }, returns: v.null(),
  handler: async (ctx, { personId }) => {
    const person = await ctx.db.get(personId)
    if (person?.deletionRequestedAt === undefined) return null
    const job = await ctx.db.query("dataErasureJobs").withIndex("by_person", q => q.eq("personId", personId)).unique()
    if (!job || job.requestedAt !== person.deletionRequestedAt) return null
    if (!await revokeCheckoutPreparations(ctx, personId)) await ctx.scheduler.runAfter(0, internal.modules.people.erasure.continueCheckoutRevocation, { personId })
    return null
  },
})

/** Révocation commerciale bornée dès la demande, avant le terme du délai d'annulation. */
export const continueCommerceRevocation = internalMutation({
  args: { personId: v.id("persons") }, returns: v.null(),
  handler: async (ctx, { personId }) => {
    const person = await ctx.db.get(personId)
    if (person?.deletionRequestedAt === undefined) return null
    const job = await ctx.db.query("dataErasureJobs").withIndex("by_person", (q) => q.eq("personId", personId)).unique()
    if (!job || job.requestedAt !== person.deletionRequestedAt) return null
    if (!await revokeCommerceForPerson(ctx, personId)) await ctx.scheduler.runAfter(0, internal.modules.people.erasure.continueCommerceRevocation, { personId })
    return null
  },
})

/** Réveille les demandes échues et chaînes interrompues, onze jobs au plus par passage. */
export const resumeDueErasures = internalMutation({
  args: {}, returns: v.null(),
  handler: async (ctx) => {
    const waiting = await ctx.db.query("dataErasureJobs").withIndex("by_phase_due", (q) => q.eq("phase", "waiting").lte("dueAt", Date.now())).take(5)
    const stale: Doc<"dataErasureJobs">[] = []
    for (const phase of ["verification", "revoke", "discover", "erase", "auth", "cleanup"] as const) {
      stale.push(...await ctx.db.query("dataErasureJobs").withIndex("by_phase_updated", (q) => q.eq("phase", phase).lte("updatedAt", Date.now() - 15 * 60 * 1000)).take(1))
    }
    for (const job of new Map([...waiting, ...stale].map((row) => [row._id, row])).values()) await ctx.scheduler.runAfter(0, internal.modules.people.erasure.continueErasure, { jobId: job._id })
    return null
  },
})

export const purgeExpiredExports = internalMutation({
  args: {}, returns: v.null(),
  handler: async (ctx) => {
    const rows = await ctx.db.query("dataExports").withIndex("by_expiry", (q) => q.lte("expiresAt", Date.now())).take(50)
    for (const row of rows) await ctx.db.delete(row._id)
    if (rows.length === 50) await ctx.scheduler.runAfter(0, internal.modules.people.erasure.purgeExpiredExports, {})
    return null
  },
})
