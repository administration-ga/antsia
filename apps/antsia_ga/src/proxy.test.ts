import { NextRequest } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { proxy } from "./proxy"

const proxyToken = "proxy-fixture-" + "a".repeat(32)
const hostingToken = "hosting-fixture-" + "b".repeat(32)
const runtimeOrigin = "https://antsia-runtime-fixture-20261021.vercel.app"

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_APP_BASE_PATH", "")
  vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", "https://diligent-avocet-585.convex.cloud")
  vi.stubEnv("ANTSIA_DEMO_PROXY_TOKEN", proxyToken)
  vi.stubEnv("ANTSIA_DEMO_HOSTING_BYPASS", hostingToken)
  vi.stubEnv("ANTSIA_DEMO_RUNTIME_ORIGIN", runtimeOrigin)
})
afterEach(() => vi.unstubAllEnvs())

function request(path: string, headers?: HeadersInit) {
  return new NextRequest(`https://antsia.example.test${path}`, { headers })
}
function expectNext(response: ReturnType<typeof proxy>) {
  expect(response.status).toBe(200)
  expect(response.headers.get("x-middleware-next")).toBe("1")
  expect(response.headers.has("x-middleware-rewrite")).toBe(false)
}
function expectSecretsServerOnly(response: ReturnType<typeof proxy>) {
  // Next encode les seuls en-têtes de requête aval dans ces champs internes.
  // Ils ne constituent pas des en-têtes de réponse applicatifs au navigateur.
  for (const [key, value] of response.headers) {
    if (key.startsWith("x-middleware-request-")) continue
    expect(value.includes(proxyToken) || value.includes(hostingToken)).toBe(false)
  }
  expect(response.headers.has("x-antsia-demo-proxy")).toBe(false)
  expect(response.headers.has("x-vercel-protection-bypass")).toBe(false)
  expect(response.headers.has("set-cookie")).toBe(false)
}

describe("relais /demo sur le site principal", () => {
  it.each(["/", "/entrer", "/fil", "/api/auth/session", "/democratic", "/demo-other", "/demography/a", "/_next/static/main.js"])("laisse le chemin principal intact : %s", path => {
    const response = proxy(request(path))
    expectNext(response)
    expectSecretsServerOnly(response)
    expect(response.headers.has("x-middleware-request-x-antsia-demo-proxy")).toBe(false)
  })

  it.each([
    "/demo", "/demo/", "/demo/fil?tab=relations&cursor=a%2Fb",
    "/demo/messages/a/membre.demo?from=profile",
    "/demo/_next/static/chunks/main.js?v=fixture", "/demo/_next/image?url=%2Fdemo%2Fimage.png&w=640&q=75",
  ])("préserve le préfixe, les assets et la query : %s", path => {
    const response = proxy(request(path))
    expect(response.status).toBe(200)
    expect(response.headers.get("x-middleware-rewrite")).toBe(`${runtimeOrigin}${path}`)
    expect(response.headers.has("x-middleware-next")).toBe(false)
    expect(response.headers.get("x-middleware-request-x-antsia-demo-proxy")).toBe(proxyToken)
    expect(response.headers.get("x-middleware-request-x-vercel-protection-bypass")).toBe(hostingToken)
    expectSecretsServerOnly(response)
  })

  it("transporte uniquement les reçus démo, remplace le secret client et conserve la requête originale", () => {
    const original = request("/demo/fil?tab=relations", {
      "x-antsia-demo-proxy": "forged-client-" + "c".repeat(32),
      "x-middleware-request-cookie": "forged-main-cookie",
      cookie: "better-auth.session_token=fictitious-real; __Host-antsia_demo_receipt=fictitious-demo; __Host-antsia_demo_generation=fictitious-generation",
    })
    const response = proxy(original)
    expect(response.headers.get("x-middleware-request-cookie")).toBe("__Host-antsia_demo_receipt=fictitious-demo; __Host-antsia_demo_generation=fictitious-generation")
    expect(response.headers.get("x-middleware-request-x-antsia-demo-proxy")).toBe(proxyToken)
    expect(response.headers.get("x-middleware-rewrite")).toBe(`${runtimeOrigin}/demo/fil?tab=relations`)
    expect(response.headers.get("x-middleware-override-headers")?.split(",")).toContain("x-antsia-demo-proxy")
    expect(original.headers.get("cookie")).toContain("fictitious-real")
    expect(original.headers.get("x-antsia-demo-proxy")).toContain("forged-client-")
    expectSecretsServerOnly(response)
  })

  it.each([
    ["ANTSIA_DEMO_PROXY_TOKEN", ""], ["ANTSIA_DEMO_PROXY_TOKEN", "short"],
    ["ANTSIA_DEMO_HOSTING_BYPASS", ""], ["ANTSIA_DEMO_HOSTING_BYPASS", "short"],
    ["ANTSIA_DEMO_RUNTIME_ORIGIN", ""], ["ANTSIA_DEMO_RUNTIME_ORIGIN", `${runtimeOrigin}/`],
    ["ANTSIA_DEMO_RUNTIME_ORIGIN", "https://untrusted.example.test"],
  ])("reste sur le site principal si la configuration du relais est fermée (%s)", (key, value) => {
    vi.stubEnv(key, value)
    const response = proxy(request("/demo/fil"))
    if (key === "ANTSIA_DEMO_RUNTIME_ORIGIN") expectNext(response)
    else {
      expect(response.status).toBe(503)
      expect(response.headers.get("content-security-policy")).toContain("default-src 'none'")
    }
    expectSecretsServerOnly(response)
  })
})

describe("admission du build enfant /demo", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_APP_BASE_PATH", "/demo")
    vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", "https://vivid-hedgehog-655.convex.cloud")
  })

  it.each(["/demo", "/demo/entrer", "/demo/_next/static/main.js"])("refuse un accès direct sans secret : %s", path => {
    const response = proxy(request(path))
    expect(response.status).toBe(403)
    expect(response.headers.has("x-middleware-next")).toBe(false)
    expect(response.headers.has("x-middleware-rewrite")).toBe(false)
    expectSecretsServerOnly(response)
  })

  it("refuse un secret client incorrect et n'accorde que le secret serveur attendu", () => {
    expect(proxy(request("/demo/fil", { "x-antsia-demo-proxy": "z".repeat(proxyToken.length) })).status).toBe(403)
    const response = proxy(request("/demo/fil?tab=relations", { "x-antsia-demo-proxy": proxyToken }))
    expectNext(response)
    expectSecretsServerOnly(response)
  })

  it("refuse aussi un secret entrant correct si le serveur n'en a pas", () => {
    vi.stubEnv("ANTSIA_DEMO_PROXY_TOKEN", "")
    const response = proxy(request("/demo/fil", { "x-antsia-demo-proxy": proxyToken }))
    expect(response.status).toBe(403)
    expectSecretsServerOnly(response)
  })
})
