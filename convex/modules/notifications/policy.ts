/** PA5 — admission et relecture identiques avant le transport différé. */
import { notificationCategory } from "@antsia/social-domain/notificationDelivery"
import { COMMERCE_NOTIFICATION_CATEGORY, isCommerceNotificationKind } from "@antsia/social-domain/commerceNotifications"
import { isContextualNotificationKind } from "@antsia/social-domain/contextualMessaging"
import type { Doc, Id } from "../../_generated/dataModel"
import type { QueryCtx } from "../../_generated/server"
import { getMembership, isActiveMember, memberHasStatus } from "../../lib/access"
import { canReadCommercialThread } from "../commercialMessaging/access"
import { callConversationOf } from "../calls/conversation"
import { canParticipateConversationCall, conversationCallInJournal } from "../calls/conversationAccess"
import { canReadContextualThread } from "../contextualMessaging/access"
import { canSeeAlbum } from "../albums/access"
import { pageEventReminderVisible } from "../events/pageEventReminderAccess"
import { isBlockedBetween } from "../graph/graph"
import { liveMembershipOrNull } from "../groups/access"
import { directReplayAccessDecision, directSessionAccessDecision } from "../live/access"
import { canSeePostDoc } from "../posts/access"
import { owningPageOfReport } from "../moderation/policy"
import { liveSignatoryRole } from "../pages/access"
import { serviceNoticeVisible } from "../diaspora/serviceNotifications"
import { communityNoticeVisible } from "../diaspora/communityNotifications"
import { commerceNoticeVisible } from "./commerceAccess"
import { notificationConsent } from "./consent"
import { deliveryPreferences } from "./preferences"
import { isDiasporaCommunityNotificationKind, isDiasporaServiceNotificationKind } from "./tables"

type ReadCtx = Pick<QueryCtx, "db">

export { notificationConsent } from "./consent"

/**
 * Exception étroite : seule sa propre décision, aucun accès aux contenus du réseau. P16 : un
 * dossier SANS propriétaire personnel (contenu porté par une page) s'annonce aux signataires
 * VIVANTS de cette page, et à eux seuls (relu aussi à la livraison et à la lecture de la cloche).
 */
export async function moderationNoticeRecipient(ctx: ReadCtx, networkId: Id<"networks">, personId: Id<"persons">, reportId: Id<"reports">): Promise<boolean> {
  const report = await ctx.db.get(reportId)
  const network = await ctx.db.get(networkId)
  const member = await getMembership(ctx, networkId, personId)
  const person = await ctx.db.get(personId)
  if (!report || report.networkId !== networkId || !network || network.status !== "active" || !member || member.status === "partie" || !person || person.deletionRequestedAt !== undefined) return false
  if (report.ownerPersonId === personId) return true
  const page = await owningPageOfReport(ctx, report)
  return page !== null && (await liveSignatoryRole(ctx, page, personId)) !== null
}

/**
 * SU01d : l'accusé de réception et l'avis de décision ne regardent que le DÉCLARANT du dossier,
 * dans le réseau où il a signalé, même suspendu depuis ; jamais l'auteur, une page ni un tiers.
 */
export async function reporterNoticeRecipient(ctx: ReadCtx, networkId: Id<"networks">, personId: Id<"persons">, reportId: Id<"reports">): Promise<boolean> {
  const report = await ctx.db.get(reportId)
  const network = await ctx.db.get(networkId)
  const member = await getMembership(ctx, networkId, personId)
  const person = await ctx.db.get(personId)
  if (!report || report.reporterPersonId !== personId || (report.reporterNetworkId ?? report.networkId) !== networkId) return false
  return !!network && network.status === "active" && !!member && member.status !== "partie" && !!person && person.deletionRequestedAt === undefined
}

export function isReporterNoticeKind(kind: Doc<"notifications">["kind"]): kind is "report_received" | "report_decided" {
  return kind === "report_received" || kind === "report_decided"
}

export async function notificationStillVisible(ctx: ReadCtx, row: Doc<"notifications">): Promise<boolean> {
  // Tranche `diaspora` (mise en relation) : avis du système, relu avec sa garde (destinataire, droits, réseau).
  if (isDiasporaServiceNotificationKind(row.kind)) return row.actorPersonId === undefined && await serviceNoticeVisible(ctx, row)
  // Tranche `diaspora` (vie communautaire) : avis du système, relu avec sa garde.
  if (isDiasporaCommunityNotificationKind(row.kind)) return row.actorPersonId === undefined && await communityNoticeVisible(ctx, row)
  // P14B : avis commerce (services P14, candidatures P15) — droit ACTUEL du destinataire sur la demande ou la candidature.
  if (isCommerceNotificationKind(row.kind)) return row.actorPersonId === undefined && await commerceNoticeVisible(ctx, row)
  if (row.kind === "commercial_contact") return row.subjectCommercialThreadId !== undefined && await canReadCommercialThread(ctx, row.networkId, row.recipientPersonId, row.subjectCommercialThreadId)
  // CC-2b : relecture complète du fil contextuel pour le destinataire (cloche, transport, ouverture).
  if (isContextualNotificationKind(row.kind)) return row.subjectContextualThreadId !== undefined && await canReadContextualThread(ctx, row.networkId, row.recipientPersonId, row.subjectContextualThreadId)
  if (row.kind === "association_event_reminder") return row.actorPersonId === undefined && row.subjectEventId !== undefined && await pageEventReminderVisible(ctx, row.networkId, row.subjectEventId, row.recipientPersonId)
  if (row.kind === "moderation_decision") return row.subjectReportId !== undefined && await moderationNoticeRecipient(ctx, row.networkId, row.recipientPersonId, row.subjectReportId)
  if (isReporterNoticeKind(row.kind)) return row.actorPersonId === undefined && row.subjectReportId !== undefined && await reporterNoticeRecipient(ctx, row.networkId, row.recipientPersonId, row.subjectReportId)
  if (!(await isActiveMember(ctx, row.networkId, row.recipientPersonId))) return false
  const person = await ctx.db.get(row.recipientPersonId)
  if (!person || person.deletionRequestedAt !== undefined) return false
  if (row.actorPersonId && await isBlockedBetween(ctx, row.actorPersonId, row.recipientPersonId)) return false
  if (row.subjectCallId) {
    // CC-4 : l'avis d'un appel CONTEXTUEL (refus automatique) suit la lecture du fil ; un ancien
    // participant ne garde rien (§4.3). Les avis d'appel personnels et P10 restent inchangés.
    const call = await ctx.db.get(row.subjectCallId)
    if (call !== null && callConversationOf(call).kind === "contextual" && (await conversationCallInJournal(ctx, call, row.recipientPersonId)) !== true) return false
  }
  if (row.subjectPostId) {
    const post = await ctx.db.get(row.subjectPostId)
    const network = await ctx.db.get(row.networkId)
    return !!post && !!network && await canSeePostDoc(ctx, { personId: row.recipientPersonId, network }, post)
  }
  if (row.subjectAlbumId) {
    const album = await ctx.db.get(row.subjectAlbumId)
    return !!album && await canSeeAlbum(ctx, album, { personId: row.recipientPersonId, networkId: row.networkId })
  }
  if (row.subjectGroupThreadId) {
    const thread = await ctx.db.get(row.subjectGroupThreadId)
    return !!thread && thread.networkId === row.networkId && thread.deletingAt === undefined && !!await liveMembershipOrNull(ctx, thread._id, row.recipientPersonId)
  }
  if (row.subjectLiveSessionId) {
    const session = await ctx.db.get(row.subjectLiveSessionId)
    if (!session || session.networkId !== row.networkId) return false
    return row.kind === "live_replay_published" ? await directReplayAccessDecision(ctx, row.recipientPersonId, session) === "allowed" : await directSessionAccessDecision(ctx, row.recipientPersonId, session) === "allowed"
  }
  return true
}

/**
 * La catégorie de préférences d'une ligne de la cloche. Les avis de la tranche `diaspora`
 * n'ont pas de catégorie propre au domaine commun : `social`, celle que
 * `notificationCategory` donne à tout genre qu'il ne connaît pas (push, digest et file
 * de livraison restent ainsi d'accord).
 */
export function notificationRowCategory(kind: Doc<"notifications">["kind"]) {
  // P14B : avis commerce — catégorie existante « messages », comme le contact commercial P10.
  if (isCommerceNotificationKind(kind)) return COMMERCE_NOTIFICATION_CATEGORY
  return isDiasporaServiceNotificationKind(kind) || isDiasporaCommunityNotificationKind(kind) ? ("social" as const) : notificationCategory(kind)
}

export async function pushAllowed(ctx: ReadCtx, row: Doc<"notifications">): Promise<boolean> {
  // Tranche `diaspora` : même relecture, même consentement, même budget ; catégorie par la ligne.
  if (isDiasporaServiceNotificationKind(row.kind) || isDiasporaCommunityNotificationKind(row.kind)) {
    if (!(await notificationStillVisible(ctx, row)) || !(await notificationConsent(ctx, row.networkId, row.recipientPersonId, "notifications"))) return false
    const servicePrefs = await deliveryPreferences(ctx, row.networkId, row.recipientPersonId)
    return servicePrefs.weeklyLimit > 0 && servicePrefs.pushCategories[notificationRowCategory(row.kind)]
  }
  if (!(await notificationStillVisible(ctx, row)) || !(await notificationConsent(ctx, row.networkId, row.recipientPersonId, "notifications"))) return false
  const prefs = await deliveryPreferences(ctx, row.networkId, row.recipientPersonId)
  // P14B : catégorie par la ligne (avis commerce compris), comme la file et le digest.
  return prefs.weeklyLimit > 0 && prefs.pushCategories[notificationRowCategory(row.kind)]
}

export async function incomingCallAllowed(ctx: ReadCtx, networkId: Id<"networks">, personId: Id<"persons">, callId: Id<"calls">): Promise<boolean> {
  const call = await ctx.db.get(callId)
  if (!call || call.networkId !== networkId || call.status !== "active" || (call.kind === "direct" && call.callStatus !== "ringing") || !(await memberHasStatus(ctx, networkId, personId, "declaree"))) return false
  // CC-4 : le sélecteur unique — un appel de conversation (P10 ou contextuelle) ne sonne que si SA règle l'admet encore.
  if ((await canParticipateConversationCall(ctx, call, personId)) === false) return false
  if (await isBlockedBetween(ctx, call.createdByPersonId, personId)) return false
  const person = await ctx.db.get(personId)
  if (!person || person.deletionRequestedAt !== undefined) return false
  if (call.kind !== "direct") {
    const invite = await ctx.db.query("callInvites").withIndex("by_call_person", (q) => q.eq("callId", callId).eq("personId", personId)).unique()
    if (!invite || invite.status !== "ringing") return false
  } else if (call.calleePersonId !== personId) return false
  const prefs = await ctx.db.query("callPreferences").withIndex("by_person", (q) => q.eq("personId", personId)).unique()
  const delivery = await deliveryPreferences(ctx, networkId, personId)
  return prefs?.pushIncoming !== false && (!prefs?.dnd || prefs.dnd.until <= Date.now()) && delivery.weeklyLimit > 0 && delivery.pushCategories.calls && await notificationConsent(ctx, networkId, personId, "notifications")
}
