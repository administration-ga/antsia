/** PA7 : preuve interne issue du callback IDN, projection d'autorité et journal d'accès. */
import { v } from "convex/values"

import { components, internal } from "../../_generated/api"
import { internalMutation } from "../../_generated/server"
import { isWebApplicationKey } from "../../betterAuth/settings"
import { fail } from "../../lib/errors"
import { operatorMutation, operatorQuery } from "../../lib/functions"
import { requireOperatorSession } from "../../lib/operatorIdentity"
import { appendAudit, operatorCapacity } from "./audit"

/**
 * Scelle la session ouverte par un retour IDN. Appelée par le seul greffon `engine-idn-session-proof`
 * (`betterAuth/auth.ts`), jamais par un client. ADR-0042 : `application`, la clé de l'application web
 * où la session est livrée, établie par le serveur depuis l'état OAuth qu'il a enregistré
 * (`applicationOfOAuthState`) ; une clé hors du catalogue est refusée, une clé absente laisse une
 * preuve qui ne vaut ni pour l'administration d'un réseau, ni pour la console (revue CH-815 F3 : seule
 * une preuve scellée pour l'application de la console ouvre `myOperator`, `recordAccess` et la console).
 */
export const recordIdnSession = internalMutation({
  args: { sessionId: v.string(), authUserId: v.string(), idnSubject: v.string(), loa: v.union(v.literal(1), v.literal(2), v.literal(3)), application: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const now = Date.now()
    if (args.application !== undefined && !isWebApplicationKey(args.application)) return fail("operatorRequired")
    const session = await ctx.runQuery(components.betterAuth.adapter.findOne, { model: "session", where: [{ field: "_id", value: args.sessionId }] })
    const accounts = await ctx.runQuery(components.betterAuth.adapter.findMany, { model: "account", where: [{ field: "userId", value: args.authUserId }, { field: "providerId", value: "idn" }], paginationOpts: { cursor: null, numItems: 2 } })
    const proof = await ctx.db.query("idnProofs").withIndex("by_subject", (q) => q.eq("subject", args.idnSubject)).unique()
    if (!session || session.userId !== args.authUserId || session.expiresAt <= now || !accounts.isDone || accounts.page.length !== 1 || accounts.page[0]?.accountId !== args.idnSubject || !proof || proof.loa !== args.loa || Math.abs(now - proof.observedAt) > 60_000) return fail("operatorRequired")
    const existing = await ctx.db.query("operatorSessionProofs").withIndex("by_session", (q) => q.eq("sessionId", args.sessionId)).unique()
    if (existing) {
      if (existing.authUserId !== args.authUserId || existing.idnSubject !== args.idnSubject || existing.loa !== args.loa || existing.application !== args.application) return fail("operatorRequired")
      return null
    }
    const person = await ctx.db.query("persons").withIndex("by_authUserId", (q) => q.eq("authUserId", args.authUserId)).unique()
    await ctx.db.insert("operatorSessionProofs", { ...args, ...(person ? { personId: person._id } : {}), observedAt: now, expiresAt: session.expiresAt })
    // Une rétention quotidienne bornée remplace un job lointain par connexion.
    // La lecture refuse déjà toute preuve expirée.
    return null
  },
})

export const purgeExpiredProofs = internalMutation({
  args: { before: v.optional(v.number()) }, returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const before = args.before ?? Date.now()
    const rows = await ctx.db.query("operatorSessionProofs").withIndex("by_expiry", (q) => q.lte("expiresAt", before)).take(100)
    for (const row of rows) await ctx.db.delete(row._id)
    if (rows.length === 100) await ctx.scheduler.runAfter(0, internal.modules.platform.operatorAccess.purgeExpiredProofs, { before })
    return null
  },
})

export const myOperator = operatorQuery({
  allowUnloggedAccess: true,
  args: {},
  returns: v.object({ admissionId: v.id("operatorSessionProofs"), personId: v.id("persons"), displayName: v.union(v.string(), v.null()), role: v.union(v.literal("platform_operator"), v.literal("platform_admin")) }),
  handler: async (ctx) => ({ admissionId: ctx.operatorSessionProof._id, personId: ctx.person._id, displayName: ctx.person.displayName ?? null, role: ctx.operator.role }),
})

export const recordAccess = operatorMutation({
  allowUnloggedAccess: true,
  args: {}, returns: v.null(),
  handler: async (ctx) => {
    const proof = await requireOperatorSession(ctx, ctx.person)
    if (proof.accessLoggedAt !== undefined) return null
    await ctx.db.patch(proof._id, { accessLoggedAt: Date.now() })
    await appendAudit(ctx, { action: "console.access", capacity: operatorCapacity(ctx.operator), actorPersonId: ctx.person._id, subject: { table: "operators", id: ctx.operator._id } })
    return null
  },
})
