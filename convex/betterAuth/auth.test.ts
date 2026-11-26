// @vitest-environment edge-runtime
/** Recette du vrai gestionnaire Better Auth et de ses composants, sans service externe. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { Resend } from "@convex-dev/resend"
import { getFunctionName } from "convex/server"

import { DEMO_GATE_TOKEN_HEADER } from "@antsia/social-contracts/demoGate"

import catalog from "../../deploy/catalog.json"
import { api, components, internal } from "../_generated/api"
import { demoGateDigest } from "../lib/demoGate"
import { allowPhonesImpl, DEMO_GATE_SESSION_TTL_MS, revokePhonesImpl } from "../modules/platform/demoGate"
import { SEED_CONFIRMATION } from "../seeds/foundations"
import { createTestSession, testConvex } from "../test.setup"
import { OTP_TTL_SECONDS } from "./auth"
import { otpPresentation } from "./delivery"

const PRIMARY_ORIGIN = "http://localhost:3030"
const PEER_ORIGIN = "http://localhost:3031"
const TEST_SECRET = "fictional-auth-test-secret-at-least-thirty-two-characters"
const EMAIL = "alice.auth@example.test"
const PHONE = "+24107890123"
type T = ReturnType<typeof testConvex>

beforeEach(() => {
  vi.stubEnv("SITE_URL", PRIMARY_ORIGIN)
  vi.stubEnv("CONVEX_SITE_URL", "http://127.0.0.1:3211")
  vi.stubEnv("CONVEX_CLOUD_URL", "http://127.0.0.1:3210")
  vi.stubEnv("ANTSIA_DEV_TOOLS", "true")
  vi.stubEnv("BETTER_AUTH_SECRET", TEST_SECRET)
  for (const key of ["IDN_CLIENT_ID", "IDN_CLIENT_SECRET", "IDN_ISSUER", "IDN_DISCOVERY_URL", "RESEND_API_KEY", "RESEND_FROM_ADDRESS", "SMS_PROVIDER", "SMS_ENDPOINT", "SMS_API_KEY", "TRUSTED_ORIGINS", "AUTH_DEFAULT_LOCALE"]) vi.stubEnv(key, undefined)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("Réponse de recette inattendue")
  return value as Record<string, unknown>
}

/** EA-08 : un refus de débit porte son délai restant (corps et en-tête), et rien d'autre. */
function expectRetryAfter(refusal: { data: unknown; retryAfter: string | null }, maxMs: number, identifier: string) {
  const body = record(refusal.data)
  expect(body).toEqual({ code: "rateLimited", message: "rateLimited", retryAfterMs: expect.any(Number) })
  const retryAfterMs = body.retryAfterMs as number
  expect(Number.isInteger(retryAfterMs)).toBe(true)
  expect(retryAfterMs).toBeGreaterThan(0)
  expect(retryAfterMs).toBeLessThanOrEqual(maxMs)
  expect(refusal.retryAfter).toBe(String(Math.ceil(retryAfterMs / 1_000)))
  expect(JSON.stringify(body).toLowerCase()).not.toContain(identifier.toLowerCase())
}

function textField(value: unknown, key: string): string {
  const field = record(value)[key]
  if (typeof field !== "string" || !field) throw new Error(`Champ de recette absent : ${key}`)
  return field
}

async function request(t: T, path: string, { method = "POST", body, token, origin = PRIMARY_ORIGIN, acceptLanguage, browserCookie, extraHeaders }: { method?: "GET" | "POST"; body?: Record<string, unknown>; token?: string; origin?: string; acceptLanguage?: string; browserCookie?: string; extraHeaders?: Record<string, string> } = {}) {
  const response = await t.action(async (ctx) => {
    const { createAuth } = await import("./auth")
    const headers = new Headers({ Origin: origin, ...extraHeaders })
    if (body) headers.set("Content-Type", "application/json")
    if (token) headers.set("Authorization", `Bearer ${token}`)
    if (acceptLanguage) headers.set("Accept-Language", acceptLanguage)
    if (browserCookie !== undefined) headers.set("Better-Auth-Cookie", browserCookie)
    const result = await createAuth(ctx, origin).handler(new Request(`${PRIMARY_ORIGIN}/api/auth${path}`, {
      method,
      headers,
      ...(body ? { body: JSON.stringify(body) } : {}),
    }))
    return { status: result.status, body: await result.text(), tokenHeader: result.headers.get("set-auth-token"), hasBrowserCookie: result.headers.has("set-better-auth-cookie"), retryAfter: result.headers.get("retry-after"), setCookie: result.headers.get("set-cookie"), location: result.headers.get("location") }
  })
  return { ...response, data: response.body ? JSON.parse(response.body) as unknown : null }
}

async function issueCode(t: T, channel: "email" | "phone", identifier = channel === "email" ? EMAIL : PHONE) {
  const response = channel === "email"
    ? await request(t, "/email-otp/send-verification-otp", { body: { email: identifier, type: "sign-in" } })
    : await request(t, "/phone-number/send-otp", { body: { phoneNumber: identifier } })
  expect(response.status).toBe(200)
  const code = await t.query(api.modules.platform.devTools.latestOtp, { email: identifier })
  expect(code?.code).toMatch(/^\d{6}$/)
  if (!code) throw new Error("Code de recette absent")
  return code
}

async function signIn(t: T, channel: "email" | "phone", code: string, identifier = channel === "email" ? EMAIL : PHONE) {
  return channel === "email"
    ? await request(t, "/sign-in/email-otp", { body: { email: identifier, otp: code } })
    : await request(t, "/phone-number/verify", { body: { phoneNumber: identifier, code } })
}

async function loggedIn(t: T, channel: "email" | "phone" = "email") {
  const code = await issueCode(t, channel)
  const result = await signIn(t, channel, code.code)
  expect(result.status).toBe(200)
  const token = textField(result.data, "token")
  const user = record(record(result.data).user)
  const session: unknown = await t.query(components.betterAuth.adapter.findOne, { model: "session", where: [{ field: "token", value: token }] })
  expect(session).not.toBeNull()
  return { result, token, user, session: record(session), userId: textField(user, "id"), sessionId: textField(session, "_id") }
}

type EngineAuth = ReturnType<typeof import("./auth")["createAuth"]>
type ProofHookInput = { path: string; context: { newSession?: { session: Record<string, unknown> & { id: string; userId: string } } } }

/** Les callbacks du VRAI plugin sont invoqués directement ; ce n'est pas une recette HTTP OIDC. */
function idnCallbackHooks(auth: EngineAuth) {
  const oauth = auth.options.plugins?.find((plugin) => plugin.id === "generic-oauth")
  if (!oauth || !("options" in oauth)) throw new Error("Plugin IDN de fixture absent")
  const options = record(oauth.options)
  if (!Array.isArray(options.config) || options.config.length !== 1) throw new Error("Fournisseur IDN de fixture absent")
  const provider = record(options.config[0])
  if (typeof provider.mapProfileToUser !== "function") throw new Error("Mapping IDN de fixture absent")
  const proofPlugin = auth.options.plugins?.find((plugin) => plugin.id === "engine-idn-session-proof")
  const hook = proofPlugin && "hooks" in proofPlugin && proofPlugin.hooks && "after" in proofPlugin.hooks ? proofPlugin.hooks.after?.[0] : undefined
  if (!hook) throw new Error("Hook de preuve IDN de fixture absent")
  return {
    mapProfile: provider.mapProfileToUser as (profile: Record<string, unknown>) => Promise<unknown>,
    matches: hook.matcher as unknown as (input: { path: string }) => boolean,
    runAfter: hook.handler as unknown as (input: ProofHookInput) => Promise<unknown>,
  }
}

function configureIdnFixture() {
  vi.stubEnv("IDN_CLIENT_ID", "sandbox-client-fixture")
  vi.stubEnv("IDN_CLIENT_SECRET", "fictional-idn-secret-for-tests")
  vi.stubEnv("IDN_ISSUER", "https://idn.example.test")
}

async function callbackSessionFixture(t: T) {
  const now = Date.now()
  const user = await t.mutation(components.betterAuth.adapter.create, { input: { model: "user", data: { name: "Nom civil fictif non social", email: "idn-session@example.test", emailVerified: true, createdAt: now, updatedAt: now } } })
  const userId = textField(user, "_id")
  const sessionId = await createTestSession(t, userId)
  const session = await t.query(components.betterAuth.adapter.findOne, { model: "session", where: [{ field: "_id", value: sessionId }] })
  const subject = "idn-session-fixture"
  await t.mutation(components.betterAuth.adapter.create, { input: { model: "account", data: { userId, providerId: "idn", accountId: subject, createdAt: now, updatedAt: now } } })
  return { userId, sessionId, subject, session: { ...record(session), id: sessionId, userId } }
}

async function addHistoricalMembership(t: T, userId: string) {
  await t.mutation(internal.seeds.foundations.run, { confirmNonProduction: SEED_CONFIRMATION })
  const { network } = await t.mutation(internal.modules.diaspora.seed.run, { confirmNonProduction: SEED_CONFIRMATION })
  await t.run(async ctx => {
    const now = Date.now()
    const person = await ctx.db.insert("persons", { authUserId: userId, createdAt: now, updatedAt: now })
    await ctx.db.insert("networkMemberships", {
      networkId: network, personId: person, role: "member", status: "declaree", joinedAt: now, statusChangedAt: now,
    })
  })
}

describe("connexion téléphone et anciens comptes de DIASPORA.GA", () => {
  const origin = catalog.applications.diaspora_ga.site_url
  const endpoint = "https://bird.example.test/messages"

  function configureWhatsApp() {
    vi.stubEnv("WHATSAPP_PROVIDER", "bird")
    vi.stubEnv("WHATSAPP_ENDPOINT", endpoint)
    vi.stubEnv("WHATSAPP_API_KEY", "fictional-workspace-key-0123456789")
    vi.stubEnv("WHATSAPP_TEMPLATE", "bird_fictional_otp")
  }

  it("envoie six chiffres au téléphone par WhatsApp et ouvre une seule session avec ce code", async () => {
    const t = testConvex({ automaticSessions: false })
    configureWhatsApp()
    const send = vi.fn(async () => Response.json({ id: "wam_fictional", status: "accepted" }, { status: 202 }))
    vi.stubGlobal("fetch", send)
    expect((await t.query(api.modules.platform.authentication.configuration, {})).whatsappOtp).toBe(true)
    const body = { phoneNumber: PHONE }
    expect((await request(t, "/phone-number/send-otp", { origin, body })).status).toBe(200)
    expect(send).toHaveBeenCalledOnce()
    const [destination, init] = vi.mocked(fetch).mock.calls[0]!
    expect(destination).toBe(endpoint)
    const message = JSON.parse(String(init?.body))
    expect(message.to).toBe(PHONE)
    const code = message.template.parameters.code
    expect(code).toMatch(/^\d{6}$/)
    expect(await t.query(api.modules.platform.devTools.latestOtp, { email: PHONE })).toBeNull()
    const verification = { ...body, code, disableSession: false }
    const signedIn = await request(t, "/phone-number/verify", { origin, body: verification, browserCookie: "" })
    expect(signedIn.status).toBe(200)
    expect(signedIn.hasBrowserCookie).toBe(true)
    expect(record(record(signedIn.data).user).phoneNumberVerified).toBe(true)
    expect((await request(t, "/phone-number/verify", { origin, body: verification })).status).toBe(400)
  })

  it("rattache la session au compte qui possède déjà ce téléphone vérifié, sans créer de compte ni de niveau 2", async () => {
    const t = testConvex({ automaticSessions: false })
    const now = Date.now()
    const existing = await t.mutation(components.betterAuth.adapter.create, {
      input: { model: "user", data: { email: EMAIL, emailVerified: true, phoneNumber: PHONE, phoneNumberVerified: true, name: "Ancien compte", createdAt: now, updatedAt: now } },
    })
    const existingId = textField(existing, "_id")
    configureWhatsApp()
    const send = vi.fn(async () => Response.json({ id: "wam_migration", status: "accepted" }, { status: 202 }))
    vi.stubGlobal("fetch", send)
    await request(t, "/phone-number/send-otp", { origin, body: { phoneNumber: PHONE } })
    const requestBody = JSON.parse(String(vi.mocked(fetch).mock.calls[0]![1]?.body))
    const signedIn = await request(t, "/phone-number/verify", { origin, body: { phoneNumber: PHONE, code: requestBody.template.parameters.code } })
    expect(signedIn.status).toBe(200)
    expect(record(record(signedIn.data).user)).toMatchObject({ id: existingId, email: EMAIL })
    const users = await t.query(components.betterAuth.adapter.findMany, {
      model: "user", where: [{ field: "phoneNumber", value: PHONE }], paginationOpts: { cursor: null, numItems: 10 },
    })
    expect(users.page).toHaveLength(1)
    expect(await t.run(ctx => ctx.db.query("consularAttestations").first())).toBeNull()
    expect(await t.run(ctx => ctx.db.query("networkMemberships").first())).toBeNull()
  })

  it("ferme la porte si WhatsApp est absent ou refuse le message, sans repli sur le SMS", async () => {
    const t = testConvex({ automaticSessions: false })
    vi.stubEnv("WHATSAPP_PROVIDER", undefined)
    const body = { phoneNumber: PHONE }
    expect((await t.query(api.modules.platform.authentication.configuration, {})).whatsappOtp).toBe(false)
    const unavailable = await request(t, "/phone-number/send-otp", { origin, body })
    expect(unavailable.status).toBe(503)
    configureWhatsApp()
    const send = vi.fn(async () => new Response(null, { status: 401 }))
    vi.stubGlobal("fetch", send)
    expect((await request(t, "/phone-number/send-otp", { origin, body })).status).toBe(503)
    expect(send).toHaveBeenCalledOnce()
    expect(await t.query(components.betterAuth.adapter.findOne, {
      model: "verification", where: [{ field: "identifier", value: PHONE }],
    })).toBeNull()
  })

  it("réserve l’e-mail à la connexion des comptes existants", async () => {
    const t = testConvex({ automaticSessions: false })
    const body = { email: EMAIL, type: "sign-in" }
    expect((await request(t, "/email-otp/send-verification-otp", { origin, body })).status).toBe(200)
    expect(await t.query(api.modules.platform.devTools.latestOtp, { email: EMAIL })).toBeNull()
    expect((await request(t, "/sign-in/email-otp", { origin, body: { email: EMAIL, otp: "123456" } })).status).toBe(400)
  })

  it("un compte ANTSIA ne se connecte par e-mail à Diaspora qu’après une adhésion existante", async () => {
    const t = testConvex({ automaticSessions: false })
    const body = { email: EMAIL, type: "sign-in" }
    const existing = await loggedIn(t, "email")
    const codeForRootAccount = await issueCode(t, "email")
    expect((await request(t, "/sign-in/email-otp", { origin, body: { email: EMAIL, otp: codeForRootAccount.code } })).status).toBe(400)
    await addHistoricalMembership(t, existing.userId)
    expect((await request(t, "/email-otp/send-verification-otp", { origin, body })).status).toBe(200)
    const sent = await t.query(api.modules.platform.devTools.latestOtp, { email: EMAIL })
    const signedIn = await request(t, "/sign-in/email-otp", { origin, body: { email: EMAIL, otp: sent!.code } })
    expect(signedIn.status).toBe(200)
    expect(record(record(signedIn.data).user).id).toBe(existing.userId)
  })
})

describe("connexion légère e-mail et SMS réelle dans Better Auth", () => {
  it.each(["email", "phone"] as const)("le code %s crée un utilisateur et une session de sept jours sans publier de profil", async (channel) => {
    const t = testConvex({ automaticSessions: false })
    const { user, session, userId, sessionId } = await loggedIn(t, channel)
    expect(session.userId).toBe(userId)
    const duration = Number(session.expiresAt) - Number(session.createdAt)
    expect(duration).toBeGreaterThanOrEqual(7 * 24 * 60 * 60 * 1000 - 1000)
    expect(duration).toBeLessThanOrEqual(7 * 24 * 60 * 60 * 1000 + 1000)
    expect(channel === "email" ? user.emailVerified : user.phoneNumberVerified).toBe(true)
    if (channel === "phone") expect(user.phoneNumber).toBe(PHONE)
    expect(await t.run((ctx) => ctx.db.query("persons").first())).toBeNull()

    const as = t.withIdentity({ subject: userId, sessionId })
    const personId = await as.mutation(api.modules.people.persons.ensureMyPerson, {})
    const person = await t.run((ctx) => ctx.db.get(personId))
    expect(person?.displayName).toBeUndefined()
    expect(person?.handle).toBeUndefined()
    expect(person?.publishedAt).toBeUndefined()
    expect(await t.run((ctx) => ctx.db.query("networkMemberships").first())).toBeNull()
  })

  it.each(["email", "phone"] as const)("le transport navigateur %s conserve le corps de session et son cookie", async (channel) => {
    const t = testConvex({ automaticSessions: false })
    const code = await issueCode(t, channel)
    const result = await request(t, channel === "email" ? "/sign-in/email-otp" : "/phone-number/verify", {
      body: channel === "email" ? { email: EMAIL, otp: code.code } : { phoneNumber: PHONE, code: code.code },
      browserCookie: "",
    })
    expect(result.status).toBe(200)
    expect(textField(result.data, "token")).toBeTruthy()
    expect(textField(record(result.data).user, "id")).toBeTruthy()
    expect(result.hasBrowserCookie).toBe(true)
  })

  it.each(["email", "phone"] as const)("un code %s consommé ne peut ouvrir une deuxième session", async (channel) => {
    const t = testConvex({ automaticSessions: false })
    const code = await issueCode(t, channel)
    expect((await signIn(t, channel, code.code)).status).toBe(200)
    expect((await signIn(t, channel, code.code)).status).toBe(400)
  })

  it.each(["email", "phone"] as const)("un mauvais code %s est refusé sans consommer le bon code avant la borne d'essais", async (channel) => {
    const t = testConvex({ automaticSessions: false })
    const code = await issueCode(t, channel)
    const wrong = code.code === "000000" ? "111111" : "000000"
    const refusal = await signIn(t, channel, wrong)
    expect(refusal.status).toBe(400)
    expect(record(refusal.data).code).toBe("INVALID_OTP")
    expect((await signIn(t, channel, code.code)).status).toBe(200)
  })

  it.each(["email", "phone"] as const)("un code %s expiré est refusé", async (channel) => {
    vi.useFakeTimers({ toFake: ["Date"] })
    const t = testConvex({ automaticSessions: false })
    const code = await issueCode(t, channel)
    vi.setSystemTime(code.expiresAt + 1)
    const refusal = await signIn(t, channel, code.code)
    expect(refusal.status).toBe(400)
    expect(record(refusal.data).code).toMatch(/OTP_EXPIRED|INVALID_OTP|OTP_NOT_FOUND/)
    expect(await t.run((ctx) => ctx.db.query("persons").first())).toBeNull()
  })

  it.each(["email", "phone"] as const)("le seau d'envoi %s impose trois codes par fenêtre", async (channel) => {
    const t = testConvex({ automaticSessions: false })
    for (let count = 0; count < 3; count++) await issueCode(t, channel)
    const refusal = channel === "email"
      ? await request(t, "/email-otp/send-verification-otp", { body: { email: EMAIL.toUpperCase(), type: "sign-in" } })
      : await request(t, "/phone-number/send-otp", { body: { phoneNumber: PHONE } })
    expect(refusal.status).toBe(429)
    expect(record(refusal.data).code).toBe("rateLimited")
    // EA-08 : le délai restant accompagne le refus — un jeton du seau (3 par 5 min) revient en 100 s au plus.
    expectRetryAfter(refusal, 100_000, channel === "email" ? EMAIL : PHONE)
  })

  it("le seau de connexion compte aussi les essais sans code existant", async () => {
    const t = testConvex({ automaticSessions: false })
    for (let count = 0; count < 5; count++) expect((await signIn(t, "email", "000000")).status).toBe(400)
    const refusal = await signIn(t, "email", "000000")
    expect(refusal.status).toBe(429)
    expect(record(refusal.data).code).toBe("rateLimited")
    // EA-08 : 5 essais par 15 min — un essai revient en 180 s au plus.
    expectRetryAfter(refusal, 180_000, EMAIL)
  })

  it("EA-08 : la configuration publique dit la durée de validité réelle d'un code, lue de la constante des greffons", async () => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(Date.UTC(2026, 10, 11, 9, 0, 0))
    const t = testConvex({ automaticSessions: false })
    const configuration = await t.query(api.modules.platform.authentication.configuration, {})
    expect(configuration.otpTtlSeconds).toBe(OTP_TTL_SECONDS)
    // La durée publiée est celle que les deux greffons appliquent (ligne de vérification de Better Auth),
    // et celle du code de développement affiché : e-mail et SMS.
    for (const [channel, identifier] of [["email", `sign-in-otp-${EMAIL}`], ["phone", PHONE]] as const) {
      const issuedAt = Date.now()
      const code = await issueCode(t, channel)
      const verification: unknown = await t.query(components.betterAuth.adapter.findOne, { model: "verification", where: [{ field: "identifier", value: identifier }] })
      expect(Number(record(verification).expiresAt) - issuedAt).toBe(OTP_TTL_SECONDS * 1_000)
      expect(code.expiresAt - issuedAt).toBe(OTP_TTL_SECONDS * 1_000)
    }
  })

  it("refuse un téléphone non international avant l'envoi", async () => {
    const t = testConvex({ automaticSessions: false })
    const refusal = await request(t, "/phone-number/send-otp", { body: { phoneNumber: "07890123" } })
    expect(refusal.status).toBe(400)
    expect(record(refusal.data).code).toBe("INVALID_PHONE_NUMBER")
    expect(await t.query(api.modules.platform.devTools.latestOtp, { email: "07890123" })).toBeNull()
  })

  it("un drapeau local oublié sur un backend cloud n'expose ni ne délivre de code", async () => {
    vi.stubEnv("CONVEX_CLOUD_URL", "https://backend.example.test")
    const t = testConvex({ automaticSessions: false })
    const refusal = await request(t, "/email-otp/send-verification-otp", { body: { email: EMAIL, type: "sign-in" } })
    expect(refusal.status).toBe(503)
    expect(record(refusal.data).code).toBe("otpDeliveryUnavailable")
    expect(await t.query(api.modules.platform.devTools.latestOtp, { email: EMAIL })).toBeNull()
  })

  it("une origine étrangère ne peut envoyer de code", async () => {
    const t = testConvex({ automaticSessions: false })
    const refusal = await request(t, "/email-otp/send-verification-otp", { origin: "https://foreign.example.test", body: { email: EMAIL, type: "sign-in" } })
    expect(refusal.status).toBe(403)
    expect(await t.query(api.modules.platform.devTools.latestOtp, { email: EMAIL })).toBeNull()
  })

  it("un transport e-mail configuré mais défaillant rend un refus explicite sans détail privé", async () => {
    vi.stubEnv("CONVEX_CLOUD_URL", "https://backend.example.test")
    vi.stubEnv("RESEND_API_KEY", "fictional-resend-test-key")
    vi.stubEnv("RESEND_FROM_ADDRESS", "ANTSIA <no-reply@example.test>")
    const send = vi.spyOn(Resend.prototype, "sendEmail").mockRejectedValueOnce(new Error("private-provider-diagnostic"))
    const t = testConvex({ automaticSessions: false })
    const refusal = await request(t, "/email-otp/send-verification-otp", { body: { email: EMAIL, type: "sign-in" } })
    expect(send).toHaveBeenCalledOnce()
    expect(refusal.status).toBe(503)
    expect(record(refusal.data).code).toBe("otpDeliveryUnavailable")
    expect(refusal.body).not.toContain("private-provider-diagnostic")
    expect(refusal.body).not.toContain("fictional-resend-test-key")
    expect(await t.query(api.modules.platform.devTools.latestOtp, { email: EMAIL })).toBeNull()
    expect(await t.run((ctx) => ctx.db.query("persons").first())).toBeNull()
  })
})

describe("déploiement de démonstration déclaré : les comptes réservés seulement", () => {
  const DEMO_EMAIL = "membre@demo.antsia.test"

  function declareDemo(name = "demo-antsia-123") {
    vi.stubEnv("CONVEX_CLOUD_URL", "https://demo-antsia-123.convex.cloud")
    vi.stubEnv("ANTSIA_DEV_TOOLS", undefined)
    vi.stubEnv("ANTSIA_DEMO_DEPLOYMENT", name)
  }

  it("le code d'un compte de démonstration se relit et ouvre une vraie session, sans service de courriel", async () => {
    declareDemo()
    const t = testConvex({ automaticSessions: false })
    const code = await issueCode(t, "email", DEMO_EMAIL)
    const result = await signIn(t, "email", code.code, DEMO_EMAIL)
    expect(result.status).toBe(200)
    expect(record(record(result.data).user).email).toBe(DEMO_EMAIL)
  })

  it("le code d'un compte de démonstration DIASPORA.GA se relit de même (ADR-0038)", async () => {
    declareDemo()
    const t = testConvex({ automaticSessions: false })
    const email = "moderateur@demo.diaspora-ga.test"
    const code = await issueCode(t, "email", email)
    const result = await signIn(t, "email", code.code, email)
    expect(result.status).toBe(200)
    expect(record(record(result.data).user).email).toBe(email)
  })

  it("toute autre adresse exige le vrai service de courriel : aucun code lisible", async () => {
    declareDemo()
    const t = testConvex({ automaticSessions: false })
    const refusal = await request(t, "/email-otp/send-verification-otp", { body: { email: EMAIL, type: "sign-in" } })
    expect(refusal.status).toBe(503)
    expect(record(refusal.data).code).toBe("otpDeliveryUnavailable")
    expect(await t.query(api.modules.platform.devTools.latestOtp, { email: EMAIL })).toBeNull()
    expect(await t.run((ctx) => ctx.db.query("devOtpCodes").take(1))).toEqual([])
  })

  it("avec le service de courriel, une vraie adresse reçoit son code par courriel et jamais à l'écran", async () => {
    declareDemo()
    vi.stubEnv("RESEND_API_KEY", "fictional-resend-test-key")
    vi.stubEnv("RESEND_FROM_ADDRESS", "ANTSIA <no-reply@example.test>")
    const send = vi.spyOn(Resend.prototype, "sendEmail").mockResolvedValue("fictional-email-id" as never)
    const t = testConvex({ automaticSessions: false })
    const response = await request(t, "/email-otp/send-verification-otp", { body: { email: EMAIL, type: "sign-in" } })
    expect(response.status).toBe(200)
    expect(send).toHaveBeenCalledOnce()
    expect(await t.query(api.modules.platform.devTools.latestOtp, { email: EMAIL })).toBeNull()
  })

  it("aucun code par SMS ne s'affiche : la porte SMS reste fermée sans relais", async () => {
    declareDemo()
    const t = testConvex({ automaticSessions: false })
    const refusal = await request(t, "/phone-number/send-otp", { body: { phoneNumber: PHONE } })
    expect(refusal.status).toBe(503)
    expect(await t.query(api.modules.platform.devTools.latestOtp, { email: PHONE })).toBeNull()
  })

  it("la déclaration recopiée sur un autre déploiement n'ouvre rien, même pour une adresse réservée", async () => {
    declareDemo("production-antsia-456")
    const t = testConvex({ automaticSessions: false })
    const refusal = await request(t, "/email-otp/send-verification-otp", { body: { email: DEMO_EMAIL, type: "sign-in" } })
    expect(refusal.status).toBe(503)
    expect(record(refusal.data).code).toBe("otpDeliveryUnavailable")
    expect(await t.query(api.modules.platform.devTools.latestOtp, { email: DEMO_EMAIL })).toBeNull()
  })
})

describe("CH-817 E5 — la porte des comptes de démonstration verrouille la CONNEXION (constat 1)", () => {
  // Valeurs FICTIVES : numéros de la plage réservée à la fiction (Ofcom, 07700 900xxx), domaine `.test`.
  const GATE_SECRET = "fictional-demo-gate-secret-0123456789abcdef"
  const GATE_WHATSAPP = {
    WHATSAPP_PROVIDER: "bird",
    WHATSAPP_ENDPOINT: "https://whatsapp.example.test/messages",
    WHATSAPP_API_KEY: "fictional-access-key-0123456789",
    WHATSAPP_TEMPLATE: "bird_fictional_otp",
  }
  const GATE_PHONE = "+447700900123"
  const GATE_TOKEN = "fictional_session_token_0123456789abcdefABC"
  const FAMILY = "moderateur@demo.diaspora-ga.test"
  const ROOT_DEMO = "membre@demo.antsia.test"
  const WITH_TOKEN = { [DEMO_GATE_TOKEN_HEADER]: GATE_TOKEN }

  /** La porte ARMÉE et complète (`gated`), sur le développement local du `beforeEach`. */
  function armGate() {
    vi.stubEnv("ANTSIA_DEMO_GATE_SECRET", GATE_SECRET)
    for (const [key, value] of Object.entries(GATE_WHATSAPP)) vi.stubEnv(key, value)
  }

  /**
   * Une session de porte de jeton `token`, ouverte à l'instant `at` pour un numéro inscrit au même
   * instant (lignes écrites comme `completeVerify` les écrit) ; vaut trente minutes.
   */
  async function gateSession(t: T, { at = Date.now(), token = GATE_TOKEN }: { at?: number; token?: string } = {}) {
    await t.run((ctx) => allowPhonesImpl(ctx, { scope: "diaspora-ga", phones: [GATE_PHONE] }, at))
    await t.run(async (ctx) => {
      const phoneHash = await demoGateDigest(GATE_SECRET, "demo-gate-phone", GATE_PHONE)
      const entry = await ctx.db.query("demoGateAllowlist").withIndex("by_scope_phoneHash", (q) => q.eq("scope", "diaspora-ga").eq("phoneHash", phoneHash)).first()
      if (!entry) throw new Error("ligne de liste de recette absente")
      const challengeId = await ctx.db.insert("demoGateChallenges", { scope: "diaspora-ga", challengeId: `auth-${at}`.padEnd(32, "x"), phoneHash, codeDigest: "c".repeat(64), status: "verified", attemptsUsed: 0, createdAt: at, expiresAt: at + 300_000, verifiedAt: at })
      await ctx.db.insert("demoGateSessions", { scope: "diaspora-ga", tokenDigest: await demoGateDigest(GATE_SECRET, "demo-gate-session", token), allowlistId: entry._id, challengeId, createdAt: at, expiresAt: at + DEMO_GATE_SESSION_TTL_MS })
    })
  }

  const send = (t: T, email: string, extraHeaders?: Record<string, string>) => request(t, "/email-otp/send-verification-otp", { body: { email, type: "sign-in" }, extraHeaders })
  const signInWith = (t: T, email: string, otp: string, extraHeaders?: Record<string, string>) => request(t, "/sign-in/email-otp", { body: { email, otp }, extraHeaders })
  const recordedCodes = (t: T) => t.run((ctx) => ctx.db.query("devOtpCodes").take(20))
  const verificationOf = (t: T, email: string) => t.query(components.betterAuth.adapter.findOne, { model: "verification", where: [{ field: "identifier", value: `sign-in-otp-${email}` }] })

  /** L'invité qui a passé la porte : envoi et lecture avec le jeton, rend le code. */
  async function gatedCode(t: T, email = FAMILY): Promise<string> {
    const sent = await send(t, email, WITH_TOKEN)
    expect(sent.status).toBe(200)
    const code = await t.query(api.modules.platform.devTools.latestOtp, { email, gateToken: GATE_TOKEN })
    if (!code) throw new Error("code de recette absent")
    return code.code
  }

  it("sans en-tête : l'envoi répond comme un envoi réel sans rien enregistrer, la connexion comme un code faux", async () => {
    armGate()
    const t = testConvex({ automaticSessions: false })
    // La référence : une adresse ordinaire, envoi réel puis code faux.
    const ordinarySend = await send(t, EMAIL)
    const ordinaryWrong = await signInWith(t, EMAIL, "000000")
    expect(ordinarySend.status).toBe(200)
    expect(ordinaryWrong.status).toBe(400)

    const refusedSend = await send(t, FAMILY)
    expect(refusedSend.status).toBe(ordinarySend.status)
    expect(refusedSend.data).toEqual(ordinarySend.data)
    expect(refusedSend.data).toEqual({ success: true })
    expect(refusedSend.tokenHeader).toBeNull()
    expect((await recordedCodes(t)).map((row) => row.email)).toEqual([EMAIL])
    expect(await verificationOf(t, FAMILY)).toBeNull()

    const refusedSignIn = await signInWith(t, FAMILY, "000000")
    expect(refusedSignIn.status).toBe(ordinaryWrong.status)
    expect(refusedSignIn.data).toEqual(ordinaryWrong.data)
    expect(refusedSignIn.tokenHeader).toBeNull()
    expect(await t.run((ctx) => ctx.db.query("persons").first())).toBeNull()
  })

  it("les refus n'entament aucun seau : avec le jeton, l'envoi passe après quatre refus et la connexion après six", async () => {
    armGate()
    const t = testConvex({ automaticSessions: false })
    await gateSession(t)
    for (let attempt = 0; attempt < 4; attempt++) expect((await send(t, FAMILY)).status).toBe(200)
    expect(await recordedCodes(t)).toEqual([])
    const code = await gatedCode(t)
    for (let attempt = 0; attempt < 6; attempt++) expect((await signInWith(t, FAMILY, code)).status).toBe(400)
    const result = await signInWith(t, FAMILY, code, WITH_TOKEN)
    expect(result.status).toBe(200)
    expect(record(record(result.data).user).email).toBe(FAMILY)
  })

  it("jeton hors forme, inconnu, échu, numéro retiré, numéro réinscrit avec une ancienne session : refus", async () => {
    armGate()
    const now = Date.now()
    const cases: { label: string; prepare: (t: T) => Promise<void>; header: Record<string, string> }[] = [
      { label: "hors forme", prepare: (t) => gateSession(t), header: { [DEMO_GATE_TOKEN_HEADER]: `${GATE_TOKEN}x` } },
      { label: "inconnu", prepare: (t) => gateSession(t), header: { [DEMO_GATE_TOKEN_HEADER]: "u".repeat(43) } },
      { label: "échu", prepare: (t) => gateSession(t, { at: now - DEMO_GATE_SESSION_TTL_MS - 1_000 }), header: WITH_TOKEN },
      {
        label: "numéro retiré",
        prepare: async (t) => { await gateSession(t, { at: now - 2_000 }); await t.run((ctx) => revokePhonesImpl(ctx, { scope: "diaspora-ga", phones: [GATE_PHONE] }, now - 1_000)) },
        header: WITH_TOKEN,
      },
      {
        label: "numéro réinscrit",
        prepare: async (t) => {
          await gateSession(t, { at: now - 3_000 })
          await t.run((ctx) => revokePhonesImpl(ctx, { scope: "diaspora-ga", phones: [GATE_PHONE] }, now - 2_000))
          await t.run((ctx) => allowPhonesImpl(ctx, { scope: "diaspora-ga", phones: [GATE_PHONE] }, now - 1_000))
        },
        header: WITH_TOKEN,
      },
    ]
    for (const { label, prepare, header } of cases) {
      const t = testConvex({ automaticSessions: false })
      await prepare(t)
      const refused = await send(t, FAMILY, header)
      expect(refused.status, label).toBe(200)
      expect(await recordedCodes(t), label).toEqual([])
      expect(await verificationOf(t, FAMILY), label).toBeNull()
      expect((await signInWith(t, FAMILY, "000000", header)).data, label).toEqual({ code: "INVALID_OTP", message: "Invalid OTP" })
    }
  })

  it("porte indisponible (WhatsApp retiré) : refus même avec un jeton valide et le bon code", async () => {
    armGate()
    const t = testConvex({ automaticSessions: false })
    await gateSession(t)
    const code = await gatedCode(t)
    vi.stubEnv("WHATSAPP_PROVIDER", undefined)
    const refused = await signInWith(t, FAMILY, code, WITH_TOKEN)
    expect(refused.status).toBe(400)
    expect(refused.data).toEqual({ code: "INVALID_OTP", message: "Invalid OTP" })
    await t.run(async (ctx) => { for (const row of await ctx.db.query("devOtpCodes").take(5)) await ctx.db.delete(row._id) })
    expect((await send(t, FAMILY, WITH_TOKEN)).data).toEqual({ success: true })
    expect(await recordedCodes(t)).toEqual([])
    // Contrôle : la porte de nouveau complète, le même code (jamais consommé) ouvre la session.
    vi.stubEnv("WHATSAPP_PROVIDER", "bird")
    expect((await signInWith(t, FAMILY, code, WITH_TOKEN)).status).toBe(200)
  })

  it("variantes de casse et d'espaces de la famille : gardées comme l'adresse normalisée", async () => {
    armGate()
    const t = testConvex({ automaticSessions: false })
    await gateSession(t)
    const code = await gatedCode(t)
    for (const variant of ["MODERATEUR@DEMO.DIASPORA-GA.TEST", "Moderateur@Demo.Diaspora-GA.test", ` ${FAMILY} `]) {
      expect((await send(t, variant)).data, variant).toEqual({ success: true })
      expect((await signInWith(t, variant, code)).data, variant).toEqual({ code: "INVALID_OTP", message: "Invalid OTP" })
    }
    // Un seul code enregistré : celui de l'envoi muni du jeton, jamais rejoué par une variante.
    expect((await recordedCodes(t)).map((row) => row.code)).toEqual([code])
    expect((await signInWith(t, FAMILY.toUpperCase(), code, WITH_TOKEN)).status).toBe(200)
  })

  it("porte armée : l'adresse de la racine et l'adresse ordinaire se connectent comme avant, sans en-tête", async () => {
    armGate()
    const t = testConvex({ automaticSessions: false })
    for (const email of [ROOT_DEMO, EMAIL]) {
      const code = await issueCode(t, "email", email)
      const result = await signIn(t, "email", code.code, email)
      expect(result.status, email).toBe(200)
    }
  })

  it("porte non armée (variable absente) : la famille entre comme avant, sans en-tête ; un jeton présenté est sans effet", async () => {
    const t = testConvex({ automaticSessions: false })
    const code = await issueCode(t, "email", FAMILY)
    expect((await signIn(t, "email", code.code, FAMILY)).status).toBe(200)
    const again = await send(t, FAMILY, WITH_TOKEN)
    expect(again.status).toBe(200)
    expect(await t.query(api.modules.platform.devTools.latestOtp, { email: FAMILY })).not.toBeNull()
  })

  it("production (comptes de démonstration fermés), même avec le secret et WhatsApp : la garde ne s'applique pas", async () => {
    armGate()
    vi.stubEnv("CONVEX_CLOUD_URL", "https://production-antsia-456.convex.cloud")
    vi.stubEnv("ANTSIA_DEV_TOOLS", undefined)
    const t = testConvex({ automaticSessions: false })
    // Le refus d'avant la porte (aucun transport), pas la réponse de la garde.
    const refusal = await send(t, FAMILY)
    expect(refusal.status).toBe(503)
    expect(record(refusal.data).code).toBe("otpDeliveryUnavailable")
  })

  it("CORS : la pré-vérification des routes d'authentification admet l'en-tête du jeton", async () => {
    const t = testConvex({ automaticSessions: false })
    const preflight = await t.fetch("/api/auth/sign-in/email-otp", { method: "OPTIONS", headers: { Origin: PRIMARY_ORIGIN, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": DEMO_GATE_TOKEN_HEADER } })
    expect(preflight.status).toBe(204)
    expect(preflight.headers.get("access-control-allow-headers")).toContain(DEMO_GATE_TOKEN_HEADER)
  })
})

describe("langue de la personne et marque du réseau dans le code de connexion", () => {
  const DIASPORA_GA_ORIGIN = new URL(catalog.applications.diaspora_ga.site_url).origin
  const ANTSIA_ORIGIN = new URL(catalog.applications.antsia_ga.site_url).origin
  const LOCAL_DIASPORA_GA_ORIGIN = `http://localhost:${catalog.applications.diaspora_ga.dev_port}`
  const ENGLISH_DIASPORA_GA = /^Your DIASPORA.GA code: \d{6}\. It expires in five minutes\.$/

  /** Un backend en nuage avec un transport configuré : le message est réellement composé, son envoi est simulé. */
  function emailTransport() {
    vi.stubEnv("CONVEX_CLOUD_URL", "https://backend.example.test")
    vi.stubEnv("RESEND_API_KEY", "fictional-resend-test-key")
    vi.stubEnv("RESEND_FROM_ADDRESS", "ANTSIA <no-reply@example.test>")
    return vi.spyOn(Resend.prototype, "sendEmail").mockResolvedValue("fictional-email-id" as never)
  }

  async function sendEmailCode(t: T, options: { origin: string; acceptLanguage?: string; email?: string }) {
    const email = options.email ?? EMAIL
    if (options.origin === DIASPORA_GA_ORIGIN) {
      const now = Date.now()
      const user = await t.mutation(components.betterAuth.adapter.create, {
        input: { model: "user", data: { email, emailVerified: true, name: "Membre existant", createdAt: now, updatedAt: now } },
      })
      await addHistoricalMembership(t, textField(user, "_id"))
    }
    const response = await request(t, "/email-otp/send-verification-otp", { origin: options.origin, acceptLanguage: options.acceptLanguage, body: { email, type: "sign-in" } })
    expect(response.status).toBe(200)
  }

  function lastEmail(send: ReturnType<typeof emailTransport>) {
    const email = record(send.mock.lastCall?.[1])
    return { from: email.from, to: email.to, subject: email.subject, text: textField(email, "text") }
  }

  it("un code demandé en anglais sur diaspora.ga part en anglais, à la marque DIASPORA.GA", async () => {
    const send = emailTransport()
    const t = testConvex({ automaticSessions: false })
    await sendEmailCode(t, { origin: DIASPORA_GA_ORIGIN, acceptLanguage: "en" })
    expect(send).toHaveBeenCalledOnce()
    const email = lastEmail(send)
    expect(email).toMatchObject({ from: "ANTSIA <no-reply@example.test>", to: EMAIL, subject: "Your DIASPORA.GA sign-in code" })
    expect(email.text).toMatch(ENGLISH_DIASPORA_GA)
  })

  it("en français sur diaspora.ga, préférences régionales comprises", async () => {
    const send = emailTransport()
    const t = testConvex({ automaticSessions: false })
    await sendEmailCode(t, { origin: DIASPORA_GA_ORIGIN, acceptLanguage: "fr-FR,fr;q=0.9,en;q=0.8" })
    const email = lastEmail(send)
    expect(email.subject).toBe("Votre code de connexion DIASPORA.GA")
    expect(email.text).toMatch(/^Votre code DIASPORA.GA : \d{6}\. Il expire dans cinq minutes\.$/)
  })

  it("sans langue donnée : celle du déploiement, sinon le français ; antsia.ga garde la marque ANTSIA", async () => {
    const send = emailTransport()
    const t = testConvex({ automaticSessions: false })
    await sendEmailCode(t, { origin: ANTSIA_ORIGIN })
    expect(lastEmail(send).subject).toBe("Votre code de connexion ANTSIA")
    expect(lastEmail(send).text).toMatch(/^Votre code ANTSIA : \d{6}\. Il expire dans cinq minutes\.$/)
    vi.stubEnv("AUTH_DEFAULT_LOCALE", "en")
    await sendEmailCode(t, { origin: DIASPORA_GA_ORIGIN, email: "bob.auth@example.test" })
    expect(lastEmail(send)).toMatchObject({ to: "bob.auth@example.test", subject: "Your DIASPORA.GA sign-in code" })
    // La langue demandée passe devant celle du déploiement.
    await sendEmailCode(t, { origin: ANTSIA_ORIGIN, acceptLanguage: "fr", email: "carla.auth@example.test" })
    expect(lastEmail(send)).toMatchObject({ to: "carla.auth@example.test", subject: "Votre code de connexion ANTSIA" })
    expect(send).toHaveBeenCalledTimes(3)
  })

  it("une langue non prise en charge retombe sur le français ; une origine hors catalogue porte ANTSIA", async () => {
    const send = emailTransport()
    const t = testConvex({ automaticSessions: false })
    await sendEmailCode(t, { origin: PRIMARY_ORIGIN, acceptLanguage: "de-DE,es;q=0.8" })
    expect(lastEmail(send).subject).toBe("Votre code de connexion ANTSIA")
  })

  it("le réseau ANTSIA conserve son relais SMS et la langue demandée", async () => {
    vi.stubEnv("CONVEX_CLOUD_URL", "https://backend.example.test")
    vi.stubEnv("SMS_PROVIDER", "webhook")
    vi.stubEnv("SMS_ENDPOINT", "https://sms.example.test/send")
    vi.stubEnv("SMS_API_KEY", "fictional-sms-test-key")
    const relay = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => new Response(null, { status: 202 }))
    vi.stubGlobal("fetch", relay)
    const t = testConvex({ automaticSessions: false })
    const response = await request(t, "/phone-number/send-otp", { origin: ANTSIA_ORIGIN, acceptLanguage: "en-GB,en;q=0.9", body: { phoneNumber: PHONE } })
    expect(response.status).toBe(200)
    expect(relay).toHaveBeenCalledOnce()
    const [url, init] = relay.mock.calls[0] ?? []
    expect(url).toBe("https://sms.example.test/send")
    const body = record(JSON.parse(String(init?.body)))
    expect(body).toMatchObject({ to: PHONE, type: "otp", ttlSeconds: 300 })
    expect(textField(body, "text")).toMatch(/^Your ANTSIA code: \d{6}\. It expires in five minutes\.$/)
  })

  it("la marque vient de l'origine vérifiée, en production comme en local ; la langue, de la requête puis du déploiement", () => {
    const local = { ANTSIA_DEV_TOOLS: "true", CONVEX_CLOUD_URL: "http://127.0.0.1:3210" }
    expect(otpPresentation({ origin: DIASPORA_GA_ORIGIN, acceptLanguage: "en" }, {})).toEqual({ locale: "en", brand: "DIASPORA.GA" })
    expect(otpPresentation({ origin: LOCAL_DIASPORA_GA_ORIGIN, acceptLanguage: "en" }, local)).toEqual({ locale: "en", brand: "DIASPORA.GA" })
    // Un port local sans les outils de développement d'un backend local ne désigne aucune application.
    expect(otpPresentation({ origin: LOCAL_DIASPORA_GA_ORIGIN, acceptLanguage: "en" }, {})).toEqual({ locale: "en", brand: "ANTSIA" })
    for (const app of ["antsia_ga", "admin_antsia_ga"] as const) {
      expect(otpPresentation({ origin: new URL(catalog.applications[app].site_url).origin, acceptLanguage: null }, {}).brand).toBe("ANTSIA")
    }
    for (const origin of [null, undefined, "https://foreign.example.test"]) expect(otpPresentation({ origin, acceptLanguage: undefined }, {})).toEqual({ locale: "fr", brand: "ANTSIA" })
    expect(otpPresentation({ origin: null, acceptLanguage: undefined }, { AUTH_DEFAULT_LOCALE: "en" }).locale).toBe("en")
  })

  it("revue CH-815 A1b : une origine de démonstration déclarée pour DIASPORA.GA, et de confiance, porte sa marque", () => {
    const demo = "https://membres.demo.example.test"
    const declared = { APPLICATION_EXTRA_ORIGINS_JSON: JSON.stringify({ diaspora_ga: [demo] }) }
    expect(otpPresentation({ origin: demo, acceptLanguage: "fr" }, { ...declared, TRUSTED_ORIGINS: demo })).toEqual({ locale: "fr", brand: "DIASPORA.GA" })
    // Déclarée sans être de confiance, ou de confiance sans être déclarée : la marque du réseau racine.
    expect(otpPresentation({ origin: demo, acceptLanguage: "fr" }, declared).brand).toBe("ANTSIA")
    expect(otpPresentation({ origin: demo, acceptLanguage: "fr" }, { TRUSTED_ORIGINS: demo }).brand).toBe("ANTSIA")
  })
})

describe("passage entre applications et jetons émis", () => {
  it("le jeton à usage unique passe à une seconde origine avec le même utilisateur et une seule personne", async () => {
    const t = testConvex({ automaticSessions: false })
    const { token, userId, sessionId } = await loggedIn(t)
    const generated = await request(t, "/one-time-token/generate", { method: "GET", token })
    expect(generated.status).toBe(200)
    const ott = textField(generated.data, "token")
    const accepted = await request(t, "/one-time-token/verify", { origin: PEER_ORIGIN, body: { token: ott } })
    expect(accepted.status).toBe(200)
    expect(textField(record(accepted.data).user, "id")).toBe(userId)
    expect(textField(record(accepted.data).session, "id")).toBe(sessionId)
    const first = t.withIdentity({ subject: userId, sessionId, origin: PRIMARY_ORIGIN })
    const second = t.withIdentity({ subject: userId, sessionId, origin: PEER_ORIGIN })
    expect(await first.mutation(api.modules.people.persons.ensureMyPerson, {})).toBe(await second.mutation(api.modules.people.persons.ensureMyPerson, {}))
    expect((await t.run((ctx) => ctx.db.query("persons").take(2)))).toHaveLength(1)
    expect((await request(t, "/one-time-token/verify", { origin: PEER_ORIGIN, body: { token: ott } })).status).toBe(400)
  })

  it("le jeton de passage expire après trois minutes", async () => {
    vi.useFakeTimers({ toFake: ["Date"] })
    const t = testConvex({ automaticSessions: false })
    const { token } = await loggedIn(t)
    const generated = await request(t, "/one-time-token/generate", { method: "GET", token })
    expect(generated.status).toBe(200)
    const ott = textField(generated.data, "token")
    const stored: unknown = await t.query(components.betterAuth.adapter.findOne, { model: "verification", where: [{ field: "identifier", value: `one-time-token:${ott}` }] })
    expect(record(stored).expiresAt).toBe(Date.now() + 180_000)
    vi.setSystemTime(Date.now() + 180_001)
    expect((await request(t, "/one-time-token/verify", { origin: PEER_ORIGIN, body: { token: ott } })).status).toBe(400)
  })

  it("un anonyme ne peut générer de jeton de passage", async () => {
    const t = testConvex({ automaticSessions: false })
    expect((await request(t, "/one-time-token/generate", { method: "GET" })).status).toBe(401)
  })

  it("un passage émis avant la révocation globale ne peut recréer la session", async () => {
    const t = testConvex({ automaticSessions: false })
    const first = await loggedIn(t)
    const second = await loggedIn(t)
    const generated = await request(t, "/one-time-token/generate", { method: "GET", token: first.token })
    expect(generated.status).toBe(200)
    const ott = textField(generated.data, "token")
    const revoked = await request(t, "/revoke-sessions", { token: second.token })
    expect(revoked.status).toBe(200)
    expect(record(revoked.data).status).toBe(true)
    for (const sessionId of [first.sessionId, second.sessionId]) {
      expect(await t.query(components.betterAuth.adapter.findOne, { model: "session", where: [{ field: "_id", value: sessionId }] })).toBeNull()
    }
    expect((await request(t, "/one-time-token/verify", { origin: PEER_ORIGIN, body: { token: ott } })).status).toBe(400)
    expect((await request(t, "/one-time-token/verify", { origin: PEER_ORIGIN, body: { token: ott } })).status).toBe(400)
    expect((await request(t, "/one-time-token/generate", { method: "GET", token: first.token })).status).toBe(401)
    expect((await request(t, "/convex/token", { method: "GET", token: second.token })).status).toBe(401)
    expect(await t.run((ctx) => ctx.db.query("persons").first())).toBeNull()
  })

  it("le JWT Convex émis porte la session et expire en trente minutes", async () => {
    const t = testConvex({ automaticSessions: false })
    const { token, userId, sessionId } = await loggedIn(t)
    const jwtResponse = await request(t, "/convex/token", { method: "GET", token })
    expect(jwtResponse.status).toBe(200)
    const jwt = textField(jwtResponse.data, "token")
    const payload = jwt.split(".")[1]
    if (!payload) throw new Error("JWT de recette illisible")
    const claims = record(JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/"))))
    expect(claims.sub).toBe(userId)
    expect(claims.sessionId).toBe(sessionId)
    expect(Number(claims.exp) - Number(claims.iat)).toBe(1800)
  })
})

describe("composition du fournisseur d'identité", () => {
  it("désactive le mot de passe et le rapprochement implicite par courriel", async () => {
    const t = testConvex({ automaticSessions: false })
    const options = await t.action(async (ctx) => {
      const { createAuth } = await import("./auth")
      const auth = createAuth(ctx)
      return { emailAndPassword: auth.options.emailAndPassword, accountLinking: auth.options.account?.accountLinking, session: auth.options.session, plugins: auth.options.plugins?.map((plugin) => plugin.id) }
    })
    expect(options.emailAndPassword).toEqual({ enabled: false })
    expect(options.session).toMatchObject({ expiresIn: 604800, updateAge: 86400 })
    expect(options.accountLinking).toMatchObject({ enabled: true, trustedProviders: ["idn"], disableImplicitLinking: true })
    expect(options.plugins).toEqual(expect.arrayContaining(["convex", "cross-domain", "one-time-token", "bearer", "email-otp", "phone-number"]))
    expect(options.plugins).not.toContain("generic-oauth")
  })

  it.each([
    { path: "/sign-in/email", body: { email: EMAIL, password: "fictional-password-for-regression" } },
    { path: "/sign-up/email", body: { email: EMAIL, password: "fictional-password-for-regression", name: "Nom de fixture" } },
    { path: "/sign-in/phone-number", body: { phoneNumber: PHONE, password: "fictional-password-for-regression" } },
    { path: "/request-password-reset", body: { email: EMAIL } },
    { path: "/reset-password", body: { token: "fictional-reset-token", newPassword: "fictional-password-for-regression" } },
    { path: "/change-password", body: { currentPassword: "fictional-old-password", newPassword: "fictional-password-for-regression" } },
    { path: "/email-otp/request-password-reset", body: { email: EMAIL } },
    { path: "/forget-password/email-otp", body: { email: EMAIL } },
    { path: "/email-otp/reset-password", body: { email: EMAIL, otp: "123456", password: "fictional-password-for-regression" } },
    { path: "/phone-number/request-password-reset", body: { phoneNumber: PHONE } },
    { path: "/phone-number/reset-password", body: { phoneNumber: PHONE, otp: "123456", newPassword: "fictional-password-for-regression" } },
    { path: "/email-otp/send-verification-otp", body: { email: EMAIL, type: "forget-password" } },
  ] as { path: string; body: Record<string, unknown> }[])("refuse la route de mot de passe $path même avec une session OTP", async ({ path, body }) => {
    const t = testConvex({ automaticSessions: false })
    const { token, userId } = await loggedIn(t)
    const refusal = await request(t, path, { token, body })
    expect(refusal.status).toBe(404)
    expect(record(refusal.data).code).toBe("passwordSignInDisabled")
    expect(await t.query(components.betterAuth.adapter.findOne, { model: "account", where: [{ field: "userId", value: userId }, { field: "providerId", value: "credential" }] })).toBeNull()
  })

  // CH-817 E5 (relecture de sécurité, constat 1) : `check-verification-otp` échappait au seau de
  // connexion (trois essais par code, sans fin de codes) et aucune application n'appelle ces deux
  // routes. Fermées pour TOUTES les adresses, avant tout seau : un code qu'elles auraient lu ou
  // consommé reste entier, et le seau de connexion n'est pas entamé.
  it.each([
    { path: "/email-otp/check-verification-otp", body: (otp: string) => ({ email: EMAIL, type: "sign-in", otp }) },
    { path: "/email-otp/verify-email", body: (otp: string) => ({ email: EMAIL, otp }) },
  ])("ferme $path : 404 `routeDisabled`, sans seau, sans toucher au code", async ({ path, body }) => {
    const t = testConvex({ automaticSessions: false })
    const code = await issueCode(t, "email")
    // Six appels avec le BON code : au-delà des trois essais du code et des cinq du seau de connexion.
    for (let attempt = 0; attempt < 6; attempt++) {
      const refusal = await request(t, path, { body: body(code.code) })
      expect(refusal.status).toBe(404)
      expect(record(refusal.data)).toEqual({ code: "routeDisabled", message: "routeDisabled" })
      expect(refusal.tokenHeader).toBeNull()
    }
    const result = await signIn(t, "email", code.code)
    expect(result.status).toBe(200)
  })

  it("un lien de réinitialisation valide ne peut activer le callback de mot de passe", async () => {
    const t = testConvex({ automaticSessions: false })
    const { token, userId } = await loggedIn(t)
    await t.mutation(components.betterAuth.adapter.create, { input: { model: "verification", data: { identifier: "reset-password:fictional-reset-token", value: userId, expiresAt: Date.now() + 60_000, createdAt: Date.now(), updatedAt: Date.now() } } })
    const refusal = await request(t, `/reset-password/fictional-reset-token?callbackURL=${encodeURIComponent(`${PRIMARY_ORIGIN}/entrer`)}`, { method: "GET", token })
    expect(refusal.status).toBe(404)
    expect(record(refusal.data).code).toBe("passwordSignInDisabled")
  })

  it("le fournisseur IDN configuré garde PKCE, les scopes minimaux et un callback central", async () => {
    vi.stubEnv("IDN_CLIENT_ID", "sandbox-client-fixture")
    vi.stubEnv("IDN_CLIENT_SECRET", "fictional-idn-secret-for-tests")
    vi.stubEnv("IDN_ISSUER", "https://idn.example.test")
    const t = testConvex({ automaticSessions: false })
    const config = await t.action(async (ctx) => {
      const { createAuth } = await import("./auth")
      const auth = createAuth(ctx, PEER_ORIGIN)
      const plugin = auth.options.plugins?.find((item) => item.id === "generic-oauth")
      if (!plugin || !("options" in plugin)) throw new Error("Réglage du fournisseur IDN absent")
      const options = record(plugin.options)
      if (!Array.isArray(options.config) || options.config.length !== 1) throw new Error("Fournisseur IDN absent")
      const provider = record(options.config[0])
      // CH-863 M1 (ADR-0045) : plus de `prompt` statique, qui vaudrait pour tout départ ; les paramètres
      // d'autorisation sont une fonction de la requête, `prompt=login` par défaut, sur chaque route qui les lit.
      const params = provider.authorizationUrlParams
      if (typeof params !== "function") throw new Error("Paramètres d'autorisation IDN attendus en fonction de la requête")
      const paramsOf = params as (ctx: { path?: string; body?: unknown }) => unknown
      return {
        providerId: provider.providerId, pkce: provider.pkce, scopes: provider.scopes, redirectURI: provider.redirectURI, prompt: provider.prompt,
        signIn: paramsOf({ path: "/sign-in/oauth2", body: { providerId: "idn", callbackURL: `${PEER_ORIGIN}/bienvenue` } }),
        link: paramsOf({ path: "/oauth2/link", body: { providerId: "idn", callbackURL: `${PEER_ORIGIN}/compte` } }),
        // Le lien de compte ne lit jamais l'intention, même glissée dans son corps.
        linkWithIntent: paramsOf({ path: "/oauth2/link", body: { providerId: "idn", callbackURL: `${PEER_ORIGIN}/compte`, additionalData: { antsiaEntry: "sso" } } }),
      }
    })
    expect(config).toEqual({
      providerId: "idn", pkce: true, scopes: ["openid", "profile", "email"], redirectURI: `${PRIMARY_ORIGIN}/api/auth/oauth2/callback/idn`, prompt: undefined,
      signIn: { prompt: "login" }, link: { prompt: "login" }, linkWithIntent: { prompt: "login" },
    })
  })

  it.each([
    { transport: "HTTP", browserCookie: undefined },
    { transport: "SDK navigateur", browserCookie: "" },
  ])("la vraie demande OAuth ($transport) conserve redirection, PKCE, état et callback", async ({ browserCookie }) => {
    vi.stubEnv("IDN_CLIENT_ID", "sandbox-client-fixture")
    vi.stubEnv("IDN_CLIENT_SECRET", "fictional-idn-secret-for-tests")
    vi.stubEnv("IDN_ISSUER", "https://idn.example.test")
    const issuer = "https://idn.example.test"
    const discovery = vi.fn(async () => new Response(JSON.stringify({ issuer, authorization_endpoint: `${issuer}/api/auth/oauth2/authorize`, token_endpoint: `${issuer}/api/auth/oauth2/token` }), { headers: { "Content-Type": "application/json" } }))
    vi.stubGlobal("fetch", discovery)
    const t = testConvex({ automaticSessions: false })
    const result = await request(t, "/sign-in/oauth2", { body: { providerId: "idn", callbackURL: `${PEER_ORIGIN}/bienvenue` }, origin: PEER_ORIGIN, browserCookie })
    expect(result.status).toBe(200)
    const url = new URL(textField(result.data, "url"))
    expect(url.origin).toBe(issuer)
    expect(url.searchParams.getAll("prompt")).toEqual(["login"])
    expect(url.searchParams.has("max_age")).toBe(false)
    expect(url.searchParams.get("client_id")).toBe("sandbox-client-fixture")
    expect(url.searchParams.get("redirect_uri")).toBe(`${PRIMARY_ORIGIN}/api/auth/oauth2/callback/idn`)
    expect(url.searchParams.get("code_challenge_method")).toBe("S256")
    expect(url.searchParams.get("code_challenge")).toBeTruthy()
    expect(url.searchParams.get("state")).toBeTruthy()
    expect(record(result.data).redirect).toBe(true)
    expect(result.hasBrowserCookie).toBe(browserCookie !== undefined)
  })
})

// CH-817 E5 (écart relevé par le cliquet de surface) : avec IDN, `generic-oauth` inscrit IDN parmi les
// fournisseurs sociaux du cœur. `/sign-in/social` partait chez IDN sans `prompt=login` ni crochet natif
// de départ, et `/callback/:id` pouvait ouvrir une session IDN hors des crochets du rappel central
// (sans cookie, retour natif lié à S256, retour de refus). Aucune application ne les appelle : fermées
// pour tous, avant tout seau. IDN n'entre que par `/sign-in/oauth2` et `/oauth2/callback/idn`.
describe("routes du cœur où `generic-oauth` inscrit IDN : fermées (CH-817 E5)", () => {
  const IDN_ISSUER = "https://idn.example.test"
  const NO_SESSION_TRACE = { token: null, browserCookie: false, cookie: null, location: null }
  const traceOf = (response: Awaited<ReturnType<typeof request>>) => ({ token: response.tokenHeader, browserCookie: response.hasBrowserCookie, cookie: response.setCookie, location: response.location })
  const rowsOf = async (t: T, model: "session" | "verification") => ((await t.query(components.betterAuth.adapter.findMany, { model, paginationOpts: { cursor: null, numItems: 50 } })) as { page: unknown[] }).page
  const stateRowOf = (t: T, state: string) => t.query(components.betterAuth.adapter.findOne, { model: "verification", where: [{ field: "identifier", value: state }] })

  /** Le transport IDN simulé (découverte, jeton, profil) ; chaque chemin appelé est noté. */
  function stubIdnTransport(): string[] {
    const calls: string[] = []
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(input instanceof Request ? input.url : String(input))
      calls.push(url.pathname)
      const json = (value: unknown) => new Response(JSON.stringify(value), { headers: { "Content-Type": "application/json" } })
      if (url.pathname.endsWith("/.well-known/openid-configuration")) return json({ issuer: IDN_ISSUER, authorization_endpoint: `${IDN_ISSUER}/authorize`, token_endpoint: `${IDN_ISSUER}/token`, userinfo_endpoint: `${IDN_ISSUER}/userinfo` })
      if (url.pathname === "/token") return json({ access_token: "fixture-access-social", token_type: "Bearer", expires_in: 3600 })
      if (url.pathname === "/userinfo") return json({ sub: "fixture-idn-social", email: "idn-social@example.test", email_verified: true, loa: 2 })
      throw new Error("Transport externe inattendu dans la recette IDN")
    }))
    return calls
  }

  it.each([{ idn: false }, { idn: true }])("IDN configuré : $idn — `/sign-in/social` et `/callback/:id` répondent 404 `routeDisabled`, sans seau, sans état, sans cookie ni session", async ({ idn }) => {
    if (idn) configureIdnFixture()
    const calls = stubIdnTransport()
    const t = testConvex({ automaticSessions: false })
    const closedRoutes = [
      // Une adresse dans le corps : si un seau par adresse comptait ces appels, la connexion finale serait refusée.
      { path: "/sign-in/social", method: "POST" as const, body: { provider: "idn", callbackURL: `${PRIMARY_ORIGIN}/bienvenue`, email: EMAIL } },
      // Le routeur la sert au chemin concret ; le crochet la voit sous son gabarit `/callback/:id`.
      { path: `/callback/idn?code=fixture-code&state=fixture-state&iss=${encodeURIComponent(IDN_ISSUER)}`, method: "GET" as const },
    ]
    // Six fois chaque route : au-delà des cinq essais du seau de connexion et des trois du seau d'envoi.
    for (let attempt = 0; attempt < 6; attempt++) {
      for (const route of closedRoutes) {
        const refusal = await request(t, route.path, { method: route.method, ...(route.body ? { body: route.body } : {}) })
        expect(refusal.status, route.path).toBe(404)
        expect(record(refusal.data), route.path).toEqual({ code: "routeDisabled", message: "routeDisabled" })
        expect(traceOf(refusal), route.path).toEqual(NO_SESSION_TRACE)
      }
    }
    // Rien n'a parlé à IDN, rien n'est écrit : ni état OAuth, ni session.
    expect(calls).toEqual([])
    expect(await rowsOf(t, "verification")).toEqual([])
    expect(await rowsOf(t, "session")).toEqual([])
    const code = await issueCode(t, "email")
    expect((await signIn(t, "email", code.code)).status).toBe(200)
  })

  it("IDN configuré : l'état d'un vrai départ n'est pas consommé par `/callback/:id`, et le rappel central l'accepte ensuite", async () => {
    configureIdnFixture()
    const calls = stubIdnTransport()
    const t = testConvex({ automaticSessions: false })
    const start = await request(t, "/sign-in/oauth2", { body: { providerId: "idn", callbackURL: `${PRIMARY_ORIGIN}/bienvenue` } })
    expect(start.status).toBe(200)
    const authorization = new URL(textField(start.data, "url"))
    expect(authorization.searchParams.get("prompt")).toBe("login")
    const state = authorization.searchParams.get("state") ?? ""
    expect(state).not.toBe("")
    const query = `code=fixture-code&state=${encodeURIComponent(state)}&iss=${encodeURIComponent(IDN_ISSUER)}`

    const refusal = await request(t, `/callback/idn?${query}`, { method: "GET" })
    expect(refusal.status).toBe(404)
    expect(record(refusal.data)).toEqual({ code: "routeDisabled", message: "routeDisabled" })
    expect(traceOf(refusal)).toEqual(NO_SESSION_TRACE)
    // Aucun échange de code chez IDN, aucune session, et l'état du départ reste entier.
    expect(calls.filter((path) => path === "/token" || path === "/userinfo")).toEqual([])
    expect(await rowsOf(t, "session")).toEqual([])
    expect(await stateRowOf(t, state)).not.toBeNull()

    // Le rappel central n'est pas visé : il consomme l'état, échange le code et livre la session par le
    // seul jeton à usage unique.
    const central = await request(t, `/oauth2/callback/idn?${query}`, { method: "GET" })
    expect(central.status).toBe(302)
    const destination = new URL(central.location ?? "")
    expect(`${destination.origin}${destination.pathname}`).toBe(`${PRIMARY_ORIGIN}/bienvenue`)
    expect(destination.searchParams.get("ott")).toBeTruthy()
    expect(calls).toContain("/token")
    expect(await stateRowOf(t, state)).toBeNull()
    expect(await rowsOf(t, "session")).toHaveLength(1)
  })
})

// CH-863 M1 (ADR-0045) — la porte d'arrivée (venue de consulat.ga) demande l'entrée IDN sans
// ressaisie par l'intention FERMÉE `additionalData: { antsiaEntry: "sso" }` : l'adresse d'autorisation
// ne porte alors ni `prompt` ni `max_age`, et identite.ga accepte sa session tant qu'elle vit. Sans
// intention, rien ne change : `prompt=login`. Toute autre valeur, forme ou clé, un autre fournisseur,
// l'administration d'un réseau, la console ou le parcours natif : refus fermé `idnEntryInvalid`,
// AVANT tout appel à IDN et toute écriture d'état.
describe("CH-863 M1 — entrée IDN sans ressaisie sur la porte d'arrivée (intention fermée `antsiaEntry`)", () => {
  const IDN_ISSUER = "https://idn.example.test"
  const SSO = { antsiaEntry: "sso" }
  const localOrigin = (key: "antsia_ga" | "diaspora_ga" | "admin_diaspora_ga" | "admin_antsia_ga") => `http://localhost:${catalog.applications[key].dev_port}`
  const MEMBERS_ORIGIN = localOrigin("diaspora_ga")
  const ADMIN_ENTRY = `${localOrigin("admin_diaspora_ga")}/entrer`
  const CONSOLE_ENTRY = `${localOrigin("admin_antsia_ga")}/entrer`
  const REFUSED = { code: "idnEntryInvalid", message: "idnEntryInvalid" }
  const verificationRows = async (t: T) => ((await t.query(components.betterAuth.adapter.findMany, { model: "verification", paginationOpts: { cursor: null, numItems: 50 } })) as { page: unknown[] }).page

  /** Le transport IDN simulé (découverte, jeton, profil) ; chaque chemin appelé est noté. */
  function stubIdnTransport(): string[] {
    const calls: string[] = []
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(input instanceof Request ? input.url : String(input))
      calls.push(url.pathname)
      const json = (value: unknown) => new Response(JSON.stringify(value), { headers: { "Content-Type": "application/json" } })
      if (url.pathname.endsWith("/.well-known/openid-configuration")) return json({ issuer: IDN_ISSUER, authorization_endpoint: `${IDN_ISSUER}/authorize`, token_endpoint: `${IDN_ISSUER}/token`, userinfo_endpoint: `${IDN_ISSUER}/userinfo` })
      if (url.pathname === "/token") return json({ access_token: "fixture-access-sso", token_type: "Bearer", expires_in: 3600 })
      if (url.pathname === "/userinfo") return json({ sub: "fixture-idn-sso", email: "idn-sso@example.test", email_verified: true, loa: 2 })
      throw new Error("Transport externe inattendu dans la recette IDN")
    }))
    return calls
  }

  /** Un départ des membres vers `/bienvenue`, échec vers `/entrer`, comme la porte de DIASPORA.GA. */
  const membersStart = (origin: string, additionalData?: Record<string, unknown>) => ({
    providerId: "idn", callbackURL: `${origin}/bienvenue`, errorCallbackURL: `${origin}/entrer`, ...(additionalData ? { additionalData } : {}),
  })

  it.each([
    { label: "sans données", additionalData: undefined },
    { label: "avec des données sans l'intention", additionalData: { autre: "valeur" } },
  ])("par défaut ($label) : la porte ordinaire, `prompt=login`, sans `max_age`", async ({ additionalData }) => {
    configureIdnFixture()
    stubIdnTransport()
    const t = testConvex({ automaticSessions: false })
    for (const origin of [PRIMARY_ORIGIN, MEMBERS_ORIGIN]) {
      const start = await request(t, "/sign-in/oauth2", { body: membersStart(origin, additionalData), origin })
      expect(start.status, origin).toBe(200)
      const authorization = new URL(textField(start.data, "url"))
      expect(authorization.searchParams.getAll("prompt"), origin).toEqual(["login"])
      expect(authorization.searchParams.has("max_age"), origin).toBe(false)
    }
  })

  it("avec `sso`, depuis une application des membres : ni `prompt` ni `max_age`, le reste du départ intact", async () => {
    configureIdnFixture()
    stubIdnTransport()
    const t = testConvex({ automaticSessions: false })
    for (const origin of [PRIMARY_ORIGIN, MEMBERS_ORIGIN]) {
      const start = await request(t, "/sign-in/oauth2", { body: membersStart(origin, SSO), origin })
      expect(start.status, origin).toBe(200)
      const authorization = new URL(textField(start.data, "url"))
      expect(`${authorization.origin}${authorization.pathname}`).toBe(`${IDN_ISSUER}/authorize`)
      expect(authorization.searchParams.has("prompt"), origin).toBe(false)
      expect(authorization.searchParams.has("max_age"), origin).toBe(false)
      expect(authorization.searchParams.get("client_id")).toBe("sandbox-client-fixture")
      expect(authorization.searchParams.get("redirect_uri")).toBe(`${PRIMARY_ORIGIN}/api/auth/oauth2/callback/idn`)
      expect(authorization.searchParams.get("scope")).toBe("openid profile email")
      expect(authorization.searchParams.get("code_challenge_method")).toBe("S256")
      expect(authorization.searchParams.get("code_challenge")).toBeTruthy()
      expect(authorization.searchParams.get("state")).toBeTruthy()
      expect(record(start.data).redirect).toBe(true)
    }
  })

  it("le rappel central accepte l'état d'un départ `sso` et livre la session à l'application de départ, par le seul jeton à usage unique", async () => {
    configureIdnFixture()
    const calls = stubIdnTransport()
    const t = testConvex({ automaticSessions: false })
    const start = await request(t, "/sign-in/oauth2", { body: membersStart(MEMBERS_ORIGIN, SSO), origin: MEMBERS_ORIGIN })
    expect(start.status).toBe(200)
    const state = new URL(textField(start.data, "url")).searchParams.get("state") ?? ""
    expect(state).not.toBe("")
    const callback = await request(t, `/oauth2/callback/idn?code=fixture-code&state=${encodeURIComponent(state)}&iss=${encodeURIComponent(IDN_ISSUER)}`, { method: "GET" })
    expect(callback.status).toBe(302)
    const destination = new URL(callback.location ?? "")
    expect(`${destination.origin}${destination.pathname}`).toBe(`${MEMBERS_ORIGIN}/bienvenue`)
    expect(destination.searchParams.get("ott")).toBeTruthy()
    expect(callback.setCookie).toBeNull()
    expect(calls).toContain("/token")
    expect(await t.query(components.betterAuth.adapter.findOne, { model: "verification", where: [{ field: "identifier", value: state }] })).toBeNull()
  })

  it.each([
    { label: "une casse différente", origin: MEMBERS_ORIGIN, body: membersStart(MEMBERS_ORIGIN, { antsiaEntry: "SSO" }) },
    { label: "une autre valeur", origin: MEMBERS_ORIGIN, body: membersStart(MEMBERS_ORIGIN, { antsiaEntry: "login" }) },
    { label: "une liste", origin: MEMBERS_ORIGIN, body: membersStart(MEMBERS_ORIGIN, { antsiaEntry: ["sso"] }) },
    { label: "un objet", origin: MEMBERS_ORIGIN, body: membersStart(MEMBERS_ORIGIN, { antsiaEntry: { mode: "sso" } }) },
    { label: "null", origin: MEMBERS_ORIGIN, body: membersStart(MEMBERS_ORIGIN, { antsiaEntry: null }) },
    { label: "une clé de plus", origin: MEMBERS_ORIGIN, body: membersStart(MEMBERS_ORIGIN, { antsiaEntry: "sso", max_age: "0" }) },
    { label: "un autre fournisseur", origin: MEMBERS_ORIGIN, body: { ...membersStart(MEMBERS_ORIGIN, SSO), providerId: "autre" } },
    { label: "l'administration d'un réseau", origin: localOrigin("admin_diaspora_ga"), body: { providerId: "idn", callbackURL: ADMIN_ENTRY, newUserCallbackURL: ADMIN_ENTRY, errorCallbackURL: ADMIN_ENTRY, additionalData: SSO } },
    { label: "la console", origin: localOrigin("admin_antsia_ga"), body: { providerId: "idn", callbackURL: CONSOLE_ENTRY, newUserCallbackURL: CONSOLE_ENTRY, errorCallbackURL: CONSOLE_ENTRY, additionalData: SSO } },
    { label: "un nouvel utilisateur envoyé à l'administration", origin: MEMBERS_ORIGIN, body: { ...membersStart(MEMBERS_ORIGIN, SSO), newUserCallbackURL: ADMIN_ENTRY } },
  ])("refuse $label : 400 `idnEntryInvalid`, sans appel à IDN ni état enregistré", async ({ origin, body }) => {
    configureIdnFixture()
    const calls = stubIdnTransport()
    const t = testConvex({ automaticSessions: false })
    const refusal = await request(t, "/sign-in/oauth2", { body, origin })
    expect(refusal.status).toBe(400)
    expect(record(refusal.data)).toEqual(REFUSED)
    expect(refusal.location).toBeNull()
    expect(calls).toEqual([])
    expect(await verificationRows(t)).toEqual([])
  })

  it("refuse une origine de confiance qui ne nomme aucune application du catalogue (fermé par défaut)", async () => {
    configureIdnFixture()
    const calls = stubIdnTransport()
    const foreign = "https://porte.example.test"
    vi.stubEnv("TRUSTED_ORIGINS", foreign)
    const t = testConvex({ automaticSessions: false })
    const refusal = await request(t, "/sign-in/oauth2", { body: membersStart(foreign, SSO), origin: foreign })
    expect(refusal.status).toBe(400)
    expect(record(refusal.data)).toEqual(REFUSED)
    expect(calls).toEqual([])
    // La même origine garde la porte ordinaire, sans intention.
    const ordinary = await request(t, "/sign-in/oauth2", { body: membersStart(foreign), origin: foreign })
    expect(ordinary.status).toBe(200)
    expect(new URL(textField(ordinary.data, "url")).searchParams.get("prompt")).toBe("login")
  })

  it("refuse l'intention à côté du parcours natif, que le crochet natif admet seul", async () => {
    configureIdnFixture()
    const calls = stubIdnTransport()
    const redirectUri = "antsia-fixture://auth/idn"
    vi.stubEnv("NATIVE_AUTH_REDIRECT_URI", redirectUri)
    const callbackURL = `${PRIMARY_ORIGIN}/api/auth/native/return`
    const native = { providerId: "idn", callbackURL, newUserCallbackURL: callbackURL, errorCallbackURL: callbackURL, additionalData: { antsiaNative: { challenge: "c".repeat(43), state: "s".repeat(43), redirectUri } } }
    const t = testConvex({ automaticSessions: false })
    const refusal = await request(t, "/sign-in/oauth2", { body: { ...native, additionalData: { ...native.additionalData, ...SSO } } })
    expect(refusal.status).toBe(400)
    expect(record(refusal.data)).toEqual(REFUSED)
    expect(calls).toEqual([])
    expect(await verificationRows(t)).toEqual([])
    // Le même départ natif, sans l'intention, passe : le refus vient bien de l'intention.
    const nativeStart = await request(t, "/sign-in/oauth2", { body: native })
    expect(nativeStart.status).toBe(200)
    expect(new URL(textField(nativeStart.data, "url")).searchParams.get("prompt")).toBe("login")
  })

  it("la fonction des paramètres refuse aussi d'elle-même : un départ qui contournerait le crochet n'obtient jamais la session vivante", async () => {
    configureIdnFixture()
    const t = testConvex({ automaticSessions: false })
    const outcomes = await t.action(async (ctx) => {
      const { createAuth } = await import("./auth")
      const plugin = createAuth(ctx, MEMBERS_ORIGIN).options.plugins?.find((item) => item.id === "generic-oauth")
      if (!plugin || !("options" in plugin)) throw new Error("Réglage du fournisseur IDN absent")
      const options = record(plugin.options)
      if (!Array.isArray(options.config) || options.config.length !== 1) throw new Error("Fournisseur IDN absent")
      const params = record(options.config[0]).authorizationUrlParams
      if (typeof params !== "function") throw new Error("Paramètres d'autorisation IDN absents")
      const outcome = (body: Record<string, unknown>) => {
        try {
          return { params: (params as (ctx: { path?: string; body?: unknown }) => unknown)({ path: "/sign-in/oauth2", body }) }
        } catch (error) {
          return { refused: record(record(error).body).code }
        }
      }
      return {
        sso: outcome(membersStart(MEMBERS_ORIGIN, SSO)),
        unknown: outcome(membersStart(MEMBERS_ORIGIN, { antsiaEntry: "toujours" })),
        admin: outcome({ providerId: "idn", callbackURL: ADMIN_ENTRY, newUserCallbackURL: ADMIN_ENTRY, errorCallbackURL: ADMIN_ENTRY, additionalData: SSO }),
      }
    })
    expect(outcomes).toEqual({ sso: { params: {} }, unknown: { refused: "idnEntryInvalid" }, admin: { refused: "idnEntryInvalid" } })
  })
})

describe("PA7 / preuve de session IDN : callbacks réels invoqués directement, sans recette OIDC externe", () => {
  it("une vraie session OTP reste sans autorité de console malgré un compte et un lien IDN de garantie 2", async () => {
    const t = testConvex({ automaticSessions: false })
    const { userId, sessionId } = await loggedIn(t)
    const subject = "idn-previous-link-fixture"
    const now = Date.now()
    await t.mutation(components.betterAuth.adapter.create, { input: { model: "account", data: { userId, providerId: "idn", accountId: subject, createdAt: now, updatedAt: now } } })
    await t.mutation(internal.modules.people.identity.recordIdnProof, { subject, loa: 2 })
    const as = t.withIdentity({ subject: userId, sessionId })
    const personId = await as.mutation(api.modules.people.persons.ensureMyPerson, {})
    await t.run(async (ctx) => await ctx.db.insert("operators", { personId, role: "platform_admin", grantedAt: now }))
    const link = await t.run(async (ctx) => await ctx.db.query("identityLinks").withIndex("by_person_and_provider", (q) => q.eq("personId", personId).eq("provider", "idn")).unique())
    expect(link).toMatchObject({ subject, loa: 2 })
    expect(await t.run(async (ctx) => await ctx.db.query("operatorSessionProofs").withIndex("by_session", (q) => q.eq("sessionId", sessionId)).unique())).toBeNull()
    await expect(as.query(api.modules.platform.operatorAccess.myOperator, {})).rejects.toMatchObject({ data: { code: "operatorRequired" } })
  })

  it("le mapping et le middleware du même createAuth scellent une session Better Auth réelle, puis la lient à la personne sans état civil", async () => {
    configureIdnFixture()
    const t = testConvex({ automaticSessions: false })
    const fixture = await callbackSessionFixture(t)
    const mapped = await t.action(async (ctx) => {
      const { createAuth } = await import("./auth")
      const hooks = idnCallbackHooks(createAuth(ctx))
      expect(hooks.matches({ path: "/sign-in/email-otp" })).toBe(false)
      const user = await hooks.mapProfile({ sub: fixture.subject, email: "idn-session@example.test", email_verified: true, loa: 2, name: "Nom civil fictif IDN" })
      expect(hooks.matches({ path: "/oauth2/callback/idn" })).toBe(true)
      await hooks.runAfter({ path: "/oauth2/callback/idn", context: { newSession: { session: fixture.session } } })
      return user
    })
    expect(mapped).toMatchObject({ email: "idn-session@example.test", emailVerified: true })
    expect(record(mapped).name).not.toBe("Nom civil fictif IDN")
    const before = await t.run(async (ctx) => await ctx.db.query("operatorSessionProofs").withIndex("by_session", (q) => q.eq("sessionId", fixture.sessionId)).unique())
    expect(before).toMatchObject({ sessionId: fixture.sessionId, authUserId: fixture.userId, idnSubject: fixture.subject, loa: 2, expiresAt: record(fixture.session).expiresAt })
    expect(before?.expiresAt).toBeGreaterThan(Date.now())
    expect(before?.personId).toBeUndefined()
    expect(before).not.toHaveProperty("email")
    expect(before).not.toHaveProperty("name")
    expect(await t.run(async (ctx) => await ctx.db.query("persons").first())).toBeNull()
    const as = t.withIdentity({ subject: fixture.userId, sessionId: fixture.sessionId })
    const personId = await as.mutation(api.modules.people.persons.ensureMyPerson, {})
    const proof = await t.run(async (ctx) => await ctx.db.query("operatorSessionProofs").withIndex("by_session", (q) => q.eq("sessionId", fixture.sessionId)).unique())
    expect(proof?.personId).toBe(personId)
    const person = await t.run(async (ctx) => await ctx.db.get(personId))
    expect(person?.displayName).toBeUndefined()
    expect(person?.handle).toBeUndefined()
    expect(person?.publishedAt).toBeUndefined()
    expect(await t.run(async (ctx) => await ctx.db.query("networkMemberships").first())).toBeNull()
  })

  it("sans garantie ou sans nouvelle session, le mapping ne dépose aucune preuve de session ; les hooks OTP frais ne correspondent jamais", async () => {
    configureIdnFixture()
    for (const missing of ["loa", "newSession"] as const) {
      const t = testConvex({ automaticSessions: false })
      const fixture = await callbackSessionFixture(t)
      await t.action(async (ctx) => {
        const { createAuth } = await import("./auth")
        const hooks = idnCallbackHooks(createAuth(ctx))
        for (const path of ["/sign-in/email-otp", "/phone-number/verify"]) expect(hooks.matches({ path })).toBe(false)
        await hooks.mapProfile({ sub: fixture.subject, email: "idn-session@example.test", email_verified: true, ...(missing === "loa" ? {} : { loa: 2 }) })
        await hooks.runAfter({ path: "/oauth2/callback/idn", context: missing === "newSession" ? {} : { newSession: { session: fixture.session } } })
        // Une instance de requête neuve ne reprend jamais la preuve de ce callback.
        const nextRequest = idnCallbackHooks(createAuth(ctx))
        for (const path of ["/sign-in/email-otp", "/phone-number/verify"]) expect(nextRequest.matches({ path })).toBe(false)
      })
      expect(await t.run(async (ctx) => await ctx.db.query("operatorSessionProofs").withIndex("by_session", (q) => q.eq("sessionId", fixture.sessionId)).unique())).toBeNull()
      expect(await t.run(async (ctx) => await ctx.db.query("persons").first())).toBeNull()
    }
  })
})

describe("ADR-0044 / pré-remplissage de l'accueil : déposé par le seul rappel IDN, une fois la session ouverte", () => {
  const idnProfile = (subject: string) => ({
    sub: subject, email: "moussavounze.awa@idn.ga", email_verified: true, loa: 2,
    name: "Gaëlle Awa MOUSSAVOU-NZÉ", given_name: "Gaëlle Awa", family_name: "MOUSSAVOU-NZÉ",
    nip: "fictional-nip-0000", birthdate: "1990-01-01", gender: "M", birth_place: "Libreville", picture: "https://images.example.test/photo",
  })
  const prefillOf = (t: T, authUserId: string) => t.run(async (ctx) => await ctx.db.query("idnPrefills").withIndex("by_authUserId", (q) => q.eq("authUserId", authUserId)).unique())

  it("range nom civil et identifiant IDN sous l'utilisateur de la session, jamais dans Better Auth, la preuve ni la personne", async () => {
    configureIdnFixture()
    const t = testConvex({ automaticSessions: false })
    const fixture = await callbackSessionFixture(t)
    const mapped = await t.action(async (ctx) => {
      const { createAuth } = await import("./auth")
      const hooks = idnCallbackHooks(createAuth(ctx))
      const user = await hooks.mapProfile(idnProfile(fixture.subject))
      await hooks.runAfter({ path: "/oauth2/callback/idn", context: { newSession: { session: fixture.session } } })
      return user
    })
    expect(record(mapped).name).not.toContain("MOUSSAVOU")
    const prefill = await prefillOf(t, fixture.userId)
    expect(prefill).toMatchObject({ authUserId: fixture.userId, givenNames: "Gaëlle Awa", familyName: "MOUSSAVOU-NZÉ", idnIdentifier: "moussavounze.awa" })
    expect(prefill!.expiresAt - prefill!.observedAt).toBe(24 * 60 * 60 * 1000)
    for (const forbidden of ["fictional-nip-0000", "1990-01-01", "Libreville", "images.example.test", fixture.subject]) expect(JSON.stringify(prefill)).not.toContain(forbidden)
    const proof = await t.run(async (ctx) => await ctx.db.query("idnProofs").withIndex("by_subject", (q) => q.eq("subject", fixture.subject)).unique())
    expect(JSON.stringify(proof)).not.toContain("MOUSSAVOU")
    const as = t.withIdentity({ subject: fixture.userId, sessionId: fixture.sessionId })
    const personId = await as.mutation(api.modules.people.persons.ensureMyPerson, {})
    expect((await t.run(async (ctx) => await ctx.db.get(personId)))?.displayName).toBeUndefined()
    const entry = await as.query(api.modules.people.idnPrefill.myEntryPrefill, {})
    expect(entry?.displayName).toBe("MOUSSAVOU-NZÉ Gaëlle Awa")
    expect(entry?.handles.slice(0, 2)).toEqual([{ handle: "awa", available: true }, { handle: "moussavounze.awa", available: true }])
  })

  it("sans session ouverte (connexion refusée, rattachement), rien n'est déposé ; une requête neuve ne reprend rien", async () => {
    configureIdnFixture()
    const t = testConvex({ automaticSessions: false })
    const fixture = await callbackSessionFixture(t)
    await t.action(async (ctx) => {
      const { createAuth } = await import("./auth")
      const hooks = idnCallbackHooks(createAuth(ctx))
      await hooks.mapProfile(idnProfile(fixture.subject))
      await hooks.runAfter({ path: "/oauth2/callback/idn", context: {} })
      const nextRequest = idnCallbackHooks(createAuth(ctx))
      expect(nextRequest.matches({ path: "/oauth2/callback/idn" })).toBe(false)
      await nextRequest.runAfter({ path: "/oauth2/callback/idn", context: { newSession: { session: fixture.session } } })
    })
    expect(await t.run(async (ctx) => await ctx.db.query("idnPrefills").first())).toBeNull()
  })

  it("une panne du pré-remplissage ne casse jamais la connexion : la preuve de session est scellée quand même", async () => {
    configureIdnFixture()
    const t = testConvex({ automaticSessions: false })
    const fixture = await callbackSessionFixture(t)
    await t.action(async (ctx) => {
      const { createAuth } = await import("./auth")
      const failing = {
        ...ctx,
        runMutation: async (reference: Parameters<typeof ctx.runMutation>[0], args: Record<string, unknown>) => {
          if (getFunctionName(reference) === "modules/people/idnPrefill:recordIdnPrefill") throw new Error("panne fictive du pré-remplissage")
          return await ctx.runMutation(reference, args as never)
        },
      } as typeof ctx
      const hooks = idnCallbackHooks(createAuth(failing))
      await hooks.mapProfile(idnProfile(fixture.subject))
      await expect(hooks.runAfter({ path: "/oauth2/callback/idn", context: { newSession: { session: fixture.session } } })).resolves.not.toThrow()
    })
    expect(await t.run(async (ctx) => await ctx.db.query("operatorSessionProofs").withIndex("by_session", (q) => q.eq("sessionId", fixture.sessionId)).unique())).toMatchObject({ authUserId: fixture.userId, loa: 2 })
    expect(await prefillOf(t, fixture.userId)).toBeNull()
  })
})
