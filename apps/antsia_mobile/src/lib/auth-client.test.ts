/** P17b : vrai client SDK, transport simulé ; scénarios écrits, non exécutés. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { buildNativeAuthClient } from "./auth-client"
import { createNativeCredentialVault, nativeCredentialKey, type NativeCredentialStorage } from "./secure-storage"

vi.mock("expo-secure-store", () => ({ WHEN_UNLOCKED_THIS_DEVICE_ONLY: 7, getItemAsync: vi.fn(), setItemAsync: vi.fn(), deleteItemAsync: vi.fn() }))

const SERVER = "https://antsia-backend.example.test"
const TOKEN = "header-issued-session.signed-proof"
const USER = { id: "authenticated-user", name: "Alias", email: "alias@example.test", emailVerified: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
function reply(token?: string, body: unknown = { user: USER, token: "BODY_TOKEN_IS_NEVER_PERSISTED" }, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...(token ? { "set-auth-token": token } : {}) } })
}
function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}
async function fixture(token?: string) {
  const items = new Map<string, string>()
  if (token) items.set(nativeCredentialKey(SERVER), token)
  const storage: NativeCredentialStorage = { getItem: async key => items.get(key) ?? null, setItem: async (key, value) => { items.set(key, value) }, removeItem: async key => { items.delete(key) } }
  const vault = createNativeCredentialVault(SERVER, storage)
  await vault.readToken()
  return { items, vault, client: buildNativeAuthClient(SERVER, vault) }
}

beforeEach(() => { vi.useFakeTimers(); vi.stubGlobal("fetch", vi.fn(async () => reply())) })
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe("P17b — bearer OTP natif", () => {
  it("capture le bearer du seul échange natif armé et ignore celui du départ OAuth", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => reply(TOKEN, { user: USER, session: { id: "native-session", userId: USER.id } })))
    const { vault, client, items } = await fixture()
    await client.signIn.oauth2({ providerId: "idn", disableRedirect: true, callbackURL: `${SERVER}/api/auth/native/return` })
    expect(items.size).toBe(0)
    await expect(client.$fetch("/native-idn/exchange", { method: "POST", body: { code: "C".repeat(43), verifier: "V".repeat(43) } })).rejects.toThrow("nativeAuthLoginRequired")
    vault.beginLogin()
    await client.$fetch("/native-idn/exchange", { method: "POST", body: { code: "C".repeat(43), verifier: "V".repeat(43) } })
    expect(await vault.readToken()).toBe(TOKEN)
    expect([...items.values()]).toEqual([TOKEN])
  })

  it("persiste uniquement set-auth-token après une vérification e-mail réussie et authentifiante", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => reply(TOKEN)))
    const { vault, client, items } = await fixture()
    vault.beginLogin()
    await client.signIn.emailOtp({ email: "alias@example.test", otp: "123456" })
    expect(await vault.readToken()).toBe(TOKEN)
    expect([...items.values()]).toEqual([TOKEN])
    expect(vault.loginGeneration()).toBeNull()
  })

  it("applique le même protocole à la vérification SMS, sans client OAuth ni greffon Expo", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => reply(TOKEN, { status: true, user: USER, token: "body-token" })))
    const { vault, client } = await fixture()
    vault.beginLogin()
    await client.phoneNumber.verify({ phoneNumber: "+241077000000", code: "123456" })
    expect(await vault.readToken()).toBe(TOKEN)
  })

  it("omet le jar de cookies et écrase toute autorisation injectée avec la seule preuve du coffre", async () => {
    const requests: RequestInit[] = []
    vi.stubGlobal("fetch", vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => { requests.push(init ?? {}); return reply(undefined, null) }))
    const { client } = await fixture(TOKEN)
    await client.getSession({ query: { disableCookieCache: true }, fetchOptions: { credentials: "include", headers: { Cookie: "foreign-cookie", "Better-Auth-Cookie": "foreign-cross-domain-cookie", Authorization: "Bearer injected-token" } } })
    expect(requests).toHaveLength(1)
    const request = requests[0]!, headers = new Headers(request.headers)
    expect(request.credentials).toBe("omit")
    expect(request.redirect).toBe("error")
    expect(headers.has("cookie")).toBe(false); expect(headers.has("better-auth-cookie")).toBe(false)
    expect(headers.get("authorization")).toBe(`Bearer ${TOKEN}`)
  })

  it("l'envoi de code, getSession et convex.token ne peuvent persister un header de session", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => reply("other-response-token.signature", { token: "convex-jwt-memory-only", user: USER })))
    const { vault, client } = await fixture(TOKEN)
    vault.beginLogin()
    await client.emailOtp.sendVerificationOtp({ email: "alias@example.test", type: "sign-in" })
    await client.getSession({ query: { disableCookieCache: true } })
    await client.convex.token()
    expect(await vault.readToken()).toBe(TOKEN)
  })

  it("ignore une réponse OTP ancienne arrivée après purge", async () => {
    const started = deferred<void>(), response = deferred<Response>()
    vi.stubGlobal("fetch", vi.fn(async () => { started.resolve(); return await response.promise }))
    const { vault, client, items } = await fixture()
    vault.beginLogin()
    const login = client.signIn.emailOtp({ email: "alias@example.test", otp: "123456" })
    await started.promise
    await vault.clear()
    response.resolve(reply(TOKEN))
    await login
    expect(vault.hasCredential).toBe(false)
    expect(items.size).toBe(0)
  })

  it("une réponse 401 ne capture jamais son header bearer", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => reply(TOKEN, { message: "Rejected", code: "INVALID_OTP" }, 401)))
    const { vault, client, items } = await fixture()
    vault.beginLogin()
    await client.signIn.emailOtp({ email: "alias@example.test", otp: "123456" })
    expect(items.size).toBe(0)
    expect(vault.hasCredential).toBe(false)
  })

  it("un succès sans header ne reconstruit pas la preuve depuis token du JSON", async () => {
    const { vault, client, items } = await fixture()
    vault.beginLogin()
    await expect(client.signIn.emailOtp({ email: "alias@example.test", otp: "123456" })).rejects.toThrow("nativeAuthCredentialMissing")
    expect(items.size).toBe(0)
    expect(await vault.readToken()).toBeNull()
  })

  it("refuse une vérification sans geste de connexion et tout changement de destination", async () => {
    const { vault, client } = await fixture(TOKEN)
    await expect(client.signIn.emailOtp({ email: "alias@example.test", otp: "123456" })).rejects.toThrow("nativeAuthLoginRequired")
    await expect(client.getSession({ fetchOptions: { baseURL: "https://foreign-backend.example.test/api/auth" } })).rejects.toThrow("nativeAuthDestinationInvalid")
    expect(() => buildNativeAuthClient("https://foreign-backend.example.test", vault)).toThrow("nativeAuthConfigurationInvalid")
    expect(vi.mocked(fetch)).not.toHaveBeenCalled()
  })
})
