import { existsSync } from "node:fs"

import { describe, expect, it } from "vitest"

import { DEMO_CATALOG_DECLARATIONS, demoCatalogProjectionAllowed } from "./demo-catalog-projection"

describe("origine fermée des illustrations du catalogue", () => {
  it.each(["http://127.0.0.1:3210", "http://localhost:3210", "http://127.0.0.1:3260", "http://localhost:3260", "https://vivid-hedgehog-655.convex.cloud"])("admet l'origine exacte %s", (backendUrl) => {
    expect(demoCatalogProjectionAllowed(backendUrl)).toBe(true)
  })
  it.each(["", "https://production.convex.cloud", "https://other.convex.cloud", "https://vivid-hedgehog-655.convex.cloud.evil.test", "https://evil.test/vivid-hedgehog-655.convex.cloud", "https://vivid-hedgehog-655.convex.cloud@evil.test", "https://vivid-hedgehog-655.convex.cloud/path", "https://vivid-hedgehog-655.convex.cloud?demo=1", "https://vivid-hedgehog-655.convex.cloud#demo", "https://vivid-hedgehog-655.convex.cloud:443", "https://vivid-hedgehog-655.convex.cloud/", "http://localhost:3211", "http://localhost:3210.evil.test", "http://127.0.0.1:3210@evil.test", "https://localhost:3210"])("refuse origine différente, déguisée ou élargie : %s", (backendUrl) => {
    expect(demoCatalogProjectionAllowed(backendUrl)).toBe(false)
  })
})

describe("miroir du catalogue fictif", () => {
  it("13 produits, puis 10 et 10 prestations, chacun illustré par un fichier public existant", () => {
    const perShop: Record<string, number> = {}
    for (const declaration of DEMO_CATALOG_DECLARATIONS) perShop[declaration.shopHandle] = (perShop[declaration.shopHandle] ?? 0) + 1
    expect(perShop).toEqual({ "epicerie-moussavou-demo": 13, "studio-objectif-demo": 10, "atelier-tech-demo": 10 })
    expect(new Set(DEMO_CATALOG_DECLARATIONS.map((declaration) => declaration.offerRef)).size).toBe(33)
    for (const declaration of DEMO_CATALOG_DECLARATIONS) {
      expect(declaration.imagePath).toMatch(/^\/demo-media\/(animation-20261020\/[a-z-]+\.png|photos-20261021\/[a-z0-9-]+\.jpg)$/)
      expect(existsSync(new URL(`../../public${declaration.imagePath}`, import.meta.url)), declaration.imagePath).toBe(true)
    }
  })
})

