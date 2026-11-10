#!/usr/bin/env node
/**
 * Publication reproductible, vérifiée et réversible d'ANTSIA (EX-01, plan 13).
 *
 *   node scripts/release.mjs plan <sha>
 *       le plan complet, pas à pas, pour ce commit : RIEN ne part ;
 *   node scripts/release.mjs <étape> <sha> [options]
 *       le détail d'une étape et ses prérequis : RIEN ne part ;
 *   node scripts/release.mjs <étape> <sha> --execute --confirmer <étape>@<sha12> [options]
 *       exécute CETTE étape, et elle seule.
 *
 * Options : --api-candidat <fichier> (relevé function-spec du commit, venu d'un
 * backend local), --moteur-inchange (sites seuls : le moteur en ligne sert déjà
 * ce commit), --retour-de <publication> (republier un commit antérieur pour
 * annuler une publication du moteur), --publication <nom> (dossier de la
 * publication ; défaut : les 12 premiers caractères du SHA).
 *
 * Méthode : dossier de reprise § 8, écrite sans identifiant dans
 * docs/36_PUBLICATION_ET_RETOUR_ARRIERE.md. Toute exécution réelle exige
 * l'accord écrit du propriétaire (commit, cibles, ordre, retour arrière). Il
 * n'existe aucun mode « tout d'un coup » ; aucune étape ne rejoue de graine,
 * ne pose de variable de déploiement ni ne supprime quoi que ce soit en ligne.
 * Les cibles viennent des variables de la machine (noms dans docs/36).
 */
import { closeSync, mkdirSync, openSync, appendFileSync, rmSync, writeSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

import { systemRunner } from "./release/command.mjs"
import { describeItems, runItems, StepFailure } from "./release/executor.mjs"
import { vercelHost } from "./release/hosts/vercel.mjs"
import { MANIFEST_FILE, assertOutsideRepos, doneStep, newManifest, readManifest, releaseHome, writeManifest } from "./release/manifest.mjs"
import { ALTERNATIVE_STEPS, RELEASE_ORDER, ROLLBACK_STEPS, createSteps, initialState } from "./release/steps.mjs"
import { OPTIONAL_VARIABLES, RELEASE_VARIABLES, ReleaseRefusal, assertSha, readVariables, shortSha } from "./release/targets.mjs"

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
export const DEFAULT_REPOS = Object.freeze({ antsia: ROOT, diasporale: resolve(ROOT, "..", "DIASPORALE") })
/** L'hébergeur des sites d'aujourd'hui (décision 1 du plan 13 non prise : un autre serait un autre module). */
export const HOST = vercelHost
const NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/
const LOCK_FILE = ".verrou-publication"

const USAGE = [
  "Usage :",
  "  node scripts/release.mjs plan <sha>",
  "  node scripts/release.mjs <étape> <sha> [--api-candidat <fichier>] [--moteur-inchange] [--retour-de <publication>] [--publication <nom>]",
  "  node scripts/release.mjs <étape> <sha> --execute --confirmer <étape>@<sha12> [options]",
  `Étapes, dans l'ordre : ${RELEASE_ORDER.join(", ")}.`,
  `À part : ${ALTERNATIVE_STEPS.join(", ")} (moteur inchangé) ; retour arrière : ${ROLLBACK_STEPS.join(", ")}.`,
].join("\n")

/** Les arguments, sans aucune valeur implicite. */
export function parseArgs(argv) {
  const options = { execute: false, moteurInchange: false }
  const positional = []
  const valued = { "--confirmer": "confirm", "--api-candidat": "apiCandidate", "--retour-de": "retourDe", "--publication": "publication" }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === "--execute") options.execute = true
    else if (arg === "--moteur-inchange") options.moteurInchange = true
    else if (arg === "--aide" || arg === "--help") options.help = true
    else if (valued[arg]) {
      const value = argv[index + 1]
      if (value === undefined || value.startsWith("--")) throw new ReleaseRefusal(`${arg} attend une valeur`)
      options[valued[arg]] = value
      index += 1
    } else if (arg.startsWith("--")) throw new ReleaseRefusal(`option inconnue : ${arg}`)
    else positional.push(arg)
  }
  for (const key of ["publication", "retourDe"]) {
    if (options[key] !== undefined && !NAME.test(options[key])) throw new ReleaseRefusal(`nom de publication invalide : ${options[key]}`)
  }
  return { stepId: positional[0], sha: positional[1], extra: positional.slice(2), options }
}

const STATUS_LABEL = { fait: "fait", echec: "ÉCHEC", refusee: "refusée" }

function printStep(log, number, step, state, manifest) {
  const status = manifest?.steps?.[step.id]?.status
  log(`\n${number ? `${number}. ` : ""}${step.id} — ${step.title} [${step.kind}]${status ? ` · ${STATUS_LABEL[status] ?? status}` : ""}`)
  for (const line of describeItems(step.items(), state)) log(`     ${line}`)
}

/** Le plan complet d'un commit : chaque étape et ses commandes exactes. */
export function printPlan({ sha, steps, env, home, publication, repos, manifest, options, log }) {
  const catalogue = { ...RELEASE_VARIABLES, ...HOST.variables }
  const names = Object.keys(catalogue)
  const { values, problems } = readVariables(env, names, catalogue)
  const state = initialState({ sha, home, publication, repos, values, manifest, options })
  log(`Plan de publication d'ANTSIA — commit ${sha} (hébergeur des sites : ${HOST.label})`)
  log(`Dossier de la publication (hors dépôt) : ${state.dir}`)
  log("Chaque étape s'exécute SEULE : --execute --confirmer <étape>@" + shortSha(sha) + ". Rien n'est parti.")
  if (problems.length > 0) log(`Variables de la machine à poser avant toute exécution : ${problems.map((problem) => problem.split(" ")[0]).join(", ")}`)
  RELEASE_ORDER.forEach((stepId, index) => printStep(log, index + 1, steps[stepId], state, manifest))
  log("\nÀ la place des étapes 2 à 7, quand le moteur de ce commit est déjà celui en ligne :")
  for (const stepId of ALTERNATIVE_STEPS) printStep(log, null, steps[stepId], state, manifest)
  log("\nRetour arrière des sites (enfant puis principal, comme à la publication ; console à part) :")
  for (const stepId of ROLLBACK_STEPS) printStep(log, null, steps[stepId], state, manifest)
  log("\nRetour arrière du moteur : republier le commit précédent (son relevé d'API, ses étapes 1 à 7) avec")
  log(`--retour-de ${publication ?? shortSha(sha)} : seules les fonctions ajoutées par cette publication peuvent alors partir. Jamais de suppression d'index.`)
}

/** Verrou commun à toutes les publications de la machine : un seul publieur à la fois. */
function acquireLock(home, label) {
  mkdirSync(home, { recursive: true })
  const path = join(home, LOCK_FILE)
  let descriptor
  try {
    descriptor = openSync(path, "wx")
  } catch {
    throw new ReleaseRefusal(`une étape de publication est déjà en cours (verrou ${path}) ; s'il est resté après un arrêt brutal, le retirer à la main après vérification`)
  }
  writeSync(descriptor, `${label}\n`)
  closeSync(descriptor)
  return () => rmSync(path, { force: true })
}

/**
 * Point d'entrée, injectable : `run` (lanceur de commandes) et `fetch` sont
 * simulés par les tests ; aucun appel n'a lieu sans `--execute` et la
 * confirmation exacte.
 * @returns {Promise<number>} code de sortie
 */
export async function main(argv, deps = {}) {
  const env = deps.env ?? process.env
  const log = deps.log ?? console.log
  const error = deps.error ?? console.error
  const repos = deps.repos ?? DEFAULT_REPOS
  const now = deps.now ?? (() => new Date())
  let parsed
  try {
    parsed = parseArgs(argv)
  } catch (refusal) {
    error(`✗ ${refusal.message}\n${USAGE}`)
    return 2
  }
  const { stepId, sha: shaArg, extra, options } = parsed
  if (options.help || !stepId) {
    log(USAGE)
    return options.help ? 0 : 2
  }
  const steps = createSteps(HOST)
  if (stepId !== "plan" && !steps[stepId]) {
    error(`✗ étape inconnue : ${stepId}\n${USAGE}`)
    return 2
  }
  if (extra.length > 0) {
    error(`✗ une seule étape par appel (reçu en trop : ${extra.join(" ")}) : aucun mode « tout d'un coup »`)
    return 2
  }
  let sha, home
  try {
    sha = assertSha(shaArg)
    home = assertOutsideRepos(releaseHome(env, deps.homedir ?? homedir()), [repos.antsia, repos.diasporale])
  } catch (refusal) {
    error(`✗ ${refusal.message}`)
    return 2
  }
  const publication = options.publication ?? shortSha(sha)
  const dir = join(home, publication)
  const manifestFile = join(dir, MANIFEST_FILE)
  let manifest
  try {
    manifest = readManifest(manifestFile)
    if (manifest && manifest.sha !== sha) throw new ReleaseRefusal(`la publication ${publication} est celle du commit ${manifest.sha}`)
  } catch (refusal) {
    error(`✗ ${refusal.message}`)
    return 1
  }

  if (stepId === "plan") {
    printPlan({ sha, steps, env, home, publication, repos, manifest, options, log })
    return 0
  }

  const step = steps[stepId]
  const catalogue = { ...RELEASE_VARIABLES, ...OPTIONAL_VARIABLES, ...HOST.variables }
  const variableNames = [...new Set(step.variables())]
  const { values, problems } = readVariables(env, variableNames, catalogue)
  const state = initialState({ sha, home, publication, repos, values, manifest, options: { ...options, apiCandidate: options.apiCandidate ? resolve(options.apiCandidate) : undefined } })
  const reasons = step.requires({ manifest, options, home, dir })
  const confirmation = `${stepId}@${shortSha(sha)}`
  log(`Étape ${stepId} — commit ${sha} — publication ${dir}`)
  printStep(log, null, step, state, manifest)
  if (problems.length > 0) log(`\nVariables : ${problems.join(" ; ")}`)
  if (reasons.length > 0) log(`\nPrérequis manquants : ${reasons.join(" ; ")}`)
  if (!options.execute) {
    log(`\nRien n'est parti. Pour exécuter cette étape seule, sur accord écrit du propriétaire : --execute --confirmer ${confirmation}`)
    return 0
  }
  const refusals = [
    ...(options.confirm === confirmation ? [] : [`confirmation attendue : --confirmer ${confirmation} (elle nomme l'étape et le commit)`]),
    ...problems.map((problem) => `variable ${problem}`),
    ...reasons,
  ]
  if (refusals.length > 0) {
    error(`✗ étape refusée, rien n'est parti : ${refusals.join(" ; ")}`)
    return 1
  }

  let release
  try {
    release = acquireLock(home, `${stepId} ${sha} ${now().toISOString()}`)
  } catch (refusal) {
    error(`✗ ${refusal.message}`)
    return 1
  }
  const run = deps.run ?? systemRunner({ baseEnv: env })
  const fetchImpl = deps.fetch ?? globalThis.fetch
  const startedAt = now().toISOString()
  const commands = []
  let outcome = { status: "fait" }
  try {
    if (stepId === "export") {
      mkdirSync(dir, { recursive: true })
      state.manifest = newManifest({ sha, host: HOST.id, createdAt: startedAt })
    }
    const journalFile = join(dir, "journal", `${stepId}.log`)
    mkdirSync(dirname(journalFile), { recursive: true })
    const journal = ({ line, result }) => {
      commands.push({ line, status: result.status })
      appendFileSync(journalFile, `$ ${line}\n# code ${result.status}${result.error ? ` (${result.error})` : ""}\n${result.stdout ?? ""}${result.stderr ? `\n[stderr]\n${result.stderr}` : ""}\n\n`)
    }
    await runItems(step.items(), state, { run, fetch: fetchImpl, journal })
  } catch (failure) {
    if (failure instanceof ReleaseRefusal) outcome = { status: "refusee", reasons: failure.reasons }
    else if (failure instanceof StepFailure) outcome = { status: "echec", reason: failure.message, ...(failure.report ? { report: failure.report } : {}) }
    else outcome = { status: "echec", reason: failure?.message ?? String(failure) }
  } finally {
    state.manifest.steps[stepId] = { ...state.record, ...outcome, startedAt, finishedAt: now().toISOString(), commands }
    try {
      writeManifest(manifestFile, state.manifest)
    } finally {
      release()
    }
  }
  if (outcome.status === "fait") {
    log(`\n✓ ${stepId} : fait. Manifeste : ${manifestFile}`)
    const next = RELEASE_ORDER[RELEASE_ORDER.indexOf(stepId) + 1]
    if (next && !doneStep(state.manifest, next)) log(`Étape suivante de la méthode : ${next} (sur accord).`)
    return 0
  }
  error(`\n✗ ${stepId} : ${outcome.status === "refusee" ? `refusée — ${outcome.reasons.join(" ; ")}` : `échec — ${outcome.reason}`}`)
  if (outcome.report?.errors?.length) for (const message of outcome.report.errors) error(`   - ${message}`)
  error(`Manifeste et journal : ${dir}`)
  return 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).then((code) => {
    process.exitCode = code
  })
}
