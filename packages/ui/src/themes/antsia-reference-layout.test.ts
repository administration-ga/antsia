// @vitest-environment node
import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { type ChartedNode, TokenCascade } from "../tests/css-token-cascade"
import { ANTSIA_THEME_IDS, antsiaCharteFor } from "./antsia-themes"

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8")
const base = ["theme", "charte", "communication"].map((name) => ({ name, css: read(`../styles/${name}.css`) }))
/** ADR-0037 : les angles changent, pas la disposition propre à chaque écran. */
const geometry = {
  "--esp-social-action-radius": "6px",
  "--ui2-card-radius": "16px", "--rp-surface-radius": "16px",
  "--esp-media-radius": "12px", "--esp-avatar-page-radius": "12px",
  "--esp-content-font-size": "15px", "--esp-field-radius": "14px",
} as const
// Ces options locales restent initial : chaque consommateur garde son repli, sans réintroduire
// une largeur globale de 1 400 px ni la grille abandonnée au profit du fil à colonne unique.
const unconfigured = [
  "--esp-page-title-size", "--esp-page-title-leading", "--esp-section-title-size", "--esp-section-title-leading",
  "--esp-field-font-size", "--esp-fab-size", "--esp-control-min-size", "--esp-layout-max-width", "--esp-layout-gap",
  "--esp-grid-wide-columns", "--esp-mobile-content-padding", "--esp-tablet-content-padding", "--esp-tablet-dock-width",
  "--esp-surface-shadow", "--esp-post-shadow",
] as const

describe("géométrie du fil sans cadre (ADR-0037), appliquée aux sept thèmes", () => {
  it.each(ANTSIA_THEME_IDS)("%s partage les mesures et conserve sa profondeur en clair/sombre et portail", (id) => {
    const charte = antsiaCharteFor(id)
    const cascade = new TokenCascade([...base, { name: charte, css: read(`./${charte}.css`) }])
    for (const dark of [false, true]) for (const nested of [false, true]) {
      const node: ChartedNode = { charte, dark, nested }
      for (const [token, expected] of Object.entries(geometry)) expect(cascade.resolve(node, token), token).toBe(expected)
      for (const token of unconfigured) expect(cascade.resolve(node, token), token).toBeUndefined()
      expect(cascade.resolveValue(node, "var(--esp-surface-shadow, none)")).toBe("none")
      expect(cascade.resolve(node, "--esp-mobilebar-bg")).toContain("0.72")
    }
  })

  it("ces nouvelles mesures restent opt-in pour la console et DIASPORALE", () => {
    const cascade = new TokenCascade(base)
    for (const charte of ["admin-antsia", "diasporale"]) for (const dark of [false, true]) {
      const node: ChartedNode = { charte, dark, nested: false }
      for (const token of ["--esp-social-action-radius", "--esp-content-font-size", "--esp-field-radius"]) expect(cascade.resolve(node, token), token).toBeUndefined()
      for (const token of unconfigured) expect(cascade.resolve(node, token), token).toBeUndefined()
      expect(cascade.resolve(node, "--rp-surface-radius")).toBe("18px")
    }
  })
})
