// @vitest-environment node
import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

import { type ChartedNode, type StyleSheetSource, TokenCascade } from "../tests/css-token-cascade"
import { ANTSIA_THEME_IDS, antsiaCharteFor } from "./antsia-themes"

/**
 * Non-régression des autres consommateurs de la charte (lot P01).
 *
 * - La console (`apps/admin_antsia_ga`, `data-charte="admin-antsia"`, thème vide
 *   à dessein) rend la charte de base telle quelle : ses jetons résolus sont
 *   figés au lot P01 (`tests/fixtures/charte-base-resolved.json`). Toute valeur
 *   existante qui changerait — dans la charte, la couche de communication ou la
 *   couche Tailwind — se voit ici ; un jeton AJOUTÉ au contrat reste permis.
 *   Ce gel garde aussi la part de la base dont héritent les autres thèmes.
 * - DIASPORALE et la console ne voient rien du thème ANTSIA, même chargé dans
 *   la même feuille, avant ou après le leur. Le thème DIASPORALE, écrit par sa
 *   session, n'est volontairement pas figé ici : seule l'absence d'effet
 *   d'ANTSIA sur lui est vérifiée.
 */

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8")
const sheet = (name: string, path: string): StyleSheetSource => ({ name, css: read(path) })
const BASE = [
  sheet("theme.css", "../styles/theme.css"),
  sheet("charte.css", "../styles/charte.css"),
  sheet("communication.css", "../styles/communication.css"),
]
const ADMIN = sheet("admin-antsia.css", "./admin-antsia.css")
const DIASPORALE = sheet("diasporale.css", "./diasporale.css")
const ANTSIA = sheet("antsia.css", "./antsia.css")
const ANTSIA_THEMES = ANTSIA_THEME_IDS.map((id) => {
  const charte = antsiaCharteFor(id)
  return sheet(`${charte}.css`, `./${charte}.css`)
})
const NEIGHBORS = [
  ["admin-antsia", ADMIN],
  ["diasporale", DIASPORALE],
  ["diasporale-gaboma", sheet("diasporale-gaboma.css", "./diasporale-gaboma.css")],
] as const

interface FrozenBase {
  source: string
  clair: Record<string, string>
  sombre: Record<string, string>
}
const FROZEN = JSON.parse(read("../tests/fixtures/charte-base-resolved.json")) as FrozenBase

const NODES = (charte: string): ChartedNode[] =>
  [false, true].flatMap((dark) => [false, true].map((nested) => ({ charte, dark, nested })))
const label = (node: ChartedNode) => `${node.charte} ${node.dark ? "sombre" : "clair"}${node.nested ? " (portail)" : ""}`

describe("non-régression des chartes voisines", () => {
  it("la console garde chaque jeton résolu de la charte de base, figé au lot P01", () => {
    const console_ = new TokenCascade([...BASE, ADMIN])
    for (const mode of ["clair", "sombre"] as const) {
      const resolved = console_.resolveAll({ charte: "admin-antsia", dark: mode === "sombre", nested: false })
      const changed = Object.entries(FROZEN[mode])
        .filter(([token, frozen]) => resolved.get(token) !== frozen)
        .map(([token, frozen]) => `${mode} ${token} : ${frozen} → ${resolved.get(token) ?? "absent"}`)
      expect(changed).toEqual([])
    }
    expect(Object.keys(FROZEN.clair).length).toBeGreaterThan(200)
  })

  it.each(NEIGHBORS)("%s ne voit rien des sept thèmes ANTSIA, chargés avant ou après le sien", (charte, own) => {
    const alone = new TokenCascade([...BASE, own])
    const antsiaFirst = new TokenCascade([...BASE, ...ANTSIA_THEMES, own])
    const antsiaLast = new TokenCascade([...BASE, own, ...ANTSIA_THEMES])
    for (const node of NODES(charte)) {
      const reference = alone.resolveAll(node)
      expect(antsiaFirst.resolveAll(node), label(node)).toEqual(reference)
      expect(antsiaLast.resolveAll(node), label(node)).toEqual(reference)
    }
  })

  it("jetons de base du lot P01b : la couche Tailwind les lit, leurs défauts reprennent l'ancien rendu", () => {
    const layer = BASE[0]!.css.replace(/\/\*[\s\S]*?\*\//g, "")
    // L'outline universelle lisait l'utilitaire `outline-ring/50` ; le corps, 15 px en dur.
    expect(layer).not.toMatch(/outline-ring\/50/)
    expect(layer).toMatch(/\* \{\s*@apply border-border;[\s\S]*?outline-color: var\(--outline-ring\);\s*\}/)
    expect(layer).toMatch(/font-size: var\(--body-font-size, 15px\);/)
    expect(FROZEN.clair["--outline-ring"]).toBe("color-mix(in oklab, #0b4f9c 50%, transparent)")
    expect(FROZEN.sombre["--outline-ring"]).toBe("color-mix(in oklab, #5b9bdf 50%, transparent)")
    expect(FROZEN.clair["--body-font-size"]).toBe("15px")
  })

  it("ombres et rayon du réseau : la charte les porte au contrat avec EXACTEMENT les valeurs de la couche de communication, qui l'emporte", () => {
    const declared = (entry: StyleSheetSource) => new TokenCascade([entry]).declared({ charte: "admin-antsia", dark: false, nested: false })
    const charte = declared(BASE[1]!)
    const communication = declared(BASE[2]!)
    for (const token of ["--shadow-xs", "--shadow-sm", "--shadow-md", "--shadow-lg", "--shadow-xl", "--icom-float-drag-shadow", "--rp-surface-radius"]) {
      expect(charte.get(token)?.value, token).toBe(communication.get(token)?.value)
      // Ordre d'import de `styles.css` : la couche de communication passe après la charte.
      expect(new TokenCascade([...BASE, ADMIN]).declared({ charte: "admin-antsia", dark: false, nested: false }).get(token)?.sheet, token).toBe("communication.css")
    }
    expect(read("../styles.css")).toMatch(/@import "\.\/styles\/charte\.css";\s*@import "\.\/styles\/communication\.css";/)
  })

  it("test du test : une règle de thème non scopée fuirait vers DIASPORALE", () => {
    const leaking = { name: "antsia.css", css: `${ANTSIA.css}\n[data-charte] { --card: var(--primary-500); }` }
    const node: ChartedNode = { charte: "diasporale", dark: false, nested: false }
    const reference = new TokenCascade([...BASE, DIASPORALE]).resolve(node, "--card")
    expect(new TokenCascade([...BASE, DIASPORALE, leaking]).resolve(node, "--card")).not.toBe(reference)
  })

  it("test du test : le gel voit une valeur de la base qui change", () => {
    const altered = BASE.map((entry) => (entry.name === "charte.css" ? { ...entry, css: entry.css.replace("--esp-neutral-rule: #efebe0;", "--esp-neutral-rule: #000000;") } : entry))
    const resolved = new TokenCascade([...altered, ADMIN]).resolveAll({ charte: "admin-antsia", dark: false, nested: false })
    expect(resolved.get("--border")).not.toBe(FROZEN.clair["--border"])
  })
})

/**
 * Lot P03 (demandes D1, D3, D5 de la charte) : trois jetons entrent au contrat
 * sans effet des chartes ANTSIA sur les autres réseaux. DIASPORALE peut
 * adopter ces jetons dans sa propre charte, tenue par sa session.
 *
 * - D3 : les six surfaces ÉLEVÉES des publications lisent
 *   `var(--esp-surface-raised, <leur valeur d'avant>)`. La base pose le jeton à
 *   `initial` (valeur garantie invalide) : chaque surface retombe sur SA valeur
 *   historique sans thème opt-in — prouvé ici sur la base seule. Les autres
 *   réseaux gardent ensuite leur choix, avec ou sans les sept chartes ANTSIA.
 * - D1 : `--rp-surface-radius` (18 px) n'est plus figé par la page réseau.
 * - D5 : `--esp-inline-link-decoration` vaut `none` sans thème opt-in.
 */
const RAISED_SURFACES: readonly { file: string; before: string }[] = [
  { file: "../espace-kit/espace-kit-styles.tsx", before: "var(--esp-surface-card, var(--secondary))" },
  { file: "../../../social-features/src/features/reseau-personnel/PostOverflowMenu.tsx", before: "var(--ink-0)" },
  { file: "../../../social-features/src/features/reseau-personnel/CommentsSurface.tsx", before: "var(--ink-0)" },
  { file: "../../../social-features/src/shell/floating-card/EspaceFloatingCard.tsx", before: "var(--background)" },
  { file: "../../../social-features/src/shell/mobile/PostComposerSheet.tsx", before: "var(--background)" },
  { file: "../../../social-features/src/features/reseau-personnel/ReportContentDialog.tsx", before: "var(--card)" },
]
const raisedExpression = (before: string) => `var(--esp-surface-raised, ${before})`
const occurrences = (text: string, fragment: string) => text.split(fragment).length - 1

describe("lot P03 — jetons des publications ajoutés au contrat, rendu inchangé ailleurs", () => {
  it.each(RAISED_SURFACES)("$file lit la surface élevée avec SA valeur d'avant en repli", ({ file, before }) => {
    const source = read(file)
    expect(occurrences(source, raisedExpression(before))).toBe(1)
  })

  it("la base sans thème opt-in garde les six replis historiques, le rayon 18 px et les liens sans trait", () => {
    const cascade = new TokenCascade(BASE)
    for (const node of NODES("admin-antsia")) {
      expect(cascade.resolve(node, "--esp-surface-raised"), label(node)).toBeUndefined()
      for (const { file, before } of RAISED_SURFACES) {
        const previous = cascade.resolveValue(node, before)
        expect(previous, `${label(node)} ${file}`).toBeDefined()
        expect(cascade.resolveValue(node, raisedExpression(before)), `${label(node)} ${file}`).toBe(previous)
      }
      const mode = node.dark ? "sombre" : "clair"
      expect(cascade.resolve(node, "--rp-surface-radius"), label(node)).toBe(FROZEN[mode]["--rp-surface-radius"])
      expect(cascade.resolve(node, "--esp-inline-link-decoration"), label(node)).toBe("none")
    }
    expect(FROZEN.clair["--rp-surface-radius"]).toBe("18px")
    expect(FROZEN.sombre["--rp-surface-radius"]).toBe("18px")
  })

  it.each(NEIGHBORS)("%s : chaque surface élevée garde le choix de sa propre charte, avec ou sans les sept thèmes ANTSIA", (charte, own) => {
    const reference = new TokenCascade([...BASE, own])
    const cascades = [new TokenCascade([...BASE, ...ANTSIA_THEMES, own]), new TokenCascade([...BASE, own, ...ANTSIA_THEMES])]
    for (const cascade of cascades) {
      for (const node of NODES(charte)) {
        const raised = reference.resolve(node, "--esp-surface-raised")
        expect(cascade.resolve(node, "--esp-surface-raised"), label(node)).toBe(raised)
        for (const { file, before } of RAISED_SURFACES) {
          const expected = raised ?? reference.resolveValue(node, before)
          expect(expected, `${label(node)} ${file}`).toBeDefined()
          expect(cascade.resolveValue(node, raisedExpression(before)), `${label(node)} ${file}`).toBe(expected)
        }
      }
    }
  })

  it.each(NEIGHBORS)("%s : rayon et liens restent ceux de sa propre charte, indépendamment des sept thèmes ANTSIA", (charte, own) => {
    const reference = new TokenCascade([...BASE, own])
    const cascades = [new TokenCascade([...BASE, ...ANTSIA_THEMES, own]), new TokenCascade([...BASE, own, ...ANTSIA_THEMES])]
    for (const cascade of cascades) {
      for (const node of NODES(charte)) {
        for (const token of ["--rp-surface-radius", "--esp-inline-link-decoration"]) {
          expect(cascade.resolve(node, token), `${label(node)} ${token}`).toBe(reference.resolve(node, token))
        }
      }
    }
  })

  it("la page réseau du bureau ne fige plus le rayon : elle lit le jeton de la charte", () => {
    const page = read("../../../social-features/src/shell/ReseauAgentPage.tsx").replace(/\/\*[\s\S]*?\*\//g, "")
    expect(page).not.toMatch(/--rp-surface-radius\s*:/)
    expect(page).toMatch(/border-radius: var\(--rp-surface-radius\);/)
  })

  it("test du test : un défaut qui ne serait pas garanti invalide changerait une surface de la console", () => {
    const leaking = BASE.map((entry) => (entry.name === "charte.css" ? { ...entry, css: entry.css.replace("--esp-surface-raised: initial;", "--esp-surface-raised: var(--popover);") } : entry))
    expect(leaking[1]!.css).not.toBe(BASE[1]!.css)
    const cascade = new TokenCascade([...leaking, ADMIN])
    const node: ChartedNode = { charte: "admin-antsia", dark: false, nested: false }
    const changed = RAISED_SURFACES.filter(({ before }) => cascade.resolveValue(node, raisedExpression(before)) !== cascade.resolveValue(node, before))
    expect(changed.length).toBeGreaterThan(0)
  })
})
