// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

import { nativeThemeTokens, type NativeThemeAppearance, type NativeThemeTokens } from "../themes/antsia-native"
import { ANTSIA_THEME_IDS, antsiaCharteFor } from "../themes/antsia-themes"
import { type ChartedNode, parseColor, TokenCascade } from "./css-token-cascade"

/**
 * Parité de la projection native avec les feuilles réellement servies, dans
 * l'ordre de styles.css puis du thème, comme antsia-themes.test.ts. Aucune
 * palette ni aucun rayon attendu n'est recopié depuis la projection native :
 * la cascade CSS (variables, spécificité et surcharges sombres) fait autorité.
 * Ce test ne remplace pas une recette Expo ou une mesure de contraste native.
 */
const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8")
const BASE_SHEETS = [
  { name: "theme.css", css: read("../styles/theme.css") },
  { name: "charte.css", css: read("../styles/charte.css") },
  { name: "communication.css", css: read("../styles/communication.css") },
] as const

type ColorKey = {
  [Key in keyof NativeThemeTokens]: NativeThemeTokens[Key] extends string ? Key : never
}[keyof NativeThemeTokens]
type RadiusKey = {
  [Key in keyof NativeThemeTokens]: NativeThemeTokens[Key] extends number ? Key : never
}[keyof NativeThemeTokens]

// Correspondance sémantique du contrat natif, sans valeurs de palette figées.
const COLOR_TOKENS = {
  background: "--background",
  foreground: "--foreground",
  card: "--card",
  muted: "--muted",
  mutedForeground: "--muted-foreground",
  border: "--border",
  input: "--input",
  primary: "--primary-fill",
  primaryOn: "--primary-fill-on",
  primaryInk: "--primary-500",
  social: "--role-social-fill",
  socialOn: "--role-social-on",
  react: "--role-react-ink",
  tabActive: "--esp-tab-active-bg",
  tabActiveInk: "--esp-tab-active-fg",
  danger: "--role-danger-ink",
  success: "--role-success-ink",
} as const satisfies Record<ColorKey, `--${string}`>
const RADIUS_TOKENS = {
  radiusCard: "--ui2-card-radius",
  radiusField: "--esp-field-radius",
  radiusMedia: "--esp-media-radius",
} as const satisfies Record<RadiusKey, `--${string}`>
const APPEARANCES: readonly NativeThemeAppearance[] = ["light", "dark"]

describe("projection native des thèmes ANTSIA", () => {
  it("couvre le registre courant et les mêmes feuilles de thème que le Web", () => {
    const files = readdirSync(new URL("../themes/", import.meta.url))
      .filter((name) => /^antsia(-[a-z]+)?\.css$/.test(name))
      .sort()
    expect(ANTSIA_THEME_IDS).toHaveLength(7)
    expect(new Set(ANTSIA_THEME_IDS).size).toBe(ANTSIA_THEME_IDS.length)
    expect(files).toEqual(ANTSIA_THEME_IDS.map((theme) => `${antsiaCharteFor(theme)}.css`).sort())
    for (const theme of ANTSIA_THEME_IDS) {
      for (const appearance of APPEARANCES) {
        expect(Object.keys(nativeThemeTokens(theme, appearance)).sort(), `${theme} ${appearance}`)
          .toEqual([...Object.keys(COLOR_TOKENS), ...Object.keys(RADIUS_TOKENS)].sort())
      }
    }
  })

  describe.each(ANTSIA_THEME_IDS)("%s", (theme) => {
    const charte = antsiaCharteFor(theme)
    const cascade = new TokenCascade([
      ...BASE_SHEETS,
      { name: `${charte}.css`, css: read(`../themes/${charte}.css`) },
    ])

    it.each(APPEARANCES)("résout les couleurs et les rayons du mode %s depuis la cascade CSS", (appearance) => {
      const node: ChartedNode = { charte, dark: appearance === "dark", nested: false }
      const native = nativeThemeTokens(theme, appearance)

      for (const key of Object.keys(COLOR_TOKENS) as ColorKey[]) {
        const token = COLOR_TOKENS[key]
        const label = `${theme} ${appearance} ${key} (${token})`
        const resolved = cascade.resolve(node, token)
        expect(resolved, label).toBeDefined()
        const cssColor = resolved === undefined ? undefined : parseColor(resolved)
        expect(cssColor, `${label} : couleur CSS résolue`).toBeDefined()
        expect(cssColor?.a, `${label} : couleur opaque`).toBe(1)
        expect(native[key], `${label} : valeur native statique`).not.toMatch(/var\(|color-mix\(/)
        expect(parseColor(native[key]), label).toEqual(cssColor)
      }

      for (const key of Object.keys(RADIUS_TOKENS) as RadiusKey[]) {
        const token = RADIUS_TOKENS[key]
        const label = `${theme} ${appearance} ${key} (${token})`
        const resolved = cascade.resolve(node, token)
        expect(resolved, label).toMatch(/^\d+(?:\.\d+)?px$/)
        const pixels = resolved?.match(/^(\d+(?:\.\d+)?)px$/)?.[1]
        expect(pixels, label).toBeDefined()
        expect(Number.isFinite(native[key]), label).toBe(true)
        expect(native[key], label).toBe(Number(pixels))
      }
    })
  })
})
