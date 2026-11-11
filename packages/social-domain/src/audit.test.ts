import { describe, expect, it } from "vitest"

import { assertDecisionReason, AUDIT_ACTIONS, AUDIT_DETAIL_STRING_MAX, AUDIT_SUBJECT_TABLES, auditDetailsProblems, DECISION_REASON_MAX, isSystemCapacity } from "./audit"
import { DomainViolation } from "./violation"

describe("journal des décisions — détail et motif", () => {
  it("un détail plat et borné est conforme ; une clé, une longueur ou un nombre hors règle ne l'est pas", () => {
    expect(auditDetailsProblems({ reason: "Faux positif", from: "suspicious", attempts: 2, urgent: false, until: null })).toEqual([])
    expect(auditDetailsProblems({ "raison libre": "x" })).toHaveLength(1)
    expect(auditDetailsProblems({ reason: "x".repeat(AUDIT_DETAIL_STRING_MAX + 1) })).toHaveLength(1)
    expect(auditDetailsProblems({ ratio: Number.NaN })).toHaveLength(1)
    const many = Object.fromEntries(Array.from({ length: 13 }, (_, i) => [`k${i}`, i]))
    expect(auditDetailsProblems(many)).toHaveLength(1)
  })

  it("le motif est nettoyé et borné : seuil bas propre à la décision, seuil haut commun", () => {
    expect(assertDecisionReason("  Signalements répétés.  ", 10)).toBe("Signalements répétés.")
    for (const reason of ["court", " ".repeat(20), "x".repeat(DECISION_REASON_MAX + 1)]) {
      let caught: unknown = null
      try {
        assertDecisionReason(reason, 10)
      } catch (error) {
        caught = error
      }
      expect(caught).toBeInstanceOf(DomainViolation)
      expect(caught).toMatchObject({ code: "DECISION_REASON_LENGTH", params: { min: 10, max: DECISION_REASON_MAX } })
    }
  })

  it("tranche diaspora : l'admission fondatrice et son retrait sont des actions du journal, sur la personne, au détail plat", () => {
    expect(AUDIT_ACTIONS).toEqual(expect.arrayContaining(["diaspora.founder_admit", "diaspora.founder_withdraw"]))
    expect(AUDIT_SUBJECT_TABLES).toContain("persons")
    // Le détail que la tranche écrit : le motif nettoyé, et la dispense d'ancienneté ou la cause du retrait.
    const reason = assertDecisionReason("  Animatrice reconnue de la communauté locale.  ", 10)
    expect(auditDetailsProblems({ reason, seniorityWaiver: true })).toEqual([])
    expect(auditDetailsProblems({ reason: "x".repeat(DECISION_REASON_MAX), cause: "operator" })).toEqual([])
  })

  it("seul le système agit sans acteur", () => {
    expect(isSystemCapacity("system")).toBe(true)
    expect(isSystemCapacity("network_moderator")).toBe(false)
    // AS-01 : le membre d'une équipe de modération agit en personne, jamais sans acteur.
    expect(isSystemCapacity("moderation_team_member")).toBe(false)
  })
})
