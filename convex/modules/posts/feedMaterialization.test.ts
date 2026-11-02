// @vitest-environment edge-runtime
/** PA10 : scénarios écrits sans exécution ; pas de mesure p95 ni de preuve de production. */
import { boundedFeedSourceIds, compareFeedPosts, MATERIALIZED_FEED_HISTORY_MS, type PersonalFeedCursor } from "@antsia/social-domain/feedScale"
import { makeFunctionReference } from "convex/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { api, internal } from "../../_generated/api"
import type { Doc, Id } from "../../_generated/dataModel"
import { SEED_CONFIRMATION } from "../../seeds/foundations"
import { testConvex } from "../../test.setup"
import { refreshReaderFeed, schedulePostFeed } from "./feedMaterialization"
import { exactFeedHidden, exactFeedMuted, liveFeedReason } from "./feedPolicy"
import { materializedWindow } from "./feedRead"
import { withdrawPostRootVisibility } from "./postWrite"

type T = ReturnType<typeof testConvex>
const T0 = Date.UTC(2026, 9, 18, 12)
const PREPARE = makeFunctionReference<"mutation", { networkId: Id<"networks"> }, null>("modules/posts/feedMaterialization:prepareMyFeed")
const BACKFILL = makeFunctionReference<"mutation", { cursorId: Id<"feedCursors">; generation: number; step: number }, null>("modules/posts/feedMaterialization:backfill")
const FANOUT = makeFunctionReference<"mutation", { jobId: Id<"feedFanoutJobs">; generation: number; step: number }, null>("modules/posts/feedMaterialization:fanout")
const RETENTION = makeFunctionReference<"mutation", Record<string, never>, null>("modules/posts/feedMaterialization:retention")
const MAINTAIN = makeFunctionReference<"mutation", Record<string, never>, null>("modules/posts/feedMaterialization:maintain")

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(T0); vi.stubEnv("CONVEX_CLOUD_URL", "http://127.0.0.1:3210") })
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs() })

async function member(t: T, networkId: Id<"networks">, name: string): Promise<Id<"persons">> {
  return await t.run(async ctx => {
    const personId = await ctx.db.insert("persons", { authUserId: `fixture-${name}`, handle: name, displayName: "Jean-Rémy NDONG MBA", publishedAt: T0, createdAt: T0, updatedAt: T0 })
    await ctx.db.insert("networkMemberships", { networkId, personId, status: "declaree", role: "member", joinedAt: T0, statusChangedAt: T0 })
    return personId
  })
}
async function fixture(sourceCount = 1) {
  const t = testConvex()
  const { root, testClosed } = await t.mutation(internal.seeds.foundations.run, { confirmNonProduction: SEED_CONFIRMATION })
  const as = t.withIdentity({ subject: "reader-auth" })
  const reader = await as.mutation(api.modules.people.persons.ensureMyPerson, {})
  await as.mutation(api.modules.people.consents.recordConsent, { purpose: "social_profile", origin: "onboarding" })
  await as.mutation(api.modules.people.profile.publishMyProfile, { handle: "lecteur.pa10", displayName: "Jean-Rémy NDONG MBA" })
  await as.mutation(api.modules.people.memberships.joinNetwork, { networkId: root })
  const sources: Id<"persons">[] = []
  for (let n = 0; n < sourceCount; n++) {
    const personId = await member(t, root, `auteur${String(n).padStart(4, "0")}`)
    sources.push(personId)
    await t.run(ctx => ctx.db.insert("follows", { networkId: root, followerPersonId: reader, targetPersonId: personId, createdAt: T0 }))
  }
  return { t, root, testClosed, reader, as, sources }
}
async function post(t: T, networkId: Id<"networks">, authorPersonId: Id<"persons">, patch: Partial<Omit<Doc<"posts">, "_id" | "_creationTime">> = {}) {
  return await t.run(ctx => ctx.db.insert("posts", { networkId, authorPersonId, body: "Publication de recette", audience: "public", visibility: "root", onRoot: true, status: "published", searchText: "publication", publishedAt: T0 - 1000, createdAt: T0 - 1000, updatedAt: T0 - 1000, ...patch }))
}
async function state(t: T, networkId: Id<"networks">, personId: Id<"persons">) {
  return await t.run(ctx => ctx.db.query("feedCursors").withIndex("by_reader", q => q.eq("networkId", networkId).eq("personId", personId).eq("scope", "pour_vous")).unique())
}
async function finishReader(t: T, networkId: Id<"networks">, personId: Id<"persons">) {
  for (let n = 0; n < 5000; n++) {
    const current = await state(t, networkId, personId)
    if (!current) throw new Error("Préparation absente")
    if (current.status === "ready") return current
    await t.mutation(BACKFILL, { cursorId: current._id, generation: current.generation, step: current.step })
  }
  throw new Error("Rattrapage de fixture non terminé dans sa borne")
}
async function finishPost(t: T, postId: Id<"posts">, max = 1000) {
  for (let n = 0; n < max; n++) {
    const jobs = await t.run(ctx => ctx.db.query("feedFanoutJobs").withIndex("by_post", q => q.eq("postId", postId)).take(3))
    const current = jobs.find(row => row.status === "pending")
    if (!current) return
    await t.mutation(FANOUT, { jobId: current._id, generation: current.generation, step: current.step })
  }
  throw new Error("Diffusion de fixture non terminée dans sa borne")
}

describe("PA10 — historique, préparation et curseurs d'origine", () => {
  it("rattrape la source exclue du palier 200, puis expose sa fenêtre de trente jours", async () => {
    const f = await fixture(201)
    const legacy = boundedFeedSourceIds({ selfId: f.reader, connections: [], follows: f.sources })
    const omitted = f.sources.find(id => !legacy.includes(id))
    if (!omitted) throw new Error("La fixture ne dépasse pas le seuil")
    const recent = await post(f.t, f.root, omitted)
    const old = await post(f.t, f.root, omitted, { publishedAt: T0 - MATERIALIZED_FEED_HISTORY_MS - 1 })
    const before = await f.as.query(api.modules.posts.posts.myFeed, { networkId: f.root })
    expect(before).toMatchObject({ items: [], lacunar: true, preparing: true })
    expect(before.preparationKey).toMatch(/^[a-f0-9]{64}$/u)
    expect(before).not.toHaveProperty("accessVersion")
    await f.as.mutation(PREPARE, { networkId: f.root })
    await finishReader(f.t, f.root, f.reader)
    const after = await f.as.query(api.modules.posts.posts.myFeed, { networkId: f.root })
    expect(after.items.map(row => row._id)).toEqual([recent])
    expect(after.materializedSince).toBe(T0 - MATERIALIZED_FEED_HISTORY_MS)
    expect(after.lacunar).toBe(true) // L'antériorité est explicitement hors fenêtre.
    const entries = await f.t.run(ctx => ctx.db.query("feedEntries").withIndex("by_person", q => q.eq("personId", f.reader)).take(10))
    expect(entries.map(row => row.postId)).not.toContain(old)
    for (const row of entries) {
      expect(row.expiresAt).toBe(row.publishedAt + MATERIALIZED_FEED_HISTORY_MS)
      expect(row).not.toHaveProperty("body")
      expect(row).not.toHaveProperty("authorPersonId")
    }
  }, 120_000)

  it("garde la stratégie legacy d'un ancien parcours et refuse une génération remplacée", async () => {
    const f = await fixture(201), author = f.sources[0]!
    const first = await post(f.t, f.root, author, { publishedAt: T0 - 1 })
    await post(f.t, f.root, author, { publishedAt: T0 - 2 })
    await f.as.mutation(PREPARE, { networkId: f.root })
    const initial = await state(f.t, f.root, f.reader)
    if (!initial) throw new Error("Génération absente")
    await finishReader(f.t, f.root, f.reader)
    const legacy = await f.as.query(api.modules.posts.posts.myFeed, { networkId: f.root, cursor: { publishedAt: T0 - 1, postId: first }, limit: 1 })
    expect(legacy.nextCursor?.strategy).toBeUndefined()
    const materialized = await f.as.query(api.modules.posts.posts.myFeed, { networkId: f.root, limit: 1 })
    expect(materialized.nextCursor?.strategy).toBe("materialized")
    await f.t.run(ctx => refreshReaderFeed(ctx, f.root, f.reader))
    const current = await state(f.t, f.root, f.reader)
    await f.t.mutation(BACKFILL, { cursorId: initial._id, generation: initial.generation, step: initial.step })
    expect(await state(f.t, f.root, f.reader)).toEqual(current)
    if (!materialized.nextCursor) throw new Error("Curseur absent")
    expect(await f.as.query(api.modules.posts.posts.myFeed, { networkId: f.root, cursor: materialized.nextCursor })).toMatchObject({ items: [], nextCursor: null, lacunar: true, preparing: true })
  }, 120_000)

  it("ordonne les ex æquo par création du post, même après suppression de la frontière", async () => {
    const f = await fixture(), author = f.sources[0]!, ids: Id<"posts">[] = []
    for (let n = 0; n < 6; n++) { vi.setSystemTime(T0 + n); ids.push(await post(f.t, f.root, author)) }
    await f.as.mutation(PREPARE, { networkId: f.root })
    const ready = await finishReader(f.t, f.root, f.reader)
    const docs = await f.t.run(async ctx => Promise.all(ids.map(id => ctx.db.get(id))))
    const expected = docs.filter((row): row is Doc<"posts"> => row !== null).sort(compareFeedPosts)
    const first = await f.t.run(async ctx => materializedWindow(ctx, { network: (await ctx.db.get(f.root))!, personId: f.reader }, ready))
    expect(first.rows.map(row => row._id)).toEqual(expected.map(row => row._id))
    const boundary = expected[1]!
    const cursor: PersonalFeedCursor<Id<"posts">> = { publishedAt: boundary.publishedAt, postId: boundary._id, postCreationTime: boundary._creationTime, strategy: "materialized", generation: ready.generation, windowStart: ready.windowStart }
    await f.t.run(ctx => ctx.db.delete(boundary._id))
    const next = await f.t.run(async ctx => materializedWindow(ctx, { network: (await ctx.db.get(f.root))!, personId: f.reader }, ready, cursor))
    expect(next.rows.map(row => row._id)).toEqual(expected.slice(2).map(row => row._id))
  })

  it("réarme le ready après suspension échue, puis après vingt-quatre heures", async () => {
    const f = await fixture(201), author = f.sources[0]!
    await f.as.mutation(PREPARE, { networkId: f.root })
    const initial = await finishReader(f.t, f.root, f.reader)
    await f.t.run(async ctx => {
      const membership = await ctx.db.query("networkMemberships").withIndex("by_network_and_person", q => q.eq("networkId", f.root).eq("personId", f.reader)).unique()
      if (!membership) throw new Error("Adhésion absente")
      await ctx.db.patch(membership._id, { status: "suspendue", statusBeforeSuspension: "declaree", suspendedUntil: T0 + 120_000, statusChangedAt: T0 + 1 })
    })
    vi.setSystemTime(T0 + 60_000)
    const missed = await post(f.t, f.root, author, { publishedAt: T0 + 60_000 })
    await f.t.run(ctx => schedulePostFeed(ctx, missed)); await finishPost(f.t, missed)
    expect(await f.t.run(ctx => ctx.db.query("feedEntries").withIndex("by_reader_post", q => q.eq("networkId", f.root).eq("personId", f.reader).eq("scope", "pour_vous").eq("postId", missed)).unique())).toBeNull()
    vi.setSystemTime(T0 + 120_001)
    expect(await f.as.query(api.modules.posts.posts.myFeed, { networkId: f.root })).toMatchObject({ preparing: true, lacunar: true })
    await f.as.mutation(PREPARE, { networkId: f.root })
    const restored = await finishReader(f.t, f.root, f.reader)
    expect(restored.generation).toBeGreaterThan(initial.generation)
    expect((await f.as.query(api.modules.posts.posts.myFeed, { networkId: f.root })).items.map(row => row._id)).toContain(missed)
    vi.setSystemTime(T0 + 120_001 + 24 * 60 * 60_000 + 1)
    expect(await f.as.query(api.modules.posts.posts.myFeed, { networkId: f.root })).toMatchObject({ preparing: true, lacunar: true })
    await f.as.mutation(PREPARE, { networkId: f.root })
    expect((await state(f.t, f.root, f.reader))?.generation).toBeGreaterThan(restored.generation)
  }, 120_000)
})

describe("PA10 — diffusion bornée, contexte et révocations vivantes", () => {
  it("publier par la porte commune crée des jobs de références sans corps", async () => {
    const f = await fixture(0)
    const result = await f.as.mutation(api.modules.posts.posts.publish, { networkId: f.root, body: "Publication choisie", audience: "public" })
    const jobs = await f.t.run(ctx => ctx.db.query("feedFanoutJobs").withIndex("by_post", q => q.eq("postId", result.postId)).take(3))
    expect(jobs).toHaveLength(1)
    expect(JSON.stringify(jobs)).not.toContain("Publication choisie")
    await finishPost(f.t, result.postId)
    const before = await f.t.run(ctx => ctx.db.get(result.postId))
    await f.t.run(ctx => schedulePostFeed(ctx, result.postId))
    await finishPost(f.t, result.postId)
    expect(await f.t.run(ctx => ctx.db.get(result.postId))).toEqual(before)
    expect(await f.t.run(ctx => ctx.db.query("feedEntries").withIndex("by_post", q => q.eq("postId", result.postId)).take(10))).toHaveLength(1)
  })

  it("alimente origine et racine selon leurs liens propres ; retirer root conserve l'origine", async () => {
    const f = await fixture(), author = f.sources[0]!
    await f.t.run(async ctx => {
      for (const personId of [f.reader, author]) await ctx.db.insert("networkMemberships", { networkId: f.testClosed, personId, status: "declaree", role: "member", joinedAt: T0, statusChangedAt: T0 })
      await ctx.db.insert("follows", { networkId: f.testClosed, followerPersonId: f.reader, targetPersonId: author, createdAt: T0 })
    })
    const postId = await post(f.t, f.testClosed, author)
    await f.t.run(ctx => schedulePostFeed(ctx, postId)); await finishPost(f.t, postId)
    const entries = await f.t.run(ctx => ctx.db.query("feedEntries").withIndex("by_person", q => q.eq("personId", f.reader)).take(10))
    expect(new Set(entries.map(row => row.networkId))).toEqual(new Set([f.root, f.testClosed]))
    await f.t.run(async ctx => withdrawPostRootVisibility(ctx, (await ctx.db.get(postId))!, (await ctx.db.get(f.testClosed))!))
    await f.t.finishAllScheduledFunctions(vi.runAllTimers)
    const remaining = await f.t.run(ctx => ctx.db.query("feedEntries").withIndex("by_person", q => q.eq("personId", f.reader)).take(10))
    expect(remaining.map(row => row.networkId)).toEqual([f.testClosed])
  })

  it("les audiences sont rejugées après blocage, révocation du follow et suppression de personne", async () => {
    const f = await fixture(), author = f.sources[0]!, postId = await post(f.t, f.root, author)
    await f.t.run(ctx => schedulePostFeed(ctx, postId)); await finishPost(f.t, postId)
    const readReason = () => f.t.run(async ctx => liveFeedReason(ctx, { network: (await ctx.db.get(f.root))!, personId: f.reader }, (await ctx.db.get(postId))!, "pour_vous"))
    expect(await readReason()).toBe("follow")
    await f.t.run(ctx => ctx.db.insert("personBlocks", { networkId: f.root, blockerPersonId: f.reader, targetPersonId: author, createdAt: T0, updatedAt: T0 }))
    expect(await readReason()).toBeNull()
    await f.t.run(async ctx => {
      const block = await ctx.db.query("personBlocks").withIndex("by_blocker_target", q => q.eq("blockerPersonId", f.reader).eq("targetPersonId", author)).unique()
      if (block) await ctx.db.delete(block._id)
      const follow = await ctx.db.query("follows").withIndex("by_network_follower_target", q => q.eq("networkId", f.root).eq("followerPersonId", f.reader).eq("targetPersonId", author)).unique()
      if (follow) await ctx.db.delete(follow._id)
    })
    expect(await readReason()).toBeNull()
    await f.t.run(async ctx => { await ctx.db.patch(author, { deletionRequestedAt: T0 }); await schedulePostFeed(ctx, postId) })
    await finishPost(f.t, postId)
    expect(await readReason()).toBeNull()
  })

  it("retrouve un follow au-delà de cinq cents sources et les marques au-delà des ensembles bornés", async () => {
    const f = await fixture(501)
    const first500 = await f.t.run(ctx => ctx.db.query("follows").withIndex("by_network_follower_createdAt", q => q.eq("networkId", f.root).eq("followerPersonId", f.reader)).order("desc").take(500))
    const retained = new Set(first500.map(row => row.targetPersonId))
    const omitted = f.sources.find(id => !retained.has(id))
    if (!omitted) throw new Error("La fixture doit dépasser l'ensemble borné")
    const postId = await post(f.t, f.root, omitted)
    expect(await f.t.run(async ctx => liveFeedReason(ctx, { network: (await ctx.db.get(f.root))!, personId: f.reader }, (await ctx.db.get(postId))!, "pour_vous"))).toBe("follow")
    await f.t.run(async ctx => {
      await ctx.db.insert("postMarks", { networkId: f.root, personId: f.reader, postId, kind: "hidden", createdAt: T0 - 1 })
      await ctx.db.insert("mutes", { networkId: f.root, personId: f.reader, mutedPersonId: omitted, createdAt: T0 - 1 })
    })
    for (let offset = 0; offset < 500; offset += 50) await f.t.run(async ctx => {
      for (const sourceId of f.sources.slice(offset, offset + 50)) {
        if (sourceId !== omitted) await ctx.db.insert("mutes", { networkId: f.root, personId: f.reader, mutedPersonId: sourceId, createdAt: T0 })
        const hiddenId = await ctx.db.insert("posts", { networkId: f.root, authorPersonId: sourceId, body: "Publication masquée", audience: "public", visibility: "network", onRoot: true, status: "published", searchText: "masquee", publishedAt: T0 - 2000, createdAt: T0, updatedAt: T0 })
        await ctx.db.insert("postMarks", { networkId: f.root, personId: f.reader, postId: hiddenId, kind: "hidden", createdAt: T0 })
      }
    })
    expect(await f.t.run(ctx => exactFeedHidden(ctx, f.root, f.reader, postId))).toBe(true)
    expect(await f.t.run(ctx => exactFeedMuted(ctx, f.root, f.reader, omitted))).toBe(true)
    expect((await f.as.query(api.modules.posts.posts.myFeed, { networkId: f.root, scope: "recents" })).items.map(row => row._id)).not.toContain(postId)
  }, 120_000)

  it("la page reste distincte du signataire bloqué et un désabonnement ferme son admission", async () => {
    const f = await fixture(), author = f.sources[0]!
    const pageId = await f.t.run(async ctx => {
      const id = await ctx.db.insert("pages", { networkId: f.root, handle: "page.pa10", name: "Page de recette", ownerKind: "community", trust: "community", trustRank: 0, visibility: "root", onRoot: true, status: "active", searchText: "page recette", createdAt: T0, updatedAt: T0 })
      await ctx.db.insert("pageFollows", { networkId: f.root, pageId: id, personId: f.reader, createdAt: T0 })
      await ctx.db.insert("personBlocks", { networkId: f.root, blockerPersonId: f.reader, targetPersonId: author, createdAt: T0, updatedAt: T0 })
      return id
    })
    const postId = await post(f.t, f.root, author, { pageId, audience: "followers" })
    await f.t.run(ctx => schedulePostFeed(ctx, postId)); await finishPost(f.t, postId)
    const reason = () => f.t.run(async ctx => liveFeedReason(ctx, { network: (await ctx.db.get(f.root))!, personId: f.reader }, (await ctx.db.get(postId))!, "pour_vous"))
    expect(await reason()).toBe("page")
    await f.t.run(async ctx => {
      const row = await ctx.db.query("pageFollows").withIndex("by_page_person", q => q.eq("pageId", pageId).eq("personId", f.reader)).unique()
      if (row) await ctx.db.delete(row._id)
    })
    expect(await reason()).toBeNull()
  })

  it("un backlog de diffusion est annoncé même si la génération du lecteur est prête", async () => {
    const f = await fixture(), author = f.sources[0]!, postId = await post(f.t, f.root, author)
    await f.as.mutation(PREPARE, { networkId: f.root }); await finishReader(f.t, f.root, f.reader)
    await f.t.run(ctx => schedulePostFeed(ctx, postId))
    expect((await f.as.query(api.modules.posts.posts.myFeed, { networkId: f.root })).lacunar).toBe(true)
    await finishPost(f.t, postId)
  })

  it("un lecteur en effacement bloque la reprise sans recréer de ligne", async () => {
    const f = await fixture(), author = f.sources[0]!, postId = await post(f.t, f.root, author)
    await f.as.mutation(PREPARE, { networkId: f.root })
    const current = await state(f.t, f.root, f.reader)
    if (!current) throw new Error("Génération absente")
    await f.t.run(ctx => ctx.db.patch(f.reader, { deletionRequestedAt: T0 }))
    await f.t.mutation(BACKFILL, { cursorId: current._id, generation: current.generation, step: current.step })
    expect(await state(f.t, f.root, f.reader)).toEqual(current)
    await f.t.run(ctx => schedulePostFeed(ctx, postId)); await finishPost(f.t, postId)
    expect(await f.t.run(ctx => ctx.db.query("feedEntries").withIndex("by_person", q => q.eq("personId", f.reader)).take(10))).toEqual([])
    await f.t.run(ctx => ctx.db.delete(current._id))
    await f.t.mutation(BACKFILL, { cursorId: current._id, generation: current.generation, step: current.step })
    expect(await state(f.t, f.root, f.reader)).toBeNull()
  })

  it("reprend un travail perdu à son étape persistée et purge au plus cent lignes par transaction", async () => {
    const f = await fixture(), author = f.sources[0]!
    for (let n = 0; n < 105; n++) {
      const postId = await post(f.t, f.root, author, { publishedAt: T0 - MATERIALIZED_FEED_HISTORY_MS - 1 })
      await f.t.run(ctx => ctx.db.insert("feedEntries", { networkId: f.root, personId: f.reader, scope: "pour_vous", postId, publishedAt: T0 - MATERIALIZED_FEED_HISTORY_MS - 1, postCreationTime: T0, expiresAt: T0 - 1, createdAt: T0 }))
    }
    await f.t.mutation(RETENTION, {})
    expect(await f.t.run(ctx => ctx.db.query("feedEntries").withIndex("by_person", q => q.eq("personId", f.reader)).take(200))).toHaveLength(55)
    await f.as.mutation(PREPARE, { networkId: f.root })
    vi.setSystemTime(T0 + 6 * 60_000)
    await f.t.mutation(MAINTAIN, {})
    await f.t.finishAllScheduledFunctions(vi.runAllTimers)
    expect((await state(f.t, f.root, f.reader))?.status).toBe("ready")
    expect(await f.t.run(ctx => ctx.db.query("feedEntries").withIndex("by_person", q => q.eq("personId", f.reader)).take(200))).toEqual([])
  })

  // Délai explicite pour CE seul test : convex-test résout chaque lecture indexée en parcourant tous
  // les documents de la base simulée (`_iterateDocs`), et la diffusion en fait une dizaine par
  // destinataire sur plus de 15 000 documents. Mesuré le 19/10 : 168 s au verify n° 1, 183 à 196 s
  // seul sur le Mac partagé, dont 0,2 s d'amorce (rien à gagner sur la fixture). Les 5 000 abonnés et
  // les lots de vingt sont la preuve PA10 (docs/20) : ni réduits ni contournés. Durée du harnais, pas
  // une mesure de charge (campagne R8). Le 24/10, sur le Mac partagé fortement sollicité,
  // le harnais a dépassé 360 s (retour après 450 s) : marge portée à dix minutes sans
  // réduire les destinataires, les lots ni les assertions. Ce délai n'est pas un SLO produit.
  it("diffuse cinq mille abonnés en lots de vingt sans modifier le post ni dupliquer les entrées", async () => {
    const f = await fixture(0), author = await member(f.t, f.root, "source5000")
    for (let offset = 0; offset < 5000; offset += 50) {
      await f.t.run(async ctx => {
        for (let n = offset; n < offset + 50; n++) {
          const personId = await ctx.db.insert("persons", { authUserId: `charge-${n}`, createdAt: T0, updatedAt: T0 })
          await ctx.db.insert("networkMemberships", { networkId: f.root, personId, status: "declaree", role: "member", joinedAt: T0, statusChangedAt: T0 })
          await ctx.db.insert("follows", { networkId: f.root, followerPersonId: personId, targetPersonId: author, createdAt: T0 })
        }
      })
    }
    const postId = await post(f.t, f.root, author)
    const before = await f.t.run(ctx => ctx.db.get(postId))
    await f.t.run(ctx => schedulePostFeed(ctx, postId)); await finishPost(f.t, postId)
    const entries = await f.t.run(ctx => ctx.db.query("feedEntries").withIndex("by_post", q => q.eq("postId", postId)).take(5002))
    expect(entries).toHaveLength(5001) // Auteur + abonnés.
    expect(new Set(entries.map(row => row.personId)).size).toBe(5001)
    expect(await f.t.run(ctx => ctx.db.get(postId))).toEqual(before)
  }, 600_000)
})
