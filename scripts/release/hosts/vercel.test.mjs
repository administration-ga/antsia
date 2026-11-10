import { describe, expect, test } from "bun:test"

import { formatCommand } from "../command.mjs"
import { childRuntimeOrigin, deployCommand, hostOf, ignoreFile, inspectCommand, parseDeployOutput, parseInspectOutput, privateRequestCommand, promoteCommand, requiredVariables, retryableUpload } from "./vercel.mjs"

const target = { team: "exemple-equipe", project: "exemple-projet-principal" }

describe("commandes de l'hébergeur (méthode de la reprise, sans identifiant)", () => {
  test("déploiement de production SANS bascule de domaine, valeurs du seul déploiement, métadonnées du commit", () => {
    const spec = deployCommand({ ecosystemsDir: "/hors/depot/ECOSYSTEMES", ...target, buildEnv: { NEXT_PUBLIC_BUILD_SHA: "main-0123456789ab-production" }, meta: { antsiaReleaseCommit: "c".repeat(40) } })
    expect(spec.program).toBe("vercel")
    expect(spec.args.slice(0, 8)).toEqual(["deploy", "/hors/depot/ECOSYSTEMES", "--prod", "--skip-domain", "--archive=tgz", "--yes", "--scope", "exemple-equipe"])
    expect(spec.args).toContain("--build-env")
    expect(spec.args.filter((arg) => arg === "NEXT_PUBLIC_BUILD_SHA=main-0123456789ab-production")).toHaveLength(2)
    expect(spec.args).toContain(`antsiaReleaseCommit=${"c".repeat(40)}`)
    expect(spec.env).toEqual({ VERCEL_ORG_ID: "exemple-equipe", VERCEL_PROJECT_ID: "exemple-projet-principal" })
    // Aucune commande de l'hébergeur ne touche aux variables du projet.
    expect(formatCommand(spec)).not.toMatch(/\benv (?:add|rm|pull)\b/)
  })

  test("lecture, promotion et requête privée", () => {
    expect(inspectCommand({ ...target, target: "https://site.exemple.test" }).args).toEqual(["inspect", "site.exemple.test", "--scope", "exemple-equipe", "--format=json"])
    expect(promoteCommand({ ...target, deployment: "dpl_exemple" }).args).toEqual(["promote", "dpl_exemple", "--scope", "exemple-equipe", "--yes"])
    expect(privateRequestCommand({ ...target, deployment: "dpl_exemple", path: "/demo/entrer" }).args).toEqual(["curl", "/demo/entrer", "--deployment", "dpl_exemple", "--scope", "exemple-equipe", "--yes", "--", "--silent", "--show-error", "--include", "--max-time", "30"])
    expect(hostOf("https://site.exemple.test")).toBe("site.exemple.test")
  })

  test("chaque site nomme son projet ; un site inconnu est refusé", () => {
    expect(requiredVariables("demo")).toEqual(["ANTSIA_RELEASE_VERCEL_TEAM", "ANTSIA_RELEASE_VERCEL_PROJECT_DEMO"])
    expect(requiredVariables("console")).toEqual(["ANTSIA_RELEASE_VERCEL_TEAM", "ANTSIA_RELEASE_VERCEL_PROJECT_CONSOLE"])
    expect(() => requiredVariables("inconnu")).toThrow("site inconnu")
  })

  test("la liste d'exclusion du contexte refuse tout .env*, les dépendances et git", () => {
    expect(ignoreFile.name).toBe(".vercelignore")
    for (const line of ["**/.env*", "**/node_modules/**", "**/.git/**", "**/docs/**"]) expect(ignoreFile.content.split("\n")).toContain(line)
  })
})

describe("lecture des sorties de l'hébergeur", () => {
  test("adresse du déploiement créé, état d'un déploiement", () => {
    expect(parseDeployOutput("Inspect: https://vercel.example.test/x\nProduction: https://exemple-enfant.vercel.app [3m]\n")).toBe("https://exemple-enfant.vercel.app")
    expect(parseDeployOutput("…\nhttps://exemple-principal.vercel.app\n")).toBe("https://exemple-principal.vercel.app")
    expect(() => parseDeployOutput("Error: EPIPE")).toThrow("adresse du déploiement absente")
    expect(parseInspectOutput('Vercel CLI\n{"id":"dpl_exemple","url":"exemple-enfant.vercel.app","readyState":"READY"}\n')).toEqual({ id: "dpl_exemple", url: "https://exemple-enfant.vercel.app", readyState: "READY" })
    expect(() => parseInspectOutput('{"readyState":"READY"}')).toThrow("identifiant du déploiement absent")
  })

  test("l'origine de l'enfant suit la règle du relais du principal", () => {
    expect(childRuntimeOrigin("https://exemple-enfant.vercel.app", "https://site.exemple.test")).toBe("https://exemple-enfant.vercel.app")
    expect(childRuntimeOrigin("https://exemple-enfant.vercel.app/demo", "https://site.exemple.test")).toBeNull()
    expect(childRuntimeOrigin("https://enfant.exemple.test", "https://site.exemple.test")).toBeNull()
    expect(childRuntimeOrigin("http://exemple-enfant.vercel.app", "https://site.exemple.test")).toBeNull()
  })

  test("seul un envoi coupé (EPIPE) se relance", () => {
    expect(retryableUpload("Error: write EPIPE")).toBe(true)
    expect(retryableUpload("Error: Build failed")).toBe(false)
  })
})
