// @vitest-environment edge-runtime
/** MP13 : comptes synthétiques ; une référence et un seul fil, sans publication de contenu réel. */
import { engineErrorCode } from "@antsia/social-contracts/errors"
import { EDITORIAL_PUBLIC_CONSENT_VERSION } from "@antsia/social-domain/editorial"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { api, internal } from "../../_generated/api"
import { SEED_CONFIRMATION } from "../../seeds/foundations"
import { testConvex } from "../../test.setup"
import { canSeePostDoc } from "../posts/access"
import { publicPostDto, publicPostEligible } from "../public/access"
import type { EditorialDraftWriteInput } from "./validators"
import { readPublicMedia } from "./read"

const NOW = Date.UTC(2026, 9, 21, 21)
const pageOpts = { cursor: null, numItems: 12 }
const draft = (extra: Partial<EditorialDraftWriteInput> = {}): EditorialDraftWriteInput => ({ title: "Article de recette", chapeau: "Chapeau public de recette", sectionKey: null, byline: { kind: "media" }, correctionNotice: null, blocks: [{ type: "paragraph", text: "Texte éditorial qui reste uniquement dans sa version immuable." }], ...extra })
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(NOW) })
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers() })
async function fixture(publish = true) {
  const t = testConvex(), { root, testClosed } = await t.mutation(internal.seeds.foundations.run, { confirmNonProduction: SEED_CONFIRMATION })
  async function person(handle: string) {
    const as = t.withIdentity({ subject: `editorial-social-${handle}` }), personId = await as.mutation(api.modules.people.persons.ensureMyPerson, {})
    await as.mutation(api.modules.people.consents.recordConsent, { purpose: "social_profile", origin: "onboarding" })
    await as.mutation(api.modules.people.profile.publishMyProfile, { handle, displayName: `Recette ${handle}` })
    await as.mutation(api.modules.people.memberships.joinNetwork, { networkId: root })
    return { as, personId }
  }
  const admin = await person("social-editor"), reader = await person("social-reader")
  const { pageId, authorityId } = await t.run(async ctx => {
    const pageId = await ctx.db.insert("pages", { networkId: root, handle: "social-journal", name: "Journal de recette", ownerKind: "media", trust: "community", trustRank: 0, visibility: "root", onRoot: true, status: "active", searchText: "journal recette", createdAt: NOW, updatedAt: NOW })
    const authorityId = await ctx.db.insert("pageSignatories", { networkId: root, pageId, personId: admin.personId, role: "admin", authorityRevision: 0, acceptedAt: NOW, createdAt: NOW, updatedAt: NOW })
    return { pageId, authorityId }
  })
  const media = await admin.as.mutation(api.modules.editorial.media.bootstrap, { networkId: root, pageId, expectedRevision: 0, input: { description: "Rédaction de recette", sections: [], visibility: "public", publicConsentTextVersion: EDITORIAL_PUBLIC_CONSENT_VERSION } })
  const article = await admin.as.mutation(api.modules.editorial.articles.create, { networkId: root, pageId, clientRequestId: "social-editorial-create-0001", input: draft() })
  if (publish) {
    await admin.as.mutation(api.modules.editorial.articles.submit, { networkId: root, articleId: article.articleId, expectedRevision: 1 })
    await admin.as.mutation(api.modules.editorial.articles.approve, { networkId: root, articleId: article.articleId, expectedRevision: 2 })
    await admin.as.mutation(api.modules.editorial.articles.publish, { networkId: root, articleId: article.articleId, expectedRevision: 3 })
  }
  const editor = await admin.as.query(api.modules.editorial.read.editor, { networkId: root, articleId: article.articleId })
  const announce = (expectedVersionId = editor!.workingVersion.versionId) => admin.as.mutation(api.modules.editorial.social.announce, { networkId: root, articleId: article.articleId, expectedVersionId, expectedRevision: 0 })
  const context = (who = admin) => who.as.query(api.modules.editorial.social.context, { networkId: root, readerScope: who.personId, handle: "social-journal", articleKey: editor!.articleKey })
  return { t, root, testClosed, admin, reader, pageId, authorityId, media, articleId: article.articleId, articleKey: editor!.articleKey, versionId: editor!.workingVersion.versionId, announce, context }
}
type Fixture = Awaited<ReturnType<typeof fixture>>
async function code(work: Promise<unknown>) { try { await work; return null } catch (error) { return engineErrorCode(error) } }
async function card(f: Fixture, postId: Parameters<typeof canSeePostDoc>[2]["_id"]) { return f.reader.as.query(api.modules.editorial.social.card, { networkId: f.root, readerScope: f.reader.personId, postId }) }
async function publishCorrection(f: Fixture) {
  const saved = await f.admin.as.mutation(api.modules.editorial.articles.saveDraft, { networkId: f.root, articleId: f.articleId, expectedRevision: 4, input: draft({ title: "Correction publiée", correctionNotice: "Correction explicite" }) })
  const submitted = await f.admin.as.mutation(api.modules.editorial.articles.submit, { networkId: f.root, articleId: f.articleId, expectedRevision: saved.revision })
  const approved = await f.admin.as.mutation(api.modules.editorial.articles.approve, { networkId: f.root, articleId: f.articleId, expectedRevision: submitted.revision })
  await f.admin.as.mutation(api.modules.editorial.articles.publish, { networkId: f.root, articleId: f.articleId, expectedRevision: approved.revision })
  return (await f.context())!.versionId
}

describe("MP13 — annonce canonique", () => {
  it("refuse une confirmation d'annonce préparée avant une correction publiée", async () => {
    const f = await fixture(), currentVersionId = await publishCorrection(f)
    expect(currentVersionId).not.toBe(f.versionId)
    expect(await code(f.announce())).toBe("conflict")
    expect(await f.t.run(async ctx => ctx.db.query("posts").take(2))).toEqual([])
    expect(await f.t.run(async ctx => ctx.db.query("editorialSocialLinks").take(2))).toEqual([])
    expect(await f.announce(currentVersionId)).toMatchObject({ created: true })
  })
  it("ne crée rien à la publication de l'article ; le lecteur ne reçoit aucun droit de diffusion", async () => {
    const f = await fixture()
    expect(await f.t.run(async ctx => ctx.db.query("posts").take(2))).toEqual([])
    expect(await f.context()).toMatchObject({ postId: null, revision: 0, canAnnounce: true, commentsEnabled: false, discussionAvailable: false })
    expect(await f.context(f.reader)).toMatchObject({ canAnnounce: false, canManageComments: false })
    expect(await code(f.reader.as.mutation(api.modules.editorial.social.announce, { networkId: f.root, articleId: f.articleId, expectedVersionId: f.versionId, expectedRevision: 0 }))).toBe("notFound")
  })
  it("une annonce et son rejeu gardent le même post sans titre, extrait, corps ou image copiés", async () => {
    const f = await fixture(), first = await f.announce(), replay = await f.announce()
    expect(replay).toMatchObject({ ...first, created: false })
    expect(await f.t.run(async ctx => ctx.db.query("editorialSocialLinks").take(3))).toHaveLength(1)
    const rows = await f.t.run(async ctx => ctx.db.query("posts").take(3))
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ editorialArticleId: f.articleId, pageId: f.pageId, body: "", searchText: "", visibility: "network" })
    expect(rows[0]).not.toHaveProperty("media")
    expect(JSON.stringify(rows[0])).not.toContain(draft().title)
    expect(JSON.stringify(rows[0])).not.toContain(draft().chapeau)
    expect(await card(f, first.postId)).toEqual({ handle: "social-journal", articleKey: f.articleKey, title: draft().title, excerpt: draft().chapeau, sectionLabel: null, publishedAt: NOW })
    expect(await code(f.reader.as.query(api.modules.editorial.social.card, { networkId: f.root, readerScope: f.admin.personId, postId: first.postId }))).toBe("notFound")
  })
  it("deux gestes concurrents ne créent qu'un seul post", async () => {
    const f = await fixture(), responses = await Promise.all([f.announce(), f.announce()])
    expect(responses[0].postId).toBe(responses[1].postId)
    expect(responses.filter(row => row.created)).toHaveLength(1)
    expect(await f.t.run(async ctx => ctx.db.query("posts").take(3))).toHaveLength(1)
  })
  it("le brouillon reste invisible et les scopes réseau/lecteur restent fermés", async () => {
    const f = await fixture(false)
    expect(await f.context()).toBeNull()
    expect(await code(f.announce())).toBe("notFound")
    expect(await code(f.admin.as.query(api.modules.editorial.social.context, { networkId: f.root, readerScope: f.reader.personId, handle: "social-journal", articleKey: f.articleKey }))).toBe("notFound")
    expect(await code(f.admin.as.query(api.modules.editorial.read.article, { networkId: f.root, readerScope: f.reader.personId, handle: "social-journal", articleKey: f.articleKey }))).toBe("notFound")
    expect(await code(f.admin.as.query(api.modules.editorial.read.media, { networkId: f.root, readerScope: f.reader.personId, handle: "social-journal", paginationOpts: pageOpts }))).toBe("notFound")
    expect(await code(f.admin.as.mutation(api.modules.editorial.social.announce, { networkId: f.testClosed, articleId: f.articleId, expectedVersionId: f.versionId, expectedRevision: 0 }))).not.toBeNull()
  })
  it("le DTO membre expose la version publiée et la carte change seulement après nouvelle publication", async () => {
    const f = await fixture(), post = await f.announce()
    expect(await f.reader.as.query(api.modules.editorial.read.article, { networkId: f.root, readerScope: f.reader.personId, handle: "social-journal", articleKey: f.articleKey })).toMatchObject({ versionId: f.versionId })
    await f.admin.as.mutation(api.modules.editorial.articles.saveDraft, { networkId: f.root, articleId: f.articleId, expectedRevision: 4, input: draft({ title: "Titre corrigé", correctionNotice: "Correction déclarée du titre" }) })
    expect(await card(f, post.postId)).toMatchObject({ title: draft().title })
    await f.admin.as.mutation(api.modules.editorial.articles.submit, { networkId: f.root, articleId: f.articleId, expectedRevision: 5 })
    await f.admin.as.mutation(api.modules.editorial.articles.approve, { networkId: f.root, articleId: f.articleId, expectedRevision: 6 })
    await f.admin.as.mutation(api.modules.editorial.articles.publish, { networkId: f.root, articleId: f.articleId, expectedRevision: 7 })
    expect(await card(f, post.postId)).toMatchObject({ title: "Titre corrigé" })
    expect(await f.t.run(async ctx => ctx.db.get(post.postId))).toMatchObject({ body: "", searchText: "" })
    expect((await f.context())!.versionId).not.toBe(f.versionId)
    expect(await f.t.run(async ctx => ctx.db.query("posts").take(3))).toHaveLength(1)
  })
})

describe("MP13 — discussion unique", () => {
  it("refuse de fermer une autre version que celle confirmée, même si la révision du lien n'a pas changé", async () => {
    const f = await fixture(), post = await f.announce()
    await f.admin.as.mutation(api.modules.editorial.social.setDiscussion, { networkId: f.root, articleId: f.articleId, expectedVersionId: f.versionId, expectedRevision: 1, enabled: true })
    const currentVersionId = await publishCorrection(f)
    expect(await code(f.admin.as.mutation(api.modules.editorial.social.setDiscussion, { networkId: f.root, articleId: f.articleId, expectedVersionId: f.versionId, expectedRevision: 2, enabled: false }))).toBe("conflict")
    expect(await f.context()).toMatchObject({ postId: post.postId, revision: 2, commentsEnabled: true, versionId: currentVersionId })
    expect(await code(f.announce())).toBe("conflict")
    expect(await f.announce(currentVersionId)).toMatchObject({ postId: post.postId, created: false, revision: 2 })
  })
  it("ferme par défaut, ouvre sous CAS et garde les anciens commentaires après fermeture", async () => {
    const f = await fixture(), post = await f.announce()
    expect(await code(f.reader.as.mutation(api.modules.engagement.engagement.comment, { networkId: f.root, postId: post.postId, body: "Question avant ouverture" }))).toBe("notFound")
    expect(await code(f.reader.as.mutation(api.modules.editorial.social.setDiscussion, { networkId: f.root, articleId: f.articleId, expectedVersionId: f.versionId, expectedRevision: 1, enabled: true }))).toBe("notFound")
    const opened = await f.admin.as.mutation(api.modules.editorial.social.setDiscussion, { networkId: f.root, articleId: f.articleId, expectedVersionId: f.versionId, expectedRevision: 1, enabled: true })
    expect(opened).toMatchObject({ revision: 2, commentsEnabled: true })
    expect(await code(f.admin.as.mutation(api.modules.editorial.social.setDiscussion, { networkId: f.root, articleId: f.articleId, expectedVersionId: f.versionId, expectedRevision: 1, enabled: false }))).toBe("conflict")
    const root = await f.reader.as.mutation(api.modules.engagement.engagement.comment, { networkId: f.root, postId: post.postId, body: "Question autorisée" })
    await f.admin.as.mutation(api.modules.engagement.engagement.comment, { networkId: f.root, postId: post.postId, body: "Réponse autorisée", parentCommentId: root.commentId })
    await f.admin.as.mutation(api.modules.editorial.social.setDiscussion, { networkId: f.root, articleId: f.articleId, expectedVersionId: f.versionId, expectedRevision: 2, enabled: false })
    expect(await code(f.reader.as.mutation(api.modules.engagement.engagement.comment, { networkId: f.root, postId: post.postId, body: "Nouvelle question" }))).toBe("notFound")
    expect(await code(f.reader.as.mutation(api.modules.engagement.engagement.comment, { networkId: f.root, postId: post.postId, body: "Nouvelle réponse", parentCommentId: root.commentId }))).toBe("notFound")
    expect(await code(f.reader.as.mutation(api.modules.engagement.engagement.editComment, { networkId: f.root, commentId: root.commentId, body: "Modification après fermeture" }))).toBe("notFound")
    const comments = await f.reader.as.query(api.modules.engagement.engagement.paginateComments, { networkId: f.root, postId: post.postId, paginationOpts: pageOpts })
    expect(comments.page).toHaveLength(1)
    expect(await f.t.run(async ctx => ctx.db.get(root.commentId))).toMatchObject({ body: "Question autorisée", status: "published" })
    expect(await f.reader.as.query(api.modules.posts.posts.getPost, { networkId: f.root, postId: post.postId })).toMatchObject({ commentsOpen: false, canonicalDiscussionPostId: post.postId, hasEditorialArticle: true })
    await expect(f.reader.as.mutation(api.modules.engagement.engagement.removeComment, { networkId: f.root, commentId: root.commentId })).resolves.toMatchObject({ removed: true })
  })
  it("un partage renvoie vers la discussion canonique et ne reçoit aucun second fil", async () => {
    const f = await fixture(), post = await f.announce()
    await f.admin.as.mutation(api.modules.editorial.social.setDiscussion, { networkId: f.root, articleId: f.articleId, expectedVersionId: f.versionId, expectedRevision: 1, enabled: true })
    const share = await f.reader.as.mutation(api.modules.posts.posts.publish, { networkId: f.root, body: "Mon avis sur cette lecture", sharedPostId: post.postId })
    expect(await f.reader.as.query(api.modules.posts.posts.getPost, { networkId: f.root, postId: share.postId })).toMatchObject({ commentsOpen: false, canonicalDiscussionPostId: post.postId, share: { available: true, hasEditorialArticle: true, postId: post.postId } })
    expect(await code(f.reader.as.mutation(api.modules.engagement.engagement.comment, { networkId: f.root, postId: share.postId, body: "Un deuxième fil" }))).toBe("notFound")
    const oldCommentId = await f.t.run(async ctx => ctx.db.insert("postComments", { networkId: f.root, postId: share.postId, authorPersonId: f.reader.personId, body: "Ancienne discussion conservée", status: "published", createdAt: NOW, updatedAt: NOW }))
    expect((await f.reader.as.query(api.modules.engagement.engagement.paginateComments, { networkId: f.root, postId: share.postId, paginationOpts: pageOpts })).page).toHaveLength(1)
    expect(await code(f.reader.as.mutation(api.modules.engagement.engagement.editComment, { networkId: f.root, commentId: oldCommentId, body: "Nouveau texte" }))).toBe("notFound")
  })
  it("les publications ordinaires gardent leur formulaire et leur édition habituels", async () => {
    const f = await fixture(), ordinary = await f.reader.as.mutation(api.modules.posts.posts.publish, { networkId: f.root, body: "Publication ordinaire indépendante" })
    await expect(f.reader.as.mutation(api.modules.engagement.engagement.comment, { networkId: f.root, postId: ordinary.postId, body: "Commentaire ordinaire" })).resolves.toHaveProperty("commentId")
    await expect(f.reader.as.mutation(api.modules.posts.posts.edit, { networkId: f.root, postId: ordinary.postId, body: "Texte ordinaire modifié" })).resolves.toHaveProperty("editedAt")
    expect(await f.reader.as.query(api.modules.posts.posts.getPost, { networkId: f.root, postId: ordinary.postId })).not.toHaveProperty("commentsOpen")
  })
})

describe("MP13 — retraits et portes de publication", () => {
  it.each(["withdrawn", "page", "capability", "media_moderation", "version_moderation"])("referme tout aperçu après %s, y compris pour l'administrateur historique", async gate => {
    const f = await fixture(), post = await f.announce()
    if (gate === "withdrawn") await f.admin.as.mutation(api.modules.editorial.articles.withdraw, { networkId: f.root, articleId: f.articleId, expectedRevision: 4, reason: "Retrait de recette" })
    else await f.t.run(async ctx => {
      if (gate === "page") await ctx.db.patch(f.pageId, { status: "inactive" })
      if (gate === "capability") await ctx.db.patch(f.pageId, { ownerKind: "company" })
      if (gate === "media_moderation" || gate === "version_moderation") {
        const state = await ctx.db.query("moderationContentStates").withIndex("by_target", q => q.eq("targetKind", gate === "media_moderation" ? "editorialMedia" : "editorialVersion").eq("targetId", gate === "media_moderation" ? f.media.mediaId : f.versionId)).unique()
        await ctx.db.patch(state!._id, { status: "removed" })
      }
    })
    expect(await card(f, post.postId)).toBeNull()
    expect(await f.context()).toBeNull()
    expect(await code(f.admin.as.query(api.modules.posts.posts.getPost, { networkId: f.root, postId: post.postId }))).toBe("notFound")
    expect(await code(f.admin.as.mutation(api.modules.editorial.social.setDiscussion, { networkId: f.root, articleId: f.articleId, expectedVersionId: f.versionId, expectedRevision: 1, enabled: true }))).toBe("notFound")
  })
  it("un rôle retiré ferme les écritures de discussion mais ne transforme pas la page en publication personnelle", async () => {
    const f = await fixture(), post = await f.announce()
    await f.t.run(async ctx => ctx.db.patch(f.authorityId, { role: "signatory", authorityRevision: 1 }))
    expect(await code(f.admin.as.mutation(api.modules.editorial.social.setDiscussion, { networkId: f.root, articleId: f.articleId, expectedVersionId: f.versionId, expectedRevision: 1, enabled: true }))).toBe("notFound")
    expect(await code(f.announce())).toBe("notFound")
    expect(await f.t.run(async ctx => ctx.db.get(post.postId))).toMatchObject({ body: "", editorialArticleId: f.articleId })
  })
  it("aucune édition générique ne peut transformer la référence canonique", async () => {
    const f = await fixture(), post = await f.announce()
    expect(await code(f.admin.as.mutation(api.modules.posts.posts.edit, { networkId: f.root, postId: post.postId, body: "Fausse copie de l'article" }))).toBe("notFound")
    expect(await code(f.admin.as.mutation(api.modules.pages.pages.editPagePost, { networkId: f.root, pageId: f.pageId, postId: post.postId, body: "Fausse copie de page", expectedBody: "", expectedEditedAt: null }))).toBe("notFound")
    expect(await f.t.run(async ctx => ctx.db.get(post.postId))).toMatchObject({ body: "", searchText: "", editorialArticleId: f.articleId })
  })
  it.each(["removed", "deleted"])("le post %s ne donne jamais lieu à une seconde annonce", async state => {
    const f = await fixture(), post = await f.announce()
    if (state === "removed") await f.admin.as.mutation(api.modules.posts.posts.remove, { networkId: f.root, postId: post.postId })
    else await f.t.run(async ctx => ctx.db.delete(post.postId))
    expect(await f.context()).toMatchObject({ postId: post.postId, canAnnounce: false, canManageComments: false, discussionAvailable: false, revision: 1 })
    expect(await f.announce()).toMatchObject({ postId: post.postId, created: false, revision: 1 })
    expect(await f.t.run(async ctx => ctx.db.query("posts").take(3))).toHaveLength(state === "removed" ? 1 : 0)
    expect(await f.t.run(async ctx => ctx.db.query("editorialSocialLinks").take(3))).toHaveLength(1)
  })
  it("un lien reciblé ne rend pas un post étranger ni une carte incohérente", async () => {
    const f = await fixture(), post = await f.announce(), ordinary = await f.reader.as.mutation(api.modules.posts.posts.publish, { networkId: f.root, body: "Autre publication" })
    await f.t.run(async ctx => { const link = await ctx.db.query("editorialSocialLinks").withIndex("by_article", q => q.eq("articleId", f.articleId)).unique(); await ctx.db.patch(link!._id, { postId: ordinary.postId }) })
    expect(await card(f, post.postId)).toBeNull()
    expect(await f.context()).toMatchObject({ postId: null, discussionAvailable: false, canAnnounce: false })
    expect(await code(f.admin.as.mutation(api.modules.editorial.social.setDiscussion, { networkId: f.root, articleId: f.articleId, expectedVersionId: f.versionId, expectedRevision: 1, enabled: true }))).toBe("notFound")
  })
})

describe("MP13 — portée publique spécialisée", () => {
  it("exclut les références éditoriales des projections sociales anonymes, y compris leurs citations", async () => {
    const f = await fixture(), post = await f.announce(), share = await f.reader.as.mutation(api.modules.posts.posts.publish, { networkId: f.root, body: "Un relais choisi", sharedPostId: post.postId })
    const result = await f.t.run(async ctx => {
      // Même sous une ancienne ligne artificiellement root/officielle, la porte sociale publique reste fermée.
      await ctx.db.patch(post.postId, { visibility: "root", onRoot: true })
      await ctx.db.patch(f.pageId, { trust: "official", trustRank: 2 })
      await ctx.db.patch(share.postId, { visibility: "root", onRoot: true })
      const root = (await ctx.db.get(f.root))!, canonical = (await ctx.db.get(post.postId))!, wrapper = (await ctx.db.get(share.postId))!
      return { canonicalAllowed: await publicPostEligible(ctx, { root, reader: null }, canonical), wrapper: await publicPostDto(ctx, { root, reader: null }, wrapper) }
    })
    expect(result.canonicalAllowed).toBe(false)
    expect(result.wrapper.shared).toEqual({ available: false })
    expect(JSON.stringify(result)).not.toContain(draft().title)
    expect(JSON.stringify(result)).not.toContain(draft().chapeau)
  })
  async function childMedia(f: Fixture) {
    await f.t.run(async ctx => {
      const member = await ctx.db.query("networkMemberships").withIndex("by_network_and_person", q => q.eq("networkId", f.root).eq("personId", f.admin.personId)).unique()
      const { _id: omittedId, _creationTime: omittedTime, ...copy } = member!
      void omittedId; void omittedTime
      await ctx.db.insert("networkMemberships", { ...copy, networkId: f.testClosed })
      await ctx.db.patch(f.pageId, { networkId: f.testClosed })
      await ctx.db.patch(f.media.mediaId, { networkId: f.testClosed })
      await ctx.db.patch(f.articleId, { networkId: f.testClosed })
      await ctx.db.patch(f.versionId, { networkId: f.testClosed })
      await ctx.db.patch(f.authorityId, { networkId: f.testClosed })
      for (const [kind, id] of [["editorialMedia", f.media.mediaId], ["editorialVersion", f.versionId]] as const) {
        const state = await ctx.db.query("moderationContentStates").withIndex("by_target", q => q.eq("targetKind", kind).eq("targetId", id)).unique()
        await ctx.db.patch(state!._id, { networkId: f.testClosed })
      }
    })
  }
  it.each(["root_inactive", "origin_inactive", "wrong_parent"])("la projection média garde %s après extraction db-only de l'origine", async gate => {
    const f = await fixture()
    await childMedia(f)
    const read = () => f.t.run(async ctx => readPublicMedia(ctx, { root: (await ctx.db.get(f.root))! }, "social-journal", pageOpts))
    expect(await read()).not.toBeNull()
    await f.t.run(async ctx => {
      if (gate === "root_inactive") await ctx.db.patch(f.root, { status: "archived" })
      if (gate === "origin_inactive") await ctx.db.patch(f.testClosed, { status: "archived" })
      if (gate === "wrong_parent") await ctx.db.patch(f.testClosed, { parentId: undefined })
    })
    expect(await read()).toBeNull()
  })
})
