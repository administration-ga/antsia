import { browserAppPath } from "./app-path"
import type { PublicNetworkSnapshot, PublicPage, PublicPagination, PublicPost, PublicProfile, PublicTransparency, PublicTransparencyDeadlines } from "@antsia/social-contracts/publicNetwork"
import { engineErrorCode } from "@antsia/social-contracts/errors"
import { BADGES } from "@antsia/social-domain/badges"
import { ROOT_NETWORK_SLUG } from "@antsia/social-domain/network"
import { PROVINCE_SLUGS, type ProvinceSlug } from "@antsia/social-domain/provinces"
import { api } from "@convex/_generated/api"
import { fetchQuery } from "convex/nextjs"
import type { FunctionReference } from "convex/server"
import type { Metadata } from "next"
import { cache } from "react"
import { z } from "zod"

import { configuredMetadataOrigin, getServerViewer, withinBridgeDeadline } from "./server-session"

const timestamp = z.number().finite().nonnegative().max(8_640_000_000_000_000)
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
const text = z.string().max(20_000)
const shortText = z.string().max(500)
const assetUrl = z.string().url().refine((value) => {
  try { const url = new URL(value); return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password } catch { return false }
})
const origin = z.object({ slug: shortText, name: shortText }).strict()
const author = z.object({ kind: z.enum(["person", "page"]), handle: shortText.nullable(), displayName: shortText.nullable(), badges: z.array(z.enum(BADGES)).max(4), avatarUrl: assetUrl.nullable() }).strict()
const media = z.object({ url: assetUrl.nullable(), withheld: z.enum(["fileScanPending", "fileScanUnavailable", "fileQuarantined"]).nullable(), kind: z.enum(["image", "video"]), mimeType: shortText, width: z.number().int().positive().max(20_000).optional(), height: z.number().int().positive().max(20_000).optional(), durationMs: timestamp.optional(), altText: shortText.optional() }).strict()
const shared = z.union([z.object({ available: z.literal(false) }).strict(), z.object({ available: z.literal(true), id: shortText, body: text, publishedAt: timestamp, author, origin, media: z.array(media).max(20) }).strict()])

export const publicPostSchema: z.ZodType<PublicPost> = z.object({ id: shortText, body: text, publishedAt: timestamp, editedAt: timestamp.nullable(), tags: z.array(shortText).max(10), province: z.enum(PROVINCE_SLUGS).nullable(), author, origin, media: z.array(media).max(20), shared: shared.nullable(), hasCommerceOffer: z.boolean().optional() }).strict()
export const publicProfileSchema: z.ZodType<PublicProfile> = z.object({ handle: shortText, displayName: shortText, headline: shortText.nullable(), avatarUrl: assetUrl.nullable(), badges: z.array(z.enum(BADGES)).max(4) }).strict()
export const publicPageSchema: z.ZodType<PublicPage> = z.object({ id: shortText, handle: shortText, name: shortText, shortName: shortText.nullable(), description: text.nullable(), logoUrl: assetUrl.nullable(), bannerUrl: assetUrl.nullable(), badge: z.literal("official"), origin }).strict()
export const publicSnapshotSchema: z.ZodType<PublicNetworkSnapshot> = z.object({ generatedAt: timestamp.nullable(), periodStart: timestamp.nullable(), periodEnd: timestamp.nullable(), publishedPosts: count.nullable(), officialPages: count.nullable(), networks: z.array(origin).max(100), trends: z.array(z.object({ tag: shortText, posts: count }).strict()).max(100), bounded: z.boolean() }).strict()
export const publicTransparencySchema: z.ZodType<PublicTransparency> = z.object({ periods: z.array(z.object({ periodStart: timestamp, periodEnd: timestamp, cases: count.nullable() }).strict()).max(12), threshold: z.number().int().positive() }).strict()
export const publicTransparencyDeadlinesSchema: z.ZodType<PublicTransparencyDeadlines> = z.object({ periods: z.array(z.object({ periodStart: timestamp, periodEnd: timestamp, legal: z.object({ met: count.nullable(), missed: count.nullable() }).strict().nullable() }).strict()).max(12), threshold: z.number().int().positive() }).strict()
export const publicPostsPageSchema: z.ZodType<PublicPagination<PublicPost>> = z.object({ page: z.array(publicPostSchema).max(50), isDone: z.boolean(), continueCursor: z.string().max(8192) }).strict()

export type PublicResult<T> = { status: "ready"; data: T; viewer: "anonymous" | "authenticated" } | { status: "refused" | "unavailable" | "handoff" }

export function publicSearch(search: Record<string, string | string[] | undefined>) {
  const cursor = typeof search.cursor === "string" && search.cursor.length <= 8192 ? search.cursor : null
  return { cursor, handoff: Object.hasOwn(search, "ott") }
}

const publicContext = cache(async () => {
  const viewer = await getServerViewer()
  if (viewer.status === "refused" || viewer.status === "unavailable") return { status: viewer.status } as const
  const url = process.env.NEXT_PUBLIC_CONVEX_URL
  if (!url) return { status: "unavailable" } as const
  try {
    const options = { url, ...(viewer.status === "authenticated" ? { token: viewer.token } : {}) }
    const root = await withinBridgeDeadline(() => fetchQuery(api.modules.networks.networks.getBySlug, { slug: ROOT_NETWORK_SLUG }, options))
    return root ? { status: "ready", networkId: root._id, options, viewer: viewer.status } as const : { status: "unavailable" } as const
  } catch { return { status: "unavailable" } as const }
})

/** Porte commune des projections SSR ; conserve la décision de session et refuse les DTO hors contrat. */
export async function projected<T>(reference: FunctionReference<"query", "public">, args: Record<string, unknown>, schema: z.ZodType<T>, handoff: boolean): Promise<PublicResult<T>> {
  if (handoff) return { status: "handoff" }
  const context = await publicContext()
  if (context.status !== "ready") return { status: context.status }
  try {
    const value: unknown = await withinBridgeDeadline(() => fetchQuery(reference, { ...args, networkId: context.networkId }, context.options))
    const parsed = schema.safeParse(value)
    return parsed.success ? { status: "ready", data: parsed.data, viewer: context.viewer } : { status: "unavailable" }
  } catch (error) { return { status: publicErrorStatus(error) } }
}

export function publicErrorStatus(error: unknown): "refused" | "unavailable" {
  const code = engineErrorCode(error)
  return code && ["unauthenticated", "notFound", "membershipSuspended", "statusInsufficient", "policyRefused", "profileRequired", "consentRequired"].includes(code) ? "refused" : "unavailable"
}

// Arguments primitifs : les métadonnées et le rendu partagent le même appel par requête React.
export const loadPublicSnapshot = cache((handoff = false) => projected(api.modules.public.projections.snapshot, {}, publicSnapshotSchema, handoff))
export const loadPublicPost = cache((postId: string, handoff = false) => projected(api.modules.public.projections.getPost, { postId }, publicPostSchema.nullable(), handoff))
export const loadPublicProfile = cache((handle: string, handoff = false) => projected(api.modules.public.projections.getProfile, { handle }, publicProfileSchema.nullable(), handoff))
export const loadOfficialPage = cache((handle: string, handoff = false) => projected(api.modules.public.projections.getOfficialPage, { handle }, publicPageSchema.nullable(), handoff))
export const loadPublicPosts = cache((cursor: string | null = null, tag?: string, province?: ProvinceSlug, handoff = false) => projected(api.modules.public.projections.listRootPosts, { paginationOpts: { cursor, numItems: 12 }, ...(tag ? { tag } : {}), ...(province ? { province } : {}) }, publicPostsPageSchema, handoff))
export const loadOfficialPagePosts = cache((handle: string, cursor: string | null = null, handoff = false) => projected(api.modules.public.projections.pagePosts, { handle, paginationOpts: { cursor, numItems: 12 } }, publicPostsPageSchema, handoff))
export const loadPublicTransparency = cache((handoff = false) => projected(api.modules.public.projections.transparency, {}, publicTransparencySchema, handoff))
/** SU01d : projection à part, que les écrans antérieurs ignorent ; indisponible, la page reste lisible sans elle. */
export const loadPublicTransparencyDeadlines = cache((handoff = false) => projected(api.modules.public.projections.transparencyDeadlines, {}, publicTransparencyDeadlinesSchema, handoff))

export function publicMetadata(title: string, description: string, path: string, admitted = true): Metadata {
  const origin = configuredMetadataOrigin()
  return {
    title,
    description,
    robots: { index: admitted, follow: admitted },
    ...(origin && admitted ? { alternates: { canonical: new URL(browserAppPath(path), origin).href }, openGraph: { title, description, type: "website", url: new URL(browserAppPath(path), origin).href }, twitter: { card: "summary", title, description } } : {}),
  }
}
