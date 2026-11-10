// @vitest-environment node
import { describe, expect, it } from "vitest"

import { firstNameOf } from "./FeedComposerPrompt"

describe("firstNameOf — le prénom de « Quoi de neuf, … ? »", () => {
  it.each([
    ["Awa MBA", "Awa"],
    ["Jean-Rémy NDONG", "Jean-Rémy"],
    ["NDONG MBA Jean-Rémy Éloïse", "Jean-Rémy"],
    ["  Sylvie   OYANE ", "Sylvie"],
    ["ANTSIA", "ANTSIA"],
    ["", ""],
  ])("%j → %j", (displayName, expected) => {
    expect(firstNameOf(displayName)).toBe(expected)
  })
})
