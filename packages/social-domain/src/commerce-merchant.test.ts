import { describe, expect, test } from "vitest";
import { commerceCanonicalJson } from "./commerce/primitives";
import {
  COMMERCE_MERCHANT_READ_CONTRACT, COMMERCE_MERCHANT_CAPABILITIES,
  commerceMerchantReadSigningInput, parseCommerceMerchantReadRequest,
  parseCommerceMerchantReadResponse, type CommerceMerchantReadAccepted, type CommerceMerchantReadRequest,
} from "./commerce-merchant";
const NOW = 1792584000000, HASH = "a".repeat(64);
const request: CommerceMerchantReadRequest = { contract: COMMERCE_MERCHANT_READ_CONTRACT, version: 1, operation: "merchant.preparation.read", source: "antsia", environment: "sandbox", requestId: "merchant-read-test-0001", issuedAt: NOW, expiresAt: NOW + 60000,
  subject: { kind: "seller_operator", ref: `antsia:sub:${"a".repeat(26)}`, authVerifiedAt: NOW }, linkRef: `pro.ga:commerce_link:${"A".repeat(26)}`, shopRef: `pro.ga:structure:${"B".repeat(26)}`, antsiaShopRef: `antsia:shop:${"c".repeat(26)}` };
const json = (value: unknown) => commerceCanonicalJson(value)!;
const read = (value: unknown) => parseCommerceMerchantReadRequest(json(value), { source: "antsia", environment: "sandbox", nowMs: NOW });
const response: CommerceMerchantReadAccepted = { contract: COMMERCE_MERCHANT_READ_CONTRACT, version: 1, requestId: request.requestId, requestSha256: HASH, outcome: "accepted", linkRef: request.linkRef, shopRef: request.shopRef, checkedAt: NOW, expiresAt: NOW + 60000, publishedCatalog: { available: false, revision: null }, servicesEnabled: false,
  capabilities: COMMERCE_MERCHANT_CAPABILITIES.map(key => ({ key, canOpen: true, target: key === "fixed_packages" ? "new_offer" : key, missing: ["catalog_unpublished", "service_disabled"] })) };
const readResponse = (value: unknown) => parseCommerceMerchantReadResponse(json(value), { request, requestSha256: HASH, nowMs: NOW });
describe("MP06 — préparation privée du seul titulaire PRO", () => {
  test("ferme sujet, références, horloges, tenant et champs inconnus", () => {
    expect(read(request).ok).toBe(true);
    for (const value of [{ ...request, subject: { ...request.subject, kind: "buyer" } }, { ...request, subject: { ...request.subject, authVerifiedAt: NOW + 1 } }, { ...request, tenantId: "private" }, { ...request, expiresAt: NOW + 60001 }, { ...request, shopRef: request.linkRef }, { ...request, antsiaShopRef: request.subject.ref }, { ...request, source: "another" }]) expect(read(value).ok).toBe(false);
  });
  test("corrèle réponse, date de lecture et cibles fermées", () => {
    expect(readResponse(response).ok).toBe(true);
    for (const value of [{ ...response, requestSha256: "b".repeat(64) }, { ...response, shopRef: `pro.ga:structure:${"C".repeat(26)}` }, { ...response, expiresAt: NOW + 60001 }, { ...response, url: "https://outside.test" }, { ...response, capabilities: [...response.capabilities, response.capabilities[0]] }, { ...response, capabilities: response.capabilities.map(row => ({ ...row, target: "payments" })) }, { ...response, publishedCatalog: { available: true, revision: null } }]) expect(readResponse(value).ok).toBe(false);
  });
  test("ne transforme ni doublon de capacité ni lien refusé en droit d'ouverture", () => {
    const first = response.capabilities[0]!;
    expect(readResponse({ ...response, capabilities: response.capabilities.map(() => first) }).ok).toBe(false);
    expect(readResponse({ ...response, capabilities: response.capabilities.map(row => ({ ...row, canOpen: false })) }).ok).toBe(false);
    expect(readResponse({ ...response, outcome: "refused", reason: "access_denied" }).ok).toBe(false);
    expect(readResponse({ contract: response.contract, version: 1, requestId: request.requestId, requestSha256: HASH, outcome: "refused", reason: "access_denied" }).ok).toBe(true);
  });
  test("sépare la preuve privée du catalogue, du sujet acheteur et de tout port d'écriture", () => {
    const input = { bodySha256: HASH, environment: "sandbox" as const, issuedAtMs: NOW, keyId: "merchant-test-key", nonce: "n".repeat(32), operation: "merchant.preparation.read" as const, source: "antsia" };
    expect(commerceMerchantReadSigningInput(input)).toContain("pro-ga-commerce-merchant-read-hmac/v1");
    expect(commerceMerchantReadSigningInput({ ...input, operation: "service.order.request" as typeof input.operation })).toBeNull();
  });
});
