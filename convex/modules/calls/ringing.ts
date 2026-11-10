// Dupliqué de socle/convex/modules/iappel/calls.ts @ ad2e7fdc2 — adaptations : `listRinging` par RÉSEAU (deux sources, une seule liste : tête-à-tête par l'index du destinataire, groupes par leurs tickets — bornés à vingt chacun, le socle lisait jusqu'à 1 000 tickets, D19) ; fenêtre de sonnerie tenue par l'ÉTAT (extinction programmée, nettoyage) et non plus filtrée sur l'horloge de la query — `serverNow` retiré (D16) ; environnement back-office, portée par rattachements, noms d'organisation, fonctions de poste, routage du secrétariat, priorité et réunions instantanées retirés ; personnes nommées par le contrat `counterpartLabel` (jamais d'état civil) ; réponses rapides `null` quand la personne n'en a jamais réglé (l'écran propose alors les siennes, traduites) ; `hold`/`resume` tels quels sur la garde commune — miroir vers la présence d'organisation (`mirrorPresenceActiveCall`) et file du centre d'appels retirés ; refus à code ; débit.
/**
 * Appels — ce qui SONNE chez moi, et la mise en attente.
 *
 * DEUX SOURCES, UNE SEULE SONNERIE : ce qui m'est adressé en propre (un
 * tête-à-tête) et ce à quoi je suis convié (un ticket de groupe). Deux queries
 * concurrentes feraient sonner deux fois, ou pas du tout selon celle qui arrive
 * la première — et l'écran n'aurait plus de vue d'ensemble pour choisir quel
 * appel mettre en avant.
 *
 * L'ATTENTE EST TENUE PAR LE SERVEUR : un état du document, lu des deux côtés.
 * `heldBy` dit QUI tient l'attente (`on_hold` ⇔ non vide) ; c'est un tableau,
 * les deux correspondants peuvent parquer chacun de leur côté, et la ligne ne
 * revient qu'au DERNIER qui reprend. `holdOnAnswer` porte l'attente demandée
 * avant le décrochage. Un appel de groupe ne se met pas en attente : parquer la
 * ligne gèlerait la conversation de tous les autres.
 */
import type { CounterpartLabel } from "@antsia/social-contracts/counterpart"
import { isRingingCallStatus, isTerminalCallStatus } from "@antsia/social-domain/callJournal"
import { v } from "convex/values"

import type { Doc, Id } from "../../_generated/dataModel"
import type { MutationCtx } from "../../_generated/server"
import { failRule, notFound } from "../../lib/errors"
import { networkMutation, networkQuery } from "../../lib/functions"
import { activeCallSession } from "./deviceOwnership"
import { enforceRateLimit } from "../../lib/rateLimit"
import { counterpartOf } from "../messaging/participation"
import { miniProfileCache } from "../people/miniProfile"
import { isLiveMemberOfThreadCall, isPresent, participationOf, participationsOf, requireCallParticipant } from "./access"
import { conversationFieldsOfCall } from "./conversation"

/** Au plus vingt appels examinés par source : personne n'a vingt téléphones qui sonnent. */
const MAX_RINGING = 20
/** Visages montrés sur l'écran d'appel entrant d'un groupe : quatre, puis « +k ». */
const GROUP_INVITEES_PREVIEW = 4

export type RingingCallDto = {
  callId: Id<"calls">
  /** `direct` = tête-à-tête ; `group` = appel à plusieurs (il se décroche aussi). */
  kind: "direct" | "group"
  caller: { personId: Id<"persons">; label: CounterpartLabel }
  mediaType: "audio" | "video"
  /** Depuis quand ÇA sonne chez moi : le début de l'appel, ou l'heure de MON ticket (un invité ajouté en route ne sonne pas depuis le début). */
  ringingSince: number
  /** Un appel de groupe : combien de personnes conviées, et les premières d'entre elles (hors l'appelant et moi). */
  group: { memberCount: number; invitees: Array<{ personId: Id<"persons">; label: CounterpartLabel }> } | null
  /** Le fil d'où part l'appel, quand j'en suis membre vivant — l'écran y lit son titre. */
  threadId: Id<"groupThreads"> | null
  commercialThreadId?: Id<"commercialThreads">
  /** CC-4 : la conversation contextuelle d'où part l'appel — l'écran la nomme et y renvoie (jamais vers l'appel personnel). */
  contextualThreadId?: Id<"contextualThreads">
}

/** Ce qui sonne chez moi, maintenant, dans ce réseau — le plus ancien d'abord (c'est lui qu'on est sur le point de manquer). */
export const listRinging = networkQuery({
  args: {},
  handler: async (ctx): Promise<{ calls: RingingCallDto[]; quickReplies: string[] | null }> => {
    const me = ctx.person._id
    const profileOf = miniProfileCache(ctx)
    const labelOf = (personId: Id<"persons">) => counterpartOf(ctx, personId, profileOf)
    const calls: RingingCallDto[] = []

    // ── Tête-à-tête : ce qui m'est adressé ───────────────────────────────
    const addressed = await ctx.db
      .query("calls")
      .withIndex("by_network_callee_status", (q) => q.eq("networkId", ctx.networkId).eq("calleePersonId", me).eq("status", "active"))
      .order("desc")
      .take(MAX_RINGING)
    for (const call of addressed) {
      // Un appel de groupe ne passe JAMAIS par ce canal (un tête-à-tête promu sonne par son ticket).
      if (call.kind !== "direct" || !isRingingCallStatus(call.callStatus) || call.createdByPersonId === me) continue
      if ((await isLiveMemberOfThreadCall(ctx, call, me)) === false) continue
      const mine = await participationOf(ctx, call._id, me)
      // Déjà décroché, ou déjà sorti.
      if (!mine || mine.joinedAt !== undefined || mine.leftAt !== undefined) continue
      calls.push({
        callId: call._id,
        kind: "direct",
        caller: { personId: call.createdByPersonId, label: await labelOf(call.createdByPersonId) },
        mediaType: call.mediaType,
        ringingSince: call.startedAt,
        group: null,
        threadId: null,
        ...conversationFieldsOfCall(call),
      })
    }

    // ── Groupes : mes tickets qui sonnent ────────────────────────────────
    const tickets = await ctx.db
      .query("callInvites")
      .withIndex("by_network_person_status", (q) => q.eq("networkId", ctx.networkId).eq("personId", me).eq("status", "ringing"))
      .order("desc")
      .take(MAX_RINGING)
    for (const ticket of tickets) {
      const call = await ctx.db.get(ticket.callId)
      if (!call || call.status !== "active" || call.kind !== "group" || isTerminalCallStatus(call.callStatus) || call.createdByPersonId === me) continue
      const threadMember = await isLiveMemberOfThreadCall(ctx, call, me)
      if (threadMember === false) continue
      const rows = await participationsOf(ctx, call._id)
      const invitees: Array<{ personId: Id<"persons">; label: CounterpartLabel }> = []
      for (const row of rows) {
        if (invitees.length >= GROUP_INVITEES_PREVIEW) break
        if (row.personId === call.createdByPersonId || row.personId === me) continue
        invitees.push({ personId: row.personId, label: await labelOf(row.personId) })
      }
      calls.push({
        callId: call._id,
        kind: "group",
        caller: { personId: call.createdByPersonId, label: await labelOf(call.createdByPersonId) },
        mediaType: call.mediaType,
        ringingSince: ticket.invitedAt,
        group: { memberCount: rows.length, invitees },
        threadId: threadMember === true ? (call.groupThreadId ?? null) : null,
      })
    }

    calls.sort((a, b) => a.ringingSince - b.ringingSince)
    const prefs = await ctx.db
      .query("callPreferences")
      .withIndex("by_person", (q) => q.eq("personId", me))
      .unique()
    return { calls, quickReplies: prefs?.quickReplies ?? null }
  },
})

/** La garde de `hold`/`resume` : un tête-à-tête où je suis ENTRÉ (parquer un appel qu'on n'a pas décroché n'a pas de sens). */
async function requireJoinedDirectCall(ctx: MutationCtx, networkId: Id<"networks">, callId: Id<"calls">, me: Id<"persons">): Promise<Doc<"calls">> {
  const { call, participation } = await requireCallParticipant(ctx, networkId, callId, me)
  if (call.kind === "group") return failRule("CALL_GROUP_NO_HOLD")
  if (!isPresent(participation) || participation.ownerSessionId !== await activeCallSession(ctx)) return notFound()
  return call
}

/** Ajoute une personne à une liste en gardant l'ordre d'arrivée, sans doublon. */
function withHolder(holders: readonly Id<"persons">[], me: Id<"persons">): Id<"persons">[] {
  return holders.includes(me) ? [...holders] : [...holders, me]
}

/**
 * Mettre un tête-à-tête EN ATTENTE. Déjà parqué par moi : on le DIT (`noop`),
 * on ne lève pas — l'écran rejoue son état désiré à chaque émission, une
 * opération rejouée est le fonctionnement normal. Pas encore décroché :
 * l'intention est notée (`holdOnAnswer`), le décrochage la posera.
 */
export const hold = networkMutation({
  args: { callId: v.id("calls") },
  returns: v.object({
    callId: v.id("calls"),
    callStatus: v.union(v.literal("initiating"), v.literal("ringing"), v.literal("on_hold")),
    noop: v.boolean(),
    /** L'appel n'était pas encore décroché : l'attente est notée, pas posée. */
    deferred: v.optional(v.boolean()),
  }),
  handler: async (ctx, args) => {
    const me = ctx.person._id
    await enforceRateLimit(ctx, "call.respond", me)
    const call = await requireJoinedDirectCall(ctx, ctx.networkId, args.callId, me)

    if (call.callStatus === "on_hold") {
      // `heldBy` absent : l'attente est tenue par moi — sans quoi une reprise ne reconnecterait jamais.
      const holders = call.heldBy ?? [me]
      if (holders.includes(me)) return { callId: call._id, callStatus: "on_hold" as const, noop: true }
      // Le correspondant tient déjà la ligne et je la parque à mon tour : la ligne ne reviendra qu'au dernier qui reprendra.
      await ctx.db.patch(call._id, { heldBy: withHolder(holders, me) })
      return { callId: call._id, callStatus: "on_hold" as const, noop: false }
    }
    if (call.callStatus === "initiating" || call.callStatus === "ringing") {
      if (call.holdOnAnswer !== true) await ctx.db.patch(call._id, { holdOnAnswer: true })
      return { callId: call._id, callStatus: call.callStatus, noop: true, deferred: true }
    }
    if (call.callStatus !== "connected" || call.status !== "active") return failRule("CALL_NOT_LIVE")
    const now = Date.now()
    // Le PREMIER parcage fait foi : deux attentes croisées ne remettent pas le chronomètre à zéro.
    await ctx.db.patch(call._id, { callStatus: "on_hold", parkedAt: call.parkedAt ?? now, heldBy: withHolder(call.heldBy ?? [], me) })
    return { callId: call._id, callStatus: "on_hold" as const, noop: false }
  },
})

/**
 * REPRENDRE un tête-à-tête parqué. Reprendre lâche MON attente, jamais celle du
 * correspondant : quand les deux ont parqué, la ligne ne revient qu'au DERNIER
 * qui reprend — le premier reçoit un refus rendu comme VALEUR (`heldByPeer`).
 * Le serveur ne parque pas l'autre appel au passage : « au plus un appel
 * audible » est tenu par l'écran, qui seul sait lequel il écoute.
 */
export const resume = networkMutation({
  args: { callId: v.id("calls") },
  returns: v.object({
    callId: v.id("calls"),
    roomName: v.string(),
    callStatus: v.union(v.literal("initiating"), v.literal("ringing"), v.literal("connected"), v.literal("on_hold")),
    noop: v.boolean(),
    /** L'appel sonne encore : il n'y avait qu'une attente différée à annuler. */
    deferred: v.optional(v.boolean()),
    /** Le correspondant tient encore la ligne : elle reste en attente. */
    heldByPeer: v.optional(v.boolean()),
  }),
  handler: async (ctx, args) => {
    const me = ctx.person._id
    await enforceRateLimit(ctx, "call.respond", me)
    const call = await requireJoinedDirectCall(ctx, ctx.networkId, args.callId, me)

    if (call.callStatus === "connected") return { callId: call._id, roomName: call.roomName, callStatus: "connected" as const, noop: true }
    if (call.callStatus === "initiating" || call.callStatus === "ringing") {
      if (call.holdOnAnswer === true) await ctx.db.patch(call._id, { holdOnAnswer: undefined })
      return { callId: call._id, roomName: call.roomName, callStatus: call.callStatus, noop: true, deferred: true }
    }
    if (call.callStatus !== "on_hold" || call.status !== "active") return failRule("CALL_NOT_LIVE")

    const heldBy = (call.heldBy ?? [me]).filter((holder) => holder !== me)
    if (heldBy.length > 0) {
      await ctx.db.patch(call._id, { heldBy })
      return { callId: call._id, roomName: call.roomName, callStatus: "on_hold" as const, noop: true, heldByPeer: true }
    }
    await ctx.db.patch(call._id, { callStatus: "connected", parkedAt: undefined, heldBy: undefined })
    return { callId: call._id, roomName: call.roomName, callStatus: "connected" as const, noop: false }
  },
})
