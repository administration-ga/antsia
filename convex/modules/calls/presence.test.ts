// @vitest-environment edge-runtime
// Dupliqué de socle/convex/modules/iappel/presence.test.ts (avec socle/convex/modules/iappel/preferences.test.ts) @ ad2e7fdc2 — adaptations : présence PAR PERSONNE dans un réseau (`personPresence`), plus d'`agentPresence` d'organisation ni de présence synthétique de planning ; « ne pas déranger » sans portée (les cas de portée poste / personnel partent avec elle) ; `forOrgContacts` et `forOrgMembers` retirés avec leur code (8 cas) ; miroir du silence vers la présence d'organisation retiré (4 cas) ; instant de lecture fourni par l'écran ; réponses rapides par défaut `null` ; tests neufs : relations d'un autre réseau, appel d'un autre réseau non compté, lacune dite, battement et départ explicite, nettoyage indexé et chaîné, débit des réglages. ; IC-04 : défauts « mes relations seulement » et accusés de lecture actifs ; les tiers qui appellent une relation hors de leurs propres relations ont élargi leur réglage (`callableByEveryone`).
/**
 * PRÉSENCE ET RÉGLAGES — ce que mes relations voient de moi, et ce que je règle :
 *  1. la pastille n'est rendue qu'à des relations ÉTABLIES du réseau ;
 *  2. partage coupé = ABSENT, jamais « disponible » ;
 *  3. « hors ligne » est un CONSTAT preuves en main, jamais une déduction ;
 *  4. lire ses réglages n'écrit jamais rien.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { internal } from "../../_generated/api"
import type { Id } from "../../_generated/dataModel"
import { testConvex } from "../../test.setup"
import { C, callableByEveryone, codeOf, connect, connectedCall, enter, type Person, presenceAt, ringingCall, ruleOf, seed, setPrefs, T0, type T, tick } from "./fixtures.setup"

beforeEach(() => {
  vi.stubEnv("CONVEX_CLOUD_URL", "http://127.0.0.1:3210")
  vi.useFakeTimers()
  vi.setSystemTime(T0)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

async function world() {
  const t = testConvex()
  const { root, testClosed } = await seed(t)
  const me = await enter(t, root, "moi")
  const amie = await enter(t, root, "amie")
  await connect(t, root, me, amie)
  return { t, root, testClosed, me, amie }
}

async function pastilles(networkId: Id<"networks">, reader: Person, now = Date.now()) {
  return await reader.as.query(C.presence.forMyConnections, { networkId, now })
}

async function hints(networkId: Id<"networks">, reader: Person, now = Date.now()) {
  return (await reader.as.query(C.presence.offlineHints, { networkId, now })).offline
}

async function presenceRow(t: T, networkId: Id<"networks">, person: Person) {
  return await t.run(async (ctx) =>
    ctx.db
      .query("personPresence")
      .withIndex("by_network_person", (q) => q.eq("networkId", networkId).eq("personId", person.personId))
      .unique(),
  )
}

// ═══════════════════════════════════════════════════════════════
// La pastille
// ═══════════════════════════════════════════════════════════════

describe("forMyConnections — la pastille de mes relations", () => {
  it("une relation sans rien de particulier est « disponible » ; la lacune est dite", async () => {
    const { root, me, amie } = await world()
    expect(await pastilles(root, me)).toEqual({ statuses: { [amie.personId]: "available" }, truncated: false })
  })

  it("une relation qui REÇOIT ou qui a LANCÉ un appel décroché est « en appel » ; parqué aussi", async () => {
    const { t, root, me, amie } = await world()
    const tiers = await enter(t, root, "tiers")
    // IC-04 : `tiers` n'est la relation de personne — amie et lui prennent les appels de tout le réseau.
    await callableByEveryone(t, amie, tiers)
    const callId = await connectedCall(root, tiers, amie)
    expect((await pastilles(root, me)).statuses[amie.personId]).toBe("in_call")
    await tiers.as.mutation(C.ringing.hold, { networkId: root, callId })
    expect((await pastilles(root, me)).statuses[amie.personId]).toBe("in_call")
    const autre = await enter(t, root, "autre")
    await connect(t, root, me, autre)
    tick()
    await connectedCall(root, autre, tiers)
    expect((await pastilles(root, me)).statuses[autre.personId]).toBe("in_call")
  })

  it("un appel qui ne fait que sonner ne compte pas ; un appel TERMINÉ non plus", async () => {
    const { t, root, me, amie } = await world()
    const tiers = await enter(t, root, "tiers")
    await callableByEveryone(t, amie)
    const callId = await ringingCall(root, tiers, amie)
    expect((await pastilles(root, me)).statuses[amie.personId]).toBe("available")
    await amie.as.mutation(C.lifecycle.join, { networkId: root, callId })
    expect((await pastilles(root, me)).statuses[amie.personId]).toBe("in_call")
    tick(6_000)
    await amie.as.mutation(C.lifecycle.leave, { networkId: root, callId })
    expect((await pastilles(root, me)).statuses[amie.personId]).toBe("available")
  })

  it("un « ne pas déranger » actif à l'instant fourni est « ne pas déranger » ; échu, « disponible »", async () => {
    const { t, root, me, amie } = await world()
    await setPrefs(t, amie, { dnd: { until: T0 + 60_000, startedAt: T0 } })
    expect((await pastilles(root, me, T0)).statuses[amie.personId]).toBe("dnd")
    expect((await pastilles(root, me, T0 + 120_000)).statuses[amie.personId]).toBe("available")
  })

  it("partage coupé : la relation est ABSENTE, pas « disponible »", async () => {
    const { t, root, me, amie } = await world()
    await setPrefs(t, amie, { sharePresence: false })
    expect((await pastilles(root, me)).statuses).toEqual({})
  })

  it("un compte qui n'est pas une relation n'apparaît jamais ; une demande encore en attente non plus", async () => {
    const { t, root, me } = await world()
    const inconnu = await enter(t, root, "inconnu")
    const demandeur = await enter(t, root, "demandeur")
    await t.run(async (ctx) => {
      const [low, high] = me.personId < demandeur.personId ? [me.personId, demandeur.personId] : [demandeur.personId, me.personId]
      await ctx.db.insert("connections", { networkId: root, personIdLow: low, personIdHigh: high, requestedByPersonId: demandeur.personId, recipientPersonId: me.personId, status: "requested", requestedAt: 1, updatedAt: 1 })
    })
    const statuses = (await pastilles(root, me)).statuses
    expect(statuses[inconnu.personId]).toBeUndefined()
    expect(statuses[demandeur.personId]).toBeUndefined()
  })

  it("une relation d'un autre réseau n'y est pas une relation ; un appel d'un autre réseau n'y compte pas", async () => {
    const { t, root, testClosed, me, amie } = await world()
    for (const person of [me, amie]) {
      await t.run(async (ctx) => ctx.db.insert("networkMemberships", { networkId: testClosed, personId: person.personId, status: "declaree", role: "member", joinedAt: 1, statusChangedAt: 1 }))
    }
    expect((await pastilles(testClosed, me)).statuses).toEqual({})
    await connect(t, testClosed, me, amie)
    const tiers = await enter(t, root, "tiers")
    await callableByEveryone(t, amie)
    await connectedCall(root, tiers, amie)
    expect((await pastilles(testClosed, me)).statuses[amie.personId]).toBe("available")
  })
})

// ═══════════════════════════════════════════════════════════════
// Battement et constat « hors ligne »
// ═══════════════════════════════════════════════════════════════

describe("heartbeat / setOffline — la présence d'un écran ouvert", () => {
  it("un battement pose « en ligne » ; fermer l'écran pose « hors ligne » tout de suite", async () => {
    const { t, root, me } = await world()
    await me.as.mutation(C.presence.heartbeat, { networkId: root })
    expect(await presenceRow(t, root, me)).toMatchObject({ status: "online", lastHeartbeat: T0 })
    tick(30_000)
    await me.as.mutation(C.presence.heartbeat, { networkId: root })
    expect((await presenceRow(t, root, me))?.lastHeartbeat).toBe(T0 + 30_000)
    await me.as.mutation(C.presence.setOffline, { networkId: root })
    expect((await presenceRow(t, root, me))?.status).toBe("offline")
  })

  it("le battement est borné en débit", async () => {
    const { root, me } = await world()
    for (let index = 0; index < 8; index += 1) await me.as.mutation(C.presence.heartbeat, { networkId: root })
    expect(await codeOf(me.as.mutation(C.presence.heartbeat, { networkId: root }))).toBe("rateLimited")
  })
})

describe("offlineHints — un constat, jamais une déduction", () => {
  it("une présence périmée rend « hors ligne » ; AUCUNE ligne = on ne sait pas = absent ; fraîche = absent", async () => {
    const { t, root, me, amie } = await world()
    expect(await hints(root, me)).toEqual([])
    await presenceAt(t, root, amie, T0 - 10 * 60_000)
    expect(await hints(root, me)).toEqual([amie.personId])
    await presenceAt(t, root, amie, T0)
    expect(await hints(root, me)).toEqual([])
  })

  it("un départ explicite rend « hors ligne » même si le dernier battement est frais", async () => {
    const { t, root, me, amie } = await world()
    await presenceAt(t, root, amie, T0, "offline")
    expect(await hints(root, me)).toEqual([amie.personId])
  })

  it("partage coupé : pas même une absence", async () => {
    const { t, root, me, amie } = await world()
    await presenceAt(t, root, amie, T0 - 10 * 60_000)
    await setPrefs(t, amie, { sharePresence: false })
    expect(await hints(root, me)).toEqual([])
  })
})

describe("cleanupStalePresence — le passage périodique", () => {
  it("une présence dont le battement s'est tu passe « hors ligne » ; une fraîche reste « en ligne »", async () => {
    const { t, root, me, amie } = await world()
    await presenceAt(t, root, amie, T0 - 10 * 60_000)
    await presenceAt(t, root, me, T0)
    await t.mutation(internal.modules.calls.presence.cleanupStalePresence, {})
    expect((await presenceRow(t, root, amie))?.status).toBe("offline")
    expect((await presenceRow(t, root, me))?.status).toBe("online")
  })
})

// ═══════════════════════════════════════════════════════════════
// Réglages
// ═══════════════════════════════════════════════════════════════

describe("getMine — défauts rendus sans jamais écrire", () => {
  it("rend les défauts documentés pour qui n'a jamais rien réglé, sans créer de ligne", async () => {
    const { t, me } = await world()
    expect(await me.as.query(C.preferences.getMine, { now: T0 })).toEqual({
      dnd: null,
      ringtone: { muted: false, vibrate: true },
      callWaiting: true,
      quickReplies: null,
      voicemailEnabled: true,
      autoMeetingDnd: null,
      sharePresence: true,
      pushIncoming: true,
      // IC-04 (décision du propriétaire du 9/11/2026) : mes relations seulement ; accusés de lecture actifs.
      outsideRelationsCalls: "silent",
      readReceipts: true,
      journalSeenAt: null,
      saved: false,
    })
    expect(await t.run(async (ctx) => ctx.db.query("callPreferences").take(5))).toEqual([])
  })

  it("un silence ÉCHU à l'instant fourni est rendu `null`, sans être nettoyé en base", async () => {
    const { t, me } = await world()
    await setPrefs(t, me, { dnd: { until: T0 + 60_000, startedAt: T0 } })
    expect((await me.as.query(C.preferences.getMine, { now: T0 + 120_000 })).dnd).toBeNull()
    expect((await t.run(async (ctx) => ctx.db.query("callPreferences").first()))?.dnd).toEqual({ until: T0 + 60_000, startedAt: T0 })
  })
})

describe("setDnd — pose et refus", () => {
  it("écrit, se relit, s'efface", async () => {
    const { me } = await world()
    expect(await me.as.mutation(C.preferences.setDnd, { until: T0 + 3_600_000 })).toEqual({ dnd: { until: T0 + 3_600_000, startedAt: T0 } })
    expect((await me.as.query(C.preferences.getMine, { now: T0 })).dnd).toEqual({ until: T0 + 3_600_000, startedAt: T0 })
    expect(await me.as.mutation(C.preferences.setDnd, { until: null })).toEqual({ dnd: null })
    expect((await me.as.query(C.preferences.getMine, { now: T0 })).dnd).toBeNull()
  })

  it("refuse un silence dans le passé, ou de plus de sept jours", async () => {
    const { me } = await world()
    expect(await ruleOf(me.as.mutation(C.preferences.setDnd, { until: T0 - 1 }))).toBe("CALL_DND_PAST")
    expect(await ruleOf(me.as.mutation(C.preferences.setDnd, { until: T0 + 8 * 24 * 3_600_000 }))).toBe("CALL_DND_TOO_LONG")
  })
})

describe("update — patch partiel", () => {
  it("ne détruit pas les autres champs déjà réglés", async () => {
    const { me } = await world()
    await me.as.mutation(C.preferences.update, { callWaiting: false })
    await me.as.mutation(C.preferences.update, { voicemailEnabled: false })
    const prefs = await me.as.query(C.preferences.getMine, { now: T0 })
    expect(prefs).toMatchObject({ callWaiting: false, voicemailEnabled: false, saved: true })
  })

  it("borne les réponses rapides en nombre et en longueur, retire les vides", async () => {
    const { me } = await world()
    await me.as.mutation(C.preferences.update, { quickReplies: ["  A  ", "", "A", "x".repeat(300), "B", "C", "D", "E", "F", "G"] })
    const replies = (await me.as.query(C.preferences.getMine, { now: T0 })).quickReplies
    expect(replies).toHaveLength(6)
    expect(replies?.[0]).toBe("A")
    expect(replies?.[1]).toHaveLength(120)
  })

  it("« hors de mes relations » vaut `silent` par défaut (IC-04) ; `ring` s'écrit et se relit, sans toucher aux autres", async () => {
    const { t, root, me } = await world()
    await me.as.mutation(C.preferences.update, { callWaiting: false })
    expect((await me.as.query(C.preferences.getMine, { now: T0 })).outsideRelationsCalls).toBe("silent")
    await me.as.mutation(C.preferences.update, { outsideRelationsCalls: "ring" })
    expect(await me.as.query(C.preferences.getMine, { now: T0 })).toMatchObject({ outsideRelationsCalls: "ring", callWaiting: false })
    const autre = await enter(t, root, "autre")
    expect((await autre.as.query(C.preferences.getMine, { now: T0 })).outsideRelationsCalls).toBe("silent")
  })

  it("régler est borné en débit", async () => {
    const { me } = await world()
    for (let index = 0; index < 20; index += 1) await me.as.mutation(C.preferences.update, { callWaiting: index % 2 === 0 })
    expect(await codeOf(me.as.mutation(C.preferences.update, { callWaiting: true }))).toBe("rateLimited")
  })
})

describe("markJournalSeen et cloisonnement", () => {
  it("pose `journalSeenAt` à maintenant ; les réglages de l'un ne fuient pas chez l'autre", async () => {
    const { me, amie } = await world()
    expect(await me.as.mutation(C.preferences.markJournalSeen, {})).toEqual({ journalSeenAt: T0 })
    await me.as.mutation(C.preferences.setDnd, { until: T0 + 60_000 })
    expect((await me.as.query(C.preferences.getMine, { now: T0 })).journalSeenAt).toBe(T0)
    expect(await amie.as.query(C.preferences.getMine, { now: T0 })).toMatchObject({ dnd: null, journalSeenAt: null, saved: false })
  })
})
