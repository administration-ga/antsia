// @vitest-environment edge-runtime
/**
 * ADR-0042 (CH-815) — la preuve de session IDN porte l'application où le retour LIVRE la session.
 *
 * Recette du VRAI parcours Better Auth, de bout en bout dans le moteur : départ `POST /sign-in/oauth2`
 * depuis une application du catalogue, puis rappel central `GET /oauth2/callback/idn` SANS en-tête
 * `Origin` (une navigation de navigateur), IDN simulé par un `fetch` de recette (découverte, jeton,
 * profil). L'application vient de l'état OAuth enregistré au départ, jamais de l'origine du rappel :
 * un rappel qui porterait l'origine d'une autre application n'y change rien.
 *
 * Durcissement après relecture (CH-815 A1b) :
 * - F1 : le rappel central est servi à l'origine de SITE_URL. Il ne pose AUCUN cookie de session sur cette
 *   origine (ni jeton de session, ni JWT Convex, ni cache) : la session n'est livrée que par le jeton à usage
 *   unique, que l'application de départ échange. L'application servie à SITE_URL elle-même entre ainsi.
 * - F2 : une application qui administre un réseau n'est scellée que si les trois adresses de retour valent
 *   EXACTEMENT son origine suivie de son chemin d'entrée (`entry_path` au catalogue), sans requête ni fragment.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { parseSetCookieHeader } from "better-auth/cookies"

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
async function authRequest(t: T, path: string, { method, origin, body, headers: extra }: { method: "GET" | "POST"; origin: string | null; body?: Record<string, unknown>; headers?: Record<string, string> }) {
  return await t.action(async (ctx) => {
    const { createAuth } = await import("./auth")
    const headers = new Headers(extra)
    if (origin) headers.set("Origin", origin)
    if (body) headers.set("Content-Type", "application/json")
    const response = await createAuth(ctx, origin).handler(new Request(`${PRIMARY_ORIGIN}/api/auth${path}`, { method, headers, ...(body ? { body: JSON.stringify(body) } : {}) }))
    return {
      status: response.status,
      location: response.headers.get("location"),
      body: await response.text(),
      // Ce que le NAVIGATEUR garderait sur l'origine servie : les cookies posés par la réponse.
      setCookies: response.headers.getSetCookie(),
      // La session rendue à l'application (greffon `crossDomain`), et le jeton porteur du greffon `bearer`.
      setBetterAuthCookie: response.headers.get("set-better-auth-cookie"),
      setAuthToken: response.headers.get("set-auth-token"),
    }
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
async function callbackFromIdn(t: T, state: string, origin: string | null = null) {
  const returned = await authRequest(t, `/oauth2/callback/idn?code=fictional-code&state=${encodeURIComponent(state)}`, { method: "GET", origin })
  expect(returned.status, returned.body).toBe(302)
  return returned
}

async function returnFromIdn(t: T, state: string, origin: string | null = null) {
  return new URL((await callbackFromIdn(t, state, origin)).location ?? "")
}

/** Les trois adresses de retour d'un départ (`callbackURL`, nouvel utilisateur, erreur), toutes égales. */
function returnURLs(url: string) {
  return { callbackURL: url, newUserCallbackURL: url, errorCallbackURL: url }
}

/** Les noms des cookies qu'une réponse pose (sans préfixe `__Secure-`). */
function cookieNames(setCookies: readonly string[]): string[] {
  return setCookies.map((cookie) => (cookie.split("=")[0] ?? "").trim().replace(/^__Secure-/, ""))
}

/**
 * L'application de départ échange le jeton à usage unique, comme son amorçage (`crossDomainClient`) :
 * `credentials: "omit"`, session vide dans `Better-Auth-Cookie`, session rendue dans `Set-Better-Auth-Cookie`.
 * Le client appelle `/cross-domain/one-time-token/verify`, que `convex/http.ts` réécrit vers l'endpoint du
 * greffon `oneTimeToken` appelé ici. Rend la paire de cookies que l'application garde dans son stockage.
 */
async function adoptOneTimeToken(t: T, origin: string, ott: string): Promise<string> {
  const adopted = await authRequest(t, "/one-time-token/verify", { method: "POST", origin, headers: { "Better-Auth-Cookie": "" }, body: { token: ott } })
  expect(adopted.status, adopted.body).toBe(200)
  expect(adopted.setCookies, "l'échange ne pose aucun cookie sur l'origine de l'application").toEqual([])
  const stored = parseSetCookieHeader(adopted.setBetterAuthCookie ?? "")
  const sessionToken = [...stored.entries()].find(([name]) => name.endsWith("better-auth.session_token"))
  expect(sessionToken?.[1].value, "la session revient à l'application").toBeTruthy()
  return [...stored.entries()].map(([name, cookie]) => `${name}=${cookie.value}`).join("; ")
}

/** Le JWT Convex que l'application obtient avec SA session (en-tête `Better-Auth-Cookie`), et son `sessionId`. */
async function convexSessionOf(t: T, origin: string, storedCookie: string): Promise<string> {
  const token = await authRequest(t, "/convex/token", { method: "GET", origin, headers: { "Better-Auth-Cookie": storedCookie } })
  expect(token.status, token.body).toBe(200)
  const jwt = (JSON.parse(token.body) as { token: string }).token
  const claims = JSON.parse(atob((jwt.split(".")[1] ?? "").replaceAll("-", "+").replaceAll("_", "/"))) as { sessionId?: unknown }
  if (typeof claims.sessionId !== "string") throw new Error("JWT sans session")
  return claims.sessionId
}

async function sealedSessions(t: T) {
  return await t.run(async (ctx) => (await ctx.db.query("operatorSessionProofs").take(10)).map((proof) => ({ sessionId: proof.sessionId, application: proof.application })))
}

async function proofs(t: T) {
  return await t.run(async (ctx) => (await ctx.db.query("operatorSessionProofs").take(10)).map((proof) => ({ application: proof.application, loa: proof.loa })))
}

describe("ADR-0042 — l'application de la session, prise de l'état OAuth enregistré au départ", () => {
  it("un départ de l'application d'administration scelle la session pour elle ; le jeton de session lui revient", async () => {
    const t = testConvex({ automaticSessions: false })
    stubIdn("idn-admin-retour")
    const state = await startFrom(t, ADMIN_ORIGIN, returnURLs(`${ADMIN_ORIGIN}/entrer`))
    const location = await returnFromIdn(t, state)
    // Le jeton à usage unique de la session part vers l'adresse de retour enregistrée, et vers elle seule.
    expect(location.origin).toBe(ADMIN_ORIGIN)
    expect(location.searchParams.get("ott")).toBeTruthy()
    expect(await proofs(t)).toEqual([{ application: NETWORK_ADMIN_APPLICATION_KEY, loa: 2 }])
  })

  it("des adresses de retour relatives sont rendues à l'origine de départ (`crossDomain`) : même application", async () => {
    const t = testConvex({ automaticSessions: false })
    stubIdn("idn-admin-relatif")
    const state = await startFrom(t, ADMIN_ORIGIN, returnURLs("/entrer"))
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
    const state = await startFrom(t, ADMIN_ORIGIN, { ...returnURLs(`${ADMIN_ORIGIN}/entrer`), newUserCallbackURL: `${MEMBERS_ORIGIN}/accueil` })
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

describe("revue F1 — le rappel central ne pose aucun cookie de session sur l'origine de SITE_URL", () => {
  // SITE_URL de la recette est l'origine d'antsia.ga en développement (`PRIMARY_ORIGIN`, port 3030).
  it.each([
    ["l'application d'administration", ADMIN_ORIGIN, "/entrer", NETWORK_ADMIN_APPLICATION_KEY],
    ["l'application des membres", MEMBERS_ORIGIN, "/fil", "diaspora_ga"],
    ["l'application servie à SITE_URL elle-même", PRIMARY_ORIGIN, "/fil", "antsia_ga"],
  ])("départ de %s : aucun cookie au rappel, la session passe par le seul jeton à usage unique", async (_label, origin, path, application) => {
    const t = testConvex({ automaticSessions: false })
    stubIdn(`idn-sans-cookie-${application}`)
    const state = await startFrom(t, origin, returnURLs(`${origin}${path}`))
    const callback = await callbackFromIdn(t, state)
    // Rien que le navigateur garderait sur l'origine du rappel : ni jeton de session, ni JWT Convex, ni cache.
    expect(cookieNames(callback.setCookies), "cookies posés par le rappel").toEqual([])
    // Le jeton porteur de la session n'est pas non plus rendu dans un en-tête de la navigation.
    expect(callback.setAuthToken).toBeNull()
    const location = new URL(callback.location ?? "")
    expect(location.origin).toBe(origin)
    const ott = location.searchParams.get("ott")
    if (!ott) throw new Error("Jeton à usage unique absent")
    // L'application entre : elle échange le jeton et obtient le JWT de la session scellée, sans aucun cookie du navigateur.
    const stored = await adoptOneTimeToken(t, origin, ott)
    const sessionId = await convexSessionOf(t, origin, stored)
    expect(await sealedSessions(t)).toEqual([{ sessionId, application }])
  })

  it("un refus chez IDN ne pose pas davantage de cookie", async () => {
    const t = testConvex({ automaticSessions: false })
    stubIdn("idn-refus-sans-cookie")
    const state = await startFrom(t, ADMIN_ORIGIN, returnURLs(`${ADMIN_ORIGIN}/entrer`))
    const refused = await authRequest(t, `/oauth2/callback/idn?error=access_denied&state=${encodeURIComponent(state)}`, { method: "GET", origin: null })
    expect(refused.status).toBe(302)
    expect(new URL(refused.location ?? "").searchParams.get("error")).toBe("access_denied")
    expect(refused.setCookies).toEqual([])
    expect(await proofs(t)).toEqual([])
  })
})

describe("revue F2 — une application qui administre un réseau n'est scellée qu'à son entrée exacte", () => {
  it("départ de l'application des membres vers une autre adresse de l'administration (chemin, requête) : rien n'est scellé", async () => {
    const t = testConvex({ automaticSessions: false })
    stubIdn("idn-membres-vers-admin")
    const state = await startFrom(t, MEMBERS_ORIGIN, returnURLs(`${ADMIN_ORIGIN}/anything?x=`))
    // Better Auth livre bien le jeton à cette adresse de confiance ; le moteur, lui, n'en fait pas une session d'administration.
    expect((await returnFromIdn(t, state)).origin).toBe(ADMIN_ORIGIN)
    expect(await proofs(t)).toEqual([{ application: undefined, loa: 2 }])
  })

  it("l'adresse d'entrée exacte, même depuis l'application des membres, scelle l'administration : la session n'est livrée qu'à son entrée", async () => {
    const t = testConvex({ automaticSessions: false })
    stubIdn("idn-membres-entree-exacte")
    const state = await startFrom(t, MEMBERS_ORIGIN, returnURLs(`${ADMIN_ORIGIN}/entrer`))
    const location = await returnFromIdn(t, state)
    expect(`${location.origin}${location.pathname}`).toBe(`${ADMIN_ORIGIN}/entrer`)
    expect(await proofs(t)).toEqual([{ application: NETWORK_ADMIN_APPLICATION_KEY, loa: 2 }])
  })

  it.each([
    ["une requête", { ...returnURLs(`${ADMIN_ORIGIN}/entrer?ott=ancien`) }],
    ["une requête vide", { ...returnURLs(`${ADMIN_ORIGIN}/entrer?`) }],
    ["un fragment", { ...returnURLs(`${ADMIN_ORIGIN}/entrer#suite`) }],
    ["une barre oblique finale", { ...returnURLs(`${ADMIN_ORIGIN}/entrer/`) }],
    ["un sous-chemin", { ...returnURLs(`${ADMIN_ORIGIN}/entrer/suite`) }],
    ["la racine", { ...returnURLs(`${ADMIN_ORIGIN}/`) }],
    ["une adresse de nouvel utilisateur ailleurs dans l'application", { ...returnURLs(`${ADMIN_ORIGIN}/entrer`), newUserCallbackURL: `${ADMIN_ORIGIN}/` }],
    ["une adresse d'erreur ailleurs dans l'application", { ...returnURLs(`${ADMIN_ORIGIN}/entrer`), errorCallbackURL: `${ADMIN_ORIGIN}/erreur` }],
    ["sans adresse de nouvel utilisateur", { callbackURL: `${ADMIN_ORIGIN}/entrer`, errorCallbackURL: `${ADMIN_ORIGIN}/entrer` }],
    ["sans adresse d'erreur (celle de Better Auth, au rappel central)", { callbackURL: `${ADMIN_ORIGIN}/entrer`, newUserCallbackURL: `${ADMIN_ORIGIN}/entrer` }],
  ])("départ de l'administration avec %s : rien n'est scellé", async (_label, urls) => {
    const t = testConvex({ automaticSessions: false })
    stubIdn("idn-admin-adresse-non-epinglee")
    const state = await startFrom(t, ADMIN_ORIGIN, urls)
    await returnFromIdn(t, state)
    expect(await proofs(t)).toEqual([{ application: undefined, loa: 2 }])
  })

  it("l'application des membres, qui n'administre rien, garde ses adresses libres", async () => {
    const t = testConvex({ automaticSessions: false })
    stubIdn("idn-membres-adresse-libre")
    const state = await startFrom(t, MEMBERS_ORIGIN, { callbackURL: `${MEMBERS_ORIGIN}/fil?onglet=recent` })
    await returnFromIdn(t, state)
    expect(await proofs(t)).toEqual([{ application: "diaspora_ga", loa: 2 }])
  })
})

describe("revue CH-815 A1b — une administration servie sur une origine de démonstration déclarée", () => {
  const DEMO_ADMIN = "https://admin.demo.example.test"

  it("sans déclaration, la session n'est scellée pour aucune application (le risque relevé au lot A8)", async () => {
    vi.stubEnv("TRUSTED_ORIGINS", DEMO_ADMIN)
    const t = testConvex({ automaticSessions: false })
    stubIdn("idn-demo-sans-declaration")
    const state = await startFrom(t, DEMO_ADMIN, returnURLs(`${DEMO_ADMIN}/entrer`))
    expect((await returnFromIdn(t, state)).origin).toBe(DEMO_ADMIN)
    expect(await proofs(t)).toEqual([{ application: undefined, loa: 2 }])
  })

  it("déclarée pour l'application d'administration et de confiance : scellée à son entrée exacte, et là seulement", async () => {
    vi.stubEnv("TRUSTED_ORIGINS", DEMO_ADMIN)
    vi.stubEnv("APPLICATION_EXTRA_ORIGINS_JSON", JSON.stringify({ [NETWORK_ADMIN_APPLICATION_KEY]: [DEMO_ADMIN] }))
    const t = testConvex({ automaticSessions: false })
    stubIdn("idn-demo-declaree")
    const state = await startFrom(t, DEMO_ADMIN, returnURLs(`${DEMO_ADMIN}/entrer`))
    const callback = await callbackFromIdn(t, state)
    expect(callback.setCookies).toEqual([])
    expect(new URL(callback.location ?? "").origin).toBe(DEMO_ADMIN)
    expect(await proofs(t)).toEqual([{ application: NETWORK_ADMIN_APPLICATION_KEY, loa: 2 }])
    stubIdn("idn-demo-autre-chemin")
    await returnFromIdn(t, await startFrom(t, DEMO_ADMIN, returnURLs(`${DEMO_ADMIN}/anything?x=`)))
    expect(await proofs(t)).toEqual(expect.arrayContaining([{ application: undefined, loa: 2 }]))
  })
})

describe("revue CH-815 A1b — le rattachement d'un compte IDN (`/oauth2/link`) ne scelle rien", () => {
  it("une session d'administration qui rattache son compte IDN ne crée ni session ni preuve, et ne pose aucun cookie", async () => {
    const t = testConvex({ automaticSessions: false })
    stubIdn("idn-rattachement")
    const state = await startFrom(t, ADMIN_ORIGIN, returnURLs(`${ADMIN_ORIGIN}/entrer`))
    const ott = (await returnFromIdn(t, state)).searchParams.get("ott")
    if (!ott) throw new Error("Jeton à usage unique absent")
    const stored = await adoptOneTimeToken(t, ADMIN_ORIGIN, ott)
    expect(await proofs(t)).toEqual([{ application: NETWORK_ADMIN_APPLICATION_KEY, loa: 2 }])

    const linked = await authRequest(t, "/oauth2/link", { method: "POST", origin: ADMIN_ORIGIN, headers: { "Better-Auth-Cookie": stored }, body: { providerId: "idn", ...returnURLs(`${ADMIN_ORIGIN}/entrer`) } })
    expect(linked.status, linked.body).toBe(200)
    const linkState = new URL(JSON.parse(linked.body).url as string).searchParams.get("state")
    if (!linkState) throw new Error("État OAuth du rattachement absent")
    vi.spyOn(console, "error").mockImplementation(() => {})
    const callback = await callbackFromIdn(t, linkState)
    // Le rattachement RÉUSSI (aucun code d'erreur) renvoie à l'adresse de retour, sans jeton à usage unique : aucune session n'est née.
    const destination = new URL(callback.location ?? "")
    expect(destination.searchParams.get("error")).toBeNull()
    expect(destination.searchParams.get("ott")).toBeNull()
    expect(callback.setCookies).toEqual([])
    expect(await proofs(t)).toEqual([{ application: NETWORK_ADMIN_APPLICATION_KEY, loa: 2 }])
  })
})
