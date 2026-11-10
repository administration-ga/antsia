/** MP12 : le job ne transporte que des références et ne réutilise jamais une autorisation devenue ancienne. */
import { v } from "convex/values"
import { internalMutation } from "../../_generated/server"
import { assertSocialWriteAllowed } from "../moderation/policy"
import { editorialAuthorityMatches, editorialMediaOf } from "./access"
import { publishEditorialVersion, refuseEditorialSchedule } from "./publication"

export const publishScheduled = internalMutation({
  args: { networkId: v.id("networks"), articleId: v.id("editorialArticles"), generation: v.number() }, returns: v.null(),
  handler: async (ctx, args) => {
    const article = await ctx.db.get(args.articleId), network = await ctx.db.get(args.networkId)
    if (!article || article.networkId !== args.networkId || !article.schedule || article.schedule.generation !== args.generation || article.revision !== args.generation || article.workingState !== "scheduled") return null
    const schedule = article.schedule
    if (schedule.publishAt > Date.now()) return null
    const version = await ctx.db.get(schedule.versionId), media = await editorialMediaOf(ctx, article.pageId)
    try {
      if (!network || network.status !== "active" || !media || media.revision !== schedule.mediaRevision || !version || article.workingVersionId !== version._id || version.digest !== schedule.digest || !await editorialAuthorityMatches(ctx, { networkId: args.networkId, personId: schedule.publisherPersonId }, article.pageId, schedule.authority, ["publisher"])) {
        await refuseEditorialSchedule(ctx, article, schedule.publisherPersonId)
        return null
      }
      await assertSocialWriteAllowed(ctx, args.networkId, schedule.publisherPersonId)
      await publishEditorialVersion(ctx, article, version, schedule.publisherPersonId)
    } catch (error) {
      // Un refus métier ferme la programmation. Les défauts d'infrastructure restent des échecs de job.
      if (!error || typeof error !== "object" || !("data" in error)) throw error
      await refuseEditorialSchedule(ctx, article, schedule.publisherPersonId)
    }
    return null
  },
})
