/**
 * PRO-COMMERCE-SERVICE-CONTROL-V1 — services, devis et rendez-vous (P14).
 *
 * FICHIER JUMEAU, octet pour octet : ANTSIA `packages/social-domain/src/commerce-services.ts`
 * et PRO.GA `packages/pro-domain/src/commerce-services.ts`, HORS du manifeste P06 gelé
 * (même règle que `commerce-checkout.ts` et `commerce-orders.ts`).
 *
 * Les commandes P06 `inquiry.submit`, `quote.accept` et `booking.request` restent
 * inchangées. Ce contrat privé ajoute des LECTURES du sujet acheteur (modes d'une offre de
 * service, créneaux libres, rendez-vous, devis reçus) et trois extensions FERMÉES, proposées
 * avant leur code : `booking.reschedule.request`, `booking.cancel.request` et
 * `service.order.request` (tarif fixe sans créneau, sans réservation de stock). Le nom réservé
 * P06 `booking.cancel` reste refusé par le contrat P06 : l'annulation passe ici, avec son
 * profil de signature propre et son consentement propre.
 *
 * Règles : même clé (source, environnement, requestId) + mêmes octets = mêmes octets de
 * réponse ; même clé + autres octets = conflit ; une extension qui échoue ne modifie rien
 * (un changement de créneau refusé conserve l'ancien rendez-vous) ; aucun acompte ni
 * paiement n'est ouvert par ce contrat. Instants en millisecondes UTC, fuseau IANA explicite.
 *
 * TypeScript pur : aucune I/O, aucune horloge implicite, aucun aléa, aucun secret.
 */
import { COMMERCE_COMMAND_FORBIDDEN_FIELDS, COMMERCE_TIME_ZONES, type CommerceCommandScope } from "./commerce/command";
import {
  COMMERCE_BOOKING_STATES, COMMERCE_ORDER_STATES, COMMERCE_QUOTE_STATES,
  type CommerceBookingState, type CommerceQuoteState,
} from "./commerce/lifecycle";
import {
  COMMERCE_ENVIRONMENTS, COMMERCE_MAX_SKEW_MS, commerceAntsiaRef, commerceArray, commerceBoolean, commerceCapture,
  commerceConsent, commerceHas, commerceInstant, commerceInteger, commerceIsMachineIdentity, commerceIsOpaqueId,
  commerceIsoDate, commerceIsSha256, commerceLiteral, commerceMoney, commerceOptionalRef, commerceParseCanonicalBody,
  commerceRecord, commerceRef, commerceReject, commerceScanJson, commerceSumAmounts, commerceText, commerceUnique,
  commerceUtf8ByteLength,
  type CommerceConsent, type CommerceEnvironment, type CommerceMoney, type CommerceRecord, type CommerceResult,
} from "./commerce/primitives";

export const COMMERCE_SERVICE_CONTROL_CONTRACT = "PRO-COMMERCE-SERVICE-CONTROL-V1";
export const COMMERCE_SERVICE_CONTROL_PROFILE = "pro-ga-commerce-service-control-hmac/v1";
/** MP06 : refus de devis client explicite ; aucune admission implicite par une source V1. */
export const COMMERCE_SERVICE_CONTROL_CONTRACT_V2 = "PRO-COMMERCE-SERVICE-CONTROL-V2";
export const COMMERCE_SERVICE_CONTROL_PROFILE_V2 = "pro-ga-commerce-service-control-hmac/v2";
export type CommerceServiceControlContract = typeof COMMERCE_SERVICE_CONTROL_CONTRACT | typeof COMMERCE_SERVICE_CONTROL_CONTRACT_V2;
export function isCommerceServiceControlContract(value: unknown): value is CommerceServiceControlContract {
  return value === COMMERCE_SERVICE_CONTROL_CONTRACT || value === COMMERCE_SERVICE_CONTROL_CONTRACT_V2;
}
export const COMMERCE_SERVICE_CONTROL_AUDIENCE = "pro.ga.commerce.service";
export const COMMERCE_SERVICE_CONTROL_MAX_BYTES = 8192;
export const COMMERCE_SERVICE_CONTROL_RESPONSE_MAX_BYTES = 65536;
export const COMMERCE_SERVICE_CONTROL_TTL_MS = 60_000;
/** V1 : le fuseau unique de l'agenda PRO.GA (`AGENDA_TIMEZONE`), écrit dans chaque créneau. */
export const COMMERCE_SERVICE_TIME_ZONE: (typeof COMMERCE_TIME_ZONES)[number] = "Africa/Libreville";

export const COMMERCE_SERVICE_LIMITS = {
  slotHorizonDays: 14,
  slotsMax: 60,
  servicesMax: 10,
  quotesMax: 20,
  quoteLinesMax: 50,
  orderQuantityMax: 20,
  labelMax: 120,
  descriptionMax: 600,
  notesMax: 2000,
  noteMax: 500,
  displayNameMax: 80,
  bookingMaxMinutes: 480,
  currentStatesMax: 4,
  quoteNeedMax: 1200,
  quoteConstraintsMax: 600,
  quoteAttachmentsMax: 3,
} as const;
const L = COMMERCE_SERVICE_LIMITS;
const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;

/**
 * Consentements de geste, versionnés. `quote_acceptance` et `booking` portent les finalités
 * fermées de P06 (`commerce_quote_acceptance`, `commerce_booking`) ; les trois autres sont
 * propres aux extensions de ce contrat. Le texte affiché est celui des clés i18n ANTSIA ;
 * cette définition fait foi pour l'empreinte conservée par PRO.GA.
 */
export const COMMERCE_SERVICE_CONSENTS = {
  quote_acceptance: { purpose: "commerce_quote_acceptance", textVersion: "2026-10-18-p14-quote-v1" },
  booking: { purpose: "commerce_booking", textVersion: "2026-10-18-p14-booking-v1" },
  booking_change: { purpose: "commerce_booking_change", textVersion: "2026-10-18-p14-change-v1" },
  booking_cancel: { purpose: "commerce_booking_cancel", textVersion: "2026-10-18-p14-cancel-v1" },
  service_order: { purpose: "commerce_service_order", textVersion: "2026-10-18-p14-order-v1" },
  quote_rejection: { purpose: "commerce_quote_rejection", textVersion: "2026-10-21-mp06-quote-reject-v1" },
} as const;
export type CommerceServiceConsentKind = keyof typeof COMMERCE_SERVICE_CONSENTS;
export const COMMERCE_SERVICE_CONSENT_TEXTS: Readonly<Record<CommerceServiceConsentKind, { readonly en: string; readonly fr: string }>> = {
  quote_acceptance: {
    fr: "J’accepte ce devis dans la version et pour le total affichés. Mon acceptation est transmise à PRO.GA et peut ouvrir une commande auprès de ce professionnel. Aucun paiement n’est déclenché.",
    en: "I accept this quote in the version and for the total shown. My acceptance is sent to PRO.GA and may open an order with this professional. No payment is triggered.",
  },
  booking: {
    fr: "Je demande ce créneau à ce professionnel. Il peut être retenu pour une durée limitée en attendant sa confirmation. Aucun paiement n’est déclenché.",
    en: "I request this time slot from this professional. It may be held for a limited time while awaiting confirmation. No payment is triggered.",
  },
  booking_change: {
    fr: "Je demande à changer de créneau. Mon rendez-vous actuel est conservé si le nouveau créneau n’est pas obtenu.",
    en: "I request a different time slot. My current appointment is kept if the new slot cannot be obtained.",
  },
  booking_cancel: {
    fr: "J’annule ce rendez-vous. Le créneau est libéré pour d’autres clients.",
    en: "I cancel this appointment. The slot is released for other clients.",
  },
  service_order: {
    fr: "Je commande cette prestation au tarif affiché. Le professionnel confirme ma commande ; aucun paiement n’est déclenché.",
    en: "I order this service at the price shown. The professional confirms my order; no payment is triggered.",
  },
  quote_rejection: {
    fr: "Je refuse ce devis dans la version affichée. Mon refus est transmis à ce professionnel et ne crée aucune commande ni aucun paiement.",
    en: "I decline this quote in the version shown. My decision is sent to this professional and creates no order or payment.",
  },
};

export const COMMERCE_SERVICE_CONTROL_OPERATIONS = [
  "service.options",
  "booking.slots",
  "booking.read",
  "booking.reschedule.request",
  "booking.cancel.request",
  "quote.list",
  "quote.read",
  "service.order.request",
  "action.status",
] as const;
export const COMMERCE_SERVICE_CONTROL_V2_OPERATIONS = ["service.quote.reject", "quote.read", "quote.list", "action.status"] as const;
export const COMMERCE_SERVICE_CONTROL_ALL_OPERATIONS = [...COMMERCE_SERVICE_CONTROL_OPERATIONS, "service.quote.reject"] as const;
export type CommerceServiceControlOperation = (typeof COMMERCE_SERVICE_CONTROL_ALL_OPERATIONS)[number];
/** Extensions qui écrivent : décision durable, rejouée à l'octet près. */
export const COMMERCE_SERVICE_ACTION_OPERATIONS = ["booking.reschedule.request", "booking.cancel.request", "service.order.request"] as const;
export const COMMERCE_SERVICE_ALL_ACTION_OPERATIONS = [...COMMERCE_SERVICE_ACTION_OPERATIONS, "service.quote.reject"] as const;
export type CommerceServiceActionOperation = (typeof COMMERCE_SERVICE_ALL_ACTION_OPERATIONS)[number];

export const COMMERCE_SERVICE_CONTROL_PATHS = {
  "service.options": "/commerce/v1/services/options",
  "booking.slots": "/commerce/v1/services/bookings/slots",
  "booking.read": "/commerce/v1/services/bookings/read",
  "booking.reschedule.request": "/commerce/v1/services/bookings/reschedule-requests",
  "booking.cancel.request": "/commerce/v1/services/bookings/cancellation-requests",
  "quote.list": "/commerce/v1/services/quotes/list",
  "quote.read": "/commerce/v1/services/quotes/read",
  "service.order.request": "/commerce/v1/services/orders",
  "action.status": "/commerce/v1/services/actions/status",
} as const;
export const COMMERCE_SERVICE_CONTROL_V2_PATHS = {
  "service.quote.reject": "/commerce/v2/services/quotes/reject",
  "quote.read": "/commerce/v2/services/quotes/read",
  "quote.list": "/commerce/v2/services/quotes/list",
  "action.status": "/commerce/v2/services/actions/status",
} as const;

/** Chaque opération emprunte un scope P06 existant : la source PRO.GA le relit depuis sa clé. */
export const COMMERCE_SERVICE_CONTROL_SCOPES = {
  "service.options": "commerce.inquiry.submit",
  "booking.slots": "commerce.booking.request",
  "booking.read": "commerce.booking.request",
  "booking.reschedule.request": "commerce.booking.request",
  "booking.cancel.request": "commerce.booking.request",
  "quote.list": "commerce.quote.accept",
  "quote.read": "commerce.quote.accept",
  "service.order.request": "commerce.checkout.prepare",
  "action.status": "commerce.request.status",
} as const satisfies Readonly<Record<(typeof COMMERCE_SERVICE_CONTROL_OPERATIONS)[number], CommerceCommandScope>>;
export const COMMERCE_SERVICE_CONTROL_V2_SCOPES = { "service.quote.reject": "commerce.quote.reject", "quote.read": "commerce.quote.accept", "quote.list": "commerce.quote.accept", "action.status": "commerce.request.status" } as const;
export type CommerceServiceControlScope = CommerceCommandScope | (typeof COMMERCE_SERVICE_CONTROL_V2_SCOPES)[keyof typeof COMMERCE_SERVICE_CONTROL_V2_SCOPES];

export function commerceServiceControlOperationAllowed(operation: string, contract: CommerceServiceControlContract = COMMERCE_SERVICE_CONTROL_CONTRACT): operation is CommerceServiceControlOperation {
  if (!isCommerceServiceControlContract(contract)) return false;
  return ((contract === COMMERCE_SERVICE_CONTROL_CONTRACT_V2 ? COMMERCE_SERVICE_CONTROL_V2_OPERATIONS : COMMERCE_SERVICE_CONTROL_OPERATIONS) as readonly string[]).includes(operation);
}
export function commerceServiceControlPath(operation: CommerceServiceControlOperation, contract: CommerceServiceControlContract = COMMERCE_SERVICE_CONTROL_CONTRACT): string | null {
  if (!commerceServiceControlOperationAllowed(operation, contract)) return null;
  return contract === COMMERCE_SERVICE_CONTROL_CONTRACT_V2
    ? COMMERCE_SERVICE_CONTROL_V2_PATHS[operation as keyof typeof COMMERCE_SERVICE_CONTROL_V2_PATHS]
    : COMMERCE_SERVICE_CONTROL_PATHS[operation as keyof typeof COMMERCE_SERVICE_CONTROL_PATHS];
}
export function commerceServiceControlScope(operation: CommerceServiceControlOperation, contract: CommerceServiceControlContract = COMMERCE_SERVICE_CONTROL_CONTRACT): CommerceServiceControlScope | null {
  if (!commerceServiceControlOperationAllowed(operation, contract)) return null;
  return contract === COMMERCE_SERVICE_CONTROL_CONTRACT_V2
    ? COMMERCE_SERVICE_CONTROL_V2_SCOPES[operation as keyof typeof COMMERCE_SERVICE_CONTROL_V2_SCOPES]
    : COMMERCE_SERVICE_CONTROL_SCOPES[operation as keyof typeof COMMERCE_SERVICE_CONTROL_SCOPES];
}

/** Refus métier fermés par opération ; `access_denied` est INDISTINCT (objet, sujet, boutique, mandat). */
export const COMMERCE_SERVICE_REFUSALS: Readonly<Record<CommerceServiceControlOperation, readonly string[]>> = {
  "service.options": ["access_denied", "capability_disabled", "offer_unavailable"],
  "booking.slots": ["access_denied", "capability_disabled"],
  "booking.read": ["access_denied"],
  "booking.reschedule.request": ["access_denied", "capability_disabled", "change_pending", "consent_invalid", "not_changeable", "quota_exceeded", "request_expired", "slot_unavailable", "stale_revision", "too_late"],
  "booking.cancel.request": ["access_denied", "consent_invalid", "not_cancellable", "request_expired", "stale_revision"],
  "quote.list": ["access_denied", "capability_disabled"],
  "quote.read": ["access_denied"],
  "service.order.request": ["access_denied", "capability_disabled", "consent_invalid", "not_orderable", "offer_unavailable", "quota_exceeded", "request_expired"],
  "action.status": ["access_denied"],
  "service.quote.reject": ["access_denied", "capability_disabled", "consent_invalid", "not_rejectable", "request_expired", "stale_revision", "quota_exceeded"],
};
export const COMMERCE_SERVICE_UNAVAILABLE_REASONS = ["rate_limited", "temporarily_unavailable"] as const;
export const COMMERCE_SERVICE_OUTCOMES = ["accepted", "conflict", "reconfirm_required", "refused", "unavailable"] as const;
export type CommerceServiceOutcome = (typeof COMMERCE_SERVICE_OUTCOMES)[number];
export const COMMERCE_SERVICE_OUTCOME_HTTP_STATUS: Readonly<Record<CommerceServiceOutcome, number>> = {
  accepted: 200, conflict: 409, reconfirm_required: 200, refused: 422, unavailable: 503,
};

// ─── Demandes ────────────────────────────────────────────────────────────────

export type CommerceServiceSlot = { readonly endAt: number; readonly startAt: number; readonly timeZone: (typeof COMMERCE_TIME_ZONES)[number] };

export type CommerceServiceControlPayloads = {
  readonly "service.options": { readonly offerRef: string };
  readonly "booking.slots": { readonly fromAt: number; readonly resourceRef?: string; readonly serviceRef: string; readonly toAt: number };
  readonly "booking.read": { readonly appointmentRef: string };
  readonly "booking.reschedule.request": {
    readonly appointmentRef: string; readonly consent: CommerceConsent; readonly expectedRevision: number;
    readonly resourceRef?: string; readonly slot: CommerceServiceSlot;
  };
  readonly "booking.cancel.request": { readonly appointmentRef: string; readonly consent: CommerceConsent; readonly expectedRevision: number };
  readonly "quote.list": { readonly inquiryRef?: string };
  readonly "quote.read": { readonly quoteRef: string };
  readonly "service.quote.reject": { readonly quoteRef: string; readonly quoteVersion: number; readonly consent: CommerceConsent };
  readonly "service.order.request": {
    readonly consent: CommerceConsent; readonly desiredDate?: string; readonly displayName?: string;
    readonly expectedCatalogRevision: number; readonly expectedUnitAmount: CommerceMoney; readonly note?: string;
    readonly offerRef: string; readonly quantity: number;
  };
  readonly "action.status": { readonly targetOperation: CommerceServiceActionOperation; readonly targetRequestId: string; readonly targetRequestSha256: string };
};

type RequestBase = {
  readonly contract: CommerceServiceControlContract;
  readonly environment: CommerceEnvironment;
  readonly expiresAt: number;
  readonly issuedAt: number;
  readonly requestId: string;
  readonly shopRef: string;
  readonly source: string;
  readonly subject: { readonly authVerifiedAt: number; readonly kind: "buyer"; readonly ref: string };
  readonly version: 1;
};
export type CommerceServiceControlRequest = {
  readonly [Operation in CommerceServiceControlOperation]: RequestBase & {
    readonly contract: Operation extends "service.quote.reject" ? typeof COMMERCE_SERVICE_CONTROL_CONTRACT_V2 : Operation extends "action.status" | "quote.read" | "quote.list" ? CommerceServiceControlContract : typeof COMMERCE_SERVICE_CONTROL_CONTRACT;
    readonly operation: Operation;
    readonly payload: CommerceServiceControlPayloads[Operation];
  };
}[CommerceServiceControlOperation];

const P = "$.payload";
const FORBIDDEN: ReadonlySet<string> = new Set(COMMERCE_COMMAND_FORBIDDEN_FIELDS);
const REQUEST_KEYS = ["contract", "environment", "expiresAt", "issuedAt", "operation", "payload", "requestId", "shopRef", "source", "subject", "version"] as const;

function readRevision(value: unknown, path: string): number {
  return commerceInteger(value, path, 1, Number.MAX_SAFE_INTEGER, "invalid_revision");
}

function optionalText(row: CommerceRecord, key: string, max: number, multiline = false): string | undefined {
  return commerceHas(row, key) ? commerceText(row[key], `${P}.${key}`, 1, max, multiline) : undefined;
}

function readSlot(value: unknown, path: string, issuedAt: number): CommerceServiceSlot {
  const row = commerceRecord(value, path, ["endAt", "startAt", "timeZone"]);
  const endAt = commerceInstant(row.endAt, `${path}.endAt`);
  const startAt = commerceInstant(row.startAt, `${path}.startAt`);
  const timeZone = commerceLiteral(row.timeZone, `${path}.timeZone`, COMMERCE_TIME_ZONES);
  // Un instant et une zone explicites ; un créneau futur et borné comme l'agenda PRO.GA.
  if (endAt <= startAt || endAt - startAt > L.bookingMaxMinutes * MINUTE_MS) commerceReject("invalid_time", `${path}.endAt`);
  if (startAt <= issuedAt) commerceReject("invalid_time", `${path}.startAt`);
  return { endAt, startAt, timeZone };
}

function readPayload(operation: CommerceServiceControlOperation, value: unknown, issuedAt: number, contract: CommerceServiceControlContract): CommerceServiceControlRequest["payload"] {
  if (value === null || typeof value !== "object" || Array.isArray(value)) commerceReject("invalid_payload", P);
  commerceScanJson(value, FORBIDDEN, P);
  switch (operation) {
    case "service.options": {
      const row = commerceRecord(value, P, ["offerRef"]);
      return { offerRef: commerceRef(row.offerRef, `${P}.offerRef`, ["offer"]) };
    }
    case "booking.slots": {
      const row = commerceRecord(value, P, ["fromAt", "serviceRef", "toAt"], ["resourceRef"]);
      const fromAt = commerceInstant(row.fromAt, `${P}.fromAt`);
      const toAt = commerceInstant(row.toAt, `${P}.toAt`);
      // Fenêtre bornée : jamais un balayage de l'agenda ni une fenêtre passée.
      if (toAt <= fromAt || toAt - fromAt > L.slotHorizonDays * DAY_MS || fromAt < issuedAt - DAY_MS) commerceReject("invalid_time", `${P}.toAt`);
      const resourceRef = commerceOptionalRef(row, "resourceRef", P, ["agenda_resource"]);
      return { fromAt, ...(resourceRef === undefined ? {} : { resourceRef }), serviceRef: commerceRef(row.serviceRef, `${P}.serviceRef`, ["agenda_service"]), toAt };
    }
    case "booking.read": {
      const row = commerceRecord(value, P, ["appointmentRef"]);
      return { appointmentRef: commerceRef(row.appointmentRef, `${P}.appointmentRef`, ["appointment"]) };
    }
    case "booking.reschedule.request": {
      const row = commerceRecord(value, P, ["appointmentRef", "consent", "expectedRevision", "slot"], ["resourceRef"]);
      const appointmentRef = commerceRef(row.appointmentRef, `${P}.appointmentRef`, ["appointment"]);
      const consent = commerceConsent(row.consent, `${P}.consent`, COMMERCE_SERVICE_CONSENTS.booking_change.purpose, issuedAt);
      const expectedRevision = readRevision(row.expectedRevision, `${P}.expectedRevision`);
      const resourceRef = commerceOptionalRef(row, "resourceRef", P, ["agenda_resource"]);
      const slot = readSlot(row.slot, `${P}.slot`, issuedAt);
      return { appointmentRef, consent, expectedRevision, ...(resourceRef === undefined ? {} : { resourceRef }), slot };
    }
    case "booking.cancel.request": {
      const row = commerceRecord(value, P, ["appointmentRef", "consent", "expectedRevision"]);
      return {
        appointmentRef: commerceRef(row.appointmentRef, `${P}.appointmentRef`, ["appointment"]),
        consent: commerceConsent(row.consent, `${P}.consent`, COMMERCE_SERVICE_CONSENTS.booking_cancel.purpose, issuedAt),
        expectedRevision: readRevision(row.expectedRevision, `${P}.expectedRevision`),
      };
    }
    case "quote.list": {
      const row = commerceRecord(value, P, [], ["inquiryRef"]);
      const inquiryRef = commerceOptionalRef(row, "inquiryRef", P, ["inquiry"]);
      return inquiryRef === undefined ? {} : { inquiryRef };
    }
    case "quote.read": {
      const row = commerceRecord(value, P, ["quoteRef"]);
      return { quoteRef: commerceRef(row.quoteRef, `${P}.quoteRef`, ["quote"]) };
    }
    case "service.quote.reject": {
      const row = commerceRecord(value, P, ["quoteRef", "quoteVersion", "consent"]);
      return { quoteRef: commerceRef(row.quoteRef, `${P}.quoteRef`, ["quote"]), quoteVersion: readRevision(row.quoteVersion, `${P}.quoteVersion`),
        consent: commerceConsent(row.consent, `${P}.consent`, COMMERCE_SERVICE_CONSENTS.quote_rejection.purpose, issuedAt) };
    }
    case "service.order.request": {
      const row = commerceRecord(value, P, ["consent", "expectedCatalogRevision", "expectedUnitAmount", "offerRef", "quantity"], ["desiredDate", "displayName", "note"]);
      const consent = commerceConsent(row.consent, `${P}.consent`, COMMERCE_SERVICE_CONSENTS.service_order.purpose, issuedAt);
      const desiredDate = commerceHas(row, "desiredDate") ? commerceIsoDate(row.desiredDate, `${P}.desiredDate`) : undefined;
      const displayName = optionalText(row, "displayName", L.displayNameMax);
      const expectedCatalogRevision = readRevision(row.expectedCatalogRevision, `${P}.expectedCatalogRevision`);
      const expectedUnitAmount = commerceMoney(row.expectedUnitAmount, `${P}.expectedUnitAmount`, 1);
      const note = optionalText(row, "note", L.noteMax, true);
      const offerRef = commerceRef(row.offerRef, `${P}.offerRef`, ["offer"]);
      const quantity = commerceInteger(row.quantity, `${P}.quantity`, 1, L.orderQuantityMax);
      return {
        consent, ...(desiredDate === undefined ? {} : { desiredDate }), ...(displayName === undefined ? {} : { displayName }),
        expectedCatalogRevision, expectedUnitAmount, ...(note === undefined ? {} : { note }), offerRef, quantity,
      };
    }
    case "action.status": {
      const row = commerceRecord(value, P, ["targetOperation", "targetRequestId", "targetRequestSha256"]);
      const targetOperation = commerceLiteral(row.targetOperation, `${P}.targetOperation`, contract === COMMERCE_SERVICE_CONTROL_CONTRACT_V2 ? ["service.quote.reject"] : COMMERCE_SERVICE_ACTION_OPERATIONS);
      if (!commerceIsOpaqueId(row.targetRequestId)) commerceReject("invalid_payload", `${P}.targetRequestId`);
      if (!commerceIsSha256(row.targetRequestSha256)) commerceReject("invalid_payload", `${P}.targetRequestSha256`);
      return { targetOperation, targetRequestId: row.targetRequestId, targetRequestSha256: row.targetRequestSha256 };
    }
  }
}

/**
 * Demande reçue (octets canoniques exacts). Comme P06, l'expiration n'est PAS jugée ici :
 * une extension déjà décidée se rejoue même expirée ; le destinataire refuse ensuite
 * `request_expired` tout ce qui n'a pas de décision enregistrée.
 */
export function parseCommerceServiceControlRequest(
  rawBody: string,
  context: { readonly environment: CommerceEnvironment; readonly nowMs: number; readonly source: string; readonly contract?: CommerceServiceControlContract },
): CommerceResult<CommerceServiceControlRequest, string> {
  return commerceCapture(() => {
    const row = commerceRecord(commerceParseCanonicalBody(rawBody, COMMERCE_SERVICE_CONTROL_MAX_BYTES), "$", REQUEST_KEYS, [], "invalid_request");
    const contract = context.contract ?? COMMERCE_SERVICE_CONTROL_CONTRACT;
    if (!isCommerceServiceControlContract(contract) || row.contract !== contract || row.version !== 1) commerceReject("invalid_request", "$.contract");
    const operation = commerceLiteral(row.operation, "$.operation", COMMERCE_SERVICE_CONTROL_ALL_OPERATIONS, "invalid_request");
    if (!commerceServiceControlOperationAllowed(operation, contract)) commerceReject("invalid_request", "$.operation");
    if (!commerceIsOpaqueId(row.requestId)) commerceReject("invalid_request", "$.requestId");
    const requestId = row.requestId;
    if (!commerceIsMachineIdentity(row.source)) commerceReject("invalid_request", "$.source");
    if (row.source !== context.source) commerceReject("source_mismatch", "$.source");
    const source = row.source;
    const environment = commerceLiteral(row.environment, "$.environment", COMMERCE_ENVIRONMENTS, "invalid_request");
    if (environment !== context.environment) commerceReject("environment_mismatch", "$.environment");
    const issuedAt = commerceInstant(row.issuedAt, "$.issuedAt");
    const expiresAt = commerceInstant(row.expiresAt, "$.expiresAt");
    if (expiresAt <= issuedAt || expiresAt - issuedAt > COMMERCE_SERVICE_CONTROL_TTL_MS) commerceReject("invalid_time", "$.expiresAt");
    if (!Number.isSafeInteger(context.nowMs) || issuedAt > context.nowMs + COMMERCE_MAX_SKEW_MS) commerceReject("invalid_time", "$.issuedAt");
    const subject = commerceRecord(row.subject, "$.subject", ["authVerifiedAt", "kind", "ref"], [], "invalid_request");
    if (subject.kind !== "buyer") commerceReject("subject_not_allowed", "$.subject.kind");
    const authVerifiedAt = commerceInstant(subject.authVerifiedAt, "$.subject.authVerifiedAt");
    // Session ANTSIA vivante revérifiée au plus cinq minutes avant l'émission.
    if (authVerifiedAt > issuedAt || issuedAt - authVerifiedAt > COMMERCE_MAX_SKEW_MS) commerceReject("invalid_time", "$.subject.authVerifiedAt");
    const shopRef = commerceRef(row.shopRef, "$.shopRef", ["structure"]);
    const payload = readPayload(operation, row.payload, issuedAt, contract);
    return {
      contract, environment, expiresAt, issuedAt, operation, payload, requestId, shopRef, source,
      subject: { authVerifiedAt, kind: "buyer", ref: commerceAntsiaRef(subject.ref, "$.subject.ref", "sub") }, version: 1,
    } as CommerceServiceControlRequest;
  });
}

// ─── Réponses ────────────────────────────────────────────────────────────────

export type CommerceServiceFixedOrderOption = {
  readonly catalogRevision: number; readonly leadTimeDays: number | null; readonly quantityMax: number;
  readonly unit: string | null; readonly unitAmount: CommerceMoney;
};
export type CommerceServiceBookable = {
  readonly autoConfirm: boolean; readonly description: string | null; readonly durationMinutes: number; readonly holdMinutes: number;
  readonly label: string; readonly maxAdvanceDays: number; readonly minNoticeMinutes: number; readonly serviceRef: string;
};
export type CommerceServiceOptions = {
  readonly booking: null | { readonly services: readonly CommerceServiceBookable[] };
  readonly fixedOrder: CommerceServiceFixedOrderOption | null;
  readonly offerRef: string;
  readonly quote: { readonly available: boolean };
  readonly timeZone: (typeof COMMERCE_TIME_ZONES)[number];
};
export type CommerceServiceFreeSlot = { readonly endAt: number; readonly resourceLabel: string | null; readonly resourceRef: string; readonly startAt: number };
export type CommerceServiceSlots = {
  readonly durationMinutes: number; readonly fromAt: number; readonly serviceRef: string;
  readonly slots: readonly CommerceServiceFreeSlot[]; readonly timeZone: (typeof COMMERCE_TIME_ZONES)[number];
  readonly toAt: number; readonly truncated: boolean;
};
export type CommerceServiceBookingPolicy = {
  readonly cancelUntil: number | null; readonly changeRequiresConfirmation: boolean; readonly changeUntil: number | null;
  readonly deposit: "unavailable";
};
export const COMMERCE_SERVICE_CANCELLATIONS = ["client", "expired", "professional", "rescheduled"] as const;
export type CommerceServiceBookingView = {
  readonly appointmentRef: string;
  readonly cancellation: (typeof COMMERCE_SERVICE_CANCELLATIONS)[number] | null;
  readonly endAt: number;
  readonly holdExpiresAt: number | null;
  readonly policy: CommerceServiceBookingPolicy;
  /** Demande de remplacement en attente de confirmation (l'ancien rendez-vous reste tenu). */
  readonly replacementRef: string | null;
  /** Le rendez-vous que celui-ci remplace, s'il en remplace un. */
  readonly replacesRef: string | null;
  readonly resourceLabel: string | null;
  readonly revision: number;
  readonly serviceLabel: string;
  readonly serviceRef: string;
  readonly startAt: number;
  readonly state: CommerceBookingState;
  readonly timeZone: (typeof COMMERCE_TIME_ZONES)[number];
  readonly updatedAt: number;
};
export type CommerceServiceReschedule = { readonly current: CommerceServiceBookingView; readonly previous: CommerceServiceBookingView };
export type CommerceServiceClientAcceptance = {
  readonly acceptedAt: number; readonly acceptedTotal: CommerceMoney; readonly orderRef: string | null; readonly quoteVersion: number;
};
export type CommerceServiceClientRejection = { readonly quoteVersion: number; readonly rejectedAt: number };
export type CommerceServiceQuoteRejection = CommerceServiceClientRejection & { readonly quoteRef: string; readonly state: "rejected" };
export type CommerceServiceQuoteSummary = {
  readonly acceptable: boolean;
  readonly clientAcceptance: CommerceServiceClientAcceptance | null;
  /** Présents uniquement dans une vue SERVICE-CONTROL-V2 explicitement demandée. */
  readonly rejectable?: boolean;
  readonly clientRejection?: CommerceServiceClientRejection | null;
  /** Dernière version transmise de son fil ; une version révisée exige une nouvelle acceptation. */
  readonly current: boolean;
  readonly inquiryRef: string | null;
  readonly quoteRef: string;
  readonly reference: string;
  readonly sentAt: number | null;
  readonly state: CommerceQuoteState;
  readonly title: string;
  readonly total: CommerceMoney;
  readonly validUntil: number | null;
  readonly version: number;
};
export type CommerceServiceQuoteLine = { readonly label: string; readonly lineAmount: CommerceMoney; readonly quantity: number; readonly unitAmount: CommerceMoney };
export type CommerceServiceQuoteDetail = CommerceServiceQuoteSummary & {
  readonly lines: readonly CommerceServiceQuoteLine[]; readonly notes: string | null; readonly sellerLabel: string | null;
};
export type CommerceServiceOrderResult = {
  readonly catalogRevision: number; readonly createdAt: number; readonly lines: readonly CommerceServiceQuoteLine[];
  readonly orderRef: string; readonly state: "pending"; readonly total: CommerceMoney;
};
export type CommerceServiceOrderReconfirm = { readonly currentCatalogRevision: number; readonly currentUnitAmount: CommerceMoney; readonly state: "reconfirm" };
export const COMMERCE_SERVICE_PRIVATE_KINDS = ["appointment", "order", "quote"] as const;
export type CommerceServicePrivateState = {
  readonly objectKind: (typeof COMMERCE_SERVICE_PRIVATE_KINDS)[number]; readonly objectRef: string;
  readonly revision: number; readonly state: string; readonly updatedAt: number;
};
export type CommerceServiceActionStatus = {
  readonly current: readonly CommerceServicePrivateState[];
  readonly recordedResponse?: string;
  readonly recordedResponseSha256?: string;
  readonly state: "completed" | "unknown";
  readonly targetRequestId: string;
};
export type CommerceServiceControlResult =
  | CommerceServiceActionStatus
  | CommerceServiceOptions
  | CommerceServiceOrderReconfirm
  | CommerceServiceOrderResult
  | CommerceServiceReschedule
  | CommerceServiceSlots
  | CommerceServiceQuoteRejection
  | { readonly booking: CommerceServiceBookingView }
  | { readonly quote: CommerceServiceQuoteDetail }
  | { readonly quotes: readonly CommerceServiceQuoteSummary[]; readonly truncated: boolean };

type ReplyBase = {
  readonly contract: CommerceServiceControlContract; readonly requestId: string; readonly requestSha256: string;
  readonly respondedAt: number; readonly version: 1;
};
export type CommerceServiceControlResponse = ReplyBase & (
  | { readonly outcome: "accepted" | "reconfirm_required"; readonly result: CommerceServiceControlResult }
  | { readonly outcome: "conflict" | "refused" | "unavailable"; readonly reason: string }
);

const R = "$.result";

function mismatch(path: string): never {
  return commerceReject("correlation_mismatch", path);
}
function nullableText(value: unknown, path: string, max: number, multiline = false): string | null {
  return value === null ? null : commerceText(value, path, 1, max, multiline);
}
function nullableInstant(value: unknown, path: string): number | null {
  return value === null ? null : commerceInstant(value, path);
}
function nullableRef(value: unknown, path: string, kind: "appointment" | "inquiry" | "order"): string | null {
  return value === null ? null : commerceRef(value, path, [kind]);
}

function readOptions(value: unknown, request: CommerceServiceControlPayloads["service.options"]): CommerceServiceOptions {
  const row = commerceRecord(value, R, ["booking", "fixedOrder", "offerRef", "quote", "timeZone"]);
  if (row.offerRef !== request.offerRef) mismatch(`${R}.offerRef`);
  const timeZone = commerceLiteral(row.timeZone, `${R}.timeZone`, COMMERCE_TIME_ZONES);
  let fixedOrder: CommerceServiceFixedOrderOption | null = null;
  if (row.fixedOrder !== null) {
    const at = `${R}.fixedOrder`, item = commerceRecord(row.fixedOrder, at, ["catalogRevision", "leadTimeDays", "quantityMax", "unit", "unitAmount"]);
    fixedOrder = {
      catalogRevision: readRevision(item.catalogRevision, `${at}.catalogRevision`),
      leadTimeDays: item.leadTimeDays === null ? null : commerceInteger(item.leadTimeDays, `${at}.leadTimeDays`, 0, 365),
      quantityMax: commerceInteger(item.quantityMax, `${at}.quantityMax`, 1, L.orderQuantityMax),
      unit: nullableText(item.unit, `${at}.unit`, 20),
      unitAmount: commerceMoney(item.unitAmount, `${at}.unitAmount`, 1),
    };
  }
  const quote = commerceRecord(row.quote, `${R}.quote`, ["available"]);
  let booking: CommerceServiceOptions["booking"] = null;
  if (row.booking !== null) {
    const at = `${R}.booking`, item = commerceRecord(row.booking, at, ["services"]);
    const services = commerceArray(item.services, `${at}.services`, 1, L.servicesMax).map((entry, index): CommerceServiceBookable => {
      const path = `${at}.services[${index}]`;
      const service = commerceRecord(entry, path, ["autoConfirm", "description", "durationMinutes", "holdMinutes", "label", "maxAdvanceDays", "minNoticeMinutes", "serviceRef"]);
      return {
        autoConfirm: commerceBoolean(service.autoConfirm, `${path}.autoConfirm`),
        description: nullableText(service.description, `${path}.description`, L.descriptionMax, true),
        durationMinutes: commerceInteger(service.durationMinutes, `${path}.durationMinutes`, 1, L.bookingMaxMinutes),
        holdMinutes: commerceInteger(service.holdMinutes, `${path}.holdMinutes`, 1, 7 * 24 * 60),
        label: commerceText(service.label, `${path}.label`, 1, L.labelMax),
        maxAdvanceDays: commerceInteger(service.maxAdvanceDays, `${path}.maxAdvanceDays`, 0, 366),
        minNoticeMinutes: commerceInteger(service.minNoticeMinutes, `${path}.minNoticeMinutes`, 0, 30 * 24 * 60),
        serviceRef: commerceRef(service.serviceRef, `${path}.serviceRef`, ["agenda_service"]),
      };
    });
    commerceUnique(services.map((service) => service.serviceRef), `${at}.services`);
    booking = { services };
  }
  return { booking, fixedOrder, offerRef: request.offerRef, quote: { available: commerceBoolean(quote.available, `${R}.quote.available`) }, timeZone };
}

function readSlots(value: unknown, request: CommerceServiceControlPayloads["booking.slots"]): CommerceServiceSlots {
  const row = commerceRecord(value, R, ["durationMinutes", "fromAt", "serviceRef", "slots", "timeZone", "toAt", "truncated"]);
  if (row.serviceRef !== request.serviceRef) mismatch(`${R}.serviceRef`);
  if (row.fromAt !== request.fromAt || row.toAt !== request.toAt) mismatch(`${R}.fromAt`);
  const durationMinutes = commerceInteger(row.durationMinutes, `${R}.durationMinutes`, 1, L.bookingMaxMinutes);
  const timeZone = commerceLiteral(row.timeZone, `${R}.timeZone`, COMMERCE_TIME_ZONES);
  const slots = commerceArray(row.slots, `${R}.slots`, 0, L.slotsMax).map((entry, index): CommerceServiceFreeSlot => {
    const path = `${R}.slots[${index}]`, slot = commerceRecord(entry, path, ["endAt", "resourceLabel", "resourceRef", "startAt"]);
    const startAt = commerceInstant(slot.startAt, `${path}.startAt`), endAt = commerceInstant(slot.endAt, `${path}.endAt`);
    // Durée exacte de la prestation, dans la fenêtre demandée.
    if (endAt - startAt !== durationMinutes * MINUTE_MS || startAt < request.fromAt || startAt >= request.toAt) commerceReject("invalid_time", path);
    const resourceRef = commerceRef(slot.resourceRef, `${path}.resourceRef`, ["agenda_resource"]);
    if (request.resourceRef !== undefined && resourceRef !== request.resourceRef) mismatch(`${path}.resourceRef`);
    return { endAt, resourceLabel: nullableText(slot.resourceLabel, `${path}.resourceLabel`, L.labelMax), resourceRef, startAt };
  });
  for (let index = 1; index < slots.length; index += 1) {
    const previous = slots[index - 1], current = slots[index];
    if (previous === undefined || current === undefined || previous.startAt > current.startAt) commerceReject("invalid_payload", `${R}.slots`);
  }
  commerceUnique(slots.map((slot) => `${slot.resourceRef}#${slot.startAt}`), `${R}.slots`);
  return { durationMinutes, fromAt: request.fromAt, serviceRef: request.serviceRef, slots, timeZone, toAt: request.toAt, truncated: commerceBoolean(row.truncated, `${R}.truncated`) };
}

function readBookingView(value: unknown, path: string): CommerceServiceBookingView {
  const row = commerceRecord(value, path, [
    "appointmentRef", "cancellation", "endAt", "holdExpiresAt", "policy", "replacementRef", "replacesRef", "resourceLabel",
    "revision", "serviceLabel", "serviceRef", "startAt", "state", "timeZone", "updatedAt",
  ]);
  const startAt = commerceInstant(row.startAt, `${path}.startAt`), endAt = commerceInstant(row.endAt, `${path}.endAt`);
  if (endAt <= startAt || endAt - startAt > L.bookingMaxMinutes * MINUTE_MS) commerceReject("invalid_time", `${path}.endAt`);
  const state = commerceLiteral(row.state, `${path}.state`, COMMERCE_BOOKING_STATES, "unknown_state");
  const holdExpiresAt = nullableInstant(row.holdExpiresAt, `${path}.holdExpiresAt`);
  // Seule une demande en attente retient son créneau pour un temps borné.
  if (holdExpiresAt !== null && state !== "requested") commerceReject("invalid_response", `${path}.holdExpiresAt`);
  const cancellation = row.cancellation === null ? null : commerceLiteral(row.cancellation, `${path}.cancellation`, COMMERCE_SERVICE_CANCELLATIONS);
  if ((cancellation !== null) !== (state === "cancelled_by_client" || state === "cancelled_by_pro")) commerceReject("invalid_response", `${path}.cancellation`);
  const policyRow = commerceRecord(row.policy, `${path}.policy`, ["cancelUntil", "changeRequiresConfirmation", "changeUntil", "deposit"]);
  const policy: CommerceServiceBookingPolicy = {
    cancelUntil: nullableInstant(policyRow.cancelUntil, `${path}.policy.cancelUntil`),
    changeRequiresConfirmation: commerceBoolean(policyRow.changeRequiresConfirmation, `${path}.policy.changeRequiresConfirmation`),
    changeUntil: nullableInstant(policyRow.changeUntil, `${path}.policy.changeUntil`),
    deposit: commerceLiteral(policyRow.deposit, `${path}.policy.deposit`, ["unavailable"] as const),
  };
  const open = state === "requested" || state === "confirmed";
  if (!open && (policy.cancelUntil !== null || policy.changeUntil !== null)) commerceReject("invalid_response", `${path}.policy`);
  const appointmentRef = commerceRef(row.appointmentRef, `${path}.appointmentRef`, ["appointment"]);
  const replacementRef = nullableRef(row.replacementRef, `${path}.replacementRef`, "appointment");
  const replacesRef = nullableRef(row.replacesRef, `${path}.replacesRef`, "appointment");
  if (replacementRef === appointmentRef || replacesRef === appointmentRef) commerceReject("invalid_response", `${path}.replacementRef`);
  return {
    appointmentRef, cancellation, endAt, holdExpiresAt, policy, replacementRef, replacesRef,
    resourceLabel: nullableText(row.resourceLabel, `${path}.resourceLabel`, L.labelMax),
    revision: readRevision(row.revision, `${path}.revision`),
    serviceLabel: commerceText(row.serviceLabel, `${path}.serviceLabel`, 1, L.labelMax),
    serviceRef: commerceRef(row.serviceRef, `${path}.serviceRef`, ["agenda_service"]),
    startAt, state, timeZone: commerceLiteral(row.timeZone, `${path}.timeZone`, COMMERCE_TIME_ZONES),
    updatedAt: commerceInstant(row.updatedAt, `${path}.updatedAt`),
  };
}

function readLines(value: unknown, path: string, min: number): readonly CommerceServiceQuoteLine[] {
  return commerceArray(value, path, min, L.quoteLinesMax).map((entry, index): CommerceServiceQuoteLine => {
    const at = `${path}[${index}]`, line = commerceRecord(entry, at, ["label", "lineAmount", "quantity", "unitAmount"]);
    const quantity = commerceInteger(line.quantity, `${at}.quantity`, 1, 1_000_000);
    const unitAmount = commerceMoney(line.unitAmount, `${at}.unitAmount`), lineAmount = commerceMoney(line.lineAmount, `${at}.lineAmount`);
    // Arithmétique entière en XAF : aucune ligne ne peut annoncer un montant qui ne correspond pas.
    if (!Number.isSafeInteger(quantity * unitAmount.amount) || quantity * unitAmount.amount !== lineAmount.amount) commerceReject("total_mismatch", `${at}.lineAmount`);
    return { label: commerceText(line.label, `${at}.label`, 1, 200), lineAmount, quantity, unitAmount };
  });
}

function readQuoteSummary(value: unknown, path: string, extra: readonly string[] = [], contract: CommerceServiceControlContract = COMMERCE_SERVICE_CONTROL_CONTRACT, respondedAt = Number.MAX_SAFE_INTEGER): { row: CommerceRecord; summary: CommerceServiceQuoteSummary } {
  const row = commerceRecord(value, path, [
    "acceptable", "clientAcceptance", "current", "inquiryRef", "quoteRef", "reference", "sentAt", "state", "title", "total", "validUntil", "version", ...extra,
    ...(contract === COMMERCE_SERVICE_CONTROL_CONTRACT_V2 ? ["rejectable", "clientRejection"] : []),
  ]);
  const state = commerceLiteral(row.state, `${path}.state`, COMMERCE_QUOTE_STATES, "unknown_state");
  // Un brouillon n'est jamais transmis au client.
  if (state === "draft") commerceReject("invalid_response", `${path}.state`);
  const version = readRevision(row.version, `${path}.version`);
  const total = commerceMoney(row.total, `${path}.total`);
  let clientAcceptance: CommerceServiceClientAcceptance | null = null;
  if (row.clientAcceptance !== null) {
    const at = `${path}.clientAcceptance`, item = commerceRecord(row.clientAcceptance, at, ["acceptedAt", "acceptedTotal", "orderRef", "quoteVersion"]);
    clientAcceptance = {
      acceptedAt: commerceInstant(item.acceptedAt, `${at}.acceptedAt`), acceptedTotal: commerceMoney(item.acceptedTotal, `${at}.acceptedTotal`, 1),
      orderRef: nullableRef(item.orderRef, `${at}.orderRef`, "order"), quoteVersion: readRevision(item.quoteVersion, `${at}.quoteVersion`),
    };
    // La preuve porte sur cette version et ce total exacts.
    if (clientAcceptance.quoteVersion !== version || clientAcceptance.acceptedTotal.amount !== total.amount) commerceReject("invalid_response", at);
  }
  const acceptable = commerceBoolean(row.acceptable, `${path}.acceptable`);
  const current = commerceBoolean(row.current, `${path}.current`);
  const validUntil = nullableInstant(row.validUntil, `${path}.validUntil`);
  if (acceptable && (!current || clientAcceptance !== null || !["sent", "viewed", "negotiating", "accepted"].includes(state))) commerceReject("invalid_response", `${path}.acceptable`);
  let rejection: { rejectable: boolean; clientRejection: CommerceServiceClientRejection | null } | undefined;
  if (contract === COMMERCE_SERVICE_CONTROL_CONTRACT_V2) {
    const rejectable = commerceBoolean(row.rejectable, `${path}.rejectable`);
    let clientRejection: CommerceServiceClientRejection | null = null;
    if (row.clientRejection !== null) {
      const at = `${path}.clientRejection`, item = commerceRecord(row.clientRejection, at, ["quoteVersion", "rejectedAt"]);
      clientRejection = { quoteVersion: readRevision(item.quoteVersion, `${at}.quoteVersion`), rejectedAt: commerceInstant(item.rejectedAt, `${at}.rejectedAt`) };
      if (clientRejection.quoteVersion !== version || clientRejection.rejectedAt > respondedAt || clientAcceptance !== null || acceptable) commerceReject("invalid_response", at);
    }
    if (rejectable && (!current || clientAcceptance !== null || clientRejection !== null || !["sent", "viewed", "negotiating"].includes(state) || (validUntil !== null && validUntil <= respondedAt))) commerceReject("invalid_response", `${path}.rejectable`);
    rejection = { rejectable, clientRejection };
  }
  return {
    row,
    summary: {
      acceptable, clientAcceptance, current, inquiryRef: nullableRef(row.inquiryRef, `${path}.inquiryRef`, "inquiry"),
      ...(rejection === undefined ? {} : rejection),
      quoteRef: commerceRef(row.quoteRef, `${path}.quoteRef`, ["quote"]), reference: commerceText(row.reference, `${path}.reference`, 1, 60),
      sentAt: nullableInstant(row.sentAt, `${path}.sentAt`), state, title: commerceText(row.title, `${path}.title`, 1, 200), total,
      validUntil, version,
    },
  };
}

function readQuoteDetail(value: unknown, request: CommerceServiceControlPayloads["quote.read"], contract: CommerceServiceControlContract, respondedAt: number): { readonly quote: CommerceServiceQuoteDetail } {
  const row = commerceRecord(value, R, ["quote"]);
  const { row: item, summary } = readQuoteSummary(row.quote, `${R}.quote`, ["lines", "notes", "sellerLabel"], contract, respondedAt);
  if (summary.quoteRef !== request.quoteRef) mismatch(`${R}.quote.quoteRef`);
  const lines = readLines(item.lines, `${R}.quote.lines`, 1);
  const sum = commerceSumAmounts(lines.map((line) => line.lineAmount.amount));
  if (sum === null || sum !== summary.total.amount) commerceReject("total_mismatch", `${R}.quote.total`);
  return {
    quote: {
      ...summary, lines, notes: nullableText(item.notes, `${R}.quote.notes`, L.notesMax, true),
      sellerLabel: nullableText(item.sellerLabel, `${R}.quote.sellerLabel`, L.labelMax),
    },
  };
}

function readQuoteList(value: unknown, request: CommerceServiceControlPayloads["quote.list"], contract: CommerceServiceControlContract, respondedAt: number): { readonly quotes: readonly CommerceServiceQuoteSummary[]; readonly truncated: boolean } {
  const row = commerceRecord(value, R, ["quotes", "truncated"]);
  const quotes = commerceArray(row.quotes, `${R}.quotes`, 0, L.quotesMax).map((entry, index) => readQuoteSummary(entry, `${R}.quotes[${index}]`, [], contract, respondedAt).summary);
  commerceUnique(quotes.map((quote) => quote.quoteRef), `${R}.quotes`);
  if (request.inquiryRef !== undefined && quotes.some((quote) => quote.inquiryRef !== request.inquiryRef)) mismatch(`${R}.quotes`);
  return { quotes, truncated: commerceBoolean(row.truncated, `${R}.truncated`) };
}

function readOrder(value: unknown, request: CommerceServiceControlPayloads["service.order.request"], outcome: CommerceServiceOutcome): CommerceServiceOrderResult | CommerceServiceOrderReconfirm {
  if (outcome === "reconfirm_required") {
    const row = commerceRecord(value, R, ["currentCatalogRevision", "currentUnitAmount", "state"]);
    const currentCatalogRevision = readRevision(row.currentCatalogRevision, `${R}.currentCatalogRevision`);
    const currentUnitAmount = commerceMoney(row.currentUnitAmount, `${R}.currentUnitAmount`, 1);
    // Reconfirmer n'a de sens que si le prix ou la révision a changé.
    if (currentCatalogRevision === request.expectedCatalogRevision && currentUnitAmount.amount === request.expectedUnitAmount.amount) mismatch(R);
    return { currentCatalogRevision, currentUnitAmount, state: commerceLiteral(row.state, `${R}.state`, ["reconfirm"] as const) };
  }
  const row = commerceRecord(value, R, ["catalogRevision", "createdAt", "lines", "orderRef", "state", "total"]);
  const catalogRevision = readRevision(row.catalogRevision, `${R}.catalogRevision`);
  if (catalogRevision !== request.expectedCatalogRevision) mismatch(`${R}.catalogRevision`);
  const lines = readLines(row.lines, `${R}.lines`, 1);
  const line = lines[0];
  if (lines.length !== 1 || line === undefined || line.quantity !== request.quantity || line.unitAmount.amount !== request.expectedUnitAmount.amount) mismatch(`${R}.lines`);
  const total = commerceMoney(row.total, `${R}.total`, 1);
  if (total.amount !== line.lineAmount.amount) commerceReject("total_mismatch", `${R}.total`);
  return {
    catalogRevision, createdAt: commerceInstant(row.createdAt, `${R}.createdAt`), lines,
    orderRef: commerceRef(row.orderRef, `${R}.orderRef`, ["order"]), state: commerceLiteral(row.state, `${R}.state`, ["pending"] as const), total,
  };
}

function readReschedule(value: unknown, request: CommerceServiceControlPayloads["booking.reschedule.request"]): CommerceServiceReschedule {
  const row = commerceRecord(value, R, ["current", "previous"]);
  const previous = readBookingView(row.previous, `${R}.previous`), current = readBookingView(row.current, `${R}.current`);
  if (previous.appointmentRef !== request.appointmentRef) mismatch(`${R}.previous.appointmentRef`);
  if (current.startAt !== request.slot.startAt || current.endAt !== request.slot.endAt || current.timeZone !== request.slot.timeZone) mismatch(`${R}.current.startAt`);
  if (current.replacesRef !== previous.appointmentRef || (current.state !== "requested" && current.state !== "confirmed")) commerceReject("invalid_response", `${R}.current`);
  // Échange immédiat (ancien annulé) OU remplacement en attente (ancien conservé, confirmé).
  const swapped = previous.state === "cancelled_by_client" && previous.cancellation === "rescheduled";
  const pending = previous.state === "confirmed" && previous.replacementRef === current.appointmentRef && current.state === "requested";
  if (!swapped && !pending) commerceReject("invalid_response", `${R}.previous.state`);
  return { current, previous };
}

const PRIVATE_STATES: Readonly<Record<CommerceServicePrivateState["objectKind"], readonly string[]>> = {
  appointment: COMMERCE_BOOKING_STATES, order: COMMERCE_ORDER_STATES, quote: COMMERCE_QUOTE_STATES,
};

function readActionStatus(value: unknown, request: CommerceServiceControlPayloads["action.status"]): CommerceServiceActionStatus {
  const row = commerceRecord(value, R, ["current", "state", "targetRequestId"], ["recordedResponse", "recordedResponseSha256"]);
  if (row.targetRequestId !== request.targetRequestId) mismatch(`${R}.targetRequestId`);
  const state = commerceLiteral(row.state, `${R}.state`, ["completed", "unknown"] as const);
  const current = commerceArray(row.current, `${R}.current`, 0, L.currentStatesMax).map((entry, index): CommerceServicePrivateState => {
    const path = `${R}.current[${index}]`, item = commerceRecord(entry, path, ["objectKind", "objectRef", "revision", "state", "updatedAt"]);
    const objectKind = commerceLiteral(item.objectKind, `${path}.objectKind`, COMMERCE_SERVICE_PRIVATE_KINDS);
    return {
      objectKind, objectRef: commerceRef(item.objectRef, `${path}.objectRef`, [objectKind]), revision: readRevision(item.revision, `${path}.revision`),
      state: commerceLiteral(item.state, `${path}.state`, PRIVATE_STATES[objectKind], "unknown_state"), updatedAt: commerceInstant(item.updatedAt, `${path}.updatedAt`),
    };
  });
  commerceUnique(current.map((item) => item.objectRef), `${R}.current`);
  const recordedResponse = row.recordedResponse, recordedResponseSha256 = row.recordedResponseSha256;
  if (recordedResponse !== undefined && (typeof recordedResponse !== "string" || recordedResponse.length === 0 || commerceUtf8ByteLength(recordedResponse) > COMMERCE_SERVICE_CONTROL_RESPONSE_MAX_BYTES)) commerceReject("invalid_payload", `${R}.recordedResponse`);
  if (recordedResponseSha256 !== undefined && !commerceIsSha256(recordedResponseSha256)) commerceReject("invalid_payload", `${R}.recordedResponseSha256`);
  // Réponse enregistrée ⟺ demande terminée ; une demande inconnue ne révèle aucun état.
  if ((recordedResponse === undefined) !== (recordedResponseSha256 === undefined) || (recordedResponse !== undefined) !== (state === "completed")) commerceReject("invalid_response", `${R}.state`);
  if (state === "unknown" && current.length > 0) commerceReject("invalid_response", `${R}.current`);
  return {
    current, ...(typeof recordedResponse === "string" ? { recordedResponse } : {}),
    ...(typeof recordedResponseSha256 === "string" ? { recordedResponseSha256 } : {}), state, targetRequestId: request.targetRequestId,
  };
}

function readResult(request: CommerceServiceControlRequest, value: unknown, outcome: CommerceServiceOutcome, respondedAt: number): CommerceServiceControlResult {
  if (outcome === "reconfirm_required" && request.operation !== "service.order.request") commerceReject("invalid_response", "$.outcome");
  switch (request.operation) {
    case "service.options": return readOptions(value, request.payload);
    case "booking.slots": return readSlots(value, request.payload);
    case "booking.read": {
      const row = commerceRecord(value, R, ["booking"]);
      const booking = readBookingView(row.booking, `${R}.booking`);
      if (booking.appointmentRef !== request.payload.appointmentRef) mismatch(`${R}.booking.appointmentRef`);
      return { booking };
    }
    case "booking.reschedule.request": return readReschedule(value, request.payload);
    case "booking.cancel.request": {
      const row = commerceRecord(value, R, ["booking"]);
      const booking = readBookingView(row.booking, `${R}.booking`);
      if (booking.appointmentRef !== request.payload.appointmentRef) mismatch(`${R}.booking.appointmentRef`);
      if (booking.state !== "cancelled_by_client" || booking.cancellation !== "client") commerceReject("invalid_response", `${R}.booking.state`);
      if (booking.revision <= request.payload.expectedRevision) mismatch(`${R}.booking.revision`);
      return { booking };
    }
    case "quote.list": return readQuoteList(value, request.payload, request.contract, respondedAt);
    case "quote.read": return readQuoteDetail(value, request.payload, request.contract, respondedAt);
    case "service.quote.reject": {
      const row = commerceRecord(value, R, ["quoteRef", "quoteVersion", "state", "rejectedAt"]);
      const quoteRef = commerceRef(row.quoteRef, `${R}.quoteRef`, ["quote"]), quoteVersion = readRevision(row.quoteVersion, `${R}.quoteVersion`);
      if (quoteRef !== request.payload.quoteRef || quoteVersion !== request.payload.quoteVersion) mismatch(R);
      const rejectedAt = commerceInstant(row.rejectedAt, `${R}.rejectedAt`);
      if (rejectedAt > respondedAt) commerceReject("invalid_time", `${R}.rejectedAt`);
      return { quoteRef, quoteVersion, state: commerceLiteral(row.state, `${R}.state`, ["rejected"]), rejectedAt };
    }
    case "service.order.request": return readOrder(value, request.payload, outcome);
    case "action.status": return readActionStatus(value, request.payload);
  }
}

/** Réponse reçue par ANTSIA, corrélée à SA demande : identifiant, empreinte, opération et résultat fermé. */
export function parseCommerceServiceControlResponse(
  rawBody: string,
  context: { readonly nowMs: number; readonly request: CommerceServiceControlRequest; readonly requestSha256: string },
): CommerceResult<CommerceServiceControlResponse, string> {
  return commerceCapture(() => {
    if (!commerceIsSha256(context.requestSha256)) commerceReject("invalid_request", "$");
    const row = commerceRecord(
      commerceParseCanonicalBody(rawBody, COMMERCE_SERVICE_CONTROL_RESPONSE_MAX_BYTES), "$",
      ["contract", "outcome", "requestId", "requestSha256", "respondedAt", "version"], ["reason", "result"], "invalid_response",
    );
    if (!isCommerceServiceControlContract(context.request.contract) || !commerceServiceControlOperationAllowed(context.request.operation, context.request.contract) || row.contract !== context.request.contract || row.version !== 1) commerceReject("invalid_response", "$.contract");
    if (row.requestId !== context.request.requestId) mismatch("$.requestId");
    if (row.requestSha256 !== context.requestSha256) mismatch("$.requestSha256");
    const respondedAt = commerceInstant(row.respondedAt, "$.respondedAt");
    if (!Number.isSafeInteger(context.nowMs) || respondedAt > context.nowMs + COMMERCE_MAX_SKEW_MS || respondedAt < context.request.issuedAt - COMMERCE_MAX_SKEW_MS) {
      commerceReject("invalid_time", "$.respondedAt");
    }
    const outcome = commerceLiteral(row.outcome, "$.outcome", COMMERCE_SERVICE_OUTCOMES, "invalid_response");
    const base: ReplyBase = { contract: context.request.contract, requestId: context.request.requestId, requestSha256: context.requestSha256, respondedAt, version: 1 };
    if (outcome === "accepted" || outcome === "reconfirm_required") {
      if (!commerceHas(row, "result") || commerceHas(row, "reason")) commerceReject("invalid_response", "$.result");
      commerceScanJson(row.result, FORBIDDEN, R);
      return { ...base, outcome, result: readResult(context.request, row.result, outcome, respondedAt) };
    }
    if (commerceHas(row, "result") || !commerceHas(row, "reason")) commerceReject("invalid_response", "$.reason");
    const allowed = outcome === "refused" ? COMMERCE_SERVICE_REFUSALS[context.request.operation] : outcome === "conflict" ? ["idempotency_conflict"] : COMMERCE_SERVICE_UNAVAILABLE_REASONS;
    return { ...base, outcome, reason: commerceLiteral(row.reason, "$.reason", allowed, "invalid_response") };
  });
}

// ─── Règles partagées ────────────────────────────────────────────────────────

/**
 * Conséquences d'un rendez-vous, calculées par PRO.GA et affichées par ANTSIA AVANT tout
 * geste : changement possible jusqu'au préavis de la prestation, annulation jusqu'au début,
 * jamais d'acompte en V1. Un remplacement en attente ferme un second changement.
 */
export function commerceServiceBookingPolicy(input: {
  readonly autoConfirm: boolean; readonly minNoticeMinutes: number; readonly pendingReplacement: boolean;
  readonly startAt: number; readonly state: CommerceBookingState;
}): CommerceServiceBookingPolicy {
  const open = input.state === "requested" || input.state === "confirmed";
  const notice = Number.isSafeInteger(input.minNoticeMinutes) && input.minNoticeMinutes > 0 ? input.minNoticeMinutes : 0;
  return {
    cancelUntil: open ? input.startAt : null,
    changeRequiresConfirmation: !input.autoConfirm,
    changeUntil: open && !input.pendingReplacement ? input.startAt - notice * MINUTE_MS : null,
    deposit: "unavailable",
  };
}

export type CommerceServiceChangeDecision = "allowed" | "change_pending" | "not_changeable" | "too_late";
export function commerceServiceChangeDecision(
  view: Pick<CommerceServiceBookingView, "policy" | "replacementRef" | "replacesRef" | "state">, nowMs: number,
): CommerceServiceChangeDecision {
  if (view.state !== "requested" && view.state !== "confirmed") return "not_changeable";
  // Une demande de remplacement en attente ne se remplace pas à son tour.
  if (view.replacementRef !== null || (view.replacesRef !== null && view.state === "requested")) return "change_pending";
  if (view.policy.changeUntil === null || !Number.isSafeInteger(nowMs) || nowMs >= view.policy.changeUntil) return "too_late";
  return "allowed";
}

export function commerceServiceCancelDecision(view: Pick<CommerceServiceBookingView, "policy" | "state">, nowMs: number): "allowed" | "not_cancellable" {
  if (view.state !== "requested" && view.state !== "confirmed") return "not_cancellable";
  return view.policy.cancelUntil !== null && Number.isSafeInteger(nowMs) && nowMs < view.policy.cancelUntil ? "allowed" : "not_cancellable";
}

/** Libellés du message de demande de devis transmis par `inquiry.submit` (P06 inchangé). */
export const COMMERCE_SERVICE_QUOTE_MESSAGE_LABELS = {
  need: "Besoin",
  constraints: "Contraintes",
  attachments: "Pièces choisies dans la conversation ANTSIA",
} as const;

function cleanText(value: string): string {
  return value.normalize("NFC").replace(/\r\n?/gu, "\n").trim();
}
function hasControl(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if ((code < 32 && code !== 10) || code === 127) return true;
  }
  return false;
}

/**
 * Message d'une demande de devis : besoin, contraintes et NOMBRE de pièces choisies, jamais
 * leurs octets ni leurs adresses (elles restent dans la conversation ANTSIA, sous la garde
 * des fichiers). `null` si un champ sort de ses bornes ; aucune troncature.
 */
export function commerceServiceQuoteRequestMessage(input: { readonly attachmentCount: number; readonly constraints?: string; readonly need: string }): string | null {
  const need = cleanText(input.need), constraints = input.constraints === undefined ? "" : cleanText(input.constraints);
  if (need.length < 1 || need.length > L.quoteNeedMax || constraints.length > L.quoteConstraintsMax || hasControl(need) || hasControl(constraints)) return null;
  if (!Number.isSafeInteger(input.attachmentCount) || input.attachmentCount < 0 || input.attachmentCount > L.quoteAttachmentsMax) return null;
  const parts = [`${COMMERCE_SERVICE_QUOTE_MESSAGE_LABELS.need} : ${need}`];
  if (constraints.length > 0) parts.push(`${COMMERCE_SERVICE_QUOTE_MESSAGE_LABELS.constraints} : ${constraints}`);
  if (input.attachmentCount > 0) parts.push(`${COMMERCE_SERVICE_QUOTE_MESSAGE_LABELS.attachments} : ${input.attachmentCount}`);
  return parts.join("\n\n");
}

/** Chaîne à signer, ou `null` si un composant est hors grammaire (refus fail-closed). */
export function commerceServiceControlSigningInput(input: {
  readonly bodySha256: string; readonly environment: CommerceEnvironment; readonly issuedAtMs: number; readonly keyId: string;
  readonly nonce: string; readonly operation: CommerceServiceControlOperation; readonly source: string;
  readonly contract?: CommerceServiceControlContract;
}): string | null {
  const contract = input.contract ?? COMMERCE_SERVICE_CONTROL_CONTRACT;
  const scope = commerceServiceControlScope(input.operation, contract);
  if (
    !commerceIsSha256(input.bodySha256) || !commerceIsMachineIdentity(input.source) ||
    !(COMMERCE_ENVIRONMENTS as readonly string[]).includes(input.environment) ||
    scope === null ||
    !Number.isSafeInteger(input.issuedAtMs) || input.issuedAtMs < 0 ||
    !/^[A-Za-z0-9._:-]{8,128}$/u.test(input.keyId) || !/^[A-Za-z0-9_-]{24,128}$/u.test(input.nonce)
  ) {
    return null;
  }
  return [
    contract === COMMERCE_SERVICE_CONTROL_CONTRACT_V2 ? COMMERCE_SERVICE_CONTROL_PROFILE_V2 : COMMERCE_SERVICE_CONTROL_PROFILE, input.keyId, String(input.issuedAtMs), input.nonce, input.source, input.environment,
    COMMERCE_SERVICE_CONTROL_AUDIENCE, scope, input.operation, input.bodySha256,
  ].map((part) => `${part.length}:${part}`).join("|");
}
