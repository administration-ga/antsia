/** MP09 : projection volontaire distincte des profils sociaux et du vivier privé. */
import { v } from "convex/values"
import { query } from "../../_generated/server"
import { readPublicProfile } from "../professionals/read"
import { professionalPublicProfileValidator } from "../professionals/validators"
import { publicContext } from "./access"

/** @publicProjection Champs publics choisis, consentement et personne vivants ; aucun brouillon ou invitation. */
export const profile = query({
  args: { networkId: v.id("networks"), handle: v.string() },
  returns: v.union(professionalPublicProfileValidator, v.null()),
  handler: async (ctx, args) => {
    const context = await publicContext(ctx, args.networkId)
    return readPublicProfile(ctx, { root: context.root, readerPersonId: context.reader?.personId }, args.handle)
  },
})
