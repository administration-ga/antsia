// @vitest-environment edge-runtime
/**
 * Issue antsia#141 — une page se ferme, de façon INDISTINCTE, à la personne que tous ses
 * signataires vivants ont bloquée (ou qui les a tous bloqués) : l'inscription à un évènement de
 * cette page reçoit le refus d'un évènement introuvable ; un seul signataire qui bloque ne ferme
 * pas une page collective ; annuler une inscription existante reste possible ; la file d'attente
 * ne promeut ni n'avise une personne à qui la page est fermée. Sessions réelles, blocages par la
 * vraie mutation (`graph.connections.blockPerson`).
 */
import { engineErrorAppRule, engineErrorCode } from "@antsia/social-contracts/errors"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { api, internal } from "../../_generated/api"
import type { Doc, Id } from "../../_generated/dataModel"
import { SEED_CONFIRMATION } from "../../seeds/foundations"
import { testConvex } from "../../test.setup"
import { isClosedByBlocksAmong, isPageClosedByBlocks, livePageSignatoryIds } from "../pages/closedByBlocks"
import { participationOf } from "./events"

type T = ReturnType<typeof testConvex>
const E = api.modules.events.pageEvents
const A = api.modules.diaspora.associations
const BLOCK = api.modules.graph.connections.blockPerson
const NOW = Date.UTC(2026, 10, 10, 10)
const HOUR = 3_600_000

beforeEach(() => {
  vi.stubEnv("CONVEX_CLOUD_URL", "http://127.0.0.1:3210")
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs() })

async function member(t: T, networkId: Id<"networks">, handle: string, displayName: string) {
  const as = t.withIdentity({ subject: `blocks-${handle}` })
  const personId = await as.mutation(api.modules.people.persons.ensureMyPerson, {})
  await as.mutation(api.modules.people.consents.recordConsent, { purpose: "social_profile", origin: "onboarding" })
  await as.mutation(api.modules.people.profile.publishMyProfile, { handle, displayName })
  await t.run((ctx) => ctx.db.insert("identityLinks", { personId, provider: "idn", subject: `blocks-idn-${personId}`, loa: 2, nationality: "GA", linkedAt: NOW }))
  await as.mutation(api.modules.diaspora.membership.joinDiasporale, { networkId, facet: { countryOfResidence: "FR", city: "Lyon" } })
  return { as, personId }
}

/**
 * Une association à deux signataires vivants (Awa, administratrice ; Dora, signataire) et une
 * invitation en attente (Inès) ; Alice, Bob et Carla en sont membres.
 */
async function fixture() {
  const t = testConvex()
  await t.mutation(internal.seeds.foundations.run, { confirmNonProduction: SEED_CONFIRMATION })
  const { network: networkId } = await t.mutation(internal.modules.diaspora.seed.run, { confirmNonProduction: SEED_CONFIRMATION })
  const manager = await member(t, networkId, "blocks-awa", "Awa OGOOUÉ")
  const dora = await member(t, networkId, "blocks-dora", "Dora NZÉ")
  const ines = await member(t, networkId, "blocks-ines", "Inès BOUSSOUGOU")
  const alice = await member(t, networkId, "blocks-alice", "Alice NDONG")
  const bob = await member(t, networkId, "blocks-bob", "Jean MBA")
  const carla = await member(t, networkId, "blocks-carla", "Carla ONDO")
  const pageId = await t.run(async (ctx) => {
    const pageId = await ctx.db.insert("pages", {
      networkId, handle: "association-blocages", name: "Association de recette", ownerKind: "association",
      trust: "community", trustRank: 0, visibility: "network", onRoot: false, status: "active",
      searchText: "association recette", createdAt: NOW, updatedAt: NOW,
    })
    await ctx.db.insert("pageSignatories", { networkId, pageId, personId: manager.personId, role: "admin", acceptedAt: NOW, createdAt: NOW, updatedAt: NOW })
    await ctx.db.insert("pageSignatories", { networkId, pageId, personId: dora.personId, role: "signatory", acceptedAt: NOW, createdAt: NOW, updatedAt: NOW })
    // Une invitation en attente : jamais acceptée, elle ne compte pas parmi les signataires vivants.
    await ctx.db.insert("pageSignatories", { networkId, pageId, personId: ines.personId, role: "signatory", createdAt: NOW, updatedAt: NOW })
    await ctx.db.insert("moderationPolicies", { networkId, surface: "event", preReview: false, maxLinks: 2, maxWrites: 100, windowMs: 60_000, updatedAt: NOW })
    return pageId
  })
  for (const who of [alice, bob, carla]) {
    const row = await who.as.mutation(A.requestAssociationMembership, { networkId, pageId })
    await manager.as.mutation(A.decideAssociationMembership, { networkId, membershipId: row.membershipId, expectedVersion: row.version, decision: "accept" })
  }
  return { t, networkId, pageId, manager, dora, ines, alice, bob, carla }
}
type Fixture = Awaited<ReturnType<typeof fixture>>
type Member = Fixture["alice"]

async function create(f: Fixture, capacity: number | null = null) {
  const { eventId } = await f.manager.as.mutation(E.create, {
    networkId: f.networkId, pageId: f.pageId, title: "Rencontre associative", description: "Échange entre membres.", location: "Lyon",
    startAt: NOW + 24 * HOUR, endAt: NOW + 26 * HOUR, timeZone: "Europe/Paris", audience: "association", capacity, idempotencyKey: `blocks-${capacity}`,
  })
  return eventId
}
function register(f: Fixture, eventId: Id<"events">, who: Member) {
  return who.as.mutation(E.register, { networkId: f.networkId, eventId })
}
function unregister(f: Fixture, eventId: Id<"events">, who: Member) {
  return who.as.mutation(E.unregister, { networkId: f.networkId, eventId })
}
async function block(f: Fixture, blocker: Member, target: Member) {
  await blocker.as.mutation(BLOCK, { networkId: f.networkId, targetPersonId: target.personId })
}
function row(f: Fixture, eventId: Id<"events">, who: Member) {
  return f.t.run((ctx) => participationOf(ctx, eventId, who.personId))
}
async function refusal(promise: Promise<unknown>) {
  try { await promise } catch (error) { return engineErrorAppRule(error)?.appRule ?? engineErrorCode(error) }
  return null
}
function seatNotices(f: Fixture, personId: Id<"persons">): Promise<Doc<"notifications">[]> {
  return f.t.run(async (ctx) => (await ctx.db.query("notifications")
    .withIndex("by_network_recipient_createdAt", (q) => q.eq("networkId", f.networkId).eq("recipientPersonId", personId)).take(50)).filter((item) => item.kind === "association_event_seat_confirmed"))
}
/** Retire Dora de l'équipe : il ne reste qu'une signataire vivante, Awa. */
async function leaveOnlyManager(f: Fixture) {
  await f.t.run(async (ctx) => {
    const signatory = await ctx.db.query("pageSignatories").withIndex("by_page_role", (q) => q.eq("pageId", f.pageId).eq("role", "signatory")).take(10)
    for (const item of signatory) if (item.personId === f.dora.personId) await ctx.db.delete(item._id)
  })
}

describe("issue #141 — inscription à un évènement d'une page fermée par les blocages", () => {
  it("tous les signataires vivants bloquent : refus indistinct, celui d'un évènement introuvable ; un seul ne change rien", async () => {
    const f = await fixture()
    const eventId = await create(f)
    // Un seul signataire (sur deux vivants) bloque : la page collective reste ouverte.
    await block(f, f.manager, f.alice)
    expect(await register(f, eventId, f.alice)).toBeNull()
    expect(await row(f, eventId, f.alice)).toMatchObject({ status: "accepted" })
    await unregister(f, eventId, f.alice)

    // Le second signataire vivant bloque aussi : la page se tait.
    await block(f, f.dora, f.alice)
    const missing = await f.t.run(async (ctx) => {
      const id = await ctx.db.insert("events", { networkId: f.networkId, organizerPageId: f.pageId, title: "Effacé", startAt: NOW + 24 * HOUR, endAt: NOW + 25 * HOUR, timeZone: "Europe/Paris", status: "scheduled", idempotencyKey: "blocks-missing", createdAt: NOW, updatedAt: NOW })
      await ctx.db.delete(id)
      return id
    })
    const unknown = await refusal(register(f, missing, f.alice))
    expect(unknown).toBe("notFound")
    expect(await refusal(register(f, eventId, f.alice))).toBe(unknown)
    expect(await row(f, eventId, f.alice)).toMatchObject({ status: "declined" })
    // Les autres membres s'inscrivent toujours ; l'invitation en attente d'Inès ne comptait pas.
    expect(await register(f, eventId, f.bob)).toBeNull()
  })

  it("le blocage compte dans les deux sens : la personne qui a bloqué toute l'équipe ne s'inscrit pas", async () => {
    const f = await fixture()
    const eventId = await create(f)
    await block(f, f.alice, f.manager)
    expect(await register(f, eventId, f.alice)).toBeNull()
    await unregister(f, eventId, f.alice)
    await block(f, f.alice, f.dora)
    expect(await refusal(register(f, eventId, f.alice))).toBe("notFound")
  })

  it("une page à un seul signataire vivant qui bloque est fermée", async () => {
    const f = await fixture()
    await leaveOnlyManager(f)
    const eventId = await create(f)
    await block(f, f.manager, f.alice)
    expect(await refusal(register(f, eventId, f.alice))).toBe("notFound")
    expect(await row(f, eventId, f.alice)).toBeNull()
  })

  it("annuler une inscription existante reste possible ; s'inscrire de nouveau ne l'est plus", async () => {
    const f = await fixture()
    const eventId = await create(f)
    await register(f, eventId, f.alice)
    await block(f, f.manager, f.alice)
    await block(f, f.dora, f.alice)
    // La place confirmée n'est pas retirée d'office.
    expect(await row(f, eventId, f.alice)).toMatchObject({ status: "accepted" })
    expect(await unregister(f, eventId, f.alice)).toBeNull()
    expect(await row(f, eventId, f.alice)).toMatchObject({ status: "declined" })
    expect(await refusal(register(f, eventId, f.alice))).toBe("notFound")
  })

  it("la file ne promeut ni n'avise une personne à qui la page est fermée ; la suivante est promue", async () => {
    const f = await fixture()
    await leaveOnlyManager(f)
    const eventId = await create(f, 1)
    await register(f, eventId, f.bob)
    await register(f, eventId, f.alice)
    await register(f, eventId, f.carla)
    expect(await row(f, eventId, f.alice)).toMatchObject({ status: "pending" })
    await block(f, f.manager, f.alice)
    // La place de Bob se libère : Alice, en tête de file, n'est ni promue ni avisée ; Carla l'est.
    await unregister(f, eventId, f.bob)
    expect(await row(f, eventId, f.alice)).toMatchObject({ status: "declined" })
    expect(await row(f, eventId, f.carla)).toMatchObject({ status: "accepted" })
    expect(await seatNotices(f, f.alice.personId)).toEqual([])
    expect(await seatNotices(f, f.carla.personId)).toHaveLength(1)
    expect(await f.alice.as.query(E.get, { networkId: f.networkId, eventId })).toMatchObject({ registration: "none", waitlistPosition: null })
  })
})

describe("pages/closedByBlocks — la règle elle-même", () => {
  it("signataires vivants seulement ; page sans signataire vivant ouverte ; signataire jamais fermé à soi ; deux lectures, même réponse", async () => {
    const f = await fixture()
    const verdicts = async (personId: Id<"persons">) => await f.t.run(async (ctx) => {
      const page = await ctx.db.get(f.pageId)
      if (!page) throw new Error("page absente")
      const live = await livePageSignatoryIds(ctx, page)
      return { single: await isPageClosedByBlocks(ctx, page, personId), among: await isClosedByBlocksAmong(ctx, live, personId), live }
    })
    expect((await verdicts(f.alice.personId)).live.sort()).toEqual([f.manager.personId, f.dora.personId].sort())
    expect(await verdicts(f.alice.personId)).toMatchObject({ single: false, among: false })
    await block(f, f.manager, f.alice)
    expect(await verdicts(f.alice.personId)).toMatchObject({ single: false, among: false })
    await block(f, f.dora, f.alice)
    expect(await verdicts(f.alice.personId)).toMatchObject({ single: true, among: true })
    // Une signataire vivante n'est jamais fermée à elle-même, même en blocage avec l'autre.
    await block(f, f.manager, f.dora)
    expect(await verdicts(f.dora.personId)).toMatchObject({ single: false, among: false })
    // Page désactivée : plus aucun signataire vivant, elle n'est pas fermée par ce fait.
    await f.t.run(async (ctx) => { await ctx.db.patch(f.pageId, { status: "inactive" }) })
    expect(await verdicts(f.alice.personId)).toEqual({ single: false, among: false, live: [] })
  })
})
