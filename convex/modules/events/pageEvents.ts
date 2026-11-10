/**
 * DG-010 : événements d'une PAGE d'association. Création et gestion collectives,
 * inscriptions volontaires, audience vivante ; aucun propriétaire personnel,
 * aucune liste d'inscrits, aucune annonce publique depuis l'API personnelle.
 */
import {
  assertPersonalEventDescription,
  assertPersonalEventLocation,
  assertPersonalEventTimeZone,
  assertPersonalEventTitle,
  assertPersonalEventWindow,
} from "@antsia/social-domain/events"
import { isDomainViolation } from "@antsia/social-domain/violation"
import { checkAssociationEventCapacityChange, isAssociationEventRegistrationOpen, parseAssociationEventCapacity, parseAssociationEventDeadline } from "../diaspora/associationEventRules"
import { paginationOptsValidator } from "convex/server"
import { v, type Infer } from "convex/values"

import { internal } from "../../_generated/api"
import type { Doc, Id } from "../../_generated/dataModel"
import type { QueryCtx } from "../../_generated/server"
import { memberHasStatus } from "../../lib/access"
import { failAppRule, notFound } from "../../lib/errors"
import { networkMutation, networkQuery } from "../../lib/functions"
import { enforceRateLimit } from "../../lib/rateLimit"
import { assertDiasporaNetwork } from "../diaspora/facts"
import { moderatePageContentWrite } from "../moderation/policy"
import { isPageClosedByBlocks } from "../pages/closedByBlocks"
import { participationOf } from "./events"
import { associationEventPage, canManagePageEvent, pageEventAccess, type PageEventAccess } from "./pageEventAccess"
import {
  fillPageEventSeatsNow, isPageEventWaitlisted, pageEventRegistrationCounts,
  pageEventWaitlistPosition, registerPageEventParticipation, withdrawPageEventParticipation,
} from "./pageEventRegistrations"
import { pageEventReminderView } from "./pageEventReminders"
import { pageEventCancellationReasonValidator } from "./tables"

const PAGE_MAX = 50
const PAGE_BYTES = 2 * 1024 * 1024
const audienceValidator = v.union(v.literal("network"), v.literal("association"))
const inputValidators = {
  pageId: v.id("pages"), title: v.string(), description: v.string(), location: v.string(),
  startAt: v.number(), endAt: v.number(), timeZone: v.string(), audience: v.optional(audienceValidator),
  capacity: v.optional(v.union(v.number(), v.null())),
  registrationClosesAt: v.optional(v.union(v.number(), v.null())),
}
const viewValidator = v.object({
  eventId: v.id("events"), pageId: v.id("pages"), title: v.string(), description: v.string(), location: v.string(),
  startAt: v.number(), endAt: v.number(), timeZone: v.string(), audience: audienceValidator,
  status: v.union(v.literal("scheduled"), v.literal("cancelled")), version: v.number(),
  organizer: v.object({ name: v.string(), handle: v.string() }),
  moderation: v.union(v.literal("published"), v.literal("pending_review"), v.literal("removed")),
  isRegistered: v.boolean(), canManage: v.boolean(), canRegister: v.boolean(),
  capacity: v.union(v.number(), v.null()), confirmedCount: v.number(), waitlistCount: v.number(),
  remainingPlaces: v.union(v.number(), v.null()),
  registration: v.union(v.literal("none"), v.literal("confirmed"), v.literal("waitlisted")),
  waitlistPosition: v.union(v.number(), v.null()),
  registrationClosesAt: v.union(v.number(), v.null()), registrationOpen: v.boolean(),
  reminderEnabled: v.boolean(), reminderAt: v.union(v.number(), v.null()),
  reminderState: v.union(v.literal("off"), v.literal("waiting_confirmation"), v.literal("scheduled"), v.literal("recorded"), v.literal("expired")),
})

interface EventInput {
  readonly title: string
  readonly description: string
  readonly location: string
  readonly startAt: number
  readonly endAt: number
  readonly timeZone: string
  readonly audience?: "network" | "association"
}

function parse(input: EventInput) {
  try {
    assertPersonalEventWindow(input)
    return {
      title: assertPersonalEventTitle(input.title),
      description: assertPersonalEventDescription(input.description),
      location: assertPersonalEventLocation(input.location),
      startAt: input.startAt, endAt: input.endAt,
      timeZone: assertPersonalEventTimeZone(input.timeZone),
      pageAudience: input.audience ?? "association",
    }
  } catch (error) {
    if (isDomainViolation(error)) return failAppRule("association_event_invalid")
    throw error
  }
}

function checkVersion(event: Doc<"events">, expected: number) {
  if (!Number.isSafeInteger(expected) || expected < 1 || expected !== (event.version ?? 1)) failAppRule("association_event_version_changed")
}

function parseCapacity(value: number | null | undefined): number | null {
  const result = parseAssociationEventCapacity(value)
  if (!result.ok) return failAppRule(result.code)
  return result.value
}

function parseDeadline(value: number | null | undefined, startAt: number): number | null {
  const result = parseAssociationEventDeadline(value, startAt)
  if (!result.ok) return failAppRule(result.code)
  return result.value
}

/** Le rejeu compare le corps normalisé, indépendamment de l'heure présente. */
function sameTerms(event: Doc<"events">, terms: ReturnType<typeof parse>): boolean {
  return event.title === terms.title && (event.description ?? "") === (terms.description ?? "") &&
    (event.location ?? "") === (terms.location ?? "") && event.startAt === terms.startAt &&
    event.endAt === terms.endAt && event.timeZone === terms.timeZone &&
    (event.pageAudience ?? "association") === terms.pageAudience
}

async function managedPage(ctx: Pick<QueryCtx, "db">, network: Doc<"networks">, pageId: Id<"pages">, personId: Id<"persons">) {
  const page = await associationEventPage(ctx, network, pageId, personId)
  if (!page) return notFound()
  if (!(await canManagePageEvent(ctx, page, personId))) return failAppRule("association_event_access_required")
  return page
}

async function managedEvent(ctx: Pick<QueryCtx, "db">, networkId: Id<"networks">, eventId: Id<"events">, personId: Id<"persons">) {
  const event = await ctx.db.get(eventId)
  if (!event || event.networkId !== networkId || event.organizerPageId === undefined) return notFound()
  const access = await pageEventAccess(ctx, event, personId)
  if (!access || !access.canManage) return notFound()
  return { event, access }
}

async function viewOf(ctx: Pick<QueryCtx, "db" | "runQuery">, event: Doc<"events">, access: PageEventAccess, personId: Id<"persons">): Promise<Infer<typeof viewValidator>> {
  const participation = await participationOf(ctx, event._id, personId)
  const isRegistered = participation?.networkId === event.networkId && participation.status === "accepted"
  const isWaitlisted = participation?.networkId === event.networkId && isPageEventWaitlisted(participation)
  const { confirmedCount, waitlistCount } = await pageEventRegistrationCounts(ctx, event._id)
  const capacity = event.pageCapacity ?? null
  const now = Date.now()
  const registrationClosesAt = event.pageRegistrationClosesAt ?? null
  const registrationOpen = event.status === "scheduled" && access.moderation === "published" && isAssociationEventRegistrationOpen({ startAt: event.startAt, registrationClosesAt }, now)
  return {
    eventId: event._id, pageId: access.page._id, title: event.title,
    description: event.description ?? "", location: event.location ?? "",
    startAt: event.startAt, endAt: event.endAt, timeZone: event.timeZone,
    audience: event.pageAudience ?? "association", status: event.status, version: event.version ?? 1,
    organizer: { name: access.page.name, handle: access.page.handle }, moderation: access.moderation,
    isRegistered, canManage: access.canManage,
    capacity, confirmedCount, waitlistCount, remainingPlaces: capacity === null ? null : Math.max(0, capacity - confirmedCount),
    registration: isRegistered ? "confirmed" : isWaitlisted ? "waitlisted" : "none",
    waitlistPosition: isWaitlisted ? await pageEventWaitlistPosition(ctx, participation) : null,
    registrationClosesAt, registrationOpen,
    ...pageEventReminderView(event, participation?.networkId === event.networkId ? participation : null, access.moderation === "published", now),
    canRegister: !isRegistered && !isWaitlisted && registrationOpen && await memberHasStatus(ctx, event.networkId, personId, "declaree"),
  }
}

export const listForPage = networkQuery({
  args: { pageId: v.id("pages"), paginationOpts: paginationOptsValidator },
  returns: v.object({ items: v.array(viewValidator), continueCursor: v.union(v.string(), v.null()), isDone: v.boolean() }),
  handler: async (ctx, args) => {
    assertDiasporaNetwork(ctx.network)
    if (!(await associationEventPage(ctx, ctx.network, args.pageId, ctx.person._id))) return notFound()
    const requested = args.paginationOpts.numItems
    const requestedBytes = args.paginationOpts.maximumBytesRead
    const numItems = Number.isFinite(requested) ? Math.min(Math.max(Math.trunc(requested), 1), PAGE_MAX) : 20
    const maximumBytesRead = requestedBytes === undefined || !Number.isFinite(requestedBytes) ? PAGE_BYTES : Math.min(Math.max(Math.trunc(requestedBytes), 1), PAGE_BYTES)
    const result = await ctx.db.query("events")
      .withIndex("by_network_page_startAt", (q) => q.eq("networkId", ctx.networkId).eq("organizerPageId", args.pageId))
      .paginate({ ...args.paginationOpts, numItems, maximumBytesRead })
    const items: Infer<typeof viewValidator>[] = []
    for (const event of result.page) {
      const access = await pageEventAccess(ctx, event, ctx.person._id)
      if (access) items.push(await viewOf(ctx, event, access, ctx.person._id))
    }
    return { items, continueCursor: result.isDone ? null : result.continueCursor, isDone: result.isDone }
  },
})

export const get = networkQuery({
  args: { eventId: v.id("events") }, returns: v.union(v.null(), viewValidator),
  handler: async (ctx, args) => {
    assertDiasporaNetwork(ctx.network)
    const event = await ctx.db.get(args.eventId)
    if (!event || event.networkId !== ctx.networkId || !event.organizerPageId) return null
    const access = await pageEventAccess(ctx, event, ctx.person._id)
    return access ? await viewOf(ctx, event, access, ctx.person._id) : null
  },
})

export const create = networkMutation({
  args: { ...inputValidators, idempotencyKey: v.string() },
  returns: v.object({ eventId: v.id("events"), created: v.boolean() }),
  handler: async (ctx, args) => {
    assertDiasporaNetwork(ctx.network)
    const page = await managedPage(ctx, ctx.network, args.pageId, ctx.person._id)
    await enforceRateLimit(ctx, "event.create", ctx.person._id)
    await enforceRateLimit(ctx, "event.create", `page:${page._id}`)
    const key = args.idempotencyKey.trim()
    if (key.length === 0 || key.length > 128) return failAppRule("association_event_invalid")
    const terms = parse(args)
    const capacity = parseCapacity(args.capacity)
    const registrationClosesAt = parseDeadline(args.registrationClosesAt, terms.startAt)
    const existing = await ctx.db.query("events").withIndex("by_page_idempotency", (q) => q.eq("organizerPageId", page._id).eq("idempotencyKey", key)).unique()
    if (existing) {
      if (existing.networkId !== ctx.networkId) return notFound()
      if (!sameTerms(existing, terms) || (existing.pageCapacity ?? null) !== capacity || (existing.pageRegistrationClosesAt ?? null) !== registrationClosesAt) return failAppRule("association_event_version_changed", {}, "conflict")
      return { eventId: existing._id, created: false }
    }
    const now = Date.now()
    if (terms.startAt <= now) return failAppRule("association_event_invalid")
    const eventId = await ctx.db.insert("events", {
      ...terms, pageCapacity: capacity ?? undefined, pageRegistrationClosesAt: registrationClosesAt ?? undefined,
      networkId: ctx.networkId, organizerPageId: page._id, createdByPersonId: ctx.person._id,
      status: "scheduled", version: 1, idempotencyKey: key, createdAt: now, updatedAt: now,
    })
    await moderatePageContentWrite(ctx, { networkId: ctx.networkId, pageId: page._id, kind: "event", id: eventId, text: `${terms.title} ${terms.description ?? ""} ${terms.location ?? ""}` })
    return { eventId, created: true }
  },
})

export const update = networkMutation({
  args: { ...inputValidators, eventId: v.id("events"), expectedVersion: v.number() }, returns: v.null(),
  handler: async (ctx, args) => {
    assertDiasporaNetwork(ctx.network)
    const { event, access } = await managedEvent(ctx, ctx.networkId, args.eventId, ctx.person._id)
    if (args.pageId !== access.page._id) return notFound()
    await enforceRateLimit(ctx, "event.manage", ctx.person._id)
    await enforceRateLimit(ctx, "event.manage", `page:${access.page._id}`)
    checkVersion(event, args.expectedVersion)
    if (event.status === "cancelled") return failAppRule("association_event_cancelled")
    const terms = parse(args)
    const capacity = parseCapacity(args.capacity === undefined ? event.pageCapacity : args.capacity)
    const registrationClosesAt = parseDeadline(args.registrationClosesAt === undefined ? event.pageRegistrationClosesAt : args.registrationClosesAt, terms.startAt)
    const { confirmedCount } = await pageEventRegistrationCounts(ctx, event._id)
    const capacityChange = checkAssociationEventCapacityChange(capacity, confirmedCount)
    if (!capacityChange.ok) return failAppRule(capacityChange.code)
    const scheduleChanged = terms.startAt !== event.startAt || terms.endAt !== event.endAt || terms.timeZone !== event.timeZone
    if (scheduleChanged) {
      const participation = await ctx.db.query("eventParticipants").withIndex("by_event_person", (q) => q.eq("eventId", event._id)).first()
      if (participation) return failAppRule("association_event_schedule_locked")
      if (terms.startAt <= Date.now()) return failAppRule("association_event_invalid")
    }
    // Capacité et clôture seules conservent la décision de modération.
    if (!sameTerms(event, terms)) await moderatePageContentWrite(ctx, { networkId: ctx.networkId, pageId: access.page._id, kind: "event", id: event._id, text: `${terms.title} ${terms.description ?? ""} ${terms.location ?? ""}` })
    await ctx.db.patch(event._id, { ...terms, pageCapacity: capacity ?? undefined, pageRegistrationClosesAt: registrationClosesAt ?? undefined, version: (event.version ?? 1) + 1, updatedAt: Date.now() })
    // EV-03 : une capacité relevée promeut des personnes en attente, avisées ; jamais le responsable lui-même.
    await fillPageEventSeatsNow(ctx, ctx.networkId, event._id, ctx.person._id)
    return null
  },
})

/**
 * Annuler l'événement de la page. EV-03 (issue antsia#97) : `reason`, FACULTATIF (les écrans
 * déjà en ligne annulent sans motif), est pris dans la liste fermée du domaine, stocké sur
 * l'événement et lu sur sa fiche (`cancellationReason`), jamais recopié dans un avis. Chaque
 * inscrit confirmé et chaque personne en attente reçoit l'avis neutre « événement annulé »,
 * diffusé par lots hors de cette transaction ; le responsable qui annule ne l'est pas.
 * Rejouée sur un événement déjà annulé : rien ne change (ni motif, ni avis).
 */
export const cancel = networkMutation({
  args: { eventId: v.id("events"), expectedVersion: v.number(), reason: v.optional(pageEventCancellationReasonValidator) }, returns: v.null(),
  handler: async (ctx, args) => {
    assertDiasporaNetwork(ctx.network)
    const { event, access } = await managedEvent(ctx, ctx.networkId, args.eventId, ctx.person._id)
    await enforceRateLimit(ctx, "event.manage", ctx.person._id)
    await enforceRateLimit(ctx, "event.manage", `page:${access.page._id}`)
    checkVersion(event, args.expectedVersion)
    if (event.status === "cancelled") return null
    const now = Date.now()
    await ctx.db.patch(event._id, { status: "cancelled", cancelledAt: now, ...(args.reason !== undefined ? { pageCancellationReason: args.reason } : {}), version: (event.version ?? 1) + 1, updatedAt: now })
    await ctx.scheduler.runAfter(0, internal.modules.events.pageEventNotices.notifyPageEventCancellation, { networkId: ctx.networkId, eventId: event._id, phase: "accepted", cursor: null, sourcePersonId: ctx.person._id })
    return null
  },
})

/**
 * EV-03 : le motif d'annulation, lu avec les droits du lecteur (même garde que la fiche, `get`).
 * Une projection À PART : la vue de la fiche ne change pas de forme pour les écrans en ligne.
 * `null` : événement illisible pour ce lecteur, ou non annulé ; `reason: null` : annulé sans motif.
 */
export const cancellationReason = networkQuery({
  args: { eventId: v.id("events") },
  returns: v.union(v.null(), v.object({ reason: v.union(pageEventCancellationReasonValidator, v.null()) })),
  handler: async (ctx, args) => {
    assertDiasporaNetwork(ctx.network)
    const event = await ctx.db.get(args.eventId)
    if (!event || event.networkId !== ctx.networkId || !event.organizerPageId || event.status !== "cancelled") return null
    if (!(await pageEventAccess(ctx, event, ctx.person._id))) return null
    return { reason: event.pageCancellationReason ?? null }
  },
})

export const register = networkMutation({
  args: { eventId: v.id("events") }, returns: v.null(),
  handler: async (ctx, args) => {
    assertDiasporaNetwork(ctx.network)
    await enforceRateLimit(ctx, "event.respond", ctx.person._id)
    const event = await ctx.db.get(args.eventId)
    if (!event || event.networkId !== ctx.networkId || !event.organizerPageId || event.organizerPersonId !== undefined) return notFound()
    const access = await pageEventAccess(ctx, event, ctx.person._id)
    if (!access || access.moderation !== "published") return notFound()
    // Issue #141 : une page dont tous les signataires vivants sont en blocage avec la personne se
    // tait comme un évènement introuvable — jamais « vous êtes bloqué ». Annuler reste possible.
    if (await isPageClosedByBlocks(ctx, access.page, ctx.person._id)) return notFound()
    if (!isAssociationEventRegistrationOpen({ startAt: event.startAt, registrationClosesAt: event.pageRegistrationClosesAt }, Date.now())) {
      const own = await participationOf(ctx, event._id, ctx.person._id)
      if (own && own.networkId !== ctx.networkId) return notFound()
      if (own?.status === "accepted" || isPageEventWaitlisted(own)) return null
      return failAppRule("association_event_registration_closed")
    }
    if (event.status === "cancelled") return failAppRule("association_event_cancelled")
    await registerPageEventParticipation(ctx, event, ctx.person._id)
    return null
  },
})

/** Retirer sa présence ne demande aucun nouvel accès au contenu privé quitté. */
export const unregister = networkMutation({
  minStatus: "en_attente", args: { eventId: v.id("events") }, returns: v.null(),
  handler: async (ctx, args) => {
    assertDiasporaNetwork(ctx.network)
    await enforceRateLimit(ctx, "event.respond", ctx.person._id)
    const event = await ctx.db.get(args.eventId)
    if (!event || event.networkId !== ctx.networkId || !event.organizerPageId || event.organizerPersonId !== undefined) return notFound()
    const participation = await participationOf(ctx, event._id, ctx.person._id)
    if (!participation || participation.networkId !== ctx.networkId) return notFound()
    await withdrawPageEventParticipation(ctx, participation)
    return null
  },
})
