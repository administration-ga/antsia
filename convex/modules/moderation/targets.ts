/** Résolution polymorphe : chaque cible passe par son audience réelle, sans copie de contenu. */
import type { ModerationSurface } from "@antsia/social-domain/moderationPolicy"
import { isStoryVisibleTo } from "@antsia/social-domain/stories"
import type { Infer } from "convex/values"

import { internal } from "../../_generated/api"
import type { Doc, Id } from "../../_generated/dataModel"
import type { MutationCtx } from "../../_generated/server"
import { getRootNetwork, isActiveMember } from "../../lib/access"
import { notFound } from "../../lib/errors"
import { canReadCommercialMessage } from "../commercialMessaging/access"
import { canReadContextualMessage, contextualThreadAccess } from "../contextualMessaging/access"
import { onContextualMessageReleased, syncContextualConversation } from "../contextualMessaging/hooks"
import { canSeeAlbum } from "../albums/access"
import { requireEventAccess } from "../events/events"
import { schedulePageEventSeatFill } from "../events/pageEventRegistrations"
import { isFederatedContentAvailable } from "../federation/mirrorAccess"
import { retryFederatedMedia } from "../federation/mediaJobs"
import { isBlockedBetween, isConnectedTo } from "../graph/graph"
import { requireLiveMembership } from "../groups/access"
import { isVisibleToMember } from "../groups/messages"
import { scheduleGroupMessageFanout } from "../groups/unread"
import { assertVisibleDirectSession } from "../live/access"
import { recomputeAggregates } from "../live/reap"
import { previewColumns } from "../messaging/threads"
import { enqueueFanout } from "../notifications/fanout"
import { notifyPerson } from "../notifications/notify"
import { liveSignatoryRole, readablePageOrNull } from "../pages/access"
import { editorialAccessOrNull } from "../editorial/access"
import { readableEditorialMedia, readableEditorialVersion } from "../editorial/read"
import { headBelongsToCurrentCatalog, readableCatalogMapping } from "../shops/catalogAccess"
import { jobHeadBelongsToCurrent, readableJobMapping } from "../shops/jobAccess"
import { readableServiceReviewOrNull } from "../diaspora/serviceReviews"
import { removeDiasporaTarget, resolveDiasporaTarget, restoreDiasporaTarget } from "../diaspora/moderationTargets"
import { isPublishedPerson } from "../people/miniProfile"
import { readableProfessionalCollaboration, readableProfessionalProfile } from "../professionals/read"
import { syncProfessionalProfileConversations } from "../professionals/profiles"
import { assertVisiblePost } from "../posts/access"
import { markCommentRemoved, markPostRemoved } from "../posts/contentRemoval"
import { recordComment, recordPagePost, recordShare } from "../posts/counters"
import { schedulePostFeed } from "../posts/feedMaterialization"
import { notifyMentions } from "../posts/postWrite"
import { canReadModeratedContent, contentState, setContentModerationStatus } from "./policy"
import type { moderationTargetValidator } from "./tables"
import { editorialMediaReviewSource, editorialReviewSource } from "./editorialReviewSource"

export type ModerationTarget = Infer<typeof moderationTargetValidator>
export type ResolvedTarget = { target: ModerationTarget; networkId: Id<"networks">; ownerPersonId?: Id<"persons"> }

export async function resolveVisibleTarget(ctx: MutationCtx, network: Doc<"networks">, personId: Id<"persons">, target: ModerationTarget): Promise<ResolvedTarget> {
  if (!(await canReadModeratedContent(ctx, target.kind, target.id, personId))) return notFound()
  const base = { target, networkId: network._id }
  switch (target.kind) {
    case "commercialMessage": {
      const message = await ctx.db.get(target.id)
      if (!message || !await canReadCommercialMessage(ctx, network._id, personId, message._id)) return notFound()
      return { ...base, ownerPersonId: message.senderPersonId }
    }
    case "contextualMessage": {
      // CC-2b : seule une partie qui LIT actuellement le message le signale ; un signataire ne signale
      // jamais un message en voix de SA page (il peut signaler celui du demandeur).
      const message = await ctx.db.get(target.id)
      if (!message || !(await canReadContextualMessage(ctx, network._id, personId, message._id))) return notFound()
      if (message.voice === "page") {
        const access = await contextualThreadAccess(ctx, { networkId: network._id, personId, threadId: message.threadId })
        if (access === null || access.side === "responder") return notFound()
        // Contenu de la page : aucun propriétaire personnel (la page, `ownerPageId`, est posée à l'écriture).
        return base
      }
      return message.authorPersonId !== undefined ? { ...base, ownerPersonId: message.authorPersonId } : notFound()
    }
    case "editorialMedia": {
      const live = await readableEditorialMedia(ctx, network._id, target.id, personId)
      if (!live || live.media.createdByPersonId === personId || await liveSignatoryRole(ctx, live.page, personId) !== null ||
        await editorialAccessOrNull(ctx, { networkId: network._id, personId }, live.page._id)) return notFound()
      return base
    }
    case "editorialVersion": {
      const live = await readableEditorialVersion(ctx, network._id, target.id, personId)
      if (!live || live.article.publicationState !== "published" || live.article.publishedVersionId !== target.id) return notFound()
      // La rédaction retire ou corrige son propre article ; elle ne s'auto-signale pas.
      if (live.version.authorPersonId === personId || await liveSignatoryRole(ctx, live.page, personId) !== null ||
        await editorialAccessOrNull(ctx, { networkId: network._id, personId }, live.page._id)) return notFound()
      // L'article appartient à la page, aucun auteur ne reçoit de sanction personnelle par ce contenu collectif.
      return base
    }
    case "professionalProfile": {
      const row = await ctx.db.get(target.id)
      const live = row?.networkId === network._id ? await readableProfessionalProfile(ctx, network._id, row.personId, personId) : null
      if (!live || live.profile._id !== target.id) return notFound()
      return { ...base, ownerPersonId: live.profile.personId }
    }
    case "professionalCollaboration": {
      const row = await ctx.db.get(target.id)
      if (!row || row.networkId !== network._id || !await readableProfessionalCollaboration(ctx, row, personId)) return notFound()
      return { ...base, ownerPersonId: row.fromPersonId }
    }
    case "post": {
      const post = await assertVisiblePost(ctx, { personId, network }, target.id)
      if (post.status !== "published") return notFound()
      return { ...base, networkId: post.networkId, ownerPersonId: post.authorPersonId }
    }
    case "comment": {
      const comment = await ctx.db.get(target.id)
      if (!comment || comment.status !== "published") return notFound()
      const post = await assertVisiblePost(ctx, { personId, network }, comment.postId)
      return { ...base, networkId: post.networkId, ownerPersonId: comment.authorPersonId }
    }
    case "groupMessage": {
      const message = await ctx.db.get(target.id)
      if (!message || message.networkId !== network._id || message.type !== "text" || message.deletedAt !== undefined) return notFound()
      const { member } = await requireLiveMembership(ctx, network._id, message.threadId, personId)
      if (!(await isVisibleToMember(ctx, message, member)) || await isBlockedBetween(ctx, personId, message.senderPersonId)) return notFound()
      return { ...base, ownerPersonId: message.senderPersonId }
    }
    case "event": {
      const { event } = await requireEventAccess(ctx, network._id, target.id, personId)
      return { ...base, ...(event.organizerPageId ? {} : event.organizerPersonId ? { ownerPersonId: event.organizerPersonId } : {}) }
    }
    case "page": {
      const page = await readablePageOrNull(ctx, network, target.id, personId)
      if (!page) return notFound()
      return { ...base, networkId: page.networkId, ...(page.createdByPersonId ? { ownerPersonId: page.createdByPersonId } : {}) }
    }
    case "person": {
      const person = await ctx.db.get(target.id)
      if (!person || !isPublishedPerson(person) || !(await isActiveMember(ctx, network._id, person._id)) || await isBlockedBetween(ctx, personId, person._id)) return notFound()
      const root = await getRootNetwork(ctx)
      if (!root) return notFound()
      return { ...base, networkId: root._id, ownerPersonId: person._id }
    }
    case "live": {
      const session = await assertVisibleDirectSession(ctx, { personId, networkId: network._id, membershipProven: true }, target.id)
      return { ...base, ownerPersonId: session.hostPersonId }
    }
    case "story": {
      const story = await ctx.db.get(target.id)
      if (!story || story.networkId !== network._id) return notFound()
      if (!isStoryVisibleTo({ audience: story.audience, isAuthor: story.authorPersonId === personId, isConnected: await isConnectedTo(ctx, network._id, personId, story.authorPersonId), isBlockedWithAuthor: await isBlockedBetween(ctx, personId, story.authorPersonId), isRemoved: story.removedAt !== undefined, isExpired: story.expiresAt <= Date.now() })) return notFound()
      return { ...base, ownerPersonId: story.authorPersonId }
    }
    case "album": {
      const album = await ctx.db.get(target.id)
      if (!album || album.status !== "published" || !(await canSeeAlbum(ctx, album, { networkId: network._id, personId }))) return notFound()
      return { ...base, ownerPersonId: album.ownerPersonId }
    }
    case "serviceReview": {
      const review = await readableServiceReviewOrNull(ctx, network, target.id, personId)
      if (!review) return notFound()
      return { ...base, ownerPersonId: review.authorPersonId }
    }
    case "serviceReviewReply": {
      const reply = await ctx.db.get(target.id)
      if (!reply || reply.networkId !== network._id || reply.status !== "active") return notFound()
      const review = await readableServiceReviewOrNull(ctx, network, reply.reviewId, personId)
      if (!review || reply.pageId !== review.pageId || await isBlockedBetween(ctx, personId, reply.authorPersonId)) return notFound()
      // La réponse appartient à la page ; un signataire n'en devient pas propriétaire.
      return base
    }
    case "commerceStorefront": {
      const head = await ctx.db.get(target.id)
      if (!head || head.objectKind !== "shop" || head.sequence !== "catalog" || head.state !== "active") return notFound()
      const live = await readableCatalogMapping(ctx, network, head.shopId, personId)
      if (!live || live.parentHead._id !== head._id || !live.parent.storefrontTerms) return notFound()
      return { ...base, networkId: head.networkId }
    }
    case "commerceOffer": {
      const head = await ctx.db.get(target.id)
      if (!head || head.objectKind !== "offer" || head.sequence !== "catalog" || head.state !== "active") return notFound()
      const live = await readableCatalogMapping(ctx, network, head.shopId, personId)
      if (!live || !headBelongsToCurrentCatalog(head, live)) return notFound()
      return { ...base, networkId: head.networkId }
    }
    case "commerceJob": {
      // P15 : une offre d'emploi est un contenu de la page ; aucun recruteur ni candidat n'en devient propriétaire.
      const head = await ctx.db.get(target.id)
      if (!head || head.state === "withdrawn") return notFound()
      const live = await readableJobMapping(ctx, network, head.shopId, personId)
      if (!live || !jobHeadBelongsToCurrent(head, live)) return notFound()
      return { ...base, networkId: head.networkId }
    }
    // Vague H DIASPORALE (G9, délégué) : audience réelle et propriétaire résolus par la tranche (personne, ou page sans propriétaire).
    case "diasporaAidQuestion":
    case "diasporaAidAnswer":
    case "diasporaAidMission":
    case "diasporaMentorProfile":
    case "diasporaMentoringRequest":
    case "diasporaKitResource":
    case "diasporaJobOffer":
    case "diasporaTalentProfile":
    case "diasporaJobApplication": {
      const owner = await resolveDiasporaTarget(ctx, network, personId, target)
      if (!owner) return notFound()
      return { ...base, ...owner }
    }
  }
}

/** Relit le nouvel état de modération ; restaurer ne change aucun statut métier ni consentement. */
async function syncProfessionalTarget(ctx: MutationCtx, target: ResolvedTarget): Promise<void> {
  if (target.target.kind === "professionalCollaboration") {
    await syncContextualConversation(ctx, { kind: "professionalCollaboration", id: target.target.id })
  } else if (target.target.kind === "professionalProfile") {
    const row = await ctx.db.get(target.target.id)
    if (row?.networkId === target.networkId) await syncProfessionalProfileConversations(ctx, { networkId: target.networkId, personId: row.personId })
  }
}

export async function removeTarget(ctx: MutationCtx, target: ResolvedTarget): Promise<void> {
  // Vague H DIASPORALE (G9) : effets de la tranche jugés sur l'état AVANT retrait (idempotents) ; sans effet pour les autres natures.
  await removeDiasporaTarget(ctx, target.target)
  await setContentModerationStatus(ctx, { networkId: target.networkId, kind: target.target.kind, id: target.target.id, ownerPersonId: target.ownerPersonId }, "removed")
  await syncProfessionalTarget(ctx, target)
  if (target.target.kind === "post") {
    const post = await ctx.db.get(target.target.id)
    if (post) await markPostRemoved(ctx, post, Date.now())
  } else if (target.target.kind === "comment") {
    const comment = await ctx.db.get(target.target.id)
    if (comment) await markCommentRemoved(ctx, comment, Date.now())
  } else if (target.target.kind === "page") {
    await ctx.scheduler.runAfter(0, internal.modules.live.revocation.closePageDirects, { pageId: target.target.id, cursor: null, revokedAt: Date.now() })
  } else if (target.target.kind === "live") {
    const session = await ctx.db.get(target.target.id)
    if (session) {
      if (session.status !== "ended") {
        await ctx.db.patch(session._id, { status: "ended", endedAt: Date.now(), updatedAt: Date.now() })
        await recomputeAggregates(ctx, session._id)
      }
      await ctx.scheduler.runAfter(0, internal.modules.live.livekitActions.closeDirectRoom, { roomName: session.roomName })
      if (session.egressId) await ctx.scheduler.runAfter(0, internal.modules.live.livekitActions.stopDirectEgress, { egressId: session.egressId })
    }
  } else if (target.target.kind === "groupMessage") {
    const message = await ctx.db.get(target.target.id)
    if (message) {
      const thread = await ctx.db.get(message.threadId)
      if (thread?.lastMessageId === message._id) await ctx.db.patch(thread._id, { lastMessageText: undefined, lastMessageKind: undefined, lastMessageAttachmentCount: undefined })
      if (thread?.pinnedMessageId === message._id) await ctx.db.patch(thread._id, { pinnedMessageId: undefined })
    }
  }
}

/** Rétablir l'accès ne redémarre jamais une salle ni une capture. */
export async function restoreTarget(ctx: MutationCtx, target: ResolvedTarget): Promise<void> {
  if (target.target.kind === "editorialMedia" && !await editorialMediaReviewSource(ctx, target.networkId, target.target.id)) return notFound()
  if (target.target.kind === "editorialVersion" && !await editorialReviewSource(ctx, target.networkId, target.target.id)) return notFound()
  if ((target.target.kind === "post" || target.target.kind === "page") && !(await isFederatedContentAvailable(ctx, target.target.kind === "post" ? "posts" : "pages", target.target.id))) return notFound()
  if (target.target.kind === "commerceStorefront") {
    const head = await ctx.db.get(target.target.id)
    const root = await getRootNetwork(ctx)
    const live = head && root ? await readableCatalogMapping(ctx, root, head.shopId) : null
    if (!head || !live || live.parentHead._id !== head._id || !live.parent.storefrontTerms) return notFound()
  }
  if (target.target.kind === "commerceOffer") {
    const head = await ctx.db.get(target.target.id)
    const root = await getRootNetwork(ctx)
    const live = head && root ? await readableCatalogMapping(ctx, root, head.shopId) : null
    if (!head || !live || head.objectKind !== "offer" || head.sequence !== "catalog" || head.state !== "active" || !headBelongsToCurrentCatalog(head, live)) return notFound()
  }
  if (target.target.kind === "commerceJob") {
    // Rétablir rejuge le parent, le lien et l'incarnation ; une offre retirée reste retirée.
    const head = await ctx.db.get(target.target.id)
    const root = await getRootNetwork(ctx)
    const live = head && root ? await readableJobMapping(ctx, root, head.shopId) : null
    if (!head || !live || head.state === "withdrawn" || !jobHeadBelongsToCurrent(head, live)) return notFound()
  }
  const previous = await contentState(ctx, target.target.kind, target.target.id)
  // Vague H DIASPORALE (G9) : seule une cible RETIRÉE recompte ; ne lève jamais, ne rouvre rien.
  await restoreDiasporaTarget(ctx, target.target, previous?.status ?? null)
  await setContentModerationStatus(ctx, { networkId: target.networkId, kind: target.target.kind, id: target.target.id, ownerPersonId: target.ownerPersonId }, "published")
  await syncProfessionalTarget(ctx, target)
  if (target.target.kind === "post") {
    const post = await ctx.db.get(target.target.id)
    if (post?.status === "removed") {
      await ctx.db.patch(post._id, { status: "published", removedAt: undefined, updatedAt: Date.now() })
    }
    if (post) {
      if (post.federationSource) {
        const mirrors = await ctx.db.query("mirrors").withIndex("by_local", (q) => q.eq("localTable", "posts").eq("localId", post._id)).take(2)
        if (mirrors.length === 1 && mirrors[0]) await retryFederatedMedia(ctx, mirrors[0])
      }
      await recordShare(ctx, post)
      await recordPagePost(ctx, post)
      await schedulePostFeed(ctx, post._id)
      if (previous?.status === "pending_review") await notifyMentions(ctx, post, post.mentionedPersonIds ?? [])
    }
  } else if (target.target.kind === "comment") {
    const comment = await ctx.db.get(target.target.id)
    if (comment?.status === "removed") {
      await ctx.db.patch(comment._id, { status: "published", removedAt: undefined, updatedAt: Date.now() })
      await recordComment(ctx, comment)
      if (comment.parentCommentId === undefined && comment.removedAt !== undefined) await ctx.scheduler.runAfter(0, internal.modules.moderation.maintenance.restoreCommentReplies, { rootId: comment._id, removedAt: comment.removedAt })
    }
    if (comment && previous?.status === "pending_review") {
      await recordComment(ctx, comment)
      const post = await ctx.db.get(comment.postId)
      if (post?.authorPersonId) await notifyPerson(ctx, { networkId: comment.networkId, recipientPersonId: post.authorPersonId, actorPersonId: comment.authorPersonId, kind: "post_comment", subject: { post: post._id } })
    }
  } else if (target.target.kind === "event") {
    const event = await ctx.db.get(target.target.id)
    if (event?.networkId === target.networkId && event.organizerPageId && event.organizerPersonId === undefined) await schedulePageEventSeatFill(ctx, event.networkId, event._id)
  } else if (target.target.kind === "album" && previous?.status === "pending_review") {
    const album = await ctx.db.get(target.target.id)
    if (album) await enqueueFanout(ctx, { networkId: album.networkId, actorPersonId: album.ownerPersonId, kind: "album_published", subject: { album: album._id }, source: { kind: "albumFollowers", albumId: album._id } })
  } else if (target.target.kind === "groupMessage" && previous?.status === "pending_review") {
    const message = await ctx.db.get(target.target.id)
    if (message) {
      const thread = await ctx.db.get(message.threadId)
      if (thread && (thread.lastMessageAt === undefined || thread.lastMessageAt <= message.createdAt)) await ctx.db.patch(thread._id, { ...previewColumns(message.content ?? "", message.attachmentFiles ?? []), lastMessageAt: message.createdAt, lastMessageId: message._id, lastMessageByPersonId: message.senderPersonId })
      await scheduleGroupMessageFanout(ctx, message._id)
    }
  } else if (target.target.kind === "contextualMessage" && previous?.status === "pending_review") {
    // CC-2b : un message contextuel sorti de relecture émet l'avis qu'il n'avait pas émis (émetteur relu).
    await onContextualMessageReleased(ctx, target.target.id)
  }
}

export const surfaceOf = (target: ModerationTarget): ModerationSurface => target.kind
