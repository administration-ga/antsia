// @vitest-environment jsdom
import { act, StrictMode } from "react"
import { createRoot, type Root } from "react-dom/client"
import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  pathname: "/decouvrir",
  cookie: "better-auth.session_token=abcdefghijklmnopqrstuv.signature1234567890",
  generation: "current-generation",
  signingOut: false,
  token: vi.fn<(options: { fetchOptions: { throw: boolean; signal: AbortSignal } }) => Promise<{ data: { token: string }; error: null }>>(),
  query: vi.fn(),
  construct: vi.fn<(...args: ConstructorParameters<typeof import("convex/browser").ConvexHttpClient>) => void>(),
  setAuth: vi.fn(),
  clearAuth: vi.fn(),
  setTheme: vi.fn(),
}))
vi.mock("@antsia/api/sign-out-everywhere", () => ({ isSigningOutEverywhere: () => mocks.signingOut }))
vi.mock("@antsia/social-features/shell/appearance", () => ({ useOptionalAppearance: () => ({ setTheme: mocks.setTheme }) }))
vi.mock("@convex/_generated/api", () => ({ api: { modules: { people: { persons: { getMyPerson: "my-private-person" } } } } }))
vi.mock("convex/browser", () => ({ ConvexHttpClient: class {
  constructor(...args: ConstructorParameters<typeof import("convex/browser").ConvexHttpClient>) { mocks.construct(...args) }
  setAuth = mocks.setAuth
  clearAuth = mocks.clearAuth
  query = mocks.query
} }))
vi.mock("next/navigation", () => ({ usePathname: () => mocks.pathname }))
vi.mock("@/lib/auth-client", () => ({ authClient: { getCookie: () => mocks.cookie, convex: { token: mocks.token } } }))
vi.mock("@/lib/session-bridge-client", () => ({ currentSessionBridgeGeneration: () => mocks.generation }))

import { PublicAccountTheme } from "./public-account-theme"

let root: Root | undefined
let host: HTMLDivElement

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
  vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", "https://private-test.convex.cloud")
  mocks.pathname = "/decouvrir"
  mocks.cookie = "better-auth.session_token=abcdefghijklmnopqrstuv.signature1234567890"
  mocks.generation = "current-generation"
  mocks.signingOut = false
  mocks.token.mockReset().mockResolvedValue({ data: { token: "private-jwt" }, error: null })
  mocks.query.mockReset().mockResolvedValue({ theme: "sable", displayName: "never rendered" })
  mocks.setAuth.mockReset()
  mocks.construct.mockReset()
  mocks.clearAuth.mockReset()
  mocks.setTheme.mockReset()
  host = document.createElement("div")
  root = createRoot(host)
})

afterEach(async () => {
  await act(async () => root?.unmount())
  root = undefined
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe("îlot de thème des pages publiques", () => {
  it("ne rend aucune donnée privée au serveur et ne démarre aucune session SSR", () => {
    expect(renderToStaticMarkup(<PublicAccountTheme enabled />)).toBe("")
    expect(mocks.token).not.toHaveBeenCalled()
    expect(mocks.query).not.toHaveBeenCalled()
  })

  it("relit le thème du SDK courant avec une seule lecture au rejeu StrictMode", async () => {
    await act(async () => root!.render(<StrictMode><PublicAccountTheme enabled /></StrictMode>))
    expect(mocks.token).toHaveBeenCalledOnce()
    expect(mocks.setAuth).toHaveBeenCalledExactlyOnceWith("private-jwt")
    expect(mocks.construct).toHaveBeenCalledExactlyOnceWith("https://private-test.convex.cloud", { fetch: expect.any(Function) })
    expect(mocks.clearAuth).toHaveBeenCalledOnce()
    expect(mocks.query).toHaveBeenCalledExactlyOnceWith("my-private-person", {})
    expect(mocks.setTheme).toHaveBeenCalledExactlyOnceWith("sable")
    expect(host.innerHTML).toBe("")
  })

  it("les refus, handoffs et états indisponibles désactivent entièrement l'îlot", async () => {
    await act(async () => root!.render(<PublicAccountTheme enabled={false} />))
    expect(mocks.token).not.toHaveBeenCalled()
    expect(mocks.query).not.toHaveBeenCalled()
  })

  it("une nouvelle route relit la préférence et ignore la réponse de la route précédente", async () => {
    let previous: (value: { theme: string }) => void = () => undefined
    mocks.query.mockImplementationOnce(() => new Promise((resolve) => { previous = resolve }))
    await act(async () => root!.render(<PublicAccountTheme enabled />))
    mocks.pathname = "/a-propos"
    mocks.query.mockResolvedValue({ theme: "corail" })
    await act(async () => root!.render(<PublicAccountTheme enabled />))
    expect(mocks.setTheme).toHaveBeenCalledExactlyOnceWith("corail")
    await act(async () => previous({ theme: "sable" }))
    expect(mocks.setTheme).toHaveBeenCalledExactlyOnceWith("corail")
  })

  it("démonter l'îlot à l'entrée membre ferme sa réponse tardive", async () => {
    let finish: (value: { theme: string }) => void = () => undefined
    mocks.query.mockImplementation(() => new Promise((resolve) => { finish = resolve }))
    await act(async () => root!.render(<PublicAccountTheme enabled />))
    await act(async () => root!.render(<p>member page</p>))
    await act(async () => finish({ theme: "sable" }))
    expect(mocks.setTheme).not.toHaveBeenCalled()
    expect(host.textContent).toBe("member page")
  })

  it("l'adaptateur public conserve la requête Convex, force no-store et abandonne le transport au démontage", async () => {
    const ignoredSignal = new AbortController().signal
    const init: RequestInit = { method: "POST", headers: { Authorization: "Bearer private-jwt", "Content-Type": "application/json" }, body: "{}", redirect: "error", credentials: "omit", cache: "force-cache", signal: ignoredSignal }
    const network = vi.fn<typeof fetch>().mockImplementation((_input, request) => new Promise((_resolve, reject) => {
      request?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true })
    }))
    vi.stubGlobal("fetch", network)
    mocks.query.mockImplementationOnce(async () => {
      const adapter = mocks.construct.mock.calls.at(-1)?.[1]?.fetch
      if (!adapter) throw new Error("missing public fetch adapter")
      await adapter("https://private-test.convex.cloud/api/query", init)
      return { theme: "sable" }
    })
    await act(async () => root!.render(<PublicAccountTheme enabled />))
    const signal = mocks.token.mock.calls[0]?.[0].fetchOptions.signal
    expect(signal?.aborted).toBe(false)
    expect(signal).not.toBe(ignoredSignal)
    expect(network).toHaveBeenCalledExactlyOnceWith("https://private-test.convex.cloud/api/query", { ...init, cache: "no-store", signal })
    await act(async () => root!.render(<p>member page</p>))
    expect(signal?.aborted).toBe(true)
    expect(mocks.clearAuth).toHaveBeenCalledOnce()
    expect(mocks.setTheme).not.toHaveBeenCalled()
  })

  it("le build /demo conserve une URL Convex absolue sans préfixer le transport du thème", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_BASE_PATH", "/demo")
    vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", "https://vivid-hedgehog-655.convex.cloud")
    const network = vi.fn<typeof fetch>().mockResolvedValue(new Response("{}"))
    vi.stubGlobal("fetch", network)
    mocks.query.mockImplementationOnce(async () => {
      const adapter = mocks.construct.mock.calls.at(-1)?.[1]?.fetch
      if (!adapter) throw new Error("missing public fetch adapter")
      await adapter("https://vivid-hedgehog-655.convex.cloud/api/query", { method: "POST" })
      return { theme: "sable" }
    })
    await act(async () => root!.render(<PublicAccountTheme enabled />))
    expect(mocks.construct).toHaveBeenCalledExactlyOnceWith("https://vivid-hedgehog-655.convex.cloud", { fetch: expect.any(Function) })
    expect(network).toHaveBeenCalledWith("https://vivid-hedgehog-655.convex.cloud/api/query", { method: "POST", cache: "no-store", signal: expect.any(AbortSignal) })
    expect(mocks.setTheme).toHaveBeenCalledExactlyOnceWith("sable")
  })
})
