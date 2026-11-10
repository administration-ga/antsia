import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { buildNativeAuthClient } from "./auth-client"
import { runNativeDemo, type NativeDemoAccount } from "./native-demo"
import { createNativeCredentialVault, nativeCredentialKey, type NativeCredentialStorage } from "./secure-storage"

vi.mock("expo-secure-store", () => ({ WHEN_UNLOCKED_THIS_DEVICE_ONLY: 7, getItemAsync: vi.fn(), setItemAsync: vi.fn(), deleteItemAsync: vi.fn() }))

const NOW = Date.parse("2026-10-24T12:00:00Z")
const SERVER = "https://demo-engine.example.test"
const OTHER_SERVER = "https://production-engine.example.test"
const TOKEN = "header-issued-demo-session.signed-proof"
const NEW_TOKEN = "newer-demo-session.signed-proof"
const OTHER_TOKEN = "other-environment-session.signed-proof"
const BODY_TOKEN = "body-session-token-is-not-a-credential"
const OTP = "482913"
const ACCOUNT = {
  actor: "membre", email: "membre@demo.antsia.test",
  profile: { displayName: "Awa MBA", handle: "membre.demo", headline: "Membre de démonstration" },
} satisfies NativeDemoAccount
const USER = {
  id: "demo-member", name: ACCOUNT.profile.displayName, email: ACCOUNT.email, emailVerified: true,
  createdAt: new Date(NOW).toISOString(), updatedAt: new Date(NOW).toISOString(),
}

function session(overrides: Record<string, unknown> = {}) {
  return { id: "demo-session", userId: USER.id, expiresAt: new Date(Date.now() + 60_000).toISOString(), ...overrides }
}
function reply(body: unknown, token?: string) {
  return new Response(JSON.stringify(body), { headers: { "content-type": "application/json", ...(token ? { "set-auth-token": token } : {}) } })
}
function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}
function transport(options: { token?: string | null; fresh?: unknown; events?: string[] } = {}) {
  return vi.fn(async (url: RequestInfo | URL, _init?: RequestInit): Promise<Response> => {
    const path = new URL(String(url)).pathname
    if (path === "/api/auth/email-otp/send-verification-otp") {
      options.events?.push("send")
      return reply({ success: true, token: BODY_TOKEN }, "send-header-is-not-a-credential.signature")
    }
    if (path === "/api/auth/sign-in/email-otp") {
      options.events?.push("verify")
      return reply({ user: USER, token: BODY_TOKEN }, options.token === null ? undefined : options.token ?? TOKEN)
    }
    if (path === "/api/auth/get-session") {
      options.events?.push("session")
      return reply(options.fresh ?? { user: USER, session: session() }, "fresh-header-is-not-a-credential.signature")
    }
    throw new Error("unexpectedDemoRequest")
  })
}
async function fixture(fetchFactory?: (events: string[]) => typeof fetch) {
  const items = new Map<string, string>()
  const writes: { key: string; value: string }[] = []
  const removed: string[] = []
  const events: string[] = []
  // Better Auth captures fetch when the client is constructed.
  if (fetchFactory) vi.stubGlobal("fetch", fetchFactory(events))
  const storage: NativeCredentialStorage = {
    getItem: async key => items.get(key) ?? null,
    setItem: async (key, value) => { writes.push({ key, value }); items.set(key, value) },
    removeItem: async key => { removed.push(key); items.delete(key) },
  }
  const vault = createNativeCredentialVault(SERVER, storage)
  await vault.readToken()
  const mutation = vi.fn(async () => { throw new Error("demoMutationForbidden") })
  const queries = {
    configuration: vi.fn(async () => { events.push("configuration"); return { demoAccounts: true, emailOtp: true } }),
    catalogue: vi.fn(async (): Promise<readonly NativeDemoAccount[]> => { events.push("catalogue"); return [ACCOUNT] }),
    latestOtp: vi.fn(async (email: string): Promise<{ code: string; expiresAt: number } | null> => {
      events.push(`code:${email}`)
      return { code: OTP, expiresAt: Date.now() + 60_000 }
    }),
    bootstrap: mutation, ensureMyPerson: mutation, equipMyDemoAccount: mutation, publishMyProfile: mutation,
  }
  const input: Parameters<typeof runNativeDemo>[0] = {
    enabled: true, actor: ACCOUNT.actor, auth: buildNativeAuthClient(SERVER, vault), vault, queries,
    isCurrent: () => true, isForeground: () => true,
  }
  return { input, items, writes, removed, events, queries, mutation }
}

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(NOW); vi.stubGlobal("fetch", transport()) })
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe("native demo admission with the real OTP auth client and credential vault", () => {
  it("signs in the selected actor and correlates a fresh session without bootstrapping any data", async () => {
    const { input, items, writes, events, queries, mutation } = await fixture(events => transport({ events }))
    expect(await runNativeDemo(input)).toBe(true)
    expect(events).toEqual(["configuration", "catalogue", "send", `code:${ACCOUNT.email}`, "verify", "session"])
    expect(queries.latestOtp).toHaveBeenCalledExactlyOnceWith(ACCOUNT.email)
    expect(mutation).not.toHaveBeenCalled()
    expect(writes).toEqual([{ key: nativeCredentialKey(SERVER), value: TOKEN }])
    expect(items.get(nativeCredentialKey(SERVER))).toBe(TOKEN)
    const requests = vi.mocked(fetch).mock.calls
    expect(requests).toHaveLength(3)
    expect(JSON.parse(String(requests[0]![1]?.body))).toEqual({ email: ACCOUNT.email, type: "sign-in" })
    expect(JSON.parse(String(requests[1]![1]?.body))).toEqual({ email: ACCOUNT.email, otp: OTP })
    expect(String(requests[2]![0])).toContain("disableCookieCache=true")
    expect(new Headers(requests[2]![1]?.headers).get("authorization")).toBe(`Bearer ${TOKEN}`)
    for (const [, request] of requests) {
      expect(request?.credentials).toBe("omit")
      expect(new Headers(request?.headers).has("cookie")).toBe(false)
      expect(new Headers(request?.headers).has("better-auth-cookie")).toBe(false)
    }
  })

  it.each(["disabled", "demo-disabled", "email-disabled"])("does not request an OTP when admission is %s", async reason => {
    const { input, items, queries } = await fixture()
    if (reason === "disabled") input.enabled = false
    else queries.configuration.mockResolvedValue({ demoAccounts: reason !== "demo-disabled", emailOtp: reason !== "email-disabled" })
    await expect(runNativeDemo(input)).rejects.toThrow("nativeDemoUnavailable")
    expect(fetch).not.toHaveBeenCalled()
    expect(queries.catalogue).not.toHaveBeenCalled()
    expect(queries.latestOtp).not.toHaveBeenCalled()
    expect(items.size).toBe(0)
  })

  it.each(["missing-actor", "real-email"])("refuses %s before any authentication request", async reason => {
    const { input, items, queries } = await fixture()
    if (reason === "missing-actor") input.actor = "not-in-the-catalogue"
    else queries.catalogue.mockResolvedValue([{ ...ACCOUNT, email: "real-member@example.test" }])
    await expect(runNativeDemo(input)).rejects.toThrow("nativeDemoAccountUnavailable")
    expect(fetch).not.toHaveBeenCalled()
    expect(queries.latestOtp).not.toHaveBeenCalled()
    expect(items.size).toBe(0)
  })

  it.each([
    { kind: "expired", otp: { code: OTP, expiresAt: NOW } },
    { kind: "malformed", otp: { code: "48291x", expiresAt: NOW + 60_000 } },
    { kind: "missing", otp: null },
  ])("bounds $kind OTP reads without ever submitting a verification", async ({ otp }) => {
    const { input, items, queries } = await fixture()
    const firstRead = deferred<void>()
    const begin = vi.spyOn(input.vault, "beginLogin")
    queries.latestOtp.mockImplementation(async () => { firstRead.resolve(); return otp })
    const operation = runNativeDemo(input)
    const refused = expect(operation).rejects.toThrow("nativeDemoUnavailable")
    await firstRead.promise
    await vi.advanceTimersByTimeAsync(1_750)
    await refused
    expect(queries.latestOtp).toHaveBeenCalledTimes(8)
    expect(begin).not.toHaveBeenCalled()
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(items.size).toBe(0)
  })

  it.each(["environment-switch", "background"])("abandons an OTP send after %s without arming capture", async reason => {
    const sent = deferred<Response>(), started = deferred<void>(), normal = transport()
    let current = true, foreground = true
    const { input, items, writes, queries } = await fixture(() => vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      if (String(url).includes("/email-otp/send-verification-otp")) { started.resolve(); return await sent.promise }
      return await normal(url, init)
    }))
    input.isCurrent = () => current
    input.isForeground = () => foreground
    const begin = vi.spyOn(input.vault, "beginLogin")
    const operation = runNativeDemo(input)
    await started.promise
    if (reason === "environment-switch") current = false
    else foreground = false
    input.vault.fence()
    sent.resolve(reply({ success: true }, TOKEN))
    expect(await operation).toBe(false)
    expect(begin).not.toHaveBeenCalled()
    expect(queries.latestOtp).not.toHaveBeenCalled()
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(writes).toEqual([])
    expect(items.size).toBe(0)
  })

  it("cannot capture an OTP response that arrives after the vault fence and environment switch", async () => {
    const verified = deferred<Response>(), started = deferred<void>(), normal = transport()
    let current = true
    const { input, items, writes } = await fixture(() => vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      if (String(url).includes("/sign-in/email-otp")) { started.resolve(); return await verified.promise }
      return await normal(url, init)
    }))
    input.isCurrent = () => current
    const operation = runNativeDemo(input)
    await started.promise
    input.vault.fence()
    current = false
    verified.resolve(reply({ user: USER, token: BODY_TOKEN }, TOKEN))
    expect(await operation).toBe(false)
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(writes).toEqual([])
    expect(items.size).toBe(0)
  })

  it.each(["email", "subject", "inconsistent-subject", "expired"])("rejects a fresh session with another %s and purges only its own credential", async mismatch => {
    const user = mismatch === "email" ? { ...USER, email: "another@demo.antsia.test" }
      : mismatch === "subject" ? { ...USER, id: "another-subject" } : USER
    const freshSession = session(mismatch === "subject" ? { userId: "another-subject" }
      : mismatch === "inconsistent-subject" ? { userId: "another-subject" }
        : mismatch === "expired" ? { expiresAt: new Date(NOW).toISOString() } : {})
    const { input, items, removed } = await fixture(() => transport({ fresh: { user, session: freshSession } }))
    const otherKey = nativeCredentialKey(OTHER_SERVER)
    items.set(otherKey, OTHER_TOKEN)
    await expect(runNativeDemo(input)).rejects.toThrow("nativeDemoSessionInvalid")
    expect(input.vault.hasCredential).toBe(false)
    expect(await input.vault.readToken()).toBeNull()
    expect(removed).toEqual([nativeCredentialKey(SERVER)])
    expect(items).toEqual(new Map([[otherKey, OTHER_TOKEN]]))
  })

  it("does not delete a newer login when an earlier fresh-session response arrives", async () => {
    const fresh = deferred<Response>(), started = deferred<void>(), normal = transport()
    let verifications = 0
    const { input, items, removed } = await fixture(() => vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      if (String(url).includes("/get-session")) { started.resolve(); return await fresh.promise }
      if (String(url).includes("/sign-in/email-otp") && ++verifications === 2) return reply({ user: USER, token: BODY_TOKEN }, NEW_TOKEN)
      return await normal(url, init)
    }))
    const operation = runNativeDemo(input)
    await started.promise
    input.vault.beginLogin()
    await input.auth.signIn.emailOtp({ email: ACCOUNT.email, otp: OTP })
    expect(await input.vault.readToken()).toBe(NEW_TOKEN)
    fresh.resolve(reply({ user: { ...USER, email: "another@demo.antsia.test" }, session: session() }))
    expect(await operation).toBe(false)
    expect(await input.vault.readToken()).toBe(NEW_TOKEN)
    expect(items.get(nativeCredentialKey(SERVER))).toBe(NEW_TOKEN)
    expect(removed).toEqual([])
  })

  it("never adopts a JSON body token when the OTP response lacks set-auth-token", async () => {
    const { input, items, writes } = await fixture(() => transport({ token: null }))
    await expect(runNativeDemo(input)).rejects.toThrow("nativeAuthCredentialMissing")
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(input.vault.hasCredential).toBe(false)
    expect(writes).toEqual([])
    expect(items.size).toBe(0)
  })
})
