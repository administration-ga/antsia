/**
 * contextual-hooks — CE QU'IL INTERDIT (contrat CONVERSATION-CONTEXTUELLE-V1 §6.3, N21 ;
 * ADR-0025) : qu'une tranche dont la nature est ENREGISTRÉE (`contextualMessaging/registry.ts`)
 * écrive l'état d'un objet ouvrant sans appeler, dans la même fonction, le crochet de la
 * conversation. L'accès ne dépend jamais du cache (il relit l'objet) ; un crochet manqué retarde
 * seulement le cache, la coupure d'un appel établi et la purge — d'où cette obligation.
 *
 * COMMENT IL LIT, par l'arbre syntaxique des fichiers de transition de la tranche :
 *  1. une écriture d'état est un `….db.patch|replace(…, { status|state … })`
 *     (objet littéral portant `status`, ou `state` dans le fichier des profils professionnels) ; elle exige `syncContextualConversation` ou
 *     `openContextualConversation` dans la fonction qui l'englobe (alias d'import compris) ;
 *  2. pour une nature qui s'ouvre à la création, `….db.insert("<table>", …)` exige
 *     `openContextualConversation` (ou `syncContextualConversation`, qui ouvre) ;
 *  3. ÉQUIVALENT ADMIS (voie (a), 19/10/2026) : la planification, dans la même fonction, de la
 *     resynchronisation APRÈS décision de modération (`SCHEDULED_SYNCS`), directement ou par une
 *     aide locale du même fichier. Le moteur appelle les effets de tranche AVANT d'écrire le nouvel
 *     état de modération (`moderation/targets.ts`) : un `sync` immédiat relirait l'ancien état ; le
 *     passage planifié relit l'état écrit. Le cliquet vérifie que ce passage appelle bien
 *     `syncContextualConversation` ;
 *  4. une exemption est NOMINATIVE et motivée, dans la fonction même :
 *     `// contextual-hooks-exempt: <raison d'au moins dix caractères>` (ex. D6 : clore une offre
 *     d'emploi ne touche aucune candidature).
 * Le cliquet n'est ARMÉ que pour les natures dont le résolveur est enregistré (non `null`).
 *
 * SES LIMITES (nommées) : une écriture dont l'objet n'est pas littéral (`patch(id, fields)`) n'est
 * pas vue ; la table d'un `patch` n'est pas résolue (toute écriture de `status` des fichiers
 * désignés compte, d'où l'exemption motivée) ; une suppression d'objet n'est pas vue (la purge
 * `purgeContextualConversation` reste une obligation écrite, §6.5).
 *
 * Écrit le 19/10/2026 sans exécution (décision du propriétaire : « Continuer sans vérifier »).
 */
import { CONTEXTUAL_SUPPORTED_KINDS, type ContextualKind } from "@antsia/social-domain/contextualMessaging"
import ts from "typescript"
import { describe, expect, it } from "vitest"

import { registryEntries } from "./lib/contextual"
import { importedNames } from "./lib/detectors"
import { type Finding, formatFindings, lineOf, parseSource, readRepoFile } from "./lib/source-files"

const REGISTRY = "convex/modules/contextualMessaging/registry.ts"
const HOOKS = "convex/modules/contextualMessaging/hooks.ts"

/** Les fichiers de transition de chaque nature (tranche DIASPORALE) et la table qui s'ouvre à la création. */
export const HOOKED_SOURCES: Readonly<Record<ContextualKind, { files: readonly string[]; openOnInsert: string | null }>> = {
  professionalCollaboration: { files: ["convex/modules/professionals/collaborations.ts", "convex/modules/professionals/profiles.ts"], openOnInsert: null },
  diasporaServiceRequest: { files: ["convex/modules/diaspora/serviceRequests.ts"], openOnInsert: "serviceRequests" },
  diasporaMentoring: { files: ["convex/modules/diaspora/mentoring.ts", "convex/modules/diaspora/moderationTargets.ts"], openOnInsert: null },
  diasporaJobApplication: { files: ["convex/modules/diaspora/jobs.ts", "convex/modules/diaspora/moderationTargets.ts"], openOnInsert: null },
}

/** Resynchronisations planifiées admises comme équivalent d'un crochet : référence → fichier qui la définit. */
export const SCHEDULED_SYNCS: Readonly<Record<string, { file: string; name: string }>> = {
  "syncSlice": { file: "convex/modules/professionals/profiles.ts", name: "syncConversationSlice" },
  "internal.modules.diaspora.conversationSync.syncConversationsAfterModeration": { file: "convex/modules/diaspora/conversationSync.ts", name: "syncConversationsAfterModeration" },
}

const HOOK_NAMES = new Set(["syncContextualConversation", "openContextualConversation"])
const EXEMPTION = /contextual-hooks-exempt\s*:\s*\S.{9,}/u

type FunctionLike = ts.FunctionDeclaration | ts.FunctionExpression | ts.ArrowFunction | ts.MethodDeclaration

function isFunctionLike(node: ts.Node): node is FunctionLike {
  return ts.isFunctionDeclaration(node) || ts.isFunctionExpression(node) || ts.isArrowFunction(node) || ts.isMethodDeclaration(node)
}

function enclosingFunction(node: ts.Node): FunctionLike | undefined {
  for (let current: ts.Node | undefined = node.parent; current; current = current.parent) if (isFunctionLike(current)) return current
  return undefined
}

/** Le nom d'une fonction englobante pour le message (déclaration, variable, propriété, méthode). */
function functionLabel(fn: FunctionLike, source: ts.SourceFile): string {
  if ((ts.isFunctionDeclaration(fn) || ts.isMethodDeclaration(fn)) && fn.name) return fn.name.getText(source)
  for (let current: ts.Node | undefined = fn.parent; current; current = current.parent) {
    if (ts.isVariableDeclaration(current) && ts.isIdentifier(current.name)) return current.name.text
    if (ts.isPropertyAssignment(current)) return current.name.getText(source)
  }
  return "<anonyme>"
}

/** Exemption nominative : dans le texte de la fonction, ou sur la déclaration exportée qui la porte (`handler`). */
function exempted(fn: FunctionLike, source: ts.SourceFile): boolean {
  if (EXEMPTION.test(fn.getFullText(source))) return true
  for (let current: ts.Node | undefined = fn.parent; current; current = current.parent) {
    if (ts.isVariableStatement(current)) return EXEMPTION.test(current.getFullText(source))
    if (isFunctionLike(current)) return false
  }
  return false
}

/** Le texte d'une référence de fonction (`internal.modules.x.y`), ou `undefined`. */
function referenceText(node: ts.Expression | undefined): string | undefined {
  if (!node) return undefined
  if (ts.isIdentifier(node)) return node.text
  if (ts.isPropertyAccessExpression(node)) {
    const receiver = referenceText(node.expression)
    return receiver ? `${receiver}.${node.name.text}` : undefined
  }
  return undefined
}

/** Une planification `….scheduler.runAfter|runAt(…, <référence admise>, …)` ? */
function schedulesSync(node: ts.Node, file?: string): boolean {
  if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)) return false
  const method = node.expression.name.text
  if (method !== "runAfter" && method !== "runAt") return false
  const receiver = node.expression.expression
  if (!ts.isPropertyAccessExpression(receiver) || receiver.name.text !== "scheduler") return false
  const reference = referenceText(node.arguments[1])
  return reference !== undefined && Object.hasOwn(SCHEDULED_SYNCS, reference) && (reference !== "syncSlice" || file === "convex/modules/professionals/profiles.ts")
}

function containsCall(root: ts.Node | undefined, accept: (node: ts.CallExpression) => boolean): boolean {
  let found = false
  const visit = (node: ts.Node): void => {
    if (found) return
    if (ts.isCallExpression(node) && accept(node)) found = true
    ts.forEachChild(node, visit)
  }
  if (root) visit(root)
  return found
}

/** Les aides LOCALES (déclarations de fonction du fichier) qui planifient une resynchronisation admise. */
function localSchedulingHelpers(source: ts.SourceFile): Set<string> {
  const helpers = new Set<string>()
  for (const statement of source.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name && containsCall(statement.body, node => schedulesSync(node, source.fileName))) helpers.add(statement.name.text)
  }
  return helpers
}

/** `….db.<method>(…)` ? */
function dbCall(node: ts.CallExpression, method: string): boolean {
  const callee = node.expression
  return ts.isPropertyAccessExpression(callee) && callee.name.text === method && ts.isPropertyAccessExpression(callee.expression) && callee.expression.name.text === "db"
}

function writesStatus(argument: ts.Expression | undefined, source: ts.SourceFile): boolean {
  if (!argument || !ts.isObjectLiteralExpression(argument)) return false
  // V1 conserve sa détection status ; state est le cycle du profil professionnel dont
  // toute pause doit synchroniser ses collaborations. Les profils de mentor historiques
  // ne sont pas les objets ouvrants de mentoringRequest.
  const fields = source.fileName === "convex/modules/professionals/profiles.ts" ? ["status", "state"] : ["status"]
  return argument.properties.some((property) => (ts.isPropertyAssignment(property) || ts.isShorthandPropertyAssignment(property)) && fields.includes(property.name.getText(source)))
}

/** Les écritures d'état d'objet sans crochet (ni équivalent admis) dans la même fonction. */
export function detectMissingHooks(file: string, text: string, openOnInsert: ReadonlySet<string>): Finding[] {
  const source = parseSource(file, text)
  const names = importedNames(source)
  const helpers = localSchedulingHelpers(source)
  const findings: Finding[] = []
  const hooked = (fn: FunctionLike): boolean => containsCall(fn.body, (call) => {
    if (schedulesSync(call, file)) return true
    if (!ts.isIdentifier(call.expression)) return false
    const name = names.get(call.expression.text) ?? call.expression.text
    return HOOK_NAMES.has(name) || helpers.has(call.expression.text)
  })
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const stateWrite = (dbCall(node, "patch") || dbCall(node, "replace")) && writesStatus(node.arguments[1], source)
      const table = node.arguments[0]
      const opening = dbCall(node, "insert") && table !== undefined && ts.isStringLiteral(table) && openOnInsert.has(table.text)
      if (stateWrite || opening) {
        const fn = enclosingFunction(node)
        if (!fn || (!exempted(fn, source) && !hooked(fn))) {
          findings.push({
            file,
            line: lineOf(source, node.getStart(source)),
            message: `${fn ? functionLabel(fn, source) : "<module>"} : ${opening ? "création d'un objet ouvrant" : "écriture d'état"} sans openContextualConversation/syncContextualConversation (ni resynchronisation planifiée admise) dans la même fonction — ou exemption « contextual-hooks-exempt: <raison> »`,
          })
        }
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return findings
}

/** Les natures ARMÉES : enregistrées (résolveur non `null`) dans le registre réel. */
function armedKinds(): ContextualKind[] {
  const entries = registryEntries(REGISTRY, readRepoFile(REGISTRY))
  return CONTEXTUAL_SUPPORTED_KINDS.filter((kind) => entries.some((entry) => entry.kind === kind && entry.value === "resolver"))
}

describe("contextual-hooks — toute transition d'un objet enregistré appelle son crochet", () => {
  it("les crochets offerts aux tranches existent sous leurs noms contractuels", () => {
    const hooks = readRepoFile(HOOKS)
    for (const name of ["openContextualConversation", "syncContextualConversation", "purgeContextualConversation"]) expect(hooks, name).toMatch(new RegExp(`export async function ${name}\\(`, "u"))
  })

  it("aucune écriture d'état d'un objet enregistré sans crochet dans la même fonction", () => {
    const files = new Map<string, Set<string>>()
    for (const kind of armedKinds()) {
      for (const file of HOOKED_SOURCES[kind].files) {
        const tables = files.get(file) ?? new Set<string>()
        const opening = HOOKED_SOURCES[kind].openOnInsert
        if (opening) tables.add(opening)
        files.set(file, tables)
      }
    }
    const findings = [...files].flatMap(([file, tables]) => detectMissingHooks(file, readRepoFile(file), tables))
    expect(findings, formatFindings(findings)).toEqual([])
  })

  it("une resynchronisation planifiée admise appelle réellement syncContextualConversation", () => {
    for (const [reference, { file, name }] of Object.entries(SCHEDULED_SYNCS)) {
      const source = parseSource(file, readRepoFile(file))
      const names = importedNames(source)
      const declaration = source.statements.flatMap((statement) => (ts.isVariableStatement(statement) ? [...statement.declarationList.declarations] : [])).find((item) => ts.isIdentifier(item.name) && item.name.text === name)
      expect(declaration, reference).toBeDefined()
      const syncs = containsCall(declaration?.initializer, (call) => ts.isIdentifier(call.expression) && (names.get(call.expression.text) ?? call.expression.text) === "syncContextualConversation")
      expect(syncs, reference).toBe(true)
    }
  })

  it("MP09 : l'aide de profil planifie seulement son passage fermé et state exige aussi un crochet", () => {
    const file = "convex/modules/professionals/profiles.ts"
    expect(readRepoFile(file)).toContain('makeFunctionReference<"mutation", SyncArgs, null>("modules/professionals/profiles:syncConversationSlice")')
    expect(detectMissingHooks(file, 'export async function pause(ctx) { await ctx.db.patch(id, { state: "paused" }) }', new Set())).toHaveLength(1)
    const source = 'async function syncProfile(ctx) { await ctx.scheduler.runAfter(0, syncSlice, {}) } export async function pause(ctx) { await ctx.db.patch(id, { state: "paused" }); await syncProfile(ctx) }'
    expect(detectMissingHooks(file, source, new Set())).toEqual([])
    expect(detectMissingHooks("convex/modules/professionals/other.ts", source.replace('state: "paused"', 'status: "paused"'), new Set())).toHaveLength(1)
  })

  it("test du test : écriture d'état sans crochet, avec crochet, alias, planification admise, exemption motivée", () => {
    const source = [
      'import { syncContextualConversation as sync, openContextualConversation } from "../contextualMessaging/hooks"',
      "export const decline = networkMutation({ args: {}, handler: async (ctx) => { await ctx.db.patch(id, { status: \"declined\" }) } })",
      "export const accept = networkMutation({ args: {}, handler: async (ctx) => { await ctx.db.patch(id, { status: \"accepted\" }); await sync(ctx, ref) } })",
      "async function expire(ctx) { for (const row of rows) { await ctx.db.patch(row._id, { status: \"expired\" }) } }",
      "// contextual-hooks-exempt: D6, clore une offre ne touche aucune candidature",
      "export const closeOffers = internalMutation({ args: {}, handler: async (ctx) => { await ctx.db.patch(offer._id, { status: \"closed\" }) } })",
      "export const create = networkMutation({ args: {}, handler: async (ctx) => { const id = await ctx.db.insert(\"serviceRequests\", {}); return id } })",
      "export const createOk = networkMutation({ args: {}, handler: async (ctx) => { const id = await ctx.db.insert(\"serviceRequests\", {}); await openContextualConversation(ctx, { kind, id }) } })",
      "export const other = networkMutation({ args: {}, handler: async (ctx) => { await ctx.db.patch(id, { version: 2 }) } })",
      "// contextual-hooks-exempt: court",
      "export const tooShort = internalMutation({ args: {}, handler: async (ctx) => { await ctx.db.patch(id, { status: \"x\" }) } })",
      "async function later(ctx, target) { await ctx.scheduler.runAfter(0, internal.modules.diaspora.conversationSync.syncConversationsAfterModeration, { target }) }",
      "export async function restore(ctx, target) { await ctx.db.patch(target.id, { status: \"open\" }); await later(ctx, target) }",
      "export async function direct(ctx, target) { await ctx.db.patch(target.id, { status: \"open\" }); await ctx.scheduler.runAfter(0, internal.modules.diaspora.conversationSync.syncConversationsAfterModeration, { target }) }",
      "export async function wrongJob(ctx, target) { await ctx.db.patch(target.id, { status: \"open\" }); await ctx.scheduler.runAfter(0, internal.modules.diaspora.other.job, { target }) }",
    ].join("\n")
    const lines = detectMissingHooks("convex/modules/diaspora/serviceRequests.ts", source, new Set(["serviceRequests"])).map((finding) => finding.line)
    expect(lines).toEqual([2, 4, 7, 11, 15])
  })
})
