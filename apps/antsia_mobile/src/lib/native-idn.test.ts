import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { buildNativeAuthClient } from "./auth-client"
import { runNativeIdn } from "./native-idn"
import { createNativeCredentialVault, nativeCredentialKey, type NativeCredentialStorage } from "./secure-storage"

vi.mock("expo-secure-store", () => ({ WHEN_UNLOCKED_THIS_DEVICE_ONLY: 7, getItemAsync: vi.fn(), setItemAsync: vi.fn(), deleteItemAsync: vi.fn() }))

const SERVER = "https://engine.example.test", WEB = "https://antsia.example.test"
const TOKEN = "header-issued-session.signed-proof"
const STATE = "s".repeat(43), VERIFIER = "v".repeat(43), CHALLENGE = "h".repeat(43), CODE = "c".repeat(43)
const REDIRECT = "antsia-owned://auth/idn", CALLBACK = `${REDIRECT}?code=${CODE}&state=${STATE}`
const USER = { id: "authenticated-user", name: "Alias", email: "alias@example.test", emailVerified: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
function session(overrides: Record<string, unknown> = {}) {
  return { id: "fresh-session", userId: USER.id, expiresAt: new Date(Date.now() + 60_000).toISOString(), ...overrides }
}
function reply(body: unknown, token?: string) {
  return new Response(JSON.stringify(body), { headers: { "content-type": "application/json", ...(token ? { "set-auth-token": token } : {}) } })
}
function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}
function transport(options: { authorization?: string; token?: string | null; exchange?: unknown; fresh?: unknown } = {}) {
  return vi.fn(async (url: RequestInfo | URL, _init?: RequestInit): Promise<Response> => {
    const path = new URL(String(url)).pathname
    if (path === "/api/auth/sign-in/oauth2") return reply({ url: options.authorization ?? "https://identity.example.test/authorize", redirect: false })
    if (path === "/api/auth/native-idn/exchange") return reply(options.exchange ?? { user: USER, session: session() }, options.token === null ? undefined : options.token ?? TOKEN)
    if (path === "/api/auth/get-session") return reply(options.fresh ?? { user: USER, session: session() })
    throw new Error("unexpectedTestRequest")
  })
}
async function fixture() {
  const items = new Map<string, string>()
  const storage: NativeCredentialStorage = { getItem: async key => items.get(key) ?? null, setItem: async (key, value) => { items.set(key, value) }, removeItem: async key => { items.delete(key) } }
  const vault = createNativeCredentialVault(SERVER, storage)
  await vault.readToken()
  const input = {
    scheme: "antsia-owned", webUrl: WEB, vault, auth: buildNativeAuthClient(SERVER, vault),
    isCurrent: () => true, isForeground: () => true,
    randomToken: vi.fn().mockResolvedValueOnce(STATE).mockResolvedValueOnce(VERIFIER),
    sha256: vi.fn().mockResolvedValue(CHALLENGE),
    openSession: vi.fn(async (_url: string, _redirect: string) => ({ type: "success", url: CALLBACK })),
  }
  return { input, items }
}

beforeEach(() => { vi.useFakeTimers(); vi.stubGlobal("fetch", transport()) })
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe("native IDN orchestration with the real auth client", () => {
  it("correlates the callback, captures only the issued header and verifies the fresh bearer session", async () => {
    const { input, items } = await fixture()
    const begin = vi.spyOn(input.vault, "beginLogin")
    input.openSession.mockImplementationOnce(async (url, redirect) => {
      expect(begin).not.toHaveBeenCalled()
      expect(input.vault.hasCredential).toBe(false)
      expect(url).not.toContain(VERIFIER)
      expect(redirect).toBe(REDIRECT)
      return { type: "success", url: CALLBACK }
    })
    expect(await runNativeIdn(input)).toBe(true)
    expect(begin).toHaveBeenCalledTimes(1)
    expect(items.get(nativeCredentialKey(SERVER))).toBe(TOKEN)
    const requests = vi.mocked(fetch).mock.calls
    const start = JSON.parse(String(requests[0]![1]?.body))
    expect(start).toMatchObject({ providerId: "idn", disableRedirect: true, callbackURL: `${WEB}/api/auth/native/return`, newUserCallbackURL: `${WEB}/api/auth/native/return`, errorCallbackURL: `${WEB}/api/auth/native/return`, additionalData: { antsiaNative: { challenge: CHALLENGE, state: STATE, redirectUri: REDIRECT } } })
    expect(JSON.stringify(start)).not.toContain(VERIFIER)
    expect(JSON.parse(String(requests[1]![1]?.body))).toEqual({ code: CODE, verifier: VERIFIER })
    expect(requests[1]![1]?.signal).toBeDefined()
    expect(new Headers(requests[2]![1]?.headers).get("authorization")).toBe(`Bearer ${TOKEN}`)
    expect(String(requests[2]![0])).toContain("disableCookieCache=true")
  })

  it("cancels without arming credential capture", async () => {
    const { input, items } = await fixture()
    const begin = vi.spyOn(input.vault, "beginLogin")
    input.openSession.mockResolvedValueOnce({ type: "cancel", url: CALLBACK })
    expect(await runNativeIdn(input)).toBe(false)
    expect(begin).not.toHaveBeenCalled()
    expect(items.size).toBe(0)
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it.each([CALLBACK.replace(STATE, "x".repeat(43)), CALLBACK.replace("//auth/", "//untrusted/"), `${CALLBACK}&ott=untrusted`])("rejects an untrusted callback before capture", async url => {
    const { input } = await fixture()
    const begin = vi.spyOn(input.vault, "beginLogin")
    input.openSession.mockResolvedValueOnce({ type: "success", url })
    await expect(runNativeIdn(input)).rejects.toThrow("nativeIdnReturnInvalid")
    expect(begin).not.toHaveBeenCalled()
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it.each(["http://identity.example.test/authorize", "https://user:password@identity.example.test/authorize"])("rejects a non-HTTPS or credential-bearing authorization URL", async authorization => {
    vi.stubGlobal("fetch", transport({ authorization }))
    const { input } = await fixture()
    await expect(runNativeIdn(input)).rejects.toThrow("nativeIdnDestinationInvalid")
    expect(input.openSession).not.toHaveBeenCalled()
  })

  it("ignores a pending browser result superseded by sign-out", async () => {
    const { input, items } = await fixture()
    const browser = deferred<{ type: string; url: string }>(), started = deferred<void>()
    let current = true
    input.isCurrent = () => current
    input.openSession.mockImplementationOnce(async () => { started.resolve(); return await browser.promise })
    const operation = runNativeIdn(input)
    await started.promise
    current = false
    await input.vault.clear()
    browser.resolve({ type: "success", url: CALLBACK })
    expect(await operation).toBe(false)
    expect(items.size).toBe(0)
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it("cannot capture an exchange response arriving after the sign-out fence", async () => {
    const exchange = deferred<Response>(), started = deferred<void>(), normal = transport()
    vi.stubGlobal("fetch", vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      if (String(url).includes("/native-idn/exchange")) { started.resolve(); return await exchange.promise }
      return await normal(url, init)
    }))
    const { input, items } = await fixture()
    const operation = runNativeIdn(input)
    await started.promise
    await input.vault.clear()
    exchange.resolve(reply({ user: USER, session: session() }, TOKEN))
    expect(await operation).toBe(false)
    expect(items.size).toBe(0)
  })

  it("does not adopt a fresh response from an earlier vault generation", async () => {
    const fresh = deferred<Response>(), started = deferred<void>(), normal = transport()
    vi.stubGlobal("fetch", vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      if (String(url).includes("/get-session")) { started.resolve(); return await fresh.promise }
      return await normal(url, init)
    }))
    const { input } = await fixture()
    const operation = runNativeIdn(input)
    await started.promise
    input.vault.fence()
    fresh.resolve(reply({ user: USER, session: session() }))
    expect(await operation).toBe(false)
  })

  it("waits for foreground before arming capture", async () => {
    const { input } = await fixture()
    const browserReturned = deferred<void>(), begin = vi.spyOn(input.vault, "beginLogin")
    let foreground = false
    input.isForeground = () => foreground
    input.openSession.mockImplementationOnce(async () => { browserReturned.resolve(); return { type: "success", url: CALLBACK } })
    const operation = runNativeIdn(input)
    await browserReturned.promise
    await vi.advanceTimersByTimeAsync(25)
    expect(begin).not.toHaveBeenCalled()
    foreground = true
    await vi.advanceTimersByTimeAsync(25)
    expect(await operation).toBe(true)
  })

  it("bounds the foreground wait at five seconds without capture", async () => {
    const { input } = await fixture()
    const browserReturned = deferred<void>(), begin = vi.spyOn(input.vault, "beginLogin")
    input.isForeground = () => false
    input.openSession.mockImplementationOnce(async () => { browserReturned.resolve(); return { type: "success", url: CALLBACK } })
    const operation = runNativeIdn(input)
    const failure = expect(operation).rejects.toThrow("nativeIdnForegroundRequired")
    await browserReturned.promise
    await vi.advanceTimersByTimeAsync(5_000)
    await failure
    expect(begin).not.toHaveBeenCalled()
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it("rejects an exchanged user/session mismatch", async () => {
    vi.stubGlobal("fetch", transport({ exchange: { user: USER, session: session({ userId: "another-user" }) } }))
    const { input } = await fixture()
    await expect(runNativeIdn(input)).rejects.toThrow("nativeIdnExchangeInvalid")
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it.each(["session", "user", "expired"])("requires a correlated fresh session: %s", async mismatch => {
    vi.stubGlobal("fetch", transport({ fresh: { user: mismatch === "user" ? { ...USER, id: "another-user" } : USER, session: session(mismatch === "session" ? { id: "another-session" } : mismatch === "expired" ? { expiresAt: new Date(Date.now() - 1).toISOString() } : {}) } }))
    const { input } = await fixture()
    await expect(runNativeIdn(input)).rejects.toThrow("nativeIdnSessionMismatch")
  })

  it("rejects a successful exchange with no set-auth-token header", async () => {
    vi.stubGlobal("fetch", transport({ token: null }))
    const { input, items } = await fixture()
    await expect(runNativeIdn(input)).rejects.toThrow("nativeAuthCredentialMissing")
    expect(input.vault.hasCredential).toBe(false)
    expect(items.size).toBe(0)
  })
})
