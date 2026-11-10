/** MP09 : contrats fermés des profils, projections et gestes professionnels. */
import {
  PROFESSIONAL_AVAILABILITIES, PROFESSIONAL_COLLABORATION_STATUSES, PROFESSIONAL_COLLABORATION_TYPES,
  PROFESSIONAL_PROFILE_STATES, PROFESSIONAL_PUBLIC_FIELDS, PROFESSIONAL_VISIBILITIES,
} from "@antsia/social-domain/professionals"
import { type Infer, v } from "convex/values"

import { literals } from "../../lib/validators"

export const professionalStateValidator = literals(PROFESSIONAL_PROFILE_STATES)
export const professionalVisibilityValidator = literals(PROFESSIONAL_VISIBILITIES)
export const professionalCollaborationTypeValidator = literals(PROFESSIONAL_COLLABORATION_TYPES)
export const professionalCollaborationStatusValidator = literals(PROFESSIONAL_COLLABORATION_STATUSES)
export const professionalPortfolioValidator = v.array(v.object({ title: v.string(), description: v.string() }))
export const professionalPresentationFields = {
  title: v.string(), bio: v.string(), skills: v.array(v.string()), languageCodes: v.array(v.string()), zone: v.string(),
  availability: literals(PROFESSIONAL_AVAILABILITIES), collaborationTypes: v.array(professionalCollaborationTypeValidator), portfolio: professionalPortfolioValidator,
}
export const professionalEditableFields = {
  ...professionalPresentationFields, activityPageIds: v.array(v.id("pages")), visibility: professionalVisibilityValidator,
  publicFields: v.array(literals(PROFESSIONAL_PUBLIC_FIELDS)),
}
export const professionalProfileInputValidator = v.object({
  ...professionalEditableFields, consentTextVersion: v.string(), publicConsentTextVersion: v.optional(v.string()),
})
export type ProfessionalProfileWriteInput = Infer<typeof professionalProfileInputValidator>
const nullableNumber = v.union(v.number(), v.null())
const nullableString = v.union(v.string(), v.null())
export const professionalEditorValidator = v.object({
  profileId: v.id("professionalProfiles"), revision: v.number(), state: professionalStateValidator, ...professionalEditableFields,
  consentTextVersion: v.string(), consentedAt: v.number(), publicConsentTextVersion: nullableString, publicConsentAt: nullableNumber, publicConsentRevokedAt: nullableNumber,
  moderationStatus: v.union(literals(["published", "pending_review", "removed"] as const), v.null()),
})
export type ProfessionalEditor = Infer<typeof professionalEditorValidator>
export const professionalProfileMutationValidator = v.object({ profileId: v.id("professionalProfiles"), revision: v.number(), state: professionalStateValidator, changed: v.boolean() })
export const professionalActivityValidator = v.object({ kind: v.union(v.literal("page"), v.literal("shop")), handle: v.string(), name: v.string() })
export type ProfessionalActivity = Infer<typeof professionalActivityValidator>
export const managedProfessionalActivityValidator = v.object({ pageId: v.id("pages"), handle: v.string(), name: v.string() })
export const professionalProfileValidator = v.object({
  profileId: v.id("professionalProfiles"), revision: v.number(), handle: v.string(), displayName: v.string(), isMe: v.boolean(),
  canPropose: v.boolean(), visibility: professionalVisibilityValidator, ...professionalPresentationFields, activities: v.array(professionalActivityValidator),
})
export type ProfessionalProfile = Infer<typeof professionalProfileValidator>
export const professionalPublicProfileValidator = v.object({
  handle: v.string(), displayName: v.string(), title: v.optional(v.string()), bio: v.optional(v.string()),
  skills: v.optional(v.array(v.string())), languageCodes: v.optional(v.array(v.string())), zone: v.optional(v.string()),
  availability: v.optional(literals(PROFESSIONAL_AVAILABILITIES)), portfolio: v.optional(professionalPortfolioValidator), activities: v.optional(v.array(professionalActivityValidator)),
})
export type ProfessionalPublicProfile = Infer<typeof professionalPublicProfileValidator>
export const professionalSearchFiltersValidator = v.object({
  query: v.optional(v.string()), skills: v.optional(v.array(v.string())), languageCodes: v.optional(v.array(v.string())), zone: v.optional(v.string()),
  availability: v.optional(literals(PROFESSIONAL_AVAILABILITIES)), collaborationTypes: v.optional(v.array(professionalCollaborationTypeValidator)),
})
export const professionalProfilePageValidator = v.object({ page: v.array(professionalProfileValidator), isDone: v.boolean(), continueCursor: v.string(), filteredWindow: v.boolean() })
export const professionalSourceValidator = v.object({ kind: v.literal("professionalCollaboration"), id: v.id("professionalCollaborations") })
export const professionalCollaborationMutationValidator = v.object({ collaborationId: v.id("professionalCollaborations"), revision: v.number(), status: professionalCollaborationStatusValidator, changed: v.boolean() })
const partyValidator = v.object({ handle: v.string(), displayName: v.string() })
export const professionalCollaborationValidator = v.object({
  collaborationId: v.id("professionalCollaborations"), revision: v.number(), status: professionalCollaborationStatusValidator,
  collaborationType: professionalCollaborationTypeValidator, message: v.string(), direction: v.union(v.literal("sent"), v.literal("received")),
  from: partyValidator, to: partyValidator, proposedAt: v.number(), respondedAt: nullableNumber, cancelledAt: nullableNumber, updatedAt: v.number(),
  canRespond: v.boolean(), canCancel: v.boolean(), moderationStatus: v.union(v.literal("published"), v.literal("pending_review")),
  acceptedSource: v.union(professionalSourceValidator, v.null()),
})
export type ProfessionalCollaboration = Infer<typeof professionalCollaborationValidator>
export const professionalCollaborationPageValidator = v.object({ page: v.array(professionalCollaborationValidator), isDone: v.boolean(), continueCursor: v.string(), filteredWindow: v.boolean() })
