// Dupliqué de socle/convex/functions/meetings.ts (l. 59-137 : `getAuthorizedForToken`, `getDisplayNameByAuthSubject`) @ ad2e7fdc2 — adaptations : UNE query interne rend tout ce dont l'émission de jeton a besoin (le socle en faisait quatre, dont `isAuthSubjectCitizen`, V33, et `getForToken`, exclus) ; la personne vient de l'IDENTITÉ de l'action (`requireMembership` dans le réseau, au statut déclaré), jamais d'un sujet passé en argument ; l'appel est du réseau et vivant, la personne y a une ligne non close, et — appel de fil — elle est membre vivant du fil ; nom affiché par le contrat `counterpartLabel` (jamais d'état civil ni d'e-mail, D21).
/**
 * Appels — l'AUTORISATION d'un jeton de salle. Connaître un identifiant d'appel
 * ne donne aucun droit : la query prouve que la personne de la session est, à
 * l'instant, partie à un appel vivant de ce réseau avant que l'action n'expose
 * les coordonnées de la salle.
 */
import { v } from "convex/values"

import { internalQuery } from "../../_generated/server"
import { requireMembership } from "../../lib/access"
import { counterpartOf } from "../messaging/participation"
import { isLiveMemberOfThreadCall, participationOf } from "./access"
import { conversationFieldsOfCall } from "./conversation"
import { activeCallSession, isWebOwner } from "./deviceOwnership"
import { callMediaTypeValidator } from "./validators"

/**
 * CC-4 : le contexte de conversation de l'appel (P10 ou contextuel) voyage avec l'autorisation —
 * l'action le relit après le réveil du serveur multimédia et émet alors un jeton court (sélecteur
 * `conversation.ts`). Le droit, lui, est relu ici à chaque émission (`isLiveMemberOfThreadCall`).
 */
export const authorizeToken = internalQuery({
  args: { networkId: v.id("networks"), callId: v.id("calls") },
  returns: v.union(
    v.null(),
    v.object({ roomName: v.string(), mediaType: callMediaTypeValidator, personId: v.id("persons"), displayName: v.union(v.string(), v.null()), commercialThreadId: v.optional(v.id("commercialThreads")), contextualThreadId: v.optional(v.id("contextualThreads")), sessionId: v.string() }),
  ),
  handler: async (ctx, args) => {
    const { person } = await requireMembership(ctx, args.networkId, "declaree")
    const call = await ctx.db.get(args.callId)
    if (!call || call.networkId !== args.networkId || call.status !== "active") return null
    const row = await participationOf(ctx, call._id, person._id)
    const sessionId = await activeCallSession(ctx)
    if (!row || row.joinedAt === undefined || row.leftAt !== undefined || !isWebOwner(row, sessionId)) return null
    if ((await isLiveMemberOfThreadCall(ctx, call, person._id)) === false) return null
    const label = await counterpartOf(ctx, person._id)
    return { roomName: call.roomName, mediaType: call.mediaType, personId: person._id, sessionId, displayName: label.displayName, ...conversationFieldsOfCall(call) }
  },
})
