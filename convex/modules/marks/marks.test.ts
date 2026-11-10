// @vitest-environment edge-runtime
// Dupliqué de socle/convex/modules/reseauPersonnel/marks.test.ts @ ad2e7fdc2 — adaptations : personnes et réseaux (marques et sourdines PAR RÉSEAU) ; listes paginées seules (`paginateBookmarks`, `paginateHiddenPosts`, `paginateMyMutes`) ; départ d'un groupe posé sur la ligne d'appartenance (le module des groupes arrive au lot 9) ; publications de série insérées directement (débit réel de `publish`) ; test neuf : une marque vaut dans le réseau où elle est posée ; `isAuthorMuted` (PF-01).
import { engineErrorCode } from "@antsia/social-contracts/errors"
import { afterEach, describe, expect, it, vi } from "vitest"

import { api, internal } from "../../_generated/api"
import type { Id } from "../../_generated/dataModel"
import { SEED_CONFIRMATION } from "../../seeds/foundations"
import { testConvex } from "../../test.setup"

type T = ReturnType<typeof testConvex>
type Person = { as: ReturnType<T["withIdentity"]>; personId: Id<"persons"> }

afterEach(() => {
  vi.useRealTimers()
})

const PAGE = { numItems: 100, cursor: null }

async function seed(t: T) {
  return await t.mutation(internal.seeds.foundations.run, { confirmNonProduction: SEED_CONFIRMATION })
}

async function enter(t: T, rootId: Id<"networks">, handle: string): Promise<Person> {
  const as = t.withIdentity({ subject: `auth-${handle}` })
  const personId = await as.mutation(api.modules.people.persons.ensureMyPerson, {})
  await as.mutation(api.modules.people.consents.recordConsent, { purpose: "social_profile", origin: "onboarding" })
  await as.mutation(api.modules.people.profile.publishMyProfile, { handle, displayName: handle })
  await as.mutation(api.modules.people.memberships.joinNetwork, { networkId: rootId })
  return { as, personId }
}

async function caught(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise
  } catch (error) {
    return error
  }
  return null
}

async function recents(reader: Person, networkId: Id<"networks">) {
  return (await reader.as.query(api.modules.posts.posts.myFeed, { networkId, scope: "recents" })).items.map((item) => item._id)
}

describe("masquer une publication", () => {
  it("la retire de MON fil et d'aucun autre ; elle reste trouvable par la recherche et sur le mur de son auteur", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const alice = await enter(t, root, "alice")
    const bob = await enter(t, root, "bob")
    const carol = await enter(t, root, "carol")
    const { postId } = await alice.as.mutation(api.modules.posts.posts.publish, { networkId: root, body: "Une annonce masquable" })
    await bob.as.mutation(api.modules.marks.marks.hidePost, { networkId: root, postId })
    expect(await recents(bob, root)).toEqual([])
    expect(await recents(carol, root)).toEqual([postId])
    expect((await bob.as.query(api.modules.posts.posts.search, { networkId: root, query: "annonce" })).items.map((item) => item._id)).toEqual([postId])
    expect((await bob.as.query(api.modules.posts.posts.personPosts, { networkId: root, handle: "alice" })).items.map((item) => item._id)).toEqual([postId])
  })

  it("est IDEMPOTENTE, et « Annuler » la rend au fil", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const alice = await enter(t, root, "alice")
    const bob = await enter(t, root, "bob")
    const { postId } = await alice.as.mutation(api.modules.posts.posts.publish, { networkId: root, body: "Deux fois masquée" })
    await bob.as.mutation(api.modules.marks.marks.hidePost, { networkId: root, postId })
    await bob.as.mutation(api.modules.marks.marks.hidePost, { networkId: root, postId })
    expect((await bob.as.query(api.modules.marks.marks.paginateHiddenPosts, { networkId: root, paginationOpts: PAGE })).page.map((row) => row.postId)).toEqual([postId])
    await bob.as.mutation(api.modules.marks.marks.unhidePost, { networkId: root, postId })
    expect(await recents(bob, root)).toEqual([postId])
  })
})

describe("enregistrer et suivre", () => {
  it("bascule, et le DTO du fil porte l'état pour le menu — sans l'exposer à personne d'autre", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const alice = await enter(t, root, "alice")
    const bob = await enter(t, root, "bob")
    const { postId } = await alice.as.mutation(api.modules.posts.posts.publish, { networkId: root, body: "À garder" })
    expect(await bob.as.mutation(api.modules.marks.marks.toggleMark, { networkId: root, postId, kind: "bookmark" })).toEqual({ marked: true })
    await bob.as.mutation(api.modules.marks.marks.toggleMark, { networkId: root, postId, kind: "notify" })
    const [mine] = (await bob.as.query(api.modules.posts.posts.myFeed, { networkId: root, scope: "recents" })).items
    expect(mine?.viewer).toEqual({ bookmarked: true, notifying: true })
    expect(await bob.as.query(api.modules.marks.marks.markStateFor, { networkId: root, postId })).toEqual({ bookmarked: true, hidden: false, notifying: true })
    const [theirs] = (await alice.as.query(api.modules.posts.posts.myFeed, { networkId: root, scope: "recents" })).items
    expect(theirs?.viewer).toEqual({ bookmarked: false, notifying: false })
    expect(await bob.as.mutation(api.modules.marks.marks.toggleMark, { networkId: root, postId, kind: "bookmark" })).toEqual({ marked: false })
  })

  it("liste les enregistrements et écarte ceux qui ont été retirés ; refuse INDISTINCTEMENT une publication interdite et une référence inventée", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const alice = await enter(t, root, "alice")
    const bob = await enter(t, root, "bob")
    const kept = await alice.as.mutation(api.modules.posts.posts.publish, { networkId: root, body: "Gardée" })
    const gone = await alice.as.mutation(api.modules.posts.posts.publish, { networkId: root, body: "Retirée" })
    for (const postId of [kept.postId, gone.postId]) await bob.as.mutation(api.modules.marks.marks.toggleMark, { networkId: root, postId, kind: "bookmark" })
    await alice.as.mutation(api.modules.posts.posts.remove, { networkId: root, postId: gone.postId })
    const listed = await bob.as.query(api.modules.marks.marks.paginateBookmarks, { networkId: root, paginationOpts: PAGE })
    expect(listed.page.map((row) => row.postId)).toEqual([kept.postId])
    expect(listed.page[0]?.author).toMatchObject({ handle: "alice" })
    const circle = await alice.as.mutation(api.modules.posts.posts.publish, { networkId: root, body: "Cercle", audience: "connections" })
    expect(engineErrorCode(await caught(bob.as.mutation(api.modules.marks.marks.toggleMark, { networkId: root, postId: circle.postId, kind: "bookmark" })))).toBe("notFound")
    const invented = await t.run(async (ctx) => {
      const id = await ctx.db.insert("posts", {
        networkId: root,
        authorPersonId: alice.personId,
        body: "Fantôme",
        audience: "public",
        visibility: "network",
        onRoot: true,
        status: "published",
        searchText: "",
        publishedAt: 1,
        createdAt: 1,
        updatedAt: 1,
      })
      await ctx.db.delete(id)
      return id
    })
    expect(engineErrorCode(await caught(bob.as.mutation(api.modules.marks.marks.toggleMark, { networkId: root, postId: invented, kind: "bookmark" })))).toBe("notFound")
  })

  it("referme enregistrements ET masquages quand l'audience est révoquée, ou quand le lecteur quitte le groupe", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const alice = await enter(t, root, "alice")
    const bob = await enter(t, root, "bob")
    const connectionId = await t.run(async (ctx) => {
      const [low, high] = alice.personId < bob.personId ? [alice.personId, bob.personId] : [bob.personId, alice.personId]
      return await ctx.db.insert("connections", {
        networkId: root,
        personIdLow: low,
        personIdHigh: high,
        requestedByPersonId: alice.personId,
        recipientPersonId: bob.personId,
        status: "accepted",
        requestedAt: 1,
        respondedAt: 1,
        updatedAt: 1,
      })
    })
    const circle = await alice.as.mutation(api.modules.posts.posts.publish, { networkId: root, body: "Cercle", audience: "connections" })
    const groupId = await t.run(async (ctx) => {
      const id = await ctx.db.insert("thematicGroups", { networkId: root, name: "Club", createdByPersonId: alice.personId, searchText: "Club", idempotencyKey: "g", createdAt: 1, updatedAt: 1 })
      for (const person of [alice, bob]) await ctx.db.insert("thematicGroupMembers", { networkId: root, groupId: id, personId: person.personId, role: "member", joinedAt: 1 })
      return id
    })
    const inGroup = await alice.as.mutation(api.modules.posts.posts.publish, { networkId: root, body: "Au club", audience: "group", groupId })
    for (const postId of [circle.postId, inGroup.postId]) {
      await bob.as.mutation(api.modules.marks.marks.toggleMark, { networkId: root, postId, kind: "bookmark" })
      await bob.as.mutation(api.modules.marks.marks.hidePost, { networkId: root, postId })
    }
    const lists = async () => [
      (await bob.as.query(api.modules.marks.marks.paginateBookmarks, { networkId: root, paginationOpts: PAGE })).page.length,
      (await bob.as.query(api.modules.marks.marks.paginateHiddenPosts, { networkId: root, paginationOpts: PAGE })).page.length,
    ]
    expect(await lists()).toEqual([2, 2])
    await t.run(async (ctx) => {
      await ctx.db.patch(connectionId, { status: "declined" })
      const row = await ctx.db
        .query("thematicGroupMembers")
        .withIndex("by_group_and_person", (q) => q.eq("groupId", groupId).eq("personId", bob.personId))
        .unique()
      if (row) await ctx.db.patch(row._id, { leftAt: Date.now() })
    })
    expect(await lists()).toEqual([0, 0])
  })

  it("pagine exhaustivement plus de 50 marques sans contourner la garde", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const alice = await enter(t, root, "alice")
    const bob = await enter(t, root, "bob")
    const ids = await t.run(async (ctx) => {
      const out: Id<"posts">[] = []
      for (let i = 0; i < 60; i += 1) {
        const postId = await ctx.db.insert("posts", {
          networkId: root,
          authorPersonId: alice.personId,
          body: `Publication ${i}`,
          audience: i === 0 ? "connections" : "public",
          visibility: "network",
          onRoot: true,
          status: "published",
          searchText: "",
          publishedAt: 1_700_000_000_000 + i,
          createdAt: 1,
          updatedAt: 1,
        })
        await ctx.db.insert("postMarks", { networkId: root, personId: bob.personId, postId, kind: "bookmark", createdAt: 1_700_000_000_000 + i })
        out.push(postId)
      }
      return out
    })
    const seen: string[] = []
    let cursor: string | null = null
    for (;;) {
      const page: { page: { postId: string }[]; isDone: boolean; continueCursor: string } = await bob.as.query(api.modules.marks.marks.paginateBookmarks, {
        networkId: root,
        paginationOpts: { numItems: 25, cursor },
      })
      seen.push(...page.page.map((row) => row.postId))
      if (page.isDone) break
      cursor = page.continueCursor
    }
    // 59 lisibles ; la publication réservée aux connexions est écartée, sans fuite.
    expect(new Set(seen)).toEqual(new Set(ids.slice(1)))
  })

  it("une marque vaut dans le réseau où elle est posée", async () => {
    const t = testConvex()
    const { root, testClosed } = await seed(t)
    const alice = await enter(t, root, "alice")
    const bob = await enter(t, root, "bob")
    await t.run(async (ctx) => {
      for (const person of [alice, bob]) {
        await ctx.db.insert("networkMemberships", { networkId: testClosed, personId: person.personId, status: "declaree", role: "member", joinedAt: 1, statusChangedAt: 1 })
      }
    })
    const { postId } = await alice.as.mutation(api.modules.posts.posts.publish, { networkId: testClosed, body: "Aussi sur ANTSIA", alsoOnRoot: true })
    await bob.as.mutation(api.modules.marks.marks.hidePost, { networkId: root, postId })
    expect(await recents(bob, root)).toEqual([])
    expect(await recents(bob, testClosed)).toEqual([postId])
  })
})

describe("mise en sourdine", () => {
  it("retire du fil TOUTES les publications de la personne ; se relit et se défait ; jamais soi-même", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const alice = await enter(t, root, "alice")
    const bob = await enter(t, root, "bob")
    await alice.as.mutation(api.modules.posts.posts.publish, { networkId: root, body: "Une" })
    await alice.as.mutation(api.modules.posts.posts.publish, { networkId: root, body: "Deux" })
    const own = await bob.as.mutation(api.modules.posts.posts.publish, { networkId: root, body: "La mienne" })
    await bob.as.mutation(api.modules.marks.marks.muteAuthor, { networkId: root, targetPersonId: alice.personId })
    expect(await recents(bob, root)).toEqual([own.postId])
    const mutes = await bob.as.query(api.modules.marks.marks.paginateMyMutes, { networkId: root, paginationOpts: PAGE })
    expect(mutes.page).toMatchObject([{ personId: alice.personId, person: { handle: "alice" } }])
    await bob.as.mutation(api.modules.marks.marks.unmuteAuthor, { networkId: root, targetPersonId: alice.personId })
    expect(await recents(bob, root)).toHaveLength(3)
    await bob.as.mutation(api.modules.marks.marks.muteAuthor, { networkId: root, targetPersonId: bob.personId })
    expect((await bob.as.query(api.modules.marks.marks.paginateMyMutes, { networkId: root, paginationOpts: PAGE })).page).toEqual([])
  })

  it("isAuthorMuted (PF-01) ne lit que MA sourdine, dans CE réseau, derrière la garde d'adhésion", async () => {
    const t = testConvex()
    const { root, testClosed } = await seed(t)
    const alice = await enter(t, root, "alice")
    const bob = await enter(t, root, "bob")
    const carol = await enter(t, root, "carol")
    await t.run(async (ctx) => {
      await ctx.db.insert("networkMemberships", { networkId: testClosed, personId: bob.personId, status: "declaree", role: "member", joinedAt: 1, statusChangedAt: 1 })
    })
    const muted = (who: Person, networkId: Id<"networks">) => who.as.query(api.modules.marks.marks.isAuthorMuted, { networkId, targetPersonId: alice.personId })
    expect(await muted(bob, root)).toBe(false)
    await bob.as.mutation(api.modules.marks.marks.muteAuthor, { networkId: root, targetPersonId: alice.personId })
    expect(await muted(bob, root)).toBe(true)
    // La sourdine d'un autre lecteur ne se lit pas ; celle de ce réseau ne vaut pas dans un autre.
    expect(await muted(carol, root)).toBe(false)
    expect(await muted(bob, testClosed)).toBe(false)
    await bob.as.mutation(api.modules.marks.marks.unmuteAuthor, { networkId: root, targetPersonId: alice.personId })
    expect(await muted(bob, root)).toBe(false)
    expect(engineErrorCode(await caught(t.query(api.modules.marks.marks.isAuthorMuted, { networkId: root, targetPersonId: alice.personId })))).toBe("unauthenticated")
    expect(engineErrorCode(await caught(muted(carol, testClosed)))).toBe("notFound")
  })
})
