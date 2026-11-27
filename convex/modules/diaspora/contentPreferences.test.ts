// @vitest-environment edge-runtime
/** Choix privés du fil : propriété, versions et projections DIASPORA.GA. */
import { engineErrorCode } from "@antsia/social-contracts/errors"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { api, internal } from "../../_generated/api"
import type { Doc, Id } from "../../_generated/dataModel"
import { SEED_CONFIRMATION } from "../../seeds/foundations"
import { joinDeclaredDiasporaFixture, openNetworkFeatures, testConvex } from "../../test.setup"

type T = ReturnType<typeof testConvex>
const NOW = Date.UTC(2026, 9, 18, 10)
const CP = api.modules.diaspora.contentPreferences
const NEUTRAL = { postId: null, body: null, author: null }

beforeEach(() => {
  vi.stubEnv("CONVEX_CLOUD_URL", "http://127.0.0.1:3210")
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

async function member(t: T, networkId: Id<"networks">, handle: string, listed = false) {
  const as = t.withIdentity({ subject: `auth-${handle}` })
  const personId = await as.mutation(api.modules.people.persons.ensureMyPerson, {})
  await as.mutation(api.modules.people.consents.recordConsent, { purpose: "social_profile", origin: "onboarding" })
  await as.mutation(api.modules.people.profile.publishMyProfile, { handle, displayName: handle })
  await t.run(async (ctx) => {
    await ctx.db.insert("identityLinks", { personId, provider: "idn", subject: `idn-${personId}`, loa: 1, nationality: "GA", linkedAt: NOW })
  })
  if (listed) await as.mutation(api.modules.people.consents.recordConsent, { purpose: "directory", origin: "onboarding", networkId })
  await joinDeclaredDiasporaFixture(as, {
    networkId,
    facet: { countryOfResidence: "FR", city: "Lyon" },
    ...(listed ? { directoryVisibility: "network" as const } : {}),
  })
  return { as, personId }
}

async function fixture() {
  const t = testConvex()
  const { root } = await t.mutation(internal.seeds.foundations.run, { confirmNonProduction: SEED_CONFIRMATION })
  const { network: networkId } = await t.mutation(internal.modules.diaspora.seed.run, { confirmNonProduction: SEED_CONFIRMATION })
  await openNetworkFeatures(t, networkId)
  const reader = await member(t, networkId, "lecteur")
  const author = await member(t, networkId, "auteur", true)
  const args = { networkId, expectedPersonId: reader.personId, paginationOpts: { numItems: 100, cursor: null } }
  return { t, root, networkId, reader, author, args }
}

async function post(t: T, networkId: Id<"networks">, authorPersonId: Id<"persons">, options: Partial<Pick<Doc<"posts">, "audience" | "pageId" | "status">> = {}) {
  return await t.run(async (ctx) => ctx.db.insert("posts", {
    networkId, authorPersonId, body: "Publication du test", audience: "public", visibility: "network", onRoot: false,
    status: "published", searchText: "publication du test", publishedAt: NOW, createdAt: NOW, updatedAt: NOW, ...options,
  }))
}

async function hidden(t: T, networkId: Id<"networks">, personId: Id<"persons">, postId: Id<"posts">, createdAt = NOW) {
  return await t.run(async (ctx) => ctx.db.insert("postMarks", { networkId, personId, postId, kind: "hidden", createdAt }))
}

async function muted(t: T, networkId: Id<"networks">, personId: Id<"persons">, mutedPersonId: Id<"persons">, createdAt = NOW) {
  return await t.run(async (ctx) => ctx.db.insert("mutes", { networkId, personId, mutedPersonId, createdAt }))
}

async function setStatus(t: T, networkId: Id<"networks">, personId: Id<"persons">, status: "en_attente" | "suspendue") {
  await t.run(async (ctx) => {
    const row = await ctx.db.query("networkMemberships")
      .withIndex("by_network_and_person", (q) => q.eq("networkId", networkId).eq("personId", personId)).unique()
    if (!row) throw new Error("Adhésion de fixture absente")
    await ctx.db.patch(row._id, { status })
  })
}

async function codeOf(promise: Promise<unknown>) {
  try { await promise } catch (error) { return engineErrorCode(error) }
  return null
}

describe("choix privés du fil DIASPORA.GA", () => {
  it("pagine toutes les lignes propres, plafonne à 50 et garde les choix devenus illisibles", async () => {
    const { t, root, networkId, reader, author, args } = await fixture()
    const postId = await post(t, networkId, author.personId, { status: "removed" })
    const ids = await t.run(async (ctx) => {
      const hiddenIds: Id<"postMarks">[] = []
      const mutedIds: Id<"mutes">[] = []
      for (let index = 0; index < 55; index += 1) {
        const targetId = await ctx.db.insert("persons", { authUserId: `cible-neutre-${index}`, createdAt: NOW, updatedAt: NOW })
        hiddenIds.push(await ctx.db.insert("postMarks", { networkId, personId: reader.personId, postId, kind: "hidden", createdAt: NOW + index }))
        mutedIds.push(await ctx.db.insert("mutes", { networkId, personId: reader.personId, mutedPersonId: targetId, createdAt: NOW + index }))
      }
      await ctx.db.insert("postMarks", { networkId: root, personId: reader.personId, postId, kind: "hidden", createdAt: NOW + 100 })
      await ctx.db.insert("postMarks", { networkId, personId: author.personId, postId, kind: "hidden", createdAt: NOW + 100 })
      await ctx.db.insert("postMarks", { networkId, personId: reader.personId, postId, kind: "bookmark", createdAt: NOW + 100 })
      await ctx.db.insert("mutes", { networkId: root, personId: reader.personId, mutedPersonId: author.personId, createdAt: NOW + 100 })
      await ctx.db.insert("mutes", { networkId, personId: author.personId, mutedPersonId: reader.personId, createdAt: NOW + 100 })
      return { hiddenIds, mutedIds }
    })
    const firstHidden = await reader.as.query(CP.paginateHiddenPosts, args)
    const firstMuted = await reader.as.query(CP.paginateMutedAuthors, args)
    expect(firstHidden.page).toHaveLength(50)
    expect(firstMuted.page).toHaveLength(50)
    for (const row of [...firstHidden.page, ...firstMuted.page]) expect(row).toMatchObject(NEUTRAL)
    expect(firstHidden.isDone).toBe(false)
    expect(firstMuted.isDone).toBe(false)
    const lastHidden = await reader.as.query(CP.paginateHiddenPosts, { ...args, paginationOpts: { ...args.paginationOpts, cursor: firstHidden.continueCursor } })
    const lastMuted = await reader.as.query(CP.paginateMutedAuthors, { ...args, paginationOpts: { ...args.paginationOpts, cursor: firstMuted.continueCursor } })
    expect(lastHidden.isDone).toBe(true)
    expect(lastMuted.isDone).toBe(true)
    expect([...firstHidden.page, ...lastHidden.page].map((row) => row.choiceId)).toEqual([...ids.hiddenIds].reverse())
    expect([...firstMuted.page, ...lastMuted.page].map((row) => row.choiceId)).toEqual([...ids.mutedIds].reverse())
  })

  it("relit l'audience, sépare la lecture du contenu de l'annuaire et ne montre jamais le signataire d'une page", async () => {
    const { t, networkId, reader, author, args } = await fixture()
    const postId = await post(t, networkId, author.personId)
    const choiceId = await hidden(t, networkId, reader.personId, postId)
    expect((await reader.as.query(CP.paginateHiddenPosts, args)).page).toEqual([{
      choiceId, at: NOW, postId, body: "Publication du test", author: { kind: "person", displayName: "auteur", handle: "auteur", avatarUrl: null },
    }])
    await author.as.mutation(api.modules.diaspora.facet.setDirectoryVisibility, { networkId, level: "hidden" })
    expect((await reader.as.query(CP.paginateHiddenPosts, args)).page[0]).toEqual({ choiceId, at: NOW, postId, body: "Publication du test", author: null })
    await t.run(async (ctx) => { await ctx.db.patch(postId, { audience: "connections" }) })
    expect((await reader.as.query(CP.paginateHiddenPosts, args)).page).toEqual([{ choiceId, at: NOW, ...NEUTRAL }])

    const pageId = await t.run(async (ctx) => ctx.db.insert("pages", {
      networkId, handle: "association-test", name: "Association de test", ownerKind: "association", trust: "community", trustRank: 0,
      visibility: "network", onRoot: false, status: "active", searchText: "association test", createdAt: NOW, updatedAt: NOW,
    }))
    const pagePostId = await post(t, networkId, author.personId, { pageId })
    const pageChoiceId = await hidden(t, networkId, reader.personId, pagePostId, NOW + 1)
    expect((await reader.as.query(CP.paginateHiddenPosts, args)).page[0]).toEqual({
      choiceId: pageChoiceId, at: NOW + 1, postId: pagePostId, body: "Publication du test",
      author: { kind: "page", displayName: "Association de test", handle: "association-test", avatarUrl: null },
    })
    await t.run(async (ctx) => { await ctx.db.patch(pageId, { status: "inactive" }) })
    expect((await reader.as.query(CP.paginateHiddenPosts, args)).page[0]).toEqual({ choiceId: pageChoiceId, at: NOW + 1, ...NEUTRAL })
  })

  it.each(["hidden", "country", "consent", "departed", "block", "withdrawn", "private", "pending"] as const)("neutralise une sourdine après %s tout en gardant sa restauration", async (change) => {
    const { t, networkId, reader, author, args } = await fixture()
    const choiceId = await muted(t, networkId, reader.personId, author.personId)
    expect((await reader.as.query(CP.paginateMutedAuthors, args)).page).toEqual([{
      choiceId, at: NOW, postId: null, body: null, author: { kind: "person", displayName: "auteur", handle: "auteur", avatarUrl: null },
    }])
    switch (change) {
      case "hidden":
        await author.as.mutation(api.modules.diaspora.facet.setDirectoryVisibility, { networkId, level: "hidden" })
        break
      case "country":
        await author.as.mutation(api.modules.diaspora.facet.setDirectoryVisibility, { networkId, level: "country" })
        await author.as.mutation(api.modules.diaspora.facet.updateMyFacet, { networkId, facet: { countryOfResidence: "BE" } })
        break
      case "consent":
        await author.as.mutation(api.modules.people.consents.revokeConsent, { purpose: "directory", networkId })
        break
      case "departed":
        await author.as.mutation(api.modules.diaspora.membership.leaveDiasporaGa, { networkId })
        break
      case "block":
        await author.as.mutation(api.modules.graph.connections.blockPerson, { networkId, targetPersonId: reader.personId })
        break
      case "withdrawn":
        await author.as.mutation(api.modules.people.profile.withdrawMyProfile, {})
        break
      case "private":
        await author.as.mutation(api.modules.people.profile.setMyProfilePrivacy, { private: true })
        break
      case "pending":
        await setStatus(t, networkId, author.personId, "en_attente")
        break
    }
    expect((await reader.as.query(CP.paginateMutedAuthors, args)).page).toEqual([{ choiceId, at: NOW, ...NEUTRAL }])
    expect(await reader.as.mutation(CP.restoreMutedAuthor, { networkId, expectedPersonId: reader.personId, choiceId })).toEqual({ restored: true })
    expect((await reader.as.query(CP.paginateMutedAuthors, args)).page).toEqual([])
  })

  it("restaure la seule version propre et laisse intacts les autres choix ainsi que les données sociales", async () => {
    const { t, root, networkId, reader, author } = await fixture()
    const postId = await post(t, networkId, author.personId)
    const choiceId = await hidden(t, networkId, reader.personId, postId)
    const muteId = await muted(t, networkId, reader.personId, author.personId)
    const remoteHidden = await hidden(t, root, reader.personId, postId)
    const remoteMuted = await muted(t, root, reader.personId, author.personId)
    const bookmark = await t.run(async (ctx) => ctx.db.insert("postMarks", { networkId, personId: reader.personId, postId, kind: "bookmark", createdAt: NOW }))
    const social = async () => await t.run(async (ctx) => ({
      posts: await ctx.db.query("posts").take(10), connections: await ctx.db.query("connections").take(10),
      follows: await ctx.db.query("follows").take(10), notifications: await ctx.db.query("notifications").take(10),
    }))
    const before = await social()
    expect(await author.as.mutation(CP.restoreHiddenPost, { networkId, expectedPersonId: author.personId, choiceId })).toEqual({ restored: false })
    expect(await author.as.mutation(CP.restoreMutedAuthor, { networkId, expectedPersonId: author.personId, choiceId: muteId })).toEqual({ restored: false })
    expect(await reader.as.mutation(CP.restoreHiddenPost, { networkId, expectedPersonId: reader.personId, choiceId: remoteHidden })).toEqual({ restored: false })
    expect(await reader.as.mutation(CP.restoreMutedAuthor, { networkId, expectedPersonId: reader.personId, choiceId: remoteMuted })).toEqual({ restored: false })
    expect(await reader.as.mutation(CP.restoreHiddenPost, { networkId, expectedPersonId: reader.personId, choiceId: bookmark })).toEqual({ restored: false })
    expect(await reader.as.mutation(CP.restoreHiddenPost, { networkId, expectedPersonId: reader.personId, choiceId })).toEqual({ restored: true })
    expect(await reader.as.mutation(CP.restoreMutedAuthor, { networkId, expectedPersonId: reader.personId, choiceId: muteId })).toEqual({ restored: true })
    const currentHidden = await hidden(t, networkId, reader.personId, postId)
    const currentMuted = await muted(t, networkId, reader.personId, author.personId)
    expect(await reader.as.mutation(CP.restoreHiddenPost, { networkId, expectedPersonId: reader.personId, choiceId })).toEqual({ restored: false })
    expect(await reader.as.mutation(CP.restoreMutedAuthor, { networkId, expectedPersonId: reader.personId, choiceId: muteId })).toEqual({ restored: false })
    expect(await t.run(async (ctx) => ctx.db.get(currentHidden))).not.toBeNull()
    expect(await t.run(async (ctx) => ctx.db.get(currentMuted))).not.toBeNull()
    expect(await t.run(async (ctx) => ctx.db.get(bookmark))).not.toBeNull()
    expect(await social()).toEqual(before)
  })

  it("refuse une personne attendue différente et les appels hors DIASPORA.GA ; l'attente garde ses gestes privés", async () => {
    const { t, root, networkId, reader, author, args } = await fixture()
    const postId = await post(t, networkId, author.personId)
    const choiceId = await hidden(t, networkId, reader.personId, postId)
    const muteId = await muted(t, networkId, reader.personId, author.personId)
    const wrong = { ...args, expectedPersonId: author.personId }
    expect(await codeOf(reader.as.query(CP.paginateHiddenPosts, wrong))).toBe("notFound")
    expect(await codeOf(reader.as.query(CP.paginateMutedAuthors, wrong))).toBe("notFound")
    expect(await codeOf(reader.as.mutation(CP.restoreHiddenPost, { networkId, expectedPersonId: author.personId, choiceId }))).toBe("notFound")
    expect(await codeOf(reader.as.mutation(CP.restoreMutedAuthor, { networkId, expectedPersonId: author.personId, choiceId: muteId }))).toBe("notFound")
    expect(await codeOf(reader.as.query(CP.paginateHiddenPosts, { ...args, networkId: root }))).toBe("notFound")
    expect(await codeOf(reader.as.query(CP.paginateMutedAuthors, { ...args, networkId: root }))).toBe("notFound")
    expect(await codeOf(t.query(CP.paginateHiddenPosts, args))).toBe("unauthenticated")
    await setStatus(t, networkId, reader.personId, "en_attente")
    expect((await reader.as.query(CP.paginateHiddenPosts, args)).page).toEqual([{ choiceId, at: NOW, postId, body: "Publication du test", author: null }])
    expect((await reader.as.query(CP.paginateMutedAuthors, args)).page).toEqual([{ choiceId: muteId, at: NOW, ...NEUTRAL }])
    expect(await reader.as.mutation(CP.restoreHiddenPost, { networkId, expectedPersonId: reader.personId, choiceId })).toEqual({ restored: true })
    expect(await reader.as.mutation(CP.restoreMutedAuthor, { networkId, expectedPersonId: reader.personId, choiceId: muteId })).toEqual({ restored: true })
  })
})
