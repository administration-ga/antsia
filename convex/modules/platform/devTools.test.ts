// @vitest-environment edge-runtime
/**
 * CH-817 E3 — le verrou réel de la porte des comptes de démonstration : le code affiché
 * (`devTools.latestOtp`). Porte armée, le code d'une adresse réservée de DIASPORA.GA ne se lit
 * qu'avec une session de porte valide ; les adresses de la racine et le développement local
 * (porte non armée) se lisent comme avant ; la production reste fermée.
 */
import { afterEach, describe, expect, it, vi } from "vitest"

import { api, internal } from "../../_generated/api"
import { demoGateDigest } from "../../lib/demoGate"
import { testConvex } from "../../test.setup"
import { admitRequestImpl, allowPhonesImpl, completeVerifyImpl, DEMO_GATE_SESSION_TTL_MS, revokePhonesImpl } from "./demoGate"
import { demoGateAdmission, demoGateScopeOfEmail } from "./devTools"

// Valeurs FICTIVES : numéro de la plage réservée à la fiction (Ofcom, 07700 900xxx), domaine `.test`.
const SECRET = "fictional-demo-gate-secret-0123456789abcdef"
const WHATSAPP = {
  WHATSAPP_PROVIDER: "bird",
  WHATSAPP_ENDPOINT: "https://whatsapp.example.test/messages",
  WHATSAPP_API_KEY: "fictional-access-key-0123456789",
  WHATSAPP_TEMPLATE: "fictional-project:fictional-version",
}
const DEMO = { CONVEX_CLOUD_URL: "https://demo-antsia-123.convex.cloud", ANTSIA_DEMO_DEPLOYMENT: "demo-antsia-123" }
const LOCAL = { CONVEX_CLOUD_URL: "http://127.0.0.1:3210", ANTSIA_DEV_TOOLS: "true" }
const GATED = { ...DEMO, ANTSIA_DEMO_GATE_SECRET: SECRET, ...WHATSAPP }
const PRODUCTION = { ...GATED, CONVEX_CLOUD_URL: "https://production-antsia-456.convex.cloud" }
const PHONE = "+447700900123"
const TOKEN = "fictional_session_token_0123456789abcdefABC"
const SCOPE = "diaspora-ga" as const

const DIASPORA_GA_EMAIL = "verifie@demo.diaspora-ga.test"
const ROOT_EMAIL = "membre@demo.antsia.test"
const ORDINARY_EMAIL = "alice@example.test"

type T = ReturnType<typeof testConvex>
type Env = Record<string, string | undefined>

const ENV_KEYS = ["CONVEX_CLOUD_URL", "ANTSIA_DEV_TOOLS", "ANTIA_DEV_TOOLS", "ANTSIA_DEMO_DEPLOYMENT", "ANTSIA_DEMO_GATE_SECRET", ...Object.keys(WHATSAPP), "WHATSAPP_FROM"]

/** L'environnement du déploiement, ENTIER : une variable absente d'ici est absente, quoi qu'ait posé le shell qui lance les tests. */
function useEnv(env: Env) {
  for (const key of ENV_KEYS) vi.stubEnv(key, env[key])
}

afterEach(() => {
  vi.unstubAllEnvs()
})

/** Le code de chaque adresse, enregistré comme l'envoi de Better Auth le ferait (seulement là où il est lisible). */
async function recordCodes(t: T, emails: readonly string[], expiresAt = Date.now() + 300_000) {
  for (const [index, email] of emails.entries()) {
    await t.mutation(internal.modules.platform.devTools.recordOtp, { email, code: `${100_000 + index}`, expiresAt })
  }
}

async function codeOf(t: T, email: string, gateToken?: string) {
  return await t.query(api.modules.platform.devTools.latestOtp, gateToken === undefined ? { email } : { email, gateToken })
}

/** Une session de porte ouverte par le vrai chemin du magasin, à l'instant `now` ; rend son échéance. */
async function openGateSession(t: T, now: number, label = "otp"): Promise<number> {
  await t.run((ctx) => allowPhonesImpl(ctx, { scope: SCOPE, phones: [PHONE] }, now, GATED))
  const challengeId = `${label}-challenge`.padEnd(32, "x")
  const codeDigest = await demoGateDigest(SECRET, "demo-gate-code", label)
  const phoneHash = await demoGateDigest(SECRET, "demo-gate-phone", PHONE)
  const tokenDigest = await demoGateDigest(SECRET, "demo-gate-session", TOKEN)
  expect(await t.run((ctx) => admitRequestImpl(ctx, { scope: SCOPE, phoneHash, ipKeyHash: "1".repeat(64), challengeId, codeDigest }, now))).toEqual({ deliver: true })
  const verified = await t.run((ctx) => completeVerifyImpl(ctx, { scope: SCOPE, challengeId, expectedCodeDigest: codeDigest, codeMatches: true, tokenDigest }, now))
  if (!verified.ok) throw new Error("session de porte de test non ouverte")
  return verified.expiresAt
}

describe("demoGateScopeOfEmail — la famille d'adresses que gouverne la porte de DIASPORA.GA", () => {
  it("la famille réservée de DIASPORA.GA, sans casse ni espaces ; jamais la racine, une sous-chaîne ou une autre adresse", () => {
    for (const email of [DIASPORA_GA_EMAIL, " Verifie@DEMO.Diaspora-GA.test ", "INSTITUTION@demo.diaspora-ga.test"]) expect(demoGateScopeOfEmail(email)).toBe("diaspora-ga")
    for (const email of [ROOT_EMAIL, ORDINARY_EMAIL, "verifie@xdemo.diaspora-ga.test", "verifie@demo.diaspora-ga.test.example.test", "demo.diaspora-ga.test@example.test", "+447700900123"]) {
      expect(demoGateScopeOfEmail(email)).toBeNull()
    }
  })
})

describe("latestOtp — porte non armée : rien ne change", () => {
  it("démonstration déclarée : les adresses réservées (ANTSIA et DIASPORA.GA), sans échéance ; un jeton présenté est ignoré", async () => {
    useEnv(DEMO)
    const t = testConvex({ automaticSessions: false })
    await recordCodes(t, [DIASPORA_GA_EMAIL, ROOT_EMAIL, ORDINARY_EMAIL])
    expect(await codeOf(t, DIASPORA_GA_EMAIL)).toEqual({ code: "100000", expiresAt: expect.any(Number) })
    expect(await codeOf(t, DIASPORA_GA_EMAIL, TOKEN)).toEqual({ code: "100000", expiresAt: expect.any(Number) })
    expect(await codeOf(t, ROOT_EMAIL)).toMatchObject({ code: "100001" })
    expect(await codeOf(t, ORDINARY_EMAIL)).toBeNull()
  })

  it("développement local : tous les codes, comme avant", async () => {
    useEnv(LOCAL)
    const t = testConvex({ automaticSessions: false })
    await recordCodes(t, [DIASPORA_GA_EMAIL, ORDINARY_EMAIL, "+447700900456"])
    expect(await codeOf(t, DIASPORA_GA_EMAIL)).toEqual({ code: "100000", expiresAt: expect.any(Number) })
    expect(await codeOf(t, ORDINARY_EMAIL)).toEqual({ code: "100001", expiresAt: expect.any(Number) })
    expect(await codeOf(t, "+447700900456")).toEqual({ code: "100002", expiresAt: expect.any(Number) })
  })
})

describe("latestOtp — porte armée : le code d'une adresse de DIASPORA.GA exige une session de porte", () => {
  it("sans session valide, aucun code de DIASPORA.GA, même par une variante de l'adresse ; la racine se lit comme avant", async () => {
    useEnv(GATED)
    const t = testConvex({ automaticSessions: false })
    await recordCodes(t, [DIASPORA_GA_EMAIL, ROOT_EMAIL])
    for (const email of [DIASPORA_GA_EMAIL, " VERIFIE@Demo.Diaspora-GA.test ", "verifie@DEMO.DIASPORA-GA.TEST"]) {
      expect(await codeOf(t, email)).toBeNull()
      for (const gateToken of [TOKEN, "x".repeat(43), "", "hors forme"]) expect(await codeOf(t, email, gateToken)).toBeNull()
    }
    // Les comptes de démonstration de la racine ne relèvent pas de cette porte.
    expect(await codeOf(t, ROOT_EMAIL)).toEqual({ code: "100001", expiresAt: expect.any(Number) })
  })

  it("session valide : le code se lit, avec l'échéance de la session ; jamais le jeton", async () => {
    useEnv(GATED)
    const t = testConvex({ automaticSessions: false })
    await recordCodes(t, [DIASPORA_GA_EMAIL])
    const sessionExpiresAt = await openGateSession(t, Date.now())
    const answer = await codeOf(t, DIASPORA_GA_EMAIL, TOKEN)
    expect(answer).toEqual({ code: "100000", expiresAt: expect.any(Number), gateExpiresAt: sessionExpiresAt })
    expect(JSON.stringify(answer)).not.toContain(TOKEN)
    // La même adresse, écrite autrement : la même règle, le même code.
    expect(await codeOf(t, " Verifie@DEMO.diaspora-ga.test ", TOKEN)).toMatchObject({ code: "100000", gateExpiresAt: sessionExpiresAt })
    // La session ne se devine pas et ne se transmet pas sans son jeton.
    expect(await codeOf(t, DIASPORA_GA_EMAIL)).toBeNull()
    expect(await codeOf(t, DIASPORA_GA_EMAIL, TOKEN.toLowerCase())).toBeNull()
  })

  it("une session échue, retirée de la liste ou ouverte sous un autre secret ferme le code", async () => {
    useEnv(GATED)
    const expired = testConvex({ automaticSessions: false })
    await recordCodes(expired, [DIASPORA_GA_EMAIL])
    await openGateSession(expired, Date.now() - DEMO_GATE_SESSION_TTL_MS - 1_000)
    expect(await codeOf(expired, DIASPORA_GA_EMAIL, TOKEN)).toBeNull()

    const revoked = testConvex({ automaticSessions: false })
    await recordCodes(revoked, [DIASPORA_GA_EMAIL])
    await openGateSession(revoked, Date.now())
    expect(await codeOf(revoked, DIASPORA_GA_EMAIL, TOKEN)).toMatchObject({ code: "100000" })
    await revoked.run((ctx) => revokePhonesImpl(ctx, { scope: SCOPE, phones: [PHONE] }, Date.now(), GATED))
    expect(await codeOf(revoked, DIASPORA_GA_EMAIL, TOKEN)).toBeNull()

    const rotated = testConvex({ automaticSessions: false })
    await recordCodes(rotated, [DIASPORA_GA_EMAIL])
    await openGateSession(rotated, Date.now())
    vi.stubEnv("ANTSIA_DEMO_GATE_SECRET", `${SECRET}-renouvele`)
    expect(await codeOf(rotated, DIASPORA_GA_EMAIL, TOKEN)).toBeNull()
  })

  it("porte indisponible (secret trop court, ou envoi WhatsApp non configuré) : aucun code de DIASPORA.GA, session comprise ; la racine inchangée", async () => {
    useEnv(GATED)
    const t = testConvex({ automaticSessions: false })
    await recordCodes(t, [DIASPORA_GA_EMAIL, ROOT_EMAIL])
    await openGateSession(t, Date.now())
    expect(await codeOf(t, DIASPORA_GA_EMAIL, TOKEN)).toMatchObject({ code: "100000" })
    useEnv({ ...GATED, WHATSAPP_PROVIDER: undefined })
    expect(await codeOf(t, DIASPORA_GA_EMAIL, TOKEN)).toBeNull()
    expect(await codeOf(t, ROOT_EMAIL)).toMatchObject({ code: "100001" })
    useEnv({ ...GATED, ANTSIA_DEMO_GATE_SECRET: "trop-court" })
    expect(await codeOf(t, DIASPORA_GA_EMAIL, TOKEN)).toBeNull()
    expect(await codeOf(t, ROOT_EMAIL)).toMatchObject({ code: "100001" })
  })

  it("développement local, porte armée : la famille de DIASPORA.GA suit la porte, toute autre adresse se lit comme avant", async () => {
    useEnv({ ...LOCAL, ANTSIA_DEMO_GATE_SECRET: SECRET, ...WHATSAPP })
    const t = testConvex({ automaticSessions: false })
    await recordCodes(t, [DIASPORA_GA_EMAIL, ORDINARY_EMAIL, ROOT_EMAIL])
    expect(await codeOf(t, DIASPORA_GA_EMAIL)).toBeNull()
    expect(await codeOf(t, ORDINARY_EMAIL)).toMatchObject({ code: "100001" })
    expect(await codeOf(t, ROOT_EMAIL)).toMatchObject({ code: "100002" })
  })
})

describe("latestOtp — production : fermé, quoi qu'on présente", () => {
  it("aucun code, même s'il en existait un et qu'une session de porte valait ailleurs", async () => {
    useEnv(GATED)
    const t = testConvex({ automaticSessions: false })
    await recordCodes(t, [DIASPORA_GA_EMAIL, ROOT_EMAIL])
    await openGateSession(t, Date.now())
    useEnv(PRODUCTION)
    expect(await codeOf(t, DIASPORA_GA_EMAIL, TOKEN)).toBeNull()
    expect(await codeOf(t, DIASPORA_GA_EMAIL)).toBeNull()
    expect(await codeOf(t, ROOT_EMAIL)).toBeNull()
  })
})

describe("demoGateAdmission — la règle de `demoGateAdmits`, avec l'échéance de la session", () => {
  it("non armée : admise sans échéance ; armée : session valide seulement ; fermée ou indisponible : refusée", async () => {
    const t = testConvex({ automaticSessions: false })
    const now = Date.now()
    const expiresAt = await openGateSession(t, now)
    const admission = (env: Env, token?: string) => t.run((ctx) => demoGateAdmission(ctx, SCOPE, token, { env, now: now + 1 }))
    expect(await admission(DEMO)).toEqual({ admitted: true, sessionExpiresAt: null })
    expect(await admission(DEMO, TOKEN)).toEqual({ admitted: true, sessionExpiresAt: null })
    expect(await admission(GATED)).toEqual({ admitted: false })
    expect(await admission(GATED, TOKEN)).toEqual({ admitted: true, sessionExpiresAt: expiresAt })
    expect(await t.run((ctx) => demoGateAdmission(ctx, SCOPE, TOKEN, { env: GATED, now: expiresAt }))).toEqual({ admitted: false })
    expect(await admission({ ...GATED, WHATSAPP_PROVIDER: undefined }, TOKEN)).toEqual({ admitted: false })
    expect(await admission(PRODUCTION, TOKEN)).toEqual({ admitted: false })
    expect(await admission({}, TOKEN)).toEqual({ admitted: false })
  })
})
