import { describe, expect, it } from "vitest"

import { listFiles, readRepoFile } from "./lib/source-files"

/**
 * Règle 2 de duplication : chaque fichier copié du socle commence par
 * `Dupliqué de <chemin> @ <commit> — adaptations : <liste>`. Les commits admis
 * sont ceux du socle effectivement lus (copie propre sur origin/main).
 */
// `1379d45f9` : socle lu pour la porte des comptes de démonstration (CH-817 : `lib/httpAddress`, `modules/platform/demoGate*`).
export const KNOWN_SOURCE_COMMITS = new Set(["ad2e7fdc2", "25398f565", "1379d45f9"])
const HEADER = /Dupliqué de (\S+)(?: \([^)]*\))? @ ([0-9a-f]{7,40}) — adaptations : (.+)/

describe("provenance-headers — en-tête de provenance des fichiers dupliqués", () => {
  it("chaque en-tête « Dupliqué de » est complet et vise un commit lu", () => {
    const problems: string[] = []
    const files = listFiles(["apps", "packages", "convex", "scripts", "tests"], [".ts", ".tsx", ".mjs", ".css", ".json"])
    for (const file of files) {
      if (file.startsWith("tests/ratchets/")) continue
      const head = readRepoFile(file).split("\n").slice(0, 5).join("\n")
      if (!head.includes("Dupliqué de")) continue
      const match = HEADER.exec(head)
      if (!match) {
        problems.push(`${file} : en-tête incomplet (chemin, commit, adaptations)`)
        continue
      }
      if (!KNOWN_SOURCE_COMMITS.has(match[2] ?? "")) problems.push(`${file} : commit ${match[2]} non répertorié`)
      if ((match[3] ?? "").trim().length < 5) problems.push(`${file} : adaptations non décrites`)
    }
    expect(problems).toEqual([])
  })
})
