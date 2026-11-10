import { describe, expect, it } from "vitest"

import {
  canDecideReport,
  CONTENT_REPORT_REASONS,
  isTerminalReportStatus,
  REPORT_ACKNOWLEDGEMENT_DELAY_MS,
  REPORT_DECISION_DELAY_MS,
  REPORT_DEADLINES_ORDINANCE,
  reportDeadlineOutcome,
  reportDecisionDelayHours,
  reportDecisionDueAt,
  reportLegalBasis,
  reportOutcome,
} from "./moderation"

const HOUR = 3_600_000

describe("SU01d — motifs et délais de l'ordonnance n° 0011/PR/2026", () => {
  it("garde les six motifs historiques et ajoute les six motifs du texte, « autre » en dernier", () => {
    for (const reason of ["harassment", "hate", "violence", "sexual_content", "misinformation", "other"]) expect(CONTENT_REPORT_REASONS).toContain(reason)
    for (const reason of ["minor_harm", "deepfake_of_me", "prohibited_ai_content", "institution_impersonation", "impersonation", "privacy_or_honor"]) expect(CONTENT_REPORT_REASONS).toContain(reason)
    expect(CONTENT_REPORT_REASONS).toHaveLength(12)
    expect(new Set(CONTENT_REPORT_REASONS).size).toBe(12)
    expect(CONTENT_REPORT_REASONS.at(-1)).toBe("other")
    // Le serveur admet tout code bien formé : chaque nouveau motif passe la même forme.
    for (const reason of CONTENT_REPORT_REASONS) expect(reason).toMatch(/^[a-z][a-z0-9_]{2,79}$/)
  })

  it("rattache chaque motif à son article : 72 h (art. 24), 24 h (art. 32 et 33), sinon aucun délai légal", () => {
    expect(reportLegalBasis("harassment")).toBe("art24")
    expect(reportLegalBasis("minor_harm")).toBe("art24")
    expect(reportLegalBasis("deepfake_of_me")).toBe("art33")
    expect(reportLegalBasis("prohibited_ai_content")).toBe("art32")
    expect(reportLegalBasis("institution_impersonation")).toBe("art32")
    for (const reason of ["hate", "violence", "sexual_content", "impersonation", "privacy_or_honor", "misinformation", "other", "pre_review", "spam"]) expect(reportLegalBasis(reason), reason).toBeNull()
    expect(REPORT_DECISION_DELAY_MS).toEqual({ art24: 72 * HOUR, art32: 24 * HOUR, art33: 24 * HOUR })
    expect(REPORT_ACKNOWLEDGEMENT_DELAY_MS).toBe(24 * HOUR)
  })

  it("calcule l'échéance depuis la transmission, jamais pour un motif sans délai légal", () => {
    const at = Date.UTC(2026, 9, 21, 20, 0)
    expect(reportDecisionDueAt("harassment", at)).toBe(at + 72 * HOUR)
    expect(reportDecisionDueAt("deepfake_of_me", at)).toBe(at + 24 * HOUR)
    expect(reportDecisionDueAt("misinformation", at)).toBeNull()
  })

  it("dit au déclarant l'effet sur le contenu, jamais la sanction", () => {
    expect(reportOutcome("open", undefined)).toBe("pending")
    expect(reportOutcome("reviewing", undefined)).toBe("pending")
    expect(reportOutcome("dismissed", undefined)).toBe("dismissed")
    expect(reportOutcome("actioned", true)).toBe("removed")
    // Avertissement ou mise en sourdine : une mesure, le contenu reste.
    expect(reportOutcome("actioned", false)).toBe("actioned")
    expect(reportOutcome("actioned", undefined)).toBe("actioned")
  })
})

describe("SU01d — issue d'une échéance légale (indicateurs de /transparence)", () => {
  const dueAt = Date.UTC(2026, 9, 24, 20, 0)

  it("tenue : tranchée à l'échéance ou avant, classement comme suite donnée", () => {
    expect(reportDeadlineOutcome({ status: "actioned", dueAt, decidedAt: dueAt - HOUR }, dueAt + HOUR)).toBe("met")
    expect(reportDeadlineOutcome({ status: "dismissed", dueAt, decidedAt: dueAt }, dueAt + HOUR)).toBe("met")
    // Tenue même si l'échéance n'est pas encore passée : la décision est acquise.
    expect(reportDeadlineOutcome({ status: "actioned", dueAt, decidedAt: dueAt - 2 * HOUR }, dueAt - HOUR)).toBe("met")
  })

  it("manquée : tranchée après l'échéance, ou encore ouverte ou en examen une fois l'échéance passée", () => {
    expect(reportDeadlineOutcome({ status: "actioned", dueAt, decidedAt: dueAt + 1 }, dueAt + HOUR)).toBe("missed")
    expect(reportDeadlineOutcome({ status: "open", dueAt, decidedAt: null }, dueAt)).toBe("missed")
    // Une mise en examen n'est pas une décision.
    expect(reportDeadlineOutcome({ status: "reviewing", dueAt, decidedAt: dueAt - HOUR }, dueAt + HOUR)).toBe("missed")
  })

  it("à venir : ni tranchée ni échue", () => {
    expect(reportDeadlineOutcome({ status: "open", dueAt, decidedAt: null }, dueAt - 1)).toBe("pending")
    expect(reportDeadlineOutcome({ status: "reviewing", dueAt, decidedAt: dueAt - HOUR }, dueAt - 1)).toBe("pending")
  })

  it("dit les délais en heures et le texte qui les fixe, lus depuis la règle", () => {
    expect(reportDecisionDelayHours("art24")).toBe(72)
    expect(reportDecisionDelayHours("art32")).toBe(24)
    expect(reportDecisionDelayHours("art33")).toBe(24)
    expect(REPORT_DEADLINES_ORDINANCE).toBe("0011/PR/2026")
  })
})

describe("dossiers de signalement — transitions", () => {
  it("un dossier ouvert passe en examen, se classe ou se suit d'effet ; un dossier en examen ne repasse pas en examen", () => {
    expect(canDecideReport("open", "reviewing")).toBe(true)
    expect(canDecideReport("open", "dismissed")).toBe(true)
    expect(canDecideReport("reviewing", "actioned")).toBe(true)
    expect(canDecideReport("reviewing", "reviewing")).toBe(false)
  })

  it("une décision terminale ne se refait pas", () => {
    for (const from of ["dismissed", "actioned"] as const) {
      expect(isTerminalReportStatus(from)).toBe(true)
      for (const to of ["reviewing", "dismissed", "actioned"] as const) expect(canDecideReport(from, to)).toBe(false)
    }
  })
})
