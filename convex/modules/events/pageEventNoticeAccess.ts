/**
 * EV-03 (issue antsia#97) : garde des avis « événement annulé » et « place confirmée », sans
 * écrivain de cloche ni module `events.ts` (même place que la garde du rappel,
 * `pageEventReminderAccess.ts`, pour que la porte unique `notify.ts` la lise sans cycle).
 *
 * Réutilisée à l'écriture (porte unique), à la lecture de la cloche et avant tout transport :
 * une personne qui a perdu l'accès à l'événement ou au réseau n'est pas prévenue, et un avis
 * déjà écrit ne se présente plus. Mêmes conditions que le rappel (page native d'association
 * lisible dans son réseau DIASPORALE, personne présente, événement publié pour elle), sans la
 * fenêtre de temps du rappel ; chaque genre lit en plus l'état qu'il annonce.
 */
import type { Doc, Id } from "../../_generated/dataModel"
import type { QueryCtx } from "../../_generated/server"
import { isDiasporaNetwork } from "../diaspora/facts"
import { isFederatedPage } from "../federation/mirrorAccess"
import { readablePageOrNull } from "../pages/access"
import { pageEventAccess } from "./pageEventAccess"

/** Les deux avis d'issue d'un événement de page (le rappel garde sa propre garde). */
export type PageEventOutcomeNoticeKind = "association_event_cancelled" | "association_event_seat_confirmed"

export function isPageEventOutcomeNoticeKind(kind: string): kind is PageEventOutcomeNoticeKind {
  return kind === "association_event_cancelled" || kind === "association_event_seat_confirmed"
}

/** En attente d'une place : `pending` avec un numéro d'ordre de file (même lecture que la file). */
function waitlisted(row: Doc<"eventParticipants">): boolean {
  const sequence = row.pageRegistrationSequence
  return row.status === "pending" && sequence !== undefined && Number.isSafeInteger(sequence) && sequence > 0
}

/**
 * L'état que l'avis annonce, relu sur l'événement et la participation :
 *  - annulé : l'événement l'est, et l'annulation précède sa fin (annuler un événement terminé
 *    ne fait déplacer personne) ; la personne était inscrite, confirmée ou en attente ;
 *  - place confirmée : l'événement est toujours prévu et la personne tient sa place.
 */
function announcedStateHolds(kind: PageEventOutcomeNoticeKind, event: Doc<"events">, participation: Doc<"eventParticipants">): boolean {
  if (kind === "association_event_cancelled") {
    return event.status === "cancelled" && event.cancelledAt !== undefined && event.cancelledAt < event.endAt && (participation.status === "accepted" || waitlisted(participation))
  }
  return event.status === "scheduled" && participation.status === "accepted"
}

/** L'avis se lit-il (ou s'écrit-il) pour cette personne, maintenant ? Refus indistinct : `false`. */
export async function pageEventNoticeVisible(ctx: Pick<QueryCtx, "db">, networkId: Id<"networks">, eventId: Id<"events">, personId: Id<"persons">, kind: PageEventOutcomeNoticeKind): Promise<boolean> {
  const event = await ctx.db.get(eventId)
  if (!event || event.networkId !== networkId || !event.organizerPageId || event.organizerPersonId !== undefined) return false
  const person = await ctx.db.get(personId)
  if (!person || person.erasedAt !== undefined || person.deletionRequestedAt !== undefined) return false
  const participation = await ctx.db.query("eventParticipants")
    .withIndex("by_event_person", (q) => q.eq("eventId", eventId).eq("personId", personId)).unique()
  if (!participation || participation.networkId !== networkId || !announcedStateHolds(kind, event, participation)) return false
  const network = await ctx.db.get(networkId)
  if (!isDiasporaNetwork(network)) return false
  const page = await readablePageOrNull(ctx, network, event.organizerPageId)
  if (!page || page.networkId !== networkId || page.ownerKind !== "association" || await isFederatedPage(ctx, page._id)) return false
  return (await pageEventAccess(ctx, event, personId))?.moderation === "published"
}
