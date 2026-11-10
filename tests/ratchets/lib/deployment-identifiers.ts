/**
 * Détecteur PUR du cliquet `no-deployment-identifiers` (EX-01, à étendre par
 * EX-20) : les dépôts d'ANTSIA sont publics, aucun identifiant interne
 * d'hébergement n'y a sa place. Le cliquet ne peut pas contenir la liste des
 * vrais identifiants : il les reconnaît par leur FORME.
 *
 * Les seules exceptions sont des valeurs manifestement fictives, nommées et
 * justifiées une par une ; une forme générique (`<nom>.convex.cloud`,
 * `${name}.convex.cloud`) n'est jamais signalée.
 */
import type { Finding } from "./source-files"

export type IdentifierPattern = { kind: string; pattern: RegExp; message: string }

export const DEPLOYMENT_IDENTIFIER_PATTERNS: readonly IdentifierPattern[] = [
  // Trois chiffres exactement, non suivis d'une date : `bienvenue-publication-2026-11-02` n'en est pas un.
  { kind: "convex-deployment", pattern: /\b[a-z]{2,}-[a-z]{2,}-\d{3}\b(?![-.]\d)/g, message: "nom de déploiement Convex (forme mot-mot-nombre)" },
  { kind: "convex-host", pattern: /\b[a-z0-9][a-z0-9-]*\.convex\.(?:cloud|site)\b/g, message: "adresse nommée d'un déploiement Convex" },
  { kind: "hosting-host", pattern: /\b[a-z0-9][a-z0-9-]*\.vercel\.app\b/g, message: "adresse d'un projet ou d'un déploiement de l'hébergeur des sites" },
  { kind: "cloud-run-host", pattern: /\b[a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)*\.run\.app\b/g, message: "adresse d'un service Cloud Run" },
  { kind: "hosting-id", pattern: /\b(?:prj|team|dpl)_[A-Za-z0-9]{16,}\b/g, message: "identifiant de projet, d'équipe ou de déploiement de l'hébergeur" },
  { kind: "hosting-team-slug", pattern: /\b[a-z0-9-]+-projects-[a-z0-9]{6,}\b/g, message: "nom court d'équipe de l'hébergeur" },
  { kind: "convex-deploy-key", pattern: /\b(?:prod|dev|preview|project):[a-z0-9-]+\|[A-Za-z0-9+/=_-]{40,}/g, message: "clé de déploiement Convex" },
]

/**
 * Valeurs fictives admises, chacune justifiée. Elles portent toutes le mot
 * « exemple » : aucun déploiement réel ne s'appelle ainsi.
 */
export const FICTIVE_IDENTIFIERS: readonly { value: string; reason: string }[] = [
  { value: "exemple-demo.convex.cloud", reason: "moteur de démonstration fictif des tests des scripts de publication et de graines" },
  { value: "exemple-demo.convex.site", reason: "actions HTTP du moteur de démonstration fictif (CSP simulée)" },
  { value: "exemple-production.convex.cloud", reason: "moteur de production fictif des tests de contrôle de CSP" },
  { value: "exemple-production.convex.site", reason: "actions HTTP du moteur de production fictif (CSP simulée)" },
  { value: "exemple-enfant.vercel.app", reason: "déploiement fictif de l'enfant de démonstration : la règle du relais exige une adresse de l'hébergeur" },
  { value: "exemple-principal.vercel.app", reason: "déploiement fictif du site principal dans les sorties simulées de l'hébergeur" },
  { value: "exemple-ancien.vercel.app", reason: "déploiement précédent fictif, pour les tests de retour arrière" },
]

const FICTIVE_VALUES = new Set(FICTIVE_IDENTIFIERS.map((entry) => entry.value))

/** Une valeur trouvée, tronquée : un rapport de cliquet ne republie pas l'identifiant qu'il signale. */
function masked(value: string): string {
  return value.length <= 6 ? value : `${value.slice(0, 4)}…`
}

export function detectDeploymentIdentifiers(file: string, text: string, allowed: ReadonlySet<string> = FICTIVE_VALUES): Finding[] {
  const findings: Finding[] = []
  text.split("\n").forEach((lineText, index) => {
    for (const { pattern, message } of DEPLOYMENT_IDENTIFIER_PATTERNS) {
      for (const match of lineText.matchAll(pattern)) {
        if (!allowed.has(match[0])) findings.push({ file, line: index + 1, message: `${message} : « ${masked(match[0])} »` })
      }
    }
  })
  return findings
}
