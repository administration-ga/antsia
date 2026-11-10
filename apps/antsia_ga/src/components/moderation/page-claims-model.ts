/**
 * PG-01 — règles PURES de la section « Revendications de pages » de l'écran de modération :
 * les états de la file, le formulaire de décision (motif obligatoire, mêmes bornes que le
 * moteur) et la lecture d'une pièce servie par la garde des fichiers.
 */
import { PAGE_CLAIM_DECISIONS, type PageClaimDecision } from "@antsia/social-domain/pages"
import { z } from "zod"

import { moderationReasonSchema } from "./moderation-model"

/** Les états qu'on parcourt dans la file : en attente d'abord, puis l'historique des décisions. */
export const PAGE_CLAIM_QUEUE_STATUSES = ["pending", "approved", "rejected"] as const
export type PageClaimQueueStatus = (typeof PAGE_CLAIM_QUEUE_STATUSES)[number]

export function isPageClaimQueueStatus(value: string): value is PageClaimQueueStatus {
  return (PAGE_CLAIM_QUEUE_STATUSES as readonly string[]).includes(value)
}

export type PageClaimDecisionForm = { decision: PageClaimDecision; reason: string }

/** Décision et motif : le motif borné comme toute décision de modération (3 à 500 caractères). */
export function pageClaimDecisionSchema(reasonMessage: string) {
  return z.object({ decision: z.enum(PAGE_CLAIM_DECISIONS), reason: moderationReasonSchema(reasonMessage) })
}

/** L'identifiant de la revendication garde son type (générique) : le module reste pur, sans l'API. */
export function pageClaimDecisionInput<ClaimId extends string>(claimId: ClaimId, value: PageClaimDecisionForm) {
  return { claimId, decision: value.decision, reason: value.reason.trim() }
}

/** Une pièce telle que la garde la sert : ouvrable, ou retenue avec sa raison. */
export type PageClaimEvidence = { url: string | null; withheld: "fileScanPending" | "fileScanUnavailable" | "fileQuarantined" | null }
export type PageClaimEvidenceView = { kind: "open"; url: string } | { kind: "withheld"; code: "fileScanPending" | "fileScanUnavailable" | "fileQuarantined" }

/** Une adresse sans retenue s'ouvre ; toute retenue (ou une adresse absente) se dit comme telle. */
export function pageClaimEvidenceView(entry: PageClaimEvidence): PageClaimEvidenceView {
  if (entry.withheld === null && entry.url !== null && entry.url.length > 0) return { kind: "open", url: entry.url }
  return { kind: "withheld", code: entry.withheld ?? "fileScanPending" }
}
