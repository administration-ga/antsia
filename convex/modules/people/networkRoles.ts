/**
 * Rôles d'un réseau — poser ou retirer le rôle d'une adhésion (cahier § 6.3 ; EX-08 ; issue 98).
 *
 * Le rôle (`networkMemberships.role`) est LU à chaque appel par les gardes du moteur
 * (`ctx.membership.role` : file du réseau, recours, équipes, journal du réseau) : le poser donne
 * la capacité à l'acte suivant, le retirer l'enlève aussitôt. Aucune fonction Convex ici, sur le
 * modèle de `./admission` (`setMembershipStatus`) : l'aide est partagée par la console
 * (`platform/networkRoles.setNetworkRole`) et par les TRANCHES qui gouvernent un réseau
 * (`networks.managedBy`), qui ne patchent jamais elles-mêmes la table des adhésions.
 *
 * L'APPELANT a déjà établi son droit (administrateur de la plateforme, ou administrateur du réseau
 * dans sa tranche), son débit et son motif ; il inscrit LUI-MÊME la décision au journal, dans la
 * même transaction : `appendAudit(ctx, networkRoleAuditEntry(…))` quand `changed` est vrai
 * (cliquet `operator-audit` : l'appel se lit dans la décision).
 *
 * Invariants tenus ici, pour tous les chemins :
 * - jamais d'adhésion créée : une personne sans adhésion dans le réseau est refusée (indistinct) ;
 * - NOMMER exige une adhésion active au statut « déclarée » au moins, sans suspension (ici, à la
 *   racine, ou sanction globale) : une adhésion en attente, suspendue ou partie est refusée
 *   (indistinct) — elle ne pourrait de toute façon rien décider ;
 * - RETIRER (rôle `member`) vaut sur toute adhésion existante, même suspendue : retirer un pouvoir
 *   n'attend jamais la levée d'une sanction ;
 * - un réseau qui a un administrateur ACTIF en garde toujours un (`NETWORK_LAST_ADMIN`) ;
 * - au plus `NETWORK_ROLE_HOLDERS_MAX` titulaires par rôle et par réseau (`policyRefused`).
 */
import type { MembershipRole } from "@antsia/social-domain/membership"

import type { Doc, Id } from "../../_generated/dataModel"
import type { MutationCtx, QueryCtx } from "../../_generated/server"
import { getMembership, memberHasStatus } from "../../lib/access"
import { fail, failRule, notFound } from "../../lib/errors"
import type { AuditEntry } from "../platform/audit"

/**
 * Titulaires d'un même rôle dans un réseau, au plus. Même borne que les membres d'une équipe de
 * modération (`platform/console.ts`, `MEMBER_LIMIT`) : au-delà, une décision se refuse plutôt que
 * de lire sans borne.
 */
export const NETWORK_ROLE_HOLDERS_MAX = 100

/** Les deux rôles qui DÉCIDENT dans un réseau (le rôle `member` n'en est pas un). */
export const NETWORK_RESPONSIBLE_ROLES = ["network_admin", "network_moderator"] as const
export type NetworkResponsibleRole = (typeof NETWORK_RESPONSIBLE_ROLES)[number]

export type NetworkRoleChange = {
  personId: Id<"persons">
  from: MembershipRole
  to: MembershipRole
  /** `false` : le rôle demandé était déjà le sien ; rien n'est écrit, rien n'est à journaliser. */
  changed: boolean
}

/** La personne peut-elle EXERCER un rôle dans ce réseau (adhésion active, « déclarée » au moins) ? */
export async function canHoldNetworkRole(ctx: Pick<QueryCtx, "db">, networkId: Id<"networks">, personId: Id<"persons">): Promise<boolean> {
  return await memberHasStatus(ctx, networkId, personId, "declaree")
}

/**
 * Un AUTRE administrateur actif que `personId` existe-t-il dans le réseau ? Lecture bornée par
 * l'index du rôle ; au-delà de la borne sans en trouver un, le refus l'emporte (fermé).
 */
async function hasAnotherActiveAdmin(ctx: Pick<QueryCtx, "db">, networkId: Id<"networks">, personId: Id<"persons">): Promise<boolean> {
  const admins = await ctx.db
    .query("networkMemberships")
    .withIndex("by_network_and_role", (q) => q.eq("networkId", networkId).eq("role", "network_admin"))
    .take(NETWORK_ROLE_HOLDERS_MAX + 1)
  for (const admin of admins) {
    if (admin.personId !== personId && (await canHoldNetworkRole(ctx, networkId, admin.personId))) return true
  }
  if (admins.length > NETWORK_ROLE_HOLDERS_MAX) return fail("policyRefused")
  return false
}

/**
 * Pose (`network_admin`, `network_moderator`) ou retire (`member`) le rôle de réseau de
 * l'adhésion EXISTANTE de `personId` dans `network`. Voir l'en-tête pour les refus.
 */
export async function setMembershipRole(
  ctx: MutationCtx,
  input: { network: Doc<"networks">; personId: Id<"persons">; role: MembershipRole },
): Promise<NetworkRoleChange> {
  const { network, personId, role } = input
  if (network.status !== "active") return notFound()
  const membership = await getMembership(ctx, network._id, personId)
  if (!membership) return notFound()
  const naming = role !== "member"
  if (naming && !(await canHoldNetworkRole(ctx, network._id, personId))) return notFound()
  if (membership.role === role) return { personId, from: membership.role, to: role, changed: false }
  if (naming) {
    // borné : au plus NETWORK_ROLE_HOLDERS_MAX titulaires du rôle visé dans ce réseau.
    const holders = await ctx.db
      .query("networkMemberships")
      .withIndex("by_network_and_role", (q) => q.eq("networkId", network._id).eq("role", role))
      .take(NETWORK_ROLE_HOLDERS_MAX)
    if (holders.length >= NETWORK_ROLE_HOLDERS_MAX) return fail("policyRefused")
  }
  if (membership.role === "network_admin" && (await canHoldNetworkRole(ctx, network._id, personId)) && !(await hasAnotherActiveAdmin(ctx, network._id, personId))) {
    return failRule("NETWORK_LAST_ADMIN")
  }
  await ctx.db.patch(membership._id, { role })
  return { personId, from: membership.role, to: role, changed: true }
}

/**
 * La ligne de journal d'un changement de rôle, la même pour tous les chemins : sujet = la
 * personne, détail = motif, rôle d'avant et rôle posé. `capacity` : la qualité qui AUTORISAIT
 * l'acte (`platform_admin` à la console, `network_admin` dans une tranche).
 */
export function networkRoleAuditEntry(input: {
  networkId: Id<"networks">
  change: NetworkRoleChange
  actor: { personId: Id<"persons">; capacity: AuditEntry["capacity"] }
  reason: string
}): AuditEntry {
  return {
    action: "membership.role_set",
    capacity: input.actor.capacity,
    actorPersonId: input.actor.personId,
    networkId: input.networkId,
    subject: { table: "persons", id: input.change.personId },
    details: { reason: input.reason, from: input.change.from, to: input.change.to },
  }
}
