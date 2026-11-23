/**
 * network-admin-audit (ADR-0042) — CE QU'IL INTERDIT : qu'une mutation de l'administrateur d'un réseau
 * (`networkAdminMutation`, l'application d'administration du réseau) décide sans laisser sa ligne
 * dans le journal des décisions du moteur (`appendAudit`, `convex/modules/platform/audit.ts`) — le
 * pendant d'`operator-audit` pour la console.
 *
 * COMMENT IL LIT : par l'arbre syntaxique — chaque appel `networkAdminMutation({…})` exporté, sous
 * son nom ou sous un alias d'import, doit contenir, dans sa définition même, un appel `appendAudit(`.
 * Une aide intermédiaire ne compte pas : la ligne d'audit se voit à la lecture de la décision. Une
 * exception VÉRIFIÉE se déclare dans `EXCEPTIONS` (`fichier#export`), avec sa raison. Vide.
 */
import ts from "typescript"
import { describe, expect, it } from "vitest"

import { exportedCalls, importedNames } from "./lib/detectors"
import { type Finding, formatFindings, isTestFile, lineOf, listFiles, parseSource, readRepoFile } from "./lib/source-files"

const EXCEPTIONS: Record<string, string> = {}

/** Les mutations de l'administrateur du réseau exportées d'un fichier (alias d'import résolus). */
function networkAdminMutations(file: string, text: string) {
  const source = parseSource(file, text)
  const names = importedNames(source)
  return exportedCalls(source)
    .filter(({ call }) => ts.isIdentifier(call.expression) && (names.get(call.expression.text) ?? call.expression.text) === "networkAdminMutation")
    .map((item) => ({ ...item, source }))
}

function detectUnauditedNetworkAdminMutations(file: string, text: string): Finding[] {
  const findings: Finding[] = []
  for (const { name, node, call, source } of networkAdminMutations(file, text)) {
    if (`${file}#${name}` in EXCEPTIONS) continue
    const calls = new Set<string>()
    const visit = (child: ts.Node): void => {
      if (ts.isCallExpression(child) && ts.isIdentifier(child.expression)) calls.add(child.expression.text)
      ts.forEachChild(child, visit)
    }
    visit(call)
    if (calls.has("appendAudit")) continue
    findings.push({ file, line: lineOf(source, node.getStart(source)), message: `mutation de l'administrateur du réseau « ${name} » sans appendAudit(…)` })
  }
  return findings
}

function networkAdminMutationFiles(): { file: string; text: string }[] {
  return listFiles(["convex"], [".ts"])
    .filter((file) => !isTestFile(file))
    .map((file) => ({ file, text: readRepoFile(file) }))
    .filter(({ text }) => /\bnetworkAdminMutation\b/.test(text))
}

describe("network-admin-audit — toute décision de l'administrateur du réseau laisse sa ligne de journal", () => {
  it("test du test : une décision sans journal est vue, sous son nom comme sous un alias ; un commentaire ne compte pas", () => {
    const fabricated = [
      'import { networkAdminMutation as adminWrite } from "../../lib/functions"',
      "export const silent = networkAdminMutation({ args: {}, handler: async (ctx) => { await ctx.db.patch(id, {}) } })",
      "export const traced = networkAdminMutation({ args: {}, handler: async (ctx) => { await appendAudit(ctx, entry) } })",
      "export const aliased = adminWrite({ args: {}, handler: async (ctx) => { await ctx.db.patch(id, {}) } })",
      'export const commented = networkAdminMutation({ args: {}, handler: async (ctx) => { /* appendAudit(ctx, entry) */ return "appendAudit(" } })',
      "export const reader = networkAdminQuery({ args: {}, handler: async () => null })",
    ].join("\n")
    expect(detectUnauditedNetworkAdminMutations("convex/modules/x/fabricated.ts", fabricated).map((finding) => finding.message)).toEqual([
      "mutation de l'administrateur du réseau « silent » sans appendAudit(…)",
      "mutation de l'administrateur du réseau « aliased » sans appendAudit(…)",
      "mutation de l'administrateur du réseau « commented » sans appendAudit(…)",
    ])
  })

  it("aucune mutation de l'administrateur du réseau ne décide sans journal", () => {
    const findings = networkAdminMutationFiles().flatMap(({ file, text }) => detectUnauditedNetworkAdminMutations(file, text))
    expect(findings, formatFindings(findings)).toEqual([])
  })

  it("pas d'exception morte ; le cliquet voit bien les décisions qu'il garde", () => {
    const declared = new Set(networkAdminMutationFiles().flatMap(({ file, text }) => networkAdminMutations(file, text).map(({ name }) => `${file}#${name}`)))
    expect(Object.keys(EXCEPTIONS).filter((key) => !declared.has(key))).toEqual([])
    // Garde-fou du détecteur : s'il ne trouvait plus rien, il passerait au vert sur un parc nu.
    expect([...declared]).toEqual(expect.arrayContaining(["convex/modules/networks/adminAccess.ts#recordAccess", "convex/modules/networks/features.ts#setFeature"]))
  })
})
