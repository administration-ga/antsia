import { describe, expect, it } from "vitest"

import {
  ARTICLE_44_MAX_MS,
  isJudicialConfirmationOverdue,
  isJudicialLapseReminderDue,
  isJudicialMeasureLive,
  JUDICIAL_CONFIRMATION_DELAY_MS,
  JUDICIAL_LAPSE_REMINDER_MS,
  JUDICIAL_MEASURE_KINDS,
  JUDICIAL_TARGETS_BY_KIND,
  judicialMeasureLatestEnd,
  judicialMeasureProblem,
  judicialTargetAllowed,
} from "./judicialMeasures"

const HOUR = 3_600_000
const NOW = Date.UTC(2026, 10, 11, 10, 0, 0)
const base = { orderReference: "RG 2026/0001", startsAt: NOW - HOUR }

describe("SU01h — mesures sur ordre du juge (règles pures)", () => {
  it("chaque genre a ses cibles ; un réseau n'est visé que par l'article 44", () => {
    expect(Object.keys(JUDICIAL_TARGETS_BY_KIND).sort()).toEqual([...JUDICIAL_MEASURE_KINDS].sort())
    expect(judicialTargetAllowed("suspend_account", "person")).toBe(true)
    expect(judicialTargetAllowed("suspend_account", "page")).toBe(true)
    expect(judicialTargetAllowed("suspend_account", "post")).toBe(false)
    expect(judicialTargetAllowed("suspend_content", "post")).toBe(true)
    expect(judicialTargetAllowed("suspend_content", "person")).toBe(false)
    expect(judicialTargetAllowed("delist", "post")).toBe(true)
    expect(judicialTargetAllowed("delist", "comment")).toBe(false)
    expect(judicialTargetAllowed("restrict_feature", "network")).toBe(true)
    expect(judicialTargetAllowed("suspend_access", "post")).toBe(false)
  })

  it("une mesure bien formée passe ; la référence, la date d'effet et l'échéance sont bornées", () => {
    expect(judicialMeasureProblem({ ...base, kind: "suspend_account", targetKind: "person" }, NOW)).toBeNull()
    expect(judicialMeasureProblem({ ...base, kind: "suspend_account", targetKind: "person", orderReference: "  " }, NOW)).toBe("orderReference")
    expect(judicialMeasureProblem({ ...base, kind: "suspend_account", targetKind: "person", orderReference: "RG\n1" }, NOW)).toBe("orderReference")
    expect(judicialMeasureProblem({ ...base, kind: "suspend_account", targetKind: "person", startsAt: NOW + HOUR }, NOW)).toBe("startsAt")
    expect(judicialMeasureProblem({ ...base, kind: "suspend_account", targetKind: "person", startsAt: NOW - 40 * 24 * HOUR }, NOW)).toBe("startsAt")
    expect(judicialMeasureProblem({ ...base, kind: "suspend_account", targetKind: "person", endsAt: NOW - 1 }, NOW)).toBe("endsAt")
    expect(judicialMeasureProblem({ ...base, kind: "suspend_account", targetKind: "post" }, NOW)).toBe("target")
  })

  it("article 44 : échéance obligatoire, 72 h au plus depuis la date d'effet", () => {
    const restrict = { ...base, kind: "restrict_feature" as const, targetKind: "network" as const, feature: "live" }
    expect(judicialMeasureProblem(restrict, NOW)).toBe("endsAt")
    expect(judicialMeasureProblem({ ...restrict, endsAt: base.startsAt + ARTICLE_44_MAX_MS }, NOW)).toBeNull()
    expect(judicialMeasureProblem({ ...restrict, endsAt: base.startsAt + ARTICLE_44_MAX_MS + 1 }, NOW)).toBe("endsAt")
    expect(judicialMeasureLatestEnd("suspend_access", base.startsAt)).toBe(base.startsAt + ARTICLE_44_MAX_MS)
  })

  it("la fonction restreinte vient du registre fermé ; le correctif et l'étiquette ont leur texte, et lui seul", () => {
    const network = { ...base, targetKind: "network" as const, endsAt: NOW + HOUR }
    expect(judicialMeasureProblem({ ...network, kind: "restrict_feature", feature: "dating" }, NOW)).toBe("feature")
    expect(judicialMeasureProblem({ ...network, kind: "suspend_access", feature: "live" }, NOW)).toBe("feature")
    expect(judicialMeasureProblem({ ...base, kind: "pin_correction", targetKind: "post" }, NOW)).toBe("correctionText")
    expect(judicialMeasureProblem({ ...base, kind: "pin_correction", targetKind: "post", correctionText: "Correctif ordonné par le juge des référés." }, NOW)).toBeNull()
    expect(judicialMeasureProblem({ ...base, kind: "delist", targetKind: "post", correctionText: "Correctif ordonné par le juge des référés." }, NOW)).toBe("correctionText")
    expect(judicialMeasureProblem({ ...base, kind: "origin_label", targetKind: "person", originLabel: "Origine : compte d'un tiers" }, NOW)).toBeNull()
    expect(judicialMeasureProblem({ ...base, kind: "origin_label", targetKind: "person", originLabel: "x" }, NOW)).toBe("originLabel")
  })

  it("confirmation attendue sous 24 h, sans levée d'office ; rappel de caducité au 28e jour", () => {
    const measure = { status: "active" as const, startsAt: NOW, executedAt: NOW }
    expect(JUDICIAL_CONFIRMATION_DELAY_MS).toBe(24 * HOUR)
    expect(isJudicialConfirmationOverdue(measure, NOW + 24 * HOUR - 1)).toBe(false)
    expect(isJudicialConfirmationOverdue(measure, NOW + 24 * HOUR)).toBe(true)
    expect(isJudicialConfirmationOverdue({ ...measure, confirmedAt: NOW + HOUR }, NOW + 48 * HOUR)).toBe(false)
    expect(isJudicialMeasureLive(measure, NOW + 1_000 * HOUR)).toBe(true)
    expect(isJudicialMeasureLive({ ...measure, endsAt: NOW + HOUR }, NOW + HOUR)).toBe(false)
    expect(isJudicialLapseReminderDue(measure, NOW + JUDICIAL_LAPSE_REMINDER_MS - 1)).toBe(false)
    expect(isJudicialLapseReminderDue(measure, NOW + JUDICIAL_LAPSE_REMINDER_MS)).toBe(true)
    expect(isJudicialLapseReminderDue({ ...measure, meritsActionNotedAt: NOW + HOUR }, NOW + JUDICIAL_LAPSE_REMINDER_MS)).toBe(false)
  })
})
