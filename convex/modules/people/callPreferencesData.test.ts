/**
 * IC-04 — les réglages iCom (`callPreferences`, dont les champs neufs `readReceipts` et le choix
 * « qui peut m'appeler ») sont exportés à la personne seule et effacés avec elle : la table est
 * déjà inventoriée ligne entière (`DATA_TABLE_POLICIES`, `EXPORT_PERSON_FIELDS`), aucun champ neuf
 * n'échappe ni à l'export ni à l'effacement.
 */
import { describe, expect, it } from "vitest"

import { directlyOwned, exportableRecord } from "./dataInventory"

const row = { _id: "prefs", _creationTime: 1, personId: "me", outsideRelationsCalls: "ring", readReceipts: false, callWaiting: false, updatedAt: 2 }

describe("IC-04 — réglages iCom dans l'export et l'effacement", () => {
  it("l'export de la personne contient ses réglages iCom, champs neufs compris ; jamais celui d'une autre", () => {
    expect(exportableRecord("callPreferences", row, "me")).toMatchObject({ outsideRelationsCalls: "ring", readReceipts: false, callWaiting: false })
    expect(exportableRecord("callPreferences", row, "other")).toBe(null)
  })

  it("la ligne entière appartient à la personne : l'effacement l'emporte avec ses champs neufs", () => {
    expect(directlyOwned("callPreferences", row, "me")).toBe(true)
    expect(directlyOwned("callPreferences", row, "other")).toBe(false)
  })
})
