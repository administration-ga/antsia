// @vitest-environment edge-runtime
/** DG-023 : sessions réelles, dernière place, FIFO, agrégats et reprises gardées. */
import { engineErrorAppRule, engineErrorCode } from "@antsia/social-contracts/errors"
import { ASSOCIATION_EVENT_WAITLIST_BATCH_SIZE } from "../diaspora/associationEventRules"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { api, internal } from "../../_generated/api"
import type { Id } from "../../_generated/dataModel"
import { SEED_CONFIRMATION } from "../../seeds/foundations"
import { testConvex } from "../../test.setup"
import { restoreTarget } from "../moderation/targets"
import { engineCounters } from "../posts/counters"
import { participationOf, recordParticipation } from "./events"
import { fillPageEventSeatsNow, pageEventRegistrationCounts, unrecordPageEventParticipation } from "./pageEventRegistrations"

type T = ReturnType<typeof testConvex>
const E = api.modules.events.pageEvents
const P = api.modules.events.events
const A = api.modules.diaspora.associations
const FILL = internal.modules.events.pageEventRegistrations.fillPageEventSeats
const NOW = Date.UTC(2026, 9, 18, 10)
const HOUR = 3_600_000

beforeEach(() => {
  vi.stubEnv("CONVEX_CLOUD_URL", "http://127.0.0.1:3210")
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs() })

async function member(t: T, networkId: Id<"networks">, handle: string, displayName: string) {
  const as = t.withIdentity({ subject: `capacity-${handle}` })
  const personId = await as.mutation(api.modules.people.persons.ensureMyPerson, {})
  await as.mutation(api.modules.people.consents.recordConsent, { purpose: "social_profile", origin: "onboarding" })
  await as.mutation(api.modules.people.profile.publishMyProfile, { handle, displayName })
  await t.run((ctx) => ctx.db.insert("identityLinks", { personId, provider: "idn", subject: `capacity-idn-${personId}`, loa: 2, nationality: "GA", linkedAt: NOW }))
  await as.mutation(api.modules.diaspora.membership.joinDiasporaGa, { networkId, facet: { countryOfResidence: "FR", city: "Lyon" } })
  return { as, personId }
}

async function fixture() {
  const t = testConvex()
  const { root } = await t.mutation(internal.seeds.foundations.run, { confirmNonProduction: SEED_CONFIRMATION })
  const { network: networkId } = await t.mutation(internal.modules.diaspora.seed.run, { confirmNonProduction: SEED_CONFIRMATION })
  const manager = await member(t, networkId, "capacity-equipe", "Awa OGOOUÉ")
  const alice = await member(t, networkId, "capacity-alice", "Alice NDONG")
  const bob = await member(t, networkId, "capacity-bob", "Jean MBA")
  const carla = await member(t, networkId, "capacity-carla", "Carla ONDO")
  const { pageId, policyId } = await t.run(async (ctx) => {
    const pageId = await ctx.db.insert("pages", {
      networkId, handle: "association-capacite", name: "Association de recette", ownerKind: "association",
      trust: "community", trustRank: 0, visibility: "network", onRoot: false, status: "active",
      searchText: "association recette", createdAt: NOW, updatedAt: NOW,
    })
    await ctx.db.insert("pageSignatories", { networkId, pageId, personId: manager.personId, role: "admin", acceptedAt: NOW, createdAt: NOW, updatedAt: NOW })
    const policyId = await ctx.db.insert("moderationPolicies", { networkId, surface: "event", preReview: false, maxLinks: 2, maxWrites: 100, windowMs: 60_000, updatedAt: NOW })
    return { pageId, policyId }
  })
  const f = { t, root, networkId, pageId, policyId, manager, alice, bob, carla }
  for (const who of [alice, bob, carla]) {
    const row = await who.as.mutation(A.requestAssociationMembership, { networkId, pageId })
    await manager.as.mutation(A.decideAssociationMembership, { networkId, membershipId: row.membershipId, expectedVersion: row.version, decision: "accept" })
  }
  return f
}
type Fixture = Awaited<ReturnType<typeof fixture>>
type Member = Fixture["alice"]

function input(f: Fixture) {
  return { networkId: f.networkId, pageId: f.pageId, title: "Rencontre associative", description: "Échange entre membres.", location: "Lyon", startAt: NOW + 24 * HOUR, endAt: NOW + 26 * HOUR, timeZone: "Europe/Paris", audience: "association" as const }
}
async function create(f: Fixture, capacity: number | null | undefined = 1) {
  return f.manager.as.mutation(E.create, { ...input(f), ...(capacity === undefined ? {} : { capacity }), idempotencyKey: "capacity-event" })
}
function register(f: Fixture, eventId: Id<"events">, who = f.alice) {
  return who.as.mutation(E.register, { networkId: f.networkId, eventId })
}
function unregister(f: Fixture, eventId: Id<"events">, who = f.alice) {
  return who.as.mutation(E.unregister, { networkId: f.networkId, eventId })
}
function get(f: Fixture, eventId: Id<"events">, who = f.alice) {
  return who.as.query(E.get, { networkId: f.networkId, eventId })
}
function row(f: Fixture, eventId: Id<"events">, who = f.alice) {
  return f.t.run((ctx) => participationOf(ctx, eventId, who.personId))
}
function counts(f: Fixture, eventId: Id<"events">) {
  return f.t.run((ctx) => pageEventRegistrationCounts(ctx, eventId))
}
async function refusal(promise: Promise<unknown>) {
  try { await promise } catch (error) { return engineErrorAppRule(error)?.appRule ?? engineErrorCode(error) }
  return null
}
async function removeMembership(f: Fixture, who: Member) {
  await f.t.run(async (ctx) => {
    const membership = await ctx.db.query("associationMemberships").withIndex("by_network_and_page_and_person", (q) => q.eq("networkId", f.networkId).eq("pageId", f.pageId).eq("personId", who.personId)).unique()
    if (!membership) throw new Error("Adhésion associative absente")
    await ctx.db.patch(membership._id, { status: "removed", statusChangedAt: NOW })
  })
}
async function moderation(f: Fixture, eventId: Id<"events">, status: "published" | "pending_review" | "removed") {
  await f.t.run(async (ctx) => {
    const state = await ctx.db.query("moderationContentStates").withIndex("by_target", (q) => q.eq("targetKind", "event").eq("targetId", eventId)).unique()
    if (!state) throw new Error("État de modération absent")
    await ctx.db.patch(state._id, { status })
  })
}

describe("capacité des événements de page", () => {
  it("attribue une seule dernière place concurrente, garde un seul rang par personne et ne change pas la version éditoriale", async () => {
    const f = await fixture()
    const { eventId } = await create(f)
    await Promise.all([register(f, eventId, f.alice), register(f, eventId, f.bob)])
    const alice = await row(f, eventId, f.alice), bob = await row(f, eventId, f.bob)
    expect([alice?.status, bob?.status].sort()).toEqual(["accepted", "pending"])
    const waiting = alice?.status === "pending" ? f.alice : f.bob
    const before = await row(f, eventId, waiting)
    await Promise.all([register(f, eventId, waiting), register(f, eventId, waiting)])
    expect(await row(f, eventId, waiting)).toMatchObject({ _id: before!._id, pageRegistrationSequence: before!.pageRegistrationSequence, status: "pending" })
    expect(await get(f, eventId, waiting)).toMatchObject({ capacity: 1, confirmedCount: 1, waitlistCount: 1, remainingPlaces: 0, registration: "waitlisted", waitlistPosition: 1, isRegistered: false, canRegister: false, version: 1 })
    expect(await counts(f, eventId)).toEqual({ confirmedCount: 1, waitlistCount: 1 })
    const rows = await f.t.run((ctx) => ctx.db.query("eventParticipants").withIndex("by_event_person", (q) => q.eq("eventId", eventId)).take(3))
    expect(rows).toHaveLength(2)
    const view = await get(f, eventId, waiting)
    for (const who of [f.alice, f.bob, f.carla]) expect(JSON.stringify(view)).not.toContain(who.personId)
  })

  it("respecte FIFO au rejeu puis place la réinscription après le suivant en réutilisant la même ligne", async () => {
    const f = await fixture()
    const { eventId } = await create(f)
    await register(f, eventId, f.alice)
    await register(f, eventId, f.bob)
    await register(f, eventId, f.carla)
    const firstBob = await row(f, eventId, f.bob)
    await register(f, eventId, f.bob)
    expect((await row(f, eventId, f.bob))?.pageRegistrationSequence).toBe(firstBob?.pageRegistrationSequence)
    await unregister(f, eventId, f.bob)
    await register(f, eventId, f.bob)
    expect(await row(f, eventId, f.bob)).toMatchObject({ _id: firstBob!._id, status: "pending", pageRegistrationSequence: 4 })
    expect(await get(f, eventId, f.carla)).toMatchObject({ waitlistPosition: 1 })
    expect(await get(f, eventId, f.bob)).toMatchObject({ waitlistPosition: 2 })
    await unregister(f, eventId, f.alice)
    expect(await get(f, eventId, f.carla)).toMatchObject({ registration: "confirmed", isRegistered: true, waitlistPosition: null })
    expect(await get(f, eventId, f.bob)).toMatchObject({ registration: "waitlisted", waitlistPosition: 1 })
    expect((await f.t.run((ctx) => ctx.db.get(eventId)))?.version).toBe(1)
  })

  it("place une nouvelle demande derrière la file existante même si une place vient de se libérer", async () => {
    const f = await fixture()
    const { eventId } = await create(f)
    await register(f, eventId, f.alice)
    await register(f, eventId, f.bob)
    // Simule une capacité libérée avant le prochain geste ou la continuation.
    await f.t.run((ctx) => ctx.db.patch(eventId, { pageCapacity: 2 }))
    await register(f, eventId, f.carla)
    expect((await row(f, eventId, f.bob))?.status).toBe("accepted")
    expect(await get(f, eventId, f.carla)).toMatchObject({ registration: "waitlisted", waitlistPosition: 1, confirmedCount: 2 })
  })

  it("conserve la capacité omise et la modération pour une hausse seule ; refuse une baisse sous les confirmations ; null remplit sans limite", async () => {
    const f = await fixture()
    const { eventId } = await create(f)
    await register(f, eventId, f.alice)
    await register(f, eventId, f.bob)
    await register(f, eventId, f.carla)
    await f.t.run((ctx) => ctx.db.patch(f.policyId, { preReview: true }))
    await f.manager.as.mutation(E.update, { ...input(f), eventId, expectedVersion: 1, capacity: 2 })
    expect(await get(f, eventId, f.bob)).toMatchObject({ capacity: 2, moderation: "published", confirmedCount: 2, waitlistCount: 1, registration: "confirmed", version: 2 })
    expect(await refusal(f.manager.as.mutation(E.update, { ...input(f), eventId, expectedVersion: 2, capacity: 1 }))).toBe("association_event_capacity_below_confirmed")
    await f.manager.as.mutation(E.update, { ...input(f), eventId, expectedVersion: 2 })
    expect(await get(f, eventId)).toMatchObject({ capacity: 2, version: 3, moderation: "published" })
    await f.manager.as.mutation(E.update, { ...input(f), eventId, expectedVersion: 3, capacity: null })
    expect(await get(f, eventId, f.carla)).toMatchObject({ capacity: null, remainingPlaces: null, confirmedCount: 3, waitlistCount: 0, registration: "confirmed", version: 4 })
    await f.manager.as.mutation(E.update, { ...input(f), eventId, expectedVersion: 4, description: "Texte effectivement modifié." })
    expect(await get(f, eventId, f.manager)).toMatchObject({ moderation: "pending_review", capacity: null })
  })

  it("valide capacité et rejeu normalisé ; une création sans champ reste illimitée", async () => {
    const f = await fixture()
    for (const capacity of [0, -1, 1.5, 10_001]) {
      expect(await refusal(f.manager.as.mutation(E.create, { ...input(f), capacity, idempotencyKey: "invalid" }))).toBe("association_event_capacity_invalid")
    }
    const { eventId } = await f.manager.as.mutation(E.create, { ...input(f), idempotencyKey: "unlimited" })
    expect(await f.manager.as.mutation(E.create, { ...input(f), capacity: null, idempotencyKey: "unlimited" })).toEqual({ eventId, created: false })
    expect(await refusal(f.manager.as.mutation(E.create, { ...input(f), capacity: 1, idempotencyKey: "unlimited" }))).toBe("association_event_version_changed")
    await Promise.all([register(f, eventId, f.alice), register(f, eventId, f.bob)])
    expect(await get(f, eventId)).toMatchObject({ capacity: null, confirmedCount: 2, waitlistCount: 0, remainingPlaces: null, registration: "confirmed" })
    await f.manager.as.mutation(E.update, { ...input(f), eventId, expectedVersion: 1, capacity: 2 })
    expect(await get(f, eventId)).toMatchObject({ capacity: 2, confirmedCount: 2, remainingPlaces: 0 })
  })

  for (const invalidation of ["association", "membership", "root_suspension", "deletion", "erased", "missing"] as const) {
    it(`nettoie seulement au traitement un candidat devenu invalide (${invalidation}), puis promeut le suivant`, async () => {
      const f = await fixture()
      const { eventId } = await create(f)
      await register(f, eventId, f.alice)
      await register(f, eventId, f.bob)
      await register(f, eventId, f.carla)
      if (invalidation === "association") await removeMembership(f, f.bob)
      else await f.t.run(async (ctx) => {
        if (invalidation === "membership" || invalidation === "root_suspension") {
          const membership = await ctx.db.query("networkMemberships").withIndex("by_network_and_person", (q) => q.eq("networkId", invalidation === "root_suspension" ? f.root : f.networkId).eq("personId", f.bob.personId)).unique()
          if (!membership) throw new Error("Adhésion réseau absente")
          await ctx.db.patch(membership._id, { status: invalidation === "root_suspension" ? "suspendue" : "en_attente" })
        } else if (invalidation === "deletion") await ctx.db.patch(f.bob.personId, { deletionRequestedAt: NOW })
        else if (invalidation === "erased") await ctx.db.patch(f.bob.personId, { erasedAt: NOW })
        else await ctx.db.delete(f.bob.personId)
      })
      // Les queries ne nettoient pas une ancienne candidature et ne déplacent aucun rang.
      expect(await get(f, eventId, f.carla)).toMatchObject({ waitlistCount: 2, waitlistPosition: 2 })
      expect((await row(f, eventId, f.bob))?.status).toBe("pending")
      await unregister(f, eventId, f.alice)
      expect((await row(f, eventId, f.bob))?.status).toBe("declined")
      expect(await get(f, eventId, f.carla)).toMatchObject({ registration: "confirmed", waitlistCount: 0, confirmedCount: 1 })
    })
  }

  it("garde les places déjà réservées après exclusion et autorise le retrait propre en attente sans accès privé", async () => {
    const f = await fixture()
    const { eventId } = await create(f)
    await register(f, eventId, f.alice)
    await register(f, eventId, f.bob)
    await removeMembership(f, f.alice)
    await f.t.run(async (ctx) => {
      const membership = await ctx.db.query("networkMemberships").withIndex("by_network_and_person", (q) => q.eq("networkId", f.networkId).eq("personId", f.alice.personId)).unique()
      if (!membership) throw new Error("Adhésion réseau absente")
      await ctx.db.patch(membership._id, { status: "en_attente" })
    })
    expect(await get(f, eventId)).toBeNull()
    await f.t.mutation(FILL, { networkId: f.networkId, eventId })
    expect(await counts(f, eventId)).toEqual({ confirmedCount: 1, waitlistCount: 1 })
    expect((await row(f, eventId, f.alice))?.status).toBe("accepted")
    await unregister(f, eventId)
    expect(await get(f, eventId, f.bob)).toMatchObject({ registration: "confirmed", confirmedCount: 1, waitlistCount: 0 })
  })

  it("ne confond pas retrait du profil et effacement : un membre sans profil publié reste admissible", async () => {
    const f = await fixture()
    const { eventId } = await create(f)
    await register(f, eventId, f.alice)
    await register(f, eventId, f.bob)
    await f.t.run((ctx) => ctx.db.patch(f.bob.personId, { publishedAt: undefined, withdrawnAt: NOW }))
    await unregister(f, eventId, f.alice)
    expect((await row(f, eventId, f.bob))?.status).toBe("accepted")
    expect(await counts(f, eventId)).toEqual({ confirmedCount: 1, waitlistCount: 0 })
  })

  for (const unavailable of ["cancelled", "past", "pending_review", "removed"] as const) {
    it(`n'attribue aucune place lors d'une reprise ${unavailable}`, async () => {
      const f = await fixture()
      const { eventId } = await create(f)
      await register(f, eventId, f.alice)
      await register(f, eventId, f.bob)
      if (unavailable === "cancelled") await f.manager.as.mutation(E.cancel, { networkId: f.networkId, eventId, expectedVersion: 1 })
      else if (unavailable === "past") vi.setSystemTime(NOW + 25 * HOUR)
      else await moderation(f, eventId, unavailable)
      await unregister(f, eventId)
      await f.t.mutation(FILL, { networkId: f.networkId, eventId })
      expect((await row(f, eventId, f.bob))?.status).toBe("pending")
      expect(await counts(f, eventId)).toEqual({ confirmedCount: 0, waitlistCount: 1 })
      expect(await refusal(register(f, eventId, f.carla))).not.toBeNull()
    })
  }

  for (const unavailable of ["network", "page", "page_pending", "page_removed"] as const) {
    it(`suspend la file sans décliner ses candidats quand le collectif devient indisponible (${unavailable})`, async () => {
      const f = await fixture()
      const { eventId } = await create(f)
      await register(f, eventId, f.alice)
      await register(f, eventId, f.bob)
      await f.t.run(async (ctx) => {
        await ctx.db.patch(eventId, { pageCapacity: 2 })
        if (unavailable === "network") await ctx.db.patch(f.networkId, { status: "archived" })
        else if (unavailable === "page") await ctx.db.patch(f.pageId, { status: "inactive" })
        else await ctx.db.insert("moderationContentStates", { networkId: f.networkId, targetKind: "page", targetId: f.pageId, ownerPageId: f.pageId, status: unavailable === "page_pending" ? "pending_review" : "removed", createdAt: NOW, updatedAt: NOW })
      })
      await f.t.mutation(FILL, { networkId: f.networkId, eventId })
      expect((await row(f, eventId, f.bob))?.status).toBe("pending")
      expect(await counts(f, eventId)).toEqual({ confirmedCount: 1, waitlistCount: 1 })
      const pending = await row(f, eventId, f.bob)
      expect(await f.t.run((ctx) => engineCounters.indexOf(ctx, pending!.pageRegistrationSequence!, { namespace: `events.waitlisted:${eventId}`, id: pending!._id }))).toBe(0)
    })
  }

  it("enlève les trois agrégats avant effacement et reprend sans session du créateur", async () => {
    const f = await fixture()
    const { eventId } = await create(f)
    await register(f, eventId, f.alice)
    await register(f, eventId, f.bob)
    await register(f, eventId, f.carla)
    await f.t.run(async (ctx) => {
      for (const who of [f.alice, f.carla]) {
        const participation = await participationOf(ctx, eventId, who.personId)
        if (!participation) throw new Error("Participation absente")
        await unrecordPageEventParticipation(ctx, participation)
        await ctx.db.delete(participation._id)
      }
      // Le signataire qui a créé l'événement n'est plus vivant : le job n'en dépend pas.
      const signature = await ctx.db.query("pageSignatories").withIndex("by_page_role", (q) => q.eq("pageId", f.pageId).eq("role", "admin")).first()
      if (signature) await ctx.db.patch(signature._id, { acceptedAt: undefined })
    })
    await f.t.finishAllScheduledFunctions(vi.runAllTimers)
    expect(await get(f, eventId, f.bob)).toMatchObject({ registration: "confirmed", confirmedCount: 1, waitlistCount: 0 })
    expect(await f.t.run((ctx) => engineCounters.count(ctx, { namespace: `events.participants:${eventId}` }))).toBe(1)
    await f.t.mutation(FILL, { networkId: f.networkId, eventId })
    expect(await counts(f, eventId)).toEqual({ confirmedCount: 1, waitlistCount: 0 })
  })

  it("reprend la file via le vrai raccord de restauration de modération", async () => {
    const f = await fixture()
    const { eventId } = await create(f)
    await register(f, eventId, f.alice)
    await register(f, eventId, f.bob)
    await moderation(f, eventId, "pending_review")
    await unregister(f, eventId, f.alice)
    expect((await row(f, eventId, f.bob))?.status).toBe("pending")
    await f.t.run((ctx) => restoreTarget(ctx, { networkId: f.networkId, target: { kind: "event", id: eventId } }))
    await f.t.finishAllScheduledFunctions(vi.runAllTimers)
    expect(await get(f, eventId, f.bob)).toMatchObject({ moderation: "published", registration: "confirmed", confirmedCount: 1, waitlistCount: 0 })
  })

  it("borne chaque remplissage à 32 et programme la suite, toujours dans l'ordre", async () => {
    const f = await fixture()
    const { eventId } = await f.manager.as.mutation(E.create, { ...input(f), audience: "network", capacity: 1, idempotencyKey: "bulk" })
    await register(f, eventId, f.alice)
    const queued = await f.t.run(async (ctx) => {
      const ids: Id<"eventParticipants">[] = []
      for (let index = 0; index < ASSOCIATION_EVENT_WAITLIST_BATCH_SIZE + 3; index += 1) {
        // Les seuls fixtures volumineux sont les lignes de file ; les gestes ordinaires utilisent les sessions.
        const personId = await ctx.db.insert("persons", { authUserId: `capacity-bulk-${index}`, createdAt: NOW, updatedAt: NOW })
        for (const networkId of [f.root, f.networkId]) await ctx.db.insert("networkMemberships", { networkId, personId, status: "declaree", role: "member", joinedAt: NOW, statusChangedAt: NOW })
        const sequence = index + 2
        const id = await ctx.db.insert("eventParticipants", { networkId: f.networkId, eventId, personId, invitedByPersonId: personId, status: "pending", pageRegistrationSequence: sequence, eventStartAt: input(f).startAt, createdAt: NOW })
        await recordParticipation(ctx, { _id: id, eventId }, false)
        await engineCounters.insertIfDoesNotExist(ctx, { namespace: `events.waitlisted:${eventId}`, key: sequence, id })
        ids.push(id)
      }
      await ctx.db.patch(eventId, { pageRegistrationSequence: ids.length + 1 })
      return ids
    })
    await f.manager.as.mutation(E.update, { ...input(f), audience: "network", eventId, expectedVersion: 1, capacity: null })
    expect(await counts(f, eventId)).toEqual({ confirmedCount: ASSOCIATION_EVENT_WAITLIST_BATCH_SIZE + 1, waitlistCount: 3 })
    expect((await f.t.run((ctx) => ctx.db.get(queued[ASSOCIATION_EVENT_WAITLIST_BATCH_SIZE]!)))?.status).toBe("pending")
    await f.t.finishAllScheduledFunctions(vi.runAllTimers)
    expect(await counts(f, eventId)).toEqual({ confirmedCount: queued.length + 1, waitlistCount: 0 })
  })

  it("ne touche ni un autre réseau ni l'inscription personnelle et refuse les API personnelles pour une file de page", async () => {
    const f = await fixture()
    const { eventId } = await create(f)
    await register(f, eventId, f.alice)
    await register(f, eventId, f.bob)
    const waiting = await row(f, eventId, f.bob)
    expect(await refusal(f.bob.as.mutation(P.respond, { networkId: f.networkId, participationId: waiting!._id, response: "accepted" }))).toBe("notFound")
    await f.t.run((ctx) => ctx.db.patch(eventId, { pageCapacity: 2 }))
    await f.t.mutation(FILL, { networkId: f.root, eventId })
    expect((await row(f, eventId, f.bob))?.status).toBe("pending")
    await f.t.run(async (ctx) => {
      await ctx.db.patch(waiting!._id, { networkId: f.root })
      await fillPageEventSeatsNow(ctx, f.networkId, eventId)
    })
    expect(await row(f, eventId, f.bob)).toMatchObject({ status: "pending", networkId: f.root })
    const personal = await f.manager.as.mutation(P.create, { networkId: f.networkId, title: "Rendez-vous personnel", startAt: input(f).startAt, endAt: input(f).endAt, timeZone: "Europe/Paris", idempotencyKey: "personal" })
    const personalRowId = await f.t.run(async (ctx) => {
      const id = await ctx.db.insert("eventParticipants", { networkId: f.networkId, eventId: personal.eventId, personId: f.alice.personId, invitedByPersonId: f.manager.personId, status: "accepted", eventStartAt: input(f).startAt, createdAt: NOW })
      await recordParticipation(ctx, { _id: id, eventId: personal.eventId }, true)
      const participation = await ctx.db.get(id)
      if (!participation) throw new Error("Participation personnelle absente")
      await unrecordPageEventParticipation(ctx, participation)
      return id
    })
    await f.t.mutation(FILL, { networkId: f.networkId, eventId: personal.eventId })
    expect((await f.t.run((ctx) => ctx.db.get(personalRowId)))?.status).toBe("accepted")
    expect(await f.t.run((ctx) => engineCounters.count(ctx, { namespace: `events.accepted:${personal.eventId}` }))).toBe(1)
    expect(await refusal(register(f, personal.eventId))).toBe("notFound")
    expect(await refusal(unregister(f, personal.eventId))).toBe("notFound")
  })
})
