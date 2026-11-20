// @vitest-environment edge-runtime
/** DG-016 : sessions réelles, preuves, unicité, versions, retrait et modérations indépendantes. */
import { engineErrorAppRule, engineErrorCode } from "@antsia/social-contracts/errors"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { api, components, internal } from "../../_generated/api"
import type { Id } from "../../_generated/dataModel"
import { SEED_CONFIRMATION } from "../../seeds/foundations"
import { testConvex } from "../../test.setup"

type T = ReturnType<typeof testConvex>
const NOW = Date.UTC(2026, 9, 18, 10)
const HOUR = 3_600_000
const DAY = 24 * HOUR
const SR = api.modules.diaspora.serviceRequests
const RV = api.modules.diaspora.serviceReviews
const CASES = api.modules.moderation.cases
const PREVIEW = api.modules.moderation.reviewProjection.preview
const PAGE = { numItems: 20, cursor: null }
const BODY = "Accueil ponctuel et prestation conforme à la proposition."

beforeEach(() => {
  vi.stubEnv("CONVEX_CLOUD_URL", "http://127.0.0.1:3210")
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(NOW)
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs() })

async function codeOf(promise: Promise<unknown>) {
  try { await promise } catch (error) { return engineErrorAppRule(error)?.appRule ?? engineErrorCode(error) }
  return null
}

/** `testConvex` provisionne une vraie session Better Auth, jamais un contournement des gardes. */
async function member(t: T, networkId: Id<"networks">, handle: string, displayName: string) {
  const as = t.withIdentity({ subject: `review-${handle}` })
  const personId = await as.mutation(api.modules.people.persons.ensureMyPerson, {})
  await as.mutation(api.modules.people.consents.recordConsent, { purpose: "social_profile", origin: "onboarding" })
  await as.mutation(api.modules.people.profile.publishMyProfile, { handle, displayName })
  await t.run(async (ctx) => { await ctx.db.insert("identityLinks", { personId, provider: "idn", subject: `review-idn-${personId}`, loa: 2, nationality: "GA", linkedAt: NOW }) })
  await as.mutation(api.modules.diaspora.membership.joinDiasporaGa, { networkId, facet: { countryOfResidence: "FR", city: "Paris" } })
  return { as, personId }
}

async function fixture() {
  const t = testConvex()
  const { root } = await t.mutation(internal.seeds.foundations.run, { confirmNonProduction: SEED_CONFIRMATION })
  const { network: networkId } = await t.mutation(internal.modules.diaspora.seed.run, { confirmNonProduction: SEED_CONFIRMATION })
  await t.run(async (ctx) => {
    for (const surface of ["serviceReview", "serviceReviewReply"] as const) {
      await ctx.db.insert("moderationPolicies", { networkId, surface, preReview: false, maxLinks: 20, maxWrites: 100, windowMs: 60_000, updatedAt: NOW })
    }
  })
  const requester = await member(t, networkId, "awa-avis", "Awa OGOOUÉ")
  const pro = await member(t, networkId, "nadia-avis", "Nadia NDONG")
  const outsider = await member(t, networkId, "tiers-avis", "Jean MBA")
  const { pageId, offerId, signatoryId } = await t.run(async (ctx) => {
    const pageId = await ctx.db.insert("pages", {
      networkId, handle: "salon-avis", name: "Salon de test", ownerKind: "company", trust: "community", trustRank: 0,
      visibility: "network", onRoot: false, status: "active", searchText: "salon", createdAt: NOW, updatedAt: NOW,
    })
    const signatoryId = await ctx.db.insert("pageSignatories", { networkId, pageId, personId: pro.personId, role: "admin", acceptedAt: NOW, createdAt: NOW, updatedAt: NOW })
    const offerId = await ctx.db.insert("serviceOffers", {
      networkId, pageId, title: "Tresses africaines", description: "Tresses sur cheveux naturels.", category: "beauty", country: "FR", city: "Paris", cityKey: "paris",
      delivery: "onsite", languages: ["fr"], pricing: { mode: "quote" }, status: "active", version: 1, searchText: "tresses", createdAt: NOW, updatedAt: NOW,
    })
    return { pageId, offerId, signatoryId }
  })
  const { requestId } = await requester.as.mutation(SR.createServiceRequest, {
    networkId, offerId, offerVersion: 1, need: "Tresses pour une cérémonie familiale.", windows: [{ startAt: NOW + DAY, endAt: NOW + DAY + 4 * HOUR }],
    timeZone: "Europe/Paris", shareIdentityWithPage: true, idempotencyKey: "16f991f0-5341-4f81-96b7-f6c42a1a6900",
  })
  return { t, root, networkId, requester, pro, outsider, pageId, offerId, signatoryId, requestId }
}
type Fixture = Awaited<ReturnType<typeof fixture>>

async function book(f: Fixture, completed = false) {
  await f.pro.as.mutation(SR.proposeService, {
    networkId: f.networkId, requestId: f.requestId, expectedVersion: 0, amountMinor: 4500, currency: "EUR", durationMinutes: 60,
    startAt: NOW + DAY + HOUR, timeZone: "Europe/Paris", location: { mode: "onsite", area: "Paris" }, details: "Tresses, mèches fournies.",
    cancellationTerms: "Annulation libre avant le rendez-vous.", expiresAt: NOW + 12 * HOUR,
  })
  const result = await f.requester.as.mutation(SR.acceptServiceProposal, { networkId: f.networkId, requestId: f.requestId, expectedProposalVersion: 1 })
  vi.setSystemTime(NOW + DAY + 2 * HOUR)
  if (completed) await f.pro.as.mutation(SR.completeServiceBooking, { networkId: f.networkId, requestId: f.requestId })
  return result.bookingId
}

function publishArgs(f: Fixture) {
  return { networkId: f.networkId, requestId: f.requestId, rating: 4, body: BODY, consentToPublish: true }
}
function list(f: Fixture, as = f.outsider.as) {
  return as.query(RV.offerReviews, { networkId: f.networkId, offerId: f.offerId, paginationOpts: PAGE })
}
async function policy(f: Fixture, surface: "serviceReview" | "serviceReviewReply") {
  await f.t.run(async (ctx) => {
    const policy = await ctx.db.query("moderationPolicies").withIndex("by_network_surface", (q) => q.eq("networkId", f.networkId).eq("surface", surface)).unique()
    if (!policy) throw new Error("Politique absente de la fixture")
    await ctx.db.patch(policy._id, { preReview: true })
  })
}
async function state(f: Fixture, kind: "serviceReview" | "serviceReviewReply", id: string, status: "published" | "removed") {
  await f.t.run(async (ctx) => {
    const row = await ctx.db.query("moderationContentStates").withIndex("by_target", (q) => q.eq("targetKind", kind).eq("targetId", id)).unique()
    if (!row) throw new Error("État de modération absent de la fixture")
    await ctx.db.patch(row._id, { status })
  })
}

/** Un administrateur tiers, sans rôle dans la page ni participation à la demande. */
async function networkAdmin(f: Fixture) {
  await f.t.run(async (ctx) => {
    const membership = await ctx.db.query("networkMemberships").withIndex("by_network_and_person", (q) => q.eq("networkId", f.networkId).eq("personId", f.outsider.personId)).unique()
    if (!membership) throw new Error("Adhésion administrateur absente")
    await ctx.db.patch(membership._id, { role: "network_admin" })
  })
  return f.outsider.as
}

describe("avis de service DIASPORA.GA", () => {
  it("publie la preuve exacte et un nom vivant sans exposer les références privées", async () => {
    const f = await fixture()
    const bookingId = await book(f)
    const created = await f.requester.as.mutation(RV.createReview, publishArgs(f))
    expect(created.created).toBe(true)
    const page = await list(f)
    expect(page.items).toHaveLength(1)
    expect(page.items[0]).toMatchObject({ reviewId: created.reviewId, rating: 4, body: BODY, proof: "booking_confirmed", moderation: "published", author: { displayName: "Awa OGOOUÉ" }, canReply: false })
    const publicJson = JSON.stringify(page)
    for (const privateId of [f.requestId, bookingId, f.requester.personId]) expect(publicJson).not.toContain(privateId)
    expect(publicJson).not.toContain("awa-avis")
    await f.t.run(async (ctx) => { await ctx.db.patch(f.requester.personId, { withdrawnAt: Date.now() }) })
    expect((await list(f)).items[0]?.author).toEqual({ displayName: null })
    const stored = await f.t.run(async (ctx) => ctx.db.get(created.reviewId))
    expect(stored).toMatchObject({ consentToPublishAt: NOW + DAY + 2 * HOUR, version: 1 })
  })

  it("aucune preuve avant réservation, avant sa fin, ni après annulation ou absence", async () => {
    const f = await fixture()
    expect(await f.requester.as.query(RV.myReviewForRequest, { networkId: f.networkId, requestId: f.requestId })).toMatchObject({ canCreate: false, refusal: "review_booking_required", proof: null, review: null })
    expect(await codeOf(f.requester.as.mutation(RV.createReview, publishArgs(f)))).toBe("review_booking_required")
    const bookingId = await book(f)
    vi.setSystemTime(NOW + DAY + 2 * HOUR - 1)
    expect(await codeOf(f.requester.as.mutation(RV.createReview, publishArgs(f)))).toBe("review_booking_not_finished")
    vi.setSystemTime(NOW + DAY + 2 * HOUR)
    for (const status of ["cancelled", "no_show"] as const) {
      await f.t.run(async (ctx) => { await ctx.db.patch(bookingId, { status }); await ctx.db.patch(f.requestId, { status }) })
      expect(await codeOf(f.requester.as.mutation(RV.createReview, publishArgs(f)))).toBe("review_booking_ineligible")
    }
  })

  it("une réalisation déclarée ne s'appelle pas une certification indépendante", async () => {
    const f = await fixture()
    await book(f, true)
    await f.requester.as.mutation(RV.createReview, publishArgs(f))
    expect((await list(f)).items[0]?.proof).toBe("completion_declared")
  })

  it("un membre en attente garde sa preuve privée mais ne reçoit pas d'invitation à publier", async () => {
    const f = await fixture()
    await book(f)
    expect(await f.requester.as.query(RV.myReviewForRequest, { networkId: f.networkId, requestId: f.requestId })).toMatchObject({ canCreate: true, proof: "booking_confirmed" })
    await f.t.run(async (ctx) => {
      const row = await ctx.db.query("networkMemberships").withIndex("by_network_and_person", (q) => q.eq("networkId", f.networkId).eq("personId", f.requester.personId)).unique()
      if (!row) throw new Error("Adhésion absente")
      await ctx.db.patch(row._id, { status: "en_attente" })
    })
    expect(await f.requester.as.query(RV.myReviewForRequest, { networkId: f.networkId, requestId: f.requestId })).toMatchObject({ canCreate: false, proof: "booking_confirmed", review: null })
    expect(await codeOf(f.requester.as.mutation(RV.createReview, publishArgs(f)))).toBe("statusInsufficient")
  })

  it("refuse tiers, interréseau et auto-avis même après retrait du rôle du professionnel", async () => {
    const f = await fixture()
    await book(f)
    expect(await f.pro.as.query(RV.myReviewForRequest, { networkId: f.networkId, requestId: f.requestId })).toBeNull()
    expect(await f.outsider.as.query(RV.myReviewForRequest, { networkId: f.networkId, requestId: f.requestId })).toBeNull()
    expect(await codeOf(f.outsider.as.mutation(RV.createReview, publishArgs(f)))).toBe("notFound")
    expect(await codeOf(f.requester.as.mutation(RV.createReview, { ...publishArgs(f), networkId: f.root }))).toBe("notFound")
    await f.t.run(async (ctx) => { await ctx.db.delete(f.signatoryId); await ctx.db.patch(f.requestId, { requesterPersonId: f.pro.personId }) })
    expect(await codeOf(f.pro.as.mutation(RV.createReview, publishArgs(f)))).toBe("review_own_page")
  })

  it("AS-10 : le demandeur devenu modérateur de la page est partie liée — il ne donne pas d'avis tant qu'il en est", async () => {
    const f = await fixture()
    await book(f)
    const moderatorRow = await f.t.run(async (ctx) => await ctx.db.insert("pageSignatories", { networkId: f.networkId, pageId: f.pageId, personId: f.requester.personId, role: "moderator", acceptedAt: NOW, createdAt: NOW, updatedAt: NOW }))
    expect(await codeOf(f.requester.as.mutation(RV.createReview, publishArgs(f)))).toBe("review_own_page")
    await f.t.run(async (ctx) => { await ctx.db.delete(moderatorRow) })
    expect((await f.requester.as.mutation(RV.createReview, publishArgs(f))).created).toBe(true)
  })

  it("unicité transactionnelle, rejeu identique, conflit différent et version concurrente", async () => {
    const f = await fixture()
    await book(f)
    const outcomes = await Promise.all([
      f.requester.as.mutation(RV.createReview, publishArgs(f)),
      f.requester.as.mutation(RV.createReview, { ...publishArgs(f), body: `  ${BODY}  ` }),
    ])
    expect(outcomes[0]?.reviewId).toBe(outcomes[1]?.reviewId)
    expect(outcomes.map((outcome) => outcome.created).sort()).toEqual([false, true])
    const reviewId = outcomes[0]!.reviewId
    expect(await codeOf(f.requester.as.mutation(RV.createReview, { ...publishArgs(f), rating: 5 }))).toBe("review_already_exists")
    // Les deux créations réussies ont consommé deux jetons sur trois ;
    // remplir le seau avant de vérifier le conflit de version, pas le débit.
    vi.setSystemTime(NOW + 2 * DAY + 2 * HOUR)
    const edits = await Promise.allSettled([
      f.requester.as.mutation(RV.updateReview, { networkId: f.networkId, reviewId, expectedVersion: 1, rating: 5, body: BODY }),
      f.requester.as.mutation(RV.updateReview, { networkId: f.networkId, reviewId, expectedVersion: 1, rating: 3, body: BODY }),
    ])
    expect(edits.filter((edit) => edit.status === "fulfilled")).toHaveLength(1)
    expect(await codeOf(f.requester.as.mutation(RV.updateReview, { networkId: f.networkId, reviewId, expectedVersion: 1, rating: 4, body: BODY }))).toBe("review_version_changed")
    expect(await f.t.run(async (ctx) => ctx.db.query("serviceReviews").take(5))).toHaveLength(1)
  })

  it("le seau review est admis par le constructeur sur chaque geste", async () => {
    const f = await fixture()
    await book(f)
    const { reviewId } = await f.requester.as.mutation(RV.createReview, publishArgs(f))
    await f.requester.as.mutation(RV.updateReview, { networkId: f.networkId, reviewId, expectedVersion: 1, rating: 5, body: BODY })
    await f.requester.as.mutation(RV.updateReview, { networkId: f.networkId, reviewId, expectedVersion: 2, rating: 4, body: BODY })
    expect(await codeOf(f.requester.as.mutation(RV.updateReview, { networkId: f.networkId, reviewId, expectedVersion: 3, rating: 3, body: BODY }))).toBe("rateLimited")
    expect((await f.t.run(async (ctx) => ctx.db.get(reviewId)))?.version).toBe(3)
  })

  it("retrait terminal permis au propriétaire en attente, sans édition ou recréation", async () => {
    const f = await fixture()
    await book(f)
    const { reviewId } = await f.requester.as.mutation(RV.createReview, publishArgs(f))
    await f.t.run(async (ctx) => {
      const row = await ctx.db.query("networkMemberships").withIndex("by_network_and_person", (q) => q.eq("networkId", f.networkId).eq("personId", f.requester.personId)).unique()
      if (!row) throw new Error("Adhésion absente")
      await ctx.db.patch(row._id, { status: "en_attente" })
    })
    expect(await f.requester.as.mutation(RV.withdrawReview, { networkId: f.networkId, reviewId, expectedVersion: 1 })).toBeNull()
    expect((await list(f)).items).toEqual([])
    expect(await f.requester.as.query(RV.myReviewForRequest, { networkId: f.networkId, requestId: f.requestId })).toMatchObject({ canCreate: false, refusal: "review_withdrawn", review: { status: "withdrawn", version: 2, body: "", author: { displayName: null } } })
    await f.t.run(async (ctx) => {
      const row = await ctx.db.query("networkMemberships").withIndex("by_network_and_person", (q) => q.eq("networkId", f.networkId).eq("personId", f.requester.personId)).unique()
      if (row) await ctx.db.patch(row._id, { status: "declaree" })
    })
    expect(await codeOf(f.requester.as.mutation(RV.createReview, publishArgs(f)))).toBe("review_withdrawn")
    expect(await codeOf(f.requester.as.mutation(RV.updateReview, { networkId: f.networkId, reviewId, expectedVersion: 2, rating: 4, body: BODY }))).toBe("review_withdrawn")
  })

  it("avis pending privé y compris pour l'auteur et modérateur dans la liste publique ; removed non éditable", async () => {
    const f = await fixture()
    await book(f)
    await policy(f, "serviceReview")
    const { reviewId } = await f.requester.as.mutation(RV.createReview, publishArgs(f))
    expect((await list(f, f.requester.as)).items).toEqual([])
    await f.t.run(async (ctx) => {
      const row = await ctx.db.query("networkMemberships").withIndex("by_network_and_person", (q) => q.eq("networkId", f.networkId).eq("personId", f.outsider.personId)).unique()
      if (row) await ctx.db.patch(row._id, { role: "network_admin" })
    })
    expect((await list(f)).items).toEqual([])
    expect(await f.requester.as.query(RV.myReviewForRequest, { networkId: f.networkId, requestId: f.requestId })).toMatchObject({ review: { moderation: "pending_review", body: BODY } })
    expect(await codeOf(f.pro.as.mutation(RV.replyToReview, { networkId: f.networkId, reviewId, expectedVersion: null, body: "Merci." }))).toBe("notFound")
    await state(f, "serviceReview", reviewId, "removed")
    expect(await f.requester.as.query(RV.myReviewForRequest, { networkId: f.networkId, requestId: f.requestId })).toMatchObject({ review: { moderation: "removed", body: "", author: { displayName: null } } })
    expect(await codeOf(f.requester.as.mutation(RV.updateReview, { networkId: f.networkId, reviewId, expectedVersion: 1, rating: 4, body: BODY }))).toBe("review_not_published")
  })

  it("sans politique explicite la nouvelle surface reste pending, et le consentement est obligatoire", async () => {
    const f = await fixture()
    await book(f)
    expect(await codeOf(f.requester.as.mutation(RV.createReview, { ...publishArgs(f), consentToPublish: false }))).toBe("review_consent_required")
    expect(await codeOf(f.requester.as.mutation(RV.createReview, { ...publishArgs(f), rating: 4.5 }))).toBe("review_rating_invalid")
    await f.t.run(async (ctx) => {
      const row = await ctx.db.query("moderationPolicies").withIndex("by_network_surface", (q) => q.eq("networkId", f.networkId).eq("surface", "serviceReview")).unique()
      if (row) await ctx.db.delete(row._id)
    })
    await f.requester.as.mutation(RV.createReview, publishArgs(f))
    expect((await list(f, f.requester.as)).items).toEqual([])
    expect(await f.requester.as.query(RV.myReviewForRequest, { networkId: f.networkId, requestId: f.requestId })).toMatchObject({ review: { moderation: "pending_review" } })
  })

  it("réponse modérée indépendamment, signataire vivant et retrait terminal de la page", async () => {
    const f = await fixture()
    await book(f)
    const { reviewId } = await f.requester.as.mutation(RV.createReview, publishArgs(f))
    await policy(f, "serviceReviewReply")
    expect(await codeOf(f.requester.as.mutation(RV.replyToReview, { networkId: f.networkId, reviewId, expectedVersion: null, body: "Merci." }))).toBe("notFound")
    expect(await codeOf(f.outsider.as.mutation(RV.replyToReview, { networkId: f.networkId, reviewId, expectedVersion: null, body: "Merci." }))).toBe("notFound")
    await f.pro.as.mutation(RV.replyToReview, { networkId: f.networkId, reviewId, expectedVersion: null, body: "Merci pour ce retour." })
    const reply = await f.t.run(async (ctx) => ctx.db.query("serviceReviewReplies").withIndex("by_review", (q) => q.eq("reviewId", reviewId)).unique())
    if (!reply) throw new Error("Réponse absente")
    expect((await list(f)).items[0]).toMatchObject({ moderation: "published", reply: null })
    expect((await list(f, f.pro.as)).items[0]).toMatchObject({ canReply: true, reply: { moderation: "pending_review", canManage: true } })
    expect(await f.t.run(async (ctx) => ctx.db.query("moderationContentStates").withIndex("by_target", (q) => q.eq("targetKind", "serviceReviewReply").eq("targetId", reply._id)).unique())).toMatchObject({ ownerPageId: f.pageId })
    expect((await list(f, f.requester.as)).items[0]?.reply).toBeNull()
    expect((await f.requester.as.query(RV.myReviewForRequest, { networkId: f.networkId, requestId: f.requestId }))?.review?.reply).toBeNull()
    await state(f, "serviceReviewReply", reply._id, "published")
    expect((await list(f)).items[0]?.reply).toMatchObject({ body: "Merci pour ce retour.", version: 1 })
    await f.t.run(async (ctx) => { await ctx.db.patch(f.signatoryId, { acceptedAt: undefined }) })
    expect(await codeOf(f.pro.as.mutation(RV.withdrawReviewReply, { networkId: f.networkId, reviewId, expectedVersion: 1 }))).toBe("notFound")
    await f.t.run(async (ctx) => { await ctx.db.patch(f.signatoryId, { acceptedAt: Date.now() }) })
    await f.pro.as.mutation(RV.withdrawReviewReply, { networkId: f.networkId, reviewId, expectedVersion: 1 })
    expect((await list(f)).items[0]?.reply).toMatchObject({ body: "", status: "withdrawn", canManage: false })
    expect(await codeOf(f.pro.as.mutation(RV.replyToReview, { networkId: f.networkId, reviewId, expectedVersion: null, body: "Nouvelle réponse." }))).toBe("review_version_changed")
    expect(await codeOf(f.pro.as.mutation(RV.replyToReview, { networkId: f.networkId, reviewId, expectedVersion: 2, body: "Nouvelle réponse." }))).toBe("review_reply_unavailable")
    expect((await list(f)).items[0]?.canReply).toBe(false)
  })

  it("un signataire en attente peut retirer sa réponse mais n'est pas invité à l'éditer", async () => {
    const f = await fixture()
    await book(f)
    const { reviewId } = await f.requester.as.mutation(RV.createReview, publishArgs(f))
    await f.pro.as.mutation(RV.replyToReview, { networkId: f.networkId, reviewId, expectedVersion: null, body: "Merci pour votre retour." })
    await f.t.run(async (ctx) => {
      const membership = await ctx.db.query("networkMemberships").withIndex("by_network_and_person", (q) => q.eq("networkId", f.networkId).eq("personId", f.pro.personId)).unique()
      if (!membership) throw new Error("Adhésion absente")
      await ctx.db.patch(membership._id, { status: "en_attente" })
    })
    expect((await list(f, f.pro.as)).items[0]).toMatchObject({ canReply: false, reply: { canManage: true } })
    expect(await codeOf(f.pro.as.mutation(RV.replyToReview, { networkId: f.networkId, reviewId, expectedVersion: 1, body: "Merci à nouveau." }))).toBe("statusInsufficient")
    expect(await f.pro.as.mutation(RV.withdrawReviewReply, { networkId: f.networkId, reviewId, expectedVersion: 1 })).toBeNull()
    expect((await list(f, f.pro.as)).items[0]?.reply).toMatchObject({ body: "", status: "withdrawn", canManage: false })
  })

  it("raccord réel : seul l'admin réseau tiers prévisualise puis approuve un avis pending, sans contexte privé", async () => {
    const f = await fixture()
    const bookingId = await book(f)
    await policy(f, "serviceReview")
    const admin = await networkAdmin(f)
    const { reviewId } = await f.requester.as.mutation(RV.createReview, publishArgs(f))
    const target = { kind: "serviceReview" as const, id: reviewId }
    expect((await list(f, f.pro.as)).items).toEqual([])
    expect((await list(f, admin)).items).toEqual([])
    expect(await codeOf(f.pro.as.query(PREVIEW, { networkId: f.networkId, target }))).toBe("notFound")
    expect(await codeOf(f.requester.as.query(PREVIEW, { networkId: f.networkId, target }))).toBe("notFound")
    expect(await codeOf(f.pro.as.mutation(CASES.reviewContent, { networkId: f.networkId, target, approve: true, reason: "Avis conforme après examen." }))).toBe("notFound")
    const preview = await admin.query(PREVIEW, { networkId: f.networkId, target })
    expect(preview).toEqual({ kind: "serviceReview", available: true, title: null, body: BODY, media: [] })
    expect(preview.body?.length).toBeLessThanOrEqual(2_000)
    const serialized = JSON.stringify(preview)
    for (const privateValue of [f.requestId, bookingId, f.requester.personId, f.pro.personId, "requestId", "bookingId", "authorPersonId", "authUserId"]) {
      expect(serialized).not.toContain(privateValue)
    }
    await admin.mutation(CASES.reviewContent, { networkId: f.networkId, target, approve: true, reason: "Avis conforme après examen." })
    expect((await list(f, f.pro.as)).items).toEqual([expect.objectContaining({ reviewId, moderation: "published", body: BODY })])
    expect(await codeOf(admin.query(PREVIEW, { networkId: f.networkId, target }))).toBe("notFound")
  })

  it("raccord réel : signaler et retirer le vrai replyId ne retire jamais l'avis", async () => {
    const f = await fixture()
    await book(f)
    const admin = await networkAdmin(f)
    const { reviewId } = await f.requester.as.mutation(RV.createReview, publishArgs(f))
    await f.pro.as.mutation(RV.replyToReview, { networkId: f.networkId, reviewId, expectedVersion: null, body: "Merci pour ce retour détaillé." })
    const reply = (await list(f)).items[0]?.reply
    if (!reply) throw new Error("Réponse publique absente")
    const { reportId } = await f.requester.as.mutation(CASES.report, { networkId: f.networkId, target: { kind: "serviceReviewReply", id: reply.replyId }, reason: "harassment" })
    expect(await f.t.run(async (ctx) => ctx.db.get(reportId))).toMatchObject({ targetKind: "serviceReviewReply", target: { kind: "serviceReviewReply", id: reply.replyId } })
    expect(await codeOf(f.pro.as.query(PREVIEW, { networkId: f.networkId, reportId }))).toBe("notFound")
    expect(await admin.query(PREVIEW, { networkId: f.networkId, reportId })).toEqual({ kind: "serviceReviewReply", available: true, title: null, body: "Merci pour ce retour détaillé.", media: [] })
    expect(await admin.mutation(CASES.decide, {
      networkId: f.networkId, reportId, decision: "actioned", reason: "Réponse retirée après examen contradictoire.", sanctions: [{ kind: "removal" }],
    })).toEqual({ status: "actioned" })
    expect((await list(f)).items).toEqual([expect.objectContaining({ reviewId, moderation: "published", body: BODY, reply: null })])
    expect((await list(f, f.requester.as)).items).toEqual([expect.objectContaining({ reviewId, moderation: "published", reply: null })])
    expect(await f.t.run(async (ctx) => ctx.db.get(reviewId))).toMatchObject({ status: "active", version: 1 })
    expect(await f.t.run(async (ctx) => ctx.db.query("moderationContentStates").withIndex("by_target", (q) => q.eq("targetKind", "serviceReviewReply").eq("targetId", reply.replyId)).unique())).toMatchObject({ status: "removed" })
  })

  it("raccord réel : un signataire devenu admin ne peut approuver ni trancher sa propre réponse de page", async () => {
    const f = await fixture()
    await book(f)
    const { reviewId } = await f.requester.as.mutation(RV.createReview, publishArgs(f))
    await policy(f, "serviceReviewReply")
    await f.pro.as.mutation(RV.replyToReview, { networkId: f.networkId, reviewId, expectedVersion: null, body: "Merci pour ce retour détaillé." })
    const pending = (await list(f, f.pro.as)).items[0]?.reply
    if (!pending) throw new Error("Réponse en attente absente de la vue de la page")
    const target = { kind: "serviceReviewReply" as const, id: pending.replyId }
    const moderation = await f.t.run(async (ctx) => ctx.db.query("moderationContentStates").withIndex("by_target", (q) => q.eq("targetKind", target.kind).eq("targetId", target.id)).unique())
    expect(moderation).toMatchObject({ ownerPageId: f.pageId, status: "pending_review" })
    expect(moderation?.ownerPersonId).toBeUndefined()
    await f.t.run(async (ctx) => {
      const membership = await ctx.db.query("networkMemberships").withIndex("by_network_and_person", (q) => q.eq("networkId", f.networkId).eq("personId", f.pro.personId)).unique()
      if (!membership) throw new Error("Adhésion du signataire absente")
      await ctx.db.patch(membership._id, { role: "network_admin" })
    })
    const admin = await networkAdmin(f)
    // La promotion n'a pas révoqué sa signature : le conflit porte bien sur la page.
    expect((await list(f, f.pro.as)).items[0]?.reply).toMatchObject({ moderation: "pending_review", canManage: true })
    expect(await codeOf(f.pro.as.mutation(CASES.reviewContent, { networkId: f.networkId, target, approve: true, reason: "Approbation de ma propre réponse." }))).toBe("notFound")
    expect((await list(f, admin)).items[0]?.reply).toBeNull()
    expect(await admin.mutation(CASES.reviewContent, { networkId: f.networkId, target, approve: true, reason: "Réponse approuvée par un administrateur tiers." })).toBeNull()
    expect((await list(f, f.requester.as)).items[0]?.reply).toMatchObject({ replyId: pending.replyId, moderation: "published" })
    const { reportId } = await f.requester.as.mutation(CASES.report, { networkId: f.networkId, target, reason: "harassment" })
    expect(await codeOf(f.pro.as.mutation(CASES.decide, {
      networkId: f.networkId, reportId, decision: "actioned", reason: "Décision sur la réponse de ma page.", sanctions: [{ kind: "removal" }],
    }))).toBe("notFound")
    expect(await f.t.run(async (ctx) => ctx.db.get(reportId))).toMatchObject({ status: "open", target: { kind: "serviceReviewReply", id: pending.replyId } })
    expect((await list(f, admin)).items[0]?.reply).toMatchObject({ replyId: pending.replyId, moderation: "published" })
    expect(await admin.mutation(CASES.decide, {
      networkId: f.networkId, reportId, decision: "actioned", reason: "Retrait décidé par un administrateur tiers.", sanctions: [{ kind: "removal" }],
    })).toEqual({ status: "actioned" })
    expect(await f.t.run(async (ctx) => ctx.db.get(reportId))).toMatchObject({ status: "actioned", reviewedByPersonId: f.outsider.personId })
    expect((await list(f, admin)).items).toEqual([expect.objectContaining({ reviewId, moderation: "published", reply: null })])
  })

  it("raccord réel : une approbation tardive ne republie jamais un avis déjà retiré", async () => {
    const f = await fixture()
    await book(f)
    await policy(f, "serviceReview")
    const admin = await networkAdmin(f)
    const { reviewId } = await f.requester.as.mutation(RV.createReview, publishArgs(f))
    const target = { kind: "serviceReview" as const, id: reviewId }
    expect((await admin.query(PREVIEW, { networkId: f.networkId, target })).available).toBe(true)
    await f.requester.as.mutation(RV.withdrawReview, { networkId: f.networkId, reviewId, expectedVersion: 1 })
    expect(await admin.query(PREVIEW, { networkId: f.networkId, target })).toEqual({ kind: "serviceReview", available: false, title: null, body: null, media: [] })
    // La décision peut être refusée ou acquittée ; elle ne change jamais le retrait métier.
    const approvalCode = await codeOf(admin.mutation(CASES.reviewContent, { networkId: f.networkId, target, approve: true, reason: "Examen terminé après le retrait de l'auteur." }))
    expect([null, "notFound"]).toContain(approvalCode)
    expect(await f.t.run(async (ctx) => ctx.db.get(reviewId))).toMatchObject({ status: "withdrawn", version: 2, withdrawnAt: NOW + DAY + 2 * HOUR })
    expect((await list(f, admin)).items).toEqual([])
    expect((await list(f, f.pro.as)).items).toEqual([])
    expect(await f.requester.as.query(RV.myReviewForRequest, { networkId: f.networkId, requestId: f.requestId })).toMatchObject({ canCreate: false, refusal: "review_withdrawn", review: { status: "withdrawn", body: "", author: { displayName: null } } })
  })

  it("re-garde page, chaîne de preuve et blocage dans chaque lecture", async () => {
    const f = await fixture()
    const bookingId = await book(f)
    await f.requester.as.mutation(RV.createReview, publishArgs(f))
    await f.t.run(async (ctx) => { await ctx.db.patch(bookingId, { pageId: f.pageId, endAt: NOW + DAY + 3 * HOUR }) })
    expect((await list(f)).items).toEqual([])
    await f.t.run(async (ctx) => { await ctx.db.patch(bookingId, { endAt: NOW + DAY + 2 * HOUR }) })
    await f.t.run(async (ctx) => { await ctx.db.patch(f.offerId, { status: "paused" }) })
    expect(await codeOf(list(f))).toBe("notFound")
    expect(await f.requester.as.query(RV.myReviewForRequest, { networkId: f.networkId, requestId: f.requestId })).toMatchObject({ review: { body: BODY } })
    await f.t.run(async (ctx) => { await ctx.db.patch(f.offerId, { status: "active" }) })
    await f.outsider.as.mutation(api.modules.graph.connections.blockPerson, { networkId: f.networkId, targetPersonId: f.requester.personId })
    expect((await list(f)).items).toEqual([])
    await f.t.run(async (ctx) => { await ctx.db.patch(f.pageId, { status: "inactive" }) })
    expect(await codeOf(list(f))).toBe("notFound")
  })

  it("session révoquée, anonymat et suspension racine ne lisent et n'écrivent pas", async () => {
    const f = await fixture()
    await book(f)
    expect(await codeOf(f.t.query(RV.offerReviews, { networkId: f.networkId, offerId: f.offerId, paginationOpts: PAGE }))).toBe("unauthenticated")
    const identity = await f.outsider.as.run(async (ctx) => ctx.auth.getUserIdentity())
    if (!identity || typeof identity.sessionId !== "string") throw new Error("Session absente")
    await f.t.mutation(components.betterAuth.adapter.deleteOne, { input: { model: "session", where: [{ field: "_id", value: identity.sessionId }] } })
    expect(await codeOf(list(f))).toBe("unauthenticated")
    await f.t.run(async (ctx) => {
      const rootMembership = await ctx.db.query("networkMemberships").withIndex("by_network_and_person", (q) => q.eq("networkId", f.root).eq("personId", f.requester.personId)).unique()
      if (!rootMembership) throw new Error("Adhésion racine absente")
      await ctx.db.patch(rootMembership._id, { status: "suspendue" })
    })
    expect(await codeOf(f.requester.as.mutation(RV.createReview, publishArgs(f)))).toBe("membershipSuspended")
    // La session de sept jours reste la même : le harnais ne la recrée pas après expiration.
    vi.setSystemTime(NOW + 8 * DAY)
    expect(await codeOf(list(f, f.pro.as))).toBe("unauthenticated")
  })
})
