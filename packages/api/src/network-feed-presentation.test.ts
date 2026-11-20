// P04 (18/10/2026) : la présentation du fil est une capacité déclarée par l'application, jamais imposée.
import { describe, expect, it } from "vitest"

import { resolveEngineFeedPresentation, type EngineFeedPresentation } from "./network"

describe("resolveEngineFeedPresentation — le fil immersif sur déclaration seulement", () => {
  it("garde la liste historique sans déclaration ou avec une valeur inconnue (DIASPORA.GA inchangée)", () => {
    expect(resolveEngineFeedPresentation(undefined)).toBe("list")
    expect(resolveEngineFeedPresentation("list")).toBe("list")
    expect(resolveEngineFeedPresentation("pager" as unknown as EngineFeedPresentation)).toBe("list")
  })

  it("retient l'immersion sur demande explicite de l'application", () => {
    expect(resolveEngineFeedPresentation("immersive")).toBe("immersive")
  })
})
