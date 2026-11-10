// @vitest-environment edge-runtime
/** MP10–MP11 : seules les capacités fermées sont lues ; aucun profil ou intérêt n'est créé. */
import { engineErrorCode } from "@antsia/social-contracts/errors"
import { PERSONAL_MEETINGS_CAPABILITIES } from "@antsia/social-domain/personalMeetings"
import { makeFunctionReference } from "convex/server"
import { describe, expect, it } from "vitest"

import { api, internal } from "../../_generated/api"
import type { Id } from "../../_generated/dataModel"
import { SEED_CONFIRMATION } from "../../seeds/foundations"
import { testConvex } from "../../test.setup"

const CAPABILITIES = api.modules.personalMeetings.capabilities.get
async function fixture() {
  const t = testConvex()
  const { root, testClosed } = await t.mutation(internal.seeds.foundations.run, { confirmNonProduction: SEED_CONFIRMATION })
  const as = t.withIdentity({ subject: "personal-meetings-fixture" })
  const personId = await as.mutation(api.modules.people.persons.ensureMyPerson, {})
  await as.mutation(api.modules.people.consents.recordConsent, { purpose: "social_profile", origin: "onboarding" })
  await as.mutation(api.modules.people.profile.publishMyProfile, { handle: "meetings-closed", displayName: "Recette Rencontres" })
  await as.mutation(api.modules.people.memberships.joinNetwork, { networkId: root })
  const membershipId = await t.run(async ctx => {
    const membership = await ctx.db.query("networkMemberships").withIndex("by_network_and_person", q => q.eq("networkId", root).eq("personId", personId)).unique()
    if (!membership) throw new Error("Missing fixture membership")
    return membership._id
  })
  return { t, root, testClosed, as, personId, membershipId }
}
async function code(work: Promise<unknown>) { try { await work; return null } catch (error) { return engineErrorCode(error) } }

describe("MP10–MP11 — rencontres personnelles fermées", () => {
  it("exige une session et une adhésion déclarée du réseau demandé", async () => {
    const f = await fixture()
    expect(await code(f.t.query(CAPABILITIES, { networkId: f.root }))).toBe("unauthenticated")
    expect(await code(f.as.query(CAPABILITIES, { networkId: f.testClosed }))).toBe("notFound")
    await f.t.run(async ctx => { await ctx.db.patch(f.membershipId, { status: "en_attente" }) })
    expect(await code(f.as.query(CAPABILITIES, { networkId: f.root }))).toBe("statusInsufficient")
  })

  it("garde les quatre capacités fermées après vérification ou nomination administrateur", async () => {
    const f = await fixture()
    expect(await f.as.query(CAPABILITIES, { networkId: f.root })).toEqual(PERSONAL_MEETINGS_CAPABILITIES)
    await f.t.run(async ctx => { await ctx.db.patch(f.membershipId, { status: "verifiee", role: "network_admin" }) })
    expect(await f.as.query(CAPABILITIES, { networkId: f.root })).toEqual(PERSONAL_MEETINGS_CAPABILITIES)
    expect(await f.as.query(CAPABILITIES, { networkId: f.root })).not.toHaveProperty("dateOfBirth")
    expect(await f.t.run(ctx => ctx.db.query("professionalProfiles").take(1))).toEqual([])
    expect(await f.t.run(ctx => ctx.db.query("contextualThreads").take(1))).toEqual([])
  })

  it("relit suspension et départ avant toute réponse", async () => {
    const f = await fixture()
    await f.t.run(async ctx => { await ctx.db.patch(f.membershipId, { status: "suspendue" }) })
    expect(await code(f.as.query(CAPABILITIES, { networkId: f.root }))).toBe("membershipSuspended")
    await f.t.run(async ctx => { await ctx.db.patch(f.membershipId, { status: "partie" }) })
    expect(await code(f.as.query(CAPABILITIES, { networkId: f.root }))).toBe("notFound")
  })

  it("n'admet aucun paramètre déclaratif pour lever la fermeture", async () => {
    const f = await fixture()
    const loose = makeFunctionReference<"query", { networkId: Id<"networks">; majorityConfirmed: boolean }, unknown>("modules/personalMeetings/capabilities:get")
    await expect(f.as.query(loose, { networkId: f.root, majorityConfirmed: true })).rejects.toThrow()
    expect(await f.as.query(CAPABILITIES, { networkId: f.root })).toEqual(PERSONAL_MEETINGS_CAPABILITIES)
  })
})
