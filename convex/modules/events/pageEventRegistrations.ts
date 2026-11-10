/** DG-023 : file volontaire de page, FIFO transactionnelle et promotions bornées. */
import { ASSOCIATION_EVENT_WAITLIST_BATCH_SIZE, isAssociationEventRegistrationOpen } from "../diaspora/associationEventRules"
import { v } from "convex/values"

import { internal } from "../../_generated/api"
import type { Doc, Id } from "../../_generated/dataModel"
import { internalMutation, type MutationCtx, type QueryCtx } from "../../_generated/server"
import { memberHasStatus } from "../../lib/access"
import { failAppRule, notFound } from "../../lib/errors"
import { isDiasporaNetwork } from "../diaspora/facts"
import { isFederatedPage } from "../federation/mirrorAccess"
import { contentState } from "../moderation/policy"
import { readablePageOrNull } from "../pages/access"
import { isClosedByBlocksAmong, livePageSignatoryIds } from "../pages/closedByBlocks"
import { notifyPerson } from "../notifications/notify"
import { engineCounters } from "../posts/counters"
import { participationOf, recordParticipation } from "./events"
import { pageEventAccess } from "./pageEventAccess"
import { resetPageEventAttendance } from "./pageEventAttendanceState"
import { disablePageEventReminder, schedulePageEventReminder } from "./pageEventReminders"

const participantsOf = (eventId: Id<"events">) => `events.participants:${eventId}`
const acceptedOf = (eventId: Id<"events">) => `events.accepted:${eventId}`
const waitlistedOf = (eventId: Id<"events">) => `events.waitlisted:${eventId}`

function hasSequence(row: Doc<"eventParticipants">): row is Doc<"eventParticipants"> & { pageRegistrationSequence: number } {
  return row.pageRegistrationSequence !== undefined && Number.isSafeInteger(row.pageRegistrationSequence) && row.pageRegistrationSequence > 0
}

export function isPageEventWaitlisted(row: Doc<"eventParticipants"> | null): boolean {
  return row !== null && row.status === "pending" && hasSequence(row)
}

export async function pageEventRegistrationCounts(ctx: Pick<QueryCtx, "runQuery">, eventId: Id<"events">): Promise<{ confirmedCount: number; waitlistCount: number }> {
  const [confirmedCount, waitlistCount] = await Promise.all([
    engineCounters.count(ctx, { namespace: acceptedOf(eventId) }),
    engineCounters.count(ctx, { namespace: waitlistedOf(eventId) }),
  ])
  return { confirmedCount, waitlistCount }
}

/** La lecture ne nettoie jamais la file ; le rang est celui de l'agrégat persisté. */
export async function pageEventWaitlistPosition(ctx: Pick<QueryCtx, "runQuery">, row: Doc<"eventParticipants"> | null): Promise<number | null> {
  if (!row || row.status !== "pending" || !hasSequence(row)) return null
  return await engineCounters.indexOf(ctx, row.pageRegistrationSequence, { namespace: waitlistedOf(row.eventId), id: row._id }) + 1
}

export async function schedulePageEventSeatFill(ctx: MutationCtx, networkId: Id<"networks">, eventId: Id<"events">): Promise<void> {
  await ctx.scheduler.runAfter(0, internal.modules.events.pageEventRegistrations.fillPageEventSeats, { networkId, eventId })
}

async function removeFromWaitlist(ctx: MutationCtx, row: Doc<"eventParticipants">): Promise<void> {
  if (hasSequence(row)) await engineCounters.deleteIfExists(ctx, { namespace: waitlistedOf(row.eventId), key: row.pageRegistrationSequence, id: row._id })
}

/**
 * Aucune identité de session : chaque candidat est relu avec ses droits présents.
 * Les places accepted restent réservées jusqu'au retrait ou à l'effacement.
 *
 * EV-03 (issue antsia#97) : chaque personne PROMUE de la file reçoit l'avis neutre « place
 * confirmée », dans la transaction de sa promotion (au plus un lot de file par transaction) —
 * sauf l'auteur du geste en cours (`actorPersonId`), qui voit sa place à l'écran : la personne
 * qui s'inscrit et obtient d'emblée une place n'est pas avisée de son propre geste.
 *
 * Issue antsia#141 : un candidat à qui la page est désormais FERMÉE par les blocages (tous ses
 * signataires vivants en blocage avec lui, `pages/closedByBlocks`) n'est ni promu ni avisé. Comme
 * tout candidat qui a perdu son droit à la place, il quitte la file sans bruit (ligne gardée,
 * déclinée) : resté en attente, il occuperait la tête de la file, relue à chaque passage. Une
 * place DÉJÀ confirmée n'est pas touchée ; la personne peut toujours l'annuler.
 */
export async function fillPageEventSeatsNow(ctx: MutationCtx, networkId: Id<"networks">, eventId: Id<"events">, actorPersonId?: Id<"persons">): Promise<void> {
  const event = await ctx.db.get(eventId)
  if (!event || event.networkId !== networkId || !event.organizerPageId || event.organizerPersonId !== undefined || event.status !== "scheduled" || event.startAt <= Date.now()) return
  if (!isAssociationEventRegistrationOpen({ startAt: event.startAt, registrationClosesAt: event.pageRegistrationClosesAt }, Date.now())) return
  const network = await ctx.db.get(networkId)
  if (!isDiasporaNetwork(network)) return
  // Une indisponibilité collective suspend la file ; elle n'exclut aucun candidat.
  const page = await readablePageOrNull(ctx, network, event.organizerPageId)
  if (!page || page.networkId !== networkId || page.ownerKind !== "association" || await isFederatedPage(ctx, page._id)) return
  const state = await contentState(ctx, "event", event._id)
  if (!state || state.networkId !== networkId || state.status !== "published" || (state.ownerPageId !== undefined && state.ownerPageId !== event.organizerPageId)) return
  let confirmedCount = await engineCounters.count(ctx, { namespace: acceptedOf(eventId) })
  const capacity = event.pageCapacity ?? null
  if (capacity !== null && confirmedCount >= capacity) return
  const candidates = await ctx.db.query("eventParticipants")
    .withIndex("by_event_status_pageRegistrationSequence", (q) => q.eq("eventId", eventId).eq("status", "pending").gt("pageRegistrationSequence", 0))
    .order("asc").take(ASSOCIATION_EVENT_WAITLIST_BATCH_SIZE)
  let processed = 0
  // Les signataires vivants de la page, lus une fois par passage (au premier candidat admissible).
  let liveSignatories: Id<"persons">[] | null = null
  for (const candidate of candidates) {
    if (capacity !== null && confirmedCount >= capacity) break
    // Une ligne corrompue d'un autre réseau ne peut jamais être altérée ou promue.
    if (candidate.networkId !== networkId || !hasSequence(candidate)) return
    const person = await ctx.db.get(candidate.personId)
    const access = person && person.erasedAt === undefined && person.deletionRequestedAt === undefined &&
      await memberHasStatus(ctx, networkId, candidate.personId, "declaree")
      ? await pageEventAccess(ctx, event, candidate.personId) : null
    let accepted = access?.moderation === "published"
    if (accepted) {
      liveSignatories ??= await livePageSignatoryIds(ctx, page)
      accepted = !(await isClosedByBlocksAmong(ctx, liveSignatories, candidate.personId))
    }
    await ctx.db.patch(candidate._id, { status: accepted ? "accepted" : "declined", eventStartAt: event.startAt, respondedAt: Date.now() })
    await recordParticipation(ctx, candidate, accepted)
    await removeFromWaitlist(ctx, candidate)
    if (accepted) await schedulePageEventReminder(ctx, event, candidate._id)
    else await disablePageEventReminder(ctx, candidate)
    if (accepted && candidate.personId !== actorPersonId) {
      await notifyPerson(ctx, {
        networkId, recipientPersonId: candidate.personId, kind: "association_event_seat_confirmed", subject: { event: event._id },
        ...(actorPersonId !== undefined ? { sourcePersonId: actorPersonId } : {}),
      })
    }
    if (accepted) confirmedCount += 1
    processed += 1
  }
  if (processed === ASSOCIATION_EVENT_WAITLIST_BATCH_SIZE && (capacity === null || confirmedCount < capacity)) {
    const next = await ctx.db.query("eventParticipants")
      .withIndex("by_event_status_pageRegistrationSequence", (q) => q.eq("eventId", eventId).eq("status", "pending").gt("pageRegistrationSequence", 0)).first()
    if (next) await schedulePageEventSeatFill(ctx, networkId, eventId)
  }
}

/** Admission et allocation de séquence dans la même transaction que le remplissage. */
export async function registerPageEventParticipation(ctx: MutationCtx, event: Doc<"events">, personId: Id<"persons">): Promise<void> {
  if (!event.organizerPageId || event.organizerPersonId !== undefined) return notFound()
  const existing = await participationOf(ctx, event._id, personId)
  if (existing && existing.networkId !== event.networkId) return notFound()
  if (existing?.status === "accepted" || isPageEventWaitlisted(existing)) {
    if (!isAssociationEventRegistrationOpen({ startAt: event.startAt, registrationClosesAt: event.pageRegistrationClosesAt }, Date.now())) return
    await fillPageEventSeatsNow(ctx, event.networkId, event._id, personId)
    return
  }
  if (!isAssociationEventRegistrationOpen({ startAt: event.startAt, registrationClosesAt: event.pageRegistrationClosesAt }, Date.now())) return failAppRule("association_event_registration_closed")
  const sequence = (event.pageRegistrationSequence ?? 0) + 1
  if (!Number.isSafeInteger(sequence) || sequence < 1) return failAppRule("association_event_invalid")
  // Ce numéro d'allocation n'invalide pas un brouillon éditorial ouvert.
  await ctx.db.patch(event._id, { pageRegistrationSequence: sequence })
  const now = Date.now()
  let rowId: Id<"eventParticipants">
  if (existing) {
    await removeFromWaitlist(ctx, existing)
    await resetPageEventAttendance(ctx, existing)
    await disablePageEventReminder(ctx, existing)
    rowId = existing._id
    await ctx.db.patch(rowId, { status: "pending", pageRegistrationSequence: sequence, eventStartAt: event.startAt, respondedAt: now })
  } else {
    rowId = await ctx.db.insert("eventParticipants", {
      networkId: event.networkId, eventId: event._id, personId, invitedByPersonId: personId,
      status: "pending", pageRegistrationSequence: sequence, eventStartAt: event.startAt, createdAt: now, respondedAt: now,
      pageReminderEnabled: false, pageReminderGeneration: 1,
    })
  }
  await recordParticipation(ctx, { _id: rowId, eventId: event._id }, false)
  await engineCounters.insertIfDoesNotExist(ctx, { namespace: waitlistedOf(event._id), key: sequence, id: rowId })
  await fillPageEventSeatsNow(ctx, event.networkId, event._id, personId)
}

/** Retrait volontaire : la ligne et le décompte historique participants sont conservés. */
export async function withdrawPageEventParticipation(ctx: MutationCtx, row: Doc<"eventParticipants">): Promise<void> {
  await resetPageEventAttendance(ctx, row)
  await disablePageEventReminder(ctx, row)
  await ctx.db.patch(row._id, { status: "declined", respondedAt: Date.now() })
  await recordParticipation(ctx, row, false)
  await removeFromWaitlist(ctx, row)
  await fillPageEventSeatsNow(ctx, row.networkId, row.eventId, row.personId)
}

/** Hook d'effacement AVANT db.delete : les événements personnels restent inchangés. */
export async function unrecordPageEventParticipation(ctx: MutationCtx, row: Doc<"eventParticipants">): Promise<void> {
  const event = await ctx.db.get(row.eventId)
  if (!event) {
    // L'empreinte de présence suffit à reconnaître une ligne de page orpheline.
    if (row.pageAttendanceVersion !== undefined || row.pageAttendanceTokenHash !== undefined || row.pageAttendanceTokenExpiresAt !== undefined || row.pageAttendanceCheckedInAt !== undefined) await resetPageEventAttendance(ctx, row)
    return
  }
  if (event.networkId !== row.networkId || !event.organizerPageId || event.organizerPersonId !== undefined) return
  await resetPageEventAttendance(ctx, row)
  await engineCounters.deleteIfExists(ctx, { namespace: participantsOf(row.eventId), key: 0, id: row._id })
  await engineCounters.deleteIfExists(ctx, { namespace: acceptedOf(row.eventId), key: 0, id: row._id })
  await removeFromWaitlist(ctx, row)
  await schedulePageEventSeatFill(ctx, row.networkId, row.eventId)
}

export const fillPageEventSeats = internalMutation({
  args: { networkId: v.id("networks"), eventId: v.id("events") }, returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    await fillPageEventSeatsNow(ctx, args.networkId, args.eventId)
    return null
  },
})
