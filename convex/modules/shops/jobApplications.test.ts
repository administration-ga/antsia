// @vitest-environment edge-runtime
/**
 * P15 : candidatures privées — scénarios backend ÉCRITS, NON EXÉCUTÉS
 * (décision du propriétaire du 18/10/2026 : « Continuer sans vérifier »).
 * Aucun HTTP réel : PRO.GA est simulé par un `fetch` de fixture.
 */
import { engineErrorCode } from "@antsia/social-contracts/errors"
import { COMMERCE_JOBS_APPLICATION_CONSENT_VERSION, COMMERCE_JOBS_CONTRACT, COMMERCE_JOBS_CONTROL_CONTRACT, COMMERCE_JOBS_FILES_ATTACHMENT_HEADER, COMMERCE_JOBS_FILES_CONTRACT, COMMERCE_JOBS_FILES_REQUEST_HEADER, parseCommerceJobsControlRequest, type CommerceJobsClosed, type CommerceJobsPublished } from "@antsia/social-domain/commerce-jobs"
import { COMMERCE_COMMAND_LIMITS, parseCommerceCommandRequest } from "@antsia/social-domain/commerce/command"
import { COMMERCE_COMMAND_CONTRACT, COMMERCE_PUBLIC_CONTRACT, COMMERCE_MAX_SKEW_MS, commerceCanonicalJson } from "@antsia/social-domain/commerce/primitives"
import { commercePublicEffect, type CommerceShopEvent } from "@antsia/social-domain/commerce/projection"
import { COMMERCE_LINK_CONSENT_VERSION } from "@antsia/social-domain/commerce-link"
import { federationSigningText } from "@antsia/social-domain/federationProtocol"
import { makeFunctionReference } from "convex/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { api, components, internal } from "../../_generated/api"
import type { Id } from "../../_generated/dataModel"
import { SEED_CONFIRMATION } from "../../seeds/foundations"
import { createTestOperatorProof, createTestSession, testConvex } from "../../test.setup"
import { directlyOwned, exportableRecord, type DataRecord } from "../people/dataInventory"
import { readCommerceLinkConfig } from "./commerceLinkConfig"
import { sha256Hex } from "./commerceLinkCrypto"
import { revokeJobApplicationsForPerson } from "./jobApplicationLifecycle"
import type { JobFileDto } from "./jobFiles"
import type { JobApplicationIntentLookup, JobApplicationStopIntentResult, MyApplication } from "./jobApplications"
import type { JobApplicationJob } from "./jobApplicationTransport"
import { SHOP_PUBLIC_LISTING_TEXT_VERSION } from "./rules"

const NOW = Date.UTC(2026, 9, 18, 12)
const SHOP = "pro.ga:structure:01JA00000000000000000000S1", LINK = "pro.ga:commerce_link:01JA00000000000000000000K1"
const JOB = "pro.ga:job_opening:01JA00000000000000000000J1"
const PRO_APPLICATION = `pro.ga:job_application:${"3".repeat(26)}`
const KEY_NAME = "ANTSIA_FEDERATION_APPLICATIONS_TEST_KEY", KEY = "candidature-test-secret-key-sandbox-0123456789"
const HANDLE = "emploi-candidatures"
const PDF = new TextEncoder().encode("%PDF-1.4\n%recette\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n")
let eventSequence = 0

type ApplyArgs = { networkId: Id<"networks">; handle: string; jobRef: string; firstName: string; lastName: string; motivation?: string; fileIds: Id<"commerceApplicationFiles">[]; consent: true; consentTextVersion: string; idempotencyKey: string }
type State = MyApplication["state"]
const policy = makeFunctionReference<"mutation", { networkId: Id<"networks">; enabled: boolean; reason: string }, null>("modules/shops/catalogControl:setPolicy")
const mapping = makeFunctionReference<"mutation", { networkId: Id<"networks">; shopId: Id<"shops">; emitterId: Id<"federationEmitters">; enabled: boolean; reason: string }, null>("modules/shops/catalogControl:configureMapping")
const jobPolicy = makeFunctionReference<"mutation", { networkId: Id<"networks">; jobsEnabled: boolean; applicationsEnabled: boolean; reason: string }, null>("modules/shops/jobs:setPolicy")
const apply = makeFunctionReference<"mutation", ApplyArgs, { applicationId: Id<"commerceApplications">; state: State }>("modules/shops/jobApplications:apply")
const retry = makeFunctionReference<"mutation", { networkId: Id<"networks">; applicationId: Id<"commerceApplications">; consentTextVersion?: string }, { state: State }>("modules/shops/jobApplications:retry")
const findIntent = makeFunctionReference<"query", { networkId: Id<"networks">; idempotencyKey: string }, JobApplicationIntentLookup>("modules/shops/jobApplications:findByIdempotencyKey")
const stopIntent = makeFunctionReference<"mutation", { networkId: Id<"networks">; idempotencyKey: string }, JobApplicationStopIntentResult>("modules/shops/jobApplications:stopClientIntent")
const claimJob = makeFunctionReference<"mutation", { applicationId: Id<"commerceApplications"> }, JobApplicationJob | null>("modules/shops/jobApplicationTransport:claim")
const authorizeJob = makeFunctionReference<"mutation", { applicationId: Id<"commerceApplications">; job: JobApplicationJob; configFingerprint: string }, boolean>("modules/shops/jobApplicationTransport:authorize")
const finishJob = makeFunctionReference<"mutation", { applicationId: Id<"commerceApplications">; generation: number; attempt: number; job: JobApplicationJob; delivery: { outcome: "submitted"; applicationRef: string; submittedAt: number } | { outcome: "stored"; attachmentRef: string } | { outcome: "unavailable" } }, null>("modules/shops/jobApplicationTransport:finish")
const withdraw = makeFunctionReference<"mutation", { applicationId: Id<"commerceApplications"> }, { state: State }>("modules/shops/jobApplications:withdraw")
const refresh = makeFunctionReference<"mutation", { networkId: Id<"networks">; applicationId: Id<"commerceApplications"> }, null>("modules/shops/jobApplications:refreshStatus")
const mine = makeFunctionReference<"query", { networkId: Id<"networks">; applicationId: Id<"commerceApplications"> }, { summary: MyApplication; civilName: { firstName: string; lastName: string } | null; motivation: string | null } | null>("modules/shops/jobApplications:myApplication")
const uploadUrl = makeFunctionReference<"mutation", { networkId: Id<"networks"> }, string>("modules/shops/jobFiles:generateUploadUrl")
const registerFile = makeFunctionReference<"mutation", { networkId: Id<"networks">; storageId: Id<"_storage">; kind: "cv" | "cover_letter" | "certificate"; filename?: string; mimeType?: string }, { fileId: Id<"commerceApplicationFiles"> }>("modules/shops/jobFiles:registerFile")
const myFiles = makeFunctionReference<"query", Record<string, never>, JobFileDto[]>("modules/shops/jobFiles:myFiles")
const retireFile = makeFunctionReference<"mutation", { fileId: Id<"commerceApplicationFiles"> }, null>("modules/shops/jobFiles:retireFile")
const deliver = makeFunctionReference<"action", { applicationId: Id<"commerceApplications"> }, null>("modules/shops/jobApplicationTransport:deliver")
const finish = makeFunctionReference<"mutation", { applicationId: Id<"commerceApplications">; generation: number; attempt: number; delivery: { outcome: "submitted"; applicationRef: string; submittedAt: number } }, null>("modules/shops/jobApplicationTransport:finish")

beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(NOW); eventSequence = 0
  vi.stubEnv("CONVEX_CLOUD_URL", "http://127.0.0.1:3210")
  vi.stubEnv("FEDERATION_ENVIRONMENT", "sandbox")
  vi.stubEnv(KEY_NAME, KEY)
  vi.stubEnv("ANTSIA_COMMERCE_ENVIRONMENT", "sandbox")
  vi.stubEnv("ANTSIA_COMMERCE_SOURCE", "antsia")
  vi.stubEnv("ANTSIA_COMMERCE_PRO_HTTP_ORIGIN", "https://pro-backend.example.test")
  vi.stubEnv("ANTSIA_COMMERCE_PRO_APP_ORIGIN", "https://pro.example.test")
  vi.stubEnv("ANTSIA_COMMERCE_ORIGIN", "https://antsia.example.test")
  vi.stubEnv("ANTSIA_COMMERCE_KEY_ID", "antsia-applications-test")
  vi.stubEnv("ANTSIA_COMMERCE_SIGNING_KEY", "TEST_ONLY_APPLICATIONS_KEY_not_a_secret_0123456789")
  vi.stubEnv("FILE_GUARD", "off")
  vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("Transport non préparé dans ce scénario") }))
})
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

function canonical(value: unknown): string { const body = commerceCanonicalJson(value); if (body === null) throw new Error("Fixture JSON invalide"); return body }
async function code(work: Promise<unknown>) { try { await work; return null } catch (error) { return engineErrorCode(error) } }
async function bytesSha256(bytes: Uint8Array) { return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes as BufferSource)), (byte) => byte.toString(16).padStart(2, "0")).join("") }

async function fixture() {
  const t = testConvex()
  const { root } = await t.mutation(internal.seeds.foundations.run, { confirmNonProduction: SEED_CONFIRMATION })
  const owner = t.withIdentity({ subject: "candidatures-owner-fixture" })
  const ownerId = await owner.mutation(api.modules.people.persons.ensureMyPerson, {})
  await owner.mutation(api.modules.people.consents.recordConsent, { purpose: "social_profile", origin: "onboarding" })
  await owner.mutation(api.modules.people.profile.publishMyProfile, { handle: "candidatures-owner", displayName: "Employeur" })
  await owner.mutation(api.modules.people.memberships.joinNetwork, { networkId: root })
  await t.run(async (ctx) => ctx.db.insert("operators", { personId: ownerId, role: "platform_admin", grantedAt: NOW }))
  await createTestOperatorProof(t, owner, ownerId)
  const people = []
  for (const handle of ["candidat.recette", "autre.candidat"]) {
    const as = t.withIdentity({ subject: `${handle}-fixture` })
    const personId = await as.mutation(api.modules.people.persons.ensureMyPerson, {})
    await as.mutation(api.modules.people.consents.recordConsent, { purpose: "social_profile", origin: "onboarding" })
    await as.mutation(api.modules.people.profile.publishMyProfile, { handle, displayName: handle })
    await as.mutation(api.modules.people.memberships.joinNetwork, { networkId: root })
    people.push({ as, personId })
  }
  const config = await readCommerceLinkConfig()
  if (!config) throw new Error("Configuration de fixture absente")
  const owned = await t.run(async (ctx) => {
    const pageId = await ctx.db.insert("pages", { networkId: root, handle: HANDLE, name: "Cabinet employeur", description: "Activité de recette", ownerKind: "company", trust: "community", trustRank: 1, visibility: "network", onRoot: true, status: "active", createdByPersonId: ownerId, searchText: "cabinet employeur", createdAt: NOW, updatedAt: NOW })
    await ctx.db.insert("pageSignatories", { networkId: root, pageId, personId: ownerId, role: "admin", acceptedAt: NOW, createdAt: NOW, updatedAt: NOW })
    const shopId = await ctx.db.insert("shops", { networkId: root, pageId, preparedByPersonId: ownerId, model: "products", storefront: "published", visibility: "network", publicConsentAt: NOW, publicConsentTextVersion: SHOP_PUBLIC_LISTING_TEXT_VERSION, publicConsentByPersonId: ownerId, publishedAt: NOW, createdAt: NOW, updatedAt: NOW })
    const linkId = await ctx.db.insert("shopCommerceLinks", { networkId: root, shopId, pageId, personId: ownerId, state: "active", source: "antsia", environment: "sandbox", configFingerprint: config.fingerprint, subjectRef: `antsia:sub:${"a".repeat(32)}`, antsiaShopRef: `antsia:shop:${"b".repeat(32)}`, shopRef: SHOP, linkRef: LINK, permissions: ["publish_catalog", "publish_jobs", "receive_applications"], consentTextVersion: COMMERCE_LINK_CONSENT_VERSION, consentedAt: NOW, linkedAt: NOW, createdAt: NOW, updatedAt: NOW })
    await ctx.db.insert("shopNetworkPolicies", { networkId: root, storefront: "review", updatedAt: NOW })
    await ctx.db.insert("moderationPolicies", { networkId: root, surface: "commerceJob", preReview: false, maxLinks: 20, maxWrites: 100, windowMs: 60_000, updatedAt: NOW })
    return { pageId, shopId, linkId }
  })
  const emitterId = await owner.mutation(api.modules.federation.emitters.configure, { networkId: root, slug: "pro-applications-test", environment: "sandbox", enabled: true, keyEnvName: KEY_NAME, allowedContracts: [COMMERCE_PUBLIC_CONTRACT, COMMERCE_JOBS_CONTRACT], reason: "Émetteur fictif des candidatures dans le harnais" })
  await owner.mutation(policy, { networkId: root, enabled: true, reason: "Politique fictive de lecture du catalogue" })
  await owner.mutation(mapping, { networkId: root, shopId: owned.shopId, emitterId, enabled: true, reason: "Mapping fictif de la boutique et des emplois" })
  await owner.mutation(jobPolicy, { networkId: root, jobsEnabled: true, applicationsEnabled: true, reason: "Politique fictive des offres et candidatures" })
  const f = { t, owner, ownerId, root, emitterId, candidate: people[0]!, other: people[1]!, ...owned }
  await published(f, job())
  return f
}
type Fixture = Awaited<ReturnType<typeof fixture>>

function shop(): CommerceShopEvent {
  return { type: "shop.published", shopRef: SHOP, linkRef: LINK, revision: 1, changedAt: NOW, commercialName: "Cabinet", country: "GA", currency: "XAF", sellerVerification: "unverified", capabilities: ["catalog", "jobs"], collections: [] }
}
function job(revision = 1): CommerceJobsPublished {
  return { type: "job.published", shopRef: SHOP, jobRef: JOB, revision, changedAt: NOW, title: "Comptable confirmé", contractType: "cdi", headcount: 1, description: "Tenue de la comptabilité.", openedOn: "2026-10-18", closesOn: "2026-11-30", skills: ["Comptabilité"] }
}
async function signedPost(f: Pick<Fixture, "t">, raw: string) {
  const timestamp = String(Math.floor(Date.now() / 1000))
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(KEY), { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
  const signature = Array.from(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(federationSigningText("sandbox", timestamp, raw)))), (byte) => byte.toString(16).padStart(2, "0")).join("")
  const response = await f.t.fetch("/federation/inbox", { method: "POST", body: raw, headers: { "x-antsia-emitter": "pro-applications-test", "x-antsia-environment": "sandbox", "x-antsia-timestamp": timestamp, "x-antsia-signature": signature } })
  expect(response.status).toBe(202)
  return (await response.json() as { applicationStatus?: string }).applicationStatus
}
async function published(f: Pick<Fixture, "t">, payload: CommerceJobsPublished | CommerceJobsClosed) {
  if (payload.type === "job.published" && payload.revision === 1) expect(await signedPost(f, canonical({ contract: COMMERCE_PUBLIC_CONTRACT, eventId: `applications-event-${++eventSequence}`, objectRef: commercePublicEffect(shop()).objectRef, payload: shop(), version: 1 }))).toBe("applied")
  expect(await signedPost(f, canonical({ contract: COMMERCE_JOBS_CONTRACT, eventId: `applications-event-${++eventSequence}`, objectRef: payload.jobRef, payload, version: 1 }))).toBe("applied")
}

/** Une pièce PDF déposée, admise et — par défaut — déclarée saine par un antivirus complet. */
async function pdf(f: Fixture, who = f.candidate, scan: "clean" | "pending" | "infected" = "clean") {
  const storageId = await f.t.run(async (ctx) => ctx.storage.store(new Blob([PDF], { type: "application/pdf" })))
  const { fileId } = await who.as.mutation(registerFile, { networkId: f.root, storageId, kind: "cv", filename: "C:\\Documents\\cv-recette.pdf", mimeType: "application/pdf" })
  await f.t.run(async (ctx) => {
    const row = await ctx.db.query("fileScans").withIndex("by_storageId", (q) => q.eq("storageId", storageId)).unique()
    if (!row) throw new Error("Analyse de fixture absente")
    if (scan === "clean") await ctx.db.patch(row._id, { status: "clean", av: { provider: "test", verdict: "clean" } })
    if (scan === "infected") await ctx.db.patch(row._id, { status: "infected", av: { provider: "test", verdict: "infected", signature: "EICAR" } })
  })
  return { fileId, storageId }
}
function choice(f: Fixture, fileIds: Id<"commerceApplicationFiles">[], extra: Partial<ApplyArgs> = {}): ApplyArgs {
  return { networkId: f.root, handle: HANDLE, jobRef: JOB, firstName: "jean-rémy éloïse", lastName: "ndong mba", motivation: "Je souhaite rejoindre votre cabinet.", fileIds, consent: true, consentTextVersion: COMMERCE_JOBS_APPLICATION_CONSENT_VERSION, idempotencyKey: "candidature-cle-0001-abcdef", ...extra }
}
async function row(f: Fixture, applicationId: Id<"commerceApplications">) { return await f.t.run(async (ctx) => ctx.db.get(applicationId)) }

type Seen = { path: string; headers: Record<string, string>; body: string | Uint8Array }
/** PRO.GA simulé : commandes, pièces et contrôles, réponses canoniques corrélées. */
function proServer(behaviour: { submit?: "accepted" | "job_closed" | "lost"; file?: "stored" | "rejected"; control?: "applied" | "rejected"; state?: string; status?: "unknown" | "unavailable" } = {}) {
  const seen: Seen[] = []
  const json = (value: unknown, status = 200) => new Response(canonical(value), { status, headers: { "Content-Type": "application/json" } })
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(String(input)), headers = (init?.headers ?? {}) as Record<string, string>, body = init?.body as string | Uint8Array
    seen.push({ path: url.pathname, headers, body })
    if (url.pathname === "/commerce/v1/commands") {
      const rawBody = String(body), request = JSON.parse(rawBody) as { command: string; requestId: string; payload: { targetRequestId?: string; targetRequestSha256?: string } }
      const base = { contract: COMMERCE_COMMAND_CONTRACT, version: 1, command: request.command, requestId: request.requestId, requestSha256: await sha256Hex(rawBody), respondedAt: Date.now() }
      if (request.command === "application.submit") {
        if (behaviour.submit === "lost") throw new Error("Réponse réseau perdue après traitement distant")
        return behaviour.submit === "job_closed" ? json({ ...base, outcome: "rejected", reason: "job_closed" }, 422)
          : json({ ...base, outcome: "accepted", result: { applicationRef: PRO_APPLICATION, state: "received", submittedAt: NOW } })
      }
      if (behaviour.status === "unavailable") throw new Error("Statut distant indisponible")
      if (behaviour.status === "unknown") return json({ ...base, outcome: "accepted", result: { targetRequestId: request.payload.targetRequestId, state: "unknown", current: [] } })
      const recordedResponse = canonical({ contract: COMMERCE_COMMAND_CONTRACT, version: 1, command: "application.submit", requestId: request.payload.targetRequestId, requestSha256: request.payload.targetRequestSha256, respondedAt: NOW, outcome: "accepted", result: { applicationRef: PRO_APPLICATION, state: "received", submittedAt: NOW } })
      return json({ ...base, outcome: "accepted", result: { targetRequestId: request.payload.targetRequestId, state: "completed", recordedResponse, recordedResponseSha256: await sha256Hex(recordedResponse),
        current: [{ objectKind: "job_application", objectRef: PRO_APPLICATION, revision: 2, state: behaviour.state ?? "screening", updatedAt: NOW }] } })
    }
    if (url.pathname === "/commerce/v1/application-files") {
      const bytes = body as Uint8Array
      return json({ attachmentRef: headers[COMMERCE_JOBS_FILES_ATTACHMENT_HEADER], contract: COMMERCE_JOBS_FILES_CONTRACT, outcome: behaviour.file ?? "stored", sha256: await bytesSha256(bytes), submitRequestId: headers[COMMERCE_JOBS_FILES_REQUEST_HEADER], version: 1 })
    }
    if (url.pathname === "/commerce/v1/application-control") {
      const rawBody = String(body), request = JSON.parse(rawBody) as { requestId: string }
      return json({ contract: COMMERCE_JOBS_CONTROL_CONTRACT, outcome: behaviour.control ?? "applied", requestId: request.requestId, requestSha256: await sha256Hex(rawBody), respondedAt: Date.now(), version: 1 })
    }
    throw new Error(`Chemin inattendu ${url.pathname}`)
  }))
  return seen
}

describe("P15 — candidater : choix explicite, nom civil normalisé", () => {
  it("signe seulement le nom normalisé, la motivation et les pièces choisies, par sujet candidat opaque", async () => {
    const f = await fixture(), file = await pdf(f)
    const result = await f.candidate.as.mutation(apply, choice(f, [file.fileId]))
    expect(result.state).toBe("queued")
    const saved = await row(f, result.applicationId)
    expect(saved).toMatchObject({ state: "queued", civilName: { firstName: "Jean-Rémy Éloïse", lastName: "NDONG MBA" }, motivation: "Je souhaite rejoindre votre cabinet.", generation: 1 })
    if (!saved?.rawBody) throw new Error("Corps privé de fixture absent")
    const parsed = parseCommerceCommandRequest(saved.rawBody, { source: "antsia", environment: "sandbox", nowMs: NOW })
    if (!parsed.ok || parsed.value.command !== "application.submit") throw new Error("Demande privée invalide")
    expect(parsed.value.subject).toMatchObject({ kind: "candidate", ref: saved.subjectRef, authVerifiedAt: NOW })
    expect(parsed.value.payload).toMatchObject({ shopRef: SHOP, jobRef: JOB, civilName: { firstName: "Jean-Rémy Éloïse", lastName: "NDONG MBA" }, consent: { purpose: "commerce_application", textVersion: COMMERCE_JOBS_APPLICATION_CONSENT_VERSION, givenAt: NOW } })
    const attachment = parsed.value.payload.attachments[0]
    expect(attachment).toMatchObject({ kind: "cv", mimeType: "application/pdf", byteSize: PDF.byteLength, sha256: await bytesSha256(PDF) })
    expect(attachment?.attachmentRef).toMatch(/^antsia:file:[0-9a-f]{64}$/u)
    // Ni identifiant interne, ni nom de fichier, ni sujet acheteur, ni coordonnée.
    for (const value of [String(file.storageId), String(file.fileId), String(f.candidate.personId), String(f.shopId), "cv-recette", `antsia:sub:${"a".repeat(32)}`, "@"]) expect(saved.rawBody).not.toContain(value)
    const jobs = await f.t.run(async (ctx) => ctx.db.system.query("_scheduled_functions").take(50))
    expect(jobs.filter((scheduled) => scheduled.name === "modules/shops/jobApplicationTransport:deliver").map((scheduled) => scheduled.args)).toEqual([[{ applicationId: result.applicationId }]])
    expect(vi.mocked(fetch)).not.toHaveBeenCalled()
  })

  it("rejeu : même clé et même intention → même candidature ; autre intention → conflit ; seconde clé → refus", async () => {
    const f = await fixture(), file = await pdf(f)
    // L'admission de débit précède le handler, rejeu compris (ADR-0009 §4) : un membre déclaré
    // sans badge relève de `shop.job.apply.reinforced` (un envoi par huit heures). Le rejeu est
    // éprouvé sous le seau ordinaire, avec une identité forte (patron DIASPORALE, `diaspora/jobs.test.ts`).
    await f.t.run(async (ctx) => ctx.db.insert("identityLinks", { personId: f.candidate.personId, provider: "idn", subject: "idn-candidat-recette", loa: 2, linkedAt: NOW }))
    const first = await f.candidate.as.mutation(apply, choice(f, [file.fileId]))
    expect(await f.candidate.as.mutation(apply, choice(f, [file.fileId]))).toEqual(first)
    expect(await code(f.candidate.as.mutation(apply, choice(f, [file.fileId], { motivation: "Une autre motivation." })))).toBe("conflict")
    expect(await code(f.candidate.as.mutation(apply, choice(f, [file.fileId], { idempotencyKey: "candidature-cle-0002-abcdef" })))).toBe("policyRefused")
    const all = await f.t.run(async (ctx) => ctx.db.query("commerceApplications").withIndex("by_person_job", (q) => q.eq("personId", f.candidate.personId).eq("jobRef", JOB)).take(10))
    expect(all).toHaveLength(1)
  })

  it.each([
    ["version de consentement périmée", { consentTextVersion: "2025-01-01-old" }, "consentRequired"],
    ["clé d'idempotence trop courte", { idempotencyKey: "court" }, "invalidArgument"],
    ["nom vide", { lastName: "   " }, "invalidArgument"],
    ["prénom sans lettre", { firstName: "1234" }, "invalidArgument"],
    ["motivation trop longue", { motivation: "x".repeat(4001) }, "invalidArgument"],
  ] as const)("refuse avant toute copie : %s", async (_label, change, expected) => {
    const f = await fixture(), file = await pdf(f)
    expect(await code(f.candidate.as.mutation(apply, choice(f, [file.fileId], change)))).toBe(expected)
    expect(await f.t.run(async (ctx) => ctx.db.query("commerceApplications").withIndex("by_person", (q) => q.eq("personId", f.candidate.personId)).take(1))).toEqual([])
  })

  it("offre close, candidatures fermées ou lien sans `receive_applications` : refus indistinct", async () => {
    const f = await fixture(), file = await pdf(f)
    await f.owner.mutation(jobPolicy, { networkId: f.root, jobsEnabled: true, applicationsEnabled: false, reason: "Candidatures fictivement suspendues" })
    expect(await code(f.candidate.as.mutation(apply, choice(f, [file.fileId])))).toBe("notFound")
    await f.owner.mutation(jobPolicy, { networkId: f.root, jobsEnabled: true, applicationsEnabled: true, reason: "Candidatures fictivement rouvertes" })
    await f.t.run(async (ctx) => ctx.db.patch(f.linkId, { permissions: ["publish_catalog", "publish_jobs"] }))
    expect(await code(f.candidate.as.mutation(apply, choice(f, [file.fileId])))).toBe("notFound")
    await f.t.run(async (ctx) => ctx.db.patch(f.linkId, { permissions: ["publish_catalog", "publish_jobs", "receive_applications"] }))
    await published(f, { type: "job.closed", shopRef: SHOP, jobRef: JOB, revision: 2, changedAt: NOW, reason: "closed" })
    expect(await code(f.candidate.as.mutation(apply, choice(f, [file.fileId])))).toBe("notFound")
  })
})

describe("P15 — pièces : garde des fichiers, jamais d'URL", () => {
  it("pièce d'autrui, en analyse, infectée ou retirée : jamais jointe", async () => {
    const f = await fixture()
    const foreign = await pdf(f, f.other), pending = await pdf(f, f.candidate, "pending"), infected = await pdf(f, f.candidate, "infected"), retired = await pdf(f)
    await f.candidate.as.mutation(retireFile, { fileId: retired.fileId })
    expect(await code(f.candidate.as.mutation(apply, choice(f, [foreign.fileId])))).toBe("notFound")
    expect(await code(f.candidate.as.mutation(apply, choice(f, [pending.fileId])))).toBe("fileScanPending")
    expect(await code(f.candidate.as.mutation(apply, choice(f, [infected.fileId])))).toBe("fileQuarantined")
    expect(await code(f.candidate.as.mutation(apply, choice(f, [retired.fileId])))).toBe("notFound")
    // La pièce retirée a perdu son blob et sa ligne d'analyse.
    expect(await f.t.run(async (ctx) => ctx.db.query("fileScans").withIndex("by_storageId", (q) => q.eq("storageId", retired.storageId)).unique())).toBeNull()
  })

  it("le fichier d'autrui ne se rattache pas ; la garde ne porte ni réseau ni nom de fichier ; aucune URL n'est servie", async () => {
    const f = await fixture(), file = await pdf(f)
    expect(await code(f.other.as.mutation(registerFile, { networkId: f.root, storageId: file.storageId, kind: "cv", mimeType: "application/pdf" }))).toBe("notFound")
    const scan = await f.t.run(async (ctx) => ctx.db.query("fileScans").withIndex("by_storageId", (q) => q.eq("storageId", file.storageId)).unique())
    expect(scan).toMatchObject({ source: "job_application", requiresFullScan: true, uploadedByPersonId: f.candidate.personId })
    expect(scan?.networkId).toBeUndefined(); expect(scan?.filename).toBeUndefined()
    const listed = await f.candidate.as.query(myFiles, {})
    expect(listed).toEqual([{ fileId: file.fileId, kind: "cv", filename: "cv-recette.pdf", byteSize: PDF.byteLength, createdAt: NOW, scan: "clean" }])
    expect(JSON.stringify(listed)).not.toMatch(/https?:/u)
    expect(await f.other.as.query(myFiles, {})).toEqual([])
    expect(typeof await f.candidate.as.mutation(uploadUrl, { networkId: f.root })).toBe("string")
  })
})

describe("P15 — transport privé signé", () => {
  it("accepté : pièce envoyée par ses octets EXACTS, corrélée par références opaques, jamais une URL", async () => {
    const f = await fixture(), file = await pdf(f)
    const { applicationId } = await f.candidate.as.mutation(apply, choice(f, [file.fileId]))
    const seen = proServer()
    await f.t.action(deliver, { applicationId })
    expect(await row(f, applicationId)).toMatchObject({ state: "submitted", applicationRef: PRO_APPLICATION, remoteState: "received" })
    expect((await row(f, applicationId))?.rawBody).toBeUndefined()
    await f.t.action(deliver, { applicationId })
    const upload = seen.find((call) => call.path === "/commerce/v1/application-files")
    if (!upload) throw new Error("Envoi de pièce absent")
    const saved = await row(f, applicationId)
    expect(upload.headers["Content-Type"]).toBe("application/pdf")
    expect(upload.headers[COMMERCE_JOBS_FILES_REQUEST_HEADER]).toBe(saved?.requestId)
    expect(upload.headers[COMMERCE_JOBS_FILES_ATTACHMENT_HEADER]).toBe(saved?.files[0]?.attachmentRef)
    expect(await bytesSha256(upload.body as Uint8Array)).toBe(await bytesSha256(PDF))
    for (const header of Object.values(upload.headers)) expect(header).not.toMatch(/https?:|_storage/u)
    expect(saved?.files[0]?.transfer).toBe("stored")
  })

  it("clôture concurrente pendant l'envoi : PRO.GA refuse `job_closed`, octets privés effacés, aucune pièce envoyée", async () => {
    const f = await fixture(), file = await pdf(f)
    const { applicationId } = await f.candidate.as.mutation(apply, choice(f, [file.fileId]))
    const seen = proServer({ submit: "job_closed" })
    await f.t.action(deliver, { applicationId })
    expect(await row(f, applicationId)).toMatchObject({ state: "rejected", rejection: "job_closed" })
    expect((await row(f, applicationId))?.rawBody).toBeUndefined()
    expect(seen.map((call) => call.path)).toEqual(["/commerce/v1/commands"])
  })

  it("délai réseau puis expiration : `request.status` résout l'envoi, jamais une seconde candidature", async () => {
    const f = await fixture(), file = await pdf(f)
    const { applicationId } = await f.candidate.as.mutation(apply, choice(f, [file.fileId]))
    const original = await row(f, applicationId)
    proServer({ submit: "lost" })
    await f.t.action(deliver, { applicationId })
    expect(await row(f, applicationId)).toMatchObject({ state: "submitting", requestId: original?.requestId, rawBody: original?.rawBody })
    vi.setSystemTime((original?.requestExpiresAt ?? NOW) + 60_000)
    await f.candidate.as.mutation(retry, { networkId: f.root, applicationId })
    const seen = proServer()
    await f.t.action(deliver, { applicationId })
    const commands = seen.filter((call) => call.path === "/commerce/v1/commands").map((call) => JSON.parse(String(call.body)) as { command: string })
    expect(commands.map((command) => command.command)).toEqual(["request.status"])
    expect(await row(f, applicationId)).toMatchObject({ state: "submitted", applicationRef: PRO_APPLICATION, requestId: original?.requestId })
  })

  it("une réponse tardive d'une génération ancienne ne s'applique jamais (retrait intervenu entre-temps)", async () => {
    const f = await fixture(), file = await pdf(f)
    const { applicationId } = await f.candidate.as.mutation(apply, choice(f, [file.fileId]))
    expect((await f.candidate.as.mutation(withdraw, { applicationId })).state).toBe("withdrawn")
    await f.t.mutation(finish, { applicationId, generation: 1, attempt: 1, delivery: { outcome: "submitted", applicationRef: PRO_APPLICATION, submittedAt: NOW } })
    expect(await row(f, applicationId)).toMatchObject({ state: "withdrawn" })
    expect((await row(f, applicationId))?.applicationRef).toBeUndefined()
  })
})

describe("P15 — suivi borné et retrait", () => {
  it("le suivi rend l'état autorisé (« en examen »), jamais une note ni un motif", async () => {
    const f = await fixture(), file = await pdf(f)
    const { applicationId } = await f.candidate.as.mutation(apply, choice(f, [file.fileId]))
    proServer({ state: "screening" })
    await f.t.action(deliver, { applicationId })
    await f.t.action(deliver, { applicationId })
    await f.candidate.as.mutation(refresh, { networkId: f.root, applicationId })
    await f.t.action(deliver, { applicationId })
    const detail = await f.candidate.as.query(mine, { networkId: f.root, applicationId })
    expect(detail?.summary).toMatchObject({ state: "submitted", candidateState: "in_review", remoteUpdatedAt: NOW })
    expect(JSON.stringify(detail)).not.toMatch(/note|notes|score|rating/u)
  })

  it("un autre candidat ne lit ni ne retire ma candidature", async () => {
    const f = await fixture(), file = await pdf(f)
    const { applicationId } = await f.candidate.as.mutation(apply, choice(f, [file.fileId]))
    expect(await f.other.as.query(mine, { networkId: f.root, applicationId })).toBeNull()
    expect(await code(f.other.as.mutation(withdraw, { applicationId }))).toBe("notFound")
    expect(await code(f.other.as.mutation(refresh, { networkId: f.root, applicationId }))).toBe("notFound")
  })

  it("retrait après envoi : copies locales effacées tout de suite, contrôle privé signé, puis retirée", async () => {
    const f = await fixture(), file = await pdf(f)
    const { applicationId } = await f.candidate.as.mutation(apply, choice(f, [file.fileId]))
    const seen = proServer()
    await f.t.action(deliver, { applicationId })
    expect((await f.candidate.as.mutation(withdraw, { applicationId })).state).toBe("withdrawal_pending")
    const pending = await row(f, applicationId)
    expect(pending?.civilName).toBeUndefined(); expect(pending?.motivation).toBeUndefined(); expect(pending?.rawBody).toBeUndefined()
    await f.t.action(deliver, { applicationId })
    const control = seen.find((call) => call.path === "/commerce/v1/application-control")
    if (!control) throw new Error("Contrôle de retrait absent")
    const parsed = parseCommerceJobsControlRequest(String(control.body), { source: "antsia", environment: "sandbox", nowMs: Date.now() })
    expect(parsed.ok && parsed.value).toMatchObject({ action: "withdraw", reason: "candidate_request", submitRequestId: pending?.requestId, subjectRef: pending?.subjectRef })
    expect(await row(f, applicationId)).toMatchObject({ state: "withdrawn" })
    expect((await row(f, applicationId))?.files.every((item) => item.transfer === "revoked")).toBe(true)
  })

  it("retrait d'une pièce déjà copiée : révocation privée, blob purgé, candidature conservée", async () => {
    const f = await fixture(), file = await pdf(f)
    const { applicationId } = await f.candidate.as.mutation(apply, choice(f, [file.fileId]))
    const seen = proServer()
    await f.t.action(deliver, { applicationId })
    await f.t.action(deliver, { applicationId })
    await f.candidate.as.mutation(retireFile, { fileId: file.fileId })
    expect((await row(f, applicationId))?.files[0]?.transfer).toBe("revoke_pending")
    await f.t.action(deliver, { applicationId })
    const control = seen.filter((call) => call.path === "/commerce/v1/application-control").at(-1)
    const parsed = control ? parseCommerceJobsControlRequest(String(control.body), { source: "antsia", environment: "sandbox", nowMs: Date.now() }) : null
    expect(parsed?.ok && parsed.value).toMatchObject({ action: "attachment.revoke", attachmentRef: (await row(f, applicationId))?.files[0]?.attachmentRef })
    expect(await row(f, applicationId)).toMatchObject({ state: "submitted" })
    expect((await row(f, applicationId))?.files[0]?.transfer).toBe("revoked")
    expect(await f.t.run(async (ctx) => ctx.db.system.get("_storage", file.storageId))).toBeNull()
  })
})

describe("P15 — export et effacement", () => {
  it("export : seules ses données, sans octets signés ni sujet ; effacement : retrait distant avant suppression", async () => {
    const f = await fixture(), file = await pdf(f)
    const { applicationId } = await f.candidate.as.mutation(apply, choice(f, [file.fileId]))
    const seen = proServer()
    await f.t.action(deliver, { applicationId })
    const saved = await row(f, applicationId)
    const exported = exportableRecord("commerceApplications", saved as unknown as DataRecord, f.candidate.personId)
    expect(exported).toMatchObject({ jobRef: JOB, civilName: { firstName: "Jean-Rémy Éloïse", lastName: "NDONG MBA" }, state: "submitted" })
    for (const key of ["rawBody", "subjectRef", "requestId", "requestSha256", "configFingerprint", "idempotencyKey", "controlBody"]) expect(exported).not.toHaveProperty(key)
    expect(exportableRecord("commerceApplications", saved as unknown as DataRecord, f.other.personId)).toBeNull()
    expect(directlyOwned("commerceApplications", saved as unknown as DataRecord, f.candidate.personId)).toBe(true)
    const subject = await f.t.run(async (ctx) => ctx.db.query("commerceApplicationSubjects").withIndex("by_person", (q) => q.eq("personId", f.candidate.personId)).first())
    expect(exportableRecord("commerceApplicationSubjects", subject as unknown as DataRecord, f.candidate.personId)).toBeNull()
    // L'effacement retire d'abord la candidature chez PRO.GA (contrôle `erasure`), sans jamais attendre indéfiniment.
    expect(await f.t.run(async (ctx) => revokeJobApplicationsForPerson(ctx, f.candidate.personId))).toBe(false)
    expect(await row(f, applicationId)).toMatchObject({ state: "withdrawal_pending", revokeReason: "erasure" })
    await f.t.action(deliver, { applicationId })
    const control = seen.find((call) => call.path === "/commerce/v1/application-control")
    const parsed = control ? parseCommerceJobsControlRequest(String(control.body), { source: "antsia", environment: "sandbox", nowMs: Date.now() }) : null
    expect(parsed?.ok && parsed.value).toMatchObject({ action: "withdraw", reason: "erasure" })
    expect(await f.t.run(async (ctx) => revokeJobApplicationsForPerson(ctx, f.candidate.personId))).toBe(true)
  })
})

/** P16 (écrit, non exécuté) : une révocation survenue entre le clic et le PREMIER envoi ferme l'envoi. */
describe("P16 — révocation avant le premier envoi d'une candidature", () => {
  it("candidat suspendu à la racine après son clic : aucun octet ne part, le corps privé est effacé", async () => {
    const f = await fixture(), file = await pdf(f)
    const { applicationId } = await f.candidate.as.mutation(apply, choice(f, [file.fileId]))
    const seen = proServer()
    await f.t.run(async (ctx) => {
      const membership = await ctx.db.query("networkMemberships").withIndex("by_network_and_person", (q) => q.eq("networkId", f.root).eq("personId", f.candidate.personId)).unique()
      if (!membership) throw new Error("Adhésion de fixture absente")
      await ctx.db.patch(membership._id, { status: "suspendue", statusBeforeSuspension: "declaree" })
    })
    await f.t.action(deliver, { applicationId })
    expect(seen).toEqual([])
    expect(await row(f, applicationId)).toMatchObject({ state: "rejected", rejection: "capability_disabled" })
    expect((await row(f, applicationId))?.rawBody).toBeUndefined()
  })

  it("mandat de l'auteur du lien retiré côté ANTSIA après le clic : le lien n'est plus vivant, rien ne part", async () => {
    const f = await fixture(), file = await pdf(f)
    const { applicationId } = await f.candidate.as.mutation(apply, choice(f, [file.fileId]))
    const seen = proServer()
    await f.t.run(async (ctx) => {
      const signatory = await ctx.db.query("pageSignatories").withIndex("by_page_role", (q) => q.eq("pageId", f.pageId).eq("role", "admin")).first()
      if (!signatory) throw new Error("Signataire de fixture absent")
      await ctx.db.delete(signatory._id)
    })
    await f.t.action(deliver, { applicationId })
    expect(seen).toEqual([])
    expect(await row(f, applicationId)).toMatchObject({ state: "rejected", rejection: "capability_disabled" })
  })
})

/** P16 (écrit, non exécuté) : un contenu porté par une PAGE (ici un poste reflété) a des destinataires et un recours. */
describe("P16 — décision de modération sur un contenu de page", () => {
  type Paged = { page: { reportId: Id<"reports">; status: string; decisionReason: string | null; appeals: unknown[] }[]; isDone: boolean; continueCursor: string }
  const report = makeFunctionReference<"mutation", { networkId: Id<"networks">; target: { kind: "commerceJob"; id: Id<"commerceJobHeads"> }; reason: string }, { reportId: Id<"reports">; created: boolean; hidden: boolean }>("modules/moderation/cases:report")
  const decide = makeFunctionReference<"mutation", { networkId: Id<"networks">; reportId: Id<"reports">; decision: "dismissed" | "actioned"; reason: string; sanctions: never[] }, { status: string }>("modules/moderation/cases:decide")
  const pageDecisions = makeFunctionReference<"query", { networkId: Id<"networks">; pageId: Id<"pages">; paginationOpts: { cursor: string | null; numItems: number } }, Paged>("modules/moderation/cases:pageDecisions")
  const fileAppeal = makeFunctionReference<"mutation", { reportId: Id<"reports">; reason: string }, { appealId: Id<"appeals">; created: boolean }>("modules/moderation/cases:fileAppeal")
  const PAGE_ONE = { cursor: null, numItems: 10 }

  /** Le candidat devient modérateur du réseau (sans lien avec la page) ; l'autre membre signale le poste. */
  async function reported(f: Fixture) {
    const head = await f.t.run(async (ctx) => ctx.db.query("commerceJobHeads").withIndex("by_emitter_object", (q) => q.eq("emitterId", f.emitterId).eq("objectRef", JOB)).unique())
    if (!head) throw new Error("Poste de fixture absent")
    await f.t.run(async (ctx) => {
      const membership = await ctx.db.query("networkMemberships").withIndex("by_network_and_person", (q) => q.eq("networkId", f.root).eq("personId", f.candidate.personId)).unique()
      if (!membership) throw new Error("Adhésion de fixture absente")
      await ctx.db.patch(membership._id, { role: "network_moderator" })
    })
    const { reportId } = await f.other.as.mutation(report, { networkId: f.root, target: { kind: "commerceJob", id: head._id }, reason: "misleading_offer" })
    return { head, reportId }
  }
  async function notices(f: Fixture) {
    return await f.t.run(async (ctx) => (await ctx.db.query("notifications").take(200)).filter((row) => row.kind === "moderation_decision"))
  }

  it("retrait du poste : avis neutre au seul signataire vivant, décision lisible et contestable par lui seul", async () => {
    const f = await fixture()
    const { reportId } = await reported(f)
    await f.candidate.as.mutation(decide, { networkId: f.root, reportId, decision: "actioned", reason: "Offre trompeuse confirmée après examen", sanctions: [] })
    const sent = await notices(f)
    expect(sent.map((notice) => notice.recipientPersonId)).toEqual([f.ownerId])
    expect(sent[0]).toMatchObject({ subjectReportId: reportId })
    expect(sent[0]?.actorPersonId).toBeUndefined()
    const listed = await f.owner.query(pageDecisions, { networkId: f.root, pageId: f.pageId, paginationOpts: PAGE_ONE })
    expect(listed.page.map((decision) => decision.reportId)).toEqual([reportId])
    expect(listed.page[0]).toMatchObject({ status: "actioned", decisionReason: "Offre trompeuse confirmée après examen" })
    // Ni le déclarant ni le modérateur ne sont révélés à la page.
    expect(JSON.stringify(listed)).not.toContain(String(f.other.personId))
    expect(JSON.stringify(listed)).not.toContain(String(f.candidate.personId))
    expect(await code(f.other.as.query(pageDecisions, { networkId: f.root, pageId: f.pageId, paginationOpts: PAGE_ONE }))).toBe("notFound")
    expect(await code(f.other.as.mutation(fileAppeal, { reportId, reason: "Je conteste cette décision qui vise la page" }))).toBe("notFound")
    expect((await f.owner.mutation(fileAppeal, { reportId, reason: "Offre conforme, pièces justificatives disponibles" })).created).toBe(true)
  })

  it("signataire suspendu après le signalement : ni avis, ni lecture, ni recours au nom de la page", async () => {
    const f = await fixture()
    const { reportId } = await reported(f)
    await f.t.run(async (ctx) => {
      const membership = await ctx.db.query("networkMemberships").withIndex("by_network_and_person", (q) => q.eq("networkId", f.root).eq("personId", f.ownerId)).unique()
      if (!membership) throw new Error("Adhésion de fixture absente")
      await ctx.db.patch(membership._id, { status: "suspendue", statusBeforeSuspension: "declaree" })
    })
    await f.candidate.as.mutation(decide, { networkId: f.root, reportId, decision: "actioned", reason: "Offre trompeuse confirmée après examen", sanctions: [] })
    expect(await notices(f)).toEqual([])
    expect(await code(f.owner.mutation(fileAppeal, { reportId, reason: "Offre conforme, pièces justificatives disponibles" }))).toBe("notFound")
  })

  it("un modérateur signataire de la page ne juge pas le dossier de sa page, qui reste ouvert", async () => {
    const f = await fixture()
    const { reportId } = await reported(f)
    await f.t.run(async (ctx) => ctx.db.insert("pageSignatories", { networkId: f.root, pageId: f.pageId, personId: f.candidate.personId, role: "signatory", acceptedAt: NOW, createdAt: NOW, updatedAt: NOW }))
    expect(await code(f.candidate.as.mutation(decide, { networkId: f.root, reportId, decision: "actioned", reason: "Décision prise par un signataire de la page", sanctions: [] }))).toBe("notFound")
    expect(await f.t.run(async (ctx) => (await ctx.db.get(reportId))?.status)).toBe("open")
  })
})

/**
 * P14B (écrit, NON EXÉCUTÉ — décision du 18/10/2026) : l'état AUTORISÉ d'une candidature change
 * (suivi servi par PRO.GA) → un avis neutre au SEUL candidat, sans motif ; transporté selon ses
 * préférences et son budget ; l'ouverture relit la candidature et mène à sa fiche.
 */
describe("P14B — avis de suivi d'une candidature", () => {
  const openTarget = makeFunctionReference<"query", { networkId: Id<"networks">; reference: string }, unknown>("modules/notifications/open:resolveOpenTarget")
  const subscribe = makeFunctionReference<"mutation", { networkId: Id<"networks">; applicationId: string; deviceId: string; credential: { provider: "expo"; token: string } }, { subscriptionId: Id<"pushSubscriptions"> }>("modules/notifications/pushSubscriptions:subscribe")
  const APPLICATIONS = JSON.stringify([{ applicationId: "antsia_ga", networkSlug: "antsia", origin: "https://antsia.example.test", entryPath: "/fil" }])

  beforeEach(() => { vi.stubEnv("NOTIFICATION_APPLICATIONS_JSON", APPLICATIONS) })

  async function updates(f: Fixture) {
    // borné : un scénario écrit quelques avis seulement.
    return await f.t.run(async (ctx) => (await ctx.db.query("notifications").take(100)).filter((notice) => notice.kind === "commerce_job_application_updated"))
  }
  /** Candidature transmise (sans pièce), puis suivi demandé par le candidat et servi par PRO.GA à l'état `state`. */
  async function tracked(f: Fixture, state: string) {
    const { applicationId } = await f.candidate.as.mutation(apply, choice(f, []))
    proServer({ state })
    await f.t.action(deliver, { applicationId })
    expect(await row(f, applicationId)).toMatchObject({ state: "submitted", remoteState: "received" })
    await f.candidate.as.mutation(refresh, { networkId: f.root, applicationId })
    await f.t.action(deliver, { applicationId })
    return applicationId
  }

  it("l'état visible change : avis non lu au candidat, sans motif ni contenu, transporté ; il ouvre sa fiche, jamais pour un tiers", async () => {
    const f = await fixture()
    await f.candidate.as.mutation(api.modules.people.consents.recordConsent, { networkId: f.root, purpose: "notifications", origin: "settings" })
    await f.candidate.as.mutation(subscribe, { networkId: f.root, applicationId: "antsia_ga", deviceId: "device_candidate", credential: { provider: "expo", token: "ExpoPushToken[token_candidate]" } })
    const applicationId = await tracked(f, "interview")
    expect(await row(f, applicationId)).toMatchObject({ remoteState: "interview", remoteRevision: 2 })
    const sent = await updates(f)
    expect(sent.map((notice) => notice.recipientPersonId)).toEqual([f.candidate.personId])
    expect(sent[0]?.readAt).toBeUndefined()
    expect(sent[0]?.actorPersonId).toBeUndefined()
    expect(sent[0]?.dedupKey).toBe(`commerce_job_application_updated|commerceApplication:${applicationId}:application:r2|-`)
    // Ni l'état, ni le poste, ni l'employeur, ni le nom civil dans la ligne.
    for (const forbidden of ["interview", "Comptable", "Cabinet", "NDONG"]) expect(JSON.stringify(sent)).not.toContain(forbidden)
    const jobs = await f.t.run(async (ctx) => ctx.db.query("notificationDeliveryJobs").withIndex("by_notification", (q) => q.eq("notificationId", sent[0]!._id)).take(5))
    expect(jobs).toHaveLength(1)
    expect(jobs[0]).toMatchObject({ channel: "push", category: "messages", recipientPersonId: f.candidate.personId })
    expect(await f.candidate.as.query(openTarget, { networkId: f.root, reference: jobs[0]!._id })).toMatchObject({ kind: "commerce_job_application_updated", subject: null, target: { kind: "jobApplication", applicationId } })
    expect(await f.other.as.query(openTarget, { networkId: f.root, reference: jobs[0]!._id })).toBeNull()
  })

  it("même état autorisé relu : aucun nouvel avis ; ni l'employeur ni un tiers ne sont destinataires", async () => {
    const f = await fixture()
    const applicationId = await tracked(f, "screening")
    expect(await updates(f)).toHaveLength(1)
    await f.candidate.as.mutation(refresh, { networkId: f.root, applicationId })
    await f.t.action(deliver, { applicationId })
    const sent = await updates(f)
    expect(sent).toHaveLength(1)
    expect(sent.every((notice) => notice.recipientPersonId === f.candidate.personId)).toBe(true)
  })
})

// Reprise du 20/10 : scénarios ÉCRITS uniquement, sans exécution.
describe("P15 — récupération par clé et preuve réelle de session", () => {
  it("clôture atomique d'une clé absente : idempotente, privée et sans candidature ni contenu", async () => {
    const f = await fixture(), intent = choice(f, []), key = { networkId: f.root, idempotencyKey: intent.idempotencyKey }
    expect(await f.candidate.as.query(findIntent, key)).toEqual({ outcome: "absent" })
    expect(await f.candidate.as.mutation(stopIntent, key)).toEqual({ outcome: "stopped" })
    expect(await f.candidate.as.mutation(stopIntent, key)).toEqual({ outcome: "stopped" })
    expect(await f.candidate.as.query(findIntent, key)).toEqual({ outcome: "stopped" })
    expect(await f.other.as.query(findIntent, key)).toEqual({ outcome: "absent" })
    expect(await code(f.candidate.as.mutation(apply, intent))).toBe("policyRefused")
    const fences = await f.t.run(async (ctx) => ctx.db.query("commerceApplicationIntentFences").withIndex("by_key", (q) => q.eq("personId", f.candidate.personId).eq("networkId", f.root).eq("idempotencyKey", intent.idempotencyKey)).take(2))
    expect(fences).toHaveLength(1)
    expect(directlyOwned("commerceApplicationIntentFences", fences[0]! as unknown as DataRecord, f.candidate.personId)).toBe(true)
    expect(exportableRecord("commerceApplicationIntentFences", fences[0]! as unknown as DataRecord, f.candidate.personId)).toBeNull()
    expect(vi.mocked(fetch)).not.toHaveBeenCalled()
  })

  it("une candidature existante reste prioritaire, sans retrait ni modification de ses octets", async () => {
    const f = await fixture(), intent = choice(f, []), { applicationId } = await f.candidate.as.mutation(apply, intent)
    const before = await row(f, applicationId), key = { networkId: f.root, idempotencyKey: intent.idempotencyKey }
    expect(await f.candidate.as.query(findIntent, key)).toEqual({ outcome: "application", applicationId })
    expect(await f.candidate.as.mutation(stopIntent, key)).toEqual({ outcome: "application", applicationId })
    expect(await row(f, applicationId)).toEqual(before)
    expect(vi.mocked(fetch)).not.toHaveBeenCalled()
  })

  it("doublon legacy ambigu : lookup, stop et apply ferment sans choisir une candidature", async () => {
    const f = await fixture(), intent = choice(f, []), { applicationId } = await f.candidate.as.mutation(apply, intent)
    await f.t.run(async (ctx) => {
      const source = await ctx.db.get(applicationId)
      if (!source) throw new Error("Candidature attendue")
      const { _id, _creationTime, ...data } = source
      await ctx.db.insert("commerceApplications", { ...data, requestId: "legacy-duplicate-request-0001", intentionVersion: undefined })
    })
    const key = { networkId: f.root, idempotencyKey: intent.idempotencyKey }
    expect(await code(f.candidate.as.query(findIntent, key))).toBe("conflict")
    expect(await code(f.candidate.as.mutation(stopIntent, key))).toBe("conflict")
    // Identité forte : ce test atteint le handler de rejeu, sans être bloqué par le budget renforcé du premier clic.
    await f.t.run(async (ctx) => ctx.db.insert("identityLinks", { personId: f.candidate.personId, provider: "idn", subject: "p15-duplicate-strong", loa: 2, linkedAt: NOW }))
    expect(await code(f.candidate.as.mutation(apply, intent))).toBe("conflict")
  })

  it("un ancien rejeu d'un autre réseau ne retourne jamais son identifiant", async () => {
    const f = await fixture(), intent = choice(f, []), { applicationId } = await f.candidate.as.mutation(apply, intent)
    await f.t.run(async (ctx) => {
      const networkId = await ctx.db.insert("networks", { slug: "p15-other-network", kind: "closed", parentId: f.root, name: "Autre réseau", membershipPolicy: "open", defaultVisibility: "network", reachValues: [], theme: "antsia", status: "active", createdAt: NOW, updatedAt: NOW })
      await ctx.db.patch(applicationId, { networkId, intentionVersion: undefined })
    })
    const key = { networkId: f.root, idempotencyKey: intent.idempotencyKey }
    expect(await f.candidate.as.query(findIntent, key)).toEqual({ outcome: "absent" })
    expect(await f.candidate.as.mutation(stopIntent, key)).toEqual({ outcome: "stopped" })
    expect((await row(f, applicationId))?.networkId).not.toBe(f.root)
  })

  it("rejeu legacy de même propriétaire/réseau/boutique : empreinte ancienne admise, même après clôture du poste", async () => {
    const f = await fixture(), intent = choice(f, []), { applicationId } = await f.candidate.as.mutation(apply, intent)
    await f.t.run(async (ctx) => {
      await ctx.db.insert("identityLinks", { personId: f.candidate.personId, provider: "idn", subject: "p15-legacy-strong", loa: 2, linkedAt: NOW })
      await ctx.db.patch(applicationId, { intentionVersion: undefined, intentionSha256: await sha256Hex(canonical({ jobRef: JOB, civilName: { firstName: "Jean-Rémy Éloïse", lastName: "NDONG MBA" }, fileIds: [], textVersion: COMMERCE_JOBS_APPLICATION_CONSENT_VERSION, motivation: intent.motivation })) })
    })
    await published(f, { type: "job.closed", shopRef: SHOP, jobRef: JOB, revision: 2, changedAt: NOW, reason: "closed" })
    expect(await f.candidate.as.mutation(apply, intent)).toEqual({ applicationId, state: "queued" })
  })

  it("preuve expirée : aucun départ depuis cron ; un geste d'une nouvelle session reprend les mêmes octets", async () => {
    const f = await fixture(), { applicationId } = await f.candidate.as.mutation(apply, choice(f, [])), before = await row(f, applicationId)
    vi.setSystemTime(NOW + COMMERCE_COMMAND_LIMITS.authMaxAgeMs + 1)
    const seen = proServer()
    await f.t.action(deliver, { applicationId })
    expect(seen).toHaveLength(0)
    expect(await row(f, applicationId)).toMatchObject({ state: "failed", authorizationRequired: true, rawBody: before?.rawBody, authorizedAt: NOW })
    const sessionId = await createTestSession(f.t, "candidat.recette-fixture"), later = f.t.withIdentity({ subject: "candidat.recette-fixture", sessionId })
    await later.mutation(retry, { networkId: f.root, applicationId })
    await f.t.action(deliver, { applicationId })
    expect(seen[0]?.body).toBe(before?.rawBody)
    expect(await row(f, applicationId)).toMatchObject({ state: "submitted", requestId: before?.requestId, authorizationSessionId: sessionId, authorizedAt: Date.now() })
  })

  it("session révoquée pendant I/O : réponse non appliquée ; le retrait privé reste exécutable", async () => {
    const f = await fixture(), { applicationId } = await f.candidate.as.mutation(apply, choice(f, []))
    const job = await f.t.mutation(claimJob, { applicationId }), config = (await readCommerceLinkConfig())!
    if (!job || job.kind !== "submit") throw new Error("Bail d'envoi attendu")
    expect(await f.t.mutation(authorizeJob, { applicationId, job, configFingerprint: config.fingerprint })).toBe(true)
    await f.t.mutation(components.betterAuth.adapter.deleteOne, { input: { model: "session", where: [{ field: "_id", value: job.sessionId! }] } })
    await f.t.mutation(finishJob, { applicationId, generation: job.generation, attempt: job.attempt, job, delivery: { outcome: "submitted", applicationRef: PRO_APPLICATION, submittedAt: NOW } })
    expect((await row(f, applicationId))?.applicationRef).toBeUndefined()
    expect((await row(f, applicationId))?.authorizationRequired).toBe(true)
    await f.t.run(async (ctx) => revokeJobApplicationsForPerson(ctx, f.candidate.personId))
    const seen = proServer()
    await f.t.action(deliver, { applicationId })
    expect(seen.map((call) => call.path)).toEqual(["/commerce/v1/application-control"])
    expect((await row(f, applicationId))?.state).toBe("withdrawn")
  })

  it("suivi déjà demandé puis preuve expirée : refresh recapture la session réelle et débloque le suivi", async () => {
    const f = await fixture(), { applicationId } = await f.candidate.as.mutation(apply, choice(f, []))
    proServer(); await f.t.action(deliver, { applicationId })
    await f.candidate.as.mutation(refresh, { networkId: f.root, applicationId })
    vi.setSystemTime(NOW + COMMERCE_COMMAND_LIMITS.authMaxAgeMs + 1)
    const seen = proServer()
    await f.t.action(deliver, { applicationId })
    expect(seen).toHaveLength(0)
    expect((await row(f, applicationId))?.statusRequestedAt).toBeDefined()
    await f.candidate.as.mutation(refresh, { networkId: f.root, applicationId })
    await f.t.action(deliver, { applicationId })
    expect((await row(f, applicationId))?.statusRequestedAt).toBeUndefined()
    const status = JSON.parse(String(seen[0]?.body)) as { subject: { authVerifiedAt: number } }
    expect(status.subject.authVerifiedAt).toBe(Date.now())
  })

  it("unknown avant la fin de dérive puis panne : aucune nouvelle clé ; nouvel accord seulement après absence prouvée", async () => {
    const f = await fixture(), { applicationId } = await f.candidate.as.mutation(apply, choice(f, [])), original = (await row(f, applicationId))!
    proServer({ submit: "lost" }); await f.t.action(deliver, { applicationId })
    vi.setSystemTime(original.requestExpiresAt + 1)
    await f.candidate.as.mutation(retry, { networkId: f.root, applicationId })
    proServer({ status: "unknown" }); await f.t.action(deliver, { applicationId })
    expect(await row(f, applicationId)).toMatchObject({ state: "submitting", requestId: original.requestId, rawBody: original.rawBody })
    vi.setSystemTime(original.requestExpiresAt + COMMERCE_MAX_SKEW_MS + 1)
    await f.candidate.as.mutation(retry, { networkId: f.root, applicationId })
    proServer({ status: "unavailable" }); await f.t.action(deliver, { applicationId })
    expect(await row(f, applicationId)).toMatchObject({ state: "submitting", requestId: original.requestId })
    expect((await row(f, applicationId))?.unknownRequestSha256).toBeUndefined()
    await f.candidate.as.mutation(retry, { networkId: f.root, applicationId })
    proServer({ status: "unknown" }); await f.t.action(deliver, { applicationId })
    expect(await row(f, applicationId)).toMatchObject({ state: "failed", lastOutcome: "expired", requestId: original.requestId, unknownRequestSha256: original.requestSha256 })
    expect(await code(f.candidate.as.mutation(retry, { networkId: f.root, applicationId }))).toBe("consentRequired")
  })

  it("un renvoi consomme la preuve d'absence ; sa réponse perdue impose une nouvelle consultation", async () => {
    const f = await fixture(), { applicationId } = await f.candidate.as.mutation(apply, choice(f, []))
    proServer({ submit: "lost" }); await f.t.action(deliver, { applicationId })
    vi.setSystemTime(NOW + 31_000)
    proServer({ status: "unknown" }); await f.t.action(deliver, { applicationId })
    expect((await row(f, applicationId))?.unknownRequestSha256).toBeDefined()
    const job = await f.t.mutation(claimJob, { applicationId }), config = (await readCommerceLinkConfig())!
    if (!job || job.kind !== "submit") throw new Error("Renvoi des mêmes octets attendu")
    expect(await f.t.mutation(authorizeJob, { applicationId, job, configFingerprint: config.fingerprint })).toBe(true)
    expect((await row(f, applicationId))?.unknownRequestSha256).toBeUndefined()
    await f.t.mutation(finishJob, { applicationId, generation: job.generation, attempt: job.attempt, job, delivery: { outcome: "unavailable" } })
    await f.candidate.as.mutation(retry, { networkId: f.root, applicationId })
    const seen = proServer({ status: "unavailable" }); await f.t.action(deliver, { applicationId })
    expect(seen.map((call) => JSON.parse(String(call.body)).command)).toEqual(["request.status"])
    expect((await row(f, applicationId))?.unknownConfirmedAt).toBeUndefined()
  })

  it("renouvellement explicite : une pièce disparue ne peut pas être omise du nouveau corps", async () => {
    const f = await fixture(), file = await pdf(f), { applicationId } = await f.candidate.as.mutation(apply, choice(f, [file.fileId])), original = (await row(f, applicationId))!
    vi.setSystemTime(original.requestExpiresAt + COMMERCE_MAX_SKEW_MS + 1)
    await f.t.run(async (ctx) => {
      await ctx.db.patch(file.fileId, { state: "retired", retiredAt: Date.now() })
      await ctx.db.patch(applicationId, { state: "failed", rawBody: undefined, lastOutcome: "expired", unknownConfirmedAt: Date.now(), unknownRequestSha256: original.requestSha256 })
    })
    expect(await code(f.candidate.as.mutation(retry, { networkId: f.root, applicationId, consentTextVersion: COMMERCE_JOBS_APPLICATION_CONSENT_VERSION }))).toBe("policyRefused")
    expect((await row(f, applicationId))?.requestId).toBe(original.requestId)
    expect(vi.mocked(fetch)).not.toHaveBeenCalled()
  })

  it.each(["retired", "quarantined", "full_scan_missing"] as const)("PDF %s après claim : la porte avant I/O refuse et stored n'écrase pas le retrait", async (change) => {
    const f = await fixture(), file = await pdf(f), { applicationId } = await f.candidate.as.mutation(apply, choice(f, [file.fileId]))
    const seen = proServer(); await f.t.action(deliver, { applicationId })
    const job = await f.t.mutation(claimJob, { applicationId }), config = (await readCommerceLinkConfig())!
    if (!job || job.kind !== "upload") throw new Error("Bail PDF attendu")
    if (change === "retired") await f.candidate.as.mutation(retireFile, { fileId: file.fileId })
    else await f.t.run(async (ctx) => {
      const scan = await ctx.db.query("fileScans").withIndex("by_storageId", (q) => q.eq("storageId", file.storageId)).unique()
      if (!scan) throw new Error("Scan attendu")
      await ctx.db.patch(scan._id, change === "quarantined" ? { status: "infected", av: { provider: "test", verdict: "infected" } } : { requiresFullScan: false })
    })
    expect(await f.t.mutation(authorizeJob, { applicationId, job, configFingerprint: config.fingerprint })).toBe(false)
    await f.t.mutation(finishJob, { applicationId, generation: job.generation, attempt: job.attempt, job, delivery: { outcome: "stored", attachmentRef: job.attachmentRef } })
    expect(seen.filter((call) => call.path === "/commerce/v1/application-files")).toHaveLength(0)
    expect((await row(f, applicationId))?.files[0]?.transfer).not.toBe("stored")
    if (change === "retired") {
      expect((await row(f, applicationId))?.files[0]?.transfer).toBe("revoke_pending")
      expect((await row(f, applicationId))?.nextAttemptAt).toBe(Date.now())
      await f.t.mutation(components.betterAuth.adapter.deleteOne, { input: { model: "session", where: [{ field: "_id", value: job.sessionId! }] } })
      // Le premier réveil du retrait pouvait rencontrer le bail upload ; sa fermeture replanifie la voie privée.
      await f.t.action(deliver, { applicationId })
      expect(seen.filter((call) => call.path === "/commerce/v1/application-control")).toHaveLength(1)
      expect((await row(f, applicationId))?.files[0]?.transfer).toBe("revoked")
    }
  })

  it("export : ni preuve de session, ni bail, ni fence ; legacy sans preuve ne part pas", async () => {
    const f = await fixture(), { applicationId } = await f.candidate.as.mutation(apply, choice(f, [])), saved = (await row(f, applicationId))!
    const projected = exportableRecord("commerceApplications", saved as unknown as DataRecord, f.candidate.personId)
    for (const field of ["authorizationSessionId", "authorizationAuthUserId", "authorizedAt", "authorizationUntil", "leaseSessionId", "unknownRequestSha256"]) expect(projected).not.toHaveProperty(field)
    await f.t.run(async (ctx) => ctx.db.patch(applicationId, { authorizationSessionId: undefined, authorizationAuthUserId: undefined, authorizedAt: undefined, authorizationUntil: undefined }))
    const seen = proServer(); await f.t.action(deliver, { applicationId })
    expect(seen).toHaveLength(0)
    expect((await row(f, applicationId))?.authorizationRequired).toBe(true)
  })
})

// P16 : validation fictive EN TEST pour préserver les scénarios historiques.
// Aucun contournement d'environnement ni activation en source applicative.
vi.mock("./commerceActivation", async (importOriginal) => ({
  ...await importOriginal<typeof import("./commerceActivation")>(),
  commerceActivationReady: () => true,
}))
