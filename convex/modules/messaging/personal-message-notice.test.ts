// @vitest-environment edge-runtime
/**
 * IC-09 — la cloche NEUTRE d'un message à deux.
 *
 * Écrite par la porte unique (`notifyPerson`) depuis le seul point d'insertion des messages
 * (`appendPersonalMessage`) : jamais à soi, jamais à travers un blocage ; une ligne par fil
 * (clé `genre|-|expéditeur`, un seul fil par paire et par réseau), rafraîchie à chaque message ;
 * aucun contenu, ni dans la ligne, ni dans la file de livraison ; la destination (la conversation)
 * est relue à l'instant pour le destinataire. Vraies sessions ; transports doublés.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { api, internal } from "../../_generated/api"
import type { Id } from "../../_generated/dataModel"
import { SEED_CONFIRMATION } from "../../seeds/foundations"
import { createTestSession, testConvex } from "../../test.setup"
import { notifyPerson } from "../notifications/notify"

const doubles = vi.hoisted(() => ({ push: vi.fn(), receipt: vi.fn() }))
vi.mock("../notifications/transports", () => ({ deliverPush: doubles.push, readExpoReceipt: doubles.receipt }))

type T = ReturnType<typeof testConvex>
type Person = { as: ReturnType<T["withIdentity"]>; personId: Id<"persons">; handle: string }

const NOW = Date.UTC(2026, 10, 23, 9)
const APPLICATIONS = JSON.stringify([{ applicationId: "antsia_ga", networkSlug: "antsia", origin: "https://antsia.example.test", entryPath: "/fil" }])
const M = api.modules.messaging
const BELL = api.modules.notifications.bell.paginateNotifications
const PAGE = { numItems: 50, cursor: null }
const SECRET = "Rendez-vous discret au marché de Mont-Bouët"

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  vi.stubEnv("NOTIFICATION_APPLICATIONS_JSON", APPLICATIONS)
  doubles.push.mockReset().mockResolvedValue({ status: "sent" })
  doubles.receipt.mockReset().mockResolvedValue({ status: "sent" })
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

async function seed(t: T) {
  return await t.mutation(internal.seeds.foundations.run, { confirmNonProduction: SEED_CONFIRMATION })
}

/** Une personne avec une VRAIE session, profil publié, membre du réseau racine. */
async function enter(t: T, networkId: Id<"networks">, handle: string): Promise<Person> {
  const subject = `auth-${handle}`
  const sessionId = await createTestSession(t, subject)
  const as = t.withIdentity({ subject, sessionId })
  const personId = await as.mutation(api.modules.people.persons.ensureMyPerson, {})
  await as.mutation(api.modules.people.consents.recordConsent, { purpose: "social_profile", origin: "onboarding" })
  await as.mutation(api.modules.people.profile.publishMyProfile, { handle, displayName: handle })
  await as.mutation(api.modules.people.memberships.joinNetwork, { networkId })
  return { as, personId, handle }
}

async function connect(t: T, networkId: Id<"networks">, a: Person, b: Person): Promise<void> {
  await t.run(async (ctx) => {
    const [low, high] = a.personId < b.personId ? [a.personId, b.personId] : [b.personId, a.personId]
    await ctx.db.insert("connections", { networkId, personIdLow: low, personIdHigh: high, requestedByPersonId: a.personId, recipientPersonId: b.personId, status: "accepted", requestedAt: 1, respondedAt: 1, updatedAt: 1 })
  })
}

/** Le destinataire accepte les notifications de ce réseau sur un appareil lié à sa session. */
async function subscribed(person: Person, networkId: Id<"networks">): Promise<void> {
  await person.as.mutation(api.modules.people.consents.recordConsent, { networkId, purpose: "notifications", origin: "settings" })
  await person.as.mutation(api.modules.notifications.pushSubscriptions.subscribe, { networkId, applicationId: "antsia_ga", deviceId: "device_ic09", credential: { provider: "expo", token: "ExpoPushToken[token_ic09]" } })
}

async function personalLines(networkId: Id<"networks">, person: Person) {
  return (await person.as.query(BELL, { networkId, paginationOpts: PAGE })).page.filter((row) => row.kind === "personal_message")
}

async function pair(t: T) {
  const { root } = await seed(t)
  const awa = await enter(t, root, "awa")
  const bob = await enter(t, root, "bob")
  await connect(t, root, awa, bob)
  return { t, root, awa, bob }
}

describe("IC-09 — la cloche d'un message à deux", () => {
  it("un message sonne chez la relation : une ligne, l'expéditeur pour acteur, sans sujet ni contenu ; rien chez l'expéditeur", async () => {
    const t = testConvex()
    const { root, awa, bob } = await pair(t)
    const opened = await awa.as.mutation(M.inbox.startThreadWithHandle, { networkId: root, handle: "bob", initialMessage: SECRET })

    const lines = await personalLines(root, bob)
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatchObject({ kind: "personal_message", subject: null, readAt: null, actor: { personId: awa.personId, handle: "awa" }, target: { kind: "personalThread", threadId: opened.threadId } })
    expect(await personalLines(root, awa)).toEqual([])
    // Aucun mot du message dans la ligne stockée, ni dans ce que la cloche sert.
    const rows = (await t.run(async (ctx) => await ctx.db.query("notifications").withIndex("by_network_recipient_createdAt", (q) => q.eq("networkId", root).eq("recipientPersonId", bob.personId)).take(20))).filter((row) => row.kind === "personal_message")
    expect(rows.map((row) => row.dedupKey)).toEqual([`personal_message|-|${awa.personId}`])
    expect(JSON.stringify(rows)).not.toContain("Mont-Bouët")
    expect(JSON.stringify(lines)).not.toContain("Mont-Bouët")
  })

  it("regroupée par fil : d'autres messages rafraîchissent LA ligne (non lue rouverte), jamais une seconde", async () => {
    const t = testConvex()
    const { root, awa, bob } = await pair(t)
    const { threadId } = await awa.as.mutation(M.inbox.startThreadWithHandle, { networkId: root, handle: "bob", initialMessage: "Bonjour" })
    await awa.as.mutation(M.messages.sendMessage, { networkId: root, threadId, content: "Tu es là ?" })
    const [line] = await personalLines(root, bob)
    if (!line) throw new Error("aucune ligne")
    await bob.as.mutation(api.modules.notifications.bell.markRead, { networkId: root, notificationId: line.notificationId })
    expect((await personalLines(root, bob))[0]?.readAt).not.toBeNull()

    vi.setSystemTime(NOW + 60_000)
    await awa.as.mutation(M.messages.sendMessage, { networkId: root, threadId, content: "Je passe à 18 h." })
    const after = await personalLines(root, bob)
    expect(after).toHaveLength(1)
    expect(after[0]).toMatchObject({ notificationId: line.notificationId, readAt: null, createdAt: NOW + 60_000 })
    // Bob répond : la cloche d'Awa a sa propre ligne, celle de Bob ne bouge pas.
    await bob.as.mutation(M.messages.sendMessage, { networkId: root, threadId, content: "D'accord" })
    expect(await personalLines(root, awa)).toHaveLength(1)
    expect(await personalLines(root, bob)).toHaveLength(1)
  })

  it("un blocage retire la ligne de la cloche, et rien ne sonne plus à travers lui", async () => {
    const t = testConvex()
    const { root, awa, bob } = await pair(t)
    await awa.as.mutation(M.inbox.startThreadWithHandle, { networkId: root, handle: "bob", initialMessage: "Bonjour" })
    expect(await personalLines(root, bob)).toHaveLength(1)
    const before = (await bob.as.query(api.modules.notifications.bell.unreadCount, { networkId: root })).count
    await bob.as.mutation(api.modules.graph.connections.blockPerson, { networkId: root, targetPersonId: awa.personId })
    // La relecture (blocage) la retire de la cloche et de son décompte.
    expect(await personalLines(root, bob)).toEqual([])
    expect((await bob.as.query(api.modules.notifications.bell.unreadCount, { networkId: root })).count).toBe(before - 1)
    // Et à travers le blocage, la porte n'écrit rien.
    expect(await t.run(async (ctx) => await notifyPerson({ db: ctx.db }, { networkId: root, recipientPersonId: bob.personId, actorPersonId: awa.personId, kind: "personal_message" }))).toBeNull()
  })

  it("la porte refuse un avis sans acteur, avec un sujet, ou sans fil lisible entre les deux personnes", async () => {
    const t = testConvex()
    const { root, awa, bob } = await pair(t)
    const carla = await enter(t, root, "carla")
    const written = await t.run(async (ctx) => [
      // Aucun fil entre Carla et Bob : rien n'est écrit.
      await notifyPerson({ db: ctx.db }, { networkId: root, recipientPersonId: bob.personId, actorPersonId: carla.personId, kind: "personal_message" }),
      // Sans acteur : l'avis ne désignerait aucun fil.
      await notifyPerson({ db: ctx.db }, { networkId: root, recipientPersonId: bob.personId, kind: "personal_message" }),
    ])
    expect(written).toEqual([null, null])
    const { threadId } = await awa.as.mutation(M.inbox.startThreadWithHandle, { networkId: root, handle: "bob", initialMessage: "Bonjour" })
    const withSubject = await t.run(async (ctx) => await notifyPerson({ db: ctx.db }, { networkId: root, recipientPersonId: bob.personId, actorPersonId: awa.personId, kind: "personal_message", subject: { connection: threadId as unknown as Id<"connections"> } }))
    expect(withSubject).toBeNull()
    // Jamais à soi-même.
    expect(await t.run(async (ctx) => await notifyPerson({ db: ctx.db }, { networkId: root, recipientPersonId: awa.personId, actorPersonId: awa.personId, kind: "personal_message" }))).toBeNull()
  })
})

describe("IC-09 — ce qui sort de l'application", () => {
  it("un seul envoi par fil, catégorie « messages », sans contenu ; l'ouverture mène à la conversation, au seul destinataire", async () => {
    const t = testConvex()
    const { root, awa, bob } = await pair(t)
    await subscribed(bob, root)
    const { threadId } = await awa.as.mutation(M.inbox.startThreadWithHandle, { networkId: root, handle: "bob", initialMessage: SECRET })
    await awa.as.mutation(M.messages.sendMessage, { networkId: root, threadId, content: SECRET })

    const jobs = await t.run(async (ctx) => await ctx.db.query("notificationDeliveryJobs").take(10))
    expect(jobs).toHaveLength(1)
    const [job] = jobs
    if (!job) throw new Error("aucun envoi")
    expect(job).toMatchObject({ channel: "push", category: "messages", recipientPersonId: bob.personId, state: "queued" })
    expect(JSON.stringify(jobs)).not.toContain("Mont-Bouët")

    const OPEN = api.modules.notifications.open.resolveOpenTarget
    expect(await bob.as.query(OPEN, { networkId: root, reference: job._id })).toEqual({ channel: "notification", kind: "personal_message", subject: null, actorHandle: "awa", target: { kind: "personalThread", threadId } })
    // La référence d'autrui : le même refus qu'une référence inventée.
    expect(await awa.as.query(OPEN, { networkId: root, reference: job._id })).toBeNull()
  })

  it("la catégorie « messages » coupée : la cloche sonne, rien ne part", async () => {
    const t = testConvex()
    const { root, awa, bob } = await pair(t)
    await subscribed(bob, root)
    const all = { social: true, messages: true, calls: true, network: true, moderation: true, files: true }
    await bob.as.mutation(api.modules.notifications.preferences.update, { networkId: root, pushCategories: { ...all, messages: false } })
    await awa.as.mutation(M.inbox.startThreadWithHandle, { networkId: root, handle: "bob", initialMessage: "Bonjour" })
    expect(await personalLines(root, bob)).toHaveLength(1)
    expect(await t.run(async (ctx) => await ctx.db.query("notificationDeliveryJobs").take(10))).toEqual([])
  })
})


it("sourdine personnelle : le message arrive, la cloche reprend uniquement après réactivation", async () => {
  const { root, awa, bob } = await pair(testConvex())
  const { threadId } = await bob.as.mutation(M.inbox.startThreadWithHandle, { networkId: root, handle: "awa", initialMessage: SECRET })
  await bob.as.mutation(M.inbox.setMyThreadPreference, { networkId: root, threadId, change: { muted: true } })
  expect((await awa.as.query(M.inbox.getThread, { networkId: root, threadId }))?.muted).toBeUndefined()
  await awa.as.mutation(M.messages.sendMessage, { networkId: root, threadId, content: "Bonjour" })
  expect(await personalLines(root, bob)).toHaveLength(0)
  expect((await bob.as.query(M.inbox.getThread, { networkId: root, threadId }))?.unreadCount).toBe(1)
  await bob.as.mutation(M.inbox.setMyThreadPreference, { networkId: root, threadId, change: { muted: false } })
  await awa.as.mutation(M.messages.sendMessage, { networkId: root, threadId, content: "A bientôt" })
  expect(await personalLines(root, bob)).toHaveLength(1)
})
