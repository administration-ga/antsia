import { describe, expect, it } from "vitest"

import {
  CONTENT_REPORT_REASONS,
  isKnownReportReason,
  isReportReasonAllowedFor,
  reportDecisionDueAt,
  reportLegalBasis,
  reportReasonsFor,
  TARGET_REPORT_REASONS,
} from "./moderation"

const JOB_REASONS = ["job_fee_requested", "job_impersonation"]

describe("UM-03 — motifs propres à une nature d'objet", () => {
  it("le poste reçoit ses deux motifs en tête, puis ceux de tout objet, « autre » en dernier", () => {
    const reasons = reportReasonsFor("commerceJob")
    expect(reasons.slice(0, 2)).toEqual(JOB_REASONS)
    expect(reasons.slice(2)).toEqual([...CONTENT_REPORT_REASONS])
    expect(reasons.at(-1)).toBe("other")
    expect(new Set(reasons).size).toBe(reasons.length)
  })

  it("aucune autre nature ne propose un motif d'emploi, et la liste de tout objet n'en contient aucun", () => {
    for (const kind of ["commerceOffer", "commerceStorefront", "page", "person", "post", "publication", "commentaire", "live", "story", "diasporaJobOffer"]) {
      expect(reportReasonsFor(kind)).toEqual([...CONTENT_REPORT_REASONS])
    }
    for (const reason of JOB_REASONS) expect(CONTENT_REPORT_REASONS as readonly string[]).not.toContain(reason)
    // Un nom hérité d'Object ne passe jamais pour une nature du registre.
    expect(reportReasonsFor("toString")).toEqual([...CONTENT_REPORT_REASONS])
  })

  it("le moteur n'admet un motif d'emploi que pour un poste ; tout autre code bien formé reste admis", () => {
    for (const reason of JOB_REASONS) {
      expect(isReportReasonAllowedFor(reason, "commerceJob")).toBe(true)
      for (const kind of ["commerceOffer", "commerceStorefront", "post", "page", "serviceReview"]) expect(isReportReasonAllowedFor(reason, kind)).toBe(false)
    }
    for (const reason of [...CONTENT_REPORT_REASONS, "spam", "fraud", "misleading_offer"]) {
      expect(isReportReasonAllowedFor(reason, "commerceJob")).toBe(true)
      expect(isReportReasonAllowedFor(reason, "post")).toBe(true)
    }
  })

  it("les deux motifs sont nommés par le registre, sans délai réglementé (l'art. 24 ne vise pas une fausse offre)", () => {
    for (const reason of JOB_REASONS) {
      expect(isKnownReportReason(reason)).toBe(true)
      expect(reason).toMatch(/^[a-z][a-z0-9_]{2,79}$/)
      expect(reportLegalBasis(reason)).toBeNull()
      expect(reportDecisionDueAt(reason, 1_000)).toBeNull()
    }
    for (const reason of CONTENT_REPORT_REASONS) expect(isKnownReportReason(reason)).toBe(true)
    expect(isKnownReportReason("misleading_offer")).toBe(false)
    expect(Object.isFrozen(TARGET_REPORT_REASONS)).toBe(true)
    expect(Object.isFrozen(TARGET_REPORT_REASONS.commerceJob)).toBe(true)
  })
})
