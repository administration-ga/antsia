// Dupliqué de socle/convex/modules/iappel/groupCalls.ts @ ad2e7fdc2 — adaptations : appels de groupe PAR RÉSEAU ; verrous « agent » V08 à V17 levés (délai de rattachement → statut d'adhésion par le constructeur ; `startAdHoc` sans organisation, ni appartenance, ni `canPlaceDirectCall` ; invités JOIGNABLES du réseau au lieu de « collègues de l'administration » ; plafond CONSTANT de onze, sans configuration d'organisation ni exemption du back-office ; filtre et fonctions de poste retirés) ; BLOCAGE vérifié pour chaque invité, à chaque porte (D13) ; réglage « hors de mes relations » de chaque invité appliqué à un appel ad hoc et à un ajout (le fil, lui, vaut consentement) ; présence et convocation sur les lignes de `callParticipants` (D27) ; le fil d'origine porté par l'APPEL (`groupThreadId`) ; un membre du fil hors de la sélection REJOINT l'appel en cours au lieu de buter sur l'absence de ligne ; un appel de fil n'accepte que des membres vivants du fil ; titre composé par l'écran (aucun titre stocké) ; `myCallCapacity` et `threadCallCapacity` retirés (le plafond est une constante du contrat) ; réunions instantanées (`loadRingingMeetingInvites`, `expireRingingInvites`) retirées ; refus à code ; débit.
/**
 * Appels — LES APPELS DE GROUPE : lancer, ajouter, suivre, refuser.
 *
 * Un appel de groupe est un APPEL : il sonne, se décroche, se raccroche, et
 * obéit aux réglages de CHACUN. L'admission se joue PAR LIGNE, jamais sur
 * l'appel entier : un « ne pas déranger » n'écarte qu'un invité, les autres
 * sonnent, et l'hôte lit « indisponible » dans la grille au lieu d'un refus
 * global. Trois portes, une mécanique :
 *
 *  · `startFromThread` — depuis un fil de groupe : les invités SONT les membres
 *    vivants du fil (ou ceux qu'on y choisit), et l'appartenance tient lieu de
 *    garde ; un fil n'a qu'un appel à la fois, le second départ le REJOINT ;
 *  · `startAdHoc` — des personnes choisies une à une, joignables dans le réseau ;
 *  · `addInvitee` — l'ajout en cours d'appel, qui PROMEUT un tête-à-tête.
 */
import { GROUP_CALL_INVITES_SCAN, GROUP_CALL_MAX_PARTICIPANTS, GROUP_CALL_MIN_OTHERS, countReservedSeats, normalizeGroupInvitees, summarizeGroupCall } from "@antsia/social-contracts/callGroup"
import type { CounterpartLabel } from "@antsia/social-contracts/counterpart"
import type { CallAdmissionReason, CallMediaType, GroupCallInviteStatus } from "@antsia/social-domain/callJournal"
import { isTerminalCallStatus } from "@antsia/social-domain/callJournal"
import { v } from "convex/values"

import type { Doc, Id } from "../../_generated/dataModel"
import type { MutationCtx } from "../../_generated/server"
import { failRule, notFound } from "../../lib/errors"
import { networkMutation, networkQuery } from "../../lib/functions"
import { enforceRateLimit } from "../../lib/rateLimit"
import { isBlockedBetween } from "../graph/graph"
import { liveMembers, liveMembershipOrNull, requireLiveMembership } from "../groups/access"
import { insertSystemMessage } from "../groups/threads"
import { counterpartOf } from "../messaging/participation"
import { miniProfileCache } from "../people/miniProfile"
import {
  callRoomName,
  inviteOf,
  isLiveMemberOfThreadCall,
  isPresent,
  liveThreadCall,
  loadGroupParticipants,
  participationOf,
  participationsOf,
  reachablePerson,
  requireCallParticipant,
} from "./access"
import { photographedGroupCallCapacity } from "./capacity"
import { activeCallSession } from "./deviceOwnership"
import { isConversationCall } from "./conversation"
import { evaluateCallAdmission } from "./evaluate"
import { scheduleIncomingCallPush } from "./push"
import { scheduleRingingExpiry } from "./ringExpiry"
import { declineGroupInvite } from "./state"
import { callAdmissionReasonValidator, callMediaTypeValidator } from "./validators"

/** Un invité écarté d'emblée par SES réglages — l'appel part quand même chez les autres. */
const unavailableValidator = v.object({ personId: v.id("persons"), reason: callAdmissionReasonValidator })
type Unavailable = { personId: Id<"persons">; reason: CallAdmissionReason }

/** Le ticket d'un invité écarté : « hors ligne » est un MANQUÉ (il n'y avait personne), toute autre raison un refus automatique. */
function refusedTicketStatus(reason: CallAdmissionReason): GroupCallInviteStatus {
  return reason === "offline" ? "missed" : "declined"
}

/**
 * Le noyau commun aux portes de lancement : poser l'appel, ses lignes et ses
 * tickets. L'admission est évaluée POUR CHAQUE invité, AVANT l'insertion ; son
 * refus ne décide que de l'état de SON ticket. Borné : dix invités au plus.
 */
async function placeGroupCall(
  ctx: MutationCtx,
  args: {
    networkId: Id<"networks">
    callerId: Id<"persons">
    inviteeIds: Id<"persons">[]
    mediaType: CallMediaType
    now: number
    /** Lancé depuis un fil : le fil vaut consentement — le réglage « hors de mes relations » ne s'y applique pas. */
    groupThreadId?: Id<"groupThreads">
  },
): Promise<{ callId: Id<"calls">; roomName: string; unavailable: Unavailable[] }> {
  const refusals = new Map<string, CallAdmissionReason>()
  for (const inviteeId of args.inviteeIds) {
    const admission = await evaluateCallAdmission(ctx, {
      networkId: args.networkId,
      calleePersonId: inviteeId,
      callerPersonId: args.callerId,
      now: args.now,
      viaGroupThread: args.groupThreadId !== undefined,
    })
    if (!admission.decision.admitted) refusals.set(inviteeId, admission.decision.reason)
  }

  const roomName = callRoomName("group", args.now), ownerSessionId = await activeCallSession(ctx)
  const callId = await ctx.db.insert("calls", {
    networkId: args.networkId,
    kind: "group",
    status: "active",
    // `ringing` d'emblée : l'appelant est déjà dans sa salle et les téléphones sonnent.
    callStatus: "ringing",
    roomName,
    createdByPersonId: args.callerId,
    mediaType: args.mediaType,
    systemCallUuid: crypto.randomUUID(),
    maxParticipants: GROUP_CALL_MAX_PARTICIPANTS,
    startedAt: args.now,
    ...(args.groupThreadId !== undefined ? { groupThreadId: args.groupThreadId } : {}),
  })
  await ctx.db.insert("callParticipants", { networkId: args.networkId, callId, personId: args.callerId, role: "host", joinedAt: args.now, ownerSessionId })

  const unavailable: Unavailable[] = []
  for (const inviteeId of args.inviteeIds) {
    await ctx.db.insert("callParticipants", { networkId: args.networkId, callId, personId: inviteeId, role: "participant" })
    const reason = refusals.get(inviteeId)
    if (reason !== undefined) {
      await ctx.db.insert("callInvites", { networkId: args.networkId, callId, personId: inviteeId, status: refusedTicketStatus(reason), reason, invitedAt: args.now, respondedAt: args.now })
      unavailable.push({ personId: inviteeId, reason })
      continue
    }
    const inviteId = await ctx.db.insert("callInvites", { networkId: args.networkId, callId, personId: inviteeId, status: "ringing", invitedAt: args.now })
    // La sonnerie s'éteint au terme de SA fenêtre, pas à la fin de l'appel.
    await scheduleRingingExpiry(ctx, { inviteId, invitedAt: args.now, now: args.now })
    await scheduleIncomingCallPush(ctx, { networkId: args.networkId, calleePersonId: inviteeId, callId })
  }
  return { callId, roomName, unavailable }
}

/** Les membres VIVANTS d'un fil qu'un appel peut faire sonner : sans moi, sans personne avec qui un blocage existe (D13). */
async function callableThreadMembers(ctx: MutationCtx, threadId: Id<"groupThreads">, me: Id<"persons">): Promise<Id<"persons">[]> {
  const out: Id<"persons">[] = []
  for (const member of await liveMembers(ctx, threadId)) {
    if (member.personId === me) continue
    if (await isBlockedBetween(ctx, me, member.personId)) continue
    out.push(member.personId)
  }
  return out
}

/**
 * L'appel d'un FIL de groupe. Un fil n'a qu'UN appel vivant : s'il existe, on le
 * REND — l'appelant le rejoint, il ne lui fait pas concurrence (un membre du fil
 * que la sélection n'avait pas retenu y reçoit sa ligne, s'il en reste la place).
 *
 * `personIds` : QUI appeler dans ce fil. Absent, tout le monde sonne, et un fil
 * plus grand que le plafond est refusé en disant la sortie (choisir). Fourni,
 * chaque personne est RE-CONTRÔLÉE contre les membres vivants : l'écran a pu être
 * composé sur une liste périmée, et faire sonner un ancien membre serait une
 * fuite de conversation.
 */
export const startFromThread = networkMutation({
  args: { threadId: v.id("groupThreads"), mediaType: v.optional(callMediaTypeValidator), personIds: v.optional(v.array(v.id("persons"))) },
  returns: v.object({
    callId: v.id("calls"),
    roomName: v.string(),
    alreadyActive: v.boolean(),
    mediaType: callMediaTypeValidator,
    unavailable: v.array(unavailableValidator),
  }),
  handler: async (ctx, args) => {
    const me = ctx.person._id
    await enforceRateLimit(ctx, "call.place", me)
    const { thread } = await requireLiveMembership(ctx, ctx.networkId, args.threadId, me)
    if (thread.closedAt !== undefined) return failRule("GROUP_CLOSED")

    const current = await liveThreadCall(ctx, thread._id)
    if (current) {
      const mine = await participationOf(ctx, current._id, me)
      if (!mine && (await participationsOf(ctx, current._id)).length < GROUP_CALL_INVITES_SCAN) {
        await ctx.db.insert("callParticipants", { networkId: ctx.networkId, callId: current._id, personId: me, role: "participant" })
      }
      return { callId: current._id, roomName: current.roomName, alreadyActive: true, mediaType: current.mediaType, unavailable: [] }
    }

    const everyone = await callableThreadMembers(ctx, thread._id, me)
    const capacity = GROUP_CALL_MAX_PARTICIPANTS
    let inviteeIds = everyone
    if (args.personIds !== undefined) {
      const callable = new Set<string>(everyone)
      const chosen = normalizeGroupInvitees(args.personIds, me)
      // Parti du fil entre l'affichage et le clic, ou bloqué : le même refus qu'un inconnu.
      if (chosen.some((id) => !callable.has(id))) return notFound()
      if (chosen.length < GROUP_CALL_MIN_OTHERS) return failRule("GROUP_CALL_TOO_FEW", { min: GROUP_CALL_MIN_OTHERS })
      if (chosen.length + 1 > capacity) return failRule("GROUP_CALL_SELECTION_TOO_LARGE", { chosen: chosen.length, max: capacity, excess: chosen.length + 1 - capacity })
      // L'ordre du FIL, pas celui de la saisie.
      const order = new Map(everyone.map((id, index) => [id as string, index]))
      inviteeIds = (chosen as Id<"persons">[]).sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0))
    } else {
      if (everyone.length < GROUP_CALL_MIN_OTHERS) return failRule("GROUP_CALL_TOO_FEW", { min: GROUP_CALL_MIN_OTHERS })
      if (everyone.length + 1 > capacity) return failRule("GROUP_CALL_THREAD_TOO_LARGE", { members: everyone.length + 1, max: capacity, maxOthers: capacity - 1 })
    }

    const now = Date.now()
    const mediaType = args.mediaType ?? "audio"
    const placed = await placeGroupCall(ctx, { networkId: ctx.networkId, callerId: me, inviteeIds, mediaType, now, groupThreadId: thread._id })
    // La trace DANS le fil — une référence, jamais un contenu : la carte relit l'appel avec sa garde.
    await insertSystemMessage(ctx, thread, me, "call_started", { callId: placed.callId, at: now })
    return { callId: placed.callId, roomName: placed.roomName, alreadyActive: false, mediaType, unavailable: placed.unavailable }
  },
})

/**
 * L'appel de groupe AD HOC — des personnes choisies une à une. Chacune doit être
 * JOIGNABLE dans le réseau et sans blocage avec l'appelant ; tout manquement rend
 * le refus indistinct, sans dire lequel des invités pose problème (la mutation
 * ne sert pas d'oracle d'existence de comptes).
 */
export const startAdHoc = networkMutation({
  args: { personIds: v.array(v.id("persons")), mediaType: v.optional(callMediaTypeValidator) },
  returns: v.object({
    callId: v.id("calls"),
    roomName: v.string(),
    mediaType: callMediaTypeValidator,
    invited: v.number(),
    unavailable: v.array(unavailableValidator),
  }),
  handler: async (ctx, args) => {
    const me = ctx.person._id
    await enforceRateLimit(ctx, "call.place", me)
    const inviteeIds = normalizeGroupInvitees(args.personIds, me) as Id<"persons">[]
    // Un seul correspondant, c'est un tête-à-tête : il a sa porte (messagerie vocale, refus qui termine l'appel).
    if (inviteeIds.length < GROUP_CALL_MIN_OTHERS) return failRule("GROUP_CALL_TOO_FEW", { min: GROUP_CALL_MIN_OTHERS })
    if (inviteeIds.length + 1 > GROUP_CALL_MAX_PARTICIPANTS) return failRule("GROUP_CALL_FULL", { max: GROUP_CALL_MAX_PARTICIPANTS })
    for (const inviteeId of inviteeIds) {
      if ((await reachablePerson(ctx, ctx.networkId, { personId: inviteeId })) === null) return notFound()
      if (await isBlockedBetween(ctx, me, inviteeId)) return notFound()
    }
    const now = Date.now()
    const mediaType = args.mediaType ?? "audio"
    const placed = await placeGroupCall(ctx, { networkId: ctx.networkId, callerId: me, inviteeIds, mediaType, now })
    return { callId: placed.callId, roomName: placed.roomName, mediaType, invited: inviteeIds.length, unavailable: placed.unavailable }
  },
})

/**
 * AJOUTER une personne à un appel EN COURS — l'escalade d'un tête-à-tête en
 * groupe. Le TICKET est la sonnerie, l'admission se joue sur la seule cible, le
 * plafond vaut sur tous les chemins (projection des états, IC-04), et les refus
 * de périmètre sont INDISTINCTS. La PROMOTION pose `kind: "group"` avec des
 * tickets RÉTROACTIFS pour les personnes déjà à bord : sans eux, la grille dirait
 * « sonne » pour quelqu'un de connecté, et le destinataire qui sonnait encore
 * cesserait de sonner (la sonnerie de groupe ne lit que les tickets).
 */
export const addInvitee = networkMutation({
  args: { callId: v.id("calls"), personId: v.id("persons") },
  returns: v.object({
    callId: v.id("calls"),
    /** L'appel était un tête-à-tête et vient de devenir un groupe. */
    promoted: v.boolean(),
    /** La cible sonne — ou a été écartée par SES réglages (`reason`). */
    admitted: v.boolean(),
    reason: v.union(callAdmissionReasonValidator, v.null()),
    /** Déjà en ligne ou déjà sonnant : geste idempotent, rien n'a changé. */
    alreadyIn: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const me = ctx.person._id
    await enforceRateLimit(ctx, "call.invite", me)
    // Refus UNIQUE : appel inconnu, terminé, ou dont je ne suis pas dans la salle — même réponse.
    const { call, participation } = await requireCallParticipant(ctx, ctx.networkId, args.callId, me)
    if (participation.ownerSessionId !== await activeCallSession(ctx)) return notFound()
    // Une conversation (contact commercial P10, conversation contextuelle CC-4) reste un tête-à-tête : ni invitation ni promotion.
    if (isConversationCall(call)) return notFound()
    if (call.status !== "active" || isTerminalCallStatus(call.callStatus) || !isPresent(participation)) return notFound()
    if (args.personId === me) return failRule("GROUP_CALL_ALREADY_IN")

    const now = Date.now()
    const existingInvite = await inviteOf(ctx, call._id, args.personId)
    const targetRow = await participationOf(ctx, call._id, args.personId)
    if ((targetRow !== null && isPresent(targetRow)) || existingInvite?.status === "ringing") {
      return { callId: call._id, promoted: false, admitted: true, reason: null, alreadyIn: true }
    }

    // Périmètre — un appel de fil n'accepte que des membres vivants du fil ; sinon, une personne joignable du réseau. Bloqué : même refus.
    const threadId = call.groupThreadId
    const inThread = threadId !== undefined
    if (threadId !== undefined) {
      if ((await liveMembershipOrNull(ctx, threadId, args.personId)) === null) return notFound()
    } else if ((await reachablePerson(ctx, ctx.networkId, { personId: args.personId })) === null) {
      return notFound()
    }
    if (await isBlockedBetween(ctx, me, args.personId)) return notFound()

    // Le plafond de l'appel QUI VA EXISTER : celui photographié d'un groupe, celui du contrat pour un tête-à-tête promu.
    const capacity = call.kind === "group" ? photographedGroupCallCapacity(call.maxParticipants) : GROUP_CALL_MAX_PARTICIPANTS
    if (countReservedSeats(await loadGroupParticipants(ctx, call)) + 1 > capacity) return failRule("GROUP_CALL_FULL", { max: capacity })
    if (targetRow === null && (await participationsOf(ctx, call._id)).length >= GROUP_CALL_INVITES_SCAN) return failRule("GROUP_CALL_INVITES_EXHAUSTED", { max: GROUP_CALL_INVITES_SCAN })

    const admission = await evaluateCallAdmission(ctx, { networkId: ctx.networkId, calleePersonId: args.personId, callerPersonId: me, now, viaGroupThread: inThread })
    if (!admission.decision.admitted) {
      const reason = admission.decision.reason
      const ticket = { status: refusedTicketStatus(reason), reason, invitedAt: now, respondedAt: now }
      if (existingInvite) await ctx.db.patch(existingInvite._id, ticket)
      else await ctx.db.insert("callInvites", { networkId: ctx.networkId, callId: call._id, personId: args.personId, ...ticket })
      // Un tête-à-tête n'est PAS promu pour un ajout qui n'a pas sonné ; un groupe garde la ligne (la grille dit « indisponible »).
      if (call.kind === "group" && targetRow === null) await ctx.db.insert("callParticipants", { networkId: ctx.networkId, callId: call._id, personId: args.personId, role: "participant" })
      return { callId: call._id, promoted: false, admitted: false, reason, alreadyIn: false }
    }

    let promoted = false
    if (call.kind !== "group") {
      promoted = true
      for (const row of await participationsOf(ctx, call._id)) {
        if (row.personId === call.createdByPersonId || (await inviteOf(ctx, call._id, row.personId))) continue
        const present = isPresent(row)
        // Le destinataire qui sonne ENCORE reprend un ticket daté du DÉBUT de l'appel : sa fenêtre continue, elle ne repart pas de zéro.
        const inviteId = await ctx.db.insert("callInvites", {
          networkId: ctx.networkId,
          callId: call._id,
          personId: row.personId,
          status: present ? "joined" : "ringing",
          invitedAt: call.startedAt,
          ...(present ? { respondedAt: now } : {}),
        })
        if (!present) await scheduleRingingExpiry(ctx, { inviteId, invitedAt: call.startedAt, now })
      }
      // La capacité posée est celle de qui PROMEUT : sans elle, le 1:1 (deux places) refuserait le troisième arrivant.
      await ctx.db.patch(call._id, { kind: "group", maxParticipants: capacity })
    }

    if (targetRow === null) await ctx.db.insert("callParticipants", { networkId: ctx.networkId, callId: call._id, personId: args.personId, role: "participant" })
    let inviteId: Id<"callInvites">
    if (existingInvite) {
      // Refusé, manqué, ou parti : re-sonner, fenêtre neuve.
      await ctx.db.patch(existingInvite._id, { status: "ringing", reason: undefined, respondedAt: undefined, invitedAt: now })
      inviteId = existingInvite._id
    } else {
      inviteId = await ctx.db.insert("callInvites", { networkId: ctx.networkId, callId: call._id, personId: args.personId, status: "ringing", invitedAt: now })
    }
    await scheduleRingingExpiry(ctx, { inviteId, invitedAt: now, now })
    await scheduleIncomingCallPush(ctx, { networkId: ctx.networkId, calleePersonId: args.personId, callId: call._id })
    return { callId: call._id, promoted, admitted: true, reason: null, alreadyIn: false }
  },
})

export type GroupCallParticipantDto = {
  personId: Id<"persons">
  label: CounterpartLabel
  state: "host" | "ringing" | "connected" | "left" | "declined" | "unavailable" | "missed"
  reason: CallAdmissionReason | null
  isMe: boolean
  /** L'auteur de l'appel : c'est lui qui a composé, et c'est à lui qu'on répond. */
  isCaller: boolean
}

/**
 * QUI est dans l'appel, et dans quel état — la grille. Rendue à toute personne
 * de l'appel, et à personne d'autre. `null` pour un tête-à-tête (pas de grille).
 */
export const listParticipants = networkQuery({
  args: { callId: v.id("calls") },
  handler: async (
    ctx,
    args,
  ): Promise<{
    callId: Id<"calls">
    threadId: Id<"groupThreads"> | null
    mediaType: CallMediaType
    status: Doc<"calls">["status"]
    participants: GroupCallParticipantDto[]
    summary: ReturnType<typeof summarizeGroupCall> & { reserved: number; remaining: number }
    maxParticipants: number
  } | null> => {
    const me = ctx.person._id
    const { call } = await requireCallParticipant(ctx, ctx.networkId, args.callId, me)
    if (call.kind !== "group") return null
    const states = await loadGroupParticipants(ctx, call)
    const profileOf = miniProfileCache(ctx)
    const participants: GroupCallParticipantDto[] = []
    for (const state of states) {
      const personId = state.personId as Id<"persons">
      participants.push({ personId, label: await counterpartOf(ctx, personId, profileOf), state: state.state, reason: state.reason, isMe: personId === me, isCaller: personId === call.createdByPersonId })
    }
    const capacity = photographedGroupCallCapacity(call.maxParticipants)
    const reserved = countReservedSeats(states)
    return {
      callId: call._id,
      threadId: (await isLiveMemberOfThreadCall(ctx, call, me)) === true ? (call.groupThreadId ?? null) : null,
      mediaType: call.mediaType,
      status: call.status,
      participants,
      summary: { ...summarizeGroupCall(states), reserved, remaining: Math.max(0, capacity - reserved) },
      maxParticipants: capacity,
    }
  },
})

/**
 * REFUSER un appel de groupe — sans le terminer pour les autres. Le TICKET
 * d'abord, et l'ordre porte la sécurité : il se lit par la clé complète
 * (appel, moi), si bien qu'un identifiant tiers ou inventé rend le même refus.
 */
export const decline = networkMutation({
  args: { callId: v.id("calls") },
  returns: v.object({ callId: v.id("calls"), ended: v.boolean() }),
  handler: async (ctx, args) => {
    const me = ctx.person._id
    await enforceRateLimit(ctx, "call.respond", me)
    const invite = await inviteOf(ctx, args.callId, me)
    if (!invite || invite.networkId !== ctx.networkId) return notFound()
    const { ended } = await declineGroupInvite(ctx, args.callId, me, Date.now())
    return { callId: args.callId, ended }
  },
})

/**
 * L'appel VIVANT d'un fil, pour un membre vivant du fil — la bannière
 * « appel en cours » de la conversation. `null` sans appel.
 */
export const activeForThread = networkQuery({
  args: { threadId: v.id("groupThreads") },
  handler: async (ctx, args): Promise<{ callId: Id<"calls">; mediaType: CallMediaType; startedAt: number; joined: boolean } | null> => {
    await requireLiveMembership(ctx, ctx.networkId, args.threadId, ctx.person._id)
    const call = await liveThreadCall(ctx, args.threadId)
    if (!call) return null
    const mine = await participationOf(ctx, call._id, ctx.person._id)
    return { callId: call._id, mediaType: call.mediaType, startedAt: call.startedAt, joined: mine !== null && isPresent(mine) }
  },
})
