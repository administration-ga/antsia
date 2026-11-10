// @vitest-environment edge-runtime
/** Recette du vrai gestionnaire Better Auth et de ses composants, sans service externe. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { Resend } from "@convex-dev/resend"

import catalog from "../../deploy/catalog.json"
import { api, components, internal } from "../_generated/api"
import { createTestSession, testConvex } from "../test.setup"
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

function textField(value: unknown, key: string): string {
  const field = record(value)[key]
  if (typeof field !== "string" || !field) throw new Error(`Champ de recette absent : ${key}`)
  return field
}

async function request(t: T, path: string, { method = "POST", body, token, origin = PRIMARY_ORIGIN, acceptLanguage, browserCookie }: { method?: "GET" | "POST"; body?: Record<string, unknown>; token?: string; origin?: string; acceptLanguage?: string; browserCookie?: string } = {}) {
  const response = await t.action(async (ctx) => {
    const { createAuth } = await import("./auth")
    const headers = new Headers({ Origin: origin })
    if (body) headers.set("Content-Type", "application/json")
    if (token) headers.set("Authorization", `Bearer ${token}`)
    if (acceptLanguage) headers.set("Accept-Language", acceptLanguage)
    if (browserCookie !== undefined) headers.set("Better-Auth-Cookie", browserCookie)
    const result = await createAuth(ctx, origin).handler(new Request(`${PRIMARY_ORIGIN}/api/auth${path}`, {
      method,
      headers,
      ...(body ? { body: JSON.stringify(body) } : {}),
    }))
    return { status: result.status, body: await result.text(), tokenHeader: result.headers.get("set-auth-token"), hasBrowserCookie: result.headers.has("set-better-auth-cookie") }
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
  })

  it("le seau de connexion compte aussi les essais sans code existant", async () => {
    const t = testConvex({ automaticSessions: false })
    for (let count = 0; count < 5; count++) expect((await signIn(t, "email", "000000")).status).toBe(400)
    const refusal = await signIn(t, "email", "000000")
    expect(refusal.status).toBe(429)
    expect(record(refusal.data).code).toBe("rateLimited")
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

  it("le code d'un compte de démonstration DIASPORALE se relit de même (ADR-0038)", async () => {
    declareDemo()
    const t = testConvex({ automaticSessions: false })
    const email = "moderateur@demo.diasporale.test"
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

describe("langue de la personne et marque du réseau dans le code de connexion", () => {
  const DIASPORALE_ORIGIN = new URL(catalog.applications.diasporale_com.site_url).origin
  const ANTSIA_ORIGIN = new URL(catalog.applications.antsia_ga.site_url).origin
  const LOCAL_DIASPORALE_ORIGIN = `http://localhost:${catalog.applications.diasporale_com.dev_port}`
  const ENGLISH_DIASPORALE = /^Your DIASPORALE code: \d{6}\. It expires in five minutes\.$/

  /** Un backend en nuage avec un transport configuré : le message est réellement composé, son envoi est simulé. */
  function emailTransport() {
    vi.stubEnv("CONVEX_CLOUD_URL", "https://backend.example.test")
    vi.stubEnv("RESEND_API_KEY", "fictional-resend-test-key")
    vi.stubEnv("RESEND_FROM_ADDRESS", "ANTSIA <no-reply@example.test>")
    return vi.spyOn(Resend.prototype, "sendEmail").mockResolvedValue("fictional-email-id" as never)
  }

  async function sendEmailCode(t: T, options: { origin: string; acceptLanguage?: string; email?: string }) {
    const response = await request(t, "/email-otp/send-verification-otp", { origin: options.origin, acceptLanguage: options.acceptLanguage, body: { email: options.email ?? EMAIL, type: "sign-in" } })
    expect(response.status).toBe(200)
  }

  function lastEmail(send: ReturnType<typeof emailTransport>) {
    const email = record(send.mock.lastCall?.[1])
    return { from: email.from, to: email.to, subject: email.subject, text: textField(email, "text") }
  }

  it("un code demandé en anglais sur diasporale.com part en anglais, à la marque DIASPORALE", async () => {
    const send = emailTransport()
    const t = testConvex({ automaticSessions: false })
    await sendEmailCode(t, { origin: DIASPORALE_ORIGIN, acceptLanguage: "en" })
    expect(send).toHaveBeenCalledOnce()
    const email = lastEmail(send)
    expect(email).toMatchObject({ from: "ANTSIA <no-reply@example.test>", to: EMAIL, subject: "Your DIASPORALE sign-in code" })
    expect(email.text).toMatch(ENGLISH_DIASPORALE)
  })

  it("en français sur diasporale.com, préférences régionales comprises", async () => {
    const send = emailTransport()
    const t = testConvex({ automaticSessions: false })
    await sendEmailCode(t, { origin: DIASPORALE_ORIGIN, acceptLanguage: "fr-FR,fr;q=0.9,en;q=0.8" })
    const email = lastEmail(send)
    expect(email.subject).toBe("Votre code de connexion DIASPORALE")
    expect(email.text).toMatch(/^Votre code DIASPORALE : \d{6}\. Il expire dans cinq minutes\.$/)
  })

  it("sans langue donnée : celle du déploiement, sinon le français ; antsia.ga garde la marque ANTSIA", async () => {
    const send = emailTransport()
    const t = testConvex({ automaticSessions: false })
    await sendEmailCode(t, { origin: ANTSIA_ORIGIN })
    expect(lastEmail(send).subject).toBe("Votre code de connexion ANTSIA")
    expect(lastEmail(send).text).toMatch(/^Votre code ANTSIA : \d{6}\. Il expire dans cinq minutes\.$/)
    vi.stubEnv("AUTH_DEFAULT_LOCALE", "en")
    await sendEmailCode(t, { origin: DIASPORALE_ORIGIN, email: "bob.auth@example.test" })
    expect(lastEmail(send)).toMatchObject({ to: "bob.auth@example.test", subject: "Your DIASPORALE sign-in code" })
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

  it("le SMS demandé en anglais sur diasporale.com part en anglais, à la marque DIASPORALE", async () => {
    vi.stubEnv("CONVEX_CLOUD_URL", "https://backend.example.test")
    vi.stubEnv("SMS_PROVIDER", "webhook")
    vi.stubEnv("SMS_ENDPOINT", "https://sms.example.test/send")
    vi.stubEnv("SMS_API_KEY", "fictional-sms-test-key")
    const relay = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => new Response(null, { status: 202 }))
    vi.stubGlobal("fetch", relay)
    const t = testConvex({ automaticSessions: false })
    const response = await request(t, "/phone-number/send-otp", { origin: DIASPORALE_ORIGIN, acceptLanguage: "en-GB,en;q=0.9", body: { phoneNumber: PHONE } })
    expect(response.status).toBe(200)
    expect(relay).toHaveBeenCalledOnce()
    const [url, init] = relay.mock.calls[0] ?? []
    expect(url).toBe("https://sms.example.test/send")
    const body = record(JSON.parse(String(init?.body)))
    expect(body).toMatchObject({ to: PHONE, type: "otp", ttlSeconds: 300 })
    expect(textField(body, "text")).toMatch(ENGLISH_DIASPORALE)
  })

  it("la marque vient de l'origine vérifiée, en production comme en local ; la langue, de la requête puis du déploiement", () => {
    const local = { ANTSIA_DEV_TOOLS: "true", CONVEX_CLOUD_URL: "http://127.0.0.1:3210" }
    expect(otpPresentation({ origin: DIASPORALE_ORIGIN, acceptLanguage: "en" }, {})).toEqual({ locale: "en", brand: "DIASPORALE" })
    expect(otpPresentation({ origin: LOCAL_DIASPORALE_ORIGIN, acceptLanguage: "en" }, local)).toEqual({ locale: "en", brand: "DIASPORALE" })
    // Un port local sans les outils de développement d'un backend local ne désigne aucune application.
    expect(otpPresentation({ origin: LOCAL_DIASPORALE_ORIGIN, acceptLanguage: "en" }, {})).toEqual({ locale: "en", brand: "ANTSIA" })
    for (const app of ["antsia_ga", "admin_antsia_ga"] as const) {
      expect(otpPresentation({ origin: new URL(catalog.applications[app].site_url).origin, acceptLanguage: null }, {}).brand).toBe("ANTSIA")
    }
    for (const origin of [null, undefined, "https://foreign.example.test"]) expect(otpPresentation({ origin, acceptLanguage: undefined }, {})).toEqual({ locale: "fr", brand: "ANTSIA" })
    expect(otpPresentation({ origin: null, acceptLanguage: undefined }, { AUTH_DEFAULT_LOCALE: "en" }).locale).toBe("en")
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
      return { providerId: provider.providerId, pkce: provider.pkce, scopes: provider.scopes, redirectURI: provider.redirectURI, prompt: provider.prompt }
    })
    expect(config).toEqual({ providerId: "idn", pkce: true, scopes: ["openid", "profile", "email"], redirectURI: `${PRIMARY_ORIGIN}/api/auth/oauth2/callback/idn`, prompt: "login" })
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
    expect(url.searchParams.get("prompt")).toBe("login")
    expect(url.searchParams.get("client_id")).toBe("sandbox-client-fixture")
    expect(url.searchParams.get("redirect_uri")).toBe(`${PRIMARY_ORIGIN}/api/auth/oauth2/callback/idn`)
    expect(url.searchParams.get("code_challenge_method")).toBe("S256")
    expect(url.searchParams.get("code_challenge")).toBeTruthy()
    expect(url.searchParams.get("state")).toBeTruthy()
    expect(record(result.data).redirect).toBe(true)
    expect(result.hasBrowserCookie).toBe(browserCookie !== undefined)
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
