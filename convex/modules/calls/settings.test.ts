// @vitest-environment edge-runtime
/**
 * IC-04 — les RÉGLAGES iCom de la personne, et l'effet serveur de chacun.
 *
 * Décision du propriétaire (9/11/2026) : « Qui peut m'appeler par défaut : mes relations
 * seulement ; l'appel d'une personne non reliée ne sonne pas, il est inscrit au journal ;
 * chacun peut l'élargir. » Règle de reprise : qui n'a JAMAIS réglé ce choix (aucune ligne, ou
 * une ligne sans ce champ) suit le défaut ; un « tout le monde » posé est gardé.
 *
 * Chaque réglage de la rubrique est posé ici par sa mutation PUBLIQUE (`update`, `setDnd`),
 * jamais en base : un interrupteur affiché doit avoir un effet constaté.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { Id } from "../../_generated/dataModel"
import { testConvex } from "../../test.setup"
import {
  bellOf,
  C,
  call,
  codeOf,
  connect,
  connectedCall,
  enter,
  groupThread,
  journalOf,
  type Person,
  ringingFor,
  ruleOf,
  seed,
  T0,
  type T,
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

/** Trois personnes du réseau racine, AUCUN réglage posé ; Awa et Ben sont reliés, Chloé n'est la relation de personne. */
async function world() {
  const t = testConvex()
  const { root } = await seed(t)
  const awa = await enter(t, root, "awa")
  const ben = await enter(t, root, "ben")
  const chloe = await enter(t, root, "chloe")
  await connect(t, root, awa, ben)
  return { t, root, awa, ben, chloe }
}

async function preferencesRows(t: T, person: Person) {
  return await t.run(async (ctx) =>
    ctx.db
      .query("callPreferences")
      .withIndex("by_person", (q) => q.eq("personId", person.personId))
      .take(2),
  )
}

async function storedBlob(t: T): Promise<Id<"_storage">> {
  return await t.run(async (ctx) => await ctx.storage.store(new Blob(["voice"], { type: "audio/webm" })))
}

describe("IC-04 — qui peut m'appeler : mes relations seulement, par défaut", () => {
  it("sans aucun réglage, l'appel d'une personne non reliée ne sonne pas : inscrit au journal de l'appelé, sans cloche ; l'appelant lit un appel sans réponse, sans messagerie vocale", async () => {
    const { t, root, ben, chloe } = await world()
    const placed = await call(root, chloe, ben)
    expect(placed).toMatchObject({ admitted: false, reason: "outside_relations", voicemailOffered: false, calleePersonId: ben.personId })
    // Rien ne sonne chez Ben, aucune cloche ; l'appel ne peut pas être mis à sonner (aucune poussée d'appel entrant n'en part).
    expect(await ringingFor(root, ben)).toEqual([])
    expect(await bellOf(root, ben)).toEqual([])
    expect(await codeOf(chloe.as.mutation(C.lifecycle.setCallRinging, { networkId: root, callId: placed.callId }))).toBe("notFound")
    // Le journal de l'appelé dit pourquoi son téléphone n'a pas sonné…
    expect(await journalOf(root, ben)).toEqual([expect.objectContaining({ callId: placed.callId, category: "auto_declined", reason: "outside_relations", createdByMe: false })])
    // … celui de l'appelante, un appel sans réponse : le réglage de Ben ne s'y lit pas.
    expect(await journalOf(root, chloe)).toEqual([expect.objectContaining({ callId: placed.callId, category: "missed", reason: null, createdByMe: true })])
    // Aucun message vocal : ce serait le même appel sous un autre nom.
    expect(await ruleOf(chloe.as.mutation(C.voicemail.leave, { networkId: root, callId: placed.callId, storageId: await storedBlob(t), durationMs: 1_000 }))).toBe("VOICEMAIL_DISABLED")
    // Lire le défaut n'a rien écrit.
    expect(await preferencesRows(t, ben)).toEqual([])
  })

  it("une relation fait sonner ; « tout le monde » posé par `update` élargit, et revenir à « mes relations » referme", async () => {
    const { root, awa, ben, chloe } = await world()
    expect((await call(root, awa, ben)).admitted).toBe(true)
    tick(60_000)
    await ben.as.mutation(C.preferences.update, { outsideRelationsCalls: "ring" })
    expect((await ben.as.query(C.preferences.getMine, { now: Date.now() })).outsideRelationsCalls).toBe("ring")
    expect((await call(root, chloe, ben)).admitted).toBe(true)
    tick(60_000)
    await ben.as.mutation(C.preferences.update, { outsideRelationsCalls: "silent" })
    expect(await call(root, chloe, ben)).toMatchObject({ admitted: false, reason: "outside_relations" })
  })

  it("règle de reprise : une ligne de réglages SANS ce champ (silence posé puis levé, journal vu) suit le défaut ; un « tout le monde » déjà posé est gardé", async () => {
    const { t, root, ben, chloe } = await world()
    await ben.as.mutation(C.preferences.setDnd, { until: T0 + 3_600_000 })
    await ben.as.mutation(C.preferences.setDnd, { until: null })
    await ben.as.mutation(C.preferences.markJournalSeen, {})
    const [row] = await preferencesRows(t, ben)
    expect(row).toBeDefined()
    expect(row).not.toHaveProperty("outsideRelationsCalls")
    expect((await ben.as.query(C.preferences.getMine, { now: T0 })).outsideRelationsCalls).toBe("silent")
    expect(await call(root, chloe, ben)).toMatchObject({ admitted: false, reason: "outside_relations" })
    // Une personne qui avait choisi « tout le monde » avant IC-04 le garde, sans migration.
    const dan = await enter(t, root, "dan")
    await t.run(async (ctx) => ctx.db.insert("callPreferences", { personId: dan.personId, outsideRelationsCalls: "ring", updatedAt: T0 }))
    expect((await dan.as.query(C.preferences.getMine, { now: T0 })).outsideRelationsCalls).toBe("ring")
    tick()
    expect((await call(root, chloe, dan)).admitted).toBe(true)
  })

  it("appel de groupe : un invité qui n'est pas la relation de l'appelant ne sonne pas, ni au départ ad hoc ni par ajout ; depuis un fil, le fil vaut consentement", async () => {
    const { t, root, awa, ben, chloe } = await world()
    // Ad hoc : Ben (relation d'Awa) sonne, Chloé (non reliée) est écartée — ticket refusé, rien ne sonne.
    const adHoc = await awa.as.mutation(C.groupCalls.startAdHoc, { networkId: root, personIds: [ben.personId, chloe.personId] })
    expect(adHoc.unavailable).toEqual([{ personId: chloe.personId, reason: "outside_relations" }])
    expect(await ringingFor(root, chloe)).toEqual([])
    expect((await ringingFor(root, ben)).map((row) => row.callId)).toEqual([adHoc.callId])
    expect(await bellOf(root, chloe)).toEqual([])
    await awa.as.mutation(C.lifecycle.leave, { networkId: root, callId: adHoc.callId, intentional: true })
    // Ajout pendant un tête-à-tête : la cible non reliée est écartée, l'appel n'est pas promu.
    tick(60_000)
    const duo = await connectedCall(root, awa, ben)
    expect(await awa.as.mutation(C.groupCalls.addInvitee, { networkId: root, callId: duo, personId: chloe.personId })).toMatchObject({ admitted: false, reason: "outside_relations", promoted: false })
    expect(await ringingFor(root, chloe)).toEqual([])
    await awa.as.mutation(C.lifecycle.leave, { networkId: root, callId: duo, intentional: true })
    await ben.as.mutation(C.lifecycle.leave, { networkId: root, callId: duo, intentional: true })
    // Depuis un fil de groupe (créé par Dan, relation de chacun) : Ben lance l'appel du groupe, Chloé (membre, non reliée à Ben) sonne.
    tick(60_000)
    const dan = await enter(t, root, "dan")
    const threadId = await groupThread(t, root, dan, [ben, chloe])
    const fromThread = await ben.as.mutation(C.groupCalls.startFromThread, { networkId: root, threadId })
    expect(fromThread.unavailable).toEqual([])
    expect((await ringingFor(root, chloe)).map((row) => row.callId)).toEqual([fromThread.callId])
    expect((await ticketsOf(t, fromThread.callId)).find((ticket) => ticket.personId === chloe.personId)).toMatchObject({ status: "ringing" })
  })
})

describe("IC-04 — chaque réglage de la rubrique a son effet serveur", () => {
  it("« Ne pas déranger » (`setDnd`) écarte l'appel d'une relation ; levé, l'appel sonne", async () => {
    const { root, awa, ben } = await world()
    await ben.as.mutation(C.preferences.setDnd, { until: T0 + 3_600_000 })
    expect(await call(root, awa, ben)).toMatchObject({ admitted: false, reason: "dnd" })
    await ben.as.mutation(C.preferences.setDnd, { until: null })
    tick()
    expect((await call(root, awa, ben)).admitted).toBe(true)
  })

  it("messagerie vocale (`update`) : coupée, elle n'est plus offerte ni acceptée", async () => {
    const { t, root, awa, ben } = await world()
    await ben.as.mutation(C.preferences.setDnd, { until: T0 + 3_600_000 })
    expect(await call(root, awa, ben)).toMatchObject({ admitted: false, reason: "dnd", voicemailOffered: true })
    await ben.as.mutation(C.preferences.update, { voicemailEnabled: false })
    tick()
    const refused = await call(root, awa, ben)
    expect(refused).toMatchObject({ admitted: false, reason: "dnd", voicemailOffered: false })
    expect(await ruleOf(awa.as.mutation(C.voicemail.leave, { networkId: root, callId: refused.callId, storageId: await storedBlob(t), durationMs: 1_000 }))).toBe("VOICEMAIL_DISABLED")
  })

  it("double appel (`update`) : coupé, un second appel pendant une communication répond « occupé »", async () => {
    const { t, root, awa, ben } = await world()
    const dan = await enter(t, root, "dan")
    await connect(t, root, dan, ben)
    await connectedCall(root, awa, ben)
    tick()
    expect((await call(root, dan, ben)).admitted).toBe(true)
    tick(60_000)
    await ben.as.mutation(C.preferences.update, { callWaiting: false })
    expect(await call(root, dan, ben)).toMatchObject({ admitted: false, reason: "busy" })
  })

  it("réponses rapides (`update`) : bornées, elles accompagnent ma sonnerie", async () => {
    const { root, awa, ben } = await world()
    await ben.as.mutation(C.preferences.update, { quickReplies: ["  Je te rappelle  ", "", "En route"] })
    await call(root, awa, ben)
    expect((await ben.as.query(C.ringing.listRinging, { networkId: root })).quickReplies).toEqual(["Je te rappelle", "En route"])
  })

  it("présence (`update`) : non partagée, je disparais des pastilles de mes relations", async () => {
    const { root, awa, ben } = await world()
    expect((await awa.as.query(C.presence.forMyConnections, { networkId: root, now: T0 })).statuses[ben.personId]).toBe("available")
    await ben.as.mutation(C.preferences.update, { sharePresence: false })
    expect((await awa.as.query(C.presence.forMyConnections, { networkId: root, now: T0 })).statuses).toEqual({})
  })
})
