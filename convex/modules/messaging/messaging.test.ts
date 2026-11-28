// @vitest-environment edge-runtime
// Dupliqué de socle/convex/modules/reseauPersonnel/messagerie.test.ts (avec socle/convex/modules/messagerieScope/{threads,transfert}.test.ts et socle/convex/tests/{chatsMessagerie,chatsP2P,chatsPinning,chatsAttachmentsAdoption}.test.ts) @ ad2e7fdc2 — adaptations : personnes et réseaux (graine des fondations) ; codes et règles au lieu des libellés ; fils de poste, Standard, iAsted, ressortissants, coffre et appels (→ module des appels) retirés ; le cloisonnement poste / personnel réécrit ENTRE RÉSEAUX ; un poids déclaré qui ment est refusé (le socle l'écrasait) ; tests neufs : le blocage déplace la pastille à l'écriture (D38), contenu retiré absent (D37), saisie lue à l'instant fourni (D16), nom tu après une demande d'effacement, une paire a un fil par réseau.
import { MESSAGE_EDIT_WINDOW_MS } from "@antsia/social-contracts/messaging"
import { engineErrorCode, engineErrorRule } from "@antsia/social-contracts/errors"
import type { PaginationResult } from "convex/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { api, internal } from "../../_generated/api"
import type { Id } from "../../_generated/dataModel"
import { SEED_CONFIRMATION } from "../../seeds/foundations"
import { testConvex } from "../../test.setup"
import { recomputePersonalUnreadTotal, setPersonalUnreadTotal } from "./threads"

type T = ReturnType<typeof testConvex>
type Person = { as: ReturnType<T["withIdentity"]>; personId: Id<"persons">; handle: string }
type ThreadsCursor = { low: { at: number | null; ct: number } | null; high: { at: number | null; ct: number } | null }

const M = api.modules.messaging
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13])
const SOUND = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0, 1, 2, 3, 4, 5, 6])
const T0 = Date.UTC(2026, 9, 15, 8, 0, 0)

beforeEach(() => {
  vi.stubEnv("CONVEX_CLOUD_URL", "http://127.0.0.1:3210")
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

async function seed(t: T) {
  return await t.mutation(internal.seeds.foundations.run, { confirmNonProduction: SEED_CONFIRMATION })
}

async function enter(t: T, rootId: Id<"networks">, handle: string): Promise<Person> {
  const as = t.withIdentity({ subject: `auth-${handle}` })
  const personId = await as.mutation(api.modules.people.persons.ensureMyPerson, {})
  await as.mutation(api.modules.people.consents.recordConsent, { purpose: "social_profile", origin: "onboarding" })
  await as.mutation(api.modules.people.profile.publishMyProfile, { handle, displayName: handle })
  await as.mutation(api.modules.people.memberships.joinNetwork, { networkId: rootId })
  return { as, personId, handle }
}

/** Membre DÉCLARÉE d'un second réseau (le réseau fermé de la graine). */
async function joinAlso(t: T, networkId: Id<"networks">, person: Person): Promise<void> {
  await t.run(async (ctx) => ctx.db.insert("networkMemberships", { networkId, personId: person.personId, status: "declaree", role: "member", joinedAt: 1, statusChangedAt: 1 }))
}

async function connect(t: T, networkId: Id<"networks">, a: Person, b: Person): Promise<void> {
  await t.run(async (ctx) => {
    const [low, high] = a.personId < b.personId ? [a.personId, b.personId] : [b.personId, a.personId]
    await ctx.db.insert("connections", { networkId, personIdLow: low, personIdHigh: high, requestedByPersonId: a.personId, recipientPersonId: b.personId, status: "accepted", requestedAt: 1, respondedAt: 1, updatedAt: 1 })
  })
}

async function caught(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise
  } catch (error) {
    return error
  }
  return null
}

const codeOf = async (promise: Promise<unknown>) => engineErrorCode(await caught(promise))
const ruleOf = async (promise: Promise<unknown>) => engineErrorRule(await caught(promise))?.rule ?? null

async function open(networkId: Id<"networks">, from: Person, to: Person, text = "Bonjour") {
  return await from.as.mutation(M.inbox.startThreadWithHandle, { networkId, handle: to.handle, initialMessage: text })
}

async function send(networkId: Id<"networks">, from: Person, threadId: Id<"personalThreads">, content: string) {
  return (await from.as.mutation(M.messages.sendMessage, { networkId, threadId, content })).messageId
}

async function history(networkId: Id<"networks">, reader: Person, threadId: Id<"personalThreads">) {
  return (await reader.as.query(M.messages.paginateMessages, { networkId, threadId, paginationOpts: { numItems: 100, cursor: null } })).page
}

async function inbox(networkId: Id<"networks">, reader: Person) {
  return (await reader.as.query(M.inbox.paginateMyThreads, { networkId })).items
}

async function unread(networkId: Id<"networks">, reader: Person) {
  return (await reader.as.query(M.inbox.totalUnread, { networkId })).total
}

async function recomputed(t: T, networkId: Id<"networks">, person: Person) {
  return await t.run(async (ctx) => recomputePersonalUnreadTotal(ctx, networkId, person.personId, { threadScan: 100, unreadScan: 500 }))
}

async function store(t: T, bytes: Uint8Array, type: string): Promise<Id<"_storage">> {
  return await t.run(async (ctx) => ctx.storage.store(new Blob([bytes as BlobPart], { type })))
}

function png(storageId: Id<"_storage">, filename = "photo.png") {
  return { storageId, filename, mimeType: "image/png", sizeBytes: PNG.length }
}

function voice(storageId: Id<"_storage">, durationMs: number) {
  return { storageId, filename: "vocal.webm", mimeType: "audio/webm;codecs=opus", sizeBytes: SOUND.length, durationMs }
}

/** Un message posé en base, hors des gestes (historiques longs, événements d'appel). */
async function insertMessage(
  t: T,
  networkId: Id<"networks">,
  threadId: Id<"personalThreads">,
  sender: Person,
  createdAt: number,
  type: "text" | "system" | "call_started" | "call_ended" = "text",
) {
  // Un événement n'a pas de texte (D37 : contenu absent, jamais `""`).
  return await t.run(async (ctx) => ctx.db.insert("personalMessages", { networkId, threadId, senderPersonId: sender.personId, ...(type === "text" ? { content: `m${createdAt}` } : {}), type, createdAt }))
}

// ═══════════════════════════════════════════════════════════════
// Ouvrir un fil — la politique de la surface
// ═══════════════════════════════════════════════════════════════

describe("ouvrir un fil — la politique de la surface", () => {
  it("rend le MÊME refus pour un identifiant inconnu, un profil retiré et un blocage ; s'écrire à soi-même se dit", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const alice = await enter(t, root, "alice")
    const bob = await enter(t, root, "bob")
    const carol = await enter(t, root, "carol")
    await connect(t, root, alice, bob)
    await connect(t, root, alice, carol)
    await bob.as.mutation(api.modules.people.profile.withdrawMyProfile, {})
    await alice.as.mutation(api.modules.graph.connections.blockPerson, { networkId: root, targetPersonId: carol.personId })
    const start = (from: Person, handle: string) => from.as.mutation(M.inbox.startThreadWithHandle, { networkId: root, handle, initialMessage: "Bonjour" })
    expect(await codeOf(start(alice, "inconnu"))).toBe("notFound")
    expect(await codeOf(start(alice, "bob"))).toBe("notFound")
    expect(await codeOf(start(alice, "carol"))).toBe("notFound")
    // Le bloqué non plus n'écrit pas à qui l'a bloqué — du même mot.
    expect(await codeOf(start(carol, "alice"))).toBe("notFound")
    expect(await ruleOf(start(alice, "alice"))).toBe("THREAD_SELF")
    expect(await t.run(async (ctx) => (await ctx.db.query("personalThreads").take(10)).length)).toBe(0)
  })

  it("réutilise le fil existant au lieu d'en créer un second, dans les deux sens", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const alice = await enter(t, root, "alice")
    const bob = await enter(t, root, "bob")
    await connect(t, root, alice, bob)
    const first = await open(root, alice, bob, "Un")
    const second = await open(root, bob, alice, "Deux")
    expect(first.created).toBe(true)
    expect(second).toMatchObject({ threadId: first.threadId, created: false })
    expect((await history(root, alice, first.threadId)).map((message) => message.content)).toEqual(["Deux", "Un"])
  })

  it("un fil NEUF exige une relation ACCEPTÉE et le refus dit la marche à suivre ; demandée, elle ne suffit pas", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const alice = await enter(t, root, "alice")
    const bob = await enter(t, root, "bob")
    // Pas le refus indistinct : l'identifiant est déjà connu de l'appelant.
    expect(await ruleOf(open(root, alice, bob))).toBe("THREAD_RELATION_REQUIRED")
    await alice.as.mutation(api.modules.graph.connections.requestConnection, { networkId: root, handle: "bob" })
    expect(await ruleOf(open(root, alice, bob))).toBe("THREAD_RELATION_REQUIRED")
    const connectionId = await t.run(async (ctx) => (await ctx.db.query("connections").first())!._id)
    await bob.as.mutation(api.modules.graph.connections.respondToConnection, { networkId: root, connectionId, accept: true })
    expect((await open(root, alice, bob)).created).toBe(true)
  })

  it("un fil déjà ouvert le reste quand la relation tombe — la règle ne vaut que pour l'ouverture", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const alice = await enter(t, root, "alice")
    const bob = await enter(t, root, "bob")
    await connect(t, root, alice, bob)
    const { threadId } = await open(root, alice, bob)
    await t.run(async (ctx) => {
      const row = (await ctx.db.query("connections").first())!
      await ctx.db.patch(row._id, { status: "declined" })
    })
    expect(await open(root, bob, alice, "Toujours là")).toMatchObject({ threadId, created: false })
    await send(root, alice, threadId, "Oui")
    expect((await history(root, bob, threadId)).map((message) => message.content)).toEqual(["Oui", "Toujours là", "Bonjour"])
  })

  it("être dans le même groupe thématique n'ouvre aucun fil privé", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const alice = await enter(t, root, "alice")
    const bob = await enter(t, root, "bob")
    const { groupId } = await alice.as.mutation(api.modules.thematicGroups.thematicGroups.create, { networkId: root, name: "Entraide", idempotencyKey: "k" })
    await bob.as.mutation(api.modules.thematicGroups.thematicGroups.join, { networkId: root, groupId })
    expect(await ruleOf(open(root, alice, bob))).toBe("THREAD_RELATION_REQUIRED")
  })

  it("findThreadWithHandle rend le fil existant, et null — jamais une erreur — sans fil, pour un inconnu ou un bloqué", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const alice = await enter(t, root, "alice")
    const bob = await enter(t, root, "bob")
    const carol = await enter(t, root, "carol")
    await connect(t, root, alice, bob)
    const find = (handle: string) => alice.as.query(M.inbox.findThreadWithHandle, { networkId: root, handle })
    expect(await find("bob")).toBeNull()
    const { threadId } = await open(root, alice, bob)
    expect(await find("bob")).toEqual({ threadId })
    expect(await find("BOB ")).toEqual({ threadId })
    expect(await find("inconnu")).toBeNull()
    expect(await find("carol")).toBeNull()
    await bob.as.mutation(api.modules.graph.connections.blockPerson, { networkId: root, targetPersonId: alice.personId })
    expect(await find("bob")).toBeNull()
    expect(carol.personId).toBeDefined()
  })
})

// ═══════════════════════════════════════════════════════════════
// La boîte — projection et pages
// ═══════════════════════════════════════════════════════════════

describe("la boîte — projection et pages", () => {
  it("nomme par le profil PUBLIÉ, puis par le nom CHOISI après retrait, puis plus rien après une demande d'effacement — projection allowlistée", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const alice = await enter(t, root, "alice")
    const bob = await enter(t, root, "bob")
    await connect(t, root, alice, bob)
    await open(root, bob, alice)
    const [row] = await inbox(root, alice)
    expect(Object.keys(row!).sort()).toEqual(
      [
        "counterpart",
        "lastMessageAt",
        "lastMessageAttachmentCount",
        "lastMessageByMe",
        "lastMessageDeleted",
        "lastMessageId",
        "lastMessageKind",
        "lastMessageReadByCounterpart",
        "lastMessageText",
        "threadId",
        "unreadCapped",
        "unreadCount",
      ].sort(),
    )
    expect(row!.counterpart).toEqual({ personId: bob.personId, displayName: "bob", handle: "bob", headline: null, avatarUrl: null, source: "published" })
    await bob.as.mutation(api.modules.people.profile.withdrawMyProfile, {})
    expect((await inbox(root, alice))[0]!.counterpart).toEqual({ personId: bob.personId, displayName: "bob", handle: null, headline: null, avatarUrl: null, source: "account" })
    const [message] = await history(root, alice, row!.threadId)
    expect(message!.sender).toMatchObject({ displayName: "bob", source: "account" })
    await t.run(async (ctx) => ctx.db.patch(bob.personId, { deletionRequestedAt: T0 }))
    expect((await inbox(root, alice))[0]!.counterpart).toMatchObject({ displayName: null, handle: null, source: "unknown" })
  })

  it("retire les fils d'un correspondant bloqué, dans les DEUX sens ; getThread rend null des deux côtés", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const alice = await enter(t, root, "alice")
    const bob = await enter(t, root, "bob")
    const carol = await enter(t, root, "carol")
    await connect(t, root, alice, bob)
    await connect(t, root, alice, carol)
    const withBob = await open(root, alice, bob)
    const withCarol = await open(root, alice, carol)
    await bob.as.mutation(api.modules.graph.connections.blockPerson, { networkId: root, targetPersonId: alice.personId })
    expect((await inbox(root, alice)).map((row) => row.threadId)).toEqual([withCarol.threadId])
    expect(await inbox(root, bob)).toEqual([])
    expect(await alice.as.query(M.inbox.getThread, { networkId: root, threadId: withBob.threadId })).toBeNull()
    expect(await bob.as.query(M.inbox.getThread, { networkId: root, threadId: withBob.threadId })).toBeNull()
    expect(await codeOf(history(root, alice, withBob.threadId))).toBe("notFound")
    expect(await codeOf(send(root, bob, withBob.threadId, "Encore"))).toBe("notFound")
  })

  it("neuf fils, des deux côtés de la paire : toutes les pages, sans doublon ni trou, par activité", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(T0)
    const t = testConvex()
    const { root } = await seed(t)
    // Les identifiants du harnais croissent : créées AVANT moi, ces personnes
    // sont le petit côté de la paire ; créées APRÈS, le grand.
    const before = [await enter(t, root, "pers1"), await enter(t, root, "pers2"), await enter(t, root, "pers3"), await enter(t, root, "pers4")]
    const me = await enter(t, root, "moi")
    const after = [await enter(t, root, "pers5"), await enter(t, root, "pers6"), await enter(t, root, "pers7"), await enter(t, root, "pers8"), await enter(t, root, "pers9")]
    const expected: Id<"personalThreads">[] = []
    for (const [index, other] of [after[0]!, before[0]!, after[1]!, before[1]!, after[2]!, before[2]!, after[3]!, before[3]!, after[4]!].entries()) {
      await connect(t, root, me, other)
      vi.setSystemTime(T0 + (index + 1) * 1000)
      expected.unshift((await open(root, other, me, `Message ${index}`)).threadId)
    }
    const sides = await t.run(async (ctx) => (await ctx.db.query("personalThreads").take(20)).map((thread) => (thread.personLow === me.personId ? "low" : "high")))
    expect(new Set(sides)).toEqual(new Set(["low", "high"]))
    const seen: Id<"personalThreads">[] = []
    let cursor: ThreadsCursor | null = null
    let pages = 0
    do {
      const page: { items: { threadId: Id<"personalThreads"> }[]; nextCursor: ThreadsCursor | null; isDone: boolean } = await me.as.query(M.inbox.paginateMyThreads, { networkId: root, cursor, limit: 2 })
      seen.push(...page.items.map((item) => item.threadId))
      cursor = page.nextCursor
      pages += 1
    } while (cursor !== null && pages < 20)
    expect(seen).toEqual(expected)
    expect(new Set(seen).size).toBe(9)
  })

  it("un fil ancien réactivé revient en première page ; une boîte vide rend une page vide, terminée", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(T0)
    const t = testConvex()
    const { root } = await seed(t)
    const me = await enter(t, root, "moi")
    const others = [await enter(t, root, "pers1"), await enter(t, root, "pers2"), await enter(t, root, "pers3")]
    expect(await me.as.query(M.inbox.paginateMyThreads, { networkId: root })).toEqual({ items: [], nextCursor: null, isDone: true })
    const threads: Id<"personalThreads">[] = []
    for (const [index, other] of others.entries()) {
      await connect(t, root, me, other)
      vi.setSystemTime(T0 + (index + 1) * 1000)
      threads.push((await open(root, me, other)).threadId)
    }
    vi.setSystemTime(T0 + 10_000)
    await send(root, others[0]!, threads[0]!, "Je reviens")
    const first = await me.as.query(M.inbox.paginateMyThreads, { networkId: root, limit: 1 })
    expect(first.items.map((item) => item.threadId)).toEqual([threads[0]])
    expect(first.isDone).toBe(false)
  })

  it("getThread rend un fil bien plus ancien que la première page ; refuse un fil d'autrui et un fil d'un autre réseau — indistinctement", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(T0)
    const t = testConvex()
    const { root, testClosed } = await seed(t)
    const me = await enter(t, root, "moi")
    const others = [await enter(t, root, "pers1"), await enter(t, root, "pers2"), await enter(t, root, "pers3")]
    const threads: Id<"personalThreads">[] = []
    for (const [index, other] of others.entries()) {
      await connect(t, root, me, other)
      vi.setSystemTime(T0 + (index + 1) * 1000)
      threads.push((await open(root, me, other)).threadId)
    }
    expect((await me.as.query(M.inbox.paginateMyThreads, { networkId: root, limit: 1 })).items.map((item) => item.threadId)).toEqual([threads[2]])
    expect(await me.as.query(M.inbox.getThread, { networkId: root, threadId: threads[0]! })).toMatchObject({ threadId: threads[0], counterpart: { handle: "pers1" } })
    // Un fil d'autrui.
    const outsider = await enter(t, root, "tiers")
    expect(await outsider.as.query(M.inbox.getThread, { networkId: root, threadId: threads[0]! })).toBeNull()
    // Le même fil, demandé depuis un autre réseau dont je suis membre.
    await joinAlso(t, testClosed, me)
    expect(await me.as.query(M.inbox.getThread, { networkId: testClosed, threadId: threads[0]! })).toBeNull()
  })

  it("dit la nature du dernier message — texte, pièces, vocal par le mime de sa pièce — l'accusé sur MES messages seulement, et un dernier message retiré pour tous", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(T0)
    const t = testConvex()
    const { root } = await seed(t)
    const alice = await enter(t, root, "alice")
    const bob = await enter(t, root, "bob")
    await connect(t, root, alice, bob)
    const { threadId } = await open(root, alice, bob, "Texte")
    const last = async (reader: Person) => (await inbox(root, reader))[0]!
    expect(await last(alice)).toMatchObject({ lastMessageKind: "text", lastMessageText: "Texte", lastMessageByMe: true, lastMessageReadByCounterpart: false })
    expect(await last(bob)).toMatchObject({ lastMessageByMe: false, lastMessageReadByCounterpart: null, unreadCount: 1 })
    await bob.as.mutation(M.messages.markRead, { networkId: root, threadId })
    expect(await last(alice)).toMatchObject({ lastMessageReadByCounterpart: true })
    vi.setSystemTime(T0 + 1000)
    const photos = [await store(t, PNG, "image/png"), await store(t, PNG, "image/png")]
    await alice.as.mutation(M.messages.sendMessage, { networkId: root, threadId, content: "", attachmentFiles: photos.map((id) => png(id)) })
    expect(await last(bob)).toMatchObject({ lastMessageKind: "attachments", lastMessageText: null, lastMessageAttachmentCount: 2 })
    vi.setSystemTime(T0 + 2000)
    const sound = await store(t, SOUND, "audio/webm")
    await alice.as.mutation(M.messages.sendMessage, { networkId: root, threadId, content: "", attachmentFiles: [voice(sound, 12_000)] })
    expect(await last(bob)).toMatchObject({ lastMessageKind: "voice", lastMessageText: null, lastMessageAttachmentCount: 1 })
    vi.setSystemTime(T0 + 3000)
    const { messageId } = await alice.as.mutation(M.messages.sendMessage, { networkId: root, threadId, content: "Je retire" })
    await alice.as.mutation(M.messages.deleteMessage, { networkId: root, messageId })
    expect(await last(bob)).toMatchObject({ lastMessageDeleted: true, lastMessageKind: "voice" })
  })
})

// ═══════════════════════════════════════════════════════════════
// La pastille de non-lus — un compteur tenu, jamais un balayage
// ═══════════════════════════════════════════════════════════════

describe("la pastille de non-lus", () => {
  it("ne compte QUE les messages de l'autre, non lus ; zéro sans fil ; la somme des fils égale le balayage et suit l'envoi et la lecture", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const alice = await enter(t, root, "alice")
    const bob = await enter(t, root, "bob")
    const carol = await enter(t, root, "carol")
    await connect(t, root, alice, bob)
    await connect(t, root, alice, carol)
    expect(await alice.as.query(M.inbox.totalUnread, { networkId: root })).toEqual({ total: 0, capped: false })
    const withBob = await open(root, bob, alice, "b1")
    await send(root, bob, withBob.threadId, "b2")
    await send(root, alice, withBob.threadId, "a1")
    await open(root, carol, alice, "c1")
    expect(await unread(root, alice)).toBe(3)
    expect(await unread(root, bob)).toBe(1)
    expect(await recomputed(t, root, alice)).toEqual({ total: 3, truncated: false })
    expect(await alice.as.mutation(M.messages.markRead, { networkId: root, threadId: withBob.threadId })).toEqual({ markedCount: 2 })
    expect(await unread(root, alice)).toBe(1)
    expect(await recomputed(t, root, alice)).toEqual({ total: 1, truncated: false })
    expect(Object.fromEntries((await inbox(root, alice)).map((row) => [row.counterpart.handle, row.unreadCount]))).toEqual({ bob: 0, carol: 1 })
  })

  it("retirer POUR TOUS ôte le non-lu de la pastille de l'autre ; masquer POUR MOI ôte le mien — deux fois n'en ôte qu'un", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const alice = await enter(t, root, "alice")
    const bob = await enter(t, root, "bob")
    await connect(t, root, alice, bob)
    const { threadId, messageId: first } = await open(root, bob, alice, "b1")
    const second = await send(root, bob, threadId, "b2")
    expect(await unread(root, alice)).toBe(2)
    await bob.as.mutation(M.messages.deleteMessage, { networkId: root, messageId: second })
    expect(await unread(root, alice)).toBe(1)
    await alice.as.mutation(M.messages.deleteMessageForMe, { networkId: root, messageId: first })
    await alice.as.mutation(M.messages.deleteMessageForMe, { networkId: root, messageId: first })
    expect(await unread(root, alice)).toBe(0)
    expect(await t.run(async (ctx) => (await ctx.db.get(first))?.hiddenForPersonIds)).toEqual([alice.personId])
    expect(await recomputed(t, root, alice)).toEqual({ total: 0, truncated: false })
  })

  it("plafonne à 99+ et le DIT, la pastille comme le fil", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const alice = await enter(t, root, "alice")
    const bob = await enter(t, root, "bob")
    await connect(t, root, alice, bob)
    const { threadId } = await open(root, bob, alice)
    for (let index = 0; index < 120; index += 1) await insertMessage(t, root, threadId, bob, T0 + index)
    await t.run(async (ctx) => setPersonalUnreadTotal(ctx, root, alice.personId, 121))
    expect(await alice.as.query(M.inbox.totalUnread, { networkId: root })).toEqual({ total: 99, capped: true })
    expect((await inbox(root, alice))[0]).toMatchObject({ unreadCount: 99, unreadCapped: true })
  })

  it("le BLOCAGE ôte de chaque pastille, dans chaque réseau, les non-lus du fil de l'autre ; débloquer les rend (D38)", async () => {
    const t = testConvex()
    const { root, testClosed } = await seed(t)
    const alice = await enter(t, root, "alice")
    const bob = await enter(t, root, "bob")
    await joinAlso(t, testClosed, alice)
    await joinAlso(t, testClosed, bob)
    await connect(t, root, alice, bob)
    await connect(t, testClosed, alice, bob)
    const inRoot = await open(root, bob, alice, "r1")
    await send(root, bob, inRoot.threadId, "r2")
    await open(testClosed, alice, bob, "f1")
    expect([await unread(root, alice), await unread(testClosed, bob)]).toEqual([2, 1])
    await alice.as.mutation(api.modules.graph.connections.blockPerson, { networkId: root, targetPersonId: bob.personId })
    expect([await unread(root, alice), await unread(testClosed, bob)]).toEqual([0, 0])
    expect([(await recomputed(t, root, alice)).total, (await recomputed(t, testClosed, bob)).total]).toEqual([0, 0])
    await alice.as.mutation(api.modules.graph.connections.unblockPerson, { networkId: root, targetPersonId: bob.personId })
    expect([await unread(root, alice), await unread(testClosed, bob)]).toEqual([2, 1])
    expect([(await recomputed(t, root, alice)).total, (await recomputed(t, testClosed, bob)).total]).toEqual([2, 1])
  })

  it("un blocage posé de l'autre côté garde la paire fermée : rien n'est ôté deux fois, rien ne revient avant le dernier déblocage", async () => {
    const t = testConvex()
    const { root, testClosed } = await seed(t)
    const alice = await enter(t, root, "alice")
    const bob = await enter(t, root, "bob")
    const carol = await enter(t, root, "carol")
    await joinAlso(t, testClosed, alice)
    await joinAlso(t, testClosed, bob)
    await connect(t, root, alice, bob)
    await connect(t, root, alice, carol)
    const withBob = await open(root, bob, alice, "b1")
    await send(root, bob, withBob.threadId, "b2")
    await open(root, carol, alice, "c1")
    expect(await unread(root, alice)).toBe(3)
    await alice.as.mutation(api.modules.graph.connections.blockPerson, { networkId: root, targetPersonId: bob.personId })
    expect(await unread(root, alice)).toBe(1)
    // Bob bloque à son tour, depuis un réseau où la paire n'a pas encore de ligne.
    await bob.as.mutation(api.modules.graph.connections.blockPerson, { networkId: testClosed, targetPersonId: alice.personId })
    expect(await unread(root, alice)).toBe(1)
    await alice.as.mutation(api.modules.graph.connections.unblockPerson, { networkId: root, targetPersonId: bob.personId })
    expect(await unread(root, alice)).toBe(1)
    await bob.as.mutation(api.modules.graph.connections.unblockPerson, { networkId: testClosed, targetPersonId: alice.personId })
    expect(await unread(root, alice)).toBe(3)
    expect(await recomputed(t, root, alice)).toEqual({ total: 3, truncated: false })
  })
})

// ═══════════════════════════════════════════════════════════════
// Messages — participer, envoyer, citer, modifier, retirer
// ═══════════════════════════════════════════════════════════════

describe("messages — gardes et gestes", () => {
  it("un tiers ne lit pas, n'écrit pas, ne marque pas lu, ne réagit pas, ne pose ni ne voit la saisie — rien ne fuit, rien ne s'écrit", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const alice = await enter(t, root, "alice")
    const bob = await enter(t, root, "bob")
    const eve = await enter(t, root, "eve")
    await connect(t, root, alice, bob)
    const { threadId, messageId } = await open(root, alice, bob)
    expect(await codeOf(history(root, eve, threadId))).toBe("notFound")
    expect(await codeOf(send(root, eve, threadId, "Intrus"))).toBe("notFound")
    expect(await codeOf(eve.as.mutation(M.messages.markRead, { networkId: root, threadId }))).toBe("notFound")
    expect(await codeOf(eve.as.mutation(M.reactions.toggleMessageReaction, { networkId: root, messageId, kind: "like" }))).toBe("notFound")
    expect(await codeOf(eve.as.mutation(M.typing.setTyping, { networkId: root, threadId }))).toBe("notFound")
    expect(await codeOf(eve.as.query(M.typing.listTyping, { networkId: root, threadId, now: T0 }))).toBe("notFound")
    expect(await codeOf(eve.as.mutation(M.messages.deleteMessageForMe, { networkId: root, messageId }))).toBe("notFound")
    expect(await codeOf(eve.as.mutation(M.pins.setPinnedMessage, { networkId: root, threadId, messageId }))).toBe("notFound")
    const rows = await t.run(async (ctx) => ({
      messages: (await ctx.db.query("personalMessages").take(10)).length,
      typing: (await ctx.db.query("personalTyping").take(10)).length,
      read: (await ctx.db.get(messageId))?.readAt,
    }))
    expect(rows).toEqual({ messages: 1, typing: 0, read: undefined })
    // Le vrai destinataire, lui, marque lu.
    expect(await bob.as.mutation(M.messages.markRead, { networkId: root, threadId })).toEqual({ markedCount: 1 })
  })

  it("la même clé d'idempotence n'insère qu'un message", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const alice = await enter(t, root, "alice")
    const bob = await enter(t, root, "bob")
    await connect(t, root, alice, bob)
    const { threadId } = await open(root, alice, bob)
    const first = await alice.as.mutation(M.messages.sendMessage, { networkId: root, threadId, content: "Une fois", idempotencyKey: "k" })
    const again = await alice.as.mutation(M.messages.sendMessage, { networkId: root, threadId, content: "Une fois", idempotencyKey: "k" })
    expect(again).toEqual({ messageId: first.messageId, deduplicated: true })
    expect((await history(root, bob, threadId)).length).toBe(2)
    expect(await unread(root, bob)).toBe(2)
  })

  it("pièces : le poids écrit est celui du stockage, une déclaration qui ment est refusée ; un blob disparu se refuse ; cinq pièces au plus ; texte vide avec une pièce, jamais nu", async () => {
    vi.useFakeTimers()
    const t = testConvex()
    const { root } = await seed(t)
    const alice = await enter(t, root, "alice")
    const bob = await enter(t, root, "bob")
    await connect(t, root, alice, bob)
    const { threadId } = await open(root, alice, bob)
    const sendFiles = (files: ReturnType<typeof png>[], content = "") => alice.as.mutation(M.messages.sendMessage, { networkId: root, threadId, content, attachmentFiles: files })
    const lying = await store(t, PNG, "image/png")
    expect(await ruleOf(sendFiles([{ ...png(lying), sizeBytes: 3 }]))).toBe("UPLOAD_MISMATCH")
    const gone = await store(t, PNG, "image/png")
    await t.run(async (ctx) => ctx.storage.delete(gone))
    expect(await codeOf(sendFiles([png(gone)]))).toBe("notFound")
    const six = await Promise.all(Array.from({ length: 6 }, () => store(t, PNG, "image/png")))
    expect(await ruleOf(sendFiles(six.map((id) => png(id))))).toBe("ATTACHMENTS_TOO_MANY")
    expect(await ruleOf(alice.as.mutation(M.messages.sendMessage, { networkId: root, threadId, content: "   " }))).toBe("MESSAGE_EMPTY")
    const { messageId } = await sendFiles([png(lying, "vraie.png")])
    const [message] = await history(root, bob, threadId)
    expect(message).toMatchObject({ messageId, content: null, attachmentFiles: [{ filename: "vraie.png", mimeType: "image/png", sizeBytes: PNG.length, durationMs: null, url: null, withheld: "fileScanPending" }] })
  })

  it("un vocal porte sa durée jusqu'à la lecture, plafonnée à cinq minutes ; une durée sur une pièce non sonore est refusée", async () => {
    vi.useFakeTimers()
    const t = testConvex()
    const { root } = await seed(t)
    const alice = await enter(t, root, "alice")
    const bob = await enter(t, root, "bob")
    await connect(t, root, alice, bob)
    const { threadId } = await open(root, alice, bob)
    const tooLong = await store(t, SOUND, "audio/webm")
    expect(await ruleOf(alice.as.mutation(M.messages.sendMessage, { networkId: root, threadId, content: "", attachmentFiles: [voice(tooLong, 6 * 60_000)] }))).toBe("VOICE_TOO_LONG")
    const picture = await store(t, PNG, "image/png")
    expect(await ruleOf(alice.as.mutation(M.messages.sendMessage, { networkId: root, threadId, content: "", attachmentFiles: [{ ...png(picture), durationMs: 3000 }] }))).toBe("ATTACHMENT_DURATION_NOT_AUDIO")
    const sound = await store(t, SOUND, "audio/webm")
    await alice.as.mutation(M.messages.sendMessage, { networkId: root, threadId, content: "", attachmentFiles: [voice(sound, 42_000)] })
    const [message] = await history(root, bob, threadId)
    expect(message!.attachmentFiles).toMatchObject([{ mimeType: "audio/webm", durationMs: 42_000 }])
  })

  it("le blob d'un tiers glissé dans un message est refusé, du même mot qu'un inconnu ; le sien, sous une nouvelle clé, se dit ; sous la même clé, dédupliqué", async () => {
    vi.useFakeTimers()
    const t = testConvex()
    const { root } = await seed(t)
    const alice = await enter(t, root, "alice")
    const bob = await enter(t, root, "bob")
    const carol = await enter(t, root, "carol")
    await connect(t, root, alice, bob)
    await connect(t, root, carol, bob)
    const withAlice = await open(root, alice, bob)
    const withCarol = await open(root, carol, bob)
    const blob = await store(t, PNG, "image/png")
    const first = await alice.as.mutation(M.messages.sendMessage, { networkId: root, threadId: withAlice.threadId, content: "", attachmentFiles: [png(blob)], idempotencyKey: "k1" })
    expect(await codeOf(carol.as.mutation(M.messages.sendMessage, { networkId: root, threadId: withCarol.threadId, content: "", attachmentFiles: [png(blob)] }))).toBe("notFound")
    expect(await codeOf(carol.as.mutation(M.inbox.startThreadWithHandle, { networkId: root, handle: "bob", initialMessage: "", initialAttachmentFiles: [png(blob)] }))).toBe("notFound")
    expect(await codeOf(alice.as.mutation(M.messages.sendMessage, { networkId: root, threadId: withAlice.threadId, content: "", attachmentFiles: [png(blob)], idempotencyKey: "k2" }))).toBe("conflict")
    expect(await alice.as.mutation(M.messages.sendMessage, { networkId: root, threadId: withAlice.threadId, content: "", attachmentFiles: [png(blob)], idempotencyKey: "k1" })).toEqual({ messageId: first.messageId, deduplicated: true })
    const fresh = await store(t, PNG, "image/png")
    await carol.as.mutation(M.messages.sendMessage, { networkId: root, threadId: withCarol.threadId, content: "", attachmentFiles: [png(fresh)] })
    // L'admission inscrit la pièce au nom de son déposant, dans le réseau.
    expect(await t.run(async (ctx) => (await ctx.db.query("fileScans").withIndex("by_storageId", (q) => q.eq("storageId", fresh)).first())?.uploadedByPersonId)).toBe(carol.personId)
  })

  it("réponse citée : jamais d'un autre fil ; l'extrait est RELU — l'édition se voit, le retrait le vide — et tronqué à 140", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const alice = await enter(t, root, "alice")
    const bob = await enter(t, root, "bob")
    const carol = await enter(t, root, "carol")
    await connect(t, root, alice, bob)
    await connect(t, root, alice, carol)
    const { threadId, messageId: cited } = await open(root, alice, bob, "Première version")
    const elsewhere = await open(root, alice, carol, "Ailleurs")
    const reply = (replyToMessageId: Id<"personalMessages">, content = "Je réponds") => bob.as.mutation(M.messages.sendMessage, { networkId: root, threadId, content, replyToMessageId })
    expect(await codeOf(reply(elsewhere.messageId))).toBe("notFound")
    await reply(cited)
    await alice.as.mutation(M.messages.editMessage, { networkId: root, messageId: cited, content: "Version corrigée" })
    expect((await history(root, alice, threadId))[0]!.replyTo).toEqual({ messageId: cited, senderPersonId: alice.personId, excerpt: "Version corrigée", deleted: false })
    await alice.as.mutation(M.messages.deleteMessage, { networkId: root, messageId: cited })
    expect((await history(root, bob, threadId))[0]!.replyTo).toEqual({ messageId: cited, senderPersonId: alice.personId, excerpt: "", deleted: true })
    const long = await send(root, alice, threadId, "x".repeat(300))
    await reply(long, "Long")
    expect((await history(root, alice, threadId))[0]!.replyTo!.excerpt.length).toBe(140)
  })

  it("R9 : la citation d'un original purgé ne conserve ni identifiant ni extrait de l'auteur effacé", async () => {
    const t = testConvex(), { root } = await seed(t), alice = await enter(t, root, "alice"), bob = await enter(t, root, "bob")
    await connect(t, root, alice, bob)
    const { threadId, messageId: original } = await open(root, alice, bob, "Texte à purger")
    const { messageId: response } = await bob.as.mutation(M.messages.sendMessage, { networkId: root, threadId, content: "Ma réponse demeure", replyToMessageId: original })
    // Contrat du purger : marquer la citation survivante, retirer la référence,
    // puis supprimer PHYSIQUEMENT le message ; aucune pierre tombale de l'auteur.
    await t.run(async (ctx) => { await ctx.db.patch(response, { replyToMessageId: undefined, replyToDeletedAccount: true }); await ctx.db.delete(original) })
    const row = (await history(root, bob, threadId)).find((message) => message.messageId === response)!
    expect(row.content).toBe("Ma réponse demeure")
    expect(row.replyTo).toEqual({ messageId: null, senderPersonId: null, excerpt: "", deleted: true, authorDeleted: true })
    expect(await t.run(async (ctx) => await ctx.db.get(original))).toBeNull()
    expect(JSON.stringify(row.replyTo)).not.toContain(alice.personId)
    expect(JSON.stringify(row.replyTo)).not.toContain("Texte à purger")
  })

  it("les deux suppressions : « pour moi » retire de MA vue seulement, s'ouvre au destinataire, se rejoue sans empiler ; « pour tous » reste à l'auteur", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const alice = await enter(t, root, "alice")
    const bob = await enter(t, root, "bob")
    await connect(t, root, alice, bob)
    const { threadId, messageId } = await open(root, alice, bob, "À toi")
    expect(await codeOf(bob.as.mutation(M.messages.deleteMessage, { networkId: root, messageId }))).toBe("notFound")
    expect(await codeOf(bob.as.mutation(M.messages.editMessage, { networkId: root, messageId, content: "Réécrit" }))).toBe("notFound")
    expect(await bob.as.mutation(M.messages.deleteMessageForMe, { networkId: root, messageId })).toEqual({ hidden: true })
    expect(await history(root, bob, threadId)).toEqual([])
    expect((await history(root, alice, threadId)).map((message) => message.content)).toEqual(["À toi"])
  })

  it("modifier et retirer : l'auteur seul, dans la fenêtre — au-delà la règle le dit ; l'aperçu suit l'édition et se rembobine au retrait ; le contenu retiré est ABSENT (D37)", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(T0)
    const t = testConvex()
    const { root } = await seed(t)
    const alice = await enter(t, root, "alice")
    const bob = await enter(t, root, "bob")
    await connect(t, root, alice, bob)
    const { threadId, messageId: first } = await open(root, alice, bob, "Premier")
    vi.setSystemTime(T0 + 1000)
    const second = await send(root, alice, threadId, "Second")
    await alice.as.mutation(M.messages.editMessage, { networkId: root, messageId: second, content: "Second, modifié" })
    expect((await inbox(root, bob))[0]!.lastMessageText).toBe("Second, modifié")
    expect((await history(root, bob, threadId))[0]).toMatchObject({ content: "Second, modifié", editedAt: T0 + 1000 })
    expect(await alice.as.mutation(M.messages.deleteMessage, { networkId: root, messageId: second })).toEqual({ deleted: true, alreadyDeleted: false })
    expect(await alice.as.mutation(M.messages.deleteMessage, { networkId: root, messageId: second })).toEqual({ deleted: true, alreadyDeleted: true })
    expect((await inbox(root, bob))[0]).toMatchObject({ lastMessageText: "Premier", lastMessageAt: T0 })
    // `undefined` ne traverse pas `t.run` (rendu `null`) : on teste l'absence dans la transaction.
    expect(await t.run(async (ctx) => (await ctx.db.get(second))?.content === undefined)).toBe(true)
    expect((await history(root, bob, threadId))[0]).toMatchObject({ messageId: second, content: null, deleted: true, attachmentFiles: [] })
    expect(await ruleOf(alice.as.mutation(M.messages.editMessage, { networkId: root, messageId: second, content: "Revenir" }))).toBe("MESSAGE_ALREADY_DELETED")
    vi.setSystemTime(T0 + MESSAGE_EDIT_WINDOW_MS + 1)
    expect(await ruleOf(alice.as.mutation(M.messages.editMessage, { networkId: root, messageId: first, content: "Trop tard" }))).toBe("MESSAGE_EDIT_WINDOW_EXPIRED")
    expect(await ruleOf(alice.as.mutation(M.messages.deleteMessage, { networkId: root, messageId: first }))).toBe("MESSAGE_EDIT_WINDOW_EXPIRED")
  })

  it("rend tout l'historique par curseur au-delà des 50 derniers, et marque plus de 100 messages lus par lots chaînés", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(T0)
    const t = testConvex()
    const { root } = await seed(t)
    const alice = await enter(t, root, "alice")
    const bob = await enter(t, root, "bob")
    await connect(t, root, alice, bob)
    const { threadId } = await open(root, bob, alice, "Début")
    for (let index = 1; index <= 230; index += 1) await insertMessage(t, root, threadId, bob, T0 + index)
    await t.run(async (ctx) => setPersonalUnreadTotal(ctx, root, alice.personId, 231))
    const seen: string[] = []
    let cursor: string | null = null
    let isDone = false
    while (!isDone) {
      const page: PaginationResult<{ messageId: Id<"personalMessages"> }> = await alice.as.query(M.messages.paginateMessages, { networkId: root, threadId, paginationOpts: { numItems: 50, cursor } })
      seen.push(...page.page.map((message) => message.messageId))
      cursor = page.continueCursor
      isDone = page.isDone
    }
    expect(new Set(seen).size).toBe(231)
    expect(await alice.as.mutation(M.messages.markRead, { networkId: root, threadId })).toEqual({ markedCount: 100 })
    await t.finishAllScheduledFunctions(vi.runAllTimers)
    expect(await unread(root, alice)).toBe(0)
    expect(await t.run(async (ctx) => (await ctx.db.query("personalMessages").withIndex("by_thread_sender_read", (q) => q.eq("threadId", threadId).eq("senderPersonId", bob.personId).eq("readAt", undefined)).take(5)).length)).toBe(0)
  })
})

// ═══════════════════════════════════════════════════════════════
// Réactions, épingle, saisie
// ═══════════════════════════════════════════════════════════════

describe("réactions, épingle, saisie", () => {
  it("réagir : pose, REMPLACE, retire en reposant le même genre ; la lecture rend MA réaction seulement", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const alice = await enter(t, root, "alice")
    const bob = await enter(t, root, "bob")
    await connect(t, root, alice, bob)
    const { threadId, messageId } = await open(root, alice, bob)
    const react = (who: Person, kind: "like" | "love") => who.as.mutation(M.reactions.toggleMessageReaction, { networkId: root, messageId, kind })
    expect(await react(bob, "like")).toMatchObject({ kind: "like", counts: { like: 1, love: 0 } })
    expect(await react(bob, "love")).toMatchObject({ kind: "love", counts: { like: 0, love: 1 } })
    expect(await react(alice, "love")).toMatchObject({ kind: "love", counts: { love: 2 } })
    expect((await history(root, bob, threadId))[0]!.reactions).toMatchObject({ counts: { love: 2 }, mine: "love" })
    expect(await react(bob, "love")).toMatchObject({ kind: null, counts: { love: 1 } })
    expect((await history(root, bob, threadId))[0]!.reactions.mine).toBeNull()
    expect((await history(root, alice, threadId))[0]!.reactions.mine).toBe("love")
  })

  it("épingler : les deux participants, le second remplace ; null désépingle ; ni message d'un autre fil, ni retiré, ni événement", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const alice = await enter(t, root, "alice")
    const bob = await enter(t, root, "bob")
    const carol = await enter(t, root, "carol")
    await connect(t, root, alice, bob)
    await connect(t, root, alice, carol)
    const { threadId, messageId: first } = await open(root, alice, bob, "À garder")
    const second = await send(root, bob, threadId, "Plutôt ceci")
    const pin = (who: Person, messageId: Id<"personalMessages"> | null) => who.as.mutation(M.pins.setPinnedMessage, { networkId: root, threadId, messageId })
    expect(await pin(alice, first)).toEqual({ pinnedMessageId: first })
    expect(await pin(bob, second)).toEqual({ pinnedMessageId: second })
    expect(await pin(alice, null)).toEqual({ pinnedMessageId: null })
    expect(await pin(alice, null)).toEqual({ pinnedMessageId: null })
    const elsewhere = await open(root, alice, carol)
    expect(await codeOf(pin(alice, elsewhere.messageId))).toBe("notFound")
    const call = await insertMessage(t, root, threadId, alice, Date.now(), "call_started")
    expect(await ruleOf(pin(alice, call))).toBe("MESSAGE_PIN_NOT_TEXT")
    await bob.as.mutation(M.messages.deleteMessage, { networkId: root, messageId: second })
    expect(await ruleOf(pin(alice, second))).toBe("MESSAGE_PIN_DELETED")
  })

  it("la bande d'épingle est RELUE : extrait et auteur aux deux ; rien sans épingle, après retrait — qui fait tomber l'épingle — ni pour qui l'a masquée", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const alice = await enter(t, root, "alice")
    const bob = await enter(t, root, "bob")
    await connect(t, root, alice, bob)
    const { threadId, messageId } = await open(root, alice, bob, "Le rendez-vous est à 10 h")
    const pinned = (who: Person) => who.as.query(M.pins.getPinnedMessage, { networkId: root, threadId })
    expect(await pinned(alice)).toBeNull()
    await bob.as.mutation(M.pins.setPinnedMessage, { networkId: root, threadId, messageId })
    for (const reader of [alice, bob]) {
      expect(await pinned(reader)).toEqual({ messageId, senderPersonId: alice.personId, sender: expect.objectContaining({ displayName: "alice", source: "published" }), excerpt: "Le rendez-vous est à 10 h", hasAttachments: false })
    }
    await bob.as.mutation(M.messages.deleteMessageForMe, { networkId: root, messageId })
    expect(await pinned(bob)).toBeNull()
    expect(await pinned(alice)).not.toBeNull()
    await alice.as.mutation(M.messages.deleteMessage, { networkId: root, messageId })
    expect(await pinned(alice)).toBeNull()
    expect(await t.run(async (ctx) => (await ctx.db.get(threadId))?.pinnedMessageId === undefined)).toBe(true)
  })

  it("la saisie : visible de l'autre seul, lue à l'instant fourni (D16), retirée sur demande, purgée par le passage planifié", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(T0)
    const t = testConvex()
    const { root } = await seed(t)
    const alice = await enter(t, root, "alice")
    const bob = await enter(t, root, "bob")
    await connect(t, root, alice, bob)
    const { threadId } = await open(root, alice, bob)
    const typing = (reader: Person, now: number) => reader.as.query(M.typing.listTyping, { networkId: root, threadId, now })
    await alice.as.mutation(M.typing.setTyping, { networkId: root, threadId })
    await alice.as.mutation(M.typing.setTyping, { networkId: root, threadId })
    expect(await typing(bob, T0)).toEqual([{ personId: alice.personId, label: expect.objectContaining({ displayName: "alice", source: "published" }) }])
    expect(await typing(alice, T0)).toEqual([])
    expect(await typing(bob, T0 + 7000)).toEqual([])
    await alice.as.mutation(M.typing.clearTyping, { networkId: root, threadId })
    expect(await typing(bob, T0)).toEqual([])
    await bob.as.mutation(M.typing.setTyping, { networkId: root, threadId })
    expect(await t.mutation(internal.modules.messaging.typing.purgeExpiredTyping, {})).toEqual({ purged: 0 })
    vi.setSystemTime(T0 + 60_000)
    expect(await t.mutation(internal.modules.messaging.typing.purgeExpiredTyping, {})).toEqual({ purged: 1 })
  })
})

// ═══════════════════════════════════════════════════════════════
// Transfert
// ═══════════════════════════════════════════════════════════════

describe("transférer un message", () => {
  it("copie le texte, pose la provenance, met à jour aperçu et non-lus ; la marque « Transféré » disparaît quand l'original est retiré", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const alice = await enter(t, root, "alice")
    const bob = await enter(t, root, "bob")
    const carol = await enter(t, root, "carol")
    await connect(t, root, alice, bob)
    await connect(t, root, alice, carol)
    const source = await open(root, alice, bob, "À faire suivre")
    const target = await open(root, alice, carol, "Salut")
    const result = await alice.as.mutation(M.forward.forwardMessage, { networkId: root, messageId: source.messageId, to: { kind: "personal", threadId: target.threadId } })
    expect(result).toMatchObject({ threadId: target.threadId, createdThread: false, deduplicated: false })
    expect(await t.run(async (ctx) => (await ctx.db.get(result.messageId))?.forwardedFrom)).toEqual({ kind: "personal", threadId: source.threadId, messageId: source.messageId })
    expect((await history(root, carol, target.threadId))[0]).toMatchObject({ content: "À faire suivre", forwarded: true, isMine: false })
    expect((await inbox(root, carol))[0]).toMatchObject({ lastMessageText: "À faire suivre", unreadCount: 2 })
    expect(await unread(root, carol)).toBe(2)
    await alice.as.mutation(M.messages.deleteMessage, { networkId: root, messageId: source.messageId })
    // La copie survit ; seul le lien vers l'original tombe.
    expect((await history(root, carol, target.threadId))[0]).toMatchObject({ content: "À faire suivre", forwarded: false })
  })

  it("vers un identifiant : crée le fil s'il n'existe pas ; refusé sans relation, sans rien créer ; inconnu et profil retiré se disent pareil", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const alice = await enter(t, root, "alice")
    const bob = await enter(t, root, "bob")
    const carol = await enter(t, root, "carol")
    const dave = await enter(t, root, "dave")
    await connect(t, root, alice, bob)
    await connect(t, root, alice, carol)
    await connect(t, root, alice, dave)
    const source = await open(root, alice, bob, "Pour Carol")
    const forward = (handle: string) => alice.as.mutation(M.forward.forwardMessage, { networkId: root, messageId: source.messageId, to: { kind: "handle", handle } })
    const created = await forward("carol")
    expect(created).toMatchObject({ target: "personal", createdThread: true, deduplicated: false })
    if (created.target !== "personal") throw new Error("cible 1:1 attendue")
    expect(await history(root, carol, created.threadId)).toMatchObject([{ content: "Pour Carol", forwarded: true }])
    const eve = await enter(t, root, "eve")
    expect(await ruleOf(forward("eve"))).toBe("THREAD_RELATION_REQUIRED")
    await dave.as.mutation(api.modules.people.profile.withdrawMyProfile, {})
    expect(await codeOf(forward("dave"))).toBe("notFound")
    expect(await codeOf(forward("inconnu"))).toBe("notFound")
    expect(await t.run(async (ctx) => (await ctx.db.query("personalThreads").take(10)).length)).toBe(2)
    expect(eve.personId).toBeDefined()
  })

  it("est IDEMPOTENT par (cible, clé)", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const alice = await enter(t, root, "alice")
    const bob = await enter(t, root, "bob")
    const carol = await enter(t, root, "carol")
    await connect(t, root, alice, bob)
    await connect(t, root, alice, carol)
    const source = await open(root, alice, bob, "Une fois")
    const target = await open(root, alice, carol)
    const args = { networkId: root, messageId: source.messageId, to: { kind: "personal" as const, threadId: target.threadId }, idempotencyKey: "fwd-1" }
    const first = await alice.as.mutation(M.forward.forwardMessage, args)
    expect(await alice.as.mutation(M.forward.forwardMessage, args)).toEqual({ ...first, deduplicated: true })
    expect((await history(root, carol, target.threadId)).length).toBe(2)
  })

  it("contenu indisponible : retiré, masqué de ma vue, événement d'appel, fil source dont je ne suis pas partie", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const alice = await enter(t, root, "alice")
    const bob = await enter(t, root, "bob")
    const carol = await enter(t, root, "carol")
    await connect(t, root, alice, bob)
    await connect(t, root, alice, carol)
    await connect(t, root, bob, carol)
    const source = await open(root, bob, alice, "Retiré bientôt")
    const target = await open(root, alice, carol)
    const forward = (who: Person, messageId: Id<"personalMessages">, threadId = target.threadId) => who.as.mutation(M.forward.forwardMessage, { networkId: root, messageId, to: { kind: "personal", threadId } })
    const hidden = await send(root, bob, source.threadId, "Masqué")
    await alice.as.mutation(M.messages.deleteMessageForMe, { networkId: root, messageId: hidden })
    expect(await codeOf(forward(alice, hidden))).toBe("notFound")
    const call = await insertMessage(t, root, source.threadId, bob, Date.now(), "call_ended")
    expect(await ruleOf(forward(alice, call))).toBe("MESSAGE_FORWARD_NOT_TEXT")
    await bob.as.mutation(M.messages.deleteMessage, { networkId: root, messageId: source.messageId })
    expect(await ruleOf(forward(alice, source.messageId))).toBe("MESSAGE_FORWARD_UNAVAILABLE")
    // Carol n'est pas partie au fil d'Alice et Bob.
    const bobCarol = await open(root, bob, carol)
    const visible = await send(root, bob, source.threadId, "Privé")
    expect(await codeOf(forward(carol, visible, bobCarol.threadId))).toBe("notFound")
    expect((await history(root, carol, target.threadId)).length).toBe(1)
  })

  it("les pièces sont RECOPIÉES avec les métadonnées du stockage, sans refus (ce n'est pas un dépôt) ; un blob disparu refuse sans rien insérer", async () => {
    vi.useFakeTimers()
    const t = testConvex()
    const { root } = await seed(t)
    const alice = await enter(t, root, "alice")
    const bob = await enter(t, root, "bob")
    const carol = await enter(t, root, "carol")
    await connect(t, root, alice, bob)
    await connect(t, root, alice, carol)
    const source = await open(root, bob, alice)
    const target = await open(root, alice, carol)
    const photo = await store(t, PNG, "image/png")
    const { messageId } = await bob.as.mutation(M.messages.sendMessage, { networkId: root, threadId: source.threadId, content: "Regarde", attachmentFiles: [png(photo, "plage.png")] })
    const forwarded = await alice.as.mutation(M.forward.forwardMessage, { networkId: root, messageId, to: { kind: "personal", threadId: target.threadId } })
    expect(await t.run(async (ctx) => (await ctx.db.get(forwarded.messageId))?.attachmentFiles)).toEqual([{ storageId: photo, filename: "plage.png", mimeType: "image/png", sizeBytes: PNG.length }])
    // Le registre ne change pas de déposant : le blob reste celui de l'original.
    expect(await t.run(async (ctx) => (await ctx.db.query("fileScans").withIndex("by_storageId", (q) => q.eq("storageId", photo)).first())?.uploadedByPersonId)).toBe(bob.personId)
    const gone = await store(t, PNG, "image/png")
    const lost = await bob.as.mutation(M.messages.sendMessage, { networkId: root, threadId: source.threadId, content: "Bientôt perdu", attachmentFiles: [png(gone)] })
    await t.run(async (ctx) => ctx.storage.delete(gone))
    expect(await codeOf(alice.as.mutation(M.forward.forwardMessage, { networkId: root, messageId: lost.messageId, to: { kind: "personal", threadId: target.threadId } }))).toBe("notFound")
    expect((await history(root, carol, target.threadId)).length).toBe(2)
  })
})

// ═══════════════════════════════════════════════════════════════
// Entre réseaux
// ═══════════════════════════════════════════════════════════════

describe("entre réseaux", () => {
  it("une paire a UN fil par réseau ; boîte, pastille, conversation et lien profond de chaque réseau ne voient que les siens", async () => {
    const t = testConvex()
    const { root, testClosed } = await seed(t)
    const alice = await enter(t, root, "alice")
    const bob = await enter(t, root, "bob")
    await joinAlso(t, testClosed, alice)
    await joinAlso(t, testClosed, bob)
    await connect(t, root, alice, bob)
    // Être en relation à la racine n'ouvre rien dans un autre réseau.
    expect(await ruleOf(open(testClosed, alice, bob))).toBe("THREAD_RELATION_REQUIRED")
    await connect(t, testClosed, alice, bob)
    const inRoot = await open(root, alice, bob, "À la racine")
    const inClosed = await open(testClosed, alice, bob, "Dans le réseau fermé")
    expect(inClosed.threadId).not.toBe(inRoot.threadId)
    expect((await inbox(root, bob)).map((row) => row.threadId)).toEqual([inRoot.threadId])
    expect((await inbox(testClosed, bob)).map((row) => row.threadId)).toEqual([inClosed.threadId])
    expect([await unread(root, bob), await unread(testClosed, bob)]).toEqual([1, 1])
    expect(await codeOf(history(testClosed, bob, inRoot.threadId))).toBe("notFound")
    expect(await bob.as.query(M.inbox.getThread, { networkId: root, threadId: inClosed.threadId })).toBeNull()
    await bob.as.mutation(M.messages.markRead, { networkId: root, threadId: inRoot.threadId })
    expect([await unread(root, bob), await unread(testClosed, bob)]).toEqual([0, 1])
  })

  it("un message ne se transfère pas d'un réseau à l'autre : refus EXPLICITE pour un fil dont je suis partie, dans les deux sens", async () => {
    const t = testConvex()
    const { root, testClosed } = await seed(t)
    const alice = await enter(t, root, "alice")
    const bob = await enter(t, root, "bob")
    await joinAlso(t, testClosed, alice)
    await joinAlso(t, testClosed, bob)
    await connect(t, root, alice, bob)
    await connect(t, testClosed, alice, bob)
    const inRoot = await open(root, alice, bob, "Racine")
    const inClosed = await open(testClosed, alice, bob, "Fermé")
    // Cible d'un autre réseau.
    expect(await ruleOf(alice.as.mutation(M.forward.forwardMessage, { networkId: root, messageId: inRoot.messageId, to: { kind: "personal", threadId: inClosed.threadId } }))).toBe("MESSAGE_FORWARD_CROSS_NETWORK")
    // Source d'un autre réseau.
    expect(await ruleOf(alice.as.mutation(M.forward.forwardMessage, { networkId: testClosed, messageId: inRoot.messageId, to: { kind: "personal", threadId: inClosed.threadId } }))).toBe("MESSAGE_FORWARD_CROSS_NETWORK")
    expect([(await history(root, bob, inRoot.threadId)).length, (await history(testClosed, bob, inClosed.threadId)).length]).toEqual([1, 1])
  })
})


describe("private conversation filing", () => {
  it("archives only for the acting participant, moves a pin and rejects outsiders", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const alice = await enter(t, root, "alice")
    const bob = await enter(t, root, "bob")
    const outsider = await enter(t, root, "carla")
    await connect(t, root, alice, bob)
    const { threadId } = await open(root, alice, bob)
    const side = alice.personId < bob.personId ? "low" as const : "high" as const
    const options = { networkId: root, side, paginationOpts: { cursor: null, numItems: 10 } }
    const query = M.inbox.paginateMyFiledThreads
    const write = M.inbox.setMyThreadPreference

    await alice.as.mutation(write, { networkId: root, threadId, change: { shelf: "pinned" } })
    expect((await alice.as.query(query, { ...options, shelf: "pinned" })).page.map(row => row.threadId)).toEqual([threadId])
    expect((await alice.as.query(query, options)).page).toEqual([])
    await alice.as.mutation(write, { networkId: root, threadId, change: { shelf: "archived" } })
    expect((await alice.as.query(query, { ...options, shelf: "pinned" })).page).toEqual([])
    expect((await alice.as.query(query, { ...options, shelf: "archived" })).page.map(row => row.threadId)).toEqual([threadId])
    expect((await bob.as.query(M.inbox.getThread, { networkId: root, threadId }))?.shelf).toBeUndefined()
    await expect(outsider.as.mutation(write, { networkId: root, threadId, change: { shelf: "archived" } })).rejects.toThrow()

    await alice.as.mutation(write, { networkId: root, threadId, change: { shelf: null } })
    expect((await alice.as.query(query, options)).page.map(row => row.threadId)).toEqual([threadId])
  })
})
