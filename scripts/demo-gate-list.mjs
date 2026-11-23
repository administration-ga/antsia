#!/usr/bin/env bun
/**
 * La liste des numéros de la porte des comptes de démonstration (CH-817 E5, constat 11a) — la SEULE
 * voie documentée pour l'inscrire, la retirer ou la remettre à zéro, sur le déploiement de
 * démonstration, par le propriétaire :
 *
 *   CONVEX_DEPLOY_KEY='<clé du déploiement de démonstration>' bun scripts/demo-gate-list.mjs allow  [--scope diaspora-ga] [--dry-run] < numeros.txt
 *   CONVEX_DEPLOY_KEY='<même clé>'                             bun scripts/demo-gate-list.mjs revoke [--scope diaspora-ga] [--dry-run] < numeros.txt
 *   CONVEX_DEPLOY_KEY='<même clé>'                             bun scripts/demo-gate-list.mjs reset  [--scope diaspora-ga] [--dry-run]
 *
 * - Les numéros se lisent sur l'ENTRÉE STANDARD, un par ligne (lignes vides et commentaires `#`
 *   ignorés), jamais en argument : ils n'entrent ni dans l'historique du terminal ni dans un dépôt.
 * - Chacun est normalisé par la règle partagée du moteur (`normalizeDemoGatePhone`) ; un numéro hors
 *   forme est refusé ICI, désigné par son RANG, jamais par sa valeur, et rien n'est envoyé.
 * - Le JSON des arguments est construit par le script (portée littérale, tableau de numéros
 *   normalisés) : aucune erreur de forme côté serveur ne peut recopier un numéro dans un journal.
 * - L'appel passe par le lanceur Convex du moteur (`scripts/convex-dev.mjs run …`), avec la clé de
 *   déploiement de l'environnement, jamais affichée. Sans clé, refus : `convex run` viserait sinon le
 *   déploiement de `.env.local` (le backend local des autres sessions).
 * - Ne s'affichent que des nombres (ceux que rendent les fonctions internes), jamais un numéro.
 *
 * `reset` (`resetScope`) : à l'armement et à chaque rotation de `ANTSIA_DEMO_GATE_SECRET`, AVANT
 * `allow` ; il retire toute la liste et ferme les sessions des comptes de démonstration déclarés.
 * Les fonctions internes refusent elles-mêmes un déploiement où les comptes de démonstration sont
 * fermés (la production comprise).
 */
import { spawn } from "node:child_process"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

import { DEMO_GATE_ALLOWLIST_MAX, DEMO_GATE_SCOPES, normalizeDemoGatePhone } from "@antsia/social-contracts/demoGate"

/** Les trois gestes et la fonction interne que chacun appelle. */
export const DEMO_GATE_LIST_FUNCTIONS = {
  allow: "modules/platform/demoGate:allowPhones",
  revoke: "modules/platform/demoGate:revokePhones",
  reset: "modules/platform/demoGate:resetScope",
}

const USAGE = "Usage : bun scripts/demo-gate-list.mjs allow|revoke|reset [--scope diaspora-ga] [--dry-run] (numéros sur l'entrée standard, un par ligne, pour allow et revoke)"

/** Une erreur d'usage ou de saisie : son message ne contient jamais un numéro. */
export class DemoGateListError extends Error {}

/** Le geste, la portée et le mode d'essai, lus dans les arguments ; tout le reste est refusé. */
export function parseDemoGateListArgs(argv) {
  const [action, ...rest] = argv
  if (!Object.hasOwn(DEMO_GATE_LIST_FUNCTIONS, action ?? "")) throw new DemoGateListError(USAGE)
  let scope = DEMO_GATE_SCOPES[0]
  let dryRun = false
  for (let index = 0; index < rest.length; index++) {
    const option = rest[index]
    if (option === "--dry-run") dryRun = true
    else if (option === "--scope") {
      const value = rest[++index]
      if (!DEMO_GATE_SCOPES.includes(value)) throw new DemoGateListError(`Portée inconnue : attendu ${DEMO_GATE_SCOPES.join(", ")}.`)
      scope = value
    } else throw new DemoGateListError(`${USAGE}\nOption refusée (les numéros ne se passent jamais en argument).`)
  }
  return { action, scope, dryRun }
}

/**
 * Les numéros de l'entrée standard, normalisés, sans doublon. Un numéro hors forme lève avec son RANG
 * (parmi les lignes retenues), jamais sa valeur ; une liste vide ou trop longue lève de même.
 */
export function phonesFromInput(text) {
  const lines = String(text).split(/\r?\n/u).map((line) => line.trim()).filter((line) => line !== "" && !line.startsWith("#"))
  if (lines.length === 0 || lines.length > DEMO_GATE_ALLOWLIST_MAX) {
    throw new DemoGateListError(`De 1 à ${DEMO_GATE_ALLOWLIST_MAX} numéros attendus sur l'entrée standard (${lines.length} lus) : rien n'a été envoyé.`)
  }
  const phones = []
  for (const [index, line] of lines.entries()) {
    const normalized = normalizeDemoGatePhone(line)
    if (normalized === null) throw new DemoGateListError(`Numéro n° ${index + 1} hors forme (indicatif international exigé, par exemple +33…) : rien n'a été envoyé.`)
    if (!phones.includes(normalized)) phones.push(normalized)
  }
  return phones
}

/** Les arguments de `convex run` : la fonction interne et son JSON, construit ici. */
export function convexRunArgs({ action, scope, phones }) {
  const args = action === "reset" ? { scope } : { scope, phones }
  return ["run", DEMO_GATE_LIST_FUNCTIONS[action], JSON.stringify(args)]
}

/** Lance la CLI Convex par le lanceur du moteur ; rend son code de sortie. */
function spawnLauncher(args, env) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
  return new Promise((resolvePromise) => {
    const child = spawn("node", [join(root, "scripts", "convex-dev.mjs"), ...args], { cwd: root, env, stdio: ["ignore", "inherit", "inherit"] })
    child.on("error", () => resolvePromise(1))
    child.on("exit", (code) => resolvePromise(code ?? 1))
  })
}

async function readStandardInput() {
  const chunks = []
  for await (const chunk of process.stdin) chunks.push(chunk)
  return Buffer.concat(chunks).toString("utf8")
}

/**
 * Le geste complet ; rend le code de sortie (0 fait, 1 échec de l'appel, 2 refus local). Tout est
 * injectable pour la recette : arguments, entrée standard, environnement, lancement et journal.
 */
export async function runDemoGateList({ argv = process.argv.slice(2), readInput = readStandardInput, env = process.env, launch = spawnLauncher, log = console.log, warn = console.error } = {}) {
  let plan
  try {
    plan = parseDemoGateListArgs(argv)
    const phones = plan.action === "reset" ? [] : phonesFromInput(await readInput())
    plan = { ...plan, phones }
  } catch (error) {
    if (error instanceof DemoGateListError) { warn(error.message); return 2 }
    throw error
  }
  const label = plan.action === "reset" ? `remise à zéro de la portée ${plan.scope}` : `${plan.phones.length} numéro(s) pour ${plan.action} sur la portée ${plan.scope}`
  if (plan.dryRun) {
    log(`Essai : ${label}, par ${DEMO_GATE_LIST_FUNCTIONS[plan.action]} ; rien n'est envoyé.`)
    return 0
  }
  if (!env.CONVEX_DEPLOY_KEY?.trim()) {
    warn("CONVEX_DEPLOY_KEY absente : clé du déploiement de démonstration attendue dans l'environnement (jamais dans un fichier). Rien n'a été envoyé.")
    return 2
  }
  log(`Envoi : ${label}.`)
  const code = await launch(convexRunArgs(plan), env)
  if (code !== 0) warn(`L'appel a échoué (code ${code}) ; la sortie de Convex ci-dessus en dit la raison, sans aucun numéro.`)
  return code
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = await runDemoGateList()
}
