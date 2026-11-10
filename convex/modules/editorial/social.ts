/** MP13 : annonce explicite par référence, discussion unique et aperçu vivant. */
import { v } from "convex/values"
import type { Doc, Id } from "../../_generated/dataModel"
import type { QueryCtx } from "../../_generated/server"
import { fail, notFound } from "../../lib/errors"
import { networkMutation, networkQuery } from "../../lib/functions"
import { enforceRateLimit } from "../../lib/rateLimit"
import { findPageByHandle } from "../pages/access"
import { canSeePostDoc } from "../posts/access"
import { writePost } from "../posts/postWrite"
import { editorialAccessOrNull, requireEditorialRole } from "./access"
import { readablePublishedArticle } from "./read"
import { editorialExpectedRevision } from "./rules"

type ReadCtx = Pick<QueryCtx, "db">
async function linkOf(ctx: ReadCtx, articleId: Id<"editorialArticles">) { return ctx.db.query("editorialSocialLinks").withIndex("by_article", q => q.eq("articleId", articleId)).unique() }
function matchingLink(link: Doc<"editorialSocialLinks">, article: Doc<"editorialArticles">) { return link.networkId === article.networkId && link.pageId === article.pageId && link.articleId === article._id }
function matchingPost(post: Doc<"posts">, link: Doc<"editorialSocialLinks">) { return post._id === link.postId && post.editorialArticleId === link.articleId && post.networkId === link.networkId && post.pageId === link.pageId }
const contextValidator = v.object({ articleId: v.id("editorialArticles"), versionId: v.id("editorialVersions"), postId: v.union(v.id("posts"), v.null()), commentsEnabled: v.boolean(), revision: v.number(), canAnnounce: v.boolean(), canManageComments: v.boolean(), discussionAvailable: v.boolean() })

export const context = networkQuery({
  minStatus: "declaree", args: { readerScope: v.id("persons"), handle: v.string(), articleKey: v.string() }, returns: v.union(contextValidator, v.null()),
  handler: async (ctx, args) => {
    if (args.readerScope !== ctx.person._id) return notFound()
    const page = await findPageByHandle(ctx, args.handle)
    if (!page || page.networkId !== ctx.networkId || !/^a-[a-f0-9]{32}$/u.test(args.articleKey)) return null
    const article = await ctx.db.query("editorialArticles").withIndex("by_page_key", q => q.eq("pageId", page._id).eq("articleKey", args.articleKey)).unique()
    const live = article ? await readablePublishedArticle(ctx, { networkId: ctx.networkId, readerPersonId: ctx.person._id }, article._id) : null
    if (!live) return null
    const link = await linkOf(ctx, live.article._id)
    if (link && !matchingLink(link, live.article)) return null
    const post = link ? await ctx.db.get(link.postId) : null
    const coherentPost = !!post && !!link && matchingPost(post, link)
    const discussionAvailable = post !== null && coherentPost && post.status === "published" && await canSeePostDoc(ctx, { network: ctx.network, personId: ctx.person._id }, post)
    const access = await editorialAccessOrNull(ctx, { networkId: ctx.networkId, personId: ctx.person._id }, page._id, ["publisher"])
    return { articleId: live.article._id, versionId: live.version._id, postId: link && (!post || coherentPost) ? link.postId : null,
      commentsEnabled: link?.commentsEnabled ?? false, revision: link?.revision ?? 0, canAnnounce: access !== null && link === null,
      canManageComments: access !== null && link !== null && discussionAvailable, discussionAvailable }
  },
})

export const announce = networkMutation({
  minStatus: "declaree", writeBucket: "editorial.publish.write", args: { articleId: v.id("editorialArticles"), expectedVersionId: v.id("editorialVersions"), expectedRevision: v.number() }, returns: v.object({ postId: v.id("posts"), revision: v.number(), commentsEnabled: v.boolean(), created: v.boolean() }),
  handler: async (ctx, args) => {
    const live = await readablePublishedArticle(ctx, { networkId: ctx.networkId, readerPersonId: ctx.person._id }, args.articleId)
    if (!live) return notFound()
    if (args.expectedVersionId !== live.version._id) return fail("conflict", { field: "expectedVersionId" })
    await requireEditorialRole(ctx, { networkId: ctx.networkId, personId: ctx.person._id }, live.page._id, ["publisher"])
    const link = await linkOf(ctx, args.articleId)
    if (link) {
      if (!matchingLink(link, live.article)) return notFound()
      // L'effacement ou le retrait du post ne redonne jamais une seconde identité sociale à l'article.
      if (!Number.isSafeInteger(args.expectedRevision) || args.expectedRevision < 0 || args.expectedRevision > link.revision) return fail("conflict")
      return { postId: link.postId, revision: link.revision, commentsEnabled: link.commentsEnabled, created: false }
    }
    editorialExpectedRevision(args.expectedRevision, 0)
    await enforceRateLimit(ctx, "post.publish", ctx.person._id)
    const { postId } = await writePost(ctx, { network: ctx.network, authorPersonId: ctx.person._id, pageId: live.page._id, editorialArticleId: live.article._id, body: "", audience: "public", visibility: "network" })
    const now = Date.now()
    await ctx.db.insert("editorialSocialLinks", { networkId: ctx.networkId, pageId: live.page._id, articleId: live.article._id, postId, commentsEnabled: false, revision: 1, announcedByPersonId: ctx.person._id, announcedAt: now, updatedByPersonId: ctx.person._id, updatedAt: now })
    return { postId, revision: 1, commentsEnabled: false, created: true }
  },
})

export const setDiscussion = networkMutation({
  minStatus: "declaree", writeBucket: "editorial.publish.write", args: { articleId: v.id("editorialArticles"), expectedVersionId: v.id("editorialVersions"), expectedRevision: v.number(), enabled: v.boolean() }, returns: v.object({ postId: v.id("posts"), revision: v.number(), commentsEnabled: v.boolean(), changed: v.boolean() }),
  handler: async (ctx, args) => {
    const live = await readablePublishedArticle(ctx, { networkId: ctx.networkId, readerPersonId: ctx.person._id }, args.articleId)
    if (!live) return notFound()
    if (args.expectedVersionId !== live.version._id) return fail("conflict", { field: "expectedVersionId" })
    await requireEditorialRole(ctx, { networkId: ctx.networkId, personId: ctx.person._id }, live.page._id, ["publisher"])
    const link = await linkOf(ctx, args.articleId), post = link ? await ctx.db.get(link.postId) : null
    if (!link || !post || !matchingLink(link, live.article) || !matchingPost(post, link) || post.status !== "published" || !await canSeePostDoc(ctx, { network: ctx.network, personId: ctx.person._id }, post)) return notFound()
    editorialExpectedRevision(args.expectedRevision, link.revision)
    if (link.commentsEnabled === args.enabled) return { postId: post._id, revision: link.revision, commentsEnabled: link.commentsEnabled, changed: false }
    const revision = link.revision + 1
    await ctx.db.patch(link._id, { commentsEnabled: args.enabled, revision, updatedByPersonId: ctx.person._id, updatedAt: Date.now() })
    return { postId: post._id, revision, commentsEnabled: args.enabled, changed: true }
  },
})

export const card = networkQuery({
  minStatus: "declaree", args: { readerScope: v.id("persons"), postId: v.id("posts") }, returns: v.union(v.object({ handle: v.string(), articleKey: v.string(), title: v.string(), excerpt: v.string(), sectionLabel: v.union(v.string(), v.null()), publishedAt: v.number() }), v.null()),
  handler: async (ctx, args) => {
    if (args.readerScope !== ctx.person._id) return notFound()
    const post = await ctx.db.get(args.postId)
    if (!post || !post.editorialArticleId || post.status !== "published" || !await canSeePostDoc(ctx, { network: ctx.network, personId: ctx.person._id }, post)) return null
    const live = await readablePublishedArticle(ctx, { networkId: post.networkId, readerPersonId: ctx.person._id }, post.editorialArticleId)
    if (!live) return null
    return { handle: live.page.handle, articleKey: live.article.articleKey, title: live.version.title, excerpt: live.version.chapeau, sectionLabel: live.version.sectionLabel, publishedAt: live.article.publishedAt! }
  },
})
