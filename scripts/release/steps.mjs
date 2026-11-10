/**
 * Les étapes de la publication d'ANTSIA (EX-01), dans l'ordre invariable de la
 * méthode (dossier de reprise § 8) :
 *
 *   export propre → moteur de démonstration (essai, envoi, contrôle) → moteur
 *   de production (essai, envoi, contrôle) → enfant de démonstration puis site
 *   principal, sans bascule → contrôle privé → promotion de l'enfant puis du
 *   principal → contrôle public ; la console suit le même chemin.
 *
 * Chaque étape vise UNE cible et s'exécute seule, sur confirmation nommant la
 * cible et le commit. Ses prérequis se lisent dans le manifeste de la même
 * publication : la production exige la démonstration publiée ET contrôlée ;
 * les sites exigent le moteur publié et contrôlé (ou vérifié inchangé) ; une
 * promotion exige le contrôle privé. Aucune étape ne rejoue de graine, ne pose
 * de variable de déploiement ni ne supprime quoi que ce soit en ligne.
 */
import { createHash } from "node:crypto"
import { existsSync, mkdirSync, readdirSync, readFileSync, statfsSync, statSync, writeFileSync } from "node:fs"
import { dirname, join, relative, sep } from "node:path"

import { apiFingerprint, blockingRemovals, compareApi, extractJsonDocument, isLocalSpec } from "./api-spec.mjs"
import { analyzeDeploy, analyzeDryRun, analyzeHealth, mergeReports } from "./checks.mjs"
import { command, outputOf } from "./command.mjs"
import { httpGet, StepFailure } from "./executor.mjs"
import { doneStep, latestDoneElsewhere, readManifest, releaseDir } from "./manifest.mjs"
import { apiMatchReport, readOnlineApiItem, zoneCheckItems } from "./probes.mjs"
import { CHECK_ZONES, ENGINES, HEALTH_ROUTE, ReleaseRefusal, SITES, buildLabel, convexDeploymentSelector, shortSha } from "./targets.mjs"

/** L'ordre de la méthode. Les étapes de retour arrière et la vérification d'un moteur inchangé sont à part. */
export const RELEASE_ORDER = Object.freeze([
  "export",
  "moteur-demo-essai",
  "moteur-demo",
  "controle-moteur-demo",
  "moteur-production-essai",
  "moteur-production",
  "controle-moteur-production",
  "site-demo",
  "site-principal",
  "controle-prive",
  "promotion-demo",
  "promotion-principal",
  "controle-public",
  "site-console",
  "controle-prive-console",
  "promotion-console",
  "controle-public-console",
])
export const ALTERNATIVE_STEPS = Object.freeze(["verification-moteur"])
export const ROLLBACK_STEPS = Object.freeze(["retour-demo", "retour-principal", "retour-console"])

/** Espace disque minimal pour l'export et son installation (même seuil que l'ancien script). */
export const MIN_FREE_MIB = 3072

/** Ce qui n'entre pas dans l'empreinte des sources (comme la préparation des publications passées). */
const FINGERPRINT_SKIPPED_PARTS = new Set(["node_modules", ".next", ".git", "docs", "coverage", ".convex", ".turbo", ".vercel"])
const FINGERPRINT_SKIPPED_NAMES = new Set(["CLAUDE.md", "AGENTS.md"])

function listFilesUnder(root) {
  const out = []
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry)
      if (statSync(path).isDirectory()) {
        if (!FINGERPRINT_SKIPPED_PARTS.has(entry)) walk(path)
      } else {
        out.push(relative(root, path).split(sep).join("/"))
      }
    }
  }
  walk(root)
  return out.sort()
}

/** Les fichiers `.env*` d'un dossier (un export propre n'en contient aucun). */
export function envFilesUnder(root) {
  const out = []
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry)
      if (statSync(path).isDirectory()) {
        if (entry !== "node_modules" && entry !== ".git") walk(path)
      } else if (entry.startsWith(".env")) {
        out.push(relative(root, path).split(sep).join("/"))
      }
    }
  }
  if (existsSync(root)) walk(root)
  return out.sort()
}

/** L'empreinte des sources envoyées : chemin et contenu de chaque fichier suivi. */
export function sourceFingerprint(root) {
  const files = listFilesUnder(root).filter((path) => {
    const name = path.split("/").pop()
    return !name.startsWith(".env") && !FINGERPRINT_SKIPPED_NAMES.has(name) && !name.endsWith(".tsbuildinfo")
  })
  const hash = createHash("sha256")
  for (const path of files) hash.update(`${path}\0${createHash("sha256").update(readFileSync(join(root, path))).digest("hex")}\n`)
  return { sourceFingerprint: hash.digest("hex"), sourceFiles: files.length }
}

function freeMiB(path) {
  let probe = path
  while (!existsSync(probe)) probe = dirname(probe)
  const stats = statfsSync(probe)
  return Math.floor((Number(stats.bavail) * Number(stats.bsize)) / (1024 * 1024))
}

const engineName = (key) => (state) => state.values[ENGINES[key].variable]

/** Le moteur est-il prêt pour les sites : publié et contrôlé en production, ou vérifié inchangé ? */
export function engineReady(manifest) {
  return Boolean(doneStep(manifest, "controle-moteur-production") || doneStep(manifest, "verification-moteur"))
}

/** Commande d'envoi du moteur, par le lanceur Convex (Node supporté), sans clé : `CONVEX_DEPLOYMENT=prod:<nom>`. */
function convexDeployCommand(state, name, { dryRun }) {
  const args = ["scripts/convex-dev.mjs", "deploy", "--typecheck", "disable"]
  if (dryRun) args.push("--dry-run")
  else args.push("--message", `ANTSIA ${state.sha12}`)
  return command("node", args, { cwd: state.exportAntsia, env: { CONVEX_DEPLOYMENT: convexDeploymentSelector(name) }, label: dryRun ? "essai d'envoi (--dry-run)" : "envoi réel du moteur" })
}

/** Élément : le relevé de l'API du candidat (fichier donné une fois, puis gardé dans le dossier de publication). */
function candidateItem() {
  return {
    kind: "action",
    text: (state) => state.options.apiCandidate
      ? `relevé de l'API du candidat ${state.options.apiCandidate} : venu d'un backend local, copié dans le dossier de la publication`
      : "relevé de l'API du candidat : celui du manifeste",
    run: (state) => {
      if (state.options.apiCandidate) {
        let document
        try {
          document = extractJsonDocument(readFileSync(state.options.apiCandidate, "utf8"))
          apiFingerprint(document)
        } catch (error) {
          throw new ReleaseRefusal(`relevé du candidat illisible : ${error.message}`)
        }
        if (!isLocalSpec(document)) throw new ReleaseRefusal("le relevé du candidat doit venir d'un backend LOCAL qui sert ce commit (docs/36, § Relevé du candidat)")
        const fingerprint = apiFingerprint(document)
        if (state.manifest.candidate && state.manifest.candidate.fingerprint !== fingerprint) throw new ReleaseRefusal("un autre relevé du candidat est déjà enregistré pour cette publication")
        writeFileSync(join(state.dir, "api-candidat.json"), `${JSON.stringify(document, null, 2)}\n`)
        state.manifest.candidate = { fingerprint, functions: document.functions.length, file: "api-candidat.json" }
      }
      if (!state.manifest.candidate) throw new ReleaseRefusal("relevé de l'API du candidat absent (--api-candidat <fichier>)")
      state.candidate = JSON.parse(readFileSync(join(state.dir, state.manifest.candidate.file), "utf8"))
    },
  }
}

const writeFile = (path, content) => writeFileSync(path, content)

/** Les trois étapes d'un moteur : essai (lecture et --dry-run), envoi, contrôle. */
function engineSteps(key) {
  const engine = ENGINES[key]
  const name = engineName(key)
  const essaiId = `moteur-${key}-essai`
  const envoiId = `moteur-${key}`
  const controleId = `controle-moteur-${key}`
  const zone = CHECK_ZONES.principal.find((entry) => entry.engine === key)
  const essai = {
    id: essaiId,
    title: `Essai d'envoi du ${engine.label} : API en ligne comparée au candidat, puis --dry-run`,
    kind: "lecture en ligne",
    variables: () => [engine.variable],
    requires: ({ manifest, options, home }) => {
      const reasons = []
      if (!doneStep(manifest, "export")) reasons.push("export propre non fait (étape export)")
      if (key === "production" && !doneStep(manifest, "controle-moteur-demo")) reasons.push("la démonstration doit avoir été publiée ET contrôlée dans ce manifeste (controle-moteur-demo)")
      if (!manifest?.candidate && !options.apiCandidate) reasons.push("relevé de l'API du candidat absent (--api-candidat <fichier>)")
      if (options.retourDe) {
        const undone = readManifest(join(home, options.retourDe, "manifeste.json"))
        if (!doneStep(undone, essaiId)) reasons.push(`retour arrière : la publication ${options.retourDe} n'a pas d'essai réussi pour ce moteur`)
      }
      return reasons
    },
    items: () => [
      candidateItem(),
      readOnlineApiItem({ cwd: (state) => state.exportAntsia, engineKey: key, engineName: name, saveAs: () => `api-${key}-avant.json`, writeFile }),
      {
        kind: "action",
        text: (state) => `comparaison avec le candidat : refus si l'envoi RETIRAIT une fonction servie en ligne${state.options.retourDe ? ` (retour arrière de ${state.options.retourDe} : seules ses fonctions ajoutées peuvent partir)` : ""}`,
        run: (state) => {
          const comparison = compareApi(state.online[key], state.candidate)
          let allowed = []
          if (state.options.retourDe) allowed = readManifest(join(state.home, state.options.retourDe, "manifeste.json")).steps[essaiId].comparison.added
          state.record.onlineFingerprint = apiFingerprint(state.online[key])
          state.record.comparison = comparison
          if (state.options.retourDe) state.record.retourDe = state.options.retourDe
          const blocking = blockingRemovals(comparison, allowed)
          if (blocking.length > 0) {
            throw new ReleaseRefusal(`l'envoi retirerait ${blocking.length} fonction(s) servie(s) en ligne, plus récente(s) que ce commit : ${blocking.slice(0, 10).join(", ")} — publier un commit qui les contient, ou composer un commit dédié`)
          }
        },
      },
      {
        kind: "command",
        build: (state) => convexDeployCommand(state, name(state), { dryRun: true }),
        after: (result, state) => {
          const report = analyzeDryRun(outputOf(result))
          state.record.dryRun = { warnings: report.warnings, addedIndexes: report.facts.addedIndexes }
          if (report.errors.length > 0) throw new ReleaseRefusal(report.errors)
        },
      },
    ],
  }
  const envoi = {
    id: envoiId,
    title: `Envoi du ${engine.label}`,
    kind: "envoi",
    variables: () => [engine.variable],
    requires: ({ manifest }) => (doneStep(manifest, essaiId) ? [] : [`essai réussi exigé avant l'envoi (${essaiId})`]),
    items: () => [
      readOnlineApiItem({ cwd: (state) => state.exportAntsia, engineKey: key, engineName: name, saveAs: () => `api-${key}-avant-envoi.json`, writeFile }),
      {
        kind: "action",
        text: () => "l'API en ligne n'a pas changé depuis l'essai (sinon : un autre publieur est passé)",
        run: (state) => {
          if (apiFingerprint(state.online[key]) !== state.manifest.steps[essaiId].onlineFingerprint) throw new ReleaseRefusal("l'API en ligne a changé depuis l'essai : un autre publieur est passé ; refaire l'essai")
          state.record.previousApiFingerprint = state.manifest.steps[essaiId].onlineFingerprint
          state.record.previousSha = latestDoneElsewhere(state.home, envoiId, state.sha)?.sha ?? null
        },
      },
      {
        kind: "command",
        build: (state) => convexDeployCommand(state, name(state), { dryRun: false }),
        after: (result, state) => {
          const report = analyzeDeploy(outputOf(result))
          state.record.engine = name(state)
          if (report.errors.length > 0) throw new StepFailure(report.errors.join(" ; "), report)
        },
      },
    ],
  }
  const controle = {
    id: controleId,
    title: `Contrôle du ${engine.label} : API servie = candidat, santé du site qu'il sert`,
    kind: "contrôle",
    variables: () => [engine.variable, "ANTSIA_RELEASE_SITE_ORIGIN"],
    requires: ({ manifest }) => (doneStep(manifest, envoiId) ? [] : [`envoi exigé avant le contrôle (${envoiId})`]),
    items: () => [
      candidateItem(),
      readOnlineApiItem({ cwd: (state) => state.exportAntsia, engineKey: key, engineName: name, saveAs: () => `api-${key}-apres.json`, writeFile }),
      {
        kind: "action",
        text: (state) => `GET ${state.values.ANTSIA_RELEASE_SITE_ORIGIN}${zone.basePath}${HEALTH_ROUTE} : le site déjà en ligne joint ce moteur (version du site non contrôlée)`,
        run: async (state, io) => {
          const api = apiMatchReport(state.online[key], state.candidate)
          const health = analyzeHealth(await httpGet(io.fetch, `${state.values.ANTSIA_RELEASE_SITE_ORIGIN}${zone.basePath}${HEALTH_ROUTE}`), { expectedVersion: null })
          const report = mergeReports([["API", api], ["santé", health]])
          state.record.report = report
          if (report.errors.length > 0) throw new StepFailure(report.errors.join(" ; "), report)
        },
      },
    ],
  }
  return [essai, envoi, controle]
}

/** Vérification sans envoi : les deux moteurs servent déjà l'API du candidat (publication des sites seuls). */
const verificationStep = {
  id: "verification-moteur",
  title: "Vérification d'un moteur inchangé : les deux moteurs servent déjà l'API du candidat (sites seuls)",
  kind: "lecture en ligne",
  variables: () => [ENGINES.demo.variable, ENGINES.production.variable],
  requires: ({ manifest, options }) => {
    const reasons = []
    if (!doneStep(manifest, "export")) reasons.push("export propre non fait (étape export)")
    if (!manifest?.candidate && !options.apiCandidate) reasons.push("relevé de l'API du candidat absent (--api-candidat <fichier>)")
    if (!options.moteurInchange) reasons.push("affirmer --moteur-inchange : le code du moteur de ce commit est celui déjà en ligne (l'empreinte ne prouve que les signatures)")
    return reasons
  },
  items: () => [
    candidateItem(),
    readOnlineApiItem({ cwd: (state) => state.exportAntsia, engineKey: "demo", engineName: engineName("demo"), saveAs: () => "api-demo-verification.json", writeFile }),
    readOnlineApiItem({ cwd: (state) => state.exportAntsia, engineKey: "production", engineName: engineName("production"), saveAs: () => "api-production-verification.json", writeFile }),
    {
      kind: "action",
      text: () => "les deux API servies sont exactement celle du candidat (sinon : publier le moteur d'abord)",
      run: (state) => {
        const report = mergeReports([["démonstration", apiMatchReport(state.online.demo, state.candidate)], ["production", apiMatchReport(state.online.production, state.candidate)]])
        state.record.report = report
        state.record.assertedUnchanged = true
        if (report.errors.length > 0) throw new ReleaseRefusal(`le moteur en ligne ne sert pas l'API de ce commit : publier le moteur d'abord (${report.errors.join(" ; ")})`)
      },
    },
  ],
}

/** L'origine publique et le chemin de la santé d'une zone de site (pour relire la version servie). */
function publicHealthUrl(state, siteKey) {
  if (siteKey === "console") return `${state.values.ANTSIA_RELEASE_CONSOLE_ORIGIN}${HEALTH_ROUTE}`
  return `${state.values.ANTSIA_RELEASE_SITE_ORIGIN}${siteKey === "demo" ? "/demo" : ""}${HEALTH_ROUTE}`
}
const publicOriginVariable = (siteKey) => (siteKey === "console" ? "ANTSIA_RELEASE_CONSOLE_ORIGIN" : "ANTSIA_RELEASE_SITE_ORIGIN")

/** Les étapes d'un site : déploiement sans bascule, promotion, retour arrière. */
function siteSteps(host, siteKey) {
  const site = SITES[siteKey]
  const deployId = `site-${siteKey}`
  const promoteId = `promotion-${siteKey}`
  const rollbackId = `retour-${siteKey}`
  const hostVariables = () => [...host.requiredVariables(siteKey), site.aliasVariable, ...(siteKey === "principal" || siteKey === "demo" ? ["ANTSIA_RELEASE_SITE_ORIGIN"] : ["ANTSIA_RELEASE_CONSOLE_ORIGIN"])]
  const target = (state) => host.projectOf(siteKey, state.values)
  const alias = (state) => state.values[site.aliasVariable]
  const inspectAlias = (onRead) => ({ kind: "command", build: (state) => host.inspectCommand({ ...target(state), target: alias(state) }), after: (result, state) => onRead(host.parseInspectOutput(result.stdout), state) })

  const deploy = {
    id: deployId,
    title: `Déploiement ${site.of}, sans bascule de domaine`,
    kind: "envoi",
    variables: hostVariables,
    requires: ({ manifest }) => {
      const reasons = []
      if (!doneStep(manifest, "export")) reasons.push("export propre non fait (étape export)")
      if (!engineReady(manifest)) reasons.push("moteur d'abord : controle-moteur-production réussi, ou verification-moteur (moteur inchangé)")
      if (siteKey === "principal" && !doneStep(manifest, "site-demo")) reasons.push("l'enfant de démonstration d'abord (site-demo) : son adresse se passe au build du principal")
      return reasons
    },
    items: () => [
      inspectAlias((current, state) => {
        state.record.previousAtDeploy = { id: current.id, url: current.url }
      }),
      ...(siteKey === "principal"
        ? [{
          kind: "action",
          text: (state) => `origine technique de l'enfant (${state.childDeploymentUrl}) contrôlée comme le relais du principal l'exige`,
          run: (state) => {
            const origin = host.childRuntimeOrigin(state.childDeploymentUrl, state.values.ANTSIA_RELEASE_SITE_ORIGIN)
            if (!origin) throw new StepFailure("adresse de l'enfant refusée par la règle du relais (/demo serait cassé)")
            state.childOrigin = origin
          },
        }]
        : []),
      {
        kind: "command",
        build: (state) => host.deployCommand({
          ecosystemsDir: state.ecosystems,
          ...target(state),
          buildEnv: {
            NEXT_PUBLIC_BUILD_SHA: buildLabel(state.sha, site.buildSuffix, { inMain: state.inMain }),
            ...(siteKey === "principal" ? { ANTSIA_DEMO_RUNTIME_ORIGIN: state.childOrigin } : {}),
          },
          meta: { antsiaReleaseCommit: state.sha, diasporaleReleaseCommit: state.diasporaleCommit, sourceFingerprint: state.sourceFingerprint },
        }),
        retry: (result) => host.retryableUpload(outputOf(result)),
        after: (result, state) => {
          state.deploymentUrl = host.parseDeployOutput(outputOf(result))
        },
      },
      {
        kind: "command",
        build: (state) => host.inspectCommand({ ...target(state), target: state.deploymentUrl }),
        after: (result, state) => {
          const deployment = host.parseInspectOutput(result.stdout)
          if (!host.isReady(deployment)) throw new StepFailure(`déploiement non prêt (état « ${deployment.readyState} »)`)
          state.record.deployment = { id: deployment.id, url: state.deploymentUrl }
          state.record.buildLabel = buildLabel(state.sha, site.buildSuffix, { inMain: state.inMain })
          state.record.project = target(state).project
        },
      },
    ],
  }

  const promotionPrerequisite = { demo: "controle-prive", principal: "promotion-demo", console: "controle-prive-console" }[siteKey]
  const promote = {
    id: promoteId,
    title: `Promotion ${site.of}`,
    kind: "bascule",
    variables: hostVariables,
    requires: ({ manifest }) => {
      const reasons = []
      if (!doneStep(manifest, deployId)) reasons.push(`déploiement exigé (${deployId})`)
      if (!doneStep(manifest, promotionPrerequisite)) reasons.push(`${promotionPrerequisite} réussi exigé avant la promotion`)
      return reasons
    },
    items: () => [
      inspectAlias((current, state) => {
        const expected = state.manifest.steps[deployId].previousAtDeploy
        if (current.id !== expected.id) throw new ReleaseRefusal("le déploiement en production a changé depuis l'envoi : un autre publieur est passé")
        state.record.previous = expected
      }),
      {
        kind: "action",
        text: (state) => `GET ${publicHealthUrl(state, siteKey)} : version servie avant la bascule (pour le retour arrière)`,
        run: async (state, io) => {
          const answer = await httpGet(io.fetch, publicHealthUrl(state, siteKey))
          try {
            state.record.previousVersion = answer.status === 200 ? JSON.parse(answer.body).version ?? null : null
          } catch {
            state.record.previousVersion = null
          }
        },
      },
      { kind: "command", build: (state) => host.promoteCommand({ ...target(state), deployment: state.manifest.steps[deployId]?.deployment?.id ?? "<ID_DEPLOIEMENT>" }) },
      inspectAlias((current, state) => {
        if (current.id !== state.manifest.steps[deployId].deployment.id) throw new StepFailure("après la promotion, la production ne sert pas le déploiement promu")
        state.record.promoted = state.manifest.steps[deployId].deployment
      }),
    ],
  }

  const rollback = {
    id: rollbackId,
    title: `Retour arrière ${site.of} : promotion du déploiement précédent`,
    kind: "retour arrière",
    variables: hostVariables,
    requires: ({ manifest }) => {
      const reasons = []
      if (!doneStep(manifest, promoteId)) reasons.push(`aucune promotion à annuler (${promoteId})`)
      if (siteKey === "principal" && !doneStep(manifest, "retour-demo")) reasons.push("l'enfant de démonstration d'abord (retour-demo), comme à la publication")
      return reasons
    },
    items: () => [
      inspectAlias((current, state) => {
        if (current.id !== state.manifest.steps[promoteId].promoted.id) throw new ReleaseRefusal("la production ne sert plus le déploiement de cette publication : rien à annuler ici")
      }),
      { kind: "command", build: (state) => host.promoteCommand({ ...target(state), deployment: state.manifest.steps[promoteId]?.previous?.id ?? "<ID_DEPLOIEMENT_PRECEDENT>" }) },
      inspectAlias((current, state) => {
        if (current.id !== state.manifest.steps[promoteId].previous.id) throw new StepFailure("après le retour arrière, la production ne sert pas le déploiement précédent")
        state.record.restored = state.manifest.steps[promoteId].previous
      }),
      ...(siteKey === "demo"
        ? []
        : [{
          kind: "action",
          text: () => "version servie revenue à celle d'avant la publication (relue sur la santé publique)",
          run: async (state, io) => {
            const zones = siteKey === "console" ? [["console", "console"]] : [["principal", "principal"], ["demo", "demo"]]
            const parts = []
            for (const [zoneKey, stepSite] of zones) {
              const expected = state.manifest.steps[`promotion-${stepSite}`]?.previousVersion ?? null
              const report = analyzeHealth(await httpGet(io.fetch, publicHealthUrl(state, zoneKey)), { expectedVersion: expected })
              if (expected === null) report.warnings.push("version d'avant la publication inconnue : contrôle de version impossible")
              parts.push([zoneKey, report])
            }
            const report = mergeReports(parts)
            state.record.report = report
            if (report.errors.length > 0) throw new StepFailure(report.errors.join(" ; "), report)
          },
        }]),
    ],
  }
  return [deploy, promote, rollback]
}

/** Contrôle d'un site (privé avant promotion, public après) sur toutes ses zones. */
function siteCheckStep(host, { id, siteKey, mode, prerequisite, deploymentStep }) {
  const zones = CHECK_ZONES[siteKey]
  return {
    id,
    title: `Contrôle ${mode === "private" ? "privé (avant promotion)" : "public (après promotion)"} ${SITES[siteKey].of} : santé, version, CSP, routes`,
    kind: "contrôle",
    variables: () => [
      ...(mode === "private" ? host.requiredVariables(siteKey) : []),
      ...new Set(zones.flatMap((zone) => [zone.originVariable, ENGINES[zone.engine].variable])),
    ],
    requires: ({ manifest }) => (doneStep(manifest, prerequisite) ? [] : [`${prerequisite} exigé avant ce contrôle`]),
    items: () => [
      ...zones.flatMap((zone) => zoneCheckItems({
        zone,
        engineName: (state) => state.values[ENGINES[zone.engine].variable],
        expectedVersion: (state) => buildLabel(state.sha, zone.buildSuffix, { inMain: state.inMain }),
        source: mode === "private"
          ? { kind: "private", host, project: (state) => host.projectOf(siteKey, state.values), deployment: (state) => state.manifest?.steps?.[deploymentStep]?.deployment?.id ?? "<ID_DEPLOIEMENT>" }
          : { kind: "public", origin: (state) => state.values[zone.originVariable] },
      })),
      {
        kind: "action",
        text: () => "bilan : tout défaut fait échouer le contrôle",
        run: (state) => {
          const report = mergeReports(zones.map((zone) => [zone.zone, state.reports[zone.zone]]))
          state.record.report = report
          if (report.errors.length > 0) throw new StepFailure(report.errors.join(" ; "), report)
        },
      },
    ],
  }
}

/** L'export propre : SHA d'ANTSIA, DIASPORALE à origin/main, aucun `.env*`, installation figée. */
function exportStep(host) {
  return {
    id: "export",
    title: "Export propre depuis le commit (aucun .env*), DIASPORALE à origin/main, installation figée",
    kind: "local",
    variables: () => [],
    requires: ({ manifest, dir }) => {
      const reasons = []
      if (manifest) reasons.push("un manifeste existe déjà pour cette publication : reprendre aux étapes suivantes, ou nommer une autre publication (--publication)")
      else if (existsSync(dir)) reasons.push(`le dossier ${dir} existe déjà : le vider à la main après lecture de son journal, ou nommer une autre publication`)
      return reasons
    },
    items: () => [
      {
        kind: "action",
        text: () => `espace disque d'au moins ${MIN_FREE_MIB} Mio, dossier de publication neuf`,
        run: (state) => {
          const free = freeMiB(state.dir)
          if (free < MIN_FREE_MIB) throw new ReleaseRefusal(`seulement ${free} Mio libres (il en faut ${MIN_FREE_MIB})`)
          state.record.freeMiB = free
        },
      },
      { kind: "command", build: (state) => command("git", ["-C", state.repos.antsia, "cat-file", "-e", `${state.sha}^{commit}`], { label: "le commit existe" }) },
      { kind: "command", build: (state) => command("git", ["-C", state.repos.antsia, "fetch", "origin", "main"], { label: "main relu juste avant" }) },
      {
        kind: "command",
        build: (state) => command("git", ["-C", state.repos.antsia, "merge-base", "--is-ancestor", state.sha, "origin/main"], { label: "le commit est-il dans main ?" }),
        accept: (result) => result.status === 0 || result.status === 1,
        after: (result, state) => {
          state.inMain = result.status === 0
          state.record.inMain = state.inMain
        },
      },
      { kind: "command", build: (state) => command("git", ["-C", state.repos.diasporale, "fetch", "origin", "main"], { label: "DIASPORALE relue" }) },
      {
        kind: "command",
        build: (state) => command("git", ["-C", state.repos.diasporale, "rev-parse", "origin/main"], { label: "commit de DIASPORALE (origin/main, jamais HEAD)" }),
        after: (result, state) => {
          const commit = result.stdout.trim()
          if (!/^[0-9a-f]{40}$/.test(commit)) throw new StepFailure("commit de DIASPORALE illisible")
          state.diasporaleCommit = commit
          state.record.diasporaleCommit = commit
        },
      },
      {
        kind: "action",
        text: (state) => `créer ${state.exportAntsia} et ${state.exportDiasporale}`,
        run: (state) => {
          mkdirSync(state.exportAntsia, { recursive: true })
          mkdirSync(state.exportDiasporale, { recursive: true })
        },
      },
      { kind: "command", build: (state) => command("git", ["-C", state.repos.antsia, "archive", "--format=tar", `--output=${join(state.exportRoot, "antsia.tar")}`, state.sha, "--", ".", ":(exclude,glob)**/.env*"], { label: "archive d'ANTSIA (fichiers suivis, sans .env*)" }) },
      { kind: "command", build: (state) => command("tar", ["-xf", join(state.exportRoot, "antsia.tar"), "-C", state.exportAntsia]) },
      { kind: "command", build: (state) => command("git", ["-C", state.repos.diasporale, "archive", "--format=tar", `--output=${join(state.exportRoot, "diasporale.tar")}`, state.diasporaleCommit, "--", ".", ":(exclude,glob)**/.env*"], { label: "archive de DIASPORALE (sans .env*)" }) },
      { kind: "command", build: (state) => command("tar", ["-xf", join(state.exportRoot, "diasporale.tar"), "-C", state.exportDiasporale]) },
      {
        kind: "action",
        text: (state) => `aucun fichier .env* dans l'export ; liste d'exclusion de l'hébergeur écrite (${join(state.ecosystems, host.ignoreFile.name)}) ; empreinte des sources`,
        run: (state) => {
          const leaked = envFilesUnder(state.ecosystems)
          if (leaked.length > 0) throw new StepFailure(`fichiers .env* dans l'export : ${leaked.join(", ")}`)
          writeFileSync(join(state.ecosystems, host.ignoreFile.name), host.ignoreFile.content)
          Object.assign(state.record, sourceFingerprint(state.ecosystems))
          state.sourceFingerprint = state.record.sourceFingerprint
        },
      },
      { kind: "command", build: (state) => command("bun", ["install", "--frozen-lockfile"], { cwd: state.exportAntsia, label: "installation figée" }) },
      {
        kind: "action",
        text: () => "l'installation n'a créé aucun fichier .env*",
        run: (state) => {
          const leaked = envFilesUnder(state.ecosystems)
          if (leaked.length > 0) throw new StepFailure(`fichiers .env* apparus dans l'export : ${leaked.join(", ")}`)
          state.record.exportDir = state.ecosystems
        },
      },
    ],
  }
}

/** Toutes les étapes, par identifiant, pour un hébergeur de sites donné. */
export function createSteps(host) {
  const steps = [
    exportStep(host),
    ...engineSteps("demo"),
    ...engineSteps("production"),
    verificationStep,
    ...siteSteps(host, "demo"),
    ...siteSteps(host, "principal"),
    siteCheckStep(host, { id: "controle-prive", siteKey: "principal", mode: "private", prerequisite: "site-principal", deploymentStep: "site-principal" }),
    siteCheckStep(host, { id: "controle-public", siteKey: "principal", mode: "public", prerequisite: "promotion-principal", deploymentStep: "site-principal" }),
    ...siteSteps(host, "console"),
    siteCheckStep(host, { id: "controle-prive-console", siteKey: "console", mode: "private", prerequisite: "site-console", deploymentStep: "site-console" }),
    siteCheckStep(host, { id: "controle-public-console", siteKey: "console", mode: "public", prerequisite: "promotion-console", deploymentStep: "site-console" }),
  ]
  const byId = Object.fromEntries(steps.map((step) => [step.id, step]))
  for (const stepId of [...RELEASE_ORDER, ...ALTERNATIVE_STEPS, ...ROLLBACK_STEPS]) {
    if (!byId[stepId]) throw new Error(`étape sans définition : ${stepId}`)
  }
  return byId
}

/**
 * L'état de départ d'une étape : valeurs connues (variables, manifeste) ou
 * marqueurs du plan pour celles qui ne le sont pas encore.
 */
export function initialState({ sha, home, publication, repos, values, manifest, options }) {
  const dir = join(home, publication ?? shortSha(sha))
  const exportRoot = join(dir, "export")
  const ecosystems = join(exportRoot, "ECOSYSTEMES")
  const steps = manifest?.steps ?? {}
  return {
    sha,
    sha12: shortSha(sha),
    home,
    dir,
    repos,
    values,
    options,
    manifest: manifest ?? { steps: {} },
    exportRoot,
    ecosystems,
    exportAntsia: join(ecosystems, "ANTSIA"),
    exportDiasporale: join(ecosystems, "DIASPORALE"),
    inMain: steps.export?.inMain ?? true,
    diasporaleCommit: steps.export?.diasporaleCommit ?? "<COMMIT_DIASPORALE>",
    sourceFingerprint: steps.export?.sourceFingerprint ?? "<EMPREINTE_SOURCES>",
    childDeploymentUrl: steps["site-demo"]?.deployment?.url ?? "<URL_DEPLOIEMENT_ENFANT>",
    childOrigin: "<ORIGINE_ENFANT>",
    deploymentUrl: "<URL_DEPLOIEMENT>",
    record: {},
  }
}

export { releaseDir }
