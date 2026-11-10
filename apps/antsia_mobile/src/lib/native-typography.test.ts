import { describe, expect, it } from "vitest"
import { nativeFontFace, nativeFontWeight, nativeTypographySelection } from "./native-typography"

describe("native typography selection", () => {
  it("selects real Inter faces for existing numeric and named React Native weights", () => {
    expect(nativeFontFace(nativeTypographySelection({ fontWeight: "normal" }))).toBe("AntsiaInter-Regular")
    expect(nativeFontFace(nativeTypographySelection({ fontWeight: 500 }))).toBe("AntsiaInter-Medium")
    expect(nativeFontFace(nativeTypographySelection({ fontWeight: "600" }))).toBe("AntsiaInter-SemiBold")
    expect(nativeFontFace(nativeTypographySelection({ fontWeight: "bold" }))).toBe("AntsiaInter-Bold")
    expect(nativeFontFace(nativeTypographySelection({ fontWeight: "900" }))).toBe("AntsiaInter-ExtraBold")
  })
  it("uses Familjen for display text without requesting an unbundled heavy face", () => {
    expect(nativeFontFace(nativeTypographySelection({ variant: "display", fontWeight: "400" }))).toBe("AntsiaFamiljenGrotesk-Regular")
    expect(nativeFontFace(nativeTypographySelection({ variant: "display", fontWeight: "600" }))).toBe("AntsiaFamiljenGrotesk-SemiBold")
    expect(nativeFontFace(nativeTypographySelection({ variant: "display", fontWeight: "800" }))).toBe("AntsiaFamiljenGrotesk-Bold")
  })
  it("preserves nested text inheritance while honoring an explicit normal or body override", () => {
    const inherited = nativeTypographySelection({ variant: "display", fontWeight: "700" })
    expect(nativeTypographySelection({ inherited })).toEqual(inherited)
    expect(nativeTypographySelection({ inherited, fontWeight: "normal" })).toEqual({ variant: "display", weight: 400 })
    expect(nativeTypographySelection({ inherited, variant: "body" })).toEqual({ variant: "body", weight: 700 })
  })
  it("handles unsupported or non-finite weights without losing the inherited face", () => {
    for (const value of [Number.NaN, Number.POSITIVE_INFINITY, "invalid", {}, undefined]) expect(nativeFontWeight(value, 600)).toBe(600)
    expect(nativeFontWeight(100)).toBe(400)
    expect(nativeFontWeight(450)).toBe(500)
    expect(nativeFontWeight(750)).toBe(800)
  })
})
