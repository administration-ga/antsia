// @vitest-environment edge-runtime
/**
 * Issue #122 (EA-02) — retour d'un refus ou d'un abandon chez IDN vers la porte de départ.
 * Vrai gestionnaire Better Auth et vrai état OAuth en base ; seul le transport d'IDN est simulé.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { components } from "../_generated/api"
import { testConvex } from "../test.setup"
import { IDN_GENERIC_ERROR, IDN_RETURNED_ERRORS, refusalDestination, returnedErrorOf } from "./idnRefusalReturn"

const PRIMARY = "http://localhost:3030"
const DIASPORALE = "http://localhost:3031"
const CONSOLE = "http://localhost:3032"
const PARTNER = "https://partner.fixture.test"
const EVIL = "https://evil.fixture.test"
const ISSUER = "https://idn.fixture.test"
const NATIVE_REDIRECT = "antsia-fixture://auth/idn"
const DEFAULT_PAGE = `${PRIMARY}/api/auth/error?`
type T = ReturnType<typeof testConvex>

beforeEach(() => {
  vi.stubEnv("SITE_URL", PRIMARY)
  vi.stubEnv("CONVEX_SITE_URL", "http://127.0.0.1:3211")
  vi.stubEnv("CONVEX_CLOUD_URL", "http://127.0.0.1:3210")
  vi.stubEnv("ANTSIA_DEV_TOOLS", "true")
  vi.stubEnv("BETTER_AUTH_SECRET", "fictional-refusal-test-secret-at-least-thirty-two-characters")
  vi.stubEnv("IDN_CLIENT_ID", "fixture-client")
  vi.stubEnv("IDN_CLIENT_SECRET", "fictional-idn-secret-for-refusal-tests")
  vi.stubEnv("IDN_ISSUER", ISSUER)
  vi.stubEnv("IDN_DISCOVERY_URL", undefined)
  vi.stubEnv("TRUSTED_ORIGINS", undefined)
  vi.stubEnv("NATIVE_AUTH_REDIRECT_URI", NATIVE_REDIRECT)
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    const json = (value: unknown) => new Response(JSON.stringify(value), { headers: { "Content-Type": "application/json" } })
    if (url.pathname.endsWith("/.well-known/openid-configuration")) return json({ issuer: ISSUER, authorization_endpoint: `${ISSUER}/authorize`, token_endpoint: `${ISSUER}/token`, userinfo_endpoint: `${ISSUER}/userinfo` })
    if (url.pathname === "/token") {
      expect(new URLSearchParams(String(init?.body ?? "")).get("code_verifier")).toBeTruthy()
      return json({ access_token: "fixture-refusal-access", token_type: "Bearer", expires_in: 3600 })
    }
    if (url.pathname === "/userinfo") return json({ sub: "fixture-refusal-subject", email: "refusal@example.test", email_verified: true, loa: 1 })
    throw new Error("Transport externe inattendu dans la recette du refus IDN")
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

/** Le transport réel : départ par le proxy d'une application (Origin), retour d'IDN par navigation (sans Origin). */
async function call(t: T, path: string, options: { body?: Record<string, unknown>; origin?: string } = {}) {
  return t.action(async (ctx) => {
    const { createAuth } = await import("./auth")
    const headers = new Headers()
    if (options.origin) headers.set("Origin", options.origin)
    if (options.body) headers.set("Content-Type", "application/json")
    const response = await createAuth(ctx, options.origin ?? null).handler(new Request(`${PRIMARY}/api/auth${path}`, {
      method: options.body ? "POST" : "GET", headers, ...(options.body ? { body: JSON.stringify(options.body) } : {}),
    }))
    const text = await response.text()
    let data: unknown = null
    try { data = text ? JSON.parse(text) : null } catch { data = null }
    return { status: response.status, data, location: response.headers.get("location"), cookies: response.headers.getSetCookie() }
  })
}

async function start(t: T, origin: string, body: Record<string, unknown>) {
  const started = await call(t, "/sign-in/oauth2", { origin, body: { providerId: "idn", ...body } })
  expect(started.status).toBe(200)
  const state = new URL(field(started.data, "url")).searchParams.get("state")
  if (!state) throw new Error("État OAuth de recette absent")
  return state
}

const back = (t: T, query: string) => call(t, `/oauth2/callback/idn?${query}`)
const refusal = (state: string, extra = "") => `error=access_denied&error_description=${encodeURIComponent("Private detail from IDN")}&error_uri=${encodeURIComponent(`${ISSUER}/help`)}&state=${encodeURIComponent(state)}&iss=${encodeURIComponent(ISSUER)}${extra}`
const stateRow = (t: T, state: string) => t.query(components.betterAuth.adapter.findOne, { model: "verification", where: [{ field: "identifier", value: state }] })

function expectDefaultPage(result: { status: number; location: string | null }) {
  expect(result.status).toBe(302)
  expect(result.location?.startsWith(DEFAULT_PAGE)).toBe(true)
}

/** Un état écrit directement en base : forgé, illisible ou d'une version antérieure. */
async function forgeState(t: T, value: string, state = "F".repeat(32)) {
  const now = Date.now()
  await t.mutation(components.betterAuth.adapter.create, { input: { model: "verification", data: { identifier: state, value, expiresAt: now + 600_000, createdAt: now, updatedAt: now } } })
  return state
}
const storedState = (state: string, errorURL: string) => JSON.stringify({ callbackURL: `${DIASPORALE}/bienvenue`, codeVerifier: "v".repeat(128), errorURL, expiresAt: Date.now() + 600_000, oauthState: state })

describe("retour d'un refus IDN — porte de confiance", () => {
  it("une origine de confiance est renvoyée vers sa porte avec le seul paramètre error=access_denied", async () => {
    const t = testConvex({ automaticSessions: false })
    const state = await start(t, DIASPORALE, { callbackURL: `${DIASPORALE}/bienvenue`, errorCallbackURL: `${DIASPORALE}/entrer` })
    const result = await back(t, refusal(state))
    expect(result.status).toBe(302)
    expect(result.location).toBe(`${DIASPORALE}/entrer?error=access_denied`)
    const url = new URL(result.location ?? EVIL)
    expect([...url.searchParams.keys()]).toEqual(["error"])
    // Ni description, ni lien d'aide, ni état, ni jeton de passage, ni cookie de session.
    expect(result.location).not.toMatch(/Private|help|state|ott|iss|code/)
    expect(result.cookies).toEqual([])
    expect(await stateRow(t, state)).toBeNull()
  })

  it("l'adresse relative d'une porte est fixée sur son origine au départ, puis honorée au retour", async () => {
    const t = testConvex({ automaticSessions: false })
    const state = await start(t, CONSOLE, { callbackURL: "/", errorCallbackURL: "/entrer" })
    const result = await back(t, refusal(state))
    expect(result.location).toBe(`${CONSOLE}/entrer?error=access_denied`)
  })

  it.each(IDN_RETURNED_ERRORS)("le code %s de la liste fermée passe tel quel", async (code) => {
    const t = testConvex({ automaticSessions: false })
    const state = await start(t, DIASPORALE, { callbackURL: `${DIASPORALE}/bienvenue`, errorCallbackURL: `${DIASPORALE}/entrer` })
    const result = await back(t, `error=${code}&state=${state}`)
    expect(result.location).toBe(`${DIASPORALE}/entrer?error=${code}`)
  })

  it.each([
    ["une casse différente", "error=ACCESS_DENIED"],
    ["un code standard hors de la liste", "error=invalid_request"],
    ["une injection d'en-tête", `error=${encodeURIComponent("access_denied\r\nSet-Cookie: x=1")}`],
    ["une injection de balise", `error=${encodeURIComponent("<script>alert(1)</script>")}`],
    ["une valeur démesurée", `error=${"a".repeat(5_000)}`],
    ["un code suivi d'une espace", `error=${encodeURIComponent("access_denied ")}`],
    ["un paramètre répété", "error=access_denied&error=login_required"],
    ["une réponse sans code ni erreur", ""],
  ])("%s devient le code générique, jamais recopié", async (_label, error) => {
    const t = testConvex({ automaticSessions: false })
    const state = await start(t, DIASPORALE, { callbackURL: `${DIASPORALE}/bienvenue`, errorCallbackURL: `${DIASPORALE}/entrer` })
    const result = await back(t, `${error}${error ? "&" : ""}state=${state}`)
    expect(result.location).toBe(`${DIASPORALE}/entrer?error=${IDN_GENERIC_ERROR}`)
  })
})

describe("retour d'un refus IDN — aucune redirection ouverte", () => {
  // En production, Better Auth refuse déjà ce départ (403 INVALID_ERROR_CALLBACK_URL) ; sous vitest,
  // il désactive son contrôle d'origine (`isTest`), ce qui permet de prouver que le retour revérifie seul.
  it("une adresse d'erreur d'une autre origine, même enregistrée au départ d'une porte de confiance, n'est jamais suivie", async () => {
    const t = testConvex({ automaticSessions: false })
    const state = await start(t, DIASPORALE, { callbackURL: `${DIASPORALE}/bienvenue`, errorCallbackURL: `${EVIL}/entrer` })
    const result = await back(t, refusal(state))
    expectDefaultPage(result)
    expect(result.location).not.toContain("evil")
    expect(await stateRow(t, state)).toBeNull()
  })

  it("une origine retirée de la confiance entre le départ et le retour reçoit la page par défaut", async () => {
    vi.stubEnv("TRUSTED_ORIGINS", PARTNER)
    const t = testConvex({ automaticSessions: false })
    const state = await start(t, PARTNER, { callbackURL: `${PARTNER}/bienvenue`, errorCallbackURL: `${PARTNER}/entrer` })
    vi.stubEnv("TRUSTED_ORIGINS", undefined)
    expectDefaultPage(await back(t, refusal(state)))
    expect(await stateRow(t, state)).toBeNull()
  })

  it.each([`${EVIL}/entrer`, "https://diasporale.com.evil.fixture.test/entrer", "https://diasporale.com@evil.fixture.test/entrer", "//evil.fixture.test/entrer"])("un état forgé vers %s reçoit la page par défaut", async (errorURL) => {
    const t = testConvex({ automaticSessions: false })
    const state = await forgeState(t, storedState("F".repeat(32), errorURL))
    expectDefaultPage(await back(t, refusal(state)))
    expect(await stateRow(t, state)).toBeNull()
  })

  it("seules l'origine exacte et un chemin simple sont admis ; requête et fragment ne ressortent pas", () => {
    const allowlist = ["https://diasporale.com", "http://localhost:3031"]
    expect(refusalDestination("https://diasporale.com/entrer", allowlist)).toBe("https://diasporale.com/entrer")
    expect(refusalDestination("http://localhost:3031/demo/entrer", allowlist)).toBe("http://localhost:3031/demo/entrer")
    expect(refusalDestination("https://diasporale.com/entrer?next=%2Fadmin&error_description=x#fragment", allowlist)).toBe("https://diasporale.com/entrer")
    for (const unsafe of [
      undefined, 42, "", "/entrer", "//evil.fixture.test/entrer", "javascript:alert(1)", "data:text/html,x",
      `${EVIL}/entrer`, "https://diasporale.com.evil.fixture.test/entrer", "https://evil.fixture.test/https://diasporale.com/entrer",
      "https://diasporale.com@evil.fixture.test/entrer", "https://user:secret@diasporale.com/entrer", "http://diasporale.com/entrer",
      "https://diasporale.com:8443/entrer", "https://diasporale.com:443/entrer", "https://DIASPORALE.com/entrer",
      "https://diasporale.com//evil.fixture.test/entrer", "https://diasporale.com/entrer\\@evil.fixture.test", "https://diasporale.com\\evil.fixture.test",
      "https://diasporale.com/%2F%2Fevil.fixture.test", "https://diasporale.com/a/../entrer", " https://diasporale.com/entrer",
      "https://diasporale.com/entrer\n", `https://diasporale.com/${"a".repeat(2_100)}`, "http://127.0.0.1:3031/entrer",
    ]) expect(refusalDestination(unsafe, allowlist), String(unsafe)).toBeNull()
  })

  it("le code renvoyé vient toujours de la liste fermée", () => {
    expect(returnedErrorOf("access_denied")).toBe("access_denied")
    for (const raw of [undefined, null, "", ["access_denied"], { error: "access_denied" }, "access_denied%0d%0a", "server_error ", "Access_Denied"]) {
      expect(returnedErrorOf(raw)).toBe(IDN_GENERIC_ERROR)
    }
  })
})

describe("retour d'un refus IDN — état introuvable, expiré, rejoué ou illisible : page par défaut", () => {
  it.each([["sans état", ""], ["état inconnu", `&state=${"u".repeat(32)}`], ["état de forme étrangère", "&state=abc"], ["état trop long", `&state=${"u".repeat(33)}`]])("%s", async (_label, state) => {
    const t = testConvex({ automaticSessions: false })
    await start(t, DIASPORALE, { callbackURL: `${DIASPORALE}/bienvenue`, errorCallbackURL: `${DIASPORALE}/entrer` })
    expectDefaultPage(await back(t, `error=access_denied${state}`))
  })

  it("un état expiré en base est supprimé et rend la page par défaut", async () => {
    const t = testConvex({ automaticSessions: false })
    const state = await start(t, DIASPORALE, { callbackURL: `${DIASPORALE}/bienvenue`, errorCallbackURL: `${DIASPORALE}/entrer` })
    await t.mutation(components.betterAuth.adapter.updateOne, { input: { model: "verification", where: [{ field: "identifier", value: state }], update: { expiresAt: Date.now() - 1 } } })
    expectDefaultPage(await back(t, refusal(state)))
    expect(await stateRow(t, state)).toBeNull()
  })

  it("un état dont l'échéance propre est passée est consommé et rend la page par défaut", async () => {
    const t = testConvex({ automaticSessions: false })
    const state = await start(t, DIASPORALE, { callbackURL: `${DIASPORALE}/bienvenue`, errorCallbackURL: `${DIASPORALE}/entrer` })
    const row = object(await stateRow(t, state))
    const value = { ...object(JSON.parse(field(row, "value"))), expiresAt: Date.now() - 1 }
    await t.mutation(components.betterAuth.adapter.updateOne, { input: { model: "verification", where: [{ field: "identifier", value: state }], update: { value: JSON.stringify(value) } } })
    expectDefaultPage(await back(t, refusal(state)))
    expect(await stateRow(t, state)).toBeNull()
  })

  it("un état relu pour ce renvoi n'est plus rejouable", async () => {
    const t = testConvex({ automaticSessions: false })
    const state = await start(t, DIASPORALE, { callbackURL: `${DIASPORALE}/bienvenue`, errorCallbackURL: `${DIASPORALE}/entrer` })
    expect((await back(t, refusal(state))).location).toBe(`${DIASPORALE}/entrer?error=access_denied`)
    expectDefaultPage(await back(t, refusal(state)))
    // Ni un second refus, ni un code d'autorisation présenté après coup avec le même état.
    const late = await back(t, `code=fixture-late&state=${state}&iss=${encodeURIComponent(ISSUER)}`)
    expect(late.location?.startsWith(DEFAULT_PAGE)).toBe(true)
    expect(late.location).not.toContain("ott=")
  })

  it("deux retours concurrents du même état ne renvoient qu'une fois vers la porte", async () => {
    const t = testConvex({ automaticSessions: false })
    const state = await start(t, DIASPORALE, { callbackURL: `${DIASPORALE}/bienvenue`, errorCallbackURL: `${DIASPORALE}/entrer` })
    const results = await Promise.all([back(t, refusal(state)), back(t, refusal(state))])
    expect(results.filter((result) => result.location === `${DIASPORALE}/entrer?error=access_denied`)).toHaveLength(1)
    expect(results.filter((result) => result.location?.startsWith(DEFAULT_PAGE))).toHaveLength(1)
  })

  it("un état illisible est consommé et rend la page par défaut", async () => {
    const t = testConvex({ automaticSessions: false })
    const state = await forgeState(t, "{not json")
    expectDefaultPage(await back(t, refusal(state)))
    expect(await stateRow(t, state)).toBeNull()
  })
})

describe("retour d'un refus IDN — le reste ne change pas", () => {
  it("un départ sans adresse d'erreur garde la page par défaut", async () => {
    const t = testConvex({ automaticSessions: false })
    const state = await start(t, PRIMARY, { callbackURL: `${PRIMARY}/bienvenue` })
    expectDefaultPage(await back(t, refusal(state)))
  })

  it("le parcours natif garde la page par défaut et ne délivre aucun code natif", async () => {
    const t = testConvex({ automaticSessions: false })
    const callbackURL = `${PRIMARY}/api/auth/native/return`
    const challenge = "c".repeat(43)
    const state = await start(t, PRIMARY, { callbackURL, newUserCallbackURL: callbackURL, errorCallbackURL: callbackURL, additionalData: { antsiaNative: { challenge, state: "s".repeat(43), redirectUri: NATIVE_REDIRECT } } })
    const result = await back(t, refusal(state))
    expectDefaultPage(result)
    expect(result.location).not.toContain(NATIVE_REDIRECT)
    expect(await stateRow(t, state)).toBeNull()
  })

  it("le chemin de réussite, adresse d'erreur comprise, mène toujours au retour avec son jeton de passage", async () => {
    const t = testConvex({ automaticSessions: false })
    const state = await start(t, DIASPORALE, { callbackURL: `${DIASPORALE}/bienvenue`, errorCallbackURL: `${DIASPORALE}/entrer` })
    const result = await back(t, `code=fixture-code&state=${state}&iss=${encodeURIComponent(ISSUER)}`)
    expect(result.status).toBe(302)
    const url = new URL(result.location ?? EVIL)
    expect(`${url.origin}${url.pathname}`).toBe(`${DIASPORALE}/bienvenue`)
    expect(url.searchParams.get("ott")).toBeTruthy()
    expect(url.searchParams.get("error")).toBeNull()
  })
})
