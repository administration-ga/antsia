/** MP12 : chaque sauvegarde crée une version, chaque validation/publication est un acte CAS distinct. */
import { EDITORIAL_BYLINE_CONSENT_VERSION, EDITORIAL_SCHEDULE_MAX_MS, editorialText } from "@antsia/social-domain/editorial"
import { makeFunctionReference } from "convex/server"
import { v } from "convex/values"
import type { Doc, Id } from "../../_generated/dataModel"
import type { MutationCtx } from "../../_generated/server"
import { fail, notFound } from "../../lib/errors"
import { networkMutation } from "../../lib/functions"
import { moderateOwnedContentWrite } from "../moderation/policy"
import { editorialGrantLive, editorialPermissions, requireEditorialRole, type EditorialAccess } from "./access"
import { editorialApprovalLive, editorialVersionReady, publishEditorialVersion } from "./publication"
import { editorialApprovalReset, editorialCanonicalContent, editorialDigest, editorialEvent, editorialExpectedRevision, editorialVersionModerationText, editorialWriteInput } from "./rules"
import { editorialArticleMutationValidator, editorialDraftInputValidator, type EditorialDraftWriteInput } from "./validators"

const scheduledPublish = makeFunctionReference<"mutation", { networkId: Id<"networks">; articleId: Id<"editorialArticles">; generation: number }, null>("modules/editorial/jobs:publishScheduled")
type Caller = { networkId: Id<"networks">; personId: Id<"persons"> }
export async function managedEditorialArticle(ctx: Pick<MutationCtx, "db">, caller: Caller, articleId: Id<"editorialArticles">, roles?: readonly ("author" | "editor" | "publisher" | "media_admin")[]) {
  const article = await ctx.db.get(articleId)
  if (!article || article.networkId !== caller.networkId || !article.workingVersionId) return notFound()
  const access = await requireEditorialRole(ctx, caller, article.pageId, roles)
  const version = await ctx.db.get(article.workingVersionId)
  if (!version || version.articleId !== articleId || version.networkId !== caller.networkId || version.pageId !== article.pageId) return notFound()
  return { article, version, access }
}
function result(article: Pick<Doc<"editorialArticles">, "_id" | "revision" | "workingState" | "publicationState">, changed: boolean) { return { articleId: article._id, revision: article.revision, workingState: article.workingState, publicationState: article.publicationState, changed } }
async function validateDraft(ctx: Pick<MutationCtx, "db">, access: EditorialAccess, input: EditorialDraftWriteInput): Promise<void> {
  if (!access.media || input.sectionKey !== null && !access.media.sections.some(section => section.key === input.sectionKey)) return fail("invalidArgument", { field: "sectionKey" })
  if (input.byline.kind === "contributor") {
    const grant = await ctx.db.get(input.byline.grantId)
    if (!grant || !await editorialGrantLive(ctx, access.page, grant) || grant.bylineConsentTextVersion !== EDITORIAL_BYLINE_CONSENT_VERSION || grant.bylineConsentedAt === undefined || grant.bylineConsentRevokedAt !== undefined) return fail("invalidArgument", { field: "byline" })
  }
  // L'image peut encore être analysée lors de la rédaction ; son rattachement et ses crédits sont déjà obligatoires.
  await editorialVersionModerationText(ctx, { networkId: access.page.networkId, pageId: access.page._id, ...input })
}
async function appendVersion(ctx: MutationCtx, caller: Caller, access: EditorialAccess, articleId: Id<"editorialArticles">, versionNumber: number, input: EditorialDraftWriteInput, digest: string) {
  const versionId = await ctx.db.insert("editorialVersions", { networkId: caller.networkId, pageId: access.page._id, articleId, versionNumber, ...input, sectionLabel: input.sectionKey === null ? null : access.media!.sections.find(section => section.key === input.sectionKey)!.label, digest, authorPersonId: caller.personId, createdAt: Date.now() })
  await moderateOwnedContentWrite(ctx, { networkId: caller.networkId, owner: { pageId: access.page._id }, kind: "editorialVersion", id: versionId, text: await editorialVersionModerationText(ctx, { networkId: caller.networkId, pageId: access.page._id, ...input }) })
  return versionId
}
export const create = networkMutation({
  minStatus: "declaree", writeBucket: "editorial.article.write", args: { pageId: v.id("pages"), clientRequestId: v.string(), input: editorialDraftInputValidator }, returns: editorialArticleMutationValidator,
  handler: async (ctx, args) => {
    const caller = { networkId: ctx.networkId, personId: ctx.person._id }, access = await requireEditorialRole(ctx, caller, args.pageId, ["author", "editor"])
    if (!/^[A-Za-z0-9_-]{16,128}$/u.test(args.clientRequestId)) return fail("invalidArgument", { field: "clientRequestId" })
    const input = editorialWriteInput(args.input), digest = await editorialDigest(editorialCanonicalContent(input))
    const previous = await ctx.db.query("editorialArticles").withIndex("by_network_creator_request", q => q.eq("networkId", ctx.networkId).eq("createdByPersonId", ctx.person._id).eq("createRequestId", args.clientRequestId)).unique()
    if (previous) { if (previous.pageId !== args.pageId || previous.originalDigest !== digest) return fail("conflict"); return result(previous, false) }
    await validateDraft(ctx, access, input)
    const now = Date.now(), articleId = await ctx.db.insert("editorialArticles", { networkId: ctx.networkId, pageId: args.pageId, articleKey: "", createRequestId: args.clientRequestId, originalDigest: digest, revision: 1, versionCount: 1, workingState: "draft", publicationState: "unpublished", createdByPersonId: ctx.person._id, createdAt: now, updatedAt: now })
    const versionId = await appendVersion(ctx, caller, access, articleId, 1, input, digest)
    const articleKey = `a-${(await editorialDigest(["editorial-article-v1", ctx.networkId, args.pageId, articleId])).slice(0, 32)}`
    await ctx.db.patch(articleId, { workingVersionId: versionId, articleKey })
    await editorialEvent(ctx, { networkId: ctx.networkId, pageId: args.pageId, actorPersonId: ctx.person._id, articleId, versionId, action: "draft_saved", revision: 1, authority: access.authority })
    return { articleId, revision: 1, workingState: "draft" as const, publicationState: "unpublished" as const, changed: true }
  },
})
export const saveDraft = networkMutation({
  minStatus: "declaree", writeBucket: "editorial.article.write", args: { articleId: v.id("editorialArticles"), expectedRevision: v.number(), input: editorialDraftInputValidator }, returns: editorialArticleMutationValidator,
  handler: async (ctx, args) => {
    const caller = { networkId: ctx.networkId, personId: ctx.person._id }, { article, access, version } = await managedEditorialArticle(ctx, caller, args.articleId, ["author", "editor"])
    if (!editorialPermissions(access, article, ctx.person._id).canEdit) return notFound()
    editorialExpectedRevision(args.expectedRevision, article.revision)
    const input = editorialWriteInput(args.input), digest = await editorialDigest(editorialCanonicalContent(input))
    if (digest === version.digest) return result(article, false)
    await validateDraft(ctx, access, input)
    const versionId = await appendVersion(ctx, caller, access, article._id, article.versionCount + 1, input, digest), revision = article.revision + 1
    await ctx.db.patch(article._id, { ...editorialApprovalReset, workingVersionId: versionId, versionCount: article.versionCount + 1, workingState: "draft", revision, updatedAt: Date.now(), reviewNote: undefined })
    await editorialEvent(ctx, { networkId: ctx.networkId, pageId: article.pageId, actorPersonId: ctx.person._id, articleId: article._id, versionId, action: "draft_saved", revision, authority: access.authority })
    return result({ ...article, revision, workingState: "draft" }, true)
  },
})
export const submit = networkMutation({
  minStatus: "declaree", writeBucket: "editorial.article.write", args: { articleId: v.id("editorialArticles"), expectedRevision: v.number() }, returns: editorialArticleMutationValidator,
  handler: async (ctx, args) => {
    const { article, version, access } = await managedEditorialArticle(ctx, { networkId: ctx.networkId, personId: ctx.person._id }, args.articleId, ["author", "editor"])
    if (!editorialPermissions(access, article, ctx.person._id).canSubmit) return notFound()
    editorialExpectedRevision(args.expectedRevision, article.revision)
    if (article.workingState === "in_review") return result(article, false)
    if (article.workingState !== "draft" && article.workingState !== "changes_requested") return fail("conflict")
    const revision = article.revision + 1
    await ctx.db.patch(article._id, { ...editorialApprovalReset, workingState: "in_review", revision, updatedAt: Date.now() })
    await editorialEvent(ctx, { networkId: ctx.networkId, pageId: article.pageId, actorPersonId: ctx.person._id, articleId: article._id, versionId: version._id, action: "submitted", revision, authority: access.authority })
    return result({ ...article, revision, workingState: "in_review" }, true)
  },
})
export const requestChanges = networkMutation({
  minStatus: "declaree", writeBucket: "editorial.article.write", args: { articleId: v.id("editorialArticles"), expectedRevision: v.number(), note: v.string() }, returns: editorialArticleMutationValidator,
  handler: async (ctx, args) => {
    const { article, version, access } = await managedEditorialArticle(ctx, { networkId: ctx.networkId, personId: ctx.person._id }, args.articleId, ["editor", "publisher"])
    editorialExpectedRevision(args.expectedRevision, article.revision)
    const note = editorialText(args.note, 1000, true)
    if (!note) return fail("invalidArgument", { field: "note" })
    if (article.workingState === "draft" || article.workingState === "changes_requested") return fail("conflict")
    const revision = article.revision + 1
    await ctx.db.patch(article._id, { ...editorialApprovalReset, workingState: "changes_requested", reviewNote: note, revision, updatedAt: Date.now() })
    await editorialEvent(ctx, { networkId: ctx.networkId, pageId: article.pageId, actorPersonId: ctx.person._id, articleId: article._id, versionId: version._id, action: "changes_requested", revision, authority: access.authority })
    return result({ ...article, revision, workingState: "changes_requested" }, true)
  },
})
export const approve = networkMutation({
  minStatus: "declaree", writeBucket: "editorial.publish.write", args: { articleId: v.id("editorialArticles"), expectedRevision: v.number() }, returns: editorialArticleMutationValidator,
  handler: async (ctx, args) => {
    const { article, version, access } = await managedEditorialArticle(ctx, { networkId: ctx.networkId, personId: ctx.person._id }, args.articleId, ["publisher"])
    editorialExpectedRevision(args.expectedRevision, article.revision)
    if (article.workingState === "approved" && await editorialApprovalLive(ctx, article, version)) return result(article, false)
    if (article.workingState !== "in_review" && article.workingState !== "approved") return fail("conflict")
    await editorialVersionReady(ctx, article, version)
    const revision = article.revision + 1
    await ctx.db.patch(article._id, { workingState: "approved", approvedByPersonId: ctx.person._id, approvedAuthority: access.authority, approvedVersionId: version._id, approvedDigest: version.digest, approvedAt: Date.now(), schedule: undefined, revision, updatedAt: Date.now() })
    await editorialEvent(ctx, { networkId: ctx.networkId, pageId: article.pageId, actorPersonId: ctx.person._id, articleId: article._id, versionId: version._id, action: "approved", revision, authority: access.authority })
    return result({ ...article, revision, workingState: "approved" }, true)
  },
})
export const publish = networkMutation({
  minStatus: "declaree", writeBucket: "editorial.publish.write", args: { articleId: v.id("editorialArticles"), expectedRevision: v.number() }, returns: editorialArticleMutationValidator,
  handler: async (ctx, args) => {
    const { article, version } = await managedEditorialArticle(ctx, { networkId: ctx.networkId, personId: ctx.person._id }, args.articleId, ["publisher"])
    editorialExpectedRevision(args.expectedRevision, article.revision)
    if (article.publicationState === "published" && article.publishedVersionId === version._id) return result(article, false)
    if (article.workingState !== "approved") return fail("conflict")
    const revision = await publishEditorialVersion(ctx, article, version, ctx.person._id)
    return result({ ...article, revision, workingState: "approved", publicationState: "published" }, true)
  },
})
export const schedule = networkMutation({
  minStatus: "declaree", writeBucket: "editorial.publish.write", args: { articleId: v.id("editorialArticles"), expectedRevision: v.number(), publishAt: v.number() }, returns: editorialArticleMutationValidator,
  handler: async (ctx, args) => {
    const { article, version, access } = await managedEditorialArticle(ctx, { networkId: ctx.networkId, personId: ctx.person._id }, args.articleId, ["publisher"])
    editorialExpectedRevision(args.expectedRevision, article.revision)
    if (!Number.isSafeInteger(args.publishAt) || args.publishAt <= Date.now() || args.publishAt > Date.now() + EDITORIAL_SCHEDULE_MAX_MS) return fail("invalidArgument", { field: "publishAt" })
    if (article.workingState !== "approved" || !await editorialApprovalLive(ctx, article, version)) return fail("conflict")
    await editorialVersionReady(ctx, article, version)
    const revision = article.revision + 1
    await ctx.db.patch(article._id, { revision, workingState: "scheduled", updatedAt: Date.now(), schedule: { generation: revision, publishAt: args.publishAt, publisherPersonId: ctx.person._id, authority: access.authority, versionId: version._id, digest: version.digest, mediaRevision: access.media!.revision } })
    await ctx.scheduler.runAt(args.publishAt, scheduledPublish, { networkId: ctx.networkId, articleId: article._id, generation: revision })
    await editorialEvent(ctx, { networkId: ctx.networkId, pageId: article.pageId, actorPersonId: ctx.person._id, articleId: article._id, versionId: version._id, action: "scheduled", revision, authority: access.authority })
    return result({ ...article, revision, workingState: "scheduled" }, true)
  },
})
export const cancelSchedule = networkMutation({
  minStatus: "declaree", writeBucket: "editorial.publish.write", args: { articleId: v.id("editorialArticles"), expectedRevision: v.number() }, returns: editorialArticleMutationValidator,
  handler: async (ctx, args) => {
    const { article, version, access } = await managedEditorialArticle(ctx, { networkId: ctx.networkId, personId: ctx.person._id }, args.articleId, ["publisher"])
    editorialExpectedRevision(args.expectedRevision, article.revision)
    if (!article.schedule) return result(article, false)
    const revision = article.revision + 1
    await ctx.db.patch(article._id, { ...editorialApprovalReset, revision, workingState: "in_review", updatedAt: Date.now() })
    await editorialEvent(ctx, { networkId: ctx.networkId, pageId: article.pageId, actorPersonId: ctx.person._id, articleId: article._id, versionId: version._id, action: "schedule_cancelled", revision, authority: access.authority })
    return result({ ...article, revision, workingState: "in_review" }, true)
  },
})
export const withdraw = networkMutation({
  minStatus: "declaree", writeBucket: "editorial.publish.write", args: { articleId: v.id("editorialArticles"), expectedRevision: v.number(), reason: v.string() }, returns: editorialArticleMutationValidator,
  handler: async (ctx, args) => {
    const { article, version, access } = await managedEditorialArticle(ctx, { networkId: ctx.networkId, personId: ctx.person._id }, args.articleId, ["publisher"])
    editorialExpectedRevision(args.expectedRevision, article.revision)
    const reason = editorialText(args.reason, 1000, true)
    if (!reason) return fail("invalidArgument", { field: "reason" })
    if (article.publicationState === "withdrawn") return result(article, false)
    if (article.publicationState !== "published") return fail("conflict")
    const revision = article.revision + 1
    await ctx.db.patch(article._id, { ...editorialApprovalReset, revision, workingState: "draft", publicationState: "withdrawn", withdrawnAt: Date.now(), withdrawnByPersonId: ctx.person._id, reviewNote: reason, updatedAt: Date.now() })
    await editorialEvent(ctx, { networkId: ctx.networkId, pageId: article.pageId, actorPersonId: ctx.person._id, articleId: article._id, versionId: version._id, action: "withdrawn", revision, authority: access.authority })
    return result({ ...article, revision, workingState: "draft", publicationState: "withdrawn" }, true)
  },
})
