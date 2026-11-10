/** MP03 : construction de l'index public, bornée et protégée par génération/curseur. */
import { makeFunctionReference } from "convex/server"
import { v } from "convex/values"
import { internalMutation } from "../../_generated/server"
import type { Id } from "../../_generated/dataModel"
import { notFound } from "../../lib/errors"
import { MARKETPLACE_DISCOVERY_VERSION, marketplaceIndexFields } from "./marketplaceIndexFields"

type BuildArgs = { networkId: Id<"networks">; generation: number; cursor: string | null }
const buildReference = makeFunctionReference<"mutation", BuildArgs, null>("modules/shops/marketplaceIndex:build")

/** Appel interne explicite : aucun cron ni activation implicite en production. */
export const start = internalMutation({
  args: { networkId: v.id("networks") }, returns: v.object({ generation: v.number() }),
  handler: async (ctx, args) => {
    const root = await ctx.db.get(args.networkId)
    if (!root || root.kind !== "root" || root.status !== "active") return notFound()
    const current = await ctx.db.query("commerceCatalogIndexes").withIndex("by_network", q => q.eq("networkId", args.networkId)).unique()
    const generation = (current?.generation ?? 0) + 1
    if (!Number.isSafeInteger(generation)) return notFound()
    const value = { version: MARKETPLACE_DISCOVERY_VERSION, generation, status: "building" as const, cursor: undefined, updatedAt: Date.now() }
    if (current) await ctx.db.patch(current._id, value)
    else await ctx.db.insert("commerceCatalogIndexes", { networkId: args.networkId, ...value })
    await ctx.scheduler.runAfter(0, buildReference, { networkId: args.networkId, generation, cursor: null })
    return { generation }
  },
})

export const build = internalMutation({
  args: { networkId: v.id("networks"), generation: v.number(), cursor: v.union(v.string(), v.null()) }, returns: v.null(),
  handler: async (ctx, args) => {
    const root = await ctx.db.get(args.networkId)
    if (!root || root.kind !== "root" || root.status !== "active") return null
    const state = await ctx.db.query("commerceCatalogIndexes").withIndex("by_network", q => q.eq("networkId", args.networkId)).unique()
    // CAS : une ancienne tâche, un doublon ou un mauvais curseur n'avance jamais une nouvelle construction.
    if (!state || state.version !== MARKETPLACE_DISCOVERY_VERSION || state.status !== "building" || state.generation !== args.generation || (state.cursor ?? null) !== args.cursor) return null
    const page = await ctx.db.query("commerceCatalogHeads").order("asc").paginate({ cursor: args.cursor, numItems: 24, maximumRowsRead: 24, maximumBytesRead: 2 * 1024 * 1024 })
    const now = Date.now()
    for (const head of page.page) await ctx.db.patch(head._id, marketplaceIndexFields(head.body, head.state, head.objectKind, head.sequence, now))
    await ctx.db.patch(state._id, { cursor: page.isDone ? undefined : page.continueCursor, status: page.isDone ? "ready" : "building", updatedAt: now })
    if (!page.isDone) await ctx.scheduler.runAfter(0, buildReference, { networkId: args.networkId, generation: args.generation, cursor: page.continueCursor })
    return null
  },
})
