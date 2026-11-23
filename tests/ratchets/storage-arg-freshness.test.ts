// Dupliqué de socle/convex/tests/storageArgFreshnessRatchet.test.ts @ ad2e7fdc2 — adaptations : constructeurs publics du moteur (`networkMutation`, `personMutation`, `operatorMutation`, `networkAdminMutation`, `mutation`, `action`, `networkAction`) ; gardes `assertFreshUpload` et `admitPosedUploads` (ni `admitPosedImages`, ni preuve de reprise FP) ; aucune exception ; analyseur sur des sources injectables, pour un « test du test » sur sources fabriquées.
/**
 * storage-arg-freshness — CE QU'IL INTERDIT : qu'une fonction PUBLIQUE
 * d'écriture (mutation ou action) reçoive un identifiant de fichier
 * (`v.id("_storage")`, directement ou par un validateur nommé) sans atteindre la
 * garde de fraîcheur. Un `storageId` n'est qu'une référence : une entrée qui
 * l'écrit tel que le client l'envoie laisse poser le fichier d'autrui dans sa
 * ligne — servi ensuite à ses lecteurs, détruit par sa purge.
 *
 * COMMENT IL LIT, par l'arbre syntaxique :
 *  1. les validateurs nommés qui portent `v.id("_storage")` sont résolus par
 *     point fixe sur les déclarations de haut niveau ;
 *  2. les fonctions qui atteignent la garde, par point fixe sur les NOMS de
 *     fonctions dont le corps appelle `assertFreshUpload` ou `admitPosedUploads`
 *     (alias d'import compris), et sur les RÉFÉRENCES des fonctions Convex
 *     exportées qui l'atteignent (`internal.modules.x.y`, pour une action) ;
 *  3. une entrée publique qui reçoit un fichier sans rien de cela est un défaut,
 *     même avec un constructeur renommé ou un export local séparé.
 * Les commentaires, chaînes et simples mentions d’une référence ne sont pas des appels.
 *
 * SES LIMITES (nommées, comme au socle) : il voit la garde APPELÉE, pas qu'elle
 * porte sur le bon identifiant ; la résolution par NOM peut confondre deux
 * homonymes (les noms génériques et courts sont écartés) ; les requêtes sont
 * hors population (la délivrance est une autre garde : `file-delivery-gate`).
 */
import ts from "typescript"
import { describe, expect, it } from "vitest"

import { calledNames, exportedCalls, importedNames } from "./lib/detectors"
import { isTestFile, listFiles, readRepoFile, walk } from "./lib/source-files"

/** Constructeurs de fonctions PUBLIQUES qui peuvent écrire (ou faire écrire). */
const PUBLIC_BUILDERS = new Set(["mutation", "networkMutation", "personMutation", "operatorMutation", "networkAdminMutation", "action", "networkAction", "authMutation", "authAction"])

/** Les gardes de départ du point fixe. */
const GUARDS = ["assertFreshUpload", "admitPosedUploads"]

/** Noms trop communs pour identifier une fonction par son seul nom. */
const GENERIC_NAMES = new Set([
  "handler", "create", "update", "remove", "delete", "run", "get", "set", "list", "send", "apply", "check", "verify",
  "validate", "insert", "patch", "load", "save", "store", "main", "helper", "inner", "execute", "process", "build",
  "upsert", "attach",
])

/** Entrées publiques qui reçoivent un fichier SANS atteindre la garde, et pourquoi. Vide. */
const EXCEPTIONS: Record<string, string> = {}

type Source = { rel: string; text: string }
type Entry = { key: string; guarded: boolean }

export function analyse(sources: readonly Source[]): Entry[] {
  const files = sources.map(({ rel, text }) => {
    const sf = ts.createSourceFile(rel, text, ts.ScriptTarget.Latest, true)
    return { rel, sf, names: importedNames(sf) }
  })

  // 1. Validateurs nommés porteurs d'un identifiant de fichier (point fixe).
  const declarations: { name: string; node: ts.Expression; names: ReadonlyMap<string, string> }[] = []
  for (const { sf, names } of files) {
    for (const statement of sf.statements) {
      if (!ts.isVariableStatement(statement)) continue
      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name) || !declaration.initializer) continue
        const node = declaration.initializer
        if (!(ts.isObjectLiteralExpression(node) || ts.isIdentifier(node) || (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression))) || declaration.name.text.length < 4) continue
        declarations.push({ name: declaration.name.text, node, names })
      }
    }
  }
  const storageValidators = new Set<string>()
  const carriesStorage = (node: ts.Node, names: ReadonlyMap<string, string>): boolean => {
    let carries = false
    walk(node, (child) => {
      if (ts.isIdentifier(child) && storageValidators.has(child.text)) carries = true
      if (!ts.isCallExpression(child) || !ts.isPropertyAccessExpression(child.expression) || child.expression.name.text !== "id") return
      const owner = child.expression.expression
      const argument = child.arguments[0]
      if (ts.isIdentifier(owner) && (names.get(owner.text) ?? owner.text) === "v" && argument && ts.isStringLiteralLike(argument) && argument.text === "_storage") carries = true
    })
    return carries
  }
  for (let changed = true; changed; ) {
    changed = false
    for (const { name, node, names } of declarations) {
      if (storageValidators.has(name) || !carriesStorage(node, names)) continue
      storageValidators.add(name)
      changed = true
    }
  }

  // 2. Fonctions qui atteignent la garde (point fixe sur les noms et les références).
  const bodies: { name: string; node: ts.Node; names: ReadonlyMap<string, string> }[] = []
  for (const { sf, names } of files) {
    walk(sf, (node) => {
      if (ts.isFunctionDeclaration(node) && node.name && node.body) {
        bodies.push({ name: node.name.text, node: node.body, names })
      } else if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer && (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))) {
        bodies.push({ name: node.name.text, node: node.initializer, names })
      }
    })
  }
  const definitions = files.flatMap(({ rel, sf, names }) => {
    const module = rel.replace(/^convex\//, "").replace(/\.ts$/, "").split("/").join(".")
    return exportedCalls(sf).map(({ name, call }) => ({ reference: `${module}.${name}`, node: call, names }))
  })
  const guards = new Set(GUARDS)
  const references = new Set<string>()
  const calls = (node: ts.Node, names: ReadonlyMap<string, string>): boolean => [...calledNames(node, names)].some((name) => guards.has(name))
  const referenceOf = (node: ts.Expression): string | undefined => {
    if (ts.isIdentifier(node)) return node.text
    if (!ts.isPropertyAccessExpression(node)) return undefined
    const receiver = referenceOf(node.expression)
    return receiver ? `${receiver}.${node.name.text}` : undefined
  }
  const executes = (node: ts.Node): boolean => {
    let guarded = false
    walk(node, (child) => {
      if (!ts.isCallExpression(child) || !ts.isPropertyAccessExpression(child.expression) || !["runMutation", "runAction"].includes(child.expression.name.text)) return
      const reference = child.arguments[0] ? referenceOf(child.arguments[0]) : undefined
      if (reference && /^(internal|api)\./.test(reference) && references.has(reference.replace(/^(internal|api)\./, ""))) guarded = true
    })
    return guarded
  }
  for (let changed = true; changed; ) {
    changed = false
    for (const { name, node, names } of bodies) {
      if (guards.has(name) || GENERIC_NAMES.has(name) || name.length < 6) continue
      if (!calls(node, names) && !executes(node)) continue
      guards.add(name)
      changed = true
    }
    for (const { reference, node, names } of definitions) {
      if (references.has(reference)) continue
      if (!calls(node, names) && !executes(node)) continue
      references.add(reference)
      changed = true
    }
  }

  // 3. Entrées publiques, même si le constructeur est importé sous un alias ou l'export séparé.
  const entries: Entry[] = []
  for (const { rel, sf, names } of files) {
    for (const { name, call } of exportedCalls(sf)) {
      if (!ts.isIdentifier(call.expression) || !PUBLIC_BUILDERS.has(names.get(call.expression.text) ?? call.expression.text)) continue
      const definition = call.arguments[0]
      if (!definition || !ts.isObjectLiteralExpression(definition)) continue
      const args = definition.properties.find((property) => property.name !== undefined && property.name.getText(sf) === "args")
      if (!args || !carriesStorage(args, names)) continue
      entries.push({ key: `${rel}#${name}`, guarded: calls(call, names) || executes(call) })
    }
  }
  return entries.sort((a, b) => a.key.localeCompare(b.key))
}

const ENTRIES = analyse(
  listFiles(["convex"], [".ts"])
    .filter((file) => !isTestFile(file) && !file.endsWith(".setup.ts") && !file.endsWith(".d.ts"))
    .map((rel) => ({ rel, text: readRepoFile(rel) })),
)

describe("storage-arg-freshness — toute entrée publique qui reçoit un fichier atteint la garde de fraîcheur", () => {
  it("aucune entrée publique ne reçoit un identifiant de fichier sans la garde", () => {
    const bare = ENTRIES.filter((entry) => !entry.guarded && !(entry.key in EXCEPTIONS)).map((entry) => entry.key)
    expect(bare).toEqual([])
  })

  it("pas d'exception morte", () => {
    const byKey = new Map(ENTRIES.map((entry) => [entry.key, entry]))
    expect(Object.keys(EXCEPTIONS).filter((key) => byKey.get(key)?.guarded !== false)).toEqual([])
  })

  it("test du test : appel direct, helper d'un autre fichier, alias d'import, action par référence ; et l'entrée nue est vue", () => {
    const sources: Source[] = [
      {
        rel: "convex/modules/media/helpers.ts",
        text: 'export async function attachPostMedia(ctx, id) { await assertFreshUpload(ctx, null, id) }',
      },
      {
        rel: "convex/modules/media/internal.ts",
        text: 'export const admitFor = internalMutation({ args: {}, handler: async (ctx) => attachPostMedia(ctx, "x") })',
      },
      {
        rel: "convex/modules/media/media.ts",
        text: [
          'import { assertFreshUpload as fresh } from "../files/admission"',
          'const fileArg = v.id("_storage")',
          "export const direct = networkMutation({ args: { storageId: v.id(\"_storage\") }, handler: async (ctx, a) => assertFreshUpload(ctx, null, a.storageId) })",
          "export const viaHelper = personMutation({ args: { file: fileArg }, handler: async (ctx, a) => attachPostMedia(ctx, a.file) })",
          "export const viaAlias = mutation({ args: { file: fileArg }, handler: async (ctx, a) => fresh(ctx, null, a.file) })",
          "export const viaAction = action({ args: { file: fileArg }, handler: async (ctx, a) => ctx.runMutation(internal.modules.media.internal.admitFor, {}) })",
          "export const bare = networkMutation({ args: { file: fileArg }, handler: async (ctx, a) => ctx.db.insert(\"x\", { file: a.file }) })",
          "export const reads = networkQuery({ args: { file: fileArg }, handler: async () => null })",
        ].join("\n"),
      },
    ]
    const entries = analyse(sources)
    expect(entries.map((entry) => [entry.key.split("#")[1], entry.guarded])).toEqual([
      ["bare", false],
      ["direct", true],
      ["viaAction", true],
      ["viaAlias", true],
      ["viaHelper", true],
    ])
  })

  it("test du test : networkAction, constructeur renommé et export séparé reçoivent la même garde", () => {
    const entries = analyse([{
      rel: "convex/modules/media/fixture.ts",
      text: [
        'import { networkAction as act } from "../../lib/functions"',
        'import { assertFreshUpload as fresh } from "../files/admission"',
        'const fileArg = v.id("_storage")',
        'const local = act({ args: { file: fileArg }, handler: async () => null })',
        'export { local as separated }',
        'export const direct = networkAction({ args: { file: fileArg }, handler: async () => null })',
        'export const good = act({ args: { file: fileArg }, handler: async (ctx, a) => fresh(ctx, null, a.file) })',
        'export const fake = act({ args: { file: fileArg }, handler: async () => { /* assertFreshUpload(ctx, null, file) */ return "assertFreshUpload(" } })',
        'export const noFile = act({ args: { text: v.string() }, handler: async () => "v.id(\\\"_storage\\\")" })',
      ].join("\n"),
    }])
    expect(entries.map((entry) => [entry.key.split("#")[1], entry.guarded])).toEqual([
      ["direct", false], ["fake", false], ["good", true], ["separated", false],
    ])
  })

  it("test du test : seul un appel de la référence gardée protège une action", () => {
    const entries = analyse([
      { rel: "convex/modules/media/guard.ts", text: 'export const fresh = internalMutation({ args: {}, handler: async (ctx) => assertFreshUpload(ctx, null, "x") })' },
      { rel: "convex/modules/media/actions.ts", text: [
        'export const mentioned = action({ args: { file: v.id("_storage") }, handler: async () => { /* internal.modules.media.guard.fresh */ return "assertFreshUpload(" } })',
        'export const referenceOnly = action({ args: { file: v.id("_storage") }, handler: async () => internal.modules.media.guard.fresh })',
        'export const executed = action({ args: { file: v.id("_storage") }, handler: async (ctx) => ctx.runMutation(internal.modules.media.guard.fresh, {}) })',
      ].join("\n") },
    ])
    expect(entries.map((entry) => [entry.key.split("#")[1], entry.guarded])).toEqual([
      ["executed", true], ["mentioned", false], ["referenceOnly", false],
    ])
  })
})
