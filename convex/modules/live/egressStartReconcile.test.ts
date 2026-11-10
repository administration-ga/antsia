// @vitest-environment edge-runtime
// Dupliqué de socle/convex/modules/direct/egressStartReconcile.test.ts @ ad2e7fdc2 — adaptations : actions du direct du moteur (`modules/live/livekitActions`) et modules simulés sous leur nom du moteur (`lib/livekitWake`, `lib/livekitEgressFileTransfer`) ; sessions `liveSessions` COMPLÈTES posées par l'outillage du module (`insertSession` : le schéma du moteur est validé, une ligne partielle `as never` n'y entre plus) ; motifs attendus en CODES (`recorder_unresponsive`, `ended_before_start`, `transfer_too_large`) au lieu des phrases ; horloge simulée (les tentatives replanifiées ne partent jamais seules) ; les sept cas du socle portés, et le rapatriement réussi affirme en plus l'inscription du fichier à la garde des fichiers ; DL-02 : sessions posées ENREGISTRÉES (`replay: true`), l'outillage posant désormais des sessions non enregistrées par défaut.
/**
 * Démarrage et réconciliation de l'Egress d'un direct — correctifs du 2026-09-17.
 *
 * Chaque `describe` garde un défaut CONSTATÉ le 17/09 sur la chaîne ADR-0158 :
 *
 *  · la cause réelle d'un échec ne passait pas d'une tentative à la suivante :
 *    une conférence terminée pendant la boucle finissait « terminée avant que
 *    l'enregistrement démarre », même après des refus répétés de LiveKit ;
 *  · la réconciliation interrogeait LiveKit (`listEgress`) SANS réveiller la
 *    VM, qui se suspend quinze minutes après la dernière session — le moment
 *    exact où ce filet passe ;
 *  · le fichier était chargé ENTIER en mémoire avant d'être stocké.
 *
 * LiveKit, le réveil et le transfert sont simulés : ce fichier prouve ce que
 * les actions DÉCIDENT et ÉCRIVENT. Le transfert en flux a ses propres tests
 * (`lib/livekitEgressFileTransfer.test.ts`).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { internal } from "../../_generated/api"
import type { Id } from "../../_generated/dataModel"
import { testConvex } from "../../test.setup"
import { enter, insertSession, seed, type T, T0 } from "./fixtures.setup"

const livekit = vi.hoisted(() => ({
  calls: [] as string[],
  wake: vi.fn(),
  listRooms: vi.fn(),
  startRoomCompositeEgress: vi.fn(),
  listEgress: vi.fn(),
  stopEgress: vi.fn(),
  transfer: vi.fn(),
}))

vi.mock("livekit-server-sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("livekit-server-sdk")>()
  return {
    ...actual,
    RoomServiceClient: class {
      listRooms = livekit.listRooms
    },
    EgressClient: class {
      startRoomCompositeEgress = livekit.startRoomCompositeEgress
      listEgress = livekit.listEgress
      stopEgress = livekit.stopEgress
    },
  }
})
vi.mock("../../lib/livekitWake", () => ({ ensureLiveKitAwake: livekit.wake }))
vi.mock("../../lib/livekitEgressFileTransfer", () => ({
  transferEgressFileToStorage: livekit.transfer,
}))

const NO_WORKER = "twirp error unknown: no response from servers"
const ROOM = "direct-room-test"

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(T0)
  vi.stubEnv("LIVEKIT_API_KEY", "APItest")
  vi.stubEnv("LIVEKIT_API_SECRET", "secret-de-test-pour-le-direct")
  vi.stubEnv("LIVEKIT_WS_URL", "wss://livekit.test")
  livekit.calls.length = 0
  livekit.wake.mockReset().mockImplementation(async () => {
    livekit.calls.push("wake")
  })
  livekit.listRooms.mockReset().mockResolvedValue([])
  livekit.startRoomCompositeEgress.mockReset()
  livekit.listEgress.mockReset().mockImplementation(async () => {
    livekit.calls.push("listEgress")
    return []
  })
  livekit.stopEgress.mockReset().mockResolvedValue(undefined)
  livekit.transfer.mockReset()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

/** Une conférence EN DIRECT dont la capture est demandée — sans planifier quoi que ce soit. */
async function directEnDirect(t: T): Promise<Id<"liveSessions">> {
  const { root } = await seed(t)
  const host = await enter(t, root, "hote")
  const sessionId = await insertSession(t, { networkId: root, host, replay: true })
  await t.run((ctx) => ctx.db.patch(sessionId, { roomName: ROOM, replayStatus: "pending" }))
  return sessionId
}

type StartArgs = {
  sessionId: Id<"liveSessions">
  roomName: string
  attempt?: number
  roomSeen?: boolean
  lastFailure?: { stage: "server" | "egress"; detail: string }
}

/** La tentative SUIVANTE, telle que l'action l'a planifiée (jamais devinée). */
async function nextAttempt(t: T): Promise<StartArgs> {
  const jobs = await t.run((ctx) => ctx.db.system.query("_scheduled_functions").take(100))
  const retries = jobs.filter((job) => job.name.includes("startDirectEgress"))
  const last = retries[retries.length - 1]
  if (last === undefined) throw new Error("aucune tentative planifiée")
  return last.args[0] as StartArgs
}

async function session(t: T, sessionId: Id<"liveSessions">) {
  return t.run((ctx) => ctx.db.get(sessionId))
}

async function terminer(t: T, sessionId: Id<"liveSessions">): Promise<void> {
  await t.run((ctx) => ctx.db.patch(sessionId, { status: "ended", endedAt: Date.now() }))
}

const start = internal.modules.live.livekitActions.startDirectEgress
const reconcile = internal.modules.live.livekitActions.reconcileDirectEgress

describe("startDirectEgress — la cause RÉELLE survit à la tentative", () => {
  it("après des refus répétés du service d'enregistrement, la conférence terminée NOMME la vraie cause", async () => {
    const t = testConvex()
    const sessionId = await directEnDirect(t)
    // La salle est ouverte, mais aucun worker Egress ne répond.
    livekit.listRooms.mockResolvedValue([{ name: ROOM }])
    livekit.startRoomCompositeEgress.mockRejectedValue(new Error(NO_WORKER))
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})

    const first = await t.action(start, { sessionId, roomName: ROOM })
    expect(first).toEqual({ status: "retry_scheduled" })
    let args = await nextAttempt(t)
    expect(args).toMatchObject({
      attempt: 1,
      roomSeen: true,
      lastFailure: { stage: "egress", detail: NO_WORKER },
    })

    await t.action(start, args)
    args = await nextAttempt(t)
    expect(args).toMatchObject({ attempt: 2, lastFailure: { stage: "egress" } })

    // L'hôte part : la salle se referme. Ce n'est pas un échec, et cela ne
    // fait pas oublier le refus.
    livekit.listRooms.mockResolvedValue([])
    await t.action(start, args)
    args = await nextAttempt(t)
    expect(args).toMatchObject({
      attempt: 3,
      lastFailure: { stage: "egress", detail: NO_WORKER },
    })

    await terminer(t, sessionId)
    const ended = await t.action(start, args)

    expect(ended).toEqual({ status: "ended_before_start" })
    const row = await session(t, sessionId)
    expect(row?.replayStatus).toBe("failed")
    // LE défaut du 17/09 : « terminée avant que l'enregistrement démarre ».
    // Le motif est un CODE ; le détail technique reste au journal.
    expect(row?.replayFailureReason).toBe("recorder_unresponsive")
    expect(consoleError).toHaveBeenCalled()
    expect(consoleError.mock.calls.some((call) => call.some((part) => typeof part === "string" && part.includes(NO_WORKER)))).toBe(true)
  })

  it("sans AUCUN échec côté LiveKit, « terminée avant que l'enregistrement démarre » reste le motif", async () => {
    const t = testConvex()
    const sessionId = await directEnDirect(t)
    // L'hôte n'ouvre jamais sa salle : le serveur répond, la salle n'existe pas.
    livekit.listRooms.mockResolvedValue([])

    await t.action(start, { sessionId, roomName: ROOM })
    const args = await nextAttempt(t)
    expect(args.lastFailure).toBeUndefined()
    expect(args.roomSeen).toBe(false)

    await terminer(t, sessionId)
    await t.action(start, args)

    const row = await session(t, sessionId)
    expect(row?.replayStatus).toBe("failed")
    expect(row?.replayFailureReason).toBe("ended_before_start")
    expect(livekit.startRoomCompositeEgress).not.toHaveBeenCalled()
  })

  it("un serveur qui s'est RÉVEILLÉ entre-temps efface l'échec du réveil", async () => {
    const t = testConvex()
    const sessionId = await directEnDirect(t)
    vi.spyOn(console, "error").mockImplementation(() => {})
    livekit.wake.mockRejectedValueOnce(new Error("LIVEKIT_UNAVAILABLE"))

    await t.action(start, { sessionId, roomName: ROOM })
    let args = await nextAttempt(t)
    expect(args.lastFailure).toEqual({ stage: "server", detail: "LIVEKIT_UNAVAILABLE" })
    expect(livekit.listRooms).not.toHaveBeenCalled()

    // Le serveur répond ; la salle n'est pas encore ouverte.
    await t.action(start, args)
    args = await nextAttempt(t)
    expect(args.lastFailure).toBeUndefined()

    await terminer(t, sessionId)
    await t.action(start, args)
    expect((await session(t, sessionId))?.replayFailureReason).toBe("ended_before_start")
  })

  it("un démarrage réussi est rattaché une fois, sans replanification", async () => {
    const t = testConvex()
    const sessionId = await directEnDirect(t)
    livekit.listRooms.mockResolvedValue([{ name: ROOM }])
    livekit.startRoomCompositeEgress.mockResolvedValue({ egressId: "EG_STARTED" })

    const result = await t.action(start, {
      sessionId,
      roomName: ROOM,
      attempt: 4,
      roomSeen: true,
      lastFailure: { stage: "egress", detail: NO_WORKER },
    })

    expect(result).toEqual({ status: "started" })
    const row = await session(t, sessionId)
    expect(row?.egressId).toBe("EG_STARTED")
    expect(row?.replayStatus).toBe("pending")
    expect(row?.replayFailureReason).toBeUndefined()
    const jobs = await t.run((ctx) => ctx.db.system.query("_scheduled_functions").take(100))
    expect(jobs.filter((job) => job.name.includes("startDirectEgress"))).toHaveLength(0)
  })
})

describe("reconcileDirectEgress — la VM dort quand le filet passe", () => {
  /** Une conférence TERMINÉE dont la capture n'a jamais été conclue. */
  async function directTermineEnAttente(t: T): Promise<Id<"liveSessions">> {
    const { root } = await seed(t)
    const host = await enter(t, root, "hote")
    const sessionId = await insertSession(t, { networkId: root, host, status: "ended", replay: true })
    await t.run((ctx) =>
      ctx.db.patch(sessionId, {
        roomName: ROOM,
        replayStatus: "pending",
        replayEgressState: "requested",
        egressId: "EG_RECONCILE",
        startedAt: Date.now() - 3_600_000,
        endedAt: Date.now() - 20 * 60_000,
      }),
    )
    return sessionId
  }

  it("RÉVEILLE la VM avant de demander à LiveKit, puis rapatrie le fichier en flux — et l'inscrit à la garde", async () => {
    const t = testConvex()
    const sessionId = await directTermineEnAttente(t)
    const storageId = await t.run((ctx) => ctx.storage.store(new Blob([new Uint8Array(128)])))
    livekit.listEgress.mockImplementation(async () => {
      livekit.calls.push("listEgress")
      return [
        {
          status: 3, // EGRESS_COMPLETE, forme protobuf de listEgress
          // `duration` : int64 en NANOSECONDES, bigint dans le SDK (12 s).
          fileResults: [{ location: "https://storage.test/directs/x.mp4?sig=1", duration: 12_000_000_000n }],
        },
      ]
    })
    livekit.transfer.mockResolvedValue({
      ok: true,
      storageId,
      bytes: 128,
      contentType: "video/mp4",
    })

    const result = await t.action(reconcile, { sessionId, egressId: "EG_RECONCILE" })

    expect(result).toEqual({ status: "ready" })
    expect(livekit.calls).toEqual(["wake", "listEgress"])
    expect(livekit.wake).toHaveBeenCalledWith("wss://livekit.test")
    expect(livekit.transfer).toHaveBeenCalledWith(
      expect.objectContaining({
        location: "https://storage.test/directs/x.mp4?sig=1",
        filepath: `directs/${sessionId}.mp4`,
        generateUploadUrl: expect.any(Function),
      }),
    )
    const row = await session(t, sessionId)
    expect(row?.replayStatus).toBe("ready")
    expect(row?.replayStorageId).toBe(storageId)
    expect(row?.replayDurationMs).toBe(12_000)
    // Le moteur ne sert aucun fichier que sa garde ne connaît pas : le fichier
    // rapatrié y est inscrit, au réseau et à l'hôte de la conférence.
    const scan = await t.run((ctx) =>
      ctx.db
        .query("fileScans")
        .withIndex("by_storageId", (q) => q.eq("storageId", storageId))
        .first(),
    )
    expect(scan).toMatchObject({ source: "live", networkId: row?.networkId, uploadedByPersonId: row?.hostPersonId, sizeBytes: 128 })
  })

  it("un réveil REFUSÉ n'est pas une preuve d'échec : rien n'est demandé, rien n'est écrit", async () => {
    const t = testConvex()
    const sessionId = await directTermineEnAttente(t)
    vi.spyOn(console, "error").mockImplementation(() => {})
    livekit.wake.mockRejectedValue(new Error("LIVEKIT_NO_CAPACITY"))

    const result = await t.action(reconcile, { sessionId, egressId: "EG_RECONCILE" })

    expect(result).toEqual({ status: "unreachable" })
    expect(livekit.listEgress).not.toHaveBeenCalled()
    const row = await session(t, sessionId)
    expect(row?.replayStatus).toBe("pending")
    expect(row?.replayFailureReason).toBeUndefined()
  })

  it("un rapatriement impossible est DIT à l'hôte par sa cause", async () => {
    const t = testConvex()
    const sessionId = await directTermineEnAttente(t)
    vi.spyOn(console, "error").mockImplementation(() => {})
    livekit.listEgress.mockResolvedValue([{ status: "EGRESS_COMPLETE", fileResults: [{ location: "https://storage.test/x.mp4" }] }])
    const reason = "L'enregistrement est trop volumineux pour être rapatrié (5 Go ; plafond 4 Go)."
    livekit.transfer.mockResolvedValue({ ok: false, code: "too_large", reason })

    const result = await t.action(reconcile, { sessionId, egressId: "EG_RECONCILE" })

    expect(result).toEqual({ status: "failed" })
    const row = await session(t, sessionId)
    expect(row?.replayStatus).toBe("failed")
    // La cause est un CODE ; la phrase du transfert reste au journal.
    expect(row?.replayFailureReason).toBe("transfer_too_large")
  })
})
