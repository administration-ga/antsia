/**
 * Résolution d'accès du moteur (cahier §12.1) :
 *
 *   session → personne → adhésion au réseau demandé → statut
 *   (puis, dans chaque écriture : limitation de débit → droit sur la ressource)
 *
 * L'identité ne se prend JAMAIS dans les arguments : elle vient du jeton
 * (`ctx.auth`). Tout refus d'accès à un réseau dont on n'est pas membre est
 * INDISTINCT (`notFound`) ; une suspension à la racine vaut partout.
 */
import { type ActiveMembershipStatus, effectiveAccessStatus, isActiveStatus, satisfiesMinimum } from "@antsia/social-domain/membership"

import type { Doc, Id } from "../_generated/dataModel"
import type { QueryCtx } from "../_generated/server"
import { fail, notFound } from "./errors"
import { getActiveIdentity } from "./session"
import { hasLiveGlobalSanction } from "../modules/moderation/policy"
import { hasJudicialAccountHold, isNetworkAccessSuspended } from "../modules/moderation/judicialHolds"
import { hasLiveAdministrationGrant } from "../modules/federation/agentAuthority"

/** La personne liée à la session, ou `null` (pas de session, ou personne pas encore créée). */
export async function getCurrentPerson(ctx: QueryCtx): Promise<Doc<"persons"> | null> {
  const identity = await getActiveIdentity(ctx)
  if (!identity) return null
  return await ctx.db
    .query("persons")
    .withIndex("by_authUserId", (q) => q.eq("authUserId", identity.subject))
    .unique()
}

/** La personne liée à la session ; `unauthenticated` sinon. */
export async function requirePerson(ctx: QueryCtx): Promise<Doc<"persons">> {
  const identity = await getActiveIdentity(ctx)
  if (!identity) return fail("unauthenticated")
  const person = await ctx.db
    .query("persons")
    .withIndex("by_authUserId", (q) => q.eq("authUserId", identity.subject))
    .unique()
  if (!person) return fail("unauthenticated")
  return person
}

/** Le réseau racine actif (il y en a un, et un seul). */
export async function getRootNetwork(ctx: Pick<QueryCtx, "db">): Promise<Doc<"networks"> | null> {
  return await ctx.db
    .query("networks")
    .withIndex("by_kind_and_status", (q) => q.eq("kind", "root").eq("status", "active"))
    .unique()
}

export async function getMembership(
  ctx: Pick<QueryCtx, "db">,
  networkId: Id<"networks">,
  personId: Id<"persons">,
): Promise<Doc<"networkMemberships"> | null> {
  return await ctx.db
    .query("networkMemberships")
    .withIndex("by_network_and_person", (q) => q.eq("networkId", networkId).eq("personId", personId))
    .unique()
}

export function effectiveMembershipStatus(membership: Doc<"networkMemberships"> | null) {
  if (membership?.status === "suspendue" && membership.suspendedUntil !== undefined && membership.suspendedUntil <= Date.now()) return membership.statusBeforeSuspension ?? "declaree"
  return membership?.status ?? null
}

export type NetworkAccess = {
  person: Doc<"persons">
  network: Doc<"networks">
  membership: Doc<"networkMemberships">
  rootNetwork: Doc<"networks">
}

/**
 * LA garde du moteur : la personne de la session est-elle membre du réseau,
 * au statut minimal demandé ? Rend la personne, le réseau et l'adhésion.
 * - pas de session : `unauthenticated` ;
 * - réseau absent ou archivé, personne non membre ou partie : `notFound` (indistinct) ;
 * - suspendue (ici ou à la racine) : `membershipSuspended` ;
 * - membre au statut insuffisant (ex. `en_attente` qui veut publier) : `statusInsufficient`.
 */
export async function requireMembership(
  ctx: QueryCtx,
  networkId: Id<"networks">,
  minStatus: ActiveMembershipStatus,
): Promise<NetworkAccess> {
  const person = await requirePerson(ctx)
  // SU01h : une suspension de compte sur ordre du juge vaut partout, comme une suspension racine.
  if (await hasLiveGlobalSanction(ctx, person._id) || await hasJudicialAccountHold(ctx, person._id)) return fail("membershipSuspended")
  const network = await ctx.db.get(networkId)
  if (!network || network.status !== "active") return notFound()
  const rootNetwork = network.kind === "root" ? network : await getRootNetwork(ctx)
  if (!rootNetwork) return notFound()
  // SU01h (art. 44) : l'accès au réseau, ou à toute la plateforme par la racine, est suspendu sur ordre.
  if (await isNetworkAccessSuspended(ctx, network._id)) return fail("policyRefused")
  const membership = await getMembership(ctx, network._id, person._id)
  const rootMembership = network.kind === "root" ? membership : await getMembership(ctx, rootNetwork._id, person._id)
  const status = effectiveAccessStatus({
    networkStatus: effectiveMembershipStatus(membership),
    rootStatus: effectiveMembershipStatus(rootMembership),
    isRoot: network.kind === "root",
  })
  if (!membership || status === null || status === "partie") return notFound()
  if (status === "suspendue") return fail("membershipSuspended")
  if (!satisfiesMinimum(status, minStatus)) return fail("statusInsufficient")
  if (network.slug === "administration" && network.membershipPolicy === "mirror" && !await hasLiveAdministrationGrant(ctx, person._id, network._id)) return notFound()
  return { person, network, membership, rootNetwork }
}

/**
 * Une AUTRE personne est-elle membre active du réseau (en attente, déclarée ou
 * vérifiée, sans suspension à la racine) ? Pour les lectures qui exposent un
 * tiers dans un réseau (annuaire, fiche, mentions) : jamais un non-membre.
 */
export async function isActiveMember(ctx: Pick<QueryCtx, "db">, networkId: Id<"networks">, personId: Id<"persons">): Promise<boolean> {
  const status = await effectiveStatusOf(ctx, networkId, personId)
  return status !== null && isActiveStatus(status)
}

/**
 * Une AUTRE personne est-elle membre du réseau AU STATUT demandé, sans
 * suspension à la racine ? Pour un geste qui l'ENGAGE (décrocher un appel) :
 * un membre en attente est visible, il n'agit pas encore — le faire sonner
 * serait l'inviter à un geste que son adhésion refuse.
 */
export async function memberHasStatus(ctx: Pick<QueryCtx, "db">, networkId: Id<"networks">, personId: Id<"persons">, minStatus: ActiveMembershipStatus): Promise<boolean> {
  const status = await effectiveStatusOf(ctx, networkId, personId)
  return status !== null && isActiveStatus(status) && satisfiesMinimum(status, minStatus)
}

/** Le statut d'accès EFFECTIF d'une personne dans un réseau actif (adhésion propre et racine), ou `null`. */
async function effectiveStatusOf(ctx: Pick<QueryCtx, "db">, networkId: Id<"networks">, personId: Id<"persons">) {
  if (await hasLiveGlobalSanction(ctx, personId) || await hasJudicialAccountHold(ctx, personId)) return "suspendue"
  const network = await ctx.db.get(networkId)
  if (!network || network.status !== "active") return null
  const membership = await getMembership(ctx, network._id, personId)
  if (!membership) return null
  if (network.slug === "administration" && network.membershipPolicy === "mirror" && !await hasLiveAdministrationGrant(ctx, personId, network._id)) return null
  const root = network.kind === "root" ? network : await getRootNetwork(ctx)
  const rootMembership = network.kind === "root" || !root ? membership : await getMembership(ctx, root._id, personId)
  return effectiveAccessStatus({
    networkStatus: effectiveMembershipStatus(membership),
    rootStatus: effectiveMembershipStatus(rootMembership),
    isRoot: network.kind === "root",
  })
}
