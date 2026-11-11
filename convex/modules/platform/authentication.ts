/** @publicProjection Disponibilité des portes de connexion, origines approuvées et durée de validité d'un code, sans aucun secret ni compte. */
import { v } from "convex/values"
import { query } from "../../_generated/server"
// La constante même des greffons OTP (`betterAuth/auth.ts` la reprend d'ici) : aucun greffon chargé par cette lecture.
import { authenticationConfiguration, OTP_TTL_SECONDS } from "../../betterAuth/settings"
import { getActiveIdentity } from "../../lib/session"

export const configuration = query({
  args: {},
  returns: v.object({
    idn: v.boolean(), emailOtp: v.boolean(), smsOtp: v.boolean(), localCodes: v.boolean(), demoAccounts: v.boolean(),
    trustedOrigins: v.array(v.string()),
    applications: v.array(v.object({ key: v.string(), origin: v.string() })),
    /**
     * EA-08 (issue #151) : la durée de validité d'un code à usage unique, en secondes — la
     * constante même des greffons OTP (`OTP_TTL_SECONDS`), jamais une valeur recopiée. Facultative :
     * un écran qui ne la lit pas est inchangé.
     */
    otpTtlSeconds: v.optional(v.number()),
  }),
  handler: () => ({ ...authenticationConfiguration(), otpTtlSeconds: OTP_TTL_SECONDS }),
})

/** @publicProjection État de la session de cet appel ; réactif à sa révocation serveur. */
export const mySession = query({
  args: {},
  returns: v.boolean(),
  handler: async (ctx) => (await getActiveIdentity(ctx)) !== null,
})
