import { assertDecisionReason } from "@antsia/social-domain/audit"
import { FEDERATION_CONTRACTS_MAX, validFederationContract, validFederationEmitter, validFederationKeyEnvName } from "@antsia/social-domain/federationProtocol"
import { paginationOptsValidator } from "convex/server"
import { v } from "convex/values"

import { internalQuery } from "../../_generated/server"
import { checked, fail, notFound } from "../../lib/errors"
import { operatorMutation, operatorQuery } from "../../lib/functions"
import { enforceRateLimit } from "../../lib/rateLimit"
import { appendAudit, operatorCapacity } from "../platform/audit"
import { isLocalCatalogEmitter, requireCatalogAdmin, requireFederationAdmin } from "./access"
import { federationEnvironmentValidator } from "./tables"

/** La clé est une référence d'environnement, jamais une valeur stockée. */
export const configure = operatorMutation({
  args: { networkId: v.id("networks"), slug: v.string(), environment: federationEnvironmentValidator, enabled: v.boolean(), keyEnvName: v.string(), allowedContracts: v.array(v.string()), reason: v.string() },
  returns: v.id("federationEmitters"),
  handler: async (ctx, args) => {
    let admission: "strong" | "local" = "strong"
    if (isLocalCatalogEmitter(args)) admission = await requireCatalogAdmin(ctx, ctx, args.networkId)
    else await requireFederationAdmin(ctx, ctx)
    await enforceRateLimit(ctx, "operator.network", ctx.person._id)
    const reason = checked(() => assertDecisionReason(args.reason, 10))
    if (!validFederationEmitter(args.slug) || !validFederationKeyEnvName(args.keyEnvName) || args.allowedContracts.length > FEDERATION_CONTRACTS_MAX || !args.allowedContracts.every(validFederationContract) || new Set(args.allowedContracts).size !== args.allowedContracts.length) return fail("invalidArgument", { field: "emitter" })
    const network = await ctx.db.get(args.networkId)
    if (!network || network.status !== "active") return notFound()
    const existing = await ctx.db.query("federationEmitters").withIndex("by_slug_environment", (q) => q.eq("slug", args.slug).eq("environment", args.environment)).unique()
    if (admission === "local" && existing && !isLocalCatalogEmitter(existing)) return notFound()
    // Le message signé contient l'environnement, pas le slug. Réutiliser une
    // variable de clé pour deux émetteurs permettrait un déplacement de corps
    // signé entre leurs réseaux. La référence de clé est donc réservée.
    const keyOwners = await ctx.db.query("federationEmitters").withIndex("by_key_env", (q) => q.eq("keyEnvName", args.keyEnvName)).take(2)
    if (keyOwners.some((row) => row._id !== existing?._id)) return fail("conflict")
    // Une identité d'émetteur ne change pas de réseau sous les reçus ou une
    // signature déjà validée. Changer de périmètre exige une nouvelle identité.
    if (existing && existing.networkId !== args.networkId) return fail("conflict")
    const now = Date.now()
    const fields = { networkId: args.networkId, slug: args.slug, environment: args.environment, enabled: args.enabled, keyEnvName: args.keyEnvName, allowedContracts: [...args.allowedContracts].sort(), revision: (existing?.revision ?? 0) + 1, updatedAt: now }
    const emitterId = existing?._id ?? await ctx.db.insert("federationEmitters", { ...fields, createdAt: now })
    if (existing) await ctx.db.patch(existing._id, fields)
    await appendAudit(ctx, { action: "federation.emitter_set", capacity: operatorCapacity(ctx.operator), actorPersonId: ctx.person._id, networkId: network._id, subject: { table: "federationEmitters", id: emitterId }, details: { reason, slug: args.slug, environment: args.environment, enabled: args.enabled, revision: fields.revision }, at: now })
    return emitterId
  },
})

export const getForInbox = internalQuery({
  args: { slug: v.string(), environment: federationEnvironmentValidator },
  returns: v.union(v.null(), v.object({ emitterId: v.id("federationEmitters"), keyEnvName: v.string(), revision: v.number() })),
  handler: async (ctx, args) => {
    if (!validFederationEmitter(args.slug)) return null
    const row = await ctx.db.query("federationEmitters").withIndex("by_slug_environment", (q) => q.eq("slug", args.slug).eq("environment", args.environment)).unique()
    if (!row?.enabled) return null
    const network = await ctx.db.get(row.networkId)
    if (!network || network.status !== "active") return null
    return { emitterId: row._id, keyEnvName: row.keyEnvName, revision: row.revision }
  },
})

export const paginate = operatorQuery({
  args: { networkId: v.id("networks"), paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => await ctx.db.query("federationEmitters").withIndex("by_network", (q) => q.eq("networkId", args.networkId)).paginate({ ...args.paginationOpts, numItems: Math.min(25, Math.max(1, args.paginationOpts.numItems)) }),
})
