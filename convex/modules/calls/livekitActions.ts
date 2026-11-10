"use node"
// Dupliqué de socle/convex/actions/livekit.ts (l. 120-297, `requestToken`) @ ad2e7fdc2 — adaptations : action BORNÉE par le réseau (`networkAction`) ; autorisation puis réveil, dans cet ordre, par UNE query interne (`calls/token.authorizeToken` — le socle en faisait quatre) ; identité `call` seule, `attributes.personId` (et `metadata` en repli) au lieu de `userId` ; nom affiché par le contrat, jamais un état civil ; grant restreint « citoyen » (V33), « late joiner » d'iRéunion et trace de diagnostic retirés ; refus à code (`notFound` indistinct, `mediaServer*`) au lieu de `throw new Error` ; jeton EAU, PNPE, rendez-vous, supervision, enregistrement d'appel, messagerie vocale par Egress exclus ; `verifyEgressWebhook` et `ingestEgressFile` vont au direct (lot 16).
/**
 * Appels — le JETON de salle, émis pour une personne partie à un appel vivant.
 *
 * L'ordre est la sécurité : AUTORISER d'abord (la query interne prouve la
 * participation), RÉVEILLER ensuite le serveur multimédia (sinon n'importe quel
 * visiteur le rallumerait en boucle), puis émettre. L'identité porte un nonce par
 * connexion (deux onglets ne s'éjectent pas) ; la PERSONNE voyage dans les
 * attributs du participant, que la grille de l'écran lit pour poser chaque
 * vidéo sur sa vignette.
 */
import { randomUUID } from "node:crypto"

import { v } from "convex/values"
import { makeFunctionReference } from "convex/server"
import type { Id } from "../../_generated/dataModel"
import { nativeBindingFields } from "./deviceOwnership"
import { AccessToken } from "livekit-server-sdk"

import { internal } from "../../_generated/api"
import { fail, notFound } from "../../lib/errors"
import { networkAction } from "../../lib/functions"
import { getLiveKitConfig } from "../../lib/livekit"
import { buildLiveKitIdentity } from "../../lib/livekitIdentity"
import { ensureLiveKitAwake } from "../../lib/livekitWake"
import { CONVERSATION_CALL_TOKEN_TTL, isConversationCall } from "./conversation"
import { callMediaTypeValidator } from "./validators"

/** Durée de vie d'un jeton de salle : un appel plus long en redemande un en se reconnectant. */
const TOKEN_TTL = "2h"

export const requestToken = networkAction({
  writeBucket: "call.token",
  args: { callId: v.id("calls") },
  returns: v.object({ token: v.string(), roomName: v.string(), wsUrl: v.string(), mediaType: callMediaTypeValidator }),
  handler: async (ctx, args): Promise<{ token: string; roomName: string; wsUrl: string; mediaType: "audio" | "video" }> => {
    const grant = await ctx.runQuery(internal.modules.calls.token.authorizeToken, { networkId: ctx.networkId, callId: args.callId })
    if (grant === null) return notFound()

    // Configuration depuis l'environnement du déploiement (source unique, aucune URL en dur).
    const { apiKey, apiSecret, wsUrl } = getLiveKitConfig()
    await ensureLiveKitAwake(wsUrl)
    // Le réveil peut prendre du temps : session, gagnant et droits sont relus pour TOUS les appels.
    const conversationCall = isConversationCall(grant)
    const fresh = await ctx.runQuery(internal.modules.calls.token.authorizeToken, { networkId: ctx.networkId, callId: args.callId })
    if (fresh === null || fresh.sessionId !== grant.sessionId || fresh.personId !== grant.personId || fresh.roomName !== grant.roomName || fresh.commercialThreadId !== grant.commercialThreadId || fresh.contextualThreadId !== grant.contextualThreadId) return notFound()

    const identity = await ctx.auth.getUserIdentity()
    if (!identity) return fail("unauthenticated")
    const token = new AccessToken(apiKey, apiSecret, {
      identity: buildLiveKitIdentity({ kind: "call", subject: identity.subject, nonce: randomUUID().slice(0, 8) }),
      ttl: conversationCall ? CONVERSATION_CALL_TOKEN_TTL : TOKEN_TTL,
      ...(grant.displayName !== null ? { name: grant.displayName } : {}),
      attributes: { personId: grant.personId },
      // Repli pour un serveur antérieur aux attributs de participant.
      metadata: JSON.stringify({ personId: grant.personId }),
    })
    token.addGrant({ roomJoin: true, room: grant.roomName, canPublish: true, canSubscribe: true, canPublishData: true })
    const signed = await token.toJwt()
    const final = await ctx.runQuery(internal.modules.calls.token.authorizeToken, { networkId: ctx.networkId, callId: args.callId })
    if (!final || final.sessionId !== grant.sessionId || final.personId !== grant.personId || final.roomName !== grant.roomName) return notFound()
    return { token: signed, roomName: grant.roomName, wsUrl, mediaType: grant.mediaType }
  },
})


type NativeTokenArgs = { networkId: Id<"networks">; callId: Id<"calls">; applicationId: string; deviceId: string; bindingId: string }
type NativeTokenGrant = { roomName: string; mediaType: "audio" | "video"; personId: Id<"persons">; displayName: string | null; sessionId: string; commercialThreadId?: Id<"commercialThreads">; contextualThreadId?: Id<"contextualThreads"> }
const authorizeNativeToken = makeFunctionReference<"query", NativeTokenArgs, NativeTokenGrant | null>("modules/calls/native:authorizeNativeToken")

/** Aucun secret média dans le push : seul le gagnant vivant reçoit ce jeton au geste. */
export const requestNativeToken = networkAction({
  writeBucket: "call.token", args: { callId: v.id("calls"), ...nativeBindingFields },
  returns: v.object({ token: v.string(), serverUrl: v.string(), media: callMediaTypeValidator }),
  handler: async (ctx, args): Promise<{ token: string; serverUrl: string; media: "audio" | "video" }> => {
    const input = { networkId: ctx.networkId, ...args }
    const grant = await ctx.runQuery(authorizeNativeToken, input)
    if (!grant) return notFound()
    const { apiKey, apiSecret, wsUrl } = getLiveKitConfig()
    await ensureLiveKitAwake(wsUrl)
    const stillAuthorized = async () => {
      const fresh = await ctx.runQuery(authorizeNativeToken, input)
      return fresh !== null && fresh.sessionId === grant.sessionId && fresh.personId === grant.personId && fresh.roomName === grant.roomName && fresh.commercialThreadId === grant.commercialThreadId && fresh.contextualThreadId === grant.contextualThreadId
    }
    if (!(await stillAuthorized())) return notFound()
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) return fail("unauthenticated")
    const token = new AccessToken(apiKey, apiSecret, {
      identity: buildLiveKitIdentity({ kind: "call", subject: identity.subject, nonce: randomUUID().slice(0, 8) }),
      ttl: isConversationCall(grant) ? CONVERSATION_CALL_TOKEN_TTL : TOKEN_TTL,
      ...(grant.displayName !== null ? { name: grant.displayName } : {}),
      attributes: { personId: grant.personId }, metadata: JSON.stringify({ personId: grant.personId }),
    })
    token.addGrant({ roomJoin: true, room: grant.roomName, canPublish: true, canSubscribe: true, canPublishData: true })
    const signed = await token.toJwt()
    if (!(await stillAuthorized())) return notFound()
    return { token: signed, serverUrl: wsUrl, media: grant.mediaType }
  },
})
