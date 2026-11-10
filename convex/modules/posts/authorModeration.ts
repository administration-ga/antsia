/**
 * L'état de modération d'une publication, rendu à son AUTEUR seul (FD-04, issue antsia#108, demande
 * de la session DIASPORALE) : « publiée » ou « en relecture ». Aucune fonction Convex ici.
 *
 * L'auteur est celui de la règle « c'est ma publication » du moteur (`myPostFrom` : le droit de la
 * retirer, de l'éditer, de l'épingler) : la personne qui l'a écrite, et, pour une publication de
 * PAGE, seulement tant qu'elle en reste signataire VIVANT (le signataire historique ne garde rien).
 * Tout autre lecteur — modérateurs, signataires d'une page qui n'ont pas déposé la publication,
 * lecteur public — ne reçoit jamais le champ. Une galerie collective ou un reflet fédéré n'ont pas
 * d'auteur personnel : jamais de champ.
 *
 * Lecture seule de `moderationContentStates` par la fonction existante `contentState` : le module de
 * modération n'est pas modifié.
 */
import { v } from "convex/values"

import type { Doc, Id } from "../../_generated/dataModel"
import type { QueryCtx } from "../../_generated/server"
import { contentState } from "../moderation/policy"
import { liveSignatoryRole } from "../pages/access"
import { hasNativePostAuthor } from "./nativeAuthor"

type ReadCtx = Pick<QueryCtx, "db">

export const OWN_POST_MODERATION_STATES = ["published", "pending_review"] as const
export type OwnPostModeration = (typeof OWN_POST_MODERATION_STATES)[number]
export const ownPostModerationValidator = v.union(v.literal("published"), v.literal("pending_review"))

/**
 * L'état dit à l'auteur : `published` sans ligne d'état ou quand elle dit publiée ; tout ce qui n'est
 * pas publié se dit `pending_review` — jamais « publiée » pour un contenu que les autres ne lisent
 * pas. Le cas « retirée par décision » n'atteint que le rejeu d'une clé (une lecture ne sert jamais un
 * contenu retiré, pas même à son auteur) ; la décision motivée lui parvient par sa cloche
 * `moderation_decision`.
 */
export function ownPostModeration(state: Pick<Doc<"moderationContentStates">, "status"> | null): OwnPostModeration {
  return state === null || state.status === "published" ? "published" : "pending_review"
}

/** L'état de la publication relu maintenant, pour son auteur (retour d'un envoi, rejeu compris). */
export async function writtenPostModeration(ctx: ReadCtx, postId: Id<"posts">): Promise<OwnPostModeration> {
  return ownPostModeration(await contentState(ctx, "post", postId))
}

/** L'état pour CE lecteur s'il est l'auteur de la publication (voir l'en-tête), sinon `null`. */
export async function moderationForAuthor(ctx: ReadCtx, post: Doc<"posts">, readerPersonId: Id<"persons">): Promise<OwnPostModeration | null> {
  if (!hasNativePostAuthor(post) || post.authorPersonId !== readerPersonId) return null
  if (post.pageId !== undefined) {
    const page = await ctx.db.get(post.pageId)
    if (!page || (await liveSignatoryRole(ctx, page, readerPersonId)) === null) return null
  }
  return await writtenPostModeration(ctx, post._id)
}
