// @vitest-environment edge-runtime
/**
 * P14 : scénarios ÉCRITS, NON EXÉCUTÉS (décision du propriétaire du 18/10/2026 : « Continuer
 * sans vérifier »). PRO.GA est simulé par un `fetch` qui répond selon les deux contrats
 * (P06 et PRO-COMMERCE-SERVICE-CONTROL-V1) ; chaque réponse est corrélée aux octets reçus.
 */
import { COMMERCE_COMMAND_CONTRACT, COMMERCE_PUBLIC_CONTRACT, commerceCanonicalJson } from "@antsia/social-domain/commerce/primitives"
import { commercePublicEffect, type CommerceOfferEvent, type CommercePublicEvent, type CommerceShopEvent } from "@antsia/social-domain/commerce/projection"
import { COMMERCE_INQUIRY_CONSENT_VERSION } from "@antsia/social-domain/commerce-inquiry"
import { COMMERCE_LINK_CONSENT_VERSION } from "@antsia/social-domain/commerce-link"
import { COMMERCE_SERVICE_CONSENTS, COMMERCE_SERVICE_CONTROL_CONTRACT } from "@antsia/social-domain/commerce-services"
import { federationSigningText } from "@antsia/social-domain/federationProtocol"
import { makeFunctionReference } from "convex/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { api, internal } from "../../_generated/api"
import type { Id } from "../../_generated/dataModel"
import { SEED_CONFIRMATION } from "../../seeds/foundations"
import { createTestOperatorProof, createTestSession, testConvex } from "../../test.setup"
import { directlyOwned, exportableRecord, type DataRecord } from "../people/dataInventory"
import { readCommerceLinkConfig } from "./commerceLinkConfig"
import { sha256Hex } from "./commerceLinkCrypto"
import { SHOP_PUBLIC_LISTING_TEXT_VERSION } from "./rules"
import { revokeServicesForPerson } from "./serviceLifecycle"
import type { ServiceDelivery } from "./serviceFlow"
import type { ServiceActionResult, ServiceIntentLookup, ServiceOptionsResult, ServiceQuoteResult, ServiceRequestDto, ServiceSlotsResult, ServiceStopIntentResult } from "./serviceRules"

const NOW = Date.UTC(2026, 9, 18, 12)
const HOUR = 3_600_000
const SHOP = "pro.ga:structure:01JA00000000000000000000S1", OFFER = "pro.ga:offer:01JA00000000000000000000V1", LINK = "pro.ga:commerce_link:01JA00000000000000000000K1"
const COLLECTION = "pro.ga:offer_collection:01JA00000000000000000000C1"
const SERVICE = "pro.ga:agenda_service:01JA00000000000000000000A1", RESOURCE = "pro.ga:agenda_resource:01JA00000000000000000000R1"
const APPOINTMENT = "pro.ga:appointment:01JA00000000000000000000T1", APPOINTMENT_2 = "pro.ga:appointment:01JA00000000000000000000T2"
const QUOTE = "pro.ga:quote:01JA00000000000000000000Q1", INQUIRY = "pro.ga:inquiry:01JA00000000000000000000N1", ORDER = "pro.ga:order:01JA00000000000000000000D1"
const KEY_NAME = "ANTSIA_FEDERATION_SERVICES_TEST_KEY", KEY = "services-test-secret-key-sandbox-0123456789"
const SLOT = { startAt: NOW + 48 * HOUR, endAt: NOW + 49 * HOUR }
const NEW_SLOT = { startAt: NOW + 72 * HOUR, endAt: NOW + 73 * HOUR }
let eventSequence = 0

type Net = { networkId: Id<"networks"> }
type Money = { amount: number; currency: "XAF" }
const catalogPolicy = makeFunctionReference<"mutation", Net & { enabled: boolean; reason: string }, null>("modules/shops/catalogControl:setPolicy")
const mapping = makeFunctionReference<"mutation", Net & { shopId: Id<"shops">; emitterId: Id<"federationEmitters">; enabled: boolean; reason: string }, null>("modules/shops/catalogControl:configureMapping")
const servicePolicy = makeFunctionReference<"mutation", Net & { enabled: boolean; reason: string }, null>("modules/shops/servicePolicy:setPolicy")
const options = makeFunctionReference<"action", Net & { handle: string; offerRef: string }, ServiceOptionsResult>("modules/shops/serviceActions:options")
const slots = makeFunctionReference<"action", Net & { handle: string; offerRef: string; serviceRef: string; fromAt: number; toAt: number }, ServiceSlotsResult>("modules/shops/serviceActions:slots")
const book = makeFunctionReference<"action", Net & { handle: string; offerRef: string; serviceRef: string; serviceLabel: string; resourceRef?: string; startAt: number; endAt: number; note?: string; consentTextVersion: string; clientRequestId: string }, ServiceActionResult>("modules/shops/serviceActions:book")
const reschedule = makeFunctionReference<"action", Net & { requestRowId: string; startAt: number; endAt: number; resourceRef?: string; expectedRevision: number; consentTextVersion: string; clientRequestId: string }, ServiceActionResult>("modules/shops/serviceActions:reschedule")
const cancel = makeFunctionReference<"action", Net & { requestRowId: string; expectedRevision: number; consentTextVersion: string; clientRequestId: string }, ServiceActionResult>("modules/shops/serviceActions:cancel")
const refresh = makeFunctionReference<"action", Net & { requestRowId: string }, "updated" | "unavailable" | "nothing">("modules/shops/serviceActions:refresh")
const retry = makeFunctionReference<"action", Net & { requestRowId: string }, ServiceActionResult>("modules/shops/serviceActions:retry")
const requestQuote = makeFunctionReference<"action", Net & { handle: string; offerRef: string; threadId: Id<"commercialThreads">; need: string; constraints?: string; attachmentMessageIds: Id<"commercialMessages">[]; consentTextVersion: string; clientRequestId: string }, ServiceActionResult>("modules/shops/serviceActions:requestQuote")
const readQuote = makeFunctionReference<"action", Net & { requestRowId: string; quoteRef: string }, ServiceQuoteResult>("modules/shops/serviceActions:quote")
const acceptQuote = makeFunctionReference<"action", Net & { requestRowId: string; quoteRef: string; quoteVersion: number; acceptedTotal: Money; consentTextVersion: string; clientRequestId: string }, ServiceActionResult>("modules/shops/serviceActions:acceptQuote")
const orderService = makeFunctionReference<"action", Net & { handle: string; offerRef: string; quantity: number; expectedUnitAmount: Money; expectedCatalogRevision: number; consentTextVersion: string; clientRequestId: string; existingRequestRowId?: string }, ServiceActionResult>("modules/shops/serviceActions:orderService")
const myRequest = makeFunctionReference<"query", Net & { requestRowId: string }, ServiceRequestDto | null>("modules/shops/services:myRequest")
const expirePrivate = makeFunctionReference<"mutation", { commandId: string }, null>("modules/shops/serviceFlow:expirePrivate")
const findIntent = makeFunctionReference<"query", Net & { clientRequestId: string }, ServiceIntentLookup>("modules/shops/services:findByClientRequestId")
const stopIntent = makeFunctionReference<"mutation", Net & { clientRequestId: string }, ServiceStopIntentResult>("modules/shops/services:stopClientIntent")
const admitLookup = makeFunctionReference<"mutation", Net & { requestRowId: string; requestId: string; leaseToken: string; configFingerprint: string; resend: boolean }, ServiceDelivery | null>("modules/shops/serviceFlow:admitLookup")
const authorizeDelivery = makeFunctionReference<"mutation", Net & { delivery: ServiceDelivery; configFingerprint: string }, boolean>("modules/shops/serviceFlow:authorize")
const finishDelivery = makeFunctionReference<"mutation", Net & { delivery: ServiceDelivery; rawResponse?: string; httpStatus?: number }, ServiceActionResult>("modules/shops/serviceFlow:finish")
const admitQuote = makeFunctionReference<"mutation", Net & {
  handle: string; offerRef: string; threadId: Id<"commercialThreads">; need: string; attachmentMessageIds: Id<"commercialMessages">[]; consentTextVersion: string;
  requestRowId: string; commandId: string; requestId: string; leaseToken: string; configFingerprint: string; clientRequestId: string;
}, ServiceDelivery | ServiceActionResult>("modules/shops/serviceFlow:admitQuoteRequest")
const discoverAvailability = makeFunctionReference<"query", Net, { available: boolean }>("modules/shops/services:discoverAvailability")
const discoverServices = makeFunctionReference<"query", Net & { paginationOpts: { cursor: string | null; numItems: number } }, { page: Array<{ offerRef: string; kind: string }>; isDone: boolean; continueCursor: string }>("modules/shops/services:discoverServices")

beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(NOW); eventSequence = 0
  vi.stubEnv("CONVEX_CLOUD_URL", "http://127.0.0.1:3210"); vi.stubEnv("FEDERATION_ENVIRONMENT", "sandbox"); vi.stubEnv(KEY_NAME, KEY)
  vi.stubEnv("ANTSIA_COMMERCE_ENVIRONMENT", "sandbox"); vi.stubEnv("ANTSIA_COMMERCE_SOURCE", "antsia")
  vi.stubEnv("ANTSIA_COMMERCE_PRO_HTTP_ORIGIN", "http://localhost:4010"); vi.stubEnv("ANTSIA_COMMERCE_PRO_APP_ORIGIN", "http://localhost:4011")
  vi.stubEnv("ANTSIA_COMMERCE_ORIGIN", "http://localhost:3030"); vi.stubEnv("ANTSIA_COMMERCE_KEY_ID", "antsia-services-test"); vi.stubEnv("ANTSIA_COMMERCE_SIGNING_KEY", KEY)
  vi.stubEnv("FILE_GUARD", "off")
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks() })

// ─── Harnais : boutique de services publiée, liaison et politique ouvertes ──

async function member(t: ReturnType<typeof testConvex>, root: Id<"networks">, subject: string, handle: string) {
  const as = t.withIdentity({ subject })
  const personId = await as.mutation(api.modules.people.persons.ensureMyPerson, {})
  await as.mutation(api.modules.people.consents.recordConsent, { purpose: "social_profile", origin: "onboarding" })
  await as.mutation(api.modules.people.profile.publishMyProfile, { handle, displayName: handle })
  await as.mutation(api.modules.people.memberships.joinNetwork, { networkId: root })
  return { as, personId }
}

async function fixture({ openPolicy = true }: { openPolicy?: boolean } = {}) {
  const t = testConvex()
  const { root } = await t.mutation(internal.seeds.foundations.run, { confirmNonProduction: SEED_CONFIRMATION })
  const owner = await member(t, root, "services-owner-fixture", "services-owner")
  await t.run(async (ctx) => ctx.db.insert("operators", { personId: owner.personId, role: "platform_admin", grantedAt: NOW }))
  await createTestOperatorProof(t, owner.as, owner.personId)
  const config = await readCommerceLinkConfig()
  if (!config) throw new Error("Configuration de fixture absente")
  const shop = await t.run(async (ctx) => {
    await ctx.db.insert("commerceCatalogIndexes", { networkId: root, version: 2, generation: 1, status: "ready", updatedAt: NOW })
    const pageId = await ctx.db.insert("pages", { networkId: root, handle: "salon-test", name: "Salon de recette", description: "Prestations de recette", ownerKind: "company", trust: "community", trustRank: 1, visibility: "network", onRoot: true, status: "active", createdByPersonId: owner.personId, searchText: "salon recette", createdAt: NOW, updatedAt: NOW })
    await ctx.db.insert("pageSignatories", { networkId: root, pageId, personId: owner.personId, role: "admin", acceptedAt: NOW, createdAt: NOW, updatedAt: NOW })
    const shopId = await ctx.db.insert("shops", { networkId: root, pageId, preparedByPersonId: owner.personId, model: "quote_services", storefront: "published", visibility: "network", publicConsentAt: NOW, publicConsentTextVersion: SHOP_PUBLIC_LISTING_TEXT_VERSION, publicConsentByPersonId: owner.personId, publishedAt: NOW, createdAt: NOW, updatedAt: NOW })
    const linkId = await ctx.db.insert("shopCommerceLinks", { networkId: root, shopId, pageId, personId: owner.personId, state: "active", source: "antsia", environment: "sandbox", configFingerprint: config.fingerprint, subjectRef: `antsia:sub:${"a".repeat(32)}`, antsiaShopRef: `antsia:shop:${"b".repeat(32)}`, shopRef: SHOP, linkRef: LINK, permissions: ["publish_catalog", "receive_bookings", "receive_inquiries", "receive_orders"], consentTextVersion: COMMERCE_LINK_CONSENT_VERSION, consentedAt: NOW, linkedAt: NOW, createdAt: NOW, updatedAt: NOW })
    await ctx.db.insert("shopNetworkPolicies", { networkId: root, storefront: "review", updatedAt: NOW })
    await ctx.db.insert("moderationPolicies", { networkId: root, surface: "commerceOffer", preReview: false, maxLinks: 20, maxWrites: 100, windowMs: 60_000, updatedAt: NOW })
    await ctx.db.insert("commercialNetworkPolicies", { networkId: root, enabled: true, updatedAt: NOW })
    return { pageId, shopId, linkId }
  })
  const emitterId = await owner.as.mutation(api.modules.federation.emitters.configure, { networkId: root, slug: "pro-services-test", environment: "sandbox", enabled: true, keyEnvName: KEY_NAME, allowedContracts: [COMMERCE_PUBLIC_CONTRACT], reason: "Émetteur fictif des services dans le harnais" })
  await owner.as.mutation(catalogPolicy, { networkId: root, enabled: true, reason: "Politique fictive de lecture du catalogue" })
  await owner.as.mutation(mapping, { networkId: root, shopId: shop.shopId, emitterId, enabled: true, reason: "Mapping fictif de la boutique de services" })
  if (openPolicy) await owner.as.mutation(servicePolicy, { networkId: root, enabled: true, reason: "Ouverture fictive des services pour la recette" })
  const buyer = await member(t, root, "services-buyer-fixture", "services-buyer")
  const f = { t, root, owner, buyer, ...shop }
  await publish(f)
  return f
}
type Fixture = Awaited<ReturnType<typeof fixture>>

function shopEvent(): CommerceShopEvent {
  return { type: "shop.published", shopRef: SHOP, linkRef: LINK, revision: 1, changedAt: NOW, commercialName: "Salon", country: "GA", currency: "XAF", sellerVerification: "unverified", capabilities: ["catalog"], collections: [{ collectionRef: COLLECTION, label: "Prestations", position: 0 }] }
}
function offerEvent(): CommerceOfferEvent {
  return { type: "offer.published", shopRef: SHOP, offerRef: OFFER, revision: 1, changedAt: NOW, kind: "service", title: "Coupe et coiffage", description: "Une prestation publique de recette.", collectionRefs: [COLLECTION], tags: ["recette"], price: { mode: "fixed", currency: "XAF", amount: 15_000 }, showsAvailability: false, variants: [], variantAxes: [], media: [] }
}
async function deliverEvent(f: Pick<Fixture, "t">, payload: CommercePublicEvent) {
  const raw = commerceCanonicalJson({ contract: COMMERCE_PUBLIC_CONTRACT, eventId: `services-event-${++eventSequence}`, objectRef: commercePublicEffect(payload).objectRef, payload, version: 1 })!
  const timestamp = String(Math.floor(Date.now() / 1000))
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(KEY), { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
  const bytes = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(federationSigningText("sandbox", timestamp, raw)))
  const signature = Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("")
  const response = await f.t.fetch("/federation/inbox", { method: "POST", body: raw, headers: { "x-antsia-emitter": "pro-services-test", "x-antsia-environment": "sandbox", "x-antsia-timestamp": timestamp, "x-antsia-signature": signature } })
  expect(response.status).toBe(202)
}
async function publish(f: Pick<Fixture, "t">) { await deliverEvent(f, shopEvent()); await deliverEvent(f, offerEvent()) }

// ─── PRO.GA simulé ───────────────────────────────────────────────────────────

type Booking = { appointmentRef: string; startAt: number; endAt: number; state: "requested" | "confirmed" | "cancelled_by_client" | "cancelled_by_pro"; revision: number; cancellation: null | "client" | "expired" | "professional" | "rescheduled"; replacementRef: string | null; replacesRef: string | null }
type Peer = ReturnType<typeof peer>

function view(booking: Booking) {
  const open = booking.state === "requested" || booking.state === "confirmed"
  return {
    appointmentRef: booking.appointmentRef, cancellation: booking.cancellation, endAt: booking.endAt, holdExpiresAt: booking.state === "requested" && !booking.replacesRef ? NOW + 30 * 60_000 : null,
    policy: { cancelUntil: open ? booking.startAt : null, changeRequiresConfirmation: true, changeUntil: open && !booking.replacementRef ? booking.startAt - 2 * HOUR : null, deposit: "unavailable" },
    replacementRef: booking.replacementRef, replacesRef: booking.replacesRef, resourceLabel: "Salle 1", revision: booking.revision, serviceLabel: "Coupe",
    serviceRef: SERVICE, startAt: booking.startAt, state: booking.state, timeZone: "Africa/Libreville", updatedAt: Date.now(),
  }
}

function peer() {
  const sent: { path: string; raw: string }[] = []
  const bookings = new Map<string, Booking>()
  const recorded = new Map<string, string>()
  const state = {
    timeout: false, forget: true, bookingState: "requested" as "requested" | "confirmed", takenSlot: null as number | null,
    rescheduleMode: "pending" as "pending" | "swap" | "refuse", quoteVersion: 1, quoteTotal: 40_000, orderUnitAmount: 15_000, orderRevision: 1,
  }
  const control = async (raw: string, outcome: string, body: Record<string, unknown>) => {
    const request = JSON.parse(raw) as { requestId: string }
    return commerceCanonicalJson({ contract: COMMERCE_SERVICE_CONTROL_CONTRACT, version: 1, requestId: request.requestId, requestSha256: await sha256Hex(raw), respondedAt: Date.now(), outcome, ...body })!
  }
  const command = async (raw: string, outcome: string, body: Record<string, unknown>) => {
    const request = JSON.parse(raw) as { requestId: string; command: string }
    return commerceCanonicalJson({ contract: COMMERCE_COMMAND_CONTRACT, version: 1, command: request.command, requestId: request.requestId, requestSha256: await sha256Hex(raw), respondedAt: Date.now(), outcome, ...body })!
  }
  const quote = (version: number, total: number) => ({
    acceptable: true, clientAcceptance: null, current: true, inquiryRef: INQUIRY, quoteRef: QUOTE, reference: "DEV-2026-001", sentAt: NOW, state: "sent",
    title: "Coupe et coiffage", total: { amount: total, currency: "XAF" }, validUntil: NOW + 7 * 24 * HOUR, version,
  })
  const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(input)).pathname, raw = String(init?.body)
    sent.push({ path, raw })
    const request = JSON.parse(raw) as Record<string, unknown> & { payload: Record<string, unknown>; requestId: string }
    const reply = (body: string, status = 200) => new Response(body, { status })
    if (path === "/commerce/v1/commands") {
      const name = request.command
      if (name === "request.status") {
        const target = String(request.payload.targetRequestId), known = recorded.get(target)
        const complete = known !== undefined && !state.forget
        return reply(await command(raw, "accepted", { result: { targetRequestId: target, state: complete ? "completed" : "unknown", current: [], ...(complete ? { recordedResponse: known, recordedResponseSha256: await sha256Hex(known) } : {}) } }))
      }
      // Même clé + mêmes octets : PRO.GA rejoue la réponse enregistrée, sans nouvel effet.
      const replayed = recorded.get(request.requestId)
      if (replayed !== undefined) return reply(replayed, replayed.includes('"outcome":"rejected"') ? 422 : 200)
      let body: string
      if (name === "booking.request") {
        const slot = request.payload.slot as { startAt: number; endAt: number }
        if (state.takenSlot === slot.startAt) body = await command(raw, "rejected", { reason: "slot_unavailable" })
        else {
          state.takenSlot = slot.startAt
          bookings.set(APPOINTMENT, { appointmentRef: APPOINTMENT, startAt: slot.startAt, endAt: slot.endAt, state: state.bookingState, revision: 1, cancellation: null, replacementRef: null, replacesRef: null })
          body = await command(raw, "accepted", { result: { appointmentRef: APPOINTMENT, endAt: slot.endAt, startAt: slot.startAt, state: state.bookingState, timeZone: "Africa/Libreville", ...(state.bookingState === "requested" ? { holdExpiresAt: Date.now() + 30 * 60_000 } : {}) } })
        }
      } else if (name === "inquiry.submit") body = await command(raw, "accepted", { result: { inquiryRef: INQUIRY, state: "submitted", submittedAt: Date.now() } })
      else if (name === "quote.accept") {
        const version = Number(request.payload.quoteVersion)
        body = version !== state.quoteVersion
          ? await command(raw, "reconfirm_required", { result: { currentTotal: { amount: state.quoteTotal, currency: "XAF" }, currentVersion: state.quoteVersion, quoteRef: QUOTE, state: "reconfirm" } })
          : await command(raw, "accepted", { result: { acceptedAt: Date.now(), orderRef: ORDER, quoteRef: QUOTE, quoteVersion: version, state: "accepted" } })
      } else throw new Error("Commande P06 interdite dans le harnais")
      recorded.set(request.requestId, body)
      if (state.timeout) throw new Error("Délai simulé")
      return reply(body, body.includes('"outcome":"rejected"') ? 422 : 200)
    }
    if (path === "/commerce/v1/services/options") {
      return reply(await control(raw, "accepted", { result: {
        booking: { services: [{ autoConfirm: false, description: null, durationMinutes: 60, holdMinutes: 30, label: "Coupe", maxAdvanceDays: 30, minNoticeMinutes: 120, serviceRef: SERVICE }] },
        fixedOrder: { catalogRevision: 1, leadTimeDays: 2, quantityMax: 5, unit: null, unitAmount: { amount: 15_000, currency: "XAF" } }, offerRef: OFFER, quote: { available: true }, timeZone: "Africa/Libreville",
      } }))
    }
    if (path === "/commerce/v1/services/bookings/slots") {
      const fromAt = Number(request.payload.fromAt), toAt = Number(request.payload.toAt)
      const free = [SLOT, NEW_SLOT].filter((slot) => slot.startAt >= fromAt && slot.startAt < toAt && slot.startAt !== state.takenSlot)
      return reply(await control(raw, "accepted", { result: { durationMinutes: 60, fromAt, serviceRef: SERVICE, slots: free.map((slot) => ({ ...slot, resourceLabel: "Salle 1", resourceRef: RESOURCE })), timeZone: "Africa/Libreville", toAt, truncated: false } }))
    }
    if (path === "/commerce/v1/services/bookings/read") {
      const booking = bookings.get(String(request.payload.appointmentRef))
      return reply(booking ? await control(raw, "accepted", { result: { booking: view(booking) } }) : await control(raw, "refused", { reason: "access_denied" }), booking ? 200 : 422)
    }
    const replayedControl = recorded.get(request.requestId)
    if (replayedControl !== undefined && !path.endsWith("/actions/status")) return reply(replayedControl, replayedControl.includes('"outcome":"refused"') ? 422 : 200)
    if (path === "/commerce/v1/services/bookings/reschedule-requests") {
      const previous = bookings.get(String(request.payload.appointmentRef))!, slot = request.payload.slot as { startAt: number; endAt: number }
      if (state.rescheduleMode === "refuse") return reply(await control(raw, "refused", { reason: "slot_unavailable" }), 422)
      const swapped = state.rescheduleMode === "swap"
      const current: Booking = { appointmentRef: APPOINTMENT_2, startAt: slot.startAt, endAt: slot.endAt, state: swapped ? "confirmed" : "requested", revision: 1, cancellation: null, replacementRef: null, replacesRef: previous.appointmentRef }
      const before: Booking = swapped ? { ...previous, state: "cancelled_by_client", cancellation: "rescheduled", revision: previous.revision + 1 } : { ...previous, replacementRef: APPOINTMENT_2, revision: previous.revision + 1 }
      bookings.set(APPOINTMENT_2, current); bookings.set(previous.appointmentRef, before)
      const body = await control(raw, "accepted", { result: { current: view(current), previous: view(before) } })
      recorded.set(request.requestId, body)
      return reply(body)
    }
    if (path === "/commerce/v1/services/bookings/cancellation-requests") {
      const booking = bookings.get(String(request.payload.appointmentRef))!
      const cancelled: Booking = { ...booking, state: "cancelled_by_client", cancellation: "client", revision: booking.revision + 1, replacementRef: null }
      bookings.set(booking.appointmentRef, cancelled)
      return reply(await control(raw, "accepted", { result: { booking: view(cancelled) } }))
    }
    if (path === "/commerce/v1/services/quotes/read") {
      const detail = { ...quote(state.quoteVersion, state.quoteTotal), lines: [{ label: "Prestation", lineAmount: { amount: state.quoteTotal, currency: "XAF" }, quantity: 1, unitAmount: { amount: state.quoteTotal, currency: "XAF" } }], notes: null, sellerLabel: "Salon" }
      return reply(await control(raw, "accepted", { result: { quote: detail } }))
    }
    if (path === "/commerce/v1/services/quotes/list") return reply(await control(raw, "accepted", { result: { quotes: [quote(state.quoteVersion, state.quoteTotal)], truncated: false } }))
    if (path === "/commerce/v1/services/orders") {
      const unit = request.payload.expectedUnitAmount as Money, revision = Number(request.payload.expectedCatalogRevision), quantity = Number(request.payload.quantity)
      const body = unit.amount !== state.orderUnitAmount || revision !== state.orderRevision
        ? await control(raw, "reconfirm_required", { result: { currentCatalogRevision: state.orderRevision, currentUnitAmount: { amount: state.orderUnitAmount, currency: "XAF" }, state: "reconfirm" } })
        : await control(raw, "accepted", { result: { catalogRevision: revision, createdAt: Date.now(), lines: [{ label: "Coupe et coiffage", lineAmount: { amount: unit.amount * quantity, currency: "XAF" }, quantity, unitAmount: unit }], orderRef: ORDER, state: "pending", total: { amount: unit.amount * quantity, currency: "XAF" } } })
      recorded.set(request.requestId, body)
      return reply(body)
    }
    if (path === "/commerce/v1/services/actions/status") {
      const target = String(request.payload.targetRequestId), known = recorded.get(target)
      const complete = known !== undefined && !state.forget
      return reply(await control(raw, "accepted", { result: { targetRequestId: target, state: complete ? "completed" : "unknown", current: [], ...(complete ? { recordedResponse: known, recordedResponseSha256: await sha256Hex(known) } : {}) } }))
    }
    throw new Error(`Chemin interdit dans le harnais : ${path}`)
  })
  vi.stubGlobal("fetch", fetcher)
  return { sent, state, bookings, fetcher }
}

const bookIntent = (f: Fixture, clientRequestId = "service-booking-client-0001", slot = SLOT) => ({
  networkId: f.root, handle: "salon-test", offerRef: OFFER, serviceRef: SERVICE, serviceLabel: "Coupe", resourceRef: RESOURCE, ...slot,
  note: "Merci de prévoir une serviette.", consentTextVersion: COMMERCE_SERVICE_CONSENTS.booking.textVersion, clientRequestId,
})
async function booked(f: Fixture, p: Peer, state: "requested" | "confirmed" = "confirmed"): Promise<string> {
  p.state.bookingState = state
  const result = await f.buyer.as.action(book, bookIntent(f))
  if (result.outcome !== "request" || result.state !== "accepted") throw new Error("Rendez-vous manquant dans le harnais")
  return result.requestRowId
}
async function requestRow(f: Fixture, requestRowId: string) {
  return await f.t.run(async (ctx) => ctx.db.query("commerceServiceRequests").withIndex("by_request", (q) => q.eq("requestRowId", requestRowId)).unique())
}
async function commands(f: Fixture, requestRowId: string) {
  return await f.t.run(async (ctx) => ctx.db.query("commerceServiceCommands").withIndex("by_request_row", (q) => q.eq("requestRowId", requestRowId)).take(25))
}
const p06 = (p: Peer, name: string) => p.sent.filter((item) => item.path === "/commerce/v1/commands" && JSON.parse(item.raw).command === name)

// ─── Scénarios ───────────────────────────────────────────────────────────────

describe("P14 — politique, autorité et refus indistincts", () => {
  it("politique fermée par défaut : aucun parcours, rien n'est envoyé", async () => {
    const f = await fixture({ openPolicy: false }), p = peer()
    expect(await f.buyer.as.action(options, { networkId: f.root, handle: "salon-test", offerRef: OFFER })).toEqual({ outcome: "unavailable" })
    expect(await f.buyer.as.action(book, bookIntent(f))).toEqual({ outcome: "refused" })
    expect(p.sent).toHaveLength(0)
  })

  it("mauvaise version de consentement, boutique inconnue, offre d'une autre boutique : refus sans envoi", async () => {
    const f = await fixture(), p = peer()
    expect(await f.buyer.as.action(book, { ...bookIntent(f), consentTextVersion: "2026-01-01-ancienne" })).toEqual({ outcome: "refused" })
    expect(await f.buyer.as.action(book, { ...bookIntent(f), handle: "boutique-inconnue" })).toEqual({ outcome: "refused" })
    expect(await f.buyer.as.action(book, { ...bookIntent(f), offerRef: "pro.ga:offer:01JA00000000000000000000V9" })).toEqual({ outcome: "refused" })
    expect(p06(p, "booking.request")).toHaveLength(0)
  })

  it("liaison sans permission de rendez-vous ou mandat révoqué : aucun créneau demandé", async () => {
    const f = await fixture(), p = peer()
    await f.t.run(async (ctx) => ctx.db.patch(f.linkId, { permissions: ["publish_catalog", "receive_inquiries"] }))
    expect(await f.buyer.as.action(book, bookIntent(f))).toEqual({ outcome: "refused" })
    await f.t.run(async (ctx) => ctx.db.patch(f.linkId, { state: "revoked", revokedAt: NOW }))
    expect(await f.buyer.as.action(options, { networkId: f.root, handle: "salon-test", offerRef: OFFER })).toEqual({ outcome: "unavailable" })
    expect(p.sent).toHaveLength(0)
  })

  it("la demande d'autrui reste introuvable et ne s'annule pas", async () => {
    const f = await fixture(), p = peer(), requestRowId = await booked(f, p)
    const stranger = await member(f.t, f.root, "services-stranger-fixture", "services-stranger")
    expect(await stranger.as.query(myRequest, { networkId: f.root, requestRowId })).toBeNull()
    expect(await stranger.as.action(cancel, { networkId: f.root, requestRowId, expectedRevision: 1, consentTextVersion: COMMERCE_SERVICE_CONSENTS.booking_cancel.textVersion, clientRequestId: "stranger-cancel-0001" })).toEqual({ outcome: "refused" })
    expect(p.sent.some((item) => item.path.endsWith("/cancellation-requests"))).toBe(false)
  })
})

describe("P14 — rendez-vous", () => {
  it("créneau retenu : instant et fuseau explicites, politique relue, aucun paiement", async () => {
    const f = await fixture(), p = peer()
    const offered = await f.buyer.as.action(options, { networkId: f.root, handle: "salon-test", offerRef: OFFER })
    expect(offered).toMatchObject({ outcome: "ready", timeZone: "Africa/Libreville", quote: { available: true }, fixedOrder: { unitAmount: { amount: 15_000 } } })
    expect(await f.buyer.as.action(slots, { networkId: f.root, handle: "salon-test", offerRef: OFFER, serviceRef: SERVICE, fromAt: NOW, toAt: NOW + 7 * 24 * HOUR })).toMatchObject({ outcome: "ready", slots: [{ startAt: SLOT.startAt, resourceRef: RESOURCE }, { startAt: NEW_SLOT.startAt }] })
    const requestRowId = await booked(f, p, "requested")
    const sent = JSON.parse(p06(p, "booking.request")[0]!.raw)
    expect(sent.payload.slot).toEqual({ endAt: SLOT.endAt, startAt: SLOT.startAt, timeZone: "Africa/Libreville" })
    expect(sent.subject.kind).toBe("buyer")
    expect(sent.subject.ref).not.toContain(String(f.buyer.personId))
    const dto = await f.buyer.as.query(myRequest, { networkId: f.root, requestRowId })
    expect(dto).toMatchObject({ mode: "booking", state: "active", paymentAvailable: false, booking: { appointmentRef: APPOINTMENT, state: "requested", timeZone: "Africa/Libreville", revision: 1, policy: { deposit: "unavailable" } } })
    expect(dto?.booking?.holdExpiresAt).not.toBeNull()
    expect(dto).not.toHaveProperty("subjectRef")
  })

  it("même clé et même intention : même demande ; autre intention : refus, un seul envoi", async () => {
    const f = await fixture(), p = peer(), first = await booked(f, p)
    expect(await f.buyer.as.action(book, bookIntent(f))).toMatchObject({ outcome: "request", requestRowId: first, state: "accepted" })
    expect(await f.buyer.as.action(book, bookIntent(f, "service-booking-client-0001", NEW_SLOT))).toEqual({ outcome: "refused" })
    expect(p06(p, "booking.request")).toHaveLength(1)
  })

  it("deux clients, même créneau : le second est refusé, sa demande close sans effet", async () => {
    const f = await fixture(), p = peer()
    await booked(f, p)
    const second = await member(f.t, f.root, "services-second-buyer", "services-second")
    const result = await second.as.action(book, bookIntent(f, "service-booking-client-0002"))
    expect(result).toMatchObject({ outcome: "request", state: "rejected", reason: "slot_unavailable" })
    if (result.outcome !== "request") throw new Error("Résultat attendu")
    expect(await requestRow(f, result.requestRowId)).toMatchObject({ state: "failed", reason: "slot_unavailable" })
  })

  it("réponse perdue : request.status d'abord, mêmes octets ensuite, jamais un nouvel identifiant", async () => {
    const f = await fixture(), p = peer()
    p.state.timeout = true
    const result = await f.buyer.as.action(book, bookIntent(f))
    expect(result).toMatchObject({ outcome: "request", state: "unknown" })
    if (result.outcome !== "request") throw new Error("Résultat attendu")
    const original = p06(p, "booking.request")[0]!.raw
    p.state.timeout = false
    await f.buyer.as.action(retry, { networkId: f.root, requestRowId: result.requestRowId })
    const sentCommands = p.sent.filter((item) => item.path === "/commerce/v1/commands")
    expect(JSON.parse(sentCommands[1]!.raw).command).toBe("request.status")
    expect(sentCommands[2]!.raw).toBe(original)
    expect(new Set(p06(p, "booking.request").map((item) => JSON.parse(item.raw).requestId)).size).toBe(1)
  })

  it("réponse perdue puis reçu enregistré : l'effet s'applique à la consultation, même après reconnexion", async () => {
    const f = await fixture(), p = peer()
    p.state.timeout = true
    const result = await f.buyer.as.action(book, bookIntent(f))
    if (result.outcome !== "request") throw new Error("Résultat attendu")
    p.state.timeout = false; p.state.forget = false
    vi.setSystemTime(NOW + 2 * 60_000)
    const sessionId = await createTestSession(f.t, "services-buyer-fixture")
    const later = f.t.withIdentity({ subject: "services-buyer-fixture", sessionId })
    await later.action(retry, { networkId: f.root, requestRowId: result.requestRowId })
    expect(await requestRow(f, result.requestRowId)).toMatchObject({ state: "active", booking: { appointmentRef: APPOINTMENT } })
    expect(p06(p, "booking.request")).toHaveLength(1)
  })

  it("demande inconnue au-delà de son expiration : expirée, jamais réexécutée", async () => {
    const f = await fixture(), p = peer()
    p.state.timeout = true
    const result = await f.buyer.as.action(book, bookIntent(f))
    if (result.outcome !== "request") throw new Error("Résultat attendu")
    p.state.timeout = false
    vi.setSystemTime(NOW + 10 * 60_000)
    await f.buyer.as.action(retry, { networkId: f.root, requestRowId: result.requestRowId })
    expect((await commands(f, result.requestRowId))[0]).toMatchObject({ state: "expired", reason: "request_expired" })
    expect(await requestRow(f, result.requestRowId)).toMatchObject({ state: "failed", reason: "request_expired" })
    expect(p06(p, "booking.request")).toHaveLength(1)
  })

  it("changement refusé : l'ancien rendez-vous est conservé tel quel", async () => {
    const f = await fixture(), p = peer(), requestRowId = await booked(f, p)
    const before = await requestRow(f, requestRowId)
    p.state.rescheduleMode = "refuse"
    const result = await f.buyer.as.action(reschedule, { networkId: f.root, requestRowId, ...NEW_SLOT, resourceRef: RESOURCE, expectedRevision: 1, consentTextVersion: COMMERCE_SERVICE_CONSENTS.booking_change.textVersion, clientRequestId: "service-change-client-0001" })
    expect(result).toMatchObject({ outcome: "request", state: "rejected", reason: "slot_unavailable" })
    expect((await requestRow(f, requestRowId))?.booking).toEqual(before?.booking)
    expect((await requestRow(f, requestRowId))?.pendingReplacement).toBeUndefined()
  })

  it("changement en attente puis confirmé : le remplaçant devient le rendez-vous tenu", async () => {
    const f = await fixture(), p = peer(), requestRowId = await booked(f, p)
    p.state.rescheduleMode = "pending"
    await f.buyer.as.action(reschedule, { networkId: f.root, requestRowId, ...NEW_SLOT, resourceRef: RESOURCE, expectedRevision: 1, consentTextVersion: COMMERCE_SERVICE_CONSENTS.booking_change.textVersion, clientRequestId: "service-change-client-0002" })
    expect(await requestRow(f, requestRowId)).toMatchObject({ booking: { appointmentRef: APPOINTMENT, state: "confirmed", replacementRef: APPOINTMENT_2 }, pendingReplacement: { appointmentRef: APPOINTMENT_2, state: "requested" } })
    // Le professionnel confirme le remplaçant ; PRO.GA libère l'ancien.
    p.bookings.set(APPOINTMENT_2, { ...p.bookings.get(APPOINTMENT_2)!, state: "confirmed", revision: 2 })
    p.bookings.set(APPOINTMENT, { ...p.bookings.get(APPOINTMENT)!, state: "cancelled_by_client", cancellation: "rescheduled", replacementRef: null, revision: 3 })
    expect(await f.buyer.as.action(refresh, { networkId: f.root, requestRowId })).toBe("updated")
    const row = await requestRow(f, requestRowId)
    expect(row).toMatchObject({ state: "active", booking: { appointmentRef: APPOINTMENT_2, state: "confirmed" } })
    expect(row?.pendingReplacement).toBeUndefined()
  })

  it("une seconde demande de changement attend la fin de la première", async () => {
    const f = await fixture(), p = peer(), requestRowId = await booked(f, p)
    await f.buyer.as.action(reschedule, { networkId: f.root, requestRowId, ...NEW_SLOT, resourceRef: RESOURCE, expectedRevision: 1, consentTextVersion: COMMERCE_SERVICE_CONSENTS.booking_change.textVersion, clientRequestId: "service-change-client-0003" })
    const count = p.sent.length
    expect(await f.buyer.as.action(reschedule, { networkId: f.root, requestRowId, ...SLOT, resourceRef: RESOURCE, expectedRevision: 2, consentTextVersion: COMMERCE_SERVICE_CONSENTS.booking_change.textVersion, clientRequestId: "service-change-client-0004" })).toEqual({ outcome: "refused" })
    expect(p.sent.length).toBe(count)
  })

  it("annulation : conséquences acceptées, demande close et purge programmée", async () => {
    const f = await fixture(), p = peer(), requestRowId = await booked(f, p)
    const result = await f.buyer.as.action(cancel, { networkId: f.root, requestRowId, expectedRevision: 1, consentTextVersion: COMMERCE_SERVICE_CONSENTS.booking_cancel.textVersion, clientRequestId: "service-cancel-client-0001" })
    expect(result).toMatchObject({ outcome: "request", state: "accepted" })
    const row = await requestRow(f, requestRowId)
    expect(row).toMatchObject({ state: "closed", booking: { state: "cancelled_by_client", cancellation: "client" } })
    expect(row?.purgeAt).toBeGreaterThan(NOW)
  })

  it("le changement de fuseau d'affichage ne change pas l'instant envoyé", async () => {
    const f = await fixture(), p = peer()
    await booked(f, p)
    const sent = JSON.parse(p06(p, "booking.request")[0]!.raw)
    // Un instant UTC, et le seul fuseau du contrat : jamais une heure murale locale.
    expect(sent.payload.slot.startAt).toBe(SLOT.startAt)
    expect(sent.payload.slot.timeZone).toBe("Africa/Libreville")
  })
})

/** Conversation commerciale P10 déjà ACCEPTÉE par la boutique (prérequis d'une demande de devis). */
async function quoteThread(f: Fixture) {
  return await f.t.run(async (ctx) => ctx.db.insert("commercialThreads", { networkId: f.root, shopId: f.shopId, requesterPersonId: f.buyer.personId, offerRef: OFFER, conversationRef: `antsia:conv:${"c".repeat(64)}`, state: "accepted", revision: 2, buyerCallsAllowed: false, createdAt: NOW, updatedAt: NOW, lastMessageAt: NOW }))
}

async function admittedQuote(f: Fixture, threadId: Id<"commercialThreads">, attachmentMessageIds: Id<"commercialMessages">[] = []) {
  const config = (await readCommerceLinkConfig())!
  const delivery = await f.buyer.as.mutation(admitQuote, {
    networkId: f.root, handle: "salon-test", offerRef: OFFER, threadId, need: "Une coupe", attachmentMessageIds, consentTextVersion: COMMERCE_INQUIRY_CONSENT_VERSION,
    requestRowId: "service-admitted-row-0001", commandId: "service-admitted-command-0001", requestId: "service-admitted-request-0001",
    leaseToken: "a".repeat(43), configFingerprint: config.fingerprint, clientRequestId: "service-admitted-client-0001",
  })
  if (!("commandId" in delivery)) throw new Error("Admission de devis attendue")
  return { delivery, config, requestRowId: "service-admitted-row-0001" }
}

describe("P14 — devis et prestation à tarif fixe", () => {

  it("demande de devis depuis une conversation acceptée ; aucune pièce d'autrui admise", async () => {
    const f = await fixture(), p = peer(), threadId = await quoteThread(f)
    const foreign = await f.t.run(async (ctx) => ctx.db.insert("commercialMessages", { networkId: f.root, threadId, senderPersonId: f.owner.personId, senderKind: "shop", content: "Pièce de la boutique", idempotencyKey: "shop-message-0001", digest: "d".repeat(64), createdAt: NOW }))
    const base = { networkId: f.root, handle: "salon-test", offerRef: OFFER, threadId, need: "Coupe pour un mariage, cheveux longs.", constraints: "Samedi matin", consentTextVersion: COMMERCE_INQUIRY_CONSENT_VERSION }
    expect(await f.buyer.as.action(requestQuote, { ...base, attachmentMessageIds: [foreign], clientRequestId: "service-quote-client-0001" })).toEqual({ outcome: "refused" })
    const result = await f.buyer.as.action(requestQuote, { ...base, attachmentMessageIds: [], clientRequestId: "service-quote-client-0002" })
    expect(result).toMatchObject({ outcome: "request", state: "accepted" })
    const sent = JSON.parse(p06(p, "inquiry.submit")[0]!.raw)
    expect(sent.payload).toMatchObject({ kind: "quote_request", offerRef: OFFER, conversationRef: `antsia:conv:${"c".repeat(64)}` })
    expect(sent.payload.message).toContain("Besoin : Coupe pour un mariage")
    expect(sent.payload).not.toHaveProperty("displayName")
    if (result.outcome !== "request") throw new Error("Résultat attendu")
    expect(await requestRow(f, result.requestRowId)).toMatchObject({ mode: "quote", state: "active", inquiryRef: INQUIRY })
  })

  it("conversation non acceptée : aucun devis demandé", async () => {
    const f = await fixture(), p = peer(), threadId = await quoteThread(f)
    await f.t.run(async (ctx) => ctx.db.patch(threadId, { state: "requested" }))
    expect(await f.buyer.as.action(requestQuote, { networkId: f.root, handle: "salon-test", offerRef: OFFER, threadId, need: "Coupe", attachmentMessageIds: [], consentTextVersion: COMMERCE_INQUIRY_CONSENT_VERSION, clientRequestId: "service-quote-client-0003" })).toEqual({ outcome: "refused" })
    expect(p06(p, "inquiry.submit")).toHaveLength(0)
  })

  it("devis révisé : nouvel accord exigé ; la version exacte acceptée ouvre une commande au plus", async () => {
    const f = await fixture(), p = peer(), threadId = await quoteThread(f)
    const created = await f.buyer.as.action(requestQuote, { networkId: f.root, handle: "salon-test", offerRef: OFFER, threadId, need: "Coupe", attachmentMessageIds: [], consentTextVersion: COMMERCE_INQUIRY_CONSENT_VERSION, clientRequestId: "service-quote-client-0004" })
    if (created.outcome !== "request") throw new Error("Résultat attendu")
    const requestRowId = created.requestRowId
    p.state.quoteVersion = 2; p.state.quoteTotal = 45_000
    const stale = await f.buyer.as.action(acceptQuote, { networkId: f.root, requestRowId, quoteRef: QUOTE, quoteVersion: 1, acceptedTotal: { amount: 40_000, currency: "XAF" }, consentTextVersion: COMMERCE_SERVICE_CONSENTS.quote_acceptance.textVersion, clientRequestId: "service-accept-client-0001" })
    expect(stale).toMatchObject({ outcome: "request", state: "reconfirm" })
    expect((await commands(f, requestRowId)).at(-1)).toMatchObject({ state: "reconfirm", currentVersion: 2, currentTotal: { amount: 45_000 } })
    expect((await requestRow(f, requestRowId))?.acceptedQuote).toBeUndefined()
    expect(await f.buyer.as.action(readQuote, { networkId: f.root, requestRowId, quoteRef: QUOTE })).toMatchObject({ outcome: "ready", quote: { version: 2, total: { amount: 45_000 } } })
    const accepted = await f.buyer.as.action(acceptQuote, { networkId: f.root, requestRowId, quoteRef: QUOTE, quoteVersion: 2, acceptedTotal: { amount: 45_000, currency: "XAF" }, consentTextVersion: COMMERCE_SERVICE_CONSENTS.quote_acceptance.textVersion, clientRequestId: "service-accept-client-0002" })
    expect(accepted).toMatchObject({ outcome: "request", state: "accepted" })
    expect(await requestRow(f, requestRowId)).toMatchObject({ acceptedQuote: { quoteRef: QUOTE, quoteVersion: 2, acceptedTotal: { amount: 45_000 }, orderRef: ORDER }, order: { orderRef: ORDER, state: "pending" } })
    // Double acceptance : même clé, même intention → même résultat, aucun second envoi.
    const sentBefore = p06(p, "quote.accept").length
    expect(await f.buyer.as.action(acceptQuote, { networkId: f.root, requestRowId, quoteRef: QUOTE, quoteVersion: 2, acceptedTotal: { amount: 45_000, currency: "XAF" }, consentTextVersion: COMMERCE_SERVICE_CONSENTS.quote_acceptance.textVersion, clientRequestId: "service-accept-client-0002" })).toMatchObject({ outcome: "request", state: "accepted" })
    expect(p06(p, "quote.accept")).toHaveLength(sentBefore)
  })

  it("prestation à tarif fixe : aucune réserve de stock, nouveau tarif reconfirmé sur la même demande", async () => {
    const f = await fixture(), p = peer()
    p.state.orderUnitAmount = 17_000; p.state.orderRevision = 2
    const first = await f.buyer.as.action(orderService, { networkId: f.root, handle: "salon-test", offerRef: OFFER, quantity: 2, expectedUnitAmount: { amount: 15_000, currency: "XAF" }, expectedCatalogRevision: 1, consentTextVersion: COMMERCE_SERVICE_CONSENTS.service_order.textVersion, clientRequestId: "service-order-client-0001" })
    expect(first).toMatchObject({ outcome: "request", state: "reconfirm" })
    if (first.outcome !== "request") throw new Error("Résultat attendu")
    expect(await requestRow(f, first.requestRowId)).toMatchObject({ mode: "fixed_order", state: "pending" })
    const second = await f.buyer.as.action(orderService, { networkId: f.root, handle: "salon-test", offerRef: OFFER, quantity: 2, expectedUnitAmount: { amount: 17_000, currency: "XAF" }, expectedCatalogRevision: 2, consentTextVersion: COMMERCE_SERVICE_CONSENTS.service_order.textVersion, clientRequestId: "service-order-client-0002", existingRequestRowId: first.requestRowId })
    expect(second).toMatchObject({ outcome: "request", requestRowId: first.requestRowId, state: "accepted" })
    expect(await requestRow(f, first.requestRowId)).toMatchObject({ state: "active", order: { orderRef: ORDER, state: "pending", total: { amount: 34_000 } } })
    expect(p.sent.filter((item) => item.path === "/commerce/v1/services/orders")).toHaveLength(2)
    expect(p.sent.some((item) => item.path.startsWith("/commerce/v1/checkouts"))).toBe(false)
  })
})

describe("P14 — données privées, export, effacement, journaux", () => {
  it("corps signés expurgés après trente minutes ; corrélation conservée", async () => {
    const f = await fixture(), p = peer(), requestRowId = await booked(f, p)
    const [command] = await commands(f, requestRowId)
    vi.setSystemTime(NOW + 30 * 60_000 + 1)
    await f.t.mutation(expirePrivate, { commandId: command!.commandId })
    const [after] = await commands(f, requestRowId)
    expect(after?.rawBody).toBeUndefined()
    expect(after?.privatePurgedAt).toBeDefined()
    expect(after).toMatchObject({ bodySha256: command!.bodySha256, slotStartAt: SLOT.startAt, serviceRef: SERVICE })
  })

  it("export : la demande et ses états, jamais les octets signés, la session ni le sujet opaque", async () => {
    const f = await fixture(), p = peer(), requestRowId = await booked(f, p)
    const row = (await requestRow(f, requestRowId)) as unknown as DataRecord
    const [command] = (await commands(f, requestRowId)) as unknown as DataRecord[]
    const exportedRow = exportableRecord("commerceServiceRequests", row, String(f.buyer.personId))
    const exportedCommand = exportableRecord("commerceServiceCommands", command!, String(f.buyer.personId))
    expect(exportedRow).toMatchObject({ requestRowId, mode: "booking" })
    for (const field of ["subjectRef", "linkRef", "shopRef", "conversationRef", "source"]) expect(exportedRow).not.toHaveProperty(field)
    for (const field of ["rawBody", "sessionDigest", "subjectRef", "configFingerprint", "leaseToken", "intentDigest", "bodySha256", "clientRequestId"]) expect(exportedCommand).not.toHaveProperty(field)
    expect(exportableRecord("commerceServiceRequests", row, String(f.owner.personId))).toBeNull()
    expect(exportableRecord("commerceServicePolicies", row, String(f.buyer.personId))).toBeNull()
  })

  it("demande d'effacement : corps et baux expurgés, intention en vol close, demande invisible", async () => {
    const f = await fixture(), p = peer()
    p.state.timeout = true
    const result = await f.buyer.as.action(book, bookIntent(f))
    if (result.outcome !== "request") throw new Error("Résultat attendu")
    await f.t.run(async (ctx) => ctx.db.patch(f.buyer.personId, { deletionRequestedAt: Date.now() }))
    expect(await f.t.run(async (ctx) => revokeServicesForPerson(ctx, f.buyer.personId))).toBe(true)
    const [command] = await commands(f, result.requestRowId)
    expect(command).toMatchObject({ cancelledAt: expect.any(Number), reason: "erasure_requested" })
    expect(command?.rawBody).toBeUndefined()
    expect(await f.buyer.as.query(myRequest, { networkId: f.root, requestRowId: result.requestRowId })).toBeNull()
  })

  it("aucun contenu privé dans le journal ; la décision de politique ne porte que l'état et le motif", async () => {
    const f = await fixture(), p = peer(), threadId = await quoteThread(f)
    await f.buyer.as.action(requestQuote, { networkId: f.root, handle: "salon-test", offerRef: OFFER, threadId, need: "Texte privé du besoin 7f3a", attachmentMessageIds: [], consentTextVersion: COMMERCE_INQUIRY_CONSENT_VERSION, clientRequestId: "service-quote-client-0009" })
    await booked(f, p)
    const audit = await f.t.run(async (ctx) => ctx.db.query("engineAudit").withIndex("by_network_at", (q) => q.eq("networkId", f.root)).take(100))
    expect(JSON.stringify(audit)).not.toContain("Texte privé du besoin 7f3a")
    expect(JSON.stringify(audit)).not.toContain("Merci de prévoir une serviette")
    const decisions = audit.filter((row) => row.action === "service.policy_set")
    expect(decisions).toHaveLength(1)
    expect(Object.keys(decisions[0]!.details ?? {}).sort()).toEqual(["enabled", "reason"])
  })
})

describe("P14 — rubrique Services de Découvrir", () => {
  it("n'existe qu'avec une vraie offre de service publiée, et jamais politique fermée", async () => {
    const f = await fixture()
    expect(await f.buyer.as.query(discoverAvailability, { networkId: f.root })).toEqual({ available: true })
    const window = await f.buyer.as.query(discoverServices, { networkId: f.root, paginationOpts: { cursor: null, numItems: 8 } })
    expect(window.page.map((offer) => [offer.offerRef, offer.kind])).toEqual([[OFFER, "service"]])
    await f.owner.as.mutation(servicePolicy, { networkId: f.root, enabled: false, reason: "Fermeture fictive des services pour la recette" })
    expect(await f.buyer.as.query(discoverAvailability, { networkId: f.root })).toEqual({ available: false })
    expect((await f.buyer.as.query(discoverServices, { networkId: f.root, paginationOpts: { cursor: null, numItems: 8 } })).page).toEqual([])
  })
})

// Reprise du 20/10 : scénarios écrits uniquement, aucun contrôle exécuté.
describe("P14 — clés clôturées, reconnexion et autorité au dernier instant", () => {
  it("absence certaine puis clôture idempotente : l'ancienne clé ne peut plus créer de rendez-vous", async () => {
    const f = await fixture(), p = peer(), intent = bookIntent(f)
    const key = { networkId: f.root, clientRequestId: intent.clientRequestId }
    expect(await f.buyer.as.query(findIntent, key)).toEqual({ outcome: "absent" })
    expect(await f.buyer.as.mutation(stopIntent, key)).toEqual({ outcome: "stopped" })
    expect(await f.buyer.as.mutation(stopIntent, key)).toEqual({ outcome: "stopped" })
    expect(await f.buyer.as.query(findIntent, key)).toEqual({ outcome: "stopped" })
    expect(await f.buyer.as.action(book, intent)).toEqual({ outcome: "refused" })
    expect(p.sent).toHaveLength(0)
    const fences = await f.t.run(async (ctx) => await ctx.db.query("serviceClientIntentFences").withIndex("by_client", (q) => q.eq("personId", f.buyer.personId).eq("networkId", f.root).eq("clientRequestId", intent.clientRequestId)).take(2))
    expect(fences).toHaveLength(1)
    expect(directlyOwned("serviceClientIntentFences", fences[0]! as unknown as DataRecord, String(f.buyer.personId))).toBe(true)
    expect(directlyOwned("serviceClientIntentFences", fences[0]! as unknown as DataRecord, String(f.owner.personId))).toBe(false)
    expect(exportableRecord("serviceClientIntentFences", fences[0]! as unknown as DataRecord, String(f.buyer.personId))).toBeNull()
    vi.setSystemTime(NOW + 100 * 24 * HOUR)
    const sessionId = await createTestSession(f.t, "services-buyer-fixture")
    expect(await f.t.withIdentity({ subject: "services-buyer-fixture", sessionId }).query(findIntent, key)).toEqual({ outcome: "stopped" })
  })

  it("une commande admise reste prioritaire : stop ne modifie ni son incertitude ni ses octets", async () => {
    const f = await fixture(), p = peer(), intent = bookIntent(f)
    p.state.timeout = true
    const result = await f.buyer.as.action(book, intent)
    if (result.outcome !== "request") throw new Error("Demande attendue")
    const before = await commands(f, result.requestRowId), calls = p.sent.length
    const key = { networkId: f.root, clientRequestId: intent.clientRequestId }
    expect(await f.buyer.as.query(findIntent, key)).toEqual({ outcome: "request", requestRowId: result.requestRowId })
    expect(await f.buyer.as.mutation(stopIntent, key)).toEqual({ outcome: "request", requestRowId: result.requestRowId })
    expect(await commands(f, result.requestRowId)).toEqual(before)
    expect(p.sent).toHaveLength(calls)
  })

  it("la clé est privée au propriétaire : une clôture étrangère ne ferme pas sa demande", async () => {
    const f = await fixture(), p = peer()
    const stranger = await member(f.t, f.root, "services-intent-stranger", "services-intent-stranger")
    const key = { networkId: f.root, clientRequestId: "service-private-key-0001" }
    expect(await stranger.as.mutation(stopIntent, key)).toEqual({ outcome: "stopped" })
    expect(await f.buyer.as.query(findIntent, key)).toEqual({ outcome: "absent" })
    const result = await f.buyer.as.action(book, bookIntent(f, key.clientRequestId))
    expect(result).toMatchObject({ outcome: "request", state: "accepted" })
    expect(await stranger.as.query(findIntent, key)).toEqual({ outcome: "stopped" })
    expect(p06(p, "booking.request")).toHaveLength(1)
  })

  it("la clôture couvre aussi une annulation non encore admise, sans annuler le rendez-vous", async () => {
    const f = await fixture(), p = peer(), requestRowId = await booked(f, p)
    const row = await f.buyer.as.query(myRequest, { networkId: f.root, requestRowId })
    const key = { networkId: f.root, clientRequestId: "service-cancel-stopped-0001" }
    await f.buyer.as.mutation(stopIntent, key)
    const calls = p.sent.length
    expect(await f.buyer.as.action(cancel, { ...key, requestRowId, expectedRevision: row!.booking!.revision!, consentTextVersion: COMMERCE_SERVICE_CONSENTS.booking_cancel.textVersion })).toEqual({ outcome: "refused" })
    expect((await requestRow(f, requestRowId))?.booking).toEqual(row!.booking)
    expect(p.sent).toHaveLength(calls)
  })

  it("nouvelle vraie session : consultation puis renvoi des octets initiaux, sans renouveler le consentement", async () => {
    const f = await fixture(), p = peer()
    p.state.timeout = true
    const result = await f.buyer.as.action(book, bookIntent(f))
    if (result.outcome !== "request") throw new Error("Demande attendue")
    const [before] = await commands(f, result.requestRowId), original = p06(p, "booking.request")[0]!.raw
    const sessionId = await createTestSession(f.t, "services-buyer-fixture")
    const later = f.t.withIdentity({ subject: "services-buyer-fixture", sessionId })
    p.state.timeout = false
    await later.action(retry, { networkId: f.root, requestRowId: result.requestRowId })
    const [after] = await commands(f, result.requestRowId)
    expect(p06(p, "booking.request").map((send) => send.raw)).toEqual([original, original])
    expect(after).toMatchObject({ sessionDigest: before!.sessionDigest, requestId: before!.requestId, bodySha256: before!.bodySha256, issuedAt: before!.issuedAt, expiresAt: before!.expiresAt, consentedAt: before!.consentedAt, lookupSessionDigest: await sha256Hex(sessionId) })
    expect(after?.sessionDigest).not.toBe(await sha256Hex(sessionId))
    expect(after?.leaseSessionDigest).toBeUndefined()
  })

  it("une autre session de la même personne ne peut ni autoriser ni terminer un bail déjà pris", async () => {
    const f = await fixture(), p = peer()
    p.state.timeout = true
    const result = await f.buyer.as.action(book, bookIntent(f))
    if (result.outcome !== "request") throw new Error("Demande attendue")
    const config = (await readCommerceLinkConfig())!
    const delivery = await f.buyer.as.mutation(admitLookup, { networkId: f.root, requestRowId: result.requestRowId, requestId: "service-lookup-lease-0001", leaseToken: "a".repeat(43), configFingerprint: config.fingerprint, resend: false })
    if (!delivery) throw new Error("Bail attendu")
    const response = await p.fetcher("http://localhost:4010/commerce/v1/commands", { body: delivery.rawBody })
    const sessionId = await createTestSession(f.t, "services-buyer-fixture"), later = f.t.withIdentity({ subject: "services-buyer-fixture", sessionId })
    expect(await later.mutation(authorizeDelivery, { networkId: f.root, delivery, configFingerprint: config.fingerprint })).toBe(false)
    expect(await later.mutation(finishDelivery, { networkId: f.root, delivery, httpStatus: response.status, rawResponse: await response.text() })).toEqual({ outcome: "refused" })
    expect((await commands(f, result.requestRowId))[0]?.lookupState).toBeUndefined()
  })

  it("un transport indisponible après expiration ne prouve jamais l'absence d'effet", async () => {
    const f = await fixture(), p = peer()
    p.state.timeout = true
    const result = await f.buyer.as.action(book, bookIntent(f))
    if (result.outcome !== "request") throw new Error("Demande attendue")
    vi.setSystemTime(NOW + 10 * 60_000)
    p.fetcher.mockRejectedValue(new Error("Transport absent"))
    await f.buyer.as.action(retry, { networkId: f.root, requestRowId: result.requestRowId })
    expect((await commands(f, result.requestRowId))[0]?.state).toBe("unknown")
    expect((await requestRow(f, result.requestRowId))?.state).toBe("pending")
    expect(p06(p, "booking.request")).toHaveLength(1)
  })

  it("une nouvelle consultation sans réponse ne réutilise pas l'ancien unknown, même récent", async () => {
    const f = await fixture(), p = peer()
    p.state.timeout = true
    const result = await f.buyer.as.action(book, bookIntent(f))
    if (result.outcome !== "request") throw new Error("Demande attendue")
    const config = (await readCommerceLinkConfig())!, base = { networkId: f.root, requestRowId: result.requestRowId, configFingerprint: config.fingerprint }
    const first = await f.buyer.as.mutation(admitLookup, { ...base, requestId: "service-lookup-valid-0001", leaseToken: "a".repeat(43), resend: false })
    if (!first) throw new Error("Consultation attendue")
    const response = await p.fetcher("http://localhost:4010/commerce/v1/commands", { body: first.rawBody })
    await f.buyer.as.mutation(finishDelivery, { networkId: f.root, delivery: first, httpStatus: response.status, rawResponse: await response.text() })
    expect((await commands(f, result.requestRowId))[0]?.lookupState).toBe("unknown")
    const second = await f.buyer.as.mutation(admitLookup, { ...base, requestId: "service-lookup-lost-0002", leaseToken: "b".repeat(43), resend: false })
    if (!second) throw new Error("Consultation attendue")
    await f.buyer.as.mutation(finishDelivery, { networkId: f.root, delivery: second })
    expect(await f.buyer.as.mutation(admitLookup, { ...base, requestId: "service-lookup-resend-0003", leaseToken: "c".repeat(43), resend: true })).toBeNull()
    expect((await commands(f, result.requestRowId))[0]?.lookupSessionDigest).toBeUndefined()
    expect(p06(p, "booking.request")).toHaveLength(1)
  })

  it.each(["requested", "blocked"] as const)("conversation %s après timeout : consultation permise, aucun renvoi de devis", async (state) => {
    const f = await fixture(), p = peer(), threadId = await quoteThread(f)
    p.state.timeout = true
    const result = await f.buyer.as.action(requestQuote, { networkId: f.root, handle: "salon-test", offerRef: OFFER, threadId, need: "Coupe", attachmentMessageIds: [], consentTextVersion: COMMERCE_INQUIRY_CONSENT_VERSION, clientRequestId: "service-quote-recheck-0001" })
    if (result.outcome !== "request") throw new Error("Demande attendue")
    await f.t.run(async (ctx) => await ctx.db.patch(threadId, { state }))
    p.state.timeout = false
    await f.buyer.as.action(retry, { networkId: f.root, requestRowId: result.requestRowId })
    expect(p06(p, "request.status")).toHaveLength(1)
    expect(p06(p, "inquiry.submit")).toHaveLength(1)
    expect((await commands(f, result.requestRowId))[0]?.state).toBe("unknown")
  })

  it("blocage de paire même si l'état du fil reste accepté : aucun envoi autorisé", async () => {
    const f = await fixture(), threadId = await quoteThread(f)
    const { delivery, config } = await admittedQuote(f, threadId)
    expect(await f.buyer.as.mutation(authorizeDelivery, { networkId: f.root, delivery, configFingerprint: config.fingerprint })).toBe(true)
    await f.t.run(async (ctx) => await ctx.db.insert("commercialBlocks", { networkId: f.root, threadId, personId: f.owner.personId, shopId: f.shopId, requesterPersonId: f.buyer.personId, side: "shop", createdAt: NOW }))
    expect(await f.buyer.as.mutation(authorizeDelivery, { networkId: f.root, delivery, configFingerprint: config.fingerprint })).toBe(false)
  })

  it.each(["deleted", "quarantined"] as const)("pièce %s depuis l'admission : ni envoi ni application de la réponse", async (change) => {
    const f = await fixture(), p = peer(), threadId = await quoteThread(f)
    const storageId = await f.t.run(async (ctx) => await ctx.storage.store(new Blob(["demande privée"], { type: "text/plain" })))
    const { messageId, scanId } = await f.t.run(async (ctx) => {
      const scanId = await ctx.db.insert("fileScans", { storageId, networkId: f.root, uploadedByPersonId: f.buyer.personId, source: "message", status: "clean", attempts: 1, createdAt: NOW, updatedAt: NOW })
      const messageId = await ctx.db.insert("commercialMessages", { networkId: f.root, threadId, senderPersonId: f.buyer.personId, senderKind: "requester", attachmentFiles: [{ storageId, filename: "besoin.txt", mimeType: "text/plain", sizeBytes: 15 }], idempotencyKey: "service-attachment-0001", digest: "d".repeat(64), createdAt: NOW })
      return { messageId, scanId }
    })
    const { delivery, config, requestRowId } = await admittedQuote(f, threadId, [messageId])
    expect(await f.buyer.as.mutation(authorizeDelivery, { networkId: f.root, delivery, configFingerprint: config.fingerprint })).toBe(true)
    const response = await p.fetcher("http://localhost:4010/commerce/v1/commands", { body: delivery.rawBody })
    await f.t.run(async (ctx) => {
      if (change === "deleted") await ctx.db.patch(messageId, { deletedAt: NOW })
      else await ctx.db.patch(scanId, { status: "infected" })
    })
    expect(await f.buyer.as.mutation(authorizeDelivery, { networkId: f.root, delivery, configFingerprint: config.fingerprint })).toBe(false)
    expect(await f.buyer.as.mutation(finishDelivery, { networkId: f.root, delivery, rawResponse: await response.text(), httpStatus: response.status })).toEqual({ outcome: "refused" })
    expect((await requestRow(f, requestRowId))?.inquiryRef).toBeUndefined()
    expect((await commands(f, requestRowId))[0]?.state).toBe("unknown")
    expect(delivery.rawBody).not.toContain(String(messageId))
    expect(delivery.rawBody).not.toContain(String(storageId))
  })

  it("conversation retirée pendant l'échange : réponse directe refusée, reçu historique encore consultable", async () => {
    const f = await fixture(), p = peer(), threadId = await quoteThread(f)
    const { delivery, requestRowId } = await admittedQuote(f, threadId)
    const response = await p.fetcher("http://localhost:4010/commerce/v1/commands", { body: delivery.rawBody })
    await f.t.run(async (ctx) => await ctx.db.patch(threadId, { state: "closed" }))
    expect(await f.buyer.as.mutation(finishDelivery, { networkId: f.root, delivery, rawResponse: await response.text(), httpStatus: response.status })).toEqual({ outcome: "refused" })
    expect((await requestRow(f, requestRowId))?.inquiryRef).toBeUndefined()
    p.state.forget = false
    await f.buyer.as.action(retry, { networkId: f.root, requestRowId })
    expect((await requestRow(f, requestRowId))?.inquiryRef).toBe(INQUIRY)
    expect(p06(p, "inquiry.submit")).toHaveLength(1)
  })

  it("TTL privé : pièces sélectionnées et preuves de bail expurgées, aucune référence dans l'export", async () => {
    const f = await fixture(), threadId = await quoteThread(f)
    const { delivery, requestRowId } = await admittedQuote(f, threadId)
    const [command] = await commands(f, requestRowId)
    expect(command?.inquiryAttachmentMessageIds).toEqual([])
    expect(command?.leaseSessionDigest).toBeDefined()
    const projected = exportableRecord("commerceServiceCommands", command! as unknown as DataRecord, String(f.buyer.personId))
    for (const field of ["inquiryAttachmentMessageIds", "sessionDigest", "leaseSessionDigest", "lookupSessionDigest"]) expect(projected).not.toHaveProperty(field)
    vi.setSystemTime(NOW + 30 * 60_000 + 1)
    await f.t.mutation(expirePrivate, { commandId: delivery.commandId })
    const [purged] = await commands(f, requestRowId)
    for (const field of ["rawBody", "leaseToken", "leaseUntil", "leaseSessionDigest", "lookupSessionDigest", "inquiryAttachmentMessageIds"] as const) expect(purged?.[field]).toBeUndefined()
    expect(purged?.sessionDigest).toBe(command?.sessionDigest)
    expect(purged?.state).toBe("unknown")
  })

  it("ancienne demande sans preuve des pièces : reçu consultable, aucun renvoi même sans pièce déclarée", async () => {
    const f = await fixture(), p = peer(), threadId = await quoteThread(f)
    p.state.timeout = true
    const result = await f.buyer.as.action(requestQuote, { networkId: f.root, handle: "salon-test", offerRef: OFFER, threadId, need: "Coupe", attachmentMessageIds: [], consentTextVersion: COMMERCE_INQUIRY_CONSENT_VERSION, clientRequestId: "service-quote-legacy-0001" })
    if (result.outcome !== "request") throw new Error("Demande attendue")
    const [command] = await commands(f, result.requestRowId)
    await f.t.run(async (ctx) => await ctx.db.patch(command!._id, { inquiryAttachmentMessageIds: undefined }))
    p.state.timeout = false
    await f.buyer.as.action(retry, { networkId: f.root, requestRowId: result.requestRowId })
    expect(p06(p, "inquiry.submit")).toHaveLength(1)
    // Le bail refusé expire ; un reçu réellement enregistré reste consultable ensuite.
    vi.setSystemTime(NOW + 31_000); p.state.forget = false
    await f.buyer.as.action(retry, { networkId: f.root, requestRowId: result.requestRowId })
    expect((await requestRow(f, result.requestRowId))?.inquiryRef).toBe(INQUIRY)
  })
})

/**
 * P14B (écrit, NON EXÉCUTÉ — décision du 18/10/2026) : avis commerce des services. Émis par la porte
 * unique à partir de l'état CONFIRMÉ par PRO.GA ; l'équipe habilitée (mandat de contact P10 vivant)
 * apprend les gestes du client ; le client, les décisions du professionnel, en trace déjà lue quand
 * c'est sa propre relecture qui les observe. Aucun contenu, montant, nom ni créneau dans la ligne ni
 * dans le job ; préférences, consentement et budget relus avant tout transport.
 */
describe("P14B — avis commerce des services", () => {
  type BellRow = { notificationId: Id<"notifications">; kind: string; readAt: number | null; actor: unknown; subject: unknown; target?: unknown }
  const bellPage = makeFunctionReference<"query", Net & { paginationOpts: { cursor: string | null; numItems: number } }, { page: BellRow[] }>("modules/notifications/bell:paginateNotifications")
  const openTarget = makeFunctionReference<"query", Net & { reference: string }, unknown>("modules/notifications/open:resolveOpenTarget")
  const subscribe = makeFunctionReference<"mutation", Net & { applicationId: string; deviceId: string; credential: { provider: "expo"; token: string } }, { subscriptionId: Id<"pushSubscriptions"> }>("modules/notifications/pushSubscriptions:subscribe")
  const updatePreferences = makeFunctionReference<"mutation", Net & { pushCategories?: Record<"social" | "messages" | "calls" | "network" | "moderation" | "files", boolean>; weeklyLimit?: number }, null>("modules/notifications/preferences:update")
  const PAGE = { cursor: null, numItems: 20 }
  const APPLICATIONS = JSON.stringify([{ applicationId: "antsia_ga", networkSlug: "antsia", origin: "https://antsia.example.test", entryPath: "/fil" }])

  beforeEach(() => { vi.stubEnv("NOTIFICATION_APPLICATIONS_JSON", APPLICATIONS) })

  /** Notifications consenties dans le réseau et un appareil lié à la session de la personne. */
  async function device(f: Fixture, who: Fixture["owner"], suffix: string) {
    await who.as.mutation(api.modules.people.consents.recordConsent, { networkId: f.root, purpose: "notifications", origin: "settings" })
    await who.as.mutation(subscribe, { networkId: f.root, applicationId: "antsia_ga", deviceId: `device_${suffix}`, credential: { provider: "expo", token: `ExpoPushToken[token_${suffix}]` } })
  }
  /** L'équipe habilitée : le gérant reçoit le mandat de contact P10 (lecture, réponse), accepté, et un appareil. */
  async function team(f: Fixture) {
    await f.t.run(async (ctx) => ctx.db.insert("shopContactMandates", { networkId: f.root, shopId: f.shopId, personId: f.owner.personId, canRead: true, canReply: true, canDecide: true, canCall: false, revision: 1, acceptedAt: NOW, createdAt: NOW, updatedAt: NOW }))
    await device(f, f.owner, "team_owner")
  }
  async function notices(f: Fixture, kind?: string) {
    // borné : un scénario écrit quelques avis seulement.
    return await f.t.run(async (ctx) => (await ctx.db.query("notifications").take(100)).filter((row) => (kind === undefined ? row.kind.startsWith("commerce_") : row.kind === kind)))
  }
  async function jobsOf(f: Fixture, notificationId: Id<"notifications">) {
    return await f.t.run(async (ctx) => ctx.db.query("notificationDeliveryJobs").withIndex("by_notification", (q) => q.eq("notificationId", notificationId)).take(10))
  }

  it("créneau retenu : l'équipe habilitée reçoit un avis neutre et un transport ; le client, rien pour son propre geste", async () => {
    const f = await fixture(), p = peer()
    await team(f)
    const requestRowId = await booked(f, p, "requested")
    const row = await requestRow(f, requestRowId)
    const held = await notices(f, "commerce_service_booking_held")
    expect(held.map((notice) => notice.recipientPersonId)).toEqual([f.owner.personId])
    expect(held[0]?.actorPersonId).toBeUndefined()
    expect(held[0]?.readAt).toBeUndefined()
    expect(held[0]?.dedupKey).toBe(`commerce_service_booking_held|commerceServiceRequest:${row?._id}:booking:${APPOINTMENT}:held|-`)
    expect((await notices(f)).some((notice) => notice.recipientPersonId === f.buyer.personId)).toBe(false)
    const jobs = await jobsOf(f, held[0]!._id)
    expect(jobs).toHaveLength(1)
    expect(jobs[0]).toMatchObject({ channel: "push", category: "messages", recipientPersonId: f.owner.personId, state: "queued" })
    // Ni besoin, note, nom de boutique, prestation, devise ni montant dans la ligne ou le job.
    const stored = JSON.stringify({ rows: await notices(f), jobs })
    for (const forbidden of ["Merci de prévoir une serviette", "Salon de recette", "Coupe", "XAF", "amount", "salon-test"]) expect(stored).not.toContain(forbidden)
    const bell = await f.owner.as.query(bellPage, { networkId: f.root, paginationOpts: PAGE })
    expect(bell.page.find((item) => item.kind === "commerce_service_booking_held")).toMatchObject({ actor: null, subject: null, target: null })
    // L'ouverture relit le mandat : avis lisible, aucune destination ANTSIA pour l'agenda du professionnel.
    expect(await f.owner.as.query(openTarget, { networkId: f.root, reference: jobs[0]!._id })).toEqual({ channel: "notification", kind: "commerce_service_booking_held", subject: null, actorHandle: null, target: null })
  })

  it("le professionnel confirme : la relecture du client écrit une trace déjà lue, sans transport, qui mène à Mes demandes", async () => {
    const f = await fixture(), p = peer()
    await device(f, f.buyer, "buyer_client")
    const requestRowId = await booked(f, p, "requested")
    expect(await notices(f, "commerce_service_booking_confirmed")).toEqual([])
    p.bookings.set(APPOINTMENT, { ...p.bookings.get(APPOINTMENT)!, state: "confirmed", revision: 2 })
    expect(await f.buyer.as.action(refresh, { networkId: f.root, requestRowId })).toBe("updated")
    const confirmed = await notices(f, "commerce_service_booking_confirmed")
    expect(confirmed).toHaveLength(1)
    expect(confirmed[0]).toMatchObject({ recipientPersonId: f.buyer.personId, readAt: NOW })
    expect(await jobsOf(f, confirmed[0]!._id)).toEqual([])
    const bell = await f.buyer.as.query(bellPage, { networkId: f.root, paginationOpts: PAGE })
    expect(bell.page.find((item) => item.kind === "commerce_service_booking_confirmed")).toMatchObject({ readAt: NOW, target: { kind: "serviceRequest", requestRowId } })
    // Relire encore : la même transition ne s'annonce qu'une fois.
    await f.buyer.as.action(refresh, { networkId: f.root, requestRowId })
    expect(await notices(f, "commerce_service_booking_confirmed")).toHaveLength(1)
  })

  it("refus par le professionnel d'un créneau retenu : « non retenu » ; expiration du créneau : aucun avis", async () => {
    const f = await fixture(), p = peer()
    const requestRowId = await booked(f, p, "requested")
    p.bookings.set(APPOINTMENT, { ...p.bookings.get(APPOINTMENT)!, state: "cancelled_by_pro", cancellation: "professional", revision: 2 })
    await f.buyer.as.action(refresh, { networkId: f.root, requestRowId })
    expect((await notices(f, "commerce_service_booking_declined")).map((notice) => notice.recipientPersonId)).toEqual([f.buyer.personId])
    const second = await member(f.t, f.root, "services-expired-buyer", "services-expired")
    p.state.takenSlot = null
    const expiring = await second.as.action(book, bookIntent(f, "service-booking-client-0099", NEW_SLOT))
    if (expiring.outcome !== "request") throw new Error("Résultat attendu")
    p.bookings.set(APPOINTMENT, { ...p.bookings.get(APPOINTMENT)!, state: "cancelled_by_pro", cancellation: "expired", revision: 2 })
    await second.as.action(refresh, { networkId: f.root, requestRowId: expiring.requestRowId })
    expect((await notices(f)).some((notice) => notice.recipientPersonId === second.personId)).toBe(false)
  })

  it("annulation par le client : l'équipe habilitée est avisée ; le client n'est jamais son propre destinataire", async () => {
    const f = await fixture(), p = peer()
    await team(f)
    const requestRowId = await booked(f, p)
    await f.buyer.as.action(cancel, { networkId: f.root, requestRowId, expectedRevision: 1, consentTextVersion: COMMERCE_SERVICE_CONSENTS.booking_cancel.textVersion, clientRequestId: "service-cancel-notice-0001" })
    expect((await notices(f, "commerce_service_booking_client_cancelled")).map((notice) => notice.recipientPersonId)).toEqual([f.owner.personId])
    expect((await notices(f)).some((notice) => notice.recipientPersonId === f.buyer.personId)).toBe(false)
  })

  it("devis accepté : avis à l'équipe habilitée vers la conversation qu'elle lit déjà ; aucun montant", async () => {
    const f = await fixture(), p = peer(), threadId = await quoteThread(f)
    await team(f)
    const created = await f.buyer.as.action(requestQuote, { networkId: f.root, handle: "salon-test", offerRef: OFFER, threadId, need: "Coupe", attachmentMessageIds: [], consentTextVersion: COMMERCE_INQUIRY_CONSENT_VERSION, clientRequestId: "service-quote-notice-0001" })
    if (created.outcome !== "request") throw new Error("Résultat attendu")
    expect(p.sent.length).toBeGreaterThan(0)
    await f.buyer.as.action(acceptQuote, { networkId: f.root, requestRowId: created.requestRowId, quoteRef: QUOTE, quoteVersion: 1, acceptedTotal: { amount: 40_000, currency: "XAF" }, consentTextVersion: COMMERCE_SERVICE_CONSENTS.quote_acceptance.textVersion, clientRequestId: "service-accept-notice-0001" })
    const accepted = await notices(f, "commerce_service_quote_accepted")
    expect(accepted.map((notice) => notice.recipientPersonId)).toEqual([f.owner.personId])
    const jobs = await jobsOf(f, accepted[0]!._id)
    const stored = JSON.stringify({ accepted, jobs })
    for (const forbidden of ["XAF", "amount", "acceptedTotal", "Coupe"]) expect(stored).not.toContain(forbidden)
    const bell = await f.owner.as.query(bellPage, { networkId: f.root, paginationOpts: PAGE })
    expect(bell.page.find((item) => item.kind === "commerce_service_quote_accepted")).toMatchObject({ target: { kind: "commercialThread", threadId } })
    expect(await f.owner.as.query(openTarget, { networkId: f.root, reference: jobs[0]!._id })).toMatchObject({ kind: "commerce_service_quote_accepted", target: { kind: "commercialThread", threadId } })
  })

  it("devis révisé appris par une acceptation à reconfirmer : trace pour le client, version seule", async () => {
    const f = await fixture(), p = peer(), threadId = await quoteThread(f)
    const created = await f.buyer.as.action(requestQuote, { networkId: f.root, handle: "salon-test", offerRef: OFFER, threadId, need: "Coupe", attachmentMessageIds: [], consentTextVersion: COMMERCE_INQUIRY_CONSENT_VERSION, clientRequestId: "service-quote-notice-0002" })
    if (created.outcome !== "request") throw new Error("Résultat attendu")
    p.state.quoteVersion = 2; p.state.quoteTotal = 45_000
    await f.buyer.as.action(acceptQuote, { networkId: f.root, requestRowId: created.requestRowId, quoteRef: QUOTE, quoteVersion: 1, acceptedTotal: { amount: 40_000, currency: "XAF" }, consentTextVersion: COMMERCE_SERVICE_CONSENTS.quote_acceptance.textVersion, clientRequestId: "service-accept-notice-0002" })
    const revised = await notices(f, "commerce_service_quote_revised")
    expect(revised.map((notice) => notice.recipientPersonId)).toEqual([f.buyer.personId])
    expect(revised[0]?.dedupKey).toContain(`quote:${QUOTE}:v2`)
    for (const forbidden of ["XAF", "amount", "currentTotal"]) expect(JSON.stringify(revised)).not.toContain(forbidden)
    // L'acceptation n'est pas confirmée : l'équipe n'apprend rien.
    expect(await notices(f, "commerce_service_quote_accepted")).toEqual([])
  })

  it("mandat retiré : l'avis de l'équipe ne se présente plus et ne s'ouvre plus", async () => {
    const f = await fixture(), p = peer()
    await team(f)
    await booked(f, p, "requested")
    const held = await notices(f, "commerce_service_booking_held")
    const [job] = await jobsOf(f, held[0]!._id)
    await f.t.run(async (ctx) => {
      const mandate = await ctx.db.query("shopContactMandates").withIndex("by_shop_person", (q) => q.eq("shopId", f.shopId).eq("personId", f.owner.personId)).unique()
      if (mandate) await ctx.db.patch(mandate._id, { revokedAt: NOW })
    })
    const bell = await f.owner.as.query(bellPage, { networkId: f.root, paginationOpts: PAGE })
    expect(bell.page.some((item) => item.kind === "commerce_service_booking_held")).toBe(false)
    expect(await f.owner.as.query(openTarget, { networkId: f.root, reference: job!._id })).toBeNull()
  })

  it("session d'une autre personne : la référence d'un avis d'équipe ne s'ouvre pas", async () => {
    const f = await fixture(), p = peer()
    await team(f)
    await booked(f, p, "requested")
    const held = await notices(f, "commerce_service_booking_held")
    const [job] = await jobsOf(f, held[0]!._id)
    expect(await f.buyer.as.query(openTarget, { networkId: f.root, reference: job!._id })).toBeNull()
  })

  it("préférences : catégorie Messages coupée, ou budget hebdomadaire nul → aucun transport ; l'avis reste dans la cloche", async () => {
    const f = await fixture(), p = peer()
    await team(f)
    await f.owner.as.mutation(updatePreferences, { networkId: f.root, pushCategories: { social: true, messages: false, calls: true, network: true, moderation: true, files: true } })
    await booked(f, p, "requested")
    const held = await notices(f, "commerce_service_booking_held")
    expect(held).toHaveLength(1)
    expect(await jobsOf(f, held[0]!._id)).toEqual([])
    const g = await fixture(), q = peer()
    await team(g)
    await g.owner.as.mutation(updatePreferences, { networkId: g.root, weeklyLimit: 0 })
    await booked(g, q, "requested")
    const quiet = await notices(g, "commerce_service_booking_held")
    expect(quiet).toHaveLength(1)
    expect(await jobsOf(g, quiet[0]!._id)).toEqual([])
  })
})

// P16 : validation fictive EN TEST pour préserver les scénarios historiques.
// Aucun contournement d'environnement ni activation en source applicative.
vi.mock("./commerceActivation", async (importOriginal) => ({
  ...await importOriginal<typeof import("./commerceActivation")>(),
  commerceActivationReady: () => true,
}))
