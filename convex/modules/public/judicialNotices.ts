/**
 * SU01h — le correctif épinglé et l'étiquette d'origine ordonnés par le juge, pour les pages publiques.
 *
 * Projection À PART (piège des projections publiques en schéma strict, `CLAUDE.md`) : aucune projection
 * existante ne change de forme ; le front qui la lit l'ignore si elle manque. Seule une cible déjà
 * lisible sans compte (publication racine publique, profil public, page Officiel) rend ses avis.
 */
import { normalizeHandle } from "@antsia/social-domain/content"
import { v } from "convex/values"

import { query } from "../../_generated/server"
import { liveJudicialNotices } from "../moderation/judicialHolds"
import { judicialNoticeValidator } from "../moderation/measures"
import { publicContext, publicPageByHandle, publicPostEligible, publicProfileByHandle } from "./access"

const REF_MAX = 200

/** @publicProjection SU01h : correctif et étiquette d'origine vivants d'une cible publique déjà lisible, sans opérateur ni référence. */
export const notices = query({
  args: { networkId: v.id("networks"), target: v.union(v.object({ kind: v.literal("post"), id: v.string() }), v.object({ kind: v.literal("person"), handle: v.string() }), v.object({ kind: v.literal("page"), handle: v.string() })) },
  returns: v.array(judicialNoticeValidator),
  handler: async (ctx, args) => {
    const context = await publicContext(ctx, args.networkId)
    const target = args.target
    if (target.kind === "post") {
      const id = target.id.length <= REF_MAX ? ctx.db.normalizeId("posts", target.id) : null
      const post = id ? await ctx.db.get(id) : null
      return post && await publicPostEligible(ctx, context, post) ? await liveJudicialNotices(ctx, "post", post._id) : []
    }
    if (target.handle.length > REF_MAX) return []
    if (target.kind === "person") {
      if (!(await publicProfileByHandle(ctx, context, target.handle))) return []
      const person = await ctx.db.query("persons").withIndex("by_handle", (q) => q.eq("handle", normalizeHandle(target.handle))).unique()
      return person ? await liveJudicialNotices(ctx, "person", person._id) : []
    }
    const page = await publicPageByHandle(ctx, context, target.handle)
    return page ? await liveJudicialNotices(ctx, "page", page._id) : []
  },
})
