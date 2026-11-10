import { createServer as createHttpServer, type IncomingMessage, type Server, type ServerResponse } from "node:http"
import { createServer } from "node:net"

import { afterEach, describe, expect, it, vi } from "vitest"

import { GET } from "./route"

/**
 * EX-03 — la route joint un VRAI serveur HTTP local qui parle comme le moteur
 * (`POST /api/query`) : joignable, muet, ou absent. Chaque cas a son port, donc
 * sa propre configuration : la réutilisation de 5 s de la sonde ne les mélange pas.
 */
const servers: Server[] = []

async function listen(handler: (request: IncomingMessage, response: ServerResponse) => void): Promise<string> {
  const server = createHttpServer(handler)
  servers.push(server)
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const address = server.address()
  return `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`
}

/** Un moteur qui répond à `health.ping` comme `convex/health.ts`. */
function answeringEngine(paths: string[]) {
  return listen((request, response) => {
    let body = ""
    request.on("data", (chunk: Buffer) => { body += chunk.toString() })
    request.on("end", () => {
      paths.push(`${request.method} ${request.url} ${(JSON.parse(body) as { path: string }).path}`)
      response.writeHead(200, { "Content-Type": "application/json" })
      response.end(JSON.stringify({ status: "success", value: { status: "ok", serverTime: Date.now(), engineVersion: "main-test-engine" }, logLines: [] }))
    })
  })
}

/** Un port local sur lequel plus rien n'écoute : le moteur est configuré mais injoignable. */
async function closedLocalPort(): Promise<string> {
  const server = createServer()
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const address = server.address()
  const port = typeof address === "object" && address ? address.port : 0
  await new Promise<void>((resolve) => server.close(() => resolve()))
  return `http://127.0.0.1:${port}`
}

async function timedGet() {
  const startedAt = performance.now()
  const response = await GET()
  const elapsedMs = performance.now() - startedAt
  const text = await response.text()
  return { response, elapsedMs, text, body: JSON.parse(text) as { status: string; backend: string; version: string; engine: { state: string; version: string | null } } }
}

afterEach(async () => {
  vi.unstubAllEnvs()
  for (const server of servers.splice(0)) {
    server.closeAllConnections()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
})

describe("route /api/sante-fonctionnelle — la sonde joint le moteur (EX-03)", () => {
  it("moteur joignable : 200, « ok », versions du site et du moteur, en moins de 3 s", async () => {
    const paths: string[] = []
    const url = await answeringEngine(paths)
    vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", url)
    vi.stubEnv("NEXT_PUBLIC_BUILD_SHA", "main-test-site")
    const { response, elapsedMs, text, body } = await timedGet()
    expect(response.status).toBe(200)
    expect(response.headers.get("Cache-Control")).toBe("no-store")
    expect(body).toMatchObject({ status: "ok", backend: "configured", version: "main-test-site", engine: { state: "reachable", version: "main-test-engine" } })
    expect(paths).toEqual(["POST /api/query health:ping"])
    expect(elapsedMs).toBeLessThan(3_000)
    // Ni l'adresse du moteur ni son port dans la réponse publique.
    expect(text).not.toContain(url)
    expect(text).not.toContain(new URL(url).port)
  })

  it("moteur configuré mais injoignable : 503, « degraded », sans adresse ni message d'erreur", async () => {
    const url = await closedLocalPort()
    vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", url)
    const { response, elapsedMs, text, body } = await timedGet()
    expect(response.status).toBe(503)
    expect(body).toMatchObject({ status: "degraded", backend: "configured", engine: { state: "unreachable", version: null } })
    expect(elapsedMs).toBeLessThan(3_000)
    expect(text).not.toContain(new URL(url).port)
    expect(text).not.toMatch(/ECONNREFUSED|fetch failed|Error/)
  })

  it("moteur muet : la route abandonne à 2 s et répond 503 « degraded » en moins de 3 s", async () => {
    const url = await listen(() => { /* le moteur reçoit la requête et ne répond jamais */ })
    vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", url)
    const { response, elapsedMs, body } = await timedGet()
    expect(response.status).toBe(503)
    expect(body).toMatchObject({ status: "degraded", engine: { state: "timeout" } })
    expect(elapsedMs).toBeGreaterThanOrEqual(1_900)
    expect(elapsedMs).toBeLessThan(3_000)
  })

  it("moteur non configuré : 503, « degraded »", async () => {
    vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", "")
    const { response, body } = await timedGet()
    expect(response.status).toBe(503)
    expect(body).toMatchObject({ status: "degraded", backend: "missing", engine: { state: "missing" } })
  })
})
