/**
 * Cibles de la publication (EX-01) : moteurs, sites, étiquettes de version.
 *
 * Dépôt public : AUCUN nom de déploiement, de projet ni d'équipe n'est écrit
 * ici. Les cibles se lisent dans des variables de la MACHINE qui publie, dont ce
 * module ne connaît que les NOMS ; une variable absente refuse l'étape, sans
 * valeur par défaut. Les exemples sont manifestement fictifs.
 */

/** Variables communes à tout hébergeur de site. Celles de l'hébergeur vivent dans son module (`hosts/`). */
export const RELEASE_VARIABLES = Object.freeze({
  ANTSIA_RELEASE_CONVEX_DEMO: { role: "nom du déploiement Convex de démonstration", example: "exemple-demo", kind: "convex" },
  ANTSIA_RELEASE_CONVEX_PROD: { role: "nom du déploiement Convex de production", example: "exemple-production", kind: "convex" },
  ANTSIA_RELEASE_SITE_ORIGIN: { role: "origine publique du site principal (la démonstration est servie sous /demo)", example: "https://site.exemple.test", kind: "origin" },
  ANTSIA_RELEASE_DEMO_CHILD_ORIGIN: {
    role: "adresse de production du projet de l'enfant de démonstration : lue pour connaître son déploiement courant, jamais contrôlée (il répond 403 hors du relais, par conception)",
    example: "https://enfant.exemple.test",
    kind: "origin",
  },
  ANTSIA_RELEASE_CONSOLE_ORIGIN: { role: "origine publique de la console", example: "https://console.exemple.test", kind: "origin" },
})

/** Facultative : un dossier HORS des dépôts (défaut : `~/antsia-publications`). */
export const OPTIONAL_VARIABLES = Object.freeze({
  ANTSIA_RELEASE_HOME: { role: "dossier des manifestes, journaux et exports de publication (hors des dépôts)", example: "/chemin/hors/depot/publications", kind: "path" },
})

/** Moteurs, dans l'ordre invariable : démonstration d'abord. */
export const ENGINES = Object.freeze({
  demo: { label: "moteur de démonstration", variable: "ANTSIA_RELEASE_CONVEX_DEMO" },
  production: { label: "moteur de production", variable: "ANTSIA_RELEASE_CONVEX_PROD" },
})

/**
 * Sites, dans l'ordre invariable : l'enfant de démonstration avant le principal
 * (le principal relaie `/demo` vers le déploiement exact de l'enfant), la
 * console à part. `aliasVariable` donne l'adresse dont l'hébergeur dit quel
 * déploiement est en production (pour le retour arrière).
 */
export const SITES = Object.freeze({
  demo: { label: "enfant de démonstration", of: "de l'enfant de démonstration", buildSuffix: "demo", engine: "demo", aliasVariable: "ANTSIA_RELEASE_DEMO_CHILD_ORIGIN" },
  principal: { label: "site principal", of: "du site principal", buildSuffix: "production", engine: "production", aliasVariable: "ANTSIA_RELEASE_SITE_ORIGIN" },
  console: { label: "console", of: "de la console", buildSuffix: "console", engine: "production", aliasVariable: "ANTSIA_RELEASE_CONSOLE_ORIGIN" },
})

/**
 * Zones contrôlées après une publication de site. Le principal porte aussi la
 * zone `/demo`, servie par l'enfant à travers son relais : on la contrôle par
 * le principal, l'enfant seul répondant 403.
 */
export const CHECK_ZONES = Object.freeze({
  principal: [
    { zone: "principal", basePath: "", engine: "production", buildSuffix: "production", originVariable: "ANTSIA_RELEASE_SITE_ORIGIN" },
    { zone: "demo", basePath: "/demo", engine: "demo", buildSuffix: "demo", originVariable: "ANTSIA_RELEASE_SITE_ORIGIN" },
  ],
  console: [{ zone: "console", basePath: "", engine: "production", buildSuffix: "console", originVariable: "ANTSIA_RELEASE_CONSOLE_ORIGIN" }],
})

/** Routes clés, chacune attendue en 200 sans session (le test vérifie qu'elles existent dans les applications). */
export const KEY_ROUTES = Object.freeze({
  principal: ["/entrer", "/a-propos", "/confidentialite", "/mentions-legales", "/transparence", "/sante-fonctionnelle", "/api/sante-fonctionnelle"],
  demo: ["/entrer", "/sante-fonctionnelle", "/api/sante-fonctionnelle"],
  console: ["/entrer", "/sante-fonctionnelle", "/api/sante-fonctionnelle"],
})

/** Route de santé (EX-03) : version du site et état réel du moteur. */
export const HEALTH_ROUTE = "/api/sante-fonctionnelle"
/** Page dont on lit la politique de sécurité du contenu. */
export const CSP_ROUTE = "/entrer"

const SHA = /^[0-9a-f]{40}$/
const CONVEX_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/

/** Une étape refusée : rien n'est parti. */
export class ReleaseRefusal extends Error {
  constructor(reasons) {
    const list = Array.isArray(reasons) ? reasons : [reasons]
    super(list.join(" ; "))
    this.reasons = list
  }
}

/** Le SHA complet exigé : aucun nom de branche, aucune résolution implicite. */
export function assertSha(value) {
  if (typeof value !== "string" || !SHA.test(value)) throw new ReleaseRefusal("donner le SHA complet du commit (40 caractères hexadécimaux : git rev-parse <réf>)")
  return value
}

export const shortSha = (sha) => sha.slice(0, 12)

/** Une origine exacte en https, sans chemin, port, identifiants ni barre finale. */
export function isExactOrigin(value) {
  if (typeof value !== "string" || value.trim() !== value) return false
  try {
    const url = new URL(value)
    return url.protocol === "https:" && url.origin === value && !url.port && !url.username && !url.password
  } catch {
    return false
  }
}

/** Contrôle de forme d'une variable : un nom de cible, jamais une adresse ni une clé. */
export function validVariable(kind, value) {
  if (typeof value !== "string" || value.length === 0) return false
  if (kind === "convex") return CONVEX_NAME.test(value)
  if (kind === "origin") return isExactOrigin(value)
  if (kind === "id") return IDENTIFIER.test(value)
  return true
}

/**
 * Les valeurs des variables nommées. En mode plan, une absente devient un
 * marqueur `<NOM>` ; à l'exécution (`strict`), toute absente ou mal formée
 * refuse l'étape en la nommant.
 * @param {Record<string, { kind: string }>} catalogue
 */
export function readVariables(env, names, catalogue, { strict = false } = {}) {
  const values = {}
  const problems = []
  for (const name of names) {
    const spec = catalogue[name]
    const value = env[name]
    if (value === undefined || value === "") {
      problems.push(`${name} absente (${spec?.role ?? "variable de la machine"})`)
      values[name] = `<${name}>`
    } else if (!validVariable(spec?.kind ?? "id", value)) {
      problems.push(`${name} mal formée (attendu : ${spec?.kind === "origin" ? "une origine https exacte" : spec?.kind === "convex" ? "un nom de déploiement" : "un identifiant"})`)
      values[name] = `<${name}>`
    } else {
      values[name] = value
    }
  }
  if (strict && problems.length > 0) throw new ReleaseRefusal(problems.map((problem) => `variable ${problem}`))
  return { values, problems }
}

/**
 * L'étiquette de version d'un build (`NEXT_PUBLIC_BUILD_SHA`), lisible sur la
 * route de santé : `main-<sha12>-<cible>` pour un commit de `main`,
 * `commit-<sha12>-<cible>` sinon (jamais « main » pour un commit composé hors de main).
 */
export function buildLabel(sha, buildSuffix, { inMain = true } = {}) {
  return `${inMain ? "main" : "commit"}-${shortSha(sha)}-${buildSuffix}`
}

/** Les adresses d'un déploiement Convex, dérivées de son nom (jamais écrites dans le dépôt). */
export function convexHosts(name) {
  return { cloud: `${name}.convex.cloud`, site: `${name}.convex.site` }
}

/** La cible Convex telle que la CLI la lit, sans clé : `prod:<nom>` (méthode de la reprise). */
export function convexDeploymentSelector(name) {
  return `prod:${name}`
}
