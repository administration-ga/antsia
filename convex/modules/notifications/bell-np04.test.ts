// @vitest-environment edge-runtime
/**
 * NP-04 (issue antsia#149, demande de DIASPORALE) — la cloche complète.
 *
 *  · `paginateNotifications({ unreadOnly: true })` ne sert que les non-lues, par l'index des
 *    non-lues : le filtre a lieu dans la base, page après page, et non sur ce que l'écran a déjà
 *    chargé ; sans l'argument, rien ne change.
 *  · L'invitation à un groupe thématique (`thematic_group_invite`) porte une destination TYPÉE,
 *    la fiche du groupe, relue par la garde même de la fiche (`getGroup`) : dans la cloche comme à
 *    l'ouverture d'un avis poussé ; `null` dès que la fiche ne se sert plus au destinataire.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { api, internal } from "../../_generated/api"
import type { Id } from "../../_generated/dataModel"
import type { MutationCtx } from "../../_generated/server"
import { SEED_CONFIRMATION } from "../../seeds/foundations"
import { createTestSession, testConvex } from "../../test.setup"
import { notifyPerson } from "./notify"

const doubles = vi.hoisted(() => ({ push: vi.fn(), receipt: vi.fn() }))
vi.mock("./transports", () => ({ deliverPush: doubles.push, readExpoReceipt: doubles.receipt }))

type T = ReturnType<typeof testConvex>
type Person = { as: ReturnType<T["withIdentity"]>; personId: Id<"persons">; handle: string }
const NOW = Date.UTC(2026, 10, 11, 9)
const APPLICATIONS = JSON.stringify([{ applicationId: "antsia_ga", networkSlug: "antsia", origin: "https://antsia.example.test", entryPath: "/fil" }])
const BELL = api.modules.notifications.bell
const GROUPS = api.modules.thematicGroups.thematicGroups

beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(NOW)
  vi.stubEnv("CONVEX_CLOUD_URL", "http://127.0.0.1:3210")
  vi.stubEnv("NOTIFICATION_APPLICATIONS_JSON", APPLICATIONS)
  doubles.push.mockReset().mockResolvedValue({ status: "sent" })
  doubles.receipt.mockReset().mockResolvedValue({ status: "sent" })
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs() })

async function seed(t: T) { return await t.mutation(internal.seeds.foundations.run, { confirmNonProduction: SEED_CONFIRMATION }) }

/** Une personne avec une VRAIE session, membre déclarée du réseau, profil publié. */
async function member(t: T, networkId: Id<"networks">, handle: string): Promise<Person> {
  const sessionId = await createTestSession(t, `np04-${handle}`)
  const as = t.withIdentity({ subject: `np04-${handle}`, sessionId })
  const personId = await as.mutation(api.modules.people.persons.ensureMyPerson, {})
  await t.run(async (ctx) => await ctx.db.insert("networkMemberships", { networkId, personId, status: "declaree", role: "member", joinedAt: NOW, statusChangedAt: NOW }))
  await as.mutation(api.modules.people.consents.recordConsent, { purpose: "social_profile", origin: "onboarding" })
  await as.mutation(api.modules.people.profile.publishMyProfile, { handle, displayName: handle })
  return { as, personId, handle }
}

async function connect(t: T, networkId: Id<"networks">, a: Person, b: Person): Promise<void> {
  await t.run(async (ctx) => {
    const [low, high] = a.personId < b.personId ? [a.personId, b.personId] : [b.personId, a.personId]
    await ctx.db.insert("connections", { networkId, personIdLow: low, personIdHigh: high, requestedByPersonId: a.personId, recipientPersonId: b.personId, status: "accepted", requestedAt: 1, respondedAt: 1, updatedAt: 1 })
  })
}

const page = (numItems: number, cursor: string | null = null) => ({ numItems, cursor })

describe("NP-04 — le filtre « non lues » servi par le moteur", () => {
  it("ne sert que les non-lues, du plus récent au plus ancien, page après page ; sans l'argument, tout", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const reader = await member(t, root, "lectrice")
    const actors: Person[] = []
    for (const handle of ["awa", "binta", "chantal", "dora", "eli"]) actors.push(await member(t, root, handle))
    for (const actor of actors) {
      await t.run(async (ctx) => await notifyPerson(ctx as unknown as MutationCtx, { networkId: root, recipientPersonId: reader.personId, actorPersonId: actor.personId, kind: "new_follower" }))
      vi.setSystemTime(Date.now() + 1_000)
    }
    const all = (await reader.as.query(BELL.paginateNotifications, { networkId: root, paginationOpts: page(10) })).page
    expect(all.map((row) => row.actor?.handle)).toEqual(["eli", "dora", "chantal", "binta", "awa"])
    // Deux lues : « dora » et « binta ».
    for (const row of all.filter((item) => item.actor?.handle === "dora" || item.actor?.handle === "binta")) {
      await reader.as.mutation(BELL.markRead, { networkId: root, notificationId: row.notificationId })
    }

    // Le filtre a lieu dans la base : une page de deux, puis la suite au curseur, sans aucune lue.
    const first = await reader.as.query(BELL.paginateNotifications, { networkId: root, paginationOpts: page(2), unreadOnly: true })
    expect(first.page.map((row) => [row.actor?.handle, row.readAt])).toEqual([["eli", null], ["chantal", null]])
    expect(first.isDone).toBe(false)
    const rest = await reader.as.query(BELL.paginateNotifications, { networkId: root, paginationOpts: page(2, first.continueCursor), unreadOnly: true })
    expect(rest.page.map((row) => row.actor?.handle)).toEqual(["awa"])
    expect(rest.isDone).toBe(true)

    // Sans l'argument (ou à `false`), la cloche est inchangée : lues comprises.
    expect((await reader.as.query(BELL.paginateNotifications, { networkId: root, paginationOpts: page(10) })).page).toHaveLength(5)
    expect((await reader.as.query(BELL.paginateNotifications, { networkId: root, paginationOpts: page(10), unreadOnly: false })).page).toHaveLength(5)

    // Tout marquer lu vide le filtre.
    await reader.as.mutation(BELL.markAllRead, { networkId: root })
    expect((await reader.as.query(BELL.paginateNotifications, { networkId: root, paginationOpts: page(10), unreadOnly: true })).page).toEqual([])
  })

  it("le filtre ne lit que SES avis : ceux d'autrui et d'un autre réseau restent hors de la page", async () => {
    const t = testConvex()
    const { root, testClosed } = await seed(t)
    const reader = await member(t, root, "lectrice")
    const other = await member(t, root, "voisine")
    const actor = await member(t, root, "awa")
    await t.run(async (ctx) => await ctx.db.insert("networkMemberships", { networkId: testClosed, personId: reader.personId, status: "declaree", role: "member", joinedAt: NOW, statusChangedAt: NOW }))
    await t.run(async (ctx) => {
      const db = ctx as unknown as MutationCtx
      await notifyPerson(db, { networkId: root, recipientPersonId: other.personId, actorPersonId: actor.personId, kind: "new_follower" })
      await notifyPerson(db, { networkId: root, recipientPersonId: reader.personId, actorPersonId: actor.personId, kind: "new_follower" })
    })
    expect((await reader.as.query(BELL.paginateNotifications, { networkId: root, paginationOpts: page(10), unreadOnly: true })).page.map((row) => row.actor?.handle)).toEqual(["awa"])
    expect((await reader.as.query(BELL.paginateNotifications, { networkId: testClosed, paginationOpts: page(10), unreadOnly: true })).page).toEqual([])
  })
})

describe("NP-04 — la destination d'une invitation à un groupe", () => {
  /** Alice invite Carla, reliée, dans son groupe ; Carla accepte les notifications sur un appareil. */
  async function invited() {
    const t = testConvex()
    const { root } = await seed(t)
    const alice = await member(t, root, "alice")
    const carla = await member(t, root, "carla")
    await connect(t, root, alice, carla)
    await carla.as.mutation(api.modules.people.consents.recordConsent, { networkId: root, purpose: "notifications", origin: "settings" })
    await carla.as.mutation(api.modules.notifications.pushSubscriptions.subscribe, { networkId: root, applicationId: "antsia_ga", deviceId: "device_np04", credential: { provider: "expo", token: "ExpoPushToken[token_np04]" } })
    const { groupId } = await alice.as.mutation(GROUPS.create, { networkId: root, name: "Cuisine du pays", idempotencyKey: "np04-groupe" })
    await alice.as.mutation(GROUPS.invite, { networkId: root, groupId, handle: "carla" })
    const jobs = await t.run(async (ctx) => await ctx.db.query("notificationDeliveryJobs").take(10))
    expect(jobs).toHaveLength(1)
    return { t, root, alice, carla, groupId, reference: jobs[0]!._id }
  }

  const inviteRow = async (person: Person, networkId: Id<"networks">) => {
    const rows = (await person.as.query(BELL.paginateNotifications, { networkId, paginationOpts: page(10) })).page
    return rows.find((row) => row.kind === "thematic_group_invite")
  }

  it("la cloche et l'avis poussé mènent à la fiche du groupe, celle que `getGroup` sert à l'invitée", async () => {
    const { root, carla, groupId, reference } = await invited()
    expect(await inviteRow(carla, root)).toMatchObject({ subject: { kind: "thematicGroup", id: groupId }, target: { kind: "thematicGroup", groupId } })
    expect(await carla.as.query(api.modules.notifications.open.resolveOpenTarget, { networkId: root, reference })).toEqual({
      channel: "notification", kind: "thematic_group_invite", subject: { kind: "thematicGroup", id: groupId }, actorHandle: "alice", target: { kind: "thematicGroup", groupId },
    })
    expect(await carla.as.query(GROUPS.getGroup, { networkId: root, groupId })).toMatchObject({ groupId, invited: true })
  })

  it("relue à chaque lecture : signalée par l'invitée, la fiche ne se sert plus — ni lien dans la cloche, ni à l'ouverture", async () => {
    const { root, carla, groupId, reference } = await invited()
    await carla.as.mutation(api.modules.moderation.cases.report, { networkId: root, target: { kind: "thematicGroup", id: groupId }, reason: "other" })
    await expect(carla.as.query(GROUPS.getGroup, { networkId: root, groupId })).rejects.toBeTruthy()
    // L'avis reste (rien n'est réécrit), sans destination.
    expect(await inviteRow(carla, root)).toMatchObject({ subject: { kind: "thematicGroup", id: groupId }, target: null })
    expect(await carla.as.query(api.modules.notifications.open.resolveOpenTarget, { networkId: root, reference })).toMatchObject({ channel: "notification", kind: "thematic_group_invite", target: null })
  })

  it("un groupe en cours de suppression n'est plus une destination", async () => {
    const { t, root, carla, groupId } = await invited()
    await t.run(async (ctx) => await ctx.db.patch(groupId, { deletingAt: Date.now() }))
    expect(await inviteRow(carla, root)).toMatchObject({ target: null })
  })
})
