// @vitest-environment node
import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { avatarInitialsFontSize, identityToneStyle } from "../../../social-features/src/features/reseau-personnel/avatar-presentation"
import { type ChartedNode, contrastRatio, parseColor, TokenCascade } from "../tests/css-token-cascade"
import { ANTSIA_THEME_IDS, antsiaCharteFor } from "./antsia-themes"

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8")
const base = ["theme", "charte", "communication"].map((name) => ({ name, css: read(`../styles/${name}.css`) }))
// Les variantes restent opt-in : avatar-presentation.ts conserve les replis du composant.
const tones = ["F", "A", "B", "C", "D", "E"].map((name) => identityToneStyle(name))
tones.push(identityToneStyle("", false))
const fonts = { 24: "9px", 32: "12px", 40: "15px", 48: "18px", 64: "24px", 104: "40px" } as const
const avatarTokens = [
  ...Array.from({ length: 6 }, (_, index) => index + 1).flatMap((tone) => [`--esp-avatar-${tone}-bg`, `--esp-avatar-${tone}-fg`]),
  "--esp-avatar-neutral-bg", "--esp-avatar-neutral-fg",
  ...Object.keys(fonts).map((size) => `--esp-avatar-font-${size}`),
  "--esp-story-ring-seen-fill", "--esp-messages-heading-size",
]

describe("public avatar variants from the seven ANTSIA chartes", () => {
  it.each(ANTSIA_THEME_IDS)("%s keeps readable initials in both modes and portals", (id) => {
    const charte = antsiaCharteFor(id)
    const cascade = new TokenCascade([...base, { name: charte, css: read(`./${charte}.css`) }])
    for (const dark of [false, true]) for (const nested of [false, true]) {
      const node: ChartedNode = { charte, dark, nested }
      expect(new Set(tones.map((tone) => tone.background)).size).toBe(7)
      for (const [index, tone] of tones.entries()) {
        const background = parseColor(cascade.resolveValue(node, tone.background) ?? "")
        const foreground = parseColor(cascade.resolveValue(node, tone.color) ?? "")
        expect(background, `${id} avatar ${index + 1} background`).toBeDefined()
        expect(foreground, `${id} avatar ${index + 1} foreground`).toBeDefined()
        expect(contrastRatio(foreground!, background!), `${id} avatar ${index + 1}`).toBeGreaterThanOrEqual(4.5)
      }
      for (const [size, expected] of Object.entries(fonts)) {
        const expression = avatarInitialsFontSize(Number(size))
        expect(expression).toBe(`var(--esp-avatar-font-${size}, ${expected})`)
        expect(cascade.resolveValue(node, String(expression))).toBe(expected)
      }
      expect(cascade.resolve(node, "--esp-story-ring-fill")).toContain("from 210deg")
      const seen = "var(--esp-story-ring-seen-fill, color-mix(in srgb, var(--muted-foreground) 38%, transparent))"
      expect(read("../styles/communication.css")).toContain(seen)
      expect(cascade.resolveValue(node, seen)).toBe(`color-mix(in srgb, ${cascade.resolve(node, "--muted-foreground")} 38%, transparent)`)
      expect(cascade.resolve(node, "--esp-messages-heading-size")).toBeUndefined()
      // The seen ring is decorative; the interactive focus remains distinct.
      const focus = parseColor(cascade.resolve(node, "--ring") ?? "")
      const page = parseColor(cascade.resolve(node, "--background") ?? "")
      expect(contrastRatio(focus!, page!), `${id} focus`).toBeGreaterThanOrEqual(3)
    }
  })

  it("preserves the historical avatar colors and font fallback outside ANTSIA", () => {
    const cascade = new TokenCascade(base)
    for (const charte of ["admin-antsia", "diasporale"]) for (const dark of [false, true]) {
      const node: ChartedNode = { charte, dark, nested: false }
      for (const token of avatarTokens) expect(cascade.resolve(node, token), token).toBeUndefined()
      expect(cascade.resolveValue(node, "var(--esp-avatar-1-bg, var(--primary-50))")).toBe(cascade.resolve(node, "--primary-50"))
      expect(cascade.resolveValue(node, "var(--esp-avatar-1-fg, var(--primary-600))")).toBe(cascade.resolve(node, "--primary-600"))
      expect(cascade.resolveValue(node, "var(--esp-avatar-font-104, 40px)")).toBe("40px")
    }
  })
})
