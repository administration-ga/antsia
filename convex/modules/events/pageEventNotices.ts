/**
 * EV-03 (issue antsia#97) : l'avis « événement annulé » aux inscrits d'un événement de PAGE,
 * diffusé HORS de la transaction du geste, par lots bornés chaînés par curseur (patron de
 * `events.resolveInvitationsOnCancel` et de `notifications/fanout.ts`).
 *
 *  - deux phases : les inscrits CONFIRMÉS, puis les personnes EN ATTENTE (file de page) ; un
 *    inscrit retiré (`declined`) n'est jamais lu ;
 *  - chaque destinataire passe par la porte unique (`notifyPerson`), qui relit la garde
 *    (`pageEventNoticeVisible` : accès à l'événement, réseau, personne présente, état annoncé)
 *    et refuse l'auteur du geste ;
 *  - dédoublonnage par événement et par destinataire : un lot rejoué n'ajoute rien et ne
 *    rouvre aucune ligne déjà lue ;
 *  - le job ne touche ni l'événement ni les participations : aucun conflit avec les gestes.
 */
import { v } from "convex/values"

import { internal } from "../../_generated/api"
import { internalMutation } from "../../_generated/server"
import { notifyPerson } from "../notifications/notify"

/**
 * Taille d'un lot : celle d'un remplissage de la file de page
 * (`ASSOCIATION_EVENT_WAITLIST_BATCH_SIZE`, 32), qui relit déjà pour chaque personne l'accès à
 * l'événement — ici s'y ajoutent la porte unique et la file de livraison, du même ordre.
 */
export const PAGE_EVENT_NOTICE_BATCH_SIZE = 32

const phaseValidator = v.union(v.literal("accepted"), v.literal("waitlisted"))

export const notifyPageEventCancellation = internalMutation({
  args: {
    networkId: v.id("networks"),
    eventId: v.id("events"),
    phase: phaseValidator,
    cursor: v.union(v.string(), v.null()),
    /** Le responsable qui a annulé : jamais avisé de son propre geste, jamais stocké. */
    sourcePersonId: v.optional(v.id("persons")),
  },
  returns: v.object({ notified: v.number(), done: v.boolean() }),
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId)
    if (!event || event.networkId !== args.networkId || !event.organizerPageId || event.organizerPersonId !== undefined || event.status !== "cancelled") return { notified: 0, done: true }
    const rows = args.phase === "accepted"
      ? ctx.db.query("eventParticipants").withIndex("by_event_status", (q) => q.eq("eventId", event._id).eq("status", "accepted"))
      : ctx.db.query("eventParticipants").withIndex("by_event_status_pageRegistrationSequence", (q) => q.eq("eventId", event._id).eq("status", "pending").gt("pageRegistrationSequence", 0))
    const page = await rows.paginate({ cursor: args.cursor, numItems: PAGE_EVENT_NOTICE_BATCH_SIZE })
    let notified = 0
    for (const row of page.page) {
      // Une ligne d'un autre réseau n'est jamais une adresse ; l'auteur du geste n'est pas avisé.
      if (row.networkId !== args.networkId || row.personId === args.sourcePersonId) continue
      const written = await notifyPerson(ctx, {
        networkId: args.networkId,
        recipientPersonId: row.personId,
        kind: "association_event_cancelled",
        subject: { event: event._id },
        ...(args.sourcePersonId !== undefined ? { sourcePersonId: args.sourcePersonId } : {}),
      })
      if (written !== null) notified += 1
    }
    const source = args.sourcePersonId !== undefined ? { sourcePersonId: args.sourcePersonId } : {}
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.modules.events.pageEventNotices.notifyPageEventCancellation, { networkId: args.networkId, eventId: event._id, phase: args.phase, cursor: page.continueCursor, ...source })
      return { notified, done: false }
    }
    if (args.phase === "accepted") {
      await ctx.scheduler.runAfter(0, internal.modules.events.pageEventNotices.notifyPageEventCancellation, { networkId: args.networkId, eventId: event._id, phase: "waitlisted", cursor: null, ...source })
      return { notified, done: false }
    }
    return { notified, done: true }
  },
})
