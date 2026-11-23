/**
 * network-admin-bootstrap-callers (CH-831, ADR-0043 brouillon) — CE QU'IL INTERDIT : qu'une source de
 * production appelle l'amorçage du premier administrateur d'un réseau
 * (`convex/modules/platform/networkAdminBootstrap.ts`, `nameFirst` et `withdraw`). Ces fonctions
 * internes ne se lancent que depuis le terminal du propriétaire (`convex run`, clé de déploiement) :
 * aucune action, aucune tâche planifiée, aucune route HTTP, aucun script ni aucune application du dépôt
 * ne doit pouvoir les atteindre.
 *
 * COMMENT IL LIT : par l'arbre syntaxique de chaque source de `apps/`, `convex/`, `packages/` et
 * `scripts/` (recettes exclues, code généré exclu : `convex/_generated/api.d.ts` nomme tout module).
 * Est un constat : un accès de propriété nommé `networkAdminBootstrap`
 * (`internal.modules.platform.networkAdminBootstrap…`), et toute chaîne qui contient ce nom (accès
 * `x["networkAdminBootstrap"]`, chemin d'import ou d'`import()`, référence de fonction écrite en
 * chaîne). Un commentaire n'est pas un nœud : il ne compte pas. Périmètre : CE dépôt (les applications
 * externes du moteur, comme celles de DIASPORA_GA, ont leurs propres cliquets).
 */
import ts from "typescript"
import { describe, expect, it } from "vitest"

import { type Finding, formatFindings, isTestFile, lineOf, listFiles, parseSource, readRepoFile, walk } from "./lib/source-files"

const MODULE_NAME = "networkAdminBootstrap"
const MODULE_FILE = "convex/modules/platform/networkAdminBootstrap.ts"
const SCANNED_DIRECTORIES = ["apps", "convex", "packages", "scripts"] as const
const SCANNED_EXTENSIONS = [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"] as const

function detectBootstrapReferences(file: string, text: string): Finding[] {
  if (!text.includes(MODULE_NAME)) return []
  const source = parseSource(file, text)
  const findings: Finding[] = []
  walk(source, (node) => {
    const named = ts.isPropertyAccessExpression(node) && node.name.text === MODULE_NAME
    const quoted = (ts.isStringLiteralLike(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) && node.text.includes(MODULE_NAME)
    if (named || quoted) findings.push({ file, line: lineOf(source, node.getStart(source)), message: `référence à l'amorçage du premier administrateur (${MODULE_NAME}) hors de ses recettes` })
  })
  return findings
}

function productionSources(): { file: string; text: string }[] {
  return listFiles(SCANNED_DIRECTORIES, SCANNED_EXTENSIONS)
    .filter((file) => !isTestFile(file) && !file.includes("/_generated/"))
    .map((file) => ({ file, text: readRepoFile(file) }))
    .filter(({ text }) => text.includes(MODULE_NAME))
}

describe("network-admin-bootstrap-callers — aucune source de production n'appelle l'amorçage", () => {
  it("test du test : chaque forme de référence est vue ; un commentaire ou un autre module ne le sont pas", () => {
    const fabricated = [
      `export const relay = internalAction({ args: {}, handler: async (ctx) => { await ctx.runMutation(internal.modules.platform.networkAdminBootstrap.nameFirst, args) } })`,
      `export const later = internalMutation({ args: {}, handler: async (ctx) => { await ctx.scheduler.runAfter(0, internal.modules.platform.networkAdminBootstrap.withdraw, args) } })`,
      `import { nameFirst } from "../platform/networkAdminBootstrap"`,
      `const viaString = internal.modules.platform["networkAdminBootstrap"]`,
      "const lazy = await import(`../platform/networkAdminBootstrap`)",
      `const reference = makeFunctionReference("modules/platform/networkAdminBootstrap:nameFirst")`,
      `// internal.modules.platform.networkAdminBootstrap.nameFirst dans un commentaire`,
      `await ctx.runMutation(internal.modules.platform.networkRoles.setNetworkRole, args)`,
    ].join("\n")
    expect(detectBootstrapReferences("convex/modules/x/fabricated.ts", fabricated).map((finding) => finding.line)).toEqual([1, 2, 3, 4, 5, 6])
  })

  it("aucune source de production (applications, moteur, paquets, scripts) ne référence l'amorçage", () => {
    const findings = productionSources().flatMap(({ file, text }) => detectBootstrapReferences(file, text))
    expect(findings, formatFindings(findings)).toEqual([])
  })

  it("garde-fou : le module existe, et ses recettes, exclues du parc, le référencent sous une forme que le détecteur voit", () => {
    expect(readRepoFile(MODULE_FILE)).toContain("export const nameFirst = internalMutation(")
    for (const recipe of ["convex/modules/platform/networkAdminBootstrap.test.ts", "convex/tests/network-admin-bootstrap-idn.test.ts"]) {
      expect(isTestFile(recipe)).toBe(true)
      expect(detectBootstrapReferences(recipe, readRepoFile(recipe)).length, recipe).toBeGreaterThan(0)
    }
  })
})
