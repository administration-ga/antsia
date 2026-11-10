/** MP10–MP11 : aucune preuve de majorité qualifiée ; aucun accès personnel n'est admis. */
export const PERSONAL_MEETINGS_CLOSED_REASON = "majority_proof_unavailable" as const

/** Aucun argument, rôle, badge, environnement ou consentement local ne peut ouvrir ces capacités. */
export const PERSONAL_MEETINGS_CAPABILITIES = Object.freeze({
  version: 1,
  state: "closed",
  participation: false,
  discovery: false,
  interests: false,
  contact: false,
  reason: PERSONAL_MEETINGS_CLOSED_REASON,
} as const)

export type PersonalMeetingsCapabilities = typeof PERSONAL_MEETINGS_CAPABILITIES
