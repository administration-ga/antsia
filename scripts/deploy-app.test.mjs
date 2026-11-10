import { describe, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { buildPlan, checkCatalog, externalRootWorkspaces, readCatalog, requiredBuildArgs } from "./deploy-app.mjs"

describe("catalogue réel du moteur", () => {
  test("est sain : paquets, ports, Dockerfiles, ARG NEXT_PUBLIC_* et listes blanches", () => {
    expect(checkCatalog(readCatalog())).toEqual([])
  })

  test("le plan n'invente aucune valeur : les absentes restent des marqueurs", () => {
    const plan = buildPlan(readCatalog(), "antsia_ga", {})
    expect(plan.build).toContain("--substitutions")
    expect(plan.build.join(" ")).toContain("_NEXT_PUBLIC_CONVEX_URL=<NEXT_PUBLIC_CONVEX_URL>")
    expect(plan.image).toContain("<ANTSIA_GCP_PROJECT>")
  })

  test("le plan passe toutes les clés de Cloud Build : celles d'une autre application, vides", () => {
    const plan = buildPlan(readCatalog(), "antsia_ga", { NEXT_PUBLIC_CONVEX_URL: "u" })
    const substitutions = plan.build[plan.build.indexOf("--substitutions") + 1]
    expect(substitutions).toContain("_NEXT_PUBLIC_CONVEX_URL=u")
    expect(substitutions).toContain("_NEXT_PUBLIC_DIASPORALE_DATA_SOURCE=,")
    expect(substitutions.split(",").filter((entry) => entry.startsWith("_NEXT_PUBLIC_")).length).toBe(11)
  })

  test("la mesure facultative absente reste vide, sans imposer sa configuration ni inscrire un marqueur", () => {
    const catalog = readCatalog()
    const plan = buildPlan(catalog, "antsia_ga", {})
    expect(plan.dockerLocal).toContain("NEXT_PUBLIC_POSTHOG_KEY=")
    expect(plan.dockerLocal).toContain("NEXT_PUBLIC_POSTHOG_HOST=")
    expect(plan.dockerLocal).toContain("NEXT_PUBLIC_POSTHOG_EU_RELAY_ORIGIN=")
    expect(plan.build.join(" ")).toContain("_NEXT_PUBLIC_POSTHOG_KEY=,_NEXT_PUBLIC_POSTHOG_HOST=")
    expect(requiredBuildArgs(plan.app)).toEqual(["NEXT_PUBLIC_CONVEX_URL", "NEXT_PUBLIC_SITE_URL", "NEXT_PUBLIC_BUILD_SHA"])
  })

  test("un champ facultatif ne peut pas rendre optionnelle la connexion Convex", () => {
    expect(requiredBuildArgs({ build_args: ["NEXT_PUBLIC_CONVEX_URL"], optional_build_args: ["NEXT_PUBLIC_CONVEX_URL"] })).toEqual(["NEXT_PUBLIC_CONVEX_URL"])
    const catalog = readCatalog()
    catalog.applications.antsia_ga.optional_build_args.push("NEXT_PUBLIC_CONVEX_URL")
    expect(checkCatalog(catalog)).toContain("antsia_ga : variable facultative non admise NEXT_PUBLIC_CONVEX_URL")
  })

  test("les options démo et chemin de base absentes restent vides dans les deux plans de build", () => {
    const plan = buildPlan(readCatalog(), "antsia_ga", {})
    const substitutions = plan.build[plan.build.indexOf("--substitutions") + 1].split(",")
    for (const name of ["NEXT_PUBLIC_DEMO_ENTRY_ENABLED", "NEXT_PUBLIC_APP_BASE_PATH"]) {
      expect(plan.dockerLocal).toContain(`${name}=`)
      expect(substitutions).toContain(`_${name}=`)
      expect(requiredBuildArgs(plan.app)).not.toContain(name)
    }
  })

  test("les options démo et chemin de base fournies sont conservées dans les deux plans de build", () => {
    const env = { NEXT_PUBLIC_DEMO_ENTRY_ENABLED: "true", NEXT_PUBLIC_APP_BASE_PATH: "/demo" }
    const plan = buildPlan(readCatalog(), "antsia_ga", env)
    const substitutions = plan.build[plan.build.indexOf("--substitutions") + 1].split(",")
    for (const [name, value] of Object.entries(env)) {
      expect(plan.dockerLocal).toContain(`${name}=${value}`)
      expect(substitutions).toContain(`_${name}=${value}`)
    }
  })

  test("une option inconnue reste obligatoire même déclarée facultative dans le catalogue", () => {
    const name = "NEXT_PUBLIC_UNKNOWN_OPTION"
    expect(requiredBuildArgs({ build_args: [name], optional_build_args: [name] })).toEqual([name])
    const catalog = readCatalog()
    catalog.applications.antsia_ga.build_args.push(name)
    catalog.applications.antsia_ga.optional_build_args.push(name)
    expect(checkCatalog(catalog)).toContain(`antsia_ga : variable facultative non admise ${name}`)
  })

  test("une application externe (DIASPORALE) a son plan, avec ses propres variables", () => {
    const plan = buildPlan(readCatalog(), "diasporale_com", {})
    expect(plan.dockerLocal).toContain("DIASPORALE/apps/diasporale_com/Dockerfile")
    expect(plan.build.join(" ")).toContain("_NEXT_PUBLIC_CONSULATE_URL=<NEXT_PUBLIC_CONSULATE_URL>")
  })

  test("les espaces de travail externes dont dépend la racine sont connus", () => {
    expect(externalRootWorkspaces()).toEqual(["DIASPORALE/packages/diasporale-domain"])
  })

  test("refuse une application inconnue", () => {
    expect(() => buildPlan(readCatalog(), "inconnue", {})).toThrow("inconnue")
  })

  test("le natif possède un contrat Expo réel et refuse tout plan Cloud Run", () => {
    const catalog = readCatalog()
    const native = catalog.applications.antsia_mobile
    expect(native.platform).toBe("expo-native")
    expect(native.platforms).toEqual(["ios", "android"])
    expect(native.config).toBe("app.config.ts")
    expect(native.entry).toBe("index.ts")
    expect(native.public_env).toContain("EXPO_PUBLIC_CONVEX_URL")
    expect(native.config_env).toContain("NATIVE_IOS_BUNDLE_ID")
    for (const field of ["service", "dockerfile", "site_url", "dev_port", "build_args"]) expect(native[field]).toBeUndefined()
    expect(() => buildPlan(catalog, "antsia_mobile", {})).toThrow("Publication native non raccordée")
  })

  test("une plateforme inconnue ne contourne ni le contrôle ni le plan web", () => {
    const catalog = readCatalog()
    catalog.applications.antsia_ga.platform = "inconnue"
    expect(checkCatalog(catalog)).toContain("antsia_ga : plateforme inconnue inconnue")
    expect(() => buildPlan(catalog, "antsia_ga", {})).toThrow("Plateforme inconnue")
  })
})

describe("contrôle d'un catalogue", () => {
  test("détecte un contrat natif incomplet ou déguisé en service web", () => {
    const catalog = readCatalog()
    const native = catalog.applications.antsia_mobile
    native.platforms = ["web"]
    native.config = "absent.config.ts"
    native.entry = "absent.ts"
    native.public_env.push("NATIVE_PRIVATE_VALUE")
    native.config_env.push("EXPO_PUBLIC_PRIVATE_VALUE")
    native.dockerfile = "ANTSIA/apps/antsia_ga/Dockerfile"
    const problems = checkCatalog(catalog)
    expect(problems).toContain("antsia_mobile : plateformes natives attendues : ios et android")
    expect(problems).toContain("antsia_mobile : config natif introuvable")
    expect(problems).toContain("antsia_mobile : entry natif introuvable")
    expect(problems).toContain("antsia_mobile : le point d'entrée ne correspond pas au manifeste")
    expect(problems).toContain("antsia_mobile : public_env natif invalide")
    expect(problems).toContain("antsia_mobile : config_env natif invalide")
    expect(problems).toContain("antsia_mobile : champ web « dockerfile » interdit au natif")
  })

  test("détecte un ARG manquant, un port faux et une liste blanche absente", () => {
    const ecosystems = mkdtempSync(join(tmpdir(), "catalogue-"))
    const root = join(ecosystems, "ANTSIA")
    mkdirSync(join(root, "apps/demo"), { recursive: true })
    writeFileSync(join(root, "apps/demo/package.json"), JSON.stringify({ name: "demo", scripts: { dev: "next dev --port 3999" } }))
    writeFileSync(join(root, "apps/demo/Dockerfile"), "FROM scratch\nARG NEXT_PUBLIC_CONVEX_URL\n")
    const catalog = {
      applications: {
        demo: {
          package: "demo",
          path: "apps/demo",
          service: "demo",
          dockerfile: "ANTSIA/apps/demo/Dockerfile",
          site_url: "https://demo.example",
          dev_port: 3030,
          build_args: ["NEXT_PUBLIC_CONVEX_URL", "NEXT_PUBLIC_SITE_URL"],
        },
      },
    }
    const problems = checkCatalog(catalog, root)
    expect(problems.some((p) => p.includes("ARG NEXT_PUBLIC_SITE_URL"))).toBe(true)
    expect(problems.some((p) => p.includes("3030"))).toBe(true)
    expect(problems.some((p) => p.includes("dockerignore"))).toBe(true)
    expect(problems).toContain("deploy/cloudbuild.yaml introuvable")
  })

  test("détecte une variable que Cloud Build ne passe pas, et un espace externe que l'image ne copie pas", () => {
    const ecosystems = mkdtempSync(join(tmpdir(), "catalogue-"))
    const root = join(ecosystems, "ANTSIA")
    mkdirSync(join(root, "apps/demo"), { recursive: true })
    mkdirSync(join(root, "deploy"), { recursive: true })
    mkdirSync(join(ecosystems, "EXTERNE/packages/regles"), { recursive: true })
    writeFileSync(
      join(root, "package.json"),
      JSON.stringify({ workspaces: { packages: ["apps/*", "../EXTERNE/packages/*"] }, dependencies: { "@externe/regles": "workspace:*" } }),
    )
    writeFileSync(join(ecosystems, "EXTERNE/packages/regles/package.json"), JSON.stringify({ name: "@externe/regles" }))
    writeFileSync(join(root, "apps/demo/package.json"), JSON.stringify({ name: "demo", scripts: { dev: "next dev --port 3999" } }))
    writeFileSync(join(root, "apps/demo/Dockerfile"), "FROM scratch\nARG NEXT_PUBLIC_CONVEX_URL\nCOPY ANTSIA ./ANTSIA\n")
    writeFileSync(join(root, "apps/demo/Dockerfile.dockerignore"), "*\n!ANTSIA\n")
    writeFileSync(join(root, "deploy/cloudbuild.yaml"), "steps: []\n")
    const catalog = {
      applications: {
        demo: {
          package: "demo",
          path: "apps/demo",
          service: "demo",
          dockerfile: "ANTSIA/apps/demo/Dockerfile",
          site_url: "https://demo.example",
          dev_port: 3999,
          build_args: ["NEXT_PUBLIC_CONVEX_URL"],
        },
      },
    }
    expect(checkCatalog(catalog, root)).toEqual([
      "demo : deploy/cloudbuild.yaml ne passe pas NEXT_PUBLIC_CONVEX_URL",
      "demo : le Dockerfile ne copie pas EXTERNE/packages/regles (dépendance de la racine d'ANTSIA)",
    ])
    writeFileSync(join(root, "deploy/cloudbuild.yaml"), "args: [NEXT_PUBLIC_CONVEX_URL=${_NEXT_PUBLIC_CONVEX_URL}]\n")
    writeFileSync(join(root, "apps/demo/Dockerfile"), "FROM scratch\nARG NEXT_PUBLIC_CONVEX_URL\nCOPY ANTSIA ./ANTSIA\nCOPY EXTERNE/packages ./EXTERNE/packages\n")
    expect(checkCatalog(catalog, root)).toEqual([])
  })
})
