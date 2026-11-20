// Dupliqué de socle/convex/modules/reseauPages/followedUpdates.ts @ ad2e7fdc2 — adaptations : PAR RÉSEAU (les pages suivies lisibles d'ici ; à la racine, leurs publications de la racine) ; identité lue sur la PAGE (`pageCardOf` : logo par la garde des fichiers) au lieu d'une organisation ; seuls les COMMUNIQUÉS (`public`) font un rappel, chacun repassé par LA garde de lecture du moteur ; extrait du domaine pur (`followedUpdateExcerpt`) ; même plafond de sources que le fil (`PAGES_FEED_MAX`).
/**
 * Rappels compacts des COMMUNIQUÉS des pages que je suis — « ce que vos pages
 * ont publié », cinq au plus, les plus récents d'abord. Une note aux abonnés
 * (`followers`) n'est pas un rappel public : elle se lit dans le fil.
 */
import { followedUpdateExcerpt, PAGES_FEED_MAX } from "@antsia/social-domain/pages"
import { type Infer, v } from "convex/values"

import type { Doc } from "../../_generated/dataModel"
import { networkQuery } from "../../lib/functions"
import { canSeePostDoc } from "../posts/access"
import { pageReader } from "../posts/posts"
import { pageCardOf, readablePageOrNull } from "./access"
import { myPageFollowRows } from "./follows"
import { pageCardValidator } from "./validators"

const RESULT_LIMIT = 5
/**
 * Une petite fenêtre par page suffit au rappel et garde la lecture bornée : le
 * fil ouvre déjà cinquante lignes par page ; ce résumé, qui en rend cinq, n'en
 * examine jamais plus de douze.
 */
const POSTS_PER_PAGE_SCAN = 12

export const followedUpdateValidator = v.object({
  postId: v.id("posts"),
  publishedAt: v.number(),
  excerpt: v.string(),
  page: pageCardValidator,
})

export type FollowedUpdate = Infer<typeof followedUpdateValidator>

type Candidate = { post: Doc<"posts">; update: FollowedUpdate }

/** Ordre du fil : date métier, puis ordre de création, puis identifiant. */
function compareCandidates(a: Candidate, b: Candidate): number {
  if (a.post.publishedAt !== b.post.publishedAt) return b.post.publishedAt - a.post.publishedAt
  if (a.post._creationTime !== b.post._creationTime) return b.post._creationTime - a.post._creationTime
  return String(b.post._id).localeCompare(String(a.post._id))
}

export const list = networkQuery({
  feature: "pages",
  args: {},
  returns: v.array(followedUpdateValidator),
  handler: async (ctx): Promise<FollowedUpdate[]> => {
    const reader = { personId: ctx.person._id, network: ctx.network }
    // Même plafond de sources que le fil : le nombre de pages suivies ne rend jamais cette lecture non bornée.
    const follows = await myPageFollowRows(ctx, ctx.network, ctx.person._id, PAGES_FEED_MAX)
    const windows = await Promise.all(
      follows.map(async (follow): Promise<Candidate[]> => {
        // Retirée ou illisible d'ici : aucun rappel orphelin.
        const page = await readablePageOrNull(ctx, ctx.network, follow.pageId)
        if (!page) return []
        const posts = await pageReader(ctx, ctx.network, page._id)({ kind: "all" }, POSTS_PER_PAGE_SCAN)
        const card = await pageCardOf(ctx, page)
        const candidates: Candidate[] = []
        for (const post of posts) {
          if (post.audience !== "public" || !(await canSeePostDoc(ctx, reader, post))) continue
          candidates.push({ post, update: { postId: post._id, publishedAt: post.publishedAt, excerpt: followedUpdateExcerpt(post.body), page: card } })
        }
        return candidates
      }),
    )
    return windows
      .flat()
      .sort(compareCandidates)
      .slice(0, RESULT_LIMIT)
      .map(({ update }) => update)
  },
})
