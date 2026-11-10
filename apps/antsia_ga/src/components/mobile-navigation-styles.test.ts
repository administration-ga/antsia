import { describe, expect, it } from "vitest"

import { MOBILE_NAVIGATION_CSS } from "./mobile-navigation-styles"

describe("dock smartphone de l'application", () => {
  it("réserve son assise et l'encoche dans l'enveloppe mesurée, pour une surface compacte", () => {
    expect(MOBILE_NAVIGATION_CSS).toContain("@media (width < 768px)")
    expect(MOBILE_NAVIGATION_CSS).toContain("padding: 0 0 calc(8px + env(safe-area-inset-bottom, 0px))")
    expect(MOBILE_NAVIGATION_CSS).toContain("height: 64px")
    expect(MOBILE_NAVIGATION_CSS).toContain("min-width: 44px")
    expect(MOBILE_NAVIGATION_CSS).toContain("min-height: 54px")
    expect(MOBILE_NAVIGATION_CSS).toContain("repeat(4, minmax(0, 1fr))")
  })

  it("isole le petit repère actif et les libellés visibles, sans changer les autres réseaux", () => {
    expect(MOBILE_NAVIGATION_CSS).toContain("[data-destination-item][aria-current=\"page\"] [data-destination-icon]")
    expect(MOBILE_NAVIGATION_CSS).toContain("font-weight: 700")
    expect(MOBILE_NAVIGATION_CSS).toContain("[data-destination-label]")
    expect(MOBILE_NAVIGATION_CSS).toContain("var(--esp-tab-active-bg, var(--accent))")
    expect(MOBILE_NAVIGATION_CSS).toContain("prefers-reduced-motion: reduce")
    expect(MOBILE_NAVIGATION_CSS).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(/iu)
  })
})
