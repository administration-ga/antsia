/** MP10–MP11 : lecture authentifiée d'une admission fermée, sans donnée personnelle nouvelle. */
import { PERSONAL_MEETINGS_CAPABILITIES, PERSONAL_MEETINGS_CLOSED_REASON } from "@antsia/social-domain/personalMeetings"
import { v } from "convex/values"

import { networkQuery } from "../../lib/functions"

export const get = networkQuery({
  minStatus: "declaree",
  args: {},
  returns: v.object({
    version: v.literal(1), state: v.literal("closed"),
    participation: v.literal(false), discovery: v.literal(false), interests: v.literal(false), contact: v.literal(false),
    reason: v.literal(PERSONAL_MEETINGS_CLOSED_REASON),
  }),
  handler: async () => PERSONAL_MEETINGS_CAPABILITIES,
})
