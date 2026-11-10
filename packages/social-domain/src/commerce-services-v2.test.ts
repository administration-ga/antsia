import { describe, expect, it } from "vitest";
import { commerceCanonicalJson } from "./commerce/primitives";
import {
  COMMERCE_SERVICE_CONSENTS, COMMERCE_SERVICE_CONTROL_CONTRACT, COMMERCE_SERVICE_CONTROL_CONTRACT_V2,
  commerceServiceControlPath, commerceServiceControlScope, commerceServiceControlSigningInput,
  parseCommerceServiceControlRequest, parseCommerceServiceControlResponse, type CommerceServiceControlRequest,
} from "./commerce-services";

const NOW = 1_800_000_000_000, QUOTE = "pro.ga:quote:01JA00000000000000000000Q1", SHOP = "pro.ga:structure:01JA00000000000000000000S1", DIGEST = "a".repeat(64);
const ctx = { environment: "sandbox" as const, source: "antsia", nowMs: NOW };
const json = (value: unknown) => commerceCanonicalJson(value)!;
const request = (): Extract<CommerceServiceControlRequest, { operation: "service.quote.reject" }> => ({ contract: COMMERCE_SERVICE_CONTROL_CONTRACT_V2, version: 1 as const, operation: "service.quote.reject" as const, source: "antsia", environment: "sandbox" as const,
  requestId: "service-reject-00000001", shopRef: SHOP, subject: { kind: "buyer" as const, ref: `antsia:sub:${"a".repeat(26)}`, authVerifiedAt: NOW }, issuedAt: NOW, expiresAt: NOW + 60_000,
  payload: { quoteRef: QUOTE, quoteVersion: 2, consent: { ...COMMERCE_SERVICE_CONSENTS.quote_rejection, givenAt: NOW } } });
const accepted = (sent: CommerceServiceControlRequest, result: unknown) => json({ contract: sent.contract, version: 1, requestId: sent.requestId, requestSha256: DIGEST, respondedAt: NOW, outcome: "accepted", result });
const parseReply = (sent: CommerceServiceControlRequest, raw: string) => parseCommerceServiceControlResponse(raw, { nowMs: NOW, request: sent, requestSha256: DIGEST });
const summary = () => ({ acceptable: true, clientAcceptance: null, current: true, inquiryRef: null, quoteRef: QUOTE, reference: "DEV-2026-0001", sentAt: NOW - 1000,
  state: "sent", title: "Création graphique", total: { amount: 40000, currency: "XAF" }, validUntil: NOW + 86_400_000, version: 2 });

describe("MP06 — contrôle services V2 fermé et V1 conservé", () => {
  it("exige l'opt-in explicite du lecteur et conserve l'enveloppe version1", () => {
    const sent = request(), raw = json(sent);
    expect(parseCommerceServiceControlRequest(raw, ctx).ok).toBe(false);
    expect(parseCommerceServiceControlRequest(raw, { ...ctx, contract: COMMERCE_SERVICE_CONTROL_CONTRACT_V2 })).toEqual({ ok: true, value: sent });
    expect(parseCommerceServiceControlRequest(json({ ...sent, version: 2 }), { ...ctx, contract: COMMERCE_SERVICE_CONTROL_CONTRACT_V2 }).ok).toBe(false);
    expect(parseCommerceServiceControlRequest(json({ ...sent, contract: COMMERCE_SERVICE_CONTROL_CONTRACT }), ctx).ok).toBe(false);
  });
  it("sépare chemins, scope et signature sans changer les octets V1", () => {
    const input = { bodySha256: DIGEST, environment: "sandbox" as const, issuedAtMs: NOW, keyId: "antsia-key-test", nonce: "n".repeat(43), operation: "quote.read" as const, source: "antsia" };
    expect(commerceServiceControlSigningInput(input)).toBe(commerceServiceControlSigningInput({ ...input, contract: COMMERCE_SERVICE_CONTROL_CONTRACT }));
    expect(commerceServiceControlSigningInput({ ...input, contract: COMMERCE_SERVICE_CONTROL_CONTRACT_V2 })).toContain("pro-ga-commerce-service-control-hmac/v2");
    expect(commerceServiceControlSigningInput({ ...input, operation: "service.quote.reject" })).toBeNull();
    expect(commerceServiceControlPath("quote.read")).toBe("/commerce/v1/services/quotes/read");
    expect(commerceServiceControlPath("service.quote.reject")).toBeNull();
    expect(commerceServiceControlPath("service.quote.reject", COMMERCE_SERVICE_CONTROL_CONTRACT_V2)).toBe("/commerce/v2/services/quotes/reject");
    expect(commerceServiceControlScope("service.quote.reject", COMMERCE_SERVICE_CONTROL_CONTRACT_V2)).toBe("commerce.quote.reject");
  });
  it("refuse champs étrangers, sujet vendeur et consentement d'une autre finalité", () => {
    const sent = request(), context = { ...ctx, contract: COMMERCE_SERVICE_CONTROL_CONTRACT_V2 } as const;
    for (const payload of [{ ...sent.payload, employeeReason: "note" }, { ...sent.payload, quoteVersion: 0 }, { ...sent.payload, consent: { ...sent.payload.consent, purpose: "commerce_quote_acceptance" } }]) expect(parseCommerceServiceControlRequest(json({ ...sent, payload }), context).ok).toBe(false);
    expect(parseCommerceServiceControlRequest(json({ ...sent, subject: { ...sent.subject, kind: "seller_operator" } }), context).ok).toBe(false);
  });
  it("corrèle la réponse de refus au contrat, devis, version et horloge", () => {
    const sent = request(), result = { quoteRef: QUOTE, quoteVersion: 2, state: "rejected", rejectedAt: NOW };
    expect(parseReply(sent, accepted(sent, result)).ok).toBe(true);
    for (const invalid of [{ ...result, quoteVersion: 3 }, { ...result, state: "accepted" }, { ...result, rejectedAt: NOW + 1 }, { ...result, clientName: "privé" }]) expect(parseReply(sent, accepted(sent, invalid)).ok).toBe(false);
    expect(parseReply(sent, json({ ...JSON.parse(accepted(sent, result)), contract: COMMERCE_SERVICE_CONTROL_CONTRACT })).ok).toBe(false);
  });
  it("la vue V2 exige son signal explicite, V1 refuse ces champs ajoutés", () => {
    const sent: Extract<CommerceServiceControlRequest, { operation: "quote.read" }> = { ...request(), operation: "quote.read", payload: { quoteRef: QUOTE } };
    const detail = { ...summary(), lines: [{ label: "Prestation", quantity: 1, unitAmount: { amount: 40000, currency: "XAF" }, lineAmount: { amount: 40000, currency: "XAF" } }], notes: null, sellerLabel: "Atelier" };
    const enriched = { ...detail, rejectable: true, clientRejection: null };
    expect(parseReply(sent, accepted(sent, { quote: enriched })).ok).toBe(true);
    expect(parseReply(sent, accepted(sent, { quote: detail })).ok).toBe(false);
    const legacy: Extract<CommerceServiceControlRequest, { operation: "quote.read" }> = { ...sent, contract: COMMERCE_SERVICE_CONTROL_CONTRACT };
    expect(parseReply(legacy, accepted(legacy, { quote: detail })).ok).toBe(true);
    expect(parseReply(legacy, accepted(legacy, { quote: enriched })).ok).toBe(false);
  });
  it("un signal rejetable incohérent ne devient jamais une permission client", () => {
    const sent: Extract<CommerceServiceControlRequest, { operation: "quote.list" }> = { ...request(), operation: "quote.list", payload: {} }, base = { ...summary(), rejectable: true, clientRejection: null };
    for (const quote of [{ ...base, current: false }, { ...base, acceptable: false, state: "accepted" }, { ...base, validUntil: NOW }, { ...base, clientRejection: { quoteVersion: 2, rejectedAt: NOW } }]) expect(parseReply(sent, accepted(sent, { quotes: [quote], truncated: false })).ok).toBe(false);
    const rejected = { ...base, acceptable: false, rejectable: false, state: "rejected", clientRejection: { quoteVersion: 2, rejectedAt: NOW } };
    expect(parseReply(sent, accepted(sent, { quotes: [rejected], truncated: false })).ok).toBe(true);
    expect(parseReply(sent, accepted(sent, { quotes: [{ ...rejected, clientRejection: { quoteVersion: 1, rejectedAt: NOW } }], truncated: false })).ok).toBe(false);
  });
  it("la reprise V2 ne vise que le nouveau geste, jamais une commande historique V1", () => {
    const sent = { ...request(), operation: "action.status", payload: { targetOperation: "service.quote.reject", targetRequestId: "service-reject-00000001", targetRequestSha256: DIGEST } };
    expect(parseCommerceServiceControlRequest(json(sent), { ...ctx, contract: COMMERCE_SERVICE_CONTROL_CONTRACT_V2 }).ok).toBe(true);
    expect(parseCommerceServiceControlRequest(json({ ...sent, contract: COMMERCE_SERVICE_CONTROL_CONTRACT }), ctx).ok).toBe(false);
    expect(parseCommerceServiceControlRequest(json({ ...sent, payload: { ...sent.payload, targetOperation: "service.order.request" } }), { ...ctx, contract: COMMERCE_SERVICE_CONTROL_CONTRACT_V2 }).ok).toBe(false);
  });
});
