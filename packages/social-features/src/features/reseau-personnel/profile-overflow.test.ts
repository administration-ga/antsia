/** PF-01 — ce que propose le menu « … » de la fiche d'autrui. */
import { describe, expect, it } from "vitest"

import { createAppI18n } from "../../i18n"
import { profileOverflowEntriesFor } from "./profile-overflow"

const t = createAppI18n({ locale: "fr", appResources: { fr: {}, en: {} }, defaultNS: "reseau" }).getFixedT("fr")

describe("profileOverflowEntriesFor", () => {
  it("sourdine à bascule selon l'état lu, puis le blocage, grave et en dernier", () => {
    expect(profileOverflowEntriesFor({ handle: "awa", muted: false }, t).map((entry) => [entry.id, entry.grave])).toEqual([["mute", false], ["block", true]])
    expect(profileOverflowEntriesFor({ handle: "awa", muted: true }, t).map((entry) => [entry.id, entry.grave])).toEqual([["unmute", false], ["block", true]])
  })

  it("tant que l'état de la sourdine est inconnu, seule l'entrée du blocage s'offre", () => {
    expect(profileOverflowEntriesFor({ handle: "awa", muted: undefined }, t).map((entry) => entry.id)).toEqual(["block"])
  })

  it("nomme l'identifiant dans « Bloquer @… » et dit chaque conséquence", () => {
    const [mute, block] = profileOverflowEntriesFor({ handle: "awa", muted: false }, t)
    expect(block!.label).toBe("Bloquer @awa")
    expect(block!.hint).toContain("pas prévenue")
    expect(mute!.label).toBe("Mettre en sourdine")
    expect(mute!.hint.length).toBeGreaterThan(0)
  })
})
