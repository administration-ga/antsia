// Dupliqué de socle/convex/modules/reseauPages/pages.ts @ ad2e7fdc2 — adaptations : réécrit (owner map §6.15) — pages GÉNÉRIQUES par réseau, CRÉÉES par un membre vérifié (association, entreprise, média, communauté ; l'institution naît d'une décision tracée, `admin.ts`) au lieu d'être activées pour une organisation ; identité lue sur la page ; lues dans leur réseau, ou depuis la racine si elles y sont ; publier et retirer exigent un SIGNATAIRE VIVANT (au lieu de `communication.publish`) ; audiences `public` (communiqué) et `followers` (note aux abonnés, au lieu de la note de service `organisation`) ; visibilité par la RÈGLE de la page, pays et portée des publications locales tirés de la page (EXF-DG-23) ; abonnés prévenus par la DIFFUSION PAR LOTS, re-gardés au moment de sonner ; abonnés et publications comptés par l'agrégat (D02) ; annuaire par confiance puis récence (au lieu des plus suivies), filtré par pays, cherché sans accents, borné (`discover`) ou paginé (`paginateDiscover`) ; « mes pages suivies » paginées ; mur par fenêtres bornées et curseur composite (le patron du mur d'une personne), chaque ligne re-gardée ; débit sur chaque écriture (D14) ; refus indistinct à code. Désabonnement : coupure des directs réservés aux abonnés de la page (`live.revocation.kickUserFromPageDirects`, lot 16).
/**
 * Les PAGES d'un réseau — créer, lire, suivre, publier en leur nom, lire leur
 * mur, les découvrir.
 *
 * Trois invariants, tenus ici et pas ailleurs :
 *  · une publication de page vit dans `posts` (champ `pageId`), écrite par le
 *    point d'écriture unique `writePost` : réactions, commentaires, partages,
 *    signets et gardes du fil, une seule fois écrits ;
 *  · le droit de parler au nom d'une page est ACTUEL : signataire vivant, relu
 *    à chaque acte — publier hier ne donne rien aujourd'hui ;
 *  · la confiance (« Officiel », « Vérifié ») ne se déclare pas : une page
 *    créée ici est `community`, et seule une décision tracée la change.
 */
import { pageTrustRank, assertMemberCreatableOwnerKind, assertPageHandle, assertPageName, normalizePageDescription, normalizePageShortName, PAGE_SIGNATORIES_MAX } from "@antsia/social-domain/pages"
import { normalizePageAssociationType, normalizePageCity, normalizePageSector } from "@antsia/social-domain/pagePresentation"
import { addedMentionedIds, assertCountryCode, assertPostContent, assertPostMedia, assertPostReach, REACH_REQUIRING_COUNTRY } from "@antsia/social-domain/content"
import { cursorForFeedPost } from "@antsia/social-domain/feedScale"
import { effectiveVisibility } from "@antsia/social-domain/network"
import { PROVINCE_SLUGS } from "@antsia/social-domain/provinces"
import { extractHashtags } from "@antsia/social-domain/richText"
import { buildSearchableText, foldSearchQuery } from "@antsia/social-domain/searchText"
import { paginationOptsValidator, type PaginationResult } from "convex/server"
import { type Infer, v } from "convex/values"

import { internal } from "../../_generated/api"
import { canReadModeratedContent, moderateContentWrite } from "../moderation/policy"
import type { Doc, Id } from "../../_generated/dataModel"
import type { QueryCtx } from "../../_generated/server"
import { checked, fail, failRule, notFound } from "../../lib/errors"
import { networkMutation, networkQuery } from "../../lib/functions"
import { enforceRateLimit } from "../../lib/rateLimit"
import { contentVisibilityValidator, literals, pageOwnerKindValidator } from "../../lib/validators"
import { servableUrl } from "../files/storageGuard"
import { declaredMediaValidator, verifyDeclaredMedia } from "../media/media"
import { enqueueFanout } from "../notifications/fanout"
import { appendAudit } from "../platform/audit"
import { resolveMentionedPersonIds } from "../people/miniProfile"
import { canSeePostDoc, type ReaderContext } from "../posts/access"
import { markPostRemoved } from "../posts/contentRemoval"
import { countPageFollowers, countPagePosts, recordPageFollower, unrecordPageFollower } from "../posts/counters"
import { hasNativePostAuthor, requireNativePostAuthor } from "../posts/nativeAuthor"
import { notifyMentions, writePost } from "../posts/postWrite"
import { refreshReaderContexts } from "../posts/feedMaterialization"
import {
  clampLimit,
  cursorCreationTimeOf,
  cursorValidator,
  enrichment,
  FEED_AUTHOR_SCAN,
  type FeedItem,
  feedItemValidator,
  feedWindow,
  pageReader,
  pageViewingReason,
  toFeedItem,
  WALL_WINDOWS_MAX,
} from "../posts/posts"
import {
  assertPageHandleFree,
  isPageOnRoot,
  liveSignatoryRole,
  pageCardOf,
  pageSearchText,
  readablePageByHandle,
  readablePageOrNull,
  requireManagedPage,
  requireReadablePageByHandle,
} from "./access"
import { followedPageIds, isFollowingPage, pageFollowOf } from "./follows"
import { pagePresentationFields, pagePresentationOf } from "./presentation"
import { pageAssociationTypeValidator, pageCardValidator, pagePostAudienceValidator, pageRoleValidator, pageSectorValidator } from "./validators"

type ReadCtx = Pick<QueryCtx, "db" | "storage">

/** Annuaire sans curseur (le rail « Pages à suivre ») : ce qu'il montre sans qu'on ait rien cherché. */
const DISCOVER_LIMIT_DEFAULT = 20
const DISCOVER_LIMIT_MAX = 25
/** Une catégorie rare ne déclenche jamais le parcours complet de l'annuaire. */
const DISCOVER_CATEGORY_ROWS_MAX = 200
const DISCOVER_CATEGORY_BYTES_MAX = 1_048_576
/** En deçà, une recherche n'en est pas une : l'annuaire retombe sur son ordre (confiance, récence). */
export const DISCOVER_QUERY_MIN_LENGTH = 2
/** Pages des listes paginées, plafond dur. */
const LIST_PAGE_MAX = 50

const clampPage = (opts: { numItems: number; cursor: string | null }) => ({ ...opts, numItems: Math.min(Math.max(Math.trunc(opts.numItems), 1), LIST_PAGE_MAX) })

// ═══════════════════════════════════════════════════════════════
// DTO
// ═══════════════════════════════════════════════════════════════

/** La fiche d'une page, pour un lecteur donné. */
const pageDtoValidator = v.object({
  ...pageCardValidator.fields,
  ...pagePresentationFields,
  description: v.union(v.string(), v.null()),
  bannerUrl: v.union(v.string(), v.null()),
  /** La règle de la page : `root`, ses communiqués sont lus aussi depuis la racine. */
  visibility: contentVisibilityValidator,
  followerCount: v.number(),
  postCount: v.number(),
  createdAt: v.number(),
  viewer: v.object({
    following: v.boolean(),
    /** MON rôle VIVANT sur la page (le composeur, la gestion) — `null` : simple lecteur. */
    role: v.union(pageRoleValidator, v.null()),
  }),
})

/** Une ligne d'ANNUAIRE — la découverte, « mes pages suivies » : une seule projection. */
const pageSummaryValidator = v.object({
  ...pageCardValidator.fields,
  ...pagePresentationFields,
  description: v.union(v.string(), v.null()),
  followerCount: v.number(),
  following: v.boolean(),
})

type PageSummary = Infer<typeof pageSummaryValidator>

async function toPageSummary(ctx: ReadCtx & Pick<QueryCtx, "runQuery">, page: Doc<"pages">, following: boolean): Promise<PageSummary> {
  return { ...(await pageCardOf(ctx, page)), ...pagePresentationOf(page), description: page.description ?? null, followerCount: await countPageFollowers(ctx, page._id), following }
}

const readerOf = (ctx: { person: Doc<"persons">; network: Doc<"networks"> }): ReaderContext => ({ personId: ctx.person._id, network: ctx.network })

// ═══════════════════════════════════════════════════════════════
// Créer
// ═══════════════════════════════════════════════════════════════

/**
 * Créer une page — un membre VÉRIFIÉ du réseau, pour une association, une
 * entreprise, un média ou une communauté. Elle naît `community` (la confiance
 * se décide ailleurs, tracée), son créateur en est le premier administrateur.
 * L'adresse dérive du nom, sauf si une adresse est proposée ; prise, elle est
 * refusée (`handleUnavailable`). La règle `root` (ses communiqués lus aussi
 * depuis la racine) est un geste explicite, sans objet dans la racine.
 */
export const createPage = networkMutation({
  minStatus: "verifiee",
  args: {
    name: v.string(),
    ownerKind: pageOwnerKindValidator,
    handle: v.optional(v.string()),
    shortName: v.optional(v.string()),
    description: v.optional(v.string()),
    country: v.optional(v.string()),
    city: v.optional(v.string()),
    associationType: v.optional(pageAssociationTypeValidator),
    sector: v.optional(pageSectorValidator),
    visibility: v.optional(contentVisibilityValidator),
  },
  returns: v.object({ pageId: v.id("pages"), handle: v.string() }),
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, "page.create", ctx.person._id)
    checked(() => assertMemberCreatableOwnerKind(args.ownerKind))
    const name = checked(() => assertPageName(args.name))
    const handle = checked(() => assertPageHandle(args.handle ?? name))
    const shortName = checked(() => normalizePageShortName(args.shortName))
    const description = checked(() => normalizePageDescription(args.description))
    const country = args.country === undefined ? undefined : checked(() => assertCountryCode(args.country ?? ""))
    const city = checked(() => normalizePageCity(args.city))
    const associationType = checked(() => normalizePageAssociationType(args.ownerKind, args.associationType))
    const sector = checked(() => normalizePageSector(args.ownerKind, args.sector))
    await assertPageHandleFree(ctx, handle)
    const visibility = ctx.network.kind === "root" ? "network" : (args.visibility ?? "network")
    const now = Date.now()
    const pageId = await ctx.db.insert("pages", {
      networkId: ctx.networkId,
      handle,
      name,
      ...(shortName !== undefined ? { shortName } : {}),
      ...(description !== undefined ? { description } : {}),
      ownerKind: args.ownerKind,
      trust: "community",
      trustRank: pageTrustRank("community"),
      ...(country !== undefined ? { country } : {}),
      ...(city !== undefined ? { city } : {}),
      ...(associationType !== undefined ? { associationType } : {}),
      ...(sector !== undefined ? { sector } : {}),
      visibility,
      onRoot: isPageOnRoot(ctx.network, visibility),
      status: "active",
      createdByPersonId: ctx.person._id,
      searchText: pageSearchText({ name, ...(shortName !== undefined ? { shortName } : {}), handle }),
      createdAt: now,
      updatedAt: now,
    })
    await moderateContentWrite(ctx, { networkId: ctx.networkId, ownerPersonId: ctx.person._id, kind: "page", id: pageId, text: `${name} ${description ?? ""} ${city ?? ""} ${associationType ?? ""} ${sector ?? ""}` })
    await ctx.db.insert("pageSignatories", { networkId: ctx.networkId, pageId, personId: ctx.person._id, role: "admin", acceptedAt: now, createdAt: now, updatedAt: now })
    return { pageId, handle }
  },
})

// ═══════════════════════════════════════════════════════════════
// Lire et suivre
// ═══════════════════════════════════════════════════════════════

/** La fiche d'une page lisible d'ici ; inconnue, retirée ou d'ailleurs : le même `null`. */
export const getPage = networkQuery({
  args: { handle: v.string() },
  returns: v.union(pageDtoValidator, v.null()),
  handler: async (ctx, args) => {
    const page = await readablePageByHandle(ctx, ctx.network, args.handle, ctx.person._id)
    if (!page) return null
    const [card, bannerUrl, followerCount, postCount, following, role] = await Promise.all([
      pageCardOf(ctx, page),
      page.bannerStorageId ? servableUrl(ctx, page.bannerStorageId) : Promise.resolve(null),
      countPageFollowers(ctx, page._id),
      countPagePosts(ctx, page._id),
      isFollowingPage(ctx, page._id, ctx.person._id),
      liveSignatoryRole(ctx, page, ctx.person._id),
    ])
    return { ...card, ...pagePresentationOf(page), description: page.description ?? null, bannerUrl, visibility: page.visibility, followerCount, postCount, createdAt: page.createdAt, viewer: { following, role } }
  },
})

/**
 * Suivre une page lisible d'ici — idempotent (suivre deux fois n'empile ni ne
 * recompte). Aucune cloche : la page n'a personne à prévenir, et l'abonné n'a
 * rien demandé d'autre que ses publications.
 */
export const follow = networkMutation({
  args: { handle: v.string() },
  returns: v.object({ pageId: v.id("pages"), following: v.literal(true) }),
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, "page.follow", ctx.person._id)
    const page = await requireReadablePageByHandle(ctx, ctx.network, args.handle)
    if (!(await pageFollowOf(ctx, page._id, ctx.person._id))) {
      const now = Date.now()
      const followId = await ctx.db.insert("pageFollows", { networkId: page.networkId, pageId: page._id, personId: ctx.person._id, createdAt: now })
      await recordPageFollower(ctx, { _id: followId, pageId: page._id, createdAt: now })
      await refreshReaderContexts(ctx, page.networkId, ctx.person._id)
    }
    return { pageId: page._id, following: true as const }
  },
})

/** Ne plus suivre — idempotent ; possible même d'une page retirée depuis (son compte resterait faux sinon). */
export const unfollow = networkMutation({
  minStatus: "en_attente",
  args: { pageId: v.id("pages") },
  returns: v.object({ following: v.literal(false) }),
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, "page.follow", ctx.person._id)
    const existing = await pageFollowOf(ctx, args.pageId, ctx.person._id)
    if (existing) {
      await ctx.db.delete(existing._id)
      await unrecordPageFollower(ctx, existing)
      await refreshReaderContexts(ctx, existing.networkId, ctx.person._id)
      // Sortir du cercle d'une page coupe aussi une connexion DÉJÀ ouverte à ses directs
      // réservés aux abonnés (la lecture et les jetons neufs sont refusés tout de suite ;
      // sans cette coupure, la salle tiendrait jusqu'à l'expiration du jeton).
      await ctx.scheduler.runAfter(0, internal.modules.live.revocation.kickUserFromPageDirects, { personId: ctx.person._id, pageId: args.pageId, cursor: null })
    }
    return { following: false as const }
  },
})

/** Les pages que je suis, lisibles d'ici, les plus récemment suivies d'abord — paginées. */
export const paginateMyPageFollows = networkQuery({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args): Promise<PaginationResult<PageSummary>> => {
    const result =
      ctx.network.kind === "root"
        ? await ctx.db
            .query("pageFollows")
            .withIndex("by_person_createdAt", (q) => q.eq("personId", ctx.person._id))
            .order("desc")
            .paginate(clampPage(args.paginationOpts))
        : await ctx.db
            .query("pageFollows")
            .withIndex("by_network_person_createdAt", (q) => q.eq("networkId", ctx.networkId).eq("personId", ctx.person._id))
            .order("desc")
            .paginate(clampPage(args.paginationOpts))
    const page: PageSummary[] = []
    for (const row of result.page) {
      // Retirée ou illisible d'ici : elle sort de la liste sans que l'abonnement soit détruit.
      const target = await readablePageOrNull(ctx, ctx.network, row.pageId)
      if (target) page.push(await toPageSummary(ctx, target, true))
    }
    return { ...result, page }
  },
})

/** Les pages au nom desquelles JE parle dans ce réseau (le composeur « publier en tant que »). */
export const myPages = networkQuery({
  args: {},
  returns: v.array(v.object({ ...pageCardValidator.fields, role: pageRoleValidator })),
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("pageSignatories")
      .withIndex("by_network_person", (q) => q.eq("networkId", ctx.networkId).eq("personId", ctx.person._id))
      .take(PAGE_SIGNATORIES_MAX)
    const out: (Infer<typeof pageCardValidator> & { role: Doc<"pageSignatories">["role"] })[] = []
    for (const row of rows) {
      // Une invitation en attente ne donne aucune page au nom de laquelle parler.
      if (row.acceptedAt === undefined) continue
      const page = await ctx.db.get(row.pageId)
      if (!page || page.networkId !== ctx.networkId) continue
      const role = await liveSignatoryRole(ctx, page, ctx.person._id)
      if (role !== null) out.push({ ...(await pageCardOf(ctx, page)), role })
    }
    return out
  },
})

// ═══════════════════════════════════════════════════════════════
// Découvrir
// ═══════════════════════════════════════════════════════════════

type DiscoveryFilter = {
  term: string | null
  country: string | undefined
  ownerKind: Infer<typeof pageOwnerKindValidator> | undefined
  associationType: Infer<typeof pageAssociationTypeValidator> | undefined
  sector: Infer<typeof pageSectorValidator> | undefined
}

function discoveryFilterOf(args: {
  query?: string
  country?: string
  ownerKind?: Infer<typeof pageOwnerKindValidator>
  associationType?: Infer<typeof pageAssociationTypeValidator>
  sector?: Infer<typeof pageSectorValidator>
}): DiscoveryFilter {
  const term = (args.query ?? "").trim()
  if (args.associationType !== undefined && args.sector !== undefined) return failRule("PAGE_ASSOCIATION_TYPE_INVALID")
  const ownerKind = args.ownerKind ?? (args.associationType !== undefined ? "association" : args.sector !== undefined ? "company" : undefined)
  return {
    term: term.length >= DISCOVER_QUERY_MIN_LENGTH ? foldSearchQuery(term) : null,
    country: args.country === undefined ? undefined : checked(() => assertCountryCode(args.country ?? "")),
    ownerKind,
    associationType: checked(() => normalizePageAssociationType(ownerKind ?? "association", args.associationType)),
    sector: checked(() => normalizePageSector(ownerKind ?? "company", args.sector)),
  }
}

function categoryDiscoveryPage(opts: Infer<typeof paginationOptsValidator>) {
  const readBudget = (requested: number | undefined, maximum: number) => requested === undefined || !Number.isFinite(requested)
    ? maximum
    : Math.min(Math.max(Math.trunc(requested), 1), maximum)
  return {
    ...clampPage(opts),
    maximumRowsRead: readBudget(opts.maximumRowsRead, DISCOVER_CATEGORY_ROWS_MAX),
    maximumBytesRead: readBudget(opts.maximumBytesRead, DISCOVER_CATEGORY_BYTES_MAX),
  }
}

/**
 * La requête de l'annuaire lu d'ici : la recherche (repliée sans accents) OU
 * l'ordre de l'annuaire — confiance, puis récence —, pages actives seulement,
 * d'un pays, d'une nature et d'une catégorie si demandés. À la racine : ses pages
 * et celles qui y sont. Tous les filtres précèdent la fenêtre de lecture.
 */
function discoveryQuery(ctx: Pick<QueryCtx, "db">, network: Doc<"networks">, filter: DiscoveryFilter) {
  const { term, country, ownerKind, associationType, sector } = filter
  const isRoot = network.kind === "root"
  if (term !== null) {
    const rows = ctx.db.query("pages").withSearchIndex("search_name_v1", (q) => {
      const base = q.search("searchText", term).eq("status", "active")
      const scoped = isRoot ? base.eq("onRoot", true) : base.eq("networkId", network._id)
      return country === undefined ? scoped : scoped.eq("country", country)
    })
    return ownerKind === undefined && associationType === undefined && sector === undefined ? rows : rows.filter((q) => q.and(
      ownerKind === undefined ? true : q.eq(q.field("ownerKind"), ownerKind),
      associationType === undefined ? true : q.eq(q.field("associationType"), associationType),
      sector === undefined ? true : q.eq(q.field("sector"), sector),
    ))
  }
  if (isRoot) {
    const rows = country === undefined
      ? ctx.db
          .query("pages")
          .withIndex("by_root_status_trustRank_createdAt", (q) => q.eq("onRoot", true).eq("status", "active"))
          .order("desc")
      : ctx.db
          .query("pages")
          .withIndex("by_root_status_country_trustRank_createdAt", (q) => q.eq("onRoot", true).eq("status", "active").eq("country", country))
          .order("desc")
    return ownerKind === undefined && associationType === undefined && sector === undefined ? rows : rows.filter((q) => q.and(
      ownerKind === undefined ? true : q.eq(q.field("ownerKind"), ownerKind),
      associationType === undefined ? true : q.eq(q.field("associationType"), associationType),
      sector === undefined ? true : q.eq(q.field("sector"), sector),
    ))
  }
  const rows = country === undefined
    ? ctx.db
        .query("pages")
        .withIndex("by_network_status_trustRank_createdAt", (q) => q.eq("networkId", network._id).eq("status", "active"))
        .order("desc")
    : ctx.db
        .query("pages")
        .withIndex("by_network_status_country_trustRank_createdAt", (q) => q.eq("networkId", network._id).eq("status", "active").eq("country", country))
        .order("desc")
  return ownerKind === undefined && associationType === undefined && sector === undefined ? rows : rows.filter((q) => q.and(
    ownerKind === undefined ? true : q.eq(q.field("ownerKind"), ownerKind),
    associationType === undefined ? true : q.eq(q.field("associationType"), associationType),
    sector === undefined ? true : q.eq(q.field("sector"), sector),
  ))
}

/** Marque les pages que je suis — l'ensemble lu une fois, relu par paire s'il est tronqué. */
async function followingFlags(ctx: Pick<QueryCtx, "db">, reader: ReaderContext) {
  const followed = await followedPageIds(ctx, reader.network, reader.personId)
  return async (pageId: Id<"pages">) => followed.ids.has(pageId) || (followed.truncated && (await isFollowingPage(ctx, pageId, reader.personId)))
}

/** L'annuaire BORNÉ (le rail « Pages à suivre ») : au plus 25, sans curseur ; une catégorie peut donner un rail partiel. */
export const discover = networkQuery({
  args: { query: v.optional(v.string()), country: v.optional(v.string()), ownerKind: v.optional(pageOwnerKindValidator), associationType: v.optional(pageAssociationTypeValidator), sector: v.optional(pageSectorValidator), limit: v.optional(v.number()) },
  returns: v.array(pageSummaryValidator),
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(Math.trunc(args.limit ?? DISCOVER_LIMIT_DEFAULT), 1), DISCOVER_LIMIT_MAX)
    const filter = discoveryFilterOf(args)
    const query = discoveryQuery(ctx, ctx.network, filter)
    const rows = filter.associationType !== undefined || filter.sector !== undefined
      ? (await query.paginate(categoryDiscoveryPage({ numItems: limit, cursor: null }))).page.slice(0, limit)
      : await query.take(limit)
    const isFollowed = await followingFlags(ctx, readerOf(ctx))
    const out: PageSummary[] = []
    for (const page of rows) if (await canReadModeratedContent(ctx, "page", page._id, ctx.person._id)) out.push(await toPageSummary(ctx, page, await isFollowed(page._id)))
    return out
  },
})

/**
 * L'annuaire PAGINÉ — une page hors du rail se retrouve (R-07 du socle). UNE
 * seule branche par appel (recherche OU index), donc une seule pagination
 * native ; `isDone` dit la fin, pas une page vide.
 */
export const paginateDiscover = networkQuery({
  args: { query: v.optional(v.string()), country: v.optional(v.string()), ownerKind: v.optional(pageOwnerKindValidator), associationType: v.optional(pageAssociationTypeValidator), sector: v.optional(pageSectorValidator), paginationOpts: paginationOptsValidator },
  handler: async (ctx, args): Promise<PaginationResult<PageSummary>> => {
    const filter = discoveryFilterOf(args)
    const options = filter.associationType !== undefined || filter.sector !== undefined
      ? categoryDiscoveryPage(args.paginationOpts)
      : clampPage(args.paginationOpts)
    const result = await discoveryQuery(ctx, ctx.network, filter).paginate(options)
    const isFollowed = await followingFlags(ctx, readerOf(ctx))
    const page: PageSummary[] = []
    for (const row of result.page) if (await canReadModeratedContent(ctx, "page", row._id, ctx.person._id)) page.push(await toPageSummary(ctx, row, await isFollowed(row._id)))
    return { ...result, page }
  },
})

// ═══════════════════════════════════════════════════════════════
// Publier au nom d'une page
// ═══════════════════════════════════════════════════════════════

/**
 * La portée et le pays d'une publication de page (EXF-DG-23) : le pays est
 * celui de la PAGE, jamais saisi — une publication locale exige que la page en
 * déclare un ; une autre portée (`diaspora`) n'en porte pas.
 */
function placePagePost(page: Doc<"pages">, reach: string | undefined, reachValues: readonly string[]): { reach?: string; country?: string } {
  if (reach === REACH_REQUIRING_COUNTRY && page.country === undefined) return failRule("PAGE_COUNTRY_REQUIRED")
  const country = reach === undefined || reach === REACH_REQUIRING_COUNTRY ? page.country : undefined
  return checked(() => assertPostReach({ ...(reach !== undefined ? { reach } : {}), ...(country !== undefined ? { country } : {}), reachValues }))
}

/**
 * Publier au nom d'une page — un SIGNATAIRE VIVANT, depuis le réseau de la page.
 * Gardes, dans cet ordre : débit ; rejeu (la clé rend la publication EXISTANTE,
 * de cette page seulement) ; autorité actuelle ; vérité du stockage pour les
 * médias ; le domaine juge le contenu et la forme (`public` ou `followers`,
 * jamais de groupe ni de partage). La visibilité suit la RÈGLE de la page ; les
 * abonnés sont prévenus par la diffusion par lots, chacun re-gardé.
 */
export const publishAsPage = networkMutation({
  minStatus: "declaree",
  args: {
    pageId: v.id("pages"),
    body: v.string(),
    media: v.optional(v.array(declaredMediaValidator)),
    audience: v.optional(pagePostAudienceValidator),
    reach: v.optional(v.string()),
    province: v.optional(literals(PROVINCE_SLUGS)),
    alsoOnRoot: v.optional(v.boolean()),
    idempotencyKey: v.optional(v.string()),
  },
  returns: v.object({ postId: v.id("posts"), created: v.boolean() }),
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, "page.publish", ctx.person._id)
    if (args.idempotencyKey !== undefined) {
      const replay = await ctx.db
        .query("posts")
        .withIndex("by_author_and_idempotencyKey", (q) => q.eq("authorPersonId", ctx.person._id).eq("idempotencyKey", args.idempotencyKey))
        .unique()
      // Une clé rejouée pour une AUTRE page (ou ailleurs) ne publie pas ici : la clé appartient à son composeur.
      if (replay) return replay.pageId === args.pageId && replay.networkId === ctx.networkId ? { postId: replay._id, created: false } : fail("conflict")
    }
    const { page } = await requireManagedPage(ctx, { networkId: ctx.networkId, personId: ctx.person._id }, args.pageId, "signatory")
    const audience = args.audience ?? "public"
    // L'acteur est le SIGNATAIRE qui dépose : c'est lui qui a déposé les fichiers.
    const media = await verifyDeclaredMedia(ctx, { actorPersonId: ctx.person._id, networkId: ctx.networkId, usage: "media_social", source: "post_media", declared: args.media ?? [] })
    checked(() =>
      assertPostMedia(media.map((item) => ({ kind: item.kind, mimeType: item.mimeType, sizeBytes: item.sizeBytes, ...(item.altText ? { altText: item.altText } : {}) }))),
    )
    const body = checked(() => assertPostContent({ body: args.body, mediaCount: media.length, isShare: false }))
    const placed = placePagePost(page, args.reach, ctx.network.reachValues)
    // Le nouveau choix sans compte porte les NATIVES ; les pages enfants gardent leur règle collective.
    const visibility = effectiveVisibility({ networkKind: ctx.network.kind, audienceIsPublic: audience === "public", authorRequestedRoot: ctx.network.kind === "root" && (args.alsoOnRoot ?? false), ruleVisibility: page.visibility })
    const { postId } = await writePost(ctx, {
      network: ctx.network,
      authorPersonId: ctx.person._id,
      body,
      audience,
      visibility,
      ...(media.length > 0 ? { media } : {}),
      ...placed,
      ...(args.province !== undefined ? { province: args.province } : {}),
      ...(args.idempotencyKey !== undefined ? { idempotencyKey: args.idempotencyKey } : {}),
      pageId: page._id,
    })
    // Sans acteur : c'est la page qui parle (la cloche dit « nouvelle publication de… », relue à l'ouverture).
    await enqueueFanout(ctx, { networkId: page.networkId, kind: "page_post", subject: { post: postId }, source: { kind: "pageFollowers", postId } })
    return { postId, created: true }
  },
})

/**
 * Modifier le texte d'une publication NATIVE de la page — tout signataire
 * vivant peut agir, indépendamment du déposant historique. La révision lue
 * par le composeur est exigée avant toute écriture ; rejouer le corps déjà
 * enregistré ne réécrit rien et ne sonne personne une seconde fois.
 * Audience, médias, portée et identité de la page restent ceux de l'origine.
 */
export const editPagePost = networkMutation({
  minStatus: "declaree",
  args: {
    pageId: v.id("pages"),
    postId: v.id("posts"),
    body: v.string(),
    expectedBody: v.string(),
    expectedEditedAt: v.union(v.number(), v.null()),
  },
  returns: v.object({ changed: v.boolean(), editedAt: v.union(v.number(), v.null()) }),
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, "post.edit", ctx.person._id)
    const { page, role } = await requireManagedPage(ctx, { networkId: ctx.networkId, personId: ctx.person._id }, args.pageId, "signatory")
    const stored = await ctx.db.get(args.postId)
    if (!stored || stored.networkId !== ctx.networkId || stored.pageId !== page._id || stored.federationSource !== undefined) return notFound()
    if (stored.editorialArticleId !== undefined) return notFound()
    const post = requireNativePostAuthor(stored)
    if (post.status !== "published" || !(await canSeePostDoc(ctx, readerOf(ctx), post))) return notFound()
    const body = checked(() => assertPostContent({ body: args.body, mediaCount: post.media?.length ?? 0, isShare: post.sharedPostId !== undefined }))
    if (body === post.body) return { changed: false, editedAt: post.editedAt ?? null }
    if (post.body !== args.expectedBody || (post.editedAt ?? null) !== args.expectedEditedAt) return fail("conflict")

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
    await appendAudit(ctx, {
      action: "page.post_edit",
      capacity: role === "admin" ? "page_admin" : "member",
      actorPersonId: ctx.person._id,
      networkId: page.networkId,
      subject: { table: "posts", id: post._id },
      details: { pageId: page._id, role, editedAt: now },
      at: now,
    })
    return { changed: true, editedAt: now }
  },
})

/**
 * Retirer une publication de page — TOUT signataire vivant (pas seulement celui
 * qui l'a signée : le propos est celui de la page). Idempotent, mais pour une
 * autorité encore légitime seulement : le rejeu n'est pas un droit acquis.
 */
export const removePagePost = networkMutation({
  minStatus: "en_attente",
  args: { postId: v.id("posts") },
  returns: v.object({ removed: v.literal(true) }),
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, "post.remove", ctx.person._id)
    const post = await ctx.db.get(args.postId)
    // Une galerie collective se retire par sa porte événementielle, avec les droits du parent.
    if (!post || post.pageId === undefined || post.pageEventGalleryId !== undefined) return notFound()
    await requireManagedPage(ctx, { networkId: ctx.networkId, personId: ctx.person._id }, post.pageId, "signatory")
    await markPostRemoved(ctx, post, Date.now())
    return { removed: true as const }
  },
})

// ═══════════════════════════════════════════════════════════════
// Le mur d'une page
// ═══════════════════════════════════════════════════════════════

/** Une cible d'annonce native et lisible, résolue par identifiant sans parcourir le mur. */
async function readablePagePin(ctx: Pick<QueryCtx, "db">, reader: ReaderContext, page: Doc<"pages">, postId: Id<"posts">): Promise<Doc<"posts"> | null> {
  const post = await ctx.db.get(postId)
  if (!post || post.pageId !== page._id || post.networkId !== page.networkId || post.status !== "published" || !hasNativePostAuthor(post)) return null
  if (!(await canReadModeratedContent(ctx, "post", post._id))) return null
  return (await canSeePostDoc(ctx, reader, post)) ? post : null
}

/** L'annonce épinglée, soumise aux mêmes gardes et à la même projection que le mur. */
export const pagePinnedPost = networkQuery({
  args: { handle: v.string(), expectedPersonId: v.id("persons") },
  returns: v.union(feedItemValidator, v.null()),
  handler: async (ctx, args) => {
    if (args.expectedPersonId !== ctx.person._id) return notFound()
    const page = await readablePageByHandle(ctx, ctx.network, args.handle, ctx.person._id)
    if (!page || page.pinnedPostId === undefined) return null
    const reader = readerOf(ctx)
    const post = await readablePagePin(ctx, reader, page, page.pinnedPostId)
    if (!post) return null
    const reason = await pageViewingReason(ctx, reader, page._id)
    return await toFeedItem(ctx, post, reader, reason, enrichment(ctx))
  },
})

/**
 * Choisir ou retirer l'annonce de la page, sans modifier la publication.
 * Une référence devenue illisible vaut une absence, pour le lecteur comme
 * pour la comparaison ; le mandat et la cible sont relus même au rejeu.
 */
export const setPagePinnedPost = networkMutation({
  minStatus: "declaree",
  args: {
    pageId: v.id("pages"),
    postId: v.union(v.id("posts"), v.null()),
    expectedPinnedPostId: v.union(v.id("posts"), v.null()),
  },
  returns: v.object({ changed: v.boolean() }),
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, "page.publish", ctx.person._id)
    const { page, role } = await requireManagedPage(ctx, { networkId: ctx.networkId, personId: ctx.person._id }, args.pageId, "signatory")
    const reader = readerOf(ctx)
    if (args.postId !== null && !(await readablePagePin(ctx, reader, page, args.postId))) return notFound()
    const previousPost = page.pinnedPostId === undefined ? null : await readablePagePin(ctx, reader, page, page.pinnedPostId)
    const previousPostId = previousPost?._id ?? null
    if (previousPostId === args.postId) return { changed: false }
    if (previousPostId !== args.expectedPinnedPostId) return fail("conflict")

    const now = Date.now()
    await ctx.db.patch(page._id, { pinnedPostId: args.postId ?? undefined, updatedAt: now })
    await appendAudit(ctx, {
      action: "page.post_pin",
      capacity: role === "admin" ? "page_admin" : "member",
      actorPersonId: ctx.person._id,
      networkId: page.networkId,
      subject: { table: "pages", id: page._id },
      details: { role, postId: args.postId, previousPostId },
      at: now,
    })
    return { changed: true }
  },
})

const pageMediaKindValidator = v.union(v.literal("all"), v.literal("image"), v.literal("video"))
type PageMediaKind = Infer<typeof pageMediaKindValidator>

/**
 * Le mur et les médias utilisent la même découpe bornée. Le filtre média est
 * appliqué AVANT de remplir la fenêtre visible ; il ne change jamais le mur
 * historique lorsqu'il est absent. Une fenêtre vide peut avoir une suite.
 */
async function readPagePosts(
  ctx: QueryCtx,
  reader: ReaderContext,
  page: Doc<"pages">,
  args: { cursor?: Infer<typeof cursorValidator>; limit?: number; mediaKind?: PageMediaKind },
): Promise<{ items: FeedItem[]; nextCursor: Infer<typeof cursorValidator> | null }> {
  const limit = clampLimit(args.limit)
  const [reason, cursorCreationTime] = await Promise.all([pageViewingReason(ctx, reader, page._id), cursorCreationTimeOf(ctx, args.cursor)])

  const visible: Doc<"posts">[] = []
  let lastExamined: Doc<"posts"> | null = null
  let exhausted = false
  let windowCursor = args.cursor
  let windowCursorCreationTime = cursorCreationTime
  for (let pass = 0; pass < WALL_WINDOWS_MAX; pass += 1) {
    const window = await feedWindow(pageReader(ctx, reader.network, page._id), FEED_AUTHOR_SCAN, windowCursor, windowCursorCreationTime)
    for (const post of window.rows) {
      lastExamined = post
      if (args.mediaKind !== undefined) {
        if (post.pageId !== page._id || post.networkId !== page.networkId || post.status !== "published" || post.sharedPostId !== undefined) continue
        // Même priorité que la projection média : un reflet en attente garde
        // sa place, sans jamais dévoiler une URL retenue par la délivrance.
        const media = post.federationMedia?.items ?? post.media ?? []
        if (!media.some((item) => args.mediaKind === "all" || item.kind === args.mediaKind)) continue
        // La galerie ne montre aucun contenu en attente, même à son auteur.
        if (!(await canReadModeratedContent(ctx, "post", post._id))) continue
      }
      if (!(await canSeePostDoc(ctx, reader, post))) continue
      visible.push(post)
      if (visible.length >= limit) break
    }
    if (visible.length >= limit) break
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

  const enrich = enrichment(ctx)
  const items: FeedItem[] = []
  for (const post of visible) items.push(await toFeedItem(ctx, post, reader, reason, enrich))
  return { items, nextCursor: exhausted || lastExamined === null ? null : cursorForFeedPost(lastExamined) }
}

/**
 * Le MUR d'une page — ses publications lisibles d'ici, telles que JE peux les
 * voir (la note aux abonnés comme le reste : chaque ligne repasse LA garde).
 * Même découpe que le mur d'une personne : fenêtres bornées, au plus
 * `WALL_WINDOWS_MAX` par appel, curseur sur la dernière ligne EXAMINÉE. Page
 * inconnue, retirée ou d'ailleurs : le même mur vide, sans curseur.
 */
export const pagePosts = networkQuery({
  args: { handle: v.string(), cursor: v.optional(cursorValidator), limit: v.optional(v.number()) },
  returns: v.object({ items: v.array(feedItemValidator), nextCursor: v.union(cursorValidator, v.null()) }),
  handler: async (ctx, args) => {
    const reader = readerOf(ctx)
    const page = await readablePageByHandle(ctx, ctx.network, args.handle, ctx.person._id)
    if (!page) return { items: [], nextCursor: null }
    return await readPagePosts(ctx, reader, page, args)
  },
})

/** Les photos et vidéos propres à une page, filtrées avant pagination et re-gardées à chaque lecture. */
export const pageMediaPosts = networkQuery({
  args: {
    handle: v.string(),
    expectedPersonId: v.id("persons"),
    kind: pageMediaKindValidator,
    cursor: v.optional(cursorValidator),
    limit: v.optional(v.number()),
  },
  returns: v.object({ items: v.array(feedItemValidator), nextCursor: v.union(cursorValidator, v.null()) }),
  handler: async (ctx, args) => {
    if (args.expectedPersonId !== ctx.person._id) return notFound()
    const page = await readablePageByHandle(ctx, ctx.network, args.handle, ctx.person._id)
    if (!page) return { items: [], nextCursor: null }
    return await readPagePosts(ctx, readerOf(ctx), page, { ...args, mediaKind: args.kind })
  },
})
