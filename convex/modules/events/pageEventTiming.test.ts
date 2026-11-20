// @vitest-environment edge-runtime
/** DG-023 : clôture UTC, opt-in J-1, jetons durables et refus vivants sans reçu fictif. */
import { engineErrorAppRule, engineErrorCode } from "@antsia/social-contracts/errors"
import { associationEventReminderAt } from "../diaspora/associationEventRules"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { api, internal } from "../../_generated/api"
import type { Id } from "../../_generated/dataModel"
import { SEED_CONFIRMATION } from "../../seeds/foundations"
import { testConvex } from "../../test.setup"
import * as notificationsWriter from "../notifications/notify"
import { notificationStillVisible, pushAllowed } from "../notifications/policy"
import { participationOf } from "./events"
import { pageEventReminderVisible } from "./pageEventReminderAccess"
import { unrecordPageEventParticipation } from "./pageEventRegistrations"

type T = ReturnType<typeof testConvex>
const E = api.modules.events.pageEvents
const R = api.modules.events.pageEventReminders
const DELIVER = internal.modules.events.pageEventReminders.deliverPageEventReminder
const FILL = internal.modules.events.pageEventRegistrations.fillPageEventSeats
const A = api.modules.diaspora.associations
const B = api.modules.notifications.bell
const NOW = Date.UTC(2026, 9, 18, 10)
const HOUR = 3_600_000
const START = NOW + 72 * HOUR
const DUE = associationEventReminderAt(START)

beforeEach(() => {
  vi.stubEnv("CONVEX_CLOUD_URL", "http://127.0.0.1:3210")
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
})
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); vi.unstubAllEnvs() })

async function member(t: T, networkId: Id<"networks">, handle: string, displayName: string) {
  const as = t.withIdentity({ subject: `timing-${handle}` })
  const personId = await as.mutation(api.modules.people.persons.ensureMyPerson, {})
  await as.mutation(api.modules.people.consents.recordConsent, { purpose: "social_profile", origin: "onboarding" })
  await as.mutation(api.modules.people.profile.publishMyProfile, { handle, displayName })
  await t.run((ctx) => ctx.db.insert("identityLinks", { personId, provider: "idn", subject: `timing-idn-${personId}`, loa: 2, nationality: "GA", linkedAt: NOW }))
  await as.mutation(api.modules.diaspora.membership.joinDiasporaGa, { networkId, facet: { countryOfResidence: "FR", city: "Lyon" } })
  return { as, personId }
}

async function fixture() {
  const t = testConvex()
  const { root } = await t.mutation(internal.seeds.foundations.run, { confirmNonProduction: SEED_CONFIRMATION })
  const { network: networkId } = await t.mutation(internal.modules.diaspora.seed.run, { confirmNonProduction: SEED_CONFIRMATION })
  const manager = await member(t, networkId, "timing-equipe", "Awa OGOOUÉ")
  const alice = await member(t, networkId, "timing-alice", "Alice NDONG")
  const bob = await member(t, networkId, "timing-bob", "Jean MBA")
  const { pageId, policyId } = await t.run(async (ctx) => {
    const pageId = await ctx.db.insert("pages", { networkId, handle: "association-delais", name: "Association de recette", ownerKind: "association", trust: "community", trustRank: 0, visibility: "network", onRoot: false, status: "active", searchText: "association recette", createdAt: NOW, updatedAt: NOW })
    await ctx.db.insert("pageSignatories", { networkId, pageId, personId: manager.personId, role: "admin", acceptedAt: NOW, createdAt: NOW, updatedAt: NOW })
    const policyId = await ctx.db.insert("moderationPolicies", { networkId, surface: "event", preReview: false, maxLinks: 2, maxWrites: 100, windowMs: 60_000, updatedAt: NOW })
    return { pageId, policyId }
  })
  for (const who of [alice, bob]) {
    const membership = await who.as.mutation(A.requestAssociationMembership, { networkId, pageId })
    await manager.as.mutation(A.decideAssociationMembership, { networkId, membershipId: membership.membershipId, expectedVersion: membership.version, decision: "accept" })
  }
  return { t, root, networkId, pageId, policyId, manager, alice, bob }
}
type Fixture = Awaited<ReturnType<typeof fixture>>

function input(f: Fixture) {
  return { networkId: f.networkId, pageId: f.pageId, title: "Rencontre associative", description: "Échange entre membres.", location: "Lyon", startAt: START, endAt: START + 2 * HOUR, timeZone: "Europe/Paris", audience: "association" as const }
}
function create(f: Fixture, registrationClosesAt: number | null = null, capacity = 1) {
  return f.manager.as.mutation(E.create, { ...input(f), registrationClosesAt, capacity, idempotencyKey: "timing-event" })
}
function register(f: Fixture, eventId: Id<"events">, who = f.alice) {
  return who.as.mutation(E.register, { networkId: f.networkId, eventId })
}
function unregister(f: Fixture, eventId: Id<"events">, who = f.alice) {
  return who.as.mutation(E.unregister, { networkId: f.networkId, eventId })
}
function reminder(f: Fixture, eventId: Id<"events">, enabled: boolean, who = f.alice) {
  return who.as.mutation(R.setReminder, { networkId: f.networkId, eventId, enabled })
}
function get(f: Fixture, eventId: Id<"events">, who = f.alice) {
  return who.as.query(E.get, { networkId: f.networkId, eventId })
}
function row(f: Fixture, eventId: Id<"events">, who = f.alice) {
  return f.t.run((ctx) => participationOf(ctx, eventId, who.personId))
}
async function token(f: Fixture, eventId: Id<"events">, who = f.alice) {
  const participation = await row(f, eventId, who)
  if (!participation) throw new Error("Participation absente")
  return { networkId: f.networkId, eventId, participationId: participation._id, expectedGeneration: participation.pageReminderGeneration ?? 0, expectedStartAt: START }
}
function bell(f: Fixture, who = f.alice) {
  return f.t.run(async (ctx) => (await ctx.db.query("notifications").withIndex("by_network_recipient_createdAt", (q) => q.eq("networkId", f.networkId).eq("recipientPersonId", who.personId)).take(20)).filter((item) => item.kind === "association_event_reminder"))
}
async function refusal(promise: Promise<unknown>) {
  try { await promise } catch (error) { return engineErrorAppRule(error)?.appRule ?? engineErrorCode(error) }
  return null
}
async function moderation(f: Fixture, eventId: Id<"events">, status: "pending_review" | "removed") {
  await f.t.run(async (ctx) => {
    const state = await ctx.db.query("moderationContentStates").withIndex("by_target", (q) => q.eq("targetKind", "event").eq("targetId", eventId)).unique()
    if (!state) throw new Error("État de modération absent")
    await ctx.db.patch(state._id, { status })
  })
}
async function removeAssociationMember(f: Fixture) {
  await f.t.run(async (ctx) => {
    const membership = await ctx.db.query("associationMemberships").withIndex("by_network_and_page_and_person", (q) => q.eq("networkId", f.networkId).eq("pageId", f.pageId).eq("personId", f.alice.personId)).unique()
    if (!membership) throw new Error("Adhésion associative absente")
    await ctx.db.patch(membership._id, { status: "removed", statusChangedAt: NOW })
  })
}

describe("clôture des inscriptions de page", () => {
  it("ferme exactement à l'échéance sans créer de demande ni faire avancer un rejeu confirmé ou en file", async () => {
    const f = await fixture(), closes = NOW + HOUR
    const { eventId } = await create(f, closes)
    vi.setSystemTime(closes - 1)
    await register(f, eventId)
    await register(f, eventId, f.bob)
    const before = await row(f, eventId, f.bob)
    await f.t.run((ctx) => ctx.db.patch(eventId, { pageCapacity: 2 }))
    vi.setSystemTime(closes)
    expect(await get(f, eventId, f.bob)).toMatchObject({ registrationOpen: false, canRegister: false, registrationClosesAt: closes })
    expect(await register(f, eventId)).toBeNull()
    expect(await register(f, eventId, f.bob)).toBeNull()
    expect(await row(f, eventId, f.bob)).toMatchObject({ status: "pending", pageRegistrationSequence: before!.pageRegistrationSequence })
    expect(await refusal(register(f, eventId, f.manager))).toBe("association_event_registration_closed")
    expect(await row(f, eventId, f.manager)).toBeNull()
    await f.t.mutation(FILL, { networkId: f.networkId, eventId })
    expect((await row(f, eventId, f.bob))?.status).toBe("pending")
    vi.setSystemTime(START)
    expect(await register(f, eventId, f.bob)).toBeNull()
  })

  it("conserve la clôture omise, accepte le passé, puis reprend FIFO à la réouverture sans remodérer", async () => {
    const f = await fixture(), closes = NOW + HOUR
    const { eventId } = await create(f, closes)
    await register(f, eventId)
    await register(f, eventId, f.bob)
    vi.setSystemTime(closes)
    await unregister(f, eventId)
    expect((await row(f, eventId, f.bob))?.status).toBe("pending")
    await f.t.run((ctx) => ctx.db.patch(f.policyId, { preReview: true }))
    await f.manager.as.mutation(E.update, { ...input(f), eventId, expectedVersion: 1, capacity: 2 })
    expect(await get(f, eventId, f.bob)).toMatchObject({ registrationClosesAt: closes, registrationOpen: false, registration: "waitlisted", moderation: "published", version: 2 })
    await f.manager.as.mutation(E.update, { ...input(f), eventId, expectedVersion: 2, registrationClosesAt: NOW - 1 })
    expect((await row(f, eventId, f.bob))?.status).toBe("pending")
    await f.manager.as.mutation(E.update, { ...input(f), eventId, expectedVersion: 3, registrationClosesAt: null })
    expect(await get(f, eventId, f.bob)).toMatchObject({ registrationClosesAt: null, registrationOpen: true, registration: "confirmed", moderation: "published", version: 4 })
  })

  it("compare la clôture normalisée au rejeu et garde les échéances en UTC indépendamment du fuseau", async () => {
    const f = await fixture()
    for (const registrationClosesAt of [START + 1, NOW + 0.5]) expect(await refusal(f.manager.as.mutation(E.create, { ...input(f), registrationClosesAt, idempotencyKey: "invalid" }))).toBe("association_event_deadline_invalid")
    const { eventId } = await f.manager.as.mutation(E.create, { ...input(f), timeZone: "Pacific/Kiritimati", idempotencyKey: "utc" })
    expect(await f.manager.as.mutation(E.create, { ...input(f), timeZone: "Pacific/Kiritimati", registrationClosesAt: null, idempotencyKey: "utc" })).toEqual({ eventId, created: false })
    expect(await refusal(f.manager.as.mutation(E.create, { ...input(f), timeZone: "Pacific/Kiritimati", registrationClosesAt: START, idempotencyKey: "utc" }))).toBe("association_event_version_changed")
    await register(f, eventId)
    await reminder(f, eventId, true)
    expect(await get(f, eventId)).toMatchObject({ timeZone: "Pacific/Kiritimati", startAt: START, reminderAt: START - 24 * HOUR, reminderState: "scheduled" })
  })
})

describe("rappel personnel la veille", () => {
  it("reste off par défaut, attend la confirmation, programme à la promotion et n'enregistre qu'une cloche sans push implicite", async () => {
    const f = await fixture()
    const { eventId } = await create(f)
    await register(f, eventId)
    await register(f, eventId, f.bob)
    expect(await get(f, eventId, f.bob)).toMatchObject({ reminderEnabled: false, reminderAt: null, reminderState: "off" })
    await reminder(f, eventId, true, f.bob)
    expect(await get(f, eventId, f.bob)).toMatchObject({ reminderEnabled: true, reminderAt: DUE, reminderState: "waiting_confirmation" })
    expect((await row(f, eventId, f.bob))?.pageReminderScheduledGeneration).toBeUndefined()
    await unregister(f, eventId)
    expect(await get(f, eventId, f.bob)).toMatchObject({ reminderState: "scheduled", registration: "confirmed" })
    const job = await token(f, eventId, f.bob)
    await f.t.mutation(DELIVER, job)
    expect(await bell(f, f.bob)).toEqual([])
    vi.setSystemTime(DUE)
    await f.t.mutation(DELIVER, job)
    const notifications = await bell(f, f.bob)
    expect(notifications).toHaveLength(1)
    expect(notifications[0]).toMatchObject({ kind: "association_event_reminder", subjectEventId: eventId, recipientPersonId: f.bob.personId })
    expect(notifications[0]?.actorPersonId).toBeUndefined()
    expect(await row(f, eventId, f.bob)).toMatchObject({ pageReminderRecordedAt: DUE, pageReminderRecordedForStartAt: START, pageReminderCompletedGeneration: job.expectedGeneration })
    expect(await get(f, eventId, f.bob)).toMatchObject({ reminderState: "recorded" })
    const projected = await f.bob.as.query(B.paginateNotifications, { networkId: f.networkId, paginationOpts: { numItems: 20, cursor: null } })
    const notice = projected.page.find((item) => item.kind === "association_event_reminder")
    expect(notice).toMatchObject({ actor: null, subject: { kind: "event", id: eventId }, associationEvent: { eventId, pageHandle: "association-delais" } })
    for (const privateValue of [input(f).title, input(f).description, f.bob.personId]) expect(JSON.stringify(notice)).not.toContain(privateValue)
    const notification = notifications[0]!
    expect(await f.t.run((ctx) => notificationStillVisible(ctx, notification))).toBe(true)
    expect(await f.t.run((ctx) => pushAllowed(ctx, notification))).toBe(false)
    expect(await f.t.run((ctx) => ctx.db.query("notificationDeliveryJobs").withIndex("by_notification", (q) => q.eq("notificationId", notification._id)).take(2))).toEqual([])
  })

  it("invalide les anciens jetons et conserve le reçu après off et réinscription, sans rafraîchir une cloche rejouée", async () => {
    const f = await fixture()
    const { eventId } = await create(f)
    await register(f, eventId)
    await reminder(f, eventId, true)
    const stale = await token(f, eventId)
    await reminder(f, eventId, true)
    expect(await token(f, eventId)).toEqual(stale)
    await reminder(f, eventId, false)
    await reminder(f, eventId, true)
    const current = await token(f, eventId)
    expect(current.expectedGeneration).toBeGreaterThan(stale.expectedGeneration)
    vi.setSystemTime(DUE)
    await f.t.mutation(DELIVER, stale)
    expect(await bell(f)).toEqual([])
    expect((await row(f, eventId))?.pageReminderRecordedAt).toBeUndefined()
    await f.t.mutation(DELIVER, current)
    const notification = (await bell(f))[0]!
    await f.t.run((ctx) => ctx.db.patch(notification._id, { readAt: DUE }))
    vi.setSystemTime(DUE + 100)
    await f.t.mutation(DELIVER, current)
    expect(await bell(f)).toMatchObject([{ _id: notification._id, readAt: DUE, createdAt: DUE }])
    await reminder(f, eventId, false)
    expect(await get(f, eventId)).toMatchObject({ reminderState: "off", reminderAt: null })
    expect((await row(f, eventId))?.pageReminderRecordedForStartAt).toBe(START)
    await unregister(f, eventId)
    await register(f, eventId)
    expect(await get(f, eventId)).toMatchObject({ reminderState: "off", reminderEnabled: false })
    await reminder(f, eventId, true)
    expect(await get(f, eventId)).toMatchObject({ reminderState: "recorded", reminderAt: DUE })
    expect(await bell(f)).toHaveLength(1)
  })

  it("n'effectue aucun rattrapage pour une confirmation à J-1 et refuse une nouvelle activation à la borne", async () => {
    const f = await fixture()
    const { eventId } = await create(f)
    await register(f, eventId)
    await register(f, eventId, f.bob)
    await reminder(f, eventId, true, f.bob)
    vi.setSystemTime(DUE)
    expect(await refusal(reminder(f, eventId, true))).toBe("association_event_reminder_too_late")
    await unregister(f, eventId)
    const promoted = await row(f, eventId, f.bob)
    expect(promoted).toMatchObject({ status: "accepted", pageReminderEnabled: true, pageReminderCompletedGeneration: promoted!.pageReminderGeneration })
    expect(promoted?.pageReminderScheduledGeneration).toBeUndefined()
    expect(await get(f, eventId, f.bob)).toMatchObject({ reminderState: "expired" })
    expect(await refusal(reminder(f, eventId, true, f.bob))).toBe("association_event_reminder_too_late")
    expect(await bell(f, f.bob)).toEqual([])
  })

  it("autorise le choix en attente pour sa propre inscription et permet off après perte d'accès privé", async () => {
    const f = await fixture()
    const { eventId } = await create(f, NOW - 1)
    // Une inscription déjà confirmée n'est pas annulée par une nouvelle clôture.
    await f.t.run((ctx) => ctx.db.patch(eventId, { pageRegistrationClosesAt: undefined }))
    await register(f, eventId)
    await f.t.run(async (ctx) => {
      await ctx.db.patch(eventId, { pageRegistrationClosesAt: NOW - 1 })
      const membership = await ctx.db.query("networkMemberships").withIndex("by_network_and_person", (q) => q.eq("networkId", f.networkId).eq("personId", f.alice.personId)).unique()
      if (!membership) throw new Error("Adhésion réseau absente")
      await ctx.db.patch(membership._id, { status: "en_attente" })
    })
    await reminder(f, eventId, true)
    expect(await get(f, eventId)).toMatchObject({ registrationOpen: false, reminderState: "scheduled" })
    await removeAssociationMember(f)
    expect(await refusal(reminder(f, eventId, true))).toBe("notFound")
    await reminder(f, eventId, false)
    expect((await row(f, eventId))?.pageReminderEnabled).toBe(false)
    expect(await refusal(reminder(f, eventId, true, f.manager))).toBe("notFound")
    expect(await refusal(f.t.mutation(R.setReminder, { networkId: f.networkId, eventId, enabled: false }))).toBe("unauthenticated")
  })

  for (const lost of ["off", "withdraw", "erasure", "person_erased", "deletion_requested", "association", "root_suspended", "page", "pending", "cancelled", "started"] as const) {
    it(`revalide le job sans reçu ni cloche après ${lost}`, async () => {
      const f = await fixture()
      const { eventId } = await create(f)
      await register(f, eventId)
      await reminder(f, eventId, true)
      const job = await token(f, eventId)
      if (lost === "off") await reminder(f, eventId, false)
      else if (lost === "withdraw") await unregister(f, eventId)
      else if (lost === "erasure") await f.t.run(async (ctx) => {
        const participation = await participationOf(ctx, eventId, f.alice.personId)
        if (!participation) throw new Error("Participation absente")
        await unrecordPageEventParticipation(ctx, participation)
        await ctx.db.delete(participation._id)
      })
      else if (lost === "person_erased") await f.t.run((ctx) => ctx.db.patch(f.alice.personId, { erasedAt: NOW }))
      else if (lost === "deletion_requested") await f.t.run((ctx) => ctx.db.patch(f.alice.personId, { deletionRequestedAt: NOW }))
      else if (lost === "association") await removeAssociationMember(f)
      else if (lost === "root_suspended") await f.t.run(async (ctx) => {
        const membership = await ctx.db.query("networkMemberships").withIndex("by_network_and_person", (q) => q.eq("networkId", f.root).eq("personId", f.alice.personId)).unique()
        if (!membership) throw new Error("Adhésion racine absente")
        await ctx.db.patch(membership._id, { status: "suspendue" })
      })
      else if (lost === "page") await f.t.run((ctx) => ctx.db.patch(f.pageId, { status: "inactive" }))
      else if (lost === "pending") await moderation(f, eventId, "pending_review")
      else if (lost === "cancelled") await f.manager.as.mutation(E.cancel, { networkId: f.networkId, eventId, expectedVersion: 1 })
      vi.setSystemTime(lost === "started" ? START : DUE)
      expect(await f.t.run((ctx) => pageEventReminderVisible(ctx, f.networkId, eventId, f.alice.personId))).toBe(false)
      await f.t.mutation(DELIVER, job)
      expect(await bell(f)).toEqual([])
      expect((await row(f, eventId))?.pageReminderRecordedAt).toBeUndefined()
    })
  }

  it("marque une tentative refusée sans fabriquer un reçu quand l'écrivain ne retourne aucune notification", async () => {
    const f = await fixture()
    const { eventId } = await create(f)
    await register(f, eventId)
    await reminder(f, eventId, true)
    const job = await token(f, eventId)
    vi.spyOn(notificationsWriter, "notifyPerson").mockResolvedValue(null)
    vi.setSystemTime(DUE)
    await f.t.mutation(DELIVER, job)
    expect(await row(f, eventId)).toMatchObject({ pageReminderCompletedGeneration: job.expectedGeneration })
    expect((await row(f, eventId))?.pageReminderRecordedAt).toBeUndefined()
    expect(await get(f, eventId)).toMatchObject({ reminderState: "expired" })
    await f.t.mutation(DELIVER, job)
    expect(notificationsWriter.notifyPerson).toHaveBeenCalledTimes(1)
    expect(await bell(f)).toEqual([])
  })

  for (const lost of ["off", "withdraw", "cancelled", "private"] as const) {
    it(`filtre aussi la cloche déjà enregistrée, son compteur et la politique de transport après ${lost}`, async () => {
      const f = await fixture()
      const { eventId } = await create(f)
      await register(f, eventId)
      await reminder(f, eventId, true)
      await f.alice.as.mutation(B.markAllRead, { networkId: f.networkId })
      const job = await token(f, eventId)
      vi.setSystemTime(DUE)
      await f.t.mutation(DELIVER, job)
      const notification = (await bell(f))[0]!
      expect(await f.alice.as.query(B.unreadCount, { networkId: f.networkId })).toMatchObject({ count: 1, capped: false })
      if (lost === "off") await reminder(f, eventId, false)
      else if (lost === "withdraw") await unregister(f, eventId)
      else if (lost === "cancelled") await f.manager.as.mutation(E.cancel, { networkId: f.networkId, eventId, expectedVersion: 1 })
      else await removeAssociationMember(f)
      const projected = await f.alice.as.query(B.paginateNotifications, { networkId: f.networkId, paginationOpts: { numItems: 20, cursor: null } })
      expect(projected.page.filter((item) => item.kind === "association_event_reminder")).toEqual([])
      expect(await f.alice.as.query(B.unreadCount, { networkId: f.networkId })).toMatchObject({ count: 0, capped: false })
      expect(await f.t.run((ctx) => pushAllowed(ctx, notification))).toBe(false)
      // Le reçu stocké est une trace d'enregistrement, jamais un droit de lecture.
      expect((await row(f, eventId))?.pageReminderRecordedForStartAt).toBe(START)
    })
  }

  it("refuse l'écriture directe du nouveau genre avec acteur, sans sujet, pour un événement personnel ou une attente", async () => {
    const f = await fixture()
    const { eventId } = await create(f)
    await register(f, eventId)
    await register(f, eventId, f.bob)
    await reminder(f, eventId, true)
    await reminder(f, eventId, true, f.bob)
    const personal = await f.manager.as.mutation(api.modules.events.events.create, { networkId: f.networkId, title: "Rendez-vous personnel", startAt: START, endAt: START + HOUR, timeZone: "UTC", idempotencyKey: "timing-personal" })
    vi.setSystemTime(DUE)
    await f.t.run(async (ctx) => {
      const common = { networkId: f.networkId, recipientPersonId: f.alice.personId, kind: "association_event_reminder" as const }
      expect(await notificationsWriter.notifyPerson(ctx, { ...common, actorPersonId: f.bob.personId, subject: { event: eventId } })).toBeNull()
      expect(await notificationsWriter.notifyPerson(ctx, common)).toBeNull()
      expect(await notificationsWriter.notifyPerson(ctx, { ...common, subject: { event: personal.eventId } })).toBeNull()
      expect(await notificationsWriter.notifyPerson(ctx, { ...common, recipientPersonId: f.bob.personId, subject: { event: eventId } })).toBeNull()
    })
    expect(await bell(f)).toEqual([])
    expect(await bell(f, f.bob)).toEqual([])
    expect((await row(f, eventId))?.pageReminderRecordedAt).toBeUndefined()
  })

  it("ignore les jetons d'un autre réseau ou début et n'expose ni préférences ni identité d'autrui", async () => {
    const f = await fixture()
    const { eventId } = await create(f)
    await register(f, eventId)
    await reminder(f, eventId, true)
    const job = await token(f, eventId)
    vi.setSystemTime(DUE)
    for (const patch of [{ networkId: f.root }, { expectedStartAt: START + HOUR }, { expectedGeneration: job.expectedGeneration + 1 }]) await f.t.mutation(DELIVER, { ...job, ...patch })
    expect(await bell(f)).toEqual([])
    expect((await row(f, eventId))?.pageReminderCompletedGeneration).toBeUndefined()
    expect(await get(f, eventId, f.bob)).toMatchObject({ reminderEnabled: false, reminderState: "off", reminderAt: null })
    const view = JSON.stringify(await get(f, eventId, f.bob))
    for (const secret of [f.alice.personId, job.participationId, "pageReminderGeneration", "pageReminderRecordedAt"]) expect(view).not.toContain(secret)
  })
})
