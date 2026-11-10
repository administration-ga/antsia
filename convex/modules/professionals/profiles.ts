/** MP09 : profil choisi, consentements versionnés et transitions sous révision attendue. */
import { PROFESSIONAL_PROFILE_CONSENT_VERSION, PROFESSIONAL_PUBLIC_CONSENT_VERSION } from "@antsia/social-domain/professionals"
import { buildSearchableText } from "@antsia/social-domain/searchText"
import { makeFunctionReference } from "convex/server"
import { v } from "convex/values"

import type { Doc, Id } from "../../_generated/dataModel"
import { internalMutation, type MutationCtx, type QueryCtx } from "../../_generated/server"
import { fail } from "../../lib/errors"
import { networkMutation, networkQuery } from "../../lib/functions"
import { syncContextualConversation } from "../contextualMessaging/hooks"
import { contentState, moderateContentWrite } from "../moderation/policy"
import { requireManagedPage } from "../pages/access"
import { isPublishedPerson } from "../people/miniProfile"
import { professionalProfileOf } from "./read"
import { expectedProfessionalRevision, PROFESSIONAL_BYTES_MAX, professionalContent, professionalModerationText, professionalWriteInput } from "./rules"
import { professionalEditorValidator, professionalProfileInputValidator, professionalProfileMutationValidator, professionalStateValidator, type ProfessionalEditor } from "./validators"

type SyncArgs = { networkId: Id<"networks">; personId: Id<"persons">; side: "from" | "to"; cursor: string | null }
const syncSlice = makeFunctionReference<"mutation", SyncArgs, null>("modules/professionals/profiles:syncConversationSlice")

/** Cache iCom rattrapé par lots ; les droits de délivrance relisent déjà chaque profil sans ce cache. */
export async function syncProfessionalProfileConversations(ctx: MutationCtx, subject: { networkId: Id<"networks">; personId: Id<"persons"> }): Promise<void> {
  await ctx.scheduler.runAfter(0, syncSlice, { ...subject, side: "from", cursor: null })
}
export const syncConversationSlice = internalMutation({
  args: { networkId: v.id("networks"), personId: v.id("persons"), side: v.union(v.literal("from"), v.literal("to")), cursor: v.union(v.string(), v.null()) }, returns: v.null(),
  handler: async (ctx, args) => {
    const query = args.side === "from"
      ? ctx.db.query("professionalCollaborations").withIndex("by_network_from_updatedAt", q => q.eq("networkId", args.networkId).eq("fromPersonId", args.personId))
      : ctx.db.query("professionalCollaborations").withIndex("by_network_to_updatedAt", q => q.eq("networkId", args.networkId).eq("toPersonId", args.personId))
    const window = await query.filter(q => q.eq(q.field("status"), "accepted")).paginate({ cursor: args.cursor, numItems: 8, maximumRowsRead: 64, maximumBytesRead: PROFESSIONAL_BYTES_MAX })
    for (const row of window.page) await syncContextualConversation(ctx, { kind: "professionalCollaboration", id: row._id })
    if (!window.isDone) await ctx.scheduler.runAfter(0, syncSlice, { ...args, cursor: window.continueCursor })
    else if (args.side === "from") await ctx.scheduler.runAfter(0, syncSlice, { ...args, side: "to", cursor: null })
    return null
  },
})

async function editorOf(ctx: Pick<QueryCtx, "db">, row: Doc<"professionalProfiles">): Promise<ProfessionalEditor> {
  return { profileId: row._id, revision: row.revision, state: row.state, ...professionalContent(row), activityPageIds: [...row.activityPageIds],
    consentTextVersion: row.consentTextVersion, consentedAt: row.consentedAt, publicConsentTextVersion: row.publicConsentTextVersion ?? null,
    publicConsentAt: row.publicConsentAt ?? null, publicConsentRevokedAt: row.publicConsentRevokedAt ?? null,
    moderationStatus: (await contentState(ctx, "professionalProfile", row._id))?.status ?? null }
}
export const myProfile = networkQuery({
  minStatus: "declaree", args: {}, returns: v.union(professionalEditorValidator, v.null()),
  handler: async ctx => {
    const row = await professionalProfileOf(ctx, ctx.networkId, ctx.person._id)
    return row ? await editorOf(ctx, row) : null
  },
})
export const saveProfile = networkMutation({
  minStatus: "declaree", writeBucket: "professional.profile.write",
  args: { expectedRevision: v.number(), input: professionalProfileInputValidator }, returns: professionalProfileMutationValidator,
  handler: async (ctx, args) => {
    if (!isPublishedPerson(ctx.person)) return fail("policyRefused")
    const previous = await professionalProfileOf(ctx, ctx.networkId, ctx.person._id)
    expectedProfessionalRevision(args.expectedRevision, previous?.revision ?? 0)
    const input = professionalWriteInput(args.input), now = Date.now()
    for (const pageId of input.activityPageIds) await requireManagedPage(ctx, { networkId: ctx.networkId, personId: ctx.person._id }, pageId, "admin")
    const data = { ...professionalContent(input), activityPageIds: [...input.activityPageIds] }
    const publicConsentValid = input.visibility !== "public" || previous?.publicConsentTextVersion === PROFESSIONAL_PUBLIC_CONSENT_VERSION && previous.publicConsentAt !== undefined && previous.publicConsentRevokedAt === undefined
    if (previous && previous.consentTextVersion === input.consentTextVersion && publicConsentValid && JSON.stringify({ ...professionalContent(previous), activityPageIds: previous.activityPageIds }) === JSON.stringify(data)) {
      return { profileId: previous._id, revision: previous.revision, state: previous.state, changed: false }
    }
    const consent = input.visibility === "public"
      ? { publicConsentTextVersion: PROFESSIONAL_PUBLIC_CONSENT_VERSION, publicConsentAt: now, publicConsentRevokedAt: undefined }
      : { publicConsentTextVersion: previous?.publicConsentTextVersion, publicConsentAt: previous?.publicConsentAt, publicConsentRevokedAt: previous?.publicConsentAt !== undefined ? previous.publicConsentRevokedAt ?? now : undefined }
    const revision = (previous?.revision ?? 0) + 1, state = previous?.state === "published" ? "draft" : previous?.state ?? "draft"
    const values = { ...data, ...consent, consentTextVersion: PROFESSIONAL_PROFILE_CONSENT_VERSION, consentedAt: previous?.consentTextVersion === PROFESSIONAL_PROFILE_CONSENT_VERSION ? previous.consentedAt : now,
      searchText: buildSearchableText(professionalModerationText(input)), revision, state, updatedAt: now, ...(previous?.state === "published" ? { publishedAt: undefined } : {}) }
    const profileId = previous ? previous._id : await ctx.db.insert("professionalProfiles", { networkId: ctx.networkId, personId: ctx.person._id, ...values, createdAt: now })
    if (previous) await ctx.db.patch(profileId, values)
    await moderateContentWrite(ctx, { networkId: ctx.networkId, ownerPersonId: ctx.person._id, kind: "professionalProfile", id: profileId, text: professionalModerationText(input) })
    if (previous) await syncProfessionalProfileConversations(ctx, { networkId: ctx.networkId, personId: ctx.person._id })
    return { profileId, revision, state, changed: true }
  },
})
export const setState = networkMutation({
  minStatus: "declaree", writeBucket: "professional.profile.write",
  args: { expectedRevision: v.number(), state: professionalStateValidator }, returns: professionalProfileMutationValidator,
  handler: async (ctx, args) => {
    const row = await professionalProfileOf(ctx, ctx.networkId, ctx.person._id)
    if (!row) return fail("notFound")
    expectedProfessionalRevision(args.expectedRevision, row.revision)
    if (row.state === args.state) return { profileId: row._id, revision: row.revision, state: row.state, changed: false }
    if (args.state === "published") {
      if (!isPublishedPerson(ctx.person) || row.consentTextVersion !== PROFESSIONAL_PROFILE_CONSENT_VERSION || !row.title) return fail("policyRefused")
      if (row.visibility === "public" && (row.publicConsentTextVersion !== PROFESSIONAL_PUBLIC_CONSENT_VERSION || row.publicConsentAt === undefined || row.publicConsentRevokedAt !== undefined)) return fail("policyRefused")
      for (const pageId of row.activityPageIds) await requireManagedPage(ctx, { networkId: ctx.networkId, personId: ctx.person._id }, pageId, "admin")
      await moderateContentWrite(ctx, { networkId: ctx.networkId, ownerPersonId: ctx.person._id, kind: "professionalProfile", id: row._id, text: professionalModerationText(row) })
    }
    const now = Date.now(), revision = row.revision + 1
    await ctx.db.patch(row._id, { state: args.state, revision, updatedAt: now,
      ...(args.state === "published" ? { publishedAt: now, pausedAt: undefined } : args.state === "paused" ? { pausedAt: now } : {}) })
    await syncProfessionalProfileConversations(ctx, { networkId: ctx.networkId, personId: ctx.person._id })
    return { profileId: row._id, revision, state: args.state, changed: true }
  },
})
