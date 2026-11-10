import { describe, expect, it } from "vitest"
import fr from "./fr.json"
import en from "./en.json"

describe("native locale contract", () => {
  it("offers the same nonempty messages in French and English", () => {
    expect(Object.keys(fr).sort()).toEqual(Object.keys(en).sort())
    for (const messages of [fr, en]) {
      expect(Object.values(messages).every((value) => value.trim().length > 0)).toBe(true)
    }
  })
})
