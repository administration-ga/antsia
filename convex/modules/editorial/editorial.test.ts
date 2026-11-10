// @vitest-environment edge-runtime
/** MP12 : rédaction synthétique, vrais constructeurs/session/débit ; aucun compte ou média réel. */
import { engineErrorCode } from "@antsia/social-contracts/errors"
import { EDITORIAL_BYLINE_CONSENT_VERSION, EDITORIAL_PUBLIC_CONSENT_VERSION } from "@antsia/social-domain/editorial"
import { EDITORIAL_IMAGE_CONSENT_VERSION } from "@antsia/social-domain/editorialAssets"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { api, internal } from "../../_generated/api"
import { SEED_CONFIRMATION } from "../../seeds/foundations"
import { testConvex } from "../../test.setup"
import { readablePublishedArticle, readPublicArticle, readPublicMedia } from "./read"
import { editorialVersionModerationText } from "./rules"
import type { EditorialDraftWriteInput } from "./validators"

const NOW = Date.UTC(2026, 9, 21, 20)
const firstPage = { cursor: null, numItems: 12 }
const draft = (extra: Partial<EditorialDraftWriteInput> = {}): EditorialDraftWriteInput => ({ title: "Une information originale", chapeau: "Présentation de cette information", sectionKey: "actualites", byline: { kind: "media" }, correctionNotice: null, blocks: [{ type: "paragraph", text: "Texte journalistique original." }], ...extra })
const config = (publicRead = false) => ({ description: "Une rédaction locale indépendante.", sections: [{ key: "actualites", label: "Actualités" }], visibility: publicRead ? "public" as const : "network" as const, ...(publicRead ? { publicConsentTextVersion: EDITORIAL_PUBLIC_CONSENT_VERSION } : {}) })
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(NOW) })
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers() })
async function fixture(publicRead = true) {
  const t = testConvex(), { root, testClosed } = await t.mutation(internal.seeds.foundations.run, { confirmNonProduction: SEED_CONFIRMATION })
  async function person(handle: string) {
    const as = t.withIdentity({ subject: `editorial-fixture-${handle}` }), personId = await as.mutation(api.modules.people.persons.ensureMyPerson, {})
    await as.mutation(api.modules.people.consents.recordConsent, { purpose: "social_profile", origin: "onboarding" })
    await as.mutation(api.modules.people.profile.publishMyProfile, { handle, displayName: `Recette ${handle}` })
    await as.mutation(api.modules.people.memberships.joinNetwork, { networkId: root })
    return { as, personId, handle }
  }
  const admin = await person("media-admin"), writer = await person("media-author"), publisher = await person("media-publisher"), outsider = await person("media-outsider")
  const page = await t.run(async ctx => {
    const pageId = await ctx.db.insert("pages", { networkId: root, handle: "redaction-recette", name: "Rédaction recette", ownerKind: "media", trust: "community", trustRank: 0, visibility: "root", onRoot: true, status: "active", createdByPersonId: admin.personId, searchText: "redaction recette", createdAt: NOW, updatedAt: NOW })
    const signatoryId = await ctx.db.insert("pageSignatories", { networkId: root, pageId, personId: admin.personId, role: "admin", acceptedAt: NOW, authorityRevision: 0, createdAt: NOW, updatedAt: NOW })
    return { pageId, signatoryId }
  })
  const media = await admin.as.mutation(api.modules.editorial.media.bootstrap, { networkId: root, pageId: page.pageId, expectedRevision: 0, input: config(publicRead) })
  async function grant(who: typeof writer, role: "author" | "editor" | "publisher" | "media_admin", byline = false) {
    const invited = await admin.as.mutation(api.modules.editorial.grants.invite, { networkId: root, pageId: page.pageId, handle: who.handle, role, expectedRevision: 0 })
    return await who.as.mutation(api.modules.editorial.grants.respond, { networkId: root, grantId: invited.grantId, expectedRevision: invited.revision, accept: true, ...(byline ? { bylineConsentTextVersion: EDITORIAL_BYLINE_CONSENT_VERSION } : {}) })
  }
  async function create(input = draft(), who = admin, requestId = "editorial-create-request-0001") { return await who.as.mutation(api.modules.editorial.articles.create, { networkId: root, pageId: page.pageId, clientRequestId: requestId, input }) }
  async function published(input = draft()) {
    const created = await create(input), submitted = await admin.as.mutation(api.modules.editorial.articles.submit, { networkId: root, articleId: created.articleId, expectedRevision: created.revision })
    const approved = await admin.as.mutation(api.modules.editorial.articles.approve, { networkId: root, articleId: created.articleId, expectedRevision: submitted.revision })
    return await admin.as.mutation(api.modules.editorial.articles.publish, { networkId: root, articleId: created.articleId, expectedRevision: approved.revision })
  }
  return { t, root, testClosed, admin, writer, publisher, outsider, ...page, media, grant, create, published }
}
type Fixture = Awaited<ReturnType<typeof fixture>>
async function code(work: Promise<unknown>) { try { await work; return null } catch (error) { return engineErrorCode(error) } }
async function editor(f: Fixture, articleId: Parameters<typeof readablePublishedArticle>[2]) { return await f.admin.as.query(api.modules.editorial.read.editor, { networkId: f.root, articleId }) }
async function publicArticle(f: Fixture, key: string) { return await f.t.run(async ctx => { const root = await ctx.db.get(f.root); return readPublicArticle(ctx, { root: root! }, "redaction-recette", key) }) }

describe("MP12 — capacité, habilitations et consentements", () => {
  it("bootstrap reste explicite et n'attribue aucun droit de publication à un autre membre", async () => {
    const f = await fixture()
    expect(await f.outsider.as.query(api.modules.editorial.media.myMedia, { networkId: f.root, pageId: f.pageId })).toBeNull()
    expect(await code(f.outsider.as.mutation(api.modules.editorial.articles.create, { networkId: f.root, pageId: f.pageId, clientRequestId: "editorial-forbidden-0001", input: draft() }))).toBe("notFound")
    expect(await f.admin.as.query(api.modules.editorial.media.myMedia, { networkId: f.root, pageId: f.pageId })).toMatchObject({ revision: 1, permissions: { canPublish: true, canConfigure: true } })
    expect(await f.admin.as.mutation(api.modules.editorial.media.saveConfig, { networkId: f.root, pageId: f.pageId, expectedRevision: 1, input: config(true) })).toMatchObject({ revision: 1, changed: false })
    expect(await f.t.run(async ctx => ctx.db.query("posts").take(2))).toEqual([])
    expect(await f.t.run(async ctx => ctx.db.query("notifications").take(2))).toEqual([])
  })
  it("une page d'entreprise sans capacité explicite média n'est pas une rédaction", async () => {
    const f = await fixture()
    await f.t.run(async ctx => ctx.db.patch(f.pageId, { ownerKind: "company" }))
    expect(await f.admin.as.query(api.modules.editorial.media.myMedia, { networkId: f.root, pageId: f.pageId })).toBeNull()
    expect(await f.t.run(async ctx => { const root = await ctx.db.get(f.root); return readPublicMedia(ctx, { root: root! }, "redaction-recette", firstPage) })).toBeNull()
  })
  it("le destinataire accepte lui-même ; auteur et éditeur ne publient pas", async () => {
    const f = await fixture(), invited = await f.admin.as.mutation(api.modules.editorial.grants.invite, { networkId: f.root, pageId: f.pageId, handle: f.writer.handle, role: "author", expectedRevision: 0 })
    expect(await code(f.outsider.as.mutation(api.modules.editorial.grants.respond, { networkId: f.root, grantId: invited.grantId, expectedRevision: 1, accept: true }))).toBe("notFound")
    expect(await code(f.writer.as.mutation(api.modules.editorial.articles.create, { networkId: f.root, pageId: f.pageId, clientRequestId: "before-acceptance-0001", input: draft() }))).toBe("notFound")
    await f.writer.as.mutation(api.modules.editorial.grants.respond, { networkId: f.root, grantId: invited.grantId, expectedRevision: 1, accept: true })
    const article = await f.create(draft(), f.writer)
    await f.writer.as.mutation(api.modules.editorial.articles.submit, { networkId: f.root, articleId: article.articleId, expectedRevision: 1 })
    expect(await code(f.writer.as.mutation(api.modules.editorial.articles.approve, { networkId: f.root, articleId: article.articleId, expectedRevision: 2 }))).toBe("notFound")
    expect(await f.writer.as.query(api.modules.editorial.read.editor, { networkId: f.root, articleId: article.articleId })).toMatchObject({ permissions: { canPublish: false, canApprove: false } })
  })
  it("révoquer le mandant, même à heure constante puis le rétablir, invalide le grant", async () => {
    const f = await fixture()
    await f.grant(f.writer, "author")
    await f.t.run(async ctx => ctx.db.patch(f.signatoryId, { role: "signatory", authorityRevision: 1 }))
    await f.t.run(async ctx => ctx.db.patch(f.signatoryId, { role: "admin", authorityRevision: 2 }))
    expect(await f.writer.as.query(api.modules.editorial.media.myMedia, { networkId: f.root, pageId: f.pageId })).toBeNull()
    expect(await code(f.create(draft(), f.writer))).toBe("notFound")
  })
  it("la révocation d'un media_admin invalide aussi les auteurs qu'il a invités", async () => {
    const f = await fixture(), manager = await f.grant(f.publisher, "media_admin")
    const invited = await f.publisher.as.mutation(api.modules.editorial.grants.invite, { networkId: f.root, pageId: f.pageId, handle: f.writer.handle, role: "author", expectedRevision: 0 })
    await f.writer.as.mutation(api.modules.editorial.grants.respond, { networkId: f.root, grantId: invited.grantId, expectedRevision: 1, accept: true })
    await f.admin.as.mutation(api.modules.editorial.grants.revoke, { networkId: f.root, grantId: manager.grantId, expectedRevision: manager.revision })
    expect(await code(f.create(draft(), f.writer))).toBe("notFound")
    expect(await code(f.publisher.as.mutation(api.modules.editorial.grants.invite, { networkId: f.root, pageId: f.pageId, handle: f.outsider.handle, role: "publisher", expectedRevision: 0 }))).toBe("notFound")
  })
  it("la signature personnelle exige un consentement distinct et revient au média après révocation", async () => {
    const f = await fixture(), grant = await f.grant(f.writer, "author")
    expect(await code(f.create(draft({ byline: { kind: "contributor", grantId: grant.grantId } })))).toBe("invalidArgument")
    await f.admin.as.mutation(api.modules.editorial.grants.revoke, { networkId: f.root, grantId: grant.grantId, expectedRevision: grant.revision })
    const invite = await f.admin.as.mutation(api.modules.editorial.grants.invite, { networkId: f.root, pageId: f.pageId, handle: f.writer.handle, role: "author", expectedRevision: grant.revision + 1 })
    const accepted = await f.writer.as.mutation(api.modules.editorial.grants.respond, { networkId: f.root, grantId: invite.grantId, expectedRevision: invite.revision, accept: true, bylineConsentTextVersion: EDITORIAL_BYLINE_CONSENT_VERSION })
    const article = await f.published(draft({ byline: { kind: "contributor", grantId: grant.grantId } })), own = await editor(f, article.articleId)
    expect(await publicArticle(f, own!.articleKey)).toMatchObject({ byline: { handle: f.writer.handle } })
    await f.writer.as.mutation(api.modules.editorial.grants.revoke, { networkId: f.root, grantId: grant.grantId, expectedRevision: accepted.revision })
    expect(await publicArticle(f, own!.articleKey)).toMatchObject({ byline: { label: "Rédaction recette", handle: null } })
  })
})

describe("MP12 — modération distincte de la configuration", () => {
  it("un mot bloqué dans une rubrique ferme le site sans supprimer l'article déjà publié", async () => {
    const f = await fixture(), article = await f.published(), own = await editor(f, article.articleId)
    await f.t.run(async ctx => { await ctx.db.insert("blockedTerms", { networkId: f.root, term: "motrefuse", active: true, updatedAt: NOW }) })
    await f.admin.as.mutation(api.modules.editorial.media.saveConfig, { networkId: f.root, pageId: f.pageId, expectedRevision: 1, input: { ...config(true), sections: [{ key: "actualites", label: "Motrefuse" }] } })
    expect(await f.t.run(async ctx => ctx.db.get(article.articleId))).toMatchObject({ publicationState: "published", publishedVersionId: own!.publishedVersion!.versionId })
    expect(await publicArticle(f, own!.articleKey)).toBeNull()
    expect(await f.admin.as.query(api.modules.editorial.read.media, { networkId: f.root, readerScope: f.admin.personId, handle: "redaction-recette", paginationOpts: firstPage })).toBeNull()
    expect(await f.admin.as.query(api.modules.editorial.media.myMedia, { networkId: f.root, pageId: f.pageId })).toMatchObject({ revision: 2, sections: [{ label: "Motrefuse" }] })
    const saved = await f.admin.as.mutation(api.modules.editorial.articles.saveDraft, { networkId: f.root, articleId: article.articleId, expectedRevision: article.revision, input: draft({ title: "Nouvelle version", correctionNotice: "Précision" }) })
    await f.admin.as.mutation(api.modules.editorial.articles.submit, { networkId: f.root, articleId: article.articleId, expectedRevision: saved.revision })
    expect(await code(f.admin.as.mutation(api.modules.editorial.articles.approve, { networkId: f.root, articleId: article.articleId, expectedRevision: saved.revision + 1 }))).toBe("policyRefused")
  })
  it("la prélecture média s'applique à la description sans toucher l'état de page", async () => {
    const f = await fixture()
    await f.t.run(async ctx => { await ctx.db.insert("moderationPolicies", { networkId: f.root, surface: "editorialMedia", preReview: true, maxLinks: 20, maxWrites: 100, windowMs: 60000, updatedAt: NOW }) })
    await f.admin.as.mutation(api.modules.editorial.media.saveConfig, { networkId: f.root, pageId: f.pageId, expectedRevision: 1, input: { ...config(true), description: "Nouvelle description à relire" } })
    const states = await f.t.run(async ctx => ({ media: await ctx.db.query("moderationContentStates").withIndex("by_target", q => q.eq("targetKind", "editorialMedia").eq("targetId", f.media.mediaId)).unique(), page: await ctx.db.query("moderationContentStates").withIndex("by_target", q => q.eq("targetKind", "page").eq("targetId", f.pageId)).unique() }))
    expect(states.media).toMatchObject({ status: "pending_review", ownerPageId: f.pageId })
    expect(states.page).toBeNull()
    expect(await f.t.run(async ctx => { const root = await ctx.db.get(f.root); return readPublicMedia(ctx, { root: root! }, "redaction-recette", firstPage) })).toBeNull()
  })
})

describe("MP12 — versions immuables, correction et publication", () => {
  it("sauver puis soumettre et approuver n'est jamais publier", async () => {
    const f = await fixture(), created = await f.create(), own = await editor(f, created.articleId)
    expect(await publicArticle(f, own!.articleKey)).toBeNull()
    expect(await code(f.admin.as.mutation(api.modules.editorial.articles.publish, { networkId: f.root, articleId: created.articleId, expectedRevision: 1 }))).toBe("conflict")
    await f.admin.as.mutation(api.modules.editorial.articles.submit, { networkId: f.root, articleId: created.articleId, expectedRevision: 1 })
    await f.admin.as.mutation(api.modules.editorial.articles.approve, { networkId: f.root, articleId: created.articleId, expectedRevision: 2 })
    expect(await publicArticle(f, own!.articleKey)).toBeNull()
    await f.admin.as.mutation(api.modules.editorial.articles.publish, { networkId: f.root, articleId: created.articleId, expectedRevision: 3 })
    const published = await publicArticle(f, own!.articleKey)
    expect(published).toMatchObject({ title: draft().title, versionNumber: 1 })
    expect(published).not.toHaveProperty("articleId")
    expect(published).not.toHaveProperty("digest")
  })
  it("une réponse perdue à create retrouve la même tête, une autre saisie avec la même clé est refusée", async () => {
    const f = await fixture(), created = await f.create()
    expect(await f.create()).toMatchObject({ articleId: created.articleId, revision: 1, changed: false })
    expect(await code(f.create(draft({ title: "Autre saisie" })))).toBe("conflict")
    expect(await f.t.run(async ctx => ctx.db.query("editorialArticles").take(3))).toHaveLength(1)
    expect(await f.t.run(async ctx => ctx.db.query("editorialVersions").take(3))).toHaveLength(1)
  })
  it("trace le mandat du publieur effectif séparément de celui de l'approbateur", async () => {
    const f = await fixture(), grant = await f.grant(f.publisher, "publisher"), article = await f.create()
    await f.admin.as.mutation(api.modules.editorial.articles.submit, { networkId: f.root, articleId: article.articleId, expectedRevision: 1 })
    await f.admin.as.mutation(api.modules.editorial.articles.approve, { networkId: f.root, articleId: article.articleId, expectedRevision: 2 })
    await f.publisher.as.mutation(api.modules.editorial.articles.publish, { networkId: f.root, articleId: article.articleId, expectedRevision: 3 })
    const events = await f.t.run(async ctx => ctx.db.query("editorialEvents").withIndex("by_article", q => q.eq("articleId", article.articleId)).take(12))
    expect(events.find(row => row.action === "approved")).toMatchObject({ actorPersonId: f.admin.personId, authority: { signatoryId: f.signatoryId, authorityRevision: 0 } })
    expect(events.find(row => row.action === "published")).toMatchObject({ actorPersonId: f.publisher.personId, authority: { signatoryId: f.signatoryId, authorityRevision: 0, grantId: grant.grantId, grantRevision: grant.revision } })
  })
  it("la correction crée une autre version sans changer l'ancienne publication ; notice obligatoire", async () => {
    const f = await fixture(), article = await f.published(), before = await editor(f, article.articleId)
    const saved = await f.admin.as.mutation(api.modules.editorial.articles.saveDraft, { networkId: f.root, articleId: article.articleId, expectedRevision: article.revision, input: draft({ title: "Titre corrigé" }) })
    expect(await publicArticle(f, before!.articleKey)).toMatchObject({ title: draft().title, versionNumber: 1 })
    const correction = await editor(f, article.articleId)
    expect(correction!.workingVersion.versionId).not.toBe(correction!.publishedVersion!.versionId)
    expect(await code(f.admin.as.mutation(api.modules.editorial.articles.saveDraft, { networkId: f.root, articleId: article.articleId, expectedRevision: article.revision, input: draft() }))).toBe("conflict")
    const submitted = await f.admin.as.mutation(api.modules.editorial.articles.submit, { networkId: f.root, articleId: article.articleId, expectedRevision: saved.revision })
    expect(await code(f.admin.as.mutation(api.modules.editorial.articles.approve, { networkId: f.root, articleId: article.articleId, expectedRevision: submitted.revision }))).toBe("invalidArgument")
    const next = await f.admin.as.mutation(api.modules.editorial.articles.saveDraft, { networkId: f.root, articleId: article.articleId, expectedRevision: submitted.revision, input: draft({ title: "Titre corrigé", correctionNotice: "Correction du titre et du contexte." }) })
    await f.admin.as.mutation(api.modules.editorial.articles.submit, { networkId: f.root, articleId: article.articleId, expectedRevision: next.revision })
    await f.admin.as.mutation(api.modules.editorial.articles.approve, { networkId: f.root, articleId: article.articleId, expectedRevision: next.revision + 1 })
    await f.admin.as.mutation(api.modules.editorial.articles.publish, { networkId: f.root, articleId: article.articleId, expectedRevision: next.revision + 2 })
    expect(await publicArticle(f, before!.articleKey)).toMatchObject({ title: "Titre corrigé", versionNumber: 3, correctionNotice: "Correction du titre et du contexte." })
    expect(await f.t.run(async ctx => ctx.db.get(before!.workingVersion.versionId))).toMatchObject({ title: draft().title, versionNumber: 1 })
  })
  it("un save identique garde version et approbation, sans dépendre de l'ordre des clés Convex", async () => {
    const f = await fixture(), article = await f.published()
    expect(await f.admin.as.mutation(api.modules.editorial.articles.saveDraft, { networkId: f.root, articleId: article.articleId, expectedRevision: article.revision, input: draft() })).toMatchObject({ changed: false, revision: article.revision, workingState: "approved" })
    expect(await f.t.run(async ctx => ctx.db.query("editorialVersions").take(3))).toHaveLength(1)
  })
  it("conserve la date de première publication et ne rend jamais l'horloge d'un brouillon", async () => {
    const f = await fixture(), article = await f.published(), own = await editor(f, article.articleId)
    expect(await publicArticle(f, own!.articleKey)).toMatchObject({ publishedAt: NOW, updatedAt: NOW })
    vi.setSystemTime(NOW + 3000)
    const saved = await f.admin.as.mutation(api.modules.editorial.articles.saveDraft, { networkId: f.root, articleId: article.articleId, expectedRevision: article.revision, input: draft({ title: "Correction datée", correctionNotice: "Précision du titre" }) })
    expect(await publicArticle(f, own!.articleKey)).toMatchObject({ publishedAt: NOW, updatedAt: NOW, title: draft().title })
    vi.setSystemTime(NOW + 6000)
    const submitted = await f.admin.as.mutation(api.modules.editorial.articles.submit, { networkId: f.root, articleId: article.articleId, expectedRevision: saved.revision })
    const approved = await f.admin.as.mutation(api.modules.editorial.articles.approve, { networkId: f.root, articleId: article.articleId, expectedRevision: submitted.revision })
    await f.admin.as.mutation(api.modules.editorial.articles.publish, { networkId: f.root, articleId: article.articleId, expectedRevision: approved.revision })
    expect(await publicArticle(f, own!.articleKey)).toMatchObject({ publishedAt: NOW, updatedAt: NOW + 6000, title: "Correction datée" })
    expect(await f.t.run(async ctx => ctx.db.get(article.articleId))).toMatchObject({ firstPublishedAt: NOW, publishedAt: NOW + 6000 })
  })
  it("prélecture d'une correction ne masque pas l'ancienne version, même pour l'auteur administrateur", async () => {
    const f = await fixture(), article = await f.published(), before = await editor(f, article.articleId)
    await f.admin.as.mutation(api.modules.editorial.articles.saveDraft, { networkId: f.root, articleId: article.articleId, expectedRevision: article.revision, input: draft({ title: "Correction en revue", correctionNotice: "Précisions" }) })
    const changed = await editor(f, article.articleId)
    await f.t.run(async ctx => { const state = await ctx.db.query("moderationContentStates").withIndex("by_target", q => q.eq("targetKind", "editorialVersion").eq("targetId", changed!.workingVersion.versionId)).unique(); await ctx.db.patch(state!._id, { status: "pending_review" }) })
    expect(await publicArticle(f, before!.articleKey)).toMatchObject({ versionNumber: 1 })
    await f.admin.as.mutation(api.modules.editorial.articles.submit, { networkId: f.root, articleId: article.articleId, expectedRevision: changed!.revision })
    expect(await code(f.admin.as.mutation(api.modules.editorial.articles.approve, { networkId: f.root, articleId: article.articleId, expectedRevision: changed!.revision + 1 }))).toBe("policyRefused")
  })
  it("le retrait ferme la référence publiée et une restauration de modération ne rembobine pas le head", async () => {
    const f = await fixture(), article = await f.published(), own = await editor(f, article.articleId)
    await f.admin.as.mutation(api.modules.editorial.articles.withdraw, { networkId: f.root, articleId: article.articleId, expectedRevision: article.revision, reason: "Publication retirée par la rédaction." })
    expect(await publicArticle(f, own!.articleKey)).toBeNull()
    expect(await f.t.run(async ctx => readablePublishedArticle(ctx, { networkId: f.root, readerPersonId: f.admin.personId }, article.articleId))).toBeNull()
    await f.t.run(async ctx => { const state = await ctx.db.query("moderationContentStates").withIndex("by_target", q => q.eq("targetKind", "editorialVersion").eq("targetId", own!.workingVersion.versionId)).unique(); await ctx.db.patch(state!._id, { status: "published" }) })
    expect(await publicArticle(f, own!.articleKey)).toBeNull()
  })
  it("modère la clause finale intégralement au-delà de4000caractères", async () => {
    const f = await fixture(), created = await f.create(draft({ blocks: [{ type: "paragraph", text: "a".repeat(4000) }, { type: "paragraph", text: "La clause finale doit rester visible." }] })), own = await editor(f, created.articleId)
    expect(await f.t.run(async ctx => editorialVersionModerationText(ctx, (await ctx.db.get(own!.workingVersion.versionId))!))).toContain("La clause finale doit rester visible.")
  })
})

describe("MP12 — historique privé", () => {
  it("parcourt toutes les versions par quatre, sans restauration et sans ouvrir aux tiers", async () => {
    const f = await fixture(), article = await f.create()
    let revision = article.revision
    for (let number = 2; number <= 6; number += 1) revision = (await f.admin.as.mutation(api.modules.editorial.articles.saveDraft, { networkId: f.root, articleId: article.articleId, expectedRevision: revision, input: draft({ title: `Version ${number}` }) })).revision
    const first = await f.admin.as.query(api.modules.editorial.read.history, { networkId: f.root, articleId: article.articleId, paginationOpts: { cursor: null, numItems: 4 } })
    expect(first.page.map(row => row.versionNumber)).toEqual([6, 5, 4, 3])
    expect(first.isDone).toBe(false)
    const next = await f.admin.as.query(api.modules.editorial.read.history, { networkId: f.root, articleId: article.articleId, paginationOpts: { cursor: first.continueCursor, numItems: 4 } })
    expect(next.page.map(row => row.versionNumber)).toEqual([2, 1])
    expect(next.isDone).toBe(true)
    expect(next.page[1]).toMatchObject({ title: draft().title, blocks: draft().blocks })
    expect(await code(f.outsider.as.query(api.modules.editorial.read.history, { networkId: f.root, articleId: article.articleId, paginationOpts: { cursor: first.continueCursor, numItems: 4 } }))).toBe("notFound")
    const other = await f.create(draft(), f.admin, "another-editorial-request-0002")
    expect(await code(f.admin.as.query(api.modules.editorial.read.history, { networkId: f.root, articleId: other.articleId, paginationOpts: { cursor: first.continueCursor, numItems: 4 } }))).toBe("invalidArgument")
    expect(await f.t.run(async ctx => ctx.db.get(article.articleId))).toMatchObject({ revision, publicationState: "unpublished", versionCount: 6 })
  })
})

describe("MP12 — programmation et gardes vivantes", () => {
  async function scheduled(f: Fixture, input = draft()) {
    const created = await f.create(input)
    await f.admin.as.mutation(api.modules.editorial.articles.submit, { networkId: f.root, articleId: created.articleId, expectedRevision: 1 })
    await f.admin.as.mutation(api.modules.editorial.articles.approve, { networkId: f.root, articleId: created.articleId, expectedRevision: 2 })
    return await f.admin.as.mutation(api.modules.editorial.articles.schedule, { networkId: f.root, articleId: created.articleId, expectedRevision: 3, publishAt: NOW + 60000 })
  }
  it("publie une seule fois à échéance sous la même preuve courante", async () => {
    const f = await fixture(), article = await scheduled(f)
    await f.t.mutation(internal.modules.editorial.jobs.publishScheduled, { networkId: f.root, articleId: article.articleId, generation: article.revision })
    expect(await editor(f, article.articleId)).toMatchObject({ publicationState: "unpublished" })
    vi.setSystemTime(NOW + 60000)
    await f.t.mutation(internal.modules.editorial.jobs.publishScheduled, { networkId: f.root, articleId: article.articleId, generation: article.revision })
    await f.t.mutation(internal.modules.editorial.jobs.publishScheduled, { networkId: f.root, articleId: article.articleId, generation: article.revision })
    expect(await editor(f, article.articleId)).toMatchObject({ revision: article.revision + 1, publicationState: "published" })
    expect((await f.t.run(async ctx => ctx.db.query("editorialEvents").withIndex("by_article", q => q.eq("articleId", article.articleId)).take(20))).filter(row => row.action === "published")).toHaveLength(1)
  })
  it.each(["authority", "consent", "page", "capability", "moderation", "edited", "membership", "deletion"])("refuse le job après changement %s sans republier une ancienne approbation", async gate => {
    const f = await fixture(), article = await scheduled(f), own = await editor(f, article.articleId)
    if (gate === "edited") await f.admin.as.mutation(api.modules.editorial.articles.saveDraft, { networkId: f.root, articleId: article.articleId, expectedRevision: article.revision, input: draft({ title: "Version après programmation" }) })
    else await f.t.run(async ctx => {
      if (gate === "authority") await ctx.db.patch(f.signatoryId, { authorityRevision: 2 })
      if (gate === "consent") await ctx.db.patch(f.media.mediaId, { publicConsentRevokedAt: NOW + 1 })
      if (gate === "page") await ctx.db.patch(f.pageId, { status: "inactive" })
      if (gate === "capability") await ctx.db.patch(f.pageId, { ownerKind: "company" })
      if (gate === "membership") { const membership = await ctx.db.query("networkMemberships").withIndex("by_network_and_person", q => q.eq("networkId", f.root).eq("personId", f.admin.personId)).unique(); await ctx.db.patch(membership!._id, { status: "en_attente" }) }
      if (gate === "deletion") await ctx.db.patch(f.admin.personId, { deletionRequestedAt: NOW + 1 })
      if (gate === "moderation") { const state = await ctx.db.query("moderationContentStates").withIndex("by_target", q => q.eq("targetKind", "editorialVersion").eq("targetId", own!.workingVersion.versionId)).unique(); await ctx.db.patch(state!._id, { status: "removed" }) }
    })
    vi.setSystemTime(NOW + 60000)
    await f.t.mutation(internal.modules.editorial.jobs.publishScheduled, { networkId: f.root, articleId: article.articleId, generation: article.revision })
    expect(await f.t.run(async ctx => ctx.db.get(article.articleId))).toMatchObject({ publicationState: "unpublished", workingState: gate === "edited" ? "draft" : "in_review" })
    expect(await publicArticle(f, own!.articleKey)).toBeNull()
  })
  it("annulation exige un nouveau geste d'approbation ; l'ancien job ne peut agir", async () => {
    const f = await fixture(), article = await scheduled(f)
    const cancelled = await f.admin.as.mutation(api.modules.editorial.articles.cancelSchedule, { networkId: f.root, articleId: article.articleId, expectedRevision: article.revision })
    expect(cancelled.workingState).toBe("in_review")
    vi.setSystemTime(NOW + 60000)
    await f.t.mutation(internal.modules.editorial.jobs.publishScheduled, { networkId: f.root, articleId: article.articleId, generation: article.revision })
    expect(await code(f.admin.as.mutation(api.modules.editorial.articles.publish, { networkId: f.root, articleId: article.articleId, expectedRevision: cancelled.revision }))).toBe("conflict")
  })
  it("refuse une image devenue retenue après programmation, sans livrer son URL", async () => {
    const f = await fixture(), storageId = await f.t.run(async ctx => ctx.storage.store(new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1])], { type: "image/png" })))
    const { assetId } = await f.admin.as.mutation(api.modules.editorial.assets.attach, { networkId: f.root, pageId: f.pageId, storageId, mimeType: "image/png", altText: "Image de recette", credit: "Rédaction", rightsConsentTextVersion: EDITORIAL_IMAGE_CONSENT_VERSION })
    await f.t.run(async ctx => { const scan = await ctx.db.query("fileScans").withIndex("by_storageId", q => q.eq("storageId", storageId)).unique(); await ctx.db.patch(scan!._id, { status: "clean" }) })
    const article = await scheduled(f, draft({ blocks: [{ type: "image", assetId }] })), own = await editor(f, article.articleId)
    await f.t.run(async ctx => { const scan = await ctx.db.query("fileScans").withIndex("by_storageId", q => q.eq("storageId", storageId)).unique(); await ctx.db.patch(scan!._id, { status: "infected" }) })
    vi.setSystemTime(NOW + 60000)
    await f.t.mutation(internal.modules.editorial.jobs.publishScheduled, { networkId: f.root, articleId: article.articleId, generation: article.revision })
    expect(await f.t.run(async ctx => ctx.db.get(article.articleId))).toMatchObject({ publicationState: "unpublished", workingState: "in_review" })
    expect(await publicArticle(f, own!.articleKey)).toBeNull()
    expect(await f.admin.as.query(api.modules.editorial.assets.list, { networkId: f.root, pageId: f.pageId, paginationOpts: firstPage })).toMatchObject({ page: [{ assetId, url: null }] })
  })
  it("le consentement réseau ne devient pas une publication anonyme", async () => {
    const f = await fixture(false), article = await f.published(), own = await editor(f, article.articleId)
    expect(await f.admin.as.query(api.modules.editorial.read.article, { networkId: f.root, readerScope: f.admin.personId, handle: "redaction-recette", articleKey: own!.articleKey })).not.toBeNull()
    expect(await publicArticle(f, own!.articleKey)).toBeNull()
  })
})
