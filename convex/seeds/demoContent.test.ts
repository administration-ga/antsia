// @vitest-environment edge-runtime
/** La graine anime des profils existants ; les fixtures d'authentification restent dans les tests. */
import { readFileSync } from "node:fs"

import { engineErrorCode } from "@antsia/social-contracts/errors"
import { normalizeFamilyName, normalizeGivenNames } from "@antsia/social-domain/civilName"
import { CONSENT_TEXT_VERSIONS } from "@antsia/social-domain/consent"
import { pageTrustRank } from "@antsia/social-domain/pages"
import { STORY_TTL_MS } from "@antsia/social-domain/stories"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { api, components, internal } from "../_generated/api"
import type { Doc, Id } from "../_generated/dataModel"
import { servableUrl } from "../modules/files/storageGuard"
import { followerCounts } from "../modules/graph/follows"
import { pageSearchText } from "../modules/pages/access"
import { applyReactionDelta, countComments, countPageFollowers, countPagePosts, readReactionCounts, unrecordPageFollower } from "../modules/posts/counters"
import { markCommentRemoved, markPostRemoved } from "../modules/posts/contentRemoval"
import { hasPublicConsent, publicStorefrontPage } from "../modules/shops/access"
import { testConvex } from "../test.setup"
import { DEMO_CONTENT_PAGES, DEMO_CONTENT_PERSONAS, DEMO_CONTENT_POSTS, DEMO_FIGURANT_POSTS, DEMO_FIGURANT_TIES, type DemoMediaTarget } from "./demoContent"
import { DEMO_CONTENT_CONFIRMATION } from "./demoContentConfig"
import { DEMO_FIGURANTS, demoFigurantEmailOf } from "./demoFigurants"
import { DEMO_DIRECT_CONVERSATIONS, DEMO_SHOP_CONVERSATIONS } from "./demoConversations"
import { readPersonalUnreadTotal } from "../modules/messaging/threads"
import { demoMediaAsset } from "./demoMediaManifest"
import { SEED_CONFIRMATION } from "./foundations"

type T = ReturnType<typeof testConvex>
const args = { confirmNonProduction: DEMO_CONTENT_CONFIRMATION }
const T0 = Date.UTC(2026, 9, 20, 10, 0)

beforeEach(() => {
  vi.stubEnv("ANTSIA_DEV_TOOLS", "true")
  vi.stubEnv("CONVEX_CLOUD_URL", "http://127.0.0.1:3210")
  vi.useFakeTimers()
  vi.setSystemTime(T0)
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

function authId(value: unknown): string {
  if (value && typeof value === "object" && "_id" in value && typeof value._id === "string") return value._id
  throw new Error("Utilisateur de fixture absent")
}

async function errorCode(promise: Promise<unknown>) {
  try { await promise; return null } catch (error) { return engineErrorCode(error) }
}

/** Profils DÉJÀ publiés et adresses vérifiées dans le vrai composant Better Auth. */
async function fixture({ badEmail = false, unverified = false }: { badEmail?: boolean; unverified?: boolean } = {}) {
  const t = testConvex({ automaticSessions: false })
  const { root } = await t.mutation(internal.seeds.foundations.run, { confirmNonProduction: SEED_CONFIRMATION })
  const people = new Map<string, Id<"persons">>()
  const users = new Map<string, string>()
  for (const spec of DEMO_CONTENT_PERSONAS) {
    const email = badEmail && spec.actor === "membre" ? "personne@example.test" : `${spec.actor}@demo.antsia.test`
    const userId = authId(await t.mutation(components.betterAuth.adapter.create, { input: { model: "user", data: { name: "Fixture", email, emailVerified: !(unverified && spec.actor === "membre"), createdAt: T0, updatedAt: T0 } } }))
    const personId = await t.run(async ctx => {
      const personId = await ctx.db.insert("persons", { authUserId: userId, handle: spec.handle, displayName: `${normalizeGivenNames(spec.givenNames)} ${normalizeFamilyName(spec.familyName)}`, headline: spec.originalHeadline, publishedAt: T0, createdAt: T0, updatedAt: T0 })
      await ctx.db.insert("consents", { personId, purpose: "social_profile", textVersion: CONSENT_TEXT_VERSIONS.social_profile, origin: "onboarding", grantedAt: T0 })
      await ctx.db.insert("networkMemberships", { networkId: root, personId, status: "declaree", role: "member", joinedAt: T0, statusChangedAt: T0 })
      return personId
    })
    people.set(spec.actor, personId)
    users.set(spec.actor, userId)
  }
  const newcomerUserId = authId(await t.mutation(components.betterAuth.adapter.create, { input: { model: "user", data: { name: "ANTSIA", email: "nouveau@demo.antsia.test", emailVerified: true, createdAt: T0, updatedAt: T0 } } }))
  const newcomer = await t.run(async ctx => await ctx.db.insert("persons", { authUserId: newcomerUserId, locale: "fr", createdAt: T0, updatedAt: T0 }))
  await t.run(async ctx => {
    for (const spec of DEMO_CONTENT_PAGES.filter(page => !page.create)) {
      const personId = people.get(spec.actor)
      if (!personId) throw new Error("Propriétaire de fixture absent")
      const pageId = await ctx.db.insert("pages", { networkId: root, handle: spec.handle, name: spec.name, description: spec.description, ownerKind: spec.ownerKind, trust: spec.trust, trustRank: pageTrustRank(spec.trust), visibility: "network", onRoot: true, status: "active", country: "GA", createdByPersonId: personId, searchText: pageSearchText(spec), createdAt: T0, updatedAt: T0 })
      await ctx.db.insert("pageSignatories", { networkId: root, pageId, personId, role: "admin", acceptedAt: T0, createdAt: T0, updatedAt: T0 })
      if (spec.model) await ctx.db.insert("shops", { networkId: root, preparedByPersonId: personId, pageId, model: spec.model, storefront: "published", visibility: "network", publishedAt: T0, createdAt: T0, updatedAt: T0 })
    }
    const personId = people.get("commercant")
    if (!personId) throw new Error("Commerçant de fixture absent")
    await ctx.db.insert("shopNetworkPolicies", { networkId: root, storefront: "review", updatedByPersonId: personId, updatedAt: T0 })
  })
  return { t, root, people, users, newcomer }
}

function personOf(people: Map<string, Id<"persons">>, actor: string): Id<"persons"> {
  const person = people.get(actor)
  if (!person) throw new Error("Acteur de fixture absent")
  return person
}

async function postsOf(t: T, root: Id<"networks">): Promise<Doc<"posts">[]> {
  return await t.run(async ctx => await ctx.db.query("posts").withIndex("by_network_status_publishedAt", q => q.eq("networkId", root).eq("status", "published")).take(100))
}

function assetBytes(asset: string): Uint8Array<ArrayBuffer> {
  const spec = demoMediaAsset(asset)
  if (!spec) throw new Error("Asset de fixture inconnu")
  return Uint8Array.from(readFileSync(new URL(`../../apps/antsia_ga/public/demo-media/${spec.collection}/${spec.filename}`, import.meta.url)))
}

async function storeImage(t: T, asset: string): Promise<Id<"_storage">> {
  const spec = demoMediaAsset(asset)
  if (!spec) throw new Error("Asset de fixture inconnu")
  const bytes = assetBytes(asset)
  return await t.run(async ctx => {
    const storageId = await ctx.storage.store(new Blob([bytes], { type: spec.mimeType }))
    // convex-test omet contentType à storage.store ; seule la métadonnée MIME est complétée.
    await (ctx.db as unknown as { patch: (table: "_storage", id: Id<"_storage">, value: { contentType: string }) => Promise<void> }).patch("_storage", storageId, { contentType: spec.mimeType })
    return storageId
  })
}

function targetOf(targets: DemoMediaTarget[], kind: DemoMediaTarget["kind"], ownerHandle: string): DemoMediaTarget {
  const target = targets.find(item => item.kind === kind && item.ownerHandle === ownerHandle)
  if (!target) throw new Error("Cible de fixture absente")
  return target
}

describe("animation des seuls comptes de démonstration", () => {
  it("refuse toute autre cible cloud et toute confirmation différente, même avec les flags de graine", async () => {
    const { t } = await fixture()
    vi.stubEnv("CONVEX_CLOUD_URL", "https://production-exemple.convex.cloud")
    vi.stubEnv("ANTSIA_DEMO_DEPLOYMENT", "production-exemple")
    await expect(t.mutation(internal.seeds.demoContent.run, args)).rejects.toThrow("Animation refusée")
    await expect(t.query(internal.seeds.demoContent.mediaTargets, args)).rejects.toThrow("Animation refusée")
    vi.stubEnv("CONVEX_CLOUD_URL", "http://127.0.0.1:3210")
    await expect(t.mutation(internal.seeds.demoContent.run, { confirmNonProduction: SEED_CONFIRMATION })).rejects.toThrow("Animation refusée")
    expect(await t.run(async ctx => await ctx.db.query("posts").take(1))).toEqual([])
  })

  it.each([{ badEmail: true }, { unverified: true }])("refuse un compte non réservé ou non vérifié avant toute écriture : %j", async options => {
    const { t } = await fixture(options)
    expect(await errorCode(t.mutation(internal.seeds.demoContent.run, args))).toBe("policyRefused")
    expect(await t.run(async ctx => await ctx.db.query("posts").take(1))).toEqual([])
    expect(await t.run(async ctx => await ctx.db.query("pages").withIndex("by_handle", q => q.eq("handle", "studio-objectif-demo")).unique())).toBeNull()
  })

  it("refuse un membre suspendu ou une racine arrêtée sans le réactiver", async () => {
    const { t, root, people } = await fixture()
    const personId = personOf(people, "membre")
    await t.run(async ctx => {
      const membership = await ctx.db.query("networkMemberships").withIndex("by_network_and_person", q => q.eq("networkId", root).eq("personId", personId)).unique()
      if (membership) await ctx.db.patch(membership._id, { status: "suspendue" })
    })
    expect(await errorCode(t.mutation(internal.seeds.demoContent.run, args))).toBe("policyRefused")
    await t.run(async ctx => await ctx.db.patch(root, { status: "archived" }))
    expect(await errorCode(t.mutation(internal.seeds.demoContent.run, args))).toBe("policyRefused")
    expect(await postsOf(t, root)).toEqual([])
  })

  it("crée les contenus, le graphe et les compteurs réels une seule fois ; laisse le nouvel arrivant intact", async () => {
    const { t, root, people, newcomer } = await fixture()
    const untouched = await t.run(async ctx => await ctx.db.get(newcomer))
    const result = await t.mutation(internal.seeds.demoContent.run, args)
    expect(result).toEqual({ profiles: 7, pages: 6, postsCreated: 52, postsExisting: 0, commentsCreated: 43, reactionsCreated: 104 })
    const posts = await postsOf(t, root)
    expect(posts).toHaveLength(52)
    expect(new Set(posts.map(post => post.idempotencyKey)).size).toBe(52)
    expect(posts.filter(post => post.pageId)).toHaveLength(10)
    for (const post of posts) {
      expect(post).toMatchObject({ audience: "public", visibility: "root", onRoot: true })
      expect(post.body).toMatch(/Démo/)
      expect(post.province).toBeTruthy()
      expect((await t.run(async ctx => await readReactionCounts(ctx, post._id))).total).toBe(2)
    }
    const counts = await t.run(async ctx => {
      const comments = await ctx.db.query("postComments").take(100)
      const follows = await ctx.db.query("follows").take(100)
      const connections = await ctx.db.query("connections").take(100)
      const pageFollows = await ctx.db.query("pageFollows").take(100)
      const pages = await ctx.db.query("pages").take(20)
      const shops = await ctx.db.query("shops").take(10)
      const rootRow = await ctx.db.get(root)
      const publicShops = rootRow ? await Promise.all(shops.map(shop => publicStorefrontPage(ctx, rootRow, shop))) : []
      return { comments: comments.length, follows: follows.length, connections: connections.length, pageFollows: pageFollows.length, pageCounts: await Promise.all(pages.map(async page => ({ posts: await countPagePosts(ctx, page._id), followers: await countPageFollowers(ctx, page._id) }))), shopConsent: shops.map(hasPublicConsent), publicShopCount: publicShops.filter(Boolean).length, followers: await followerCounts.count(ctx, { namespace: `${root}:${personOf(people, "membre")}` }), commentCount: (await Promise.all(posts.map(post => countComments(ctx, post._id)))).reduce((sum, count) => sum + count, 0) }
    })
    expect(counts).toMatchObject({ comments: 43, follows: 14, connections: 7, pageFollows: 42, followers: 2, commentCount: 43, publicShopCount: 3, shopConsent: [true, true, true] })
    expect(counts.pageCounts.map(count => count.posts).sort()).toEqual([1, 1, 1, 2, 2, 3])
    expect(counts.pageCounts.every(count => count.followers === 7)).toBe(true)
    expect(await t.mutation(internal.seeds.demoContent.run, args)).toEqual({ profiles: 0, pages: 6, postsCreated: 0, postsExisting: 52, commentsCreated: 0, reactionsCreated: 0 })
    expect(await t.run(async ctx => await ctx.db.get(newcomer))).toEqual(untouched)
    expect(await t.run(async ctx => await ctx.db.query("networkMemberships").withIndex("by_network_and_person", q => q.eq("networkId", root).eq("personId", newcomer)).unique())).toBeNull()
    expect(await t.run(async ctx => await ctx.db.query("notifications").take(1))).toEqual([])
    const personalPost = posts.find(post => post.pageId === undefined)
    if (!personalPost) throw new Error("Publication personnelle absente")
    expect(await t.query(api.modules.public.projections.getPost, { networkId: root, postId: personalPost._id })).not.toBeNull()
    const targets = await t.query(internal.seeds.demoContent.mediaTargets, args)
    expect(targets.filter(target => target.kind === "post")).toHaveLength(25)
    expect(targets.filter(target => target.kind === "page_banner")).toHaveLength(6)
    expect(targets.filter(target => target.kind === "person_cover")).toHaveLength(4)
    expect(targets.filter(target => target.kind === "story")).toHaveLength(7)
    expect(targets.filter(target => target.kind === "person_avatar")).toEqual([])
    expect(new Set(targets.filter(target => target.kind === "post").map(target => target.asset)).size).toBe(25)
    // Chaque cible désigne un fichier public existant du catalogue fermé.
    for (const target of targets) expect(assetBytes(target.asset).byteLength).toBe(demoMediaAsset(target.asset)?.bytes)
    expect(targets.every(target => /^[a-z0-9-]+\/[a-z0-9-]+\.(png|jpg)$/.test(target.file))).toBe(true)
  })

  it("préserve textes édités, retraits, vitrine suspendue et consentement révoqué au rejeu", async () => {
    const { t, root, people } = await fixture()
    await t.mutation(internal.seeds.demoContent.run, args)
    const posts = await postsOf(t, root)
    const removed = posts.find(post => post.idempotencyKey?.endsWith(":commercant-savon"))
    const edited = posts.find(post => post.idempotencyKey?.endsWith(":verifie-creation"))
    if (!removed || !edited) throw new Error("Publication de fixture absente")
    await t.run(async ctx => {
      await markPostRemoved(ctx, removed, T0 + 1)
      await ctx.db.patch(edited._id, { body: "Texte modifié par son auteur", editedAt: T0 + 1 })
      await ctx.db.patch(personOf(people, "membre"), { headline: "Mon activité choisie" })
      const comment = await ctx.db.query("postComments").take(1)
      if (comment[0]) await markCommentRemoved(ctx, comment[0], T0 + 1)
      const follow = await ctx.db.query("pageFollows").take(1)
      if (follow[0]) {
        await unrecordPageFollower(ctx, follow[0])
        await ctx.db.delete(follow[0]._id)
      }
      const reaction = (await ctx.db.query("postReactions").withIndex("by_post_and_person", q => q.eq("postId", edited._id)).take(1))[0]
      if (reaction) {
        await applyReactionDelta(ctx, edited._id, reaction.personId, reaction.kind, -1)
        await ctx.db.delete(reaction._id)
      }
      const shops = await ctx.db.query("shops").take(10)
      for (const shop of shops) await ctx.db.patch(shop._id, { publicConsentRevokedAt: T0 + 1, storefront: "suspended" })
    })
    await t.mutation(internal.seeds.demoContent.run, args)
    expect(await t.run(async ctx => await ctx.db.get(removed._id))).toMatchObject({ status: "removed" })
    expect(await t.query(api.modules.public.projections.getPost, { networkId: root, postId: removed._id })).toBeNull()
    expect(await t.run(async ctx => await ctx.db.get(edited._id))).toMatchObject({ body: "Texte modifié par son auteur" })
    expect(await t.run(async ctx => await ctx.db.get(personOf(people, "membre")))).toMatchObject({ headline: "Mon activité choisie" })
    expect(await t.run(async ctx => (await ctx.db.query("postComments").take(100)).filter(row => row.status === "published").length)).toBe(42)
    expect(await t.run(async ctx => (await ctx.db.query("pageFollows").take(100)).length)).toBe(41)
    expect((await t.run(async ctx => await readReactionCounts(ctx, edited._id))).total).toBe(1)
    expect(await t.run(async ctx => (await ctx.db.query("shops").take(10)).every(shop => shop.storefront === "suspended" && !hasPublicConsent(shop)))).toBe(true)
    const targets = await t.query(internal.seeds.demoContent.mediaTargets, args)
    expect(targets.some(target => target.targetId === removed._id || target.targetId === edited._id)).toBe(false)
  })

  it("admet les seuls octets du manifeste, interdit la reprise d'un blob et ne prolonge pas les stories", async () => {
    const { t } = await fixture()
    await t.mutation(internal.seeds.demoContent.run, args)
    const targets = await t.query(internal.seeds.demoContent.mediaTargets, args)
    const post = targetOf(targets, "post", "verifie.demo")
    const story = targetOf(targets, "story", "verifie.demo")
    const invalid = await t.run(async ctx => await ctx.storage.store(new Blob(["image inconnue"], { type: "image/png" })))
    expect(await errorCode(t.mutation(internal.seeds.demoContent.attachMedia, { ...args, key: post.key, asset: post.asset, storageId: invalid }))).toBe("policyRefused")
    expect(await t.run(async ctx => await ctx.db.query("fileScans").take(1))).toEqual([])
    // La première image personnelle de ce photographe est le sac-wax ; le post du studio utilise service-photo.
    const studio = targets.find(target => target.kind === "post" && target.asset === story.asset)
    if (!studio) throw new Error("Post de studio absent")
    const storageId = await storeImage(t, studio.asset)
    expect(await t.mutation(internal.seeds.demoContent.attachMedia, { ...args, key: studio.key, asset: studio.asset, storageId })).toEqual({ attached: true })
    expect(await t.mutation(internal.seeds.demoContent.attachMedia, { ...args, key: studio.key, asset: studio.asset, storageId })).toEqual({ attached: false })
    expect(await errorCode(t.mutation(internal.seeds.demoContent.attachMedia, { ...args, key: story.key, asset: story.asset, storageId }))).toBe("conflict")
    const storyStorageId = await storeImage(t, story.asset)
    expect(await t.mutation(internal.seeds.demoContent.attachMedia, { ...args, key: story.key, asset: story.asset, storageId: storyStorageId })).toEqual({ attached: true })
    const storedStory = await t.run(async ctx => await ctx.db.query("stories").take(1))
    expect(storedStory[0]).toMatchObject({ publishedAt: T0, expiresAt: T0 + STORY_TTL_MS })
    vi.setSystemTime(T0 + 60_000)
    expect(await t.mutation(internal.seeds.demoContent.attachMedia, { ...args, key: story.key, asset: story.asset, storageId: storyStorageId })).toEqual({ attached: false })
    expect(await t.run(async ctx => (await ctx.db.query("stories").take(1))[0]?.expiresAt)).toBe(T0 + STORY_TTL_MS)
    const id = storedStory[0]?._id
    if (!id) throw new Error("Story absente")
    await t.run(async ctx => await ctx.db.patch(id, { removedAt: T0 + 60_000, expiresAt: T0 + 60_000 }))
    vi.setSystemTime(T0 + 60_001)
    await t.mutation(internal.modules.stories.stories.purgeExpired, {})
    expect(await t.run(async ctx => await ctx.db.get(id))).toBeNull()
    expect(targetOf(await t.query(internal.seeds.demoContent.mediaTargets, args), "story", "verifie.demo").attached).toBe(true)
    expect(await t.run(async ctx => await servableUrl(ctx, storageId))).not.toBeNull()
    vi.setSystemTime(T0 + STORY_TTL_MS)
    const tomorrow = targetOf(await t.query(internal.seeds.demoContent.mediaTargets, args), "story", "verifie.demo")
    expect(tomorrow.attached).toBe(false)
    expect(tomorrow.key).not.toBe(story.key)
    expect(DEMO_CONTENT_POSTS).toHaveLength(52)
  })
})

async function seedActors(f: Awaited<ReturnType<typeof fixture>>) {
  await f.t.mutation(internal.seeds.demoContent.run, args)
}

/** Les figurants, inscrits comme par le parcours OTP : adresse réservée vérifiée, profil publié, membre déclaré. */
async function withFigurants(f: Awaited<ReturnType<typeof fixture>>, { skip = [] as number[], wrongEmail = [] as number[] } = {}) {
  const figurants = new Map<number, Id<"persons">>()
  for (const figurant of DEMO_FIGURANTS) {
    if (skip.includes(figurant.slot)) continue
    const email = wrongEmail.includes(figurant.slot) ? `autre-${figurant.slot}@example.test` : demoFigurantEmailOf(figurant.slot)
    const userId = authId(await f.t.mutation(components.betterAuth.adapter.create, { input: { model: "user", data: { name: "Fixture", email, emailVerified: true, createdAt: T0, updatedAt: T0 } } }))
    const personId = await f.t.run(async ctx => {
      const personId = await ctx.db.insert("persons", { authUserId: userId, handle: figurant.handle, displayName: `${normalizeGivenNames(figurant.givenNames)} ${normalizeFamilyName(figurant.familyName)}`, headline: figurant.headline, publishedAt: T0, createdAt: T0, updatedAt: T0 })
      await ctx.db.insert("consents", { personId, purpose: "social_profile", textVersion: CONSENT_TEXT_VERSIONS.social_profile, origin: "onboarding", grantedAt: T0 })
      await ctx.db.insert("networkMemberships", { networkId: f.root, personId, status: "declaree", role: "member", joinedAt: T0, statusChangedAt: T0 })
      return personId
    })
    figurants.set(figurant.slot, personId)
  }
  return figurants
}

describe("figurants : publications, engagement et graphe d'amis", () => {
  it("rend le réseau vivant : un tiers d'images, relations, demandes reçues et envoyées, suggestions restantes", async () => {
    const f = await fixture()
    await seedActors(f)
    const figurants = await withFigurants(f)
    const result = await f.t.mutation(internal.seeds.demoContent.runFigurants, args)
    expect(result).toEqual({ figurants: 10, postsCreated: 20, postsExisting: 0, connections: 30, requests: 16, follows: 80, reactionsCreated: 114, commentsCreated: 30 })
    const posts = await postsOf(f.t, f.root)
    expect(posts).toHaveLength(72)
    const illustrated = DEMO_CONTENT_POSTS.filter(spec => spec.asset).length + DEMO_FIGURANT_POSTS.filter(spec => spec.asset).length
    expect(illustrated).toBe(27)
    expect(illustrated / posts.length).toBeGreaterThanOrEqual(0.3)
    const graph = await f.t.run(async ctx => {
      const connections = await ctx.db.query("connections").take(200)
      const notifications = await ctx.db.query("notifications").take(200)
      return { connections, notifications }
    })
    expect(graph.connections.filter(row => row.status === "accepted")).toHaveLength(37)
    const pending = graph.connections.filter(row => row.status === "requested")
    expect(pending).toHaveLength(16)
    // Chaque acteur a au moins une demande reçue, avec son avis dans la cloche.
    for (const spec of DEMO_CONTENT_PERSONAS) {
      const actor = personOf(f.people, spec.actor)
      const received = pending.filter(row => row.recipientPersonId === actor)
      expect(received.length, spec.actor).toBeGreaterThan(0)
      expect(graph.notifications.filter(row => row.recipientPersonId === actor && row.kind === "connection_request")).toHaveLength(received.length)
    }
    // Des figurants restent sans lien avec Awa : ils nourrissent les suggestions.
    const membre = personOf(f.people, "membre")
    const linked = new Set(graph.connections.flatMap(row => [row.personIdLow, row.personIdHigh].includes(membre) ? [row.personIdLow, row.personIdHigh] : []))
    expect([...figurants.values()].filter(id => !linked.has(id)).length).toBeGreaterThanOrEqual(3)
    for (const spec of DEMO_FIGURANT_POSTS) {
      const post = posts.find(row => row.idempotencyKey?.endsWith(`:post:${spec.key}`))
      expect(post, spec.key).toBeDefined()
      expect(post?.body).toMatch(/^Démo — /)
      expect((await f.t.run(async ctx => await readReactionCounts(ctx, post!._id))).total).toBeGreaterThanOrEqual(2)
    }
    expect(await f.t.mutation(internal.seeds.demoContent.runFigurants, args)).toEqual({ figurants: 10, postsCreated: 0, postsExisting: 20, connections: 0, requests: 0, follows: 0, reactionsCreated: 0, commentsCreated: 0 })
  })

  it("ignore un figurant absent ou à l'adresse non réservée, sans rien inventer à sa place", async () => {
    const f = await fixture()
    await seedActors(f)
    await withFigurants(f, { skip: [1], wrongEmail: [2] })
    const result = await f.t.mutation(internal.seeds.demoContent.runFigurants, args)
    expect(result.figurants).toBe(8)
    expect(result.postsCreated).toBe(16)
    const handles = await f.t.run(async ctx => (await ctx.db.query("persons").take(100)).filter(person => person.handle === DEMO_FIGURANTS[1]?.handle))
    const intruder = handles[0]
    if (!intruder) throw new Error("Figurant de fixture absent")
    expect(await f.t.run(async ctx => await ctx.db.query("posts").withIndex("by_author_and_idempotencyKey", q => q.eq("authorPersonId", intruder._id)).take(1))).toEqual([])
  })

  it("ne ravive ni demande refusée ni relation rompue au rejeu", async () => {
    const f = await fixture()
    await seedActors(f)
    const figurants = await withFigurants(f)
    await f.t.mutation(internal.seeds.demoContent.runFigurants, args)
    const kevin = figurants.get(1)
    if (!kevin) throw new Error("Figurant absent")
    await f.t.run(async ctx => {
      for (const row of await ctx.db.query("connections").take(200)) {
        if (row.personIdLow !== kevin && row.personIdHigh !== kevin) continue
        if (row.status === "requested") await ctx.db.patch(row._id, { status: "declined", respondedAt: T0 + 1 })
        else await ctx.db.delete(row._id)
      }
      // Le figurant retire une publication : le rejeu ne la republie pas et ne repose pas son graphe.
      const post = (await ctx.db.query("posts").withIndex("by_author_and_idempotencyKey", q => q.eq("authorPersonId", kevin)).take(1))[0]
      if (post) await markPostRemoved(ctx, post, T0 + 1)
    })
    const replay = await f.t.mutation(internal.seeds.demoContent.runFigurants, args)
    expect({ connections: replay.connections, requests: replay.requests, postsCreated: replay.postsCreated }).toEqual({ connections: 0, requests: 0, postsCreated: 0 })
    const rows = await f.t.run(async ctx => (await ctx.db.query("connections").take(200)).filter(row => row.personIdLow === kevin || row.personIdHigh === kevin))
    expect(rows.every(row => row.status === "declined")).toBe(true)
  })

  it("pose les portraits des figurants et la photo de leurs publications, jamais par-dessus un portrait choisi", async () => {
    const f = await fixture()
    await seedActors(f)
    const figurants = await withFigurants(f)
    await f.t.mutation(internal.seeds.demoContent.runFigurants, args)
    const targets = await f.t.query(internal.seeds.demoContent.mediaTargets, args)
    expect(targets.filter(target => target.kind === "person_avatar")).toHaveLength(10)
    expect(targets.filter(target => target.kind === "post")).toHaveLength(27)
    const avatar = targetOf(targets, "person_avatar", "ines.obame.demo")
    expect(avatar.file).toBe("photos-20261021/figurant-portrait-4.jpg")
    const storageId = await storeImage(f.t, avatar.asset)
    expect(await f.t.mutation(internal.seeds.demoContent.attachMedia, { ...args, key: avatar.key, asset: avatar.asset, storageId })).toEqual({ attached: true })
    const ines = figurants.get(4)
    if (!ines) throw new Error("Figurant absent")
    expect(await f.t.run(async ctx => (await ctx.db.get(ines))?.avatarStorageId)).toBe(storageId)
    expect(targetOf(await f.t.query(internal.seeds.demoContent.mediaTargets, args), "person_avatar", "ines.obame.demo").attached).toBe(true)
    const fisher = targets.find(target => target.kind === "post" && target.ownerHandle === "joseph.nguema.demo")
    expect(fisher?.asset).toBe("paysage-pecheur-lac")
  })

  it("le dépôt par l'opérateur n'accepte que la taille et l'empreinte du manifeste", async () => {
    const f = await fixture()
    await seedActors(f)
    const targets = await f.t.query(internal.seeds.demoContent.mediaTargets, args)
    const target = targetOf(targets, "post", "membre.demo")
    const bytes = assetBytes(target.asset)
    const encode = (value: Uint8Array) => btoa(Array.from(value, byte => String.fromCharCode(byte)).join(""))
    await expect(f.t.action(internal.seeds.demoContentMedia.storeAsset, { ...args, key: "inconnue", dataBase64: encode(bytes) })).rejects.toThrow("Cible d'illustration inconnue.")
    await expect(f.t.action(internal.seeds.demoContentMedia.storeAsset, { ...args, key: target.key, dataBase64: encode(bytes.slice(1)) })).rejects.toThrow("Taille de l'illustration incohérente.")
    const altered = bytes.slice()
    altered[100] = (altered[100] ?? 0) ^ 0xff
    await expect(f.t.action(internal.seeds.demoContentMedia.storeAsset, { ...args, key: target.key, dataBase64: encode(altered) })).rejects.toThrow("Empreinte de l'illustration refusée.")
    await expect(f.t.action(internal.seeds.demoContentMedia.storeAsset, { confirmNonProduction: SEED_CONFIRMATION, key: target.key, dataBase64: encode(bytes) })).rejects.toThrow("Animation refusée")
    expect(await f.t.run(async ctx => (await ctx.db.system.query("_storage").take(5)).length)).toBe(0)
  })
})


it("les figurants ont chacun deux publications et des liens déclarés cohérents", () => {
  for (const figurant of DEMO_FIGURANTS) {
    expect(DEMO_FIGURANT_POSTS.filter(spec => spec.slot === figurant.slot)).toHaveLength(2)
    const ties = DEMO_FIGURANT_TIES[figurant.slot]
    expect(ties?.figurantFriends.every(slot => slot < figurant.slot)).toBe(true)
    expect(new Set([...(ties?.friends ?? []), ...(ties?.requests ?? []), ...(ties?.requestedBy ?? [])]).size).toBe((ties?.friends.length ?? 0) + (ties?.requests.length ?? 0) + (ties?.requestedBy.length ?? 0))
  }
})

describe("ICP-2 — conversations de démonstration (iCom et iCom Pro)", () => {
  async function seeded() {
    const f = await fixture()
    await seedActors(f)
    await withFigurants(f)
    await f.t.mutation(internal.seeds.demoContent.runFigurants, args)
    return f
  }

  it("ouvre le canal boutique jamais décidé, mandate les propriétaires et anime iCom et iCom Pro", async () => {
    const f = await seeded()
    const result = await f.t.mutation(internal.seeds.demoConversations.run, args)
    expect(result).toEqual({ mandates: 3, settings: 3, channelOpened: true, channelEnabled: true, directThreads: 11, directMessages: 25, shopThreads: 8, shopMessages: 15 })
    expect(DEMO_DIRECT_CONVERSATIONS).toHaveLength(11)
    expect(DEMO_SHOP_CONVERSATIONS).toHaveLength(8)
    // Chacun lit avant de répondre : Awa garde un message non lu par échange qui se termine par l'autre.
    expect(await f.t.run(async ctx => await readPersonalUnreadTotal(ctx, f.root, personOf(f.people, "membre")))).toBe(4)
    const shops = await f.t.run(async ctx => {
      const rows = await ctx.db.query("commercialThreads").take(50)
      const mandates = await ctx.db.query("shopContactMandates").take(10)
      const audits = await ctx.db.query("engineAudit").take(200)
      return { states: rows.map(row => row.state).sort(), assigned: rows.filter(row => row.assignedRespondentPersonId !== undefined).length, mandates: mandates.map(row => [row.canRead, row.canReply, row.canDecide, row.acceptedAt !== undefined]), auditActions: audits.map(row => row.action).filter(action => action.startsWith("commercial.")).sort() }
    })
    expect(shops.states).toEqual(["accepted", "accepted", "accepted", "accepted", "closed", "requested", "requested", "requested"])
    expect(shops.assigned).toBe(5)
    expect(shops.mandates).toEqual([[true, true, true, true], [true, true, true, true], [true, true, true, true]])
    expect(shops.auditActions).toEqual(["commercial.mandate_grant", "commercial.mandate_grant", "commercial.mandate_grant", "commercial.policy_set", "commercial.shop_settings_set", "commercial.shop_settings_set", "commercial.shop_settings_set"])
    // Awa est cliente de l'épicerie : son côté « Mes achats » existe.
    const awaPurchases = await f.t.run(async ctx => await ctx.db.query("commercialThreads").withIndex("by_requester", q => q.eq("requesterPersonId", personOf(f.people, "membre"))).take(5))
    expect(awaPurchases).toHaveLength(1)
    expect(await f.t.mutation(internal.seeds.demoConversations.run, args)).toEqual({ mandates: 0, settings: 0, channelOpened: false, channelEnabled: true, directThreads: 0, directMessages: 0, shopThreads: 0, shopMessages: 0 })
  })

  it("ne touche jamais une décision existante : canal fermé, mandat ou réglage déjà posés", async () => {
    const f = await seeded()
    const epicerie = await f.t.run(async ctx => {
      await ctx.db.insert("commercialNetworkPolicies", { networkId: f.root, enabled: false, updatedAt: T0 })
      const page = await ctx.db.query("pages").withIndex("by_handle", q => q.eq("handle", "epicerie-moussavou-demo")).unique()
      const shop = page ? await ctx.db.query("shops").withIndex("by_page", q => q.eq("pageId", page._id)).unique() : null
      if (!shop) throw new Error("Boutique de fixture absente")
      await ctx.db.insert("shopContactSettings", { networkId: f.root, shopId: shop._id, acceptRequests: false, updatedAt: T0 })
      return shop._id
    })
    const result = await f.t.mutation(internal.seeds.demoConversations.run, args)
    expect(result).toMatchObject({ channelOpened: false, channelEnabled: false, shopThreads: 0, settings: 2, directThreads: 11 })
    const after = await f.t.run(async ctx => ({
      policy: (await ctx.db.query("commercialNetworkPolicies").take(2)).map(row => row.enabled),
      settings: (await ctx.db.query("shopContactSettings").withIndex("by_shop", q => q.eq("shopId", epicerie)).take(2)).map(row => row.acceptRequests),
      threads: (await ctx.db.query("commercialThreads").take(1)).length,
    }))
    expect(after).toEqual({ policy: [false], settings: [false], threads: 0 })
  })

  it("une relation rompue fait sauter l'échange, sans en recréer une", async () => {
    const f = await seeded()
    const awa = personOf(f.people, "membre")
    await f.t.run(async ctx => {
      for (const row of await ctx.db.query("connections").take(200)) {
        const pair = [row.personIdLow, row.personIdHigh]
        if (pair.includes(awa) && row.status === "accepted") await ctx.db.delete(row._id)
      }
    })
    const result = await f.t.mutation(internal.seeds.demoConversations.run, args)
    expect(result.directThreads).toBe(7)
    expect(await f.t.run(async ctx => (await ctx.db.query("connections").take(200)).filter(row => [row.personIdLow, row.personIdHigh].includes(awa) && row.status === "accepted").length)).toBe(0)
  })
})

