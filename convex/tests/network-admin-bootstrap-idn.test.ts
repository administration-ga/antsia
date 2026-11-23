// @vitest-environment edge-runtime
/**
 * CH-831 (ADR-0043, brouillon de l'architecte) — le VRAI parcours, dans un environnement « comme la
 * démonstration » : moteur en nuage sous un nom FICTIF, démonstration déclarée à ce nom, AUCUN outil de
 * développement, `SITE_URL` = l'origine du site des membres (diaspora.ga), aucune origine de confiance
 * supplémentaire (`TRUSTED_ORIGINS` absent : seules les adresses du catalogue valent).
 *
 * Modèle : `betterAuth/idnApplication.test.ts` (vrai gestionnaire Better Auth du moteur, IDN simulé par
 * un `fetch` de recette, rappel central sans en-tête `Origin`, jeton à usage unique échangé sans cookie
 * du navigateur, JWT Convex de la session scellée).
 *
 * Scénario :
 * 1. Une personne se connecte par IDN côté MEMBRES, entre dans `diaspora-ga` (sa session est scellée pour
 *    l'application des membres : elle n'administre rien).
 * 2. Le propriétaire la nomme depuis son terminal (`networkAdminBootstrap.nameFirst`), alors même que
 *    `demo.administrateur`, équipé par le catalogue de démonstration, tient déjà le rôle.
 * 3. Elle entre par `https://admin.diaspora.ga/entrer` (IDN, entrée exacte) : `myNetworkAdmin`,
 *    `recordAccess`, puis des lectures d'administration passent ; la ligne d'amorçage est au journal.
 * 4. `demo.administrateur`, connecté par code (vrai envoi et vraie connexion par code du gestionnaire),
 *    reçoit le refus indistinct sur les mêmes lectures.
 * 5. Porte des comptes de démonstration ARMÉE : le parcours IDN passe toujours.
 */
import { NETWORK_FEATURES } from "@antsia/social-domain/networkFeatures"
import { ConvexError } from "convex/values"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { parseSetCookieHeader } from "better-auth/cookies"

import { api, components, internal } from "../_generated/api"
import type { Id } from "../_generated/dataModel"
import { DIASPORA_GA_DEMO_EMAIL_DOMAIN } from "../lib/devTools"
import { nameFirstConfirmation } from "../modules/platform/networkAdminBootstrap"
import { SEED_CONFIRMATION } from "../seeds/foundations"
import { openNetworkFeatures, testConvex } from "../test.setup"

type T = ReturnType<typeof testConvex>
type As = ReturnType<T["withIdentity"]>

/** Nom FICTIF du déploiement de démonstration (cliquet `no-deployment-identifiers`). */
const DEMO_NAME = "demo-antsia-831"
/** Les origines du catalogue (`deploy/catalog.json`) : le site des membres et l'administration de DIASPORA.GA. */
const MEMBERS_ORIGIN = "https://diaspora.ga"
const ADMIN_ORIGIN = "https://admin.diaspora.ga"
const ADMIN_ENTRY = `${ADMIN_ORIGIN}/entrer`
const ISSUER = "https://idn.example.test"
const DISCOVERY = `${ISSUER}/api/auth/convex/.well-known/openid-configuration`
const TOKEN_ENDPOINT = `${ISSUER}/api/auth/oauth2/token`
const USERINFO_ENDPOINT = `${ISSUER}/api/auth/oauth2/userinfo`
const SLUG = "diaspora-ga"
const HANDLE = "premiere.admin"
const REASON = "Premier administrateur de la démonstration, nommé par le propriétaire."
const DEMO_ADMIN_EMAIL = `administrateur@${DIASPORA_GA_DEMO_EMAIL_DOMAIN}`
const A = api.modules.networks.adminAccess
const F = api.modules.networks.features
const AUDIT = api.modules.platform.audit

// Porte des comptes de démonstration ARMÉE (CH-817) : valeurs FICTIVES, domaine `.test`.
const GATE_ENV = {
  ANTSIA_DEMO_GATE_SECRET: "fictional-demo-gate-secret-0123456789abcdef",
  WHATSAPP_PROVIDER: "bird",
  WHATSAPP_ENDPOINT: "https://whatsapp.example.test/messages",
  WHATSAPP_API_KEY: "fictional-access-key-0123456789",
  WHATSAPP_TEMPLATE: "fictional_otp",
}

beforeEach(() => {
  // « Comme la démonstration » : en nuage, déclarée à son nom, sans outil de développement.
  vi.stubEnv("CONVEX_CLOUD_URL", `https://${DEMO_NAME}.convex.cloud`)
  vi.stubEnv("CONVEX_SITE_URL", `https://${DEMO_NAME}.convex.site`)
  vi.stubEnv("ANTSIA_DEMO_DEPLOYMENT", DEMO_NAME)
  vi.stubEnv("SITE_URL", MEMBERS_ORIGIN)
  vi.stubEnv("BETTER_AUTH_SECRET", "fictional-auth-test-secret-at-least-thirty-two-characters")
  vi.stubEnv("IDN_CLIENT_ID", "sandbox-client-fixture")
  vi.stubEnv("IDN_CLIENT_SECRET", "fictional-idn-secret-for-tests")
  vi.stubEnv("IDN_ISSUER", ISSUER)
  for (const key of ["ANTSIA_DEV_TOOLS", "ANTIA_DEV_TOOLS", "TRUSTED_ORIGINS", "APPLICATION_EXTRA_ORIGINS_JSON", "IDN_DISCOVERY_URL", "RESEND_API_KEY", "RESEND_FROM_ADDRESS", "SMS_PROVIDER", "SMS_ENDPOINT", "SMS_API_KEY", "AUTH_DEFAULT_LOCALE", "NATIVE_AUTH_REDIRECT_URI", ...Object.keys(GATE_ENV)]) vi.stubEnv(key, undefined)
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function armGate() {
  for (const [key, value] of Object.entries(GATE_ENV)) vi.stubEnv(key, value)
}

/** IDN simulé : découverte, échange du code, profil (garantie 2, nationalité gabonaise). Aucun service externe. */
function stubIdn(subject: string) {
  const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } })
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url
    if (url.startsWith(DISCOVERY)) return json({ issuer: ISSUER, authorization_endpoint: `${ISSUER}/api/auth/oauth2/authorize`, token_endpoint: TOKEN_ENDPOINT, userinfo_endpoint: USERINFO_ENDPOINT })
    if (url.startsWith(TOKEN_ENDPOINT)) return json({ access_token: "fictional-access-token", token_type: "Bearer", expires_in: 3600 })
    if (url.startsWith(USERINFO_ENDPOINT)) return json({ sub: subject, email: `${subject}@example.test`, email_verified: true, loa: 2, nationality: "GA", profile_type: "citizen" })
    return new Response("inconnu", { status: 404 })
  }))
}

/** Une requête au VRAI gestionnaire Better Auth du moteur, servi à SITE_URL ; `origin: null` : aucune en-tête Origin. */
async function authRequest(t: T, path: string, { method, origin, body, headers: extra }: { method: "GET" | "POST"; origin: string | null; body?: Record<string, unknown>; headers?: Record<string, string> }) {
  return await t.action(async (ctx) => {
    const { createAuth } = await import("../betterAuth/auth")
    const headers = new Headers(extra)
    if (origin) headers.set("Origin", origin)
    if (body) headers.set("Content-Type", "application/json")
    const response = await createAuth(ctx, origin).handler(new Request(`${MEMBERS_ORIGIN}/api/auth${path}`, { method, headers, ...(body ? { body: JSON.stringify(body) } : {}) }))
    return { status: response.status, location: response.headers.get("location"), body: await response.text(), setBetterAuthCookie: response.headers.get("set-better-auth-cookie") }
  })
}

/** Le parcours IDN complet d'une application : départ, rappel central sans Origin, échange du jeton à usage unique, JWT Convex. */
async function signInWithIdn(t: T, origin: string, urls: Record<string, string>): Promise<{ location: URL; as: As }> {
  const started = await authRequest(t, "/sign-in/oauth2", { method: "POST", origin, body: { providerId: "idn", ...urls } })
  expect(started.status, started.body).toBe(200)
  const state = new URL(JSON.parse(started.body).url as string).searchParams.get("state")
  if (!state) throw new Error("État OAuth absent")
  const callback = await authRequest(t, `/oauth2/callback/idn?code=fictional-code&state=${encodeURIComponent(state)}`, { method: "GET", origin: null })
  expect(callback.status, callback.body).toBe(302)
  const location = new URL(callback.location ?? "")
  const ott = location.searchParams.get("ott")
  if (!ott) throw new Error("Jeton à usage unique absent")
  // L'application de destination échange le jeton, sans cookie du navigateur (`crossDomainClient`).
  const adopted = await authRequest(t, "/one-time-token/verify", { method: "POST", origin: location.origin, headers: { "Better-Auth-Cookie": "" }, body: { token: ott } })
  expect(adopted.status, adopted.body).toBe(200)
  const stored = [...parseSetCookieHeader(adopted.setBetterAuthCookie ?? "").entries()].map(([name, cookie]) => `${name}=${cookie.value}`).join("; ")
  const token = await authRequest(t, "/convex/token", { method: "GET", origin: location.origin, headers: { "Better-Auth-Cookie": stored } })
  expect(token.status, token.body).toBe(200)
  const jwt = (JSON.parse(token.body) as { token: string }).token
  const claims = JSON.parse(atob((jwt.split(".")[1] ?? "").replaceAll("-", "+").replaceAll("_", "/"))) as { sub?: unknown; sessionId?: unknown }
  if (typeof claims.sub !== "string" || typeof claims.sessionId !== "string") throw new Error("JWT sans sujet ni session")
  return { location, as: t.withIdentity({ subject: claims.sub, sessionId: claims.sessionId }) }
}

/**
 * La connexion par CODE du vrai gestionnaire, demandée depuis `origin` (envoi, code lu par la
 * démonstration déclarée pour une adresse réservée, connexion).
 */
async function signInWithCode(t: T, email: string, origin: string = MEMBERS_ORIGIN): Promise<As> {
  const sent = await authRequest(t, "/email-otp/send-verification-otp", { method: "POST", origin, body: { email, type: "sign-in" } })
  expect(sent.status, sent.body).toBe(200)
  const code = await t.query(api.modules.platform.devTools.latestOtp, { email })
  if (!code) throw new Error("Code de démonstration absent")
  const signedIn = await authRequest(t, "/sign-in/email-otp", { method: "POST", origin, body: { email, otp: code.code } })
  expect(signedIn.status, signedIn.body).toBe(200)
  const { token, user } = JSON.parse(signedIn.body) as { token: string; user: { id: string } }
  const session = (await t.query(components.betterAuth.adapter.findOne, { model: "session", where: [{ field: "token", value: token }] })) as { _id: string } | null
  if (!session) throw new Error("Session par code absente")
  return t.withIdentity({ subject: user.id, sessionId: session._id })
}

/** L'accueil réel (consentement, profil publié) puis l'entrée dans diaspora-ga. */
async function joinDiaspora(as: As, network: Id<"networks">, handle: string, displayName: string) {
  await as.mutation(api.modules.people.persons.ensureMyPerson, {})
  await as.mutation(api.modules.people.consents.recordConsent, { purpose: "social_profile", origin: "onboarding" })
  await as.mutation(api.modules.people.profile.publishMyProfile, { handle, displayName })
  await as.mutation(api.modules.diaspora.membership.joinDiasporaGa, { networkId: network, facet: { countryOfResidence: "FR" }, directoryVisibility: "hidden" })
}

async function refusalCodeOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise
    return null
  } catch (error) {
    return error instanceof ConvexError ? (error.data as { code?: unknown }).code : String(error)
  }
}

async function proofs(t: T) {
  return await t.run(async (ctx) => (await ctx.db.query("operatorSessionProofs").take(20)).map((proof) => proof.application))
}

async function fixture() {
  const t = testConvex({ automaticSessions: false })
  await t.mutation(internal.seeds.foundations.run, { confirmNonProduction: SEED_CONFIRMATION })
  const { network } = await t.mutation(internal.modules.diaspora.seed.run, { confirmNonProduction: SEED_CONFIRMATION })
  // Les modules ouverts comme l'administration les ouvrirait (l'acteur administrateur de démonstration en dépend).
  await openNetworkFeatures(t, network, NETWORK_FEATURES)
  return { t, network }
}

/** Étapes 1 à 3 : membre par IDN, nommé par le terminal, puis entré par l'administration. */
async function nameAndEnter(t: T, network: Id<"networks">, subject: string) {
  stubIdn(subject)
  const members = await signInWithIdn(t, MEMBERS_ORIGIN, { callbackURL: `${MEMBERS_ORIGIN}/fil` })
  expect(members.location.origin).toBe(MEMBERS_ORIGIN)
  await joinDiaspora(members.as, network, HANDLE, "Première Administratrice")
  expect(await proofs(t)).toContain("diaspora_ga")

  expect(await t.mutation(internal.modules.platform.networkAdminBootstrap.nameFirst, { confirmation: nameFirstConfirmation(SLUG, HANDLE), networkSlug: SLUG, handle: HANDLE, reason: REASON })).toEqual({ changed: true, from: "member", to: "network_admin", personId: expect.any(String), handle: HANDLE })
  // Nommée, sa session des MEMBRES n'administre toujours rien (ADR-0042 inchangé).
  expect(await refusalCodeOf(members.as.query(A.myNetworkAdmin, { networkId: network }))).toBe("notFound")

  const admin = await signInWithIdn(t, ADMIN_ORIGIN, { callbackURL: ADMIN_ENTRY, newUserCallbackURL: ADMIN_ENTRY, errorCallbackURL: ADMIN_ENTRY })
  expect(`${admin.location.origin}${admin.location.pathname}`).toBe(ADMIN_ENTRY)
  expect(await proofs(t)).toContain("admin_diaspora_ga")
  expect(await admin.as.query(A.myNetworkAdmin, { networkId: network })).toMatchObject({ networkSlug: SLUG, accessLogged: false })
  await admin.as.mutation(A.recordAccess, { networkId: network })
  expect(await admin.as.query(A.myNetworkAdmin, { networkId: network })).toMatchObject({ accessLogged: true })
  return { admin: admin.as }
}

/** Les lectures d'administration : les réglages du réseau et le journal du réseau filtré sur les changements de rôle. */
function adminReads(as: As, network: Id<"networks">) {
  return {
    settings: () => as.query(F.settings, { networkId: network }),
    roleAudit: () => as.query(AUDIT.paginateNetworkAdminAudit, { networkId: network, action: "membership.role_set", paginationOpts: { numItems: 20, cursor: null } }),
  }
}

describe("CH-831 — amorçage sur un environnement comme la démonstration, vrai parcours IDN", () => {
  it("membre par IDN, nommé par le terminal malgré demo.administrateur, puis administrateur par l'entrée exacte ; demo.administrateur par code est refusé", async () => {
    const { t, network } = await fixture()

    // demo.administrateur, connecté par CODE et équipé par le catalogue de démonstration : il tient le rôle.
    const demoAdmin = await signInWithCode(t, DEMO_ADMIN_EMAIL)
    await joinDiaspora(demoAdmin, network, "demo.administrateur", "Serge EYENE")
    expect(await demoAdmin.mutation(api.modules.diaspora.demoAccounts.equipMyDemoAccount, { actor: "administrateur" })).toMatchObject({ role: "network_admin" })

    const { admin } = await nameAndEnter(t, network, "idn-premiere-admin")
    const reads = adminReads(admin, network)
    expect(await refusalCodeOf(reads.settings())).toBeNull()
    const journal = await reads.roleAudit()
    expect(journal.page).toEqual([expect.objectContaining({ action: "membership.role_set", capacity: "system", actor: null, reason: REASON, details: { reason: REASON, from: "member", to: "network_admin", origin: "bootstrap" } })])

    // demo.administrateur : le rôle ne suffit pas, aucune session IDN prouvée de l'administration.
    const demoReads = adminReads(demoAdmin, network)
    expect(await refusalCodeOf(demoAdmin.query(A.myNetworkAdmin, { networkId: network }))).toBe("notFound")
    expect(await refusalCodeOf(demoReads.settings())).toBe("notFound")
    expect(await refusalCodeOf(demoReads.roleAudit())).toBe("notFound")

    // La même connexion par code, demandée depuis l'ORIGINE de l'administration : une session sans preuve
    // IDN de cette application, donc le même refus indistinct (l'origine n'ouvre rien).
    const demoFromAdmin = await signInWithCode(t, DEMO_ADMIN_EMAIL, ADMIN_ORIGIN)
    const demoFromAdminReads = adminReads(demoFromAdmin, network)
    expect(await refusalCodeOf(demoFromAdmin.query(A.myNetworkAdmin, { networkId: network }))).toBe("notFound")
    expect(await refusalCodeOf(demoFromAdmin.mutation(A.recordAccess, { networkId: network }))).toBe("notFound")
    expect(await refusalCodeOf(demoFromAdminReads.settings())).toBe("notFound")
    expect(await refusalCodeOf(demoFromAdminReads.roleAudit())).toBe("notFound")
  })

  it("porte des comptes de démonstration armée : le parcours IDN, la nomination et l'entrée passent toujours", async () => {
    armGate()
    const { t, network } = await fixture()
    // La porte est bien armée : sans session de porte, l'envoi d'un code à une adresse réservée répond
    // comme un envoi réel (refus indistinct, CH-817 E5) mais AUCUN code n'est enregistré — porte non
    // armée, le même envoi l'enregistre (premier test, `signInWithCode`).
    const gated = await authRequest(t, "/email-otp/send-verification-otp", { method: "POST", origin: MEMBERS_ORIGIN, body: { email: DEMO_ADMIN_EMAIL, type: "sign-in" } })
    expect(gated.status, gated.body).toBe(200)
    expect(await t.run(async (ctx) => await ctx.db.query("devOtpCodes").withIndex("by_email", (q) => q.eq("email", DEMO_ADMIN_EMAIL)).unique())).toBeNull()
    const { admin } = await nameAndEnter(t, network, "idn-admin-porte-armee")
    expect(await refusalCodeOf(adminReads(admin, network).settings())).toBeNull()
  })
})
