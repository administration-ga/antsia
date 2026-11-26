// @vitest-environment edge-runtime
import { engineErrorCode } from "@antsia/social-contracts/errors"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { api, internal } from "../_generated/api"
import type { Id } from "../_generated/dataModel"
import { SEED_CONFIRMATION } from "../seeds/foundations"
import { testConvex } from "../test.setup"
import { enforceRateLimit, type RateLimitBucket } from "./rateLimit"

const T0 = Date.UTC(2026, 9, 16, 12)
type T = ReturnType<typeof testConvex>

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(T0)
  vi.stubEnv("CONVEX_CLOUD_URL", "http://127.0.0.1:3210")
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs() })

async function fixture(status: "declaree" | "verifiee" = "declaree", joined = true) {
  const t = testConvex()
  const { root, testClosed } = await t.mutation(internal.seeds.foundations.run, { confirmNonProduction: SEED_CONFIRMATION })
  const personId = await t.run(async (ctx) => {
    const personId = await ctx.db.insert("persons", { authUserId: "rate-test", handle: "rate.test", displayName: "Rate test", publishedAt: T0, createdAt: T0, updatedAt: T0 })
    if (joined) {
      for (const networkId of [root, testClosed]) await ctx.db.insert("networkMemberships", { networkId, personId, status, role: "member", joinedAt: T0, statusChangedAt: T0 })
    }
    return personId
  })
  return { t, root, testClosed, personId, as: t.withIdentity({ subject: "rate-test" }) }
}

async function codeOf(promise: Promise<unknown>) {
  try { await promise; return null } catch (error) { return engineErrorCode(error) }
}

async function consume(t: T, networkId: Id<"networks">, personId: Id<"persons">, bucket: RateLimitBucket, count = 1) {
  await t.run(async (ctx) => {
    for (let index = 0; index < count; index++) await enforceRateLimit({ ...ctx, networkId }, bucket, personId)
  })
}

describe("PA5 — budgets réels par personne et par type d'écriture", () => {
  it("refuse la quatrième publication d'un membre déclaré sans badge fort", async () => {
    const f = await fixture()
    for (let index = 0; index < 3; index++) await f.as.mutation(api.modules.posts.posts.publish, { networkId: f.root, body: `Publication ${index}` })
    expect(await codeOf(f.as.mutation(api.modules.posts.posts.publish, { networkId: f.root, body: "Publication de trop" }))).toBe("rateLimited")
    expect(await f.t.run(async (ctx) => ctx.db.query("posts").withIndex("by_network_status_publishedAt", (q) => q.eq("networkId", f.root)).take(10))).toHaveLength(3)
  })

  it("changer de réseau ne recrée pas le budget de publication", async () => {
    const f = await fixture()
    await consume(f.t, f.root, f.personId, "post.publish", 3)
    expect(await codeOf(consume(f.t, f.testClosed, f.personId, "post.publish"))).toBe("rateLimited")
  })

  it("le statut déclaré de l'enfant reste renforcé même si la racine est vérifiée", async () => {
    const f = await fixture()
    await f.t.run(async (ctx) => {
      const rootMembership = await ctx.db.query("networkMemberships").withIndex("by_network_and_person", (q) => q.eq("networkId", f.root).eq("personId", f.personId)).unique()
      if (!rootMembership) throw new Error("Adhésion de fixture absente")
      await ctx.db.patch(rootMembership._id, { status: "verifiee" })
    })
    await consume(f.t, f.testClosed, f.personId, "post.publish", 3)
    expect(await codeOf(consume(f.t, f.testClosed, f.personId, "post.publish"))).toBe("rateLimited")
  })

  it("un membre vérifié garde le budget ordinaire", async () => {
    const f = await fixture("verifiee")
    await consume(f.t, f.root, f.personId, "post.publish", 4)
  })

  it("une suspension racine expirée restaure aussitôt le quota déclaré sans attendre le cron", async () => {
    const f = await fixture()
    await f.t.run(async (ctx) => {
      const membership = await ctx.db.query("networkMemberships").withIndex("by_network_and_person", (q) => q.eq("networkId", f.root).eq("personId", f.personId)).unique()
      if (!membership) throw new Error("Adhésion de fixture absente")
      await ctx.db.patch(membership._id, { status: "suspendue", statusBeforeSuspension: "declaree", suspendedUntil: T0 })
    })
    for (let index = 0; index < 3; index++) await f.as.mutation(api.modules.posts.posts.publish, { networkId: f.root, body: `Après expiration ${index}` })
    expect(await codeOf(f.as.mutation(api.modules.posts.posts.publish, { networkId: f.root, body: "Publication de trop" }))).toBe("rateLimited")
    const physicalMembership = await f.t.run(async (ctx) => ctx.db.query("networkMemberships").withIndex("by_network_and_person", (q) => q.eq("networkId", f.root).eq("personId", f.personId)).unique())
    expect(physicalMembership?.status).toBe("suspendue")
  })

  it.each(["declaree", "verifiee"] as const)("une suspension enfant expirée restaure le budget de son statut antérieur %s", async (previousStatus) => {
    const f = await fixture("verifiee")
    await f.t.run(async (ctx) => {
      const membership = await ctx.db.query("networkMemberships").withIndex("by_network_and_person", (q) => q.eq("networkId", f.testClosed).eq("personId", f.personId)).unique()
      if (!membership) throw new Error("Adhésion de fixture absente")
      await ctx.db.patch(membership._id, { status: "suspendue", statusBeforeSuspension: previousStatus, suspendedUntil: T0 - 1 })
    })
    await consume(f.t, f.testClosed, f.personId, "post.publish", 3)
    expect(await codeOf(consume(f.t, f.testClosed, f.personId, "post.publish"))).toBe(previousStatus === "declaree" ? "rateLimited" : null)
  })

  it.each([
    { provider: "idn" as const, loa: 2 },
    { provider: "consular_attestation" as const },
    { provider: "administration" as const },
  ])("un badge serveur vivant $provider dispense du renforcement", async (link) => {
    const f = await fixture()
    await f.t.run(async (ctx) => ctx.db.insert("identityLinks", { ...link, personId: f.personId, subject: `proof-${link.provider}`, linkedAt: T0 }))
    await consume(f.t, f.root, f.personId, "post.publish", 4)
  })

  it("un IDN loa 1 ou un lien révoqué ne dispense pas", async () => {
    const f = await fixture()
    await f.t.run(async (ctx) => {
      await ctx.db.insert("identityLinks", { provider: "idn", loa: 1, personId: f.personId, subject: "low-loa", linkedAt: T0 })
      await ctx.db.insert("identityLinks", { provider: "administration", personId: f.personId, subject: "revoked-agent", linkedAt: T0, revokedAt: T0 })
    })
    await consume(f.t, f.root, f.personId, "post.publish", 3)
    expect(await codeOf(consume(f.t, f.root, f.personId, "post.publish"))).toBe("rateLimited")
  })

  it.each([
    ["comment.create", 5], ["upload.url", 12], ["message.send", 8],
  ] as const)("le type %s possède son propre budget renforcé", async (bucket, capacity) => {
    const f = await fixture()
    await consume(f.t, f.root, f.personId, bucket, capacity)
    expect(await codeOf(consume(f.t, f.root, f.personId, bucket))).toBe("rateLimited")
    // Le refus d'un type ne ferme pas un autre type de geste.
    await consume(f.t, f.root, f.personId, "post.publish")
  })

  it("le constructeur refuse une écriture même sans quota dans son handler", async () => {
    const f = await fixture()
    await consume(f.t, f.root, f.personId, "social.write", 150)
    expect(await codeOf(f.as.mutation(api.modules.posts.posts.unpinMyWall, { networkId: f.root }))).toBe("rateLimited")
    expect(await codeOf(f.as.mutation(api.modules.posts.posts.unpinMyWall, { networkId: f.testClosed }))).toBe("rateLimited")
  })

  it("un budget de départ reste disponible quand la publication est épuisée", async () => {
    const f = await fixture()
    await consume(f.t, f.root, f.personId, "post.publish", 3)
    await f.as.mutation(api.modules.posts.posts.unpinMyWall, { networkId: f.root })
    await consume(f.t, f.root, f.personId, "live.leave", 20)
  })

  it("les remèdes personnels n'exigent pas une adhésion", async () => {
    const f = await fixture("declaree", false)
    await f.as.mutation(api.modules.people.preferences.setMyPreferences, { locale: "en", timeZone: "Africa/Libreville" })
    expect((await f.t.run(async (ctx) => ctx.db.get(f.personId)))?.locale).toBe("en")
  })

  it("l'admission d'action refuse l'anonyme et le jeton de trop avant tout effet", async () => {
    const f = await fixture()
    const args = { networkId: f.root, minStatus: "declaree" as const, bucket: "call.token" as const }
    expect(await codeOf(f.t.mutation(internal.lib.actionAccess.admitActionWrite, args))).toBe("unauthenticated")
    await consume(f.t, f.root, f.personId, "call.token", 20)
    expect(await codeOf(f.as.mutation(internal.lib.actionAccess.admitActionWrite, args))).toBe("rateLimited")
  })
})
