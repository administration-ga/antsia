// @vitest-environment edge-runtime
/** Le refus attendu de débit ne crée ni invitation ni notification, sans élargir les autres gardes. */
import { engineErrorCode } from "@antsia/social-contracts/errors"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { api, internal } from "../../_generated/api"
import type { Id } from "../../_generated/dataModel"
import { SEED_CONFIRMATION } from "../../seeds/foundations"
import { testConvex } from "../../test.setup"

type T = ReturnType<typeof testConvex>
const NOW = Date.UTC(2026, 9, 20, 12)
const C = api.modules.graph.connections

beforeEach(() => {
  vi.stubEnv("CONVEX_CLOUD_URL", "http://127.0.0.1:3210")
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(NOW)
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

async function enter(t: T, networkId: Id<"networks">, handle: string) {
  const as = t.withIdentity({ subject: handle })
  const personId = await as.mutation(api.modules.people.persons.ensureMyPerson, {})
  await as.mutation(api.modules.people.consents.recordConsent, { purpose: "social_profile", origin: "onboarding" })
  await as.mutation(api.modules.people.profile.publishMyProfile, { handle, displayName: handle })
  await as.mutation(api.modules.people.memberships.joinNetwork, { networkId })
  return { as, personId, handle }
}

async function fixture() {
  const t = testConvex()
  const { root } = await t.mutation(internal.seeds.foundations.run, { confirmNonProduction: SEED_CONFIRMATION })
  const alice = await enter(t, root, "rate-alice")
  const bob = await enter(t, root, "rate-bob")
  const carol = await enter(t, root, "rate-carol")
  const dana = await enter(t, root, "rate-dana")
  const erin = await enter(t, root, "rate-erin")
  const frank = await enter(t, root, "rate-frank")
  return { t, root, alice, bob, carol, dana, erin, frank }
}

async function graphSnapshot(t: T) {
  return await t.run(async (ctx) => ({
    connections: await ctx.db.query("connections").take(20),
    notifications: await ctx.db.query("notifications").take(20),
  }))
}

async function codeOf(promise: Promise<unknown>) {
  try { await promise; return null } catch (error) { return engineErrorCode(error) }
}

describe("demande de connexion — refus de débit rendu comme un résultat", () => {
  it("admet trois demandes déclarées, rend le délai sans effet social, isole les acteurs et reprend après le délai", async () => {
    const { t, root, alice, bob, carol, dana, erin, frank } = await fixture()
    expect(await t.run(async (ctx) => (await ctx.db.query("networkMemberships")
      .withIndex("by_network_and_person", (q) => q.eq("networkId", root).eq("personId", alice.personId))
      .unique())?.status)).toBe("declaree")

    for (const target of [bob, carol, dana]) {
      expect(await alice.as.mutation(C.requestConnection, { returnRateLimit: true, networkId: root, handle: target.handle })).toEqual({ status: "requested" })
    }
    const beforeLimit = await graphSnapshot(t)
    expect(beforeLimit.connections).toHaveLength(3)
    expect(beforeLimit.notifications).toHaveLength(3)
    expect(beforeLimit.notifications.every((notification) => notification.kind === "connection_request")).toBe(true)

    const result = await alice.as.mutation(C.requestConnection, { returnRateLimit: true, networkId: root, handle: erin.handle })
    expect(result.status).toBe("rateLimited")
    if (result.status !== "rateLimited") throw new Error("Le quatrième appel devait rendre un refus de débit")
    expect(Number.isFinite(result.retryAfterMs)).toBe(true)
    expect(result.retryAfterMs).toBeGreaterThan(0)
    expect(result.retryAfterMs).toBeCloseTo(360_000, 0)
    expect(await graphSnapshot(t)).toEqual(beforeLimit)
    // Un client historique sans option ne doit jamais confondre le refus avec un succès.
    expect(await codeOf(alice.as.mutation(C.requestConnection, { networkId: root, handle: erin.handle }))).toBe("rateLimited")
    expect(await graphSnapshot(t)).toEqual(beforeLimit)

    expect(await frank.as.mutation(C.requestConnection, { returnRateLimit: true, networkId: root, handle: erin.handle })).toEqual({ status: "requested" })
    const independent = await graphSnapshot(t)
    expect(independent.connections).toHaveLength(4)
    expect(independent.notifications).toHaveLength(4)

    vi.setSystemTime(NOW + result.retryAfterMs + 1)
    expect(await alice.as.mutation(C.requestConnection, { returnRateLimit: true, networkId: root, handle: erin.handle })).toEqual({ status: "requested" })
    const afterRetry = await graphSnapshot(t)
    expect(afterRetry.connections).toHaveLength(5)
    expect(afterRetry.notifications).toHaveLength(5)
    expect(afterRetry.connections.filter((connection) => connection.requestedByPersonId === alice.personId)).toHaveLength(4)
  })

  it("laisse les erreurs de cible inconnue et de demande à soi-même levées avant épuisement du budget", async () => {
    const { t, root, alice, bob, carol, dana } = await fixture()
    const before = await graphSnapshot(t)
    expect(await codeOf(alice.as.mutation(C.requestConnection, { returnRateLimit: true, networkId: root, handle: "rate-inconnue" }))).toBe("notFound")
    expect(await codeOf(alice.as.mutation(C.requestConnection, { returnRateLimit: true, networkId: root, handle: alice.handle }))).toBe("invalidArgument")
    expect(await graphSnapshot(t)).toEqual(before)

    for (const target of [bob, carol, dana]) {
      expect(await alice.as.mutation(C.requestConnection, { returnRateLimit: true, networkId: root, handle: target.handle })).toEqual({ status: "requested" })
    }
  })
})
