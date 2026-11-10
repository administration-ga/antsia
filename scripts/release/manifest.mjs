/**
 * Manifeste d'une publication (EX-01) : ce que chaque étape a fait, avec quoi,
 * et ce qu'il faut pour revenir en arrière (déploiement précédent de chaque
 * site, API servie avant chaque envoi du moteur).
 *
 * Il cite des noms de déploiement : il vit HORS des dépôts (dépôt public), dans
 * `ANTSIA_RELEASE_HOME` ou, par défaut, `~/antsia-publications/<sha12>/`. Un
 * dossier qui tombe dans un dépôt est refusé.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { isAbsolute, join, relative, resolve } from "node:path"

import { ReleaseRefusal, shortSha } from "./targets.mjs"

export const MANIFEST_VERSION = 1
export const MANIFEST_FILE = "manifeste.json"

/** Le dossier des publications : variable de la machine, sinon `~/antsia-publications`. */
export function releaseHome(env, home = homedir()) {
  const configured = env.ANTSIA_RELEASE_HOME
  if (configured !== undefined && configured !== "" && !isAbsolute(configured)) throw new ReleaseRefusal("ANTSIA_RELEASE_HOME doit être un chemin absolu")
  return resolve(configured || join(home, "antsia-publications"))
}

/** Refuse un dossier situé dans un des dépôts (le manifeste cite des cibles réelles). */
export function assertOutsideRepos(path, repos) {
  for (const repo of repos) {
    const inside = relative(resolve(repo), resolve(path))
    if (inside === "" || (!inside.startsWith("..") && !isAbsolute(inside))) throw new ReleaseRefusal(`dossier de publication dans un dépôt (${repo}) : choisir un dossier hors des dépôts (ANTSIA_RELEASE_HOME)`)
  }
  return path
}

/** Le dossier d'une publication : un par commit. */
export const releaseDir = (home, sha) => join(home, shortSha(sha))
export const manifestPath = (home, sha) => join(releaseDir(home, sha), MANIFEST_FILE)

/** Un manifeste neuf (créé par l'étape d'export). */
export function newManifest({ sha, host, createdAt }) {
  return { version: MANIFEST_VERSION, sha, host, createdAt, steps: {} }
}

export function readManifest(path) {
  if (!existsSync(path)) return null
  const manifest = JSON.parse(readFileSync(path, "utf8"))
  if (manifest?.version !== MANIFEST_VERSION || typeof manifest.sha !== "string" || typeof manifest.steps !== "object") throw new ReleaseRefusal(`manifeste illisible : ${path}`)
  return manifest
}

/** Écriture atomique : un manifeste n'est jamais à moitié écrit. */
export function writeManifest(path, manifest) {
  mkdirSync(join(path, ".."), { recursive: true })
  const temporary = `${path}.${process.pid}.tmp`
  writeFileSync(temporary, `${JSON.stringify(manifest, null, 2)}\n`)
  renameSync(temporary, path)
}

/** Une étape réussie (« fait »), ou `null`. */
export function doneStep(manifest, stepId) {
  const step = manifest?.steps?.[stepId]
  return step?.status === "fait" ? step : null
}

/**
 * La publication réussie la plus récente d'une étape, dans les AUTRES
 * manifestes du dossier : sert à nommer le commit précédent d'un moteur (son
 * retour arrière consiste à republier ce commit).
 */
export function latestDoneElsewhere(home, stepId, excludeSha) {
  if (!existsSync(home)) return null
  let best = null
  for (const entry of readdirSync(home)) {
    const path = join(home, entry, MANIFEST_FILE)
    if (!existsSync(path)) continue
    let manifest
    try {
      manifest = readManifest(path)
    } catch {
      continue
    }
    if (!manifest || manifest.sha === excludeSha) continue
    const step = doneStep(manifest, stepId)
    if (step && (!best || String(step.finishedAt) > String(best.finishedAt))) best = { sha: manifest.sha, finishedAt: step.finishedAt }
  }
  return best
}
