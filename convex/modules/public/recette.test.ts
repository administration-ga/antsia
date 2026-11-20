// @vitest-environment edge-runtime
import { afterEach, describe, expect, it, vi } from "vitest"

import { api, components, internal } from "../../_generated/api"
import { SEED_CONFIRMATION } from "../../seeds/foundations"
import { openNetworkFeatures, testConvex } from "../../test.setup"

afterEach(() => vi.unstubAllEnvs())

async function fixture(email = "relations.recette@exemple.test", verified = true) {
  vi.stubEnv("CONVEX_CLOUD_URL", "http://127.0.0.1:3210")
  const t = testConvex()
  const { root } = await t.mutation(internal.seeds.foundations.run, { confirmNonProduction: SEED_CONFIRMATION })
  const { network: child } = await t.mutation(internal.modules.diaspora.seed.run, { confirmNonProduction: SEED_CONFIRMATION })
  await openNetworkFeatures(t, child)
  const now = Date.now()
  const user: unknown = await t.mutation(components.betterAuth.adapter.create, { input: { model: "user", data: { name: "Personne de recette", email, emailVerified: verified, createdAt: now, updatedAt: now } } })
  if (!user || typeof user !== "object" || !("_id" in user) || typeof user._id !== "string") throw new Error("Compte de fixture absent")
  const authUserId = user._id
  const personId = await t.run(async (ctx) => {
    const id = await ctx.db.insert("persons", { authUserId, handle: "relations.recette", displayName: "Profil fictif de recette", publishedAt: now, createdAt: now, updatedAt: now })
    for (const networkId of [root, child]) await ctx.db.insert("networkMemberships", { networkId, personId: id, status: "declaree", role: "member", joinedAt: now, statusChangedAt: now })
    return id
  })
  return { t, root, child, personId }
}

describe("PA8 — recette locale fermée et additive", () => {
  it("prépare quatre candidats fictifs sans créer profil, session ni admission", async () => {
    const f = await fixture()
    const initial = await f.t.run(async (ctx) => ({ persons: await ctx.db.query("persons").take(10), memberships: await ctx.db.query("networkMemberships").take(10) }))
    const args = { confirmNonProduction: SEED_CONFIRMATION }
    const first = await f.t.mutation(internal.modules.public.recette.prepare, args)
    expect(await f.t.mutation(internal.modules.public.recette.prepare, args)).toEqual(first)
    for (const postId of [first.nativeNetwork, first.childNetwork]) expect(await f.t.query(api.modules.public.projections.getPost, { networkId: f.root, postId })).toBe(null)
    expect(await f.t.query(api.modules.public.projections.getPost, { networkId: f.root, postId: first.childRoot })).toMatchObject({ origin: { slug: "diaspora-ga" } })
    expect(await f.t.query(api.modules.public.projections.getPost, { networkId: f.root, postId: first.nativeRoot })).toMatchObject({ origin: { slug: "antsia" } })
    expect(await f.t.run(async (ctx) => ({ persons: await ctx.db.query("persons").take(10), memberships: await ctx.db.query("networkMemberships").take(10) }))).toEqual(initial)
  })

  it("retire seulement le candidat enfant root, journal système unique ; prepare ne le réouvre pas", async () => {
    const f = await fixture()
    const args = { confirmNonProduction: SEED_CONFIRMATION }
    const ids = await f.t.mutation(internal.modules.public.recette.prepare, args)
    await f.t.mutation(internal.modules.public.recette.withdrawChildFromRoot, args)
    await f.t.mutation(internal.modules.public.recette.withdrawChildFromRoot, args)
    expect(await f.t.query(api.modules.public.projections.getPost, { networkId: f.root, postId: ids.childRoot })).toBe(null)
    expect(await f.t.mutation(internal.modules.public.recette.prepare, args)).toEqual(ids)
    const post = await f.t.run((ctx) => ctx.db.get(ids.childRoot))
    expect(post).toMatchObject({ networkId: f.child, status: "published", visibility: "network", onRoot: false })
    const audits = await f.t.run((ctx) => ctx.db.query("engineAudit").withIndex("by_subject_at", (q) => q.eq("subjectTable", "posts").eq("subjectId", ids.childRoot)).take(5))
    expect(audits).toHaveLength(1)
    expect(audits[0]).toMatchObject({ action: "post.root_withdraw", capacity: "system", details: { recette: true } })
    expect(audits[0]?.actorPersonId).toBeUndefined()
    for (const postId of [ids.nativeNetwork, ids.nativeRoot, ids.childNetwork]) {
      const record = await f.t.run((ctx) => ctx.db.get(postId))
      expect(record?.status).toBe("published")
    }
  })

  it.each([["autre@exemple.test", true], ["relations.recette@exemple.test", false]] as const)("le handle seul ne permet pas de publier pour %s", async (email, verified) => {
    const f = await fixture(email, verified)
    await expect(f.t.mutation(internal.modules.public.recette.prepare, { confirmNonProduction: SEED_CONFIRMATION })).rejects.toThrow("adresse fictive vérifiée")
    expect(await f.t.run((ctx) => ctx.db.query("posts").take(10))).toEqual([])
  })

  it("refuse le nuage et une confirmation incorrecte, même avec une identité fictive", async () => {
    const f = await fixture()
    await expect(f.t.mutation(internal.modules.public.recette.prepare, { confirmNonProduction: "incorrect" })).rejects.toThrow()
    vi.stubEnv("CONVEX_CLOUD_URL", "https://fixture.convex.cloud")
    await expect(f.t.mutation(internal.modules.public.recette.prepare, { confirmNonProduction: SEED_CONFIRMATION })).rejects.toThrow("backend local")
  })
})
