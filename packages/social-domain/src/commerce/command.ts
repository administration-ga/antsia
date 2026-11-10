/**
 * PRO-COMMERCE-COMMAND-V1 — actions privées ANTSIA → PRO.GA.
 *
 * FICHIER JUMEAU (voir `primitives.ts`). Le serveur ANTSIA (jamais le
 * navigateur) envoie une demande signée et bornée ; PRO.GA, autorité,
 * rejuge à destination identité déléguée, liaison, mandat, capacité, révision
 * attendue, limites et état, puis rend une réponse DÉTERMINISTE : même clé et
 * mêmes octets, mêmes octets de réponse ; même clé et autres octets, conflit.
 * Ce n'est pas l'inbox de reflets publics.
 *
 * Ordre d'évaluation d'une demande : octets → enveloppe → commande → identifiant
 * → source → environnement → scope → fenêtre temporelle → sujet → parcours
 * borné de la charge → champs de la charge par ordre alphabétique de clé.
 */
import {
  COMMERCE_COMMAND_CONTRACT,
  COMMERCE_ENVIRONMENTS,
  COMMERCE_MAX_SKEW_MS,
  COMMERCE_TRANSPORT_FORBIDDEN_FIELDS,
  commerceAntsiaRef,
  commerceArray,
  commerceCapture,
  commerceCivilName,
  commerceConsent,
  commerceHas,
  commerceInstant,
  commerceInteger,
  commerceIsMachineIdentity,
  commerceIsOpaqueId,
  commerceIsoDate,
  commerceIsSha256,
  commerceLiteral,
  commerceMoney,
  commerceOptionalRef,
  commerceParseCanonicalBody,
  commerceRecord,
  commerceRef,
  commerceRefList,
  commerceReject,
  commerceScanJson,
  commerceSha256,
  commerceSortedSet,
  commerceSumAmounts,
  commerceText,
  commerceTextList,
  commerceUnique,
  commerceUtf8ByteLength,
  type CommerceCivilName,
  type CommerceConsent,
  type CommerceEnvironment,
  type CommerceMoney,
  type CommerceRecord,
  type CommerceResult,
} from "./primitives";
import {
  COMMERCE_OFFER_KINDS,
  COMMERCE_PUBLIC_LIMITS,
  readCommercePrice,
  type CommercePrice,
} from "./projection";
import {
  COMMERCE_ORDER_STATES,
  COMMERCE_PRIVATE_OBJECT_KINDS,
  COMMERCE_PRIVATE_OBJECT_MACHINES,
  commerceMachineStates,
  type CommerceOrderState,
  type CommercePaymentState,
  type CommercePrivateObjectKind,
} from "./lifecycle";

export const COMMERCE_COMMANDS = [
  "link.confirm",
  "catalog.draft.save",
  "inquiry.submit",
  "quote.accept",
  "checkout.prepare",
  "payment.start",
  "order.cancel.request",
  "booking.request",
  "application.submit",
] as const;
export type CommerceCommandName = (typeof COMMERCE_COMMANDS)[number];
/** Consultation sans effet, réponse de statut après délai réseau. */
export const COMMERCE_STATUS_LOOKUP = "request.status";
export type CommerceOperation = CommerceCommandName | typeof COMMERCE_STATUS_LOOKUP;
export const COMMERCE_OPERATIONS: readonly CommerceOperation[] = [...COMMERCE_COMMANDS, COMMERCE_STATUS_LOOKUP];
/** Noms réservés pour V1.x : refusés `unsupported_command`, jamais exécutés. */
export const COMMERCE_RESERVED_COMMANDS = [
  "application.withdraw",
  "booking.cancel",
  "catalog.publish.request",
  "inquiry.withdraw",
  "link.revoke",
  "subject.erasure.request",
] as const;

/** Un scope machine par opération, exactement : le minimum, jamais un cumul. */
export const COMMERCE_COMMAND_SCOPES = {
  "application.submit": "commerce.application.submit",
  "booking.request": "commerce.booking.request",
  "catalog.draft.save": "commerce.catalog.draft.save",
  "checkout.prepare": "commerce.checkout.prepare",
  "inquiry.submit": "commerce.inquiry.submit",
  "link.confirm": "commerce.link.confirm",
  "order.cancel.request": "commerce.order.cancel.request",
  "payment.start": "commerce.payment.start",
  "quote.accept": "commerce.quote.accept",
  "request.status": "commerce.request.status",
} as const satisfies Readonly<Record<CommerceOperation, string>>;
export type CommerceCommandScope = (typeof COMMERCE_COMMAND_SCOPES)[CommerceOperation];

export const COMMERCE_SUBJECT_KINDS = ["buyer", "candidate", "seller_operator"] as const;
export type CommerceSubjectKind = (typeof COMMERCE_SUBJECT_KINDS)[number];
export const COMMERCE_COMMAND_SUBJECTS: Readonly<Record<CommerceOperation, readonly CommerceSubjectKind[]>> = {
  "application.submit": ["candidate"],
  "booking.request": ["buyer"],
  "catalog.draft.save": ["seller_operator"],
  "checkout.prepare": ["buyer"],
  "inquiry.submit": ["buyer"],
  "link.confirm": ["seller_operator"],
  "order.cancel.request": ["buyer"],
  "payment.start": ["buyer"],
  "quote.accept": ["buyer"],
  "request.status": ["buyer", "candidate", "seller_operator"],
};

/** Permissions consenties par le vendeur à la liaison (distinctes des scopes machine). */
export const COMMERCE_LINK_PERMISSIONS = [
  "catalog_drafts",
  "publish_catalog",
  "publish_jobs",
  "receive_applications",
  "receive_bookings",
  "receive_inquiries",
  "receive_orders",
] as const;
export type CommerceLinkPermission = (typeof COMMERCE_LINK_PERMISSIONS)[number];

export const COMMERCE_CONSENT_PURPOSES = {
  "application.submit": "commerce_application",
  "booking.request": "commerce_booking",
  "checkout.prepare": "commerce_checkout",
  "inquiry.submit": "commerce_inquiry",
  "link.confirm": "commerce_link",
  "payment.start": "commerce_payment",
  "quote.accept": "commerce_quote_acceptance",
} as const;

/** V1 : un seul fuseau, celui de l'agenda PRO.GA (`AGENDA_TIMEZONE`). */
export const COMMERCE_TIME_ZONES = ["Africa/Libreville"] as const;

export const COMMERCE_COMMAND_LIMITS = {
  requestMaxBytes: 64 * 1024,
  responseMaxBytes: 128 * 1024,
  requestTtlMaxMs: 10 * 60 * 1000,
  authMaxAgeMs: 5 * 60 * 1000,
  linesMax: 50,
  quantityMax: 999,
  feesMax: 5,
  feeLabelMax: 80,
  lineLabelMax: 200,
  messageMax: 2000,
  noteMax: 500,
  motivationMax: 4000,
  displayNameMax: 80,
  addressLineMax: 200,
  localityMax: 100,
  instructionsMax: 500,
  attachmentsMax: 3,
  attachmentBytesMax: 5 * 1024 * 1024,
  bookingMaxMinutes: 480,
  currentStatesMax: 4,
  retryAfterMinMs: 1000,
  retryAfterMaxMs: 3_600_000,
  redirectUrlMax: 2048,
} as const;
const C = COMMERCE_COMMAND_LIMITS;

export const COMMERCE_COMMAND_REASONS = [
  "amount_incoherent",
  "body_too_large",
  "currency_mismatch",
  "duplicate_entry",
  "environment_mismatch",
  "forbidden_field",
  "invalid_amount",
  "invalid_body",
  "invalid_name",
  "invalid_payload",
  "invalid_reference",
  "invalid_request",
  "invalid_revision",
  "invalid_text",
  "invalid_time",
  "not_canonical",
  "scope_mismatch",
  "source_mismatch",
  "subject_not_allowed",
  "too_complex",
  "unknown_command",
  "unsupported_command",
] as const;
export type CommerceCommandReason = (typeof COMMERCE_COMMAND_REASONS)[number];

/** Une demande privée ne porte ni coordonnée directe ni identifiant de l'autre produit. */
export const COMMERCE_COMMAND_FORBIDDEN_FIELDS = [
  ...COMMERCE_TRANSPORT_FORBIDDEN_FIELDS,
  "cardNumber",
  "contactEmail",
  "contactPhone",
  "cookie",
  "cvv",
  "fullName",
  "iban",
  "idToken",
  "msisdn",
  "nationalId",
  "pan",
  "sku",
  "structureBusinessRef",
  "structureId",
  "tenantBusinessRef",
  "tenantId",
  "token",
  "url",
  "userId",
] as const;
const COMMAND_FORBIDDEN: ReadonlySet<string> = new Set(COMMERCE_COMMAND_FORBIDDEN_FIELDS);
const RESPONSE_FORBIDDEN: ReadonlySet<string> = new Set(COMMERCE_TRANSPORT_FORBIDDEN_FIELDS);

// ─── Charges ─────────────────────────────────────────────────────────────────

export type CommerceLinkConfirmPayload = {
  readonly antsiaShopRef: string;
  readonly codeVerifier: string;
  readonly consent: CommerceConsent;
  readonly linkCode: string;
  readonly requestedPermissions: readonly CommerceLinkPermission[];
};

export type CommerceDraftInput = {
  readonly collectionRefs: readonly string[];
  readonly description: string;
  readonly kind: (typeof COMMERCE_OFFER_KINDS)[number];
  readonly leadTimeDays?: number;
  readonly price: CommercePrice;
  readonly tags: readonly string[];
  readonly title: string;
  readonly zone?: string;
};

export type CommerceDraftSavePayload = {
  readonly draft: CommerceDraftInput;
  readonly expectedDraftRevision?: number;
  readonly linkRef: string;
  readonly offerRef?: string;
};

export type CommerceInquiryPayload = {
  readonly consent: CommerceConsent;
  readonly conversationRef?: string;
  readonly desiredDate?: string;
  readonly displayName?: string;
  readonly kind: "availability" | "question" | "quote_request";
  readonly message: string;
  readonly offerRef?: string;
  readonly quantity?: number;
  readonly shopRef: string;
  readonly variantRef?: string;
};

export type CommerceQuoteAcceptPayload = {
  readonly acceptedTotal: CommerceMoney;
  readonly consent: CommerceConsent;
  readonly quoteRef: string;
  readonly quoteVersion: number;
  readonly shopRef: string;
};

export type CommerceCheckoutLineInput = {
  readonly expectedCatalogRevision: number;
  readonly expectedUnitAmount: CommerceMoney;
  readonly offerRef: string;
  readonly quantity: number;
  readonly variantRef?: string;
};

export type CommerceDeliveryAddress = {
  readonly country: string;
  readonly line1: string;
  readonly line2?: string;
  readonly locality: string;
};

export type CommerceFulfillment =
  | { readonly establishmentRef: string; readonly mode: "pickup" }
  | { readonly address: CommerceDeliveryAddress; readonly instructions?: string; readonly mode: "seller_delivery" };

export type CommerceCheckoutPayload = {
  readonly consent: CommerceConsent;
  readonly fulfillment: CommerceFulfillment;
  readonly lines: readonly CommerceCheckoutLineInput[];
  readonly note?: string;
  readonly shopRef: string;
};

export type CommercePaymentStartPayload = {
  readonly checkoutRef: string;
  readonly consent: CommerceConsent;
  readonly expectedTotal: CommerceMoney;
  readonly shopRef: string;
};

export type CommerceCancelPayload = {
  readonly expectedOrderRevision: number;
  readonly note?: string;
  readonly orderRef: string;
  readonly reason: "changed_mind" | "delay" | "other" | "wrong_item";
  readonly shopRef: string;
};

export type CommerceBookingSlot = {
  readonly endAt: number;
  readonly startAt: number;
  readonly timeZone: (typeof COMMERCE_TIME_ZONES)[number];
};

export type CommerceBookingPayload = {
  readonly consent: CommerceConsent;
  readonly displayName?: string;
  readonly note?: string;
  readonly offerRef?: string;
  readonly resourceRef?: string;
  readonly serviceRef: string;
  readonly shopRef: string;
  readonly slot: CommerceBookingSlot;
};

/** Pièce par empreinte : les octets passent par la garde des fichiers, jamais dans le corps. */
export type CommerceAttachment = {
  readonly attachmentRef: string;
  readonly byteSize: number;
  readonly kind: "certificate" | "cover_letter" | "cv";
  readonly mimeType: "application/pdf";
  readonly sha256: string;
};

export type CommerceApplicationPayload = {
  readonly attachments: readonly CommerceAttachment[];
  readonly civilName: CommerceCivilName;
  readonly consent: CommerceConsent;
  readonly jobRef: string;
  readonly motivation?: string;
  readonly shopRef: string;
};

export type CommerceStatusPayload = {
  readonly targetCommand: CommerceCommandName;
  readonly targetRequestId: string;
  readonly targetRequestSha256: string;
};

export type CommerceCommandPayloads = {
  readonly "application.submit": CommerceApplicationPayload;
  readonly "booking.request": CommerceBookingPayload;
  readonly "catalog.draft.save": CommerceDraftSavePayload;
  readonly "checkout.prepare": CommerceCheckoutPayload;
  readonly "inquiry.submit": CommerceInquiryPayload;
  readonly "link.confirm": CommerceLinkConfirmPayload;
  readonly "order.cancel.request": CommerceCancelPayload;
  readonly "payment.start": CommercePaymentStartPayload;
  readonly "quote.accept": CommerceQuoteAcceptPayload;
  readonly "request.status": CommerceStatusPayload;
};

export type CommerceSubject = {
  readonly authVerifiedAt: number;
  readonly kind: CommerceSubjectKind;
  readonly ref: string;
};

export type CommerceCommandRequest = {
  readonly [Operation in CommerceOperation]: {
    readonly command: Operation;
    readonly contract: typeof COMMERCE_COMMAND_CONTRACT;
    readonly environment: CommerceEnvironment;
    readonly expiresAt: number;
    readonly issuedAt: number;
    readonly payload: CommerceCommandPayloads[Operation];
    readonly requestId: string;
    readonly scope: (typeof COMMERCE_COMMAND_SCOPES)[Operation];
    readonly source: string;
    readonly subject: CommerceSubject;
    readonly version: 1;
  };
}[CommerceOperation];

/** Contexte du RÉCEPTEUR, résolu depuis sa configuration et la clé, jamais depuis le corps. */
export type CommerceReceiverContext = {
  readonly environment: CommerceEnvironment;
  readonly nowMs: number;
  readonly source: string;
};

const P = "$.payload";
const LIMITS = COMMERCE_PUBLIC_LIMITS;

function optionalText(row: CommerceRecord, key: string, min: number, max: number, multiline = false): string | undefined {
  return commerceHas(row, key) ? commerceText(row[key], `${P}.${key}`, min, max, multiline) : undefined;
}

function readRevision(value: unknown, path: string): number {
  return commerceInteger(value, path, 1, Number.MAX_SAFE_INTEGER, "invalid_revision");
}

function readPattern(value: unknown, path: string, pattern: RegExp): string {
  if (typeof value !== "string" || !pattern.test(value)) commerceReject("invalid_payload", path);
  return value;
}

function readLinkConfirm(value: unknown, issuedAt: number): CommerceLinkConfirmPayload {
  const row = commerceRecord(value, P, ["antsiaShopRef", "codeVerifier", "consent", "linkCode", "requestedPermissions"]);
  return {
    antsiaShopRef: commerceAntsiaRef(row.antsiaShopRef, `${P}.antsiaShopRef`, "shop"),
    // PKCE (RFC 7636) : vérificateur de 43 à 128 caractères non réservés.
    codeVerifier: readPattern(row.codeVerifier, `${P}.codeVerifier`, /^[A-Za-z0-9._~-]{43,128}$/),
    consent: commerceConsent(row.consent, `${P}.consent`, COMMERCE_CONSENT_PURPOSES["link.confirm"], issuedAt),
    linkCode: readPattern(row.linkCode, `${P}.linkCode`, /^[A-Za-z0-9_-]{32,128}$/),
    requestedPermissions: commerceSortedSet(row.requestedPermissions, `${P}.requestedPermissions`, COMMERCE_LINK_PERMISSIONS, 1),
  };
}

function readDraft(value: unknown, path: string): CommerceDraftInput {
  const row = commerceRecord(value, path, ["collectionRefs", "description", "kind", "price", "tags", "title"], ["leadTimeDays", "zone"]);
  const collectionRefs = commerceRefList(row.collectionRefs, `${path}.collectionRefs`, LIMITS.offerCollectionsMax, "offer_collection");
  const description = commerceText(row.description, `${path}.description`, 0, LIMITS.offerDescriptionMax, true);
  const kind = commerceLiteral(row.kind, `${path}.kind`, COMMERCE_OFFER_KINDS);
  const leadTimeDays = commerceHas(row, "leadTimeDays")
    ? commerceInteger(row.leadTimeDays, `${path}.leadTimeDays`, 0, LIMITS.leadTimeDaysMax)
    : undefined;
  const price = readCommercePrice(row.price, `${path}.price`);
  const tags = commerceTextList(row.tags, `${path}.tags`, LIMITS.tagsMax, LIMITS.tagMax);
  const title = commerceText(row.title, `${path}.title`, LIMITS.offerTitleMin, LIMITS.offerTitleMax);
  const zone = commerceHas(row, "zone") ? commerceText(row.zone, `${path}.zone`, 1, LIMITS.zoneMax) : undefined;
  return {
    collectionRefs,
    description,
    kind,
    ...(leadTimeDays === undefined ? {} : { leadTimeDays }),
    price,
    tags,
    title,
    ...(zone === undefined ? {} : { zone }),
  };
}

function readDraftSave(value: unknown): CommerceDraftSavePayload {
  const row = commerceRecord(value, P, ["draft", "linkRef"], ["expectedDraftRevision", "offerRef"]);
  const draft = readDraft(row.draft, `${P}.draft`);
  const expectedDraftRevision = commerceHas(row, "expectedDraftRevision")
    ? readRevision(row.expectedDraftRevision, `${P}.expectedDraftRevision`)
    : undefined;
  const linkRef = commerceRef(row.linkRef, `${P}.linkRef`, ["commerce_link"]);
  const offerRef = commerceOptionalRef(row, "offerRef", P, ["offer"]);
  // Création : ni référence ni révision ; mise à jour : les deux (concurrence optimiste).
  if ((offerRef === undefined) !== (expectedDraftRevision === undefined)) {
    commerceReject("invalid_payload", `${P}.expectedDraftRevision`);
  }
  return {
    draft,
    ...(expectedDraftRevision === undefined ? {} : { expectedDraftRevision }),
    linkRef,
    ...(offerRef === undefined ? {} : { offerRef }),
  };
}

function readInquiry(value: unknown, issuedAt: number): CommerceInquiryPayload {
  const row = commerceRecord(
    value,
    P,
    ["consent", "kind", "message", "shopRef"],
    ["conversationRef", "desiredDate", "displayName", "offerRef", "quantity", "variantRef"],
  );
  const consent = commerceConsent(row.consent, `${P}.consent`, COMMERCE_CONSENT_PURPOSES["inquiry.submit"], issuedAt);
  const conversationRef = commerceHas(row, "conversationRef")
    ? commerceAntsiaRef(row.conversationRef, `${P}.conversationRef`, "conv")
    : undefined;
  const desiredDate = commerceHas(row, "desiredDate") ? commerceIsoDate(row.desiredDate, `${P}.desiredDate`) : undefined;
  const displayName = optionalText(row, "displayName", 1, C.displayNameMax);
  const kind = commerceLiteral(row.kind, `${P}.kind`, ["availability", "question", "quote_request"] as const);
  const message = commerceText(row.message, `${P}.message`, 1, C.messageMax, true);
  const offerRef = commerceOptionalRef(row, "offerRef", P, ["offer"]);
  const quantity = commerceHas(row, "quantity") ? commerceInteger(row.quantity, `${P}.quantity`, 1, C.quantityMax) : undefined;
  const shopRef = commerceRef(row.shopRef, `${P}.shopRef`, ["structure"]);
  const variantRef = commerceOptionalRef(row, "variantRef", P, ["offer_variant"]);
  if (variantRef !== undefined && offerRef === undefined) commerceReject("invalid_payload", `${P}.variantRef`);
  return {
    consent,
    ...(conversationRef === undefined ? {} : { conversationRef }),
    ...(desiredDate === undefined ? {} : { desiredDate }),
    ...(displayName === undefined ? {} : { displayName }),
    kind,
    message,
    ...(offerRef === undefined ? {} : { offerRef }),
    ...(quantity === undefined ? {} : { quantity }),
    shopRef,
    ...(variantRef === undefined ? {} : { variantRef }),
  };
}

function readQuoteAccept(value: unknown, issuedAt: number): CommerceQuoteAcceptPayload {
  const row = commerceRecord(value, P, ["acceptedTotal", "consent", "quoteRef", "quoteVersion", "shopRef"]);
  return {
    acceptedTotal: commerceMoney(row.acceptedTotal, `${P}.acceptedTotal`, 1),
    consent: commerceConsent(row.consent, `${P}.consent`, COMMERCE_CONSENT_PURPOSES["quote.accept"], issuedAt),
    quoteRef: commerceRef(row.quoteRef, `${P}.quoteRef`, ["quote"]),
    quoteVersion: readRevision(row.quoteVersion, `${P}.quoteVersion`),
    shopRef: commerceRef(row.shopRef, `${P}.shopRef`, ["structure"]),
  };
}

function lineKey(line: { readonly offerRef: string; readonly variantRef?: string }): string {
  return `${line.offerRef}#${line.variantRef ?? ""}`;
}

function readFulfillment(value: unknown, path: string): CommerceFulfillment {
  if (value === null || typeof value !== "object" || Array.isArray(value)) commerceReject("invalid_payload", path);
  const mode = commerceLiteral((value as CommerceRecord).mode, `${path}.mode`, ["pickup", "seller_delivery"] as const);
  if (mode === "pickup") {
    const row = commerceRecord(value, path, ["establishmentRef", "mode"]);
    return { establishmentRef: commerceRef(row.establishmentRef, `${path}.establishmentRef`, ["establishment"]), mode };
  }
  const row = commerceRecord(value, path, ["address", "mode"], ["instructions"]);
  const at = `${path}.address`;
  const address = commerceRecord(row.address, at, ["country", "line1", "locality"], ["line2"]);
  const country = commerceLiteral(address.country, `${at}.country`, ["GA"] as const);
  const line1 = commerceText(address.line1, `${at}.line1`, 1, C.addressLineMax);
  const line2 = commerceHas(address, "line2") ? commerceText(address.line2, `${at}.line2`, 1, C.addressLineMax) : undefined;
  const locality = commerceText(address.locality, `${at}.locality`, 1, C.localityMax);
  const instructions = commerceHas(row, "instructions")
    ? commerceText(row.instructions, `${path}.instructions`, 1, C.instructionsMax, true)
    : undefined;
  return {
    address: { country, line1, ...(line2 === undefined ? {} : { line2 }), locality },
    ...(instructions === undefined ? {} : { instructions }),
    mode,
  };
}

function readCheckout(value: unknown, issuedAt: number): CommerceCheckoutPayload {
  const row = commerceRecord(value, P, ["consent", "fulfillment", "lines", "shopRef"], ["note"]);
  const consent = commerceConsent(row.consent, `${P}.consent`, COMMERCE_CONSENT_PURPOSES["checkout.prepare"], issuedAt);
  const fulfillment = readFulfillment(row.fulfillment, `${P}.fulfillment`);
  const lines = commerceArray(row.lines, `${P}.lines`, 1, C.linesMax).map((item, index): CommerceCheckoutLineInput => {
    const at = `${P}.lines[${index}]`;
    const line = commerceRecord(item, at, ["expectedCatalogRevision", "expectedUnitAmount", "offerRef", "quantity"], ["variantRef"]);
    const expectedCatalogRevision = readRevision(line.expectedCatalogRevision, `${at}.expectedCatalogRevision`);
    const expectedUnitAmount = commerceMoney(line.expectedUnitAmount, `${at}.expectedUnitAmount`);
    const offerRef = commerceRef(line.offerRef, `${at}.offerRef`, ["offer"]);
    const quantity = commerceInteger(line.quantity, `${at}.quantity`, 1, C.quantityMax);
    const variantRef = commerceOptionalRef(line, "variantRef", at, ["offer_variant"]);
    return { expectedCatalogRevision, expectedUnitAmount, offerRef, quantity, ...(variantRef === undefined ? {} : { variantRef }) };
  });
  commerceUnique(lines.map(lineKey), `${P}.lines`);
  const note = optionalText(row, "note", 1, C.noteMax, true);
  const shopRef = commerceRef(row.shopRef, `${P}.shopRef`, ["structure"]);
  return { consent, fulfillment, lines, ...(note === undefined ? {} : { note }), shopRef };
}

function readPaymentStart(value: unknown, issuedAt: number): CommercePaymentStartPayload {
  const row = commerceRecord(value, P, ["checkoutRef", "consent", "expectedTotal", "shopRef"]);
  return {
    checkoutRef: commerceRef(row.checkoutRef, `${P}.checkoutRef`, ["checkout"]),
    consent: commerceConsent(row.consent, `${P}.consent`, COMMERCE_CONSENT_PURPOSES["payment.start"], issuedAt),
    expectedTotal: commerceMoney(row.expectedTotal, `${P}.expectedTotal`, 1),
    shopRef: commerceRef(row.shopRef, `${P}.shopRef`, ["structure"]),
  };
}

function readCancel(value: unknown): CommerceCancelPayload {
  const row = commerceRecord(value, P, ["expectedOrderRevision", "orderRef", "reason", "shopRef"], ["note"]);
  const expectedOrderRevision = readRevision(row.expectedOrderRevision, `${P}.expectedOrderRevision`);
  const note = optionalText(row, "note", 1, C.noteMax, true);
  return {
    expectedOrderRevision,
    ...(note === undefined ? {} : { note }),
    orderRef: commerceRef(row.orderRef, `${P}.orderRef`, ["order"]),
    reason: commerceLiteral(row.reason, `${P}.reason`, ["changed_mind", "delay", "other", "wrong_item"] as const),
    shopRef: commerceRef(row.shopRef, `${P}.shopRef`, ["structure"]),
  };
}

function readBooking(value: unknown, issuedAt: number): CommerceBookingPayload {
  const row = commerceRecord(
    value,
    P,
    ["consent", "serviceRef", "shopRef", "slot"],
    ["displayName", "note", "offerRef", "resourceRef"],
  );
  const consent = commerceConsent(row.consent, `${P}.consent`, COMMERCE_CONSENT_PURPOSES["booking.request"], issuedAt);
  const displayName = optionalText(row, "displayName", 1, C.displayNameMax);
  const note = optionalText(row, "note", 1, C.noteMax, true);
  const offerRef = commerceOptionalRef(row, "offerRef", P, ["offer"]);
  const resourceRef = commerceOptionalRef(row, "resourceRef", P, ["agenda_resource"]);
  const serviceRef = commerceRef(row.serviceRef, `${P}.serviceRef`, ["agenda_service"]);
  const shopRef = commerceRef(row.shopRef, `${P}.shopRef`, ["structure"]);
  const at = `${P}.slot`;
  const slotRow = commerceRecord(row.slot, at, ["endAt", "startAt", "timeZone"]);
  const endAt = commerceInstant(slotRow.endAt, `${at}.endAt`);
  const startAt = commerceInstant(slotRow.startAt, `${at}.startAt`);
  const timeZone = commerceLiteral(slotRow.timeZone, `${at}.timeZone`, COMMERCE_TIME_ZONES);
  // Un instant et une zone explicites ; un créneau futur et borné (480 min, comme PRO.GA).
  if (endAt <= startAt || endAt - startAt > C.bookingMaxMinutes * 60_000) commerceReject("invalid_time", `${at}.endAt`);
  if (startAt <= issuedAt) commerceReject("invalid_time", `${at}.startAt`);
  return {
    consent,
    ...(displayName === undefined ? {} : { displayName }),
    ...(note === undefined ? {} : { note }),
    ...(offerRef === undefined ? {} : { offerRef }),
    ...(resourceRef === undefined ? {} : { resourceRef }),
    serviceRef,
    shopRef,
    slot: { endAt, startAt, timeZone },
  };
}

function readApplication(value: unknown, issuedAt: number): CommerceApplicationPayload {
  const row = commerceRecord(value, P, ["attachments", "civilName", "consent", "jobRef", "shopRef"], ["motivation"]);
  const attachments = commerceArray(row.attachments, `${P}.attachments`, 0, C.attachmentsMax).map((item, index): CommerceAttachment => {
    const at = `${P}.attachments[${index}]`;
    const entry = commerceRecord(item, at, ["attachmentRef", "byteSize", "kind", "mimeType", "sha256"]);
    return {
      attachmentRef: commerceAntsiaRef(entry.attachmentRef, `${at}.attachmentRef`, "file"),
      byteSize: commerceInteger(entry.byteSize, `${at}.byteSize`, 1, C.attachmentBytesMax),
      kind: commerceLiteral(entry.kind, `${at}.kind`, ["certificate", "cover_letter", "cv"] as const),
      mimeType: commerceLiteral(entry.mimeType, `${at}.mimeType`, ["application/pdf"] as const),
      sha256: commerceSha256(entry.sha256, `${at}.sha256`),
    };
  });
  commerceUnique(attachments.map((item) => item.attachmentRef), `${P}.attachments`);
  commerceUnique(attachments.map((item) => item.sha256), `${P}.attachments`);
  const civilName = commerceCivilName(row.civilName, `${P}.civilName`);
  const consent = commerceConsent(row.consent, `${P}.consent`, COMMERCE_CONSENT_PURPOSES["application.submit"], issuedAt);
  const jobRef = commerceRef(row.jobRef, `${P}.jobRef`, ["job_opening"]);
  const motivation = optionalText(row, "motivation", 1, C.motivationMax, true);
  const shopRef = commerceRef(row.shopRef, `${P}.shopRef`, ["structure"]);
  return { attachments, civilName, consent, jobRef, ...(motivation === undefined ? {} : { motivation }), shopRef };
}

function readStatus(value: unknown): CommerceStatusPayload {
  const row = commerceRecord(value, P, ["targetCommand", "targetRequestId", "targetRequestSha256"]);
  const targetCommand = commerceLiteral(row.targetCommand, `${P}.targetCommand`, COMMERCE_COMMANDS);
  const targetRequestId = row.targetRequestId;
  if (!commerceIsOpaqueId(targetRequestId)) commerceReject("invalid_payload", `${P}.targetRequestId`);
  return { targetCommand, targetRequestId, targetRequestSha256: commerceSha256(row.targetRequestSha256, `${P}.targetRequestSha256`) };
}

function readPayload(operation: CommerceOperation, value: unknown, issuedAt: number): CommerceCommandRequest["payload"] {
  if (value === null || typeof value !== "object" || Array.isArray(value)) commerceReject("invalid_payload", P);
  commerceScanJson(value, COMMAND_FORBIDDEN, P);
  switch (operation) {
    case "link.confirm":
      return readLinkConfirm(value, issuedAt);
    case "catalog.draft.save":
      return readDraftSave(value);
    case "inquiry.submit":
      return readInquiry(value, issuedAt);
    case "quote.accept":
      return readQuoteAccept(value, issuedAt);
    case "checkout.prepare":
      return readCheckout(value, issuedAt);
    case "payment.start":
      return readPaymentStart(value, issuedAt);
    case "order.cancel.request":
      return readCancel(value);
    case "booking.request":
      return readBooking(value, issuedAt);
    case "application.submit":
      return readApplication(value, issuedAt);
    case "request.status":
      return readStatus(value);
  }
}

function readSubject(value: unknown, operation: CommerceOperation, issuedAt: number): CommerceSubject {
  const row = commerceRecord(value, "$.subject", ["authVerifiedAt", "kind", "ref"], [], "invalid_request");
  const authVerifiedAt = commerceInstant(row.authVerifiedAt, "$.subject.authVerifiedAt");
  // Session ANTSIA vivante revérifiée côté serveur au plus cinq minutes avant l'émission.
  if (authVerifiedAt > issuedAt || issuedAt - authVerifiedAt > C.authMaxAgeMs) {
    commerceReject("invalid_time", "$.subject.authVerifiedAt");
  }
  const kind = commerceLiteral(row.kind, "$.subject.kind", COMMERCE_SUBJECT_KINDS, "invalid_request");
  if (!COMMERCE_COMMAND_SUBJECTS[operation].includes(kind)) commerceReject("subject_not_allowed", "$.subject.kind");
  return { authVerifiedAt, kind, ref: commerceAntsiaRef(row.ref, "$.subject.ref", "sub") };
}

const REQUEST_KEYS = [
  "command",
  "contract",
  "environment",
  "expiresAt",
  "issuedAt",
  "payload",
  "requestId",
  "scope",
  "source",
  "subject",
  "version",
] as const;

/**
 * Demande reçue (octets exacts). L'expiration n'est PAS jugée ici : une
 * demande déjà traitée se rejoue même expirée (`decideCommerceCommandReplay`).
 */
export function parseCommerceCommandRequest(
  rawBody: string,
  context: CommerceReceiverContext,
): CommerceResult<CommerceCommandRequest, CommerceCommandReason> {
  return commerceCapture(() => {
    const parsed = commerceParseCanonicalBody(rawBody, C.requestMaxBytes);
    const row = commerceRecord(parsed, "$", REQUEST_KEYS, [], "invalid_request");
    if (row.contract !== COMMERCE_COMMAND_CONTRACT) commerceReject("invalid_request", "$.contract");
    if (row.version !== 1) commerceReject("invalid_request", "$.version");
    const command = row.command;
    if (typeof command !== "string") commerceReject("invalid_request", "$.command");
    if ((COMMERCE_RESERVED_COMMANDS as readonly string[]).includes(command)) commerceReject("unsupported_command", "$.command");
    if (!(COMMERCE_OPERATIONS as readonly string[]).includes(command)) commerceReject("unknown_command", "$.command");
    const operation = command as CommerceOperation;
    const requestId = row.requestId;
    if (!commerceIsOpaqueId(requestId)) commerceReject("invalid_request", "$.requestId");
    const source = row.source;
    if (!commerceIsMachineIdentity(source)) commerceReject("invalid_request", "$.source");
    if (source !== context.source) commerceReject("source_mismatch", "$.source");
    const environment = commerceLiteral(row.environment, "$.environment", COMMERCE_ENVIRONMENTS, "invalid_request");
    if (environment !== context.environment) commerceReject("environment_mismatch", "$.environment");
    if (row.scope !== COMMERCE_COMMAND_SCOPES[operation]) commerceReject("scope_mismatch", "$.scope");
    const issuedAt = commerceInstant(row.issuedAt, "$.issuedAt");
    const expiresAt = commerceInstant(row.expiresAt, "$.expiresAt");
    if (expiresAt <= issuedAt || expiresAt - issuedAt > C.requestTtlMaxMs) commerceReject("invalid_time", "$.expiresAt");
    if (!Number.isSafeInteger(context.nowMs) || issuedAt > context.nowMs + COMMERCE_MAX_SKEW_MS) {
      commerceReject("invalid_time", "$.issuedAt");
    }
    const subject = readSubject(row.subject, operation, issuedAt);
    const payload = readPayload(operation, row.payload, issuedAt);
    return {
      command: operation,
      contract: COMMERCE_COMMAND_CONTRACT,
      environment,
      expiresAt,
      issuedAt,
      payload,
      requestId,
      scope: COMMERCE_COMMAND_SCOPES[operation],
      source,
      subject,
      version: 1,
    } as CommerceCommandRequest;
  });
}

// ─── Réponses ────────────────────────────────────────────────────────────────

/** `accepted`, `reconfirm_required` et `rejected` sont ENREGISTRÉS et rejoués à l'octet près. */
export const COMMERCE_OUTCOMES = ["accepted", "conflict", "in_progress", "reconfirm_required", "rejected", "unavailable"] as const;
export type CommerceOutcome = (typeof COMMERCE_OUTCOMES)[number];
export const COMMERCE_STORED_OUTCOMES: readonly CommerceOutcome[] = ["accepted", "reconfirm_required", "rejected"];
export const COMMERCE_OUTCOME_HTTP_STATUS: Readonly<Record<CommerceOutcome, number>> = {
  accepted: 200,
  conflict: 409,
  in_progress: 202,
  reconfirm_required: 200,
  rejected: 422,
  unavailable: 503,
};
/** « Changement à reconfirmer » : seulement là où l'acheteur doit revoir un montant. */
export const COMMERCE_RECONFIRMABLE: readonly CommerceOperation[] = ["checkout.prepare", "quote.accept"];
export const COMMERCE_UNAVAILABLE_REASONS = ["provider_unavailable", "rate_limited", "temporarily_unavailable"] as const;

/**
 * Refus métier fermés par opération. `access_denied` est INDISTINCT : liaison,
 * boutique ou objet inconnu, autre source, mandat absent, sujet non
 * propriétaire — anti-énumération, comme `ERR_PRO_ACCESS_DENIED`.
 */
export const COMMERCE_COMMAND_REJECTIONS: Readonly<Record<CommerceOperation, readonly string[]>> = {
  "application.submit": ["access_denied", "already_applied", "capability_disabled", "consent_invalid", "job_closed", "quota_exceeded", "request_expired"],
  "booking.request": ["access_denied", "capability_disabled", "consent_invalid", "quota_exceeded", "request_expired", "slot_unavailable"],
  "catalog.draft.save": ["access_denied", "capability_disabled", "not_editable", "quota_exceeded", "request_expired", "stale_revision"],
  "checkout.prepare": ["access_denied", "capability_disabled", "consent_invalid", "not_purchasable", "offer_unavailable", "out_of_stock", "quota_exceeded", "request_expired"],
  "inquiry.submit": ["access_denied", "capability_disabled", "consent_invalid", "offer_unavailable", "quota_exceeded", "request_expired"],
  "link.confirm": ["access_denied", "consent_invalid", "link_code_invalid", "quota_exceeded", "request_expired"],
  "order.cancel.request": ["access_denied", "not_cancellable", "request_expired", "stale_revision"],
  "payment.start": ["access_denied", "capability_disabled", "checkout_expired", "consent_invalid", "payment_in_progress", "request_expired", "total_mismatch"],
  "quote.accept": ["access_denied", "capability_disabled", "consent_invalid", "quote_not_acceptable", "request_expired"],
  "request.status": ["access_denied", "request_expired"],
};

export type CommerceLinkConfirmResult = {
  readonly grantedPermissions: readonly CommerceLinkPermission[];
  readonly linkRef: string;
  readonly linkedAt: number;
  readonly shopRef: string;
  readonly state: "active";
};
export type CommerceDraftSaveResult = {
  readonly draftRevision: number;
  readonly offerRef: string;
  readonly status: "draft" | "pending_review";
};
export type CommerceInquiryResult = { readonly inquiryRef: string; readonly state: "submitted"; readonly submittedAt: number };
export type CommerceQuoteAcceptResult = {
  readonly acceptedAt: number;
  readonly orderRef?: string;
  readonly quoteRef: string;
  readonly quoteVersion: number;
  readonly state: "accepted";
};
export type CommerceQuoteReconfirmResult = {
  readonly currentTotal: CommerceMoney;
  readonly currentVersion: number;
  readonly quoteRef: string;
  readonly state: "reconfirm";
};
export type CommerceCheckoutLine = {
  readonly catalogRevision: number;
  readonly label: string;
  readonly lineAmount: CommerceMoney;
  readonly offerRef: string;
  readonly quantity: number;
  readonly unitAmount: CommerceMoney;
  readonly variantRef?: string;
};
export type CommerceCheckoutChange = {
  readonly field: "catalog_revision" | "quantity" | "unit_amount";
  readonly offerRef: string;
  readonly variantRef?: string;
};
export type CommerceCheckoutFee = {
  readonly amount: CommerceMoney;
  readonly kind: "delivery" | "packaging" | "service";
  readonly label: string;
};
export type CommerceCheckoutResult = {
  readonly changes?: readonly CommerceCheckoutChange[];
  readonly checkoutRef: string;
  readonly expiresAt: number;
  readonly fees: readonly CommerceCheckoutFee[];
  readonly lines: readonly CommerceCheckoutLine[];
  readonly state: "held";
  readonly total: CommerceMoney;
};
export type CommercePaymentAction =
  | { readonly kind: "await_provider_confirmation" }
  | { readonly kind: "none" }
  | { readonly kind: "provider_redirect"; readonly url: string };
export type CommercePaymentStartResult = {
  readonly action: CommercePaymentAction;
  readonly amount: CommerceMoney;
  readonly checkoutRef: string;
  readonly orderRef: string;
  readonly paymentRef: string;
  readonly state: Extract<CommercePaymentState, "pending" | "processing" | "requires_action">;
};
export type CommerceCancelResult = {
  readonly cancellation: "accepted" | "pending_review";
  readonly orderRef: string;
  readonly orderRevision: number;
  readonly orderState: CommerceOrderState;
  readonly refund: "none" | "requested";
};
export type CommerceBookingResult = {
  readonly appointmentRef: string;
  readonly endAt: number;
  readonly holdExpiresAt?: number;
  readonly startAt: number;
  readonly state: "confirmed" | "requested";
  readonly timeZone: CommerceBookingSlot["timeZone"];
};
export type CommerceApplicationResult = { readonly applicationRef: string; readonly state: "received"; readonly submittedAt: number };
/** État privé minimal rendu au seul sujet de l'objet, révisé et horodaté. */
export type CommercePrivateState = {
  readonly objectKind: CommercePrivateObjectKind;
  readonly objectRef: string;
  readonly revision: number;
  readonly state: string;
  readonly updatedAt: number;
};
export type CommerceStatusResult = {
  readonly current: readonly CommercePrivateState[];
  readonly recordedResponse?: string;
  readonly recordedResponseSha256?: string;
  readonly state: "completed" | "in_progress" | "unknown";
  readonly targetRequestId: string;
};
export type CommerceCommandResult =
  | CommerceApplicationResult
  | CommerceBookingResult
  | CommerceCancelResult
  | CommerceCheckoutResult
  | CommerceDraftSaveResult
  | CommerceInquiryResult
  | CommerceLinkConfirmResult
  | CommercePaymentStartResult
  | CommerceQuoteAcceptResult
  | CommerceQuoteReconfirmResult
  | CommerceStatusResult;

export type CommerceCommandResponse = {
  readonly command: CommerceOperation;
  readonly contract: typeof COMMERCE_COMMAND_CONTRACT;
  readonly outcome: CommerceOutcome;
  readonly reason?: string;
  readonly requestId: string;
  readonly requestSha256: string;
  readonly respondedAt: number;
  readonly result?: CommerceCommandResult;
  readonly retryAfterMs?: number;
  readonly version: 1;
};

export const COMMERCE_RESPONSE_REASONS = [
  "amount_incoherent",
  "body_too_large",
  "correlation_mismatch",
  "currency_mismatch",
  "duplicate_entry",
  "forbidden_field",
  "invalid_amount",
  "invalid_body",
  "invalid_payload",
  "invalid_reference",
  "invalid_response",
  "invalid_revision",
  "invalid_text",
  "invalid_time",
  "not_canonical",
  "too_complex",
  "total_mismatch",
  "unknown_state",
] as const;
export type CommerceResponseReason = (typeof COMMERCE_RESPONSE_REASONS)[number];

const R = "$.result";

function mismatch(path: string): never {
  return commerceReject("correlation_mismatch", path);
}

function sameRef(value: string, expected: string, path: string): string {
  if (value !== expected) mismatch(path);
  return value;
}

function readLinkResult(value: unknown, request: CommerceLinkConfirmPayload): CommerceLinkConfirmResult {
  const row = commerceRecord(value, R, ["grantedPermissions", "linkRef", "linkedAt", "shopRef", "state"]);
  const grantedPermissions = commerceSortedSet(row.grantedPermissions, `${R}.grantedPermissions`, COMMERCE_LINK_PERMISSIONS);
  // Le vendeur peut accorder moins que demandé, jamais plus.
  if (grantedPermissions.some((permission) => !request.requestedPermissions.includes(permission))) mismatch(`${R}.grantedPermissions`);
  return {
    grantedPermissions,
    linkRef: commerceRef(row.linkRef, `${R}.linkRef`, ["commerce_link"]),
    linkedAt: commerceInstant(row.linkedAt, `${R}.linkedAt`),
    shopRef: commerceRef(row.shopRef, `${R}.shopRef`, ["structure"]),
    state: commerceLiteral(row.state, `${R}.state`, ["active"] as const),
  };
}

function readDraftResult(value: unknown, request: CommerceDraftSavePayload): CommerceDraftSaveResult {
  const row = commerceRecord(value, R, ["draftRevision", "offerRef", "status"]);
  const draftRevision = readRevision(row.draftRevision, `${R}.draftRevision`);
  if (request.expectedDraftRevision !== undefined && draftRevision <= request.expectedDraftRevision) mismatch(`${R}.draftRevision`);
  const offerRef = commerceRef(row.offerRef, `${R}.offerRef`, ["offer"]);
  if (request.offerRef !== undefined) sameRef(offerRef, request.offerRef, `${R}.offerRef`);
  return { draftRevision, offerRef, status: commerceLiteral(row.status, `${R}.status`, ["draft", "pending_review"] as const) };
}

function readInquiryResult(value: unknown): CommerceInquiryResult {
  const row = commerceRecord(value, R, ["inquiryRef", "state", "submittedAt"]);
  return {
    inquiryRef: commerceRef(row.inquiryRef, `${R}.inquiryRef`, ["inquiry"]),
    state: commerceLiteral(row.state, `${R}.state`, ["submitted"] as const),
    submittedAt: commerceInstant(row.submittedAt, `${R}.submittedAt`),
  };
}

function readQuoteResult(
  value: unknown,
  request: CommerceQuoteAcceptPayload,
  outcome: CommerceOutcome,
): CommerceQuoteAcceptResult | CommerceQuoteReconfirmResult {
  if (outcome === "reconfirm_required") {
    const row = commerceRecord(value, R, ["currentTotal", "currentVersion", "quoteRef", "state"]);
    const currentTotal = commerceMoney(row.currentTotal, `${R}.currentTotal`, 1);
    const currentVersion = readRevision(row.currentVersion, `${R}.currentVersion`);
    const quoteRef = sameRef(commerceRef(row.quoteRef, `${R}.quoteRef`, ["quote"]), request.quoteRef, `${R}.quoteRef`);
    const state = commerceLiteral(row.state, `${R}.state`, ["reconfirm"] as const);
    // Reconfirmer n'a de sens que si la version ou le montant a changé.
    if (currentVersion === request.quoteVersion && currentTotal.amount === request.acceptedTotal.amount) mismatch(R);
    return { currentTotal, currentVersion, quoteRef, state };
  }
  const row = commerceRecord(value, R, ["acceptedAt", "quoteRef", "quoteVersion", "state"], ["orderRef"]);
  const acceptedAt = commerceInstant(row.acceptedAt, `${R}.acceptedAt`);
  const orderRef = commerceOptionalRef(row, "orderRef", R, ["order"]);
  const quoteRef = sameRef(commerceRef(row.quoteRef, `${R}.quoteRef`, ["quote"]), request.quoteRef, `${R}.quoteRef`);
  const quoteVersion = readRevision(row.quoteVersion, `${R}.quoteVersion`);
  if (quoteVersion !== request.quoteVersion) mismatch(`${R}.quoteVersion`);
  return {
    acceptedAt,
    ...(orderRef === undefined ? {} : { orderRef }),
    quoteRef,
    quoteVersion,
    state: commerceLiteral(row.state, `${R}.state`, ["accepted"] as const),
  };
}

function changeKey(change: CommerceCheckoutChange): string {
  return `${change.field}#${change.offerRef}#${change.variantRef ?? ""}`;
}

function readCheckoutResult(
  value: unknown,
  request: CommerceCheckoutPayload,
  outcome: CommerceOutcome,
  respondedAt: number,
): CommerceCheckoutResult {
  const row = commerceRecord(value, R, ["checkoutRef", "expiresAt", "fees", "lines", "state", "total"], ["changes"]);
  const changes = commerceHas(row, "changes")
    ? commerceArray(row.changes, `${R}.changes`, 1, C.linesMax * 3).map((item, index): CommerceCheckoutChange => {
        const at = `${R}.changes[${index}]`;
        const entry = commerceRecord(item, at, ["field", "offerRef"], ["variantRef"]);
        const field = commerceLiteral(entry.field, `${at}.field`, ["catalog_revision", "quantity", "unit_amount"] as const);
        const offerRef = commerceRef(entry.offerRef, `${at}.offerRef`, ["offer"]);
        const variantRef = commerceOptionalRef(entry, "variantRef", at, ["offer_variant"]);
        return { field, offerRef, ...(variantRef === undefined ? {} : { variantRef }) };
      })
    : undefined;
  if (changes !== undefined) commerceUnique(changes.map(changeKey), `${R}.changes`);
  const checkoutRef = commerceRef(row.checkoutRef, `${R}.checkoutRef`, ["checkout"]);
  const expiresAt = commerceInstant(row.expiresAt, `${R}.expiresAt`);
  if (expiresAt <= respondedAt) commerceReject("invalid_time", `${R}.expiresAt`);
  const fees = commerceArray(row.fees, `${R}.fees`, 0, C.feesMax).map((item, index): CommerceCheckoutFee => {
    const at = `${R}.fees[${index}]`;
    const entry = commerceRecord(item, at, ["amount", "kind", "label"]);
    return {
      amount: commerceMoney(entry.amount, `${at}.amount`),
      kind: commerceLiteral(entry.kind, `${at}.kind`, ["delivery", "packaging", "service"] as const),
      label: commerceText(entry.label, `${at}.label`, 1, C.feeLabelMax),
    };
  });
  const rawLines = commerceArray(row.lines, `${R}.lines`, 1, C.linesMax);
  if (rawLines.length !== request.lines.length) mismatch(`${R}.lines`);
  const lines = rawLines.map((item, index): CommerceCheckoutLine => {
    const at = `${R}.lines[${index}]`;
    const entry = commerceRecord(item, at, ["catalogRevision", "label", "lineAmount", "offerRef", "quantity", "unitAmount"], ["variantRef"]);
    const catalogRevision = readRevision(entry.catalogRevision, `${at}.catalogRevision`);
    const label = commerceText(entry.label, `${at}.label`, 1, C.lineLabelMax);
    const lineAmount = commerceMoney(entry.lineAmount, `${at}.lineAmount`);
    const offerRef = commerceRef(entry.offerRef, `${at}.offerRef`, ["offer"]);
    const quantity = commerceInteger(entry.quantity, `${at}.quantity`, 1, C.quantityMax);
    const unitAmount = commerceMoney(entry.unitAmount, `${at}.unitAmount`);
    const variantRef = commerceOptionalRef(entry, "variantRef", at, ["offer_variant"]);
    return { catalogRevision, label, lineAmount, offerRef, quantity, unitAmount, ...(variantRef === undefined ? {} : { variantRef }) };
  });
  const state = commerceLiteral(row.state, `${R}.state`, ["held"] as const);
  const total = commerceMoney(row.total, `${R}.total`);

  // Arithmétique entière : ligne = unitaire × quantité ; total = lignes + frais.
  lines.forEach((line, index) => {
    if (line.lineAmount.amount !== line.unitAmount.amount * line.quantity) {
      commerceReject("total_mismatch", `${R}.lines[${index}].lineAmount`);
    }
  });
  const sum = commerceSumAmounts([...lines.map((line) => line.lineAmount.amount), ...fees.map((fee) => fee.amount.amount)]);
  if (sum === null || sum !== total.amount) commerceReject("total_mismatch", `${R}.total`);

  // Correspondance ligne à ligne avec la demande, puis écarts déclarés.
  const actual: CommerceCheckoutChange[] = [];
  lines.forEach((line, index) => {
    const asked = request.lines[index];
    const at = `${R}.lines[${index}]`;
    if (asked === undefined || lineKey(line) !== lineKey(asked)) mismatch(at);
    const base = { offerRef: line.offerRef, ...(line.variantRef === undefined ? {} : { variantRef: line.variantRef }) };
    if (line.quantity > asked.quantity) mismatch(`${at}.quantity`);
    if (line.catalogRevision !== asked.expectedCatalogRevision) actual.push({ field: "catalog_revision", ...base });
    if (line.quantity !== asked.quantity) actual.push({ field: "quantity", ...base });
    if (line.unitAmount.amount !== asked.expectedUnitAmount.amount) actual.push({ field: "unit_amount", ...base });
  });
  if (outcome === "accepted") {
    if (changes !== undefined || actual.length > 0) mismatch(`${R}.changes`);
  } else {
    const declared = new Set((changes ?? []).map(changeKey));
    const observed = new Set(actual.map(changeKey));
    if (declared.size === 0 || declared.size !== observed.size || [...observed].some((key) => !declared.has(key))) {
      mismatch(`${R}.changes`);
    }
  }
  return { ...(changes === undefined ? {} : { changes }), checkoutRef, expiresAt, fees, lines, state, total };
}

/** URL du prestataire servie à l'exécution : HTTPS, sans identifiants ni fragment ; l'hôte est rejugé par ANTSIA (liste blanche). */
const PROVIDER_REDIRECT = /^https:\/\/[A-Za-z0-9.-]{1,253}(?::[0-9]{1,5})?(?:\/[A-Za-z0-9._~!$&'()*+,;=:@%/-]*)?(?:\?[A-Za-z0-9._~!$&'()*+,;=:@%/?-]*)?$/;

function readPaymentResult(value: unknown, request: CommercePaymentStartPayload): CommercePaymentStartResult {
  const row = commerceRecord(value, R, ["action", "amount", "checkoutRef", "orderRef", "paymentRef", "state"]);
  const at = `${R}.action`;
  if (row.action === null || typeof row.action !== "object" || Array.isArray(row.action)) commerceReject("invalid_payload", at);
  const kind = commerceLiteral((row.action as CommerceRecord).kind, `${at}.kind`, ["await_provider_confirmation", "none", "provider_redirect"] as const);
  let action: CommercePaymentAction;
  if (kind === "provider_redirect") {
    const entry = commerceRecord(row.action, at, ["kind", "url"]);
    const url = entry.url;
    if (typeof url !== "string" || url.length > C.redirectUrlMax || !PROVIDER_REDIRECT.test(url)) commerceReject("invalid_payload", `${at}.url`);
    action = { kind, url };
  } else {
    commerceRecord(row.action, at, ["kind"]);
    action = { kind };
  }
  const amount = commerceMoney(row.amount, `${R}.amount`, 1);
  if (amount.amount !== request.expectedTotal.amount) mismatch(`${R}.amount`);
  const checkoutRef = sameRef(commerceRef(row.checkoutRef, `${R}.checkoutRef`, ["checkout"]), request.checkoutRef, `${R}.checkoutRef`);
  const orderRef = commerceRef(row.orderRef, `${R}.orderRef`, ["order"]);
  const paymentRef = commerceRef(row.paymentRef, `${R}.paymentRef`, ["payment_intent"]);
  const state = commerceLiteral(row.state, `${R}.state`, ["pending", "processing", "requires_action"] as const);
  // Une redirection est une action de l'acheteur, jamais un succès ; sans action, rien n'est attendu de lui.
  if ((action.kind === "provider_redirect" && state !== "requires_action") || (action.kind === "none" && state === "requires_action")) {
    commerceReject("invalid_response", `${R}.state`);
  }
  return { action, amount, checkoutRef, orderRef, paymentRef, state };
}

function readCancelResult(value: unknown, request: CommerceCancelPayload): CommerceCancelResult {
  const row = commerceRecord(value, R, ["cancellation", "orderRef", "orderRevision", "orderState", "refund"]);
  const cancellation = commerceLiteral(row.cancellation, `${R}.cancellation`, ["accepted", "pending_review"] as const);
  const orderRef = sameRef(commerceRef(row.orderRef, `${R}.orderRef`, ["order"]), request.orderRef, `${R}.orderRef`);
  const orderRevision = readRevision(row.orderRevision, `${R}.orderRevision`);
  if (orderRevision <= request.expectedOrderRevision) mismatch(`${R}.orderRevision`);
  const orderState = commerceLiteral(row.orderState, `${R}.orderState`, COMMERCE_ORDER_STATES, "unknown_state");
  const refund = commerceLiteral(row.refund, `${R}.refund`, ["none", "requested"] as const);
  if (cancellation === "accepted" && orderState !== "cancelled") commerceReject("invalid_response", `${R}.orderState`);
  return { cancellation, orderRef, orderRevision, orderState, refund };
}

function readBookingResult(value: unknown, request: CommerceBookingPayload, respondedAt: number): CommerceBookingResult {
  const row = commerceRecord(value, R, ["appointmentRef", "endAt", "startAt", "state", "timeZone"], ["holdExpiresAt"]);
  const appointmentRef = commerceRef(row.appointmentRef, `${R}.appointmentRef`, ["appointment"]);
  const endAt = commerceInstant(row.endAt, `${R}.endAt`);
  if (endAt !== request.slot.endAt) mismatch(`${R}.endAt`);
  const holdExpiresAt = commerceHas(row, "holdExpiresAt") ? commerceInstant(row.holdExpiresAt, `${R}.holdExpiresAt`) : undefined;
  const startAt = commerceInstant(row.startAt, `${R}.startAt`);
  if (startAt !== request.slot.startAt) mismatch(`${R}.startAt`);
  const state = commerceLiteral(row.state, `${R}.state`, ["confirmed", "requested"] as const);
  const timeZone = commerceLiteral(row.timeZone, `${R}.timeZone`, COMMERCE_TIME_ZONES);
  if (timeZone !== request.slot.timeZone) mismatch(`${R}.timeZone`);
  // Une demande en attente de confirmation retient le créneau pour un temps borné, et seulement elle.
  if ((holdExpiresAt !== undefined) !== (state === "requested")) commerceReject("invalid_response", `${R}.holdExpiresAt`);
  if (holdExpiresAt !== undefined && holdExpiresAt <= respondedAt) commerceReject("invalid_time", `${R}.holdExpiresAt`);
  return { appointmentRef, endAt, ...(holdExpiresAt === undefined ? {} : { holdExpiresAt }), startAt, state, timeZone };
}

function readApplicationResult(value: unknown): CommerceApplicationResult {
  const row = commerceRecord(value, R, ["applicationRef", "state", "submittedAt"]);
  return {
    applicationRef: commerceRef(row.applicationRef, `${R}.applicationRef`, ["job_application"]),
    state: commerceLiteral(row.state, `${R}.state`, ["received"] as const),
    submittedAt: commerceInstant(row.submittedAt, `${R}.submittedAt`),
  };
}

function readPrivateState(value: unknown, path: string): CommercePrivateState {
  const row = commerceRecord(value, path, ["objectKind", "objectRef", "revision", "state", "updatedAt"]);
  const objectKind = commerceLiteral(row.objectKind, `${path}.objectKind`, COMMERCE_PRIVATE_OBJECT_KINDS);
  const objectRef = commerceRef(row.objectRef, `${path}.objectRef`, [objectKind]);
  const revision = readRevision(row.revision, `${path}.revision`);
  const state = commerceLiteral(row.state, `${path}.state`, commerceMachineStates(COMMERCE_PRIVATE_OBJECT_MACHINES[objectKind]), "unknown_state");
  return { objectKind, objectRef, revision, state, updatedAt: commerceInstant(row.updatedAt, `${path}.updatedAt`) };
}

function readStatusResult(value: unknown, request: CommerceStatusPayload): CommerceStatusResult {
  const row = commerceRecord(value, R, ["current", "state", "targetRequestId"], ["recordedResponse", "recordedResponseSha256"]);
  const current = commerceArray(row.current, `${R}.current`, 0, C.currentStatesMax).map((item, index) =>
    readPrivateState(item, `${R}.current[${index}]`),
  );
  commerceUnique(current.map((item) => item.objectRef), `${R}.current`);
  const recordedResponse = row.recordedResponse;
  if (
    recordedResponse !== undefined &&
    (typeof recordedResponse !== "string" || commerceUtf8ByteLength(recordedResponse) > C.requestMaxBytes || recordedResponse.length === 0)
  ) {
    commerceReject("invalid_payload", `${R}.recordedResponse`);
  }
  const recordedResponseSha256 = row.recordedResponseSha256;
  if (recordedResponseSha256 !== undefined && !commerceIsSha256(recordedResponseSha256)) {
    commerceReject("invalid_payload", `${R}.recordedResponseSha256`);
  }
  const state = commerceLiteral(row.state, `${R}.state`, ["completed", "in_progress", "unknown"] as const);
  const targetRequestId = row.targetRequestId;
  if (targetRequestId !== request.targetRequestId) mismatch(`${R}.targetRequestId`);
  // Réponse enregistrée ⟺ demande terminée ; une demande inconnue ne révèle aucun état.
  const recorded = recordedResponse !== undefined && recordedResponseSha256 !== undefined;
  if ((recordedResponse === undefined) !== (recordedResponseSha256 === undefined) || recorded !== (state === "completed")) {
    commerceReject("invalid_response", `${R}.state`);
  }
  if (state === "unknown" && current.length > 0) commerceReject("invalid_response", `${R}.current`);
  return {
    current,
    ...(typeof recordedResponse === "string" ? { recordedResponse } : {}),
    ...(typeof recordedResponseSha256 === "string" ? { recordedResponseSha256 } : {}),
    state,
    targetRequestId: request.targetRequestId,
  };
}

function readResult(
  request: CommerceCommandRequest,
  value: unknown,
  outcome: CommerceOutcome,
  respondedAt: number,
): CommerceCommandResult {
  commerceScanJson(value, RESPONSE_FORBIDDEN, R);
  switch (request.command) {
    case "link.confirm":
      return readLinkResult(value, request.payload);
    case "catalog.draft.save":
      return readDraftResult(value, request.payload);
    case "inquiry.submit":
      return readInquiryResult(value);
    case "quote.accept":
      return readQuoteResult(value, request.payload, outcome);
    case "checkout.prepare":
      return readCheckoutResult(value, request.payload, outcome, respondedAt);
    case "payment.start":
      return readPaymentResult(value, request.payload);
    case "order.cancel.request":
      return readCancelResult(value, request.payload);
    case "booking.request":
      return readBookingResult(value, request.payload, respondedAt);
    case "application.submit":
      return readApplicationResult(value);
    case "request.status":
      return readStatusResult(value, request.payload);
  }
}

const RESPONSE_KEYS = ["command", "contract", "outcome", "requestId", "requestSha256", "respondedAt", "version"] as const;

/**
 * Réponse reçue par ANTSIA, corrélée à SA demande (identifiant, empreinte des
 * octets exacts envoyés, opération). Un succès de paiement n'est jamais lu
 * ici : il n'existe qu'en état privé `succeeded` servi par PRO.GA.
 */
export function parseCommerceCommandResponse(
  rawBody: string,
  expected: { readonly request: CommerceCommandRequest; readonly requestSha256: string },
  nowMs: number,
): CommerceResult<CommerceCommandResponse, CommerceResponseReason> {
  return commerceCapture(() => {
    const parsed = commerceParseCanonicalBody(rawBody, C.responseMaxBytes);
    const row = commerceRecord(parsed, "$", RESPONSE_KEYS, ["reason", "result", "retryAfterMs"], "invalid_response");
    if (row.contract !== COMMERCE_COMMAND_CONTRACT || row.version !== 1) commerceReject("invalid_response", "$.contract");
    if (row.command !== expected.request.command) mismatch("$.command");
    if (row.requestId !== expected.request.requestId) mismatch("$.requestId");
    if (row.requestSha256 !== expected.requestSha256) mismatch("$.requestSha256");
    const outcome = commerceLiteral(row.outcome, "$.outcome", COMMERCE_OUTCOMES, "invalid_response");
    const respondedAt = commerceInstant(row.respondedAt, "$.respondedAt");
    if (
      !Number.isSafeInteger(nowMs) ||
      respondedAt > nowMs + COMMERCE_MAX_SKEW_MS ||
      respondedAt < expected.request.issuedAt - COMMERCE_MAX_SKEW_MS
    ) {
      commerceReject("invalid_time", "$.respondedAt");
    }
    const command = expected.request.command;
    const hasResult = commerceHas(row, "result");
    const hasReason = commerceHas(row, "reason");
    const hasRetry = commerceHas(row, "retryAfterMs");
    const retryable = outcome === "unavailable" || outcome === "in_progress";
    if (hasRetry && !retryable) commerceReject("invalid_response", "$.retryAfterMs");
    const retryAfterMs = hasRetry
      ? commerceInteger(row.retryAfterMs, "$.retryAfterMs", C.retryAfterMinMs, C.retryAfterMaxMs, "invalid_response")
      : undefined;
    let reason: string | undefined;
    let result: CommerceCommandResult | undefined;
    if (outcome === "accepted" || outcome === "reconfirm_required") {
      if (!hasResult || hasReason) commerceReject("invalid_response", "$.result");
      if (outcome === "reconfirm_required" && !COMMERCE_RECONFIRMABLE.includes(command)) commerceReject("invalid_response", "$.outcome");
      result = readResult(expected.request, row.result, outcome, respondedAt);
    } else {
      if (hasResult || !hasReason) commerceReject("invalid_response", "$.reason");
      const allowed =
        outcome === "rejected"
          ? COMMERCE_COMMAND_REJECTIONS[command]
          : outcome === "conflict"
            ? ["idempotency_conflict"]
            : outcome === "in_progress"
              ? ["in_progress"]
              : COMMERCE_UNAVAILABLE_REASONS;
      reason = commerceLiteral(row.reason, "$.reason", allowed, "invalid_response");
    }
    return {
      command,
      contract: COMMERCE_COMMAND_CONTRACT,
      outcome,
      ...(reason === undefined ? {} : { reason }),
      requestId: expected.request.requestId,
      requestSha256: expected.requestSha256,
      respondedAt,
      ...(result === undefined ? {} : { result }),
      ...(retryAfterMs === undefined ? {} : { retryAfterMs }),
      version: 1,
    };
  });
}

// ─── Idempotence, rejeu et délai réseau ──────────────────────────────────────

/** Écriture idempotente générique (outbox d'événements, inbox, demandes) : même empreinte, même effet. */
export function decideCommerceIdempotentWrite(
  existingSha256: string | null,
  incomingSha256: string,
): "conflict" | "first" | "replay" {
  if (existingSha256 === null) return "first";
  return existingSha256 === incomingSha256 ? "replay" : "conflict";
}

/** Enregistrement d'idempotence côté PRO.GA, clé `(source, environnement, requestId)`. */
export type CommerceStoredCommand =
  | { readonly requestSha256: string; readonly state: "in_progress" }
  | { readonly requestSha256: string; readonly responseBody: string; readonly state: "completed" };

export type CommerceReplayDecision =
  | { readonly action: "conflict" }
  | { readonly action: "execute" }
  | { readonly action: "expired" }
  | { readonly action: "in_progress" }
  | { readonly action: "replay"; readonly responseBody: string };

/**
 * Décision AVANT tout effet : même clé + mêmes octets terminée → mêmes octets
 * de réponse (même expirée) ; même clé + autres octets → conflit, rien
 * exécuté ; jamais d'exécution après `expiresAt`. L'enregistrement vit au
 * moins jusqu'à `expiresAt + COMMERCE_MAX_SKEW_MS` : après sa purge, une
 * répétition est refusée comme expirée, jamais réexécutée.
 */
export function decideCommerceCommandReplay(
  existing: CommerceStoredCommand | null,
  incoming: { readonly expiresAt: number; readonly requestSha256: string },
  nowMs: number,
): CommerceReplayDecision {
  if (existing !== null) {
    if (existing.requestSha256 !== incoming.requestSha256) return { action: "conflict" };
    return existing.state === "completed" ? { action: "replay", responseBody: existing.responseBody } : { action: "in_progress" };
  }
  return nowMs > incoming.expiresAt ? { action: "expired" } : { action: "execute" };
}

export type CommerceTimeoutGuidance = "resend_same_bytes" | "safe_to_restart" | "use_recorded" | "wait";

/**
 * Après un délai réseau, ANTSIA ne frappe JAMAIS un nouvel identifiant pour la
 * même intention : il consulte `request.status`, puis renvoie les octets
 * persistés tant que la demande peut encore s'exécuter. Une nouvelle demande
 * n'est sûre qu'une fois l'ancienne expirée, tolérance d'horloge comprise.
 */
export function decideCommerceRetryAfterTimeout(
  status: CommerceStatusResult["state"],
  targetExpiresAt: number,
  nowMs: number,
): CommerceTimeoutGuidance {
  if (status === "completed") return "use_recorded";
  if (status === "in_progress") return "wait";
  return nowMs > targetExpiresAt + COMMERCE_MAX_SKEW_MS ? "safe_to_restart" : "resend_same_bytes";
}

/** Nouvelle tentative de paiement pour un même panier : seulement après un échec ou une annulation certains. */
export function commerceCanStartNewPayment(
  previous:
    | null
    | { readonly kind: "payment"; readonly state: CommercePaymentState }
    | { readonly kind: "timeout"; readonly guidance: CommerceTimeoutGuidance },
): boolean {
  if (previous === null) return true;
  if (previous.kind === "timeout") return previous.guidance === "safe_to_restart";
  return previous.state === "failed" || previous.state === "cancelled";
}

// ─── Profil de signature COMMAND ─────────────────────────────────────────────

/**
 * Profil distinct par contrat et destination : même construction que
 * `pro-ga-machine-hmac/v1` de PRO.GA (composants préfixés par leur longueur,
 * HMAC-SHA256, base64url sans remplissage), étiquette propre, sans composant
 * tenant : la structure visée se résout côté serveur depuis la liaison.
 * Aucun secret ici ; la clé est désignée par `keyId`, propre à la source et à
 * l'environnement.
 */
export const COMMERCE_COMMAND_SIGNATURE_PROFILE = "pro-ga-commerce-command-hmac/v1";
export const COMMERCE_COMMAND_AUDIENCE = "pro.ga.commerce";

export type CommerceCommandSigningComponents = {
  readonly bodySha256: string;
  readonly environment: CommerceEnvironment;
  readonly issuedAtMs: number;
  readonly keyId: string;
  readonly nonce: string;
  readonly operation: CommerceOperation;
  readonly source: string;
};

/** Chaîne à signer, ou `null` si un composant est hors grammaire (refus fail-closed). */
export function commerceCommandSigningInput(input: CommerceCommandSigningComponents): string | null {
  if (
    !/^[A-Za-z0-9._:-]{8,128}$/.test(input.keyId) ||
    !Number.isSafeInteger(input.issuedAtMs) ||
    input.issuedAtMs < 0 ||
    !/^[A-Za-z0-9_-]{24,128}$/.test(input.nonce) ||
    !commerceIsMachineIdentity(input.source) ||
    !(COMMERCE_ENVIRONMENTS as readonly string[]).includes(input.environment) ||
    !(COMMERCE_OPERATIONS as readonly string[]).includes(input.operation) ||
    !commerceIsSha256(input.bodySha256)
  ) {
    return null;
  }
  const parts = [
    COMMERCE_COMMAND_SIGNATURE_PROFILE,
    input.keyId,
    String(input.issuedAtMs),
    input.nonce,
    input.source,
    input.environment,
    COMMERCE_COMMAND_AUDIENCE,
    COMMERCE_COMMAND_SCOPES[input.operation],
    input.bodySha256,
  ];
  return parts.map((part) => `${part.length}:${part}`).join("|");
}

/** Sous-total attendu des lignes demandées, pour l'affichage : sans autorité, PRO.GA recalcule. */
export function commerceExpectedLinesTotal(lines: readonly CommerceCheckoutLineInput[]): number | null {
  const amounts: number[] = [];
  for (const line of lines) {
    const amount = line.expectedUnitAmount.amount * line.quantity;
    if (!Number.isSafeInteger(amount)) return null;
    amounts.push(amount);
  }
  return commerceSumAmounts(amounts);
}
