import { COMMERCE_CATALOG_CATEGORIES } from "@antsia/social-domain/commerce/catalogFacets"

type CatalogCategoryKey = typeof COMMERCE_CATALOG_CATEGORIES[number]["key"]
export type FoodCategoryKey = Extract<CatalogCategoryKey, "food" | `food.${string}`>

/** Navigation issue du registre canonique ; aucun classement local des offres. */
export const FOOD_CATEGORY_KEYS: readonly FoodCategoryKey[] = COMMERCE_CATALOG_CATEGORIES
  .map(category => category.key)
  .filter((key): key is FoodCategoryKey => key === "food" || key.startsWith("food."))

export type FoodUniverseSearch = { category: FoodCategoryKey; cursor: string | null }
export const DEFAULT_FOOD_UNIVERSE_SEARCH: FoodUniverseSearch = { category: "food", cursor: null }

const keys = ["categorie", "curseur"]
const invalidText = /[\p{Cc}\uD800-\uDFFF]/u

/** URL fermée de l'univers : une catégorie alimentaire et une seule continuation opaque. */
export function foodUniverseSearch(params: Record<string, string | string[] | undefined>): FoodUniverseSearch | null {
  try {
    if (Object.getPrototypeOf(params) !== Object.prototype && Object.getPrototypeOf(params) !== null) return null
    for (const key of Reflect.ownKeys(params)) {
      if (typeof key !== "string" || !keys.includes(key)) return null
      const descriptor = Object.getOwnPropertyDescriptor(params, key)
      if (descriptor?.get !== undefined || descriptor?.set !== undefined) return null
    }
    const category = params.categorie ?? DEFAULT_FOOD_UNIVERSE_SEARCH.category
    if (typeof category !== "string" || !FOOD_CATEGORY_KEYS.some(key => key === category)) return null
    const cursor = params.curseur
    if (cursor !== undefined && (typeof cursor !== "string" || cursor.length > 8192 || invalidText.test(cursor))) return null
    return { category: category as FoodCategoryKey, cursor: cursor || null }
  } catch { return null }
}

/** La racine garde son adresse historique ; les paramètres ont un ordre stable. */
export function foodUniverseSearchParams(search: FoodUniverseSearch): URLSearchParams {
  const params = new URLSearchParams()
  if (search.category !== "food") params.set("categorie", search.category)
  if (search.cursor) params.set("curseur", search.cursor)
  return params
}

export function foodUniverseSearchFromParams(params: Pick<URLSearchParams, "keys" | "getAll">): FoodUniverseSearch | null {
  return foodUniverseSearch(Object.fromEntries([...new Set(params.keys())].map(key => {
    const values = params.getAll(key)
    return [key, values.length === 1 ? values[0]! : values]
  })))
}
