/**
 * Gouttière unique (décision du propriétaire du 22/10/2026) : au bureau, la marge
 * extérieure des pages de membre vaut l'écart entre les colonnes, et la barre du
 * haut comme le bandeau démo s'y alignent. Un seul jeton du thème Tailwind,
 * `--spacing-gutter`, lu par la coque des membres ET par la page réseau du moteur.
 * Les largeurs rendues se mesurent dans le navigateur ; ici, ce qui empêche les
 * feuilles de diverger.
 */
import { readFileSync } from "node:fs"

import { RESEAU_ADAPTIVE_CSS } from "@antsia/social-features/shell/reseau-adaptive-styles"
import { describe, expect, it } from "vitest"

import { MEMBER_NAVIGATION_CSS } from "./member-navigation-styles"

const withoutComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "")
const GLOBALS = withoutComments(readFileSync(new URL("../app/globals.css", import.meta.url), "utf8"))
const MEMBER = withoutComments(MEMBER_NAVIGATION_CSS)
const ENGINE = withoutComments(RESEAU_ADAPTIVE_CSS)

/** Le corps du bloc ouvert par `prelude` (accolades imbriquées comprises). */
function block(css: string, prelude: string): string {
  const start = css.indexOf(prelude)
  expect(start, prelude).toBeGreaterThanOrEqual(0)
  const open = css.indexOf("{", start)
  let depth = 1
  let close = open + 1
  while (close < css.length && depth > 0) {
    if (css[close] === "{") depth += 1
    else if (css[close] === "}") depth -= 1
    close += 1
  }
  return css.slice(open + 1, close - 1)
}

/** Les replis du jeton, dans l'ordre de la feuille. */
const fallbacks = (css: string) => [...css.matchAll(/var\(--spacing-gutter, (\d+px)\)/g)].map((match) => match[1])

describe("gouttière unique des pages de membre", () => {
  it("le thème Tailwind de l'application déclare le jeton : 16 px, puis 24 px dès 1 200 px", () => {
    expect(GLOBALS).toMatch(/@theme static\s*\{\s*--spacing-gutter:\s*16px;\s*\}/)
    expect(block(GLOBALS, "@media (min-width: 1200px)")).toMatch(/^\s*:root\s*\{\s*--spacing-gutter:\s*24px;\s*\}\s*$/)
  })

  it("la coque : bords, écart et barre du haut sur le jeton, sans largeur maximale ; 12 px au téléphone", () => {
    expect(MEMBER).not.toContain("max-width")
    expect(MEMBER).not.toContain("margin-inline: auto")
    expect(block(MEMBER, ".antsia-topbar-row {")).toContain("padding-inline: 12px")
    expect(block(MEMBER, ".antsia-member-frame {")).toContain("padding-inline: 12px")
    const tablet = block(MEMBER, "@media (min-width: 768px)")
    expect(tablet).toMatch(/\.antsia-topbar-row,\s*\.antsia-member-frame \{ padding-inline: var\(--spacing-gutter, 16px\); \}/)
    expect(tablet).toContain("gap: var(--spacing-gutter, 16px)")
    const desktop = block(MEMBER, "@media (min-width: 1200px)")
    expect(desktop).toMatch(/\.antsia-topbar-row,\s*\.antsia-member-frame \{ padding-inline: var\(--spacing-gutter, 24px\); \}/)
    expect(desktop).toContain("gap: var(--spacing-gutter, 24px)")
  })

  it("la page réseau du moteur lit le même jeton, avec les mêmes replis aux mêmes paliers", () => {
    expect(ENGINE).toContain("--rp-adaptive-gutter: var(--spacing-gutter, 16px)")
    expect(block(ENGINE, "@media (min-width: 1200px)")).toContain("--rp-adaptive-gutter: var(--spacing-gutter, 24px)")
    expect(ENGINE.match(/max-width:[^;]*/g)).toEqual(["max-width: none", "max-width: none"])
    // Sans le jeton (une autre application), les deux feuilles retombent encore ensemble.
    expect([...new Set(fallbacks(MEMBER))]).toEqual(["16px", "24px"])
    expect([...new Set(fallbacks(ENGINE))]).toEqual(["16px", "24px"])
  })
})
