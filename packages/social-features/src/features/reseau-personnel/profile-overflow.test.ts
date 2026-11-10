/** PF-01 — ce que propose le menu « … » de la fiche d'autrui. */
import { describe, expect, it } from "vitest"

import { createAppI18n } from "../../i18n"
import { profileOverflowEntriesFor } from "./profile-overflow"

const t = createAppI18n({ locale: "fr", appResources: { fr: {}, en: {} }, defaultNS: "reseau" }).getFixedT("fr")

describe("profileOverflowEntriesFor", () => {
  it("sourdine à bascule selon l'état lu, puis le blocage, puis le signalement, graves et en dernier (MC-01)", () => {
    expect(profileOverflowEntriesFor({ handle: "awa", muted: false }, t).map((entry) => [entry.id, entry.grave])).toEqual([["mute", false], ["block", true], ["report", true]])
    expect(profileOverflowEntriesFor({ handle: "awa", muted: true }, t).map((entry) => [entry.id, entry.grave])).toEqual([["unmute", false], ["block", true], ["report", true]])
  })

  it("tant que l'état de la sourdine est inconnu, seuls le blocage et le signalement s'offrent", () => {
    expect(profileOverflowEntriesFor({ handle: "awa", muted: undefined }, t).map((entry) => entry.id)).toEqual(["block", "report"])
  })

  it("dit ce que fait le signalement du profil, sans promettre une sanction", () => {
    const report = profileOverflowEntriesFor({ handle: "awa", muted: false }, t).at(-1)
    expect(report?.label).toBe("Signaler le profil")
    expect(report?.hint).toContain("accusé de réception")
  })

  it("nomme l'identifiant dans « Bloquer @… » et dit chaque conséquence", () => {
    const [mute, block] = profileOverflowEntriesFor({ handle: "awa", muted: false }, t)
    expect(block!.label).toBe("Bloquer @awa")
    expect(block!.hint).toContain("pas prévenue")
    expect(mute!.label).toBe("Mettre en sourdine")
    expect(mute!.hint.length).toBeGreaterThan(0)
  })
})
