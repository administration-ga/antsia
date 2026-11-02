// Dupliqué de socle/packages/ui-v2/src/components/card.test.tsx @ ad2e7fdc2 — adaptations : environnement jsdom déclaré en tête (l'environnement par défaut du paquet est `node`) ; rayon et contour attendus dans `--ui2-card-radius` et `--esp-surface-border` (ADR-0027).
// @vitest-environment jsdom
import { render } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { Card } from "./card"

describe("Card", () => {
  it("publie le slot de contrat et compose la classe appelante", () => {
    const { container } = render(<Card className="carte-metier">Corps</Card>)
    const card = container.firstElementChild as HTMLElement

    expect(card.dataset.slot).toBe("card")
    expect(card.classList.contains("carte-metier")).toBe(true)
  })

  it("consomme les jetons de surface, rayon et ombre", () => {
    const { container } = render(<Card>Corps</Card>)
    const style = container.firstElementChild?.getAttribute("style") ?? ""

    expect(style).toContain("background: var(--ink-0)")
    // Système épuré (ADR-0027) : rayon et contour des cartes lus dans leurs jetons, valeurs d'origine en repli.
    expect(style).toContain("border-radius: var(--ui2-card-radius, var(--radius-lg))")
    expect(style).toContain("border: 1px solid var(--esp-surface-border, var(--ink-200))")
    expect(style).toContain("box-shadow: var(--esp-surface-shadow, var(--shadow-xs))")
    expect(style).toContain("padding: var(--esp-card-padding, var(--ui2-card-pad, 24px))")
  })
})
