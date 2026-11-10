import { NextRequest } from "next/server"
import { describe, expect, it, vi } from "vitest"

import { devCookie, proxyToConvex } from "./auth-proxy"

const SITE = "http://127.0.0.1:3211"

function request(path: string, init: { method?: string; headers?: Record<string, string>; body?: string } = {}) {
  return new NextRequest(new URL(path, "http://localhost:3030"), init)
}

describe("proxy Better Auth du moteur", () => {
  it("retire uniquement le préfixe public configuré et conserve la query", async () => {
    const fetchImpl = vi.fn(async () => new Response("null", { status: 200 }))
    const response = await proxyToConvex(
      request("/demo/api/auth/get-session?callbackURL=%2Fdemo%2Ffil&x=1"),
      { convexSiteUrl: SITE, isDev: false, publicBasePath: "/demo", fetchImpl: fetchImpl as unknown as typeof fetch },
    )
    expect(response.status).toBe(200)
    expect(fetchImpl).toHaveBeenCalledExactlyOnceWith(`${SITE}/api/auth/get-session?callbackURL=%2Fdemo%2Ffil&x=1`, expect.objectContaining({ method: "GET", redirect: "manual" }))
  })

  it("admet la fin exacte /api/auth et un préfixe canonique à plusieurs segments", async () => {
    const fetchImpl = vi.fn(async () => new Response("null", { status: 200 }))
    const response = await proxyToConvex(request("/app/demo/api/auth"), { convexSiteUrl: SITE, isDev: false, publicBasePath: "/app/demo", fetchImpl: fetchImpl as unknown as typeof fetch })
    expect(response.status).toBe(200)
    expect(fetchImpl).toHaveBeenCalledExactlyOnceWith(`${SITE}/api/auth`, expect.any(Object))
  })

  it.each([
    "/democratic/api/auth/get-session", "/demo2/api/auth/get-session", "/demo/api/authentication",
    "/demo/api/auth%2Fget-session", "/api/auth/get-session", "/prefix/demo/api/auth/get-session",
  ])("refuse une confusion de préfixe sans requête distante : %s", async (path) => {
    const fetchImpl = vi.fn()
    const response = await proxyToConvex(request(path), { convexSiteUrl: SITE, isDev: false, publicBasePath: "/demo", fetchImpl: fetchImpl as unknown as typeof fetch })
    expect(response.status).toBe(403)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it.each([
    "demo", "/", "//demo", "/demo/", "/demo//nested", "/demo/../other", "/demo?next=other", "/demo#part",
    " /demo", "/demo ", "/de%6do", "/démo", "/demo\\nested",
  ])("refuse une base publique non canonique sans requête distante : %s", async (publicBasePath) => {
    const fetchImpl = vi.fn()
    const response = await proxyToConvex(request("/demo/api/auth/get-session"), { convexSiteUrl: SITE, isDev: false, publicBasePath, fetchImpl: fetchImpl as unknown as typeof fetch })
    expect(response.status).toBe(403)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it("un préfixe explicitement vide conserve le chemin historique", async () => {
    const fetchImpl = vi.fn(async () => new Response("null", { status: 200 }))
    await proxyToConvex(request("/api/auth/get-session?x=1"), { convexSiteUrl: SITE, isDev: false, publicBasePath: "", fetchImpl: fetchImpl as unknown as typeof fetch })
    expect(fetchImpl).toHaveBeenCalledExactlyOnceWith(`${SITE}/api/auth/get-session?x=1`, expect.any(Object))
  })

  it("relaie vers les actions HTTP Convex sans les en-têtes de CE saut (x-forwarded-*)", async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const headers = init?.headers as Record<string, string>
      expect(headers["x-forwarded-host"]).toBeUndefined()
      expect(headers["x-forwarded-for"]).toBeUndefined()
      expect(headers.host).toBe("127.0.0.1:3211")
      expect(headers["content-type"]).toBe("application/json")
      return new Response('{"ok":true}', { status: 200, headers: { "content-type": "application/json" } })
    })
    const response = await proxyToConvex(
      request("/api/auth/email-otp/send?x=1", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-host": "localhost:3030", "x-forwarded-for": "1.2.3.4" },
        body: "{}",
      }),
      { convexSiteUrl: SITE, isDev: true, fetchImpl: fetchImpl as unknown as typeof fetch },
    )
    expect(fetchImpl).toHaveBeenCalledWith(`${SITE}/api/auth/email-otp/send?x=1`, expect.objectContaining({ method: "POST", redirect: "manual" }))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true })
  })

  it("relaie tels quels l'origine et la langue de la requête : le moteur en tire la marque et la langue du code", async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const headers = init?.headers as Record<string, string>
      expect(headers.origin).toBe("http://localhost:3031")
      expect(headers["accept-language"]).toBe("en")
      expect(headers.cookie).toBe("diasporale-langue=en")
      return new Response('{"success":true}', { status: 200, headers: { "content-type": "application/json" } })
    })
    const response = await proxyToConvex(
      request("/api/auth/email-otp/send-verification-otp", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://localhost:3031", "accept-language": "en", cookie: "diasporale-langue=en" },
        body: '{"email":"ada@example.test","type":"sign-in"}',
      }),
      { convexSiteUrl: SITE, isDev: true, fetchImpl: fetchImpl as unknown as typeof fetch },
    )
    expect(fetchImpl).toHaveBeenCalledOnce()
    expect(response.status).toBe(200)
  })

  it("réécrit les cookies en développement seulement", async () => {
    const upstream = () => {
      const headers = new Headers()
      headers.append("set-cookie", "__Secure-better-auth.session=abc; Path=/; Secure; HttpOnly; SameSite=None")
      return new Response(null, { status: 200, headers })
    }
    const dev = await proxyToConvex(request("/api/auth/session"), { convexSiteUrl: SITE, isDev: true, fetchImpl: (async () => upstream()) as unknown as typeof fetch })
    expect(dev.headers.getSetCookie()).toEqual(["better-auth.session=abc; Path=/; HttpOnly; SameSite=Lax"])
    const prod = await proxyToConvex(request("/api/auth/session"), { convexSiteUrl: SITE, isDev: false, fetchImpl: (async () => upstream()) as unknown as typeof fetch })
    expect(prod.headers.getSetCookie()).toEqual(["__Secure-better-auth.session=abc; Path=/; Secure; HttpOnly; SameSite=None"])
  })

  it("sans CONVEX_SITE_URL : 500 explicite ; moteur injoignable : 502", async () => {
    expect((await proxyToConvex(request("/api/auth/session"), { convexSiteUrl: undefined, isDev: true })).status).toBe(500)
    const error = vi.spyOn(console, "error").mockImplementation(() => {})
    const failing = (async () => {
      throw new Error("ECONNREFUSED")
    }) as unknown as typeof fetch
    expect((await proxyToConvex(request("/api/auth/session"), { convexSiteUrl: SITE, isDev: true, fetchImpl: failing })).status).toBe(502)
    error.mockRestore()
  })

  it("devCookie retire __Secure- et Secure, et passe SameSite=None en Lax", () => {
    expect(devCookie("__Secure-a=b; Secure; SameSite=None")).toBe("a=b; SameSite=Lax")
  })
})
