// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { IdentityAuthClient } from "@antsia/social-features/identity"

const state = vi.hoisted(() => ({ signingOut: false, cookie: "", sessionData: null as Record<string, unknown> | null }))
vi.mock("@antsia/api/sign-out-everywhere", () => ({ isSigningOutEverywhere: () => state.signingOut }))
vi.mock("./auth-client", () => ({ authClient: { getCookie: () => state.cookie, getSessionData: () => state.sessionData } }))
import { clearLocalSessionForAnonymousBridge, currentSessionBridgeGeneration, fencedIdentityEntryClient, requestSessionBridge, resumeSessionBridge, rotateSessionBridgeFence, SESSION_BRIDGE_LOCK_WAIT_MS, withSessionBridgeLock } from "./session-bridge-client"
import { BRIDGE_CLIENT_TIMEOUT_MS, BRIDGE_TIMEOUT_MS } from "./session-bridge"

function originLocks() {
  let tail = Promise.resolve()
  return { request<T>(_name: string, options: LockOptions, work: () => T | PromiseLike<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const abort = () => reject(new DOMException("Lock request aborted", "AbortError"))
      if (options.signal?.aborted) { abort(); return }
      options.signal?.addEventListener("abort", abort, { once: true })
      const enter = async () => {
        options.signal?.removeEventListener("abort", abort)
        if (options.signal?.aborted) return
        try { resolve(await work()) } catch (error) { reject(error) }
      }
      tail = tail.then(enter, enter)
    })
  } }
}
beforeEach(() => {
  state.signingOut = false; state.cookie = ""; state.sessionData = null
  vi.stubGlobal("navigator", { locks: originLocks() })
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })
describe("fence avant entrée, client partagé intact", () => {
  it("attend la préparation HTTP initiale sans abandonner au délai du travail serveur", async () => {
    vi.useFakeTimers()
    const generation = rotateSessionBridgeFence()
    const pending = requestSessionBridge("DELETE", { generation, anonymous: false }, () => new Promise<Response>((resolve) => {
      setTimeout(() => resolve(new Response(null, { status: 204 })), BRIDGE_TIMEOUT_MS + 1_000)
    }))
    await vi.advanceTimersByTimeAsync(BRIDGE_TIMEOUT_MS + 1_001)
    expect(await pending).toBe(true)
  })
  it("un transport bloqué reste borné et une réponse tardive n'est jamais admise", async () => {
    vi.useFakeTimers()
    const generation = rotateSessionBridgeFence()
    let finish: (response: Response) => void = () => undefined
    const fetchImpl = vi.fn<typeof fetch>(() => new Promise<Response>((resolve) => { finish = resolve }))
    const pending = requestSessionBridge("POST", { generation, cookie: "sdk", jwt: "jwt" }, fetchImpl)
    await vi.advanceTimersByTimeAsync(BRIDGE_CLIENT_TIMEOUT_MS + 1)
    expect(await pending).toBe(false)
    expect(fetchImpl.mock.calls[0]?.[1]?.signal?.aborted).toBe(true)
    finish(new Response(null, { status: 204 }))
    expect(await pending).toBe(false)
  })
  it("ferme avant OTP/IDN/vérification SMS, y compris les refus, sans transformer les envois de code", async () => {
    const calls: string[] = []
    const original: IdentityAuthClient = { signIn: { oauth2: async () => { calls.push("idn"); return { error: true } }, emailOtp: async () => { calls.push("otp"); return { error: true } } }, emailOtp: { sendVerificationOtp: async () => { calls.push("send"); return {} } }, phoneNumber: { sendOtp: async () => ({}), verify: async () => { calls.push("sms"); return { error: true } } } }
    const sdkMethod = original.signIn.emailOtp
    const adapted = fencedIdentityEntryClient(original, () => { calls.push("fence"); return "generation" })
    await adapted.emailOtp.sendVerificationOtp({ email: "fiction@example.test", type: "sign-in" })
    await adapted.signIn.emailOtp({ email: "fiction@example.test", otp: "000000" })
    await adapted.signIn.oauth2({ providerId: "idn", callbackURL: "/bienvenue" })
    await adapted.phoneNumber.verify({ phoneNumber: "+2410000000", code: "000000", disableSession: false })
    expect(calls).toEqual(["send", "fence", "otp", "fence", "idn", "fence", "sms"])
    expect(original.signIn.emailOtp).toBe(sdkMethod)
  })
  it("une admission HTTP A retardée reste refusée après rotation B", async () => {
    const a = rotateSessionBridgeFence()
    let complete: (response: Response) => void = () => undefined
    const request = requestSessionBridge("POST", { generation: a, cookie: "sdk", jwt: "jwt" }, () => new Promise<Response>((resolve) => { complete = resolve }))
    const b = rotateSessionBridgeFence()
    complete(new Response(null, { status: 204 }))
    expect(await request).toBe(false)
    expect(currentSessionBridgeGeneration()).toBe(b)
  })
  it("la purge locale HTTP demeure bornée et une annulation externe arrête l'admission", async () => {
    vi.useFakeTimers()
    const generation = rotateSessionBridgeFence(), controller = new AbortController()
    const fetchImpl = vi.fn<typeof fetch>(() => new Promise<Response>(() => undefined))
    const pending = requestSessionBridge("POST", { generation, cookie: "sdk", jwt: "jwt" }, fetchImpl, controller.signal)
    controller.abort()
    expect(await pending).toBe(false)
    expect(fetchImpl.mock.calls[0]?.[1]?.credentials).toBe("same-origin")
  })

  it("deux acteurs d'origine sérialisent sortie, préflight et entrée sans changer la génération de la purge en cours", async () => {
    const order: string[] = []
    let release: () => void = () => undefined
    const logout = withSessionBridgeLock(async () => {
      const generation = rotateSessionBridgeFence()
      order.push("logout")
      await new Promise<void>((resolve) => { release = resolve })
      expect(currentSessionBridgeGeneration()).toBe(generation)
      expect(await requestSessionBridge("DELETE", { generation, anonymous: true }, async () => new Response(null, { status: 204 }))).toBe(true)
      order.push("navigate")
    })
    await Promise.resolve(); await Promise.resolve()
    const preflight = withSessionBridgeLock(async () => {
      order.push("preflight")
      const generation = rotateSessionBridgeFence()
      return requestSessionBridge("DELETE", { generation, anonymous: false }, async () => new Response(null, { status: 204 }))
    })
    const original: IdentityAuthClient = { signIn: { oauth2: async () => { order.push("entry"); return {} }, emailOtp: async () => ({}) }, emailOtp: { sendVerificationOtp: async () => ({}) }, phoneNumber: { sendOtp: async () => ({}), verify: async () => ({}) } }
    const entry = fencedIdentityEntryClient(original).signIn.oauth2({ providerId: "idn", callbackURL: "/bienvenue" })
    await Promise.resolve()
    expect(order).toEqual(["logout"])
    release()
    await logout
    expect(await preflight).toBe(true)
    await entry
    expect(order).toEqual(["logout", "navigate", "preflight", "entry"])
  })

  it("une absence ou un refus de Web Locks ne tourne aucune génération et ne démarre aucune entrée", async () => {
    const fence = vi.fn(() => "generation"), verify = vi.fn(async () => ({}))
    const client: IdentityAuthClient = { signIn: { oauth2: verify, emailOtp: verify }, emailOtp: { sendVerificationOtp: verify }, phoneNumber: { sendOtp: verify, verify } }
    for (const locks of [undefined, { request: async () => { throw new Error("denied") } }]) {
      vi.stubGlobal("navigator", { locks })
      await expect(fencedIdentityEntryClient(client, fence).signIn.emailOtp({ email: "fiction@example.test", otp: "000000" })).rejects.toThrow()
      await expect(resumeSessionBridge()).rejects.toThrow()
    }
    expect(fence).not.toHaveBeenCalled()
    expect(verify).not.toHaveBeenCalled()
  })

  it("borne l'attente du verrou sans exécuter tardivement le travail abandonné", async () => {
    vi.useFakeTimers()
    let release: () => void = () => undefined
    const holder = withSessionBridgeLock(() => new Promise<void>((resolve) => { release = resolve }))
    await Promise.resolve(); await Promise.resolve()
    const work = vi.fn()
    const waiting = withSessionBridgeLock(work).catch((error: unknown) => error)
    await vi.advanceTimersByTimeAsync(SESSION_BRIDGE_LOCK_WAIT_MS + 1)
    expect(await waiting).toBeInstanceOf(DOMException)
    release(); await holder
    await withSessionBridgeLock(() => undefined)
    expect(work).not.toHaveBeenCalled()
  })

  it("une entrée SDK muette reste bornée et libère le verrou", async () => {
    vi.useFakeTimers()
    let signal: AbortSignal | undefined
    const client: IdentityAuthClient = { signIn: { oauth2: async () => ({}), emailOtp: (args) => { signal = args.fetchOptions?.signal; return new Promise(() => undefined) } }, emailOtp: { sendVerificationOtp: async () => ({}) }, phoneNumber: { sendOtp: async () => ({}), verify: async () => ({}) } }
    const pending = fencedIdentityEntryClient(client).signIn.emailOtp({ email: "fiction@example.test", otp: "000000" }).catch((error: unknown) => error)
    await vi.advanceTimersByTimeAsync(10_001)
    expect(await pending).toBeInstanceOf(Error)
    expect(signal?.aborted).toBe(true)
    await expect(withSessionBridgeLock(() => "released")).resolves.toBe("released")
  })

  it("une ancienne branche anonyme n'efface pas un nouveau compte apparu dans le SDK", () => {
    state.cookie = "better-auth.session_token=abcdefghijklmnopqrstuv.signature1234567890="
    expect(clearLocalSessionForAnonymousBridge()).toBe(false)
    state.cookie = ""; state.sessionData = { session: { id: "new-session" } }
    expect(clearLocalSessionForAnonymousBridge()).toBe(false)
  })
})
