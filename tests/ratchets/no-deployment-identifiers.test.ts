import { existsSync, statSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { DEPLOYMENT_IDENTIFIER_PATTERNS, detectDeploymentIdentifiers, FICTIVE_IDENTIFIERS } from "./lib/deployment-identifiers"
import { type Finding, formatFindings, listFiles, readRepoFile, REPO_ROOT } from "./lib/source-files"

/**
 * Chemins surveillés : dossiers (récursifs) ou fichiers. EX-01 couvre les
 * scripts et sa procédure de publication ; EX-20 n'aura qu'à ÉTENDRE cette
 * liste (docs, ops, adr…) après avoir remplacé les identifiants déjà publiés
 * par des rôles. Le cliquet ne relit jamais son propre dossier.
 */
export const SCANNED_PATHS = ["scripts", "docs/36_PUBLICATION_ET_RETOUR_ARRIERE.md"] as const
const EXTENSIONS = [".mjs", ".cjs", ".js", ".ts", ".sh", ".md", ".json", ".yaml", ".yml", ".py"]

function scannedFiles(): string[] {
  const files: string[] = []
  for (const path of SCANNED_PATHS) {
    if (statSync(join(REPO_ROOT, path)).isDirectory()) files.push(...listFiles([path], EXTENSIONS))
    else files.push(path)
  }
  return files.filter((file) => !file.startsWith("tests/ratchets/"))
}

describe("no-deployment-identifiers — aucun identifiant interne d'hébergement dans le dépôt public", () => {
  it("les chemins surveillés existent (un renommage ne retire pas la couverture en silence)", () => {
    for (const path of SCANNED_PATHS) expect({ path, exists: existsSync(join(REPO_ROOT, path)) }).toEqual({ path, exists: true })
    expect(scannedFiles().length).toBeGreaterThan(10)
  })

  it("scripts et procédure de publication : cibles par variables de la machine, jamais par valeur", () => {
    const findings: Finding[] = []
    for (const file of scannedFiles()) findings.push(...detectDeploymentIdentifiers(file, readRepoFile(file)))
    expect(findings, formatFindings(findings)).toEqual([])
  })

  it("chaque exception est une valeur fictive justifiée, de la forme qu'elle exempte", () => {
    for (const { value, reason } of FICTIVE_IDENTIFIERS) {
      expect(value).toContain("exemple")
      expect(reason.length).toBeGreaterThan(20)
      expect(DEPLOYMENT_IDENTIFIER_PATTERNS.some(({ pattern }) => [...value.matchAll(pattern)].some((match) => match[0] === value))).toBe(true)
    }
  })

  it("test du test : chaque forme est vue, les formes génériques et les dates ne le sont pas", () => {
    const source = [
      'CONVEX_DEPLOYMENT=prod:brave-otter-123 node scripts/convex-dev.mjs deploy',
      'const url = "https://brave-otter-123.convex.cloud"',
      'curl https://antsia-k4zzzzzzz-equipe-projects-a1b2c3d4.vercel.app/sante',
      'AV=https://clamav-scanner-abcdef-ew.a.run.app',
      'export VERCEL_ORG_ID=team_AbCdEfGhIjKlMnOpQrStUvWx',
      'promote dpl_AbCdEfGhIjKlMnOpQrStUvWxYz12',
      'CONVEX_DEPLOY_KEY=preview:x|eyJ2MiI6IjEyMzQ1Njc4OTAxMjM0NTY3ODkwMTIzNDU2Nzg5MCJ9',
      // Formes génériques, valeurs fictives admises et dates : rien à signaler.
      'const host = `${name}.convex.cloud`',
      "Adresse type : `https://<nom>.convex.cloud`, nom de la forme `<adjectif>-<animal>-<nombre>`.",
      'backend: "https://exemple-demo.convex.cloud", enfant: "https://exemple-enfant.vercel.app"',
      'docs/recette/bienvenue-publication-2026-11-02/RAPPORT.md, "prod:exemple-demo|cle-secrete-de-test"',
      'const DEPLOYMENT_LINE = /(?:Production|Preview):\\s*(https:\\/\\/[a-z0-9-]+\\.vercel\\.app)\\b/',
    ].join("\n")
    const lines = detectDeploymentIdentifiers("scripts/fabrique.sh", source).map((finding) => finding.line)
    expect([...new Set(lines)]).toEqual([1, 2, 3, 4, 5, 6, 7])
    // Le rapport ne republie pas l'identifiant entier.
    expect(detectDeploymentIdentifiers("x", "prod:brave-otter-123")[0]?.message).toBe("nom de déploiement Convex (forme mot-mot-nombre) : « brav… »")
  })
})
