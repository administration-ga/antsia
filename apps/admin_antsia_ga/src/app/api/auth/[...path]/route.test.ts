import { NextRequest } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { DELETE, GET, PATCH, POST, PUT } from "./route"

/**
 * Revue CH-815 F3 — la route `/api/auth/*` de la console ne transporte AUCUN cookie du navigateur :
 * le relais commun du moteur, en mode `browserCookies: "drop"` (même motif qu'admin.diaspora.ga). La
 * session de la console ne vit que dans `Better-Auth-Cookie` / `Set-Better-Auth-Cookie` (greffon
 * `crossDomain`, `credentials: "omit"`), qui passent intacts. Un `Cookie` entrant n'y viendrait que
 * d'un dépôt par un voisin du même site ; un `Set-Cookie` poserait une session que rien n'y lit.
 */
const ENGINE = "https://moteur.exemple"
const TOSSED = "__Secure-better-auth.session_token=depose-par-un-voisin"
const SESSION = "better-auth.session_token=session-de-cet-onglet"

type Seen = { url: string; headers: Headers }
const seen: Seen[] = []

function engineReply(): Response {
  const headers = new Headers([["content-type", "application/json"], ["set-better-auth-cookie", "better-auth.session_token=nouvelle; Max-Age=604800"]])
  headers.append("set-cookie", "__Secure-better-auth.session_token=pose-par-le-moteur; Path=/; HttpOnly; Secure; SameSite=None")
  headers.append("set-cookie", "__Secure-better-auth.convex_jwt=jwt; Path=/; HttpOnly; Secure")
  return new Response(JSON.stringify({ session: null }), { status: 200, headers })
}

function browserRequest(path: string, method: string) {
  return new NextRequest(new URL(path, "https://console.exemple"), {
    method,
    headers: { cookie: TOSSED, "better-auth-cookie": SESSION, "content-type": "application/json" },
    ...(method === "GET" ? {} : { body: "{}" }),
  })
}

beforeEach(() => {
  seen.length = 0
  vi.stubEnv("CONVEX_SITE_URL", ENGINE)
  vi.stubEnv("NODE_ENV", "production")
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    seen.push({ url: String(input), headers: new Headers(init?.headers) })
    return engineReply()
  }))
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe("route /api/auth/[...path] de la console — aucun cookie du navigateur", () => {
  it.each([
    ["GET", GET],
    ["POST", POST],
    ["PUT", PUT],
    ["PATCH", PATCH],
    ["DELETE", DELETE],
  ] as const)("%s : ni `Cookie` vers le moteur, ni `Set-Cookie` vers le navigateur ; la session de l'onglet passe", async (method, handler) => {
    const response = await handler(browserRequest("/api/auth/get-session", method))
    expect(seen).toHaveLength(1)
    expect(seen[0]?.url).toBe(`${ENGINE}/api/auth/get-session`)
    expect(seen[0]?.headers.get("cookie")).toBeNull()
    expect(JSON.stringify([...seen[0]!.headers.entries()])).not.toContain("depose-par-un-voisin")
    expect(seen[0]?.headers.get("better-auth-cookie")).toBe(SESSION)
    expect(response.status).toBe(200)
    expect(response.headers.getSetCookie()).toEqual([])
    expect(response.headers.get("set-better-auth-cookie")).toBe("better-auth.session_token=nouvelle; Max-Age=604800")
  })
})
