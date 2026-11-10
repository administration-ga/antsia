// @vitest-environment edge-runtime
// Dupliqué de socle/convex/modules/iappel/calls.test.ts (avec socle/convex/modules/iappel/evaluate.test.ts ; socle/convex/tests/callJournalAndDecline.test.ts ; socle/convex/tests/livekitTokenIssuance.test.ts ; socle/convex/tests/newAgentCalls.test.ts ; les cas `callByHandle` de socle/convex/modules/reseauPersonnel/messagerie.test.ts) @ ad2e7fdc2 — adaptations : personnes et réseaux (graine des fondations) ; codes et règles au lieu des libellés ; « un membre appelle un membre » sans organisation ni affiliation (verrous V01 à V07 levés, réécrit sur `callMember`) ; portée de poste, horaires, priorité, file du centre d'appels, environnement back-office et miroir de présence d'organisation retirés avec leur code ; fenêtre de sonnerie tenue par l'extinction programmée (plus d'horloge de query) ; tests neufs : refus indistinct (inconnu, profil retiré, non-membre, bloqué, membre en attente), appel d'un autre réseau introuvable, hors de mes relations sans cloche ni messagerie vocale, raccrocher sans réponse observable, lignes de participation closes à chaque fin, appels périmés de l'appelant clos avant un nouvel appel, nettoyage chaîné, débit, jeton portant la personne en attributs.
/**
 * APPELS EN TÊTE-À-TÊTE — ce que ce fichier tient, dans l'ordre d'importance :
 *  1. un membre appelle un membre : aucune organisation, aucune affiliation ;
 *  2. un refus d'admission est une VALEUR, inscrite des deux côtés ;
 *  3. connaître un identifiant d'appel ne donne aucun droit (refus indistinct) ;
 *  4. la sonnerie et l'attente sont des ÉTATS tenus par le serveur ;
 *  5. toute fin d'appel clôt ses lignes de participation.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { api, internal } from "../../_generated/api"
import { testConvex } from "../../test.setup"
import {
  bellOf,
  block,
  C,
  call,
  callDoc,
  codeOf,
  connect,
  connectedCall,
  enter,
  journalOf,
  presenceAt,
  ringingCall,
  ringingFor,
  rowsOf,
  ruleOf,
  seed,
  setPrefs,
  T0,
  tick,
} from "./fixtures.setup"

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
  const alice = await enter(t, root, "alice")
  const bob = await enter(t, root, "bob")
  return { t, root, testClosed, alice, bob }
}

// ═══════════════════════════════════════════════════════════════
// Appeler — verrous levés, joignabilité, refus indistinct
// ═══════════════════════════════════════════════════════════════

describe("callMember — un membre appelle un membre", () => {
  it("rend la personne appelée, même d'un appel adressé par identifiant public, admis ou refusé", async () => {
    const { t, root, alice, bob } = await duo()
    await connect(t, root, alice, bob)
    const admitted = await call(root, alice, bob)
    expect(admitted).toMatchObject({ admitted: true, calleePersonId: bob.personId })
    tick()
    await alice.as.mutation(C.lifecycle.leave, { networkId: root, callId: admitted.callId, intentional: true })
    tick()
    await setPrefs(t, bob, { dnd: { until: Date.now() + 60_000, startedAt: Date.now() } })
    expect(await call(root, alice, bob)).toMatchObject({ admitted: false, reason: "dnd", calleePersonId: bob.personId })
  })

  it("admis sans organisation ni affiliation : composé, deux lignes, l'appelant déjà dans sa salle", async () => {
    const { t, root, alice, bob } = await duo()
    const placed = await call(root, alice, bob, "video")
    expect(placed.admitted).toBe(true)
    if (!placed.admitted) return
    expect(placed.mediaType).toBe("video")
    expect(placed.roomName).toMatch(/^call-/)
    const doc = await callDoc(t, placed.callId)
    expect(doc).toMatchObject({ kind: "direct", status: "active", callStatus: "initiating", createdByPersonId: alice.personId, calleePersonId: bob.personId, maxParticipants: 2, mediaType: "video" })
    const rows = await rowsOf(t, placed.callId)
    expect(rows.map((row) => ({ personId: row.personId, role: row.role, joined: row.joinedAt !== undefined }))).toEqual(
      expect.arrayContaining([
        { personId: alice.personId, role: "host", joined: true },
        { personId: bob.personId, role: "participant", joined: false },
      ]),
    )
  })

  it("par identifiant public ou par personne : la même porte", async () => {
    const { root, alice, bob } = await duo()
    const placed = await alice.as.mutation(C.direct.callMember, { networkId: root, target: { personId: bob.personId } })
    expect(placed.admitted).toBe(true)
  })

  it("inconnu, profil retiré, bloqué, d'un autre réseau ou en attente : le MÊME refus", async () => {
    const { t, root, testClosed, alice, bob } = await duo()
    const carla = await enter(t, root, "carla")
    const dan = await enter(t, root, "dan")
    const eve = await enter(t, root, "eve")
    expect(await codeOf(alice.as.mutation(C.direct.callMember, { networkId: root, target: { handle: "personne" } }))).toBe("notFound")
    await carla.as.mutation(api.modules.people.profile.withdrawMyProfile, {})
    await block(t, root, bob, alice)
    await t.run(async (ctx) => {
      const membership = await ctx.db
        .query("networkMemberships")
        .withIndex("by_network_and_person", (q) => q.eq("networkId", root).eq("personId", eve.personId))
        .unique()
      await ctx.db.patch(membership!._id, { status: "en_attente" })
    })
    for (const target of [carla, bob, eve]) expect(await codeOf(call(root, alice, target)), target.handle).toBe("notFound")
    expect(await codeOf(alice.as.mutation(C.direct.callMember, { networkId: root, target: { personId: carla.personId } }))).toBe("notFound")
    // Dan n'est pas membre du réseau fermé : il n'y est pas joignable.
    await t.run(async (ctx) => ctx.db.insert("networkMemberships", { networkId: testClosed, personId: alice.personId, status: "declaree", role: "member", joinedAt: 1, statusChangedAt: 1 }))
    expect(await codeOf(call(testClosed, alice, dan))).toBe("notFound")
  })

  it("s'appeler soi-même : la règle le dit", async () => {
    const { root, alice } = await duo()
    expect(await ruleOf(call(root, alice, alice))).toBe("CALL_SELF")
  })

  it("passer un appel est limité en débit (un seul budget, quel que soit le chemin)", async () => {
    const { root, alice, bob } = await duo()
    for (let index = 0; index < 10; index += 1) {
      tick()
      await call(root, alice, bob)
    }
    tick()
    expect(await codeOf(call(root, alice, bob))).toBe("rateLimited")
  })
})

describe("callMember — l'admission : un refus est une VALEUR", () => {
  it("« ne pas déranger » : inscrit TERMINÉ des deux côtés, lignes closes, l'appelé prévenu, messagerie vocale offerte", async () => {
    const { t, root, alice, bob } = await duo()
    await setPrefs(t, bob, { dnd: { until: T0 + 3_600_000, startedAt: T0 } })
    const placed = await call(root, alice, bob)
    expect(placed).toMatchObject({ admitted: false, reason: "dnd", voicemailOffered: true })
    const doc = await callDoc(t, placed.callId)
    expect(doc).toMatchObject({ status: "ended", callStatus: "declined", endReason: "dnd" })
    expect((await rowsOf(t, placed.callId)).every((row) => row.leftAt !== undefined && row.joinedAt === undefined)).toBe(true)
    const bell = await bellOf(root, bob)
    expect(bell.map((row) => ({ kind: row.kind, subject: row.subject }))).toEqual([{ kind: "call_missed", subject: { kind: "call", id: placed.callId } }])
    expect(await ringingFor(root, bob)).toEqual([])
  })

  it("un silence ÉCHU ne refuse plus rien", async () => {
    const { t, root, alice, bob } = await duo()
    await setPrefs(t, bob, { dnd: { until: T0 - 1, startedAt: T0 - 10 } })
    expect((await call(root, alice, bob)).admitted).toBe(true)
  })

  it("déjà en ligne : par défaut l'appel PASSE (en attente, tonalité « occupé » photographiée) ; refusé si l'attente est coupée", async () => {
    const { t, root, alice, bob } = await duo()
    const carla = await enter(t, root, "carla")
    await connectedCall(root, carla, bob)
    tick()
    const placed = await call(root, alice, bob)
    expect(placed.admitted).toBe(true)
    expect((await callDoc(t, placed.callId))?.calleeEngagedAtCreate).toBe(true)
    await setPrefs(t, bob, { callWaiting: false })
    tick()
    expect(await call(root, alice, bob)).toMatchObject({ admitted: false, reason: "busy" })
  })

  it("un appelé libre ne porte PAS la tonalité « occupé »", async () => {
    const { t, root, alice, bob } = await duo()
    const placed = await call(root, alice, bob)
    if (!placed.admitted) throw new Error("refusé")
    expect((await callDoc(t, placed.callId))?.calleeEngagedAtCreate).toBeUndefined()
  })

  it("en réunion (silence automatique, opt-in) : refusé pendant un évènement ACCEPTÉ de l'agenda du réseau", async () => {
    const { t, root, alice, bob } = await duo()
    await t.run(async (ctx) =>
      ctx.db.insert("events", {
        networkId: root,
        organizerPersonId: bob.personId,
        title: "Assemblée",
        startAt: T0 - 600_000,
        endAt: T0 + 600_000,
        timeZone: "Africa/Libreville",
        status: "scheduled",
        idempotencyKey: "evt",
        createdAt: T0,
        updatedAt: T0,
      }),
    )
    expect((await call(root, alice, bob)).admitted).toBe(true)
    await setPrefs(t, bob, { autoMeetingDnd: { enabled: true } })
    tick()
    expect(await call(root, alice, bob)).toMatchObject({ admitted: false, reason: "in_meeting" })
  })

  it("hors ligne PROUVÉ : inscrit MANQUÉ, prévenu ; aucune présence connue : ça sonne (fail-open)", async () => {
    const { t, root, alice, bob } = await duo()
    expect((await call(root, alice, bob)).admitted).toBe(true)
    await presenceAt(t, root, bob, T0 - 10 * 60_000)
    tick()
    const placed = await call(root, alice, bob)
    expect(placed).toMatchObject({ admitted: false, reason: "offline" })
    expect((await callDoc(t, placed.callId))?.callStatus).toBe("missed")
    expect((await bellOf(root, bob)).map((row) => row.kind)).toContain("call_missed")
    // Une présence fraîche rend joignable.
    await presenceAt(t, root, bob, Date.now())
    tick()
    expect((await call(root, alice, bob)).admitted).toBe(true)
  })

  it("hors de mes relations : écarté en le disant, SANS cloche ni messagerie vocale ; une relation passe", async () => {
    const { t, root, alice, bob } = await duo()
    await setPrefs(t, bob, { outsideRelationsCalls: "silent" })
    const placed = await call(root, alice, bob)
    expect(placed).toMatchObject({ admitted: false, reason: "outside_relations", voicemailOffered: false })
    expect(await bellOf(root, bob)).toEqual([])
    await connect(t, root, alice, bob)
    tick()
    expect((await call(root, alice, bob)).admitted).toBe(true)
  })

  it("une messagerie vocale coupée n'est pas offerte", async () => {
    const { t, root, alice, bob } = await duo()
    await setPrefs(t, bob, { dnd: { until: T0 + 60_000, startedAt: T0 }, voicemailEnabled: false })
    expect(await call(root, alice, bob)).toMatchObject({ admitted: false, voicemailOffered: false })
  })
})

// ═══════════════════════════════════════════════════════════════
// Sonner
// ═══════════════════════════════════════════════════════════════

describe("listRinging — ce qui sonne chez moi", () => {
  it("rend l'appel qui sonne, nommé par le profil publié ; jamais chez l'appelant", async () => {
    const { root, alice, bob } = await duo()
    const callId = await ringingCall(root, alice, bob)
    const ringing = await ringingFor(root, bob)
    expect(ringing).toHaveLength(1)
    expect(ringing[0]).toMatchObject({ callId, kind: "direct", caller: { personId: alice.personId, label: { displayName: "alice", handle: "alice" } }, group: null, ringingSince: T0 })
    expect(await ringingFor(root, alice)).toEqual([])
  })

  it("un appel décroché, refusé ou annulé ne sonne plus", async () => {
    const { t, root, alice, bob } = await duo()
    const carla = await enter(t, root, "carla")
    await connectedCall(root, alice, bob)
    expect(await ringingFor(root, bob)).toEqual([])
    const declined = await ringingCall(root, carla, bob)
    await bob.as.mutation(C.lifecycle.declineCall, { networkId: root, callId: declined })
    expect(await ringingFor(root, bob)).toEqual([])
  })

  it("le plus ancien d'abord — c'est lui qu'on va manquer", async () => {
    const { t, root, alice, bob } = await duo()
    const carla = await enter(t, root, "carla")
    const first = await ringingCall(root, alice, bob)
    tick(5_000)
    const second = await ringingCall(root, carla, bob)
    expect((await ringingFor(root, bob)).map((row) => row.callId)).toEqual([first, second])
  })

  it("un appel d'un réseau ne sonne pas dans un autre", async () => {
    const { t, root, testClosed, alice, bob } = await duo()
    await t.run(async (ctx) => ctx.db.insert("networkMemberships", { networkId: testClosed, personId: bob.personId, status: "declaree", role: "member", joinedAt: 1, statusChangedAt: 1 }))
    await ringingCall(root, alice, bob)
    expect(await ringingFor(testClosed, bob)).toEqual([])
  })

  it("mes réponses rapides accompagnent la sonnerie — `null` tant que je n'en ai pas réglé", async () => {
    const { t, root, alice, bob } = await duo()
    await ringingCall(root, alice, bob)
    expect((await bob.as.query(C.ringing.listRinging, { networkId: root })).quickReplies).toBeNull()
    await setPrefs(t, bob, { quickReplies: ["J'arrive"] })
    expect((await bob.as.query(C.ringing.listRinging, { networkId: root })).quickReplies).toEqual(["J'arrive"])
  })

  it("au terme de la fenêtre, la sonnerie s'éteint : l'appel est MANQUÉ (état tenu, pas l'horloge de la query)", async () => {
    const { t, root, alice, bob } = await duo()
    const callId = await ringingCall(root, alice, bob)
    await t.finishAllScheduledFunctions(vi.runAllTimers)
    expect(await callDoc(t, callId)).toMatchObject({ status: "ended", callStatus: "missed", endReason: "timeout" })
    expect(await ringingFor(root, bob)).toEqual([])
    expect((await rowsOf(t, callId)).every((row) => row.leftAt !== undefined)).toBe(true)
  })
})

describe("setCallRinging — l'appelant a rejoint sa salle", () => {
  it("fait sonner une fois ; l'appelé ne le peut pas", async () => {
    const { t, root, alice, bob } = await duo()
    const placed = await call(root, alice, bob)
    if (!placed.admitted) throw new Error("refusé")
    expect(await codeOf(bob.as.mutation(C.lifecycle.setCallRinging, { networkId: root, callId: placed.callId }))).toBe("notFound")
    await alice.as.mutation(C.lifecycle.setCallRinging, { networkId: root, callId: placed.callId })
    await alice.as.mutation(C.lifecycle.setCallRinging, { networkId: root, callId: placed.callId })
    expect((await callDoc(t, placed.callId))?.callStatus).toBe("ringing")
  })
})

// ═══════════════════════════════════════════════════════════════
// Décrocher, raccrocher, refuser
// ═══════════════════════════════════════════════════════════════

describe("join — décrocher", () => {
  it("l'appelé décroche : en communication, qui et quand ; l'appelant qui rejoint ne fait rien transiter", async () => {
    const { t, root, alice, bob } = await duo()
    const callId = await ringingCall(root, alice, bob)
    expect((await alice.as.mutation(C.lifecycle.join, { networkId: root, callId })).callStatus).toBe("ringing")
    tick()
    const answered = await bob.as.mutation(C.lifecycle.join, { networkId: root, callId })
    expect(answered.callStatus).toBe("connected")
    expect(await callDoc(t, callId)).toMatchObject({ callStatus: "connected", answeredByPersonId: bob.personId, answeredAt: T0 + 1000 })
  })

  it("un tiers n'entre pas ; un appel d'un autre réseau est introuvable", async () => {
    const { t, root, testClosed, alice, bob } = await duo()
    const carla = await enter(t, root, "carla")
    const callId = await ringingCall(root, alice, bob)
    expect(await codeOf(carla.as.mutation(C.lifecycle.join, { networkId: root, callId }))).toBe("notFound")
    await t.run(async (ctx) => ctx.db.insert("networkMemberships", { networkId: testClosed, personId: bob.personId, status: "declaree", role: "member", joinedAt: 1, statusChangedAt: 1 }))
    expect(await codeOf(bob.as.mutation(C.lifecycle.join, { networkId: testClosed, callId }))).toBe("notFound")
  })

  it("un appel terminé ne se décroche plus", async () => {
    const { root, alice, bob } = await duo()
    const callId = await ringingCall(root, alice, bob)
    await bob.as.mutation(C.lifecycle.declineCall, { networkId: root, callId })
    expect(await ruleOf(bob.as.mutation(C.lifecycle.join, { networkId: root, callId }))).toBe("CALL_ENDED")
  })
})

describe("leave — raccrocher", () => {
  it("pendant la sonnerie : ANNULÉ ; après décrochage : terminé normalement — lignes closes", async () => {
    const { t, root, alice, bob } = await duo()
    const cancelled = await ringingCall(root, alice, bob)
    tick(6_000)
    await alice.as.mutation(C.lifecycle.leave, { networkId: root, callId: cancelled })
    expect(await callDoc(t, cancelled)).toMatchObject({ status: "ended", callStatus: "ended", endReason: "cancelled" })
    tick()
    const answered = await connectedCall(root, alice, bob)
    tick(6_000)
    await bob.as.mutation(C.lifecycle.leave, { networkId: root, callId: answered })
    expect(await callDoc(t, answered)).toMatchObject({ status: "ended", callStatus: "ended", endReason: "normal" })
    expect((await rowsOf(t, answered)).every((row) => row.leftAt !== undefined)).toBe(true)
  })

  it("les cinq premières secondes protègent un départ fortuit — sauf geste explicite", async () => {
    const { t, root, alice, bob } = await duo()
    const callId = await ringingCall(root, alice, bob)
    await alice.as.mutation(C.lifecycle.leave, { networkId: root, callId })
    expect((await callDoc(t, callId))?.status).toBe("active")
    await alice.as.mutation(C.lifecycle.join, { networkId: root, callId })
    await alice.as.mutation(C.lifecycle.leave, { networkId: root, callId, intentional: true })
    expect((await callDoc(t, callId))?.status).toBe("ended")
  })

  it("un appel inconnu, d'un autre réseau ou dont je n'ai pas de ligne : aucun effet, aucune réponse qui distingue", async () => {
    const { t, root, alice, bob } = await duo()
    const carla = await enter(t, root, "carla")
    const callId = await ringingCall(root, alice, bob)
    expect(await carla.as.mutation(C.lifecycle.leave, { networkId: root, callId })).toBeNull()
    expect((await callDoc(t, callId))?.status).toBe("active")
  })
})

describe("declineCall — refuser en laissant un mot", () => {
  it("le mot est enregistré et lisible par l'appelant dans son journal ; refuser sans mot reste possible", async () => {
    const { t, root, alice, bob } = await duo()
    const callId = await ringingCall(root, alice, bob)
    expect(await bob.as.mutation(C.lifecycle.declineCall, { networkId: root, callId, note: "  Je vous rappelle  " })).toEqual({ ended: true })
    expect(await callDoc(t, callId)).toMatchObject({ status: "ended", callStatus: "declined", endReason: "declined", declineNote: "Je vous rappelle" })
    const journal = await journalOf(root, alice)
    expect(journal[0]).toMatchObject({ callId, category: "declined", declineNote: "Je vous rappelle" })
    tick()
    const other = await ringingCall(root, alice, bob)
    await bob.as.mutation(C.lifecycle.declineCall, { networkId: root, callId: other })
    expect((await callDoc(t, other))?.declineNote).toBeUndefined()
  })

  it("un mot trop long est refusé par sa règle ; un mot vide n'écrit rien", async () => {
    const { t, root, alice, bob } = await duo()
    const callId = await ringingCall(root, alice, bob)
    expect(await ruleOf(bob.as.mutation(C.lifecycle.declineCall, { networkId: root, callId, note: "x".repeat(201) }))).toBe("CALL_DECLINE_NOTE_TOO_LONG")
    await bob.as.mutation(C.lifecycle.declineCall, { networkId: root, callId, note: "   " })
    expect((await callDoc(t, callId))?.declineNote).toBeUndefined()
  })

  it("l'appelant ne refuse pas son propre appel : il l'annule en raccrochant", async () => {
    const { root, alice, bob } = await duo()
    const callId = await ringingCall(root, alice, bob)
    expect(await codeOf(alice.as.mutation(C.lifecycle.declineCall, { networkId: root, callId }))).toBe("notFound")
  })
})

// ═══════════════════════════════════════════════════════════════
// L'attente, tenue par le serveur
// ═══════════════════════════════════════════════════════════════

describe("hold / resume — l'attente d'un tête-à-tête", () => {
  it("parque puis reprend, sans organisation ni permission particulière", async () => {
    const { t, root, alice, bob } = await duo()
    const callId = await connectedCall(root, alice, bob)
    expect(await alice.as.mutation(C.ringing.hold, { networkId: root, callId })).toMatchObject({ callStatus: "on_hold", noop: false })
    expect(await callDoc(t, callId)).toMatchObject({ callStatus: "on_hold", heldBy: [alice.personId] })
    expect(await alice.as.mutation(C.ringing.resume, { networkId: root, callId })).toMatchObject({ callStatus: "connected", noop: false })
    expect((await callDoc(t, callId))?.heldBy).toBeUndefined()
  })

  it("refuse qui n'est pas ENTRÉ dans l'appel", async () => {
    const { root, alice, bob } = await duo()
    const callId = await ringingCall(root, alice, bob)
    expect(await codeOf(bob.as.mutation(C.ringing.hold, { networkId: root, callId }))).toBe("notFound")
  })

  it("pas encore décroché : l'attente est DIFFÉRÉE puis honorée au décrochage ; une reprise différée l'annule", async () => {
    const { t, root, alice, bob } = await duo()
    const callId = await ringingCall(root, alice, bob)
    expect(await alice.as.mutation(C.ringing.hold, { networkId: root, callId })).toMatchObject({ deferred: true, callStatus: "ringing" })
    expect(await alice.as.mutation(C.ringing.resume, { networkId: root, callId })).toMatchObject({ deferred: true })
    expect((await callDoc(t, callId))?.holdOnAnswer).toBeUndefined()
    await alice.as.mutation(C.ringing.hold, { networkId: root, callId })
    tick()
    expect((await bob.as.mutation(C.lifecycle.join, { networkId: root, callId })).callStatus).toBe("on_hold")
    expect(await callDoc(t, callId)).toMatchObject({ callStatus: "on_hold", heldBy: [alice.personId], parkedAt: T0 + 1000 })
  })

  it("deux attentes croisées : la ligne ne revient qu'au DERNIER qui reprend", async () => {
    const { t, root, alice, bob } = await duo()
    const callId = await connectedCall(root, alice, bob)
    await alice.as.mutation(C.ringing.hold, { networkId: root, callId })
    tick()
    await bob.as.mutation(C.ringing.hold, { networkId: root, callId })
    expect((await callDoc(t, callId))?.heldBy).toEqual([alice.personId, bob.personId])
    expect(await alice.as.mutation(C.ringing.resume, { networkId: root, callId })).toMatchObject({ callStatus: "on_hold", heldByPeer: true })
    expect(await bob.as.mutation(C.ringing.resume, { networkId: root, callId })).toMatchObject({ callStatus: "connected", noop: false })
  })

  it("parquer deux fois, reprendre un appel en cours : des rejeux, jamais des erreurs", async () => {
    const { root, alice, bob } = await duo()
    const callId = await connectedCall(root, alice, bob)
    expect(await alice.as.mutation(C.ringing.resume, { networkId: root, callId })).toMatchObject({ noop: true, callStatus: "connected" })
    await alice.as.mutation(C.ringing.hold, { networkId: root, callId })
    expect(await alice.as.mutation(C.ringing.hold, { networkId: root, callId })).toMatchObject({ noop: true, callStatus: "on_hold" })
  })

  it("un appel TERMINÉ n'est plus pilotable ; quitter un appel parqué le termine proprement", async () => {
    const { t, root, alice, bob } = await duo()
    const callId = await connectedCall(root, alice, bob)
    await alice.as.mutation(C.ringing.hold, { networkId: root, callId })
    tick(6_000)
    await bob.as.mutation(C.lifecycle.leave, { networkId: root, callId })
    expect(await callDoc(t, callId)).toMatchObject({ status: "ended", callStatus: "ended", endReason: "normal" })
    await t.run(async (ctx) => {
      const row = (await ctx.db
        .query("callParticipants")
        .withIndex("by_call_person", (q) => q.eq("callId", callId).eq("personId", alice.personId))
        .unique())!
      await ctx.db.patch(row._id, { leftAt: undefined })
    })
    expect(await ruleOf(alice.as.mutation(C.ringing.hold, { networkId: root, callId }))).toBe("CALL_NOT_LIVE")
  })
})

// ═══════════════════════════════════════════════════════════════
// Le journal
// ═══════════════════════════════════════════════════════════════

describe("listCallHistory — le journal de celui qui lit", () => {
  it("reçu = ENTRANT, passé = SORTANT, et le correspondant affiché est l'AUTRE", async () => {
    const { root, alice, bob } = await duo()
    const callId = await connectedCall(root, alice, bob)
    const [mine] = await journalOf(root, alice)
    const [theirs] = await journalOf(root, bob)
    expect(mine).toMatchObject({ callId, category: "outgoing", createdByMe: true, counterpart: { personId: bob.personId, label: { displayName: "bob" } } })
    expect(theirs).toMatchObject({ callId, category: "incoming", createdByMe: false, counterpart: { personId: alice.personId } })
  })

  it("les refus AUTOMATIQUES portent leur raison ; « hors ligne » est un MANQUÉ", async () => {
    const { t, root, alice, bob } = await duo()
    await setPrefs(t, bob, { dnd: { until: T0 + 60_000, startedAt: T0 } })
    await call(root, alice, bob)
    await t.run(async (ctx) => {
      const prefs = await ctx.db
        .query("callPreferences")
        .withIndex("by_person", (q) => q.eq("personId", bob.personId))
        .unique()
      await ctx.db.patch(prefs!._id, { dnd: undefined })
    })
    await presenceAt(t, root, bob, T0 - 10 * 60_000)
    tick()
    await call(root, alice, bob)
    const journal = await journalOf(root, alice)
    expect(journal.map((row) => ({ category: row.category, reason: row.reason }))).toEqual([
      { category: "missed", reason: null },
      { category: "auto_declined", reason: "dnd" },
    ])
  })

  it("une durée n'existe qu'à partir du DÉCROCHAGE", async () => {
    const { root, alice, bob } = await duo()
    const callId = await ringingCall(root, alice, bob)
    tick(20_000)
    await bob.as.mutation(C.lifecycle.join, { networkId: root, callId })
    tick(65_000)
    await alice.as.mutation(C.lifecycle.leave, { networkId: root, callId })
    expect((await journalOf(root, bob))[0]?.durationMs).toBe(65_000)
    expect((await journalOf(root, alice))[0]?.durationMs).toBe(65_000)
  })

  it("le journal d'une personne ne montre ni les appels d'une autre, ni ceux d'un autre réseau", async () => {
    const { t, root, testClosed, alice, bob } = await duo()
    const carla = await enter(t, root, "carla")
    await connectedCall(root, alice, bob)
    expect(await journalOf(root, carla)).toEqual([])
    await t.run(async (ctx) => ctx.db.insert("networkMemberships", { networkId: testClosed, personId: alice.personId, status: "declaree", role: "member", joinedAt: 1, statusChangedAt: 1 }))
    expect(await journalOf(testClosed, alice)).toEqual([])
  })
})

// ═══════════════════════════════════════════════════════════════
// Nettoyage
// ═══════════════════════════════════════════════════════════════

describe("cleanupStaleCalls — le filet des appels périmés", () => {
  it("composé sans suite au-delà de 30 s : MANQUÉ ; plus jeune : intact", async () => {
    const { t, root, alice, bob } = await duo()
    const placed = await call(root, alice, bob)
    if (!placed.admitted) throw new Error("refusé")
    await t.mutation(internal.modules.calls.cleanup.cleanupStaleCalls, {})
    await t.finishAllScheduledFunctions(() => vi.advanceTimersByTime(1))
    expect((await callDoc(t, placed.callId))?.callStatus).toBe("initiating")
    tick(31_000)
    await t.mutation(internal.modules.calls.cleanup.cleanupStaleCalls, {})
    await t.finishAllScheduledFunctions(() => vi.advanceTimersByTime(1))
    expect(await callDoc(t, placed.callId)).toMatchObject({ status: "ended", callStatus: "missed", endReason: "timeout" })
  })

  it("établi mais plus personne dans la salle : terminé ; au-delà de quatre heures : terminé EN ERREUR", async () => {
    const { t, root, alice, bob } = await duo()
    const carla = await enter(t, root, "carla")
    const empty = await connectedCall(root, alice, bob)
    await t.run(async (ctx) => {
      for (const row of await ctx.db
        .query("callParticipants")
        .withIndex("by_call_person", (q) => q.eq("callId", empty))
        .take(10))
        await ctx.db.patch(row._id, { leftAt: Date.now() })
    })
    const ghost = await connectedCall(root, carla, alice)
    tick(4 * 60 * 60_000 + 1)
    await t.mutation(internal.modules.calls.cleanup.sweepLiveCalls, { callStatus: "connected", cursor: null })
    expect(await callDoc(t, empty)).toMatchObject({ status: "ended", endReason: "normal" })
    expect(await callDoc(t, ghost)).toMatchObject({ status: "ended", endReason: "error" })
    expect((await rowsOf(t, ghost)).every((row) => row.leftAt !== undefined)).toBe(true)
  })

  it("avant un nouvel appel, MES appels périmés du réseau sont clos ; un appel où l'autre est en ligne, non", async () => {
    const { t, root, alice, bob } = await duo()
    const carla = await enter(t, root, "carla")
    const stale = await ringingCall(root, alice, bob)
    await t.run(async (ctx) => ctx.db.patch(stale, { startedAt: T0 - 10 * 60_000 }))
    const live = await connectedCall(root, alice, carla)
    await t.run(async (ctx) => ctx.db.patch(live, { startedAt: T0 - 10 * 60_000 }))
    tick()
    const dan = await enter(t, root, "dan")
    await call(root, alice, dan)
    expect(await callDoc(t, stale)).toMatchObject({ status: "ended", callStatus: "missed" })
    expect((await callDoc(t, live))?.status).toBe("active")
  })
})

// ═══════════════════════════════════════════════════════════════
// Le jeton de salle
// ═══════════════════════════════════════════════════════════════

describe("le jeton de salle", () => {
  const ORIGINAL_ENV = { ...process.env }

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV }
  })

  it("autorisé pour une personne partie à un appel vivant ; un tiers et un appel terminé rendent `null`", async () => {
    const { t, root, alice, bob } = await duo()
    const carla = await enter(t, root, "carla")
    const callId = await ringingCall(root, alice, bob)
    expect(await bob.as.query(internal.modules.calls.token.authorizeToken, { networkId: root, callId })).toBeNull()
    await bob.as.mutation(C.lifecycle.join, { networkId: root, callId })
    const grant = await bob.as.query(internal.modules.calls.token.authorizeToken, { networkId: root, callId })
    expect(grant).toMatchObject({ personId: bob.personId, displayName: "bob", mediaType: "audio" })
    expect(await carla.as.query(internal.modules.calls.token.authorizeToken, { networkId: root, callId })).toBeNull()
    await bob.as.mutation(C.lifecycle.leave, { networkId: root, callId, intentional: true })
    expect(await bob.as.query(internal.modules.calls.token.authorizeToken, { networkId: root, callId })).toBeNull()
  })

  it("sans configuration : refus à code APRÈS l'autorisation ; un tiers est refusé AVANT de toucher à la configuration", async () => {
    delete process.env.LIVEKIT_API_KEY
    delete process.env.LIVEKIT_API_SECRET
    delete process.env.LIVEKIT_WS_URL
    vi.spyOn(console, "error").mockImplementation(() => {})
    const { t, root, alice, bob } = await duo()
    const carla = await enter(t, root, "carla")
    const callId = await ringingCall(root, alice, bob)
    await bob.as.mutation(C.lifecycle.join, { networkId: root, callId })
    expect(await codeOf(bob.as.action(C.livekitActions.requestToken, { networkId: root, callId }))).toBe("mediaServerNotConfigured")
    expect(await codeOf(carla.as.action(C.livekitActions.requestToken, { networkId: root, callId }))).toBe("notFound")
    vi.restoreAllMocks()
  })

  it("le jeton porte la salle, une identité `sujet::nonce` unique par connexion, et la PERSONNE en attributs", async () => {
    process.env.LIVEKIT_API_KEY = "cle-de-test"
    process.env.LIVEKIT_API_SECRET = "secret-de-test-suffisamment-long-pour-hs256"
    process.env.LIVEKIT_WS_URL = "wss://livekit.example.test"
    delete process.env.LIVEKIT_WAKE_URL
    const { root, alice, bob } = await duo()
    const callId = await ringingCall(root, alice, bob)
    await bob.as.mutation(C.lifecycle.join, { networkId: root, callId })
    const first = await bob.as.action(C.livekitActions.requestToken, { networkId: root, callId })
    const second = await bob.as.action(C.livekitActions.requestToken, { networkId: root, callId })
    expect(first).toMatchObject({ wsUrl: "wss://livekit.example.test", mediaType: "audio" })
    const payload = (jwt: string) => JSON.parse(atob((jwt.split(".")[1] ?? "").replace(/-/g, "+").replace(/_/g, "/"))) as { sub: string; name?: string; attributes?: Record<string, string>; video?: { room?: string; roomJoin?: boolean } }
    const claims = payload(first.token)
    expect(claims.sub.startsWith("auth-bob::")).toBe(true)
    expect(payload(second.token).sub).not.toBe(claims.sub)
    expect(claims.attributes).toEqual({ personId: bob.personId })
    expect(claims.name).toBe("bob")
    expect(claims.video).toMatchObject({ room: first.roomName, roomJoin: true })
  })
})

