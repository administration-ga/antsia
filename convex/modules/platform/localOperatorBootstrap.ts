/** Amorçage du premier opérateur par le propriétaire CLI, exclusivement sur un backend local. */
import { assertDecisionReason } from "@antsia/social-domain/audit"
import { isActiveStatus } from "@antsia/social-domain/membership"
import { v } from "convex/values"

import { components } from "../../_generated/api"
import type { Doc, Id } from "../../_generated/dataModel"
import { internalMutation, type MutationCtx } from "../../_generated/server"
import { devToolsAllowed } from "../../lib/devTools"
import { checked, fail } from "../../lib/errors"
import { localCommerceLoa1Allowed } from "../../lib/localCommerceSandbox"
import { isLiveOperatorSession } from "../../lib/operatorIdentity"
import { hasStrongIdentityFor } from "../people/persons"
import { appendAudit } from "./audit"

export const LOCAL_OPERATOR_BOOTSTRAP_CONFIRMATION = "ANTSIA_INITIAL_OPERATOR_HORS_PRODUCTION"
export const LOCAL_OPERATOR_BOOTSTRAP_MAX_AGE_MS = 15 * 60_000
const SESSION_PROOF_LIMIT = 20
type Result = { operatorId: Id<"operators">; personId: Id<"persons">; changed: boolean }

function localBootstrapAllowed(): boolean {
  if (!devToolsAllowed()) return false
  const site = process.env.CONVEX_SITE_URL
  if (!site) return false
  try {
    const url = new URL(site)
    return url.origin === site && url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname)
  } catch { return false }
}

/** Une preuve scellée du candidat, jamais une identité fabriquée pour la mutation interne. */
async function hasRecentIdnSession(ctx: MutationCtx, person: Doc<"persons">, now: number, minimumLoa: 1 | 2): Promise<boolean> {
  const proofs = await ctx.db.query("operatorSessionProofs").withIndex("by_person", q => q.eq("personId", person._id))
    .order("desc").take(SESSION_PROOF_LIMIT)
  for (const proof of proofs) {
    if (proof.personId !== person._id || proof.authUserId !== person.authUserId || proof.loa < minimumLoa ||
      !Number.isFinite(proof.observedAt) || proof.observedAt > now || proof.observedAt < now - LOCAL_OPERATOR_BOOTSTRAP_MAX_AGE_MS) continue
    const currentProofs = await ctx.db.query("idnProofs").withIndex("by_subject", q => q.eq("subject", proof.idnSubject)).take(2)
    if (currentProofs.length !== 1 || (currentProofs[0]?.loa ?? 0) < minimumLoa) continue
    if (await isLiveOperatorSession(ctx, person, proof)) return true
  }
  return false
}

/** Aucune preuve, personne ou adhésion n’est créée ici ; aucune porte publique n’appelle cette fonction. */
export const run = internalMutation({
  args: { email: v.string(), confirmNonProduction: v.string(), reason: v.string() },
  returns: v.object({ operatorId: v.id("operators"), personId: v.id("persons"), changed: v.boolean() }),
  handler: async (ctx, args): Promise<Result> => {
    if (!localBootstrapAllowed() || args.confirmNonProduction !== LOCAL_OPERATOR_BOOTSTRAP_CONFIRMATION) return fail("policyRefused")
    const email = args.email.trim().toLowerCase()
    if (!email || email.length > 320 || /[\s\p{Cc}]/u.test(email)) return fail("invalidArgument", { field: "email" })
    const reason = checked(() => assertDecisionReason(args.reason, 10))
    if (reason.includes("@") || /\p{Cc}/u.test(reason)) return fail("invalidArgument", { field: "reason" })
    const users = await ctx.runQuery(components.betterAuth.adapter.findMany, {
      model: "user", where: [{ field: "email", value: email }], select: ["_id", "email", "emailVerified"],
      paginationOpts: { cursor: null, numItems: 2 },
    })
    const user = users.page[0]
    if (!users.isDone || users.page.length !== 1 || !user || typeof user._id !== "string" || user.email !== email || user.emailVerified !== true) return fail("operatorRequired")
    const authUserId = user._id
    const persons = await ctx.db.query("persons").withIndex("by_authUserId", q => q.eq("authUserId", authUserId)).take(2)
    const person = persons[0]
    if (persons.length !== 1 || !person || person.authUserId !== user._id || person.erasedAt !== undefined || person.deletionRequestedAt !== undefined) return fail("operatorRequired")
    const roots = await ctx.db.query("networks").withIndex("by_kind_and_status", q => q.eq("kind", "root").eq("status", "active")).take(2)
    const root = roots[0]
    if (roots.length !== 1 || !root) return fail("operatorRequired")
    const memberships = await ctx.db.query("networkMemberships").withIndex("by_network_and_person", q => q.eq("networkId", root._id).eq("personId", person._id)).take(2)
    if (memberships.length !== 1 || !memberships[0] || !isActiveStatus(memberships[0].status)) return fail("operatorRequired")
    const operators = await ctx.db.query("operators").take(2)
    const existing = operators[0]
    if (operators.length > 1 || (existing && (existing.personId !== person._id || existing.role !== "platform_admin" || existing.revokedAt !== undefined))) return fail("operatorRequired")
    const now = Date.now()
    const minimumLoa = localCommerceLoa1Allowed() ? 1 : 2
    if ((minimumLoa === 2 && !await hasStrongIdentityFor(ctx, person._id)) || !await hasRecentIdnSession(ctx, person, now, minimumLoa)) return fail("operatorRequired")
    if (existing) return { operatorId: existing._id, personId: person._id, changed: false }
    const operatorId = await ctx.db.insert("operators", { personId: person._id, role: "platform_admin", grantedAt: now })
    await appendAudit(ctx, { action: "operator.bootstrap", capacity: "system", subject: { table: "operators", id: operatorId }, details: { reason }, at: now })
    return { operatorId, personId: person._id, changed: true }
  },
})
