// Dupliqué de socle/convex/modules/reseauPersonnel/engagement.ts @ ad2e7fdc2 — adaptations : réagir et commenter dans un réseau (`networkMutation`, adhésion déclarée) ; LA garde de visibilité du moteur (`assertVisiblePost` : contexte de lecture, blocage, audience) ; réactions par FRAGMENTS et commentaires par l'AGRÉGAT — l'engagement n'écrit plus la publication (D01) ; `listComments` (100 lignes, 10 réponses, sans curseur) remplacée par `paginateComments` (racines paginées, aperçu des réponses et leur nombre) et `paginateReplies` (D03) ; commentaires d'un auteur bloqué écartés ; cloches par la porte unique, dans le réseau d'où le destinataire peut ouvrir la publication ; abonnés de la publication servis par la DIFFUSION PAR LOTS, re-gardés au moment de sonner (D08, au lieu d'une boucle de 100 dans la transaction) ; débit sur chaque geste ; une racine retirée emporte ses réponses et n'en reçoit plus, pas même par l'une d'elles (le socle laissait des réponses comptées que plus rien ne lisait).
/**
 * Réagir et commenter.
 *
 * L'AUTORISATION EST RELUE À CHAQUE ACTE : réagir et commenter exigent de VOIR
 * la publication au moment de l'acte. `assertVisiblePost` est le point de
 * passage unique ; une connexion rompue, un départ de groupe ou un blocage
 * referme aussitôt le fil de commentaires qu'ils ouvraient.
 */
import { addedMentionedIds, assertPersonalCommentBody } from "@antsia/social-domain/content"
import { paginationOptsValidator, type PaginationResult } from "convex/server"
import { v } from "convex/values"

import { canReadModeratedContent, moderateContentWrite } from "../moderation/policy"
import type { Doc, Id } from "../../_generated/dataModel"
import type { QueryCtx } from "../../_generated/server"
import { checked, notFound } from "../../lib/errors"
import { networkMutation, networkQuery } from "../../lib/functions"
import { enforceRateLimit } from "../../lib/rateLimit"
import { reactionKindValidator } from "../../lib/validators"
import { blockedCounterpartIds, type BoundedIds, isBlockedBetween } from "../graph/graph"
import { enqueueFanout } from "../notifications/fanout"
import { miniProfileCache, type PersonMiniProfile, resolveMentionedPersonIds } from "../people/miniProfile"
import { assertPostDiscussionOpen, assertVisiblePost, type ReaderContext } from "../posts/access"
import { markCommentRemoved } from "../posts/contentRemoval"
import { applyReactionDelta, countReplies, recordComment } from "../posts/counters"
import { notifyAboutPost } from "../posts/postNotify"
import { hasNativePostAuthor } from "../posts/nativeAuthor"

/** Réponses montrées sous une racine dans la page des commentaires ; la suite se pagine. */
const REPLIES_PREVIEW = 3

const readerOf = (ctx: { person: Doc<"persons">; network: Doc<"networks"> }): ReaderContext => ({ personId: ctx.person._id, network: ctx.network })

// ═══════════════════════════════════════════════════════════════
// Réactions
// ═══════════════════════════════════════════════════════════════

/**
 * Poser, changer ou retirer MA réaction — UNE par (publication, personne) :
 * changer de genre REMPLACE, rejouer le même genre RETIRE. L'auteur apprend
 * qu'on a réagi (la clé de dédoublonnage absorbe les hésitations).
 */
export const toggleReaction = networkMutation({
  minStatus: "declaree",
  args: { postId: v.id("posts"), kind: reactionKindValidator },
  returns: v.object({ mine: v.union(reactionKindValidator, v.null()) }),
  handler: async (ctx, { postId, kind }) => {
    await enforceRateLimit(ctx, "reaction.toggle", ctx.person._id)
    const post = await assertVisiblePost(ctx, readerOf(ctx), postId)
    // On ne réagit qu'à une publication EN LIGNE — l'auteur voit encore la sienne retirée, sans pouvoir y réagir.
    if (post.status !== "published") return notFound()

    const existing = await ctx.db
      .query("postReactions")
      .withIndex("by_post_and_person", (q) => q.eq("postId", postId).eq("personId", ctx.person._id))
      .unique()
    if (existing && existing.kind === kind) {
      await ctx.db.delete(existing._id)
      await applyReactionDelta(ctx, postId, ctx.person._id, kind, -1)
      return { mine: null }
    }
    if (existing) {
      await applyReactionDelta(ctx, postId, ctx.person._id, existing.kind, -1)
      await ctx.db.patch(existing._id, { kind, createdAt: Date.now() })
    } else {
      await ctx.db.insert("postReactions", { networkId: ctx.networkId, postId, personId: ctx.person._id, kind, createdAt: Date.now() })
    }
    await applyReactionDelta(ctx, postId, ctx.person._id, kind, 1)
    if (hasNativePostAuthor(post)) await notifyAboutPost(ctx, post, { recipientPersonId: post.authorPersonId, actorPersonId: ctx.person._id, kind: "post_reaction" })
    return { mine: kind }
  },
})

// ═══════════════════════════════════════════════════════════════
// Commentaires
// ═══════════════════════════════════════════════════════════════

/**
 * Commenter, ou répondre — UN SEUL NIVEAU : répondre à une réponse rattache à
 * la même racine. Le client envoie ce qu'il veut, le SERVEUR décide de la
 * profondeur. Un commentaire retiré n'accepte plus de réponse, et une référence
 * d'ailleurs rend le refus indistinct (greffer sa parole sous une conversation
 * qu'on ne lit pas, ou sonder l'existence d'un commentaire, n'est pas permis).
 */
export const comment = networkMutation({
  minStatus: "declaree",
  args: { postId: v.id("posts"), body: v.string(), parentCommentId: v.optional(v.id("postComments")) },
  returns: v.object({ commentId: v.id("postComments") }),
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, "comment.create", ctx.person._id)
    const post = await assertVisiblePost(ctx, readerOf(ctx), args.postId)
    if (post.status !== "published") return notFound()
    await assertPostDiscussionOpen(ctx, post)
    const body = checked(() => assertPersonalCommentBody(args.body))

    // `answered` : la personne dont on a cliqué le commentaire, AVANT l'aplatissement — c'est à elle qu'on répond.
    let parentCommentId: Id<"postComments"> | undefined
    let answeredPersonId: Id<"persons"> | undefined
    if (args.parentCommentId !== undefined) {
      const parent = await ctx.db.get(args.parentCommentId)
      if (!parent || parent.postId !== post._id || parent.status !== "published" || !(await canReadModeratedContent(ctx, "comment", parent._id, ctx.person._id))) return notFound()
      // Répondre à une réponse range sous SA racine : une racine retirée (dont les réponses partent par lots) n'en reçoit plus.
      if (parent.parentCommentId !== undefined) {
        const head = await ctx.db.get(parent.parentCommentId)
        if (!head || head.status !== "published") return notFound()
      }
      answeredPersonId = parent.authorPersonId
      parentCommentId = parent.parentCommentId ?? parent._id
    }

    const mentioned = (await resolveMentionedPersonIds(ctx, post.networkId, body)).filter((id) => id !== ctx.person._id)
    const now = Date.now()
    const commentId = await ctx.db.insert("postComments", {
      networkId: post.networkId,
      postId: post._id,
      authorPersonId: ctx.person._id,
      body,
      ...(parentCommentId !== undefined ? { parentCommentId } : {}),
      ...(mentioned.length > 0 ? { mentionedPersonIds: mentioned } : {}),
      status: "published",
      createdAt: now,
      updatedAt: now,
    })
    const admitted = await moderateContentWrite(ctx, { networkId: post.networkId, ownerPersonId: ctx.person._id, kind: "comment", id: commentId, text: body })
    if (!admitted) return { commentId }
    await recordComment(ctx, { _id: commentId, postId: post._id, ...(parentCommentId !== undefined ? { parentCommentId } : {}), createdAt: now })

    // L'auteur de la publication, la personne à qui l'on répond, les personnes citées : chacun s'il peut ouvrir la publication.
    if (hasNativePostAuthor(post)) await notifyAboutPost(ctx, post, { recipientPersonId: post.authorPersonId, actorPersonId: ctx.person._id, kind: "post_comment" })
    if (answeredPersonId !== undefined && answeredPersonId !== post.authorPersonId) {
      await notifyAboutPost(ctx, post, { recipientPersonId: answeredPersonId, actorPersonId: ctx.person._id, kind: "post_comment" })
    }
    for (const personId of mentioned) await notifyAboutPost(ctx, post, { recipientPersonId: personId, actorPersonId: ctx.person._id, kind: "mention" })
    // Les abonnés de la publication : par lots, hors de cette transaction, re-gardés au moment de sonner.
    await enqueueFanout(ctx, { networkId: post.networkId, actorPersonId: ctx.person._id, kind: "post_comment", subject: { post: post._id }, source: { kind: "postSubscribers", postId: post._id } })
    return { commentId }
  },
})

/**
 * Retirer un commentaire — son AUTEUR, ou l'auteur de la publication (chez soi,
 * on garde la main sur ce qui s'affiche). Retiré, pas supprimé. Idempotent.
 * Une racine retirée emporte ses réponses (`markCommentRemoved`).
 */
export const removeComment = networkMutation({
  minStatus: "en_attente",
  args: { commentId: v.id("postComments") },
  returns: v.object({ removed: v.literal(true) }),
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, "comment.remove", ctx.person._id)
    const comment = await ctx.db.get(args.commentId)
    if (!comment) return notFound()
    // La garde de visibilité d'abord : on ne raisonne pas sur un commentaire porté par une publication invisible.
    const post = await assertVisiblePost(ctx, readerOf(ctx), comment.postId)
    if (comment.authorPersonId !== ctx.person._id && (!hasNativePostAuthor(post) || post.authorPersonId !== ctx.person._id)) return notFound()
    await markCommentRemoved(ctx, comment, Date.now())
    return { removed: true as const }
  },
})

/** Modifier MON commentaire ; seules les citations AJOUTÉES sont prévenues. */
export const editComment = networkMutation({
  minStatus: "declaree",
  args: { commentId: v.id("postComments"), body: v.string() },
  returns: v.object({ editedAt: v.number() }),
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, "comment.edit", ctx.person._id)
    const comment = await ctx.db.get(args.commentId)
    if (!comment || comment.authorPersonId !== ctx.person._id || comment.status !== "published") return notFound()
    const post = await assertVisiblePost(ctx, readerOf(ctx), comment.postId)
    await assertPostDiscussionOpen(ctx, post)
    const body = checked(() => assertPersonalCommentBody(args.body))
    const mentioned = (await resolveMentionedPersonIds(ctx, post.networkId, body)).filter((id) => id !== ctx.person._id)
    const now = Date.now()
    await ctx.db.patch(comment._id, { body, mentionedPersonIds: mentioned.length > 0 ? mentioned : undefined, editedAt: now, updatedAt: now })
    const admitted = await moderateContentWrite(ctx, { networkId: post.networkId, ownerPersonId: ctx.person._id, kind: "comment", id: comment._id, text: body })
    if (!admitted) return { editedAt: now }
    for (const personId of addedMentionedIds(comment.mentionedPersonIds, mentioned)) {
      await notifyAboutPost(ctx, post, { recipientPersonId: personId, actorPersonId: ctx.person._id, kind: "mention" })
    }
    return { editedAt: now }
  },
})

// ═══════════════════════════════════════════════════════════════
// Lire les commentaires
// ═══════════════════════════════════════════════════════════════

export type ReplyDto = {
  commentId: Id<"postComments">
  author: Pick<PersonMiniProfile, "personId" | "displayName" | "handle" | "avatarUrl">
  body: string
  createdAt: number
  editedAt: number | null
  isMine: boolean
}

export type CommentDto = ReplyDto & {
  /** Réponses vivantes sous cette racine — l'aperçu en montre au plus trois, la suite se pagine. */
  replyCount: number
  replies: ReplyDto[]
}

/** Commentaires d'un auteur bloqué : écartés, comme ses publications. Ensemble lu une fois, paire relue s'il est tronqué. */
async function blockedFilter(ctx: Pick<QueryCtx, "db">, reader: ReaderContext): Promise<(personId: Id<"persons">) => Promise<boolean>> {
  const blocked: BoundedIds = await blockedCounterpartIds(ctx, reader.personId)
  return async (personId) => {
    if (personId === reader.personId) return false
    if (blocked.ids.has(personId)) return true
    return blocked.truncated ? await isBlockedBetween(ctx, reader.personId, personId) : false
  }
}

function toReply(row: Doc<"postComments">, author: PersonMiniProfile, reader: ReaderContext): ReplyDto {
  return {
    commentId: row._id,
    author: { personId: author.personId, displayName: author.displayName, handle: author.handle, avatarUrl: author.avatarUrl },
    body: row.body,
    createdAt: row.createdAt,
    editedAt: row.editedAt ?? null,
    isMine: row.authorPersonId === reader.personId,
  }
}

/**
 * Les commentaires d'une publication : les RACINES paginées, des plus anciennes
 * aux plus récentes, chacune avec l'aperçu de ses réponses et leur nombre. La
 * MÊME garde que pour réagir : lire les commentaires, c'est lire la publication.
 */
export const paginateComments = networkQuery({
  args: { postId: v.id("posts"), paginationOpts: paginationOptsValidator },
  handler: async (ctx, args): Promise<PaginationResult<CommentDto>> => {
    const reader = readerOf(ctx)
    await assertVisiblePost(ctx, reader, args.postId)
    const result = await ctx.db
      .query("postComments")
      .withIndex("by_post_parent_status_createdAt", (q) => q.eq("postId", args.postId).eq("parentCommentId", undefined).eq("status", "published"))
      .paginate(args.paginationOpts)
    const isBlocked = await blockedFilter(ctx, reader)
    const profileOf = miniProfileCache(ctx)
    const page: CommentDto[] = []
    for (const root of result.page) {
      if (await isBlocked(root.authorPersonId) || !(await canReadModeratedContent(ctx, "comment", root._id, reader.personId))) continue
      const preview = await ctx.db
        .query("postComments")
        .withIndex("by_post_parent_status_createdAt", (q) => q.eq("postId", args.postId).eq("parentCommentId", root._id).eq("status", "published"))
        .take(REPLIES_PREVIEW)
      const replies: ReplyDto[] = []
      for (const reply of preview) {
        if (await isBlocked(reply.authorPersonId) || !(await canReadModeratedContent(ctx, "comment", reply._id, reader.personId))) continue
        replies.push(toReply(reply, await profileOf(reply.authorPersonId), reader))
      }
      page.push({ ...toReply(root, await profileOf(root.authorPersonId), reader), replyCount: await countReplies(ctx, root._id), replies })
    }
    return { ...result, page }
  },
})

/** Les réponses d'une racine, paginées dans l'ordre — la suite de l'aperçu. */
export const paginateReplies = networkQuery({
  args: { postId: v.id("posts"), commentId: v.id("postComments"), paginationOpts: paginationOptsValidator },
  handler: async (ctx, args): Promise<PaginationResult<ReplyDto>> => {
    const reader = readerOf(ctx)
    await assertVisiblePost(ctx, reader, args.postId)
    const root = await ctx.db.get(args.commentId)
    if (!root || root.postId !== args.postId || root.parentCommentId !== undefined || root.status !== "published" || !(await canReadModeratedContent(ctx, "comment", root._id, reader.personId))) return notFound()
    const result = await ctx.db
      .query("postComments")
      .withIndex("by_post_parent_status_createdAt", (q) => q.eq("postId", args.postId).eq("parentCommentId", root._id).eq("status", "published"))
      .paginate(args.paginationOpts)
    const isBlocked = await blockedFilter(ctx, reader)
    const profileOf = miniProfileCache(ctx)
    const page: ReplyDto[] = []
    for (const reply of result.page) {
      if (await isBlocked(reply.authorPersonId) || !(await canReadModeratedContent(ctx, "comment", reply._id, reader.personId))) continue
      page.push(toReply(reply, await profileOf(reply.authorPersonId), reader))
    }
    return { ...result, page }
  },
})
