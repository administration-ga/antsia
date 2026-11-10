import type { ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ engine: vi.fn(), preflight: vi.fn(), bridge: vi.fn(), query: vi.fn() }))
vi.mock("@antsia/api/hooks", () => ({ useStableConvexAuth: () => ({ isAuthenticated: false }) }))
vi.mock("@antsia/api/next-provider", () => ({ EngineConvexProvider: ({ children }: { children: ReactNode }) => { mocks.engine(); return children } }))
vi.mock("@antsia/api/viewer-preferences", () => ({ ViewerPreferencesProvider: ({ children }: { children: ReactNode }) => children }))
vi.mock("@antsia/social-features/shell/appearance", () => ({ AppearanceProvider: ({ children }: { children: ReactNode }) => children, useOptionalAppearance: () => null }))
vi.mock("@antsia/social-features/i18n/client", () => ({ I18nProvider: ({ children }: { children: ReactNode }) => children }))
vi.mock("@convex/_generated/api", () => ({ api: { modules: { people: { persons: { getMyPerson: "person", ensureMyPerson: "ensure" } }, platform: { authentication: { mySession: "session" } } } } }))
vi.mock("convex/react", () => ({ useQuery: mocks.query }))
vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key, i18n: { language: "fr", changeLanguage: vi.fn() } }) }))
vi.mock("@/lib/auth-client", () => ({ authClient: {} }))
vi.mock("./analytics-permission", () => ({ UsagePermissionProvider: ({ children }: { children: ReactNode }) => children }))
vi.mock("./demo-account-bootstrap", () => ({ DemoAccountBootstrap: () => null }))
vi.mock("./personal-theme", () => ({ PersonalTheme: ({ children }: { children: ReactNode }) => children }))
vi.mock("./session-bridge", () => ({
  SessionBridgePreflight: ({ children }: { children: ReactNode }) => { mocks.preflight(); return children },
  SessionBridge: ({ children }: { children: ReactNode }) => { mocks.bridge(); return children },
}))
vi.mock("./toast-region", () => ({ ToastRegion: () => null }))

let SessionProviders: typeof import("./providers").SessionProviders
beforeAll(async () => {
  vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", "https://private-test.convex.cloud")
  SessionProviders = (await import("./providers")).SessionProviders
})
beforeEach(() => { mocks.engine.mockClear(); mocks.preflight.mockClear(); mocks.bridge.mockClear(); mocks.query.mockReset() })
afterAll(() => { vi.unstubAllEnvs() })

describe("porte de session réutilisée par la carte d'entrée", () => {
  it("une carte imbriquée sous /entrer conserve une seule session, un seul pont et une seule lecture personnelle", () => {
    const html = renderToStaticMarkup(<SessionProviders><header>entry page</header><SessionProviders><p>sign-in card</p></SessionProviders></SessionProviders>)
    expect(html).toContain("entry page")
    expect(html).toContain("sign-in card")
    expect(mocks.engine).toHaveBeenCalledOnce()
    expect(mocks.preflight).toHaveBeenCalledOnce()
    expect(mocks.bridge).toHaveBeenCalledOnce()
    expect(mocks.query).toHaveBeenCalledOnce()
  })
})
