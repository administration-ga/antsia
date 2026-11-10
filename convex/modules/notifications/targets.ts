/**
 * P14B (19/10/2026) — la DESTINATION TYPÉE d'un avis, relue avec ses gardes pour la cloche
 * (`bell.paginateNotifications`) et pour l'ouverture d'une notification poussée
 * (`open.resolveOpenTarget`). Des références opaques seulement — jamais une URL, un contenu, un
 * motif, un montant ni un nom ; chaque application compose l'adresse sur SES routes et retombe sur
 * un repli neutre pour une nature qu'elle ne sert pas.
 *
 *  - avis commerce (P14/P15) : la demande du client, la fiche de candidature, ou la conversation
 *    commerciale que l'équipe habilitée lit déjà (`commerceNoticeView`) ;
 *  - `moderation_decision` : les décisions de la PAGE qui porte le contenu d'un dossier sans
 *    propriétaire personnel (P16), si le lecteur en est signataire VIVANT maintenant ; sa propre
 *    décision : ses décisions personnelles (« Mes données ») ;
 *  - `report_received`, `report_decided` (SU01d) : ses signalements (« Mes signalements »), pour
 *    le seul déclarant du dossier ;
 *  - mise en relation DIASPORALE (13 genres) : un sujet GÉNÉRIQUE — nature et référence opaque,
 *    public et adresse de page relus par la tranche (`serviceNoticeView`) — que l'application
 *    DIASPORALE route elle-même.
 * Aucun autre genre n'a de destination typée : `null`, et l'écran garde la cible de son sujet commun.
 */
import { isCommerceNotificationKind } from "@antsia/social-domain/commerceNotifications"
import { CONTEXTUAL_SUPPORTED_KINDS, CONTEXTUAL_SIDES, isContextualNotificationKind } from "@antsia/social-domain/contextualMessaging"
import { DIASPORA_COMMUNITY_NOTICE_AUDIENCES, DIASPORA_COMMUNITY_NOTICE_OPENS, DIASPORA_NOTICE_AUDIENCES, DIASPORA_NOTICE_SUBJECT_KINDS, type NotificationOpenTarget } from "@antsia/social-domain/notificationOpenTarget"
import { v } from "convex/values"

import type { Doc } from "../../_generated/dataModel"
import type { QueryCtx } from "../../_generated/server"
import { literals } from "../../lib/validators"
import { serviceNoticeView, type ServiceNoticeDto } from "../diaspora/serviceNotifications"
import { communityNoticeView, type CommunityNoticeDto } from "../diaspora/communityNotifications"
import { contextualNotificationTarget } from "../contextualMessaging/access"
import { owningPageOfReport } from "../moderation/policy"
import { liveSignatoryRole } from "../pages/access"
import { commerceNoticeView } from "./commerceAccess"
import { isReporterNoticeKind, reporterNoticeRecipient } from "./policy"
import { isDiasporaCommunityNotificationKind, isDiasporaServiceNotificationKind } from "./tables"

type ReadCtx = Pick<QueryCtx, "db">

/** La destination typée telle que la rend le moteur (`null` : aucune). */
export const notificationOpenTargetValidator = v.union(
  v.null(),
  v.object({ kind: v.literal("serviceRequest"), requestRowId: v.string() }),
  v.object({ kind: v.literal("commercialThread"), threadId: v.string() }),
  v.object({ kind: v.literal("jobApplication"), applicationId: v.string() }),
  v.object({ kind: v.literal("pageModerationDecisions"), pageId: v.string(), pageHandle: v.string() }),
  v.object({ kind: v.literal("personalDecisions") }),
  v.object({ kind: v.literal("personalReports") }),
  v.object({
    kind: v.literal("diasporaServiceNotice"),
    audience: literals(DIASPORA_NOTICE_AUDIENCES),
    subjectKind: literals(DIASPORA_NOTICE_SUBJECT_KINDS),
    subjectId: v.string(),
    requestId: v.union(v.string(), v.null()),
    pageHandle: v.union(v.string(), v.null()),
  }),
  // Avis de la vie communautaire DIASPORALE : public, objet ouvert et référence opaque, routés par DIASPORALE.
  v.object({
    kind: v.literal("diasporaCommunityNotice"),
    audience: literals(DIASPORA_COMMUNITY_NOTICE_AUDIENCES),
    opens: literals(DIASPORA_COMMUNITY_NOTICE_OPENS),
    objectId: v.string(),
    pageHandle: v.union(v.string(), v.null()),
  }),
  // CC-2b (ADR-0025) : une conversation contextuelle relue pour CE lecteur (partie actuelle), sujet
  // générique que l'application de la nature route elle-même — aucune route ANTSIA en V1.
  v.object({
    kind: v.literal("contextualThread"),
    threadId: v.string(),
    contextKind: literals(CONTEXTUAL_SUPPORTED_KINDS),
    objectId: v.string(),
    side: literals(CONTEXTUAL_SIDES),
    pageHandle: v.union(v.string(), v.null()),
  }),
)

/**
 * La page qui porte le contenu d'un dossier de modération SANS propriétaire personnel, si le
 * destinataire en est signataire VIVANT maintenant (dans le réseau de l'avis) ; `null` sinon —
 * ancien signataire, signataire suspendu, page retirée ou dossier personnel.
 */
export async function moderationDecisionPage(ctx: ReadCtx, row: Doc<"notifications">): Promise<Doc<"pages"> | null> {
  if (row.kind !== "moderation_decision" || row.subjectReportId === undefined) return null
  const report = await ctx.db.get(row.subjectReportId)
  if (!report || report.networkId !== row.networkId) return null
  const page = await owningPageOfReport(ctx, report)
  if (!page || page.networkId !== row.networkId) return null
  return (await liveSignatoryRole(ctx, page, row.recipientPersonId)) !== null ? page : null
}

/** Décision de modération : celles de la page (signataire vivant), ou ses décisions personnelles. */
async function moderationDecisionTarget(ctx: ReadCtx, row: Doc<"notifications">): Promise<NotificationOpenTarget | null> {
  if (row.subjectReportId === undefined) return null
  const report = await ctx.db.get(row.subjectReportId)
  if (!report || report.networkId !== row.networkId) return null
  if (report.ownerPersonId !== undefined) return report.ownerPersonId === row.recipientPersonId ? { kind: "personalDecisions" } : null
  const page = await moderationDecisionPage(ctx, row)
  return page === null ? null : { kind: "pageModerationDecisions", pageId: page._id, pageHandle: page.handle }
}

/**
 * Mise en relation DIASPORALE : le sujet GÉNÉRIQUE de la ligne, à partir de la projection RELUE par
 * la tranche (`serviceNoticeView`) ; `null` quand elle ne se lit plus. Module pur hors base.
 */
export function diasporaNoticeTarget(
  row: Pick<Doc<"notifications">, "subjectServiceRequestId" | "subjectAssociationMembershipId" | "subjectServiceReviewId">,
  view: ServiceNoticeDto | null,
): NotificationOpenTarget | null {
  if (view === null) return null
  const subject = row.subjectServiceRequestId !== undefined ? { subjectKind: "serviceRequest" as const, subjectId: row.subjectServiceRequestId as string }
    : row.subjectAssociationMembershipId !== undefined ? { subjectKind: "associationMembership" as const, subjectId: row.subjectAssociationMembershipId as string }
      : row.subjectServiceReviewId !== undefined ? { subjectKind: "serviceReview" as const, subjectId: row.subjectServiceReviewId as string }
        : null
  if (subject === null) return null
  return { kind: "diasporaServiceNotice", audience: view.audience, subjectKind: subject.subjectKind, subjectId: subject.subjectId, requestId: view.requestId, pageHandle: view.pageHandle }
}

/** Un avis communautaire DIASPORALE relu par la tranche (`communityNoticeView`) ; `null` quand il ne se lit plus. Module pur hors base. */
export function diasporaCommunityNoticeTarget(view: CommunityNoticeDto | null): NotificationOpenTarget | null {
  if (view === null) return null
  return { kind: "diasporaCommunityNotice", audience: view.audience, opens: view.opens, objectId: view.objectId, pageHandle: view.pageHandle }
}

/** La destination typée d'une ligne, relue MAINTENANT pour son destinataire ; `null` : aucune. */
export async function notificationOpenTargetOf(ctx: ReadCtx, row: Doc<"notifications">): Promise<NotificationOpenTarget | null> {
  if (isCommerceNotificationKind(row.kind)) return (await commerceNoticeView(ctx, row))?.target ?? null
  if (row.kind === "moderation_decision") return await moderationDecisionTarget(ctx, row)
  // SU01d : « Mes signalements », pour le déclarant du dossier seul (relu à l'instant).
  if (isReporterNoticeKind(row.kind)) return row.subjectReportId !== undefined && await reporterNoticeRecipient(ctx, row.networkId, row.recipientPersonId, row.subjectReportId) ? { kind: "personalReports" } : null
  if (isDiasporaServiceNotificationKind(row.kind)) return diasporaNoticeTarget(row, await serviceNoticeView(ctx, row))
  if (isDiasporaCommunityNotificationKind(row.kind)) return diasporaCommunityNoticeTarget(await communityNoticeView(ctx, row))
  // CC-2b : le fil contextuel RELU pour le destinataire (partie actuelle, sinon repli neutre `null`).
  if (isContextualNotificationKind(row.kind)) return await contextualNotificationTarget(ctx, row)
  return null
}
