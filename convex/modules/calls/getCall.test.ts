// @vitest-environment edge-runtime
/**
 * `getCall` — l'ÉTAT d'un appel que l'écran d'appel suit (remplace la
 * souscription du socle au document `meetings` entier). Ce que ce fichier tient :
 *  1. l'état suit le cycle (sonne, en communication, terminé, raison de fin) ;
 *  2. le DTO est allowlisté (ni nom de salle, ni identifiant de stockage) ;
 *  3. tout autre que ceux qui ont une ligne reçoit `null`, sans lever
 *     (inconnu, autre réseau, sans ligne, fil quitté : la même réponse) ;
 *  4. un appel de groupe porte le titre de son fil et son effectif.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { api } from "../../_generated/api"
import { testConvex } from "../../test.setup"
import { C, connect, connectedCall, enterCallable, groupThread, joinAlso, ringingCall, seed, T0, tick } from "./fixtures.setup"

beforeEach(() => {
  vi.stubEnv("CONVEX_CLOUD_URL", "http://127.0.0.1:3210")
  vi.useFakeTimers()
  vi.setSystemTime(T0)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

async function duo() {
  const t = testConvex()
  const { root, testClosed } = await seed(t)
  const alice = await enterCallable(t, root, "alice")
  const bob = await enterCallable(t, root, "bob")
  await connect(t, root, alice, bob)
  return { t, root, testClosed, alice, bob }
}

describe("getCall — l'état d'un tête-à-tête", () => {
  it("suit la sonnerie, la communication puis la fin, des deux côtés", async () => {
    const { root, alice, bob } = await duo()
    const callId = await ringingCall(root, alice, bob)

    const ringing = await alice.as.query(C.lifecycle.getCall, { networkId: root, callId })
    expect(ringing).toMatchObject({ _id: callId, kind: "direct", status: "active", callStatus: "ringing", createdByPersonId: alice.personId, calleePersonId: bob.personId, answeredAt: null, endReason: null, groupThreadId: null, title: null, endedAt: null })
    expect(await bob.as.query(C.lifecycle.getCall, { networkId: root, callId })).toMatchObject({ callStatus: "ringing" })

    tick()
    await bob.as.mutation(C.lifecycle.join, { networkId: root, callId })
    const connected = await bob.as.query(C.lifecycle.getCall, { networkId: root, callId })
    expect(connected?.callStatus).toBe("connected")
    expect(connected?.answeredAt).toBe(Date.now())

    tick()
    await alice.as.mutation(C.lifecycle.leave, { networkId: root, callId, intentional: true })
    const ended = await bob.as.query(C.lifecycle.getCall, { networkId: root, callId })
    expect(ended).toMatchObject({ status: "ended", endReason: "normal" })
    expect(ended?.endedAt).toBe(Date.now())
  })

  it("porte le mot de refus et la raison de fin à l'appelant", async () => {
    const { root, alice, bob } = await duo()
    const callId = await ringingCall(root, alice, bob)
    tick()
    await bob.as.mutation(C.lifecycle.declineCall, { networkId: root, callId, note: "Je te rappelle" })
    expect(await alice.as.query(C.lifecycle.getCall, { networkId: root, callId })).toMatchObject({ status: "ended", callStatus: "declined", endReason: "declined", declineNote: "Je te rappelle" })
  })

  it("dit qui a mis l'appel en attente", async () => {
    const { root, alice, bob } = await duo()
    const callId = await connectedCall(root, alice, bob)
    tick()
    await bob.as.mutation(C.ringing.hold, { networkId: root, callId })
    expect((await alice.as.query(C.lifecycle.getCall, { networkId: root, callId }))?.heldBy).toEqual([bob.personId])
  })

  it("rend un DTO allowlisté : ni salle, ni plafond, ni clés internes", async () => {
    const { root, alice, bob } = await duo()
    const callId = await ringingCall(root, alice, bob)
    const state = await alice.as.query(C.lifecycle.getCall, { networkId: root, callId })
    expect(Object.keys(state ?? {}).sort()).toEqual(
      [
        "_id",
        "answeredAt",
        "calleeEngagedAtCreate",
        "calleePersonId",
        "callStatus",
        "createdByPersonId",
        "declineNote",
        "endReason",
        "endedAt",
        "groupThreadId",
        "heldBy",
        "kind",
        "mediaType",
        "participantCount",
        "startedAt",
        "status",
        "title",
      ].sort(),
    )
  })
})

describe("getCall — refus indistinct, sans lever", () => {
  it("rend `null` à qui n'a pas de ligne sur l'appel", async () => {
    const { t, root, alice, bob } = await duo()
    const carol = await enterCallable(t, root, "carol")
    const callId = await ringingCall(root, alice, bob)
    expect(await carol.as.query(C.lifecycle.getCall, { networkId: root, callId })).toBeNull()
  })

  it("rend `null` quand on interroge depuis un autre réseau", async () => {
    const { t, root, testClosed, alice, bob } = await duo()
    await joinAlso(t, testClosed, alice)
    const callId = await ringingCall(root, alice, bob)
    expect(await alice.as.query(C.lifecycle.getCall, { networkId: testClosed, callId })).toBeNull()
  })

  it("rend `null` pour un appel effacé (même réponse qu'un inconnu)", async () => {
    const { t, root, alice, bob } = await duo()
    const callId = await ringingCall(root, alice, bob)
    await t.run(async (ctx) => ctx.db.delete(callId))
    expect(await alice.as.query(C.lifecycle.getCall, { networkId: root, callId })).toBeNull()
  })
})

describe("getCall — appel porté par un fil de groupe", () => {
  it("porte le titre du fil et l'effectif, et se ferme à qui quitte le fil", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const alice = await enterCallable(t, root, "alice")
    const bob = await enterCallable(t, root, "bob")
    const carol = await enterCallable(t, root, "carol")
    const threadId = await groupThread(t, root, alice, [bob, carol])
    const { callId } = await alice.as.mutation(C.groupCalls.startFromThread, { networkId: root, threadId })

    const state = await bob.as.query(C.lifecycle.getCall, { networkId: root, callId })
    expect(state).toMatchObject({ kind: "group", groupThreadId: threadId, title: "Comité", participantCount: 3 })

    tick()
    await carol.as.mutation(api.modules.groups.threads.leaveGroup, { networkId: root, threadId })
    expect(await carol.as.query(C.lifecycle.getCall, { networkId: root, callId })).toBeNull()
  })
})
