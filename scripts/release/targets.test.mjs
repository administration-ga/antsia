import { describe, expect, test } from "bun:test"
import { existsSync, readdirSync } from "node:fs"
import { join, resolve } from "node:path"

import { variables as hostVariables } from "./hosts/vercel.mjs"
import { ENGINES, KEY_ROUTES, RELEASE_VARIABLES, ReleaseRefusal, SITES, assertSha, buildLabel, isExactOrigin, readVariables, validVariable } from "./targets.mjs"

const ROOT = resolve(import.meta.dir, "..", "..")

/** Une route d'une application Next existe-t-elle (groupes de routes compris) ? */
function routeExists(appDir, route) {
  const segments = route.split("/").filter(Boolean)
  const candidates = (dir, rest) => {
    if (rest.length === 0) return ["page.tsx", "route.ts"].some((file) => existsSync(join(dir, file)))
    const groups = existsSync(dir) ? readdirSync(dir).filter((entry) => /^\(.+\)$/.test(entry)) : []
    return candidates(join(dir, rest[0]), rest.slice(1)) || groups.some((group) => candidates(join(dir, group), rest))
  }
  return candidates(join(ROOT, appDir), segments)
}

describe("cibles de la publication", () => {
  test("chaque route clé contrôlée existe dans son application (aucune route inventée)", () => {
    for (const route of [...KEY_ROUTES.principal, ...KEY_ROUTES.demo]) expect({ route, exists: routeExists("apps/antsia_ga/src/app", route) }).toEqual({ route, exists: true })
    for (const route of KEY_ROUTES.console) expect({ route, exists: routeExists("apps/admin_antsia_ga/src/app", route) }).toEqual({ route, exists: true })
  })

  test("les moteurs et les sites ne nomment que des variables connues", () => {
    for (const engine of Object.values(ENGINES)) expect(RELEASE_VARIABLES[engine.variable]?.kind).toBe("convex")
    for (const site of Object.values(SITES)) expect(RELEASE_VARIABLES[site.aliasVariable]?.kind).toBe("origin")
  })

  test("les exemples documentés sont fictifs et passent leur propre contrôle de forme", () => {
    for (const [name, spec] of Object.entries({ ...RELEASE_VARIABLES, ...hostVariables })) {
      expect({ name, valid: validVariable(spec.kind, spec.example) }).toEqual({ name, valid: true })
      expect(spec.example).toMatch(/exemple/)
    }
  })

  test("une variable absente ou mal formée refuse l'exécution en la nommant ; le plan garde un marqueur", () => {
    const catalogue = RELEASE_VARIABLES
    const plan = readVariables({}, ["ANTSIA_RELEASE_CONVEX_DEMO"], catalogue)
    expect(plan.values.ANTSIA_RELEASE_CONVEX_DEMO).toBe("<ANTSIA_RELEASE_CONVEX_DEMO>")
    expect(() => readVariables({}, ["ANTSIA_RELEASE_CONVEX_DEMO"], catalogue, { strict: true })).toThrow(ReleaseRefusal)
    expect(() => readVariables({ ANTSIA_RELEASE_SITE_ORIGIN: "https://site.exemple.test/demo" }, ["ANTSIA_RELEASE_SITE_ORIGIN"], catalogue, { strict: true })).toThrow("mal formée")
    expect(() => readVariables({ ANTSIA_RELEASE_CONVEX_DEMO: "prod:exemple-demo|cle" }, ["ANTSIA_RELEASE_CONVEX_DEMO"], catalogue, { strict: true })).toThrow("mal formée")
  })

  test("origines exactes, SHA complet, étiquettes de version", () => {
    expect(isExactOrigin("https://site.exemple.test")).toBe(true)
    for (const value of ["http://site.exemple.test", "https://site.exemple.test/", "https://site.exemple.test:8443", " https://site.exemple.test"]) expect(isExactOrigin(value)).toBe(false)
    expect(() => assertSha("main")).toThrow("SHA complet")
    expect(buildLabel("0123456789abcdef0123456789abcdef01234567", "production")).toBe("main-0123456789ab-production")
    expect(buildLabel("0123456789abcdef0123456789abcdef01234567", "demo", { inMain: false })).toBe("commit-0123456789ab-demo")
  })
})
