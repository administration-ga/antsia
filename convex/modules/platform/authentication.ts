/** @publicProjection Disponibilité des portes de connexion et origines approuvées, sans aucun secret ni compte. */
import { v } from "convex/values"
import { query } from "../../_generated/server"
import { authenticationConfiguration } from "../../betterAuth/settings"
import { getActiveIdentity } from "../../lib/session"

export const configuration = query({
  args: {},
  returns: v.object({
    idn: v.boolean(), emailOtp: v.boolean(), smsOtp: v.boolean(), localCodes: v.boolean(), demoAccounts: v.boolean(),
    trustedOrigins: v.array(v.string()),
    applications: v.array(v.object({ key: v.string(), origin: v.string() })),
  }),
  handler: () => authenticationConfiguration(),
})

/** @publicProjection État de la session de cet appel ; réactif à sa révocation serveur. */
export const mySession = query({
  args: {},
  returns: v.boolean(),
  handler: async (ctx) => (await getActiveIdentity(ctx)) !== null,
})
