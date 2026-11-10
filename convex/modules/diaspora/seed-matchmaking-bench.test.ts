// @vitest-environment edge-runtime
/**
 * LX-04 — banc de recette local de la mise en relation : graine refusée hors backend local (même
 * avec les graines autorisées), refusée sans confirmation, rien de créé d'office, idempotente,
 * équipe partagée avec les comptes de démonstration, et AUCUNE écriture de politique depuis la
 * tranche (l'ouverture attend l'extraction du cœur de `setPolicy`, issue [S1]).
 */
import { CONTEXTUAL_KINDS } from "@antsia/social-domain/contextualMessaging"
import { DIASPORALE_DEMO_ACTOR_SPECS, diasporaleDemoEmailOf } from "@diasporale/domain"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { components, internal } from "../../_generated/api"
import type { Id } from "../../_generated/dataModel"
import { SEED_CONFIRMATION } from "../../seeds/foundations"
import { testConvex } from "../../test.setup"

type T = ReturnType<typeof testConvex>

const ARGS = { confirmNonProduction: SEED_CONFIRMATION }
/** Le nom de l'équipe de démonstration, écrit en clair : une dérive du module doit casser le test. */
const DEMO_TEAM_NAME = "Équipe de démonstration"
const NOW = Date.UTC(2026, 10, 10, 9)

beforeEach(() => {
  vi.stubEnv("CONVEX_CLOUD_URL", "http://127.0.0.1:3210")
})

afterEach(() => {
  vi.unstubAllEnvs()
})

async function seedNetworks(t: T) {
  const foundations = await t.mutation(internal.seeds.foundations.run, ARGS)
  const diaspora = await t.mutation(internal.modules.diaspora.seed.run, ARGS)
  return { root: foundations.root, diasporale: diaspora.network }
}

/** Le compte de la modératrice de démonstration, tel que l'accueil et l'équipement le laissent. */
async function demoModerator(t: T, root: Id<"networks">, diasporale: Id<"networks">, options: { email?: string; status?: "verifiee" | "suspendue" } = {}) {
  const profile = DIASPORALE_DEMO_ACTOR_SPECS.moderateur.profile
  if (!profile) throw new Error("Profil de démonstration absent")
  const user: unknown = await t.mutation(components.betterAuth.adapter.create, {
    input: { model: "user", data: { name: "Ruth ALLOGHO", email: options.email ?? diasporaleDemoEmailOf("moderateur"), emailVerified: true, createdAt: NOW, updatedAt: NOW } },
  })
  if (typeof user !== "object" || user === null || !("_id" in user) || typeof user._id !== "string") throw new Error("Utilisateur fictif de test absent")
  const authUserId = user._id
  return await t.run(async (ctx) => {
    const personId = await ctx.db.insert("persons", { authUserId, handle: profile.handle, displayName: "Ruth ALLOGHO", publishedAt: NOW, createdAt: NOW, updatedAt: NOW })
    await ctx.db.insert("networkMemberships", { networkId: root, personId, status: "verifiee", role: "member", joinedAt: NOW, statusChangedAt: NOW })
    await ctx.db.insert("networkMemberships", { networkId: diasporale, personId, status: options.status ?? "verifiee", role: "network_moderator", joinedAt: NOW, statusChangedAt: NOW })
    return personId
  })
}

async function teams(t: T) {
  return await t.run(async (ctx) => await ctx.db.query("moderationTeams").take(10))
}

async function teamMembers(t: T) {
  return await t.run(async (ctx) => await ctx.db.query("moderationTeamMembers").take(10))
}

async function policyRows(t: T) {
  return await t.run(async (ctx) => await ctx.db.query("contextualPolicies").take(10))
}

describe("diaspora/seed:matchmakingBenchForRecette (LX-04)", () => {
  it("refuse sans l'argument de confirmation, avant toute écriture", async () => {
    const t = testConvex()
    await seedNetworks(t)
    await expect(t.mutation(internal.modules.diaspora.seed.matchmakingBenchForRecette, { confirmNonProduction: "oui" })).rejects.toThrow(/hors production/)
    expect(await teams(t)).toEqual([])
  })

  it.each([
    ["un déploiement en nuage", "https://recette-123.convex.cloud"],
    ["la démonstration en ligne", "https://demonstration-fictive-1.convex.cloud"],
    ["une adresse locale déguisée", "http://127.0.0.1.exemple.test:3210"],
  ])("refuse %s, même avec les graines autorisées et la démonstration déclarée", async (_label, url) => {
    const t = testConvex()
    await seedNetworks(t)
    vi.stubEnv("CONVEX_CLOUD_URL", url)
    vi.stubEnv("ANTSIA_SEEDS_ALLOWED", "true")
    // La démonstration déclarée ouvre les comptes de démonstration, jamais cette graine.
    vi.stubEnv("ANTSIA_DEMO_DEPLOYMENT", "demonstration-fictive-1")
    vi.stubEnv("ANTSIA_DEV_TOOLS", "true")
    await expect(t.mutation(internal.modules.diaspora.seed.matchmakingBenchForRecette, ARGS)).rejects.toThrow(/backend local obligatoire/)
    expect(await teams(t)).toEqual([])
    expect(await policyRows(t)).toEqual([])
  })

  it("ne crée aucun réseau quand DIASPORALE n'existe pas", async () => {
    const t = testConvex()
    await expect(t.mutation(internal.modules.diaspora.seed.matchmakingBenchForRecette, ARGS)).rejects.toThrow(/réseau diasporale actif/)
    expect(await t.run(async (ctx) => await ctx.db.query("networks").take(5))).toEqual([])
    expect(await teams(t)).toEqual([])
  })

  it("en local : pose l'équipe de démonstration et y met la modératrice déjà entrée ; rejouée, ne double rien", async () => {
    const t = testConvex()
    const { root, diasporale } = await seedNetworks(t)
    const moderator = await demoModerator(t, root, diasporale)

    const first = await t.mutation(internal.modules.diaspora.seed.matchmakingBenchForRecette, ARGS)
    expect(first).toMatchObject({ network: diasporale, team: { created: true, moderatorsAdded: 1 } })
    expect(await teams(t)).toEqual([expect.objectContaining({ _id: first.team.teamId, networkId: diasporale, name: DEMO_TEAM_NAME, active: true })])
    expect((await teams(t))[0]?.scope).toBeUndefined()
    expect(await teamMembers(t)).toEqual([expect.objectContaining({ networkId: diasporale, teamId: first.team.teamId, personId: moderator, active: true })])

    const replay = await t.mutation(internal.modules.diaspora.seed.matchmakingBenchForRecette, ARGS)
    expect(replay).toEqual({ ...first, team: { teamId: first.team.teamId, created: false, moderatorsAdded: 0 } })
    expect(await teams(t)).toHaveLength(1)
    expect(await teamMembers(t)).toHaveLength(1)
  })

  it("retrouve l'équipe posée par l'équipement des comptes, et réactive la modératrice retirée", async () => {
    const t = testConvex()
    const { root, diasporale } = await seedNetworks(t)
    const moderator = await demoModerator(t, root, diasporale)
    const teamId = await t.run(async (ctx) => {
      const id = await ctx.db.insert("moderationTeams", { networkId: diasporale, name: DEMO_TEAM_NAME, active: true, createdAt: NOW })
      await ctx.db.insert("moderationTeamMembers", { networkId: diasporale, teamId: id, personId: moderator, active: false, updatedAt: NOW })
      return id
    })

    expect((await t.mutation(internal.modules.diaspora.seed.matchmakingBenchForRecette, ARGS)).team).toEqual({ teamId, created: false, moderatorsAdded: 1 })
    expect(await teams(t)).toHaveLength(1)
    expect(await teamMembers(t)).toEqual([expect.objectContaining({ teamId, personId: moderator, active: true })])
  })

  it("ne met dans l'équipe ni un faux compte au même identifiant, ni une modératrice suspendue", async () => {
    const t = testConvex()
    const { root, diasporale } = await seedNetworks(t)
    await demoModerator(t, root, diasporale, { email: "quelqu.un@exemple.test" })
    expect((await t.mutation(internal.modules.diaspora.seed.matchmakingBenchForRecette, ARGS)).team).toMatchObject({ created: true, moderatorsAdded: 0 })
    expect(await teamMembers(t)).toEqual([])

    const other = testConvex()
    const networks = await seedNetworks(other)
    await demoModerator(other, networks.root, networks.diasporale, { status: "suspendue" })
    expect((await other.mutation(internal.modules.diaspora.seed.matchmakingBenchForRecette, ARGS)).team.moderatorsAdded).toBe(0)
    expect(await teamMembers(other)).toEqual([])
  })

  it("relit les trois politiques de mise en relation sans jamais les écrire depuis la tranche", async () => {
    const t = testConvex()
    const { diasporale } = await seedNetworks(t)
    const closed = await t.mutation(internal.modules.diaspora.seed.matchmakingBenchForRecette, ARGS)
    expect(closed.policies).toEqual(CONTEXTUAL_KINDS.map((kind) => ({ kind, enabled: false })))
    expect(await policyRows(t)).toEqual([])

    // Une politique ouverte par la console (ligne du moteur) est rendue telle quelle.
    await t.run(async (ctx) => {
      await ctx.db.insert("contextualPolicies", { networkId: diasporale, kind: "diasporaServiceRequest", enabled: true, updatedAt: NOW })
    })
    const reported = await t.mutation(internal.modules.diaspora.seed.matchmakingBenchForRecette, ARGS)
    expect(reported.policies).toEqual([
      { kind: "diasporaServiceRequest", enabled: true },
      { kind: "diasporaMentoring", enabled: false },
      { kind: "diasporaJobApplication", enabled: false },
    ])
    expect(await policyRows(t)).toHaveLength(1)
  })
})
