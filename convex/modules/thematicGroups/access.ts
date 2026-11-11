// Dupliqué de socle/convex/modules/reseauPersonnel/groupesThematiquesAccess.ts @ ad2e7fdc2 — adaptations : personnes ; libellés remplacés par des codes (`notFound`, `groupMembershipRequired`) ; le groupe doit appartenir au réseau de l'acte (le contrôle du réseau est chez l'appelant, qui passe son `networkId`) ; garde de la fiche partagée avec la destination de l'invitation (`servedThematicGroupOrNull`, NP-04).
/**
 * L'APPARTENANCE à un groupe thématique — les lectures que tout le monde
 * partage.
 *
 * Aucune fonction Convex ici : ce sont des aides, importées par la garde de
 * visibilité (`posts/access.ts`), par l'écriture d'une publication et par l'API
 * des groupes (lot 9). Les mettre ici évite le cycle d'imports, et garantit
 * qu'il n'existe qu'UNE définition de « membre vivant » : celle dont dépend
 * l'audience `group` du fil.
 */
import type { ThematicGroupRole } from "@antsia/social-domain/thematicGroups"

import type { Doc, Id } from "../../_generated/dataModel"
import type { QueryCtx } from "../../_generated/server"
import { isActiveMember } from "../../lib/access"
import { fail, notFound } from "../../lib/errors"
import { isFederatedPage } from "../federation/mirrorAccess"
import { canReadModeratedContent, contentState } from "../moderation/policy"
import { liveSignatoryRole, readablePageOrNull } from "../pages/access"

type ReadCtx = Pick<QueryCtx, "db">

/**
 * Un groupe fermé, archivé ou en cours de suppression n'ouvre plus aucun droit
 * social. La ligne peut demeurer pour l'archive ; les gardes, elles, ferment.
 */
export function isActiveThematicGroup(group: Doc<"thematicGroups">): boolean {
  return group.closedAt === undefined && group.archivedAt === undefined && group.deletingAt === undefined
}

/**
 * MC-01 (plan 12) : le groupe RETIRÉ par une décision de modération. Ce n'est ni
 * une fermeture, ni un archivage, ni une suppression : aucune colonne du groupe
 * ne bouge, ses membres, ses publications et ses règles restent, et une
 * restauration (recours admis) le rend tel quel. Seules les gardes ferment.
 */
export async function isThematicGroupRemovedByModeration(ctx: ReadCtx, groupId: Id<"thematicGroups">): Promise<boolean> {
  return (await contentState(ctx, "thematicGroup", groupId))?.status === "removed"
}

/**
 * La FICHE du groupe est-elle servie à ce lecteur ? Découvrable pour lui, ni
 * retirée par la modération, ni signalée par LUI (le masque du déclarant vaut
 * sur le lien direct aussi, comme pour tout contenu signalé).
 */
export async function isThematicGroupServedTo(ctx: ReadCtx, group: Doc<"thematicGroups">, personId: Id<"persons">): Promise<boolean> {
  return (await canDiscoverThematicGroup(ctx, group, personId)) && (await canReadModeratedContent(ctx, "thematicGroup", group._id, personId))
}

/**
 * NP-04 (issue #149) — LA garde de la fiche (`thematicGroups.getGroup`) : le groupe de CE réseau,
 * hors suppression en cours, servi à ce lecteur (`isThematicGroupServedTo`) ; `null` sinon. La
 * destination de l'invitation à un groupe la relit à l'identique : elle ne mène jamais à une fiche
 * qui se refuserait.
 */
export async function servedThematicGroupOrNull(ctx: ReadCtx, networkId: Id<"networks">, groupId: Id<"thematicGroups">, personId: Id<"persons">): Promise<Doc<"thematicGroups"> | null> {
  const group = await ctx.db.get(groupId)
  if (!group || group.networkId !== networkId || group.deletingAt !== undefined) return null
  return (await isThematicGroupServedTo(ctx, group, personId)) ? group : null
}

/** DG-010 : la page native d'association active et lisible dans SON réseau. */
export async function associationGroupPageOrNull(ctx: ReadCtx, networkId: Id<"networks">, pageId: Id<"pages">, personId: Id<"persons">): Promise<Doc<"pages"> | null> {
  const network = await ctx.db.get(networkId)
  if (!network || network.status !== "active") return null
  const page = await readablePageOrNull(ctx, network, pageId, personId)
  if (!page || page.networkId !== networkId || page.ownerKind !== "association" || await isFederatedPage(ctx, page._id)) return null
  return page
}

/**
 * DG-010 : éligibilité et autorité ACTUELLES, sans créer d'appartenance au groupe.
 * Une ligne d'association non acceptée ferme l'accès, même à un signataire.
 * Sans aucune ligne, un responsable vivant peut choisir de rejoindre.
 */
export async function associationGroupRoleOrNull(ctx: ReadCtx, group: Pick<Doc<"thematicGroups">, "networkId" | "associationPageId">, personId: Id<"persons">): Promise<ThematicGroupRole | null> {
  if (group.associationPageId === undefined) return null
  if (!(await isActiveMember(ctx, group.networkId, personId))) return null
  const page = await associationGroupPageOrNull(ctx, group.networkId, group.associationPageId, personId)
  if (!page) return null
  const association = await ctx.db.query("associationMemberships")
    .withIndex("by_network_and_page_and_person", (q) => q.eq("networkId", group.networkId).eq("pageId", page._id).eq("personId", personId)).unique()
  if (association && association.status !== "accepted") return null
  const signatory = await liveSignatoryRole(ctx, page, personId)
  if (signatory === "admin") return "owner"
  if (signatory === "signatory") return "moderator"
  if (!association) return null
  return association.role === "animator" ? "moderator" : "member"
}

/** La découverte privée n'est ouverte qu'aux personnes éligibles, même avant leur adhésion explicite. */
export async function canDiscoverThematicGroup(ctx: ReadCtx, group: Doc<"thematicGroups">, personId: Id<"persons">): Promise<boolean> {
  return group.associationPageId === undefined || (await associationGroupRoleOrNull(ctx, group, personId)) !== null
}

/** Les posts d'association n'ont aucune exception auteur, même via une URL ou un autre réseau. */
export async function canAccessAssociationGroupPost(ctx: ReadCtx, post: Pick<Doc<"posts">, "networkId" | "groupId">, personId: Id<"persons">, readingNetworkId: Id<"networks">): Promise<boolean> {
  if (post.groupId === undefined) return true
  const group = await ctx.db.get(post.groupId)
  if (!group) return false
  if (group.associationPageId === undefined) return true
  return group.networkId === post.networkId && readingNetworkId === group.networkId && isActiveThematicGroup(group)
    && !(await isThematicGroupRemovedByModeration(ctx, group._id))
    && (await liveThematicGroupMembership(ctx, group._id, personId)) !== null
}

/** La ligne d'appartenance VIVANTE d'une personne, ou `null`. */
export async function liveThematicGroupMembership(
  ctx: ReadCtx,
  groupId: Id<"thematicGroups">,
  personId: Id<"persons">,
): Promise<Doc<"thematicGroupMembers"> | null> {
  const row = await ctx.db
    .query("thematicGroupMembers")
    .withIndex("by_group_and_person", (q) => q.eq("groupId", groupId).eq("personId", personId))
    .unique()
  if (!row || row.leftAt !== undefined) return null
  const group = await ctx.db.get(groupId)
  if (!group || row.networkId !== group.networkId) return null
  if (group.associationPageId === undefined) return row
  const role = await associationGroupRoleOrNull(ctx, group, personId)
  return role === null ? null : { ...row, role }
}

/** Membre VIVANT d'un groupe vivant ? — la question que pose la garde d'audience `group`. */
export async function isLiveThematicGroupMember(ctx: ReadCtx, groupId: Id<"thematicGroups">, personId: Id<"persons">): Promise<boolean> {
  const group = await ctx.db.get(groupId)
  if (!group || !isActiveThematicGroup(group) || (await isThematicGroupRemovedByModeration(ctx, groupId))) return false
  return (await liveThematicGroupMembership(ctx, groupId, personId)) !== null
}

/**
 * Le groupe ET mon appartenance vivante — la garde des actes de MEMBRE.
 * Groupe inconnu, d'un autre réseau ou fermé : `notFound` ; non-membre ou
 * membre parti : `groupMembershipRequired` — explicite, et c'est un choix : la
 * fiche d'un groupe est découvrable, son existence n'est un secret pour
 * personne. Ce qui reste indistinct, c'est la LECTURE d'une publication de
 * groupe (`assertVisiblePost`).
 */
export async function requireLiveThematicGroupMembership(
  ctx: ReadCtx,
  networkId: Id<"networks">,
  groupId: Id<"thematicGroups">,
  personId: Id<"persons">,
): Promise<{ group: Doc<"thematicGroups">; membership: Doc<"thematicGroupMembers"> }> {
  const group = await ctx.db.get(groupId)
  if (!group || group.networkId !== networkId || !isActiveThematicGroup(group) || (await isThematicGroupRemovedByModeration(ctx, groupId))) return notFound()
  const membership = await liveThematicGroupMembership(ctx, groupId, personId)
  if (!membership) return group.associationPageId === undefined ? fail("groupMembershipRequired") : notFound()
  return { group, membership }
}
