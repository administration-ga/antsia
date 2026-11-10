import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { appBasePath } from "./app-path"
import { admittedDemoProxy, demoProxyHeaders, demoRuntimeOrigin } from "./demo-proxy"

// Toutes les valeurs sont fictives ; aucune requête réseau ni configuration réelle.
const proxyToken = "proxy-fixture-" + "a".repeat(32)
const hostingToken = "hosting-fixture-" + "b".repeat(32)
const runtimeOrigin = "https://antsia-runtime-fixture-20261021.vercel.app"
const demoBackend = "https://vivid-hedgehog-655.convex.cloud"

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_APP_BASE_PATH", "/demo")
  vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", demoBackend)
  vi.stubEnv("ANTSIA_DEMO_PROXY_TOKEN", proxyToken)
  vi.stubEnv("ANTSIA_DEMO_HOSTING_BYPASS", hostingToken)
  vi.stubEnv("ANTSIA_DEMO_RUNTIME_ORIGIN", runtimeOrigin)
})
afterEach(() => vi.unstubAllEnvs())

function request(token: string | undefined = proxyToken) {
  return new Request("https://antsia.example.test/demo/fil", { headers: token === undefined ? {} : { "x-antsia-demo-proxy": token } })
}

describe("admission du relais démo privé", () => {
  it("n'admet que le build /demo avec le backend cloud exact et son secret serveur", () => {
    expect(appBasePath()).toBe("/demo")
    expect(admittedDemoProxy(request())).toBe(true)
  })

  it.each([
    ["", demoBackend], ["/demo/", demoBackend], ["/democratic", demoBackend],
    ["/demo", "https://diligent-avocet-585.convex.cloud"],
    ["/demo", `${demoBackend}/`], ["/demo", `${demoBackend}:443`],
    ["/demo", "http://vivid-hedgehog-655.convex.cloud"],
    ["/demo", "https://vivid-hedgehog-655.convex.cloud.evil.test"],
    ["/demo", "https://user@vivid-hedgehog-655.convex.cloud"],
  ])("refuse une configuration de build non exacte (%s, %s)", (basePath, backend) => {
    vi.stubEnv("NEXT_PUBLIC_APP_BASE_PATH", basePath)
    vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", backend)
    expect(appBasePath()).toBe("")
    expect(admittedDemoProxy(request())).toBe(false)
  })

  it.each(["", "short"])("refuse l'absence de secret serveur ou un secret trop court (%s)", value => {
    vi.stubEnv("ANTSIA_DEMO_PROXY_TOKEN", value)
    expect(admittedDemoProxy(request())).toBe(false)
    expect(demoProxyHeaders(new Headers())).toBeNull()
  })

  it("refuse un secret entrant absent, incorrect ou de longueur différente", () => {
    expect(admittedDemoProxy(new Request("https://antsia.example.test/demo"))).toBe(false)
    expect(admittedDemoProxy(request("x".repeat(proxyToken.length)))).toBe(false)
    expect(admittedDemoProxy(request(`${proxyToken}x`))).toBe(false)
  })

  it("refuse un secret incorrect non ASCII sans lever une erreur de longueur UTF-8", () => {
    expect(admittedDemoProxy(request("é".repeat(proxyToken.length)))).toBe(false)
  })
})

describe("origine technique du relais démo", () => {
  it("retient une origine HTTPS Vercel canonique exacte", () => {
    expect(demoRuntimeOrigin()).toBe(runtimeOrigin)
  })

  it.each([
    "", "not-a-url", "http://antsia-runtime-fixture.vercel.app", `${runtimeOrigin}/`,
    `${runtimeOrigin}/demo`, `${runtimeOrigin}?token=fictitious`, `${runtimeOrigin}#fragment`,
    `${runtimeOrigin}:443`, `${runtimeOrigin}:444`, ` ${runtimeOrigin}`, `${runtimeOrigin} `,
    "https://ANTSIA-runtime-fixture.vercel.app", "https://user@antsia-runtime-fixture.vercel.app",
    "https://user:password@antsia-runtime-fixture.vercel.app", "https://*.vercel.app",
    "https://antsia-runtime-fixture.vercel.app.evil.test", "https://nested.runtime.vercel.app",
    "https://example.test", "https://localhost", "https://antsia_runtime.vercel.app",
  ])("rejette une origine élargie, non canonique ou étrangère : %s", value => {
    vi.stubEnv("ANTSIA_DEMO_RUNTIME_ORIGIN", value)
    expect(demoRuntimeOrigin()).toBeNull()
  })
})

describe("en-têtes remis exclusivement au serveur démo", () => {
  it("remplace tout secret entrant et retire les contrôles de relais injectés", () => {
    const incoming = new Headers({
      "x-antsia-demo-proxy": "client-forged-" + "c".repeat(32),
      "x-vercel-protection-bypass": "client-forged-" + "d".repeat(32),
      "x-vercel-protection-bypass-cookie": "unwanted",
      "x-middleware-request-cookie": "unwanted",
      "x-middleware-rewrite": "https://untrusted.example.test",
      accept: "text/html", "accept-language": "fr-FR",
    })
    const result = demoProxyHeaders(incoming)
    expect(result?.get("x-antsia-demo-proxy")).toBe(proxyToken)
    expect(result?.get("x-vercel-protection-bypass")).toBe(hostingToken)
    expect(result?.get("x-vercel-protection-bypass-cookie")).toBeNull()
    expect([...result!.keys()].some(key => key.startsWith("x-middleware-"))).toBe(false)
    expect(result?.get("accept")).toBe("text/html")
    expect(result?.get("accept-language")).toBe("fr-FR")
    expect(incoming.get("x-antsia-demo-proxy")).not.toBe(proxyToken)
  })

  it("ne conserve que les deux cookies __Host de démo et aucune authentification principale", () => {
    const incoming = new Headers({ cookie: [
      "better-auth.session_token=fictitious-main-session",
      "__Secure-better-auth.session_token=fictitious-main-secure-session",
      "__Host-antsia_bridge_receipt=fictitious-main-receipt",
      "__Host-antsia_bridge_generation=fictitious-main-generation",
      "__Host-antsia_demo_receipt=fictitious-demo-receipt",
      "__Host-antsia_demo_generation=fictitious-demo-generation",
      "antsia_demo_receipt=untrusted-unprefixed-receipt",
      "antsia_demo_generation=untrusted-unprefixed-generation",
      "__Host-antsia_demo_receipt_extra=unwanted",
      "__Host-antsia_demo_token=unwanted", "other=unwanted",
    ].join("; ") })
    expect(demoProxyHeaders(incoming)?.get("cookie")).toBe("__Host-antsia_demo_receipt=fictitious-demo-receipt; __Host-antsia_demo_generation=fictitious-demo-generation")
  })

  it("supprime entièrement cookie si aucun reçu démo admis n'est présent", () => {
    expect(demoProxyHeaders(new Headers({ cookie: "better-auth.session_token=fictitious-main-session; other=value" }))?.has("cookie")).toBe(false)
    expect(demoProxyHeaders(new Headers())?.has("cookie")).toBe(false)
  })

  it.each(["", "too-short"])("ferme le relais quand le bypass d'hébergement est absent ou court (%s)", value => {
    vi.stubEnv("ANTSIA_DEMO_HOSTING_BYPASS", value)
    expect(demoProxyHeaders(new Headers())).toBeNull()
  })
})
