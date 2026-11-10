import type { AuthProxyOptions } from "@antsia/api/auth-proxy"
import { NextRequest } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const upstream = vi.hoisted(() => vi.fn<(request: NextRequest, options: AuthProxyOptions) => Promise<Response>>(async () => new Response(null, { status: 204 })))
vi.mock("@antsia/api/auth-proxy", () => ({ proxyToConvex: upstream }))
import { POST } from "../app/api/auth/[...path]/route"

beforeEach(() => { upstream.mockClear(); vi.stubEnv("NEXT_PUBLIC_APP_BASE_PATH", ""); vi.stubEnv("ANTSIA_DEMO_PROXY_TOKEN", "p".repeat(48)) })
afterEach(() => vi.unstubAllEnvs())
function request(path: string, token = "p".repeat(48)) { return new NextRequest(`https://runtime.example.test${path}`, { method: "POST", headers: { "x-antsia-demo-proxy": token } }) }
function demo() { vi.stubEnv("NEXT_PUBLIC_APP_BASE_PATH", "/demo"); vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", "https://vivid-hedgehog-655.convex.cloud") }

describe("route auth Next : préfixe physique ou déjà retiré", () => {
  it.each(["/api/auth/email-otp/send-verification-otp", "/api/auth/convex/token", "/api/auth/get-session"])("garde la route principale : %s", async (path) => {
    expect((await POST(request(path))).status).toBe(204)
    expect(upstream.mock.calls[0]?.[1]).toMatchObject({ publicBasePath: "" })
  })
  it.each(["/api/auth/email-otp/send-verification-otp", "/api/auth/convex/token", "/api/auth/get-session"])("admet la forme logique retirée par Next, sous relais privé : %s", async (path) => {
    demo()
    expect((await POST(request(path))).status).toBe(204)
    expect(upstream.mock.calls[0]?.[1]).toMatchObject({ publicBasePath: "" })
  })
  it("retire exactement /demo si Next le conserve dans l'URL", async () => {
    demo()
    expect((await POST(request("/demo/api/auth/convex/token"))).status).toBe(204)
    expect(upstream.mock.calls[0]?.[1]).toMatchObject({ publicBasePath: "/demo" })
  })
  it.each(["/api/authx/get-session", "/demo/api/authx/get-session", "/other/api/auth/get-session", "/democratic/api/auth/get-session"])("refuse tout chemin voisin sans appel amont : %s", async (path) => {
    demo()
    expect((await POST(request(path))).status).toBe(403)
    expect(upstream).not.toHaveBeenCalled()
  })
  it("ne confond pas une forme logique admise et une requête sans transport privé", async () => {
    demo()
    expect((await POST(request("/api/auth/convex/token", "wrong"))).status).toBe(403)
    expect(upstream).not.toHaveBeenCalled()
  })
})
