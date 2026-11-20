/** DG-023 : opt-in personnel J-1, jobs durables et reçu transactionnel sans rattrapage. */
import { associationEventReminderAt, type AssociationEventReminderState } from "../diaspora/associationEventRules"
import { v } from "convex/values"

import { internal } from "../../_generated/api"
import type { Doc, Id } from "../../_generated/dataModel"
import { internalMutation, type MutationCtx } from "../../_generated/server"
import { failAppRule, notFound } from "../../lib/errors"
import { networkMutation } from "../../lib/functions"
import { enforceRateLimit } from "../../lib/rateLimit"
import { assertDiasporaNetwork } from "../diaspora/facts"
import { notifyPerson } from "../notifications/notify"
import { pageEventAccess } from "./pageEventAccess"
import { pageEventReminderVisible } from "./pageEventReminderAccess"

function generationOf(row: Doc<"eventParticipants">): number {
  return row.pageReminderGeneration ?? 0
}

function nextGeneration(row: Doc<"eventParticipants">): number {
  const next = generationOf(row) + 1
  if (!Number.isSafeInteger(next) || next < 1) return failAppRule("association_event_invalid")
  return next
}

function hasReceipt(event: Doc<"events">, row: Doc<"eventParticipants">): boolean {
  return row.pageReminderRecordedAt !== undefined && row.pageReminderRecordedForStartAt === event.startAt
}

function queued(row: Doc<"eventParticipants">): boolean {
  return row.status === "pending" && row.pageRegistrationSequence !== undefined && Number.isSafeInteger(row.pageRegistrationSequence) && row.pageRegistrationSequence > 0
}

/** Aucun nettoyage ni programmation en lecture ; le reçu survit à l'opt-out. */
export function pageEventReminderView(event: Doc<"events">, row: Doc<"eventParticipants"> | null, published: boolean, now: number): { reminderEnabled: boolean; reminderAt: number | null; reminderState: AssociationEventReminderState } {
  if (!row || row.networkId !== event.networkId || row.pageReminderEnabled !== true) return { reminderEnabled: false, reminderAt: null, reminderState: "off" }
  const reminderAt = associationEventReminderAt(event.startAt)
  let reminderState: AssociationEventReminderState = "expired"
  const generation = generationOf(row)
  if (hasReceipt(event, row)) reminderState = "recorded"
  else if (published && event.status === "scheduled" && now < event.startAt && row.pageReminderCompletedGeneration !== generation) {
    if (queued(row) && now < reminderAt) reminderState = "waiting_confirmation"
    else if (row.status === "accepted" && row.pageReminderScheduledGeneration === generation && row.pageReminderScheduledForStartAt === event.startAt) reminderState = "scheduled"
  }
  return { reminderEnabled: true, reminderAt, reminderState }
}

/** Invalide tous les anciens jobs sans effacer le reçu d'un même début. */
export async function disablePageEventReminder(ctx: MutationCtx, row: Doc<"eventParticipants">): Promise<void> {
  await ctx.db.patch(row._id, {
    pageReminderEnabled: false, pageReminderGeneration: nextGeneration(row),
    pageReminderScheduledGeneration: undefined, pageReminderScheduledForStartAt: undefined, pageReminderCompletedGeneration: undefined,
  })
}

/** Appelé lors d'une activation ou d'une promotion ; jamais pour une attente seule. */
export async function schedulePageEventReminder(ctx: MutationCtx, event: Doc<"events">, participationId: Id<"eventParticipants">): Promise<void> {
  const row = await ctx.db.get(participationId)
  if (!row || row.eventId !== event._id || row.networkId !== event.networkId || row.status !== "accepted" || row.pageReminderEnabled !== true || hasReceipt(event, row)) return
  const generation = generationOf(row)
  if (event.status !== "scheduled" || event.startAt <= Date.now()) return
  const due = associationEventReminderAt(event.startAt)
  if (due <= Date.now()) {
    await ctx.db.patch(row._id, { pageReminderCompletedGeneration: generation })
    return
  }
  if (row.pageReminderScheduledGeneration === generation && row.pageReminderScheduledForStartAt === event.startAt) return
  await ctx.scheduler.runAt(due, internal.modules.events.pageEventReminders.deliverPageEventReminder, {
    networkId: event.networkId, eventId: event._id, participationId: row._id,
    expectedGeneration: generation, expectedStartAt: event.startAt,
  })
  await ctx.db.patch(row._id, { pageReminderScheduledGeneration: generation, pageReminderScheduledForStartAt: event.startAt, pageReminderCompletedGeneration: undefined })
}

export const setReminder = networkMutation({
  feature: "groupsAndEvents",
  minStatus: "en_attente", args: { eventId: v.id("events"), enabled: v.boolean() }, returns: v.null(),
  handler: async (ctx, args) => {
    assertDiasporaNetwork(ctx.network)
    await enforceRateLimit(ctx, "event.respond", ctx.person._id)
    const event = await ctx.db.get(args.eventId)
    if (!event || event.networkId !== ctx.networkId || !event.organizerPageId || event.organizerPersonId !== undefined) return notFound()
    const row = await ctx.db.query("eventParticipants").withIndex("by_event_person", (q) => q.eq("eventId", event._id).eq("personId", ctx.person._id)).unique()
    if (!row || row.networkId !== ctx.networkId) return notFound()
    if (!args.enabled) {
      await disablePageEventReminder(ctx, row)
      return null
    }
    const access = await pageEventAccess(ctx, event, ctx.person._id)
    if (!access || access.moderation !== "published" || event.status !== "scheduled" || event.startAt <= Date.now() || (row.status !== "accepted" && !queued(row))) return notFound()
    if (associationEventReminderAt(event.startAt) <= Date.now() && !hasReceipt(event, row)) return failAppRule("association_event_reminder_too_late")
    if (row.pageReminderEnabled !== true) await ctx.db.patch(row._id, {
      pageReminderEnabled: true, pageReminderGeneration: nextGeneration(row),
      pageReminderScheduledGeneration: undefined, pageReminderScheduledForStartAt: undefined, pageReminderCompletedGeneration: undefined,
    })
    await schedulePageEventReminder(ctx, event, row._id)
    return null
  },
})

export const deliverPageEventReminder = internalMutation({
  args: { networkId: v.id("networks"), eventId: v.id("events"), participationId: v.id("eventParticipants"), expectedGeneration: v.number(), expectedStartAt: v.number() }, returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const row = await ctx.db.get(args.participationId)
    if (!row || row.networkId !== args.networkId || row.eventId !== args.eventId || row.pageReminderEnabled !== true || generationOf(row) !== args.expectedGeneration || row.pageReminderScheduledGeneration !== args.expectedGeneration || row.pageReminderScheduledForStartAt !== args.expectedStartAt || row.pageReminderCompletedGeneration === args.expectedGeneration) return null
    const event = await ctx.db.get(args.eventId)
    const now = Date.now()
    if (!event || event.networkId !== args.networkId || event.startAt !== args.expectedStartAt || event.status !== "scheduled" || now >= event.startAt || now < associationEventReminderAt(event.startAt) || hasReceipt(event, row)) return null
    const notificationId = await pageEventReminderVisible(ctx, args.networkId, event._id, row.personId)
      ? await notifyPerson(ctx, { networkId: args.networkId, recipientPersonId: row.personId, kind: "association_event_reminder", subject: { event: event._id } }) : null
    await ctx.db.patch(row._id, {
      pageReminderCompletedGeneration: args.expectedGeneration,
      ...(notificationId ? { pageReminderRecordedAt: now, pageReminderRecordedForStartAt: event.startAt } : {}),
    })
    return null
  },
})
