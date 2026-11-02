import { COMMERCE_CATALOG_CATEGORIES } from "@antsia/social-domain/commerce/catalogFacets"
import { describe, expect, it, vi } from "vitest"

import { DEFAULT_FOOD_UNIVERSE_SEARCH, FOOD_CATEGORY_KEYS, foodUniverseSearch, foodUniverseSearchFromParams, foodUniverseSearchParams } from "./food-universe-search"
import { memberDestinationFor, routes } from "./routes"

describe("SU06 — index alimentaire dans une URL fermée", () => {
  it("dérive les seuls rayons alimentaires du registre et garde la racine historique", () => {
    expect(FOOD_CATEGORY_KEYS).toEqual(COMMERCE_CATALOG_CATEGORIES.filter(category => category.key === "food" || category.key.startsWith("food.")).map(category => category.key))
    expect(FOOD_CATEGORY_KEYS).toEqual(["food", "food.groceries", "food.beverages", "food.prepared"])
    expect(foodUniverseSearch({})).toEqual(DEFAULT_FOOD_UNIVERSE_SEARCH)
    expect(routes.foodUniverse()).toBe("/restauration")
    expect(routes.foodUniverse({ category: "food" })).toBe("/restauration")
    expect(foodUniverseSearchParams(DEFAULT_FOOD_UNIVERSE_SEARCH).toString()).toBe("")
  })

  it.each(FOOD_CATEGORY_KEYS)("partage la catégorie canonique %s sans ajouter une deuxième catégorie", category => {
    const search = { category, cursor: '{"generation":3,"scope":"opaque &=+/"}' }
    const params = foodUniverseSearchParams(search)
    expect(foodUniverseSearchFromParams(params)).toEqual(search)
    expect(params.getAll("categorie")).toEqual(category === "food" ? [] : [category])
    expect([...params.keys()]).toEqual(category === "food" ? ["curseur"] : ["categorie", "curseur"])
    expect(routes.foodUniverse(search)).toBe(`/restauration?${params}`)
    expect(memberDestinationFor("/restauration", params)).toEqual({ id: "decouvrir", current: "section" })
  })

  it("admet un curseur opaque borné, conserve ses octets et remet le curseur vide à la racine", () => {
    const cursor = "a".repeat(8192)
    expect(foodUniverseSearch({ categorie: "food.groceries", curseur: cursor })).toEqual({ category: "food.groceries", cursor })
    expect(foodUniverseSearch({ curseur: "" })).toEqual(DEFAULT_FOOD_UNIVERSE_SEARCH)
    expect(foodUniverseSearch({ curseur: " continuation/émoji-🌿 " })?.cursor).toBe(" continuation/émoji-🌿 ")
    expect(routes.foodUniverse({ cursor: "next" })).toBe("/restauration?curseur=next")
    expect(routes.foodUniverse({ category: "food.prepared", cursor: null })).toBe("/restauration?categorie=food.prepared")
  })

  it.each([
    { recherche: "riz" }, { categorie: "fashion" }, { categorie: "services.digital" }, { categorie: "food.unknown" },
    { categorie: "foodgroceries" }, { categorie: "Food" }, { categorie: " food" }, { categorie: "" },
    { categorie: ["food"] }, { categorie: ["food", "food.groceries"] }, { categorie: [] },
    { curseur: ["a"] }, { curseur: ["a", "b"] }, { curseur: "a".repeat(8193) },
    { curseur: "next\n" }, { curseur: "\u0000" }, { curseur: "\u0085" }, { curseur: "\ud800" }, { curseur: "\udfff" },
  ])("refuse un paramètre étranger, répété ou hors contrat : %j", params => {
    expect(foodUniverseSearch(params)).toBeNull()
  })

  it("garde les répétitions visibles au parseur lors d'une transition SPA", () => {
    expect(foodUniverseSearchFromParams(new URLSearchParams("categorie=food&categorie=food"))).toBeNull()
    expect(foodUniverseSearchFromParams(new URLSearchParams("curseur=a&curseur=a"))).toBeNull()
    expect(foodUniverseSearchFromParams(new URLSearchParams("categorie=food.beverages&curseur=next"))).toEqual({ category: "food.beverages", cursor: "next" })
  })

  it("refuse les objets à prototype étranger, symboles ou accesseurs sans les invoquer", () => {
    const getter = vi.fn(() => "food")
    expect(foodUniverseSearch(Object.assign(Object.create({ private: true }), { categorie: "food" }))).toBeNull()
    expect(foodUniverseSearch({ [Symbol("private")]: "value" })).toBeNull()
    expect(foodUniverseSearch(Object.defineProperty({}, "categorie", { get: getter }))).toBeNull()
    expect(getter).not.toHaveBeenCalled()
    expect(foodUniverseSearch(Object.assign(Object.create(null), { categorie: "food.prepared" }))).toEqual({ category: "food.prepared", cursor: null })
  })
})
