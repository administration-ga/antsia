/**
 * DG-010 : un groupe thématique privé par page d'association native.
 * La création et l'adhésion sont volontaires : aucun adhérent n'est importé.
 * L'index existant est lu avant insertion, indépendamment de l'auteur ou de
 * sa clé, pour que deux administrateurs concurrents créent le même groupe.
 *
 * AS-03 : la fermeture se rattrape. Le responsable du groupe (administrateur vivant
 * de la page, adhésion acceptée s'il en a une) le rouvre en citant la fermeture qu'il
 * a lue (`closedAt`) ; le geste s'inscrit au journal du moteur.
 */
import { assertThematicGroupName, THEMATIC_GROUP_NAME_MAX_LENGTH, THEMATIC_GROUP_NAME_MIN_LENGTH } from "@antsia/social-domain/thematicGroups"
import { buildSearchableText } from "@antsia/social-domain/searchText"
import { paginationOptsValidator } from "convex/server"
import { v } from "convex/values"

import type { Doc, Id } from "../../_generated/dataModel"
import type { MutationCtx, QueryCtx } from "../../_generated/server"
import { effectiveMembershipStatus } from "../../lib/access"
import { checked, fail, failAppRule, notFound } from "../../lib/errors"
import { networkMutation, networkQuery } from "../../lib/functions"
import { liveSignatoryRole } from "../pages/access"
import { appendAudit } from "../platform/audit"
import { contentState } from "../moderation/policy"
import { livePersonProfile } from "../people/miniProfile"
import { canSeePostDoc } from "../posts/access"
import { recordGroupMember } from "../posts/counters"
import { hasNativePostAuthor } from "../posts/nativeAuthor"
import { associationGroupPageOrNull, associationGroupRoleOrNull, isActiveThematicGroup, isThematicGroupRemovedByModeration, liveThematicGroupMembership, requireLiveThematicGroupMembership } from "../thematicGroups/access"
import { assertDiasporaNetwork } from "./facts"

const associationGroupValidator = v.object({
  groupId: v.id("thematicGroups"),
  pageId: v.id("pages"),
  name: v.string(),
  state: v.union(v.literal("active"), v.literal("closed")),
  /**
   * AS-03 : la fermeture en vigueur, que cite la réouverture — servie au seul responsable qui
   * peut rouvrir (`canReopen`) ; `null` pour tout autre lecteur et pour un groupe actif.
   */
  closedAt: v.union(v.number(), v.null()),
  /** AS-03 : la réouverture serait admise pour ce lecteur (mêmes gardes que la mutation). */
  canReopen: v.boolean(),
  role: v.union(v.literal("owner"), v.literal("moderator"), v.literal("member"), v.null()),
  isMember: v.boolean(),
  canJoin: v.boolean(),
  canManage: v.boolean(),
  canPublish: v.boolean(),
})

const associationGroupPostValidator = v.object({
  postId: v.id("posts"), body: v.string(), author: v.object({ displayName: v.union(v.string(), v.null()) }), createdAt: v.number(),
  isMine: v.boolean(), canRemove: v.boolean(), moderation: v.union(v.literal("published"), v.literal("pending_review"), v.literal("removed")),
})

/** Au plus deux lignes suffisent pour détecter aussi un ancien doublon et refuser sans choisir arbitrairement. */
async function groupOfPage(ctx: Pick<QueryCtx, "db">, networkId: Id<"networks">, pageId: Id<"pages">) {
  const rows = await ctx.db.query("thematicGroups")
    .withIndex("by_network_associationPage_createdAt", (q) => q.eq("networkId", networkId).eq("associationPageId", pageId)).take(2)
  if (rows.length > 1) return failAppRule("association_group_exists")
  return rows[0] ?? null
}

type CreateScope = MutationCtx & { networkId: Id<"networks">; person: Doc<"persons"> }

/** Porte commune à l'API DIASPORA.GA et au create générique ; le constructeur a déjà admis le débit. */
export async function createAssociationGroupForPage(ctx: CreateScope, pageId: Id<"pages">, idempotencyKey: string): Promise<{ groupId: Id<"thematicGroups">; created: boolean }> {
  const page = await associationGroupPageOrNull(ctx, ctx.networkId, pageId, ctx.person._id)
  if (!page || (await liveSignatoryRole(ctx, page, ctx.person._id)) !== "admin") return notFound()
  const scope = { networkId: ctx.networkId, associationPageId: page._id }
  if ((await associationGroupRoleOrNull(ctx, scope, ctx.person._id)) !== "owner") return notFound()
  // Cette plage est commune aux clés ET aux administrateurs : l'unicité est transactionnelle.
  const existing = await groupOfPage(ctx, ctx.networkId, page._id)
  if (existing) return { groupId: existing._id, created: false }
  if (idempotencyKey.trim().length === 0 || idempotencyKey.length > 200) return fail("invalidArgument", { field: "idempotencyKey" })
  const replay = await ctx.db.query("thematicGroups")
    .withIndex("by_creator_and_idempotencyKey", (q) => q.eq("createdByPersonId", ctx.person._id).eq("idempotencyKey", idempotencyKey)).unique()
  if (replay) return fail("conflict")
  const pageName = page.name.trim()
  const label = pageName.length < THEMATIC_GROUP_NAME_MIN_LENGTH ? page.handle : pageName
  let boundedName = ""
  for (const character of label) {
    if (boundedName.length + character.length > THEMATIC_GROUP_NAME_MAX_LENGTH) break
    boundedName += character
  }
  const name = checked(() => assertThematicGroupName(boundedName))
  const now = Date.now()
  const groupId = await ctx.db.insert("thematicGroups", {
    networkId: ctx.networkId, associationPageId: page._id, name, searchText: buildSearchableText(name),
    createdByPersonId: ctx.person._id, idempotencyKey, createdAt: now, updatedAt: now,
  })
  // Le geste explicite de création vaut adhésion du créateur SEUL ; son autorité n'est jamais stockée.
  const membershipId = await ctx.db.insert("thematicGroupMembers", { networkId: ctx.networkId, groupId, personId: ctx.person._id, role: "member", joinedAt: now })
  await recordGroupMember(ctx, { _id: membershipId, groupId })
  return { groupId, created: true }
}

export const groupForPage = networkQuery({
  minStatus: "en_attente",
  args: { pageId: v.id("pages") },
  returns: v.union(associationGroupValidator, v.null()),
  handler: async (ctx, { pageId }) => {
    assertDiasporaNetwork(ctx.network)
    const page = await associationGroupPageOrNull(ctx, ctx.networkId, pageId, ctx.person._id)
    if (!page) return null
    const group = await groupOfPage(ctx, ctx.networkId, page._id)
    if (!group) return null
    const membership = await liveThematicGroupMembership(ctx, group._id, ctx.person._id)
    const eligibleRole = await associationGroupRoleOrNull(ctx, group, ctx.person._id)
    const status = effectiveMembershipStatus(ctx.membership)
    const canWrite = status === "declaree" || status === "verifiee"
    const active = isActiveThematicGroup(group)
    const canReopen = !active && canWrite && eligibleRole === "owner" && (await isReopenable(ctx, group))
    return {
      groupId: group._id, pageId: page._id, name: group.name, state: active ? "active" as const : "closed" as const,
      closedAt: canReopen ? (group.closedAt ?? null) : null,
      canReopen,
      role: membership?.role ?? null, isMember: membership !== null,
      canJoin: active && canWrite && eligibleRole !== null && membership === null,
      canManage: eligibleRole === "owner",
      canPublish: active && canWrite && membership !== null,
    }
  },
})

export const createGroupForPage = networkMutation({
  minStatus: "declaree", writeBucket: "group.create",
  args: { pageId: v.id("pages"), idempotencyKey: v.string() },
  returns: v.object({ groupId: v.id("thematicGroups"), created: v.boolean() }),
  handler: async (ctx, { pageId, idempotencyKey }) => {
    assertDiasporaNetwork(ctx.network)
    return await createAssociationGroupForPage(ctx, pageId, idempotencyKey)
  },
})

/** Fermé seulement : ni archivé, ni en suppression, ni retiré par la modération. */
async function isReopenable(ctx: Pick<QueryCtx, "db">, group: Doc<"thematicGroups">): Promise<boolean> {
  return group.closedAt !== undefined && group.archivedAt === undefined && group.deletingAt === undefined && !(await isThematicGroupRemovedByModeration(ctx, group._id))
}

/**
 * AS-03 — rouvrir le groupe d'une association. Réservé au responsable du groupe, la même
 * garde que la création et la fermeture : administrateur vivant de la page, dont la ligne
 * d'adhésion à l'association, s'il en a une, est acceptée. Un groupe archivé, en cours de
 * suppression ou retiré par la modération ne se rouvre pas (refus indistinct). Versionné : la réouverture cite la
 * fermeture lue (`expectedClosedAt`) ; une autre fermeture entre-temps est un conflit.
 * Idempotent : un groupe déjà actif se rend tel quel. Rien d'autre ne bouge : les membres,
 * les publications et l'épingle restent ; les droits se relisent vivants (un adhérent
 * exclu entre-temps reste dehors).
 */
export const reopenGroupForPage = networkMutation({
  minStatus: "declaree", writeBucket: "group.manage",
  args: { groupId: v.id("thematicGroups"), expectedClosedAt: v.number() },
  returns: v.object({ state: v.literal("active") }),
  handler: async (ctx, { groupId, expectedClosedAt }) => {
    assertDiasporaNetwork(ctx.network)
    const group = await ctx.db.get(groupId)
    if (!group || group.networkId !== ctx.networkId || group.associationPageId === undefined) return notFound()
    if (group.archivedAt !== undefined || group.deletingAt !== undefined || (await isThematicGroupRemovedByModeration(ctx, group._id))) return notFound()
    // La garde de `requireOwner` (fermeture) : réseau vivant, page d'association lisible, administrateur, adhésion acceptée.
    if ((await associationGroupRoleOrNull(ctx, group, ctx.person._id)) !== "owner") return notFound()
    if (group.closedAt === undefined) return { state: "active" as const }
    if (group.closedAt !== expectedClosedAt) return fail("conflict")
    const now = Date.now()
    await ctx.db.patch(group._id, { closedAt: undefined, updatedAt: now })
    await appendAudit(ctx, {
      action: "page.group_reopen",
      capacity: "page_admin",
      actorPersonId: ctx.person._id,
      networkId: ctx.networkId,
      subject: { table: "pages", id: group.associationPageId },
      details: { groupId: group._id, closedAt: expectedClosedAt },
      at: now,
    })
    return { state: "active" as const }
  },
})

/** Projection privée du port : aucune identité technique, aucun média ni lien vers un profil. */
export const posts = networkQuery({
  minStatus: "en_attente",
  args: { groupId: v.id("thematicGroups"), paginationOpts: paginationOptsValidator },
  returns: v.object({ items: v.array(associationGroupPostValidator), continueCursor: v.union(v.string(), v.null()), isDone: v.boolean() }),
  handler: async (ctx, { groupId, paginationOpts }) => {
    assertDiasporaNetwork(ctx.network)
    const { group, membership } = await requireLiveThematicGroupMembership(ctx, ctx.networkId, groupId, ctx.person._id)
    if (group.associationPageId === undefined) return notFound()
    const result = await ctx.db.query("posts")
      .withIndex("by_network_group_status_publishedAt", (q) => q.eq("networkId", ctx.networkId).eq("groupId", group._id).eq("status", "published"))
      .order("desc").paginate({
        ...paginationOpts,
        numItems: Number.isFinite(paginationOpts.numItems) ? Math.min(Math.max(Math.trunc(paginationOpts.numItems), 1), 20) : 20,
        maximumBytesRead: Math.min(paginationOpts.maximumBytesRead ?? 1024 * 1024, 1024 * 1024),
      })
    const items: (typeof associationGroupPostValidator.type)[] = []
    const status = effectiveMembershipStatus(ctx.membership)
    const canModerate = (membership.role === "owner" || membership.role === "moderator") && (status === "declaree" || status === "verifiee")
    for (const row of result.page) {
      if (row.networkId !== ctx.networkId || row.groupId !== group._id || row.pageId !== undefined || !hasNativePostAuthor(row)) continue
      const state = await contentState(ctx, "post", row._id)
      const isMine = row.authorPersonId === ctx.person._id
      if (!state || state.networkId !== ctx.networkId || state.status === "removed" || (state.status === "pending_review" && !isMine)) continue
      if (!(await canSeePostDoc(ctx, { network: ctx.network, personId: ctx.person._id }, row))) continue
      const author = await livePersonProfile(ctx, row.authorPersonId)
      items.push({ postId: row._id, body: row.body, author: { displayName: author?.displayName ?? null }, createdAt: row.createdAt, isMine, canRemove: isMine || canModerate, moderation: state.status })
    }
    return { items, continueCursor: result.isDone ? null : result.continueCursor, isDone: result.isDone }
  },
})
