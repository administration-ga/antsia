/** Validateurs fermés des contrats publics, indépendants des projections membres. */
import { PROVINCE_SLUGS } from "@antsia/social-domain/provinces"
import { v } from "convex/values"

import { badgeValidator, literals } from "../../lib/validators"
import { postMediaDtoValidator } from "../media/media"

export const publicOriginValidator = v.object({ slug: v.string(), name: v.string() })
export const publicAuthorValidator = v.object({
  kind: v.union(v.literal("person"), v.literal("page")),
  handle: v.union(v.string(), v.null()), displayName: v.union(v.string(), v.null()),
  badges: v.array(badgeValidator), avatarUrl: v.union(v.string(), v.null()),
})
export const publicSharedPostValidator = v.union(v.object({ available: v.literal(false) }), v.object({
  available: v.literal(true), id: v.string(), body: v.string(), publishedAt: v.number(),
  author: publicAuthorValidator, origin: publicOriginValidator, media: v.array(postMediaDtoValidator),
}))
export const publicPostValidator = v.object({
  id: v.string(), body: v.string(), publishedAt: v.number(), editedAt: v.union(v.number(), v.null()),
  tags: v.array(v.string()), province: v.union(literals(PROVINCE_SLUGS), v.null()),
  author: publicAuthorValidator, origin: publicOriginValidator, media: v.array(postMediaDtoValidator),
  shared: v.union(publicSharedPostValidator, v.null()),
  hasCommerceOffer: v.optional(v.boolean()),
})
export const publicProfileValidator = v.object({
  handle: v.string(), displayName: v.string(), headline: v.union(v.string(), v.null()),
  avatarUrl: v.union(v.string(), v.null()), badges: v.array(badgeValidator),
  publicAgent: v.optional(v.union(v.object({ administrationName: v.string(), administrationHandle: v.string(), roleLabel: v.string() }), v.null())),
})
export const publicPageValidator = v.object({
  id: v.string(), handle: v.string(), name: v.string(), shortName: v.union(v.string(), v.null()),
  description: v.union(v.string(), v.null()), logoUrl: v.union(v.string(), v.null()), bannerUrl: v.union(v.string(), v.null()),
  badge: v.literal("official"), origin: publicOriginValidator,
})
export const publicSnapshotValidator = v.object({
  generatedAt: v.union(v.number(), v.null()), periodStart: v.union(v.number(), v.null()), periodEnd: v.union(v.number(), v.null()),
  publishedPosts: v.union(v.number(), v.null()), officialPages: v.union(v.number(), v.null()),
  networks: v.array(publicOriginValidator), trends: v.array(v.object({ tag: v.string(), posts: v.number() })), bounded: v.boolean(),
})
export const publicTransparencyValidator = v.object({
  threshold: v.number(), periods: v.array(v.object({ periodStart: v.number(), periodEnd: v.number(), cases: v.union(v.number(), v.null()) })),
})
export const publicTransparencyDeadlinesValidator = v.object({
  threshold: v.number(), periods: v.array(v.object({ periodStart: v.number(), periodEnd: v.number(), legal: v.union(v.null(), v.object({ met: v.union(v.number(), v.null()), missed: v.union(v.number(), v.null()) })) })),
})
export const publicPostPageValidator = v.object({ page: v.array(publicPostValidator), isDone: v.boolean(), continueCursor: v.string() })
