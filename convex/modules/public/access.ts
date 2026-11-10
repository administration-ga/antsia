/** PA8 : admission explicite des projections sans compte ; aucune garde membre n'est élargie. */
import type { PublicAuthor, PublicOrigin, PublicPage, PublicPost, PublicProfile } from "@antsia/social-contracts/publicNetwork"
import { computePageBadge } from "@antsia/social-domain/badges"
import { normalizeHandle } from "@antsia/social-domain/content"
import { LEGACY_ROOT_NETWORK_SLUG, ROOT_NETWORK_SLUG } from "@antsia/social-domain/network"

import type { Doc, Id } from "../../_generated/dataModel"
import type { QueryCtx } from "../../_generated/server"
import { isActiveMember, requireMembership } from "../../lib/access"
import { notFound } from "../../lib/errors"
import { BRAND_NAME } from "@antsia/social-contracts/brand"
import { servableUrl } from "../files/storageGuard"
import { isBlockedBetween } from "../graph/graph"
import { resolvePostMediaDtos } from "../media/media"
import { canReadModeratedContent, contentState } from "../moderation/policy"
import type { ModerationSurface } from "@antsia/social-domain/moderationPolicy"
import { findPageByHandle } from "../pages/access"
import { isDiscoverablePerson } from "../people/miniProfile"
import { badgesOf } from "../people/persons"
import { canSeePostDoc, type ReaderContext } from "../posts/access"
import { hasNativePostAuthor } from "../posts/nativeAuthor"
import { isFederatedContentAvailable } from "../federation/mirrorAccess"
import { publicAgentAffiliation } from "../federation/agentAuthority"

export type PublicReader = ReaderContext | null
type ReadCtx = Pick<QueryCtx, "db">
export type PublicContext = { root: Doc<"networks">; reader: PublicReader }

/** Une identité résiduelle n'est JAMAIS reclassée anonyme quand la session est refusée. */
export async function publicContext(ctx: QueryCtx, networkId: Id<"networks">): Promise<PublicContext> {
  const root = await ctx.db.get(networkId)
  if (!root || root.kind !== "root" || root.status !== "active") return notFound()
  const rawIdentity = await ctx.auth.getUserIdentity()
  if (!rawIdentity) return { root, reader: null }
  const access = await requireMembership(ctx, networkId, "en_attente")
  return { root, reader: { personId: access.person._id, network: access.network } }
}

/** Origine vivante et attachée à LA racine lue, jamais une simple confiance dans onRoot. */
export async function publicOriginNetwork(ctx: ReadCtx, root: Doc<"networks">, networkId: Id<"networks">): Promise<Doc<"networks"> | null> {
  const origin = await ctx.db.get(networkId)
  if (!origin || origin.status !== "active") return null
  return origin._id === root._id || origin.kind === "closed" && origin.parentId === root._id ? origin : null
}

export function originDto(network: Doc<"networks">): PublicOrigin {
  return network.kind === "root" && network.slug === LEGACY_ROOT_NETWORK_SLUG
    ? { slug: ROOT_NETWORK_SLUG, name: BRAND_NAME }
    : { slug: network.slug, name: network.name }
}

/** Prélecture interdite sans compte même si le dossier n'a aucun propriétaire nominatif. */
async function publicContentAllowed(ctx: ReadCtx, kind: ModerationSurface, id: string): Promise<boolean> {
  const state = await contentState(ctx, kind, id)
  return state === null || state.status === "published"
}

export async function publicPageEligible(ctx: ReadCtx, context: PublicContext, page: Doc<"pages">): Promise<boolean> {
  if (page.trust !== "official" || page.status !== "active") return false
  if (!await isFederatedContentAvailable(ctx, "pages", page._id)) return false
  if (page.networkId !== context.root._id && (page.visibility !== "root" || !page.onRoot)) return false
  return await publicOriginNetwork(ctx, context.root, page.networkId) !== null && await publicContentAllowed(ctx, "page", page._id) && await canReadModeratedContent(ctx, "page", page._id, context.reader?.personId)
}

/** Prédicat sans enrichissement, partagé par les listes et les mesures système. */
export async function publicPostEligible(ctx: ReadCtx, context: PublicContext, post: Doc<"posts">): Promise<boolean> {
  // MP13 : seule la projection éditoriale spécialisée admet un article sans compte.
  if (post.editorialArticleId !== undefined) return false
  if (post.status !== "published" || post.onRoot !== true || post.visibility !== "root" || post.audience !== "public" || post.groupId !== undefined) return false
  if (!await isFederatedContentAvailable(ctx, "posts", post._id)) return false
  if (!await publicOriginNetwork(ctx, context.root, post.networkId) || !await canReadModeratedContent(ctx, "post", post._id, context.reader?.personId)) return false
  // La lecture publique refuse toujours la prélecture, même à son propriétaire/modérateur.
  if (!await publicContentAllowed(ctx, "post", post._id)) return false
  if (post.pageId !== undefined) {
    const page = await ctx.db.get(post.pageId)
    if (!page || page.networkId !== post.networkId || !await publicPageEligible(ctx, context, page)) return false
  } else {
    if (!hasNativePostAuthor(post)) return false
    const author = await ctx.db.get(post.authorPersonId)
    if (!author || author.erasedAt !== undefined || author.deletionRequestedAt !== undefined || !await isActiveMember(ctx, post.networkId, author._id)) return false
  }
  if (context.reader) {
    if (!await canSeePostDoc(ctx, context.reader, post)) return false
    const hidden = await ctx.db.query("postMarks").withIndex("by_network_person_kind_post", (q) => q.eq("networkId", context.root._id).eq("personId", context.reader!.personId).eq("kind", "hidden").eq("postId", post._id)).unique()
    if (hidden) return false
  }
  return true
}

async function authorDto(ctx: Pick<QueryCtx, "db" | "storage">, context: PublicContext, post: Doc<"posts">): Promise<PublicAuthor> {
  if (post.pageId !== undefined) {
    const page = await ctx.db.get(post.pageId)
    if (!page) return notFound()
    return { kind: "page", handle: page.handle, displayName: page.name, badges: [computePageBadge(page.trust)], avatarUrl: page.logoStorageId ? await servableUrl(ctx, page.logoStorageId) : null }
  }
  if (!hasNativePostAuthor(post)) return notFound()
  const person = await ctx.db.get(post.authorPersonId)
  if (!person || !isDiscoverablePerson(person) || !await publicContentAllowed(ctx, "person", person._id) || !await canReadModeratedContent(ctx, "person", person._id, context.reader?.personId)) {
    return { kind: "person", handle: null, displayName: null, badges: [], avatarUrl: null }
  }
  return { kind: "person", handle: person.handle ?? null, displayName: person.displayName ?? null, badges: await badgesOf(ctx, person._id), avatarUrl: person.avatarStorageId ? await servableUrl(ctx, person.avatarStorageId) : null }
}

/** Original réduit, profondeur UN ; le même prédicat relit son droit à chaque requête. */
export async function publicPostDto(ctx: QueryCtx, context: PublicContext, post: Doc<"posts">): Promise<PublicPost> {
  const origin = await publicOriginNetwork(ctx, context.root, post.networkId)
  if (!origin) return notFound()
  let shared: PublicPost["shared"] = null
  if (post.sharedPostId !== undefined) {
    const original = await ctx.db.get(post.sharedPostId)
    const originalOrigin = original ? await publicOriginNetwork(ctx, context.root, original.networkId) : null
    shared = original && originalOrigin && await publicPostEligible(ctx, context, original)
      ? { available: true, id: original._id, body: original.body, publishedAt: original.publishedAt, author: await authorDto(ctx, context, original), origin: originDto(originalOrigin), media: await resolvePostMediaDtos(ctx, original.media, original.federationMedia) }
      : { available: false }
  }
  return {
    id: post._id, body: post.body, publishedAt: post.publishedAt, editedAt: post.editedAt ?? null,
    tags: post.tags ?? [], province: post.province ?? null, author: await authorDto(ctx, context, post), origin: originDto(origin),
    media: await resolvePostMediaDtos(ctx, post.media, post.federationMedia), shared,
    ...(post.commerceOffer ? { hasCommerceOffer: true } : {}),
  }
}

export async function publicProfileByHandle(ctx: QueryCtx, context: PublicContext, handle: string): Promise<PublicProfile | null> {
  const person = await ctx.db.query("persons").withIndex("by_handle", (q) => q.eq("handle", normalizeHandle(handle))).unique()
  if (!person || !person.handle || !person.displayName || !isDiscoverablePerson(person) || !await isActiveMember(ctx, context.root._id, person._id)) return null
  if (!await publicContentAllowed(ctx, "person", person._id) || !await canReadModeratedContent(ctx, "person", person._id, context.reader?.personId)) return null
  if (context.reader && await isBlockedBetween(ctx, context.reader.personId, person._id)) return null
  const publicAgent = await publicAgentAffiliation(ctx, person._id)
  return { handle: person.handle, displayName: person.displayName, headline: person.headline ?? null, avatarUrl: person.avatarStorageId ? await servableUrl(ctx, person.avatarStorageId) : null, badges: await badgesOf(ctx, person._id), ...(publicAgent ? { publicAgent } : {}) }
}

export async function publicPageByHandle(ctx: QueryCtx, context: PublicContext, handle: string): Promise<Doc<"pages"> | null> {
  const page = await findPageByHandle(ctx, handle)
  return page && await publicPageEligible(ctx, context, page) ? page : null
}

export async function publicPageDto(ctx: QueryCtx, context: PublicContext, page: Doc<"pages">): Promise<PublicPage> {
  const origin = await publicOriginNetwork(ctx, context.root, page.networkId)
  if (!origin) return notFound()
  return { id: page._id, handle: page.handle, name: page.name, shortName: page.shortName ?? null, description: page.description ?? null, logoUrl: page.logoStorageId ? await servableUrl(ctx, page.logoStorageId) : null, bannerUrl: page.bannerStorageId ? await servableUrl(ctx, page.bannerStorageId) : null, badge: "official", origin: originDto(origin) }
}
