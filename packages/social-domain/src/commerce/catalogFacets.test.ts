import { describe, expect, it, vi } from "vitest"

import { COMMERCE_CATALOG_CATEGORIES, parseCommerceCatalogFacets } from "./catalogFacets"
import { COMMERCE_PUBLIC_CONTRACT, COMMERCE_PUBLIC_CONTRACT_V2, COMMERCE_PUBLIC_CONTRACTS, isCommercePublicContract } from "./primitives"

const facets = { taxonomyVersion: 1, categoryPath: ["fashion", "fashion.women", "fashion.women.clothing"], attributes: [] }

describe("MP03 — admission fermée des facettes et contrats", () => {
  it("conserve V1 par défaut et distingue le contrat métier de sa version de transport", () => {
    expect(COMMERCE_PUBLIC_CONTRACT).toBe("PRO-COMMERCE-PUBLIC-V1")
    expect(COMMERCE_PUBLIC_CONTRACTS).toEqual([COMMERCE_PUBLIC_CONTRACT, COMMERCE_PUBLIC_CONTRACT_V2])
    expect(isCommercePublicContract(COMMERCE_PUBLIC_CONTRACT)).toBe(true)
    expect(isCommercePublicContract(COMMERCE_PUBLIC_CONTRACT_V2)).toBe(true)
    for (const value of [1, 2, null, "PRO-COMMERCE-PUBLIC-V3", "PRO-COMMERCE-COMMAND-V1"]) expect(isCommercePublicContract(value)).toBe(false)
  })

  it("chaque catégorie appartient à une chaîne existante, de même genre", () => {
    expect(new Set(COMMERCE_CATALOG_CATEGORIES.map((item) => item.key)).size).toBe(COMMERCE_CATALOG_CATEGORIES.length)
    for (const category of COMMERCE_CATALOG_CATEGORIES) {
      if (category.parent === null) continue
      const parent = COMMERCE_CATALOG_CATEGORIES.find((item) => item.key === category.parent)
      expect(parent?.kind).toBe(category.kind)
      expect(category.key.startsWith(`${category.parent}.`)).toBe(true)
    }
  })

  it("refuse prototypes, clés cachées, symboles, accesseurs et tableaux creux", () => {
    const getter = vi.fn(() => 1)
    const accessor = Object.defineProperty({ ...facets }, "taxonomyVersion", { enumerable: true, get: getter })
    const symbol = { ...facets, [Symbol("private")]: true }
    const hidden = Object.defineProperty({ ...facets }, "private", { value: true, enumerable: false })
    const inherited = Object.assign(Object.create({ private: true }) as Record<string, unknown>, facets)
    const sparse = { ...facets, attributes: new Array<unknown>(1) }
    for (const value of [accessor, symbol, hidden, inherited, sparse]) expect(parseCommerceCatalogFacets(value)).toBeNull()
    expect(getter).not.toHaveBeenCalled()
  })
})
