// Dupliqué de socle/convex/modules/reseauPersonnel/posts.ts (l. 563-597, `resolveEventProjection`) @ ad2e7fdc2 — adaptations : la carte d'évènement de la publication isolée dans le module des évènements (le fil l'importe sans dépendre de ses fonctions) ; fuseau rendu avec les instants ; personnes ; ADR-0028 : l'identifiant de MA ligne d'invitation (`myParticipationId`) pour répondre depuis la carte, seulement pour un évènement personnel (les inscriptions à un évènement de page passent par `pageEvents`).
/**
 * La carte d'un évènement ANNONCÉ, telle qu'elle est MAINTENANT : statut relu à
 * chaque lecture (annulé après l'annonce, la carte le dit), jamais figé à
 * l'écriture ; `null` sans un mot si le pointeur ne mène plus nulle part.
 * `myParticipation` est la ligne DU LECTEUR — `null` pour l'organisateur (il ne
 * se répond pas à lui-même) comme pour un non-invité. `myParticipationId` est
 * l'identifiant de cette même ligne, que `events.respond` attend — `null` pour
 * un évènement de PAGE, dont les inscriptions passent par `pageEvents` : la
 * carte ne propose alors aucune réponse.
 */
import { v } from "convex/values"

import type { Id } from "../../_generated/dataModel"
import type { QueryCtx } from "../../_generated/server"
import { canReadModeratedContent } from "../moderation/policy"
import { pageEventAccess } from "./pageEventAccess"
import { eventParticipationStatusValidator, eventStatusValidator } from "./tables"

export const eventCardValidator = v.object({
  eventId: v.id("events"),
  title: v.string(),
  startAt: v.number(),
  endAt: v.number(),
  timeZone: v.string(),
  status: eventStatusValidator,
  myParticipation: v.union(eventParticipationStatusValidator, v.null()),
  myParticipationId: v.union(v.id("eventParticipants"), v.null()),
})

export async function eventCardOf(ctx: Pick<QueryCtx, "db">, eventId: Id<"events"> | undefined, readerPersonId: Id<"persons">) {
  if (eventId === undefined) return null
  const event = await ctx.db.get(eventId)
  if (!event) return null
  if (event.organizerPageId !== undefined) {
    if (!(await pageEventAccess(ctx, event, readerPersonId))) return null
  } else if (!(await canReadModeratedContent(ctx, "event", event._id, readerPersonId))) return null
  const participation = await ctx.db
    .query("eventParticipants")
    .withIndex("by_event_person", (q) => q.eq("eventId", event._id).eq("personId", readerPersonId))
    .unique()
  return {
    eventId: event._id,
    title: event.title,
    startAt: event.startAt,
    endAt: event.endAt,
    timeZone: event.timeZone,
    status: event.status,
    myParticipation: participation?.status ?? null,
    myParticipationId: participation && event.organizerPageId === undefined ? participation._id : null,
  }
}
