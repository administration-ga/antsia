import { describe, expect, it } from "vitest"

import { LEGAL_DUE_SOON_MS, summarizeLegalDeadlines } from "./console-legal-deadlines"

const HOUR = 3_600_000
const now = 1_000 * HOUR

describe("SU01d — comptes de l'alerte des délais légaux", () => {
  it("compte retards, échéances des 24 h et dossiers en cours à l'heure de l'écran", () => {
    const summary = summarizeLegalDeadlines({ horizon: null, deadlines: [
      { dueAt: now - 5 * HOUR, basis: "art24" },
      { dueAt: now - HOUR, basis: "art33" },
      { dueAt: now, basis: "art24" },
      { dueAt: now + HOUR, basis: "art32" },
      { dueAt: now + LEGAL_DUE_SOON_MS, basis: "art24" },
      { dueAt: now + LEGAL_DUE_SOON_MS + 1, basis: "art24" },
    ] }, now)
    expect(summary).toEqual({ overdue: 3, overdueExact: true, dueSoon: 2, dueSoonExact: true, open: 6, openExact: true, oldestOverdueAt: now - 5 * HOUR, overdueByBasis: { art24: 2, art32: 0, art33: 1 } })
  })

  it("une échéance atteinte est en retard, comme reportDeadlineOutcome : l'horloge seule la fait basculer", () => {
    const dto = { horizon: null, deadlines: [{ dueAt: now + 60_000, basis: "art33" as const }] }
    expect(summarizeLegalDeadlines(dto, now)).toMatchObject({ overdue: 0, dueSoon: 1, oldestOverdueAt: null })
    expect(summarizeLegalDeadlines(dto, now + 60_000)).toMatchObject({ overdue: 1, dueSoon: 0, oldestOverdueAt: now + 60_000, overdueByBasis: { art24: 0, art32: 0, art33: 1 } })
  })

  it("une lecture bornée dit « au moins » pour chaque fenêtre qui atteint l'horizon", () => {
    const deadlines = [{ dueAt: now - 2 * HOUR, basis: "art24" as const }, { dueAt: now + 2 * HOUR, basis: "art24" as const }]
    // Horizon dans les 24 h : les retards restent exacts, pas les échéances proches ni le total.
    expect(summarizeLegalDeadlines({ horizon: now + 3 * HOUR, deadlines }, now)).toMatchObject({ overdue: 1, overdueExact: true, dueSoon: 1, dueSoonExact: false, open: 2, openExact: false })
    // Horizon déjà atteint : une échéance hors lecture peut être en retard.
    expect(summarizeLegalDeadlines({ horizon: now, deadlines }, now)).toMatchObject({ overdueExact: false, dueSoonExact: false, openExact: false })
    // Horizon au-delà des 24 h : seul le total est un minimum.
    expect(summarizeLegalDeadlines({ horizon: now + 48 * HOUR, deadlines }, now)).toMatchObject({ overdueExact: true, dueSoonExact: true, openExact: false })
  })

  it("rien en cours : aucun retard, aucune plus ancienne échéance", () => {
    expect(summarizeLegalDeadlines({ horizon: null, deadlines: [] }, now)).toEqual({ overdue: 0, overdueExact: true, dueSoon: 0, dueSoonExact: true, open: 0, openExact: true, oldestOverdueAt: null, overdueByBasis: { art24: 0, art32: 0, art33: 0 } })
  })
})
