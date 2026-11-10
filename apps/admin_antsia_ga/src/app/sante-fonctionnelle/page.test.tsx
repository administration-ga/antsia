import type { HealthReport } from "@antsia/api/health"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

const state = vi.hoisted(() => ({ report: null as HealthReport | null }))

vi.mock("@/lib/health", () => ({
  probeConsoleHealth: async () => state.report,
  consoleHealthEnv: () => ({}),
}))
vi.mock("@/i18n/server", () => ({
  getAppT: () => ({ t: (key: string, options?: Record<string, unknown>) => (options ? `${key}:${JSON.stringify(options)}` : key) }),
}))

import HealthPage from "./page"

async function render(report: HealthReport) {
  state.report = report
  return renderToStaticMarkup(await HealthPage())
}

const base = { application: "admin-antsia-ga", version: "main-abc-production", backend: "configured" } as const

describe("page /sante-fonctionnelle de la console — elle dit l'état réel (EX-03)", () => {
  it("moteur qui répond : « En service », état, versions, heure et temps de réponse", async () => {
    const html = await render({ ...base, status: "ok", engine: { state: "reachable", version: "main-fd58d73a1b2c-production", serverTime: "2026-11-10T09:30:00.000Z", latencyMs: 42 } })
    expect(html).toContain('data-status="ok"')
    expect(html).toContain("health.overall.ok")
    expect(html).toContain("health.lead.ok")
    expect(html).toContain('data-engine-state="reachable"')
    expect(html).toContain("health.engine.reachable")
    expect(html).toContain("main-abc-production")
    expect(html).toContain("main-fd58d73a1b2c-production")
    expect(html).toContain('<time class="font-mono" dateTime="2026-11-10T09:30:00.000Z">2026-11-10T09:30:00.000Z</time>')
    expect(html).toContain('health.latencyValue:{&quot;latency&quot;:42}')
  })

  it("moteur sans version déclarée : « non déclarée », jamais une valeur inventée", async () => {
    const html = await render({ ...base, status: "ok", engine: { state: "reachable", version: null, serverTime: "2026-11-10T09:30:00.000Z", latencyMs: 12 } })
    expect(html).toContain("health.undeclared")
    expect(html).not.toContain("health.unknown")
  })

  it("moteur lent : « Service dégradé », et il répond toujours", async () => {
    const html = await render({ ...base, status: "degraded", engine: { state: "slow", version: null, serverTime: "2026-11-10T09:30:00.000Z", latencyMs: 1_400 } })
    expect(html).toContain('data-status="degraded"')
    expect(html).toContain("health.overall.degraded")
    expect(html).toContain("health.engine.slow")
    expect(html).toContain("health.undeclared")
  })

  it.each(["unreachable", "timeout", "error", "missing"] as const)("moteur %s : « Service dégradé », valeurs inconnues et non mesurées", async (engineState) => {
    const html = await render({ ...base, status: "degraded", backend: engineState === "missing" ? "missing" : "configured", engine: { state: engineState, version: null, serverTime: null, latencyMs: null } })
    expect(html).toContain("health.overall.degraded")
    expect(html).toContain("health.lead.degraded")
    expect(html).toContain(`health.engine.${engineState}`)
    expect(html).toContain("health.unknown")
    expect(html).toContain("health.notMeasured")
    expect(html).not.toContain("health.undeclared")
    expect(html).not.toContain("<time")
  })
})
