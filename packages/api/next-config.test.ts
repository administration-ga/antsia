import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, describe, expect, it, vi } from "vitest"

import { createEngineNextConfig, optionalAnalyticsOrigin, readEnvFile } from "./next-config.mjs"

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("development cache GC", () => {
  const ecosystemsRoot = join(tmpdir(), "antsia-cache-policy", "ECOSYSTEMES")
  const appDir = join(ecosystemsRoot, "ANTSIA", "apps", "antsia_ga")

  it("active la politique locale sur opt-in sans changer racines, environnement ni portée des en-têtes", async () => {
    vi.stubEnv("NODE_ENV", "development")
    vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", "http://127.0.0.1:3210")
    vi.stubEnv("CONVEX_SITE_URL", "http://127.0.0.1:3211")
    const config = createEngineNextConfig({ appDir, developmentCacheGc: true })

    expect(config.experimental).toMatchObject({
      turbopackFileSystemCacheForBuild: false,
      turbopackFileSystemCacheForDev: true,
      turbopackGc: { minProgressMs: 100, rootTtlMs: 30 * 60 * 1000 },
    })
    expect(config.output).toBe("standalone")
    expect(config.outputFileTracingRoot).toBe(ecosystemsRoot)
    expect(config.turbopack).toEqual({ root: ecosystemsRoot })
    expect(config.env).toEqual({ NEXT_PUBLIC_CONVEX_URL: "http://127.0.0.1:3210", CONVEX_SITE_URL: "http://127.0.0.1:3211" })
    expect((await config.headers?.())?.map(rule => rule.source)).toEqual(["/(.*)"])
  })

  it("ne force ni GC ni cache de développement en production, même avec l'opt-in", () => {
    vi.stubEnv("NODE_ENV", "production")
    const config = createEngineNextConfig({ appDir, developmentCacheGc: true })

    expect(config.experimental?.turbopackFileSystemCacheForBuild).toBe(false)
    expect(config.experimental).not.toHaveProperty("turbopackGc")
    expect(config.experimental).not.toHaveProperty("turbopackFileSystemCacheForDev")
  })

  it("laisse les autres applications sans GC de développement par défaut", () => {
    vi.stubEnv("NODE_ENV", "development")
    const config = createEngineNextConfig({ appDir: join(ecosystemsRoot, "ANTSIA", "apps", "admin_antsia_ga") })

    expect(config.experimental?.turbopackFileSystemCacheForBuild).toBe(false)
    expect(config.experimental).not.toHaveProperty("turbopackGc")
    expect(config.experimental).not.toHaveProperty("turbopackFileSystemCacheForDev")
  })
})

describe("optional analytics CSP origin", () => {
  const token = `phc_${"a".repeat(24)}`
  it("n'ouvre aucune origine sans configuration complète", () => {
    expect(optionalAnalyticsOrigin("", token)).toBeNull()
    expect(optionalAnalyticsOrigin("https://usage.example.test", "")).toBeNull()
    expect(optionalAnalyticsOrigin("https://usage.example.test", `phx_${"a".repeat(24)}`)).toBeNull()
  })
  it("admet le cloud UE ou un relais explicitement déclaré, jamais un HTTPS arbitraire", () => {
    expect(optionalAnalyticsOrigin("https://eu.i.posthog.com", token)).toBe("https://eu.i.posthog.com")
    expect(optionalAnalyticsOrigin("https://usage.example.test", token)).toBeNull()
    expect(optionalAnalyticsOrigin("https://us.i.posthog.com", token)).toBeNull()
    expect(optionalAnalyticsOrigin("https://usage.example.test", token, "https://usage.example.test")).toBe("https://usage.example.test")
    expect(optionalAnalyticsOrigin("https://usage.example.test", token, "https://usage.example.test/path")).toBeNull()
    for (const host of ["http://usage.example.test", "https://name:secret@usage.example.test", "https://usage.example.test/path", "https://usage.example.test?key=1", "https://usage.example.test#fragment", "https://usage.example.test 'unsafe-inline'"]) {
      expect(optionalAnalyticsOrigin(host, token)).toBeNull()
    }
  })
})

describe("permissions d'iframe de la configuration Next", () => {
  const appDir = join(tmpdir(), "antsia-frame-policy", "ECOSYSTEMES", "ANTSIA", "apps", "antsia_ga")
  const directive = (csp: string | undefined, name: string) => csp?.split("; ").find((value) => value.startsWith(`${name} `))

  it("transmet sources et ancêtres HTTPS exacts aux en-têtes communs sans changer leur portée", async () => {
    vi.stubEnv("NODE_ENV", "production")
    const config = createEngineNextConfig({ appDir, iframeSources: ["https://demo.example.test"], frameAncestors: ["https://app.example.test"] })
    const rules = await config.headers?.()
    expect(rules?.map(({ source }) => source)).toEqual(["/(.*)"])
    const headers = rules?.[0]?.headers ?? []
    const csp = headers.find(({ key }) => key === "Content-Security-Policy")?.value
    expect(directive(csp, "frame-src")).toBe("frame-src https://demo.example.test")
    expect(directive(csp, "frame-ancestors")).toBe("frame-ancestors https://app.example.test")
    expect(headers.some(({ key }) => key === "X-Frame-Options")).toBe(false)
  })

  it("garde DENY et ne crée aucune source iframe sans options, y compris avec des options invalides", async () => {
    vi.stubEnv("NODE_ENV", "production")
    const normal = await createEngineNextConfig({ appDir }).headers?.()
    const invalid = await createEngineNextConfig({ appDir, iframeSources: ["https://demo.example.test/"], frameAncestors: ["https://app.example.test:443", "https://*.example.test"] }).headers?.()
    expect(invalid).toEqual(normal)
    const headers = normal?.[0]?.headers ?? []
    const csp = headers.find(({ key }) => key === "Content-Security-Policy")?.value
    expect(directive(csp, "frame-src")).toBeUndefined()
    expect(directive(csp, "frame-ancestors")).toBe("frame-ancestors 'none'")
    expect(headers).toContainEqual({ key: "X-Frame-Options", value: "DENY" })
  })
})

describe("readEnvFile", () => {
  it("lit le format écrit par le CLI Convex (commentaires, lignes vides)", () => {
    const dir = mkdtempSync(join(tmpdir(), "env-"))
    const file = join(dir, ".env.local")
    writeFileSync(file, "# Deployment used by `npx convex dev`\nCONVEX_DEPLOYMENT=anonymous:exemple # commentaire\n\nCONVEX_URL=http://127.0.0.1:3210\nCONVEX_SITE_URL=\"http://127.0.0.1:3211\"\n")
    expect(readEnvFile(file)).toEqual({
      CONVEX_DEPLOYMENT: "anonymous:exemple",
      CONVEX_URL: "http://127.0.0.1:3210",
      CONVEX_SITE_URL: "http://127.0.0.1:3211",
    })
  })

  it("rend un objet vide quand le fichier n'existe pas", () => {
    expect(readEnvFile(join(tmpdir(), "absent-antsia", ".env.local"))).toEqual({})
  })
})
