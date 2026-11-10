/**
 * P14 : règles, validateurs et projections des services, devis et rendez-vous.
 *
 * ANTSIA ne garde qu'une trace PRIVÉE et minimale des demandes de l'acheteur : références
 * opaques, états, dates, montants et révisions servis par PRO.GA (autorité). Les corps signés
 * (besoin, contraintes, note, nom d'affichage) sont transitoires et expurgés ; aucune adresse,
 * aucun contact, aucun texte de devis n'est conservé. Aucun paiement n'est disponible.
 */
import { COMMERCE_BOOKING_STATES, COMMERCE_ORDER_STATES, COMMERCE_QUOTE_STATES } from "@antsia/social-domain/commerce/lifecycle"
import { COMMERCE_COMMAND_SCOPES, type CommerceCommandRequest } from "@antsia/social-domain/commerce/command"
import { COMMERCE_COMMAND_CONTRACT } from "@antsia/social-domain/commerce/primitives"
import { COMMERCE_INQUIRY_CONSENT_VERSION } from "@antsia/social-domain/commerce-inquiry"
import {
  COMMERCE_SERVICE_CONSENTS, COMMERCE_SERVICE_CONTROL_CONTRACT, COMMERCE_SERVICE_CONTROL_CONTRACT_V2, COMMERCE_SERVICE_TIME_ZONE,
  commerceServiceCancelDecision, commerceServiceChangeDecision,
  type CommerceServiceBookingView, type CommerceServiceControlRequest,
} from "@antsia/social-domain/commerce-services"
import { type Infer, v } from "convex/values"

import type { Doc } from "../../_generated/dataModel"
import { literals } from "../../lib/validators"

export const SERVICE_BODY_TTL_MS = 30 * 60_000
export const SERVICE_REQUEST_TTL_MS = 60_000
export const SERVICE_LEASE_MS = 30_000
/** Durée technique de conservation d'une demande close (choix de lot, pas une durée légale). */
export const SERVICE_CLOSED_RETENTION_MS = 90 * 24 * 60 * 60_000
export const SERVICE_PAGE_MAX = 20
/** Une demande porte au plus vingt commandes (acceptations, changements, reconfirmations). */
export const SERVICE_COMMANDS_PER_REQUEST_MAX = 20
/** Une demande restée sans effet chez PRO.GA se ferme d'elle-même après sept jours. */
export const SERVICE_PENDING_MAX_MS = 7 * 24 * 60 * 60_000

export const SERVICE_COMMAND_KINDS = ["inquiry", "quote_accept", "quote_reject", "booking", "reschedule", "cancel", "order"] as const
export type ServiceCommandKind = (typeof SERVICE_COMMAND_KINDS)[number]
export const SERVICE_COMMAND_OPERATIONS = {
  inquiry: "inquiry.submit", quote_accept: "quote.accept", quote_reject: "service.quote.reject", booking: "booking.request",
  reschedule: "booking.reschedule.request", cancel: "booking.cancel.request", order: "service.order.request",
} as const
/** Commandes P06 (point `/commerce/v1/commands`) ; les autres passent par le contrôle jumeau. */
export const SERVICE_P06_KINDS: readonly ServiceCommandKind[] = ["inquiry", "quote_accept", "booking"]
/** Version du consentement de chaque geste, dans le texte versionné du contrat. */
export const SERVICE_CONSENT_VERSIONS = {
  inquiry: COMMERCE_INQUIRY_CONSENT_VERSION,
  quote_accept: COMMERCE_SERVICE_CONSENTS.quote_acceptance.textVersion,
  quote_reject: COMMERCE_SERVICE_CONSENTS.quote_rejection.textVersion,
  booking: COMMERCE_SERVICE_CONSENTS.booking.textVersion,
  reschedule: COMMERCE_SERVICE_CONSENTS.booking_change.textVersion,
  cancel: COMMERCE_SERVICE_CONSENTS.booking_cancel.textVersion,
  order: COMMERCE_SERVICE_CONSENTS.service_order.textVersion,
} as const satisfies Readonly<Record<ServiceCommandKind, string>>

export const serviceModeValidator = v.union(v.literal("quote"), v.literal("booking"), v.literal("fixed_order"))
export type ServiceMode = Infer<typeof serviceModeValidator>
export const serviceRequestStateValidator = v.union(v.literal("pending"), v.literal("active"), v.literal("closed"), v.literal("failed"))
export const serviceCommandKindValidator = literals(SERVICE_COMMAND_KINDS)
export const serviceCommandStateValidator = v.union(v.literal("unknown"), v.literal("accepted"), v.literal("reconfirm"), v.literal("rejected"), v.literal("expired"))
export const serviceMoneyValidator = v.object({ amount: v.number(), currency: v.literal("XAF") })
/** Nom donné au professionnel : prénom(s) et NOM structurés, jamais un nom libre découpé. */
export const serviceContactNameValidator = v.object({ firstName: v.string(), lastName: v.string() })
export const serviceBookingStateValidator = literals(COMMERCE_BOOKING_STATES)
export const serviceOrderStateValidator = literals(COMMERCE_ORDER_STATES)
export const serviceQuoteStateValidator = literals(COMMERCE_QUOTE_STATES)
export const serviceCancellationValidator = v.union(v.literal("client"), v.literal("expired"), v.literal("professional"), v.literal("rescheduled"), v.null())
export const servicePolicyValidator = v.object({
  cancelUntil: v.union(v.number(), v.null()), changeRequiresConfirmation: v.boolean(), changeUntil: v.union(v.number(), v.null()), deposit: v.literal("unavailable"),
})
/** Rendez-vous tel que servi par PRO.GA (`booking.read`), daté de son observation. */
export const serviceBookingSnapshotValidator = v.object({
  appointmentRef: v.string(), serviceRef: v.string(), serviceLabel: v.string(), resourceLabel: v.union(v.string(), v.null()),
  startAt: v.number(), endAt: v.number(), timeZone: v.literal("Africa/Libreville"), state: serviceBookingStateValidator,
  holdExpiresAt: v.union(v.number(), v.null()), revision: v.union(v.number(), v.null()), updatedAt: v.union(v.number(), v.null()),
  cancellation: serviceCancellationValidator, replacementRef: v.union(v.string(), v.null()), replacesRef: v.union(v.string(), v.null()),
  policy: v.union(servicePolicyValidator, v.null()), observedAt: v.number(),
})
export type ServiceBookingSnapshot = Infer<typeof serviceBookingSnapshotValidator>
export const serviceOrderSnapshotValidator = v.object({
  orderRef: v.string(), state: serviceOrderStateValidator, revision: v.number(), total: v.union(serviceMoneyValidator, v.null()),
  updatedAt: v.number(), observedAt: v.number(),
})
export type ServiceOrderSnapshot = Infer<typeof serviceOrderSnapshotValidator>
export const serviceRejectedQuoteValidator = v.object({ quoteRef: v.string(), quoteVersion: v.number(), rejectedAt: v.number() })
export const serviceControlContractValidator = v.union(v.literal(COMMERCE_SERVICE_CONTROL_CONTRACT), v.literal(COMMERCE_SERVICE_CONTROL_CONTRACT_V2))
export const serviceAcceptedQuoteValidator = v.object({
  quoteRef: v.string(), quoteVersion: v.number(), acceptedTotal: serviceMoneyValidator, acceptedAt: v.number(), orderRef: v.union(v.string(), v.null()),
})

// ─── DTO ─────────────────────────────────────────────────────────────────────

export const serviceCommandSummaryValidator = v.object({
  kind: serviceCommandKindValidator, state: serviceCommandStateValidator, reason: v.union(v.string(), v.null()),
  createdAt: v.number(), canRetry: v.boolean(),
  quoteRef: v.union(v.string(), v.null()), currentVersion: v.union(v.number(), v.null()), currentTotal: v.union(serviceMoneyValidator, v.null()),
  currentUnitAmount: v.union(serviceMoneyValidator, v.null()), currentCatalogRevision: v.union(v.number(), v.null()),
  quantity: v.union(v.number(), v.null()),
})
export const serviceRequestValidator = v.object({
  requestRowId: v.string(), mode: serviceModeValidator, handle: v.string(), offerRef: v.string(), offerTitle: v.string(),
  state: serviceRequestStateValidator, reason: v.union(v.string(), v.null()), createdAt: v.number(), updatedAt: v.number(),
  desiredDate: v.union(v.string(), v.null()), inquiryRef: v.union(v.string(), v.null()), threadId: v.union(v.id("commercialThreads"), v.null()),
  chosenAttachmentCount: v.union(v.number(), v.null()), serviceLabel: v.union(v.string(), v.null()),
  booking: v.union(serviceBookingSnapshotValidator, v.null()), pendingReplacement: v.union(serviceBookingSnapshotValidator, v.null()),
  order: v.union(serviceOrderSnapshotValidator, v.null()), acceptedQuote: v.union(serviceAcceptedQuoteValidator, v.null()),
  rejectedQuote: v.optional(serviceRejectedQuoteValidator),
  lastCommand: v.union(serviceCommandSummaryValidator, v.null()),
  canChange: v.boolean(), canCancel: v.boolean(), consentVersions: v.object({
    inquiry: v.string(), quote_accept: v.string(), quote_reject: v.string(), booking: v.string(), reschedule: v.string(), cancel: v.string(), order: v.string(),
  }),
  paymentAvailable: v.literal(false),
})
export type ServiceRequestDto = Infer<typeof serviceRequestValidator>

export const serviceActionResultValidator = v.union(
  v.object({ outcome: v.literal("request"), requestRowId: v.string(), state: serviceCommandStateValidator, reason: v.union(v.string(), v.null()) }),
  v.object({ outcome: v.union(v.literal("unavailable"), v.literal("refused")) }),
)
export type ServiceActionResult = Infer<typeof serviceActionResultValidator>

export const serviceStopIntentValidator = v.union(
  v.object({ outcome: v.literal("request"), requestRowId: v.string() }),
  v.object({ outcome: v.literal("stopped") }),
)
export const serviceIntentLookupValidator = v.union(serviceStopIntentValidator, v.object({ outcome: v.literal("absent") }))
export type ServiceIntentLookup = Infer<typeof serviceIntentLookupValidator>
export type ServiceStopIntentResult = Infer<typeof serviceStopIntentValidator>

const bookableValidator = v.object({
  serviceRef: v.string(), label: v.string(), description: v.union(v.string(), v.null()), durationMinutes: v.number(),
  autoConfirm: v.boolean(), holdMinutes: v.number(), minNoticeMinutes: v.number(), maxAdvanceDays: v.number(),
})
export const serviceOptionsResultValidator = v.union(
  v.object({
    outcome: v.literal("ready"), offerRef: v.string(), timeZone: v.literal("Africa/Libreville"),
    fixedOrder: v.union(v.null(), v.object({ unitAmount: serviceMoneyValidator, unit: v.union(v.string(), v.null()), catalogRevision: v.number(), leadTimeDays: v.union(v.number(), v.null()), quantityMax: v.number() })),
    quote: v.object({ available: v.boolean() }),
    booking: v.union(v.null(), v.object({ services: v.array(bookableValidator) })),
  }),
  v.object({ outcome: v.union(v.literal("unavailable"), v.literal("refused")) }),
)
export type ServiceOptionsResult = Infer<typeof serviceOptionsResultValidator>
export const serviceSlotsResultValidator = v.union(
  v.object({
    outcome: v.literal("ready"), serviceRef: v.string(), timeZone: v.literal("Africa/Libreville"), durationMinutes: v.number(),
    fromAt: v.number(), toAt: v.number(), truncated: v.boolean(),
    slots: v.array(v.object({ startAt: v.number(), endAt: v.number(), resourceRef: v.string(), resourceLabel: v.union(v.string(), v.null()) })),
  }),
  v.object({ outcome: v.union(v.literal("unavailable"), v.literal("refused")) }),
)
export type ServiceSlotsResult = Infer<typeof serviceSlotsResultValidator>
const quoteSummaryFields = {
  quoteRef: v.string(), inquiryRef: v.union(v.string(), v.null()), reference: v.string(), title: v.string(), version: v.number(),
  total: serviceMoneyValidator, validUntil: v.union(v.number(), v.null()), state: serviceQuoteStateValidator, sentAt: v.union(v.number(), v.null()),
  current: v.boolean(), acceptable: v.boolean(), rejectable: v.boolean(), clientRejection: v.union(v.null(), v.object({ quoteVersion: v.number(), rejectedAt: v.number() })), clientAcceptance: v.union(v.null(), v.object({ acceptedAt: v.number(), quoteVersion: v.number(), acceptedTotal: serviceMoneyValidator, orderRef: v.union(v.string(), v.null()) })),
}
export const serviceQuotesResultValidator = v.union(
  v.object({ outcome: v.literal("ready"), quotes: v.array(v.object(quoteSummaryFields)), truncated: v.boolean() }),
  v.object({ outcome: v.union(v.literal("unavailable"), v.literal("refused")) }),
)
export type ServiceQuotesResult = Infer<typeof serviceQuotesResultValidator>
export const serviceQuoteResultValidator = v.union(
  v.object({
    outcome: v.literal("ready"), consentTextVersion: v.string(), rejectionConsentTextVersion: v.optional(v.string()),
    quote: v.object({
      ...quoteSummaryFields, notes: v.union(v.string(), v.null()), sellerLabel: v.union(v.string(), v.null()),
      lines: v.array(v.object({ label: v.string(), quantity: v.number(), unitAmount: serviceMoneyValidator, lineAmount: serviceMoneyValidator })),
    }),
  }),
  v.object({ outcome: v.union(v.literal("unavailable"), v.literal("refused")) }),
)
export type ServiceQuoteResult = Infer<typeof serviceQuoteResultValidator>

// ─── Projections et reconstructions sans contenu privé ──────────────────────

export function bookingSnapshotOf(view: CommerceServiceBookingView, observedAt: number): ServiceBookingSnapshot {
  return {
    appointmentRef: view.appointmentRef, serviceRef: view.serviceRef, serviceLabel: view.serviceLabel, resourceLabel: view.resourceLabel,
    startAt: view.startAt, endAt: view.endAt, timeZone: view.timeZone, state: view.state, holdExpiresAt: view.holdExpiresAt,
    revision: view.revision, updatedAt: view.updatedAt, cancellation: view.cancellation, replacementRef: view.replacementRef,
    replacesRef: view.replacesRef, policy: { ...view.policy }, observedAt,
  }
}

/** Un instantané sans politique observée n'autorise aucun geste (il faut d'abord relire PRO.GA). */
function snapshotView(snapshot: ServiceBookingSnapshot): Pick<CommerceServiceBookingView, "policy" | "replacementRef" | "replacesRef" | "state"> | null {
  return snapshot.policy === null || snapshot.revision === null ? null : { policy: snapshot.policy, replacementRef: snapshot.replacementRef, replacesRef: snapshot.replacesRef, state: snapshot.state }
}
export function bookingCanChange(snapshot: ServiceBookingSnapshot | undefined, nowMs: number): boolean {
  const view = snapshot ? snapshotView(snapshot) : null
  return view !== null && commerceServiceChangeDecision(view, nowMs) === "allowed"
}
export function bookingCanCancel(snapshot: ServiceBookingSnapshot | undefined, nowMs: number): boolean {
  const view = snapshot ? snapshotView(snapshot) : null
  return view !== null && commerceServiceCancelDecision(view, nowMs) === "allowed"
}

type CommandRow = Doc<"commerceServiceCommands">

/**
 * Demande P06 RECONSTRUITE pour valider un reçu (réponse tardive ou `request.status`) après
 * expurgation du corps : seuls les champs de corrélation sont réels, jamais un texte privé.
 * Elle ne sert JAMAIS à reconstruire un envoi.
 */
export function p06ResponseRequest(row: CommandRow): CommerceCommandRequest | null {
  // Enveloppe typée : le contrat reste le littéral du contrat P06, jamais une chaîne libre.
  const base: Omit<CommerceCommandRequest, "command" | "payload" | "scope"> = {
    contract: COMMERCE_COMMAND_CONTRACT, version: 1 as const, requestId: row.requestId, source: row.source, environment: row.environment,
    issuedAt: row.issuedAt, expiresAt: row.expiresAt, subject: { kind: "buyer" as const, ref: row.subjectRef, authVerifiedAt: row.issuedAt },
  }
  const consent = (purpose: string) => ({ givenAt: row.consentedAt, purpose, textVersion: row.consentTextVersion })
  if (row.kind === "inquiry") {
    return { ...base, command: "inquiry.submit", scope: COMMERCE_COMMAND_SCOPES["inquiry.submit"],
      payload: { consent: consent("commerce_inquiry"), kind: "quote_request", message: "[redacted]", shopRef: row.shopRef } }
  }
  if (row.kind === "quote_accept" && row.quoteRef && row.quoteVersion !== undefined && row.acceptedTotal) {
    return { ...base, command: "quote.accept", scope: COMMERCE_COMMAND_SCOPES["quote.accept"],
      payload: { acceptedTotal: { ...row.acceptedTotal }, consent: consent(COMMERCE_SERVICE_CONSENTS.quote_acceptance.purpose), quoteRef: row.quoteRef, quoteVersion: row.quoteVersion, shopRef: row.shopRef } }
  }
  if (row.kind === "booking" && row.serviceRef && row.slotStartAt !== undefined && row.slotEndAt !== undefined) {
    return { ...base, command: "booking.request", scope: COMMERCE_COMMAND_SCOPES["booking.request"],
      payload: { consent: consent(COMMERCE_SERVICE_CONSENTS.booking.purpose), serviceRef: row.serviceRef, shopRef: row.shopRef,
        slot: { endAt: row.slotEndAt, startAt: row.slotStartAt, timeZone: COMMERCE_SERVICE_TIME_ZONE } } }
  }
  return null
}

/** Même principe pour les extensions du contrat de contrôle. */
export function controlResponseRequest(row: CommandRow): CommerceServiceControlRequest | null {
  // Enveloppe typée : le contrat reste le littéral du contrat de contrôle, jamais une chaîne libre.
  const base = {
    contract: COMMERCE_SERVICE_CONTROL_CONTRACT, version: 1 as const, requestId: row.requestId, source: row.source, environment: row.environment,
    issuedAt: row.issuedAt, expiresAt: row.expiresAt, shopRef: row.shopRef, subject: { kind: "buyer" as const, ref: row.subjectRef, authVerifiedAt: row.issuedAt },
  } satisfies Omit<CommerceServiceControlRequest, "operation" | "payload">
  const consent = (purpose: string) => ({ givenAt: row.consentedAt, purpose, textVersion: row.consentTextVersion })
  if (row.kind === "quote_reject" && row.quoteRef && row.quoteVersion !== undefined) {
    return { ...base, contract: COMMERCE_SERVICE_CONTROL_CONTRACT_V2, operation: "service.quote.reject", payload: { quoteRef: row.quoteRef, quoteVersion: row.quoteVersion, consent: consent(COMMERCE_SERVICE_CONSENTS.quote_rejection.purpose) } }
  }
  if (row.kind === "reschedule" && row.appointmentRef && row.expectedRevision !== undefined && row.slotStartAt !== undefined && row.slotEndAt !== undefined) {
    return { ...base, operation: "booking.reschedule.request", payload: { appointmentRef: row.appointmentRef, consent: consent(COMMERCE_SERVICE_CONSENTS.booking_change.purpose),
      expectedRevision: row.expectedRevision, slot: { endAt: row.slotEndAt, startAt: row.slotStartAt, timeZone: COMMERCE_SERVICE_TIME_ZONE } } }
  }
  if (row.kind === "cancel" && row.appointmentRef && row.expectedRevision !== undefined) {
    return { ...base, operation: "booking.cancel.request", payload: { appointmentRef: row.appointmentRef, consent: consent(COMMERCE_SERVICE_CONSENTS.booking_cancel.purpose), expectedRevision: row.expectedRevision } }
  }
  if (row.kind === "order" && row.offerRef && row.quantity !== undefined && row.expectedUnitAmount && row.expectedCatalogRevision !== undefined) {
    return { ...base, operation: "service.order.request", payload: { consent: consent(COMMERCE_SERVICE_CONSENTS.service_order.purpose), expectedCatalogRevision: row.expectedCatalogRevision,
      expectedUnitAmount: { ...row.expectedUnitAmount }, offerRef: row.offerRef, quantity: row.quantity } }
  }
  return null
}

export function commandSummary(row: CommandRow | null, nowMs: number): Infer<typeof serviceCommandSummaryValidator> | null {
  if (!row) return null
  return {
    kind: row.kind, state: row.state, reason: row.reason ?? null, createdAt: row.createdAt,
    canRetry: row.state === "unknown" && row.cancelledAt === undefined && (row.leaseUntil ?? 0) <= nowMs,
    quoteRef: row.quoteRef ?? null, currentVersion: row.currentVersion ?? null, currentTotal: row.currentTotal ?? null,
    currentUnitAmount: row.currentUnitAmount ?? null, currentCatalogRevision: row.currentCatalogRevision ?? null,
    quantity: row.quantity ?? null,
  }
}

/**
 * Projection « Mes demandes ». `controls` est un INDICE d'interface (politique ouverte pour un
 * changement ; l'annulation d'un engagement existant reste ouverte) : chaque geste est rejugé
 * par son admission, jamais accordé par ce DTO.
 */
export function projectServiceRequest(row: Doc<"commerceServiceRequests">, lastCommand: CommandRow | null, nowMs: number, controls: { change: boolean; cancel: boolean }): ServiceRequestDto {
  const busy = lastCommand !== null && lastCommand.state === "unknown" && lastCommand.cancelledAt === undefined
  const open = row.state === "active" && row.cancelledAt === undefined
  return {
    requestRowId: row.requestRowId, mode: row.mode, handle: row.handle, offerRef: row.offerRef, offerTitle: row.offerTitle,
    state: row.state, reason: row.reason ?? null, createdAt: row.createdAt, updatedAt: row.updatedAt,
    desiredDate: row.desiredDate ?? null, inquiryRef: row.inquiryRef ?? null, threadId: row.threadId ?? null,
    chosenAttachmentCount: row.chosenAttachmentCount ?? null, serviceLabel: row.serviceLabel ?? null,
    booking: row.booking ?? null, pendingReplacement: row.pendingReplacement ?? null, order: row.order ?? null, acceptedQuote: row.acceptedQuote ?? null,
    lastCommand: commandSummary(lastCommand, nowMs),
    ...(row.rejectedQuote ? { rejectedQuote: { ...row.rejectedQuote } } : {}),
    canChange: controls.change && open && !busy && row.pendingReplacement === undefined && bookingCanChange(row.booking, nowMs),
    canCancel: controls.cancel && open && !busy && bookingCanCancel(row.booking, nowMs),
    consentVersions: { ...SERVICE_CONSENT_VERSIONS }, paymentAvailable: false,
  }
}
