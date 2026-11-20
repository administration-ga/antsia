// @vitest-environment edge-runtime
/**
 * Avis de mise en relation DIASPORA.GA (DG-010, DG-015, DG-016) — vraies sessions, porte unique.
 * Chaque geste écrit le bon avis au bon destinataire, neutre et sans acteur ; un rejeu n'empile
 * rien ; rôle retiré, blocage, suspension, sortie ou soi-même : rien n'est écrit, et une ligne
 * déjà écrite ne se présente plus ; aucun contenu dans la ligne, la cloche ni la file de livraison.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { api, internal } from "../../_generated/api"
import type { Doc, Id } from "../../_generated/dataModel"
import type { MutationCtx } from "../../_generated/server"
import { SEED_CONFIRMATION } from "../../seeds/foundations"
import { openNetworkFeatures, testConvex } from "../../test.setup"
import { notifyPerson } from "../notifications/notify"
import { notificationStillVisible, pushAllowed } from "../notifications/policy"
import { noticeServicePageGesture, SERVICE_TEAM_NOTICE_MAX } from "./serviceNotifications"

type T = ReturnType<typeof testConvex>
type Member = Awaited<ReturnType<typeof member>>
const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const NOW = Date.UTC(2026, 9, 18, 10)
const SR = api.modules.diaspora.serviceRequests
const A = api.modules.diaspora.associations
const RV = api.modules.diaspora.serviceReviews
const B = api.modules.notifications.bell
const KEY = "2b4a7a0e-6a52-4c8e-9a52-7f1f0b6c2d11"
const OTHER_KEY = "9c1d2e3f-4a5b-4c6d-8e7f-0a1b2c3d4e5f"
const THIRD_KEY = "5e6f7a8b-9c0d-4e1f-8a2b-3c4d5e6f7a8b"
const FOURTH_KEY = "0f1e2d3c-4b5a-4968-8776-655443322110"
const NEED = "Tresses africaines pour un mariage, cheveux mi-longs."
const DETAILS = "Tresses, mèches fournies."
const AREA = "Paris 11e"
const REVIEW_BODY = "Accueil ponctuel et prestation conforme à la proposition."
const PAGE = { numItems: 50, cursor: null }

beforeEach(() => {
  vi.stubEnv("CONVEX_CLOUD_URL", "http://127.0.0.1:3210")
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

/** Un membre déclaré de DIASPORA.GA à identité forte (IDN loa 2), au profil publié. */
async function member(t: T, networkId: Id<"networks">, handle: string, displayName: string) {
  const as = t.withIdentity({ subject: `auth-${handle}` })
  const personId = await as.mutation(api.modules.people.persons.ensureMyPerson, {})
  await as.mutation(api.modules.people.consents.recordConsent, { purpose: "social_profile", origin: "onboarding" })
  await as.mutation(api.modules.people.profile.publishMyProfile, { handle, displayName })
  await t.run(async (ctx) => {
    await ctx.db.insert("identityLinks", { personId, provider: "idn", subject: `idn-${personId}`, loa: 2, nationality: "GA", linkedAt: NOW })
  })
  await as.mutation(api.modules.diaspora.membership.joinDiasporaGa, { networkId, facet: { countryOfResidence: "FR", city: "Paris" } })
  return { as, personId }
}

/** Une page d'entreprise : Nadia l'administre, Yao la signe ; une offre active (version 3). */
async function fixture() {
  const t = testConvex()
  await t.mutation(internal.seeds.foundations.run, { confirmNonProduction: SEED_CONFIRMATION })
  const { network: networkId } = await t.mutation(internal.modules.diaspora.seed.run, { confirmNonProduction: SEED_CONFIRMATION })
  await openNetworkFeatures(t, networkId)
  const requester = await member(t, networkId, "awa", "Awa OGOOUÉ")
  const pro = await member(t, networkId, "nadia", "Nadia NDONG")
  const colleague = await member(t, networkId, "yao", "Yao MBA")
  const outsider = await member(t, networkId, "tiers", "Jean MOUSSAVOU")
  const { pageId, offerId } = await t.run(async (ctx) => {
    const pageId = await ctx.db.insert("pages", {
      networkId, handle: "salon-test", name: "Salon de test", ownerKind: "company", trust: "community", trustRank: 0,
      visibility: "network", onRoot: false, status: "active", searchText: "salon de test", createdAt: NOW, updatedAt: NOW,
    })
    await ctx.db.insert("pageSignatories", { networkId, pageId, personId: pro.personId, role: "admin", acceptedAt: NOW, createdAt: NOW, updatedAt: NOW })
    await ctx.db.insert("pageSignatories", { networkId, pageId, personId: colleague.personId, role: "signatory", acceptedAt: NOW, createdAt: NOW, updatedAt: NOW })
    const offerId = await ctx.db.insert("serviceOffers", {
      networkId, pageId, title: "Tresses africaines", description: "Tresses sur cheveux naturels.", category: "beauty",
      country: "FR", city: "Paris", cityKey: "paris", delivery: "onsite", languages: ["fr"], durationMinutes: 90,
      pricing: { mode: "from", amountMinor: 4500, currency: "EUR" }, status: "active", searchText: "tresses africaines paris",
      version: 3, createdAt: NOW, updatedAt: NOW,
    })
    return { pageId, offerId }
  })
  return { t, networkId, requester, pro, colleague, outsider, pageId, offerId }
}

type Fixture = Awaited<ReturnType<typeof fixture>>

function sendArgs(f: Fixture, overrides: Partial<{ idempotencyKey: string }> = {}) {
  return {
    networkId: f.networkId, offerId: f.offerId, offerVersion: 3, need: NEED,
    windows: [{ startAt: NOW + DAY, endAt: NOW + DAY + 4 * HOUR }], timeZone: "Europe/Paris",
    shareIdentityWithPage: true, idempotencyKey: KEY, ...overrides,
  }
}

function proposalArgs(f: Fixture, requestId: Id<"serviceRequests">, overrides: Partial<{ expectedVersion: number; amountMinor: number; expiresAt: number }> = {}) {
  return {
    networkId: f.networkId, requestId, expectedVersion: 0, amountMinor: 4500, currency: "EUR", durationMinutes: 90,
    startAt: NOW + DAY + HOUR, timeZone: "Europe/Paris", location: { mode: "onsite" as const, area: AREA },
    details: DETAILS, cancellationTerms: "Annulation libre jusqu'à la veille.", expiresAt: NOW + 12 * HOUR, ...overrides,
  }
}

async function rowsFor(f: Fixture, who: { personId: Id<"persons"> }): Promise<Doc<"notifications">[]> {
  return await f.t.run(async (ctx) => await ctx.db
    .query("notifications")
    .withIndex("by_network_recipient_createdAt", (q) => q.eq("networkId", f.networkId).eq("recipientPersonId", who.personId))
    .take(50))
}

/** Les genres reçus par une personne, triés ; filtrés sur un sujet de la tranche si demandé. */
async function kindsFor(f: Fixture, who: { personId: Id<"persons"> }, subject: { requestId?: Id<"serviceRequests">; membershipId?: Id<"associationMemberships">; reviewId?: Id<"serviceReviews"> } = {}): Promise<string[]> {
  return (await rowsFor(f, who))
    .filter((row) => (subject.requestId === undefined || row.subjectServiceRequestId === subject.requestId)
      && (subject.membershipId === undefined || row.subjectAssociationMembershipId === subject.membershipId)
      && (subject.reviewId === undefined || row.subjectServiceReviewId === subject.reviewId))
    .map((row) => row.kind)
    .sort()
}

async function bell(f: Fixture, who: Member) {
  return (await who.as.query(B.paginateNotifications, { networkId: f.networkId, paginationOpts: PAGE })).page
}

async function setAccepted(f: Fixture, pageId: Id<"pages">, who: { personId: Id<"persons"> }, accepted: boolean) {
  await f.t.run(async (ctx) => {
    const row = await ctx.db.query("pageSignatories").withIndex("by_page_person", (q) => q.eq("pageId", pageId).eq("personId", who.personId)).unique()
    if (!row) throw new Error("Signataire de fixture absent")
    await ctx.db.patch(row._id, { acceptedAt: accepted ? NOW : undefined })
  })
}

async function setMembership(f: Fixture, who: { personId: Id<"persons"> }, status: "suspendue" | "partie" | "declaree") {
  await f.t.run(async (ctx) => {
    const row = await ctx.db.query("networkMemberships")
      .withIndex("by_network_and_person", (q) => q.eq("networkId", f.networkId).eq("personId", who.personId)).unique()
    if (!row) throw new Error("Adhésion de fixture absente")
    await ctx.db.patch(row._id, { status })
  })
}

describe("avis de mise en relation — demandes de service (DG-015)", () => {
  it("une demande envoyée avise chaque signataire vivant, neutre et sans acteur ; un rejeu n'empile rien", async () => {
    const f = await fixture()
    const sent = await f.requester.as.mutation(SR.createServiceRequest, sendArgs(f))
    expect(await kindsFor(f, f.pro)).toEqual(["service_request_received"])
    expect(await kindsFor(f, f.colleague)).toEqual(["service_request_received"])
    expect(await kindsFor(f, f.requester)).toEqual([])
    expect(await kindsFor(f, f.outsider)).toEqual([])

    // Double envoi après une coupure : la même demande, aucune ligne de plus.
    expect(await f.requester.as.mutation(SR.createServiceRequest, sendArgs(f))).toEqual({ requestId: sent.requestId, created: false })
    const rows = await rowsFor(f, f.pro)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ kind: "service_request_received", subjectServiceRequestId: sent.requestId })
    expect(rows[0]?.actorPersonId).toBeUndefined()

    // La cloche : ni acteur, ni sujet générique ; une cible relue (la demande reçue, la page).
    const items = await bell(f, f.pro)
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ kind: "service_request_received", actor: null, subject: null, serviceNotice: { audience: "provider", requestId: sent.requestId, pageHandle: "salon-test" } })
    for (const privateValue of [NEED, "Awa OGOOUÉ", f.requester.personId]) {
      expect(JSON.stringify(items)).not.toContain(privateValue)
      expect(JSON.stringify(rows)).not.toContain(privateValue)
    }
    expect(await f.pro.as.query(B.unreadCount, { networkId: f.networkId })).toMatchObject({ count: 1, capped: false })
  })

  it("chaque version de proposition avise le demandeur une fois ; l'accord avise l'équipe ; la réalisation, le demandeur", async () => {
    const f = await fixture()
    const { requestId } = await f.requester.as.mutation(SR.createServiceRequest, sendArgs(f))
    await f.pro.as.mutation(SR.proposeService, proposalArgs(f, requestId))
    expect(await kindsFor(f, f.requester, { requestId })).toEqual(["service_proposal_received"])
    // Le même geste rejoué par la porte : la même ligne, aucune de plus.
    await f.t.run(async (ctx) => { await noticeServicePageGesture(ctx as unknown as MutationCtx, requestId, "service_proposal_received", f.pro.personId) })
    expect(await rowsFor(f, f.requester)).toHaveLength(1)

    await f.pro.as.mutation(SR.proposeService, proposalArgs(f, requestId, { expectedVersion: 1, amountMinor: 5000 }))
    const proposals = await rowsFor(f, f.requester)
    expect(proposals.map((row) => row.kind)).toEqual(["service_proposal_received", "service_proposal_received"])
    expect(new Set(proposals.map((row) => row.dedupKey)).size).toBe(2)

    await f.requester.as.mutation(SR.acceptServiceProposal, { networkId: f.networkId, requestId, expectedProposalVersion: 2 })
    expect(await kindsFor(f, f.pro, { requestId })).toEqual(["service_proposal_accepted", "service_request_received"])
    expect(await kindsFor(f, f.colleague, { requestId })).toEqual(["service_proposal_accepted", "service_request_received"])
    expect(await kindsFor(f, f.requester, { requestId })).toEqual(["service_proposal_received", "service_proposal_received"])

    vi.setSystemTime(NOW + DAY + HOUR)
    await f.pro.as.mutation(SR.completeServiceBooking, { networkId: f.networkId, requestId })
    expect(await kindsFor(f, f.requester, { requestId })).toEqual(["service_booking_completed", "service_proposal_received", "service_proposal_received"])
    // Le signataire qui a parlé pour la page n'est ni avisé de son geste, ni nommé au demandeur.
    expect(await kindsFor(f, f.pro, { requestId })).toEqual(["service_proposal_accepted", "service_request_received"])
    const items = await bell(f, f.requester)
    expect(items).toHaveLength(3)
    for (const item of items) {
      expect(item.actor).toBeNull()
      expect(item.serviceNotice).toEqual({ audience: "requester", requestId, pageHandle: "salon-test" })
      for (const privateValue of [NEED, DETAILS, AREA, "EUR", "Nadia NDONG", f.pro.personId]) expect(JSON.stringify(item)).not.toContain(privateValue)
    }
  })

  it("refus → le demandeur ; annulation → l'autre partie seulement ; absence constatée → le demandeur", async () => {
    const f = await fixture()
    const first = await f.requester.as.mutation(SR.createServiceRequest, sendArgs(f))
    await f.pro.as.mutation(SR.refuseServiceRequest, { networkId: f.networkId, requestId: first.requestId })
    expect(await kindsFor(f, f.requester, { requestId: first.requestId })).toEqual(["service_request_declined"])

    // Le demandeur retire sa demande : l'équipe l'apprend, lui non.
    const second = await f.requester.as.mutation(SR.createServiceRequest, sendArgs(f, { idempotencyKey: OTHER_KEY }))
    await f.requester.as.mutation(SR.cancelServiceRequest, { networkId: f.networkId, requestId: second.requestId })
    expect(await kindsFor(f, f.pro, { requestId: second.requestId })).toEqual(["service_request_cancelled", "service_request_received"])
    expect(await kindsFor(f, f.colleague, { requestId: second.requestId })).toEqual(["service_request_cancelled", "service_request_received"])
    expect(await kindsFor(f, f.requester, { requestId: second.requestId })).toEqual([])

    // La page annule un rendez-vous convenu : le demandeur l'apprend ; le signataire qui annule, non.
    const third = await f.requester.as.mutation(SR.createServiceRequest, sendArgs(f, { idempotencyKey: THIRD_KEY }))
    await f.pro.as.mutation(SR.proposeService, proposalArgs(f, third.requestId))
    await f.requester.as.mutation(SR.acceptServiceProposal, { networkId: f.networkId, requestId: third.requestId, expectedProposalVersion: 1 })
    await f.colleague.as.mutation(SR.cancelServiceRequest, { networkId: f.networkId, requestId: third.requestId, reason: "Indisponibilité imprévue de l'équipe." })
    expect(await kindsFor(f, f.requester, { requestId: third.requestId })).toEqual(["service_proposal_received", "service_request_cancelled"])
    expect(await kindsFor(f, f.colleague, { requestId: third.requestId })).toEqual(["service_proposal_accepted", "service_request_received"])

    // Une absence constatée après le début du rendez-vous.
    const fourth = await f.requester.as.mutation(SR.createServiceRequest, sendArgs(f, { idempotencyKey: FOURTH_KEY }))
    await f.pro.as.mutation(SR.proposeService, proposalArgs(f, fourth.requestId))
    await f.requester.as.mutation(SR.acceptServiceProposal, { networkId: f.networkId, requestId: fourth.requestId, expectedProposalVersion: 1 })
    vi.setSystemTime(NOW + DAY + HOUR)
    await f.pro.as.mutation(SR.markServiceNoShow, { networkId: f.networkId, requestId: fourth.requestId })
    expect(await kindsFor(f, f.requester, { requestId: fourth.requestId })).toEqual(["service_booking_no_show", "service_proposal_received"])
    expect(await kindsFor(f, f.outsider)).toEqual([])
  })

  it("échéance : un job par demande ; le demandeur, et l'équipe seulement si elle avait proposé ; rejouable", async () => {
    const f = await fixture()
    const silent = await f.requester.as.mutation(SR.createServiceRequest, sendArgs(f))
    const other = await member(f.t, f.networkId, "yannick", "Yannick NZÉ")
    const proposed = await other.as.mutation(SR.createServiceRequest, sendArgs(f, { idempotencyKey: OTHER_KEY }))
    await f.pro.as.mutation(SR.proposeService, proposalArgs(f, proposed.requestId, { expiresAt: NOW + 6 * HOUR }))
    // Une demande dont l'échéance n'est pas atteinte : son job n'annoncera rien.
    const fresh = await f.outsider.as.mutation(SR.createServiceRequest, { ...sendArgs(f, { idempotencyKey: THIRD_KEY }), windows: [{ startAt: NOW + 3 * DAY, endAt: NOW + 3 * DAY + 2 * HOUR }] })
    vi.setSystemTime(NOW + DAY + 5 * HOUR)
    expect(await f.t.mutation(internal.modules.diaspora.serviceRequests.expireDueServiceRequests, {})).toEqual({ expired: 2, hasMore: false })
    // Rien n'est écrit dans le lot lui-même : un job par demande échue, et rien que ça.
    expect(await kindsFor(f, f.requester, { requestId: silent.requestId })).toEqual([])
    const scheduled = (await f.t.run(async (ctx) => await ctx.db.system.query("_scheduled_functions").take(100)))
      .filter((job) => job.name === "modules/diaspora/serviceNotifications:deliverServiceRequestExpiredNotices")
    expect(scheduled.map((job) => job.args)).toEqual(expect.arrayContaining([[{ requestId: silent.requestId }], [{ requestId: proposed.requestId }]]))
    expect(scheduled).toHaveLength(2)
    for (const requestId of [silent.requestId, proposed.requestId]) {
      await f.t.mutation(internal.modules.diaspora.serviceNotifications.deliverServiceRequestExpiredNotices, { requestId })
    }
    expect(await kindsFor(f, f.requester, { requestId: silent.requestId })).toEqual(["service_request_expired"])
    expect(await kindsFor(f, f.pro, { requestId: silent.requestId })).toEqual(["service_request_received"])
    expect(await kindsFor(f, other, { requestId: proposed.requestId })).toEqual(["service_proposal_received", "service_request_expired"])
    expect(await kindsFor(f, f.pro, { requestId: proposed.requestId })).toEqual(["service_request_expired", "service_request_received"])
    expect(await kindsFor(f, f.colleague, { requestId: proposed.requestId })).toEqual(["service_request_expired", "service_request_received"])

    // Le job rejoué n'empile rien ; une demande qui n'est pas échue n'annonce rien.
    await f.t.mutation(internal.modules.diaspora.serviceNotifications.deliverServiceRequestExpiredNotices, { requestId: proposed.requestId })
    expect(await kindsFor(f, other, { requestId: proposed.requestId })).toHaveLength(2)
    expect(await kindsFor(f, f.pro, { requestId: proposed.requestId })).toHaveLength(2)
    await f.t.mutation(internal.modules.diaspora.serviceNotifications.deliverServiceRequestExpiredNotices, { requestId: fresh.requestId })
    expect(await kindsFor(f, f.outsider, { requestId: fresh.requestId })).toEqual([])
    expect(await kindsFor(f, f.pro, { requestId: fresh.requestId })).toEqual(["service_request_received"])
  })

  it("rôle retiré : rien n'est écrit ; une ligne écrite ne se présente plus, ne se compte ni ne se pousse", async () => {
    const f = await fixture()
    await setAccepted(f, f.pageId, f.colleague, false)
    const first = await f.requester.as.mutation(SR.createServiceRequest, sendArgs(f))
    expect(await kindsFor(f, f.colleague)).toEqual([])
    expect(await kindsFor(f, f.pro)).toEqual(["service_request_received"])
    await f.requester.as.mutation(SR.cancelServiceRequest, { networkId: f.networkId, requestId: first.requestId })

    await setAccepted(f, f.pageId, f.colleague, true)
    await f.requester.as.mutation(SR.createServiceRequest, sendArgs(f, { idempotencyKey: OTHER_KEY }))
    const [row] = await rowsFor(f, f.colleague)
    if (!row) throw new Error("Avis du collègue absent")
    expect(await f.colleague.as.query(B.unreadCount, { networkId: f.networkId })).toMatchObject({ count: 1 })
    await setAccepted(f, f.pageId, f.colleague, false)
    expect(await bell(f, f.colleague)).toEqual([])
    expect(await f.colleague.as.query(B.unreadCount, { networkId: f.networkId })).toMatchObject({ count: 0, capped: false })
    expect(await f.t.run(async (ctx) => await notificationStillVisible(ctx, row))).toBe(false)
    expect(await f.t.run(async (ctx) => await pushAllowed(ctx, row))).toBe(false)
    // Le rôle rendu, l'avis se lit de nouveau : la garde est relue, rien n'a été effacé.
    await setAccepted(f, f.pageId, f.colleague, true)
    expect((await bell(f, f.colleague)).map((item) => item.kind)).toEqual(["service_request_received"])
  })

  it("blocage avec l'auteur du geste, suspension ou sortie du destinataire : rien n'est écrit", async () => {
    const f = await fixture()
    const { requestId } = await f.requester.as.mutation(SR.createServiceRequest, sendArgs(f))
    // Le demandeur a bloqué la signataire qui propose : la proposition n'est pas annoncée.
    await f.requester.as.mutation(api.modules.graph.connections.blockPerson, { networkId: f.networkId, targetPersonId: f.pro.personId })
    await f.pro.as.mutation(SR.proposeService, proposalArgs(f, requestId))
    expect(await kindsFor(f, f.requester)).toEqual([])
    await f.requester.as.mutation(api.modules.graph.connections.unblockPerson, { networkId: f.networkId, targetPersonId: f.pro.personId })

    // Suspendu, puis parti du réseau : la version suivante n'est pas annoncée non plus.
    await setMembership(f, f.requester, "suspendue")
    await f.pro.as.mutation(SR.proposeService, proposalArgs(f, requestId, { expectedVersion: 1 }))
    await setMembership(f, f.requester, "partie")
    await f.pro.as.mutation(SR.proposeService, proposalArgs(f, requestId, { expectedVersion: 2 }))
    expect(await kindsFor(f, f.requester)).toEqual([])

    // De retour : la version suivante l'est, avec la garde relue au moment d'écrire.
    await setMembership(f, f.requester, "declaree")
    await f.pro.as.mutation(SR.proposeService, proposalArgs(f, requestId, { expectedVersion: 3 }))
    expect(await kindsFor(f, f.requester)).toEqual(["service_proposal_received"])
  })

  it("une équipe nombreuse : au plus SERVICE_TEAM_NOTICE_MAX signataires avisés, administrateurs d'abord", async () => {
    const f = await fixture()
    await f.t.run(async (ctx) => {
      for (let i = 0; i < SERVICE_TEAM_NOTICE_MAX + 2; i += 1) {
        const personId = await ctx.db.insert("persons", { authUserId: `equipe-${i}`, createdAt: NOW, updatedAt: NOW })
        await ctx.db.insert("networkMemberships", { networkId: f.networkId, personId, status: "declaree", role: "member", joinedAt: NOW, statusChangedAt: NOW })
        await ctx.db.insert("pageSignatories", { networkId: f.networkId, pageId: f.pageId, personId, role: "signatory", acceptedAt: NOW, createdAt: NOW, updatedAt: NOW })
      }
    })
    await f.requester.as.mutation(SR.createServiceRequest, sendArgs(f))
    const written = await f.t.run(async (ctx) => (await ctx.db.query("notifications").take(200)).filter((row) => row.kind === "service_request_received"))
    expect(written).toHaveLength(SERVICE_TEAM_NOTICE_MAX)
    expect(written.map((row) => row.recipientPersonId)).toContain(f.pro.personId)
  })

  it("la porte refuse : un acteur, un sujet absent ou d'une autre nature, un état décalé, un tiers, soi-même", async () => {
    const f = await fixture()
    const { requestId } = await f.requester.as.mutation(SR.createServiceRequest, sendArgs(f))
    await f.t.run(async (ctx) => {
      const db = ctx as unknown as MutationCtx
      const toRequester = { networkId: f.networkId, recipientPersonId: f.requester.personId, subject: { serviceRequest: requestId } }
      expect(await notifyPerson(db, { ...toRequester, kind: "service_request_declined", actorPersonId: f.pro.personId })).toBeNull()
      expect(await notifyPerson(db, { networkId: f.networkId, recipientPersonId: f.requester.personId, kind: "service_request_declined" })).toBeNull()
      expect(await notifyPerson(db, { ...toRequester, kind: "association_membership_accepted" })).toBeNull()
      // La demande est encore « envoyée » : ni refus ni réalisation ne s'annoncent.
      expect(await notifyPerson(db, { ...toRequester, kind: "service_request_declined" })).toBeNull()
      expect(await notifyPerson(db, { ...toRequester, kind: "service_booking_completed" })).toBeNull()
      // Un genre d'équipe ne parle pas au demandeur ; un tiers n'est ni demandeur ni signataire.
      expect(await notifyPerson(db, { ...toRequester, kind: "service_request_received" })).toBeNull()
      expect(await notifyPerson(db, { ...toRequester, recipientPersonId: f.outsider.personId, kind: "service_request_received" })).toBeNull()
      // Jamais à l'auteur du geste.
      expect(await notifyPerson(db, { ...toRequester, recipientPersonId: f.pro.personId, kind: "service_request_received", sourcePersonId: f.pro.personId })).toBeNull()
    })
    expect(await kindsFor(f, f.requester)).toEqual([])
    expect(await kindsFor(f, f.outsider)).toEqual([])
    expect(await rowsFor(f, f.pro)).toHaveLength(1)
  })

  it("la file de livraison n'emporte qu'une référence : ni besoin, ni nom, ni demande", async () => {
    const f = await fixture()
    const network = await f.t.run(async (ctx) => await ctx.db.get(f.networkId))
    if (!network) throw new Error("Réseau de fixture absent")
    vi.stubEnv("NOTIFICATION_APPLICATIONS_JSON", JSON.stringify([{ applicationId: "diaspora_ga", networkSlug: network.slug, origin: "https://diaspora-ga.example.test", entryPath: "/fil" }]))
    await f.pro.as.mutation(api.modules.notifications.pushSubscriptions.subscribe, {
      networkId: f.networkId, applicationId: "diaspora_ga", deviceId: "device_pro", credential: { provider: "expo", token: "ExpoPushToken[token_pro]" },
    })
    await f.pro.as.mutation(api.modules.people.consents.recordConsent, { networkId: f.networkId, purpose: "notifications", origin: "settings" })
    const { requestId } = await f.requester.as.mutation(SR.createServiceRequest, sendArgs(f))
    const jobs = await f.t.run(async (ctx) => await ctx.db.query("notificationDeliveryJobs").take(10))
    expect(jobs).toHaveLength(1)
    expect(jobs[0]).toMatchObject({ recipientPersonId: f.pro.personId, channel: "push", category: "social", state: "queued" })
    const serialized = JSON.stringify(jobs)
    for (const privateValue of [NEED, "Awa OGOOUÉ", f.requester.personId, requestId]) expect(serialized).not.toContain(privateValue)
  })
})

describe("avis de mise en relation — adhésions associatives (DG-010)", () => {
  async function association(f: Fixture) {
    return await f.t.run(async (ctx) => {
      const pageId = await ctx.db.insert("pages", {
        networkId: f.networkId, handle: "collectif-test", name: "Collectif de test", ownerKind: "association", trust: "community", trustRank: 0,
        visibility: "network", onRoot: false, status: "active", searchText: "collectif de test", createdAt: NOW, updatedAt: NOW,
      })
      await ctx.db.insert("pageSignatories", { networkId: f.networkId, pageId, personId: f.pro.personId, role: "admin", acceptedAt: NOW, createdAt: NOW, updatedAt: NOW })
      await ctx.db.insert("pageSignatories", { networkId: f.networkId, pageId, personId: f.colleague.personId, role: "signatory", acceptedAt: NOW, createdAt: NOW, updatedAt: NOW })
      return pageId
    })
  }

  it("demande → les responsables vivants ; décision et exclusion → la personne ; nouvelle demande → nouvel avis", async () => {
    const f = await fixture()
    const pageId = await association(f)
    const asked = await f.outsider.as.mutation(A.requestAssociationMembership, { networkId: f.networkId, pageId, message: "J'arrive à Lyon en janvier." })
    const membershipId = asked.membershipId
    expect(await kindsFor(f, f.pro, { membershipId })).toEqual(["association_membership_requested"])
    expect(await kindsFor(f, f.colleague, { membershipId })).toEqual(["association_membership_requested"])
    expect(await kindsFor(f, f.outsider, { membershipId })).toEqual([])
    const [responsibleItem] = (await bell(f, f.pro)).filter((item) => item.kind === "association_membership_requested")
    expect(responsibleItem).toMatchObject({ actor: null, subject: null, serviceNotice: { audience: "responsible", requestId: null, pageHandle: "collectif-test" } })
    for (const privateValue of ["J'arrive à Lyon en janvier.", "Jean MOUSSAVOU", f.outsider.personId]) expect(JSON.stringify(responsibleItem)).not.toContain(privateValue)

    const accepted = await f.colleague.as.mutation(A.decideAssociationMembership, { networkId: f.networkId, membershipId, decision: "accept", expectedVersion: asked.version })
    expect(await kindsFor(f, f.outsider, { membershipId })).toEqual(["association_membership_accepted"])
    expect(await kindsFor(f, f.colleague, { membershipId })).toEqual(["association_membership_requested"])
    await f.pro.as.mutation(A.removeAssociationMember, { networkId: f.networkId, membershipId, expectedVersion: accepted.version, reason: "Manquements répétés à la charte de l'association." })
    expect(await kindsFor(f, f.outsider, { membershipId })).toEqual(["association_membership_accepted", "association_membership_removed"])
    const memberItems = (await bell(f, f.outsider)).filter((item) => item.serviceNotice)
    for (const item of memberItems) {
      expect(item).toMatchObject({ actor: null, serviceNotice: { audience: "member", requestId: null, pageHandle: "collectif-test" } })
      expect(JSON.stringify(item)).not.toContain("Manquements")
    }

    // Une autre personne demande, annule, redemande : deux versions, deux avis ; puis un refus.
    const first = await f.requester.as.mutation(A.requestAssociationMembership, { networkId: f.networkId, pageId })
    await f.requester.as.mutation(A.cancelAssociationMembershipRequest, { networkId: f.networkId, pageId })
    const again = await f.requester.as.mutation(A.requestAssociationMembership, { networkId: f.networkId, pageId })
    expect(again.membershipId).toBe(first.membershipId)
    expect(await kindsFor(f, f.pro, { membershipId: first.membershipId })).toEqual(["association_membership_requested", "association_membership_requested"])
    await f.pro.as.mutation(A.decideAssociationMembership, { networkId: f.networkId, membershipId: again.membershipId, decision: "reject", expectedVersion: again.version })
    expect(await kindsFor(f, f.requester, { membershipId: again.membershipId })).toEqual(["association_membership_declined"])
    // Le responsable qui décide n'est jamais avisé de sa propre décision.
    expect(await kindsFor(f, f.pro, { membershipId: again.membershipId })).toEqual(["association_membership_requested", "association_membership_requested"])
  })

  it("un responsable au rôle retiré n'apprend rien ; une page qui n'est pas une association n'annonce rien", async () => {
    const f = await fixture()
    const pageId = await association(f)
    await setAccepted(f, pageId, f.colleague, false)
    const asked = await f.outsider.as.mutation(A.requestAssociationMembership, { networkId: f.networkId, pageId })
    expect(await kindsFor(f, f.colleague, { membershipId: asked.membershipId })).toEqual([])
    expect(await kindsFor(f, f.pro, { membershipId: asked.membershipId })).toEqual(["association_membership_requested"])
    // Une ligne d'adhésion sur la page d'entreprise (fabriquée) ne passe pas la garde.
    const forged = await f.t.run(async (ctx) => await ctx.db.insert("associationMemberships", {
      networkId: f.networkId, pageId: f.pageId, personId: f.outsider.personId, status: "requested", role: "member",
      requestedAt: NOW, statusChangedAt: NOW, version: 1, createdAt: NOW, updatedAt: NOW,
    }))
    await f.t.run(async (ctx) => {
      expect(await notifyPerson(ctx as unknown as MutationCtx, { networkId: f.networkId, recipientPersonId: f.pro.personId, kind: "association_membership_requested", subject: { associationMembership: forged } })).toBeNull()
    })
  })
})

describe("avis de mise en relation — réponse à un avis (DG-016)", () => {
  async function reviewed(f: Fixture, replyPreReview: boolean) {
    await f.t.run(async (ctx) => {
      await ctx.db.insert("moderationPolicies", { networkId: f.networkId, surface: "serviceReview", preReview: false, maxLinks: 20, maxWrites: 100, windowMs: 60_000, updatedAt: NOW })
      await ctx.db.insert("moderationPolicies", { networkId: f.networkId, surface: "serviceReviewReply", preReview: replyPreReview, maxLinks: 20, maxWrites: 100, windowMs: 60_000, updatedAt: NOW })
    })
    const { requestId } = await f.requester.as.mutation(SR.createServiceRequest, sendArgs(f))
    await f.pro.as.mutation(SR.proposeService, proposalArgs(f, requestId))
    await f.requester.as.mutation(SR.acceptServiceProposal, { networkId: f.networkId, requestId, expectedProposalVersion: 1 })
    vi.setSystemTime(NOW + DAY + 3 * HOUR)
    await f.pro.as.mutation(SR.completeServiceBooking, { networkId: f.networkId, requestId })
    const { reviewId } = await f.requester.as.mutation(RV.createReview, { networkId: f.networkId, requestId, rating: 4, body: REVIEW_BODY, consentToPublish: true })
    return { requestId, reviewId }
  }

  async function setReplyPreReview(f: Fixture, preReview: boolean) {
    await f.t.run(async (ctx) => {
      const row = await ctx.db.query("moderationPolicies").withIndex("by_network_surface", (q) => q.eq("networkId", f.networkId).eq("surface", "serviceReviewReply")).unique()
      if (!row) throw new Error("Politique de fixture absente")
      await ctx.db.patch(row._id, { preReview })
    })
  }

  it("la réponse publiée avise l'auteur de l'avis, une seule fois ; elle mène à sa demande", async () => {
    const f = await fixture()
    const { requestId, reviewId } = await reviewed(f, false)
    await f.pro.as.mutation(RV.replyToReview, { networkId: f.networkId, reviewId, expectedVersion: null, body: "Merci pour ce retour." })
    expect(await kindsFor(f, f.requester, { reviewId })).toEqual(["service_review_replied"])
    await f.pro.as.mutation(RV.replyToReview, { networkId: f.networkId, reviewId, expectedVersion: 1, body: "Merci encore pour ce retour." })
    expect(await kindsFor(f, f.requester, { reviewId })).toEqual(["service_review_replied"])
    expect(await kindsFor(f, f.pro, { reviewId })).toEqual([])
    const [item] = (await bell(f, f.requester)).filter((candidate) => candidate.kind === "service_review_replied")
    expect(item).toMatchObject({ actor: null, subject: null, serviceNotice: { audience: "requester", requestId, pageHandle: "salon-test" } })
    for (const privateValue of ["Merci pour ce retour.", REVIEW_BODY, "Nadia NDONG", f.pro.personId]) expect(JSON.stringify(item)).not.toContain(privateValue)
  })

  it("une réponse en attente de modération n'annonce rien ; publiée lors d'une modification, elle l'annonce", async () => {
    const f = await fixture()
    const { reviewId } = await reviewed(f, true)
    await f.pro.as.mutation(RV.replyToReview, { networkId: f.networkId, reviewId, expectedVersion: null, body: "Merci pour ce retour." })
    expect(await kindsFor(f, f.requester, { reviewId })).toEqual([])
    await setReplyPreReview(f, false)
    await f.pro.as.mutation(RV.replyToReview, { networkId: f.networkId, reviewId, expectedVersion: 1, body: "Merci pour ce retour détaillé." })
    expect(await kindsFor(f, f.requester, { reviewId })).toEqual(["service_review_replied"])
  })
})
