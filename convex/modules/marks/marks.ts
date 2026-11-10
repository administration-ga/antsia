// Dupliqué de socle/convex/modules/reseauPersonnel/marks.ts @ ad2e7fdc2 — adaptations : marques et sourdines PAR RÉSEAU (celui de la fonction appelée), garde d'adhésion par le constructeur ; `myBookmarks`/`myHiddenPosts` (qui levaient au-delà de 50, D18) non recopiées au profit des versions paginées ; `myMutes` paginée (`paginateMyMutes`, D19) ; ensembles du fil (`hiddenPostIds`, `mutedPersonIds`) bornés AVEC leur lacune ; marques du lecteur (`readerMarks`, en tête de `posts.ts` au socle) rangées ici ; débit sur les gestes ; garde de visibilité du moteur (contexte de lecture, blocage) ; une publication de PAGE marquée porte la carte de sa page (son signataire n'en est pas l'auteur affiché) ; lecture `isAuthorMuted` de MA sourdine, pour le geste de la fiche (PF-01).
/**
 * Marques personnelles et mise en sourdine — le menu « … » d'une publication.
 *
 * Tout ce que ce module écrit est INVISIBLE de l'auteur du contenu : masquer,
 * enregistrer, suivre, mettre en sourdine sont des gestes de LECTEUR. Le
 * corollaire est une obligation : tout geste silencieux est réversible ET
 * listable (`paginateHiddenPosts`, `paginateMyMutes`).
 *
 * ⚠️ La sourdine et le masquage ne valent QUE pour le fil — pas la recherche,
 * pas le mur, pas une publication ouverte par son lien. C'est ce qui les
 * distingue du blocage, qui ferme la relation dans les deux sens.
 */
import { paginationOptsValidator, type PaginationResult } from "convex/server"
import { v } from "convex/values"

import type { Id } from "../../_generated/dataModel"
import type { QueryCtx } from "../../_generated/server"
import { networkMutation, networkQuery } from "../../lib/functions"
import { enforceRateLimit } from "../../lib/rateLimit"
import type { BoundedIds } from "../graph/graph"
import { pageCardCache } from "../pages/access"
import type { PageCard } from "../pages/validators"
import { miniProfileCache, type PersonMiniProfile } from "../people/miniProfile"
import { assertVisiblePost, canSeePostDoc, type ReaderContext } from "../posts/access"
import { hasNativePostAuthor } from "../posts/nativeAuthor"
import { type PostMarkKind, postMarkKindValidator } from "./tables"

type ReadCtx = Pick<QueryCtx, "db">

/** Bornes de lecture : aucune source n'est balayée sans limite, et la lacune se dit. */
export const HIDDEN_SCAN = 500
export const MUTES_SCAN = 200
/** Marques du lecteur lues une fois par page de fil. */
export const FEED_MARKS_SCAN = 300

/** Les publications que j'ai MASQUÉES dans ce réseau — lues une fois par page de fil. */
export async function hiddenPostIds(ctx: ReadCtx, networkId: Id<"networks">, personId: Id<"persons">): Promise<BoundedIds> {
  const rows = await ctx.db
    .query("postMarks")
    .withIndex("by_network_person_kind_createdAt", (q) => q.eq("networkId", networkId).eq("personId", personId).eq("kind", "hidden"))
    .order("desc")
    .take(HIDDEN_SCAN + 1)
  return { ids: new Set(rows.slice(0, HIDDEN_SCAN).map((row) => row.postId)), truncated: rows.length > HIDDEN_SCAN }
}

/** Les personnes que j'ai mises en SOURDINE dans ce réseau — lues une fois par page de fil. */
export async function mutedPersonIds(ctx: ReadCtx, networkId: Id<"networks">, personId: Id<"persons">): Promise<BoundedIds> {
  const rows = await ctx.db
    .query("mutes")
    .withIndex("by_network_person_createdAt", (q) => q.eq("networkId", networkId).eq("personId", personId))
    .order("desc")
    .take(MUTES_SCAN + 1)
  return { ids: new Set(rows.slice(0, MUTES_SCAN).map((row) => row.mutedPersonId)), truncated: rows.length > MUTES_SCAN }
}

/**
 * Les marques du lecteur, lues UNE fois par page : le DTO du fil dit au menu
 * « … » ce qui est déjà actif sans une requête par carte.
 */
export async function readerMarks(ctx: ReadCtx, networkId: Id<"networks">, personId: Id<"persons">): Promise<{ bookmarked: Set<string>; notifying: Set<string> }> {
  const read = (kind: PostMarkKind) =>
    ctx.db
      .query("postMarks")
      .withIndex("by_network_person_kind_createdAt", (q) => q.eq("networkId", networkId).eq("personId", personId).eq("kind", kind))
      .order("desc")
      .take(FEED_MARKS_SCAN)
  const [bookmarks, notifies] = await Promise.all([read("bookmark"), read("notify")])
  return { bookmarked: new Set(bookmarks.map((row) => row.postId)), notifying: new Set(notifies.map((row) => row.postId)) }
}

async function findMark(ctx: ReadCtx, networkId: Id<"networks">, personId: Id<"persons">, kind: PostMarkKind, postId: Id<"posts">) {
  return await ctx.db
    .query("postMarks")
    .withIndex("by_network_person_kind_post", (q) => q.eq("networkId", networkId).eq("personId", personId).eq("kind", kind).eq("postId", postId))
    .unique()
}

/**
 * Poser ou retirer une marque — reposer la même la RETIRE (menu à bascule).
 * ⚠️ La garde de visibilité EN PREMIER : sans elle, marquer deviendrait un
 * oracle d'existence.
 */
export const toggleMark = networkMutation({
  minStatus: "en_attente",
  args: { postId: v.id("posts"), kind: postMarkKindValidator },
  returns: v.object({ marked: v.boolean() }),
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, "mark.toggle", ctx.person._id)
    await assertVisiblePost(ctx, { personId: ctx.person._id, network: ctx.network }, args.postId)
    const existing = await findMark(ctx, ctx.networkId, ctx.person._id, args.kind, args.postId)
    if (existing) {
      await ctx.db.delete(existing._id)
      return { marked: false }
    }
    await ctx.db.insert("postMarks", { networkId: ctx.networkId, personId: ctx.person._id, postId: args.postId, kind: args.kind, createdAt: Date.now() })
    return { marked: true }
  },
})

/**
 * Masquer une publication — IDEMPOTENTE au sens strict (à la différence de la
 * bascule) : le geste vient d'un menu et d'un toast « Annuler » qu'on peut
 * cliquer deux fois.
 */
export const hidePost = networkMutation({
  minStatus: "en_attente",
  args: { postId: v.id("posts") },
  returns: v.object({ hidden: v.literal(true) }),
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, "mark.toggle", ctx.person._id)
    await assertVisiblePost(ctx, { personId: ctx.person._id, network: ctx.network }, args.postId)
    const existing = await findMark(ctx, ctx.networkId, ctx.person._id, "hidden", args.postId)
    if (!existing) await ctx.db.insert("postMarks", { networkId: ctx.networkId, personId: ctx.person._id, postId: args.postId, kind: "hidden", createdAt: Date.now() })
    return { hidden: true as const }
  },
})

/** Rendre au fil une publication masquée — ce que fait « Annuler ». */
export const unhidePost = networkMutation({
  minStatus: "en_attente",
  args: { postId: v.id("posts") },
  returns: v.object({ hidden: v.literal(false) }),
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, "mark.toggle", ctx.person._id)
    const existing = await findMark(ctx, ctx.networkId, ctx.person._id, "hidden", args.postId)
    if (existing) await ctx.db.delete(existing._id)
    return { hidden: false as const }
  },
})

export type MarkedPostDto = {
  postId: Id<"posts">
  body: string
  publishedAt: number
  markedAt: number
  /** Le SIGNATAIRE quand la publication est celle d'une page — l'en-tête est alors `page`. */
  author: Omit<Pick<PersonMiniProfile, "personId" | "displayName" | "handle" | "avatarUrl">, "personId"> & { personId: Id<"persons"> | null }
  page: PageCard | null
}

/**
 * Mes marques d'un genre, paginées et RE-GARDÉES à chaque page : une marque
 * n'est jamais un droit acquis (rupture, blocage, départ d'un groupe la
 * referment). La ligne invisible avance dans le curseur sans fuite.
 */
async function paginateMarked(
  ctx: QueryCtx,
  reader: ReaderContext,
  kind: PostMarkKind,
  paginationOpts: { numItems: number; cursor: string | null },
): Promise<PaginationResult<MarkedPostDto>> {
  const result = await ctx.db
    .query("postMarks")
    .withIndex("by_network_person_kind_createdAt", (q) => q.eq("networkId", reader.network._id).eq("personId", reader.personId).eq("kind", kind))
    .order("desc")
    .paginate(paginationOpts)
  const profileOf = miniProfileCache(ctx)
  const pageOf = pageCardCache(ctx)
  const page: MarkedPostDto[] = []
  for (const mark of result.page) {
    const post = await ctx.db.get(mark.postId)
    if (!post || !(await canSeePostDoc(ctx, reader, post))) continue
    const card = post.pageId === undefined ? null : await pageOf(post.pageId)
    if (post.pageId !== undefined && card === null) continue
    const author = hasNativePostAuthor(post) ? await profileOf(post.authorPersonId) : null
    page.push({
      postId: post._id,
      body: post.body,
      publishedAt: post.publishedAt,
      markedAt: mark.createdAt,
      author: { personId: author?.personId ?? null, displayName: author?.displayName ?? null, handle: author?.handle ?? null, avatarUrl: author?.avatarUrl ?? null },
      page: card,
    })
  }
  return { ...result, page }
}

/** Mes publications enregistrées, les plus récentes d'abord. */
export const paginateBookmarks = networkQuery({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args): Promise<PaginationResult<MarkedPostDto>> =>
    await paginateMarked(ctx, { personId: ctx.person._id, network: ctx.network }, "bookmark", args.paginationOpts),
})

/** Les publications que j'ai masquées, avec le geste inverse disponible. */
export const paginateHiddenPosts = networkQuery({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args): Promise<PaginationResult<MarkedPostDto>> =>
    await paginateMarked(ctx, { personId: ctx.person._id, network: ctx.network }, "hidden", args.paginationOpts),
})

/**
 * Ce que le menu « … » montre comme DÉJÀ actif, pour UNE publication (vue
 * focalisée) ; le fil, lui, le porte dans son DTO.
 */
export const markStateFor = networkQuery({
  args: { postId: v.id("posts") },
  returns: v.object({ bookmarked: v.boolean(), hidden: v.boolean(), notifying: v.boolean() }),
  handler: async (ctx, args) => {
    const [bookmark, hidden, notify] = await Promise.all([
      findMark(ctx, ctx.networkId, ctx.person._id, "bookmark", args.postId),
      findMark(ctx, ctx.networkId, ctx.person._id, "hidden", args.postId),
      findMark(ctx, ctx.networkId, ctx.person._id, "notify", args.postId),
    ])
    return { bookmarked: bookmark !== null, hidden: hidden !== null, notifying: notify !== null }
  },
})

// ═══════════════════════════════════════════════════════════════
// Mise en sourdine
// ═══════════════════════════════════════════════════════════════

/** Ne plus voir les publications de cette personne DANS MON FIL (ce réseau). Idempotent. */
export const muteAuthor = networkMutation({
  minStatus: "en_attente",
  args: { targetPersonId: v.id("persons") },
  returns: v.object({ muted: v.literal(true) }),
  handler: async (ctx, args) => {
    // Se taire soi-même viderait son propre fil sans qu'aucun écran ne dise pourquoi.
    if (args.targetPersonId === ctx.person._id) return { muted: true as const }
    await enforceRateLimit(ctx, "mute.toggle", ctx.person._id)
    const existing = await ctx.db
      .query("mutes")
      .withIndex("by_network_person_muted", (q) => q.eq("networkId", ctx.networkId).eq("personId", ctx.person._id).eq("mutedPersonId", args.targetPersonId))
      .unique()
    if (!existing) await ctx.db.insert("mutes", { networkId: ctx.networkId, personId: ctx.person._id, mutedPersonId: args.targetPersonId, createdAt: Date.now() })
    return { muted: true as const }
  },
})

export const unmuteAuthor = networkMutation({
  minStatus: "en_attente",
  args: { targetPersonId: v.id("persons") },
  returns: v.object({ muted: v.literal(false) }),
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, "mute.toggle", ctx.person._id)
    const existing = await ctx.db
      .query("mutes")
      .withIndex("by_network_person_muted", (q) => q.eq("networkId", ctx.networkId).eq("personId", ctx.person._id).eq("mutedPersonId", args.targetPersonId))
      .unique()
    if (existing) await ctx.db.delete(existing._id)
    return { muted: false as const }
  },
})

/**
 * Ai-je mis cette personne en sourdine dans ce réseau ? — le strict nécessaire au
 * geste « Mettre en sourdine / Réactiver » de sa fiche (PF-01). Une lecture de MA
 * marque seulement : elle ne dit rien de la personne visée.
 */
export const isAuthorMuted = networkQuery({
  minStatus: "en_attente",
  args: { targetPersonId: v.id("persons") },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("mutes")
      .withIndex("by_network_person_muted", (q) => q.eq("networkId", ctx.networkId).eq("personId", ctx.person._id).eq("mutedPersonId", args.targetPersonId))
      .unique()
    return existing !== null
  },
})

/**
 * Les personnes que j'ai mises en sourdine dans ce réseau — OBLIGATOIRE : un
 * geste silencieux qu'on ne peut pas relire est un piège. Paginée (D19).
 */
export const paginateMyMutes = networkQuery({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (
    ctx,
    args,
  ): Promise<PaginationResult<{ personId: Id<"persons">; mutedAt: number; person: Pick<PersonMiniProfile, "displayName" | "handle" | "avatarUrl"> }>> => {
    const result = await ctx.db
      .query("mutes")
      .withIndex("by_network_person_createdAt", (q) => q.eq("networkId", ctx.networkId).eq("personId", ctx.person._id))
      .order("desc")
      .paginate(args.paginationOpts)
    const profileOf = miniProfileCache(ctx)
    const page = []
    for (const row of result.page) {
      const person = await profileOf(row.mutedPersonId)
      page.push({ personId: row.mutedPersonId, mutedAt: row.createdAt, person: { displayName: person.displayName, handle: person.handle, avatarUrl: person.avatarUrl } })
    }
    return { ...result, page }
  },
})
