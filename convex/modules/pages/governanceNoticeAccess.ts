/**
 * PG-01 — garde des avis de GOUVERNANCE d'une page : l'invitation à signer
 * (`page_signatory_invite`, sujet la page) et la revendication tranchée
 * (`page_claim_decided`, sujet la revendication). Aucun écrivain de cloche ici :
 * la porte unique `notify.ts` la lit sans cycle, comme la cloche (`policy.ts`)
 * et la destination typée (`targets.ts`).
 *
 * Réutilisée à l'écriture, avant tout transport et à l'ouverture d'un avis
 * poussé : une invitation déjà tranchée, retirée ou dont la page est retirée ne
 * fait plus rien sonner ; une décision ne regarde que SON demandeur, dans le
 * réseau de la revendication. La cible relit la page avec les droits du lecteur.
 */
import type { PageGovernanceNoticeKind } from "@antsia/social-domain/notifications"
import type { NotificationOpenTarget } from "@antsia/social-domain/notificationOpenTarget"

import type { Doc, Id } from "../../_generated/dataModel"
import type { QueryCtx } from "../../_generated/server"
import { isActiveMember } from "../../lib/access"
import type { NotificationSubjectRef } from "../notifications/notify"
import { readablePageOrNull, signatoryRowOf } from "./access"

type ReadCtx = Pick<QueryCtx, "db">

/** La personne reçoit-elle encore la cloche de ce réseau ? Membre active, sans effacement demandé. */
async function liveRecipient(ctx: ReadCtx, networkId: Id<"networks">, personId: Id<"persons">): Promise<boolean> {
  const person = await ctx.db.get(personId)
  return !!person && person.deletionRequestedAt === undefined && (await isActiveMember(ctx, networkId, personId))
}

/** L'invitation à signer de cette personne attend-elle ENCORE sa réponse, sur une page active de ce réseau ? */
async function invitationStillPending(ctx: ReadCtx, networkId: Id<"networks">, pageId: Id<"pages">, personId: Id<"persons">): Promise<boolean> {
  const page = await ctx.db.get(pageId)
  if (!page || page.networkId !== networkId || page.status !== "active") return false
  const row = await signatoryRowOf(ctx, page._id, personId)
  return row !== null && row.acceptedAt === undefined
}

/** La revendication TRANCHÉE de cette personne, dans ce réseau ; `null` sinon. */
async function decidedClaimOf(ctx: ReadCtx, networkId: Id<"networks">, claimId: Id<"pageClaims">, personId: Id<"persons">): Promise<Doc<"pageClaims"> | null> {
  const claim = await ctx.db.get(claimId)
  if (!claim || claim.networkId !== networkId || claim.claimantPersonId !== personId) return null
  return claim.status === "approved" || claim.status === "rejected" ? claim : null
}

/** L'avis d'un genre de gouvernance s'écrit-il pour ce destinataire et ce sujet ? (porte d'écriture) */
export async function pageGovernanceNoticeAdmitted(
  ctx: ReadCtx,
  networkId: Id<"networks">,
  recipientPersonId: Id<"persons">,
  kind: PageGovernanceNoticeKind,
  subject: NotificationSubjectRef | undefined,
): Promise<boolean> {
  if (!subject || !(await liveRecipient(ctx, networkId, recipientPersonId))) return false
  if (kind === "page_signatory_invite") return "page" in subject && (await invitationStillPending(ctx, networkId, subject.page, recipientPersonId))
  return "pageClaim" in subject && (await decidedClaimOf(ctx, networkId, subject.pageClaim, recipientPersonId)) !== null
}

/** La même relecture pour une ligne déjà écrite (transport, ouverture d'un avis poussé). */
export async function pageGovernanceNoticeVisible(ctx: ReadCtx, row: Doc<"notifications">): Promise<boolean> {
  if (row.actorPersonId !== undefined) return false
  if (row.kind === "page_signatory_invite") return row.subjectPageId !== undefined && (await pageGovernanceNoticeAdmitted(ctx, row.networkId, row.recipientPersonId, row.kind, { page: row.subjectPageId }))
  if (row.kind === "page_claim_decided") return row.subjectPageClaimId !== undefined && (await pageGovernanceNoticeAdmitted(ctx, row.networkId, row.recipientPersonId, row.kind, { pageClaim: row.subjectPageClaimId }))
  return false
}

/**
 * La destination d'un avis de gouvernance : la PAGE, si le destinataire la lit à l'instant
 * depuis le réseau de l'avis (invitation : la page désignée ; décision : la page de SA
 * revendication). `null` sinon — la ligne garde alors « Marquer lu ».
 */
export async function pageGovernanceTarget(ctx: ReadCtx, row: Doc<"notifications">): Promise<NotificationOpenTarget | null> {
  const network = await ctx.db.get(row.networkId)
  if (!network || network.status !== "active") return null
  let pageId: Id<"pages"> | null = null
  if (row.kind === "page_signatory_invite") pageId = row.subjectPageId ?? null
  else if (row.kind === "page_claim_decided" && row.subjectPageClaimId !== undefined) {
    const claim = await ctx.db.get(row.subjectPageClaimId)
    pageId = claim && claim.networkId === row.networkId && claim.claimantPersonId === row.recipientPersonId ? claim.pageId : null
  }
  if (pageId === null) return null
  const page = await readablePageOrNull(ctx, network, pageId, row.recipientPersonId)
  return page ? { kind: "page", pageId: page._id, pageHandle: page.handle } : null
}
