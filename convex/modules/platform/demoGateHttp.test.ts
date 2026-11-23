// @vitest-environment edge-runtime
/**
 * CH-817 — les deux routes de la porte des comptes de démonstration, par le VRAI routeur (`t.fetch`),
 * limiteur de débit compris ; seul le fournisseur WhatsApp est simulé (`fetch` remplacé).
 *
 * Ce qui est prouvé : 404 porte fermée ou non armée, 503 indisponible ; réponses IDENTIQUES (statut,
 * forme, durée plancher) pour un numéro autorisé, refusé et limité ; parcours complet du code reçu à
 * la session ; un défi consommé une fois ; un envoi manqué invalide le défi ; 400 pour une demande
 * mal formée ; 429 avec `Retry-After`, aussitôt, pour une adresse limitée (demande et vérification) ;
 * un fournisseur lent ne se voit pas au chronomètre (durée bornée par le HAUT, la même pour un numéro
 * hors liste : CH-817 E5, constat 3) ; CORS des seules origines de confiance ; rien en clair.
 */
import { DEMO_GATE_CHALLENGE_ID_PATTERN, DEMO_GATE_CODE_PATTERN, DEMO_GATE_PATHS, DEMO_GATE_TOKEN_PATTERN, formatDemoGateCode } from "@antsia/social-contracts/demoGate"
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from "vitest"

import { api, internal } from "../../_generated/api"
import { demoGateDigest } from "../../lib/demoGate"
import { rateLimiter } from "../../lib/rateLimit"
import { WHATSAPP_TIMEOUT_MS } from "../../lib/whatsappDelivery"
import { testConvex } from "../../test.setup"
import { demoGateSessionOf, DEMO_GATE_SESSION_TTL_MS } from "./demoGate"
import { DEMO_GATE_REQUEST_FLOOR_MS, DEMO_GATE_VERIFY_FLOOR_MS } from "./demoGateHttp"

// Valeurs FICTIVES : numéros de la plage réservée à la fiction (Ofcom, 07700 900xxx), domaine `.test`.
const PRIMARY_ORIGIN = "http://localhost:3030"
const FOREIGN_ORIGIN = "https://etranger.example.test"
const SECRET = "fictional-demo-gate-secret-0123456789abcdef"
const PHONE = "+447700900123"
const STRANGER = "+447700900456"
const SCOPE = "diaspora-ga"
const GATED_ENV: Record<string, string | undefined> = {
  SITE_URL: PRIMARY_ORIGIN,
  CONVEX_SITE_URL: "http://127.0.0.1:3211",
  CONVEX_CLOUD_URL: "http://127.0.0.1:3210",
  ANTSIA_DEV_TOOLS: "true",
  ANTSIA_DEMO_GATE_SECRET: SECRET,
  WHATSAPP_PROVIDER: "bird",
  WHATSAPP_ENDPOINT: "https://whatsapp.example.test/messages",
  WHATSAPP_API_KEY: "fictional-access-key-0123456789",
  WHATSAPP_TEMPLATE: "fictional-project:fictional-version",
  WHATSAPP_FROM: undefined,
  TRUSTED_ORIGINS: undefined,
  ANTSIA_DEMO_DEPLOYMENT: undefined,
}

type Sent = { to: string; code: string }
let sent: Sent[] = []
let provider: Mock<typeof fetch>
let providerStatus = 202

beforeEach(() => {
  for (const [key, value] of Object.entries(GATED_ENV)) vi.stubEnv(key, value)
  sent = []
  providerStatus = 202
  provider = vi.fn<typeof fetch>(async (_url, init) => {
    const body = JSON.parse(String(init?.body)) as { receiver: { contacts: { identifierValue: string }[] }; template: { parameters: { value: string }[] } }
    sent.push({ to: body.receiver.contacts[0]!.identifierValue, code: body.template.parameters[0]!.value })
    return new Response(JSON.stringify({ id: "message-fictif", status: "accepted" }), { status: providerStatus })
  })
  vi.stubGlobal("fetch", provider)
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

type T = ReturnType<typeof testConvex>

function post(t: T, path: string, body: unknown, headers: Record<string, string> = {}) {
  return t.fetch(path, { method: "POST", headers: { Origin: PRIMARY_ORIGIN, "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) })
}

async function timed(call: () => Promise<Response>): Promise<{ response: Response; body: Record<string, unknown>; elapsed: number }> {
  const startedAt = Date.now()
  const response = await call()
  const body = await response.json() as Record<string, unknown>
  return { response, body, elapsed: Date.now() - startedAt }
}

async function allow(t: T, phones = [PHONE]) {
  await t.mutation(internal.modules.platform.demoGate.allowPhones, { scope: SCOPE, phones })
}

const requestCode = (t: T, phone = PHONE, headers: Record<string, string> = {}) => timed(() => post(t, DEMO_GATE_PATHS.request, { scope: SCOPE, phone, locale: "fr" }, headers))
const verifyCode = (t: T, challengeId: unknown, code: unknown) => timed(() => post(t, DEMO_GATE_PATHS.verify, { scope: SCOPE, challengeId, code }))

describe("état de la porte — routes et configuration publique", () => {
  it("non armée (secret absent) : 404 sur les deux routes, « open » annoncé", async () => {
    vi.stubEnv("ANTSIA_DEMO_GATE_SECRET", undefined)
    const t = testConvex({ automaticSessions: false })
    expect((await post(t, DEMO_GATE_PATHS.request, { scope: SCOPE, phone: PHONE, locale: "fr" })).status).toBe(404)
    expect((await post(t, DEMO_GATE_PATHS.verify, { scope: SCOPE, challengeId: "x".repeat(32), code: "482913K" })).status).toBe(404)
    expect((await t.query(api.modules.platform.authentication.configuration, {})).demoGate).toBe("open")
    expect(provider).not.toHaveBeenCalled()
  })

  it("comptes de démonstration fermés (la production comprise) : 404, « closed » annoncé, même porte armée", async () => {
    vi.stubEnv("CONVEX_CLOUD_URL", "https://production-antsia-456.convex.cloud")
    vi.stubEnv("ANTSIA_DEV_TOOLS", undefined)
    const t = testConvex({ automaticSessions: false })
    const { response, body } = await requestCode(t)
    expect(response.status).toBe(404)
    expect(body).toEqual({ ok: false, error: "not_found" })
    expect((await t.query(api.modules.platform.authentication.configuration, {})).demoGate).toBe("closed")
    expect(provider).not.toHaveBeenCalled()
  })

  it("armée mais WhatsApp incomplet ou secret trop court : 503 pour tous, « unavailable » annoncé", async () => {
    vi.stubEnv("WHATSAPP_PROVIDER", undefined)
    const t = testConvex({ automaticSessions: false })
    expect((await requestCode(t)).response.status).toBe(503)
    expect((await verifyCode(t, "x".repeat(32), "482913K")).response.status).toBe(503)
    expect((await t.query(api.modules.platform.authentication.configuration, {})).demoGate).toBe("unavailable")
    vi.stubEnv("WHATSAPP_PROVIDER", "bird")
    vi.stubEnv("ANTSIA_DEMO_GATE_SECRET", "trop-court")
    expect((await requestCode(t)).response.status).toBe(503)
    vi.stubEnv("ANTSIA_DEMO_GATE_SECRET", SECRET)
    expect((await t.query(api.modules.platform.authentication.configuration, {})).demoGate).toBe("gated")
    expect(provider).not.toHaveBeenCalled()
  })
})

describe("demande — une seule réponse pour autorisé, refusé et limité", () => {
  it("même statut, même forme, même durée plancher ; un code ne part que vers un numéro de la liste, dans ses limites", async () => {
    const t = testConvex({ automaticSessions: false })
    await allow(t)
    const allowed = await requestCode(t)
    const refused = await requestCode(t, STRANGER)
    expect(sent).toHaveLength(1)
    await requestCode(t)
    await requestCode(t)
    expect(sent).toHaveLength(3)
    // Quatrième demande du quart d'heure pour ce numéro : limitée, rien ne part.
    const limited = await requestCode(t)
    expect(sent).toHaveLength(3)
    for (const { response, body, elapsed } of [allowed, refused, limited]) {
      expect(response.status).toBe(202)
      expect(Object.keys(body).sort()).toEqual(["challengeId", "expiresInSeconds", "ok"])
      expect(body.ok).toBe(true)
      expect(body.expiresInSeconds).toBe(300)
      expect(String(body.challengeId)).toMatch(DEMO_GATE_CHALLENGE_ID_PATTERN)
      expect(elapsed).toBeGreaterThanOrEqual(DEMO_GATE_REQUEST_FLOOR_MS - 10)
      expect(response.headers.get("access-control-allow-origin")).toBe(PRIMARY_ORIGIN)
    }
    expect(sent.every((message) => message.to === PHONE && DEMO_GATE_CODE_PATTERN.test(message.code))).toBe(true)
    // Les identifiants du refus et de la limite sont des leurres : jamais enregistrés.
    const challenges = await t.run((ctx) => ctx.db.query("demoGateChallenges").take(20))
    expect(challenges.map((row) => row.challengeId)).toContain(allowed.body.challengeId)
    expect(challenges.map((row) => row.challengeId)).not.toContain(refused.body.challengeId)
    expect(challenges.map((row) => row.challengeId)).not.toContain(limited.body.challengeId)
    // CH-817 E5 : les trois défis servis restent actifs (aucun ne remplace le précédent).
    expect(challenges.filter((row) => row.status === "active")).toHaveLength(3)
  }, 60_000)

  it("CH-817 E5, constat 3 : le délai d'envoi tient sous la durée plancher, avec une seconde de marge", () => {
    expect(WHATSAPP_TIMEOUT_MS + 1_000).toBeLessThanOrEqual(DEMO_GATE_REQUEST_FLOOR_MS)
  })

  it("CH-817 E5, constat 3 : fournisseur lent — durée bornée par le HAUT, la même pour un numéro hors liste", async () => {
    // Un fournisseur qui ne répond qu'au bout de quinze secondes, et que seul le délai d'envoi interrompt.
    provider.mockImplementation((_url, init) => new Promise<Response>((resolve, reject) => {
      const timer = setTimeout(() => resolve(new Response(JSON.stringify({ id: "message-fictif" }), { status: 202 })), 15_000)
      init?.signal?.addEventListener("abort", () => { clearTimeout(timer); reject(init.signal?.reason) }, { once: true })
    }))
    vi.spyOn(console, "warn").mockImplementation(() => undefined)
    const t = testConvex({ automaticSessions: false })
    await allow(t)
    const listed = await requestCode(t)
    const stranger = await requestCode(t, STRANGER)
    expect(provider).toHaveBeenCalledTimes(1)
    for (const { response, elapsed } of [listed, stranger]) {
      expect(response.status).toBe(202)
      expect(elapsed).toBeGreaterThanOrEqual(DEMO_GATE_REQUEST_FLOOR_MS - 10)
      expect(elapsed).toBeLessThanOrEqual(DEMO_GATE_REQUEST_FLOOR_MS + 300)
    }
    expect(Math.abs(listed.elapsed - stranger.elapsed)).toBeLessThan(300)
    // L'envoi interrompu invalide le défi : personne ne connaît un code jamais reçu.
    const row = await t.run((ctx) => ctx.db.query("demoGateChallenges").withIndex("by_challengeId", (q) => q.eq("challengeId", String(listed.body.challengeId))).first())
    expect(row?.status).toBe("delivery_failed")
  }, 40_000)

  it("CH-817 E5, constat 5 : adresse limitée — 429 aussitôt, sans plancher, `Retry-After` ; rien ne part", async () => {
    const t = testConvex({ automaticSessions: false })
    await allow(t)
    // Sans `x-forwarded-for`, l'adresse est la clé partagée `unknown` (fiche CH-817 § 2).
    const ipKeyHash = await demoGateDigest(SECRET, "demo-gate-ip", "unknown")
    await t.run(async (ctx) => { await rateLimiter.limit(ctx, "demoGate.request.ip", { key: ipKeyHash, count: 10 }) })
    for (const phone of [PHONE, STRANGER]) {
      const { response, body, elapsed } = await requestCode(t, phone)
      expect(response.status).toBe(429)
      expect(body.ok).toBe(false)
      expect(body.error).toBe("rate_limited")
      expect(Number(body.retryAfterMs)).toBeGreaterThan(0)
      expect(Number(response.headers.get("retry-after"))).toBeGreaterThanOrEqual(1)
      expect(response.headers.get("access-control-allow-origin")).toBe(PRIMARY_ORIGIN)
      expect(elapsed).toBeLessThan(500)
    }
    expect(provider).not.toHaveBeenCalled()
    expect(await t.run((ctx) => ctx.db.query("demoGateChallenges").take(5))).toEqual([])
  })
})

describe("vérification — du code reçu à la session", () => {
  it("le code reçu par WhatsApp (saisi en minuscules et espacé) ouvre une session de trente minutes, une seule fois ; rien en clair", async () => {
    const t = testConvex({ automaticSessions: false })
    await allow(t)
    const requested = await requestCode(t)
    const code = sent[0]!.code
    const challengeId = String(requested.body.challengeId)
    const wrong = await verifyCode(t, challengeId, code === "000000A" ? "000000B" : "000000A")
    expect(wrong.response.status).toBe(401)
    expect(wrong.body).toEqual({ ok: false, error: "invalid_or_expired" })
    expect(wrong.elapsed).toBeGreaterThanOrEqual(DEMO_GATE_VERIFY_FLOOR_MS - 10)

    const before = Date.now()
    const right = await verifyCode(t, challengeId, formatDemoGateCode(code).toLowerCase())
    expect(right.response.status).toBe(200)
    expect(right.response.headers.get("access-control-allow-origin")).toBe(PRIMARY_ORIGIN)
    expect(right.response.headers.get("cache-control")).toBe("no-store")
    expect(String(right.body.token)).toMatch(DEMO_GATE_TOKEN_PATTERN)
    expect(Number(right.body.expiresAt)).toBeGreaterThanOrEqual(before + DEMO_GATE_SESSION_TTL_MS)
    expect(Number(right.body.expiresAt)).toBeLessThanOrEqual(Date.now() + DEMO_GATE_SESSION_TTL_MS)

    // Le défi est consommé : le même code ne rouvre rien.
    expect((await verifyCode(t, challengeId, code)).response.status).toBe(401)
    const token = String(right.body.token)
    expect(await t.run((ctx) => demoGateSessionOf(ctx, { scope: SCOPE, token }))).toEqual({ expiresAt: right.body.expiresAt })

    const dump = JSON.stringify(await t.run(async (ctx) => ({
      allowlist: await ctx.db.query("demoGateAllowlist").take(20),
      challenges: await ctx.db.query("demoGateChallenges").take(20),
      sessions: await ctx.db.query("demoGateSessions").take(20),
      audit: await ctx.db.query("engineAudit").take(20),
    })))
    for (const secret of ["447700900123", code, token, SECRET]) expect(dump).not.toContain(secret)
  }, 30_000)

  it("un défi inconnu (leurre) reçoit la même réponse qu'un code faux, après la même durée plancher", async () => {
    const t = testConvex({ automaticSessions: false })
    const decoy = await verifyCode(t, "D".repeat(32), "482913K")
    expect(decoy.response.status).toBe(401)
    expect(decoy.body).toEqual({ ok: false, error: "invalid_or_expired" })
    expect(decoy.elapsed).toBeGreaterThanOrEqual(DEMO_GATE_VERIFY_FLOOR_MS - 10)
  })

  it("un envoi manqué invalide le défi sans changer la réponse ; le journal n'en dit que la raison", async () => {
    providerStatus = 500
    const warnings = vi.spyOn(console, "warn").mockImplementation(() => undefined)
    const t = testConvex({ automaticSessions: false })
    await allow(t)
    const requested = await requestCode(t)
    expect(requested.response.status).toBe(202)
    expect(Object.keys(requested.body).sort()).toEqual(["challengeId", "expiresInSeconds", "ok"])
    const code = sent[0]!.code
    const row = await t.run((ctx) => ctx.db.query("demoGateChallenges").withIndex("by_challengeId", (q) => q.eq("challengeId", String(requested.body.challengeId))).first())
    expect(row?.status).toBe("delivery_failed")
    expect((await verifyCode(t, requested.body.challengeId, code)).response.status).toBe(401)
    expect(warnings).toHaveBeenCalledTimes(1)
    const logged = JSON.stringify(warnings.mock.calls)
    expect(logged).toContain("refused")
    for (const secret of ["447700900123", code]) expect(logged).not.toContain(secret)
  }, 30_000)

  it("au-delà du seau de l'adresse : 429, `retryAfterMs` et `Retry-After` lisibles d'une origine de confiance", async () => {
    const t = testConvex({ automaticSessions: false })
    // Sans `x-forwarded-for`, l'adresse est la clé partagée `unknown` (fiche CH-817 § 2).
    const ipKeyHash = await demoGateDigest(SECRET, "demo-gate-ip", "unknown")
    await t.run(async (ctx) => { await rateLimiter.limit(ctx, "demoGate.verify.ip", { key: ipKeyHash, count: 20 }) })
    const { response, body, elapsed } = await verifyCode(t, "D".repeat(32), "482913K")
    expect(response.status).toBe(429)
    // Aussitôt, sans la durée plancher d'une seconde.
    expect(elapsed).toBeLessThan(500)
    expect(body.ok).toBe(false)
    expect(body.error).toBe("rate_limited")
    expect(Number(body.retryAfterMs)).toBeGreaterThan(0)
    expect(Number(response.headers.get("retry-after"))).toBeGreaterThanOrEqual(1)
    expect(response.headers.get("access-control-expose-headers")).toContain("Retry-After")
    // Une autre adresse (dernière entrée de `x-forwarded-for`) garde son propre seau.
    const other = await timed(() => post(t, DEMO_GATE_PATHS.verify, { scope: SCOPE, challengeId: "D".repeat(32), code: "482913K" }, { "x-forwarded-for": "203.0.113.200, 198.51.100.7" }))
    expect(other.response.status).toBe(401)
  })
})

describe("demandes mal formées, CORS", () => {
  it("400 sans attendre : `Content-Type` non JSON, champ manquant, numéro national, portée ou langue inconnue, corps démesuré, code ou défi hors forme", async () => {
    const t = testConvex({ automaticSessions: false })
    const cases: [string, unknown, Record<string, string>?][] = [
      [DEMO_GATE_PATHS.request, { scope: SCOPE, phone: PHONE, locale: "fr" }, { "Content-Type": "text/plain" }],
      [DEMO_GATE_PATHS.request, { scope: SCOPE, locale: "fr" }],
      [DEMO_GATE_PATHS.request, { scope: SCOPE, phone: "07700 900123", locale: "fr" }],
      [DEMO_GATE_PATHS.request, { scope: "antsia", phone: PHONE, locale: "fr" }],
      [DEMO_GATE_PATHS.request, { scope: SCOPE, phone: PHONE, locale: "de" }],
      [DEMO_GATE_PATHS.request, { scope: SCOPE, phone: PHONE, locale: "fr", padding: "x".repeat(2_000) }],
      [DEMO_GATE_PATHS.request, [SCOPE, PHONE]],
      [DEMO_GATE_PATHS.verify, { scope: SCOPE, challengeId: "court", code: "482913K" }],
      [DEMO_GATE_PATHS.verify, { scope: SCOPE, challengeId: "D".repeat(32), code: "482913" }],
      [DEMO_GATE_PATHS.verify, { scope: SCOPE, challengeId: "D".repeat(32), code: "482913I" }],
    ]
    for (const [path, body, headers] of cases) {
      const { response, body: answer, elapsed } = await timed(() => post(t, path, body, headers))
      expect(response.status).toBe(400)
      expect(answer).toEqual({ ok: false, error: "invalid_request" })
      expect(elapsed).toBeLessThan(DEMO_GATE_VERIFY_FLOOR_MS)
    }
    expect(provider).not.toHaveBeenCalled()
  })

  it("pré-vérification : en-têtes pour une origine de confiance seulement", async () => {
    const t = testConvex({ automaticSessions: false })
    for (const path of [DEMO_GATE_PATHS.request, DEMO_GATE_PATHS.verify]) {
      const trusted = await t.fetch(path, { method: "OPTIONS", headers: { Origin: PRIMARY_ORIGIN, "Access-Control-Request-Method": "POST" } })
      expect(trusted.status).toBe(204)
      expect(trusted.headers.get("access-control-allow-origin")).toBe(PRIMARY_ORIGIN)
      expect(trusted.headers.get("access-control-allow-headers")).toContain("Content-Type")
      const foreign = await t.fetch(path, { method: "OPTIONS", headers: { Origin: FOREIGN_ORIGIN, "Access-Control-Request-Method": "POST" } })
      expect(foreign.headers.get("access-control-allow-origin")).toBeNull()
    }
    const foreignPost = await post(t, DEMO_GATE_PATHS.request, { scope: SCOPE }, { Origin: FOREIGN_ORIGIN })
    expect(foreignPost.headers.get("access-control-allow-origin")).toBeNull()
  })
})
