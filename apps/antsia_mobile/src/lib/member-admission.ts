export type NativeMemberAdmission = "loading" | "setup" | "pending" | "suspended" | "member"

/** A live authentication session is not a network membership or permission. */
export function nativeMemberAdmission(input: {
  networkExists: boolean | undefined
  personExists: boolean | undefined
  membershipsLoaded: boolean
  membershipStatus: string | null | undefined
}): NativeMemberAdmission {
  if (input.networkExists === undefined || input.personExists === undefined) return "loading"
  if (!input.networkExists || !input.personExists) return "setup"
  if (!input.membershipsLoaded) return "loading"
  if (input.membershipStatus === "en_attente") return "pending"
  if (input.membershipStatus === "suspendue") return "suspended"
  if (input.membershipStatus === "declaree" || input.membershipStatus === "verifiee") return "member"
  return "setup"
}
