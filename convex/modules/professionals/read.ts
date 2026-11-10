/** MP09 : projections vivantes distinctes, annuaire paginé et champs publics choisis. */
import {
  parseProfessionalProfileInput, parseProfessionalSearchFilters, professionalProfileMatches,
  PROFESSIONAL_PROFILE_CONSENT_VERSION, PROFESSIONAL_PUBLIC_CONSENT_VERSION,
} from "@antsia/social-domain/professionals"
import type { OrderedQuery } from "convex/server"
import { paginationOptsValidator } from "convex/server"
import { v } from "convex/values"

import type { DataModel, Doc, Id } from "../../_generated/dataModel"
import type { QueryCtx } from "../../_generated/server"
import { isActiveMember } from "../../lib/access"
import { fail } from "../../lib/errors"
import { networkQuery } from "../../lib/functions"
import { isFederatedPage } from "../federation/mirrorAccess"
import { isBlockedBetween } from "../graph/graph"
import { canReadModeratedContent, contentState } from "../moderation/policy"
import { liveSignatoryRole, readablePageOrNull } from "../pages/access"
import { findPublishedPersonByHandle, isDiscoverablePerson, isPublishedPerson } from "../people/miniProfile"
import { publicPageEligible, type PublicContext } from "../public/access"
import { publicStorefrontPage, shopOfPage } from "../shops/access"
import { PROFESSIONAL_BYTES_MAX, PROFESSIONAL_ROWS_MAX, professionalContent, professionalCursorScope, professionalPageSize, readProfessionalCursor, writeProfessionalCursor } from "./rules"
import {
  managedProfessionalActivityValidator, professionalProfilePageValidator, professionalProfileValidator, professionalSearchFiltersValidator,
  type ProfessionalActivity, type ProfessionalProfile, type ProfessionalPublicProfile,
} from "./validators"

export type ProfessionalReadCtx = Pick<QueryCtx, "db">
export async function professionalProfileOf(ctx: ProfessionalReadCtx, networkId: Id<"networks">, personId: Id<"persons">) {
  return await ctx.db.query("professionalProfiles").withIndex("by_network_person", q => q.eq("networkId", networkId).eq("personId", personId)).unique()
}
export async function professionalPublishedModeration(ctx: ProfessionalReadCtx, kind: "professionalProfile" | "professionalCollaboration", id: string, readerPersonId?: Id<"persons">): Promise<boolean> {
  return (await contentState(ctx, kind, id))?.status === "published" && await canReadModeratedContent(ctx, kind, id, readerPersonId)
}
export async function readableProfessionalProfile(ctx: ProfessionalReadCtx, networkId: Id<"networks">, personId: Id<"persons">, readerPersonId?: Id<"persons">, options: { discoverable?: boolean } = {}) {
  const profile = await professionalProfileOf(ctx, networkId, personId), person = await ctx.db.get(personId)
  if (!profile || profile.state !== "published" || profile.consentTextVersion !== PROFESSIONAL_PROFILE_CONSENT_VERSION || !Number.isSafeInteger(profile.consentedAt) || profile.consentedAt > Date.now() ||
    !person || !isPublishedPerson(person) || !person.handle || !person.displayName || options.discoverable && !isDiscoverablePerson(person) || !await isActiveMember(ctx, networkId, personId)) return null
  if (!await professionalPublishedModeration(ctx, "professionalProfile", profile._id, readerPersonId) || !await canReadModeratedContent(ctx, "person", person._id, readerPersonId)) return null
  const personState = await contentState(ctx, "person", person._id)
  if (personState && personState.status !== "published" || readerPersonId && await isBlockedBetween(ctx, readerPersonId, personId)) return null
  const input = parseProfessionalProfileInput({ ...professionalContent(profile), activityPageIds: profile.activityPageIds, consentTextVersion: profile.consentTextVersion,
    ...(profile.visibility === "public" ? { publicConsentTextVersion: profile.publicConsentTextVersion } : {}) })
  return input ? { profile, person } : null
}
export async function readableProfessionalCollaboration(ctx: ProfessionalReadCtx, row: Doc<"professionalCollaborations">, readerPersonId: Id<"persons">) {
  if (readerPersonId !== row.fromPersonId && readerPersonId !== row.toPersonId) return null
  const [from, to] = await Promise.all([
    readableProfessionalProfile(ctx, row.networkId, row.fromPersonId, readerPersonId),
    readableProfessionalProfile(ctx, row.networkId, row.toPersonId, readerPersonId),
  ])
  const moderation = await contentState(ctx, "professionalCollaboration", row._id)
  const visible = moderation?.status === "published" || moderation?.status === "pending_review" && row.fromPersonId === readerPersonId && moderation.ownerPersonId === readerPersonId
  if (!from || !to || !visible || await isBlockedBetween(ctx, row.fromPersonId, row.toPersonId) || !await canReadModeratedContent(ctx, "professionalCollaboration", row._id, readerPersonId)) return null
  return { row, from, to, moderationStatus: moderation.status }
}

async function memberActivities(ctx: ProfessionalReadCtx, network: Doc<"networks">, profile: Doc<"professionalProfiles">, readerPersonId: Id<"persons">): Promise<ProfessionalActivity[]> {
  const result: ProfessionalActivity[] = []
  for (const pageId of profile.activityPageIds.slice(0, 6)) {
    const page = await readablePageOrNull(ctx, network, pageId, readerPersonId)
    if (!page || page.networkId !== profile.networkId || await liveSignatoryRole(ctx, page, profile.personId) !== "admin") continue
    result.push({ kind: "page", handle: page.handle, name: page.name })
  }
  return result
}
async function profileDto(ctx: ProfessionalReadCtx, network: Doc<"networks">, live: NonNullable<Awaited<ReturnType<typeof readableProfessionalProfile>>>, readerPersonId: Id<"persons">): Promise<ProfessionalProfile> {
  const { profile, person } = live
  const canPropose = person._id !== readerPersonId && profile.availability !== "unavailable" && profile.collaborationTypes.length > 0 && !!await readableProfessionalProfile(ctx, network._id, readerPersonId, readerPersonId)
  return { profileId: profile._id, revision: profile.revision, handle: person.handle!, displayName: person.displayName!, isMe: person._id === readerPersonId, canPropose,
    title: profile.title, bio: profile.bio, skills: [...profile.skills], languageCodes: [...profile.languageCodes], zone: profile.zone, availability: profile.availability,
    collaborationTypes: [...profile.collaborationTypes], portfolio: profile.portfolio.map(item => ({ ...item })), visibility: profile.visibility,
    activities: await memberActivities(ctx, network, profile, readerPersonId) }
}

export const getByHandle = networkQuery({
  minStatus: "declaree", args: { handle: v.string() }, returns: v.union(professionalProfileValidator, v.null()),
  handler: async (ctx, { handle }) => {
    const person = await findPublishedPersonByHandle(ctx, ctx.networkId, handle)
    const live = person ? await readableProfessionalProfile(ctx, ctx.networkId, person._id, ctx.person._id) : null
    return live ? await profileDto(ctx, ctx.network, live, ctx.person._id) : null
  },
})
export const search = networkQuery({
  minStatus: "declaree", args: { filters: professionalSearchFiltersValidator, paginationOpts: paginationOptsValidator }, returns: professionalProfilePageValidator,
  handler: async (ctx, args) => {
    const filters = parseProfessionalSearchFilters(args.filters)
    if (!filters) return fail("invalidArgument", { field: "filters" })
    const scope = await professionalCursorScope(["professional-search-v1", ctx.networkId, ctx.person._id, filters])
    const cursor = readProfessionalCursor(args.paginationOpts.cursor, scope)
    let query: OrderedQuery<DataModel["professionalProfiles"]> = filters.query
      ? ctx.db.query("professionalProfiles").withSearchIndex("search_profiles_v1", q => q.search("searchText", filters.query!).eq("networkId", ctx.networkId).eq("state", "published"))
      : ctx.db.query("professionalProfiles").withIndex("by_network_state_updatedAt", q => q.eq("networkId", ctx.networkId).eq("state", "published")).order("desc")
    query = query.filter(q => q.neq(q.field("visibility"), "unlisted"))
    if (filters.availability) query = query.filter(q => q.eq(q.field("availability"), filters.availability!))
    const window = await query.paginate({ cursor, numItems: professionalPageSize(args.paginationOpts.numItems), maximumRowsRead: PROFESSIONAL_ROWS_MAX, maximumBytesRead: PROFESSIONAL_BYTES_MAX })
    const page: ProfessionalProfile[] = []
    for (const candidate of window.page) {
      if (!professionalProfileMatches(candidate, filters)) continue
      const live = await readableProfessionalProfile(ctx, ctx.networkId, candidate.personId, ctx.person._id, { discoverable: true })
      if (live && live.profile.visibility !== "unlisted") page.push(await profileDto(ctx, ctx.network, live, ctx.person._id))
    }
    return { page, isDone: window.isDone, continueCursor: writeProfessionalCursor(window.continueCursor, scope, window.isDone), filteredWindow: page.length !== window.page.length || !window.isDone && window.page.length === 0 }
  },
})
export const managedActivities = networkQuery({
  minStatus: "declaree", args: { paginationOpts: paginationOptsValidator },
  returns: v.object({ page: v.array(managedProfessionalActivityValidator), isDone: v.boolean(), continueCursor: v.string(), filteredWindow: v.boolean() }),
  handler: async (ctx, args) => {
    const scope = await professionalCursorScope(["professional-activities-v1", ctx.networkId, ctx.person._id])
    const cursor = readProfessionalCursor(args.paginationOpts.cursor, scope)
    const window = await ctx.db.query("pageSignatories").withIndex("by_network_person", q => q.eq("networkId", ctx.networkId).eq("personId", ctx.person._id))
      .filter(q => q.and(q.eq(q.field("role"), "admin"), q.neq(q.field("acceptedAt"), undefined)))
      .paginate({ cursor, numItems: professionalPageSize(args.paginationOpts.numItems), maximumRowsRead: PROFESSIONAL_ROWS_MAX, maximumBytesRead: PROFESSIONAL_BYTES_MAX })
    const page: { pageId: Id<"pages">; handle: string; name: string }[] = []
    for (const row of window.page) {
      const activity = await ctx.db.get(row.pageId)
      if (!activity || activity.networkId !== ctx.networkId || await isFederatedPage(ctx, activity._id) || await liveSignatoryRole(ctx, activity, ctx.person._id) !== "admin") continue
      page.push({ pageId: activity._id, handle: activity.handle, name: activity.name })
    }
    return { page, isDone: window.isDone, continueCursor: writeProfessionalCursor(window.continueCursor, scope, window.isDone), filteredWindow: page.length !== window.page.length || !window.isDone && window.page.length === 0 }
  },
})

/** Projection appelée seulement après publicContext ; aucune réadoption d'identité anonyme. */
export async function readPublicProfile(ctx: ProfessionalReadCtx, context: { root: Doc<"networks">; readerPersonId?: Id<"persons"> }, handle: string): Promise<ProfessionalPublicProfile | null> {
  const { root, readerPersonId } = context
  if (root.kind !== "root" || root.status !== "active") return null
  const person = await findPublishedPersonByHandle(ctx, root._id, handle, { requireDiscoverable: true })
  const live = person ? await readableProfessionalProfile(ctx, root._id, person._id, readerPersonId, { discoverable: true }) : null
  if (!live || live.profile.visibility !== "public" || live.profile.publicConsentTextVersion !== PROFESSIONAL_PUBLIC_CONSENT_VERSION || live.profile.publicConsentAt === undefined ||
    live.profile.publicConsentAt > Date.now() || live.profile.publicConsentRevokedAt !== undefined) return null
  const profile = live.profile, fields = new Set(profile.publicFields)
  const result: ProfessionalPublicProfile = { handle: live.person.handle!, displayName: live.person.displayName! }
  if (fields.has("title")) result.title = profile.title
  if (fields.has("bio")) result.bio = profile.bio
  if (fields.has("skills")) result.skills = [...profile.skills]
  if (fields.has("languages")) result.languageCodes = [...profile.languageCodes]
  if (fields.has("zone")) result.zone = profile.zone
  if (fields.has("availability")) result.availability = profile.availability
  if (fields.has("portfolio")) result.portfolio = profile.portfolio.map(item => ({ ...item }))
  if (fields.has("activities")) {
    const activities: ProfessionalActivity[] = [], publicContext: PublicContext = { root, reader: readerPersonId ? { network: root, personId: readerPersonId } : null }
    for (const pageId of profile.activityPageIds.slice(0, 6)) {
      const page = await ctx.db.get(pageId)
      if (!page || page.networkId !== profile.networkId || await liveSignatoryRole(ctx, page, profile.personId) !== "admin") continue
      if (await publicPageEligible(ctx, publicContext, page)) { activities.push({ kind: "page", handle: page.handle, name: page.name }); continue }
      const shop = await shopOfPage(ctx, page._id)
      if (shop && await publicStorefrontPage(ctx, root, shop, readerPersonId)) activities.push({ kind: "shop", handle: page.handle, name: page.name })
    }
    result.activities = activities
  }
  return result
}
