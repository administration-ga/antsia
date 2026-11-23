/**
 * Détecteurs PURS des cliquets du moteur. Chacun prend un chemin et un texte et
 * rend des défauts localisés : les tests les appliquent au dépôt réel, et à des
 * sources fabriquées pour prouver qu'ils voient ce qu'ils refusent.
 */
import { dirname, join, resolve } from "node:path"

import ts from "typescript"

import { type Finding, leadingCommentText, lineOf, moduleSpecifiers, parseSource, REPO_ROOT, walk } from "./source-files"

// ─────────────────────────────────────────────────────────────────────────────
// no-cross-product-imports
// ─────────────────────────────────────────────────────────────────────────────

const FORBIDDEN_SPECIFIERS: { pattern: RegExp; reason: string }[] = [
  { pattern: /^@workspace\//, reason: "paquet du socle administration.ga (@workspace/*)" },
  { pattern: /^@pro-convex\//, reason: "backend de PRO.GA" },
  {
    pattern: /(ADMINISTRATION_GA|GABON_DIPLOMATIE|gabon-diplomatie|PRO_GA|SANTE_GA|identite\.ga\/packages)/,
    reason: "chemin vers un autre dépôt du programme",
  },
  { pattern: /(^|\/)DIASPORA_GA\//, reason: "chemin vers le dépôt DIASPORA.GA (passer par son paquet, depuis sa seule tranche)" },
]

/**
 * Paquets d'APPLICATION servies par le moteur : le moteur n'en importe aucun,
 * sauf la tranche de l'application (`convex/modules/<tranche>/`), et seulement
 * son domaine pur (TS sans dépendance) — jamais ses écrans ni ses données.
 */
const APPLICATION_PACKAGES: { prefix: string; slice: string; allowed: RegExp }[] = [
  { prefix: "@diaspora-ga/", slice: "convex/modules/diaspora/", allowed: /^@diaspora-ga\/domain(\/|$)/ },
]

const OWN_GENERATED = join(REPO_ROOT, "convex", "_generated")

export function detectCrossProductImports(file: string, text: string): Finding[] {
  const findings: Finding[] = []
  const source = parseSource(file, text)
  for (const { specifier, line } of moduleSpecifiers(source)) {
    for (const forbidden of FORBIDDEN_SPECIFIERS) {
      if (forbidden.pattern.test(specifier)) {
        findings.push({ file, line, message: `import interdit « ${specifier} » : ${forbidden.reason}` })
      }
    }
    for (const application of APPLICATION_PACKAGES) {
      if (specifier.startsWith(application.prefix) && !(file.startsWith(application.slice) && application.allowed.test(specifier))) {
        findings.push({
          file,
          line,
          message: `import « ${specifier} » : le moteur n'importe un paquet d'application que dans sa tranche (${application.slice}), et seulement son domaine pur`,
        })
      }
    }
    if (specifier.includes("_generated")) {
      if (specifier.startsWith(".")) {
        const target = resolve(dirname(join(REPO_ROOT, file)), specifier)
        if (!target.startsWith(OWN_GENERATED)) {
          findings.push({ file, line, message: `« ${specifier} » ne vise pas le _generated du moteur (convex/_generated)` })
        }
      } else if (!specifier.startsWith("@convex/_generated")) {
        findings.push({ file, line, message: `« ${specifier} » : un _generated ne s'importe que par l'alias @convex/* du moteur` })
      }
    }
  }
  return findings
}

/** Le domaine pur n'importe RIEN d'autre que ses propres fichiers. */
export function detectImpureDomainImports(file: string, text: string): Finding[] {
  const source = parseSource(file, text)
  return moduleSpecifiers(source)
    .filter(({ specifier }) => !specifier.startsWith("./") && !specifier.startsWith("../") && specifier !== "vitest")
    .map(({ specifier, line }) => ({
      file,
      line,
      message: `le domaine pur importe « ${specifier} » (TypeScript pur, zéro dépendance)`,
    }))
}

// ─────────────────────────────────────────────────────────────────────────────
// no-any-validators
// ─────────────────────────────────────────────────────────────────────────────

export function detectAnyValidators(file: string, text: string): Finding[] {
  const findings: Finding[] = []
  const source = parseSource(file, text)
  walk(source, (node) => {
    if (!ts.isCallExpression(node)) return
    const callee = node.expression
    const isAny =
      (ts.isPropertyAccessExpression(callee) && callee.name.text === "any" && ts.isIdentifier(callee.expression) && callee.expression.text === "v") ||
      (ts.isElementAccessExpression(callee) &&
        ts.isIdentifier(callee.expression) &&
        callee.expression.text === "v" &&
        ts.isStringLiteral(callee.argumentExpression) &&
        callee.argumentExpression.text === "any")
    if (isAny) findings.push({ file, line: lineOf(source, node.getStart(source)), message: "validateur permissif v.any — préciser le type" })
  })
  return findings
}

// ─────────────────────────────────────────────────────────────────────────────
// no-unbounded-collect
// ─────────────────────────────────────────────────────────────────────────────

/** Marqueur exigé au-dessus d'un `.collect()` : `// borné : <raison, au moins dix caractères>`. */
export const BOUNDED_COLLECT_MARKER = /born[ée]\s*:\s*\S.{9,}/i

export function detectUnboundedCollect(file: string, text: string): Finding[] {
  const findings: Finding[] = []
  const source = parseSource(file, text)
  walk(source, (node) => {
    if (!ts.isCallExpression(node) || node.arguments.length > 0) return
    if (!ts.isPropertyAccessExpression(node.expression) || node.expression.name.text !== "collect") return
    let statement: ts.Node = node
    while (statement.parent && !ts.isStatement(statement) && !ts.isSourceFile(statement.parent)) statement = statement.parent
    const comments = `${leadingCommentText(source, statement)}\n${leadingCommentText(source, node)}`
    if (!BOUNDED_COLLECT_MARKER.test(comments)) {
      findings.push({
        file,
        line: lineOf(source, node.getStart(source)),
        message: "`.collect()` sans borne justifiée — paginer, `.take(n)`, ou commenter `// borné : <raison>`",
      })
    }
  })
  return findings
}

// ─────────────────────────────────────────────────────────────────────────────
// no-hardcoded-colors
// ─────────────────────────────────────────────────────────────────────────────

const HEX_COLOR = /(?<![\w&/-])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/
const COLOR_FUNCTION = /\b(?:rgba?|hsla?|oklch|oklab|lab|lch|hwb)\(/
const PALETTE = "slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose"
const UTILITY = "bg|text|border|ring|ring-offset|fill|stroke|from|via|to|outline|decoration|divide|placeholder|caret|accent|shadow"
const TAILWIND_PALETTE_CLASS = new RegExp(`(?<![\\w-])(?:[a-z-]+:)*(?:${UTILITY})-(?:(?:${PALETTE})-\\d{2,3}|black|white)(?:/\\d{1,3})?(?![\\w-])`)
const TAILWIND_ARBITRARY_COLOR = new RegExp(`(?<![\\w-])(?:${UTILITY})-\\[(?:#|rgb|hsl|oklch)`)

export function detectHardcodedColors(file: string, text: string): Finding[] {
  const findings: Finding[] = []
  text.split("\n").forEach((content, index) => {
    const line = index + 1
    if (HEX_COLOR.test(content)) findings.push({ file, line, message: "couleur hexadécimale en dur — passer par un jeton de la charte" })
    if (COLOR_FUNCTION.test(content)) findings.push({ file, line, message: "fonction de couleur en dur (rgb/hsl/oklch…) — passer par un jeton" })
    if (TAILWIND_PALETTE_CLASS.test(content)) findings.push({ file, line, message: "classe de palette Tailwind brute — utiliser une classe de rôle (bg-card, text-primary…)" })
    if (TAILWIND_ARBITRARY_COLOR.test(content)) findings.push({ file, line, message: "couleur arbitraire Tailwind — passer par un jeton" })
  })
  return findings
}

// ─────────────────────────────────────────────────────────────────────────────
// no-hardcoded-strings (i18n)
// ─────────────────────────────────────────────────────────────────────────────

export const USER_FACING_ATTRIBUTES = new Set([
  "aria-label",
  "aria-description",
  "aria-placeholder",
  "aria-roledescription",
  "aria-valuetext",
  "title",
  "placeholder",
  "alt",
  "label",
])

const HAS_LETTER = /\p{L}/u

export function detectHardcodedStrings(file: string, text: string): Finding[] {
  const findings: Finding[] = []
  const source = parseSource(file, text)
  const report = (node: ts.Node, what: string) =>
    findings.push({ file, line: lineOf(source, node.getStart(source)), message: `${what} hors i18n — passer par une clé de locale` })
  walk(source, (node) => {
    if (ts.isJsxText(node) && HAS_LETTER.test(node.text.trim())) report(node, `texte « ${node.text.trim().slice(0, 40)} »`)
    if (ts.isJsxAttribute(node) && USER_FACING_ATTRIBUTES.has(node.name.getText(source))) {
      const initializer = node.initializer
      const literal =
        initializer && ts.isStringLiteral(initializer)
          ? initializer
          : initializer && ts.isJsxExpression(initializer) && initializer.expression && ts.isStringLiteralLike(initializer.expression)
            ? initializer.expression
            : undefined
      if (literal && HAS_LETTER.test(literal.text)) report(node, `attribut ${node.name.getText(source)}="${literal.text.slice(0, 40)}"`)
    }
    if (
      ts.isJsxExpression(node) &&
      node.expression &&
      ts.isStringLiteralLike(node.expression) &&
      (ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent)) &&
      HAS_LETTER.test(node.expression.text)
    ) {
      report(node, `texte « ${node.expression.text.slice(0, 40)} »`)
    }
  })
  return findings
}

// ─────────────────────────────────────────────────────────────────────────────
// no-hardcoded-urls
// ─────────────────────────────────────────────────────────────────────────────

const ABSOLUTE_URL = /^(?:https?|wss?):\/\//i
const ROUTE_LIKE = /^\/[\w\-./[\]@:?=&%]*$/
const ROUTE_ATTRIBUTES = new Set(["href", "src", "action", "formAction"])
const ROUTE_PROPERTIES = new Set(["href", "url", "pathname", "callbackURL", "callbackUrl", "redirectTo", "returnTo"])
const NAVIGATION_CALLS = new Set(["push", "replace", "redirect", "permanentRedirect", "prefetch", "fetch", "navigate", "assign"])

export function detectHardcodedUrls(file: string, text: string, options: { routesOnly?: boolean } = {}): Finding[] {
  const findings: Finding[] = []
  const source = parseSource(file, text)
  const report = (node: ts.Node, message: string) => findings.push({ file, line: lineOf(source, node.getStart(source)), message })
  walk(source, (node) => {
    if (!ts.isStringLiteralLike(node)) return
    const parent = node.parent
    if (ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent) || ts.isExternalModuleReference(parent)) return
    if (ts.isCallExpression(parent) && parent.expression.kind === ts.SyntaxKind.ImportKeyword) return
    if (ts.isLiteralTypeNode(parent)) return
    if (!options.routesOnly && ABSOLUTE_URL.test(node.text)) {
      report(node, `URL absolue « ${node.text} » en dur — la lire dans l'environnement ou le catalogue`)
      return
    }
    if (!ROUTE_LIKE.test(node.text)) return
    const jsxAttribute = ts.isJsxAttribute(parent) ? parent : ts.isJsxExpression(parent) && ts.isJsxAttribute(parent.parent) ? parent.parent : undefined
    const inRouteAttribute = jsxAttribute !== undefined && ROUTE_ATTRIBUTES.has(jsxAttribute.name.getText(source))
    const inRouteProperty = ts.isPropertyAssignment(parent) && ROUTE_PROPERTIES.has(parent.name.getText(source))
    const inNavigationCall =
      ts.isCallExpression(parent) &&
      parent.arguments[0] === node &&
      ((ts.isIdentifier(parent.expression) && NAVIGATION_CALLS.has(parent.expression.text)) ||
        (ts.isPropertyAccessExpression(parent.expression) && NAVIGATION_CALLS.has(parent.expression.name.text)))
    if (inRouteAttribute || inRouteProperty || inNavigationCall) {
      report(node, `route « ${node.text} » en dur — passer par la table des routes (adaptateur de routage)`)
    }
  })
  return findings
}

// ─────────────────────────────────────────────────────────────────────────────
// network-scoped-functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Constructeurs qui portent EUX-MÊMES leur garde : `networkId` consommé et
 * `requireMembership` (réseau), opérateur de plateforme vivant (console), ou
 * administrateur du réseau en session prouvée (ADR-0042 : `networkId` consommé,
 * `requireMembership`, rôle, preuve et accès journalisé).
 */
export const NETWORK_SCOPED_BUILDERS = new Set(["networkQuery", "networkMutation", "networkAction", "operatorQuery", "operatorMutation", "networkAdminQuery", "networkAdminMutation"])
/** Constructeurs PUBLICS qu'une fonction sociale doit borner elle-même ou justifier. */
export const PUBLIC_BUILDERS = new Set([
  "query",
  "mutation",
  "action",
  "authQuery",
  "authMutation",
  "authAction",
  "personQuery",
  "personMutation",
  "httpAction",
])
/**
 * Exceptions JUSTIFIÉES (au moins quinze caractères de raison, marqueurs de commentaire ôtés) :
 * - `@publicProjection` : projection publique allowlistée, lisible sans compte (arbitrage A4) ;
 * - `@selfScoped` : la seule personne appelante agit sur elle-même (réglages, adhésion,
 *   consentements) — aucun contenu d'un réseau n'est lu ni écrit.
 */
export const PUBLIC_PROJECTION_TAG = /@(?:publicProjection|selfScoped)\s+\S.{14,}/

/** Noms importés renommés, résolus pour les appels du fichier seulement. */
export function importedNames(source: ts.SourceFile): Map<string, string> {
  const names = new Map<string, string>()
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement)) continue
    const bindings = statement.importClause?.namedBindings
    if (!bindings || !ts.isNamedImports(bindings)) continue
    for (const element of bindings.elements) names.set(element.name.text, element.propertyName?.text ?? element.name.text)
  }
  return names
}

/** Seuls les appels de l'AST comptent : un commentaire ou une chaîne n'est pas une garde. */
export function calledNames(node: ts.Node, names: ReadonlyMap<string, string>): Set<string> {
  const calls = new Set<string>()
  walk(node, (child) => {
    if (ts.isCallExpression(child) && ts.isIdentifier(child.expression)) calls.add(names.get(child.expression.text) ?? child.expression.text)
  })
  return calls
}

/** Appels exportés directement ou par `export { local as publicName }`, sans parcourir les barrels distants. */
export function exportedCalls(source: ts.SourceFile): { name: string; node: ts.Node; statement: ts.Statement; call: ts.CallExpression }[] {
  const variables = new Map<string, { node: ts.VariableDeclaration; statement: ts.VariableStatement }>()
  const exports: { local: string; name: string }[] = []
  for (const statement of source.statements) {
    if (ts.isVariableStatement(statement)) {
      for (const node of statement.declarationList.declarations) {
        if (!ts.isIdentifier(node.name)) continue
        variables.set(node.name.text, { node, statement })
        if (statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)) exports.push({ local: node.name.text, name: node.name.text })
      }
    } else if (ts.isExportDeclaration(statement) && !statement.moduleSpecifier && statement.exportClause && ts.isNamedExports(statement.exportClause)) {
      for (const element of statement.exportClause.elements) if (!element.isTypeOnly) exports.push({ local: element.propertyName?.text ?? element.name.text, name: element.name.text })
    } else if (ts.isExportAssignment(statement) && ts.isIdentifier(statement.expression)) {
      exports.push({ local: statement.expression.text, name: "default" })
    }
  }
  const resolve = (local: string, seen = new Set<string>()): { node: ts.VariableDeclaration; statement: ts.VariableStatement; call: ts.CallExpression } | undefined => {
    if (seen.has(local)) return undefined
    seen.add(local)
    const definition = variables.get(local)
    const initializer = definition?.node.initializer
    if (!definition || !initializer) return undefined
    if (ts.isCallExpression(initializer)) return { ...definition, call: initializer }
    return ts.isIdentifier(initializer) ? resolve(initializer.text, seen) : undefined
  }
  return exports.flatMap(({ local, name }) => {
    const definition = resolve(local)
    return definition ? [{ ...definition, name }] : []
  })
}

/** Patron explicite : la garde est attendue dans le handler, avec son contexte et son argument réseau. */
function hasMembershipGuard(config: ts.Expression | undefined, names: ReadonlyMap<string, string>): boolean {
  if (!config || !ts.isObjectLiteralExpression(config)) return false
  const property = config.properties.find((item) => ts.isPropertyAssignment(item) && item.name.getText() === "handler")
  if (!property || !ts.isPropertyAssignment(property)) return false
  const handler = property.initializer
  if (!ts.isArrowFunction(handler) && !ts.isFunctionExpression(handler)) return false
  const context = handler.parameters[0]?.name
  const args = handler.parameters[1]?.name
  if (!context || !args || !ts.isIdentifier(context) || !ts.isIdentifier(args)) return false
  let guarded = false
  const visit = (node: ts.Node): void => {
    // La définition d'un helper imbriqué ne prouve pas son exécution.
    if (ts.isFunctionDeclaration(node) || ts.isArrowFunction(node) || ts.isFunctionExpression(node)) return
    if (ts.isAwaitExpression(node) && ts.isCallExpression(node.expression)) {
      const call = node.expression
      const [ctx, network] = call.arguments
      if (
        ts.isIdentifier(call.expression) && (names.get(call.expression.text) ?? call.expression.text) === "requireMembership" &&
        ctx && ts.isIdentifier(ctx) && ctx.text === context.text && network &&
        ts.isPropertyAccessExpression(network) && ts.isIdentifier(network.expression) && network.expression.text === args.text && network.name.text === "networkId"
      ) guarded = true
    }
    ts.forEachChild(node, visit)
  }
  visit(handler.body)
  return guarded
}

export function detectUnscopedFunctions(file: string, text: string): Finding[] {
  const findings: Finding[] = []
  const source = parseSource(file, text)
  const names = importedNames(source)
  for (const { name, node, statement, call } of exportedCalls(source)) {
    if (!ts.isIdentifier(call.expression)) continue
    const builder = names.get(call.expression.text) ?? call.expression.text
    if (NETWORK_SCOPED_BUILDERS.has(builder) || !PUBLIC_BUILDERS.has(builder)) continue
    const line = lineOf(source, node.getStart(source))
    const docs = leadingCommentText(source, statement)
      .replace(/\/\*\*?|\*\/|^\s*\*|\/\//gm, " ")
      .replace(/\s+/g, " ")
    if (PUBLIC_PROJECTION_TAG.test(docs)) continue
    const config = call.arguments[0]
    const callsGuard = hasMembershipGuard(config, names)
    const declaresNetwork =
      config !== undefined &&
      ts.isObjectLiteralExpression(config) &&
      config.properties.some(
        (property) =>
          ts.isPropertyAssignment(property) &&
          property.name.getText(source) === "args" &&
          ts.isObjectLiteralExpression(property.initializer) &&
          property.initializer.properties.some((arg) => arg.name?.getText(source) === "networkId"),
      )
    if (!callsGuard || !declaresNetwork) {
      findings.push({
        file,
        line,
        message: `fonction publique « ${name} » (${builder}) sans ${!declaresNetwork ? "argument networkId" : ""}${!declaresNetwork && !callsGuard ? " ni " : ""}${!callsGuard ? "requireMembership" : ""} — utiliser networkQuery/networkMutation, ou justifier par @publicProjection / @selfScoped`,
      })
    }
  }
  return findings
}

// ─────────────────────────────────────────────────────────────────────────────
// public-communication
// ─────────────────────────────────────────────────────────────────────────────

/** Affirmations interdites sur une surface publique (doctrine de communication publique du programme). */
export const FORBIDDEN_CLAIMS: { pattern: RegExp; reason: string }[] = [
  { pattern: /\d+\s?%|pour\s?cent|percent/i, reason: "pourcentage (aucun chiffre non mesuré)" },
  {
    // Une AFFIRMATION d'audit (« audité », « audit de sécurité », « audited »),
    // pas la fonction « journal d'audit » / « audit log » d'une console.
    pattern: /\baudit[ée]e?s?\b|\baudited\b|\baudits?\s+(?:de\s+s[ée]curit[ée]|ind[ée]pendants?|externes?|de\s+conformit[ée])|\bsecurity\s+audit/i,
    reason: "audit affirmé",
  },
  { pattern: /certifi|agr[ée]ment|\bISO\s?\d{4,5}|SecNumCloud|homologu/i, reason: "certification ou agrément affirmé" },
  { pattern: /h[ée]berg/i, reason: "hébergement affirmé" },
  { pattern: /donn[ée]es?\s+(?:sont\s+|restent\s+|stock[ée]es?\s+)?(?:au|sur le sol du)\s+Gabon/i, reason: "localisation des données affirmée" },
  { pattern: /inviolable|100\s?%\s?s[ée]curis|r[ée]volutionnaire|unique au monde|\bleader\b|num[ée]ro un/i, reason: "superlatif non mesurable" },
]

/** Le RGPD ne se cite pas comme droit applicable hors des textes légaux relus par un juriste. */
export const GDPR_MENTION = /\bRGPD\b|\bGDPR\b/

export function flattenMessages(value: unknown, prefix = ""): { key: string; text: string }[] {
  if (typeof value === "string") return [{ key: prefix, text: value }]
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) => flattenMessages(child, prefix ? `${prefix}.${key}` : key))
  }
  return []
}

export function detectPublicClaims(file: string, messages: unknown, options: { numberCheckedPrefixes: readonly string[]; legalPrefixes: readonly string[] }): Finding[] {
  const findings: Finding[] = []
  for (const { key, text } of flattenMessages(messages)) {
    for (const claim of FORBIDDEN_CLAIMS) {
      if (claim.pattern.test(text)) findings.push({ file, line: 0, message: `${key} : ${claim.reason} — « ${text.slice(0, 60)} »` })
    }
    const isLegal = options.legalPrefixes.some((prefix) => key === prefix || key.startsWith(`${prefix}.`))
    if (!isLegal && GDPR_MENTION.test(text)) findings.push({ file, line: 0, message: `${key} : le RGPD n'est cité que dans les textes légaux relus` })
    const isNumberChecked = options.numberCheckedPrefixes.some((prefix) => key === prefix || key.startsWith(`${prefix}.`))
    if (isNumberChecked && /\d/.test(text.replace(/\{\{[^}]*\}\}/g, ""))) {
      findings.push({ file, line: 0, message: `${key} : chiffre en dur sur une surface publique — il doit être lu depuis le système` })
    }
  }
  return findings
}

// ─────────────────────────────────────────────────────────────────────────────
// theme-contract
// ─────────────────────────────────────────────────────────────────────────────

/** Propriétés personnalisées déclarées dans une feuille (`--nom:`). */
export function declaredCustomProperties(css: string): Set<string> {
  const declared = new Set<string>()
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "")
  for (const match of withoutComments.matchAll(/(--[a-zA-Z0-9_-]+)\s*:/g)) {
    if (match[1]) declared.add(match[1])
  }
  return declared
}

/** Propriétés personnalisées LUES (`var(--nom…)`). */
export function usedCustomProperties(text: string): Set<string> {
  const used = new Set<string>()
  // Les commentaires citent parfois un jeton d'un autre produit : seul le code compte.
  const code = text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")
  for (const match of code.matchAll(/var\(\s*(--[a-zA-Z0-9_-]+)/g)) {
    if (match[1]) used.add(match[1])
  }
  return used
}

// ─────────────────────────────────────────────────────────────────────────────
// garde des fichiers : délivrance, dépôt, fraîcheur (owner map §1.5, D05, D06)
// ─────────────────────────────────────────────────────────────────────────────

/** Le SEUL fichier du moteur qui appelle `ctx.storage.getUrl` : la garde de délivrance. */
export const FILE_DELIVERY_GATE = "convex/modules/files/storageGuard.ts"

/** Le SEUL fichier du moteur qui appelle `ctx.storage.generateUploadUrl` : la politique de dépôt. */
export const UPLOAD_POLICY_GATE = "convex/lib/uploadPolicy.ts"

function memberName(expression: ts.Expression): string | undefined {
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text
  if (ts.isElementAccessExpression(expression) && ts.isStringLiteralLike(expression.argumentExpression)) return expression.argumentExpression.text
  return undefined
}

function receiverOf(expression: ts.Expression): ts.Expression | undefined {
  return ts.isPropertyAccessExpression(expression) || ts.isElementAccessExpression(expression) ? expression.expression : undefined
}

/** Accès directs, crochets et alias locaux de stockage/méthode, sans confondre un homonyme hors stockage. */
function callsOf(file: string, text: string, method: string, message: string): Finding[] {
  const findings: Finding[] = []
  const source = parseSource(file, text)
  const declarations: ts.VariableDeclaration[] = []
  walk(source, (node) => { if (ts.isVariableDeclaration(node)) declarations.push(node) })
  const storageAliases = new Set<string>()
  const methodAliases = new Set<string>()
  const isStorage = (expression: ts.Expression): boolean => memberName(expression) === "storage" || (ts.isIdentifier(expression) && storageAliases.has(expression.text))
  const isMethod = (expression: ts.Expression): boolean => {
    const receiver = receiverOf(expression)
    return (memberName(expression) === method && receiver !== undefined && isStorage(receiver)) || (ts.isIdentifier(expression) && methodAliases.has(expression.text))
  }
  for (let changed = true; changed; ) {
    changed = false
    const add = (aliases: Set<string>, name: string): void => { if (!aliases.has(name)) { aliases.add(name); changed = true } }
    for (const declaration of declarations) {
      const initializer = declaration.initializer
      if (!initializer) continue
      if (ts.isIdentifier(declaration.name)) {
        if (isStorage(initializer)) add(storageAliases, declaration.name.text)
        if (isMethod(initializer)) add(methodAliases, declaration.name.text)
      } else if (ts.isObjectBindingPattern(declaration.name)) {
        for (const element of declaration.name.elements) {
          if (!ts.isIdentifier(element.name)) continue
          const property = element.propertyName ? (ts.isIdentifier(element.propertyName) || ts.isStringLiteralLike(element.propertyName) ? element.propertyName.text : undefined) : element.name.text
          if (property === "storage") add(storageAliases, element.name.text)
          if (property === method && isStorage(initializer)) add(methodAliases, element.name.text)
        }
      }
    }
  }
  walk(source, (node) => {
    if (ts.isCallExpression(node) && isMethod(node.expression)) findings.push({ file, line: lineOf(source, node.getStart(source)), message })
  })
  return findings
}

/**
 * Liste NOIRE (le socle tenait une liste blanche, et 21 `getUrl` bruts lui
 * échappaient) : tout `….storage.getUrl(` hors de la garde est un défaut.
 */
export function detectRawGetUrl(file: string, text: string): Finding[] {
  if (file === FILE_DELIVERY_GATE) return []
  return callsOf(file, text, "getUrl", `URL de fichier délivrée hors de la garde : passer par servableUrl / resolveFileDelivery (${FILE_DELIVERY_GATE})`)
}

/** Tout `….storage.generateUploadUrl(` hors de la politique de dépôt est un défaut (usage non déclaré). */
export function detectRawUploadUrl(file: string, text: string): Finding[] {
  if (file === UPLOAD_POLICY_GATE) return []
  return callsOf(file, text, "generateUploadUrl", `URL de dépôt sans usage déclaré : passer par guardUploadUrl (${UPLOAD_POLICY_GATE})`)
}
