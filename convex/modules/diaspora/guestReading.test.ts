// @vitest-environment edge-runtime
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { api, internal } from "../../_generated/api"
import { SEED_CONFIRMATION } from "../../seeds/foundations"
import { createTestSession, joinDeclaredDiasporaFixture, openNetworkFeatures, testConvex } from "../../test.setup"

beforeEach(() => { vi.stubEnv("CONVEX_CLOUD_URL", "http://127.0.0.1:3210") })
afterEach(() => { vi.unstubAllEnvs() })

async function fixture() {
  const t = testConvex()
  await t.mutation(internal.seeds.foundations.run, { confirmNonProduction: SEED_CONFIRMATION })
  const { network: networkId } = await t.mutation(internal.modules.diaspora.seed.run, { confirmNonProduction: SEED_CONFIRMATION })
  await openNetworkFeatures(t, networkId)
  const subject = "guest-author"
  const sessionId = await createTestSession(t, subject, Date.now() + 86_400_000)
  const member = t.withIdentity({ subject, sessionId })
  const personId = await member.mutation(api.modules.people.persons.ensureMyPerson, {})
  await member.mutation(api.modules.people.consents.recordConsent, { purpose: "social_profile", origin: "onboarding" })
  await member.mutation(api.modules.people.consents.recordConsent, { purpose: "directory", networkId, origin: "onboarding" })
  await member.mutation(api.modules.people.profile.publishMyProfile, { handle: "marie.ndong", displayName: "Marie" })
  await t.run(ctx => ctx.db.insert("identityLinks", { personId, provider: "idn", subject: "private-subject", loa: 2, nationality: "GA", linkedAt: Date.now() }))
  await joinDeclaredDiasporaFixture(member, { networkId, directoryVisibility: "network", guestProfile: true, facet: { countryOfResidence: "FR", city: "Paris" } })
  const publicRead = api.modules.diaspora.guestReading.read
  return { t, networkId, personId, member, publicRead }
}

describe("DIASPORA public reading", () => {
  it("only returns explicitly guest-visible posts and a public profile allowlist", async () => {
    const { t, member, publicRead, networkId } = await fixture()
    const base = { networkId, reach: "diaspora", audience: "public" as const }
    const legacy = await member.mutation(api.modules.posts.posts.publish, { ...base, body: "Membres seulement" })
    const post = await member.mutation(api.modules.posts.posts.publish, { ...base, guestVisible: true, body: "Message public" })
    await expect(member.mutation(api.modules.posts.posts.publish, { ...base, audience: "connections", guestVisible: true, body: "Privé" })).rejects.toThrow()
    expect(await t.query(publicRead, { screen: "post", target: legacy.postId })).toBeNull()
    expect(await t.query(publicRead, { screen: "post", target: post.postId })).toMatchObject({ posts: [{ id: post.postId, body: "Message public" }] })
    const profile = await t.query(publicRead, { screen: "profile", target: "marie.ndong" })
    expect(profile?.heading).toEqual({ kind: "person", handle: "marie.ndong", name: "Marie", image: null })
    expect(profile?.posts.map(row => row.id)).toEqual([post.postId])
    expect((await t.query(api.modules.diaspora.guestReading.search, { term: "Marie" })).map(row => row.handle)).toContain("marie.ndong")
    expect(await member.query(publicRead, { screen: "feed" })).toBeNull()
    await member.mutation(api.modules.diaspora.guestReading.setVisibility, { networkId, enabled: false })
    expect(await t.query(publicRead, { screen: "profile", target: "marie.ndong" })).toBeNull()
    expect(await t.query(publicRead, { screen: "feed" })).toMatchObject({ posts: [] })
    expect(await t.query(api.modules.diaspora.guestReading.search, { term: "Marie" })).toEqual([])
    await expect(member.mutation(api.modules.posts.posts.publish, { ...base, guestVisible: true, body: "Profil retiré" })).rejects.toThrow()
    await joinDeclaredDiasporaFixture(member, { networkId, guestProfile: true, directoryVisibility: "network", facet: { countryOfResidence: "FR" } })
    expect(await t.query(publicRead, { screen: "profile", target: "marie.ndong" })).toBeNull()
  })

  it("can suspend every anonymous surface without changing member or publication visibility", async () => {
    const { t, networkId, member, publicRead } = await fixture()
    const post = await member.mutation(api.modules.posts.posts.publish, { networkId, reach: "diaspora", guestVisible: true, body: "Annonce" })
    vi.stubEnv("DIASPORA_GUEST_READING_DISABLED", "true")
    expect(await t.query(publicRead, { screen: "feed" })).toBeNull()
    expect(await t.query(publicRead, { screen: "post", target: post.postId })).toBeNull()
    expect(await t.query(publicRead, { screen: "profile", target: "marie.ndong" })).toBeNull()
    expect(await t.query(api.modules.diaspora.guestReading.search, { term: "Marie" })).toEqual([])
    expect(await member.query(api.modules.diaspora.guestReading.setting, { networkId })).toBe(true)
    vi.stubEnv("DIASPORA_GUEST_READING_DISABLED", "false")
    expect(await t.query(publicRead, { screen: "post", target: post.postId })).toMatchObject({ posts: [{ body: "Annonce" }] })
  })

  it("withdrawal, moderation and revoking directory consent remove guest access immediately", async () => {
    const { t, networkId, personId, publicRead, member } = await fixture()
    const post = await member.mutation(api.modules.posts.posts.publish, { networkId, reach: "diaspora", guestVisible: true, body: "Une annonce" })
    await t.run(async ctx => {
      const old = await ctx.db.query("moderationContentStates").withIndex("by_target", q => q.eq("targetKind", "post").eq("targetId", post.postId)).unique()
      if (old) await ctx.db.patch(old._id, { status: "removed" })
      else await ctx.db.insert("moderationContentStates", { networkId, ownerPersonId: personId, targetKind: "post", targetId: post.postId, status: "removed", createdAt: Date.now(), updatedAt: Date.now() })
    })
    expect(await t.query(publicRead, { screen: "post", target: post.postId })).toBeNull()
    await member.mutation(api.modules.people.consents.revokeConsent, { networkId, purpose: "directory" })
    expect(await t.query(publicRead, { screen: "profile", target: "marie.ndong" })).toBeNull()
  })

  it("exposes the page chosen by its admin without naming signatories or exposing old page posts", async () => {
    const { t, networkId, personId, publicRead, member } = await fixture()
    const pageId = await t.run(async ctx => {
      const now = Date.now()
      const id = await ctx.db.insert("pages", { networkId, handle: "collectif", name: "Collectif", ownerKind: "association", trust: "community", trustRank: 0, visibility: "network", onRoot: false, status: "active", searchText: "collectif", createdAt: now, updatedAt: now })
      await ctx.db.insert("pageSignatories", { networkId, pageId: id, personId, role: "admin", acceptedAt: now, createdAt: now, updatedAt: now })
      return id
    })
    const read = () => t.query(publicRead, { screen: "page", target: "collectif" })
    expect(await read()).toBeNull()
    await member.mutation(api.modules.diaspora.guestReading.setVisibility, { networkId, pageId, enabled: true })
    await member.mutation(api.modules.pages.pages.publishAsPage, { networkId, pageId, reach: "diaspora", body: "Réseau" })
    await member.mutation(api.modules.pages.pages.publishAsPage, { networkId, pageId, reach: "diaspora", guestVisible: true, body: "Public" })
    expect((await read())?.posts.map(post => post.body)).toEqual(["Public"])
    expect(JSON.stringify(await read())).not.toContain(personId)
  })
})
