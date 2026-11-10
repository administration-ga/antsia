// Dupliqué de socle/convex/lib/notify.ts (avec socle/convex/modules/reseauPersonnel/notifications.ts, l. 128-253) @ ad2e7fdc2 — adaptations : la porte UNIQUE d'écriture de la cloche sociale du moteur (`notifyPerson`, `resolveNotifications`) ; personnes et réseaux ; aucun titre ni corps ni lien stocké (l'écran traduit le genre et route le sujet) ; deux gardes ajoutées à la porte : jamais un non-membre du réseau, jamais à travers un blocage ; acteur facultatif pour les avis du système ; sujet « session de direct » (`liveSession`) ajouté avec le module `live` (lot 16).
/**
 * LA porte d'écriture de la cloche sociale.
 *
 *  1. Jamais soi-même : quand l'acteur est le destinataire, rien n'est écrit.
 *  2. Jamais à travers un BLOCAGE, jamais à un NON-MEMBRE du réseau : la cloche
 *     ne fait pas sonner ce que la personne ne pourrait pas lire.
 *  3. Dédoublonnage par `genre|sujet|acteur` : la ligne existante est
 *     RAFRAÎCHIE (date, non-lu rouvert, résolution effacée), jamais empilée.
 *  4. Dans la transaction de l'appelant : un geste annulé n'a pas de notification
 *     orpheline. Les diffusions larges passent par `fanout.ts` (lots chaînés).
 */
import {
  type NotificationKind,
  notificationDedupKey,
  type NotificationResolution,
  notificationResolutionPrefix,
  type NotificationSubject,
} from "@antsia/social-domain/notifications"
import { type CommerceNotificationKind, isCommerceNotificationKind } from "@antsia/social-domain/commerceNotifications"
import { isContextualNotificationKind } from "@antsia/social-domain/contextualMessaging"
import type { Infer } from "convex/values"

import type { Doc, Id } from "../../_generated/dataModel"
import type { MutationCtx } from "../../_generated/server"
import { isActiveMember } from "../../lib/access"
import { canReadCommercialThread } from "../commercialMessaging/access"
import { canReadContextualThread } from "../contextualMessaging/access"
import { isBlockedBetween } from "../graph/graph"
import { pageEventReminderVisible } from "../events/pageEventReminderAccess"
import { serviceNoticeAdmission } from "../diaspora/serviceNotifications"
import { communityNoticeAdmission } from "../diaspora/communityNotifications"
import { commerceNoticeAdmission } from "./commerceAccess"
import { enqueueNotificationPush } from "./deliveries"
import { isReporterNoticeKind, moderationNoticeRecipient, reporterNoticeRecipient } from "./policy"
import type { notificationSubjectValidator } from "./tables"
import { type DiasporaCommunityNotificationKind, type DiasporaServiceNotificationKind, isDiasporaCommunityNotificationKind, isDiasporaServiceNotificationKind } from "./tables"

export type NotificationSubjectRef = Infer<typeof notificationSubjectValidator>

/** La forme générique (`{ kind, id }`) d'une référence typée. */
export function subjectOf(ref: NotificationSubjectRef | undefined): NotificationSubject | null {
  if (!ref) return null
  if ("post" in ref) return { kind: "post", id: ref.post }
  if ("connection" in ref) return { kind: "connection", id: ref.connection }
  if ("thematicGroup" in ref) return { kind: "thematicGroup", id: ref.thematicGroup }
  if ("commercialThread" in ref) return { kind: "commercialThread", id: ref.commercialThread }
  if ("contextualThread" in ref) return { kind: "contextualThread", id: ref.contextualThread }
  if ("groupThread" in ref) return { kind: "groupThread", id: ref.groupThread }
  if ("event" in ref) return { kind: "event", id: ref.event }
  if ("album" in ref) return { kind: "album", id: ref.album }
  if ("call" in ref) return { kind: "call", id: ref.call }
  if ("voicemail" in ref) return { kind: "voicemail", id: ref.voicemail }
  if ("liveSession" in ref) return { kind: "liveSession", id: ref.liveSession }
  if ("report" in ref) return { kind: "report", id: ref.report }
  // Sujets de la tranche `diaspora` : aucune forme générique au domaine commun ; la cloche les projette à part (`serviceNotice`).
  if ("serviceRequest" in ref || "associationMembership" in ref || "serviceReview" in ref) return null
  // Vie communautaire `diaspora` : projetée à part par la cloche (`communityNotice`).
  if ("aidQuestion" in ref || "aidAnswer" in ref || "aidMission" in ref || "mentoringRequest" in ref || "jobApplication" in ref || "kitResource" in ref) return null
  // P14B : sujets commerce (demande privée P14, candidature P15) — la destination TYPÉE est rendue à part (`targets.ts`).
  if ("commerceServiceRequest" in ref || "commerceApplication" in ref) return null
  return { kind: "fileScan", id: ref.fileScan }
}

/** Les colonnes de sujet d'une ligne, depuis une référence typée. */
function subjectColumns(ref: NotificationSubjectRef | undefined): Partial<Doc<"notifications">> {
  if (!ref) return {}
  if ("post" in ref) return { subjectPostId: ref.post }
  if ("connection" in ref) return { subjectConnectionId: ref.connection }
  if ("thematicGroup" in ref) return { subjectThematicGroupId: ref.thematicGroup }
  if ("commercialThread" in ref) return { subjectCommercialThreadId: ref.commercialThread }
  if ("contextualThread" in ref) return { subjectContextualThreadId: ref.contextualThread }
  if ("groupThread" in ref) return { subjectGroupThreadId: ref.groupThread }
  if ("event" in ref) return { subjectEventId: ref.event }
  if ("album" in ref) return { subjectAlbumId: ref.album }
  if ("call" in ref) return { subjectCallId: ref.call }
  if ("voicemail" in ref) return { subjectVoicemailId: ref.voicemail }
  if ("liveSession" in ref) return { subjectLiveSessionId: ref.liveSession }
  if ("report" in ref) return { subjectReportId: ref.report }
  if ("serviceRequest" in ref) return { subjectServiceRequestId: ref.serviceRequest }
  if ("associationMembership" in ref) return { subjectAssociationMembershipId: ref.associationMembership }
  if ("serviceReview" in ref) return { subjectServiceReviewId: ref.serviceReview }
  if ("aidQuestion" in ref) return { subjectAidQuestionId: ref.aidQuestion }
  if ("aidAnswer" in ref) return { subjectAidAnswerId: ref.aidAnswer }
  if ("aidMission" in ref) return { subjectAidMissionId: ref.aidMission }
  if ("mentoringRequest" in ref) return { subjectMentoringRequestId: ref.mentoringRequest }
  if ("jobApplication" in ref) return { subjectJobApplicationId: ref.jobApplication }
  if ("kitResource" in ref) return { subjectKitResourceId: ref.kitResource }
  if ("commerceServiceRequest" in ref) return { subjectCommerceServiceRequestId: ref.commerceServiceRequest }
  if ("commerceApplication" in ref) return { subjectCommerceApplicationId: ref.commerceApplication }
  return { subjectFileScanId: ref.fileScan }
}

/** La référence typée d'une ligne, ou `undefined`. */
export function subjectRefOf(row: Doc<"notifications">): NotificationSubjectRef | undefined {
  if (row.subjectPostId) return { post: row.subjectPostId }
  if (row.subjectConnectionId) return { connection: row.subjectConnectionId }
  if (row.subjectFileScanId) return { fileScan: row.subjectFileScanId }
  if (row.subjectThematicGroupId) return { thematicGroup: row.subjectThematicGroupId }
  if (row.subjectCommercialThreadId) return { commercialThread: row.subjectCommercialThreadId }
  if (row.subjectContextualThreadId) return { contextualThread: row.subjectContextualThreadId }
  if (row.subjectGroupThreadId) return { groupThread: row.subjectGroupThreadId }
  if (row.subjectEventId) return { event: row.subjectEventId }
  if (row.subjectAlbumId) return { album: row.subjectAlbumId }
  if (row.subjectCallId) return { call: row.subjectCallId }
  if (row.subjectVoicemailId) return { voicemail: row.subjectVoicemailId }
  if (row.subjectLiveSessionId) return { liveSession: row.subjectLiveSessionId }
  if (row.subjectReportId) return { report: row.subjectReportId }
  if (row.subjectServiceRequestId) return { serviceRequest: row.subjectServiceRequestId }
  if (row.subjectAssociationMembershipId) return { associationMembership: row.subjectAssociationMembershipId }
  if (row.subjectServiceReviewId) return { serviceReview: row.subjectServiceReviewId }
  if (row.subjectAidQuestionId) return { aidQuestion: row.subjectAidQuestionId }
  if (row.subjectAidAnswerId) return { aidAnswer: row.subjectAidAnswerId }
  if (row.subjectAidMissionId) return { aidMission: row.subjectAidMissionId }
  if (row.subjectMentoringRequestId) return { mentoringRequest: row.subjectMentoringRequestId }
  if (row.subjectJobApplicationId) return { jobApplication: row.subjectJobApplicationId }
  if (row.subjectKitResourceId) return { kitResource: row.subjectKitResourceId }
  if (row.subjectCommerceServiceRequestId) return { commerceServiceRequest: row.subjectCommerceServiceRequestId }
  if (row.subjectCommerceApplicationId) return { commerceApplication: row.subjectCommerceApplicationId }
  return undefined
}

export type NotifyInput = {
  networkId: Id<"networks">
  recipientPersonId: Id<"persons">
  /** L'auteur du geste ; absent pour un avis du système. */
  actorPersonId?: Id<"persons">
  kind: NotificationKind | DiasporaServiceNotificationKind | DiasporaCommunityNotificationKind | CommerceNotificationKind
  subject?: NotificationSubjectRef
  /**
   * Tranche `diaspora` seulement : l'auteur d'un geste que le SYSTÈME annonce (jamais
   * stocké ni montré). Il ne sert qu'aux refus « soi-même » et « blocage » ; ignoré
   * pour les autres genres.
   * P14B : même rôle pour les avis commerce (le client dont le geste est annoncé à l'équipe).
   */
  sourcePersonId?: Id<"persons">
  /**
   * P14B, avis commerce seulement : la transition CONFIRMÉE par PRO.GA que l'avis annonce
   * (référence ASCII bornée : objet, version ou révision) — part de la clé, jamais un texte.
   */
  commerceTransition?: string
  /**
   * P14B, avis commerce seulement : la personne dont la relecture a OBSERVÉ l'état. Quand
   * c'est le destinataire lui-même, l'avis s'écrit en trace déjà lue, sans transport.
   */
  observerPersonId?: Id<"persons">
}

/**
 * Émet (ou rafraîchit) une notification pour UNE personne. Rend l'identifiant de
 * la ligne écrite, `null` quand rien n'a été écrit (soi-même, blocage, non-membre).
 */
export async function notifyPerson(ctx: Pick<MutationCtx, "db"> & Partial<Pick<MutationCtx, "runQuery">>, input: NotifyInput): Promise<Id<"notifications"> | null> {
  // Tranche `diaspora` (mise en relation) : avis du système, gardé et dédoublonné à part.
  if (isDiasporaServiceNotificationKind(input.kind)) return await notifyDiasporaServiceRecipient(ctx, { ...input, kind: input.kind })
  // Tranche `diaspora` (vie communautaire) : mêmes règles, garde propre à la tranche.
  if (isDiasporaCommunityNotificationKind(input.kind)) return await notifyDiasporaCommunityRecipient(ctx, { ...input, kind: input.kind })
  // P14B : avis commerce (services P14, candidatures P15) — avis du système, gardé et dédoublonné à part.
  if (isCommerceNotificationKind(input.kind)) return await notifyCommerceRecipient(ctx, { ...input, kind: input.kind })
  if (input.kind === "commercial_contact" && (!input.subject || !("commercialThread" in input.subject) || !await canReadCommercialThread(ctx, input.networkId, input.recipientPersonId, input.subject.commercialThread))) return null
  // CC-2b : un avis contextuel désigne un fil que le destinataire lit ENCORE (relecture complète, à l'émission).
  if (isContextualNotificationKind(input.kind) && (!input.subject || !("contextualThread" in input.subject) || !await canReadContextualThread(ctx, input.networkId, input.recipientPersonId, input.subject.contextualThread))) return null
  if (input.kind === "association_event_reminder" && (input.actorPersonId !== undefined || !input.subject || !("event" in input.subject) || !(await pageEventReminderVisible(ctx, input.networkId, input.subject.event, input.recipientPersonId)))) return null
  const moderationNotice = input.kind === "moderation_decision"
  if (moderationNotice && (!input.subject || !("report" in input.subject) || input.actorPersonId !== undefined || !(await moderationNoticeRecipient(ctx, input.networkId, input.recipientPersonId, input.subject.report)))) return null
  // SU01d : l'accusé de réception et la décision vont au seul DÉCLARANT du dossier, sans acteur (le modérateur ne se nomme pas).
  const reporterNotice = isReporterNoticeKind(input.kind)
  if (reporterNotice && (!input.subject || !("report" in input.subject) || input.actorPersonId !== undefined || !(await reporterNoticeRecipient(ctx, input.networkId, input.recipientPersonId, input.subject.report)))) return null
  if (input.actorPersonId !== undefined) {
    if (input.actorPersonId === input.recipientPersonId) return null
    if (await isBlockedBetween(ctx, input.actorPersonId, input.recipientPersonId)) return null
  }
  if (!moderationNotice && !reporterNotice && !(await isActiveMember(ctx, input.networkId, input.recipientPersonId))) return null
  const dedupKey = notificationDedupKey(input.kind, subjectOf(input.subject), input.actorPersonId ?? null)
  const now = Date.now()
  const existing = await ctx.db
    .query("notifications")
    .withIndex("by_network_recipient_dedupKey", (q) => q.eq("networkId", input.networkId).eq("recipientPersonId", input.recipientPersonId).eq("dedupKey", dedupKey))
    .unique()
  if (existing) {
    // Un rappel personnel n'est ni rouvert ni redistribué lors d'un rejeu.
    if (input.kind === "association_event_reminder") return existing._id
    // REMPLACE : date rafraîchie, non-lu rouvert, résolution EFFACÉE — une invitation rouverte est neuve.
    await ctx.db.patch(existing._id, { createdAt: now, readAt: undefined, resolvedAt: undefined, resolution: undefined })
    return existing._id
  }
  const notificationId = await ctx.db.insert("notifications", {
    networkId: input.networkId,
    recipientPersonId: input.recipientPersonId,
    ...(input.actorPersonId !== undefined ? { actorPersonId: input.actorPersonId } : {}),
    kind: input.kind,
    ...subjectColumns(input.subject),
    dedupKey,
    createdAt: now,
  })
  // La date de cloche peut être rafraîchie ; seul le PREMIER geste admet un push.
  // Le cron de vidange reprend cette file durable, même si le scheduler tombe.
  if (ctx.runQuery) await enqueueNotificationPush({ db: ctx.db, runQuery: ctx.runQuery }, notificationId)
  return notificationId
}

/**
 * Tranche `diaspora` (mise en relation, DG-010/015/016) — un avis du SYSTÈME : aucun
 * acteur stocké (le signataire qui parle pour une page n'est jamais montré au
 * demandeur), aucun contenu. Dans l'ordre :
 *  1. jamais un acteur, jamais sans sujet ;
 *  2. jamais à l'auteur du geste lui-même, jamais à travers un blocage avec lui ;
 *  3. la garde de la tranche (`serviceNoticeAdmission`) relit le destinataire et ses
 *     droits (demandeur, signataire VIVANT, responsable vivant, auteur de l'avis),
 *     l'adhésion au réseau, et l'état ÉCRIT que le genre annonce ;
 *  4. clé propre `genre|sujet:état:version|-` : un rejeu ne rouvre ni ne redistribue
 *     rien (une transition n'a lieu qu'une fois) ; seul le premier geste admet un push.
 */
async function notifyDiasporaServiceRecipient(
  ctx: Pick<MutationCtx, "db"> & Partial<Pick<MutationCtx, "runQuery">>,
  input: NotifyInput & { kind: DiasporaServiceNotificationKind },
): Promise<Id<"notifications"> | null> {
  if (input.actorPersonId !== undefined || !input.subject) return null
  const source = input.sourcePersonId
  if (source !== undefined && (source === input.recipientPersonId || (await isBlockedBetween(ctx, source, input.recipientPersonId)))) return null
  const admission = await serviceNoticeAdmission(ctx, input.networkId, input.recipientPersonId, input.kind, input.subject)
  if (admission === null) return null
  const dedupKey = `${input.kind}|${admission.reference}|-`
  const existing = await ctx.db
    .query("notifications")
    .withIndex("by_network_recipient_dedupKey", (q) => q.eq("networkId", input.networkId).eq("recipientPersonId", input.recipientPersonId).eq("dedupKey", dedupKey))
    .unique()
  if (existing) return existing._id
  const notificationId = await ctx.db.insert("notifications", {
    networkId: input.networkId,
    recipientPersonId: input.recipientPersonId,
    kind: input.kind,
    ...subjectColumns(input.subject),
    dedupKey,
    createdAt: Date.now(),
  })
  if (ctx.runQuery) await enqueueNotificationPush({ db: ctx.db, runQuery: ctx.runQuery }, notificationId)
  return notificationId
}

/**
 * Tranche `diaspora` (vie communautaire : entraide, mentorat, emploi, kit d'arrivée) — un avis du
 * SYSTÈME, exactement comme la mise en relation : jamais un acteur, jamais sans sujet ; jamais à
 * l'auteur du geste ni à travers un blocage avec lui ; la garde de la tranche
 * (`communityNoticeAdmission`) relit le destinataire, ses droits, le réseau et l'état ÉCRIT que le
 * genre annonce ; clé `genre|sujet:état|-` : un rejeu ne rouvre ni ne redistribue rien.
 */
async function notifyDiasporaCommunityRecipient(
  ctx: Pick<MutationCtx, "db"> & Partial<Pick<MutationCtx, "runQuery">>,
  input: NotifyInput & { kind: DiasporaCommunityNotificationKind },
): Promise<Id<"notifications"> | null> {
  if (input.actorPersonId !== undefined || !input.subject) return null
  const source = input.sourcePersonId
  if (source !== undefined && (source === input.recipientPersonId || (await isBlockedBetween(ctx, source, input.recipientPersonId)))) return null
  const admission = await communityNoticeAdmission(ctx, input.networkId, input.recipientPersonId, input.kind, input.subject)
  if (admission === null) return null
  const dedupKey = `${input.kind}|${admission.reference}|-`
  const existing = await ctx.db
    .query("notifications")
    .withIndex("by_network_recipient_dedupKey", (q) => q.eq("networkId", input.networkId).eq("recipientPersonId", input.recipientPersonId).eq("dedupKey", dedupKey))
    .unique()
  if (existing) return existing._id
  const notificationId = await ctx.db.insert("notifications", {
    networkId: input.networkId,
    recipientPersonId: input.recipientPersonId,
    kind: input.kind,
    ...subjectColumns(input.subject),
    dedupKey,
    createdAt: Date.now(),
  })
  if (ctx.runQuery) await enqueueNotificationPush({ db: ctx.db, runQuery: ctx.runQuery }, notificationId)
  return notificationId
}

/**
 * P14B (19/10/2026) — un avis COMMERCE (services P14, candidatures P15) : avis du SYSTÈME, sans
 * acteur ni contenu, émis seulement pour un état CONFIRMÉ par PRO.GA. Dans l'ordre :
 *  1. jamais un acteur, jamais sans sujet ni transition ;
 *  2. jamais à l'auteur du geste annoncé (`sourcePersonId`), jamais à travers un blocage avec lui ;
 *  3. la garde (`commerceNoticeAdmission`) relit le destinataire, son droit ACTUEL sur l'objet
 *     (client de la demande, mandataire vivant de la boutique, candidat) et l'état ÉCRIT que le
 *     genre annonce ;
 *  4. clé `genre|sujet:transition|-` : une transition ne s'annonce qu'une fois, un rejeu ne rouvre
 *     ni ne redistribue rien ;
 *  5. observé par le destinataire lui-même (sa propre relecture, dans sa session) : trace déjà LUE,
 *     sans transport — il voit l'état à l'écran ; sinon, la file de livraison habituelle
 *     (préférences, consentement, budget hebdomadaire et catégorie relus par `pushAllowed`).
 */
async function notifyCommerceRecipient(
  ctx: Pick<MutationCtx, "db"> & Partial<Pick<MutationCtx, "runQuery">>,
  input: NotifyInput & { kind: CommerceNotificationKind },
): Promise<Id<"notifications"> | null> {
  if (input.actorPersonId !== undefined || !input.subject || input.commerceTransition === undefined) return null
  const source = input.sourcePersonId
  if (source !== undefined && (source === input.recipientPersonId || (await isBlockedBetween(ctx, source, input.recipientPersonId)))) return null
  const admission = await commerceNoticeAdmission(ctx, input.networkId, input.recipientPersonId, input.kind, input.subject, input.commerceTransition)
  if (admission === null) return null
  const dedupKey = `${input.kind}|${admission.reference}|-`
  const existing = await ctx.db
    .query("notifications")
    .withIndex("by_network_recipient_dedupKey", (q) => q.eq("networkId", input.networkId).eq("recipientPersonId", input.recipientPersonId).eq("dedupKey", dedupKey))
    .unique()
  if (existing) return existing._id
  const now = Date.now()
  const observedByRecipient = input.observerPersonId !== undefined && input.observerPersonId === input.recipientPersonId
  const notificationId = await ctx.db.insert("notifications", {
    networkId: input.networkId,
    recipientPersonId: input.recipientPersonId,
    kind: input.kind,
    ...subjectColumns(input.subject),
    dedupKey,
    createdAt: now,
    ...(observedByRecipient ? { readAt: now } : {}),
  })
  if (!observedByRecipient && ctx.runQuery) await enqueueNotificationPush({ db: ctx.db, runQuery: ctx.runQuery }, notificationId)
  return notificationId
}

/** Lignes relues pour une résolution : deux invitants successifs font deux lignes, rarement plus. */
const RESOLVE_SCAN = 25

/**
 * RÉSOUT les notifications d'un destinataire pour un genre et un sujet, quel que
 * soit l'acteur — dans la transaction qui tranche (accepter, décliner, annuler,
 * expirer). Idempotent ; `readAt` n'est jamais écrasé (la première lecture est
 * un fait). N'émet rien : résoudre MA cloche n'est pas une nouvelle pour l'autre.
 */
export async function resolveNotifications(
  ctx: Pick<MutationCtx, "db">,
  input: { networkId: Id<"networks">; recipientPersonId: Id<"persons">; kind: NotificationKind; subject: NotificationSubjectRef; resolution: NotificationResolution; at?: number },
): Promise<{ resolved: number }> {
  const subject = subjectOf(input.subject)
  if (!subject) return { resolved: 0 }
  const prefix = notificationResolutionPrefix(input.kind, subject)
  // Plage de préfixe sur l'index : les clés sont ASCII, la borne `￿` est sûre.
  const rows = await ctx.db
    .query("notifications")
    .withIndex("by_network_recipient_dedupKey", (q) =>
      q.eq("networkId", input.networkId).eq("recipientPersonId", input.recipientPersonId).gte("dedupKey", prefix).lt("dedupKey", `${prefix}￿`),
    )
    .take(RESOLVE_SCAN)
  const at = input.at ?? Date.now()
  let resolved = 0
  for (const row of rows) {
    if (row.resolution === input.resolution) continue
    await ctx.db.patch(row._id, { resolution: input.resolution, resolvedAt: at, readAt: row.readAt ?? at })
    resolved += 1
  }
  return { resolved }
}

/**
 * RETIRE les notifications d'un destinataire pour un genre et un sujet qui
 * n'existe plus (un fil supprimé), quel que soit l'acteur. Bornée par `limit` :
 * `more` dit qu'il en reste, l'appelant poursuit dans sa transaction suivante.
 */
export async function dropNotificationsAbout(
  ctx: Pick<MutationCtx, "db">,
  input: { networkId: Id<"networks">; recipientPersonId: Id<"persons">; kind: NotificationKind; subject: NotificationSubjectRef; limit: number },
): Promise<{ dropped: number; more: boolean }> {
  const subject = subjectOf(input.subject)
  if (!subject) return { dropped: 0, more: false }
  const prefix = notificationResolutionPrefix(input.kind, subject)
  const rows = await ctx.db
    .query("notifications")
    .withIndex("by_network_recipient_dedupKey", (q) =>
      q.eq("networkId", input.networkId).eq("recipientPersonId", input.recipientPersonId).gte("dedupKey", prefix).lt("dedupKey", `${prefix}￿`),
    )
    .take(input.limit)
  for (const row of rows) await ctx.db.delete(row._id)
  return { dropped: rows.length, more: rows.length >= input.limit }
}
