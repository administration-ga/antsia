import { describe, expect, it } from "vitest"

import { serializeCalendarEvent, type CalendarEventInput } from "./icalendar"

const INPUT: CalendarEventInput = {
  uid: "diaspora-ga-opaque-event",
  title: "Rencontre associative",
  startAt: Date.UTC(2026, 9, 25, 0, 30), endAt: Date.UTC(2026, 9, 25, 2, 30),
  createdAt: Date.UTC(2026, 9, 18), updatedAt: Date.UTC(2026, 9, 19),
  sequence: 3, status: "confirmed",
}
const unfold = (value: string) => value.replace(/\r\n /g, "")

describe("copie iCalendar privée", () => {
  it("garde les instants UTC autour du changement d'heure et un UID stable entre révisions", () => {
    const first = serializeCalendarEvent(INPUT)
    expect(first).toContain("DTSTART:20261025T003000Z\r\nDTEND:20261025T023000Z")
    expect(first).toContain("UID:diaspora-ga-opaque-event\r\n")
    expect(first).toContain("SEQUENCE:3\r\n")
    expect(first).toContain("STATUS:CONFIRMED\r\nTRANSP:OPAQUE\r\nCLASS:PRIVATE")
    const cancelled = serializeCalendarEvent({ ...INPUT, sequence: 4, status: "cancelled" })
    expect(cancelled).toContain("UID:diaspora-ga-opaque-event\r\n")
    expect(cancelled).toContain("SEQUENCE:4\r\n")
    expect(cancelled).toContain("STATUS:CANCELLED\r\nTRANSP:TRANSPARENT")
    expect(first.endsWith("END:VCALENDAR\r\n")).toBe(true)
    expect(first.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/)
  })

  it("ne transforme pas une attente en rendez-vous confirmé ou invitation envoyée", () => {
    const value = serializeCalendarEvent({ ...INPUT, status: "tentative" })
    expect(value).toContain("STATUS:TENTATIVE\r\nTRANSP:TRANSPARENT")
    for (const property of ["METHOD:", "ATTENDEE", "ORGANIZER", "BEGIN:VALARM", "URL:", "ATTACH", "TZID="]) expect(value).not.toContain(property)
  })

  it("échappe les textes et empêche l'injection d'un composant ou d'un participant", () => {
    const value = unfold(serializeCalendarEvent({ ...INPUT, title: "Nom, lieu; \\suite", description: "Une ligne\r\nEND:VEVENT\nATTENDEE:mailto:personne@example.invalid\rDernière ligne\u0000", location: "Salle; porte, 2" }))
    expect(value).toContain("SUMMARY:Nom\\, lieu\\; \\\\suite\r\n")
    expect(value).toContain("DESCRIPTION:Une ligne\\nEND:VEVENT\\nATTENDEE:mailto:personne@example.invalid\\nDernière ligne ")
    expect(value).toContain("LOCATION:Salle\\; porte\\, 2\r\n")
    expect(value.split("\r\n").filter((line) => line === "END:VEVENT")).toHaveLength(1)
    expect(value.split("\r\n").some((line) => line.startsWith("ATTENDEE:"))).toBe(false)
  })

  it("plie les longues lignes UTF-8 sans perdre accents ni emoji", () => {
    const description = "Éloïse, rencontre à Libreville 🌍; ".repeat(35)
    const value = serializeCalendarEvent({ ...INPUT, description })
    expect(value.split("\r\n").every((line) => new TextEncoder().encode(line).byteLength <= 75)).toBe(true)
    expect(unfold(value)).toContain(`DESCRIPTION:${description.replace(/;/g, "\\;").replace(/,/g, "\\,")}`)
    expect(value).not.toContain("\uFFFD")
  })

  it("refuse les métadonnées qui rendraient le fichier ambigu", () => {
    for (const patch of [{ uid: "uid\r\nMETHOD:REQUEST" }, { sequence: -1 }, { sequence: Number.POSITIVE_INFINITY }, { sequence: 2_147_483_648 }, { endAt: INPUT.startAt }, { endAt: INPUT.startAt + 1 }, { startAt: Number.NaN }, { updatedAt: Number.POSITIVE_INFINITY }, { title: " " }]) {
      expect(() => serializeCalendarEvent({ ...INPUT, ...patch })).toThrow()
    }
    expect(() => serializeCalendarEvent({ ...INPUT, title: "\u0000\u0001" })).toThrow()
  })
})
