/** DG-023 : copie iCalendar ponctuelle, authentifiée et relue à l'acte. */
import { serializeCalendarEvent } from "@antsia/social-domain/icalendar"
import { v } from "convex/values"

import { notFound } from "../../lib/errors"
import { networkQuery } from "../../lib/functions"
import { assertDiasporaNetwork } from "../diaspora/facts"
import { readableGalleryEvent } from "./pageEventGalleryAccess"

async function calendarUid(networkId: string, eventId: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${networkId}:${eventId}`))
  return `diaspora-ga-${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")}`
}

/** Aucun abonnement, URL publique ou effet d'inscription ; les octets sont une copie privée. */
export const exportIcal = networkQuery({
  feature: "groupsAndEvents",
  args: { eventId: v.id("events"), expectedReaderPersonId: v.id("persons") },
  returns: v.object({ filename: v.literal("diaspora-ga-event.ics"), content: v.string(), mediaType: v.literal("text/calendar;charset=utf-8") }),
  handler: async (ctx, args) => {
    assertDiasporaNetwork(ctx.network)
    if (ctx.person._id !== args.expectedReaderPersonId) return notFound()
    const found = await readableGalleryEvent(ctx, ctx.networkId, args.eventId, ctx.person._id, { allowCancelled: true })
    if (!found) return notFound()
    const event = found.event
    const rows = await ctx.db.query("eventParticipants")
      .withIndex("by_event_person", (q) => q.eq("eventId", event._id).eq("personId", ctx.person._id)).take(2)
    if (rows.length > 1) return notFound()
    const participation = rows[0]
    const confirmed = participation?.networkId === ctx.networkId && participation.status === "accepted"
    const uid = await calendarUid(ctx.networkId, event._id)
    try {
      const content = serializeCalendarEvent({
        uid, title: event.title, description: event.description, location: event.location,
        startAt: event.startAt, endAt: event.endAt, createdAt: event.createdAt, updatedAt: event.updatedAt,
        sequence: event.version ?? 1, status: event.status === "cancelled" ? "cancelled" : confirmed ? "confirmed" : "tentative",
      })
      return { filename: "diaspora-ga-event.ics" as const, content, mediaType: "text/calendar;charset=utf-8" as const }
    } catch {
      // Une ligne corrompue ne révèle ni contenu ni diagnostic de sérialisation.
      return notFound()
    }
  },
})
