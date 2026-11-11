// @vitest-environment edge-runtime
// Dupliqué de socle/convex/modules/reseauPersonnel/stories.test.ts @ ad2e7fdc2 — adaptations : personnes et réseaux (graine des fondations) ; codes et règles au lieu des libellés ; surfaces `reseau`/`icom` retirées avec leurs cas (une seule borne vidéo, la plus stricte) ; une déclaration qui ment est refusée (le socle l'écrasait) ; la garde des fichiers décide de ce qui est servable (une story non servable est omise pour les autres, montrée retenue à son auteur) ; spectateurs lus dans l'agrégat ; « vu par » à curseur natif (la « limite connue » du socle devient un cas qui passe) ; tests neufs : purge de la ligne d'analyse et des décomptes, story d'un autre réseau introuvable, clé rejouée ailleurs refusée.
import { engineErrorCode, engineErrorRule } from "@antsia/social-contracts/errors"
import { STORY_ACTIVE_PER_AUTHOR_MAX, STORY_TTL_MS } from "@antsia/social-domain/stories"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { api, internal } from "../../_generated/api"
import type { Id } from "../../_generated/dataModel"
import { SEED_CONFIRMATION } from "../../seeds/foundations"
import { testConvex } from "../../test.setup"
import { PURGE_BATCH } from "./stories"

type T = ReturnType<typeof testConvex>
type Person = { as: ReturnType<T["withIdentity"]>; personId: Id<"persons">; handle: string }

const S = api.modules.stories.stories
const T0 = Date.UTC(2026, 9, 15, 14, 0, 0)

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

/**
 * Un blob RÉEL du harnais, AVEC son type : `storage.store` n'enregistre pas
 * celui du `Blob`, le patch système le pose (sans lui, la politique de dépôt
 * refuserait tout pour une raison qui n'est pas celle du test).
 */
async function storeBlob(t: T, contentType: string, bytes = 64): Promise<Id<"_storage">> {
  return await t.run(async (ctx) => {
    const storageId = await ctx.storage.store(new Blob([new Uint8Array(bytes)], { type: contentType }))
    await (ctx.db as unknown as { patch: (table: "_storage", id: Id<"_storage">, value: { contentType: string }) => Promise<void> }).patch("_storage", storageId, { contentType })
    return storageId
  })
}

/** L'analyse a parlé : le média est servable (sain). */
async function clean(t: T, storageId: Id<"_storage">): Promise<void> {
  await t.run(async (ctx) => {
    const scan = await ctx.db.query("fileScans").withIndex("by_storageId", (q) => q.eq("storageId", storageId)).first()
    if (scan) await ctx.db.patch(scan._id, { status: "clean", updatedAt: Date.now() })
  })
}

let keySeq = 0

/** Publie une story d'image, servable (analyse saine), à l'instant courant. */
async function publishStory(t: T, author: Person, networkId: Id<"networks">, options: { audience?: "public" | "connections"; caption?: string; kind?: "image" | "video"; servable?: boolean } = {}) {
  const kind = options.kind ?? "image"
  const mimeType = kind === "image" ? "image/png" : "video/mp4"
  const storageId = await storeBlob(t, mimeType)
  vi.setSystemTime(Date.now() + 1000)
  keySeq += 1
  const result = await author.as.mutation(S.publish, {
    networkId,
    media: { storageId, kind, mimeType, sizeBytes: 64, ...(kind === "video" ? { durationMs: 12_000 } : {}) },
    audience: options.audience ?? "public",
    ...(options.caption !== undefined ? { caption: options.caption } : {}),
    idempotencyKey: `cle-${keySeq}`,
  })
  if (options.servable !== false) await clean(t, storageId)
  return { ...result, storageId }
}

async function tray(reader: Person, networkId: Id<"networks">) {
  return (await reader.as.query(S.tray, { networkId, now: Date.now() })).groups
}

// ═══════════════════════════════════════════════════════════════

describe("publication d'une story", () => {
  it("un média inventé se refuse comme introuvable ; une déclaration qui ment est refusée", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const alice = await enter(t, root, "alice")
    const gone = await storeBlob(t, "image/png")
    await t.run(async (ctx) => ctx.storage.delete(gone))
    expect(await codeOf(alice.as.mutation(S.publish, { networkId: root, media: { storageId: gone, kind: "image", mimeType: "image/png", sizeBytes: 64 }, audience: "public" }))).toBe("notFound")
    const lying = await storeBlob(t, "image/png")
    expect(await ruleOf(alice.as.mutation(S.publish, { networkId: root, media: { storageId: lying, kind: "image", mimeType: "image/jpeg", sizeBytes: 64 }, audience: "public" }))).toBe("UPLOAD_MISMATCH")
  })

  it("refuse QuickTime et une vidéo de plus de cinq minutes — une story se lit partout", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const alice = await enter(t, root, "alice")
    const mov = await storeBlob(t, "video/quicktime")
    expect(await ruleOf(alice.as.mutation(S.publish, { networkId: root, media: { storageId: mov, kind: "video", mimeType: "video/quicktime", sizeBytes: 64 }, audience: "public" }))).toBe("UPLOAD_TYPE_NOT_ALLOWED")
    const long = await storeBlob(t, "video/mp4")
    expect(await ruleOf(alice.as.mutation(S.publish, { networkId: root, media: { storageId: long, kind: "video", mimeType: "video/mp4", sizeBytes: 64, durationMs: 6 * 60_000 }, audience: "public" }))).toBe("STORY_VIDEO_TOO_LONG")
  })

  it("le plafond des stories vivantes est opposable, et retirer libère aussitôt une place", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const alice = await enter(t, root, "alice")
    const first = await publishStory(t, alice, root)
    await t.run(async (ctx) => {
      for (let index = 1; index < STORY_ACTIVE_PER_AUTHOR_MAX; index += 1) {
        const storageId = await ctx.storage.store(new Blob([new Uint8Array(8)]))
        await ctx.db.insert("stories", { networkId: root, authorPersonId: alice.personId, media: { storageId, kind: "image", mimeType: "image/png", sizeBytes: 8 }, audience: "public", publishedAt: T0, expiresAt: T0 + STORY_TTL_MS })
      }
    })
    const blob = await storeBlob(t, "image/png")
    const attempt = () => alice.as.mutation(S.publish, { networkId: root, media: { storageId: blob, kind: "image", mimeType: "image/png", sizeBytes: 64 }, audience: "public" })
    expect(await ruleOf(attempt())).toBe("STORY_ACTIVE_LIMIT")
    await alice.as.mutation(S.remove, { networkId: root, storyId: first.storyId })
    expect((await attempt()).created).toBe(true)
  })

  it("rejouer la clé rend la MÊME story ; rejouée dans un autre réseau, elle est refusée", async () => {
    const t = testConvex()
    const { root, testClosed } = await seed(t)
    const alice = await enter(t, root, "alice")
    await t.run(async (ctx) => ctx.db.insert("networkMemberships", { networkId: testClosed, personId: alice.personId, status: "declaree", role: "member", joinedAt: 1, statusChangedAt: 1 }))
    const storageId = await storeBlob(t, "image/png")
    const args = { networkId: root, media: { storageId, kind: "image" as const, mimeType: "image/png", sizeBytes: 64 }, audience: "public" as const, idempotencyKey: "k" }
    const first = await alice.as.mutation(S.publish, args)
    expect(await alice.as.mutation(S.publish, args)).toEqual({ ...first, created: false })
    expect(await codeOf(alice.as.mutation(S.publish, { ...args, networkId: testClosed }))).toBe("conflict")
  })

  it("une légende blanche devient absente, une légende trop longue est refusée", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const alice = await enter(t, root, "alice")
    const { storyId } = await publishStory(t, alice, root, { caption: "   " })
    expect((await alice.as.query(S.myActive, { networkId: root, now: Date.now() }))[0]).toMatchObject({ storyId, caption: null })
    const blob = await storeBlob(t, "image/png")
    expect(await ruleOf(alice.as.mutation(S.publish, { networkId: root, media: { storageId: blob, kind: "image", mimeType: "image/png", sizeBytes: 64 }, audience: "public", caption: "x".repeat(201) }))).toBe("STORY_CAPTION_TOO_LONG")
  })
})

describe("audience d'une story", () => {
  it("« connections » reste invisible d'un simple abonné et s'ouvre à une connexion acceptée", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const alice = await enter(t, root, "alice")
    const follower = await enter(t, root, "abonne")
    const friend = await enter(t, root, "amie")
    await follower.as.mutation(api.modules.graph.follows.follow, { networkId: root, handle: "alice" })
    await connect(t, root, alice, friend)
    const { storyId } = await publishStory(t, alice, root, { audience: "connections" })
    expect(await follower.as.query(S.listByAuthor, { networkId: root, handle: "alice", now: Date.now() })).toEqual([])
    expect(await codeOf(follower.as.mutation(S.markSeen, { networkId: root, storyId }))).toBe("notFound")
    expect((await friend.as.query(S.listByAuthor, { networkId: root, handle: "alice", now: Date.now() })).map((s) => s.storyId)).toEqual([storyId])
  })

  it("un blocage referme même une story « public » ; un identifiant inconnu et un bloqué rendent le même refus", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const alice = await enter(t, root, "alice")
    const bob = await enter(t, root, "bob")
    const { storyId } = await publishStory(t, alice, root)
    await alice.as.mutation(api.modules.graph.connections.blockPerson, { networkId: root, targetPersonId: bob.personId })
    expect(await codeOf(bob.as.query(S.listByAuthor, { networkId: root, handle: "alice", now: Date.now() }))).toBe("notFound")
    expect(await codeOf(bob.as.query(S.listByAuthor, { networkId: root, handle: "inconnu", now: Date.now() }))).toBe("notFound")
    expect(await codeOf(bob.as.mutation(S.markSeen, { networkId: root, storyId }))).toBe("notFound")
  })
})

describe("le plateau", () => {
  it("groupe par auteur, compte les non-vues, me place en tête puis les non-vues puis le reste ; les miennes ne sont jamais « non vues »", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const me = await enter(t, root, "moi")
    const bob = await enter(t, root, "bob")
    const carla = await enter(t, root, "carla")
    await connect(t, root, me, bob)
    await connect(t, root, me, carla)
    await publishStory(t, bob, root)
    const carlaStory = await publishStory(t, carla, root)
    await publishStory(t, bob, root)
    await publishStory(t, me, root)
    await me.as.mutation(S.markSeen, { networkId: root, storyId: carlaStory.storyId })
    const groups = await tray(me, root)
    expect(groups.map((group) => ({ handle: group.author.handle, stories: group.storyCount, unseen: group.unseenCount }))).toEqual([
      { handle: "moi", stories: 1, unseen: 0 },
      { handle: "bob", stories: 2, unseen: 2 },
      { handle: "carla", stories: 1, unseen: 0 },
    ])
  })

  it("une source bloquée disparaît ; une story expirée ne figure plus au plateau ni au mur", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const me = await enter(t, root, "moi")
    const bob = await enter(t, root, "bob")
    const carla = await enter(t, root, "carla")
    await connect(t, root, me, bob)
    await connect(t, root, me, carla)
    await publishStory(t, bob, root)
    const old = await publishStory(t, carla, root)
    await me.as.mutation(api.modules.graph.connections.blockPerson, { networkId: root, targetPersonId: bob.personId })
    expect((await tray(me, root)).map((group) => group.author.handle)).toEqual(["carla"])
    await t.run(async (ctx) => ctx.db.patch(old.storyId, { expiresAt: Date.now() - 1000 }))
    expect(await tray(me, root)).toEqual([])
    expect(await me.as.query(S.listByAuthor, { networkId: root, handle: "carla", now: Date.now() })).toEqual([])
  })

  it("la vignette retombe sur un média SERVABLE ; un groupe sans aucun est écarté ; un auteur tout-vidéo garde sa place", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const me = await enter(t, root, "moi")
    const bob = await enter(t, root, "bob")
    const carla = await enter(t, root, "carla")
    const dora = await enter(t, root, "dora")
    for (const other of [bob, carla, dora]) await connect(t, root, me, other)
    const servable = await publishStory(t, bob, root)
    await publishStory(t, bob, root, { servable: false })
    await publishStory(t, carla, root, { servable: false })
    await publishStory(t, dora, root, { kind: "video" })
    const groups = await tray(me, root)
    expect(groups.map((group) => group.author.handle).sort()).toEqual(["bob", "dora"])
    const bobGroup = groups.find((group) => group.author.handle === "bob")!
    expect(bobGroup.storyCount).toBe(2)
    expect(bobGroup.cover.kind).toBe("image")
    const servedUrl = (await me.as.query(S.listByAuthor, { networkId: root, handle: "bob", now: Date.now() })).find((story) => story.storyId === servable.storyId)!.media.url
    expect(bobGroup.cover.url).toBe(servedUrl)
    expect(groups.find((group) => group.author.handle === "dora")!.cover.kind).toBe("video")
  })
})

describe("regarder, « vu », « vu par »", () => {
  it("marquer deux fois ne compte qu'une fois ; l'auteur qui se relit ne se compte pas ; le compte n'est rendu qu'à l'auteur", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const alice = await enter(t, root, "alice")
    const bob = await enter(t, root, "bob")
    const { storyId } = await publishStory(t, alice, root)
    expect(await bob.as.mutation(S.markSeen, { networkId: root, storyId })).toEqual({ seen: true, first: true })
    expect(await bob.as.mutation(S.markSeen, { networkId: root, storyId })).toEqual({ seen: true, first: false })
    expect(await alice.as.mutation(S.markSeen, { networkId: root, storyId })).toEqual({ seen: true, first: false })
    expect((await alice.as.query(S.myActive, { networkId: root, now: Date.now() }))[0]).toMatchObject({ viewCount: 1, seen: true, isOwn: true })
    expect((await bob.as.query(S.listByAuthor, { networkId: root, handle: "alice", now: Date.now() }))[0]).toMatchObject({ viewCount: null, seen: true, isOwn: false })
  })

  it("« vu par » : l'auteur seul, du plus récent au plus ancien, à curseur natif — les ex æquo d'une frontière ne se perdent plus", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const alice = await enter(t, root, "alice")
    const { storyId } = await publishStory(t, alice, root)
    const viewers: Person[] = []
    for (let index = 0; index < 6; index += 1) viewers.push(await enter(t, root, `spectateur${index}`))
    for (const viewer of viewers) await viewer.as.mutation(S.markSeen, { networkId: root, storyId })
    expect(await codeOf(viewers[0]!.as.query(S.viewers, { networkId: root, storyId, paginationOpts: { numItems: 10, cursor: null } }))).toBe("notFound")
    const seen = new Set<string>()
    let cursor: string | null = null
    for (let pages = 0; pages < 10; pages += 1) {
      const page: { page: { viewer: { personId: string } }[]; continueCursor: string; isDone: boolean } = await alice.as.query(S.viewers, { networkId: root, storyId, paginationOpts: { numItems: 4, cursor } })
      for (const row of page.page) seen.add(row.viewer.personId)
      if (page.isDone) break
      cursor = page.continueCursor
    }
    // Les six vues partagent la même milliseconde (horloge figée) : toutes sont rendues.
    expect(seen.size).toBe(6)
  })
})

describe("retrait d'une story", () => {
  it("idempotent, il referme la story pour les autres ; l'auteur garde « vu par » jusqu'à la purge ; celle d'autrui se refuse", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const alice = await enter(t, root, "alice")
    const bob = await enter(t, root, "bob")
    const { storyId } = await publishStory(t, alice, root)
    await bob.as.mutation(S.markSeen, { networkId: root, storyId })
    expect(await codeOf(bob.as.mutation(S.remove, { networkId: root, storyId }))).toBe("notFound")
    await alice.as.mutation(S.remove, { networkId: root, storyId })
    await alice.as.mutation(S.remove, { networkId: root, storyId })
    expect(await codeOf(bob.as.mutation(S.markSeen, { networkId: root, storyId }))).toBe("notFound")
    expect(await alice.as.query(S.myActive, { networkId: root, now: Date.now() })).toEqual([])
    expect((await alice.as.query(S.viewers, { networkId: root, storyId, paginationOpts: { numItems: 10, cursor: null } })).page).toHaveLength(1)
  })
})

describe("purge des stories expirées", () => {
  it("efface la ligne, ses vues, ses décomptes, son blob ET sa ligne d'analyse ; épargne les vivantes", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const alice = await enter(t, root, "alice")
    const bob = await enter(t, root, "bob")
    const dead = await publishStory(t, alice, root)
    const alive = await publishStory(t, alice, root)
    await bob.as.mutation(S.markSeen, { networkId: root, storyId: dead.storyId })
    await alice.as.mutation(S.remove, { networkId: root, storyId: dead.storyId })
    vi.setSystemTime(Date.now() + 1000)
    await t.mutation(internal.modules.stories.stories.purgeExpired, {})
    const state = await t.run(async (ctx) => ({
      dead: await ctx.db.get(dead.storyId),
      alive: (await ctx.db.get(alive.storyId)) !== null,
      views: (await ctx.db.query("storyViews").withIndex("by_story_seenAt", (q) => q.eq("storyId", dead.storyId)).take(5)).length,
      blob: (await ctx.db.system.get("_storage", dead.storageId)) !== null,
      scan: (await ctx.db.query("fileScans").withIndex("by_storageId", (q) => q.eq("storageId", dead.storageId)).first()) !== null,
    }))
    expect(state).toEqual({ dead: null, alive: true, views: 0, blob: false, scan: false })
  })

  it("un blob déjà absent ne fait pas échouer le lot ; un lot plein se replanifie, un lot partiel non", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const alice = await enter(t, root, "alice")
    const ghost = await publishStory(t, alice, root)
    await t.run(async (ctx) => {
      await ctx.storage.delete(ghost.storageId)
      await ctx.db.patch(ghost.storyId, { expiresAt: Date.now() - 1 })
      for (let index = 0; index < PURGE_BATCH; index += 1) {
        const storageId = await ctx.storage.store(new Blob([new Uint8Array(8)]))
        await ctx.db.insert("stories", { networkId: root, authorPersonId: alice.personId, media: { storageId, kind: "image", mimeType: "image/png", sizeBytes: 8 }, audience: "public", publishedAt: 1, expiresAt: 2 + index })
      }
    })
    await t.mutation(internal.modules.stories.stories.purgeExpired, {})
    // Lot plein : cinquante parties, la cinquante et unième attend la passe replanifiée.
    expect(await t.run(async (ctx) => (await ctx.db.query("stories").withIndex("by_expiresAt").take(100)).length)).toBe(1)
    await t.finishAllScheduledFunctions(vi.runAllTimers)
    expect(await t.run(async (ctx) => (await ctx.db.query("stories").withIndex("by_expiresAt").take(100)).length)).toBe(0)
  })
})

describe("DTO et réseaux", () => {
  it("rend une URL de la garde et jamais un identifiant de stockage ; non servable : omise pour les autres, retenue pour l'auteur", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const alice = await enter(t, root, "alice")
    const bob = await enter(t, root, "bob")
    const shown = await publishStory(t, alice, root)
    const pending = await publishStory(t, alice, root, { servable: false })
    const forBob = await bob.as.query(S.listByAuthor, { networkId: root, handle: "alice", now: Date.now() })
    expect(forBob.map((s) => s.storyId)).toEqual([shown.storyId])
    expect(JSON.stringify(forBob)).not.toContain('"storageId"')
    expect(forBob[0]!.media.url).toBeTruthy()
    const mine = await alice.as.query(S.myActive, { networkId: root, now: Date.now() })
    expect(mine.map((s) => ({ id: s.storyId, withheld: s.media.withheld }))).toEqual([
      { id: shown.storyId, withheld: null },
      { id: pending.storyId, withheld: "fileScanPending" },
    ])
  })

  it("une story d'un autre réseau est introuvable ; le plateau d'un réseau ne montre que les siennes", async () => {
    const t = testConvex()
    const { root, testClosed } = await seed(t)
    const alice = await enter(t, root, "alice")
    const bob = await enter(t, root, "bob")
    for (const person of [alice, bob]) await t.run(async (ctx) => ctx.db.insert("networkMemberships", { networkId: testClosed, personId: person.personId, status: "declaree", role: "member", joinedAt: 1, statusChangedAt: 1 }))
    await connect(t, root, alice, bob)
    const { storyId } = await publishStory(t, alice, root)
    expect(await codeOf(bob.as.mutation(S.markSeen, { networkId: testClosed, storyId }))).toBe("notFound")
    expect(await codeOf(alice.as.query(S.viewers, { networkId: testClosed, storyId, paginationOpts: { numItems: 5, cursor: null } }))).toBe("notFound")
    expect((await tray(bob, root)).map((group) => group.author.handle)).toEqual(["alice"])
    expect(await tray(bob, testClosed)).toEqual([])
  })
})

// ═══════════════════════════════════════════════════════════════
// SD-01 — une Story signalée reste lisible par la modération jusqu'à la décision
// ═══════════════════════════════════════════════════════════════

describe("SD-01 — une Story signalée attend la décision", () => {
  const M = api.modules.moderation.cases
  const preview = api.modules.moderation.reviewProjection.preview

  async function moderator(t: T, rootId: Id<"networks">): Promise<Person> {
    const person = await enter(t, rootId, "moderatrice")
    await t.run(async (ctx) => {
      const row = await ctx.db.query("networkMemberships").withIndex("by_network_and_person", (q) => q.eq("networkId", rootId).eq("personId", person.personId)).unique()
      if (row) await ctx.db.patch(row._id, { role: "network_moderator" })
    })
    return person
  }

  /** La ligne ET le blob de la Story existent-ils encore ? */
  async function kept(t: T, story: { storyId: Id<"stories">; storageId: Id<"_storage"> }) {
    return await t.run(async (ctx) => ({
      row: (await ctx.db.get(story.storyId)) !== null,
      blob: (await ctx.db.system.get("_storage", story.storageId)) !== null,
    }))
  }

  /** Un passage du cron de purge, chaîne replanifiée comprise. */
  async function purge(t: T) {
    await t.mutation(internal.modules.stories.stories.purgeExpired, {})
    await t.finishAllScheduledFunctions(vi.runAllTimers)
  }

  it("après ses 24 h, la Story signalée reste à la modération et à elle seule ; la décision la livre à la purge suivante", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const alice = await enter(t, root, "alice")
    const bob = await enter(t, root, "bob")
    const carol = await enter(t, root, "carol")
    const mod = await moderator(t, root)
    const story = await publishStory(t, alice, root, { caption: "Au marché" })
    const target = { kind: "story" as const, id: story.storyId }
    // Jamais sur soi : l'auteur ne signale pas sa propre Story (refus indistinct).
    expect(await codeOf(alice.as.mutation(M.report, { networkId: root, target, reason: "harassment" }))).toBe("notFound")
    const report = await bob.as.mutation(M.report, { networkId: root, target, reason: "harassment" })
    expect(report).toMatchObject({ created: true })

    vi.setSystemTime(Date.now() + STORY_TTL_MS + 60_000)
    await purge(t)
    expect(await kept(t, story)).toEqual({ row: true, blob: true })

    // Les membres ne la voient plus : ni au plateau, ni au mur, ni l'auteur parmi ses Stories actives.
    expect(await tray(carol, root)).toEqual([])
    expect(await carol.as.query(S.listByAuthor, { networkId: root, handle: "alice", now: Date.now() })).toEqual([])
    expect(await codeOf(carol.as.mutation(S.markSeen, { networkId: root, storyId: story.storyId }))).toBe("notFound")
    expect(await alice.as.query(S.myActive, { networkId: root, now: Date.now() })).toEqual([])

    // Expirée, elle ne se signale plus : le même refus qu'une Story déjà purgée.
    const purged = await publishStory(t, alice, root)
    await alice.as.mutation(S.remove, { networkId: root, storyId: purged.storyId })
    vi.setSystemTime(Date.now() + 1000)
    await purge(t)
    expect(await kept(t, purged)).toEqual({ row: false, blob: false })
    const expiredRefusal = await codeOf(carol.as.mutation(M.report, { networkId: root, target, reason: "harassment" }))
    expect(expiredRefusal).toBe("notFound")
    expect(await codeOf(carol.as.mutation(M.report, { networkId: root, target: { kind: "story", id: purged.storyId }, reason: "harassment" }))).toBe(expiredRefusal)

    // La modération relit la Story signalée, média compris, malgré l'expiration.
    const seen = await mod.as.query(preview, { networkId: root, reportId: report.reportId })
    expect(seen).toMatchObject({ kind: "story", available: true, body: "Au marché" })
    expect(seen.media).toHaveLength(1)

    // Le dossier tranché, la purge suivante l'efface (ligne et blob) ; le dossier clos ne se relit plus.
    await mod.as.mutation(M.decide, { networkId: root, reportId: report.reportId, decision: "dismissed", reason: "Aucune atteinte constatée.", sanctions: [] })
    expect(await kept(t, story)).toEqual({ row: true, blob: true })
    await purge(t)
    expect(await kept(t, story)).toEqual({ row: false, blob: false })
    expect(await codeOf(mod.as.query(preview, { networkId: root, reportId: report.reportId }))).toBe("notFound")
  })

  it("retirée par son auteur après le signalement, elle attend aussi la décision ; un retrait par la modération la libère", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const alice = await enter(t, root, "alice")
    const bob = await enter(t, root, "bob")
    const carol = await enter(t, root, "carol")
    const mod = await moderator(t, root)
    const story = await publishStory(t, alice, root)
    const report = await bob.as.mutation(M.report, { networkId: root, target: { kind: "story", id: story.storyId }, reason: "harassment" })
    await alice.as.mutation(S.remove, { networkId: root, storyId: story.storyId })
    vi.setSystemTime(Date.now() + 1000)
    await purge(t)
    expect(await kept(t, story)).toEqual({ row: true, blob: true })
    expect(await tray(carol, root)).toEqual([])
    expect(await mod.as.query(preview, { networkId: root, reportId: report.reportId })).toMatchObject({ kind: "story", available: true })

    await mod.as.mutation(M.decide, { networkId: root, reportId: report.reportId, decision: "actioned", reason: "Atteinte confirmée.", sanctions: [{ kind: "removal" }] })
    await purge(t)
    expect(await kept(t, story)).toEqual({ row: false, blob: false })
  })

  it("une tête de Stories retenues n'arrête jamais la purge des autres ; un dossier tranché ne retient rien, un dossier en examen retient", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const alice = await enter(t, root, "alice")
    const ids = await t.run(async (ctx) => {
      const insertStory = async (expiresAt: number) => {
        const storageId = await ctx.storage.store(new Blob([new Uint8Array(8)]))
        return await ctx.db.insert("stories", { networkId: root, authorPersonId: alice.personId, media: { storageId, kind: "image", mimeType: "image/png", sizeBytes: 8 }, audience: "public", publishedAt: 1, expiresAt })
      }
      const fileReport = async (storyId: Id<"stories">, status: "open" | "reviewing" | "dismissed" | "actioned") => {
        await ctx.db.insert("reports", { networkId: root, target: { kind: "story", id: storyId }, targetKind: "story", targetId: storyId, reason: "harassment", level: "network", status, createdAt: 1, updatedAt: 1 })
      }
      // Les plus anciennes d'abord : un lot plein de Stories retenues, devant le reste de la fenêtre.
      const held: Id<"stories">[] = []
      for (let index = 0; index < PURGE_BATCH; index += 1) {
        const storyId = await insertStory(2 + index)
        await fileReport(storyId, index % 2 === 0 ? "open" : "reviewing")
        held.push(storyId)
      }
      const decided = await insertStory(PURGE_BATCH + 10)
      await fileReport(decided, "dismissed")
      const actioned = await insertStory(PURGE_BATCH + 11)
      await fileReport(actioned, "actioned")
      const plain = await insertStory(PURGE_BATCH + 12)
      return { held, freed: [decided, actioned, plain] }
    })
    const remaining = async () => await t.run(async (ctx) => (await ctx.db.query("stories").withIndex("by_expiresAt").take(200)).map((row) => row._id))

    await purge(t)
    expect(new Set(await remaining())).toEqual(new Set(ids.held))
    // Le passage suivant du cron relit la tête retenue, ne l'efface pas, et s'arrête.
    await purge(t)
    expect(new Set(await remaining())).toEqual(new Set(ids.held))
  })
})
