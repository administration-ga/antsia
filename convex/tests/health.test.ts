// @vitest-environment edge-runtime
/** EX-03 — la sonde du moteur rend sa date et sa version déclarée, rien d'autre. */
import { afterEach, describe, expect, it, vi } from "vitest"

import { api } from "../_generated/api"
import { declaredEngineVersion } from "../health"
import { testConvex } from "../test.setup"

const NOW = Date.UTC(2026, 10, 10, 9, 30)

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

describe("health.ping — sonde du moteur (EX-03)", () => {
  it("rend l'état, la date du serveur et une version « non déclarée » sans variable", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
    vi.stubEnv("ANTSIA_ENGINE_VERSION", undefined)
    const t = testConvex()
    expect(await t.query(api.health.ping, { requestedAt: NOW - 5 })).toEqual({ status: "ok", serverTime: NOW, engineVersion: null })
  })

  it("rend la version déclarée à la publication, et seulement elle", async () => {
    vi.stubEnv("ANTSIA_ENGINE_VERSION", "main-fd58d73a1b2c-production")
    const t = testConvex()
    const result = await t.query(api.health.ping, { requestedAt: 1 })
    expect(result.engineVersion).toBe("main-fd58d73a1b2c-production")
    // Aucune autre donnée que les trois champs du contrat.
    expect(Object.keys(result).sort()).toEqual(["engineVersion", "serverTime", "status"])
  })

  it("répond encore à un appelant d'avant EX-03, qui n'envoie aucun argument", async () => {
    const t = testConvex()
    expect(await t.query(api.health.ping, {})).toMatchObject({ status: "ok", engineVersion: null })
  })

  it("ne rend jamais une valeur hors forme : absente, vide, trop longue ou porteuse d'une adresse", () => {
    expect(declaredEngineVersion(undefined)).toBeNull()
    expect(declaredEngineVersion("")).toBeNull()
    expect(declaredEngineVersion("   ")).toBeNull()
    expect(declaredEngineVersion("a".repeat(65))).toBeNull()
    expect(declaredEngineVersion("https://exemple.invalid/v1")).toBeNull()
    expect(declaredEngineVersion("v 1")).toBeNull()
    expect(declaredEngineVersion(" 1.4.0+build.7 ")).toBe("1.4.0+build.7")
  })
})
