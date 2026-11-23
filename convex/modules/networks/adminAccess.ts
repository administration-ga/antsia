/**
 * ADR-0042 (CH-815) — les deux portes d'entrée de l'application d'administration d'un réseau.
 *
 * L'application ne monte RIEN avant deux réponses du serveur : « suis-je administrateur de ce réseau,
 * en session prouvée de cette application ? » (`myNetworkAdmin`), puis l'inscription de l'accès au
 * journal (`recordAccess`, ligne `network.admin_access`). Ce sont les deux seules fonctions qui
 * passent sans accès journalisé (`allowUnloggedAccess`) ; toute autre fonction de l'application
 * (`networkAdminQuery`, `networkAdminMutation`) le refuse. L'accès est journalisé sur la preuve de
 * la session (`networkAdminAccess`), à part de celui de la console (`accessLoggedAt`) : l'un ne vaut
 * jamais pour l'autre.
 */
import { v } from "convex/values"

import { networkAdminMutation, networkAdminQuery } from "../../lib/functions"
import { isNetworkAdminAccessLogged } from "../../lib/networkAdminIdentity"
import { appendAudit } from "../platform/audit"

/** L'administrateur du réseau et l'état de son accès : ce que la coque de l'application lit d'abord. */
export const myNetworkAdmin = networkAdminQuery({
  allowUnloggedAccess: true,
  args: {},
  returns: v.object({
    personId: v.id("persons"),
    /** Le nom social publié ; `null` s'il n'en a pas. */
    displayName: v.union(v.string(), v.null()),
    networkId: v.id("networks"),
    networkSlug: v.string(),
    networkName: v.string(),
    /** L'accès de CETTE session à CE réseau est-il déjà au journal ? */
    accessLogged: v.boolean(),
  }),
  handler: async (ctx) => ({
    personId: ctx.person._id,
    displayName: ctx.person.displayName ?? null,
    networkId: ctx.networkId,
    networkSlug: ctx.network.slug,
    networkName: ctx.network.name,
    accessLogged: isNetworkAdminAccessLogged(ctx.adminSession, ctx.networkId),
  }),
})

/** L'accès de cette session au réseau, inscrit au journal une fois ; rejoué, rien n'est écrit. */
export const recordAccess = networkAdminMutation({
  allowUnloggedAccess: true,
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    if (isNetworkAdminAccessLogged(ctx.adminSession, ctx.networkId)) return null
    const at = Date.now()
    await ctx.db.patch(ctx.adminSession._id, { networkAdminAccess: { networkId: ctx.networkId, loggedAt: at } })
    await appendAudit(ctx, {
      action: "network.admin_access",
      capacity: "network_admin",
      actorPersonId: ctx.person._id,
      networkId: ctx.networkId,
      subject: { table: "networks", id: ctx.networkId },
      at,
    })
    return null
  },
})
