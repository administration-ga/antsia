// Dupliqué de socle/convex/functions/meetings.ts (l. 829-1230 et 2293-2439 : `join`, `leave`, `setCallRinging`, `declineCall`) @ ad2e7fdc2 — adaptations : appels SEULEMENT (réunions, file d'organisation et sa tâche `meetings.join`, politique d'entrée `joinPolicy`, iRéunion, enregistrement, priorité, appels manqués de file et environnement back-office retirés) ; la garde commune (`requireCallParticipant`) : appel du réseau, ligne de participation, fil d'origine relu — on n'entre plus dans un appel dont on n'a pas de ligne ; présence écrite sur la ligne de participation (D27) au lieu du tableau `participants` réécrit ; plafond d'un appel de groupe lu sur la projection des états (IC-04) et sur le plafond photographié borné ; toute fin par `finishCall` ; raccrocher est sans réponse observable pour un appel inconnu (le socle répondait « introuvable » pour l'un, rien pour l'autre) ; refuser un appel de groupe passe par son ticket QUEL QUE SOIT l'état de l'appel ; refus à code ; débit ; `meetings.get` (l. 300-330 de l'hôte d'appel du socle, qui souscrivait au document entier) → `getCall` : l'ÉTAT allowlisté de l'appel, pour ceux qui y ont une ligne, `null` pour tout autre.
/**
 * Appels — le CYCLE DE VIE : faire sonner, décrocher, raccrocher, refuser.
 *
 * Trois règles du tête-à-tête cessent d'être vraies à plusieurs (`callGroup`) :
 * un refus ne termine pas un appel de groupe, un départ non plus, et chaque
 * invité décroche quand il veut.
 */
import { MAX_DECLINE_NOTE_LENGTH } from "@antsia/social-contracts/calls"
import { countReservedSeats } from "@antsia/social-contracts/callGroup"
import { isLiveCallStatus, isRingingCallStatus, isTerminalCallStatus } from "@antsia/social-domain/callJournal"
import { v } from "convex/values"

import type { Doc, Id } from "../../_generated/dataModel"
import type { MutationCtx } from "../../_generated/server"
import { failRule, notFound } from "../../lib/errors"
import { networkMutation, networkQuery } from "../../lib/functions"
import { enforceRateLimit } from "../../lib/rateLimit"
import { isLiveMemberOfThreadCall, loadGroupParticipants, participationOf, participationsOf, requireCallParticipant } from "./access"
import { photographedGroupCallCapacity } from "./capacity"
import { activeCallSession, claimWebParticipant, isWebOwner } from "./deviceOwnership"
import { conversationFieldsOfCall } from "./conversation"
import { scheduleIncomingCallPush } from "./push"
import { declineGroupInvite, endGroupCallIfDeserted, finishCall, markGroupInviteJoined } from "./state"
import {
  callEndReasonValidator,
  callKindValidator,
  callLifecycleStatusValidator,
  callMediaTypeValidator,
  callStatusValidator,
} from "./validators"

/**
 * Un départ dans les cinq secondes qui suivent la création ne termine pas un
 * tête-à-tête — sauf geste explicite (`intentional`) : un double montage d'écran
 * ou une navigation rapide raccrochaient sinon l'appel qu'ils venaient d'ouvrir.
 */
const LEAVE_FRESH_PROTECTION_MS = 5_000

/**
 * L'appelant a rejoint sa salle : le téléphone de l'appelé se met à sonner
 * (`initiating → ringing`), une seule fois par appel. Réservé à l'appelant.
 */
export const setCallRinging = networkMutation({
  args: { callId: v.id("calls") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const me = ctx.person._id
    await enforceRateLimit(ctx, "call.respond", me)
    const { call } = await requireCallParticipant(ctx, ctx.networkId, args.callId, me)
    const participation = await participationOf(ctx, call._id, me)
    if (!participation || participation.ownerSessionId !== await activeCallSession(ctx)) return notFound()
    if (call.createdByPersonId !== me) return notFound()
    if (call.status !== "active" || call.callStatus !== "initiating") return null
    await ctx.db.patch(call._id, { callStatus: "ringing" })
    if (call.calleePersonId !== undefined) await scheduleIncomingCallPush(ctx, { networkId: ctx.networkId, calleePersonId: call.calleePersonId, callId: call._id })
    return null
  },
})

/**
 * DÉCROCHER, ou rejoindre — l'appelant entre dans sa propre salle, l'appelé
 * décroche, un invité de groupe entre quand il veut (y compris après un refus,
 * si une place s'est libérée). L'appel ne passe « en communication » que quand
 * un autre que l'appelant entre ; une attente demandée pendant la sonnerie fait
 * atterrir l'appel parqué.
 */
export const join = networkMutation({
  args: { callId: v.id("calls") },
  returns: v.object({ roomName: v.string(), mediaType: callMediaTypeValidator, callStatus: callStatusValidator }),
  handler: async (ctx, args) => {
    const me = ctx.person._id
    await enforceRateLimit(ctx, "call.respond", me)
    const { call, participation } = await requireCallParticipant(ctx, ctx.networkId, args.callId, me)
    await claimWebParticipant(ctx, participation)
    return await joinParticipant(ctx, call, participation, me)
  },
})

/** Le même effet métier pour le Web et le gagnant natif, dans la transaction du geste. */
export async function joinParticipant(ctx: MutationCtx, call: Doc<"calls">, participation: Doc<"callParticipants">, me: Id<"persons">) {
    if (call.status !== "active" || isTerminalCallStatus(call.callStatus)) return failRule("CALL_ENDED")

    if (call.kind === "group") {
      // La capacité se lit sur la PROJECTION des états (IC-04) : un refus, un manqué
      // ou un départ ont rendu leur place. L'arrivant est exclu du compte — s'il
      // sonne, sa place est déjà la sienne ; s'il avait refusé, elle a pu être donnée.
      const others = (await loadGroupParticipants(ctx, call)).filter((participant) => participant.personId !== me)
      const capacity = photographedGroupCallCapacity(call.maxParticipants)
      if (countReservedSeats(others) + 1 > capacity) return failRule("GROUP_CALL_FULL", { max: capacity })
    }

    const now = Date.now()
    await ctx.db.patch(participation._id, { joinedAt: participation.leftAt === undefined ? participation.joinedAt ?? now : now, leftAt: undefined })

    let callStatus: Doc<"calls">["callStatus"] = call.callStatus
    if (call.createdByPersonId !== me && isRingingCallStatus(call.callStatus)) {
      const patch: Partial<Doc<"calls">> =
        call.holdOnAnswer === true
          ? { callStatus: "on_hold", parkedAt: now, holdOnAnswer: undefined, heldBy: [call.createdByPersonId] }
          : { callStatus: "connected" }
      if (call.answeredByPersonId === undefined) Object.assign(patch, { answeredByPersonId: me, answeredAt: now })
      await ctx.db.patch(call._id, patch)
      callStatus = patch.callStatus ?? callStatus
    }
    if (call.kind === "group") await markGroupInviteJoined(ctx, call._id, me, now)
    return { roomName: call.roomName, mediaType: call.mediaType, callStatus }
}

/** Une sortie native validée appelle le même noyau, sans emprunter la porte Web. */
export async function leaveParticipant(ctx: MutationCtx, call: Doc<"calls">, participation: Doc<"callParticipants">, intentional: boolean): Promise<void> {
  const now = Date.now()
  if (participation.leftAt === undefined) await ctx.db.patch(participation._id, { leftAt: now })
  if (call.status !== "active") return
  if (call.kind === "group") { await endGroupCallIfDeserted(ctx, call._id); return }
  if (now - call._creationTime < LEAVE_FRESH_PROTECTION_MS && !intentional) return
  if (isLiveCallStatus(call.callStatus)) await finishCall(ctx, call, { callStatus: "ended", endReason: "normal" }, now)
  else if (isRingingCallStatus(call.callStatus)) await finishCall(ctx, call, { callStatus: "ended", endReason: "cancelled" }, now)
}

/**
 * RACCROCHER. Un tête-à-tête finit dès que quiconque part (il ne reste plus
 * d'interlocuteur) ; un appel de groupe ne finit que lorsqu'il ne reste plus
 * personne en ligne. Sans effet — et sans réponse qui distingue — pour un appel
 * inconnu ou dont je n'ai pas de ligne.
 */
export const leave = networkMutation({
  args: { callId: v.id("calls"), intentional: v.optional(v.boolean()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const me = ctx.person._id
    await enforceRateLimit(ctx, "call.leave", me)
    const call = await ctx.db.get(args.callId)
    if (!call || call.networkId !== ctx.networkId) return null
    const participation = await participationOf(ctx, call._id, me)
    if (!participation) return null
    if (!isWebOwner(participation, await activeCallSession(ctx), true)) return null
    await leaveParticipant(ctx, call, participation, args.intentional === true)
    return null
  },
})

/**
 * REFUSER un appel qui sonne. En tête-à-tête, le refus termine l'appel et peut
 * porter un mot pour l'appelant (« je vous rappelle dans dix minutes ») ; en
 * groupe, il ne touche QUE mon ticket — l'appel continue pour les autres.
 * L'appelant ne refuse pas son propre appel : il l'annule en raccrochant.
 */
export const declineCall = networkMutation({
  args: { callId: v.id("calls"), note: v.optional(v.string()) },
  returns: v.object({ ended: v.boolean() }),
  handler: async (ctx, args) => {
    const me = ctx.person._id
    await enforceRateLimit(ctx, "call.respond", me)
    const { call, participation } = await requireCallParticipant(ctx, ctx.networkId, args.callId, me)
    if (!isWebOwner(participation, await activeCallSession(ctx), true)) return notFound()
    if (call.status !== "active") return { ended: false }
    if (call.kind === "group") return await declineGroupInvite(ctx, call._id, me, Date.now())
    if (!isRingingCallStatus(call.callStatus)) return { ended: false }
    if (call.createdByPersonId === me) return notFound()
    const note = args.note?.trim()
    if (note !== undefined && note.length > MAX_DECLINE_NOTE_LENGTH) return failRule("CALL_DECLINE_NOTE_TOO_LONG", { max: MAX_DECLINE_NOTE_LENGTH })
    await finishCall(ctx, call, { callStatus: "declined", endReason: "declined", ...(note ? { declineNote: note } : {}) }, Date.now())
    return { ended: true }
  },
})

const callStateValidator = v.object({
  _id: v.id("calls"),
  kind: callKindValidator,
  status: callLifecycleStatusValidator,
  callStatus: callStatusValidator,
  mediaType: callMediaTypeValidator,
  createdByPersonId: v.id("persons"),
  calleePersonId: v.union(v.id("persons"), v.null()),
  answeredAt: v.union(v.number(), v.null()),
  calleeEngagedAtCreate: v.boolean(),
  endReason: v.union(callEndReasonValidator, v.null()),
  heldBy: v.array(v.id("persons")),
  declineNote: v.union(v.string(), v.null()),
  groupThreadId: v.union(v.id("groupThreads"), v.null()),
  commercialThreadId: v.optional(v.id("commercialThreads")),
  /** CC-4 : la conversation contextuelle de l'appel (exclusive de `commercialThreadId`). */
  contextualThreadId: v.optional(v.id("contextualThreads")),
  /** Lignes de l'appel, hôte compris (l'effectif d'un appel de groupe). */
  participantCount: v.number(),
  /** Le titre du fil d'origine d'un appel de groupe ; `null` sinon (l'écran compose les noms). */
  title: v.union(v.string(), v.null()),
  startedAt: v.number(),
  endedAt: v.union(v.number(), v.null()),
})

export type CallStateDto = {
  _id: Id<"calls">
  kind: Doc<"calls">["kind"]
  status: Doc<"calls">["status"]
  callStatus: Doc<"calls">["callStatus"]
  mediaType: Doc<"calls">["mediaType"]
  createdByPersonId: Id<"persons">
  calleePersonId: Id<"persons"> | null
  answeredAt: number | null
  calleeEngagedAtCreate: boolean
  endReason: NonNullable<Doc<"calls">["endReason"]> | null
  heldBy: Id<"persons">[]
  declineNote: string | null
  groupThreadId: Id<"groupThreads"> | null
  commercialThreadId?: Id<"commercialThreads">
  contextualThreadId?: Id<"contextualThreads">
  participantCount: number
  title: string | null
  startedAt: number
  endedAt: number | null
}

/**
 * L'ÉTAT d'un appel, que l'écran d'appel suit (sonne, en communication,
 * terminé, raison de fin, attente, mot de refus) — pour ceux qui y ont une
 * ligne. Tout autre (appel inconnu, d'un autre réseau, sans ligne, fil quitté)
 * reçoit `null`, la même réponse : la query ne lève pas, l'écran y reste abonné
 * pendant tout l'appel. Un DTO allowlisté, jamais le document entier.
 */
export const getCall = networkQuery({
  args: { callId: v.id("calls") },
  returns: v.union(callStateValidator, v.null()),
  handler: async (ctx, args): Promise<CallStateDto | null> => {
    const call = await ctx.db.get(args.callId)
    if (!call || call.networkId !== ctx.networkId) return null
    if (!(await participationOf(ctx, call._id, ctx.person._id))) return null
    if ((await isLiveMemberOfThreadCall(ctx, call, ctx.person._id)) === false) return null
    const thread = call.groupThreadId === undefined ? null : await ctx.db.get(call.groupThreadId)
    return {
      _id: call._id,
      kind: call.kind,
      status: call.status,
      callStatus: call.callStatus,
      mediaType: call.mediaType,
      createdByPersonId: call.createdByPersonId,
      calleePersonId: call.calleePersonId ?? null,
      answeredAt: call.answeredAt ?? null,
      calleeEngagedAtCreate: call.calleeEngagedAtCreate ?? false,
      endReason: call.endReason ?? null,
      heldBy: call.heldBy ?? [],
      declineNote: call.declineNote ?? null,
      groupThreadId: call.groupThreadId ?? null,
      ...conversationFieldsOfCall(call),
      participantCount: (await participationsOf(ctx, call._id)).length,
      title: thread?.title ?? null,
      startedAt: call.startedAt,
      endedAt: call.endedAt ?? null,
    }
  },
})
