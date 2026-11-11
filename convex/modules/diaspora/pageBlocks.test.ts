// @vitest-environment edge-runtime
/**
 * RP-03 de DIASPORALE (décision 5 du plan 05) : une demande d'une personne vers
 * une page dont TOUS les signataires vivants sont en blocage avec elle reçoit le
 * refus indistinct ; un seul signataire ne ferme pas une page collective ; on
 * sort toujours d'un échange ; une ressource du kit reste lisible.
 *
 * Un test par ligne de la matrice (docs/40 de DIASPORALE), avec de vraies
 * sessions et de vrais blocages (`graph.connections.blockPerson`).
 */
import { engineErrorAppRule, engineErrorCode } from "@antsia/social-contracts/errors"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { api, internal } from "../../_generated/api"
import type { Id } from "../../_generated/dataModel"
import { SEED_CONFIRMATION } from "../../seeds/foundations"
import { createTestSession, testConvex } from "../../test.setup"
import { isPageClosedByBlocks } from "./facts"

type T = ReturnType<typeof testConvex>
type Member = Awaited<ReturnType<typeof member>>
const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
/** Dimanche 18 octobre 2026, 10 h UTC. */
const NOW = Date.UTC(2026, 9, 18, 10)
/** Les sessions explicites survivent au saut d'horloge de la contestation d'une absence. */
const SESSION_END = NOW + 30 * DAY
const SR = api.modules.diaspora.serviceRequests
const A = api.modules.diaspora.associations
const J = api.modules.diaspora.jobs
const AID = api.modules.diaspora.mutualAid
const K = api.modules.diaspora.arrivalKit
const REQUEST_KEY = "2b4a7a0e-6a52-4c8e-9a52-7f1f0b6c2d11"
const OTHER_REQUEST_KEY = "9c1d2e3f-4a5b-4c6d-8e7f-0a1b2c3d4e5f"

const JOB = {
  title: "Cuisinier ou cuisinière en traiteur",
  description: "Préparer les plats du pays pour les commandes de la semaine, en équipe de trois.",
  contract: "cdi" as const,
  country: "FR",
  city: "Paris",
  workMode: "onsite" as const,
  languages: ["fr" as const],
  payRange: { minMinor: 200000, maxMinor: 240000, currency: "EUR", period: "month" as const },
  closesAt: null,
}
const APPLY = { message: "Bonjour, cinq ans de cuisine collective et l'envie de rejoindre votre équipe.", shareName: true, shareTalentProfile: false, idempotencyKey: "candidature-blocage-0001" }
const MISSION = {
  title: "Accueillir les nouveaux arrivants à la gare",
  description: "Orienter les étudiants qui arrivent le samedi matin, avec un plan du quartier.",
  country: "FR",
  city: "Lyon",
  area: "Près de la gare Part-Dieu",
  startsAt: NOW + 2 * DAY,
  endsAt: NOW + 2 * DAY + 3 * HOUR,
  timeZone: "Europe/Paris",
  places: 3,
}

beforeEach(() => {
  vi.stubEnv("CONVEX_CLOUD_URL", "http://127.0.0.1:3210")
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

/** Un membre déclaré à identité forte (IDN loa 2), à la session explicite. */
async function member(t: T, networkId: Id<"networks">, handle: string) {
  const subject = `auth-${handle}`
  const sessionId = await createTestSession(t, subject, SESSION_END)
  const as = t.withIdentity({ subject, sessionId })
  const personId = await as.mutation(api.modules.people.persons.ensureMyPerson, {})
  await as.mutation(api.modules.people.consents.recordConsent, { purpose: "social_profile", origin: "onboarding" })
  await as.mutation(api.modules.people.profile.publishMyProfile, { handle, displayName: handle })
  await t.run(async (ctx) => {
    await ctx.db.insert("identityLinks", { personId, provider: "idn", subject: `idn-${personId}`, loa: 2, nationality: "GA", linkedAt: NOW })
  })
  await as.mutation(api.modules.diaspora.membership.joinDiasporale, { networkId, facet: { countryOfResidence: "FR", city: "Paris" } })
  return { as, personId }
}

/** Une association tenue par deux signataires vivants (une administratrice, un signataire). */
async function fixture() {
  const t = testConvex()
  await t.mutation(internal.seeds.foundations.run, { confirmNonProduction: SEED_CONFIRMATION })
  const { network: networkId } = await t.mutation(internal.modules.diaspora.seed.run, { confirmNonProduction: SEED_CONFIRMATION })
  const admin = await member(t, networkId, "admin.asso")
  const deputy = await member(t, networkId, "signataire.asso")
  const requester = await member(t, networkId, "demandeuse")
  const pageId = await t.run(async (ctx) => {
    const id = await ctx.db.insert("pages", {
      networkId, handle: "collectif-blocage", name: "Collectif de test", ownerKind: "association", trust: "community", trustRank: 0,
      country: "FR", visibility: "network", onRoot: false, status: "active", searchText: "collectif de test", createdAt: NOW, updatedAt: NOW,
    })
    await ctx.db.insert("pageSignatories", { networkId, pageId: id, personId: admin.personId, role: "admin", acceptedAt: NOW, createdAt: NOW, updatedAt: NOW })
    await ctx.db.insert("pageSignatories", { networkId, pageId: id, personId: deputy.personId, role: "signatory", acceptedAt: NOW, createdAt: NOW, updatedAt: NOW })
    return id
  })
  const offerId = await t.run(async (ctx) => ctx.db.insert("serviceOffers", {
    networkId, pageId, title: "Accompagnement aux démarches", description: "Aide pour les premiers dossiers à l'arrivée.", category: "beauty",
    country: "FR", city: "Paris", cityKey: "paris", delivery: "onsite", languages: ["fr"], durationMinutes: 90,
    pricing: { mode: "from", amountMinor: 4500, currency: "EUR" }, status: "active", searchText: "accompagnement aux demarches paris",
    version: 1, createdAt: NOW, updatedAt: NOW,
  }))
  return { t, networkId, admin, deputy, requester, pageId, offerId }
}

type Fixture = Awaited<ReturnType<typeof fixture>>

async function block(f: Fixture, by: Member, target: Member) {
  await by.as.mutation(api.modules.graph.connections.blockPerson, { networkId: f.networkId, targetPersonId: target.personId })
}

/** Les deux signataires vivants bloquent la personne : la page lui est fermée. */
async function blockedByWholeTeam(f: Fixture) {
  await block(f, f.admin, f.requester)
  await block(f, f.deputy, f.requester)
}

/** Le code fermé d'un refus : celui de la tranche s'il existe, sinon celui du moteur ; `null` sans refus. */
async function codeOf(promise: Promise<unknown>) {
  try { await promise } catch (error) { return engineErrorAppRule(error)?.appRule ?? engineErrorCode(error) }
  return null
}

function sendArgs(f: Fixture, idempotencyKey = REQUEST_KEY) {
  return {
    networkId: f.networkId, offerId: f.offerId, offerVersion: 1, need: "Constituer le dossier de la caisse d'assurance maladie.",
    windows: [{ startAt: NOW + DAY, endAt: NOW + DAY + 4 * HOUR }], timeZone: "Europe/Paris", shareIdentityWithPage: true, idempotencyKey,
  }
}

function proposalArgs(f: Fixture, requestId: Id<"serviceRequests">) {
  return {
    networkId: f.networkId, requestId, expectedVersion: 0, amountMinor: 4500, currency: "EUR", durationMinutes: 90,
    startAt: NOW + DAY + HOUR, timeZone: "Europe/Paris", location: { mode: "onsite" as const, area: "Paris 11e" },
    details: "Un rendez-vous d'une heure et demie.", cancellationTerms: "Annulation libre jusqu'à la veille.", expiresAt: NOW + 12 * HOUR,
  }
}

/** Une demande envoyée puis proposée par la page, AVANT tout blocage. */
async function proposed(f: Fixture) {
  const { requestId } = await f.requester.as.mutation(SR.createServiceRequest, sendArgs(f))
  await f.admin.as.mutation(SR.proposeService, proposalArgs(f, requestId))
  return requestId
}

/** Un rendez-vous confirmé, AVANT tout blocage. */
async function booked(f: Fixture) {
  const requestId = await proposed(f)
  await f.requester.as.mutation(SR.acceptServiceProposal, { networkId: f.networkId, requestId, expectedProposalVersion: 1 })
  return requestId
}

const move = (f: Fixture, requestId: Id<"serviceRequests">) => ({
  networkId: f.networkId, requestId, expectedProposalVersion: 1, startAt: NOW + 2 * DAY, timeZone: "Europe/Paris", expiresAt: NOW + 12 * HOUR,
})

async function createJob(f: Fixture) {
  const { jobId } = await f.admin.as.mutation(J.createJobOffer, { networkId: f.networkId, pageId: f.pageId, ...JOB, publish: true })
  return jobId
}

async function createMission(f: Fixture) {
  const { missionId } = await f.admin.as.mutation(AID.createMission, { networkId: f.networkId, pageId: f.pageId, ...MISSION })
  return missionId
}

async function written(t: T) {
  return await t.run(async (ctx) => ({
    requests: (await ctx.db.query("serviceRequests").take(50)).length,
    bookings: (await ctx.db.query("serviceBookings").take(50)).length,
    memberships: (await ctx.db.query("associationMemberships").take(50)).length,
    applications: (await ctx.db.query("jobApplications").take(50)).length,
    signups: (await ctx.db.query("aidMissionSignups").take(50)).length,
    notifications: (await ctx.db.query("notifications").take(200)).length,
  }))
}

describe("RP-03 — une page dont toute l'équipe vivante a bloqué la personne", () => {
  it("1. demande de service : refus indistinct, comme une offre inconnue ; rien n'est écrit, aucun avis", async () => {
    const f = await fixture()
    await blockedByWholeTeam(f)
    const before = await written(f.t)
    expect(await codeOf(f.requester.as.mutation(SR.createServiceRequest, sendArgs(f)))).toBe("notFound")
    // Le même refus qu'une offre qui n'existe pas : rien ne dit le blocage.
    const unknownOffer = await f.t.run(async (ctx) => {
      const id = await ctx.db.insert("serviceOffers", {
        networkId: f.networkId, pageId: f.pageId, title: "Offre retirée", description: "Une offre retirée de test.", category: "beauty",
        country: "FR", city: "Paris", cityKey: "paris", delivery: "onsite", languages: ["fr"], durationMinutes: 60,
        pricing: { mode: "from", amountMinor: 1000, currency: "EUR" }, status: "active", searchText: "offre retiree", version: 1, createdAt: NOW, updatedAt: NOW,
      })
      await ctx.db.delete(id)
      return id
    })
    expect(await codeOf(f.requester.as.mutation(SR.createServiceRequest, { ...sendArgs(f, OTHER_REQUEST_KEY), offerId: unknownOffer }))).toBe("notFound")
    expect(await written(f.t)).toEqual(before)
  })

  it("2. accord sur une proposition : refusé indistinctement après le blocage, aucun rendez-vous", async () => {
    const f = await fixture()
    const requestId = await proposed(f)
    await blockedByWholeTeam(f)
    const before = await written(f.t)
    expect(await codeOf(f.requester.as.mutation(SR.acceptServiceProposal, { networkId: f.networkId, requestId, expectedProposalVersion: 1 }))).toBe("notFound")
    expect(await written(f.t)).toEqual(before)
    expect(before.bookings).toBe(0)
  })

  it("3. déplacer un rendez-vous, côté demandeur : proposer et accepter un autre horaire sont refusés", async () => {
    const f = await fixture()
    const requestId = await booked(f)
    // L'équipe propose un autre horaire avant le blocage ; la personne ne peut plus ni l'accepter ni en proposer un.
    await f.admin.as.mutation(SR.proposeServiceReschedule, move(f, requestId))
    await blockedByWholeTeam(f)
    expect(await codeOf(f.requester.as.mutation(SR.acceptServiceReschedule, { networkId: f.networkId, requestId, expectedProposalVersion: 1, expectedStartAt: NOW + 2 * DAY }))).toBe("notFound")
    await f.admin.as.mutation(SR.declineServiceReschedule, { networkId: f.networkId, requestId })
    expect(await codeOf(f.requester.as.mutation(SR.proposeServiceReschedule, move(f, requestId)))).toBe("notFound")
    const booking = await f.t.run(async (ctx) => (await ctx.db.query("serviceBookings").take(1))[0])
    expect(booking).toMatchObject({ startAt: NOW + DAY + HOUR, status: "confirmed" })
    expect(booking?.reschedule).toBeUndefined()
  })

  it("4. demande d'adhésion : refus indistinct, aucune ligne d'adhésion", async () => {
    const f = await fixture()
    await blockedByWholeTeam(f)
    expect(await codeOf(f.requester.as.mutation(A.requestAssociationMembership, { networkId: f.networkId, pageId: f.pageId }))).toBe("notFound")
    expect((await written(f.t)).memberships).toBe(0)
  })

  it("5. candidature : refus indistinct, aucune candidature", async () => {
    const f = await fixture()
    const jobId = await createJob(f)
    await blockedByWholeTeam(f)
    expect(await codeOf(f.requester.as.mutation(J.applyToJobOffer, { networkId: f.networkId, jobId, offerVersion: 1, ...APPLY }))).toBe("notFound")
    expect((await written(f.t)).applications).toBe(0)
  })

  it("6. inscription à une mission bénévole : refus indistinct, aucune inscription", async () => {
    const f = await fixture()
    const missionId = await createMission(f)
    await blockedByWholeTeam(f)
    expect(await codeOf(f.requester.as.mutation(AID.signUpForMission, { networkId: f.networkId, missionId, shareNameWithTeam: true }))).toBe("notFound")
    expect((await written(f.t)).signups).toBe(0)
  })

  it("7. sortir d'un échange reste ouvert : annuler, décliner, quitter, retirer", async () => {
    const f = await fixture()
    // Une demande de service ouverte, une adhésion en attente, une candidature, une inscription, un rendez-vous à déplacer : tout AVANT le blocage.
    const { requestId: openRequest } = await f.requester.as.mutation(SR.createServiceRequest, sendArgs(f))
    await f.requester.as.mutation(A.requestAssociationMembership, { networkId: f.networkId, pageId: f.pageId })
    const jobId = await createJob(f)
    const { applicationId } = await f.requester.as.mutation(J.applyToJobOffer, { networkId: f.networkId, jobId, offerVersion: 1, ...APPLY })
    const missionId = await createMission(f)
    await f.requester.as.mutation(AID.signUpForMission, { networkId: f.networkId, missionId, shareNameWithTeam: true })
    await blockedByWholeTeam(f)

    expect(await f.requester.as.mutation(SR.cancelServiceRequest, { networkId: f.networkId, requestId: openRequest })).toBeNull()
    expect(await f.requester.as.mutation(A.cancelAssociationMembershipRequest, { networkId: f.networkId, pageId: f.pageId })).toMatchObject({ version: expect.any(Number) })
    expect(await f.requester.as.mutation(J.withdrawJobApplication, { networkId: f.networkId, applicationId })).toEqual({ status: "withdrawn" })
    expect(await f.requester.as.mutation(AID.withdrawFromMission, { networkId: f.networkId, missionId })).toMatchObject({ signupCount: 0 })
  })

  it("7 bis. décliner un autre horaire et quitter l'association restent ouverts", async () => {
    const f = await fixture()
    const requestId = await booked(f)
    await f.admin.as.mutation(SR.proposeServiceReschedule, move(f, requestId))
    const { membershipId, version } = await f.requester.as.mutation(A.requestAssociationMembership, { networkId: f.networkId, pageId: f.pageId })
    await f.admin.as.mutation(A.decideAssociationMembership, { networkId: f.networkId, membershipId, decision: "accept", expectedVersion: version })
    await blockedByWholeTeam(f)

    expect(await f.requester.as.mutation(SR.declineServiceReschedule, { networkId: f.networkId, requestId })).toBeNull()
    expect(await f.requester.as.mutation(A.leaveAssociation, { networkId: f.networkId, pageId: f.pageId })).toMatchObject({ version: expect.any(Number) })
  })

  it("8. contester une absence déclarée reste ouvert (le recours reste dans son espace)", async () => {
    const f = await fixture()
    const requestId = await booked(f)
    vi.setSystemTime(NOW + DAY + HOUR)
    await f.admin.as.mutation(SR.markServiceNoShow, { networkId: f.networkId, requestId })
    await blockedByWholeTeam(f)
    expect(await f.requester.as.mutation(SR.contestServiceNoShow, { networkId: f.networkId, requestId, reason: "J'étais devant la porte à l'heure dite." }))
      .toEqual({ contestedAt: NOW + DAY + HOUR, created: true })
  })

  it("9. une ressource du kit portée par la page reste lisible et signalable", async () => {
    const f = await fixture()
    const resourceId = await f.t.run(async (ctx) => ctx.db.insert("kitResources", {
      networkId: f.networkId, pageId: f.pageId, proposedByPersonId: f.admin.personId, revisedByPersonId: f.admin.personId,
      title: "Ouvrir un compte bancaire à Paris", summary: "Les pièces demandées et les délais habituels pour un premier compte.",
      body: "Prenez rendez-vous en agence avec une pièce d'identité, un justificatif de domicile et votre titre de séjour.",
      category: "banking", country: "FR", cityKey: "", sourceName: "Portail public d'information bancaire", sourceUrl: "https://www.exemple-public.fr/",
      lastVerifiedAt: NOW - DAY, status: "published", listed: true, revision: 1, version: 1, outdatedFlags: 0, revisedAt: NOW, createdAt: NOW, updatedAt: NOW,
    }))
    await blockedByWholeTeam(f)
    expect(await f.requester.as.query(K.getResource, { networkId: f.networkId, resourceId })).not.toBeNull()
    expect(await f.requester.as.mutation(K.flagResourceOutdated, { networkId: f.networkId, resourceId, revision: 1, reason: "link_broken" }))
      .toMatchObject({ outdatedFlags: 1 })
  })

  it("10. un seul signataire sur deux ne ferme pas la page : chaque demande passe", async () => {
    const f = await fixture()
    const jobId = await createJob(f)
    const missionId = await createMission(f)
    await block(f, f.admin, f.requester)
    expect(await f.requester.as.mutation(SR.createServiceRequest, sendArgs(f))).toMatchObject({ created: true })
    expect(await f.requester.as.mutation(A.requestAssociationMembership, { networkId: f.networkId, pageId: f.pageId })).toMatchObject({ version: 1 })
    expect(await f.requester.as.mutation(J.applyToJobOffer, { networkId: f.networkId, jobId, offerVersion: 1, ...APPLY })).toMatchObject({ created: true })
    expect(await f.requester.as.mutation(AID.signUpForMission, { networkId: f.networkId, missionId, shareNameWithTeam: true })).toMatchObject({ signupCount: 1 })
  })

  it("10 bis. un seul signataire sur deux : l'accord sur une proposition passe", async () => {
    const f = await fixture()
    const requestId = await proposed(f)
    await block(f, f.deputy, f.requester)
    expect(await f.requester.as.mutation(SR.acceptServiceProposal, { networkId: f.networkId, requestId, expectedProposalVersion: 1 })).toMatchObject({ bookingId: expect.any(String) })
  })

  it("11. la règle : blocage dans l'autre sens, signataire non vivant ignoré, page sans équipe vivante", async () => {
    const f = await fixture()
    const page = await f.t.run(async (ctx) => ctx.db.get(f.pageId))
    if (!page) throw new Error("Page de fixture absente")
    const closed = async () => await f.t.run(async (ctx) => isPageClosedByBlocks(ctx, page, f.requester.personId))

    expect(await closed()).toBe(false)
    // La personne bloque elle-même toute l'équipe : la page lui est fermée aussi (blocage silencieux dans les deux sens).
    await block(f, f.requester, f.admin)
    expect(await closed()).toBe(false)
    await block(f, f.requester, f.deputy)
    expect(await closed()).toBe(true)
    expect(await codeOf(f.requester.as.mutation(SR.createServiceRequest, sendArgs(f)))).toBe("notFound")

    // Un nouveau signataire VIVANT hors blocage rouvre la page ; une invitation en attente ne compte pas.
    const helper = await member(f.t, f.networkId, "nouvelle.signataire")
    const invitation = await f.t.run(async (ctx) => ctx.db.insert("pageSignatories", { networkId: f.networkId, pageId: f.pageId, personId: helper.personId, role: "signatory", createdAt: NOW, updatedAt: NOW }))
    expect(await closed()).toBe(true)
    await f.t.run(async (ctx) => { await ctx.db.patch(invitation, { acceptedAt: NOW }) })
    expect(await closed()).toBe(false)

    // Une page sans aucune équipe vivante n'est pas fermée par cette règle.
    const orphan = await f.t.run(async (ctx) => {
      const id = await ctx.db.insert("pages", {
        networkId: f.networkId, handle: "page-sans-equipe", name: "Page sans équipe", ownerKind: "association", trust: "community", trustRank: 0,
        country: "FR", visibility: "network", onRoot: false, status: "active", searchText: "page sans equipe", createdAt: NOW, updatedAt: NOW,
      })
      return await ctx.db.get(id)
    })
    if (!orphan) throw new Error("Page de fixture absente")
    expect(await f.t.run(async (ctx) => isPageClosedByBlocks(ctx, orphan, f.requester.personId))).toBe(false)

    // La personne elle-même signataire vivante n'est jamais fermée.
    expect(await f.t.run(async (ctx) => isPageClosedByBlocks(ctx, page, f.admin.personId))).toBe(false)
  })
})
