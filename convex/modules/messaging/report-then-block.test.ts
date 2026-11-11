// @vitest-environment edge-runtime
/**
 * IC-03 (plan 01) — se protéger depuis une conversation iCom, avec les gestes qui existent déjà :
 * le signalement de la brique commune (`moderation.cases.report`, cibles `person` et
 * `personalMessage`) et le blocage du graphe (`graph.connections.blockPerson`).
 *
 * L'ORDRE compte, et l'écran le dit : un signalement fait AVANT le blocage demeure dans la file de
 * la modération ; après le blocage, la personne et ses messages ne se signalent plus (refus
 * indistinct : le moteur exige une paire non bloquée). Bloquer ferme le fil à deux des deux côtés
 * et ne pose aucun blocage commercial (`commercialBlocks`, geste distinct des boutiques).
 */
import { engineErrorCode } from "@antsia/social-contracts/errors"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { api, internal } from "../../_generated/api"
import type { Id } from "../../_generated/dataModel"
import { SEED_CONFIRMATION } from "../../seeds/foundations"
import { testConvex } from "../../test.setup"

type T = ReturnType<typeof testConvex>
type Person = { as: ReturnType<T["withIdentity"]>; personId: Id<"persons">; handle: string }

const M = api.modules.messaging
const R = api.modules.moderation.cases
const C = api.modules.graph.connections

beforeEach(() => {
  vi.stubEnv("CONVEX_CLOUD_URL", "http://127.0.0.1:3210")
})

afterEach(() => {
  vi.unstubAllEnvs()
})

async function enter(t: T, rootId: Id<"networks">, handle: string, role?: "network_moderator"): Promise<Person> {
  const as = t.withIdentity({ subject: `ic03-${handle}` })
  const personId = await as.mutation(api.modules.people.persons.ensureMyPerson, {})
  await as.mutation(api.modules.people.consents.recordConsent, { purpose: "social_profile", origin: "onboarding" })
  await as.mutation(api.modules.people.profile.publishMyProfile, { handle, displayName: handle })
  await as.mutation(api.modules.people.memberships.joinNetwork, { networkId: rootId })
  if (role) await t.run(async (ctx) => {
    const row = await ctx.db.query("networkMemberships").withIndex("by_network_and_person", (q) => q.eq("networkId", rootId).eq("personId", personId)).unique()
    if (row) await ctx.db.patch(row._id, { role })
  })
  return { as, personId, handle }
}

async function connect(t: T, networkId: Id<"networks">, a: Person, b: Person): Promise<void> {
  await t.run(async (ctx) => {
    const [low, high] = a.personId < b.personId ? [a.personId, b.personId] : [b.personId, a.personId]
    await ctx.db.insert("connections", { networkId, personIdLow: low, personIdHigh: high, requestedByPersonId: a.personId, recipientPersonId: b.personId, status: "accepted", requestedAt: 1, respondedAt: 1, updatedAt: 1 })
  })
}

async function codeOf(promise: Promise<unknown>): Promise<string | null> {
  try {
    await promise
    return null
  } catch (error) {
    return engineErrorCode(error) ?? "unknown"
  }
}

/** Alice et Bob, reliés ; Bob écrit à Alice — un fil à deux et un message reçu par Alice. */
async function fixture() {
  const t = testConvex()
  const { root } = await t.mutation(internal.seeds.foundations.run, { confirmNonProduction: SEED_CONFIRMATION })
  const alice = await enter(t, root, "alice")
  const bob = await enter(t, root, "bob")
  const moderator = await enter(t, root, "moderateur", "network_moderator")
  await connect(t, root, alice, bob)
  const { threadId, messageId } = await bob.as.mutation(M.inbox.startThreadWithHandle, { networkId: root, handle: "alice", initialMessage: "Message reçu par Alice" })
  return { t, root, alice, bob, moderator, threadId, messageId }
}

async function commercialBlockCount(t: T): Promise<number> {
  return await t.run(async (ctx) => (await ctx.db.query("commercialBlocks").take(10)).length)
}

describe("IC-03 — signaler puis bloquer depuis une conversation", () => {
  it("signalés AVANT le blocage, la personne et son message restent à la modération ; bloquer ferme le fil des deux côtés, sans blocage commercial", async () => {
    const f = await fixture()
    const person = await f.alice.as.mutation(R.report, { networkId: f.root, target: { kind: "person", id: f.bob.personId }, reason: "harassment" })
    const message = await f.alice.as.mutation(R.report, { networkId: f.root, target: { kind: "personalMessage", id: f.messageId }, reason: "harassment" })
    expect(person).toMatchObject({ created: true })
    expect(message).toMatchObject({ created: true })
    expect(await commercialBlockCount(f.t)).toBe(0)

    await f.alice.as.mutation(C.blockPerson, { networkId: f.root, targetPersonId: f.bob.personId })

    // Le fil à deux est fermé, des deux côtés : ni liste, ni fiche, ni historique, ni envoi.
    expect((await f.alice.as.query(M.inbox.paginateMyThreads, { networkId: f.root })).items).toEqual([])
    expect((await f.bob.as.query(M.inbox.paginateMyThreads, { networkId: f.root })).items).toEqual([])
    expect(await f.alice.as.query(M.inbox.getThread, { networkId: f.root, threadId: f.threadId })).toBeNull()
    expect(await f.bob.as.query(M.inbox.getThread, { networkId: f.root, threadId: f.threadId })).toBeNull()
    expect(await codeOf(f.alice.as.query(M.messages.paginateMessages, { networkId: f.root, threadId: f.threadId, paginationOpts: { numItems: 10, cursor: null } }))).toBe("notFound")
    expect(await codeOf(f.bob.as.mutation(M.messages.sendMessage, { networkId: f.root, threadId: f.threadId, content: "Encore" }))).toBe("notFound")

    // Les deux dossiers sont toujours ouverts, dans la file des délais légaux, et se relisent.
    const rows = await f.t.run(async (ctx) => [await ctx.db.get(person.reportId), await ctx.db.get(message.reportId)])
    expect(rows.map((row) => row?.status)).toEqual(["open", "open"])
    const queue = await f.moderator.as.query(R.deadlineQueue, { networkId: f.root })
    expect(queue.items.map((item) => item.reportId)).toEqual(expect.arrayContaining([person.reportId, message.reportId]))
    const preview = api.modules.moderation.reviewProjection.preview
    expect(await f.moderator.as.query(preview, { networkId: f.root, reportId: message.reportId })).toMatchObject({ kind: "personalMessage", available: true, body: "Message reçu par Alice" })
    expect(await f.moderator.as.query(preview, { networkId: f.root, reportId: person.reportId })).toMatchObject({ kind: "person", available: true })

    // Le blocage du graphe ne pose aucun blocage commercial : ce geste reste celui des boutiques.
    expect(await commercialBlockCount(f.t)).toBe(0)
  })

  it("bloquée d'abord, la personne et ses messages ne se signalent plus — le même refus qu'une personne inconnue", async () => {
    const f = await fixture()
    const stranger = await f.t.run(async (ctx) => await ctx.db.insert("persons", { authUserId: "ic03-inconnue", createdAt: 1, updatedAt: 1 }))
    const unknownRefusal = await codeOf(f.alice.as.mutation(R.report, { networkId: f.root, target: { kind: "person", id: stranger }, reason: "harassment" }))
    expect(unknownRefusal).toBe("notFound")

    await f.alice.as.mutation(C.blockPerson, { networkId: f.root, targetPersonId: f.bob.personId })

    expect(await codeOf(f.alice.as.mutation(R.report, { networkId: f.root, target: { kind: "person", id: f.bob.personId }, reason: "harassment" }))).toBe(unknownRefusal)
    expect(await codeOf(f.alice.as.mutation(R.report, { networkId: f.root, target: { kind: "personalMessage", id: f.messageId }, reason: "harassment" }))).toBe(unknownRefusal)
    // Le bloqué non plus ne signale qui l'a bloqué : la paire est fermée dans les deux sens.
    expect(await codeOf(f.bob.as.mutation(R.report, { networkId: f.root, target: { kind: "person", id: f.alice.personId }, reason: "harassment" }))).toBe(unknownRefusal)
    expect(await f.t.run(async (ctx) => (await ctx.db.query("reports").take(10)).length)).toBe(0)
  })

  it("jamais sur soi : ni signaler son propre profil, ni se bloquer", async () => {
    const f = await fixture()
    expect(await codeOf(f.alice.as.mutation(R.report, { networkId: f.root, target: { kind: "person", id: f.alice.personId }, reason: "harassment" }))).toBe("notFound")
    expect(await codeOf(f.alice.as.mutation(C.blockPerson, { networkId: f.root, targetPersonId: f.alice.personId }))).toBe("invalidArgument")
    expect(await f.t.run(async (ctx) => ({ reports: (await ctx.db.query("reports").take(10)).length, blocks: (await ctx.db.query("personBlocks").take(10)).length }))).toEqual({ reports: 0, blocks: 0 })
  })
})
