// @vitest-environment edge-runtime
// Dupliqué de socle/convex/modules/iappel/voicemail.test.ts (avec socle/convex/modules/iappel/voicemail.adoption.test.ts) @ ad2e7fdc2 — adaptations : personnes et réseaux ; codes et règles au lieu des libellés ; portée poste / personnel retirée (2 cas) ; adoption du blob par le coffre iDocument retirée ; le dépôt passe par la garde des fichiers (fraîcheur, usage `voice`, type relu au stockage) et l'écoute par la garde de délivrance ; tests neufs : appel décroché, encore vivant ou de groupe refusés, « hors de mes relations » sans messagerie vocale, blob déjà admis refusé (indistinct pour autrui, `conflict` pour soi), retenue dite tant que l'analyse n'a pas parlé, effacement qui purge le blob, sa ligne d'analyse et l'avis de la cloche, autre réseau introuvable.
/**
 * MESSAGERIE VOCALE — ce que ce fichier tient :
 *  1. seul l'APPELANT d'un tête-à-tête qui n'a pas abouti laisse un message ;
 *  2. un appel n'accepte qu'UN message, et un dépôt n'adopte jamais le blob d'autrui ;
 *  3. l'écoute passe par la garde des fichiers ;
 *  4. supprimer ne laisse RIEN.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { Id } from "../../_generated/dataModel"
import { testConvex } from "../../test.setup"
import { bellOf, C, call, codeOf, connectedCall, enter, type Person, ringingCall, ruleOf, seed, setPrefs, T0, type T, tick } from "./fixtures.setup"

const V = C.voicemail

beforeEach(() => {
  vi.stubEnv("CONVEX_CLOUD_URL", "http://127.0.0.1:3210")
  vi.useFakeTimers()
  vi.setSystemTime(T0)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

/** Un enregistrement RÉEL du harnais, avec son type (le patch système le pose ; `storage.store` ne l'enregistre pas). */
async function recording(t: T, contentType = "audio/webm"): Promise<Id<"_storage">> {
  return await t.run(async (ctx) => {
    const storageId = await ctx.storage.store(new Blob([new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 1, 2, 3, 4])], { type: contentType }))
    await (ctx.db as unknown as { patch: (table: "_storage", id: Id<"_storage">, value: { contentType: string }) => Promise<void> }).patch("_storage", storageId, { contentType })
    return storageId
  })
}

/** Un appel de `from` vers `to`, refusé par le silence de `to` (terminé, jamais décroché). */
async function refusedCall(t: T, networkId: Id<"networks">, from: Person, to: Person): Promise<Id<"calls">> {
  await setPrefs(t, to, { dnd: { until: Date.now() + 3_600_000, startedAt: Date.now() } })
  const placed = await call(networkId, from, to)
  if (placed.admitted) throw new Error("admis")
  return placed.callId
}

async function trio() {
  const t = testConvex()
  const { root, testClosed } = await seed(t)
  const alice = await enter(t, root, "alice")
  const bob = await enter(t, root, "bob")
  const carla = await enter(t, root, "carla")
  return { t, root, testClosed, alice, bob, carla }
}

async function leave(networkId: Id<"networks">, from: Person, callId: Id<"calls">, storageId: Id<"_storage">, durationMs = 15_000) {
  return await from.as.mutation(V.leave, { networkId, callId, storageId, durationMs, mimeType: "audio/webm" })
}

async function cleanScan(t: T, storageId: Id<"_storage">): Promise<void> {
  await t.run(async (ctx) => {
    const scan = await ctx.db
      .query("fileScans")
      .withIndex("by_storageId", (q) => q.eq("storageId", storageId))
      .first()
    if (scan) await ctx.db.patch(scan._id, { status: "clean", updatedAt: Date.now() })
  })
}

describe("leave — laisser un message à qui n'a pas décroché", () => {
  it("dépôt nominal : le message est créé, sous la garde des fichiers, et l'appelé est prévenu", async () => {
    const { t, root, alice, bob } = await trio()
    expect(typeof (await alice.as.mutation(V.generateUploadUrl, { networkId: root }))).toBe("string")
    const callId = await refusedCall(t, root, alice, bob)
    const storageId = await recording(t)
    const { voicemailId, alreadyLeft } = await leave(root, alice, callId, storageId)
    expect(alreadyLeft).toBe(false)
    const row = await t.run(async (ctx) => ctx.db.get(voicemailId))
    expect(row).toMatchObject({ networkId: root, recipientPersonId: bob.personId, fromPersonId: alice.personId, callId, durationMs: 15_000, isRead: false })
    const scan = await t.run(async (ctx) =>
      ctx.db
        .query("fileScans")
        .withIndex("by_storageId", (q) => q.eq("storageId", storageId))
        .first(),
    )
    expect(scan).toMatchObject({ source: "voice", networkId: root, uploadedByPersonId: alice.personId })
    expect((await bellOf(root, bob)).map((n) => ({ kind: n.kind, subject: n.subject }))).toContainEqual({ kind: "voicemail_left", subject: { kind: "voicemail", id: voicemailId } })
  })

  it("seul l'APPELANT laisse un message ; un appel décroché, encore vivant ou de groupe n'en prend pas", async () => {
    const { t, root, alice, bob, carla } = await trio()
    const refused = await refusedCall(t, root, alice, bob)
    expect(await codeOf(leave(root, bob, refused, await recording(t)))).toBe("notFound")
    await t.run(async (ctx) => {
      const prefs = await ctx.db
        .query("callPreferences")
        .withIndex("by_person", (q) => q.eq("personId", bob.personId))
        .unique()
      await ctx.db.patch(prefs!._id, { dnd: undefined })
    })
    tick()
    const ringing = await ringingCall(root, alice, bob)
    expect(await ruleOf(leave(root, alice, ringing, await recording(t)))).toBe("VOICEMAIL_DIRECT_ONLY")
    tick(6_000)
    await alice.as.mutation(C.lifecycle.leave, { networkId: root, callId: ringing })
    tick()
    const answered = await connectedCall(root, alice, carla)
    tick(6_000)
    await alice.as.mutation(C.lifecycle.leave, { networkId: root, callId: answered })
    expect(await ruleOf(leave(root, alice, answered, await recording(t)))).toBe("VOICEMAIL_DIRECT_ONLY")
    const group = await alice.as.mutation(C.groupCalls.startAdHoc, { networkId: root, personIds: [bob.personId, carla.personId] })
    await alice.as.mutation(C.lifecycle.leave, { networkId: root, callId: group.callId })
    expect(await ruleOf(leave(root, alice, group.callId, await recording(t)))).toBe("VOICEMAIL_DIRECT_ONLY")
  })

  it("une messagerie coupée, ou un refus « hors de mes relations » : pas de message", async () => {
    const { t, root, alice, bob, carla } = await trio()
    await setPrefs(t, bob, { voicemailEnabled: false })
    const refused = await refusedCall(t, root, alice, bob)
    expect(await ruleOf(leave(root, alice, refused, await recording(t)))).toBe("VOICEMAIL_DISABLED")
    await setPrefs(t, carla, { outsideRelationsCalls: "silent" })
    tick()
    const stranger = await call(root, alice, carla)
    expect(await ruleOf(leave(root, alice, stranger.callId, await recording(t)))).toBe("VOICEMAIL_DISABLED")
  })

  it("une durée nulle, négative ou au-delà de deux minutes est refusée par sa règle", async () => {
    const { t, root, alice, bob } = await trio()
    const callId = await refusedCall(t, root, alice, bob)
    for (const durationMs of [0, -5, 120_001]) expect(await ruleOf(leave(root, alice, callId, await recording(t), durationMs)), String(durationMs)).toBe("VOICEMAIL_DURATION")
  })

  it("un second dépôt sur le même appel rend le message existant, sans le modifier", async () => {
    const { t, root, alice, bob } = await trio()
    const callId = await refusedCall(t, root, alice, bob)
    const first = await leave(root, alice, callId, await recording(t))
    const second = await leave(root, alice, callId, await recording(t), 30_000)
    expect(second).toEqual({ voicemailId: first.voicemailId, alreadyLeft: true })
    expect((await t.run(async (ctx) => ctx.db.get(first.voicemailId)))?.durationMs).toBe(15_000)
  })

  it("un blob déjà admis n'est jamais adopté : refus indistinct pour celui d'autrui, `conflict` pour le sien", async () => {
    const { t, root, alice, bob, carla } = await trio()
    const toBob = await refusedCall(t, root, alice, bob)
    const used = await recording(t)
    await leave(root, alice, toBob, used)
    tick()
    const toCarla = await refusedCall(t, root, alice, carla)
    expect(await codeOf(leave(root, alice, toCarla, used))).toBe("conflict")
    tick()
    const carlaToBob = await refusedCall(t, root, carla, bob)
    expect(await codeOf(leave(root, carla, carlaToBob, used))).toBe("notFound")
  })

  it("un appel d'un autre réseau est introuvable", async () => {
    const { t, root, testClosed, alice, bob } = await trio()
    const callId = await refusedCall(t, root, alice, bob)
    await t.run(async (ctx) => ctx.db.insert("networkMemberships", { networkId: testClosed, personId: alice.personId, status: "declaree", role: "member", joinedAt: 1, statusChangedAt: 1 }))
    expect(await codeOf(leave(testClosed, alice, callId, await recording(t)))).toBe("notFound")
  })
})

describe("lire sa messagerie", () => {
  it("listMine ne rend que MES messages du réseau, le plus récent d'abord, l'expéditeur nommé ; les non-lus de la page", async () => {
    const { t, root, testClosed, alice, bob, carla } = await trio()
    const first = await leave(root, alice, await refusedCall(t, root, alice, bob), await recording(t))
    tick()
    const second = await leave(root, carla, await refusedCall(t, root, carla, bob), await recording(t))
    const mine = await bob.as.query(V.listMine, { networkId: root })
    expect(mine.items.map((item) => ({ id: item.voicemailId, from: item.from.label.displayName }))).toEqual([
      { id: second.voicemailId, from: "carla" },
      { id: first.voicemailId, from: "alice" },
    ])
    expect(mine.unreadCount).toBe(2)
    expect((await alice.as.query(V.listMine, { networkId: root })).items).toEqual([])
    await t.run(async (ctx) => ctx.db.insert("networkMemberships", { networkId: testClosed, personId: bob.personId, status: "declaree", role: "member", joinedAt: 1, statusChangedAt: 1 }))
    expect((await bob.as.query(V.listMine, { networkId: testClosed })).items).toEqual([])
  })

  it("markRead : le destinataire seul ; `readAt` n'est jamais réécrit au rejeu", async () => {
    const { t, root, alice, bob, carla } = await trio()
    const { voicemailId } = await leave(root, alice, await refusedCall(t, root, alice, bob), await recording(t))
    expect(await codeOf(alice.as.mutation(V.markRead, { networkId: root, voicemailId }))).toBe("notFound")
    expect(await codeOf(carla.as.mutation(V.markRead, { networkId: root, voicemailId }))).toBe("notFound")
    await bob.as.mutation(V.markRead, { networkId: root, voicemailId })
    tick()
    await bob.as.mutation(V.markRead, { networkId: root, voicemailId })
    expect(await t.run(async (ctx) => ctx.db.get(voicemailId))).toMatchObject({ isRead: true, readAt: T0 })
  })

  it("playbackUrl : le destinataire ET l'expéditeur, sous la garde — retenu tant que l'analyse n'a pas parlé ; un tiers, jamais", async () => {
    const { t, root, alice, bob, carla } = await trio()
    const storageId = await recording(t)
    const { voicemailId } = await leave(root, alice, await refusedCall(t, root, alice, bob), storageId)
    expect(await bob.as.mutation(V.playbackUrl, { networkId: root, voicemailId })).toEqual({ url: null, withheld: "fileScanPending" })
    await cleanScan(t, storageId)
    for (const person of [bob, alice]) {
      const delivery = await person.as.mutation(V.playbackUrl, { networkId: root, voicemailId })
      expect(typeof delivery.url).toBe("string")
      expect(delivery.withheld).toBeNull()
    }
    expect(await codeOf(carla.as.mutation(V.playbackUrl, { networkId: root, voicemailId }))).toBe("notFound")
  })
})

describe("IC-02 — le parcours du destinataire et les gardes de l'écran", () => {
  it("un message déposé apparaît chez le destinataire seul, s'écoute, passe à « lu », puis se supprime", async () => {
    const { t, root, alice, bob, carla } = await trio()
    const storageId = await recording(t)
    const { voicemailId } = await leave(root, alice, await refusedCall(t, root, alice, bob), storageId)
    const before = await bob.as.query(V.listMine, { networkId: root, limit: 50 })
    expect(before.items).toEqual([expect.objectContaining({ voicemailId, isRead: false, readAt: null, durationMs: 15_000 })])
    expect(before.unreadCount).toBe(1)
    for (const other of [alice, carla]) expect((await other.as.query(V.listMine, { networkId: root, limit: 50 })).items).toEqual([])
    await cleanScan(t, storageId)
    expect(typeof (await bob.as.mutation(V.playbackUrl, { networkId: root, voicemailId })).url).toBe("string")
    await bob.as.mutation(V.markRead, { networkId: root, voicemailId })
    const after = await bob.as.query(V.listMine, { networkId: root, limit: 50 })
    expect(after.items).toEqual([expect.objectContaining({ voicemailId, isRead: true, readAt: T0 })])
    expect(after.unreadCount).toBe(0)
    await bob.as.mutation(V.deleteMine, { networkId: root, voicemailId })
    expect(await bob.as.query(V.listMine, { networkId: root, limit: 50 })).toEqual({ items: [], unreadCount: 0 })
  })

  it("refus INDISTINCT : un tiers, un message déjà supprimé et un autre réseau reçoivent le même `notFound`", async () => {
    const { t, root, testClosed, alice, bob, carla } = await trio()
    const kept = await leave(root, alice, await refusedCall(t, root, alice, bob), await recording(t))
    tick()
    const gone = await leave(root, carla, await refusedCall(t, root, carla, bob), await recording(t))
    await bob.as.mutation(V.deleteMine, { networkId: root, voicemailId: gone.voicemailId })
    await t.run(async (ctx) => ctx.db.insert("networkMemberships", { networkId: testClosed, personId: bob.personId, status: "declaree", role: "member", joinedAt: 1, statusChangedAt: 1 }))
    const attempts: [Person, Id<"networks">, Id<"voicemails">][] = [
      [carla, root, kept.voicemailId],
      [bob, root, gone.voicemailId],
      [bob, testClosed, kept.voicemailId],
    ]
    for (const [person, networkId, voicemailId] of attempts) {
      expect(await codeOf(person.as.mutation(V.markRead, { networkId, voicemailId }))).toBe("notFound")
      expect(await codeOf(person.as.mutation(V.playbackUrl, { networkId, voicemailId }))).toBe("notFound")
      expect(await codeOf(person.as.mutation(V.deleteMine, { networkId, voicemailId }))).toBe("notFound")
    }
    // L'expéditeur n'administre pas la messagerie d'autrui : ni « lu », ni suppression (il peut seulement se réécouter).
    expect(await codeOf(alice.as.mutation(V.markRead, { networkId: root, voicemailId: kept.voicemailId }))).toBe("notFound")
    expect(await codeOf(alice.as.mutation(V.deleteMine, { networkId: root, voicemailId: kept.voicemailId }))).toBe("notFound")
    expect(await t.run(async (ctx) => ctx.db.get(kept.voicemailId))).toMatchObject({ isRead: false })
  })
})

describe("deleteMine — supprimer ne laisse RIEN", () => {
  it("le destinataire supprime la ligne, le blob, sa ligne d'analyse et l'avis de la cloche ; l'expéditeur ne le peut pas", async () => {
    const { t, root, alice, bob } = await trio()
    const storageId = await recording(t)
    const { voicemailId } = await leave(root, alice, await refusedCall(t, root, alice, bob), storageId)
    expect(await codeOf(alice.as.mutation(V.deleteMine, { networkId: root, voicemailId }))).toBe("notFound")
    await bob.as.mutation(V.deleteMine, { networkId: root, voicemailId })
    const after = await t.run(async (ctx) => ({
      row: await ctx.db.get(voicemailId),
      blob: await ctx.db.system.get("_storage", storageId),
      scan: await ctx.db
        .query("fileScans")
        .withIndex("by_storageId", (q) => q.eq("storageId", storageId))
        .first(),
    }))
    expect(after).toEqual({ row: null, blob: null, scan: null })
    expect((await bellOf(root, bob)).map((n) => n.kind)).not.toContain("voicemail_left")
  })
})
