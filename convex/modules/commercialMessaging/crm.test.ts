// @vitest-environment edge-runtime
/** P10 : scénarios écrits uniquement ; sessions réelles du harnais, aucun HTTP réel. */
import { engineErrorCode } from "@antsia/social-contracts/errors"
import { parseCommerceCommandRequest, type CommerceCommandRequest } from "@antsia/social-domain/commerce/command"
import { COMMERCE_COMMAND_CONTRACT, commerceCanonicalJson } from "@antsia/social-domain/commerce/primitives"
import { COMMERCE_INQUIRY_CONSENT_VERSION, parseCommerceInquiryWithdrawal } from "@antsia/social-domain/commerce-inquiry"
import { COMMERCE_LINK_CONSENT_VERSION } from "@antsia/social-domain/commerce-link"
import { makeFunctionReference } from "convex/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { api, components, internal } from "../../_generated/api"
import type { Id } from "../../_generated/dataModel"
import { SEED_CONFIRMATION } from "../../seeds/foundations"
import { createTestSession, testConvex } from "../../test.setup"
import { directlyOwned, exportableRecord, type DataRecord } from "../people/dataInventory"
import { readCommerceLinkConfig } from "../shops/commerceLinkConfig"
import { sha256Hex } from "../shops/commerceLinkCrypto"
import type { CrmJob as Job } from "./crmTransport"
import { revokeCommercialCrmForPerson } from "./crm"

type T = ReturnType<typeof testConvex>
type State = "queued" | "submitting" | "submitted" | "withdrawal_pending" | "withdrawn" | "failed"
type Scope = { networkId: Id<"networks">; transferId: Id<"commercialCrmTransfers"> }
type ThreadScope = { networkId: Id<"networks">; threadId: Id<"commercialThreads"> }
// Booléen volontairement plus large pour exercer le refus du validateur literal(true).
type SubmitArgs = ThreadScope & { selectedText: string; displayName?: string; consent: boolean; textVersion: string; idempotencyKey: string }
type Delivery = { outcome: "submitted"; inquiryRef: string; submittedAt: number } | { outcome: "withdrawn" | "unavailable" | "rejected" | "expired" | "unknown" }
const submit = makeFunctionReference<"mutation", SubmitArgs, { state: State; transferId: Id<"commercialCrmTransfers"> }>("modules/commercialMessaging/crm:submitToCrm")
const get = makeFunctionReference<"query", ThreadScope, { state: State | "none"; textVersion: string; selectedText?: string; displayName?: string; consentedAt?: number; revokedAt?: number }>("modules/commercialMessaging/crm:getMyTransfer")
const withdraw = makeFunctionReference<"mutation", ThreadScope, { state: State }>("modules/commercialMessaging/crm:withdrawCrmConsent")
const retry = makeFunctionReference<"mutation", ThreadScope, { state: State }>("modules/commercialMessaging/crm:retryTransfer")
const claim = makeFunctionReference<"mutation", Scope, Job | null>("modules/commercialMessaging/crmTransport:claim")
const finish = makeFunctionReference<"mutation", Scope & { generation: number; attempt: number; job: Job; delivery: Delivery }, null>("modules/commercialMessaging/crmTransport:finish")
const authorize = makeFunctionReference<"mutation", Scope & { job: Job; fingerprint: string }, boolean>("modules/commercialMessaging/crmTransport:authorize")
const deliver = makeFunctionReference<"action", Scope, null>("modules/commercialMessaging/crmTransport:deliver")
const NOW = Date.UTC(2026, 9, 18, 12)
const SELECTED = "Voici le seul texte que je choisis pour PRO.GA."
const PRIVATE_MESSAGE = "AUTRE_MESSAGE_DU_FIL_NE_DOIT_JAMAIS_ETRE_TRANSMIS"
const PRO_INQUIRY = `pro.ga:inquiry:${"2".repeat(26)}`

beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(NOW)
  vi.stubEnv("CONVEX_CLOUD_URL", "http://127.0.0.1:3210")
  vi.stubEnv("ANTSIA_COMMERCE_ENVIRONMENT", "sandbox")
  vi.stubEnv("ANTSIA_COMMERCE_SOURCE", "antsia")
  vi.stubEnv("ANTSIA_COMMERCE_PRO_HTTP_ORIGIN", "https://pro-backend.example.test")
  vi.stubEnv("ANTSIA_COMMERCE_PRO_APP_ORIGIN", "https://pro.example.test")
  vi.stubEnv("ANTSIA_COMMERCE_ORIGIN", "https://antsia.example.test")
  vi.stubEnv("ANTSIA_COMMERCE_KEY_ID", "antsia-crm-test-key")
  vi.stubEnv("ANTSIA_COMMERCE_SIGNING_KEY", "TEST_ONLY_CRM_KEY_not_a_secret_0123456789")
  vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("Transport non préparé dans ce scénario") }))
})
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

async function member(t: T, root: Id<"networks">, handle: string) {
  const auth: unknown = await t.mutation(components.betterAuth.adapter.create, { input: { model: "user", data: {
    name: `Alias ${handle}`, email: `${handle}@crm.example.test`, emailVerified: true, createdAt: NOW, updatedAt: NOW,
  } } })
  if (!auth || typeof auth !== "object" || !("_id" in auth) || typeof auth._id !== "string") throw new Error("Utilisateur Better Auth absent")
  const sessionId = await createTestSession(t, auth._id), as = t.withIdentity({ subject: auth._id, sessionId })
  const personId = await as.mutation(api.modules.people.persons.ensureMyPerson, {})
  await as.mutation(api.modules.people.consents.recordConsent, { purpose: "social_profile", origin: "onboarding" })
  await as.mutation(api.modules.people.profile.publishMyProfile, { handle, displayName: `Alias ${handle}` })
  await as.mutation(api.modules.people.memberships.joinNetwork, { networkId: root })
  return { as, personId, authUserId: auth._id, sessionId }
}

async function fixture() {
  const t = testConvex({ automaticSessions: false })
  const { root, testClosed: child } = await t.mutation(internal.seeds.foundations.run, { confirmNonProduction: SEED_CONFIRMATION })
  const buyer = await member(t, root, "crm.buyer"), seller = await member(t, root, "crm.seller")
  const config = await readCommerceLinkConfig()
  if (!config) throw new Error("Configuration de fixture absente")
  const ids = await t.run(async ctx => {
    const policy = await ctx.db.query("shopNetworkPolicies").withIndex("by_network", q => q.eq("networkId", root)).unique()
    if (policy) await ctx.db.patch(policy._id, { storefront: "review", updatedAt: NOW })
    else await ctx.db.insert("shopNetworkPolicies", { networkId: root, storefront: "review", updatedAt: NOW })
    for (const networkId of [root, child]) {
      const existing = await ctx.db.query("commercialNetworkPolicies").withIndex("by_network", q => q.eq("networkId", networkId)).unique()
      if (existing) await ctx.db.patch(existing._id, { enabled: true, updatedAt: NOW })
      else await ctx.db.insert("commercialNetworkPolicies", { networkId, enabled: true, updatedAt: NOW })
    }
    await ctx.db.insert("networkMemberships", { networkId: child, personId: buyer.personId, status: "declaree", role: "member", joinedAt: NOW, statusChangedAt: NOW })
    const pageId = await ctx.db.insert("pages", { networkId: root, handle: "crm.shop", name: "Atelier CRM", ownerKind: "company", trust: "community", trustRank: 1, visibility: "network", onRoot: true, status: "active", createdByPersonId: seller.personId, searchText: "atelier crm", createdAt: NOW, updatedAt: NOW })
    const signatoryId = await ctx.db.insert("pageSignatories", { networkId: root, pageId, personId: seller.personId, role: "admin", acceptedAt: NOW, createdAt: NOW, updatedAt: NOW })
    const shopId = await ctx.db.insert("shops", { networkId: root, pageId, preparedByPersonId: seller.personId, model: "products", storefront: "published", visibility: "network", publishedAt: NOW, createdAt: NOW, updatedAt: NOW })
    await ctx.db.insert("shopContactSettings", { networkId: root, shopId, acceptRequests: true, updatedAt: NOW, updatedByPersonId: seller.personId })
    const linkId = await ctx.db.insert("shopCommerceLinks", { networkId: root, shopId, pageId, personId: seller.personId, state: "active", source: "antsia", environment: "sandbox", configFingerprint: config.fingerprint,
      subjectRef: `antsia:sub:${"a".repeat(32)}`, antsiaShopRef: `antsia:shop:${"b".repeat(32)}`, shopRef: `pro.ga:structure:${"0".repeat(26)}`, linkRef: `pro.ga:commerce_link:${"1".repeat(26)}`,
      permissions: ["receive_inquiries"], consentTextVersion: COMMERCE_LINK_CONSENT_VERSION, consentedAt: NOW, linkedAt: NOW, createdAt: NOW, updatedAt: NOW })
    const threadId = await ctx.db.insert("commercialThreads", { networkId: root, shopId, requesterPersonId: buyer.personId, conversationRef: `antsia:conv:${"c".repeat(32)}`, state: "accepted", revision: 2, buyerCallsAllowed: false, createdAt: NOW, updatedAt: NOW, lastMessageAt: NOW })
    await ctx.db.insert("commercialMessages", { networkId: root, threadId, senderPersonId: buyer.personId, senderKind: "requester", content: PRIVATE_MESSAGE, idempotencyKey: "private-message-fixture", digest: "a".repeat(64), createdAt: NOW })
    const unknownThread = await ctx.db.insert("commercialThreads", { networkId: root, shopId, requesterPersonId: buyer.personId, conversationRef: `antsia:conv:${"d".repeat(32)}`, state: "accepted", revision: 1, buyerCallsAllowed: false, createdAt: NOW, updatedAt: NOW, lastMessageAt: NOW })
    await ctx.db.delete(unknownThread)
    return { pageId, signatoryId, shopId, linkId, threadId, unknownThread }
  })
  const args = { networkId: root, threadId: ids.threadId }, choice: SubmitArgs = { ...args, selectedText: SELECTED, displayName: "Alias choisi", consent: true, textVersion: COMMERCE_INQUIRY_CONSENT_VERSION, idempotencyKey: "crm-intention-key-0001" }
  return { t, root, child, buyer, seller, args, choice, ...ids }
}
type Fixture = Awaited<ReturnType<typeof fixture>>
async function row(f: Fixture) { return f.t.run(ctx => ctx.db.query("commercialCrmTransfers").withIndex("by_thread", q => q.eq("threadId", f.threadId)).unique()) }
async function created(f: Fixture) { const result = await f.buyer.as.mutation(submit, f.choice); return { networkId: f.root, transferId: result.transferId } }
async function refusal(work: Promise<unknown>) { try { await work; return null } catch (error) { return error } }
function canonical(value: unknown): string { const body = commerceCanonicalJson(value); if (body === null) throw new Error("Fixture JSON invalide"); return body }

describe("P10 — consentement au texte choisi", () => {
  it("ne transfère rien par défaut, puis signe seulement texte, alias et références choisies", async () => {
    const f = await fixture()
    expect(await f.buyer.as.query(get, f.args)).toEqual({ state: "none", textVersion: COMMERCE_INQUIRY_CONSENT_VERSION })
    expect(await row(f)).toBeNull()
    const scope = await created(f), saved = await row(f)
    expect(saved).toMatchObject({ state: "queued", personId: f.buyer.personId, sessionId: f.buyer.sessionId, generation: 1, consentedAt: NOW, selectedText: SELECTED, displayName: "Alias choisi" })
    if (!saved?.rawBody) throw new Error("Corps privé de fixture absent")
    const parsed = parseCommerceCommandRequest(saved.rawBody, { source: "antsia", environment: "sandbox", nowMs: NOW })
    expect(parsed.ok).toBe(true)
    if (!parsed.ok || parsed.value.command !== "inquiry.submit") throw new Error("Demande privée invalide")
    expect(parsed.value.payload).toMatchObject({ message: SELECTED, displayName: "Alias choisi", conversationRef: saved.conversationRef, consent: { purpose: "commerce_inquiry", textVersion: COMMERCE_INQUIRY_CONSENT_VERSION, givenAt: NOW } })
    expect(parsed.value.subject).toMatchObject({ kind: "buyer", ref: saved.subjectRef, authVerifiedAt: NOW })
    expect(saved.subjectRef).not.toBe(`antsia:sub:${"a".repeat(32)}`)
    expect(saved.rawBody).not.toContain(PRIVATE_MESSAGE)
    for (const privateValue of [f.buyer.sessionId, f.buyer.authUserId, String(f.buyer.personId), String(f.shopId)]) expect(saved.rawBody).not.toContain(privateValue)
    const jobs = await f.t.run(ctx => ctx.db.system.query("_scheduled_functions").take(50))
    const deliveries = jobs.filter(job => job.name === "modules/commercialMessaging/crmTransport:deliver")
    expect(deliveries).toHaveLength(1); expect(deliveries[0]!.args).toEqual([scope])
    expect(vi.mocked(fetch)).not.toHaveBeenCalled()
  })

  it.each([
    { consent: false }, { textVersion: "old" }, { selectedText: " " }, { selectedText: "x".repeat(2001) },
    { displayName: "x".repeat(81) }, { displayName: "Alias\nnon confirmé" },
  ])("refuse un consentement ou texte invalide avant toute copie : %j", async change => {
    const f = await fixture()
    expect(await refusal(f.buyer.as.mutation(submit, { ...f.choice, ...change }))).not.toBeNull()
    expect(await row(f)).toBeNull(); expect(vi.mocked(fetch)).not.toHaveBeenCalled()
  })

  it("refuse indistinctement fil inconnu, autre réseau et demande d'un tiers", async () => {
    const f = await fixture()
    for (const args of [{ ...f.choice, threadId: f.unknownThread }, { ...f.choice, networkId: f.child }]) {
      expect(engineErrorCode(await refusal(f.buyer.as.mutation(submit, args)))).toBe("notFound")
    }
    expect(engineErrorCode(await refusal(f.seller.as.mutation(submit, f.choice)))).toBe("notFound")
    expect(engineErrorCode(await refusal(f.buyer.as.query(get, { ...f.args, networkId: f.child })))).toBe("notFound")
    expect(await row(f)).toBeNull()
  })

  it("rejoue la même intention ; changer texte, alias ou clé ne crée aucune deuxième demande", async () => {
    const f = await fixture(), first = await f.buyer.as.mutation(submit, f.choice)
    expect(await f.buyer.as.mutation(submit, f.choice)).toEqual(first)
    for (const changes of [{ selectedText: "Un autre choix" }, { displayName: "Autre alias" }, { idempotencyKey: "crm-other-intention-key" }]) {
      expect(engineErrorCode(await refusal(f.buyer.as.mutation(submit, { ...f.choice, ...changes })))).toBe("policyRefused")
    }
    expect(await f.t.run(ctx => ctx.db.query("commercialCrmTransfers").withIndex("by_person", q => q.eq("personId", f.buyer.personId)).take(5))).toHaveLength(1)
    expect(await row(f)).toMatchObject({ selectedText: SELECTED, generation: 1 })
  })

  it("exporte le choix personnel sans session, corps signés, empreintes ou sujet opaque", async () => {
    const f = await fixture(); await created(f)
    const saved = await row(f)
    if (!saved) throw new Error("Transfert absent")
    const exported = exportableRecord("commercialCrmTransfers", saved as DataRecord, f.buyer.personId)
    expect(exported).toMatchObject({ state: "queued", selectedText: SELECTED, displayName: "Alias choisi", textVersion: COMMERCE_INQUIRY_CONSENT_VERSION, consentedAt: NOW })
    for (const key of ["sessionId", "authorizationAuthUserId", "authorizedAt", "authorizationUntil", "leaseSessionId", "originLinkRef", "originShopRef", "rawBody", "withdrawalBody", "requestId", "requestSha256", "subjectRef", "configFingerprint", "intentionSha256", "idempotencyKey"]) expect(exported).not.toHaveProperty(key)
    expect(JSON.stringify(exported)).not.toContain(PRIVATE_MESSAGE)
    expect(exportableRecord("commercialCrmTransfers", saved as DataRecord, f.seller.personId)).toBeNull()
    expect(directlyOwned("commercialCrmTransfers", saved as DataRecord, f.buyer.personId)).toBe(true)
    const buyerSubject = await f.t.run(ctx => ctx.db.query("shopCommerceBuyerSubjects").withIndex("by_person", q => q.eq("personId", f.buyer.personId)).unique())
    if (!buyerSubject) throw new Error("Sujet acheteur absent")
    expect(exportableRecord("shopCommerceBuyerSubjects", buyerSubject as DataRecord, f.buyer.personId)).toBeNull()
  })
})

describe("P10 — retrait et livraison tardive", () => {
  it("retire avant le premier dispatch : génération avancée, copie vidée, aucun HTTP", async () => {
    const f = await fixture(), scope = await created(f)
    expect(engineErrorCode(await refusal(f.buyer.as.mutation(withdraw, { ...f.args, networkId: f.child })))).toBe("notFound")
    expect(await f.buyer.as.mutation(withdraw, f.args)).toEqual({ state: "withdrawn" })
    expect(await f.buyer.as.mutation(withdraw, f.args)).toEqual({ state: "withdrawn" })
    const saved = await row(f)
    expect(saved).toMatchObject({ state: "withdrawn", revokedAt: NOW, generation: 2, attempts: 0 })
    for (const key of ["rawBody", "selectedText", "displayName", "sessionId", "leaseUntil"]) expect(saved).not.toHaveProperty(key)
    expect(await f.t.mutation(claim, scope)).toBeNull()
    await f.t.action(deliver, scope)
    expect(await f.buyer.as.mutation(retry, f.args)).toEqual({ state: "withdrawn" })
    expect(vi.mocked(fetch)).not.toHaveBeenCalled()
  })

  it("le retrait reste accessible après suspension d'adhésion et révocation vendeur", async () => {
    const f = await fixture(); await created(f)
    await f.t.run(async ctx => {
      const membership = await ctx.db.query("networkMemberships").withIndex("by_network_and_person", q => q.eq("networkId", f.root).eq("personId", f.buyer.personId)).unique()
      if (!membership) throw new Error("Adhésion absente")
      await ctx.db.patch(membership._id, { status: "suspendue" })
      await ctx.db.patch(f.linkId, { state: "revoked", revokedAt: NOW })
    })
    expect(await f.buyer.as.mutation(withdraw, f.args)).toEqual({ state: "withdrawn" })
    expect((await row(f))?.selectedText).toBeUndefined()
    expect(engineErrorCode(await refusal(f.seller.as.mutation(withdraw, f.args)))).toBe("notFound")
  })

  it("ignore la fin d'une ancienne génération après retrait pendant l'envoi", async () => {
    const f = await fixture(), scope = await created(f), first = await f.t.mutation(claim, scope)
    if (!first) throw new Error("Bail de dépôt absent")
    expect(first.kind).toBe("submit")
    expect(await f.t.mutation(authorize, { ...scope, job: first, fingerprint: first.fingerprint })).toBe(true)
    expect(await f.buyer.as.mutation(withdraw, f.args)).toEqual({ state: "withdrawal_pending" })
    await f.t.mutation(finish, { ...scope, generation: first.generation, attempt: first.attempt, job: first, delivery: { outcome: "submitted", inquiryRef: PRO_INQUIRY, submittedAt: NOW } })
    const pending = await row(f)
    expect(pending).toMatchObject({ state: "withdrawal_pending", generation: first.generation + 1 })
    expect(pending?.inquiryRef).toBeUndefined(); expect(pending?.selectedText).toBeUndefined()
    const withdrawal = await f.t.mutation(claim, scope)
    if (!withdrawal) throw new Error("Bail de retrait absent")
    expect(withdrawal.kind).toBe("withdraw")
    const parsed = parseCommerceInquiryWithdrawal(withdrawal.rawBody, { source: "antsia", environment: "sandbox", nowMs: NOW })
    expect(parsed).toMatchObject({ ok: true, value: { submitRequestId: pending?.requestId, submitRequestSha256: pending?.requestSha256, subjectRef: pending?.subjectRef, conversationRef: pending?.conversationRef, revokedAt: NOW } })
    const revoking = await row(f)
    if (!revoking?.withdrawalBody) throw new Error("Corps de retrait absent")
    expect(exportableRecord("commercialCrmTransfers", revoking as DataRecord, f.buyer.personId)).not.toHaveProperty("withdrawalBody")
    await f.t.mutation(finish, { ...scope, generation: withdrawal.generation, attempt: withdrawal.attempt, job: withdrawal, delivery: { outcome: "withdrawn" } })
    expect(await row(f)).toMatchObject({ state: "withdrawn", generation: 2 })
    await f.t.mutation(finish, { ...scope, generation: first.generation, attempt: first.attempt, job: first, delivery: { outcome: "submitted", inquiryRef: PRO_INQUIRY, submittedAt: NOW } })
    expect((await row(f))?.state).toBe("withdrawn")
  })

  it("une session supprimée avant dispatch suspend l'envoi sans inventer une révocation du consentement", async () => {
    const f = await fixture(), scope = await created(f)
    await f.t.mutation(components.betterAuth.adapter.deleteOne, { input: { model: "session", where: [{ field: "_id", value: f.buyer.sessionId }] } })
    expect(await f.t.mutation(claim, scope)).toBeNull()
    expect(await row(f)).toMatchObject({ state: "failed", generation: 1, authorizationRequired: true })
    expect((await row(f))?.rawBody).toBeDefined(); expect((await row(f))?.revokedAt).toBeUndefined(); expect(vi.mocked(fetch)).not.toHaveBeenCalled()
  })

  it("après délai réseau puis expiration, consulte request.status sans fabriquer un nouveau dépôt", async () => {
    const f = await fixture(), scope = await created(f), original = await row(f)
    if (!original?.rawBody) throw new Error("Demande originale absente")
    const commands: CommerceCommandRequest[] = []
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const rawBody = String(init?.body), request = JSON.parse(rawBody) as CommerceCommandRequest
      commands.push(request)
      if (commands.length === 1) throw new Error("Réponse réseau perdue après traitement distant")
      if (request.command !== "request.status") throw new Error("Le timeout ne doit pas recréer une demande")
      const recordedResponse = canonical({ contract: COMMERCE_COMMAND_CONTRACT, version: 1, command: "inquiry.submit", requestId: original.requestId,
        requestSha256: original.requestSha256, respondedAt: NOW, outcome: "accepted", result: { inquiryRef: PRO_INQUIRY, state: "submitted", submittedAt: NOW } })
      return new Response(canonical({ contract: request.contract, version: 1, command: request.command, requestId: request.requestId,
        requestSha256: await sha256Hex(rawBody), respondedAt: Date.now(), outcome: "accepted", result: { targetRequestId: original.requestId,
          state: "completed", current: [], recordedResponse, recordedResponseSha256: await sha256Hex(recordedResponse) } }), { status: 200 })
    })
    vi.stubGlobal("fetch", fetcher)
    await f.t.action(deliver, scope)
    expect(await row(f)).toMatchObject({ state: "queued", requestId: original.requestId, requestSha256: original.requestSha256, rawBody: original.rawBody })
    vi.setSystemTime(original.requestExpiresAt + 1)
    expect(await f.buyer.as.mutation(retry, f.args)).toEqual({ state: "queued" })
    await f.t.action(deliver, scope)
    expect(commands.map(request => request.command)).toEqual(["inquiry.submit", "request.status"])
    const status = commands[1]
    if (status?.command !== "request.status") throw new Error("Demande de statut absente")
    expect(status.payload).toEqual({ targetCommand: "inquiry.submit", targetRequestId: original.requestId, targetRequestSha256: original.requestSha256 })
    expect(await row(f)).toMatchObject({ state: "submitted", inquiryRef: PRO_INQUIRY, submittedAt: NOW, requestId: original.requestId })
    expect((await row(f))?.sessionId).toBeUndefined(); expect((await row(f))?.rawBody).toBeUndefined()
  })
})

describe("P16 — preuve réelle, origine et reprise privée du CRM", () => {
  it("expire la preuve du geste sans l'actualiser par cron ; une nouvelle session reprend les mêmes octets", async () => {
    const f = await fixture(), scope = await created(f), original = await row(f)
    vi.setSystemTime(NOW + 300_001)
    expect(await f.t.mutation(claim, scope)).toBeNull()
    expect(await row(f)).toMatchObject({ state: "failed", authorizationRequired: true, authorizedAt: NOW })
    const sessionId = await createTestSession(f.t, f.buyer.authUserId)
    const resumed = f.t.withIdentity({ subject: f.buyer.authUserId, sessionId })
    await resumed.mutation(retry, f.args)
    const renewed = await row(f)
    expect(renewed).toMatchObject({ sessionId, authorizedAt: Date.now(), requestId: original?.requestId, requestSha256: original?.requestSha256, rawBody: original?.rawBody })
    expect(renewed?.requestExpiresAt).toBe(original?.requestExpiresAt)
    const job = await f.t.mutation(claim, scope)
    if (!job) throw new Error("Bail renouvelé absent")
    // Le geste renouvelle le bail, jamais la preuve signée ni la date du consentement original.
    expect(JSON.parse(job.rawBody).subject.authVerifiedAt).toBe(NOW)
    expect(job.sessionId).toBe(sessionId)
    expect(await f.t.mutation(authorize, { ...scope, job, fingerprint: job.fingerprint })).toBe(true)
    expect(vi.mocked(fetch)).not.toHaveBeenCalled()
  })

  it.each(["before", "after"] as const)("une session révoquée %s I/O ferme le bail et n'applique pas de succès tardif", async stage => {
    const f = await fixture(), scope = await created(f), job = await f.t.mutation(claim, scope)
    if (!job) throw new Error("Bail absent")
    if (stage === "after") expect(await f.t.mutation(authorize, { ...scope, job, fingerprint: job.fingerprint })).toBe(true)
    await f.t.mutation(components.betterAuth.adapter.deleteOne, { input: { model: "session", where: [{ field: "_id", value: f.buyer.sessionId }] } })
    if (stage === "before") expect(await f.t.mutation(authorize, { ...scope, job, fingerprint: job.fingerprint })).toBe(false)
    else await f.t.mutation(finish, { ...scope, generation: job.generation, attempt: job.attempt, job, delivery: { outcome: "submitted", inquiryRef: PRO_INQUIRY, submittedAt: NOW } })
    expect(await row(f)).toMatchObject({ state: "failed", authorizationRequired: true })
    expect((await row(f))?.inquiryRef).toBeUndefined()
    expect(vi.mocked(fetch)).not.toHaveBeenCalled()
  })

  it.each(["linkRef", "shopRef"] as const)("une nouvelle incarnation %s n'hérite pas de l'ancien consentement", async field => {
    const f = await fixture(), scope = await created(f), job = await f.t.mutation(claim, scope)
    if (!job) throw new Error("Bail absent")
    await f.t.run(ctx => ctx.db.patch(f.linkId, field === "linkRef" ? { linkRef: `pro.ga:commerce_link:${"9".repeat(26)}` } : { shopRef: `pro.ga:structure:${"9".repeat(26)}` }))
    expect(await f.t.mutation(authorize, { ...scope, job, fingerprint: job.fingerprint })).toBe(false)
    expect(await row(f)).toMatchObject({ state: "failed", authorizationRequired: true })
    await f.buyer.as.mutation(retry, f.args)
    expect(await f.t.mutation(claim, scope)).toBeNull()
    expect((await row(f))?.dispatchedAt).toBeUndefined()
    expect(vi.mocked(fetch)).not.toHaveBeenCalled()
  })

  it("un changement de liaison pendant I/O ferme le succès tardif ; seule la décision d'origine reste consultable", async () => {
    const f = await fixture(), scope = await created(f), job = await f.t.mutation(claim, scope)
    if (!job) throw new Error("Bail absent")
    expect(await f.t.mutation(authorize, { ...scope, job, fingerprint: job.fingerprint })).toBe(true)
    await f.t.run(ctx => ctx.db.patch(f.linkId, { state: "revoked", revokedAt: NOW }))
    await f.t.mutation(finish, { ...scope, generation: job.generation, attempt: job.attempt, job, delivery: { outcome: "submitted", inquiryRef: PRO_INQUIRY, submittedAt: NOW } })
    expect(await row(f)).toMatchObject({ state: "failed", authorizationRequired: true })
    expect((await row(f))?.inquiryRef).toBeUndefined()
    await f.buyer.as.mutation(retry, f.args)
    expect((await f.t.mutation(claim, scope))?.kind).toBe("status")
  })

  it("une ligne historique sans preuve d'origine ne peut que consulter sa décision après un geste propriétaire", async () => {
    const f = await fixture(), scope = await created(f), original = await row(f)
    await f.t.run(ctx => ctx.db.patch(scope.transferId, { originLinkRef: undefined, originShopRef: undefined, authorizationAuthUserId: undefined, authorizedAt: undefined, authorizationUntil: undefined }))
    expect(await f.t.mutation(claim, scope)).toBeNull()
    await f.buyer.as.mutation(retry, f.args)
    const lookup = await f.t.mutation(claim, scope)
    if (!lookup) throw new Error("Consultation historique absente")
    expect(lookup.kind).toBe("status")
    const request = parseCommerceCommandRequest(lookup.rawBody, { source: "antsia", environment: "sandbox", nowMs: NOW })
    expect(request).toMatchObject({ ok: true, value: { command: "request.status", subject: { ref: original?.subjectRef, authVerifiedAt: NOW }, payload: { targetRequestId: original?.requestId, targetRequestSha256: original?.requestSha256 } } })
    await f.t.mutation(finish, { ...scope, generation: lookup.generation, attempt: lookup.attempt, job: lookup, delivery: { outcome: "unknown" } })
    const saved = await row(f)
    if (!saved) throw new Error("Transfert absent")
    vi.setSystemTime(saved.nextAttemptAt)
    expect((await f.t.mutation(claim, scope))?.kind).toBe("status")
    expect(vi.mocked(fetch)).not.toHaveBeenCalled()
  })

  it("consomme l'absence corrélée avant un renvoi ; un nouveau timeout exige un autre lookup", async () => {
    const f = await fixture(), scope = await created(f), first = await f.t.mutation(claim, scope)
    if (!first) throw new Error("Premier bail absent")
    await f.t.mutation(authorize, { ...scope, job: first, fingerprint: first.fingerprint })
    await f.t.mutation(finish, { ...scope, generation: first.generation, attempt: first.attempt, job: first, delivery: { outcome: "unavailable" } })
    await f.buyer.as.mutation(retry, f.args)
    const lookup = await f.t.mutation(claim, scope)
    if (!lookup) throw new Error("Lookup absent")
    expect(lookup.kind).toBe("status")
    await f.t.mutation(finish, { ...scope, generation: lookup.generation, attempt: lookup.attempt, job: lookup, delivery: { outcome: "unknown" } })
    expect((await row(f))?.unknownRequestSha256).toBeDefined()
    const resend = await f.t.mutation(claim, scope)
    if (!resend) throw new Error("Renvoi identique absent")
    expect(resend.kind).toBe("submit"); expect(resend.rawBody).toBe(first.rawBody)
    await f.t.mutation(authorize, { ...scope, job: resend, fingerprint: resend.fingerprint })
    expect((await row(f))?.unknownConfirmedAt).toBeUndefined()
    expect((await row(f))?.unknownRequestSha256).toBeUndefined()
    await f.t.mutation(finish, { ...scope, generation: resend.generation, attempt: resend.attempt, job: resend, delivery: { outcome: "unavailable" } })
    await f.buyer.as.mutation(retry, f.args)
    expect((await f.t.mutation(claim, scope))?.kind).toBe("status")
  })

  it("après huit échecs, le retrait reste dû et l'effacement attend un véritable ACK, même sans session ni liaison", async () => {
    const f = await fixture(), scope = await created(f), first = await f.t.mutation(claim, scope)
    if (!first) throw new Error("Bail absent")
    await f.t.mutation(authorize, { ...scope, job: first, fingerprint: first.fingerprint })
    await f.buyer.as.mutation(withdraw, f.args)
    await f.t.run(async ctx => {
      await ctx.db.patch(f.linkId, { state: "revoked", revokedAt: NOW })
      await ctx.db.patch(scope.transferId, { attempts: 7 })
    })
    await f.t.mutation(components.betterAuth.adapter.deleteOne, { input: { model: "session", where: [{ field: "_id", value: f.buyer.sessionId }] } })
    const last = await f.t.mutation(claim, scope)
    if (!last) throw new Error("Retrait privé absent")
    expect(last.kind).toBe("withdraw"); expect(last.attempt).toBe(8)
    expect(await f.t.mutation(authorize, { ...scope, job: last, fingerprint: last.fingerprint })).toBe(true)
    await f.t.mutation(finish, { ...scope, generation: last.generation, attempt: last.attempt, job: last, delivery: { outcome: "unavailable" } })
    const pending = await row(f)
    expect(pending).toMatchObject({ state: "withdrawal_pending", withdrawalNeedsAttention: true, attempts: 0, withdrawalFailures: 1 })
    expect(pending?.requestId).toBeDefined(); expect(pending?.requestSha256).toBeDefined(); expect(pending?.subjectRef).toBeDefined()
    expect(pending?.nextAttemptAt).toBeGreaterThan(NOW)
    expect(pending?.nextAttemptAt).toBeLessThan(Number.MAX_SAFE_INTEGER)
    expect(await f.t.run(ctx => revokeCommercialCrmForPerson(ctx, f.buyer.personId))).toBe(false)
    if (!pending) throw new Error("Retrait absent")
    vi.setSystemTime(pending.nextAttemptAt)
    const resumed = await f.t.mutation(claim, scope)
    if (!resumed) throw new Error("Retrait non repris")
    expect(resumed.kind).toBe("withdraw")
    await f.t.mutation(finish, { ...scope, generation: resumed.generation, attempt: resumed.attempt, job: resumed, delivery: { outcome: "withdrawn" } })
    expect((await row(f))?.state).toBe("withdrawn")
    expect(await f.t.run(ctx => revokeCommercialCrmForPerson(ctx, f.buyer.personId))).toBe(true)
    const saved = await row(f)
    for (const key of ["sessionId", "authorizationAuthUserId", "authorizedAt", "authorizationUntil", "leaseSessionId", "originLinkRef", "originShopRef", "rawBody", "selectedText", "withdrawalBody"]) expect(saved).not.toHaveProperty(key)
  })

  it("une ancienne révocation bloquée à IDLE est remise en attente, sans prétendre l'avoir confirmée", async () => {
    const f = await fixture(), scope = await created(f)
    await f.t.run(ctx => ctx.db.patch(scope.transferId, { state: "failed", revokedAt: NOW, dispatchedAt: NOW, attempts: 8, nextAttemptAt: Number.MAX_SAFE_INTEGER }))
    expect(await f.buyer.as.mutation(withdraw, f.args)).toEqual({ state: "withdrawal_pending" })
    expect(await row(f)).toMatchObject({ state: "withdrawal_pending", withdrawalNeedsAttention: true, attempts: 0, nextAttemptAt: NOW })
    expect((await f.t.mutation(claim, scope))?.kind).toBe("withdraw")
  })
})
