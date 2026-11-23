import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join, posix } from "node:path"

import { isValidNetworkSlug } from "@antsia/social-domain/network"
import { describe, expect, it } from "vitest"

import { isTestFile, listFiles, REPO_ROOT } from "./lib/source-files"

/**
 * `administers_network` (ADR-0042) : le réseau qu'ADMINISTRE l'application, lu par la garde `networkAdmin*` du moteur ;
 * `entry_path` (revue CH-815 A1b, constat F2) : sa page d'entrée, seule adresse où le retour d'IDN lui ouvre une
 * session d'administration (`betterAuth/settings.entryPathOf`).
 */
type WebApplication = { platform: "web"; path: string; dev_port: number; build_args: string[]; administers_network?: string; entry_path?: string }

/** La forme d'un chemin d'entrée que lit le moteur : segments non réservés, sans barre finale, ni requête, ni fragment. */
const ENTRY_PATH = /^(?:\/[A-Za-z0-9._~-]+)+$/
type NativeApplication = { platform: "expo-native"; path: string; config: string; entry: string; public_env: string[]; config_env: string[] }
type Catalog = { applications: Record<string, WebApplication | NativeApplication> }

/**
 * Dossiers d'applications des espaces de travail déclarés : celles du moteur
 * (`apps/*`) et les applications EXTERNES installées avec lui
 * (`../DIASPORA_GA/apps/*`) — un dossier sans `package.json` n'en est pas une.
 */
function declaredApplicationDirectories(globs: readonly string[]): string[] {
  const out: string[] = []
  for (const glob of globs.filter((entry) => entry.endsWith("apps/*"))) {
    const base = join(REPO_ROOT, glob.slice(0, -2))
    if (!existsSync(base)) continue
    for (const entry of readdirSync(base)) {
      if (!entry.startsWith(".") && existsSync(join(base, entry, "package.json"))) out.push(`${glob.slice(0, -1)}${entry}`)
    }
  }
  return out.sort()
}

/** Paquets lus par une application : ceux du moteur, plus ceux de son dépôt si elle est externe. */
function packageDirectoriesOf(appPath: string): string[] {
  return appPath.startsWith("../") ? ["packages", posix.join(posix.dirname(posix.dirname(appPath)), "packages")] : ["packages"]
}

describe("deploy-catalog — chaque application servie est au catalogue (câblages invisibles)", () => {
  const catalog = JSON.parse(readFileSync(join(REPO_ROOT, "deploy/catalog.json"), "utf8")) as Catalog
  const root = JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf8")) as { workspaces: { packages: string[] }; scripts: Record<string, string> }

  it("toute application des espaces de travail (moteur et externes) a son entrée, et inversement", () => {
    const declared = Object.values(catalog.applications).map((app) => app.path)
    expect(declared.sort()).toEqual(declaredApplicationDirectories(root.workspaces.packages))
  })

  it("les applications sont des espaces de travail déclarés (sinon le build Docker échoue en 127)", () => {
    expect(root.workspaces.packages).toContain("apps/*")
    const uncovered = Object.values(catalog.applications)
      .map((app) => app.path)
      .filter((path) => !root.workspaces.packages.includes(`${posix.dirname(path)}/*`))
    expect(uncovered).toEqual([])
  })

  it("les ports de développement sont distincts", () => {
    const ports = Object.values(catalog.applications).filter((app) => app.platform === "web").map((app) => app.dev_port)
    expect(ports.every((port) => Number.isInteger(port) && port > 0)).toBe(true)
    expect(new Set(ports).size).toBe(ports.length)
  })

  it("chaque application déclare une plateforme connue", () => {
    for (const app of Object.values(catalog.applications)) expect(["web", "expo-native"]).toContain(app.platform)
  })

  it("toute variable NEXT_PUBLIC_* lue par une application est déclarée au catalogue", () => {
    const problems: string[] = []
    const shared = readFileSync(join(REPO_ROOT, "packages/api/next-config.mjs"), "utf8")
    for (const app of Object.values(catalog.applications)) {
      if (app.platform !== "web") continue
      const files = [
        join(app.path, "next.config.ts"),
        ...listFiles([`${app.path}/src`, ...packageDirectoriesOf(app.path)], [".ts", ".tsx"]).filter((file) => !isTestFile(file)),
      ]
      const sources = [shared, ...files.map((file) => readFileSync(join(REPO_ROOT, file), "utf8"))].join("\n")
      for (const match of sources.matchAll(/process\.env\.(NEXT_PUBLIC_[A-Z0-9_]+)/g)) {
        if (match[1] && !app.build_args.includes(match[1])) problems.push(`${app.path} : ${match[1]}`)
      }
    }
    expect([...new Set(problems)]).toEqual([])
  })

  it("le natif déclare chaque variable publique du binaire et chaque variable de configuration Expo", () => {
    const problems: string[] = []
    for (const app of Object.values(catalog.applications)) {
      if (app.platform !== "expo-native") continue
      const files = [
        join(app.path, app.config), join(app.path, app.entry),
        ...listFiles([`${app.path}/src`, `${app.path}/plugins`, `${app.path}/modules`, ...packageDirectoriesOf(app.path)], [".ts", ".tsx", ".js", ".cjs", ".mjs"]).filter((file) => !isTestFile(file)),
      ]
      const sources = files.map((file) => readFileSync(join(REPO_ROOT, file), "utf8")).join("\n")
      for (const match of sources.matchAll(/process\.env\.(EXPO_PUBLIC_[A-Z0-9_]+)/g)) {
        if (match[1] && !app.public_env.includes(match[1])) problems.push(`${app.path} : ${match[1]}`)
      }
      const config = readFileSync(join(REPO_ROOT, app.path, app.config), "utf8")
      // Les identifiants sont lus par identifier(name, pattern), les autres par accès littéral.
      for (const match of config.matchAll(/process\.env\.((?:EXPO_PUBLIC_|NATIVE_|APNS_)[A-Z0-9_]+)|identifier\("((?:EXPO_PUBLIC_|NATIVE_|APNS_)[A-Z0-9_]+)"/g)) {
        const name = match[1] ?? match[2]
        if (name && !(name.startsWith("EXPO_PUBLIC_") ? app.public_env : app.config_env).includes(name)) problems.push(`${app.path} : ${name}`)
      }
    }
    expect([...new Set(problems)]).toEqual([])
  })

  it("ADR-0042 : une application qui administre un réseau est web, nomme un identifiant de réseau valide, et chaque déclaration est voulue", () => {
    const administering = Object.entries(catalog.applications).filter(([, app]) => "administers_network" in app)
    for (const [key, app] of administering) {
      expect(app.platform, key).toBe("web")
      const network = (app as WebApplication).administers_network
      expect(typeof network === "string" && isValidNetworkSlug(network), key).toBe(true)
    }
    // Le contrat CH-815 : l'application d'administration de DIASPORA.GA, et elle seule. Une autorité de plus
    // sur un réseau (ou une application des membres qui en recevrait une) se décide ici, à la lecture.
    expect(Object.fromEntries(administering.map(([key, app]) => [key, (app as WebApplication).administers_network]))).toEqual({ admin_diaspora_ga: "diaspora-ga" })
  })

  it("revue CH-815 A1b (F2) : une application qui administre un réseau déclare son chemin d'entrée, et elle seule", () => {
    const withEntry = Object.entries(catalog.applications).filter(([, app]) => "entry_path" in app)
    const administering = Object.entries(catalog.applications).filter(([, app]) => "administers_network" in app)
    // Requis pour toute application qui administre un réseau ; absent ailleurs (il ne servirait à rien et se lirait comme une autorité).
    expect(withEntry.map(([key]) => key).sort()).toEqual(administering.map(([key]) => key).sort())
    for (const [key, app] of withEntry) {
      const entryPath = (app as WebApplication).entry_path
      expect(typeof entryPath === "string" && ENTRY_PATH.test(entryPath), `${key} : chemin d'entrée simple`).toBe(true)
    }
    expect(Object.fromEntries(withEntry.map(([key, app]) => [key, (app as WebApplication).entry_path]))).toEqual({ admin_diaspora_ga: "/entrer" })
  })

  it("test du test : la forme du chemin d'entrée refuse requête, fragment, barre finale et segment vide", () => {
    for (const path of ["/entrer", "/admin/entrer"]) expect(ENTRY_PATH.test(path), path).toBe(true)
    for (const path of ["", "/", "entrer", "/entrer/", "/entrer?x=1", "/entrer#x", "//entrer", "/en trer", "/entr%65r", "/entrer\\x"]) expect(ENTRY_PATH.test(path), path).toBe(false)
  })

  it("test du test : une application externe lit aussi les paquets de son dépôt", () => {
    expect(packageDirectoriesOf("apps/antsia_ga")).toEqual(["packages"])
    expect(packageDirectoriesOf("../DIASPORA_GA/apps/diaspora_ga")).toEqual(["packages", "../DIASPORA_GA/packages"])
  })
})
