/**
 * Détecteur PUR du cliquet `no-deployment-identifiers` (EX-01, affiné par
 * EX-20) : les dépôts d'ANTSIA sont publics, aucun identifiant interne
 * d'hébergement n'y a sa place. Le cliquet ne peut pas contenir la liste des
 * vrais identifiants : il les reconnaît par leur FORME.
 *
 * EX-20 a resserré chaque forme sur ce que produit réellement le fournisseur,
 * pour que le cliquet puisse relire tout le dépôt sans crier au loup : appliqué
 * à `docs/`, l'ancienne forme « mot-mot-nombre » signalait surtout des noms de
 * captures (`…-390`, `…-834`), des variables CSS (`--…-500`) et des classes
 * utilitaires (`bg-…-500`). Chaque règle est justifiée ci-dessous et éprouvée
 * par le « test du test » du cliquet, dans les deux sens.
 *
 * Une valeur manifestement fictive (marqueur « exemple », « test », nom du
 * produit…, voir `FICTIVE_MARKERS`) n'est jamais signalée ; une forme générique
 * (`<nom>.convex.cloud`, `${name}.convex.cloud`) non plus.
 */
import type { Finding } from "./source-files"

export type IdentifierKind =
  | "convex-deployment"
  | "convex-deployment-target"
  | "convex-host"
  | "hosting-host"
  | "hosting-deployment-short"
  | "cloud-run-host"
  | "hosting-id"
  | "hosting-team-slug"
  | "convex-deploy-key"

export type IdentifierPattern = { kind: IdentifierKind; pattern: RegExp; message: string }

/**
 * Largeurs d'écran (px) des recettes et des paliers : `apres-fil-390`,
 * `reglages-sable-834` nomment une capture, pas un déploiement. Exclues de la
 * seule forme NUE : la forme hôte (`….convex.cloud`) et la forme ciblée
 * (`prod:…`) restent vues quel que soit le nombre.
 */
export const SCREEN_WIDTHS = ["320", "360", "375", "390", "393", "402", "412", "414", "428", "430", "768", "800", "820", "834"] as const

/**
 * Préfixes des utilitaires Tailwind suivis d'une teinte ou d'une échelle
 * (`bg-blue-500`, `backdrop-saturate-150`) : une classe, jamais un déploiement
 * (Convex ne tire pas ses noms de ce vocabulaire).
 */
export const TAILWIND_UTILITY_PREFIXES = [
  "bg", "text", "border", "ring", "fill", "stroke", "from", "via", "to", "shadow", "outline", "divide", "accent", "caret", "decoration", "placeholder", "backdrop",
] as const

/** Ni lettre, ni chiffre, ni soulignement, ni tiret avant : le jeton n'est pas la fin d'un nom composé (`--x-y-500`, `fil-mobile-clair-390`). */
const START = String.raw`(?<![\p{L}\p{N}_-])`
/** Ni prolongé, ni suivi d'un domaine ou d'une extension (`….convex.cloud` relève de la forme hôte, `…-390.png` est un fichier). */
const END = String.raw`(?![\p{L}\p{N}_-]|\.[\p{L}\p{N}])`

export const DEPLOYMENT_IDENTIFIER_PATTERNS: readonly IdentifierPattern[] = [
  {
    kind: "convex-deployment",
    // Convex nomme un déploiement en nuage `<adjectif>-<animal>-<nombre de 100 à 999>` : un nombre à zéro
    // initial (`…-001`) est un identifiant de test séquentiel ; voir aussi les largeurs et les utilitaires.
    pattern: new RegExp(
      String.raw`${START}(?!(?:${TAILWIND_UTILITY_PREFIXES.join("|")})-)[a-z]{2,}-[a-z]{2,}-(?!(?:${SCREEN_WIDTHS.join("|")})(?!\d))[1-9]\d{2}${END}`,
      "gu",
    ),
    message: "nom de déploiement Convex (forme mot-mot-nombre)",
  },
  {
    kind: "convex-deployment-target",
    pattern: /\b(?:prod|dev|preview):[a-z]+-[a-z]+-\d{3}(?!\d)/gu,
    message: "déploiement Convex visé par son nom (prod:/dev:/preview:)",
  },
  {
    kind: "convex-host",
    // Région facultative : `<nom>.<région>.convex.cloud`. Un hôte d'une autre forme (`x.convex.cloud`) n'est pas un déploiement réel.
    pattern: new RegExp(String.raw`${START}[a-z]+-[a-z]+-\d{3}(?:\.[a-z0-9-]+)?\.convex\.(?:cloud|site)\b`, "gu"),
    message: "adresse nommée d'un déploiement Convex",
  },
  { kind: "hosting-host", pattern: /\b[a-z0-9][a-z0-9-]*\.vercel\.app\b/gu, message: "adresse d'un projet ou d'un déploiement de l'hébergeur des sites" },
  {
    kind: "hosting-deployment-short",
    // `<projet>-<empreinte de 9 caractères>` : nom court d'un déploiement de l'hébergeur des sites. L'empreinte
    // mêle chiffres et lettres (un chiffre suivi plus loin d'une lettre) : `domain475` ou `20261021` n'en sont pas.
    pattern: new RegExp(
      String.raw`(?<![\p{L}\p{N}_./-])[a-z]{3,}(?:-[a-z]+)*-(?=[a-z0-9]{9}${END})(?=[a-z]*\d[a-z0-9]*[a-z])[a-z0-9]{9}`,
      "gu",
    ),
    message: "nom court d'un déploiement de l'hébergeur des sites (projet-empreinte)",
  },
  { kind: "cloud-run-host", pattern: /\b[a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)*\.run\.app\b/gu, message: "adresse d'un service Cloud Run" },
  { kind: "hosting-id", pattern: /\b(?:prj|team|dpl)_[A-Za-z0-9]{16,}\b/gu, message: "identifiant de projet, d'équipe ou de déploiement de l'hébergeur" },
  { kind: "hosting-team-slug", pattern: /\b[a-z0-9-]+-projects-[a-z0-9]{6,}\b/gu, message: "nom court d'équipe de l'hébergeur" },
  { kind: "convex-deploy-key", pattern: /\b(?:prod|dev|preview|project):[a-z0-9-]+\|[A-Za-z0-9+/=_-]{40,}/gu, message: "clé de déploiement Convex" },
]

/**
 * Marqueurs de valeur fictive, par famille de formes. Un mot du marqueur
 * (comparé mot à mot, séparateurs `-`, `.`, `:`) suffit à exempter la valeur.
 */
export const FICTIVE_MARKERS: readonly { kinds: readonly IdentifierKind[]; words: readonly string[]; reason: string }[] = [
  {
    kinds: ["convex-deployment", "convex-deployment-target", "convex-host"],
    words: ["exemple", "example", "fictif", "fictive", "test", "antsia", "diasporale"],
    reason: "Convex tire ses noms de listes de mots anglais (adjectif, animal) : un nom qui porte « exemple », « test » ou le nom d'un produit n'a pas été généré par lui (valeurs des tests du moteur, des applications et des scripts).",
  },
  {
    kinds: ["hosting-host", "hosting-deployment-short", "cloud-run-host"],
    words: ["exemple", "example", "fictif", "fictive", "fixture"],
    reason: "Les adresses de l'hébergeur et de Cloud Run reprennent le nom du projet (qui peut contenir celui du produit) : seuls « exemple » et « fixture », jamais portés par un projet réel, marquent une valeur fictive.",
  },
]

/** La valeur est-elle manifestement fictive pour cette famille de formes ? */
export function isFictiveIdentifier(kind: IdentifierKind, value: string): boolean {
  const words = value.toLowerCase().split(/[-.:]/u)
  return FICTIVE_MARKERS.some((marker) => marker.kinds.includes(kind) && marker.words.some((word) => words.includes(word)))
}

/** Une valeur trouvée, tronquée à trois caractères : un rapport de cliquet ne republie pas l'identifiant qu'il signale. */
function masked(value: string): string {
  return `${value.slice(0, 3)}…`
}

export type IdentifierFinding = Finding & { kind: IdentifierKind }

export function detectDeploymentIdentifiers(file: string, text: string): IdentifierFinding[] {
  const findings: IdentifierFinding[] = []
  text.split("\n").forEach((lineText, index) => {
    for (const { kind, pattern, message } of DEPLOYMENT_IDENTIFIER_PATTERNS) {
      for (const match of lineText.matchAll(pattern)) {
        if (!isFictiveIdentifier(kind, match[0])) findings.push({ file, line: index + 1, kind, message: `${message} : « ${masked(match[0])} »` })
      }
    }
  })
  return findings
}

/** Décompte par forme, dans l'ordre des formes du détecteur, pour comparer un fichier à son exception nommée. */
export function countByKind(findings: readonly { kind: IdentifierKind }[]): Partial<Record<IdentifierKind, number>> {
  const counts: Partial<Record<IdentifierKind, number>> = {}
  for (const { kind } of DEPLOYMENT_IDENTIFIER_PATTERNS) {
    const count = findings.filter((finding) => finding.kind === kind).length
    if (count > 0) counts[kind] = count
  }
  return counts
}
