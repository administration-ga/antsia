import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { handleSessionBridge } from "./session-bridge-server"
import { bridgeAdmission, bridgeCookieNames, BRIDGE_TIMEOUT_MS } from "./session-bridge"
import { routes } from "./routes"

const origin = "http://localhost:3030"
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
const sid = "abcdefghijklmnopqrstuv.signature1234567890="
const jwt = (subject: string, sessionId: string) => `${btoa("{}")}.${btoa(JSON.stringify({ sub: subject, sessionId }))}.signature`
const names = bridgeCookieNames(false)
const upstream = (subject = "A", id = "SID-A") => Response.json({ session: { id, userId: subject, expiresAt: new Date(Date.now() + 90_000).toISOString() }, user: { id: subject } })
function request(method: string, generation = A, data?: Record<string, unknown>) {
  return new Request(new URL(routes.publicSessionBridge(), origin), { method, headers: { Origin: origin, "Content-Type": "application/json", Cookie: `${names.generation}=${generation}; better-auth.session_token=foreign-http-session` }, body: JSON.stringify(data ?? { generation, cookie: `better-auth.session_token=${encodeURIComponent(sid)}`, jwt: jwt("A", "SID-A") }) })
}
beforeEach(() => vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", "http://localhost:3210"))
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs() })

describe("broker ANTSIA : pas de session étrangère ni de bypass JWT", () => {
  it("le transport démo privé garde le contrôle d'origine et un reçu distinct du compte réel", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_BASE_PATH", "/demo")
    vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", "https://vivid-hedgehog-655.convex.cloud")
    vi.stubEnv("ANTSIA_DEMO_PROXY_TOKEN", "p".repeat(48))
    const demoNames = bridgeCookieNames(true)
    const canonical = "https://antsia.vercel.app"
    const make = (admitted: boolean) => new Request("https://runtime.example.test/demo/api/session-bridge", { method: "DELETE", headers: { Origin: canonical, "Content-Type": "application/json", Cookie: `${demoNames.generation}=${A}`, ...(admitted ? { "x-antsia-demo-proxy": "p".repeat(48) } : {}) }, body: JSON.stringify({ generation: A, anonymous: true }) })
    expect((await handleSessionBridge(make(false), { origin: canonical })).status).toBe(403)
    const response = await handleSessionBridge(make(true), { origin: canonical })
    expect(response.status).toBe(204)
    expect(response.cookies.get(demoNames.receipt)).toBeDefined()
    expect(demoNames.receipt).toBe("__Host-antsia_demo_receipt")
    expect(response.headers.get("set-cookie")).toContain("SameSite=lax")
    expect(response.headers.get("set-cookie")).not.toContain("Partitioned")
    const foreign = make(true)
    foreign.headers.set("origin", "https://foreign.example.test")
    expect((await handleSessionBridge(foreign, { origin: canonical })).status).toBe(403)
    vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", "https://diligent-avocet-585.convex.cloud")
    expect((await handleSessionBridge(make(true), { origin: canonical })).status).toBe(403)
  })
  it("n'envoie que le SID signé SDK et borne le reçu par l'expiration réelle", async () => {
    const authFetch = vi.fn<(path: string, cookie: string) => Promise<Response>>(async () => upstream())
    const response = await handleSessionBridge(request("POST"), { origin, authFetch, sessionActive: async () => true })
    expect(response.status).toBe(204)
    expect(authFetch.mock.calls[0]?.[1]).toBe(`better-auth.session_token=${encodeURIComponent(sid)}`)
    expect(response.headers.get("set-cookie")).toContain("HttpOnly")
    expect(response.headers.get("set-cookie")).not.toContain("Domain=")
    expect(response.cookies.get(names.generation)).toBeUndefined()
    const raw = response.cookies.get(names.receipt)!.value
    expect(bridgeAdmission(A, raw).status).toBe("session")
    expect(response.headers.get("cache-control")).toBe("no-store")
  })
  it("refuse SID/JWT divergents, JWT révoqué et origine étrangère", async () => {
    expect((await handleSessionBridge(request("POST", A, { generation: A, cookie: `better-auth.session_token=${sid}`, jwt: jwt("B", "SID-B") }), { origin, authFetch: async () => upstream(), sessionActive: async () => true })).status).toBe(403)
    expect((await handleSessionBridge(request("POST"), { origin, authFetch: async () => upstream(), sessionActive: async () => false })).status).toBe(403)
    const foreign = request("DELETE", A, { generation: A, anonymous: true })
    foreign.headers.set("origin", "http://localhost:3031")
    expect((await handleSessionBridge(foreign, { origin })).status).toBe(403)
  })
  it("purge hors ligne backend sans aucun appel de révocation ni d'authentification", async () => {
    vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", "")
    const authFetch = vi.fn(async () => { throw new Error("must not run") })
    const response = await handleSessionBridge(request("DELETE", B, { generation: B, anonymous: true }), { origin, authFetch })
    expect(response.status).toBe(204)
    expect(authFetch).not.toHaveBeenCalled()
    expect(bridgeAdmission(B, response.cookies.get(names.receipt)?.value)).toEqual({ status: "anonymous" })
  })
  it("un grant A terminé après B et une purge A terminée après B restent fermés", async () => {
    let finishA: (response: Response) => void = () => undefined
    const old = handleSessionBridge(request("POST"), { origin, authFetch: () => new Promise<Response>((resolve) => { finishA = resolve }), sessionActive: async () => true })
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve()
    const newer = await handleSessionBridge(request("POST", B, { generation: B, cookie: `better-auth.session_token=${sid}`, jwt: jwt("B", "SID-B") }), { origin, authFetch: async () => upstream("B", "SID-B"), sessionActive: async () => true })
    expect(bridgeAdmission(B, newer.cookies.get(names.receipt)?.value).status).toBe("session")
    finishA(upstream())
    const late = await old
    expect(bridgeAdmission(B, late.cookies.get(names.receipt)?.value)).toEqual({ status: "closed" })
    const latePurge = await handleSessionBridge(request("DELETE", A, { generation: A, anonymous: true }), { origin })
    expect(bridgeAdmission(B, latePurge.cookies.get(names.receipt)?.value)).toEqual({ status: "closed" })
  })
  it("ne laisse pas une preuve Convex pendante retenir la réponse HTTP", async () => {
    vi.useFakeTimers()
    const pending = handleSessionBridge(request("POST"), { origin, authFetch: async () => upstream(), sessionActive: () => new Promise<boolean>(() => undefined) })
    await vi.advanceTimersByTimeAsync(BRIDGE_TIMEOUT_MS + 1)
    const response = await pending
    expect(response.status).toBe(503)
    expect(response.headers.has("set-cookie")).toBe(false)
  })
})
