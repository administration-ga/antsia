/**
 * EA-01 — données personnelles d'une admission fondatrice : la ligne est classée
 * (elle s'efface avec la personne admise) et son export ne livre que la décision
 * et son retrait, jamais l'identifiant de l'opérateur, et rien à une autre personne.
 */
import { describe, expect, it } from "vitest"

import { anonymizeReferences, directlyOwned, exportableRecord, shapeFor, unclassifiedDataTables, type DataRecord } from "../people/dataInventory"
import { DATA_TABLE_POLICIES } from "../people/dataPolicies"

const admission: DataRecord = {
  _id: "admission-1",
  _creationTime: 1,
  networkId: "network-diasporale",
  personId: "person-admise",
  reason: "Responsable d'une association de la diaspora",
  seniorityWaiver: true,
  admittedAt: 10,
  admittedByPersonId: "person-operateur-1",
  withdrawnAt: 20,
  withdrawnBy: "operator",
  withdrawnByPersonId: "person-operateur-2",
  withdrawalReason: "Décision prise par erreur",
}

describe("EA-01 — classement et export d'une admission fondatrice", () => {
  it("la table est classée : elle appartient à la personne admise, et à elle seule", () => {
    expect(DATA_TABLE_POLICIES.foundingAdmissions).toEqual({ owners: ["personId"] })
    expect(unclassifiedDataTables()).not.toContain("foundingAdmissions")
  })

  it("l'export rend la décision et son retrait, sans aucun identifiant d'opérateur", () => {
    expect(exportableRecord("foundingAdmissions", admission, "person-admise")).toEqual({
      _id: "admission-1",
      _creationTime: 1,
      networkId: "network-diasporale",
      personId: "person-admise",
      reason: "Responsable d'une association de la diaspora",
      seniorityWaiver: true,
      admittedAt: 10,
      withdrawnAt: 20,
      withdrawnBy: "operator",
      withdrawalReason: "Décision prise par erreur",
    })
  })

  it("l'effacement d'un opérateur laisse la ligne à la personne admise et retire la référence à cet opérateur", () => {
    // La ligne n'appartient qu'à la personne admise : effacer l'opérateur ne la supprime pas.
    expect(directlyOwned("foundingAdmissions", admission, "person-admise")).toBe(true)
    expect(directlyOwned("foundingAdmissions", admission, "person-operateur-1")).toBe(false)
    expect(directlyOwned("foundingAdmissions", admission, "person-operateur-2")).toBe(false)
    // Le mécanisme générique, dérivé du schéma, retire la seule référence à l'opérateur effacé.
    const kept = anonymizeReferences(admission, shapeFor("foundingAdmissions"), "person-operateur-1", "person-anonyme") as Record<string, unknown>
    expect(kept).not.toHaveProperty("admittedByPersonId")
    expect(kept.personId).toBe("person-admise")
    expect(kept.withdrawnByPersonId).toBe("person-operateur-2")
    expect(kept.reason).toBe(admission.reason)
    expect(kept.withdrawalReason).toBe(admission.withdrawalReason)
  })

  it("ni l'opérateur ni une autre personne ne reçoivent la ligne", () => {
    expect(exportableRecord("foundingAdmissions", admission, "person-operateur-1")).toBeNull()
    expect(exportableRecord("foundingAdmissions", admission, "person-operateur-2")).toBeNull()
    expect(exportableRecord("foundingAdmissions", admission, "person-autre")).toBeNull()
  })
})
