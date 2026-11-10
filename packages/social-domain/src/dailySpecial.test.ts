import { describe, expect, it } from "vitest"

import { dailySpecialExpiresAt, librevilleDay, todaysSpecialRef } from "./dailySpecial"

describe("plat du jour", () => {
  it("compte le jour à l'heure de Libreville (UTC+1, sans heure d'été)", () => {
    expect(librevilleDay(Date.UTC(2026, 9, 23, 22, 59))).toBe("2026-10-23")
    expect(librevilleDay(Date.UTC(2026, 9, 23, 23, 0))).toBe("2026-10-24")
    expect(librevilleDay(Date.UTC(2026, 6, 1, 22, 30))).toBe("2026-07-01")
  })

  it("n'annonce que le plat désigné aujourd'hui", () => {
    const special = { offerRef: "offer:menu:1", day: "2026-10-23" }
    expect(todaysSpecialRef(special, Date.UTC(2026, 9, 23, 6))).toBe("offer:menu:1")
    expect(todaysSpecialRef(special, Date.UTC(2026, 9, 23, 23, 30))).toBeNull()
    expect(todaysSpecialRef(special, Date.UTC(2026, 9, 22, 22, 59))).toBeNull()
    expect(todaysSpecialRef(null, Date.UTC(2026, 9, 23, 6))).toBeNull()
    expect(todaysSpecialRef(undefined, Date.UTC(2026, 9, 23, 6))).toBeNull()
  })

  it("expire à minuit de Libreville, indépendamment de l'heure d'été du navigateur", () => {
    for (const [day, expiry] of [
      ["2026-10-23", Date.UTC(2026, 9, 23, 23)],
      ["2026-07-01", Date.UTC(2026, 6, 1, 23)],
      ["2026-12-31", Date.UTC(2026, 11, 31, 23)],
      ["2028-02-29", Date.UTC(2028, 1, 29, 23)],
    ] as const) {
      expect(dailySpecialExpiresAt(day)).toBe(expiry)
      expect(todaysSpecialRef({ day, offerRef: "dish" }, expiry - 1)).toBe("dish")
      expect(todaysSpecialRef({ day, offerRef: "dish" }, expiry)).toBeNull()
    }
  })

  it("ne programme pas d'expiration pour une date absente ou mal formée", () => {
    for (const day of [null, undefined, "", "2026-02-29", "2026-13-01", "2026-10-23T00:00:00Z", "23/10/2026"]) {
      expect(dailySpecialExpiresAt(day)).toBeNull()
    }
  })
})
