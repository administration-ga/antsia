/**
 * PA4 : les sorties de session SDK passent par une seule porte, qui révoque
 * toutes les sessions et purge uniquement l'état personnel du moteur.
 * Lecture AST des accès directs, crochets constants et destructurations ; les
 * commentaires, noms de types et signOutEverywhere métier ne sont pas des
 * appels SDK. Les expressions calculées à l'exécution ne sont pas résolues.
 */
import { existsSync } from "node:fs"
import { join } from "node:path"
import ts from "typescript"
import { describe, expect, it } from "vitest"

import { type Finding, formatFindings, isTestFile, lineOf, listFiles, moduleSpecifiers, parseSource, readRepoFile, REPO_ROOT, walk } from "./lib/source-files"

const GATE = "packages/api/src/sign-out-everywhere.ts"
const NATIVE_GATE = "packages/social-native/src/sign-out.ts"
const SDK_EXIT_METHODS = new Set(["signOut", "revokeSessions"])
const CONSUMERS = [
  "apps/antsia_ga/src/lib/sign-out.ts",
  "apps/admin_antsia_ga/src/lib/sign-out.ts",
  "../DIASPORALE/apps/diasporale_com/src/data/engine-source.ts",
]

function unwrap(expression: ts.Expression): ts.Expression {
  let current = expression
  while (ts.isParenthesizedExpression(current) || ts.isAsExpression(current) || ts.isTypeAssertionExpression(current) || ts.isNonNullExpression(current) || ts.isSatisfiesExpression(current)) current = current.expression
  return current
}

/** Const lexicale seulement ; un paramètre ou une variable masque l'extérieur. */
function localConstant(identifier: ts.Identifier): ts.Expression | undefined {
  for (let scope: ts.Node | undefined = identifier.parent; scope; scope = scope.parent) {
    if (ts.isBlock(scope) || ts.isSourceFile(scope)) {
      for (const statement of scope.statements) {
        if (!ts.isVariableStatement(statement)) continue
        const declaration = statement.declarationList.declarations.find((item) => ts.isIdentifier(item.name) && item.name.text === identifier.text)
        if (declaration) return statement.declarationList.flags & ts.NodeFlags.Const ? declaration.initializer : undefined
      }
    }
    if (ts.isFunctionLike(scope) && scope.parameters.some((parameter) => ts.isIdentifier(parameter.name) && parameter.name.text === identifier.text)) return undefined
  }
  return undefined
}

function stringConstant(expression: ts.Expression, seen = new Set<ts.Expression>()): string | undefined {
  const current = unwrap(expression)
  if (seen.has(current)) return undefined
  seen.add(current)
  if (ts.isStringLiteralLike(current)) return current.text
  if (ts.isIdentifier(current)) {
    const initializer = localConstant(current)
    return initializer ? stringConstant(initializer, seen) : undefined
  }
  return undefined
}

function propertyName(name: ts.PropertyName): string | undefined {
  if (ts.isIdentifier(name) || ts.isStringLiteralLike(name)) return name.text
  if (ts.isComputedPropertyName(name)) return stringConstant(name.expression)
  return undefined
}

function referencedMethod(node: ts.Node, names: ReadonlySet<string>): string | undefined {
  if (ts.isPropertyAccessExpression(node)) return node.name.text
  if (ts.isElementAccessExpression(node)) return stringConstant(node.argumentExpression)
  if (ts.isBindingElement(node) && ts.isObjectBindingPattern(node.parent)) {
    return node.propertyName ? propertyName(node.propertyName) : ts.isIdentifier(node.name) ? node.name.text : undefined
  }
  if (ts.isCallExpression(node) && ts.isIdentifier(unwrap(node.expression))) {
    const identifier = unwrap(node.expression) as ts.Identifier
    // Seules les commandes surveillées exigent une résolution lexicale.
    // Chercher les déclarations de chaque hook/appel du parc rendait ce scan quadratique.
    if (!names.has(identifier.text)) return undefined
    const initializer = localConstant(identifier)
    // Une commande locale peut s'appeler signOut. Son corps est lui-même
    // parcouru : une méthode SDK utilisée dedans reste détectée.
    if (initializer && (ts.isArrowFunction(unwrap(initializer)) || ts.isFunctionExpression(unwrap(initializer)))) return undefined
    return identifier.text
  }
  return undefined
}

function detectMethods(file: string, text: string, names: ReadonlySet<string>): Finding[] {
  const source = parseSource(file, text)
  const findings: Finding[] = []
  walk(source, (node) => {
    const method = referencedMethod(node, names)
    if (method && names.has(method)) findings.push({ file, line: lineOf(source, node.getStart(source)), message: `accès « ${method} » hors de la porte de déconnexion complète` })
  })
  return findings
}

function detectRawSessionExit(file: string, text: string): Finding[] {
  return file === GATE || file === NATIVE_GATE ? [] : detectMethods(file, text, SDK_EXIT_METHODS)
}

function hasFullNavigation(source: ts.SourceFile): boolean {
  let found = false
  walk(source, (node) => {
    if (!ts.isCallExpression(node)) return
    const call = unwrap(node.expression)
    if (!ts.isPropertyAccessExpression(call) || call.name.text !== "assign") return
    const location = unwrap(call.expression)
    if (ts.isPropertyAccessExpression(location) && location.name.text === "location" && ts.isIdentifier(location.expression) && location.expression.text === "window") found = true
  })
  return found
}

function sharedExitCalled(source: ts.SourceFile): boolean {
  const imports = new Set<string>()
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteralLike(statement.moduleSpecifier)) continue
    if (!["@antsia/api", "@antsia/api/sign-out-everywhere"].includes(statement.moduleSpecifier.text)) continue
    const bindings = statement.importClause?.namedBindings
    if (bindings && ts.isNamedImports(bindings)) {
      for (const element of bindings.elements) if ((element.propertyName ?? element.name).text === "signOutEverywhere") imports.add(element.name.text)
    }
  }
  let called = false
  walk(source, (node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && imports.has(node.expression.text)) called = true
  })
  return called
}

describe("sign-out-everywhere — révocation et sortie complètes par une seule porte", () => {
  it("aucune application ni aucun paquet ne prend directement les méthodes SDK, y compris DIASPORALE", () => {
    const findings: Finding[] = []
    const files = listFiles(["apps", "packages", "../DIASPORALE/apps", "../DIASPORALE/packages"], [".ts", ".tsx", ".js", ".jsx", ".mjs"])
    for (const file of files) {
      if (isTestFile(file) || file.endsWith(".d.ts")) continue
      findings.push(...detectRawSessionExit(file, readRepoFile(file)))
    }
    expect(findings, formatFindings(findings)).toEqual([])
  })

  it("la porte conserve les deux opérations SDK et aucune purge globale du stockage", () => {
    const text = readRepoFile(GATE)
    const methods = detectMethods(GATE, text, SDK_EXIT_METHODS)
    expect(methods.some((finding) => finding.message.includes("signOut"))).toBe(true)
    expect(methods.some((finding) => finding.message.includes("revokeSessions"))).toBe(true)
    const globalPurges = detectMethods(GATE, text, new Set(["clear"]))
    expect(globalPurges, formatFindings(globalPurges)).toEqual([])
  })

  it("le client natif passe par la porte asynchrone et réinitialise ses données sans attendre un document Web", () => {
    const gateText = readRepoFile(NATIVE_GATE)
    const methods = detectMethods(NATIVE_GATE, gateText, SDK_EXIT_METHODS)
    expect(methods.some((finding) => finding.message.includes("signOut"))).toBe(true)
    expect(methods.some((finding) => finding.message.includes("revokeSessions"))).toBe(true)
    expect(gateText).toContain("clearCredentials")
    expect(gateText).toContain("stopResources")
    expect(gateText).not.toMatch(/\b(?:localStorage|sessionStorage|window|document)\s*\./)
    const consumer = readRepoFile("apps/antsia_mobile/src/lib/session-controller.ts")
    expect(moduleSpecifiers(parseSource("native-session-controller.ts", consumer)).some(({ specifier }) => specifier === "@antsia/social-native/sign-out")).toBe(true)
    expect(consumer).toContain("clearCredentials: () => vault.clear()")
    expect(consumer).toContain("setSession(null)")
    expect(consumer).toContain("setTransportKey")
  })

  it.each(CONSUMERS)("%s appelle la porte partagée et termine les caches par navigation complète", (file) => {
    // Le dépôt voisin est un espace de travail externe : l'exécuter lorsqu'il
    // est présent, sans imposer son checkout aux consommateurs du moteur seul.
    if (file.startsWith("../") && !existsSync(join(REPO_ROOT, file))) return
    const source = parseSource(file, readRepoFile(file))
    expect(moduleSpecifiers(source).some(({ specifier }) => ["@antsia/api", "@antsia/api/sign-out-everywhere"].includes(specifier))).toBe(true)
    expect(sharedExitCalled(source)).toBe(true)
    expect(hasFullNavigation(source)).toBe(true)
  })

  it("test du test : appels directs, optionnels et extraction de méthode sont refusés", () => {
    const text = [
      "client.signOut()",
      "client?.revokeSessions?.()",
      'client["signOut"]()',
      "const leave = client.signOut; leave()",
      "const { revokeSessions: revoke } = client; revoke()",
      'const { ["signOut"]: logout } = client; logout()',
      'const method = "revokeSessions"; client[method]()',
      "const { authClient: { signOut: end } } = ports; end()",
      "signOut()",
    ].join("\n")
    expect(detectRawSessionExit("apps/fixture.ts", text).map((finding) => finding.line)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
    expect(detectRawSessionExit(GATE, text)).toEqual([])
  })

  it("test du test : commentaires, types et porte métier ne déclenchent pas un faux positif", () => {
    const text = [
      "// authClient.signOut()",
      'const text = "client.revokeSessions()"',
      "interface Client { signOut(): Promise<void>; revokeSessions(): Promise<void> }",
      "await signOutEverywhere(client)",
      "await actions.signOutEverywhere()",
      "await signOutAndRedirect()",
      "const signOut = async () => actions.signOutEverywhere(); await signOut()",
    ].join("\n")
    expect(detectRawSessionExit("apps/fixture.ts", text)).toEqual([])
  })

  it("test du test : une purge globale ne se cache ni par crochets ni destructuration", () => {
    const text = [
      "localStorage.clear()",
      'sessionStorage["clear"]()',
      "const { clear: purge } = storage; purge()",
      "const purge = storage.clear; purge()",
      "storage.removeItem(key)",
    ].join("\n")
    expect(detectMethods(GATE, text, new Set(["clear"])).map((finding) => finding.line)).toEqual([1, 2, 3, 4])
  })

  it("test du test : une façade vide ou un simple retour SPA ne passent pas pour un raccord", () => {
    const empty = parseSource("apps/fixture.ts", 'import { signOutEverywhere } from "@antsia/api/sign-out-everywhere"; router.push("/entrer")')
    expect(sharedExitCalled(empty)).toBe(false)
    expect(hasFullNavigation(empty)).toBe(false)
    const real = parseSource("apps/fixture.ts", 'import { signOutEverywhere as exit } from "@antsia/api/sign-out-everywhere"; await exit(client); window.location.assign(routes.enter())')
    expect(sharedExitCalled(real)).toBe(true)
    expect(hasFullNavigation(real)).toBe(true)
  })
})
