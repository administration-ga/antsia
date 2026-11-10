/** P10 : choix explicite du demandeur ; octets privés durables, jamais le fil entier. */
import { COMMERCE_COMMAND_SCOPES, COMMERCE_COMMAND_LIMITS } from "@antsia/social-domain/commerce/command"
import { COMMERCE_COMMAND_CONTRACT, commerceCanonicalJson } from "@antsia/social-domain/commerce/primitives"
import { commercialText } from "@antsia/social-domain/commercialContact"
import { COMMERCE_INQUIRY_CONSENT_VERSION } from "@antsia/social-domain/commerce-inquiry"
import { makeFunctionReference, paginationOptsValidator, paginationResultValidator } from "convex/server"
import { v } from "convex/values"
import type { Doc, Id } from "../../_generated/dataModel"
import type { MutationCtx, QueryCtx } from "../../_generated/server"
import { networkMutation, networkQuery, personMutation, personQuery } from "../../lib/functions"
import { notFound, fail } from "../../lib/errors"
import { enforceRateLimit } from "../../lib/rateLimit"
import { readCommerceLinkConfig } from "../shops/commerceLinkConfig"
import { sha256Hex } from "../shops/commerceLinkCrypto"
import { liveShopCommerceLink } from "../shops/commerceLinkLifecycle"
import { ensureCommerceBuyerSubject } from "../shops/commerceBuyerSubjects"
import { canReadCommercialThread } from "./access"
import { crmTransferState } from "./crmTables"
import { captureCrmAuthorization } from "./crmAuthority"

export const deliverCrm = makeFunctionReference<"action", { networkId: Id<"networks">; transferId: Id<"commercialCrmTransfers"> }, null>("modules/commercialMessaging/crmTransport:deliver")
const stateResult = v.object({ state: crmTransferState })
const transferView = v.object({ state: v.union(v.literal("none"), crmTransferState), textVersion: v.string(), selectedText: v.optional(v.string()), displayName: v.optional(v.string()), consentedAt: v.optional(v.number()), revokedAt: v.optional(v.number()), authorizationRequired: v.optional(v.boolean()), withdrawalNeedsAttention: v.optional(v.boolean()) })

/** @selfScoped Les retraits restent accessibles depuis Mes données après perte du réseau. */
export const paginateMyTransfers = personQuery({
  args: { paginationOpts: paginationOptsValidator, expectedPersonId: v.id("persons") },
  returns: paginationResultValidator(v.object({ transferId: v.id("commercialCrmTransfers"), networkId: v.id("networks"), threadId: v.id("commercialThreads"), state: crmTransferState, textVersion: v.string(), consentedAt: v.number(), revokedAt: v.optional(v.number()), withdrawalNeedsAttention: v.optional(v.boolean()) })),
  handler: async (ctx, args) => {
    if (ctx.person._id !== args.expectedPersonId) return notFound()
    const window = await ctx.db.query("commercialCrmTransfers").withIndex("by_person", (q) => q.eq("personId", ctx.person._id)).order("desc").paginate({ ...args.paginationOpts, numItems: Math.min(20, Math.max(1, args.paginationOpts.numItems)), maximumRowsRead: 20, maximumBytesRead: 256 * 1024 })
    return { ...window, page: window.page.map((row) => ({ transferId: row._id, networkId: row.networkId, threadId: row.threadId, state: row.state, textVersion: row.textVersion, consentedAt: row.consentedAt, ...(row.revokedAt === undefined ? {} : { revokedAt: row.revokedAt }), ...(row.withdrawalNeedsAttention ? { withdrawalNeedsAttention: true } : {}) })) }
  },
})

async function myThread(ctx: Pick<QueryCtx, "db">, networkId: Id<"networks">, personId: Id<"persons">, threadId: Id<"commercialThreads">) {
  const thread = await ctx.db.get(threadId)
  if (!thread || thread.networkId !== networkId || thread.requesterPersonId !== personId) return notFound()
  return thread
}

export const getMyTransfer = networkQuery({
  args: { threadId: v.id("commercialThreads") }, returns: transferView,
  handler: async (ctx, args) => {
    await myThread(ctx, ctx.networkId, ctx.person._id, args.threadId)
    const row = await ctx.db.query("commercialCrmTransfers").withIndex("by_thread", (q) => q.eq("threadId", args.threadId)).unique()
    if (!row) return { state: "none" as const, textVersion: COMMERCE_INQUIRY_CONSENT_VERSION }
    return { state: row.state, textVersion: row.textVersion, ...(row.selectedText === undefined ? {} : { selectedText: row.selectedText }), ...(row.displayName === undefined ? {} : { displayName: row.displayName }), consentedAt: row.consentedAt, ...(row.revokedAt === undefined ? {} : { revokedAt: row.revokedAt }), ...(row.authorizationRequired ? { authorizationRequired: true } : {}), ...(row.withdrawalNeedsAttention ? { withdrawalNeedsAttention: true } : {}) }
  },
})

export const submitToCrm = networkMutation({
  writeBucket: "commercial.crm.submit",
  args: { threadId: v.id("commercialThreads"), selectedText: v.string(), displayName: v.optional(v.string()), consent: v.literal(true), textVersion: v.string(), idempotencyKey: v.string() },
  returns: v.object({ state: crmTransferState, transferId: v.id("commercialCrmTransfers") }),
  handler: async (ctx, args) => {
    const thread = await myThread(ctx, ctx.networkId, ctx.person._id, args.threadId)
    if (thread.state !== "accepted" || !await canReadCommercialThread(ctx, ctx.networkId, ctx.person._id, thread._id)) return notFound()
    const selectedText = commercialText(args.selectedText), displayName = args.displayName?.trim() || undefined
    if (args.textVersion !== COMMERCE_INQUIRY_CONSENT_VERSION || selectedText === null || (displayName && (displayName.length > 80 || /[\r\n\u0000-\u001f]/u.test(displayName))) || !/^[A-Za-z0-9_-]{16,128}$/u.test(args.idempotencyKey)) return fail("invalidArgument")
    const intentionSha256 = await sha256Hex(commerceCanonicalJson({ selectedText, ...(displayName ? { displayName } : {}), textVersion: args.textVersion })!)
    const previous = await ctx.db.query("commercialCrmTransfers").withIndex("by_thread", (q) => q.eq("threadId", thread._id)).unique()
    // Une conversation = une demande ; un délai n'autorise jamais une seconde clé métier.
    if (previous) {
      if (previous.personId !== ctx.person._id || previous.intentionSha256 !== intentionSha256 || previous.idempotencyKey !== args.idempotencyKey || previous.revokedAt !== undefined) return fail("policyRefused")
      return { state: previous.state, transferId: previous._id }
    }
    const shop = await ctx.db.get(thread.shopId)
    const config = await readCommerceLinkConfig()
    const authorization = await captureCrmAuthorization(ctx, ctx.person._id)
    const link = shop ? await liveShopCommerceLink(ctx, shop.networkId, shop._id) : null
    if (!config || !link || !link.permissions.includes("receive_inquiries") || !authorization) return notFound()
    const subjectRef = await ensureCommerceBuyerSubject(ctx, { networkId: ctx.networkId, personId: ctx.person._id, shopId: thread.shopId, source: config.source, environment: config.environment })
    const now = Date.now()
    const requestId = await sha256Hex(`inquiry-v1:${thread.conversationRef}:${args.idempotencyKey}`)
    const expiresAt = now + COMMERCE_COMMAND_LIMITS.requestTtlMaxMs
    const rawBody = commerceCanonicalJson({
      contract: COMMERCE_COMMAND_CONTRACT, version: 1, command: "inquiry.submit", source: config.source, environment: config.environment,
      scope: COMMERCE_COMMAND_SCOPES["inquiry.submit"], requestId, issuedAt: now, expiresAt,
      subject: { kind: "buyer", ref: subjectRef, authVerifiedAt: authorization.authorizedAt },
      payload: { shopRef: link.shopRef, conversationRef: thread.conversationRef, kind: "question", message: selectedText,
        ...(displayName ? { displayName } : {}), ...(thread.offerRef ? { offerRef: thread.offerRef } : {}),
        consent: { purpose: "commerce_inquiry", textVersion: COMMERCE_INQUIRY_CONSENT_VERSION, givenAt: now } },
    })!
    const transferId = await ctx.db.insert("commercialCrmTransfers", {
      networkId: ctx.networkId, personId: ctx.person._id, threadId: thread._id, shopId: thread.shopId,
      source: config.source, environment: config.environment, configFingerprint: config.fingerprint, ...authorization,
      originLinkRef: link.linkRef, originShopRef: link.shopRef, subjectRef, conversationRef: thread.conversationRef,
      requestId, requestSha256: await sha256Hex(rawBody), requestExpiresAt: expiresAt, rawBody, selectedText, ...(displayName ? { displayName } : {}),
      idempotencyKey: args.idempotencyKey, intentionSha256, textVersion: COMMERCE_INQUIRY_CONSENT_VERSION, consentedAt: now,
      state: "queued", attempts: 0, nextAttemptAt: now, generation: 1, createdAt: now, updatedAt: now,
    })
    await ctx.scheduler.runAfter(0, deliverCrm, { networkId: ctx.networkId, transferId })
    return { state: "queued" as const, transferId }
  },
})

/** Révocation immédiate locale ; le reçu distant est un état distinct et durable. */
export async function withdrawTransfer(ctx: MutationCtx, row: Doc<"commercialCrmTransfers">): Promise<void> {
  const privateFields = { selectedText: undefined, displayName: undefined, rawBody: undefined, sessionId: undefined, authorizationAuthUserId: undefined,
    authorizedAt: undefined, authorizationUntil: undefined, authorizationRequired: undefined, leaseSessionId: undefined,
    originLinkRef: undefined, originShopRef: undefined, unknownConfirmedAt: undefined, unknownRequestSha256: undefined }
  if (row.revokedAt !== undefined || row.state === "withdrawn") {
    // Anciennes séries épuisées : jamais un faux ACK, mais une voie privée de nouveau due.
    const stalled = row.state !== "withdrawn" && (row.state !== "withdrawal_pending" || row.nextAttemptAt === Number.MAX_SAFE_INTEGER || row.attempts >= 8)
    await ctx.db.patch(row._id, { ...privateFields, ...(stalled ? { state: "withdrawal_pending" as const, attempts: 0, generation: row.generation + 1,
      leaseUntil: undefined, nextAttemptAt: Date.now(), withdrawalNeedsAttention: true } : {}), updatedAt: Date.now() })
    if (stalled) await ctx.scheduler.runAfter(0, deliverCrm, { networkId: row.networkId, transferId: row._id })
    return
  }
  const now = Date.now(), state = row.dispatchedAt === undefined ? "withdrawn" as const : "withdrawal_pending" as const
  await ctx.db.patch(row._id, { state, revokedAt: now, ...privateFields, generation: row.generation + 1, leaseUntil: undefined, attempts: 0, nextAttemptAt: now, updatedAt: now })
  if (state === "withdrawal_pending") await ctx.scheduler.runAfter(0, deliverCrm, { networkId: row.networkId, transferId: row._id })
}

/** @selfScoped Retirer son accord reste possible sans adhésion active ni mandat vendeur. */
export const withdrawCrmConsent = personMutation({
  args: { networkId: v.id("networks"), threadId: v.id("commercialThreads") }, returns: stateResult,
  handler: async (ctx, args) => {
    const row = await ctx.db.query("commercialCrmTransfers").withIndex("by_thread", (q) => q.eq("threadId", args.threadId)).unique()
    if (!row || row.networkId !== args.networkId || row.personId !== ctx.person._id) return notFound()
    await withdrawTransfer(ctx, row)
    return { state: (await ctx.db.get(row._id))?.state ?? row.state }
  },
})

/** @selfScoped Relance des mêmes octets ou du retrait ; jamais une nouvelle demande. */
export const retryTransfer = personMutation({
  args: { networkId: v.id("networks"), threadId: v.id("commercialThreads") }, returns: stateResult,
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, "commercial.crm.retry", ctx.person._id)
    const row = await ctx.db.query("commercialCrmTransfers").withIndex("by_thread", (q) => q.eq("threadId", args.threadId)).unique()
    if (!row || row.networkId !== args.networkId || row.personId !== ctx.person._id) return notFound()
    if (row.state === "submitted" || row.state === "withdrawn" || (row.revokedAt === undefined && row.lastOutcome === "rejected")) return { state: row.state }
    const authorization = row.revokedAt === undefined ? await captureCrmAuthorization(ctx, ctx.person._id) : null
    const config = await readCommerceLinkConfig()
    if (row.revokedAt === undefined && (!authorization || !config || config.source !== row.source || config.environment !== row.environment || config.fingerprint !== row.configFingerprint)) return notFound()
    const state = row.revokedAt === undefined ? "queued" as const : "withdrawal_pending" as const
    await ctx.db.patch(row._id, { ...(authorization ?? {}), authorizationRequired: undefined, state, attempts: 0, generation: row.generation + 1,
      leaseUntil: undefined, leaseSessionId: undefined, unknownConfirmedAt: undefined, unknownRequestSha256: undefined, nextAttemptAt: Date.now(), updatedAt: Date.now() })
    await ctx.scheduler.runAfter(0, deliverCrm, { networkId: row.networkId, transferId: row._id })
    return { state }
  },
})

/** Appelé avant l'effacement générique ; garde le reçu de retrait jusqu'à sa confirmation. */
export async function revokeCommercialCrmForPerson(ctx: MutationCtx, personId: Id<"persons">): Promise<boolean> {
  let done = true
  for (const state of ["queued", "submitting", "submitted", "withdrawal_pending", "failed"] as const) {
    const rows = await ctx.db.query("commercialCrmTransfers").withIndex("by_person_state", (q) => q.eq("personId", personId).eq("state", state)).take(21)
    if (rows.length) done = false
    for (const row of rows.slice(0, 20)) await withdrawTransfer(ctx, row)
  }
  return done
}

/** Une purge sociale attend le reçu de minimisation externe, puis retire sa copie privée. */
export async function prepareCommercialRetention(ctx: MutationCtx, threadId: Id<"commercialThreads">): Promise<boolean> {
  const row = await ctx.db.query("commercialCrmTransfers").withIndex("by_thread", (q) => q.eq("threadId", threadId)).unique()
  if (!row) return true
  if (row.state !== "withdrawn") { await withdrawTransfer(ctx, row); return false }
  await ctx.db.delete(row._id)
  return true
}
