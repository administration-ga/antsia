import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const state = vi.hoisted(() => ({ created: vi.fn() }))

// Observer la configuration sans remplacer le SDK ni ses véritables actions de stockage.
vi.mock("better-auth/react", async (importOriginal) => {
  const auth = await importOriginal<typeof import("better-auth/react")>()
  return {
    ...auth,
    createAuthClient: (options: Parameters<typeof auth.createAuthClient>[0]) => {
      state.created(options)
      return auth.createAuthClient(options)
    },
  }
})

import { createEngineAuthClient } from "./auth-client"
import { CROSS_DOMAIN_COOKIE_KEY, CROSS_DOMAIN_SESSION_DATA_KEY, type CrossDomainStorage } from "./cross-domain-session-bootstrap"

function storage(value: string): CrossDomainStorage {
  const map = new Map([[CROSS_DOMAIN_COOKIE_KEY, JSON.stringify({ "better-auth.session_token": { value, expires: null } })], [CROSS_DOMAIN_SESSION_DATA_KEY, JSON.stringify({ session: { id: value } })]])
  return { getItem: (key) => map.get(key) ?? null, setItem: (key, next) => { map.set(key, next) } }
}

beforeEach(() => {
  state.created.mockClear()
  vi.stubGlobal("window", { location: { origin: "https://network.example.test" } })
  vi.stubGlobal("localStorage", storage("real-session"))
})
afterEach(() => vi.unstubAllGlobals())

describe("fabrique du client d'authentification", () => {
  it("conserve le stockage global et le chemin par défaut sans options", () => {
    const client = createEngineAuthClient()
    expect(client.getCookie()).toBe("better-auth.session_token=real-session")
    expect(state.created).toHaveBeenCalledWith(expect.objectContaining({ baseURL: "https://network.example.test" }))
    expect(state.created.mock.calls[0]?.[0]).not.toHaveProperty("basePath")
  })

  it("transmet le chemin explicite au SDK et isole ses vraies lectures de session", () => {
    const view = storage("demo-session")
    const client = createEngineAuthClient({ basePath: "/demo/api/auth", storage: view })
    expect(state.created).toHaveBeenCalledWith(expect.objectContaining({ baseURL: "https://network.example.test", basePath: "/demo/api/auth" }))
    expect(client.getCookie()).toBe("better-auth.session_token=demo-session")
    expect(client.getSessionData()).toEqual({ session: { id: "demo-session" } })
    expect(createEngineAuthClient().getCookie()).toBe("better-auth.session_token=real-session")
  })

  it("ne choisit pas de chemin alternatif quand seule une vue de stockage est fournie", () => {
    const client = createEngineAuthClient({ storage: storage("scoped-session") })
    expect(client.getCookie()).toBe("better-auth.session_token=scoped-session")
    expect(state.created.mock.calls[0]?.[0]).not.toHaveProperty("basePath")
  })
})
