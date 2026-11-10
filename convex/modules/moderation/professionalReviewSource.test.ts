// @vitest-environment edge-runtime
/** MP09 : révision relue, extrait complet et compétence vivante ; aucune publication réelle. */
import { engineErrorCode } from "@antsia/social-contracts/errors"
import { PROFESSIONAL_PROFILE_CONSENT_VERSION } from "@antsia/social-domain/professionals"
import { describe, expect, it } from "vitest"

import { api, internal } from "../../_generated/api"
import type { Id } from "../../_generated/dataModel"
import { SEED_CONFIRMATION } from "../../seeds/foundations"
import { testConvex } from "../../test.setup"

type T = ReturnType<typeof testConvex>
const CASES = api.modules.moderation.cases
const PREVIEW = api.modules.moderation.reviewProjection.preview

async function person(t: T, networkId: Id<"networks">, handle: string, role: "member" | "network_admin" = "member") {
  const as = t.withIdentity({ subject: `mp09-review-${handle}` })
  const personId = await as.mutation(api.modules.people.persons.ensureMyPerson, {})
  await as.mutation(api.modules.people.consents.recordConsent, { purpose: "social_profile", origin: "onboarding" })
  await as.mutation(api.modules.people.profile.publishMyProfile, { handle, displayName: handle })
  await as.mutation(api.modules.people.memberships.joinNetwork, { networkId })
  await t.run(async ctx => {
    const membership = await ctx.db.query("networkMemberships").withIndex("by_network_and_person", q => q.eq("networkId", networkId).eq("personId", personId)).unique()
    if (membership) await ctx.db.patch(membership._id, { role })
  })
  return { as, personId }
}

async function fixture(kind: "professionalProfile" | "professionalCollaboration") {
  const t = testConvex(), now = Date.now()
  const { root } = await t.mutation(internal.seeds.foundations.run, { confirmNonProduction: SEED_CONFIRMATION })
  const author = await person(t, root, "mp09-author"), recipient = await person(t, root, "mp09-recipient"), admin = await person(t, root, "mp09-admin", "network_admin")
  const target = await t.run(async ctx => {
    const profileId = await ctx.db.insert("professionalProfiles", { networkId: root, personId: author.personId, revision: 1, state: "published",
      title: "Spécialiste", bio: "Présentation. ".repeat(110), skills: ["Conseil"], languageCodes: ["fr"], zone: "Libreville", availability: "available", collaborationTypes: ["project"],
      portfolio: Array.from({ length: 6 }, (_, index) => ({ title: `Projet ${index}`, description: index === 5 ? `${"z".repeat(460)} CLAUSE FINALE VISIBLE` : "p".repeat(500) })),
      activityPageIds: [], visibility: "network", publicFields: [], consentTextVersion: PROFESSIONAL_PROFILE_CONSENT_VERSION, consentedAt: now, searchText: "specialiste", createdAt: now, updatedAt: now })
    const collaborationId = await ctx.db.insert("professionalCollaborations", { networkId: root,
      personIdLow: author.personId < recipient.personId ? author.personId : recipient.personId, personIdHigh: author.personId < recipient.personId ? recipient.personId : author.personId,
      fromPersonId: author.personId, toPersonId: recipient.personId, collaborationType: "project", message: "Message initial à examiner.", status: "pending", revision: 1,
      createdAt: now, proposedAt: now, updatedAt: now, cooldownUntil: now + 86_400_000 })
    const target = kind === "professionalProfile" ? { kind, id: profileId } as const : { kind, id: collaborationId } as const
    await ctx.db.insert("moderationContentStates", { networkId: root, targetKind: kind, targetId: target.id, ownerPersonId: author.personId, status: "pending_review", createdAt: now, updatedAt: now })
    return target
  })
  return { t, root, author, recipient, admin, target }
}
async function code(promise: Promise<unknown>) { try { await promise; return null } catch (error) { return engineErrorCode(error) } }

describe("MP09 — preuve obligatoire de la révision professionnelle modérée", () => {
  it.each(["professionalProfile", "professionalCollaboration"] as const)("refuse %s sans preuve et rend seulement un extrait intégral borné", async kind => {
    const f = await fixture(kind)
    const preview = await f.admin.as.query(PREVIEW, { networkId: f.root, target: f.target })
    expect(preview).toMatchObject({ kind, available: true, sourceRevision: 1, sourceDigest: expect.stringMatching(/^[a-f0-9]{64}$/) })
    if (kind === "professionalProfile") { expect(preview.body!.length).toBeGreaterThan(4000); expect(preview.body).toContain("CLAUSE FINALE VISIBLE") }
    else expect(preview.body).toBe("Message initial à examiner.")
    expect(JSON.stringify(preview)).not.toContain(f.author.personId)
    expect(JSON.stringify(preview)).not.toContain(f.recipient.personId)
    expect(await code(f.admin.as.mutation(CASES.reviewContent, { networkId: f.root, target: f.target, approve: true, reason: "Contenu relu." }))).toBe("notFound")
    const state = await f.t.run(ctx => ctx.db.query("moderationContentStates").withIndex("by_target", q => q.eq("targetKind", kind).eq("targetId", f.target.id)).unique())
    expect(state?.status).toBe("pending_review")
  })

  it.each([["professionalProfile", true], ["professionalProfile", false], ["professionalCollaboration", true], ["professionalCollaboration", false]] as const)("refuse %s approve=%s en R+1 après sa prélecture", async (kind, approve) => {
    const f = await fixture(kind)
    const preview = await f.admin.as.query(PREVIEW, { networkId: f.root, target: f.target })
    await f.t.run(async ctx => {
      if (f.target.kind === "professionalProfile") await ctx.db.patch(f.target.id, { revision: 2, bio: "Nouvelle présentation non relue." })
      else await ctx.db.patch(f.target.id, { revision: 2, message: "Nouveau message non relu." })
    })
    expect(await code(f.admin.as.mutation(CASES.reviewContent, { networkId: f.root, target: f.target, approve, reason: "Ancienne présentation relue.", expectedSourceRevision: preview.sourceRevision, expectedSourceDigest: preview.sourceDigest }))).toBe("notFound")
  })

  it("vérifie aussi l'empreinte de la collaboration, même si une écriture garde sa révision", async () => {
    const f = await fixture("professionalCollaboration")
    const preview = await f.admin.as.query(PREVIEW, { networkId: f.root, target: f.target })
    await f.t.run(async ctx => { await ctx.db.patch(f.target.id, { message: "Autre message non présenté." }) })
    expect(await code(f.admin.as.mutation(CASES.reviewContent, { networkId: f.root, target: f.target, approve: false, reason: "Message relu.", expectedSourceRevision: preview.sourceRevision, expectedSourceDigest: preview.sourceDigest }))).toBe("notFound")
  })

  it.each(["professionalProfile", "professionalCollaboration"] as const)("admet %s avec preuve fraîche et refuse le simple membre", async kind => {
    const f = await fixture(kind)
    const preview = await f.admin.as.query(PREVIEW, { networkId: f.root, target: f.target })
    const args = { networkId: f.root, target: f.target, approve: true, reason: "Contenu intégral relu.", expectedSourceRevision: preview.sourceRevision, expectedSourceDigest: preview.sourceDigest }
    expect(await code(f.recipient.as.mutation(CASES.reviewContent, args))).toBe("notFound")
    await f.admin.as.mutation(CASES.reviewContent, args)
    const state = await f.t.run(ctx => ctx.db.query("moderationContentStates").withIndex("by_target", q => q.eq("targetKind", kind).eq("targetId", f.target.id)).unique())
    expect(state?.status).toBe("published")
  })

  it("refuse une partie devenue administratrice et l'habilitation révoquée après prélecture", async () => {
    const f = await fixture("professionalCollaboration")
    const preview = await f.admin.as.query(PREVIEW, { networkId: f.root, target: f.target })
    const args = { networkId: f.root, target: f.target, approve: true, reason: "Message intégral relu.", expectedSourceRevision: preview.sourceRevision, expectedSourceDigest: preview.sourceDigest }
    await f.t.run(async ctx => {
      for (const [personId, role] of [[f.recipient.personId, "network_admin"], [f.admin.personId, "member"]] as const) {
        const membership = await ctx.db.query("networkMemberships").withIndex("by_network_and_person", q => q.eq("networkId", f.root).eq("personId", personId)).unique()
        if (membership) await ctx.db.patch(membership._id, { role })
      }
    })
    expect(await code(f.recipient.as.mutation(CASES.reviewContent, args))).toBe("notFound")
    expect(await code(f.admin.as.mutation(CASES.reviewContent, args))).toBe("notFound")
  })
})
