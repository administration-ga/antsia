import { describe, expect, it } from "vitest"
import { nativeMemberAdmission } from "./member-admission"

const admitted = { networkExists: true, personExists: true, membershipsLoaded: true, membershipStatus: "declaree" }

describe("native network admission after authentication", () => {
  it("keeps a partially created newcomer on registration without treating its valid session as failed", () => {
    expect(nativeMemberAdmission({ ...admitted, membershipStatus: null })).toBe("setup")
    expect(nativeMemberAdmission({ ...admitted, membershipStatus: undefined })).toBe("setup")
  })
  it("does not need a membership query to guide an account without a person", () => {
    expect(nativeMemberAdmission({ ...admitted, personExists: false, membershipsLoaded: false })).toBe("setup")
  })
  it("waits for membership resolution before admitting an existing person", () => {
    expect(nativeMemberAdmission({ ...admitted, membershipsLoaded: false })).toBe("loading")
    expect(nativeMemberAdmission({ ...admitted, personExists: undefined })).toBe("loading")
    expect(nativeMemberAdmission({ ...admitted, networkExists: undefined })).toBe("loading")
  })
  it.each(["declaree", "verifiee"])("admits the resolved %s membership", membershipStatus => {
    expect(nativeMemberAdmission({ ...admitted, membershipStatus })).toBe("member")
  })
  it("keeps pending and suspended memberships outside member screens", () => {
    expect(nativeMemberAdmission({ ...admitted, membershipStatus: "en_attente" })).toBe("pending")
    expect(nativeMemberAdmission({ ...admitted, membershipStatus: "suspendue" })).toBe("suspended")
  })
  it("denies missing networks and unknown future statuses", () => {
    expect(nativeMemberAdmission({ ...admitted, networkExists: false })).toBe("setup")
    expect(nativeMemberAdmission({ ...admitted, membershipStatus: "admin" })).toBe("setup")
  })
})
