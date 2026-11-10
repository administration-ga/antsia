/** MP12 : bureau privé et site média séparé ; les versions en correction ne remplacent pas la publication courante. */
import { EDITORIAL_BYLINE_CONSENT_VERSION, editorialSectionKey } from "@antsia/social-domain/editorial"
import { paginationOptsValidator, type PaginationOptions } from "convex/server"
import { v } from "convex/values"
import type { Doc, Id } from "../../_generated/dataModel"
import type { QueryCtx } from "../../_generated/server"
import { fail, notFound } from "../../lib/errors"
import { networkQuery } from "../../lib/functions"
import { canReadModeratedContent, contentState } from "../moderation/policy"
import { findPageByHandle } from "../pages/access"
import { isDiscoverablePerson, isPublishedPerson } from "../people/miniProfile"
import { editorialAccessOrNull, editorialGrantLive, editorialMediaOf, editorialPageOrNull, editorialPermissions, requireEditorialRole } from "./access"
import { editorialAssetForReading } from "./assets"
import { editorialApprovalLive, editorialPublicConsentLive } from "./publication"
import { editorialDigest, editorialPageSize } from "./rules"
import { editorialArticleCardValidator, editorialEditorValidator, editorialPublishedArticleValidator, editorialPublishedMediaValidator, editorialVersionValidator, editorialWorkingStateValidator, type EditorialEditor, type EditorialPublishedArticle, type EditorialPublishedCard, type EditorialPublishedMedia, type EditorialVersion } from "./validators"

type ReadCtx = Pick<QueryCtx, "db">
type UrlCtx = Pick<QueryCtx, "db" | "storage">
type ReadContext = { networkId: Id<"networks">; readerPersonId?: Id<"persons"> }
async function publishedModeration(ctx: ReadCtx, versionId: Id<"editorialVersions">, readerPersonId?: Id<"persons">) { return (await contentState(ctx, "editorialVersion", versionId))?.status === "published" && await canReadModeratedContent(ctx, "editorialVersion", versionId, readerPersonId) }
export async function readableEditorialMedia(ctx: ReadCtx, networkId: Id<"networks">, mediaId: Id<"editorialMedia">, readerPersonId: Id<"persons">) {
  const media = await ctx.db.get(mediaId), page = media && media.networkId === networkId ? await editorialPageOrNull(ctx, networkId, media.pageId, readerPersonId) : null
  const state = page ? await contentState(ctx, "page", page._id) : null
  return media && page && (!state || state.status === "published") && (await contentState(ctx, "editorialMedia", mediaId))?.status === "published" && await canReadModeratedContent(ctx, "editorialMedia", mediaId, readerPersonId) ? { media, page } : null
}
/** Contrat db-only réutilisé par le lien social canonique ; aucune dépendance aux posts. */
export async function readablePublishedArticle(ctx: ReadCtx, context: ReadContext, articleId: Id<"editorialArticles">) {
  const article = await ctx.db.get(articleId)
  if (!article || article.networkId !== context.networkId || article.publicationState !== "published" || !article.publishedVersionId || article.publishedAt === undefined) return null
  const page = await editorialPageOrNull(ctx, article.networkId, article.pageId, context.readerPersonId), media = await editorialMediaOf(ctx, article.pageId)
  const pageModeration = await contentState(ctx, "page", article.pageId)
  if (!page || !media || pageModeration && pageModeration.status !== "published") return null
  if ((await contentState(ctx, "editorialMedia", media._id))?.status !== "published" || !await canReadModeratedContent(ctx, "editorialMedia", media._id, context.readerPersonId)) return null
  const version = await ctx.db.get(article.publishedVersionId)
  if (!version || version.networkId !== article.networkId || version.pageId !== article.pageId || version.articleId !== article._id || !await publishedModeration(ctx, version._id, context.readerPersonId)) return null
  return { article, version, page, media }
}
/** Accès au dossier pour signalement : publication courante ou version appartenant à la rédaction habilitée. */
export async function readableEditorialVersion(ctx: ReadCtx, networkId: Id<"networks">, versionId: Id<"editorialVersions">, readerPersonId: Id<"persons">) {
  const version = await ctx.db.get(versionId)
  if (!version || version.networkId !== networkId) return null
  const article = await ctx.db.get(version.articleId)
  if (!article || article.pageId !== version.pageId || article.networkId !== networkId) return null
  const published = await readablePublishedArticle(ctx, { networkId, readerPersonId }, article._id)
  if (published?.version._id === versionId) return { ...published, version }
  const access = await editorialAccessOrNull(ctx, { networkId, personId: readerPersonId }, article.pageId)
  if (!access || !editorialPermissions(access, article, readerPersonId).canEdit && access.role !== "page_admin" && !access.roles.includes("publisher") && !access.roles.includes("media_admin")) return null
  return { article, version, page: access.page, media: access.media! }
}
async function versionDto(ctx: ReadCtx, version: Doc<"editorialVersions">): Promise<EditorialVersion> {
  return { versionId: version._id, versionNumber: version.versionNumber, digest: version.digest, title: version.title, chapeau: version.chapeau, sectionKey: version.sectionKey, sectionLabel: version.sectionLabel, byline: version.byline, correctionNotice: version.correctionNotice, blocks: version.blocks, createdAt: version.createdAt, moderationStatus: (await contentState(ctx, "editorialVersion", version._id))?.status ?? null }
}
export const editor = networkQuery({
  minStatus: "declaree", args: { articleId: v.id("editorialArticles") }, returns: v.union(editorialEditorValidator, v.null()),
  handler: async (ctx, args): Promise<EditorialEditor | null> => {
    const article = await ctx.db.get(args.articleId)
    if (!article || article.networkId !== ctx.networkId || !article.workingVersionId) return null
    const access = await editorialAccessOrNull(ctx, { networkId: ctx.networkId, personId: ctx.person._id }, article.pageId)
    if (!access) return null
    const permissions = editorialPermissions(access, article, ctx.person._id)
    if (!permissions.canEdit && access.role !== "page_admin" && !access.roles.includes("publisher") && !access.roles.includes("media_admin")) return null
    const version = await ctx.db.get(article.workingVersionId), published = article.publishedVersionId ? await ctx.db.get(article.publishedVersionId) : null
    if (!version || version.articleId !== article._id) return null
    const moderation = await publishedModeration(ctx, version._id, ctx.person._id), approved = await editorialApprovalLive(ctx, article, version)
    permissions.canApprove &&= moderation && (article.workingState === "in_review" || article.workingState === "approved")
    permissions.canPublish &&= moderation && approved && article.workingState === "approved" && !(article.publicationState === "published" && article.publishedVersionId === version._id)
    permissions.canSchedule &&= permissions.canPublish
    permissions.canWithdraw &&= article.publicationState === "published"
    permissions.canSubmit &&= article.workingState === "draft" || article.workingState === "changes_requested"
    permissions.canRequestChanges &&= article.workingState !== "draft" && article.workingState !== "changes_requested"
    return { articleId: article._id, pageId: article.pageId, articleKey: article.articleKey, revision: article.revision, workingState: article.workingState, publicationState: article.publicationState, workingVersion: await versionDto(ctx, version), publishedVersion: published && published.articleId === article._id ? await versionDto(ctx, published) : null, scheduledAt: article.schedule?.publishAt ?? null, reviewNote: article.reviewNote ?? null, permissions }
  },
})
/** Historique privé append-only, quatre versions au plus ; aucune remise en ligne implicite. */
export const history = networkQuery({
  minStatus: "declaree", args: { articleId: v.id("editorialArticles"), paginationOpts: paginationOptsValidator }, returns: v.object({ page: v.array(editorialVersionValidator), isDone: v.boolean(), continueCursor: v.string() }),
  handler: async (ctx, args) => {
    const article = await ctx.db.get(args.articleId)
    if (!article || article.networkId !== ctx.networkId) return notFound()
    const access = await editorialAccessOrNull(ctx, { networkId: ctx.networkId, personId: ctx.person._id }, article.pageId)
    if (!access || !editorialPermissions(access, article, ctx.person._id).canEdit && access.role !== "page_admin" && !access.roles.includes("publisher") && !access.roles.includes("media_admin")) return notFound()
    const scope = await editorialDigest(["editorial-history-v1", ctx.networkId, ctx.person._id, article._id, article.pageId])
    const cursor = await readCursor(args.paginationOpts.cursor, scope)
    const window = await ctx.db.query("editorialVersions").withIndex("by_article_number", q => q.eq("articleId", article._id)).order("desc").paginate({ cursor, numItems: Math.min(4, editorialPageSize(args.paginationOpts.numItems)), maximumRowsRead: 4, maximumBytesRead: 256 * 1024 })
    const page: EditorialVersion[] = []
    for (const row of window.page) if (row.networkId === ctx.networkId && row.pageId === article.pageId) page.push(await versionDto(ctx, row))
    return { page, isDone: window.isDone, continueCursor: window.isDone ? "" : JSON.stringify({ version: 1, scope, cursor: window.continueCursor }) }
  },
})
export const desk = networkQuery({
  minStatus: "declaree", args: { pageId: v.id("pages"), status: v.optional(editorialWorkingStateValidator), paginationOpts: paginationOptsValidator }, returns: v.object({ page: v.array(editorialArticleCardValidator), isDone: v.boolean(), continueCursor: v.string(), filteredWindow: v.boolean() }),
  handler: async (ctx, args) => {
    const access = await requireEditorialRole(ctx, { networkId: ctx.networkId, personId: ctx.person._id }, args.pageId)
    let query = ctx.db.query("editorialArticles").withIndex("by_page_updatedAt", q => q.eq("pageId", args.pageId)).order("desc")
    if (args.status) query = query.filter(q => q.eq(q.field("workingState"), args.status!))
    if (access.role !== "page_admin" && !access.roles.some(role => role === "editor" || role === "publisher" || role === "media_admin")) query = query.filter(q => q.eq(q.field("createdByPersonId"), ctx.person._id))
    const window = await query.paginate({ ...args.paginationOpts, numItems: editorialPageSize(args.paginationOpts.numItems), maximumRowsRead: 48, maximumBytesRead: 256 * 1024 })
    const page = []
    for (const row of window.page) {
      const version = row.workingVersionId ? await ctx.db.get(row.workingVersionId) : null
      if (version?.articleId === row._id) page.push({ articleId: row._id, articleKey: row.articleKey, revision: row.revision, title: version.title, chapeau: version.chapeau, sectionKey: version.sectionKey, workingState: row.workingState, publicationState: row.publicationState, updatedAt: row.updatedAt, publishedAt: row.publishedAt ?? null })
    }
    return { page, isDone: window.isDone, continueCursor: window.continueCursor, filteredWindow: page.length !== window.page.length || !window.isDone && !page.length }
  },
})
type PublishedLive = NonNullable<Awaited<ReturnType<typeof readablePublishedArticle>>>
async function publishedDto(ctx: UrlCtx, live: PublishedLive, readerPersonId?: Id<"persons">, publicRead = false): Promise<EditorialPublishedArticle> {
  const { article, version, page } = live
  let byline = { label: page.name, handle: null as string | null }
  if (version.byline.kind === "contributor") {
    const grant = await ctx.db.get(version.byline.grantId), person = grant ? await ctx.db.get(grant.personId) : null
    const personState = person ? await contentState(ctx, "person", person._id) : null
    if (grant && person?.displayName && person.handle && (!personState || personState.status === "published") && (publicRead ? isDiscoverablePerson(person) : isPublishedPerson(person)) && await editorialGrantLive(ctx, page, grant) && grant.bylineConsentTextVersion === EDITORIAL_BYLINE_CONSENT_VERSION && grant.bylineConsentedAt !== undefined && grant.bylineConsentRevokedAt === undefined && await canReadModeratedContent(ctx, "person", person._id, readerPersonId)) byline = { label: person.displayName, handle: person.handle }
  }
  const blocks: EditorialPublishedArticle["blocks"] = []
  for (const block of version.blocks) {
    if (block.type !== "image") { blocks.push(block); continue }
    const asset = await editorialAssetForReading(ctx, { networkId: article.networkId, pageId: article.pageId, assetId: block.assetId })
    if (!asset) continue
    blocks.push({ type: "image", url: asset.url, withheld: asset.withheld, altText: asset.altText, credit: asset.credit })
  }
  return { articleKey: article.articleKey, mediaHandle: page.handle, mediaName: page.name, title: version.title, chapeau: version.chapeau, sectionKey: version.sectionKey, sectionLabel: version.sectionLabel, byline, correctionNotice: version.correctionNotice, blocks, versionNumber: version.versionNumber, publishedAt: article.firstPublishedAt ?? article.publishedAt!, updatedAt: article.publishedAt! }
}
async function readCursor(raw: string | null, scope: string): Promise<string | null> {
  if (raw === null) return null
  if (!raw || raw.length > 8192) return fail("invalidArgument", { field: "cursor" })
  try { const parsed: unknown = JSON.parse(raw); if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) || Object.keys(parsed).length !== 3 || !("version" in parsed) || parsed.version !== 1 || !("scope" in parsed) || parsed.scope !== scope || !("cursor" in parsed) || typeof parsed.cursor !== "string" || !parsed.cursor) return fail("invalidArgument"); return parsed.cursor } catch { return fail("invalidArgument", { field: "cursor" }) }
}
async function mediaFeed(ctx: ReadCtx, live: { page: Doc<"pages">; media: Doc<"editorialMedia"> }, pagination: PaginationOptions, readerPersonId?: Id<"persons">, section?: string, publicRead = false): Promise<EditorialPublishedMedia> {
  if (section !== undefined && !editorialSectionKey(section)) return fail("invalidArgument", { field: "section" })
  const scope = await editorialDigest(["editorial-feed-v1", live.page.networkId, live.page._id, live.media.revision, readerPersonId ?? null, publicRead, section ?? null])
  const cursor = await readCursor(pagination.cursor, scope)
  const query = section !== undefined ? ctx.db.query("editorialArticles").withIndex("by_page_section_publication_publishedAt", q => q.eq("pageId", live.page._id).eq("publishedSectionKey", section).eq("publicationState", "published")) : ctx.db.query("editorialArticles").withIndex("by_page_publication_publishedAt", q => q.eq("pageId", live.page._id).eq("publicationState", "published"))
  const window = await query.order("desc").paginate({ cursor, numItems: editorialPageSize(pagination.numItems), maximumRowsRead: 48, maximumBytesRead: 256 * 1024 }), page: EditorialPublishedCard[] = []
  for (const candidate of window.page) {
    const readable = await readablePublishedArticle(ctx, { networkId: live.page.networkId, readerPersonId }, candidate._id)
    if (readable) page.push({ articleKey: candidate.articleKey, title: readable.version.title, chapeau: readable.version.chapeau, sectionKey: readable.version.sectionKey, sectionLabel: readable.version.sectionLabel, publishedAt: candidate.publishedAt!, versionNumber: readable.version.versionNumber, correctionNotice: readable.version.correctionNotice })
  }
  return { handle: live.page.handle, name: live.page.name, description: live.media.description, sections: live.media.sections, articles: { page, isDone: window.isDone, continueCursor: window.isDone ? "" : JSON.stringify({ version: 1, scope, cursor: window.continueCursor }), filteredWindow: page.length !== window.page.length || !window.isDone && !page.length } }
}
async function memberMedia(ctx: ReadCtx, networkId: Id<"networks">, handle: string, readerPersonId: Id<"persons">) {
  const found = await findPageByHandle(ctx, handle), page = found ? await editorialPageOrNull(ctx, networkId, found._id, readerPersonId) : null, media = page ? await editorialMediaOf(ctx, page._id) : null
  const state = page ? await contentState(ctx, "page", page._id) : null
  return page && media && (!state || state.status === "published") && (await contentState(ctx, "editorialMedia", media._id))?.status === "published" && await canReadModeratedContent(ctx, "editorialMedia", media._id, readerPersonId) ? { page, media } : null
}
export const media = networkQuery({ minStatus: "declaree", args: { readerScope: v.id("persons"), handle: v.string(), paginationOpts: paginationOptsValidator, section: v.optional(v.string()) }, returns: v.union(editorialPublishedMediaValidator, v.null()), handler: async (ctx, args) => { if (args.readerScope !== ctx.person._id) return notFound(); const live = await memberMedia(ctx, ctx.networkId, args.handle, ctx.person._id); return live ? mediaFeed(ctx, live, args.paginationOpts, ctx.person._id, args.section) : null } })
export const article = networkQuery({ minStatus: "declaree", args: { readerScope: v.id("persons"), handle: v.string(), articleKey: v.string() }, returns: v.union(v.object({ ...editorialPublishedArticleValidator.fields, versionId: v.id("editorialVersions") }), v.null()), handler: async (ctx, args) => {
  if (args.readerScope !== ctx.person._id) return notFound()
  const media = await memberMedia(ctx, ctx.networkId, args.handle, ctx.person._id)
  if (!media || !/^a-[a-f0-9]{32}$/u.test(args.articleKey)) return null
  const row = await ctx.db.query("editorialArticles").withIndex("by_page_key", q => q.eq("pageId", media.page._id).eq("articleKey", args.articleKey)).unique(), live = row ? await readablePublishedArticle(ctx, { networkId: ctx.networkId, readerPersonId: ctx.person._id }, row._id) : null
  return live ? { ...await publishedDto(ctx, live, ctx.person._id), versionId: live.version._id } : null
} })
type PublicContext = { root: Doc<"networks">; readerPersonId?: Id<"persons"> }
/** Équivalent de public/access.publicOriginNetwork ; db-only pour garder la lecture d'article indépendante des posts. */
async function editorialPublicOriginNetwork(ctx: ReadCtx, root: Doc<"networks">, networkId: Id<"networks">) {
  const origin = await ctx.db.get(networkId)
  if (!origin || origin.status !== "active") return null
  return origin._id === root._id || origin.kind === "closed" && origin.parentId === root._id ? origin : null
}
async function publicMedia(ctx: ReadCtx, context: PublicContext, handle: string) {
  if (context.root.kind !== "root" || context.root.status !== "active") return null
  const found = await findPageByHandle(ctx, handle)
  if (!found || !await editorialPublicOriginNetwork(ctx, context.root, found.networkId) || found.networkId !== context.root._id && (found.visibility !== "root" || !found.onRoot)) return null
  const page = await editorialPageOrNull(ctx, found.networkId, found._id, context.readerPersonId), media = page ? await editorialMediaOf(ctx, page._id) : null, state = page ? await contentState(ctx, "page", page._id) : null
  return page && media && (!state || state.status === "published") && (await contentState(ctx, "editorialMedia", media._id))?.status === "published" && await canReadModeratedContent(ctx, "editorialMedia", media._id, context.readerPersonId) && await editorialPublicConsentLive(ctx, media) ? { page, media } : null
}
export async function readPublicMedia(ctx: UrlCtx, context: PublicContext, handle: string, paginationOpts: PaginationOptions, section?: string): Promise<EditorialPublishedMedia | null> { const live = await publicMedia(ctx, context, handle); return live ? mediaFeed(ctx, live, paginationOpts, context.readerPersonId, section, true) : null }
export async function readPublicArticle(ctx: UrlCtx, context: PublicContext, handle: string, articleKey: string): Promise<EditorialPublishedArticle | null> {
  const media = await publicMedia(ctx, context, handle)
  if (!media || !/^a-[a-f0-9]{32}$/u.test(articleKey)) return null
  const row = await ctx.db.query("editorialArticles").withIndex("by_page_key", q => q.eq("pageId", media.page._id).eq("articleKey", articleKey)).unique(), live = row ? await readablePublishedArticle(ctx, { networkId: media.page.networkId, readerPersonId: context.readerPersonId }, row._id) : null
  return live ? publishedDto(ctx, live, context.readerPersonId, true) : null
}
