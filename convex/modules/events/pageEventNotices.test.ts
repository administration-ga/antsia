// @vitest-environment edge-runtime
/**
 * EV-03 (issue antsia#97) : avis neutres aux inscrits d'un événement de page — « événement
 * annulé » (confirmés et en attente, par lots chaînés) et « place confirmée » (la personne
 * promue de la file). Porte unique, garde relue, aucun doublon, jamais l'auteur du geste,
 * aucun contenu dans la ligne ni dans la cloche ; motif d'annulation pris dans une liste fermée.
 */
import { engineErrorAppRule, engineErrorCode } from "@antsia/social-contracts/errors"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { api, internal } from "../../_generated/api"
import type { Doc, Id } from "../../_generated/dataModel"
import { SEED_CONFIRMATION } from "../../seeds/foundations"
import { testConvex } from "../../test.setup"
import { notificationStillVisible } from "../notifications/policy"
import { PAGE_EVENT_NOTICE_BATCH_SIZE } from "./pageEventNotices"

type T = ReturnType<typeof testConvex>
type NoticeKind = "association_event_cancelled" | "association_event_seat_confirmed"
const E = api.modules.events.pageEvents
const A = api.modules.diaspora.associations
const B = api.modules.notifications.bell
const NOTICE = internal.modules.events.pageEventNotices.notifyPageEventCancellation
const FILL = internal.modules.events.pageEventRegistrations.fillPageEventSeats
const NOW = Date.UTC(2026, 10, 10, 10)
const HOUR = 3_600_000
const TITLE = "Rencontre confidentielle de recette"
const LOCATION = "Salle Ndjolé, Lyon"
const PAGE_NAME = "Association secrète de recette"
const PAGE_HANDLE = "association-avis"
/** Les seules colonnes qu'un avis d'événement de page peut porter : des références. */
const NOTICE_COLUMNS = ["_creationTime", "_id", "createdAt", "dedupKey", "kind", "networkId", "readAt", "recipientPersonId", "subjectEventId"]

beforeEach(() => {
  vi.stubEnv("CONVEX_CLOUD_URL", "http://127.0.0.1:3210")
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs() })

async function member(t: T, networkId: Id<"networks">, handle: string, displayName: string) {
  const as = t.withIdentity({ subject: `notices-${handle}` })
  const personId = await as.mutation(api.modules.people.persons.ensureMyPerson, {})
  await as.mutation(api.modules.people.consents.recordConsent, { purpose: "social_profile", origin: "onboarding" })
  await as.mutation(api.modules.people.profile.publishMyProfile, { handle, displayName })
  await t.run((ctx) => ctx.db.insert("identityLinks", { personId, provider: "idn", subject: `notices-idn-${personId}`, loa: 2, nationality: "GA", linkedAt: NOW }))
  await as.mutation(api.modules.diaspora.membership.joinDiasporale, { networkId, facet: { countryOfResidence: "FR", city: "Lyon" } })
  return { as, personId }
}

async function fixture() {
  const t = testConvex()
  const { root } = await t.mutation(internal.seeds.foundations.run, { confirmNonProduction: SEED_CONFIRMATION })
  const { network: networkId } = await t.mutation(internal.modules.diaspora.seed.run, { confirmNonProduction: SEED_CONFIRMATION })
  const manager = await member(t, networkId, "avis-equipe", "Awa OGOOUÉ")
  const alice = await member(t, networkId, "avis-alice", "Alice NDONG")
  const bob = await member(t, networkId, "avis-bob", "Jean MBA")
  const carla = await member(t, networkId, "avis-carla", "Carla ONDO")
  const outsider = await member(t, networkId, "avis-tiers", "Paul NZÉ")
  const pageId = await t.run(async (ctx) => {
    const pageId = await ctx.db.insert("pages", {
      networkId, handle: PAGE_HANDLE, name: PAGE_NAME, ownerKind: "association",
      trust: "community", trustRank: 0, visibility: "network", onRoot: false, status: "active",
      searchText: "association recette", createdAt: NOW, updatedAt: NOW,
    })
    await ctx.db.insert("pageSignatories", { networkId, pageId, personId: manager.personId, role: "admin", acceptedAt: NOW, createdAt: NOW, updatedAt: NOW })
    await ctx.db.insert("moderationPolicies", { networkId, surface: "event", preReview: false, maxLinks: 2, maxWrites: 100, windowMs: 60_000, updatedAt: NOW })
    return pageId
  })
  for (const who of [alice, bob, carla]) {
    const row = await who.as.mutation(A.requestAssociationMembership, { networkId, pageId })
    await manager.as.mutation(A.decideAssociationMembership, { networkId, membershipId: row.membershipId, expectedVersion: row.version, decision: "accept" })
  }
  return { t, root, networkId, pageId, manager, alice, bob, carla, outsider }
}
type Fixture = Awaited<ReturnType<typeof fixture>>
type Member = Fixture["alice"]

function input(f: Fixture) {
  return { networkId: f.networkId, pageId: f.pageId, title: TITLE, description: "Échange entre membres.", location: LOCATION, startAt: NOW + 24 * HOUR, endAt: NOW + 26 * HOUR, timeZone: "Europe/Paris", audience: "association" as const }
}
function create(f: Fixture, capacity: number | null, audience: "association" | "network" = "association") {
  return f.manager.as.mutation(E.create, { ...input(f), audience, capacity, idempotencyKey: `avis-${audience}-${capacity ?? "libre"}` })
}
function register(f: Fixture, eventId: Id<"events">, who: Member) {
  return who.as.mutation(E.register, { networkId: f.networkId, eventId })
}
function unregister(f: Fixture, eventId: Id<"events">, who: Member) {
  return who.as.mutation(E.unregister, { networkId: f.networkId, eventId })
}
async function version(f: Fixture, eventId: Id<"events">): Promise<number> {
  return (await f.t.run((ctx) => ctx.db.get(eventId)))?.version ?? 1
}
async function cancel(f: Fixture, eventId: Id<"events">, reason?: "venue_unavailable" | "weather" | "organizer_unavailable" | "other") {
  await f.manager.as.mutation(E.cancel, { networkId: f.networkId, eventId, expectedVersion: await version(f, eventId), ...(reason !== undefined ? { reason } : {}) })
}
function notices(f: Fixture, personId: Id<"persons">, kind: NoticeKind): Promise<Doc<"notifications">[]> {
  return f.t.run(async (ctx) => (await ctx.db.query("notifications")
    .withIndex("by_network_recipient_createdAt", (q) => q.eq("networkId", f.networkId).eq("recipientPersonId", personId)).take(50)).filter((row) => row.kind === kind))
}
async function bellItems(f: Fixture, who: Member, kind: NoticeKind) {
  const bell = await who.as.query(B.paginateNotifications, { networkId: f.networkId, paginationOpts: { cursor: null, numItems: 50 } })
  return bell.page.filter((item) => item.kind === kind)
}
async function refusal(promise: Promise<unknown>) {
  try { await promise } catch (error) { return engineErrorAppRule(error)?.appRule ?? engineErrorCode(error) ?? "refused" }
  return null
}
async function removeAssociationMembership(f: Fixture, who: Member) {
  await f.t.run(async (ctx) => {
    const membership = await ctx.db.query("associationMemberships").withIndex("by_network_and_page_and_person", (q) => q.eq("networkId", f.networkId).eq("pageId", f.pageId).eq("personId", who.personId)).unique()
    if (!membership) throw new Error("Adhésion associative absente")
    await ctx.db.patch(membership._id, { status: "removed", statusChangedAt: NOW })
  })
}
/** Aucun contenu : ni titre, ni lieu, ni nom ou adresse de page, ni motif, ni acteur. */
function expectNoContent(value: unknown) {
  const text = JSON.stringify(value)
  for (const secret of [TITLE, LOCATION, PAGE_NAME, "weather", "Awa", "OGOOUÉ"]) expect(text, secret).not.toContain(secret)
}

describe("événement de page annulé — avis neutre à chaque inscrit", () => {
  it("écrit une ligne chez chaque confirmé et chaque personne en attente ; aucune chez un inscrit retiré ni chez l'auteur du geste", async () => {
    const f = await fixture()
    const { eventId } = await create(f, 2)
    await register(f, eventId, f.manager)
    await register(f, eventId, f.alice)
    await register(f, eventId, f.bob)
    await register(f, eventId, f.carla)
    await unregister(f, eventId, f.carla)
    await cancel(f, eventId, "weather")
    await f.t.finishAllScheduledFunctions(vi.runAllTimers)

    for (const who of [f.alice, f.bob]) {
      const rows = await notices(f, who.personId, "association_event_cancelled")
      expect(rows).toHaveLength(1)
      expect(rows[0]).toMatchObject({ kind: "association_event_cancelled", subjectEventId: eventId, recipientPersonId: who.personId, dedupKey: `association_event_cancelled|event:${eventId}|-` })
      expect(rows[0]?.actorPersonId).toBeUndefined()
      // La ligne ne porte que des références : aucune colonne de contenu.
      expect(Object.keys(rows[0]!).sort().every((key) => NOTICE_COLUMNS.includes(key))).toBe(true)
      expectNoContent(rows[0])
    }
    expect(await notices(f, f.carla.personId, "association_event_cancelled")).toEqual([])
    expect(await notices(f, f.manager.personId, "association_event_cancelled")).toEqual([])
    expect(await notices(f, f.outsider.personId, "association_event_cancelled")).toEqual([])
    // L'annulation ne promeut personne : aucune « place confirmée » n'apparaît.
    expect(await notices(f, f.bob.personId, "association_event_seat_confirmed")).toEqual([])

    const [item] = await bellItems(f, f.alice, "association_event_cancelled")
    expect(item).toMatchObject({ actor: null, page: null, subject: { kind: "event", id: eventId }, associationEvent: { eventId, pageHandle: PAGE_HANDLE } })
    // Seule l'adresse de la page sert à ouvrir la fiche ; le reste de la ligne ne dit rien de l'événement.
    expectNoContent({ ...item, associationEvent: null })
  })

  it("le motif se lit sur la fiche avec les droits du lecteur, jamais dans l'avis ; sans motif, l'annulation reste possible", async () => {
    const f = await fixture()
    const { eventId } = await create(f, null)
    await register(f, eventId, f.alice)
    expect(await f.alice.as.query(E.cancellationReason, { networkId: f.networkId, eventId })).toBeNull()
    await cancel(f, eventId, "venue_unavailable")
    await f.t.finishAllScheduledFunctions(vi.runAllTimers)
    expect(await f.alice.as.query(E.cancellationReason, { networkId: f.networkId, eventId })).toEqual({ reason: "venue_unavailable" })
    // Hors de l'association (audience « association ») : la fiche ne se lit pas, le motif non plus.
    expect(await f.outsider.as.query(E.cancellationReason, { networkId: f.networkId, eventId })).toBeNull()
    expect(JSON.stringify(await notices(f, f.alice.personId, "association_event_cancelled"))).not.toContain("venue_unavailable")
    // La vue existante de la fiche ne change pas de forme.
    expect(await f.alice.as.query(E.get, { networkId: f.networkId, eventId })).not.toHaveProperty("cancellationReason")

    const other = await f.manager.as.mutation(E.create, { ...input(f), capacity: null, idempotencyKey: "avis-sans-motif" })
    await register(f, other.eventId, f.alice)
    await cancel(f, other.eventId)
    await f.t.finishAllScheduledFunctions(vi.runAllTimers)
    expect(await f.alice.as.query(E.cancellationReason, { networkId: f.networkId, eventId: other.eventId })).toEqual({ reason: null })
    expect(await notices(f, f.alice.personId, "association_event_cancelled")).toHaveLength(2)
  })

  it("refuse un motif hors de la liste fermée, sans rien annuler", async () => {
    const f = await fixture()
    const { eventId } = await create(f, null)
    const free = "Il pleut des cordes" as unknown as "weather"
    expect(await refusal(f.manager.as.mutation(E.cancel, { networkId: f.networkId, eventId, expectedVersion: 1, reason: free }))).not.toBeNull()
    expect((await f.t.run((ctx) => ctx.db.get(eventId)))?.status).toBe("scheduled")
  })

  it("rejouée, la diffusion n'ajoute rien et ne rouvre aucune ligne lue ; une seconde annulation ne change ni le motif ni les avis", async () => {
    const f = await fixture()
    const { eventId } = await create(f, 1)
    await register(f, eventId, f.alice)
    await register(f, eventId, f.bob)
    await cancel(f, eventId, "weather")
    await f.t.finishAllScheduledFunctions(vi.runAllTimers)
    const [first] = await notices(f, f.alice.personId, "association_event_cancelled")
    await f.alice.as.mutation(B.markRead, { networkId: f.networkId, notificationId: first!._id })
    const readAt = (await f.t.run((ctx) => ctx.db.get(first!._id)))?.readAt
    expect(readAt).toBeDefined()

    for (const phase of ["accepted", "waitlisted"] as const) await f.t.mutation(NOTICE, { networkId: f.networkId, eventId, phase, cursor: null, sourcePersonId: f.manager.personId })
    await f.t.finishAllScheduledFunctions(vi.runAllTimers)
    await f.manager.as.mutation(E.cancel, { networkId: f.networkId, eventId, expectedVersion: await version(f, eventId), reason: "other" })
    await f.t.finishAllScheduledFunctions(vi.runAllTimers)

    expect(await notices(f, f.alice.personId, "association_event_cancelled")).toEqual([expect.objectContaining({ _id: first!._id, readAt })])
    expect(await notices(f, f.bob.personId, "association_event_cancelled")).toHaveLength(1)
    expect((await f.t.run((ctx) => ctx.db.get(eventId)))?.pageCancellationReason).toBe("weather")
  })

  it("n'avise pas une personne qui a perdu l'accès, et retire de la cloche l'avis de celle qui le perd ensuite", async () => {
    const f = await fixture()
    const { eventId } = await create(f, 1)
    await register(f, eventId, f.alice)
    await register(f, eventId, f.bob)
    await removeAssociationMembership(f, f.bob)
    await cancel(f, eventId)
    await f.t.finishAllScheduledFunctions(vi.runAllTimers)
    expect(await notices(f, f.bob.personId, "association_event_cancelled")).toEqual([])

    const [row] = await notices(f, f.alice.personId, "association_event_cancelled")
    expect(await bellItems(f, f.alice, "association_event_cancelled")).toHaveLength(1)
    await removeAssociationMembership(f, f.alice)
    expect(await f.t.run((ctx) => notificationStillVisible(ctx, row!))).toBe(false)
    expect(await bellItems(f, f.alice, "association_event_cancelled")).toEqual([])
  })

  it("n'avise personne quand l'événement était déjà terminé au moment de l'annulation", async () => {
    const f = await fixture()
    const { eventId } = await create(f, null)
    await register(f, eventId, f.alice)
    vi.setSystemTime(input(f).endAt + HOUR)
    await cancel(f, eventId)
    await f.t.finishAllScheduledFunctions(vi.runAllTimers)
    expect(await notices(f, f.alice.personId, "association_event_cancelled")).toEqual([])
  })

  it("au-delà d'un lot, la diffusion se poursuit par curseur, des confirmés aux personnes en attente, et se termine", async () => {
    const f = await fixture()
    const { eventId } = await create(f, null, "network")
    const total = PAGE_EVENT_NOTICE_BATCH_SIZE + 3
    const { accepted, waiting } = await f.t.run(async (ctx) => {
      const accepted: Id<"persons">[] = [], waiting: Id<"persons">[] = []
      for (let index = 0; index < total + 2; index += 1) {
        // Seules les lignes de masse sont posées directement ; les gestes ordinaires passent par les sessions.
        const personId = await ctx.db.insert("persons", { authUserId: `notices-bulk-${index}`, createdAt: NOW, updatedAt: NOW })
        for (const networkId of [f.root, f.networkId]) await ctx.db.insert("networkMemberships", { networkId, personId, status: "declaree", role: "member", joinedAt: NOW, statusChangedAt: NOW })
        const queued = index >= total
        await ctx.db.insert("eventParticipants", {
          networkId: f.networkId, eventId, personId, invitedByPersonId: personId, eventStartAt: input(f).startAt, createdAt: NOW,
          ...(queued ? { status: "pending" as const, pageRegistrationSequence: index + 1 } : { status: "accepted" as const }),
        })
        ;(queued ? waiting : accepted).push(personId)
      }
      return { accepted, waiting }
    })
    await cancel(f, eventId)
    // Le premier lot, borné : il dit qu'il reste à faire.
    expect(await f.t.mutation(NOTICE, { networkId: f.networkId, eventId, phase: "accepted", cursor: null, sourcePersonId: f.manager.personId })).toEqual({ notified: PAGE_EVENT_NOTICE_BATCH_SIZE, done: false })
    await f.t.finishAllScheduledFunctions(vi.runAllTimers)
    for (const personId of [...accepted, ...waiting]) expect(await notices(f, personId, "association_event_cancelled"), personId).toHaveLength(1)
    expect(await f.t.mutation(NOTICE, { networkId: f.networkId, eventId, phase: "waitlisted", cursor: null })).toEqual({ notified: waiting.length, done: true })
  })
})

describe("place confirmée — avis neutre à la personne promue de la file", () => {
  it("un retrait promeut la première personne en attente et lui écrit un seul avis ; ni la suivante ni l'auteur du retrait", async () => {
    const f = await fixture()
    const { eventId } = await create(f, 1)
    await register(f, eventId, f.alice)
    await register(f, eventId, f.bob)
    await register(f, eventId, f.carla)
    // S'inscrire et obtenir d'emblée la place n'est pas un avis : la personne la voit à l'écran.
    expect(await notices(f, f.alice.personId, "association_event_seat_confirmed")).toEqual([])
    await unregister(f, eventId, f.alice)
    await f.t.finishAllScheduledFunctions(vi.runAllTimers)

    const rows = await notices(f, f.bob.personId, "association_event_seat_confirmed")
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ subjectEventId: eventId, dedupKey: `association_event_seat_confirmed|event:${eventId}|-` })
    expect(rows[0]?.actorPersonId).toBeUndefined()
    expect(Object.keys(rows[0]!).sort().every((key) => NOTICE_COLUMNS.includes(key))).toBe(true)
    expectNoContent(rows[0])
    expect(await notices(f, f.carla.personId, "association_event_seat_confirmed")).toEqual([])
    expect(await notices(f, f.alice.personId, "association_event_seat_confirmed")).toEqual([])

    // Un remplissage rejoué ne promeut personne d'autre et n'ajoute aucun avis.
    await f.t.mutation(FILL, { networkId: f.networkId, eventId })
    expect(await notices(f, f.bob.personId, "association_event_seat_confirmed")).toHaveLength(1)
    expect(await notices(f, f.carla.personId, "association_event_seat_confirmed")).toEqual([])

    const [item] = await bellItems(f, f.bob, "association_event_seat_confirmed")
    expect(item).toMatchObject({ actor: null, subject: { kind: "event", id: eventId }, associationEvent: { eventId, pageHandle: PAGE_HANDLE } })
  })

  it("une capacité relevée promeut et avise la personne en attente, jamais le responsable qui la relève", async () => {
    const f = await fixture()
    const { eventId } = await create(f, 1)
    await register(f, eventId, f.alice)
    await register(f, eventId, f.manager)
    await register(f, eventId, f.carla)
    await f.manager.as.mutation(E.update, { ...input(f), eventId, expectedVersion: await version(f, eventId), capacity: 3 })
    await f.t.finishAllScheduledFunctions(vi.runAllTimers)
    expect((await f.t.run((ctx) => ctx.db.query("eventParticipants").withIndex("by_event_person", (q) => q.eq("eventId", eventId).eq("personId", f.manager.personId)).unique()))?.status).toBe("accepted")
    expect(await notices(f, f.manager.personId, "association_event_seat_confirmed")).toEqual([])
    expect(await notices(f, f.carla.personId, "association_event_seat_confirmed")).toHaveLength(1)
  })

  it("l'avis ne se présente plus quand la personne rend sa place ou que l'événement est annulé", async () => {
    const f = await fixture()
    const { eventId } = await create(f, 1)
    await register(f, eventId, f.alice)
    await register(f, eventId, f.bob)
    await unregister(f, eventId, f.alice)
    expect(await bellItems(f, f.bob, "association_event_seat_confirmed")).toHaveLength(1)
    await cancel(f, eventId)
    await f.t.finishAllScheduledFunctions(vi.runAllTimers)
    expect(await bellItems(f, f.bob, "association_event_seat_confirmed")).toEqual([])
    expect(await bellItems(f, f.bob, "association_event_cancelled")).toHaveLength(1)
  })
})
