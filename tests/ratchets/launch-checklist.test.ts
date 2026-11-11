import { describe, expect, it } from "vitest"

import { readRepoFile } from "./lib/source-files"

/**
 * Cliquet `launch-checklist` (EX-19, plan 13) : la liste de contrôle du
 * lancement reste lisible et honnête. Chaque ligne cochable porte une preuve
 * attendue, un état d'un vocabulaire fermé et un responsable ; une ligne
 * « fait » ou « en cours » cite sa référence ; la case est cochée si et
 * seulement si la ligne est faite ; les renvois visent des lignes qui
 * existent ; le bilan est celui des lignes ; chaque critère du jalon 1 du plan
 * directeur a sa ligne. Le cliquet ne juge pas le fond : il empêche qu'une
 * ligne soit cochée sans preuve ou qu'un critère du jalon disparaisse.
 */
export const CHECKLIST_PATH = "docs/39_LISTE_DE_CONTROLE_LANCEMENT.md"
const MASTER_PLAN_PATH = "docs/etudes/2026-11-09-finalisation/00_PLAN_DIRECTEUR.md"

export const STATES = ["fait", "en cours", "à faire"] as const
export const ROLES = ["agent", "coordinateur", "propriétaire", "juriste", "tiers"] as const

const ROW = /^\| \[( |x)\] \|/u
const ID = /^(?:DOM|VAR|DEM|REC|EXP|J1)-\d{2}$/u
const ID_IN_TEXT = /\b(?:DOM|VAR|DEM|REC|EXP|J1)-\d{2}\b/gu
const EMPTY = new Set(["", "—", "-"])
const SUMMARY_HEADER = "| Lignes | fait | en cours | à faire | attendent le propriétaire |"

export type ChecklistRow = { line: number; checked: boolean; id: string; control: string; proof: string; state: string; who: string; reference: string }

function cellsOf(line: string): string[] {
  return line.trim().replace(/^\|/u, "").replace(/\|$/u, "").split("|").map((cell) => cell.trim())
}

/** Les rôles d'une colonne « Qui » : « propriétaire + tiers (IDN) » donne propriétaire et tiers. */
export function rolesOf(who: string): string[] {
  return who.split("+").map((part) => part.replace(/\([^)]*\)/gu, "").trim())
}

export function parseRows(markdown: string): { rows: ChecklistRow[]; problems: string[] } {
  const rows: ChecklistRow[] = []
  const problems: string[] = []
  markdown.split("\n").forEach((text, index) => {
    const match = ROW.exec(text)
    if (!match) return
    const cells = cellsOf(text)
    if (cells.length !== 7) {
      problems.push(`ligne ${index + 1} : 7 colonnes attendues, ${cells.length} trouvées`)
      return
    }
    const [, id = "", control = "", proof = "", state = "", who = "", reference = ""] = cells
    rows.push({ line: index + 1, checked: match[1] === "x", id, control, proof, state, who, reference })
  })
  return { rows, problems }
}

/** Les domaines du tableau « Jalon 1 » du plan directeur (§ 4). */
export function jalonOneDomains(masterPlan: string): string[] {
  const start = masterPlan.indexOf("### Jalon 1")
  if (start < 0) return []
  const rest = masterPlan.slice(start + 1)
  const end = rest.indexOf("\n### ")
  const section = end < 0 ? rest : rest.slice(0, end)
  return section.split("\n")
    .filter((line) => line.startsWith("| ") && !line.startsWith("| Domaine ") && !line.startsWith("|---"))
    .map((line) => cellsOf(line)[0] ?? "")
    .filter((domain) => domain.length > 0)
}

export function checklistProblems(markdown: string, domains: readonly string[]): string[] {
  const { rows, problems } = parseRows(markdown)
  if (rows.length === 0) problems.push("aucune ligne cochable")
  const seen = new Set<string>()
  for (const row of rows) {
    const at = `ligne ${row.line} (${row.id || "sans numéro"})`
    if (!ID.test(row.id)) problems.push(`${at} : numéro hors forme`)
    if (seen.has(row.id)) problems.push(`${at} : numéro en double`)
    seen.add(row.id)
    if (EMPTY.has(row.control)) problems.push(`${at} : contrôle vide`)
    if (EMPTY.has(row.proof)) problems.push(`${at} : preuve attendue vide`)
    if (!(STATES as readonly string[]).includes(row.state)) problems.push(`${at} : état « ${row.state} » hors vocabulaire (${STATES.join(", ")})`)
    if (row.checked !== (row.state === "fait")) problems.push(`${at} : case ${row.checked ? "cochée" : "vide"} pour l'état « ${row.state} »`)
    const roles = rolesOf(row.who)
    if (EMPTY.has(row.who) || roles.some((role) => !(ROLES as readonly string[]).includes(role))) problems.push(`${at} : responsable « ${row.who} » hors vocabulaire (${ROLES.join(", ")})`)
    if ((row.state === "fait" || row.state === "en cours") && EMPTY.has(row.reference)) problems.push(`${at} : ligne « ${row.state} » sans référence`)
  }
  for (const cited of new Set(markdown.match(ID_IN_TEXT) ?? [])) {
    if (!seen.has(cited)) problems.push(`renvoi à ${cited}, ligne absente`)
  }
  const lines = markdown.split("\n")
  const header = lines.indexOf(SUMMARY_HEADER)
  const summary = header < 0 ? undefined : lines[header + 2]
  if (!summary) problems.push("bilan absent")
  else {
    const expected = [
      rows.length,
      rows.filter((row) => row.state === "fait").length,
      rows.filter((row) => row.state === "en cours").length,
      rows.filter((row) => row.state === "à faire").length,
      rows.filter((row) => row.state !== "fait" && rolesOf(row.who).includes("propriétaire")).length,
    ].join(" | ")
    if (cellsOf(summary).join(" | ") !== expected) problems.push(`bilan « ${cellsOf(summary).join(" | ")} » au lieu de « ${expected} »`)
  }
  const jalon = rows.filter((row) => row.id.startsWith("J1-"))
  for (const domain of domains) {
    if (!jalon.some((row) => row.control.startsWith(`**${domain}**`))) problems.push(`critère du jalon 1 « ${domain} » sans ligne J1`)
  }
  for (const row of jalon) {
    if (!domains.some((domain) => row.control.startsWith(`**${domain}**`))) problems.push(`ligne ${row.line} (${row.id}) : domaine absent du jalon 1 du plan directeur`)
  }
  return problems
}

describe("launch-checklist — la liste de contrôle du lancement reste lisible et honnête", () => {
  const domains = jalonOneDomains(readRepoFile(MASTER_PLAN_PATH))

  it("le plan directeur donne bien les critères du jalon 1 (un renommage ne vide pas la règle en silence)", () => {
    expect(domains.length).toBeGreaterThanOrEqual(9)
    expect(domains).toContain("Exploitation")
  })

  it("chaque ligne a sa preuve attendue, son état, son responsable et, une fois avancée, sa référence", () => {
    expect(checklistProblems(readRepoFile(CHECKLIST_PATH), domains)).toEqual([])
  })

  it("test du test : une liste fabriquée qui enfreint chaque règle est refusée", () => {
    const fabricated = [
      SUMMARY_HEADER,
      "|---|---|---|---|---|",
      "| 9 | 9 | 0 | 0 | 0 |",
      "| ☐ | N° | Contrôle | Preuve attendue | État | Qui | Référence |",
      "| [x] | DOM-01 | Domaine branché | — | fait | propriétaire | — |",
      "| [ ] | DOM-01 | Doublon | une capture | fait | propriétaire | une PR |",
      "| [ ] | VAR-01 | Variable posée | relevé | presque | stagiaire | — |",
      "| [ ] | EXP-01 | Sonde en ligne | release-check | en cours | agent | — |",
      "| [ ] | J1-01 | **Droit** : mentions | REC-99 faite | à faire | juriste | — |",
      "| [ ] | J1-02 | **Inventé** : rien | une preuve | à faire | propriétaire | — |",
      "| [ ] | X-1 | Colonne en moins | preuve | à faire | agent |",
    ].join("\n")
    const problems = checklistProblems(fabricated, ["Droit", "Pilote"])
    for (const expected of [
      "ligne 5 (DOM-01) : preuve attendue vide",
      "ligne 5 (DOM-01) : ligne « fait » sans référence",
      "ligne 6 (DOM-01) : numéro en double",
      "ligne 6 (DOM-01) : case vide pour l'état « fait »",
      "ligne 7 (VAR-01) : état « presque » hors vocabulaire (fait, en cours, à faire)",
      "ligne 7 (VAR-01) : responsable « stagiaire » hors vocabulaire (agent, coordinateur, propriétaire, juriste, tiers)",
      "ligne 8 (EXP-01) : ligne « en cours » sans référence",
      "ligne 11 : 7 colonnes attendues, 6 trouvées",
      "renvoi à REC-99, ligne absente",
      // Six lignes lues (la septième a une colonne en moins) : deux « fait », une « en cours », deux « à faire »,
      // une hors vocabulaire ; une seule ligne non faite nomme le propriétaire.
      "bilan « 9 | 9 | 0 | 0 | 0 » au lieu de « 6 | 2 | 1 | 2 | 1 »",
      "critère du jalon 1 « Pilote » sans ligne J1",
      "ligne 10 (J1-02) : domaine absent du jalon 1 du plan directeur",
    ]) expect(problems).toContain(expected)
  })

  it("test du test : les responsables composés et précisés sont lus rôle par rôle", () => {
    expect(rolesOf("propriétaire + tiers (IDN)")).toEqual(["propriétaire", "tiers"])
    expect(rolesOf("agent (S3 et S1)")).toEqual(["agent"])
    expect(rolesOf("agent + juriste + propriétaire")).toEqual(["agent", "juriste", "propriétaire"])
  })
})
