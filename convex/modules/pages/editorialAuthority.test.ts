// @vitest-environment edge-runtime
/** Autorité éditoriale : sessions réelles et transitions de page à horloge constante. */
import { engineErrorRule } from "@antsia/social-contracts/errors"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { api, internal } from "../../_generated/api"
import type { Id } from "../../_generated/dataModel"
import { SEED_CONFIRMATION } from "../../seeds/foundations"
import { createTestOperatorProof, testConvex } from "../../test.setup"

const NOW = Date.UTC(2026, 9, 21, 18)
const SIG = api.modules.pages.signatories
const ADMIN = api.modules.pages.admin
type T = ReturnType<typeof testConvex>

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(NOW) })
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers() })

async function fixture() {
  const t = testConvex()
  const { root } = await t.mutation(internal.seeds.foundations.run, { confirmNonProduction: SEED_CONFIRMATION })
  async function person(handle: string) {
    const as = t.withIdentity({ subject: `editorial-authority-${handle}` })
    const personId = await as.mutation(api.modules.people.persons.ensureMyPerson, {})
    await as.mutation(api.modules.people.consents.recordConsent, { purpose: "social_profile", origin: "onboarding" })
    await as.mutation(api.modules.people.profile.publishMyProfile, { handle, displayName: handle })
    await as.mutation(api.modules.people.memberships.joinNetwork, { networkId: root })
    await t.run(async ctx => {
      const membership = await ctx.db.query("networkMemberships").withIndex("by_network_and_person", q => q.eq("networkId", root).eq("personId", personId)).unique()
      if (membership) await ctx.db.patch(membership._id, { status: "verifiee" })
    })
    return { as, personId, handle }
  }
  const owner = await person("editorial-owner"), editor = await person("editorial-editor"), operator = await person("editorial-operator")
  const { pageId } = await owner.as.mutation(api.modules.pages.pages.createPage, { networkId: root, name: "Rédaction de recette", ownerKind: "company" })
  async function row(personId = editor.personId, targetPageId = pageId) {
    return await t.run(ctx => ctx.db.query("pageSignatories").withIndex("by_page_person", q => q.eq("pageId", targetPageId).eq("personId", personId)).unique())
  }
  async function makeOperator() {
    await t.run(async ctx => {
      await ctx.db.insert("operators", { personId: operator.personId, role: "platform_admin", grantedAt: NOW })
      const membership = await ctx.db.query("networkMemberships").withIndex("by_network_and_person", q => q.eq("networkId", root).eq("personId", operator.personId)).unique()
      if (membership) await ctx.db.patch(membership._id, { role: "network_moderator" })
    })
    await createTestOperatorProof(t, operator.as, operator.personId)
  }
  return { t, root, owner, editor, operator, pageId, row, makeOperator }
}

async function claimEvidence(t: T): Promise<Id<"_storage">> {
  return await t.run(async ctx => {
    const storageId = await ctx.storage.store(new Blob([new Uint8Array(64)], { type: "application/pdf" }))
    // Le harnais ne conserve pas contentType sans ce patch système, comme claims.test.ts.
    await (ctx.db as unknown as { patch: (table: "_storage", id: Id<"_storage">, value: { contentType: string }) => Promise<void> }).patch("_storage", storageId, { contentType: "application/pdf" })
    return storageId
  })
}

describe("autorité éditoriale — version monotone des habilitations", () => {
  it("invalide un admin→signatory→admin historique même avec le même id et Date.now constant", async () => {
    const f = await fixture()
    await f.t.run(async ctx => {
      await ctx.db.insert("pageSignatories", { networkId: f.root, pageId: f.pageId, personId: f.editor.personId, role: "admin", acceptedAt: NOW, createdAt: NOW, updatedAt: NOW })
    })
    const captured = (await f.row())!
    expect(captured.authorityRevision ?? 0).toBe(0)
    await f.owner.as.mutation(SIG.grantPageRole, { networkId: f.root, pageId: f.pageId, handle: f.editor.handle, role: "signatory" })
    expect((await f.row())?.authorityRevision).toBe(1)
    await f.owner.as.mutation(SIG.grantPageRole, { networkId: f.root, pageId: f.pageId, handle: f.editor.handle, role: "admin" })
    const current = (await f.row())!
    expect(current._id).toBe(captured._id)
    expect(current.role).toBe(captured.role)
    expect(current.updatedAt).toBe(captured.updatedAt)
    expect(current.acceptedAt).toBe(captured.acceptedAt)
    expect(current.authorityRevision).toBe(2)
    expect({ id: current._id, revision: current.authorityRevision ?? 0 }).not.toEqual({ id: captured._id, revision: captured.authorityRevision ?? 0 })
  })

  it("versionne l'acceptation, préserve les no-op et distingue suppression/réinvitation", async () => {
    const f = await fixture()
    await f.owner.as.mutation(SIG.grantPageRole, { networkId: f.root, pageId: f.pageId, handle: f.editor.handle, role: "signatory" })
    const invited = (await f.row())!
    expect(invited.authorityRevision).toBe(0)
    await f.owner.as.mutation(SIG.grantPageRole, { networkId: f.root, pageId: f.pageId, handle: f.editor.handle, role: "signatory" })
    expect(await f.row()).toEqual(invited)
    await f.editor.as.mutation(SIG.respondToPageInvitation, { networkId: f.root, pageId: f.pageId, accept: true })
    const accepted = (await f.row())!
    expect(accepted.authorityRevision).toBe(1)
    await f.owner.as.mutation(SIG.grantPageRole, { networkId: f.root, pageId: f.pageId, handle: f.editor.handle, role: "signatory" })
    expect(await f.row()).toEqual(accepted)
    await f.owner.as.mutation(SIG.revokePageRole, { networkId: f.root, pageId: f.pageId, personId: f.editor.personId })
    await f.owner.as.mutation(SIG.grantPageRole, { networkId: f.root, pageId: f.pageId, handle: f.editor.handle, role: "signatory" })
    await f.editor.as.mutation(SIG.respondToPageInvitation, { networkId: f.root, pageId: f.pageId, accept: true })
    const recreated = (await f.row())!
    expect(recreated._id).not.toBe(accepted._id)
    expect(recreated.authorityRevision).toBe(1)
  })

  it("versionne la promotion console et conserve son rejeu sans effet", async () => {
    const f = await fixture()
    await f.owner.as.mutation(SIG.grantPageRole, { networkId: f.root, pageId: f.pageId, handle: f.editor.handle, role: "signatory" })
    await f.editor.as.mutation(SIG.respondToPageInvitation, { networkId: f.root, pageId: f.pageId, accept: true })
    await f.makeOperator()
    await f.operator.as.mutation(ADMIN.grantPageAdmin, { pageId: f.pageId, personId: f.editor.personId, reason: "Promotion tracée de recette." })
    const promoted = (await f.row())!
    expect(promoted).toMatchObject({ role: "admin", authorityRevision: 2, acceptedAt: NOW })
    await f.operator.as.mutation(ADMIN.grantPageAdmin, { pageId: f.pageId, personId: f.editor.personId, reason: "Rejeu tracé sans modification." })
    expect(await f.row()).toEqual(promoted)
  })

  it.each(["signatory", "pending_admin", "accepted_admin"] as const)("versionne uniquement le changement d'autorité d'une revendication %s", async scenario => {
    const f = await fixture()
    await f.makeOperator()
    const pageId = await f.t.run(async ctx => {
      const id = await ctx.db.insert("pages", { networkId: f.root, handle: "editorial-claim", name: "Rédaction à vérifier", ownerKind: "association", trust: "community", trustRank: 0,
        visibility: "network", onRoot: true, status: "active", searchText: "redaction", createdAt: NOW, updatedAt: NOW })
      await ctx.db.insert("pageSignatories", { networkId: f.root, pageId: id, personId: f.editor.personId,
        role: scenario === "signatory" ? "signatory" : "admin", ...(scenario === "pending_admin" ? {} : { acceptedAt: NOW }), createdAt: NOW, updatedAt: NOW })
      return id
    })
    const before = (await f.row(f.editor.personId, pageId))!
    const storageId = await claimEvidence(f.t)
    const { claimId } = await f.editor.as.mutation(api.modules.pages.claims.requestPageClaim, { networkId: f.root, pageId, evidence: [{ storageId, mimeType: "application/pdf" }] })
    await f.operator.as.mutation(api.modules.pages.claims.decidePageClaim, { networkId: f.root, claimId, decision: "approved", reason: "Mandat déclaré examiné pour recette." })
    const current = (await f.row(f.editor.personId, pageId))!
    expect(current._id).toBe(before._id)
    expect(current.role).toBe("admin")
    expect(current.acceptedAt).toBe(NOW)
    expect(current.authorityRevision ?? 0).toBe(scenario === "accepted_admin" ? 0 : 1)
  })

  it("conserve l'exigence d'identité forte pour une page officielle", async () => {
    const f = await fixture()
    await f.makeOperator()
    const { pageId } = await f.operator.as.mutation(ADMIN.createInstitutionPage, { networkId: f.root, name: "Institution de recette", reason: "Création officielle synthétique." })
    let error: unknown
    try { await f.operator.as.mutation(ADMIN.grantPageAdmin, { pageId, personId: f.editor.personId, reason: "Mandat sans identité forte." }) } catch (caught) { error = caught }
    expect(engineErrorRule(error)?.rule).toBe("PAGE_SIGNATORY_IDENTITY_REQUIRED")
    expect(await f.row(f.editor.personId, pageId)).toBeNull()
  })
})
