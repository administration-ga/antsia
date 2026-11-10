// Dupliqué de socle/convex/modules/reseauPersonnel/domain.test.ts (l. 744-810) @ ad2e7fdc2 — adaptations : imports depuis ./events ; `ReseauPersonnelViolation` → `DomainViolation`.
import { describe, expect, it } from "vitest"

import {
  assertPersonalEventDescription,
  assertPersonalEventLocation,
  assertPersonalEventTimeZone,
  assertPersonalEventTitle,
  assertPersonalEventWindow,
  canRespondToPersonalEvent,
  isPageEventCancellationReason,
  PAGE_EVENT_CANCELLATION_REASONS,
  PERSONAL_EVENT_MAX_DURATION_MS,
  PERSONAL_EVENT_TITLE_MAX_LENGTH,
} from "./events"
import { DomainViolation } from "./violation"

describe("évènements personnels — asserts du domaine", () => {
  it("le titre se borne et se rogne ; description et lieu vides deviennent absents", () => {
    expect(assertPersonalEventTitle("  Pot de départ  ")).toBe("Pot de départ")
    expect(() => assertPersonalEventTitle("ab")).toThrow(DomainViolation)
    expect(() => assertPersonalEventTitle("x".repeat(PERSONAL_EVENT_TITLE_MAX_LENGTH + 1))).toThrow(DomainViolation)
    expect(assertPersonalEventDescription("   ")).toBeUndefined()
    expect(assertPersonalEventDescription(undefined)).toBeUndefined()
    expect(assertPersonalEventLocation("  Salle 204 ")).toBe("Salle 204")
  })

  it("la fenêtre : fin STRICTEMENT après début, durée bornée, instants finis", () => {
    expect(() => assertPersonalEventWindow({ startAt: 1000, endAt: 1000 })).toThrow(DomainViolation)
    expect(() => assertPersonalEventWindow({ startAt: 2000, endAt: 1000 })).toThrow(DomainViolation)
    expect(() => assertPersonalEventWindow({ startAt: Number.NaN, endAt: 1000 })).toThrow(DomainViolation)
    expect(() => assertPersonalEventWindow({ startAt: 0, endAt: PERSONAL_EVENT_MAX_DURATION_MS + 1 })).toThrow(DomainViolation)
    // Le passé est PERMIS — consigner hier n'est pas frauder.
    expect(() => assertPersonalEventWindow({ startAt: 1000, endAt: 2000 })).not.toThrow()
  })

  it("le fuseau est jugé par Intl, pas par une liste maison", () => {
    expect(assertPersonalEventTimeZone(" Africa/Libreville ")).toBe("Africa/Libreville")
    expect(assertPersonalEventTimeZone("Europe/Paris")).toBe("Europe/Paris")
    for (const invalid of ["", "Mars/Olympus_Mons", "x".repeat(65)]) {
      expect(() => assertPersonalEventTimeZone(invalid)).toThrow(DomainViolation)
    }
  })

  it("répondre exige SA ligne et un évènement non annulé", () => {
    expect(canRespondToPersonalEvent({ eventStatus: "scheduled", isOwnParticipation: true })).toBe(true)
    expect(canRespondToPersonalEvent({ eventStatus: "cancelled", isOwnParticipation: true })).toBe(false)
    expect(canRespondToPersonalEvent({ eventStatus: "scheduled", isOwnParticipation: false })).toBe(false)
  })
})

describe("évènements de page — motif d'annulation (EV-03)", () => {
  it("liste fermée de quatre motifs courts, sans texte libre", () => {
    expect([...PAGE_EVENT_CANCELLATION_REASONS]).toEqual(["venue_unavailable", "weather", "organizer_unavailable", "other"])
    for (const reason of PAGE_EVENT_CANCELLATION_REASONS) expect(isPageEventCancellationReason(reason)).toBe(true)
  })

  it("refuse tout ce qui n'est pas un motif de la liste, sans normaliser", () => {
    for (const value of ["", "Weather", " weather", "pluie", "toString", null, undefined, 3, {}]) expect(isPageEventCancellationReason(value)).toBe(false)
  })
})
