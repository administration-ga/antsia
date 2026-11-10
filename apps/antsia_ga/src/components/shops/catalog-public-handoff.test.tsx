// @vitest-environment jsdom
/** Composition catalogue → handoff existant → SDK réel, avec transport d'authentification fictif. */
import { createAppI18n } from "@antsia/social-features/i18n"
import { StableConvexBetterAuthProvider } from "@antsia/api/stable-convex-better-auth-provider"
import type { RefreshableCrossDomainAuthClient } from "@antsia/api/cross-domain-session-bootstrap"
import type { ConvexReactClient } from "convex/react"
import { act, type ReactNode } from "react"
import { createRoot, type Root } from "react-dom/client"
import { I18nextProvider } from "react-i18next"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { appResources } from "@/i18n/resources"

const mocks = vi.hoisted(() => ({ shop: vi.fn(), catalog: vi.fn(), refresh: vi.fn(), replace: vi.fn(), verify: vi.fn(), getSession: vi.fn(), token: vi.fn(), authenticated: false, clearAuth: vi.fn() }))
vi.mock("@/lib/public-shops-data", () => ({ loadPublicStorefront: mocks.shop }))
vi.mock("@/lib/public-catalog-data", () => ({ loadPublicCatalog: mocks.catalog }))
vi.mock("@/lib/server-session", () => ({ getPublicLocale: async () => "fr", configuredMetadataOrigin: () => "https://antsia.ga", getServerViewer: vi.fn(), withinBridgeDeadline: (work: () => Promise<unknown>) => work() }))
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("TEST_NOT_FOUND") }, useSearchParams: () => new URLSearchParams("ott=test"), useRouter: () => ({ refresh: mocks.refresh }) }))
vi.mock("@/components/public/public-shell", () => ({ PUBLIC_LINK: "public-link", PublicShell: ({ children }: { children: ReactNode }) => <main>{children}</main> }))
vi.mock("@/components/public/public-status", async () => {
  const { PublicHandoff } = await import("@/components/public/public-handoff")
  return { PublicStatus: ({ status }: { status: string }) => status === "handoff" ? <PublicHandoff /> : <p data-status={status}>{status}</p> }
})
vi.mock("@convex-dev/better-auth/react", () => ({ ConvexBetterAuthProvider: ({ children }: { children: ReactNode }) => { mocks.authenticated = true; return <div data-sdk="authenticated">{children}</div> } }))
vi.mock("convex/react", () => ({ ConvexProviderWithAuth: ({ children }: { children: ReactNode }) => { mocks.authenticated = false; return <div data-sdk="anonymous">{children}</div> }, useConvexAuth: () => ({ isAuthenticated: mocks.authenticated, isLoading: false }) }))
vi.mock("@/components/use-session-state", () => ({ useSessionState: () => ({ status: mocks.authenticated ? "member" : "signedOut" }) }))
vi.mock("@/components/providers", () => ({ SessionProviders: ({ children }: { children: ReactNode }) => <TestSessionProviders>{children}</TestSessionProviders> }))
import { PublicCatalogScreen } from "./catalog-public-route"

let authClient: RefreshableCrossDomainAuthClient, root: Root, container: HTMLDivElement
let storage: Pick<Storage, "getItem" | "setItem">
function TestSessionProviders({ children }: { children: ReactNode }) {
  return <StableConvexBetterAuthProvider authClient={authClient} client={{ clearAuth: mocks.clearAuth } as unknown as ConvexReactClient} storage={storage} labels={{ loading: "Vérification", failed: "Échec", retry: "Réessayer" }}>{children}</StableConvexBetterAuthProvider>
}
const proof = { session: { id: "session-X", userId: "person-X", token: "session-token-X" }, user: { id: "person-X" } }
const jwt = `e30.${btoa(JSON.stringify({ sessionId: "session-X", sub: "person-X" })).replace(/=/gu, "")}.signature`
async function render() {
  const element = await PublicCatalogScreen({ params: Promise.resolve({ handle: "atelier" }), searchParams: Promise.resolve({ ott: "valid-token", prixMin: "2500", tri: "price_desc" }) })
  await act(async () => { root.render(<I18nextProvider i18n={createAppI18n({ locale: "fr", appResources, defaultNS: "shops" })}>{element}</I18nextProvider>) })
}
beforeEach(() => {
  ;(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  vi.clearAllMocks(); mocks.authenticated = false
  const values = new Map<string, string>()
  storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value) } }
  vi.stubEnv("NEXT_PUBLIC_APP_BASE_PATH", "")
  window.history.replaceState({}, "", "/boutiques/atelier/catalogue?ott=valid-token&prixMin=2500&tri=price_desc")
  vi.stubGlobal("location", { ...window.location, replace: mocks.replace })
  mocks.shop.mockResolvedValue({ status: "handoff" })
  mocks.getSession.mockResolvedValue({ data: proof })
  mocks.token.mockResolvedValue({ data: { token: jwt } })
  authClient = { getCookie: () => "cookie-residuel", getSession: mocks.getSession, convex: { token: mocks.token }, crossDomain: { oneTimeToken: { verify: mocks.verify } } }
  container = document.createElement("div"); document.body.append(container); root = createRoot(container)
})
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); window.history.replaceState({}, "", "/") })

describe("MP05d — handoff du catalogue et retrait de l'OTT", () => {
  it("retire l'OTT avant sa vérification et laisse le handoff valide rejoindre le fil sans délai du catalogue", async () => {
    let finish: (value: unknown) => void = () => undefined
    mocks.verify.mockImplementation(() => new Promise(resolve => { finish = resolve }))
    await render()
    expect(mocks.shop).toHaveBeenCalledWith("atelier", true)
    expect(new URL(document.URL).searchParams.has("ott")).toBe(false)
    expect(new URL(document.URL).searchParams.get("prixMin")).toBe("2500")
    expect(mocks.verify).toHaveBeenCalledWith(expect.objectContaining({ token: "valid-token" }))
    expect(mocks.catalog).not.toHaveBeenCalled()
    expect(mocks.refresh).not.toHaveBeenCalled()
    expect(mocks.replace).not.toHaveBeenCalled()
    await act(async () => { finish({ data: proof }); await Promise.resolve() })
    expect(mocks.getSession).toHaveBeenCalledWith(expect.objectContaining({ fetchOptions: expect.objectContaining({ headers: { Authorization: "Bearer session-token-X" } }) }))
    expect(mocks.replace).toHaveBeenCalledExactlyOnceWith("/fil")
    expect(container.querySelector('[role="alert"]')).toBeNull()
    expect(mocks.refresh).not.toHaveBeenCalled()
  })
  it("un OTT rejeté ferme la session sans lire son cookie résiduel ni rendre le précédent catalogue", async () => {
    mocks.verify.mockResolvedValue({ error: { status: 401 } })
    await render()
    expect(new URL(document.URL).searchParams.has("ott")).toBe(false)
    expect(mocks.catalog).not.toHaveBeenCalled()
    expect(mocks.getSession).not.toHaveBeenCalled()
    expect(mocks.token).not.toHaveBeenCalled()
    expect(mocks.replace).not.toHaveBeenCalled()
    expect(container.querySelector('[role="alert"]')).not.toBeNull()
    expect(mocks.clearAuth).toHaveBeenCalledOnce()
    expect(container.querySelector("[data-offer-card]")).toBeNull()
  })
})
