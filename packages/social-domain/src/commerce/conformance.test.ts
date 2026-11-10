import { createHash } from "node:crypto"
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

import { COMMERCE_FIXTURE_FILES, runCommerceConformance, type CommerceFixtureFile } from "./conformance"

/**
 * Fichiers jumeaux ANTSIA ⟷ PRO.GA : le manifeste porte l'empreinte de chaque
 * octet partagé (code pur et fixtures). Le dépôt voisin est relu s'il est
 * présent sur le poste (même règle que le contrat embarqué de PRO.GA) : une
 * copie divergente casse les deux suites.
 */
const HERE = fileURLToPath(new URL("./", import.meta.url))
const TWIN = fileURLToPath(new URL("../../../../../PRO_GA/packages/pro-domain/src/commerce/", import.meta.url))
const MANIFEST_PATH = "fixtures/MANIFEST.json"

type Manifest = {
  readonly contracts: Readonly<Record<string, string>>
  readonly files: Readonly<Record<string, string>>
  readonly manifestRevision: number
}

const sha256Hex = (bytes: string | Buffer): string => createHash("sha256").update(bytes).digest("hex")
const manifestBytes = readFileSync(join(HERE, MANIFEST_PATH))
const manifest = JSON.parse(manifestBytes.toString("utf8")) as Manifest

function sharedFilesOnDisk(root: string): string[] {
  const code = readdirSync(root).filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"))
  const fixtures = readdirSync(join(root, "fixtures")).filter((name) => name.endsWith(".json") && name !== "MANIFEST.json")
  return [...code, ...fixtures.map((name) => `fixtures/${name}`)].sort()
}

describe("PRO-COMMERCE — fichiers jumeaux et manifeste", () => {
  it("chaque fichier partagé porte exactement l'empreinte du manifeste", () => {
    const drift = Object.entries(manifest.files)
      .map(([path, digest]) => ({ path, digest, actual: sha256Hex(readFileSync(join(HERE, path))) }))
      .filter((entry) => entry.actual !== entry.digest)
    expect(drift).toEqual([])
  })

  it("aucun fichier partagé n'échappe au manifeste, aucun fichier listé ne manque", () => {
    expect(sharedFilesOnDisk(HERE)).toEqual(Object.keys(manifest.files).sort())
  })

  it("le manifeste couvre les contrats versionnés et toutes les fixtures du banc", () => {
    expect(Object.keys(manifest.contracts).sort()).toEqual(["PRO-COMMERCE-COMMAND-V1", "PRO-COMMERCE-PUBLIC-V1", "PRO-COMMERCE-PUBLIC-V2"])
    for (const file of COMMERCE_FIXTURE_FILES) expect(manifest.files[`fixtures/${file}`]).toMatch(/^[a-f0-9]{64}$/)
  })

  it("les copies de PRO.GA sont identiques octet pour octet (dépôt voisin présent)", () => {
    if (!existsSync(join(TWIN, MANIFEST_PATH))) return
    expect(sha256Hex(readFileSync(join(TWIN, MANIFEST_PATH)))).toBe(sha256Hex(manifestBytes))
    const drift = Object.keys(manifest.files).filter((path) => {
      const twinPath = join(TWIN, path)
      return !existsSync(twinPath) || sha256Hex(readFileSync(twinPath)) !== manifest.files[path]
    })
    expect(drift).toEqual([])
    expect(sharedFilesOnDisk(TWIN)).toEqual(sharedFilesOnDisk(HERE))
  })
})

function loadFixtures(): Partial<Record<CommerceFixtureFile, unknown>> {
  const fixtures: Partial<Record<CommerceFixtureFile, unknown>> = {}
  for (const file of COMMERCE_FIXTURE_FILES) {
    fixtures[file] = JSON.parse(readFileSync(join(HERE, "fixtures", file), "utf8")) as unknown
  }
  return fixtures
}

type FixtureCase = { name: string; expect: Record<string, unknown> }

describe("PRO-COMMERCE — banc de conformité sur les fixtures partagées", () => {
  it("toutes les fixtures donnent l'issue attendue", () => {
    expect(runCommerceConformance(loadFixtures(), sha256Hex)).toEqual([])
  })

  it("test du test : une attente positive faussée est vue", () => {
    const fixtures = loadFixtures()
    const first = (fixtures["public-events.json"] as { cases: FixtureCase[] }).cases[0]
    if (first === undefined) throw new Error("fixture vide")
    first.expect = { ok: false, path: "$", reason: "invalid_body" }
    expect(runCommerceConformance(fixtures, sha256Hex).map((failure) => failure.name)).toEqual([first.name])
  })

  it("test du test : une raison de refus faussée est vue, chemin compris", () => {
    const fixtures = loadFixtures()
    const cases = (fixtures["command-requests.json"] as { cases: FixtureCase[] }).cases
    const target = cases.find((entry) => entry.expect.reason === "forbidden_field")
    if (target === undefined) throw new Error("cas de champ interdit absent")
    target.expect = { ...target.expect, path: "$.payload" }
    expect(runCommerceConformance(fixtures, sha256Hex).map((failure) => failure.name)).toEqual([target.name])
  })

  it("test du test : une section vidée rend le banc rouge", () => {
    const fixtures = loadFixtures()
    ;(fixtures["public-revisions.json"] as { cases: unknown[] }).cases = []
    expect(runCommerceConformance(fixtures, sha256Hex)).toContainEqual({ detail: "section vide ou absente", file: "public-revisions.json", name: "cases" })
  })
})
