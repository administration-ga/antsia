// @vitest-environment edge-runtime
/**
 * IC-04 — les ACCUSÉS DE LECTURE des conversations à deux, RÉCIPROQUES :
 *  1. qui les coupe n'en émet plus : l'autre ne voit plus quand il lit ;
 *  2. qui les coupe n'en voit plus : il ne sait plus quand l'autre lit ;
 *  3. les lectures restent enregistrées (sa pastille baisse toujours) : elles cessent
 *     d'être servies, et reviennent quand les deux les rallument ;
 *  4. le réglage d'autrui ne se lit nulle part ailleurs que dans ce « Lu » absent.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { api, internal } from "../../_generated/api"
import type { Id } from "../../_generated/dataModel"
import { SEED_CONFIRMATION } from "../../seeds/foundations"
import { testConvex } from "../../test.setup"

type T = ReturnType<typeof testConvex>
type Person = { as: ReturnType<T["withIdentity"]>; personId: Id<"persons">; handle: string }

const M = api.modules.messaging
const P = api.modules.calls.preferences
const T0 = Date.UTC(2026, 10, 10, 9, 0, 0)

beforeEach(() => {
  vi.stubEnv("CONVEX_CLOUD_URL", "http://127.0.0.1:3210")
  vi.useFakeTimers()
  vi.setSystemTime(T0)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

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

/** Deux relations, un fil ouvert par Awa (« Bonjour »). */
async function pair() {
  const t = testConvex()
  const { root } = await t.mutation(internal.seeds.foundations.run, { confirmNonProduction: SEED_CONFIRMATION })
  const awa = await enter(t, root, "awa")
  const ben = await enter(t, root, "ben")
  await connect(t, root, awa, ben)
  const { threadId } = await awa.as.mutation(M.inbox.startThreadWithHandle, { networkId: root, handle: ben.handle, initialMessage: "Bonjour" })
  return { t, root, awa, ben, threadId }
}

/** Le « Lu » que le lecteur voit sur SES messages du fil, du plus ancien au plus récent. */
async function myReceipts(networkId: Id<"networks">, reader: Person, threadId: Id<"personalThreads">) {
  const page = (await reader.as.query(M.messages.paginateMessages, { networkId, threadId, paginationOpts: { numItems: 50, cursor: null } })).page
  return page.filter((message) => message.isMine).reverse().map((message) => message.readAt)
}

/** L'aperçu du fil dans la boîte du lecteur. */
async function inboxRow(networkId: Id<"networks">, reader: Person) {
  return (await reader.as.query(M.inbox.paginateMyThreads, { networkId })).items[0]!
}

async function receiptsOff(person: Person) {
  await person.as.mutation(P.update, { readReceipts: false })
}

describe("IC-04 — accusés de lecture réciproques dans les conversations à deux", () => {
  it("par défaut, les deux les ont : le « Lu » est servi à l'expéditeur, dans le fil et dans la boîte", async () => {
    const { root, awa, ben, threadId } = await pair()
    expect(await myReceipts(root, awa, threadId)).toEqual([null])
    await ben.as.mutation(M.messages.markRead, { networkId: root, threadId })
    expect(await myReceipts(root, awa, threadId)).toEqual([T0])
    expect(await inboxRow(root, awa)).toMatchObject({ lastMessageByMe: true, lastMessageReadByCounterpart: true })
  })

  it("qui les coupe n'en émet plus : sa lecture est enregistrée (sa pastille baisse) mais l'autre ne la voit pas", async () => {
    const { t, root, awa, ben, threadId } = await pair()
    await receiptsOff(ben)
    expect((await ben.as.query(M.inbox.totalUnread, { networkId: root })).total).toBe(1)
    expect(await ben.as.mutation(M.messages.markRead, { networkId: root, threadId })).toEqual({ markedCount: 1 })
    // Sa pastille a baissé : la lecture est bien enregistrée…
    expect((await ben.as.query(M.inbox.totalUnread, { networkId: root })).total).toBe(0)
    expect(await t.run(async (ctx) => (await ctx.db.query("personalMessages").withIndex("by_thread_createdAt", (q) => q.eq("threadId", threadId)).first())?.readAt)).toBe(T0)
    // … mais elle n'est pas servie à l'expéditrice, ni dans le fil ni dans la boîte : « envoyé ».
    expect(await myReceipts(root, awa, threadId)).toEqual([null])
    expect(await inboxRow(root, awa)).toMatchObject({ lastMessageByMe: true, lastMessageReadByCounterpart: false })
  })

  it("qui les coupe n'en voit plus : ceux de l'autre, pourtant actifs, cessent de lui être servis", async () => {
    const { root, awa, ben, threadId } = await pair()
    vi.setSystemTime(T0 + 1_000)
    await ben.as.mutation(M.messages.sendMessage, { networkId: root, threadId, content: "Bien reçu" })
    vi.setSystemTime(T0 + 2_000)
    await awa.as.mutation(M.messages.markRead, { networkId: root, threadId })
    expect(await myReceipts(root, ben, threadId)).toEqual([T0 + 2_000])
    await receiptsOff(ben)
    expect(await myReceipts(root, ben, threadId)).toEqual([null])
    expect(await inboxRow(root, ben)).toMatchObject({ lastMessageByMe: true, lastMessageReadByCounterpart: false })
  })

  it("les lectures enregistrées ne sont pas supprimées : rallumés des deux côtés, les « Lu » reviennent", async () => {
    const { root, awa, ben, threadId } = await pair()
    await receiptsOff(ben)
    await ben.as.mutation(M.messages.markRead, { networkId: root, threadId })
    expect(await myReceipts(root, awa, threadId)).toEqual([null])
    await ben.as.mutation(P.update, { readReceipts: true })
    expect(await myReceipts(root, awa, threadId)).toEqual([T0])
    expect(await inboxRow(root, awa)).toMatchObject({ lastMessageReadByCounterpart: true })
  })

  it("le réglage se règle sur soi, se relit par `getMine`, et un écran qui ne l'envoie pas n'y touche pas", async () => {
    const { root, awa, ben, threadId } = await pair()
    expect((await ben.as.query(P.getMine, { now: T0 })).readReceipts).toBe(true)
    await receiptsOff(ben)
    // Un écran d'avant IC-04 n'envoie que ses champs : le réglage reste coupé.
    await ben.as.mutation(P.update, { callWaiting: false })
    expect(await ben.as.query(P.getMine, { now: T0 })).toMatchObject({ readReceipts: false, callWaiting: false })
    // L'autre ne lit rien de ce réglage : ses propres réglages restent les défauts.
    expect(await awa.as.query(P.getMine, { now: T0 })).toMatchObject({ readReceipts: true, saved: false })
    await ben.as.mutation(M.messages.markRead, { networkId: root, threadId })
    expect(await myReceipts(root, awa, threadId)).toEqual([null])
  })
})
