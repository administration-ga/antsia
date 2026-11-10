/**
 * P15 : transport serveur borné des candidatures. Le planificateur ne porte que
 * l'identifiant de la ligne ; les octets signés vivent dans la ligne jusqu'à
 * résolution ; une pièce n'est lue qu'au moment de son envoi, si elle est
 * toujours la sienne, prête et saine (antivirus complet). Tentatives bornées,
 * reprise par le cron ; aucun corps, aucun nom ni secret dans les journaux.
 *
 * Étapes d'une candidature : `submit` (octets COMMAND persistés) → `status`
 * (résolution d'une demande expirée) → `upload` (une pièce déclarée à la fois,
 * octets exacts signés) → `revoke` (pièce retirée par le candidat) → `status`
 * (suivi demandé) ; `withdraw` à tout moment après un envoi.
 */
import { COMMERCE_JOBS_CONTROL_CONTRACT, COMMERCE_JOBS_CONTROL_TTL_MS, COMMERCE_JOBS_LIMITS, commerceJobsApplicationState, commerceJobsIsPdf, parseCommerceJobsControlRequest, parseCommerceJobsControlResponse, parseCommerceJobsFileResponse } from "@antsia/social-domain/commerce-jobs"
import { COMMERCE_COMMAND_SCOPES, decideCommerceRetryAfterTimeout, parseCommerceCommandRequest, parseCommerceCommandResponse } from "@antsia/social-domain/commerce/command"
import type { CommerceApplicationState } from "@antsia/social-domain/commerce/lifecycle"
import { COMMERCE_COMMAND_CONTRACT, commerceCanonicalJson } from "@antsia/social-domain/commerce/primitives"
import { makeFunctionReference } from "convex/server"
import { v } from "convex/values"

import type { Doc, Id } from "../../_generated/dataModel"
import { type ActionCtx, internalAction, internalMutation, type MutationCtx } from "../../_generated/server"
import { memberHasStatus } from "../../lib/access"
import { noticeJobApplicationUpdated } from "../notifications/commerceEmit"
import { type CommerceLinkConfig, readCommerceLinkConfig } from "./commerceLinkConfig"
import { sha256Hex } from "./commerceLinkCrypto"
import { liveShopCommerceLink } from "./commerceLinkLifecycle"
import { jobPolicyOf } from "./jobAccess"
import { type JobHttpReply, sendJobCommand, sendJobControl, sendJobFile, sha256OfBytes } from "./jobApplicationClient"
import { deliverJobApplicationRef, IDLE_AT } from "./jobApplicationLifecycle"
import { jobAuthorizationLive } from "./jobApplicationAuthority"
import { jobFileScanOf } from "./jobFiles"
import { type JobApplicationRejection, jobApplicationRejectionValidator, jobRemoteStateValidator, JOB_APPLICATION_REJECTIONS } from "./jobTables"

const MAX_ATTEMPTS = 8
const LEASE_MS = 30_000
const DRAIN_BATCH = 20
const STATUS_TTL_MS = 60_000

type Application = Doc<"commerceApplications">
type Job = { sessionId?: string } & (
  | { kind: "submit"; generation: number; attempt: number; rawBody: string; requestSha256: string }
  | { kind: "status"; generation: number; attempt: number; rawBody: string; requestSha256: string; target: "resolve" | "track"; originalBody?: string; originalSha256: string; applicationRef?: string; targetExpiresAt: number }
  | { kind: "upload"; generation: number; attempt: number; storageId: Id<"_storage">; sha256: string; byteSize: number; attachmentRef: string; submitRequestId: string }
  | { kind: "withdraw" | "revoke"; generation: number; attempt: number; rawBody: string; requestSha256: string; requestId: string; attachmentRef?: string })
export type JobApplicationJob = Job
type Current = { state: CommerceApplicationState; revision: number; updatedAt: number }
type Delivery =
  | { outcome: "submitted"; applicationRef: string; submittedAt: number }
  | { outcome: "rejected"; reason: JobApplicationRejection }
  | { outcome: "expired" }
  | { outcome: "unknown" }
  | { outcome: "tracked"; current: Current | null }
  | { outcome: "stored" | "file_rejected"; attachmentRef: string }
  | { outcome: "applied" | "control_rejected" }
  | { outcome: "unavailable" }

const generationFields = { generation: v.number(), attempt: v.number(), sessionId: v.optional(v.string()) }
const jobValidator = v.union(
  v.object({ kind: v.literal("submit"), ...generationFields, rawBody: v.string(), requestSha256: v.string() }),
  v.object({ kind: v.literal("status"), ...generationFields, rawBody: v.string(), requestSha256: v.string(), target: v.union(v.literal("resolve"), v.literal("track")), originalBody: v.optional(v.string()), originalSha256: v.string(), applicationRef: v.optional(v.string()), targetExpiresAt: v.number() }),
  v.object({ kind: v.literal("upload"), ...generationFields, storageId: v.id("_storage"), sha256: v.string(), byteSize: v.number(), attachmentRef: v.string(), submitRequestId: v.string() }),
  v.object({ kind: v.union(v.literal("withdraw"), v.literal("revoke")), ...generationFields, rawBody: v.string(), requestSha256: v.string(), requestId: v.string(), attachmentRef: v.optional(v.string()) }),
)
const currentValidator = v.object({ state: jobRemoteStateValidator, revision: v.number(), updatedAt: v.number() })
const deliveryValidator = v.union(
  v.object({ outcome: v.literal("submitted"), applicationRef: v.string(), submittedAt: v.number() }),
  v.object({ outcome: v.literal("rejected"), reason: jobApplicationRejectionValidator }),
  v.object({ outcome: v.literal("expired") }),
  v.object({ outcome: v.literal("unknown") }),
  v.object({ outcome: v.literal("tracked"), current: v.union(currentValidator, v.null()) }),
  v.object({ outcome: v.union(v.literal("stored"), v.literal("file_rejected")), attachmentRef: v.string() }),
  v.object({ outcome: v.union(v.literal("applied"), v.literal("control_rejected")) }),
  v.object({ outcome: v.literal("unavailable") }),
)
const claimRef = makeFunctionReference<"mutation", { applicationId: Id<"commerceApplications"> }, Job | null>("modules/shops/jobApplicationTransport:claim")
const finishRef = makeFunctionReference<"mutation", { applicationId: Id<"commerceApplications">; generation: number; attempt: number; job?: Job; delivery: Delivery }, null>("modules/shops/jobApplicationTransport:finish")
const authorizeRef = makeFunctionReference<"mutation", { applicationId: Id<"commerceApplications">; job: Job; configFingerprint: string }, boolean>("modules/shops/jobApplicationTransport:authorize")

function backoff(attempts: number): number {
  return Math.min(3_600_000, 15_000 * 2 ** Math.min(attempts, 8))
}

function isRejection(value: string | undefined): value is JobApplicationRejection {
  return value !== undefined && (JOB_APPLICATION_REJECTIONS as readonly string[]).includes(value)
}

/** Avant le PREMIER envoi : personne vivante, configuration inchangée, politique et lien `receive_applications` vivants. */
async function deliverable(ctx: MutationCtx, row: Application, config: CommerceLinkConfig): Promise<boolean> {
  const person = await ctx.db.get(row.personId)
  if (!person || person.erasedAt !== undefined || person.deletionRequestedAt !== undefined || config.fingerprint !== row.configFingerprint) return false
  // P16 : une suspension (réseau, racine ou sanction globale) ou un départ survenus après le clic
  // ferment le PREMIER envoi : rien n'a encore quitté ANTSIA, la nouvelle opération ne part pas.
  if (!await memberHasStatus(ctx, row.networkId, row.personId, "declaree")) return false
  const shop = await ctx.db.get(row.shopId)
  if (!shop || !(await jobPolicyOf(ctx, shop.networkId)).applications) return false
  const link = await liveShopCommerceLink(ctx, shop.networkId, shop._id)
  return link !== null && link.linkRef === row.linkRef && link.shopRef === row.shopRef && link.permissions.includes("receive_applications")
}

function privateControl(job: Job): job is Extract<Job, { kind: "withdraw" | "revoke" }> {
  return job.kind === "withdraw" || job.kind === "revoke"
}

/** Un arrêt d'autorité conserve l'incertitude et les octets ; seul un geste authentifié ouvre un nouveau bail. */
async function pauseForAuthorization(ctx: MutationCtx, row: Application, now: number): Promise<void> {
  const revokePending = row.state === "submitted" && row.files.some((file) => file.transfer === "revoke_pending")
  await ctx.db.patch(row._id, { authorizationRequired: true, leaseUntil: undefined, leaseSessionId: undefined,
    ...(row.state === "queued" || row.state === "submitting" ? { state: "failed" as const, lastOutcome: "unavailable" as const } : {}),
    nextAttemptAt: revokePending ? now : IDLE_AT, updatedAt: now })
  if (revokePending) await ctx.scheduler.runAfter(0, deliverJobApplicationRef, { applicationId: row._id })
}

async function stageAllowed(ctx: MutationCtx, row: Application, job: Job, after = false): Promise<boolean> {
  if (privateControl(job)) return row.controlBody === job.rawBody && (job.kind === "withdraw"
    ? row.state === "withdrawal_pending"
    : row.state === "submitted" && row.files.some((file) => file.attachmentRef === job.attachmentRef && file.transfer === "revoke_pending"))
  if (!job.sessionId || row.authorizationSessionId !== job.sessionId || row.leaseSessionId !== job.sessionId ||
    !await jobAuthorizationLive(ctx, row, job.kind !== "status")) return false
  if (job.kind === "submit") return row.state === "submitting" && row.rawBody === job.rawBody && row.requestSha256 === job.requestSha256 &&
    (after || row.requestExpiresAt > Date.now()) && await sha256Hex(job.rawBody) === row.requestSha256
  if (job.kind === "status") return (row.state === "submitting" || row.state === "submitted") && row.requestSha256 === job.originalSha256 && row.requestExpiresAt === job.targetExpiresAt
  if (row.state !== "submitted") return false
  const selected = row.files.find((file) => file.attachmentRef === job.attachmentRef && file.transfer === "pending")
  const file = selected ? await ctx.db.get(selected.fileId) : null
  return !!selected && !!file && file.personId === row.personId && file.state === "ready" && file.storageId === job.storageId &&
    file.sha256 === job.sha256 && file.byteSize === job.byteSize && selected.sha256 === job.sha256 && selected.byteSize === job.byteSize &&
    job.submitRequestId === row.requestId && await jobFileScanOf(ctx, file.storageId) === "clean"
}

/**
 * Tentatives épuisées : un retrait ne bloque jamais indéfiniment (trace
 * `remoteUnconfirmed`) ; un envoi jamais parti s'arrête sans octets ; une
 * étape de pièce ou de suivi s'abandonne sans toucher à la candidature reçue.
 */
async function exhaust(ctx: MutationCtx, row: Application, now: number): Promise<void> {
  const idle = { attempts: 0, leaseUntil: undefined, leaseSessionId: undefined, nextAttemptAt: IDLE_AT, updatedAt: now }
  if (row.state === "withdrawal_pending") {
    await ctx.db.patch(row._id, { ...idle, state: "withdrawn", remoteUnconfirmed: true, rawBody: undefined, controlBody: undefined, controlExpiresAt: undefined, controlAttachmentRef: undefined,
      files: row.files.map((file) => ({ ...file, transfer: "revoked" as const })) })
  } else if (row.state === "queued" || row.state === "submitting") {
    await ctx.db.patch(row._id, { ...idle, state: "failed", lastOutcome: "unavailable", ...(row.dispatchedAt === undefined ? { rawBody: undefined } : {}) })
  } else if (row.state === "submitted") {
    const stuck = row.files.some((file) => file.transfer === "revoke_pending")
    await ctx.db.patch(row._id, { ...idle, statusRequestedAt: undefined, controlBody: undefined, controlExpiresAt: undefined, controlAttachmentRef: undefined,
      ...(stuck ? { remoteUnconfirmed: true } : {}),
      files: row.files.map((file) => file.transfer === "pending" ? { ...file, transfer: "failed" as const } : file.transfer === "revoke_pending" ? { ...file, transfer: "revoked" as const } : file) })
  }
}

/**
 * Contrôle privé (retrait ou révocation d'une pièce) : un corps NEUF par
 * tentative (identifiant propre, fenêtre d'une minute), revalidé par le parseur
 * du récepteur ; l'effet chez PRO.GA est idempotent.
 */
async function controlJob(ctx: MutationCtx, row: Application, now: number, attempt: number, attachmentRef?: string): Promise<Job | null> {
  const at = attachmentRef === undefined ? Math.min(row.revokedAt ?? now, now) : now
  const rawBody = commerceCanonicalJson({
    contract: COMMERCE_JOBS_CONTROL_CONTRACT, version: 1, action: attachmentRef === undefined ? "withdraw" : "attachment.revoke",
    source: row.source, environment: row.environment, requestId: await sha256Hex(`application-control:${row.requestId}:${attachmentRef ?? "all"}:${attempt}:${now}`),
    issuedAt: now, expiresAt: now + COMMERCE_JOBS_CONTROL_TTL_MS, at, reason: attachmentRef === undefined ? row.revokeReason ?? "candidate_request" : "candidate_request",
    subjectRef: row.subjectRef, submitRequestId: row.requestId, submitRequestSha256: row.requestSha256,
    ...(attachmentRef === undefined ? {} : { attachmentRef }),
  })
  const parsed = rawBody === null ? null : parseCommerceJobsControlRequest(rawBody, { source: row.source, environment: row.environment, nowMs: now })
  if (rawBody === null || !parsed?.ok) return null
  await ctx.db.patch(row._id, { controlBody: rawBody, controlExpiresAt: now + COMMERCE_JOBS_CONTROL_TTL_MS, controlAttachmentRef: attachmentRef })
  return {
    kind: attachmentRef === undefined ? "withdraw" : "revoke", generation: row.generation, attempt, rawBody, requestSha256: await sha256Hex(rawBody),
    requestId: parsed.value.requestId, ...(attachmentRef === undefined ? {} : { attachmentRef }),
  }
}

/** `request.status` sur la demande d'origine : résolution d'un envoi expiré, ou suivi de l'état autorisé. */
async function statusJob(row: Application, now: number, attempt: number, target: "resolve" | "track"): Promise<Job | null> {
  const rawBody = commerceCanonicalJson({
    contract: COMMERCE_COMMAND_CONTRACT, version: 1, command: "request.status", source: row.source, environment: row.environment,
    scope: COMMERCE_COMMAND_SCOPES["request.status"], requestId: await sha256Hex(`application-status:${row.requestId}:${attempt}:${now}`), issuedAt: now, expiresAt: now + STATUS_TTL_MS,
    subject: { kind: "candidate", ref: row.subjectRef, authVerifiedAt: row.authorizedAt },
    payload: { targetCommand: "application.submit", targetRequestId: row.requestId, targetRequestSha256: row.requestSha256 },
  })
  if (rawBody === null) return null
  return {
    kind: "status", generation: row.generation, attempt, rawBody, requestSha256: await sha256Hex(rawBody), target, targetExpiresAt: row.requestExpiresAt,
    ...(row.rawBody === undefined ? {} : { originalBody: row.rawBody }), originalSha256: row.requestSha256,
    ...(row.applicationRef === undefined ? {} : { applicationRef: row.applicationRef }),
  }
}

export const claim = internalMutation({
  args: { applicationId: v.id("commerceApplications") }, returns: v.union(v.null(), jobValidator),
  handler: async (ctx, args): Promise<Job | null> => {
    const row = await ctx.db.get(args.applicationId)
    const now = Date.now()
    if (!row || (row.leaseUntil ?? 0) > now || row.nextAttemptAt > now) return null
    if (row.state === "withdrawn" || row.state === "rejected" || row.state === "failed") return null
    if (row.attempts >= MAX_ATTEMPTS) { await exhaust(ctx, row, now); return null }
    const config = await readCommerceLinkConfig()
    // Une rotation de clé peut encore acheminer un retrait de la même source et du même environnement.
    if (!config || config.source !== row.source || config.environment !== row.environment) {
      await ctx.db.patch(row._id, { attempts: row.attempts + 1, nextAttemptAt: now + backoff(row.attempts), updatedAt: now })
      return null
    }
    const attempt = row.attempts + 1
    let job: Job | null = null
    if (row.state === "withdrawal_pending") {
      job = await controlJob(ctx, row, now, attempt)
    } else if (row.state === "queued" || row.state === "submitting") {
      if (row.dispatchedAt === undefined && (!row.rawBody || row.requestExpiresAt <= now || !await deliverable(ctx, row, config))) {
        // Jamais parti : rien n'a quitté ANTSIA, l'envoi s'arrête sans octets persistés.
        const expired = row.rawBody !== undefined && row.requestExpiresAt <= now
        await ctx.db.patch(row._id, { ...(expired ? { state: "failed" as const, lastOutcome: "expired" as const } : { state: "rejected" as const, rejection: "capability_disabled" as const }),
          rawBody: undefined, attempts: 0, leaseUntil: undefined, nextAttemptAt: IDLE_AT, updatedAt: now })
        return null
      }
      if (!await jobAuthorizationLive(ctx, row, row.requestExpiresAt > now)) { await pauseForAuthorization(ctx, row, now); return null }
      const resend = row.requestExpiresAt > now && row.unknownRequestSha256 === row.requestSha256 && (row.unknownConfirmedAt ?? 0) >= now - 10_000
      if (row.requestExpiresAt <= now || (row.dispatchedAt !== undefined && !resend)) job = await statusJob(row, now, attempt, "resolve")
      else if (row.rawBody) job = { kind: "submit", generation: row.generation, attempt, rawBody: row.rawBody, requestSha256: row.requestSha256 }
    } else if (row.state === "submitted") {
      const revoke = row.files.find((file) => file.transfer === "revoke_pending")
      const pending = row.files.find((file) => file.transfer === "pending")
      if (revoke) job = await controlJob(ctx, row, now, attempt, revoke.attachmentRef)
      else if (pending) {
        if (!await jobAuthorizationLive(ctx, row, true)) { await pauseForAuthorization(ctx, row, now); return null }
        const file = await ctx.db.get(pending.fileId)
        if (!file || file.personId !== row.personId || file.state !== "ready" || file.sha256 !== pending.sha256 || await jobFileScanOf(ctx, file.storageId) !== "clean") {
          // Pièce retirée, remplacée ou retenue depuis : elle ne part jamais.
          await ctx.db.patch(row._id, { files: row.files.map((item) => item.fileId === pending.fileId ? { ...item, transfer: "failed" as const } : item), nextAttemptAt: now, updatedAt: now })
          await ctx.scheduler.runAfter(0, deliverJobApplicationRef, { applicationId: row._id })
          return null
        }
        job = { kind: "upload", generation: row.generation, attempt, storageId: file.storageId, sha256: pending.sha256, byteSize: pending.byteSize, attachmentRef: pending.attachmentRef, submitRequestId: row.requestId }
      } else if (row.statusRequestedAt !== undefined) {
        if (!await jobAuthorizationLive(ctx, row, false)) { await pauseForAuthorization(ctx, row, now); return null }
        job = await statusJob(row, now, attempt, "track")
      }
    }
    if (!job) {
      // Rien à faire pour une candidature reçue ; sinon une étape impossible s'arrête (jamais d'attente sans fin).
      if (row.state === "submitted") await ctx.db.patch(row._id, { attempts: 0, leaseUntil: undefined, nextAttemptAt: IDLE_AT, updatedAt: now })
      else await exhaust(ctx, row, now)
      return null
    }
    await ctx.db.patch(row._id, {
      attempts: attempt, leaseUntil: now + LEASE_MS, leaseSessionId: privateControl(job) ? undefined : row.authorizationSessionId, updatedAt: now,
      ...(row.state === "queued" ? { state: "submitting" as const } : {}),
      ...(job.kind === "status" ? { unknownConfirmedAt: undefined, unknownRequestSha256: undefined } : {}),
    })
    return privateControl(job) ? job : { ...job, sessionId: row.authorizationSessionId }
  },
})

/** Porte après lecture des octets et JUSTE avant HTTP ; les contrôles de retrait ne demandent aucune session vivante. */
export const authorize = internalMutation({
  args: { applicationId: v.id("commerceApplications"), job: jobValidator, configFingerprint: v.string() }, returns: v.boolean(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.applicationId), now = Date.now(), config = await readCommerceLinkConfig()
    if (!row || row.generation !== args.job.generation || row.attempts !== args.job.attempt || (row.leaseUntil ?? 0) <= now ||
      !config || config.fingerprint !== args.configFingerprint || config.source !== row.source || config.environment !== row.environment) return false
    if (!await stageAllowed(ctx, row, args.job)) {
      if (!privateControl(args.job)) await pauseForAuthorization(ctx, row, now)
      return false
    }
    if (args.job.kind === "submit") await ctx.db.patch(row._id, { dispatchedAt: row.dispatchedAt ?? now,
      unknownConfirmedAt: undefined, unknownRequestSha256: undefined })
    return true
  },
})

export const finish = internalMutation({
  args: { applicationId: v.id("commerceApplications"), generation: v.number(), attempt: v.number(), job: v.optional(jobValidator), delivery: deliveryValidator }, returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.applicationId)
    // Une réponse tardive (retrait, relance, nouvelle génération) ne s'applique jamais.
    if (!row || row.generation !== args.generation || row.attempts !== args.attempt || (row.leaseUntil ?? 0) <= Date.now() || !args.job ||
      args.job.generation !== args.generation || args.job.attempt !== args.attempt) return null
    const now = Date.now(), result = args.delivery
    if (!await stageAllowed(ctx, row, args.job, true)) {
      if (!privateControl(args.job)) await pauseForAuthorization(ctx, row, now)
      return null
    }
    const settled = { attempts: 0, leaseUntil: undefined, leaseSessionId: undefined, updatedAt: now }
    const more = (files: Application["files"]) => files.some((file) => file.transfer === "pending" || file.transfer === "revoke_pending")
    const schedule = async (files: Application["files"], statusPending: boolean) => {
      const busy = more(files) || statusPending
      if (busy) await ctx.scheduler.runAfter(0, deliverJobApplicationRef, { applicationId: row._id })
      return busy ? now : IDLE_AT
    }
    if (row.state === "submitting" && result.outcome === "submitted") {
      await ctx.db.patch(row._id, { ...settled, state: "submitted", applicationRef: result.applicationRef, submittedAt: result.submittedAt, remoteState: "received",
        remoteUpdatedAt: result.submittedAt, rawBody: undefined, nextAttemptAt: await schedule(row.files, false) })
    } else if (row.state === "submitting" && result.outcome === "rejected") {
      await ctx.db.patch(row._id, { ...settled, state: "rejected", rejection: result.reason, rawBody: undefined, nextAttemptAt: IDLE_AT })
    } else if (row.state === "submitting" && result.outcome === "expired") {
      await ctx.db.patch(row._id, { ...settled, state: "failed", lastOutcome: "expired", rawBody: undefined, nextAttemptAt: IDLE_AT,
        unknownConfirmedAt: now, unknownRequestSha256: row.requestSha256 })
    } else if (row.state === "submitting" && result.outcome === "unknown") {
      // Absence attestée maintenant : les mêmes octets seuls peuvent repartir avant la fin de dérive.
      const delay = row.requestExpiresAt > now ? 0 : backoff(row.attempts)
      await ctx.db.patch(row._id, { leaseUntil: undefined, leaseSessionId: undefined, nextAttemptAt: now + delay,
        unknownConfirmedAt: now, unknownRequestSha256: row.requestSha256, updatedAt: now })
      await ctx.scheduler.runAfter(delay, deliverJobApplicationRef, { applicationId: row._id })
    } else if (row.state === "submitted" && result.outcome === "tracked") {
      const current = result.current
      const newer = current !== null && current.revision >= (row.remoteRevision ?? 0)
      await ctx.db.patch(row._id, { ...settled, statusCheckedAt: now, statusRequestedAt: undefined,
        ...(newer ? { remoteState: current.state, remoteRevision: current.revision, remoteUpdatedAt: current.updatedAt } : {}),
        nextAttemptAt: await schedule(row.files, false) })
      // P14B : état AUTORISÉ servi par PRO.GA et plus récent — avis neutre au candidat s'il change ce qu'il voit.
      if (newer && current !== null) await noticeJobApplicationUpdated(ctx, row, current)
    } else if (row.state === "submitted" && (result.outcome === "stored" || result.outcome === "file_rejected")) {
      // Une pièce retirée pendant son envoi reste à révoquer : `stored` n'écrase jamais `revoke_pending`.
      const files = row.files.map((file) => file.attachmentRef !== result.attachmentRef || file.transfer !== "pending" ? file : { ...file, transfer: result.outcome === "stored" ? "stored" as const : "failed" as const })
      await ctx.db.patch(row._id, { ...settled, files, nextAttemptAt: await schedule(files, row.statusRequestedAt !== undefined) })
    } else if (row.state === "submitted" && (result.outcome === "applied" || result.outcome === "control_rejected") && row.controlAttachmentRef !== undefined) {
      const files = row.files.map((file) => file.attachmentRef === row.controlAttachmentRef && file.transfer === "revoke_pending" ? { ...file, transfer: "revoked" as const } : file)
      await ctx.db.patch(row._id, { ...settled, files, controlBody: undefined, controlExpiresAt: undefined, controlAttachmentRef: undefined,
        ...(result.outcome === "control_rejected" ? { remoteUnconfirmed: true } : {}), nextAttemptAt: await schedule(files, row.statusRequestedAt !== undefined) })
    } else if (row.state === "withdrawal_pending" && (result.outcome === "applied" || result.outcome === "control_rejected")) {
      // Refus du contrôle = rien à retirer chez PRO.GA (jamais reçue, ou déjà close) : le retrait local est acquis.
      await ctx.db.patch(row._id, { ...settled, state: "withdrawn", rawBody: undefined, controlBody: undefined, controlExpiresAt: undefined, controlAttachmentRef: undefined,
        files: row.files.map((file) => ({ ...file, transfer: "revoked" as const })), ...(result.outcome === "control_rejected" ? { remoteUnconfirmed: true } : {}), nextAttemptAt: IDLE_AT })
    } else {
      const delay = backoff(row.attempts)
      if (row.attempts >= MAX_ATTEMPTS) await exhaust(ctx, row, now)
      else {
        await ctx.db.patch(row._id, { leaseUntil: undefined, leaseSessionId: undefined, nextAttemptAt: now + delay, updatedAt: now })
        await ctx.scheduler.runAfter(delay, deliverJobApplicationRef, { applicationId: row._id })
      }
    }
    return null
  },
})

function parsedRequest(rawBody: string, config: CommerceLinkConfig, historical = false) {
  let nowMs = Date.now()
  if (historical) {
    let value: unknown
    try { value = JSON.parse(rawBody) as unknown } catch { return null }
    if (typeof value !== "object" || value === null || !("issuedAt" in value) || typeof value.issuedAt !== "number" || !Number.isSafeInteger(value.issuedAt)) return null
    nowMs = value.issuedAt
  }
  const parsed = parseCommerceCommandRequest(rawBody, { source: config.source, environment: config.environment, nowMs })
  return parsed.ok ? parsed.value : null
}

/** Réponse COMMAND d'un envoi (ou réponse enregistrée rejouée par un statut) → issue fermée. */
function commandDelivery(reply: JobHttpReply, rawBody: string, requestSha256: string, config: CommerceLinkConfig, historical = false): Delivery {
  const request = parsedRequest(rawBody, config, historical)
  if (!request) return { outcome: "unavailable" }
  const parsed = parseCommerceCommandResponse(reply.rawResponse, { request, requestSha256 }, Date.now())
  if (!parsed.ok) return { outcome: "unavailable" }
  const response = parsed.value
  if (!historical && ((response.outcome === "accepted" && reply.status !== 200) || (response.outcome === "rejected" && reply.status !== 422))) return { outcome: "unavailable" }
  if (response.outcome === "accepted" && response.result && "applicationRef" in response.result && "submittedAt" in response.result) {
    return { outcome: "submitted", applicationRef: response.result.applicationRef, submittedAt: response.result.submittedAt }
  }
  if (response.outcome === "rejected" && isRejection(response.reason)) return { outcome: "rejected", reason: response.reason }
  return { outcome: "unavailable" }
}

async function statusDelivery(job: Extract<Job, { kind: "status" }>, reply: JobHttpReply, config: CommerceLinkConfig): Promise<Delivery> {
  if (reply.status !== 200) return { outcome: "unavailable" }
  const request = parsedRequest(job.rawBody, config)
  if (!request) return { outcome: "unavailable" }
  const parsed = parseCommerceCommandResponse(reply.rawResponse, { request, requestSha256: job.requestSha256 }, Date.now())
  if (!parsed.ok || parsed.value.outcome !== "accepted" || !parsed.value.result || !("targetRequestId" in parsed.value.result) || !("current" in parsed.value.result)) return { outcome: "unavailable" }
  const status = parsed.value.result
  if (job.target === "track") {
    const own = status.current.find((item) => item.objectKind === "job_application" && (job.applicationRef === undefined || item.objectRef === job.applicationRef))
    const state = own ? commerceJobsApplicationState(own.state) : null
    return own && state !== null ? { outcome: "tracked", current: { state, revision: own.revision, updatedAt: own.updatedAt } } : { outcome: "tracked", current: null }
  }
  if (status.state === "unknown") return { outcome: decideCommerceRetryAfterTimeout("unknown", job.targetExpiresAt, Date.now()) === "safe_to_restart" ? "expired" : "unknown" }
  if (status.state !== "completed" || !status.recordedResponse || !status.recordedResponseSha256 || !job.originalBody) return { outcome: "unavailable" }
  if (await sha256Hex(status.recordedResponse) !== status.recordedResponseSha256) return { outcome: "unavailable" }
  return commandDelivery({ status: 200, rawResponse: status.recordedResponse }, job.originalBody, job.originalSha256, config, true)
}

/** Octets EXACTS de la pièce admise : empreinte, taille et signature PDF revérifiées avant tout envoi. */
async function uploadDelivery(ctx: ActionCtx, applicationId: Id<"commerceApplications">, job: Extract<Job, { kind: "upload" }>, config: CommerceLinkConfig): Promise<Delivery> {
  const rejected: Delivery = { outcome: "file_rejected", attachmentRef: job.attachmentRef }
  const blob = await ctx.storage.get(job.storageId)
  if (!blob || blob.size !== job.byteSize || blob.size > COMMERCE_JOBS_LIMITS.attachmentBytesMax) return rejected
  const bytes = new Uint8Array(await blob.arrayBuffer())
  if (!commerceJobsIsPdf(bytes) || await sha256OfBytes(bytes) !== job.sha256) return rejected
  if (!await ctx.runMutation(authorizeRef, { applicationId, job, configFingerprint: config.fingerprint })) return { outcome: "unavailable" }
  const reply = await sendJobFile(config, bytes, job.sha256, job.submitRequestId, job.attachmentRef)
  if (!reply) return { outcome: "unavailable" }
  const parsed = parseCommerceJobsFileResponse(reply.rawResponse, { submitRequestId: job.submitRequestId, attachmentRef: job.attachmentRef, sha256: job.sha256 })
  if (!parsed.ok) return { outcome: "unavailable" }
  return parsed.value.outcome === "rejected" ? rejected : { outcome: "stored", attachmentRef: job.attachmentRef }
}

export const deliver = internalAction({
  args: { applicationId: v.id("commerceApplications") }, returns: v.null(),
  handler: async (ctx, args) => {
    const job = await ctx.runMutation(claimRef, args)
    if (!job) return null
    let delivery: Delivery = { outcome: "unavailable" }
    try {
      const config = await readCommerceLinkConfig()
      if (config) {
        if (job.kind !== "upload" && !await ctx.runMutation(authorizeRef, { applicationId: args.applicationId, job, configFingerprint: config.fingerprint })) return null
        if (job.kind === "submit") {
          const reply = await sendJobCommand(config, job.rawBody, "application.submit")
          if (reply) delivery = commandDelivery(reply, job.rawBody, job.requestSha256, config)
        } else if (job.kind === "status") {
          const reply = await sendJobCommand(config, job.rawBody, "request.status")
          if (reply) delivery = await statusDelivery(job, reply, config)
        } else if (job.kind === "upload") {
          delivery = await uploadDelivery(ctx, args.applicationId, job, config)
        } else {
          const reply = await sendJobControl(config, job.rawBody)
          const parsed = reply ? parseCommerceJobsControlResponse(reply.rawResponse, { requestId: job.requestId, requestSha256: job.requestSha256 }) : null
          if (parsed?.ok) delivery = { outcome: parsed.value.outcome === "applied" ? "applied" : "control_rejected" }
        }
      }
    } catch { /* Aucun corps, nom ni secret dans le journal ; l'issue reste indéterminée. */ }
    await ctx.runMutation(finishRef, { applicationId: args.applicationId, generation: job.generation, attempt: job.attempt, job, delivery })
    return null
  },
})

/** Le cron rattrape une chute du planificateur, par lots globaux de vingt références. */
export const drain = internalMutation({
  args: {}, returns: v.null(),
  handler: async (ctx) => {
    const now = Date.now()
    for (const state of ["queued", "submitting", "submitted", "withdrawal_pending"] as const) {
      const rows = await ctx.db.query("commerceApplications").withIndex("by_state_nextAttemptAt", (q) => q.eq("state", state).lte("nextAttemptAt", now)).take(DRAIN_BATCH)
      for (const row of rows) {
        if ((row.leaseUntil ?? 0) > now) continue
        if (row.attempts >= MAX_ATTEMPTS) await exhaust(ctx, row, now)
        else await ctx.scheduler.runAfter(0, deliverJobApplicationRef, { applicationId: row._id })
      }
    }
    return null
  },
})
