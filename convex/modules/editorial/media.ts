/** MP12 : capacité média choisie, configuration CAS et consentement public distinct. */
import { EDITORIAL_PUBLIC_CONSENT_VERSION, parseEditorialConfigInput } from "@antsia/social-domain/editorial"
import { paginationOptsValidator } from "convex/server"
import { v } from "convex/values"
import type { MutationCtx, QueryCtx } from "../../_generated/server"
import type { Id } from "../../_generated/dataModel"
import { fail, notFound } from "../../lib/errors"
import { networkMutation, networkQuery } from "../../lib/functions"
import { moderateOwnedContentWrite } from "../moderation/policy"
import { editorialAccessOrNull, editorialAuthorityEqual, editorialPermissions } from "./access"
import { editorialEvent, editorialExpectedRevision, editorialMediaModerationText, editorialPageSize } from "./rules"
import { editorialConfigInputValidator, editorialConfigMutationValidator, editorialMediaValidator, type EditorialMedia } from "./validators"

export async function editorialMediaEditor(ctx: Pick<QueryCtx, "db">, caller: { networkId: Id<"networks">; personId: Id<"persons"> }, pageId: Id<"pages">): Promise<EditorialMedia | null> {
  const access = await editorialAccessOrNull(ctx, caller, pageId, undefined, true)
  if (!access) return null
  const row = access.media
  return { mediaId: row?._id ?? null, pageId, handle: access.page.handle, name: access.page.name, revision: row?.revision ?? 0, description: row?.description ?? "", sections: row?.sections ?? [], visibility: row?.visibility ?? "network", publicConsentTextVersion: row?.publicConsentTextVersion ?? null, publicConsentedAt: row?.publicConsentedAt ?? null, permissions: editorialPermissions(access) }
}
export const myMedia = networkQuery({ minStatus: "declaree", args: { pageId: v.id("pages") }, returns: v.union(editorialMediaValidator, v.null()), handler: async (ctx, args) => editorialMediaEditor(ctx, { networkId: ctx.networkId, personId: ctx.person._id }, args.pageId) })
export const myManagedMedia = networkQuery({
  minStatus: "declaree", args: { paginationOpts: paginationOptsValidator }, returns: v.object({ page: v.array(editorialMediaValidator), isDone: v.boolean(), continueCursor: v.string(), filteredWindow: v.boolean() }),
  handler: async (ctx, args) => {
    // Deux sources de mandat, conservées dans le curseur plutôt qu'un dernier N trompeusement exhaustif.
    let stage: "pages" | "grants" = "pages", cursor: string | null = null
    const scope = `${ctx.networkId}:${ctx.person._id}`
    if (args.paginationOpts.cursor) {
      try { const parsed: unknown = JSON.parse(args.paginationOpts.cursor); if (!parsed || typeof parsed !== "object" || !("scope" in parsed) || parsed.scope !== scope || !("stage" in parsed) || parsed.stage !== "pages" && parsed.stage !== "grants" || !("cursor" in parsed) || typeof parsed.cursor !== "string") return fail("invalidArgument"); stage = parsed.stage; cursor = parsed.cursor || null } catch { return fail("invalidArgument") }
    }
    const count = editorialPageSize(args.paginationOpts.numItems)
    const window = stage === "pages"
      ? await ctx.db.query("pageSignatories").withIndex("by_network_person", q => q.eq("networkId", ctx.networkId).eq("personId", ctx.person._id)).filter(q => q.eq(q.field("role"), "admin")).paginate({ cursor, numItems: count, maximumRowsRead: 48, maximumBytesRead: 128 * 1024 })
      : await ctx.db.query("editorialGrants").withIndex("by_network_person", q => q.eq("networkId", ctx.networkId).eq("personId", ctx.person._id)).filter(q => q.eq(q.field("state"), "accepted")).paginate({ cursor, numItems: count, maximumRowsRead: 48, maximumBytesRead: 128 * 1024 })
    const page: EditorialMedia[] = [], seen = new Set<string>()
    for (const row of window.page) {
      if (seen.has(row.pageId)) continue
      const access = await editorialAccessOrNull(ctx, { networkId: ctx.networkId, personId: ctx.person._id }, row.pageId, undefined, true)
      // Les administrateurs ont déjà été émis par la première source.
      if (!access || stage === "grants" && (access.role === "page_admin" || "state" in row && row.role !== access.role)) continue
      seen.add(row.pageId)
      const dto = await editorialMediaEditor(ctx, { networkId: ctx.networkId, personId: ctx.person._id }, row.pageId)
      if (dto) page.push(dto)
    }
    const isDone = stage === "grants" && window.isDone
    const continueCursor = isDone ? "" : JSON.stringify({ scope, stage: stage === "pages" && window.isDone ? "grants" : stage, cursor: window.isDone ? "" : window.continueCursor })
    return { page, isDone, continueCursor, filteredWindow: page.length !== window.page.length || !isDone && !page.length }
  },
})
async function save(ctx: MutationCtx, caller: { networkId: Id<"networks">; personId: Id<"persons"> }, args: { pageId: Id<"pages">; expectedRevision: number; input: { description: string; sections: { key: string; label: string }[]; visibility: "network" | "public"; publicConsentTextVersion?: string } }) {
  const access = await editorialAccessOrNull(ctx, caller, args.pageId, ["media_admin"], true)
  if (!access || !editorialPermissions(access).canConfigure) return notFound()
  const input = parseEditorialConfigInput(args.input)
  if (!input) return fail("invalidArgument", { field: "input" })
  const previous = access.media
  editorialExpectedRevision(args.expectedRevision, previous?.revision ?? 0)
  const same = previous && previous.description === input.description && previous.visibility === input.visibility && JSON.stringify(previous.sections.map(({ key, label }) => ({ key, label }))) === JSON.stringify(input.sections)
  const consentLive = input.visibility !== "public" || previous?.publicConsentTextVersion === EDITORIAL_PUBLIC_CONSENT_VERSION && previous.publicConsentRevokedAt === undefined && previous.publicConsentByPersonId === caller.personId && editorialAuthorityEqual(previous.publicConsentAuthority, access.authority)
  if (same && consentLive) return { mediaId: previous._id, revision: previous.revision, changed: false }
  const now = Date.now(), revision = (previous?.revision ?? 0) + 1
  const values = { description: input.description, sections: input.sections, visibility: input.visibility, revision, updatedAt: now,
    ...(input.visibility === "public" ? { publicConsentTextVersion: EDITORIAL_PUBLIC_CONSENT_VERSION, publicConsentedAt: now, publicConsentByPersonId: caller.personId, publicConsentAuthority: access.authority, publicConsentRevokedAt: undefined } : { publicConsentRevokedAt: previous?.publicConsentedAt === undefined ? undefined : now }) }
  const mediaId = previous?._id ?? await ctx.db.insert("editorialMedia", { networkId: caller.networkId, pageId: args.pageId, ...values, createdByPersonId: caller.personId, createdAt: now })
  if (previous) await ctx.db.patch(previous._id, values)
  await moderateOwnedContentWrite(ctx, { networkId: caller.networkId, owner: { pageId: args.pageId }, kind: "editorialMedia", id: mediaId, text: editorialMediaModerationText(input) })
  await editorialEvent(ctx, { networkId: caller.networkId, actorPersonId: caller.personId, pageId: args.pageId, action: "configured", revision, authority: access.authority })
  return { mediaId, revision, changed: true }
}
export const saveConfig = networkMutation({ minStatus: "declaree", writeBucket: "editorial.config.write", args: { pageId: v.id("pages"), expectedRevision: v.number(), input: editorialConfigInputValidator }, returns: editorialConfigMutationValidator, handler: async (ctx, args) => save(ctx, { networkId: ctx.networkId, personId: ctx.person._id }, args) })
export const bootstrap = networkMutation({ minStatus: "declaree", writeBucket: "editorial.config.write", args: { pageId: v.id("pages"), expectedRevision: v.number(), input: editorialConfigInputValidator }, returns: editorialConfigMutationValidator, handler: async (ctx, args) => { if (args.expectedRevision !== 0) return fail("invalidArgument"); return save(ctx, { networkId: ctx.networkId, personId: ctx.person._id }, args) } })
