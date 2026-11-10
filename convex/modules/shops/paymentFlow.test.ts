// @vitest-environment edge-runtime
/** P12 : scénarios sources uniquement ; aucune exécution pendant cette reprise. */
import { type CommerceCommandRequest } from "@antsia/social-domain/commerce/command"
import { COMMERCE_COMMAND_CONTRACT, COMMERCE_PUBLIC_CONTRACT, commerceCanonicalJson } from "@antsia/social-domain/commerce/primitives"
import { commercePublicEffect, type CommerceOfferEvent, type CommercePublicEvent, type CommerceShopEvent } from "@antsia/social-domain/commerce/projection"
import { COMMERCE_CHECKOUT_CONSENT_VERSION, COMMERCE_CHECKOUT_CONTROL_CONTRACT, type CommerceCheckoutControlRequest } from "@antsia/social-domain/commerce-checkout"
import { COMMERCE_LINK_CONSENT_VERSION } from "@antsia/social-domain/commerce-link"
import { COMMERCE_PAYMENT_CONSENT_VERSION, COMMERCE_PAYMENT_CONTROL_CONTRACT, type CommercePaymentControlRequest, type CommercePaymentControlState, type CommercePaymentOptions } from "@antsia/social-domain/commerce-payment"
import { federationSigningText } from "@antsia/social-domain/federationProtocol"
import { makeFunctionReference } from "convex/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { api, components, internal } from "../../_generated/api"
import type { Id } from "../../_generated/dataModel"
import { SEED_CONFIRMATION } from "../../seeds/foundations"
import { createTestOperatorProof, createTestSession, testConvex } from "../../test.setup"
import { revokePaymentDataForPerson } from "../people/erasure"
import type { CheckoutActionResult } from "./checkoutRules"
import { readCommerceLinkConfig } from "./commerceLinkConfig"
import { sha256Hex } from "./commerceLinkCrypto"
import type { PaymentDelivery } from "./paymentFlow"
import type { PaymentActionResult, PaymentAttempt, PaymentContext, PaymentOptionsResult } from "./paymentRules"
import { SHOP_PUBLIC_LISTING_TEXT_VERSION } from "./rules"

const NOW = Date.UTC(2026, 9, 18, 12)
const BUYER = "payment-buyer-fixture"
const SHOP = "pro.ga:structure:01JA00000000000000000000S1"
const OFFER = "pro.ga:offer:01JA00000000000000000000P1"
const LINK = "pro.ga:commerce_link:01JA00000000000000000000K1"
const COLLECTION = "pro.ga:offer_collection:01JA00000000000000000000C1"
const CHECKOUT = "pro.ga:checkout:01JA00000000000000000000H1"
const ESTABLISHMENT = "pro.ga:establishment:01JA00000000000000000000E1"
const PAYMENT = "pro.ga:payment_intent:01JA00000000000000000000Y1"
const ORDER = "pro.ga:order:01JA00000000000000000000D1"
const READINESS = "c".repeat(64)
const KEY_NAME = "ANTSIA_FEDERATION_CATALOG_TEST_KEY"
const KEY = "payment-test-secret-key-sandbox-0123456789"
const amount = { amount: 12_000, currency: "XAF" as const }
type Net = { networkId: Id<"networks"> }
type Lease = { requestId: string; leaseToken: string; configFingerprint: string }
type StartInput = { checkoutAttemptId: string; expectedTotal: typeof amount; consentTextVersion: string; readinessRef: string; clientRequestId: string }
type Admission = PaymentDelivery | PaymentActionResult
type Operation = { paymentAttemptId: string; operation: "status" | "retry" | "refund_request"; expectedRevision?: number; reason?: "changed_mind" | "duplicate_payment" | "late_payment" | "other"; clientRequestId?: string }
const catalogPolicy = makeFunctionReference<"mutation", Net & { enabled: boolean; reason: string }, null>("modules/shops/catalogControl:setPolicy")
const catalogMapping = makeFunctionReference<"mutation", Net & { shopId: Id<"shops">; emitterId: Id<"federationEmitters">; enabled: boolean; reason: string }, null>("modules/shops/catalogControl:configureMapping")
const prepareCheckout = makeFunctionReference<"action", Net & { handle: string; lines: { offerRef: string; quantity: number; expectedCatalogRevision: number; expectedUnitAmount: typeof amount }[]; fulfillment: { mode: "pickup"; establishmentRef: string }; expectedPolicyVersion: number; consentTextVersion: string; clientRequestId: string }, CheckoutActionResult>("modules/shops/checkoutActions:prepare")
const options = makeFunctionReference<"action", Net & { checkoutAttemptId: string }, PaymentOptionsResult>("modules/shops/paymentActions:options")
const start = makeFunctionReference<"action", Net & StartInput, PaymentActionResult>("modules/shops/paymentActions:start")
const status = makeFunctionReference<"action", Net & { paymentAttemptId: string }, PaymentActionResult>("modules/shops/paymentActions:status")
const retry = makeFunctionReference<"action", Net & { paymentAttemptId: string }, PaymentActionResult>("modules/shops/paymentActions:retry")
const get = makeFunctionReference<"query", Net & { paymentAttemptId: string }, PaymentAttempt | null>("modules/shops/payment:getAttempt")
const context = makeFunctionReference<"query", Net & { checkoutAttemptId: string }, PaymentContext | null>("modules/shops/payment:context")
const beginOptions = makeFunctionReference<"mutation", Net & Lease & { checkoutAttemptId: string }, PaymentDelivery | null>("modules/shops/paymentFlow:beginOptions")
const createStart = makeFunctionReference<"mutation", Net & Lease & StartInput & { paymentAttemptId: string; authorizationRequestId: string }, Admission>("modules/shops/paymentFlow:createStart")
const beginOperation = makeFunctionReference<"mutation", Net & Lease & Operation, PaymentDelivery | null>("modules/shops/paymentFlow:beginOperation")
const authorize = makeFunctionReference<"mutation", Net & { delivery: PaymentDelivery; configFingerprint: string }, boolean>("modules/shops/paymentFlow:authorize")
const finishOptions = makeFunctionReference<"mutation", Net & { delivery: PaymentDelivery; rawResponse?: string }, PaymentOptionsResult>("modules/shops/paymentFlow:finishOptions")
const finish = makeFunctionReference<"mutation", Net & { delivery: PaymentDelivery; rawResponse?: string; httpStatus?: number }, Admission>("modules/shops/paymentFlow:finish")
let sequence = 0

beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(NOW); sequence = 0
  vi.stubEnv("CONVEX_CLOUD_URL", "http://127.0.0.1:3210")
  vi.stubEnv("FEDERATION_ENVIRONMENT", "sandbox"); vi.stubEnv(KEY_NAME, KEY)
  vi.stubEnv("ANTSIA_COMMERCE_ENVIRONMENT", "sandbox"); vi.stubEnv("ANTSIA_COMMERCE_SOURCE", "antsia")
  vi.stubEnv("ANTSIA_COMMERCE_PRO_HTTP_ORIGIN", "http://localhost:4010")
  vi.stubEnv("ANTSIA_COMMERCE_PRO_APP_ORIGIN", "http://localhost:4011")
  vi.stubEnv("ANTSIA_COMMERCE_ORIGIN", "http://localhost:3030")
  vi.stubEnv("ANTSIA_COMMERCE_KEY_ID", "antsia-payment-test"); vi.stubEnv("ANTSIA_COMMERCE_SIGNING_KEY", KEY)
  vi.stubEnv("ANTSIA_COMMERCE_PAYMENT_REDIRECT_ORIGINS", "https://provider.example.test")
  vi.stubEnv("FILE_GUARD", "off")
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks() })

function json(value: unknown): string {
  const raw = commerceCanonicalJson(value)
  if (!raw) throw new Error("Corps canonique de fixture invalide")
  return raw
}
async function commandReply(raw: string, result: unknown): Promise<string> {
  const request = JSON.parse(raw) as CommerceCommandRequest
  return json({ contract: COMMERCE_COMMAND_CONTRACT, version: 1, command: request.command, requestId: request.requestId, requestSha256: await sha256Hex(raw), respondedAt: Date.now(), outcome: "accepted", result })
}
async function controlReply(raw: string, result: unknown, patch: Record<string, unknown> = {}): Promise<string> {
  const request = JSON.parse(raw) as CommercePaymentControlRequest
  return json({ contract: COMMERCE_PAYMENT_CONTROL_CONTRACT, version: 1, requestId: request.requestId, requestSha256: await sha256Hex(raw), outcome: "accepted", result, ...patch })
}
function paymentOptions(patch: Partial<CommercePaymentOptions> = {}): CommercePaymentOptions {
  return { checkoutRef: CHECKOUT, available: true, reason: null, amount, expiresAt: NOW + 900_000, providerLabel: "Prestataire de recette", beneficiaryLabel: "Bénéficiaire affiché", modes: ["mobile_money"], consentTextVersion: COMMERCE_PAYMENT_CONSENT_VERSION, readinessRef: READINESS, readinessExpiresAt: Date.now() + 60_000, ...patch }
}
function paymentState(patch: Partial<CommercePaymentControlState> = {}): CommercePaymentControlState {
  return { checkoutRef: CHECKOUT, paymentRef: PAYMENT, orderRef: ORDER, paymentState: "pending", orderState: "pending", stockState: "held", refundState: "none", reviewRequired: false, revision: 1, updatedAt: Date.now(), amount, action: { kind: "await_provider_confirmation" }, ...patch }
}
function startResult(patch: Record<string, unknown> = {}) {
  return { checkoutRef: CHECKOUT, paymentRef: PAYMENT, orderRef: ORDER, state: "pending", amount, action: { kind: "await_provider_confirmation" }, ...patch }
}

/** Même parcours catalogue/P11 que checkout.test.ts, avec session Better Auth explicite. */
async function fixture() {
  const t = testConvex({ automaticSessions: false })
  const { root, testClosed } = await t.mutation(internal.seeds.foundations.run, { confirmNonProduction: SEED_CONFIRMATION })
  const sessionId = await createTestSession(t, BUYER)
  const as = t.withIdentity({ subject: BUYER, sessionId })
  const personId = await as.mutation(api.modules.people.persons.ensureMyPerson, {})
  await as.mutation(api.modules.people.consents.recordConsent, { purpose: "social_profile", origin: "onboarding" })
  await as.mutation(api.modules.people.profile.publishMyProfile, { handle: "payment-buyer", displayName: "Acheteur" })
  await as.mutation(api.modules.people.memberships.joinNetwork, { networkId: root })
  await t.run(ctx => ctx.db.insert("operators", { personId, role: "platform_admin", grantedAt: NOW }))
  await createTestOperatorProof(t, as, personId)
  const config = await readCommerceLinkConfig()
  if (!config) throw new Error("Configuration de fixture absente")
  const owned = await t.run(async ctx => {
    const pageId = await ctx.db.insert("pages", { networkId: root, handle: "payment-shop", name: "Boutique de recette", description: "Activité de recette", ownerKind: "company", trust: "community", trustRank: 1, visibility: "network", onRoot: true, status: "active", createdByPersonId: personId, searchText: "boutique recette", createdAt: NOW, updatedAt: NOW })
    const shopId = await ctx.db.insert("shops", { networkId: root, pageId, preparedByPersonId: personId, model: "products", storefront: "published", visibility: "network", publicConsentAt: NOW, publicConsentTextVersion: SHOP_PUBLIC_LISTING_TEXT_VERSION, publicConsentByPersonId: personId, publishedAt: NOW, createdAt: NOW, updatedAt: NOW })
    await ctx.db.insert("pageSignatories", { networkId: root, pageId, personId, role: "admin", acceptedAt: NOW, createdAt: NOW, updatedAt: NOW })
    const linkId = await ctx.db.insert("shopCommerceLinks", { networkId: root, shopId, pageId, personId, state: "active", source: "antsia", environment: "sandbox", configFingerprint: config.fingerprint, subjectRef: `antsia:sub:${"a".repeat(32)}`, antsiaShopRef: `antsia:shop:${"b".repeat(32)}`, shopRef: SHOP, linkRef: LINK, permissions: ["publish_catalog", "receive_orders"], consentTextVersion: COMMERCE_LINK_CONSENT_VERSION, consentedAt: NOW, linkedAt: NOW, createdAt: NOW, updatedAt: NOW })
    await ctx.db.insert("shopNetworkPolicies", { networkId: root, storefront: "review", updatedAt: NOW })
    await ctx.db.insert("moderationPolicies", { networkId: root, surface: "commerceOffer", preReview: false, maxLinks: 20, maxWrites: 100, windowMs: 60_000, updatedAt: NOW })
    await ctx.db.insert("shopCheckoutPolicies", { networkId: root, enabled: true, updatedAt: NOW })
    const paymentPolicyId = await ctx.db.insert("shopPaymentPolicies", { networkId: root, enabled: true, updatedAt: NOW })
    return { pageId, shopId, linkId, paymentPolicyId }
  })
  const emitterId = await as.mutation(api.modules.federation.emitters.configure, { networkId: root, slug: "pro-payment-test", environment: "sandbox", enabled: true, keyEnvName: KEY_NAME, allowedContracts: [COMMERCE_PUBLIC_CONTRACT], reason: "Émetteur fictif pour les scénarios de paiement" })
  await as.mutation(catalogPolicy, { networkId: root, enabled: true, reason: "Politique fictive du catalogue de recette" })
  await as.mutation(catalogMapping, { networkId: root, shopId: owned.shopId, emitterId, enabled: true, reason: "Mapping fictif pour les scénarios de paiement" })
  const base = { t, as, root, testClosed, personId, sessionId, config, ...owned }
  const shopEvent: CommerceShopEvent = { type: "shop.published", shopRef: SHOP, linkRef: LINK, revision: 1, changedAt: NOW, commercialName: "Activité", country: "GA", currency: "XAF", sellerVerification: "unverified", capabilities: ["catalog"], collections: [{ collectionRef: COLLECTION, label: "Collection", position: 0 }] }
  const offerEvent: CommerceOfferEvent = { type: "offer.published", shopRef: SHOP, offerRef: OFFER, revision: 1, changedAt: NOW, kind: "product", title: "Article de recette", description: "Description publique du produit de recette.", collectionRefs: [COLLECTION], tags: ["recette"], price: { mode: "fixed", currency: "XAF", amount: 12_000 }, showsAvailability: true, variants: [], variantAxes: [], media: [] }
  for (const payload of [shopEvent, offerEvent] satisfies CommercePublicEvent[]) {
    const raw = json({ contract: COMMERCE_PUBLIC_CONTRACT, version: 1, eventId: `payment-catalog-${++sequence}`, objectRef: commercePublicEffect(payload).objectRef, payload })
    const timestamp = String(Math.floor(Date.now() / 1000))
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(KEY), { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
    const signed = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(federationSigningText("sandbox", timestamp, raw)))
    const signature = Array.from(new Uint8Array(signed), byte => byte.toString(16).padStart(2, "0")).join("")
    const response = await t.fetch("/federation/inbox", { method: "POST", body: raw, headers: { "x-antsia-emitter": "pro-payment-test", "x-antsia-environment": "sandbox", "x-antsia-timestamp": timestamp, "x-antsia-signature": signature } })
    expect(response.status).toBe(202)
    expect(await response.json()).toMatchObject({ applicationStatus: "applied" })
  }
  // HTTP P11 simulé en mémoire : le hold est produit par l'action réelle.
  vi.stubGlobal("fetch", vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    const raw = String(init?.body), request = JSON.parse(raw) as CommerceCheckoutControlRequest | CommerceCommandRequest
    if ("operation" in request && request.operation === "options") return new Response(json({ contract: COMMERCE_CHECKOUT_CONTROL_CONTRACT, version: 1, requestId: request.requestId, requestSha256: await sha256Hex(raw), outcome: "accepted", result: { shopRef: SHOP, policyVersion: 1, pickup: [{ establishmentRef: ESTABLISHMENT, label: "Point de retrait" }], fees: [], sellerDelivery: null } }), { status: 200 })
    if (!("command" in request) || request.command !== "checkout.prepare") throw new Error("Commande P11 inattendue")
    return new Response(await commandReply(raw, { checkoutRef: CHECKOUT, state: "held", expiresAt: NOW + 900_000, fees: [], lines: request.payload.lines.map(line => ({ offerRef: line.offerRef, quantity: line.quantity, catalogRevision: line.expectedCatalogRevision, label: "Article", unitAmount: line.expectedUnitAmount, lineAmount: amount })), total: amount }), { status: 200 })
  }))
  const prepared = await as.action(prepareCheckout, { networkId: root, handle: "payment-shop", lines: [{ offerRef: OFFER, quantity: 1, expectedCatalogRevision: 1, expectedUnitAmount: amount }], fulfillment: { mode: "pickup", establishmentRef: ESTABLISHMENT }, expectedPolicyVersion: 1, consentTextVersion: COMMERCE_CHECKOUT_CONSENT_VERSION, clientRequestId: "payment-checkout-client-0001" })
  if (prepared.outcome !== "attempt") throw new Error("Préparation P11 absente")
  return { ...base, checkoutAttemptId: prepared.attemptId }
}
type Fixture = Awaited<ReturnType<typeof fixture>>
function intent(f: Fixture, patch: Partial<StartInput> = {}): Net & StartInput {
  return { networkId: f.root, checkoutAttemptId: f.checkoutAttemptId, expectedTotal: amount, consentTextVersion: COMMERCE_PAYMENT_CONSENT_VERSION, readinessRef: READINESS, clientRequestId: "payment-client-0001", ...patch }
}
function lease(f: Fixture): Lease {
  return { requestId: `payment-request-${++sequence}`, leaseToken: `lease_${String(sequence).padStart(40, "0")}`, configFingerprint: f.config.fingerprint }
}
async function row(f: Fixture, paymentAttemptId: string) {
  return await f.t.run(ctx => ctx.db.query("shopPaymentAttempts").withIndex("by_attempt", q => q.eq("paymentAttemptId", paymentAttemptId)).unique())
}
async function cacheOptions(f: Fixture, patch: Partial<CommercePaymentOptions> = {}) {
  const delivery = await f.as.mutation(beginOptions, { networkId: f.root, ...lease(f), checkoutAttemptId: f.checkoutAttemptId })
  if (!delivery) throw new Error("Bail options absent")
  expect(await f.as.mutation(authorize, { networkId: f.root, delivery, configFingerprint: f.config.fingerprint })).toBe(true)
  return await f.as.mutation(finishOptions, { networkId: f.root, delivery, rawResponse: await controlReply(delivery.rawBody, paymentOptions(patch)) })
}
async function admit(f: Fixture, patch: Partial<StartInput> = {}) {
  const delivery = await f.as.mutation(createStart, { ...intent(f, patch), ...lease(f), paymentAttemptId: `payment-attempt-${++sequence}`, authorizationRequestId: `payment-authorization-${++sequence}` })
  if (!("kind" in delivery)) throw new Error("Bail d'autorisation absent")
  return delivery
}
async function authorizeStart(f: Fixture, delivery: PaymentDelivery) {
  const request = JSON.parse(delivery.rawBody) as Extract<CommercePaymentControlRequest, { operation: "authorize_start" }>
  expect(await f.as.mutation(authorize, { networkId: f.root, delivery, configFingerprint: f.config.fingerprint })).toBe(true)
  const result = await f.as.mutation(finish, { networkId: f.root, delivery, rawResponse: await controlReply(delivery.rawBody, { ...request.payload, authorized: true, expiresAt: Date.now() + 60_000 }) })
  if (!("kind" in result) || result.kind !== "start") throw new Error("Commande liée à l'autorisation absente")
  return result
}

/** Aucun réseau réel : toutes les réponses PRO/fournisseur restent dans ce faux transport. */
function peer() {
  const sent: { path: string; raw: string }[] = []
  let timeout = false, forget = true, recorded: string | null = null
  let currentState = paymentState(), optionsPatch: Partial<CommercePaymentOptions> = {}, authorizationPatch: Record<string, unknown> = {}
  let responsePatch: Record<string, unknown> = {}
  let beforeStart: (() => Promise<void>) | undefined
  const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(input)).pathname, raw = String(init?.body)
    sent.push({ path, raw })
    const request = JSON.parse(raw) as CommercePaymentControlRequest | CommerceCommandRequest
    if ("operation" in request) {
      const result = request.operation === "options" ? paymentOptions(optionsPatch) : request.operation === "authorize_start" ? { ...request.payload, authorized: true, expiresAt: Date.now() + 60_000, ...authorizationPatch } : currentState
      return new Response(await controlReply(raw, result, responsePatch), { status: 200 })
    }
    if (request.command === "request.status") return new Response(await commandReply(raw, { targetRequestId: request.payload.targetRequestId, state: recorded && !forget ? "completed" : "unknown", current: [], ...(recorded && !forget ? { recordedResponse: recorded, recordedResponseSha256: await sha256Hex(recorded) } : {}) }), { status: 200 })
    if (request.command !== "payment.start") throw new Error("Commande paiement inattendue")
    recorded = await commandReply(raw, startResult())
    if (beforeStart) await beforeStart()
    if (timeout) throw new Error("Réponse perdue simulée")
    return new Response(recorded, { status: 200 })
  })
  vi.stubGlobal("fetch", fetcher)
  return { sent, fetcher, setTimeout: (value: boolean) => { timeout = value }, setForget: (value: boolean) => { forget = value }, setState: (patch: Partial<CommercePaymentControlState>) => { currentState = paymentState(patch) }, setOptions: (patch: Partial<CommercePaymentOptions>) => { optionsPatch = patch }, setAuthorization: (patch: Record<string, unknown>) => { authorizationPatch = patch }, setResponse: (patch: Record<string, unknown>) => { responsePatch = patch }, beforeStart: (callback: () => Promise<void>) => { beforeStart = callback } }
}
async function pay(f: Fixture): Promise<PaymentAttempt> {
  expect(await f.as.action(options, { networkId: f.root, checkoutAttemptId: f.checkoutAttemptId })).toEqual({ outcome: "ready" })
  const result = await f.as.action(start, intent(f))
  if (result.outcome !== "attempt") throw new Error("Tentative paiement absente")
  return result.attempt
}

describe("P12 — intention privée de paiement, baux et preuve de statut", () => {
  it("reste fermé sans politique ou configuration, avant tout HTTP de paiement", async () => {
    const f = await fixture(), p = peer()
    await f.t.run(ctx => ctx.db.delete(f.paymentPolicyId))
    expect(await f.as.query(context, { networkId: f.root, checkoutAttemptId: f.checkoutAttemptId })).toMatchObject({ available: false, reason: "policy_closed" })
    expect(await f.as.action(options, { networkId: f.root, checkoutAttemptId: f.checkoutAttemptId })).toEqual({ outcome: "unavailable" })
    expect(await f.as.action(start, intent(f))).toEqual({ outcome: "refused" })
    vi.stubEnv("ANTSIA_COMMERCE_SIGNING_KEY", undefined)
    expect(await f.as.action(options, { networkId: f.root, checkoutAttemptId: f.checkoutAttemptId })).toEqual({ outcome: "unavailable" })
    expect(await f.as.action(start, intent(f))).toEqual({ outcome: "unavailable" })
    expect(p.fetcher).not.toHaveBeenCalled()
  })

  it("refuse tiers, autre réseau, JWT sans session et session révoquée", async () => {
    const f = await fixture(); await cacheOptions(f)
    const delivery = await admit(f), paymentAttemptId = delivery.paymentAttemptId!
    const outsiderSession = await createTestSession(f.t, "payment-outsider")
    const outsider = f.t.withIdentity({ subject: "payment-outsider", sessionId: outsiderSession })
    await outsider.mutation(api.modules.people.persons.ensureMyPerson, {})
    await outsider.mutation(api.modules.people.consents.recordConsent, { purpose: "social_profile", origin: "onboarding" })
    await outsider.mutation(api.modules.people.profile.publishMyProfile, { handle: "payment-outsider", displayName: "Autre acheteur" })
    await outsider.mutation(api.modules.people.memberships.joinNetwork, { networkId: f.root })
    expect(await outsider.query(get, { networkId: f.root, paymentAttemptId })).toBeNull()
    expect(await outsider.mutation(authorize, { networkId: f.root, delivery, configFingerprint: f.config.fingerprint })).toBe(false)
    expect(await outsider.mutation(finish, { networkId: f.root, delivery })).toEqual({ outcome: "refused" })
    await expect(f.as.mutation(authorize, { networkId: f.testClosed, delivery, configFingerprint: f.config.fingerprint })).rejects.toBeDefined()
    const raw = f.t.withIdentity({ subject: BUYER })
    await expect(raw.query(get, { networkId: f.root, paymentAttemptId })).rejects.toMatchObject({ data: { code: "unauthenticated" } })
    await f.t.mutation(components.betterAuth.adapter.deleteOne, { input: { model: "session", where: [{ field: "_id", value: f.sessionId }] } })
    await expect(f.as.mutation(authorize, { networkId: f.root, delivery, configFingerprint: f.config.fingerprint })).rejects.toMatchObject({ data: { code: "unauthenticated" } })
    expect((await row(f, paymentAttemptId))?.state).toBe("prepared")
  })

  it("une nouvelle session ne reprend pas le lancement lié à l'ancienne", async () => {
    const f = await fixture(); await cacheOptions(f)
    const delivery = await admit(f)
    const sessionId = await createTestSession(f.t, BUYER), another = f.t.withIdentity({ subject: BUYER, sessionId })
    expect(await another.mutation(authorize, { networkId: f.root, delivery, configFingerprint: f.config.fingerprint })).toBe(false)
    expect(await another.mutation(finish, { networkId: f.root, delivery })).toEqual({ outcome: "refused" })
    expect(await another.action(options, { networkId: f.root, checkoutAttemptId: f.checkoutAttemptId })).toEqual({ outcome: "unavailable" })
    expect(await another.query(get, { networkId: f.root, paymentAttemptId: delivery.paymentAttemptId! })).toMatchObject({ state: "prepared", canRetry: false })
  })

  it("exige la version, le total et la readiness affichés, encore valides", async () => {
    const f = await fixture(), p = peer(); await cacheOptions(f)
    expect(await f.as.action(start, intent(f, { consentTextVersion: "obsolete" }))).toEqual({ outcome: "refused" })
    expect(await f.as.action(start, intent(f, { expectedTotal: { amount: 12_001, currency: "XAF" } }))).toEqual({ outcome: "refused" })
    expect(await f.as.action(start, intent(f, { readinessRef: "d".repeat(64) }))).toEqual({ outcome: "unavailable" })
    vi.setSystemTime(NOW + 60_001)
    expect(await f.as.action(start, intent(f))).toEqual({ outcome: "unavailable" })
    expect(await f.t.run(ctx => ctx.db.query("shopPaymentAttempts").withIndex("by_person", q => q.eq("personId", f.personId)).take(1))).toEqual([])
    expect(p.fetcher).not.toHaveBeenCalled()
  })

  it.each(["amount", "checkout", "expiry"] as const)("ne cache pas des options dont %s diffère du hold", async field => {
    const f = await fixture()
    const patch: Partial<CommercePaymentOptions> = field === "amount" ? { amount: { amount: 12_001, currency: "XAF" } } : field === "checkout" ? { checkoutRef: "pro.ga:checkout:01JA00000000000000000000H2" } : { expiresAt: NOW + 800_000 }
    // Un autre `checkoutRef` n'est pas une réponse à CETTE demande : le contrat jumeau la rejette
    // (`readOptions` → `sameRef`, `correlation_mismatch`), comme le transport (`sendPaymentControl` → null),
    // d'où `unavailable`. Montant ou échéance d'une réponse corrélée contredisent le hold local : `refused`.
    expect(await cacheOptions(f, patch)).toEqual({ outcome: field === "checkout" ? "unavailable" : "refused" })
    expect(await f.as.query(context, { networkId: f.root, checkoutAttemptId: f.checkoutAttemptId })).toMatchObject({ available: false, reason: "refresh_required" })
  })

  it("une réponse options ancienne ne remplace pas le bénéficiaire affiché plus récemment", async () => {
    const f = await fixture()
    const older = await f.as.mutation(beginOptions, { networkId: f.root, ...lease(f), checkoutAttemptId: f.checkoutAttemptId })
    expect(older).not.toBeNull()
    vi.setSystemTime(NOW + 1)
    const newer = await f.as.mutation(beginOptions, { networkId: f.root, ...lease(f), checkoutAttemptId: f.checkoutAttemptId })
    expect(newer).not.toBeNull()
    const updated = paymentOptions({ beneficiaryLabel: "Bénéficiaire relu", readinessRef: "d".repeat(64), readinessExpiresAt: NOW + 60_000 })
    expect(await f.as.mutation(finishOptions, { networkId: f.root, delivery: newer!, rawResponse: await controlReply(newer!.rawBody, updated) })).toEqual({ outcome: "ready" })
    expect(await f.as.mutation(finishOptions, { networkId: f.root, delivery: older!, rawResponse: await controlReply(older!.rawBody, paymentOptions({ readinessExpiresAt: NOW + 60_000 })) })).toEqual({ outcome: "unavailable" })
    expect(await f.as.query(context, { networkId: f.root, checkoutAttemptId: f.checkoutAttemptId })).toMatchObject({ available: true, beneficiaryLabel: "Bénéficiaire relu", readinessRef: "d".repeat(64) })
  })

  it("une préparation porte une seule intention ; la même clé ne change pas de total", async () => {
    const f = await fixture(), p = peer(), first = await pay(f)
    expect(await f.as.action(start, intent(f))).toMatchObject({ outcome: "attempt", attempt: { paymentAttemptId: first.paymentAttemptId } })
    expect(await f.as.action(start, intent(f, { clientRequestId: "payment-client-0002" }))).toMatchObject({ outcome: "attempt", attempt: { paymentAttemptId: first.paymentAttemptId } })
    expect(await f.as.action(start, intent(f, { expectedTotal: { amount: 1, currency: "XAF" } }))).toEqual({ outcome: "refused" })
    expect(p.sent.filter(s => JSON.parse(s.raw).command === "payment.start")).toHaveLength(1)
    expect(p.sent.filter(s => JSON.parse(s.raw).operation === "authorize_start")).toHaveLength(1)
    expect(await f.t.run(ctx => ctx.db.query("shopPaymentAttempts").withIndex("by_person", q => q.eq("personId", f.personId)).take(2))).toHaveLength(1)
  })

  it("lie l'autorisation au digest exact et ne débite pas sur une autorisation étrangère", async () => {
    const f = await fixture(), p = peer()
    p.setAuthorization({ commandRequestSha256: "0".repeat(64) })
    expect((await pay(f)).state).toBe("unavailable")
    expect(p.sent.some(s => JSON.parse(s.raw).command === "payment.start")).toBe(false)
  })

  it.each(["authorization", "start"] as const)("rejuge la politique immédiatement avant envoi %s", async stage => {
    const f = await fixture(); await cacheOptions(f)
    const initial = await admit(f), delivery = stage === "start" ? await authorizeStart(f, initial) : initial
    await f.t.run(ctx => ctx.db.patch(f.paymentPolicyId, { enabled: false }))
    expect(await f.as.mutation(authorize, { networkId: f.root, delivery, configFingerprint: f.config.fingerprint })).toBe(false)
    expect(await row(f, delivery.paymentAttemptId!)).toMatchObject({ state: "prepared" })
  })

  it("ignore une ancienne réponse HTTP après nouvelle génération ou expiration du bail", async () => {
    const f = await fixture(); await cacheOptions(f)
    const auth = await admit(f), delivery = await authorizeStart(f, auth)
    expect(await f.as.mutation(authorize, { networkId: f.root, delivery, configFingerprint: f.config.fingerprint })).toBe(true)
    const rawResponse = await commandReply(delivery.rawBody, startResult())
    expect(await f.as.mutation(finish, { networkId: f.root, delivery: { ...delivery, generation: delivery.generation + 1 }, rawResponse, httpStatus: 200 })).toEqual({ outcome: "refused" })
    vi.setSystemTime(NOW + 31_000)
    expect(await f.as.mutation(finish, { networkId: f.root, delivery, rawResponse, httpStatus: 200 })).toEqual({ outcome: "refused" })
    const lookup = await f.as.mutation(beginOperation, { networkId: f.root, ...lease(f), paymentAttemptId: delivery.paymentAttemptId!, operation: "status" })
    expect(lookup).toMatchObject({ kind: "request_status", generation: 2 })
    expect(await f.as.mutation(finish, { networkId: f.root, delivery, rawResponse, httpStatus: 200 })).toEqual({ outcome: "refused" })
    expect(await row(f, delivery.paymentAttemptId!)).toMatchObject({ state: "submitting", generation: 2 })
    expect((await row(f, delivery.paymentAttemptId!))?.paymentRef).toBeUndefined()
  })

  it("après réponse perdue consulte le statut puis renvoie les mêmes octets et la même clé", async () => {
    const f = await fixture(), p = peer(); p.setTimeout(true)
    const first = await pay(f)
    expect(first).toMatchObject({ state: "unknown", canRetry: true })
    const original = p.sent.find(s => JSON.parse(s.raw).command === "payment.start")!.raw
    p.setTimeout(false)
    expect(await f.as.action(retry, { networkId: f.root, paymentAttemptId: first.paymentAttemptId })).toMatchObject({ outcome: "attempt", attempt: { state: "pending", paymentAttemptId: first.paymentAttemptId } })
    const commands = p.sent.filter(s => "command" in JSON.parse(s.raw))
    expect(commands.map(s => JSON.parse(s.raw).command)).toEqual(["payment.start", "request.status", "payment.start"])
    expect(commands[2]!.raw).toBe(original)
    expect(await sha256Hex(commands[2]!.raw)).toBe((await row(f, first.paymentAttemptId))?.requestSha256)
  })

  it("retrouve un reçu après expiration, sans nouvelle commande de débit", async () => {
    const f = await fixture(), p = peer(); p.setTimeout(true)
    const first = await pay(f)
    vi.setSystemTime(NOW + 120_000); p.setForget(false); p.setState({ paymentState: "succeeded", orderState: "confirmed", stockState: "consumed", action: { kind: "none" } })
    expect(await f.as.action(status, { networkId: f.root, paymentAttemptId: first.paymentAttemptId })).toMatchObject({ outcome: "attempt", attempt: { state: "succeeded", stockState: "consumed", canRetry: false } })
    expect(p.sent.filter(s => JSON.parse(s.raw).command === "payment.start")).toHaveLength(1)
  })

  it("la lecture au retour navigateur ne règle rien ; seul un statut corrélé confirme", async () => {
    const f = await fixture(), p = peer(), first = await pay(f)
    const count = p.sent.length
    expect(await f.as.query(context, { networkId: f.root, checkoutAttemptId: f.checkoutAttemptId })).toMatchObject({ existing: { state: "pending", revision: 0 } })
    const receipt = await f.as.query(get, { networkId: f.root, paymentAttemptId: first.paymentAttemptId })
    expect(receipt).toMatchObject({ state: "pending", orderState: null, stockState: null })
    for (const field of ["rawBody", "requestSha256", "sessionDigest", "subjectRef", "readinessRef", "leaseToken"]) expect(receipt).not.toHaveProperty(field)
    expect(p.sent).toHaveLength(count)
    p.setState({ paymentState: "succeeded", orderState: "confirmed", stockState: "consumed", action: { kind: "none" } })
    p.setResponse({ requestSha256: "0".repeat(64) })
    expect(await f.as.action(status, { networkId: f.root, paymentAttemptId: first.paymentAttemptId })).toMatchObject({ outcome: "attempt", attempt: { state: "pending", revision: 0 } })
    p.setResponse({})
    expect(await f.as.action(status, { networkId: f.root, paymentAttemptId: first.paymentAttemptId })).toMatchObject({ outcome: "attempt", attempt: { state: "succeeded", revision: 1, stockState: "consumed" } })
    expect(await f.t.run(ctx => ctx.db.query("checkoutAttempts").withIndex("by_attempt", q => q.eq("attemptId", f.checkoutAttemptId)).unique())).toMatchObject({ state: "consumed", blocksUntil: 0 })
  })

  it("ne remplace pas un statut par une révision ancienne ou modifiée à numéro égal", async () => {
    const f = await fixture(), p = peer(), first = await pay(f)
    p.setState({ revision: 2 })
    await f.as.action(status, { networkId: f.root, paymentAttemptId: first.paymentAttemptId })
    for (const revision of [1, 2]) {
      p.setState({ revision, paymentState: "succeeded", orderState: "confirmed", stockState: "consumed", action: { kind: "none" } })
      expect(await f.as.action(status, { networkId: f.root, paymentAttemptId: first.paymentAttemptId })).toMatchObject({ outcome: "attempt", attempt: { state: "pending", revision: 2 } })
    }
    p.setState({ revision: 3, paymentState: "succeeded", orderState: "confirmed", stockState: "consumed", action: { kind: "none" } })
    expect(await f.as.action(status, { networkId: f.root, paymentAttemptId: first.paymentAttemptId })).toMatchObject({ outcome: "attempt", attempt: { state: "succeeded", revision: 3 } })
  })

  it("garde le statut privé accessible après fermeture publique, sous une nouvelle session", async () => {
    const f = await fixture(), p = peer(), first = await pay(f)
    await f.t.run(async ctx => { await ctx.db.patch(f.paymentPolicyId, { enabled: false }); await ctx.db.patch(f.linkId, { state: "revoked", revokedAt: Date.now() }) })
    const sessionId = await createTestSession(f.t, BUYER), another = f.t.withIdentity({ subject: BUYER, sessionId })
    p.setState({ paymentState: "succeeded", orderState: "confirmed", stockState: "consumed", action: { kind: "none" } })
    expect(await another.action(status, { networkId: f.root, paymentAttemptId: first.paymentAttemptId })).toMatchObject({ outcome: "attempt", attempt: { state: "succeeded" } })
    expect(p.sent.filter(s => JSON.parse(s.raw).command === "payment.start")).toHaveLength(1)
  })

  it("un retrait pendant le HTTP invalide le retour sans débiter à nouveau ni rembourser", async () => {
    const f = await fixture(), p = peer()
    p.beforeStart(async () => { await f.t.run(async ctx => { await ctx.db.patch(f.personId, { deletionRequestedAt: Date.now() }); expect(await revokePaymentDataForPerson(ctx, f.personId)).toBe(true) }) })
    expect(await f.as.action(options, { networkId: f.root, checkoutAttemptId: f.checkoutAttemptId })).toEqual({ outcome: "ready" })
    expect(await f.as.action(start, intent(f))).toEqual({ outcome: "refused" })
    const saved = await f.t.run(ctx => ctx.db.query("shopPaymentAttempts").withIndex("by_person", q => q.eq("personId", f.personId)).unique())
    expect(saved).toMatchObject({ state: "submitting", generation: 2, privacyRevokedAt: NOW, amount })
    expect(saved?.paymentRef).toBeUndefined(); expect(saved?.snapshot).toBeUndefined()
    for (const field of ["rawBody", "leaseToken", "leaseUntil", "authorizationExpiresAt", "startAction"] as const) expect(saved?.[field]).toBeUndefined()
    expect(await f.as.query(get, { networkId: f.root, paymentAttemptId: saved!.paymentAttemptId })).toBeNull()
    expect(p.sent.filter(s => JSON.parse(s.raw).command === "payment.start")).toHaveLength(1)
    expect(p.sent.some(s => JSON.parse(s.raw).operation === "refund_request")).toBe(false)
    expect(await f.t.run(ctx => ctx.db.query("shopPaymentRequests").withIndex("by_person", q => q.eq("personId", f.personId)).take(1))).toEqual([])
  })

  it("la reprise d'une demande de remboursement garde sa clé, son digest et son délai", async () => {
    const f = await fixture(), p = peer(), first = await pay(f)
    p.setState({ paymentState: "succeeded", orderState: "confirmed", stockState: "consumed", action: { kind: "none" } })
    await f.as.action(status, { networkId: f.root, paymentAttemptId: first.paymentAttemptId })
    const args: Operation = { paymentAttemptId: first.paymentAttemptId, operation: "refund_request", expectedRevision: 1, reason: "duplicate_payment", clientRequestId: "refund-client-0001" }
    const initial = await f.as.mutation(beginOperation, { networkId: f.root, ...lease(f), ...args })
    expect(initial).toMatchObject({ kind: "refund_request" })
    const request = JSON.parse(initial!.rawBody) as CommercePaymentControlRequest
    vi.setSystemTime(NOW + 31_000)
    const resumed = await f.as.mutation(beginOperation, { networkId: f.root, ...lease(f), ...args })
    expect(resumed).toMatchObject({ requestId: initial!.requestId, rawBody: initial!.rawBody, generation: initial!.generation + 1 })
    expect(JSON.parse(resumed!.rawBody).expiresAt).toBe(request.expiresAt)
    expect(await f.as.mutation(authorize, { networkId: f.root, delivery: initial!, configFingerprint: f.config.fingerprint })).toBe(false)
    expect(await f.t.run(ctx => ctx.db.query("shopPaymentRequests").withIndex("by_client", q => q.eq("personId", f.personId).eq("networkId", f.root).eq("kind", "refund_request").eq("clientRequestId", args.clientRequestId)).take(2))).toHaveLength(1)
  })

  it("une clé de remboursement ne peut pas changer de motif après perte de réponse", async () => {
    const f = await fixture(), p = peer(), first = await pay(f)
    p.setState({ paymentState: "succeeded", orderState: "confirmed", stockState: "consumed", action: { kind: "none" } })
    await f.as.action(status, { networkId: f.root, paymentAttemptId: first.paymentAttemptId })
    const args: Operation = { paymentAttemptId: first.paymentAttemptId, operation: "refund_request", expectedRevision: 1, reason: "duplicate_payment", clientRequestId: "refund-client-0001" }
    const initial = await f.as.mutation(beginOperation, { networkId: f.root, ...lease(f), ...args })
    expect(initial).not.toBeNull()
    vi.setSystemTime(NOW + 31_000)
    expect(await f.as.mutation(beginOperation, { networkId: f.root, ...lease(f), ...args, reason: "other" })).toBeNull()
    expect(await f.t.run(ctx => ctx.db.query("shopPaymentRequests").withIndex("by_client", q => q.eq("personId", f.personId).eq("networkId", f.root).eq("kind", "refund_request").eq("clientRequestId", args.clientRequestId)).take(2))).toHaveLength(1)
  })
})

// P16 : validation fictive EN TEST pour préserver les scénarios historiques.
// Aucun contournement d'environnement ni activation en source applicative.
vi.mock("./commerceActivation", async (importOriginal) => ({
  ...await importOriginal<typeof import("./commerceActivation")>(),
  commerceActivationReady: () => true,
}))
