/** MP12 : contrats fermés du bureau de rédaction et de ses projections de lecture. */
import { EDITORIAL_GRANT_STATES, EDITORIAL_PUBLICATION_STATES, EDITORIAL_ROLES, EDITORIAL_WORKING_STATES } from "@antsia/social-domain/editorial"
import { type Infer, v } from "convex/values"
import { literals } from "../../lib/validators"
import { withheldCodeValidator } from "../files/storageGuard"

export const editorialRoleValidator = literals(EDITORIAL_ROLES)
export const editorialGrantStateValidator = literals(EDITORIAL_GRANT_STATES)
export const editorialWorkingStateValidator = literals(EDITORIAL_WORKING_STATES)
export const editorialPublicationStateValidator = literals(EDITORIAL_PUBLICATION_STATES)
const nullableString = v.union(v.string(), v.null()), nullableNumber = v.union(v.number(), v.null())
export const editorialSectionValidator = v.object({ key: v.string(), label: v.string() })
export const editorialConfigInputValidator = v.object({ description: v.string(), sections: v.array(editorialSectionValidator), visibility: literals(["network", "public"] as const), publicConsentTextVersion: v.optional(v.string()) })
export const editorialBlockValidator = v.union(
  v.object({ type: v.literal("paragraph"), text: v.string() }),
  v.object({ type: v.literal("heading"), level: v.union(v.literal(2), v.literal(3)), text: v.string() }),
  v.object({ type: v.literal("list"), ordered: v.boolean(), items: v.array(v.string()) }),
  v.object({ type: v.literal("link"), label: v.string(), href: v.string() }),
  v.object({ type: v.literal("image"), assetId: v.id("editorialAssets") }),
)
export const editorialBylineValidator = v.union(v.object({ kind: v.literal("media") }), v.object({ kind: v.literal("contributor"), grantId: v.id("editorialGrants") }))
export const editorialContentFields = { title: v.string(), chapeau: v.string(), sectionKey: nullableString, byline: editorialBylineValidator, correctionNotice: nullableString, blocks: v.array(editorialBlockValidator) }
export const editorialDraftInputValidator = v.object(editorialContentFields)
export type EditorialDraftWriteInput = Infer<typeof editorialDraftInputValidator>
export const editorialAuthorityValidator = v.object({ signatoryId: v.id("pageSignatories"), authorityRevision: v.number(), grantId: v.optional(v.id("editorialGrants")), grantRevision: v.optional(v.number()) })
export type EditorialAuthority = Infer<typeof editorialAuthorityValidator>
export const editorialPermissionsValidator = v.object({ canConfigure: v.boolean(), canManageGrants: v.boolean(), canGrantPublisher: v.boolean(), canCreate: v.boolean(), canEdit: v.boolean(), canSubmit: v.boolean(), canRequestChanges: v.boolean(), canApprove: v.boolean(), canPublish: v.boolean(), canSchedule: v.boolean(), canCancelSchedule: v.boolean(), canWithdraw: v.boolean() })
export type EditorialPermissions = Infer<typeof editorialPermissionsValidator>
export const editorialMediaValidator = v.object({ mediaId: v.union(v.id("editorialMedia"), v.null()), pageId: v.id("pages"), handle: v.string(), name: v.string(), revision: v.number(), description: v.string(), sections: v.array(editorialSectionValidator), visibility: literals(["network", "public"] as const), publicConsentTextVersion: nullableString, publicConsentedAt: nullableNumber, permissions: editorialPermissionsValidator })
export type EditorialMedia = Infer<typeof editorialMediaValidator>
export const editorialConfigMutationValidator = v.object({ mediaId: v.id("editorialMedia"), revision: v.number(), changed: v.boolean() })
export const editorialGrantValidator = v.object({ grantId: v.id("editorialGrants"), pageId: v.id("pages"), mediaHandle: v.string(), mediaName: v.string(), handle: v.string(), displayName: v.string(), role: editorialRoleValidator, state: editorialGrantStateValidator, revision: v.number(), invitedAt: v.number(), acceptedAt: nullableNumber, bylineConsented: v.boolean(), isMe: v.boolean(), canRespond: v.boolean(), canRevoke: v.boolean(), authorityLive: v.boolean() })
export type EditorialGrant = Infer<typeof editorialGrantValidator>
export const editorialGrantMutationValidator = v.object({ grantId: v.id("editorialGrants"), revision: v.number(), state: editorialGrantStateValidator, changed: v.boolean() })
export const editorialVersionValidator = v.object({ versionId: v.id("editorialVersions"), versionNumber: v.number(), digest: v.string(), ...editorialContentFields, sectionLabel: nullableString, createdAt: v.number(), moderationStatus: v.union(literals(["published", "pending_review", "removed"] as const), v.null()) })
export type EditorialVersion = Infer<typeof editorialVersionValidator>
export const editorialEditorValidator = v.object({ articleId: v.id("editorialArticles"), pageId: v.id("pages"), articleKey: v.string(), revision: v.number(), workingState: editorialWorkingStateValidator, publicationState: editorialPublicationStateValidator, workingVersion: editorialVersionValidator, publishedVersion: v.union(editorialVersionValidator, v.null()), scheduledAt: nullableNumber, reviewNote: nullableString, permissions: editorialPermissionsValidator })
export type EditorialEditor = Infer<typeof editorialEditorValidator>
export const editorialArticleMutationValidator = v.object({ articleId: v.id("editorialArticles"), revision: v.number(), workingState: editorialWorkingStateValidator, publicationState: editorialPublicationStateValidator, changed: v.boolean() })
export const editorialArticleCardValidator = v.object({ articleId: v.id("editorialArticles"), articleKey: v.string(), revision: v.number(), title: v.string(), chapeau: v.string(), sectionKey: nullableString, workingState: editorialWorkingStateValidator, publicationState: editorialPublicationStateValidator, updatedAt: v.number(), publishedAt: nullableNumber })
export const editorialPublishedBlockValidator = v.union(
  v.object({ type: v.literal("paragraph"), text: v.string() }), v.object({ type: v.literal("heading"), level: v.union(v.literal(2), v.literal(3)), text: v.string() }),
  v.object({ type: v.literal("list"), ordered: v.boolean(), items: v.array(v.string()) }), v.object({ type: v.literal("link"), label: v.string(), href: v.string() }),
  v.object({ type: v.literal("image"), url: nullableString, withheld: v.union(withheldCodeValidator, v.null()), altText: v.string(), credit: v.string() }),
)
export const editorialPublishedArticleValidator = v.object({ articleKey: v.string(), mediaHandle: v.string(), mediaName: v.string(), title: v.string(), chapeau: v.string(), sectionKey: nullableString, sectionLabel: nullableString, byline: v.object({ label: v.string(), handle: nullableString }), correctionNotice: nullableString, blocks: v.array(editorialPublishedBlockValidator), versionNumber: v.number(), publishedAt: v.number(), updatedAt: v.number() })
export type EditorialPublishedArticle = Infer<typeof editorialPublishedArticleValidator>
export const editorialPublishedCardValidator = v.object({ articleKey: v.string(), title: v.string(), chapeau: v.string(), sectionKey: nullableString, sectionLabel: nullableString, publishedAt: v.number(), versionNumber: v.number(), correctionNotice: nullableString })
export type EditorialPublishedCard = Infer<typeof editorialPublishedCardValidator>
export const editorialPublishedMediaValidator = v.object({ handle: v.string(), name: v.string(), description: v.string(), sections: v.array(editorialSectionValidator), articles: v.object({ page: v.array(editorialPublishedCardValidator), isDone: v.boolean(), continueCursor: v.string(), filteredWindow: v.boolean() }) })
export type EditorialPublishedMedia = Infer<typeof editorialPublishedMediaValidator>
