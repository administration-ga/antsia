/**
 * P14B (19/10/2026) — ÉMISSION des avis commerce par la porte unique (`notifyPerson`), appelée
 * JUSTE APRÈS l'écriture d'un état CONFIRMÉ par PRO.GA : réponse corrélée d'une commande,
 * relecture d'un rendez-vous, consultation d'une commande, liste des devis, suivi d'une
 * candidature. Jamais à l'admission d'un clic local ; jamais d'écriture directe dans
 * `notifications` (cliquet `notifications-writer`) ; aucun contenu, montant, nom ni contact dans
 * les arguments : un genre, une référence de sujet et une transition (références et révisions).
 *
 * P14 : le contrat SERVICE-CONTROL exige
 * une preuve de session de cinq minutes au plus : toute observation a donc lieu dans la session
 * du CLIENT (sa commande ou sa relecture). Ses avis s'écrivent en trace déjà lue, sans transport ;
 * l'équipe habilitée, elle, n'observe rien elle-même : ses avis partent par la file habituelle.
 * P15 : le suivi d'une candidature est fait par la file serveur (aucune session) : avis non lu,
 * transporté selon les préférences, le consentement et le budget du candidat.
 * DP39 : un signal privé signé peut réveiller la demande par un avis neutre non lu. Il ne
 * remplace aucune observation SERVICE-CONTROL et ne confirme aucun état de service.
 */
import { COMMERCIAL_TEAM_MAX } from "@antsia/social-domain/commercialContact"
import { commerceJobsCandidateState } from "@antsia/social-domain/commerce-jobs"
import type { CommerceApplicationState } from "@antsia/social-domain/commerce/lifecycle"
import {
  type CommerceNoticeBooking,
  type CommerceNotificationKind,
  type CommerceServiceObservation,
  commerceServiceObservationNotices,
} from "@antsia/social-domain/commerceNotifications"

import type { Doc, Id } from "../../_generated/dataModel"
import type { MutationCtx } from "../../_generated/server"
import { notifyPerson } from "./notify"

type ServiceRow = Doc<"commerceServiceRequests">
type BookingSnapshot = NonNullable<ServiceRow["booking"]>
type ApplicationRow = Doc<"commerceApplications">

/** Les genres qui parlent à l'équipe habilitée : gestes du client confirmés par PRO.GA. */
export type CommerceTeamNoticeKind = Extract<
  CommerceNotificationKind,
  "commerce_service_quote_accepted" | "commerce_service_booking_held" | "commerce_service_booking_client_changed" | "commerce_service_booking_client_cancelled"
>

/** Devis relus par liste : au plus autant d'avis par lecture (la liste servie en compte vingt au plus). */
const QUOTES_NOTICED_MAX = 5
/** États d'un devis encore TRANSMIS au client (ni accepté, ni refusé, ni expiré, ni retiré). */
const OPEN_QUOTE_STATES: readonly string[] = ["sent", "viewed", "negotiating"]

function bookingOf(snapshot: BookingSnapshot | undefined): CommerceNoticeBooking | null {
  return snapshot === undefined ? null : {
    appointmentRef: snapshot.appointmentRef, state: snapshot.state, revision: snapshot.revision,
    startAt: snapshot.startAt, endAt: snapshot.endAt, cancellation: snapshot.cancellation,
  }
}

function observationOf(row: Pick<ServiceRow, "booking" | "pendingReplacement" | "order" | "reason">): CommerceServiceObservation {
  return {
    booking: bookingOf(row.booking),
    pendingReplacement: bookingOf(row.pendingReplacement),
    order: row.order === undefined ? null : { orderRef: row.order.orderRef, state: row.order.state, revision: row.order.revision },
    reason: row.reason ?? null,
  }
}

/** UN avis au client sur SA demande ; observé dans sa propre session : trace déjà lue, sans transport. */
async function noticeClient(ctx: MutationCtx, row: ServiceRow, kind: CommerceNotificationKind, transition: string): Promise<void> {
  await notifyPerson(ctx, {
    networkId: row.networkId, recipientPersonId: row.personId, kind,
    subject: { commerceServiceRequest: row._id }, commerceTransition: transition, observerPersonId: row.personId,
  })
}

/** DP39 : aucune observation par le client, donc avis non lu ; transports habituels gardés. */
export async function noticeServiceFollowup(ctx: MutationCtx, row: ServiceRow, transition: string): Promise<Id<"notifications"> | null> {
  return await notifyPerson(ctx, {
    networkId: row.networkId, recipientPersonId: row.personId, kind: "commerce_service_followup_updated",
    subject: { commerceServiceRequest: row._id }, commerceTransition: transition,
  })
}

/**
 * Le CLIENT : ce qu'une observation de PRO.GA (relecture d'un rendez-vous, consultation d'une
 * commande) apprend des décisions du PROFESSIONNEL, juste après l'écriture de `patch` sur `before`.
 * Le geste du client lui-même n'est jamais annoncé au client (règle `commerceServiceObservationNotices`).
 */
export async function noticeServiceObservation(ctx: MutationCtx, before: ServiceRow, patch: Partial<ServiceRow>): Promise<void> {
  const after: ServiceRow = { ...before, ...patch }
  for (const notice of commerceServiceObservationNotices(observationOf(before), observationOf(after))) {
    await noticeClient(ctx, before, notice.kind, notice.transition)
  }
}

/** Le CLIENT : devis transmis vus dans la liste servie par PRO.GA — une trace par version COURANTE. */
export async function noticeServiceQuotes(ctx: MutationCtx, row: ServiceRow, quotes: readonly { quoteRef: string; version: number; current: boolean; state: string }[]): Promise<void> {
  // borné : les QUOTES_NOTICED_MAX premiers devis de la liste servie (vingt au plus).
  for (const quote of quotes.slice(0, QUOTES_NOTICED_MAX)) {
    if (!quote.current || !OPEN_QUOTE_STATES.includes(quote.state)) continue
    await noticeClient(ctx, row, quote.version > 1 ? "commerce_service_quote_revised" : "commerce_service_quote_received", `quote:${quote.quoteRef}:v${quote.version}`)
  }
}

/** Le CLIENT : devis révisé appris par une acceptation à reconfirmer — la version courante, jamais son total. */
export async function noticeServiceQuoteRevised(ctx: MutationCtx, row: ServiceRow, quoteRef: string, version: number): Promise<void> {
  await noticeClient(ctx, row, "commerce_service_quote_revised", `quote:${quoteRef}:v${version}`)
}

/**
 * L'ÉQUIPE habilitée de la boutique : un geste du client CONFIRMÉ par PRO.GA. Mandats non
 * révoqués (au plus `COMMERCIAL_TEAM_MAX`), chacun relu par la porte (mandat vivant, blocage,
 * adhésion, effacement) ; jamais le client lui-même (auteur du geste, `sourcePersonId`).
 */
export async function noticeServiceTeam(ctx: MutationCtx, row: ServiceRow, kind: CommerceTeamNoticeKind, transition: string): Promise<void> {
  // borné : une boutique porte au plus COMMERCIAL_TEAM_MAX mandats actifs (garde de `team.grant`).
  const mandates = await ctx.db.query("shopContactMandates").withIndex("by_shop_revoked", (q) => q.eq("shopId", row.shopId).eq("revokedAt", undefined)).take(COMMERCIAL_TEAM_MAX)
  for (const mandate of mandates) {
    if (mandate.personId === row.personId) continue
    await notifyPerson(ctx, {
      networkId: row.networkId, recipientPersonId: mandate.personId, kind,
      subject: { commerceServiceRequest: row._id }, commerceTransition: transition,
      sourcePersonId: row.personId, observerPersonId: row.personId,
    })
  }
}

/**
 * P15 — le CANDIDAT : l'état AUTORISÉ de sa candidature a changé (suivi servi par PRO.GA). Un
 * état interne que la fiche ne distingue pas n'annonce rien ; aucun motif, aucune décision
 * détaillée ; une candidature retirée n'est plus suivie.
 */
export async function noticeJobApplicationUpdated(ctx: MutationCtx, before: ApplicationRow, current: { state: CommerceApplicationState; revision: number }): Promise<void> {
  if (before.state !== "submitted" || before.revokedAt !== undefined) return
  if (commerceJobsCandidateState(before.remoteState ?? "received") === commerceJobsCandidateState(current.state)) return
  await notifyPerson(ctx, {
    networkId: before.networkId, recipientPersonId: before.personId, kind: "commerce_job_application_updated",
    subject: { commerceApplication: before._id }, commerceTransition: `application:r${current.revision}`,
  })
}
