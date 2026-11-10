import { describe, expect, it } from "vitest"

import { PERSONAL_MEETINGS_CAPABILITIES, PERSONAL_MEETINGS_CLOSED_REASON } from "./personalMeetings"

describe("MP10–MP11 — admission personnelle fermée", () => {
  it("ne déclare aucune capacité ouverte ni donnée personnelle à collecter", () => {
    expect(PERSONAL_MEETINGS_CAPABILITIES).toEqual({ version: 1, state: "closed", participation: false, discovery: false, interests: false, contact: false, reason: "majority_proof_unavailable" })
    expect(PERSONAL_MEETINGS_CLOSED_REASON).toBe("majority_proof_unavailable")
    expect(Object.isFrozen(PERSONAL_MEETINGS_CAPABILITIES)).toBe(true)
  })

  it("ne peut pas être ouvert en modifiant la constante partagée", () => {
    expect(Reflect.set(PERSONAL_MEETINGS_CAPABILITIES, "participation", true)).toBe(false)
    expect(Reflect.set(PERSONAL_MEETINGS_CAPABILITIES, "reason", "badge_verified")).toBe(false)
    expect(Reflect.set(PERSONAL_MEETINGS_CAPABILITIES, "dateOfBirth", "2000-01-01")).toBe(false)
    expect(PERSONAL_MEETINGS_CAPABILITIES.participation).toBe(false)
    expect(Object.keys(PERSONAL_MEETINGS_CAPABILITIES)).toEqual(["version", "state", "participation", "discovery", "interests", "contact", "reason"])
  })
})
