// Dupliqué de socle/convex/modules/reseauPersonnel/posts.ts @ ad2e7fdc2 — adaptations : PAR RÉSEAU — tout se lit DEPUIS le réseau de la fonction appelée (une publication `network` d'un réseau fermé n'est rendue par aucune lecture de la racine, R4 ; la racine lit ses natifs et les `root` de tous les réseaux par l'index `onRoot`), adhésion par le constructeur au lieu d'`assertNotSuspended` ; fenêtres par auteur, fusion k-voies, curseur composite et deux phases GARDÉS, lecteurs de fenêtre factorisés (réseau, racine, auteur) ; portée « mon_administration », collègues, organisations et notes de service retirés (l. 1059-1061, 1079-1081, 1221-1224, 1253) ; PAGES rebranchées sur les pages du moteur (lot 13 : fenêtre par page suivie dans « Pour vous », admission propre `pageFeedAdmissionFor` — ni la connexion au signataire, ni la sourdine, ni le blocage entre personnes ne s'y appliquent —, carte de la page dans le DTO avec `author` pour signataire, aucune publication de page sur un mur personnel ni dans « mes publications », autorité ACTUELLE du signataire pour retirer ou éditer) ; évènement (l. 564-598) au lot de son module ; DIRECT annoncé (l. 545-562, `resolveDirectProjection`) rebranché au lot 16 : la carte porte `live` (session relue à chaque lecture : identifiant, statut, titre), FACULTATIVE dans le DTO (absente quand la publication n'annonce rien ou que la session n'existe plus) ; BLOCAGE exclu du fil, de la recherche et du mur (il l'emporte sur toute audience) ; lacune des ensembles bornés RENDUE (`lacunar`, D19, D24) ; une seule garde dans la recherche (D25) ; partages comptés par agrégat ; cloche du partage et des citations par la porte unique ; portée et pays ; épingle par réseau (sur l'adhésion) rendue avec le mur ; `myPosts` paginé (`paginateMyPosts`) ; le fil « Récents » natif `feed` de la tranche verticale GARDÉ (compatibilité des écrans), DTO étendu ; débit sur publier, éditer, retirer ; fil par VOIES (portée, pays facultatif) que compose une application servie (le hub d'un pays, « toute la diaspora »), fusionnées par date ; fenêtres bornées fusionnées sous FRONTIÈRE (une fenêtre pleine n'ouvre plus de trou dans « Pour vous »).
/**
 * Publications d'un réseau — publier, partager, éditer, retirer, épingler ;
 * lire le fil, le mur d'une personne, une publication ; chercher.
 *
 * DTO ALLOWLISTÉS : jamais un document brut, jamais un identifiant de
 * stockage ; l'auteur par son profil PUBLIÉ (nom neutre sinon).
 *
 * DEUX PHASES partout où l'on compose une page : la SÉLECTION juge les lignes
 * brutes (garde d'audience, blocage, masquage, sourdine, tag), puis
 * l'ENRICHISSEMENT résout profils, compteurs, médias et partages pour les
 * seules lignes servies.
 */
import {
  assertGroupAudienceShape,
  assertPostContent,
  assertPostMedia,
  assertPinnableOnWall,
  assertPostReach,
  assertShareable,
  assertShareOutsideGroup,
  FEED_REASONS,
  FEED_SCOPE_DEFAULT,
  FEED_SCOPES,
  type FeedLane,
  type FeedReason,
  groupViewingReasonFor,
  isPersonalPostVisibleTo,
  normalizeFeedLanes,
  type PersonalPostAudience,
  viewingReasonFor,
  addedMentionedIds,
} from "@antsia/social-domain/content"
import {
  boundedFeedSourceIds,
  cursorForFeedPost,
  isAfterFeedCursor,
  isLacunarFeedWindow,
  mergeFeedWindows,
  PERSONAL_FEED_AUTHORS_MAX,
  materializedCursorMatches,
  shouldMaterializeFeed,
  MATERIALIZED_FEED_REBUILD_MS,
  type PersonalFeedCursor,
} from "@antsia/social-domain/feedScale"
import { DIRECT_STATUSES } from "@antsia/social-domain/live/domain"
import { effectiveVisibility } from "@antsia/social-domain/network"
import { PROVINCE_SLUGS } from "@antsia/social-domain/provinces"
import { PAGES_FEED_MAX } from "@antsia/social-domain/pages"
import { extractHashtags } from "@antsia/social-domain/richText"
import { buildSearchableText, foldSearchQuery } from "@antsia/social-domain/searchText"
import { type IndexRange, paginationOptsValidator } from "convex/server"
import { type Infer, v } from "convex/values"

import { canReadModeratedContent, moderateContentWrite } from "../moderation/policy"
import type { Doc, Id } from "../../_generated/dataModel"
import type { QueryCtx } from "../../_generated/server"
import { checked, fail, notFound } from "../../lib/errors"
import { isActiveMember } from "../../lib/access"
import { networkMutation, networkQuery } from "../../lib/functions"
import { enforceRateLimit } from "../../lib/rateLimit"
import {
  badgeValidator,
  contentVisibilityValidator,
  literals,
  postAudienceValidator,
  postStatusValidator,
  reactionCountsValidator,
  reactionKindValidator,
} from "../../lib/validators"
import { acceptedCounterpartIds, blockedCounterpartIds, type BoundedIds, followedPersonIds, isBlockedBetween, isConnectedTo, isFollowingPerson } from "../graph/graph"
import { eventCardOf, eventCardValidator } from "../events/card"
import { hiddenPostIds, mutedPersonIds, readerMarks } from "../marks/marks"
import { declaredMediaValidator, postMediaDtoValidator, resolvePostMediaDtos, verifyDeclaredMedia } from "../media/media"
import { notifyPerson } from "../notifications/notify"
import { liveSignatoryRole, pageCardCache } from "../pages/access"
import { type BoundedPageIds, followedPageIds, isFollowingPage } from "../pages/follows"
import { type PageCard, pageCardValidator } from "../pages/validators"
import { findPublishedPersonByHandle, miniProfileCache, resolveMentionedPersonIds } from "../people/miniProfile"
import { canAccessAssociationGroupPost, requireLiveThematicGroupMembership } from "../thematicGroups/access"
import { assertVisiblePost, canSeePostDoc, editorialDiscussionOpen, isInReadingContext, type ReaderContext } from "./access"
import { markPostRemoved } from "./contentRemoval"
import { countComments, countShares, summarizeReactions } from "./counters"
import { notifyMentions, withdrawPostRootVisibility, writePost } from "./postWrite"
import { hasNativePostAuthor, requireNativePostAuthor, type NativePersonAuthoredPost } from "./nativeAuthor"
import { exactFeedHidden, exactFeedMuted, feedAccessVersion, feedPreparationKey, liveFeedReason } from "./feedPolicy"
import { feedState, materializedPostCursor, materializedWindow, type MaterializedWindow } from "./feedRead"

type ReadCtx = Pick<QueryCtx, "db">

const FEED_LIMIT_DEFAULT = 20
const FEED_LIMIT_MAX = 50
/** Taille maximale d'une page du fil « Récents » natif (`feed`). */
export const FEED_PAGE_MAX = 30
/**
 * Fenêtre BRUTE balayée pour composer une page des portées globales. Plus
 * large que la page : la sélection écarte beaucoup de lignes. Au-delà, le fil
 * peut devenir lacunaire — le signal `lacunar` le dit à l'écran.
 */
const FEED_SCAN = 200
/** Fenêtre bornée PAR AUTEUR avant la fusion k-voies (une page maximale). */
export const FEED_AUTHOR_SCAN = FEED_LIMIT_MAX
/** Fenêtres d'auteur balayées au plus pour une page de mur. */
export const WALL_WINDOWS_MAX = 4
/** Fenêtre de la recherche : bornée avant même la garde par lecteur. */
const SEARCH_SCAN = 100
/** En deçà, on ne cherche pas : une lettre seule rapporterait un fragment de l'index. */
const SEARCH_QUERY_MIN = 2

export const clampLimit = (limit: number | undefined) => Math.min(Math.max(Math.trunc(limit ?? FEED_LIMIT_DEFAULT), 1), FEED_LIMIT_MAX)

// ═══════════════════════════════════════════════════════════════
// DTO
// ═══════════════════════════════════════════════════════════════

const authorValidator = v.object({
  isDeleted: v.optional(v.boolean()),
  personId: v.union(v.id("persons"), v.null()),
  handle: v.union(v.string(), v.null()),
  displayName: v.union(v.string(), v.null()),
  headline: v.union(v.string(), v.null()),
  avatarUrl: v.union(v.string(), v.null()),
  badges: v.array(badgeValidator),
})

/**
 * L'original d'un PARTAGE tel que le lecteur a le droit de le voir À CET
 * INSTANT : `{ available: false }` SEUL s'il est retiré ou hors de portée.
 */
const sharedPostValidator = v.union(
  v.object({ available: v.literal(false) }),
  v.object({
    available: v.literal(true),
    postId: v.id("posts"),
    author: v.object({ displayName: v.union(v.string(), v.null()), handle: v.union(v.string(), v.null()), avatarUrl: v.union(v.string(), v.null()) }),
    /** La page de l'original, quand c'est une page qui parle (l'en-tête du partage). */
    page: v.union(pageCardValidator, v.null()),
    body: v.string(),
    media: v.array(postMediaDtoValidator),
    publishedAt: v.number(),
    hasEditorialArticle: v.optional(v.boolean()),
  }),
)

/** Le réseau d'ORIGINE d'une publication lue ailleurs (pastille « Diaspora » du fil de la racine). */
const originValidator = v.union(v.object({ networkId: v.id("networks"), slug: v.string(), name: v.string() }), v.null())

/** Le DIRECT annoncé, tel qu'il est MAINTENANT — une référence, son statut et son titre, rien d'autre. */
const liveAnnounceValidator = v.object({ sessionId: v.id("liveSessions"), status: literals(DIRECT_STATUSES), title: v.string() })

export const feedItemValidator = v.object({
  _id: v.id("posts"),
  /** Galerie collective ; ne pas présenter l'éditeur des publications personnelles. */
  eventGalleryId: v.optional(v.id("events")),
  body: v.string(),
  audience: postAudienceValidator,
  visibility: contentVisibilityValidator,
  publishedAt: v.number(),
  editedAt: v.union(v.number(), v.null()),
  isMine: v.boolean(),
  author: authorValidator,
  reactions: v.object({ counts: reactionCountsValidator, total: v.number(), mine: v.union(reactionKindValidator, v.null()) }),
  commentCount: v.number(),
  shareCount: v.number(),
  /** Médias résolus par la garde des fichiers — jamais un identifiant de stockage. */
  media: v.array(postMediaDtoValidator),
  share: v.union(sharedPostValidator, v.null()),
  tags: v.array(v.string()),
  /** Le groupe de la publication (audience `group`) — pour mener au groupe, jamais pour juger un droit. */
  groupId: v.union(v.id("thematicGroups"), v.null()),
  /** L'évènement ANNONCÉ par la publication, relu à chaque lecture (statut, MA réponse). */
  event: v.union(eventCardValidator, v.null()),
  /**
   * Le DIRECT annoncé par la publication — statut RELU à chaque lecture, jamais
   * figé : la carte dit « en direct » ou « terminé » selon l'instant, pas selon
   * l'annonce. L'audience de la session est EXACTEMENT celle de la publication,
   * dans le même réseau (invariant d'écriture) : voir l'annonce, c'est avoir le
   * droit de savoir que le direct existe. Absent : la publication n'annonce
   * rien, ou la session n'existe plus — la carte redevient ordinaire.
   */
  live: v.optional(liveAnnounceValidator),
  /**
   * La PAGE au nom de laquelle la publication parle — l'en-tête à afficher ;
   * `author` est alors son SIGNATAIRE (« signé par »), et `isMine` reste faux :
   * la publication appartient à la page. `null` pour une publication de personne.
   */
  page: v.union(pageCardValidator, v.null()),
  reach: v.union(v.string(), v.null()),
  country: v.union(v.string(), v.null()),
  province: v.optional(v.union(literals(PROVINCE_SLUGS), v.null())),
  /** Seul l'indicateur est publié ; les données de l'offre restent derrière leur porte propre. */
  hasCommerceOffer: v.optional(v.boolean()),
  hasEditorialArticle: v.optional(v.boolean()),
  /** MP13 : fermeture de la saisie, sans effacer ni masquer les commentaires existants. */
  commentsOpen: v.optional(v.boolean()),
  /** La discussion unique d'un article, uniquement quand sa référence est actuellement lisible. */
  canonicalDiscussionPostId: v.optional(v.id("posts")),
  origin: originValidator,
  /** Pourquoi cette ligne est là — l'écran le dit, il ne le devine pas. */
  reason: literals(FEED_REASONS),
  /** Les marques DU LECTEUR, pour le menu « … ». */
  viewer: v.object({ bookmarked: v.boolean(), notifying: v.boolean() }),
})

export type FeedItem = Infer<typeof feedItemValidator>
export type FeedResult = { items: FeedItem[]; nextCursor: PersonalFeedCursor<Id<"posts">> | null; lacunar: boolean; materializedSince?: number; preparing?: boolean; preparationKey?: string }
type SharedPostProjection = Infer<typeof sharedPostValidator>
type FeedOrigin = NonNullable<Infer<typeof originValidator>>

export const cursorValidator = v.object({ publishedAt: v.number(), postId: v.id("posts"), strategy: v.optional(v.union(v.literal("legacy"), v.literal("materialized"))), generation: v.optional(v.number()), windowStart: v.optional(v.number()), postCreationTime: v.optional(v.number()) })

export type Enrichment = {
  profileOf: ReturnType<typeof miniProfileCache>
  /** La carte d'une page servable, `null` sinon — mémoïsée pour la page de fil. */
  pageOf: (pageId: Id<"pages">) => Promise<PageCard | null>
  originOf: (networkId: Id<"networks">) => Promise<FeedOrigin | null>
  marks: { bookmarked: ReadonlySet<string>; notifying: ReadonlySet<string> }
}

export function enrichment(ctx: ReadCtx & Pick<QueryCtx, "storage">, marks?: Enrichment["marks"]): Enrichment {
  const origins = new Map<string, FeedOrigin | null>()
  return {
    profileOf: miniProfileCache(ctx),
    pageOf: pageCardCache(ctx),
    originOf: async (networkId) => {
      const hit = origins.get(networkId)
      if (hit !== undefined) return hit
      const network = await ctx.db.get(networkId)
      const origin = network ? { networkId: network._id, slug: network.slug, name: network.name } : null
      origins.set(networkId, origin)
      return origin
    },
    marks: marks ?? { bookmarked: new Set(), notifying: new Set() },
  }
}

/** Relit l'original d'un partage AVEC la garde du lecteur courant — jamais figé à l'écriture. */
async function resolveShareProjection(ctx: QueryCtx, post: Doc<"posts">, reader: ReaderContext, enrich: Enrichment): Promise<SharedPostProjection | null> {
  if (post.sharedPostId === undefined) return null
  const original = await ctx.db.get(post.sharedPostId)
  // Retiré, ou hors de portée : la carte le dit, et ne dit QUE cela.
  if (!original || !(await canSeePostDoc(ctx, reader, original))) return { available: false }
  const page = original.pageId === undefined ? null : await enrich.pageOf(original.pageId)
  if (original.pageId !== undefined && page === null) return { available: false }
  const author = hasNativePostAuthor(original) ? await enrich.profileOf(original.authorPersonId) : null
  return {
    available: true,
    postId: original._id,
    author: { displayName: author?.displayName ?? null, handle: author?.handle ?? null, avatarUrl: author?.avatarUrl ?? null },
    page,
    body: original.body,
    media: await resolvePostMediaDtos(ctx, original.media, original.federationMedia),
    publishedAt: original.publishedAt,
    ...(original.editorialArticleId === undefined ? {} : { hasEditorialArticle: true }),
  }
}

/**
 * Le DIRECT annoncé, tel qu'il est MAINTENANT. Statut relu à chaque lecture —
 * une annonce n'est pas un état, c'est un pointeur. Session disparue : rien, la
 * carte redevient une publication ordinaire.
 */
async function resolveDirectProjection(ctx: ReadCtx, post: Doc<"posts">): Promise<Infer<typeof liveAnnounceValidator> | null> {
  if (post.liveSessionId === undefined) return null
  const session = await ctx.db.get(post.liveSessionId)
  if (session === null) return null
  return { sessionId: session._id, status: session.status, title: session.title }
}

/** LA projection d'une publication — le fil, le mur, la recherche et la lecture unitaire rendent la même carte. */
export async function toFeedItem(ctx: QueryCtx, post: Doc<"posts">, reader: ReaderContext, reason: FeedReason, enrich: Enrichment): Promise<FeedItem> {
  if (post.pageId === undefined && !hasNativePostAuthor(post)) return notFound()
  const [author, reactions, commentCount, shareCount, media, share, origin, event, page, live] = await Promise.all([
    hasNativePostAuthor(post) ? enrich.profileOf(post.authorPersonId) : Promise.resolve(null),
    summarizeReactions(ctx, post._id, reader.personId),
    countComments(ctx, post._id),
    countShares(ctx, post._id),
    resolvePostMediaDtos(ctx, post.media, post.federationMedia),
    resolveShareProjection(ctx, post, reader, enrich),
    post.networkId === reader.network._id ? Promise.resolve(null) : enrich.originOf(post.networkId),
    eventCardOf(ctx, post.eventId, reader.personId),
    post.pageId === undefined ? Promise.resolve(null) : enrich.pageOf(post.pageId),
    resolveDirectProjection(ctx, post),
  ])
  // Une publication de page ne retombe JAMAIS sur l'identité de son signataire : page retirée, contenu indisponible.
  if (post.pageId !== undefined && page === null) return notFound()
  const commentsOpen = await editorialDiscussionOpen(ctx, post)
  const canonicalDiscussionPostId = post.editorialArticleId !== undefined ? post._id : share?.available && share.hasEditorialArticle ? share.postId : undefined
  return {
    _id: post._id,
    ...(post.pageEventGalleryId === undefined ? {} : { eventGalleryId: post.pageEventGalleryId }),
    body: post.body,
    audience: post.audience,
    visibility: post.visibility,
    publishedAt: post.publishedAt,
    editedAt: post.editedAt ?? null,
    isMine: post.pageId === undefined && hasNativePostAuthor(post) && post.authorPersonId === reader.personId,
    author: {
      personId: author?.personId ?? null,
      handle: author?.handle ?? null,
      displayName: author?.displayName ?? null,
      headline: author?.headline ?? null,
      avatarUrl: author?.avatarUrl ?? null,
      badges: author?.badges ?? [],
      ...(author?.isDeleted ? { isDeleted: true } : {}),
    },
    reactions,
    commentCount,
    shareCount,
    media,
    share,
    tags: post.tags ?? [],
    groupId: post.groupId ?? null,
    event,
    ...(live === null ? {} : { live }),
    page,
    reach: post.reach ?? null,
    country: post.country ?? null,
    province: post.province ?? null,
    ...(post.commerceOffer === undefined ? {} : { hasCommerceOffer: true }),
    ...(post.editorialArticleId === undefined ? {} : { hasEditorialArticle: true }),
    ...(commentsOpen === null ? {} : { commentsOpen }),
    ...(canonicalDiscussionPostId === undefined ? {} : { canonicalDiscussionPostId }),
    origin,
    reason,
    viewer: { bookmarked: enrich.marks.bookmarked.has(post._id), notifying: enrich.marks.notifying.has(post._id) },
  }
}

// ═══════════════════════════════════════════════════════════════
// Fenêtres de lecture (fusion k-voies, curseur composite)
// ═══════════════════════════════════════════════════════════════

/**
 * La borne d'une fenêtre derrière le curseur. L'index est ordonné par
 * `(…, publishedAt, _creationTime)` : une borne au milieu d'un instant exige
 * deux plages disjointes — la suite de l'instant courant (`tied`), puis les
 * instants plus anciens (`older`). Filtrer après coup relirait toujours le
 * même préfixe quand beaucoup de lignes partagent `publishedAt`.
 */
type Bound =
  | { kind: "all" }
  | { kind: "tied"; publishedAt: number; creationTime: number }
  | { kind: "older"; publishedAt: number }
  | { kind: "upTo"; publishedAt: number }

/** Ce qu'il faut d'un constructeur de plage dont le champ suivant est `publishedAt`. */
interface PublishedAtRange extends IndexRange {
  eq(field: "publishedAt", value: number): { lt(field: "_creationTime", value: number): IndexRange }
  lt(field: "publishedAt", value: number): IndexRange
  lte(field: "publishedAt", value: number): IndexRange
}

function bounded(q: PublishedAtRange, bound: Bound): IndexRange {
  switch (bound.kind) {
    case "all":
      return q
    case "tied":
      return q.eq("publishedAt", bound.publishedAt).lt("_creationTime", bound.creationTime)
    case "older":
      return q.lt("publishedAt", bound.publishedAt)
    case "upTo":
      return q.lte("publishedAt", bound.publishedAt)
  }
}

export type RangeReader = (bound: Bound, take: number) => Promise<Doc<"posts">[]>

/** Les publications vivantes lisibles DEPUIS ce réseau : ses natives, ou celles de la racine (`onRoot`). */
function globalReader(ctx: ReadCtx, network: Doc<"networks">): RangeReader {
  if (network.kind === "root") {
    return async (bound, take) =>
      await ctx.db
        .query("posts")
        .withIndex("by_root_status_publishedAt", (q) => bounded(q.eq("onRoot", true).eq("status", "published"), bound))
        .order("desc")
        .take(take)
  }
  return async (bound, take) =>
    await ctx.db
      .query("posts")
      .withIndex("by_network_status_publishedAt", (q) => bounded(q.eq("networkId", network._id).eq("status", "published"), bound))
      .order("desc")
      .take(take)
}

/** Les publications vivantes d'UN auteur lisibles depuis ce réseau. */
function authorReader(ctx: ReadCtx, network: Doc<"networks">, authorPersonId: Id<"persons">): RangeReader {
  if (network.kind === "root") {
    return async (bound, take) =>
      await ctx.db
        .query("posts")
        .withIndex("by_root_author_status_publishedAt", (q) => bounded(q.eq("onRoot", true).eq("authorPersonId", authorPersonId).eq("status", "published"), bound))
        .order("desc")
        .take(take)
  }
  return async (bound, take) =>
    await ctx.db
      .query("posts")
      .withIndex("by_network_author_status_publishedAt", (q) =>
        bounded(q.eq("networkId", network._id).eq("authorPersonId", authorPersonId).eq("status", "published"), bound),
      )
      .order("desc")
      .take(take)
}

/** Les publications vivantes d'une VOIE de ce réseau : une portée et un pays, ou une portée seule. */
function laneReader(ctx: ReadCtx, networkId: Id<"networks">, lane: FeedLane): RangeReader {
  const country = lane.country
  if (country !== undefined) {
    return async (bound, take) =>
      await ctx.db
        .query("posts")
        .withIndex("by_network_reach_country_status_publishedAt", (q) => bounded(q.eq("networkId", networkId).eq("reach", lane.reach).eq("country", country).eq("status", "published"), bound))
        .order("desc")
        .take(take)
  }
  return async (bound, take) =>
    await ctx.db
      .query("posts")
      .withIndex("by_network_reach_status_publishedAt", (q) => bounded(q.eq("networkId", networkId).eq("reach", lane.reach).eq("status", "published"), bound))
      .order("desc")
      .take(take)
}

/** Les publications vivantes d'UN groupe thématique de ce réseau — son mur. */
export function groupReader(ctx: ReadCtx, networkId: Id<"networks">, groupId: Id<"thematicGroups">): RangeReader {
  return async (bound, take) =>
    await ctx.db
      .query("posts")
      .withIndex("by_network_group_status_publishedAt", (q) => bounded(q.eq("networkId", networkId).eq("groupId", groupId).eq("status", "published"), bound))
      .order("desc")
      .take(take)
}

/**
 * Les publications vivantes d'UNE page lisibles depuis ce réseau — son mur, et
 * sa fenêtre dans « Pour vous ». Jumelle d'`authorReader` : la fusion k-voies
 * traite une page comme un auteur, sans branche particulière.
 */
export function pageReader(ctx: ReadCtx, network: Doc<"networks">, pageId: Id<"pages">): RangeReader {
  if (network.kind === "root") {
    return async (bound, take) =>
      await ctx.db
        .query("posts")
        .withIndex("by_root_page_status_publishedAt", (q) => bounded(q.eq("onRoot", true).eq("pageId", pageId).eq("status", "published"), bound))
        .order("desc")
        .take(take)
  }
  return async (bound, take) =>
    await ctx.db
      .query("posts")
      .withIndex("by_network_page_status_publishedAt", (q) => bounded(q.eq("networkId", network._id).eq("pageId", pageId).eq("status", "published"), bound))
      .order("desc")
      .take(take)
}

type FeedCandidateWindow = { rows: Doc<"posts">[]; wasFull: boolean }

/** Une fenêtre STRICTEMENT derrière le curseur global. */
export async function feedWindow(
  read: RangeReader,
  scan: number,
  cursor: PersonalFeedCursor<Id<"posts">> | undefined,
  cursorCreationTime: number | undefined,
): Promise<FeedCandidateWindow> {
  if (cursor === undefined) {
    const rows = await read({ kind: "all" }, scan)
    return { rows, wasFull: rows.length === scan }
  }
  if (cursorCreationTime !== undefined) {
    const tied = await read({ kind: "tied", publishedAt: cursor.publishedAt, creationTime: cursorCreationTime }, scan)
    const remaining = scan - tied.length
    const older = remaining === 0 ? [] : await read({ kind: "older", publishedAt: cursor.publishedAt }, remaining)
    const rows = [...tied, ...older]
    return { rows, wasFull: rows.length === scan }
  }
  // Curseur forgé ou publication frontière absente : repli par identifiant, sans lever.
  const raw = await read({ kind: "upTo", publishedAt: cursor.publishedAt }, scan)
  return { rows: raw.filter((post) => isAfterFeedCursor(post, cursor)), wasFull: raw.length === scan }
}

/** `_creationTime` de la publication frontière, seul départage réel de l'index. */
export async function cursorCreationTimeOf(ctx: ReadCtx, cursor: PersonalFeedCursor<Id<"posts">> | undefined): Promise<number | undefined> {
  if (cursor === undefined) return undefined
  const post = await ctx.db.get(cursor.postId)
  return post !== null && post.publishedAt === cursor.publishedAt ? post._creationTime : undefined
}

// ═══════════════════════════════════════════════════════════════
// Liens du lecteur, lus UNE fois par page
// ═══════════════════════════════════════════════════════════════

type ReaderGraph = { connections: BoundedIds; follows: BoundedIds; blocked: BoundedIds }

async function readerGraph(ctx: ReadCtx, reader: ReaderContext): Promise<ReaderGraph> {
  const [connections, follows, blocked] = await Promise.all([
    acceptedCounterpartIds(ctx, reader.network._id, reader.personId),
    followedPersonIds(ctx, reader.network._id, reader.personId),
    blockedCounterpartIds(ctx, reader.personId),
  ])
  return { connections, follows, blocked }
}

export const readerOf = (ctx: { person: Doc<"persons">; network: Doc<"networks"> }): ReaderContext => ({ personId: ctx.person._id, network: ctx.network })

/** Ce que le lecteur est pour les PAGES : celles qu'il suit (ensemble borné), et ses faits par page, lus une fois. */
export type ReaderPages = {
  followed: BoundedPageIds
  /** La page est-elle servable, le lecteur la suit-il, en est-il signataire VIVANT ? */
  factsOf: (pageId: Id<"pages">) => Promise<{ live: boolean; isFollowedPage: boolean; isSignatory: boolean }>
}

export async function readerPages(ctx: ReadCtx, reader: ReaderContext): Promise<ReaderPages> {
  const followed = await followedPageIds(ctx, reader.network, reader.personId)
  const cache = new Map<string, { live: boolean; isFollowedPage: boolean; isSignatory: boolean }>()
  return {
    followed,
    factsOf: async (pageId) => {
      const hit = cache.get(pageId)
      if (hit) return hit
      const page = await ctx.db.get(pageId)
      const live = page !== null && page.status === "active"
      // Un ensemble tronqué se relit par paire : un abonnement n'est jamais une lacune.
      const isFollowedPage = followed.ids.has(pageId) || (followed.truncated && (await isFollowingPage(ctx, pageId, reader.personId)))
      const isSignatory = live && page !== null ? (await liveSignatoryRole(ctx, page, reader.personId)) !== null : false
      const facts = { live, isFollowedPage, isSignatory }
      cache.set(pageId, facts)
      return facts
    },
  }
}

/** Le titre de LECTURE d'une publication de page (mur, recherche, lien) : la signer, la suivre, ou la découvrir. */
export async function pageViewingReason(ctx: ReadCtx, reader: ReaderContext, pageId: Id<"pages">): Promise<FeedReason> {
  const page = await ctx.db.get(pageId)
  if (page && (await liveSignatoryRole(ctx, page, reader.personId)) !== null) return "own"
  return (await isFollowingPage(ctx, pageId, reader.personId)) ? "page" : "public"
}

// ═══════════════════════════════════════════════════════════════
// Écrire
// ═══════════════════════════════════════════════════════════════

/**
 * Publier — texte, texte et médias, partage, dans un groupe ; avec une portée
 * et un pays si le réseau en déclare. Gardes, dans cet ordre : débit ;
 * idempotence (rejouer la clé rend la publication EXISTANTE) ; forme et
 * appartenance au groupe ; partage par la garde de visibilité (aplati sur
 * l'original) ; vérité du STOCKAGE pour les médias ; le domaine juge l'ensemble.
 * `alsoOnRoot` est le geste explicite « publier aussi sur ANTSIA », qui ne vaut
 * que pour une audience publique ; à la racine, il ouvre explicitement la lecture sans compte.
 */
export const publish = networkMutation({
  minStatus: "declaree",
  args: {
    body: v.string(),
    audience: v.optional(postAudienceValidator),
    /** Le groupe visé — REQUIS avec l'audience `group`, INTERDIT sans elle. */
    groupId: v.optional(v.id("thematicGroups")),
    media: v.optional(v.array(declaredMediaValidator)),
    sharedPostId: v.optional(v.id("posts")),
    reach: v.optional(v.string()),
    country: v.optional(v.string()),
    province: v.optional(literals(PROVINCE_SLUGS)),
    alsoOnRoot: v.optional(v.boolean()),
    idempotencyKey: v.optional(v.string()),
  },
  returns: v.object({ postId: v.id("posts"), created: v.boolean() }),
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, "post.publish", ctx.person._id)
    // Rejeu AVANT toute validation : la publication existante est la réponse.
    if (args.idempotencyKey !== undefined) {
      const replay = await ctx.db
        .query("posts")
        .withIndex("by_author_and_idempotencyKey", (q) => q.eq("authorPersonId", ctx.person._id).eq("idempotencyKey", args.idempotencyKey))
        .unique()
      // Une clé rejouée dans un AUTRE réseau ne publie pas ici : la clé appartient à son composeur.
      if (replay) {
        if (!(await canAccessAssociationGroupPost(ctx, replay, ctx.person._id, ctx.networkId))) return notFound()
        return replay.networkId === ctx.networkId ? { postId: replay._id, created: false } : fail("conflict")
      }
    }

    const audience: PersonalPostAudience = args.audience ?? "public"
    checked(() => assertGroupAudienceShape({ audience, hasGroup: args.groupId !== undefined }))
    let associationGroup = false
    if (args.groupId !== undefined) {
      checked(() => assertShareOutsideGroup({ hasGroup: true, hasShare: args.sharedPostId !== undefined }))
      const { group } = await requireLiveThematicGroupMembership(ctx, ctx.networkId, args.groupId, ctx.person._id)
      associationGroup = group.associationPageId !== undefined
      if (associationGroup && args.alsoOnRoot === true) return fail("invalidArgument", { field: "alsoOnRoot" })
      if (associationGroup && args.reach !== undefined && args.reach !== "diaspora") return fail("invalidArgument", { field: "reach" })
    }

    // Partage : TOUJOURS par la garde ; partager un partage pointe l'ORIGINAL, re-gardé lui aussi.
    let shared: Doc<"posts"> | null = null
    if (args.sharedPostId !== undefined) {
      shared = await assertVisiblePost(ctx, readerOf(ctx), args.sharedPostId)
      if (shared.sharedPostId !== undefined) shared = await assertVisiblePost(ctx, readerOf(ctx), shared.sharedPostId)
      const target = shared
      // Le partageur VOIT déjà cette publication : la règle explicite ne lui apprend rien.
      checked(() => assertShareable({ audience: target.audience, status: target.status }))
    }

    // La vérité du STOCKAGE écrase le déclaré, média par média (garde des fichiers comprise).
    const media = await verifyDeclaredMedia(ctx, {
      actorPersonId: ctx.person._id,
      networkId: ctx.networkId,
      usage: "media_social",
      source: "post_media",
      declared: args.media ?? [],
    })
    checked(() =>
      assertPostMedia(media.map((item) => ({ kind: item.kind, mimeType: item.mimeType, sizeBytes: item.sizeBytes, ...(item.altText ? { altText: item.altText } : {}) }))),
    )
    const body = checked(() => assertPostContent({ body: args.body, mediaCount: media.length, isShare: shared !== null }))
    const placed = checked(() =>
      assertPostReach({
        ...(associationGroup ? { reach: "diaspora" } : args.reach !== undefined ? { reach: args.reach } : {}),
        ...(args.country !== undefined ? { country: args.country } : {}),
        reachValues: ctx.network.reachValues,
      }),
    )
    const visibility = associationGroup ? "network" as const : effectiveVisibility({
      networkKind: ctx.network.kind,
      audienceIsPublic: audience === "public",
      authorRequestedRoot: args.alsoOnRoot ?? false,
      ruleVisibility: ctx.network.defaultVisibility,
    })

    const { postId } = await writePost(ctx, {
      network: ctx.network,
      authorPersonId: ctx.person._id,
      body,
      audience,
      visibility,
      ...(args.groupId !== undefined ? { groupId: args.groupId } : {}),
      ...(media.length > 0 ? { media } : {}),
      ...(shared ? { sharedPostId: shared._id } : {}),
      ...placed,
      ...(args.province !== undefined ? { province: args.province } : {}),
      ...(args.idempotencyKey !== undefined ? { idempotencyKey: args.idempotencyKey } : {}),
    })

    // L'auteur de l'ORIGINAL apprend le partage — le sujet est SA publication.
    if (shared && hasNativePostAuthor(shared) && (await canReadModeratedContent(ctx, "post", postId, shared.authorPersonId))) {
      await notifyPerson(ctx, { networkId: ctx.networkId, recipientPersonId: shared.authorPersonId, actorPersonId: ctx.person._id, kind: "post_share", subject: { post: shared._id } })
    }
    return { postId, created: true }
  },
})

/**
 * Ma publication, lisible d'ici — sinon le refus indistinct (celle d'autrui
 * comme l'inventée). Une publication de PAGE n'est « mienne » que tant que j'en
 * suis signataire VIVANT : le signataire historique ne garde rien.
 */
async function myPostFrom(ctx: ReadCtx, reader: ReaderContext, postId: Id<"posts">): Promise<NativePersonAuthoredPost> {
  const post = await ctx.db.get(postId)
  if (!post || post.authorPersonId !== reader.personId || !isInReadingContext(post, reader.network)) return notFound()
  if (!(await canAccessAssociationGroupPost(ctx, post, reader.personId, reader.network._id))) return notFound()
  if (post.pageId !== undefined) {
    const page = await ctx.db.get(post.pageId)
    if (!page || (await liveSignatoryRole(ctx, page, reader.personId)) === null) return notFound()
  }
  return requireNativePostAuthor(post)
}

/**
 * Retirer MA publication — partout où elle est lue (son réseau, la racine).
 * Idempotent. Retirée, pas supprimée : la ligne demeure, son auteur la voit
 * encore ; réactions, commentaires et partages cessent d'être atteignables.
 */
export const remove = networkMutation({
  minStatus: "en_attente",
  args: { postId: v.id("posts") },
  returns: v.object({ removed: v.literal(true) }),
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, "post.remove", ctx.person._id)
    const post = await myPostFrom(ctx, readerOf(ctx), args.postId)
    await markPostRemoved(ctx, post, Date.now())
    return { removed: true as const }
  },
})

/** Retirer seulement la lecture sans compte ; l'origine conserve sa publication et ses lecteurs membres. */
export const withdrawFromRoot = networkMutation({
  args: { postId: v.id("posts") }, returns: v.object({ withdrawn: v.literal(true) }),
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, "post.remove", ctx.person._id)
    const post = await ctx.db.get(args.postId)
    if (!post) return notFound()
    if (!(await canAccessAssociationGroupPost(ctx, post, ctx.person._id, ctx.networkId))) return notFound()
    requireNativePostAuthor(post)
    const origin = await ctx.db.get(post.networkId)
    if (!origin || origin.status !== "active" || (origin._id !== ctx.networkId && (ctx.network.kind !== "root" || origin.kind !== "closed" || origin.parentId !== ctx.networkId))) return notFound()
    if (post.pageId !== undefined) {
      const page = await ctx.db.get(post.pageId)
      if (!page || page.networkId !== origin._id || await liveSignatoryRole(ctx, page, ctx.person._id) === null) return notFound()
    } else if (post.authorPersonId !== ctx.person._id || !await isActiveMember(ctx, origin._id, ctx.person._id)) return notFound()
    await withdrawPostRootVisibility(ctx, post, origin, ctx.person._id)
    return { withdrawn: true as const }
  },
})

/** Modifier MA publication sans changer son audience ; les citations AJOUTÉES sont prévenues. */
export const edit = networkMutation({
  minStatus: "declaree",
  args: { postId: v.id("posts"), body: v.string() },
  returns: v.object({ editedAt: v.number() }),
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, "post.edit", ctx.person._id)
    const post = await myPostFrom(ctx, readerOf(ctx), args.postId)
    if (post.status !== "published") return notFound()
    if (post.editorialArticleId !== undefined) return notFound()
    const body = checked(() => assertPostContent({ body: args.body, mediaCount: post.media?.length ?? 0, isShare: post.sharedPostId !== undefined }))
    const now = Date.now()
    const tags = extractHashtags(body)
    const mentioned = (await resolveMentionedPersonIds(ctx, post.networkId, body)).filter((id) => id !== post.authorPersonId)
    await ctx.db.patch(post._id, {
      body,
      tags: tags.length > 0 ? tags : undefined,
      searchText: buildSearchableText(body, tags.join(" ")),
      mentionedPersonIds: mentioned.length > 0 ? mentioned : undefined,
      editedAt: now,
      updatedAt: now,
    })
    const admitted = await moderateContentWrite(ctx, { networkId: post.networkId, ownerPersonId: ctx.person._id, kind: "post", id: post._id, text: body })
    if (admitted) await notifyMentions(ctx, post, addedMentionedIds(post.mentionedPersonIds, mentioned))
    return { editedAt: now }
  },
})

/** Épingler une de mes publications en tête de mon mur DANS CE RÉSEAU. */
export const pinOnMyWall = networkMutation({
  minStatus: "declaree",
  args: { postId: v.id("posts") },
  returns: v.object({ pinned: v.literal(true) }),
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, "post.edit", ctx.person._id)
    const post = await myPostFrom(ctx, readerOf(ctx), args.postId)
    if (post.status !== "published") return notFound()
    checked(() => assertPinnableOnWall({ audience: post.audience, hasPage: post.pageId !== undefined }))
    await ctx.db.patch(ctx.membership._id, { pinnedPostId: post._id })
    return { pinned: true as const }
  },
})

export const unpinMyWall = networkMutation({
  writeBucket: "post.unpin",
  minStatus: "en_attente",
  args: {},
  returns: v.object({ pinned: v.literal(false) }),
  handler: async (ctx) => {
    if (ctx.membership.pinnedPostId !== undefined) await ctx.db.patch(ctx.membership._id, { pinnedPostId: undefined })
    return { pinned: false as const }
  },
})

// ═══════════════════════════════════════════════════════════════
// Lire
// ═══════════════════════════════════════════════════════════════

const nativePageValidator = v.object({
  page: v.array(feedItemValidator),
  isDone: v.boolean(),
  continueCursor: v.string(),
  splitCursor: v.optional(v.union(v.string(), v.null())),
  pageStatus: v.optional(v.union(v.literal("SplitRecommended"), v.literal("SplitRequired"), v.null())),
})

/**
 * Le fil « Récents » à curseur NATIF : tout ce que le lecteur a le DROIT de
 * voir dans ce réseau (à la racine : ses natives et les `root` de tous les
 * réseaux, avec leur origine), du plus récent au plus ancien. Chaque ligne
 * repasse la garde ; une page peut rendre moins que demandé, le curseur
 * continue. Masquage et sourdine s'appliquent (c'est un fil).
 */
export const feed = networkQuery({
  args: { paginationOpts: paginationOptsValidator },
  returns: nativePageValidator,
  handler: async (ctx, { paginationOpts }) => {
    const reader = readerOf(ctx)
    const opts = { ...paginationOpts, numItems: Math.min(Math.max(1, paginationOpts.numItems), FEED_PAGE_MAX) }
    const result =
      ctx.network.kind === "root"
        ? await ctx.db
            .query("posts")
            .withIndex("by_root_status_publishedAt", (q) => q.eq("onRoot", true).eq("status", "published"))
            .order("desc")
            .paginate(opts)
        : await ctx.db
            .query("posts")
            .withIndex("by_network_status_publishedAt", (q) => q.eq("networkId", ctx.networkId).eq("status", "published"))
            .order("desc")
            .paginate(opts)
    const [hidden, muted, marks] = await Promise.all([
      hiddenPostIds(ctx, ctx.networkId, ctx.person._id),
      mutedPersonIds(ctx, ctx.networkId, ctx.person._id),
      readerMarks(ctx, ctx.networkId, ctx.person._id),
    ])
    const enrich = enrichment(ctx, marks)
    const page: FeedItem[] = []
    for (const post of result.page) {
      const reason = await liveFeedReason(ctx, reader, post, "recents")
      if (reason === null || hidden.ids.has(post._id) || (hidden.truncated && await exactFeedHidden(ctx, ctx.networkId, reader.personId, post._id))) continue
      if (post.pageId === undefined && hasNativePostAuthor(post) && (muted.ids.has(post.authorPersonId) || (muted.truncated && await exactFeedMuted(ctx, ctx.networkId, reader.personId, post.authorPersonId)))) continue
      page.push(await toFeedItem(ctx, post, reader, reason, enrich))
    }
    return { ...result, page }
  },
})

/**
 * MON fil, à PORTÉES (« Pour vous », « Récents ») et curseur composite —
 * `(publishedAt, postId)`, dont le serveur relit `_creationTime`.
 *
 * « Pour vous » : éventail à la LECTURE — une fenêtre bornée par source (moi,
 * mes connexions, mes abonnements, au plus `PERSONAL_FEED_AUTHORS_MAX`),
 * fusion k-voies. « Récents » : une fenêtre globale. Le résultat repasse
 * TOUJOURS par `feedAdmissionFor` : l'index accélère une recherche, jamais un
 * droit. `tag` RESTREINT après les gardes, jamais avant. `lacunar` dit à
 * l'écran qu'un ensemble borné a été tronqué ou que la fenêtre n'a pas suffi.
 */
export const myFeed = networkQuery({
  args: {
    cursor: v.optional(cursorValidator),
    limit: v.optional(v.number()),
    tag: v.optional(v.string()),
    scope: v.optional(literals(FEED_SCOPES)),
    /**
     * Les VOIES du fil, composées par l'application selon SA règle (le hub d'un
     * pays, « toute la diaspora ») : une portée et un pays facultatif chacune,
     * au plus quatre. Le fil devient « tout ce que j'ai le droit de voir dans
     * ces voies », du plus récent au plus ancien, sans classement.
     */
    lanes: v.optional(v.array(v.object({ reach: v.string(), country: v.optional(v.string()) }))),
  },
  returns: v.object({ items: v.array(feedItemValidator), nextCursor: v.union(cursorValidator, v.null()), lacunar: v.boolean(), materializedSince: v.optional(v.number()), preparing: v.optional(v.boolean()), preparationKey: v.optional(v.string()) }),
  handler: async (ctx, args): Promise<FeedResult> => {
    const reader = readerOf(ctx)
    const limit = clampLimit(args.limit)
    const cursor = args.cursor
    const tag = args.tag?.trim().toLowerCase() || undefined
    const lanes = args.lanes === undefined ? null : checked(() => normalizeFeedLanes(args.lanes ?? [], ctx.network.reachValues))
    // Les voies servent « tout ce que j'ai le droit de voir » : la portée de découverte.
    const scope = lanes !== null ? "recents" : (args.scope ?? FEED_SCOPE_DEFAULT)

    const [graph, pages, hidden, muted, marks, cursorCreationTime] = await Promise.all([
      readerGraph(ctx, reader),
      readerPages(ctx, reader),
      hiddenPostIds(ctx, ctx.networkId, ctx.person._id),
      mutedPersonIds(ctx, ctx.networkId, ctx.person._id),
      readerMarks(ctx, ctx.networkId, ctx.person._id),
      cursorCreationTimeOf(ctx, cursor),
    ])

    const authorWindow = lanes === null && scope === "pour_vous"
    const state = authorWindow ? await feedState(ctx, reader) : null
    const version = authorWindow ? await feedAccessVersion(ctx, reader) : null
    const stateReady = state !== null && state.status === "ready" && state.accessVersion === version && (state.completedAt ?? 0) > Date.now() - MATERIALIZED_FEED_REBUILD_MS
    const backlog = authorWindow ? await ctx.db.query("feedFanoutJobs").withIndex("by_network_status", q => q.eq("networkId", ctx.networkId).eq("status", "pending")).first() !== null : false
    const wantsMaterialization = authorWindow && shouldMaterializeFeed({
      personSources: new Set([...graph.connections.ids, ...graph.follows.ids, ctx.person._id]).size,
      pageSources: pages.followed.ids.size,
      truncated: graph.connections.truncated || graph.follows.truncated || pages.followed.truncated,
    })
    const useMaterialized = authorWindow && (cursor?.strategy === "materialized" || (cursor === undefined && wantsMaterialization && stateReady))
    // La stratégie est fixée par la première page : une ancienne chaîne reste legacy.
    if (cursor?.strategy === "materialized" && (!authorWindow || !stateReady || !materializedCursorMatches(cursor, state))) return { items: [], nextCursor: null, lacunar: true, preparing: true, ...(version === null ? {} : { preparationKey: await feedPreparationKey(version, state?.generation ?? 0) }) }
    let materialized: MaterializedWindow | null = null
    let sourceWasFull = false
    let sourcesTruncated = false
    let candidates: Doc<"posts">[]
    if (useMaterialized && state !== null) {
      materialized = await materializedWindow(ctx, reader, state, cursor)
      candidates = materialized.rows
      sourceWasFull = materialized.wasFull
    } else if (lanes !== null) {
      // Une fenêtre par voie, fusionnées sous la FRONTIÈRE de la plus courte des fenêtres pleines.
      const merged = mergeFeedWindows(await Promise.all(lanes.map((lane) => feedWindow(laneReader(ctx, ctx.networkId, lane), FEED_SCAN, cursor, cursorCreationTime))))
      candidates = merged.rows
      sourceWasFull = merged.wasFull
    } else if (authorWindow) {
      const sourceIds = boundedFeedSourceIds({ selfId: ctx.person._id, connections: graph.connections.ids, follows: graph.follows.ids })
      // Une fenêtre par PAGE suivie, en plus des auteurs : une publication de page n'entre par AUCUNE fenêtre
      // d'auteur utile (être connecté à son signataire n'ouvre pas la parole de la page).
      const pageIds = [...pages.followed.ids].slice(0, PAGES_FEED_MAX) as Id<"pages">[]
      sourcesTruncated =
        new Set([...graph.connections.ids, ...graph.follows.ids, ctx.person._id]).size > PERSONAL_FEED_AUTHORS_MAX ||
        pages.followed.ids.size > PAGES_FEED_MAX ||
        pages.followed.truncated
      // Fusion sous frontière : une fenêtre pleine n'a rien dit de ce qui est plus ancien que sa dernière ligne.
      const merged = mergeFeedWindows(
        await Promise.all([
          ...sourceIds.map((authorPersonId) => feedWindow(authorReader(ctx, ctx.network, authorPersonId), FEED_AUTHOR_SCAN, cursor, cursorCreationTime)),
          ...pageIds.map((pageId) => feedWindow(pageReader(ctx, ctx.network, pageId), FEED_AUTHOR_SCAN, cursor, cursorCreationTime)),
        ]),
      )
      candidates = merged.rows
      sourceWasFull = merged.wasFull
    } else {
      const global = await feedWindow(globalReader(ctx, ctx.network), FEED_SCAN, cursor, cursorCreationTime)
      candidates = global.rows
      sourceWasFull = global.wasFull
    }

    // ═══ Phase 1 — SÉLECTION, à froid.
    const selected: { post: Doc<"posts">; reason: FeedReason }[] = []
    /** La dernière ligne EXAMINÉE — pas la dernière du balayage : pointer la fin de la fenêtre ouvrirait un trou. */
    let lastExamined: Doc<"posts"> | null = null
    for (const post of candidates) {
      lastExamined = post
      const reason = await liveFeedReason(ctx, reader, post, scope)
      if (reason === null) continue
      // Masquage et sourdine APRÈS la garde, et au FIL seul.
      if (hidden.ids.has(post._id) || (hidden.truncated && await exactFeedHidden(ctx, ctx.networkId, reader.personId, post._id))) continue
      if (post.pageId === undefined && hasNativePostAuthor(post) && (muted.ids.has(post.authorPersonId) || (muted.truncated && await exactFeedMuted(ctx, ctx.networkId, reader.personId, post.authorPersonId)))) continue
      if (tag !== undefined && !(post.tags ?? []).includes(tag)) continue
      selected.push({ post, reason })
      if (selected.length >= limit) break
    }

    // ═══ Phase 2 — ENRICHISSEMENT, sur la page seulement.
    const enrich = enrichment(ctx, marks)
    const items: FeedItem[] = []
    for (const { post, reason } of selected) items.push(await toFeedItem(ctx, post, reader, reason, enrich))

    // Un curseur dans DEUX cas : fenêtre pleine (il reste peut-être derrière), ou sortie à `limit` (il reste devant).
    const stoppedEarly = selected.length >= limit
    const windowLacuna = !authorWindow && lanes === null && isLacunarFeedWindow({ candidatesLength: candidates.length, scanLimit: FEED_SCAN, selectedLength: selected.length, pageLimit: limit })
    const nextCursor = materialized !== null && state !== null
      ? (stoppedEarly && lastExamined !== null ? materializedPostCursor(lastExamined, state) : sourceWasFull ? materialized.tail : null)
      : (sourceWasFull || stoppedEarly) && lastExamined !== null ? cursorForFeedPost(lastExamined) : null
    return {
      items,
      nextCursor,
      ...(materialized === null ? {} : { materializedSince: materialized.historyStart }),
      ...(wantsMaterialization && !useMaterialized ? { preparing: true, preparationKey: await feedPreparationKey(version ?? "", state?.generation ?? 0) } : {}),
      lacunar:
        backlog ||
        (materialized !== null && !stoppedEarly) ||
        windowLacuna ||
        (!useMaterialized && (sourcesTruncated || graph.connections.truncated || graph.follows.truncated || wantsMaterialization)),
    }
  },
})

/**
 * Chercher dans les publications que J'AI LE DROIT DE VOIR depuis ce réseau.
 * La facette de l'index ne remplace JAMAIS la garde : l'index rend une fenêtre
 * bornée de publications EN LIGNE, puis chaque ligne passe LA garde (une seule,
 * D25). Une publication de groupe d'autrui ne remonte jamais : elle se cherche
 * sur le mur de son groupe. Masquage et sourdine ne s'appliquent pas (acte de
 * découverte) ; le blocage, si.
 */
export const search = networkQuery({
  args: { query: v.string(), limit: v.optional(v.number()) },
  returns: v.object({ items: v.array(feedItemValidator) }),
  handler: async (ctx, args) => {
    const reader = readerOf(ctx)
    const limit = clampLimit(args.limit)
    const query = foldSearchQuery(args.query)
    // Trop courte : liste vide, et AUCUN balayage.
    if (query.length < SEARCH_QUERY_MIN) return { items: [] }
    const candidates =
      ctx.network.kind === "root"
        ? await ctx.db
            .query("posts")
            .withSearchIndex("search_body_v2", (q) => q.search("searchText", query).eq("onRoot", true).eq("status", "published"))
            .take(SEARCH_SCAN)
        : await ctx.db
            .query("posts")
            .withSearchIndex("search_body_v2", (q) => q.search("searchText", query).eq("networkId", ctx.networkId).eq("status", "published"))
            .take(SEARCH_SCAN)
    const visible: Doc<"posts">[] = []
    for (const post of candidates) {
      if (post.audience === "group" && post.authorPersonId !== reader.personId) continue
      if (await canSeePostDoc(ctx, reader, post)) visible.push(post)
    }
    visible.sort((left, right) => right.publishedAt - left.publishedAt)
    const page = visible.slice(0, limit)
    const graph = page.length > 0 ? await readerGraph(ctx, reader) : null
    const enrich = enrichment(ctx)
    const items: FeedItem[] = []
    for (const post of page) {
      if (post.pageId !== undefined) {
        items.push(await toFeedItem(ctx, post, reader, await pageViewingReason(ctx, reader, post.pageId), enrich))
        continue
      }
      if (!hasNativePostAuthor(post)) continue
      const isAuthor = post.authorPersonId === reader.personId
      const reason =
        post.audience === "group"
          ? groupViewingReasonFor({ isAuthor })
          : viewingReasonFor({
              isAuthor,
              isConnected: graph?.connections.ids.has(post.authorPersonId) ?? false,
              isFollowing: graph?.follows.ids.has(post.authorPersonId) ?? false,
            })
      items.push(await toFeedItem(ctx, post, reader, reason, enrich))
    }
    return { items }
  },
})

const myPostValidator = v.object({
  postId: v.id("posts"),
  body: v.string(),
  media: v.array(postMediaDtoValidator),
  audience: postAudienceValidator,
  visibility: contentVisibilityValidator,
  status: postStatusValidator,
  publishedAt: v.number(),
  reactions: v.object({ counts: reactionCountsValidator, total: v.number(), mine: v.union(reactionKindValidator, v.null()) }),
  commentCount: v.number(),
  shareCount: v.number(),
})

/** MES publications nées dans ce réseau, retirées comprises — je suis seul à voir les miennes retirées. */
export const paginateMyPosts = networkQuery({
  args: { paginationOpts: paginationOptsValidator },
  returns: v.object({
    page: v.array(myPostValidator),
    isDone: v.boolean(),
    continueCursor: v.string(),
    splitCursor: v.optional(v.union(v.string(), v.null())),
    pageStatus: v.optional(v.union(v.literal("SplitRecommended"), v.literal("SplitRequired"), v.null())),
  }),
  handler: async (ctx, args) => {
    const result = await ctx.db
      .query("posts")
      .withIndex("by_network_author_publishedAt", (q) => q.eq("networkId", ctx.networkId).eq("authorPersonId", ctx.person._id))
      .order("desc")
      .paginate(args.paginationOpts)
    const page = []
    for (const post of result.page) {
      // Une publication de PAGE appartient à la page : elle se gère depuis la page, pas depuis « mes publications ».
      if (post.pageId !== undefined) continue
      if (!(await canAccessAssociationGroupPost(ctx, post, ctx.person._id, ctx.networkId))) continue
      const [reactions, commentCount, shareCount, media] = await Promise.all([
        summarizeReactions(ctx, post._id, ctx.person._id),
        countComments(ctx, post._id),
        countShares(ctx, post._id),
        resolvePostMediaDtos(ctx, post.media, post.federationMedia),
      ])
      page.push({
        postId: post._id,
        body: post.body,
        media,
        audience: post.audience,
        visibility: post.visibility,
        status: post.status,
        publishedAt: post.publishedAt,
        reactions,
        commentCount,
        shareCount,
      })
    }
    return { ...result, page }
  },
})

/**
 * Le MUR d'une personne — ses publications lisibles d'ici, telles que JE peux
 * les voir. Un mur n'a qu'UN auteur : les liens se lisent une seule fois.
 * Refus INDISTINCT : identifiant inconnu, profil retiré, non-membre, blocage —
 * le MÊME mur vide, sans curseur. Groupe exclu (son lieu est le mur du groupe).
 * L'épingle de l'auteur dans ce réseau est rendue à part, en première page.
 * Lecture BORNÉE : au plus `WALL_WINDOWS_MAX` fenêtres par appel.
 */
export const personPosts = networkQuery({
  args: { handle: v.string(), cursor: v.optional(cursorValidator), limit: v.optional(v.number()) },
  returns: v.object({ items: v.array(feedItemValidator), nextCursor: v.union(cursorValidator, v.null()), pinned: v.union(feedItemValidator, v.null()) }),
  handler: async (ctx, args) => {
    const reader = readerOf(ctx)
    const limit = clampLimit(args.limit)
    const empty = { items: [], nextCursor: null, pinned: null }
    const found = await findPublishedPersonByHandle(ctx, ctx.networkId, args.handle)
    if (!found) return empty
    const authorPersonId = found._id
    const isAuthor = authorPersonId === reader.personId
    if (!isAuthor && (await isBlockedBetween(ctx, reader.personId, authorPersonId))) return empty

    const [isConnected, isFollowing, cursorCreationTime, authorMembership] = await Promise.all([
      isAuthor ? Promise.resolve(false) : isConnectedTo(ctx, ctx.networkId, reader.personId, authorPersonId),
      isAuthor ? Promise.resolve(false) : isFollowingPerson(ctx, ctx.networkId, reader.personId, authorPersonId),
      cursorCreationTimeOf(ctx, args.cursor),
      ctx.db
        .query("networkMemberships")
        .withIndex("by_network_and_person", (q) => q.eq("networkId", ctx.networkId).eq("personId", authorPersonId))
        .unique(),
    ])
    const reason = viewingReasonFor({ isAuthor, isConnected, isFollowing })
    const enrich = enrichment(ctx)

    // L'épingle : relue AVEC sa garde ; retirée ou hors de portée, elle disparaît d'elle-même.
    let pinnedPost: Doc<"posts"> | null = null
    if (authorMembership?.pinnedPostId !== undefined) {
      const candidate = await ctx.db.get(authorMembership.pinnedPostId)
      if (candidate && candidate.authorPersonId === authorPersonId && candidate.audience !== "group" && candidate.pageId === undefined && (await canSeePostDoc(ctx, reader, candidate))) pinnedPost = candidate
    }

    const visible: Doc<"posts">[] = []
    let lastExamined: Doc<"posts"> | null = null
    let exhausted = false
    let windowCursor = args.cursor
    let windowCursorCreationTime = cursorCreationTime
    for (let pass = 0; pass < WALL_WINDOWS_MAX; pass += 1) {
      const window = await feedWindow(authorReader(ctx, ctx.network, authorPersonId), FEED_AUTHOR_SCAN, windowCursor, windowCursorCreationTime)
      for (const post of window.rows) {
        lastExamined = post
        // Une publication de GROUPE ne figure sur AUCUN mur personnel, pas même vu par son auteur ;
        // une publication de PAGE non plus — pas même sur celui de son signataire.
        if (post.audience === "group" || post.pageId !== undefined) continue
        if (pinnedPost && post._id === pinnedPost._id) continue
        if (!(await canReadModeratedContent(ctx, "post", post._id, reader.personId))) continue
        const admitted = isPersonalPostVisibleTo({ audience: post.audience, status: post.status, isAuthor, isConnected, isGroupMember: false, isBlockedWithAuthor: false, isPageAudience: false })
        if (!admitted) continue
        visible.push(post)
        if (visible.length >= limit) break
      }
      if (visible.length >= limit) break
      // Fenêtre non pleine ET entièrement parcourue : le mur est fini.
      if (!window.wasFull) {
        exhausted = true
        break
      }
      const frontier = window.rows[window.rows.length - 1]
      if (frontier === undefined) {
        exhausted = true
        break
      }
      windowCursor = cursorForFeedPost(frontier)
      windowCursorCreationTime = frontier._creationTime
    }

    const items: FeedItem[] = []
    for (const post of visible) items.push(await toFeedItem(ctx, post, reader, reason, enrich))
    return {
      items,
      nextCursor: exhausted || lastExamined === null ? null : cursorForFeedPost(lastExamined),
      pinned: args.cursor === undefined && pinnedPost ? await toFeedItem(ctx, pinnedPost, reader, reason, enrich) : null,
    }
  },
})

/**
 * UNE publication, si je peux la voir MAINTENANT depuis ce réseau. Le titre
 * est celui de la LECTURE, pas de l'entrée au fil.
 */
export const getPost = networkQuery({
  args: { postId: v.id("posts") },
  returns: feedItemValidator,
  handler: async (ctx, args) => {
    const reader = readerOf(ctx)
    const post = await assertVisiblePost(ctx, reader, args.postId)
    const isAuthor = hasNativePostAuthor(post) && post.authorPersonId === reader.personId
    const [bookmark, notify] = await Promise.all(
      (["bookmark", "notify"] as const).map(
        async (kind) =>
          await ctx.db
            .query("postMarks")
            .withIndex("by_network_person_kind_post", (q) => q.eq("networkId", ctx.networkId).eq("personId", reader.personId).eq("kind", kind).eq("postId", post._id))
            .unique(),
      ),
    )
    const enrich = enrichment(ctx, {
      bookmarked: new Set(bookmark ? [post._id] : []),
      notifying: new Set(notify ? [post._id] : []),
    })
    if (post.audience === "group") return await toFeedItem(ctx, post, reader, groupViewingReasonFor({ isAuthor }), enrich)
    if (post.pageId !== undefined) return await toFeedItem(ctx, post, reader, await pageViewingReason(ctx, reader, post.pageId), enrich)
    const nativePost = requireNativePostAuthor(post)
    const [isConnected, isFollowing] = isAuthor
      ? [false, false]
      : await Promise.all([isConnectedTo(ctx, post.networkId, reader.personId, nativePost.authorPersonId), isFollowingPerson(ctx, ctx.networkId, reader.personId, nativePost.authorPersonId)])
    return await toFeedItem(ctx, post, reader, viewingReasonFor({ isAuthor, isConnected, isFollowing }), enrich)
  },
})
