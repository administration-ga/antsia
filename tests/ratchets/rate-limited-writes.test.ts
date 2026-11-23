/** PA5 : les entrées publiques ne peuvent oublier leur admission de débit. */
import { dirname, posix } from "node:path"

import ts from "typescript"
import { describe, expect, it } from "vitest"

import { exportedCalls } from "./lib/detectors"
import { type Finding, formatFindings, isTestFile, lineOf, listFiles, parseSource, readRepoFile } from "./lib/source-files"

const FUNCTIONS = "convex/lib/functions"
const SERVER = "convex/_generated/server"
const RATE_LIMIT = "convex/lib/rateLimit"
const READ_ONLY_ACTIONS = new Set(["convex/modules/live/livekitActions.ts#checkBroadcastConfiguration"])
const SYSTEM_HTTP_ADMISSIONS = new Map([
  ["convex/modules/federation/http.ts#inbox", "modules.federation.inbox.admit"],
  // PA9C : transfert de consentement d'agent signé ; `redeem` consomme `federation.receive` avant tout effet.
  ["convex/modules/federation/agentConsentTransfer.ts#transfer", "modules.federation.agentConsentTransfer.redeem"],
  // CH-817 : porte des comptes de démonstration, sans session ; chaque route consomme ses seaux
  // (adresse, commun, liste, numéro) dans sa mutation d'admission avant tout autre effet.
  ["convex/modules/platform/demoGateHttp.ts#requestCode", "modules.platform.demoGate.admitRequest"],
  ["convex/modules/platform/demoGateHttp.ts#verifyCode", "modules.platform.demoGate.admitVerify"],
])
/**
 * P16 : portes HTTP de LECTURE seule, nominatives et vérifiées sans effet (ni écriture, ni
 * planification, ni stockage) : le proxy des médias de catalogue (P09) rejoue ses gardes à
 * chaque GET et ne consomme aucun budget d'écriture. Toute autre action HTTP garde son
 * admission système nominative.
 */
const READ_ONLY_HTTP_ACTIONS = new Set(["convex/modules/federation/commerceCatalogMediaHttp.ts#media"])
const PUBLIC_WRITES = new Set(["mutation", "action", "authMutation", "authAction", "httpAction", "networkMutation", "personMutation", "operatorMutation", "networkAdminMutation", "networkAction"])
const GUARDED_MUTATIONS = new Set(["networkMutation", "personMutation", "operatorMutation", "networkAdminMutation"])
const EFFECTS = new Set(["insert", "patch", "replace", "delete", "store", "generateUploadUrl", "runMutation", "runAction", "runAfter", "runAt"])

type Binding = { name: string; module: string; mutable?: boolean }

/** Résout l'origine réelle, pas seulement un nom exporté homonyme. */
function bindingsOf(file: string, source: ts.SourceFile): Map<string, Binding> {
  const bindings = new Map<string, Binding>()
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue
    const specifier = statement.moduleSpecifier.text
    const module = specifier.startsWith(".") ? posix.normalize(posix.join(dirname(file), specifier)).replace(/\.[cm]?[jt]s$/, "") : specifier
    const imports = statement.importClause?.namedBindings
    if (imports && ts.isNamedImports(imports)) {
      for (const item of imports.elements) bindings.set(item.name.text, { name: item.propertyName?.text ?? item.name.text, module })
    } else if (imports && ts.isNamespaceImport(imports)) {
      bindings.set(imports.name.text, { name: "*", module })
    }
  }
  // Alias locaux du constructeur/de la garde ; une chaîne cyclique ne se résout pas.
  for (let pass = 0; pass < source.statements.length; pass++) {
    let changed = false
    for (const statement of source.statements) {
      if (!ts.isVariableStatement(statement)) continue
      for (const item of statement.declarationList.declarations) {
        if (!ts.isIdentifier(item.name) || !item.initializer || bindings.has(item.name.text)) continue
        const resolved = bindingOf(item.initializer, bindings)
        if (resolved) {
          bindings.set(item.name.text, { ...resolved, mutable: resolved.mutable || !(statement.declarationList.flags & ts.NodeFlags.Const) })
          changed = true
        }
      }
    }
    if (!changed) break
  }
  return bindings
}

function bindingOf(expression: ts.Expression, bindings: ReadonlyMap<string, Binding>): Binding | undefined {
  if (ts.isIdentifier(expression)) return bindings.get(expression.text)
  const base = ts.isPropertyAccessExpression(expression) || ts.isElementAccessExpression(expression) ? expression.expression : undefined
  const name = ts.isPropertyAccessExpression(expression) ? expression.name.text : ts.isElementAccessExpression(expression) && expression.argumentExpression && ts.isStringLiteral(expression.argumentExpression) ? expression.argumentExpression.text : undefined
  if (base && ts.isIdentifier(base) && name) {
    const binding = bindings.get(base.text)
    if (binding?.name === "*" || binding?.module === "convex/values" && binding.name === "v") return { name, module: binding.module, mutable: binding.mutable }
  }
  return undefined
}

function property(object: ts.Expression | undefined, name: string): ts.Expression | undefined {
  if (!object || !ts.isObjectLiteralExpression(object)) return undefined
  const item = object.properties.find((entry) => ts.isPropertyAssignment(entry) && entry.name.getText().replace(/["']/g, "") === name)
  return item && ts.isPropertyAssignment(item) ? item.initializer : undefined
}

function handlerOf(config: ts.Expression | undefined): ts.ArrowFunction | ts.FunctionExpression | undefined {
  const handler = property(config, "handler")
  return handler && (ts.isArrowFunction(handler) || ts.isFunctionExpression(handler)) ? handler : undefined
}

function awaitCall(statement: ts.Statement): ts.CallExpression | undefined {
  const expression = ts.isExpressionStatement(statement) ? statement.expression : ts.isVariableStatement(statement) ? statement.declarationList.declarations[0]?.initializer : undefined
  return expression && ts.isAwaitExpression(expression) && ts.isCallExpression(expression.expression) ? expression.expression : undefined
}

function effectIn(node: ts.Node, allowRunAction = false): boolean {
  let effect = false
  const visit = (item: ts.Node): void => {
    if (item !== node && (ts.isFunctionDeclaration(item) || ts.isArrowFunction(item) || ts.isFunctionExpression(item))) return
    if (ts.isCallExpression(item)) {
      const callee = item.expression
      const name = ts.isPropertyAccessExpression(callee) ? callee.name.text : ts.isElementAccessExpression(callee) && callee.argumentExpression && ts.isStringLiteral(callee.argumentExpression) ? callee.argumentExpression.text : undefined
      if (name && EFFECTS.has(name) && !(allowRunAction && name === "runAction")) effect = true
    }
    ts.forEachChild(item, visit)
  }
  visit(node)
  return effect
}

/** Les clés viennent de requirePerson/getActiveIdentity ou d'un helper local authentifié. */
function serverKeyVariables(handler: ts.ArrowFunction | ts.FunctionExpression, source: ts.SourceFile, bindings: ReadonlyMap<string, Binding>): Set<string> {
  const variables = new Set<string>()
  if (!ts.isBlock(handler.body)) return variables
  const authenticated = (call: ts.CallExpression): boolean => {
    const binding = bindingOf(call.expression, bindings)
    if (binding?.mutable) return false
    if (binding?.name === "getActiveIdentity" && binding.module === "convex/lib/session") return true
    if (binding?.name === "requirePerson" && binding.module === "convex/lib/access") return true
    // L'aide activePerson de PA4 est locale ; sa session doit elle-même être réelle.
    if (!ts.isIdentifier(call.expression)) return false
    const helper = source.statements.find((item) => ts.isFunctionDeclaration(item) && item.name?.text === call.expression.getText())
    if (!helper || !ts.isFunctionDeclaration(helper) || !helper.body || effectIn(helper.body)) return false
    return helper.body.statements.some((statement) => {
      const awaited = awaitCall(statement)
      const origin = awaited ? bindingOf(awaited.expression, bindings) : undefined
      return origin?.name === "getActiveIdentity" && origin.module === "convex/lib/session"
    })
  }
  for (const statement of handler.body.statements) {
    if (!ts.isVariableStatement(statement)) continue
    for (const declaration of statement.declarationList.declarations) {
      const value = declaration.initializer
      if (!value || !ts.isAwaitExpression(value) || !ts.isCallExpression(value.expression) || !authenticated(value.expression)) continue
      if (ts.isIdentifier(declaration.name)) variables.add(declaration.name.text)
      else if (ts.isObjectBindingPattern(declaration.name)) {
        for (const element of declaration.name.elements) if (ts.isIdentifier(element.name)) variables.add(element.name.text)
      }
    }
  }
  return variables
}

function hasExplicitBudget(handler: ts.ArrowFunction | ts.FunctionExpression | undefined, source: ts.SourceFile, bindings: ReadonlyMap<string, Binding>): boolean {
  if (!handler || !ts.isBlock(handler.body)) return false
  const context = handler.parameters[0]?.name
  if (!context || !ts.isIdentifier(context)) return false
  const serverVariables = serverKeyVariables(handler, source, bindings)
  for (const statement of handler.body.statements) {
    const call = awaitCall(statement)
    const binding = call ? bindingOf(call.expression, bindings) : undefined
    if (call && binding?.name === "enforceRateLimit" && binding.module === RATE_LIMIT && !binding.mutable) {
      const [ctx, bucket, key] = call.arguments
      return !!ctx && ts.isIdentifier(ctx) && ctx.text === context.text && !!bucket && ts.isStringLiteral(bucket) &&
        ["person.write", "person.bootstrap"].includes(bucket.text) && !!key && ts.isPropertyAccessExpression(key) &&
        ts.isIdentifier(key.expression) && serverVariables.has(key.expression.text) && ["_id", "subject"].includes(key.name.text)
    }
    // Le quota doit dominer l'effet ; un quota dans un try/catch, une branche
    // conditionnelle ou une fonction imbriquée ne compte jamais.
    if (effectIn(statement)) return false
  }
  return false
}

function internalReference(expression: ts.Expression | undefined, bindings: ReadonlyMap<string, Binding>): string | undefined {
  if (!expression) return undefined
  if (ts.isIdentifier(expression)) {
    const binding = bindings.get(expression.text)
    return binding?.module === "convex/_generated/api" && binding.name === "internal" ? "" : undefined
  }
  const base = ts.isPropertyAccessExpression(expression) || ts.isElementAccessExpression(expression) ? expression.expression : undefined
  const name = ts.isPropertyAccessExpression(expression) ? expression.name.text : ts.isElementAccessExpression(expression) && expression.argumentExpression && ts.isStringLiteral(expression.argumentExpression) ? expression.argumentExpression.text : undefined
  const parent = base ? internalReference(base, bindings) : undefined
  return parent !== undefined && name ? `${parent ? `${parent}.` : ""}${name}` : undefined
}

function hasSystemAdmission(handler: ts.Expression | undefined, reference: string, bindings: ReadonlyMap<string, Binding>): boolean {
  if (!handler || (!ts.isArrowFunction(handler) && !ts.isFunctionExpression(handler)) || !ts.isBlock(handler.body)) return false
  const context = handler.parameters[0]?.name
  if (!context || !ts.isIdentifier(context)) return false
  const terminal = (statement: ts.Statement): boolean => {
    if (ts.isReturnStatement(statement) || ts.isThrowStatement(statement)) return true
    if (ts.isBlock(statement)) return statement.statements.some(terminal)
    return ts.isIfStatement(statement) && !!statement.elseStatement && terminal(statement.thenStatement) && terminal(statement.elseStatement)
  }
  const admittedIn = (statements: readonly ts.Statement[]): boolean => {
    for (const statement of statements) {
      const call = awaitCall(statement)
      if (call && ts.isPropertyAccessExpression(call.expression) && ts.isIdentifier(call.expression.expression) && call.expression.expression.text === context.text && call.expression.name.text === "runMutation" && internalReference(call.arguments[0], bindings) === reference) return true
      if (ts.isTryStatement(statement) && statement.catchClause && !statement.finallyBlock && !effectIn(statement.catchClause.block) && statement.catchClause.block.statements.some(terminal) && admittedIn(statement.tryBlock.statements)) return true
      // Les contrôles cryptographiques peuvent être des actions internes, mais
      // aucune écriture/planification ne doit précéder l'admission signée.
      if (effectIn(statement, true)) return false
    }
    return false
  }
  return admittedIn(handler.body.statements)
}

export function detectUnmeteredWrites(file: string, text: string): Finding[] {
  const source = parseSource(file, text)
  const bindings = bindingsOf(file, source)
  const findings: Finding[] = []
  const report = (node: ts.Node, message: string) => findings.push({ file, line: lineOf(source, node.getStart(source)), message })
  const exported = exportedCalls(source)
  for (const statement of source.statements) {
    if (ts.isExportAssignment(statement) && ts.isCallExpression(statement.expression)) exported.push({ name: "default", node: statement, statement, call: statement.expression })
  }
  for (const { name, node, call } of exported) {
    const binding = bindingOf(call.expression, bindings)
    const builder = binding?.name ?? (ts.isIdentifier(call.expression) ? call.expression.text : ts.isPropertyAccessExpression(call.expression) ? call.expression.name.text : ts.isElementAccessExpression(call.expression) && call.expression.argumentExpression && ts.isStringLiteral(call.expression.argumentExpression) ? call.expression.argumentExpression.text : "")
    if (!PUBLIC_WRITES.has(builder)) {
      const expectedModules: Record<string, string> = {
        query: SERVER, internalQuery: SERVER, internalMutation: SERVER, internalAction: SERVER,
        networkQuery: FUNCTIONS, personQuery: FUNCTIONS, operatorQuery: FUNCTIONS, networkAdminQuery: FUNCTIONS,
        literals: "convex/lib/validators", makeFunctionReference: "convex/server",
      }
      // Aucun constructeur indirect inconnu dans un module social : une aide
      // opaque pourrait sinon fabriquer une mutation que l'AST ne classe pas.
      if (file.startsWith("convex/modules/") && binding?.module !== "convex/values" && (!expectedModules[builder] || binding?.module !== expectedModules[builder])) report(node, `${name} : fabrique publique inconnue, classer sa porte d'admission`)
      continue
    }
    if (binding?.mutable) { report(node, `${name} : alias mutable du constructeur public`); continue }
    const config = call.arguments[0]
    if (builder === "httpAction") {
      if (READ_ONLY_HTTP_ACTIONS.has(`${file}#${name}`)) {
        const readOnly = binding?.module === SERVER && config !== undefined && (ts.isArrowFunction(config) || ts.isFunctionExpression(config)) && !effectIn(config)
        if (!readOnly) report(node, `${name} : lecture HTTP déclarée mais porteuse d'effets ou de provenance inconnue`)
        continue
      }
      const reference = SYSTEM_HTTP_ADMISSIONS.get(`${file}#${name}`)
      if (binding?.module !== SERVER || !reference || !hasSystemAdmission(config, reference, bindings)) report(node, `${name} : action HTTP sans admission système nominative attendue`)
      continue
    }
    if (!config || !ts.isObjectLiteralExpression(config) || config.properties.some(ts.isSpreadAssignment)) {
      report(node, `${name} : configuration publique opaque, admission non vérifiable`)
      continue
    }
    if (GUARDED_MUTATIONS.has(builder)) {
      if (binding?.module !== FUNCTIONS) report(node, `${name} : constructeur ${builder} sans provenance moteur`)
      continue
    }
    if (builder === "networkAction") {
      if (binding?.module !== FUNCTIONS) { report(node, `${name} : constructeur networkAction sans provenance moteur`); continue }
      const readOnly = property(config, "readOnly")
      if (readOnly && (readOnly.kind !== ts.SyntaxKind.TrueKeyword || !READ_ONLY_ACTIONS.has(`${file}#${name}`) || effectIn(handlerOf(config)?.body ?? config))) {
        report(node, `${name} : dispense d'action non nominative ou porteuse d'effets`)
      }
      continue
    }
    if (binding?.module !== SERVER || builder !== "mutation" || !hasExplicitBudget(handlerOf(config), source, bindings)) {
      report(node, `${name} : écriture publique sans constructeur gardé ni budget explicite attendu et clé serveur`)
    }
  }
  // Un nouveau customMutation/customAction ailleurs pourrait fabriquer un
  // constructeur non classé, donc échapper à l'inventaire des exports.
  if (file !== `${FUNCTIONS}.ts`) {
    const visit = (node: ts.Node): void => {
      if (ts.isCallExpression(node)) {
        const binding = bindingOf(node.expression, bindings)
        if (binding && ["customMutation", "customAction"].includes(binding.name) && binding.module === "convex-helpers/server/customFunctions") {
          report(node, "constructeur public personnalisé hors de la porte commune")
        }
      }
      ts.forEachChild(node, visit)
    }
    visit(source)
  }
  return findings
}

/** La confiance dans un constructeur exige la présence de sa garde réelle. */
function gateSequence(file: string, name: string, configArgument = 1): string[] {
  const source = parseSource(file, readRepoFile(file))
  const bindings = bindingsOf(file, source)
  const declaration = exportedCalls(source).find((item) => item.name === name)
  const handler = property(declaration?.call.arguments[configArgument], "input") ?? property(declaration?.call.arguments[configArgument], "handler")
  if (!handler || (!ts.isArrowFunction(handler) && !ts.isFunctionExpression(handler)) || !ts.isBlock(handler.body)) return []
  return handler.body.statements.flatMap((statement) => {
    const call = awaitCall(statement)
    if (!call) return []
    const binding = bindingOf(call.expression, bindings)
    if (!binding) return []
    const bucket = call.arguments[1]
    return [`${binding.module}#${binding.name}${binding.name === "enforceRateLimit" && bucket && ts.isStringLiteral(bucket) ? `:${bucket.text}` : ""}`]
  })
}

describe("rate-limited-writes — admission obligatoire de toute entrée publique d'écriture", () => {
  it("toutes les mutations/actions publiques du moteur passent la porte", () => {
    const findings = listFiles(["convex"], [".ts"]).filter((file) => !isTestFile(file) && !file.endsWith(".setup.ts")).flatMap((file) => detectUnmeteredWrites(file, readRepoFile(file)))
    expect(findings, formatFindings(findings)).toEqual([])
  })

  it("les constructeurs vérifient l'identité/éligibilité avant leur quota commun", () => {
    expect(gateSequence(`${FUNCTIONS}.ts`, "networkMutation").slice(0, 3)).toEqual([
      "convex/lib/access#requireMembership", "convex/modules/moderation/policy#assertSocialWriteAllowed", `${RATE_LIMIT}#enforceRateLimit:social.write`,
    ])
    expect(gateSequence(`${FUNCTIONS}.ts`, "personMutation")).toEqual(["convex/lib/access#requirePerson", `${RATE_LIMIT}#enforceRateLimit:person.write`])
    expect(gateSequence(`${FUNCTIONS}.ts`, "operatorMutation")).toContain(`${RATE_LIMIT}#enforceRateLimit:operator.write`)
    // ADR-0042 : adhésion, rôle, preuve et journal AVANT la garde d'écriture et les deux budgets obligatoires.
    expect(gateSequence(`${FUNCTIONS}.ts`, "networkAdminMutation").slice(0, 5)).toEqual([
      "convex/lib/access#requireMembership", "convex/lib/networkAdminIdentity#requireNetworkAdminSession", "convex/modules/moderation/policy#assertSocialWriteAllowed",
      `${RATE_LIMIT}#enforceRateLimit:social.write`, `${RATE_LIMIT}#enforceRateLimit:network_admin.write`,
    ])
    expect(gateSequence("convex/lib/actionAccess.ts", "admitActionWrite", 0).slice(0, 4)).toEqual([
      "convex/lib/access#requireMembership", "convex/modules/moderation/policy#assertSocialWriteAllowed", `${RATE_LIMIT}#enforceRateLimit:social.write`, `${RATE_LIMIT}#enforceRateLimit:action.write`,
    ])
  })

  it("l'action appelle réellement l'admission transactionnelle et sa dispense reste nominative", () => {
    const source = parseSource(`${FUNCTIONS}.ts`, readRepoFile(`${FUNCTIONS}.ts`))
    const action = exportedCalls(source).find((item) => item.name === "networkAction")
    const input = property(action?.call.arguments[1], "input")
    const admissionCalls: ts.CallExpression[] = []
    const visit = (node: ts.Node): void => {
      if (ts.isAwaitExpression(node) && ts.isCallExpression(node.expression) && ts.isPropertyAccessExpression(node.expression.expression) && node.expression.expression.name.text === "runMutation") admissionCalls.push(node.expression)
      ts.forEachChild(node, visit)
    }
    if (input) visit(input)
    expect(admissionCalls.some((call) => call.arguments[0]?.getText(source) === "admitActionWrite")).toBe(true)
    expect(readRepoFile(`${FUNCTIONS}.ts`)).toContain('>("lib/actionAccess:admitActionWrite")')
    const declared = listFiles(["convex/modules"], [".ts"]).filter((file) => !isTestFile(file)).flatMap((file) => {
      const parsed = parseSource(file, readRepoFile(file))
      return exportedCalls(parsed).filter(({ call }) => property(call.arguments[0], "readOnly")?.kind === ts.SyntaxKind.TrueKeyword).map(({ name }) => `${file}#${name}`)
    })
    expect(declared.sort()).toEqual([...READ_ONLY_ACTIONS].sort())
  })

  it("CH-817 : les deux routes de la porte des comptes de démonstration attendent leur admission avant tout effet", () => {
    const file = "convex/modules/platform/demoGateHttp.ts"
    const text = readRepoFile(file)
    expect(detectUnmeteredWrites(file, text)).toEqual([])
    // Une écriture avant l'admission de la demande, ou une vérification admise par une autre mutation : refusées.
    const early = text.replace("const accepted: DemoGateRequestAccepted", "await ctx.runMutation(internal.modules.platform.demoGate.markDeliveryFailed, { challengeId }); const accepted: DemoGateRequestAccepted")
    expect(early).not.toBe(text)
    expect(detectUnmeteredWrites(file, early)).toHaveLength(1)
    const other = text.replace("demoGate.admitVerify, {", "demoGate.completeVerify, {")
    expect(other).not.toBe(text)
    expect(detectUnmeteredWrites(file, other)).toHaveLength(1)
    // Les mutations d'admission consomment leurs seaux nommés.
    const store = readRepoFile("convex/modules/platform/demoGate.ts")
    for (const bucket of ["demoGate.request.ip", "demoGate.request.global", "demoGate.request.phone", "demoGate.request.phone.daily", "demoGate.verify.ip", "demoGate.verify.global"]) expect(store).toContain(`"${bucket}"`)
  })

  it("l'inbox système consomme son budget avant les effets et sa porte HTTP attend l'admission", () => {
    expect(gateSequence("convex/modules/federation/inbox.ts", "admit", 0)).toContain(`${RATE_LIMIT}#enforceRateLimit:federation.receive`)
    const source = 'import { httpAction } from "../../_generated/server"; import { internal as backend } from "../../_generated/api"; export const inbox = httpAction(async (ctx, request) => { await ctx.runMutation(backend.modules.federation.inbox.admit, {}); return new Response() })'
    expect(detectUnmeteredWrites("convex/modules/federation/http.ts", source)).toEqual([])
    expect(detectUnmeteredWrites("convex/modules/federation/http.ts", source.replace('await ctx.runMutation', 'ctx.runMutation'))).toHaveLength(1)
    expect(detectUnmeteredWrites("convex/modules/federation/http.ts", source.replace('await ctx.runMutation', 'await ctx.storage.store(blob); await ctx.runMutation'))).toHaveLength(1)
    expect(detectUnmeteredWrites("convex/modules/federation/http.ts", source.replace('"../../_generated/api"', '"../../fake"'))).toHaveLength(1)
    const guardedTry = source.replace('await ctx.runMutation(backend.modules.federation.inbox.admit, {}); return new Response()', 'try { await ctx.runMutation(backend.modules.federation.inbox.admit, {}); return new Response() } catch (error) { if (error) return new Response(null, { status: 429 }); return new Response(null, { status: 503 }) }')
    expect(detectUnmeteredWrites("convex/modules/federation/http.ts", guardedTry)).toEqual([])
    expect(detectUnmeteredWrites("convex/modules/federation/http.ts", guardedTry.replace('if (error) return new Response(null, { status: 429 }); return new Response(null, { status: 503 })', 'await ctx.storage.store(blob); return new Response()'))).toHaveLength(1)
    expect(detectUnmeteredWrites("convex/modules/federation/http.ts", guardedTry.replace('if (error) return new Response(null, { status: 429 }); return new Response(null, { status: 503 })', 'const continued = true'))).toHaveLength(1)
  })

  it("P16 : une lecture HTTP nominative passe sans effet ; une écriture, un autre nom ou une autre provenance sont refusés", () => {
    const file = "convex/modules/federation/commerceCatalogMediaHttp.ts"
    const source = 'import { httpAction } from "../../_generated/server"; export const media = httpAction(async (ctx, request) => { const asset = await ctx.runQuery(gate, { token: request.url }); const blob = await ctx.storage.get(asset.storageId); return new Response(blob) })'
    expect(detectUnmeteredWrites(file, source)).toEqual([])
    expect(detectUnmeteredWrites(file, source.replace("const blob = await ctx.storage.get(asset.storageId)", "const blob = await ctx.storage.store(asset)"))).toHaveLength(1)
    expect(detectUnmeteredWrites(file, source.replace("const asset = await ctx.runQuery(gate", "const asset = await ctx.runMutation(gate"))).toHaveLength(1)
    expect(detectUnmeteredWrites(file, source.replace("return new Response(blob)", "await ctx.scheduler.runAfter(0, gate, {}); return new Response(blob)"))).toHaveLength(1)
    expect(detectUnmeteredWrites(file, source.replace("export const media", "export const other"))).toHaveLength(1)
    expect(detectUnmeteredWrites(file, source.replace('"../../_generated/server"', '"../../fake"'))).toHaveLength(1)
    expect(detectUnmeteredWrites("convex/modules/federation/other.ts", source)).toHaveLength(1)
  })

  it("alias, namespaces et exports séparés gardent la provenance", () => {
    const source = [
      'import { networkMutation as write } from "../../lib/functions"',
      'import * as f from "../../lib/functions"',
      'const local = write({ args: {}, handler: async () => null })',
      'export { local as separate }',
      'const alias = write',
      'export const aliased = alias({ args: {}, handler: async () => null })',
      'export const namespaced = f.networkMutation({ args: {}, handler: async () => null })',
      'export const copied = local',
    ].join("\n")
    expect(detectUnmeteredWrites("convex/modules/posts/fixture.ts", source)).toEqual([])
    expect(detectUnmeteredWrites("convex/modules/posts/fixture.ts", source.replaceAll('"../../lib/functions"', '"../../fake"'))).toHaveLength(4)
    expect(detectUnmeteredWrites("convex/modules/posts/fixture.ts", 'import { networkMutation } from "../../lib/functions"; let alias = networkMutation; export const unsafe = alias({ args: {}, handler: async () => null })')).toHaveLength(1)
    expect(detectUnmeteredWrites("convex/modules/posts/fixture.ts", 'import { factory } from "./opaque"; export const unsafe = factory({ args: {}, handler: async () => null })')).toHaveLength(1)
    expect(detectUnmeteredWrites("convex/modules/posts/fixture.ts", 'import { mutation } from "../../_generated/server"; export default mutation({ args: {}, handler: async () => null })')).toHaveLength(1)
  })

  it("une mutation raw doit attendre son budget, avec une identité serveur", () => {
    const imports = 'import { mutation as write } from "../../_generated/server"; import { enforceRateLimit as limit } from "../../lib/rateLimit"; import { requirePerson } from "../../lib/access";'
    const guarded = 'const person = await requirePerson(ctx); await limit(ctx, "person.write", person._id); await ctx.db.patch(person._id, {}); return null'
    const fixture = (body: string) => `${imports} export const mine = write({ args: {}, handler: async (ctx, args) => { ${body} } })`
    expect(detectUnmeteredWrites("convex/modules/people/fixture.ts", fixture(guarded))).toEqual([])
    for (const body of [
      guarded.replace('await limit', 'limit'),
      guarded.replace('await limit(ctx, "person.write", person._id)', '/* await limit(ctx, "person.write", person._id) */'),
      guarded.replace('await limit(ctx, "person.write", person._id)', 'const skipped = async () => { await limit(ctx, "person.write", person._id) }'),
      guarded.replace('await limit(ctx, "person.write", person._id)', 'if (args.optional) await limit(ctx, "person.write", person._id)'),
      guarded.replace('await limit(ctx, "person.write", person._id)', 'try { await limit(ctx, "person.write", person._id) } catch {}'),
      guarded.replace('person._id); await ctx.db.patch', 'args.personId); await ctx.db.patch'),
      guarded.replace('const person = await requirePerson(ctx)', 'const person = args.person'),
      'await ctx.db.patch(id, {}); ' + guarded,
    ]) expect(detectUnmeteredWrites("convex/modules/people/fixture.ts", fixture(body))).toHaveLength(1)
    expect(detectUnmeteredWrites("convex/modules/people/fixture.ts", fixture(guarded).replace('"../../lib/rateLimit"', '"../../fake"'))).toHaveLength(1)
  })

  it("une dispense d'action forgée ou porteuse de stockage est refusée", () => {
    const fixture = (name: string, body: string) => `import { networkAction } from "../../lib/functions"; export const ${name} = networkAction({ readOnly: true, args: {}, handler: async (ctx) => { ${body} } })`
    expect(detectUnmeteredWrites("convex/modules/live/livekitActions.ts", fixture("checkBroadcastConfiguration", "return null"))).toEqual([])
    expect(detectUnmeteredWrites("convex/modules/live/livekitActions.ts", fixture("other", "return null"))).toHaveLength(1)
    expect(detectUnmeteredWrites("convex/modules/live/livekitActions.ts", fixture("checkBroadcastConfiguration", 'await ctx["storage"]["store"](blob)'))).toHaveLength(1)
    expect(detectUnmeteredWrites("convex/modules/live/livekitActions.ts", fixture("other", "return null").replace('readOnly: true', 'readOnly: args.value'))).toHaveLength(1)
  })
})
