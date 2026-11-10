// ADR-0028 : la carte et le fil de l'écran des chartes, sur déclaration seulement.
import { describe, expect, it } from "vitest"

import { resolveEnginePostPresentation, type EnginePostPresentation } from "./network"

describe("resolveEnginePostPresentation — chaque présentation sur déclaration seulement", () => {
  it("garde la carte historique sans déclaration ou avec une valeur inconnue (DIASPORALE inchangée)", () => {
    expect(resolveEnginePostPresentation(undefined)).toBe("classic")
    expect(resolveEnginePostPresentation("classic")).toBe("classic")
    expect(resolveEnginePostPresentation("feed" as unknown as EnginePostPresentation)).toBe("classic")
  })

  it("retient « media » et « charte » sur demande explicite de l'application", () => {
    expect(resolveEnginePostPresentation("media")).toBe("media")
    expect(resolveEnginePostPresentation("charte")).toBe("charte")
  })
})
