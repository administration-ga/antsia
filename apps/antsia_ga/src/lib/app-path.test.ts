import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { DEMO_BACKEND_HOST } from "./demo-backend"

import { appBasePath, browserAppPath, logicalAppPath } from "./app-path"
import { routes } from "./routes"

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_APP_BASE_PATH", "/demo")
  vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", `https://${DEMO_BACKEND_HOST}`)
})
afterEach(() => { vi.unstubAllEnvs() })

describe("préfixe fermé du build démo", () => {
  it("exige le chemin déclaré et le backend démo canonique exacts", () => {
    expect(appBasePath()).toBe("/demo")
  })

  it.each([undefined, "", "/", "demo", "/demo/", "/Demo", " /demo", "/demo ", "/demo/../", "https://example.test/demo"])("refuse une déclaration de chemin différente : %s", (path) => {
    vi.stubEnv("NEXT_PUBLIC_APP_BASE_PATH", path)
    expect(appBasePath()).toBe("")
    expect(browserAppPath("/fil")).toBe("/fil")
  })

  it.each([
    undefined,
    "",
    "https://exemple-production.convex.cloud",
    "http://localhost:3210",
    `https://${DEMO_BACKEND_HOST}/`,
    `https://${DEMO_BACKEND_HOST}:443`,
    `https://${DEMO_BACKEND_HOST}:8443`,
    `https://${DEMO_BACKEND_HOST}/path`,
    `https://${DEMO_BACKEND_HOST}?key=1`,
    `https://${DEMO_BACKEND_HOST}#fragment`,
    `https://user:secret@${DEMO_BACKEND_HOST}`,
    `https://${DEMO_BACKEND_HOST}.evil.test`,
    ` https://${DEMO_BACKEND_HOST}`,
    `https://${DEMO_BACKEND_HOST}\n`,
    `http://${DEMO_BACKEND_HOST}`,
  ])("refuse un backend absent, normalisé ou étranger : %s", (backend) => {
    vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", backend)
    expect(appBasePath()).toBe("")
    expect(logicalAppPath("/demo/fil")).toBe("/demo/fil")
  })
})

describe("adresses navigateur et chemins logiques", () => {
  it.each([
    ["/", "/demo"],
    ["/fil", "/demo/fil"],
    ["/bienvenue?publication=post-1", "/demo/bienvenue?publication=post-1"],
    ["/notifications/ouvrir?notification=avis_1#contenu", "/demo/notifications/ouvrir?notification=avis_1#contenu"],
    ["/api/session-bridge", "/demo/api/session-bridge"],
    ["/demographie", "/demo/demographie"],
    ["/demo", "/demo"],
    ["/demo/", "/demo/"],
    ["/demo?publication=post-1", "/demo?publication=post-1"],
    ["/demo#contenu", "/demo#contenu"],
    ["/demo/messages/a/presse.demo", "/demo/messages/a/presse.demo"],
  ])("produit une adresse physique idempotente pour %s", (path, physical) => {
    expect(browserAppPath(path)).toBe(physical)
    expect(browserAppPath(physical)).toBe(physical)
  })

  it.each([
    ["/demo", "/"],
    ["/demo/", "/"],
    ["/demo?notification=avis_1", "/?notification=avis_1"],
    ["/demo#contenu", "/#contenu"],
    ["/demo/boutique/atelier.demo/contacter?offre=offer-1", "/boutique/atelier.demo/contacter?offre=offer-1"],
    ["/demo/messages/a/presse.demo", "/messages/a/presse.demo"],
    ["/demographie", "/demographie"],
    ["/fil", "/fil"],
  ])("retire uniquement la frontière /demo pour %s", (physical, logical) => {
    expect(logicalAppPath(physical)).toBe(logical)
  })

  it("laisse les builders Next et les chemins upstream Convex inchangés", () => {
    expect(routes.feed()).toBe("/fil")
    expect(routes.welcome("post-1")).toBe("/bienvenue?publication=post-1")
    expect(routes.authSession()).toBe("/api/auth/get-session")
    expect(routes.authToken()).toBe("/api/auth/convex/token")
    expect(routes.publicSessionBridge()).toBe("/api/session-bridge")
    expect(browserAppPath(routes.publicSessionBridge())).toBe("/demo/api/session-bridge")
  })

  it.each(["", "fil", "?next=fil", "#contenu", "https://example.test/fil", "//example.test/fil", "/\\example.test", "/fil\n", "/../fil", "/demo/../../fil", "/%2e%2e/fil"])("refuse une adresse qui pourrait sortir de la zone : %j", (path) => {
    expect(() => browserAppPath(path)).toThrow("invalidAppPath")
    expect(() => logicalAppPath(path)).toThrow("invalidAppPath")
  })
})
