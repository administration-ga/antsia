import type { EffectCallback, ReactNode, SetStateAction } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import type { ConvexReactClient } from "convex/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { CrossDomainStorage, RefreshableCrossDomainAuthClient, SessionBootstrapResult } from "./cross-domain-session-bootstrap"

type AnonymousAuth = {
  isLoading: boolean
  isAuthenticated: boolean
  fetchAccessToken: () => Promise<string | null>
}

const state = vi.hoisted(() => ({
  effects: [] as EffectCallback[],
  cells: [] as Array<{ value: unknown }>,
  index: 0,
  upstream: vi.fn(),
  anonymous: vi.fn(),
  authValues: [] as AnonymousAuth[],
  bootstrap: vi.fn<(...args: unknown[]) => Promise<SessionBootstrapResult>>(),
}))

// Rendu SSR des fournisseurs réellement choisis, avec effets retenus pour
// vérifier aussi le résultat du bootstrap client sans monter de navigateur.
vi.mock("react", async (importOriginal) => {
  const react = await importOriginal<typeof import("react")>()
  return {
    ...react,
    useEffect: (effect: EffectCallback) => { state.effects.push(effect) },
    useState: <T,>(initial: T | (() => T)) => {
      const index = state.index++
      const cell = state.cells[index] ??= { value: typeof initial === "function" ? (initial as () => T)() : initial }
      return [cell.value as T, (next: SetStateAction<T>) => {
        cell.value = typeof next === "function" ? (next as (previous: T) => T)(cell.value as T) : next
      }] as const
    },
  }
})
vi.mock("@convex-dev/better-auth/react", () => ({
  ConvexBetterAuthProvider: (props: { children: ReactNode }) => {
    state.upstream(props)
    return <div data-provider="better-auth">{props.children}</div>
  },
}))
vi.mock("convex/react", () => ({
  ConvexProviderWithAuth: (props: { children: ReactNode; useAuth: () => AnonymousAuth }) => {
    state.anonymous(props)
    state.authValues.push(props.useAuth())
    return <div data-provider="anonymous">{props.children}</div>
  },
}))
vi.mock("./cross-domain-session-bootstrap", async (importOriginal) => ({
  ...await importOriginal<typeof import("./cross-domain-session-bootstrap")>(),
  refreshCrossDomainSession: (...args: unknown[]) => state.bootstrap(...args),
}))

import { StableConvexBetterAuthProvider } from "./stable-convex-better-auth-provider"

const labels = { loading: "Vérification", failed: "Échec", retry: "Réessayer" }
let authClient: RefreshableCrossDomainAuthClient
let client: ConvexReactClient
const clearAuth = vi.fn()

function render(initialToken?: string | null, storage?: CrossDomainStorage): string {
  state.index = 0
  state.effects = []
  return renderToStaticMarkup(
    <StableConvexBetterAuthProvider client={client} authClient={authClient} initialToken={initialToken} labels={labels} storage={storage}>
      <div>Contenu de l'application</div>
    </StableConvexBetterAuthProvider>,
  )
}

async function runEffects(): Promise<void> {
  for (const effect of state.effects) effect()
  await Promise.resolve()
  await Promise.resolve()
}

beforeEach(() => {
  vi.clearAllMocks()
  state.cells = []
  state.effects = []
  state.authValues = []
  authClient = {
    getCookie: vi.fn(() => "cookie-HTTP-Y"),
    getSession: vi.fn(async () => ({ data: { session: { id: "Y" } } })),
    convex: { token: vi.fn(async () => ({ data: { token: "JWT-Y" } })) },
  }
  client = { clearAuth } as unknown as ConvexReactClient
  state.bootstrap.mockResolvedValue({ kind: "signed_out", token: null })
})
afterEach(() => vi.unstubAllGlobals())

describe("StableConvexBetterAuthProvider — fermeture anonyme", () => {
  it("transmet la vue de stockage au bootstrap et conserve l'unicité pour ce scope", async () => {
    const storage = { getItem: vi.fn(() => null), setItem: vi.fn() }
    render(undefined, storage)
    await runEffects()
    render(undefined, storage)
    await runEffects()
    expect(state.bootstrap).toHaveBeenCalledExactlyOnceWith(authClient, { oneTimeToken: null, storage })
  })

  it("ne réutilise pas le bootstrap d'une autre vue pour le même client", async () => {
    const first = { getItem: vi.fn(() => null), setItem: vi.fn() }
    const second = { getItem: vi.fn(() => null), setItem: vi.fn() }
    state.bootstrap.mockResolvedValueOnce({ kind: "ready", token: "JWT-first" }).mockResolvedValueOnce({ kind: "signed_out", token: null })
    render(undefined, first)
    await runEffects()
    render(undefined, second)
    await runEffects()
    expect(state.bootstrap).toHaveBeenCalledTimes(2)
    expect(state.bootstrap).toHaveBeenNthCalledWith(2, authClient, { oneTimeToken: null, storage: second })
    expect(render(undefined, second)).toContain('data-provider="anonymous"')
  })

  it("un initialToken:null monte immédiatement le fournisseur anonyme, même avec un cookie résiduel", async () => {
    const html = render(null)
    expect(html).toContain('data-provider="anonymous"')
    expect(html).toContain("Contenu de l&#x27;application")
    expect(state.upstream).not.toHaveBeenCalled()
    expect(state.authValues[0]).toMatchObject({ isLoading: false, isAuthenticated: false })
    expect(await state.authValues[0]!.fetchAccessToken()).toBeNull()
    expect(authClient.getCookie).not.toHaveBeenCalled()
    expect(authClient.getSession).not.toHaveBeenCalled()
    expect(authClient.convex.token).not.toHaveBeenCalled()
  })

  it("le hook anonyme et son état restent stables entre deux rendus", () => {
    render(null)
    const firstProps = state.anonymous.mock.calls[0]![0] as { useAuth: () => AnonymousAuth }
    render(null)
    const secondProps = state.anonymous.mock.calls[1]![0] as { useAuth: () => AnonymousAuth }
    expect(firstProps.useAuth).toBe(secondProps.useAuth)
    expect(state.authValues[0]).toBe(state.authValues[1])
    expect(state.upstream).not.toHaveBeenCalled()
  })

  it("un jeton initial prouvé conserve le fournisseur Better Auth", () => {
    expect(render("JWT-X")).toContain('data-provider="better-auth"')
    expect(state.upstream).toHaveBeenCalledWith(expect.objectContaining({ authClient, client, initialToken: "JWT-X" }))
    expect(state.anonymous).not.toHaveBeenCalled()
  })

  it("sans jeton initial, le rendu SSR reste en attente sans lire la session ni monter un fournisseur", () => {
    const html = render()
    expect(html).toContain('role="status"')
    expect(html).toContain(labels.loading)
    expect(state.upstream).not.toHaveBeenCalled()
    expect(state.anonymous).not.toHaveBeenCalled()
    expect(state.bootstrap).not.toHaveBeenCalled()
    expect(authClient.getSession).not.toHaveBeenCalled()
  })

  it("la conclusion signed_out nettoie Convex et monte uniquement le fournisseur anonyme", async () => {
    render()
    await runEffects()
    expect(render()).toContain('data-provider="anonymous"')
    expect(clearAuth).toHaveBeenCalledOnce()
    expect(state.upstream).not.toHaveBeenCalled()
    expect(state.authValues[0]).toMatchObject({ isLoading: false, isAuthenticated: false })
    expect(await state.authValues[0]!.fetchAccessToken()).toBeNull()
  })

  it("un bootstrap prouvé monte Better Auth avec le JWT de la personne adoptée", async () => {
    state.bootstrap.mockResolvedValue({ kind: "ready", token: "JWT-X" })
    render()
    await runEffects()
    expect(render()).toContain('data-provider="better-auth"')
    expect(state.upstream).toHaveBeenCalledWith(expect.objectContaining({ initialToken: "JWT-X", authClient }))
    expect(state.anonymous).not.toHaveBeenCalled()
    expect(clearAuth).not.toHaveBeenCalled()
  })
})
