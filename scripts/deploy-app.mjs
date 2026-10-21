#!/usr/bin/env node
/**
 * Publication d'une application du moteur à partir du catalogue
 * (`deploy/catalog.json`).
 *
 *   node scripts/deploy-app.mjs --check          contrôle le catalogue (sans réseau)
 *   node scripts/deploy-app.mjs <application>    affiche le plan de publication
 *   node scripts/deploy-app.mjs <application> --execute
 *                                                 publie (Cloud Build), seulement si
 *                                                 ANTSIA_GCP_PROJECT, ANTSIA_GCP_REGION
 *                                                 et ANTSIA_DEPLOY_AUTORISE=oui sont posés
 *
 * Par défaut, RIEN ne part : l'hébergement (arbitrage A5) n'est pas décidé, et
 * aucune publication ne se fait sans décision du propriétaire. Le plan affiché
 * est la commande exacte, construite en contexte ECOSYSTEMES avec la liste
 * blanche `deploy/gcloudignore`. Les valeurs des variables viennent de
 * l'environnement de la machine qui publie, jamais du dépôt.
 */
import { spawnSync } from "node:child_process"
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { dirname, join, relative, resolve, sep } from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
export const ECOSYSTEMS = resolve(ROOT, "..")
const OPTIONAL_PUBLIC_ARGS = new Set([
  "NEXT_PUBLIC_POSTHOG_KEY",
  "NEXT_PUBLIC_POSTHOG_HOST",
  "NEXT_PUBLIC_POSTHOG_EU_RELAY_ORIGIN",
  "NEXT_PUBLIC_DEMO_ENTRY_ENABLED",
  "NEXT_PUBLIC_APP_BASE_PATH",
])

/** Seules les options explicitement admises peuvent rester absentes au build. */
export function requiredBuildArgs(app) {
  const optional = new Set((app.optional_build_args ?? []).filter((name) => OPTIONAL_PUBLIC_ARGS.has(name)))
  return (app.build_args ?? []).filter((name) => !optional.has(name))
}

export function readCatalog(root = ROOT) {
  return JSON.parse(readFileSync(join(root, "deploy", "catalog.json"), "utf8"))
}

/**
 * Espaces de travail EXTERNES (hors d'ANTSIA : `../DIASPORALE/…`) dont dépend la
 * racine d'ANTSIA, en chemins relatifs à ECOSYSTEMES. `bun install
 * --frozen-lockfile` les exige même dans une installation élaguée : toute image
 * construite avec l'installation d'ANTSIA doit les copier.
 * @returns {string[]}
 */
export function externalRootWorkspaces(root = ROOT) {
  const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"))
  const wanted = new Set(
    Object.entries({ ...manifest.dependencies, ...manifest.devDependencies })
      .filter(([, version]) => String(version).startsWith("workspace:"))
      .map(([name]) => name),
  )
  const found = []
  for (const glob of manifest.workspaces?.packages ?? []) {
    if (!glob.startsWith("../") || !glob.endsWith("/*")) continue
    const base = resolve(root, glob.slice(0, -2))
    if (!existsSync(base)) continue
    for (const entry of readdirSync(base)) {
      const manifestPath = join(base, entry, "package.json")
      if (!existsSync(manifestPath)) continue
      if (wanted.has(JSON.parse(readFileSync(manifestPath, "utf8")).name)) {
        found.push(relative(resolve(root, ".."), join(base, entry)).split(sep).join("/"))
      }
    }
  }
  return found.sort()
}

/** Un Dockerfile copie-t-il ce chemin (relatif à ECOSYSTEMES), lui ou un dossier parent ? */
function copiesPath(dockerfile, path) {
  return [...dockerfile.matchAll(/^COPY\s+(?:--\S+\s+)*(\S+)\s+\S+\s*$/gm)].some(([, source]) => {
    const normalized = source.replace(/\/+$/, "")
    return path === normalized || path.startsWith(`${normalized}/`)
  })
}

/**
 * Contrôle d'un catalogue : chaque application déclare un paquet existant,
 * une configuration et une entrée Expo pour le natif ; pour le web,
 * un Dockerfile présent, et chaque variable NEXT_PUBLIC_* est un ARG du
 * Dockerfile ET une substitution de Cloud Build (sinon le bundle se construit
 * avec une valeur vide, sans erreur) ; chaque image copie les espaces de
 * travail externes dont dépend la racine (sinon l'installation échoue).
 * @returns {string[]} les défauts trouvés (vide = sain)
 */
export function checkCatalog(catalog, root = ROOT) {
  const problems = []
  const ecosystems = resolve(root, "..")
  const cloudbuildPath = join(root, "deploy", "cloudbuild.yaml")
  const cloudbuild = existsSync(cloudbuildPath) ? readFileSync(cloudbuildPath, "utf8") : null
  if (cloudbuild === null) problems.push("deploy/cloudbuild.yaml introuvable")
  const externals = existsSync(join(root, "package.json")) ? externalRootWorkspaces(root) : []
  for (const [key, app] of Object.entries(catalog.applications ?? {})) {
    const platform = app.platform ?? "web"
    if (platform !== "web" && platform !== "expo-native") {
      problems.push(`${key} : plateforme inconnue ${platform}`)
      continue
    }
    for (const arg of app.optional_build_args ?? []) {
      if (!OPTIONAL_PUBLIC_ARGS.has(arg) || !(app.build_args ?? []).includes(arg)) problems.push(`${key} : variable facultative non admise ${arg}`)
    }
    const fields = platform === "expo-native"
      ? ["package", "path", "platforms", "config", "entry", "public_env", "config_env"]
      : ["package", "path", "service", "dockerfile", "site_url", "dev_port", "build_args"]
    for (const field of fields) {
      if (app[field] === undefined) problems.push(`${key} : champ « ${field} » manquant`)
    }
    const manifestPath = join(root, app.path ?? "", "package.json")
    if (!existsSync(manifestPath)) {
      problems.push(`${key} : ${app.path}/package.json introuvable`)
    } else {
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8"))
      if (manifest.name !== app.package) problems.push(`${key} : le paquet s'appelle « ${manifest.name} », pas « ${app.package} »`)
      const devScript = manifest.scripts?.dev ?? ""
      if (platform === "expo-native") {
        if (!/^expo start(?:\s|$)/.test(devScript)) problems.push(`${key} : le script dev ne démarre pas Expo`)
        if (!manifest.dependencies?.expo) problems.push(`${key} : dépendance Expo absente`)
        if (manifest.main !== app.entry) problems.push(`${key} : le point d'entrée ne correspond pas au manifeste`)
      } else if (!devScript.includes(`--port ${app.dev_port}`)) problems.push(`${key} : le script dev n'écoute pas sur ${app.dev_port}`)
    }
    if (platform === "expo-native") {
      if (!Array.isArray(app.platforms) || [...app.platforms].sort().join(",") !== "android,ios") problems.push(`${key} : plateformes natives attendues : ios et android`)
      for (const field of ["config", "entry"]) {
        const path = app[field]
        if (typeof path !== "string" || !path || !existsSync(join(root, app.path ?? "", path))) problems.push(`${key} : ${field} natif introuvable`)
      }
      for (const field of ["public_env", "config_env"]) {
        if (!Array.isArray(app[field]) || app[field].some((name) => typeof name !== "string" || !(field === "public_env" ? /^EXPO_PUBLIC_[A-Z0-9_]+$/ : /^(?:NATIVE_|APNS_)[A-Z0-9_]+$/).test(name))) problems.push(`${key} : ${field} natif invalide`)
      }
      for (const field of ["service", "dockerfile", "site_url", "dev_port", "build_args", "optional_build_args", "runtime_env"]) {
        if (app[field] !== undefined) problems.push(`${key} : champ web « ${field} » interdit au natif`)
      }
      continue
    }
    const dockerfilePath = join(ecosystems, app.dockerfile ?? "")
    if (!existsSync(dockerfilePath)) {
      problems.push(`${key} : Dockerfile ${app.dockerfile} introuvable`)
    } else {
      const dockerfile = readFileSync(dockerfilePath, "utf8")
      for (const arg of app.build_args ?? []) {
        if (!new RegExp(`^ARG ${arg}\\b`, "m").test(dockerfile)) problems.push(`${key} : ARG ${arg} absent du Dockerfile`)
        if (cloudbuild !== null && !cloudbuild.includes(`${arg}=\${_${arg}}`)) problems.push(`${key} : deploy/cloudbuild.yaml ne passe pas ${arg}`)
      }
      for (const external of externals) {
        if (!copiesPath(dockerfile, external)) problems.push(`${key} : le Dockerfile ne copie pas ${external} (dépendance de la racine d'ANTSIA)`)
      }
      if (!existsSync(`${dockerfilePath}.dockerignore`)) problems.push(`${key} : ${app.dockerfile}.dockerignore absent (contexte ECOSYSTEMES sans liste blanche)`)
    }
    if (typeof app.site_url === "string" && !app.site_url.startsWith("https://")) problems.push(`${key} : site_url doit être en https`)
  }
  return problems
}

/** La commande de publication, sans l'exécuter. */
export function buildPlan(catalog, appKey, env = process.env) {
  const app = catalog.applications?.[appKey]
  if (!app) throw new Error(`Application inconnue du catalogue : ${appKey}`)
  if (app.platform === "expo-native") throw new Error(`Publication native non raccordée : ${appKey} ne possède aucun plan Cloud Run`)
  if (app.platform !== undefined && app.platform !== "web") throw new Error(`Plateforme inconnue du catalogue : ${app.platform}`)
  const project = env.ANTSIA_GCP_PROJECT ?? "<ANTSIA_GCP_PROJECT>"
  const region = env.ANTSIA_GCP_REGION ?? "<ANTSIA_GCP_REGION>"
  const image = `${region}-docker.pkg.dev/${project}/antsia/${app.service}:latest`
  const required = new Set(requiredBuildArgs(app))
  const valueOf = (name) => env[name] ?? (required.has(name) ? `<${name}>` : "")
  const buildArgs = (app.build_args ?? []).flatMap((name) => ["--build-arg", `${name}=${valueOf(name)}`])
  // Toutes les clés du gabarit Cloud Build : celles de l'application, et vides
  // celles des autres (la substitution reste stricte).
  const allArgs = [...new Set(Object.values(catalog.applications).filter((entry) => entry.platform !== "expo-native").flatMap((entry) => entry.build_args ?? []))]
  const substitutions = [
    `_DOCKERFILE=${app.dockerfile}`,
    `_IMAGE=${image}`,
    ...allArgs.map((name) => `_${name}=${(app.build_args ?? []).includes(name) ? valueOf(name) : ""}`),
  ].join(",")
  return {
    app,
    image,
    build: [
      "gcloud", "builds", "submit", ECOSYSTEMS,
      "--project", project,
      "--config", join(ROOT, "deploy", "cloudbuild.yaml"),
      "--ignore-file", "ANTSIA/deploy/gcloudignore",
      "--substitutions", substitutions,
    ],
    run: ["gcloud", "run", "deploy", app.service, "--image", image, "--project", project, "--region", region],
    dockerLocal: ["docker", "build", "-f", app.dockerfile, ...buildArgs, "-t", app.service, "."],
  }
}

function main() {
  const args = process.argv.slice(2)
  const catalog = readCatalog()
  if (args.includes("--check")) {
    const problems = checkCatalog(catalog)
    if (problems.length > 0) {
      console.error(`✗ catalogue : ${problems.length} défaut(s)`)
      for (const problem of problems) console.error(`  - ${problem}`)
      process.exitCode = 1
      return
    }
    console.log(`✓ catalogue sain : ${Object.keys(catalog.applications).length} application(s)`)
    return
  }
  const appKey = args.find((arg) => !arg.startsWith("--"))
  if (!appKey) {
    console.error("Usage : node scripts/deploy-app.mjs --check | <application> [--execute]")
    process.exitCode = 1
    return
  }
  const plan = buildPlan(catalog, appKey)
  console.log(`Plan de publication de ${appKey} (service ${plan.app.service}, ${plan.app.site_url}) :`)
  console.log(`  construction locale (depuis ECOSYSTEMES) : ${plan.dockerLocal.join(" ")}`)
  console.log(`  Cloud Build : ${plan.build.join(" ")}`)
  console.log(`  mise en service : ${plan.run.join(" ")}`)
  if (!args.includes("--execute")) {
    console.log("\nRien n'a été publié (ajouter --execute, sur décision du propriétaire).")
    return
  }
  // Les variables nécessaires doivent être posées ; seules les options admises restent vides.
  const missing = ["ANTSIA_GCP_PROJECT", "ANTSIA_GCP_REGION", ...requiredBuildArgs(plan.app)].filter((name) => !process.env[name])
  if (missing.length > 0 || process.env.ANTSIA_DEPLOY_AUTORISE !== "oui") {
    console.error(`✗ publication refusée : ${missing.length > 0 ? `variables manquantes (${missing.join(", ")})` : ""}${process.env.ANTSIA_DEPLOY_AUTORISE !== "oui" ? " ANTSIA_DEPLOY_AUTORISE≠oui (décision du propriétaire)" : ""}`)
    process.exitCode = 1
    return
  }
  const build = spawnSync(plan.build[0], plan.build.slice(1), { stdio: "inherit" })
  if (build.status !== 0) {
    process.exitCode = build.status ?? 1
    return
  }
  const run = spawnSync(plan.run[0], plan.run.slice(1), { stdio: "inherit" })
  process.exitCode = run.status ?? 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main()
}
