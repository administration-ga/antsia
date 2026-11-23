import { createEngineNextConfig } from "@antsia/api/next-config"
import type { NextConfig } from "next"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

/**
 * Revue CH-815 F3 — `Referrer-Policy: no-referrer` sur TOUTES les routes de la console : le retour
 * d'IDN arrive sur `/entrer` avec le jeton à usage unique de la session dans l'adresse, qu'aucune
 * requête ne doit emporter. Les autres en-têtes de sécurité du moteur (CSP comprise) restent tels
 * quels et dans leur ordre. Configuration lue en mode production : aucun fichier d'environnement.
 */
type HeaderRules = Awaited<ReturnType<NonNullable<NextConfig["headers"]>>>

async function rulesOf(config: NextConfig): Promise<HeaderRules> {
  return (await config.headers?.()) ?? []
}

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "production")
  vi.stubEnv("NEXT_PUBLIC_CONVEX_URL", "https://moteur-essai.convex.cloud")
  vi.stubEnv("CONVEX_SITE_URL", "https://moteur-essai.convex.site")
  vi.resetModules()
})
afterEach(() => vi.unstubAllEnvs())

async function appConfig(): Promise<NextConfig> {
  return (await import("../../next.config")).default
}

describe("en-têtes de la console — aucun Referer", () => {
  it("une règle couvre toutes les routes, et chaque règle porte `Referrer-Policy: no-referrer`, une seule fois", async () => {
    const rules = await rulesOf(await appConfig())
    expect(rules.some((rule) => rule.source === "/(.*)" && rule.has === undefined && rule.missing === undefined)).toBe(true)
    for (const rule of rules) {
      const policies = rule.headers.filter((header) => header.key.toLowerCase() === "referrer-policy")
      expect(policies, rule.source).toEqual([{ key: "Referrer-Policy", value: "no-referrer" }])
    }
  })

  it("les autres en-têtes du moteur restent identiques (CSP, nosniff, cadres, permissions, HSTS), dans leur ordre", async () => {
    const engine = await rulesOf(createEngineNextConfig({ appDir: process.cwd() }))
    const app = await rulesOf(await appConfig())
    const withoutReferrer = (rules: HeaderRules) =>
      rules.map((rule) => ({ ...rule, headers: rule.headers.filter((header) => header.key.toLowerCase() !== "referrer-policy") }))
    expect(withoutReferrer(app)).toEqual(withoutReferrer(engine))
    const keys = app.flatMap((rule) => rule.headers.map((header) => header.key))
    for (const key of ["Content-Security-Policy", "X-Content-Type-Options", "X-Frame-Options", "Permissions-Policy", "Strict-Transport-Security"]) {
      expect(keys, key).toContain(key)
    }
    // La politique est REMPLACÉE à sa place, pas ajoutée en double après celle du moteur.
    expect(app[0]!.headers.map((header) => header.key)).toEqual(engine[0]!.headers.map((header) => header.key))
  })

  it("le reste de la configuration commune est inchangé", async () => {
    const engine = createEngineNextConfig({ appDir: process.cwd() })
    const { headers: _appHeaders, ...app } = await appConfig()
    const { headers: _engineHeaders, ...rest } = engine
    expect(app).toEqual(rest)
  })
})
