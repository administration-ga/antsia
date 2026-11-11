import { describe, expect, it } from "vitest"

import { COMMERCE_CATALOG_CATEGORIES } from "./commerce/catalogFacets"
import {
  COMMERCE_CATEGORY_RULES,
  type CommerceCategoryRules,
  commerceCategoryRulesProblems,
  commerceCategoryRuling,
  isCommerceCategoryProhibited,
} from "./commerce-prohibited-categories"

/** Liste d'ESSAI : des clés de la taxonomie prises au hasard, pas une proposition (la liste reste à décider). */
const TRIAL: CommerceCategoryRules = {
  version: 7,
  decision: "essai-de-test",
  entries: [
    { key: "electronics.phones", rule: "prohibited" },
    { key: "beauty", rule: "regulated" },
    { key: "beauty.fragrance", rule: "prohibited" },
    { key: "services.wellness", rule: "regulated" },
  ],
}

describe("CM-02 — la liste en vigueur", () => {
  it("est VIDE, en version 1, sans décision : la liste reste à fixer par le propriétaire et un conseil", () => {
    expect(COMMERCE_CATEGORY_RULES).toEqual({ version: 1, decision: null, entries: [] })
    expect(commerceCategoryRulesProblems(COMMERCE_CATEGORY_RULES)).toEqual([])
  })

  it("ne refuse ni ne fait relire aucune catégorie de la taxonomie tant qu'elle est vide", () => {
    for (const category of COMMERCE_CATALOG_CATEGORIES) {
      expect(commerceCategoryRuling([category.key], COMMERCE_CATEGORY_RULES), category.key).toBeNull()
    }
  })
})

describe("CM-02 — la règle lit le chemin de la racine à la feuille", () => {
  it("refuse une clé interdite, avec la clé et la version qui l'ont décidé", () => {
    expect(commerceCategoryRuling(["electronics", "electronics.phones"], TRIAL)).toEqual({ rule: "prohibited", key: "electronics.phones", version: 7 })
    expect(isCommerceCategoryProhibited(["electronics", "electronics.phones"], TRIAL)).toBe(true)
  })

  it("couvre les descendantes d'une clé réglementée", () => {
    expect(commerceCategoryRuling(["beauty", "beauty.care"], TRIAL)).toEqual({ rule: "regulated", key: "beauty", version: 7 })
    expect(commerceCategoryRuling(["services", "services.wellness"], TRIAL)).toEqual({ rule: "regulated", key: "services.wellness", version: 7 })
  })

  it("fait l'emporter l'interdiction sur la réglementation d'un ancêtre", () => {
    expect(commerceCategoryRuling(["beauty", "beauty.fragrance"], TRIAL)).toEqual({ rule: "prohibited", key: "beauty.fragrance", version: 7 })
    expect(isCommerceCategoryProhibited(["beauty", "beauty.care"], TRIAL)).toBe(false)
  })

  it("laisse passer une catégorie hors liste, un chemin vide ou une clé inconnue", () => {
    expect(commerceCategoryRuling(["electronics", "electronics.computers"], TRIAL)).toBeNull()
    expect(commerceCategoryRuling(["electronics"], TRIAL)).toBeNull()
    expect(commerceCategoryRuling([], TRIAL)).toBeNull()
    expect(commerceCategoryRuling(["inconnue"], TRIAL)).toBeNull()
  })

  it("ne dépend que de la liste qu'on lui donne", () => {
    const empty: CommerceCategoryRules = { ...TRIAL, entries: [] }
    expect(commerceCategoryRuling(["electronics", "electronics.phones"], empty)).toBeNull()
  })
})

describe("CM-02 — une liste se relit avant d'entrer dans le code", () => {
  it("accepte la liste d'essai, décision citée", () => {
    expect(commerceCategoryRulesProblems(TRIAL)).toEqual([])
  })

  it("refuse une liste non vide sans décision citée", () => {
    expect(commerceCategoryRulesProblems({ ...TRIAL, decision: null })).toEqual(["liste non vide sans décision citée"])
    expect(commerceCategoryRulesProblems({ ...TRIAL, decision: "  " })).toEqual(["liste non vide sans décision citée"])
  })

  it("refuse une version qui n'est pas un entier positif", () => {
    for (const version of [0, -1, 1.5, Number.NaN]) expect(commerceCategoryRulesProblems({ ...TRIAL, version }), String(version)).toEqual([`version invalide : ${version}`])
  })

  it("refuse une clé hors taxonomie, une règle inconnue, un doublon", () => {
    const rules = {
      version: 2,
      decision: "essai",
      entries: [{ key: "health.medicines", rule: "prohibited" }, { key: "home", rule: "forbidden" }, { key: "craft", rule: "regulated" }, { key: "craft", rule: "prohibited" }],
    } as unknown as CommerceCategoryRules
    expect(commerceCategoryRulesProblems(rules)).toEqual(["clé hors taxonomie : health.medicines", "règle inconnue : forbidden", "clé en double : craft"])
  })

  it("refuse une descendante sans effet, sous un ancêtre interdit ou de même règle", () => {
    expect(commerceCategoryRulesProblems({ version: 2, decision: "essai", entries: [{ key: "food", rule: "prohibited" }, { key: "food.beverages", rule: "regulated" }] })).toEqual(["clé déjà couverte par food : food.beverages"])
    expect(commerceCategoryRulesProblems({ version: 2, decision: "essai", entries: [{ key: "fashion", rule: "regulated" }, { key: "fashion.women.shoes", rule: "regulated" }] })).toEqual(["clé déjà couverte par fashion : fashion.women.shoes"])
  })
})
