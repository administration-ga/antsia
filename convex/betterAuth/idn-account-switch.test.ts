// @vitest-environment edge-runtime
/** Vrai gestionnaire ANTSIA ; seul le transport du fournisseur IDN est simulé. */
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { components } from "../_generated/api"
import { testConvex } from "../test.setup"

const ORIGIN = "http://localhost:3030"
const ISSUER = "https://idn.fixture.test"
type T = ReturnType<typeof testConvex>

beforeEach(() => {
  vi.stubEnv("SITE_URL", ORIGIN)
  vi.stubEnv("CONVEX_SITE_URL", "http://127.0.0.1:3211")
  vi.stubEnv("CONVEX_CLOUD_URL", "http://127.0.0.1:3210")
  vi.stubEnv("ANTSIA_DEV_TOOLS", "true")
  vi.stubEnv("BETTER_AUTH_SECRET", "fictional-auth-test-secret-at-least-thirty-two-characters")
  vi.stubEnv("IDN_CLIENT_ID", "fixture-client")
  vi.stubEnv("IDN_CLIENT_SECRET", "fictional-idn-secret-for-tests")
  vi.stubEnv("IDN_ISSUER", ISSUER)
  vi.stubEnv("IDN_DISCOVERY_URL", undefined)
  vi.stubEnv("TRUSTED_ORIGINS", undefined)
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    const json = (value: unknown) => new Response(JSON.stringify(value), { headers: { "Content-Type": "application/json" } })
    if (url.pathname.endsWith("/.well-known/openid-configuration")) return json({
      issuer: ISSUER, authorization_endpoint: `${ISSUER}/authorize`,
      token_endpoint: `${ISSUER}/token`, userinfo_endpoint: `${ISSUER}/userinfo`,
    })
    if (url.pathname === "/token") {
      const params = new URLSearchParams(String(init?.body ?? ""))
      expect(params.get("code_verifier")).toBeTruthy()
      expect(params.get("redirect_uri")).toBe(`${ORIGIN}/api/auth/oauth2/callback/idn`)
      return json({ access_token: `fixture-access-${params.get("code")}`, token_type: "Bearer", expires_in: 3600 })
    }
    if (url.pathname === "/userinfo") {
      const authorization = new Headers(init?.headers).get("Authorization")
      const account = authorization?.endsWith("-beta") ? "beta" : "alpha"
      return json({ sub: `fixture-idn-${account}`, email: `${account}@example.test`, email_verified: true, loa: 2, nationality: "GA", profile_type: "citizen" })
    }
    throw new Error("Transport externe inattendu dans la recette IDN")
  }))
})

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

function object(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null) throw new Error("Réponse IDN de recette absente")
  return value as Record<string, unknown>
}
function field(value: unknown, name: string): string {
  const result = object(value)[name]
  if (typeof result !== "string" || !result) throw new Error(`Champ de recette absent : ${name}`)
  return result
}

async function request(t: T, path: string, options: { body?: Record<string, unknown>; cookie?: string; token?: string } = {}) {
  return t.action(async (ctx) => {
    const { createAuth } = await import("./auth")
    const headers = new Headers({ Origin: ORIGIN })
    if (options.body) headers.set("Content-Type", "application/json")
    if (options.cookie) headers.set("Cookie", options.cookie)
    if (options.token) headers.set("Authorization", `Bearer ${options.token}`)
    const response = await createAuth(ctx).handler(new Request(`${ORIGIN}/api/auth${path}`, {
      method: options.body ? "POST" : "GET", headers,
      ...(options.body ? { body: JSON.stringify(options.body) } : {}),
    }))
    const body = await response.text()
    return { status: response.status, data: body ? JSON.parse(body) as unknown : null, location: response.headers.get("Location"), cookies: response.headers.getSetCookie() }
  })
}

async function login(t: T, account: "alpha" | "beta") {
  const start = await request(t, "/sign-in/oauth2", { body: { providerId: "idn", callbackURL: `${ORIGIN}/bienvenue` } })
  expect(start.status).toBe(200)
  const url = new URL(field(start.data, "url"))
  expect(url.searchParams.get("prompt")).toBe("login")
  const state = url.searchParams.get("state")
  expect(state).toBeTruthy()
  const cookie = start.cookies.map((value) => value.split(";")[0]).join("; ")
  const callback = await request(t, `/oauth2/callback/idn?code=${account}&state=${encodeURIComponent(state ?? "")}&iss=${encodeURIComponent(ISSUER)}`, { cookie })
  expect(callback.status).toBe(302)
  expect(callback.location).toBeTruthy()
  const destination = new URL(callback.location ?? ORIGIN)
  expect(destination.pathname).toBe("/bienvenue")
  const ott = destination.searchParams.get("ott")
  expect(ott).toBeTruthy()
  const adopted = await request(t, "/one-time-token/verify", { body: { token: ott } })
  expect(adopted.status).toBe(200)
  const data = object(adopted.data), session = object(data.session)
  return { userId: field(data.user, "id"), sessionId: field(session, "id"), token: field(session, "token") }
}

it("A → déconnexion → B → déconnexion → A : deux sujets IDN restent distincts et les anciennes sessions restent révoquées", async () => {
  const t = testConvex({ automaticSessions: false })
  const a = await login(t, "alpha")
  expect((await request(t, "/revoke-sessions", { body: {}, token: a.token })).status).toBe(200)
  expect((await request(t, "/sign-out", { body: {}, token: a.token })).status).toBe(200)
  expect((await request(t, "/get-session", { token: a.token })).data).toBeNull()

  const b = await login(t, "beta")
  expect(b.userId).not.toBe(a.userId)
  expect(b.sessionId).not.toBe(a.sessionId)
  const current = await request(t, "/get-session", { token: b.token })
  expect(field(object(current.data).user, "id")).toBe(b.userId)
  const linked = await t.query(components.betterAuth.adapter.findOne, { model: "account", where: [{ field: "userId", value: b.userId }, { field: "providerId", value: "idn" }] })
  expect(object(linked).accountId).toBe("fixture-idn-beta")
  expect((await request(t, "/revoke-sessions", { body: {}, token: b.token })).status).toBe(200)
  expect((await request(t, "/sign-out", { body: {}, token: b.token })).status).toBe(200)

  const again = await login(t, "alpha")
  expect(again.userId).toBe(a.userId)
  expect(again.sessionId).not.toBe(a.sessionId)
  for (const old of [a, b]) {
    expect(await t.query(components.betterAuth.adapter.findOne, { model: "session", where: [{ field: "_id", value: old.sessionId }] })).toBeNull()
    expect((await request(t, "/get-session", { token: old.token })).data).toBeNull()
  }
})

