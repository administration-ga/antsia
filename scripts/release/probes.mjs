/**
 * Contrôles d'une publication sous forme d'éléments exécutables (EX-01),
 * partagés par les étapes de `release.mjs` et par `release-check.mjs` :
 * - zone d'un site (santé, version servie, CSP limitée au bon moteur, routes
 *   clés), en PRIVÉ par la commande de l'hébergeur (déploiement non promu) ou
 *   en PUBLIC par `fetch` ;
 * - API d'un moteur, comparée à l'empreinte du commit publié.
 * Lecture seule : aucune de ces requêtes ne modifie une cible.
 */
import { join } from "node:path"

import { apiFingerprint, compareApi, extractJsonDocument } from "./api-spec.mjs"
import { analyzeCsp, analyzeHealth, analyzeRoutes, mergeReports, parseCurlInclude } from "./checks.mjs"
import { command } from "./command.mjs"
import { httpGet, StepFailure } from "./executor.mjs"
import { CSP_ROUTE, HEALTH_ROUTE, KEY_ROUTES, convexDeploymentSelector } from "./targets.mjs"

/** Les chemins demandés pour une zone, chacun une seule fois (santé et CSP comprises). */
export function zonePaths(zone) {
  const routes = KEY_ROUTES[zone.zone].map((route) => `${zone.basePath}${route}`)
  return [...new Set([`${zone.basePath}${HEALTH_ROUTE}`, `${zone.basePath}${CSP_ROUTE}`, ...routes])]
}

/**
 * Les éléments d'un contrôle de zone. `source` dit comment demander :
 * `{ kind: "private", host, project: (state) => …, deployment: (state) => … }`
 * ou `{ kind: "public", origin: (state) => … }`. `expectedVersion(state)` rend
 * l'étiquette attendue, ou `null` pour ne pas la contrôler.
 */
export function zoneCheckItems({ zone, source, engineName, expectedVersion }) {
  const answersOf = (state) => {
    state.answers ??= {}
    state.answers[zone.zone] ??= {}
    return state.answers[zone.zone]
  }
  const requests = zonePaths(zone).map((path) => {
    if (source.kind === "private") {
      return {
        kind: "command",
        build: (state) => source.host.privateRequestCommand({ ...source.project(state), deployment: source.deployment(state), path }),
        accept: () => true,
        after: (result, state) => {
          try {
            answersOf(state)[path] = result.status === 0 ? parseCurlInclude(result.stdout) : { status: 0, headers: new Map(), body: "", error: `requête privée en échec (code ${result.status})` }
          } catch {
            answersOf(state)[path] = { status: 0, headers: new Map(), body: "", error: "réponse privée illisible" }
          }
        },
      }
    }
    return {
      kind: "action",
      text: (state) => `GET ${source.origin(state)}${path}`,
      run: async (state, io) => {
        answersOf(state)[path] = await httpGet(io.fetch, `${source.origin(state)}${path}`)
      },
    }
  })
  const analysis = {
    kind: "action",
    text: (state) => `analyse de la zone ${zone.zone} : santé et version${expectedVersion(state) === null ? " (non contrôlée)" : ` « ${expectedVersion(state)} »`}, CSP limitée au moteur ${engineName(state)}, ${KEY_ROUTES[zone.zone].length} routes en 200`,
    run: (state) => {
      const answers = answersOf(state)
      const health = analyzeHealth(answers[`${zone.basePath}${HEALTH_ROUTE}`], { expectedVersion: expectedVersion(state) })
      const csp = analyzeCsp(answers[`${zone.basePath}${CSP_ROUTE}`].headers.get("content-security-policy"), engineName(state))
      const routes = analyzeRoutes(KEY_ROUTES[zone.zone].map((route) => {
        const path = `${zone.basePath}${route}`
        return { path, status: answers[path].status, error: answers[path].error }
      }))
      state.reports ??= {}
      state.reports[zone.zone] = mergeReports([["santé", health], ["CSP", csp], ["routes", routes]])
    },
  }
  return [...requests, analysis]
}

/** Le relevé `function-spec` d'un moteur en ligne, par le lanceur Convex (Node supporté, aucune clé). */
export function functionSpecCommand(cwd, engineName) {
  return command("node", ["scripts/convex-dev.mjs", "function-spec"], { cwd, env: { CONVEX_DEPLOYMENT: convexDeploymentSelector(engineName) }, label: "relevé de l'API en ligne (lecture)" })
}

/**
 * Élément : relève l'API d'un moteur, la garde dans le dossier de publication
 * (`saveAs`) et la range dans `state.online[engineKey]`.
 */
export function readOnlineApiItem({ cwd, engineKey, engineName, saveAs, writeFile }) {
  return {
    kind: "command",
    build: (state) => functionSpecCommand(cwd(state), engineName(state)),
    after: (result, state) => {
      let document
      try {
        document = extractJsonDocument(result.stdout)
        apiFingerprint(document)
      } catch (error) {
        throw new StepFailure(`relevé de l'API du ${engineKey} illisible : ${error.message}`)
      }
      state.online ??= {}
      state.online[engineKey] = document
      if (saveAs) writeFile(join(state.dir, saveAs(state)), `${JSON.stringify(document, null, 2)}\n`)
    },
  }
}

/** Analyse : l'API servie est exactement celle de la référence (le commit publié). */
export function apiMatchReport(online, reference) {
  const fingerprint = apiFingerprint(online)
  const expected = apiFingerprint(reference)
  const report = { errors: [], warnings: [], facts: { fingerprint, expected, functions: online.functions.length } }
  if (fingerprint !== expected) {
    const { missing, added, changed } = compareApi(reference, online)
    report.errors.push(`API servie différente de celle du commit publié (${added.length} en plus, ${missing.length} manquantes, ${changed.length} signatures différentes)${[...missing, ...added, ...changed].length ? ` : ${[...missing, ...added, ...changed].slice(0, 10).join(", ")}` : ""}`)
  }
  return report
}
