/**
 * contextual-registry — CE QU'IL INTERDIT (contrat CONVERSATION-CONTEXTUELLE-V1 §10.5, N45 ;
 * ADR-0025) : qu'une nature de conversation contextuelle existe sans son entrée de registre, sa
 * colonne typée, sa classification de données, sa politique et ses libellés ; qu'une nature
 * RÉSERVÉE (`commerceJobApplication`, `shopContact`) ou inconnue s'y glisse ; que le moteur importe
 * une tranche ailleurs que par `registry.ts` ; que le type du résolveur (`contract.ts`) porte une
 * valeur d'exécution ; qu'une lecture non bornée entre dans le module.
 *
 * COMMENT IL LIT : par l'arbre syntaxique des sources réelles (registre, tables, contrat) et par le
 * texte des inventaires (données, libellés). Chaque règle a son « test du test » sur une source
 * fabriquée. Écrit le 19/10/2026 sans exécution (décision du propriétaire : « Continuer sans vérifier »).
 */
import { CONTEXTUAL_SUPPORTED_KINDS, CONTEXTUAL_REFERENCE_FIELDS, CONTEXTUAL_REFERENCE_TABLES, CONTEXTUAL_RESERVED_KINDS } from "@antsia/social-domain/contextualMessaging"
import ts from "typescript"
import { describe, expect, it } from "vitest"

import { pendingKinds, registryEntries, topLevelInitializer } from "./lib/contextual"
import { type Finding, formatFindings, isTestFile, lineOf, listFiles, moduleSpecifiers, parseSource, readRepoFile } from "./lib/source-files"

const MODULE = "convex/modules/contextualMessaging"
const REGISTRY = `${MODULE}/registry.ts`
const CONTRACT = `${MODULE}/contract.ts`
const TABLES = `${MODULE}/tables.ts`
const SLICE_RESOLVERS = new Set(["../diaspora/conversationContexts", "../professionals/conversationContexts"])

/** Les natures admises par le validateur d'objet ouvrant, avec la table de leur identifiant. */
export function contextValidatorKinds(file: string, text: string): { kind: string; table: string }[] {
  const source = parseSource(file, text)
  const union = topLevelInitializer(source, "contextualContextValidator")
  const found: { kind: string; table: string }[] = []
  if (!union || !ts.isCallExpression(union)) return found
  for (const member of union.arguments) {
    if (!ts.isCallExpression(member)) continue
    const fields = member.arguments[0]
    if (!fields || !ts.isObjectLiteralExpression(fields)) continue
    let kind = "", table = ""
    for (const field of fields.properties) {
      if (!ts.isPropertyAssignment(field) || !ts.isCallExpression(field.initializer)) continue
      const argument = field.initializer.arguments[0]
      if (!argument || !ts.isStringLiteral(argument)) continue
      if (field.name.getText(source) === "kind") kind = argument.text
      if (field.name.getText(source) === "id") table = argument.text
    }
    found.push({ kind, table })
  }
  return found
}

/** Un fichier du module qui importe une tranche hors du registre (ou le registre, autre chose que les résolveurs). */
export function detectSliceImports(file: string, text: string): Finding[] {
  const source = parseSource(file, text)
  return moduleSpecifiers(source).flatMap(({ specifier, line }) => {
    const slice = /(^|\/)(diaspora|professionals)(\/|$)/u.test(specifier) || specifier.startsWith("@diasporale/")
    if (!slice) return []
    if (file === REGISTRY && SLICE_RESOLVERS.has(specifier)) return []
    return [{ file, line, message: `import de tranche « ${specifier} » hors de registry.ts (ou autre que les résolveurs)` }]
  })
}

/** `contract.ts` : des types seulement — aucun import de valeur, aucune déclaration d'exécution. */
export function detectRuntimeContract(file: string, text: string): Finding[] {
  const source = parseSource(file, text)
  const findings: Finding[] = []
  for (const statement of source.statements) {
    const line = lineOf(source, statement.getStart(source))
    if (ts.isImportDeclaration(statement)) {
      const clause = statement.importClause
      const typeOnly = clause?.isTypeOnly === true || (clause?.namedBindings !== undefined && ts.isNamedImports(clause.namedBindings) && clause.name === undefined && clause.namedBindings.elements.every((element) => element.isTypeOnly))
      if (!typeOnly) findings.push({ file, line, message: "import d'une valeur dans le contrat du résolveur" })
      continue
    }
    if (ts.isTypeAliasDeclaration(statement) || ts.isInterfaceDeclaration(statement)) continue
    if (ts.isExportDeclaration(statement) && statement.isTypeOnly) continue
    findings.push({ file, line, message: "déclaration d'exécution dans le contrat du résolveur (types seulement)" })
  }
  return findings
}

describe("contextual-registry — natures fermées, registre unique, contrat sans valeur", () => {
  it("le registre porte EXACTEMENT une entrée par nature V1, chacune résolveur ou repli `null`", () => {
    const entries = registryEntries(REGISTRY, readRepoFile(REGISTRY))
    expect(entries.map((entry) => entry.kind).sort()).toEqual([...CONTEXTUAL_SUPPORTED_KINDS].sort())
    expect(entries.filter((entry) => entry.value === "other")).toEqual([])
  })

  it("les natures en attente sont exactement celles dont l'entrée vaut `null` (aucune exception morte)", () => {
    const entries = registryEntries(REGISTRY, readRepoFile(REGISTRY))
    const pending = pendingKinds(REGISTRY, readRepoFile(REGISTRY))
    expect(pending).not.toBeNull()
    expect([...(pending ?? [])].sort()).toEqual(entries.filter((entry) => entry.value === "null").map((entry) => entry.kind).sort())
  })

  it("aucune nature réservée ni inconnue : domaine, validateur et registre disent la même liste", () => {
    for (const reserved of CONTEXTUAL_RESERVED_KINDS) expect((CONTEXTUAL_SUPPORTED_KINDS as readonly string[]).includes(reserved), reserved).toBe(false)
    const validator = contextValidatorKinds(TABLES, readRepoFile(TABLES))
    expect(validator.map((entry) => entry.kind).sort()).toEqual([...CONTEXTUAL_SUPPORTED_KINDS].sort())
    // L'identifiant de chaque nature vise SA table : un identifiant d'une autre nature est refusé par le validateur.
    for (const entry of validator) expect(entry.table, entry.kind).toBe(CONTEXTUAL_REFERENCE_TABLES[entry.kind as keyof typeof CONTEXTUAL_REFERENCE_TABLES])
  })

  it("chaque nature a sa colonne typée et son index dans les tables", () => {
    const tables = readRepoFile(TABLES)
    for (const kind of CONTEXTUAL_SUPPORTED_KINDS) {
      const field = CONTEXTUAL_REFERENCE_FIELDS[kind]
      const table = CONTEXTUAL_REFERENCE_TABLES[kind]
      expect(tables, `${kind} : colonne`).toContain(`${field}: v.optional(v.id("${table}"))`)
      expect(tables, `${kind} : index`).toMatch(new RegExp(`\\.index\\("by_[A-Za-z]+", \\["${field}"\\]\\)`, "u"))
    }
  })

  it("chaque nature est classée (parents de l'effacement) ; les tables du module ont leur disposition", () => {
    const policies = readRepoFile("convex/modules/people/dataPolicies.ts")
    const thread = /contextualThreads:\s*\{owners:\s*\[\],\s*parents:\s*\[([^\]]*)\]\}/u.exec(policies)
    expect(thread, "contextualThreads : owners vides et parents déclarés").not.toBeNull()
    const parents = (thread?.[1] ?? "").split(",").map((part) => part.trim().replace(/["']/g, "")).filter(Boolean)
    expect(parents.sort()).toEqual(CONTEXTUAL_SUPPORTED_KINDS.map((kind) => CONTEXTUAL_REFERENCE_FIELDS[kind]).sort())
    for (const table of ["contextualMessages", "contextualPersonStates", "contextualPolicies"]) expect(policies, table).toMatch(new RegExp(`\\b${table}:\\s*\\{`, "u"))
  })

  it("chaque nature a sa politique en console et ses libellés FR/EN", () => {
    for (const locale of ["fr", "en"] as const) {
      const messages = JSON.parse(readRepoFile(`apps/admin_antsia_ga/src/i18n/locales/${locale}/operations.json`)) as Record<string, unknown>
      const block = messages.contextualPolicy as { kinds?: Record<string, unknown> } | undefined
      for (const kind of CONTEXTUAL_SUPPORTED_KINDS) expect(typeof block?.kinds?.[kind], `${locale} : ${kind}`).toBe("string")
      const surfaces = messages.surfaces as Record<string, unknown> | undefined
      expect(typeof surfaces?.contextualMessage, `${locale} : surface`).toBe("string")
    }
  })

  it("le moteur n'importe la tranche que par registry.ts, et seulement ses résolveurs", () => {
    const findings = listFiles([MODULE], [".ts"]).filter((file) => !isTestFile(file)).flatMap((file) => detectSliceImports(file, readRepoFile(file)))
    expect(findings, formatFindings(findings)).toEqual([])
  })

  it("le contrat du résolveur ne porte aucune valeur d'exécution", () => {
    const findings = detectRuntimeContract(CONTRACT, readRepoFile(CONTRACT))
    expect(findings, formatFindings(findings)).toEqual([])
  })

  it("aucune lecture `.collect()` dans le module (appels de l'arbre syntaxique, pas les commentaires)", () => {
    const offenders: Finding[] = []
    for (const file of listFiles([MODULE], [".ts"]).filter((path) => !isTestFile(path))) {
      const source = parseSource(file, readRepoFile(file))
      const visit = (node: ts.Node): void => {
        if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === "collect") offenders.push({ file, line: lineOf(source, node.getStart(source)), message: "lecture non bornée" })
        ts.forEachChild(node, visit)
      }
      visit(source)
    }
    expect(offenders, formatFindings(offenders)).toEqual([])
  })

  it("test du test : entrée manquante, valeur opaque, nature en attente fantôme", () => {
    const fabricated = [
      "export const CONTEXTUAL_PENDING_KINDS: readonly ContextualKind[] = [\"diasporaMentoring\"]",
      "export const CONTEXTUAL_REGISTRY: ContextualRegistry = {",
      "  diasporaServiceRequest: DIASPORA_CONVERSATION_CONTEXTS.diasporaServiceRequest,",
      "  diasporaJobApplication: someOtherResolver,",
      "}",
    ].join("\n")
    const entries = registryEntries(REGISTRY, fabricated)
    expect(entries.map((entry) => entry.kind).sort()).not.toEqual([...CONTEXTUAL_SUPPORTED_KINDS].sort())
    expect(entries.filter((entry) => entry.value === "other").map((entry) => entry.kind)).toEqual(["diasporaJobApplication"])
    expect(pendingKinds(REGISTRY, fabricated)).toEqual(["diasporaMentoring"])
  })

  it("MP09 : le nouveau résolveur ne peut être emprunté à la tranche historique, ni inversement", () => {
    const source = 'export const CONTEXTUAL_REGISTRY = { professionalCollaboration: DIASPORA_CONVERSATION_CONTEXTS.professionalCollaboration, diasporaMentoring: PROFESSIONAL_CONVERSATION_CONTEXTS.diasporaMentoring }'
    expect(registryEntries(REGISTRY, source).map(entry => entry.value)).toEqual(["other", "other"])
    const valid = 'export const CONTEXTUAL_REGISTRY = { professionalCollaboration: PROFESSIONAL_CONVERSATION_CONTEXTS.professionalCollaboration }'
    expect(registryEntries(REGISTRY, valid).map(entry => entry.value)).toEqual(["resolver"])
  })

  it("test du test : import de tranche hors registre, contrat porteur de valeur", () => {
    expect(detectSliceImports(`${MODULE}/threads.ts`, 'import { x } from "../diaspora/serviceRequests"')).toHaveLength(1)
    expect(detectSliceImports(`${MODULE}/threads.ts`, 'import { y } from "@diasporale/domain"')).toHaveLength(1)
    for (const specifier of SLICE_RESOLVERS) expect(detectSliceImports(REGISTRY, `import { CONTEXTS } from "${specifier}"`)).toEqual([])
    expect(detectSliceImports(`${MODULE}/threads.ts`, 'import { x } from "../professionals/read"')).toHaveLength(1)
    expect(detectSliceImports(REGISTRY, 'import { x } from "../professionals/read"')).toHaveLength(1)
    expect(detectSliceImports(REGISTRY, 'import { z } from "../diaspora/serviceRequests"')).toHaveLength(1)
    const contract = ['import type { Id } from "../../_generated/dataModel"', 'import { v } from "convex/values"', "export type A = Id<\"pages\">", "export const B = 1"].join("\n")
    expect(detectRuntimeContract(CONTRACT, contract).map((finding) => finding.line)).toEqual([2, 4])
  })
})
