// @vitest-environment edge-runtime
import { afterEach, expect, it, vi } from "vitest"
import { api, components, internal } from "../_generated/api"
import { SEED_CONFIRMATION } from "../seeds/foundations"
import { createTestSession, joinDeclaredDiasporaFixture, testConvex } from "../test.setup"

const origin = "https://diaspora.ga"
const issuer = "https://consulat.example.test"
const subject = "d".repeat(64)
const secret = "a-secret-used-only-by-the-integration-test"
const ticket = { code: "a".repeat(64), verifier: "b".repeat(64) }
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

function fixture() {
  vi.stubEnv("BETTER_AUTH_SECRET", secret)
  vi.stubEnv("SITE_URL", origin)
  vi.stubEnv("TRUSTED_ORIGINS", origin)
  vi.stubEnv("DIASPORA_PASS_APP_ORIGIN", origin)
  vi.stubEnv("DIASPORA_PASS_SECRET", secret)
  vi.stubEnv("CONSULAT_PASS_ISSUER", issuer)
  const t = testConvex({ automaticSessions: false })
  const relay = vi.fn(async () => Response.json({ subject, emailHash: "e".repeat(64) }))
  vi.stubGlobal("fetch", relay)
  const exchange = (caller = origin, cookie = "", mode?: { version: 2; afterIdn?: true }) => t.action(async ctx => {
    const { createAuth } = await import("./auth")
    const res = await createAuth(ctx, origin).handler(new Request(origin + "/api/auth/sign-in/consulate-pass", {
      method: "POST", body: JSON.stringify({ ...ticket, ...mode }), headers: { "Content-Type": "application/json", Origin: caller, "Better-Auth-Cookie": cookie.split(";")[0]! },
    }))
    return { status: res.status, data: await res.json(), cookie: res.headers.get("set-better-auth-cookie") }
  })
  const readSession = (cookie: string) => t.action(async ctx => {
    const { createAuth } = await import("./auth")
    const res = await createAuth(ctx, origin).handler(new Request(origin + "/api/auth/get-session", {
      headers: { Origin: origin, "Better-Auth-Cookie": cookie.split(";")[0]! },
    }))
    return await res.json()
  })
  const sessionUser = async (cookie: string) => (await readSession(cookie))?.user?.id ?? null
  return { t, exchange, sessionUser, readSession, relay }
}

async function existingMember(t: ReturnType<typeof testConvex>, provider: "idn" | "consulat" = "consulat") {
  await t.mutation(internal.seeds.foundations.run, { confirmNonProduction: SEED_CONFIRMATION })
  const { network } = await t.mutation(internal.modules.diaspora.seed.run, { confirmNonProduction: SEED_CONFIRMATION })
  const now = Date.now()
  const user = await t.mutation(components.betterAuth.adapter.create, { input: { model: "user", data: {
    name: "Marie NDONG", email: "marie@example.test", emailVerified: true, createdAt: now, updatedAt: now,
  } } })
  if (!user || typeof user._id !== "string") throw new Error("Compte de fixture absent")
  await t.mutation(components.betterAuth.adapter.create, { input: { model: "account", data: {
    userId: user._id, providerId: provider, accountId: provider === "idn" ? "idn-test" : subject, createdAt: now, updatedAt: now,
  } } })
  const sessionId = await createTestSession(t, user._id)
  const as = t.withIdentity({ subject: user._id, sessionId })
  await as.mutation(api.modules.people.persons.ensureMyPerson, {})
  await as.mutation(api.modules.people.consents.recordConsent, { purpose: "social_profile", origin: "onboarding" })
  await as.mutation(api.modules.people.profile.publishMyProfile, { handle: "marie.ndong", displayName: "Marie NDONG" })
  await joinDeclaredDiasporaFixture(as, { networkId: network, facet: { countryOfResidence: "FR" } })
  return user._id
}

it("ouvre une session lisible et retrouve le même compte au passage suivant", async () => {
  const { t, exchange, sessionUser, relay } = fixture()
  const expected = await existingMember(t)
  const first = await exchange()
  expect(first.status).toBe(200)
  expect(first.cookie).toBeTruthy()
  const firstUser = await sessionUser(first.cookie!)
  expect(firstUser).toBe(expected)
  const next = await exchange()
  expect(await sessionUser(next.cookie!)).toBe(firstUser)
  expect(relay).toHaveBeenCalledWith(new URL("/diaspora/session/redeem", issuer), expect.objectContaining({
    method: "POST", redirect: "error", headers: expect.objectContaining({ Authorization: "Bearer " + secret }),
  }))
})
it("refuse une autre origine avant de contacter le consulat", async () => {
  const { exchange, relay } = fixture()
  const result = await exchange("https://autre.example.test")
  expect(result.status).toBeGreaterThanOrEqual(400)
  expect(result.cookie).toBeNull()
  expect(relay).not.toHaveBeenCalled()
})
it("un code refusé par le consulat ne crée pas de session", async () => {
  const { exchange, relay } = fixture()
  relay.mockResolvedValueOnce(new Response(null, { status: 403 }))
  const result = await exchange()
  expect(result.status).toBe(401)
  expect(result.cookie).toBeNull()
})

it("un ancien client ne crée ni compte technique ni rattachement par e-mail", async () => {
  const { t, exchange, relay } = fixture()
  relay.mockResolvedValueOnce(Response.json({ subject, emailHash: "a".repeat(64) }))
  const result = await exchange()
  expect(result.status).toBe(409)
  expect(result.cookie).toBeNull()
  expect(result.data.code).toBe("consulatePassUpdateRequired")
  expect(await t.query(components.betterAuth.adapter.findOne, { model: "account", where: [{ field: "providerId", value: "consulat" }] })).toBeNull()
})

it("reconnaît le même IDN chez un membre déjà inscrit avant la passerelle", async () => {
  const { t, exchange, sessionUser, relay } = fixture()
  const expected = await existingMember(t, "idn")
  relay.mockResolvedValueOnce(Response.json({ subject, idn: "idn-test" }))
  const response = await exchange(origin, "", { version: 2 })
  expect(response.data).toEqual({ ok: true, next: "feed" })
  expect(await sessionUser(response.cookie!)).toBe(expected)
})

it("un nouveau passage appelle IDN sans créer de compte ou exposer les données civiles du consulat", async () => {
  const { t, relay, exchange } = fixture()
  relay.mockResolvedValueOnce(Response.json({ subject, idn: "idn-test", loginHint: "citoyen@idn.ga", givenNames: "Marie", familyName: "NDONG" }))
  const result = await exchange(origin, "", { version: 2 })
  expect(result.status).toBe(200)
  expect(result.data).toEqual({ ok: true, next: "idn", loginHint: "citoyen@idn.ga" })
  expect(result.cookie).toBeNull()
  const account = await t.query(components.betterAuth.adapter.findOne, { model: "account", where: [{ field: "providerId", value: "consulat" }] })
  expect(account).toBeNull()
})

it("refuse une assertion de retour IDN sans session scellée, et un nouveau billet sans sujet IDN", async () => {
  const { relay, exchange } = fixture()
  relay.mockResolvedValueOnce(Response.json({ subject, idn: "idn-test" }))
  const result = await exchange(origin, "", { version: 2, afterIdn: true })
  expect(result.status).toBe(401)
  expect(result.cookie).toBeNull()
  expect((await exchange(origin, "", { version: 2 })).status).toBe(401)
})

it("présente le consentement après un retour OIDC scellé pour le même utilisateur, avant toute adhésion", async () => {
  const { t, exchange, readSession, relay } = fixture()
  const authUserId = await existingMember(t, "idn")
  const grant = { subject, idn: "idn-test", givenNames: "Marie", familyName: "NDONG", countryOfResidence: "FR" }
  relay.mockResolvedValueOnce(Response.json(grant))
  const first = await exchange(origin, "", { version: 2 })
  const sessionId = (await readSession(first.cookie!)).session.id as string
  const as = t.withIdentity({ subject: authUserId, sessionId })
  const { network } = await t.mutation(internal.modules.diaspora.seed.run, { confirmNonProduction: SEED_CONFIRMATION })
  await as.mutation(api.modules.diaspora.membership.leaveDiasporaGa, { networkId: network })
  await t.mutation(internal.modules.people.identity.recordIdnProof, { subject: "idn-test", nationality: "GA", loa: 1 })
  await t.mutation(internal.modules.platform.operatorAccess.recordIdnSession, { sessionId, authUserId, idnSubject: "idn-test", loa: 1 })
  relay.mockResolvedValueOnce(Response.json(grant))
  const next = await exchange(origin, first.cookie!, { version: 2, afterIdn: true })
  expect(next.status).toBe(200)
  expect(next.data).toEqual({ ok: true, next: "consent", userId: authUserId, givenNames: "Marie", familyName: "NDONG", countryOfResidence: "FR" })
  expect(await t.query(internal.modules.diaspora.membership.consulateEntryState, { authUserId, sessionId, idn: "idn-test" })).toEqual({ membership: "absent", currentIdn: true })
  expect(await t.mutation(internal.modules.diaspora.membership.linkConsulatePass, { authUserId, idn: "idn-test", subject })).toBe(true)
  expect(await t.mutation(internal.modules.diaspora.membership.linkConsulatePass, { authUserId, idn: "idn-test", subject: "a".repeat(64) })).toBe(false)
})
