/**
 * P14 — PRO-COMMERCE-SERVICE-CONTROL-V1, côté ANTSIA. Écrit, NON exécuté (décision du
 * propriétaire du 18/10/2026). La copie PRO.GA porte le même test de parité d'octets.
 */
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

import { commerceCanonicalJson } from "./commerce/primitives"
import {
  COMMERCE_SERVICE_CONSENTS, COMMERCE_SERVICE_CONTROL_CONTRACT, COMMERCE_SERVICE_CONTROL_OPERATIONS, COMMERCE_SERVICE_CONTROL_PATHS,
  COMMERCE_SERVICE_CONTROL_SCOPES, COMMERCE_SERVICE_REFUSALS, commerceServiceBookingPolicy, commerceServiceCancelDecision,
  commerceServiceChangeDecision, commerceServiceControlSigningInput, commerceServiceQuoteRequestMessage, parseCommerceServiceControlRequest,
  parseCommerceServiceControlResponse, type CommerceServiceControlRequest,
} from "./commerce-services"

/** Empreinte du fichier jumeau, identique dans les deux dépôts (règle « même octets »). */
const TWIN_SHA256 = "f6ddd4e8f3e89b5b5eaf1de23279601a26c4709d1ae74aec75ff1c8dc2f8b40b"
const nowMs = 1_800_000_000_000
const HOUR = 3_600_000
const context = { source: "antsia", environment: "sandbox" as const, nowMs }
const body = (input: unknown) => commerceCanonicalJson(input)!
const digest = "a".repeat(64)
const SHOP = "pro.ga:structure:01JA00000000000000000000S1", OFFER = "pro.ga:offer:01JA00000000000000000000V1"
const SERVICE = "pro.ga:agenda_service:01JA00000000000000000000A1", RESOURCE = "pro.ga:agenda_resource:01JA00000000000000000000R1"
const APPOINTMENT = "pro.ga:appointment:01JA00000000000000000000T1", APPOINTMENT_2 = "pro.ga:appointment:01JA00000000000000000000T2"
const QUOTE = "pro.ga:quote:01JA00000000000000000000Q1", INQUIRY = "pro.ga:inquiry:01JA00000000000000000000N1", ORDER = "pro.ga:order:01JA00000000000000000000D1"

function request<Op extends CommerceServiceControlRequest["operation"]>(operation: Op, payload: Extract<CommerceServiceControlRequest, { operation: Op }>["payload"]): Extract<CommerceServiceControlRequest, { operation: Op }> {
  return {
    contract: COMMERCE_SERVICE_CONTROL_CONTRACT, version: 1, operation, source: "antsia", environment: "sandbox", requestId: "service-00000001", shopRef: SHOP,
    subject: { kind: "buyer", ref: "antsia:sub:0123456789abcdef0123456789abcdef", authVerifiedAt: nowMs }, issuedAt: nowMs, expiresAt: nowMs + 60_000, payload,
  } as Extract<CommerceServiceControlRequest, { operation: Op }>
}
const consent = (kind: keyof typeof COMMERCE_SERVICE_CONSENTS) => ({ givenAt: nowMs, purpose: COMMERCE_SERVICE_CONSENTS[kind].purpose, textVersion: COMMERCE_SERVICE_CONSENTS[kind].textVersion })
const reply = (sent: CommerceServiceControlRequest, outcome: string, rest: Record<string, unknown>) => body({ contract: COMMERCE_SERVICE_CONTROL_CONTRACT, version: 1, requestId: sent.requestId, requestSha256: digest, respondedAt: nowMs, outcome, ...rest })
const parse = (sent: CommerceServiceControlRequest, raw: string) => parseCommerceServiceControlResponse(raw, { nowMs, request: sent, requestSha256: digest })
function view(overrides: Record<string, unknown> = {}) {
  const startAt = nowMs + 48 * HOUR
  return {
    appointmentRef: APPOINTMENT, cancellation: null, endAt: startAt + HOUR, holdExpiresAt: null,
    policy: { cancelUntil: startAt, changeRequiresConfirmation: true, changeUntil: startAt - 2 * HOUR, deposit: "unavailable" },
    replacementRef: null, replacesRef: null, resourceLabel: "Salle 1", revision: 2, serviceLabel: "Coupe", serviceRef: SERVICE, startAt,
    state: "confirmed", timeZone: "Africa/Libreville", updatedAt: nowMs, ...overrides,
  }
}

describe("P14 — fichier jumeau", () => {
  it("garde exactement les octets partagés avec PRO.GA", () => {
    const source = readFileSync(new URL("./commerce-services.ts", import.meta.url))
    expect(createHash("sha256").update(source).digest("hex")).toBe(TWIN_SHA256)
  })
  it("déclare un chemin et un scope P06 existant pour chaque opération", () => {
    for (const operation of COMMERCE_SERVICE_CONTROL_OPERATIONS) {
      expect(COMMERCE_SERVICE_CONTROL_PATHS[operation]).toMatch(/^\/commerce\/v1\/services\//u)
      expect(COMMERCE_SERVICE_CONTROL_SCOPES[operation]).toMatch(/^commerce\./u)
      expect(COMMERCE_SERVICE_REFUSALS[operation]).toContain("access_denied")
    }
    expect(new Set(Object.values(COMMERCE_SERVICE_CONTROL_PATHS)).size).toBe(COMMERCE_SERVICE_CONTROL_OPERATIONS.length)
  })
})

describe("P14 — demandes", () => {
  it("accepte des lectures bornées et refuse autorité étrangère, champ interdit et preuve trop ancienne", () => {
    const slots = request("booking.slots", { fromAt: nowMs, serviceRef: SERVICE, toAt: nowMs + 7 * 24 * HOUR })
    expect(parseCommerceServiceControlRequest(body(slots), context).ok).toBe(true)
    for (const value of [
      { ...slots, payload: { ...slots.payload, toAt: nowMs + 15 * 24 * HOUR } },
      { ...slots, payload: { ...slots.payload, fromAt: nowMs - 2 * 24 * HOUR } },
      { ...slots, source: "foreign" }, { ...slots, environment: "production" }, { ...slots, tenantId: "private" },
      { ...slots, subject: { ...slots.subject, kind: "seller_operator" } },
      { ...slots, subject: { ...slots.subject, authVerifiedAt: nowMs - 300_001 } },
      { ...slots, expiresAt: nowMs + 60_001 },
      { ...slots, payload: { ...slots.payload, contactPhone: "+241000000" } },
    ]) expect(parseCommerceServiceControlRequest(body(value), context).ok).toBe(false)
  })
  it("exige instant futur, durée bornée et fuseau de l'agenda pour un changement de créneau", () => {
    const slot = { endAt: nowMs + 49 * HOUR, startAt: nowMs + 48 * HOUR, timeZone: "Africa/Libreville" as const }
    const change = request("booking.reschedule.request", { appointmentRef: APPOINTMENT, consent: consent("booking_change"), expectedRevision: 2, slot })
    expect(parseCommerceServiceControlRequest(body(change), context).ok).toBe(true)
    for (const bad of [
      { ...slot, timeZone: "Europe/Paris" }, { ...slot, startAt: nowMs - HOUR }, { ...slot, endAt: slot.startAt },
      { ...slot, endAt: slot.startAt + 481 * 60_000 },
    ]) expect(parseCommerceServiceControlRequest(body({ ...change, payload: { ...change.payload, slot: bad } }), context).ok).toBe(false)
    // Le consentement d'annulation n'autorise pas un changement.
    expect(parseCommerceServiceControlRequest(body({ ...change, payload: { ...change.payload, consent: consent("booking_cancel") } }), context).ok).toBe(false)
  })
  it("une commande de prestation porte quantité, prix et révision attendus, sans adresse", () => {
    const order = request("service.order.request", { consent: consent("service_order"), expectedCatalogRevision: 1, expectedUnitAmount: { amount: 15_000, currency: "XAF" }, offerRef: OFFER, quantity: 2 })
    expect(parseCommerceServiceControlRequest(body(order), context).ok).toBe(true)
    for (const payload of [{ ...order.payload, quantity: 21 }, { ...order.payload, expectedUnitAmount: { amount: 0, currency: "XAF" } }, { ...order.payload, address: "Libreville" }, { ...order.payload, fullName: "NDONG" }]) {
      expect(parseCommerceServiceControlRequest(body({ ...order, payload }), context).ok).toBe(false)
    }
  })
})

describe("P14 — réponses corrélées", () => {
  it("créneaux : durée exacte, dans la fenêtre, ressource demandée", () => {
    const sent = request("booking.slots", { fromAt: nowMs, resourceRef: RESOURCE, serviceRef: SERVICE, toAt: nowMs + 24 * HOUR })
    const slot = { endAt: nowMs + 2 * HOUR, resourceLabel: null, resourceRef: RESOURCE, startAt: nowMs + HOUR }
    const result = { durationMinutes: 60, fromAt: sent.payload.fromAt, serviceRef: SERVICE, slots: [slot], timeZone: "Africa/Libreville", toAt: sent.payload.toAt, truncated: false }
    expect(parse(sent, reply(sent, "accepted", { result })).ok).toBe(true)
    for (const changed of [
      { ...result, slots: [{ ...slot, endAt: slot.endAt + 60_000 }] }, { ...result, slots: [{ ...slot, startAt: sent.payload.toAt }] },
      { ...result, slots: [{ ...slot, resourceRef: "pro.ga:agenda_resource:01JA00000000000000000000R2" }] }, { ...result, fromAt: nowMs + 1 },
    ]) expect(parse(sent, reply(sent, "accepted", { result: changed })).ok).toBe(false)
  })
  it("rendez-vous : jamais d'acompte, jamais de rétention hors demande en attente, annulation cohérente", () => {
    const sent = request("booking.read", { appointmentRef: APPOINTMENT })
    expect(parse(sent, reply(sent, "accepted", { result: { booking: view() } })).ok).toBe(true)
    for (const booking of [
      view({ policy: { ...view().policy, deposit: "required" } }), view({ holdExpiresAt: nowMs + HOUR }),
      view({ state: "cancelled_by_client", cancellation: null }), view({ state: "honored" }),
      view({ appointmentRef: APPOINTMENT_2 }), view({ replacementRef: APPOINTMENT }),
    ]) expect(parse(sent, reply(sent, "accepted", { result: { booking } })).ok).toBe(false)
  })
  it("changement : échange immédiat ou remplacement en attente, jamais un ancien rendez-vous perdu sans trace", () => {
    const slot = { endAt: nowMs + 73 * HOUR, startAt: nowMs + 72 * HOUR, timeZone: "Africa/Libreville" as const }
    const sent = request("booking.reschedule.request", { appointmentRef: APPOINTMENT, consent: consent("booking_change"), expectedRevision: 2, slot })
    const current = view({ appointmentRef: APPOINTMENT_2, startAt: slot.startAt, endAt: slot.endAt, state: "requested", replacesRef: APPOINTMENT, revision: 1, policy: { cancelUntil: slot.startAt, changeRequiresConfirmation: true, changeUntil: slot.startAt - 2 * HOUR, deposit: "unavailable" } })
    const pending = { current, previous: view({ replacementRef: APPOINTMENT_2, revision: 3, policy: { ...view().policy, changeUntil: null } }) }
    const swapped = { current: { ...current, state: "confirmed" }, previous: view({ state: "cancelled_by_client", cancellation: "rescheduled", revision: 3, policy: { cancelUntil: null, changeRequiresConfirmation: true, changeUntil: null, deposit: "unavailable" } }) }
    expect(parse(sent, reply(sent, "accepted", { result: pending })).ok).toBe(true)
    expect(parse(sent, reply(sent, "accepted", { result: swapped })).ok).toBe(true)
    // L'ancien annulé sans être remplacé, ou un remplaçant hors du créneau demandé : refusé.
    expect(parse(sent, reply(sent, "accepted", { result: { ...swapped, previous: { ...swapped.previous, cancellation: "client" } } })).ok).toBe(false)
    expect(parse(sent, reply(sent, "accepted", { result: { ...pending, current: { ...current, startAt: slot.startAt + HOUR, endAt: slot.endAt + HOUR } } })).ok).toBe(false)
    expect(parse(sent, reply(sent, "refused", { reason: "slot_unavailable" })).ok).toBe(true)
    expect(parse(sent, reply(sent, "refused", { reason: "out_of_stock" })).ok).toBe(false)
  })
  it("annulation : révision strictement supérieure et état annulé par le client", () => {
    const sent = request("booking.cancel.request", { appointmentRef: APPOINTMENT, consent: consent("booking_cancel"), expectedRevision: 2 })
    const cancelled = view({ state: "cancelled_by_client", cancellation: "client", revision: 3, policy: { cancelUntil: null, changeRequiresConfirmation: true, changeUntil: null, deposit: "unavailable" } })
    expect(parse(sent, reply(sent, "accepted", { result: { booking: cancelled } })).ok).toBe(true)
    expect(parse(sent, reply(sent, "accepted", { result: { booking: { ...cancelled, revision: 2 } } })).ok).toBe(false)
    expect(parse(sent, reply(sent, "accepted", { result: { booking: { ...cancelled, state: "cancelled_by_pro", cancellation: "professional" } } })).ok).toBe(false)
  })
  it("devis : une version acceptable n'est ni périmée, ni déjà acceptée ; le total égale la somme des lignes", () => {
    const sent = request("quote.read", { quoteRef: QUOTE })
    const quote = { acceptable: true, clientAcceptance: null, current: true, inquiryRef: INQUIRY, lines: [{ label: "Prestation", lineAmount: { amount: 40_000, currency: "XAF" }, quantity: 2, unitAmount: { amount: 20_000, currency: "XAF" } }], notes: null, quoteRef: QUOTE, reference: "DEV-1", sellerLabel: null, sentAt: nowMs, state: "sent", title: "Coupe", total: { amount: 40_000, currency: "XAF" }, validUntil: nowMs + HOUR, version: 2 }
    expect(parse(sent, reply(sent, "accepted", { result: { quote } })).ok).toBe(true)
    for (const changed of [
      { ...quote, current: false }, { ...quote, state: "draft", acceptable: false }, { ...quote, total: { amount: 41_000, currency: "XAF" } },
      { ...quote, clientAcceptance: { acceptedAt: nowMs, acceptedTotal: { amount: 40_000, currency: "XAF" }, orderRef: ORDER, quoteVersion: 2 } },
      { ...quote, acceptable: false, clientAcceptance: { acceptedAt: nowMs, acceptedTotal: { amount: 39_000, currency: "XAF" }, orderRef: ORDER, quoteVersion: 2 } },
    ]) expect(parse(sent, reply(sent, "accepted", { result: { quote: changed } })).ok).toBe(false)
  })
  it("commande : reconfirmation seulement si le prix ou la révision a changé ; jamais pour une lecture", () => {
    const sent = request("service.order.request", { consent: consent("service_order"), expectedCatalogRevision: 1, expectedUnitAmount: { amount: 15_000, currency: "XAF" }, offerRef: OFFER, quantity: 2 })
    expect(parse(sent, reply(sent, "reconfirm_required", { result: { currentCatalogRevision: 2, currentUnitAmount: { amount: 17_000, currency: "XAF" }, state: "reconfirm" } })).ok).toBe(true)
    expect(parse(sent, reply(sent, "reconfirm_required", { result: { currentCatalogRevision: 1, currentUnitAmount: { amount: 15_000, currency: "XAF" }, state: "reconfirm" } })).ok).toBe(false)
    const accepted = { catalogRevision: 1, createdAt: nowMs, lines: [{ label: "Coupe", lineAmount: { amount: 30_000, currency: "XAF" }, quantity: 2, unitAmount: { amount: 15_000, currency: "XAF" } }], orderRef: ORDER, state: "pending", total: { amount: 30_000, currency: "XAF" } }
    expect(parse(sent, reply(sent, "accepted", { result: accepted })).ok).toBe(true)
    expect(parse(sent, reply(sent, "accepted", { result: { ...accepted, total: { amount: 29_000, currency: "XAF" } } })).ok).toBe(false)
    const read = request("booking.read", { appointmentRef: APPOINTMENT })
    expect(parse(read, reply(read, "reconfirm_required", { result: { booking: view() } })).ok).toBe(false)
  })
  it("consultation : réponse enregistrée ⟺ terminée, rien révélé d'une demande inconnue", () => {
    const sent = request("action.status", { targetOperation: "booking.cancel.request", targetRequestId: "service-00000009", targetRequestSha256: "b".repeat(64) })
    expect(parse(sent, reply(sent, "accepted", { result: { current: [], state: "unknown", targetRequestId: "service-00000009" } })).ok).toBe(true)
    expect(parse(sent, reply(sent, "accepted", { result: { current: [{ objectKind: "appointment", objectRef: APPOINTMENT, revision: 3, state: "cancelled_by_client", updatedAt: nowMs }], state: "unknown", targetRequestId: "service-00000009" } })).ok).toBe(false)
    expect(parse(sent, reply(sent, "accepted", { result: { current: [], recordedResponse: "{}", recordedResponseSha256: "c".repeat(64), state: "completed", targetRequestId: "service-00000009" } })).ok).toBe(true)
    expect(parse(sent, reply(sent, "accepted", { result: { current: [], state: "completed", targetRequestId: "service-00000009" } })).ok).toBe(false)
    expect(parse(sent, reply(sent, "accepted", { result: { current: [], state: "unknown", targetRequestId: "service-00000008" } })).ok).toBe(false)
  })
  it("identifiant, empreinte et horodatage corrélés à la demande envoyée", () => {
    const sent = request("booking.read", { appointmentRef: APPOINTMENT })
    const raw = JSON.parse(reply(sent, "accepted", { result: { booking: view() } })) as Record<string, unknown>
    expect(parseCommerceServiceControlResponse(body({ ...raw, requestId: "service-00000002" }), { nowMs, request: sent, requestSha256: digest }).ok).toBe(false)
    expect(parseCommerceServiceControlResponse(body(raw), { nowMs, request: sent, requestSha256: "d".repeat(64) }).ok).toBe(false)
    expect(parseCommerceServiceControlResponse(body({ ...raw, respondedAt: nowMs + 10 * 60_000 }), { nowMs, request: sent, requestSha256: digest }).ok).toBe(false)
  })
})

describe("P14 — règles partagées", () => {
  it("politique : changement jusqu'au préavis, annulation jusqu'au début, aucun acompte", () => {
    const startAt = nowMs + 48 * HOUR
    expect(commerceServiceBookingPolicy({ autoConfirm: false, minNoticeMinutes: 120, pendingReplacement: false, startAt, state: "confirmed" })).toEqual({ cancelUntil: startAt, changeRequiresConfirmation: true, changeUntil: startAt - 2 * HOUR, deposit: "unavailable" })
    expect(commerceServiceBookingPolicy({ autoConfirm: true, minNoticeMinutes: 0, pendingReplacement: true, startAt, state: "requested" })).toEqual({ cancelUntil: startAt, changeRequiresConfirmation: false, changeUntil: null, deposit: "unavailable" })
    expect(commerceServiceBookingPolicy({ autoConfirm: false, minNoticeMinutes: 120, pendingReplacement: false, startAt, state: "honored" })).toEqual({ cancelUntil: null, changeRequiresConfirmation: true, changeUntil: null, deposit: "unavailable" })
  })
  it("décisions : trop tard, remplacement en attente, état fermé", () => {
    const booking = view() as unknown as Parameters<typeof commerceServiceChangeDecision>[0]
    expect(commerceServiceChangeDecision(booking, nowMs)).toBe("allowed")
    expect(commerceServiceChangeDecision(booking, nowMs + 47 * HOUR)).toBe("too_late")
    expect(commerceServiceChangeDecision({ ...booking, replacementRef: APPOINTMENT_2 }, nowMs)).toBe("change_pending")
    expect(commerceServiceChangeDecision({ ...booking, state: "cancelled_by_pro" }, nowMs)).toBe("not_changeable")
    expect(commerceServiceCancelDecision(booking, nowMs + 47 * HOUR)).toBe("allowed")
    expect(commerceServiceCancelDecision(booking, nowMs + 48 * HOUR)).toBe("not_cancellable")
  })
  it("message de demande de devis : besoin, contraintes et NOMBRE de pièces, sans troncature", () => {
    expect(commerceServiceQuoteRequestMessage({ attachmentCount: 2, constraints: " Samedi ", need: "Coupe\r\nlongue" })).toBe("Besoin : Coupe\nlongue\n\nContraintes : Samedi\n\nPièces choisies dans la conversation ANTSIA : 2")
    expect(commerceServiceQuoteRequestMessage({ attachmentCount: 0, need: "x".repeat(1201) })).toBeNull()
    expect(commerceServiceQuoteRequestMessage({ attachmentCount: 4, need: "Coupe" })).toBeNull()
    expect(commerceServiceQuoteRequestMessage({ attachmentCount: 0, need: "   " })).toBeNull()
    expect(commerceServiceQuoteRequestMessage({ attachmentCount: 0, need: "Coupe\u0000" })).toBeNull()
  })
  it("signature : profil propre, opération liée, fail-closed hors grammaire", () => {
    const input = { bodySha256: digest, environment: "sandbox" as const, issuedAtMs: nowMs, keyId: "antsia-key-01", nonce: "n".repeat(43), operation: "booking.cancel.request" as const, source: "antsia" }
    const signing = commerceServiceControlSigningInput(input)
    expect(signing).toContain("pro-ga-commerce-service-control-hmac/v1")
    expect(signing).toContain("commerce.booking.request")
    expect(signing).not.toBe(commerceServiceControlSigningInput({ ...input, operation: "booking.read" }))
    expect(commerceServiceControlSigningInput({ ...input, nonce: "court" })).toBeNull()
    expect(commerceServiceControlSigningInput({ ...input, bodySha256: "zz" })).toBeNull()
  })
})
