/**
 * network-feature-gates (ADR-0041) — CE QU'IL INTERDIT : qu'une fonction de réseau qui
 * sert une fonctionnalité activable d'un réseau gouverné échappe à sa garde.
 *
 *   · la tranche `diaspora` : chaque fichier (hors tests) est classé dans son manifeste
 *     (`DIASPORA_SLICE_MANIFEST.featureFiles` : une clé de `NETWORK_FEATURES`, ou `core`) ;
 *     toute fonction de réseau (`networkQuery`, `networkMutation`, `networkAction`) d'un
 *     fichier classé sous une clé porte `feature: "<clé>"` ; un fichier du socle n'en porte
 *     aucune (une garde posée hors de sa clé serait un classement faux) ;
 *   · les modules du moteur qu'une fonctionnalité gouverne tout entiers (`FEATURE_MODULES`) :
 *     chacune de leurs fonctions de réseau porte la clé du module ;
 *   · chaque clé garde au moins une fonction : une fonctionnalité sans garde serait un
 *     interrupteur qui ne coupe rien. SEULE exception, les modules d'AFFICHAGE
 *     (`DISPLAY_ONLY_FEATURES`, CH-863) : une clé qui règle une entrée de l'application du
 *     réseau et ne sert aucune fonction du moteur. Leur liste est FERMÉE et épinglée ici, chaque
 *     clé avec sa raison ; une clé exemptée qui garderait une fonction, classerait un fichier
 *     ou gouvernerait un module du moteur est une exemption fausse, et le cliquet échoue. Le
 *     serveur (`convex/`, hors tests) ne la nomme même jamais en chaîne : ni option `feature`,
 *     ni garde directe (`requireNetworkFeature`), ni classement.
 *   · ADR-0042 (CH-815 A6) : dans la tranche, les constructeurs de l'administrateur du réseau
 *     (`networkAdminQuery`, `networkAdminMutation`) se lisent comme ceux du membre — la mesure du
 *     pilote, lue par l'application d'administration, reste gardée par sa clé. Les modules du
 *     moteur (`FEATURE_MODULES`) ne lisent que les constructeurs du membre : y garder une
 *     fonction d'administration est la décision du lot qui l'écrit.
 *
 * COMMENT IL LIT : par l'arbre syntaxique — le manifeste comme les fonctions ; l'option
 * doit être une chaîne littérale dans l'objet passé au constructeur.
 */
import { NETWORK_FEATURES, type NetworkFeature } from "@antsia/social-domain/networkFeatures"
import ts from "typescript"
import { describe, expect, it } from "vitest"

import { exportedCalls, importedNames } from "./lib/detectors"
import { type Finding, formatFindings, isTestFile, lineOf, listFiles, parseSource, readRepoFile } from "./lib/source-files"

const SLICE_DIRECTORY = "convex/modules/diaspora"
const SLICE_MANIFEST = `${SLICE_DIRECTORY}/manifest.ts`

/** Les modules du moteur qu'une seule fonctionnalité gouverne tout entiers (pages, évènements, groupes thématiques). */
export const FEATURE_MODULES: Readonly<Record<string, NetworkFeature>> = {
  "convex/modules/pages": "pages",
  "convex/modules/events": "groupsAndEvents",
  "convex/modules/thematicGroups": "groupsAndEvents",
}

/**
 * Les modules d'AFFICHAGE (CH-863) : les clés de `NETWORK_FEATURES` qui ne gardent AUCUNE fonction
 * du moteur, chacune avec sa raison. Une telle clé règle ce que l'application du réseau monte ou
 * retire ; le moteur tient sa ligne, sa bascule motivée et son journal (`modules/networks/features.ts`),
 * mais n'a rien à refuser puisqu'il ne sert rien pour elle. Liste FERMÉE : une clé n'y entre que par
 * une décision relue (un test l'épingle en toutes lettres), jamais pour faire taire le cliquet
 * d'un module qui sert des fonctions.
 */
export const DISPLAY_ONLY_FEATURES: Readonly<Partial<Record<NetworkFeature, string>>> = {
  consulateGateway: "module d'affichage : un lien sortant de l'application (l'entrée « consulat.ga » du menu des membres de DIASPORA.GA), aucune fonction du moteur",
}

/** Les clés sans garde qui ne sont pas des modules d'affichage déclarés : des interrupteurs qui ne coupent rien. */
export function ungatedFeatures(features: readonly string[], gated: ReadonlySet<string>, displayOnly: readonly string[]): string[] {
  return features.filter((feature) => !gated.has(feature) && !displayOnly.includes(feature))
}

/**
 * Les exemptions FAUSSES : une clé inconnue, ou une clé déclarée « d'affichage » qui garde pourtant
 * une fonction, classe un fichier de la tranche ou gouverne un module du moteur.
 */
export function falseDisplayOnly(displayOnly: readonly string[], features: readonly string[], gated: ReadonlySet<string>, classified: ReadonlySet<string>): string[] {
  return displayOnly.filter((feature) => !features.includes(feature) || gated.has(feature) || classified.has(feature))
}

/** Le texte nomme-t-il la clé en chaîne littérale (`"clé"` ou `'clé'`) ? Une mention entre accents graves, dans un commentaire, n'en est pas une. */
export function namesFeatureLiteral(text: string, feature: string): boolean {
  return text.includes(`"${feature}"`) || text.includes(`'${feature}'`)
}

const NETWORK_BUILDERS: ReadonlySet<string> = new Set(["networkQuery", "networkMutation", "networkAction"])
/** Dans la tranche, ceux de l'administrateur du réseau aussi (ADR-0042, CH-815 A6). */
const SLICE_BUILDERS: ReadonlySet<string> = new Set([...NETWORK_BUILDERS, "networkAdminQuery", "networkAdminMutation"])

type Classification = NetworkFeature | "core"

/** La carte `featureFiles` du manifeste, lue dans son arbre syntaxique. */
export function manifestFeatureFiles(text: string): Map<string, string> {
  const source = parseSource(SLICE_MANIFEST, text)
  const map = new Map<string, string>()
  const visit = (node: ts.Node): void => {
    if (ts.isPropertyAssignment(node) && node.name.getText(source) === "featureFiles") {
      let value: ts.Expression = node.initializer
      while (ts.isSatisfiesExpression(value) || ts.isAsExpression(value) || ts.isParenthesizedExpression(value)) value = value.expression
      if (ts.isObjectLiteralExpression(value)) {
        for (const property of value.properties) {
          if (!ts.isPropertyAssignment(property) || !ts.isStringLiteral(property.initializer)) continue
          const key = ts.isStringLiteral(property.name) ? property.name.text : property.name.getText(source)
          map.set(key, property.initializer.text)
        }
      }
      return
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return map
}

/** Les fonctions de réseau exportées d'un fichier, et l'option `feature` qu'elles portent (`null` : aucune). */
export function networkFunctionFeatures(file: string, text: string, builders: ReadonlySet<string> = NETWORK_BUILDERS): { name: string; line: number; feature: string | null }[] {
  const source = parseSource(file, text)
  const names = importedNames(source)
  const out: { name: string; line: number; feature: string | null }[] = []
  for (const { name, node, call } of exportedCalls(source)) {
    if (!ts.isIdentifier(call.expression)) continue
    const builder = names.get(call.expression.text) ?? call.expression.text
    if (!builders.has(builder)) continue
    const config = call.arguments[0]
    let feature: string | null = null
    if (config && ts.isObjectLiteralExpression(config)) {
      for (const property of config.properties) {
        if (ts.isPropertyAssignment(property) && property.name.getText(source) === "feature") {
          feature = ts.isStringLiteral(property.initializer) ? property.initializer.text : `<non littérale : ${property.initializer.getText(source)}>`
        }
      }
    }
    out.push({ name, line: lineOf(source, node.getStart(source)), feature })
  }
  return out
}

/** Les écarts d'un fichier à sa classification. */
export function detectFeatureGateGaps(file: string, text: string, expected: Classification, builders: ReadonlySet<string> = NETWORK_BUILDERS): Finding[] {
  const findings: Finding[] = []
  for (const fn of networkFunctionFeatures(file, text, builders)) {
    if (expected === "core") {
      if (fn.feature !== null) findings.push({ file, line: fn.line, message: `« ${fn.name} » porte feature « ${fn.feature} » dans un fichier du socle — classer le fichier sous sa clé` })
    } else if (fn.feature !== expected) {
      findings.push({ file, line: fn.line, message: `« ${fn.name} » doit porter feature: "${expected}" (trouvé : ${fn.feature ?? "aucune"})` })
    }
  }
  return findings
}

const sliceFiles = () => listFiles([SLICE_DIRECTORY], [".ts"]).filter((file) => !isTestFile(file))
const isClassification = (value: string): value is Classification => value === "core" || (NETWORK_FEATURES as readonly string[]).includes(value)

/** Les clés qu'au moins une fonction du dépôt porte : la tranche (membre et administrateur du réseau) et les modules gouvernés. */
function gatedFeatures(): Set<string> {
  const gated = new Set<string>()
  for (const file of sliceFiles()) {
    for (const fn of networkFunctionFeatures(file, readRepoFile(file), SLICE_BUILDERS)) if (fn.feature !== null) gated.add(fn.feature)
  }
  for (const file of listFiles(Object.keys(FEATURE_MODULES), [".ts"]).filter((path) => !isTestFile(path))) {
    for (const fn of networkFunctionFeatures(file, readRepoFile(file))) if (fn.feature !== null) gated.add(fn.feature)
  }
  return gated
}

describe("network-feature-gates — chaque fonctionnalité activable est gardée (ADR-0041)", () => {
  it("chaque fichier de la tranche est classé dans le manifeste, ni plus ni moins, sous une clé connue ou « core »", () => {
    const map = manifestFeatureFiles(readRepoFile(SLICE_MANIFEST))
    const files = sliceFiles().map((file) => file.slice(SLICE_DIRECTORY.length + 1))
    expect(files.filter((file) => !map.has(file)), "fichiers de la tranche absents de featureFiles").toEqual([])
    expect([...map.keys()].filter((file) => !files.includes(file)), "entrées de featureFiles sans fichier").toEqual([])
    expect([...map.entries()].filter(([, value]) => !isClassification(value)), "classements inconnus").toEqual([])
  })

  it("chaque fonction de réseau d'un fichier classé porte sa clé ; le socle n'en porte aucune", () => {
    const map = manifestFeatureFiles(readRepoFile(SLICE_MANIFEST))
    const findings: Finding[] = []
    for (const file of sliceFiles()) {
      const expected = map.get(file.slice(SLICE_DIRECTORY.length + 1))
      if (expected === undefined || !isClassification(expected)) continue
      findings.push(...detectFeatureGateGaps(file, readRepoFile(file), expected, SLICE_BUILDERS))
    }
    for (const [directory, feature] of Object.entries(FEATURE_MODULES)) {
      for (const file of listFiles([directory], [".ts"]).filter((path) => !isTestFile(path))) findings.push(...detectFeatureGateGaps(file, readRepoFile(file), feature))
    }
    expect(findings, formatFindings(findings)).toEqual([])
  })

  it("chaque clé garde au moins une fonction, hors les modules d'affichage déclarés", () => {
    expect(ungatedFeatures(NETWORK_FEATURES, gatedFeatures(), Object.keys(DISPLAY_ONLY_FEATURES))).toEqual([])
  })

  it("modules d'affichage (CH-863) : une liste fermée, épinglée et motivée, dont aucune clé ne garde une fonction, ne classe un fichier ni ne gouverne un module", () => {
    // Épinglée en toutes lettres : y ajouter une clé oblige à venir l'écrire ici, avec sa raison.
    expect(Object.keys(DISPLAY_ONLY_FEATURES)).toEqual(["consulateGateway"])
    for (const [feature, reason] of Object.entries(DISPLAY_ONLY_FEATURES)) expect(reason.trim().length, `raison de ${feature}`).toBeGreaterThanOrEqual(40)
    const classified = new Set<string>([...manifestFeatureFiles(readRepoFile(SLICE_MANIFEST)).values(), ...Object.values(FEATURE_MODULES)])
    expect(falseDisplayOnly(Object.keys(DISPLAY_ONLY_FEATURES), NETWORK_FEATURES, gatedFeatures(), classified), "exemptions fausses").toEqual([])
    // Le serveur ne la nomme jamais : une garde directe (`requireNetworkFeature(ctx, network, "clé")`) échapperait à la lecture des options.
    const server = listFiles(["convex"], [".ts"]).filter((file) => !isTestFile(file))
    for (const feature of Object.keys(DISPLAY_ONLY_FEATURES)) {
      expect(server.filter((file) => namesFeatureLiteral(readRepoFile(file), feature)), `fichiers du serveur qui nomment « ${feature} »`).toEqual([])
    }
  })

  it("test du test : une clé sans garde hors liste est vue ; une exemption inconnue, gardée ou classée est fausse", () => {
    const features = ["pages", "jobs", "gateway"]
    expect(ungatedFeatures(features, new Set(["pages", "jobs"]), ["gateway"])).toEqual([])
    expect(ungatedFeatures(features, new Set(["pages"]), ["gateway"])).toEqual(["jobs"])
    expect(ungatedFeatures(features, new Set(["pages", "jobs"]), [])).toEqual(["gateway"])
    expect(falseDisplayOnly(["gateway"], features, new Set(["pages", "jobs"]), new Set(["pages", "jobs", "core"]))).toEqual([])
    expect(falseDisplayOnly(["ghost"], features, new Set(), new Set())).toEqual(["ghost"])
    expect(falseDisplayOnly(["gateway"], features, new Set(["gateway"]), new Set())).toEqual(["gateway"])
    expect(falseDisplayOnly(["gateway"], features, new Set(), new Set(["gateway"]))).toEqual(["gateway"])
    // Une garde directe ou une option nomment la clé en chaîne ; un commentaire qui la cite entre accents graves, non.
    expect(namesFeatureLiteral('await requireNetworkFeature(ctx, ctx.network, "gateway")', "gateway")).toBe(true)
    expect(namesFeatureLiteral("export const f = networkQuery({ feature: 'gateway', args: {} })", "gateway")).toBe(true)
    expect(namesFeatureLiteral(" * Un module d'affichage (`gateway`) ne garde aucune fonction.", "gateway")).toBe(false)
    expect(namesFeatureLiteral('feature: "gatewayPlus"', "gateway")).toBe(false)
  })

  it("test du test : clé absente, clé fausse, clé dans le socle, clé non littérale ; les autres constructeurs ignorés", () => {
    const source = [
      'import { networkMutation as write, networkQuery } from "../../lib/functions"',
      'export const ok = networkQuery({ feature: "jobs", args: {}, handler: async () => null })',
      "export const missing = networkQuery({ args: {}, handler: async () => null })",
      'export const wrong = write({ feature: "pages", args: {}, handler: async () => null })',
      "const KEY = \"jobs\"",
      "export const dynamic = networkQuery({ feature: KEY, args: {}, handler: async () => null })",
      "export const hidden = internalQuery({ args: {}, handler: async () => null })",
      "export const console = operatorQuery({ args: {}, handler: async () => null })",
    ].join("\n")
    expect(detectFeatureGateGaps("convex/modules/diaspora/fixture.ts", source, "jobs").map((finding) => finding.line)).toEqual([3, 4, 6])
    expect(detectFeatureGateGaps("convex/modules/diaspora/fixture.ts", source, "core").map((finding) => finding.line)).toEqual([2, 4, 6])
    const manifest = 'export const M = { featureFiles: { "a.ts": "jobs", "b.ts": "core" } satisfies Readonly<Record<string, string>> } as const'
    expect([...manifestFeatureFiles(manifest).entries()]).toEqual([["a.ts", "jobs"], ["b.ts", "core"]])
  })

  it("test du test (ADR-0042, CH-815 A6) : dans la tranche, une fonction de l'administrateur du réseau porte sa clé ; hors tranche, elle est ignorée", () => {
    const source = [
      'import { networkAdminQuery as adminRead, networkAdminMutation } from "../../lib/functions"',
      'export const gated = adminRead({ feature: "pilotMetrics", args: {}, handler: async () => null })',
      "export const open = networkAdminMutation({ args: {}, handler: async () => null })",
    ].join("\n")
    expect(detectFeatureGateGaps("convex/modules/diaspora/fixture.ts", source, "pilotMetrics", SLICE_BUILDERS).map((finding) => finding.line)).toEqual([3])
    expect(detectFeatureGateGaps("convex/modules/diaspora/fixture.ts", source, "core", SLICE_BUILDERS).map((finding) => finding.line)).toEqual([2])
    expect(detectFeatureGateGaps("convex/modules/pages/fixture.ts", source, "pages")).toEqual([])
  })

  it("la mesure du pilote est gardée par sa clé jusque dans l'application d'administration (CH-815 A6)", () => {
    const file = `${SLICE_DIRECTORY}/pilotMetrics.ts`
    const functions = networkFunctionFeatures(file, readRepoFile(file), SLICE_BUILDERS)
    expect(functions.filter((fn) => fn.name === "pilotMetrics" || fn.name === "pilotMetricsAccess")).toEqual([
      expect.objectContaining({ name: "pilotMetrics", feature: "pilotMetrics" }),
      expect.objectContaining({ name: "pilotMetricsAccess", feature: "pilotMetrics" }),
    ])
    // Elles ne sont plus des fonctions de membre : le constructeur de l'administrateur les porte.
    expect(networkFunctionFeatures(file, readRepoFile(file)).map((fn) => fn.name)).toEqual([])
  })
})
