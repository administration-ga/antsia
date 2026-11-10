// @vitest-environment edge-runtime
/** MP07b : port de lecture simulé, sessions/mandats/débit réels ; aucune activation commerciale. */
import { engineErrorCode } from "@antsia/social-contracts/errors"
import { COMMERCE_LINK_CONSENT_VERSION } from "@antsia/social-domain/commerce-link"
import { commerceCanonicalJson } from "@antsia/social-domain/commerce/primitives"
import { COMMERCE_PAYMENT_PREPARATION_CONTRACT, COMMERCE_PAYMENT_PREPARATION_PATH, COMMERCE_PAYMENT_PREPARATION_RAILS, commercePaymentPreparationSigningInput, parseCommercePaymentPreparationRequest } from "@antsia/social-domain/commerce-payment-preparation"
import { makeFunctionReference } from "convex/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { api, components, internal } from "../../_generated/api"
import type { Id } from "../../_generated/dataModel"
import { SEED_CONFIRMATION } from "../../seeds/foundations"
import { createTestSession, testConvex } from "../../test.setup"
import { commerceActivationReady } from "./commerceActivation"
import { readCommerceLinkConfig } from "./commerceLinkConfig"
import { base64url, sha256Hex } from "./commerceLinkCrypto"
import type { PaymentPreparationAdmission } from "./paymentPreparation"
import { sendPaymentPreparation } from "./paymentPreparationClient"
import type { PaymentPreparationResult } from "./paymentPreparationRules"

const NOW = Date.UTC(2026, 9, 21, 15), KEY = "payment-preparation-read-fixture-secret-sandbox-only-0123456789"
const SHOP = "pro.ga:structure:01JA00000000000000000000S1", LINK = "pro.ga:commerce_link:01JA00000000000000000000K1"
type Net = { networkId: Id<"networks"> }
const read = makeFunctionReference<"action", Net & { shopId: Id<"shops"> }, PaymentPreparationResult>("modules/shops/paymentPreparationActions:read")
const admit = makeFunctionReference<"mutation", Net & { shopId: Id<"shops">; requestId: string; configFingerprint: string }, PaymentPreparationAdmission | null>("modules/shops/paymentPreparation:admit")
const authorize = makeFunctionReference<"query", Net & { admission: PaymentPreparationAdmission }, boolean>("modules/shops/paymentPreparation:authorize")
const finish = makeFunctionReference<"query", Net & { admission: PaymentPreparationAdmission; rawResponse: string; httpStatus: number }, PaymentPreparationResult>("modules/shops/paymentPreparation:finish")

beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(NOW)
  vi.stubEnv("ANTSIA_COMMERCE_ENVIRONMENT", "sandbox"); vi.stubEnv("ANTSIA_COMMERCE_SOURCE", "antsia")
  vi.stubEnv("ANTSIA_COMMERCE_PRO_HTTP_ORIGIN", "http://localhost:4010"); vi.stubEnv("ANTSIA_COMMERCE_PRO_APP_ORIGIN", "http://localhost:4011")
  vi.stubEnv("ANTSIA_COMMERCE_ORIGIN", "http://localhost:3030"); vi.stubEnv("ANTSIA_COMMERCE_KEY_ID", "payment-preparation-fixture")
  vi.stubEnv("ANTSIA_COMMERCE_SIGNING_KEY", KEY); vi.stubEnv("ANTSIA_COMMERCE_PAYMENT_PREPARATION_ENABLED", "true")
})
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks() })
async function fixture() {
  const t = testConvex(), { root, testClosed } = await t.mutation(internal.seeds.foundations.run, { confirmNonProduction: SEED_CONFIRMATION })
  const owner = t.withIdentity({ subject: "payment-preparation-holder-fixture" }), other = t.withIdentity({ subject: "payment-preparation-other-admin-fixture" })
  const member = async (as: typeof owner, handle: string) => {
    const personId = await as.mutation(api.modules.people.persons.ensureMyPerson, {})
    await as.mutation(api.modules.people.consents.recordConsent, { purpose: "social_profile", origin: "onboarding" })
    await as.mutation(api.modules.people.profile.publishMyProfile, { handle, displayName: "Recette préparation" })
    await as.mutation(api.modules.people.memberships.joinNetwork, { networkId: root }); return personId
  }
  const ownerId = await member(owner, "payment-prep-holder"), otherId = await member(other, "payment-prep-other-admin"), config = (await readCommerceLinkConfig())!
  const rows = await t.run(async ctx => {
    const pageId = await ctx.db.insert("pages", { networkId: root, handle: "payment-preparation-fixture", name: "Activité de recette", ownerKind: "company", trust: "community", trustRank: 1, visibility: "network", onRoot: true, status: "active", createdByPersonId: ownerId, searchText: "activité recette", createdAt: NOW, updatedAt: NOW })
    const signatoryId = await ctx.db.insert("pageSignatories", { networkId: root, pageId, personId: ownerId, role: "admin", acceptedAt: NOW, createdAt: NOW, updatedAt: NOW })
    await ctx.db.insert("pageSignatories", { networkId: root, pageId, personId: otherId, role: "admin", acceptedAt: NOW, createdAt: NOW, updatedAt: NOW })
    const shopId = await ctx.db.insert("shops", { networkId: root, pageId, preparedByPersonId: ownerId, model: "quote_services", storefront: "draft", visibility: "network", createdAt: NOW, updatedAt: NOW })
    const linkId = await ctx.db.insert("shopCommerceLinks", { networkId: root, shopId, pageId, personId: ownerId, state: "active", source: "antsia", environment: "sandbox", configFingerprint: config.fingerprint, subjectRef: `antsia:sub:${"a".repeat(64)}`, antsiaShopRef: `antsia:shop:${"b".repeat(64)}`, shopRef: SHOP, linkRef: LINK, permissions: ["catalog_drafts", "publish_catalog", "receive_inquiries", "receive_bookings", "receive_orders"], consentTextVersion: COMMERCE_LINK_CONSENT_VERSION, consentedAt: NOW, linkedAt: NOW, createdAt: NOW, updatedAt: NOW })
    return { pageId, shopId, linkId, signatoryId }
  })
  return { t, root, testClosed, owner, other, ownerId, otherId, config, ...rows, args: { networkId: root, shopId: rows.shopId } }
}
type Fixture = Awaited<ReturnType<typeof fixture>>
function accepted(raw: string): Record<string, unknown> {
  const request = JSON.parse(raw) as { requestId: string; linkRef: string; shopRef: string; expiresAt: number }
  return { contract: COMMERCE_PAYMENT_PREPARATION_CONTRACT, version: 1, requestId: request.requestId, requestSha256: "", outcome: "accepted", linkRef: request.linkRef, shopRef: request.shopRef, checkedAt: Date.now(), expiresAt: request.expiresAt,
    environment: "sandbox", currency: "XAF", countryScope: { platformCountry: "GA", sellerCountry: null },
    collection: { state: "closed", missing: ["adapter_missing", "beneficiary_not_configured", "policy_not_configured", "collection_disabled"] },
    payout: { state: "closed", missing: ["payout_not_implemented"] },
    beneficiary: { state: "not_configured", label: null }, policy: null,
    rails: COMMERCE_PAYMENT_PREPARATION_RAILS.map(rail => ({ rail, qualified: false, capabilities: { collect: false, lookup: false, refund: false, payout: false }, missing: ["adapter_missing"] })),
    target: "payments",
  }
}
async function reply(raw: string, mutate?: (body: Record<string, unknown>) => void): Promise<string> {
  const body = accepted(raw); body.requestSha256 = await sha256Hex(raw); mutate?.(body)
  return commerceCanonicalJson(body)!
}
function peer(options: { beforeReply?: () => Promise<void>; mutate?: (body: Record<string, unknown>) => void; refusal?: boolean; status?: number; oversized?: boolean; multibyte?: boolean; failed?: boolean; rejectBadSignature?: boolean } = {}) {
  const sent: string[] = [], failures: string[] = []
  const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    try {
      const raw = String(init?.body), headers = new Headers(init?.headers)
      expect(new URL(String(input)).href).toBe(`http://localhost:4010${COMMERCE_PAYMENT_PREPARATION_PATH}`)
      expect(init?.method).toBe("POST"); expect(init?.redirect).toBe("error")
      expect(headers.has("Cookie")).toBe(false); expect(headers.has("Authorization")).toBe(false)
      const parsed = parseCommercePaymentPreparationRequest(raw, { source: "antsia", environment: "sandbox", nowMs: Date.now() })
      expect(parsed.ok).toBe(true)
      const signing = commercePaymentPreparationSigningInput({ bodySha256: await sha256Hex(raw), environment: "sandbox", issuedAtMs: Number(headers.get("X-Pro-Timestamp")), keyId: "payment-preparation-fixture", nonce: headers.get("X-Pro-Nonce")!, operation: "payment.preparation.read", source: "antsia" })
      const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(KEY), { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
      const signature = base64url(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signing!))))
      const authenticated = headers.get("X-Pro-Signature") === signature
      if (!options.rejectBadSignature) expect(authenticated).toBe(true)
      sent.push(raw)
      await options.beforeReply?.()
      if (options.failed) throw new Error("Transport simulé indisponible")
      if (options.oversized) return new Response("x".repeat(16385))
      if (options.multibyte) return new Response("é".repeat(8193))
      let rawResponse = await reply(raw, options.mutate)
      const refusal = options.refusal || !authenticated
      if (refusal) { const request = JSON.parse(raw); rawResponse = commerceCanonicalJson({ contract: COMMERCE_PAYMENT_PREPARATION_CONTRACT, version: 1, requestId: request.requestId, requestSha256: await sha256Hex(raw), outcome: "refused", reason: "access_denied" })! }
      return new Response(rawResponse, { status: options.status ?? (refusal ? 422 : 200) })
    } catch (error) { if (!options.failed) failures.push(String(error)); throw error }
  })
  vi.stubGlobal("fetch", fetcher)
  return { sent, failures, fetcher }
}
async function admission(f: Fixture) {
  const value = await f.owner.mutation(admit, { ...f.args, requestId: "payment-preparation-request-fixture-0001", configFingerprint: f.config.fingerprint })
  if (!value) throw new Error("Lecture du titulaire attendue")
  return value
}

describe("MP07b — préparation privée du titulaire PRO", () => {
  it.each(["", "false"])("reste fermée avec opt-in absent ou faux (%s), même si merchant est ouvert", async flag => {
    const f = await fixture(), p = peer()
    vi.stubEnv("ANTSIA_COMMERCE_PAYMENT_PREPARATION_ENABLED", flag)
    vi.stubEnv("ANTSIA_COMMERCE_MERCHANT_READ_ENABLED", "true")
    expect(await f.owner.action(read, f.args)).toEqual({ outcome: "unavailable" })
    expect(p.sent).toEqual([])
  })

  it("lit la préparation fermée du titulaire, avant publication, sans activer les paiements ni créer d'opération", async () => {
    const f = await fixture(), p = peer()
    expect(commerceActivationReady("payments")).toBe(false)
    vi.stubEnv("ANTSIA_COMMERCE_MERCHANT_READ_ENABLED", "false")
    const linkBefore = await f.t.run(async ctx => ctx.db.get(f.linkId))
    const result = await f.owner.action(read, f.args)
    expect(result).toEqual({ outcome: "ready", proShopRef: SHOP, proAppOrigin: "http://localhost:4011", preparation: {
      environment: "sandbox", currency: "XAF", countryScope: { platformCountry: "GA", sellerCountry: null }, checkedAt: NOW, expiresAt: NOW + 60_000,
      collection: { state: "closed", missing: ["adapter_missing", "beneficiary_not_configured", "policy_not_configured", "collection_disabled"] },
      payout: { state: "closed", missing: ["payout_not_implemented"] }, beneficiary: { state: "not_configured", label: null }, policy: null,
      rails: COMMERCE_PAYMENT_PREPARATION_RAILS.map(rail => ({ rail, qualified: false, capabilities: { collect: false, lookup: false, refund: false, payout: false }, missing: ["adapter_missing"] })), target: "payments",
    } })
    expect(p.sent).toHaveLength(1); expect(p.failures).toEqual([])
    for (const key of ["contract", "requestId", "requestSha256", "subject", "linkRef", "shopRef", "rawBody", "sessionDigest", "configFingerprint", "beneficiaryRef", "accountNumber", "signature", "signingKey"]) {
      expect(result).not.toHaveProperty(key)
      if (result.outcome === "ready") expect(result.preparation).not.toHaveProperty(key)
    }
    expect(await f.t.run(async ctx => ({ policies: await ctx.db.query("shopPaymentPolicies").take(1), options: await ctx.db.query("shopPaymentOptions").take(1), requests: await ctx.db.query("shopPaymentRequests").take(1), payments: await ctx.db.query("shopPaymentAttempts").take(1), checkouts: await ctx.db.query("checkoutAttempts").take(1), services: await ctx.db.query("commerceServiceRequests").take(1), commands: await ctx.db.query("commerceServiceCommands").take(1) }))).toEqual({ policies: [], options: [], requests: [], payments: [], checkouts: [], services: [], commands: [] })
    expect(await f.t.run(async ctx => ctx.db.get(f.linkId))).toEqual(linkBefore)
  })

  it("préserve le constat de politique et le libellé vérifié, avec une cible explicitement absente", async () => {
    const policy = { textVersion: "financial-terms-fixture-v1", revision: 2, platformRevision: 3, mode: "default_90", platformBps: 1000, sellerBps: 9000, accepted: false, acceptanceRevision: null }
    // Un bénéficiaire vérifié suppose un rail qualifié pour la vérification (règle du contrat) ; l'encaissement reste fermé.
    const rails = COMMERCE_PAYMENT_PREPARATION_RAILS.map((rail, index) => index === 0
      ? { rail, qualified: true, capabilities: { collect: false, lookup: true, refund: false, payout: false }, missing: [] }
      : { rail, qualified: false, capabilities: { collect: false, lookup: false, refund: false, payout: false }, missing: ["adapter_missing"] })
    const f = await fixture(), p = peer({ mutate: body => { body.policy = policy; body.beneficiary = { state: "verified", label: "Activité de recette" }; body.target = null; body.countryScope = { platformCountry: "GA", sellerCountry: "GA" }; body.rails = rails } })
    expect(await f.owner.action(read, f.args)).toMatchObject({ outcome: "ready", preparation: { policy, beneficiary: { state: "verified", label: "Activité de recette" }, target: null, collection: { state: "closed" } } })
    expect(p.failures).toEqual([])
  })

  it("un autre administrateur de la même page n'est pas le titulaire de la liaison", async () => {
    const f = await fixture(), p = peer()
    expect(await f.other.action(read, f.args)).toEqual({ outcome: "unavailable" })
    await f.t.run(async ctx => ctx.db.insert("operators", { personId: f.otherId, role: "platform_admin", grantedAt: NOW }))
    expect(await f.other.action(read, f.args)).toEqual({ outcome: "unavailable" })
    expect(p.sent).toEqual([])
  })

  it("un lien historique sans le consentement PRO dédié reste refusé par l'autorité distante", async () => {
    const f = await fixture(), p = peer({ refusal: true })
    expect(await f.owner.action(read, f.args)).toEqual({ outcome: "refused" })
    expect(p.sent).toHaveLength(1); expect(p.failures).toEqual([])
  })

  it.each(["link", "person", "role", "page", "shop", "flag", "config", "source", "environment"])("relit %s à l'arrivée et masque toute ancienne préparation", async gate => {
    const f = await fixture(), p = peer({ beforeReply: async () => {
      if (gate === "link") await f.t.run(async ctx => ctx.db.patch(f.linkId, { state: "revoked" }))
      if (gate === "person") await f.t.run(async ctx => ctx.db.patch(f.linkId, { personId: f.otherId }))
      if (gate === "role") await f.t.run(async ctx => ctx.db.patch(f.signatoryId, { role: "signatory" }))
      if (gate === "page") await f.t.run(async ctx => ctx.db.patch(f.pageId, { status: "inactive" }))
      if (gate === "shop") await f.t.run(async ctx => ctx.db.patch(f.shopId, { storefront: "suspended" }))
      if (gate === "flag") vi.stubEnv("ANTSIA_COMMERCE_PAYMENT_PREPARATION_ENABLED", "false")
      if (gate === "config") vi.stubEnv("ANTSIA_COMMERCE_PRO_APP_ORIGIN", "http://localhost:4012")
      if (gate === "source") await f.t.run(async ctx => ctx.db.patch(f.linkId, { source: "foreign" }))
      if (gate === "environment") await f.t.run(async ctx => ctx.db.patch(f.linkId, { environment: "production" }))
    } })
    expect(await f.owner.action(read, f.args)).toEqual({ outcome: "unavailable" })
    expect(p.sent).toHaveLength(1); expect(p.failures).toEqual([])
  })

  it("une nouvelle session de la même personne ne réadopte pas une réponse de l'ancien bail", async () => {
    const f = await fixture(), before = await admission(f)
    const sessionId = await createTestSession(f.t, "payment-preparation-holder-fixture"), later = f.t.withIdentity({ subject: "payment-preparation-holder-fixture", sessionId })
    expect(await later.query(authorize, { networkId: f.root, admission: before })).toBe(false)
    expect(await later.query(finish, { networkId: f.root, admission: before, rawResponse: await reply(before.rawBody), httpStatus: 200 })).toEqual({ outcome: "unavailable" })
  })

  it("une session révoquée pendant l'appel ne reçoit aucune préparation", async () => {
    const f = await fixture(), identity = await f.owner.run(async ctx => ctx.auth.getUserIdentity())
    const p = peer({ beforeReply: async () => {
      await f.t.mutation(components.betterAuth.adapter.deleteOne, { input: { model: "session", where: [{ field: "_id", value: String(identity!.sessionId) }] } })
    } })
    let error: unknown
    try { await f.owner.action(read, f.args) } catch (caught) { error = caught }
    expect(engineErrorCode(error)).toBe("unauthenticated")
    expect(p.sent).toHaveLength(1); expect(p.failures).toEqual([])
  })

  it.each(["source", "environment", "subject", "structure"])("ferme une liaison non corrélée avant l'I/O : %s", async field => {
    const f = await fixture(), p = peer()
    await f.t.run(async ctx => ctx.db.patch(f.linkId, field === "source" ? { source: "foreign" } : field === "environment" ? { environment: "production" } : field === "subject" ? { subjectRef: "not-a-subject" } : { shopRef: LINK }))
    expect(await f.owner.action(read, f.args)).toEqual({ outcome: "unavailable" })
    expect(p.sent).toEqual([])
  })

  it.each(["hash", "request", "shop", "link", "environment", "private", "beneficiary", "expired", "duplicate", "target", "payout", "collection", "policy"])("refuse les réponses non corrélées ou hors allowlist : %s", async failure => {
    const f = await fixture(), p = peer({ mutate: body => {
      if (failure === "hash") body.requestSha256 = "0".repeat(64)
      if (failure === "request") body.requestId = "other-request-fixture-0001"
      if (failure === "shop") body.shopRef = "pro.ga:structure:01JA00000000000000000000S2"
      if (failure === "link") body.linkRef = "pro.ga:commerce_link:01JA00000000000000000000K2"
      if (failure === "environment") body.environment = "production"
      if (failure === "private") body.accountNumber = "Compte privé interdit"
      if (failure === "beneficiary") body.beneficiary = { state: "verified", label: "Activité de recette", beneficiaryRef: "private-beneficiary-reference" }
      if (failure === "expired") body.expiresAt = NOW - 1
      if (failure === "duplicate") body.rails = Array.from({ length: 4 }, () => ({ rail: "card", qualified: false, capabilities: { collect: false, lookup: false, refund: false, payout: false }, missing: ["adapter_missing"] }))
      if (failure === "target") body.target = "https://foreign.example"
      if (failure === "payout") body.payout = { state: "ready", missing: [] }
      if (failure === "collection") body.collection = { state: "ready", missing: [] }
      if (failure === "policy") body.policy = { textVersion: "financial-fixture-v1", revision: 1, platformRevision: 1, mode: "default_90", platformBps: 1000, sellerBps: 8000, accepted: false, acceptanceRevision: null }
    } })
    expect(await f.owner.action(read, f.args)).toEqual({ outcome: "unavailable" })
    expect(p.sent).toHaveLength(1); expect(p.failures).toEqual([])
  })

  it.each(["oversized", "multibyte", "failed", "redirect", "http"])("ferme le transport borné : %s", async failure => {
    const f = await fixture(), p = peer({ oversized: failure === "oversized", multibyte: failure === "multibyte", failed: failure === "failed", ...(failure === "redirect" ? { status: 302 } : failure === "http" ? { status: 500 } : {}) })
    expect(await f.owner.action(read, f.args)).toEqual({ outcome: "unavailable" })
    expect(p.sent).toHaveLength(1); expect(p.failures).toEqual([])
  })

  it("le pair simulé refuse un HMAC calculé avec une autre clé", async () => {
    const f = await fixture(), value = await admission(f), p = peer({ rejectBadSignature: true })
    const response = await sendPaymentPreparation({ ...f.config, signingKey: "another-fixture-key-not-the-registered-secret" }, value.rawBody, p.fetcher)
    expect(response).not.toBeNull()
    expect(await f.owner.query(finish, { networkId: f.root, admission: value, ...response! })).toEqual({ outcome: "refused" })
    expect(p.sent).toHaveLength(1); expect(p.failures).toEqual([])
  })

  it("interrompt un transport qui dépasse huit secondes", async () => {
    const f = await fixture(), value = await admission(f)
    let started!: () => void
    const waiting = new Promise<void>(resolve => { started = resolve })
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init!.signal!.addEventListener("abort", () => reject(new Error("Délai simulé dépassé")), { once: true })
      started()
    }))
    const response = sendPaymentPreparation(f.config, value.rawBody, fetcher)
    await waiting
    await vi.advanceTimersByTimeAsync(8_001)
    expect(await response).toBeNull()
    expect(fetcher).toHaveBeenCalledOnce()
  })

  it("applique le budget réel de quarante lectures avant tout nouvel envoi", async () => {
    const f = await fixture(), p = peer()
    for (let index = 0; index < 40; index += 1) {
      expect(await f.owner.mutation(admit, { ...f.args, requestId: `payment-preparation-request-${index}`, configFingerprint: f.config.fingerprint })).not.toBeNull()
    }
    let error: unknown
    try { await admission(f) } catch (caught) { error = caught }
    expect(engineErrorCode(error)).toBe("rateLimited")
    expect(p.sent).toEqual([])
  })

  it("une admission expirée et un autre réseau restent fermés", async () => {
    const f = await fixture(), value = await admission(f)
    vi.setSystemTime(NOW + 60_001)
    expect(await f.owner.query(authorize, { networkId: f.root, admission: value })).toBe(false)
    let error: unknown
    try { await f.owner.action(read, { ...f.args, networkId: f.testClosed }) } catch (caught) { error = caught }
    expect(engineErrorCode(error)).toBe("notFound")
  })
})
