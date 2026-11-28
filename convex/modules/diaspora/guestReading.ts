import { DIASPORA_GA_NETWORK_SLUG } from "@diaspora-ga/domain"
import { v } from "convex/values"

import type { Doc } from "../../_generated/dataModel"
import { query, type QueryCtx } from "../../_generated/server"
import { getRootNetwork } from "../../lib/access"
import { fail } from "../../lib/errors"
import { networkMutation, networkQuery } from "../../lib/functions"
import { isNetworkFeatureOpen } from "../../lib/networkFeatures"
import { enforceRateLimit } from "../../lib/rateLimit"
import { isFederatedContentAvailable } from "../federation/mirrorAccess"
import { servableUrl } from "../files/storageGuard"
import { resolvePostMediaDtos } from "../media/media"
import { isNetworkAccessSuspended } from "../moderation/judicialHolds"
import { findPageByHandle, requireManagedPage } from "../pages/access"
import { canExposeGuestProfile, guestContentVisible } from "./guestAccess"
import { assertDiasporaNetwork, consentInForce, isDiasporaNetwork, privacyOf, writePrivacy } from "./facts"

const destination = v.union(v.literal("feed"), v.literal("profile"), v.literal("page"), v.literal("post"))
const author = v.object({ kind: v.union(v.literal("person"), v.literal("page")), handle: v.string(), name: v.string(), image: v.union(v.string(), v.null()) })
const card = v.object({
  id: v.string(), body: v.string(), time: v.number(), author,
  media: v.array(v.object({ kind: v.union(v.literal("image"), v.literal("video")), url: v.string(), alt: v.string() })),
})

async function personCard(ctx: QueryCtx, network: Doc<"networks">, person: Doc<"persons"> | null) {
  if (!person?.handle || !person.displayName || !await canExposeGuestProfile(ctx, network, person)) return null
  return { kind: "person" as const, handle: person.handle, name: person.displayName, image: person.avatarStorageId ? await servableUrl(ctx, person.avatarStorageId) : null }
}

async function pageCard(ctx: QueryCtx, network: Doc<"networks">, page: Doc<"pages"> | null) {
  if (!page || page.networkId !== network._id || !page.guestVisible || page.status !== "active" || !await isNetworkFeatureOpen(ctx, network, "pages")) return null
  if (!await isFederatedContentAvailable(ctx, "pages", page._id) || !await guestContentVisible(ctx, "page", page._id)) return null
  return { kind: "page" as const, handle: page.handle, name: page.name, image: page.logoStorageId ? await servableUrl(ctx, page.logoStorageId) : null }
}

async function postCard(ctx: QueryCtx, network: Doc<"networks">, post: Doc<"posts"> | null) {
  if (!post || post.networkId !== network._id || post.guestVisible !== true || post.audience !== "public" || post.status !== "published" ||
    post.groupId || post.sharedPostId || post.liveSessionId || post.eventId || post.editorialArticleId || post.pageEventGalleryId || post.commerceOffer || post.federationSource) return null
  if (!await guestContentVisible(ctx, "post", post._id) || !await isFederatedContentAvailable(ctx, "posts", post._id)) return null
  const author = post.pageId ? await pageCard(ctx, network, await ctx.db.get(post.pageId))
    : post.authorPersonId ? await personCard(ctx, network, await ctx.db.get(post.authorPersonId)) : null
  if (!author) return null
  const media = (await resolvePostMediaDtos(ctx, post.media)).flatMap(item => item.url && !item.withheld ? [{ kind: item.kind, url: item.url, alt: item.altText ?? "" }] : [])
  return { id: String(post._id), body: post.body, time: post.publishedAt, author, media }
}

async function guestNetwork(ctx: QueryCtx) {
  if (process.env.DIASPORA_GUEST_READING_DISABLED === "true" || await ctx.auth.getUserIdentity()) return null
  const network = await ctx.db.query("networks").withIndex("by_slug", q => q.eq("slug", DIASPORA_GA_NETWORK_SLUG)).unique()
  const root = await getRootNetwork(ctx)
  if (!isDiasporaNetwork(network) || !root || root.status !== "active" || root._id !== network.parentId || await isNetworkAccessSuspended(ctx, network._id, root._id)) return null
  return network
}

/** @publicProjection Only publicly discoverable profiles and explicitly enabled pages. */
export const search = query({
  args: { term: v.string() }, returns: v.array(author),
  handler: async (ctx, { term }) => {
    const text = term.trim().replace(/^@/, "").toLowerCase()
    if (text.length < 2 || text.length > 80) return []
    const network = await guestNetwork(ctx)
    if (!network) return []
    const people = await ctx.db.query("peopleDirectory").withSearchIndex("search_name", q => q.search("searchName", text).eq("networkId", network._id).eq("listed", true)).take(15)
    const pages = await ctx.db.query("pages").withSearchIndex("search_name_v1", q => q.search("searchText", text).eq("networkId", network._id).eq("status", "active")).take(15)
    const matches = []
    for (const row of people) {
      const dto = await personCard(ctx, network, await ctx.db.get(row.personId))
      if (dto) matches.push(dto)
    }
    for (const row of pages) {
      const dto = await pageCard(ctx, network, row)
      if (dto) matches.push(dto)
    }
    return matches
  },
})

/** @publicProjection Anonymous DIASPORA reading. Every output field is explicitly selected. */
export const read = query({
  args: { screen: destination, target: v.optional(v.string()), cursor: v.optional(v.string()) },
  returns: v.union(v.null(), v.object({ heading: v.union(author, v.null()), posts: v.array(card), next: v.union(v.string(), v.null()) })),
  handler: async (ctx, { screen, target = "", cursor }) => {
    const network = await guestNetwork(ctx)
    if (!network) return null
    if (screen === "post") {
      const id = ctx.db.normalizeId("posts", target)
      const post = id ? await postCard(ctx, network, await ctx.db.get(id)) : null
      return post ? { heading: null, posts: [post], next: null } : null
    }

    const handle = target.trim().replace(/^@/, "").toLowerCase()
    const page = screen === "page" ? await findPageByHandle(ctx, handle) : null
    const person = screen === "profile" ? await ctx.db.query("persons").withIndex("by_handle", q => q.eq("handle", handle)).unique() : null
    const heading = screen === "profile" ? await personCard(ctx, network, person) : screen === "page" ? await pageCard(ctx, network, page) : null
    if (screen !== "feed" && !heading) return null
    const table = ctx.db.query("posts")
    const selected = person
      ? table.withIndex("by_network_guest_author_time", q => q.eq("networkId", network._id).eq("guestVisible", true).eq("authorPersonId", person._id).eq("status", "published"))
      : page
        ? table.withIndex("by_network_guest_page_time", q => q.eq("networkId", network._id).eq("guestVisible", true).eq("pageId", page._id).eq("status", "published"))
        : table.withIndex("by_network_guest_status_time", q => q.eq("networkId", network._id).eq("guestVisible", true).eq("status", "published"))
    const result = await selected.order("desc").paginate({ cursor: cursor ?? null, numItems: 12 })
    const posts = []
    for (const post of result.page) {
      if (person && post.pageId) continue
      const item = await postCard(ctx, network, post)
      if (item) posts.push(item)
    }
    return { heading, posts, next: result.isDone ? null : result.continueCursor }
  },
})

export const setting = networkQuery({
  minStatus: "en_attente", args: { pageId: v.optional(v.id("pages")) }, returns: v.boolean(),
  handler: async (ctx, { pageId }) => {
    assertDiasporaNetwork(ctx.network)
    if (pageId) return (await requireManagedPage(ctx, { networkId: ctx.networkId, personId: ctx.person._id }, pageId, "signatory")).page.guestVisible === true
    return (await privacyOf(ctx, ctx.networkId, ctx.person._id))?.guestProfile === true
  },
})

export const setVisibility = networkMutation({
  minStatus: "en_attente", args: { pageId: v.optional(v.id("pages")), enabled: v.boolean() }, returns: v.null(),
  handler: async (ctx, { pageId, enabled }) => {
    assertDiasporaNetwork(ctx.network)
    await enforceRateLimit(ctx, "person.facet", ctx.person._id)
    if (pageId) {
      const { page } = await requireManagedPage(ctx, { networkId: ctx.networkId, personId: ctx.person._id }, pageId, "admin")
      await ctx.db.patch(page._id, { guestVisible: enabled, updatedAt: Date.now() })
    } else {
      if (enabled && ((await privacyOf(ctx, ctx.networkId, ctx.person._id))?.directoryVisibility !== "network" || !await consentInForce(ctx, ctx.networkId, ctx.person._id, "directory"))) return fail("invalidArgument", { field: "directoryVisibility" })
      await writePrivacy(ctx, ctx.networkId, ctx.person._id, { guestProfile: enabled })
    }
    return null
  },
})
