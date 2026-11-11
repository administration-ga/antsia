// Dupliqué de socle/convex/modules/reseauPersonnel/stories.ts @ ad2e7fdc2 — adaptations : stories PAR RÉSEAU (publiées, lues, comptées et vues dans le réseau appelé ; une story d'un autre réseau est introuvable) ; adhésion par le constructeur ; surfaces `reseau`/`icom` (ADR-0079 du socle) retirées avec leurs paramètres ; délivrance par la garde des fichiers (D05 : plus de `getUrl` brut) — une story dont le média n'est pas servable est omise pour les autres, montrée retenue à son auteur ; `viewCount` dans l'agrégat `engineCounters` (D02) ; l'instant des lectures (`tray`, `listByAuthor`, `myActive`) vient du client (D16) ; « vu par » à curseur NATIF (le socle perdait les ex æquo d'une frontière de page) ; vignette du plateau sans le champ de compatibilité `coverUrl` ; purge du blob ET de sa ligne d'analyse (D10) et des entrées de l'agrégat ; plafond `STORY_ACTIVE_PER_AUTHOR_MAX` par réseau, règle `STORY_ACTIVE_LIMIT` ; refus indistinct à code ; débit (`story.publish`, `story.view`, `story.remove`, D14) ; SD-01 : purge suspendue pour une story sous signalement ouvert (lisible par la modération jusqu'à la décision, effacée au passage suivant), parcours de la fenêtre par curseur pour qu'une story retenue n'arrête jamais les autres.
/**
 * Les STORIES — publier, regarder, purger. ÉPHÉMÈRE PAR CONTRAT.
 *
 *  - **Un seul chemin de purge** : le retrait pose `removedAt` et ramène
 *    `expiresAt` à maintenant ; expiration et retrait sortent par la même porte.
 *  - **Une story signalée attend la décision** (SD-01) : sous un dossier
 *    ouvert, la purge la laisse (ligne, vues, blob) pour que la modération la
 *    relise ; elle reste invisible des membres, et part au passage suivant la
 *    décision.
 *  - **Le plateau ne lit jamais sans borne** : sources bornées, stories bornées
 *    par auteur (plafond tenu à la publication), vues bornées.
 *  - **Aucun identifiant de stockage ne sort d'un DTO** : l'URL vient de la
 *    garde ; une story dont le média n'est pas servable est OMISE pour les
 *    autres — le média EST la story.
 *
 * Les LISTES partent de la fenêtre VIVANTE (`expiresAt > now`) : une story
 * expirée ou retirée n'y reparaît pour personne, pas même son auteur. Les
 * gestes qui désignent UNE story (`markSeen`, `viewers`, `remove`) l'acceptent
 * de son auteur jusqu'à la purge.
 */
import type { CounterpartLabel } from "@antsia/social-contracts/counterpart"
import type { MediaWithheld } from "@antsia/social-contracts/media"
import { PERSONAL_REACH_AUDIENCES } from "@antsia/social-domain/content"
import { boundedFeedSourceIds } from "@antsia/social-domain/feedScale"
import { assertStoryCaption, assertStoryMedia, isStoryExpired, isStoryVisibleTo, STORY_ACTIVE_PER_AUTHOR_MAX, STORY_TTL_MS, storyExpiresAt } from "@antsia/social-domain/stories"
import { paginationOptsValidator, type PaginationResult } from "convex/server"
import { v } from "convex/values"

import { internal } from "../../_generated/api"
import { canReadModeratedContent, contentState, moderateContentWrite } from "../moderation/policy"
import { hasOpenReport } from "../moderation/openReports"
import type { Doc, Id } from "../../_generated/dataModel"
import { internalMutation, type QueryCtx } from "../../_generated/server"
import { checked, fail, failRule, notFound } from "../../lib/errors"
import { networkMutation, networkQuery } from "../../lib/functions"
import { enforceRateLimit } from "../../lib/rateLimit"
import { literals } from "../../lib/validators"
import { resolveFileDelivery, withheldCodeOf } from "../files/storageGuard"
import { purgeStoredFile } from "../files/purge"
import { acceptedCounterpartIds, blockedCounterpartIds, followedPersonIds, isBlockedBetween, isConnectedTo } from "../graph/graph"
import { declaredMediaValidator, verifyDeclaredMedia } from "../media/media"
import { counterpartOf } from "../messaging/participation"
import { findPublishedPersonByHandle, miniProfileCache } from "../people/miniProfile"
import { engineCounters } from "../posts/counters"
import { activeDailySpecialStory, resolveDailySpecialSource, type DailySpecialDto } from "./dailySpecialSource"
import type { CatalogReadContext } from "../shops/catalogRead"

type ReadCtx = Pick<QueryCtx, "db">

/**
 * Auteurs interrogés par le plateau, au plus — plus bas que le fil : le
 * plateau rend un GROUPE par source, son coût est linéaire en sources.
 */
export const TRAY_SOURCES_MAX = 100
const TRAY_LIMIT_DEFAULT = 30
const TRAY_LIMIT_MAX = 50
/** Mes vues des dernières 24 heures, lues UNE fois par plateau et par mur. */
const MY_VIEWS_SCAN = 500
const VIEWERS_PAGE_MAX = 50
/** Stories traitées par passe de purge. */
export const PURGE_BATCH = 50
/** Vues supprimées par story et par passe ; au-delà, la story attend un tour. */
export const PURGE_VIEWS_BATCH = 200

// ═══════════════════════════════════════════════════════════════
// Spectateurs — l'agrégat, jamais un champ de la story (D02)
// ═══════════════════════════════════════════════════════════════

const viewsOf = (storyId: Id<"stories">) => `stories.views:${storyId}`

async function countViews(ctx: Pick<QueryCtx, "runQuery">, storyId: Id<"stories">): Promise<number> {
  return await engineCounters.count(ctx, { namespace: viewsOf(storyId) })
}

// ═══════════════════════════════════════════════════════════════
// DTO — allowlistés, sans jamais un identifiant de stockage
// ═══════════════════════════════════════════════════════════════

export type StoryDto = {
  storyId: Id<"stories">
  media: { url: string | null; withheld: MediaWithheld | null; kind: "image" | "video"; mimeType: string; width?: number; height?: number; durationMs?: number }
  caption: string | null
  audience: (typeof PERSONAL_REACH_AUDIENCES)[number]
  publishedAt: number
  expiresAt: number
  /** Ce lecteur l'a-t-il déjà regardée ? (Sa propre story l'est par définition.) */
  seen: boolean
  isOwn: boolean
  /** Spectateurs uniques — `null` pour qui n'est pas l'auteur : une donnée privée de celui qui publie. */
  viewCount: number | null
  dailySpecial?: DailySpecialDto
}

/**
 * Une story lisible par l'écran, ou `null` : pour un autre que l'auteur, une
 * story SANS média servable n'est rien (mieux vaut un plateau plus court qu'une
 * vignette vide) ; son auteur la voit retenue, avec la raison.
 */
async function storyDto(ctx: QueryCtx, story: Doc<"stories">, view: { isOwn: boolean; seen: boolean }, context: CatalogReadContext & { network: Doc<"networks">; now: number }): Promise<StoryDto | null> {
  const source = story.media.kind === "daily_special" ? await resolveDailySpecialSource(ctx, context, { shopId: story.media.shopId, authorPersonId: story.authorPersonId, now: context.now, reference: story.media }) : null
  if (story.media.kind === "daily_special" && source === null) return null
  const delivery = story.media.kind !== "daily_special" ? await resolveFileDelivery(ctx, story.media.storageId) : null
  if (delivery?.url === null && !view.isOwn) return null
  return {
    storyId: story._id,
    media: story.media.kind === "daily_special" ? source!.media : {
      url: delivery!.url,
      withheld: withheldCodeOf(delivery!.scan),
      kind: story.media.kind,
      mimeType: story.media.mimeType,
      ...(story.media.width !== undefined ? { width: story.media.width } : {}),
      ...(story.media.height !== undefined ? { height: story.media.height } : {}),
      ...(story.media.durationMs !== undefined ? { durationMs: story.media.durationMs } : {}),
    },
    caption: story.caption ?? null,
    audience: story.audience,
    publishedAt: story.publishedAt,
    expiresAt: story.expiresAt,
    seen: view.isOwn ? true : view.seen,
    isOwn: view.isOwn,
    viewCount: view.isOwn ? await countViews(ctx, story._id) : null,
    ...(source ? { dailySpecial: source.dailySpecial } : {}),
  }
}

// ═══════════════════════════════════════════════════════════════
// Lectures partagées
// ═══════════════════════════════════════════════════════════════

/** Les stories VIVANTES d'un auteur dans un réseau, dans l'index — jamais un filtre de date. */
async function liveStoriesOf(ctx: ReadCtx, networkId: Id<"networks">, authorPersonId: Id<"persons">, now: number): Promise<Doc<"stories">[]> {
  return await ctx.db
    .query("stories")
    .withIndex("by_network_author_expiresAt", (q) => q.eq("networkId", networkId).eq("authorPersonId", authorPersonId).gt("expiresAt", now))
    .take(STORY_ACTIVE_PER_AUTHOR_MAX)
}

/** Ce que J'AI vu dans ce réseau sur la fenêtre utile — une lecture pour tout un plateau. */
async function myRecentlySeenStoryIds(ctx: ReadCtx, networkId: Id<"networks">, viewerPersonId: Id<"persons">, now: number): Promise<Set<string>> {
  const rows = await ctx.db
    .query("storyViews")
    .withIndex("by_network_viewer_seenAt", (q) => q.eq("networkId", networkId).eq("viewerPersonId", viewerPersonId).gte("seenAt", now - STORY_TTL_MS))
    .take(MY_VIEWS_SCAN)
  return new Set(rows.map((row) => row.storyId))
}

/** LA garde, posée LIGNE À LIGNE, sur des faits relus. */
function isVisibleLine(story: Doc<"stories">, facts: { readerPersonId: Id<"persons">; isConnected: boolean; isBlockedWithAuthor: boolean; now: number }): boolean {
  return isStoryVisibleTo({
    audience: story.audience,
    isAuthor: story.authorPersonId === facts.readerPersonId,
    isConnected: facts.isConnected,
    isBlockedWithAuthor: facts.isBlockedWithAuthor,
    isRemoved: story.removedAt !== undefined,
    isExpired: isStoryExpired(story.expiresAt, facts.now),
  })
}

/** La story, dans le réseau appelé, VISIBLE de ce lecteur — sinon le refus indistinct. */
async function requireVisibleStory(ctx: QueryCtx, networkId: Id<"networks">, storyId: Id<"stories">, readerPersonId: Id<"persons">, now: number, context: CatalogReadContext & { network: Doc<"networks"> }): Promise<Doc<"stories">> {
  const story = await ctx.db.get(storyId)
  if (!story || story.networkId !== networkId || !(await canReadModeratedContent(ctx, "story", story._id, readerPersonId))) return notFound()
  const isAuthor = story.authorPersonId === readerPersonId
  const isConnected = isAuthor ? false : await isConnectedTo(ctx, networkId, readerPersonId, story.authorPersonId)
  const isBlockedWithAuthor = isAuthor ? false : await isBlockedBetween(ctx, readerPersonId, story.authorPersonId)
  if (!isVisibleLine(story, { readerPersonId, isConnected, isBlockedWithAuthor, now })) return notFound()
  if (story.media.kind === "daily_special" && !await resolveDailySpecialSource(ctx, context, { shopId: story.media.shopId, authorPersonId: story.authorPersonId, now, reference: story.media })) return notFound()
  return story
}

// ═══════════════════════════════════════════════════════════════
// Publier
// ═══════════════════════════════════════════════════════════════

/**
 * Publier une story : UN média, une légende facultative, vingt-quatre heures.
 * Gardes, dans cet ordre : idempotence (rejouer la clé rend la story EXISTANTE),
 * vérité du STOCKAGE (garde des fichiers), jugement du média RÉEL, plafond des
 * stories vivantes dans le réseau, en dernier.
 */
export const publish = networkMutation({
  minStatus: "declaree",
  args: { media: declaredMediaValidator, caption: v.optional(v.string()), audience: literals(PERSONAL_REACH_AUDIENCES), idempotencyKey: v.optional(v.string()) },
  returns: v.object({ storyId: v.id("stories"), created: v.boolean(), expiresAt: v.number() }),
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, "story.publish", ctx.person._id)
    if (args.idempotencyKey !== undefined) {
      const replay = await ctx.db
        .query("stories")
        .withIndex("by_author_idempotency", (q) => q.eq("authorPersonId", ctx.person._id).eq("idempotencyKey", args.idempotencyKey))
        .first()
      if (replay) return replay.networkId === ctx.networkId ? { storyId: replay._id, created: false, expiresAt: replay.expiresAt } : fail("conflict")
    }
    const [verified] = await verifyDeclaredMedia(ctx, { actorPersonId: ctx.person._id, networkId: ctx.networkId, usage: "story_media", source: "story", declared: [args.media] })
    if (verified === undefined) return notFound()
    checked(() => assertStoryMedia({ kind: verified.kind, mimeType: verified.mimeType, sizeBytes: verified.sizeBytes, ...(verified.durationMs !== undefined ? { durationMs: verified.durationMs } : {}) }))
    const caption = checked(() => assertStoryCaption(args.caption))
    const now = Date.now()
    // Le plafond se compte sur les VIVANTES : une story retirée libère sa place aussitôt.
    if ((await liveStoriesOf(ctx, ctx.networkId, ctx.person._id, now)).length >= STORY_ACTIVE_PER_AUTHOR_MAX) return failRule("STORY_ACTIVE_LIMIT", { max: STORY_ACTIVE_PER_AUTHOR_MAX })
    const expiresAt = storyExpiresAt(now)
    const storyId = await ctx.db.insert("stories", {
      networkId: ctx.networkId,
      authorPersonId: ctx.person._id,
      media: verified,
      ...(caption !== undefined ? { caption } : {}),
      audience: args.audience,
      publishedAt: now,
      expiresAt,
      ...(args.idempotencyKey !== undefined ? { idempotencyKey: args.idempotencyKey } : {}),
    })
    await moderateContentWrite(ctx, { networkId: ctx.networkId, ownerPersonId: ctx.person._id, kind: "story", id: storyId, text: caption ?? "" })
    return { storyId, created: true, expiresAt }
  },
})

/** Geste explicite du gérant : une référence au plat actuel, publique dans CE réseau seulement. */
export const publishDailySpecial = networkMutation({
  minStatus: "declaree",
  args: { shopId: v.id("shops"), expectedOfferRef: v.string(), expectedDay: v.string() },
  returns: v.object({ storyId: v.id("stories"), created: v.boolean(), expiresAt: v.number() }),
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, "story.publish", ctx.person._id)
    const now = Date.now()
    const context = { root: ctx.rootNetwork, network: ctx.network, readerPersonId: ctx.person._id }
    const source = await resolveDailySpecialSource(ctx, context, { shopId: args.shopId, authorPersonId: ctx.person._id, now })
    if (!source || source.reference.offerRef !== args.expectedOfferRef || source.reference.day !== args.expectedDay) return notFound()
    const replay = await activeDailySpecialStory(ctx, ctx.networkId, args.shopId, source.reference.revision, now)
    if (replay) {
      if (replay.media.kind !== "daily_special") return notFound()
      const replaySource = await resolveDailySpecialSource(ctx, context, { shopId: replay.media.shopId, authorPersonId: replay.authorPersonId, now, reference: replay.media })
      if (replaySource) {
        await requireVisibleStory(ctx, ctx.networkId, replay._id, ctx.person._id, now, context)
        return { storyId: replay._id, created: false, expiresAt: replay.expiresAt }
      }
      // Le relais d'un ancien gérant ne contourne jamais une Story masquée ou bloquée.
      if ((await contentState(ctx, "story", replay._id))?.status !== "published" || !await canReadModeratedContent(ctx, "story", replay._id, ctx.person._id)) return notFound()
      const isAuthor = replay.authorPersonId === ctx.person._id
      const isConnected = isAuthor ? false : await isConnectedTo(ctx, ctx.networkId, ctx.person._id, replay.authorPersonId)
      const isBlockedWithAuthor = isAuthor ? false : await isBlockedBetween(ctx, ctx.person._id, replay.authorPersonId)
      if (!isVisibleLine(replay, { readerPersonId: ctx.person._id, isConnected, isBlockedWithAuthor, now })) return notFound()
      await ctx.db.patch(replay._id, { removedAt: now, expiresAt: now })
    }
    if ((await liveStoriesOf(ctx, ctx.networkId, ctx.person._id, now)).length >= STORY_ACTIVE_PER_AUTHOR_MAX) return failRule("STORY_ACTIVE_LIMIT", { max: STORY_ACTIVE_PER_AUTHOR_MAX })
    const expiresAt = Math.min(storyExpiresAt(now), source.expiresAt)
    const storyId = await ctx.db.insert("stories", { networkId: ctx.networkId, authorPersonId: ctx.person._id, media: source.reference, audience: "public", publishedAt: now, expiresAt })
    await moderateContentWrite(ctx, { networkId: ctx.networkId, ownerPersonId: ctx.person._id, kind: "story", id: storyId, text: "" })
    return { storyId, created: true, expiresAt }
  },
})

// ═══════════════════════════════════════════════════════════════
// Le PLATEAU — la barre de vignettes, groupée par auteur
// ═══════════════════════════════════════════════════════════════

export type TrayGroup = {
  author: CounterpartLabel & { personId: Id<"persons"> }
  storyCount: number
  unseenCount: number
  latestPublishedAt: number
  /** Le média le plus récent dont la garde sert l'URL — un groupe sans aucun est écarté. */
  cover: { url: string; kind: "image" | "video" }
}

/**
 * Le plateau du réseau : un groupe par auteur qui a quelque chose à montrer
 * MAINTENANT. Connexions, abonnements, blocages et mes vues sont lus UNE fois.
 * Le blocage retire la source avant la boucle ET reste passé à la garde ligne
 * à ligne. Ordre : moi d'abord, puis les non-vues du plus récent au plus
 * ancien, puis le reste — un plateau qui se vide en le regardant.
 */
export const tray = networkQuery({
  args: { now: v.number(), limit: v.optional(v.number()) },
  handler: async (ctx, args): Promise<{ groups: TrayGroup[]; truncated: boolean }> => {
    const limit = Math.min(Math.max(Math.trunc(args.limit ?? TRAY_LIMIT_DEFAULT), 1), TRAY_LIMIT_MAX)
    const me = ctx.person._id
    const [connections, follows, blocked, seenIds] = await Promise.all([
      acceptedCounterpartIds(ctx, ctx.networkId, me),
      followedPersonIds(ctx, ctx.networkId, me),
      blockedCounterpartIds(ctx, me),
      myRecentlySeenStoryIds(ctx, ctx.networkId, me, args.now),
    ])
    const sources = boundedFeedSourceIds({
      selfId: me,
      connections: [...connections.ids].filter((id) => !blocked.ids.has(id)),
      follows: [...follows.ids].filter((id) => !blocked.ids.has(id)),
      max: TRAY_SOURCES_MAX,
    })
    const profileOf = miniProfileCache(ctx)
    const groups: TrayGroup[] = []
    for (const authorPersonId of sources) {
      const isOwn = authorPersonId === me
      const isBlockedWithAuthor = !isOwn && (blocked.ids.has(authorPersonId) || (blocked.truncated && (await isBlockedBetween(ctx, me, authorPersonId))))
      const candidates = (await liveStoriesOf(ctx, ctx.networkId, authorPersonId, args.now)).filter(
        (story) => story.removedAt === undefined && isVisibleLine(story, { readerPersonId: me, isConnected: connections.ids.has(authorPersonId), isBlockedWithAuthor, now: args.now }),
      )
      const visible: { story: Doc<"stories">; cover: TrayGroup["cover"] | null }[] = []
      for (const story of candidates) {
        if (!await canReadModeratedContent(ctx, "story", story._id, me)) continue
        if (story.media.kind === "daily_special") {
          const source = await resolveDailySpecialSource(ctx, { root: ctx.rootNetwork, network: ctx.network, readerPersonId: me }, { shopId: story.media.shopId, authorPersonId: story.authorPersonId, now: args.now, reference: story.media })
          if (source) visible.push({ story, cover: { url: source.media.url, kind: "image" } })
        } else {
          const url = (await resolveFileDelivery(ctx, story.media.storageId)).url
          visible.push({ story, cover: url !== null ? { url, kind: story.media.kind } : null })
        }
      }
      if (visible.length === 0) continue
      const byRecency = [...visible].sort((left, right) => right.story.publishedAt - left.story.publishedAt)
      let cover: TrayGroup["cover"] | null = null
      for (const item of byRecency) {
        if (item.cover !== null) {
          cover = item.cover
          break
        }
      }
      // Rien de servable : un rail qui promet ce que le lecteur ne peut pas jouer est le pire des deux.
      if (cover === null) continue
      const unseenCount = isOwn ? 0 : visible.filter(({ story }) => !seenIds.has(story._id)).length
      groups.push({
        author: { ...(await counterpartOf(ctx, authorPersonId, profileOf)), personId: authorPersonId },
        storyCount: visible.length,
        unseenCount,
        latestPublishedAt: byRecency[0]!.story.publishedAt,
        cover,
      })
    }
    groups.sort((left, right) => {
      const leftMine = left.author.personId === me
      const rightMine = right.author.personId === me
      if (leftMine !== rightMine) return leftMine ? -1 : 1
      const leftUnseen = left.unseenCount > 0
      const rightUnseen = right.unseenCount > 0
      if (leftUnseen !== rightUnseen) return leftUnseen ? -1 : 1
      return right.latestPublishedAt - left.latestPublishedAt
    })
    return { groups: groups.slice(0, limit), truncated: connections.truncated || follows.truncated }
  },
})

// ═══════════════════════════════════════════════════════════════
// Regarder — le mur d'une personne, le mien
// ═══════════════════════════════════════════════════════════════

/**
 * Les stories d'une personne, par son identifiant, dans l'ordre où elles se
 * regardent (la plus ancienne d'abord). Identifiant inconnu, profil retiré,
 * non-membre et blocage : le MÊME refus.
 */
export const listByAuthor = networkQuery({
  args: { handle: v.string(), now: v.number() },
  handler: async (ctx, args): Promise<StoryDto[]> => {
    const author = await findPublishedPersonByHandle(ctx, ctx.networkId, args.handle)
    if (!author) return notFound()
    const me = ctx.person._id
    const isOwn = author._id === me
    if (!isOwn && (await isBlockedBetween(ctx, me, author._id))) return notFound()
    const isConnected = isOwn ? false : await isConnectedTo(ctx, ctx.networkId, me, author._id)
    const [rows, seenIds] = await Promise.all([liveStoriesOf(ctx, ctx.networkId, author._id, args.now), myRecentlySeenStoryIds(ctx, ctx.networkId, me, args.now)])
    const items: StoryDto[] = []
    for (const story of [...rows].sort((a, b) => a.publishedAt - b.publishedAt)) {
      if (story.removedAt !== undefined || !(await canReadModeratedContent(ctx, "story", story._id, ctx.person._id))) continue
      if (!isVisibleLine(story, { readerPersonId: me, isConnected, isBlockedWithAuthor: false, now: args.now })) continue
      const dto = await storyDto(ctx, story, { isOwn, seen: seenIds.has(story._id) }, { root: ctx.rootNetwork, network: ctx.network, readerPersonId: me, now: args.now })
      if (dto !== null) items.push(dto)
    }
    return items
  },
})

/** MES stories en cours dans ce réseau — sans passer par un identifiant publié. */
export const myActive = networkQuery({
  args: { now: v.number() },
  handler: async (ctx, args): Promise<StoryDto[]> => {
    const rows = await liveStoriesOf(ctx, ctx.networkId, ctx.person._id, args.now)
    const items: StoryDto[] = []
    for (const story of [...rows].sort((a, b) => a.publishedAt - b.publishedAt)) {
      if (story.removedAt !== undefined || !(await canReadModeratedContent(ctx, "story", story._id, ctx.person._id))) continue
      const dto = await storyDto(ctx, story, { isOwn: true, seen: true }, { root: ctx.rootNetwork, network: ctx.network, readerPersonId: ctx.person._id, now: args.now })
      if (dto !== null) items.push(dto)
    }
    return items
  },
})

// ═══════════════════════════════════════════════════════════════
// « Vu », « vu par », retrait
// ═══════════════════════════════════════════════════════════════

/**
 * Marquer une story comme vue — idempotente. La garde de visibilité passe EN
 * PREMIER (sinon, un oracle d'existence). `first` dit la première fois : le
 * seul cas où le décompte bouge. Regarder sa PROPRE story ne la compte pas.
 */
export const markSeen = networkMutation({
  minStatus: "en_attente",
  args: { storyId: v.id("stories") },
  returns: v.object({ seen: v.literal(true), first: v.boolean() }),
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, "story.view", ctx.person._id)
    const now = Date.now()
    const story = await requireVisibleStory(ctx, ctx.networkId, args.storyId, ctx.person._id, now, { root: ctx.rootNetwork, network: ctx.network, readerPersonId: ctx.person._id })
    if (story.authorPersonId === ctx.person._id) return { seen: true as const, first: false }
    const existing = await ctx.db
      .query("storyViews")
      .withIndex("by_story_viewer", (q) => q.eq("storyId", story._id).eq("viewerPersonId", ctx.person._id))
      .unique()
    if (existing) {
      // Rafraîchir garde la ligne dans la fenêtre du plateau et remonte le spectateur.
      await ctx.db.patch(existing._id, { seenAt: now })
      return { seen: true as const, first: false }
    }
    const viewId = await ctx.db.insert("storyViews", { networkId: ctx.networkId, storyId: story._id, viewerPersonId: ctx.person._id, seenAt: now })
    await engineCounters.insertIfDoesNotExist(ctx, { namespace: viewsOf(story._id), key: 0, id: viewId })
    return { seen: true as const, first: true }
  },
})

export type StoryViewerDto = { viewer: CounterpartLabel & { personId: Id<"persons"> }; seenAt: number }

/**
 * « Vu par » — que SEUL l'auteur lit (refus indistinct pour les autres), les
 * plus récents d'abord, à curseur NATIF : aucun ex æquo perdu à une frontière.
 */
export const viewers = networkQuery({
  args: { storyId: v.id("stories"), paginationOpts: paginationOptsValidator, now: v.optional(v.number()) },
  handler: async (ctx, args): Promise<PaginationResult<StoryViewerDto>> => {
    const story = await ctx.db.get(args.storyId)
    if (!story || story.networkId !== ctx.networkId || story.authorPersonId !== ctx.person._id) return notFound()
    if (story.media.kind === "daily_special" && (args.now === undefined || !await resolveDailySpecialSource(ctx, { root: ctx.rootNetwork, network: ctx.network, readerPersonId: ctx.person._id }, { shopId: story.media.shopId, authorPersonId: story.authorPersonId, now: args.now, reference: story.media }))) return notFound()
    const result = await ctx.db
      .query("storyViews")
      .withIndex("by_story_seenAt", (q) => q.eq("storyId", story._id))
      .order("desc")
      .paginate({ ...args.paginationOpts, numItems: Math.min(Math.max(Math.trunc(args.paginationOpts.numItems), 1), VIEWERS_PAGE_MAX) })
    const profileOf = miniProfileCache(ctx)
    const page: StoryViewerDto[] = []
    for (const row of result.page) page.push({ viewer: { ...(await counterpartOf(ctx, row.viewerPersonId, profileOf)), personId: row.viewerPersonId }, seenAt: row.seenAt })
    return { ...result, page }
  },
})

/**
 * Retirer MA story — idempotente. `removedAt` garde lisible l'INTENTION,
 * `expiresAt = maintenant` la fait entrer dans l'unique fenêtre de purge.
 */
export const remove = networkMutation({
  minStatus: "en_attente",
  args: { storyId: v.id("stories") },
  returns: v.object({ removed: v.literal(true) }),
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, "story.remove", ctx.person._id)
    const story = await ctx.db.get(args.storyId)
    // Retirer la story d'autrui et viser un identifiant inventé ne se distinguent pas.
    if (!story || story.networkId !== ctx.networkId || story.authorPersonId !== ctx.person._id) return notFound()
    if (story.removedAt === undefined) {
      const now = Date.now()
      await ctx.db.patch(story._id, { removedAt: now, expiresAt: now })
    }
    return { removed: true as const }
  },
})

// ═══════════════════════════════════════════════════════════════
// La PURGE — la seconde moitié du contrat d'éphémérité
// ═══════════════════════════════════════════════════════════════

/**
 * Efface les stories expirées : leurs vues (et leurs entrées de décompte), leur
 * blob ET sa ligne d'analyse (D10), puis leur ligne. Une story très regardée
 * attend que ses vues soient épuisées ; un blob déjà absent ne fait pas échouer
 * le lot ; la purge se replanifie tant qu'il reste du travail.
 *
 * SD-01 : une story sous signalement OUVERT n'est pas touchée — la modération
 * la relit jusqu'à sa décision (`reviewProjection`), même après ses 24 heures
 * ou son retrait par l'auteur ; les membres ne la voient plus (fenêtre vivante).
 * Le passage qui suit la décision l'efface comme les autres.
 *
 * ⚠️ La fenêtre se parcourt par CURSEUR, figée à l'instant `before` du premier
 * passage : relue depuis le début, une tête de cinquante stories retenues
 * rendrait toujours le même lot plein, replanifié sans fin, et plus rien ne
 * partirait derrière elle. Une story dont les vues restent à épuiser fait
 * reprendre un passage complet, depuis le début, en fin de parcours (`revisit`).
 */
export const purgeExpired = internalMutation({
  args: { cursor: v.optional(v.string()), before: v.optional(v.number()), revisit: v.optional(v.literal(true)) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const before = args.before ?? Date.now()
    const window = await ctx.db
      .query("stories")
      .withIndex("by_expiresAt", (q) => q.lt("expiresAt", before))
      .paginate({ cursor: args.cursor ?? null, numItems: PURGE_BATCH })
    let viewsRemaining = args.revisit === true
    for (const story of window.page) {
      // SD-01 : retenue pour la modération jusqu'à la décision ; aucune vue, aucun blob ne part avant.
      if (await hasOpenReport(ctx, "story", story._id)) continue
      const views = await ctx.db
        .query("storyViews")
        .withIndex("by_story_seenAt", (q) => q.eq("storyId", story._id))
        .take(PURGE_VIEWS_BATCH)
      for (const view of views) {
        await engineCounters.deleteIfExists(ctx, { namespace: viewsOf(story._id), key: 0, id: view._id })
        await ctx.db.delete(view._id)
      }
      if (views.length === PURGE_VIEWS_BATCH) {
        viewsRemaining = true
        continue
      }
      if (story.media.kind !== "daily_special") await purgeStoredFile(ctx, story.media.storageId)
      await ctx.db.delete(story._id)
    }
    if (!window.isDone) {
      await ctx.scheduler.runAfter(0, internal.modules.stories.stories.purgeExpired, { cursor: window.continueCursor, before, ...(viewsRemaining ? { revisit: true as const } : {}) })
    } else if (viewsRemaining) {
      await ctx.scheduler.runAfter(0, internal.modules.stories.stories.purgeExpired, {})
    }
    return null
  },
})
