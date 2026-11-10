// @vitest-environment edge-runtime
/** MP06b : PRO simulé et activation services simulée seulement dans CE harnais.
 * Les gardes réelles (réseau, session, mandat, sujet, débit et reprise) restent montées.
 * Le registre fermé sans mock est couvert par marketplace.test.ts ; ceci n'est pas une recette PRO.
 */
import { engineErrorCode } from "@antsia/social-contracts/errors"
import { parseCommerceCommandRequest } from "@antsia/social-domain/commerce/command"
import { COMMERCE_LINK_CONSENT_VERSION } from "@antsia/social-domain/commerce-link"
import { COMMERCE_COMMAND_CONTRACT, COMMERCE_PUBLIC_CONTRACT, COMMERCE_PUBLIC_CONTRACT_V2, commerceCanonicalJson } from "@antsia/social-domain/commerce/primitives"
import {
  COMMERCE_SERVICE_CONSENTS, COMMERCE_SERVICE_CONTROL_CONTRACT, COMMERCE_SERVICE_CONTROL_CONTRACT_V2,
  commerceServiceControlPath, commerceServiceControlSigningInput, parseCommerceServiceControlRequest, parseCommerceServiceControlResponse,
  type CommerceServiceControlContract,
} from "@antsia/social-domain/commerce-services"
import { makeFunctionReference } from "convex/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("./commerceActivation", async importOriginal => {
  const actual = await importOriginal<typeof import("./commerceActivation")>()
  return { ...actual, commerceActivationReady: (capability: keyof typeof actual.COMMERCE_ACTIVATION_DECISIONS) => capability === "services" || actual.commerceActivationReady(capability) }
})

import { api, internal } from "../../_generated/api"
import type { Id } from "../../_generated/dataModel"
import { exportableRecord, type DataRecord } from "../people/dataInventory"
import { SEED_CONFIRMATION } from "../../seeds/foundations"
import { createTestSession, testConvex } from "../../test.setup"
import { ensureCommerceBuyerSubject } from "./commerceBuyerSubjects"
import { readCommerceLinkConfig } from "./commerceLinkConfig"
import { base64url, sha256Hex } from "./commerceLinkCrypto"
import type { ServiceDelivery } from "./serviceFlow"
import type { ServiceActionResult, ServiceQuoteResult, ServiceQuotesResult } from "./serviceRules"
import { SHOP_PUBLIC_LISTING_TEXT_VERSION } from "./rules"

const NOW = Date.UTC(2026, 9, 21, 14), KEY = "mp06b-fixture-secret-sandbox-only-0123456789"
const SHOP = "pro.ga:structure:01JA00000000000000000000S1", LINK = "pro.ga:commerce_link:01JA00000000000000000000K1"
const OFFER = "pro.ga:offer:01JA00000000000000000000P1", QUOTE = "pro.ga:quote:01JA00000000000000000000Q1", INQUIRY = "pro.ga:inquiry:01JA00000000000000000000N1"
type Net = { networkId: Id<"networks"> }
type Intent = Net & { requestRowId: string; quoteRef: string; quoteVersion: number; consentTextVersion: string; clientRequestId: string }
type Keys = { commandId: string; requestId: string; leaseToken: string; configFingerprint: string }
const rejectQuote = makeFunctionReference<"action", Intent, ServiceActionResult>("modules/shops/serviceActions:rejectQuote")
const acceptQuote = makeFunctionReference<"action", Intent & { acceptedTotal: { amount: number; currency: "XAF" } }, ServiceActionResult>("modules/shops/serviceActions:acceptQuote")
const quote = makeFunctionReference<"action", Net & { requestRowId: string; quoteRef: string; contract?: CommerceServiceControlContract }, ServiceQuoteResult>("modules/shops/serviceActions:quote")
const quotes = makeFunctionReference<"action", Net & { requestRowId: string; contract?: CommerceServiceControlContract }, ServiceQuotesResult>("modules/shops/serviceActions:quotes")
const quoteControl = makeFunctionReference<"query", Net & { requestRowId: string }, { quoteControlContract: CommerceServiceControlContract } | null>("modules/shops/services:quoteControl")
const admitReject = makeFunctionReference<"mutation", Intent & Keys, ServiceDelivery | ServiceActionResult>("modules/shops/serviceFlow:admitQuoteReject")
const authorize = makeFunctionReference<"mutation", Net & { delivery: ServiceDelivery; configFingerprint: string }, boolean>("modules/shops/serviceFlow:authorize")
const finish = makeFunctionReference<"mutation", Net & { delivery: ServiceDelivery; rawResponse: string; httpStatus: number }, ServiceActionResult>("modules/shops/serviceFlow:finish")

beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(NOW)
  vi.stubEnv("FEDERATION_ENVIRONMENT", "sandbox"); vi.stubEnv("FILE_GUARD", "off")
  vi.stubEnv("ANTSIA_COMMERCE_ENVIRONMENT", "sandbox"); vi.stubEnv("ANTSIA_COMMERCE_SOURCE", "antsia")
  vi.stubEnv("ANTSIA_COMMERCE_PRO_HTTP_ORIGIN", "http://localhost:4010"); vi.stubEnv("ANTSIA_COMMERCE_PRO_APP_ORIGIN", "http://localhost:4011")
  vi.stubEnv("ANTSIA_COMMERCE_ORIGIN", "http://localhost:3030"); vi.stubEnv("ANTSIA_COMMERCE_KEY_ID", "mp06b-fixture")
  vi.stubEnv("ANTSIA_COMMERCE_SIGNING_KEY", KEY); vi.stubEnv("ANTSIA_COMMERCE_SERVICE_CONTROL_V2", "true")
})
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks() })
async function fixture() {
  const t = testConvex(), { root, testClosed } = await t.mutation(internal.seeds.foundations.run, { confirmNonProduction: SEED_CONFIRMATION })
  const owner = t.withIdentity({ subject: "mp06b-owner" }), buyer = t.withIdentity({ subject: "mp06b-buyer" })
  const person = async (as: typeof buyer, handle: string) => {
    const personId = await as.mutation(api.modules.people.persons.ensureMyPerson, {})
    await as.mutation(api.modules.people.consents.recordConsent, { purpose: "social_profile", origin: "onboarding" })
    await as.mutation(api.modules.people.profile.publishMyProfile, { handle, displayName: "Recette service" })
    await as.mutation(api.modules.people.memberships.joinNetwork, { networkId: root }); return personId
  }
  const ownerId = await person(owner, "mp06b-owner"), buyerId = await person(buyer, "mp06b-buyer"), config = (await readCommerceLinkConfig())!
  const rows = await t.run(async ctx => {
    const pageId = await ctx.db.insert("pages", { networkId: root, handle: "mp06b-service", name: "Prestation de recette", ownerKind: "company", trust: "community", trustRank: 1, visibility: "network", onRoot: true, status: "active", createdByPersonId: ownerId, searchText: "prestation recette", createdAt: NOW, updatedAt: NOW })
    await ctx.db.insert("pageSignatories", { networkId: root, pageId, personId: ownerId, role: "admin", acceptedAt: NOW, createdAt: NOW, updatedAt: NOW })
    const shopId = await ctx.db.insert("shops", { networkId: root, pageId, preparedByPersonId: ownerId, model: "quote_services", storefront: "published", visibility: "network", publicConsentAt: NOW, publicConsentTextVersion: SHOP_PUBLIC_LISTING_TEXT_VERSION, publicConsentByPersonId: ownerId, publishedAt: NOW, createdAt: NOW, updatedAt: NOW })
    const linkId = await ctx.db.insert("shopCommerceLinks", { networkId: root, shopId, pageId, personId: ownerId, state: "active", source: "antsia", environment: "sandbox", configFingerprint: config.fingerprint, subjectRef: `antsia:sub:${"a".repeat(64)}`, antsiaShopRef: `antsia:shop:${"b".repeat(64)}`, shopRef: SHOP, linkRef: LINK, permissions: ["publish_catalog", "receive_inquiries"], consentTextVersion: COMMERCE_LINK_CONSENT_VERSION, consentedAt: NOW, linkedAt: NOW, createdAt: NOW, updatedAt: NOW })
    await ctx.db.insert("shopNetworkPolicies", { networkId: root, storefront: "review", updatedAt: NOW })
    await ctx.db.insert("shopCatalogPolicies", { networkId: root, enabled: true, updatedAt: NOW })
    await ctx.db.insert("commerceServicePolicies", { networkId: root, enabled: true, updatedAt: NOW })
    const emitterId = await ctx.db.insert("federationEmitters", { networkId: root, slug: "mp06b-fixture", environment: "sandbox", enabled: true, keyEnvName: "MP06B_UNUSED_KEY", allowedContracts: [COMMERCE_PUBLIC_CONTRACT], revision: 1, createdAt: NOW, updatedAt: NOW })
    const mappingId = await ctx.db.insert("commerceCatalogMappings", { networkId: root, shopId, emitterId, environment: "sandbox", shopRef: SHOP, linkRef: LINK, enabled: true, generation: 1, createdAt: NOW, updatedAt: NOW })
    const base = { networkId: root, shopId, mappingId, mappingGeneration: 1, emitterId, environment: "sandbox" as const, shopRef: SHOP, sequence: "catalog" as const, state: "active" as const, revision: 1, digest: "a".repeat(64), changedAt: NOW, receivedAt: NOW, activationRevision: 1, parentActivationRevision: 1, gap: false }
    const body = (objectRef: string, payload: object) => commerceCanonicalJson({ contract: COMMERCE_PUBLIC_CONTRACT, version: 1, eventId: `mp06b-${objectRef}`, objectRef, payload })!
    await ctx.db.insert("commerceCatalogHeads", { ...base, objectKind: "shop", objectRef: SHOP, body: body(SHOP, { type: "shop.published", shopRef: SHOP, linkRef: LINK, revision: 1, changedAt: NOW, commercialName: "Prestataire", country: "GA", currency: "XAF", sellerVerification: "unverified", capabilities: ["catalog"], collections: [] }) })
    const headId = await ctx.db.insert("commerceCatalogHeads", { ...base, objectKind: "offer", kind: "service", objectRef: OFFER, body: body(OFFER, { type: "offer.published", shopRef: SHOP, offerRef: OFFER, revision: 1, changedAt: NOW, kind: "service", title: "Diagnostic", description: "Prestation publiée de recette.", collectionRefs: [], tags: [], price: { mode: "quote", currency: "XAF" }, showsAvailability: false, variants: [], variantAxes: [], media: [] }) })
    await ctx.db.insert("moderationContentStates", { networkId: root, targetKind: "commerceOffer", targetId: headId, ownerPageId: pageId, status: "published", createdAt: NOW, updatedAt: NOW })
    const subjectRef = await ensureCommerceBuyerSubject(ctx, { networkId: root, personId: buyerId, shopId, source: "antsia", environment: "sandbox" })
    const requestId = await ctx.db.insert("commerceServiceRequests", { networkId: root, shopId, personId: buyerId, handle: "mp06b-service", requestRowId: "mp06b-request-0001", mode: "quote", offerRef: OFFER, offerTitle: "Diagnostic", source: "antsia", environment: "sandbox", shopRef: SHOP, linkRef: LINK, subjectRef, inquiryRef: INQUIRY, state: "active", createdAt: NOW, updatedAt: NOW })
    return { shopId, linkId, requestId, headId }
  })
  return { t, root, testClosed, owner, buyer, buyerId, ownerId, config, ...rows, args: { networkId: root, requestRowId: "mp06b-request-0001" } }
}
type Fixture = Awaited<ReturnType<typeof fixture>>
const intent = (f: Fixture, clientRequestId = "mp06b-reject-client-0001"): Intent => ({ ...f.args, quoteRef: QUOTE, quoteVersion: 1, consentTextVersion: COMMERCE_SERVICE_CONSENTS.quote_rejection.textVersion, clientRequestId })
async function commandRows(f: Fixture) { return await f.t.run(async ctx => ctx.db.query("commerceServiceCommands").withIndex("by_request_row", q => q.eq("requestRowId", f.args.requestRowId)).take(20)) }
async function requestRow(f: Fixture) { return await f.t.run(async ctx => ctx.db.get(f.requestId)) }
async function admitted(f: Fixture) {
  const result = await f.buyer.mutation(admitReject, { ...intent(f), commandId: "mp06b-command-0001", requestId: "mp06b-control-0001", leaseToken: "a".repeat(43), configFingerprint: f.config.fingerprint })
  if (!("rawBody" in result)) throw new Error("Admission V2 attendue dans le harnais simulé")
  return result
}

function peer() {
  const sent: Array<{ path: string; raw: string }> = [], recorded = new Map<string, string>(), validationFailures: unknown[] = []
  const state = { timeout: false, forget: false, rejected: false, corrupt: "", version: 1, orderRevision: 1, orderAmount: 10_000, ordersCreated: 0, takenSlot: null as number | null, bookingsCreated: 0 }
  const response = async (raw: string, outcome: string, extra: Record<string, unknown>) => {
    const request = JSON.parse(raw) as { contract: string; requestId: string }
    const body = commerceCanonicalJson({ contract: request.contract, version: 1, requestId: request.requestId, requestSha256: await sha256Hex(raw), respondedAt: Date.now(), outcome, ...extra })!
    const parsed = parseCommerceServiceControlRequest(raw, { source: "antsia", environment: "sandbox", nowMs: Date.now(), contract: request.contract as CommerceServiceControlContract })
    const checked = parsed.ok ? parseCommerceServiceControlResponse(body, { request: parsed.value, requestSha256: await sha256Hex(raw), nowMs: Date.now() }) : parsed
    if (!checked.ok) validationFailures.push(checked)
    return body
  }
  const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(input)).pathname, raw = String(init?.body), headers = new Headers(init?.headers)
    if (path === "/commerce/v1/commands") {
      const parsed = parseCommerceCommandRequest(raw, { source: "antsia", environment: "sandbox", nowMs: Date.now() })
      if (!parsed.ok) throw new Error("Commande P06 invalide dans le pair simulé")
      const request = parsed.value
      sent.push({ path, raw })
      const commandResponse = async (outcome: string, extra: Record<string, unknown>) => commerceCanonicalJson({ contract: COMMERCE_COMMAND_CONTRACT, version: 1, command: request.command, requestId: request.requestId, requestSha256: await sha256Hex(raw), respondedAt: Date.now(), outcome, ...extra })!
      if (request.command === "request.status") {
        const known = state.forget ? undefined : recorded.get(request.payload.targetRequestId)
        return new Response(await commandResponse("accepted", { result: { targetRequestId: request.payload.targetRequestId, state: known ? "completed" : "unknown", current: [], ...(known ? { recordedResponse: known, recordedResponseSha256: await sha256Hex(known) } : {}) } }), { status: 200 })
      }
      if (request.command !== "booking.request") throw new Error("Commande P06 hors du harnais")
      const previous = recorded.get(request.requestId)
      if (previous) return new Response(previous, { status: 200 })
      if (state.takenSlot === request.payload.slot.startAt) return new Response(await commandResponse("rejected", { reason: "slot_unavailable" }), { status: 422 })
      state.takenSlot = request.payload.slot.startAt; state.bookingsCreated += 1
      const body = await commandResponse("accepted", { result: { appointmentRef: "pro.ga:appointment:01JA00000000000000000000A1", startAt: request.payload.slot.startAt, endAt: request.payload.slot.endAt, state: "confirmed", timeZone: "Africa/Libreville" } })
      recorded.set(request.requestId, body)
      if (state.timeout) throw new Error("Réponse perdue après réservation simulée")
      return new Response(body, { status: 200 })
    }
    const envelope = JSON.parse(raw) as { contract: CommerceServiceControlContract }
    const parsed = parseCommerceServiceControlRequest(raw, { source: "antsia", environment: "sandbox", nowMs: Date.now(), contract: envelope.contract })
    if (!parsed.ok) throw new Error("Corps de contrôle refusé dans le pair simulé")
    const request = parsed.value
    expect(path).toBe(commerceServiceControlPath(request.operation, request.contract))
    const signing = commerceServiceControlSigningInput({ contract: request.contract, bodySha256: await sha256Hex(raw), environment: "sandbox", issuedAtMs: Number(headers.get("X-Pro-Timestamp")), keyId: "mp06b-fixture", nonce: headers.get("X-Pro-Nonce")!, operation: request.operation, source: "antsia" })
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(KEY), { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
    expect(headers.get("X-Pro-Signature")).toBe(base64url(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signing!)))))
    sent.push({ path, raw })
    const reply = (body: string, status = 200) => new Response(body, { status })
    if (request.operation === "service.quote.reject") {
      const previous = recorded.get(request.requestId)
      if (previous) return reply(previous)
      if (request.payload.quoteVersion !== state.version) return reply(await response(raw, "refused", { reason: "stale_revision" }), 422)
      state.rejected = true
      let body = await response(raw, "accepted", { result: { quoteRef: request.payload.quoteRef, quoteVersion: request.payload.quoteVersion, state: "rejected", rejectedAt: Date.now() } })
      recorded.set(request.requestId, body)
      if (state.timeout) throw new Error("Réponse perdue après décision simulée")
      if (state.corrupt) {
        const value = JSON.parse(body)
        if (state.corrupt === "sha") value.requestSha256 = "0".repeat(64)
        if (state.corrupt === "version") value.result.quoteVersion = 99
        if (state.corrupt === "contract") value.contract = COMMERCE_SERVICE_CONTROL_CONTRACT
        body = commerceCanonicalJson(value)!
      }
      return reply(body)
    }
    if (request.operation === "service.order.request") {
      const previous = recorded.get(request.requestId)
      if (previous) return reply(previous)
      if (request.payload.expectedCatalogRevision !== state.orderRevision || request.payload.expectedUnitAmount.amount !== state.orderAmount) return reply(await response(raw, "reconfirm_required", { result: { currentCatalogRevision: state.orderRevision, currentUnitAmount: { amount: state.orderAmount, currency: "XAF" }, state: "reconfirm" } }))
      const quantity = request.payload.quantity, amount = state.orderAmount
      state.ordersCreated += 1
      const body = await response(raw, "accepted", { result: { catalogRevision: state.orderRevision, createdAt: Date.now(), lines: [{ label: "Forfait public", quantity, unitAmount: { amount, currency: "XAF" }, lineAmount: { amount: amount * quantity, currency: "XAF" } }], orderRef: "pro.ga:order:01JA00000000000000000000D1", state: "pending", total: { amount: amount * quantity, currency: "XAF" } } })
      recorded.set(request.requestId, body)
      if (state.timeout) throw new Error("Réponse perdue après commande simulée")
      return reply(body)
    }
    if (request.operation === "action.status") {
      const known = state.forget ? undefined : recorded.get(request.payload.targetRequestId)
      return reply(await response(raw, "accepted", { result: { targetRequestId: request.payload.targetRequestId, state: known ? "completed" : "unknown", current: [], ...(known ? { recordedResponse: known, recordedResponseSha256: await sha256Hex(known) } : {}) } }))
    }
    if (request.operation === "booking.read") return reply(await response(raw, "refused", { reason: "access_denied" }), 422)
    if (request.operation === "quote.read" || request.operation === "quote.list") {
      const summary = { acceptable: !state.rejected, clientAcceptance: null, current: true, inquiryRef: INQUIRY, quoteRef: QUOTE, reference: "DEV-RECETTE", sentAt: NOW, state: state.rejected ? "rejected" : "sent", title: "Diagnostic", total: { amount: 10_000, currency: "XAF" }, validUntil: NOW + 86_400_000, version: state.version,
        ...(request.contract === COMMERCE_SERVICE_CONTROL_CONTRACT_V2 ? { rejectable: !state.rejected, clientRejection: state.rejected ? { quoteVersion: state.version, rejectedAt: NOW } : null } : {}),
      }
      const result = request.operation === "quote.list" ? { quotes: [summary], truncated: false } : { quote: { ...summary, notes: null, sellerLabel: null, lines: [{ label: "Diagnostic", quantity: 1, unitAmount: { amount: 10_000, currency: "XAF" }, lineAmount: { amount: 10_000, currency: "XAF" } }] } }
      return reply(await response(raw, "accepted", { result }))
    }
    throw new Error("Opération hors du harnais de refus de devis")
  })
  vi.stubGlobal("fetch", fetcher)
  return { sent, state, response, fetcher, validationFailures }
}

describe("MP06b — refus explicite et compatibilité des devis", () => {
  it("sélectionne V1 par défaut, conserve sa lecture et refuse V2 sans opt-in", async () => {
    const f = await fixture(), p = peer(); vi.stubEnv("ANTSIA_COMMERCE_SERVICE_CONTROL_V2", "false")
    expect(await f.buyer.query(quoteControl, f.args)).toEqual({ quoteControlContract: COMMERCE_SERVICE_CONTROL_CONTRACT })
    expect(await f.owner.query(quoteControl, f.args)).toBeNull()
    const legacy = await f.buyer.action(quote, { ...f.args, quoteRef: QUOTE })
    expect(p.validationFailures).toEqual([])
    expect(legacy).toMatchObject({ outcome: "ready", quote: { acceptable: true, rejectable: false, clientRejection: null } })
    expect(legacy).not.toHaveProperty("rejectionConsentTextVersion")
    expect(await f.buyer.action(quote, { ...f.args, quoteRef: QUOTE, contract: COMMERCE_SERVICE_CONTROL_CONTRACT_V2 })).toEqual({ outcome: "unavailable" })
    expect(await f.buyer.action(rejectQuote, intent(f))).toEqual({ outcome: "refused" })
    expect(p.sent.map(send => send.path)).toEqual(["/commerce/v1/services/quotes/read"])
    expect(await commandRows(f)).toEqual([])
  })

  it("expose les droits V2 explicites puis conserve uniquement la preuve corrélée du refus confirmé", async () => {
    const f = await fixture(), p = peer()
    expect(await f.buyer.query(quoteControl, f.args)).toEqual({ quoteControlContract: COMMERCE_SERVICE_CONTROL_CONTRACT_V2 })
    const listed = await f.buyer.action(quotes, { ...f.args, contract: COMMERCE_SERVICE_CONTROL_CONTRACT_V2 })
    expect(p.validationFailures).toEqual([])
    expect(listed).toMatchObject({ outcome: "ready", quotes: [{ rejectable: true, clientRejection: null }] })
    expect(await f.buyer.action(quote, { ...f.args, quoteRef: QUOTE, contract: COMMERCE_SERVICE_CONTROL_CONTRACT_V2 })).toMatchObject({ outcome: "ready", rejectionConsentTextVersion: COMMERCE_SERVICE_CONSENTS.quote_rejection.textVersion, quote: { rejectable: true } })
    expect(await f.buyer.action(rejectQuote, intent(f))).toMatchObject({ outcome: "request", state: "accepted" })
    expect(await requestRow(f)).toMatchObject({ mode: "quote", state: "active", rejectedQuote: { quoteRef: QUOTE, quoteVersion: 1, rejectedAt: NOW } })
    expect(await requestRow(f)).not.toHaveProperty("order")
    const [command] = await commandRows(f)
    expect(command).toMatchObject({ kind: "quote_reject", state: "accepted", consentTextVersion: COMMERCE_SERVICE_CONSENTS.quote_rejection.textVersion })
    expect(command?.rawBody).toBeUndefined()
    const ownedRow = (await requestRow(f))!
    const exported = exportableRecord("commerceServiceRequests", ownedRow as unknown as DataRecord, String(f.buyerId))
    const exportedCommand = exportableRecord("commerceServiceCommands", command! as unknown as DataRecord, String(f.buyerId))
    expect(exported).toMatchObject({ rejectedQuote: { quoteRef: QUOTE, quoteVersion: 1, rejectedAt: NOW } })
    for (const key of ["subjectRef", "sessionDigest", "rawBody", "bodySha256", "leaseToken", "configFingerprint"]) {
      expect(exported).not.toHaveProperty(key); expect(exportedCommand).not.toHaveProperty(key)
    }
    expect(exportableRecord("commerceServiceRequests", ownedRow as unknown as DataRecord, String(f.ownerId))).toBeNull()
    expect(exportableRecord("commerceServiceCommands", command! as unknown as DataRecord, String(f.ownerId))).toBeNull()
    expect(await f.buyer.action(quote, { ...f.args, quoteRef: QUOTE, contract: COMMERCE_SERVICE_CONTROL_CONTRACT_V2 })).toMatchObject({ outcome: "ready", quote: { rejectable: false, clientRejection: { quoteVersion: 1, rejectedAt: NOW } } })
    expect(p.sent.filter(send => send.path.endsWith("/reject"))).toHaveLength(1)
    expect(await f.buyer.action(rejectQuote, intent(f))).toMatchObject({ state: "accepted" })
    expect(p.sent.filter(send => send.path.endsWith("/reject"))).toHaveLength(1)
  })

  it("refuse mauvais consentement, autre propriétaire, mandat révoqué et clé clôturée avant émission", async () => {
    const f = await fixture(), p = peer()
    expect(await f.buyer.action(rejectQuote, { ...intent(f), consentTextVersion: COMMERCE_SERVICE_CONSENTS.quote_acceptance.textVersion })).toEqual({ outcome: "refused" })
    expect(await f.owner.action(rejectQuote, intent(f))).toEqual({ outcome: "refused" })
    await f.buyer.mutation(api.modules.shops.services.stopClientIntent, { networkId: f.root, clientRequestId: intent(f).clientRequestId })
    expect(await f.buyer.action(rejectQuote, intent(f))).toEqual({ outcome: "refused" })
    await f.t.run(async ctx => ctx.db.patch(f.linkId, { state: "revoked" }))
    expect(await f.buyer.action(rejectQuote, intent(f, "mp06b-revoked-client-0001"))).toEqual({ outcome: "refused" })
    expect(p.sent).toEqual([]); expect(await commandRows(f)).toEqual([])
  })

  it("un refus de version périmée ne crée aucune preuve locale ni commande de prestation", async () => {
    const f = await fixture(), p = peer(); p.state.version = 2
    expect(await f.buyer.action(rejectQuote, intent(f))).toMatchObject({ state: "rejected", reason: "stale_revision" })
    expect(await requestRow(f)).not.toHaveProperty("rejectedQuote")
    expect(await requestRow(f)).not.toHaveProperty("order")
  })

  it("verrouille accepter et refuser pendant une même intention inconnue", async () => {
    const f = await fixture(), p = peer()
    await admitted(f)
    expect(await f.buyer.action(acceptQuote, { ...intent(f, "mp06b-accept-while-busy-0001"), consentTextVersion: COMMERCE_SERVICE_CONSENTS.quote_acceptance.textVersion, acceptedTotal: { amount: 10_000, currency: "XAF" } })).toEqual({ outcome: "refused" })
    expect(await f.buyer.action(rejectQuote, intent(f, "mp06b-reject-while-busy-0001"))).toEqual({ outcome: "refused" })
    expect(p.sent).toEqual([]); expect(await commandRows(f)).toHaveLength(1)
  })

  it("récupère une décision perdue en nouvelle session par action.status V2 après fermeture de l'opt-in", async () => {
    const f = await fixture(), p = peer(); p.state.timeout = true
    expect(await f.buyer.action(rejectQuote, intent(f))).toMatchObject({ state: "unknown" })
    const [before] = await commandRows(f), original = p.sent[0]!.raw
    vi.stubEnv("ANTSIA_COMMERCE_SERVICE_CONTROL_V2", "false")
    const sessionId = await createTestSession(f.t, "mp06b-buyer"), later = f.t.withIdentity({ subject: "mp06b-buyer", sessionId })
    await later.action(api.modules.shops.serviceActions.retry, f.args)
    const [after] = await commandRows(f)
    expect(after).toMatchObject({ state: "accepted", sessionDigest: before!.sessionDigest, bodySha256: before!.bodySha256, consentedAt: before!.consentedAt, lookupSessionDigest: await sha256Hex(sessionId) })
    expect(after?.rawBody).toBeUndefined()
    expect(p.sent.map(send => send.path)).toEqual(["/commerce/v2/services/quotes/reject", "/commerce/v2/services/actions/status"])
    expect(p.sent[0]!.raw).toBe(original)
    expect(await requestRow(f)).toMatchObject({ rejectedQuote: { quoteRef: QUOTE, quoteVersion: 1, rejectedAt: NOW } })
  })

  it("ne renvoie que les octets initiaux après une consultation réellement inconnue", async () => {
    const f = await fixture(), p = peer(); p.state.timeout = true; p.state.forget = true
    await f.buyer.action(rejectQuote, intent(f)); p.state.timeout = false
    await f.buyer.action(api.modules.shops.serviceActions.retry, f.args)
    const sends = p.sent.filter(send => send.path.endsWith("/reject"))
    expect(sends).toHaveLength(2); expect(sends[1]!.raw).toBe(sends[0]!.raw)
    expect(await commandRows(f)).toHaveLength(1)
    expect(await requestRow(f)).toMatchObject({ rejectedQuote: { quoteVersion: 1 } })
  })

  it.each(["sha", "version", "contract"])("n'adopte pas une réponse non corrélée : %s", async corrupt => {
    const f = await fixture(), p = peer(); p.state.corrupt = corrupt
    expect(await f.buyer.action(rejectQuote, intent(f))).toMatchObject({ state: "unknown" })
    expect(await requestRow(f)).not.toHaveProperty("rejectedQuote")
  })

  it("relit le drapeau avant envoi et arrivée, sans effacer une intention déjà admise", async () => {
    const f = await fixture(), p = peer(), delivery = await admitted(f)
    vi.stubEnv("ANTSIA_COMMERCE_SERVICE_CONTROL_V2", "false")
    expect(await f.buyer.mutation(authorize, { networkId: f.root, delivery, configFingerprint: f.config.fingerprint })).toBe(false)
    const rawResponse = await p.response(delivery.rawBody, "accepted", { result: { quoteRef: QUOTE, quoteVersion: 1, state: "rejected", rejectedAt: NOW } })
    expect(await f.buyer.mutation(finish, { networkId: f.root, delivery, rawResponse, httpStatus: 200 })).toEqual({ outcome: "refused" })
    expect((await commandRows(f))[0]).toMatchObject({ state: "unknown", rawBody: delivery.rawBody })
    expect(await requestRow(f)).not.toHaveProperty("rejectedQuote")
  })
})

it("MP06b — conserve le refus réseau indistinct et le vrai limiteur partagé des décisions", async () => {
  const f = await fixture(); peer()
  let networkError: unknown
  try { await f.buyer.query(quoteControl, { ...f.args, networkId: f.testClosed }) } catch (error) { networkError = error }
  expect(engineErrorCode(networkError)).toBe("notFound")
  for (let index = 0; index < 6; index++) expect(await f.buyer.action(rejectQuote, { ...intent(f, `mp06b-rate-client-${index}`), quoteVersion: 2 })).toMatchObject({ state: "rejected", reason: "stale_revision" })
  let rateError: unknown
  try { await f.buyer.action(rejectQuote, { ...intent(f, "mp06b-rate-client-last"), quoteVersion: 2 }) } catch (error) { rateError = error }
  expect(engineErrorCode(rateError)).toBe("rateLimited")
  expect(await requestRow(f)).not.toHaveProperty("rejectedQuote")
})

it("MP06b — une acceptation inconnue ferme aussi le refus concurrent", async () => {
  const f = await fixture(), p = peer()
  const admitAccept = makeFunctionReference<"mutation", Intent & Keys & { acceptedTotal: { amount: number; currency: "XAF" } }, ServiceDelivery | ServiceActionResult>("modules/shops/serviceFlow:admitQuoteAccept")
  const result = await f.buyer.mutation(admitAccept, { ...intent(f, "mp06b-pending-accept-0001"), consentTextVersion: COMMERCE_SERVICE_CONSENTS.quote_acceptance.textVersion, acceptedTotal: { amount: 10_000, currency: "XAF" }, commandId: "mp06b-accept-command-0001", requestId: "mp06b-accept-request-0001", leaseToken: "b".repeat(43), configFingerprint: f.config.fingerprint })
  expect(result).toHaveProperty("rawBody")
  expect(await f.buyer.action(rejectQuote, intent(f))).toEqual({ outcome: "refused" })
  expect(p.sent).toEqual([])
  expect(await commandRows(f)).toHaveLength(1)
})

it("MP06b — fermer l'opt-in conserve la consultation inconnue mais interdit le renvoi", async () => {
  const f = await fixture(), p = peer(); p.state.timeout = true; p.state.forget = true
  await f.buyer.action(rejectQuote, intent(f))
  const [before] = await commandRows(f)
  vi.stubEnv("ANTSIA_COMMERCE_SERVICE_CONTROL_V2", "false")
  await f.buyer.action(api.modules.shops.serviceActions.retry, f.args)
  expect(p.sent.map(send => send.path)).toEqual(["/commerce/v2/services/quotes/reject", "/commerce/v2/services/actions/status"])
  expect((await commandRows(f))[0]).toMatchObject({ state: "unknown", rawBody: before!.rawBody, bodySha256: before!.bodySha256 })
  expect(await requestRow(f)).not.toHaveProperty("rejectedQuote")
})

type PackageIntent = Net & { handle: string; offerRef: string; quantity: number; expectedUnitAmount: { amount: number; currency: "XAF" }; expectedCatalogRevision: number; consentTextVersion: string; clientRequestId: string; publishedPackage?: true }
const orderService = makeFunctionReference<"action", PackageIntent, ServiceActionResult>("modules/shops/serviceActions:orderService")
const admitOrder = makeFunctionReference<"mutation", PackageIntent & Keys & { requestRowId: string }, ServiceDelivery | ServiceActionResult>("modules/shops/serviceFlow:admitServiceOrder")
type PackageChanges = { revision?: number; kind?: "product" | "service"; profile?: "fixed" | "quote" | "absent"; leadTimeDays?: number; deliverable?: string; variants?: boolean }
async function publishPackage(f: Fixture, changes: PackageChanges = {}) {
  const revision = changes.revision ?? 1
  await f.t.run(async ctx => {
    const previous = (await ctx.db.get(f.headId))!
    await ctx.db.patch(f.linkId, { permissions: ["publish_catalog", "receive_inquiries", "receive_orders", "receive_bookings"] })
    await ctx.db.patch(previous.emitterId, { allowedContracts: [COMMERCE_PUBLIC_CONTRACT, COMMERCE_PUBLIC_CONTRACT_V2] })
    const profile = changes.profile ?? "fixed"
    const payload = { type: revision === 1 ? "offer.published" : "offer.updated", shopRef: SHOP, offerRef: OFFER, revision, changedAt: NOW, kind: changes.kind ?? "service", title: "Forfait public", description: "Prestation ponctuelle publiée, sans abonnement.", collectionRefs: [], tags: [], price: { mode: "fixed", currency: "XAF", amount: 10_000 }, showsAvailability: false, variants: changes.variants ? [{ variantRef: "pro.ga:offer_variant:01JA00000000000000000000V1", label: "Long", options: ["Long"], amount: 10_000 }] : [], variantAxes: changes.variants ? ["Format"] : [], media: [], leadTimeDays: changes.leadTimeDays ?? 2,
      ...(profile === "absent" ? {} : { serviceProfile: { version: 1, commercialModes: [profile === "fixed" ? "fixed_order" : "quote"], languageCodes: [], zones: [], deliverables: profile === "fixed" ? [changes.deliverable ?? "Diagnostic et rapport"] : [], inclusions: [], exclusions: [], portfolio: [] } }),
    }
    const raw = commerceCanonicalJson({ contract: COMMERCE_PUBLIC_CONTRACT_V2, version: 1, eventId: `mp06c-package-${revision}`, objectRef: OFFER, payload })!
    await ctx.db.patch(previous._id, { revision, kind: changes.kind ?? "service", state: "active", body: raw })
  })
}
async function packageFixture(changes: PackageChanges = {}) { const f = await fixture(); await publishPackage(f, changes); return f }
const packageIntent = (f: Fixture, extra: Partial<PackageIntent> = {}): PackageIntent => ({ networkId: f.root, handle: "mp06b-service", offerRef: OFFER, quantity: 1, expectedUnitAmount: { amount: 10_000, currency: "XAF" }, expectedCatalogRevision: 1, consentTextVersion: COMMERCE_SERVICE_CONSENTS.service_order.textVersion, clientRequestId: "mp06c-package-client-0001", publishedPackage: true, ...extra })
async function admittedPackage(f: Fixture) {
  const result = await f.buyer.mutation(admitOrder, { ...packageIntent(f), requestRowId: "mp06c-package-request-0001", commandId: "mp06c-package-command-0001", requestId: "mp06c-package-control-0001", leaseToken: "c".repeat(43), configFingerprint: f.config.fingerprint })
  if (!("rawBody" in result)) throw new Error("Forfait publié attendu dans le harnais simulé")
  return result
}
async function packageCommands(f: Fixture) { return await f.t.run(async ctx => ctx.db.query("commerceServiceCommands").withIndex("by_person_cancelled", q => q.eq("personId", f.buyerId)).take(20)) }

describe("MP06c — forfait ponctuel issu de l'offre publiée", () => {
  it("qualifie le forfait explicite sans modifier le corps privé V1 ni créer un paiement", async () => {
    const f = await packageFixture(), p = peer()
    const result = await f.buyer.action(orderService, packageIntent(f))
    expect(result).toMatchObject({ outcome: "request", state: "accepted" })
    if (result.outcome !== "request") throw new Error("Demande de forfait attendue")
    const row = await f.buyer.query(api.modules.shops.services.myRequest, { networkId: f.root, requestRowId: result.requestRowId })
    expect(row).toMatchObject({ mode: "fixed_order", paymentAvailable: false, order: { state: "pending", total: { amount: 10_000, currency: "XAF" } } })
    expect((await packageCommands(f))[0]).toMatchObject({ publishedPackage: true, expectedCatalogRevision: 1 })
    const sent = JSON.parse(p.sent[0]!.raw)
    expect(sent.contract).toBe(COMMERCE_SERVICE_CONTROL_CONTRACT)
    expect(sent.operation).toBe("service.order.request")
    expect(sent.payload).not.toHaveProperty("publishedPackage")
    expect(p.validationFailures).toEqual([]); expect(p.state.ordersCreated).toBe(1)
  })

  it("conserve le contrat privé historique sans profil mais ne le qualifie jamais de forfait public", async () => {
    const f = await packageFixture({ profile: "absent" }), p = peer()
    expect(await f.buyer.action(orderService, packageIntent(f))).toEqual({ outcome: "refused" })
    const legacy = packageIntent(f); delete legacy.publishedPackage
    expect(await f.buyer.action(orderService, legacy)).toMatchObject({ state: "accepted" })
    expect((await packageCommands(f))[0]).not.toHaveProperty("publishedPackage")
    expect(p.state.ordersCreated).toBe(1)
  })

  it.each(["quote", "product", "revision", "price", "variants"])("refuse une qualification publique incompatible avant tout envoi : %s", async change => {
    const f = await packageFixture(), p = peer()
    if (change === "quote") await publishPackage(f, { profile: "quote" })
    if (change === "product") await publishPackage(f, { kind: "product", profile: "absent" })
    if (change === "variants") await publishPackage(f, { variants: true })
    const args = packageIntent(f, change === "revision" ? { expectedCatalogRevision: 2 } : change === "price" ? { expectedUnitAmount: { amount: 20_000, currency: "XAF" } } : {})
    expect(await f.buyer.action(orderService, args)).toEqual({ outcome: "refused" })
    expect(p.sent).toEqual([]); expect(await packageCommands(f)).toEqual([])
  })

  it.each(["profile", "leadTime"])("une modification de %s au même montant impose la nouvelle révision avant soumission et avant envoi", async change => {
    const f = await packageFixture(), p = peer(), delivery = await admittedPackage(f)
    await publishPackage(f, { revision: 2, ...(change === "profile" ? { deliverable: "Autre livrable à relire" } : { leadTimeDays: 5 }) })
    expect(await f.buyer.mutation(authorize, { networkId: f.root, delivery, configFingerprint: f.config.fingerprint })).toBe(false)
    expect(await f.buyer.action(orderService, packageIntent(f, { clientRequestId: "mp06c-obsolete-public-0001" }))).toEqual({ outcome: "refused" })
    expect(p.sent).toEqual([])
    expect((await packageCommands(f))[0]).toMatchObject({ state: "unknown", rawBody: delivery.rawBody, expectedCatalogRevision: 1 })
  })

  it.each(["offer", "capability", "profile"])("relit le retrait %s entre admission et envoi", async gate => {
    const f = await packageFixture(), p = peer(), delivery = await admittedPackage(f)
    if (gate === "offer") await f.t.run(async ctx => ctx.db.patch(f.headId, { state: "withdrawn" }))
    if (gate === "capability") await f.t.run(async ctx => ctx.db.patch(f.shopId, { activityConfiguration: { version: 1, capabilities: ["products"], template: "general", blocks: ["catalog", "about"] } }))
    if (gate === "profile") await publishPackage(f, { revision: 2, profile: "quote" })
    expect(await f.buyer.mutation(authorize, { networkId: f.root, delivery, configFingerprint: f.config.fingerprint })).toBe(false)
    expect(p.sent).toEqual([])
  })

  it("retrouve un forfait confirmé dont la réponse s'est perdue, même après retrait public, sans seconde commande", async () => {
    const f = await packageFixture(), p = peer(); p.state.timeout = true
    const result = await f.buyer.action(orderService, packageIntent(f))
    expect(result).toMatchObject({ state: "unknown" })
    if (result.outcome !== "request") throw new Error("Reprise de forfait attendue")
    await f.t.run(async ctx => ctx.db.patch(f.headId, { state: "withdrawn" }))
    await f.buyer.action(api.modules.shops.serviceActions.retry, { networkId: f.root, requestRowId: result.requestRowId })
    expect((await packageCommands(f))[0]).toMatchObject({ state: "accepted" })
    expect(p.sent.map(send => send.path)).toEqual(["/commerce/v1/services/orders", "/commerce/v1/services/actions/status"])
    expect(p.state.ordersCreated).toBe(1)
  })

  it("ne renvoie pas un forfait devenu différent après une consultation inconnue, même à prix identique", async () => {
    const f = await packageFixture(), p = peer(); p.state.timeout = true; p.state.forget = true
    const result = await f.buyer.action(orderService, packageIntent(f))
    if (result.outcome !== "request") throw new Error("Reprise de forfait attendue")
    const [before] = await packageCommands(f)
    await publishPackage(f, { revision: 2, leadTimeDays: 5 })
    await f.buyer.action(api.modules.shops.serviceActions.retry, { networkId: f.root, requestRowId: result.requestRowId })
    expect(p.sent.map(send => send.path)).toEqual(["/commerce/v1/services/orders", "/commerce/v1/services/actions/status"])
    expect((await packageCommands(f))[0]).toMatchObject({ state: "unknown", rawBody: before!.rawBody, bodySha256: before!.bodySha256 })
    expect(p.state.ordersCreated).toBe(1)
  })
})

const bookingIntent = (f: Fixture, clientRequestId: string) => ({ networkId: f.root, handle: "mp06b-service", offerRef: OFFER, serviceRef: "pro.ga:agenda_service:01JA00000000000000000000S2", serviceLabel: "Diagnostic", startAt: NOW + 86_400_000, endAt: NOW + 86_400_000 + 3_600_000, consentTextVersion: COMMERCE_SERVICE_CONSENTS.booking.textVersion, clientRequestId })
it("MP06c — deux personnes demandant le même créneau n'obtiennent qu'une réservation confirmée", async () => {
  const f = await packageFixture({ profile: "absent" }), p = peer()
  const second = f.t.withIdentity({ subject: "mp06c-second-buyer" })
  await second.mutation(api.modules.people.persons.ensureMyPerson, {})
  await second.mutation(api.modules.people.consents.recordConsent, { purpose: "social_profile", origin: "onboarding" })
  await second.mutation(api.modules.people.profile.publishMyProfile, { handle: "mp06c-second-buyer", displayName: "Recette réservation" })
  await second.mutation(api.modules.people.memberships.joinNetwork, { networkId: f.root })
  expect(await f.buyer.action(api.modules.shops.serviceActions.book, bookingIntent(f, "mp06c-first-booking-0001"))).toMatchObject({ state: "accepted" })
  const result = await second.action(api.modules.shops.serviceActions.book, bookingIntent(f, "mp06c-second-booking-0001"))
  expect(result).toMatchObject({ state: "rejected", reason: "slot_unavailable" })
  if (result.outcome !== "request") throw new Error("Trace de demande attendue")
  expect(await second.query(api.modules.shops.services.myRequest, { networkId: f.root, requestRowId: result.requestRowId })).toMatchObject({ state: "failed", reason: "slot_unavailable", booking: null })
  expect(p.state.bookingsCreated).toBe(1)
})

it("MP06c — une réponse de réservation perdue se retrouve par request.status sans doubler le créneau", async () => {
  const f = await packageFixture({ profile: "absent" }), p = peer(); p.state.timeout = true
  const result = await f.buyer.action(api.modules.shops.serviceActions.book, bookingIntent(f, "mp06c-lost-booking-0001"))
  expect(result).toMatchObject({ state: "unknown" })
  if (result.outcome !== "request") throw new Error("Reprise de réservation attendue")
  await f.buyer.action(api.modules.shops.serviceActions.retry, { networkId: f.root, requestRowId: result.requestRowId })
  expect((await packageCommands(f))[0]).toMatchObject({ kind: "booking", state: "accepted" })
  expect(p.sent.filter(send => send.path === "/commerce/v1/commands").map(send => JSON.parse(send.raw).command)).toEqual(["booking.request", "request.status"])
  expect(p.state.bookingsCreated).toBe(1)
})
