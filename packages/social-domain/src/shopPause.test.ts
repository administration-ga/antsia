import { describe, expect, it } from "vitest"

import { checkShopPauseDay, isShopPaused, SHOP_PAUSE_MAX_DAYS, shopPauseDayBounds, shopPauseReopenDay, shopPauseReopensAt } from "./shopPause"

// 10 novembre 2026, 12 h à Libreville (11 h UTC).
const NOW = Date.UTC(2026, 10, 10, 11)

describe("CM-10 — la boutique en pause se lit, sans écriture à l'échéance", () => {
  it("est en pause tant que l'échéance est dans le futur, et rouvre seule ensuite", () => {
    expect(isShopPaused(NOW + 1, NOW)).toBe(true)
    expect(isShopPaused(NOW, NOW)).toBe(false)
    expect(isShopPaused(NOW - 1, NOW)).toBe(false)
    expect(isShopPaused(undefined, NOW)).toBe(false)
    expect(isShopPaused(null, NOW)).toBe(false)
    expect(isShopPaused(Number.NaN, NOW)).toBe(false)
    expect(isShopPaused(Number.POSITIVE_INFINITY, NOW)).toBe(false)
  })

  it("rouvre à minuit heure de Libreville (UTC+1, sans heure d'été) au début du jour choisi", () => {
    expect(shopPauseReopensAt("2026-11-15")).toBe(Date.UTC(2026, 10, 14, 23))
    expect(shopPauseReopensAt("2026-07-01")).toBe(Date.UTC(2026, 5, 30, 23))
    expect(shopPauseReopenDay(Date.UTC(2026, 10, 14, 23))).toBe("2026-11-15")
  })

  it("refuse un jour mal formé ou inexistant", () => {
    for (const day of ["", "2026-11-31", "2026-02-30", "15/11/2026", "2026-11-5", "2026-11-15T00:00", " 2026-11-15"]) {
      expect(shopPauseReopensAt(day), day).toBeNull()
      expect(checkShopPauseDay(day, NOW), day).toEqual({ ok: false, reason: "invalid" })
    }
  })

  it("admet de demain au plafond, et dit pourquoi elle refuse le reste", () => {
    expect(shopPauseDayBounds(NOW)).toEqual({ min: "2026-11-11", max: "2027-02-08" })
    expect(SHOP_PAUSE_MAX_DAYS).toBe(90)
    expect(checkShopPauseDay("2026-11-10", NOW)).toEqual({ ok: false, reason: "past" })
    expect(checkShopPauseDay("2026-11-09", NOW)).toEqual({ ok: false, reason: "past" })
    expect(checkShopPauseDay("2026-11-11", NOW)).toEqual({ ok: true, pausedUntil: Date.UTC(2026, 10, 10, 23) })
    expect(checkShopPauseDay("2027-02-08", NOW)).toEqual({ ok: true, pausedUntil: Date.UTC(2027, 1, 7, 23) })
    expect(checkShopPauseDay("2027-02-09", NOW)).toEqual({ ok: false, reason: "too_long" })
  })

  it("compte les jours à Libreville : à 23 h 30 à Libreville, « demain » est déjà le jour suivant", () => {
    // 22 h 30 UTC = 23 h 30 à Libreville, le 10 ; 23 h 30 UTC = 0 h 30 à Libreville, le 11.
    expect(shopPauseDayBounds(Date.UTC(2026, 10, 10, 22, 30)).min).toBe("2026-11-11")
    expect(shopPauseDayBounds(Date.UTC(2026, 10, 10, 23, 30)).min).toBe("2026-11-12")
    expect(checkShopPauseDay("2026-11-11", Date.UTC(2026, 10, 10, 23, 30))).toEqual({ ok: false, reason: "past" })
  })
})
