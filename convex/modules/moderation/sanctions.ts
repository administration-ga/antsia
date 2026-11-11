/** Suspension racine calculée depuis toutes les sanctions vivantes ; jamais rétablie trop tôt. */
import { isSanctionLive } from "@antsia/social-domain/moderationPolicy"

import type { Id } from "../../_generated/dataModel"
import type { MutationCtx } from "../../_generated/server"
import { getMembership, getRootNetwork } from "../../lib/access"
import { fail } from "../../lib/errors"
import { setMembershipStatus } from "../people/admission"
import { deferRestorationToJudicialHold } from "./judicialHolds"

export async function refreshSuspension(ctx: MutationCtx, personId: Id<"persons">): Promise<void> {
  const root = await getRootNetwork(ctx)
  if (!root) return
  const membership = await getMembership(ctx, root._id, personId)
  if (!membership) return
  const rows = await ctx.db.query("sanctions").withIndex("by_person_status", (q) => q.eq("personId", personId).eq("status", "active")).take(101)
  if (rows.length > 100) return fail("policyRefused")
  const restrictions = rows.filter((row) => (row.kind === "suspension" || row.kind === "exclusion") && isSanctionLive(row, Date.now()))
  if (restrictions.length === 0) {
    if (membership.status === "suspendue" && rows.some((row) => row.kind === "suspension" || row.kind === "exclusion")) return
    // Un état antérieur de modération peut être retrouvé dans une sanction révoquée ou échue.
    const history = await ctx.db.query("sanctions").withIndex("by_person_status", (q) => q.eq("personId", personId).eq("status", "revoked")).take(100)
    const expired = await ctx.db.query("sanctions").withIndex("by_person_status", (q) => q.eq("personId", personId).eq("status", "expired")).take(100)
    if (membership.status === "suspendue" && [...history, ...expired].some((row) => row.kind === "suspension" || row.kind === "exclusion")) {
      // SU01h : un compte aussi suspendu sur ordre du juge reste suspendu ; la mesure le rétablira à sa levée.
      if (await deferRestorationToJudicialHold(ctx, "person", personId, "suspend_account", "membershipSuspended")) return
      await setMembershipStatus(ctx, membership, membership.statusBeforeSuspension ?? "declaree", { statusBeforeSuspension: undefined, suspendedUntil: undefined })
    }
    return
  }
  if (membership.status === "partie") return
  const until = restrictions.some((row) => row.kind === "exclusion" || row.until === undefined) ? undefined : Math.max(...restrictions.map((row) => row.until ?? 0))
  const previous = membership.status === "suspendue" ? membership.statusBeforeSuspension : membership.status
  await setMembershipStatus(ctx, membership, "suspendue", { statusBeforeSuspension: previous ?? "declaree", suspendedUntil: until })
}
