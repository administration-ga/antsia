/**
 * Avis admissibles et droit de réponse DIASPORA.GA (DG-016).
 * Un avis par rendez-vous et demandeur, sans auto-évaluation ; les preuves
 * sont relues sur la demande, le rendez-vous et la proposition acceptée.
 * Aucune référence de demande/rendez-vous ni identifiant de profil en public.
 * Avis et réponse ont chacun leur état de modération ; retirer l'un est
 * terminal. Les gardes n'importent jamais `moderation/targets` (pas de cycle).
 */
import {
  checkServiceReviewActive,
  checkServiceReviewVersion,
  parseServiceReview,
  parseServiceReviewReply,
  SERVICE_REVIEW_REFUSALS,
  serviceReviewEligibility,
  type Result,
  type ServiceReviewRefusal,
} from "@diaspora-ga/domain"
import { paginationOptsValidator, type PaginationOptions } from "convex/server"
import { v } from "convex/values"

import type { Doc, Id } from "../../_generated/dataModel"
import type { MutationCtx, QueryCtx } from "../../_generated/server"
import { effectiveMembershipStatus } from "../../lib/access"
import { failAppRule, notFound } from "../../lib/errors"
import { networkMutation, networkQuery } from "../../lib/functions"
import { literals } from "../../lib/validators"
import { isBlockedBetween } from "../graph/graph"
import { canReadModeratedContent, contentState, moderateContentWrite, moderatePageContentWrite } from "../moderation/policy"
import { livePageTeamRole, liveSignatoryRole, readablePageOrNull } from "../pages/access"
import { livePersonProfile } from "../people/miniProfile"
import { assertDiasporaNetwork, isDiasporaNetwork } from "./facts"
// Avis neutre de la cloche (DG-016) à l'auteur de l'avis, par la porte unique, après l'écriture de la réponse.
import { noticeServiceReviewReplied } from "./serviceNotifications"
import { serviceReviewProofValidator, serviceReviewStatusValidator } from "./serviceReviewsTables"

type ReadCtx = Pick<QueryCtx, "db">
type ReadScope = ReadCtx & { network: Doc<"networks">; networkId: Id<"networks">; person: Doc<"persons">; membership: Doc<"networkMemberships"> }
type ModerationStatus = "published" | "pending_review" | "removed"
type Sources = {
  request: Doc<"serviceRequests">
  page: Doc<"pages">
  offer: Doc<"serviceOffers">
  booking: Doc<"serviceBookings"> | null
  proposal: Doc<"serviceProposals"> | null
}

const moderationValidator = literals(["published", "pending_review", "removed"] as const)
const replyValidator = v.object({
  replyId: v.id("serviceReviewReplies"), body: v.string(), version: v.number(), status: serviceReviewStatusValidator,
  moderation: moderationValidator, canManage: v.boolean(), createdAt: v.number(), updatedAt: v.number(),
})
const reviewValidator = v.object({
  reviewId: v.id("serviceReviews"), pageId: v.id("pages"), offerId: v.id("serviceOffers"),
  rating: v.number(), body: v.string(), proof: serviceReviewProofValidator, version: v.number(), status: serviceReviewStatusValidator,
  moderation: moderationValidator, author: v.object({ displayName: v.union(v.string(), v.null()) }),
  isMine: v.boolean(), canReply: v.boolean(), reply: v.union(replyValidator, v.null()), createdAt: v.number(), updatedAt: v.number(),
})
type ReviewView = typeof reviewValidator.type
const pageReviewValidator = v.object({ ...reviewValidator.fields, offerTitle: v.string() })
type PageReviewView = typeof pageReviewValidator.type

function refuse(code: ServiceReviewRefusal): never {
  const conflict = code === "review_already_exists" || code === "review_version_changed"
  const invalid = code === "review_rating_invalid" || code === "review_body_too_short" || code === "review_body_too_long"
    || code === "review_reply_too_short" || code === "review_reply_too_long" || code === "review_contact_forbidden"
    || code === "review_address_forbidden" || code === "review_consent_required"
  return failAppRule(code, {}, conflict ? "conflict" : invalid ? "invalidArgument" : "policyRefused")
}

function ruled<T>(result: Result<T, ServiceReviewRefusal>): T {
  return result.ok ? result.value : refuse(result.code)
}

function boundedPage(options: PaginationOptions): PaginationOptions {
  return {
    ...options,
    numItems: Number.isFinite(options.numItems) ? Math.min(Math.max(Math.trunc(options.numItems), 1), 50) : 20,
    maximumBytesRead: Math.min(options.maximumBytesRead ?? 2 * 1024 * 1024, 2 * 1024 * 1024),
  }
}

/** Les références sont re-jointes, jamais crues depuis une seule ligne dénormalisée. */
async function sourcesOf(ctx: ReadCtx, network: Doc<"networks">, request: Doc<"serviceRequests">, reader: Id<"persons">): Promise<Sources | null> {
  if (request.networkId !== network._id) return null
  const page = await readablePageOrNull(ctx, network, request.pageId, reader)
  const offer = await ctx.db.get(request.offerId)
  if (!page || page.networkId !== network._id || !offer || offer.networkId !== network._id || offer.pageId !== page._id) return null
  if (!request.bookingId) return { request, page, offer, booking: null, proposal: null }
  const booking = await ctx.db.get(request.bookingId)
  if (!booking || booking.networkId !== network._id || booking.requestId !== request._id || booking.pageId !== page._id) return null
  const proposal = await ctx.db.get(booking.proposalId)
  if (!proposal || proposal.networkId !== network._id || proposal.requestId !== request._id || proposal.pageId !== page._id
    // Le contrat DG-015 conserve `current` ; c'est `booking.proposalId` qui atteste l'accord.
    || proposal.state !== "current" || request.currentProposalId !== proposal._id || request.proposalVersion !== proposal.version
    || booking.startAt !== proposal.startAt || booking.endAt !== proposal.endAt) return null
  return { request, page, offer, booking, proposal }
}

/** Le professionnel de la demande, ou toute l'équipe VIVANTE de sa page (AS-10 : modérateur compris, partie liée). */
async function isProvider(ctx: ReadCtx, sources: Sources, personId: Id<"persons">): Promise<boolean> {
  return sources.proposal?.authorPersonId === personId || (await livePageTeamRole(ctx, sources.page, personId)) !== null
}

async function eligibility(ctx: ReadCtx, sources: Sources, personId: Id<"persons">) {
  return serviceReviewEligibility({
    isRequester: sources.request.requesterPersonId === personId,
    isProvider: await isProvider(ctx, sources, personId),
    requestStatus: sources.request.status,
    bookingStatus: sources.booking?.status ?? null,
    bookingEndAt: sources.booking?.endAt ?? null,
    // DG-015 : une absence contestée par le demandeur ne lui retire pas son avis.
    noShowContested: sources.request.contestedAt !== undefined,
    now: Date.now(),
  })
}

function matchesSources(review: Doc<"serviceReviews">, sources: Sources): boolean {
  return review.networkId === sources.request.networkId && review.requestId === sources.request._id
    && review.bookingId === sources.booking?._id && review.offerId === sources.offer._id && review.pageId === sources.page._id
    && review.authorPersonId === sources.request.requesterPersonId
}

async function moderationOf(ctx: ReadCtx, kind: "serviceReview" | "serviceReviewReply", id: string, networkId: Id<"networks">): Promise<ModerationStatus> {
  const state = await contentState(ctx, kind, id)
  return state && state.networkId !== networkId ? "removed" : state?.status ?? "pending_review"
}

/** L'ouverture d'une surface exige une politique explicite avant toute publication. */
async function moderateReviewWrite(ctx: Pick<MutationCtx, "db"> & ReadScope, kind: "serviceReview" | "serviceReviewReply", id: string, text: string, ownerPageId?: Id<"pages">): Promise<void> {
  if (kind === "serviceReviewReply") {
    if (!ownerPageId) return notFound()
    await moderatePageContentWrite(ctx, { networkId: ctx.networkId, pageId: ownerPageId, kind, id, text })
    return
  }
  await moderateContentWrite(ctx, { networkId: ctx.networkId, ownerPersonId: ctx.person._id, kind, id, text })
  const policy = await ctx.db.query("moderationPolicies").withIndex("by_network_surface", (q) => q.eq("networkId", ctx.networkId).eq("surface", kind)).unique()
  const state = await contentState(ctx, kind, id)
  if (state) {
    await ctx.db.patch(state._id, {
      ...(!policy && state.status !== "removed" ? { status: "pending_review" as const } : {}),
      updatedAt: Date.now(),
    })
  }
}

/**
 * Porte commune de lecture et de signalement. Aucun appel à `resolveVisibleTarget` :
 * les états de modération se lisent directement, afin que son intégration reste acyclique.
 * `pending_review` reste accessible à son auteur et aux modérateurs autorisés ;
 * le catalogue impose en PLUS `published`, même pour eux.
 */
export async function readableServiceReviewOrNull(ctx: ReadCtx, network: Doc<"networks">, reviewId: Id<"serviceReviews">, readerPersonId: Id<"persons">): Promise<Doc<"serviceReviews"> | null> {
  if (!isDiasporaNetwork(network)) return null
  const review = await ctx.db.get(reviewId)
  if (!review || review.networkId !== network._id || review.status !== "active") return null
  const request = await ctx.db.get(review.requestId)
  const sources = request && await sourcesOf(ctx, network, request, readerPersonId)
  if (!sources || sources.offer.status !== "active" || !matchesSources(review, sources) || !(await eligibility(ctx, sources, review.authorPersonId)).ok) return null
  if (await isBlockedBetween(ctx, readerPersonId, review.authorPersonId)) return null
  const state = await contentState(ctx, "serviceReview", review._id)
  if (!state || state.networkId !== network._id || state.status === "removed"
    || !(await canReadModeratedContent(ctx, "serviceReview", review._id, readerPersonId))) return null
  return review
}

async function replyOf(ctx: ReadCtx, reviewId: Id<"serviceReviews">): Promise<Doc<"serviceReviewReplies"> | null> {
  return await ctx.db.query("serviceReviewReplies").withIndex("by_review", (q) => q.eq("reviewId", reviewId)).unique()
}

/** Projection allowlistée ; le nom est relu sur le profil vivant à chaque lecture. */
async function project(ctx: ReadScope, review: Doc<"serviceReviews">, page: Doc<"pages">): Promise<ReviewView> {
  const moderation = await moderationOf(ctx, "serviceReview", review._id, ctx.networkId)
  const mine = review.authorPersonId === ctx.person._id
  const signatory = (await liveSignatoryRole(ctx, page, ctx.person._id)) !== null
  const memberStatus = effectiveMembershipStatus(ctx.membership)
  const canPublish = memberStatus === "declaree" || memberStatus === "verifiee"
  const person = await livePersonProfile(ctx, review.authorPersonId)
  const redacted = review.status === "withdrawn" || moderation === "removed"
  const reply = await replyOf(ctx, review._id)
  let replyView: ReviewView["reply"] = null
  let canManageReply = false
  if (!redacted && reply && reply.networkId === ctx.networkId && reply.pageId === page._id && !(await isBlockedBetween(ctx, ctx.person._id, reply.authorPersonId))) {
    const state = await moderationOf(ctx, "serviceReviewReply", reply._id, ctx.networkId)
    // La page conserve son accès de gestion à sa réponse en attente, quel que soit le signataire auteur.
    const manager = signatory && !mine
    canManageReply = manager && reply.status === "active" && state !== "removed"
    const readable = await canReadModeratedContent(ctx, "serviceReviewReply", reply._id, ctx.person._id)
    if (reply.status === "withdrawn") {
      replyView = {
        replyId: reply._id, body: "", version: reply.version, status: reply.status, moderation: state,
        canManage: false, createdAt: reply.createdAt, updatedAt: reply.updatedAt,
      }
    } else if ((state === "published" && readable) || (manager && state === "pending_review")) {
      replyView = {
        replyId: reply._id, body: reply.body, version: reply.version, status: reply.status, moderation: state,
        canManage: canManageReply,
        createdAt: reply.createdAt, updatedAt: reply.updatedAt,
      }
    }
  }
  return {
    reviewId: review._id, pageId: review.pageId, offerId: review.offerId, rating: review.rating, body: redacted ? "" : review.body,
    proof: review.proof, version: review.version, status: review.status, moderation, author: { displayName: redacted ? null : person?.displayName ?? null },
    isMine: mine, canReply: canPublish && signatory && !mine && review.status === "active" && moderation === "published" && (reply === null || canManageReply),
    reply: replyView, createdAt: review.createdAt, updatedAt: review.updatedAt,
  }
}

/** Le demandeur seulement : ni un autre participant ni la page ne sonde sa preuve privée. */
export const myReviewForRequest = networkQuery({
  feature: "services",
  minStatus: "en_attente",
  args: { requestId: v.id("serviceRequests") },
  returns: v.union(v.object({ canCreate: v.boolean(), refusal: v.union(literals(SERVICE_REVIEW_REFUSALS), v.null()), proof: v.union(serviceReviewProofValidator, v.null()), review: v.union(reviewValidator, v.null()) }), v.null()),
  handler: async (ctx, { requestId }) => {
    assertDiasporaNetwork(ctx.network)
    const request = await ctx.db.get(requestId)
    if (!request || request.networkId !== ctx.networkId || request.requesterPersonId !== ctx.person._id) return null
    const sources = await sourcesOf(ctx, ctx.network, request, ctx.person._id)
    if (!sources) return null
    const result = await eligibility(ctx, sources, ctx.person._id)
    const status = effectiveMembershipStatus(ctx.membership)
    const canPublish = status === "declaree" || status === "verifiee"
    const review = sources.booking && await ctx.db.query("serviceReviews")
      .withIndex("by_booking_and_author", (q) => q.eq("bookingId", sources.booking!._id).eq("authorPersonId", ctx.person._id)).unique()
    if (review && !matchesSources(review, sources)) return null
    return {
      canCreate: !review && result.ok && canPublish,
      refusal: review ? (review.status === "withdrawn" ? "review_withdrawn" as const : "review_already_exists" as const) : result.ok ? null : result.code,
      proof: review?.proof ?? (result.ok ? result.value : null),
      review: review ? await project(ctx, review, sources.page) : null,
    }
  },
})

export const offerReviews = networkQuery({
  feature: "services",
  minStatus: "en_attente",
  args: { offerId: v.id("serviceOffers"), paginationOpts: paginationOptsValidator },
  returns: v.object({ items: v.array(reviewValidator), continueCursor: v.union(v.string(), v.null()), isDone: v.boolean() }),
  handler: async (ctx, { offerId, paginationOpts }) => {
    assertDiasporaNetwork(ctx.network)
    const offer = await ctx.db.get(offerId)
    if (!offer || offer.networkId !== ctx.networkId || offer.status !== "active") return notFound()
    const page = await readablePageOrNull(ctx, ctx.network, offer.pageId, ctx.person._id)
    if (!page || page.networkId !== ctx.networkId) return notFound()
    const result = await ctx.db.query("serviceReviews")
      .withIndex("by_network_and_offer_and_createdAt", (q) => q.eq("networkId", ctx.networkId).eq("offerId", offerId))
      .order("desc").paginate(boundedPage(paginationOpts))
    const items: ReviewView[] = []
    for (const row of result.page) {
      // Pas de dérogation auteur/modérateur sur cette projection publique.
      if (row.pageId !== page._id || (await moderationOf(ctx, "serviceReview", row._id, ctx.networkId)) !== "published") continue
      const review = await readableServiceReviewOrNull(ctx, ctx.network, row._id, ctx.person._id)
      if (review) items.push(await project(ctx, review, page))
    }
    return { items, continueCursor: result.isDone ? null : result.continueCursor, isDone: result.isDone }
  },
})

/** Avis publiés d'une page, dans l'ordre chronologique ; aucune dérogation de gestion. */
export const pageReviews = networkQuery({
  feature: "services",
  minStatus: "en_attente",
  args: { pageId: v.id("pages"), expectedPersonId: v.id("persons"), paginationOpts: paginationOptsValidator },
  returns: v.object({ items: v.array(pageReviewValidator), continueCursor: v.union(v.string(), v.null()), isDone: v.boolean() }),
  handler: async (ctx, { pageId, expectedPersonId, paginationOpts }) => {
    assertDiasporaNetwork(ctx.network)
    if (expectedPersonId !== ctx.person._id) return notFound()
    const page = await readablePageOrNull(ctx, ctx.network, pageId, ctx.person._id)
    if (!page || page.networkId !== ctx.networkId || (page.ownerKind !== "association" && page.ownerKind !== "company")) return notFound()
    const readBudget = (requested: number | undefined, maximum: number) => requested === undefined || !Number.isFinite(requested)
      ? maximum
      : Math.min(Math.max(Math.trunc(requested), 1), maximum)
    const result = await ctx.db.query("serviceReviews")
      .withIndex("by_network_and_page_and_createdAt", (q) => q.eq("networkId", ctx.networkId).eq("pageId", pageId))
      .order("desc").paginate({
        ...boundedPage(paginationOpts),
        maximumRowsRead: readBudget(paginationOpts.maximumRowsRead, 50),
        maximumBytesRead: readBudget(paginationOpts.maximumBytesRead, 2 * 1024 * 1024),
      })
    const items: PageReviewView[] = []
    for (const row of result.page) {
      if (row.networkId !== ctx.networkId || row.pageId !== page._id
        || (await moderationOf(ctx, "serviceReview", row._id, ctx.networkId)) !== "published") continue
      const review = await readableServiceReviewOrNull(ctx, ctx.network, row._id, ctx.person._id)
      if (!review || review.networkId !== ctx.networkId || review.pageId !== page._id) continue
      const offer = await ctx.db.get(review.offerId)
      if (!offer || offer.networkId !== ctx.networkId || offer.pageId !== page._id || offer.status !== "active") continue
      items.push({ ...await project(ctx, review, page), offerTitle: offer.title })
    }
    return { items, continueCursor: result.isDone ? null : result.continueCursor, isDone: result.isDone }
  },
})

async function requireOwnedReview(ctx: ReadScope, reviewId: Id<"serviceReviews">): Promise<Doc<"serviceReviews">> {
  const review = await ctx.db.get(reviewId)
  if (!review || review.networkId !== ctx.networkId || review.authorPersonId !== ctx.person._id) return notFound()
  return review
}

async function requireReviewSources(ctx: ReadScope, review: Doc<"serviceReviews">): Promise<Sources> {
  const request = await ctx.db.get(review.requestId)
  const sources = request && await sourcesOf(ctx, ctx.network, request, ctx.person._id)
  if (!sources || !matchesSources(review, sources)) return notFound()
  return sources
}

export const createReview = networkMutation({
  feature: "services",
  minStatus: "declaree", writeBucket: "diaspora.service.review",
  args: { requestId: v.id("serviceRequests"), rating: v.number(), body: v.string(), consentToPublish: v.boolean() },
  returns: v.object({ reviewId: v.id("serviceReviews"), created: v.boolean() }),
  handler: async (ctx, args) => {
    assertDiasporaNetwork(ctx.network)
    const input = ruled(parseServiceReview(args))
    const request = await ctx.db.get(args.requestId)
    if (!request || request.networkId !== ctx.networkId || request.requesterPersonId !== ctx.person._id) return notFound()
    const sources = await sourcesOf(ctx, ctx.network, request, ctx.person._id)
    if (!sources) return notFound()
    const proof = ruled(await eligibility(ctx, sources, ctx.person._id))
    if (!sources.booking || !sources.proposal) return refuse("review_booking_required")
    if (await isBlockedBetween(ctx, ctx.person._id, sources.proposal.authorPersonId)) return notFound()
    const existing = await ctx.db.query("serviceReviews")
      .withIndex("by_booking_and_author", (q) => q.eq("bookingId", sources.booking!._id).eq("authorPersonId", ctx.person._id)).unique()
    if (existing) {
      if (!matchesSources(existing, sources)) return notFound()
      ruled(checkServiceReviewActive(existing.status))
      if ((await moderationOf(ctx, "serviceReview", existing._id, ctx.networkId)) === "removed") return refuse("review_not_published")
      if (existing.rating !== input.rating || existing.body !== input.body) return refuse("review_already_exists")
      return { reviewId: existing._id, created: false }
    }
    const now = Date.now()
    const reviewId = await ctx.db.insert("serviceReviews", {
      networkId: ctx.networkId, requestId: request._id, bookingId: sources.booking._id, offerId: sources.offer._id,
      pageId: sources.page._id, authorPersonId: ctx.person._id, ...input, proof, consentToPublishAt: now,
      version: 1, status: "active", createdAt: now, updatedAt: now,
    })
    await moderateReviewWrite(ctx, "serviceReview", reviewId, input.body)
    return { reviewId, created: true }
  },
})

export const updateReview = networkMutation({
  feature: "services",
  minStatus: "declaree", writeBucket: "diaspora.service.review",
  args: { reviewId: v.id("serviceReviews"), expectedVersion: v.number(), rating: v.number(), body: v.string() }, returns: v.null(),
  handler: async (ctx, args) => {
    assertDiasporaNetwork(ctx.network)
    const review = await requireOwnedReview(ctx, args.reviewId)
    ruled(checkServiceReviewVersion(args.expectedVersion, review.version))
    ruled(checkServiceReviewActive(review.status))
    const sources = await requireReviewSources(ctx, review)
    ruled(await eligibility(ctx, sources, ctx.person._id))
    if (sources.proposal && await isBlockedBetween(ctx, ctx.person._id, sources.proposal.authorPersonId)) return notFound()
    const input = ruled(parseServiceReview({ ...args, consentToPublish: true }))
    if ((await moderationOf(ctx, "serviceReview", review._id, ctx.networkId)) === "removed") return refuse("review_not_published")
    await moderateReviewWrite(ctx, "serviceReview", review._id, input.body)
    await ctx.db.patch(review._id, { ...input, version: review.version + 1, updatedAt: Date.now() })
    return null
  },
})

/** Révoquer reste possible en attente et après désactivation de la page. */
export const withdrawReview = networkMutation({
  feature: "services",
  minStatus: "en_attente", writeBucket: "diaspora.service.review",
  args: { reviewId: v.id("serviceReviews"), expectedVersion: v.number() }, returns: v.null(),
  handler: async (ctx, args) => {
    assertDiasporaNetwork(ctx.network)
    const review = await requireOwnedReview(ctx, args.reviewId)
    ruled(checkServiceReviewVersion(args.expectedVersion, review.version))
    ruled(checkServiceReviewActive(review.status))
    const now = Date.now()
    await ctx.db.patch(review._id, { status: "withdrawn", version: review.version + 1, withdrawnAt: now, updatedAt: now })
    return null
  },
})

/** Le droit appartient à la page active et à ses signataires VIVANTS, jamais à l'ancien auteur de la réponse. */
async function requireReplyRight(ctx: ReadScope, reviewId: Id<"serviceReviews">): Promise<{ review: Doc<"serviceReviews">; sources: Sources }> {
  const review = await readableServiceReviewOrNull(ctx, ctx.network, reviewId, ctx.person._id)
  if (!review || review.authorPersonId === ctx.person._id) return notFound()
  const sources = await requireReviewSources(ctx, review)
  if ((await liveSignatoryRole(ctx, sources.page, ctx.person._id)) === null) return notFound()
  if ((await moderationOf(ctx, "serviceReview", review._id, ctx.networkId)) !== "published") return refuse("review_not_published")
  return { review, sources }
}

export const replyToReview = networkMutation({
  feature: "services",
  minStatus: "declaree", writeBucket: "diaspora.service.review",
  args: { reviewId: v.id("serviceReviews"), expectedVersion: v.union(v.number(), v.null()), body: v.string() }, returns: v.null(),
  handler: async (ctx, args) => {
    assertDiasporaNetwork(ctx.network)
    const { review } = await requireReplyRight(ctx, args.reviewId)
    const body = ruled(parseServiceReviewReply(args.body))
    const existing = await replyOf(ctx, review._id)
    const now = Date.now()
    if (existing) {
      if (existing.networkId !== ctx.networkId || existing.pageId !== review.pageId) return notFound()
      if (args.expectedVersion === null) return refuse("review_version_changed")
      ruled(checkServiceReviewVersion(args.expectedVersion, existing.version))
      if (existing.status !== "active") return refuse("review_reply_unavailable")
      if ((await moderationOf(ctx, "serviceReviewReply", existing._id, ctx.networkId)) === "removed") return refuse("review_not_published")
      await moderateReviewWrite(ctx, "serviceReviewReply", existing._id, body, review.pageId)
      await ctx.db.patch(existing._id, { body, authorPersonId: ctx.person._id, version: existing.version + 1, updatedAt: now })
    } else {
      if (args.expectedVersion !== null) return refuse("review_version_changed")
      const replyId = await ctx.db.insert("serviceReviewReplies", {
        networkId: ctx.networkId, reviewId: review._id, pageId: review.pageId, authorPersonId: ctx.person._id,
        body, version: 1, status: "active", createdAt: now, updatedAt: now,
      })
      await moderateReviewWrite(ctx, "serviceReviewReply", replyId, body, review.pageId)
    }
    await noticeServiceReviewReplied(ctx, review._id, ctx.person._id)
    return null
  },
})

export const withdrawReviewReply = networkMutation({
  feature: "services",
  minStatus: "en_attente", writeBucket: "diaspora.service.review",
  args: { reviewId: v.id("serviceReviews"), expectedVersion: v.number() }, returns: v.null(),
  handler: async (ctx, args) => {
    assertDiasporaNetwork(ctx.network)
    const { review } = await requireReplyRight(ctx, args.reviewId)
    const reply = await replyOf(ctx, review._id)
    if (!reply || reply.networkId !== ctx.networkId || reply.pageId !== review.pageId) return notFound()
    ruled(checkServiceReviewVersion(args.expectedVersion, reply.version))
    if (reply.status !== "active") return refuse("review_reply_unavailable")
    const now = Date.now()
    await ctx.db.patch(reply._id, { status: "withdrawn", version: reply.version + 1, withdrawnAt: now, updatedAt: now })
    return null
  },
})
