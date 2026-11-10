/** PA8 : portes anonymes nominatives, projections allowlistées et pagination brute. */
import type { PublicNetworkSnapshot, PublicPagination, PublicPost, PublicTransparency, PublicTransparencyDeadlines } from "@antsia/social-contracts/publicNetwork"
import { legalDeadlineDisclosure, TRANSPARENCY_MIN_CASES } from "@antsia/social-domain/moderationPolicy"
import { PROVINCE_SLUGS } from "@antsia/social-domain/provinces"
import { paginationOptsValidator } from "convex/server"
import { v } from "convex/values"

import { query } from "../../_generated/server"
import { literals } from "../../lib/validators"
import { originDto, publicContext, publicPageByHandle, publicPageDto, publicPostDto, publicPostEligible, publicProfileByHandle } from "./access"
import { publicPageValidator, publicPostPageValidator, publicPostValidator, publicProfileValidator, publicSnapshotValidator, publicTransparencyDeadlinesValidator, publicTransparencyValidator } from "./validators"

const PUBLIC_PAGE_MAX = 20
const DAY_MS = 86_400_000
const RECENT_PERIODS = 12
const listOptions = (opts: { numItems: number; cursor: string | null }) => ({ ...opts, numItems: Math.max(1, Math.min(PUBLIC_PAGE_MAX, Math.trunc(opts.numItems))), maximumRowsRead: PUBLIC_PAGE_MAX, maximumBytesRead: 1_048_576 })

/** @publicProjection Mesures matérialisées datées et réseaux vitrine allowlistés, aucun membre ni métrique opérateur. */
export const snapshot = query({
  args: { networkId: v.id("networks") }, returns: publicSnapshotValidator,
  handler: async (ctx, args): Promise<PublicNetworkSnapshot> => {
    const { root } = await publicContext(ctx, args.networkId)
    const networks = [originDto(root)]
    for (const slug of ["diasporale", "administration"] as const) {
      const network = await ctx.db.query("networks").withIndex("by_slug", (q) => q.eq("slug", slug)).unique()
      if (network?.status === "active" && network.kind === "closed" && network.parentId === root._id) networks.push(originDto(network))
    }
    const row = await ctx.db.query("publicSnapshots").withIndex("by_network", (q) => q.eq("networkId", root._id)).unique()
    return row ? { generatedAt: row.generatedAt, periodStart: row.periodStart, periodEnd: row.periodEnd, publishedPosts: row.publishedPosts, officialPages: row.officialPages, networks, trends: row.trends, bounded: row.bounded }
      : { generatedAt: null, periodStart: null, periodEnd: null, publishedPosts: null, officialPages: null, networks, trends: [], bounded: true }
  },
})

/** @publicProjection Publication choisie root publique, origine/modération/auteur/médias relus, refus indistinct. */
export const getPost = query({
  args: { networkId: v.id("networks"), postId: v.string() }, returns: v.union(publicPostValidator, v.null()),
  handler: async (ctx, args) => {
    const context = await publicContext(ctx, args.networkId)
    const id = ctx.db.normalizeId("posts", args.postId)
    const post = id ? await ctx.db.get(id) : null
    return post && await publicPostEligible(ctx, context, post) ? await publicPostDto(ctx, context, post) : null
  },
})

/** @publicProjection Profil public réduit non privé et admissible à la racine, sans identité civile ni contact. */
export const getProfile = query({
  args: { networkId: v.id("networks"), handle: v.string() }, returns: v.union(publicProfileValidator, v.null()),
  handler: async (ctx, args) => publicProfileByHandle(ctx, await publicContext(ctx, args.networkId), args.handle),
})

/** @publicProjection Métadonnées des seules pages Officiel actives dans le contexte racine, jamais leur signataire. */
export const getOfficialPage = query({
  args: { networkId: v.id("networks"), handle: v.string() }, returns: v.union(publicPageValidator, v.null()),
  handler: async (ctx, args) => {
    const context = await publicContext(ctx, args.networkId)
    const page = await publicPageByHandle(ctx, context, args.handle)
    return page ? await publicPageDto(ctx, context, page) : null
  },
})

/** @publicProjection Liste root publique bornée à vingt candidats, curseur brut conservé même après filtrage vide. */
export const listRootPosts = query({
  args: { networkId: v.id("networks"), paginationOpts: paginationOptsValidator, province: v.optional(literals(PROVINCE_SLUGS)), tag: v.optional(v.string()) },
  returns: publicPostPageValidator,
  handler: async (ctx, args): Promise<PublicPagination<PublicPost>> => {
    const context = await publicContext(ctx, args.networkId)
    const opts = listOptions(args.paginationOpts)
    const result = args.province === undefined
      ? await ctx.db.query("posts").withIndex("by_root_status_publishedAt", (q) => q.eq("onRoot", true).eq("status", "published")).order("desc").paginate(opts)
      : await ctx.db.query("posts").withIndex("by_root_province_status_publishedAt", (q) => q.eq("onRoot", true).eq("province", args.province).eq("status", "published")).order("desc").paginate(opts)
    const tag = args.tag?.trim().toLowerCase()
    const page: PublicPost[] = []
    for (const post of result.page) {
      if (tag && !(post.tags ?? []).includes(tag)) continue
      if (await publicPostEligible(ctx, context, post)) page.push(await publicPostDto(ctx, context, post))
    }
    return { page, isDone: result.isDone, continueCursor: result.continueCursor }
  },
})

/** @publicProjection Publications root publiques d'une page Officiel relue, aucune note aux abonnés ni page retirée. */
export const pagePosts = query({
  args: { networkId: v.id("networks"), handle: v.string(), paginationOpts: paginationOptsValidator }, returns: publicPostPageValidator,
  handler: async (ctx, args): Promise<PublicPagination<PublicPost>> => {
    const context = await publicContext(ctx, args.networkId)
    const page = await publicPageByHandle(ctx, context, args.handle)
    if (!page) return { page: [], isDone: true, continueCursor: "" }
    const result = await ctx.db.query("posts").withIndex("by_root_page_status_publishedAt", (q) => q.eq("onRoot", true).eq("pageId", page._id).eq("status", "published")).order("desc").paginate(listOptions(args.paginationOpts))
    const posts: PublicPost[] = []
    for (const post of result.page) if (await publicPostEligible(ctx, context, post)) posts.push(await publicPostDto(ctx, context, post))
    return { page: posts, isDone: result.isDone, continueCursor: result.continueCursor }
  },
})

/** @publicProjection Douze périodes UTC fixes de transparence agrégée, petites cohortes supprimées sans sous-catégories. */
export const transparency = query({
  args: { networkId: v.id("networks") }, returns: publicTransparencyValidator,
  handler: async (ctx, args): Promise<PublicTransparency> => {
    const { root } = await publicContext(ctx, args.networkId)
    const cutoff = Math.floor(Date.now() / DAY_MS) * DAY_MS
    const periods: PublicTransparency["periods"] = []
    for (let n = 1; n <= RECENT_PERIODS; n++) {
      const periodStart = cutoff - n * DAY_MS
      const row = await ctx.db.query("moderationTransparency").withIndex("by_network_period", (q) => q.eq("networkId", root._id).eq("periodStart", periodStart)).unique()
      const disclosed = row && row.periodEnd === periodStart + DAY_MS && row.generatedAt <= Date.now() && row.cases >= TRANSPARENCY_MIN_CASES && row.distinctAuthors >= TRANSPARENCY_MIN_CASES
      periods.push({ periodStart, periodEnd: periodStart + DAY_MS, cases: disclosed ? row.cases : null })
    }
    return { threshold: TRANSPARENCY_MIN_CASES, periods }
  },
})

/**
 * @publicProjection SU01d : échéances légales tenues ou manquées des douze périodes closes, base et petites cohortes absentes.
 * Une projection à part : la forme de `transparency` reste celle que lisent les écrans déjà publiés.
 */
export const transparencyDeadlines = query({
  args: { networkId: v.id("networks") }, returns: publicTransparencyDeadlinesValidator,
  handler: async (ctx, args): Promise<PublicTransparencyDeadlines> => {
    const { root } = await publicContext(ctx, args.networkId)
    const cutoff = Math.floor(Date.now() / DAY_MS) * DAY_MS
    const periods: PublicTransparencyDeadlines["periods"] = []
    for (let n = 1; n <= RECENT_PERIODS; n++) {
      const periodStart = cutoff - n * DAY_MS
      const row = await ctx.db.query("moderationTransparency").withIndex("by_network_period", (q) => q.eq("networkId", root._id).eq("periodStart", periodStart)).unique()
      const legal = row && row.periodEnd === periodStart + DAY_MS && row.generatedAt <= Date.now() ? legalDeadlineDisclosure(row) : null
      periods.push({ periodStart, periodEnd: periodStart + DAY_MS, legal })
    }
    return { threshold: TRANSPARENCY_MIN_CASES, periods }
  },
})
