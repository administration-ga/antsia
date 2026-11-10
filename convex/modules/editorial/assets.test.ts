// @vitest-environment edge-runtime
import { engineErrorCode } from "@antsia/social-contracts/errors"
import { EDITORIAL_IMAGE_CONSENT_VERSION } from "@antsia/social-domain/editorialAssets"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { api, internal } from "../../_generated/api"
import { SEED_CONFIRMATION } from "../../seeds/foundations"
import { testConvex } from "../../test.setup"
import { assertEditorialAssetsForPublication, editorialAssetForReading } from "./assets"

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(Date.UTC(2026, 9, 21, 18)) })
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers() })
async function fixture() {
  const t = testConvex(), { root, testClosed } = await t.mutation(internal.seeds.foundations.run, { confirmNonProduction: SEED_CONFIRMATION })
  async function person(handle: string) {
    const as = t.withIdentity({ subject: `editorial-asset-${handle}` })
    const personId = await as.mutation(api.modules.people.persons.ensureMyPerson, {})
    await as.mutation(api.modules.people.consents.recordConsent, { purpose: "social_profile", origin: "onboarding" })
    await as.mutation(api.modules.people.profile.publishMyProfile, { handle, displayName: handle })
    await as.mutation(api.modules.people.memberships.joinNetwork, { networkId: root })
    return { as, personId }
  }
  const owner = await person("editorial-asset-owner"), other = await person("editorial-asset-other")
  const pageId = await t.run(async ctx => {
    const pageId = await ctx.db.insert("pages", { networkId: root, handle: "asset-journal", name: "Journal de recette", ownerKind: "media", trust: "community", trustRank: 0, visibility: "network", onRoot: true, status: "active", searchText: "journal", createdAt: Date.now(), updatedAt: Date.now() })
    await ctx.db.insert("pageSignatories", { networkId: root, pageId, personId: owner.personId, role: "admin", acceptedAt: Date.now(), createdAt: Date.now(), updatedAt: Date.now() })
    return pageId
  })
  await owner.as.mutation(api.modules.editorial.media.saveConfig, { networkId: root, pageId, expectedRevision: 0, input: { description: "Un média de recette", sections: [], visibility: "network" } })
  async function image(type = "image/png") { return t.run(async ctx => ctx.storage.store(new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1])], { type }))) }
  async function attach() { const storageId = await image(); return { storageId, ...await owner.as.mutation(api.modules.editorial.assets.attach, { networkId: root, pageId, storageId, mimeType: "image/png", altText: "Une illustration de recette", credit: "La rédaction", rightsConsentTextVersion: EDITORIAL_IMAGE_CONSENT_VERSION }) } }
  return { t, root, testClosed, owner, other, pageId, image, attach }
}
async function code(work: Promise<unknown>) { try { await work; return null } catch (error) { return engineErrorCode(error) } }

describe("MP12 fichiers de rédaction", () => {
  it("refuse le visiteur, le membre sans habilitation et un autre réseau", async () => {
    const f = await fixture(), args = { networkId: f.root, pageId: f.pageId }
    expect(await code(f.t.mutation(api.modules.editorial.assets.uploadUrl, args))).not.toBeNull()
    expect(await code(f.other.as.mutation(api.modules.editorial.assets.uploadUrl, args))).not.toBeNull()
    expect(await code(f.owner.as.mutation(api.modules.editorial.assets.uploadUrl, { ...args, networkId: f.testClosed }))).not.toBeNull()
  })
  it("admet une image neuve avec ses droits mais ne délivre rien avant analyse", async () => {
    const f = await fixture(), { assetId, storageId } = await f.attach()
    const result = await f.owner.as.query(api.modules.editorial.assets.list, { networkId: f.root, pageId: f.pageId, paginationOpts: { cursor: null, numItems: 12 } })
    expect(result.page).toEqual([{ assetId, url: null, withheld: "fileScanPending", altText: "Une illustration de recette", credit: "La rédaction" }])
    expect(JSON.stringify(result)).not.toContain(storageId)
    expect(await code(f.t.run(async ctx => assertEditorialAssetsForPublication(ctx, { networkId: f.root, pageId: f.pageId, assetIds: [assetId] })))).not.toBeNull()
    await f.t.run(async ctx => { const scan = await ctx.db.query("fileScans").withIndex("by_storageId", q => q.eq("storageId", storageId)).unique(); await ctx.db.patch(scan!._id, { status: "clean" }) })
    await expect(f.t.run(async ctx => assertEditorialAssetsForPublication(ctx, { networkId: f.root, pageId: f.pageId, assetIds: [assetId] }))).resolves.toBeNull()
    expect((await f.t.run(async ctx => editorialAssetForReading(ctx, { networkId: f.root, pageId: f.pageId, assetId })))?.url).toBeTruthy()
  })
  it("ne réadopte aucun fichier déjà admis et ne traverse pas les pages", async () => {
    const f = await fixture(), { assetId, storageId } = await f.attach()
    expect(await code(f.owner.as.mutation(api.modules.editorial.assets.attach, { networkId: f.root, pageId: f.pageId, storageId, mimeType: "image/png", altText: "Autre texte", credit: "Crédit", rightsConsentTextVersion: EDITORIAL_IMAGE_CONSENT_VERSION }))).not.toBeNull()
    const otherPage = await f.t.run(async ctx => { const row = await ctx.db.get(f.pageId); const { _id: omittedId, _creationTime: omittedTime, ...copy } = row!; void omittedId; void omittedTime; return ctx.db.insert("pages", { ...copy, handle: "autre-journal" }) })
    expect(await f.t.run(async ctx => editorialAssetForReading(ctx, { networkId: f.root, pageId: otherPage, assetId }))).toBeNull()
    expect(await code(f.t.run(async ctx => assertEditorialAssetsForPublication(ctx, { networkId: f.root, pageId: otherPage, assetIds: [assetId] })))).not.toBeNull()
    expect(await code(f.other.as.query(api.modules.editorial.assets.resolve, { networkId: f.root, pageId: f.pageId, assetIds: [assetId] }))).not.toBeNull()
  })
  it("relit l'image sélectionnée indépendamment de la page de bibliothèque et de son ancien verdict", async () => {
    const f = await fixture(), first = await f.attach()
    await f.attach()
    await f.t.run(async ctx => { const scan = await ctx.db.query("fileScans").withIndex("by_storageId", q => q.eq("storageId", first.storageId)).unique(); await ctx.db.patch(scan!._id, { status: "clean" }) })
    const window = await f.owner.as.query(api.modules.editorial.assets.list, { networkId: f.root, pageId: f.pageId, paginationOpts: { cursor: null, numItems: 1 } })
    expect(window.isDone).toBe(false)
    const args = { networkId: f.root, pageId: f.pageId, assetIds: [first.assetId] }
    expect((await f.owner.as.query(api.modules.editorial.assets.resolve, args))[0]?.url).toBeTruthy()
    await f.t.run(async ctx => { const scan = await ctx.db.query("fileScans").withIndex("by_storageId", q => q.eq("storageId", first.storageId)).unique(); await ctx.db.patch(scan!._id, { status: "infected" }) })
    expect((await f.owner.as.query(api.modules.editorial.assets.resolve, args))[0]).toMatchObject({ url: null, withheld: "fileQuarantined" })
    expect(await code(f.owner.as.query(api.modules.editorial.assets.resolve, { ...args, assetIds: [first.assetId, first.assetId] }))).not.toBeNull()
  })
  it("exige crédit, texte alternatif et version de droits ; refuse SVG et fichiers surdimensionnés", async () => {
    const f = await fixture(), storageId = await f.image()
    const args = { networkId: f.root, pageId: f.pageId, storageId, mimeType: "image/png", altText: "Illustration", credit: "Rédaction", rightsConsentTextVersion: EDITORIAL_IMAGE_CONSENT_VERSION }
    for (const patch of [{ credit: " " }, { altText: " " }, { rightsConsentTextVersion: "ancienne" }]) expect(await code(f.owner.as.mutation(api.modules.editorial.assets.attach, { ...args, ...patch }))).not.toBeNull()
    const svg = await f.image("image/svg+xml")
    expect(await code(f.owner.as.mutation(api.modules.editorial.assets.attach, { ...args, storageId: svg, mimeType: "image/svg+xml" }))).not.toBeNull()
    const large = await f.t.run(async ctx => ctx.storage.store(new Blob([new Uint8Array(8 * 1024 * 1024 + 1)], { type: "image/png" })))
    expect(await code(f.owner.as.mutation(api.modules.editorial.assets.attach, { ...args, storageId: large }))).not.toBeNull()
    expect(await f.t.run(async ctx => ctx.db.query("editorialAssets").withIndex("by_page", q => q.eq("pageId", f.pageId)).take(1))).toEqual([])
  })
})
