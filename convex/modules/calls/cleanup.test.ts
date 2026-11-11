// @vitest-environment edge-runtime
/** PA3 lot 17 : la récolte progresse même quand sa première page reste vivante. */
import { CALL_INITIATING_TIMEOUT_MS, CALL_RING_WINDOW_MS } from "@antsia/social-contracts/calls"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { internal } from "../../_generated/api"
import type { Doc, Id } from "../../_generated/dataModel"
import { testConvex } from "../../test.setup"
import { callDoc, enterCallable, seed, type T, T0 } from "./fixtures.setup"

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(T0)
})

afterEach(() => {
  vi.useRealTimers()
})

const PENDING_SWEEP = "modules/calls/cleanup:sweepPendingCalls"
const LIVE_SWEEP = "modules/calls/cleanup:sweepLiveCalls"

/**
 * Lignes de `_scheduled_functions` laissées par l'amorce de `world()`, par harnais. convex-test garde
 * chaque ligne, jouée ou non, dans l'ordre de création : `jobs` rend la suite, soit TOUT ce que les
 * étapes testées planifient, sans filtre de nom.
 */
const fixtureJobCount = new WeakMap<T, number>()

async function scheduledRows(t: T) {
  return await t.run((ctx) => ctx.db.system.query("_scheduled_functions").take(100))
}

async function world() {
  const t = testConvex()
  const { root, testClosed } = await seed(t)
  const alice = await enterCallable(t, root, "alice")
  const bob = await enterCallable(t, root, "bob")
  // PA10 : chaque entrée (`joinNetwork` → `refreshReaderContexts`) planifie le rattrapage du fil de la
  // personne (`modules/posts/feedMaterialization:backfill`, sept étapes chaînées). Joué ICI, avant
  // l'étape testée et avec le drain des autres cas de ce fichier : le vrai planificateur des tests ne
  // joue ensuite que le nettoyage, et ces lignes restent hors du décompte de `jobs`.
  await t.finishAllScheduledFunctions(vi.runAllTimers)
  fixtureJobCount.set(t, (await scheduledRows(t)).length)
  return { t, root, testClosed, alice, bob }
}

async function insertCall(t: T, networkId: Id<"networks">, personId: Id<"persons">, input: { callStatus: Doc<"calls">["callStatus"]; startedAt: number; kind?: "direct" | "group" }): Promise<Id<"calls">> {
  return await t.run((ctx) =>
    ctx.db.insert("calls", {
      networkId,
      kind: input.kind ?? "direct",
      status: "active",
      callStatus: input.callStatus,
      roomName: `cleanup-${crypto.randomUUID()}`,
      createdByPersonId: personId,
      mediaType: "audio",
      maxParticipants: input.kind === "group" ? 11 : 2,
      startedAt: input.startedAt,
    }),
  )
}

/** Les tâches planifiées depuis la fin de l'amorce de `world()`, dans l'ordre de création. */
async function jobs(t: T) {
  return (await scheduledRows(t)).slice(fixtureJobCount.get(t) ?? 0)
}

describe("nettoyage des appels — pagination et préservation", () => {
  it("un job d'extinction de ticket perdu est récupéré ; un ticket frais ou un participant présent conserve son groupe", async () => {
    const { t, root, alice, bob } = await world()
    const lost = await insertCall(t, root, alice.personId, { kind: "group", callStatus: "ringing", startedAt: T0 - CALL_RING_WINDOW_MS - 1 })
    const ringing = await insertCall(t, root, alice.personId, { kind: "group", callStatus: "ringing", startedAt: T0 - CALL_RING_WINDOW_MS - 1 })
    const live = await insertCall(t, root, alice.personId, { kind: "group", callStatus: "ringing", startedAt: T0 - CALL_RING_WINDOW_MS - 1 })
    const tickets = await t.run(async (ctx) => {
      const expired = await ctx.db.insert("callInvites", { networkId: root, callId: lost, personId: bob.personId, status: "ringing", invitedAt: T0 - CALL_RING_WINDOW_MS })
      const fresh = await ctx.db.insert("callInvites", { networkId: root, callId: ringing, personId: bob.personId, status: "ringing", invitedAt: T0 })
      const expiredInLive = await ctx.db.insert("callInvites", { networkId: root, callId: live, personId: bob.personId, status: "ringing", invitedAt: T0 - CALL_RING_WINDOW_MS })
      await ctx.db.insert("callParticipants", { networkId: root, callId: live, personId: bob.personId, role: "participant", joinedAt: T0 })
      return { expired, fresh, expiredInLive }
    })
    await t.mutation(internal.modules.calls.cleanup.cleanupStaleCalls, {})
    await t.finishAllScheduledFunctions(vi.runAllTimers)

    expect(await callDoc(t, lost)).toMatchObject({ status: "ended", callStatus: "missed" })
    expect(await callDoc(t, ringing)).toMatchObject({ status: "active", callStatus: "ringing" })
    expect(await callDoc(t, live)).toMatchObject({ status: "active", callStatus: "ringing" })
    expect(await t.run((ctx) => ctx.db.get(tickets.expired))).toMatchObject({ status: "missed", respondedAt: T0 })
    expect(await t.run((ctx) => ctx.db.get(tickets.expiredInLive))).toMatchObject({ status: "missed", respondedAt: T0 })
    expect(await t.run((ctx) => ctx.db.get(tickets.fresh))).toMatchObject({ status: "ringing", invitedAt: T0 })
  })

  it("cinquante groupes protégés ne cachent pas la sonnerie périmée suivante ; chaque état démarre une seule chaîne", async () => {
    const { t, root, testClosed, alice, bob } = await world()
    const protectedCalls: Id<"calls">[] = []
    for (let index = 0; index < 50; index += 1) {
      const callId = await insertCall(t, root, alice.personId, { kind: "group", callStatus: "ringing", startedAt: T0 - CALL_RING_WINDOW_MS - 1 })
      protectedCalls.push(callId)
      await t.run((ctx) => ctx.db.insert("callInvites", { networkId: root, callId, personId: bob.personId, status: "ringing", invitedAt: T0 }))
    }
    const stale = await insertCall(t, testClosed, alice.personId, { callStatus: "ringing", startedAt: T0 - CALL_RING_WINDOW_MS - 1 })
    const fresh = await insertCall(t, root, alice.personId, { callStatus: "ringing", startedAt: T0 })
    const live = await insertCall(t, root, alice.personId, { callStatus: "connected", startedAt: T0 })
    await t.run((ctx) => ctx.db.insert("callParticipants", { networkId: root, callId: live, personId: bob.personId, role: "participant", joinedAt: T0 }))

    await t.mutation(internal.modules.calls.cleanup.cleanupStaleCalls, {})
    await t.finishAllScheduledFunctions(vi.runAllTimers)

    expect(await callDoc(t, stale)).toMatchObject({ status: "ended", callStatus: "missed", endReason: "timeout" })
    expect(await callDoc(t, fresh)).toMatchObject({ status: "active", callStatus: "ringing" })
    expect(await callDoc(t, live)).toMatchObject({ status: "active", callStatus: "connected" })
    for (const callId of protectedCalls) expect(await callDoc(t, callId)).toMatchObject({ status: "active", callStatus: "ringing" })

    const scheduled = await jobs(t)
    expect(scheduled.every((job) => job.state.kind === "success")).toBe(true)
    expect(scheduled.filter((job) => job.name === LIVE_SWEEP)).toHaveLength(2)
    const pending = scheduled.filter((job) => job.name === PENDING_SWEEP)
    expect(pending).toHaveLength(3)
    expect(pending.map((job) => job.args[0])).toEqual(
      expect.arrayContaining([
        { callStatus: "initiating", cursor: null, now: T0 },
        { callStatus: "ringing", cursor: null, now: T0 },
        { callStatus: "ringing", cursor: expect.any(String), now: T0 },
      ]),
    )
  })

  it("123 composés périmés : cinquante au plus par transaction, puis le vrai planificateur vide la file ; le rejeu ne réécrit pas les fins", async () => {
    const { t, root, alice } = await world()
    for (let index = 0; index < 123; index += 1) {
      await insertCall(t, root, alice.personId, { callStatus: "initiating", startedAt: T0 - CALL_INITIATING_TIMEOUT_MS - 1 })
    }
    await t.mutation(internal.modules.calls.cleanup.sweepPendingCalls, { callStatus: "initiating", cursor: null, now: T0 })
    const pendingCount = () => t.run(async (ctx) => (await ctx.db.query("calls").withIndex("by_callStatus", (q) => q.eq("callStatus", "initiating")).take(200)).length)
    expect(await pendingCount()).toBe(73)
    const firstJobs = await jobs(t)
    expect(firstJobs).toHaveLength(1)
    expect(firstJobs[0]).toMatchObject({ name: PENDING_SWEEP, args: [{ callStatus: "initiating", cursor: expect.any(String), now: T0 }] })

    await t.finishAllScheduledFunctions(vi.runAllTimers)
    expect(await pendingCount()).toBe(0)
    expect(await jobs(t)).toHaveLength(2)
    const before = await t.run((ctx) => ctx.db.query("calls").take(200))
    expect(before.every((row) => row.callStatus === "missed" && row.endedAt === T0)).toBe(true)
    await t.mutation(internal.modules.calls.cleanup.cleanupStaleCalls, {})
    await t.finishAllScheduledFunctions(vi.runAllTimers)
    expect(await t.run((ctx) => ctx.db.query("calls").take(200))).toEqual(before)
  })

  it("un jeune en tête ne masque pas un ancien ; l'instant voyage avec la suite et un appel décroché entre les pages est conservé", async () => {
    const { t, root, alice, bob } = await world()
    const young = await insertCall(t, root, alice.personId, { callStatus: "initiating", startedAt: T0 })
    for (let index = 0; index < 49; index += 1) {
      await insertCall(t, root, alice.personId, { callStatus: "initiating", startedAt: T0 - CALL_INITIATING_TIMEOUT_MS - 1 })
    }
    const answered = await insertCall(t, root, alice.personId, { callStatus: "initiating", startedAt: T0 - CALL_INITIATING_TIMEOUT_MS - 1 })
    const last = await insertCall(t, root, alice.personId, { callStatus: "initiating", startedAt: T0 - CALL_INITIATING_TIMEOUT_MS - 1 })

    await t.mutation(internal.modules.calls.cleanup.sweepPendingCalls, { callStatus: "initiating", cursor: null, now: T0 })
    expect((await t.run((ctx) => ctx.db.query("calls").withIndex("by_callStatus", (q) => q.eq("callStatus", "missed")).take(100))).length).toBe(49)
    await t.run(async (ctx) => {
      await ctx.db.patch(answered, { callStatus: "connected", answeredAt: T0 })
      await ctx.db.insert("callParticipants", { networkId: root, callId: answered, personId: bob.personId, role: "participant", joinedAt: T0 })
    })
    vi.setSystemTime(T0 + 10 * 60_000)
    await t.finishAllScheduledFunctions(vi.runAllTimers)

    expect(await callDoc(t, young)).toMatchObject({ status: "active", callStatus: "initiating" })
    expect(await callDoc(t, answered)).toMatchObject({ status: "active", callStatus: "connected" })
    expect(await callDoc(t, last)).toMatchObject({ status: "ended", callStatus: "missed", endedAt: T0 })
    expect((await jobs(t)).map((job) => job.args[0])).toEqual([{ callStatus: "initiating", cursor: expect.any(String), now: T0 }])
  })
})
