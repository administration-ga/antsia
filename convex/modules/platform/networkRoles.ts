/**
 * EX-08 (plan 13) et issue 98 — les responsables d'un réseau, à la console (cahier § 6.3).
 *
 * Un administrateur de la PLATEFORME nomme ou retire l'administrateur ou le modérateur d'un
 * réseau, sur l'adhésion EXISTANTE de la personne (jamais d'adhésion créée d'office), motif à
 * l'appui, et la décision entre au journal fermé du moteur (`membership.role_set`). Le retrait
 * vaut à l'acte suivant : les gardes relisent le rôle à chaque appel. Tout opérateur LIT la liste.
 *
 * Réseau gouverné par une tranche (`networks.managedBy`, ex. DIASPORALE) : ADMIS, contrairement à
 * ce que prévoyait le plan 13 — décision du propriétaire rapportée par l'issue 98 (« lever le refus
 * plutôt que dupliquer le mécanisme dans la tranche ») : la console nomme le premier administrateur,
 * puis l'administration du réseau nomme ses responsables dans sa tranche, par la même aide du
 * moteur (`people/networkRoles.setMembershipRole`) et la même ligne de journal.
 */
import { assertDecisionReason } from "@antsia/social-domain/audit"
import { paginationOptsValidator, type PaginationResult } from "convex/server"
import { v } from "convex/values"

import type { Doc, Id } from "../../_generated/dataModel"
import type { QueryCtx } from "../../_generated/server"
import { checked, fail, notFound } from "../../lib/errors"
import { operatorMutation, operatorQuery } from "../../lib/functions"
import { requirePlatformAdmin } from "../../lib/operatorIdentity"
import { enforceRateLimit } from "../../lib/rateLimit"
import { literals, membershipRoleValidator } from "../../lib/validators"
import { canHoldNetworkRole, NETWORK_RESPONSIBLE_ROLES, networkRoleAuditEntry, setMembershipRole } from "../people/networkRoles"
import { appendAudit, operatorCapacity } from "./audit"
import { publishedMember } from "./console"

/** Motif d'une nomination ou d'un retrait : la borne des décisions sur une adhésion (`suspendEverywhere`). */
export const NETWORK_ROLE_REASON_MIN = 10
/** Une fenêtre de la liste, au plus. */
const ROLE_PAGE_MAX = 50

const networkResponsibleRoleValidator = literals(NETWORK_RESPONSIBLE_ROLES)

export type NetworkRoleHolderDto = {
  personId: Id<"persons">
  /** Nom et identifiant PUBLIÉS seulement (mêmes règles que les équipes) ; `null` sinon. */
  handle: string | null
  displayName: string | null
  /** Le rôle s'exerce : adhésion active, « déclarée » au moins, sans suspension. */
  active: boolean
}

async function activeNetwork(ctx: Pick<QueryCtx, "db">, networkId: Id<"networks">): Promise<Doc<"networks">> {
  const network = await ctx.db.get(networkId)
  if (!network || network.status !== "active") return notFound()
  return network
}

/**
 * Console : les titulaires d'UN rôle de réseau, par fenêtres de cinquante au plus. `managedBy`
 * dit si le réseau est gouverné par une tranche (l'écran l'explique) ; une adhésion qui ne permet
 * plus d'exercer le rôle (suspendue, partie, en attente) reste listée, inactive et sans nom.
 */
export const paginateNetworkRoles = operatorQuery({
  args: { networkId: v.id("networks"), role: networkResponsibleRoleValidator, paginationOpts: paginationOptsValidator },
  handler: async (ctx, args): Promise<PaginationResult<NetworkRoleHolderDto> & { managedBy: Doc<"networks">["managedBy"] | null }> => {
    const network = await activeNetwork(ctx, args.networkId)
    const { numItems } = args.paginationOpts
    if (!Number.isInteger(numItems) || numItems < 1 || numItems > ROLE_PAGE_MAX) return fail("invalidArgument", { field: "paginationOpts" })
    const options = { ...args.paginationOpts, maximumRowsRead: Math.min(args.paginationOpts.maximumRowsRead ?? ROLE_PAGE_MAX, ROLE_PAGE_MAX) }
    const result = await ctx.db
      .query("networkMemberships")
      .withIndex("by_network_and_role", (q) => q.eq("networkId", network._id).eq("role", args.role))
      .paginate(options)
    const page: NetworkRoleHolderDto[] = []
    for (const row of result.page) {
      const active = await canHoldNetworkRole(ctx, network._id, row.personId)
      const person = active ? await publishedMember(ctx, network, row.personId, true) : null
      page.push({ personId: row.personId, handle: person?.handle ?? null, displayName: person?.displayName ?? null, active })
    }
    return { ...result, page, managedBy: network.managedBy ?? null }
  },
})

/**
 * Console (administrateur de la plateforme) : nommer (`network_admin`, `network_moderator`) ou
 * retirer (`member`) le rôle de réseau d'une personne. Refus indistinct (`notFound`) : réseau
 * absent ou archivé, personne sans adhésion, ou — pour nommer — adhésion qui n'est pas active au
 * statut « déclarée » au moins. `NETWORK_LAST_ADMIN` : le dernier administrateur actif reste.
 * Le rôle déjà posé ne change rien et n'écrit aucune ligne (`changed: false`).
 */
export const setNetworkRole = operatorMutation({
  args: { networkId: v.id("networks"), personId: v.id("persons"), role: membershipRoleValidator, reason: v.string() },
  returns: v.object({ role: membershipRoleValidator, changed: v.boolean() }),
  handler: async (ctx, args) => {
    requirePlatformAdmin(ctx)
    await enforceRateLimit(ctx, "operator.membership", ctx.person._id)
    const reason = checked(() => assertDecisionReason(args.reason, NETWORK_ROLE_REASON_MIN))
    const network = await activeNetwork(ctx, args.networkId)
    const change = await setMembershipRole(ctx, { network, personId: args.personId, role: args.role })
    if (change.changed) {
      await appendAudit(ctx, networkRoleAuditEntry({ networkId: network._id, change, actor: { personId: ctx.person._id, capacity: operatorCapacity(ctx.operator) }, reason }))
    }
    return { role: change.to, changed: change.changed }
  },
})
