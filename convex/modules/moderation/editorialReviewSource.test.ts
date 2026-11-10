// @vitest-environment edge-runtime
/** MP12 : version assignée immuable, preuve de lecture et indépendance de l'article déjà publié. */
import { engineErrorCode } from "@antsia/social-contracts/errors"
import { EDITORIAL_TEXT_BYTES_MAX } from "@antsia/social-domain/editorial"
import { EDITORIAL_IMAGE_CONSENT_VERSION } from "@antsia/social-domain/editorialAssets"
import { describe, expect, it } from "vitest"

import { api, internal } from "../../_generated/api"
import type { Id } from "../../_generated/dataModel"
import { SEED_CONFIRMATION } from "../../seeds/foundations"
import { testConvex } from "../../test.setup"
import { editorialCanonicalContent, editorialDigest } from "../editorial/rules"

type T = ReturnType<typeof testConvex>
const PREVIEW = api.modules.moderation.reviewProjection.preview
const CASES = api.modules.moderation.cases
async function person(t: T, root: Id<"networks">, handle: string, admin = false) {
  const as = t.withIdentity({ subject: `editorial-review-${handle}` })
  const personId = await as.mutation(api.modules.people.persons.ensureMyPerson, {})
  await as.mutation(api.modules.people.consents.recordConsent, { purpose: "social_profile", origin: "onboarding" })
  await as.mutation(api.modules.people.profile.publishMyProfile, { handle, displayName: handle })
  await as.mutation(api.modules.people.memberships.joinNetwork, { networkId: root })
  await t.run(async ctx => {
    const row = await ctx.db.query("networkMemberships").withIndex("by_network_and_person", q => q.eq("networkId", root).eq("personId", personId)).unique()
    if (row) await ctx.db.patch(row._id, { status: "verifiee", ...(admin ? { role: "network_admin" } : {}) })
  })
  return { as, personId }
}
async function fixture() {
  const t = testConvex(), now = Date.now()
  const { root, testClosed } = await t.mutation(internal.seeds.foundations.run, { confirmNonProduction: SEED_CONFIRMATION })
  const owner = await person(t, root, "editorial-author"), reader = await person(t, root, "editorial-reader"), admin = await person(t, root, "editorial-moderator", true)
  const { pageId } = await owner.as.mutation(api.modules.pages.pages.createPage, { networkId: root, name: "Rédaction de recette", ownerKind: "media" })
  const rows = await t.run(async ctx => {
    const mediaId = await ctx.db.insert("editorialMedia", { networkId: root, pageId, revision: 1, description: "Média synthétique", sections: [], visibility: "network", createdByPersonId: owner.personId, createdAt: now, updatedAt: now })
    await ctx.db.insert("moderationContentStates", { networkId: root, targetKind: "editorialMedia", targetId: mediaId, ownerPageId: pageId, status: "published", createdAt: now, updatedAt: now })
    const content = { title: "Article publié", chapeau: "Version déjà publiée", sectionKey: null, sectionLabel: null, byline: { kind: "media" as const }, correctionNotice: null, blocks: [{ type: "paragraph" as const, text: "Texte déjà publié." }] }
    const articleId = await ctx.db.insert("editorialArticles", { networkId: root, pageId, articleKey: "article-de-recette", createRequestId: "editorial-review-original", originalDigest: await editorialDigest(editorialCanonicalContent(content)), revision: 2, versionCount: 2, workingState: "in_review", publicationState: "published", createdByPersonId: owner.personId, createdAt: now, updatedAt: now })
    const publishedVersionId = await ctx.db.insert("editorialVersions", { networkId: root, pageId, articleId, versionNumber: 1, ...content, digest: await editorialDigest(editorialCanonicalContent(content)), authorPersonId: owner.personId, createdAt: now })
    const correction = { ...content, title: "Correction en relecture", correctionNotice: "Correction déclarée.", blocks: [{ type: "paragraph" as const, text: "a".repeat(3000) }, { type: "paragraph" as const, text: `${"b".repeat(3000)} CLAUSE FINALE ÉDITORIALE` }] }
    const workingVersionId = await ctx.db.insert("editorialVersions", { networkId: root, pageId, articleId, versionNumber: 2, ...correction, digest: await editorialDigest(editorialCanonicalContent(correction)), authorPersonId: owner.personId, createdAt: now })
    await ctx.db.patch(articleId, { publishedVersionId, workingVersionId, publishedAt: now })
    for (const [id, status] of [[publishedVersionId, "published"], [workingVersionId, "pending_review"]] as const) {
      await ctx.db.insert("moderationContentStates", { networkId: root, targetKind: "editorialVersion", targetId: id, ownerPageId: pageId, status, createdAt: now, updatedAt: now })
    }
    return { mediaId, articleId, publishedVersionId, workingVersionId }
  })
  return { t, root, testClosed, owner, reader, admin, pageId, ...rows, target: { kind: "editorialVersion" as const, id: rows.workingVersionId } }
}
async function code(work: Promise<unknown>) { try { await work; return null } catch (error) { return engineErrorCode(error) } }

describe("MP12 — source de revue éditoriale", () => {
  it("ne montre le brouillon qu'au guichet compétent, intégralement et sans identité ou voisin publié", async () => {
    const f = await fixture()
    expect(await code(f.reader.as.query(PREVIEW, { networkId: f.root, target: f.target }))).toBe("notFound")
    const preview = await f.admin.as.query(PREVIEW, { networkId: f.root, target: f.target })
    expect(preview).toMatchObject({ kind: "editorialVersion", available: true, sourceRevision: 2, sourceDigest: expect.stringMatching(/^[a-f0-9]{64}$/) })
    expect(preview.body!.length).toBeGreaterThan(4000)
    expect(preview.body).toContain("CLAUSE FINALE ÉDITORIALE")
    expect(new TextEncoder().encode(preview.body!).byteLength).toBeLessThanOrEqual(EDITORIAL_TEXT_BYTES_MAX)
    expect(JSON.stringify(preview)).not.toContain(f.owner.personId)
    expect(JSON.stringify(preview)).not.toContain("Texte déjà publié.")
    expect(preview.media).toEqual([])
  })

  it.each([true, false])("exige la preuve avant approve=%s et ne touche jamais la version publiée précédente", async approve => {
    const f = await fixture()
    const preview = await f.admin.as.query(PREVIEW, { networkId: f.root, target: f.target })
    const args = { networkId: f.root, target: f.target, approve, reason: "Version intégrale relue." }
    expect(await code(f.admin.as.mutation(CASES.reviewContent, args))).toBe("notFound")
    await f.admin.as.mutation(CASES.reviewContent, { ...args, expectedSourceRevision: preview.sourceRevision, expectedSourceDigest: preview.sourceDigest })
    const state = await f.t.run(ctx => ctx.db.query("moderationContentStates").withIndex("by_target", q => q.eq("targetKind", "editorialVersion").eq("targetId", f.publishedVersionId)).unique())
    expect(state?.status).toBe("published")
    const article = await f.t.run(ctx => ctx.db.get(f.articleId))
    expect(article).toMatchObject({ publishedVersionId: f.publishedVersionId, publicationState: "published", revision: 2 })
  })

  it("inclut les descriptions et crédits d’image dans la lecture et son empreinte, sans livrer le fichier", async () => {
    const f = await fixture()
    const { assetId, storageId } = await f.t.run(async ctx => {
      const storageId = await ctx.storage.store(new Blob([new Uint8Array(64)], { type: "image/jpeg" }))
      const assetId = await ctx.db.insert("editorialAssets", { networkId: f.root, pageId: f.pageId, uploadedByPersonId: f.owner.personId, storageId, mimeType: "image/jpeg", sizeBytes: 64,
        altText: "Description intégrale de l’image", credit: "CRÉDIT FINAL VISIBLE", rightsConsentTextVersion: EDITORIAL_IMAGE_CONSENT_VERSION, rightsConsentedAt: Date.now(), createdAt: Date.now() })
      const version = (await ctx.db.get(f.workingVersionId))!
      const content = { ...editorialCanonicalContent(version), blocks: [...version.blocks, { type: "image" as const, assetId }] }
      await ctx.db.patch(version._id, { blocks: content.blocks, digest: await editorialDigest(content) })
      return { assetId, storageId }
    })
    const preview = await f.admin.as.query(PREVIEW, { networkId: f.root, target: f.target })
    expect(preview.body).toContain("Description intégrale de l’image")
    expect(preview.body).toContain("CRÉDIT FINAL VISIBLE")
    expect(preview.media).toEqual([])
    expect(JSON.stringify(preview)).not.toContain(storageId)
    await f.t.run(async ctx => { await ctx.db.patch(assetId, { credit: "Crédit non présenté." }) })
    expect(await code(f.admin.as.mutation(CASES.reviewContent, { networkId: f.root, target: f.target, approve: false, reason: "Version intégrale relue.", expectedSourceRevision: preview.sourceRevision, expectedSourceDigest: preview.sourceDigest }))).toBe("notFound")
  })

  it("ne réutilise pas une preuve d'une autre version et relit tout texte avant décision", async () => {
    const f = await fixture()
    const preview = await f.admin.as.query(PREVIEW, { networkId: f.root, target: f.target })
    const args = { networkId: f.root, target: f.target, approve: false, reason: "Version intégrale relue.", expectedSourceRevision: 1, expectedSourceDigest: preview.sourceDigest }
    expect(await code(f.admin.as.mutation(CASES.reviewContent, args))).toBe("notFound")
    // Aucune API ne modifie une version ; une corruption synthétique ne réutilise pas la preuve.
    await f.t.run(async ctx => { await ctx.db.patch(f.workingVersionId, { chapeau: "Texte non présenté au modérateur." }) })
    expect(await code(f.admin.as.mutation(CASES.reviewContent, { ...args, expectedSourceRevision: preview.sourceRevision }))).toBe("notFound")
  })

  it("ferme une source incohérente ou supérieure à32KiB sans tronquer son extrait", async () => {
    const f = await fixture()
    await f.t.run(async ctx => { await ctx.db.patch(f.workingVersionId, { blocks: [{ type: "paragraph", text: "é".repeat(20_000) }] }) })
    expect(await f.admin.as.query(PREVIEW, { networkId: f.root, target: f.target })).toMatchObject({ available: false, body: null })
    await f.t.run(async ctx => { await ctx.db.patch(f.workingVersionId, { networkId: f.testClosed }) })
    expect(await f.admin.as.query(PREVIEW, { networkId: f.root, target: f.target })).toMatchObject({ available: false, body: null })
  })

  it("interdit à l'auteur administrateur de juger sa page et relit la compétence du modérateur", async () => {
    const f = await fixture()
    const preview = await f.admin.as.query(PREVIEW, { networkId: f.root, target: f.target })
    await f.t.run(async ctx => {
      for (const [personId, role] of [[f.owner.personId, "network_admin"], [f.admin.personId, "member"]] as const) {
        const membership = await ctx.db.query("networkMemberships").withIndex("by_network_and_person", q => q.eq("networkId", f.root).eq("personId", personId)).unique()
        if (membership) await ctx.db.patch(membership._id, { role })
      }
    })
    const args = { networkId: f.root, target: f.target, approve: true, reason: "Contenu déclaré relu.", expectedSourceRevision: preview.sourceRevision, expectedSourceDigest: preview.sourceDigest }
    expect(await code(f.owner.as.mutation(CASES.reviewContent, args))).toBe("notFound")
    expect(await code(f.admin.as.mutation(CASES.reviewContent, args))).toBe("notFound")
  })

  it("n'admet le signalement que sur la version publiée courante et exige sa preuve pour trancher", async () => {
    const f = await fixture()
    expect(await code(f.reader.as.mutation(CASES.report, { networkId: f.root, target: f.target, reason: "other" }))).toBe("notFound")
    const target = { kind: "editorialVersion" as const, id: f.publishedVersionId }
    expect(await code(f.owner.as.mutation(CASES.report, { networkId: f.root, target, reason: "other" }))).toBe("notFound")
    const { reportId } = await f.reader.as.mutation(CASES.report, { networkId: f.root, target, reason: "misinformation" })
    const preview = await f.admin.as.query(PREVIEW, { networkId: f.root, reportId })
    const args = { networkId: f.root, reportId, decision: "actioned" as const, reason: "Article intégral relu.", sanctions: [] }
    expect(await code(f.admin.as.mutation(CASES.decide, args))).toBe("notFound")
    await f.admin.as.mutation(CASES.decide, { ...args, expectedSourceRevision: preview.sourceRevision, expectedSourceDigest: preview.sourceDigest })
    const state = await f.t.run(ctx => ctx.db.query("moderationContentStates").withIndex("by_target", q => q.eq("targetKind", "editorialVersion").eq("targetId", f.publishedVersionId)).unique())
    expect(state?.status).toBe("removed")
  })
})

async function pendingMedia() {
  const f = await fixture()
  await f.admin.as.mutation(CASES.setPolicy, { networkId: f.root, surface: "editorialMedia", preReview: true, maxLinks: 20, maxWrites: 100, windowMs: 60_000, reason: "Prélecture de la configuration média." })
  const input = { description: "Présentation complète du média.", sections: [{ key: "actualites", label: "Actualités" }, { key: "dernier-rayon", label: "DERNIÈRE RUBRIQUE VISIBLE" }], visibility: "network" as const }
  await f.owner.as.mutation(api.modules.editorial.media.saveConfig, { networkId: f.root, pageId: f.pageId, expectedRevision: 1, input })
  return { ...f, mediaTarget: { kind: "editorialMedia" as const, id: f.mediaId }, input }
}

describe("MP12 — configuration média modérée séparément de la page", () => {
  it("met une vraie modification en prélecture et présente description et toutes rubriques", async () => {
    const f = await pendingMedia()
    const page = (await f.t.run(ctx => ctx.db.get(f.pageId)))!
    expect(await f.reader.as.query(api.modules.editorial.read.media, { networkId: f.root, readerScope: f.reader.personId, handle: page.handle, paginationOpts: { cursor: null, numItems: 12 } })).toBeNull()
    expect(await code(f.reader.as.query(PREVIEW, { networkId: f.root, target: f.mediaTarget }))).toBe("notFound")
    const preview = await f.admin.as.query(PREVIEW, { networkId: f.root, target: f.mediaTarget })
    expect(preview).toMatchObject({ kind: "editorialMedia", available: true, sourceRevision: 2, sourceDigest: expect.stringMatching(/^[a-f0-9]{64}$/), media: [] })
    expect(preview.body).toContain(f.input.description)
    expect(preview.body).toContain("DERNIÈRE RUBRIQUE VISIBLE")
    expect(JSON.stringify(preview)).not.toContain(f.owner.personId)
  })

  it.each([true, false])("exige sa propre preuve avant approve=%s sans modérer la page ni les articles", async approve => {
    const f = await pendingMedia()
    const preview = await f.admin.as.query(PREVIEW, { networkId: f.root, target: f.mediaTarget })
    const args = { networkId: f.root, target: f.mediaTarget, approve, reason: "Configuration intégralement relue." }
    expect(await code(f.admin.as.mutation(CASES.reviewContent, args))).toBe("notFound")
    await f.admin.as.mutation(CASES.reviewContent, { ...args, expectedSourceRevision: preview.sourceRevision, expectedSourceDigest: preview.sourceDigest })
    const states = await f.t.run(async ctx => ({ media: await ctx.db.query("moderationContentStates").withIndex("by_target", q => q.eq("targetKind", "editorialMedia").eq("targetId", f.mediaId)).unique(),
      page: await ctx.db.query("moderationContentStates").withIndex("by_target", q => q.eq("targetKind", "page").eq("targetId", f.pageId)).unique(),
      article: await ctx.db.query("moderationContentStates").withIndex("by_target", q => q.eq("targetKind", "editorialVersion").eq("targetId", f.publishedVersionId)).unique() }))
    expect(states.media?.status).toBe(approve ? "published" : "removed")
    expect(states.page?.status ?? "published").toBe("published")
    expect(states.article?.status).toBe("published")
    expect((await f.t.run(ctx => ctx.db.get(f.articleId)))?.publishedVersionId).toBe(f.publishedVersionId)
  })

  it.each([true, false])("refuse approve=%s après une vraie révision concurrente de configuration", async approve => {
    const f = await pendingMedia()
    const preview = await f.admin.as.query(PREVIEW, { networkId: f.root, target: f.mediaTarget })
    await f.owner.as.mutation(api.modules.editorial.media.saveConfig, { networkId: f.root, pageId: f.pageId, expectedRevision: 2, input: { ...f.input, description: "Nouvelle description non relue." } })
    expect(await code(f.admin.as.mutation(CASES.reviewContent, { networkId: f.root, target: f.mediaTarget, approve, reason: "Ancienne configuration relue.", expectedSourceRevision: preview.sourceRevision, expectedSourceDigest: preview.sourceDigest }))).toBe("notFound")
  })

  it("admet le signalement membre du site publié, refuse l'auto-signalement et impose la preuve pour décider", async () => {
    const f = await fixture(), target = { kind: "editorialMedia" as const, id: f.mediaId }
    expect(await code(f.owner.as.mutation(CASES.report, { networkId: f.root, target, reason: "other" }))).toBe("notFound")
    const { reportId } = await f.reader.as.mutation(CASES.report, { networkId: f.root, target, reason: "misinformation" })
    const preview = await f.admin.as.query(PREVIEW, { networkId: f.root, reportId })
    const args = { networkId: f.root, reportId, decision: "actioned" as const, reason: "Configuration publique relue.", sanctions: [] }
    expect(await code(f.admin.as.mutation(CASES.decide, args))).toBe("notFound")
    await f.admin.as.mutation(CASES.decide, { ...args, expectedSourceRevision: preview.sourceRevision, expectedSourceDigest: preview.sourceDigest })
    expect((await f.t.run(ctx => ctx.db.get(f.pageId)))?.status).toBe("active")
  })

  it("interdit au gestionnaire même administrateur réseau de juger la configuration de sa page", async () => {
    const f = await pendingMedia()
    const preview = await f.admin.as.query(PREVIEW, { networkId: f.root, target: f.mediaTarget })
    await f.t.run(async ctx => {
      const membership = await ctx.db.query("networkMemberships").withIndex("by_network_and_person", q => q.eq("networkId", f.root).eq("personId", f.owner.personId)).unique()
      if (membership) await ctx.db.patch(membership._id, { role: "network_admin" })
    })
    expect(await code(f.owner.as.mutation(CASES.reviewContent, { networkId: f.root, target: f.mediaTarget, approve: true, reason: "Configuration déclarée relue.", expectedSourceRevision: preview.sourceRevision, expectedSourceDigest: preview.sourceDigest }))).toBe("notFound")
  })
})
