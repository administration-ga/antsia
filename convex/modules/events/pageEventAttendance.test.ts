// @vitest-environment edge-runtime
/** DG-023 : sessions réelles, billets opaques, accueil versionné et révocation vivante. */
import { engineErrorAppRule, engineErrorCode } from "@antsia/social-contracts/errors"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { api, internal } from "../../_generated/api"
import type { Id } from "../../_generated/dataModel"
import { SEED_CONFIRMATION } from "../../seeds/foundations"
import { joinDeclaredDiasporaFixture, openNetworkFeatures, testConvex } from "../../test.setup"
import { engineCounters } from "../posts/counters"
import { participationOf, recordParticipation } from "./events"
import { unrecordPageEventParticipation } from "./pageEventRegistrations"

type T = ReturnType<typeof testConvex>
const E = api.modules.events.pageEvents
const Q = api.modules.events.pageEventAttendance
const A = api.modules.diaspora.associations
const NOW = Date.UTC(2026, 9, 18, 10)
const HOUR = 3_600_000
const START = NOW + 72 * HOUR
const OPEN = START - HOUR
const END = START + 2 * HOUR
const FIRST = { numItems: 20, cursor: null }

beforeEach(() => {
  vi.stubEnv("CONVEX_CLOUD_URL", "http://127.0.0.1:3210")
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs() })

async function member(t: T, networkId: Id<"networks">, handle: string, displayName: string) {
  const as = t.withIdentity({ subject: `attendance-${handle}` })
  const personId = await as.mutation(api.modules.people.persons.ensureMyPerson, {})
  await as.mutation(api.modules.people.consents.recordConsent, { purpose: "social_profile", origin: "onboarding" })
  await as.mutation(api.modules.people.profile.publishMyProfile, { handle, displayName })
  await t.run((ctx) => ctx.db.insert("identityLinks", { personId, provider: "idn", subject: `attendance-idn-${personId}`, loa: 2, nationality: "GA", linkedAt: NOW }))
  await joinDeclaredDiasporaFixture(as, { networkId, facet: { countryOfResidence: "FR", city: "Lyon" } })
  return { as, personId }
}

async function fixture() {
  const t = testConvex()
  const { root } = await t.mutation(internal.seeds.foundations.run, { confirmNonProduction: SEED_CONFIRMATION })
  const { network: networkId } = await t.mutation(internal.modules.diaspora.seed.run, { confirmNonProduction: SEED_CONFIRMATION })
  await openNetworkFeatures(t, networkId)
  const manager = await member(t, networkId, "attendance-equipe", "Awa OGOOUÉ")
  const successor = await member(t, networkId, "attendance-equipe-b", "Éloïse NDONG MBA")
  const alice = await member(t, networkId, "attendance-alice", "Alice NDONG")
  const bob = await member(t, networkId, "attendance-bob", "Jean MBA")
  const { pageId, signatureId } = await t.run(async (ctx) => {
    const pageId = await ctx.db.insert("pages", { networkId, handle: "association-presences", name: "Association de recette", ownerKind: "association", trust: "community", trustRank: 0, visibility: "network", onRoot: false, status: "active", searchText: "association recette", createdAt: NOW, updatedAt: NOW })
    const signatureId = await ctx.db.insert("pageSignatories", { networkId, pageId, personId: manager.personId, role: "admin", acceptedAt: NOW, createdAt: NOW, updatedAt: NOW })
    await ctx.db.insert("pageSignatories", { networkId, pageId, personId: successor.personId, role: "signatory", acceptedAt: NOW, createdAt: NOW, updatedAt: NOW })
    await ctx.db.insert("moderationPolicies", { networkId, surface: "event", preReview: false, maxLinks: 2, maxWrites: 100, windowMs: 60_000, updatedAt: NOW })
    return { pageId, signatureId }
  })
  for (const who of [alice, bob]) {
    const row = await who.as.mutation(A.requestAssociationMembership, { networkId, pageId })
    await manager.as.mutation(A.decideAssociationMembership, { networkId, membershipId: row.membershipId, expectedVersion: row.version, decision: "accept" })
  }
  return { t, root, networkId, pageId, signatureId, manager, successor, alice, bob }
}
type Fixture = Awaited<ReturnType<typeof fixture>>
type Member = Fixture["alice"]

function input(f: Fixture) {
  return { networkId: f.networkId, pageId: f.pageId, title: "Rencontre associative", description: "Échange entre membres.", location: "Lyon", startAt: START, endAt: END, timeZone: "Europe/Paris", audience: "association" as const }
}
function create(f: Fixture, capacity = 1, key = "attendance-event") {
  return f.manager.as.mutation(E.create, { ...input(f), capacity, idempotencyKey: key })
}
function register(f: Fixture, eventId: Id<"events">, who = f.alice) {
  return who.as.mutation(E.register, { networkId: f.networkId, eventId })
}
function get(f: Fixture, eventId: Id<"events">, who = f.alice) {
  return who.as.query(Q.get, { networkId: f.networkId, eventId, expectedReaderPersonId: who.personId })
}
function present(f: Fixture, eventId: Id<"events">, who = f.manager, paginationOpts: { numItems: number; cursor: string | null } = FIRST) {
  return who.as.query(Q.listPresent, { networkId: f.networkId, eventId, paginationOpts, expectedReaderPersonId: who.personId })
}
function issue(f: Fixture, eventId: Id<"events">, who = f.alice) {
  return who.as.mutation(Q.issueTicket, { networkId: f.networkId, eventId })
}
function preview(f: Fixture, eventId: Id<"events">, code: string, who = f.manager) {
  return who.as.mutation(Q.previewTicket, { networkId: f.networkId, eventId, code })
}
function scan(f: Fixture, eventId: Id<"events">, code: string, expectedVersion: number, who = f.manager) {
  return who.as.mutation(Q.checkIn, { networkId: f.networkId, eventId, code, expectedVersion })
}
function row(f: Fixture, eventId: Id<"events">, who = f.alice) {
  return f.t.run((ctx) => participationOf(ctx, eventId, who.personId))
}
async function refusal(promise: Promise<unknown>) {
  try { await promise } catch (error) { return engineErrorAppRule(error)?.appRule ?? engineErrorCode(error) }
  return null
}
async function removeAssociationMember(f: Fixture, who: Member = f.alice) {
  await f.t.run(async (ctx) => {
    const membership = await ctx.db.query("associationMemberships").withIndex("by_network_and_page_and_person", (q) => q.eq("networkId", f.networkId).eq("pageId", f.pageId).eq("personId", who.personId)).unique()
    if (!membership) throw new Error("Adhésion associative absente")
    await ctx.db.patch(membership._id, { status: "removed", statusChangedAt: Date.now() })
  })
}
async function moderation(f: Fixture, eventId: Id<"events">, status: "pending_review" | "removed") {
  await f.t.run(async (ctx) => {
    const state = await ctx.db.query("moderationContentStates").withIndex("by_target", (q) => q.eq("targetKind", "event").eq("targetId", eventId)).unique()
    if (!state) throw new Error("État de modération absent")
    await ctx.db.patch(state._id, { status })
  })
}

describe("présences QR des événements associatifs", () => {
  it("ouvre à début moins une heure, ferme à fin exclusive et borne le TTL à quinze minutes ou à la fin", async () => {
    const f = await fixture()
    const { eventId } = await create(f)
    await register(f, eventId)
    vi.setSystemTime(OPEN - 1)
    expect(await get(f, eventId)).toMatchObject({ opensAt: OPEN, closesAt: END, isOpen: false, canIssueTicket: false, checkedInAt: null, version: 0, recordedCount: null })
    expect(await refusal(issue(f, eventId))).toBe("association_event_attendance_closed")
    vi.setSystemTime(OPEN)
    expect(await get(f, eventId)).toMatchObject({ isOpen: true, canIssueTicket: true })
    const first = await issue(f, eventId)
    expect(first.expiresAt).toBe(OPEN + 15 * 60_000)
    vi.setSystemTime(END - 1)
    const last = await issue(f, eventId)
    expect(last.expiresAt).toBe(END)
    expect((await preview(f, eventId, last.code)).expiresAt).toBe(END)
    vi.setSystemTime(END)
    expect(await get(f, eventId, f.manager)).toMatchObject({ isOpen: false, canManage: true, canIssueTicket: false })
    expect(await refusal(issue(f, eventId))).toBe("association_event_attendance_closed")
    expect(await refusal(preview(f, eventId, last.code))).toBe("association_event_attendance_closed")
  })

  it("stocke seulement SHA-256, renouvelle le billet et sépare prévisualisation, pointage et version éditoriale", async () => {
    const f = await fixture()
    const { eventId } = await create(f)
    await register(f, eventId)
    await f.alice.as.mutation(api.modules.events.pageEventReminders.setReminder, { networkId: f.networkId, eventId, enabled: true })
    const before = await row(f, eventId)
    vi.setSystemTime(OPEN)
    const first = await issue(f, eventId)
    expect(first.code).toMatch(/^diaspora-ga-attendance:v1:[0-9a-f]{64}$/)
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(first.code))), (byte) => byte.toString(16).padStart(2, "0")).join("")
    const stored = await row(f, eventId)
    expect(stored).toMatchObject({ pageAttendanceTokenHash: hash, pageAttendanceVersion: 1 })
    expect(JSON.stringify(stored)).not.toContain(first.code)
    expect(JSON.stringify(stored)).not.toContain("diaspora-ga-attendance:v1:")
    const draft = await preview(f, eventId, first.code)
    expect(draft).toMatchObject({ displayName: "Alice NDONG", checkedInAt: null, version: 1 })
    expect(await get(f, eventId, f.manager)).toMatchObject({ recordedCount: 0, version: 0 })
    const next = await issue(f, eventId)
    expect(next.code).not.toBe(first.code)
    expect(await refusal(preview(f, eventId, first.code))).toBe("notFound")
    expect(await refusal(scan(f, eventId, next.code, draft.version))).toBe("association_event_attendance_changed")
    expect(await scan(f, eventId, next.code, 2)).toEqual({ alreadyRecorded: false })
    const checked = await row(f, eventId)
    expect(checked).toMatchObject({ status: "accepted", pageAttendanceCheckedInAt: OPEN, pageAttendanceVersion: 3, pageReminderEnabled: before!.pageReminderEnabled, pageReminderGeneration: before!.pageReminderGeneration, pageReminderScheduledGeneration: before!.pageReminderScheduledGeneration })
    expect((await f.t.run((ctx) => ctx.db.get(eventId)))?.version).toBe(1)
    const renewed = await issue(f, eventId)
    expect(await preview(f, eventId, renewed.code)).toMatchObject({ version: 4, checkedInAt: OPEN })
    expect(await refusal(preview(f, eventId, next.code))).toBe("notFound")
  })

  it("refuse indistinctement expiration, autre événement/réseau et code arbitraire", async () => {
    const f = await fixture()
    const { eventId } = await create(f)
    const other = await create(f, 1, "other-event")
    await register(f, eventId)
    vi.setSystemTime(OPEN)
    const ticket = await issue(f, eventId)
    vi.setSystemTime(ticket.expiresAt - 1)
    expect((await preview(f, eventId, ticket.code)).version).toBe(1)
    vi.setSystemTime(ticket.expiresAt)
    expect(await refusal(preview(f, eventId, ticket.code))).toBe("notFound")
    expect(await refusal(scan(f, eventId, ticket.code, 1))).toBe("notFound")
    const fresh = await issue(f, eventId)
    expect(await refusal(preview(f, other.eventId, fresh.code))).toBe("notFound")
    expect(await refusal(f.manager.as.mutation(Q.previewTicket, { networkId: f.root, eventId, code: fresh.code }))).toBe("notFound")
    for (const code of ["texte arbitraire", "https://example.test/", "diaspora-ga-attendance:v1:" + "a".repeat(64)]) expect(await refusal(preview(f, eventId, code))).toBe("notFound")
  })

  it("n'admet jamais une attente par QR et laisse un membre en attente gérer son billet déjà confirmé", async () => {
    const f = await fixture()
    const { eventId } = await create(f)
    await register(f, eventId)
    await register(f, eventId, f.bob)
    await f.t.run(async (ctx) => {
      const membership = await ctx.db.query("networkMemberships").withIndex("by_network_and_person", (q) => q.eq("networkId", f.networkId).eq("personId", f.alice.personId)).unique()
      if (!membership) throw new Error("Adhésion réseau absente")
      await ctx.db.patch(membership._id, { status: "en_attente" })
    })
    vi.setSystemTime(OPEN)
    expect(await get(f, eventId, f.bob)).toMatchObject({ canIssueTicket: false, recordedCount: null })
    expect(await refusal(issue(f, eventId, f.bob))).toBe("notFound")
    expect(await refusal(issue(f, eventId, f.manager))).toBe("notFound")
    const ticket = await issue(f, eventId)
    expect((await preview(f, eventId, ticket.code)).registrationId).toBe((await row(f, eventId))?._id)
    expect(await refusal(preview(f, eventId, ticket.code, f.bob))).toBe("notFound")
    expect(await refusal(present(f, eventId, f.bob))).toBe("notFound")
    expect((await row(f, eventId, f.bob))?.status).toBe("pending")
  })

  it("dédoublonne le scan concurrent puis corrige par CAS après la fenêtre, même annulé", async () => {
    const f = await fixture()
    const { eventId } = await create(f)
    await register(f, eventId)
    vi.setSystemTime(OPEN)
    const ticket = await issue(f, eventId)
    const previewed = await preview(f, eventId, ticket.code)
    const results = await Promise.all([scan(f, eventId, ticket.code, previewed.version), scan(f, eventId, ticket.code, previewed.version)])
    expect(results.map((item) => item.alreadyRecorded).sort()).toEqual([false, true])
    expect(await scan(f, eventId, ticket.code, 0)).toEqual({ alreadyRecorded: true })
    expect(await get(f, eventId)).toMatchObject({ checkedInAt: OPEN, version: 2, recordedCount: null })
    expect(await get(f, eventId, f.manager)).toMatchObject({ recordedCount: 1 })
    expect(await refusal(f.manager.as.mutation(Q.clear, { networkId: f.networkId, eventId, registrationId: previewed.registrationId, expectedVersion: 1 }))).toBe("association_event_attendance_changed")
    vi.setSystemTime(END)
    await f.manager.as.mutation(E.cancel, { networkId: f.networkId, eventId, expectedVersion: 1 })
    await f.manager.as.mutation(Q.clear, { networkId: f.networkId, eventId, registrationId: previewed.registrationId, expectedVersion: 2 })
    const cleared = await row(f, eventId)
    expect(cleared).toMatchObject({ status: "accepted", pageAttendanceVersion: 3 })
    expect(cleared?.pageAttendanceTokenHash).toBeUndefined()
    expect(cleared?.pageAttendanceTokenExpiresAt).toBeUndefined()
    expect(cleared?.pageAttendanceCheckedInAt).toBeUndefined()
    expect(await get(f, eventId, f.manager)).toMatchObject({ recordedCount: 0 })
    expect(await refusal(f.manager.as.mutation(Q.clear, { networkId: f.networkId, eventId, registrationId: previewed.registrationId, expectedVersion: 2 }))).toBe("association_event_attendance_changed")
  })

  for (const reset of ["withdraw", "erasure", "orphan"] as const) {
    it(`invalide billet, présence et compteur au ${reset}`, async () => {
      const f = await fixture()
      const { eventId } = await create(f)
      await register(f, eventId)
      vi.setSystemTime(OPEN)
      const ticket = await issue(f, eventId)
      await scan(f, eventId, ticket.code, 1)
      const old = await row(f, eventId)
      if (reset === "withdraw") {
        await f.alice.as.mutation(E.unregister, { networkId: f.networkId, eventId })
        expect(await row(f, eventId)).toMatchObject({ pageAttendanceVersion: 3, status: "declined" })
        await register(f, eventId)
        expect(await row(f, eventId)).toMatchObject({ _id: old!._id, pageAttendanceVersion: 4, status: "accepted" })
        expect(await refusal(preview(f, eventId, ticket.code))).toBe("notFound")
      } else await f.t.run(async (ctx) => {
        if (reset === "orphan") await ctx.db.delete(eventId)
        const current = await ctx.db.get(old!._id)
        if (!current) throw new Error("Participation absente")
        await unrecordPageEventParticipation(ctx, current)
        const cleaned = await ctx.db.get(current._id)
        expect(cleaned?.pageAttendanceTokenHash).toBeUndefined()
        expect(cleaned?.pageAttendanceCheckedInAt).toBeUndefined()
        expect(cleaned?.pageAttendanceVersion).toBe(3)
        await ctx.db.delete(current._id)
      })
      expect(await f.t.run((ctx) => engineCounters.count(ctx, { namespace: `events.pageAttendance:${eventId}` }))).toBe(0)
    })
  }

  for (const lost of ["manager_role", "association", "root", "deleted", "erased", "page", "pending", "removed", "cancelled"] as const) {
    it(`relit les droits et les personnes après ${lost}`, async () => {
      const f = await fixture()
      const { eventId } = await create(f)
      await register(f, eventId)
      vi.setSystemTime(OPEN)
      const ticket = await issue(f, eventId)
      if (lost === "manager_role") await f.t.run((ctx) => ctx.db.patch(f.signatureId, { acceptedAt: undefined }))
      else if (lost === "association") await removeAssociationMember(f)
      else if (lost === "root") await f.t.run(async (ctx) => {
        const membership = await ctx.db.query("networkMemberships").withIndex("by_network_and_person", (q) => q.eq("networkId", f.root).eq("personId", f.alice.personId)).unique()
        if (!membership) throw new Error("Adhésion racine absente")
        await ctx.db.patch(membership._id, { status: "suspendue" })
      })
      else if (lost === "deleted") await f.t.run((ctx) => ctx.db.patch(f.alice.personId, { deletionRequestedAt: OPEN }))
      else if (lost === "erased") await f.t.run((ctx) => ctx.db.patch(f.alice.personId, { erasedAt: OPEN }))
      else if (lost === "page") await f.t.run((ctx) => ctx.db.patch(f.pageId, { status: "inactive" }))
      else if (lost === "cancelled") await f.manager.as.mutation(E.cancel, { networkId: f.networkId, eventId, expectedVersion: 1 })
      else await moderation(f, eventId, lost === "pending" ? "pending_review" : "removed")
      expect(await refusal(preview(f, eventId, ticket.code))).toBe(lost === "cancelled" ? "association_event_attendance_closed" : "notFound")
      expect(await refusal(scan(f, eventId, ticket.code, 1))).toBe(lost === "cancelled" ? "association_event_attendance_closed" : "notFound")
      expect((await row(f, eventId))?.pageAttendanceCheckedInAt).toBeUndefined()
      if (lost === "manager_role") expect((await preview(f, eventId, ticket.code, f.successor)).version).toBe(1)
    })
  }

  it("borne la pagination, lie le lecteur et neutralise les noms devenus privés sans perdre la correction", async () => {
    const f = await fixture()
    const { eventId } = await create(f, 2)
    await register(f, eventId)
    await register(f, eventId, f.bob)
    vi.setSystemTime(OPEN)
    const aliceTicket = await issue(f, eventId), bobTicket = await issue(f, eventId, f.bob)
    await scan(f, eventId, aliceTicket.code, 1)
    await scan(f, eventId, bobTicket.code, 1)
    const first = await present(f, eventId, f.manager, { numItems: 1, cursor: null })
    expect(first.items).toHaveLength(1)
    expect(first.isDone).toBe(false)
    const next = await present(f, eventId, f.manager, { numItems: 1, cursor: first.continueCursor })
    expect(new Set([...first.items, ...next.items].map((item) => item.registrationId)).size).toBe(2)
    const all = await present(f, eventId, f.manager, { numItems: Number.POSITIVE_INFINITY, cursor: null })
    expect(all.items.map((item) => item.displayName).sort()).toEqual(["Alice NDONG", "Jean MBA"])
    for (const secret of [f.alice.personId, f.bob.personId, "attendance-alice", "attendance-bob", aliceTicket.code, bobTicket.code, "pageAttendanceTokenHash"]) expect(JSON.stringify(all)).not.toContain(secret)
    expect(await get(f, eventId, f.manager)).toMatchObject({ version: 0, recordedCount: 2, checkedInAt: null })
    expect(await refusal(f.manager.as.query(Q.get, { networkId: f.networkId, eventId, expectedReaderPersonId: f.alice.personId }))).toBe("notFound")
    expect(await refusal(f.manager.as.query(Q.listPresent, { networkId: f.networkId, eventId, paginationOpts: FIRST, expectedReaderPersonId: f.alice.personId }))).toBe("notFound")
    expect(await refusal(f.t.query(Q.get, { networkId: f.networkId, eventId, expectedReaderPersonId: f.alice.personId }))).toBe("unauthenticated")
    await removeAssociationMember(f)
    await f.t.run((ctx) => ctx.db.patch(f.bob.personId, { publishedAt: undefined, withdrawnAt: OPEN }))
    const neutral = await present(f, eventId)
    expect(neutral.items).toHaveLength(2)
    expect(neutral.items.every((item) => item.displayName === null)).toBe(true)
    const alice = await row(f, eventId)
    await f.manager.as.mutation(Q.clear, { networkId: f.networkId, eventId, registrationId: alice!._id, expectedVersion: 2 })
    expect(await get(f, eventId, f.manager)).toMatchObject({ recordedCount: 1 })
    await f.t.run((ctx) => ctx.db.patch(f.bob.personId, { deletionRequestedAt: OPEN }))
    expect((await present(f, eventId)).items).toEqual([])
    // Une purge différée peut conserver un pointage compté dont la personne est déjà filtrée.
    expect(await get(f, eventId, f.manager)).toMatchObject({ recordedCount: 1 })
  })

  for (const surface of ["issue", "preview"] as const) {
    it(`applique le seau borné aux gestes ${surface}`, async () => {
      const f = await fixture()
      const { eventId } = await create(f)
      await register(f, eventId)
      vi.setSystemTime(OPEN)
      const ticket = await issue(f, eventId)
      let code: string | null = null
      for (let index = 0; index < 40 && code === null; index += 1) code = await refusal(surface === "issue" ? issue(f, eventId) : preview(f, eventId, ticket.code))
      expect(code).toBe("rateLimited")
      expect((await row(f, eventId))?.pageAttendanceCheckedInAt).toBeUndefined()
    })
  }

  it("ne crée ni billet ni présence pour un événement personnel et préserve son ancien hook de compteur", async () => {
    const f = await fixture()
    const personal = await f.manager.as.mutation(api.modules.events.events.create, { networkId: f.networkId, title: "Rendez-vous personnel", startAt: START, endAt: END, timeZone: "UTC", idempotencyKey: "personal-attendance" })
    const participationId = await f.t.run(async (ctx) => {
      const id = await ctx.db.insert("eventParticipants", { networkId: f.networkId, eventId: personal.eventId, personId: f.alice.personId, invitedByPersonId: f.manager.personId, status: "accepted", eventStartAt: START, createdAt: NOW })
      await recordParticipation(ctx, { _id: id, eventId: personal.eventId }, true)
      const participation = await ctx.db.get(id)
      if (!participation) throw new Error("Participation absente")
      await unrecordPageEventParticipation(ctx, participation)
      return id
    })
    vi.setSystemTime(OPEN)
    expect(await get(f, personal.eventId)).toBeNull()
    expect(await refusal(issue(f, personal.eventId))).toBe("notFound")
    expect(await refusal(present(f, personal.eventId))).toBe("notFound")
    expect((await f.t.run((ctx) => ctx.db.get(participationId)))?.pageAttendanceVersion).toBeUndefined()
    expect(await f.t.run((ctx) => engineCounters.count(ctx, { namespace: `events.accepted:${personal.eventId}` }))).toBe(1)
    await f.t.run(async (ctx) => {
      await ctx.db.delete(personal.eventId)
      const participation = await ctx.db.get(participationId)
      if (!participation) throw new Error("Participation absente")
      await unrecordPageEventParticipation(ctx, participation)
    })
    expect((await f.t.run((ctx) => ctx.db.get(participationId)))?.pageAttendanceVersion).toBeUndefined()
  })
})
