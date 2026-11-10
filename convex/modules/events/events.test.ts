// @vitest-environment edge-runtime
// Dupliqué de socle/convex/modules/reseauPersonnel/evenements.test.ts @ ad2e7fdc2 — adaptations : personnes et réseaux (graine des fondations) ; codes et règles au lieu des libellés ; comptes publics sans objet (remplacé par l'adhésion exigée, D15) ; décomptes lus dans l'agrégat ; participants paginés hors de la fiche ; cas iCal différés avec l'export ; tests neufs : clé rejouée dans un autre réseau, évènement d'un autre réseau introuvable, relation exigée DANS le réseau, fuseau de la personne par défaut, agenda qui dit sa lacune.
import { engineErrorCode, engineErrorRule } from "@antsia/social-contracts/errors"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { api, internal } from "../../_generated/api"
import type { Id } from "../../_generated/dataModel"
import { SEED_CONFIRMATION } from "../../seeds/foundations"
import { testConvex } from "../../test.setup"
import { notifyPerson } from "../notifications/notify"

type T = ReturnType<typeof testConvex>
type Person = { as: ReturnType<T["withIdentity"]>; personId: Id<"persons">; handle: string }

const E = api.modules.events.events
const T0 = Date.UTC(2026, 9, 15, 10, 0, 0)
const HOUR = 3_600_000
const DAY = 24 * HOUR
const PAGE = { numItems: 100, cursor: null }

beforeEach(() => {
  vi.stubEnv("CONVEX_CLOUD_URL", "http://127.0.0.1:3210")
  vi.useFakeTimers()
  vi.setSystemTime(T0)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

async function seed(t: T) {
  return await t.mutation(internal.seeds.foundations.run, { confirmNonProduction: SEED_CONFIRMATION })
}

async function enter(t: T, rootId: Id<"networks">, handle: string): Promise<Person> {
  const as = t.withIdentity({ subject: `auth-${handle}` })
  const personId = await as.mutation(api.modules.people.persons.ensureMyPerson, {})
  await as.mutation(api.modules.people.consents.recordConsent, { purpose: "social_profile", origin: "onboarding" })
  await as.mutation(api.modules.people.profile.publishMyProfile, { handle, displayName: handle })
  await as.mutation(api.modules.people.memberships.joinNetwork, { networkId: rootId })
  return { as, personId, handle }
}

async function connect(t: T, networkId: Id<"networks">, a: Person, b: Person): Promise<void> {
  await t.run(async (ctx) => {
    const [low, high] = a.personId < b.personId ? [a.personId, b.personId] : [b.personId, a.personId]
    await ctx.db.insert("connections", { networkId, personIdLow: low, personIdHigh: high, requestedByPersonId: a.personId, recipientPersonId: b.personId, status: "accepted", requestedAt: 1, respondedAt: 1, updatedAt: 1 })
  })
}

async function caught(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise
  } catch (error) {
    return error
  }
  return null
}

const codeOf = async (promise: Promise<unknown>) => engineErrorCode(await caught(promise))
const ruleOf = async (promise: Promise<unknown>) => engineErrorRule(await caught(promise))?.rule ?? null

/** Organisatrice et deux invités connectés. */
async function cast(t: T, root: Id<"networks">) {
  const alice = await enter(t, root, "alice")
  const bob = await enter(t, root, "bob")
  const carla = await enter(t, root, "carla")
  await connect(t, root, alice, bob)
  await connect(t, root, alice, carla)
  return { alice, bob, carla }
}

async function createEvent(owner: Person, networkId: Id<"networks">, options: { title?: string; startAt?: number; key?: string } = {}) {
  const startAt = options.startAt ?? T0 + DAY
  return (await owner.as.mutation(E.create, { networkId, title: options.title ?? "Pique-nique", startAt, endAt: startAt + 2 * HOUR, timeZone: "Africa/Libreville", idempotencyKey: options.key ?? "cle-1" })).eventId
}

async function participationOf(t: T, eventId: Id<"events">, person: Person) {
  return await t.run(async (ctx) => ctx.db.query("eventParticipants").withIndex("by_event_person", (q) => q.eq("eventId", eventId).eq("personId", person.personId)).unique())
}

async function bell(networkId: Id<"networks">, person: Person) {
  return (await person.as.query(api.modules.notifications.bell.paginateNotifications, { networkId, paginationOpts: { numItems: 20, cursor: null } })).page.filter((row) => row.kind === "event_invite")
}

// ═══════════════════════════════════════════════════════════════

describe("création d'un évènement", () => {
  it("est idempotente par (organisateur, clé) et fixe le fuseau ; rejouée dans un autre réseau, la clé est refusée", async () => {
    const t = testConvex()
    const { root, testClosed } = await seed(t)
    const { alice } = await cast(t, root)
    await t.run(async (ctx) => ctx.db.insert("networkMemberships", { networkId: testClosed, personId: alice.personId, status: "declaree", role: "member", joinedAt: 1, statusChangedAt: 1 }))
    const args = { networkId: root, title: "  Pique-nique  ", startAt: T0 + DAY, endAt: T0 + DAY + HOUR, timeZone: "Europe/Paris", idempotencyKey: "k" }
    const first = await alice.as.mutation(E.create, args)
    expect(first.created).toBe(true)
    expect(await alice.as.mutation(E.create, { ...args, title: "Autre chose" })).toEqual({ eventId: first.eventId, created: false })
    expect(await alice.as.query(E.getEvent, { networkId: root, eventId: first.eventId })).toMatchObject({ title: "Pique-nique", timeZone: "Europe/Paris", status: "scheduled", isOrganizer: true, participantCount: 0, acceptedCount: 0 })
    expect(await codeOf(alice.as.mutation(E.create, { ...args, networkId: testClosed }))).toBe("conflict")
  })

  it("refuse le fuseau inconnu, la fenêtre absurde, la durée démesurée et le titre trop court ; prend le fuseau de la personne à défaut", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const { alice } = await cast(t, root)
    const make = (overrides: Record<string, unknown>, key: string) =>
      alice.as.mutation(E.create, { networkId: root, title: "Réunion", startAt: T0 + DAY, endAt: T0 + DAY + HOUR, timeZone: "Africa/Libreville", idempotencyKey: key, ...overrides })
    expect(await ruleOf(make({ timeZone: "Mars/Olympus" }, "k1"))).toBe("EVENT_TIMEZONE_INVALID")
    expect(await ruleOf(make({ endAt: T0 + DAY }, "k2"))).toBe("EVENT_WINDOW_INVALID")
    expect(await ruleOf(make({ endAt: T0 + 20 * DAY }, "k3"))).toBe("EVENT_TOO_LONG")
    expect(await ruleOf(make({ title: "Ok" }, "k4"))).toBe("EVENT_TITLE_LENGTH")
    // Sans fuseau, ni pour l'évènement ni pour la personne : refusé, jamais un fuseau imposé.
    expect(await ruleOf(alice.as.mutation(E.create, { networkId: root, title: "Réunion", startAt: T0 + DAY, endAt: T0 + DAY + HOUR, idempotencyKey: "k5" }))).toBe("EVENT_TIMEZONE_INVALID")
    await t.run(async (ctx) => ctx.db.patch(alice.personId, { timeZone: "Europe/Madrid" }))
    const { eventId } = await alice.as.mutation(E.create, { networkId: root, title: "Réunion", startAt: T0 + DAY, endAt: T0 + DAY + HOUR, idempotencyKey: "k6" })
    expect((await alice.as.query(E.getEvent, { networkId: root, eventId })).timeZone).toBe("Europe/Madrid")
  })

  it("exige une adhésion déclarée : un membre en attente ne crée pas (D15)", async () => {
    const t = testConvex()
    const { root, testClosed } = await seed(t)
    const { alice } = await cast(t, root)
    await t.run(async (ctx) => ctx.db.insert("networkMemberships", { networkId: testClosed, personId: alice.personId, status: "en_attente", role: "member", joinedAt: 1, statusChangedAt: 1 }))
    expect(await codeOf(alice.as.mutation(E.create, { networkId: testClosed, title: "Réunion", startAt: T0 + DAY, endAt: T0 + DAY + HOUR, timeZone: "UTC", idempotencyKey: "k" }))).toBe("statusInsufficient")
  })
})

describe("invitation et réponse — une seule ligne", () => {
  it("inviter crée UNE ligne pending ; réinviter rafraîchit sans empiler", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const { alice, bob } = await cast(t, root)
    const eventId = await createEvent(alice, root)
    expect(await alice.as.mutation(E.invite, { networkId: root, eventId, handle: "bob" })).toEqual({ invited: true })
    const first = await participationOf(t, eventId, bob)
    vi.setSystemTime(T0 + 60_000)
    expect(await alice.as.mutation(E.invite, { networkId: root, eventId, handle: "bob" })).toEqual({ invited: true })
    const second = await participationOf(t, eventId, bob)
    expect(second).toMatchObject({ _id: first!._id, status: "pending", createdAt: T0 + 60_000 })
    expect(await alice.as.query(E.getEvent, { networkId: root, eventId })).toMatchObject({ participantCount: 1 })
  })

  it("pagine exhaustivement les participants sans troncature ni doublon", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const { alice } = await cast(t, root)
    const eventId = await createEvent(alice, root)
    await t.run(async (ctx) => {
      for (let index = 0; index < 130; index += 1) {
        const personId = await ctx.db.insert("persons", { authUserId: `bulk-${index}`, handle: `bulk${index}`, displayName: `bulk${index}`, publishedAt: 1, createdAt: 1, updatedAt: 1 })
        await ctx.db.insert("eventParticipants", { networkId: root, eventId, personId, invitedByPersonId: alice.personId, status: "pending", eventStartAt: T0 + DAY, createdAt: index })
      }
    })
    const seen = new Set<string>()
    let cursor: string | null = null
    for (let pages = 0; pages < 10; pages += 1) {
      const page: { page: { participationId: string }[]; continueCursor: string; isDone: boolean } = await alice.as.query(E.paginateEventParticipants, { networkId: root, eventId, paginationOpts: { numItems: 40, cursor } })
      for (const row of page.page) seen.add(row.participationId)
      if (page.isDone) break
      cursor = page.continueCursor
    }
    expect(seen.size).toBe(130)
  })

  it("répondre ÉCRIT la ligne d'invitation — même identifiant, décomptes à jour, avis changeable", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const { alice, bob, carla } = await cast(t, root)
    const eventId = await createEvent(alice, root)
    await alice.as.mutation(E.invite, { networkId: root, eventId, handle: "bob" })
    await alice.as.mutation(E.invite, { networkId: root, eventId, handle: "carla" })
    const row = await participationOf(t, eventId, bob)
    expect(await bob.as.mutation(E.respond, { networkId: root, participationId: row!._id, response: "accepted" })).toEqual({ status: "accepted" })
    expect(await participationOf(t, eventId, bob)).toMatchObject({ _id: row!._id, status: "accepted" })
    expect(await alice.as.query(E.getEvent, { networkId: root, eventId })).toMatchObject({ participantCount: 2, acceptedCount: 1 })
    await bob.as.mutation(E.respond, { networkId: root, participationId: row!._id, response: "maybe" })
    expect(await bob.as.query(E.getEvent, { networkId: root, eventId })).toMatchObject({ acceptedCount: 0, myParticipation: { participationId: row!._id, status: "maybe" } })
    expect(carla.personId).toBeDefined()
  })

  it("réinviter une ligne DÉCLINÉE la rouvre ; une ligne acceptée ne se réinvite pas", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const { alice, bob, carla } = await cast(t, root)
    const eventId = await createEvent(alice, root)
    await alice.as.mutation(E.invite, { networkId: root, eventId, handle: "bob" })
    await alice.as.mutation(E.invite, { networkId: root, eventId, handle: "carla" })
    await bob.as.mutation(E.respond, { networkId: root, participationId: (await participationOf(t, eventId, bob))!._id, response: "declined" })
    await carla.as.mutation(E.respond, { networkId: root, participationId: (await participationOf(t, eventId, carla))!._id, response: "accepted" })
    expect(await alice.as.mutation(E.invite, { networkId: root, eventId, handle: "bob" })).toEqual({ invited: true })
    expect(await participationOf(t, eventId, bob)).toMatchObject({ status: "pending" })
    expect(await alice.as.mutation(E.invite, { networkId: root, eventId, handle: "carla" })).toEqual({ invited: false })
    expect(await participationOf(t, eventId, carla)).toMatchObject({ status: "accepted" })
  })

  it("la réponse appartient au seul invité — refus indistinct pour autrui", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const { alice, bob, carla } = await cast(t, root)
    const eventId = await createEvent(alice, root)
    await alice.as.mutation(E.invite, { networkId: root, eventId, handle: "bob" })
    const row = await participationOf(t, eventId, bob)
    expect(await codeOf(carla.as.mutation(E.respond, { networkId: root, participationId: row!._id, response: "accepted" }))).toBe("notFound")
    expect(await codeOf(alice.as.mutation(E.respond, { networkId: root, participationId: row!._id, response: "accepted" }))).toBe("notFound")
  })
})

describe("anti-oracle et autorité", () => {
  it("identifiant inconnu, soi-même, non connecté, bloqué, relation d'un AUTRE réseau : le même refus", async () => {
    const t = testConvex()
    const { root, testClosed } = await seed(t)
    const { alice, bob } = await cast(t, root)
    const dora = await enter(t, root, "dora")
    const eric = await enter(t, root, "eric")
    await connect(t, root, alice, eric)
    await alice.as.mutation(api.modules.graph.connections.blockPerson, { networkId: root, targetPersonId: eric.personId })
    await connect(t, testClosed, alice, dora)
    const eventId = await createEvent(alice, root)
    for (const handle of ["inconnu", "alice", "dora", "eric"]) {
      expect(await codeOf(alice.as.mutation(E.invite, { networkId: root, eventId, handle }))).toBe("notFound")
    }
    expect(bob.personId).toBeDefined()
  })

  it("seul l'organisateur invite, annule et annonce ; un tiers ne sait même pas que l'évènement existe", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const { alice, bob, carla } = await cast(t, root)
    const dora = await enter(t, root, "dora")
    const eventId = await createEvent(alice, root)
    await alice.as.mutation(E.invite, { networkId: root, eventId, handle: "bob" })
    expect(await codeOf(bob.as.mutation(E.invite, { networkId: root, eventId, handle: "carla" }))).toBe("eventOrganizerRequired")
    expect(await codeOf(bob.as.mutation(E.cancel, { networkId: root, eventId }))).toBe("eventOrganizerRequired")
    expect(await codeOf(bob.as.mutation(E.announce, { networkId: root, eventId, audience: "public" }))).toBe("eventOrganizerRequired")
    expect(await codeOf(dora.as.mutation(E.cancel, { networkId: root, eventId }))).toBe("notFound")
    expect(carla.personId).toBeDefined()
  })
})

describe("visibilité", () => {
  it("un tiers, ou un autre réseau, obtient le refus INDISTINCT partout", async () => {
    const t = testConvex()
    const { root, testClosed } = await seed(t)
    const { alice, bob } = await cast(t, root)
    const dora = await enter(t, root, "dora")
    await t.run(async (ctx) => ctx.db.insert("networkMemberships", { networkId: testClosed, personId: bob.personId, status: "declaree", role: "member", joinedAt: 1, statusChangedAt: 1 }))
    const eventId = await createEvent(alice, root)
    await alice.as.mutation(E.invite, { networkId: root, eventId, handle: "bob" })
    expect(await codeOf(dora.as.query(E.getEvent, { networkId: root, eventId }))).toBe("notFound")
    expect(await codeOf(dora.as.query(E.paginateEventParticipants, { networkId: root, eventId, paginationOpts: PAGE }))).toBe("notFound")
    expect(await codeOf(bob.as.query(E.getEvent, { networkId: testClosed, eventId }))).toBe("notFound")
    const row = await participationOf(t, eventId, bob)
    expect(await codeOf(bob.as.mutation(E.respond, { networkId: testClosed, participationId: row!._id, response: "accepted" }))).toBe("notFound")
  })

  it("un évènement ANNULÉ reste visible de ses participants — décliné compris ; il n'invite ni ne se répond plus", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const { alice, bob, carla } = await cast(t, root)
    const eventId = await createEvent(alice, root)
    await alice.as.mutation(E.invite, { networkId: root, eventId, handle: "bob" })
    await alice.as.mutation(E.invite, { networkId: root, eventId, handle: "carla" })
    const bobRow = await participationOf(t, eventId, bob)
    await bob.as.mutation(E.respond, { networkId: root, participationId: bobRow!._id, response: "declined" })
    await alice.as.mutation(E.cancel, { networkId: root, eventId })
    await alice.as.mutation(E.cancel, { networkId: root, eventId })
    for (const person of [bob, carla]) expect(await person.as.query(E.getEvent, { networkId: root, eventId })).toMatchObject({ status: "cancelled", cancelledAt: T0 })
    expect(await ruleOf(alice.as.mutation(E.invite, { networkId: root, eventId, handle: "bob" }))).toBe("EVENT_CANCELLED")
    expect(await ruleOf(bob.as.mutation(E.respond, { networkId: root, participationId: bobRow!._id, response: "accepted" }))).toBe("EVENT_CANCELLED")
  })

  it("l'agenda respecte la fenêtre sur le début, réunit organisés et invitations, et ordonne", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const { alice, bob } = await cast(t, root)
    const early = await createEvent(alice, root, { title: "Matin", startAt: T0 + DAY, key: "k1" })
    const late = await createEvent(alice, root, { title: "Semaine prochaine", startAt: T0 + 8 * DAY, key: "k2" })
    const theirs = await createEvent(bob, root, { title: "Chez Bob", startAt: T0 + 2 * DAY, key: "k3" })
    await bob.as.mutation(E.invite, { networkId: root, eventId: theirs, handle: "alice" })
    const all = await alice.as.query(E.myAgenda, { networkId: root, now: T0 })
    expect(all.items.map((item) => item.eventId)).toEqual([early, theirs, late])
    expect(all.truncated).toBe(false)
    const window = await alice.as.query(E.myAgenda, { networkId: root, now: T0, from: T0 + DAY + HOUR, to: T0 + 3 * DAY })
    expect(window.items.map((item) => ({ id: item.eventId, organizer: item.isOrganizer }))).toEqual([{ id: theirs, organizer: false }])
  })

  it("une invitation FUTURE reste visible derrière plus de 200 participations anciennes, et l'agenda dit sa lacune", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const { alice, bob } = await cast(t, root)
    await t.run(async (ctx) => {
      for (let index = 0; index < 210; index += 1) {
        const startAt = T0 - (index + 1) * DAY
        const eventId = await ctx.db.insert("events", { networkId: root, organizerPersonId: alice.personId, title: `Ancien ${index}`, startAt, endAt: startAt + HOUR, timeZone: "UTC", status: "scheduled", idempotencyKey: `old-${index}`, createdAt: 1, updatedAt: 1 })
        await ctx.db.insert("eventParticipants", { networkId: root, eventId, personId: bob.personId, invitedByPersonId: alice.personId, status: "accepted", eventStartAt: startAt, createdAt: 1 })
      }
    })
    const future = await createEvent(alice, root, { title: "Demain", key: "k-futur" })
    await alice.as.mutation(E.invite, { networkId: root, eventId: future, handle: "bob" })
    const agenda = await bob.as.query(E.myAgenda, { networkId: root, now: T0 })
    expect(agenda.items.map((item) => item.eventId)).toContain(future)
    expect(agenda.items.length).toBe(200)
    expect(agenda.truncated).toBe(true)
  })
})

describe("notifications et cloche résolue", () => {
  it("l'invitation sonne chez l'invité, dédupliquée, l'évènement pour sujet ; décliner n'émet rien", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const { alice, bob } = await cast(t, root)
    const eventId = await createEvent(alice, root)
    await alice.as.mutation(E.invite, { networkId: root, eventId, handle: "bob" })
    await alice.as.mutation(E.invite, { networkId: root, eventId, handle: "bob" })
    expect(await bell(root, bob)).toMatchObject([{ kind: "event_invite", subject: { kind: "event", id: eventId }, resolution: null }])
    await bob.as.mutation(E.respond, { networkId: root, participationId: (await participationOf(t, eventId, bob))!._id, response: "declined" })
    expect((await alice.as.query(api.modules.notifications.bell.paginateNotifications, { networkId: root, paginationOpts: PAGE })).page).toEqual([])
  })

  it("répondre résout avec la réponse — la dernière fait foi ; redire la même ferme une ligne restée ouverte", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const { alice, bob } = await cast(t, root)
    const eventId = await createEvent(alice, root)
    await alice.as.mutation(E.invite, { networkId: root, eventId, handle: "bob" })
    const participationId = (await participationOf(t, eventId, bob))!._id
    await bob.as.mutation(E.respond, { networkId: root, participationId, response: "maybe" })
    expect((await bell(root, bob))[0]).toMatchObject({ resolution: { kind: "maybe" } })
    await bob.as.mutation(E.respond, { networkId: root, participationId, response: "accepted" })
    expect((await bell(root, bob))[0]).toMatchObject({ resolution: { kind: "accepted" } })
    // Une ligne rouverte (réinvitation) puis la même réponse redite : la cloche se referme.
    await t.run(async (ctx) => {
      const row = (await ctx.db.query("notifications").withIndex("by_network_recipient_createdAt", (q) => q.eq("networkId", root).eq("recipientPersonId", bob.personId)).first())!
      await ctx.db.patch(row._id, { resolution: undefined, resolvedAt: undefined })
    })
    await bob.as.mutation(E.respond, { networkId: root, participationId, response: "accepted" })
    expect((await bell(root, bob))[0]).toMatchObject({ resolution: { kind: "accepted" } })
  })

  it("annuler résout `cancelled` les invitations SANS réponse, par lots au-delà de cent, sans toucher aux réponses ; rejoué, rien ne change", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const { alice, bob } = await cast(t, root)
    const eventId = await createEvent(alice, root)
    await alice.as.mutation(E.invite, { networkId: root, eventId, handle: "bob" })
    await bob.as.mutation(E.respond, { networkId: root, participationId: (await participationOf(t, eventId, bob))!._id, response: "accepted" })
    const bulk = await t.run(async (ctx) => {
      const ids: Id<"persons">[] = []
      for (let index = 0; index < 105; index += 1) {
        const personId = await ctx.db.insert("persons", { authUserId: `bulk-${index}`, handle: `bulk${index}`, displayName: `bulk${index}`, publishedAt: 1, createdAt: 1, updatedAt: 1 })
        await ctx.db.insert("networkMemberships", { networkId: root, personId, status: "declaree", role: "member", joinedAt: 1, statusChangedAt: 1 })
        await ctx.db.insert("eventParticipants", { networkId: root, eventId, personId, invitedByPersonId: alice.personId, status: "pending", eventStartAt: T0 + DAY, createdAt: 1 })
        await notifyPerson(ctx, { networkId: root, recipientPersonId: personId, actorPersonId: alice.personId, kind: "event_invite", subject: { event: eventId } })
        ids.push(personId)
      }
      return ids
    })
    await alice.as.mutation(E.cancel, { networkId: root, eventId })
    await t.finishAllScheduledFunctions(vi.runAllTimers)
    const states = await t.run(async (ctx) => {
      const resolutions = new Set<string>()
      for (const personId of bulk) {
        const row = await ctx.db.query("notifications").withIndex("by_network_recipient_createdAt", (q) => q.eq("networkId", root).eq("recipientPersonId", personId)).first()
        resolutions.add(`${row?.resolution}`)
      }
      return [...resolutions]
    })
    expect(states).toEqual(["cancelled"])
    expect((await bell(root, bob))[0]).toMatchObject({ resolution: { kind: "accepted" } })
    expect(await t.mutation(internal.modules.events.events.resolveInvitationsOnCancel, { eventId, cursor: null })).toEqual({ resolved: 0, done: false })
  })

  it("le job est sans effet sur un évènement qui n'est pas annulé", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const { alice, bob } = await cast(t, root)
    const eventId = await createEvent(alice, root)
    await alice.as.mutation(E.invite, { networkId: root, eventId, handle: "bob" })
    expect(await t.mutation(internal.modules.events.events.resolveInvitationsOnCancel, { eventId, cursor: null })).toEqual({ resolved: 0, done: true })
    expect((await bell(root, bob))[0]).toMatchObject({ resolution: null })
  })
})

describe("annoncer un évènement dans le fil", () => {
  it("l'organisateur annonce une fois : la publication porte la carte, relue — réponse du lecteur, puis annulation", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const { alice, bob, carla } = await cast(t, root)
    const eventId = await createEvent(alice, root, { title: "Pique-nique au bord de mer" })
    await alice.as.mutation(E.invite, { networkId: root, eventId, handle: "bob" })
    const first = await alice.as.mutation(E.announce, { networkId: root, eventId, audience: "public" })
    expect(first.created).toBe(true)
    expect(await alice.as.mutation(E.announce, { networkId: root, eventId, audience: "public", body: "Encore" })).toEqual({ postId: first.postId, created: false })
    const card = async (reader: Person) => (await reader.as.query(api.modules.posts.posts.getPost, { networkId: root, postId: first.postId })).event
    expect(await card(alice)).toMatchObject({ eventId, title: "Pique-nique au bord de mer", status: "scheduled", myParticipation: null, myParticipationId: null })
    // ADR-0028 : l'invité reçoit l'identifiant de SA ligne, celui que `respond` attend.
    const bobCard = await card(bob)
    expect(bobCard).toMatchObject({ myParticipation: "pending", myParticipationId: (await participationOf(t, eventId, bob))!._id })
    await bob.as.mutation(E.respond, { networkId: root, participationId: bobCard!.myParticipationId!, response: "accepted" })
    expect(await card(bob)).toMatchObject({ myParticipation: "accepted" })
    expect(await card(carla)).toMatchObject({ myParticipation: null, myParticipationId: null })
    expect((await alice.as.query(api.modules.posts.posts.getPost, { networkId: root, postId: first.postId })).body).toBe("Pique-nique au bord de mer")
    await alice.as.mutation(E.cancel, { networkId: root, eventId })
    expect(await card(carla)).toMatchObject({ status: "cancelled" })
    expect(await ruleOf(alice.as.mutation(E.announce, { networkId: root, eventId, audience: "public" }))).toBe("EVENT_CANCELLED")
  })

  it("un évènement annulé ne s'annonce pas ; une annonce sans corps prend le titre", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const { alice } = await cast(t, root)
    const cancelled = await createEvent(alice, root, { key: "k1" })
    await alice.as.mutation(E.cancel, { networkId: root, eventId: cancelled })
    expect(await ruleOf(alice.as.mutation(E.announce, { networkId: root, eventId: cancelled, audience: "public" }))).toBe("EVENT_CANCELLED")
    const other = await createEvent(alice, root, { title: "Atelier couture", key: "k2" })
    const { postId } = await alice.as.mutation(E.announce, { networkId: root, eventId: other, audience: "connections", body: "  " })
    expect(await t.run(async (ctx) => (await ctx.db.get(postId))?.body)).toBe("Atelier couture")
  })
})
