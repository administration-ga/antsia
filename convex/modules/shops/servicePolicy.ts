/**
 * P14 : devis, rendez-vous et prestations FERMÉS par défaut ; un réseau s'ouvre par une
 * décision tracée de l'administration de la plateforme. L'ouverture ne configure aucune
 * liaison PRO.GA : la permission de la boutique et son mandat restent exigés à chaque geste.
 * La fermeture laisse gérables (relire, annuler) les rendez-vous et commandes existants.
 */
import { assertDecisionReason } from "@antsia/social-domain/audit"
import { v } from "convex/values"

import { checked, notFound } from "../../lib/errors"
import { operatorMutation, operatorQuery } from "../../lib/functions"
import { enforceRateLimit } from "../../lib/rateLimit"
import { requireFederationAdmin } from "../federation/access"
import { appendAudit, operatorCapacity } from "../platform/audit"
import { commerceActivationReady } from "./commerceActivation"

export const getPolicy = operatorQuery({
  args: { networkId: v.id("networks") },
  returns: v.object({ networkId: v.id("networks"), enabled: v.boolean(), configured: v.boolean(), updatedAt: v.union(v.number(), v.null()) }),
  handler: async (ctx, args) => {
    await requireFederationAdmin(ctx, ctx)
    if ((await ctx.db.get(args.networkId))?.status !== "active") return notFound()
    const row = await ctx.db.query("commerceServicePolicies").withIndex("by_network", (q) => q.eq("networkId", args.networkId)).unique()
    return { networkId: args.networkId, enabled: row?.enabled === true, configured: row !== null, updatedAt: row?.updatedAt ?? null }
  },
})

export const setPolicy = operatorMutation({
  args: { networkId: v.id("networks"), enabled: v.boolean(), reason: v.string() }, returns: v.null(),
  handler: async (ctx, args) => {
    await requireFederationAdmin(ctx, ctx)
    await enforceRateLimit(ctx, "shop.service.configure", ctx.person._id)
    const reason = checked(() => assertDecisionReason(args.reason, 10))
    if ((await ctx.db.get(args.networkId))?.status !== "active") return notFound()
    if (args.enabled && !commerceActivationReady("services")) return notFound()
    const previous = await ctx.db.query("commerceServicePolicies").withIndex("by_network", (q) => q.eq("networkId", args.networkId)).unique()
    const fields = { networkId: args.networkId, enabled: args.enabled, updatedAt: Date.now(), updatedByPersonId: ctx.person._id }
    if (previous) await ctx.db.patch(previous._id, fields)
    else await ctx.db.insert("commerceServicePolicies", fields)
    await appendAudit(ctx, { action: "service.policy_set", capacity: operatorCapacity(ctx.operator), actorPersonId: ctx.person._id,
      networkId: args.networkId, subject: { table: "networks", id: args.networkId }, details: { enabled: args.enabled, reason } })
    return null
  },
})
