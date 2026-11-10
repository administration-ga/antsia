/**
 * Lecteurs communs des cliquets `contextual-registry` et `contextual-hooks` (CC-2b, ADR-0025) :
 * le registre des résolveurs et la liste des natures en attente, relus par l'arbre syntaxique.
 */
import ts from "typescript"

import { lineOf, parseSource } from "./source-files"

export type RegistryEntry = { kind: string; value: "null" | "resolver" | "other"; line: number }

function variableInitializer(source: ts.SourceFile, name: string): ts.Expression | undefined {
  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement)) continue
    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name) && declaration.name.text === name) return declaration.initializer
    }
  }
  return undefined
}

function unwrap(expression: ts.Expression | undefined): ts.Expression | undefined {
  let current = expression
  while (current && (ts.isAsExpression(current) || ts.isSatisfiesExpression(current) || ts.isParenthesizedExpression(current))) current = current.expression
  return current
}

/** L'initialiseur d'une déclaration de haut niveau, débarrassé de ses `as` / `satisfies`. */
export function topLevelInitializer(source: ts.SourceFile, name: string): ts.Expression | undefined {
  return unwrap(variableInitializer(source, name))
}

/** Les entrées du registre : `null` ou résolveur nommé de la tranche expressément admise pour cette nature. */
export function registryEntries(file: string, text: string): RegistryEntry[] {
  const source = parseSource(file, text)
  const literal = topLevelInitializer(source, "CONTEXTUAL_REGISTRY")
  if (!literal || !ts.isObjectLiteralExpression(literal)) return []
  const owners: Readonly<Record<string, string>> = { diasporaServiceRequest: "DIASPORA_CONVERSATION_CONTEXTS", diasporaMentoring: "DIASPORA_CONVERSATION_CONTEXTS", diasporaJobApplication: "DIASPORA_CONVERSATION_CONTEXTS", professionalCollaboration: "PROFESSIONAL_CONVERSATION_CONTEXTS" }
  return literal.properties.flatMap((property): RegistryEntry[] => {
    if (!ts.isPropertyAssignment(property)) return [{ kind: "<opaque>", value: "other", line: lineOf(source, property.getStart(source)) }]
    const kind = property.name.getText(source).replace(/["']/g, "")
    const value = property.initializer
    const resolved = value.kind === ts.SyntaxKind.NullKeyword
      ? ("null" as const)
      : ts.isPropertyAccessExpression(value) && ts.isIdentifier(value.expression) && value.expression.text === owners[kind] && value.name.text === kind
        ? ("resolver" as const)
        : ("other" as const)
    return [{ kind, value: resolved, line: lineOf(source, property.getStart(source)) }]
  })
}

/** Les natures déclarées en attente (`CONTEXTUAL_PENDING_KINDS`), ou `null` si la liste n'est pas littérale. */
export function pendingKinds(file: string, text: string): string[] | null {
  const source = parseSource(file, text)
  const literal = topLevelInitializer(source, "CONTEXTUAL_PENDING_KINDS")
  if (!literal || !ts.isArrayLiteralExpression(literal)) return null
  return literal.elements.flatMap((element) => (ts.isStringLiteral(element) ? [element.text] : ["<opaque>"]))
}
