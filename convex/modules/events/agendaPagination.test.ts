// @vitest-environment edge-runtime
/** DG-023 : curseurs natifs d'agenda, droits vivants et projections séparées. */
import { engineErrorCode } from "@antsia/social-contracts/errors"
import type { FunctionReturnType, PaginationOptions } from "convex/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { api, internal } from "../../_generated/api"
import type { Doc, Id } from "../../_generated/dataModel"
import { SEED_CONFIRMATION } from "../../seeds/foundations"
import { joinDeclaredDiasporaFixture, openNetworkFeatures, testConvex } from "../../test.setup"
import { recordParticipation } from "./events"

type T = ReturnType<typeof testConvex>
type Source = "organized" | "participations"
type Period = "upcoming" | "history"
const P = api.modules.events.events
const E = api.modules.events.pageEvents
const A = api.modules.diaspora.associations
const NOW = Date.UTC(2026, 9, 18, 10)
const HOUR = 3_600_000
const START = NOW + 2 * HOUR
const PAGE_BYTES = 256 * 1024

beforeEach(() => {
  vi.stubEnv("CONVEX_CLOUD_URL", "http://127.0.0.1:3210")
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs() })

async function member(t: T, networkId: Id<"networks">, handle: string, displayName: string) {
  const as = t.withIdentity({ subject: `agenda-pagination-${handle}` })
  const personId = await as.mutation(api.modules.people.persons.ensureMyPerson, {})
  await as.mutation(api.modules.people.consents.recordConsent, { purpose: "social_profile", origin: "onboarding" })
  await as.mutation(api.modules.people.profile.publishMyProfile, { handle, displayName })
  await t.run((ctx) => ctx.db.insert("identityLinks", { personId, provider: "idn", subject: `agenda-pagination-idn-${personId}`, loa: 2, nationality: "GA", linkedAt: NOW }))
  await joinDeclaredDiasporaFixture(as, { networkId, facet: { countryOfResidence: "FR", city: "Lyon" } })
  return { as, personId }
}

async function fixture() {
  const t = testConvex()
  const { root } = await t.mutation(internal.seeds.foundations.run, { confirmNonProduction: SEED_CONFIRMATION })
  const { network: networkId } = await t.mutation(internal.modules.diaspora.seed.run, { confirmNonProduction: SEED_CONFIRMATION })
  await openNetworkFeatures(t, networkId)
  const manager = await member(t, networkId, "agenda-equipe", "Awa OGOOUÉ")
  const alice = await member(t, networkId, "agenda-alice", "Alice NDONG")
  const outsider = await member(t, networkId, "agenda-tiers", "Jean MBA")
  const { pageId, signatureId } = await t.run(async (ctx) => {
    const pageId = await ctx.db.insert("pages", { networkId, handle: "association-pagination", name: "Association de recette", ownerKind: "association", trust: "community", trustRank: 0, visibility: "network", onRoot: false, status: "active", searchText: "association recette", createdAt: NOW, updatedAt: NOW })
    const signatureId = await ctx.db.insert("pageSignatories", { networkId, pageId, personId: manager.personId, role: "admin", acceptedAt: NOW, createdAt: NOW, updatedAt: NOW })
    await ctx.db.insert("moderationPolicies", { networkId, surface: "event", preReview: false, maxLinks: 2, maxWrites: 100, windowMs: 60_000, updatedAt: NOW })
    return { pageId, signatureId }
  })
  const membership = await alice.as.mutation(A.requestAssociationMembership, { networkId, pageId })
  await manager.as.mutation(A.decideAssociationMembership, { networkId, membershipId: membership.membershipId, expectedVersion: membership.version, decision: "accept" })
  return { t, root, networkId, pageId, signatureId, associationMembershipId: membership.membershipId, manager, alice, outsider }
}
type Fixture = Awaited<ReturnType<typeof fixture>>
type Reader = Fixture["alice"]

function pageArgs(f: Fixture, source: Source, period: Period = "upcoming", cursor: string | null = null, numItems = 20, who: Reader = f.alice) {
  return { networkId: f.networkId, source, period, anchor: NOW, expectedReaderPersonId: who.personId, paginationOpts: { numItems, cursor } }
}

async function codeOf(promise: Promise<unknown>) {
  try { await promise } catch (error) { return engineErrorCode(error) }
  return null
}

/** Fixture de volume sans contourner les sessions utilisées par les lectures. */
async function personal(f: Fixture, input: { organizer?: Reader; person?: Reader; startAt?: number; status?: Doc<"eventParticipants">["status"]; networkId?: Id<"networks">; key: string }) {
  const organizer = input.organizer ?? f.manager
  const startAt = input.startAt ?? START
  const networkId = input.networkId ?? f.networkId
  return await f.t.run(async (ctx) => {
    const eventId = await ctx.db.insert("events", { networkId, organizerPersonId: organizer.personId, title: `Personnel ${input.key}`, startAt, endAt: startAt + HOUR, timeZone: "UTC", status: "scheduled", idempotencyKey: input.key, createdAt: NOW, updatedAt: NOW })
    if (input.person) {
      const participationId = await ctx.db.insert("eventParticipants", { networkId, eventId, personId: input.person.personId, invitedByPersonId: organizer.personId, status: input.status ?? "pending", eventStartAt: startAt, createdAt: NOW })
      await recordParticipation(ctx, { _id: participationId, eventId }, input.status === "accepted")
    }
    return eventId
  })
}

async function association(f: Fixture, input: { key: string; startAt?: number; person?: Reader; status?: Doc<"eventParticipants">["status"]; sequence?: number; moderation?: "published" | "pending_review" | "removed"; cancelled?: boolean; audience?: "association" | "network" }) {
  const startAt = input.startAt ?? START
  return await f.t.run(async (ctx) => {
    const eventId = await ctx.db.insert("events", { networkId: f.networkId, organizerPageId: f.pageId, createdByPersonId: f.manager.personId, pageAudience: input.audience ?? "association", title: `Collectif ${input.key}`, description: "Rencontre associative", location: "Lyon", startAt, endAt: startAt + HOUR, timeZone: "Pacific/Kiritimati", status: input.cancelled ? "cancelled" : "scheduled", ...(input.cancelled ? { cancelledAt: NOW } : {}), version: 1, idempotencyKey: input.key, createdAt: NOW, updatedAt: NOW })
    await ctx.db.insert("moderationContentStates", { networkId: f.networkId, targetKind: "event", targetId: eventId, ownerPageId: f.pageId, status: input.moderation ?? "published", createdAt: NOW, updatedAt: NOW })
    let participationId: Id<"eventParticipants"> | null = null
    if (input.person) participationId = await ctx.db.insert("eventParticipants", { networkId: f.networkId, eventId, personId: input.person.personId, invitedByPersonId: input.person.personId, status: input.status ?? "accepted", ...(input.sequence === undefined ? {} : { pageRegistrationSequence: input.sequence }), eventStartAt: startAt, createdAt: NOW })
    return { eventId, participationId }
  })
}

async function nativePage(f: Fixture, source: Source, period: Period, paginationOpts: PaginationOptions, who: Reader = f.alice) {
  return await f.t.run(async (ctx) => {
    if (source === "organized") return await ctx.db.query("events")
      .withIndex("by_network_organizer_startAt", (q) => {
        const base = q.eq("networkId", f.networkId).eq("organizerPersonId", who.personId)
        return period === "upcoming" ? base.gte("startAt", NOW) : base.lt("startAt", NOW)
      }).order(period === "upcoming" ? "asc" : "desc").paginate(paginationOpts)
    return await ctx.db.query("eventParticipants")
      .withIndex("by_network_person_eventStartAt", (q) => {
        const base = q.eq("networkId", f.networkId).eq("personId", who.personId)
        return period === "upcoming" ? base.gte("eventStartAt", NOW) : base.lt("eventStartAt", NOW)
      }).order(period === "upcoming" ? "asc" : "desc").paginate(paginationOpts)
  })
}

describe("paginateMyAgenda — pages d'index natives", () => {
  for (const source of ["organized", "participations"] as const) {
    it(`parcourt plus de 200 événements au même début sans lacune ni doublon (${source})`, async () => {
      const f = await fixture()
      const inserted = await f.t.run(async (ctx) => {
        const ids: Id<"events">[] = []
        for (let index = 0; index < 205; index += 1) {
          const organizer = source === "organized" ? f.alice : f.manager
          const eventId = await ctx.db.insert("events", { networkId: f.networkId, organizerPersonId: organizer.personId, title: `Même début ${index}`, startAt: START, endAt: START + HOUR, timeZone: "UTC", status: "scheduled", idempotencyKey: `same-start-${source}-${index}`, createdAt: NOW, updatedAt: NOW })
          ids.push(eventId)
          if (source === "participations") await ctx.db.insert("eventParticipants", { networkId: f.networkId, eventId, personId: f.alice.personId, invitedByPersonId: f.manager.personId, status: "pending", eventStartAt: START, createdAt: NOW })
        }
        return ids
      })
      const seen: Id<"events">[] = []
      let cursor: string | null = null
      let finished = false
      for (let count = 0; count < 20; count += 1) {
        const result: FunctionReturnType<typeof P.paginateMyAgenda> = await f.alice.as.query(P.paginateMyAgenda, pageArgs(f, source, "upcoming", cursor))
        const raw = await nativePage(f, source, "upcoming", { numItems: 20, cursor, maximumRowsRead: 40, maximumBytesRead: PAGE_BYTES })
        expect({ ...result, page: [] }).toEqual({ ...raw, page: [] })
        expect(result.page.map((row) => row.event.eventId)).toEqual(raw.page.map((row) => source === "organized" ? row._id : (row as Doc<"eventParticipants">).eventId))
        expect(result.page.every((row) => row.kind === "personal" && row.event.startAt === START)).toBe(true)
        seen.push(...result.page.map((row) => row.event.eventId))
        if (result.isDone) { finished = true; break }
        expect(result.continueCursor).not.toBe(cursor)
        cursor = result.continueCursor
      }
      expect(finished).toBe(true)
      expect(seen).toHaveLength(205)
      expect(new Set(seen).size).toBe(205)
      expect(new Set(seen)).toEqual(new Set(inserted))
      const preview = await f.alice.as.query(P.myAgenda, { networkId: f.networkId, now: NOW })
      expect(preview.items).toHaveLength(200)
      expect(preview.truncated).toBe(true)
    })

    it(`sépare strictement history < ancre et upcoming >= ancre, avec leur ordre (${source})`, async () => {
      const f = await fixture()
      const ids: Id<"events">[] = []
      for (const startAt of [NOW - 2 * HOUR, NOW - 1, NOW, NOW + 1, NOW + HOUR]) ids.push(await personal(f, { organizer: source === "organized" ? f.alice : f.manager, ...(source === "participations" ? { person: f.alice } : {}), startAt, key: `boundary-${startAt}` }))
      const upcoming = await f.alice.as.query(P.paginateMyAgenda, pageArgs(f, source))
      const history = await f.alice.as.query(P.paginateMyAgenda, pageArgs(f, source, "history"))
      expect(upcoming.page.map((row) => row.event.eventId)).toEqual(ids.slice(2))
      expect(history.page.map((row) => row.event.eventId)).toEqual(ids.slice(0, 2).reverse())
      expect(upcoming.isDone).toBe(true)
      expect(history.isDone).toBe(true)
    })
  }

  it("garde la suite brute d'une page entièrement filtrée et les métadonnées de découpage", async () => {
    const f = await fixture()
    await association(f, { key: "invitation-sans-sequence", startAt: START, person: f.alice, status: "pending" })
    const visible = await association(f, { key: "confirmation", startAt: START + HOUR, person: f.alice })
    const first = await f.alice.as.query(P.paginateMyAgenda, pageArgs(f, "participations", "upcoming", null, 1))
    const raw = await nativePage(f, "participations", "upcoming", { numItems: 1, cursor: null, maximumRowsRead: 40, maximumBytesRead: PAGE_BYTES })
    expect(first).toEqual({ ...raw, page: [] })
    expect(first.isDone).toBe(false)
    const next = await f.alice.as.query(P.paginateMyAgenda, pageArgs(f, "participations", "upcoming", first.continueCursor, 1))
    expect(next.page.map((row) => row.event.eventId)).toEqual([visible.eventId])
    expect(next.isDone).toBe(true)
    const pinnedOptions = { numItems: 1, cursor: null, endCursor: next.continueCursor, maximumRowsRead: 40, maximumBytesRead: PAGE_BYTES }
    const pinnedRaw = await nativePage(f, "participations", "upcoming", pinnedOptions)
    const pinned = await f.alice.as.query(P.paginateMyAgenda, { ...pageArgs(f, "participations"), paginationOpts: pinnedOptions })
    expect({ ...pinned, page: [] }).toEqual({ ...pinnedRaw, page: [] })
    expect(pinned.page.map((row) => row.event.eventId)).toEqual([visible.eventId])
  })

  it("borne les tailles et budgets clients et conserve les bornes natives endCursor", async () => {
    const f = await fixture()
    await f.t.run(async (ctx) => {
      for (let index = 0; index < 65; index += 1) await ctx.db.insert("events", { networkId: f.networkId, organizerPersonId: f.alice.personId, title: `Budget ${index}`, description: "É".repeat(8_000), startAt: START, endAt: START + HOUR, timeZone: "UTC", status: "scheduled", idempotencyKey: `budget-${index}`, createdAt: NOW, updatedAt: NOW })
    })
    const raw = await nativePage(f, "organized", "upcoming", { numItems: 40, cursor: null, maximumRowsRead: 40, maximumBytesRead: PAGE_BYTES })
    const result = await f.alice.as.query(P.paginateMyAgenda, { ...pageArgs(f, "organized"), paginationOpts: { numItems: 10_000, cursor: null, maximumRowsRead: 10_000, maximumBytesRead: 8 * 1024 * 1024 } })
    expect({ ...result, page: [] }).toEqual({ ...raw, page: [] })
    expect(result.page.map((row) => row.event.eventId)).toEqual(raw.page.map((row) => row._id))
    expect(result.page.length).toBeLessThanOrEqual(40)
    expect(result.isDone).toBe(false)
    const bounded = await f.alice.as.query(P.paginateMyAgenda, { ...pageArgs(f, "organized"), paginationOpts: { numItems: 30.9, cursor: null, maximumRowsRead: 2.9, maximumBytesRead: 80_000.9 } })
    const boundedRaw = await nativePage(f, "organized", "upcoming", { numItems: 30, cursor: null, maximumRowsRead: 2, maximumBytesRead: 80_000 })
    expect({ ...bounded, page: [] }).toEqual({ ...boundedRaw, page: [] })
    expect(bounded.page.length).toBeLessThanOrEqual(2)
    const tiny = await f.alice.as.query(P.paginateMyAgenda, { ...pageArgs(f, "organized"), paginationOpts: { numItems: -5, cursor: null } })
    expect(tiny.page).toHaveLength(1)
    // Un client réactif qui fixe une grande plage reçoit les métadonnées de split,
    // jamais une tranche coupée après coup avec un curseur qui sauterait des lignes.
    const wide = await nativePage(f, "organized", "upcoming", { numItems: 65, cursor: null })
    const pinnedOptions = { numItems: 1, cursor: null, endCursor: wide.continueCursor, maximumRowsRead: 40, maximumBytesRead: PAGE_BYTES }
    const pinnedRaw = await nativePage(f, "organized", "upcoming", pinnedOptions)
    const pinned = await f.alice.as.query(P.paginateMyAgenda, { ...pageArgs(f, "organized"), paginationOpts: { ...pinnedOptions, maximumRowsRead: Number.POSITIVE_INFINITY, maximumBytesRead: Number.POSITIVE_INFINITY } })
    expect({ ...pinned, page: [] }).toEqual({ ...pinnedRaw, page: [] })
    expect(pinned.page.map((row) => row.event.eventId)).toEqual(pinnedRaw.page.map((row) => row._id))
    const fallback = await f.alice.as.query(P.paginateMyAgenda, { ...pageArgs(f, "organized"), paginationOpts: { numItems: Number.NaN, cursor: null } })
    const fallbackRaw = await nativePage(f, "organized", "upcoming", { numItems: 20, cursor: null, maximumRowsRead: 40, maximumBytesRead: PAGE_BYTES })
    expect({ ...fallback, page: [] }).toEqual({ ...fallbackRaw, page: [] })
  })
})

describe("paginateMyAgenda — identité, projections et droits actuels", () => {
  it("préserve les DTO personnels de tout statut et écarte ses propres événements du flux participations", async () => {
    const f = await fixture()
    const organized = await personal(f, { organizer: f.alice, person: f.alice, status: "accepted", key: "own" })
    const ids: Id<"events">[] = []
    for (const status of ["pending", "accepted", "declined", "maybe"] as const) ids.push(await personal(f, { person: f.alice, status, key: `personal-${status}` }))
    const ownDto = await f.alice.as.query(P.getEvent, { networkId: f.networkId, eventId: organized })
    const dto = await Promise.all(ids.map((eventId) => f.alice.as.query(P.getEvent, { networkId: f.networkId, eventId })))
    expect((await f.alice.as.query(P.paginateMyAgenda, pageArgs(f, "organized"))).page).toEqual([{ kind: "personal", event: ownDto }])
    const invited = await f.alice.as.query(P.paginateMyAgenda, pageArgs(f, "participations"))
    expect(invited.page).toEqual(dto.map((event) => ({ kind: "personal", event })))
    expect(invited.page.map((row) => row.event.eventId)).not.toContain(organized)
    const preview = await f.alice.as.query(P.myAgenda, { networkId: f.networkId, now: NOW })
    expect(preview.items.filter((event) => event.eventId !== organized)).toEqual(dto)
  })

  it("mélange les deux projections dans l'ordre de la même page sans altérer le DTO personnel", async () => {
    const f = await fixture()
    const privateId = await personal(f, { person: f.alice, status: "pending", startAt: START, key: "mixed-personal" })
    const collective = await association(f, { key: "mixed-association", person: f.alice, status: "pending", sequence: 1, startAt: START + HOUR })
    const personalDto = await f.alice.as.query(P.getEvent, { networkId: f.networkId, eventId: privateId })
    const preview = await f.alice.as.query(P.myAgenda, { networkId: f.networkId, now: NOW })
    const result = await f.alice.as.query(P.paginateMyAgenda, pageArgs(f, "participations"))
    expect(result.page).toEqual([{ kind: "personal", event: personalDto }, { kind: "association", event: preview.associationItems[0] }])
    expect(result.page.map((row) => row.event.eventId)).toEqual([privateId, collective.eventId])
  })

  it("admet confirmations et vraies files, jamais une invitation de page, et ne fabrique aucun participant collectif", async () => {
    const f = await fixture()
    const confirmed = await association(f, { key: "accepted", person: f.alice })
    const queued = await association(f, { key: "queued", person: f.alice, status: "pending", sequence: 7 })
    const cancelled = await association(f, { key: "cancelled", person: f.alice, cancelled: true })
    for (const [key, status, sequence] of [["invitation", "pending", undefined], ["zero", "pending", 0], ["fraction", "pending", 1.5], ["unsafe", "pending", Number.MAX_SAFE_INTEGER + 1], ["withdrawn", "declined", 2], ["maybe", "maybe", 3]] as const) await association(f, { key, person: f.alice, status, sequence })
    await association(f, { key: "mandate-only" })
    const result = await f.alice.as.query(P.paginateMyAgenda, pageArgs(f, "participations"))
    const preview = await f.alice.as.query(P.myAgenda, { networkId: f.networkId, now: NOW })
    expect(result.page).toEqual(preview.associationItems.map((event) => ({ kind: "association", event })))
    expect(result.page.map((row) => row.event.eventId)).toEqual([confirmed.eventId, queued.eventId, cancelled.eventId])
    expect(result.page.map((row) => row.kind === "association" ? row.event.registration : null)).toEqual(["confirmed", "waitlisted", "confirmed"])
    expect(result.page[2]).toMatchObject({ kind: "association", event: { status: "cancelled", cancelledAt: NOW } })
    const raw = JSON.stringify(result.page)
    for (const value of [f.alice.personId, f.manager.personId, "participationId", "participantCount", "acceptedCount", "isOrganizer"]) expect(raw).not.toContain(value)
    expect((await f.manager.as.query(P.paginateMyAgenda, pageArgs(f, "organized", "upcoming", null, 20, f.manager))).page).toEqual([])
    expect((await f.manager.as.query(P.paginateMyAgenda, pageArgs(f, "participations", "upcoming", null, 20, f.manager))).page).toEqual([])
    await f.t.run(async (ctx) => {
      const membership = await ctx.db.query("networkMemberships").withIndex("by_network_and_person", (q) => q.eq("networkId", f.networkId).eq("personId", f.alice.personId)).unique()
      if (!membership) throw new Error("Adhésion absente")
      await ctx.db.patch(membership._id, { status: "en_attente" })
    })
    expect((await f.alice.as.query(P.paginateMyAgenda, pageArgs(f, "participations")))).toEqual(result)
  })

  it("relit l'événement courant, écarte les fenêtres invalides et dédoublonne dans une page", async () => {
    const f = await fixture()
    const repeated = await association(f, { key: "repeated", person: f.alice })
    const stale = await association(f, { key: "moved-to-history", person: f.alice })
    const invalid = await association(f, { key: "invalid-window", person: f.alice })
    await f.t.run(async (ctx) => {
      await ctx.db.insert("eventParticipants", { networkId: f.networkId, eventId: repeated.eventId, personId: f.alice.personId, invitedByPersonId: f.alice.personId, status: "accepted", eventStartAt: START, createdAt: NOW })
      await ctx.db.patch(stale.eventId, { startAt: NOW - HOUR, endAt: NOW - 1 })
      await ctx.db.patch(invalid.eventId, { endAt: START })
    })
    const result = await f.alice.as.query(P.paginateMyAgenda, pageArgs(f, "participations"))
    expect(result.page.map((row) => row.event.eventId)).toEqual([repeated.eventId])
    // Une incohérence de la copie d'index ne déclenche aucun balayage hors page.
    expect((await f.alice.as.query(P.paginateMyAgenda, pageArgs(f, "participations", "history"))).page).toEqual([])
  })

  it("borne réseau et lecteur sans faire confiance à l'identité fournie", async () => {
    const f = await fixture()
    const own = await personal(f, { organizer: f.alice, key: "diaspora" })
    await personal(f, { organizer: f.alice, person: f.alice, networkId: f.root, key: "root" })
    await personal(f, { organizer: f.outsider, key: "other-reader" })
    // Une participation corrompue dans le réseau courant ne donne pas accès au parent étranger.
    const foreign = await personal(f, { networkId: f.root, key: "foreign" })
    await f.t.run((ctx) => ctx.db.insert("eventParticipants", { networkId: f.networkId, eventId: foreign, personId: f.alice.personId, invitedByPersonId: f.manager.personId, status: "accepted", eventStartAt: START, createdAt: NOW }))
    expect((await f.alice.as.query(P.paginateMyAgenda, pageArgs(f, "organized"))).page.map((row) => row.event.eventId)).toEqual([own])
    expect((await f.alice.as.query(P.paginateMyAgenda, pageArgs(f, "participations"))).page).toEqual([])
    expect(await codeOf(f.alice.as.query(P.paginateMyAgenda, { ...pageArgs(f, "organized"), expectedReaderPersonId: f.outsider.personId }))).toBe("notFound")
    for (const anchor of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) expect(await codeOf(f.alice.as.query(P.paginateMyAgenda, { ...pageArgs(f, "organized"), anchor }))).toBe("notFound")
    expect(await codeOf(f.t.query(P.paginateMyAgenda, pageArgs(f, "organized")))).toBe("unauthenticated")
  })

  it("revalide l'adhésion privée entre deux pages sans perdre la suite brute", async () => {
    const f = await fixture()
    await association(f, { key: "first", person: f.alice, startAt: START })
    await association(f, { key: "second", person: f.alice, startAt: START + HOUR })
    const first = await f.alice.as.query(P.paginateMyAgenda, pageArgs(f, "participations", "upcoming", null, 1))
    expect(first.page).toHaveLength(1)
    await f.t.run((ctx) => ctx.db.patch(f.associationMembershipId, { status: "removed", statusChangedAt: NOW }))
    const second = await f.alice.as.query(P.paginateMyAgenda, pageArgs(f, "participations", "upcoming", first.continueCursor, 1))
    const raw = await nativePage(f, "participations", "upcoming", { numItems: 1, cursor: first.continueCursor, maximumRowsRead: 40, maximumBytesRead: PAGE_BYTES })
    expect(second).toEqual({ ...raw, page: [] })
    expect(second.isDone).toBe(true)
  })

  for (const lost of ["withdrawn", "event_pending", "event_removed", "page_pending", "page_inactive", "association", "mandate", "erased", "network", "root"] as const) {
    it(`retire le collectif après ${lost}, y compris pour une ancienne équipe`, async () => {
      const f = await fixture()
      const who = lost === "withdrawn" || lost === "association" || lost === "erased" ? f.alice : f.manager
      const event = await association(f, { key: lost, person: who })
      expect((await who.as.query(P.paginateMyAgenda, pageArgs(f, "participations", "upcoming", null, 20, who))).page).toHaveLength(1)
      await f.t.run(async (ctx) => {
        if (lost === "withdrawn") {
          if (!event.participationId) throw new Error("Participation absente")
          await ctx.db.patch(event.participationId, { status: "declined" })
        } else if (lost === "event_pending" || lost === "event_removed" || lost === "page_pending") {
          const kind = lost === "page_pending" ? "page" : "event"
          const id = kind === "page" ? f.pageId : event.eventId
          const row = await ctx.db.query("moderationContentStates").withIndex("by_target", (q) => q.eq("targetKind", kind).eq("targetId", id)).unique()
          const status = lost === "event_removed" ? "removed" as const : "pending_review" as const
          if (row) await ctx.db.patch(row._id, { status })
          else await ctx.db.insert("moderationContentStates", { networkId: f.networkId, targetKind: kind, targetId: id, ownerPageId: f.pageId, status, createdAt: NOW, updatedAt: NOW })
        } else if (lost === "page_inactive") await ctx.db.patch(f.pageId, { status: "inactive" })
        else if (lost === "association") await ctx.db.patch(f.associationMembershipId, { status: "left", statusChangedAt: NOW })
        else if (lost === "mandate") await ctx.db.patch(f.signatureId, { acceptedAt: undefined, updatedAt: NOW })
        else if (lost === "erased") await ctx.db.patch(who.personId, { erasedAt: NOW })
        else if (lost === "network") await ctx.db.patch(f.networkId, { status: "archived" })
        else {
          const membership = await ctx.db.query("networkMemberships").withIndex("by_network_and_person", (q) => q.eq("networkId", f.root).eq("personId", who.personId)).unique()
          if (!membership) throw new Error("Adhésion racine absente")
          await ctx.db.patch(membership._id, { status: "suspendue" })
        }
      })
      const request = who.as.query(P.paginateMyAgenda, pageArgs(f, "participations", "upcoming", null, 20, who))
      if (lost === "network" || lost === "root") expect(await codeOf(request)).toBe(lost === "root" ? "membershipSuspended" : "notFound")
      else expect((await request).page).toEqual([])
    })
  }

  it("relit une audience réseau devenue privée et le retrait réel d'inscription", async () => {
    const f = await fixture()
    const event = await association(f, { key: "public-then-private", person: f.outsider, audience: "network" })
    const args = pageArgs(f, "participations", "upcoming", null, 20, f.outsider)
    expect((await f.outsider.as.query(P.paginateMyAgenda, args)).page).toHaveLength(1)
    await f.t.run((ctx) => ctx.db.patch(event.eventId, { pageAudience: "association" }))
    expect((await f.outsider.as.query(P.paginateMyAgenda, args)).page).toEqual([])
    await f.t.run((ctx) => ctx.db.patch(event.eventId, { pageAudience: "network" }))
    await f.outsider.as.mutation(E.unregister, { networkId: f.networkId, eventId: event.eventId })
    expect((await f.outsider.as.query(P.paginateMyAgenda, args)).page).toEqual([])
  })
})
