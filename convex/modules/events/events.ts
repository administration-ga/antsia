// Dupliqué de socle/convex/modules/reseauPersonnel/evenements.ts @ ad2e7fdc2 — adaptations : évènement et participation PAR RÉSEAU (un évènement d'un autre réseau est introuvable ; une clé de création rejouée ailleurs est refusée) ; adhésion par le constructeur sur chaque fonction (D15 : absente au socle) ; « comptes publics » sans objet ; invitation d'une personne en relation acceptée DANS le réseau ; `participantCount` et `acceptedCount` dans l'agrégat `engineCounters` (D02) ; `eventStartAt` obligatoire, chemin hérité de l'agenda supprimé ; agenda borné qui DIT sa lacune (`truncated`, D19) ; fuseau de l'évènement, ou à défaut celui de la personne (jamais un fuseau imposé) ; fiche sans participants, ceux-ci paginés à part (`getEvent` ne rend plus de première page) ; annonce par `writePost` (portée, pays, visibilité du réseau comme une publication ordinaire) ; cloche `event_invite` par la porte du moteur, résolue à la réponse et, à l'annulation, par un job paginé gardé tel quel ; export iCal (`eventIcalUrl`, `getPersonalEventForIcal`) DIFFÉRÉ (décision par défaut de l'owner map) ; refus à code (`notFound` indistinct, `eventOrganizerRequired`, règle `EVENT_CANCELLED`) ; débit ; annonce soumise à la règle de placement de la tranche qui gouverne le réseau (HB-03, issue antsia#96).
/**
 * ÉVÈNEMENTS PERSONNELS d'un réseau — l'agenda d'une PERSONNE, jamais d'une
 * organisation.
 *
 * L'invitation et la réponse sont LA MÊME LIGNE : elle naît `pending` et porte
 * ensuite la réponse ; réinviter rafraîchit ou rouvre, jamais n'empile ; changer
 * d'avis est permis tant que l'évènement n'est pas annulé.
 *
 * Visibilité : l'organisateur ou une ligne de participation (tout statut), rien
 * d'autre — refus INDISTINCT. Un évènement ANNULÉ reste visible de ses
 * participants : disparaître en silence laisserait chacun s'y présenter.
 */
import type { CounterpartLabel } from "@antsia/social-contracts/counterpart"
import { assertPersonalPostBody, assertPostReach, PERSONAL_REACH_AUDIENCES } from "@antsia/social-domain/content"
import {
  assertPersonalEventDescription,
  assertPersonalEventLocation,
  assertPersonalEventTimeZone,
  assertPersonalEventTitle,
  assertPersonalEventWindow,
  canRespondToPersonalEvent,
  type PersonalEventParticipationStatus,
  type PersonalEventResponse,
  type PersonalEventStatus,
} from "@antsia/social-domain/events"
import { effectiveVisibility } from "@antsia/social-domain/network"
import { paginationOptsValidator, type PaginationResult } from "convex/server"
import { v } from "convex/values"

import { internal } from "../../_generated/api"
import { canReadModeratedContent, contentState, moderateContentWrite } from "../moderation/policy"
import type { Doc, Id } from "../../_generated/dataModel"
import { internalMutation, type MutationCtx, type QueryCtx } from "../../_generated/server"
import { checked, fail, failRule, notFound } from "../../lib/errors"
import { networkMutation, networkQuery } from "../../lib/functions"
import { enforceRateLimit } from "../../lib/rateLimit"
import { literals } from "../../lib/validators"
import { isBlockedBetween, isConnectedTo } from "../graph/graph"
import { counterpartOf } from "../messaging/participation"
import { notifyPerson, resolveNotifications } from "../notifications/notify"
import { findPublishedPersonByHandle, miniProfileCache } from "../people/miniProfile"
import { engineCounters } from "../posts/counters"
import { assertPostPlacement, placementOf } from "../posts/placement"
import { writePost } from "../posts/postWrite"
import { pageEventAccess } from "./pageEventAccess"
import { readableGalleryEvent } from "./pageEventGalleryAccess"

type ReadCtx = Pick<QueryCtx, "db">

/** Mon agenda, lu en fenêtres bornées (organisés, puis participations). */
const AGENDA_SCAN = 200
/** Pagination exhaustive : une seule page native, avant les gardes de contenu. */
const AGENDA_PAGE_MAX = 40
const AGENDA_PAGE_BYTES = 256 * 1024
/** Participations `pending` relues par exécution du job d'annulation. */
export const CANCEL_RESOLVE_BATCH = 100
/** Participants par page, plafond dur. */
const PARTICIPANTS_PAGE_MAX = 100

// ═══════════════════════════════════════════════════════════════
// Décomptes — l'agrégat, jamais un champ de l'évènement (D02)
// ═══════════════════════════════════════════════════════════════

const participantsOf = (eventId: Id<"events">) => `events.participants:${eventId}`
const acceptedOf = (eventId: Id<"events">) => `events.accepted:${eventId}`

async function countParticipants(ctx: Pick<QueryCtx, "runQuery">, eventId: Id<"events">): Promise<number> {
  return await engineCounters.count(ctx, { namespace: participantsOf(eventId) })
}

async function countAccepted(ctx: Pick<QueryCtx, "runQuery">, eventId: Id<"events">): Promise<number> {
  return await engineCounters.count(ctx, { namespace: acceptedOf(eventId) })
}

/** Une ligne de participation compte (une entrée par ligne) ; acceptée, elle compte aussi parmi les venues. */
export async function recordParticipation(ctx: MutationCtx, row: { _id: Id<"eventParticipants">; eventId: Id<"events"> }, accepted: boolean | null): Promise<void> {
  await engineCounters.insertIfDoesNotExist(ctx, { namespace: participantsOf(row.eventId), key: 0, id: row._id })
  if (accepted === true) await engineCounters.insertIfDoesNotExist(ctx, { namespace: acceptedOf(row.eventId), key: 0, id: row._id })
  if (accepted === false) await engineCounters.deleteIfExists(ctx, { namespace: acceptedOf(row.eventId), key: 0, id: row._id })
}

// ═══════════════════════════════════════════════════════════════
// Garde d'accès
// ═══════════════════════════════════════════════════════════════

/** Ma ligne de participation à un évènement — `null` si je n'en ai pas. */
export async function participationOf(ctx: ReadCtx, eventId: Id<"events">, personId: Id<"persons">): Promise<Doc<"eventParticipants"> | null> {
  return await ctx.db
    .query("eventParticipants")
    .withIndex("by_event_person", (q) => q.eq("eventId", eventId).eq("personId", personId))
    .unique()
}

/**
 * L'évènement, pour qui EN EST, dans le réseau appelé : organisateur ou ligne
 * de participation (tout statut). Refus INDISTINCT pour l'inexistant, l'autre
 * réseau et l'interdit.
 */
export async function requireEventAccess(
  ctx: ReadCtx,
  networkId: Id<"networks">,
  eventId: Id<"events">,
  personId: Id<"persons">,
): Promise<{ event: Doc<"events">; participation: Doc<"eventParticipants"> | null; isOrganizer: boolean }> {
  const event = await ctx.db.get(eventId)
  if (!event || event.networkId !== networkId) return notFound()
  if (event.organizerPageId !== undefined) {
    const access = await pageEventAccess(ctx, event, personId)
    if (!access) return notFound()
    return { event, participation: await participationOf(ctx, eventId, personId), isOrganizer: access.canManage }
  }
  if (!event.organizerPersonId || !(await canReadModeratedContent(ctx, "event", event._id, personId))) return notFound()
  const isOrganizer = event.organizerPersonId === personId
  const participation = isOrganizer ? null : await participationOf(ctx, eventId, personId)
  if (!isOrganizer && !participation) return notFound()
  return { event, participation, isOrganizer }
}

/** L'évènement de l'organisateur appelant — un participant voit la fiche, il n'en dispose pas. */
async function requireOrganizedEvent(ctx: MutationCtx & { networkId: Id<"networks">; person: Doc<"persons"> }, eventId: Id<"events">): Promise<Doc<"events">> {
  const { event, isOrganizer } = await requireEventAccess(ctx, ctx.networkId, eventId, ctx.person._id)
  if (event.organizerPageId !== undefined) return notFound()
  if (!isOrganizer) return fail("eventOrganizerRequired")
  return event
}

// ═══════════════════════════════════════════════════════════════
// Création, invitation, réponse, annulation
// ═══════════════════════════════════════════════════════════════

/**
 * Créer un évènement. Idempotente par (organisateur, clé) : le rejeu rend
 * l'évènement déjà créé, sans rien revalider. Le fuseau est FIXÉ ici, une fois
 * pour toutes — celui de la personne, jamais un fuseau imposé.
 */
export const create = networkMutation({
  minStatus: "declaree",
  args: {
    title: v.string(),
    description: v.optional(v.string()),
    location: v.optional(v.string()),
    startAt: v.number(),
    endAt: v.number(),
    /** Le fuseau de l'évènement ; à défaut, celui de la personne — jamais un fuseau imposé. */
    timeZone: v.optional(v.string()),
    idempotencyKey: v.string(),
  },
  returns: v.object({ eventId: v.id("events"), created: v.boolean() }),
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, "event.create", ctx.person._id)
    const existing = await ctx.db
      .query("events")
      .withIndex("by_organizer_idempotency", (q) => q.eq("organizerPersonId", ctx.person._id).eq("idempotencyKey", args.idempotencyKey))
      .first()
    if (existing) return existing.networkId === ctx.networkId ? { eventId: existing._id, created: false } : fail("conflict")
    const title = checked(() => assertPersonalEventTitle(args.title))
    const description = checked(() => assertPersonalEventDescription(args.description))
    const location = checked(() => assertPersonalEventLocation(args.location))
    const rawTimeZone = args.timeZone ?? ctx.person.timeZone
    if (rawTimeZone === undefined) return failRule("EVENT_TIMEZONE_INVALID")
    const timeZone = checked(() => assertPersonalEventTimeZone(rawTimeZone))
    checked(() => assertPersonalEventWindow({ startAt: args.startAt, endAt: args.endAt }))
    const now = Date.now()
    const eventId = await ctx.db.insert("events", {
      networkId: ctx.networkId,
      organizerPersonId: ctx.person._id,
      title,
      ...(description !== undefined ? { description } : {}),
      ...(location !== undefined ? { location } : {}),
      startAt: args.startAt,
      endAt: args.endAt,
      timeZone,
      status: "scheduled",
      idempotencyKey: args.idempotencyKey,
      createdAt: now,
      updatedAt: now,
    })
    await moderateContentWrite(ctx, { networkId: ctx.networkId, ownerPersonId: ctx.person._id, kind: "event", id: eventId, text: `${title} ${description ?? ""} ${location ?? ""}` })
    return { eventId, created: true }
  },
})

/**
 * Inviter une personne par son identifiant — l'organisateur seul. Identifiant
 * inconnu, soi-même, personne non connectée dans le réseau, blocage : UN refus.
 * UNE ligne par (évènement, invité) : réinviter rafraîchit une ligne en attente
 * (et re-sonne, dédoublonné) ou rouvre une ligne déclinée ; une réponse
 * `accepted` ou `maybe` est acquise — rien à réinviter.
 */
export const invite = networkMutation({
  minStatus: "declaree",
  args: { eventId: v.id("events"), handle: v.string() },
  returns: v.object({ invited: v.boolean() }),
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, "event.invite", ctx.person._id)
    const event = await requireOrganizedEvent(ctx, args.eventId)
    if ((await contentState(ctx, "event", event._id))?.status === "pending_review") return fail("policyRefused")
    if (event.status === "cancelled") return failRule("EVENT_CANCELLED")
    const found = await findPublishedPersonByHandle(ctx, ctx.networkId, args.handle)
    if (!found || found._id === ctx.person._id) return notFound()
    if (!(await isConnectedTo(ctx, ctx.networkId, ctx.person._id, found._id)) || (await isBlockedBetween(ctx, ctx.person._id, found._id))) return notFound()
    const now = Date.now()
    const existing = await participationOf(ctx, event._id, found._id)
    if (existing) {
      if (existing.status === "accepted" || existing.status === "maybe") return { invited: false }
      await ctx.db.patch(existing._id, { status: "pending", invitedByPersonId: ctx.person._id, eventStartAt: event.startAt, createdAt: now, respondedAt: undefined })
    } else {
      const rowId = await ctx.db.insert("eventParticipants", {
        networkId: ctx.networkId,
        eventId: event._id,
        personId: found._id,
        invitedByPersonId: ctx.person._id,
        status: "pending",
        eventStartAt: event.startAt,
        createdAt: now,
      })
      await recordParticipation(ctx, { _id: rowId, eventId: event._id }, null)
    }
    await ctx.db.patch(event._id, { updatedAt: now })
    await notifyPerson(ctx, { networkId: ctx.networkId, recipientPersonId: found._id, actorPersonId: ctx.person._id, kind: "event_invite", subject: { event: event._id } })
    return { invited: true }
  },
})

/**
 * Répondre à MON invitation : la réponse ÉCRIT la ligne d'invitation. Refus
 * indistinct pour la ligne d'autrui ou inventée. Décliner n'émet rien ; MA
 * cloche se résout avec la réponse (la dernière fait foi — redire la même ferme
 * une ligne restée ouverte).
 */
export const respond = networkMutation({
  minStatus: "declaree",
  args: { participationId: v.id("eventParticipants"), response: literals(["accepted", "declined", "maybe"] as const) },
  returns: v.object({ status: literals(["accepted", "declined", "maybe"] as const) }),
  handler: async (ctx, args): Promise<{ status: PersonalEventResponse }> => {
    await enforceRateLimit(ctx, "event.respond", ctx.person._id)
    const participation = await ctx.db.get(args.participationId)
    if (!participation || participation.personId !== ctx.person._id || participation.networkId !== ctx.networkId) return notFound()
    const event = await ctx.db.get(participation.eventId)
    // Les inscriptions collectives passent uniquement par pageEvents : aucun
    // ancien lien d'invitation ne contourne l'audience ou la date d'ouverture.
    if (!event || event.networkId !== ctx.networkId || event.organizerPageId !== undefined) return notFound()
    if (!canRespondToPersonalEvent({ eventStatus: event.status, isOwnParticipation: true })) return failRule("EVENT_CANCELLED")
    const now = Date.now()
    await resolveNotifications(ctx, { networkId: ctx.networkId, recipientPersonId: ctx.person._id, kind: "event_invite", subject: { event: event._id }, resolution: args.response, at: now })
    if (participation.status === args.response) return { status: args.response }
    await ctx.db.patch(participation._id, { status: args.response, respondedAt: now })
    await recordParticipation(ctx, participation, args.response === "accepted")
    return { status: args.response }
  },
})

/**
 * Annuler MON évènement — idempotente. Rien n'est supprimé : il passe annulé et
 * RESTE VISIBLE de ses participants. Les invitations sans réponse sont résolues
 * `cancelled` par un job chaîné (la liste des invités n'est pas bornée ici).
 */
export const cancel = networkMutation({
  minStatus: "en_attente",
  args: { eventId: v.id("events") },
  returns: v.object({ cancelled: v.literal(true) }),
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, "event.manage", ctx.person._id)
    const event = await requireOrganizedEvent(ctx, args.eventId)
    if (event.status === "cancelled") return { cancelled: true as const }
    const now = Date.now()
    await ctx.db.patch(event._id, { status: "cancelled", cancelledAt: now, updatedAt: now })
    await ctx.scheduler.runAfter(0, internal.modules.events.events.resolveInvitationsOnCancel, { eventId: event._id, cursor: null })
    return { cancelled: true as const }
  },
})

/**
 * Résout `cancelled` la cloche de chaque invité encore SANS RÉPONSE d'un
 * évènement annulé — une page par exécution, replanifiée. Ne touche que les
 * cloches : chacun garde sa réponse. Idempotente.
 */
export const resolveInvitationsOnCancel = internalMutation({
  args: { eventId: v.id("events"), cursor: v.union(v.string(), v.null()) },
  returns: v.object({ resolved: v.number(), done: v.boolean() }),
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId)
    if (!event || event.status !== "cancelled") return { resolved: 0, done: true }
    const page = await ctx.db
      .query("eventParticipants")
      .withIndex("by_event_status", (q) => q.eq("eventId", args.eventId).eq("status", "pending"))
      .paginate({ cursor: args.cursor, numItems: CANCEL_RESOLVE_BATCH })
    // L'heure de l'ANNULATION, pas celle du lot : toutes les lignes disent le même instant.
    const at = event.cancelledAt ?? Date.now()
    let resolved = 0
    for (const participation of page.page) {
      const result = await resolveNotifications(ctx, { networkId: event.networkId, recipientPersonId: participation.personId, kind: "event_invite", subject: { event: event._id }, resolution: "cancelled", at })
      resolved += result.resolved
    }
    if (!page.isDone) await ctx.scheduler.runAfter(0, internal.modules.events.events.resolveInvitationsOnCancel, { eventId: args.eventId, cursor: page.continueCursor })
    return { resolved, done: page.isDone }
  },
})

/**
 * Annoncer MON évènement dans le fil — une SEULE fois (`announcePostId` est
 * l'idempotence), par le point d'écriture commun des publications. Sans corps,
 * le TITRE porte l'annonce. Un évènement annulé ne s'annonce pas. Dans un
 * réseau gouverné, le placement passe la règle de sa tranche (HB-03).
 */
export const announce = networkMutation({
  minStatus: "declaree",
  args: {
    eventId: v.id("events"),
    body: v.optional(v.string()),
    /** `public` ou `connections` : un évènement personnel n'a pas de groupe à désigner. */
    audience: literals(PERSONAL_REACH_AUDIENCES),
    alsoOnRoot: v.optional(v.boolean()),
    reach: v.optional(v.string()),
    country: v.optional(v.string()),
  },
  returns: v.object({ postId: v.id("posts"), created: v.boolean() }),
  handler: async (ctx, args) => {
    const event = await requireOrganizedEvent(ctx, args.eventId)
    if ((await contentState(ctx, "event", event._id))?.status === "pending_review") return fail("policyRefused")
    if (event.status === "cancelled") return failRule("EVENT_CANCELLED")
    if (event.announcePostId !== undefined && (await ctx.db.get(event.announcePostId)) !== null) return { postId: event.announcePostId, created: false }
    await enforceRateLimit(ctx, "post.publish", ctx.person._id)
    const body = checked(() => assertPersonalPostBody(args.body?.trim() || event.title))
    const placed = checked(() =>
      assertPostReach({ ...(args.reach !== undefined ? { reach: args.reach } : {}), ...(args.country !== undefined ? { country: args.country } : {}), reachValues: ctx.network.reachValues }),
    )
    // Dans un réseau gouverné, la RÈGLE DE PLACEMENT de sa tranche, avant toute écriture (HB-03).
    await assertPostPlacement(ctx, { network: ctx.network, authorPersonId: ctx.person._id, page: null, ...placementOf(placed) })
    const visibility = effectiveVisibility({
      networkKind: ctx.network.kind,
      audienceIsPublic: args.audience === "public",
      authorRequestedRoot: args.alsoOnRoot ?? false,
      ruleVisibility: ctx.network.defaultVisibility,
    })
    const { postId } = await writePost(ctx, { network: ctx.network, authorPersonId: ctx.person._id, body, audience: args.audience, visibility, ...placed, eventId: event._id })
    await ctx.db.patch(event._id, { announcePostId: postId, updatedAt: Date.now() })
    return { postId, created: true }
  },
})

// ═══════════════════════════════════════════════════════════════
// Lectures — mon agenda, la fiche, les participants
// ═══════════════════════════════════════════════════════════════

export type EventDto = {
  eventId: Id<"events">
  title: string
  description: string | null
  location: string | null
  startAt: number
  endAt: number
  /** Le fuseau FIXÉ à la création — celui dans lequel l'évènement est pensé. */
  timeZone: string
  status: PersonalEventStatus
  cancelledAt: number | null
  isOrganizer: boolean
  /** MA ligne d'invitation/réponse — `null` quand je suis l'organisateur. */
  myParticipation: { participationId: Id<"eventParticipants">; status: PersonalEventParticipationStatus } | null
  organizer: CounterpartLabel & { personId: Id<"persons"> }
  participantCount: number
  acceptedCount: number
  announcePostId: Id<"posts"> | null
  createdAt: number
}

/** DG-023 : projection collective séparée, sans organisateur personnel ni liste d'inscrits. */
export type AssociationAgendaDto = {
  kind: "association"
  eventId: Id<"events">
  pageId: Id<"pages">
  title: string
  description: string | null
  location: string | null
  startAt: number
  endAt: number
  timeZone: string
  status: PersonalEventStatus
  cancelledAt: number | null
  version: number
  organizer: { name: string; handle: string }
  registration: "confirmed" | "waitlisted"
}

/** Les objets personnels restent identiques ; le collectif a sa propre projection. */
export type AgendaRowDto = { kind: "personal"; event: EventDto } | { kind: "association"; event: AssociationAgendaDto }

async function toEventDto(
  ctx: QueryCtx,
  event: Doc<"events">,
  input: { isOrganizer: boolean; participation: Doc<"eventParticipants"> | null; profileOf: ReturnType<typeof miniProfileCache> },
): Promise<EventDto> {
  const organizerPersonId = event.organizerPersonId
  if (event.organizerPageId !== undefined || organizerPersonId === undefined) return notFound()
  const [organizer, participantCount, acceptedCount] = await Promise.all([counterpartOf(ctx, organizerPersonId, input.profileOf), countParticipants(ctx, event._id), countAccepted(ctx, event._id)])
  return {
    eventId: event._id,
    title: event.title,
    description: event.description ?? null,
    location: event.location ?? null,
    startAt: event.startAt,
    endAt: event.endAt,
    timeZone: event.timeZone,
    status: event.status,
    cancelledAt: event.cancelledAt ?? null,
    isOrganizer: input.isOrganizer,
    myParticipation: input.participation ? { participationId: input.participation._id, status: input.participation.status } : null,
    organizer: { ...organizer, personId: organizerPersonId },
    participantCount,
    acceptedCount,
    announcePostId: event.announcePostId ?? null,
    createdAt: event.createdAt,
  }
}

/**
 * MON agenda dans ce réseau — ce que j'organise ET ce où je suis invité (tout
 * statut : décliné et annulé RESTENT visibles, l'écran choisit). Fenêtre
 * facultative sur le début ; sans fenêtre, les prochains passent d'abord, puis
 * l'historique le plus récent. Borné, et `truncated` dit la lacune. `now` choisit
 * la fenêtre ; les droits des événements associatifs sont relus à l'acte.
 */
export const myAgenda = networkQuery({
  args: { now: v.number(), from: v.optional(v.number()), to: v.optional(v.number()), expectedReaderPersonId: v.optional(v.id("persons")) },
  handler: async (ctx, args): Promise<{ items: EventDto[]; associationItems: AssociationAgendaDto[]; truncated: boolean }> => {
    const me = ctx.person._id
    if (args.expectedReaderPersonId !== undefined && args.expectedReaderPersonId !== me) return notFound()
    const profileOf = miniProfileCache(ctx)
    let truncated = false
    const organized = await ctx.db
      .query("events")
      .withIndex("by_network_organizer_startAt", (q) => {
        const base = q.eq("networkId", ctx.networkId).eq("organizerPersonId", me)
        if (args.from !== undefined && args.to !== undefined) return base.gte("startAt", args.from).lte("startAt", args.to)
        if (args.from !== undefined) return base.gte("startAt", args.from)
        if (args.to !== undefined) return base.lte("startAt", args.to)
        return base.gte("startAt", args.now)
      })
      .take(AGENDA_SCAN)
    if (organized.length >= AGENDA_SCAN) truncated = true
    // Sans fenêtre, les places restantes vont à l'historique le plus récent : 200 anciens ne cachent jamais le prochain.
    const organizedPast =
      args.from === undefined && args.to === undefined && organized.length < AGENDA_SCAN
        ? await ctx.db
            .query("events")
            .withIndex("by_network_organizer_startAt", (q) => q.eq("networkId", ctx.networkId).eq("organizerPersonId", me).lt("startAt", args.now))
            .order("desc")
            .take(AGENDA_SCAN - organized.length)
        : []
    const participations = await ctx.db
      .query("eventParticipants")
      .withIndex("by_network_person_eventStartAt", (q) => {
        const base = q.eq("networkId", ctx.networkId).eq("personId", me)
        if (args.from !== undefined && args.to !== undefined) return base.gte("eventStartAt", args.from).lte("eventStartAt", args.to)
        if (args.from !== undefined) return base.gte("eventStartAt", args.from)
        if (args.to !== undefined) return base.lte("eventStartAt", args.to)
        return base.gte("eventStartAt", args.now)
      })
      .take(AGENDA_SCAN)
    if (participations.length >= AGENDA_SCAN) truncated = true
    if (organizedPast.length > 0 && organizedPast.length >= AGENDA_SCAN - organized.length) truncated = true
    const participationsPast =
      args.from === undefined && args.to === undefined && participations.length < AGENDA_SCAN
        ? await ctx.db
            .query("eventParticipants")
            .withIndex("by_network_person_eventStartAt", (q) => q.eq("networkId", ctx.networkId).eq("personId", me).lt("eventStartAt", args.now))
            .order("desc")
            .take(AGENDA_SCAN - participations.length)
        : []
    if (participationsPast.length > 0 && participationsPast.length >= AGENDA_SCAN - participations.length) truncated = true
    const items: EventDto[] = []
    const associationItems: AssociationAgendaDto[] = []
    const associationSeen = new Set<Id<"events">>()
    for (const event of [...organizedPast, ...organized]) if (event.organizerPageId === undefined && await canReadModeratedContent(ctx, "event", event._id, me)) items.push(await toEventDto(ctx, event, { isOrganizer: true, participation: null, profileOf }))
    for (const participation of [...participationsPast, ...participations]) {
      const event = await ctx.db.get(participation.eventId)
      // La branche personnelle et son DTO restent identiques.
      if (event && event.networkId === ctx.networkId && event.organizerPageId === undefined && event.organizerPersonId !== undefined && await canReadModeratedContent(ctx, "event", event._id, me)) items.push(await toEventDto(ctx, event, { isOrganizer: false, participation, profileOf }))
      if (!event || event.networkId !== ctx.networkId || event.organizerPageId === undefined || participation.networkId !== ctx.networkId || associationSeen.has(event._id)) continue
      const confirmed = participation.status === "accepted"
      const waitlisted = participation.status === "pending" && participation.pageRegistrationSequence !== undefined && Number.isSafeInteger(participation.pageRegistrationSequence) && participation.pageRegistrationSequence > 0
      if (!confirmed && !waitlisted) continue
      if (!Number.isFinite(event.startAt) || !Number.isFinite(event.endAt) || event.endAt <= event.startAt) continue
      if ((args.from !== undefined && event.startAt < args.from) || (args.to !== undefined && event.startAt > args.to)) continue
      const access = await readableGalleryEvent(ctx, ctx.networkId, event._id, me, { allowCancelled: true })
      if (!access) continue
      associationSeen.add(event._id)
      associationItems.push({
        kind: "association", eventId: event._id, pageId: access.page._id, title: event.title,
        description: event.description ?? null, location: event.location ?? null,
        startAt: event.startAt, endAt: event.endAt, timeZone: event.timeZone,
        status: event.status, cancelledAt: event.cancelledAt ?? null, version: event.version ?? 1,
        organizer: { name: access.page.name, handle: access.page.handle }, registration: confirmed ? "confirmed" : "waitlisted",
      })
    }
    items.sort((a, b) => a.startAt - b.startAt)
    associationItems.sort((a, b) => a.startAt - b.startAt)
    return { items, associationItems, truncated }
  },
})

/**
 * Un flux de l'agenda, exhaustif par curseurs natifs. L'ancre fixe seulement la
 * période ; elle ne donne aucun droit. Une page filtrée vide garde sa suite et
 * les indications de découpage de Convex : jamais de rattrapage dans cet appel.
 */
export const paginateMyAgenda = networkQuery({
  args: {
    source: literals(["organized", "participations"] as const),
    period: literals(["upcoming", "history"] as const),
    anchor: v.number(),
    expectedReaderPersonId: v.id("persons"),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args): Promise<PaginationResult<AgendaRowDto>> => {
    const me = ctx.person._id
    if (args.expectedReaderPersonId !== me || !Number.isFinite(args.anchor)) return notFound()
    const requested = args.paginationOpts.numItems
    const requestedBytes = args.paginationOpts.maximumBytesRead
    const requestedRows = args.paginationOpts.maximumRowsRead
    const numItems = Number.isFinite(requested) ? Math.min(Math.max(Math.trunc(requested), 1), AGENDA_PAGE_MAX) : 20
    const maximumBytesRead = requestedBytes === undefined || !Number.isFinite(requestedBytes) ? AGENDA_PAGE_BYTES : Math.min(Math.max(Math.trunc(requestedBytes), 1), AGENDA_PAGE_BYTES)
    // Un endCursor réactif peut dépasser numItems ; borner aussi la lecture brute.
    const maximumRowsRead = requestedRows === undefined || !Number.isFinite(requestedRows) ? AGENDA_PAGE_MAX : Math.min(Math.max(Math.trunc(requestedRows), 1), AGENDA_PAGE_MAX)
    const paginationOpts = { ...args.paginationOpts, numItems, maximumBytesRead, maximumRowsRead }
    const order = args.period === "upcoming" ? "asc" : "desc"
    const profileOf = miniProfileCache(ctx)
    const seen = new Set<Id<"events">>()
    const page: AgendaRowDto[] = []
    const inPeriod = (event: Doc<"events">) => Number.isFinite(event.startAt) && (args.period === "upcoming" ? event.startAt >= args.anchor : event.startAt < args.anchor)

    if (args.source === "organized") {
      const result = await ctx.db.query("events")
        .withIndex("by_network_organizer_startAt", (q) => {
          const base = q.eq("networkId", ctx.networkId).eq("organizerPersonId", me)
          return args.period === "upcoming" ? base.gte("startAt", args.anchor) : base.lt("startAt", args.anchor)
        })
        .order(order).paginate(paginationOpts)
      for (const event of result.page) {
        if (event.networkId !== ctx.networkId || event.organizerPageId !== undefined || event.organizerPersonId !== me || seen.has(event._id) || !inPeriod(event)) continue
        if (!(await canReadModeratedContent(ctx, "event", event._id, me))) continue
        seen.add(event._id)
        page.push({ kind: "personal", event: await toEventDto(ctx, event, { isOrganizer: true, participation: null, profileOf }) })
      }
      return { ...result, page }
    }

    const result = await ctx.db.query("eventParticipants")
      .withIndex("by_network_person_eventStartAt", (q) => {
        const base = q.eq("networkId", ctx.networkId).eq("personId", me)
        return args.period === "upcoming" ? base.gte("eventStartAt", args.anchor) : base.lt("eventStartAt", args.anchor)
      })
      .order(order).paginate(paginationOpts)
    for (const participation of result.page) {
      if (participation.networkId !== ctx.networkId || participation.personId !== me) continue
      const event = await ctx.db.get(participation.eventId)
      if (!event || event.networkId !== ctx.networkId || seen.has(event._id) || !inPeriod(event)) continue
      if (event.organizerPageId === undefined) {
        if (event.organizerPersonId === undefined || event.organizerPersonId === me || !(await canReadModeratedContent(ctx, "event", event._id, me))) continue
        seen.add(event._id)
        page.push({ kind: "personal", event: await toEventDto(ctx, event, { isOrganizer: false, participation, profileOf }) })
        continue
      }
      const confirmed = participation.status === "accepted"
      const waitlisted = participation.status === "pending" && participation.pageRegistrationSequence !== undefined && Number.isSafeInteger(participation.pageRegistrationSequence) && participation.pageRegistrationSequence > 0
      if ((!confirmed && !waitlisted) || !Number.isFinite(event.endAt) || event.endAt <= event.startAt) continue
      const access = await readableGalleryEvent(ctx, ctx.networkId, event._id, me, { allowCancelled: true })
      if (!access) continue
      seen.add(event._id)
      page.push({
        kind: "association",
        event: {
          kind: "association", eventId: event._id, pageId: access.page._id, title: event.title,
          description: event.description ?? null, location: event.location ?? null,
          startAt: event.startAt, endAt: event.endAt, timeZone: event.timeZone,
          status: event.status, cancelledAt: event.cancelledAt ?? null, version: event.version ?? 1,
          organizer: { name: access.page.name, handle: access.page.handle }, registration: confirmed ? "confirmed" : "waitlisted",
        },
      })
    }
    return { ...result, page }
  },
})

/** La fiche d'un évènement — pour qui EN EST (refus indistinct sinon). */
export const getEvent = networkQuery({
  args: { eventId: v.id("events") },
  handler: async (ctx, args): Promise<EventDto> => {
    const { event, participation, isOrganizer } = await requireEventAccess(ctx, ctx.networkId, args.eventId, ctx.person._id)
    if (event.organizerPageId !== undefined) return notFound()
    return await toEventDto(ctx, event, { isOrganizer, participation, profileOf: miniProfileCache(ctx) })
  },
})

export type EventParticipantDto = {
  participationId: Id<"eventParticipants">
  status: PersonalEventParticipationStatus
  person: CounterpartLabel & { personId: Id<"persons"> }
}

/** Les invités d'un évènement, exhaustifs et paginés : à un évènement, les invités se voient. */
export const paginateEventParticipants = networkQuery({
  args: { eventId: v.id("events"), paginationOpts: paginationOptsValidator },
  handler: async (ctx, args): Promise<PaginationResult<EventParticipantDto>> => {
    const { event } = await requireEventAccess(ctx, ctx.networkId, args.eventId, ctx.person._id)
    // Les événements associatifs ne publient aucune liste de personnes.
    if (event.organizerPageId !== undefined) return notFound()
    const result = await ctx.db
      .query("eventParticipants")
      .withIndex("by_event_status", (q) => q.eq("eventId", args.eventId))
      .paginate({ ...args.paginationOpts, numItems: Math.min(Math.max(Math.trunc(args.paginationOpts.numItems), 1), PARTICIPANTS_PAGE_MAX) })
    const profileOf = miniProfileCache(ctx)
    const page: EventParticipantDto[] = []
    for (const row of result.page) page.push({ participationId: row._id, status: row.status, person: { ...(await counterpartOf(ctx, row.personId, profileOf)), personId: row.personId } })
    return { ...result, page }
  },
})
