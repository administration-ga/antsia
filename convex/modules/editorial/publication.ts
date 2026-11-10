/** MP12 : admission de publication commune au geste et au job ; aucun droit figé ne vaut droit courant. */
import { EDITORIAL_BYLINE_CONSENT_VERSION, EDITORIAL_PUBLIC_CONSENT_VERSION, parseEditorialDraftInput } from "@antsia/social-domain/editorial"
import type { Doc, Id } from "../../_generated/dataModel"
import type { MutationCtx, QueryCtx } from "../../_generated/server"
import { fail } from "../../lib/errors"
import { canReadModeratedContent, contentState } from "../moderation/policy"
import { editorialAccessOrNull, editorialAuthorityMatches, editorialGrantLive, editorialMediaOf, editorialPageOrNull } from "./access"
import { assertEditorialAssetsForPublication } from "./assets"
import { editorialApprovalReset, editorialEvent } from "./rules"

export async function editorialPublicConsentLive(ctx: Pick<QueryCtx, "db">, media: Doc<"editorialMedia">): Promise<boolean> {
  return media.visibility === "public" && media.publicConsentTextVersion === EDITORIAL_PUBLIC_CONSENT_VERSION && media.publicConsentedAt !== undefined && media.publicConsentedAt <= Date.now() && media.publicConsentRevokedAt === undefined && media.publicConsentByPersonId !== undefined && media.publicConsentAuthority !== undefined &&
    await editorialAuthorityMatches(ctx, { networkId: media.networkId, personId: media.publicConsentByPersonId }, media.pageId, media.publicConsentAuthority, ["media_admin"])
}
export async function editorialVersionReady(ctx: Pick<QueryCtx, "db">, article: Doc<"editorialArticles">, version: Doc<"editorialVersions">): Promise<void> {
  const page = await editorialPageOrNull(ctx, article.networkId, article.pageId)
  const media = await editorialMediaOf(ctx, article.pageId)
  if (!page || !media || version.articleId !== article._id || version.pageId !== article.pageId || version.networkId !== article.networkId || !parseEditorialDraftInput({ title: version.title, chapeau: version.chapeau, sectionKey: version.sectionKey, byline: version.byline, correctionNotice: version.correctionNotice, blocks: version.blocks })) return fail("policyRefused")
  if ((await contentState(ctx, "editorialMedia", media._id))?.status !== "published" || !await canReadModeratedContent(ctx, "editorialMedia", media._id)) return fail("policyRefused")
  if (version.sectionKey !== null && !media.sections.some(section => section.key === version.sectionKey)) return fail("policyRefused")
  if (media.visibility === "public" && !await editorialPublicConsentLive(ctx, media)) return fail("policyRefused")
  if ((await contentState(ctx, "editorialVersion", version._id))?.status !== "published" || !await canReadModeratedContent(ctx, "editorialVersion", version._id)) return fail("policyRefused")
  if (version.byline.kind === "contributor") {
    const grant = await ctx.db.get(version.byline.grantId)
    if (!grant || !await editorialGrantLive(ctx, page, grant) || grant.bylineConsentTextVersion !== EDITORIAL_BYLINE_CONSENT_VERSION || grant.bylineConsentedAt === undefined || grant.bylineConsentRevokedAt !== undefined) return fail("policyRefused")
  }
  if (article.publishedVersionId !== undefined && article.publishedVersionId !== version._id && !version.correctionNotice) return fail("invalidArgument", { field: "correctionNotice" })
  await assertEditorialAssetsForPublication(ctx, { networkId: article.networkId, pageId: article.pageId, assetIds: version.blocks.flatMap(block => block.type === "image" ? [block.assetId] : []) })
}
export async function editorialApprovalLive(ctx: Pick<QueryCtx, "db">, article: Doc<"editorialArticles">, version: Doc<"editorialVersions">): Promise<boolean> {
  return article.approvedVersionId === version._id && article.approvedDigest === version.digest && article.approvedByPersonId !== undefined && article.approvedAuthority !== undefined && await editorialAuthorityMatches(ctx, { networkId: article.networkId, personId: article.approvedByPersonId }, article.pageId, article.approvedAuthority, ["publisher"])
}
export async function publishEditorialVersion(ctx: MutationCtx, article: Doc<"editorialArticles">, version: Doc<"editorialVersions">, actorPersonId: Id<"persons">): Promise<number> {
  const publisher = await editorialAccessOrNull(ctx, { networkId: article.networkId, personId: actorPersonId }, article.pageId, ["publisher"])
  if (!publisher) return fail("policyRefused")
  await editorialVersionReady(ctx, article, version)
  if (!await editorialApprovalLive(ctx, article, version)) return fail("policyRefused")
  const now = Date.now(), revision = article.revision + 1
  await ctx.db.patch(article._id, { revision, publicationState: "published", publishedVersionId: version._id, publishedSectionKey: version.sectionKey ?? undefined, firstPublishedAt: article.firstPublishedAt ?? article.publishedAt ?? now, publishedAt: now, updatedAt: now, withdrawnAt: undefined, withdrawnByPersonId: undefined, workingState: "approved", schedule: undefined })
  await editorialEvent(ctx, { networkId: article.networkId, pageId: article.pageId, articleId: article._id, versionId: version._id, actorPersonId, action: "published", revision, authority: publisher.authority })
  return revision
}
export async function refuseEditorialSchedule(ctx: MutationCtx, article: Doc<"editorialArticles">, actorPersonId: Id<"persons">): Promise<void> {
  const revision = article.revision + 1
  await ctx.db.patch(article._id, { ...editorialApprovalReset, revision, workingState: "in_review", updatedAt: Date.now() })
  await editorialEvent(ctx, { networkId: article.networkId, pageId: article.pageId, articleId: article._id, actorPersonId, action: "schedule_refused", revision, ...(article.workingVersionId ? { versionId: article.workingVersionId } : {}) })
}
