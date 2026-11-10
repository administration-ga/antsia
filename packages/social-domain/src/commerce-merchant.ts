/** MP06 : lecture privée de préparation du titulaire PRO, sans opération métier. Jumeau ANTSIA/PRO.GA. */
import {
  COMMERCE_ENVIRONMENTS, COMMERCE_MAX_SKEW_MS, commerceAntsiaRef, commerceArray, commerceBoolean,
  commerceCapture, commerceInstant, commerceInteger, commerceIsMachineIdentity, commerceIsOpaqueId,
  commerceIsSha256, commerceLiteral, commerceParseCanonicalBody, commerceRecord, commerceRef, commerceReject,
  type CommerceEnvironment, type CommerceResult,
} from "./commerce/primitives";

export const COMMERCE_MERCHANT_READ_CONTRACT = "PRO-COMMERCE-MERCHANT-READ-V1";
export const COMMERCE_MERCHANT_READ_PROFILE = "pro-ga-commerce-merchant-read-hmac/v1";
export const COMMERCE_MERCHANT_READ_SCOPE = "commerce.merchant.read";
export const COMMERCE_MERCHANT_READ_PATH = "/commerce/v1/merchant/preparation";
export const COMMERCE_MERCHANT_READ_MAX_BYTES = 8192;
export const COMMERCE_MERCHANT_READ_TTL_MS = 60_000;
export const COMMERCE_MERCHANT_READ_CONSENT_VERSION = "2026-10-21-mp06-merchant-read-v1";
export const COMMERCE_MERCHANT_TARGETS = ["catalog", "new_offer", "quotes", "agenda", "agenda_services", "agenda_resources"] as const;
export type CommerceMerchantTarget = (typeof COMMERCE_MERCHANT_TARGETS)[number];
export const COMMERCE_MERCHANT_CAPABILITIES = ["catalog", "quotes", "agenda", "fixed_packages"] as const;
export type CommerceMerchantCapabilityKey = (typeof COMMERCE_MERCHANT_CAPABILITIES)[number];
export const COMMERCE_MERCHANT_MISSING = ["module_unavailable", "task_denied", "permission_missing", "catalog_unpublished", "service_disabled", "verification_required"] as const;
export type CommerceMerchantMissing = (typeof COMMERCE_MERCHANT_MISSING)[number];
export type CommerceMerchantCapability = {
  readonly key: CommerceMerchantCapabilityKey; readonly canOpen: boolean;
  readonly target: CommerceMerchantTarget | null; readonly missing: readonly CommerceMerchantMissing[];
};
export type CommerceMerchantReadRequest = {
  readonly contract: typeof COMMERCE_MERCHANT_READ_CONTRACT; readonly version: 1; readonly operation: "merchant.preparation.read";
  readonly source: string; readonly environment: CommerceEnvironment; readonly requestId: string;
  readonly subject: { readonly kind: "seller_operator"; readonly ref: string; readonly authVerifiedAt: number };
  readonly issuedAt: number; readonly expiresAt: number; readonly linkRef: string; readonly shopRef: string; readonly antsiaShopRef: string;
};
type ResponseBase = { readonly contract: typeof COMMERCE_MERCHANT_READ_CONTRACT; readonly version: 1; readonly requestId: string; readonly requestSha256: string };
export type CommerceMerchantReadAccepted = ResponseBase & {
  readonly outcome: "accepted"; readonly linkRef: string; readonly shopRef: string; readonly checkedAt: number; readonly expiresAt: number;
  readonly publishedCatalog: { readonly available: boolean; readonly revision: number | null };
  readonly servicesEnabled: boolean; readonly capabilities: readonly CommerceMerchantCapability[];
};
export type CommerceMerchantReadResponse = CommerceMerchantReadAccepted | ResponseBase & {
  readonly outcome: "refused"; readonly reason: "access_denied" | "capability_disabled" | "temporarily_unavailable";
};
export type CommerceMerchantReadReason = "invalid_body" | "body_too_large" | "not_canonical" | "too_complex" | "invalid_payload" | "invalid_request" | "invalid_reference" | "invalid_time" | "source_mismatch" | "environment_mismatch" | "correlation_mismatch";

export function parseCommerceMerchantReadRequest(raw: string, context: { source: string; environment: CommerceEnvironment; nowMs: number }): CommerceResult<CommerceMerchantReadRequest, CommerceMerchantReadReason> {
  return commerceCapture(() => {
    const row = commerceRecord(commerceParseCanonicalBody(raw, COMMERCE_MERCHANT_READ_MAX_BYTES), "$", ["contract", "version", "operation", "source", "environment", "requestId", "subject", "issuedAt", "expiresAt", "linkRef", "shopRef", "antsiaShopRef"]);
    if (row.contract !== COMMERCE_MERCHANT_READ_CONTRACT || row.version !== 1 || row.operation !== "merchant.preparation.read") commerceReject("invalid_request", "$");
    if (!commerceIsMachineIdentity(row.source) || row.source !== context.source) commerceReject("source_mismatch", "$.source");
    const environment = commerceLiteral(row.environment, "$.environment", COMMERCE_ENVIRONMENTS);
    if (environment !== context.environment) commerceReject("environment_mismatch", "$.environment");
    if (!commerceIsOpaqueId(row.requestId)) commerceReject("invalid_request", "$.requestId");
    const issuedAt = commerceInstant(row.issuedAt, "$.issuedAt"), expiresAt = commerceInstant(row.expiresAt, "$.expiresAt");
    if (!Number.isSafeInteger(context.nowMs) || Math.abs(issuedAt - context.nowMs) > COMMERCE_MAX_SKEW_MS || expiresAt <= context.nowMs || expiresAt <= issuedAt || expiresAt - issuedAt > COMMERCE_MERCHANT_READ_TTL_MS) commerceReject("invalid_time", "$.expiresAt");
    const subject = commerceRecord(row.subject, "$.subject", ["kind", "ref", "authVerifiedAt"]);
    if (subject.kind !== "seller_operator") commerceReject("invalid_request", "$.subject.kind");
    const authVerifiedAt = commerceInstant(subject.authVerifiedAt, "$.subject.authVerifiedAt");
    if (authVerifiedAt > issuedAt || issuedAt - authVerifiedAt > COMMERCE_MAX_SKEW_MS) commerceReject("invalid_time", "$.subject.authVerifiedAt");
    return { contract: COMMERCE_MERCHANT_READ_CONTRACT, version: 1, operation: "merchant.preparation.read", source: row.source, environment, requestId: row.requestId,
      issuedAt, expiresAt, subject: { kind: "seller_operator", ref: commerceAntsiaRef(subject.ref, "$.subject.ref", "sub"), authVerifiedAt },
      linkRef: commerceRef(row.linkRef, "$.linkRef", ["commerce_link"]), shopRef: commerceRef(row.shopRef, "$.shopRef", ["structure"]), antsiaShopRef: commerceAntsiaRef(row.antsiaShopRef, "$.antsiaShopRef", "shop") };
  });
}

export function parseCommerceMerchantReadResponse(raw: string, context: { request: CommerceMerchantReadRequest; requestSha256: string; nowMs: number }): CommerceResult<CommerceMerchantReadResponse, CommerceMerchantReadReason> {
  return commerceCapture(() => {
    const parsed = commerceParseCanonicalBody(raw, COMMERCE_MERCHANT_READ_MAX_BYTES);
    const probe = commerceRecord(parsed, "$", ["contract", "version", "requestId", "requestSha256", "outcome"], ["reason", "linkRef", "shopRef", "checkedAt", "expiresAt", "publishedCatalog", "servicesEnabled", "capabilities"]);
    if (probe.contract !== COMMERCE_MERCHANT_READ_CONTRACT || probe.version !== 1 || probe.requestId !== context.request.requestId || !commerceIsSha256(context.requestSha256) || probe.requestSha256 !== context.requestSha256) commerceReject("correlation_mismatch", "$");
    const base: ResponseBase = { contract: COMMERCE_MERCHANT_READ_CONTRACT, version: 1, requestId: context.request.requestId, requestSha256: context.requestSha256 };
    if (probe.outcome === "refused") {
      const row = commerceRecord(parsed, "$", ["contract", "version", "requestId", "requestSha256", "outcome", "reason"]);
      return { ...base, outcome: "refused", reason: commerceLiteral(row.reason, "$.reason", ["access_denied", "capability_disabled", "temporarily_unavailable"] as const) };
    }
    const row = commerceRecord(parsed, "$", ["contract", "version", "requestId", "requestSha256", "outcome", "linkRef", "shopRef", "checkedAt", "expiresAt", "publishedCatalog", "servicesEnabled", "capabilities"]);
    if (row.outcome !== "accepted" || row.linkRef !== context.request.linkRef || row.shopRef !== context.request.shopRef) commerceReject("correlation_mismatch", "$");
    const checkedAt = commerceInstant(row.checkedAt, "$.checkedAt"), expiresAt = commerceInstant(row.expiresAt, "$.expiresAt");
    if (!Number.isSafeInteger(context.nowMs) || Math.abs(checkedAt - context.nowMs) > COMMERCE_MAX_SKEW_MS || checkedAt < context.request.issuedAt - COMMERCE_MAX_SKEW_MS || expiresAt <= context.nowMs || expiresAt <= checkedAt || expiresAt > context.request.expiresAt || expiresAt - checkedAt > COMMERCE_MERCHANT_READ_TTL_MS) commerceReject("invalid_time", "$.expiresAt");
    const published = commerceRecord(row.publishedCatalog, "$.publishedCatalog", ["available", "revision"]);
    const available = commerceBoolean(published.available, "$.publishedCatalog.available");
    const revision = published.revision === null ? null : commerceInteger(published.revision, "$.publishedCatalog.revision", 1, Number.MAX_SAFE_INTEGER);
    if (available !== (revision !== null)) commerceReject("invalid_payload", "$.publishedCatalog");
    const capabilities = commerceArray(row.capabilities, "$.capabilities", 4, 4).map((value, index): CommerceMerchantCapability => {
      const path = `$.capabilities[${index}]`, item = commerceRecord(value, path, ["key", "canOpen", "target", "missing"]);
      const key = commerceLiteral(item.key, `${path}.key`, COMMERCE_MERCHANT_CAPABILITIES), canOpen = commerceBoolean(item.canOpen, `${path}.canOpen`);
      const target = item.target === null ? null : commerceLiteral(item.target, `${path}.target`, COMMERCE_MERCHANT_TARGETS);
      if (canOpen !== (target !== null) || (target !== null && !(key === "catalog" ? ["catalog", "new_offer"] : key === "quotes" ? ["quotes"] : key === "agenda" ? ["agenda", "agenda_services", "agenda_resources"] : ["catalog", "new_offer"]).includes(target))) commerceReject("invalid_payload", path);
      const missing = commerceArray(item.missing, `${path}.missing`, 0, COMMERCE_MERCHANT_MISSING.length).map((value, i) => commerceLiteral(value, `${path}.missing[${i}]`, COMMERCE_MERCHANT_MISSING));
      if (new Set(missing).size !== missing.length) commerceReject("invalid_payload", `${path}.missing`);
      return { key, canOpen, target, missing };
    });
    if (new Set(capabilities.map(item => item.key)).size !== 4) commerceReject("invalid_payload", "$.capabilities");
    return { ...base, outcome: "accepted", linkRef: context.request.linkRef, shopRef: context.request.shopRef, checkedAt, expiresAt, publishedCatalog: { available, revision }, servicesEnabled: commerceBoolean(row.servicesEnabled, "$.servicesEnabled"), capabilities };
  });
}

export function commerceMerchantReadSigningInput(input: { bodySha256: string; environment: CommerceEnvironment; issuedAtMs: number; keyId: string; nonce: string; operation: "merchant.preparation.read"; source: string }): string | null {
  if (!commerceIsSha256(input.bodySha256) || !commerceIsMachineIdentity(input.source) || !COMMERCE_ENVIRONMENTS.includes(input.environment) || input.operation !== "merchant.preparation.read" || !Number.isSafeInteger(input.issuedAtMs) || input.issuedAtMs < 0 || !/^[A-Za-z0-9._:-]{8,128}$/u.test(input.keyId) || !/^[A-Za-z0-9_-]{24,128}$/u.test(input.nonce)) return null;
  return [COMMERCE_MERCHANT_READ_PROFILE, input.keyId, String(input.issuedAtMs), input.nonce, input.source, input.environment, "pro.ga.commerce.merchant", COMMERCE_MERCHANT_READ_SCOPE, input.operation, input.bodySha256].map(value => `${value.length}:${value}`).join("|");
}
