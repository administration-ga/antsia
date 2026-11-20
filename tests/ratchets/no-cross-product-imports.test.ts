import { existsSync, readFileSync } from "node:fs"
import { join, resolve } from "node:path"

import ts from "typescript"
import { describe, expect, it } from "vitest"

import { detectCrossProductImports, detectImpureDomainImports } from "./lib/detectors"
import { type Finding, formatFindings, isTestFile, listFiles, readRepoFile, REPO_ROOT, workspaceDirectories } from "./lib/source-files"

const CODE = [".ts", ".tsx", ".mts", ".mjs", ".js", ".cjs"]
const SCANNED = ["convex", "scripts", "tests", ...workspaceDirectories("apps"), ...workspaceDirectories("packages")]

describe("no-cross-product-imports — étanchéité du moteur (règle 4 de duplication)", () => {
  it("aucun import du socle, de gabon-diplomatie, d'un autre dépôt ni d'un _generated étranger", () => {
    const findings: Finding[] = []
    for (const file of listFiles(SCANNED, CODE)) {
      if (file.startsWith("tests/ratchets/")) continue
      findings.push(...detectCrossProductImports(file, readRepoFile(file)))
    }
    expect(findings, formatFindings(findings)).toEqual([])
    // Relit tout le dépôt et les espaces externes : sous charge, plus que les 5 s par défaut.
  }, 60_000)

  it("l'alias @convex/* ne vise que le backend du moteur", () => {
    const findings: string[] = []
    for (const file of listFiles(["."], [".json"]).filter((path) => path.endsWith("tsconfig.json"))) {
      const parsed = ts.parseConfigFileTextToJson(file, readRepoFile(file))
      const paths = (parsed.config?.compilerOptions?.paths ?? {}) as Record<string, string[]>
      for (const target of paths["@convex/*"] ?? []) {
        const absolute = resolve(join(REPO_ROOT, file, ".."), target.replace(/\*$/, ""))
        if (!absolute.startsWith(join(REPO_ROOT, "convex"))) findings.push(`${file} : @convex/* → ${target}`)
      }
    }
    expect(findings).toEqual([])
  })

  it("aucune dépendance de paquet hors du moteur (file:, link:, @workspace/*)", () => {
    const findings: string[] = []
    const manifests = ["package.json", ...[...workspaceDirectories("apps"), ...workspaceDirectories("packages")].map((dir) => `${dir}/package.json`)]
    for (const manifest of manifests.filter((path) => existsSync(join(REPO_ROOT, path)))) {
      const pkg = JSON.parse(readFileSync(join(REPO_ROOT, manifest), "utf8")) as Record<string, Record<string, string> | undefined>
      for (const section of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]) {
        for (const [name, version] of Object.entries(pkg[section] ?? {})) {
          if (name.startsWith("@workspace/")) findings.push(`${manifest} : ${section}.${name}`)
          if (/^(file|link|portal):/.test(version) && !version.includes("../DIASPORA_GA/")) findings.push(`${manifest} : ${section}.${name} = ${version}`)
        }
      }
    }
    expect(findings).toEqual([])
  })

  it("le domaine pur (social-domain) n'importe que ses propres fichiers", () => {
    const findings: Finding[] = []
    for (const file of listFiles(["packages/social-domain/src"], [".ts"])) {
      if (isTestFile(file)) continue
      findings.push(...detectImpureDomainImports(file, readRepoFile(file)))
    }
    expect(findings, formatFindings(findings)).toEqual([])
  })

  it("test du test : le détecteur voit les imports interdits", () => {
    const source = [
      'import { api } from "@workspace/api/hooks"',
      'import type { Doc } from "../../../ADMINISTRATION_GA/socle/convex/_generated/dataModel"',
      'const m = await import("@pro-convex/_generated/api")',
      'import { api as ok } from "@convex/_generated/api"',
      'import { x } from "../../../../convex/_generated/server"',
    ].join("\n")
    const findings = detectCrossProductImports("apps/antsia_ga/src/app/page.tsx", source)
    const lines = findings.map((finding) => finding.line)
    expect(lines).toContain(1)
    expect(lines).toContain(2)
    expect(lines).toContain(3)
    expect(lines).not.toContain(4)
    expect(lines).not.toContain(5)
    expect(detectImpureDomainImports("packages/social-domain/src/x.ts", 'import { v } from "convex/values"')).toHaveLength(1)
  })

  it("test du test : un paquet d'application n'entre que dans sa tranche, et seulement par son domaine pur", () => {
    const domain = 'import { canSponsor } from "@diaspora-ga/domain"'
    expect(detectCrossProductImports("convex/modules/diaspora/sponsorships.ts", domain)).toEqual([])
    expect(detectCrossProductImports("convex/modules/posts/posts.ts", domain)).toHaveLength(1)
    expect(detectCrossProductImports("packages/social-features/src/x.ts", domain)).toHaveLength(1)
    expect(detectCrossProductImports("convex/modules/diaspora/x.ts", 'import { Hub } from "@diaspora-ga/features"')).toHaveLength(1)
    expect(detectCrossProductImports("convex/modules/diaspora/x.ts", 'import { x } from "../../../../DIASPORA_GA/packages/diaspora-ga-domain/src"')).toHaveLength(1)
  })
})
