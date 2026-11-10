import { afterEach, describe, expect, it, vi } from "vitest"

import { computeHealth, createHealthProbe, ENGINE_PROBE_TIMEOUT_MS, ENGINE_SLOW_MS, type HealthProbeReport, healthHttpStatus, HEALTH_REUSE_MS, probeHealth } from "./health"

const ENGINE_URL = "http://127.0.0.1:3999"
const NOW = Date.UTC(2026, 10, 10, 9, 30)

/** Réponse du moteur telle que le client HTTP de Convex la reçoit de `/api/query`. */
function engineAnswer(value: unknown, status = 200): Response {
  return new Response(JSON.stringify({ status: "success", value, logLines: [] }), { status, headers: { "Content-Type": "application/json" } })
}

function answeringFetch(value: unknown = { status: "ok", serverTime: NOW, engineVersion: "main-fd58d73a1b2c-production" }) {
  return vi.fn<typeof fetch>(async () => engineAnswer(value))
}

/** Un moteur muet : la requête ne se termine qu'à l'abandon de la sonde. */
function silentFetch() {
  const signals: AbortSignal[] = []
  const fetchImpl = vi.fn<typeof fetch>((_input, init) => new Promise<Response>((_resolve, reject) => {
    const signal = init?.signal
    if (signal) {
      signals.push(signal)
      signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true })
    }
  }))
  return { fetchImpl, signals }
}

/** Aucune adresse, aucun message d'erreur, aucun identifiant dans ce qui sort de la sonde. */
function expectNoInternalDetail(report: HealthProbeReport) {
  const serialized = JSON.stringify(report)
  for (const forbidden of ["127.0.0.1", "3999", "http", "convex", "Error", "Request ID"]) expect(serialized).not.toContain(forbidden)
  expect(Object.keys(report).sort()).toEqual(["application", "backend", "engine", "status", "version"])
  expect(Object.keys(report.engine).sort()).toEqual(["latencyMs", "serverTime", "state", "version"])
}

afterEach(() => {
  vi.useRealTimers()
})

describe("probeHealth — la sonde joint le moteur (EX-03)", () => {
  it("garde les bornes du plan : 2 s de délai, lenteur à 1 s, réutilisation 5 s", () => {
    expect(ENGINE_PROBE_TIMEOUT_MS).toBe(2_000)
    expect(ENGINE_SLOW_MS).toBe(1_000)
    expect(HEALTH_REUSE_MS).toBe(5_000)
  })

  it("moteur joignable : « ok », HTTP 200, version du site et du moteur, date du serveur", async () => {
    const fetchImpl = answeringFetch()
    const report = await probeHealth({ NEXT_PUBLIC_CONVEX_URL: ENGINE_URL, NEXT_PUBLIC_BUILD_SHA: "main-abc-production" }, "antsia-ga", { fetch: fetchImpl })
    expect(report).toEqual({
      status: "ok",
      application: "antsia-ga",
      version: "main-abc-production",
      backend: "configured",
      engine: { state: "reachable", version: "main-fd58d73a1b2c-production", serverTime: "2026-11-10T09:30:00.000Z", latencyMs: expect.any(Number) },
    })
    expect(healthHttpStatus(report)).toBe(200)
    // La sonde appelle VRAIMENT `health.ping`, avec un argument nouveau à chaque appel.
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [input, init] = fetchImpl.mock.calls[0] ?? []
    expect(String(input)).toBe(`${ENGINE_URL}/api/query`)
    expect(JSON.parse(String(init?.body))).toMatchObject({ path: "health:ping", args: [{ requestedAt: expect.any(Number) }] })
    expect(init?.signal).toBeInstanceOf(AbortSignal)
    expect(init?.cache).toBe("no-store")
    expectNoInternalDetail(report)
  })

  it("moteur sans version déclarée : la version vaut null (« non déclarée »), jamais une valeur inventée", async () => {
    const undeclared = await probeHealth({ NEXT_PUBLIC_CONVEX_URL: ENGINE_URL }, "app", { fetch: answeringFetch({ status: "ok", serverTime: NOW, engineVersion: null }) })
    expect(undeclared.engine).toMatchObject({ state: "reachable", version: null })
    // Un moteur antérieur (sans date ni version) répond quand même : rien n'est inventé.
    const older = await probeHealth({ NEXT_PUBLIC_CONVEX_URL: ENGINE_URL }, "app", { fetch: answeringFetch({ status: "ok" }) })
    expect(older.engine).toMatchObject({ state: "reachable", version: null, serverTime: null })
    // Une valeur hors forme (adresse) n'est jamais recopiée.
    const odd = await probeHealth({ NEXT_PUBLIC_CONVEX_URL: ENGINE_URL }, "app", { fetch: answeringFetch({ status: "ok", serverTime: NOW, engineVersion: "https://exemple.invalid" }) })
    expect(odd.engine.version).toBeNull()
  })

  it("moteur injoignable : « degraded », HTTP 503, sans le message d'erreur ni l'adresse", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => { throw new TypeError(`fetch failed: connect ECONNREFUSED ${ENGINE_URL}`) })
    const report = await probeHealth({ NEXT_PUBLIC_CONVEX_URL: ENGINE_URL, NEXT_PUBLIC_BUILD_SHA: "main-abc" }, "app", { fetch: fetchImpl })
    expect(report).toEqual({
      status: "degraded",
      application: "app",
      version: "main-abc",
      backend: "configured",
      engine: { state: "unreachable", version: null, serverTime: null, latencyMs: null },
    })
    expect(healthHttpStatus(report)).toBe(503)
    expectNoInternalDetail(report)
  })

  it("délai dépassé : la sonde abandonne l'appel à 2 s exactement, « degraded », HTTP 503", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    const { fetchImpl, signals } = silentFetch()
    let settled: HealthProbeReport | null = null
    const pending = probeHealth({ NEXT_PUBLIC_CONVEX_URL: ENGINE_URL }, "app", { fetch: fetchImpl }).then((report) => { settled = report })
    await vi.advanceTimersByTimeAsync(ENGINE_PROBE_TIMEOUT_MS - 1)
    expect(settled).toBeNull()
    expect(signals[0]?.aborted).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    await pending
    expect(signals[0]?.aborted).toBe(true)
    expect(settled).toMatchObject({ status: "degraded", engine: { state: "timeout", version: null, serverTime: null, latencyMs: null } })
    expect(healthHttpStatus(settled as unknown as HealthProbeReport)).toBe(503)
  })

  it("moteur lent : il répond, donc HTTP 200, mais l'état est « degraded »", async () => {
    const instants = [NOW, NOW + ENGINE_SLOW_MS + 200]
    const report = await probeHealth({ NEXT_PUBLIC_CONVEX_URL: ENGINE_URL }, "app", { fetch: answeringFetch(), now: () => instants.shift() ?? NOW })
    expect(report.status).toBe("degraded")
    expect(report.engine).toMatchObject({ state: "slow", latencyMs: ENGINE_SLOW_MS + 200 })
    expect(healthHttpStatus(report)).toBe(200)
  })

  it("moteur en erreur (fonction inconnue d'un moteur antérieur, réponse hors contrat) : « degraded », HTTP 503", async () => {
    const failing = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ status: "error", errorMessage: "[Request ID: x] Server Error ArgumentValidationError" }), { status: 560 }))
    const failed = await probeHealth({ NEXT_PUBLIC_CONVEX_URL: ENGINE_URL }, "app", { fetch: failing })
    expect(failed.engine).toEqual({ state: "error", version: null, serverTime: null, latencyMs: null })
    expect(healthHttpStatus(failed)).toBe(503)
    expectNoInternalDetail(failed)
    const offContract = await probeHealth({ NEXT_PUBLIC_CONVEX_URL: ENGINE_URL }, "app", { fetch: answeringFetch({ status: "maybe" }) })
    expect(offContract.engine.state).toBe("error")
    expect(healthHttpStatus(offContract)).toBe(503)
  })

  it("moteur non configuré : « degraded », HTTP 503, aucun appel", async () => {
    const fetchImpl = answeringFetch()
    const report = await probeHealth({}, "app", { fetch: fetchImpl })
    expect(report).toMatchObject({ status: "degraded", backend: "missing", version: "dev", engine: { state: "missing" } })
    expect(healthHttpStatus(report)).toBe(503)
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})

describe("createHealthProbe — une route publique ne multiplie pas les appels au moteur", () => {
  it("réutilise un résultat de moins de 5 s, partage la sonde en cours, puis sonde à nouveau", async () => {
    let clock = NOW
    const fetchImpl = answeringFetch()
    const probe = createHealthProbe("app", { fetch: fetchImpl, now: () => clock })
    const env = { NEXT_PUBLIC_CONVEX_URL: ENGINE_URL }
    const [first, second] = await Promise.all([probe(env), probe(env)])
    expect(first).toBe(second)
    clock += HEALTH_REUSE_MS - 1
    await probe(env)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    clock += 1
    await probe(env)
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    // Une autre configuration ne lit jamais le résultat de la précédente.
    await probe({ NEXT_PUBLIC_CONVEX_URL: "http://127.0.0.1:3998" })
    expect(fetchImpl).toHaveBeenCalledTimes(3)
  })
})

describe("computeHealth — rapport de configuration, conservé pour les sondes composées", () => {
  it("garde la forme d'avant EX-03 : quatre champs, aucun état du moteur", () => {
    const report = computeHealth({ NEXT_PUBLIC_CONVEX_URL: ENGINE_URL, NEXT_PUBLIC_BUILD_SHA: "abc123" }, "app")
    expect(report).toEqual({ status: "ok", application: "app", version: "abc123", backend: "configured" })
    expect(JSON.stringify(report)).not.toContain(ENGINE_URL)
  })

  it("dit « degraded » sans adresse du moteur, et « dev » sans commit construit", () => {
    expect(computeHealth({}, "app")).toEqual({ status: "degraded", application: "app", version: "dev", backend: "missing" })
  })
})
