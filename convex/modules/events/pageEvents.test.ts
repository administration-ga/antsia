// @vitest-environment edge-runtime
/** DG-010 : sessions réelles, autorité collective, audience vivante et inscriptions volontaires. */
import { engineErrorAppRule, engineErrorCode } from "@antsia/social-contracts/errors"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { api, internal } from "../../_generated/api"
import type { Id } from "../../_generated/dataModel"
import { SEED_CONFIRMATION } from "../../seeds/foundations"
import { joinDeclaredDiasporaFixture, openNetworkFeatures, testConvex } from "../../test.setup"
import { eventCardOf } from "./card"
import { requireEventAccess } from "./events"

type T = ReturnType<typeof testConvex>
const E = api.modules.events.pageEvents
const PERSONAL = api.modules.events.events
const A = api.modules.diaspora.associations
const NOW = Date.UTC(2026, 9, 18, 10)
const HOUR = 3_600_000
const FIRST = { numItems: 20, cursor: null }

beforeEach(() => {
  vi.stubEnv("CONVEX_CLOUD_URL", "http://127.0.0.1:3210")
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(NOW)
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs() })

async function member(t: T, networkId: Id<"networks">, handle: string, displayName: string) {
  const as = t.withIdentity({ subject: `page-event-${handle}` })
  const personId = await as.mutation(api.modules.people.persons.ensureMyPerson, {})
  await as.mutation(api.modules.people.consents.recordConsent, { purpose: "social_profile", origin: "onboarding" })
  await as.mutation(api.modules.people.profile.publishMyProfile, { handle, displayName })
  await t.run((ctx) => ctx.db.insert("identityLinks", { personId, provider: "idn", subject: `page-event-idn-${personId}`, loa: 1, nationality: "GA", linkedAt: NOW }))
  await joinDeclaredDiasporaFixture(as, { networkId, facet: { countryOfResidence: "FR", city: "Lyon" } })
  return { as, personId }
}

async function fixture(withPolicy = true) {
  const t = testConvex()
  const { root } = await t.mutation(internal.seeds.foundations.run, { confirmNonProduction: SEED_CONFIRMATION })
  const { network: networkId } = await t.mutation(internal.modules.diaspora.seed.run, { confirmNonProduction: SEED_CONFIRMATION })
  await openNetworkFeatures(t, networkId)
  const manager = await member(t, networkId, "asso-manager", "Awa OGOOUÉ")
  const successor = await member(t, networkId, "asso-equipe", "Éloïse NDONG MBA")
  const participant = await member(t, networkId, "asso-participante", "Nadia NDONG")
  const outsider = await member(t, networkId, "asso-tiers", "Jean MBA")
  const { pageId, signatoryId } = await t.run(async (ctx) => {
    const pageId = await ctx.db.insert("pages", {
      networkId, handle: "association-evenements", name: "Association de recette", ownerKind: "association",
      trust: "community", trustRank: 0, visibility: "network", onRoot: false, status: "active",
      searchText: "association recette", createdAt: NOW, updatedAt: NOW,
    })
    const signatoryId = await ctx.db.insert("pageSignatories", { networkId, pageId, personId: manager.personId, role: "admin", acceptedAt: NOW, createdAt: NOW, updatedAt: NOW })
    await ctx.db.insert("pageSignatories", { networkId, pageId, personId: successor.personId, role: "signatory", acceptedAt: NOW, createdAt: NOW, updatedAt: NOW })
    if (withPolicy) await ctx.db.insert("moderationPolicies", { networkId, surface: "event", preReview: false, maxLinks: 2, maxWrites: 100, windowMs: 60_000, updatedAt: NOW })
    return { pageId, signatoryId }
  })
  return { t, root, networkId, pageId, signatoryId, manager, successor, participant, outsider }
}

type Fixture = Awaited<ReturnType<typeof fixture>>
type Member = Fixture["participant"]

function input(f: Fixture) {
  return { networkId: f.networkId, pageId: f.pageId, title: "Rencontre associative", description: "Échange entre membres.", location: "Lyon", startAt: NOW + 24 * HOUR, endAt: NOW + 26 * HOUR, timeZone: "Europe/Paris", audience: "association" as const }
}
async function create(f: Fixture, options: { audience?: "network" | "association"; key?: string } = {}) {
  return f.manager.as.mutation(E.create, { ...input(f), audience: options.audience ?? "association", idempotencyKey: options.key ?? "page-event-1" })
}
function get(f: Fixture, eventId: Id<"events">, who = f.participant) {
  return who.as.query(E.get, { networkId: f.networkId, eventId })
}
function list(f: Fixture, who = f.participant, paginationOpts: { numItems: number; cursor: string | null } = FIRST) {
  return who.as.query(E.listForPage, { networkId: f.networkId, pageId: f.pageId, paginationOpts })
}
async function accept(f: Fixture, who: Member = f.participant) {
  const row = await who.as.mutation(A.requestAssociationMembership, { networkId: f.networkId, pageId: f.pageId })
  await f.manager.as.mutation(A.decideAssociationMembership, { networkId: f.networkId, membershipId: row.membershipId, expectedVersion: row.version, decision: "accept" })
  return row.membershipId
}
async function participation(f: Fixture, eventId: Id<"events">, who = f.participant) {
  return f.t.run((ctx) => ctx.db.query("eventParticipants").withIndex("by_event_person", (q) => q.eq("eventId", eventId).eq("personId", who.personId)).unique())
}
async function moderation(f: Fixture, eventId: Id<"events">, status: "published" | "pending_review" | "removed") {
  await f.t.run(async (ctx) => {
    const row = await ctx.db.query("moderationContentStates").withIndex("by_target", (q) => q.eq("targetKind", "event").eq("targetId", eventId)).unique()
    if (!row) throw new Error("État de modération absent")
    await ctx.db.patch(row._id, { status })
  })
}
async function refusal(promise: Promise<unknown>) {
  try { await promise } catch (error) { return engineErrorAppRule(error)?.appRule ?? engineErrorCode(error) }
  return null
}

describe("événements collectifs d'association", () => {
  it("sans politique, montre le pending uniquement à l'équipe et ne crée aucune participation", async () => {
    const f = await fixture(false)
    await accept(f)
    const draft = input(f)
    const { eventId } = await f.manager.as.mutation(E.create, {
      networkId: f.networkId, pageId: f.pageId, title: draft.title, description: draft.description, location: draft.location,
      startAt: draft.startAt, endAt: draft.endAt, timeZone: draft.timeZone, idempotencyKey: "default-private-audience",
    })
    expect(await get(f, eventId, f.manager)).toMatchObject({ pageId: f.pageId, audience: "association", moderation: "pending_review", canManage: true, canRegister: false, isRegistered: false, organizer: { name: "Association de recette", handle: "association-evenements" } })
    expect(await get(f, eventId)).toBeNull()
    expect((await list(f)).items).toEqual([])
    expect(await refusal(f.participant.as.mutation(E.register, { networkId: f.networkId, eventId }))).toBe("notFound")
    const stored = await f.t.run((ctx) => ctx.db.get(eventId))
    expect(stored?.organizerPersonId).toBeUndefined()
    expect(stored?.createdByPersonId).toBe(f.manager.personId)
    expect(stored?.organizerPageId).toBe(f.pageId)
    const rows = await f.t.run((ctx) => ctx.db.query("eventParticipants").withIndex("by_event_person", (q) => q.eq("eventId", eventId)).take(2))
    expect(rows).toEqual([])
    const state = await f.t.run((ctx) => ctx.db.query("moderationContentStates").withIndex("by_target", (q) => q.eq("targetKind", "event").eq("targetId", eventId)).unique())
    expect(state?.ownerPageId).toBe(f.pageId)
    expect(state?.ownerPersonId).toBeUndefined()
  })

  it("relit le rôle vivant : l'ancien créateur perd tout pouvoir et l'autre signataire garde la gestion", async () => {
    const f = await fixture()
    const { eventId } = await create(f)
    await f.t.run((ctx) => ctx.db.patch(f.signatoryId, { acceptedAt: undefined }))
    expect(await get(f, eventId, f.manager)).toBeNull()
    expect(await refusal(f.manager.as.mutation(E.update, { ...input(f), eventId, expectedVersion: 1 }))).toBe("notFound")
    await f.successor.as.mutation(E.update, { ...input(f), eventId, expectedVersion: 1, title: "Rencontre portée par toute l’équipe" })
    const view = await get(f, eventId, f.successor)
    expect(view).toMatchObject({ title: "Rencontre portée par toute l’équipe", version: 2, canManage: true })
    expect(JSON.stringify(view)).not.toContain(f.manager.personId)
    expect(JSON.stringify(view)).not.toContain(f.successor.personId)
  })

  it("inscrit seulement la personne volontaire, dédoublonne les gestes concurrents et garde une seule ligne réutilisable", async () => {
    const f = await fixture()
    await accept(f)
    const { eventId } = await create(f)
    const register = () => f.participant.as.mutation(E.register, { networkId: f.networkId, eventId })
    await Promise.all([register(), register()])
    const first = await participation(f, eventId)
    expect(first).toMatchObject({ personId: f.participant.personId, invitedByPersonId: f.participant.personId, status: "accepted" })
    expect(await get(f, eventId)).toMatchObject({ isRegistered: true, canRegister: false })
    await f.participant.as.mutation(E.unregister, { networkId: f.networkId, eventId })
    await register()
    expect(await participation(f, eventId)).toMatchObject({ _id: first!._id, status: "accepted" })
    const rows = await f.t.run((ctx) => ctx.db.query("eventParticipants").withIndex("by_event_person", (q) => q.eq("eventId", eventId)).take(3))
    expect(rows).toHaveLength(1)
    expect(await participation(f, eventId, f.manager)).toBeNull()
  })

  it("retire immédiatement l'accès privé après départ ou exclusion, sans garder un droit par l'inscription", async () => {
    const f = await fixture()
    const membershipId = await accept(f)
    const { eventId } = await create(f)
    await f.participant.as.mutation(E.register, { networkId: f.networkId, eventId })
    for (const status of ["left", "removed"] as const) {
      await f.t.run((ctx) => ctx.db.patch(membershipId, { status, statusChangedAt: Date.now() }))
      expect(await get(f, eventId)).toBeNull()
      expect(await f.t.run((ctx) => eventCardOf(ctx, eventId, f.participant.personId))).toBeNull()
      expect(await refusal(f.t.run((ctx) => requireEventAccess(ctx, f.networkId, eventId, f.participant.personId)))).toBe("notFound")
      expect(await refusal(f.participant.as.mutation(E.register, { networkId: f.networkId, eventId }))).toBe("notFound")
    }
    await f.t.run(async (ctx) => {
      const row = await ctx.db.query("networkMemberships").withIndex("by_network_and_person", (q) => q.eq("networkId", f.networkId).eq("personId", f.participant.personId)).unique()
      if (!row) throw new Error("Adhésion réseau absente")
      await ctx.db.patch(row._id, { status: "en_attente" })
    })
    await f.participant.as.mutation(E.unregister, { networkId: f.networkId, eventId })
    expect((await participation(f, eventId))?.status).toBe("declined")
  })

  it("une audience rendue privée ferme immédiatement carte, détail et inscriptions précédentes du non-adhérent", async () => {
    const f = await fixture()
    const { eventId } = await create(f, { audience: "network" })
    await f.outsider.as.mutation(E.register, { networkId: f.networkId, eventId })
    expect(await get(f, eventId, f.outsider)).toMatchObject({ audience: "network", isRegistered: true })
    expect((await f.outsider.as.query(PERSONAL.myAgenda, { networkId: f.networkId, now: NOW })).associationItems).toMatchObject([{ eventId, registration: "confirmed" }])
    await f.manager.as.mutation(E.update, { ...input(f), eventId, expectedVersion: 1, audience: "association" })
    expect(await get(f, eventId, f.outsider)).toBeNull()
    expect((await list(f, f.outsider)).items).toEqual([])
    expect(await f.t.run((ctx) => eventCardOf(ctx, eventId, f.outsider.personId))).toBeNull()
    const row = await participation(f, eventId, f.outsider)
    expect(await refusal(f.outsider.as.mutation(PERSONAL.respond, { networkId: f.networkId, participationId: row!._id, response: "accepted" }))).toBe("notFound")
    const closedAgenda = await f.outsider.as.query(PERSONAL.myAgenda, { networkId: f.networkId, now: NOW })
    expect(closedAgenda.items.map((item) => item.eventId)).not.toContain(eventId)
    expect(closedAgenda.associationItems.map((item) => item.eventId)).not.toContain(eventId)
  })

  it("ferme les anciennes API de gestion et la liste des personnes aux événements de page, sans casser le DTO personnel", async () => {
    const f = await fixture()
    const { eventId } = await create(f)
    expect(await refusal(f.manager.as.query(PERSONAL.getEvent, { networkId: f.networkId, eventId }))).toBe("notFound")
    expect(await refusal(f.manager.as.query(PERSONAL.paginateEventParticipants, { networkId: f.networkId, eventId, paginationOpts: FIRST }))).toBe("notFound")
    expect(await refusal(f.manager.as.mutation(PERSONAL.invite, { networkId: f.networkId, eventId, handle: "asso-tiers" }))).toBe("notFound")
    expect(await refusal(f.manager.as.mutation(PERSONAL.cancel, { networkId: f.networkId, eventId }))).toBe("notFound")
    expect(await refusal(f.manager.as.mutation(PERSONAL.announce, { networkId: f.networkId, eventId, audience: "public", alsoOnRoot: true }))).toBe("notFound")
    const personal = await f.manager.as.mutation(PERSONAL.create, { networkId: f.networkId, title: "Agenda personnel", startAt: NOW + HOUR, endAt: NOW + 2 * HOUR, timeZone: "UTC", idempotencyKey: "personal-compatible" })
    expect(await f.manager.as.query(PERSONAL.getEvent, { networkId: f.networkId, eventId: personal.eventId })).toMatchObject({ organizer: { personId: f.manager.personId }, isOrganizer: true })
  })

  it("deux créations concurrentes d'une même clé de page rendent le même événement sans doubler", async () => {
    const f = await fixture()
    const results = await Promise.all([create(f), create(f)])
    expect(results[0]!.eventId).toBe(results[1]!.eventId)
    expect(results.filter((result) => result.created)).toHaveLength(1)
    expect(await f.successor.as.mutation(E.create, { ...input(f), title: "  Rencontre associative  ", description: "  Échange entre membres.  ", location: " Lyon ", timeZone: " Europe/Paris ", idempotencyKey: " page-event-1 " })).toEqual({ eventId: results[0]!.eventId, created: false })
    for (const patch of [{ title: "Autre rencontre" }, { description: "Autre description" }, { location: "Paris" }, { startAt: NOW + 25 * HOUR }, { timeZone: "UTC" }, { audience: "network" as const }]) {
      const conflict = await f.successor.as.mutation(E.create, { ...input(f), ...patch, idempotencyKey: "page-event-1" })
        .catch((error: unknown) => ({ code: engineErrorCode(error), appRule: engineErrorAppRule(error)?.appRule }))
      expect(conflict).toEqual({ code: "conflict", appRule: "association_event_version_changed" })
    }
    vi.setSystemTime(NOW + 30 * HOUR)
    expect(await create(f)).toEqual({ eventId: results[0]!.eventId, created: false })
    const rows = await f.t.run((ctx) => ctx.db.query("events").withIndex("by_page_idempotency", (q) => q.eq("organizerPageId", f.pageId).eq("idempotencyKey", "page-event-1")).take(3))
    expect(rows).toHaveLength(1)
  })

  it("arbitre deux éditions concurrentes sur une version et conserve une annulation versionnée", async () => {
    const f = await fixture()
    const { eventId } = await create(f)
    const results = await Promise.allSettled([
      f.manager.as.mutation(E.update, { ...input(f), eventId, expectedVersion: 1, title: "Première édition" }),
      f.successor.as.mutation(E.update, { ...input(f), eventId, expectedVersion: 1, title: "Deuxième édition" }),
    ])
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1)
    const refused = results.find((result) => result.status === "rejected")
    expect(refused?.status === "rejected" ? engineErrorAppRule(refused.reason)?.appRule : null).toBe("association_event_version_changed")
    await f.manager.as.mutation(E.cancel, { networkId: f.networkId, eventId, expectedVersion: 2 })
    expect(await get(f, eventId, f.manager)).toMatchObject({ status: "cancelled", version: 3, canRegister: false })
    await f.manager.as.mutation(E.cancel, { networkId: f.networkId, eventId, expectedVersion: 3 })
    expect(await refusal(f.manager.as.mutation(E.cancel, { networkId: f.networkId, eventId, expectedVersion: 2 }))).toBe("association_event_version_changed")
    expect(await refusal(f.manager.as.mutation(E.register, { networkId: f.networkId, eventId }))).toBe("association_event_cancelled")
    expect(await refusal(f.manager.as.mutation(E.update, { ...input(f), eventId, expectedVersion: 3 }))).toBe("association_event_cancelled")
    expect((await f.t.run((ctx) => ctx.db.get(eventId)))?.cancelledAt).toBe(NOW)
  })

  it("fige dates et fuseau dès une participation même retirée, mais autorise le texte inchangé en date après le début", async () => {
    const f = await fixture()
    await accept(f)
    const { eventId } = await create(f)
    await f.participant.as.mutation(E.register, { networkId: f.networkId, eventId })
    await f.participant.as.mutation(E.unregister, { networkId: f.networkId, eventId })
    expect(await refusal(f.manager.as.mutation(E.update, { ...input(f), eventId, expectedVersion: 1, startAt: NOW + 25 * HOUR }))).toBe("association_event_schedule_locked")
    expect(await refusal(f.manager.as.mutation(E.update, { ...input(f), eventId, expectedVersion: 1, timeZone: "UTC" }))).toBe("association_event_schedule_locked")
    vi.setSystemTime(NOW + 25 * HOUR)
    await f.manager.as.mutation(E.update, { ...input(f), eventId, expectedVersion: 1, title: "Informations pratiques mises à jour" })
    expect(await get(f, eventId, f.manager)).toMatchObject({ version: 2, startAt: NOW + 24 * HOUR })
    expect(await refusal(f.participant.as.mutation(E.register, { networkId: f.networkId, eventId }))).toBe("association_event_registration_closed")
  })

  it("une inscription concurrente au déplacement ne garde jamais une ancienne date dans l'agenda stocké", async () => {
    const f = await fixture()
    await accept(f)
    const { eventId } = await create(f)
    const results = await Promise.allSettled([
      f.participant.as.mutation(E.register, { networkId: f.networkId, eventId }),
      f.manager.as.mutation(E.update, { ...input(f), eventId, expectedVersion: 1, startAt: NOW + 30 * HOUR, endAt: NOW + 31 * HOUR }),
    ])
    expect(results[0]!.status).toBe("fulfilled")
    const event = await f.t.run((ctx) => ctx.db.get(eventId))
    const registered = await participation(f, eventId)
    expect(registered?.status).toBe("accepted")
    expect(registered?.eventStartAt).toBe(event?.startAt)
    const updateResult = results[1]!
    if (updateResult.status === "rejected") expect(engineErrorAppRule(updateResult.reason)?.appRule).toBe("association_event_schedule_locked")
    else expect(event?.startAt).toBe(NOW + 30 * HOUR)
  })

  it("pagine les fenêtres filtrées et ne montre aux membres que le publié, sans références de personne ni liste", async () => {
    const f = await fixture()
    await accept(f)
    const published = await create(f, { key: "page-list-1" })
    const pending = await create(f, { key: "page-list-2" })
    const removed = await create(f, { key: "page-list-3" })
    await moderation(f, pending.eventId, "pending_review")
    await moderation(f, removed.eventId, "removed")
    const first = await list(f, f.participant, { numItems: 1, cursor: null })
    expect(first.items.map((item) => item.eventId)).toEqual([published.eventId])
    expect(first.isDone).toBe(false)
    const second = await list(f, f.participant, { numItems: 1, cursor: first.continueCursor })
    expect(second.items).toEqual([])
    expect(second.isDone).toBe(false)
    const third = await list(f, f.participant, { numItems: 1, cursor: second.continueCursor })
    expect(third).toMatchObject({ items: [], isDone: true, continueCursor: null })
    expect((await list(f, f.manager)).items.map((item) => item.eventId)).toEqual([published.eventId, pending.eventId])
    expect(await get(f, removed.eventId, f.manager)).toBeNull()
    const json = JSON.stringify(first.items)
    for (const privateValue of [f.manager.personId, f.participant.personId, "createdByPersonId", "participants", "participantCount", "acceptedCount"]) expect(json).not.toContain(privateValue)
  })

  it("revalide la modération à l'édition et ne transforme pas une modification retirée en republication", async () => {
    const f = await fixture()
    await accept(f)
    const { eventId } = await create(f)
    await f.t.run(async (ctx) => {
      const policy = await ctx.db.query("moderationPolicies").withIndex("by_network_surface", (q) => q.eq("networkId", f.networkId).eq("surface", "event")).unique()
      if (!policy) throw new Error("Politique absente")
      await ctx.db.patch(policy._id, { preReview: true })
    })
    await f.manager.as.mutation(E.update, { ...input(f), eventId, expectedVersion: 1, description: "Le texte doit être relu." })
    expect(await get(f, eventId)).toBeNull()
    expect(await get(f, eventId, f.manager)).toMatchObject({ moderation: "pending_review", version: 2 })
    await moderation(f, eventId, "removed")
    expect(await refusal(f.manager.as.mutation(E.update, { ...input(f), eventId, expectedVersion: 2 }))).toBe("notFound")
    expect((await f.t.run((ctx) => ctx.db.get(eventId)))?.version).toBe(2)
  })

  it("ramène les limites de pagination non finies à une fenêtre bornée", async () => {
    const f = await fixture()
    await accept(f)
    const first = await create(f, { key: "finite-list-1" })
    const second = await create(f, { key: "finite-list-2" })
    for (const numItems of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      const result = await list(f, f.participant, { numItems, cursor: null })
      expect(result.items.map((item) => item.eventId)).toEqual([first.eventId, second.eventId])
      expect(result.isDone).toBe(true)
    }
    expect((await list(f, f.participant, { numItems: -1, cursor: null })).items).toHaveLength(1)
  })

  it("exige une session admise et le réseau DIASPORA.GA, puis referme une adhésion racine suspendue", async () => {
    const f = await fixture()
    const { eventId } = await create(f, { audience: "network" })
    expect(await refusal(f.t.query(E.get, { networkId: f.networkId, eventId }))).toBe("unauthenticated")
    expect(await refusal(f.manager.as.query(E.get, { networkId: f.root, eventId }))).toBe("notFound")
    expect(await refusal(f.outsider.as.mutation(E.create, { ...input(f), idempotencyKey: "no-role" }))).toBe("association_event_access_required")
    await f.t.run(async (ctx) => {
      const row = await ctx.db.query("networkMemberships").withIndex("by_network_and_person", (q) => q.eq("networkId", f.root).eq("personId", f.outsider.personId)).unique()
      if (!row) throw new Error("Adhésion racine absente")
      await ctx.db.patch(row._id, { status: "suspendue" })
    })
    expect(await refusal(get(f, eventId, f.outsider))).toBe("membershipSuspended")
    expect(await f.t.run((ctx) => eventCardOf(ctx, eventId, f.outsider.personId))).toBeNull()
  })

  it("valide le futur, les textes, le fuseau et les clés, et accepte un déplacement futur sans inscrit", async () => {
    const f = await fixture()
    for (const patch of [{ title: "ab" }, { timeZone: "Mars/Olympus" }, { endAt: NOW }, { startAt: NOW - HOUR }, { idempotencyKey: " " }]) {
      expect(await refusal(f.manager.as.mutation(E.create, { ...input(f), idempotencyKey: "invalid-event", ...patch }))).toBe("association_event_invalid")
    }
    const { eventId } = await create(f)
    await f.manager.as.mutation(E.update, { ...input(f), eventId, expectedVersion: 1, startAt: NOW + 30 * HOUR, endAt: NOW + 31 * HOUR, timeZone: "UTC" })
    expect(await get(f, eventId, f.manager)).toMatchObject({ version: 2, startAt: NOW + 30 * HOUR, timeZone: "UTC" })
  })
})
