/** P10 : transport serveur borné ; scheduler sans texte ni secret, reprise par outbox. */
import { COMMERCE_COMMAND_LIMITS, COMMERCE_COMMAND_SCOPES, decideCommerceRetryAfterTimeout, parseCommerceCommandRequest, parseCommerceCommandResponse } from "@antsia/social-domain/commerce/command"
import { COMMERCE_COMMAND_CONTRACT, commerceCanonicalJson } from "@antsia/social-domain/commerce/primitives"
import { COMMERCE_INQUIRY_WITHDRAW_CONTRACT, COMMERCE_INQUIRY_WITHDRAW_PATH, COMMERCE_INQUIRY_WITHDRAW_TTL_MS, parseCommerceInquiryWithdrawalResponse } from "@antsia/social-domain/commerce-inquiry"
import { makeFunctionReference } from "convex/server"
import { v } from "convex/values"
import type { Doc, Id } from "../../_generated/dataModel"
import { internalAction, internalMutation, type MutationCtx } from "../../_generated/server"
import { readCommerceLinkConfig } from "../shops/commerceLinkConfig"
import { commerceLinkHeaders, readCommerceLinkResponse, sha256Hex } from "../shops/commerceLinkCrypto"
import { deliverCrm } from "./crm"
import { liveCrmAuthorization, liveCrmOrigin } from "./crmAuthority"

const COMMAND_PATH = "/commerce/v1/commands"
export type CrmJob = { generation: number; attempt: number; kind: "submit" | "status" | "withdraw"; rawBody: string; originalBody?: string; requestSha256: string; fingerprint: string; sessionId?: string; targetExpiresAt?: number }
type Job = CrmJob
type Transfer = Doc<"commercialCrmTransfers">
type Delivery = { outcome: "submitted"; inquiryRef: string; submittedAt: number } | { outcome: "withdrawn" | "unavailable" | "rejected" | "expired" | "unknown" }
const jobValidator = v.object({ generation: v.number(), attempt: v.number(), kind: v.union(v.literal("submit"), v.literal("status"), v.literal("withdraw")), rawBody: v.string(), originalBody: v.optional(v.string()), requestSha256: v.string(), fingerprint: v.string(), sessionId: v.optional(v.string()), targetExpiresAt: v.optional(v.number()) })
const deliveryValidator = v.union(v.object({ outcome: v.literal("submitted"), inquiryRef: v.string(), submittedAt: v.number() }), v.object({ outcome: v.union(v.literal("withdrawn"), v.literal("unavailable"), v.literal("rejected"), v.literal("expired"), v.literal("unknown")) }))
const claimRef = makeFunctionReference<"mutation", { networkId: Id<"networks">; transferId: Id<"commercialCrmTransfers"> }, Job | null>("modules/commercialMessaging/crmTransport:claim")
const finishRef = makeFunctionReference<"mutation", { networkId: Id<"networks">; transferId: Id<"commercialCrmTransfers">; generation: number; attempt: number; job?: Job; delivery: Delivery }, null>("modules/commercialMessaging/crmTransport:finish")
const authorizeRef = makeFunctionReference<"mutation", { networkId: Id<"networks">; transferId: Id<"commercialCrmTransfers">; job: Job; fingerprint: string }, boolean>("modules/commercialMessaging/crmTransport:authorize")
const IDLE_AT = Number.MAX_SAFE_INTEGER
const backoff = (attempt: number) => Math.min(3_600_000, 15_000 * 2 ** Math.min(attempt, 8))

async function pause(ctx: MutationCtx, row: Transfer): Promise<void> {
  await ctx.db.patch(row._id, { state: "failed", authorizationRequired: true, leaseUntil: undefined, leaseSessionId: undefined, nextAttemptAt: IDLE_AT, updatedAt: Date.now() })
}

/** Un retrait épuisé reste dû et non confirmé ; séries bornées, repos progressif, référence d'origine intacte. */
async function deferWithdrawal(ctx: MutationCtx, row: Transfer, now: number): Promise<void> {
  const delay = backoff(Math.max(8, row.attempts))
  await ctx.db.patch(row._id, { state: "withdrawal_pending", attempts: 0, generation: row.generation + 1, leaseUntil: undefined, leaseSessionId: undefined,
    withdrawalNeedsAttention: true, nextAttemptAt: now + delay, updatedAt: now })
  await ctx.scheduler.runAfter(delay, deliverCrm, { networkId: row.networkId, transferId: row._id })
}

async function authorizedStage(ctx: MutationCtx, row: Transfer, job: Job, after = false): Promise<boolean> {
  if (job.kind === "withdraw") return row.revokedAt !== undefined && row.state === "withdrawal_pending" && row.withdrawalBody === job.rawBody && await sha256Hex(job.rawBody) === job.requestSha256
  if (!job.sessionId || row.sessionId !== job.sessionId || row.leaseSessionId !== job.sessionId || !await liveCrmAuthorization(ctx, row)) return false
  if (job.kind === "submit") return row.rawBody === job.rawBody && row.requestSha256 === job.requestSha256 &&
    (after || row.requestExpiresAt > Date.now()) && await sha256Hex(job.rawBody) === row.requestSha256 && await liveCrmOrigin(ctx, row)
  const request = parseCommerceCommandRequest(job.rawBody, { source: row.source, environment: row.environment, nowMs: Date.now() })
  return await sha256Hex(job.rawBody) === job.requestSha256 && request.ok && request.value.command === "request.status" && request.value.subject.ref === row.subjectRef &&
    request.value.payload.targetCommand === "inquiry.submit" && request.value.payload.targetRequestId === row.requestId && request.value.payload.targetRequestSha256 === row.requestSha256 && job.targetExpiresAt === row.requestExpiresAt
}

export const claim = internalMutation({
  args: { networkId: v.id("networks"), transferId: v.id("commercialCrmTransfers") }, returns: v.union(v.null(), jobValidator),
  handler: async (ctx, args): Promise<Job | null> => {
    const row = await ctx.db.get(args.transferId)
    const now = Date.now()
    if (!row || row.networkId !== args.networkId || row.state === "withdrawn" || row.state === "submitted" || row.nextAttemptAt > now || (row.leaseUntil ?? 0) > now) return null
    if (row.attempts >= 8) {
      if (row.revokedAt !== undefined) await deferWithdrawal(ctx, row, now)
      return null
    }
    if (row.revokedAt === undefined && !await liveCrmAuthorization(ctx, row)) { await pause(ctx, row); return null }
    const config = await readCommerceLinkConfig()
    // Une rotation de clé peut acheminer un RETRAIT de la même source/environnement.
    if (!config || config.source !== row.source || config.environment !== row.environment) {
      if (row.revokedAt !== undefined) await deferWithdrawal(ctx, row, now)
      return null
    }
    const attempt = row.attempts + 1
    let kind: Job["kind"], rawBody: string
    if (row.revokedAt !== undefined) {
      kind = "withdraw"
      rawBody = row.withdrawalBody && (row.withdrawalExpiresAt ?? 0) > now ? row.withdrawalBody : commerceCanonicalJson({ contract: COMMERCE_INQUIRY_WITHDRAW_CONTRACT, version: 1,
        source: row.source, environment: row.environment, requestId: await sha256Hex(`withdraw:${row.requestId}:${row.revokedAt}:${now}`),
        issuedAt: now, expiresAt: now + COMMERCE_INQUIRY_WITHDRAW_TTL_MS, subjectRef: row.subjectRef,
        submitRequestId: row.requestId, submitRequestSha256: row.requestSha256, conversationRef: row.conversationRef, revokedAt: row.revokedAt })!
      if (rawBody !== row.withdrawalBody) await ctx.db.patch(row._id, { withdrawalBody: rawBody, withdrawalExpiresAt: now + COMMERCE_INQUIRY_WITHDRAW_TTL_MS })
    } else if (row.requestExpiresAt <= now || !row.originLinkRef || !row.originShopRef || (row.dispatchedAt !== undefined &&
      !(row.unknownRequestSha256 === row.requestSha256 && (row.unknownConfirmedAt ?? 0) >= now - 10_000))) {
      kind = "status"
      rawBody = commerceCanonicalJson({ contract: COMMERCE_COMMAND_CONTRACT, version: 1, command: "request.status", source: row.source, environment: row.environment,
        scope: COMMERCE_COMMAND_SCOPES["request.status"], requestId: await sha256Hex(`inquiry-status:${row.requestId}:${attempt}:${now}`), issuedAt: now, expiresAt: now + 60_000,
        subject: { kind: "buyer", ref: row.subjectRef, authVerifiedAt: row.authorizedAt }, payload: { targetCommand: "inquiry.submit", targetRequestId: row.requestId, targetRequestSha256: row.requestSha256 } })!
    } else {
      if (!row.rawBody) return null
      if (!await liveCrmOrigin(ctx, row)) { await pause(ctx, row); return null }
      kind = "submit"; rawBody = row.rawBody
    }
    await ctx.db.patch(row._id, { state: row.revokedAt === undefined ? "submitting" : "withdrawal_pending", attempts: attempt, leaseUntil: now + 30_000,
      leaseSessionId: kind === "withdraw" ? undefined : row.sessionId, ...(kind === "status" ? { unknownConfirmedAt: undefined, unknownRequestSha256: undefined } : {}), updatedAt: now })
    return { kind, rawBody, ...(kind === "status" && row.rawBody ? { originalBody: row.rawBody } : {}), requestSha256: await sha256Hex(rawBody), fingerprint: config.fingerprint, generation: row.generation, attempt,
      ...(kind === "withdraw" ? {} : { sessionId: row.sessionId }), ...(kind === "status" ? { targetExpiresAt: row.requestExpiresAt } : {}) }
  },
})

/** Dernière porte avant I/O ; une nouvelle liaison ne réadopte jamais un ancien consentement. */
export const authorize = internalMutation({
  args: { networkId: v.id("networks"), transferId: v.id("commercialCrmTransfers"), job: jobValidator, fingerprint: v.string() }, returns: v.boolean(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.transferId), config = await readCommerceLinkConfig(), now = Date.now()
    if (!row || row.networkId !== args.networkId || row.generation !== args.job.generation || row.attempts !== args.job.attempt || (row.leaseUntil ?? 0) <= now ||
      !config || config.fingerprint !== args.fingerprint || config.fingerprint !== args.job.fingerprint || config.source !== row.source || config.environment !== row.environment) return false
    if (!await authorizedStage(ctx, row, args.job)) { if (args.job.kind !== "withdraw") await pause(ctx, row); return false }
    if (args.job.kind === "submit") await ctx.db.patch(row._id, { dispatchedAt: row.dispatchedAt ?? now, unknownConfirmedAt: undefined, unknownRequestSha256: undefined })
    return true
  },
})

export const finish = internalMutation({
  args: { networkId: v.id("networks"), transferId: v.id("commercialCrmTransfers"), generation: v.number(), attempt: v.number(), job: v.optional(jobValidator), delivery: deliveryValidator }, returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.transferId)
    if (!row || row.networkId !== args.networkId || row.generation !== args.generation || row.attempts !== args.attempt || (row.leaseUntil ?? 0) <= Date.now() ||
      !args.job || args.job.generation !== args.generation || args.job.attempt !== args.attempt) return null
    const now = Date.now(), result = args.delivery
    if (!await authorizedStage(ctx, row, args.job, true)) { if (args.job.kind !== "withdraw") await pause(ctx, row); return null }
    const privateFields = { sessionId: undefined, authorizationAuthUserId: undefined, authorizedAt: undefined, authorizationUntil: undefined,
      authorizationRequired: undefined, leaseSessionId: undefined, unknownConfirmedAt: undefined, unknownRequestSha256: undefined }
    if (result.outcome === "submitted" && row.revokedAt === undefined) {
      await ctx.db.patch(row._id, { state: "submitted", inquiryRef: result.inquiryRef, submittedAt: result.submittedAt, rawBody: undefined, ...privateFields, leaseUntil: undefined, updatedAt: now })
    } else if (result.outcome === "withdrawn" && row.revokedAt !== undefined) {
      await ctx.db.patch(row._id, { state: "withdrawn", rawBody: undefined, withdrawalBody: undefined, withdrawalExpiresAt: undefined, selectedText: undefined, displayName: undefined,
        ...privateFields, withdrawalNeedsAttention: undefined, leaseUntil: undefined, nextAttemptAt: IDLE_AT, updatedAt: now })
    } else if (row.revokedAt !== undefined) {
      await ctx.db.patch(row._id, { withdrawalFailures: Math.min(Number.MAX_SAFE_INTEGER, (row.withdrawalFailures ?? 0) + 1),
        ...(result.outcome === "rejected" ? { withdrawalNeedsAttention: true } : {}) })
      if (row.attempts >= 8) await deferWithdrawal(ctx, row, now)
      else {
        const delay = backoff(row.attempts)
        await ctx.db.patch(row._id, { state: "withdrawal_pending", leaseUntil: undefined, leaseSessionId: undefined, nextAttemptAt: now + delay, updatedAt: now })
        await ctx.scheduler.runAfter(delay, deliverCrm, { networkId: row.networkId, transferId: row._id })
      }
    } else if (result.outcome === "unknown") {
      const resend = !!row.originLinkRef && !!row.originShopRef && row.requestExpiresAt > now && row.attempts < 8
      const delay = resend ? 0 : backoff(row.attempts)
      await ctx.db.patch(row._id, { state: row.attempts >= 8 ? "failed" : "queued", leaseUntil: undefined, leaseSessionId: undefined,
        unknownConfirmedAt: now, unknownRequestSha256: row.requestSha256, nextAttemptAt: row.attempts >= 8 ? IDLE_AT : now + delay, updatedAt: now })
      if (row.attempts < 8) await ctx.scheduler.runAfter(delay, deliverCrm, { networkId: row.networkId, transferId: row._id })
    } else {
      const retry = result.outcome === "unavailable" && row.attempts < 8
      const delay = backoff(row.attempts)
      await ctx.db.patch(row._id, { state: retry ? "queued" : "failed", lastOutcome: result.outcome === "expired" ? "expired" : result.outcome === "rejected" ? "rejected" : "unavailable", leaseUntil: undefined, leaseSessionId: undefined, nextAttemptAt: row.attempts >= 8 || result.outcome === "rejected" || result.outcome === "expired" ? IDLE_AT : now + delay, updatedAt: now })
      if (retry) await ctx.scheduler.runAfter(delay, deliverCrm, { networkId: row.networkId, transferId: row._id })
    }
    return null
  },
})

export const deliver = internalAction({
  args: { networkId: v.id("networks"), transferId: v.id("commercialCrmTransfers") }, returns: v.null(),
  handler: async (ctx, args) => {
    const job = await ctx.runMutation(claimRef, args)
    if (!job) return null
    let delivery: Delivery = { outcome: "unavailable" }
    try {
      const config = await readCommerceLinkConfig()
      if (config?.fingerprint === job.fingerprint) {
        const headers = await commerceLinkHeaders(config, job.rawBody, job.kind === "status" ? "request.status" : "inquiry.submit")
        if (!await ctx.runMutation(authorizeRef, { ...args, job, fingerprint: config.fingerprint })) return null
        const response = await fetch(new URL(job.kind === "withdraw" ? COMMERCE_INQUIRY_WITHDRAW_PATH : COMMAND_PATH, config.proHttpOrigin), {
          method: "POST", body: job.rawBody, headers, redirect: "error", signal: AbortSignal.timeout(8000),
        })
        const rawResponse = await readCommerceLinkResponse(response, COMMERCE_COMMAND_LIMITS.responseMaxBytes)
        if (rawResponse) {
          if (job.kind === "withdraw") {
            const body: unknown = JSON.parse(job.rawBody)
            if (body && typeof body === "object" && "requestId" in body && typeof body.requestId === "string") {
              const parsed = parseCommerceInquiryWithdrawalResponse(rawResponse, { requestId: body.requestId, requestSha256: job.requestSha256 })
              if (parsed.ok) delivery = { outcome: parsed.value.outcome === "withdrawn" ? response.ok ? "withdrawn" : "unavailable" : "rejected" }
            }
          } else {
            const request = parseCommerceCommandRequest(job.rawBody, { source: config.source, environment: config.environment, nowMs: Date.now() })
            if (request.ok) {
              const parsed = parseCommerceCommandResponse(rawResponse, { request: request.value, requestSha256: job.requestSha256 }, Date.now())
              if (parsed.ok && parsed.value.outcome === "accepted" && response.ok) {
                const result = parsed.value.result
                if (job.kind === "submit" && result && "inquiryRef" in result) delivery = { outcome: "submitted", inquiryRef: result.inquiryRef, submittedAt: result.submittedAt }
                else if (job.kind === "status" && result && "state" in result && "targetRequestId" in result) {
                  if (result.recordedResponse && result.recordedResponseSha256 && job.originalBody && await sha256Hex(result.recordedResponse) === result.recordedResponseSha256) {
                    const historical: unknown = JSON.parse(job.originalBody)
                    const issuedAt = historical && typeof historical === "object" && "issuedAt" in historical && typeof historical.issuedAt === "number" ? historical.issuedAt : NaN
                    const original = parseCommerceCommandRequest(job.originalBody, { source: config.source, environment: config.environment, nowMs: issuedAt })
                    if (original.ok) {
                      const receipt = parseCommerceCommandResponse(result.recordedResponse, { request: original.value, requestSha256: await sha256Hex(job.originalBody) }, Date.now())
                      if (receipt.ok && receipt.value.outcome === "accepted" && receipt.value.result && "inquiryRef" in receipt.value.result) delivery = { outcome: "submitted", inquiryRef: receipt.value.result.inquiryRef, submittedAt: receipt.value.result.submittedAt }
                      else if (receipt.ok) delivery = { outcome: "rejected" }
                    }
                  } else if (result.state === "unknown" && job.targetExpiresAt !== undefined) delivery = { outcome: decideCommerceRetryAfterTimeout("unknown", job.targetExpiresAt, Date.now()) === "safe_to_restart" ? "expired" : "unknown" }
                }
              } else if (parsed.ok && parsed.value.outcome !== "accepted" && parsed.value.outcome !== "unavailable") delivery = { outcome: "rejected" }
            }
          }
        }
      }
    } catch { /* Aucun corps ni secret dans le journal ; le reçu reste indéterminé. */ }
    await ctx.runMutation(finishRef, { ...args, generation: job.generation, attempt: job.attempt, job, delivery })
    return null
  },
})

/** Le cron rattrape une chute du scheduler, en lots globaux de vingt références. */
export const drain = internalMutation({
  args: {}, returns: v.null(), handler: async (ctx) => {
    const now = Date.now()
    for (const state of ["queued", "submitting", "withdrawal_pending"] as const) {
      const rows = await ctx.db.query("commercialCrmTransfers").withIndex("by_state_nextAttemptAt", (q) => q.eq("state", state).lte("nextAttemptAt", now)).take(20)
      for (const row of rows) {
        if ((row.leaseUntil ?? 0) > now) continue
        if (row.attempts >= 8 && row.revokedAt !== undefined) await deferWithdrawal(ctx, row, now)
        else if (row.attempts >= 8) await ctx.db.patch(row._id, { state: "failed", leaseUntil: undefined, leaseSessionId: undefined, nextAttemptAt: IDLE_AT, updatedAt: now })
        else await ctx.scheduler.runAfter(0, deliverCrm, { networkId: row.networkId, transferId: row._id })
      }
    }
    return null
  },
})
