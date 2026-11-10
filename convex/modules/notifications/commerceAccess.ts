/**
 * P14B (19/10/2026) — GARDES des avis commerce (services P14, candidatures P15) : aucune écriture
 * ici (l'émission passe par `commerceEmit.ts` et la porte unique `notifyPerson`).
 *
 * Le destinataire est relu à l'écriture (`commerceNoticeAdmission`, avec l'état ÉCRIT que le genre
 * annonce), à la lecture de la cloche et avant tout transport (`commerceNoticeVisible`), et à
 * l'ouverture (`commerceNoticeView`) — jamais ce qui était vrai à l'envoi :
 *  - client : la demande est la SIENNE, dans CE réseau, non retirée ; adhésion `declaree` (celle
 *    de « Mes demandes ») ; personne ni effacée ni en effacement ;
 *  - équipe : mandataire VIVANT du contact commercial de la boutique (P10 : mandat accepté, non
 *    révoqué, lecture, signataire vivant, membre vivant des deux réseaux), jamais le client
 *    lui-même, jamais à travers un blocage avec lui, et plus rien quand le client s'efface ;
 *  - candidat : la candidature est la SIENNE, dans CE réseau ; adhésion active.
 * Un droit perdu (mandat retiré, sortie, suspension, effacement, demande purgée) ferme l'avis :
 * la cloche ne le présente plus, aucun transport ne part, l'ouverture retombe sur le repli neutre.
 */
import {
  COMMERCE_NOTICE_AUDIENCE,
  COMMERCE_ORDER_ACCEPTED_STATES,
  type CommerceNoticeAudience,
  type CommerceNotificationKind,
  isCommerceNoticeTransition,
  isCommerceNotificationKind,
} from "@antsia/social-domain/commerceNotifications"
import type { NotificationOpenTarget } from "@antsia/social-domain/notificationOpenTarget"

import type { Doc, Id } from "../../_generated/dataModel"
import type { QueryCtx } from "../../_generated/server"
import { isActiveMember, memberHasStatus } from "../../lib/access"
import { canReadCommercialThread, liveMandate } from "../commercialMessaging/access"
import { isBlockedBetween } from "../graph/graph"
import type { NotificationSubjectRef } from "./notify"

type ReadCtx = Pick<QueryCtx, "db">
type ServiceRow = Doc<"commerceServiceRequests">
type ApplicationRow = Doc<"commerceApplications">

/** L'objet d'un avis, pour CE destinataire, relu maintenant, avec la part « sujet » de la clé. */
type NoticeObject =
  | { readonly family: "service"; readonly audience: "client" | "team"; readonly request: ServiceRow; readonly reference: string }
  | { readonly family: "application"; readonly audience: "candidate"; readonly application: ApplicationRow; readonly reference: string }

type SubjectIds = {
  readonly requestId?: Id<"commerceServiceRequests"> | undefined
  readonly applicationId?: Id<"commerceApplications"> | undefined
}

function idsOfSubject(subject: NotificationSubjectRef | undefined): SubjectIds | null {
  if (!subject) return null
  if ("commerceServiceRequest" in subject) return { requestId: subject.commerceServiceRequest }
  if ("commerceApplication" in subject) return { applicationId: subject.commerceApplication }
  return null
}

function idsOfRow(row: Doc<"notifications">): SubjectIds {
  return { requestId: row.subjectCommerceServiceRequestId, applicationId: row.subjectCommerceApplicationId }
}

/** La personne existe et n'est ni effacée ni en cours d'effacement. */
async function livePerson(ctx: ReadCtx, personId: Id<"persons">): Promise<boolean> {
  const person = await ctx.db.get(personId)
  return person !== null && person.erasedAt === undefined && person.deletionRequestedAt === undefined
}

/** L'objet que désigne l'avis, avec le droit ACTUEL du destinataire ; `null` pour tout refus (indistinct). */
async function noticeObject(ctx: ReadCtx, networkId: Id<"networks">, recipientPersonId: Id<"persons">, kind: CommerceNotificationKind, ids: SubjectIds): Promise<NoticeObject | null> {
  if (!(await livePerson(ctx, recipientPersonId))) return null
  const audience: CommerceNoticeAudience = COMMERCE_NOTICE_AUDIENCE[kind]
  if (audience === "candidate") {
    if (ids.applicationId === undefined) return null
    const application = await ctx.db.get(ids.applicationId)
    if (!application || application.networkId !== networkId || application.personId !== recipientPersonId) return null
    if (!(await isActiveMember(ctx, networkId, recipientPersonId))) return null
    return { family: "application", audience: "candidate", application, reference: `commerceApplication:${application._id}` }
  }
  if (ids.requestId === undefined) return null
  const request = await ctx.db.get(ids.requestId)
  if (!request || request.networkId !== networkId || request.cancelledAt !== undefined) return null
  const reference = `commerceServiceRequest:${request._id}`
  if (audience === "client") {
    if (request.personId !== recipientPersonId || !(await memberHasStatus(ctx, networkId, recipientPersonId, "declaree"))) return null
    return { family: "service", audience: "client", request, reference }
  }
  // Équipe : jamais le client lui-même, jamais à travers un blocage ; un client en effacement n'est plus annoncé.
  if (request.personId === recipientPersonId || !(await livePerson(ctx, request.personId))) return null
  if (await isBlockedBetween(ctx, recipientPersonId, request.personId)) return null
  const shop = await ctx.db.get(request.shopId)
  if (!shop || (await liveMandate(ctx, shop, recipientPersonId, request.networkId)) === null) return null
  return { family: "service", audience: "team", request, reference }
}

/**
 * L'état ÉCRIT que chaque genre annonce, relu à l'écriture, et la transition qui doit le désigner
 * EXACTEMENT (référence PRO.GA, révision ou version de la ligne relue) : un rejeu décalé, un appel
 * hors propos ou une transition fabriquée n'annoncent rien.
 */
function stateHolds(kind: CommerceNotificationKind, object: NoticeObject, transition: string): boolean {
  if (object.family === "application") {
    const application = object.application
    return kind === "commerce_job_application_updated" && application.state === "submitted" && application.remoteState !== undefined &&
      transition === `application:r${application.remoteRevision ?? 0}`
  }
  const request = object.request
  const booking = request.booking
  const order = request.order
  const onBooking = (suffix: string) => booking !== undefined && transition === `booking:${booking.appointmentRef}:${suffix}`
  const revised = `r${booking?.revision ?? 0}`
  switch (kind) {
    // DP39 : l'admission de ce signal neutre vérifie sa preuve privée, pas un état de service.
    case "commerce_service_followup_updated":
      return false
    case "commerce_service_quote_received":
    case "commerce_service_quote_revised":
      return request.mode === "quote" && request.inquiryRef !== undefined && transition.startsWith("quote:")
    case "commerce_service_quote_accepted":
      return request.mode === "quote" && request.acceptedQuote !== undefined &&
        transition === `quote:${request.acceptedQuote.quoteRef}:v${request.acceptedQuote.quoteVersion}:accepted`
    case "commerce_service_booking_confirmed":
      return request.mode === "booking" && booking?.state === "confirmed" && onBooking(revised)
    case "commerce_service_booking_declined":
      return request.mode === "booking" && (
        (booking?.state === "cancelled_by_pro" && booking.cancellation === "professional" && onBooking(revised)) ||
        (request.reason === "change_declined" && transition.startsWith("booking:") && transition.endsWith(":declined")))
    case "commerce_service_booking_rescheduled":
      return request.mode === "booking" && (booking?.state === "requested" || booking?.state === "confirmed") && onBooking(revised)
    case "commerce_service_booking_cancelled":
      return request.mode === "booking" && booking?.state === "cancelled_by_pro" && booking.cancellation === "professional" && onBooking(revised)
    case "commerce_service_booking_held":
      return request.mode === "booking" && onBooking("held")
    case "commerce_service_booking_client_changed":
      return request.mode === "booking" && (onBooking("changed") ||
        (request.pendingReplacement !== undefined && transition === `booking:${request.pendingReplacement.appointmentRef}:changed`))
    case "commerce_service_booking_client_cancelled":
      return request.mode === "booking" && booking?.state === "cancelled_by_client" && onBooking("cancelled")
    case "commerce_service_order_accepted":
      return order !== undefined && COMMERCE_ORDER_ACCEPTED_STATES.includes(order.state) && transition === `order:${order.orderRef}:r${order.revision}`
    case "commerce_service_order_declined":
      return order !== undefined && order.state === "cancelled" && transition === `order:${order.orderRef}:r${order.revision}`
    case "commerce_job_application_updated":
      return false
  }
}

/**
 * Garde d'ÉCRITURE (porte unique) : droit du destinataire et état écrit ; rend la part propre de la
 * clé (`sujet:transition`), ou `null` — rien n'est alors écrit.
 */
export async function commerceNoticeAdmission(
  ctx: ReadCtx,
  networkId: Id<"networks">,
  recipientPersonId: Id<"persons">,
  kind: CommerceNotificationKind,
  subject: NotificationSubjectRef | undefined,
  transition: string,
): Promise<{ reference: string } | null> {
  const ids = idsOfSubject(subject)
  if (ids === null || !isCommerceNoticeTransition(transition)) return null
  const object = await noticeObject(ctx, networkId, recipientPersonId, kind, ids)
  if (object === null) return null
  if (kind === "commerce_service_followup_updated") {
    if (object.family !== "service" || object.audience !== "client") return null
    const proof = await ctx.db.query("commerceServiceFollowupNotices").withIndex("by_request_transition", (q) => q.eq("requestId", object.request._id).eq("transition", transition)).unique()
    if (!proof || proof.networkId !== networkId || proof.personId !== recipientPersonId) return null
  } else if (!stateHolds(kind, object, transition)) return null
  return { reference: `${object.reference}:${transition}` }
}

/** DP39 : droit actuel, avant la première écriture de la preuve du signal personnel. */
export async function serviceFollowupRecipientAllowed(ctx: ReadCtx, row: ServiceRow): Promise<boolean> {
  return (await noticeObject(ctx, row.networkId, row.personId, "commerce_service_followup_updated", { requestId: row._id })) !== null
}

/** Garde de LECTURE (cloche, transports, ouverture) : le droit ACTUEL du destinataire sur l'objet. */
export async function commerceNoticeVisible(ctx: ReadCtx, row: Doc<"notifications">): Promise<boolean> {
  if (!isCommerceNotificationKind(row.kind) || row.actorPersonId !== undefined) return false
  return (await noticeObject(ctx, row.networkId, row.recipientPersonId, row.kind, idsOfRow(row))) !== null
}

export type CommerceNoticeView = { audience: CommerceNoticeAudience; target: NotificationOpenTarget | null }

/**
 * La projection d'un avis commerce : à qui il parle et OÙ il mène (références relues), ou `null`
 * s'il ne se lit plus. L'équipe n'ouvre jamais la demande privée du client : seulement la
 * conversation commerciale qu'elle lit déjà (devis accepté), sinon aucune destination.
 */
export async function commerceNoticeView(ctx: ReadCtx, row: Doc<"notifications">): Promise<CommerceNoticeView | null> {
  if (!isCommerceNotificationKind(row.kind) || row.actorPersonId !== undefined) return null
  const object = await noticeObject(ctx, row.networkId, row.recipientPersonId, row.kind, idsOfRow(row))
  if (object === null) return null
  if (object.family === "application") return { audience: "candidate", target: { kind: "jobApplication", applicationId: object.application._id } }
  if (object.audience === "client") return { audience: "client", target: { kind: "serviceRequest", requestRowId: object.request.requestRowId } }
  const threadId = row.kind === "commerce_service_quote_accepted" ? object.request.threadId : undefined
  const readable = threadId !== undefined && (await canReadCommercialThread(ctx, object.request.networkId, row.recipientPersonId, threadId))
  return { audience: "team", target: readable && threadId !== undefined ? { kind: "commercialThread", threadId } : null }
}
