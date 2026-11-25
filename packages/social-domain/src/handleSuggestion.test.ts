// Dupliqué de socle/convex/modules/reseauPersonnel/handleSuggestion.test.ts @ ad2e7fdc2 — adaptations : `assertHandle` importé de ./content (le domaine du socle est scindé) ; cas inchangés.
/**
 * Propositions d'identifiant public — le test qui tient deux règles de fond :
 * aucun ordre n'est privilégié, et rien ne sort qui ne passerait `assertHandle`.
 *
 * Environnement `node` (défaut du projet) : fonctions pures, aucun harnais.
 */
import { describe, expect, it } from "vitest"
import { assertHandle } from "./content"
import {
  handleLadder,
  handleNameComponents,
  handleToken,
  IDN_HANDLE_LADDER_MAX,
  idnHandleLadder,
  isCandidateHandle,
  pickFreeHandle,
  provisionalHandleBase,
} from "./handleSuggestion"

const NONE: ReadonlySet<string> = new Set()

describe("handleToken — translittérer, pas transformer", () => {
  it("retire les diacritiques et la casse", () => {
    expect(handleToken("NZÉ")).toBe("nze")
    expect(handleToken("Ondö")).toBe("ondo")
  })

  it("colle un prénom composé au trait d'union court", () => {
    expect(handleToken("Jean-Pierre")).toBe("jeanpierre")
  })

  it("ne laisse passer aucun caractère hors [a-z0-9]", () => {
    expect(handleToken("O'Brien Mba_2")).toBe("obrienmba2")
  })
})

describe("handleNameComponents — ce qui sépare et ce qui ne sépare pas", () => {
  it("sépare sur l'espace, pas sur le trait d'union court", () => {
    expect(handleNameComponents("Jean-Pierre Marie")).toEqual([
      "jeanpierre",
      "marie",
    ])
  })

  it("rend un tableau vide sur une entrée absente", () => {
    expect(handleNameComponents(null)).toEqual([])
    expect(handleNameComponents("   ")).toEqual([])
  })
})

describe("handleLadder — aucun ordre privilégié", () => {
  const lynda = { firstName: "Lynda", lastName: "Onanga" }

  it("propose les DEUX ordres, et le fait dès le premier palier", () => {
    const ladder = handleLadder(lynda)
    expect(ladder).toContain("lynda.onanga")
    expect(ladder).toContain("onanga.lynda")
    expect(ladder.slice(0, 2).sort()).toEqual(["lynda.onanga", "onanga.lynda"])
  })

  it("monte en discrimination quand l'état civil le permet", () => {
    const ladder = handleLadder({
      firstName: "Lynda Estelle",
      lastName: "Onanga Issambo",
    })
    expect(ladder).toContain("lynda.onanga")
    expect(ladder).toContain("lyndaestelle.onanga")
    expect(ladder).toContain("onangaissambo.lynda")
  })

  it("ne rend jamais deux fois le même candidat", () => {
    const ladder = handleLadder({ firstName: "Paul", lastName: "Ndong" })
    expect(new Set(ladder).size).toBe(ladder.length)
  })

  it("écarte les candidats hors bornes plutôt que de différer le refus", () => {
    // 3 caractères minimum : « Ba Li » donnerait `li.ba` (5) mais un mononyme
    // trop court doit disparaître de l'échelle.
    expect(handleLadder({ firstName: "A", lastName: "" })).toEqual([])
    // 30 caractères maximum.
    const long = handleLadder({
      firstName: "Marie Christine Bernadette",
      lastName: "Nzengue Moussavou Ondo",
    })
    for (const candidate of long) expect(candidate.length).toBeLessThanOrEqual(30)
  })

  it("replie un compte de rôle sur son organisme, sans inventer d'état civil", () => {
    const ladder = handleLadder({ name: "Agent — DGDI" })
    expect(ladder).toContain("dgdi.agent")
    expect(ladder).toContain("agent.dgdi")
  })

  it("rend vide quand rien n'est dérivable", () => {
    expect(handleLadder({})).toEqual([])
    expect(handleLadder({ firstName: null, lastName: null, name: null })).toEqual(
      [],
    )
  })

  it("TOUT candidat produit passe assertHandle", () => {
    const people = [
      { firstName: "Lynda", lastName: "Onanga" },
      { firstName: "Jean-Pierre", lastName: "Nzé Mba" },
      { firstName: "Marie Christine", lastName: "Ondo" },
      { name: "Agent — DGDI" },
      { firstName: "Aïcha", lastName: "Mboumba" },
    ]
    for (const person of people) {
      for (const candidate of handleLadder(person)) {
        expect(() => assertHandle(candidate)).not.toThrow()
      }
    }
  })
})

describe("provisionalHandleBase — nom.prenom, par cohérence souveraine", () => {
  it("suit l'ordre des identifiants IDN du dépôt", () => {
    expect(provisionalHandleBase({ firstName: "Lynda", lastName: "Onanga" })).toBe(
      "onanga.lynda",
    )
  })

  it("se replie sur l'échelle quand la forme nominale est irrecevable", () => {
    const base = provisionalHandleBase({ name: "Agent — DGDI" })
    expect(base).not.toBeNull()
    expect(() => assertHandle(base!)).not.toThrow()
  })

  it("rend null quand rien n'est dérivable", () => {
    expect(provisionalHandleBase({})).toBeNull()
  })
})

describe("pickFreeHandle — la collision se lève, elle ne bloque pas", () => {
  const paul = { firstName: "Paul", lastName: "Ndong" }

  it("pose la forme nominale d'abord, puis descend l'échelle", () => {
    expect(pickFreeHandle(paul, NONE)).toBe("ndong.paul")
    expect(pickFreeHandle(paul, new Set(["ndong.paul"]))).toBe("paul.ndong")
  })

  it("suffixe la forme NOMINALE quand toute l'échelle est prise", () => {
    const taken = new Set(handleLadder(paul))
    const picked = pickFreeHandle(paul, taken)
    expect(picked).toBe("ndong.paul2")
  })

  it("tronque sans jamais laisser un séparateur en bord", () => {
    const person = {
      firstName: "Bernadette Christine",
      lastName: "Nzengue Moussavou",
    }
    const taken = new Set([
      ...handleLadder(person),
      provisionalHandleBase(person)!,
    ])
    const picked = pickFreeHandle(person, taken)
    expect(picked).not.toBeNull()
    expect(picked!.length).toBeLessThanOrEqual(30)
    expect(picked).not.toMatch(/[._-]\d+$/)
    expect(() => assertHandle(picked!)).not.toThrow()
  })

  it("rend null quand rien n'est dérivable", () => {
    expect(pickFreeHandle({}, NONE)).toBeNull()
  })
})

describe("isCandidateHandle — le miroir exact d'assertHandle", () => {
  it("accepte ce qu'assertHandle accepte", () => {
    for (const ok of ["a_n-d.o1", "abc", "paul.ndong"]) {
      expect(isCandidateHandle(ok)).toBe(true)
      expect(() => assertHandle(ok)).not.toThrow()
    }
  })

  it("refuse ce qu'assertHandle refuse", () => {
    for (const ko of ["ab", "a".repeat(31), ".paul", "paul.", "Paul", "nzé"]) {
      expect(isCandidateHandle(ko)).toBe(false)
    }
  })
})

describe("idnHandleLadder — l'échelle de l'accueil, faite des seuls éléments d'IDN (ADR-0044)", () => {
  const awa = { givenNames: "Gaëlle Awa", familyName: "MOUSSAVOU-NZÉ", idnIdentifier: "moussavounze.awa" }

  it("ordre : le prénom qui figure dans l'identifiant IDN, l'identifiant entier, les autres prénoms, puis l'échelle", () => {
    expect(idnHandleLadder(awa)).toEqual([
      "awa",
      "moussavounze.awa",
      "gaelle",
      "gaelle.moussavounze",
      "moussavounze.gaelle",
      "gaelleawa.moussavounze",
    ])
  })

  it("six propositions au plus, sans doublon", () => {
    expect(IDN_HANDLE_LADDER_MAX).toBe(6)
    const ladder = idnHandleLadder({ givenNames: "Lynda Estelle Marie", familyName: "Onanga Issambo", idnIdentifier: "onanga.lynda" })
    expect(ladder.length).toBeLessThanOrEqual(6)
    expect(new Set(ladder).size).toBe(ladder.length)
    // L'identifiant IDN qui vaut une forme de l'échelle n'y paraît qu'une fois, à son rang d'identifiant.
    expect(ladder.slice(0, 2)).toEqual(["lynda", "onanga.lynda"])
  })

  it("le prénom se compare aux segments de l'identifiant, accents retirés, pas à une sous-chaîne", () => {
    expect(idnHandleLadder({ givenNames: "Éloïse Jean-Rémy", familyName: "Ndong Mba", idnIdentifier: "ndongmba.jeanremy" }).slice(0, 3)).toEqual(["jeanremy", "ndongmba.jeanremy", "eloise"])
    // « lou » est dans « mbalouise », mais n'en est pas un segment : l'identifiant passe devant.
    expect(idnHandleLadder({ givenNames: "Lou", familyName: "Mba", idnIdentifier: "mbalouise" })[0]).toBe("mbalouise")
  })

  it("sans identifiant IDN : les prénoms, puis l'échelle", () => {
    expect(idnHandleLadder({ givenNames: "Paul", familyName: "Ndong" })).toEqual(["paul", "paul.ndong", "ndong.paul"])
  })

  it("un identifiant hors forme est ignoré, sans être réécrit", () => {
    for (const idnIdentifier of ["Moussavou Nze", "nzé.paul", ".paul", "a".repeat(31), "ab", ""]) {
      const ladder = idnHandleLadder({ givenNames: "Paul", familyName: "Ndong", idnIdentifier })
      expect(ladder).toEqual(["paul", "paul.ndong", "ndong.paul"])
    }
    // Majuscules et espaces de bord : la forme canonique d'IDN est en minuscules.
    expect(idnHandleLadder({ givenNames: "Paul", idnIdentifier: "  Ndong.Paul " }).slice(0, 2)).toEqual(["paul", "ndong.paul"])
  })

  it("écarte les prénoms trop courts et rend vide quand rien n'est dérivable", () => {
    // « jo » et « li » seuls sont trop courts ; l'échelle existante garde leur forme collée.
    expect(idnHandleLadder({ givenNames: "Jo Li" })).toEqual(["joli"])
    expect(idnHandleLadder({})).toEqual([])
    expect(idnHandleLadder({ givenNames: null, familyName: null, idnIdentifier: null })).toEqual([])
  })

  it("TOUT candidat produit passe assertHandle", () => {
    const sources = [
      awa,
      { givenNames: "Aïcha Ngoné", familyName: "MBOUMBA", idnIdentifier: "mboumba.aicha" },
      { givenNames: "Marie Christine Bernadette", familyName: "Nzengue Moussavou Ondo", idnIdentifier: "nzengue-moussavou_ondo.mariechristine" },
      { familyName: "O'Brien", idnIdentifier: "obrien" },
    ]
    for (const source of sources) {
      const ladder = idnHandleLadder(source)
      expect(ladder.length).toBeLessThanOrEqual(6)
      for (const candidate of ladder) {
        expect(isCandidateHandle(candidate)).toBe(true)
        expect(() => assertHandle(candidate)).not.toThrow()
      }
    }
  })
})
