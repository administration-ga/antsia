// @vitest-environment edge-runtime
/**
 * DL-02 — AUCUNE personne ne parle dans un direct enregistré sans son accord
 * explicite et horodaté (décision du propriétaire du 9/11/2026).
 *
 * Ce fichier tient, dans l'ordre :
 *  1. créer : enregistrement décoché par défaut ; cocher vaut l'accord de l'hôte ;
 *  2. `acceptRecording` : adhésion, visibilité, éligibilité, débit, idempotence ;
 *  3. CHAQUE chemin vers l'antenne exige l'accord dans un direct enregistré
 *     (main levée et acceptée, invitation acceptée, promotion directe, invité
 *     intervenant au passage en live ou ajouté pendant le live), et aucun ne
 *     l'exige hors enregistrement ;
 *  4. le jeton d'intervenant (second verrou) ;
 *  5. la durée : purgé avec la rediffusion, jamais avant ;
 *  6. l'export : mon accord, sous la référence du direct.
 *
 * ⚠️ On ne fait jamais tourner le planificateur sans le dire : on lit
 * `_scheduled_functions`, puis on joue la purge explicitement.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { api, internal } from "../../_generated/api"
import type { Doc, Id } from "../../_generated/dataModel"
import { testConvex } from "../../test.setup"
import { directlyOwned, exportableRecord } from "../people/dataInventory"
import { codeOf, connect, consentToRecording, enter, grantAt, insertSession, invite, type Person, promote, ruleOf, seed, sessionDoc, type T, T0 } from "./fixtures.setup"
import { RECORDING_CONSENT_PURGE_BATCH } from "./recordingConsent"

const A = api.modules.live.antenna
const S = api.modules.live.sessions
const SP = api.modules.live.speakers
const I = api.modules.live.invitees
const authorizeToken = internal.modules.live.access.authorizeToken
const purge = internal.modules.live.recordingConsent.purgeSessionRecordingConsents
const PURGE_JOB = "modules/live/recordingConsent:purgeSessionRecordingConsents"

beforeEach(() => {
  vi.stubEnv("CONVEX_CLOUD_URL", "http://127.0.0.1:3210")
  vi.useFakeTimers()
  vi.setSystemTime(T0)
  // Le passage en live planifie la capture : sans LiveKit, rien ne part ici.
  vi.spyOn(console, "error").mockImplementation(() => {})
  vi.spyOn(console, "warn").mockImplementation(() => {})
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

/** La graine, l'hôte (alice) et une relation (bob), entrés dans la racine. */
async function cast() {
  const t = testConvex()
  const { root } = await seed(t)
  const alice = await enter(t, root, "alice")
  const bob = await enter(t, root, "bob")
  await connect(t, root, alice, bob)
  return { t, root, alice, bob }
}

async function consentsOf(t: T, sessionId: Id<"liveSessions">): Promise<Doc<"liveRecordingConsents">[]> {
  return await t.run(async (ctx) =>
    ctx.db
      .query("liveRecordingConsents")
      .withIndex("by_session_person", (q) => q.eq("sessionId", sessionId))
      .take(500),
  )
}

async function speakerOf(t: T, sessionId: Id<"liveSessions">, person: Person): Promise<Doc<"liveSpeakers"> | null> {
  return await t.run(async (ctx) => {
    const row = await ctx.db
      .query("liveSpeakers")
      .withIndex("by_session_person", (q) => q.eq("sessionId", sessionId).eq("personId", person.personId))
      .unique()
    return row && row.removedAt === undefined ? row : null
  })
}

async function jobNames(t: T): Promise<string[]> {
  return (await t.run(async (ctx) => ctx.db.system.query("_scheduled_functions").take(500))).map((job) => job.name)
}

/** Un spectateur ADMIS (bail posé maintenant), comme après un jeton spectateur. */
async function admit(t: T, sessionId: Id<"liveSessions">, person: Person): Promise<void> {
  await grantAt(t, sessionId, person, Date.now())
}

/** Une ligne d'intervenant posée SANS accord — l'état d'avant ce lot. */
async function legacySpeaker(t: T, sessionId: Id<"liveSessions">, person: Person): Promise<void> {
  await t.run(async (ctx) => {
    const session = await ctx.db.get(sessionId)
    if (!session) throw new Error("session inconnue")
    await ctx.db.insert("liveSpeakers", { networkId: session.networkId, sessionId, personId: person.personId, role: "speaker", grantEpoch: 1, addedAt: Date.now() })
  })
}

const recordingOf = (networkId: Id<"networks">, person: Person, sessionId: Id<"liveSessions">) => person.as.query(S.get, { networkId, sessionId }).then((dto) => dto.recording)

describe("créer — enregistrement décoché par défaut, l'hôte consent en cochant", () => {
  it("sans choix explicite, rien n'est enregistré et aucun accord n'est stocké", async () => {
    const { t, root, alice } = await cast()
    const { sessionId } = await alice.as.mutation(S.create, { networkId: root, title: "Sans enregistrement", audience: "public", chatMode: "open" })
    expect((await sessionDoc(t, sessionId))?.replayRequested).toBe(false)
    expect(await consentsOf(t, sessionId)).toEqual([])
    expect(await recordingOf(root, alice, sessionId)).toEqual({ requested: false, consentedAt: null, proposedSpeakerAwaitingConsent: false })
  })

  it("cocher « Enregistrer » écrit l'accord HORODATÉ de l'hôte ; la salle sait que le direct est enregistré", async () => {
    const { t, root, alice, bob } = await cast()
    const { sessionId } = await alice.as.mutation(S.create, { networkId: root, title: "Enregistré", audience: "public", chatMode: "open", replay: true })
    const rows = await consentsOf(t, sessionId)
    expect(rows.map((row) => ({ personId: row.personId, acceptedAt: row.acceptedAt, networkId: row.networkId }))).toEqual([{ personId: alice.personId, acceptedAt: T0, networkId: root }])
    expect(await recordingOf(root, alice, sessionId)).toEqual({ requested: true, consentedAt: T0, proposedSpeakerAwaitingConsent: false })
    // Dès la préparation, avant le passage en live.
    expect(await recordingOf(root, bob, sessionId)).toEqual({ requested: true, consentedAt: null, proposedSpeakerAwaitingConsent: false })
  })
})

describe("acceptRecording — MON accord, borné et idempotent", () => {
  it("écrit mon accord une fois ; le rejeu rend l'horodatage du PREMIER accord", async () => {
    const { t, root, alice, bob } = await cast()
    const sessionId = await insertSession(t, { networkId: root, host: alice, replay: true })
    expect(await bob.as.mutation(A.acceptRecording, { networkId: root, sessionId })).toEqual({ acceptedAt: T0, promoted: false })
    vi.setSystemTime(T0 + 5_000)
    expect(await bob.as.mutation(A.acceptRecording, { networkId: root, sessionId })).toEqual({ acceptedAt: T0, promoted: false })
    const mine = (await consentsOf(t, sessionId)).filter((row) => row.personId === bob.personId)
    expect(mine).toHaveLength(1)
    expect(await recordingOf(root, bob, sessionId)).toMatchObject({ requested: true, consentedAt: T0 })
  })

  it("débit `live.recordingConsent` par personne : au-delà de la rafale, `rateLimited` sans ligne ; un rejeu ne consomme rien", async () => {
    const { t, root, alice, bob } = await cast()
    const sessions: Id<"liveSessions">[] = []
    for (let index = 0; index < 11; index += 1) sessions.push(await insertSession(t, { networkId: root, host: alice, replay: true, title: `Direct ${index}` }))
    for (const sessionId of sessions.slice(0, 10)) await bob.as.mutation(A.acceptRecording, { networkId: root, sessionId })
    // Les rejeux d'accords existants ne touchent pas au seau.
    for (const sessionId of sessions.slice(0, 10)) await bob.as.mutation(A.acceptRecording, { networkId: root, sessionId })
    const last = sessions[10]
    if (last === undefined) throw new Error("session attendue")
    expect(await codeOf(bob.as.mutation(A.acceptRecording, { networkId: root, sessionId: last }))).toBe("rateLimited")
    expect((await consentsOf(t, last)).filter((row) => row.personId === bob.personId)).toEqual([])
  })

  it("refuse un direct NON enregistré (rien n'est stocké) et un direct terminé", async () => {
    const { t, root, alice, bob } = await cast()
    const plain = await insertSession(t, { networkId: root, host: alice })
    expect(await ruleOf(bob.as.mutation(A.acceptRecording, { networkId: root, sessionId: plain }))).toBe("LIVE_NO_RECORDING")
    expect(await consentsOf(t, plain)).toEqual([])
    const ended = await insertSession(t, { networkId: root, host: alice, replay: true, status: "ended" })
    expect(await ruleOf(bob.as.mutation(A.acceptRecording, { networkId: root, sessionId: ended }))).toBe("LIVE_ENDED")
  })

  it("un direct que je ne vois pas : refus INDISTINCT, aucune ligne", async () => {
    const { t, root, alice } = await cast()
    const carla = await enter(t, root, "carla")
    const sessionId = await insertSession(t, { networkId: root, host: alice, audience: "connections", replay: true })
    expect(await codeOf(carla.as.mutation(A.acceptRecording, { networkId: root, sessionId }))).toBe("notFound")
    expect((await consentsOf(t, sessionId)).map((row) => row.personId)).toEqual([alice.personId])
  })
})

describe("CHAQUE chemin vers l'antenne exige l'accord dans un direct enregistré", () => {
  it("main levée : refusée sans accord, permise après ; l'hôte la fait monter", async () => {
    const { t, root, alice, bob } = await cast()
    const sessionId = await insertSession(t, { networkId: root, host: alice, replay: true })
    await admit(t, sessionId, bob)
    expect(await ruleOf(bob.as.mutation(A.raiseHand, { networkId: root, sessionId }))).toBe("LIVE_RECORDING_CONSENT_REQUIRED")
    expect(await t.run((ctx) => ctx.db.query("liveAntennaRequests").first())).toBeNull()
    await bob.as.mutation(A.acceptRecording, { networkId: root, sessionId })
    const { requestId } = await bob.as.mutation(A.raiseHand, { networkId: root, sessionId })
    expect(await alice.as.mutation(A.respondToRequest, { networkId: root, requestId, response: "accepted" })).toEqual({ changed: true, promoted: true })
    expect(await speakerOf(t, sessionId, bob)).not.toBeNull()
  })

  it("main acceptée par l'hôte SANS accord (main antérieure au lot) : refusée, aucune ligne d'intervenant, la main reste en attente", async () => {
    const { t, root, alice, bob } = await cast()
    const sessionId = await insertSession(t, { networkId: root, host: alice, replay: true })
    await admit(t, sessionId, bob)
    const requestId = await t.run(async (ctx) =>
      ctx.db.insert("liveAntennaRequests", { networkId: root, sessionId, personId: bob.personId, status: "pending", createdAt: Date.now(), updatedAt: Date.now() }),
    )
    const before = (await jobNames(t)).length
    expect(await ruleOf(alice.as.mutation(A.respondToRequest, { networkId: root, requestId, response: "accepted" }))).toBe("LIVE_RECORDING_CONSENT_REQUIRED")
    expect(await speakerOf(t, sessionId, bob)).toBeNull()
    expect((await t.run((ctx) => ctx.db.get(requestId)))?.status).toBe("pending")
    expect((await jobNames(t)).length).toBe(before)
    // Refuser, lui, n'exige rien.
    expect(await alice.as.mutation(A.respondToRequest, { networkId: root, requestId, response: "declined" })).toEqual({ changed: true, promoted: false })
  })

  it("invitation acceptée : refusée sans accord, permise après ; la refuser n'exige rien", async () => {
    const { t, root, alice, bob } = await cast()
    const carla = await enter(t, root, "carla")
    await connect(t, root, alice, carla)
    const sessionId = await insertSession(t, { networkId: root, host: alice, replay: true })
    const { invitationId } = await alice.as.mutation(A.inviteUser, { networkId: root, sessionId, targetPersonId: bob.personId })
    expect(await ruleOf(bob.as.mutation(A.respondToInvitation, { networkId: root, invitationId, response: "accepted" }))).toBe("LIVE_RECORDING_CONSENT_REQUIRED")
    expect(await speakerOf(t, sessionId, bob)).toBeNull()
    await bob.as.mutation(A.acceptRecording, { networkId: root, sessionId })
    expect(await bob.as.mutation(A.respondToInvitation, { networkId: root, invitationId, response: "accepted" })).toEqual({ changed: true, promoted: true })
    const consent = (await consentsOf(t, sessionId)).find((row) => row.personId === bob.personId)
    expect(consent?.acceptedAt).toBe(T0)

    const declined = await alice.as.mutation(A.inviteUser, { networkId: root, sessionId, targetPersonId: carla.personId })
    expect(await carla.as.mutation(A.respondToInvitation, { networkId: root, invitationId: declined.invitationId, response: "declined" })).toEqual({ changed: true, promoted: false })
  })

  it("promotion directe par l'hôte : refusée sans accord de la cible, sans ligne ni action SFU", async () => {
    const { t, root, alice, bob } = await cast()
    const sessionId = await insertSession(t, { networkId: root, host: alice, replay: true })
    const before = await jobNames(t)
    expect(await ruleOf(alice.as.mutation(SP.promote, { networkId: root, sessionId, targetPersonId: bob.personId }))).toBe("LIVE_RECORDING_CONSENT_REQUIRED")
    expect(await speakerOf(t, sessionId, bob)).toBeNull()
    expect(await jobNames(t)).toEqual(before)
    await consentToRecording(t, sessionId, bob)
    expect(await alice.as.mutation(SP.promote, { networkId: root, sessionId, targetPersonId: bob.personId })).toEqual({ promoted: true })
  })

  it("hors enregistrement, aucun chemin n'exige ni ne stocke d'accord", async () => {
    const { t, root, alice, bob } = await cast()
    const carla = await enter(t, root, "carla")
    await connect(t, root, alice, carla)
    const sessionId = await insertSession(t, { networkId: root, host: alice })
    await admit(t, sessionId, bob)
    const { requestId } = await bob.as.mutation(A.raiseHand, { networkId: root, sessionId })
    expect(await alice.as.mutation(A.respondToRequest, { networkId: root, requestId, response: "accepted" })).toEqual({ changed: true, promoted: true })
    const { invitationId } = await alice.as.mutation(A.inviteUser, { networkId: root, sessionId, targetPersonId: carla.personId })
    expect(await carla.as.mutation(A.respondToInvitation, { networkId: root, invitationId, response: "accepted" })).toEqual({ changed: true, promoted: true })
    expect(await consentsOf(t, sessionId)).toEqual([])
    expect((await bob.as.mutation(authorizeToken, { networkId: root, sessionId })).role).toBe("speaker")
  })
})

describe("l'invité intervenant — sa place n'attend que son accord", () => {
  it("au passage en live : sans accord il reste spectateur mais est sonné ; avec un accord donné AVANT, il monte ; il monte en acceptant", async () => {
    const { t, root, alice, bob } = await cast()
    const carla = await enter(t, root, "carla")
    await connect(t, root, alice, carla)
    const { sessionId } = await alice.as.mutation(S.create, {
      networkId: root,
      title: "Table ronde",
      audience: "public",
      chatMode: "open",
      replay: true,
      invitees: [
        { personId: bob.personId, stageRole: "speaker" },
        { personId: carla.personId, stageRole: "speaker" },
      ],
    })
    // Carla accepte pendant la préparation : sa place l'attend au démarrage.
    expect(await recordingOf(root, carla, sessionId)).toEqual({ requested: true, consentedAt: null, proposedSpeakerAwaitingConsent: true })
    await carla.as.mutation(A.acceptRecording, { networkId: root, sessionId })
    expect(await alice.as.mutation(S.goLive, { networkId: root, sessionId })).toEqual({ started: true })
    expect(await speakerOf(t, sessionId, carla)).not.toBeNull()
    expect(await speakerOf(t, sessionId, bob)).toBeNull()
    const bobBells = await t.run(async (ctx) =>
      (await ctx.db.query("notifications").withIndex("by_network_recipient_createdAt", (q) => q.eq("networkId", root).eq("recipientPersonId", bob.personId)).take(20)).filter(
        (row) => row.subjectLiveSessionId === sessionId,
      ),
    )
    expect(bobBells.map((row) => row.kind)).toEqual(["live_invite"])
    expect(await recordingOf(root, bob, sessionId)).toEqual({ requested: true, consentedAt: null, proposedSpeakerAwaitingConsent: true })

    expect(await bob.as.mutation(A.acceptRecording, { networkId: root, sessionId })).toEqual({ acceptedAt: T0, promoted: true })
    expect(await speakerOf(t, sessionId, bob)).not.toBeNull()
    expect(await recordingOf(root, bob, sessionId)).toEqual({ requested: true, consentedAt: T0, proposedSpeakerAwaitingConsent: false })
  })

  it("ajouté pendant le live SANS accord : l'ajout de l'hôte réussit, l'invité est sonné et reste hors antenne", async () => {
    const { t, root, alice, bob } = await cast()
    const sessionId = await insertSession(t, { networkId: root, host: alice, replay: true })
    expect(await alice.as.mutation(I.add, { networkId: root, sessionId, personId: bob.personId, stageRole: "speaker" })).toEqual({ added: true, updated: false })
    expect(await speakerOf(t, sessionId, bob)).toBeNull()
    const list = await alice.as.query(I.listForSession, { networkId: root, sessionId })
    expect(list.invitees.map((row) => ({ personId: row.personId, stageRole: row.stageRole, onStage: row.onStage, notified: row.notifiedAt !== null }))).toEqual([
      { personId: bob.personId, stageRole: "speaker", onStage: false, notified: true },
    ])
  })

  it("un invité SPECTATEUR qui accepte l'enregistrement ne monte pas — seul le rôle d'intervenant ouvre une place", async () => {
    const { t, root, alice, bob } = await cast()
    const sessionId = await insertSession(t, { networkId: root, host: alice, replay: true })
    await invite(t, sessionId, bob, "viewer")
    expect(await bob.as.mutation(A.acceptRecording, { networkId: root, sessionId })).toEqual({ acceptedAt: T0, promoted: false })
    expect(await speakerOf(t, sessionId, bob)).toBeNull()
  })
})

describe("le jeton d'intervenant — second verrou", () => {
  it("une ligne d'intervenant SANS accord ne reçoit aucun jeton ; avec l'accord, si ; l'hôte n'en dépend pas", async () => {
    const { t, root, alice, bob } = await cast()
    const sessionId = await insertSession(t, { networkId: root, host: alice, replay: true })
    await legacySpeaker(t, sessionId, bob)
    expect(await ruleOf(bob.as.mutation(authorizeToken, { networkId: root, sessionId }))).toBe("LIVE_RECORDING_CONSENT_REQUIRED")
    // L'hôte d'un direct antérieur au lot n'a pas de ligne : cocher « Enregistrer » valait son accord.
    await t.run(async (ctx) => {
      for (const row of await ctx.db.query("liveRecordingConsents").take(10)) await ctx.db.delete(row._id)
    })
    expect((await alice.as.mutation(authorizeToken, { networkId: root, sessionId })).role).toBe("speaker")
    await consentToRecording(t, sessionId, bob)
    expect((await bob.as.mutation(authorizeToken, { networkId: root, sessionId })).role).toBe("speaker")
  })
})

describe("durée — l'accord part avec la rediffusion, jamais avant", () => {
  async function endedWithReady(t: T, root: Id<"networks">, host: Person, retentionUntil: number): Promise<Id<"liveSessions">> {
    const sessionId = await insertSession(t, { networkId: root, host, replay: true, status: "ended" })
    await t.run((ctx) => ctx.db.patch(sessionId, { replayStatus: "ready", replayPublication: "undecided", replayRetentionUntil: retentionUntil }))
    return sessionId
  }

  it("retirer la rediffusion planifie la purge ; la purge efface tous les accords de la session", async () => {
    const { t, root, alice, bob } = await cast()
    const sessionId = await endedWithReady(t, root, alice, T0 + 1_000_000)
    await consentToRecording(t, sessionId, bob)
    // Tant que la copie existe, une purge jouée n'efface rien.
    expect(await t.mutation(purge, { sessionId })).toEqual({ deleted: 0, done: true })
    expect(await consentsOf(t, sessionId)).toHaveLength(2)
    expect(await alice.as.mutation(S.withdrawReplay, { networkId: root, sessionId })).toEqual({ withdrawn: true })
    expect(await jobNames(t)).toContain(PURGE_JOB)
    expect(await t.mutation(purge, { sessionId })).toEqual({ deleted: 2, done: true })
    expect(await consentsOf(t, sessionId)).toEqual([])
  })

  it("l'échéance exacte et le filet horaire planifient la purge", async () => {
    const { t, root, alice } = await cast()
    const exact = await endedWithReady(t, root, alice, T0 - 1)
    expect(await t.mutation(internal.modules.live.replay.expireReplay, { sessionId: exact, expectedRetentionUntil: T0 - 1 })).toEqual({ expired: true })
    expect((await jobNames(t)).filter((name) => name === PURGE_JOB)).toHaveLength(1)
    const sweep = await endedWithReady(t, root, alice, T0 - 1)
    await t.mutation(internal.modules.live.replay.purgeExpiredReplays, {})
    expect((await sessionDoc(t, sweep))?.replayStatus).toBe("expired")
    expect((await jobNames(t)).filter((name) => name === PURGE_JOB)).toHaveLength(2)
    expect(await t.mutation(purge, { sessionId: sweep })).toEqual({ deleted: 1, done: true })
  })

  it("annulé avant le live, ou jamais démarré : les accords donnés partent aussi", async () => {
    const { t, root, alice } = await cast()
    const cancelled = await insertSession(t, { networkId: root, host: alice, replay: true, status: "scheduled" })
    await alice.as.mutation(S.end, { networkId: root, sessionId: cancelled })
    expect((await jobNames(t)).filter((name) => name === PURGE_JOB)).toHaveLength(1)
    expect(await t.mutation(purge, { sessionId: cancelled })).toEqual({ deleted: 1, done: true })

    const forgotten = await insertSession(t, { networkId: root, host: alice, replay: true, status: "scheduled" })
    vi.setSystemTime(T0 + 25 * 60 * 60 * 1000)
    await t.mutation(internal.modules.live.reap.reapStaleDirects, {})
    expect((await sessionDoc(t, forgotten))?.endReason).toBe("never_started")
    expect(await t.mutation(purge, { sessionId: forgotten })).toEqual({ deleted: 1, done: true })
  })

  it("copie retirée PENDANT le direct : les accords tiennent la salle jusqu'à la fin, puis partent", async () => {
    const { t, root, alice, bob } = await cast()
    const sessionId = await insertSession(t, { networkId: root, host: alice, replay: true })
    await t.run((ctx) => ctx.db.patch(sessionId, { replayStatus: "pending", replayPublication: "undecided" }))
    await promote(t, sessionId, bob)
    expect(await alice.as.mutation(S.withdrawReplay, { networkId: root, sessionId })).toEqual({ withdrawn: true })
    // Le direct continue : l'intervenant garde son jeton, la purge repasse plus tard.
    expect(await t.mutation(purge, { sessionId })).toEqual({ deleted: 0, done: false })
    expect((await bob.as.mutation(authorizeToken, { networkId: root, sessionId })).role).toBe("speaker")
    const retries = (await t.run(async (ctx) => ctx.db.system.query("_scheduled_functions").take(500))).filter((job) => job.name === PURGE_JOB && job.scheduledTime > T0 + 4 * 60 * 60 * 1000)
    expect(retries.length).toBeGreaterThan(0)
    await alice.as.mutation(S.end, { networkId: root, sessionId })
    expect(await t.mutation(purge, { sessionId })).toEqual({ deleted: 2, done: true })
  })

  it("un direct en cours ou une copie en échec (encore récupérable) gardent leurs accords", async () => {
    const { t, root, alice } = await cast()
    const live = await insertSession(t, { networkId: root, host: alice, replay: true })
    expect(await t.mutation(purge, { sessionId: live })).toEqual({ deleted: 0, done: true })
    const failed = await insertSession(t, { networkId: root, host: alice, replay: true, status: "ended" })
    await t.run((ctx) => ctx.db.patch(failed, { replayStatus: "failed" }))
    expect(await t.mutation(purge, { sessionId: failed })).toEqual({ deleted: 0, done: true })
    expect(await consentsOf(t, failed)).toHaveLength(1)
  })

  it("la purge avance par lots bornés et se replanifie tant qu'il reste des lignes", async () => {
    const { t, root, alice } = await cast()
    const sessionId = await insertSession(t, { networkId: root, host: alice, replay: true, status: "ended" })
    await t.run(async (ctx) => {
      await ctx.db.patch(sessionId, { replayStatus: "expired" })
      for (let index = 0; index < RECORDING_CONSENT_PURGE_BATCH + 20; index += 1) {
        const personId = await ctx.db.insert("persons", { authUserId: `accord-${index}`, createdAt: 1, updatedAt: 1 })
        await ctx.db.insert("liveRecordingConsents", { networkId: root, sessionId, personId, acceptedAt: 1 })
      }
    })
    expect(await t.mutation(purge, { sessionId })).toEqual({ deleted: RECORDING_CONSENT_PURGE_BATCH, done: false })
    expect(await jobNames(t)).toContain(PURGE_JOB)
    expect(await t.mutation(purge, { sessionId })).toEqual({ deleted: 21, done: true })
    expect(await consentsOf(t, sessionId)).toEqual([])
  })
})

describe("export — mon accord, sous la référence du direct", () => {
  it("la personne exporte son accord (horodatage et direct), jamais celui d'autrui ; il lui appartient pour l'effacement", () => {
    const row = { _id: "consent", _creationTime: 1, networkId: "network", sessionId: "session", personId: "person", acceptedAt: 42 }
    expect(exportableRecord("liveRecordingConsents", row, "person")).toEqual({ _id: "consent", _creationTime: 1, networkId: "network", personId: "person", acceptedAt: 42, liveSessionId: "session" })
    expect(exportableRecord("liveRecordingConsents", row, "other")).toBeNull()
    expect(directlyOwned("liveRecordingConsents", row, "person")).toBe(true)
    expect(directlyOwned("liveRecordingConsents", row, "other")).toBe(false)
  })
})
