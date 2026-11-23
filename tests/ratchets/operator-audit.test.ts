/**
 * operator-audit — CE QU'IL INTERDIT : qu'une mutation de console
 * (`operatorMutation`) décide sans laisser sa ligne dans le journal des
 * décisions du moteur (`appendAudit`, `convex/modules/platform/audit.ts`).
 * Le cahier l'exige (EXF-AN-39 : journal ; §12.5 : opérateur « en dernier
 * ressort, tracé ») ; l'owner map le fixe (E9).
 *
 * COMMENT IL LIT : par l'arbre syntaxique — chaque appel `operatorMutation({…})`
 * exporté doit contenir, dans sa définition même, un APPEL `appendAudit(…)`
 * (un nœud d'appel de l'arbre : un commentaire ou une chaîne ne comptent pas).
 * Une aide intermédiaire ne compte pas : la ligne d'audit se voit à la lecture
 * de la décision. Une exception VÉRIFIÉE se déclare dans `EXCEPTIONS`
 * (`fichier#export`), avec sa raison. Vide.
 *
 * CH-831 — LE RÔLE D'UN RÉSEAU PAR L'AIDE COMMUNE. L'aide qui pose ou retire un rôle de réseau
 * (`people/networkRoles.setMembershipRole`) laisse à l'APPELANT l'écriture du journal. Le cliquet exige :
 * - que l'aide ne soit RÉFÉRENCÉE que par un appel direct dans la définition d'une fonction Convex
 *   exportée (quel que soit son constructeur, fonctions internes comprises), ou par son import nommé
 *   non renommé : un import renommé, un accès par espace de noms, une valeur passée ou une aide
 *   intermédiaire sont des constats ;
 * - que cette définition contienne un APPEL `appendAudit(…)` ;
 * - que l'option `allowLastAdmin` (lever la garde du dernier administrateur) ne s'écrive QUE comme
 *   propriété directe, à `true`, de l'objet passé à l'appel de l'aide dans
 *   `platform/networkAdminBootstrap.ts#withdraw` (sur le modèle du cliquet `unlogged-access`).
 *
 * CE QU'IL NE VOIT PAS : une écriture DIRECTE du rôle d'une adhésion (`ctx.db.patch(id, { role })` sur
 * `networkMemberships`), qui contourne l'aide et son journal. Aucune règle statique fiable ne la
 * distingue : `patch(id, …)` ne nomme pas sa table et d'autres tables portent un champ `role`
 * (signataires de pages, groupes, fils, associations…). Écritures directes CONNUES, antérieures à
 * CH-831, propres à l'équipement des comptes de démonstration et sans ligne de journal :
 * `convex/modules/diaspora/demoAccounts.ts` (`equipMyDemoAccount`, vers la l. 623) et
 * `convex/modules/platform/demoAccounts.ts` (`equipMyDemoAccount`, vers la l. 302).
 */
import ts from "typescript"
import { describe, expect, it } from "vitest"

import { exportedCalls } from "./lib/detectors"
import { type Finding, formatFindings, isTestFile, lineOf, listFiles, parseSource, readRepoFile, walk } from "./lib/source-files"

const EXCEPTIONS: Record<string, string> = {}

const ROLE_HELPER = "setMembershipRole"
const HELPER_FILE = "convex/modules/people/networkRoles.ts"
const LAST_ADMIN_OPTION = "allowLastAdmin"
/** La SEULE définition admise à passer `allowLastAdmin`, `fichier#export`. */
const LAST_ADMIN_DOOR = "convex/modules/platform/networkAdminBootstrap.ts#withdraw"

/** Un vrai APPEL de `appendAudit` (ou `x.appendAudit`) dans l'arbre de ce nœud : ni commentaire, ni chaîne. */
function hasAppendAuditCall(node: ts.Node): boolean {
  let found = false
  walk(node, (child) => {
    if (found || !ts.isCallExpression(child)) return
    const callee = child.expression
    if ((ts.isIdentifier(callee) && callee.text === "appendAudit") || (ts.isPropertyAccessExpression(callee) && callee.name.text === "appendAudit")) found = true
  })
  return found
}

function propertyNameText(name: ts.PropertyName): string | undefined {
  if (ts.isIdentifier(name) || ts.isStringLiteralLike(name)) return name.text
  if (ts.isComputedPropertyName(name) && ts.isStringLiteralLike(name.expression)) return name.expression.text
  return undefined
}

/** La définition exportée (`exportedCalls`) dont l'appel contient ce nœud, ou `undefined`. */
function enclosingDefinition(node: ts.Node, source: ts.SourceFile, definitions: ReturnType<typeof exportedCalls>) {
  const start = node.getStart(source)
  return definitions.find(({ call }) => call.getStart(source) <= start && node.getEnd() <= call.getEnd())
}

/**
 * Toutes les références à l'aide commune des rôles de réseau (voir l'en-tête), et l'audit de chaque
 * définition qui l'appelle. Rend aussi les définitions vues (garde-fou).
 */
function detectUnauditedRoleChanges(file: string, text: string): { findings: Finding[]; callers: string[] } {
  const findings: Finding[] = []
  const source = parseSource(file, text)
  const definitions = exportedCalls(source)
  const callers = new Map<string, ts.CallExpression>()
  const flag = (node: ts.Node, message: string): void => {
    findings.push({ file, line: lineOf(source, node.getStart(source)), message })
  }
  /** Le constat d'une référence, ou `null` si elle est admise (l'appel direct admis est noté parmi les appelants). */
  const judge = (node: ts.Identifier): string | null => {
    const parent = node.parent
    if (ts.isFunctionDeclaration(parent) && parent.name === node) return file === HELPER_FILE ? null : `${ROLE_HELPER} redéclarée hors de ${HELPER_FILE}`
    if (ts.isImportSpecifier(parent)) return parent.propertyName === undefined && parent.name === node ? null : `import renommé de ${ROLE_HELPER}`
    if (ts.isCallExpression(parent) && parent.expression === node) {
      const definition = enclosingDefinition(node, source, definitions)
      if (!definition) return `${ROLE_HELPER}(…) hors d'une fonction Convex exportée`
      callers.set(definition.name, definition.call)
      return null
    }
    return `${ROLE_HELPER} référencée hors d'un appel direct`
  }
  walk(source, (node) => {
    // `x["setMembershipRole"]` : un accès par chaîne.
    if (ts.isElementAccessExpression(node) && ts.isStringLiteralLike(node.argumentExpression) && node.argumentExpression.text === ROLE_HELPER) flag(node, `${ROLE_HELPER} référencée hors d'un appel direct`)
    if (!ts.isIdentifier(node) || node.text !== ROLE_HELPER) return
    const problem = judge(node)
    if (problem !== null) flag(node, problem)
  })
  for (const [name, call] of callers) {
    if (!hasAppendAuditCall(call)) flag(call, `changement de rôle « ${name} » sans appendAudit(…)`)
  }
  findings.sort((a, b) => a.line - b.line)
  return { findings, callers: [...callers.keys()].map((name) => `${file}#${name}`) }
}

/**
 * L'option `allowLastAdmin`, propriété d'objet (écrite, abrégée, entre guillemets, calculée par une
 * chaîne, méthode) : admise SEULEMENT à `true`, directement dans l'objet passé en second argument d'un
 * appel direct de l'aide, dans la définition `LAST_ADMIN_DOOR`. Les types (`allowLastAdmin?: true`),
 * les déstructurations et les lectures ne sont pas des propriétés d'objet : elles ne comptent pas.
 * Rend aussi les propriétés admises (pas d'admission morte).
 */
function detectLastAdminOption(file: string, text: string): { findings: Finding[]; admitted: string[] } {
  if (!text.includes(LAST_ADMIN_OPTION)) return { findings: [], admitted: [] }
  const source = parseSource(file, text)
  const definitions = exportedCalls(source)
  const findings: Finding[] = []
  const admitted: string[] = []
  walk(source, (node) => {
    const named = ((ts.isPropertyAssignment(node) || ts.isMethodDeclaration(node) || ts.isGetAccessorDeclaration(node) || ts.isSetAccessorDeclaration(node)) && ts.isObjectLiteralExpression(node.parent) && propertyNameText(node.name) === LAST_ADMIN_OPTION)
      || (ts.isShorthandPropertyAssignment(node) && node.name.text === LAST_ADMIN_OPTION)
    if (!named) return
    const object = node.parent
    const call = object.parent
    const definition = enclosingDefinition(node, source, definitions)
    const ok = ts.isPropertyAssignment(node)
      && node.initializer.kind === ts.SyntaxKind.TrueKeyword
      && ts.isCallExpression(call) && ts.isIdentifier(call.expression) && call.expression.text === ROLE_HELPER && call.arguments[1] === object
      && definition !== undefined && `${file}#${definition.name}` === LAST_ADMIN_DOOR
    if (ok) admitted.push(`${file}#${definition.name}`)
    else findings.push({ file, line: lineOf(source, node.getStart(source)), message: `« ${LAST_ADMIN_OPTION} » hors du retrait de l'amorçage (${LAST_ADMIN_DOOR})` })
  })
  return { findings, admitted }
}

function convexSources(): { file: string; text: string }[] {
  return listFiles(["convex"], [".ts"])
    .filter((file) => !isTestFile(file) && !file.includes("/_generated/"))
    .map((file) => ({ file, text: readRepoFile(file) }))
}

function roleChangeFiles(): { file: string; text: string }[] {
  return convexSources().filter(({ text }) => text.includes(ROLE_HELPER))
}

function detectUnauditedOperatorMutations(file: string, text: string): Finding[] {
  const findings: Finding[] = []
  const source = parseSource(file, text)
  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement)) continue
    for (const declaration of statement.declarationList.declarations) {
      const initializer = declaration.initializer
      if (!initializer || !ts.isCallExpression(initializer) || !ts.isIdentifier(initializer.expression)) continue
      if (initializer.expression.text !== "operatorMutation") continue
      const name = declaration.name.getText(source)
      if (`${file}#${name}` in EXCEPTIONS) continue
      if (hasAppendAuditCall(initializer)) continue
      findings.push({ file, line: lineOf(source, declaration.getStart(source)), message: `mutation de console « ${name} » sans appendAudit(…)` })
    }
  }
  return findings
}

function operatorMutationFiles(): { file: string; text: string }[] {
  return listFiles(["convex"], [".ts"])
    .filter((file) => !isTestFile(file))
    .map((file) => ({ file, text: readRepoFile(file) }))
    .filter(({ text }) => /\boperatorMutation\s*\(/.test(text))
}

describe("operator-audit — toute décision de console laisse sa ligne de journal", () => {
  it("le détecteur voit une décision sans journal, et laisse passer celle qui en a un", () => {
    const fabricated = [
      `export const silent = operatorMutation({ args: {}, handler: async (ctx) => { await ctx.db.patch(id, {}) } })`,
      `export const traced = operatorMutation({ args: {}, handler: async (ctx) => { await appendAudit(ctx, entry) } })`,
      `export const reader = operatorQuery({ args: {}, handler: async () => null })`,
      `export const commented = operatorMutation({ args: {}, handler: async (ctx) => { /* appendAudit(ctx, entry) */ await ctx.db.patch(id, {}) } })`,
      `export const quoted = operatorMutation({ args: {}, handler: async (ctx) => { const note = "appendAudit(ctx, entry)"; await ctx.db.patch(id, {}) } })`,
    ].join("\n")
    expect(detectUnauditedOperatorMutations("convex/modules/x/fabricated.ts", fabricated).map((finding) => finding.message)).toEqual([
      "mutation de console « silent » sans appendAudit(…)",
      "mutation de console « commented » sans appendAudit(…)",
      "mutation de console « quoted » sans appendAudit(…)",
    ])
  })

  it("aucune mutation de console ne décide sans journal", () => {
    const findings = operatorMutationFiles().flatMap(({ file, text }) => detectUnauditedOperatorMutations(file, text))
    expect(findings, formatFindings(findings)).toEqual([])
  })

  it("pas d'exception morte ; le cliquet voit bien les décisions qu'il garde", () => {
    const declared = new Set(operatorMutationFiles().flatMap(({ file, text }) => [...text.matchAll(/export const (\w+) = operatorMutation\(/g)].map((match) => `${file}#${match[1]}`)))
    expect(Object.keys(EXCEPTIONS).filter((key) => !declared.has(key))).toEqual([])
    // Garde-fou du détecteur : s'il ne trouvait plus rien, il passerait au vert sur un parc nu.
    expect([...declared]).toEqual(expect.arrayContaining(["convex/modules/networks/networks.ts#archive", "convex/modules/people/memberships.ts#suspendEverywhere"]))
  })
})

describe("operator-audit — tout changement de rôle par l'aide commune laisse sa ligne de journal (CH-831)", () => {
  it("test du test : un changement sans journal, quel que soit le constructeur ; un appel caché dans une aide", () => {
    const fabricated = [
      `export const silent = internalMutation({ args: {}, handler: async (ctx) => { await setMembershipRole(ctx, input) } })`,
      `export const traced = networkAdminMutation({ args: {}, handler: async (ctx) => { const change = await setMembershipRole(ctx, input); if (change.changed) await appendAudit(ctx, entry) } })`,
      `export const consoleTraced = operatorMutation({ args: {}, handler: async (ctx) => { await setMembershipRole(ctx, input); await appendAudit(ctx, entry) } })`,
      `async function hidden(ctx) { return await setMembershipRole(ctx, input) }`,
      `export const viaHelper = internalMutation({ args: {}, handler: async (ctx) => { await hidden(ctx); await appendAudit(ctx, entry) } })`,
      `export const namespacedAudit = internalMutation({ args: {}, handler: async (ctx) => { await setMembershipRole(ctx, input); await audit.appendAudit(ctx, entry) } })`,
    ].join("\n")
    const { findings, callers } = detectUnauditedRoleChanges("convex/modules/x/fabricated.ts", fabricated)
    expect(findings.map((finding) => `${finding.line} ${finding.message}`)).toEqual([
      "1 changement de rôle « silent » sans appendAudit(…)",
      "4 setMembershipRole(…) hors d'une fonction Convex exportée",
    ])
    expect(callers).toEqual(["convex/modules/x/fabricated.ts#silent", "convex/modules/x/fabricated.ts#traced", "convex/modules/x/fabricated.ts#consoleTraced", "convex/modules/x/fabricated.ts#namespacedAudit"])
  })

  it("test du test : toute référence qui n'est pas un appel direct est vue (import renommé, espace de noms, chaîne, valeur, réexport, redéclaration)", () => {
    const fabricated = [
      `import { setMembershipRole } from "../people/networkRoles"`,
      `import { setMembershipRole as assignRole } from "../people/networkRoles"`,
      `import * as roles from "../people/networkRoles"`,
      `export const viaNamespace = internalMutation({ args: {}, handler: async (ctx) => { await roles.setMembershipRole(ctx, input); await appendAudit(ctx, entry) } })`,
      `export const viaString = internalMutation({ args: {}, handler: async (ctx) => { await roles["setMembershipRole"](ctx, input); await appendAudit(ctx, entry) } })`,
      `const assign = setMembershipRole`,
      `export { setMembershipRole as reexported }`,
      `export async function setMembershipRole() { return null }`,
      `export const direct = internalMutation({ args: {}, handler: async (ctx) => { await setMembershipRole(ctx, input); await appendAudit(ctx, entry) } })`,
      `// setMembershipRole(ctx, input) dans un commentaire`,
    ].join("\n")
    const { findings, callers } = detectUnauditedRoleChanges("convex/modules/x/fabricated.ts", fabricated)
    expect(findings.map((finding) => finding.line)).toEqual([2, 4, 5, 6, 7, 8])
    expect(callers).toEqual(["convex/modules/x/fabricated.ts#direct"])
    // La déclaration n'est admise que dans le fichier de l'aide.
    expect(detectUnauditedRoleChanges(HELPER_FILE, `export async function setMembershipRole() { return null }`).findings).toEqual([])
  })

  it("test du test : un commentaire ou une chaîne ne valent pas un appel `appendAudit`", () => {
    const fabricated = [
      `export const commented = internalMutation({ args: {}, handler: async (ctx) => { /* appendAudit(ctx, entry) */ await setMembershipRole(ctx, input) } })`,
      `export const quoted = internalMutation({ args: {}, handler: async (ctx) => { const note = "appendAudit(ctx, entry)"; await setMembershipRole(ctx, input) } })`,
      `export const traced = internalMutation({ args: {}, handler: async (ctx) => { await setMembershipRole(ctx, input); await appendAudit(ctx, entry) } })`,
    ].join("\n")
    expect(detectUnauditedRoleChanges("convex/modules/x/fabricated.ts", fabricated).findings.map((finding) => finding.message)).toEqual([
      "changement de rôle « commented » sans appendAudit(…)",
      "changement de rôle « quoted » sans appendAudit(…)",
    ])
  })

  it("aucun changement de rôle sans journal, aucune référence indirecte à l'aide", () => {
    const findings = roleChangeFiles().flatMap(({ file, text }) => detectUnauditedRoleChanges(file, text).findings)
    expect(findings, formatFindings(findings)).toEqual([])
  })

  it("le cliquet voit bien les trois chemins : la console, la tranche, l'amorçage de la démonstration", () => {
    const callers = roleChangeFiles().flatMap(({ file, text }) => detectUnauditedRoleChanges(file, text).callers)
    // Garde-fou du détecteur : s'il ne trouvait plus rien, il passerait au vert sur un parc nu.
    expect(callers).toEqual(expect.arrayContaining([
      "convex/modules/platform/networkRoles.ts#setNetworkRole",
      "convex/modules/diaspora/membership.ts#setResponsibleRole",
      "convex/modules/platform/networkAdminBootstrap.ts#nameFirst",
      "convex/modules/platform/networkAdminBootstrap.ts#withdraw",
    ]))
  })
})

describe("operator-audit — `allowLastAdmin`, dans le seul retrait de l'amorçage (CH-831)", () => {
  const BOOTSTRAP = "convex/modules/platform/networkAdminBootstrap.ts"

  it("test du test : la porte admise passe ; tout autre emploi est vu (autre fonction, variable, étalement, `false`, guillemets, abrégé)", () => {
    const fabricated = [
      `export const withdraw = internalMutation({ args: {}, handler: async (ctx) => { await setMembershipRole(ctx, { network, personId, role: "member", allowLastAdmin: true }); await appendAudit(ctx, entry) } })`,
      `export const nameFirst = internalMutation({ args: {}, handler: async (ctx) => { await setMembershipRole(ctx, { network, personId, role: "network_admin", allowLastAdmin: true }); await appendAudit(ctx, entry) } })`,
      `const options = { allowLastAdmin: true as const }`,
      `export const spread = internalMutation({ args: {}, handler: async (ctx) => { await setMembershipRole(ctx, { ...{ allowLastAdmin: true }, role: "member" }); await appendAudit(ctx, entry) } })`,
      `export const falsy = internalMutation({ args: {}, handler: async (ctx) => { await setMembershipRole(ctx, { role: "member", allowLastAdmin: false }); await appendAudit(ctx, entry) } })`,
      `export const quoted = internalMutation({ args: {}, handler: async (ctx) => { await setMembershipRole(ctx, { role: "member", "allowLastAdmin": true }); await appendAudit(ctx, entry) } })`,
      `const allowLastAdmin = true as const`,
      `export const shorthand = internalMutation({ args: {}, handler: async (ctx) => { await setMembershipRole(ctx, { role: "member", allowLastAdmin }); await appendAudit(ctx, entry) } })`,
      `type Input = { allowLastAdmin?: true }`,
      `function reads(input: Input) { const { allowLastAdmin: lifted } = input; return input.allowLastAdmin === true && lifted }`,
      `// allowLastAdmin: true dans un commentaire`,
    ].join("\n")
    const { findings, admitted } = detectLastAdminOption(BOOTSTRAP, fabricated)
    expect(findings.map((finding) => finding.line)).toEqual([2, 3, 4, 5, 6, 8])
    expect(admitted).toEqual([LAST_ADMIN_DOOR])
    // La porte ne vaut que dans SON fichier.
    expect(detectLastAdminOption("convex/modules/platform/autre.ts", fabricated).findings.map((finding) => finding.line)).toEqual([1, 2, 3, 4, 5, 6, 8])
  })

  it("aucun emploi de `allowLastAdmin` hors du retrait de l'amorçage", () => {
    const findings = convexSources().flatMap(({ file, text }) => detectLastAdminOption(file, text).findings)
    expect(findings, formatFindings(findings)).toEqual([])
  })

  it("pas d'admission morte : le retrait de l'amorçage passe bien l'option, une seule fois", () => {
    const admitted = convexSources().flatMap(({ file, text }) => detectLastAdminOption(file, text).admitted)
    expect(admitted).toEqual([LAST_ADMIN_DOOR])
  })
})
