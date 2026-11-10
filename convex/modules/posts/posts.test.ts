// @vitest-environment edge-runtime
// Dupliqué de socle/convex/modules/reseauPersonnel/reseauPersonnel.test.ts (cas des publications, l. 215-560 et 991-2225 ; avec feedScale.test.ts, l. 80-185) @ ad2e7fdc2 — adaptations : personnes et réseaux (graine des fondations) ; fil, mur, recherche et lecture LUS DEPUIS un réseau ; séries de publications insérées directement (le débit de `publish` est réel dans le harnais) ; cas d'organisation, de page, de direct et de suspension (ADR-0087) retirés ; blob déguisé jugé sur son POIDS réel (le harnais n'enregistre pas de type) ; tests neufs : contexte de lecture (R4, `root` lu depuis la racine avec son origine), blocage qui l'emporte sur `public`, portée et pays, groupe, épingle par réseau, lacune signalée, fil natif compatible.
import { engineErrorCode, engineErrorRule } from "@antsia/social-contracts/errors"
import { compareFeedPosts } from "@antsia/social-domain/feedScale"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { api, internal } from "../../_generated/api"
import type { Doc, Id } from "../../_generated/dataModel"
import { SEED_CONFIRMATION } from "../../seeds/foundations"
import { testConvex } from "../../test.setup"

type T = ReturnType<typeof testConvex>
type Person = { as: ReturnType<T["withIdentity"]>; personId: Id<"persons">; handle: string }
type Cursor = { publishedAt: number; postId: Id<"posts"> }

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13])
const FR = { values: { countryOfResidence: "FR" }, visibilities: {} }

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

/** Une personne au profil publié, membre de la racine (et du réseau fermé si demandé). */
async function enter(t: T, rootId: Id<"networks">, handle: string, closed?: Id<"networks">): Promise<Person> {
  const as = t.withIdentity({ subject: `auth-${handle}` })
  const personId = await as.mutation(api.modules.people.persons.ensureMyPerson, {})
  await as.mutation(api.modules.people.consents.recordConsent, { purpose: "social_profile", origin: "onboarding" })
  await as.mutation(api.modules.people.profile.publishMyProfile, { handle, displayName: handle })
  await as.mutation(api.modules.people.memberships.joinNetwork, { networkId: rootId })
  if (closed) {
    await as.mutation(api.modules.people.memberships.joinNetwork, { networkId: closed, facet: FR })
    // Le réseau fermé de test admet « en attente » : la déclaration acceptée le fait « déclarée ».
    await t.run(async (ctx) => {
      const membership = await ctx.db
        .query("networkMemberships")
        .withIndex("by_network_and_person", (q) => q.eq("networkId", closed).eq("personId", personId))
        .unique()
      if (membership) await ctx.db.patch(membership._id, { status: "declaree" })
    })
  }
  return { as, personId, handle }
}

/** Une connexion ACCEPTÉE dans un réseau (paire canonique). */
async function connect(t: T, networkId: Id<"networks">, a: Person, b: Person): Promise<Id<"connections">> {
  return await t.run(async (ctx) => {
    const [low, high] = a.personId < b.personId ? [a.personId, b.personId] : [b.personId, a.personId]
    const now = Date.now()
    return await ctx.db.insert("connections", {
      networkId,
      personIdLow: low,
      personIdHigh: high,
      requestedByPersonId: a.personId,
      recipientPersonId: b.personId,
      status: "accepted",
      requestedAt: now,
      respondedAt: now,
      updatedAt: now,
    })
  })
}

/** Une publication insérée directement (séries, ex æquo) — mêmes champs que `writePost`. */
async function insertPost(
  t: T,
  input: { networkId: Id<"networks">; author: Person; audience?: Doc<"posts">["audience"]; visibility?: Doc<"posts">["visibility"]; onRoot: boolean; publishedAt?: number; body?: string },
): Promise<Id<"posts">> {
  return await t.run(async (ctx) => {
    const at = input.publishedAt ?? Date.now()
    const body = input.body ?? "Une publication"
    return await ctx.db.insert("posts", {
      networkId: input.networkId,
      authorPersonId: input.author.personId,
      body,
      audience: input.audience ?? "public",
      visibility: input.visibility ?? "network",
      onRoot: input.onRoot,
      status: "published",
      searchText: body,
      publishedAt: at,
      createdAt: at,
      updatedAt: at,
    })
  })
}

/** `n` publications d'un auteur à la racine, rendues dans l'ordre de LECTURE (plus récente d'abord). */
async function rootSeries(t: T, rootId: Id<"networks">, author: Person, n: number, audience: Doc<"posts">["audience"] = "public"): Promise<Id<"posts">[]> {
  const ids: Id<"posts">[] = []
  for (let i = 0; i < n; i += 1) ids.push(await insertPost(t, { networkId: rootId, author, audience, onRoot: true, publishedAt: 1_700_000_000_000 + i, body: `Publication ${i}` }))
  return ids.reverse()
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

async function getPost(reader: Person, networkId: Id<"networks">, postId: Id<"posts">) {
  return await reader.as.query(api.modules.posts.posts.getPost, { networkId, postId })
}

async function myFeed(reader: Person, networkId: Id<"networks">, args: { cursor?: Cursor; limit?: number; tag?: string; scope?: "pour_vous" | "recents" } = {}) {
  return await reader.as.query(api.modules.posts.posts.myFeed, { networkId, ...args })
}

async function storeBlob(t: T, content: Uint8Array, type: string): Promise<Id<"_storage">> {
  return await t.run(async (ctx) => ctx.storage.store(new Blob([content as BlobPart], { type })))
}

// ═══════════════════════════════════════════════════════════════
// Audience
// ═══════════════════════════════════════════════════════════════

describe("audience d'une publication", () => {
  it("`connections` n'est lisible que d'une connexion acceptée ; rompre la referme aussitôt, sans rien réécrire", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const alice = await enter(t, root, "alice")
    const bob = await enter(t, root, "bob")
    const carol = await enter(t, root, "carol")
    const connectionId = await connect(t, root, alice, bob)
    const { postId } = await alice.as.mutation(api.modules.posts.posts.publish, { networkId: root, body: "Entre nous", audience: "connections" })
    expect((await getPost(bob, root, postId)).reason).toBe("connection")
    expect(await codeOf(getPost(carol, root, postId))).toBe("notFound")
    await t.run(async (ctx) => ctx.db.patch(connectionId, { status: "declined" }))
    expect(await codeOf(getPost(bob, root, postId))).toBe("notFound")
  })

  it("une publication retirée n'est plus lisible que par son auteur ; retirer celle d'autrui est un refus indistinct", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const alice = await enter(t, root, "alice")
    const bob = await enter(t, root, "bob")
    const { postId } = await alice.as.mutation(api.modules.posts.posts.publish, { networkId: root, body: "Bientôt retirée" })
    expect(await codeOf(bob.as.mutation(api.modules.posts.posts.remove, { networkId: root, postId }))).toBe("notFound")
    await alice.as.mutation(api.modules.posts.posts.remove, { networkId: root, postId })
    await alice.as.mutation(api.modules.posts.posts.remove, { networkId: root, postId })
    expect(await codeOf(getPost(bob, root, postId))).toBe("notFound")
    expect((await getPost(alice, root, postId)).isMine).toBe(true)
  })

  it("le blocage l'emporte sur `public` : ni lecture, ni fil, ni recherche, ni mur — l'auteur garde les siennes", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const alice = await enter(t, root, "alice")
    const bob = await enter(t, root, "bob")
    const { postId } = await alice.as.mutation(api.modules.posts.posts.publish, { networkId: root, body: "Annonce publique #ouverte" })
    await alice.as.mutation(api.modules.graph.connections.blockPerson, { networkId: root, targetPersonId: bob.personId })
    expect(await codeOf(getPost(bob, root, postId))).toBe("notFound")
    expect((await myFeed(bob, root, { scope: "recents" })).items).toEqual([])
    expect((await bob.as.query(api.modules.posts.posts.feed, { networkId: root, paginationOpts: { numItems: 10, cursor: null } })).page).toEqual([])
    expect((await bob.as.query(api.modules.posts.posts.search, { networkId: root, query: "annonce" })).items).toEqual([])
    expect((await bob.as.query(api.modules.posts.posts.personPosts, { networkId: root, handle: "alice" })).items).toEqual([])
    expect(await codeOf(bob.as.mutation(api.modules.engagement.engagement.toggleReaction, { networkId: root, postId, kind: "like" }))).toBe("notFound")
    expect((await getPost(alice, root, postId)).isMine).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════
// Contexte de lecture : réseau fermé et racine (R4)
// ═══════════════════════════════════════════════════════════════

describe("contexte de lecture — un réseau fermé et la racine (R4)", () => {
  it("une publication `network` d'un réseau fermé n'est rendue par aucune lecture de la racine", async () => {
    const t = testConvex()
    const { root, testClosed } = await seed(t)
    const alice = await enter(t, root, "alice", testClosed)
    const bob = await enter(t, root, "bob", testClosed)
    const { postId } = await alice.as.mutation(api.modules.posts.posts.publish, { networkId: testClosed, body: "Reste chez nous #diaspora" })
    expect((await getPost(bob, testClosed, postId)).origin).toBeNull()
    expect(await codeOf(getPost(bob, root, postId))).toBe("notFound")
    expect((await myFeed(bob, root, { scope: "recents" })).items).toEqual([])
    expect((await bob.as.query(api.modules.posts.posts.feed, { networkId: root, paginationOpts: { numItems: 10, cursor: null } })).page).toEqual([])
    expect((await bob.as.query(api.modules.posts.posts.search, { networkId: root, query: "reste" })).items).toEqual([])
    expect((await bob.as.query(api.modules.posts.posts.personPosts, { networkId: root, handle: "alice" })).items).toEqual([])
  })

  it("« aussi sur ANTSIA » : lue dans le fil de la racine avec son origine, et dans son réseau ; retirée, elle disparaît des deux", async () => {
    const t = testConvex()
    const { root, testClosed } = await seed(t)
    const alice = await enter(t, root, "alice", testClosed)
    const bob = await enter(t, root, "bob")
    const { postId } = await alice.as.mutation(api.modules.posts.posts.publish, { networkId: testClosed, body: "Bonjour ANTSIA", alsoOnRoot: true })
    const [atRoot] = (await myFeed(bob, root, { scope: "recents" })).items
    expect(atRoot).toMatchObject({ _id: postId, visibility: "root", origin: { networkId: testClosed, slug: "test-closed" } })
    expect((await bob.as.query(api.modules.posts.posts.feed, { networkId: root, paginationOpts: { numItems: 10, cursor: null } })).page.map((item) => item._id)).toEqual([postId])
    // Bob n'est pas membre du réseau fermé : il n'y lit rien, même ce qu'il lit à la racine.
    expect(await codeOf(getPost(bob, testClosed, postId))).toBe("notFound")
    await alice.as.mutation(api.modules.posts.posts.remove, { networkId: root, postId })
    expect(await codeOf(getPost(bob, root, postId))).toBe("notFound")
    expect((await myFeed(alice, testClosed, { scope: "recents" })).items).toEqual([])
  })

  it("un geste explicite ouvre une native publique sans ouvrir le réseau fermé", async () => {
    const t = testConvex()
    const { root, testClosed } = await seed(t)
    const alice = await enter(t, root, "alice", testClosed)
    const { postId } = await alice.as.mutation(api.modules.posts.posts.publish, { networkId: root, body: "Native de la racine", alsoOnRoot: true })
    expect((await getPost(alice, root, postId)).visibility).toBe("root")
    expect(await codeOf(getPost(alice, testClosed, postId))).toBe("notFound")
  })
})

// ═══════════════════════════════════════════════════════════════
// Le fil
// ═══════════════════════════════════════════════════════════════

describe("un abonné n'entre pas dans le cercle", () => {
  it("suivre n'ouvre que le public ; sans aucun lien, « Pour vous » reste vide, « Récents » montre le public", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const alice = await enter(t, root, "alice")
    const bob = await enter(t, root, "bob")
    const carol = await enter(t, root, "carol")
    const open = await alice.as.mutation(api.modules.posts.posts.publish, { networkId: root, body: "Pour tous" })
    await alice.as.mutation(api.modules.posts.posts.publish, { networkId: root, body: "Pour mes connexions", audience: "connections" })
    await bob.as.mutation(api.modules.graph.follows.follow, { networkId: root, handle: "alice" })
    expect((await myFeed(bob, root)).items.map((item) => [item._id, item.reason])).toEqual([[open.postId, "follow"]])
    expect((await myFeed(carol, root)).items).toEqual([])
    expect((await myFeed(carol, root, { scope: "recents" })).items.map((item) => [item._id, item.reason])).toEqual([[open.postId, "public"]])
  })
})

describe("pagination du fil (curseur composite)", () => {
  it("enchaîne les pages sans trou ni doublon quand la page se remplit avant la fenêtre", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const alice = await enter(t, root, "alice")
    const bob = await enter(t, root, "bob")
    await connect(t, root, alice, bob)
    const expected = await rootSeries(t, root, alice, 25)
    const seen: string[] = []
    let cursor: Cursor | undefined
    let last: Cursor | null = null
    for (let page = 0; page < 3; page += 1) {
      const feed = await myFeed(bob, root, cursor === undefined ? { limit: 10 } : { limit: 10, cursor })
      seen.push(...feed.items.map((item) => item._id))
      last = feed.nextCursor
      cursor = feed.nextCursor ?? undefined
      if (page < 2) expect(feed.items).toHaveLength(10)
    }
    expect(seen).toEqual(expected)
    expect(last).toBeNull()
  })

  it("une fenêtre partielle entièrement parcourue ne rend aucun curseur ; une page pleine en rend un", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const alice = await enter(t, root, "alice")
    const bob = await enter(t, root, "bob")
    await connect(t, root, alice, bob)
    const expected = await rootSeries(t, root, alice, 12)
    const first = await myFeed(bob, root, { limit: 10 })
    expect(first.nextCursor).not.toBeNull()
    const second = await myFeed(bob, root, { limit: 10, cursor: first.nextCursor! })
    expect(second.items.map((item) => item._id)).toEqual(expected.slice(10))
    expect(second.nextCursor).toBeNull()
  })

  it("ne saute pas une publication quand deux lignes partagent l'instant de frontière", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const alice = await enter(t, root, "alice")
    const bob = await enter(t, root, "bob")
    await connect(t, root, alice, bob)
    for (let i = 0; i < 3; i += 1) await insertPost(t, { networkId: root, author: alice, onRoot: true, publishedAt: 1_700_000_001_000 })
    const first = await myFeed(bob, root, { limit: 2 })
    const second = await myFeed(bob, root, { limit: 2, cursor: first.nextCursor! })
    const seen = [...first.items, ...second.items].map((item) => item._id)
    expect(new Set(seen).size).toBe(3)
  })

  it("pagine sans perte plus de 50 publications d'un auteur au même instant", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const author = await enter(t, root, "auteur")
    const reader = await enter(t, root, "lecteur")
    await connect(t, root, author, reader)
    for (let i = 0; i < 75; i += 1) await insertPost(t, { networkId: root, author, audience: "connections", onRoot: true, publishedAt: 1_700_000_123_456 })
    const expected = await t.run(async (ctx) =>
      (await ctx.db
        .query("posts")
        .withIndex("by_root_author_status_publishedAt", (q) => q.eq("onRoot", true).eq("authorPersonId", author.personId).eq("status", "published"))
        .take(100))
        .sort(compareFeedPosts)
        .map((post) => post._id),
    )
    const seen: string[] = []
    const sizes: number[] = []
    let cursor: Cursor | undefined
    for (let page = 0; page < 10; page += 1) {
      const feed = await myFeed(reader, root, cursor === undefined ? { limit: 20 } : { limit: 20, cursor })
      seen.push(...feed.items.map((item) => item._id))
      sizes.push(feed.items.length)
      if (feed.nextCursor === null) break
      cursor = feed.nextCursor
    }
    expect(sizes).toEqual([20, 20, 20, 15])
    expect(seen).toEqual(expected)
  })

  it("« Récents » pagine exactement au-delà de la fenêtre globale de 200", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const author = await enter(t, root, "auteur")
    const reader = await enter(t, root, "lecteur")
    for (let i = 0; i < 205; i += 1) await insertPost(t, { networkId: root, author, onRoot: true, publishedAt: 1_700_000_654_321 })
    const expected = await t.run(async (ctx) =>
      (await ctx.db
        .query("posts")
        .withIndex("by_root_status_publishedAt", (q) => q.eq("onRoot", true).eq("status", "published"))
        .take(210))
        .sort(compareFeedPosts)
        .map((post) => post._id),
    )
    const seen: string[] = []
    const sizes: number[] = []
    let cursor: Cursor | undefined
    for (let page = 0; page < 10; page += 1) {
      const feed = await myFeed(reader, root, cursor === undefined ? { limit: 50, scope: "recents" } : { limit: 50, scope: "recents", cursor })
      seen.push(...feed.items.map((item) => item._id))
      sizes.push(feed.items.length)
      if (feed.nextCursor === null) break
      cursor = feed.nextCursor
    }
    expect(sizes).toEqual([50, 50, 50, 50, 5])
    expect(seen).toEqual(expected)
  })

  it("la lacune se dit : une fenêtre pleine qui ne remplit pas la page rend `lacunar`", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const stranger = await enter(t, root, "inconnu")
    const reader = await enter(t, root, "lecteur")
    for (let i = 0; i < 200; i += 1) await insertPost(t, { networkId: root, author: stranger, audience: "connections", onRoot: true, publishedAt: 1_700_000_000_000 + i })
    const feed = await myFeed(reader, root, { scope: "recents", limit: 10 })
    expect(feed.items).toEqual([])
    expect(feed.lacunar).toBe(true)
    expect(feed.nextCursor).not.toBeNull()
  })

  it("le filtre par tag RESTREINT le fil, il ne l'ouvre jamais", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const alice = await enter(t, root, "alice")
    const bob = await enter(t, root, "bob")
    const carol = await enter(t, root, "carol")
    await connect(t, root, alice, bob)
    const tagged = await alice.as.mutation(api.modules.posts.posts.publish, { networkId: root, body: "Réunion #Gabon" })
    await alice.as.mutation(api.modules.posts.posts.publish, { networkId: root, body: "Sans tag" })
    await carol.as.mutation(api.modules.posts.posts.publish, { networkId: root, body: "Hors de mes liens #gabon" })
    expect((await myFeed(bob, root, { tag: "gabon" })).items.map((item) => item._id)).toEqual([tagged.postId])
  })
})

describe("le fil natif « Récents » (`feed`) garde sa forme", () => {
  it("rend les champs historiques et les nouveaux ; masquage et sourdine s'y appliquent", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const alice = await enter(t, root, "alice")
    const bob = await enter(t, root, "bob")
    const carol = await enter(t, root, "carol")
    const kept = await alice.as.mutation(api.modules.posts.posts.publish, { networkId: root, body: "Gardée" })
    const hidden = await alice.as.mutation(api.modules.posts.posts.publish, { networkId: root, body: "Masquée" })
    await carol.as.mutation(api.modules.posts.posts.publish, { networkId: root, body: "En sourdine" })
    await bob.as.mutation(api.modules.marks.marks.hidePost, { networkId: root, postId: hidden.postId })
    await bob.as.mutation(api.modules.marks.marks.muteAuthor, { networkId: root, targetPersonId: carol.personId })
    const page = (await bob.as.query(api.modules.posts.posts.feed, { networkId: root, paginationOpts: { numItems: 10, cursor: null } })).page
    expect(page.map((item) => item._id)).toEqual([kept.postId])
    expect(page[0]).toMatchObject({
      body: "Gardée",
      audience: "public",
      visibility: "network",
      isMine: false,
      author: { personId: alice.personId, handle: "alice", displayName: "alice", badges: ["community"] },
      reactions: { total: 0, mine: null },
      commentCount: 0,
      shareCount: 0,
      media: [],
      share: null,
      origin: null,
      reason: "public",
      viewer: { bookmarked: false, notifying: false },
    })
  })
})

// ═══════════════════════════════════════════════════════════════
// Publier, éditer, épingler
// ═══════════════════════════════════════════════════════════════

describe("publier", () => {
  it("le rejeu d'une clé d'idempotence ne publie pas deux fois ; rejouée dans un autre réseau, elle est refusée", async () => {
    const t = testConvex()
    const { root, testClosed } = await seed(t)
    const alice = await enter(t, root, "alice", testClosed)
    const first = await alice.as.mutation(api.modules.posts.posts.publish, { networkId: root, body: "Une fois", idempotencyKey: "cle-1" })
    // FD-04 : le rejeu dit aussi l'état de modération COURANT de la publication existante.
    expect(await alice.as.mutation(api.modules.posts.posts.publish, { networkId: root, body: "Une fois", idempotencyKey: "cle-1" })).toEqual({ postId: first.postId, created: false, moderation: "published" })
    expect(await codeOf(alice.as.mutation(api.modules.posts.posts.publish, { networkId: testClosed, body: "Une fois", idempotencyKey: "cle-1" }))).toBe("conflict")
  })

  it("un profil retiré après coup s'affiche neutre", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const alice = await enter(t, root, "alice")
    const bob = await enter(t, root, "bob")
    const { postId } = await alice.as.mutation(api.modules.posts.posts.publish, { networkId: root, body: "Avant le retrait" })
    await alice.as.mutation(api.modules.people.profile.withdrawMyProfile, {})
    expect((await getPost(bob, root, postId)).author).toMatchObject({ handle: null, displayName: null, badges: [] })
  })

  it("portée et pays : jugés contre les portées DU réseau ; la portée locale exige un pays", async () => {
    const t = testConvex()
    const { root, testClosed } = await seed(t)
    const alice = await enter(t, root, "alice", testClosed)
    expect(await ruleOf(alice.as.mutation(api.modules.posts.posts.publish, { networkId: root, body: "Portée", reach: "diaspora" }))).toBe("POST_REACH_INVALID")
    expect(await ruleOf(alice.as.mutation(api.modules.posts.posts.publish, { networkId: testClosed, body: "Portée", reach: "local" }))).toBe("POST_COUNTRY_REQUIRED")
    const { postId } = await alice.as.mutation(api.modules.posts.posts.publish, { networkId: testClosed, body: "Portée", reach: "local", country: "fr" })
    expect(await getPost(alice, testClosed, postId)).toMatchObject({ reach: "local", country: "FR" })
  })

  it("un groupe : forme, appartenance vivante, pas de partage ; ni fil ni mur, lu par un membre seulement", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const alice = await enter(t, root, "alice")
    const bob = await enter(t, root, "bob")
    const carol = await enter(t, root, "carol")
    const groupId = await t.run(async (ctx) => {
      const now = Date.now()
      const id = await ctx.db.insert("thematicGroups", { networkId: root, name: "Cuisine", createdByPersonId: alice.personId, searchText: "Cuisine", idempotencyKey: "g-1", createdAt: now, updatedAt: now })
      for (const person of [alice, bob]) await ctx.db.insert("thematicGroupMembers", { networkId: root, groupId: id, personId: person.personId, role: person === alice ? "owner" : "member", joinedAt: now })
      return id
    })
    expect(await ruleOf(alice.as.mutation(api.modules.posts.posts.publish, { networkId: root, body: "Sans groupe", audience: "group" }))).toBe("POST_GROUP_REQUIRED")
    expect(await ruleOf(alice.as.mutation(api.modules.posts.posts.publish, { networkId: root, body: "Groupe public", groupId }))).toBe("POST_GROUP_FORBIDDEN")
    expect(await codeOf(carol.as.mutation(api.modules.posts.posts.publish, { networkId: root, body: "Intrus", audience: "group", groupId }))).toBe("groupMembershipRequired")
    const open = await alice.as.mutation(api.modules.posts.posts.publish, { networkId: root, body: "Ouverte" })
    expect(await ruleOf(alice.as.mutation(api.modules.posts.posts.publish, { networkId: root, body: "", audience: "group", groupId, sharedPostId: open.postId }))).toBe("POST_SHARE_IN_GROUP")
    const { postId } = await alice.as.mutation(api.modules.posts.posts.publish, { networkId: root, body: "Recette du jour", audience: "group", groupId })
    expect(await getPost(bob, root, postId)).toMatchObject({ groupId, reason: "group" })
    expect(await codeOf(getPost(carol, root, postId))).toBe("notFound")
    expect((await myFeed(bob, root, { scope: "recents" })).items.map((item) => item._id)).toEqual([open.postId])
    expect((await bob.as.query(api.modules.posts.posts.personPosts, { networkId: root, handle: "alice" })).items.map((item) => item._id)).toEqual([open.postId])
    // Quitter le groupe referme aussitôt.
    await t.run(async (ctx) => {
      const row = await ctx.db
        .query("thematicGroupMembers")
        .withIndex("by_group_and_person", (q) => q.eq("groupId", groupId).eq("personId", bob.personId))
        .unique()
      if (row) await ctx.db.patch(row._id, { leftAt: Date.now() })
    })
    expect(await codeOf(getPost(bob, root, postId))).toBe("notFound")
  })

  it("éditer : l'auteur seul, la citation AJOUTÉE prévient, `editedAt` est posé", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const alice = await enter(t, root, "alice")
    const bob = await enter(t, root, "bob")
    const { postId } = await alice.as.mutation(api.modules.posts.posts.publish, { networkId: root, body: "Premier jet" })
    expect(await codeOf(bob.as.mutation(api.modules.posts.posts.edit, { networkId: root, postId, body: "Pirate" }))).toBe("notFound")
    await alice.as.mutation(api.modules.posts.posts.edit, { networkId: root, postId, body: "Merci @bob" })
    expect((await getPost(bob, root, postId)).editedAt).not.toBeNull()
    const bell = await bob.as.query(api.modules.notifications.bell.paginateNotifications, { networkId: root, paginationOpts: { numItems: 10, cursor: null } })
    expect(bell.page.map((row) => row.kind)).toEqual(["mention"])
  })

  it("épingler : rendu en tête du mur, hors de la liste ; une publication de groupe ne s'épingle pas sur un mur", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const alice = await enter(t, root, "alice")
    const bob = await enter(t, root, "bob")
    const older = await alice.as.mutation(api.modules.posts.posts.publish, { networkId: root, body: "À épingler" })
    const newer = await alice.as.mutation(api.modules.posts.posts.publish, { networkId: root, body: "Plus récente" })
    expect(await codeOf(bob.as.mutation(api.modules.posts.posts.pinOnMyWall, { networkId: root, postId: older.postId }))).toBe("notFound")
    await alice.as.mutation(api.modules.posts.posts.pinOnMyWall, { networkId: root, postId: older.postId })
    const wall = await bob.as.query(api.modules.posts.posts.personPosts, { networkId: root, handle: "alice" })
    expect(wall.pinned?._id).toBe(older.postId)
    expect(wall.items.map((item) => item._id)).toEqual([newer.postId])
    await alice.as.mutation(api.modules.posts.posts.unpinMyWall, { networkId: root })
    expect((await bob.as.query(api.modules.posts.posts.personPosts, { networkId: root, handle: "alice" })).pinned).toBeNull()
  })
})

// ═══════════════════════════════════════════════════════════════
// Médias
// ═══════════════════════════════════════════════════════════════

describe("médias", () => {
  it("le fil rend des URLs (ou la retenue), jamais un identifiant de stockage ; une photo sans légende est légitime", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const alice = await enter(t, root, "alice")
    const storageId = await storeBlob(t, PNG, "image/png")
    const { postId } = await alice.as.mutation(api.modules.posts.posts.publish, {
      networkId: root,
      body: "",
      media: [{ storageId, kind: "image", mimeType: "image/png", sizeBytes: PNG.length, altText: "Un logo" }],
    })
    const item = await getPost(alice, root, postId)
    expect(item.media).toEqual([{ url: null, withheld: "fileScanPending", kind: "image", mimeType: "image/png", altText: "Un logo" }])
    expect(JSON.stringify(item)).not.toContain(storageId)
  })

  it("un blob déguisé est refusé sur son poids RÉEL ; une vidéo est seule, cinq images ne passent pas", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const alice = await enter(t, root, "alice")
    const liar = await storeBlob(t, PNG, "image/png")
    expect(await ruleOf(alice.as.mutation(api.modules.posts.posts.publish, { networkId: root, body: "", media: [{ storageId: liar, kind: "image", mimeType: "image/png", sizeBytes: 4 }] }))).toBe(
      "UPLOAD_MISMATCH",
    )
    const video = await storeBlob(t, new Uint8Array([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70]), "video/mp4")
    const image = await storeBlob(t, PNG, "image/png")
    expect(
      await ruleOf(
        alice.as.mutation(api.modules.posts.posts.publish, {
          networkId: root,
          body: "Mélange",
          media: [
            { storageId: video, kind: "video", mimeType: "video/mp4", sizeBytes: 8 },
            { storageId: image, kind: "image", mimeType: "image/png", sizeBytes: PNG.length },
          ],
        }),
      ),
    ).toBe("POST_VIDEO_MUST_BE_ALONE")
    const five = []
    for (let i = 0; i < 5; i += 1) five.push({ storageId: await storeBlob(t, PNG, "image/png"), kind: "image" as const, mimeType: "image/png", sizeBytes: PNG.length })
    expect(await ruleOf(alice.as.mutation(api.modules.posts.posts.publish, { networkId: root, body: "Cinq", media: five }))).toBe("POST_MEDIA_TOO_MANY")
  })
})

// ═══════════════════════════════════════════════════════════════
// SD-03 — vidéos lisibles partout et bornées
// ═══════════════════════════════════════════════════════════════

describe("SD-03 — une vidéo de publication se lit partout et sa durée déclarée est bornée", () => {
  /** L'en-tête d'un MP4 (`ftyp`) : le harnais ne lit pas les octets, seul le poids compte. */
  const MP4_HEAD = new Uint8Array([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70])
  const video = (storageId: Id<"_storage">, extra: { mimeType?: string; durationMs?: number } = {}) => ({
    storageId,
    kind: "video" as const,
    mimeType: extra.mimeType ?? "video/mp4",
    sizeBytes: MP4_HEAD.length,
    ...(extra.durationMs === undefined ? {} : { durationMs: extra.durationMs }),
  })

  it("un .mov NOUVEAU est refusé par une règle traduite, jamais une erreur brute ; le MP4 part avec sa durée", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const alice = await enter(t, root, "alice")
    const mov = await storeBlob(t, MP4_HEAD, "video/quicktime")
    const refusal = engineErrorRule(
      await caught(alice.as.mutation(api.modules.posts.posts.publish, { networkId: root, body: "Clip", media: [video(mov, { mimeType: "video/quicktime" })] })),
    )
    expect(refusal?.rule).toBe("UPLOAD_TYPE_NOT_ALLOWED")
    const mp4 = await storeBlob(t, MP4_HEAD, "video/mp4")
    const { postId } = await alice.as.mutation(api.modules.posts.posts.publish, { networkId: root, body: "Clip", media: [video(mp4, { durationMs: 12_401 })] })
    expect((await getPost(alice, root, postId)).media).toEqual([{ url: null, withheld: "fileScanPending", kind: "video", mimeType: "video/mp4", durationMs: 12_401 }])
    const webm = await storeBlob(t, MP4_HEAD, "video/webm")
    expect((await alice.as.mutation(api.modules.posts.posts.publish, { networkId: root, body: "WebM", media: [video(webm, { mimeType: "video/webm" })] })).created).toBe(true)
  })

  it("la durée DÉCLARÉE au-delà de cinq minutes est refusée ; la borne passe ; une durée absente passe aussi", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const alice = await enter(t, root, "alice")
    const tooLong = await storeBlob(t, MP4_HEAD, "video/mp4")
    const refusal = engineErrorRule(
      await caught(alice.as.mutation(api.modules.posts.posts.publish, { networkId: root, body: "Long", media: [video(tooLong, { durationMs: 5 * 60_000 + 1 })] })),
    )
    expect(refusal).toEqual({ rule: "POST_VIDEO_TOO_LONG", params: { maxMinutes: 5 } })
    // Le refus a défait la transaction : le même dépôt reste neuf et passe à la borne exacte.
    const atBound = await alice.as.mutation(api.modules.posts.posts.publish, { networkId: root, body: "Borne", media: [video(tooLong, { durationMs: 5 * 60_000 })] })
    expect(atBound.created).toBe(true)
    // Un front non mis à jour ne déclare aucune durée : la vidéo passe, bornée par son poids relu.
    const undeclared = await storeBlob(t, MP4_HEAD, "video/mp4")
    const { postId } = await alice.as.mutation(api.modules.posts.posts.publish, { networkId: root, body: "Sans durée", media: [video(undeclared)] })
    expect((await getPost(alice, root, postId)).media[0]).not.toHaveProperty("durationMs")
  })

  it("une publication ANCIENNE en .mov reste servie par sa ligne, et son auteur la modifie encore", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const alice = await enter(t, root, "alice")
    const bob = await enter(t, root, "bob")
    const postId = await t.run(async (ctx) => {
      const at = Date.now()
      const storageId = await ctx.storage.store(new Blob([MP4_HEAD as BlobPart], { type: "video/quicktime" }))
      await ctx.db.insert("fileScans", { storageId, status: "clean", source: "post_media", networkId: root, uploadedByPersonId: alice.personId, attempts: 1, createdAt: at, updatedAt: at })
      return await ctx.db.insert("posts", {
        networkId: root,
        authorPersonId: alice.personId,
        body: "Vidéo d'avant SD-03",
        audience: "public",
        visibility: "network",
        onRoot: true,
        status: "published",
        media: [{ storageId, kind: "video", mimeType: "video/quicktime", sizeBytes: MP4_HEAD.length, durationMs: 9_000 }],
        searchText: "Vidéo d'avant SD-03",
        publishedAt: at,
        createdAt: at,
        updatedAt: at,
      })
    })
    const [served] = (await getPost(bob, root, postId)).media
    expect(served).toMatchObject({ kind: "video", mimeType: "video/quicktime", withheld: null, durationMs: 9_000 })
    expect(served?.url).toBeTruthy()
    await alice.as.mutation(api.modules.posts.posts.edit, { postId, networkId: root, body: "Vidéo d'avant SD-03, légende corrigée" })
    expect((await getPost(bob, root, postId)).media[0]?.mimeType).toBe("video/quicktime")
  })
})

// ═══════════════════════════════════════════════════════════════
// Partage
// ═══════════════════════════════════════════════════════════════

describe("partage", () => {
  it("relit l'original AVEC la garde du lecteur, à chaque lecture ; l'auteur de l'original est prévenu", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const alice = await enter(t, root, "alice")
    const bob = await enter(t, root, "bob")
    const carol = await enter(t, root, "carol")
    const original = await alice.as.mutation(api.modules.posts.posts.publish, { networkId: root, body: "Original" })
    const share = await bob.as.mutation(api.modules.posts.posts.publish, { networkId: root, body: "", sharedPostId: original.postId })
    expect((await getPost(carol, root, share.postId)).share).toMatchObject({ available: true, postId: original.postId, body: "Original" })
    const bell = await alice.as.query(api.modules.notifications.bell.paginateNotifications, { networkId: root, paginationOpts: { numItems: 10, cursor: null } })
    expect(bell.page.map((row) => row.kind)).toEqual(["post_share"])
    await alice.as.mutation(api.modules.posts.posts.remove, { networkId: root, postId: original.postId })
    expect((await getPost(carol, root, share.postId)).share).toEqual({ available: false })
  })

  it("réservée aux connexions : règle explicite ; invisible : refus indistinct ; un partage de partage pointe l'original", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const alice = await enter(t, root, "alice")
    const bob = await enter(t, root, "bob")
    const carol = await enter(t, root, "carol")
    await connect(t, root, alice, bob)
    const closed = await alice.as.mutation(api.modules.posts.posts.publish, { networkId: root, body: "Cercle", audience: "connections" })
    expect(await ruleOf(bob.as.mutation(api.modules.posts.posts.publish, { networkId: root, body: "", sharedPostId: closed.postId }))).toBe("POST_NOT_SHAREABLE")
    expect(await codeOf(carol.as.mutation(api.modules.posts.posts.publish, { networkId: root, body: "", sharedPostId: closed.postId }))).toBe("notFound")
    const open = await alice.as.mutation(api.modules.posts.posts.publish, { networkId: root, body: "Ouvert" })
    const first = await bob.as.mutation(api.modules.posts.posts.publish, { networkId: root, body: "", sharedPostId: open.postId })
    const second = await carol.as.mutation(api.modules.posts.posts.publish, { networkId: root, body: "", sharedPostId: first.postId })
    expect((await getPost(carol, root, second.postId)).share).toMatchObject({ available: true, postId: open.postId })
  })

  it("le décompte de partages ne compte que ce qui circule encore", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const alice = await enter(t, root, "alice")
    const bob = await enter(t, root, "bob")
    const carol = await enter(t, root, "carol")
    const open = await alice.as.mutation(api.modules.posts.posts.publish, { networkId: root, body: "À partager" })
    const byBob = await bob.as.mutation(api.modules.posts.posts.publish, { networkId: root, body: "", sharedPostId: open.postId })
    await carol.as.mutation(api.modules.posts.posts.publish, { networkId: root, body: "", sharedPostId: open.postId })
    expect((await getPost(alice, root, open.postId)).shareCount).toBe(2)
    await bob.as.mutation(api.modules.posts.posts.remove, { networkId: root, postId: byBob.postId })
    await bob.as.mutation(api.modules.posts.posts.remove, { networkId: root, postId: byBob.postId })
    expect((await getPost(alice, root, open.postId)).shareCount).toBe(1)
  })
})

// ═══════════════════════════════════════════════════════════════
// Recherche
// ═══════════════════════════════════════════════════════════════

describe("recherche", () => {
  it("trouve sans accents ; atteint le public d'un inconnu (le fil, non) ; la facette ne remplace JAMAIS la garde", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const alice = await enter(t, root, "alice")
    const bob = await enter(t, root, "bob")
    const open = await alice.as.mutation(api.modules.posts.posts.publish, { networkId: root, body: "Présentation du projet" })
    await alice.as.mutation(api.modules.posts.posts.publish, { networkId: root, body: "Présentation privée", audience: "connections" })
    expect((await bob.as.query(api.modules.posts.posts.search, { networkId: root, query: "presentation" })).items.map((item) => item._id)).toEqual([open.postId])
    expect((await myFeed(bob, root)).items).toEqual([])
  })

  it("une publication retirée ne remonte pour personne ; une requête trop courte ne balaie rien ; un partage sans corps n'indexe rien", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const alice = await enter(t, root, "alice")
    const bob = await enter(t, root, "bob")
    const gone = await alice.as.mutation(api.modules.posts.posts.publish, { networkId: root, body: "Éphémère" })
    await alice.as.mutation(api.modules.posts.posts.remove, { networkId: root, postId: gone.postId })
    expect((await alice.as.query(api.modules.posts.posts.search, { networkId: root, query: "ephemere" })).items).toEqual([])
    expect((await alice.as.query(api.modules.posts.posts.search, { networkId: root, query: "e" })).items).toEqual([])
    const open = await alice.as.mutation(api.modules.posts.posts.publish, { networkId: root, body: "Texte unique zanzibar" })
    await bob.as.mutation(api.modules.posts.posts.publish, { networkId: root, body: "", sharedPostId: open.postId })
    expect((await bob.as.query(api.modules.posts.posts.search, { networkId: root, query: "zanzibar" })).items.map((item) => item._id)).toEqual([open.postId])
  })
})

// ═══════════════════════════════════════════════════════════════
// Citations
// ═══════════════════════════════════════════════════════════════

describe("citations", () => {
  it("citer prévient ; une citation sous une publication qu'on ne voit pas ne sonne pas ; un identifiant inconnu est ignoré", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const alice = await enter(t, root, "alice")
    const bob = await enter(t, root, "bob")
    const carol = await enter(t, root, "carol")
    await alice.as.mutation(api.modules.posts.posts.publish, { networkId: root, body: "Bravo @bob et @fantome" })
    await alice.as.mutation(api.modules.posts.posts.publish, { networkId: root, body: "Entre nous @carol", audience: "connections" })
    const bell = async (person: Person) => (await person.as.query(api.modules.notifications.bell.paginateNotifications, { networkId: root, paginationOpts: { numItems: 10, cursor: null } })).page
    expect((await bell(bob)).map((row) => row.kind)).toEqual(["mention"])
    expect(await bell(carol)).toEqual([])
  })
})

// ═══════════════════════════════════════════════════════════════
// Le mur d'une personne
// ═══════════════════════════════════════════════════════════════

describe("le mur d'une personne", () => {
  it("un inconnu ne voit que le public ; une connexion voit les deux ; un abonné ne voit que le public", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const alice = await enter(t, root, "alice")
    const friend = await enter(t, root, "ami")
    const follower = await enter(t, root, "abonne")
    const stranger = await enter(t, root, "inconnu")
    await connect(t, root, alice, friend)
    await follower.as.mutation(api.modules.graph.follows.follow, { networkId: root, handle: "alice" })
    const open = await alice.as.mutation(api.modules.posts.posts.publish, { networkId: root, body: "Public" })
    const circle = await alice.as.mutation(api.modules.posts.posts.publish, { networkId: root, body: "Cercle", audience: "connections" })
    const wall = async (reader: Person) => (await reader.as.query(api.modules.posts.posts.personPosts, { networkId: root, handle: "alice" })).items.map((item) => item._id)
    expect(await wall(stranger)).toEqual([open.postId])
    expect(await wall(friend)).toEqual([circle.postId, open.postId])
    expect(await wall(follower)).toEqual([open.postId])
  })

  it("l'auteur voit son mur sans ses retirées ; identifiant inconnu et profil retiré rendent LE MÊME mur vide", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const alice = await enter(t, root, "alice")
    const bob = await enter(t, root, "bob")
    const kept = await alice.as.mutation(api.modules.posts.posts.publish, { networkId: root, body: "Gardée" })
    const gone = await alice.as.mutation(api.modules.posts.posts.publish, { networkId: root, body: "Retirée" })
    await alice.as.mutation(api.modules.posts.posts.remove, { networkId: root, postId: gone.postId })
    expect((await alice.as.query(api.modules.posts.posts.personPosts, { networkId: root, handle: "alice" })).items.map((item) => item._id)).toEqual([kept.postId])
    const empty = { items: [], nextCursor: null, pinned: null }
    expect(await bob.as.query(api.modules.posts.posts.personPosts, { networkId: root, handle: "personne" })).toEqual(empty)
    await alice.as.mutation(api.modules.people.profile.withdrawMyProfile, {})
    expect(await bob.as.query(api.modules.posts.posts.personPosts, { networkId: root, handle: "alice" })).toEqual(empty)
  })

  it("continuation : 75 publications atteintes sans doublon ni saut ; l'inconnu parcourt le public jusqu'au bout", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const alice = await enter(t, root, "alice")
    const friend = await enter(t, root, "ami")
    const stranger = await enter(t, root, "inconnu")
    await connect(t, root, alice, friend)
    const base = 1_800_000_000_000
    const rows: { id: Id<"posts">; index: number; publishedAt: number; open: boolean }[] = []
    for (let i = 0; i < 75; i += 1) {
      const publishedAt = base - Math.floor(i / 3)
      const open = i % 2 === 0
      rows.push({ id: await insertPost(t, { networkId: root, author: alice, audience: open ? "public" : "connections", onRoot: true, publishedAt }), index: i, publishedAt, open })
    }
    const order = [...rows].sort((a, b) => b.publishedAt - a.publishedAt || b.index - a.index)
    const walk = async (reader: Person, limit: number) => {
      const ids: string[] = []
      let cursor: Cursor | undefined
      for (let turn = 0; turn < 25; turn += 1) {
        const page = await reader.as.query(api.modules.posts.posts.personPosts, { networkId: root, handle: "alice", limit, ...(cursor ? { cursor } : {}) })
        ids.push(...page.items.map((item) => item._id))
        if (page.nextCursor === null) return ids
        cursor = page.nextCursor
      }
      throw new Error("le mur boucle")
    }
    expect(await walk(friend, 20)).toEqual(order.map((row) => row.id))
    expect(await walk(stranger, 7)).toEqual(order.filter((row) => row.open).map((row) => row.id))
  })
})
