import { describe, expect, it } from "vitest"

import { contentNeedsReview, isSanctionLive, LEGAL_DEADLINE_STATUSES, legalDeadlineDisclosure, legalDeadlineStatus, normalizeBlockedTerm, TRANSPARENCY_MIN_CASES, validSanctionDuration } from "./moderationPolicy"

describe("modération PA5 — règles pures", () => {
  it("normalise sans accents et sans ambiguïté de casse", () => {
    expect(normalizeBlockedTerm("  MENÁCE   Répétée ")).toBe("menace repetee")
  })
  it("borne toutes les sanctions temporaires et réserve l'infini à l'exclusion", () => {
    for (const kind of ["mute", "suspension"] as const) {
      expect(validSanctionDuration(kind, undefined, 10)).toBe(false)
      expect(validSanctionDuration(kind, 9, 10)).toBe(false)
      expect(validSanctionDuration(kind, 100, 10)).toBe(true)
      expect(validSanctionDuration(kind, Infinity, 10)).toBe(false)
    }
    expect(validSanctionDuration("exclusion", undefined, 10)).toBe(true)
    expect(validSanctionDuration("exclusion", 100, 10)).toBe(false)
    expect(validSanctionDuration("warning", undefined, 10)).toBe(true)
    expect(validSanctionDuration("removal", undefined, 10)).toBe(true)
  })
  it("une échéance est interprétée même avant le cron", () => {
    expect(isSanctionLive({ status: "active", until: 20 }, 20)).toBe(false)
    expect(isSanctionLive({ status: "revoked" }, 10)).toBe(false)
    expect(isSanctionLive({ status: "active" }, 10)).toBe(true)
  })
  it("la relecture cumule politique, terme, liens et fréquence", () => {
    const base = { text: "Bonjour", preReview: false, blockedTerms: [], maxLinks: 2, recentWrites: 0, maxWrites: 10 }
    expect(contentNeedsReview(base)).toBe(false)
    expect(contentNeedsReview({ ...base, preReview: true })).toBe(true)
    expect(contentNeedsReview({ ...base, text: "MENÁCE", blockedTerms: ["menace"] })).toBe(true)
    expect(contentNeedsReview({ ...base, text: "www.a www.b www.c" })).toBe(true)
    expect(contentNeedsReview({ ...base, recentWrites: 10 })).toBe(true)
  })
})

describe("SU01d — échéances légales publiées sur /transparence", () => {
  const closed = { periodEnd: 1_000, generatedAt: 2_000 }

  it("publie une période close d'au moins cinq échéances sur cinq auteurs, chaque nombre sous le seuil dit « moins de »", () => {
    expect(TRANSPARENCY_MIN_CASES).toBe(5)
    expect(legalDeadlineDisclosure({ ...closed, legalMet: 12, legalMissed: 0, legalAuthors: 5 })).toEqual({ met: 12, missed: null })
    expect(legalDeadlineDisclosure({ ...closed, legalMet: 7, legalMissed: 6, legalAuthors: 5 })).toEqual({ met: 7, missed: 6 })
    expect(legalDeadlineDisclosure({ ...closed, legalMet: 3, legalMissed: 3, legalAuthors: 5 })).toEqual({ met: null, missed: null })
  })

  it("ne publie rien d'une petite cohorte, d'une cohorte d'un ou deux auteurs, ni d'une période calculée avant sa fin", () => {
    expect(legalDeadlineDisclosure({ ...closed, legalMet: 2, legalMissed: 2, legalAuthors: 5 })).toBeNull()
    expect(legalDeadlineDisclosure({ ...closed, legalMet: 40, legalMissed: 0, legalAuthors: 4 })).toBeNull()
    // Calculée avant la fin de la période, une échéance pouvait encore venir : rien ne se publie.
    expect(legalDeadlineDisclosure({ periodEnd: 2_000, generatedAt: 1_999, legalMet: 40, legalMissed: 0, legalAuthors: 5 })).toBeNull()
  })

  it("une période mesurée avant SU01d n'a pas d'échéances à publier", () => {
    expect(legalDeadlineDisclosure(closed)).toBeNull()
    expect(legalDeadlineDisclosure({ ...closed, legalMet: 9, legalMissed: 0 })).toBeNull()
  })
})

describe("SU01d — état des échéances légales dans l'export de la console", () => {
  const closed = { periodEnd: 1_000, generatedAt: 2_000 }

  it("publiée exactement quand /transparence publie, nombres sous le seuil compris", () => {
    expect(LEGAL_DEADLINE_STATUSES).toEqual(["unmeasured", "suppressed", "disclosed"])
    expect(legalDeadlineStatus({ ...closed, legalMet: 12, legalMissed: 0, legalAuthors: 5 })).toBe("disclosed")
    expect(legalDeadlineStatus({ ...closed, legalMet: 3, legalMissed: 3, legalAuthors: 5 })).toBe("disclosed")
  })

  it("masquée pour une petite cohorte ou trop peu d'auteurs, sans dire laquelle", () => {
    expect(legalDeadlineStatus({ ...closed, legalMet: 2, legalMissed: 2, legalAuthors: 5 })).toBe("suppressed")
    expect(legalDeadlineStatus({ ...closed, legalMet: 0, legalMissed: 0, legalAuthors: 0 })).toBe("suppressed")
    expect(legalDeadlineStatus({ ...closed, legalMet: 40, legalMissed: 0, legalAuthors: 4 })).toBe("suppressed")
  })

  it("non mesurée avant le second passage, avant SU01d ou calculée avant la fin de la période", () => {
    expect(legalDeadlineStatus(closed)).toBe("unmeasured")
    expect(legalDeadlineStatus({ ...closed, legalMet: 9, legalMissed: 0 })).toBe("unmeasured")
    expect(legalDeadlineStatus({ periodEnd: 2_000, generatedAt: 1_999, legalMet: 40, legalMissed: 0, legalAuthors: 5 })).toBe("unmeasured")
  })
})
