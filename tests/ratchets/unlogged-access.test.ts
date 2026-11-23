/**
 * unlogged-access (revue CH-815 A1b, constat F4) — CE QU'IL INTERDIT : qu'une fonction de la console ou de
 * l'administration d'un réseau passe la garde SANS accès journalisé (`allowUnloggedAccess`, option des
 * constructeurs `operatorQuery` / `operatorMutation` et `networkAdminQuery` / `networkAdminMutation`,
 * `convex/lib/functions.ts`) hors des quatre portes d'entrée : `myOperator` et `recordAccess` de la console,
 * `myNetworkAdmin` et `recordAccess` de l'administration du réseau. Toute autre fonction n'agit qu'après
 * l'écriture de la ligne d'accès au journal.
 *
 * COMMENT IL LIT : par l'arbre syntaxique de chaque fichier de `convex/` (recettes exclues), toute propriété
 * d'objet nommée `allowUnloggedAccess` (écrite, abrégée, entre guillemets ou calculée par une chaîne). Elle
 * n'est admise que comme propriété DIRECTE de l'argument objet d'un appel exporté de la liste, sous la valeur
 * `true`. Une propriété dans une variable intermédiaire, un objet étalé, une aide ou une autre fonction est
 * un constat. Les déclarations de type (`{ allowUnloggedAccess?: true }`) et les lectures (`extra.allowUnloggedAccess`)
 * ne sont pas des propriétés d'objet : elles ne comptent pas.
 */
import ts from "typescript"
import { describe, expect, it } from "vitest"

import { exportedCalls } from "./lib/detectors"
import { type Finding, formatFindings, isTestFile, lineOf, listFiles, parseSource, readRepoFile, walk } from "./lib/source-files"

const OPTION = "allowUnloggedAccess"

/** Les SEULES portes d'entrée sans accès journalisé, `fichier#export`. */
export const ENTRY_DOORS = [
  "convex/modules/networks/adminAccess.ts#myNetworkAdmin",
  "convex/modules/networks/adminAccess.ts#recordAccess",
  "convex/modules/platform/operatorAccess.ts#myOperator",
  "convex/modules/platform/operatorAccess.ts#recordAccess",
] as const

function propertyNameText(name: ts.PropertyName): string | undefined {
  if (ts.isIdentifier(name) || ts.isStringLiteralLike(name)) return name.text
  if (ts.isComputedPropertyName(name) && ts.isStringLiteralLike(name.expression)) return name.expression.text
  return undefined
}

/** Les propriétés d'objet qui portent l'option, où qu'elles soient. */
function optionProperties(source: ts.SourceFile): ts.ObjectLiteralElementLike[] {
  const found: ts.ObjectLiteralElementLike[] = []
  walk(source, (node) => {
    if ((ts.isPropertyAssignment(node) || ts.isMethodDeclaration(node) || ts.isGetAccessorDeclaration(node)) && ts.isObjectLiteralExpression(node.parent) && propertyNameText(node.name) === OPTION) found.push(node)
    if (ts.isShorthandPropertyAssignment(node) && node.name.text === OPTION) found.push(node)
  })
  return found
}

export function detectUnloggedAccess(file: string, text: string): Finding[] {
  if (!text.includes(OPTION)) return []
  const source = parseSource(file, text)
  // Les propriétés admises : `allowUnloggedAccess: true`, directement dans l'argument objet d'une porte de la liste.
  const admitted = new Set<ts.Node>()
  for (const { name, call } of exportedCalls(source)) {
    if (!(ENTRY_DOORS as readonly string[]).includes(`${file}#${name}`)) continue
    const [argument] = call.arguments
    if (!argument || !ts.isObjectLiteralExpression(argument)) continue
    for (const property of argument.properties) {
      if (ts.isPropertyAssignment(property) && propertyNameText(property.name) === OPTION && property.initializer.kind === ts.SyntaxKind.TrueKeyword) admitted.add(property)
    }
  }
  return optionProperties(source)
    .filter((property) => !admitted.has(property))
    .map((property) => ({ file, line: lineOf(source, property.getStart(source)), message: `« ${OPTION} » hors des portes d'entrée de la console et de l'administration du réseau` }))
}

function convexSources(): { file: string; text: string }[] {
  return listFiles(["convex"], [".ts"])
    .filter((file) => !isTestFile(file) && !file.includes("/_generated/"))
    .map((file) => ({ file, text: readRepoFile(file) }))
}

describe("unlogged-access — seules les quatre portes d'entrée passent sans accès journalisé", () => {
  it("test du test : une porte de la liste passe ; tout autre emploi est vu (autre fonction, alias, variable, étalement, abrégé, guillemets)", () => {
    const fabricated = [
      'import { networkAdminQuery as adminRead } from "../../lib/functions"',
      "export const myNetworkAdmin = networkAdminQuery({ allowUnloggedAccess: true, args: {}, handler: async () => null })",
      "export const recordAccess = networkAdminMutation({ allowUnloggedAccess: true, args: {}, handler: async () => null })",
      "export const settings = networkAdminQuery({ allowUnloggedAccess: true, args: {}, handler: async () => null })",
      "export const aliased = adminRead({ allowUnloggedAccess: true, args: {}, handler: async () => null })",
      "const options = { allowUnloggedAccess: true as const }",
      "export const spread = networkAdminQuery({ ...options, args: {}, handler: async () => null })",
      "const allowUnloggedAccess = true as const",
      "export const shorthand = operatorQuery({ allowUnloggedAccess, args: {}, handler: async () => null })",
      'export const quoted = operatorQuery({ "allowUnloggedAccess": true, args: {}, handler: async () => null })',
      'export const computed = operatorQuery({ ["allowUnloggedAccess"]: true, args: {}, handler: async () => null })',
      "type Extra = { allowUnloggedAccess?: true }",
      "function reads(extra: Extra) { return extra.allowUnloggedAccess === true }",
      "// allowUnloggedAccess: true dans un commentaire",
    ].join("\n")
    const findings = detectUnloggedAccess("convex/modules/networks/adminAccess.ts", fabricated)
    expect(findings.map((finding) => finding.line)).toEqual([4, 5, 6, 9, 10, 11])
  })

  it("test du test : une porte de la liste ne vaut que dans SON fichier, et seulement avec `true`", () => {
    const fabricated = [
      "export const myOperator = operatorQuery({ allowUnloggedAccess: true, args: {}, handler: async () => null })",
      "export const recordAccess = operatorMutation({ allowUnloggedAccess: false, args: {}, handler: async () => null })",
    ].join("\n")
    expect(detectUnloggedAccess("convex/modules/platform/operatorAccess.ts", fabricated).map((finding) => finding.line)).toEqual([2])
    expect(detectUnloggedAccess("convex/modules/platform/autre.ts", fabricated).map((finding) => finding.line)).toEqual([1, 2])
  })

  it("aucune fonction du moteur ne passe sans accès journalisé hors des quatre portes d'entrée", () => {
    const findings = convexSources().flatMap(({ file, text }) => detectUnloggedAccess(file, text))
    expect(findings, formatFindings(findings)).toEqual([])
  })

  it("pas de porte morte : chacune des quatre existe et porte bien l'option", () => {
    const declared = new Set<string>()
    for (const { file, text } of convexSources()) {
      if (!text.includes(OPTION)) continue
      const source = parseSource(file, text)
      for (const { name, call } of exportedCalls(source)) {
        const [argument] = call.arguments
        if (argument && ts.isObjectLiteralExpression(argument) && argument.properties.some((property) => ts.isPropertyAssignment(property) && propertyNameText(property.name) === OPTION)) declared.add(`${file}#${name}`)
      }
    }
    expect([...declared].sort()).toEqual([...ENTRY_DOORS].sort())
  })
})
