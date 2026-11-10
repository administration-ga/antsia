// @vitest-environment edge-runtime
/** Gestionnaire réel et état OAuth serveur ; seul le fournisseur IDN est simulé. */
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { components } from "../_generated/api"
import { testConvex } from "../test.setup"

const ORIGIN = "http://localhost:3030"
const ISSUER = "https://native-idn.fixture.test"
const REDIRECT = "antsia-fixture://auth/idn"
const CALLBACK = `${ORIGIN}/api/auth/native/return`
const VERIFIER = "v".repeat(43)
const STATE = "s".repeat(43)
type T = ReturnType<typeof testConvex>

beforeEach(() => {
  vi.stubEnv("SITE_URL", ORIGIN)
  vi.stubEnv("CONVEX_SITE_URL", "http://127.0.0.1:3211")
  vi.stubEnv("CONVEX_CLOUD_URL", "http://127.0.0.1:3210")
  vi.stubEnv("ANTSIA_DEV_TOOLS", "true")
  vi.stubEnv("BETTER_AUTH_SECRET", "fictional-native-test-secret-at-least-thirty-two-characters")
  vi.stubEnv("IDN_CLIENT_ID", "fixture-client")
  vi.stubEnv("IDN_CLIENT_SECRET", "fictional-native-idn-secret")
  vi.stubEnv("IDN_ISSUER", ISSUER)
  vi.stubEnv("IDN_DISCOVERY_URL", undefined)
  vi.stubEnv("TRUSTED_ORIGINS", undefined)
  vi.stubEnv("NATIVE_AUTH_REDIRECT_URI", REDIRECT)
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    const json = (value: unknown) => new Response(JSON.stringify(value), { headers: { "Content-Type": "application/json" } })
    if (url.pathname.endsWith("/.well-known/openid-configuration")) return json({ issuer: ISSUER, authorization_endpoint: `${ISSUER}/authorize`, token_endpoint: `${ISSUER}/token`, userinfo_endpoint: `${ISSUER}/userinfo` })
    if (url.pathname === "/token") {
      const params = new URLSearchParams(String(init?.body ?? ""))
      expect(params.get("code_verifier")).toBeTruthy()
      expect(params.get("redirect_uri")).toBe(`${ORIGIN}/api/auth/oauth2/callback/idn`)
      return json({ access_token: "fixture-native-idn-access", token_type: "Bearer", expires_in: 3600 })
    }
    if (url.pathname === "/userinfo") return json({ sub: "fixture-native-idn-subject", email: "native-idn@example.test", email_verified: true, loa: 2 })
    throw new Error("Transport externe inattendu dans la recette native")
  }))
})
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Objet de recette absent")
  return value as Record<string, unknown>
}
function field(value: unknown, name: string): string {
  const result = object(value)[name]
  if (typeof result !== "string" || !result) throw new Error(`Champ de recette absent : ${name}`)
  return result
}
async function digest(value: string) {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "")
}
async function request(t: T, path: string, body?: Record<string, unknown>, bearer?: string) {
  return t.action(async (ctx) => {
    const { createAuth } = await import("./auth")
    const headers = new Headers({ Origin: ORIGIN })
    if (body) headers.set("Content-Type", "application/json")
    if (bearer) headers.set("Authorization", `Bearer ${bearer}`)
    const response = await createAuth(ctx).handler(new Request(`${ORIGIN}/api/auth${path}`, { method: body ? "POST" : "GET", headers, ...(body ? { body: JSON.stringify(body) } : {}) }))
    const text = await response.text()
    return { status: response.status, data: text ? JSON.parse(text) as unknown : null, location: response.headers.get("location"), bearer: response.headers.get("set-auth-token") }
  })
}
async function startBody() {
  return { providerId: "idn", callbackURL: CALLBACK, newUserCallbackURL: CALLBACK, errorCallbackURL: CALLBACK, additionalData: { antsiaNative: { challenge: await digest(VERIFIER), state: STATE, redirectUri: REDIRECT } } }
}
async function loginCode(t: T) {
  const started = await request(t, "/sign-in/oauth2", await startBody())
  expect(started.status).toBe(200)
  const authorization = new URL(field(started.data, "url"))
  const state = authorization.searchParams.get("state")
  expect(state).toBeTruthy()
  const returned = await request(t, `/oauth2/callback/idn?code=fixture&state=${encodeURIComponent(state ?? "")}&iss=${encodeURIComponent(ISSUER)}`)
  expect(returned.status).toBe(302)
  const url = new URL(returned.location ?? "https://missing.fixture.test")
  expect(url.searchParams.get("error")).toBeNull()
  expect(`${url.protocol}//${url.host}${url.pathname}`).toBe(REDIRECT)
  expect([...url.searchParams.keys()].sort()).toEqual(["code", "state"])
  expect(url.searchParams.get("state")).toBe(STATE)
  const code = url.searchParams.get("code") ?? ""
  expect(code).toMatch(/^[A-Za-z0-9_-]{43}$/)
  const identifier = `native-idn:${await digest(code)}`
  const stored: unknown = await t.query(components.betterAuth.adapter.findOne, { model: "verification", where: [{ field: "identifier", value: identifier }] })
  expect(stored).not.toBeNull()
  const payload = object(JSON.parse(field(stored, "value")))
  return { code, identifier, sessionId: field(payload, "sessionId"), userId: field(payload, "userId") }
}

it("échange le code lié S256 en bearer, sans session dans le lien ni création de profil social", async () => {
  const t = testConvex({ automaticSessions: false })
  const flow = await loginCode(t)
  const exchanged = await request(t, "/native-idn/exchange", { code: flow.code, verifier: VERIFIER })
  expect(exchanged.status).toBe(200)
  expect(exchanged.bearer).toBeTruthy()
  expect(field(object(exchanged.data).session, "id")).toBe(flow.sessionId)
  const session = await request(t, "/get-session", undefined, exchanged.bearer ?? "")
  expect(field(object(session.data).user, "id")).toBe(flow.userId)
  expect(await t.run((ctx) => ctx.db.query("persons").withIndex("by_authUserId", q => q.eq("authUserId", flow.userId)).unique())).toBeNull()
  expect((await request(t, "/native-idn/exchange", { code: flow.code, verifier: VERIFIER })).status).toBe(400)
})

it("un mauvais verifier consomme le code et interdit toute réutilisation", async () => {
  const t = testConvex({ automaticSessions: false })
  const { code } = await loginCode(t)
  const refused = await request(t, "/native-idn/exchange", { code, verifier: "x".repeat(43) })
  expect(refused.status).toBe(400)
  expect(refused.bearer).toBeNull()
  expect((await request(t, "/native-idn/exchange", { code, verifier: VERIFIER })).status).toBe(400)
})

it("deux échanges concurrents ne délivrent qu'une seule session", async () => {
  const t = testConvex({ automaticSessions: false })
  const { code } = await loginCode(t)
  const results = await Promise.all([request(t, "/native-idn/exchange", { code, verifier: VERIFIER }), request(t, "/native-idn/exchange", { code, verifier: VERIFIER })])
  expect(results.map(result => result.status).sort()).toEqual([200, 400])
  expect(results.filter(result => result.bearer)).toHaveLength(1)
})

it.each(["revoked", "expired"])("refuse une session %s avant l'échange", async (kind) => {
  const t = testConvex({ automaticSessions: false })
  const flow = await loginCode(t)
  if (kind === "revoked") await t.mutation(components.betterAuth.adapter.deleteOne, { input: { model: "session", where: [{ field: "_id", value: flow.sessionId }] } })
  else await t.mutation(components.betterAuth.adapter.updateOne, { input: { model: "session", where: [{ field: "_id", value: flow.sessionId }], update: { expiresAt: Date.now() - 1 } } })
  const result = await request(t, "/native-idn/exchange", { code: flow.code, verifier: VERIFIER })
  expect(result.status).toBe(400)
  expect(result.bearer).toBeNull()
})

it("refuse un code expiré", async () => {
  const t = testConvex({ automaticSessions: false })
  const flow = await loginCode(t)
  await t.mutation(components.betterAuth.adapter.updateOne, { input: { model: "verification", where: [{ field: "identifier", value: flow.identifier }], update: { expiresAt: Date.now() - 1 } } })
  const result = await request(t, "/native-idn/exchange", { code: flow.code, verifier: VERIFIER })
  expect(result.status).toBe(400)
  expect(result.bearer).toBeNull()
})

it.each([undefined, "https://auth/idn", "exp://auth/idn", "mailto://auth/idn", "intent://auth/idn", "antsia-fixture://auth/idn?other=1", "antsia-fixture://auth/other"])("ferme le protocole sans configuration de retour valide : %s", async (redirectUri) => {
  vi.stubEnv("NATIVE_AUTH_REDIRECT_URI", redirectUri)
  const t = testConvex({ automaticSessions: false })
  expect((await request(t, "/sign-in/oauth2", await startBody())).status).toBe(503)
  const exchange = await request(t, "/native-idn/exchange", { code: "c".repeat(43), verifier: VERIFIER })
  expect(exchange.status).toBe(503)
  expect(exchange.bearer).toBeNull()
})

it.each(["callback", "newUser", "error", "challenge", "state", "redirect", "extra", "provider"])("refuse le départ natif altéré : %s", async (kind) => {
  const body = await startBody()
  if (kind === "callback") body.callbackURL = `${ORIGIN}/bienvenue`
  if (kind === "newUser") body.newUserCallbackURL = `${ORIGIN}/bienvenue`
  if (kind === "error") body.errorCallbackURL = "https://other.fixture.test/error"
  if (kind === "challenge") body.additionalData.antsiaNative.challenge = "short"
  if (kind === "state") body.additionalData.antsiaNative.state = "short"
  if (kind === "redirect") body.additionalData.antsiaNative.redirectUri = "other-fixture://auth/idn"
  if (kind === "extra") Object.assign(body.additionalData.antsiaNative, { token: "forbidden" })
  if (kind === "provider") body.providerId = "other"
  const result = await request(testConvex({ automaticSessions: false }), "/sign-in/oauth2", body)
  expect([400, 403]).toContain(result.status)
  expect(result.bearer).toBeNull()
})
