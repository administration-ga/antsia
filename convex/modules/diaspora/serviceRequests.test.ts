// @vitest-environment edge-runtime
/** Demandes de service DIASPORALE (DG-014/015) : vraies sessions, gardes, versions, créneaux, échéances. */
import { engineErrorAppRule, engineErrorCode } from "@antsia/social-contracts/errors"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { api, internal } from "../../_generated/api"
import type { Doc, Id } from "../../_generated/dataModel"
import { SEED_CONFIRMATION } from "../../seeds/foundations"
import { createTestSession, testConvex } from "../../test.setup"

type T = ReturnType<typeof testConvex>
const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
/** Dimanche 18 octobre 2026, 10 h UTC : une semaine avant le passage à l'heure d'hiver en Europe. */
const NOW = Date.UTC(2026, 9, 18, 10)
/** Échéance des sessions de test : au-delà du plus long saut d'horloge (quinze jours) ; la session automatique du harnais ne dure que sept jours. */
const SESSION_END = NOW + 30 * DAY
const SR = api.modules.diaspora.serviceRequests
const KEY = "2b4a7a0e-6a52-4c8e-9a52-7f1f0b6c2d11"
const OTHER_KEY = "9c1d2e3f-4a5b-4c6d-8e7f-0a1b2c3d4e5f"
const NEED = "Tresses africaines pour un mariage, cheveux mi-longs."
const PAGE_OPTS = { numItems: 20, cursor: null }

beforeEach(() => {
  vi.stubEnv("CONVEX_CLOUD_URL", "http://127.0.0.1:3210")
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

/** Un membre déclaré à identité forte (IDN loa 2) : seau de débit ordinaire, pas renforcé ; sa session explicite survit aux sauts d'horloge. */
async function member(t: T, networkId: Id<"networks">, handle: string, displayName = handle) {
  const subject = `auth-${handle}`
  const sessionId = await createTestSession(t, subject, SESSION_END)
  const as = t.withIdentity({ subject, sessionId })
  const personId = await as.mutation(api.modules.people.persons.ensureMyPerson, {})
  await as.mutation(api.modules.people.consents.recordConsent, { purpose: "social_profile", origin: "onboarding" })
  await as.mutation(api.modules.people.profile.publishMyProfile, { handle, displayName })
  await t.run(async (ctx) => {
    await ctx.db.insert("identityLinks", { personId, provider: "idn", subject: `idn-${personId}`, loa: 2, nationality: "GA", linkedAt: NOW })
  })
  await as.mutation(api.modules.diaspora.membership.joinDiasporale, { networkId, facet: { countryOfResidence: "FR", city: "Paris" } })
  return { as, personId }
}

async function page(t: T, networkId: Id<"networks">, signatoryPersonId: Id<"persons">, handle = "salon-test") {
  return await t.run(async (ctx) => {
    const pageId = await ctx.db.insert("pages", {
      networkId, handle, name: "Salon de test", ownerKind: "company", trust: "community", trustRank: 0,
      visibility: "network", onRoot: false, status: "active", searchText: "salon de test", createdAt: NOW, updatedAt: NOW,
    })
    await ctx.db.insert("pageSignatories", { networkId, pageId, personId: signatoryPersonId, role: "admin", acceptedAt: NOW, createdAt: NOW, updatedAt: NOW })
    return pageId
  })
}

/** Une offre selon le contrat `serviceOffers` du catalogue (version 3 lue par le demandeur). */
async function offer(t: T, networkId: Id<"networks">, pageId: Id<"pages">, overrides: Partial<Pick<Doc<"serviceOffers">, "status" | "version" | "title">> = {}) {
  return await t.run(async (ctx) => ctx.db.insert("serviceOffers", {
    networkId, pageId, title: "Tresses africaines", description: "Tresses sur cheveux naturels.", category: "beauty",
    country: "FR", city: "Paris", cityKey: "paris", delivery: "onsite", languages: ["fr"], durationMinutes: 90,
    pricing: { mode: "from", amountMinor: 4500, currency: "EUR" }, status: "active", searchText: "tresses africaines paris",
    version: 3, createdAt: NOW, updatedAt: NOW, ...overrides,
  }))
}

async function fixture() {
  const t = testConvex()
  const { root } = await t.mutation(internal.seeds.foundations.run, { confirmNonProduction: SEED_CONFIRMATION })
  const { network: networkId } = await t.mutation(internal.modules.diaspora.seed.run, { confirmNonProduction: SEED_CONFIRMATION })
  const requester = await member(t, networkId, "awa", "Awa OGOOUÉ")
  const pro = await member(t, networkId, "nadia")
  const outsider = await member(t, networkId, "tiers")
  const pageId = await page(t, networkId, pro.personId)
  const offerId = await offer(t, networkId, pageId)
  return { t, root, networkId, requester, pro, outsider, pageId, offerId }
}

type Fixture = Awaited<ReturnType<typeof fixture>>

function sendArgs(f: Fixture, overrides: Partial<{ offerId: Id<"serviceOffers">; offerVersion: number; need: string; windows: { startAt: number; endAt: number }[]; timeZone: string; shareIdentityWithPage: boolean; idempotencyKey: string }> = {}) {
  return {
    networkId: f.networkId, offerId: f.offerId, offerVersion: 3, need: NEED,
    windows: [{ startAt: NOW + DAY, endAt: NOW + DAY + 4 * HOUR }], timeZone: "Europe/Paris",
    shareIdentityWithPage: true, idempotencyKey: KEY, ...overrides,
  }
}

function proposalArgs(f: Fixture, requestId: Id<"serviceRequests">, overrides: Partial<{ expectedVersion: number; amountMinor: number; currency: string; durationMinutes: number; startAt: number; timeZone: string; location: { mode: "remote" } | { mode: "onsite"; area: string }; details: string; cancellationTerms: string; expiresAt: number }> = {}) {
  return {
    networkId: f.networkId, requestId, expectedVersion: 0, amountMinor: 4500, currency: "EUR", durationMinutes: 90,
    startAt: NOW + DAY + HOUR, timeZone: "Europe/Paris", location: { mode: "onsite" as const, area: "Paris 11e" },
    details: "Tresses, mèches fournies.", cancellationTerms: "Annulation libre jusqu'à la veille.", expiresAt: NOW + 12 * HOUR, ...overrides,
  }
}

/** Le code fermé d'un refus : celui de la tranche s'il existe, sinon celui du moteur. */
async function codeOf(promise: Promise<unknown>) {
  try { await promise } catch (error) { return engineErrorAppRule(error)?.appRule ?? engineErrorCode(error) }
  return null
}

async function rows(t: T) {
  return await t.run(async (ctx) => ({
    requests: await ctx.db.query("serviceRequests").take(50),
    proposals: await ctx.db.query("serviceProposals").take(50),
    bookings: await ctx.db.query("serviceBookings").take(50),
  }))
}

async function socialTrace(t: T) {
  return await t.run(async (ctx) => ({
    notifications: (await ctx.db.query("notifications").take(100)).length,
    connections: (await ctx.db.query("connections").take(100)).length,
    follows: (await ctx.db.query("follows").take(100)).length,
  }))
}

async function setMembership(t: T, networkId: Id<"networks">, personId: Id<"persons">, status: "suspendue" | "declaree" | "en_attente") {
  await t.run(async (ctx) => {
    const row = await ctx.db.query("networkMemberships")
      .withIndex("by_network_and_person", (q) => q.eq("networkId", networkId).eq("personId", personId)).unique()
    if (!row) throw new Error("Adhésion de fixture absente")
    await ctx.db.patch(row._id, { status })
  })
}

describe("demandes de service DIASPORALE", () => {
  it("parcours complet : envoi, proposition, accord, réalisation constatée après le début, sans avis ni relation créés", async () => {
    const f = await fixture()
    const before = await socialTrace(f.t)
    const sent = await f.requester.as.mutation(SR.createServiceRequest, sendArgs(f, { need: `  ${NEED}  ` }))
    expect(sent.created).toBe(true)
    const inbox = await f.pro.as.query(SR.pageServiceRequests, { networkId: f.networkId, pageId: f.pageId, paginationOpts: PAGE_OPTS })
    expect(inbox.page).toHaveLength(1)
    expect(inbox.page[0]).toMatchObject({
      requestId: sent.requestId, status: "sent", offerTitle: "Tresses africaines", offerVersion: 3,
      requester: { displayName: "Awa OGOOUÉ", handle: "awa" }, page: { pageId: f.pageId, handle: "salon-test", name: "Salon de test" },
      deadlineAt: NOW + DAY + 4 * HOUR, currentProposal: null, booking: null,
    })
    const pageView = await f.pro.as.query(SR.getServiceRequest, { networkId: f.networkId, requestId: sent.requestId })
    expect(pageView).toMatchObject({ viewerRole: "page", need: NEED, actions: ["propose", "refuse"] })

    expect(await f.pro.as.mutation(SR.proposeService, proposalArgs(f, sent.requestId))).toEqual({ version: 1 })
    const proposed = await f.requester.as.query(SR.getServiceRequest, { networkId: f.networkId, requestId: sent.requestId })
    expect(proposed).toMatchObject({
      viewerRole: "requester", status: "proposed", requester: null, deadlineAt: NOW + 12 * HOUR,
      currentProposal: { version: 1, amountMinor: 4500, currency: "EUR", startAt: NOW + DAY + HOUR, endAt: NOW + DAY + HOUR + 90 * MINUTE },
      actions: ["cancel", "accept"],
    })
    expect(proposed?.proposals).toEqual([expect.objectContaining({ version: 1, state: "current", location: { mode: "onsite", area: "Paris 11e" }, durationMinutes: 90 })])
    expect(JSON.stringify(proposed)).not.toContain(f.pro.personId)

    const { bookingId } = await f.requester.as.mutation(SR.acceptServiceProposal, { networkId: f.networkId, requestId: sent.requestId, expectedProposalVersion: 1 })
    expect(await f.t.run(async (ctx) => ctx.db.get(bookingId))).toMatchObject({ status: "confirmed", startAt: NOW + DAY + HOUR, endAt: NOW + DAY + HOUR + 90 * MINUTE, timeZone: "Europe/Paris" })
    expect(await codeOf(f.pro.as.mutation(SR.completeServiceBooking, { networkId: f.networkId, requestId: sent.requestId }))).toBe("booking_not_started")
    expect(await codeOf(f.pro.as.mutation(SR.markServiceNoShow, { networkId: f.networkId, requestId: sent.requestId }))).toBe("booking_not_started")

    vi.setSystemTime(NOW + DAY + HOUR)
    expect((await f.pro.as.query(SR.getServiceRequest, { networkId: f.networkId, requestId: sent.requestId }))?.actions).toEqual(["complete", "no_show"])
    expect(await f.pro.as.mutation(SR.completeServiceBooking, { networkId: f.networkId, requestId: sent.requestId })).toBeNull()
    const done = await f.requester.as.query(SR.getServiceRequest, { networkId: f.networkId, requestId: sent.requestId })
    expect(done).toMatchObject({ status: "completed", closedBy: "page", actions: [], booking: { status: "completed" } })
    expect(done?.timeline.map((event) => event.status)).toEqual(["sent", "proposed", "confirmed", "completed"])
    const mine = await f.requester.as.query(SR.myServiceRequests, { networkId: f.networkId, paginationOpts: PAGE_OPTS })
    expect(mine.page.map((request) => [request.requestId, request.status])).toEqual([[sent.requestId, "completed"]])
    expect((await f.outsider.as.query(SR.myServiceRequests, { networkId: f.networkId, paginationOpts: PAGE_OPTS })).page).toEqual([])
    // Aucune relation ni abonnement créés d'office ; seuls s'ajoutent les quatre avis NEUTRES de la
    // mise en relation (demande reçue, proposition, accord, réalisation), par le rédacteur unique.
    expect(await socialTrace(f.t)).toEqual({ ...before, notifications: before.notifications + 4 })
  })

  it("R-G05 : un double envoi après une coupure rend la même demande ; un autre corps sous la même clé est un conflit", async () => {
    const f = await fixture()
    const first = await f.requester.as.mutation(SR.createServiceRequest, sendArgs(f))
    expect(await f.requester.as.mutation(SR.createServiceRequest, sendArgs(f, { need: `\n${NEED.replace(" ", "   ")}\n` }))).toEqual({ requestId: first.requestId, created: false })
    expect(await codeOf(f.requester.as.mutation(SR.createServiceRequest, sendArgs(f, { need: `${NEED} Merci.` })))).toBe("request_idempotency_conflict")
    expect(await codeOf(f.requester.as.mutation(SR.createServiceRequest, sendArgs(f, { idempotencyKey: OTHER_KEY })))).toBe("request_already_open")
    // Le rejeu ne dépend ni de l'heure ni de l'état de l'offre : la demande créée reste la réponse.
    await f.t.run(async (ctx) => { await ctx.db.patch(f.offerId, { status: "paused" }) })
    vi.setSystemTime(NOW + DAY + HOUR)
    expect(await f.requester.as.mutation(SR.createServiceRequest, sendArgs(f))).toEqual({ requestId: first.requestId, created: false })
    expect((await rows(f.t)).requests).toHaveLength(1)
    expect(await codeOf(f.requester.as.mutation(SR.createServiceRequest, sendArgs(f, { idempotencyKey: "court" })))).toBe("invalidArgument")
  })

  it("R-G06 : deux acceptations sur le dernier créneau, une seule réservation ; un créneau voisin reste possible", async () => {
    const f = await fixture()
    const other = await member(f.t, f.networkId, "yannick")
    const first = await f.requester.as.mutation(SR.createServiceRequest, sendArgs(f))
    const second = await other.as.mutation(SR.createServiceRequest, sendArgs(f, { idempotencyKey: OTHER_KEY }))
    await f.pro.as.mutation(SR.proposeService, proposalArgs(f, first.requestId))
    await f.pro.as.mutation(SR.proposeService, proposalArgs(f, second.requestId))
    const outcomes = await Promise.allSettled([
      f.requester.as.mutation(SR.acceptServiceProposal, { networkId: f.networkId, requestId: first.requestId, expectedProposalVersion: 1 }),
      other.as.mutation(SR.acceptServiceProposal, { networkId: f.networkId, requestId: second.requestId, expectedProposalVersion: 1 }),
    ])
    expect(outcomes.map((outcome) => outcome.status)).toEqual(["fulfilled", "rejected"])
    expect(await codeOf(other.as.mutation(SR.acceptServiceProposal, { networkId: f.networkId, requestId: second.requestId, expectedProposalVersion: 1 }))).toBe("booking_slot_unavailable")
    expect((await rows(f.t)).bookings).toHaveLength(1)
    expect((await other.as.query(SR.getServiceRequest, { networkId: f.networkId, requestId: second.requestId }))?.status).toBe("proposed")
    // Un créneau qui chevauche est refusé dès la proposition ; celui qui suit immédiatement passe.
    expect(await codeOf(f.pro.as.mutation(SR.proposeService, proposalArgs(f, second.requestId, { expectedVersion: 1, startAt: NOW + DAY + 2 * HOUR })))).toBe("booking_slot_unavailable")
    const adjacent = await f.pro.as.mutation(SR.proposeService, proposalArgs(f, second.requestId, { expectedVersion: 1, startAt: NOW + DAY + HOUR + 90 * MINUTE }))
    expect(adjacent).toEqual({ version: 2 })
    await other.as.mutation(SR.acceptServiceProposal, { networkId: f.networkId, requestId: second.requestId, expectedProposalVersion: 2 })
    expect((await rows(f.t)).bookings.map((booking) => booking.status)).toEqual(["confirmed", "confirmed"])
  })

  it("R-G07 : une proposition modifiée dans un second onglet refuse l'ancienne version, la nouvelle s'accepte explicitement", async () => {
    const f = await fixture()
    const { requestId } = await f.requester.as.mutation(SR.createServiceRequest, sendArgs(f))
    await f.pro.as.mutation(SR.proposeService, proposalArgs(f, requestId))
    expect(await f.pro.as.mutation(SR.proposeService, proposalArgs(f, requestId, { expectedVersion: 1, amountMinor: 5000 }))).toEqual({ version: 2 })
    expect(await codeOf(f.pro.as.mutation(SR.proposeService, proposalArgs(f, requestId, { expectedVersion: 1, amountMinor: 3000 })))).toBe("proposal_version_changed")
    expect(await codeOf(f.requester.as.mutation(SR.acceptServiceProposal, { networkId: f.networkId, requestId, expectedProposalVersion: 1 }))).toBe("proposal_version_changed")
    const view = await f.requester.as.query(SR.getServiceRequest, { networkId: f.networkId, requestId })
    expect(view?.currentProposal).toMatchObject({ version: 2, amountMinor: 5000 })
    expect(view?.proposals.map((proposal) => [proposal.version, proposal.state, proposal.amountMinor])).toEqual([[2, "current", 5000], [1, "superseded", 4500]])
    const { bookingId } = await f.requester.as.mutation(SR.acceptServiceProposal, { networkId: f.networkId, requestId, expectedProposalVersion: 2 })
    const booking = await f.t.run(async (ctx) => ctx.db.get(bookingId))
    const accepted = await f.t.run(async (ctx) => booking ? ctx.db.get(booking.proposalId) : null)
    expect(accepted).toMatchObject({ version: 2, amountMinor: 5000 })
    // Après l'accord, plus aucune nouvelle version : une modification exige un nouvel accord.
    expect(await codeOf(f.pro.as.mutation(SR.proposeService, proposalArgs(f, requestId, { expectedVersion: 2 })))).toBe("request_not_open")
  })

  it("R-G08 : un non-habilité, un rôle retiré, un signataire suspendu ou une page désactivée sont refusés sans rien écrire", async () => {
    const f = await fixture()
    const { requestId } = await f.requester.as.mutation(SR.createServiceRequest, sendArgs(f))
    const before = { rows: await rows(f.t), trace: await socialTrace(f.t) }
    const args = proposalArgs(f, requestId)
    expect(await codeOf(f.outsider.as.mutation(SR.proposeService, args))).toBe("notFound")
    expect(await codeOf(f.outsider.as.mutation(SR.refuseServiceRequest, { networkId: f.networkId, requestId }))).toBe("notFound")
    expect(await codeOf(f.outsider.as.mutation(SR.cancelServiceRequest, { networkId: f.networkId, requestId }))).toBe("notFound")
    expect(await codeOf(f.outsider.as.mutation(SR.acceptServiceProposal, { networkId: f.networkId, requestId, expectedProposalVersion: 0 }))).toBe("notFound")
    expect(await codeOf(f.outsider.as.query(SR.pageServiceRequests, { networkId: f.networkId, pageId: f.pageId, paginationOpts: PAGE_OPTS }))).toBe("notFound")
    expect(await f.outsider.as.query(SR.getServiceRequest, { networkId: f.networkId, requestId })).toBeNull()
    // Une invitation en attente ne donne aucun droit.
    await f.t.run(async (ctx) => {
      await ctx.db.insert("pageSignatories", { networkId: f.networkId, pageId: f.pageId, personId: f.outsider.personId, role: "signatory", createdAt: NOW, updatedAt: NOW })
    })
    expect(await codeOf(f.outsider.as.mutation(SR.proposeService, args))).toBe("notFound")
    // Le rôle retiré coupe aussitôt.
    const role = await f.t.run(async (ctx) => ctx.db.query("pageSignatories").withIndex("by_page_person", (q) => q.eq("pageId", f.pageId).eq("personId", f.pro.personId)).unique())
    await f.t.run(async (ctx) => { if (role) await ctx.db.patch(role._id, { acceptedAt: undefined }) })
    expect(await codeOf(f.pro.as.mutation(SR.proposeService, args))).toBe("notFound")
    expect(await f.pro.as.query(SR.getServiceRequest, { networkId: f.networkId, requestId })).toBeNull()
    await f.t.run(async (ctx) => { if (role) await ctx.db.patch(role._id, { acceptedAt: NOW }) })
    // Le signataire suspendu ne parle plus.
    await setMembership(f.t, f.networkId, f.pro.personId, "suspendue")
    expect(await codeOf(f.pro.as.mutation(SR.proposeService, args))).toBe("membershipSuspended")
    await setMembership(f.t, f.networkId, f.pro.personId, "declaree")
    // La page désactivée coupe ses gestes et sa boîte.
    await f.t.run(async (ctx) => { await ctx.db.patch(f.pageId, { status: "inactive" }) })
    expect(await codeOf(f.pro.as.mutation(SR.proposeService, args))).toBe("notFound")
    expect(await codeOf(f.pro.as.query(SR.pageServiceRequests, { networkId: f.networkId, pageId: f.pageId, paginationOpts: PAGE_OPTS }))).toBe("notFound")
    // Le demandeur garde sa demande et peut la retirer.
    expect((await f.requester.as.query(SR.getServiceRequest, { networkId: f.networkId, requestId }))).toMatchObject({ status: "sent", page: null })
    const after = await rows(f.t)
    expect({ rows: { ...after }, trace: await socialTrace(f.t) }).toEqual(before)
  })

  it("refuse un autre réseau, l'offre d'un autre réseau ou une offre inactive", async () => {
    const f = await fixture()
    expect(await codeOf(f.requester.as.mutation(SR.createServiceRequest, { ...sendArgs(f), networkId: f.root }))).toBe("notFound")
    expect(await codeOf(f.pro.as.query(SR.pageServiceRequests, { networkId: f.root, pageId: f.pageId, paginationOpts: PAGE_OPTS }))).toBe("notFound")
    expect(await codeOf(f.requester.as.query(SR.myServiceRequests, { networkId: f.root, paginationOpts: PAGE_OPTS }))).toBe("notFound")
    const rootPage = await f.t.run(async (ctx) => ctx.db.insert("pages", {
      networkId: f.root, handle: "salon-racine", name: "Salon racine", ownerKind: "company", trust: "community", trustRank: 0,
      visibility: "root", onRoot: true, status: "active", searchText: "salon racine", createdAt: NOW, updatedAt: NOW,
    }))
    const rootOffer = await offer(f.t, f.root, rootPage)
    expect(await codeOf(f.requester.as.mutation(SR.createServiceRequest, sendArgs(f, { offerId: rootOffer })))).toBe("notFound")
    const pausedOffer = await offer(f.t, f.networkId, f.pageId, { status: "paused" })
    expect(await codeOf(f.requester.as.mutation(SR.createServiceRequest, sendArgs(f, { offerId: pausedOffer })))).toBe("notFound")
    expect((await rows(f.t)).requests).toEqual([])
  })

  it("refuse le consentement absent, une version d'offre périmée, sa propre page, un besoin porteur de coordonnées et un membre en attente", async () => {
    const f = await fixture()
    expect(await codeOf(f.requester.as.mutation(SR.createServiceRequest, sendArgs(f, { shareIdentityWithPage: false })))).toBe("request_consent_required")
    expect(await codeOf(f.requester.as.mutation(SR.createServiceRequest, sendArgs(f, { offerVersion: 2 })))).toBe("request_offer_changed")
    expect(await codeOf(f.pro.as.mutation(SR.createServiceRequest, sendArgs(f)))).toBe("request_own_page")
    expect(await codeOf(f.requester.as.mutation(SR.createServiceRequest, sendArgs(f, { need: `${NEED} Appelez le 06 12 34 56 78.` })))).toBe("request_contact_forbidden")
    expect(await codeOf(f.requester.as.mutation(SR.createServiceRequest, sendArgs(f, { windows: [] })))).toBe("request_windows_required")
    expect(await codeOf(f.requester.as.mutation(SR.createServiceRequest, sendArgs(f, { windows: [{ startAt: NOW - HOUR, endAt: NOW + HOUR }] })))).toBe("request_window_past")
    await setMembership(f.t, f.networkId, f.outsider.personId, "en_attente")
    expect(await codeOf(f.outsider.as.mutation(SR.createServiceRequest, sendArgs(f)))).toBe("statusInsufficient")
    expect((await rows(f.t)).requests).toEqual([])
  })

  it("refus et annulations : la page décline avec motif, le demandeur retire, le rendez-vous s'annule avant le début avec motif seulement", async () => {
    const f = await fixture()
    const declined = await f.requester.as.mutation(SR.createServiceRequest, sendArgs(f))
    expect(await codeOf(f.pro.as.mutation(SR.cancelServiceRequest, { networkId: f.networkId, requestId: declined.requestId }))).toBe("request_action_forbidden")
    expect(await codeOf(f.requester.as.mutation(SR.acceptServiceProposal, { networkId: f.networkId, requestId: declined.requestId, expectedProposalVersion: 0 }))).toBe("request_not_open")
    await f.pro.as.mutation(SR.refuseServiceRequest, { networkId: f.networkId, requestId: declined.requestId, reason: " Complet  ce jour-là " })
    expect(await f.requester.as.query(SR.getServiceRequest, { networkId: f.networkId, requestId: declined.requestId })).toMatchObject({ status: "refused", closedBy: "page", closedReason: "Complet ce jour-là", actions: [] })
    expect(await codeOf(f.requester.as.mutation(SR.cancelServiceRequest, { networkId: f.networkId, requestId: declined.requestId }))).toBe("request_closed")

    const withdrawn = await f.requester.as.mutation(SR.createServiceRequest, sendArgs(f, { idempotencyKey: OTHER_KEY }))
    await f.requester.as.mutation(SR.cancelServiceRequest, { networkId: f.networkId, requestId: withdrawn.requestId })
    expect(await f.pro.as.query(SR.getServiceRequest, { networkId: f.networkId, requestId: withdrawn.requestId })).toMatchObject({ status: "cancelled", closedBy: "requester", closedReason: null })

    const booked = await f.requester.as.mutation(SR.createServiceRequest, sendArgs(f, { idempotencyKey: "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d" }))
    await f.pro.as.mutation(SR.proposeService, proposalArgs(f, booked.requestId))
    await f.requester.as.mutation(SR.acceptServiceProposal, { networkId: f.networkId, requestId: booked.requestId, expectedProposalVersion: 1 })
    expect(await codeOf(f.pro.as.mutation(SR.cancelServiceRequest, { networkId: f.networkId, requestId: booked.requestId }))).toBe("request_reason_required")
    await f.pro.as.mutation(SR.cancelServiceRequest, { networkId: f.networkId, requestId: booked.requestId, reason: "Salon fermé pour travaux" })
    const cancelled = await f.requester.as.query(SR.getServiceRequest, { networkId: f.networkId, requestId: booked.requestId })
    expect(cancelled).toMatchObject({ status: "cancelled", closedBy: "page", closedReason: "Salon fermé pour travaux", booking: { status: "cancelled" } })
    // Le créneau libéré se propose et s'accepte de nouveau ; après son début, il ne s'annule plus.
    const again = await f.requester.as.mutation(SR.createServiceRequest, sendArgs(f, { idempotencyKey: "b1c2d3e4-f5a6-4b7c-8d9e-0f1a2b3c4d5e" }))
    expect(await f.pro.as.mutation(SR.proposeService, proposalArgs(f, again.requestId))).toEqual({ version: 1 })
    await f.requester.as.mutation(SR.acceptServiceProposal, { networkId: f.networkId, requestId: again.requestId, expectedProposalVersion: 1 })
    vi.setSystemTime(NOW + DAY + HOUR)
    expect(await codeOf(f.requester.as.mutation(SR.cancelServiceRequest, { networkId: f.networkId, requestId: again.requestId, reason: "Empêchement" }))).toBe("booking_started")
    expect((await rows(f.t)).bookings.map((booking) => booking.status)).toEqual(["cancelled", "confirmed"])
  })

  it("expiration constatée à la lecture et à l'écriture, puis écrite par le passage d'expiration", async () => {
    const f = await fixture()
    const { requestId } = await f.requester.as.mutation(SR.createServiceRequest, sendArgs(f))
    vi.setSystemTime(NOW + DAY + 4 * HOUR)
    const expired = await f.requester.as.query(SR.getServiceRequest, { networkId: f.networkId, requestId })
    expect(expired).toMatchObject({ status: "expired", deadlineAt: null, actions: [] })
    expect(expired?.timeline.map((event) => [event.status, event.at])).toEqual([["sent", NOW], ["expired", NOW + DAY + 4 * HOUR]])
    expect(await codeOf(f.pro.as.mutation(SR.proposeService, proposalArgs(f, requestId, { startAt: NOW + 2 * DAY, expiresAt: NOW + 2 * DAY - HOUR })))).toBe("request_expired")
    expect(await codeOf(f.requester.as.mutation(SR.cancelServiceRequest, { networkId: f.networkId, requestId }))).toBe("request_expired")
    const sentFilter = await f.pro.as.query(SR.pageServiceRequests, { networkId: f.networkId, pageId: f.pageId, status: "sent", paginationOpts: PAGE_OPTS })
    expect(sentFilter.page).toEqual([])
    // Une demande échue n'empêche pas d'en envoyer une nouvelle.
    const fresh = await f.requester.as.mutation(SR.createServiceRequest, sendArgs(f, { idempotencyKey: OTHER_KEY, windows: [{ startAt: NOW + 2 * DAY, endAt: NOW + 2 * DAY + 2 * HOUR }] }))
    expect(fresh.created).toBe(true)
    expect(await f.t.mutation(internal.modules.diaspora.serviceRequests.expireDueServiceRequests, {})).toEqual({ expired: 1, hasMore: false })
    expect(await f.t.run(async (ctx) => ctx.db.get(requestId))).toMatchObject({ status: "expired", closedBy: "system", closedAt: NOW + DAY + 4 * HOUR })
    const expiredFilter = await f.pro.as.query(SR.pageServiceRequests, { networkId: f.networkId, pageId: f.pageId, status: "expired", paginationOpts: PAGE_OPTS })
    expect(expiredFilter.page.map((request) => request.requestId)).toEqual([requestId])

    // Une proposition échue : l'accord est refusé, la demande expire.
    await f.pro.as.mutation(SR.proposeService, proposalArgs(f, fresh.requestId, { startAt: NOW + 2 * DAY + HOUR, expiresAt: NOW + DAY + 6 * HOUR }))
    vi.setSystemTime(NOW + DAY + 6 * HOUR)
    expect(await codeOf(f.requester.as.mutation(SR.acceptServiceProposal, { networkId: f.networkId, requestId: fresh.requestId, expectedProposalVersion: 1 }))).toBe("request_expired")
    expect((await f.requester.as.query(SR.getServiceRequest, { networkId: f.networkId, requestId: fresh.requestId }))?.status).toBe("expired")
    expect(await f.t.mutation(internal.modules.diaspora.serviceRequests.expireDueServiceRequests, { limit: 1 })).toEqual({ expired: 1, hasMore: false })
    expect((await rows(f.t)).bookings).toEqual([])
  })

  it("R-G21 : fuseaux et changement d'heure, l'instant exact et le fuseau canonique sont conservés", async () => {
    const f = await fixture()
    // 18 h à Paris le 24 octobre (UTC+2), puis le 26 octobre après le passage à l'heure d'hiver (UTC+1).
    const windows = [{ startAt: Date.UTC(2026, 9, 26, 17), endAt: Date.UTC(2026, 9, 26, 19) }, { startAt: Date.UTC(2026, 9, 24, 16), endAt: Date.UTC(2026, 9, 24, 18) }]
    const { requestId } = await f.requester.as.mutation(SR.createServiceRequest, sendArgs(f, { windows, timeZone: " Europe/Paris " }))
    const stored = await f.t.run(async (ctx) => ctx.db.get(requestId))
    expect(stored).toMatchObject({ timeZone: "Europe/Paris", windows: [windows[1], windows[0]] })
    // Une proposition pensée à Montréal, après le passage nord-américain (1er novembre).
    const startAt = Date.UTC(2026, 10, 2, 14, 15)
    await f.pro.as.mutation(SR.proposeService, proposalArgs(f, requestId, { startAt, timeZone: "America/Toronto", durationMinutes: 45, expiresAt: NOW + 3 * DAY }))
    const view = await f.requester.as.query(SR.getServiceRequest, { networkId: f.networkId, requestId })
    expect(view?.currentProposal).toMatchObject({ startAt, endAt: startAt + 45 * MINUTE, timeZone: "America/Toronto" })
    expect(view?.windows).toEqual([windows[1], windows[0]])
    expect(await codeOf(f.pro.as.mutation(SR.proposeService, proposalArgs(f, requestId, { expectedVersion: 1, timeZone: "US/Eastern", startAt, expiresAt: NOW + 3 * DAY })))).toBeNull()
    expect((await f.requester.as.query(SR.getServiceRequest, { networkId: f.networkId, requestId }))?.currentProposal?.timeZone).toBe("America/New_York")
    for (const timeZone of ["Mars/Olympus", "+02:00", ""]) {
      expect(await codeOf(f.pro.as.mutation(SR.proposeService, proposalArgs(f, requestId, { expectedVersion: 2, timeZone, startAt, expiresAt: NOW + 3 * DAY })))).toBe("request_time_zone_invalid")
    }
  })
})

describe("contestation d'une absence (DG-015)", () => {
  /** Une demande proposée, acceptée, puis l'absence constatée par la page après le début. */
  async function noShow() {
    const f = await fixture()
    const sent = await f.requester.as.mutation(SR.createServiceRequest, sendArgs(f))
    await f.pro.as.mutation(SR.proposeService, proposalArgs(f, sent.requestId))
    await f.requester.as.mutation(SR.acceptServiceProposal, { networkId: f.networkId, requestId: sent.requestId, expectedProposalVersion: 1 })
    vi.setSystemTime(NOW + DAY + HOUR)
    await f.pro.as.mutation(SR.markServiceNoShow, { networkId: f.networkId, requestId: sent.requestId })
    return { ...f, requestId: sent.requestId }
  }
  const contest = (f: Awaited<ReturnType<typeof noShow>>, reason: string) => ({ networkId: f.networkId, requestId: f.requestId, reason })
  const REASON = "J'étais devant le salon à 11 h, il était fermé."

  it("la personne qui demande conteste une fois, avec un motif ; l'état reste « absence », lisible des deux côtés", async () => {
    const f = await noShow()
    expect(await f.requester.as.query(SR.getServiceRequest, { networkId: f.networkId, requestId: f.requestId })).toMatchObject({ status: "no_show", noShowContest: null, canContestNoShow: true })
    expect((await f.pro.as.query(SR.getServiceRequest, { networkId: f.networkId, requestId: f.requestId }))?.canContestNoShow).toBe(false)

    expect(await codeOf(f.requester.as.mutation(SR.contestServiceNoShow, contest(f, "   ")))).toBe("request_reason_required")
    expect(await codeOf(f.requester.as.mutation(SR.contestServiceNoShow, contest(f, "Appelez-moi au 06 12 34 56 78")))).toBe("request_contact_forbidden")
    expect(await f.requester.as.mutation(SR.contestServiceNoShow, contest(f, `  ${REASON}  `))).toEqual({ contestedAt: NOW + DAY + HOUR, created: true })
    // Rejouée, même avec un autre motif : la première contestation reste la seule.
    expect(await f.requester.as.mutation(SR.contestServiceNoShow, contest(f, "Un autre motif"))).toEqual({ contestedAt: NOW + DAY + HOUR, created: false })

    expect(await f.pro.as.query(SR.getServiceRequest, { networkId: f.networkId, requestId: f.requestId })).toMatchObject({
      status: "no_show", closedBy: "page", noShowContest: { at: NOW + DAY + HOUR, reason: REASON }, canContestNoShow: false,
    })
    expect((await f.requester.as.query(SR.getServiceRequest, { networkId: f.networkId, requestId: f.requestId }))?.canContestNoShow).toBe(false)
    // La page ne conteste pas son propre constat ; un tiers ne voit rien.
    expect(await codeOf(f.pro.as.mutation(SR.contestServiceNoShow, contest(f, REASON)))).toBe("notFound")
    expect(await codeOf(f.outsider.as.mutation(SR.contestServiceNoShow, contest(f, REASON)))).toBe("notFound")
  })

  it("le délai est de quatorze jours après le constat", async () => {
    const f = await noShow()
    vi.setSystemTime(NOW + DAY + HOUR + 14 * DAY + 1)
    expect(await codeOf(f.requester.as.mutation(SR.contestServiceNoShow, contest(f, REASON)))).toBe("request_contest_window_closed")
    expect((await f.requester.as.query(SR.getServiceRequest, { networkId: f.networkId, requestId: f.requestId }))?.canContestNoShow).toBe(false)
  })

  it("seule une absence constatée se conteste", async () => {
    const f = await fixture()
    const sent = await f.requester.as.mutation(SR.createServiceRequest, sendArgs(f))
    expect(await codeOf(f.requester.as.mutation(SR.contestServiceNoShow, { networkId: f.networkId, requestId: sent.requestId, reason: REASON }))).toBe("request_contest_unavailable")
  })
})

describe("proposition préremplie depuis l'offre (SV-04)", () => {
  it("l'équipe lit le tarif, la durée, le mode, la ville et les réglages de l'offre ; le demandeur n'en lit rien ; rien n'est écrit", async () => {
    const f = await fixture()
    const settings = { timeZone: "Europe/Paris", location: { mode: "onsite" as const, area: "Paris 11e" }, cancellationTerms: "Annulation libre jusqu'à la veille." }
    await f.t.run(async (ctx) => { await ctx.db.patch(f.offerId, { providerSettings: settings }) })
    const { requestId } = await f.requester.as.mutation(SR.createServiceRequest, sendArgs(f))
    const pageView = await f.pro.as.query(SR.getServiceRequest, { networkId: f.networkId, requestId })
    expect(pageView?.proposalPrefill).toEqual({ pricing: { mode: "from", amountMinor: 4500, currency: "EUR" }, durationMinutes: 90, delivery: "onsite", city: "Paris", settings })
    expect((await f.requester.as.query(SR.getServiceRequest, { networkId: f.networkId, requestId }))?.proposalPrefill).toBeNull()
    // La lecture ne propose rien : aucune proposition sans le geste explicite de l'équipe.
    expect((await rows(f.t)).proposals).toEqual([])
  })

  it("une offre sur devis ne reprend aucun montant ; sans réglages, chaque champ reste vide", async () => {
    const f = await fixture()
    await f.t.run(async (ctx) => { await ctx.db.patch(f.offerId, { pricing: { mode: "quote" }, durationMinutes: undefined, delivery: "remote" }) })
    const { requestId } = await f.requester.as.mutation(SR.createServiceRequest, sendArgs(f))
    expect((await f.pro.as.query(SR.getServiceRequest, { networkId: f.networkId, requestId }))?.proposalPrefill).toEqual({
      pricing: { mode: "quote" }, durationMinutes: null, delivery: "remote", city: "Paris",
      settings: { timeZone: null, location: null, cancellationTerms: null },
    })
  })
})
