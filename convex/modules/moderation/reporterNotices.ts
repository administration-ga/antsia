/**
 * SU01d (21/10/2026) — ordonnance n° 0011/PR/2026, art. 24, 32 et 33 : le délai légal d'un
 * signalement de lecteur, son accusé de réception et l'avis de décision, au DÉCLARANT seul.
 *
 *  1. Le délai se pose à la transmission, d'après le motif (`reportLegalBasis`) ; hors délai
 *     légal, le dossier reste dans la file ordinaire, sans échéance.
 *  2. L'accusé de réception part dans la transaction qui transmet : il ne peut pas manquer
 *     l'échéance de 24 h de l'article 24. Sa date n'est posée que si l'avis est écrit.
 *  3. L'avis de décision part dans la transaction qui tranche. Il ne dit que l'effet sur le
 *     contenu (« Mes signalements ») : ni la sanction, ni le motif écrit par la modération.
 *  4. Les deux avis vont dans la cloche du réseau où la personne a signalé
 *     (`reporterNetworkId`), qui peut différer du réseau du contenu.
 */
import { reportDecisionDueAt, reportLegalBasis } from "@antsia/social-domain/moderation"

import type { Doc, Id } from "../../_generated/dataModel"
import type { MutationCtx } from "../../_generated/server"
import { notifyPerson } from "../notifications/notify"

/** Les colonnes du délai légal d'un dossier transmis à `createdAt` ; aucune hors délai légal. */
export function legalDeadlineColumns(reason: string, createdAt: number): Partial<Pick<Doc<"reports">, "legalBasis" | "dueAt">> {
  const legalBasis = reportLegalBasis(reason)
  const dueAt = reportDecisionDueAt(reason, createdAt)
  return legalBasis === null || dueAt === null ? {} : { legalBasis, dueAt }
}

/** Le réseau de la cloche du déclarant : celui où il a signalé, sinon (dossier antérieur à SU01d) celui du contenu. */
export function reporterNoticeNetworkId(row: Pick<Doc<"reports">, "networkId" | "reporterNetworkId">): Id<"networks"> {
  return row.reporterNetworkId ?? row.networkId
}

/** L'accusé de réception d'un dossier qui vient d'être transmis. */
export async function acknowledgeReport(ctx: MutationCtx, reportId: Id<"reports">): Promise<void> {
  const row = await ctx.db.get(reportId)
  if (!row?.reporterPersonId) return
  const notificationId = await notifyPerson(ctx, { networkId: reporterNoticeNetworkId(row), recipientPersonId: row.reporterPersonId, kind: "report_received", subject: { report: row._id } })
  if (notificationId !== null) await ctx.db.patch(row._id, { acknowledgedAt: Date.now() })
}

/** L'avis de décision, une fois le dossier fermé ; un dossier sans déclarant (relecture préalable) n'émet rien. */
export async function notifyReporterOfDecision(ctx: MutationCtx, reportId: Id<"reports">): Promise<void> {
  const row = await ctx.db.get(reportId)
  if (!row?.reporterPersonId || (row.status !== "dismissed" && row.status !== "actioned")) return
  const notificationId = await notifyPerson(ctx, { networkId: reporterNoticeNetworkId(row), recipientPersonId: row.reporterPersonId, kind: "report_decided", subject: { report: row._id } })
  if (notificationId !== null) await ctx.db.patch(row._id, { reporterNotifiedAt: Date.now() })
}
