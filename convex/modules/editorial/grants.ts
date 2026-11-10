/** MP12 : invitation nominative acceptée, révocation et chaîne courte vers un administrateur vivant. */
import { EDITORIAL_BYLINE_CONSENT_VERSION, EDITORIAL_GRANTS_MAX } from "@antsia/social-domain/editorial"
import { paginationOptsValidator } from "convex/server"
import { v } from "convex/values"
import type { Doc, Id } from "../../_generated/dataModel"
import type { QueryCtx } from "../../_generated/server"
import { isActiveMember } from "../../lib/access"
import { fail, notFound } from "../../lib/errors"
import { networkMutation, networkQuery } from "../../lib/functions"
import { findPublishedPersonByHandle } from "../people/miniProfile"
import { editorialAccessOrNull, editorialGrantLive, editorialPageOrNull, editorialPermissions, requireEditorialRole } from "./access"
import { editorialEvent, editorialExpectedRevision, editorialPageSize } from "./rules"
import { editorialGrantMutationValidator, editorialGrantValidator, editorialRoleValidator, type EditorialGrant } from "./validators"

async function grantDto(ctx: Pick<QueryCtx, "db">, row: Doc<"editorialGrants">, personId: Id<"persons">): Promise<EditorialGrant | null> {
  const page = await editorialPageOrNull(ctx, row.networkId, row.pageId, personId), person = await ctx.db.get(row.personId)
  if (!page || !person?.handle || !person.displayName) return null
  const access = await editorialAccessOrNull(ctx, { networkId: row.networkId, personId }, row.pageId)
  const manage = access && editorialPermissions(access).canManageGrants && (access.role === "page_admin" || row.role === "author" || row.role === "editor")
  const authorityLive = await editorialGrantLive(ctx, page, row, true)
  return { grantId: row._id, pageId: row.pageId, mediaHandle: page.handle, mediaName: page.name, handle: person.handle, displayName: person.displayName, role: row.role, state: row.state, revision: row.revision, invitedAt: row.invitedAt, acceptedAt: row.acceptedAt ?? null,
    bylineConsented: row.bylineConsentTextVersion === EDITORIAL_BYLINE_CONSENT_VERSION && row.bylineConsentedAt !== undefined && row.bylineConsentRevokedAt === undefined,
    isMe: row.personId === personId, canRespond: row.personId === personId && row.state === "invited" && authorityLive,
    canRevoke: row.state !== "revoked" && (!!manage || row.personId === personId), authorityLive }
}
export const list = networkQuery({
  minStatus: "declaree", args: { pageId: v.id("pages"), paginationOpts: paginationOptsValidator }, returns: v.object({ page: v.array(editorialGrantValidator), isDone: v.boolean(), continueCursor: v.string(), filteredWindow: v.boolean() }),
  handler: async (ctx, args) => {
    await requireEditorialRole(ctx, { networkId: ctx.networkId, personId: ctx.person._id }, args.pageId)
    const window = await ctx.db.query("editorialGrants").withIndex("by_page", q => q.eq("pageId", args.pageId)).order("desc").paginate({ ...args.paginationOpts, numItems: editorialPageSize(args.paginationOpts.numItems), maximumRowsRead: 48, maximumBytesRead: 128 * 1024 })
    const page: EditorialGrant[] = []
    for (const row of window.page) { const dto = await grantDto(ctx, row, ctx.person._id); if (dto) page.push(dto) }
    return { page, isDone: window.isDone, continueCursor: window.continueCursor, filteredWindow: page.length !== window.page.length || !window.isDone && !page.length }
  },
})
export const myInvitations = networkQuery({
  minStatus: "declaree", args: { paginationOpts: paginationOptsValidator }, returns: v.object({ page: v.array(editorialGrantValidator), isDone: v.boolean(), continueCursor: v.string(), filteredWindow: v.boolean() }),
  handler: async (ctx, args) => {
    const window = await ctx.db.query("editorialGrants").withIndex("by_network_person", q => q.eq("networkId", ctx.networkId).eq("personId", ctx.person._id)).order("desc").paginate({ ...args.paginationOpts, numItems: editorialPageSize(args.paginationOpts.numItems), maximumRowsRead: 48, maximumBytesRead: 128 * 1024 })
    const page: EditorialGrant[] = []
    for (const row of window.page) { const dto = await grantDto(ctx, row, ctx.person._id); if (dto) page.push(dto) }
    return { page, isDone: window.isDone, continueCursor: window.continueCursor, filteredWindow: page.length !== window.page.length || !window.isDone && !page.length }
  },
})
export const invite = networkMutation({
  minStatus: "declaree", writeBucket: "editorial.grant.write", args: { pageId: v.id("pages"), handle: v.string(), role: editorialRoleValidator, expectedRevision: v.number() }, returns: editorialGrantMutationValidator,
  handler: async (ctx, args) => {
    const access = await requireEditorialRole(ctx, { networkId: ctx.networkId, personId: ctx.person._id }, args.pageId, ["media_admin"])
    if (access.role !== "page_admin" && args.role !== "author" && args.role !== "editor") return notFound()
    const target = await findPublishedPersonByHandle(ctx, ctx.networkId, args.handle)
    if (!target || !await isActiveMember(ctx, ctx.networkId, target._id)) return notFound()
    const previous = await ctx.db.query("editorialGrants").withIndex("by_page_person_role", q => q.eq("pageId", args.pageId).eq("personId", target._id).eq("role", args.role)).unique()
    editorialExpectedRevision(args.expectedRevision, previous?.revision ?? 0)
    if (previous && (previous.state === "invited" || previous.state === "accepted") && await editorialGrantLive(ctx, access.page, previous, true)) return { grantId: previous._id, revision: previous.revision, state: previous.state, changed: false }
    if (!previous && (await ctx.db.query("editorialGrants").withIndex("by_page", q => q.eq("pageId", args.pageId)).take(EDITORIAL_GRANTS_MAX + 1)).length >= EDITORIAL_GRANTS_MAX) return fail("policyRefused")
    const now = Date.now(), revision = (previous?.revision ?? 0) + 1
    const values = { role: args.role, state: "invited" as const, revision, authority: access.authority, invitedByPersonId: ctx.person._id, invitedAt: now, acceptedAt: undefined, revokedAt: undefined, bylineConsentTextVersion: undefined, bylineConsentedAt: undefined, bylineConsentRevokedAt: undefined, updatedAt: now }
    const grantId = previous?._id ?? await ctx.db.insert("editorialGrants", { networkId: ctx.networkId, pageId: args.pageId, personId: target._id, ...values, createdAt: now })
    if (previous) await ctx.db.patch(previous._id, values)
    await editorialEvent(ctx, { networkId: ctx.networkId, pageId: args.pageId, actorPersonId: ctx.person._id, grantId, action: "invited", revision, authority: access.authority })
    return { grantId, revision, state: "invited" as const, changed: true }
  },
})
export const respond = networkMutation({
  minStatus: "declaree", writeBucket: "editorial.grant.write", args: { grantId: v.id("editorialGrants"), expectedRevision: v.number(), accept: v.boolean(), bylineConsentTextVersion: v.optional(v.string()) }, returns: editorialGrantMutationValidator,
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.grantId)
    if (!row || row.networkId !== ctx.networkId || row.personId !== ctx.person._id) return notFound()
    const page = await editorialPageOrNull(ctx, ctx.networkId, row.pageId, ctx.person._id)
    if (!page || !await editorialGrantLive(ctx, page, row, true)) return notFound()
    editorialExpectedRevision(args.expectedRevision, row.revision)
    if (row.state !== "invited") return fail("conflict")
    if (args.bylineConsentTextVersion !== undefined && (!args.accept || args.bylineConsentTextVersion !== EDITORIAL_BYLINE_CONSENT_VERSION)) return fail("invalidArgument")
    const now = Date.now(), revision = row.revision + 1, state = args.accept ? "accepted" as const : "declined" as const
    await ctx.db.patch(row._id, { state, revision, updatedAt: now, ...(args.accept ? { acceptedAt: now } : {}), ...(args.bylineConsentTextVersion ? { bylineConsentTextVersion: EDITORIAL_BYLINE_CONSENT_VERSION, bylineConsentedAt: now } : {}) })
    await editorialEvent(ctx, { networkId: ctx.networkId, pageId: row.pageId, actorPersonId: ctx.person._id, grantId: row._id, action: state, revision })
    return { grantId: row._id, revision, state, changed: true }
  },
})
export const revoke = networkMutation({
  minStatus: "declaree", writeBucket: "editorial.grant.write", args: { grantId: v.id("editorialGrants"), expectedRevision: v.number() }, returns: editorialGrantMutationValidator,
  handler: async (ctx, args) => {
    const row = await ctx.db.get(args.grantId)
    if (!row || row.networkId !== ctx.networkId) return notFound()
    const access = await editorialAccessOrNull(ctx, { networkId: ctx.networkId, personId: ctx.person._id }, row.pageId, ["media_admin"])
    if (row.personId !== ctx.person._id && (!access || access.role !== "page_admin" && row.role !== "author" && row.role !== "editor")) return notFound()
    editorialExpectedRevision(args.expectedRevision, row.revision)
    if (row.state === "revoked") return { grantId: row._id, revision: row.revision, state: row.state, changed: false }
    const now = Date.now(), revision = row.revision + 1
    await ctx.db.patch(row._id, { state: "revoked", revision, revokedAt: now, updatedAt: now, ...(row.bylineConsentedAt !== undefined ? { bylineConsentRevokedAt: now } : {}) })
    await editorialEvent(ctx, { networkId: ctx.networkId, pageId: row.pageId, actorPersonId: ctx.person._id, grantId: row._id, action: "revoked", revision, ...(access ? { authority: access.authority } : {}) })
    return { grantId: row._id, revision, state: "revoked" as const, changed: true }
  },
})
