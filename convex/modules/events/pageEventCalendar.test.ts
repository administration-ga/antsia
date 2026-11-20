// @vitest-environment edge-runtime
/** DG-023 : agenda additif, copies privées iCalendar et droits vivants par session réelle. */
import { engineErrorCode } from "@antsia/social-contracts/errors"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { api, internal } from "../../_generated/api"
import type { Id } from "../../_generated/dataModel"
import { SEED_CONFIRMATION } from "../../seeds/foundations"
import { testConvex } from "../../test.setup"
import { participationOf } from "./events"

type T = ReturnType<typeof testConvex>
const E = api.modules.events.pageEvents
const P = api.modules.events.events
const CAL = api.modules.events.pageEventCalendar
const A = api.modules.diaspora.associations
const NOW = Date.UTC(2026, 9, 18, 10)
const HOUR = 3_600_000
const DAY = 24 * HOUR
const START = NOW + 2 * HOUR

beforeEach(() => {
  vi.stubEnv("CONVEX_CLOUD_URL", "http://127.0.0.1:3210")
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs() })

async function member(t: T, networkId: Id<"networks">, handle: string, displayName: string) {
  const as = t.withIdentity({ subject: `calendar-${handle}` })
  const personId = await as.mutation(api.modules.people.persons.ensureMyPerson, {})
  await as.mutation(api.modules.people.consents.recordConsent, { purpose: "social_profile", origin: "onboarding" })
  await as.mutation(api.modules.people.profile.publishMyProfile, { handle, displayName })
  await t.run((ctx) => ctx.db.insert("identityLinks", { personId, provider: "idn", subject: `calendar-idn-${personId}`, loa: 2, nationality: "GA", linkedAt: NOW }))
  await as.mutation(api.modules.diaspora.membership.joinDiasporaGa, { networkId, facet: { countryOfResidence: "FR", city: "Lyon" } })
  return { as, personId }
}

async function fixture() {
  const t = testConvex()
  const { root } = await t.mutation(internal.seeds.foundations.run, { confirmNonProduction: SEED_CONFIRMATION })
  const { network: networkId } = await t.mutation(internal.modules.diaspora.seed.run, { confirmNonProduction: SEED_CONFIRMATION })
  const manager = await member(t, networkId, "calendar-equipe", "Awa OGOOUÉ")
  const successor = await member(t, networkId, "calendar-relais", "Éloïse NDONG MBA")
  const alice = await member(t, networkId, "calendar-alice", "Alice NDONG")
  const bob = await member(t, networkId, "calendar-bob", "Jean MBA")
  const outsider = await member(t, networkId, "calendar-tiers", "Carla ONDO")
  const { pageId, signatureId } = await t.run(async (ctx) => {
    const pageId = await ctx.db.insert("pages", { networkId, handle: "association-agenda", name: "Association de recette", ownerKind: "association", trust: "community", trustRank: 0, visibility: "network", onRoot: false, status: "active", searchText: "association recette", createdAt: NOW, updatedAt: NOW })
    const signatureId = await ctx.db.insert("pageSignatories", { networkId, pageId, personId: manager.personId, role: "admin", acceptedAt: NOW, createdAt: NOW, updatedAt: NOW })
    await ctx.db.insert("pageSignatories", { networkId, pageId, personId: successor.personId, role: "signatory", acceptedAt: NOW, createdAt: NOW, updatedAt: NOW })
    await ctx.db.insert("moderationPolicies", { networkId, surface: "event", preReview: false, maxLinks: 2, maxWrites: 100, windowMs: 60_000, updatedAt: NOW })
    return { pageId, signatureId }
  })
  const membershipIds: Id<"associationMemberships">[] = []
  for (const who of [alice, bob]) {
    const row = await who.as.mutation(A.requestAssociationMembership, { networkId, pageId })
    await manager.as.mutation(A.decideAssociationMembership, { networkId, membershipId: row.membershipId, expectedVersion: row.version, decision: "accept" })
    membershipIds.push(row.membershipId)
  }
  return { t, root, networkId, pageId, signatureId, aliceMembershipId: membershipIds[0]!, manager, successor, alice, bob, outsider }
}
type Fixture = Awaited<ReturnType<typeof fixture>>

function input(f: Fixture) {
  return { networkId: f.networkId, pageId: f.pageId, title: "Rencontre associative", description: "Rencontre, échanges; projets", location: "Lyon", startAt: START, endAt: START + HOUR, timeZone: "Pacific/Kiritimati", audience: "association" as const }
}
function create(f: Fixture, key = "calendar-event", startAt = START) {
  return f.manager.as.mutation(E.create, { ...input(f), startAt, endAt: startAt + HOUR, capacity: 1, idempotencyKey: key })
}
function register(f: Fixture, eventId: Id<"events">, who = f.alice) {
  return who.as.mutation(E.register, { networkId: f.networkId, eventId })
}
function agenda(f: Fixture, who = f.alice, window: { from?: number; to?: number } = {}) {
  return who.as.query(P.myAgenda, { networkId: f.networkId, now: NOW, expectedReaderPersonId: who.personId, ...window })
}
function file(f: Fixture, eventId: Id<"events">, who = f.alice) {
  return who.as.query(CAL.exportIcal, { networkId: f.networkId, eventId, expectedReaderPersonId: who.personId })
}
function unfolded(content: string): string { return content.replace(/\r\n[ \t]/g, "") }
function uidOf(content: string): string | undefined { return unfolded(content).match(/(?:^|\r\n)UID:([^\r\n]+)/)?.[1] }
async function codeOf(promise: Promise<unknown>) {
  try { await promise } catch (error) { return engineErrorCode(error) }
  return null
}
async function moderate(f: Fixture, kind: "event" | "page", id: string, status: "pending_review" | "removed") {
  await f.t.run(async (ctx) => {
    const row = await ctx.db.query("moderationContentStates").withIndex("by_target", (q) => q.eq("targetKind", kind).eq("targetId", id)).unique()
    if (row) await ctx.db.patch(row._id, { status })
    else await ctx.db.insert("moderationContentStates", { networkId: f.networkId, targetKind: kind, targetId: id, ownerPageId: f.pageId, status, createdAt: NOW, updatedAt: NOW })
  })
}

describe("agenda associatif additif", () => {
  it("préserve exactement les objets personnels et ajoute seulement ses confirmations ou attentes volontaires", async () => {
    const f = await fixture()
    const { eventId } = await create(f)
    const invitation = await create(f, "page-without-sequence", START + HOUR)
    const personal = await f.alice.as.mutation(P.create, { networkId: f.networkId, title: "Rendez-vous personnel", startAt: NOW + HOUR, endAt: NOW + 2 * HOUR, timeZone: "UTC", idempotencyKey: "personal" })
    const personalBefore = await f.alice.as.query(P.getEvent, { networkId: f.networkId, eventId: personal.eventId })
    await register(f, eventId)
    await register(f, eventId, f.bob)
    await f.t.run((ctx) => ctx.db.insert("eventParticipants", { networkId: f.networkId, eventId: invitation.eventId, personId: f.alice.personId, invitedByPersonId: f.manager.personId, status: "pending", eventStartAt: START + HOUR, createdAt: NOW }))
    const mine = await agenda(f)
    expect(mine.items).toEqual([personalBefore])
    expect(mine.associationItems).toEqual([{ kind: "association", eventId, pageId: f.pageId, title: "Rencontre associative", description: "Rencontre, échanges; projets", location: "Lyon", startAt: START, endAt: START + HOUR, timeZone: "Pacific/Kiritimati", status: "scheduled", cancelledAt: null, version: 1, organizer: { name: "Association de recette", handle: "association-agenda" }, registration: "confirmed" }])
    expect((await agenda(f, f.bob)).associationItems).toMatchObject([{ eventId, registration: "waitlisted" }])
    expect((await agenda(f, f.manager)).associationItems).toEqual([])
    expect((await agenda(f, f.successor)).associationItems).toEqual([])
    const raw = JSON.stringify(mine.associationItems)
    for (const value of [f.alice.personId, f.manager.personId, "participationId", "participantCount", "acceptedCount", "isOrganizer"]) expect(raw).not.toContain(value)
    await f.alice.as.mutation(E.unregister, { networkId: f.networkId, eventId })
    expect((await agenda(f)).associationItems).toEqual([])
    expect((await agenda(f)).items).toEqual([personalBefore])
  })

  it("relit les bornes inclusives sur l'événement et dédoublonne une ligne historique répétée", async () => {
    const f = await fixture()
    const first = await create(f), later = await create(f, "later", START + 3 * HOUR)
    await register(f, first.eventId)
    await register(f, later.eventId)
    expect((await agenda(f, f.alice, { from: START, to: START })).associationItems.map((item) => item.eventId)).toEqual([first.eventId])
    expect((await agenda(f, f.alice, { from: START + 1 })).associationItems.map((item) => item.eventId)).toEqual([later.eventId])
    await f.t.run(async (ctx) => {
      const row = await participationOf(ctx, later.eventId, f.alice.personId)
      if (!row) throw new Error("Participation absente")
      await ctx.db.patch(row._id, { eventStartAt: START })
      await ctx.db.insert("eventParticipants", { networkId: f.networkId, eventId: first.eventId, personId: f.alice.personId, invitedByPersonId: f.alice.personId, status: "accepted", eventStartAt: START, createdAt: NOW })
    })
    expect((await agenda(f, f.alice, { from: START, to: START })).associationItems.map((item) => item.eventId)).toEqual([first.eventId])
    expect((await agenda(f)).associationItems.map((item) => item.eventId)).toEqual([first.eventId, later.eventId])
  })

  it("garde le prochain événement devant plus de deux cents anciennes participations et signale la lacune", async () => {
    const f = await fixture()
    const future = await create(f)
    await register(f, future.eventId)
    await f.t.run(async (ctx) => {
      for (let index = 0; index < 205; index += 1) {
        const startAt = NOW - (index + 1) * DAY
        const eventId = await ctx.db.insert("events", { networkId: f.networkId, organizerPageId: f.pageId, createdByPersonId: f.manager.personId, pageAudience: "association", title: `Rencontre ancienne ${index}`, startAt, endAt: startAt + HOUR, timeZone: "UTC", status: "scheduled", version: 1, idempotencyKey: `bulk-calendar-${index}`, createdAt: NOW - 300 * DAY, updatedAt: NOW })
        await ctx.db.insert("moderationContentStates", { networkId: f.networkId, targetKind: "event", targetId: eventId, ownerPageId: f.pageId, status: "published", createdAt: NOW, updatedAt: NOW })
        await ctx.db.insert("eventParticipants", { networkId: f.networkId, eventId, personId: f.alice.personId, invitedByPersonId: f.alice.personId, status: index % 2 === 0 ? "accepted" : "declined", eventStartAt: startAt, createdAt: NOW })
      }
    })
    const result = await agenda(f)
    expect(result.items).toEqual([])
    expect(result.associationItems.map((item) => item.eventId)).toContain(future.eventId)
    expect(result.associationItems.length).toBeLessThan(200)
    expect(result.truncated).toBe(true)
    expect((await agenda(f, f.alice, { from: START, to: START })).truncated).toBe(false)
  })

  it("ne conserve aucun privilège après retrait de signature et garde l'annulation lisible pour ses inscrits", async () => {
    const f = await fixture()
    const { eventId } = await create(f)
    await register(f, eventId, f.manager)
    await register(f, eventId)
    expect((await agenda(f, f.manager)).associationItems).toHaveLength(1)
    await f.t.run((ctx) => ctx.db.patch(f.signatureId, { acceptedAt: undefined }))
    expect((await agenda(f, f.manager)).associationItems).toEqual([])
    expect(await codeOf(file(f, eventId, f.manager))).toBe("notFound")
    await f.successor.as.mutation(E.cancel, { networkId: f.networkId, eventId, expectedVersion: 1 })
    expect((await agenda(f)).associationItems).toMatchObject([{ eventId, status: "cancelled", cancelledAt: NOW, version: 2, registration: "waitlisted" }])
    expect((await agenda(f, f.successor)).associationItems).toEqual([])
  })
})

describe("copie iCalendar authentifiée", () => {
  it("exporte sans inscription ni effet de bord ; confirmation, attente et lecture seule gardent un même UID", async () => {
    const f = await fixture()
    const { eventId } = await create(f)
    const readOnly = await file(f, eventId)
    expect(unfolded(readOnly.content)).toContain("STATUS:TENTATIVE\r\nTRANSP:TRANSPARENT")
    expect(await f.t.run((ctx) => participationOf(ctx, eventId, f.alice.personId))).toBeNull()
    await register(f, eventId)
    await register(f, eventId, f.bob)
    const confirmed = await file(f, eventId), waiting = await file(f, eventId, f.bob)
    expect(confirmed).toMatchObject({ filename: "diaspora-ga-event.ics", mediaType: "text/calendar;charset=utf-8" })
    expect(uidOf(confirmed.content)).toMatch(/^diaspora-ga-[0-9a-f]{64}$/)
    expect(uidOf(confirmed.content)).toBe(uidOf(waiting.content))
    expect(uidOf(confirmed.content)).toBe(uidOf(readOnly.content))
    expect(unfolded(confirmed.content)).toContain("STATUS:CONFIRMED\r\nTRANSP:OPAQUE")
    expect(unfolded(waiting.content)).toContain("STATUS:TENTATIVE\r\nTRANSP:TRANSPARENT")
    expect(unfolded(confirmed.content)).toContain("DTSTART:20261018T120000Z")
    expect(unfolded(confirmed.content)).toContain("DESCRIPTION:Rencontre\\, échanges\\; projets")
    expect(confirmed.content).toContain("CLASS:PRIVATE")
    expect(confirmed.content).not.toMatch(/^(?:ATTENDEE|ORGANIZER|URL|METHOD):|^BEGIN:VALARM/m)
    for (const value of [eventId, f.networkId, f.alice.personId, f.bob.personId, f.manager.personId, "association-agenda", "diaspora-ga-attendance:"]) expect(confirmed.content).not.toContain(value)
    vi.setSystemTime(NOW + 100)
    expect(await file(f, eventId)).toEqual(confirmed)
  })

  it("relit la version, les textes et l'annulation sans changer l'UID", async () => {
    const f = await fixture()
    const { eventId } = await create(f)
    await register(f, eventId)
    const first = await file(f, eventId)
    vi.setSystemTime(NOW + 100)
    await f.manager.as.mutation(E.update, { ...input(f), eventId, expectedVersion: 1, description: "Texte actuel" })
    const current = await file(f, eventId)
    expect(uidOf(current.content)).toBe(uidOf(first.content))
    expect(current.content).toContain("SEQUENCE:2")
    expect(current.content).toContain("DESCRIPTION:Texte actuel")
    expect(current.content).not.toBe(first.content)
    vi.setSystemTime(NOW + 200)
    await f.manager.as.mutation(E.cancel, { networkId: f.networkId, eventId, expectedVersion: 2 })
    const cancelled = await file(f, eventId)
    expect(uidOf(cancelled.content)).toBe(uidOf(first.content))
    expect(cancelled.content).toContain("SEQUENCE:3")
    expect(cancelled.content).toContain("STATUS:CANCELLED\r\nTRANSP:TRANSPARENT")
    expect((await agenda(f)).associationItems).toMatchObject([{ status: "cancelled", version: 3 }])
  })

  it("accepte une lecture en attente, refuse les changements de lecteur et n'exporte pas le personnel", async () => {
    const f = await fixture()
    const { eventId } = await create(f)
    await f.t.run(async (ctx) => {
      const membership = await ctx.db.query("networkMemberships").withIndex("by_network_and_person", (q) => q.eq("networkId", f.networkId).eq("personId", f.alice.personId)).unique()
      if (!membership) throw new Error("Adhésion réseau absente")
      await ctx.db.patch(membership._id, { status: "en_attente" })
    })
    expect((await file(f, eventId)).content).toContain("STATUS:TENTATIVE")
    expect(await codeOf(f.alice.as.query(CAL.exportIcal, { networkId: f.networkId, eventId, expectedReaderPersonId: f.bob.personId }))).toBe("notFound")
    expect(await codeOf(f.alice.as.query(P.myAgenda, { networkId: f.networkId, now: NOW, expectedReaderPersonId: f.bob.personId }))).toBe("notFound")
    expect((await f.alice.as.query(P.myAgenda, { networkId: f.networkId, now: NOW })).associationItems).toEqual([])
    expect(await codeOf(f.t.query(CAL.exportIcal, { networkId: f.networkId, eventId, expectedReaderPersonId: f.alice.personId }))).toBe("unauthenticated")
    expect(await codeOf(f.manager.as.query(CAL.exportIcal, { networkId: f.root, eventId, expectedReaderPersonId: f.manager.personId }))).toBe("notFound")
    const personal = await f.manager.as.mutation(P.create, { networkId: f.networkId, title: "Agenda personnel", startAt: START, endAt: START + HOUR, timeZone: "UTC", idempotencyKey: "private-personal" })
    expect(await codeOf(file(f, personal.eventId, f.manager))).toBe("notFound")
  })

  for (const lost of ["association", "audience", "event_pending", "event_removed", "page_pending", "page_inactive", "erased", "network", "root"] as const) {
    it(`retire le contenu d'agenda et refuse une nouvelle copie après ${lost}`, async () => {
      const f = await fixture()
      const { eventId } = await create(f)
      await register(f, eventId)
      if (lost === "association") await f.t.run((ctx) => ctx.db.patch(f.aliceMembershipId, { status: "left", statusChangedAt: NOW }))
      else if (lost === "audience") {
        await f.manager.as.mutation(E.update, { ...input(f), eventId, expectedVersion: 1, audience: "network" })
        await f.outsider.as.mutation(E.register, { networkId: f.networkId, eventId })
        await f.manager.as.mutation(E.update, { ...input(f), eventId, expectedVersion: 2, audience: "association" })
      }
      else if (lost === "event_pending") await moderate(f, "event", eventId, "pending_review")
      else if (lost === "event_removed") await moderate(f, "event", eventId, "removed")
      else if (lost === "page_pending") await moderate(f, "page", f.pageId, "pending_review")
      else if (lost === "page_inactive") await f.t.run((ctx) => ctx.db.patch(f.pageId, { status: "inactive" }))
      else if (lost === "erased") await f.t.run((ctx) => ctx.db.patch(f.alice.personId, { erasedAt: NOW }))
      else if (lost === "network") await f.t.run((ctx) => ctx.db.patch(f.networkId, { status: "archived" }))
      else await f.t.run(async (ctx) => {
        const membership = await ctx.db.query("networkMemberships").withIndex("by_network_and_person", (q) => q.eq("networkId", f.root).eq("personId", f.alice.personId)).unique()
        if (!membership) throw new Error("Adhésion racine absente")
        await ctx.db.patch(membership._id, { status: "suspendue" })
      })
      const reader = lost === "audience" ? f.outsider : f.alice
      expect(await codeOf(file(f, eventId, reader))).toBe(lost === "root" ? "membershipSuspended" : "notFound")
      if (lost === "network" || lost === "root") expect(await codeOf(agenda(f, reader))).not.toBeNull()
      else expect((await agenda(f, reader)).associationItems).toEqual([])
    })
  }

  it("refuse une ligne corrompue sans exposer les diagnostics de sérialisation", async () => {
    const f = await fixture()
    const { eventId } = await create(f)
    await f.t.run((ctx) => ctx.db.patch(eventId, { version: 2_147_483_648 }))
    expect(await codeOf(file(f, eventId))).toBe("notFound")
    await f.t.run((ctx) => ctx.db.patch(eventId, { version: 1, startAt: Number.NaN }))
    expect(await codeOf(file(f, eventId))).toBe("notFound")
  })
})
