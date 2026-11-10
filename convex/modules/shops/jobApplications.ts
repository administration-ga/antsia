/**
 * P15 : candidater, suivre et retirer. Choix EXPLICITE du candidat : nom civil
 * normalisé par le normaliseur partagé (NOM en capitales, Prénom capitalisé),
 * pièces choisies parmi les siennes (analyse complète saine), consentement
 * versionné. Les octets COMMAND `application.submit` sont fixés une fois et
 * persistés jusqu'à résolution : même clé + même intention = même résultat ;
 * même clé + autre intention = conflit. Le sujet `candidate` est opaque et
 * propre à la boutique ; aucun rôle de structure n'en découle chez PRO.GA.
 * Le suivi ne rend que les états autorisés de SA candidature, jamais une note.
 */
import { normalizeCivilName } from "@antsia/social-domain/civilName"
import { COMMERCE_JOBS_APPLICATION_CONSENT_VERSION, COMMERCE_JOBS_CANDIDATE_STATES, COMMERCE_JOBS_LIMITS, commerceJobsCandidateState } from "@antsia/social-domain/commerce-jobs"
import { COMMERCE_COMMAND_LIMITS, COMMERCE_COMMAND_SCOPES, decideCommerceRetryAfterTimeout, parseCommerceCommandRequest } from "@antsia/social-domain/commerce/command"
import { COMMERCE_COMMAND_CONTRACT, commerceCanonicalJson } from "@antsia/social-domain/commerce/primitives"
import { paginationOptsValidator } from "convex/server"
import { type Infer, v } from "convex/values"

import type { Doc, Id } from "../../_generated/dataModel"
import type { QueryCtx } from "../../_generated/server"
import { fail, notFound } from "../../lib/errors"
import { networkMutation, networkQuery, personMutation } from "../../lib/functions"
import { enforceRateLimit } from "../../lib/rateLimit"
import { getActiveIdentity } from "../../lib/session"
import { literals } from "../../lib/validators"
import { findPageByHandle } from "../pages/access"
import { shopOfPage } from "./access"
import { ensureCommerceCandidateSubject } from "./commerceBuyerSubjects"
import { type CommerceLinkConfig, readCommerceLinkConfig } from "./commerceLinkConfig"
import { sha256Hex } from "./commerceLinkCrypto"
import { deliverJobApplicationRef, withdrawJobApplication } from "./jobApplicationLifecycle"
import { captureJobAuthorization } from "./jobApplicationAuthority"
import { jobFileScanOf } from "./jobFiles"
import { type JobReadContext, resolveShopJob } from "./jobRead"
import { jobApplicationRejectionValidator, jobApplicationStateValidator, jobAttachmentKindValidator, jobFileTransferValidator } from "./jobTables"

/** Candidatures conservées par personne et par offre (retraits et refus compris). */
export const JOB_APPLICATIONS_PER_JOB_MAX = 5
const MY_APPLICATIONS_PAGE_MAX = 20
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/u
const MOTIVATION_CONTROL = /[\u0000-\u0009\u000b\u000c\u000e-\u001f\u007f]/u
/** États où une candidature occupe encore l'offre : aucune seconde candidature en parallèle. */
const ACTIVE_STATES: ReadonlySet<Doc<"commerceApplications">["state"]> = new Set<Doc<"commerceApplications">["state"]>(["queued", "submitting", "submitted", "withdrawal_pending"])

type Application = Doc<"commerceApplications">
type ApplicationFile = Application["files"][number]
type CivilName = { firstName: string; lastName: string }

export const candidateStateValidator = literals(COMMERCE_JOBS_CANDIDATE_STATES)
export const myApplicationValidator = v.object({
  applicationId: v.id("commerceApplications"), jobRef: v.string(), jobTitle: v.string(),
  shopHandle: v.union(v.string(), v.null()), shopName: v.union(v.string(), v.null()),
  state: jobApplicationStateValidator, candidateState: v.union(candidateStateValidator, v.null()),
  rejection: v.union(jobApplicationRejectionValidator, v.null()), remoteUnconfirmed: v.boolean(),
  submittedAt: v.union(v.number(), v.null()), remoteUpdatedAt: v.union(v.number(), v.null()), createdAt: v.number(),
  files: v.array(v.object({ fileId: v.id("commerceApplicationFiles"), kind: jobAttachmentKindValidator, transfer: jobFileTransferValidator })),
  retryConsentTextVersion: v.union(v.string(), v.null()),
  actions: v.object({ withdraw: v.boolean(), retry: v.boolean(), refresh: v.boolean() }),
})
export type MyApplication = Infer<typeof myApplicationValidator>
export const myApplicationDetailValidator = v.object({
  summary: myApplicationValidator,
  civilName: v.union(v.object({ firstName: v.string(), lastName: v.string() }), v.null()),
  motivation: v.union(v.string(), v.null()), consentTextVersion: v.string(), consentedAt: v.number(),
})
export const myApplicationsPageValidator = v.object({ page: v.array(myApplicationValidator), isDone: v.boolean(), continueCursor: v.string() })
const applyResultValidator = v.object({ applicationId: v.id("commerceApplications"), state: jobApplicationStateValidator })
const stateResultValidator = v.object({ state: jobApplicationStateValidator })
const applicationIntentValidator = v.object({ outcome: v.literal("application"), applicationId: v.id("commerceApplications") })
export const jobApplicationStopIntentValidator = v.union(applicationIntentValidator, v.object({ outcome: v.literal("stopped") }))
export const jobApplicationIntentLookupValidator = v.union(jobApplicationStopIntentValidator, v.object({ outcome: v.literal("absent") }))
export type JobApplicationIntentLookup = Infer<typeof jobApplicationIntentLookupValidator>
export type JobApplicationStopIntentResult = Infer<typeof jobApplicationStopIntentValidator>
const validIntentKey = (key: string) => /^[A-Za-z0-9_-]{16,128}$/u.test(key)

export const findByIdempotencyKey = networkQuery({
  minStatus: "declaree", args: { idempotencyKey: v.string() }, returns: jobApplicationIntentLookupValidator,
  handler: async (ctx, args): Promise<JobApplicationIntentLookup> => {
    if (!validIntentKey(args.idempotencyKey)) return fail("invalidArgument", { field: "idempotencyKey" })
    if (ctx.person.deletionRequestedAt !== undefined || ctx.person.erasedAt !== undefined) return notFound()
    const rows = await ctx.db.query("commerceApplications").withIndex("by_person_network_key", (q) => q.eq("personId", ctx.person._id).eq("networkId", ctx.networkId).eq("idempotencyKey", args.idempotencyKey)).take(2)
    if (rows.length > 1) return fail("conflict")
    if (rows[0]) return { outcome: "application", applicationId: rows[0]._id }
    const fence = await ctx.db.query("commerceApplicationIntentFences").withIndex("by_key", (q) => q.eq("personId", ctx.person._id).eq("networkId", ctx.networkId).eq("idempotencyKey", args.idempotencyKey)).first()
    return fence ? { outcome: "stopped" } : { outcome: "absent" }
  },
})

export const stopClientIntent = networkMutation({
  minStatus: "declaree", writeBucket: "shop.job.intent.stop", args: { idempotencyKey: v.string() }, returns: jobApplicationStopIntentValidator,
  handler: async (ctx, args): Promise<JobApplicationStopIntentResult> => {
    if (!validIntentKey(args.idempotencyKey)) return fail("invalidArgument", { field: "idempotencyKey" })
    if (ctx.person.deletionRequestedAt !== undefined || ctx.person.erasedAt !== undefined) return notFound()
    const rows = await ctx.db.query("commerceApplications").withIndex("by_person_network_key", (q) => q.eq("personId", ctx.person._id).eq("networkId", ctx.networkId).eq("idempotencyKey", args.idempotencyKey)).take(2)
    if (rows.length > 1) return fail("conflict")
    if (rows[0]) return { outcome: "application", applicationId: rows[0]._id }
    const fence = await ctx.db.query("commerceApplicationIntentFences").withIndex("by_key", (q) => q.eq("personId", ctx.person._id).eq("networkId", ctx.networkId).eq("idempotencyKey", args.idempotencyKey)).first()
    if (!fence) await ctx.db.insert("commerceApplicationIntentFences", { networkId: ctx.networkId, personId: ctx.person._id, idempotencyKey: args.idempotencyKey, stoppedAt: Date.now() })
    return { outcome: "stopped" }
  },
})

/** Nom civil saisi : forme normale partagée, puis bornes du contrat COMMAND. */
function civilNameOf(firstName: string, lastName: string): CivilName {
  const name = normalizeCivilName({ firstName, lastName })
  for (const [field, value] of [["firstName", name.firstName], ["lastName", name.lastName]] as const) {
    if (value.length < 1 || value.length > COMMERCE_JOBS_LIMITS.civilNameMax || CONTROL_CHARACTERS.test(value) || !/\p{L}/u.test(value)) return fail("invalidArgument", { field })
  }
  return { firstName: name.firstName, lastName: name.lastName }
}

function motivationOf(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined
  const text = raw.normalize("NFC").replace(/\r\n?/gu, "\n").trim()
  if (text.length === 0) return undefined
  if (text.length > COMMERCE_JOBS_LIMITS.motivationMax || MOTIVATION_CONTROL.test(text)) return fail("invalidArgument", { field: "motivation" })
  return text
}

async function hmacHex(signingKey: string, input: readonly string[]): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(signingKey), { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
  const digest = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(JSON.stringify(input))))
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("")
}

/** Référence transmise d'une pièce : propre au sujet candidat (donc à la boutique), jamais l'identifiant de stockage. */
async function attachmentRefOf(config: CommerceLinkConfig, subjectRef: string, storageId: Id<"_storage">): Promise<string> {
  return `antsia:file:${await hmacHex(config.signingKey, ["antsia-commerce-attachment-v1", config.source, config.environment, subjectRef, storageId])}`
}

function readContext(ctx: { rootNetwork: Doc<"networks">; network: Doc<"networks">; person: Doc<"persons"> }): JobReadContext {
  return { root: ctx.rootNetwork, readerPersonId: ctx.person._id, network: ctx.network }
}

/** L'offre doit être ouverte, lisible par ce membre ici, candidatures ouvertes et lien `receive_applications` vivant. */
async function applicableJob(ctx: Pick<QueryCtx, "db">, context: JobReadContext, shopId: Id<"shops">, jobRef: string) {
  const resolved = await resolveShopJob(ctx, context, shopId, jobRef)
  if (!resolved || !resolved.job.actions.apply || !resolved.live.link.permissions.includes("receive_applications")) return null
  return resolved
}

/** Pièces choisies : les siennes, prêtes, saines (antivirus complet), empreintes distinctes. */
async function chosenFiles(ctx: Pick<QueryCtx, "db">, personId: Id<"persons">, fileIds: readonly Id<"commerceApplicationFiles">[]): Promise<Doc<"commerceApplicationFiles">[]> {
  if (fileIds.length > COMMERCE_JOBS_LIMITS.attachmentsMax || new Set(fileIds).size !== fileIds.length) return fail("invalidArgument", { field: "fileIds" })
  const files: Doc<"commerceApplicationFiles">[] = []
  for (const fileId of fileIds) {
    const file = await ctx.db.get(fileId)
    if (!file || file.personId !== personId || file.state !== "ready") return notFound()
    const scan = await jobFileScanOf(ctx, file.storageId)
    if (scan !== "clean") return fail(scan === "pending" ? "fileScanPending" : "fileQuarantined")
    files.push(file)
  }
  if (new Set(files.map((file) => file.sha256)).size !== files.length) return fail("invalidArgument", { field: "fileIds" })
  return files
}

type BuiltRequest = { rawBody: string; requestId: string; requestSha256: string; requestExpiresAt: number; files: ApplicationFile[] }

/** Corps COMMAND canonique, revalidé par le parseur du récepteur AVANT d'être persisté. */
async function buildRequest(args: {
  config: CommerceLinkConfig; subjectRef: string; shopRef: string; jobRef: string; civilName: CivilName; motivation?: string;
  files: readonly Doc<"commerceApplicationFiles">[]; consentedAt: number; requestKey: string; now: number;
}): Promise<BuiltRequest> {
  const { config, now } = args
  const requestId = await sha256Hex(`application-v1:${args.subjectRef}:${args.jobRef}:${args.requestKey}`)
  const requestExpiresAt = now + COMMERCE_COMMAND_LIMITS.requestTtlMaxMs
  const files: ApplicationFile[] = []
  for (const file of args.files) {
    files.push({ fileId: file._id, attachmentRef: await attachmentRefOf(config, args.subjectRef, file.storageId), kind: file.kind, sha256: file.sha256, byteSize: file.byteSize, transfer: "pending", attempts: 0 })
  }
  const rawBody = commerceCanonicalJson({
    contract: COMMERCE_COMMAND_CONTRACT, version: 1, command: "application.submit", source: config.source, environment: config.environment,
    scope: COMMERCE_COMMAND_SCOPES["application.submit"], requestId, issuedAt: now, expiresAt: requestExpiresAt,
    subject: { kind: "candidate", ref: args.subjectRef, authVerifiedAt: now },
    payload: {
      shopRef: args.shopRef, jobRef: args.jobRef, civilName: { firstName: args.civilName.firstName, lastName: args.civilName.lastName },
      attachments: files.map((file) => ({ attachmentRef: file.attachmentRef, byteSize: file.byteSize, kind: file.kind, mimeType: "application/pdf", sha256: file.sha256 })),
      consent: { purpose: "commerce_application", textVersion: COMMERCE_JOBS_APPLICATION_CONSENT_VERSION, givenAt: args.consentedAt },
      ...(args.motivation === undefined ? {} : { motivation: args.motivation }),
    },
  })
  if (rawBody === null) return fail("invalidArgument")
  const parsed = parseCommerceCommandRequest(rawBody, { source: config.source, environment: config.environment, nowMs: now })
  if (!parsed.ok) return fail("invalidArgument", { field: parsed.reason === "invalid_name" ? "civilName" : parsed.reason === "invalid_text" ? "motivation" : "payload" })
  return { rawBody, requestId, requestSha256: await sha256Hex(rawBody), requestExpiresAt, files }
}

export const apply = networkMutation({
  writeBucket: "shop.job.apply",
  args: {
    handle: v.string(), jobRef: v.string(), firstName: v.string(), lastName: v.string(), motivation: v.optional(v.string()),
    fileIds: v.array(v.id("commerceApplicationFiles")), consent: v.literal(true), consentTextVersion: v.string(), idempotencyKey: v.string(),
  },
  returns: applyResultValidator,
  handler: async (ctx, args) => {
    if (args.consentTextVersion !== COMMERCE_JOBS_APPLICATION_CONSENT_VERSION) return fail("consentRequired")
    if (!validIntentKey(args.idempotencyKey)) return fail("invalidArgument", { field: "idempotencyKey" })
    if (ctx.person.deletionRequestedAt !== undefined || ctx.person.erasedAt !== undefined) return notFound()
    const page = await findPageByHandle(ctx, args.handle)
    const shop = page ? await shopOfPage(ctx, page._id) : null
    if (!shop) return notFound()
    const civilName = civilNameOf(args.firstName, args.lastName)
    const motivation = motivationOf(args.motivation)
    const legacyIntention = { jobRef: args.jobRef, civilName, fileIds: [...args.fileIds], textVersion: args.consentTextVersion, ...(motivation === undefined ? {} : { motivation }) }
    const intention = commerceCanonicalJson({ ...legacyIntention, networkId: ctx.networkId, shopId: shop._id })
    if (intention === null) return fail("invalidArgument")
    const intentionSha256 = await sha256Hex(intention)
    // Rejeu : même clé, même intention → même résultat, même si l'offre a fermé depuis.
    const keyed = await ctx.db.query("commerceApplications").withIndex("by_person_network_key", (q) => q.eq("personId", ctx.person._id).eq("networkId", ctx.networkId).eq("idempotencyKey", args.idempotencyKey)).take(2)
    if (keyed.length > 1) return fail("conflict")
    const replay = keyed[0]
    if (replay) {
      const expected = replay.intentionVersion === 2 ? intentionSha256 : await sha256Hex(commerceCanonicalJson(legacyIntention)!)
      return replay.shopId === shop._id && replay.jobRef === args.jobRef && replay.intentionSha256 === expected
        ? { applicationId: replay._id, state: replay.state } : fail("conflict")
    }
    const fence = await ctx.db.query("commerceApplicationIntentFences").withIndex("by_key", (q) => q.eq("personId", ctx.person._id).eq("networkId", ctx.networkId).eq("idempotencyKey", args.idempotencyKey)).first()
    if (fence) return fail("policyRefused")
    const previous = await ctx.db.query("commerceApplications").withIndex("by_person_network_job", (q) => q.eq("personId", ctx.person._id).eq("networkId", ctx.networkId).eq("jobRef", args.jobRef)).take(JOB_APPLICATIONS_PER_JOB_MAX + 1)
    if (previous.length >= JOB_APPLICATIONS_PER_JOB_MAX || previous.some((row) => ACTIVE_STATES.has(row.state))) return fail("policyRefused")

    const resolved = shop ? await applicableJob(ctx, readContext(ctx), shop._id, args.jobRef) : null
    if (!resolved) return notFound()
    const files = await chosenFiles(ctx, ctx.person._id, args.fileIds)
    const config = await readCommerceLinkConfig()
    const identity = await getActiveIdentity(ctx)
    const authorization = await captureJobAuthorization(ctx, ctx.person._id)
    const { live } = resolved
    if (!config || !identity || !authorization || live.mapping.environment !== config.environment || live.link.source !== config.source || live.link.environment !== config.environment) return notFound()
    const subjectRef = await ensureCommerceCandidateSubject(ctx, { networkId: live.shop.networkId, personId: ctx.person._id, shopId: live.shop._id, source: config.source, environment: config.environment })
    const now = Date.now()
    const built = await buildRequest({ config, subjectRef, shopRef: live.link.shopRef, jobRef: args.jobRef, civilName, ...(motivation === undefined ? {} : { motivation }), files, consentedAt: now, requestKey: `${ctx.networkId}:${shop._id}:${args.idempotencyKey}`, now })
    if (await ctx.db.query("commerceApplications").withIndex("by_request", (q) => q.eq("requestId", built.requestId)).first()) return fail("conflict")
    const applicationId = await ctx.db.insert("commerceApplications", {
      networkId: ctx.networkId, personId: ctx.person._id, shopId: live.shop._id, mappingId: live.mapping._id,
      jobRef: args.jobRef, shopRef: live.link.shopRef, linkRef: live.link.linkRef, jobTitle: resolved.job.title,
      source: config.source, environment: config.environment, configFingerprint: config.fingerprint, subjectRef,
      requestId: built.requestId, requestSha256: built.requestSha256, requestExpiresAt: built.requestExpiresAt, rawBody: built.rawBody,
      idempotencyKey: args.idempotencyKey, intentionSha256, intentionVersion: 2, consentTextVersion: COMMERCE_JOBS_APPLICATION_CONSENT_VERSION, consentedAt: now, ...authorization,
      civilName, ...(motivation === undefined ? {} : { motivation }), files: built.files,
      state: "queued", attempts: 0, nextAttemptAt: now, generation: 1, createdAt: now, updatedAt: now,
    })
    await ctx.scheduler.runAfter(0, deliverJobApplicationRef, { applicationId })
    return { applicationId, state: "queued" as const }
  },
})

/**
 * Relance d'une candidature restée sans réponse : mêmes octets tant qu'ils sont
 * valides ; expirés sans trace chez PRO.GA, un NOUVEL envoi signé de la même
 * intention (session revérifiée maintenant, offre toujours ouverte).
 */
export const retry = networkMutation({
  writeBucket: "shop.job.track",
  args: { applicationId: v.id("commerceApplications"), consentTextVersion: v.optional(v.string()) }, returns: stateResultValidator,
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.applicationId)
    if (!row || row.personId !== ctx.person._id || row.networkId !== ctx.networkId) return notFound()
    const now = Date.now()
    if (row.revokedAt !== undefined || row.state === "withdrawn" || row.state === "withdrawal_pending" || row.state === "rejected" || row.lastOutcome === "rejected") return { state: row.state }
    const authorization = await captureJobAuthorization(ctx, ctx.person._id)
    const config = await readCommerceLinkConfig()
    if (!authorization || !config || config.source !== row.source || config.environment !== row.environment || config.fingerprint !== row.configFingerprint) return notFound()
    if (row.state === "submitted") {
      await ctx.db.patch(row._id, { ...authorization, authorizationRequired: undefined, attempts: 0, generation: row.generation + 1, leaseSessionId: undefined, leaseUntil: undefined, nextAttemptAt: now, updatedAt: now })
      await ctx.scheduler.runAfter(0, deliverJobApplicationRef, { applicationId: row._id })
      return { state: "submitted" as const }
    }
    // Les octets envoyés peuvent avoir été reçus : d'abord résoudre leur sort, jamais une seconde demande.
    if (row.lastOutcome !== "expired" && row.rawBody !== undefined) {
      await ctx.db.patch(row._id, { ...authorization, authorizationRequired: undefined, state: row.dispatchedAt === undefined ? "queued" : "submitting", attempts: 0,
        generation: row.generation + 1, leaseSessionId: undefined, leaseUntil: undefined, nextAttemptAt: now, lastOutcome: undefined, updatedAt: now })
      await ctx.scheduler.runAfter(0, deliverJobApplicationRef, { applicationId: row._id })
      return { state: row.dispatchedAt === undefined ? "queued" as const : "submitting" as const }
    }
    // Nouveau corps uniquement sur absence PRO prouvée, après la fenêtre de dérive, avec un NOUVEL accord explicite.
    if (row.lastOutcome !== "expired" || row.unknownConfirmedAt === undefined || row.unknownRequestSha256 !== row.requestSha256 ||
      decideCommerceRetryAfterTimeout("unknown", row.requestExpiresAt, now) !== "safe_to_restart") return { state: row.state }
    if (args.consentTextVersion !== COMMERCE_JOBS_APPLICATION_CONSENT_VERSION) return fail("consentRequired")
    const resolved = await applicableJob(ctx, readContext(ctx), row.shopId, row.jobRef)
    if (!resolved || !row.civilName || resolved.live.link.shopRef !== row.shopRef || resolved.live.link.linkRef !== row.linkRef) return notFound()
    const files: Doc<"commerceApplicationFiles">[] = []
    for (const file of row.files) {
      const current = await ctx.db.get(file.fileId)
      if (!current || current.personId !== row.personId || current.state !== "ready" || current.sha256 !== file.sha256 || current.byteSize !== file.byteSize ||
        file.transfer === "revoked" || file.transfer === "revoke_pending") return fail("policyRefused")
      files.push(current)
    }
    const chosen = await chosenFiles(ctx, ctx.person._id, files.map((file) => file._id))
    await enforceRateLimit(ctx, "shop.job.apply", ctx.person._id)
    const built = await buildRequest({ config, subjectRef: row.subjectRef, shopRef: row.shopRef, jobRef: row.jobRef, civilName: row.civilName, ...(row.motivation === undefined ? {} : { motivation: row.motivation }), files: chosen, consentedAt: now, requestKey: `${row.networkId}:${row.shopId}:${row.idempotencyKey}:${row.generation + 1}`, now })
    if (await ctx.db.query("commerceApplications").withIndex("by_request", (q) => q.eq("requestId", built.requestId)).first()) return fail("conflict")
    await ctx.db.patch(row._id, {
      requestId: built.requestId, requestSha256: built.requestSha256, requestExpiresAt: built.requestExpiresAt, rawBody: built.rawBody,
      configFingerprint: config.fingerprint, files: built.files, state: "queued", lastOutcome: undefined, dispatchedAt: undefined,
      ...authorization, authorizationRequired: undefined, consentTextVersion: COMMERCE_JOBS_APPLICATION_CONSENT_VERSION, consentedAt: now,
      unknownConfirmedAt: undefined, unknownRequestSha256: undefined,
      attempts: 0, generation: row.generation + 1, nextAttemptAt: now, leaseUntil: undefined, leaseSessionId: undefined, updatedAt: now,
    })
    await ctx.scheduler.runAfter(0, deliverJobApplicationRef, { applicationId: row._id })
    return { state: "queued" as const }
  },
})

/** Demande de rafraîchissement de l'état autorisé (statut privé), jamais d'accès au dossier RH. */
export const refreshStatus = networkMutation({
  writeBucket: "shop.job.track",
  args: { applicationId: v.id("commerceApplications") }, returns: v.null(),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.applicationId)
    if (!row || row.personId !== ctx.person._id || row.networkId !== ctx.networkId) return notFound()
    if (row.state !== "submitted" || row.revokedAt !== undefined) return null
    const now = Date.now()
    const authorization = await captureJobAuthorization(ctx, ctx.person._id)
    if (!authorization) return notFound()
    await ctx.db.patch(row._id, { ...authorization, authorizationRequired: undefined, statusRequestedAt: now, attempts: 0, generation: row.generation + 1,
      leaseUntil: undefined, leaseSessionId: undefined, nextAttemptAt: now, updatedAt: now })
    await ctx.scheduler.runAfter(0, deliverJobApplicationRef, { applicationId: row._id })
    return null
  },
})

/**
 * @selfScoped Le candidat retire SA candidature, même sans adhésion active :
 * copies locales effacées tout de suite, retrait distant par le canal privé.
 */
export const withdraw = personMutation({
  args: { applicationId: v.id("commerceApplications") }, returns: stateResultValidator,
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, "shop.job.withdraw", ctx.person._id)
    const row = await ctx.db.get(args.applicationId)
    if (!row || row.personId !== ctx.person._id) return notFound()
    return { state: await withdrawJobApplication(ctx, row, "candidate_request") }
  },
})

async function summaryOf(ctx: Pick<QueryCtx, "db">, row: Application): Promise<MyApplication> {
  const shop = await ctx.db.get(row.shopId)
  // Une boutique en brouillon n'a pas encore de page : ni identifiant ni nom publics.
  const page = shop?.pageId ? await ctx.db.get(shop.pageId) : null
  const revoked = row.revokedAt !== undefined || row.state === "withdrawn" || row.state === "withdrawal_pending"
  return {
    applicationId: row._id, jobRef: row.jobRef, jobTitle: row.jobTitle,
    shopHandle: page?.handle ?? null, shopName: page?.name ?? null,
    state: row.state, candidateState: row.state === "submitted" ? commerceJobsCandidateState(row.remoteState ?? "received") : revoked ? "withdrawn" : null,
    rejection: row.rejection ?? null, remoteUnconfirmed: row.remoteUnconfirmed === true,
    submittedAt: row.submittedAt ?? null, remoteUpdatedAt: row.remoteUpdatedAt ?? null, createdAt: row.createdAt,
    files: row.files.map((file) => ({ fileId: file.fileId, kind: file.kind, transfer: file.transfer })),
    retryConsentTextVersion: row.lastOutcome === "expired" && row.unknownRequestSha256 === row.requestSha256 && row.unknownConfirmedAt !== undefined
      ? COMMERCE_JOBS_APPLICATION_CONSENT_VERSION : null,
    actions: {
      withdraw: !revoked,
      retry: !revoked && row.state !== "rejected" && row.lastOutcome !== "rejected" && (row.state === "failed" || row.authorizationRequired === true || (row.authorizationUntil ?? 0) <= Date.now()),
      refresh: row.state === "submitted" && row.statusRequestedAt === undefined,
    },
  }
}

/** Mes candidatures dans ce réseau : les plus récentes d'abord, fenêtre bornée. */
export const myApplications = networkQuery({
  args: { paginationOpts: paginationOptsValidator }, returns: myApplicationsPageValidator,
  handler: async (ctx, args) => {
    const numItems = Math.min(MY_APPLICATIONS_PAGE_MAX, Math.max(1, Math.floor(Number.isFinite(args.paginationOpts.numItems) ? args.paginationOpts.numItems : 1)))
    const window = await ctx.db.query("commerceApplications").withIndex("by_person_network_createdAt", (q) => q.eq("personId", ctx.person._id).eq("networkId", ctx.networkId))
      .order("desc").paginate({ ...args.paginationOpts, numItems, maximumRowsRead: MY_APPLICATIONS_PAGE_MAX, maximumBytesRead: 512 * 1024 })
    const page: MyApplication[] = []
    for (const row of window.page) page.push(await summaryOf(ctx, row))
    return { page, isDone: window.isDone, continueCursor: window.continueCursor }
  },
})

export const myApplication = networkQuery({
  args: { applicationId: v.id("commerceApplications") }, returns: v.union(myApplicationDetailValidator, v.null()),
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.applicationId)
    if (!row || row.personId !== ctx.person._id || row.networkId !== ctx.networkId) return null
    return {
      summary: await summaryOf(ctx, row), civilName: row.civilName ?? null, motivation: row.motivation ?? null,
      consentTextVersion: row.consentTextVersion, consentedAt: row.consentedAt,
    }
  },
})

/** La candidature la plus récente du membre à cette offre (fiche d'offre) ; `null` sinon. */
export const forJob = networkQuery({
  args: { jobRef: v.string() }, returns: v.union(myApplicationValidator, v.null()),
  handler: async (ctx, args) => {
    const rows = await ctx.db.query("commerceApplications").withIndex("by_person_network_job", (q) => q.eq("personId", ctx.person._id).eq("networkId", ctx.networkId).eq("jobRef", args.jobRef)).take(JOB_APPLICATIONS_PER_JOB_MAX + 1)
    const latest = rows.sort((left, right) => right.createdAt - left.createdAt)[0]
    return latest ? await summaryOf(ctx, latest) : null
  },
})

