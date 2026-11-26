// @vitest-environment edge-runtime
import { afterEach, expect, it, vi } from "vitest"
import { components } from "../_generated/api"
import { testConvex } from "../test.setup"

const origin = "https://diaspora.ga"
const issuer = "https://consulat.example.test"
const subject = "d".repeat(64)
const secret = "a-secret-used-only-by-the-integration-test"
const body = JSON.stringify({ code: "a".repeat(64), verifier: "b".repeat(64) })
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
  const exchange = (caller = origin, cookie = "") => t.action(async ctx => {
    const { createAuth } = await import("./auth")
    const res = await createAuth(ctx, origin).handler(new Request(origin + "/api/auth/sign-in/consulate-pass", {
      method: "POST", body, headers: { "Content-Type": "application/json", Origin: caller, "Better-Auth-Cookie": cookie.split(";")[0]! },
    }))
    return { status: res.status, cookie: res.headers.get("set-better-auth-cookie") }
  })
  const sessionUser = (cookie: string) => t.action(async ctx => {
    const { createAuth } = await import("./auth")
    const res = await createAuth(ctx, origin).handler(new Request(origin + "/api/auth/get-session", {
      headers: { Origin: origin, "Better-Auth-Cookie": cookie.split(";")[0]! },
    }))
    return (await res.json())?.user?.id ?? null
  })
  return { t, exchange, sessionUser, relay }
}

it("ouvre une session lisible et retrouve le même compte au passage suivant", async () => {
  const { exchange, sessionUser, relay } = fixture()
  const first = await exchange()
  expect(first.status).toBe(200)
  expect(first.cookie).toBeTruthy()
  const firstUser = await sessionUser(first.cookie!)
  expect(firstUser).toEqual(expect.any(String))
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


it("rattache le compte déjà connecté lorsque chaque application a vérifié la même adresse", async () => {
  const { t, exchange, sessionUser, relay } = fixture()
  const { cookie } = await exchange()
  const userId = await sessionUser(cookie!)
  await t.mutation(components.betterAuth.adapter.deleteOne, { input: {
    model: "account", where: [{ field: "userId", value: userId }, { field: "providerId", value: "consulat" }],
  } })
  const email = "personne@example.test"
  await t.mutation(components.betterAuth.adapter.updateOne, { input: {
    model: "user", where: [{ field: "_id", value: userId }], update: { email, emailVerified: true },
  } })
  const { sha256Hex } = await import("../modules/diaspora/attestation")
  relay.mockResolvedValueOnce(Response.json({ subject, emailHash: await sha256Hex(email) }))
  const result = await exchange(origin, cookie!)
  expect(result.status).toBe(200)
  expect(await sessionUser(result.cookie!)).toBe(userId)
  const account = await t.query(components.betterAuth.adapter.findOne, { model: "account", where: [{ field: "providerId", value: "consulat" }, { field: "accountId", value: subject }] })
  expect(account?.userId).toBe(userId)
})
