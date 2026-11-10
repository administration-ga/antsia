/**
 * P15 : offres d'emploi lues par les MEMBRES (même DTO que le SSR public) et
 * politique d'un réseau réglée par un opérateur. Emploi, mission et service
 * restent distincts : aucun panier, aucun frais, aucun classement social.
 */
import { assertDecisionReason } from "@antsia/social-domain/audit"
import { paginationOptsValidator } from "convex/server"
import { v } from "convex/values"

import { checked, notFound } from "../../lib/errors"
import { networkQuery, operatorMutation, operatorQuery } from "../../lib/functions"
import { enforceRateLimit } from "../../lib/rateLimit"
import { requireFederationAdmin } from "../federation/access"
import { appendAudit, operatorCapacity } from "../platform/audit"
import { jobPolicyOf } from "./jobAccess"
import { commerceActivationReady } from "./commerceActivation"
import { discoverJobs, jobByHandle, jobDtoValidator, jobListValidator, jobsDiscoverable, listShopJobs } from "./jobRead"

export const listForShop = networkQuery({
  args: { handle: v.string(), paginationOpts: paginationOptsValidator }, returns: jobListValidator,
  handler: async (ctx, args) => await listShopJobs(ctx, { root: ctx.rootNetwork, readerPersonId: ctx.person._id, network: ctx.network }, args.handle, args.paginationOpts),
})

/** La fiche : une offre close reste lisible avec sa clôture ; retirée ou inconnue, `null` indistinct. */
export const job = networkQuery({
  args: { handle: v.string(), jobRef: v.string() }, returns: v.union(jobDtoValidator, v.null()),
  handler: async (ctx, args) => await jobByHandle(ctx, { root: ctx.rootNetwork, readerPersonId: ctx.person._id, network: ctx.network }, args.handle, args.jobRef),
})

export const discover = networkQuery({
  args: { paginationOpts: paginationOptsValidator }, returns: jobListValidator,
  handler: async (ctx, args) => await discoverJobs(ctx, { root: ctx.rootNetwork, readerPersonId: ctx.person._id, network: ctx.network }, args.paginationOpts),
})

/** L'onglet Emplois de Découvrir : servi seulement avec de vraies offres reçues et lisibles. */
export const discoverAvailability = networkQuery({
  args: {}, returns: v.object({ available: v.boolean() }),
  handler: async (ctx) => ({ available: await jobsDiscoverable(ctx, { root: ctx.rootNetwork, readerPersonId: ctx.person._id, network: ctx.network }) }),
})

/** Décision OPÉRATEUR tracée ; aucune ligne = fermé. Les candidatures exigent aussi les emplois. */
export const setPolicy = operatorMutation({
  args: { networkId: v.id("networks"), jobsEnabled: v.boolean(), applicationsEnabled: v.boolean(), reason: v.string() }, returns: v.null(),
  handler: async (ctx, args) => {
    await requireFederationAdmin(ctx, ctx)
    await enforceRateLimit(ctx, "shop.job.configure", ctx.person._id)
    const reason = checked(() => assertDecisionReason(args.reason, 10))
    if ((await ctx.db.get(args.networkId))?.status !== "active") return notFound()
    if (args.applicationsEnabled && !commerceActivationReady("applications")) return notFound()
    const previous = await ctx.db.query("commerceJobPolicies").withIndex("by_network", (q) => q.eq("networkId", args.networkId)).unique()
    const fields = { networkId: args.networkId, jobsEnabled: args.jobsEnabled, applicationsEnabled: args.jobsEnabled && args.applicationsEnabled, updatedAt: Date.now(), updatedByPersonId: ctx.person._id }
    if (previous) await ctx.db.patch(previous._id, fields)
    else await ctx.db.insert("commerceJobPolicies", fields)
    await appendAudit(ctx, { action: "job.policy_set", capacity: operatorCapacity(ctx.operator), actorPersonId: ctx.person._id, networkId: args.networkId, subject: { table: "networks", id: args.networkId }, details: { reason, jobsEnabled: args.jobsEnabled, applicationsEnabled: fields.applicationsEnabled } })
    return null
  },
})

/** La politique du réseau de lecture (configuration collective, aucune donnée personnelle). */
export const policy = networkQuery({
  args: {}, returns: v.object({ jobs: v.boolean(), applications: v.boolean() }),
  handler: async (ctx) => await jobPolicyOf(ctx, ctx.networkId),
})

/** Console : la décision courante d'un réseau, lue par l'administration de la plateforme seule. */
export const consolePolicy = operatorQuery({
  args: { networkId: v.id("networks") },
  returns: v.object({ networkId: v.id("networks"), jobs: v.boolean(), applications: v.boolean(), configured: v.boolean(), updatedAt: v.union(v.number(), v.null()) }),
  handler: async (ctx, args) => {
    await requireFederationAdmin(ctx, ctx)
    if ((await ctx.db.get(args.networkId))?.status !== "active") return notFound()
    const row = await ctx.db.query("commerceJobPolicies").withIndex("by_network", (q) => q.eq("networkId", args.networkId)).unique()
    const current = await jobPolicyOf(ctx, args.networkId)
    return { networkId: args.networkId, ...current, configured: row !== null, updatedAt: row?.updatedAt ?? null }
  },
})
