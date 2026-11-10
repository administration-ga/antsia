#!/usr/bin/env node
/**
 * Contrôle après coup d'une publication d'ANTSIA (EX-01), en lecture seule.
 *
 *   node scripts/release-check.mjs <sha> --cible <cible> [options]             le plan des requêtes : RIEN ne part
 *   node scripts/release-check.mjs <sha> --cible <cible> --execute [options]   les requêtes, puis le bilan
 *
 * Cibles :
 * - `principal` : le site principal ET sa zone /demo (relayée vers l'enfant) —
 *   santé, version servie exacte, CSP limitée au bon moteur, routes clés en 200 ;
 * - `console` : la console, mêmes contrôles ;
 * - `moteur-demo`, `moteur-production` : l'empreinte de l'API servie comparée à
 *   celle du commit publié (relevé du candidat), et la santé du site qu'il sert.
 *
 * Options : --prive (sites : sur le déploiement NON promu, par la commande
 * privée de l'hébergeur ; identifiant lu dans le manifeste ou --deploiement),
 * --deploiement <id>, --api-reference <fichier> (moteurs, à défaut du
 * manifeste), --etiquette main|commit (préfixe des versions, à défaut du
 * manifeste), --publication <nom>.
 *
 * Code de sortie 1 au moindre défaut. Aucune requête ne modifie une cible ;
 * elles partent seulement avec --execute.
 */
import { existsSync, readFileSync } from "node:fs"
import { homedir } from "node:os"
import { join, resolve } from "node:path"
import { pathToFileURL } from "node:url"

import { DEFAULT_REPOS, HOST } from "./release.mjs"
import { extractJsonDocument } from "./release/api-spec.mjs"
import { analyzeHealth, mergeReports } from "./release/checks.mjs"
import { systemRunner } from "./release/command.mjs"
import { describeItems, httpGet, runItems, StepFailure } from "./release/executor.mjs"
import { MANIFEST_FILE, assertOutsideRepos, readManifest, releaseHome } from "./release/manifest.mjs"
import { apiMatchReport, readOnlineApiItem, zoneCheckItems } from "./release/probes.mjs"
import { CHECK_ZONES, ENGINES, HEALTH_ROUTE, RELEASE_VARIABLES, ReleaseRefusal, assertSha, buildLabel, readVariables, shortSha } from "./release/targets.mjs"

export const CHECK_TARGETS = Object.freeze(["principal", "console", "moteur-demo", "moteur-production"])

export function parseCheckArgs(argv) {
  const options = { execute: false, private: false }
  const positional = []
  const valued = { "--cible": "target", "--deploiement": "deployment", "--api-reference": "apiReference", "--etiquette": "labelPrefix", "--publication": "publication" }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === "--execute") options.execute = true
    else if (arg === "--prive") options.private = true
    else if (valued[arg]) {
      const value = argv[index + 1]
      if (value === undefined || value.startsWith("--")) throw new ReleaseRefusal(`${arg} attend une valeur`)
      options[valued[arg]] = value
      index += 1
    } else if (arg.startsWith("--")) throw new ReleaseRefusal(`option inconnue : ${arg}`)
    else positional.push(arg)
  }
  if (!CHECK_TARGETS.includes(options.target)) throw new ReleaseRefusal(`--cible attendue : ${CHECK_TARGETS.join(", ")}`)
  if (options.labelPrefix !== undefined && !["main", "commit"].includes(options.labelPrefix)) throw new ReleaseRefusal("--etiquette attend main ou commit")
  if (options.private && options.target.startsWith("moteur-")) throw new ReleaseRefusal("--prive ne vaut que pour un site")
  return { sha: positional[0], options }
}

/** Les éléments du contrôle d'une cible, et les variables qu'il lit. */
export function checkPlan({ target, options, manifest }) {
  if (target.startsWith("moteur-")) {
    const key = target === "moteur-demo" ? "demo" : "production"
    const zone = CHECK_ZONES.principal.find((entry) => entry.engine === key)
    return {
      variables: [ENGINES[key].variable, "ANTSIA_RELEASE_SITE_ORIGIN"],
      items: [
        {
          kind: "action",
          text: (state) => `référence : ${options.apiReference ?? (manifest?.candidate ? `relevé du candidat du manifeste (${state.dir})` : "<RELEVE_DU_CANDIDAT>")}`,
          run: (state) => {
            const file = options.apiReference ? resolve(options.apiReference) : manifest?.candidate ? join(state.dir, manifest.candidate.file) : null
            if (!file) throw new ReleaseRefusal("référence absente : --api-reference <fichier> ou manifeste de la publication")
            state.reference = extractJsonDocument(readFileSync(file, "utf8"))
          },
        },
        readOnlineApiItem({ cwd: (state) => state.convexCwd, engineKey: key, engineName: (state) => state.values[ENGINES[key].variable] }),
        {
          kind: "action",
          text: (state) => `GET ${state.values.ANTSIA_RELEASE_SITE_ORIGIN}${zone.basePath}${HEALTH_ROUTE} (version du site non contrôlée) ; empreinte de l'API servie = référence`,
          run: async (state, io) => {
            const health = analyzeHealth(await httpGet(io.fetch, `${state.values.ANTSIA_RELEASE_SITE_ORIGIN}${zone.basePath}${HEALTH_ROUTE}`), { expectedVersion: null })
            state.report = mergeReports([["API", apiMatchReport(state.online[key], state.reference)], ["santé", health]])
          },
        },
      ],
    }
  }
  const zones = CHECK_ZONES[target]
  const deploymentStep = target === "principal" ? "site-principal" : "site-console"
  const items = zones.flatMap((zone) => zoneCheckItems({
    zone,
    engineName: (state) => state.values[ENGINES[zone.engine].variable],
    expectedVersion: (state) => buildLabel(state.sha, zone.buildSuffix, { inMain: state.inMain }),
    source: options.private
      ? { kind: "private", host: HOST, project: (state) => HOST.projectOf(target, state.values), deployment: () => options.deployment ?? manifest?.steps?.[deploymentStep]?.deployment?.id ?? "<ID_DEPLOIEMENT>" }
      : { kind: "public", origin: (state) => state.values[zone.originVariable] },
  }))
  items.push({
    kind: "action",
    text: () => "bilan des zones",
    run: (state) => {
      state.report = mergeReports(zones.map((zone) => [zone.zone, state.reports[zone.zone]]))
    },
  })
  return {
    variables: [...new Set([...(options.private ? HOST.requiredVariables(target) : []), ...zones.flatMap((zone) => [zone.originVariable, ENGINES[zone.engine].variable])])],
    items,
  }
}

/**
 * Point d'entrée, injectable (`run`, `fetch` simulés en test).
 * @returns {Promise<number>}
 */
export async function main(argv, deps = {}) {
  const env = deps.env ?? process.env
  const log = deps.log ?? console.log
  const error = deps.error ?? console.error
  const repos = deps.repos ?? DEFAULT_REPOS
  let sha, options, home, manifest
  try {
    ;({ sha, options } = parseCheckArgs(argv))
    sha = assertSha(sha)
    home = assertOutsideRepos(releaseHome(env, deps.homedir ?? homedir()), [repos.antsia, repos.diasporale])
    manifest = readManifest(join(home, options.publication ?? shortSha(sha), MANIFEST_FILE))
    if (manifest && manifest.sha !== sha) throw new ReleaseRefusal(`la publication ${options.publication ?? shortSha(sha)} est celle du commit ${manifest.sha}`)
  } catch (refusal) {
    error(`✗ ${refusal.message}`)
    return 2
  }
  const plan = checkPlan({ target: options.target, options, manifest })
  const { values, problems } = readVariables(env, plan.variables, { ...RELEASE_VARIABLES, ...HOST.variables })
  const dir = join(home, options.publication ?? shortSha(sha))
  const exportDir = manifest?.steps?.export?.exportDir
  const state = {
    sha,
    dir,
    values,
    inMain: options.labelPrefix ? options.labelPrefix === "main" : manifest?.steps?.export?.inMain ?? true,
    // Le relevé en ligne part de l'export de la publication s'il existe (aucun .env.local) ; sinon du dépôt,
    // où la cible explicite l'emporte sur .env.local et où les clés héritées sont retirées.
    convexCwd: exportDir && existsSync(exportDir) ? join(exportDir, "ANTSIA") : repos.antsia,
  }
  log(`Contrôle après coup — ${options.target}${options.private ? " (privé, avant promotion)" : ""} — commit ${sha}`)
  for (const line of describeItems(plan.items, state)) log(`   ${line}`)
  if (problems.length > 0) log(`Variables : ${problems.join(" ; ")}`)
  if (!options.execute) {
    log("Rien n'est parti (lecture seule) : ajouter --execute pour lancer ces requêtes.")
    return 0
  }
  if (problems.length > 0) {
    error(`✗ contrôle refusé, rien n'est parti : ${problems.map((problem) => `variable ${problem}`).join(" ; ")}`)
    return 1
  }
  try {
    await runItems(plan.items, state, { run: deps.run ?? systemRunner({ baseEnv: env }), fetch: deps.fetch ?? globalThis.fetch })
  } catch (failure) {
    const message = failure instanceof ReleaseRefusal || failure instanceof StepFailure ? failure.message : String(failure?.message ?? failure)
    error(`✗ contrôle interrompu : ${message}`)
    return 1
  }
  const { errors, warnings } = state.report
  for (const message of warnings) log(`   ! ${message}`)
  if (errors.length > 0) {
    for (const message of errors) error(`   ✗ ${message}`)
    error(`✗ ${errors.length} défaut(s)`)
    return 1
  }
  log(`✓ ${options.target} : aucun défaut${warnings.length ? ` (${warnings.length} avertissement(s))` : ""}`)
  return 0
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).then((code) => {
    process.exitCode = code
  })
}
