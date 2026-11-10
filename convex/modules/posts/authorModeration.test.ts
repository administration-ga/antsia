// @vitest-environment edge-runtime
/**
 * FD-04 (issue antsia#108, demande de la session DIASPORALE) : l'état de modération d'une publication
 * est rendu à son AUTEUR seul — au retour de `posts.publish` (rejeu compris) et de
 * `pages.publishAsPage`, et sur la carte (`moderation`) servie par `getPost`, `personPosts` et
 * `myFeed`. Tout autre lecteur — membre, modérateur, co-signataire d'une page, lecteur public — ne
 * reçoit jamais le champ.
 */
import { engineErrorCode } from "@antsia/social-contracts/errors"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { api, internal } from "../../_generated/api"
import type { Id } from "../../_generated/dataModel"
import { SEED_CONFIRMATION } from "../../seeds/foundations"
import { testConvex } from "../../test.setup"

type T = ReturnType<typeof testConvex>
type Person = { as: ReturnType<T["withIdentity"]>; personId: Id<"persons">; handle: string }

const POSTS = api.modules.posts.posts
const T0 = Date.UTC(2026, 10, 10, 10, 0, 0)
const BLOCKED = "motinterdit"
const REASON = "Relu par l'équipe de modération : conforme."

beforeEach(() => {
  vi.stubEnv("CONVEX_CLOUD_URL", "http://127.0.0.1:3210")
  vi.useFakeTimers()
  vi.setSystemTime(T0)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

async function caught(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise
  } catch (error) {
    return error
  }
  return null
}

const codeOf = async (promise: Promise<unknown>) => engineErrorCode(await caught(promise))

async function enter(t: T, root: Id<"networks">, handle: string): Promise<Person> {
  vi.setSystemTime(Date.now() + 1000)
  const as = t.withIdentity({ subject: `auth-${handle}` })
  const personId = await as.mutation(api.modules.people.persons.ensureMyPerson, {})
  await as.mutation(api.modules.people.consents.recordConsent, { purpose: "social_profile", origin: "onboarding" })
  await as.mutation(api.modules.people.profile.publishMyProfile, { handle, displayName: handle })
  await as.mutation(api.modules.people.memberships.joinNetwork, { networkId: root })
  return { as, personId, handle }
}

async function patchMembership(t: T, networkId: Id<"networks">, person: Person, patch: { status?: "verifiee"; role?: "network_moderator" }) {
  await t.run(async (ctx) => {
    const membership = await ctx.db.query("networkMemberships").withIndex("by_network_and_person", (q) => q.eq("networkId", networkId).eq("personId", person.personId)).unique()
    if (membership) await ctx.db.patch(membership._id, patch)
  })
}

/** La racine, un terme bloqué, une autrice, un autre membre et un modérateur du réseau. */
async function world(t: T) {
  const { root } = await t.mutation(internal.seeds.foundations.run, { confirmNonProduction: SEED_CONFIRMATION })
  await t.run(async (ctx) => { await ctx.db.insert("blockedTerms", { networkId: root, term: BLOCKED, active: true, updatedAt: T0 }) })
  const alice = await enter(t, root, "alice")
  const bob = await enter(t, root, "bob")
  const mona = await enter(t, root, "mona")
  await patchMembership(t, root, mona, { role: "network_moderator" })
  return { root, alice, bob, mona }
}

/** La carte d'une publication dans chacune des trois lectures de son auteur. */
async function authorReads(author: Person, networkId: Id<"networks">, postId: Id<"posts">) {
  const single = await author.as.query(POSTS.getPost, { networkId, postId })
  const wall = (await author.as.query(POSTS.personPosts, { networkId, handle: author.handle })).items.find((item) => item._id === postId)
  const recents = (await author.as.query(POSTS.myFeed, { networkId, scope: "recents" })).items.find((item) => item._id === postId)
  const forYou = (await author.as.query(POSTS.myFeed, { networkId, scope: "pour_vous" })).items.find((item) => item._id === postId)
  return [single.moderation, wall?.moderation, recents?.moderation, forYou?.moderation]
}

describe("FD-04 — l'auteur apprend l'état de modération de sa publication", () => {
  it("retenue par un terme bloqué : `pending_review` au retour de l'envoi, au rejeu et dans getPost, personPosts et myFeed ; l'approbation la rend `published`", async () => {
    const t = testConvex()
    const { root, alice, bob, mona } = await world(t)
    const args = { networkId: root, body: `Un texte avec ${BLOCKED} dedans`, idempotencyKey: "fd04-retenue" }
    const sent = await alice.as.mutation(POSTS.publish, args)
    expect(sent).toEqual({ postId: sent.postId, created: true, moderation: "pending_review" })
    expect(await alice.as.mutation(POSTS.publish, args)).toEqual({ postId: sent.postId, created: false, moderation: "pending_review" })
    expect(await authorReads(alice, root, sent.postId)).toEqual(["pending_review", "pending_review", "pending_review", "pending_review"])

    // Un autre membre ne la lit pas ; le modérateur la lit, SANS le champ.
    expect(await codeOf(bob.as.query(POSTS.getPost, { networkId: root, postId: sent.postId }))).toBe("notFound")
    expect(await mona.as.query(POSTS.getPost, { networkId: root, postId: sent.postId })).not.toHaveProperty("moderation")

    // La décision : l'état suit, pour l'auteur ; les autres lecteurs n'ont toujours pas le champ.
    await mona.as.mutation(api.modules.moderation.cases.reviewContent, { networkId: root, target: { kind: "post", id: sent.postId }, approve: true, reason: REASON })
    expect(await alice.as.mutation(POSTS.publish, args)).toEqual({ postId: sent.postId, created: false, moderation: "published" })
    expect(await authorReads(alice, root, sent.postId)).toEqual(["published", "published", "published", "published"])
    expect(await bob.as.query(POSTS.getPost, { networkId: root, postId: sent.postId })).not.toHaveProperty("moderation")
    expect(await mona.as.query(POSTS.getPost, { networkId: root, postId: sent.postId })).not.toHaveProperty("moderation")
  })

  it("retenue par le plafond de liens du réseau (défaut : 2) ; une publication ordinaire rend `published`, à son auteur seulement", async () => {
    const t = testConvex()
    const { root, alice, bob } = await world(t)
    const links = await alice.as.mutation(POSTS.publish, { networkId: root, body: "https://a.example https://b.example https://c.example" })
    expect(links.moderation).toBe("pending_review")
    expect(await authorReads(alice, root, links.postId)).toEqual(["pending_review", "pending_review", "pending_review", "pending_review"])
    const plain = await alice.as.mutation(POSTS.publish, { networkId: root, body: "Bonjour à tous" })
    expect(plain.moderation).toBe("published")
    expect(await authorReads(alice, root, plain.postId)).toEqual(["published", "published", "published", "published"])
    // Le même mur et le même fil, lus par un autre membre : la carte n'a pas le champ.
    const wall = (await bob.as.query(POSTS.personPosts, { networkId: root, handle: "alice" })).items
    expect(wall.map((item) => item._id)).toEqual([plain.postId])
    expect(wall[0]).not.toHaveProperty("moderation")
    const feed = (await bob.as.query(POSTS.myFeed, { networkId: root, scope: "recents" })).items.find((item) => item._id === plain.postId)
    expect(feed).toBeDefined()
    expect(feed).not.toHaveProperty("moderation")
  })

  it("une modification retenue se dit à l'auteur ; refusée par la décision, la publication ne se lit plus et son rejeu ne se dit jamais « publiée »", async () => {
    const t = testConvex()
    const { root, alice, bob, mona } = await world(t)
    const args = { networkId: root, body: "Version sage", idempotencyKey: "fd04-edition" }
    const { postId } = await alice.as.mutation(POSTS.publish, args)
    await alice.as.mutation(POSTS.edit, { networkId: root, postId, body: `Version avec ${BLOCKED}` })
    expect((await alice.as.query(POSTS.getPost, { networkId: root, postId })).moderation).toBe("pending_review")
    expect(await codeOf(bob.as.query(POSTS.getPost, { networkId: root, postId }))).toBe("notFound")
    await mona.as.mutation(api.modules.moderation.cases.reviewContent, { networkId: root, target: { kind: "post", id: postId }, approve: false, reason: REASON })
    expect(await codeOf(alice.as.query(POSTS.getPost, { networkId: root, postId }))).toBe("notFound")
    expect(await alice.as.mutation(POSTS.publish, args)).toEqual({ postId, created: false, moderation: "pending_review" })
  })

  it("sans ligne d'état (publication antérieure à la modération), l'auteur lit `published`", async () => {
    const t = testConvex()
    const { root, alice, bob } = await world(t)
    const postId = await t.run(async (ctx) => await ctx.db.insert("posts", { networkId: root, authorPersonId: alice.personId, body: "Ancienne", audience: "public", visibility: "network", onRoot: true, status: "published", searchText: "Ancienne", publishedAt: T0, createdAt: T0, updatedAt: T0 }))
    expect((await alice.as.query(POSTS.getPost, { networkId: root, postId })).moderation).toBe("published")
    expect(await bob.as.query(POSTS.getPost, { networkId: root, postId })).not.toHaveProperty("moderation")
  })

  it("le lecteur PUBLIC n'a jamais le champ : la projection publique reste celle d'aujourd'hui, même lue par l'auteur", async () => {
    const t = testConvex()
    const { root, alice } = await world(t)
    const { postId, moderation } = await alice.as.mutation(POSTS.publish, { networkId: root, body: "Ouverte à tous", alsoOnRoot: true })
    expect(moderation).toBe("published")
    const anonymous = await t.query(api.modules.public.projections.getPost, { networkId: root, postId })
    expect(anonymous).toMatchObject({ id: postId, body: "Ouverte à tous" })
    expect(anonymous).not.toHaveProperty("moderation")
    const byAuthor = await alice.as.query(api.modules.public.projections.getPost, { networkId: root, postId })
    expect(byAuthor).toMatchObject({ id: postId })
    expect(byAuthor).not.toHaveProperty("moderation")
  })
})

describe("FD-04 — publication de page : « l'auteur » est le signataire qui l'a déposée, tant qu'il reste signataire vivant", () => {
  it("le déposant reçoit l'état au retour et sur la carte ; un co-signataire et un lecteur, jamais ; retenue, elle ne se lit que de son déposant", async () => {
    const t = testConvex()
    const { root, alice, bob, mona } = await world(t)
    await patchMembership(t, root, alice, { status: "verifiee" })
    const { pageId } = await alice.as.mutation(api.modules.pages.pages.createPage, { networkId: root, name: "Association des Gabonais de Lyon", ownerKind: "association" })
    await alice.as.mutation(api.modules.pages.signatories.grantPageRole, { networkId: root, pageId, handle: "bob", role: "signatory" })
    await bob.as.mutation(api.modules.pages.signatories.respondToPageInvitation, { networkId: root, pageId, accept: true })

    const plain = await alice.as.mutation(api.modules.pages.pages.publishAsPage, { networkId: root, pageId, body: "Assemblée générale samedi" })
    expect(plain).toEqual({ postId: plain.postId, created: true, moderation: "published" })
    expect((await alice.as.query(POSTS.getPost, { networkId: root, postId: plain.postId })).moderation).toBe("published")
    expect(await bob.as.query(POSTS.getPost, { networkId: root, postId: plain.postId })).not.toHaveProperty("moderation")
    expect(await mona.as.query(POSTS.getPost, { networkId: root, postId: plain.postId })).not.toHaveProperty("moderation")

    const held = await alice.as.mutation(api.modules.pages.pages.publishAsPage, { networkId: root, pageId, body: `Annonce avec ${BLOCKED}`, idempotencyKey: "fd04-page" })
    expect(held.moderation).toBe("pending_review")
    expect(await alice.as.mutation(api.modules.pages.pages.publishAsPage, { networkId: root, pageId, body: `Annonce avec ${BLOCKED}`, idempotencyKey: "fd04-page" })).toEqual({ postId: held.postId, created: false, moderation: "pending_review" })
    expect((await alice.as.query(POSTS.getPost, { networkId: root, postId: held.postId })).moderation).toBe("pending_review")
    expect(await codeOf(bob.as.query(POSTS.getPost, { networkId: root, postId: held.postId }))).toBe("notFound")
    expect(await mona.as.query(POSTS.getPost, { networkId: root, postId: held.postId })).not.toHaveProperty("moderation")

    // Le déposant qui perd sa signature ne garde rien : plus de champ sur la publication de la page.
    await t.run(async (ctx) => {
      const rows = await ctx.db.query("pageSignatories").withIndex("by_page_person", (q) => q.eq("pageId", pageId).eq("personId", alice.personId)).take(1)
      for (const row of rows) await ctx.db.delete(row._id)
    })
    expect(await alice.as.query(POSTS.getPost, { networkId: root, postId: plain.postId })).not.toHaveProperty("moderation")
  })
})
