/** DG-023 : billet QR volontaire, accueil collectif versionné et projections privées. */
import {
  ASSOCIATION_EVENT_ATTENDANCE_TICKET_TTL_MS,
  associationEventAttendanceCode, associationEventAttendanceWindow,
  isAssociationEventAttendanceOpen, parseAssociationEventAttendanceCode,
} from "../diaspora/associationEventRules"
import { paginationOptsValidator } from "convex/server"
import { v, type Infer } from "convex/values"

import type { Doc, Id } from "../../_generated/dataModel"
import type { QueryCtx } from "../../_generated/server"
import { isActiveMember } from "../../lib/access"
import { failAppRule, notFound } from "../../lib/errors"
import { networkMutation, networkQuery } from "../../lib/functions"
import { enforceRateLimit } from "../../lib/rateLimit"
import { assertDiasporaNetwork } from "../diaspora/facts"
import { readablePageOrNull } from "../pages/access"
import { miniProfileCache } from "../people/miniProfile"
import { pageEventAccess } from "./pageEventAccess"
import { countPageEventAttendance, nextPageEventAttendanceVersion, recordPageEventAttendance, resetPageEventAttendance } from "./pageEventAttendanceState"

type ReadCtx = Pick<QueryCtx, "db">
const PAGE_MAX = 50
const PAGE_BYTES = 2 * 1024 * 1024
const viewValidator = v.object({
  eventId: v.id("events"), opensAt: v.number(), closesAt: v.number(), isOpen: v.boolean(),
  canIssueTicket: v.boolean(), canManage: v.boolean(), checkedInAt: v.union(v.number(), v.null()),
  version: v.number(), recordedCount: v.union(v.number(), v.null()),
})
const rowValidator = v.object({ registrationId: v.id("eventParticipants"), displayName: v.union(v.string(), v.null()), checkedInAt: v.number(), version: v.number() })
const previewValidator = v.object({ registrationId: v.id("eventParticipants"), displayName: v.union(v.string(), v.null()), checkedInAt: v.union(v.number(), v.null()), version: v.number(), expiresAt: v.number() })

async function livePerson(ctx: ReadCtx, personId: Id<"persons">): Promise<boolean> {
  const person = await ctx.db.get(personId)
  return !!person && person.erasedAt === undefined && person.deletionRequestedAt === undefined
}

/** Le QR ne remplace aucune garde de réseau, de page ou d'audience. */
async function readableEvent(ctx: ReadCtx, network: Doc<"networks">, eventId: Id<"events">, personId: Id<"persons">) {
  if (!(await livePerson(ctx, personId))) return null
  const event = await ctx.db.get(eventId)
  if (!event || event.networkId !== network._id || !event.organizerPageId || event.organizerPersonId !== undefined) return null
  // Une page globalement masquée ne devient pas un accueil ouvert pour ses signataires.
  if (!(await readablePageOrNull(ctx, network, event.organizerPageId))) return null
  const access = await pageEventAccess(ctx, event, personId)
  return access?.moderation === "published" ? { event, access } : null
}

async function managedEvent(ctx: ReadCtx, network: Doc<"networks">, eventId: Id<"events">, personId: Id<"persons">) {
  const found = await readableEvent(ctx, network, eventId, personId)
  if (!found?.access.canManage) return notFound()
  return found.event
}

async function ownParticipation(ctx: ReadCtx, event: Doc<"events">, personId: Id<"persons">): Promise<Doc<"eventParticipants"> | null> {
  const row = await ctx.db.query("eventParticipants").withIndex("by_event_person", (q) => q.eq("eventId", event._id).eq("personId", personId)).unique()
  return row?.networkId === event.networkId ? row : null
}

async function admittedCandidate(ctx: ReadCtx, event: Doc<"events">, row: Doc<"eventParticipants">): Promise<boolean> {
  return row.eventId === event._id && row.networkId === event.networkId && row.status === "accepted" &&
    await livePerson(ctx, row.personId) && await isActiveMember(ctx, event.networkId, row.personId) &&
    (await pageEventAccess(ctx, event, row.personId))?.moderation === "published"
}

function requireOpen(event: Doc<"events">): void {
  if (event.status !== "scheduled" || !isAssociationEventAttendanceOpen(event, Date.now())) failAppRule("association_event_attendance_closed")
}

function checkVersion(row: Doc<"eventParticipants">, expected: number): void {
  if (!Number.isSafeInteger(expected) || expected < 0 || expected !== (row.pageAttendanceVersion ?? 0)) failAppRule("association_event_attendance_changed")
}

async function digest(code: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(code))
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("")
}

/** L'empreinte est cherchée dans l'événement demandé, jamais dans une table globale. */
async function ticketRow(ctx: ReadCtx, event: Doc<"events">, raw: string): Promise<Doc<"eventParticipants"> & { pageAttendanceTokenExpiresAt: number }> {
  const code = parseAssociationEventAttendanceCode(raw)
  if (!code) return notFound()
  const hash = await digest(code)
  const row = await ctx.db.query("eventParticipants").withIndex("by_event_pageAttendanceTokenHash", (q) => q.eq("eventId", event._id).eq("pageAttendanceTokenHash", hash)).unique()
  if (!row || row.pageAttendanceTokenExpiresAt === undefined || !Number.isFinite(row.pageAttendanceTokenExpiresAt) || Date.now() >= row.pageAttendanceTokenExpiresAt || !(await admittedCandidate(ctx, event, row))) return notFound()
  return { ...row, pageAttendanceTokenExpiresAt: row.pageAttendanceTokenExpiresAt }
}

export const get = networkQuery({
  feature: "groupsAndEvents",
  args: { eventId: v.id("events"), expectedReaderPersonId: v.id("persons") }, returns: v.union(v.null(), viewValidator),
  handler: async (ctx, args) => {
    assertDiasporaNetwork(ctx.network)
    if (ctx.person._id !== args.expectedReaderPersonId) return notFound()
    const found = await readableEvent(ctx, ctx.network, args.eventId, ctx.person._id)
    if (!found) return null
    const { event, access } = found
    const own = await ownParticipation(ctx, event, ctx.person._id)
    const isOpen = event.status === "scheduled" && isAssociationEventAttendanceOpen(event, Date.now())
    return {
      eventId: event._id, ...associationEventAttendanceWindow(event), isOpen, canManage: access.canManage,
      canIssueTicket: isOpen && own !== null && await admittedCandidate(ctx, event, own),
      checkedInAt: own?.pageAttendanceCheckedInAt ?? null, version: own?.pageAttendanceVersion ?? 0,
      recordedCount: access.canManage ? await countPageEventAttendance(ctx, event._id) : null,
    }
  },
})

export const listPresent = networkQuery({
  feature: "groupsAndEvents",
  args: { eventId: v.id("events"), paginationOpts: paginationOptsValidator, expectedReaderPersonId: v.id("persons") },
  returns: v.object({ items: v.array(rowValidator), continueCursor: v.union(v.string(), v.null()), isDone: v.boolean() }),
  handler: async (ctx, args) => {
    assertDiasporaNetwork(ctx.network)
    if (ctx.person._id !== args.expectedReaderPersonId) return notFound()
    const event = await managedEvent(ctx, ctx.network, args.eventId, ctx.person._id)
    const requested = args.paginationOpts.numItems, bytes = args.paginationOpts.maximumBytesRead
    const numItems = Number.isFinite(requested) ? Math.min(Math.max(Math.trunc(requested), 1), PAGE_MAX) : 20
    const maximumBytesRead = bytes === undefined || !Number.isFinite(bytes) ? PAGE_BYTES : Math.min(Math.max(Math.trunc(bytes), 1), PAGE_BYTES)
    const result = await ctx.db.query("eventParticipants")
      .withIndex("by_event_pageAttendanceCheckedInAt", (q) => q.eq("eventId", event._id).gt("pageAttendanceCheckedInAt", undefined))
      .order("desc").paginate({ ...args.paginationOpts, numItems, maximumBytesRead })
    const profileOf = miniProfileCache(ctx)
    const items: Infer<typeof rowValidator>[] = []
    for (const row of result.page) {
      if (row.networkId !== ctx.networkId || row.pageAttendanceCheckedInAt === undefined || !(await livePerson(ctx, row.personId))) continue
      // Un ancien présent devenu privé reste corrigeable, mais son nom disparaît.
      const displayName = await admittedCandidate(ctx, event, row) ? (await profileOf(row.personId)).displayName : null
      items.push({ registrationId: row._id, displayName, checkedInAt: row.pageAttendanceCheckedInAt, version: row.pageAttendanceVersion ?? 0 })
    }
    return { items, continueCursor: result.isDone ? null : result.continueCursor, isDone: result.isDone }
  },
})

export const issueTicket = networkMutation({
  feature: "groupsAndEvents",
  minStatus: "en_attente", args: { eventId: v.id("events") }, returns: v.object({ code: v.string(), expiresAt: v.number() }),
  handler: async (ctx, args) => {
    assertDiasporaNetwork(ctx.network)
    await enforceRateLimit(ctx, "event.respond", ctx.person._id)
    const found = await readableEvent(ctx, ctx.network, args.eventId, ctx.person._id)
    if (!found) return notFound()
    const own = await ownParticipation(ctx, found.event, ctx.person._id)
    if (!own || !(await admittedCandidate(ctx, found.event, own))) return notFound()
    requireOpen(found.event)
    const nonce = `${crypto.randomUUID().replace(/-/g, "")}${crypto.randomUUID().replace(/-/g, "")}`
    const code = associationEventAttendanceCode(nonce)
    if (!code) return notFound()
    const expiresAt = Math.min(Date.now() + ASSOCIATION_EVENT_ATTENDANCE_TICKET_TTL_MS, found.event.endAt)
    await ctx.db.patch(own._id, { pageAttendanceTokenHash: await digest(code), pageAttendanceTokenExpiresAt: expiresAt, pageAttendanceVersion: nextPageEventAttendanceVersion(own) })
    return { code, expiresAt }
  },
})

export const previewTicket = networkMutation({
  feature: "groupsAndEvents",
  args: { eventId: v.id("events"), code: v.string() }, returns: previewValidator,
  handler: async (ctx, args) => {
    assertDiasporaNetwork(ctx.network)
    await enforceRateLimit(ctx, "event.attendance", ctx.person._id)
    const event = await managedEvent(ctx, ctx.network, args.eventId, ctx.person._id)
    requireOpen(event)
    const row = await ticketRow(ctx, event, args.code)
    return { registrationId: row._id, displayName: (await miniProfileCache(ctx)(row.personId)).displayName, checkedInAt: row.pageAttendanceCheckedInAt ?? null, version: row.pageAttendanceVersion ?? 0, expiresAt: row.pageAttendanceTokenExpiresAt }
  },
})

export const checkIn = networkMutation({
  feature: "groupsAndEvents",
  args: { eventId: v.id("events"), code: v.string(), expectedVersion: v.number() }, returns: v.object({ alreadyRecorded: v.boolean() }),
  handler: async (ctx, args) => {
    assertDiasporaNetwork(ctx.network)
    await enforceRateLimit(ctx, "event.attendance", ctx.person._id)
    const event = await managedEvent(ctx, ctx.network, args.eventId, ctx.person._id)
    requireOpen(event)
    const row = await ticketRow(ctx, event, args.code)
    if (row.pageAttendanceCheckedInAt !== undefined) return { alreadyRecorded: true }
    checkVersion(row, args.expectedVersion)
    await ctx.db.patch(row._id, { pageAttendanceCheckedInAt: Date.now(), pageAttendanceVersion: nextPageEventAttendanceVersion(row) })
    await recordPageEventAttendance(ctx, row)
    return { alreadyRecorded: false }
  },
})

export const clear = networkMutation({
  feature: "groupsAndEvents",
  args: { eventId: v.id("events"), registrationId: v.id("eventParticipants"), expectedVersion: v.number() }, returns: v.null(),
  handler: async (ctx, args) => {
    assertDiasporaNetwork(ctx.network)
    await enforceRateLimit(ctx, "event.attendance", ctx.person._id)
    const event = await managedEvent(ctx, ctx.network, args.eventId, ctx.person._id)
    const row = await ctx.db.get(args.registrationId)
    if (!row || row.eventId !== event._id || row.networkId !== ctx.networkId) return notFound()
    checkVersion(row, args.expectedVersion)
    await resetPageEventAttendance(ctx, row)
    return null
  },
})
