/** CH-817 — l'état de la porte des comptes de démonstration et ses empreintes. */
import { DEMO_GATE_CHALLENGE_ID_PATTERN, DEMO_GATE_PHONE_PATTERN, DEMO_GATE_TOKEN_PATTERN, normalizeDemoGatePhone } from "@antsia/social-contracts/demoGate"
import { describe, expect, it } from "vitest"

import { isE164Phone } from "../betterAuth/settings"
import { demoGateCodeMaterial, demoGateDigest, demoGateSecret, demoGateState, digestsEqual, randomOpaqueId } from "./demoGate"

// Valeurs FICTIVES (nom de déploiement d'exemple, domaine réservé `.test`).
const DEMO = { CONVEX_CLOUD_URL: "https://demo-antsia-123.convex.cloud", ANTSIA_DEMO_DEPLOYMENT: "demo-antsia-123" }
const LOCAL = { CONVEX_CLOUD_URL: "http://127.0.0.1:3210", ANTSIA_DEV_TOOLS: "true" }
const PRODUCTION = { CONVEX_CLOUD_URL: "https://production-antsia-456.convex.cloud" }
const SECRET = "fictional-demo-gate-secret-0123456789abcdef"
const WHATSAPP = {
  WHATSAPP_PROVIDER: "bird",
  WHATSAPP_ENDPOINT: "https://whatsapp.example.test/messages",
  WHATSAPP_API_KEY: "fictional-access-key-0123456789",
  WHATSAPP_TEMPLATE: "fictional-project:fictional-version",
}

describe("demoGateState — quatre états, fermé par défaut", () => {
  it("closed : comptes de démonstration fermés ici, quoi que disent le secret et WhatsApp", () => {
    expect(demoGateState({})).toBe("closed")
    expect(demoGateState({ ...PRODUCTION, ANTSIA_DEMO_GATE_SECRET: SECRET, ...WHATSAPP })).toBe("closed")
    // Une déclaration de démonstration recopiée sur un autre déploiement n'ouvre rien.
    expect(demoGateState({ ...PRODUCTION, ANTSIA_DEMO_DEPLOYMENT: "demo-antsia-123", ANTSIA_DEMO_GATE_SECRET: SECRET, ...WHATSAPP })).toBe("closed")
  })

  it("open : comptes ouverts, secret absent — le comportement d'avant la porte", () => {
    expect(demoGateState(DEMO)).toBe("open")
    expect(demoGateState(LOCAL)).toBe("open")
    expect(demoGateState({ ...DEMO, ANTSIA_DEMO_GATE_SECRET: "   ", ...WHATSAPP })).toBe("open")
  })

  it("unavailable : porte armée mais incomplète — secret trop court ou WhatsApp absent", () => {
    expect(demoGateState({ ...DEMO, ANTSIA_DEMO_GATE_SECRET: "trop-court", ...WHATSAPP })).toBe("unavailable")
    expect(demoGateState({ ...DEMO, ANTSIA_DEMO_GATE_SECRET: SECRET })).toBe("unavailable")
    expect(demoGateState({ ...DEMO, ANTSIA_DEMO_GATE_SECRET: SECRET, ...WHATSAPP, WHATSAPP_PROVIDER: "meta" })).toBe("unavailable")
    expect(demoGateState({ ...DEMO, ANTSIA_DEMO_GATE_SECRET: SECRET, ...WHATSAPP, WHATSAPP_ENDPOINT: "http://whatsapp.example.test/messages" })).toBe("unavailable")
  })

  it("gated : porte armée et complète", () => {
    expect(demoGateState({ ...DEMO, ANTSIA_DEMO_GATE_SECRET: SECRET, ...WHATSAPP })).toBe("gated")
    expect(demoGateState({ ...LOCAL, ANTSIA_DEMO_GATE_SECRET: SECRET, ...WHATSAPP })).toBe("gated")
  })

  it("le secret n'est utilisable qu'à 32 caractères au moins", () => {
    expect(demoGateSecret({ ANTSIA_DEMO_GATE_SECRET: SECRET })).toBe(SECRET)
    expect(demoGateSecret({ ANTSIA_DEMO_GATE_SECRET: ` ${SECRET} ` })).toBe(SECRET)
    expect(demoGateSecret({ ANTSIA_DEMO_GATE_SECRET: "x".repeat(31) })).toBeNull()
    expect(demoGateSecret({})).toBeNull()
  })
})

describe("empreintes — HMAC-SHA256, un usage par empreinte", () => {
  it("64 caractères hexadécimaux, stables, sans la valeur", async () => {
    const digest = await demoGateDigest(SECRET, "demo-gate-phone", "+447700900123")
    expect(digest).toMatch(/^[0-9a-f]{64}$/)
    expect(await demoGateDigest(SECRET, "demo-gate-phone", "+447700900123")).toBe(digest)
    expect(digest).not.toContain("447700900123")
  })

  it("liées au secret, à l'usage et à la valeur", async () => {
    const digest = await demoGateDigest(SECRET, "demo-gate-phone", "+447700900123")
    expect(await demoGateDigest(`${SECRET}-autre`, "demo-gate-phone", "+447700900123")).not.toBe(digest)
    expect(await demoGateDigest(SECRET, "demo-gate-ip", "+447700900123")).not.toBe(digest)
    expect(await demoGateDigest(SECRET, "demo-gate-phone", "+447700900124")).not.toBe(digest)
  })

  it("l'empreinte d'un code est liée au défi et au numéro", async () => {
    const base = await demoGateDigest(SECRET, "demo-gate-code", demoGateCodeMaterial("defi-a", "numero-a", "482913K"))
    expect(await demoGateDigest(SECRET, "demo-gate-code", demoGateCodeMaterial("defi-b", "numero-a", "482913K"))).not.toBe(base)
    expect(await demoGateDigest(SECRET, "demo-gate-code", demoGateCodeMaterial("defi-a", "numero-b", "482913K"))).not.toBe(base)
    expect(await demoGateDigest(SECRET, "demo-gate-code", demoGateCodeMaterial("defi-a", "numero-a", "482913L"))).not.toBe(base)
  })

  it("comparaison à temps constant", () => {
    expect(digestsEqual("abc", "abc")).toBe(true)
    expect(digestsEqual("abc", "abd")).toBe(false)
    expect(digestsEqual("abc", "abcd")).toBe(false)
    expect(digestsEqual("", "")).toBe(true)
  })
})

describe("identifiants opaques — base64url sans remplissage", () => {
  it("défi de 24 octets (32 caractères), jeton de 32 octets (43 caractères)", () => {
    expect(randomOpaqueId(24)).toMatch(DEMO_GATE_CHALLENGE_ID_PATTERN)
    expect(randomOpaqueId(32)).toMatch(DEMO_GATE_TOKEN_PATTERN)
    expect(randomOpaqueId(32)).not.toBe(randomOpaqueId(32))
  })

  it("alphabet base64url : « - » et « _ », jamais « + », « / » ni « = »", () => {
    expect(randomOpaqueId(2, () => new Uint8Array([0xfb, 0xff]))).toBe("-_8")
    expect(randomOpaqueId(3, () => new Uint8Array([0xff, 0xff, 0xfe]))).toBe("___-")
  })
})

describe("numéro — la règle partagée et celle du moteur s'accordent", () => {
  it("toute normalisation admise est un E.164 du moteur, et la même expression", () => {
    expect(DEMO_GATE_PHONE_PATTERN.source).toBe(/^\+[1-9]\d{7,14}$/.source)
    for (const input of ["+447700900123", "0044 7700 900123", "+33 6 39 98 00 01", "+24107890123", "+12025550123"]) {
      const normalized = normalizeDemoGatePhone(input)
      expect(normalized).not.toBeNull()
      expect(isE164Phone(normalized!)).toBe(true)
    }
    for (const phone of ["07890123", "0024107890123", "+00000000", "+123", "+1234567890123456"]) {
      expect(isE164Phone(phone)).toBe(DEMO_GATE_PHONE_PATTERN.test(phone))
    }
  })
})
