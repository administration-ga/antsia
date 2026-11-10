/**
 * Hébergeur des sites : Vercel, tel qu'il est utilisé depuis le 19/10/2026
 * (méthode du dossier de reprise § 8.2 et § 8.3). TOUT ce qui est propre à
 * l'hébergeur vit ici : variables, commandes, lecture de leurs sorties. Le plan
 * (`../steps.mjs`) n'appelle que l'interface ci-dessous ; un autre hébergeur
 * (décision 1 du plan 13, non prise) serait un autre module de même interface,
 * sans réécrire le plan.
 *
 * Méthode reprise : contexte figé (export propre d'ECOSYSTEMES, liste
 * d'exclusion), déploiement SANS bascule de domaine, contrôle privé, puis
 * promotion. Les valeurs passées au build (`--build-env`/`--env`) ne valent que
 * pour CE déploiement : aucune variable du projet n'est créée ni modifiée.
 * Aucune valeur d'équipe ni de projet ici : elles viennent de la machine.
 */
import { command } from "../command.mjs"
import { extractJsonDocument } from "../api-spec.mjs"

export const id = "vercel"
export const label = "Vercel"

export const variables = Object.freeze({
  ANTSIA_RELEASE_VERCEL_TEAM: { role: "équipe de l'hébergeur des sites (identifiant ou nom court)", example: "exemple-equipe", kind: "id" },
  ANTSIA_RELEASE_VERCEL_PROJECT_DEMO: { role: "projet de l'enfant de démonstration", example: "exemple-projet-demo", kind: "id" },
  ANTSIA_RELEASE_VERCEL_PROJECT_MAIN: { role: "projet du site principal", example: "exemple-projet-principal", kind: "id" },
  ANTSIA_RELEASE_VERCEL_PROJECT_CONSOLE: { role: "projet de la console", example: "exemple-projet-console", kind: "id" },
})

const PROJECT_VARIABLE = Object.freeze({
  demo: "ANTSIA_RELEASE_VERCEL_PROJECT_DEMO",
  principal: "ANTSIA_RELEASE_VERCEL_PROJECT_MAIN",
  console: "ANTSIA_RELEASE_VERCEL_PROJECT_CONSOLE",
})

/** Les variables dont un site a besoin chez cet hébergeur. */
export function requiredVariables(siteKey) {
  const project = PROJECT_VARIABLE[siteKey]
  if (!project) throw new Error(`site inconnu de l'hébergeur : ${siteKey}`)
  return ["ANTSIA_RELEASE_VERCEL_TEAM", project]
}

/** Le projet et l'équipe d'un site, lus dans les valeurs déjà contrôlées. */
export function projectOf(siteKey, values) {
  return { team: values.ANTSIA_RELEASE_VERCEL_TEAM, project: values[PROJECT_VARIABLE[siteKey]] }
}

/**
 * Liste d'exclusion du contexte envoyé (à la racine d'ECOSYSTEMES) : ni
 * dépendances, ni builds, ni git, ni AUCUN fichier `.env*`, ni documentation.
 */
export const ignoreFile = Object.freeze({
  name: ".vercelignore",
  content: [
    "**/node_modules/**",
    "**/.next/**",
    "**/.git/**",
    "**/.env*",
    "**/docs/**",
    "**/coverage/**",
    "**/CLAUDE.md",
    "**/AGENTS.md",
    "**/*.tsbuildinfo",
    "**/.convex/**",
    "**/.turbo/**",
    "",
  ].join("\n"),
})

/** Variables de cible imposées à chaque commande (le lanceur retire celles héritées de la machine). */
const targetEnv = ({ team, project }) => ({ VERCEL_ORG_ID: team, VERCEL_PROJECT_ID: project })

/** L'hôte d'une adresse (`https://x/` → `x`) : la CLI identifie un alias ou un déploiement par son hôte. */
export function hostOf(value) {
  try {
    return new URL(value).host
  } catch {
    return value
  }
}

/**
 * Déploiement de production SANS bascule de domaine (`--skip-domain`) : rien
 * n'est servi au public tant que la promotion n'a pas eu lieu.
 * @param {{ ecosystemsDir: string, team: string, project: string, buildEnv: Record<string, string>, meta: Record<string, string> }} input
 */
export function deployCommand({ ecosystemsDir, team, project, buildEnv, meta }) {
  const args = ["deploy", ecosystemsDir, "--prod", "--skip-domain", "--archive=tgz", "--yes", "--scope", team]
  for (const [name, value] of Object.entries(buildEnv)) args.push("--build-env", `${name}=${value}`, "--env", `${name}=${value}`)
  for (const [name, value] of Object.entries(meta)) args.push("--meta", `${name}=${value}`)
  return command("vercel", args, { env: targetEnv({ team, project }), label: "déploiement sans bascule de domaine" })
}

/** Le déploiement derrière un alias, ou l'état d'un déploiement (lecture seule). */
export function inspectCommand({ team, project, target }) {
  return command("vercel", ["inspect", hostOf(target), "--scope", team, "--format=json"], { env: targetEnv({ team, project }), label: "lecture de l'état du déploiement" })
}

/** Bascule : le déploiement nommé devient celui de la production du projet. */
export function promoteCommand({ team, project, deployment }) {
  return command("vercel", ["promote", deployment, "--scope", team, "--yes"], { env: targetEnv({ team, project }), label: "promotion" })
}

/**
 * Requête privée sur un déploiement non promu (protection contournée par la
 * CLI) ; `--include` rend la ligne d'état et les en-têtes (CSP).
 */
export function privateRequestCommand({ team, project, deployment, path }) {
  return command("vercel", ["curl", path, "--deployment", deployment, "--scope", team, "--yes", "--", "--silent", "--show-error", "--include", "--max-time", "30"], {
    env: targetEnv({ team, project }),
    label: `requête privée ${path}`,
  })
}

const DEPLOYMENT_LINE = /(?:Production|Preview):\s*(https:\/\/[a-z0-9-]+\.vercel\.app)\b/
const DEPLOYMENT_URL = /(https:\/\/[a-z0-9-]+\.vercel\.app)\s*$/m

/** L'adresse du déploiement créé, lue dans la sortie de `vercel deploy`. */
export function parseDeployOutput(output) {
  const text = String(output ?? "")
  const url = DEPLOYMENT_LINE.exec(text)?.[1] ?? DEPLOYMENT_URL.exec(text)?.[1]
  if (!url) throw new Error("adresse du déploiement absente de la sortie de l'hébergeur")
  return url
}

/** L'état d'un déploiement, lu dans la sortie JSON de `vercel inspect`. */
export function parseInspectOutput(output) {
  const document = extractJsonDocument(output)
  const deploymentId = typeof document.id === "string" ? document.id : typeof document.uid === "string" ? document.uid : null
  if (!deploymentId) throw new Error("identifiant du déploiement absent de la sortie de l'hébergeur")
  const url = typeof document.url === "string" ? (document.url.startsWith("https://") ? document.url : `https://${document.url}`) : null
  return { id: deploymentId, url, readyState: document.readyState ?? document.state ?? null }
}

export const isReady = (state) => state.readyState === "READY"

/**
 * L'origine technique de l'enfant de démonstration, telle que le relais du
 * principal l'accepte (`apps/antsia_ga/src/lib/demo-proxy.ts`) : une adresse
 * exacte de l'hébergeur, sans alias public, chemin ni paramètres.
 */
export function childRuntimeOrigin(url, siteOrigin) {
  try {
    const parsed = new URL(url)
    if (parsed.protocol !== "https:" || parsed.port || parsed.pathname !== "/" || parsed.search || parsed.hash) return null
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*\.vercel\.app$/u.test(parsed.hostname) || parsed.origin === siteOrigin) return null
    return parsed.origin
  } catch {
    return null
  }
}

/** Un envoi coupé en cours (EPIPE, constaté) se relance une fois : sans bascule, un doublon ne sert rien. */
export function retryableUpload(output) {
  return /\bEPIPE\b/.test(String(output ?? ""))
}

/** Le module, sous la forme que le plan consomme. */
export const vercelHost = Object.freeze({
  id,
  label,
  variables,
  requiredVariables,
  projectOf,
  ignoreFile,
  deployCommand,
  inspectCommand,
  promoteCommand,
  privateRequestCommand,
  parseDeployOutput,
  parseInspectOutput,
  isReady,
  childRuntimeOrigin,
  retryableUpload,
})
