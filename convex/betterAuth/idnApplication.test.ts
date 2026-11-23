// @vitest-environment edge-runtime
/**
 * ADR-0042 (CH-815) — la preuve de session IDN porte l'application où le retour LIVRE la session.
 *
 * Recette du VRAI parcours Better Auth, de bout en bout dans le moteur : départ `POST /sign-in/oauth2`
 * depuis une application du catalogue, puis rappel central `GET /oauth2/callback/idn` SANS en-tête
 * `Origin` (une navigation de navigateur), IDN simulé par un `fetch` de recette (découverte, jeton,
 * profil). L'application vient de l'état OAuth enregistré au départ, jamais de l'origine du rappel :
 * un rappel qui porterait l'origine d'une autre application n'y change rien.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { testConvex } from "../test.setup"
import { NETWORK_ADMIN_APPLICATION_KEY } from "../tests/networkAdminCatalog.fixture"

// L'application d'administration au catalogue (contrat CH-815) : posée tant que l'entrée réelle n'est pas fusionnée.
vi.mock("../../deploy/catalog.json", async (importOriginal) => {
  const { withNetworkAdminApplication } = await import("../tests/networkAdminCatalog.fixture")
  return withNetworkAdminApplication(await importOriginal())
})

type T = ReturnType<typeof testConvex>

const PRIMARY_ORIGIN = "http://localhost:3030"
const MEMBERS_ORIGIN = "http://localhost:3031"
const ADMIN_ORIGIN = "http://localhost:3033"
const ISSUER = "https://idn.example.test"
const DISCOVERY = `${ISSUER}/api/auth/convex/.well-known/openid-configuration`
const TOKEN_ENDPOINT = `${ISSUER}/api/auth/oauth2/token`
const USERINFO_ENDPOINT = `${ISSUER}/api/auth/oauth2/userinfo`

beforeEach(() => {
  vi.stubEnv("SITE_URL", PRIMARY_ORIGIN)
  vi.stubEnv("CONVEX_SITE_URL", "http://127.0.0.1:3211")
  vi.stubEnv("CONVEX_CLOUD_URL", "http://127.0.0.1:3210")
  vi.stubEnv("ANTSIA_DEV_TOOLS", "true")
  vi.stubEnv("BETTER_AUTH_SECRET", "fictional-auth-test-secret-at-least-thirty-two-characters")
  vi.stubEnv("IDN_CLIENT_ID", "sandbox-client-fixture")
  vi.stubEnv("IDN_CLIENT_SECRET", "fictional-idn-secret-for-tests")
  vi.stubEnv("IDN_ISSUER", ISSUER)
  for (const key of ["IDN_DISCOVERY_URL", "RESEND_API_KEY", "RESEND_FROM_ADDRESS", "SMS_PROVIDER", "SMS_ENDPOINT", "SMS_API_KEY", "TRUSTED_ORIGINS", "AUTH_DEFAULT_LOCALE", "NATIVE_AUTH_REDIRECT_URI"]) vi.stubEnv(key, undefined)
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

/** IDN simulé : découverte, échange du code, profil (garantie 2). Aucun service externe. */
function stubIdn(subject: string) {
  const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } })
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
    if (url.startsWith(DISCOVERY)) return json({ issuer: ISSUER, authorization_endpoint: `${ISSUER}/api/auth/oauth2/authorize`, token_endpoint: TOKEN_ENDPOINT, userinfo_endpoint: USERINFO_ENDPOINT })
    if (url.startsWith(TOKEN_ENDPOINT)) return json({ access_token: "fictional-access-token", token_type: "Bearer", expires_in: 3600 })
    if (url.startsWith(USERINFO_ENDPOINT)) return json({ sub: subject, email: `${subject}@example.test`, email_verified: true, loa: 2 })
    return new Response("inconnu", { status: 404 })
  }))
}

/** Une requête au VRAI gestionnaire Better Auth du moteur ; `origin: null` : aucune en-tête Origin. */
async function authRequest(t: T, path: string, { method, origin, body }: { method: "GET" | "POST"; origin: string | null; body?: Record<string, unknown> }) {
  return await t.action(async (ctx) => {
    const { createAuth } = await import("./auth")
    const headers = new Headers()
    if (origin) headers.set("Origin", origin)
    if (body) headers.set("Content-Type", "application/json")
    const response = await createAuth(ctx, origin).handler(new Request(`${PRIMARY_ORIGIN}/api/auth${path}`, { method, headers, ...(body ? { body: JSON.stringify(body) } : {}) }))
    return { status: response.status, location: response.headers.get("location"), body: await response.text() }
  })
}

/** Le départ depuis une application : l'état OAuth que le moteur enregistre, lu dans l'adresse d'IDN. */
async function startFrom(t: T, origin: string, body: Record<string, unknown>): Promise<string> {
  const started = await authRequest(t, "/sign-in/oauth2", { method: "POST", origin, body: { providerId: "idn", ...body } })
  expect(started.status, started.body).toBe(200)
  const url = new URL(JSON.parse(started.body).url as string)
  expect(url.origin).toBe(ISSUER)
  const state = url.searchParams.get("state")
  if (!state) throw new Error("État OAuth absent")
  return state
}

/** Le rappel central d'IDN, navigation GET du navigateur : sans Origin, sauf `origin` donnée pour la recette. */
async function returnFromIdn(t: T, state: string, origin: string | null = null) {
  const returned = await authRequest(t, `/oauth2/callback/idn?code=fictional-code&state=${encodeURIComponent(state)}`, { method: "GET", origin })
  expect(returned.status, returned.body).toBe(302)
  return new URL(returned.location ?? "")
}

async function proofs(t: T) {
  return await t.run(async (ctx) => (await ctx.db.query("operatorSessionProofs").take(10)).map((proof) => ({ application: proof.application, loa: proof.loa })))
}

describe("ADR-0042 — l'application de la session, prise de l'état OAuth enregistré au départ", () => {
  it("un départ de l'application d'administration scelle la session pour elle ; le jeton de session lui revient", async () => {
    const t = testConvex({ automaticSessions: false })
    stubIdn("idn-admin-retour")
    const state = await startFrom(t, ADMIN_ORIGIN, { callbackURL: `${ADMIN_ORIGIN}/entrer` })
    const location = await returnFromIdn(t, state)
    // Le jeton à usage unique de la session part vers l'adresse de retour enregistrée, et vers elle seule.
    expect(location.origin).toBe(ADMIN_ORIGIN)
    expect(location.searchParams.get("ott")).toBeTruthy()
    expect(await proofs(t)).toEqual([{ application: NETWORK_ADMIN_APPLICATION_KEY, loa: 2 }])
  })

  it("une adresse de retour relative est rendue à l'origine de départ (`crossDomain`) : même application", async () => {
    const t = testConvex({ automaticSessions: false })
    stubIdn("idn-admin-relatif")
    const state = await startFrom(t, ADMIN_ORIGIN, { callbackURL: "/entrer" })
    expect((await returnFromIdn(t, state)).origin).toBe(ADMIN_ORIGIN)
    expect(await proofs(t)).toEqual([{ application: NETWORK_ADMIN_APPLICATION_KEY, loa: 2 }])
  })

  it("un départ de l'application des membres scelle la session pour elle, même si le rappel porte l'origine de l'administration", async () => {
    const t = testConvex({ automaticSessions: false })
    stubIdn("idn-membre-retour")
    const state = await startFrom(t, MEMBERS_ORIGIN, { callbackURL: `${MEMBERS_ORIGIN}/fil` })
    expect((await returnFromIdn(t, state, ADMIN_ORIGIN)).origin).toBe(MEMBERS_ORIGIN)
    expect(await proofs(t)).toEqual([{ application: "diaspora_ga", loa: 2 }])
  })

  it("une adresse de nouvel utilisateur vers une autre application : aucune application n'est scellée", async () => {
    const t = testConvex({ automaticSessions: false })
    stubIdn("idn-retour-mixte")
    const state = await startFrom(t, ADMIN_ORIGIN, { callbackURL: `${ADMIN_ORIGIN}/entrer`, newUserCallbackURL: `${MEMBERS_ORIGIN}/accueil` })
    // Compte neuf : Better Auth le renvoie vers l'adresse de nouvel utilisateur, donc vers l'application des membres.
    expect((await returnFromIdn(t, state)).origin).toBe(MEMBERS_ORIGIN)
    expect(await proofs(t)).toEqual([{ application: undefined, loa: 2 }])
  })

  it("une adresse de retour hors des origines de confiance ne scelle aucune application (seconde barrière)", async () => {
    // En service, `originCheck` de Better Auth refuse cette adresse dès le départ. Sous recette, Better
    // Auth éteint lui-même ce contrôle (`isTest()`, `NODE_ENV=test`) : le départ passe, et la recette
    // prouve que la règle du moteur, qui relit les origines de confiance au retour, ne scelle rien.
    const t = testConvex({ automaticSessions: false })
    stubIdn("idn-retour-etranger")
    const state = await startFrom(t, ADMIN_ORIGIN, { callbackURL: "https://ailleurs.example.test/entrer" })
    await returnFromIdn(t, state)
    expect(await proofs(t)).toEqual([{ application: undefined, loa: 2 }])
  })
})
