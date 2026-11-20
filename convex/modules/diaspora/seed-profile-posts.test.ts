// @vitest-environment edge-runtime
/** Recette du mur : locale seulement, cible fictive fermée, aucune admission implicite. */
import type { MembershipStatus } from "@antsia/social-domain/membership"
import { canonicalPair } from "@antsia/social-domain/connectionState"
import { engineErrorCode } from "@antsia/social-contracts/errors"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { api, components, internal } from "../../_generated/api"
import { SEED_CONFIRMATION } from "../../seeds/foundations"
import { openNetworkFeatures, testConvex } from "../../test.setup"
import { followerCounts } from "../graph/follows"

type T = ReturnType<typeof testConvex>
const HANDLE = "relations.recette"
const EMAIL = "relations.recette@exemple.test"
const NOW = Date.UTC(2026, 9, 16, 14)
const ARGS = { confirmNonProduction: SEED_CONFIRMATION }

beforeEach(() => {
  vi.stubEnv("CONVEX_CLOUD_URL", "http://127.0.0.1:3210")
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

async function seedNetworks(t: T) {
  const foundations = await t.mutation(internal.seeds.foundations.run, ARGS)
  const diaspora = await t.mutation(internal.modules.diaspora.seed.run, ARGS)
  await openNetworkFeatures(t, diaspora.network)
  return { root: foundations.root, network: diaspora.network }
}

async function fixture(t: T, options: {
  handle?: string
  email?: string
  verified?: boolean
  status?: MembershipStatus
  rootStatus?: MembershipStatus
  withMembership?: boolean
  withdrawn?: boolean
} = {}) {
  const { root, network } = await seedNetworks(t)
  const user: unknown = await t.mutation(components.betterAuth.adapter.create, {
    input: {
      model: "user",
      data: { name: "Relations Recette", email: options.email ?? EMAIL, emailVerified: options.verified ?? true, createdAt: NOW, updatedAt: NOW },
    },
  })
  if (typeof user !== "object" || user === null || !("_id" in user) || typeof user._id !== "string") throw new Error("Utilisateur fictif de test absent")
  const authUserId = user._id
  const personId = await t.run(async (ctx) => {
    const person = await ctx.db.insert("persons", {
      authUserId, handle: options.handle ?? HANDLE, displayName: "Relations Recette", publishedAt: NOW,
      ...(options.withdrawn ? { withdrawnAt: NOW } : {}), createdAt: NOW, updatedAt: NOW,
    })
    await ctx.db.insert("networkMemberships", { networkId: root, personId: person, status: options.rootStatus ?? "declaree", role: "member", joinedAt: NOW, statusChangedAt: NOW })
    if (options.withMembership !== false) {
      await ctx.db.insert("networkMemberships", { networkId: network, personId: person, status: options.status ?? "declaree", role: "member", joinedAt: NOW, statusChangedAt: NOW })
    }
    return person
  })
  return { root, network, personId, authUserId }
}

async function posts(t: T) {
  return await t.run(async (ctx) => await ctx.db.query("posts").take(100))
}

async function albums(t: T) {
  return await t.run(async (ctx) => await ctx.db.query("albums").take(100))
}

async function follows(t: T) {
  return await t.run(async (ctx) => await ctx.db.query("follows").take(10))
}

async function storyReaderFixture(t: T, options: Parameters<typeof fixture>[1] = {}) {
  const author = await fixture(t)
  const reader = await fixture(t, { handle: "pd4.lecture", email: "pd4.recette@exemple.test", status: "en_attente", rootStatus: "en_attente", ...options })
  return { author, reader }
}

describe("diaspora/seed:profilePostsForRecette", () => {
  it("refuse sans confirmation avant toute écriture", async () => {
    const t = testConvex()
    await expect(t.mutation(internal.modules.diaspora.seed.profilePostsForRecette, { confirmNonProduction: "oui" })).rejects.toThrow(/hors production/)
    expect(await posts(t)).toEqual([])
  })

  it("refuse un déploiement en nuage même si les graines y sont explicitement autorisées", async () => {
    vi.stubEnv("CONVEX_CLOUD_URL", "https://recette.convex.cloud")
    vi.stubEnv("ANTSIA_SEEDS_ALLOWED", "true")
    const t = testConvex()
    await expect(t.mutation(internal.modules.diaspora.seed.profilePostsForRecette, ARGS)).rejects.toThrow(/backend local obligatoire/)
    expect(await posts(t)).toEqual([])
  })

  it("ne crée aucun réseau si DIASPORA.GA n'existe pas", async () => {
    const t = testConvex()
    await expect(t.mutation(internal.modules.diaspora.seed.profilePostsForRecette, ARGS)).rejects.toThrow(/réseau diaspora-ga actif/)
    expect(await t.run(async (ctx) => await ctx.db.query("networks").take(5))).toEqual([])
  })

  it("ne crée aucun profil quand le handle réservé est absent", async () => {
    const t = testConvex()
    await seedNetworks(t)
    await expect(t.mutation(internal.modules.diaspora.seed.profilePostsForRecette, ARGS)).rejects.toThrow(/profil fictif préexistant/)
    expect(await t.run(async (ctx) => await ctx.db.query("persons").take(5))).toEqual([])
    expect(await posts(t)).toEqual([])
  })

  it("ne prend jamais un autre handle pour cible", async () => {
    const t = testConvex()
    const { personId } = await fixture(t, { handle: "autre.recette" })
    const before = await t.run(async (ctx) => await ctx.db.get(personId))
    await expect(t.mutation(internal.modules.diaspora.seed.profilePostsForRecette, ARGS)).rejects.toThrow(/profil fictif préexistant/)
    expect(await t.run(async (ctx) => await ctx.db.get(personId))).toEqual(before)
    expect(await posts(t)).toEqual([])
  })

  it("ne crée aucune adhésion pour la cible non membre", async () => {
    const t = testConvex()
    await fixture(t, { withMembership: false })
    const before = await t.run(async (ctx) => await ctx.db.query("networkMemberships").take(5))
    await expect(t.mutation(internal.modules.diaspora.seed.profilePostsForRecette, ARGS)).rejects.toThrow(/adhésion préexistante/)
    expect(await t.run(async (ctx) => await ctx.db.query("networkMemberships").take(5))).toEqual(before)
    expect(await posts(t)).toEqual([])
  })

  it.each(["en_attente", "suspendue", "partie"] as const)("refuse une adhésion %s sans la modifier", async (status) => {
    const t = testConvex()
    await fixture(t, { status })
    const before = await t.run(async (ctx) => await ctx.db.query("networkMemberships").take(5))
    await expect(t.mutation(internal.modules.diaspora.seed.profilePostsForRecette, ARGS)).rejects.toThrow(/adhésion préexistante/)
    expect(await t.run(async (ctx) => await ctx.db.query("networkMemberships").take(5))).toEqual(before)
    expect(await posts(t)).toEqual([])
  })

  it.each(["suspendue", "partie"] as const)("une adhésion racine %s ferme aussi la recette", async (rootStatus) => {
    const t = testConvex()
    await fixture(t, { rootStatus })
    await expect(t.mutation(internal.modules.diaspora.seed.profilePostsForRecette, ARGS)).rejects.toThrow(/adhésion préexistante/)
    expect(await posts(t)).toEqual([])
  })

  it.each([
    { email: "personne.reelle@exemple.test", verified: true },
    { email: EMAIL, verified: false },
  ])("le handle ne suffit pas sans l'identité fictive vérifiée ($verified)", async (options) => {
    const t = testConvex()
    await fixture(t, options)
    await expect(t.mutation(internal.modules.diaspora.seed.profilePostsForRecette, ARGS)).rejects.toThrow(/identité fictive vérifiée/)
    expect(await posts(t)).toEqual([])
  })

  it("refuse le profil retiré sans le republier", async () => {
    const t = testConvex()
    const { personId } = await fixture(t, { withdrawn: true })
    await expect(t.mutation(internal.modules.diaspora.seed.profilePostsForRecette, ARGS)).rejects.toThrow(/profil fictif préexistant/)
    expect(await t.run(async (ctx) => await ctx.db.get(personId))).toMatchObject({ withdrawnAt: NOW })
    expect(await posts(t)).toEqual([])
  })

  it("ajoute trente-cinq textes réseau idempotents sans toucher au profil, aux identités ni aux adhésions", async () => {
    const t = testConvex()
    const { root, network, personId, authUserId } = await fixture(t)
    const snapshot = async () => await t.run(async (ctx) => ({
      person: await ctx.db.get(personId),
      memberships: await ctx.db.query("networkMemberships").take(5),
      identities: await ctx.db.query("identityLinks").take(5),
      networks: await ctx.db.query("networks").take(5),
    }))
    const before = await snapshot()
    expect(await t.mutation(internal.modules.diaspora.seed.profilePostsForRecette, ARGS)).toEqual({ handle: HANDLE, created: 35, existing: 0 })
    const first = await posts(t)
    expect(first).toHaveLength(35)
    expect(new Set(first.map((post) => post.body)).size).toBe(35)
    expect(new Set(first.map((post) => post.idempotencyKey)).size).toBe(35)
    for (const post of first) {
      expect(post).toMatchObject({ networkId: network, authorPersonId: personId, audience: "public", visibility: "network", onRoot: false, status: "published", reach: "diaspora" })
      expect(post.body).toMatch(/^PD4 mur recette \d{2}\/35 — Publication fictive/)
      expect(post.groupId).toBeUndefined()
      expect(post.pageId).toBeUndefined()
      expect(post.sharedPostId).toBeUndefined()
      expect(post.media).toBeUndefined()
    }
    expect(await t.mutation(internal.modules.diaspora.seed.profilePostsForRecette, ARGS)).toEqual({ handle: HANDLE, created: 0, existing: 35 })
    expect(await posts(t)).toEqual(first)
    expect(await snapshot()).toEqual(before)

    const reader = t.withIdentity({ subject: authUserId })
    const firstPage = await reader.query(api.modules.posts.posts.personPosts, { networkId: network, handle: HANDLE, limit: 30 })
    expect(firstPage.items).toHaveLength(30)
    expect(firstPage.nextCursor).not.toBeNull()
    const secondPage = await reader.query(api.modules.posts.posts.personPosts, { networkId: network, handle: HANDLE, limit: 30, cursor: firstPage.nextCursor! })
    expect(secondPage.items).toHaveLength(5)
    expect(secondPage.nextCursor).toBeNull()
    expect(new Set([...firstPage.items, ...secondPage.items].map((post) => post._id)).size).toBe(35)
    expect((await reader.query(api.modules.posts.posts.myFeed, { networkId: root, scope: "recents" })).items).toEqual([])
  })
})

describe("diaspora/seed:albumDraftsForRecette", () => {
  it("refuse sans confirmation avant toute écriture", async () => {
    const t = testConvex()
    await expect(t.mutation(internal.modules.diaspora.seed.albumDraftsForRecette, { confirmNonProduction: "oui" })).rejects.toThrow(/hors production/)
    expect(await albums(t)).toEqual([])
  })

  it("refuse le nuage même si les graines y sont autorisées", async () => {
    vi.stubEnv("CONVEX_CLOUD_URL", "https://recette.convex.cloud")
    vi.stubEnv("ANTSIA_SEEDS_ALLOWED", "true")
    const t = testConvex()
    await expect(t.mutation(internal.modules.diaspora.seed.albumDraftsForRecette, ARGS)).rejects.toThrow(/backend local obligatoire/)
    expect(await albums(t)).toEqual([])
  })

  it("ne crée ni réseau ni profil quand les prérequis manquent", async () => {
    const t = testConvex()
    await expect(t.mutation(internal.modules.diaspora.seed.albumDraftsForRecette, ARGS)).rejects.toThrow(/réseau diaspora-ga actif/)
    expect(await t.run(async (ctx) => await ctx.db.query("networks").take(5))).toEqual([])
    await seedNetworks(t)
    await expect(t.mutation(internal.modules.diaspora.seed.albumDraftsForRecette, ARGS)).rejects.toThrow(/profil fictif préexistant/)
    expect(await t.run(async (ctx) => await ctx.db.query("persons").take(5))).toEqual([])
    expect(await albums(t)).toEqual([])
  })

  it.each([
    { name: "autre identifiant", options: { handle: "autre.recette" }, error: /profil fictif préexistant/ },
    { name: "profil retiré", options: { withdrawn: true }, error: /profil fictif préexistant/ },
    { name: "sans adhésion", options: { withMembership: false }, error: /adhésion préexistante/ },
    { name: "en attente", options: { status: "en_attente" as const }, error: /adhésion préexistante/ },
    { name: "suspendu", options: { status: "suspendue" as const }, error: /adhésion préexistante/ },
    { name: "racine en attente", options: { rootStatus: "en_attente" as const }, error: /adhésion préexistante/ },
    { name: "racine suspendue", options: { rootStatus: "suspendue" as const }, error: /adhésion préexistante/ },
    { name: "racine quittée", options: { rootStatus: "partie" as const }, error: /adhésion préexistante/ },
    { name: "adresse différente", options: { email: "autre.recette@exemple.test" }, error: /identité fictive vérifiée/ },
    { name: "identité non vérifiée", options: { verified: false }, error: /identité fictive vérifiée/ },
  ])("ne sème aucun album si la cible est $name", async ({ options, error }) => {
    const t = testConvex()
    const { personId } = await fixture(t, options)
    const before = await t.run(async (ctx) => ({
      person: await ctx.db.get(personId),
      memberships: await ctx.db.query("networkMemberships").take(5),
    }))
    await expect(t.mutation(internal.modules.diaspora.seed.albumDraftsForRecette, ARGS)).rejects.toThrow(error)
    expect(await albums(t)).toEqual([])
    expect(await t.run(async (ctx) => ({
      person: await ctx.db.get(personId),
      memberships: await ctx.db.query("networkMemberships").take(5),
    }))).toEqual(before)
  })

  it("refuse un profil sans utilisateur d'authentification vérifiable", async () => {
    const t = testConvex()
    const { personId } = await fixture(t)
    await t.run(async (ctx) => await ctx.db.patch(personId, { authUserId: "missing-recette-auth-user" }))

    await expect(t.mutation(internal.modules.diaspora.seed.albumDraftsForRecette, ARGS)).rejects.toThrow(/identité fictive vérifiée/)
    expect(await albums(t)).toEqual([])
  })

  it("crée treize brouillons privés, vides, distincts et idempotents sans toucher aux identités", async () => {
    const t = testConvex()
    const { network, personId, authUserId } = await fixture(t)
    const other = await fixture(t, { handle: "autre.recette", email: "autre.recette@exemple.test" })
    const snapshot = async () => await t.run(async (ctx) => ({
      persons: await ctx.db.query("persons").take(5),
      memberships: await ctx.db.query("networkMemberships").take(5),
      identities: await ctx.db.query("identityLinks").take(5),
      networks: await ctx.db.query("networks").take(5),
    }))
    const before = await snapshot()

    expect(await t.mutation(internal.modules.diaspora.seed.albumDraftsForRecette, ARGS)).toEqual({ handle: HANDLE, created: 13, existing: 0 })
    const first = await albums(t)
    expect(first).toHaveLength(13)
    expect(new Set(first.map((album) => album.createdAt)).size).toBe(13)
    expect(new Set(first.map((album) => album.updatedAt)).size).toBe(13)
    expect(new Set(first.map((album) => album.idempotencyKey)).size).toBe(13)
    expect(first.map((album) => album.title).sort()).toEqual(Array.from({ length: 13 }, (_, index) => `PD4 album recette ${String(index + 1).padStart(2, "0")}/13`))
    for (const album of first) {
      expect(album).toMatchObject({ networkId: network, ownerPersonId: personId, audience: "connections", status: "draft", itemCount: 0 })
      expect(album.idempotencyKey).toMatch(/^diaspora-ga:pd4-album-recette:relations\.recette:\d{2}$/)
      expect(album.coverItemId).toBeUndefined()
      expect(album.publishedAt).toBeUndefined()
      expect(album.deletingAt).toBeUndefined()
      expect(album.updatedAt).toBe(album.createdAt)
    }
    expect(await t.run(async (ctx) => await ctx.db.query("albumItems").take(5))).toEqual([])
    expect(await posts(t)).toEqual([])
    expect(await t.mutation(internal.modules.diaspora.seed.albumDraftsForRecette, ARGS)).toEqual({ handle: HANDLE, created: 0, existing: 13 })
    expect(await albums(t)).toEqual(first)
    expect(await snapshot()).toEqual(before)

    const owner = t.withIdentity({ subject: authUserId })
    const page = await owner.query(api.modules.albums.albums.paginateMyAlbums, { networkId: network, paginationOpts: { numItems: 12, cursor: null } })
    expect(page.page).toHaveLength(12)
    expect(page.isDone).toBe(false)
    const tail = await owner.query(api.modules.albums.albums.paginateMyAlbums, { networkId: network, paginationOpts: { numItems: 12, cursor: page.continueCursor } })
    expect(tail.page).toHaveLength(1)
    expect(tail.isDone).toBe(true)
    expect(new Set([...page.page, ...tail.page].map((album) => album.albumId)).size).toBe(13)
    const reader = t.withIdentity({ subject: other.authUserId })
    expect((await reader.query(api.modules.albums.albums.paginatePersonAlbums, { networkId: network, handle: HANDLE, paginationOpts: { numItems: 12, cursor: null } })).page).toEqual([])
    expect(await reader.query(api.modules.albums.albums.getAlbum, { networkId: network, albumId: first[0]!._id })).toBeNull()
  })

  it.each(["draft", "published", "withdrawn"] as const)("préserve le titre, l'audience et l'état modifiés pendant la recette (%s)", async (status) => {
    const t = testConvex()
    await fixture(t)
    await t.mutation(internal.modules.diaspora.seed.albumDraftsForRecette, ARGS)
    const album = (await albums(t))[0]!
    await t.run(async (ctx) => await ctx.db.patch(album._id, { title: "Album corrigé pendant la recette", audience: "public", status, updatedAt: NOW + 60_000 }))
    const before = await albums(t)

    expect(await t.mutation(internal.modules.diaspora.seed.albumDraftsForRecette, ARGS)).toEqual({ handle: HANDLE, created: 0, existing: 13 })
    expect(await albums(t)).toEqual(before)
  })

  it.each(["autre réseau", "suppression en cours"] as const)("refuse une clé portant un album hors périmètre et annule les insertions précédentes (%s)", async (state) => {
    const t = testConvex()
    const { network, root, personId } = await fixture(t)
    await t.run(async (ctx) => await ctx.db.insert("albums", {
      networkId: state === "autre réseau" ? root : network,
      ownerPersonId: personId,
      title: "Album préexistant conservé",
      audience: "connections",
      status: "draft",
      itemCount: 0,
      idempotencyKey: `diaspora-ga:pd4-album-recette:${HANDLE}:13`,
      ...(state === "suppression en cours" ? { deletingAt: NOW } : {}),
      createdAt: NOW,
      updatedAt: NOW,
    }))
    const before = await albums(t)

    await expect(t.mutation(internal.modules.diaspora.seed.albumDraftsForRecette, ARGS)).rejects.toThrow(/album existant hors du périmètre/)
    expect(await albums(t)).toEqual(before)
    expect(await posts(t)).toEqual([])
  })
})

describe("diaspora/seed:storyReaderForRecette", () => {
  it("refuse sans confirmation et ne crée aucun abonnement", async () => {
    const t = testConvex()
    await expect(t.mutation(internal.modules.diaspora.seed.storyReaderForRecette, { confirmNonProduction: "oui" })).rejects.toThrow(/hors production/)
    expect(await follows(t)).toEqual([])
  })

  it("refuse le nuage même si les graines y sont autorisées", async () => {
    vi.stubEnv("CONVEX_CLOUD_URL", "https://recette.convex.cloud")
    vi.stubEnv("ANTSIA_SEEDS_ALLOWED", "true")
    const t = testConvex()
    await expect(t.mutation(internal.modules.diaspora.seed.storyReaderForRecette, ARGS)).rejects.toThrow(/backend local obligatoire/)
    expect(await follows(t)).toEqual([])
  })

  it("ne crée pas le lecteur s'il manque", async () => {
    const t = testConvex()
    await fixture(t)
    const before = await t.run(async (ctx) => await ctx.db.query("persons").take(5))
    await expect(t.mutation(internal.modules.diaspora.seed.storyReaderForRecette, ARGS)).rejects.toThrow(/profil lecteur fictif préexistant/)
    expect(await t.run(async (ctx) => await ctx.db.query("persons").take(5))).toEqual(before)
    expect(await follows(t)).toEqual([])
  })

  it.each([
    { name: "autre handle", options: { handle: "autre.lecture" }, error: /profil lecteur fictif préexistant/ },
    { name: "profil retiré", options: { withdrawn: true }, error: /profil lecteur fictif préexistant/ },
    { name: "adresse sans le point attendu", options: { email: "pd4recette@exemple.test" }, error: /identité fictive vérifiée du lecteur/ },
    { name: "identité non vérifiée", options: { verified: false }, error: /identité fictive vérifiée du lecteur/ },
    { name: "adhésion absente", options: { withMembership: false }, error: /lecteur en attente/ },
    { name: "lecteur déclaré", options: { status: "declaree" as const }, error: /lecteur en attente/ },
    { name: "lecteur vérifié", options: { status: "verifiee" as const }, error: /lecteur en attente/ },
    { name: "lecteur suspendu", options: { status: "suspendue" as const }, error: /lecteur en attente/ },
    { name: "lecteur parti", options: { status: "partie" as const }, error: /lecteur en attente/ },
    { name: "racine suspendue", options: { rootStatus: "suspendue" as const }, error: /lecteur en attente/ },
    { name: "racine quittée", options: { rootStatus: "partie" as const }, error: /lecteur en attente/ },
  ])("refuse la cible non conforme : $name", async ({ options, error }) => {
    const t = testConvex()
    await storyReaderFixture(t, options)
    await expect(t.mutation(internal.modules.diaspora.seed.storyReaderForRecette, ARGS)).rejects.toThrow(error)
    expect(await follows(t)).toEqual([])
  })

  it.each(["en_attente", "declaree"] as const)("crée seulement l'abonnement DIASPORA.GA et son agrégat, puis rejoue sans rien modifier (racine %s)", async (rootStatus) => {
    const t = testConvex()
    const { author, reader } = await storyReaderFixture(t, { rootStatus })
    const snapshot = async () => await t.run(async (ctx) => ({
      persons: await ctx.db.query("persons").take(5),
      memberships: await ctx.db.query("networkMemberships").take(5),
      identities: await ctx.db.query("identityLinks").take(5),
      networks: await ctx.db.query("networks").take(5),
      stories: await ctx.db.query("stories").take(5),
      albums: await ctx.db.query("albums").take(5),
      notifications: await ctx.db.query("notifications").take(5),
    }))
    const before = await snapshot()
    expect(await t.mutation(internal.modules.diaspora.seed.storyReaderForRecette, ARGS)).toEqual({ created: true })
    const first = await follows(t)
    expect(first).toHaveLength(1)
    expect(first[0]).toMatchObject({ networkId: author.network, followerPersonId: reader.personId, targetPersonId: author.personId, createdAt: NOW })
    expect(await t.run(async (ctx) => await followerCounts.count(ctx, { namespace: `${author.network}:${author.personId}` }))).toBe(1)
    expect(await t.run(async (ctx) => await followerCounts.count(ctx, { namespace: `${author.root}:${author.personId}` }))).toBe(0)

    vi.setSystemTime(NOW + 60_000)
    expect(await t.mutation(internal.modules.diaspora.seed.storyReaderForRecette, ARGS)).toEqual({ created: false })
    expect(await follows(t)).toEqual(first)
    expect(await snapshot()).toEqual(before)
    expect(await t.run(async (ctx) => await followerCounts.count(ctx, { namespace: `${author.network}:${author.personId}` }))).toBe(1)
    const readerAccess = t.withIdentity({ subject: reader.authUserId })
    let refusal: unknown
    try {
      await readerAccess.mutation(api.modules.graph.follows.follow, { networkId: author.network, handle: HANDLE })
    } catch (error) {
      refusal = error
    }
    expect(engineErrorCode(refusal)).toBe("statusInsufficient")
  })

  it("un abonnement d'un autre réseau ne remplace pas celui de DIASPORA.GA", async () => {
    const t = testConvex()
    const { author, reader } = await storyReaderFixture(t)
    await t.run(async (ctx) => {
      const id = await ctx.db.insert("follows", { networkId: author.root, followerPersonId: reader.personId, targetPersonId: author.personId, createdAt: NOW - 1 })
      const row = await ctx.db.get(id)
      if (!row) throw new Error("Abonnement de test absent")
      await followerCounts.insert(ctx, row)
    })
    const before = await follows(t)

    expect(await t.mutation(internal.modules.diaspora.seed.storyReaderForRecette, ARGS)).toEqual({ created: true })
    expect(await follows(t)).toHaveLength(2)
    expect((await follows(t)).find((follow) => follow.networkId === author.root)).toEqual(before[0])
    expect(await t.run(async (ctx) => await followerCounts.count(ctx, { namespace: `${author.network}:${author.personId}` }))).toBe(1)
    expect(await t.run(async (ctx) => await followerCounts.count(ctx, { namespace: `${author.root}:${author.personId}` }))).toBe(1)
  })

  it("ne réactive pas un réseau archivé", async () => {
    const t = testConvex()
    const { author } = await storyReaderFixture(t)
    await t.run(async (ctx) => await ctx.db.patch(author.network, { status: "archived" }))

    await expect(t.mutation(internal.modules.diaspora.seed.storyReaderForRecette, ARGS)).rejects.toThrow(/réseau diaspora-ga actif/)
    expect(await follows(t)).toEqual([])
    expect(await t.run(async (ctx) => await ctx.db.get(author.network))).toMatchObject({ status: "archived" })
  })

  it("ne crée pas d'abonnement si la paire fictive est bloquée", async () => {
    const t = testConvex()
    const { author, reader } = await storyReaderFixture(t)
    const pair = canonicalPair(author.personId, reader.personId)
    await t.run(async (ctx) => await ctx.db.insert("connections", {
      networkId: author.network,
      personIdLow: pair.low,
      personIdHigh: pair.high,
      requestedByPersonId: author.personId,
      recipientPersonId: reader.personId,
      status: "blocked",
      blockedByPersonId: author.personId,
      requestedAt: NOW,
      updatedAt: NOW,
    }))

    await expect(t.mutation(internal.modules.diaspora.seed.storyReaderForRecette, ARGS)).rejects.toThrow(/paire fictive indisponible/)
    expect(await follows(t)).toEqual([])
    expect(await t.run(async (ctx) => await followerCounts.count(ctx, { namespace: `${author.network}:${author.personId}` }))).toBe(0)
  })
})
