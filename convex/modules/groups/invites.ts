// Dupliqué de socle/convex/modules/reseauPersonnel/groupes.ts (l. 2145-2637 : `inviteOrNull`, `activeGroupInviteLinkOrNull`, `insertGroupInviteLink`, `requireActiveGroupInviteLink`, `getOrCreateGroupInviteLink`, `resetGroupInviteLink`, `previewGroupInvite`, `joinGroupViaInviteLink`, `inviteToGroup`, `respondGroupInvite`, `myGroupInvites`) @ ad2e7fdc2 — adaptations : invitation et lien PAR RÉSEAU (un jeton d'un autre réseau se dit comme un jeton inconnu) ; admissibilité = relation acceptée de l'INVITANT dans le réseau, sans blocage ; « comptes publics » sans objet ; plafond jugé par le contrat sur l'effectif de l'agrégat (D02) ; arrivée commune (`admitMember` : appartenance ranimée ou créée, curseur à l'arrivée, compteur à zéro, effectif, message système) ; cloche `group_added` par la porte du moteur, RÉSOLUE à la réponse comme à l'entrée par le lien ; `myGroupInvites` paginée par réseau ; l. 2089-2143 `listMyConnectionsForGroup` (qui inviter) : relations acceptées DANS le réseau, membres actifs au profil publié, sans blocage, bornées à 200 et triées par nom — la même admissibilité que `createGroup` et `inviteToGroup` ; refus à code ; débit.
/**
 * Entrer dans un groupe : par INVITATION (l'invité décide) ou par LIEN (le
 * lien porte le consentement du groupe : aucune relation n'est exigée).
 *
 * Une appartenance naît à l'ACCEPTATION, jamais à l'invitation : ajouter
 * quelqu'un d'office le ferait sonner pour un groupe qu'il n'a pas rejoint.
 */
import type { CounterpartLabel } from "@antsia/social-contracts/counterpart"
import { assertGroupHasRoom } from "@antsia/social-contracts/groupCapacity"
import { canInviteToGroupThread } from "@antsia/social-domain/groupThreads"
import { paginationOptsValidator, type PaginationResult } from "convex/server"
import { v } from "convex/values"

import type { Doc, Id } from "../../_generated/dataModel"
import type { MutationCtx, QueryCtx } from "../../_generated/server"
import { isActiveMember } from "../../lib/access"
import { checked, fail, failRule, notFound } from "../../lib/errors"
import { networkMutation, networkQuery } from "../../lib/functions"
import { enforceRateLimit } from "../../lib/rateLimit"
import { resolveFileDelivery } from "../files/storageGuard"
import { acceptedCounterpartIds, blockedCounterpartIds } from "../graph/graph"
import { counterpartOf } from "../messaging/participation"
import { notifyPerson, resolveNotifications } from "../notifications/notify"
import { findPublishedPersonByHandle, miniProfileCache } from "../people/miniProfile"
import { assertAdmissible, countThreadMembers, liveMembershipOrNull, membershipRowOrNull, recordThreadMember, requireLiveMembership } from "./access"

type NetworkCtx = MutationCtx & { networkId: Id<"networks">; person: Doc<"persons"> }

/** Liens relus pour trouver l'actif : le plus récent l'est toujours, les anciens restent révoqués. */
const LINKS_SCAN = 50
/** Invitations par page, plafond dur. */
const PAGE_MAX = 50

/** L'invitation d'une personne à un fil, si elle existe (une ligne par paire). */
async function inviteOrNull(ctx: Pick<QueryCtx, "db">, threadId: Id<"groupThreads">, personId: Id<"persons">): Promise<Doc<"groupInvites"> | null> {
  return await ctx.db
    .query("groupInvites")
    .withIndex("by_thread_invitee", (q) => q.eq("threadId", threadId).eq("inviteePersonId", personId))
    .unique()
}

/**
 * L'ARRIVÉE d'une personne : sa ligne reprend vie (ou naît), son histoire et son
 * curseur partent d'ici — elle n'a pas à relire ce qui s'est dit sans elle, ni à
 * voir une pastille de cent messages —, l'effectif compte, le fil le dit.
 */
async function admitMember(ctx: MutationCtx, thread: Doc<"groupThreads">, personId: Id<"persons">, now: number): Promise<void> {
  const fresh = { role: "member" as const, joinedAt: now, lastReadAt: now, unreadCount: 0, activityAt: now }
  const previous = await membershipRowOrNull(ctx, thread._id, personId)
  let memberId: Id<"groupMembers">
  if (previous) {
    await ctx.db.patch(previous._id, {
      ...fresh,
      leftAt: undefined,
      lastReadCreationTime: undefined,
      lastReadMessageId: undefined,
      countedThroughAt: undefined,
      countedThroughCreationTime: undefined,
      clearedThroughMessageId: undefined,
      clearedThroughCreationTime: undefined,
      mutedAt: undefined,
      shelf: undefined,
    })
    memberId = previous._id
  } else {
    memberId = await ctx.db.insert("groupMembers", { networkId: thread.networkId, threadId: thread._id, personId, ...fresh })
  }
  await recordThreadMember(ctx, { _id: memberId, threadId: thread._id })
  await ctx.db.insert("groupMessages", { networkId: thread.networkId, threadId: thread._id, senderPersonId: personId, type: "system", event: "member_joined", createdAt: now })
}

/** Le fil vivant d'une invitation ou d'un lien, dans le réseau appelé — sinon le refus indistinct. */
async function openThreadOrNull(ctx: Pick<QueryCtx, "db">, networkId: Id<"networks">, threadId: Id<"groupThreads">): Promise<Doc<"groupThreads"> | null> {
  const thread = await ctx.db.get(threadId)
  if (!thread || thread.networkId !== networkId || thread.closedAt !== undefined || thread.deletingAt !== undefined) return null
  return thread
}

// ═══════════════════════════════════════════════════════════════
// Inviter et répondre
// ═══════════════════════════════════════════════════════════════

/**
 * INVITER quelqu'un — il décidera. La relation exigée est entre l'INVITANT et
 * l'invité : un administrateur ajoute quelqu'un de SON réseau. Déjà membre :
 * rien à faire, sans lever. Ré-inviter rouvre la ligne au lieu d'empiler.
 */
export const inviteToGroup = networkMutation({
  minStatus: "declaree",
  args: { threadId: v.id("groupThreads"), handle: v.string() },
  returns: v.object({ invited: v.literal(true) }),
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, "groupThread.invite", ctx.person._id)
    const { thread, member } = await requireLiveMembership(ctx, ctx.networkId, args.threadId, ctx.person._id)
    if (thread.closedAt !== undefined) return notFound()
    if (!canInviteToGroupThread(member.role)) return fail("groupRoleRequired")
    const found = await findPublishedPersonByHandle(ctx, ctx.networkId, args.handle)
    if (!found) return notFound()
    if (found._id === ctx.person._id) return failRule("GROUP_SELF_MEMBER")
    await assertAdmissible(ctx, ctx.networkId, ctx.person._id, found._id)
    if ((await liveMembershipOrNull(ctx, thread._id, found._id)) !== null) return { invited: true as const }
    const memberCount = await countThreadMembers(ctx, thread._id)
    checked(() => assertGroupHasRoom(memberCount))
    const now = Date.now()
    const existing = await inviteOrNull(ctx, thread._id, found._id)
    if (existing) {
      await ctx.db.patch(existing._id, { status: "pending", invitedByPersonId: ctx.person._id, createdAt: now, respondedAt: undefined })
    } else {
      await ctx.db.insert("groupInvites", { networkId: ctx.networkId, threadId: thread._id, inviteePersonId: found._id, invitedByPersonId: ctx.person._id, status: "pending", createdAt: now })
    }
    await notifyPerson(ctx, { networkId: ctx.networkId, recipientPersonId: found._id, actorPersonId: ctx.person._id, kind: "group_added", subject: { groupThread: thread._id } })
    return { invited: true as const }
  },
})

/**
 * RÉPONDRE à une invitation. Le refus n'émet RIEN (ni message, ni cloche) ;
 * dans les deux cas, MA cloche `group_added` se résout ici. Une réponse refusée
 * (groupe plein) ne résout rien.
 */
export const respondGroupInvite = networkMutation({
  minStatus: "declaree",
  args: { threadId: v.id("groupThreads"), accept: v.boolean() },
  returns: v.object({ joined: v.boolean() }),
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, "groupThread.join", ctx.person._id)
    const invite = await inviteOrNull(ctx, args.threadId, ctx.person._id)
    // Une invitation d'autrui, déjà répondue ou inexistante : le même refus.
    if (!invite || invite.status !== "pending" || invite.networkId !== ctx.networkId) return notFound()
    const thread = await openThreadOrNull(ctx, ctx.networkId, args.threadId)
    if (!thread) return notFound()
    const now = Date.now()
    if (!args.accept) {
      await ctx.db.patch(invite._id, { status: "declined", respondedAt: now })
      await resolveNotifications(ctx, { networkId: ctx.networkId, recipientPersonId: ctx.person._id, kind: "group_added", subject: { groupThread: thread._id }, resolution: "declined", at: now })
      return { joined: false }
    }
    const memberCount = await countThreadMembers(ctx, thread._id)
    checked(() => assertGroupHasRoom(memberCount))
    await ctx.db.patch(invite._id, { status: "accepted", respondedAt: now })
    await resolveNotifications(ctx, { networkId: ctx.networkId, recipientPersonId: ctx.person._id, kind: "group_added", subject: { groupThread: thread._id }, resolution: "accepted", at: now })
    await admitMember(ctx, thread, ctx.person._id, now)
    return { joined: true }
  },
})

export type MyGroupInviteDto = { threadId: Id<"groupThreads">; title: string; memberCount: number; invitedBy: CounterpartLabel & { personId: Id<"persons"> }; invitedAt: number }

/** MES invitations en attente dans ce réseau — la file de ce que j'ai à décider. */
export const myGroupInvites = networkQuery({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args): Promise<PaginationResult<MyGroupInviteDto>> => {
    const result = await ctx.db
      .query("groupInvites")
      .withIndex("by_network_invitee_status_createdAt", (q) => q.eq("networkId", ctx.networkId).eq("inviteePersonId", ctx.person._id).eq("status", "pending"))
      .order("desc")
      .paginate({ ...args.paginationOpts, numItems: Math.min(Math.max(Math.trunc(args.paginationOpts.numItems), 1), PAGE_MAX) })
    const profileOf = miniProfileCache(ctx)
    const page: MyGroupInviteDto[] = []
    for (const row of result.page) {
      // Un fil fermé n'a plus d'invitation à honorer.
      const thread = await openThreadOrNull(ctx, ctx.networkId, row.threadId)
      if (!thread) continue
      page.push({
        threadId: thread._id,
        title: thread.title,
        memberCount: await countThreadMembers(ctx, thread._id),
        invitedBy: { ...(await counterpartOf(ctx, row.invitedByPersonId, profileOf)), personId: row.invitedByPersonId },
        invitedAt: row.createdAt,
      })
    }
    return { ...result, page }
  },
})

// ═══════════════════════════════════════════════════════════════
// Le lien d'invitation
// ═══════════════════════════════════════════════════════════════

async function activeLinkOrNull(ctx: Pick<QueryCtx, "db">, threadId: Id<"groupThreads">): Promise<Doc<"groupInviteLinks"> | null> {
  const rows = await ctx.db
    .query("groupInviteLinks")
    .withIndex("by_thread", (q) => q.eq("threadId", threadId))
    .order("desc")
    .take(LINKS_SCAN)
  return rows.find((row) => row.revokedAt === undefined) ?? null
}

/** Un jeton OPAQUE, jamais l'identifiant du fil ; une collision se retente. */
async function insertLink(ctx: NetworkCtx, thread: Doc<"groupThreads">): Promise<Doc<"groupInviteLinks">> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const token = crypto.randomUUID().replace(/-/g, "")
    const collision = await ctx.db
      .query("groupInviteLinks")
      .withIndex("by_token", (q) => q.eq("token", token))
      .first()
    if (collision) continue
    const linkId = await ctx.db.insert("groupInviteLinks", { networkId: thread.networkId, threadId: thread._id, token, createdByPersonId: ctx.person._id, createdAt: Date.now() })
    const link = await ctx.db.get(linkId)
    if (link) return link
  }
  return fail("conflict")
}

/**
 * Le jeton et son fil, sans distinguer inconnu, révoqué, d'un autre réseau,
 * fermé ou en suppression : le lien partageable n'est pas un oracle.
 */
async function requireActiveLink(ctx: Pick<QueryCtx, "db">, networkId: Id<"networks">, token: string): Promise<{ link: Doc<"groupInviteLinks">; thread: Doc<"groupThreads"> }> {
  const link = await ctx.db
    .query("groupInviteLinks")
    .withIndex("by_token", (q) => q.eq("token", token))
    .first()
  if (!link || link.revokedAt !== undefined || link.networkId !== networkId) return notFound()
  const thread = await openThreadOrNull(ctx, networkId, link.threadId)
  if (!thread) return notFound()
  return { link, thread }
}

/** Le lien actif, ou un nouveau — gestionnaires. */
export const getOrCreateGroupInviteLink = networkMutation({
  minStatus: "declaree",
  args: { threadId: v.id("groupThreads") },
  returns: v.object({ token: v.string() }),
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, "groupThread.manage", ctx.person._id)
    const { thread, member } = await requireLiveMembership(ctx, ctx.networkId, args.threadId, ctx.person._id)
    if (thread.closedAt !== undefined) return notFound()
    if (!canInviteToGroupThread(member.role)) return fail("groupRoleRequired")
    const existing = await activeLinkOrNull(ctx, thread._id)
    if (existing) return { token: existing.token }
    return { token: (await insertLink(ctx, thread)).token }
  },
})

/** Révoquer le lien et en poser un autre aussitôt — l'ancien jeton reste invalide. */
export const resetGroupInviteLink = networkMutation({
  minStatus: "declaree",
  args: { threadId: v.id("groupThreads") },
  returns: v.object({ token: v.string() }),
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, "groupThread.manage", ctx.person._id)
    const { thread, member } = await requireLiveMembership(ctx, ctx.networkId, args.threadId, ctx.person._id)
    if (thread.closedAt !== undefined) return notFound()
    if (!canInviteToGroupThread(member.role)) return fail("groupRoleRequired")
    const existing = await activeLinkOrNull(ctx, thread._id)
    if (existing) await ctx.db.patch(existing._id, { revokedAt: Date.now() })
    return { token: (await insertLink(ctx, thread)).token }
  },
})

/** L'aperçu minimal avant de rejoindre — aucun membre n'est exposé. */
export const previewGroupInvite = networkQuery({
  args: { token: v.string() },
  returns: v.object({ threadId: v.id("groupThreads"), title: v.string(), avatarUrl: v.union(v.string(), v.null()), memberCount: v.number(), alreadyMember: v.boolean() }),
  handler: async (ctx, args) => {
    const { thread } = await requireActiveLink(ctx, ctx.networkId, args.token)
    return {
      threadId: thread._id,
      title: thread.title,
      avatarUrl: thread.avatarStorageId === undefined ? null : (await resolveFileDelivery(ctx, thread.avatarStorageId)).url,
      memberCount: await countThreadMembers(ctx, thread._id),
      alreadyMember: (await liveMembershipOrNull(ctx, thread._id, ctx.person._id)) !== null,
    }
  },
})

/**
 * Rejoindre par le jeton : le lien porte le consentement du groupe. Le rejeu
 * est un succès sans écriture ; une invitation nominative en attente est
 * satisfaite par la même entrée, et sa cloche résolue.
 */
export const joinGroupViaInviteLink = networkMutation({
  minStatus: "declaree",
  args: { token: v.string() },
  returns: v.object({ threadId: v.id("groupThreads"), joined: v.boolean() }),
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, "groupThread.join", ctx.person._id)
    const { thread } = await requireActiveLink(ctx, ctx.networkId, args.token)
    if ((await liveMembershipOrNull(ctx, thread._id, ctx.person._id)) !== null) return { threadId: thread._id, joined: false }
    const memberCount = await countThreadMembers(ctx, thread._id)
    checked(() => assertGroupHasRoom(memberCount))
    const now = Date.now()
    const invite = await inviteOrNull(ctx, thread._id, ctx.person._id)
    if (invite) await ctx.db.patch(invite._id, { status: "accepted", respondedAt: now })
    await resolveNotifications(ctx, { networkId: ctx.networkId, recipientPersonId: ctx.person._id, kind: "group_added", subject: { groupThread: thread._id }, resolution: "accepted", at: now })
    await admitMember(ctx, thread, ctx.person._id, now)
    return { threadId: thread._id, joined: true }
  },
})

// ═══════════════════════════════════════════════════════════════
// Qui inviter
// ═══════════════════════════════════════════════════════════════

/** Relations proposées à la composition d'un groupe : la liste tient en mémoire, le filtre par texte est au client. */
const CONNECTIONS_FOR_GROUP_MAX = 200

export type ConnectionForGroupDto = {
  personId: Id<"persons">
  handle: string
  displayName: string
  headline: string | null
  avatarUrl: string | null
}

const connectionForGroupValidator = v.object({
  personId: v.id("persons"),
  handle: v.string(),
  displayName: v.string(),
  headline: v.union(v.string(), v.null()),
  avatarUrl: v.union(v.string(), v.null()),
})

/**
 * MES relations ÉLIGIBLES à un groupe — exactement celles que `createGroup` et
 * `inviteToGroup` accepteront : relation acceptée DANS ce réseau, sans blocage
 * (dans un sens ou dans l'autre, tous réseaux), membre active au profil publié
 * (l'identifiant est l'adresse que la création demande). Offrir plus large que
 * ce que la création accepte, ce serait fabriquer des refus ; ce n'est donc PAS
 * l'annuaire du réseau.
 */
export const listMyConnectionsForGroup = networkQuery({
  args: {},
  returns: v.array(connectionForGroupValidator),
  handler: async (ctx): Promise<ConnectionForGroupDto[]> => {
    const me = ctx.person._id
    const [accepted, blocked] = await Promise.all([acceptedCounterpartIds(ctx, ctx.networkId, me), blockedCounterpartIds(ctx, me)])
    const profileOf = miniProfileCache(ctx)
    const items: ConnectionForGroupDto[] = []
    for (const key of accepted.ids) {
      if (items.length >= CONNECTIONS_FOR_GROUP_MAX) break
      if (blocked.ids.has(key)) continue
      const personId = key as Id<"persons">
      const person = await profileOf(personId)
      if (!person.hasPublishedProfile || person.handle === null || person.displayName === null) continue
      if (!(await isActiveMember(ctx, ctx.networkId, personId))) continue
      items.push({ personId, handle: person.handle, displayName: person.displayName, headline: person.headline, avatarUrl: person.avatarUrl })
    }
    return items.sort((a, b) => a.displayName.localeCompare(b.displayName, "fr"))
  },
})
