import ts from "typescript"

import { type Finding, lineOf, parseSource, walk } from "./source-files"

type CronContract = {
  name: string
  kind: "interval" | "daily"
  schedule: Readonly<Record<string, number>>
  target: string
}

/** PA3, owner map §4.2 lot 17 : dix passages, déjà câblés avec leur module. */
export const PA3_CRON_CONTRACTS: readonly CronContract[] = [
  { name: "files-retry-stale-scans", kind: "interval", schedule: { minutes: 5 }, target: "internal.modules.files.mutations.retryStale" },
  { name: "files-purge-infected-blobs", kind: "daily", schedule: { hourUTC: 3, minuteUTC: 15 }, target: "internal.modules.files.mutations.purgeQuarantinedBlobs" },
  { name: "messaging-purge-expired-typing", kind: "interval", schedule: { minutes: 1 }, target: "internal.modules.messaging.typing.purgeExpiredTyping" },
  { name: "groups-purge-expired-typing", kind: "interval", schedule: { minutes: 1 }, target: "internal.modules.groups.typing.purgeExpiredGroupTyping" },
  { name: "stories-purge-expired", kind: "interval", schedule: { minutes: 10 }, target: "internal.modules.stories.stories.purgeExpired" },
  { name: "calls-cleanup-stale", kind: "interval", schedule: { seconds: 30 }, target: "internal.modules.calls.cleanup.cleanupStaleCalls" },
  { name: "calls-presence-cleanup-stale", kind: "interval", schedule: { seconds: 60 }, target: "internal.modules.calls.presence.cleanupStalePresence" },
  { name: "live-reap-stale", kind: "interval", schedule: { seconds: 60 }, target: "internal.modules.live.reap.reapStaleDirects" },
  { name: "live-purge-expired-replays", kind: "interval", schedule: { hours: 1 }, target: "internal.modules.live.replay.purgeExpiredReplays" },
  { name: "live-reconcile-replays", kind: "interval", schedule: { minutes: 15 }, target: "internal.modules.live.replay.reconcileStalePending" },
]

function importedName(source: ts.SourceFile, module: string, exported: string): string | undefined {
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier) || statement.moduleSpecifier.text !== module) continue
    if (statement.importClause?.isTypeOnly) continue
    const bindings = statement.importClause?.namedBindings
    if (!bindings || !ts.isNamedImports(bindings)) continue
    const imported = bindings.elements.find((element) => !element.isTypeOnly && (element.propertyName ?? element.name).text === exported)
    if (imported) return imported.name.text
  }
  return undefined
}

/** Les accès calculés et les références fabriquées ne prouvent pas une cible interne. */
function propertyPath(expression: ts.Expression): string[] | undefined {
  const parts: string[] = []
  let current = expression
  while (ts.isPropertyAccessExpression(current) && !current.questionDotToken) {
    parts.unshift(current.name.text)
    current = current.expression
  }
  if (!ts.isIdentifier(current)) return undefined
  return [current.text, ...parts]
}

function scheduleMatches(expression: ts.Expression | undefined, expected: CronContract["schedule"]): boolean {
  if (!expression || !ts.isObjectLiteralExpression(expression) || expression.properties.length !== Object.keys(expected).length) return false
  const seen = new Set<string>()
  for (const property of expression.properties) {
    if (!ts.isPropertyAssignment(property) || !(ts.isIdentifier(property.name) || ts.isStringLiteral(property.name))) return false
    const name = property.name.text
    if (seen.has(name) || !ts.isNumericLiteral(property.initializer) || Number(property.initializer.text) !== expected[name]) return false
    seen.add(name)
  }
  return Object.keys(expected).every((name) => seen.has(name))
}

/**
 * Registre statique : un `cronJobs()` importé de Convex, exporté par défaut,
 * avec des inscriptions directes au niveau du module. Les dix jobs PA3 doivent
 * garder méthode, cadence, cible et arguments {}. Les extensions DIASPORA.GA ou
 * PA5 restent libres de leur cadence et de leurs arguments ; seuls identifiant
 * ASCII unique et cible interne sont communs. Ce cliquet ne remplace ni les
 * tests des handlers (bornes, chaînes, idempotence), ni le typage Convex.
 */
export function detectCronContractViolations(file: string, text: string): Finding[] {
  const source = parseSource(file, text)
  const findings: Finding[] = []
  const report = (node: ts.Node, message: string) => findings.push({ file, line: lineOf(source, node.getStart(source)), message })
  const factory = importedName(source, "convex/server", "cronJobs")
  const internalBinding = importedName(source, "./_generated/api", "internal")
  const registries = new Set<string>()
  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement) || !(statement.declarationList.flags & ts.NodeFlags.Const)) continue
    for (const declaration of statement.declarationList.declarations) {
      const initializer = declaration.initializer
      if (ts.isIdentifier(declaration.name) && initializer && ts.isCallExpression(initializer) && ts.isIdentifier(initializer.expression) && initializer.expression.text === factory && initializer.arguments.length === 0) {
        registries.add(declaration.name.text)
      }
    }
  }
  if (registries.size !== 1) report(source, "un seul registre cronJobs() importé de convex/server est attendu")
  if (!source.statements.some((statement) => ts.isExportAssignment(statement) && !statement.isExportEquals && ts.isIdentifier(statement.expression) && registries.has(statement.expression.text))) {
    report(source, "le registre des crons doit être exporté par défaut")
  }

  const seenNames = new Map<string, number>()
  const seenTargets = new Set<string>()
  const contracts = new Map(PA3_CRON_CONTRACTS.map((contract) => [contract.name, contract]))
  const protectedTargets = new Set(PA3_CRON_CONTRACTS.map((contract) => contract.target))
  walk(source, (node) => {
    // Un alias ou une aide pourrait inscrire d'autres jobs hors du parcours
    // ci-dessous : le registre reste utilisé directement, sans être transmis.
    if (ts.isIdentifier(node) && registries.has(node.text)) {
      const parent = node.parent
      const declaration = ts.isVariableDeclaration(parent) && parent.name === node
      const exported = ts.isExportAssignment(parent) && parent.expression === node
      const invoked = (ts.isPropertyAccessExpression(parent) || ts.isElementAccessExpression(parent)) && parent.expression === node && ts.isCallExpression(parent.parent) && parent.parent.expression === parent
      const propertyName = (ts.isPropertyAccessExpression(parent) || ts.isPropertyAssignment(parent)) && parent.name === node
      if (!declaration && !exported && !invoked && !propertyName) report(node, "le registre des crons ne doit être ni réassigné, ni transmis à une aide ou un alias")
    }
    if (!ts.isCallExpression(node)) return
    const callee = node.expression
    if (!(ts.isPropertyAccessExpression(callee) || ts.isElementAccessExpression(callee)) || !ts.isIdentifier(callee.expression) || !registries.has(callee.expression.text)) return
    if (!ts.isExpressionStatement(node.parent) || !ts.isSourceFile(node.parent.parent)) report(node, "une inscription de cron doit être directe, au niveau du module")
    const [name, schedule, target, args] = node.arguments
    if (!ts.isPropertyAccessExpression(callee) || callee.questionDotToken) report(node, "la méthode du cron doit être un accès direct")
    if (node.arguments.length !== 4) report(node, "une inscription de cron exige identifiant, cadence, cible et arguments")
    let identifier: string | undefined
    if (!name || !ts.isStringLiteralLike(name) || !name.text.trim() || !/^[\x20-\x7e]+$/.test(name.text)) {
      report(node, "identifiant de cron littéral, ASCII imprimable et non vide attendu")
    } else {
      identifier = name.text
      if (seenNames.has(identifier)) report(node, `identifiant de cron dupliqué « ${identifier} »`)
      seenNames.set(identifier, (seenNames.get(identifier) ?? 0) + 1)
    }
    const path = target ? propertyPath(target) : undefined
    const internalTarget = path && path.length > 1 && internalBinding && path[0] === internalBinding ? ["internal", ...path.slice(1)].join(".") : undefined
    if (!internalTarget) report(node, "la cible du cron doit venir de internal importé de ./_generated/api")
    if (internalTarget && protectedTargets.has(internalTarget)) {
      if (seenTargets.has(internalTarget)) report(node, `cible PA3 inscrite plusieurs fois « ${internalTarget} »`)
      seenTargets.add(internalTarget)
    }
    const contract = identifier ? contracts.get(identifier) : undefined
    if (!contract) return
    if (!ts.isPropertyAccessExpression(callee) || callee.name.text !== contract.kind) report(node, `cron « ${contract.name} » : méthode ${contract.kind} attendue`)
    if (!scheduleMatches(schedule, contract.schedule)) report(node, `cron « ${contract.name} » : cadence ${JSON.stringify(contract.schedule)} attendue`)
    if (internalTarget !== contract.target) report(node, `cron « ${contract.name} » : cible ${contract.target} attendue`)
    if (!args || !ts.isObjectLiteralExpression(args) || args.properties.length !== 0) report(node, `cron « ${contract.name} » : arguments {} attendus`)
  })
  for (const contract of PA3_CRON_CONTRACTS) {
    if (!seenNames.has(contract.name)) report(source, `cron PA3 absent « ${contract.name} »`)
  }
  return findings
}
