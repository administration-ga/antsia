/**
 * P19 / DP-39 — signal PRIVÉ d'une évolution de suivi de service.
 * FICHIER JUMEAU ANTSIA/PRO.GA, hors manifeste P06 : aucune modification de commerce/**.
 * Une invalidation ne décrit ni l'état métier, ni une autorisation, ni un paiement.
 * Elle vise un engagement préexistant ; ses détails exigent la relecture authentifiée.
 * TypeScript pur, sans I/O, horloge implicite, aléa ni secret.
 */
import {
  COMMERCE_ENVIRONMENTS, commerceAntsiaRef, commerceCapture, commerceInteger,
  commerceIsOpaqueId, commerceLiteral, commerceParseCanonicalBody, commerceRecord,
  commerceRef, commerceReject, commerceTimeMs,
  type CommerceEnvironment, type CommerceResult,
} from "./commerce/primitives";

export const COMMERCE_SERVICE_NOTICE_CONTRACT = "PRO-COMMERCE-SERVICE-NOTICE-V1";
export const COMMERCE_SERVICE_NOTICE_PROFILE = "antsia-commerce-service-notice-v1";
export const COMMERCE_SERVICE_NOTICE_EVENT_TYPES = ["service.followup.changed"] as const;
export const COMMERCE_SERVICE_NOTICE_OBJECT_KINDS = ["appointment", "quote", "order"] as const;
export const COMMERCE_SERVICE_NOTICE_BODY_MAX_BYTES = 2048;
export type CommerceServiceNoticeObjectKind = typeof COMMERCE_SERVICE_NOTICE_OBJECT_KINDS[number];
export type CommerceServiceNoticeEvent = {
  readonly type: "service.followup.changed";
  readonly environment: CommerceEnvironment;
  readonly subjectRef: string;
  readonly shopRef: string;
  readonly originRequestId: string;
  readonly objectKind: CommerceServiceNoticeObjectKind;
  readonly objectRef: string;
  readonly revision: number;
  readonly changedAt: number;
};
export type CommerceServiceNoticeEnvelope = {
  readonly contract: typeof COMMERCE_SERVICE_NOTICE_CONTRACT;
  readonly eventId: string;
  readonly version: 1;
  readonly objectRef: string;
  readonly payload: CommerceServiceNoticeEvent;
};
export type CommerceServiceNoticeReason =
  | "invalid_body" | "body_too_large" | "not_canonical"
  | "invalid_envelope" | "invalid_payload" | "invalid_reference" | "invalid_time";

/** Forme fermée et corrélée ; aucune autorité ne découle de la syntaxe valide. */
export function parseCommerceServiceNoticeBody(
  rawBody: string, nowMs: number,
): CommerceResult<CommerceServiceNoticeEnvelope, CommerceServiceNoticeReason> {
  return commerceCapture(() => {
    const row = commerceRecord(commerceParseCanonicalBody(rawBody, COMMERCE_SERVICE_NOTICE_BODY_MAX_BYTES),
      "$", ["contract", "eventId", "version", "objectRef", "payload"], [], "invalid_envelope");
    if (row.contract !== COMMERCE_SERVICE_NOTICE_CONTRACT || row.version !== 1 ||
      !commerceIsOpaqueId(row.eventId)) commerceReject("invalid_envelope", "$");
    const payload = commerceRecord(row.payload, "$.payload",
      ["type", "environment", "subjectRef", "shopRef", "originRequestId", "objectKind", "objectRef", "revision", "changedAt"]);
    if (payload.type !== "service.followup.changed" || !commerceIsOpaqueId(payload.originRequestId))
      commerceReject("invalid_payload", "$.payload");
    const environment = commerceLiteral(payload.environment, "$.payload.environment", COMMERCE_ENVIRONMENTS);
    const objectKind = commerceLiteral(payload.objectKind, "$.payload.objectKind", COMMERCE_SERVICE_NOTICE_OBJECT_KINDS);
    const objectRef = commerceRef(payload.objectRef, "$.payload.objectRef", [objectKind]);
    if (row.objectRef !== objectRef) commerceReject("invalid_reference", "$.objectRef");
    const event: CommerceServiceNoticeEvent = {
      type: "service.followup.changed", environment, objectKind, objectRef,
      subjectRef: commerceAntsiaRef(payload.subjectRef, "$.payload.subjectRef", "sub"),
      shopRef: commerceRef(payload.shopRef, "$.payload.shopRef", ["structure"]),
      originRequestId: payload.originRequestId,
      revision: commerceInteger(payload.revision, "$.payload.revision", 1, Number.MAX_SAFE_INTEGER),
      changedAt: commerceTimeMs(payload.changedAt, "$.payload.changedAt", nowMs),
    };
    return { contract: COMMERCE_SERVICE_NOTICE_CONTRACT, eventId: row.eventId,
      version: 1, objectRef, payload: event };
  });
}

