/** MP09 : source professionnelle fermée, db-only ; aucun message, graphe ou appel créé ici. */
import { canonicalPair } from "@antsia/social-domain/connectionState"

import type { ContextualReadCtx, ContextualResolver, ContextualSnapshot } from "../contextualMessaging/contract"
import type { Id } from "../../_generated/dataModel"
import { isBlockedBetween } from "../graph/graph"
import { professionalPublishedModeration, readableProfessionalCollaboration, readableProfessionalProfile } from "./read"

async function source(ctx: ContextualReadCtx, id: Id<"professionalCollaborations">) {
  const row = await ctx.db.get(id)
  if (!row || !Number.isSafeInteger(row.revision) || row.revision < 1 || row.fromPersonId === row.toPersonId) return null
  const pair = canonicalPair(row.fromPersonId, row.toPersonId)
  if (pair.low !== row.personIdLow || pair.high !== row.personIdHigh) return null
  const [from, to] = await Promise.all([
    readableProfessionalProfile(ctx, row.networkId, row.fromPersonId), readableProfessionalProfile(ctx, row.networkId, row.toPersonId),
  ])
  if (!from || !to || await isBlockedBetween(ctx, row.fromPersonId, row.toPersonId) || !await professionalPublishedModeration(ctx, "professionalCollaboration", row._id)) return null
  return row
}

export const PROFESSIONAL_CONVERSATION_CONTEXTS = {
  professionalCollaboration: {
    kind: "professionalCollaboration",
    async load(ctx, id, now): Promise<ContextualSnapshot | null> {
      if (!Number.isSafeInteger(now) || now < 0) return null
      const row = await source(ctx, id)
      if (!row) return null
      return { networkId: row.networkId, requester: { personId: row.fromPersonId }, responder: { personId: row.toPersonId },
        phase: row.status === "accepted" ? "open" : row.status === "pending" ? "not_open" : "closed",
        callsEngaged: false, responderFirst: false, attachments: { requester: false, responder: false },
        writeMinStatus: { requester: "declaree", responder: "declaree" }, moderationCountry: null }
    },
    async visibleTo(ctx, id, personId, now): Promise<boolean> {
      if (!Number.isSafeInteger(now) || now < 0) return false
      const row = await source(ctx, id)
      return row !== null && await readableProfessionalCollaboration(ctx, row, personId) !== null
    },
  },
} satisfies { professionalCollaboration: ContextualResolver<"professionalCollaboration"> }
