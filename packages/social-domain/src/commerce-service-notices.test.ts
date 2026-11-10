import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { commerceCanonicalJson } from "./commerce/primitives";
import {
  COMMERCE_SERVICE_NOTICE_CONTRACT, COMMERCE_SERVICE_NOTICE_PROFILE,
  COMMERCE_SERVICE_NOTICE_BODY_MAX_BYTES, parseCommerceServiceNoticeBody,
} from "./commerce-service-notices";
const TWIN_URL = "../../../../PRO_GA/packages/pro-domain/src/commerce-service-notices.ts";
const LOCAL_URL = "./commerce-service-notices.ts";
const twin = new URL(TWIN_URL, import.meta.url);

// P19 / DP39 : scénarios écrits seulement ; aucune exécution dans cette reprise.
const now = 1_800_000_000_000;
const objectRef = "pro.ga:appointment:01JA00000000000000000000T1";
const input = () => ({
  contract: COMMERCE_SERVICE_NOTICE_CONTRACT, version: 1, eventId: "notice-00000001", objectRef,
  payload: { type: "service.followup.changed", environment: "sandbox",
    subjectRef: "antsia:sub:0123456789abcdef0123456789abcdef",
    shopRef: "pro.ga:structure:01JA00000000000000000000S1",
    originRequestId: "service-00000001", objectKind: "appointment", objectRef,
    revision: now, changedAt: now },
});
const body = (value: unknown) => commerceCanonicalJson(value)!;
const parse = (value: unknown) => parseCommerceServiceNoticeBody(body(value), now);

describe("signal privé neutre de suivi service", () => {
  it("admet un événement fermé et corrélé sans état métier", () => {
    const parsed = parse(input());
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.value.payload.objectKind).toBe("appointment");
      expect(Object.keys(parsed.value.payload).sort()).toEqual([
        "changedAt", "environment", "objectKind", "objectRef", "originRequestId",
        "revision", "shopRef", "subjectRef", "type",
      ]);
    }
    expect(COMMERCE_SERVICE_NOTICE_PROFILE).toBe("antsia-commerce-service-notice-v1");
  });
  it("garde les trois genres corrélés à leur référence propre", () => {
    for (const kind of ["appointment", "quote", "order"]) {
      const value = input();
      const ref = "pro.ga:" + kind + ":01JA00000000000000000000T1";
      value.objectRef = ref; value.payload.objectKind = kind; value.payload.objectRef = ref;
      expect(parse(value).ok).toBe(true);
    }
    const mismatch = input(); mismatch.payload.objectKind = "order";
    expect(parse(mismatch).ok).toBe(false);
  });
  it("rejette toute différence entre référence de transport et objet signalé", () => {
    const value = input(); value.objectRef = "pro.ga:appointment:01JA00000000000000000000T2";
    expect(parse(value).ok).toBe(false);
  });
  it("ne devient jamais une projection publique ou un état de paiement", () => {
    expect(parse({ ...input(), contract: "PRO-COMMERCE-PUBLIC-V1" }).ok).toBe(false);
    for (const field of ["state", "amount", "displayName", "email", "authVerifiedAt", "snapshot", "sessionId", "networkId"]) {
      const value = input();
      expect(parse({ ...value, payload: { ...value.payload, [field]: "forbidden" } }).ok).toBe(false);
    }
  });
  it("refuse aussi les clés étrangères de l'enveloppe", () => {
    expect(parse({ ...input(), subjectRef: input().payload.subjectRef }).ok).toBe(false);
    expect(parse({ ...input(), version: 2 }).ok).toBe(false);
  });
  it("exige un sujet opaque et une structure, jamais une identité ou un handle", () => {
    const value = input();
    for (const subjectRef of ["person@example.invalid", "@recette", "antsia:shop:0123456789abcdef0123456789abcdef"]) {
      expect(parse({ ...value, payload: { ...value.payload, subjectRef } }).ok).toBe(false);
    }
    expect(parse({ ...value, payload: { ...value.payload, shopRef: objectRef } }).ok).toBe(false);
  });
  it("refuse les demandes non opaques, environnements étrangers et révisions invalides", () => {
    const value = input();
    for (const originRequestId of ["short", "with/slash", ""]) {
      expect(parse({ ...value, payload: { ...value.payload, originRequestId } }).ok).toBe(false);
    }
    expect(parse({ ...value, payload: { ...value.payload, environment: "staging" } }).ok).toBe(false);
    for (const revision of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      expect(parse({ ...value, payload: { ...value.payload, revision } }).ok).toBe(false);
    }
  });
  it("accepte un suivi retardé, sans inventer une session récente", () => {
    const value = input();
    expect(parse({ ...value, payload: { ...value.payload, changedAt: now - 30 * 86_400_000 } }).ok).toBe(true);
    expect(parse({ ...value, payload: { ...value.payload, changedAt: now + 300_001 } }).ok).toBe(false);
    expect(parseCommerceServiceNoticeBody(body(value), Number.NaN).ok).toBe(false);
  });
  it("exige les octets canoniques et la borne fermée de transport", () => {
    expect(parseCommerceServiceNoticeBody(JSON.stringify(input(), null, 2), now).ok).toBe(false);
    expect(parseCommerceServiceNoticeBody("x".repeat(COMMERCE_SERVICE_NOTICE_BODY_MAX_BYTES + 1), now).ok).toBe(false);
  });
  // Comme les autres jumeaux : comparé quand le dépôt voisin porte le fichier, sauté sinon (export propre, CI).
  it.skipIf(!existsSync(twin))("conserve le nouveau contrat jumeau sans modifier le manifeste P06", () => {
    expect(readFileSync(twin, "utf8"))
      .toBe(readFileSync(new URL(LOCAL_URL, import.meta.url), "utf8"));
  });
});

