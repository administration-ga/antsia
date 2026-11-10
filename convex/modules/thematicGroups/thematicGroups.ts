// Dupliqué de socle/convex/modules/reseauPersonnel/groupesThematiques.ts @ ad2e7fdc2 — adaptations : groupes PAR RÉSEAU (le groupe appartient au réseau de la fonction appelée), adhésion par le constructeur au lieu d'`assertNotSuspended`, « ressortissants » (`isPublicUser`) sans objet ; libellés → codes (`notFound`, `groupMembershipRequired`, `groupRoleRequired`, règle `GROUP_OWNER_CANNOT_LEAVE`) ; `memberCount` dans l'agrégat `engineCounters` (D02) ; découverte indexée et filtrée par réseau (D17) ; `listMembers` et `myInvites` paginées, `myGroups` bornée par activité récente avec sa lacune, vivier d'invitation borné avec sa lacune et jugé personne par personne (D19) ; mur du groupe à CURSEUR COMPOSITE (le socle repartait d'un instant, ex æquo perdus) ; invitation par la cloche du moteur (sujet groupe thématique) et résolution serveur ; cascade de suppression bornée qui purge blob ET ligne d'analyse (D10), décompte les agrégats, et nettoie réactions, fragments, commentaires, marques et signalements ; débit sur chaque geste (D14) ; pays facultatif du groupe et découverte par pays (ses groupes et ceux de tout le réseau, demande DIASPORALE EXF-DG-24) ; groupe d'adhérents d'une PAGE d'association (`associationPageId`, EXF-DG-26 : posé à la création par un administrateur vivant de la page, dans son réseau ; carte de la page sur la fiche ; découverte des groupes d'une page) ; gestion par le propriétaire (PG-02) : règles versionnées (`setGroupRules`) acceptées à l'entrée (`join`, `respondInvite`) ou après un changement (`acceptGroupRules`), transfert de propriété vers un modérateur éligible (`transferGroupOwnership`, `listTransferCandidates`), fiche qui dit les règles en vigueur et ce que le lecteur peut gérer.
/**
 * GROUPES THÉMATIQUES d'un réseau — des lieux de PUBLICATION, pas une
 * messagerie, pas un canal d'organisation.
 *
 * La FICHE (nom, description, effectif) est découvrable par tout membre du
 * réseau : c'est ce qui rend l'adhésion possible — d'où des refus EXPLICITES
 * (`groupMembershipRequired`, `groupRoleRequired`) là où une conversation
 * répondrait « introuvable ». Les PUBLICATIONS sont d'audience `group` :
 * réservées aux membres vivants, gardées par `assertVisiblePost`.
 *
 * Rôles : `owner` (créateur, unique) > `moderator` > `member` — la matrice
 * vit dans le domaine pur. L'invitation est une SUGGESTION, adressée par
 * identifiant à une CONNEXION non bloquée ; chaque manquement rend le même
 * refus (anti-oracle). Le refus d'une invitation n'émet rien.
 */
import {
  assertCanLeaveThematicGroup,
  assertThematicGroupDescription,
  assertThematicGroupName,
  assertThematicGroupRules,
  assertThematicGroupRulesAccepted,
  canRemoveThematicGroupMember,
  canSetThematicGroupRole,
  canTransferThematicGroupOwnership,
  isThematicGroupModerator,
  nextThematicGroupRulesVersion,
  type ThematicGroupRole,
  thematicGroupRulesVersionInForce,
} from "@antsia/social-domain/thematicGroups"
import { assertCountryCode, groupViewingReasonFor } from "@antsia/social-domain/content"
import type { PersonalFeedCursor } from "@antsia/social-domain/feedScale"
import { cursorForFeedPost } from "@antsia/social-domain/feedScale"
import { buildSearchableText, foldSearchQuery } from "@antsia/social-domain/searchText"
import { paginationOptsValidator, type PaginationResult } from "convex/server"
import { type Infer, v } from "convex/values"

import { internal } from "../../_generated/api"
import type { Doc, Id } from "../../_generated/dataModel"
import { internalMutation, type MutationCtx, type QueryCtx } from "../../_generated/server"
import { memberHasStatus } from "../../lib/access"
import { checked, fail, failRule, notFound } from "../../lib/errors"
import { networkMutation, networkQuery } from "../../lib/functions"
import { enforceRateLimit } from "../../lib/rateLimit"
import { createAssociationGroupForPage } from "../diaspora/associationGroups"
import { purgeStoredFile } from "../files/purge"
import { acceptedCounterpartIds, blockedCounterpartIds, isBlockedBetween, isConnectedTo } from "../graph/graph"
import { hiddenPostIds, readerMarks } from "../marks/marks"
import { assertSocialWriteAllowed, contentState } from "../moderation/policy"
import { notifyPerson, resolveNotifications } from "../notifications/notify"
import { findPublishedPersonByHandle, miniProfileCache, type PersonMiniProfile } from "../people/miniProfile"
import { pageCardOf } from "../pages/access"
import { type PageCard, pageCardValidator } from "../pages/validators"
import { canSeePostDoc, type ReaderContext } from "../posts/access"
import { markPostRemoved } from "../posts/contentRemoval"
import { hasNativePostAuthor } from "../posts/nativeAuthor"
import { countGroupMembers, recordGroupMember, unrecordComment, unrecordGroupMember } from "../posts/counters"
import {
  clampLimit,
  cursorCreationTimeOf,
  cursorValidator,
  enrichment,
  FEED_AUTHOR_SCAN,
  type FeedItem,
  feedItemValidator,
  feedWindow,
  groupReader,
  toFeedItem,
  WALL_WINDOWS_MAX,
} from "../posts/posts"
import { associationGroupPageOrNull, associationGroupRoleOrNull, canDiscoverThematicGroup, isActiveThematicGroup, liveThematicGroupMembership, requireLiveThematicGroupMembership } from "./access"

type ReadCtx = Pick<QueryCtx, "db">

/** Découverte : une vitrine, pas un annuaire — bornée dur. */
const DISCOVER_RECENT_LIMIT = 30
const DISCOVER_SEARCH_LIMIT = 20
const DISCOVER_QUERY_MIN = 2
/** Mes groupes lus en une page bornée ; au-delà, la lacune se dit. */
const MY_GROUPS_SCAN = 100
/** Invitations en attente lues pour l'état des cartes. */
const INVITES_SCAN = 50
/** Vivier d'invitation : mes connexions offertes, au plus ; la recherche serveur prend le relais. */
const INVITE_CANDIDATES_MAX = 200
/** Une passe de suppression reste très sous les limites transactionnelles. */
const DELETE_BATCH = 50
/** Modérateurs lus pour le transfert de propriété, au plus ; au-delà, la lacune se dit. */
const TRANSFER_CANDIDATES_MAX = 50

const readerOf = (ctx: { person: Doc<"persons">; network: Doc<"networks"> }): ReaderContext => ({ personId: ctx.person._id, network: ctx.network })

/** Le groupe, s'il appartient au réseau de l'acte et n'est pas en cours de suppression. */
async function groupInNetwork(ctx: ReadCtx, networkId: Id<"networks">, groupId: Id<"thematicGroups">): Promise<Doc<"thematicGroups"> | null> {
  const group = await ctx.db.get(groupId)
  return group && group.networkId === networkId && group.deletingAt === undefined ? group : null
}

/**
 * Une ligne d'appartenance vivante (créée, ou reprise en simple membre), comptée.
 * `acceptedRulesVersion` : la version des règles acceptée en entrant (PG-02),
 * déjà vérifiée par l'appelant ; absente, la ligne n'en garde aucune.
 */
async function admitMember(ctx: MutationCtx, group: Doc<"thematicGroups">, personId: Id<"persons">, now: number, acceptedRulesVersion?: number): Promise<void> {
  if (group.associationPageId !== undefined && (await associationGroupRoleOrNull(ctx, group, personId)) === null) return notFound()
  const existing = await ctx.db
    .query("thematicGroupMembers")
    .withIndex("by_group_and_person", (q) => q.eq("groupId", group._id).eq("personId", personId))
    .unique()
  if (existing && existing.leftAt === undefined) return
  const acceptance = acceptedRulesVersion === undefined ? { acceptedRulesVersion: undefined, acceptedRulesAt: undefined } : { acceptedRulesVersion, acceptedRulesAt: now }
  let membershipId: Id<"thematicGroupMembers">
  if (existing) {
    // Un rôle ne survit pas au départ : la ré-adhésion reprend la ligne en simple membre,
    // avec l'acceptation de CETTE entrée (jamais celle d'un passage précédent).
    await ctx.db.patch(existing._id, { role: "member", joinedAt: now, leftAt: undefined, ...acceptance })
    membershipId = existing._id
  } else {
    membershipId = await ctx.db.insert("thematicGroupMembers", {
      networkId: group.networkId,
      groupId: group._id,
      personId,
      role: "member",
      joinedAt: now,
      ...(acceptedRulesVersion === undefined ? {} : { acceptedRulesVersion, acceptedRulesAt: now }),
    })
  }
  await recordGroupMember(ctx, { _id: membershipId, groupId: group._id })
  await ctx.db.patch(group._id, { updatedAt: now })
}

/** Une appartenance qui se ferme (départ, retrait), décomptée. */
async function closeMembership(ctx: MutationCtx, group: Doc<"thematicGroups">, membership: Doc<"thematicGroupMembers">, now: number): Promise<void> {
  await ctx.db.patch(membership._id, { leftAt: now })
  await unrecordGroupMember(ctx, { _id: membership._id, groupId: group._id })
  await ctx.db.patch(group._id, { updatedAt: now })
}

// ═══════════════════════════════════════════════════════════════
// Création, adhésion, départ
// ═══════════════════════════════════════════════════════════════

/**
 * Créer un groupe dans le réseau. Idempotent par (créateur, clé) ; le créateur
 * devient `owner`. Le groupe d'adhérents d'une PAGE d'association
 * (`associationPageId`) ne se crée que par un administrateur vivant de la page,
 * dans le réseau de la page.
 */
export const create = networkMutation({
  minStatus: "declaree",
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    country: v.optional(v.string()),
    associationPageId: v.optional(v.id("pages")),
    idempotencyKey: v.string(),
  },
  returns: v.object({ groupId: v.id("thematicGroups"), created: v.boolean() }),
  handler: async (ctx, args) => {
    if (args.associationPageId !== undefined) {
      await enforceRateLimit(ctx, "group.create", ctx.person._id)
      return await createAssociationGroupForPage(ctx, args.associationPageId, args.idempotencyKey)
    }
    const replay = await ctx.db
      .query("thematicGroups")
      .withIndex("by_creator_and_idempotencyKey", (q) => q.eq("createdByPersonId", ctx.person._id).eq("idempotencyKey", args.idempotencyKey))
      .unique()
    if (replay) return replay.networkId === ctx.networkId && replay.associationPageId === undefined ? { groupId: replay._id, created: false } : fail("conflict")
    await enforceRateLimit(ctx, "group.create", ctx.person._id)
    const name = checked(() => assertThematicGroupName(args.name))
    const description = checked(() => assertThematicGroupDescription(args.description))
    const country = args.country === undefined ? undefined : checked(() => assertCountryCode(args.country ?? ""))
    const now = Date.now()
    const groupId = await ctx.db.insert("thematicGroups", {
      networkId: ctx.networkId,
      name,
      ...(description !== undefined ? { description } : {}),
      ...(country !== undefined ? { country } : {}),
      createdByPersonId: ctx.person._id,
      searchText: buildSearchableText(name, description ?? ""),
      idempotencyKey: args.idempotencyKey,
      createdAt: now,
      updatedAt: now,
    })
    const membershipId = await ctx.db.insert("thematicGroupMembers", { networkId: ctx.networkId, groupId, personId: ctx.person._id, role: "owner", joinedAt: now })
    await recordGroupMember(ctx, { _id: membershipId, groupId })
    return { groupId, created: true }
  },
})

/**
 * Entrer dans un groupe : sans règles, l'adhésion reste libre ; avec des
 * règles, la personne doit avoir accepté CELLES EN VIGUEUR (PG-02 — refus
 * traduit `GROUP_RULES_NOT_ACCEPTED`, jamais une adhésion silencieuse).
 * Rend la version acceptée à inscrire sur l'appartenance.
 */
function rulesAcceptedOnEntry(group: Doc<"thematicGroups">, acceptedRulesVersion: number | undefined): number | undefined {
  const inForce = thematicGroupRulesVersionInForce(group)
  checked(() => assertThematicGroupRulesAccepted({ rulesVersion: inForce, acceptedRulesVersion }))
  return inForce ?? undefined
}

/**
 * Rejoindre — l'adhésion est LIBRE, sous réserve des règles du groupe s'il en
 * a (`acceptedRulesVersion` : la version lue et acceptée à l'écran ; argument
 * facultatif, les appelants d'avant les règles restent valides). Idempotent :
 * un membre vivant n'est pas re-jugé. Adhérer satisfait une invitation en
 * attente : la cloche ne propose plus d'y répondre.
 */
export const join = networkMutation({
  minStatus: "declaree",
  args: { groupId: v.id("thematicGroups"), acceptedRulesVersion: v.optional(v.number()) },
  returns: v.object({ joined: v.literal(true) }),
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, "group.join", ctx.person._id)
    const group = await groupInNetwork(ctx, ctx.networkId, args.groupId)
    if (!group || !isActiveThematicGroup(group)) return notFound()
    const now = Date.now()
    if (!(await liveThematicGroupMembership(ctx, group._id, ctx.person._id))) {
      await admitMember(ctx, group, ctx.person._id, now, rulesAcceptedOnEntry(group, args.acceptedRulesVersion))
    }
    await resolveNotifications(ctx, {
      networkId: ctx.networkId,
      recipientPersonId: ctx.person._id,
      kind: "thematic_group_invite",
      subject: { thematicGroup: group._id },
      resolution: "accepted",
      at: now,
    })
    return { joined: true as const }
  },
})

/** Quitter. Idempotent. L'`owner` ne part pas (il transmet son rôle, ferme, archive ou supprime). */
export const leave = networkMutation({
  writeBucket: "group.leave",
  minStatus: "en_attente",
  args: { groupId: v.id("thematicGroups") },
  returns: v.object({ left: v.literal(true) }),
  handler: async (ctx, args) => {
    const group = await groupInNetwork(ctx, ctx.networkId, args.groupId)
    if (!group) return notFound()
    const membership = await liveThematicGroupMembership(ctx, group._id, ctx.person._id)
    if (!membership) return { left: true as const }
    // Le groupe d'association appartient à la page : son administrateur peut le quitter.
    if (group.associationPageId === undefined) checked(() => assertCanLeaveThematicGroup(membership.role))
    await closeMembership(ctx, group, membership, Date.now())
    return { left: true as const }
  },
})

// ═══════════════════════════════════════════════════════════════
// Cycle de vie — fermer, archiver, supprimer (owner)
// ═══════════════════════════════════════════════════════════════

/** L'owner vivant — y compris d'un groupe déjà fermé ou archivé, pour qu'il poursuive jusqu'au bout. */
async function requireOwner(ctx: ReadCtx, networkId: Id<"networks">, groupId: Id<"thematicGroups">, personId: Id<"persons">): Promise<Doc<"thematicGroups">> {
  const group = await groupInNetwork(ctx, networkId, groupId)
  if (!group) return notFound()
  if (group.associationPageId !== undefined) {
    return (await associationGroupRoleOrNull(ctx, group, personId)) === "owner" ? group : notFound()
  }
  const membership = await liveThematicGroupMembership(ctx, groupId, personId)
  if (!membership) return fail("groupMembershipRequired")
  if (membership.role !== "owner") return fail("groupRoleRequired")
  return group
}

/** Fermer gèle le groupe sans effacer son historique ; monotone et idempotent. */
export const closeGroup = networkMutation({
  minStatus: "declaree",
  args: { groupId: v.id("thematicGroups") },
  returns: v.object({ closed: v.literal(true) }),
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, "group.manage", ctx.person._id)
    const group = await requireOwner(ctx, ctx.networkId, args.groupId, ctx.person._id)
    if (group.closedAt === undefined) {
      const now = Date.now()
      await ctx.db.patch(group._id, { closedAt: now, updatedAt: now })
    }
    return { closed: true as const }
  },
})

/** Archiver retire aussi le groupe de la découverte, sans supprimer la ligne. */
export const archiveGroup = networkMutation({
  minStatus: "declaree",
  args: { groupId: v.id("thematicGroups") },
  returns: v.object({ archived: v.literal(true) }),
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, "group.manage", ctx.person._id)
    const group = await requireOwner(ctx, ctx.networkId, args.groupId, ctx.person._id)
    if (group.archivedAt === undefined) {
      const now = Date.now()
      await ctx.db.patch(group._id, { closedAt: group.closedAt ?? now, archivedAt: now, updatedAt: now })
    }
    return { archived: true as const }
  },
})

const deleteStageValidator = v.union(v.literal("posts"), v.literal("members"), v.literal("invites"), v.literal("final"))
type DeleteStage = Infer<typeof deleteStageValidator>

/**
 * Retire les références d'UNE publication du groupe avant sa ligne : réactions,
 * fragments, commentaires (décomptés), marques, signalements, puis ses médias
 * (blob ET ligne d'analyse, D10). Un lot plein laisse la publication en place
 * jusqu'au lot suivant : aucune référence pendante.
 */
async function deleteNextGroupPost(ctx: MutationCtx, group: Doc<"thematicGroups">): Promise<"none" | "deleted" | "pending"> {
  const post = await ctx.db
    .query("posts")
    .withIndex("by_network_group_status_publishedAt", (q) => q.eq("networkId", group.networkId).eq("groupId", group._id))
    .first()
  if (!post) return "none"
  const reactions = await ctx.db
    .query("postReactions")
    .withIndex("by_post_and_person", (q) => q.eq("postId", post._id))
    .take(DELETE_BATCH)
  for (const row of reactions) await ctx.db.delete(row._id)
  if (reactions.length === DELETE_BATCH) return "pending"
  const shards = await ctx.db
    .query("postReactionShards")
    .withIndex("by_post_and_shard", (q) => q.eq("postId", post._id))
    .take(DELETE_BATCH)
  for (const row of shards) await ctx.db.delete(row._id)
  const comments = await ctx.db
    .query("postComments")
    .withIndex("by_post_parent_status_createdAt", (q) => q.eq("postId", post._id))
    .take(DELETE_BATCH)
  for (const row of comments) {
    await unrecordComment(ctx, row)
    await ctx.db.delete(row._id)
  }
  if (comments.length === DELETE_BATCH) return "pending"
  const marks = await ctx.db
    .query("postMarks")
    .withIndex("by_post_and_kind", (q) => q.eq("postId", post._id))
    .take(DELETE_BATCH)
  for (const row of marks) await ctx.db.delete(row._id)
  if (marks.length === DELETE_BATCH) return "pending"
  const reports = await ctx.db
    .query("contentReports")
    .withIndex("by_post", (q) => q.eq("postId", post._id))
    .take(DELETE_BATCH)
  for (const row of reports) await ctx.db.delete(row._id)
  if (reports.length === DELETE_BATCH) return "pending"
  for (const medium of post.media ?? []) await purgeStoredFile(ctx, medium.storageId)
  await ctx.db.delete(post._id)
  return "deleted"
}

/** Une transaction de la cascade, bornée et rejouable. */
async function deleteCascadeBatch(ctx: MutationCtx, group: Doc<"thematicGroups">, initialStage: DeleteStage): Promise<{ done: boolean }> {
  const reschedule = async (stage: DeleteStage) => {
    await ctx.scheduler.runAfter(0, internal.modules.thematicGroups.thematicGroups.continueDeleteGroup, { groupId: group._id, stage })
    return { done: false }
  }
  let stage = initialStage
  for (;;) {
    if (stage === "posts") {
      const result = await deleteNextGroupPost(ctx, group)
      if (result === "none") {
        stage = "members"
        continue
      }
      return await reschedule(stage)
    }
    if (stage === "members") {
      const rows = await ctx.db
        .query("thematicGroupMembers")
        .withIndex("by_group_leftAt_joinedAt", (q) => q.eq("groupId", group._id))
        .take(DELETE_BATCH)
      for (const row of rows) {
        await unrecordGroupMember(ctx, { _id: row._id, groupId: group._id })
        await ctx.db.delete(row._id)
      }
      if (rows.length === DELETE_BATCH) return await reschedule(stage)
      stage = "invites"
      continue
    }
    if (stage === "invites") {
      const rows = await ctx.db
        .query("thematicGroupInvites")
        .withIndex("by_group_and_status", (q) => q.eq("groupId", group._id))
        .take(DELETE_BATCH)
      for (const row of rows) await ctx.db.delete(row._id)
      if (rows.length === DELETE_BATCH) return await reschedule(stage)
      stage = "final"
      continue
    }
    await ctx.db.delete(group._id)
    return { done: true }
  }
}

/** Continuation interne, idempotente, d'une suppression volumineuse. */
export const continueDeleteGroup = internalMutation({
  args: { groupId: v.id("thematicGroups"), stage: deleteStageValidator },
  returns: v.object({ done: v.boolean() }),
  handler: async (ctx, args) => {
    const group = await ctx.db.get(args.groupId)
    if (!group) return { done: true }
    if (group.deletingAt === undefined) return { done: false }
    return await deleteCascadeBatch(ctx, group, args.stage)
  },
})

/** Suppression définitive — owner seul, fermée sur-le-champ puis purgée par lots. */
export const deleteGroup = networkMutation({
  minStatus: "declaree",
  args: { groupId: v.id("thematicGroups") },
  returns: v.object({ deleted: v.literal(true), pending: v.boolean() }),
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, "group.manage", ctx.person._id)
    const existing = await ctx.db.get(args.groupId)
    if (!existing || existing.networkId !== ctx.networkId) return notFound()
    // DG-010 V1 : fermeture non destructive ; la ligne garde l'unicité par association.
    if (existing.associationPageId !== undefined) return notFound()
    if (existing.deletingAt !== undefined) {
      // Le rejeu revient au créateur ou au propriétaire du moment (après un transfert, PG-02).
      const replayedByOwner = existing.createdByPersonId === ctx.person._id || (await liveThematicGroupMembership(ctx, existing._id, ctx.person._id))?.role === "owner"
      return replayedByOwner ? { deleted: true as const, pending: true } : notFound()
    }
    const group = await requireOwner(ctx, ctx.networkId, args.groupId, ctx.person._id)
    const now = Date.now()
    await ctx.db.patch(group._id, { pinnedPostId: undefined, closedAt: group.closedAt ?? now, archivedAt: group.archivedAt ?? now, deletingAt: now, updatedAt: now })
    const closing = { ...group, deletingAt: now }
    const result = await deleteCascadeBatch(ctx, closing, "posts")
    return { deleted: true as const, pending: !result.done }
  },
})

// ═══════════════════════════════════════════════════════════════
// Règles et propriété (owner, PG-02)
// ═══════════════════════════════════════════════════════════════

/**
 * Le propriétaire d'un groupe ACTIF, hors groupe d'adhérents d'une page : les
 * règles et la propriété d'un groupe d'association se décident dans la page
 * (comme ses rôles, `setMemberRole`). Groupe fermé ou archivé : refus
 * indistinct, comme tout acte de rôle sur un groupe gelé.
 */
async function requireActiveOwner(ctx: ReadCtx, networkId: Id<"networks">, groupId: Id<"thematicGroups">, personId: Id<"persons">) {
  const { group, membership } = await requireLiveThematicGroupMembership(ctx, networkId, groupId, personId)
  if (group.associationPageId !== undefined || membership.role !== "owner") return fail("groupRoleRequired")
  return { group, membership }
}

/**
 * La personne peut-elle DEVENIR propriétaire ? Membre du réseau au statut des
 * gestes de propriétaire (`declaree`), sans sanction qui l'empêche d'écrire
 * dans ce réseau, ni effacée ni en instance d'effacement, sans blocage avec le
 * propriétaire actuel. Une seule réponse pour tous les manquements.
 */
async function canBecomeGroupOwner(ctx: ReadCtx, networkId: Id<"networks">, ownerPersonId: Id<"persons">, targetPersonId: Id<"persons">): Promise<boolean> {
  const person = await ctx.db.get(targetPersonId)
  if (!person || person.erasedAt !== undefined || person.deletionRequestedAt !== undefined) return false
  if (!(await memberHasStatus(ctx, networkId, targetPersonId, "declaree"))) return false
  try {
    await assertSocialWriteAllowed(ctx, networkId, targetPersonId)
  } catch {
    return false
  }
  return !(await isBlockedBetween(ctx, ownerPersonId, targetPersonId))
}

/**
 * Poser, modifier ou retirer les RÈGLES du groupe — le propriétaire seul.
 * Texte borné (même garde que la description : la borne du domaine, sous les
 * gardes d'écriture du réseau). Chaque changement émet une version nouvelle ;
 * un texte identique n'en émet aucune. L'auteur accepte d'office la version
 * qu'il pose. Les membres actuels RESTENT membres : la fiche leur montre la
 * version nouvelle jusqu'à ce qu'ils l'acceptent (`acceptGroupRules`).
 */
export const setGroupRules = networkMutation({
  minStatus: "declaree",
  args: { groupId: v.id("thematicGroups"), rules: v.optional(v.string()) },
  returns: v.object({ rulesVersion: v.union(v.number(), v.null()), changed: v.boolean() }),
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, "group.manage", ctx.person._id)
    const { group, membership } = await requireActiveOwner(ctx, ctx.networkId, args.groupId, ctx.person._id)
    const rules = checked(() => assertThematicGroupRules(args.rules))
    if (rules === group.rules) return { rulesVersion: thematicGroupRulesVersionInForce(group), changed: false }
    const now = Date.now()
    const version = nextThematicGroupRulesVersion(group.rulesVersion)
    await ctx.db.patch(group._id, { rules, rulesVersion: version, rulesUpdatedAt: now, updatedAt: now })
    if (rules !== undefined) await ctx.db.patch(membership._id, { acceptedRulesVersion: version, acceptedRulesAt: now })
    return { rulesVersion: rules === undefined ? null : version, changed: true }
  },
})

/**
 * Un MEMBRE accepte la version des règles qu'il a lue — celle en vigueur, et
 * elle seule (une version périmée est refusée, traduite). Idempotent. Sans
 * règles en vigueur, rien à accepter.
 */
export const acceptGroupRules = networkMutation({
  minStatus: "declaree",
  args: { groupId: v.id("thematicGroups"), rulesVersion: v.number() },
  returns: v.object({ accepted: v.boolean() }),
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, "group.join", ctx.person._id)
    const { group, membership } = await requireLiveThematicGroupMembership(ctx, ctx.networkId, args.groupId, ctx.person._id)
    const inForce = thematicGroupRulesVersionInForce(group)
    if (inForce === null) return { accepted: false }
    checked(() => assertThematicGroupRulesAccepted({ rulesVersion: inForce, acceptedRulesVersion: args.rulesVersion }))
    if (membership.acceptedRulesVersion !== inForce) await ctx.db.patch(membership._id, { acceptedRulesVersion: inForce, acceptedRulesAt: Date.now() })
    return { accepted: true }
  },
})

/**
 * TRANSMETTRE la propriété — du propriétaire vers un MODÉRATEUR éligible du
 * groupe (`canBecomeGroupOwner`). L'ancien propriétaire devient modérateur, et
 * peut alors quitter le groupe. Tout manquement de la cible rend la même règle
 * (`GROUP_TRANSFER_TARGET_INELIGIBLE`) : ni le blocage, ni la sanction, ni
 * l'effacement ne se devinent. Le module ne tient pas de journal propre ;
 * aucune cloche n'est émise ici.
 */
export const transferGroupOwnership = networkMutation({
  minStatus: "declaree",
  args: { groupId: v.id("thematicGroups"), newOwnerPersonId: v.id("persons") },
  returns: v.object({ transferred: v.literal(true) }),
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, "group.manage", ctx.person._id)
    const { group, membership: mine } = await requireActiveOwner(ctx, ctx.networkId, args.groupId, ctx.person._id)
    const isSelf = args.newOwnerPersonId === ctx.person._id
    const target = isSelf ? null : await liveThematicGroupMembership(ctx, group._id, args.newOwnerPersonId)
    const eligible =
      target !== null &&
      canTransferThematicGroupOwnership({ actorRole: mine.role, targetRole: target.role, isSelf }) &&
      (await canBecomeGroupOwner(ctx, ctx.networkId, ctx.person._id, args.newOwnerPersonId))
    if (!eligible || target === null) return failRule("GROUP_TRANSFER_TARGET_INELIGIBLE")
    const now = Date.now()
    await ctx.db.patch(target._id, { role: "owner" })
    await ctx.db.patch(mine._id, { role: "moderator" })
    await ctx.db.patch(group._id, { updatedAt: now })
    return { transferred: true as const }
  },
})

const transferCandidateValidator = v.object({
  personId: v.id("persons"),
  handle: v.union(v.string(), v.null()),
  displayName: v.union(v.string(), v.null()),
  avatarUrl: v.union(v.string(), v.null()),
})

/**
 * Les modérateurs à qui le propriétaire PEUT transmettre son rôle — jugés
 * personne par personne comme le fera `transferGroupOwnership`. Réservé au
 * propriétaire. Borné (`TRANSFER_CANDIDATES_MAX`), la lacune se dit ; une
 * ligne lue ici n'est PAS une autorisation : le transfert re-juge tout.
 */
export const listTransferCandidates = networkQuery({
  args: { groupId: v.id("thematicGroups") },
  returns: v.object({ items: v.array(transferCandidateValidator), truncated: v.boolean() }),
  handler: async (ctx, args) => {
    const { group } = await requireActiveOwner(ctx, ctx.networkId, args.groupId, ctx.person._id)
    const rows = await ctx.db
      .query("thematicGroupMembers")
      .withIndex("by_group_role_leftAt", (q) => q.eq("groupId", group._id).eq("role", "moderator").eq("leftAt", undefined))
      .take(TRANSFER_CANDIDATES_MAX + 1)
    const profileOf = miniProfileCache(ctx)
    const items: Infer<typeof transferCandidateValidator>[] = []
    for (const row of rows.slice(0, TRANSFER_CANDIDATES_MAX)) {
      if (row.networkId !== group.networkId || !(await canBecomeGroupOwner(ctx, ctx.networkId, ctx.person._id, row.personId))) continue
      const profile = await profileOf(row.personId)
      items.push({ personId: row.personId, handle: profile.handle, displayName: profile.displayName, avatarUrl: profile.avatarUrl })
    }
    items.sort((a, b) => (a.displayName ?? a.handle ?? "").localeCompare(b.displayName ?? b.handle ?? "", "fr"))
    return { items, truncated: rows.length > TRANSFER_CANDIDATES_MAX }
  },
})

// ═══════════════════════════════════════════════════════════════
// Invitations
// ═══════════════════════════════════════════════════════════════

/**
 * Inviter une CONNEXION, par identifiant — réservé aux membres vivants. Chaque
 * manquement (inconnue, soi-même, non connectée, blocage) rend LE MÊME refus.
 * Une ligne par (groupe, invité) : réinviter rafraîchit (`alreadyInvited`) ou
 * rouvre une ligne déclinée ; un membre vivant n'est jamais invité.
 */
export const invite = networkMutation({
  minStatus: "declaree",
  args: { groupId: v.id("thematicGroups"), handle: v.string() },
  returns: v.object({ invited: v.boolean(), alreadyInvited: v.boolean() }),
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, "group.invite", ctx.person._id)
    const { group } = await requireLiveThematicGroupMembership(ctx, ctx.networkId, args.groupId, ctx.person._id)
    const found = await findPublishedPersonByHandle(ctx, ctx.networkId, args.handle)
    if (!found || found._id === ctx.person._id) return notFound()
    const inviteePersonId = found._id
    if (!(await canDiscoverThematicGroup(ctx, group, inviteePersonId))) return notFound()
    if (!(await isConnectedTo(ctx, ctx.networkId, ctx.person._id, inviteePersonId)) || (await isBlockedBetween(ctx, ctx.person._id, inviteePersonId))) return notFound()
    if (await liveThematicGroupMembership(ctx, args.groupId, inviteePersonId)) return { invited: false, alreadyInvited: false }

    const now = Date.now()
    const existing = await ctx.db
      .query("thematicGroupInvites")
      .withIndex("by_group_and_invitee", (q) => q.eq("groupId", args.groupId).eq("inviteePersonId", inviteePersonId))
      .unique()
    // Seule une ligne EN ATTENTE fait un rappel ; une invitation déclinée qu'on rouvre est neuve.
    const alreadyInvited = existing?.status === "pending"
    if (existing) {
      await ctx.db.patch(existing._id, { status: "pending", invitedByPersonId: ctx.person._id, createdAt: now, respondedAt: undefined })
    } else {
      await ctx.db.insert("thematicGroupInvites", { networkId: ctx.networkId, groupId: args.groupId, inviteePersonId, invitedByPersonId: ctx.person._id, status: "pending", createdAt: now })
    }
    await notifyPerson(ctx, { networkId: ctx.networkId, recipientPersonId: inviteePersonId, actorPersonId: ctx.person._id, kind: "thematic_group_invite", subject: { thematicGroup: args.groupId } })
    return { invited: true, alreadyInvited }
  },
})

const inviteCandidateValidator = v.object({
  personId: v.id("persons"),
  handle: v.string(),
  displayName: v.union(v.string(), v.null()),
  headline: v.union(v.string(), v.null()),
  avatarUrl: v.union(v.string(), v.null()),
  status: v.union(v.literal("eligible"), v.literal("member"), v.literal("invited")),
})

/**
 * MES connexions dans le réseau, et où chacune en est avec CE groupe — ce que
 * `invite` acceptera, et ce qui est déjà fait. Réservé aux membres vivants.
 * Borné (`INVITE_CANDIDATES_MAX`), la lacune se dit (`truncated`) ; un statut
 * lu ici n'est PAS une autorisation : `invite` re-juge tout.
 */
export const listInviteCandidates = networkQuery({
  args: { groupId: v.id("thematicGroups") },
  returns: v.object({ items: v.array(inviteCandidateValidator), truncated: v.boolean() }),
  handler: async (ctx, args) => {
    const { group } = await requireLiveThematicGroupMembership(ctx, ctx.networkId, args.groupId, ctx.person._id)
    const connections = await acceptedCounterpartIds(ctx, ctx.networkId, ctx.person._id)
    const profileOf = miniProfileCache(ctx)
    const items: Infer<typeof inviteCandidateValidator>[] = []
    let truncated = connections.truncated
    for (const id of connections.ids) {
      if (items.length >= INVITE_CANDIDATES_MAX) {
        truncated = true
        break
      }
      const personId = id as Id<"persons">
      if (!(await canDiscoverThematicGroup(ctx, group, personId))) continue
      const person = await profileOf(personId)
      // Sans identifiant publié, pas d'adresse à donner à `invite`.
      if (!person.hasPublishedProfile || person.handle === null) continue
      const [membership, pending] = await Promise.all([
        liveThematicGroupMembership(ctx, args.groupId, personId),
        ctx.db
          .query("thematicGroupInvites")
          .withIndex("by_group_and_invitee", (q) => q.eq("groupId", args.groupId).eq("inviteePersonId", personId))
          .unique(),
      ])
      items.push({
        personId,
        handle: person.handle,
        displayName: person.displayName,
        headline: person.headline,
        avatarUrl: person.avatarUrl,
        status: membership ? "member" : pending?.status === "pending" ? "invited" : "eligible",
      })
    }
    items.sort((a, b) => (a.displayName ?? a.handle).localeCompare(b.displayName ?? b.handle, "fr"))
    return { items, truncated }
  },
})

/**
 * Répondre à MON invitation — refus indistinct pour la ligne d'autrui, la
 * référence inventée ou la réponse déjà donnée. Accepter rejoint, sous réserve
 * des règles du groupe s'il en a (`acceptedRulesVersion`, comme `join` : rien
 * n'est consommé tant qu'elles ne sont pas acceptées) ; décliner n'émet rien.
 * Dans les deux cas, ma cloche se RÉSOUT (toutes ses lignes, quel que soit
 * l'invitant).
 */
export const respondInvite = networkMutation({
  minStatus: "declaree",
  args: { inviteId: v.id("thematicGroupInvites"), accept: v.boolean(), acceptedRulesVersion: v.optional(v.number()) },
  returns: v.object({ joined: v.boolean() }),
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, "group.join", ctx.person._id)
    const pending = await ctx.db.get(args.inviteId)
    if (!pending || pending.networkId !== ctx.networkId || pending.inviteePersonId !== ctx.person._id || pending.status !== "pending") return notFound()
    const now = Date.now()
    const settle = (resolution: "accepted" | "declined") =>
      resolveNotifications(ctx, { networkId: ctx.networkId, recipientPersonId: ctx.person._id, kind: "thematic_group_invite", subject: { thematicGroup: pending.groupId }, resolution, at: now })
    if (!args.accept) {
      await ctx.db.patch(pending._id, { status: "declined", respondedAt: now })
      await settle("declined")
      return { joined: false }
    }
    const group = await groupInNetwork(ctx, ctx.networkId, pending.groupId)
    if (!group || !isActiveThematicGroup(group)) return notFound()
    // Déjà membre entre-temps : aucune règle à re-juger, l'invitation se résout seulement.
    const accepted = (await liveThematicGroupMembership(ctx, group._id, ctx.person._id)) ? undefined : rulesAcceptedOnEntry(group, args.acceptedRulesVersion)
    await ctx.db.patch(pending._id, { status: "accepted", respondedAt: now })
    await settle("accepted")
    await admitMember(ctx, group, ctx.person._id, now, accepted)
    return { joined: true }
  },
})

export type MyInviteDto = {
  inviteId: Id<"thematicGroupInvites">
  groupId: Id<"thematicGroups">
  groupName: string
  memberCount: number
  /** La version des règles en vigueur — `null` : aucune règle, l'invitation s'accepte d'un geste (PG-02). */
  rulesVersion: number | null
  invitedBy: Pick<PersonMiniProfile, "personId" | "displayName" | "handle" | "avatarUrl">
  createdAt: number
}

/** MES invitations en attente dans le réseau — le groupe et qui m'invite, rien d'autre. Paginées. */
export const paginateMyInvites = networkQuery({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args): Promise<PaginationResult<MyInviteDto>> => {
    const result = await ctx.db
      .query("thematicGroupInvites")
      .withIndex("by_network_invitee_status", (q) => q.eq("networkId", ctx.networkId).eq("inviteePersonId", ctx.person._id).eq("status", "pending"))
      .order("desc")
      .paginate(args.paginationOpts)
    const profileOf = miniProfileCache(ctx)
    const page: MyInviteDto[] = []
    for (const row of result.page) {
      const group = await ctx.db.get(row.groupId)
      if (!group || group.networkId !== ctx.networkId || !isActiveThematicGroup(group) || !(await canDiscoverThematicGroup(ctx, group, ctx.person._id))) continue
      const inviter = await profileOf(row.invitedByPersonId)
      page.push({
        inviteId: row._id,
        groupId: row.groupId,
        groupName: group.name,
        memberCount: await countGroupMembers(ctx, group._id),
        rulesVersion: thematicGroupRulesVersionInForce(group),
        invitedBy: { personId: inviter.personId, displayName: inviter.displayName, handle: inviter.handle, avatarUrl: inviter.avatarUrl },
        createdAt: row.createdAt,
      })
    }
    return { ...result, page }
  },
})

// ═══════════════════════════════════════════════════════════════
// Rôles et effectif
// ═══════════════════════════════════════════════════════════════

/** Promouvoir ou rétrograder (`moderator` ↔ `member`) — le seul `owner`, jamais sur un `owner`. */
export const setMemberRole = networkMutation({
  minStatus: "declaree",
  args: { groupId: v.id("thematicGroups"), memberPersonId: v.id("persons"), role: v.union(v.literal("moderator"), v.literal("member")) },
  returns: v.object({ role: v.union(v.literal("moderator"), v.literal("member")) }),
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, "group.moderate", ctx.person._id)
    const { group, membership: mine } = await requireLiveThematicGroupMembership(ctx, ctx.networkId, args.groupId, ctx.person._id)
    // Les rôles associatifs se changent dans la page ou l'adhésion, jamais dans cette copie.
    if (group.associationPageId !== undefined) return fail("groupRoleRequired")
    const target = await liveThematicGroupMembership(ctx, args.groupId, args.memberPersonId)
    if (!target) return notFound()
    if (!canSetThematicGroupRole({ actorRole: mine.role, targetRole: target.role })) return fail("groupRoleRequired")
    if (target.role !== args.role) await ctx.db.patch(target._id, { role: args.role })
    return { role: args.role }
  },
})

/** Retirer un membre — la matrice du domaine : l'owner retire n'importe qui d'autre, un modérateur les simples membres. */
export const removeMember = networkMutation({
  minStatus: "declaree",
  args: { groupId: v.id("thematicGroups"), memberPersonId: v.id("persons") },
  returns: v.object({ removed: v.literal(true) }),
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, "group.moderate", ctx.person._id)
    const { group, membership: mine } = await requireLiveThematicGroupMembership(ctx, ctx.networkId, args.groupId, ctx.person._id)
    const target = await liveThematicGroupMembership(ctx, args.groupId, args.memberPersonId)
    if (!target) return notFound()
    if (!canRemoveThematicGroupMember({ actorRole: mine.role, targetRole: target.role, isSelf: args.memberPersonId === ctx.person._id })) return fail("groupRoleRequired")
    await closeMembership(ctx, group, target, Date.now())
    return { removed: true as const }
  },
})

export type GroupMemberDto = {
  personId: Id<"persons">
  role: ThematicGroupRole
  joinedAt: number
  displayName: string | null
  handle: string | null
  headline: string | null
  avatarUrl: string | null
}

/**
 * Les membres vivants, par ancienneté — réservé aux membres : l'effectif est
 * public (un chiffre), la LISTE nominative ne l'est pas. Paginée (D19).
 */
export const paginateMembers = networkQuery({
  args: { groupId: v.id("thematicGroups"), paginationOpts: paginationOptsValidator },
  handler: async (ctx, args): Promise<PaginationResult<GroupMemberDto>> => {
    await requireLiveThematicGroupMembership(ctx, ctx.networkId, args.groupId, ctx.person._id)
    const result = await ctx.db
      .query("thematicGroupMembers")
      .withIndex("by_group_leftAt_joinedAt", (q) => q.eq("groupId", args.groupId).eq("leftAt", undefined))
      .paginate(args.paginationOpts)
    const profileOf = miniProfileCache(ctx)
    const page: GroupMemberDto[] = []
    for (const row of result.page) {
      const membership = await liveThematicGroupMembership(ctx, args.groupId, row.personId)
      if (!membership) continue
      const profile = await profileOf(row.personId)
      page.push({ personId: row.personId, role: membership.role, joinedAt: row.joinedAt, displayName: profile.displayName, handle: profile.handle, headline: profile.headline, avatarUrl: profile.avatarUrl })
    }
    return { ...result, page }
  },
})

// ═══════════════════════════════════════════════════════════════
// Découverte et fiche
// ═══════════════════════════════════════════════════════════════

const groupStateValidator = v.union(v.literal("active"), v.literal("closed"), v.literal("archived"))
const groupCardValidator = v.object({
  groupId: v.id("thematicGroups"),
  name: v.string(),
  description: v.union(v.string(), v.null()),
  /** Le pays du groupe — `null` : tout le réseau. */
  country: v.union(v.string(), v.null()),
  /** La page d'association dont c'est le groupe d'adhérents — `null` sans page, ou page retirée. */
  associationPage: v.union(pageCardValidator, v.null()),
  memberCount: v.number(),
  state: groupStateValidator,
  /** La version des règles en vigueur — `null` : aucune règle, l'adhésion est libre (PG-02). */
  rulesVersion: v.union(v.number(), v.null()),
  /** MON rôle — `null` si je n'en suis pas membre vivant. */
  myRole: v.union(v.literal("owner"), v.literal("moderator"), v.literal("member"), v.null()),
  /** Une invitation m'attend sur ce groupe. */
  invited: v.boolean(),
  createdAt: v.number(),
})
type GroupCard = Infer<typeof groupCardValidator>

function stateOf(group: Doc<"thematicGroups">): GroupCard["state"] {
  if (group.archivedAt !== undefined) return "archived"
  if (group.closedAt !== undefined) return "closed"
  return "active"
}

/** Mes appartenances et mes invitations dans le réseau, lues UNE fois par page — jamais par carte. */
async function myGroupStates(ctx: ReadCtx, networkId: Id<"networks">, personId: Id<"persons">) {
  const [memberships, invites] = await Promise.all([
    ctx.db
      .query("thematicGroupMembers")
      .withIndex("by_network_person_leftAt", (q) => q.eq("networkId", networkId).eq("personId", personId).eq("leftAt", undefined))
      .take(MY_GROUPS_SCAN + 1),
    ctx.db
      .query("thematicGroupInvites")
      .withIndex("by_network_invitee_status", (q) => q.eq("networkId", networkId).eq("inviteePersonId", personId).eq("status", "pending"))
      .take(INVITES_SCAN),
  ])
  return {
    personId,
    memberships: memberships.slice(0, MY_GROUPS_SCAN),
    truncated: memberships.length > MY_GROUPS_SCAN,
    invitedGroups: new Set<string>(invites.map((row) => row.groupId)),
  }
}

/** La carte de la page d'association d'un groupe, si elle est servable. */
async function associationPageOf(ctx: QueryCtx, group: Doc<"thematicGroups">, personId: Id<"persons">): Promise<PageCard | null> {
  if (group.associationPageId === undefined) return null
  const page = await associationGroupPageOrNull(ctx, group.networkId, group.associationPageId, personId)
  return page ? await pageCardOf(ctx, page) : null
}

async function toCard(ctx: QueryCtx, group: Doc<"thematicGroups">, states: Awaited<ReturnType<typeof myGroupStates>>): Promise<GroupCard> {
  return {
    groupId: group._id,
    name: group.name,
    description: group.description ?? null,
    country: group.country ?? null,
    associationPage: await associationPageOf(ctx, group, states.personId),
    memberCount: await countGroupMembers(ctx, group._id),
    state: stateOf(group),
    rulesVersion: thematicGroupRulesVersionInForce(group),
    myRole: (await liveThematicGroupMembership(ctx, group._id, states.personId))?.role ?? null,
    invited: states.invitedGroups.has(group._id),
    createdAt: group.createdAt,
  }
}

/**
 * DÉCOUVRIR les groupes du réseau — les plus récents sans requête, la recherche
 * (nom, description) sinon. Avec un PAYS : ses groupes et ceux sans pays (tout
 * le réseau), jamais ceux d'un autre pays. Avec une PAGE : ses groupes
 * d'adhérents, les plus récents.
 */
export const discover = networkQuery({
  args: { query: v.optional(v.string()), country: v.optional(v.string()), associationPageId: v.optional(v.id("pages")) },
  returns: v.array(groupCardValidator),
  handler: async (ctx, args) => {
    const query = foldSearchQuery(args.query ?? "")
    const country = args.country === undefined ? undefined : checked(() => assertCountryCode(args.country ?? ""))
    const inCountry = (group: Doc<"thematicGroups">) => country === undefined || group.country === undefined || group.country === country
    let groups: Doc<"thematicGroups">[]
    if (args.associationPageId !== undefined) {
      const pageId = args.associationPageId
      groups = await ctx.db
        .query("thematicGroups")
        .withIndex("by_network_associationPage_createdAt", (q) => q.eq("networkId", ctx.networkId).eq("associationPageId", pageId))
        .order("desc")
        .take(DISCOVER_RECENT_LIMIT)
    } else if (query.length >= DISCOVER_QUERY_MIN) {
      // Borné avant le filtre de pays : la recherche rend une fenêtre, le pays la restreint.
      const found = await ctx.db
        .query("thematicGroups")
        .withSearchIndex("search_name", (q) => q.search("searchText", query).eq("networkId", ctx.networkId))
        .take(DISCOVER_SEARCH_LIMIT * 3)
      groups = found.filter(inCountry).slice(0, DISCOVER_SEARCH_LIMIT)
    } else if (country !== undefined) {
      const [ofCountry, everywhere] = await Promise.all(
        [country, undefined].map(
          async (value) =>
            await ctx.db
              .query("thematicGroups")
              .withIndex("by_network_country_createdAt", (q) => q.eq("networkId", ctx.networkId).eq("country", value))
              .order("desc")
              .take(DISCOVER_RECENT_LIMIT),
        ),
      )
      groups = [...(ofCountry ?? []), ...(everywhere ?? [])].sort((left, right) => right.createdAt - left.createdAt).slice(0, DISCOVER_RECENT_LIMIT)
    } else {
      groups = await ctx.db
        .query("thematicGroups")
        .withIndex("by_network_createdAt", (q) => q.eq("networkId", ctx.networkId))
        .order("desc")
        .take(DISCOVER_RECENT_LIMIT)
    }
    const states = await myGroupStates(ctx, ctx.networkId, ctx.person._id)
    const cards: GroupCard[] = []
    for (const group of groups) if (isActiveThematicGroup(group) && await canDiscoverThematicGroup(ctx, group, ctx.person._id)) cards.push(await toCard(ctx, group, states))
    return cards
  },
})

/** MES groupes du réseau, par activité récente ; bornés, avec la lacune (`truncated`). */
export const myGroups = networkQuery({
  args: {},
  returns: v.object({ items: v.array(groupCardValidator), truncated: v.boolean() }),
  handler: async (ctx) => {
    const states = await myGroupStates(ctx, ctx.networkId, ctx.person._id)
    const groups: Doc<"thematicGroups">[] = []
    for (const membership of states.memberships) {
      const group = await ctx.db.get(membership.groupId)
      if (group && group.networkId === ctx.networkId && group.deletingAt === undefined && await canDiscoverThematicGroup(ctx, group, ctx.person._id)) groups.push(group)
    }
    groups.sort((left, right) => right.updatedAt - left.updatedAt)
    const items: GroupCard[] = []
    for (const group of groups) items.push(await toCard(ctx, group, states))
    return { items, truncated: states.truncated }
  },
})

/**
 * La FICHE d'un groupe — lisible par tout membre du réseau. L'épinglée n'y
 * transite que re-gardée : elle disparaît d'elle-même pour un non-membre.
 */
export const getGroup = networkQuery({
  args: { groupId: v.id("thematicGroups") },
  returns: v.object({
    ...groupCardValidator.fields,
    /** Mon invitation en attente, s'il y en a une. */
    pendingInviteId: v.union(v.id("thematicGroupInvites"), v.null()),
    pinned: v.union(feedItemValidator, v.null()),
    /** Les règles en vigueur, lisibles de tout membre du réseau AVANT d'entrer (PG-02) — `null` sans règles. */
    rules: v.union(v.string(), v.null()),
    rulesUpdatedAt: v.union(v.number(), v.null()),
    /** La version que J'AI acceptée — `null` si aucune (ou pas membre). */
    myAcceptedRulesVersion: v.union(v.number(), v.null()),
    /** Les outils du propriétaire (règles, transfert, fermer, archiver, supprimer) me sont ouverts — le serveur re-juge chaque geste. */
    canManage: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const group = await groupInNetwork(ctx, ctx.networkId, args.groupId)
    if (!group || !(await canDiscoverThematicGroup(ctx, group, ctx.person._id))) return notFound()
    const reader = readerOf(ctx)
    const [membership, invitation] = await Promise.all([
      liveThematicGroupMembership(ctx, group._id, ctx.person._id),
      ctx.db
        .query("thematicGroupInvites")
        .withIndex("by_group_and_invitee", (q) => q.eq("groupId", group._id).eq("inviteePersonId", ctx.person._id))
        .unique(),
    ])
    let pinned: FeedItem | null = null
    if (group.pinnedPostId !== undefined) {
      const post = await ctx.db.get(group.pinnedPostId)
      if (post && post.groupId === group._id && (await canSeePostDoc(ctx, reader, post))) {
        pinned = await toFeedItem(ctx, post, reader, groupViewingReasonFor({ isAuthor: post.authorPersonId === ctx.person._id }), enrichment(ctx))
      }
    }
    const rulesVersion = thematicGroupRulesVersionInForce(group)
    return {
      groupId: group._id,
      name: group.name,
      description: group.description ?? null,
      country: group.country ?? null,
      associationPage: await associationPageOf(ctx, group, ctx.person._id),
      memberCount: await countGroupMembers(ctx, group._id),
      state: stateOf(group),
      rulesVersion,
      myRole: membership?.role ?? null,
      invited: invitation?.status === "pending",
      createdAt: group.createdAt,
      pendingInviteId: invitation?.status === "pending" ? invitation._id : null,
      pinned,
      rules: rulesVersion === null ? null : (group.rules ?? null),
      rulesUpdatedAt: group.rulesUpdatedAt ?? null,
      myAcceptedRulesVersion: membership?.acceptedRulesVersion ?? null,
      canManage: membership?.role === "owner" && group.associationPageId === undefined,
    }
  },
})

// ═══════════════════════════════════════════════════════════════
// Le MUR du groupe
// ═══════════════════════════════════════════════════════════════

/**
 * Le mur d'un groupe — réservé aux membres vivants. MÊME architecture que le
 * fil (sélection à froid, enrichissement de la page seule, curseur COMPOSITE
 * sur la dernière ligne examinée) et mêmes égards : les publications d'un
 * auteur bloqué sont écartées (l'appartenance commune ne contourne pas un
 * blocage), les publications masquées ne reviennent pas. La sourdine ne vaut
 * qu'au fil.
 */
export const groupWall = networkQuery({
  args: { groupId: v.id("thematicGroups"), cursor: v.optional(cursorValidator), limit: v.optional(v.number()) },
  returns: v.object({ items: v.array(feedItemValidator), nextCursor: v.union(cursorValidator, v.null()) }),
  handler: async (ctx, args) => {
    const { group } = await requireLiveThematicGroupMembership(ctx, ctx.networkId, args.groupId, ctx.person._id)
    const reader = readerOf(ctx)
    const limit = clampLimit(args.limit)
    const [blocked, hidden, marks, cursorCreationTime] = await Promise.all([
      blockedCounterpartIds(ctx, ctx.person._id),
      hiddenPostIds(ctx, ctx.networkId, ctx.person._id),
      readerMarks(ctx, ctx.networkId, ctx.person._id),
      cursorCreationTimeOf(ctx, args.cursor),
    ])
    const selected: Doc<"posts">[] = []
    let lastExamined: Doc<"posts"> | null = null
    let exhausted = false
    let windowCursor: PersonalFeedCursor<Id<"posts">> | undefined = args.cursor
    let windowCreationTime = cursorCreationTime
    for (let pass = 0; pass < WALL_WINDOWS_MAX; pass += 1) {
      const window = await feedWindow(groupReader(ctx, ctx.networkId, args.groupId), FEED_AUTHOR_SCAN, windowCursor, windowCreationTime)
      for (const post of window.rows) {
        lastExamined = post
        if (!hasNativePostAuthor(post)) continue
        if (!(await canSeePostDoc(ctx, reader, post))) continue
        if (group.associationPageId !== undefined && (await contentState(ctx, "post", post._id))?.status !== "published") continue
        if (post.authorPersonId !== ctx.person._id) {
          if (blocked.ids.has(post.authorPersonId)) continue
          if (blocked.truncated && (await isBlockedBetween(ctx, ctx.person._id, post.authorPersonId))) continue
        }
        if (hidden.ids.has(post._id)) continue
        selected.push(post)
        if (selected.length >= limit) break
      }
      if (selected.length >= limit) break
      if (!window.wasFull) {
        exhausted = true
        break
      }
      const frontier = window.rows[window.rows.length - 1]
      if (frontier === undefined) {
        exhausted = true
        break
      }
      windowCursor = cursorForFeedPost(frontier)
      windowCreationTime = frontier._creationTime
    }
    const enrich = enrichment(ctx, marks)
    const items: FeedItem[] = []
    for (const post of selected) items.push(await toFeedItem(ctx, post, reader, groupViewingReasonFor({ isAuthor: post.authorPersonId === ctx.person._id }), enrich))
    return { items, nextCursor: exhausted || lastExamined === null ? null : cursorForFeedPost(lastExamined) }
  },
})

// ═══════════════════════════════════════════════════════════════
// Modération de groupe — épingler, retirer (owner, moderator)
// ═══════════════════════════════════════════════════════════════

async function requireGroupModerator(ctx: ReadCtx, networkId: Id<"networks">, groupId: Id<"thematicGroups">, personId: Id<"persons">) {
  const { group, membership } = await requireLiveThematicGroupMembership(ctx, networkId, groupId, personId)
  if (!isThematicGroupModerator(membership.role)) return fail("groupRoleRequired")
  return { group, membership }
}

/** Épingler une publication VIVANTE de CE groupe en tête du mur — autorité de modération. */
export const pinGroupPost = networkMutation({
  minStatus: "declaree",
  args: { groupId: v.id("thematicGroups"), postId: v.id("posts") },
  returns: v.object({ pinned: v.literal(true) }),
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, "group.moderate", ctx.person._id)
    const { group } = await requireGroupModerator(ctx, ctx.networkId, args.groupId, ctx.person._id)
    const post = await ctx.db.get(args.postId)
    if (!post || post.status !== "published" || post.groupId !== group._id) return notFound()
    await ctx.db.patch(group._id, { pinnedPostId: post._id, updatedAt: Date.now() })
    return { pinned: true as const }
  },
})

/** Dés-épingler — idempotent. */
export const unpinGroupPost = networkMutation({
  minStatus: "declaree",
  args: { groupId: v.id("thematicGroups") },
  returns: v.object({ pinned: v.literal(false) }),
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, "group.moderate", ctx.person._id)
    const { group } = await requireGroupModerator(ctx, ctx.networkId, args.groupId, ctx.person._id)
    if (group.pinnedPostId !== undefined) await ctx.db.patch(group._id, { pinnedPostId: undefined, updatedAt: Date.now() })
    return { pinned: false as const }
  },
})

/**
 * RETIRER une publication du groupe — l'autorité locale, qui s'AJOUTE à la
 * file du réseau sans s'y substituer. Retirée, pas supprimée : son auteur la
 * voit encore. Une publication hors groupe n'a pas de modérateur de groupe
 * (refus indistinct). Idempotent.
 */
export const removeGroupPost = networkMutation({
  minStatus: "declaree",
  args: { postId: v.id("posts") },
  returns: v.object({ removed: v.literal(true) }),
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, "group.moderate", ctx.person._id)
    const post = await ctx.db.get(args.postId)
    if (!post || post.groupId === undefined || post.networkId !== ctx.networkId) return notFound()
    const { group } = await requireGroupModerator(ctx, ctx.networkId, post.groupId, ctx.person._id)
    const now = Date.now()
    await markPostRemoved(ctx, post, now)
    if (group.pinnedPostId === post._id) await ctx.db.patch(group._id, { pinnedPostId: undefined, updatedAt: now })
    return { removed: true as const }
  },
})
