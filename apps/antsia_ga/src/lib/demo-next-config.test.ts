import { afterEach, describe, expect, it, vi } from "vitest"
import { DEMO_BACKEND_HOST } from "./demo-backend"

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules() })

async function configuration(backend: string | undefined, basePath = "") {
  vi.stubEnv("NODE_ENV", "production")
  vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", backend)
  vi.stubEnv("NEXT_PUBLIC_APP_BASE_PATH", basePath)
  // Les anciens réglages d'iframe ne doivent plus ouvrir aucune origine.
  vi.stubEnv("NEXT_PUBLIC_DEMO_EMBED_ORIGIN", "https://old-demo.example.test")
  vi.stubEnv("NEXT_PUBLIC_DEMO_PARENT_ORIGIN", "https://old-parent.example.test")
  vi.resetModules()
  const { default: config } = await import("../../next.config")
  const headers = (await config.headers?.())?.[0]?.headers ?? []
  return { config, headers }
}

function expectNoEmbedding(headers: Array<{ key: string; value: string }>) {
  expect(headers).toContainEqual({ key: "X-Frame-Options", value: "DENY" })
  const csp = headers.find(({ key }) => key === "Content-Security-Policy")?.value
  expect(csp).toContain("frame-ancestors 'none'")
  expect(csp).not.toContain("frame-src ")
  expect(csp).not.toContain("old-demo.example.test")
  expect(csp).not.toContain("old-parent.example.test")
}

describe("configuration du build démo par chemin", () => {
  it("la zone relayée reçoit sa CSP propre et le reste du site garde ses en-têtes", async () => {
    vi.stubEnv("ANTSIA_DEMO_RUNTIME_ORIGIN", "https://runtime-fixture.vercel.app")
    const { config, headers } = await configuration("https://exemple-production.convex.cloud")
    expectNoEmbedding(headers)
    const source = (await config.headers())[0]!.source
    const pattern = new RegExp(`^${source}$`)
    for (const path of ["/", "/fil", "/entrer", "/democratic"]) expect(pattern.test(path)).toBe(true)
    for (const path of ["/demo", "/demo/fil", "/demo/_next/static/main.js"]) expect(pattern.test(path)).toBe(false)
  })
  it.each(["http://127.0.0.1:3210", "http://localhost:3210", "https://exemple-production.convex.cloud"])("le site local ou principal garde sa racine et refuse l'embarquement : %s", async (backend) => {
    const { config, headers } = await configuration(backend)
    expect(config.basePath).toBe("")
    expectNoEmbedding(headers)
  })

  it("le double accord exact déclare /demo sans ouvrir les iframes", async () => {
    const { config, headers } = await configuration(`https://${DEMO_BACKEND_HOST}`, "/demo")
    expect(config.basePath).toBe("/demo")
    expectNoEmbedding(headers)
  })

  it("le backend démo seul ne déclare pas de basePath", async () => {
    const { config, headers } = await configuration(`https://${DEMO_BACKEND_HOST}`)
    expect(config.basePath).toBe("")
    expectNoEmbedding(headers)
  })

  it.each([
    undefined, "", "http://localhost:3210", "https://exemple-production.convex.cloud",
    `https://${DEMO_BACKEND_HOST}/`, `https://${DEMO_BACKEND_HOST}:443`,
    `https://${DEMO_BACKEND_HOST}:8443`, `https://${DEMO_BACKEND_HOST}/path`,
    `https://${DEMO_BACKEND_HOST}?demo=1`, `https://${DEMO_BACKEND_HOST}#demo`,
    `https://${DEMO_BACKEND_HOST}.evil.test`, `https://${DEMO_BACKEND_HOST}@evil.test`,
    ` https://${DEMO_BACKEND_HOST}`,
  ])("refuse une cible absente, locale, réelle ou déguisée malgré /demo : %s", async (backend) => {
    const { config, headers } = await configuration(backend, "/demo")
    expect(config.basePath).toBe("")
    expectNoEmbedding(headers)
  })

  it.each(["/", "demo", "/demo/", "/Demo", " /demo", "/demo?mode=1", "/demo/../"])("refuse un chemin enfant non exact : %j", async (path) => {
    const { config, headers } = await configuration(`https://${DEMO_BACKEND_HOST}`, path)
    expect(config.basePath).toBe("")
    expectNoEmbedding(headers)
  })
})
