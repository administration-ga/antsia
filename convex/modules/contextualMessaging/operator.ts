/**
 * CC-2b (contrat CONVERSATION-CONTEXTUELLE-V1 §5.9) — la politique d'une nature dans un réseau,
 * FERMÉE par défaut (l'absence de ligne vaut « fermé »), réglée depuis la console (section Pages)
 * par un administrateur de plateforme, avec un motif d'au moins dix caractères et une ligne de
 * journal `contextual.policy_set` (cliquet `operator-audit`). Une politique fermée bloque toute
 * ouverture, tout message et tout appel ; l'historique reste lisible des parties (D10). Fermer la
 * politique est aussi le retour arrière.
 */
import { assertDecisionReason } from "@antsia/social-domain/audit"
import { CONTEXTUAL_SUPPORTED_KINDS, CONTEXTUAL_POLICY_REASON_MIN } from "@antsia/social-domain/contextualMessaging"
import { makeFunctionReference } from "convex/server"
import { v } from "convex/values"

import { checked, notFound } from "../../lib/errors"
import { operatorMutation, operatorQuery } from "../../lib/functions"
import { requirePlatformAdmin } from "../../lib/operatorIdentity"
import { enforceRateLimit } from "../../lib/rateLimit"
import { appendAudit, operatorCapacity } from "../platform/audit"
import { contextualKindValidator } from "./tables"

/** CC-4 : une politique FERMÉE bloque tout appel — la revalidation paginée arrête ceux qui vivent encore. */
const revalidateCalls = makeFunctionReference<"mutation", { cursor?: string }, number>("modules/contextualMessaging/retention:revalidateCalls")

const policyStateValidator = v.object({ kind: contextualKindValidator, enabled: v.boolean(), updatedAt: v.union(v.number(), v.null()) })

/** Les politiques de toutes les natures V1 d'un réseau (une ligne par nature, fermée sans décision). */
export const policies = operatorQuery({
  args: { networkId: v.id("networks") },
  returns: v.array(policyStateValidator),
  handler: async (ctx, args) => {
    const states = []
    for (const kind of CONTEXTUAL_SUPPORTED_KINDS) {
      const row = await ctx.db.query("contextualPolicies").withIndex("by_network_kind", (q) => q.eq("networkId", args.networkId).eq("kind", kind)).first()
      states.push({ kind, enabled: row?.enabled === true, updatedAt: row?.updatedAt ?? null })
    }
    return states
  },
})

/** La politique d'UNE nature dans un réseau. */
export const policy = operatorQuery({
  args: { networkId: v.id("networks"), kind: contextualKindValidator },
  returns: policyStateValidator,
  handler: async (ctx, args) => {
    const row = await ctx.db.query("contextualPolicies").withIndex("by_network_kind", (q) => q.eq("networkId", args.networkId).eq("kind", args.kind)).first()
    return { kind: args.kind, enabled: row?.enabled === true, updatedAt: row?.updatedAt ?? null }
  },
})

/** Ouvrir ou fermer une nature dans un réseau actif : administrateur de plateforme, motif, journal. */
export const setPolicy = operatorMutation({
  args: { networkId: v.id("networks"), kind: contextualKindValidator, enabled: v.boolean(), reason: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    requirePlatformAdmin(ctx)
    await enforceRateLimit(ctx, "operator.network", ctx.person._id)
    const reason = checked(() => assertDecisionReason(args.reason, CONTEXTUAL_POLICY_REASON_MIN))
    const network = await ctx.db.get(args.networkId)
    if (network === null || network.status !== "active") return notFound()
    const row = await ctx.db.query("contextualPolicies").withIndex("by_network_kind", (q) => q.eq("networkId", args.networkId).eq("kind", args.kind)).first()
    // Rien à décider : la politique est déjà dans l'état demandé (fermée sans ligne).
    if ((row?.enabled === true) === args.enabled) return null
    const now = Date.now()
    const fields = { networkId: args.networkId, kind: args.kind, enabled: args.enabled, updatedAt: now, updatedByPersonId: ctx.person._id }
    if (row) await ctx.db.patch(row._id, fields)
    else await ctx.db.insert("contextualPolicies", fields)
    await appendAudit(ctx, {
      action: "contextual.policy_set",
      capacity: operatorCapacity(ctx.operator),
      actorPersonId: ctx.person._id,
      networkId: args.networkId,
      subject: { table: "networks", id: args.networkId },
      details: { reason, kind: args.kind, enabled: args.enabled },
      at: now,
    })
    if (!args.enabled) await ctx.scheduler.runAfter(0, revalidateCalls, {})
    return null
  },
})
