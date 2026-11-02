import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({ notFound: vi.fn(() => { throw new Error("not-found") }) }))
vi.mock("next/navigation", () => ({ notFound: mocks.notFound }))
vi.mock("@/components/universes/food-universe-screen", () => ({ FoodUniverseScreen: () => null }))

import FoodUniversePage from "@/app/(membre)/restauration/page"
import { FoodUniverseScreen } from "@/components/universes/food-universe-screen"

beforeEach(() => { mocks.notFound.mockClear() })

describe("SU06 — route serveur de l'index alimentaire", () => {
  it("transmet le défaut puis la catégorie et le curseur sans lire le catalogue côté serveur", async () => {
    const root = await FoodUniversePage({ searchParams: Promise.resolve({}) })
    expect(root.type).toBe(FoodUniverseScreen)
    expect(root.props).toEqual({ search: { category: "food", cursor: null } })
    const filtered = await FoodUniversePage({ searchParams: Promise.resolve({ categorie: "food.prepared", curseur: "signed-page" }) })
    expect(filtered.props).toEqual({ search: { category: "food.prepared", cursor: "signed-page" } })
    expect(mocks.notFound).not.toHaveBeenCalled()
  })

  it.each([{ categorie: "fashion" }, { categorie: ["food", "food.groceries"] }, { curseur: ["a", "b"] }, { recherche: "riz" }])("refuse une URL hors de l'univers : %j", async searchParams => {
    await expect(FoodUniversePage({ searchParams: Promise.resolve(searchParams) })).rejects.toThrow("not-found")
    expect(mocks.notFound).toHaveBeenCalledExactlyOnceWith()
  })
})
