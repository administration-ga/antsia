// @vitest-environment jsdom
import { act, StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ token: vi.fn(), cookie: vi.fn(), request: vi.fn(), fence: vi.fn(), lock: vi.fn(), signingOut: false, authenticated: true, anonymous: true, generation: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }))
vi.mock("convex/react", () => ({ useConvexAuth: () => ({ isAuthenticated: mocks.authenticated, isLoading: false }) }))
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock("@/lib/auth-client", () => ({ authClient: { getCookie: mocks.cookie, convex: { token: mocks.token } } }))
vi.mock("@/lib/session-bridge-client", () => ({ clearLocalSessionForAnonymousBridge: () => mocks.anonymous, currentSessionBridgeGeneration: () => mocks.generation, requestSessionBridge: mocks.request, rotateSessionBridgeFence: mocks.fence, withSessionBridgeLock: mocks.lock }))
vi.mock("@antsia/api/sign-out-everywhere", () => ({ isSigningOutEverywhere: () => mocks.signingOut }))
import { SessionBridge, SessionBridgePreflight } from "./session-bridge"
import { BRIDGE_CLIENT_TIMEOUT_MS, BRIDGE_TIMEOUT_MS } from "@/lib/session-bridge"

const sid = "abcdefghijklmnopqrstuv.signature1234567890="
const sessionCookie = `better-auth.session_token=${encodeURIComponent(sid)}`
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
  mocks.generation = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
  mocks.signingOut = false
  mocks.authenticated = true
  mocks.anonymous = true
  mocks.lock.mockImplementation(async (work: () => Promise<unknown>) => work())
  mocks.fence.mockReturnValue(mocks.generation)
  mocks.cookie.mockReturnValue(sessionCookie)
  mocks.request.mockResolvedValue(true)
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); mocks.token.mockReset(); mocks.cookie.mockReset(); mocks.request.mockReset(); mocks.fence.mockReset(); mocks.lock.mockReset() })
describe("préparation du pont pendant la sortie", () => {
  it("attend le verrou d'origine avant toute rotation ou purge", async () => {
    let acquire: () => void = () => undefined
    mocks.lock.mockImplementation((work: () => Promise<unknown>) => new Promise((resolve) => { acquire = () => resolve(work()) }))
    const host = document.createElement("div"), root = createRoot(host)
    try {
      await act(async () => { root.render(<SessionBridgePreflight><p>session-provider</p></SessionBridgePreflight>) })
      expect(mocks.fence).not.toHaveBeenCalled()
      expect(mocks.request).not.toHaveBeenCalled()
      await act(async () => { acquire() })
      expect(mocks.fence).toHaveBeenCalledOnce()
      expect(mocks.request).toHaveBeenCalledWith("DELETE", { generation: mocks.generation, anonymous: false })
      expect(host.textContent).toBe("session-provider")
    } finally { await act(async () => root.unmount()) }
  })

  it("un verrou indisponible reste fermé sans tourner ni purger de génération", async () => {
    mocks.lock.mockRejectedValue(new Error("denied"))
    const host = document.createElement("div"), root = createRoot(host)
    try {
      await act(async () => { root.render(<SessionBridgePreflight><p>session-provider</p></SessionBridgePreflight>) })
      expect(mocks.fence).not.toHaveBeenCalled()
      expect(mocks.request).not.toHaveBeenCalled()
      expect(host.textContent).toContain("session.unavailable")
    } finally { await act(async () => root.unmount()) }
  })

  it("un remontage ne remplace ni la génération ni la purge possédées par la sortie", async () => {
    mocks.signingOut = true
    const host = document.createElement("div"), root = createRoot(host)
    try {
      await act(async () => { root.render(<StrictMode><SessionBridgePreflight><p>session-provider</p></SessionBridgePreflight></StrictMode>) })
      expect(mocks.fence).not.toHaveBeenCalled()
      expect(mocks.request).not.toHaveBeenCalled()
      expect(host.textContent).toBe("session.preparing")
    } finally { await act(async () => root.unmount()) }
  })
  it("une préparation antérieure résolue pendant la sortie ne monte aucun fournisseur", async () => {
    let finish: (cleared: boolean) => void = () => undefined
    mocks.request.mockImplementation(() => new Promise<boolean>((resolve) => { finish = resolve }))
    const host = document.createElement("div"), root = createRoot(host)
    try {
      await act(async () => { root.render(<SessionBridgePreflight><p>session-provider</p></SessionBridgePreflight>) })
      mocks.signingOut = true
      await act(async () => { finish(true) })
      expect(host.textContent).toBe("session.preparing")
      expect(mocks.fence).toHaveBeenCalledTimes(1)
    } finally { await act(async () => root.unmount()) }
  })
})
describe("confirmation de session bornée", () => {
  it("relit la génération après acquisition du verrou et ne demande aucun jeton avant", async () => {
    let acquire: () => void = () => undefined
    mocks.lock.mockImplementation((work: () => Promise<unknown>) => new Promise((resolve) => { acquire = () => resolve(work()) }))
    mocks.token.mockResolvedValue({ data: { token: "jwt" } })
    const host = document.createElement("div"), root = createRoot(host)
    try {
      await act(async () => { root.render(<SessionBridge><p>private-content</p></SessionBridge>) })
      expect(mocks.token).not.toHaveBeenCalled()
      mocks.generation = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
      await act(async () => { acquire() })
      expect(mocks.request.mock.calls[0]?.[1]).toMatchObject({ generation: mocks.generation })
      expect(host.textContent).toBe("private-content")
    } finally { await act(async () => root.unmount()) }
  })

  it("une ancienne branche anonyme ne purge aucun nouveau compte apparu pendant l'attente", async () => {
    mocks.authenticated = false
    mocks.anonymous = false
    const host = document.createElement("div"), root = createRoot(host)
    try {
      await act(async () => { root.render(<SessionBridge><p>private-content</p></SessionBridge>) })
      expect(mocks.token).not.toHaveBeenCalled()
      expect(mocks.request).not.toHaveBeenCalled()
      expect(host.textContent).toContain("session.unavailable")
    } finally { await act(async () => root.unmount()) }
  })

  it("laisse le premier jeton finir de se préparer au-delà du délai de vérification serveur", async () => {
    vi.useFakeTimers()
    mocks.token.mockImplementation(() => new Promise((resolve) => {
      setTimeout(() => resolve({ data: { token: "verified-jwt" }, error: null }), BRIDGE_TIMEOUT_MS + 1_000)
    }))
    const host = document.createElement("div"), root = createRoot(host)
    try {
      await act(async () => { root.render(<SessionBridge><p>private-content</p></SessionBridge>) })
      await act(async () => { await vi.advanceTimersByTimeAsync(BRIDGE_TIMEOUT_MS + 1) })
      expect(host.textContent).toBe("session.confirming")
      expect(mocks.request).not.toHaveBeenCalled()
      await act(async () => { await vi.advanceTimersByTimeAsync(1_000) })
      expect(host.textContent).toBe("private-content")
      expect(mocks.request).toHaveBeenCalledTimes(1)
    } finally { await act(async () => root.unmount()) }
  })
  it("une génération remplacée pendant l'attente reste refusée sans admission", async () => {
    let finish: (value: { data: { token: string }; error: null }) => void = () => undefined
    mocks.token.mockImplementation(() => new Promise((resolve) => { finish = resolve }))
    const host = document.createElement("div"), root = createRoot(host)
    try {
      await act(async () => { root.render(<SessionBridge><p>private-content</p></SessionBridge>) })
      mocks.generation = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
      await act(async () => { finish({ data: { token: "verified-jwt" }, error: null }) })
      expect(host.textContent).toContain("session.unavailable")
      expect(host.textContent).not.toContain("private-content")
      expect(mocks.request).not.toHaveBeenCalled()
    } finally { await act(async () => root.unmount()) }
  })
  it("le rejeu des effets StrictMode ignore l'annulation initiale et confirme la session courante", async () => {
    mocks.token.mockImplementation(({ fetchOptions }: { fetchOptions: { signal: AbortSignal } }) => new Promise((resolve, reject) => {
      fetchOptions.signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true })
      queueMicrotask(() => resolve({ data: { token: "verified-jwt" }, error: null }))
    }))
    const host = document.createElement("div"), root = createRoot(host)
    try {
      await act(async () => { root.render(<StrictMode><SessionBridge><p>private-content</p></SessionBridge></StrictMode>) })
      expect(host.textContent).toBe("private-content")
      expect(mocks.request).toHaveBeenCalledTimes(1)
    } finally { await act(async () => root.unmount()) }
  })
  it("confirme la même session quand le renouvellement du JWT modifie un cookie auxiliaire", async () => {
    const before = `${sessionCookie}; better-auth.convex_jwt=expired`
    mocks.cookie.mockReturnValue(before)
    mocks.token.mockImplementation(async () => {
      mocks.cookie.mockReturnValue(`better-auth.convex_jwt=renewed; ${sessionCookie}`)
      return { data: { token: "verified-jwt" }, error: null }
    })
    const host = document.createElement("div"), root = createRoot(host)
    try {
      await act(async () => { root.render(<SessionBridge><p>private-content</p></SessionBridge>) })
      expect(mocks.request).toHaveBeenCalledWith("POST", { generation: mocks.generation, cookie: before, jwt: "verified-jwt" }, fetch, expect.any(AbortSignal))
      expect(host.textContent).toBe("private-content")
    } finally { await act(async () => root.unmount()) }
  })
  it.each([
    ["remplacée", "better-auth.session_token=anotherSessionValue12345.signature0987654321"],
    ["absente", "better-auth.convex_jwt=renewed"],
    ["ambiguë", `${sessionCookie}; ${sessionCookie}`],
    ["autre nom", `__Secure-${sessionCookie}`],
  ])("refuse une session %s pendant le renouvellement du JWT", async (_reason, changedCookie) => {
    mocks.token.mockImplementation(async () => {
      mocks.cookie.mockReturnValue(changedCookie)
      return { data: { token: "verified-jwt" }, error: null }
    })
    const host = document.createElement("div"), root = createRoot(host)
    try {
      await act(async () => { root.render(<SessionBridge><p>private-content</p></SessionBridge>) })
      expect(host.textContent).toContain("session.unavailable")
      expect(host.textContent).not.toContain("private-content")
      expect(mocks.request).not.toHaveBeenCalled()
    } finally { await act(async () => root.unmount()) }
  })
  it("un SDK de jeton bloqué rend une erreur réessayable, aucun contenu privé et aucune admission", async () => {
    vi.useFakeTimers()
    mocks.token.mockImplementation(() => new Promise(() => undefined))
    const host = document.createElement("div"), root = createRoot(host)
    await act(async () => { root.render(<SessionBridge><p>private-content</p></SessionBridge>) })
    expect(host.textContent).toContain("session.confirming")
    await act(async () => { await vi.advanceTimersByTimeAsync(BRIDGE_CLIENT_TIMEOUT_MS + 1) })
    expect(host.textContent).toContain("session.unavailable")
    expect(host.textContent).not.toContain("private-content")
    expect(mocks.request).not.toHaveBeenCalled()
    await act(async () => root.unmount())
  })
})
