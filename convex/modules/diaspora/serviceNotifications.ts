/**
 * DIASPORALE — avis de MISE EN RELATION (DG-010, DG-015, DG-016 ; plan global §7.4).
 * PROPRIÉTAIRE : session DIASPORALE, chantier « notifications de mise en relation ».
 *
 * Un professionnel apprend qu'une demande lui arrive ; un demandeur, que la page lui
 * propose, décline, annule ou constate ; l'une ou l'autre partie, qu'un nouvel horaire est
 * proposé pour le rendez-vous, puis le proposant, qu'il est accepté (SV-03) ; une
 * association, qu'on veut la rejoindre ; une personne, ce que les responsables ont décidé ;
 * l'auteur d'un avis, que la page lui a répondu.
 *
 * - Écriture par la porte unique (`notifyPerson`), dans la transaction du geste et JUSTE
 *   APRÈS son écriture : un geste refusé n'émet rien. Ce module n'écrit jamais lui-même
 *   dans `notifications` (cliquet `notifications-writer`).
 * - Avis du SYSTÈME, sans acteur stocké : ni besoin, ni montant, ni créneau, ni nom. Le
 *   signataire qui parle pour la page n'est jamais montré au demandeur ; l'auteur du geste
 *   (`sourcePersonId`) ne sert qu'aux refus « soi-même » et « blocage » de la porte.
 * - Destinataire RELU à l'écriture (`serviceNoticeAdmission`), à la lecture de la cloche
 *   (`serviceNoticeView`) et avant tout transport (`serviceNoticeVisible`) : demandeur,
 *   signataire VIVANT de la page, responsable vivant de l'association, auteur de l'avis. Un
 *   rôle retiré, une suspension, une sortie du réseau ou un effacement demandé : rien n'est
 *   écrit, et une ligne déjà écrite ne se présente plus.
 * - Idempotence : la clé porte le sujet, son état ÉCRIT et sa version (proposition, ligne
 *   d'adhésion) ; un rejeu n'empile ni ne rouvre rien. Une proposition de nouvel horaire ne
 *   change ni l'état ni la version : sa clé porte en plus l'instant de la proposition
 *   (`reschedule.proposedAt`), et un nouvel accord fait une nouvelle version.
 * - Équipe : au plus `SERVICE_TEAM_NOTICE_MAX` signataires avisés par geste, administrateurs
 *   d'abord ; l'échéance passe par un job par demande, hors du lot d'expiration.
 * - Aucune fonction publique ici ; la seule fonction Convex est interne (le job d'échéance).
 */
import { isResponsibleRole, type ServiceRequestActor } from "@diasporale/domain"
import { v } from "convex/values"

import { internal } from "../../_generated/api"
import type { Doc, Id } from "../../_generated/dataModel"
import { internalMutation, type MutationCtx, type QueryCtx } from "../../_generated/server"
import { isActiveMember } from "../../lib/access"
import { isBlockedBetween } from "../graph/graph"
import { canReadModeratedContent, contentState } from "../moderation/policy"
import { type NotificationSubjectRef, notifyPerson } from "../notifications/notify"
import { type DiasporaServiceNotificationKind, isDiasporaServiceNotificationKind } from "../notifications/tables"
import { liveSignatoryRole, readablePageOrNull, signatoryRowsOf } from "../pages/access"
import { isDiasporaNetwork } from "./facts"
import { readableServiceReviewOrNull } from "./serviceReviews"

type ReadCtx = Pick<QueryCtx, "db">

/** Au plus autant de signataires avisés par geste (une page en compte au plus cinquante). */
export const SERVICE_TEAM_NOTICE_MAX = 20

/** À qui parle un avis : le demandeur, l'équipe de la page, les responsables d'une association, la personne. */
export const SERVICE_NOTICE_AUDIENCES = ["requester", "provider", "responsible", "member"] as const
export type ServiceNoticeAudience = (typeof SERVICE_NOTICE_AUDIENCES)[number]

/** Ce que la cloche projette d'un avis de la tranche : des références relues, jamais un contenu. */
export type ServiceNoticeDto = {
  audience: ServiceNoticeAudience
  /** La demande concernée (demandeur, équipe de la page, auteur d'un avis) ; `null` pour une adhésion. */
  requestId: Id<"serviceRequests"> | null
  /** L'adresse de la page concernée, si elle se lit encore pour ce lecteur ; `null` sinon. */
  pageHandle: string | null
}

/** Les sujets de la tranche, tels que la porte unique les stocke (références seules). */
export type ServiceNoticeSubject =
  | { serviceRequest: Id<"serviceRequests"> }
  | { associationMembership: Id<"associationMemberships"> }
  | { serviceReview: Id<"serviceReviews"> }

// ═══════════════════════════════════════════════════════════════
// Règles : quel état écrit chaque genre annonce, et qui peut le lire
// ═══════════════════════════════════════════════════════════════

type NoticeRule =
  | {
    readonly family: "request"
    readonly status: Doc<"serviceRequests">["status"]
    readonly requester: boolean
    readonly provider: boolean
    /** SV-03 : annonce une proposition de nouvel horaire EN ATTENTE ; la clé porte son instant. */
    readonly reschedule?: true
  }
  | { readonly family: "membership"; readonly status: Doc<"associationMemberships">["status"]; readonly audience: "responsible" | "member" }
  | { readonly family: "review" }

/** Chaque genre de la tranche a SA règle : un genre ajouté sans elle ne compile pas. */
const NOTICE_RULES: Readonly<Record<DiasporaServiceNotificationKind, NoticeRule>> = {
  service_request_received: { family: "request", status: "sent", requester: false, provider: true },
  service_proposal_received: { family: "request", status: "proposed", requester: true, provider: false },
  service_request_declined: { family: "request", status: "refused", requester: true, provider: false },
  service_proposal_accepted: { family: "request", status: "confirmed", requester: false, provider: true },
  service_request_cancelled: { family: "request", status: "cancelled", requester: true, provider: true },
  service_request_expired: { family: "request", status: "expired", requester: true, provider: true },
  service_booking_completed: { family: "request", status: "completed", requester: true, provider: false },
  service_booking_no_show: { family: "request", status: "no_show", requester: true, provider: false },
  // DG-015 : la personne qui demande conteste l'absence ; l'état écrit reste `no_show`.
  service_no_show_contested: { family: "request", status: "no_show", requester: false, provider: true },
  // SV-03 : l'AUTRE partie apprend qu'un nouvel horaire est proposé ; le PROPOSANT, qu'il est accepté. L'état reste `confirmed`.
  service_booking_reschedule_proposed: { family: "request", status: "confirmed", requester: true, provider: true, reschedule: true },
  service_booking_rescheduled: { family: "request", status: "confirmed", requester: true, provider: true },
  association_membership_requested: { family: "membership", status: "requested", audience: "responsible" },
  association_membership_accepted: { family: "membership", status: "accepted", audience: "member" },
  association_membership_declined: { family: "membership", status: "rejected", audience: "member" },
  association_membership_removed: { family: "membership", status: "removed", audience: "member" },
  service_review_replied: { family: "review" },
}

type RequestRule = Extract<NoticeRule, { family: "request" }>
type MembershipRule = Extract<NoticeRule, { family: "membership" }>

/** Les références d'un sujet, depuis l'émetteur ou depuis la ligne stockée. */
type SubjectIds = {
  readonly requestId?: Id<"serviceRequests"> | undefined
  readonly membershipId?: Id<"associationMemberships"> | undefined
  readonly reviewId?: Id<"serviceReviews"> | undefined
}

/** Ce qu'un avis désigne pour CE destinataire, relu maintenant. */
type NoticeTarget = {
  readonly audience: ServiceNoticeAudience
  readonly requestId: Id<"serviceRequests"> | null
  readonly pageHandle: string | null
  /** Le sujet, son état écrit et sa version : la part propre de la clé de dédoublonnage. */
  readonly reference: string
  /** L'état écrit relu ; `null` pour une réponse à un avis. */
  readonly status: string | null
  /** SV-03 : l'instant de la proposition de nouvel horaire en attente, pour un genre qui l'annonce. */
  readonly rescheduleProposedAt?: number
}

function idsOfSubject(subject: NotificationSubjectRef | undefined): SubjectIds | null {
  if (!subject) return null
  if ("serviceRequest" in subject) return { requestId: subject.serviceRequest }
  if ("associationMembership" in subject) return { membershipId: subject.associationMembership }
  if ("serviceReview" in subject) return { reviewId: subject.serviceReview }
  return null
}

function idsOfRow(row: Doc<"notifications">): SubjectIds {
  return { requestId: row.subjectServiceRequestId, membershipId: row.subjectAssociationMembershipId, reviewId: row.subjectServiceReviewId }
}

/** L'adresse d'une page lisible d'ici pour ce lecteur, ou `null` : jamais un lien vers une page retirée. */
async function readableHandle(ctx: ReadCtx, network: Doc<"networks">, pageId: Id<"pages">, readerPersonId: Id<"persons">): Promise<string | null> {
  const page = await readablePageOrNull(ctx, network, pageId, readerPersonId)
  return page && page.networkId === network._id ? page.handle : null
}

/**
 * Une demande de service : le DEMANDEUR (genres qui lui parlent), ou un signataire VIVANT
 * de la page (genres qui parlent à l'équipe) — mêmes gardes que les gestes de la demande.
 */
async function requestTarget(ctx: ReadCtx, network: Doc<"networks">, recipientPersonId: Id<"persons">, rule: RequestRule, requestId: Id<"serviceRequests">): Promise<NoticeTarget | null> {
  const request = await ctx.db.get(requestId)
  if (!request || request.networkId !== network._id) return null
  const base = `serviceRequest:${request._id}:${request.status}:${request.proposalVersion}`
  // SV-03 : une proposition de nouvel horaire ne change ni l'état ni la version ; son instant distingue deux propositions.
  const pending = rule.reschedule && request.bookingId ? (await ctx.db.get(request.bookingId))?.reschedule : undefined
  const reference = pending ? `${base}:reschedule:${pending.proposedAt}` : base
  const proposedAt = pending ? { rescheduleProposedAt: pending.proposedAt } : {}
  if (rule.requester && request.requesterPersonId === recipientPersonId) {
    return { audience: "requester", requestId: request._id, pageHandle: await readableHandle(ctx, network, request.pageId, recipientPersonId), reference, status: request.status, ...proposedAt }
  }
  if (!rule.provider) return null
  const page = await ctx.db.get(request.pageId)
  if (!page || page.networkId !== network._id || (await liveSignatoryRole(ctx, page, recipientPersonId)) === null) return null
  return { audience: "provider", requestId: request._id, pageHandle: await readableHandle(ctx, network, page._id, recipientPersonId), reference, status: request.status, ...proposedAt }
}

/**
 * Une adhésion associative : la PERSONNE pour une décision ; un responsable VIVANT de
 * l'association pour une demande, tant que la personne qui demande reste membre active.
 */
async function membershipTarget(ctx: ReadCtx, network: Doc<"networks">, recipientPersonId: Id<"persons">, rule: MembershipRule, membershipId: Id<"associationMemberships">): Promise<NoticeTarget | null> {
  const row = await ctx.db.get(membershipId)
  if (!row || row.networkId !== network._id) return null
  const page = await readablePageOrNull(ctx, network, row.pageId, recipientPersonId)
  if (!page || page.networkId !== network._id || page.ownerKind !== "association") return null
  const reference = `associationMembership:${row._id}:${row.status}:${row.version}`
  if (rule.audience === "member") {
    return row.personId === recipientPersonId ? { audience: "member", requestId: null, pageHandle: page.handle, reference, status: row.status } : null
  }
  if (row.personId === recipientPersonId || !isResponsibleRole(await liveSignatoryRole(ctx, page, recipientPersonId))) return null
  // La liste des demandes ne montre pas une personne sortie du réseau ou suspendue : l'avis non plus.
  if (!(await isActiveMember(ctx, network._id, row.personId))) return null
  return { audience: "responsible", requestId: null, pageHandle: page.handle, reference, status: row.status }
}

/**
 * La réponse de la page à un avis : pour son AUTEUR seulement, avis lisible (garde des
 * avis : demande, rendez-vous, proposition, offre, modération), réponse active PUBLIÉE et
 * lisible, aucun blocage avec le signataire qui l'a écrite.
 */
async function reviewReplyTarget(ctx: ReadCtx, network: Doc<"networks">, recipientPersonId: Id<"persons">, reviewId: Id<"serviceReviews">): Promise<NoticeTarget | null> {
  const review = await readableServiceReviewOrNull(ctx, network, reviewId, recipientPersonId)
  if (!review || review.authorPersonId !== recipientPersonId) return null
  const reply = await ctx.db.query("serviceReviewReplies").withIndex("by_review", (q) => q.eq("reviewId", review._id)).unique()
  if (!reply || reply.networkId !== network._id || reply.pageId !== review.pageId || reply.status !== "active") return null
  if (await isBlockedBetween(ctx, recipientPersonId, reply.authorPersonId)) return null
  // Une réponse en attente de modération ne se lit pas encore par l'auteur de l'avis : rien à annoncer.
  const state = await contentState(ctx, "serviceReviewReply", reply._id)
  if (!state || state.networkId !== network._id || state.status !== "published") return null
  if (!(await canReadModeratedContent(ctx, "serviceReviewReply", reply._id, recipientPersonId))) return null
  return {
    audience: "requester",
    requestId: review.requestId,
    pageHandle: await readableHandle(ctx, network, review.pageId, recipientPersonId),
    reference: `serviceReview:${review._id}`,
    status: null,
  }
}

/**
 * Ce qu'un avis de la tranche désigne pour son destinataire, ou `null` : réseau DIASPORALE
 * actif, personne présente (ni effacée ni en effacement), membre active du réseau, puis
 * les droits propres au sujet.
 */
async function noticeTarget(ctx: ReadCtx, networkId: Id<"networks">, recipientPersonId: Id<"persons">, kind: DiasporaServiceNotificationKind, ids: SubjectIds): Promise<NoticeTarget | null> {
  const network = await ctx.db.get(networkId)
  if (!isDiasporaNetwork(network)) return null
  const person = await ctx.db.get(recipientPersonId)
  if (!person || person.erasedAt !== undefined || person.deletionRequestedAt !== undefined) return null
  if (!(await isActiveMember(ctx, networkId, recipientPersonId))) return null
  const rule = NOTICE_RULES[kind]
  switch (rule.family) {
    case "request":
      return ids.requestId ? await requestTarget(ctx, network, recipientPersonId, rule, ids.requestId) : null
    case "membership":
      return ids.membershipId ? await membershipTarget(ctx, network, recipientPersonId, rule, ids.membershipId) : null
    case "review":
      return ids.reviewId ? await reviewReplyTarget(ctx, network, recipientPersonId, ids.reviewId) : null
  }
}

// ═══════════════════════════════════════════════════════════════
// Gardes lues par la porte unique, la cloche et les transports
// ═══════════════════════════════════════════════════════════════

/**
 * La garde d'ÉCRITURE (porte unique) : destinataire, droits, réseau — et l'état ÉCRIT que
 * le genre annonce (un rejeu tardif ou un appel décalé n'annonce rien). Rend la part
 * propre de la clé de dédoublonnage, ou `null` : rien n'est écrit.
 */
export async function serviceNoticeAdmission(
  ctx: ReadCtx,
  networkId: Id<"networks">,
  recipientPersonId: Id<"persons">,
  kind: DiasporaServiceNotificationKind,
  subject: NotificationSubjectRef | undefined,
): Promise<{ reference: string } | null> {
  const ids = idsOfSubject(subject)
  if (ids === null) return null
  const target = await noticeTarget(ctx, networkId, recipientPersonId, kind, ids)
  if (target === null) return null
  const rule = NOTICE_RULES[kind]
  if (rule.family !== "review" && rule.status !== target.status) return null
  // SV-03 : une proposition de nouvel horaire ne s'annonce que si elle attend encore l'accord.
  if (rule.family === "request" && rule.reschedule && target.rescheduleProposedAt === undefined) return null
  return { reference: target.reference }
}

/** La garde de LECTURE (cloche, ouverture d'un push, transports) : les droits du destinataire, relus maintenant. */
export async function serviceNoticeVisible(ctx: ReadCtx, row: Doc<"notifications">): Promise<boolean> {
  if (!isDiasporaServiceNotificationKind(row.kind) || row.actorPersonId !== undefined) return false
  return (await noticeTarget(ctx, row.networkId, row.recipientPersonId, row.kind, idsOfRow(row))) !== null
}

/** La projection de la cloche : à qui parle l'avis et ce qu'il désigne, ou `null` s'il ne se lit plus. */
export async function serviceNoticeView(ctx: ReadCtx, row: Doc<"notifications">): Promise<ServiceNoticeDto | null> {
  if (!isDiasporaServiceNotificationKind(row.kind) || row.actorPersonId !== undefined) return null
  const target = await noticeTarget(ctx, row.networkId, row.recipientPersonId, row.kind, idsOfRow(row))
  return target ? { audience: target.audience, requestId: target.requestId, pageHandle: target.pageHandle } : null
}

// ═══════════════════════════════════════════════════════════════
// Émission — appelée par les gestes, juste après leur écriture
// ═══════════════════════════════════════════════════════════════

type NoticeInput = {
  readonly networkId: Id<"networks">
  readonly recipientPersonId: Id<"persons">
  readonly kind: DiasporaServiceNotificationKind
  readonly subject: ServiceNoticeSubject
  /** L'auteur du geste : jamais avisé lui-même, jamais à travers un blocage ; jamais stocké. */
  readonly sourcePersonId?: Id<"persons">
}

/** Un avis à UNE personne, par la porte unique ; `true` quand une ligne existe (écrite, ou déjà là). */
async function notice(ctx: MutationCtx, input: NoticeInput): Promise<boolean> {
  const written = await notifyPerson(ctx, {
    networkId: input.networkId,
    recipientPersonId: input.recipientPersonId,
    kind: input.kind,
    subject: input.subject,
    ...(input.sourcePersonId !== undefined ? { sourcePersonId: input.sourcePersonId } : {}),
  })
  return written !== null
}

/**
 * L'ÉQUIPE d'une page : ses signataires ACCEPTÉS, administrateurs d'abord, chacun relu par
 * la porte (rôle vivant ou responsable, adhésion, blocage) ; au plus
 * `SERVICE_TEAM_NOTICE_MAX` avisés, jamais l'auteur du geste.
 */
async function noticeTeam(ctx: MutationCtx, input: Omit<NoticeInput, "recipientPersonId"> & { readonly pageId: Id<"pages"> }): Promise<number> {
  // Borné : au plus deux fois `PAGE_SIGNATORIES_MAX + 1` lignes (`signatoryRowsOf`).
  const rows = await signatoryRowsOf(ctx, input.pageId)
  const seen = new Set<Id<"persons">>()
  let notified = 0
  for (const row of rows) {
    if (notified >= SERVICE_TEAM_NOTICE_MAX) break
    if (row.acceptedAt === undefined || row.networkId !== input.networkId || row.personId === input.sourcePersonId || seen.has(row.personId)) continue
    seen.add(row.personId)
    const written = await notice(ctx, {
      networkId: input.networkId,
      recipientPersonId: row.personId,
      kind: input.kind,
      subject: input.subject,
      ...(input.sourcePersonId !== undefined ? { sourcePersonId: input.sourcePersonId } : {}),
    })
    if (written) notified += 1
  }
  return notified
}

/** Après l'envoi d'une demande (`createServiceRequest`) : l'équipe vivante de la page. */
export async function noticeServiceRequestSent(ctx: MutationCtx, requestId: Id<"serviceRequests">): Promise<void> {
  const request = await ctx.db.get(requestId)
  if (!request) return
  await noticeTeam(ctx, {
    networkId: request.networkId, pageId: request.pageId, kind: "service_request_received",
    subject: { serviceRequest: request._id }, sourcePersonId: request.requesterPersonId,
  })
}

/** Les gestes de la PAGE que le demandeur doit apprendre. */
export type ServicePageGestureNotice = "service_proposal_received" | "service_request_declined" | "service_booking_completed" | "service_booking_no_show"

/** Après un geste de la page (proposition ou nouvelle version, refus, réalisation, absence) : le demandeur. */
export async function noticeServicePageGesture(ctx: MutationCtx, requestId: Id<"serviceRequests">, kind: ServicePageGestureNotice, signatoryPersonId: Id<"persons">): Promise<void> {
  const request = await ctx.db.get(requestId)
  if (!request) return
  await notice(ctx, {
    networkId: request.networkId, recipientPersonId: request.requesterPersonId, kind,
    subject: { serviceRequest: request._id }, sourcePersonId: signatoryPersonId,
  })
}

/** Après l'accord du demandeur sur la proposition courante : l'équipe vivante de la page. */
export async function noticeServiceProposalAccepted(ctx: MutationCtx, requestId: Id<"serviceRequests">): Promise<void> {
  const request = await ctx.db.get(requestId)
  if (!request) return
  await noticeTeam(ctx, {
    networkId: request.networkId, pageId: request.pageId, kind: "service_proposal_accepted",
    subject: { serviceRequest: request._id }, sourcePersonId: request.requesterPersonId,
  })
}

/** Après une annulation : l'AUTRE partie — l'équipe quand le demandeur annule, le demandeur quand la page annule. */
export async function noticeServiceRequestCancelled(ctx: MutationCtx, requestId: Id<"serviceRequests">, by: ServiceRequestActor, authorPersonId: Id<"persons">): Promise<void> {
  const request = await ctx.db.get(requestId)
  if (!request) return
  const subject = { serviceRequest: request._id }
  if (by === "requester") {
    await noticeTeam(ctx, { networkId: request.networkId, pageId: request.pageId, kind: "service_request_cancelled", subject, sourcePersonId: authorPersonId })
    return
  }
  await notice(ctx, { networkId: request.networkId, recipientPersonId: request.requesterPersonId, kind: "service_request_cancelled", subject, sourcePersonId: authorPersonId })
}

/**
 * SV-03 — après une proposition de nouvel horaire : l'AUTRE partie, l'équipe vivante quand le
 * demandeur propose, le demandeur quand la page propose. Ni horaire, ni nom, ni lieu dans l'avis.
 */
export async function noticeServiceRescheduleProposed(ctx: MutationCtx, requestId: Id<"serviceRequests">, by: ServiceRequestActor, authorPersonId: Id<"persons">): Promise<void> {
  const request = await ctx.db.get(requestId)
  if (!request) return
  const subject = { serviceRequest: request._id }
  const kind = "service_booking_reschedule_proposed"
  if (by === "requester") {
    await noticeTeam(ctx, { networkId: request.networkId, pageId: request.pageId, kind, subject, sourcePersonId: authorPersonId })
    return
  }
  await notice(ctx, { networkId: request.networkId, recipientPersonId: request.requesterPersonId, kind, subject, sourcePersonId: authorPersonId })
}

/** SV-03 — après l'accord sur le nouvel horaire : le PROPOSANT, le demandeur ou l'équipe vivante de la page. */
export async function noticeServiceRescheduled(ctx: MutationCtx, requestId: Id<"serviceRequests">, proposedBy: ServiceRequestActor, authorPersonId: Id<"persons">): Promise<void> {
  const request = await ctx.db.get(requestId)
  if (!request) return
  const subject = { serviceRequest: request._id }
  const kind = "service_booking_rescheduled"
  if (proposedBy === "requester") {
    await notice(ctx, { networkId: request.networkId, recipientPersonId: request.requesterPersonId, kind, subject, sourcePersonId: authorPersonId })
    return
  }
  await noticeTeam(ctx, { networkId: request.networkId, pageId: request.pageId, kind, subject, sourcePersonId: authorPersonId })
}

/** Après la contestation d'une absence par le demandeur (DG-015) : l'équipe vivante de la page. */
export async function noticeServiceNoShowContested(ctx: MutationCtx, requestId: Id<"serviceRequests">): Promise<void> {
  const request = await ctx.db.get(requestId)
  if (!request || request.contestedAt === undefined) return
  await noticeTeam(ctx, {
    networkId: request.networkId, pageId: request.pageId, kind: "service_no_show_contested",
    subject: { serviceRequest: request._id }, sourcePersonId: request.requesterPersonId,
  })
}

/** Le passage d'expiration (`expireDueServiceRequests`) : un job par demande échue, hors du lot borné. */
export async function scheduleServiceRequestExpiredNotices(ctx: Pick<MutationCtx, "scheduler">, requestId: Id<"serviceRequests">): Promise<void> {
  await ctx.scheduler.runAfter(0, internal.modules.diaspora.serviceNotifications.deliverServiceRequestExpiredNotices, { requestId })
}

/**
 * Les avis d'échéance d'UNE demande : le demandeur, et l'équipe de la page quand elle
 * avait proposé (une demande restée sans réponse n'appelle plus rien d'elle). Rejouable :
 * la clé dédoublonne ; une demande qui n'est plus « échue » n'annonce rien.
 */
export const deliverServiceRequestExpiredNotices = internalMutation({
  args: { requestId: v.id("serviceRequests") },
  returns: v.null(),
  handler: async (ctx, { requestId }): Promise<null> => {
    const request = await ctx.db.get(requestId)
    if (!request || request.status !== "expired") return null
    const subject = { serviceRequest: request._id }
    await notice(ctx, { networkId: request.networkId, recipientPersonId: request.requesterPersonId, kind: "service_request_expired", subject })
    if (request.proposalVersion > 0) {
      await noticeTeam(ctx, { networkId: request.networkId, pageId: request.pageId, kind: "service_request_expired", subject })
    }
    return null
  },
})

/** Après une demande d'adhésion (`requestAssociationMembership`) : les responsables vivants de l'association. */
export async function noticeAssociationMembershipRequested(ctx: MutationCtx, membershipId: Id<"associationMemberships">): Promise<void> {
  const row = await ctx.db.get(membershipId)
  if (!row) return
  await noticeTeam(ctx, {
    networkId: row.networkId, pageId: row.pageId, kind: "association_membership_requested",
    subject: { associationMembership: row._id }, sourcePersonId: row.personId,
  })
}

/** La décision ÉCRITE sur la ligne d'adhésion, et le genre de l'avis à la personne. */
const DECISION_NOTICES = {
  accepted: "association_membership_accepted",
  rejected: "association_membership_declined",
  removed: "association_membership_removed",
} as const satisfies Partial<Record<Doc<"associationMemberships">["status"], DiasporaServiceNotificationKind>>

/** Après une décision des responsables (acceptation, refus, exclusion) : la personne concernée. */
export async function noticeAssociationMembershipDecided(ctx: MutationCtx, membershipId: Id<"associationMemberships">, responsiblePersonId: Id<"persons">): Promise<void> {
  const row = await ctx.db.get(membershipId)
  if (!row || (row.status !== "accepted" && row.status !== "rejected" && row.status !== "removed")) return
  await notice(ctx, {
    networkId: row.networkId, recipientPersonId: row.personId, kind: DECISION_NOTICES[row.status],
    subject: { associationMembership: row._id }, sourcePersonId: responsiblePersonId,
  })
}

/** Après la réponse de la page à un avis (création ou modification) : son auteur, une seule fois par réponse. */
export async function noticeServiceReviewReplied(ctx: MutationCtx, reviewId: Id<"serviceReviews">, signatoryPersonId: Id<"persons">): Promise<void> {
  const review = await ctx.db.get(reviewId)
  if (!review) return
  await notice(ctx, {
    networkId: review.networkId, recipientPersonId: review.authorPersonId, kind: "service_review_replied",
    subject: { serviceReview: review._id }, sourcePersonId: signatoryPersonId,
  })
}
