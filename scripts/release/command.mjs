/**
 * Commandes externes de la publication (EX-01).
 *
 * Une commande est une DESCRIPTION (programme, arguments, dossier, variables)
 * qui sert à la fois à l'affichage du plan et à l'exécution : ce que montre le
 * plan est exactement ce qui part. Aucune commande n'est lancée par ce module
 * hors du lanceur `systemRunner`, que seule l'exécution confirmée d'une étape
 * utilise ; les tests injectent un lanceur simulé.
 */
import { spawnSync } from "node:child_process"

/**
 * Variables de la machine qui choisiraient une AUTRE cible que celle nommée par
 * l'étape : une clé de déploiement Convex l'emporte sur `CONVEX_DEPLOYMENT`, un
 * lien d'hébergeur hérité viserait un autre projet. Elles sont retirées de
 * l'environnement de chaque commande, qui reçoit ensuite ses seules variables.
 */
export const STRIPPED_ENV = Object.freeze([
  "CONVEX_DEPLOY_KEY",
  "CONVEX_DEPLOYMENT_TOKEN",
  "CONVEX_DEPLOYMENT",
  "CONVEX_SELF_HOSTED_URL",
  "CONVEX_SELF_HOSTED_ADMIN_KEY",
  "CONVEX_URL",
  "VERCEL_ORG_ID",
  "VERCEL_PROJECT_ID",
])

/**
 * @typedef {{ program: string, args: string[], cwd?: string, env: Record<string, string>, label?: string }} CommandSpec
 * @typedef {{ status: number, stdout: string, stderr: string, error?: string }} CommandResult
 * @typedef {(spec: CommandSpec) => CommandResult} Runner
 */

/** @returns {CommandSpec} */
export function command(program, args, { cwd, env = {}, label } = {}) {
  return { program, args: [...args], ...(cwd ? { cwd } : {}), env: { ...env }, ...(label ? { label } : {}) }
}

/** Un marqueur du plan (`<URL_ENFANT>`) : valeur connue seulement à l'exécution. */
const PLACEHOLDER = /<[A-Z0-9_]+>/g
const SHELL_SAFE = /^[A-Za-z0-9_@%+=:,./-]+$/

function quote(value) {
  const text = String(value)
  if (SHELL_SAFE.test(text.replace(PLACEHOLDER, "X"))) return text
  return `'${text.replaceAll("'", "'\\''")}'`
}

/** La commande telle qu'un opérateur la lirait dans un terminal. */
export function formatCommand(spec) {
  const env = Object.entries(spec.env).map(([name, value]) => `${name}=${quote(value)}`)
  const line = [...env, spec.program, ...spec.args.map(quote)].join(" ")
  return spec.cwd ? `(cd ${quote(spec.cwd)} && ${line})` : line
}

/** L'environnement d'une commande : celui de la machine, sans les variables qui changeraient de cible. */
export function childEnv(base, spec) {
  const env = { ...base }
  for (const name of STRIPPED_ENV) delete env[name]
  return { ...env, ...spec.env }
}

/** Les deux sorties d'une commande, pour l'analyse et le journal. */
export function outputOf(result) {
  return `${result.stdout ?? ""}\n${result.stderr ?? ""}`
}

/**
 * Le lanceur réel : sorties capturées (le plan les analyse), variables de cible
 * imposées. Utilisé seulement par une étape confirmée.
 * @returns {Runner}
 */
export function systemRunner({ baseEnv = process.env, echo = (text) => process.stdout.write(text) } = {}) {
  return (spec) => {
    const result = spawnSync(spec.program, spec.args, {
      cwd: spec.cwd,
      env: childEnv(baseEnv, spec),
      encoding: "utf8",
      maxBuffer: 256 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    })
    const outcome = { status: result.status ?? 1, stdout: result.stdout ?? "", stderr: result.stderr ?? "", ...(result.error ? { error: result.error.message } : {}) }
    if (echo) echo(outputOf(outcome))
    return outcome
  }
}
