// Dupliqué de socle/convex/crons/dataSubjectErasure.ts @ 25398f565 — adaptations : droits personnels, confirmation/délai/annulation, inventaire du schéma social, cascade/anonymisation bornée avec progression persistée et reprise ; aucune donnée administrative ni export externe.
import { v } from "convex/values"
import { components, internal } from "../../_generated/api"
import type { Doc, Id, TableNames } from "../../_generated/dataModel"
import { internalMutation, type MutationCtx } from "../../_generated/server"
import { fail, notFound } from "../../lib/errors"
import { personMutation, personQuery } from "../../lib/functions"
import { enforceRateLimit, erasePersonalRateLimits, rateLimiter } from "../../lib/rateLimit"
import { appendAudit } from "../platform/audit"
import { followerCounts } from "../graph/follows"
import { unrecordComment, unrecordGroupMember, unrecordPageFollower, unrecordPagePost, unrecordShare, applyReactionDelta } from "../posts/counters"
import { unrecordPageEventParticipation } from "../events/pageEventRegistrations"
import { removeDiasporaCounters } from "../diaspora/contentCounters"
import { DATA_TABLE_POLICIES } from "./dataPolicies"
import { feedErasurePage, isFeedDataTable } from "./feedDataPage"
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

/** @selfScoped Les curseurs ne donnent aucun droit : filtrage par la personne de la session à chaque page. */
export const exportMyDataPage = personQuery({
  args: { exportId: v.id("dataExports"), tableIndex: v.number(), cursor: v.union(v.string(), v.null()) },
  returns: v.object({ table: v.string(), json: v.string(), nextTableIndex: v.number(), cursor: v.union(v.string(), v.null()), done: v.boolean() }),
  handler: async (ctx, args) => {
    const job = await ctx.db.get(args.exportId)
    if (!job || job.personId !== ctx.person._id || job.expiresAt <= Date.now()) return notFound()
    const names = dataTableNames()
    if (!Number.isInteger(args.tableIndex) || args.tableIndex < 0 || args.tableIndex >= names.length) return fail("invalidArgument", { field: "tableIndex" })
    const table = names[args.tableIndex]! as TableNames
    // PA10 : aucune ligne étrangère de fil à parcourir pour un export personnel.
    const emptyFeedPage = { page: [], isDone: true, continueCursor: "" }
    const page = table === "feedEntries" || table === "feedFanoutJobs" ? emptyFeedPage
      : table === "feedCursors"
        ? await ctx.db.query("feedCursors").withIndex("by_person", q => q.eq("personId", ctx.person._id)).paginate({ numItems: PAGE_SIZE, cursor: args.cursor, maximumBytesRead: PAGE_BYTES, maximumRowsRead: PAGE_SIZE })
        : await ctx.db.query(table).paginate({ numItems: PAGE_SIZE, cursor: args.cursor, maximumBytesRead: PAGE_BYTES })
    const rows = page.page.flatMap((item) => {
      const row = item as unknown as DataRecord
      if (row._creationTime > job.requestedAt) return []
      const record = exportableRecord(table, row, ctx.person._id)
      return record ? [record] : []
    })
    const nextTableIndex = args.tableIndex + (page.isDone ? 1 : 0)
    return { table, json: JSON.stringify(rows), nextTableIndex, cursor: page.isDone ? null : page.continueCursor, done: nextTableIndex === names.length }
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

/** Page interne d'un travail confirmé et échu. L'état persisté rend toute reprise idempotente. */
export const continueErasure = internalMutation({
  args: { jobId: v.id("dataErasureJobs") }, returns: v.null(),
  handler: async (ctx, { jobId }) => {
    const job = await ctx.db.get(jobId)
    if (!job || job.dueAt > Date.now()) return null
    const person = await ctx.db.get(job.personId)
    if (!person || person.deletionRequestedAt !== job.requestedAt) return null
    if (unclassifiedDataTables().length) throw new Error("Incomplete erasure inventory")
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
      const names = dataTableNames().filter((name) => !["persons", "idnProofs", "devOtpCodes", "dataErasureJobs", "dataErasureTargets", "dataErasureReceipts"].includes(name))
      const table = names[job.tableIndex] as TableNames | undefined
      if (!table) {
        if (job.phase === "discover" && job.changed) await ctx.db.patch(jobId, { tableIndex: 0, cursor: null, changed: false, passes: job.passes + 1, updatedAt: Date.now() })
        else if (job.phase === "discover") await ctx.db.patch(jobId, { phase: "erase", tableIndex: 0, cursor: null, changed: false, passes: 0, updatedAt: Date.now() })
        else if (job.changed) await ctx.db.patch(jobId, { tableIndex: 0, cursor: null, changed: false, passes: job.passes + 1, updatedAt: Date.now() })
        else await ctx.db.patch(jobId, { phase: "auth", tableIndex: 0, cursor: null, updatedAt: Date.now() })
      } else {
        const page = isFeedDataTable(table)
          ? await feedErasurePage(ctx, { table, personId: job.personId, jobId, cursor: job.cursor, numItems: PAGE_SIZE, maximumBytesRead: PAGE_BYTES })
          : await ctx.db.query(table).paginate({ numItems: PAGE_SIZE, cursor: job.cursor, maximumBytesRead: PAGE_BYTES })
        let changed = job.changed, erasedRows = job.erasedRows
        const anonymousId = job.phase === "erase" ? await anonymousPerson(ctx) : null
        for (const item of page.page) {
          const row = item as unknown as DataRecord
          if (job.phase === "discover") {
            if (directlyOwned(table, row, job.personId) || await inheritedOwnership(ctx, job, table, row)) changed = await mark(ctx, jobId, table, row._id) || changed
          } else if (await marked(ctx, jobId, row._id) || directlyOwned(table, row, job.personId) || await inheritedOwnership(ctx, job, table, row)) {
            await mark(ctx, jobId, table, row._id)
            await purgeBlobs(ctx, row, table)
            await clearMessagePreview(ctx, table, row)
            await removeCounters(ctx, table, row)
            await ctx.db.delete(row._id as Id<TableNames>)
            changed = true; erasedRows += 1
          } else if (anonymousId) changed = await anonymizeRow(ctx, job, table, row, anonymousId) || changed
        }
        await ctx.db.patch(jobId, { tableIndex: job.tableIndex + (page.isDone ? 1 : 0), cursor: page.isDone ? null : page.continueCursor, changed, erasedRows, updatedAt: Date.now() })
      }
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
