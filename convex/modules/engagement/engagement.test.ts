// @vitest-environment edge-runtime
// Dupliqué de socle/convex/modules/reseauPersonnel/reseauPersonnel.test.ts (cas `engagement.*`, mentions et abonnés, l. 582-718 et 1399-1592) @ ad2e7fdc2 — adaptations : personnes et réseaux ; commentaires paginés par racine (D03) au lieu de `listComments` ; décomptes par fragments et agrégat (D01 : la publication n'est jamais réécrite) ; abonnés servis par la diffusion par lots (D08) ; cas de suspension (ADR-0087) rendus au statut d'adhésion par le constructeur ; tests neufs : 150 racines paginées, réponses paginées et décomptées, commentaires d'un auteur bloqué écartés.
import { engineErrorCode } from "@antsia/social-contracts/errors"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { api, internal } from "../../_generated/api"
import type { Id } from "../../_generated/dataModel"
import { SEED_CONFIRMATION } from "../../seeds/foundations"
import { testConvex } from "../../test.setup"

type T = ReturnType<typeof testConvex>
type Person = { as: ReturnType<T["withIdentity"]>; personId: Id<"persons"> }

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
  return { as, personId }
}

async function connect(t: T, networkId: Id<"networks">, a: Person, b: Person): Promise<Id<"connections">> {
  return await t.run(async (ctx) => {
    const [low, high] = a.personId < b.personId ? [a.personId, b.personId] : [b.personId, a.personId]
    return await ctx.db.insert("connections", { networkId, personIdLow: low, personIdHigh: high, requestedByPersonId: a.personId, recipientPersonId: b.personId, status: "accepted", requestedAt: 1, respondedAt: 1, updatedAt: 1 })
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

async function bellKinds(person: Person, networkId: Id<"networks">): Promise<string[]> {
  const page = await person.as.query(api.modules.notifications.bell.paginateNotifications, { networkId, paginationOpts: { numItems: 50, cursor: null } })
  return page.page.map((row) => row.kind)
}

async function comments(reader: Person, networkId: Id<"networks">, postId: Id<"posts">, numItems = 50) {
  return await reader.as.query(api.modules.engagement.engagement.paginateComments, { networkId, postId, paginationOpts: { numItems, cursor: null } })
}

describe("réactions", () => {
  it("bascule, change, puis retire — jamais n'empile ; l'auteur est prévenu ; la publication n'est jamais réécrite (D01)", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const alice = await enter(t, root, "alice")
    const bob = await enter(t, root, "bob")
    const { postId } = await alice.as.mutation(api.modules.posts.posts.publish, { networkId: root, body: "Réagissez" })
    const before = await t.run(async (ctx) => ctx.db.get(postId))
    const react = (kind: "like" | "bravo") => bob.as.mutation(api.modules.engagement.engagement.toggleReaction, { networkId: root, postId, kind })
    expect(await react("like")).toEqual({ mine: "like" })
    expect(await react("bravo")).toEqual({ mine: "bravo" })
    const read = await alice.as.query(api.modules.posts.posts.getPost, { networkId: root, postId })
    expect(read.reactions).toMatchObject({ total: 1, counts: { like: 0, bravo: 1 } })
    expect(await react("bravo")).toEqual({ mine: null })
    expect((await alice.as.query(api.modules.posts.posts.getPost, { networkId: root, postId })).reactions.total).toBe(0)
    expect(await bellKinds(alice, root)).toEqual(["post_reaction"])
    expect(await t.run(async (ctx) => ctx.db.get(postId))).toEqual(before)
  })

  it("réagir à une publication qu'on n'a pas le droit de voir est refusé", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const alice = await enter(t, root, "alice")
    const bob = await enter(t, root, "bob")
    const { postId } = await alice.as.mutation(api.modules.posts.posts.publish, { networkId: root, body: "Cercle", audience: "connections" })
    expect(await codeOf(bob.as.mutation(api.modules.engagement.engagement.toggleReaction, { networkId: root, postId, kind: "like" }))).toBe("notFound")
  })
})

describe("commentaires", () => {
  it("les réponses restent à UN seul niveau ; répondre prévient la personne à qui l'on répond", async () => {
    vi.useFakeTimers()
    const t = testConvex()
    const { root } = await seed(t)
    const alice = await enter(t, root, "alice")
    const bob = await enter(t, root, "bob")
    const carol = await enter(t, root, "carol")
    const { postId } = await alice.as.mutation(api.modules.posts.posts.publish, { networkId: root, body: "Discutons" })
    const rootComment = await bob.as.mutation(api.modules.engagement.engagement.comment, { networkId: root, postId, body: "Racine" })
    const reply = await carol.as.mutation(api.modules.engagement.engagement.comment, { networkId: root, postId, body: "Réponse", parentCommentId: rootComment.commentId })
    await alice.as.mutation(api.modules.engagement.engagement.comment, { networkId: root, postId, body: "Réponse à la réponse", parentCommentId: reply.commentId })
    await t.finishAllScheduledFunctions(vi.runAllTimers)
    const listed = await comments(bob, root, postId)
    expect(listed.page).toHaveLength(1)
    expect(listed.page[0]).toMatchObject({ commentId: rootComment.commentId, replyCount: 2 })
    expect(listed.page[0]?.replies.map((row) => row.body)).toEqual(["Réponse", "Réponse à la réponse"])
    // Carol a été répondue par Alice : elle est prévenue, bien que la réponse se range sous la racine de Bob.
    expect(await bellKinds(carol, root)).toEqual(["post_comment"])
    expect((await alice.as.query(api.modules.posts.posts.getPost, { networkId: root, postId })).commentCount).toBe(3)
  })

  it("l'auteur de la publication peut retirer un commentaire, un tiers non ; le décompte suit ; un retiré n'accepte plus de réponse", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const alice = await enter(t, root, "alice")
    const bob = await enter(t, root, "bob")
    const carol = await enter(t, root, "carol")
    const { postId } = await alice.as.mutation(api.modules.posts.posts.publish, { networkId: root, body: "Chez moi" })
    const { commentId } = await bob.as.mutation(api.modules.engagement.engagement.comment, { networkId: root, postId, body: "Un avis" })
    expect(await codeOf(carol.as.mutation(api.modules.engagement.engagement.removeComment, { networkId: root, commentId }))).toBe("notFound")
    await alice.as.mutation(api.modules.engagement.engagement.removeComment, { networkId: root, commentId })
    await alice.as.mutation(api.modules.engagement.engagement.removeComment, { networkId: root, commentId })
    expect((await alice.as.query(api.modules.posts.posts.getPost, { networkId: root, postId })).commentCount).toBe(0)
    expect((await comments(carol, root, postId)).page).toEqual([])
    expect(await codeOf(carol.as.mutation(api.modules.engagement.engagement.comment, { networkId: root, postId, body: "Trop tard", parentCommentId: commentId }))).toBe("notFound")
  })

  it("retirer une racine retire ses réponses : le compte reste égal à ce qui se lit", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const alice = await enter(t, root, "alice")
    const bob = await enter(t, root, "bob")
    const carol = await enter(t, root, "carol")
    const { postId } = await alice.as.mutation(api.modules.posts.posts.publish, { networkId: root, body: "Fil" })
    const head = await bob.as.mutation(api.modules.engagement.engagement.comment, { networkId: root, postId, body: "Racine" })
    const reply = await carol.as.mutation(api.modules.engagement.engagement.comment, { networkId: root, postId, body: "Réponse", parentCommentId: head.commentId })
    const other = await carol.as.mutation(api.modules.engagement.engagement.comment, { networkId: root, postId, body: "Autre racine" })
    expect((await alice.as.query(api.modules.posts.posts.getPost, { networkId: root, postId })).commentCount).toBe(3)
    await bob.as.mutation(api.modules.engagement.engagement.removeComment, { networkId: root, commentId: head.commentId })
    expect((await comments(alice, root, postId)).page.map((row) => row.commentId)).toEqual([other.commentId])
    expect((await alice.as.query(api.modules.posts.posts.getPost, { networkId: root, postId })).commentCount).toBe(1)
    expect(await t.run(async (ctx) => (await ctx.db.get(reply.commentId))?.status)).toBe("removed")
    // La réponse survivante ne rouvre pas la conversation : répondre sous une racine retirée se refuse.
    expect(await codeOf(alice.as.mutation(api.modules.engagement.engagement.comment, { networkId: root, postId, body: "Encore", parentCommentId: reply.commentId }))).toBe("notFound")
  })

  it("une racine aux réponses nombreuses les retire par lots, et nul ne répond sous elle entre deux lots", async () => {
    vi.useFakeTimers()
    const t = testConvex()
    const { root } = await seed(t)
    const alice = await enter(t, root, "alice")
    const bob = await enter(t, root, "bob")
    const { postId } = await alice.as.mutation(api.modules.posts.posts.publish, { networkId: root, body: "Fil animé" })
    const head = await bob.as.mutation(api.modules.engagement.engagement.comment, { networkId: root, postId, body: "Racine" })
    const replyIds = await t.run(async (ctx) => {
      const ids: Id<"postComments">[] = []
      for (let i = 0; i < 230; i += 1) {
        ids.push(await ctx.db.insert("postComments", { networkId: root, postId, authorPersonId: bob.personId, body: `Réponse ${i}`, parentCommentId: head.commentId, status: "published", createdAt: 1_800_000_000_000 + i, updatedAt: 1 }))
      }
      return ids
    })
    await alice.as.mutation(api.modules.engagement.engagement.removeComment, { networkId: root, commentId: head.commentId })
    const live = async () => await t.run(async (ctx) => (await ctx.db.query("postComments").withIndex("by_post_parent_status_createdAt", (q) => q.eq("postId", postId).eq("parentCommentId", head.commentId).eq("status", "published")).take(300)).length)
    expect(await live()).toBe(130)
    expect(await codeOf(alice.as.mutation(api.modules.engagement.engagement.comment, { networkId: root, postId, body: "Entre deux lots", parentCommentId: replyIds[229]! }))).toBe("notFound")
    await t.finishAllScheduledFunctions(vi.runAllTimers)
    expect(await live()).toBe(0)
  })

  it("lister les commentaires exige de voir la publication ; 150 racines se paginent sans perte (D03)", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const alice = await enter(t, root, "alice")
    const bob = await enter(t, root, "bob")
    const stranger = await enter(t, root, "inconnu")
    await connect(t, root, alice, bob)
    const { postId } = await alice.as.mutation(api.modules.posts.posts.publish, { networkId: root, body: "Entre nous", audience: "connections" })
    await t.run(async (ctx) => {
      for (let i = 0; i < 150; i += 1) {
        await ctx.db.insert("postComments", { networkId: root, postId, authorPersonId: bob.personId, body: `Racine ${i}`, status: "published", createdAt: 1_700_000_000_000 + i, updatedAt: 1 })
      }
    })
    expect(await codeOf(comments(stranger, root, postId))).toBe("notFound")
    const seen: string[] = []
    let cursor: string | null = null
    for (;;) {
      const page: { page: { body: string }[]; isDone: boolean; continueCursor: string } = await alice.as.query(api.modules.engagement.engagement.paginateComments, {
        networkId: root,
        postId,
        paginationOpts: { numItems: 40, cursor },
      })
      seen.push(...page.page.map((row) => row.body))
      if (page.isDone) break
      cursor = page.continueCursor
    }
    expect(seen).toEqual(Array.from({ length: 150 }, (_, i) => `Racine ${i}`))
  })

  it("les réponses au-delà de l'aperçu se paginent ; les commentaires d'un auteur bloqué sont écartés", async () => {
    const t = testConvex()
    const { root } = await seed(t)
    const alice = await enter(t, root, "alice")
    const bob = await enter(t, root, "bob")
    const carol = await enter(t, root, "carol")
    const { postId } = await alice.as.mutation(api.modules.posts.posts.publish, { networkId: root, body: "Fil" })
    const head = await bob.as.mutation(api.modules.engagement.engagement.comment, { networkId: root, postId, body: "Racine" })
    await t.run(async (ctx) => {
      for (let i = 0; i < 5; i += 1) {
        await ctx.db.insert("postComments", { networkId: root, postId, authorPersonId: carol.personId, body: `Réponse ${i}`, parentCommentId: head.commentId, status: "published", createdAt: 1_800_000_000_000 + i, updatedAt: 1 })
      }
    })
    const [listed] = (await comments(alice, root, postId)).page
    expect(listed?.replies).toHaveLength(3)
    const all = await alice.as.query(api.modules.engagement.engagement.paginateReplies, { networkId: root, postId, commentId: head.commentId, paginationOpts: { numItems: 10, cursor: null } })
    expect(all.page.map((row) => row.body)).toEqual(["Réponse 0", "Réponse 1", "Réponse 2", "Réponse 3", "Réponse 4"])
    await alice.as.mutation(api.modules.graph.connections.blockPerson, { networkId: root, targetPersonId: carol.personId })
    expect((await comments(alice, root, postId)).page[0]?.replies).toEqual([])
  })
})

describe("AS-10 / PG-08 — l'équipe d'une page retire les commentaires sous ses publications", () => {
  const E = api.modules.engagement.engagement
  const SIG = api.modules.pages.signatories

  async function verified(t: T, networkId: Id<"networks">, person: Person): Promise<void> {
    await t.run(async (ctx) => {
      const membership = await ctx.db.query("networkMemberships").withIndex("by_network_and_person", (q) => q.eq("networkId", networkId).eq("personId", person.personId)).unique()
      await ctx.db.patch(membership!._id, { status: "verifiee" })
    })
  }

  /** Alice administre une page ; Bob y est modérateur, Dora signataire ; Eve commente, Frank lit. */
  async function pageCast(t: T) {
    const { root } = await seed(t)
    const alice = await enter(t, root, "alice")
    await verified(t, root, alice)
    const { pageId } = await alice.as.mutation(api.modules.pages.pages.createPage, { networkId: root, name: "Association des Gabonais", ownerKind: "association" })
    const team = async (handle: string, role: "signatory" | "moderator") => {
      const person = await enter(t, root, handle)
      await alice.as.mutation(SIG.grantPageRole, { networkId: root, pageId, handle, role })
      await person.as.mutation(SIG.respondToPageInvitation, { networkId: root, pageId, accept: true })
      return person
    }
    const bob = await team("bob", "moderator")
    const dora = await team("dora", "signatory")
    const eve = await enter(t, root, "eve")
    const frank = await enter(t, root, "frank")
    return { root, pageId, alice, bob, dora, eve, frank }
  }

  async function postJournal(t: T, postId: Id<"posts">) {
    return await t.run(async (ctx) => await ctx.db.query("engineAudit").withIndex("by_subject_at", (q) => q.eq("subjectTable", "posts").eq("subjectId", postId)).take(20))
  }

  it("un modérateur vivant retire le commentaire d'autrui — journalisé, sans avis — et `canRemove` le dit à qui le peut", async () => {
    const t = testConvex()
    const { root, pageId, alice, bob, eve, frank } = await pageCast(t)
    const { postId } = await alice.as.mutation(api.modules.pages.pages.publishAsPage, { networkId: root, pageId, body: "Communiqué de l'association" })
    const evesComment = await eve.as.mutation(E.comment, { networkId: root, postId, body: "Un avis déplacé" })
    const frankReply = await frank.as.mutation(E.comment, { networkId: root, postId, body: "Une réponse", parentCommentId: evesComment.commentId })
    const bobsComment = await bob.as.mutation(E.comment, { networkId: root, postId, body: "Merci de rester courtois" })

    const asFrank = (await comments(frank, root, postId)).page
    expect(asFrank.find((row) => row.commentId === evesComment.commentId)).not.toHaveProperty("canRemove")
    expect(asFrank.find((row) => row.commentId === evesComment.commentId)?.replies[0]).toMatchObject({ commentId: frankReply.commentId, canRemove: true })
    const asBob = (await comments(bob, root, postId)).page
    expect(asBob.map((row) => row.canRemove)).toEqual([true, true])
    expect(asBob[0]?.replies.map((row) => row.canRemove)).toEqual([true])
    const replies = await bob.as.query(E.paginateReplies, { networkId: root, postId, commentId: evesComment.commentId, paginationOpts: { numItems: 10, cursor: null } })
    expect(replies.page.map((row) => row.canRemove)).toEqual([true])

    await bob.as.mutation(E.removeComment, { networkId: root, commentId: evesComment.commentId })
    // Rejouer ne journalise rien de plus ; retirer son propre commentaire n'est pas une décision.
    await bob.as.mutation(E.removeComment, { networkId: root, commentId: evesComment.commentId })
    await bob.as.mutation(E.removeComment, { networkId: root, commentId: bobsComment.commentId })
    expect(await postJournal(t, postId)).toMatchObject([
      { action: "page.comment_remove", capacity: "member", actorPersonId: bob.personId, networkId: root, details: { pageId, role: "moderator", commentId: evesComment.commentId } },
    ])
    expect((await comments(frank, root, postId)).page).toEqual([])
    expect(await bellKinds(eve, root)).not.toContain("moderation_decision")

    // L'administratrice retire au titre de `page_admin`.
    const another = await frank.as.mutation(E.comment, { networkId: root, postId, body: "Encore un avis" })
    await alice.as.mutation(E.removeComment, { networkId: root, commentId: another.commentId })
    expect((await postJournal(t, postId)).at(-1)).toMatchObject({ action: "page.comment_remove", capacity: "page_admin", actorPersonId: alice.personId, details: { role: "admin", commentId: another.commentId } })
  })

  it("le droit est ACTUEL : l'auteur historique d'une publication de page, retiré de l'équipe, ne retire plus rien", async () => {
    const t = testConvex()
    const { root, pageId, alice, bob, dora, eve, frank } = await pageCast(t)
    const { postId } = await dora.as.mutation(api.modules.pages.pages.publishAsPage, { networkId: root, pageId, body: "Communiqué signé par Dora" })
    const first = await eve.as.mutation(E.comment, { networkId: root, postId, body: "Premier avis" })
    expect((await comments(dora, root, postId)).page[0]?.canRemove).toBe(true)
    await alice.as.mutation(SIG.revokePageRole, { networkId: root, pageId, personId: dora.personId })
    await alice.as.mutation(SIG.revokePageRole, { networkId: root, pageId, personId: bob.personId })
    expect((await comments(dora, root, postId)).page[0]).not.toHaveProperty("canRemove")
    expect(await codeOf(dora.as.mutation(E.removeComment, { networkId: root, commentId: first.commentId }))).toBe("notFound")
    expect(await codeOf(bob.as.mutation(E.removeComment, { networkId: root, commentId: first.commentId }))).toBe("notFound")
    expect(await codeOf(frank.as.mutation(E.removeComment, { networkId: root, commentId: first.commentId }))).toBe("notFound")
    expect(await postJournal(t, postId)).toEqual([])
  })

  it("le droit de l'équipe ne vaut que dans le réseau de la page : lu depuis la racine, il ne s'offre ni ne s'exerce", async () => {
    const t = testConvex()
    const { root, testClosed } = await seed(t)
    const alice = await enter(t, root, "alice")
    const bob = await enter(t, root, "bob")
    const eve = await enter(t, root, "eve")
    // Une page d'un réseau fermé dont les communiqués se lisent aussi depuis la racine (règle `root`).
    const pageId = await t.run(async (ctx) => {
      for (const person of [alice, bob]) await ctx.db.insert("networkMemberships", { networkId: testClosed, personId: person.personId, status: "declaree", role: "member", joinedAt: 1, statusChangedAt: 1 })
      const id = await ctx.db.insert("pages", { networkId: testClosed, handle: "page-fermee-racine", name: "Page fermée lue à la racine", ownerKind: "association", trust: "community", trustRank: 0, visibility: "root", onRoot: true, status: "active", searchText: "page fermee", createdAt: 1, updatedAt: 1 })
      await ctx.db.insert("pageSignatories", { networkId: testClosed, pageId: id, personId: alice.personId, role: "admin", acceptedAt: 1, createdAt: 1, updatedAt: 1 })
      await ctx.db.insert("pageSignatories", { networkId: testClosed, pageId: id, personId: bob.personId, role: "moderator", acceptedAt: 1, createdAt: 1, updatedAt: 1 })
      return id
    })
    const { postId } = await alice.as.mutation(api.modules.pages.pages.publishAsPage, { networkId: testClosed, pageId, body: "Communiqué lu partout" })
    const { commentId } = await eve.as.mutation(E.comment, { networkId: root, postId, body: "Un avis depuis la racine" })

    expect((await comments(bob, root, postId)).page[0]).not.toHaveProperty("canRemove")
    expect(await codeOf(bob.as.mutation(E.removeComment, { networkId: root, commentId }))).toBe("notFound")
    expect(await postJournal(t, postId)).toEqual([])
    // Dans le réseau de la page, le même modérateur le peut ; l'autrice retire toujours le sien d'où elle lit.
    expect((await comments(bob, testClosed, postId)).page[0]?.canRemove).toBe(true)
    expect((await comments(eve, root, postId)).page[0]?.canRemove).toBe(true)
    await bob.as.mutation(E.removeComment, { networkId: testClosed, commentId })
    expect(await postJournal(t, postId)).toMatchObject([{ action: "page.comment_remove", networkId: testClosed, details: { role: "moderator" } }])
  })

  it("sous une publication personnelle, rien ne change : l'auteur retire sans journal, `canRemove` le lui dit", async () => {
    const t = testConvex()
    const { root, bob, eve, frank } = await pageCast(t)
    const { postId } = await eve.as.mutation(api.modules.posts.posts.publish, { networkId: root, body: "Chez Eve" })
    const { commentId } = await frank.as.mutation(E.comment, { networkId: root, postId, body: "Bonjour" })
    expect((await comments(eve, root, postId)).page[0]?.canRemove).toBe(true)
    expect((await comments(bob, root, postId)).page[0]).not.toHaveProperty("canRemove")
    expect(await codeOf(bob.as.mutation(E.removeComment, { networkId: root, commentId }))).toBe("notFound")
    await eve.as.mutation(E.removeComment, { networkId: root, commentId })
    expect(await postJournal(t, postId)).toEqual([])
  })
})

describe("cloches des commentaires", () => {
  it("une citation en commentaire prévient ; sous une publication qu'on ne voit pas, elle ne sonne pas", async () => {
    vi.useFakeTimers()
    const t = testConvex()
    const { root } = await seed(t)
    const alice = await enter(t, root, "alice")
    const bob = await enter(t, root, "bob")
    const carol = await enter(t, root, "carol")
    const dave = await enter(t, root, "dave")
    await connect(t, root, alice, bob)
    const open = await alice.as.mutation(api.modules.posts.posts.publish, { networkId: root, body: "Public" })
    await bob.as.mutation(api.modules.engagement.engagement.comment, { networkId: root, postId: open.postId, body: "Regarde @carol" })
    const circle = await alice.as.mutation(api.modules.posts.posts.publish, { networkId: root, body: "Cercle", audience: "connections" })
    await bob.as.mutation(api.modules.engagement.engagement.comment, { networkId: root, postId: circle.postId, body: "Et toi @dave" })
    await t.finishAllScheduledFunctions(vi.runAllTimers)
    expect(await bellKinds(carol, root)).toEqual(["mention"])
    expect(await bellKinds(dave, root)).toEqual([])
    expect((await bellKinds(alice, root)).sort()).toEqual(["post_comment", "post_comment"])
  })

  it("un abonné aux commentaires est prévenu (diffusion par lots) — et plus après la révocation de l'audience", async () => {
    vi.useFakeTimers()
    const t = testConvex()
    const { root } = await seed(t)
    const alice = await enter(t, root, "alice")
    const bob = await enter(t, root, "bob")
    const watcher = await enter(t, root, "veilleur")
    const connectionId = await connect(t, root, alice, watcher)
    await connect(t, root, alice, bob)
    const { postId } = await alice.as.mutation(api.modules.posts.posts.publish, { networkId: root, body: "Suivez", audience: "connections" })
    await watcher.as.mutation(api.modules.marks.marks.toggleMark, { networkId: root, postId, kind: "notify" })
    await bob.as.mutation(api.modules.engagement.engagement.comment, { networkId: root, postId, body: "Premier" })
    await t.finishAllScheduledFunctions(vi.runAllTimers)
    expect(await bellKinds(watcher, root)).toEqual(["post_comment"])
    await watcher.as.mutation(api.modules.notifications.bell.markAllRead, { networkId: root })
    await t.run(async (ctx) => ctx.db.patch(connectionId, { status: "declined" }))
    await bob.as.mutation(api.modules.engagement.engagement.comment, { networkId: root, postId, body: "Second" })
    await t.finishAllScheduledFunctions(vi.runAllTimers)
    expect(await watcher.as.query(api.modules.notifications.bell.unreadCount, { networkId: root })).toEqual({ count: 0, capped: false })
  })
})
