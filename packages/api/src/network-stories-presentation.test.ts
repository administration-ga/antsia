// ADR-0027 : la rangée d'actus en médaillons et la marque en tête de la coque, sur déclaration seulement.
import { describe, expect, it } from "vitest"

import { resolveEngineStoriesPresentation, resolveEngineWordmark, type EngineStoriesPresentation } from "./network"

describe("resolveEngineStoriesPresentation — les médaillons sur déclaration seulement", () => {
  it("garde les cartes sans déclaration ou avec une valeur inconnue (DIASPORA.GA inchangée)", () => {
    expect(resolveEngineStoriesPresentation(undefined)).toBe("cards")
    expect(resolveEngineStoriesPresentation("cards")).toBe("cards")
    expect(resolveEngineStoriesPresentation("bubbles" as unknown as EngineStoriesPresentation)).toBe("cards")
  })

  it("retient les médaillons sur demande explicite de l'application", () => {
    expect(resolveEngineStoriesPresentation("rings")).toBe("rings")
  })
})

describe("resolveEngineWordmark — la marque en tête, ou le libellé neutre", () => {
  it("rend la marque déclarée, sans les blancs qui l'entourent", () => {
    expect(resolveEngineWordmark("ANTSIA")).toBe("ANTSIA")
    expect(resolveEngineWordmark("  ANTSIA ")).toBe("ANTSIA")
  })

  it("sans marque (absente, vide ou blanche), le moteur garde son libellé neutre", () => {
    expect(resolveEngineWordmark(undefined)).toBeNull()
    expect(resolveEngineWordmark("")).toBeNull()
    expect(resolveEngineWordmark("   ")).toBeNull()
  })
})
