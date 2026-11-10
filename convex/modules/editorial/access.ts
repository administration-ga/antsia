/** MP12 : les droits de rédaction se relisent sur le mandat de page et sa révision, jamais sur un rôle client. */
import { parseActivityConfiguration } from "@antsia/social-domain/activityConfiguration"
import { EDITORIAL_ROLES, type EditorialRole } from "@antsia/social-domain/editorial"
import type { Doc, Id } from "../../_generated/dataModel"
import type { QueryCtx } from "../../_generated/server"
import { memberHasStatus } from "../../lib/access"
import { notFound } from "../../lib/errors"
import { isFederatedPage } from "../federation/mirrorAccess"
import { canReadModeratedContent } from "../moderation/policy"
import { countLiveAdmins, liveSignatoryRole, signatoryRowOf } from "../pages/access"
import { isPublishedPerson } from "../people/miniProfile"
import type { EditorialAuthority, EditorialPermissions } from "./validators"

export type EditorialReadCtx = Pick<QueryCtx, "db">
export type EditorialAccess = { page: Doc<"pages">; media: Doc<"editorialMedia"> | null; role: EditorialRole | "page_admin"; authority: EditorialAuthority; roles: (EditorialRole | "page_admin")[] }
export async function editorialMediaOf(ctx: EditorialReadCtx, pageId: Id<"pages">) {
  return await ctx.db.query("editorialMedia").withIndex("by_page", q => q.eq("pageId", pageId)).unique()
}
export async function editorialPageOrNull(ctx: EditorialReadCtx, networkId: Id<"networks">, pageId: Id<"pages">, readerPersonId?: Id<"persons">) {
  const page = await ctx.db.get(pageId), network = await ctx.db.get(networkId)
  if (!network || network.status !== "active" || !page || page.networkId !== networkId || page.status !== "active" || await isFederatedPage(ctx, pageId) || !await canReadModeratedContent(ctx, "page", pageId, readerPersonId) || await countLiveAdmins(ctx, page) < 1) return null
  if (page.ownerKind !== "media") {
    // Même lookup que shops/access.shopOfPage ; local db-only pour ne pas importer public/access → posts/access.
    const shop = await ctx.db.query("shops").withIndex("by_page", q => q.eq("pageId", pageId)).unique()
    if (!shop || shop.networkId !== networkId || shop.storefront === "suspended" || !parseActivityConfiguration(shop.activityConfiguration)?.capabilities.includes("media")) return null
  }
  return page
}
/** Une preuve survit aux horloges identiques, jamais au remplacement ou au changement de rôle du mandant. */
async function rootAuthorityLive(ctx: EditorialReadCtx, page: Doc<"pages">, proof: EditorialAuthority): Promise<boolean> {
  const root = await ctx.db.get(proof.signatoryId)
  const person = root ? await ctx.db.get(root.personId) : null
  return !!root && !!person && isPublishedPerson(person) && await memberHasStatus(ctx, page.networkId, root.personId, "declaree") && await canReadModeratedContent(ctx, "person", root.personId) && root.pageId === page._id && root.networkId === page.networkId && root.acceptedAt !== undefined && root.role === "admin" && (root.authorityRevision ?? 0) === proof.authorityRevision && await liveSignatoryRole(ctx, page, root.personId) === "admin"
}
export async function editorialGrantLive(ctx: EditorialReadCtx, page: Doc<"pages">, row: Doc<"editorialGrants">, allowInvited = false): Promise<boolean> {
  if (row.pageId !== page._id || row.networkId !== page.networkId || row.state !== "accepted" && !(allowInvited && row.state === "invited") || !await rootAuthorityLive(ctx, page, row.authority)) return false
  const person = await ctx.db.get(row.personId)
  if (!person || !isPublishedPerson(person) || !await memberHasStatus(ctx, page.networkId, row.personId, "declaree") || !await canReadModeratedContent(ctx, "person", row.personId)) return false
  if (row.authority.grantId !== undefined) {
    const delegator = await ctx.db.get(row.authority.grantId)
    if (!delegator || delegator._id === row._id || delegator.authority.grantId !== undefined || delegator.personId !== row.invitedByPersonId || delegator.role !== "media_admin" || delegator.revision !== row.authority.grantRevision || !await editorialGrantLive(ctx, page, delegator)) return false
  }
  return true
}
export async function editorialAccessOrNull(ctx: EditorialReadCtx, caller: { networkId: Id<"networks">; personId: Id<"persons"> }, pageId: Id<"pages">, roles?: readonly EditorialRole[], allowUnconfigured = false): Promise<EditorialAccess | null> {
  const person = await ctx.db.get(caller.personId)
  if (!person || !isPublishedPerson(person) || !await memberHasStatus(ctx, caller.networkId, caller.personId, "declaree") || !await canReadModeratedContent(ctx, "person", caller.personId)) return null
  const page = await editorialPageOrNull(ctx, caller.networkId, pageId, caller.personId)
  if (!page) return null
  const media = await editorialMediaOf(ctx, pageId)
  if (!media && !allowUnconfigured) return null
  const signatory = await signatoryRowOf(ctx, pageId, caller.personId)
  if (signatory && await liveSignatoryRole(ctx, page, caller.personId) === "admin") return { page, media, role: "page_admin", roles: ["page_admin"], authority: { signatoryId: signatory._id, authorityRevision: signatory.authorityRevision ?? 0 } }
  const rows = await ctx.db.query("editorialGrants").withIndex("by_page_person_role", q => q.eq("pageId", pageId).eq("personId", caller.personId)).take(EDITORIAL_ROLES.length + 1)
  const live: Doc<"editorialGrants">[] = []
  for (const row of rows) if (await editorialGrantLive(ctx, page, row)) live.push(row)
  const selected = live.find(row => roles === undefined || roles.includes(row.role))
  if (!selected) return null
  return { page, media, role: selected.role, roles: live.map(row => row.role), authority: { signatoryId: selected.authority.signatoryId, authorityRevision: selected.authority.authorityRevision, grantId: selected._id, grantRevision: selected.revision } }
}
export async function requireEditorialRole(ctx: EditorialReadCtx, caller: { networkId: Id<"networks">; personId: Id<"persons"> }, pageId: Id<"pages">, roles?: readonly EditorialRole[]): Promise<EditorialAccess> {
  return await editorialAccessOrNull(ctx, caller, pageId, roles) ?? notFound()
}
export function editorialPermissions(access: EditorialAccess, article?: Doc<"editorialArticles">, personId?: Id<"persons">): EditorialPermissions {
  const admin = access.role === "page_admin", has = (role: EditorialRole) => admin || access.roles.includes(role)
  const edit = has("editor") || has("author") && (article === undefined || article.createdByPersonId === personId)
  const publish = has("publisher")
  return { canConfigure: has("media_admin"), canManageGrants: has("media_admin"), canGrantPublisher: admin, canCreate: has("author") || has("editor"), canEdit: edit, canSubmit: edit, canRequestChanges: has("editor") || publish, canApprove: publish, canPublish: publish, canSchedule: publish, canCancelSchedule: publish && article?.workingState === "scheduled" && article.schedule !== undefined, canWithdraw: publish }
}
export async function editorialAuthorityMatches(ctx: EditorialReadCtx, caller: { networkId: Id<"networks">; personId: Id<"persons"> }, pageId: Id<"pages">, proof: EditorialAuthority, roles: readonly EditorialRole[]): Promise<boolean> {
  const live = await editorialAccessOrNull(ctx, caller, pageId, roles)
  if (!live || !await rootAuthorityLive(ctx, live.page, proof)) return false
  if (proof.grantId === undefined) return live.role === "page_admin" && live.authority.signatoryId === proof.signatoryId && live.authority.authorityRevision === proof.authorityRevision
  const grant = await ctx.db.get(proof.grantId)
  return !!grant && grant.personId === caller.personId && roles.includes(grant.role) && grant.revision === proof.grantRevision && await editorialGrantLive(ctx, live.page, grant)
}
export function editorialAuthorityEqual(left: EditorialAuthority | undefined, right: EditorialAuthority): boolean { return left !== undefined && left.signatoryId === right.signatoryId && left.authorityRevision === right.authorityRevision && left.grantId === right.grantId && left.grantRevision === right.grantRevision }
