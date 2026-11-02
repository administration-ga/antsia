import { describe, expect, it } from "vitest"
import { avatarInitialsFontSize, identityToneStyle } from "./avatar-presentation"

describe("public avatar presentation", () => {
  it("keeps the same tone across case, spacing and Unicode composition", () => {
    const expected = identityToneStyle("Éloïse NDONG MBA")
    expect(identityToneStyle("  E\u0301LOÏSE\tNDONG   MBA  ")).toEqual(expected)
    expect(identityToneStyle("éloïse ndong mba")).toEqual(expected)
  })

  it("offers six stable presentation variants without an identity proof", () => {
    const tones = ["A", "B", "C", "D", "E", "F"].map((name) => identityToneStyle(name))
    expect(new Set(tones.map(({ background }) => background)).size).toBe(6)
    expect(tones.map(({ color }) => color).every((color) => color.includes("var(--primary-600)"))).toBe(true)
  })

  it("keeps absent and undisclosed identities neutral", () => {
    const neutral = identityToneStyle("")
    expect(identityToneStyle(" \n\t ")).toEqual(neutral)
    expect(identityToneStyle("Éloïse NDONG MBA", false)).toEqual(neutral)
    expect(neutral.background).toContain("--esp-avatar-neutral-bg")
  })

  it.each([24, 32, 40, 48, 64, 104])("retains the historical font fallback at %s px", (size) => {
    expect(avatarInitialsFontSize(size)).toBe(`var(--esp-avatar-font-${size}, ${Math.round(size * 0.38)}px)`)
  })

  it("retains the existing scale for other avatar sizes", () => {
    expect(avatarInitialsFontSize(36)).toBe(14)
  })
})
