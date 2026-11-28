// Dupliqué de socle/convex/modules/reseauPersonnel/groupes.ts (l. 571-1023 création et lectures : `createGroup`, `listMyGroupThreads`, `totalUnread`, `getGroupThread` ; l. 1837-1995 : `clearGroupConversation`, `markGroupRead`, `leaveGroup`, `setGroupMuted` ; l. 2639-2883 administration : `renameGroup`, `setGroupDescription`, `setGroupAvatar`, `removeGroupMember`, `setGroupMemberRole`) @ ad2e7fdc2 — adaptations : fils PAR RÉSEAU (création dans le réseau appelé, une clé rejouée dans un autre réseau est refusée) ; admissibilité = relation acceptée dans le réseau ; titre, description et composition jugés par le contrat (`groupCapacity`, plafond ramené à 256) ; invitations de la création sonnées par la diffusion par lots (D07) ; effectif par l'agrégat (D02) ; « mes groupes » PAGINÉS par activité sur l'appartenance (le socle lisait 50 appartenances puis triait) ; pastille lue sur le compteur tenu (D23) ; membres et invitations en attente PAGINÉS hors de la fiche (le socle rendait jusqu'à 1 000 profils d'un coup) ; photo du groupe sous la garde des fichiers (dépôt neuf, usage `avatar`, source `group`) et PURGÉE quand elle est remplacée ou retirée (elle n'appartient qu'à ce fil) ; mécanique d'appel rebranchée sur le module `calls` au lot 15 (l'appel vivant du fil dans la fiche et la liste, l'événement `call_started`, le départ ou le retrait d'un membre qui le sort de l'appel en cours) ; `listMyConnectionsForGroup` non recopiée (le sélecteur lit les relations du graphe) ; refus à code ; débit.
/**
 * Conversations de GROUPE d'un réseau : créer, lister, ouvrir, lire, quitter,
 * administrer.
 *
 * Les membres sont des PERSONNES du réseau désignées par leur identifiant,
 * en relation acceptée avec qui les ajoute, sans blocage — chaque manquement
 * rend le même refus qu'un identifiant inconnu : la création d'un groupe n'est
 * pas un oracle du graphe. Les autres sont INVITÉS, jamais ajoutés d'office :
 * une appartenance naît à l'acceptation.
 */
import type { CounterpartLabel } from "@antsia/social-contracts/counterpart"
import { assertGroupComposition, assertGroupTitle, normalizeGroupDescription } from "@antsia/social-contracts/groupCapacity"
import { canRemoveGroupThreadMember, canRenameGroupThread, canSetGroupThreadRole, type GroupThreadRole, nextGroupThreadOwner } from "@antsia/social-domain/groupThreads"
import { NOTIFICATION_UNREAD_CAP } from "@antsia/social-domain/notifications"
import { paginationOptsValidator, type PaginationResult } from "convex/server"
import { v } from "convex/values"

import type { Doc, Id } from "../../_generated/dataModel"
import type { MutationCtx, QueryCtx } from "../../_generated/server"
import { checked, fail, failRule, notFound } from "../../lib/errors"
import { networkMutation, networkQuery } from "../../lib/functions"
import { enforceRateLimit } from "../../lib/rateLimit"
import { guardUploadUrl } from "../../lib/uploadPolicy"
import { liveThreadCall } from "../calls/access"
import { revokeThreadCallParticipation } from "../calls/state"
import { admitStoredUpload, assertFreshUpload, findScanByStorageId } from "../files/admission"
import { purgeStoredFile } from "../files/purge"
import { resolveFileDelivery, withheldCodeOf, withheldCodeValidator } from "../files/storageGuard"
import { enqueueFanout } from "../notifications/fanout"
import { counterpartOf } from "../messaging/participation"
import { readUnreadPart } from "../messaging/threads"
import { findPublishedPersonByHandle, miniProfileCache } from "../people/miniProfile"
import {
  assertAdmissible,
  blockedCache,
  countThreadMembers,
  historyFloor,
  isClearedForMember,
  liveMembers,
  liveMembershipOrNull,
  recordThreadMember,
  requireLiveMembership,
  unrecordThreadMember,
} from "./access"
import { type GroupPinnedDto, projectPinnedGroupMessage } from "./messages"
import { inboxShelfValidator, type InboxShelf } from "../messaging/tables"
import { type GroupSystemEvent, groupThreadRoleValidator } from "./tables"
import { markMemberReadThrough, releaseMemberUnread, unreadBadgeOf } from "./unread"

type ReadCtx = Pick<QueryCtx, "db" | "storage">
type NetworkCtx = MutationCtx & { networkId: Id<"networks">; person: Doc<"persons"> }

/** Fils, membres ou invitations rendus par page, plafond dur. */
const PAGE_MAX = 50

function clampPage(paginationOpts: { numItems: number; cursor: string | null }) {
  return { ...paginationOpts, numItems: Math.min(Math.max(Math.trunc(paginationOpts.numItems), 1), PAGE_MAX) }
}

/** L'URL servie d'une photo de groupe (la garde décide), ou `null`. */
async function avatarUrlOf(ctx: ReadCtx, thread: Doc<"groupThreads">): Promise<string | null> {
  if (thread.avatarStorageId === undefined) return null
  return (await resolveFileDelivery(ctx, thread.avatarStorageId)).url
}

/**
 * Un message système : un fait du fil, sans aperçu ni cloche. `call_started`
 * (émis par le module `calls`) porte une RÉFÉRENCE à l'appel, jamais un
 * contenu : la carte de l'écran relit l'appel avec sa garde.
 */
export async function insertSystemMessage(
  ctx: MutationCtx,
  thread: Doc<"groupThreads">,
  sender: Id<"persons">,
  event: GroupSystemEvent,
  extra: { content?: string; targetPersonId?: Id<"persons">; callId?: Id<"calls">; at?: number } = {},
): Promise<Id<"groupMessages">> {
  return await ctx.db.insert("groupMessages", {
    networkId: thread.networkId,
    threadId: thread._id,
    senderPersonId: sender,
    type: "system",
    event,
    ...(extra.content !== undefined ? { content: extra.content } : {}),
    ...(extra.targetPersonId !== undefined ? { targetPersonId: extra.targetPersonId } : {}),
    ...(extra.callId !== undefined ? { callId: extra.callId } : {}),
    createdAt: extra.at ?? Date.now(),
  })
}

/** Admettre une photo de groupe : un dépôt NEUF de qui la pose, sous la politique `avatar` ; le type déclaré est confronté au stockage. */
async function admitGroupAvatar(ctx: NetworkCtx, storageId: Id<"_storage">, declaredMimeType: string | undefined): Promise<void> {
  await assertFreshUpload(ctx, ctx.person._id, storageId)
  await admitStoredUpload(ctx, { storageId, usage: "avatar", ...(declaredMimeType ? { mimeType: declaredMimeType } : {}) }, { source: "group", networkId: ctx.networkId, uploadedByPersonId: ctx.person._id })
}

/** Purger une photo de groupe — seulement si le registre dit qu'elle a été admise pour un groupe. */
export async function purgeGroupAvatar(ctx: MutationCtx, storageId: Id<"_storage">): Promise<void> {
  const scan = await findScanByStorageId(ctx, storageId)
  if (scan?.source === "group") await purgeStoredFile(ctx, storageId)
}

// ═══════════════════════════════════════════════════════════════
// Création
// ═══════════════════════════════════════════════════════════════

/**
 * Créer un groupe, les autres désignés par IDENTIFIANT et INVITÉS. Idempotente
 * par (créateur, clé) : le rejeu rend le fil déjà créé sans rejuger un graphe
 * qui a pu changer — c'est le même envoi ; rejouée dans un autre réseau, la
 * clé est refusée.
 */
export const createGroup = networkMutation({
  minStatus: "declaree",
  args: { title: v.string(), memberHandles: v.array(v.string()), idempotencyKey: v.string(), avatarStorageId: v.optional(v.id("_storage")), avatarMimeType: v.optional(v.string()) },
  returns: v.object({ threadId: v.id("groupThreads"), created: v.boolean() }),
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, "groupThread.create", ctx.person._id)
    const existing = await ctx.db
      .query("groupThreads")
      .withIndex("by_creator_idempotency", (q) => q.eq("createdByPersonId", ctx.person._id).eq("idempotencyKey", args.idempotencyKey))
      .first()
    if (existing) {
      if (existing.networkId !== ctx.networkId) return fail("conflict")
      return { threadId: existing._id, created: false }
    }
    const title = checked(() => assertGroupTitle(args.title))
    const invitees: Id<"persons">[] = []
    for (const handle of args.memberHandles) {
      const found = await findPublishedPersonByHandle(ctx, ctx.networkId, handle)
      if (!found) return notFound()
      if (found._id === ctx.person._id) return failRule("GROUP_SELF_MEMBER")
      if (invitees.includes(found._id)) continue
      await assertAdmissible(ctx, ctx.networkId, ctx.person._id, found._id)
      invitees.push(found._id)
    }
    checked(() => assertGroupComposition(invitees.length))
    if (args.avatarStorageId !== undefined) await admitGroupAvatar(ctx, args.avatarStorageId, args.avatarMimeType)
    const now = Date.now()
    const threadId = await ctx.db.insert("groupThreads", {
      networkId: ctx.networkId,
      title,
      createdByPersonId: ctx.person._id,
      ...(args.avatarStorageId !== undefined ? { avatarStorageId: args.avatarStorageId } : {}),
      lastMessageAt: now,
      lastMessageKind: "system",
      lastMessageByPersonId: ctx.person._id,
      idempotencyKey: args.idempotencyKey,
      createdAt: now,
    })
    const thread = (await ctx.db.get(threadId))!
    const creationId = await insertSystemMessage(ctx, thread, ctx.person._id, "group_created", { at: now })
    await ctx.db.patch(threadId, { lastMessageId: creationId })
    const creation = (await ctx.db.get(creationId))!
    const ownerId = await ctx.db.insert("groupMembers", {
      networkId: ctx.networkId,
      threadId,
      personId: ctx.person._id,
      role: "owner",
      // Le créateur a « lu » ce qu'il vient de créer.
      lastReadAt: now,
      lastReadCreationTime: creation._creationTime,
      lastReadMessageId: creationId,
      unreadCount: 0,
      joinedAt: now,
      activityAt: now,
    })
    await recordThreadMember(ctx, { _id: ownerId, threadId })
    for (const inviteePersonId of invitees) {
      await ctx.db.insert("groupInvites", { networkId: ctx.networkId, threadId, inviteePersonId, invitedByPersonId: ctx.person._id, status: "pending", createdAt: now })
    }
    // Les cloches des conviés, par lots hors de cette transaction (D07).
    await enqueueFanout(ctx, { networkId: ctx.networkId, actorPersonId: ctx.person._id, kind: "group_added", subject: { groupThread: threadId }, source: { kind: "persons", personIds: invitees } })
    return { threadId, created: true }
  },
})

// ═══════════════════════════════════════════════════════════════
// Lectures
// ═══════════════════════════════════════════════════════════════

export type GroupThreadDto = {
  shelf?: InboxShelf
  threadId: Id<"groupThreads">
  title: string
  avatarUrl: string | null
  memberCount: number
  lastMessageAt: number | null
  /** MASQUÉ (`null`) : dernier mot d'une personne bloquée, d'avant mon arrivée, effacé de ma vue, ou retiré. */
  lastMessageText: string | null
  lastMessageKind: Doc<"groupThreads">["lastMessageKind"] | null
  lastMessageAttachmentCount: number | null
  lastMessageByMe: boolean
  lastMessageDeleted: boolean
  unreadCount: number
  unreadCapped: boolean
  muted: boolean
  myRole: GroupThreadRole
  /** L'appel VIVANT du fil — la bannière « appel en cours » ; `null` sans appel. */
  activeCall: { callId: Id<"calls">; mediaType: "audio" | "video" } | null
}

/** UN fil projeté pour SA liste — ce que la dénormalisation peut montrer à ce membre. */
async function projectThreadRow(ctx: QueryCtx, thread: Doc<"groupThreads">, member: Doc<"groupMembers">, isBlockedWith: (other: Id<"persons">) => Promise<boolean>): Promise<GroupThreadDto> {
  const last = thread.lastMessageId === undefined ? null : await ctx.db.get(thread.lastMessageId)
  const lastByBlocked = thread.lastMessageByPersonId !== undefined && (await isBlockedWith(thread.lastMessageByPersonId))
  // L'aperçu est du contenu : un arrivant ne lit pas la dernière phrase dite avant lui.
  const beforeMe = thread.lastMessageAt !== undefined && thread.lastMessageAt < historyFloor(member)
  const cleared = last !== null && isClearedForMember(last, member)
  const hidePreview = lastByBlocked || beforeMe || cleared
  const badge = unreadBadgeOf(member)
  const call = await liveThreadCall(ctx, thread._id)
  return {
    threadId: thread._id,
    title: thread.title,
    avatarUrl: await avatarUrlOf(ctx, thread),
    memberCount: await countThreadMembers(ctx, thread._id),
    lastMessageAt: thread.lastMessageAt ?? null,
    lastMessageText: hidePreview ? null : (thread.lastMessageText ?? null),
    lastMessageKind: hidePreview ? null : (thread.lastMessageKind ?? null),
    lastMessageAttachmentCount: hidePreview ? null : (thread.lastMessageAttachmentCount ?? null),
    lastMessageByMe: thread.lastMessageByPersonId === member.personId,
    lastMessageDeleted: !hidePreview && last !== null && last.deletedAt !== undefined,
    unreadCount: badge.count,
    unreadCapped: badge.capped,
    muted: member.mutedAt !== undefined,
    ...(member.shelf ? { shelf: member.shelf } : {}),
    myRole: member.role,
    activeCall: call === null ? null : { callId: call._id, mediaType: call.mediaType },
  }
}

/** MES groupes du réseau, par activité, à curseur NATIF — sans relire les fils pour trier. */
export const paginateMyGroupThreads = networkQuery({
  args: { paginationOpts: paginationOptsValidator, shelf: v.optional(v.union(inboxShelfValidator, v.literal("inbox"))) },
  handler: async (ctx, args): Promise<PaginationResult<GroupThreadDto>> => {
    const members = ctx.db.query("groupMembers")
    const range = args.shelf
      ? members.withIndex("by_network_person_active_shelf", q => q.eq("networkId", ctx.networkId).eq("personId", ctx.person._id).eq("leftAt", undefined).eq("shelf", args.shelf === "inbox" ? undefined : args.shelf))
      : members.withIndex("by_network_person_leftAt_activityAt", q => q.eq("networkId", ctx.networkId).eq("personId", ctx.person._id).eq("leftAt", undefined))
    const result = await range.order("desc")
      .paginate(clampPage(args.paginationOpts))
    const isBlockedWith = blockedCache(ctx, ctx.person._id)
    const page: GroupThreadDto[] = []
    for (const member of result.page) {
      const thread = await ctx.db.get(member.threadId)
      if (!thread || thread.deletingAt !== undefined || thread.closedAt !== undefined) continue
      page.push(await projectThreadRow(ctx, thread, member, isBlockedWith))
    }
    return { ...result, page }
  },
})

/** La part « groupes » de la pastille — UN document, tenu à l'écriture (D23). */
export const totalUnread = networkQuery({
  args: {},
  returns: v.object({ total: v.number(), capped: v.boolean() }),
  handler: async (ctx) => {
    const total = await readUnreadPart(ctx, ctx.networkId, ctx.person._id, "groups")
    return total > NOTIFICATION_UNREAD_CAP ? { total: NOTIFICATION_UNREAD_CAP, capped: true } : { total, capped: false }
  },
})

export type GroupThreadDetailDto = GroupThreadDto & {
  description: string | null
  createdAt: number
  createdBy: CounterpartLabel & { personId: Id<"persons">; isMe: boolean }
  closed: boolean
  pinnedMessage: GroupPinnedDto | null
}

/** La fiche d'un fil — l'en-tête de la vue ; membres et invitations se paginent à part. */
export const getGroupThread = networkQuery({
  args: { threadId: v.id("groupThreads") },
  handler: async (ctx, args): Promise<GroupThreadDetailDto> => {
    const { thread, member } = await requireLiveMembership(ctx, ctx.networkId, args.threadId, ctx.person._id)
    const row = await projectThreadRow(ctx, thread, member, blockedCache(ctx, ctx.person._id))
    return {
      ...row,
      description: thread.description ?? null,
      createdAt: thread.createdAt,
      createdBy: { ...(await counterpartOf(ctx, thread.createdByPersonId)), personId: thread.createdByPersonId, isMe: thread.createdByPersonId === ctx.person._id },
      closed: thread.closedAt !== undefined,
      pinnedMessage: await projectPinnedGroupMessage(ctx, thread, member),
    }
  },
})

export type GroupMemberDto = { personId: Id<"persons">; label: CounterpartLabel; role: GroupThreadRole; isMe: boolean; joinedAt: number }

/** Les membres VIVANTS d'un fil, paginés — nommés par leur profil publié, jamais par un e-mail. */
export const paginateGroupMembers = networkQuery({
  args: { threadId: v.id("groupThreads"), paginationOpts: paginationOptsValidator },
  handler: async (ctx, args): Promise<PaginationResult<GroupMemberDto>> => {
    await requireLiveMembership(ctx, ctx.networkId, args.threadId, ctx.person._id)
    const result = await ctx.db
      .query("groupMembers")
      .withIndex("by_thread_leftAt", (q) => q.eq("threadId", args.threadId).eq("leftAt", undefined))
      .paginate(clampPage(args.paginationOpts))
    const profileOf = miniProfileCache(ctx)
    const page: GroupMemberDto[] = []
    for (const row of result.page) {
      page.push({ personId: row.personId, label: await counterpartOf(ctx, row.personId, profileOf), role: row.role, isMe: row.personId === ctx.person._id, joinedAt: row.joinedAt })
    }
    return { ...result, page }
  },
})

export type GroupPendingInviteDto = { personId: Id<"persons">; label: CounterpartLabel; invitedAt: number }

/**
 * Les conviés qui n'ont pas encore répondu, rendus à TOUS les membres : sans
 * cela, inviter deux fois la même personne est le geste le plus naturel du monde.
 */
export const paginateGroupPendingInvites = networkQuery({
  args: { threadId: v.id("groupThreads"), paginationOpts: paginationOptsValidator },
  handler: async (ctx, args): Promise<PaginationResult<GroupPendingInviteDto>> => {
    await requireLiveMembership(ctx, ctx.networkId, args.threadId, ctx.person._id)
    const result = await ctx.db
      .query("groupInvites")
      .withIndex("by_thread_status_createdAt", (q) => q.eq("threadId", args.threadId).eq("status", "pending"))
      .order("desc")
      .paginate(clampPage(args.paginationOpts))
    const profileOf = miniProfileCache(ctx)
    const page: GroupPendingInviteDto[] = []
    for (const row of result.page) page.push({ personId: row.inviteePersonId, label: await counterpartOf(ctx, row.inviteePersonId, profileOf), invitedAt: row.createdAt })
    return { ...result, page }
  },
})

// ═══════════════════════════════════════════════════════════════
// Lire, effacer, quitter, sourdine
// ═══════════════════════════════════════════════════════════════

/** Le dernier message du fil, ou `null`. */
async function latestMessage(ctx: Pick<QueryCtx, "db">, threadId: Id<"groupThreads">): Promise<Doc<"groupMessages"> | null> {
  return await ctx.db
    .query("groupMessages")
    .withIndex("by_thread_createdAt", (q) => q.eq("threadId", threadId))
    .order("desc")
    .first()
}

/** Avancer MON curseur jusqu'au dernier message — no-op tant que rien n'arrive. */
export const markGroupRead = networkMutation({
  minStatus: "en_attente",
  args: { threadId: v.id("groupThreads") },
  returns: v.object({ updated: v.boolean() }),
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, "message.read", ctx.person._id)
    const { member } = await requireLiveMembership(ctx, ctx.networkId, args.threadId, ctx.person._id)
    const latest = await latestMessage(ctx, args.threadId)
    if (!latest) return { updated: false }
    return { updated: await markMemberReadThrough(ctx, member, latest) }
  },
})

/**
 * Effacer MON historique, sans retirer une ligne aux autres : la frontière est
 * le dernier message (`_creationTime`, exacte même à milliseconde égale) ; le
 * futur réapparaît normalement.
 */
export const clearGroupConversation = networkMutation({
  minStatus: "en_attente",
  args: { threadId: v.id("groupThreads") },
  returns: v.object({ cleared: v.literal(true) }),
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, "message.edit", ctx.person._id)
    const { member } = await requireLiveMembership(ctx, ctx.networkId, args.threadId, ctx.person._id)
    const latest = await latestMessage(ctx, args.threadId)
    if (!latest || member.clearedThroughMessageId === latest._id) return { cleared: true as const }
    await markMemberReadThrough(ctx, member, latest, { clearedThroughMessageId: latest._id, clearedThroughCreationTime: latest._creationTime })
    return { cleared: true as const }
  },
})

/** Faire sortir un membre (départ ou retrait) : la date, la pastille, l'effectif, la saisie. */
async function exitMember(ctx: MutationCtx, member: Doc<"groupMembers">, at: number): Promise<number> {
  await releaseMemberUnread(ctx, member, { leftAt: at })
  await unrecordThreadMember(ctx, member)
  // Le parti cesse d'entendre l'appel en cours, pas seulement de lire le fil.
  await revokeThreadCallParticipation(ctx, member.threadId, member.personId, at)
  const typing = await ctx.db
    .query("groupTyping")
    .withIndex("by_thread_person", (q) => q.eq("threadId", member.threadId).eq("personId", member.personId))
    .unique()
  if (typing) await ctx.db.delete(typing._id)
  return await countThreadMembers(ctx, member.threadId)
}

/**
 * Quitter le fil. Le départ est une date ; un parti est un non-membre partout.
 * La PROPRIÉTÉ SUIT (le plus ancien des restants) ; le dernier qui sort ferme.
 */
export const leaveGroup = networkMutation({
  minStatus: "en_attente",
  args: { threadId: v.id("groupThreads") },
  returns: v.object({ left: v.literal(true) }),
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, "groupThread.manage", ctx.person._id)
    const { thread, member } = await requireLiveMembership(ctx, ctx.networkId, args.threadId, ctx.person._id)
    const now = Date.now()
    const remaining = await exitMember(ctx, member, now)
    if (remaining === 0) {
      await ctx.db.patch(thread._id, { closedAt: now })
      return { left: true as const }
    }
    if (member.role === "owner") {
      const others = (await liveMembers(ctx, thread._id)).filter((row) => row._id !== member._id)
      const successor = nextGroupThreadOwner(others.map((row) => ({ _id: row._id as string, joinedAt: row.joinedAt, row })))
      if (successor) await ctx.db.patch(successor.row._id, { role: "owner" })
    }
    await insertSystemMessage(ctx, thread, ctx.person._id, "member_left", { at: now })
    return { left: true as const }
  },
})

/** Sourdine : les messages arrivent, la cloche ne sonne plus. Idempotent. */
export const setMyGroupShelf = networkMutation({
  minStatus: "en_attente",
  args: { threadId: v.id("groupThreads"), shelf: v.union(inboxShelfValidator, v.null()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { member } = await requireLiveMembership(ctx, ctx.networkId, args.threadId, ctx.person._id)
    await ctx.db.patch(member._id, { shelf: args.shelf ?? undefined })
    return null
  },
})

export const setGroupMuted = networkMutation({
  minStatus: "en_attente",
  args: { threadId: v.id("groupThreads"), muted: v.boolean() },
  returns: v.object({ muted: v.boolean() }),
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, "groupThread.manage", ctx.person._id)
    const { member } = await requireLiveMembership(ctx, ctx.networkId, args.threadId, ctx.person._id)
    if ((member.mutedAt !== undefined) !== args.muted) await ctx.db.patch(member._id, { mutedAt: args.muted ? Date.now() : undefined })
    return { muted: args.muted }
  },
})

// ═══════════════════════════════════════════════════════════════
// Administration — le rôle confère quelque chose
// ═══════════════════════════════════════════════════════════════

/** Le fil, ouvert, et mon rôle de gestionnaire — sinon le refus qui convient. */
async function requireManagedThread(ctx: NetworkCtx, threadId: Id<"groupThreads">) {
  const { thread, member } = await requireLiveMembership(ctx, ctx.networkId, threadId, ctx.person._id)
  if (thread.closedAt !== undefined) return notFound()
  if (!canRenameGroupThread(member.role)) return fail("groupRoleRequired")
  return { thread, member }
}

/** RENOMMER le fil. Le même titre n'émet rien ; le nouveau voyage dans le message système. */
export const renameGroup = networkMutation({
  minStatus: "declaree",
  args: { threadId: v.id("groupThreads"), title: v.string() },
  returns: v.object({ title: v.string() }),
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, "groupThread.manage", ctx.person._id)
    const { thread } = await requireManagedThread(ctx, args.threadId)
    const title = checked(() => assertGroupTitle(args.title))
    if (title === thread.title) return { title }
    await ctx.db.patch(thread._id, { title })
    // AUCUNE cloche : renommer n'est pas une sollicitation, le fil se relit.
    await insertSystemMessage(ctx, thread, ctx.person._id, "group_renamed", { content: title })
    return { title }
  },
})

/** Poser ou retirer la description — gestionnaires. */
export const setGroupDescription = networkMutation({
  minStatus: "declaree",
  args: { threadId: v.id("groupThreads"), description: v.union(v.string(), v.null()) },
  returns: v.object({ description: v.union(v.string(), v.null()) }),
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, "groupThread.manage", ctx.person._id)
    const { thread } = await requireManagedThread(ctx, args.threadId)
    const description = checked(() => normalizeGroupDescription(args.description))
    if ((thread.description ?? null) !== description) await ctx.db.patch(thread._id, { description: description ?? undefined })
    return { description }
  },
})

/** URL de dépôt d'une photo de groupe (temps 1 de la politique ; le temps 2 est à la pose). */
export const generateGroupAvatarUploadUrl = networkMutation({
  minStatus: "declaree",
  args: {},
  returns: v.string(),
  handler: async (ctx) => {
    await enforceRateLimit(ctx, "upload.url", ctx.person._id)
    return await guardUploadUrl(ctx, "avatar")
  },
})

/**
 * Poser ou retirer la photo du groupe — gestionnaires. Reposer la photo
 * actuelle n'est pas un dépôt ; une nouvelle doit être NEUVE. L'ancienne,
 * propre à ce fil, est purgée (blob et ligne d'analyse).
 */
export const setGroupAvatar = networkMutation({
  minStatus: "declaree",
  args: { threadId: v.id("groupThreads"), storageId: v.union(v.id("_storage"), v.null()), mimeType: v.optional(v.string()) },
  returns: v.object({ avatarUrl: v.union(v.string(), v.null()), withheld: v.union(withheldCodeValidator, v.null()) }),
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, "groupThread.manage", ctx.person._id)
    const { thread } = await requireManagedThread(ctx, args.threadId)
    if (args.storageId === thread.avatarStorageId && args.storageId !== null) {
      const delivery = await resolveFileDelivery(ctx, args.storageId)
      return { avatarUrl: delivery.url, withheld: withheldCodeOf(delivery.scan) }
    }
    if (args.storageId !== null) await admitGroupAvatar(ctx, args.storageId, args.mimeType)
    await ctx.db.patch(thread._id, { avatarStorageId: args.storageId ?? undefined })
    if (thread.avatarStorageId !== undefined) await purgeGroupAvatar(ctx, thread.avatarStorageId)
    if (args.storageId === null) return { avatarUrl: null, withheld: null }
    const delivery = await resolveFileDelivery(ctx, args.storageId)
    return { avatarUrl: delivery.url, withheld: withheldCodeOf(delivery.scan) }
  },
})

/** RETIRER quelqu'un : le propriétaire peut, un pair administrateur non, jamais soi-même. */
export const removeGroupMember = networkMutation({
  minStatus: "declaree",
  args: { threadId: v.id("groupThreads"), memberPersonId: v.id("persons") },
  returns: v.object({ removed: v.literal(true) }),
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, "groupThread.manage", ctx.person._id)
    const { thread, member } = await requireLiveMembership(ctx, ctx.networkId, args.threadId, ctx.person._id)
    if (thread.closedAt !== undefined) return notFound()
    const target = await liveMembershipOrNull(ctx, args.threadId, args.memberPersonId)
    if (!target) return notFound()
    if (!canRemoveGroupThreadMember({ actorRole: member.role, targetRole: target.role, isSelf: target._id === member._id })) return fail("groupRoleRequired")
    const now = Date.now()
    await exitMember(ctx, target, now)
    // Son invitation retombe : sans cela, le ré-inviter serait impossible.
    const invite = await ctx.db
      .query("groupInvites")
      .withIndex("by_thread_invitee", (q) => q.eq("threadId", args.threadId).eq("inviteePersonId", args.memberPersonId))
      .unique()
    if (invite) await ctx.db.delete(invite._id)
    // L'émetteur RETIRE, le retiré est visé ; AUCUNE cloche : il ne peut plus relire le fil.
    await insertSystemMessage(ctx, thread, ctx.person._id, "member_removed", { targetPersonId: args.memberPersonId, at: now })
    return { removed: true as const }
  },
})

/** Nommer ou révoquer un ADMINISTRATEUR — le propriétaire seul ; la propriété ne s'attribue pas. */
export const setGroupMemberRole = networkMutation({
  minStatus: "declaree",
  args: { threadId: v.id("groupThreads"), memberPersonId: v.id("persons"), role: v.union(v.literal("admin"), v.literal("member")) },
  returns: v.object({ role: groupThreadRoleValidator }),
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, "groupThread.manage", ctx.person._id)
    const { thread, member } = await requireLiveMembership(ctx, ctx.networkId, args.threadId, ctx.person._id)
    if (thread.closedAt !== undefined) return notFound()
    const target = await liveMembershipOrNull(ctx, args.threadId, args.memberPersonId)
    if (!target) return notFound()
    if (target.role === args.role) return { role: args.role }
    if (!canSetGroupThreadRole({ actorRole: member.role, targetRole: target.role, nextRole: args.role, isSelf: target._id === member._id })) return fail("groupRoleRequired")
    await ctx.db.patch(target._id, { role: args.role })
    return { role: args.role }
  },
})
