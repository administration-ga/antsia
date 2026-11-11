import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"
import { NATIVE_PARITY_STATES, WEB_ROUTE_PARITY, nativeParityCounts, nativeParityProblems } from "./parity"
import { nativeWebRoutes, type NativeAccountSection } from "./routes"

// MB-01 : le fichier de routes du SITE est lu comme du texte, jamais importé (aucun import croisé entre produits).
const WEB_ROUTES_FILE = fileURLToPath(new URL("../../../antsia_ga/src/lib/routes.ts", import.meta.url))

/** Les clés de premier niveau de l'objet `export const routes = { … } as const`. */
function webRouteNames(source: string): string[] {
  const start = source.indexOf("export const routes = {")
  const end = start < 0 ? -1 : source.indexOf("\n} as const", start)
  if (start < 0 || end < 0) throw new Error("objet routes introuvable")
  const names: string[] = []
  for (const line of source.slice(start, end).split("\n").slice(1)) {
    const match = /^ {2}([A-Za-z][A-Za-z0-9]*):\s/u.exec(line)
    if (match?.[1]) names.push(match[1])
  }
  return names
}

/** Les chemins littéraux des routes sans paramètre (`name: () => "/chemin"`). */
function staticWebPaths(source: string): Set<string> {
  return new Set([...source.matchAll(/^ {2}[A-Za-z][A-Za-z0-9]*: \(\) => "([^"]+)"/gmu)].map(match => match[1]!))
}

const source = readFileSync(WEB_ROUTES_FILE, "utf8")
const names = webRouteNames(source)

describe("matrice de parité du site et de l'application (MB-01)", () => {
  it("lit vraiment les routes du site (le harnais n'est jamais vide)", () => {
    expect(names.length).toBeGreaterThan(100)
    expect(new Set(names).size).toBe(names.length)
    expect(names).toContain("feed")
    expect(names).toContain("personalControls")
  })

  it("donne une entrée à chaque route du site, et à aucune route disparue", () => {
    const missing = names.filter(name => !Object.hasOwn(WEB_ROUTE_PARITY, name))
    const stale = Object.keys(WEB_ROUTE_PARITY).filter(name => !names.includes(name))
    expect(missing, `routes du site sans entrée dans parity.ts : ${missing.join(", ")}`).toEqual([])
    expect(stale, `entrées de parity.ts sans route du site : ${stale.join(", ")}`).toEqual([])
  })

  it("garde l'ordre du fichier du site, pour qu'une relecture se fasse ligne à ligne", () => {
    expect(Object.keys(WEB_ROUTE_PARITY)).toEqual(names)
  })

  it("n'admet que des lignes bien formées : écran pour le natif, adresse pour le renvoi, rien pour l'absent et le fermé", () => {
    const problems = Object.entries(WEB_ROUTE_PARITY).flatMap(([name, entry]) => nativeParityProblems(name, entry))
    expect(problems).toEqual([])
    for (const entry of Object.values(WEB_ROUTE_PARITY)) expect(NATIVE_PARITY_STATES).toContain(entry.state)
  })

  it("test du test : une ligne mal formée est signalée", () => {
    expect(nativeParityProblems("x", { state: "native", surface: "ecran", screen: null, note: "n" })).toEqual(["x : écran natif manquant"])
    expect(nativeParityProblems("x", { state: "renvoi", surface: "ecran", screen: "me", note: "n" })).toEqual(["x : renvoi sans adresse ni écran d'origine"])
    expect(nativeParityProblems("x", { state: "absent", surface: "ecran", screen: "feed", note: " " })).toEqual(["x : note vide", "x : écran nommé pour un état absent"])
    expect(nativeParityProblems("x", { state: "ferme", surface: "technique", screen: null, via: "offer", note: "n" })).toEqual(["x : adresse de renvoi hors renvoi"])
    expect(webRouteNames("export const routes = {\n  a: () => \"/a\",\n  /** b */\n  b: (id: string) => `/b/${id}`,\n    nested: 1,\n} as const")).toEqual(["a", "b"])
  })

  it("chaque section du hub renvoie à une adresse qui existe sur le site", () => {
    const sections = { stories: true, shop: true, cart: true, purchases: true, orders: true, payments: true, serviceRequests: true, applications: true, feedPreferences: true, moderation: true, personalData: true } satisfies Record<NativeAccountSection, true>
    const paths = staticWebPaths(source)
    expect(paths.size).toBeGreaterThan(20)
    for (const section of Object.keys(sections) as NativeAccountSection[]) {
      expect(paths, `section ${section}`).toContain(new URL(nativeWebRoutes.accountSection("https://site.example", section)).pathname)
    }
  })

  it("compte chaque route une fois", () => {
    const counts = nativeParityCounts()
    expect(Object.values(counts).reduce((sum, value) => sum + value, 0)).toBe(names.length)
  })
})
