// Dupliqué de socle/convex/modules/iappel/evaluate.ts @ ad2e7fdc2 — adaptations : l. 72-223 adaptées (« hors ligne » prouvé sur la présence du RÉSEAU de l'appel — une ligne existe et n'est ni en ligne ni fraîche ; appels tenus lus sur les lignes VIVANTES de participation du réseau, groupe compris ; silence de réunion sur l'agenda personnel du réseau, l'agenda de poste `iagenda_*` exclu) ; `evaluateCallAdmission` sans organisation, poste, horaires, autorité ni priorité, réglage « hors de mes relations » relu ICI (le lien n'est lu que si le réglage est actif) ; `voicemailEnabledFor` tel quel ; `insertRefusedCall` sans champs de routage, avec ses lignes de participation déjà closes ; `notifyAutoDeclined` par la porte unique de la cloche (genre `call_missed`, sujet l'appel, aucun titre ni corps stocké) ; routage du secrétariat (l. 397-868) et priorité (l. 519-524, 984-1008) retirés.
/**
 * Appels — le PONT entre la décision d'admission et les mutations d'appel.
 *
 * `admission.ts` tranche, mais ne lit rien. Ce fichier rassemble ce qu'il lui
 * faut (réglages de l'appelé, appels qu'il tient, évènement en cours, présence),
 * puis exécute la conséquence d'un refus : inscrire l'appel DÉJÀ TERMINÉ et
 * prévenir l'appelé. Aucune fonction Convex ici : des aides des mutations.
 */
import { PRESENCE_FRESHNESS_MS } from "@antsia/social-contracts/calls"
import { type CallAdmissionReason, type CallMediaType, isLiveCallStatus } from "@antsia/social-domain/callJournal"

import type { Id } from "../../_generated/dataModel"
import type { MutationCtx, QueryCtx } from "../../_generated/server"
import { isConnectedTo } from "../graph/graph"
import { pageEventAccess } from "../events/pageEventAccess"
import { hasLiveNativeCallChannel } from "../notifications/nativeChannels"
import { notifyPerson } from "../notifications/notify"
import { type AdmissionDecision, decideCallAdmission } from "./admission"

type ReadCtx = Pick<QueryCtx, "db"> & Partial<Pick<QueryCtx, "runQuery">>

/** Lignes vivantes examinées pour « tient-il déjà un appel ? » : personne ne tient dix appels à la fois. */
const LIVE_PARTICIPATIONS_SCAN = 10
/** Évènements examinés par agenda : un agenda n'a pas dix évènements simultanés. */
const EVENTS_SCAN = 10

/**
 * L'appelé est-il PROUVABLEMENT hors ligne dans le réseau de l'appel ?
 *
 * Le constat exige une présence connue périmée ET aucun canal natif admissible :
 *  · il A une ligne de présence dans ce réseau (aucune ligne = il n'a jamais
 *    ouvert d'écran du réseau = on ne sait rien = l'appel sonne) ;
 *  · elle n'est ni « en ligne » ni fraîche (trois battements manqués).
 *
 * P17c : seule une souscription native actuellement admissible (session,
 * configuration, consentement, préférences et budget relus) réfute ce constat.
 */
export async function isCalleeKnownOffline(ctx: ReadCtx, networkId: Id<"networks">, personId: Id<"persons">, now: number): Promise<boolean> {
  const row = await ctx.db
    .query("personPresence")
    .withIndex("by_network_person", (q) => q.eq("networkId", networkId).eq("personId", personId))
    .unique()
  if (!row) return false
  if (row.status === "online" && now - row.lastHeartbeat <= PRESENCE_FRESHNESS_MS) return false
  return !ctx.runQuery || !(await hasLiveNativeCallChannel({ db: ctx.db, runQuery: ctx.runQuery }, networkId, personId, now))
}

/**
 * Combien d'appels la personne tient-elle DÉJÀ dans ce réseau (décrochés ou
 * parqués) ? Ses lignes vivantes (`leftAt` absent : l'invariant de `finishCall`
 * les borne aux appels en cours), entrées, d'un appel établi — appel de groupe
 * compris, que le socle ne voyait pas.
 */
export async function countLiveCalls(ctx: ReadCtx, networkId: Id<"networks">, personId: Id<"persons">): Promise<number> {
  const rows = await ctx.db
    .query("callParticipants")
    .withIndex("by_network_person_leftAt", (q) => q.eq("networkId", networkId).eq("personId", personId).eq("leftAt", undefined))
    .take(LIVE_PARTICIPATIONS_SCAN)
  let held = 0
  for (const row of rows) {
    if (row.joinedAt === undefined) continue
    const call = await ctx.db.get(row.callId)
    if (call && call.status === "active" && isLiveCallStatus(call.callStatus)) held += 1
  }
  return held
}

/**
 * Un évènement ACCEPTÉ de l'agenda du réseau est-il en cours pour cette personne ?
 * Ceux qu'elle ORGANISE, et ceux auxquels elle a répondu « oui » — une invitation
 * en attente ne fait taire le téléphone de personne.
 */
export async function isInAcceptedEvent(ctx: ReadCtx, networkId: Id<"networks">, personId: Id<"persons">, now: number): Promise<boolean> {
  const organised = await ctx.db
    .query("events")
    .withIndex("by_network_organizer_startAt", (q) => q.eq("networkId", networkId).eq("organizerPersonId", personId).lte("startAt", now))
    .order("desc")
    .take(EVENTS_SCAN)
  for (const event of organised) {
    if (event.organizerPageId && !(await pageEventAccess(ctx, event, personId))) continue
    if (event.status !== "cancelled" && event.startAt <= now && now < event.endAt) return true
  }
  const invited = await ctx.db
    .query("eventParticipants")
    .withIndex("by_network_person_eventStartAt", (q) => q.eq("networkId", networkId).eq("personId", personId).lte("eventStartAt", now))
    .order("desc")
    .take(EVENTS_SCAN)
  for (const participation of invited) {
    if (participation.status !== "accepted") continue
    const event = await ctx.db.get(participation.eventId)
    if (event?.organizerPageId && !(await pageEventAccess(ctx, event, personId))) continue
    if (event && event.status !== "cancelled" && event.startAt <= now && now < event.endAt) return true
  }
  return false
}

export interface CallAdmissionContext {
  decision: AdmissionDecision
  /** L'appelé accepte-t-il un message vocal ? Défaut `true`. */
  voicemailEnabled: boolean
  /**
   * L'appelé tenait DÉJÀ une communication quand l'appel a été ADMIS (appel en
   * attente par défaut). Photographié sur l'appel : l'appelant entend la
   * tonalité « occupé » pendant la sonnerie. Exclusif du refus `busy`.
   */
  calleeEngaged: boolean
}

/**
 * Cet appel doit-il sonner chez l'appelé ? Rassemble, puis délègue au décideur
 * pur. Le lien entre l'appelant et l'appelé n'est lu que si l'appelé a choisi de
 * ne prendre que ses relations ; l'agenda, que si le silence de réunion est actif.
 *
 * `viaGroupThread` : l'appel part d'un fil de groupe dont l'appelé est membre —
 * le fil vaut consentement, le réglage « hors de mes relations » ne s'y applique
 * pas (on ne choisit pas qui, dans son groupe, lance l'appel du groupe).
 *
 * `viaContextualConsent` (CC-4, D5 amendé option (a)) : l'appel part d'une
 * conversation contextuelle où l'appelé a donné son accord EXPLICITE, dans ce
 * fil — cet accord vaut admission pour ce seul fil, au-dessus du réglage « hors
 * de mes relations : silencieux ». « Ne pas déranger », le silence de réunion,
 * l'occupation et l'absence connue restent appliqués.
 */
export async function evaluateCallAdmission(
  ctx: ReadCtx,
  args: { networkId: Id<"networks">; calleePersonId: Id<"persons">; callerPersonId: Id<"persons">; now: number; viaGroupThread?: boolean; viaContextualConsent?: boolean },
): Promise<CallAdmissionContext> {
  const prefs = await ctx.db
    .query("callPreferences")
    .withIndex("by_person", (q) => q.eq("personId", args.calleePersonId))
    .unique()
  const silent = prefs?.outsideRelationsCalls === "silent" && args.viaGroupThread !== true && args.viaContextualConsent !== true
  const callerIsRelation = silent ? await isConnectedTo(ctx, args.networkId, args.calleePersonId, args.callerPersonId) : null
  const inMeeting = prefs?.autoMeetingDnd?.enabled === true ? await isInAcceptedEvent(ctx, args.networkId, args.calleePersonId, args.now) : false
  const calleeActiveCallCount = await countLiveCalls(ctx, args.networkId, args.calleePersonId)
  const calleeKnownOffline = await isCalleeKnownOffline(ctx, args.networkId, args.calleePersonId, args.now)

  const decision = decideCallAdmission({
    now: args.now,
    prefs: prefs === null ? null : { dnd: prefs.dnd ?? null, callWaiting: prefs.callWaiting, autoMeetingDnd: prefs.autoMeetingDnd ?? null },
    calleeActiveCallCount,
    inMeeting,
    calleeKnownOffline,
    strangerPolicy: { silent, callerIsRelation },
  })
  return { decision, voicemailEnabled: prefs?.voicemailEnabled !== false, calleeEngaged: calleeActiveCallCount > 0 }
}

/** L'appelé accepte-t-il un message vocal ? Défaut `true` : qui coupe ses appels a d'autant plus besoin qu'on puisse lui laisser un mot. */
export async function voicemailEnabledFor(ctx: ReadCtx, personId: Id<"persons">): Promise<boolean> {
  const prefs = await ctx.db
    .query("callPreferences")
    .withIndex("by_person", (q) => q.eq("personId", personId))
    .unique()
  return prefs?.voicemailEnabled !== false
}

/**
 * Inscrit un appel REFUSÉ AVANT D'AVOIR SONNÉ : créé déjà terminé, ses deux
 * lignes déjà closes (personne n'est jamais entré dans la salle). Sans cette
 * trace, l'appelé ne saurait jamais qu'on a cherché à le joindre pendant son
 * silence — et l'appelant n'aurait rien à relire.
 */
export async function insertRefusedCall(
  ctx: MutationCtx,
  args: { networkId: Id<"networks">; callerId: Id<"persons">; calleeId: Id<"persons">; roomName: string; mediaType: CallMediaType; reason: CallAdmissionReason; now: number; commercialThreadId?: Id<"commercialThreads">; contextualThreadId?: Id<"contextualThreads"> },
): Promise<Id<"calls">> {
  const callId = await ctx.db.insert("calls", {
    networkId: args.networkId,
    kind: "direct",
    status: "ended",
    // « Hors ligne » est un MANQUÉ, pas un refus : il n'y avait personne. Toutes
    // les autres raisons sont des refus AUTOMATIQUES, écartés en le disant.
    callStatus: args.reason === "offline" ? "missed" : "declined",
    endReason: args.reason,
    roomName: args.roomName,
    createdByPersonId: args.callerId,
    calleePersonId: args.calleeId,
    mediaType: args.mediaType,
    maxParticipants: 2,
    startedAt: args.now,
    endedAt: args.now,
    ...(args.commercialThreadId ? { commercialThreadId: args.commercialThreadId } : {}),
    // CC-4 : le refus d'un appel contextuel reste au journal de la conversation (jamais les deux contextes : la porte d'appel refuse le conflit).
    ...(args.contextualThreadId ? { contextualThreadId: args.contextualThreadId } : {}),
  })
  await ctx.db.insert("callParticipants", { networkId: args.networkId, callId, personId: args.callerId, role: "host", leftAt: args.now })
  await ctx.db.insert("callParticipants", { networkId: args.networkId, callId, personId: args.calleeId, role: "participant", leftAt: args.now })
  await notifyAutoDeclined(ctx, { networkId: args.networkId, calleeId: args.calleeId, callerId: args.callerId, reason: args.reason, callId })
  return callId
}

/**
 * Prévient l'appelé qu'un appel a été écarté par ses réglages, ou n'a pu sonner
 * nulle part. ⚠️ PAS pour « hors de mes relations » : le réglage dit « je ne
 * prends que mes relations », notifier chaque inconnu l'annulerait — l'appel
 * figure au journal des deux côtés, c'est ce qui était demandé. La porte unique
 * de la cloche écarte d'elle-même un appelant bloqué et un non-membre ; le genre
 * et le sujet suffisent à l'écran, qui relit la raison sur l'appel.
 */
async function notifyAutoDeclined(
  ctx: MutationCtx,
  args: { networkId: Id<"networks">; calleeId: Id<"persons">; callerId: Id<"persons">; reason: CallAdmissionReason; callId: Id<"calls"> },
): Promise<void> {
  if (args.reason === "outside_relations") return
  await notifyPerson(ctx, { networkId: args.networkId, recipientPersonId: args.calleeId, actorPersonId: args.callerId, kind: "call_missed", subject: { call: args.callId } })
}
