// @vitest-environment edge-runtime
import { afterEach, describe, expect, it, vi } from "vitest"
import { engineErrorCode } from "@antsia/social-contracts/errors"

import { api, components, internal } from "../../_generated/api"
import type { Doc, Id } from "../../_generated/dataModel"
import { SEED_CONFIRMATION } from "../../seeds/foundations"
import { createTestSession, testConvex } from "../../test.setup"

type T = ReturnType<typeof testConvex>
type Person = { as: ReturnType<T["withIdentity"]>; personId: Id<"persons">; handle: string }
const PUBLIC = api.modules.public.projections
const POSTS = api.modules.posts.posts
const PAGE = { cursor: null, numItems: 20 }

afterEach(() => vi.useRealTimers())

async function member(t: T, root: Id<"networks">, handle: string, child?: Id<"networks">): Promise<Person> {
  const as = t.withIdentity({ subject: `public-test-${handle}` })
  const personId = await as.mutation(api.modules.people.persons.ensureMyPerson, {})
  await as.mutation(api.modules.people.consents.recordConsent, { purpose: "social_profile", origin: "onboarding" })
  await as.mutation(api.modules.people.profile.publishMyProfile, { handle, displayName: handle })
  await as.mutation(api.modules.people.memberships.joinNetwork, { networkId: root })
  if (child) {
    await as.mutation(api.modules.people.memberships.joinNetwork, { networkId: child, facet: { values: { countryOfResidence: "FR" }, visibilities: {} } })
    await t.run(async (ctx) => {
      const row = await ctx.db.query("networkMemberships").withIndex("by_network_and_person", (q) => q.eq("networkId", child).eq("personId", personId)).unique()
      if (row) await ctx.db.patch(row._id, { status: "declaree" })
    })
  }
  return { as, personId, handle }
}

async function fixture() {
  const t = testConvex()
  const { root, testClosed } = await t.mutation(internal.seeds.foundations.run, { confirmNonProduction: SEED_CONFIRMATION })
  const author = await member(t, root, "auteur", testClosed)
  const reader = await member(t, root, "lecteur")
  return { t, root, child: testClosed, author, reader }
}

async function rowPost(t: T, networkId: Id<"networks">, author: Person, extra: Partial<Doc<"posts">> = {}) {
  const now = Date.now()
  return t.run(async (ctx) => ctx.db.insert("posts", {
    networkId, authorPersonId: author.personId, body: "Publication choisie", audience: "public", visibility: "root", onRoot: true,
    status: "published", searchText: "publication choisie", publishedAt: now, createdAt: now, updatedAt: now, ...extra,
  }))
}

async function pageRecord(t: T, networkId: Id<"networks">, handle: string, extra: Partial<Doc<"pages">> = {}) {
  const now = Date.now()
  return t.run(async (ctx) => ctx.db.insert("pages", { networkId, handle, name: "Direction de fixture", ownerKind: "institution", trust: "official", trustRank: 2, visibility: "root", onRoot: true, status: "active", searchText: "direction fixture", createdAt: now, updatedAt: now, ...extra }))
}

async function refused(promise: Promise<unknown>) {
  try { await promise; return null } catch (error) { return engineErrorCode(error) }
}

describe("PA8 — choix public explicite et contextes séparés", () => {
  it("n'expose aucun ancien natif network ; geste nouveau, province volontaire et idempotence", async () => {
    const f = await fixture()
    const old = await f.author.as.mutation(POSTS.publish, { networkId: f.root, body: "Natif membre" })
    const chosen = await f.author.as.mutation(POSTS.publish, { networkId: f.root, body: "Natif choisi #gabon", alsoOnRoot: true, province: "estuaire", idempotencyKey: "choix-public" })
    expect(await f.t.query(PUBLIC.getPost, { networkId: f.root, postId: old.postId })).toBe(null)
    expect(await f.t.query(PUBLIC.getPost, { networkId: f.root, postId: chosen.postId })).toMatchObject({ id: chosen.postId, province: "estuaire", tags: ["gabon"], origin: { slug: "antsia" } })
    await f.author.as.mutation(POSTS.publish, { networkId: f.root, body: "Rejeu différent", alsoOnRoot: false, idempotencyKey: "choix-public" })
    expect((await f.t.run((ctx) => ctx.db.get(chosen.postId)))?.visibility).toBe("root")
    expect(await refused(f.author.as.query(POSTS.getPost, { networkId: f.child, postId: chosen.postId }))).toBe("notFound")
    const national = await f.reader.as.query(api.modules.discovery.discovery.rootFeed, { networkId: f.root, paginationOpts: PAGE })
    expect(national.page.map((post) => post._id)).toEqual(expect.arrayContaining([old.postId, chosen.postId]))
  })

  it("un enfant network reste fermé, root s'ouvre puis son retrait se propage", async () => {
    const f = await fixture()
    const hidden = await f.author.as.mutation(POSTS.publish, { networkId: f.child, body: "Contexte réservé" })
    const chosen = await f.author.as.mutation(POSTS.publish, { networkId: f.child, body: "Diaspora choisie", alsoOnRoot: true })
    expect(await f.t.query(PUBLIC.getPost, { networkId: f.root, postId: hidden.postId })).toBe(null)
    expect(await f.t.query(PUBLIC.getPost, { networkId: f.root, postId: chosen.postId })).toMatchObject({ origin: { slug: "test-closed" } })
    await f.author.as.mutation(POSTS.remove, { networkId: f.child, postId: chosen.postId })
    expect(await f.t.query(PUBLIC.getPost, { networkId: f.root, postId: chosen.postId })).toBe(null)
    expect(await f.t.query(PUBLIC.getPost, { networkId: f.root, postId: "identifiant-invalide" })).toBe(null)
    expect(await refused(f.t.query(PUBLIC.listRootPosts, { networkId: f.child, paginationOpts: PAGE }))).toBe("notFound")
  })

  it("retirer la projection conserve l'origine et son texte, idempotent et réservé au propriétaire", async () => {
    const f = await fixture()
    const { postId } = await f.author.as.mutation(POSTS.publish, { networkId: f.child, body: "Choix révocable", alsoOnRoot: true })
    expect(await refused(f.reader.as.mutation(POSTS.withdrawFromRoot, { networkId: f.root, postId }))).toBe("notFound")
    await f.author.as.mutation(POSTS.withdrawFromRoot, { networkId: f.root, postId })
    await f.author.as.mutation(POSTS.withdrawFromRoot, { networkId: f.root, postId })
    expect(await f.t.query(PUBLIC.getPost, { networkId: f.root, postId })).toBe(null)
    expect(await f.author.as.query(POSTS.getPost, { networkId: f.child, postId })).toMatchObject({ body: "Choix révocable", visibility: "network" })
    const audit = await f.t.run((ctx) => ctx.db.query("engineAudit").withIndex("by_subject_at", (q) => q.eq("subjectTable", "posts").eq("subjectId", postId)).take(5))
    expect(audit).toHaveLength(1)
    expect(audit[0]).toMatchObject({ action: "post.root_withdraw", capacity: "member", actorPersonId: f.author.personId })
  })

  it("ne convertit jamais connections/group/followers en projection publique", async () => {
    const f = await fixture()
    for (const audience of ["connections", "group", "followers"] as const) {
      const postId = await rowPost(f.t, f.root, f.author, { audience })
      expect(await f.t.query(PUBLIC.getPost, { networkId: f.root, postId })).toBe(null)
    }
  })

  it("une visibilité root incohérente sans onRoot ne sort pas par le lien", async () => {
    const f = await fixture()
    const postId = await rowPost(f.t, f.child, f.author, { onRoot: false })
    expect(await f.t.query(PUBLIC.getPost, { networkId: f.root, postId })).toBe(null)
  })

  it("conserve le curseur natif d'une page filtrée vide et retrouve la suivante", async () => {
    const f = await fixture()
    const visible = await rowPost(f.t, f.root, f.author, { publishedAt: Date.now() - 1000 })
    await rowPost(f.t, f.root, f.author, { visibility: "network", publishedAt: Date.now() })
    const first = await f.t.query(PUBLIC.listRootPosts, { networkId: f.root, paginationOpts: { cursor: null, numItems: 1 } })
    expect(first.page).toEqual([])
    expect(first.isDone).toBe(false)
    expect(first.continueCursor).not.toBe("")
    const next = await f.t.query(PUBLIC.listRootPosts, { networkId: f.root, paginationOpts: { cursor: first.continueCursor, numItems: 1 } })
    expect(next.page.map((post) => post.id)).toEqual([visible])
  })

  it("ne déduit pas une province de la facette de l'auteur et filtre province/tag", async () => {
    const f = await fixture()
    await f.t.run(async (ctx) => {
      const existing = await ctx.db.query("personFacets").withIndex("by_network_and_person", (q) => q.eq("networkId", f.root).eq("personId", f.author.personId)).unique()
      const values = { values: { province: "nyanga" }, visibilities: { province: "hidden" as const }, updatedAt: Date.now() }
      if (existing) await ctx.db.patch(existing._id, values)
      else await ctx.db.insert("personFacets", { networkId: f.root, personId: f.author.personId, ...values })
    })
    const chosen = await rowPost(f.t, f.root, f.author, { province: "estuaire", tags: ["gabon"] })
    const absent = await rowPost(f.t, f.root, f.author)
    expect(await f.t.query(PUBLIC.getPost, { networkId: f.root, postId: absent })).toMatchObject({ province: null })
    expect((await f.t.query(PUBLIC.listRootPosts, { networkId: f.root, province: "estuaire", tag: "GABON", paginationOpts: PAGE })).page.map((post) => post.id)).toEqual([chosen])
  })
})

describe("PA8 — identité privée, sessions et modération fail-closed", () => {
  it("cache un profil privé, puis neutralise le profil retiré sans effacer son contenu choisi", async () => {
    const f = await fixture()
    const postId = await rowPost(f.t, f.root, f.author)
    await f.author.as.mutation(api.modules.people.profile.setMyProfilePrivacy, { private: true })
    expect(await f.t.query(PUBLIC.getProfile, { networkId: f.root, handle: f.author.handle })).toBe(null)
    expect(await f.t.query(PUBLIC.getPost, { networkId: f.root, postId })).toMatchObject({ author: { handle: null, displayName: null } })
    await f.author.as.mutation(api.modules.people.profile.withdrawMyProfile, {})
    expect(await f.t.query(PUBLIC.getPost, { networkId: f.root, postId })).toMatchObject({ body: "Publication choisie", author: { handle: null, displayName: null, avatarUrl: null, badges: [] } })
    expect(await f.t.query(PUBLIC.getProfile, { networkId: f.root, handle: f.author.handle })).toBe(null)
  })

  it("relit blocage et masquage pour le lecteur authentifié, sans état lecteur dans le DTO", async () => {
    const f = await fixture()
    const postId = await rowPost(f.t, f.root, f.author)
    const dto = await f.t.query(PUBLIC.getPost, { networkId: f.root, postId })
    expect(Object.keys(dto!.author).sort()).toEqual(["avatarUrl", "badges", "displayName", "handle", "kind"])
    expect(JSON.stringify(dto)).not.toContain(f.author.personId)
    await f.t.run(async (ctx) => ctx.db.insert("postMarks", { networkId: f.root, personId: f.reader.personId, postId, kind: "hidden", createdAt: Date.now() }))
    expect(await f.reader.as.query(PUBLIC.getPost, { networkId: f.root, postId })).toBe(null)
    await f.author.as.mutation(api.modules.graph.connections.blockPerson, { networkId: f.root, targetPersonId: f.reader.personId })
    expect(await f.reader.as.query(PUBLIC.getProfile, { networkId: f.root, handle: f.author.handle })).toBe(null)
    expect(await f.t.query(PUBLIC.getPost, { networkId: f.root, postId })).not.toBe(null)
  })

  it("un JWT révoqué ou sans session ne devient pas visite anonyme", async () => {
    const f = await fixture()
    const sessionId = await createTestSession(f.t, "public-test-lecteur")
    const as = f.t.withIdentity({ subject: "public-test-lecteur", sessionId })
    expect(await as.query(PUBLIC.snapshot, { networkId: f.root })).toMatchObject({ generatedAt: null })
    await f.t.mutation(components.betterAuth.adapter.deleteOne, { input: { model: "session", where: [{ field: "_id", value: sessionId }] } })
    expect(await refused(as.query(PUBLIC.snapshot, { networkId: f.root }))).toBe("unauthenticated")
    expect(await refused(f.t.withIdentity({ subject: "fake-jwt", sessionId: undefined }).query(PUBLIC.snapshot, { networkId: f.root }))).toBe("unauthenticated")
    expect(await refused(f.t.withIdentity({ subject: "fake-jwt", sessionId: "invalide" }).query(PUBLIC.snapshot, { networkId: f.root }))).toBe("unauthenticated")
  })

  it.each(["pending_review", "removed"] as const)("ferme la projection et les deux fils sur %s", async (status) => {
    const f = await fixture()
    const postId = await rowPost(f.t, f.root, f.author)
    await f.t.run(async (ctx) => ctx.db.insert("moderationContentStates", { networkId: f.root, targetKind: "post", targetId: postId, ownerPersonId: f.author.personId, status, createdAt: Date.now(), updatedAt: Date.now() }))
    expect(await f.t.query(PUBLIC.getPost, { networkId: f.root, postId })).toBe(null)
    expect((await f.reader.as.query(POSTS.feed, { networkId: f.root, paginationOpts: PAGE })).page).toEqual([])
    expect((await f.reader.as.query(POSTS.myFeed, { networkId: f.root, scope: "recents" })).items).toEqual([])
    expect((await f.reader.as.query(api.modules.discovery.discovery.rootFeed, { networkId: f.root, paginationOpts: PAGE })).page).toEqual([])
    expect(await f.author.as.query(PUBLIC.getPost, { networkId: f.root, postId })).toBe(null)
  })

  it("ferme l'origine archivée puis une suspension racine de l'auteur", async () => {
    const f = await fixture()
    const postId = await rowPost(f.t, f.child, f.author)
    await f.t.run(async (ctx) => ctx.db.patch(f.child, { status: "archived", archivedAt: Date.now() }))
    expect(await f.t.query(PUBLIC.getPost, { networkId: f.root, postId })).toBe(null)
    expect((await f.reader.as.query(POSTS.feed, { networkId: f.root, paginationOpts: PAGE })).page).toEqual([])
    await f.t.run(async (ctx) => {
      await ctx.db.patch(f.child, { status: "active", archivedAt: undefined })
      const row = await ctx.db.query("networkMemberships").withIndex("by_network_and_person", (q) => q.eq("networkId", f.root).eq("personId", f.author.personId)).unique()
      if (row) await ctx.db.patch(row._id, { status: "suspendue" })
    })
    expect(await f.t.query(PUBLIC.getPost, { networkId: f.root, postId })).toBe(null)
    expect(await f.t.query(PUBLIC.getProfile, { networkId: f.root, handle: f.author.handle })).toBe(null)
  })

  it("ne montre jamais le contenu d'un auteur effacé, mais une page conserve sa voix institutionnelle", async () => {
    const f = await fixture()
    const personPost = await rowPost(f.t, f.root, f.author)
    const pageId = await pageRecord(f.t, f.root, "institution-fixture")
    const pagePost = await rowPost(f.t, f.root, f.author, { pageId })
    await f.t.run(async (ctx) => {
      await ctx.db.patch(f.author.personId, { erasedAt: Date.now() })
      const membership = await ctx.db.query("networkMemberships").withIndex("by_network_and_person", (q) => q.eq("networkId", f.root).eq("personId", f.author.personId)).unique()
      if (membership) await ctx.db.patch(membership._id, { status: "suspendue" })
    })
    expect(await f.t.query(PUBLIC.getPost, { networkId: f.root, postId: personPost })).toBe(null)
    expect(await f.t.query(PUBLIC.getPost, { networkId: f.root, postId: pagePost })).toMatchObject({ author: { kind: "page", handle: "institution-fixture" } })
    expect((await f.reader.as.query(POSTS.feed, { networkId: f.root, paginationOpts: PAGE })).page.map((post) => post._id)).toEqual([pagePost])
  })

  it("un original retiré ferme le partage, et les médias sans analyse sont retenus", async () => {
    const f = await fixture()
    const storageId = await f.t.run((ctx) => ctx.storage.store(new Blob([new Uint8Array(12)], { type: "image/png" })))
    const original = await rowPost(f.t, f.root, f.author, { media: [{ storageId, kind: "image", mimeType: "image/png", sizeBytes: 12 }] })
    const share = await rowPost(f.t, f.root, f.reader, { sharedPostId: original, body: "Relais choisi" })
    const dto = await f.t.query(PUBLIC.getPost, { networkId: f.root, postId: share })
    expect(dto?.shared).toMatchObject({ available: true, media: [{ url: null, withheld: "fileScanPending" }] })
    expect(JSON.stringify(dto)).not.toContain(storageId)
    await f.author.as.mutation(POSTS.remove, { networkId: f.root, postId: original })
    expect(await f.t.query(PUBLIC.getPost, { networkId: f.root, postId: share })).toMatchObject({ shared: { available: false } })
  })
})

describe("PA8 — pages officielles, identité de la page et transparence", () => {
  it("une page non Officiel ou retirée ne sort pas ; native officielle a des métadonnées seulement", async () => {
    const f = await fixture()
    const pageId = await pageRecord(f.t, f.root, "direction", { visibility: "network" })
    const privatePost = await rowPost(f.t, f.root, f.author, { pageId, visibility: "network" })
    expect(await f.t.query(PUBLIC.getOfficialPage, { networkId: f.root, handle: "direction" })).toMatchObject({ badge: "official", handle: "direction" })
    expect(await f.t.query(PUBLIC.getPost, { networkId: f.root, postId: privatePost })).toBe(null)
    const chosen = await rowPost(f.t, f.root, f.author, { pageId })
    expect(await f.t.query(PUBLIC.getPost, { networkId: f.root, postId: chosen })).toMatchObject({ author: { kind: "page", handle: "direction", badges: ["official"] } })
    await f.t.run(async (ctx) => ctx.db.patch(pageId, { trust: "community", trustRank: 0 }))
    expect(await f.t.query(PUBLIC.getOfficialPage, { networkId: f.root, handle: "direction" })).toBe(null)
    await f.t.run(async (ctx) => ctx.db.patch(pageId, { trust: "official", trustRank: 2, status: "inactive" }))
    expect(await f.t.query(PUBLIC.getPost, { networkId: f.root, postId: chosen })).toBe(null)
  })

  it.each(["pending_review", "removed"] as const)("une page %s ferme aussi ses publications dans le fil", async (status) => {
    const f = await fixture()
    const pageId = await pageRecord(f.t, f.root, "page-moderee")
    const postId = await rowPost(f.t, f.root, f.author, { pageId })
    await f.t.run((ctx) => ctx.db.insert("moderationContentStates", { networkId: f.root, targetKind: "page", targetId: pageId, status, createdAt: Date.now(), updatedAt: Date.now() }))
    expect(await f.t.query(PUBLIC.getPost, { networkId: f.root, postId })).toBe(null)
    expect((await f.reader.as.query(POSTS.feed, { networkId: f.root, paginationOpts: PAGE })).page).toEqual([])
    expect((await f.reader.as.query(POSTS.myFeed, { networkId: f.root, scope: "recents" })).items).toEqual([])
  })

  it("la publication native de page exige un geste, jamais sa règle implicite", async () => {
    const f = await fixture()
    const pageId = await pageRecord(f.t, f.root, "communique", { visibility: "network" })
    await f.t.run(async (ctx) => {
      await ctx.db.insert("pageSignatories", { networkId: f.root, pageId, personId: f.author.personId, role: "admin", createdAt: Date.now(), updatedAt: Date.now(), acceptedAt: Date.now() })
      await ctx.db.insert("identityLinks", { personId: f.author.personId, provider: "idn", subject: "fixture-idn-page", loa: 2, linkedAt: Date.now() })
    })
    const publish = api.modules.pages.pages.publishAsPage
    const kept = await f.author.as.mutation(publish, { networkId: f.root, pageId, body: "Communiqué membres" })
    const chosen = await f.author.as.mutation(publish, { networkId: f.root, pageId, body: "Communiqué choisi", alsoOnRoot: true, province: "nyanga" })
    expect(await f.t.query(PUBLIC.getPost, { networkId: f.root, postId: kept.postId })).toBe(null)
    expect(await f.t.query(PUBLIC.getPost, { networkId: f.root, postId: chosen.postId })).toMatchObject({ province: "nyanga", author: { kind: "page" } })
  })

  it("transparence sur douze jours fixes ; petites cohortes et sous-catégories absentes", async () => {
    const f = await fixture()
    const cutoff = Math.floor(Date.now() / 86_400_000) * 86_400_000
    await f.t.run(async (ctx) => {
      for (const [n, cases, distinctAuthors] of [[1, 4, 5], [2, 9, 4], [3, 10, 5]] as const) {
        await ctx.db.insert("moderationTransparency", { networkId: f.root, periodStart: cutoff - n * 86_400_000, periodEnd: cutoff - (n - 1) * 86_400_000, cases, distinctAuthors, actioned: 1, dismissed: 9, generatedAt: Date.now() })
      }
    })
    const result = await f.t.query(PUBLIC.transparency, { networkId: f.root })
    expect(result.periods).toHaveLength(12)
    expect(result.periods.slice(0, 3).map((period) => period.cases)).toEqual([null, null, 10])
    expect(result.threshold).toBe(5)
    expect(new Set(Object.keys(result.periods[2]!))).toEqual(new Set(["periodStart", "periodEnd", "cases"]))
  })

  it("SU01d : échéances légales des seules périodes closes et mesurées, sans base ; la projection historique garde sa forme", async () => {
    const f = await fixture()
    const cutoff = Math.floor(Date.now() / 86_400_000) * 86_400_000
    await f.t.run(async (ctx) => {
      const day = (n: number) => ({ networkId: f.root, periodStart: cutoff - n * 86_400_000, periodEnd: cutoff - (n - 1) * 86_400_000, cases: 10, distinctAuthors: 5, actioned: 5, dismissed: 5 })
      // Mesurée avant SU01d : aucune échéance.
      await ctx.db.insert("moderationTransparency", { ...day(1), generatedAt: Date.now() })
      await ctx.db.insert("moderationTransparency", { ...day(2), generatedAt: Date.now(), legalMet: 8, legalMissed: 0, legalAuthors: 5 })
      // Calculée avant la fin de sa période : une échéance pouvait encore venir.
      await ctx.db.insert("moderationTransparency", { ...day(3), generatedAt: cutoff - 3 * 86_400_000 + 1, legalMet: 8, legalMissed: 0, legalAuthors: 5 })
    })
    const result = await f.t.query(PUBLIC.transparencyDeadlines, { networkId: f.root })
    expect(result.threshold).toBe(5)
    expect(result.periods).toHaveLength(12)
    expect(result.periods.slice(0, 3).map((period) => period.legal)).toEqual([null, { met: 8, missed: null }, null])
    expect(new Set(Object.keys(result.periods[1]!))).toEqual(new Set(["periodStart", "periodEnd", "legal"]))
    // Les écrans déjà publiés lisent `transparency` strictement : sa forme ne change pas.
    expect(new Set(Object.keys((await f.t.query(PUBLIC.transparency, { networkId: f.root })).periods[1]!))).toEqual(new Set(["periodStart", "periodEnd", "cases"]))
  })
})
