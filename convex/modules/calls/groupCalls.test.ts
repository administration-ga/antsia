// @vitest-environment edge-runtime
// Dupliqué de socle/convex/modules/iappel/groupCalls.test.ts (avec socle/convex/modules/iappel/ringExpiry.test.ts ; socle/convex/tests/callCapacitySettings.test.ts ; les cas d'appel de fil de socle/convex/modules/reseauPersonnel/groupes.test.ts) @ ad2e7fdc2 — adaptations : personnes et réseaux ; appel ad hoc SANS organisation (verrous V08 à V17 levés : des invités joignables du réseau, plus des collègues d'une administration) ; plafond constant de onze (configuration d'organisation et exemption du back-office retirées avec leur code) ; présence lue sur les lignes de participation ; codes et règles au lieu des libellés ; Web Push → la décision seule (PA5) ; tests neufs : blocage d'un invité refusé à chaque porte (D13), « hors de mes relations » appliqué en ad hoc et pas depuis un fil, journal de l'invité classé d'après SON ticket, un membre du fil hors sélection rejoint l'appel en cours, départ et retrait du fil qui sortent de l'appel, suppression du fil qui le termine, fil et appel d'un autre réseau introuvables. ; IC-04 : les personnes de ces scénarios ont élargi « qui peut m'appeler » à tout le réseau (`enterCallable`) — le défaut « mes relations seulement » a ses tests (`settings.test.ts`).
/**
 * APPELS DE GROUPE — un appel, pas une réunion :
 *  1. ça sonne chez chaque invité ADMIS, jamais chez l'hôte ; l'admission se joue
 *     PAR LIGNE ;
 *  2. un refus n'est pas la fin de l'appel ; quitter n'est pas raccrocher pour tous ;
 *  3. chaque invité décroche quand il veut, dans la limite des places (IC-04) ;
 *  4. un appel lancé depuis un fil obéit au fil : un membre parti en sort.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { api } from "../../_generated/api"
import type { Id } from "../../_generated/dataModel"
import { testConvex } from "../../test.setup"
import {
  bellOf,
  block,
  C,
  callDoc,
  codeOf,
  connectedCall,
  enterCallable,
  groupThread,
  journalOf,
  type Person,
  ringingCall,
  ringingFor,
  rowsOf,
  ruleOf,
  seed,
  setPrefs,
  T0,
  ticketsOf,
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

async function cast(count: number) {
  const t = testConvex()
  const { root, testClosed } = await seed(t)
  const names = ["alice", "bob", "carla", "dan", "eve", "fred", "gael", "hugo", "ines", "jules", "karl", "lea", "marc", "nina"]
  const people: Person[] = []
  for (const name of names.slice(0, count)) people.push(await enterCallable(t, root, name))
  return { t, root, testClosed, people }
}

async function adHoc(networkId: Id<"networks">, host: Person, invitees: Person[], mediaType?: "audio" | "video") {
  return await host.as.mutation(C.groupCalls.startAdHoc, { networkId, personIds: invitees.map((p) => p.personId), ...(mediaType ? { mediaType } : {}) })
}

async function grid(networkId: Id<"networks">, reader: Person, callId: Id<"calls">) {
  return await reader.as.query(C.groupCalls.listParticipants, { networkId, callId })
}

async function states(networkId: Id<"networks">, reader: Person, callId: Id<"calls">) {
  const view = await grid(networkId, reader, callId)
  return Object.fromEntries((view?.participants ?? []).map((p) => [p.label.displayName, p.state]))
}

// ═══════════════════════════════════════════════════════════════
// Lancer — ad hoc
// ═══════════════════════════════════════════════════════════════

describe("startAdHoc — des personnes choisies une à une, sans organisation", () => {
  it("pose l'appel, ses lignes et ses tickets : ça sonne chez les invités, jamais chez l'hôte", async () => {
    const { t, root, people } = await cast(3)
    const [alice, bob, carla] = people as [Person, Person, Person]
    const placed = await adHoc(root, alice, [bob, carla], "video")
    expect(placed).toMatchObject({ invited: 2, unavailable: [], mediaType: "video" })
    expect(await callDoc(t, placed.callId)).toMatchObject({ kind: "group", status: "active", callStatus: "ringing", maxParticipants: 11, mediaType: "video" })
    expect((await ticketsOf(t, placed.callId)).map((ticket) => ticket.status)).toEqual(["ringing", "ringing"])
    for (const invitee of [bob, carla]) expect((await ringingFor(root, invitee)).map((row) => row.kind)).toEqual(["group"])
    expect(await ringingFor(root, alice)).toEqual([])
  })

  it("un seul correspondant (ou soi-même compté deux fois) : c'est un tête-à-tête", async () => {
    const { root, people } = await cast(2)
    const [alice, bob] = people as [Person, Person]
    expect(await ruleOf(adHoc(root, alice, [bob]))).toBe("GROUP_CALL_TOO_FEW")
    expect(await ruleOf(adHoc(root, alice, [bob, alice, bob]))).toBe("GROUP_CALL_TOO_FEW")
  })

  it("au-delà de onze, appelant compris : la règle nomme le plafond", async () => {
    const { root, people } = await cast(13)
    const [alice, ...others] = people as [Person, ...Person[]]
    expect(await ruleOf(adHoc(root, alice, others.slice(0, 11)))).toBe("GROUP_CALL_FULL")
    expect((await adHoc(root, alice, others.slice(0, 10))).invited).toBe(10)
  })

  it("un invité injoignable ou BLOQUÉ : le refus indistinct, sans dire lequel (D13)", async () => {
    const { t, root, people } = await cast(4)
    const [alice, bob, carla, dan] = people as [Person, Person, Person, Person]
    await block(t, root, dan, alice)
    expect(await codeOf(adHoc(root, alice, [bob, dan]))).toBe("notFound")
    await carla.as.mutation(api.modules.people.profile.withdrawMyProfile, {})
    expect(await codeOf(adHoc(root, alice, [bob, carla]))).toBe("notFound")
  })
})

describe("l'admission se joue PAR LIGNE", () => {
  it("un « ne pas déranger » écarte UN invité (indisponible, avec sa raison) ; l'appel part chez les autres", async () => {
    const { t, root, people } = await cast(3)
    const [alice, bob, carla] = people as [Person, Person, Person]
    await setPrefs(t, carla, { dnd: { until: T0 + 60_000, startedAt: T0 } })
    const placed = await adHoc(root, alice, [bob, carla])
    expect(placed.unavailable).toEqual([{ personId: carla.personId, reason: "dnd" }])
    expect(await ringingFor(root, carla)).toEqual([])
    expect(await ringingFor(root, bob)).toHaveLength(1)
    expect(await states(root, alice, placed.callId)).toEqual({ alice: "host", bob: "ringing", carla: "unavailable" })
  })

  it("« hors de mes relations » vaut en ad hoc ; depuis un fil, le fil vaut consentement", async () => {
    const { t, root, people } = await cast(3)
    const [alice, bob, carla] = people as [Person, Person, Person]
    await setPrefs(t, carla, { outsideRelationsCalls: "silent" })
    expect((await adHoc(root, alice, [bob, carla])).unavailable).toEqual([{ personId: carla.personId, reason: "outside_relations" }])
    tick(200_000)
    // Le fil : alice y est en relation avec chacun, mais bob ne l'est pas avec carla — c'est bob qui lance.
    const threadId = await groupThread(t, root, alice, [bob, carla])
    const fromThread = await bob.as.mutation(C.groupCalls.startFromThread, { networkId: root, threadId })
    expect(fromThread.unavailable).toEqual([])
  })
})

// ═══════════════════════════════════════════════════════════════
// Refuser, quitter, décrocher
// ═══════════════════════════════════════════════════════════════

describe("un REFUS n'est pas la fin de l'appel", () => {
  it("le refus d'un invité laisse l'appel vivant pour les autres ; refuser deux fois ne réécrit rien", async () => {
    const { t, root, people } = await cast(3)
    const [alice, bob, carla] = people as [Person, Person, Person]
    const { callId } = await adHoc(root, alice, [bob, carla])
    expect(await bob.as.mutation(C.groupCalls.decline, { networkId: root, callId })).toEqual({ callId, ended: false })
    expect(await bob.as.mutation(C.groupCalls.decline, { networkId: root, callId })).toEqual({ callId, ended: false })
    expect((await callDoc(t, callId))?.status).toBe("active")
    expect(await ringingFor(root, carla)).toHaveLength(1)
    expect(await states(root, alice, callId)).toMatchObject({ bob: "declined" })
  })

  it("l'autre porte (`declineCall`) ne raccroche pas non plus — même si l'appel est déjà en cours", async () => {
    const { t, root, people } = await cast(4)
    const [alice, bob, carla, dan] = people as [Person, Person, Person, Person]
    const { callId } = await adHoc(root, alice, [bob, carla, dan])
    await bob.as.mutation(C.lifecycle.join, { networkId: root, callId })
    expect(await carla.as.mutation(C.lifecycle.declineCall, { networkId: root, callId })).toEqual({ ended: false })
    expect((await callDoc(t, callId))?.status).toBe("active")
  })

  it("un tiers jamais convié ne peut pas refuser l'appel des autres", async () => {
    const { root, people } = await cast(4)
    const [alice, bob, carla, dan] = people as [Person, Person, Person, Person]
    const { callId } = await adHoc(root, alice, [bob, carla])
    expect(await codeOf(dan.as.mutation(C.groupCalls.decline, { networkId: root, callId }))).toBe("notFound")
  })
})

describe("QUITTER n'est pas raccrocher pour tout le monde", () => {
  it("le premier qui part laisse l'appel ouvert ; il finit quand le DERNIER présent s'en va", async () => {
    const { t, root, people } = await cast(3)
    const [alice, bob, carla] = people as [Person, Person, Person]
    const { callId } = await adHoc(root, alice, [bob, carla])
    await bob.as.mutation(C.lifecycle.join, { networkId: root, callId })
    await carla.as.mutation(C.lifecycle.join, { networkId: root, callId })
    tick()
    await bob.as.mutation(C.lifecycle.leave, { networkId: root, callId })
    expect((await callDoc(t, callId))?.status).toBe("active")
    await alice.as.mutation(C.lifecycle.leave, { networkId: root, callId })
    expect((await callDoc(t, callId))?.status).toBe("active")
    await carla.as.mutation(C.lifecycle.leave, { networkId: root, callId })
    expect(await callDoc(t, callId)).toMatchObject({ status: "ended", callStatus: "ended", endReason: "normal" })
  })

  it("l'hôte qui renonce avant qu'on décroche annule l'appel : les téléphones qui sonnaient sont MANQUÉS, jamais « refusés »", async () => {
    const { t, root, people } = await cast(3)
    const [alice, bob, carla] = people as [Person, Person, Person]
    const { callId } = await adHoc(root, alice, [bob, carla])
    await alice.as.mutation(C.lifecycle.leave, { networkId: root, callId })
    expect((await callDoc(t, callId))?.status).toBe("ended")
    expect((await ticketsOf(t, callId)).map((ticket) => ticket.status)).toEqual(["missed", "missed"])
    expect((await rowsOf(t, callId)).every((row) => row.leftAt !== undefined)).toBe(true)
    expect(await ringingFor(root, bob)).toEqual([])
  })
})

describe("le SECOND invité décroche après le premier", () => {
  it("pas de « ligne prise » à plusieurs ; décrocher éteint la sonnerie de CELUI qui décroche, et de lui seul", async () => {
    const { t, root, people } = await cast(3)
    const [alice, bob, carla] = people as [Person, Person, Person]
    const { callId } = await adHoc(root, alice, [bob, carla])
    expect((await bob.as.mutation(C.lifecycle.join, { networkId: root, callId })).callStatus).toBe("connected")
    expect(await ringingFor(root, bob)).toEqual([])
    expect(await ringingFor(root, carla)).toHaveLength(1)
    await carla.as.mutation(C.lifecycle.join, { networkId: root, callId })
    expect(await states(root, alice, callId)).toEqual({ alice: "host", bob: "connected", carla: "connected" })
    expect((await callDoc(t, callId))?.answeredByPersonId).toBe(bob.personId)
  })

  it("un tiers jamais convié reste dehors", async () => {
    const { root, people } = await cast(4)
    const [alice, bob, carla, dan] = people as [Person, Person, Person, Person]
    const { callId } = await adHoc(root, alice, [bob, carla])
    expect(await codeOf(dan.as.mutation(C.lifecycle.join, { networkId: root, callId }))).toBe("notFound")
  })
})

describe("listParticipants — la grille", () => {
  it("dit l'état de chacun, désigne l'appelant et moi ; un tiers n'apprend rien ; un tête-à-tête n'a pas de grille", async () => {
    const { root, people } = await cast(4)
    const [alice, bob, carla, dan] = people as [Person, Person, Person, Person]
    const { callId } = await adHoc(root, alice, [bob, carla])
    await bob.as.mutation(C.lifecycle.join, { networkId: root, callId })
    const view = await grid(root, carla, callId)
    expect(view?.participants.map((p) => ({ name: p.label.displayName, state: p.state, isCaller: p.isCaller, isMe: p.isMe }))).toEqual([
      { name: "alice", state: "host", isCaller: true, isMe: false },
      { name: "bob", state: "connected", isCaller: false, isMe: false },
      { name: "carla", state: "ringing", isCaller: false, isMe: true },
    ])
    expect(view?.summary).toMatchObject({ connected: 2, ringing: 1, invited: 3, reserved: 3, remaining: 8 })
    expect(view?.maxParticipants).toBe(11)
    expect(await codeOf(grid(root, dan, callId))).toBe("notFound")
    tick()
    const direct = await ringingCall(root, dan, bob)
    expect(await grid(root, dan, direct)).toBeNull()
  })

  it("la sonnerie d'un appel de sept montre quatre visages, ni l'appelant ni celui qui lit", async () => {
    const { root, people } = await cast(7)
    const [alice, ...others] = people as [Person, ...Person[]]
    await adHoc(root, alice, others)
    const [ringing] = await ringingFor(root, others[0]!)
    expect(ringing?.group?.memberCount).toBe(7)
    expect(ringing?.group?.invitees.map((p) => p.label.displayName)).toEqual(["carla", "dan", "eve", "fred"])
    expect(ringing?.caller.label.displayName).toBe("alice")
  })
})

describe("le JOURNAL garde la trace d'un appel de groupe reçu — classé d'après MON ticket", () => {
  it("l'invité le retrouve : entrant s'il a décroché, refusé, écarté par ses réglages, ou manqué", async () => {
    const { t, root, people } = await cast(5)
    const [alice, bob, carla, dan, eve] = people as [Person, Person, Person, Person, Person]
    await setPrefs(t, eve, { dnd: { until: T0 + 60_000, startedAt: T0 } })
    const { callId } = await adHoc(root, alice, [bob, carla, dan, eve])
    await bob.as.mutation(C.lifecycle.join, { networkId: root, callId })
    await carla.as.mutation(C.groupCalls.decline, { networkId: root, callId })
    tick()
    await bob.as.mutation(C.lifecycle.leave, { networkId: root, callId })
    await alice.as.mutation(C.lifecycle.leave, { networkId: root, callId })
    const categoryOf = async (person: Person) => {
      const [row] = await journalOf(root, person)
      return { category: row?.category, reason: row?.reason, kind: row?.kind }
    }
    expect(await categoryOf(bob)).toEqual({ category: "incoming", reason: null, kind: "group" })
    expect(await categoryOf(carla)).toEqual({ category: "declined", reason: null, kind: "group" })
    expect(await categoryOf(dan)).toEqual({ category: "missed", reason: null, kind: "group" })
    expect(await categoryOf(eve)).toEqual({ category: "auto_declined", reason: "dnd", kind: "group" })
    expect((await journalOf(root, alice))[0]).toMatchObject({ callId, category: "outgoing", createdByMe: true, group: { caller: { personId: alice.personId } } })
  })
})

// ═══════════════════════════════════════════════════════════════
// Depuis un fil
// ═══════════════════════════════════════════════════════════════

describe("startFromThread — l'appel d'un fil de groupe", () => {
  it("fait sonner les membres vivants, inscrit `call_started` dans le fil, et la fiche du fil le montre", async () => {
    const { t, root, people } = await cast(3)
    const [alice, bob, carla] = people as [Person, Person, Person]
    const threadId = await groupThread(t, root, alice, [bob, carla])
    const started = await alice.as.mutation(C.groupCalls.startFromThread, { networkId: root, threadId, mediaType: "video" })
    expect(started).toMatchObject({ alreadyActive: false, mediaType: "video", unavailable: [] })
    expect((await callDoc(t, started.callId))?.groupThreadId).toBe(threadId)
    for (const member of [bob, carla]) expect(await ringingFor(root, member)).toMatchObject([{ callId: started.callId, threadId }])
    const messages = (await bob.as.query(api.modules.groups.messages.paginateGroupMessages, { networkId: root, threadId, paginationOpts: { numItems: 50, cursor: null } })).page
    expect(messages.find((m) => m.event === "call_started")?.callId).toBe(started.callId)
    expect((await bob.as.query(api.modules.groups.threads.getGroupThread, { networkId: root, threadId })).activeCall).toEqual({ callId: started.callId, mediaType: "video" })
    expect(await bob.as.query(C.groupCalls.activeForThread, { networkId: root, threadId })).toMatchObject({ callId: started.callId, joined: false })
  })

  it("le second départ REJOINT l'appel en cours ; un membre hors de la sélection y reçoit sa ligne", async () => {
    const { t, root, people } = await cast(4)
    const [alice, bob, carla, dan] = people as [Person, Person, Person, Person]
    const threadId = await groupThread(t, root, alice, [bob, carla, dan])
    const first = await alice.as.mutation(C.groupCalls.startFromThread, { networkId: root, threadId, personIds: [bob.personId, carla.personId] })
    const second = await dan.as.mutation(C.groupCalls.startFromThread, { networkId: root, threadId })
    expect(second).toMatchObject({ callId: first.callId, alreadyActive: true })
    expect((await dan.as.mutation(C.lifecycle.join, { networkId: root, callId: first.callId })).roomName).toBe(first.roomName)
  })

  it("la sélection est re-contrôlée : un ancien membre est inconnu ; trop peu ou trop de personnes, la règle le dit", async () => {
    const { t, root, people } = await cast(4)
    const [alice, bob, carla, dan] = people as [Person, Person, Person, Person]
    const threadId = await groupThread(t, root, alice, [bob, carla])
    expect(await codeOf(alice.as.mutation(C.groupCalls.startFromThread, { networkId: root, threadId, personIds: [bob.personId, dan.personId] }))).toBe("notFound")
    expect(await ruleOf(alice.as.mutation(C.groupCalls.startFromThread, { networkId: root, threadId, personIds: [bob.personId] }))).toBe("GROUP_CALL_TOO_FEW")
  })

  it("un fil plus grand que l'appel, sans sélection : la règle dit combien choisir", async () => {
    const { t, root, people } = await cast(13)
    const [alice, ...others] = people as [Person, ...Person[]]
    const threadId = await groupThread(t, root, alice, others.slice(0, 11))
    const refused = await ruleOf(alice.as.mutation(C.groupCalls.startFromThread, { networkId: root, threadId }))
    expect(refused).toBe("GROUP_CALL_THREAD_TOO_LARGE")
    const chosen = others.slice(0, 11).map((p) => p.personId)
    expect(await ruleOf(alice.as.mutation(C.groupCalls.startFromThread, { networkId: root, threadId, personIds: chosen }))).toBe("GROUP_CALL_SELECTION_TOO_LARGE")
    expect((await alice.as.mutation(C.groupCalls.startFromThread, { networkId: root, threadId, personIds: chosen.slice(0, 10) })).alreadyActive).toBe(false)
  })

  it("un membre qui QUITTE le fil sort de l'appel en cours ; un ancien membre n'y entre plus", async () => {
    const { t, root, people } = await cast(4)
    const [alice, bob, carla, dan] = people as [Person, Person, Person, Person]
    const threadId = await groupThread(t, root, alice, [bob, carla, dan])
    const { callId } = await alice.as.mutation(C.groupCalls.startFromThread, { networkId: root, threadId })
    await bob.as.mutation(C.lifecycle.join, { networkId: root, callId })
    await bob.as.mutation(api.modules.groups.threads.leaveGroup, { networkId: root, threadId })
    expect(await states(root, alice, callId)).toMatchObject({ bob: "left" })
    expect(await codeOf(bob.as.mutation(C.lifecycle.join, { networkId: root, callId }))).toBe("notFound")
    // Retiré pendant que son téléphone sonne : il se tait.
    await alice.as.mutation(api.modules.groups.threads.removeGroupMember, { networkId: root, threadId, memberPersonId: carla.personId })
    expect(await ringingFor(root, carla)).toEqual([])
    expect((await callDoc(t, callId))?.status).toBe("active")
  })

  it("SUPPRIMER le fil termine son appel avant que le fil ne disparaisse", async () => {
    const { t, root, people } = await cast(3)
    const [alice, bob, carla] = people as [Person, Person, Person]
    const threadId = await groupThread(t, root, alice, [bob, carla])
    const { callId } = await alice.as.mutation(C.groupCalls.startFromThread, { networkId: root, threadId })
    await bob.as.mutation(C.lifecycle.join, { networkId: root, callId })
    await alice.as.mutation(api.modules.groups.cascade.deleteGroup, { networkId: root, threadId })
    expect(await callDoc(t, callId)).toMatchObject({ status: "ended", callStatus: "ended" })
    expect((await rowsOf(t, callId)).every((row) => row.leftAt !== undefined)).toBe(true)
  })

  it("un fil d'un autre réseau est introuvable", async () => {
    const { t, root, testClosed, people } = await cast(3)
    const [alice, bob, carla] = people as [Person, Person, Person]
    const threadId = await groupThread(t, root, alice, [bob, carla])
    await t.run(async (ctx) => ctx.db.insert("networkMemberships", { networkId: testClosed, personId: alice.personId, status: "declaree", role: "member", joinedAt: 1, statusChangedAt: 1 }))
    expect(await codeOf(alice.as.mutation(C.groupCalls.startFromThread, { networkId: testClosed, threadId }))).toBe("notFound")
  })
})

// ═══════════════════════════════════════════════════════════════
// Ajouter en cours d'appel — promotion, plafond, idempotence
// ═══════════════════════════════════════════════════════════════

describe("addInvitee — l'ajouté SONNE, et un tête-à-tête se promeut honnêtement", () => {
  it("1:1 connecté + ajout : tickets rétroactifs, l'ajouté sonne, la grille ne ment pas, il peut décrocher", async () => {
    const { t, root, people } = await cast(3)
    const [alice, bob, carla] = people as [Person, Person, Person]
    const callId = await connectedCall(root, alice, bob)
    expect(await alice.as.mutation(C.groupCalls.addInvitee, { networkId: root, callId, personId: carla.personId })).toMatchObject({ promoted: true, admitted: true, alreadyIn: false })
    expect(await callDoc(t, callId)).toMatchObject({ kind: "group", maxParticipants: 11 })
    expect(await states(root, alice, callId)).toEqual({ alice: "host", bob: "connected", carla: "ringing" })
    await carla.as.mutation(C.lifecycle.join, { networkId: root, callId })
    expect((await ticketsOf(t, callId)).find((ticket) => ticket.personId === carla.personId)?.status).toBe("joined")
  })

  it("le destinataire d'un tête-à-tête qui sonne ENCORE survit à la promotion", async () => {
    const { root, people } = await cast(3)
    const [alice, bob, carla] = people as [Person, Person, Person]
    const callId = await ringingCall(root, alice, bob)
    await alice.as.mutation(C.groupCalls.addInvitee, { networkId: root, callId, personId: carla.personId })
    expect((await ringingFor(root, bob)).map((row) => ({ callId: row.callId, kind: row.kind, since: row.ringingSince }))).toEqual([{ callId, kind: "group", since: T0 }])
  })

  it("double ajout pendant que ça sonne : `alreadyIn`, un seul ticket ; re-sonner quelqu'un qui avait refusé", async () => {
    const { t, root, people } = await cast(4)
    const [alice, bob, carla, dan] = people as [Person, Person, Person, Person]
    const { callId } = await adHoc(root, alice, [bob, carla])
    await alice.as.mutation(C.groupCalls.addInvitee, { networkId: root, callId, personId: dan.personId })
    expect((await alice.as.mutation(C.groupCalls.addInvitee, { networkId: root, callId, personId: dan.personId })).alreadyIn).toBe(true)
    expect((await ticketsOf(t, callId)).filter((ticket) => ticket.personId === dan.personId)).toHaveLength(1)
    await dan.as.mutation(C.groupCalls.decline, { networkId: root, callId })
    tick()
    expect((await alice.as.mutation(C.groupCalls.addInvitee, { networkId: root, callId, personId: dan.personId })).admitted).toBe(true)
    expect((await ticketsOf(t, callId)).find((ticket) => ticket.personId === dan.personId)).toMatchObject({ status: "ringing", invitedAt: T0 + 1000 })
  })

  it("un « ne pas déranger » écarte SA ligne : l'appel continue, la grille dit « indisponible »", async () => {
    const { t, root, people } = await cast(4)
    const [alice, bob, carla, dan] = people as [Person, Person, Person, Person]
    await setPrefs(t, dan, { dnd: { until: T0 + 60_000, startedAt: T0 } })
    const { callId } = await adHoc(root, alice, [bob, carla])
    expect(await alice.as.mutation(C.groupCalls.addInvitee, { networkId: root, callId, personId: dan.personId })).toMatchObject({ admitted: false, reason: "dnd" })
    expect(await states(root, alice, callId)).toMatchObject({ dan: "unavailable" })
  })

  it("un tête-à-tête n'est PAS promu pour un ajout écarté", async () => {
    const { t, root, people } = await cast(3)
    const [alice, bob, carla] = people as [Person, Person, Person]
    await setPrefs(t, carla, { dnd: { until: T0 + 60_000, startedAt: T0 } })
    const callId = await connectedCall(root, alice, bob)
    expect(await alice.as.mutation(C.groupCalls.addInvitee, { networkId: root, callId, personId: carla.personId })).toMatchObject({ promoted: false, admitted: false })
    expect((await callDoc(t, callId))?.kind).toBe("direct")
  })

  it("un tiers hors de l'appel, un appel terminé, un bloqué, un non-membre du fil : le même refus", async () => {
    const { t, root, people } = await cast(5)
    const [alice, bob, carla, dan, eve] = people as [Person, Person, Person, Person, Person]
    const { callId } = await adHoc(root, alice, [bob, carla])
    expect(await codeOf(dan.as.mutation(C.groupCalls.addInvitee, { networkId: root, callId, personId: eve.personId }))).toBe("notFound")
    await block(t, root, eve, alice)
    expect(await codeOf(alice.as.mutation(C.groupCalls.addInvitee, { networkId: root, callId, personId: eve.personId }))).toBe("notFound")
    await alice.as.mutation(C.lifecycle.leave, { networkId: root, callId })
    expect(await codeOf(alice.as.mutation(C.groupCalls.addInvitee, { networkId: root, callId, personId: dan.personId }))).toBe("notFound")
    tick(200_000)
    const threadId = await groupThread(t, root, alice, [bob, carla], "cle-2")
    const fromThread = await alice.as.mutation(C.groupCalls.startFromThread, { networkId: root, threadId })
    expect(await codeOf(alice.as.mutation(C.groupCalls.addInvitee, { networkId: root, callId: fromThread.callId, personId: dan.personId }))).toBe("notFound")
  })

  it("on ne s'ajoute pas soi-même", async () => {
    const { root, people } = await cast(3)
    const [alice, bob, carla] = people as [Person, Person, Person]
    const { callId } = await adHoc(root, alice, [bob, carla])
    expect(await ruleOf(alice.as.mutation(C.groupCalls.addInvitee, { networkId: root, callId, personId: alice.personId }))).toBe("GROUP_CALL_ALREADY_IN")
  })
})

describe("IC-04 — un refus LIBÈRE la place, une sonnerie la GARDE", () => {
  async function fullCall() {
    const { t, root, people } = await cast(13)
    const [alice, ...others] = people as [Person, ...Person[]]
    const invited = others.slice(0, 10)
    const { callId } = await adHoc(root, alice, invited)
    return { t, root, alice, invited, extra: others.slice(10), callId }
  }

  it("dix sonnent : un douzième est refusé, en nommant le plafond", async () => {
    const { root, alice, extra, callId } = await fullCall()
    expect(await ruleOf(alice.as.mutation(C.groupCalls.addInvitee, { networkId: root, callId, personId: extra[0]!.personId }))).toBe("GROUP_CALL_FULL")
  })

  it("un refus libère sa place : un autre est admis ; le refusé qui revient trouve la chaise donnée", async () => {
    const { root, alice, invited, extra, callId } = await fullCall()
    const quitter = invited[0]!
    await quitter.as.mutation(C.groupCalls.decline, { networkId: root, callId })
    expect((await alice.as.mutation(C.groupCalls.addInvitee, { networkId: root, callId, personId: extra[0]!.personId })).admitted).toBe(true)
    expect(await ruleOf(quitter.as.mutation(C.lifecycle.join, { networkId: root, callId }))).toBe("GROUP_CALL_FULL")
  })

  it("tant que la place n'a pas été redonnée, le refusé peut encore décrocher", async () => {
    const { root, invited, callId } = await fullCall()
    const hesitant = invited[0]!
    await hesitant.as.mutation(C.groupCalls.decline, { networkId: root, callId })
    expect((await hesitant.as.mutation(C.lifecycle.join, { networkId: root, callId })).callStatus).toBe("connected")
  })
})

describe("la sonnerie d'un invité s'éteint au terme de SA fenêtre", () => {
  it("au bout de deux minutes, qui n'a pas décroché est MANQUÉ et libère sa place ; qui a décroché reste en ligne", async () => {
    const { t, root, people } = await cast(3)
    const [alice, bob, carla] = people as [Person, Person, Person]
    const { callId } = await adHoc(root, alice, [bob, carla])
    await bob.as.mutation(C.lifecycle.join, { networkId: root, callId })
    await t.finishAllScheduledFunctions(vi.runAllTimers)
    expect(await states(root, alice, callId)).toEqual({ alice: "host", bob: "connected", carla: "missed" })
    expect(await ringingFor(root, carla)).toEqual([])
    expect((await callDoc(t, callId))?.status).toBe("active")
  })

  it("un ticket re-sonné depuis n'est pas éteint par l'ancien job", async () => {
    const { t, root, people } = await cast(4)
    const [alice, bob, carla, dan] = people as [Person, Person, Person, Person]
    const { callId } = await adHoc(root, alice, [bob, carla, dan])
    await bob.as.mutation(C.lifecycle.join, { networkId: root, callId })
    await dan.as.mutation(C.groupCalls.decline, { networkId: root, callId })
    vi.advanceTimersByTime(100_000)
    tick(100_000)
    await alice.as.mutation(C.groupCalls.addInvitee, { networkId: root, callId, personId: dan.personId })
    // L'ancien job (fenêtre de T0) s'exécute : il ne doit pas éteindre le ticket re-sonné.
    vi.advanceTimersByTime(30_000)
    await t.finishInProgressScheduledFunctions()
    expect((await ticketsOf(t, callId)).find((ticket) => ticket.personId === dan.personId)?.status).toBe("ringing")
  })
})

describe("la cloche ne sonne pas pour un appel de groupe", () => {
  it("un invité écarté par son silence n'est pas notifié — l'hôte le voit dans la grille", async () => {
    const { t, root, people } = await cast(3)
    const [alice, bob, carla] = people as [Person, Person, Person]
    await setPrefs(t, carla, { dnd: { until: T0 + 60_000, startedAt: T0 } })
    await adHoc(root, alice, [bob, carla])
    expect(await bellOf(root, carla)).toEqual([])
  })
})
