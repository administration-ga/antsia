// @vitest-environment edge-runtime
import { describe, expect, it } from "vitest"

import { api, internal } from "../../_generated/api"
import { SEED_CONFIRMATION } from "../../seeds/foundations"
import { testConvex } from "../../test.setup"

describe("PA8 — capacités de modération vivantes", () => {
  it("relit les équipes, l'admission et le rôle, sans inventer une compétence nationale", async () => {
    const t = testConvex()
    const { root } = await t.mutation(internal.seeds.foundations.run, { confirmNonProduction: SEED_CONFIRMATION })
    const as = t.withIdentity({ subject: "capacity-fixture" })
    const personId = await as.mutation(api.modules.people.persons.ensureMyPerson, {})
    await as.mutation(api.modules.people.consents.recordConsent, { purpose: "social_profile", origin: "onboarding" })
    await as.mutation(api.modules.people.profile.publishMyProfile, { handle: "moderation.recette", displayName: "Modération fictive" })
    await as.mutation(api.modules.people.memberships.joinNetwork, { networkId: root })
    const teamId = await t.run((ctx) => ctx.db.insert("moderationTeams", { networkId: root, name: "Équipe fictive", scope: "post", active: true, createdAt: Date.now() }))
    expect(await as.query(api.modules.moderation.cases.myCapacity, { networkId: root })).toEqual({ networkWide: false, canReviewAppeals: false, canManagePolicy: false, teams: [] })
    const memberId = await t.run((ctx) => ctx.db.insert("moderationTeamMembers", { networkId: root, teamId, personId, active: true, updatedAt: Date.now() }))
    expect(await as.query(api.modules.moderation.cases.myCapacity, { networkId: root })).toEqual({ networkWide: false, canReviewAppeals: false, canManagePolicy: false, teams: [{ teamId, name: "Équipe fictive", scope: "post" }] })
    await t.run((ctx) => ctx.db.patch(memberId, { active: false }))
    expect(await as.query(api.modules.moderation.cases.myCapacity, { networkId: root })).toEqual({ networkWide: false, canReviewAppeals: false, canManagePolicy: false, teams: [] })
    await t.run(async (ctx) => {
      const membership = await ctx.db.query("networkMemberships").withIndex("by_network_and_person", (q) => q.eq("networkId", root).eq("personId", personId)).unique()
      if (membership) await ctx.db.patch(membership._id, { role: "network_admin" })
    })
    expect(await as.query(api.modules.moderation.cases.myCapacity, { networkId: root })).toMatchObject({ networkWide: true, canReviewAppeals: true, canManagePolicy: true, teams: [{ teamId }] })
    await t.run((ctx) => ctx.db.patch(teamId, { active: false }))
    expect(await as.query(api.modules.moderation.cases.myCapacity, { networkId: root })).toEqual({ networkWide: true, canReviewAppeals: true, canManagePolicy: true, teams: [] })
  })
})
