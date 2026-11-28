// @vitest-environment edge-runtime
// Dupliqué de socle/convex/modules/reseauPersonnel/groupes.test.ts (avec socle/convex/modules/reseauPersonnel/groupes.cascadeBlobs.test.ts et les cas de transfert de groupe de socle/convex/modules/messagerieScope/transfert.test.ts) @ ad2e7fdc2 — adaptations : personnes et réseaux (graine des fondations) ; codes et règles au lieu des libellés ; appels de groupe (→ lot 15), espaces poste / personnel, comptes publics et coffre retirés ; membres et conviés lus par pages ; la pastille est un compteur TENU (diffusion par lots exécutée par le harnais) ; tests neufs : la diffusion rejouée ne recompte rien, le blocage recompte les fils partagés (D23), masquage par table (D22), fil et jeton d'un autre réseau introuvables, transfert refusé entre réseaux, purge qui épargne le blob d'une copie vivante.
import { GROUP_MEMBERS_MAX } from "@antsia/social-contracts/groupCapacity"
import { engineErrorCode, engineErrorRule } from "@antsia/social-contracts/errors"
import { MESSAGE_EDIT_WINDOW_MS } from "@antsia/social-contracts/messaging"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { api, internal } from "../../_generated/api"
import type { Id } from "../../_generated/dataModel"
import { SEED_CONFIRMATION } from "../../seeds/foundations"
import { testConvex } from "../../test.setup"
import { recordThreadMember } from "./access"
import { recomputeGroupUnreadTotal } from "./unread"

type T = ReturnType<typeof testConvex>
type Person = { as: ReturnType<T["withIdentity"]>; personId: Id<"persons">; handle: string }

const G = api.modules.groups
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13])
const SOUND = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0, 1, 2, 3, 4, 5, 6])
const T0 = Date.UTC(2026, 9, 15, 9, 0, 0)
const PAGE = { numItems: 100, cursor: null }

beforeEach(() => {
  vi.stubEnv("CONVEX_CLOUD_URL", "http://127.0.0.1:3210")
  vi.useFakeTimers()
  vi.setSystemTime(T0)
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

/** Avance l'horloge (sans déclencher de minuteur) : deux gestes ne partagent pas la même milliseconde. */
function tick(ms = 1000): void {
  vi.setSystemTime(Date.now() + ms)
}

/** Exécute les diffusions planifiées (non-lus, activité, cloches). */
async function settle(t: T): Promise<void> {
  await t.finishAllScheduledFunctions(vi.runAllTimers)
}

/** Le trio de base : alice (créatrice), bob et carla, connectés à alice. */
async function trio(t: T, root: Id<"networks">) {
  const alice = await enter(t, root, "alice")
  const bob = await enter(t, root, "bob")
  const carla = await enter(t, root, "carla")
  await connect(t, root, alice, bob)
  await connect(t, root, alice, carla)
  return { alice, bob, carla }
}

async function create(owner: Person, networkId: Id<"networks">, invitees: Person[], options: { title?: string; key?: string } = {}) {
  return (await owner.as.mutation(G.threads.createGroup, { networkId, title: options.title ?? "Comité", memberHandles: invitees.map((p) => p.handle), idempotencyKey: options.key ?? "cle-1" })).threadId
}

/** Un groupe CONSTITUÉ : créé, puis rejoint par chaque convié. */
async function constituted(owner: Person, networkId: Id<"networks">, invitees: Person[], options: { title?: string; key?: string } = {}) {
  const threadId = await create(owner, networkId, invitees, options)
  for (const invitee of invitees) {
    tick(1)
    await invitee.as.mutation(G.invites.respondGroupInvite, { networkId, threadId, accept: true })
  }
  tick()
  return threadId
}

async function send(networkId: Id<"networks">, from: Person, threadId: Id<"groupThreads">, content: string, extra: { replyToMessageId?: Id<"groupMessages">; idempotencyKey?: string } = {}) {
  tick()
  return (await from.as.mutation(G.messages.sendGroupMessage, { networkId, threadId, content, ...extra })).messageId
}

async function history(networkId: Id<"networks">, reader: Person, threadId: Id<"groupThreads">) {
  return (await reader.as.query(G.messages.paginateGroupMessages, { networkId, threadId, paginationOpts: PAGE })).page
}

async function texts(networkId: Id<"networks">, reader: Person, threadId: Id<"groupThreads">) {
  return (await history(networkId, reader, threadId)).filter((m) => m.type === "text").map((m) => m.content)
}

async function unread(networkId: Id<"networks">, reader: Person) {
  return (await reader.as.query(G.threads.totalUnread, { networkId })).total
}

async function myThreads(networkId: Id<"networks">, reader: Person) {
  return (await reader.as.query(G.threads.paginateMyGroupThreads, { networkId, paginationOpts: PAGE })).page
}

async function card(networkId: Id<"networks">, reader: Person, threadId: Id<"groupThreads">) {
  return await reader.as.query(G.threads.getGroupThread, { networkId, threadId })
}

async function bellKinds(networkId: Id<"networks">, person: Person) {
  return (await person.as.query(api.modules.notifications.bell.paginateNotifications, { networkId, paginationOpts: { numItems: 50, cursor: null } })).page.map((row) => row.kind)
}

async function store(t: T, bytes: Uint8Array, type: string): Promise<Id<"_storage">> {
  return await t.run(async (ctx) => ctx.storage.store(new Blob([bytes as BlobPart], { type })))
}

const png = (storageId: Id<"_storage">, filename = "photo.png") => ({ storageId, filename, mimeType: "image/png", sizeBytes: PNG.length })

async function recomputed(t: T, networkId: Id<"networks">, person: Person) {
  return await t.run(async (ctx) => recomputeGroupUnreadTotal(ctx, networkId, person.personId))
}

// ═══════════════════════════════════════════════════════════════
// Création — qui peut entrer, et combien
// ═══════════════════════════════════════════════════════════════

describe("createGroup — qui peut entrer, et combien", () => {
  it("refuse un titre vide ou blanc, et un groupe de moins de trois ; soi-même se dit", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const { alice, bob, carla } = await trio(t, root)
    const make = (title: string, handles: string[], key: string) => alice.as.mutation(G.threads.createGroup, { networkId: root, title, memberHandles: handles, idempotencyKey: key })
    expect(await ruleOf(make("   ", ["bob", "carla"], "k1"))).toBe("GROUP_NAME_LENGTH")
    expect(await ruleOf(make("Duo", ["bob"], "k2"))).toBe("GROUP_TOO_FEW_MEMBERS")
    expect(await ruleOf(make("Duo", ["bob", "bob"], "k3"))).toBe("GROUP_TOO_FEW_MEMBERS")
    expect(await ruleOf(make("Moi", ["alice", "bob"], "k4"))).toBe("GROUP_SELF_MEMBER")
    expect(carla.personId).toBeDefined()
    expect(bob.personId).toBeDefined()
  })

  it("crée le fil : créatrice owner, effectif 1, message système ; les autres sont INVITÉS et décident", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const { alice, bob, carla } = await trio(t, root)
    const threadId = await create(alice, root, [bob, carla])
    expect(await card(root, alice, threadId)).toMatchObject({ title: "Comité", memberCount: 1, myRole: "owner", createdBy: { personId: alice.personId, isMe: true } })
    expect(await codeOf(card(root, bob, threadId))).toBe("notFound")
    const invites = await bob.as.query(G.invites.myGroupInvites, { networkId: root, paginationOpts: PAGE })
    expect(invites.page).toMatchObject([{ threadId, title: "Comité", memberCount: 1, invitedBy: { personId: alice.personId, displayName: "alice" } }])
    expect((await history(root, alice, threadId)).map((m) => m.event)).toEqual(["group_created"])
    await bob.as.mutation(G.invites.respondGroupInvite, { networkId: root, threadId, accept: true })
    expect(await card(root, bob, threadId)).toMatchObject({ memberCount: 2, myRole: "member" })
  })

  it("refuser une invitation n'annonce RIEN au groupe, et ne se rejoue pas", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const { alice, bob, carla } = await trio(t, root)
    const threadId = await create(alice, root, [bob, carla])
    expect(await bob.as.mutation(G.invites.respondGroupInvite, { networkId: root, threadId, accept: false })).toEqual({ joined: false })
    expect((await history(root, alice, threadId)).map((m) => m.event)).toEqual(["group_created"])
    expect(await codeOf(bob.as.mutation(G.invites.respondGroupInvite, { networkId: root, threadId, accept: true }))).toBe("notFound")
  })

  it("est idempotente par (créatrice, clé) : le rejeu rend le MÊME fil ; rejouée dans un autre réseau, la clé est refusée", async () => {
    const t = testConvex()
    const { root, testClosed } = await seed(t)
    const { alice, bob, carla } = await trio(t, root)
    await joinAlso(t, testClosed, alice)
    const first = await alice.as.mutation(G.threads.createGroup, { networkId: root, title: "Comité", memberHandles: ["bob", "carla"], idempotencyKey: "k" })
    expect(await alice.as.mutation(G.threads.createGroup, { networkId: root, title: "Autre", memberHandles: [], idempotencyKey: "k" })).toEqual({ threadId: first.threadId, created: false })
    expect(await codeOf(alice.as.mutation(G.threads.createGroup, { networkId: testClosed, title: "Comité", memberHandles: ["bob", "carla"], idempotencyKey: "k" }))).toBe("conflict")
    expect([bob.personId, carla.personId]).toHaveLength(2)
  })

  it("refuse un NON-CONNECTÉ, un BLOQUÉ et un profil retiré du même mot qu'un identifiant inconnu", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const { alice, bob } = await trio(t, root)
    const dora = await enter(t, root, "dora")
    const eric = await enter(t, root, "eric")
    const fanny = await enter(t, root, "fanny")
    await connect(t, root, alice, eric)
    await connect(t, root, alice, fanny)
    await alice.as.mutation(api.modules.graph.connections.blockPerson, { networkId: root, targetPersonId: eric.personId })
    await fanny.as.mutation(api.modules.people.profile.withdrawMyProfile, {})
    for (const [handle, key] of [["inconnu", "k1"], ["dora", "k2"], ["eric", "k3"], ["fanny", "k4"]] as const) {
      expect(await codeOf(alice.as.mutation(G.threads.createGroup, { networkId: root, title: "Comité", memberHandles: ["bob", handle], idempotencyKey: key }))).toBe("notFound")
    }
    expect(dora.personId).toBeDefined()
  })

  it("émet `group_added` pour chaque convié — jamais pour la créatrice — avec le fil pour sujet", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const { alice, bob, carla } = await trio(t, root)
    const threadId = await create(alice, root, [bob, carla])
    await settle(t)
    for (const invitee of [bob, carla]) {
      const rows = (await invitee.as.query(api.modules.notifications.bell.paginateNotifications, { networkId: root, paginationOpts: { numItems: 10, cursor: null } })).page
      expect(rows).toMatchObject([{ kind: "group_added", subject: { kind: "groupThread", id: threadId } }])
    }
    expect(await bellKinds(root, alice)).toEqual([])
  })
})

// ═══════════════════════════════════════════════════════════════
// Le refus indistinct
// ═══════════════════════════════════════════════════════════════

describe("le refus indistinct", () => {
  it("rend le MÊME refus pour un non-membre, un membre PARTI, un fil supprimé et un fil d'un autre réseau", async () => {
    const t = testConvex()
    const { root, testClosed } = await seed(t)
    const { alice, bob, carla } = await trio(t, root)
    const dora = await enter(t, root, "dora")
    const threadId = await constituted(alice, root, [bob, carla])
    const probes = (who: Person, networkId: Id<"networks">) => [
      who.as.query(G.threads.getGroupThread, { networkId, threadId }),
      who.as.query(G.messages.paginateGroupMessages, { networkId, threadId, paginationOpts: PAGE }),
      who.as.mutation(G.messages.sendGroupMessage, { networkId, threadId, content: "Intrus" }),
      who.as.mutation(G.threads.markGroupRead, { networkId, threadId }),
      who.as.query(G.typing.listGroupTyping, { networkId, threadId, now: T0 }),
    ]
    for (const probe of probes(dora, root)) expect(await codeOf(probe)).toBe("notFound")
    await carla.as.mutation(G.threads.leaveGroup, { networkId: root, threadId })
    for (const probe of probes(carla, root)) expect(await codeOf(probe)).toBe("notFound")
    await joinAlso(t, testClosed, bob)
    for (const probe of probes(bob, testClosed)) expect(await codeOf(probe)).toBe("notFound")
    await alice.as.mutation(G.cascade.deleteGroup, { networkId: root, threadId })
    for (const probe of probes(alice, root)) expect(await codeOf(probe)).toBe("notFound")
  })
})

// ═══════════════════════════════════════════════════════════════
// Messages, curseur, cloche, pastille
// ═══════════════════════════════════════════════════════════════

describe("messages, curseur, cloche et pastille", () => {
  it("envoie, déduplique par clé, avance le curseur de l'expéditeur et compte chez les autres", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const { alice, bob, carla } = await trio(t, root)
    const threadId = await constituted(alice, root, [bob, carla])
    const first = await bob.as.mutation(G.messages.sendGroupMessage, { networkId: root, threadId, content: "Bonjour", idempotencyKey: "k" })
    expect(await bob.as.mutation(G.messages.sendGroupMessage, { networkId: root, threadId, content: "Bonjour", idempotencyKey: "k" })).toEqual({ messageId: first.messageId, deduplicated: true })
    await settle(t)
    expect([await unread(root, alice), await unread(root, bob), await unread(root, carla)]).toEqual([1, 0, 1])
    expect(await texts(root, carla, threadId)).toEqual(["Bonjour"])
    expect((await myThreads(root, alice))[0]).toMatchObject({ threadId, lastMessageText: "Bonjour", lastMessageKind: "text", lastMessageByMe: false, unreadCount: 1 })
    expect(await recomputed(t, root, alice)).toEqual({ total: 1, truncated: false })
  })

  it("markGroupRead avance PUIS devient un no-op tant que rien n'arrive ; la pastille suit", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const { alice, bob, carla } = await trio(t, root)
    const threadId = await constituted(alice, root, [bob, carla])
    await send(root, bob, threadId, "Un")
    await send(root, carla, threadId, "Deux")
    await settle(t)
    expect(await unread(root, alice)).toBe(2)
    expect(await alice.as.mutation(G.threads.markGroupRead, { networkId: root, threadId })).toEqual({ updated: true })
    expect(await alice.as.mutation(G.threads.markGroupRead, { networkId: root, threadId })).toEqual({ updated: false })
    expect(await unread(root, alice)).toBe(0)
    await send(root, bob, threadId, "Trois")
    await settle(t)
    expect(await unread(root, alice)).toBe(1)
    expect(await recomputed(t, root, alice)).toEqual({ total: 1, truncated: false })
  })

  it("une diffusion rejouée ou en retard ne recompte RIEN — un message s'examine une fois par membre", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const { alice, bob, carla } = await trio(t, root)
    const threadId = await constituted(alice, root, [bob, carla])
    const one = await send(root, bob, threadId, "Un")
    const two = await send(root, bob, threadId, "Deux")
    // Le second passe AVANT le premier, puis chacun est rejoué.
    await t.mutation(internal.modules.groups.unread.fanoutGroupMessage, { messageId: two, cursor: null })
    await t.mutation(internal.modules.groups.unread.fanoutGroupMessage, { messageId: one, cursor: null })
    await t.mutation(internal.modules.groups.unread.fanoutGroupMessage, { messageId: two, cursor: null })
    await settle(t)
    expect(await unread(root, alice)).toBe(2)
    expect(await recomputed(t, root, alice)).toEqual({ total: 2, truncated: false })
  })

  it("sonne `group_message` chez les autres membres — une ligne par expéditeur, muette en sourdine", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const { alice, bob, carla } = await trio(t, root)
    const threadId = await constituted(alice, root, [bob, carla])
    await settle(t)
    await carla.as.mutation(G.threads.setGroupMuted, { networkId: root, threadId, muted: true })
    await send(root, bob, threadId, "Un")
    await send(root, bob, threadId, "Deux")
    await settle(t)
    expect((await bellKinds(root, alice)).filter((kind) => kind === "group_message")).toHaveLength(1)
    expect(await bellKinds(root, carla)).not.toContain("group_message")
    expect(await bellKinds(root, bob)).not.toContain("group_message")
    // La sourdine coupe la cloche, pas les non-lus.
    expect(await unread(root, carla)).toBe(2)
  })

  it("pagine sans perte plus d'une page de messages à la même milliseconde", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const { alice, bob, carla } = await trio(t, root)
    const threadId = await constituted(alice, root, [bob, carla])
    const at = Date.now() + 5000
    await t.run(async (ctx) => {
      for (let index = 0; index < 130; index += 1) await ctx.db.insert("groupMessages", { networkId: root, threadId, senderPersonId: bob.personId, type: "text", content: `m${index}`, createdAt: at })
    })
    const seen = new Set<string>()
    let cursor: string | null = null
    for (let pages = 0; pages < 10; pages += 1) {
      const page: { page: { messageId: string }[]; continueCursor: string; isDone: boolean } = await alice.as.query(G.messages.paginateGroupMessages, { networkId: root, threadId, paginationOpts: { numItems: 40, cursor } })
      for (const message of page.page) seen.add(message.messageId)
      if (page.isDone) break
      cursor = page.continueCursor
    }
    expect(seen.size).toBe(130 + 3)
  })

  it("liste MES groupes par activité, à curseur natif ; un groupe réactivé revient en tête", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const { alice, bob, carla } = await trio(t, root)
    const first = await constituted(alice, root, [bob, carla], { title: "Premier", key: "k1" })
    const second = await constituted(alice, root, [bob, carla], { title: "Second", key: "k2" })
    await settle(t)
    expect((await myThreads(root, bob)).map((row) => row.title)).toEqual(["Second", "Premier"])
    await send(root, carla, first, "Je reviens")
    await settle(t)
    expect((await myThreads(root, bob)).map((row) => row.threadId)).toEqual([first, second])
    const page = await bob.as.query(G.threads.paginateMyGroupThreads, { networkId: root, paginationOpts: { numItems: 1, cursor: null } })
    expect(page.page.map((row) => row.threadId)).toEqual([first])
    expect(page.isDone).toBe(false)
  })
})

// ═══════════════════════════════════════════════════════════════
// Blocage ultérieur — le fil demeure, le corps du bloqué est retiré
// ═══════════════════════════════════════════════════════════════

describe("blocage ultérieur — le fil demeure, le corps du bloqué est retiré", () => {
  it("retire texte, pièces et aperçu du bloqué, dans les deux sens, sans casser le fil des autres", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const { alice, bob, carla } = await trio(t, root)
    const threadId = await constituted(alice, root, [bob, carla])
    const photo = await store(t, PNG, "image/png")
    tick()
    await bob.as.mutation(G.messages.sendGroupMessage, { networkId: root, threadId, content: "Regardez", attachmentFiles: [png(photo)] })
    await settle(t)
    await alice.as.mutation(api.modules.graph.connections.blockPerson, { networkId: root, targetPersonId: bob.personId })
    const forAlice = (await history(root, alice, threadId)).find((m) => m.senderPersonId === bob.personId && m.type === "text")!
    expect(forAlice).toMatchObject({ content: null, attachmentFiles: [], masked: true })
    expect((await myThreads(root, alice))[0]).toMatchObject({ lastMessageText: null })
    await send(root, alice, threadId, "Et moi")
    const forBob = (await history(root, bob, threadId)).find((m) => m.senderPersonId === alice.personId && m.type === "text")!
    expect(forBob).toMatchObject({ content: null, masked: true })
    expect(await texts(root, carla, threadId)).toEqual(["Et moi", "Regardez"])
  })

  it("ne compte pas en non-lu ce que l'écran ne montrera pas : bloquer recompte les fils partagés, débloquer les rend (D23)", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const { alice, bob, carla } = await trio(t, root)
    const threadId = await constituted(alice, root, [bob, carla])
    await send(root, bob, threadId, "B1")
    await send(root, bob, threadId, "B2")
    await send(root, carla, threadId, "C1")
    await settle(t)
    expect(await unread(root, alice)).toBe(3)
    await alice.as.mutation(api.modules.graph.connections.blockPerson, { networkId: root, targetPersonId: bob.personId })
    expect(await unread(root, alice)).toBe(1)
    await send(root, bob, threadId, "B3")
    await settle(t)
    expect(await unread(root, alice)).toBe(1)
    expect(await recomputed(t, root, alice)).toEqual({ total: 1, truncated: false })
    await alice.as.mutation(api.modules.graph.connections.unblockPerson, { networkId: root, targetPersonId: bob.personId })
    expect(await unread(root, alice)).toBe(4)
    expect(await recomputed(t, root, alice)).toEqual({ total: 4, truncated: false })
  })
})

// ═══════════════════════════════════════════════════════════════
// Pièces jointes de groupe
// ═══════════════════════════════════════════════════════════════

describe("pièces jointes de groupe", () => {
  it("URL de dépôt sans appartenance ; poids menteur refusé ; blob disparu refusé ; cinq au plus ; texte vide avec une pièce, jamais nu", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const { alice, bob, carla } = await trio(t, root)
    const outsider = await enter(t, root, "dora")
    expect(typeof (await outsider.as.mutation(G.messages.generateAttachmentUploadUrl, { networkId: root }))).toBe("string")
    const threadId = await constituted(alice, root, [bob, carla])
    const sendFiles = (files: ReturnType<typeof png>[], content = "") => bob.as.mutation(G.messages.sendGroupMessage, { networkId: root, threadId, content, attachmentFiles: files })
    const lying = await store(t, PNG, "image/png")
    expect(await ruleOf(sendFiles([{ ...png(lying), sizeBytes: 3 }]))).toBe("UPLOAD_MISMATCH")
    const gone = await store(t, PNG, "image/png")
    await t.run(async (ctx) => ctx.storage.delete(gone))
    expect(await codeOf(sendFiles([png(gone)]))).toBe("notFound")
    const six = await Promise.all(Array.from({ length: 6 }, () => store(t, PNG, "image/png")))
    expect(await ruleOf(sendFiles(six.map((id) => png(id))))).toBe("ATTACHMENTS_TOO_MANY")
    expect(await ruleOf(bob.as.mutation(G.messages.sendGroupMessage, { networkId: root, threadId, content: " " }))).toBe("MESSAGE_EMPTY")
    tick()
    await sendFiles([png(lying, "vraie.png")])
    const [message] = await history(root, carla, threadId)
    expect(message).toMatchObject({ content: null, attachmentFiles: [{ filename: "vraie.png", sizeBytes: PNG.length, withheld: "fileScanPending" }] })
    expect((await myThreads(root, carla))[0]).toMatchObject({ lastMessageKind: "attachments", lastMessageAttachmentCount: 1, lastMessageText: null })
  })

  it("un vocal se dit par le mime de sa pièce, porte sa durée, et se plafonne à cinq minutes", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const { alice, bob, carla } = await trio(t, root)
    const threadId = await constituted(alice, root, [bob, carla])
    const voice = (storageId: Id<"_storage">, durationMs: number) => ({ storageId, filename: "vocal.webm", mimeType: "audio/webm", sizeBytes: SOUND.length, durationMs })
    const tooLong = await store(t, SOUND, "audio/webm")
    expect(await ruleOf(bob.as.mutation(G.messages.sendGroupMessage, { networkId: root, threadId, content: "", attachmentFiles: [voice(tooLong, 6 * 60_000)] }))).toBe("VOICE_TOO_LONG")
    const sound = await store(t, SOUND, "audio/webm")
    tick()
    await bob.as.mutation(G.messages.sendGroupMessage, { networkId: root, threadId, content: "", attachmentFiles: [voice(sound, 30_000)] })
    expect((await history(root, carla, threadId))[0]!.attachmentFiles).toMatchObject([{ mimeType: "audio/webm", durationMs: 30_000 }])
    expect((await myThreads(root, carla))[0]).toMatchObject({ lastMessageKind: "voice" })
  })
})

// ═══════════════════════════════════════════════════════════════
// Réponse citée, réactions, suppressions
// ═══════════════════════════════════════════════════════════════

describe("réponse citée, réactions et suppressions", () => {
  it("cite le MÊME fil seulement ; l'extrait est RELU — l'édition se voit, le masquage et le retrait le vident", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const { alice, bob, carla } = await trio(t, root)
    const threadId = await constituted(alice, root, [bob, carla], { key: "k1" })
    const other = await constituted(alice, root, [bob, carla], { key: "k2" })
    const elsewhere = await send(root, bob, other, "Ailleurs")
    expect(await codeOf(bob.as.mutation(G.messages.sendGroupMessage, { networkId: root, threadId, content: "Réponse", replyToMessageId: elsewhere }))).toBe("notFound")
    const cited = await send(root, alice, threadId, "Première version")
    await send(root, bob, threadId, "Je réponds", { replyToMessageId: cited })
    await alice.as.mutation(G.messages.editGroupMessage, { networkId: root, messageId: cited, content: "Version corrigée" })
    expect((await history(root, carla, threadId))[0]!.replyTo).toEqual({ messageId: cited, senderPersonId: alice.personId, excerpt: "Version corrigée", deleted: false })
    await carla.as.mutation(G.messages.deleteGroupMessageForMe, { networkId: root, messageId: cited })
    expect((await history(root, carla, threadId))[0]!.replyTo).toMatchObject({ excerpt: "", deleted: true })
    expect((await history(root, bob, threadId))[0]!.replyTo).toMatchObject({ excerpt: "Version corrigée", deleted: false })
    await alice.as.mutation(G.messages.deleteGroupMessage, { networkId: root, messageId: cited })
    expect((await history(root, bob, threadId))[0]!.replyTo).toMatchObject({ excerpt: "", deleted: true })
  })

  it("R9 : citation de groupe anonyme après suppression physique, sans texte ni identifiants", async () => {
    const t = testConvex(), { root } = await seed(t), { alice, bob, carla } = await trio(t, root)
    const threadId = await constituted(alice, root, [bob, carla])
    const original = await send(root, alice, threadId, "Texte à purger")
    const response = await send(root, bob, threadId, "Ma réponse demeure", { replyToMessageId: original })
    await t.run(async (ctx) => { await ctx.db.patch(response, { replyToMessageId: undefined, replyToDeletedAccount: true }); await ctx.db.delete(original) })
    const row = (await history(root, carla, threadId)).find((message) => message.messageId === response)!
    expect(row.content).toBe("Ma réponse demeure")
    expect(row.replyTo).toEqual({ messageId: null, senderPersonId: null, excerpt: "", deleted: true, authorDeleted: true })
    expect(await t.run(async (ctx) => await ctx.db.get(original))).toBeNull()
    expect(JSON.stringify(row.replyTo)).not.toContain(alice.personId)
    expect(JSON.stringify(row.replyTo)).not.toContain("Texte à purger")
  })

  it("réagir : pose, remplace, retire ; additionne deux personnes et rend MA réaction ; un non-membre est refusé", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const { alice, bob, carla } = await trio(t, root)
    const dora = await enter(t, root, "dora")
    const threadId = await constituted(alice, root, [bob, carla])
    const messageId = await send(root, alice, threadId, "Réagissez")
    const react = (who: Person, kind: "like" | "love") => who.as.mutation(G.messages.toggleGroupMessageReaction, { networkId: root, messageId, kind })
    expect(await react(bob, "like")).toMatchObject({ kind: "like", counts: { like: 1 } })
    expect(await react(bob, "love")).toMatchObject({ kind: "love", counts: { like: 0, love: 1 } })
    expect(await react(carla, "love")).toMatchObject({ counts: { love: 2 } })
    expect((await history(root, bob, threadId))[0]!.reactions).toMatchObject({ counts: { love: 2 }, mine: "love" })
    expect(await react(bob, "love")).toMatchObject({ kind: null, counts: { love: 1 } })
    expect((await history(root, alice, threadId))[0]!.reactions.mine).toBeNull()
    expect(await codeOf(react(dora, "like"))).toBe("notFound")
  })

  it("« pour moi » retire de MA vue seulement, se rejoue sans empiler, et fait tomber MA pastille (D22)", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const { alice, bob, carla } = await trio(t, root)
    const threadId = await constituted(alice, root, [bob, carla])
    const messageId = await send(root, bob, threadId, "À masquer")
    await settle(t)
    expect(await unread(root, alice)).toBe(1)
    await alice.as.mutation(G.messages.deleteGroupMessageForMe, { networkId: root, messageId })
    await alice.as.mutation(G.messages.deleteGroupMessageForMe, { networkId: root, messageId })
    expect(await unread(root, alice)).toBe(0)
    expect(await texts(root, alice, threadId)).toEqual([])
    expect(await texts(root, carla, threadId)).toEqual(["À masquer"])
    expect(await t.run(async (ctx) => (await ctx.db.query("groupMessageHides").withIndex("by_message", (q) => q.eq("messageId", messageId)).take(5)).length)).toBe(1)
    expect(await recomputed(t, root, alice)).toEqual({ total: 0, truncated: false })
  })

  it("modifier et retirer : l'auteur seul, dans la fenêtre ; « (modifié) » ; l'aperçu suit ; pierre tombale idempotente ; « pour moi » marche encore après", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const { alice, bob, carla } = await trio(t, root)
    const threadId = await constituted(alice, root, [bob, carla])
    const messageId = await send(root, bob, threadId, "Brouillon")
    expect(await codeOf(alice.as.mutation(G.messages.editGroupMessage, { networkId: root, messageId, content: "Pas à moi" }))).toBe("notFound")
    expect(await codeOf(alice.as.mutation(G.messages.deleteGroupMessage, { networkId: root, messageId }))).toBe("notFound")
    tick()
    const { editedAt } = await bob.as.mutation(G.messages.editGroupMessage, { networkId: root, messageId, content: "Version finale" })
    expect((await history(root, carla, threadId))[0]).toMatchObject({ content: "Version finale", editedAt })
    expect((await myThreads(root, carla))[0]).toMatchObject({ lastMessageText: "Version finale" })
    expect(await bob.as.mutation(G.messages.deleteGroupMessage, { networkId: root, messageId })).toEqual({ deleted: true, alreadyDeleted: false })
    expect(await bob.as.mutation(G.messages.deleteGroupMessage, { networkId: root, messageId })).toEqual({ deleted: true, alreadyDeleted: true })
    expect((await history(root, carla, threadId))[0]).toMatchObject({ messageId, content: null, deleted: true })
    expect((await myThreads(root, carla))[0]).toMatchObject({ lastMessageText: null, lastMessageDeleted: true })
    expect(await ruleOf(bob.as.mutation(G.messages.editGroupMessage, { networkId: root, messageId, content: "Revenir" }))).toBe("MESSAGE_ALREADY_DELETED")
    expect(await carla.as.mutation(G.messages.deleteGroupMessageForMe, { networkId: root, messageId })).toEqual({ hidden: true })
    const late = await send(root, bob, threadId, "Trop tard")
    tick(MESSAGE_EDIT_WINDOW_MS + 1)
    expect(await ruleOf(bob.as.mutation(G.messages.editGroupMessage, { networkId: root, messageId: late, content: "Non" }))).toBe("MESSAGE_EDIT_WINDOW_EXPIRED")
    expect(await ruleOf(bob.as.mutation(G.messages.deleteGroupMessage, { networkId: root, messageId: late }))).toBe("MESSAGE_EDIT_WINDOW_EXPIRED")
    const system = (await history(root, bob, threadId)).find((m) => m.type === "system")!
    expect(await codeOf(bob.as.mutation(G.messages.editGroupMessage, { networkId: root, messageId: system.messageId, content: "Non" }))).toBe("notFound")
  })

  it("un membre PARTI ne modifie plus, même son propre message", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const { alice, bob, carla } = await trio(t, root)
    const threadId = await constituted(alice, root, [bob, carla])
    const messageId = await send(root, bob, threadId, "Avant de partir")
    await bob.as.mutation(G.threads.leaveGroup, { networkId: root, threadId })
    expect(await codeOf(bob.as.mutation(G.messages.editGroupMessage, { networkId: root, messageId, content: "Après" }))).toBe("notFound")
  })

  it("effacer la conversation masque exactement MON passé, laisse celui des autres et rend le futur", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const { alice, bob, carla } = await trio(t, root)
    const threadId = await constituted(alice, root, [bob, carla])
    await send(root, bob, threadId, "Ancien")
    await settle(t)
    expect(await unread(root, alice)).toBe(1)
    await alice.as.mutation(G.threads.clearGroupConversation, { networkId: root, threadId })
    expect(await history(root, alice, threadId)).toEqual([])
    expect(await unread(root, alice)).toBe(0)
    expect((await myThreads(root, alice))[0]).toMatchObject({ lastMessageText: null })
    expect(await texts(root, carla, threadId)).toEqual(["Ancien"])
    await send(root, bob, threadId, "Nouveau")
    await settle(t)
    expect(await texts(root, alice, threadId)).toEqual(["Nouveau"])
    expect(await unread(root, alice)).toBe(1)
  })
})

// ═══════════════════════════════════════════════════════════════
// L'histoire d'un membre commence à SON arrivée
// ═══════════════════════════════════════════════════════════════

describe("l'histoire d'un membre commence à SON arrivée", () => {
  it("un invité ne voit rien d'avant lui, voit son « a rejoint », et l'aperçu de sa liste se tait", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const { alice, bob, carla } = await trio(t, root)
    const dora = await enter(t, root, "dora")
    await connect(t, root, alice, dora)
    const threadId = await constituted(alice, root, [bob, carla])
    await send(root, bob, threadId, "Secret d'avant")
    await alice.as.mutation(G.invites.inviteToGroup, { networkId: root, threadId, handle: "dora" })
    tick()
    await dora.as.mutation(G.invites.respondGroupInvite, { networkId: root, threadId, accept: true })
    const seen = await history(root, dora, threadId)
    expect(seen.map((m) => m.event ?? m.content)).toEqual(["member_joined"])
    expect((await myThreads(root, dora))[0]).toMatchObject({ lastMessageText: null, unreadCount: 0 })
    await send(root, carla, threadId, "Bienvenue")
    await settle(t)
    expect(await texts(root, dora, threadId)).toEqual(["Bienvenue"])
    expect(await unread(root, dora)).toBe(1)
  })
})

// ═══════════════════════════════════════════════════════════════
// Administration
// ═══════════════════════════════════════════════════════════════

describe("administration d'un groupe — le rôle confère quelque chose", () => {
  it("le propriétaire renomme ; un membre ne peut pas ; jamais vide ; à l'identique rien ; le nouveau titre voyage", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const { alice, bob, carla } = await trio(t, root)
    const threadId = await constituted(alice, root, [bob, carla])
    expect(await codeOf(bob.as.mutation(G.threads.renameGroup, { networkId: root, threadId, title: "Pirate" }))).toBe("groupRoleRequired")
    expect(await ruleOf(alice.as.mutation(G.threads.renameGroup, { networkId: root, threadId, title: "  " }))).toBe("GROUP_NAME_LENGTH")
    const before = (await history(root, alice, threadId)).length
    await alice.as.mutation(G.threads.renameGroup, { networkId: root, threadId, title: "Comité" })
    expect((await history(root, alice, threadId)).length).toBe(before)
    tick()
    await alice.as.mutation(G.threads.renameGroup, { networkId: root, threadId, title: "Bureau" })
    expect((await history(root, bob, threadId))[0]).toMatchObject({ type: "system", event: "group_renamed", content: "Bureau" })
    expect(await card(root, carla, threadId)).toMatchObject({ title: "Bureau" })
  })

  it("description réservée aux gestionnaires, normalisée et bornée", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const { alice, bob, carla } = await trio(t, root)
    const threadId = await constituted(alice, root, [bob, carla])
    expect(await codeOf(bob.as.mutation(G.threads.setGroupDescription, { networkId: root, threadId, description: "Non" }))).toBe("groupRoleRequired")
    expect(await alice.as.mutation(G.threads.setGroupDescription, { networkId: root, threadId, description: "  Entraide  " })).toEqual({ description: "Entraide" })
    expect(await ruleOf(alice.as.mutation(G.threads.setGroupDescription, { networkId: root, threadId, description: "x".repeat(501) }))).toBe("GROUP_DESCRIPTION_TOO_LONG")
    expect(await alice.as.mutation(G.threads.setGroupDescription, { networkId: root, threadId, description: "   " })).toEqual({ description: null })
    expect(await card(root, bob, threadId)).toMatchObject({ description: null })
  })

  it("la photo : neuve, admise et rendue ; faux format refusé ; réservée aux gestionnaires ; l'ancienne est purgée", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const { alice, bob, carla } = await trio(t, root)
    const first = await store(t, PNG, "image/png")
    const threadId = (await alice.as.mutation(G.threads.createGroup, { networkId: root, title: "Comité", memberHandles: ["bob", "carla"], idempotencyKey: "k", avatarStorageId: first, avatarMimeType: "image/png" })).threadId
    expect(await t.run(async (ctx) => (await ctx.db.get(threadId))?.avatarStorageId)).toBe(first)
    for (const invitee of [bob, carla]) await invitee.as.mutation(G.invites.respondGroupInvite, { networkId: root, threadId, accept: true })
    const fake = await store(t, new TextEncoder().encode("pas une image"), "text/plain")
    expect(await ruleOf(alice.as.mutation(G.threads.setGroupAvatar, { networkId: root, threadId, storageId: fake, mimeType: "text/plain" }))).toBe("UPLOAD_TYPE_NOT_ALLOWED")
    const second = await store(t, PNG, "image/png")
    expect(await codeOf(bob.as.mutation(G.threads.setGroupAvatar, { networkId: root, threadId, storageId: second, mimeType: "image/png" }))).toBe("groupRoleRequired")
    expect(await alice.as.mutation(G.threads.setGroupAvatar, { networkId: root, threadId, storageId: second, mimeType: "image/png" })).toMatchObject({ withheld: "fileScanPending" })
    const leftovers = await t.run(async (ctx) => ({
      blob: (await ctx.db.system.get("_storage", first)) !== null,
      scan: (await ctx.db.query("fileScans").withIndex("by_storageId", (q) => q.eq("storageId", first)).first()) !== null,
    }))
    expect(leftovers).toEqual({ blob: false, scan: false })
  })

  it("le propriétaire nomme un ADMINISTRATEUR, qui invite alors des personnes de SON réseau ; inviter sans relation ne dit rien", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const { alice, bob, carla } = await trio(t, root)
    const dora = await enter(t, root, "dora")
    const eric = await enter(t, root, "eric")
    await connect(t, root, bob, dora)
    const threadId = await constituted(alice, root, [bob, carla])
    expect(await codeOf(bob.as.mutation(G.invites.inviteToGroup, { networkId: root, threadId, handle: "dora" }))).toBe("groupRoleRequired")
    expect(await codeOf(carla.as.mutation(G.threads.setGroupMemberRole, { networkId: root, threadId, memberPersonId: bob.personId, role: "admin" }))).toBe("groupRoleRequired")
    await alice.as.mutation(G.threads.setGroupMemberRole, { networkId: root, threadId, memberPersonId: bob.personId, role: "admin" })
    expect(await bob.as.mutation(G.invites.inviteToGroup, { networkId: root, threadId, handle: "dora" })).toEqual({ invited: true })
    expect(await codeOf(bob.as.mutation(G.invites.inviteToGroup, { networkId: root, threadId, handle: "eric" }))).toBe("notFound")
    expect(await codeOf(bob.as.mutation(G.threads.setGroupMemberRole, { networkId: root, threadId, memberPersonId: carla.personId, role: "admin" }))).toBe("groupRoleRequired")
    expect(eric.personId).toBeDefined()
  })

  it("retirer : le propriétaire peut, un pair administrateur non, jamais soi-même ; le retiré est NOMMÉ", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const { alice, bob, carla } = await trio(t, root)
    const dora = await enter(t, root, "dora")
    await connect(t, root, alice, dora)
    const threadId = await constituted(alice, root, [bob, carla, dora])
    await alice.as.mutation(G.threads.setGroupMemberRole, { networkId: root, threadId, memberPersonId: bob.personId, role: "admin" })
    await alice.as.mutation(G.threads.setGroupMemberRole, { networkId: root, threadId, memberPersonId: carla.personId, role: "admin" })
    expect(await codeOf(bob.as.mutation(G.threads.removeGroupMember, { networkId: root, threadId, memberPersonId: carla.personId }))).toBe("groupRoleRequired")
    expect(await codeOf(bob.as.mutation(G.threads.removeGroupMember, { networkId: root, threadId, memberPersonId: bob.personId }))).toBe("groupRoleRequired")
    expect(await codeOf(bob.as.mutation(G.threads.removeGroupMember, { networkId: root, threadId, memberPersonId: alice.personId }))).toBe("groupRoleRequired")
    tick()
    expect(await bob.as.mutation(G.threads.removeGroupMember, { networkId: root, threadId, memberPersonId: dora.personId })).toEqual({ removed: true })
    expect((await history(root, carla, threadId))[0]).toMatchObject({ event: "member_removed", senderPersonId: bob.personId, target: { personId: dora.personId, label: { displayName: "dora" } } })
    expect(await codeOf(card(root, dora, threadId))).toBe("notFound")
    expect(await card(root, alice, threadId)).toMatchObject({ memberCount: 3 })
    // Ré-invitable : son invitation est retombée.
    expect(await alice.as.mutation(G.invites.inviteToGroup, { networkId: root, threadId, handle: "dora" })).toEqual({ invited: true })
  })

  it("le propriétaire qui QUITTE transmet au plus ancien restant ; le DERNIER qui part ferme le fil", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const { alice, bob, carla } = await trio(t, root)
    const threadId = await constituted(alice, root, [bob, carla])
    await alice.as.mutation(G.threads.leaveGroup, { networkId: root, threadId })
    expect(await card(root, bob, threadId)).toMatchObject({ myRole: "owner", memberCount: 2 })
    expect(await card(root, carla, threadId)).toMatchObject({ myRole: "member" })
    await bob.as.mutation(G.threads.leaveGroup, { networkId: root, threadId })
    await carla.as.mutation(G.threads.leaveGroup, { networkId: root, threadId })
    expect(await t.run(async (ctx) => (await ctx.db.get(threadId))?.closedAt)).toBe(Date.now())
  })

  it("la fiche dit le créateur et sa date ; membres et conviés se lisent par pages ; un refus retire le convié", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const { alice, bob, carla } = await trio(t, root)
    const threadId = await create(alice, root, [bob, carla])
    const pending = async () => (await alice.as.query(G.threads.paginateGroupPendingInvites, { networkId: root, threadId, paginationOpts: PAGE })).page.map((row) => row.personId)
    expect(new Set(await pending())).toEqual(new Set([bob.personId, carla.personId]))
    tick()
    await bob.as.mutation(G.invites.respondGroupInvite, { networkId: root, threadId, accept: true })
    await carla.as.mutation(G.invites.respondGroupInvite, { networkId: root, threadId, accept: false })
    expect(await pending()).toEqual([])
    const members = (await bob.as.query(G.threads.paginateGroupMembers, { networkId: root, threadId, paginationOpts: PAGE })).page
    expect(members.map((m) => ({ handle: m.label.handle, role: m.role, isMe: m.isMe }))).toEqual([
      { handle: "alice", role: "owner", isMe: false },
      { handle: "bob", role: "member", isMe: true },
    ])
    expect(Object.keys(members[0]!.label).sort()).toEqual(["avatarUrl", "displayName", "handle", "headline", "source"])
    expect(await card(root, bob, threadId)).toMatchObject({ createdAt: T0, createdBy: { handle: "alice", isMe: false } })
  })
})

// ═══════════════════════════════════════════════════════════════
// Épingle
// ═══════════════════════════════════════════════════════════════

describe("l'épingle — le rôle de canal décide", () => {
  it("owner et admin épinglent, le second remplace ; un membre est refusé ; null désépingle ; ni autre groupe, ni système, ni retiré", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const { alice, bob, carla } = await trio(t, root)
    const threadId = await constituted(alice, root, [bob, carla], { key: "k1" })
    const other = await constituted(alice, root, [bob, carla], { key: "k2" })
    const first = await send(root, carla, threadId, "Ordre du jour")
    const second = await send(root, bob, threadId, "Lieu")
    const pin = (who: Person, messageId: Id<"groupMessages"> | null) => who.as.mutation(G.messages.setGroupPinnedMessage, { networkId: root, threadId, messageId })
    expect(await codeOf(pin(carla, first))).toBe("groupRoleRequired")
    expect(await pin(alice, first)).toEqual({ pinnedMessageId: first })
    await alice.as.mutation(G.threads.setGroupMemberRole, { networkId: root, threadId, memberPersonId: bob.personId, role: "admin" })
    expect(await pin(bob, second)).toEqual({ pinnedMessageId: second })
    expect(await pin(alice, null)).toEqual({ pinnedMessageId: null })
    expect(await pin(alice, null)).toEqual({ pinnedMessageId: null })
    const elsewhere = await send(root, bob, other, "Ailleurs")
    expect(await codeOf(pin(alice, elsewhere))).toBe("notFound")
    const system = (await history(root, alice, threadId)).find((m) => m.type === "system")!
    expect(await ruleOf(pin(alice, system.messageId))).toBe("MESSAGE_PIN_NOT_TEXT")
    await bob.as.mutation(G.messages.deleteGroupMessage, { networkId: root, messageId: second })
    expect(await ruleOf(pin(alice, second))).toBe("MESSAGE_PIN_DELETED")
  })

  it("la fiche sert l'épingle RELUE : extrait et auteur ; masquée pour qui a bloqué l'auteur ; tombée au retrait", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const { alice, bob, carla } = await trio(t, root)
    const threadId = await constituted(alice, root, [bob, carla])
    expect((await card(root, carla, threadId)).pinnedMessage).toBeNull()
    const messageId = await send(root, bob, threadId, "Réunion à 10 h")
    await alice.as.mutation(G.messages.setGroupPinnedMessage, { networkId: root, threadId, messageId })
    expect((await card(root, carla, threadId)).pinnedMessage).toMatchObject({ messageId, senderPersonId: bob.personId, excerpt: "Réunion à 10 h", masked: false, sender: { displayName: "bob" } })
    await connect(t, root, carla, bob)
    await carla.as.mutation(api.modules.graph.connections.blockPerson, { networkId: root, targetPersonId: bob.personId })
    expect((await card(root, carla, threadId)).pinnedMessage).toMatchObject({ excerpt: "", masked: true })
    await bob.as.mutation(G.messages.deleteGroupMessage, { networkId: root, messageId })
    expect((await card(root, alice, threadId)).pinnedMessage).toBeNull()
    expect(await t.run(async (ctx) => (await ctx.db.get(threadId))?.pinnedMessageId === undefined)).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════
// Le lien d'invitation et la réponse
// ═══════════════════════════════════════════════════════════════

describe("le lien d'invitation et la réponse aux invitations", () => {
  it("réserve le lien aux gestionnaires et réutilise le jeton actif ; réinitialiser invalide l'ancien ; l'adhésion est idempotente", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const { alice, bob, carla } = await trio(t, root)
    const dora = await enter(t, root, "dora")
    const threadId = await constituted(alice, root, [bob, carla])
    expect(await codeOf(bob.as.mutation(G.invites.getOrCreateGroupInviteLink, { networkId: root, threadId }))).toBe("groupRoleRequired")
    const { token } = await alice.as.mutation(G.invites.getOrCreateGroupInviteLink, { networkId: root, threadId })
    expect(await alice.as.mutation(G.invites.getOrCreateGroupInviteLink, { networkId: root, threadId })).toEqual({ token })
    expect(token).not.toContain(threadId)
    expect(await dora.as.query(G.invites.previewGroupInvite, { networkId: root, token })).toMatchObject({ threadId, title: "Comité", memberCount: 3, alreadyMember: false })
    const fresh = await alice.as.mutation(G.invites.resetGroupInviteLink, { networkId: root, threadId })
    expect(fresh.token).not.toBe(token)
    expect(await codeOf(dora.as.mutation(G.invites.joinGroupViaInviteLink, { networkId: root, token }))).toBe("notFound")
    tick()
    expect(await dora.as.mutation(G.invites.joinGroupViaInviteLink, { networkId: root, token: fresh.token })).toEqual({ threadId, joined: true })
    expect(await dora.as.mutation(G.invites.joinGroupViaInviteLink, { networkId: root, token: fresh.token })).toEqual({ threadId, joined: false })
    expect(await card(root, dora, threadId)).toMatchObject({ memberCount: 4, myRole: "member" })
  })

  it("rend le même refus pour un jeton inconnu, révoqué, d'un groupe supprimé ou d'un autre réseau ; respecte le plafond", async () => {
    const t = testConvex()
    const { root, testClosed } = await seed(t)
    const { alice, bob, carla } = await trio(t, root)
    const dora = await enter(t, root, "dora")
    await joinAlso(t, testClosed, dora)
    const threadId = await constituted(alice, root, [bob, carla])
    const { token } = await alice.as.mutation(G.invites.getOrCreateGroupInviteLink, { networkId: root, threadId })
    expect(await codeOf(dora.as.query(G.invites.previewGroupInvite, { networkId: root, token: "jeton-inconnu" }))).toBe("notFound")
    expect(await codeOf(dora.as.query(G.invites.previewGroupInvite, { networkId: testClosed, token }))).toBe("notFound")
    // Le groupe plein : l'effectif de l'agrégat dit le plafond.
    await t.run(async (ctx) => {
      for (let index = 0; index < GROUP_MEMBERS_MAX - 3; index += 1) {
        const fakeMemberId = await ctx.db.insert("groupMembers", { networkId: root, threadId, personId: bob.personId, role: "member", lastReadAt: 0, unreadCount: 0, joinedAt: 0, leftAt: 1, activityAt: 0 })
        await recordThreadMember(ctx, { _id: fakeMemberId, threadId })
      }
    })
    expect(await ruleOf(dora.as.mutation(G.invites.joinGroupViaInviteLink, { networkId: root, token }))).toBe("GROUP_FULL")
    await alice.as.mutation(G.cascade.deleteGroup, { networkId: root, threadId })
    await settle(t)
    expect(await codeOf(dora.as.mutation(G.invites.joinGroupViaInviteLink, { networkId: root, token }))).toBe("notFound")
  })

  it("accepter résout la cloche `accepted`, décliner `declined` ; une invitation déclinée puis RENOUVELÉE redevient ouverte ; entrer par le lien la résout aussi", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const { alice, bob, carla } = await trio(t, root)
    const threadId = await create(alice, root, [bob, carla])
    await settle(t)
    const bell = async (person: Person) => (await person.as.query(api.modules.notifications.bell.paginateNotifications, { networkId: root, paginationOpts: { numItems: 10, cursor: null } })).page.find((row) => row.kind === "group_added")
    await bob.as.mutation(G.invites.respondGroupInvite, { networkId: root, threadId, accept: true })
    expect(await bell(bob)).toMatchObject({ resolution: { kind: "accepted" } })
    await carla.as.mutation(G.invites.respondGroupInvite, { networkId: root, threadId, accept: false })
    expect(await bell(carla)).toMatchObject({ resolution: { kind: "declined" } })
    tick()
    await alice.as.mutation(G.invites.inviteToGroup, { networkId: root, threadId, handle: "carla" })
    expect(await bell(carla)).toMatchObject({ resolution: null })
    const { token } = await alice.as.mutation(G.invites.getOrCreateGroupInviteLink, { networkId: root, threadId })
    await carla.as.mutation(G.invites.joinGroupViaInviteLink, { networkId: root, token })
    expect(await bell(carla)).toMatchObject({ resolution: { kind: "accepted" } })
    expect(await carla.as.query(G.invites.myGroupInvites, { networkId: root, paginationOpts: PAGE })).toMatchObject({ page: [] })
  })
})

// ═══════════════════════════════════════════════════════════════
// Saisie
// ═══════════════════════════════════════════════════════════════

describe("la saisie en cours", () => {
  it("visible des autres seulement, lue à l'instant fourni (D16), sans les bloqués ; retirée et purgée", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const { alice, bob, carla } = await trio(t, root)
    const threadId = await constituted(alice, root, [bob, carla])
    const now = Date.now()
    await bob.as.mutation(G.typing.setGroupTyping, { networkId: root, threadId })
    await carla.as.mutation(G.typing.setGroupTyping, { networkId: root, threadId })
    const typing = async (reader: Person, at: number) => (await reader.as.query(G.typing.listGroupTyping, { networkId: root, threadId, now: at })).map((row) => row.label.handle)
    expect(new Set(await typing(alice, now))).toEqual(new Set(["bob", "carla"]))
    expect(await typing(bob, now)).toEqual(["carla"])
    expect(await typing(alice, now + 7000)).toEqual([])
    await connect(t, root, carla, bob)
    await carla.as.mutation(api.modules.graph.connections.blockPerson, { networkId: root, targetPersonId: bob.personId })
    expect(await typing(carla, now)).toEqual([])
    await bob.as.mutation(G.typing.clearGroupTyping, { networkId: root, threadId })
    expect(await typing(alice, now)).toEqual(["carla"])
    tick(60_000)
    expect(await t.mutation(internal.modules.groups.typing.purgeExpiredGroupTyping, {})).toEqual({ purged: 1 })
  })
})

// ═══════════════════════════════════════════════════════════════
// Suppression du groupe
// ═══════════════════════════════════════════════════════════════

describe("supprimer le groupe", () => {
  it("le propriétaire seul ; tout disparaît — messages, réactions, masquages, membres, invitations, liens, cloches, pastilles", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const { alice, bob, carla } = await trio(t, root)
    const dora = await enter(t, root, "dora")
    await connect(t, root, alice, dora)
    const threadId = await constituted(alice, root, [bob, carla])
    await alice.as.mutation(G.invites.inviteToGroup, { networkId: root, threadId, handle: "dora" })
    await alice.as.mutation(G.invites.getOrCreateGroupInviteLink, { networkId: root, threadId })
    const messageId = await send(root, bob, threadId, "Bientôt effacé")
    await carla.as.mutation(G.messages.toggleGroupMessageReaction, { networkId: root, messageId, kind: "like" })
    await carla.as.mutation(G.messages.deleteGroupMessageForMe, { networkId: root, messageId })
    await settle(t)
    expect(await unread(root, alice)).toBe(1)
    expect(await codeOf(bob.as.mutation(G.cascade.deleteGroup, { networkId: root, threadId }))).toBe("groupRoleRequired")
    expect(await alice.as.mutation(G.cascade.deleteGroup, { networkId: root, threadId })).toEqual({ deleted: true, pending: false })
    const leftovers = await t.run(async (ctx) => ({
      thread: await ctx.db.get(threadId),
      messages: (await ctx.db.query("groupMessages").withIndex("by_thread_createdAt", (q) => q.eq("threadId", threadId)).take(5)).length,
      members: (await ctx.db.query("groupMembers").withIndex("by_thread_person", (q) => q.eq("threadId", threadId)).take(5)).length,
      invites: (await ctx.db.query("groupInvites").withIndex("by_thread_invitee", (q) => q.eq("threadId", threadId)).take(5)).length,
      links: (await ctx.db.query("groupInviteLinks").withIndex("by_thread", (q) => q.eq("threadId", threadId)).take(5)).length,
      reactions: (await ctx.db.query("groupMessageReactions").withIndex("by_message", (q) => q.eq("messageId", messageId)).take(5)).length,
      hides: (await ctx.db.query("groupMessageHides").withIndex("by_message", (q) => q.eq("messageId", messageId)).take(5)).length,
    }))
    expect(leftovers).toEqual({ thread: null, messages: 0, members: 0, invites: 0, links: 0, reactions: 0, hides: 0 })
    expect(await unread(root, alice)).toBe(0)
    expect(await bellKinds(root, alice)).not.toContain("group_message")
    expect(await bellKinds(root, dora)).not.toContain("group_added")
  })

  it("un historique volumineux : introuvable aussitôt, purgé par lots chaînés", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const { alice, bob, carla } = await trio(t, root)
    const threadId = await constituted(alice, root, [bob, carla])
    await t.run(async (ctx) => {
      for (let index = 0; index < 120; index += 1) await ctx.db.insert("groupMessages", { networkId: root, threadId, senderPersonId: bob.personId, type: "text", content: `m${index}`, createdAt: T0 + 10_000 + index })
    })
    expect(await alice.as.mutation(G.cascade.deleteGroup, { networkId: root, threadId })).toEqual({ deleted: true, pending: true })
    expect(await codeOf(card(root, bob, threadId))).toBe("notFound")
    await settle(t)
    expect(await t.run(async (ctx) => ({ thread: await ctx.db.get(threadId), messages: (await ctx.db.query("groupMessages").withIndex("by_thread_createdAt", (q) => q.eq("threadId", threadId)).take(5)).length }))).toEqual({ thread: null, messages: 0 })
  })

  it("purge le blob d'une pièce PROPRE (et sa ligne d'analyse), épargne celui qu'une copie transférée sert encore, et celui d'une copie", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const { alice, bob, carla } = await trio(t, root)
    const threadId = await constituted(alice, root, [bob, carla], { key: "k1" })
    const other = await constituted(alice, root, [bob, carla], { key: "k2" })
    const own = await store(t, PNG, "image/png")
    const shared = await store(t, PNG, "image/png")
    const elsewhere = await store(t, PNG, "image/png")
    tick()
    await bob.as.mutation(G.messages.sendGroupMessage, { networkId: root, threadId, content: "Propre", attachmentFiles: [png(own)] })
    tick()
    const original = await bob.as.mutation(G.messages.sendGroupMessage, { networkId: root, threadId, content: "Partagée", attachmentFiles: [png(shared)] })
    await alice.as.mutation(api.modules.messaging.forward.forwardGroupMessage, { networkId: root, messageId: original.messageId, to: { kind: "group", threadId: other } })
    tick()
    const outside = await carla.as.mutation(G.messages.sendGroupMessage, { networkId: root, threadId: other, content: "D'ailleurs", attachmentFiles: [png(elsewhere)] })
    await carla.as.mutation(api.modules.messaging.forward.forwardGroupMessage, { networkId: root, messageId: outside.messageId, to: { kind: "group", threadId } })
    await alice.as.mutation(G.cascade.deleteGroup, { networkId: root, threadId })
    await settle(t)
    const state = await t.run(async (ctx) => {
      const exists = async (id: Id<"_storage">) => (await ctx.db.system.get("_storage", id)) !== null
      const scanned = async (id: Id<"_storage">) => (await ctx.db.query("fileScans").withIndex("by_storageId", (q) => q.eq("storageId", id)).first()) !== null
      return { own: [await exists(own), await scanned(own)], shared: await exists(shared), elsewhere: await exists(elsewhere) }
    })
    expect(state).toEqual({ own: [false, false], shared: true, elsewhere: true })
    // La copie survivante sert toujours sa pièce.
    expect((await history(root, carla, other)).find((m) => m.content === "Partagée")!.attachmentFiles).toHaveLength(1)
  })
})

// ═══════════════════════════════════════════════════════════════
// Transfert de et vers un groupe
// ═══════════════════════════════════════════════════════════════

describe("transfert de et vers un groupe", () => {
  it("1:1 → groupe : la copie est lue avec la marque, l'aperçu et le curseur suivent ; groupe → 1:1 : même geste", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const { alice, bob, carla } = await trio(t, root)
    const threadId = await constituted(alice, root, [bob, carla])
    const personal = await alice.as.mutation(api.modules.messaging.inbox.startThreadWithHandle, { networkId: root, handle: "bob", initialMessage: "Note privée" })
    tick()
    const toGroup = await alice.as.mutation(api.modules.messaging.forward.forwardMessage, { networkId: root, messageId: personal.messageId, to: { kind: "group", threadId } })
    expect(toGroup).toMatchObject({ target: "group", threadId, createdThread: false, deduplicated: false })
    await settle(t)
    expect((await history(root, carla, threadId))[0]).toMatchObject({ content: "Note privée", forwarded: true, senderPersonId: alice.personId })
    expect((await myThreads(root, carla))[0]).toMatchObject({ lastMessageText: "Note privée" })
    expect(await unread(root, carla)).toBe(1)
    expect(await unread(root, alice)).toBe(0)
    const groupMessage = await send(root, carla, threadId, "Du groupe")
    const toPersonal = await alice.as.mutation(api.modules.messaging.forward.forwardGroupMessage, { networkId: root, messageId: groupMessage, to: { kind: "handle", handle: "carla" } })
    expect(toPersonal).toMatchObject({ target: "personal", createdThread: true })
    if (toPersonal.target !== "personal") throw new Error("cible 1:1 attendue")
    expect((await carla.as.query(api.modules.messaging.messages.paginateMessages, { networkId: root, threadId: toPersonal.threadId, paginationOpts: PAGE })).page).toMatchObject([{ content: "Du groupe", forwarded: true }])
  })

  it("refuse une cible groupe dont je ne suis pas membre (indistinct), un groupe d'un autre réseau (explicite), un auteur bloqué, un message d'avant mon arrivée", async () => {
    const t = testConvex()
    const { root, testClosed } = await seed(t)
    const { alice, bob, carla } = await trio(t, root)
    const dora = await enter(t, root, "dora")
    await connect(t, root, alice, dora)
    const threadId = await constituted(alice, root, [bob, carla], { key: "k1" })
    const early = await send(root, bob, threadId, "Avant Dora")
    await alice.as.mutation(G.invites.inviteToGroup, { networkId: root, threadId, handle: "dora" })
    tick()
    await dora.as.mutation(G.invites.respondGroupInvite, { networkId: root, threadId, accept: true })
    expect(await codeOf(dora.as.mutation(api.modules.messaging.forward.forwardGroupMessage, { networkId: root, messageId: early, to: { kind: "handle", handle: "alice" } }))).toBe("notFound")
    for (const person of [alice, bob, carla]) await joinAlso(t, testClosed, person)
    await connect(t, testClosed, alice, bob)
    await connect(t, testClosed, alice, carla)
    const closedGroup = await constituted(alice, testClosed, [bob, carla], { key: "k3" })
    const message = await send(root, bob, threadId, "À transférer")
    expect(await ruleOf(alice.as.mutation(api.modules.messaging.forward.forwardGroupMessage, { networkId: root, messageId: message, to: { kind: "group", threadId: closedGroup } }))).toBe("MESSAGE_FORWARD_CROSS_NETWORK")
    const outsiderGroup = await constituted(alice, root, [bob, carla], { key: "k4" })
    await carla.as.mutation(G.threads.leaveGroup, { networkId: root, threadId: outsiderGroup })
    expect(await codeOf(carla.as.mutation(api.modules.messaging.forward.forwardGroupMessage, { networkId: root, messageId: message, to: { kind: "group", threadId: outsiderGroup } }))).toBe("notFound")
    await connect(t, root, carla, bob)
    await carla.as.mutation(api.modules.graph.connections.blockPerson, { networkId: root, targetPersonId: bob.personId })
    expect(await ruleOf(carla.as.mutation(api.modules.messaging.forward.forwardGroupMessage, { networkId: root, messageId: message, to: { kind: "group", threadId } }))).toBe("MESSAGE_FORWARD_UNAVAILABLE")
  })
})


it("classement privé des groupes : une archive reste accessible et indépendante des autres membres", async () => {
  const t = testConvex()
  const { root } = await seed(t)
  const { alice, bob, carla } = await trio(t, root)
  const threadId = await constituted(alice, root, [bob, carla])
  const args = { networkId: root, paginationOpts: { cursor: null, numItems: 10 } }
  await alice.as.mutation(G.threads.setMyGroupShelf, { networkId: root, threadId, shelf: "archived" })
  expect((await alice.as.query(G.threads.paginateMyGroupThreads, { ...args, shelf: "archived" })).page.map(row => row.threadId)).toEqual([threadId])
  expect((await alice.as.query(G.threads.paginateMyGroupThreads, { ...args, shelf: "inbox" })).page).toEqual([])
  expect((await bob.as.query(G.threads.paginateMyGroupThreads, { ...args, shelf: "inbox" })).page.map(row => row.threadId)).toEqual([threadId])
  await alice.as.mutation(G.threads.setMyGroupShelf, { networkId: root, threadId, shelf: null })
  expect((await alice.as.query(G.threads.paginateMyGroupThreads, { ...args, shelf: "inbox" })).page.map(row => row.threadId)).toEqual([threadId])
})
