// Dupliqué de socle/convex/modules/reseauPersonnel/postWrite.ts @ ad2e7fdc2 — adaptations : réseau, visibilité et `onRoot` (lisible depuis la racine) dénormalisés à l'écriture ; portée et pays ; citations résolues parmi les profils PUBLIÉS et membres du réseau de la publication (`resolveMentionedPersonIds`) ; cloche des citations par la porte unique (`notifyPerson`) avec la règle « qui peut être sonné » (`mentionCanSeePost`) — au plus 10 citations par publication (`MENTION_MAX_PER_POST`), aucune diffusion différée nécessaire ; partage compté dans l'agrégat ; aucun compteur sur la publication ; la session de direct annoncée portée (`directSessionId` → `liveSessionId`, lot 16), l'évènement annoncé porté (lot 12), la PAGE portée (lot 13 : forme `public`/`followers`, publication comptée pour la page, citations d'une note aux abonnés sonnées vers ses seuls abonnés et signataires vivants) ; branche organisation (l. 187-198) retirée.
/**
 * L'ÉCRITURE d'une publication — le geste commun à tous les écrivains,
 * présents (`posts.publish`) et à venir (annonce d'un direct, d'un évènement,
 * publication de page).
 *
 * Ce helper NE VALIDE PAS le contenu : le corps arrive déjà jugé, les médias
 * déjà vérifiés contre le stockage, le partage déjà passé par sa garde, le
 * groupe déjà vérifié. Il tient ce qui doit rester identique pour tous :
 * l'INVARIANT de forme (groupe ⟺ audience `group`), la dénormalisation (tags,
 * texte indexé, citations, lecture depuis la racine), le décompte du partage,
 * et la cloche des citations — avec la règle de visibilité (on ne sonne jamais
 * vers un lien qui refuse).
 */
import { assertGroupAudienceShape, assertPageAudienceShape, type PersonalPostAudience } from "@antsia/social-domain/content"
import type { ContentVisibility } from "@antsia/social-domain/network"
import type { ProvinceSlug } from "@antsia/social-domain/provinces"
import { extractHashtags } from "@antsia/social-domain/richText"
import { buildSearchableText } from "@antsia/social-domain/searchText"

import { moderateContentWrite, moderateOwnedContentWrite, moderatePageContentWrite } from "../moderation/policy"
import type { Doc, Id } from "../../_generated/dataModel"
import type { MutationCtx } from "../../_generated/server"
import { checked, notFound } from "../../lib/errors"
import { isBlockedBetween, isConnectedTo } from "../graph/graph"
import type { StoredMedia } from "../media/media"
import { notifyPerson } from "../notifications/notify"
import { liveSignatoryRole } from "../pages/access"
import { isFollowingPage } from "../pages/follows"
import { resolveMentionedPersonIds } from "../people/miniProfile"
import { isLiveThematicGroupMember } from "../thematicGroups/access"
import { recordPagePost, recordShare } from "./counters"
import { appendAudit } from "../platform/audit"
import { hasNativePostAuthor } from "./nativeAuthor"
import { purgeMaterializedPost, schedulePostFeed } from "./feedMaterialization"
import { getRootNetwork } from "../../lib/access"
import { pageEventAccess } from "../events/pageEventAccess"
import { canReadPageEventGalleryPost } from "../events/pageEventGalleryAccess"
import { readablePublishedArticle } from "../editorial/read"
import { requireEditorialRole } from "../editorial/access"

export type PostWriteInput = {
  network: Doc<"networks">
  authorPersonId: Id<"persons">
  /** Le corps, DÉJÀ validé par l'appelant (`assertPostContent`). */
  body: string
  audience: PersonalPostAudience
  visibility: ContentVisibility
  /** Le groupe visé — l'appartenance vivante de l'auteur est DÉJÀ vérifiée. */
  groupId?: Id<"thematicGroups">
  /** Médias DÉJÀ vérifiés contre le stockage (métadonnées réelles). */
  media?: StoredMedia[]
  /** Partage DÉJÀ passé par la garde de visibilité et `assertShareable`. */
  sharedPostId?: Id<"posts">
  /** Portée et pays DÉJÀ jugés contre le réseau (`assertPostReach`). */
  reach?: string
  country?: string
  province?: ProvinceSlug
  idempotencyKey?: string
  /** L'évènement ANNONCÉ — l'organisateur est DÉJÀ vérifié par l'appelant. */
  eventId?: Id<"events">
  /** L'annonce d'un DIRECT — la carte du fil portera « Regarder » (`live/sessions.create`). */
  liveSessionId?: Id<"liveSessions">
  /** La PAGE au nom de laquelle on publie — le rôle VIVANT du signataire est DÉJÀ vérifié par l'appelant. */
  pageId?: Id<"pages">
  /** DG-023 : galerie collective, distincte de l'annonce eventId. L'acteur de dépôt n'en est pas propriétaire. */
  pageEventGalleryId?: Id<"events">
  /** MP13 : article publié et habilitation publisher déjà admis ; aucune copie du texte dans le post. */
  editorialArticleId?: Id<"editorialArticles">
}

/** Lisible depuis la racine : née à la racine, ou `root`. */
export function isOnRoot(network: Pick<Doc<"networks">, "kind">, visibility: ContentVisibility): boolean {
  return network.kind === "root" || visibility === "root"
}

/** Retrait de la projection choisie, sans supprimer la publication ni rétablir un autre état. */
export async function withdrawPostRootVisibility(ctx: MutationCtx, post: Doc<"posts">, network: Doc<"networks">, actorPersonId?: Id<"persons">): Promise<void> {
  if (post.visibility !== "root") return
  await ctx.db.patch(post._id, { visibility: "network", onRoot: isOnRoot(network, "network"), updatedAt: Date.now() })
  if (network.kind !== "root") {
    const root = await getRootNetwork(ctx)
    if (root) await purgeMaterializedPost(ctx, post._id, root._id)
  }
  await appendAudit(ctx, { action: "post.root_withdraw", capacity: actorPersonId ? "member" : "system", ...(actorPersonId ? { actorPersonId } : {}), networkId: post.networkId, subject: { table: "posts", id: post._id }, details: { ...(actorPersonId ? {} : { recette: true }) } })
}

/**
 * La personne citée voit-elle cette publication ? La règle de la lecture,
 * appliquée AVANT de sonner : `public` pour tous les membres, `connections`
 * pour les connexions de l'auteur dans le réseau, `group` pour les membres
 * vivants non bloqués du groupe, `followers` pour les abonnés et signataires
 * vivants de la page. Le blocage et l'adhésion sont, en plus, refusés par la
 * porte (`notifyPerson`). Partagée par l'écriture et l'édition.
 */
export async function mentionCanSeePost(
  ctx: Pick<MutationCtx, "db">,
  post: { networkId: Id<"networks">; authorPersonId?: Id<"persons">; federationSource?: unknown; audience: PersonalPostAudience; groupId?: Id<"thematicGroups">; pageId?: Id<"pages"> },
  mentionedPersonId: Id<"persons">,
): Promise<boolean> {
  if (!hasNativePostAuthor(post)) return false
  if (mentionedPersonId === post.authorPersonId) return true
  if (post.audience === "public") return true
  if (post.audience === "followers") {
    const page = post.pageId === undefined ? null : await ctx.db.get(post.pageId)
    if (!page) return false
    return (await isFollowingPage(ctx, page._id, mentionedPersonId)) || (await liveSignatoryRole(ctx, page, mentionedPersonId)) !== null
  }
  if (post.audience === "group") {
    if (post.groupId === undefined) return false
    const [isMember, isBlocked] = await Promise.all([
      isLiveThematicGroupMember(ctx, post.groupId, mentionedPersonId),
      isBlockedBetween(ctx, mentionedPersonId, post.authorPersonId),
    ])
    return isMember && !isBlocked
  }
  return await isConnectedTo(ctx, post.networkId, mentionedPersonId, post.authorPersonId)
}

/** Sonne les personnes citées qui VOIENT la publication. */
export async function notifyMentions(
  ctx: MutationCtx,
  post: { _id: Id<"posts">; networkId: Id<"networks">; authorPersonId?: Id<"persons">; federationSource?: unknown; audience: PersonalPostAudience; groupId?: Id<"thematicGroups">; pageId?: Id<"pages"> },
  personIds: readonly Id<"persons">[],
): Promise<void> {
  if (!hasNativePostAuthor(post)) return
  for (const personId of personIds) {
    if (!(await mentionCanSeePost(ctx, post, personId))) continue
    await notifyPerson(ctx, { networkId: post.networkId, recipientPersonId: personId, actorPersonId: post.authorPersonId, kind: "mention", subject: { post: post._id } })
  }
}

/**
 * Insère la publication, compte le partage, prévient les personnes citées.
 *
 * ⚠️ Un partage sans corps n'indexe RIEN — surtout pas le texte de l'original :
 * chaîne VIDE, jamais `undefined` (une chaîne vide n'apparie aucun terme).
 */
export async function writePost(ctx: MutationCtx, input: PostWriteInput): Promise<{ postId: Id<"posts"> }> {
  if (!hasNativePostAuthor(input)) return notFound()
  if (input.editorialArticleId !== undefined) {
    if (!input.pageId || input.body !== "" || input.audience !== "public" || input.visibility !== "network" || input.sharedPostId !== undefined || input.groupId !== undefined || input.eventId !== undefined || input.liveSessionId !== undefined || input.pageEventGalleryId !== undefined || input.media?.length || input.reach !== undefined || input.country !== undefined || input.province !== undefined) return notFound()
    const live = await readablePublishedArticle(ctx, { networkId: input.network._id, readerPersonId: input.authorPersonId }, input.editorialArticleId)
    if (!live || live.page._id !== input.pageId) return notFound()
    await requireEditorialRole(ctx, { networkId: input.network._id, personId: input.authorPersonId }, input.pageId, ["publisher"])
  }
  if (input.pageEventGalleryId !== undefined) {
    const event = await ctx.db.get(input.pageEventGalleryId)
    if (!event || !input.pageId || input.eventId !== undefined || input.liveSessionId !== undefined || input.province !== undefined || input.country !== undefined || input.reach !== "diaspora" || !input.media?.length) return notFound()
    const access = await pageEventAccess(ctx, event, input.authorPersonId)
    if (!access?.canManage || access.moderation !== "published" || !(await canReadPageEventGalleryPost(ctx, { ...input, networkId: input.network._id, onRoot: false }, input.authorPersonId, input.network._id))) return notFound()
  }
  checked(() => assertGroupAudienceShape({ audience: input.audience, hasGroup: input.groupId !== undefined }))
  checked(() =>
    assertPageAudienceShape({ audience: input.audience, hasPage: input.pageId !== undefined, hasGroup: input.groupId !== undefined, hasShare: input.sharedPostId !== undefined }),
  )

  // Dénormalisés à l'ÉCRITURE : le filtre du fil reste une comparaison de tableau.
  const tags = extractHashtags(input.body)
  const mentionedPersonIds = input.pageEventGalleryId !== undefined ? [] : (await resolveMentionedPersonIds(ctx, input.network._id, input.body)).filter((id) => id !== input.authorPersonId)

  const now = Date.now()
  const doc = {
    networkId: input.network._id,
    ...(input.pageEventGalleryId === undefined ? { authorPersonId: input.authorPersonId } : { pageEventGalleryId: input.pageEventGalleryId }),
    body: input.body,
    audience: input.audience,
    visibility: input.visibility,
    onRoot: isOnRoot(input.network, input.visibility),
    status: "published" as const,
    ...(input.media && input.media.length > 0 ? { media: input.media } : {}),
    ...(input.sharedPostId ? { sharedPostId: input.sharedPostId } : {}),
    ...(input.groupId ? { groupId: input.groupId } : {}),
    ...(input.reach !== undefined ? { reach: input.reach } : {}),
    ...(input.country !== undefined ? { country: input.country } : {}),
    ...(input.province !== undefined ? { province: input.province } : {}),
    ...(tags.length > 0 ? { tags } : {}),
    ...(mentionedPersonIds.length > 0 ? { mentionedPersonIds } : {}),
    searchText: buildSearchableText(input.body, tags.join(" ")),
    ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
    ...(input.eventId ? { eventId: input.eventId } : {}),
    ...(input.liveSessionId ? { liveSessionId: input.liveSessionId } : {}),
    ...(input.pageId ? { pageId: input.pageId } : {}),
    ...(input.editorialArticleId ? { editorialArticleId: input.editorialArticleId } : {}),
    publishedAt: now,
    createdAt: now,
    updatedAt: now,
  }
  const postId = await ctx.db.insert("posts", doc)
  const admitted = input.editorialArticleId !== undefined && input.pageId !== undefined
    ? await moderateOwnedContentWrite(ctx, { networkId: input.network._id, owner: { pageId: input.pageId }, kind: "post", id: postId, text: input.body })
    : input.pageEventGalleryId !== undefined && input.pageId !== undefined
    ? await moderatePageContentWrite(ctx, { networkId: input.network._id, pageId: input.pageId, kind: "post", id: postId, text: input.body })
    : await moderateContentWrite(ctx, { networkId: input.network._id, ownerPersonId: input.authorPersonId, kind: "post", id: postId, text: input.body })
  if (!admitted) return { postId }
  await schedulePostFeed(ctx, postId)
  await recordShare(ctx, { _id: postId, ...(input.sharedPostId ? { sharedPostId: input.sharedPostId } : {}), publishedAt: now })
  await recordPagePost(ctx, { _id: postId, ...(input.pageId ? { pageId: input.pageId } : {}), publishedAt: now })
  await notifyMentions(ctx, { _id: postId, ...doc }, mentionedPersonIds)
  return { postId }
}
