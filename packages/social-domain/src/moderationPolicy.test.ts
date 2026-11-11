import { describe, expect, it } from "vitest"

import { admissibleBlockedTerm, BLOCKED_TERMS_ACTIVE_MAX, contentNeedsReview, effectiveModerationPolicy, isReportOnlySurface, isSanctionLive, LEGAL_DEADLINE_STATUSES, legalDeadlineDisclosure, legalDeadlineStatus, MODERATION_POLICY_BOUNDS, MODERATION_POLICY_DEFAULTS, MODERATION_POLICY_SURFACES, MODERATION_SCAN_LIMIT, MODERATION_SURFACES, moderationPolicyProblem, normalizeBlockedTerm, REPORT_ONLY_SURFACES, TRANSPARENCY_MIN_CASES, validSanctionDuration } from "./moderationPolicy"

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

describe("MC-02 — défauts prudents d'un réseau sans réglage", () => {
  // La règle du moteur sans réglage : le texte, les mots du réseau, et les défauts (décision 3 du plan 12).
  const review = (text: string, recentWrites = 0, blockedTerms: readonly string[] = []) => {
    const rule = effectiveModerationPolicy(null)
    return contentNeedsReview({ text, blockedTerms, recentWrites, ...rule })
  }

  it("les défauts sont plus prudents que les anciens (20 liens, 100 écritures par minute) et restent dans les bornes admises", () => {
    expect(MODERATION_POLICY_DEFAULTS).toEqual({ preReview: false, maxLinks: 2, maxWrites: 30, windowMs: 60_000 })
    expect(MODERATION_POLICY_DEFAULTS.maxLinks).toBeLessThan(20)
    expect(MODERATION_POLICY_DEFAULTS.maxWrites / MODERATION_POLICY_DEFAULTS.windowMs).toBeLessThan(100 / 60_000)
    expect(moderationPolicyProblem(MODERATION_POLICY_DEFAULTS)).toBeNull()
    expect(Object.isFrozen(MODERATION_POLICY_DEFAULTS)).toBe(true)
  })

  it("publie un texte ordinaire, un ou deux liens, et une conversation vive", () => {
    expect(review("Bonjour à toutes et à tous")).toBe(false)
    expect(review("À lire : https://exemple.test/article et sa source www.source.test")).toBe(false)
    expect(review("Message", 29)).toBe(false)
  })

  it("met en relecture trois liens, la trentième écriture de la minute, et un mot bloqué du réseau", () => {
    expect(review("https://a.test https://b.test https://c.test")).toBe(true)
    expect(review("Message", 30)).toBe(true)
    expect(review("Une MENÁCE voilée", 0, [normalizeBlockedTerm("menace")])).toBe(true)
  })

  it("un réglage explicite remplace les défauts, champ par champ", () => {
    const explicit = { preReview: true, maxLinks: 20, maxWrites: 100, windowMs: 1_000 }
    expect(effectiveModerationPolicy(explicit)).toEqual(explicit)
    expect(contentNeedsReview({ text: "https://a.test https://b.test https://c.test", blockedTerms: [], recentWrites: 0, ...effectiveModerationPolicy({ ...explicit, preReview: false }) })).toBe(false)
  })

  it("refuse un réglage hors bornes ou non entier, en nommant le champ", () => {
    expect(MODERATION_POLICY_BOUNDS.maxWrites.max).toBe(MODERATION_SCAN_LIMIT)
    expect(moderationPolicyProblem({ maxLinks: 21, maxWrites: 10, windowMs: 60_000 })).toBe("maxLinks")
    expect(moderationPolicyProblem({ maxLinks: -1, maxWrites: 10, windowMs: 60_000 })).toBe("maxLinks")
    expect(moderationPolicyProblem({ maxLinks: 2, maxWrites: 0, windowMs: 60_000 })).toBe("maxWrites")
    expect(moderationPolicyProblem({ maxLinks: 2, maxWrites: 101, windowMs: 60_000 })).toBe("maxWrites")
    expect(moderationPolicyProblem({ maxLinks: 2, maxWrites: 1.5, windowMs: 60_000 })).toBe("maxWrites")
    expect(moderationPolicyProblem({ maxLinks: 2, maxWrites: 10, windowMs: 999 })).toBe("windowMs")
    expect(moderationPolicyProblem({ maxLinks: 2, maxWrites: 10, windowMs: 86_400_001 })).toBe("windowMs")
    expect(moderationPolicyProblem({ maxLinks: 0, maxWrites: 1, windowMs: 1_000 })).toBeNull()
  })

  it("un mot bloqué se normalise et se borne ; le plafond des mots actifs est celui que la garde lit", () => {
    expect(admissibleBlockedTerm("  Arnaque  AU  Mobile Money ")).toBe("arnaque au mobile money")
    expect(admissibleBlockedTerm(" é ")).toBeNull()
    expect(admissibleBlockedTerm("x".repeat(81))).toBeNull()
    expect(BLOCKED_TERMS_ACTIVE_MAX).toBe(MODERATION_SCAN_LIMIT)
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

describe("MC-01 — surfaces signalables seulement", () => {
  it("ajoute le groupe thématique et le message personnel sans rien retirer, et les tient hors des réglages d'écriture", () => {
    expect(MODERATION_SURFACES).toContain("thematicGroup")
    expect(MODERATION_SURFACES).toContain("personalMessage")
    expect([...REPORT_ONLY_SURFACES]).toEqual(["thematicGroup", "personalMessage"])
    expect(REPORT_ONLY_SURFACES.every((surface) => isReportOnlySurface(surface))).toBe(true)
    expect(isReportOnlySurface("post")).toBe(false)
    // Les surfaces réglables : toutes les autres, dans l'ordre du moteur.
    expect([...MODERATION_POLICY_SURFACES]).toEqual(MODERATION_SURFACES.filter((surface) => surface !== "thematicGroup" && surface !== "personalMessage"))
    expect(MODERATION_POLICY_SURFACES).toHaveLength(MODERATION_SURFACES.length - 2)
  })
})
