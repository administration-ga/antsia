// @vitest-environment edge-runtime
/**
 * DG-027 · G11 : passage nocturne chaîné, seuil anti-réidentification, bases
 * des taux, refus indistinct, autre réseau, fenêtres, idempotence du passage,
 * aucun contenu privé dans les agrégats. Sessions réelles (Better Auth), jamais
 * un contournement des gardes. Les lignes sources sont insérées à l'instant de
 * leur date métier : l'index de création du moteur les range alors comme en
 * production.
 */
import { engineErrorAppRule, engineErrorCode } from "@antsia/social-contracts/errors"
import { DAY_MS, HOUR_MS, PILOT_DISPLAY_THRESHOLD, PILOT_METRIC_IDS } from "@diasporale/domain"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { api, internal } from "../../_generated/api"
import type { Doc, Id } from "../../_generated/dataModel"
import { SEED_CONFIRMATION } from "../../seeds/foundations"
import { createTestOperatorProof, createTestSession, testConvex } from "../../test.setup"

type T = ReturnType<typeof testConvex>
type Member = { readonly as: ReturnType<T["withIdentity"]>; readonly personId: Id<"persons"> }

const PILOT = api.modules.diaspora.pilotMetrics
const REFRESH = internal.modules.diaspora.pilotMetrics.refreshPilotMetrics
/** Le passage : le 18 octobre 2026 à 10 h UTC ; son dernier jour complet est le 17. */
const NOW = Date.UTC(2026, 9, 18, 10)
const TODAY = Date.UTC(2026, 9, 18)
/** La graine et les membres, cent jours plus tôt : toutes les cohortes leur sont postérieures. */
const START = TODAY - 100 * DAY_MS
/** Les sessions de recette restent vivantes jusqu'après le passage. */
const SESSION_END = NOW + 30 * DAY_MS
/** Les textes privés ne doivent jamais atteindre un agrégat ni une lecture. */
const PRIVATE_NEED = "Besoin privé : tresses pour la cérémonie de ma fille."
const PRIVATE_DETAILS = "Détails privés de la proposition de recette."
const PRIVATE_REVIEW = "Avis privé de recette, rédigé par la personne."
const PRIVATE_MESSAGE = "Mot privé joint à la demande d'adhésion."

/** Midi (ou l'heure dite) du jour UTC `days` jours avant le passage. */
function daysAgo(days: number, hour = 12): number {
  return TODAY - days * DAY_MS + hour * HOUR_MS
}

let sequence = 0

beforeEach(() => {
  vi.stubEnv("CONVEX_CLOUD_URL", "http://127.0.0.1:3210")
  vi.useFakeTimers()
  vi.setSystemTime(START)
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs() })

async function code(promise: Promise<unknown>) {
  try { await promise } catch (error) { return engineErrorAppRule(error)?.appRule ?? engineErrorCode(error) }
  return null
}

/** Une personne aux sessions explicites (vivantes jusqu'après le passage), membre de DIASPORALE. */
async function member(t: T, networkId: Id<"networks">, handle: string, displayName: string): Promise<Member> {
  const subject = `pilote-${handle}`
  const sessionId = await createTestSession(t, subject, SESSION_END)
  const as = t.withIdentity({ subject, sessionId })
  const personId = await as.mutation(api.modules.people.persons.ensureMyPerson, {})
  await as.mutation(api.modules.people.consents.recordConsent, { purpose: "social_profile", origin: "onboarding" })
  await as.mutation(api.modules.people.profile.publishMyProfile, { handle, displayName })
  await t.run(async (ctx) => { await ctx.db.insert("identityLinks", { personId, provider: "idn", subject: `pilote-idn-${personId}`, loa: 2, nationality: "GA", linkedAt: Date.now() }) })
  await as.mutation(api.modules.diaspora.membership.joinDiasporale, { networkId, facet: { countryOfResidence: "FR", city: "Paris" } })
  return { as, personId }
}

async function setRole(t: T, networkId: Id<"networks">, who: Member, role: Doc<"networkMemberships">["role"]) {
  await t.run(async (ctx) => {
    const membership = await ctx.db.query("networkMemberships").withIndex("by_network_and_person", (q) => q.eq("networkId", networkId).eq("personId", who.personId)).unique()
    if (!membership) throw new Error("Adhésion de recette absente")
    await ctx.db.patch(membership._id, { role })
  })
}

function pageFields(networkId: Id<"networks">, handle: string, ownerKind: "company" | "association", status: "active" | "inactive" = "active") {
  return {
    networkId, handle, name: `Page ${handle}`, ownerKind, country: "FR", trust: "community" as const, trustRank: 0,
    visibility: "network" as const, onRoot: false, status, searchText: handle, createdAt: START, updatedAt: START,
  }
}

function offerFields(networkId: Id<"networks">, pageId: Id<"pages">, country: string, status: Doc<"serviceOffers">["status"] = "active") {
  return {
    networkId, pageId, title: "Tresses africaines", description: "Tresses sur cheveux naturels.", category: "beauty" as const, country,
    city: "Paris", cityKey: "paris", delivery: "onsite" as const, languages: ["fr"], pricing: { mode: "quote" as const }, status,
    version: 1, searchText: "tresses", createdAt: START, updatedAt: START,
  }
}

async function fixture() {
  const t = testConvex({ automaticSessions: false })
  const { root } = await t.mutation(internal.seeds.foundations.run, { confirmNonProduction: SEED_CONFIRMATION })
  const { network: networkId } = await t.mutation(internal.modules.diaspora.seed.run, { confirmNonProduction: SEED_CONFIRMATION })
  const admin = await member(t, networkId, "pilote-admin", "Awa OGOOUÉ")
  const moderator = await member(t, networkId, "pilote-moderation", "Nadia NDONG")
  const plain = await member(t, networkId, "pilote-membre", "Jean MBA")
  await setRole(t, networkId, admin, "network_admin")
  await setRole(t, networkId, moderator, "network_moderator")
  const ids = await t.run(async (ctx) => {
    const salon = await ctx.db.insert("pages", pageFields(networkId, "salon-pilote", "company"))
    const association = await ctx.db.insert("pages", pageFields(networkId, "association-pilote", "association"))
    const offerFr = await ctx.db.insert("serviceOffers", offerFields(networkId, salon, "FR"))
    const offerBe = await ctx.db.insert("serviceOffers", offerFields(networkId, salon, "BE"))
    return { salon, association, offerFr, offerBe }
  })
  return { t, root, networkId, admin, moderator, plain, ...ids }
}
type Fixture = Awaited<ReturnType<typeof fixture>>

type RequestShape = {
  readonly at: number
  readonly status: Doc<"serviceRequests">["status"]
  readonly offer?: "fr" | "be"
  /** Première proposition (version 1), tant d'heures après l'envoi. */
  readonly proposedAfterHours?: number
  /** Refus de la page sans proposition, tant d'heures après l'envoi. */
  readonly refusedAfterHours?: number
  readonly booked?: boolean
  readonly deadlineAt?: number
  readonly otherNetworkId?: Id<"networks">
}

function closerOf(status: Doc<"serviceRequests">["status"]): Doc<"serviceRequests">["closedBy"] {
  switch (status) {
    case "refused":
    case "completed":
    case "no_show":
      return "page"
    case "cancelled":
      return "requester"
    case "expired":
      return "system"
    default:
      return undefined
  }
}

function bookingStatusOf(status: Doc<"serviceRequests">["status"]): Doc<"serviceBookings">["status"] {
  return status === "completed" || status === "cancelled" || status === "no_show" ? status : "confirmed"
}

/** Une demande insérée à l'instant de son envoi, avec sa proposition et son rendez-vous éventuels. */
async function request(f: Fixture, shape: RequestShape): Promise<{ readonly requestId: Id<"serviceRequests">; readonly bookingId: Id<"serviceBookings"> | null }> {
  vi.setSystemTime(shape.at)
  sequence += 1
  const key = `pilote-demande-${sequence}`
  return await f.t.run(async (ctx) => {
    const open = shape.status === "sent" || shape.status === "proposed"
    const closedBy = closerOf(shape.status)
    const requestId = await ctx.db.insert("serviceRequests", {
      networkId: shape.otherNetworkId ?? f.networkId,
      offerId: shape.offer === "be" ? f.offerBe : f.offerFr,
      offerVersion: 1,
      offerTitle: "Tresses africaines",
      pageId: f.salon,
      requesterPersonId: f.plain.personId,
      need: PRIVATE_NEED,
      windows: [{ startAt: shape.at + DAY_MS, endAt: shape.at + DAY_MS + 2 * HOUR_MS }],
      timeZone: "Europe/Paris",
      status: shape.status,
      identityConsentAt: shape.at,
      idempotencyKey: key,
      idempotencyFingerprint: key,
      expiresAt: shape.at + DAY_MS + 2 * HOUR_MS,
      ...(open ? { deadlineAt: shape.deadlineAt ?? NOW + DAY_MS } : {}),
      proposalVersion: shape.proposedAfterHours === undefined ? 0 : 1,
      ...(closedBy === undefined ? {} : { closedBy, closedAt: shape.at + (shape.refusedAfterHours ?? 2) * HOUR_MS }),
      createdAt: shape.at,
      updatedAt: shape.at,
    })
    if (shape.proposedAfterHours === undefined) return { requestId, bookingId: null }
    const proposedAt = shape.at + shape.proposedAfterHours * HOUR_MS
    const proposalId = await ctx.db.insert("serviceProposals", {
      networkId: f.networkId, requestId, pageId: f.salon, version: 1, authorPersonId: f.admin.personId, amountMinor: 4500, currency: "EUR",
      durationMinutes: 60, startAt: shape.at + 2 * DAY_MS, endAt: shape.at + 2 * DAY_MS + HOUR_MS, timeZone: "Europe/Paris",
      location: { mode: "remote" }, details: PRIVATE_DETAILS, cancellationTerms: "Annulation libre avant le rendez-vous.",
      expiresAt: proposedAt + 12 * HOUR_MS, state: "current", createdAt: proposedAt, updatedAt: proposedAt,
    })
    if (!shape.booked) {
      await ctx.db.patch(requestId, { currentProposalId: proposalId })
      return { requestId, bookingId: null }
    }
    const bookingId = await ctx.db.insert("serviceBookings", {
      networkId: f.networkId, requestId, proposalId, pageId: f.salon, startAt: shape.at + 2 * DAY_MS, endAt: shape.at + 2 * DAY_MS + HOUR_MS,
      timeZone: "Europe/Paris", status: bookingStatusOf(shape.status), createdAt: proposedAt, updatedAt: proposedAt,
    })
    await ctx.db.patch(requestId, { currentProposalId: proposalId, bookingId })
    return { requestId, bookingId }
  })
}

/** Une adhésion associative, née à l'instant de sa première demande. */
async function membership(f: Fixture, at: number, who: Member, status: Doc<"associationMemberships">["status"]) {
  vi.setSystemTime(at)
  await f.t.run(async (ctx) => {
    await ctx.db.insert("associationMemberships", {
      networkId: f.networkId, pageId: f.association, personId: who.personId, status, role: "member", requestMessage: PRIVATE_MESSAGE,
      requestedAt: at, statusChangedAt: at, version: 1, createdAt: at, updatedAt: at,
    })
  })
}

/** Un avis sur la prestation d'une demande réservée, avec son état de modération éventuel. */
async function review(f: Fixture, at: number, source: { readonly requestId: Id<"serviceRequests">; readonly bookingId: Id<"serviceBookings"> | null }, status: "active" | "withdrawn", moderation: "published" | "pending_review" | null) {
  const bookingId = source.bookingId
  if (bookingId === null) throw new Error("Un avis de recette exige un rendez-vous")
  vi.setSystemTime(at)
  await f.t.run(async (ctx) => {
    const reviewId = await ctx.db.insert("serviceReviews", {
      networkId: f.networkId, requestId: source.requestId, bookingId, offerId: f.offerFr, pageId: f.salon, authorPersonId: f.plain.personId,
      rating: 4, body: PRIVATE_REVIEW, proof: "completion_declared", consentToPublishAt: at, version: 1, status, createdAt: at, updatedAt: at,
      ...(status === "withdrawn" ? { withdrawnAt: at } : {}),
    })
    if (moderation !== null) {
      await ctx.db.insert("moderationContentStates", { networkId: f.networkId, targetKind: "serviceReview", targetId: reviewId, ownerPersonId: f.plain.personId, status: moderation, createdAt: at, updatedAt: at })
    }
  })
}

/** Un évènement (de page par défaut) et ses participations : une place confirmée par entrée, pointée ou non. */
async function event(f: Fixture, startAt: number, status: "scheduled" | "cancelled", attendance: readonly boolean[], options: { readonly personal?: boolean; readonly waiting?: number } = {}) {
  sequence += 1
  const key = `pilote-evenement-${sequence}`
  await f.t.run(async (ctx) => {
    const eventId = await ctx.db.insert("events", {
      networkId: f.networkId,
      ...(options.personal ? { organizerPersonId: f.admin.personId } : { organizerPageId: f.association, createdByPersonId: f.admin.personId, pageAudience: "network" as const }),
      title: "Rencontre de recette", startAt, endAt: startAt + 2 * HOUR_MS, timeZone: "Europe/Paris", status, version: 1,
      idempotencyKey: key, createdAt: START, updatedAt: START,
    })
    const people = [f.admin.personId, f.moderator.personId, f.plain.personId]
    for (const [index, checkedIn] of attendance.entries()) {
      await ctx.db.insert("eventParticipants", {
        networkId: f.networkId, eventId, personId: people[index % people.length] ?? f.plain.personId, invitedByPersonId: f.admin.personId,
        status: "accepted", eventStartAt: startAt, createdAt: START,
        ...(checkedIn ? { pageAttendanceCheckedInAt: startAt + HOUR_MS, pageAttendanceVersion: 1 } : {}),
      })
    }
    for (let index = 0; index < (options.waiting ?? 0); index += 1) {
      await ctx.db.insert("eventParticipants", {
        networkId: f.networkId, eventId, personId: f.plain.personId, invitedByPersonId: f.admin.personId, status: "pending",
        pageRegistrationSequence: index + 1, eventStartAt: startAt, createdAt: START,
      })
    }
  })
}

/** Le passage nocturne au 18 octobre, mené jusqu'à sa dernière étape. */
async function runPass(f: Fixture, pageSize?: number) {
  vi.setSystemTime(NOW)
  await f.t.mutation(REFRESH, pageSize === undefined ? {} : { pageSize })
  await f.t.finishAllScheduledFunctions(vi.runAllTimers)
}

function storedRows(f: Fixture) {
  return f.t.run(async (ctx) => await ctx.db.query("pilotMetricsDaily").withIndex("by_network_and_dayStartAt", (q) => q.eq("networkId", f.networkId)).take(2000))
}

/** Les lignes, sans identifiant de document ni date de passage : ce que deux passages doivent rendre égal. */
function snapshot(rows: readonly Doc<"pilotMetricsDaily">[]) {
  return rows
    .map((row) => ({ country: row.country, dayStartAt: row.dayStartAt, counts: row.counts, firstResponse: row.firstResponse, offersActive: row.offersActive ?? null }))
    .sort((left, right) => left.dayStartAt - right.dayStartAt || String(left.country).localeCompare(String(right.country)))
}

async function measured(as: Member["as"], args: { readonly networkId: Id<"networks">; readonly country?: string | null; readonly days: number }) {
  const view = await as.query(PILOT.pilotMetrics, args)
  if (!view.measured) throw new Error("Mesure attendue après le passage")
  return { view, byId: new Map(view.indicators.map((indicator) => [indicator.id, indicator])) }
}

/** La cohorte de recette : douze demandes en France, une en Belgique, une hors réseau. */
async function seedCohort(f: Fixture) {
  const first = await request(f, { at: daysAgo(6, 9), status: "completed", proposedAfterHours: 2, booked: true })
  await request(f, { at: daysAgo(6, 10), status: "completed", proposedAfterHours: 3, booked: true })
  await request(f, { at: daysAgo(5, 9), status: "completed", proposedAfterHours: 5, booked: true })
  await request(f, { at: daysAgo(5, 10), status: "cancelled", proposedAfterHours: 10, booked: true })
  await request(f, { at: daysAgo(4, 9), status: "confirmed", proposedAfterHours: 20, booked: true })
  await request(f, { at: daysAgo(4, 10), status: "refused", refusedAfterHours: 1 })
  await request(f, { at: daysAgo(3, 9), status: "refused", refusedAfterHours: 30 })
  await request(f, { at: daysAgo(3, 10), status: "expired" })
  await request(f, { at: daysAgo(3, 11), status: "sent", offer: "be" })
  await request(f, { at: daysAgo(2, 9), status: "expired" })
  // Une échéance atteinte que le passage d'expiration n'a pas encore écrite.
  await request(f, { at: daysAgo(2, 10), status: "sent", deadlineAt: daysAgo(1, 0) })
  // Une ligne d'un autre réseau : jamais comptée.
  await request(f, { at: daysAgo(2, 11), status: "sent", otherNetworkId: f.root })
  await membership(f, daysAgo(2, 12), f.plain, "accepted")
  await request(f, { at: daysAgo(1, 9), status: "sent" })
  await request(f, { at: daysAgo(1, 10), status: "cancelled" })
  await membership(f, daysAgo(1, 12), f.moderator, "requested")
  await review(f, daysAgo(1, 13), first, "active", "published")
  await review(f, daysAgo(1, 14), first, "active", null)
  await review(f, daysAgo(1, 15), first, "withdrawn", "published")
  // Six places confirmées dont quatre pointées, une attente ; un évènement annulé et un évènement personnel ne comptent pas.
  await event(f, daysAgo(3, 18), "scheduled", [true, true, true, true, false, false], { waiting: 1 })
  await event(f, daysAgo(2, 18), "cancelled", [true, true, true, true, true])
  await event(f, daysAgo(2, 19), "scheduled", [true, true, true, true, true], { personal: true })
  await f.t.run(async (ctx) => {
    for (let index = 0; index < 5; index += 1) await ctx.db.insert("serviceOffers", offerFields(f.networkId, f.salon, "FR"))
    await ctx.db.insert("serviceOffers", offerFields(f.networkId, f.salon, "FR", "paused"))
    const closed = await ctx.db.insert("pages", pageFields(f.networkId, "salon-ferme", "company", "inactive"))
    await ctx.db.insert("serviceOffers", offerFields(f.networkId, closed, "FR"))
  })
  return { first }
}

describe("mesure du pilote — accès réservé aux responsables du réseau", () => {
  it("un simple membre reçoit le refus indistinct, avant tout jugement de ses arguments", async () => {
    const f = await fixture()
    vi.setSystemTime(NOW)
    expect(await f.plain.as.query(PILOT.pilotMetricsAccess, { networkId: f.networkId })).toEqual({ allowed: false })
    expect(await code(f.plain.as.query(PILOT.pilotMetrics, { networkId: f.networkId, days: 30 }))).toBe("notFound")
    expect(await code(f.plain.as.query(PILOT.pilotMetrics, { networkId: f.networkId, days: 14, country: "GA" }))).toBe("notFound")
    expect(await f.admin.as.query(PILOT.pilotMetricsAccess, { networkId: f.networkId })).toEqual({ allowed: true })
    expect(await f.moderator.as.query(PILOT.pilotMetricsAccess, { networkId: f.networkId })).toEqual({ allowed: true })
  })

  it("une personne hors de DIASPORALE ne lit rien, même par la racine", async () => {
    const f = await fixture()
    vi.setSystemTime(NOW)
    const subject = "pilote-exterieur"
    const sessionId = await createTestSession(f.t, subject, SESSION_END)
    const outsider = f.t.withIdentity({ subject, sessionId })
    await outsider.mutation(api.modules.people.persons.ensureMyPerson, {})
    await outsider.mutation(api.modules.people.consents.recordConsent, { purpose: "social_profile", origin: "onboarding" })
    await outsider.mutation(api.modules.people.profile.publishMyProfile, { handle: "pilote-exterieur", displayName: "Carla ONDO" })
    await outsider.mutation(api.modules.people.memberships.joinNetwork, { networkId: f.root })
    expect(await code(outsider.query(PILOT.pilotMetrics, { networkId: f.networkId, days: 30 }))).toBe("notFound")
    expect(await code(outsider.query(PILOT.pilotMetricsAccess, { networkId: f.networkId }))).toBe("notFound")
  })

  it("un rôle d'administrateur d'un autre réseau n'ouvre rien : la racine n'est pas gouvernée par la tranche", async () => {
    const f = await fixture()
    await setRole(f.t, f.root, f.admin, "network_admin")
    vi.setSystemTime(NOW)
    expect(await code(f.admin.as.query(PILOT.pilotMetrics, { networkId: f.root, days: 30 }))).toBe("notFound")
    expect(await code(f.admin.as.query(PILOT.pilotMetricsAccess, { networkId: f.root }))).toBe("notFound")
  })

  it("avant le premier passage, la mesure se dit non faite ; les arguments hors liste sont refusés au responsable", async () => {
    const f = await fixture()
    vi.setSystemTime(NOW)
    expect(await f.admin.as.query(PILOT.pilotMetrics, { networkId: f.networkId, days: 30 })).toEqual({ measured: false, country: null, days: 30, threshold: PILOT_DISPLAY_THRESHOLD })
    expect(await f.moderator.as.query(PILOT.pilotMetrics, { networkId: f.networkId, country: "fr", days: 7 })).toEqual({ measured: false, country: "FR", days: 7, threshold: PILOT_DISPLAY_THRESHOLD })
    expect(await code(f.admin.as.query(PILOT.pilotMetrics, { networkId: f.networkId, days: 14 }))).toBe("pilot_metrics_window_invalid")
    expect(await code(f.admin.as.query(PILOT.pilotMetrics, { networkId: f.networkId, days: 30, country: "GA" }))).toBe("pilot_metrics_country_invalid")
    expect(await code(f.admin.as.query(PILOT.pilotMetrics, { networkId: f.networkId, days: 30, country: "XX" }))).toBe("pilot_metrics_country_invalid")
  })
})

describe("mesure du pilote — seuil, bases et classes de délai", () => {
  it("compte la cohorte d'un pays : un compte sous 5 se dit « moins de 5 », chaque taux garde sa base", async () => {
    const f = await fixture()
    await seedCohort(f)
    await runPass(f)
    const { view, byId } = await measured(f.admin.as, { networkId: f.networkId, country: "FR", days: 7 })
    expect(view).toMatchObject({ country: "FR", days: 7, threshold: PILOT_DISPLAY_THRESHOLD, windowStartAt: TODAY - 7 * DAY_MS, windowEndAt: TODAY, computedAt: NOW, daysMeasured: 7 })
    expect(view.indicators.map((indicator) => indicator.id)).toEqual([...PILOT_METRIC_IDS])
    // Six offres actives en France : une en pause et une d'une page fermée ne comptent pas.
    expect(byId.get("offers_active")).toEqual({ id: "offers_active", group: "services", kind: "snapshot", value: { kind: "value", value: 6 } })
    expect(byId.get("requests_sent")).toEqual({ id: "requests_sent", group: "services", kind: "count", value: { kind: "value", value: 12 } })
    expect(byId.get("requests_answered")).toEqual({
      id: "requests_answered", group: "services", kind: "ratio", denominatorId: "requests_sent",
      value: { kind: "value", value: 7 }, denominator: { kind: "value", value: 12 }, rate: { kind: "value", percent: 58 },
    })
    expect(byId.get("requests_confirmed")).toMatchObject({ value: { kind: "value", value: 5 }, denominator: { kind: "value", value: 12 }, rate: { kind: "value", percent: 42 } })
    // Trois réalisations sur cinq rendez-vous : la part se tait, la base reste visible.
    expect(byId.get("requests_completed")).toEqual({
      id: "requests_completed", group: "services", kind: "ratio", denominatorId: "requests_confirmed",
      value: { kind: "below_threshold", threshold: 5 }, denominator: { kind: "value", value: 5 }, rate: { kind: "withheld" },
    })
    expect(byId.get("requests_cancelled")).toMatchObject({ value: { kind: "below_threshold", threshold: 5 }, rate: { kind: "withheld" } })
    expect(byId.get("requests_expired")).toMatchObject({ value: { kind: "below_threshold", threshold: 5 }, rate: { kind: "withheld" } })
    // Sept réponses : la médiane tombe dans la classe « 6 h au plus », le 75e centile dans « 24 h au plus ».
    expect(byId.get("first_response_hours")).toEqual({
      id: "first_response_hours", group: "services", kind: "duration",
      sample: { kind: "value", value: 7 }, median: { kind: "at_most", hours: 6 }, p75: { kind: "at_most", hours: 24 },
    })
    expect(byId.get("memberships_requested")).toMatchObject({ kind: "count", value: { kind: "below_threshold", threshold: 5 } })
    expect(byId.get("memberships_accepted")).toMatchObject({ kind: "ratio", value: { kind: "below_threshold" }, denominator: { kind: "below_threshold" }, rate: { kind: "withheld" } })
    expect(byId.get("event_registrations")).toEqual({ id: "event_registrations", group: "events", kind: "count", value: { kind: "value", value: 6 } })
    expect(byId.get("event_attendances")).toMatchObject({ value: { kind: "below_threshold" }, denominator: { kind: "value", value: 6 }, rate: { kind: "withheld" } })
    expect(byId.get("reviews_published")).toMatchObject({ kind: "count", value: { kind: "below_threshold", threshold: 5 } })
  })

  it("tout le réseau compte aussi les lignes d'un autre pays, jamais celles d'un autre réseau ; une part trop proche de sa base est masquée", async () => {
    const f = await fixture()
    await seedCohort(f)
    await runPass(f)
    const network = await measured(f.moderator.as, { networkId: f.networkId, days: 7 })
    expect(network.view.country).toBeNull()
    expect(network.byId.get("offers_active")).toMatchObject({ value: { kind: "value", value: 7 } })
    expect(network.byId.get("requests_sent")).toMatchObject({ value: { kind: "value", value: 13 } })
    expect(network.byId.get("requests_answered")).toMatchObject({ value: { kind: "value", value: 7 }, denominator: { kind: "value", value: 13 }, rate: { kind: "value", percent: 54 } })
    expect(network.byId.get("requests_confirmed")).toMatchObject({ value: { kind: "value", value: 5 }, rate: { kind: "value", percent: 38 } })
    const belgium = await measured(f.admin.as, { networkId: f.networkId, country: "BE", days: 7 })
    expect(belgium.byId.get("requests_sent")).toMatchObject({ value: { kind: "below_threshold", threshold: 5 } })
    expect(belgium.byId.get("offers_active")).toMatchObject({ value: { kind: "below_threshold", threshold: 5 } })
    // Un pays sans activité est mesuré (le réseau l'est) : tout y est sous le seuil.
    const canada = await measured(f.admin.as, { networkId: f.networkId, country: "CA", days: 30 })
    expect(canada.view.daysMeasured).toBe(30)
    expect(canada.view.indicators.every((indicator) => indicator.kind === "duration" ? indicator.sample.kind === "below_threshold" : indicator.value.kind === "below_threshold")).toBe(true)
    // Les lignes brutes : la ligne du jour garde les comptes exacts, jamais rendus sous le seuil.
    const rows = await storedRows(f)
    const lastDay = TODAY - DAY_MS
    const franceLastDay = rows.find((row) => row.country === "FR" && row.dayStartAt === lastDay)
    expect(franceLastDay?.counts).toMatchObject({ requestsSent: 2, requestsCancelled: 1, membershipsRequested: 1, reviewsPublished: 1 })
    expect(franceLastDay?.offersActive).toBe(6)
    const franceDayTwo = rows.find((row) => row.country === "FR" && row.dayStartAt === TODAY - 2 * DAY_MS)
    expect(franceDayTwo?.counts).toMatchObject({ requestsSent: 2, requestsExpired: 2, membershipsRequested: 1, membershipsAccepted: 1 })
  })

  it("aucun texte privé ni identifiant de personne n'entre dans les agrégats ni dans la lecture", async () => {
    const f = await fixture()
    await seedCohort(f)
    await runPass(f)
    const stored = JSON.stringify(await storedRows(f))
    const read = JSON.stringify(await f.admin.as.query(PILOT.pilotMetrics, { networkId: f.networkId, country: "FR", days: 90 }))
    for (const forbidden of [PRIVATE_NEED, PRIVATE_DETAILS, PRIVATE_REVIEW, PRIVATE_MESSAGE, f.plain.personId, f.admin.personId, f.moderator.personId, f.salon, f.offerFr]) {
      expect(stored).not.toContain(forbidden)
      expect(read).not.toContain(forbidden)
    }
  })
})

describe("mesure du pilote — fenêtres de 7, 30 et 90 jours", () => {
  it("une demande compte dans les périodes qui contiennent son jour, jamais hors de la plage recalculée", async () => {
    const f = await fixture()
    await request(f, { at: daysAgo(100), status: "sent" })
    for (let hour = 8; hour < 13; hour += 1) await request(f, { at: daysAgo(40, hour), status: "sent" })
    for (let hour = 8; hour < 13; hour += 1) await request(f, { at: daysAgo(10, hour), status: "sent" })
    await runPass(f)
    const week = await measured(f.admin.as, { networkId: f.networkId, country: "FR", days: 7 })
    const month = await measured(f.admin.as, { networkId: f.networkId, country: "FR", days: 30 })
    const quarter = await measured(f.admin.as, { networkId: f.networkId, country: "FR", days: 90 })
    expect(week.byId.get("requests_sent")).toMatchObject({ value: { kind: "below_threshold", threshold: 5 } })
    expect(month.byId.get("requests_sent")).toMatchObject({ value: { kind: "value", value: 5 } })
    expect(quarter.byId.get("requests_sent")).toMatchObject({ value: { kind: "value", value: 10 } })
    expect(month.view).toMatchObject({ windowStartAt: TODAY - 30 * DAY_MS, windowEndAt: TODAY, daysMeasured: 30 })
    expect(quarter.view).toMatchObject({ windowStartAt: TODAY - 90 * DAY_MS, windowEndAt: TODAY, daysMeasured: 90 })
    const rows = await storedRows(f)
    // Tout le réseau : un jour par ligne sur les 90 jours recalculés, rien avant.
    expect(rows.filter((row) => row.country === null)).toHaveLength(90)
    expect(rows.some((row) => row.dayStartAt < TODAY - 90 * DAY_MS || row.dayStartAt >= TODAY)).toBe(false)
  })
})

describe("mesure du pilote — idempotence du passage", () => {
  it("un passage rejoué, par petits lots ou non, rend les mêmes lignes : une par jour et par portée", async () => {
    const f = await fixture()
    await seedCohort(f)
    await runPass(f, 2)
    const paged = await storedRows(f)
    await runPass(f)
    const replayed = await storedRows(f)
    expect(snapshot(replayed)).toEqual(snapshot(paged))
    expect(replayed).toHaveLength(paged.length)
    const keys = replayed.map((row) => `${row.dayStartAt}|${row.country ?? "network"}`)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it("une ligne source disparue (effacement) remet son jour à zéro au passage suivant, sans ligne en double", async () => {
    const f = await fixture()
    const belgian = await request(f, { at: daysAgo(3, 11), status: "sent", offer: "be" })
    await runPass(f)
    const dayStartAt = TODAY - 3 * DAY_MS
    const before = (await storedRows(f)).filter((row) => row.dayStartAt === dayStartAt)
    expect(before.find((row) => row.country === "BE")?.counts.requestsSent).toBe(1)
    await f.t.run(async (ctx) => { await ctx.db.delete(belgian.requestId) })
    await runPass(f)
    const after = (await storedRows(f)).filter((row) => row.dayStartAt === dayStartAt)
    expect(after).toHaveLength(before.length)
    expect(after.find((row) => row.country === "BE")?.counts.requestsSent).toBe(0)
    expect(after.find((row) => row.country === null)?.counts.requestsSent).toBe(0)
  })
})

describe("mesure du pilote — console du moteur", () => {
  it("un opérateur lit la même projection ; personne d'autre, et jamais pour un réseau non gouverné", async () => {
    const f = await fixture()
    await seedCohort(f)
    await runPass(f)
    const operator = await member(f.t, f.networkId, "pilote-operateur", "Clarisse MBÉI")
    await f.t.run(async (ctx) => { await ctx.db.insert("operators", { personId: operator.personId, role: "platform_operator", grantedAt: Date.now() }) })
    await createTestOperatorProof(f.t, operator.as, operator.personId)
    const fromConsole = await operator.as.query(PILOT.consolePilotMetrics, { networkId: f.networkId, country: "FR", days: 7 })
    expect(fromConsole).toEqual(await f.admin.as.query(PILOT.pilotMetrics, { networkId: f.networkId, country: "FR", days: 7 }))
    expect(await code(operator.as.query(PILOT.consolePilotMetrics, { networkId: f.root, days: 7 }))).toBe("notFound")
    expect(await code(f.admin.as.query(PILOT.consolePilotMetrics, { networkId: f.networkId, days: 7 }))).toBe("operatorRequired")
  })
})

describe("mesure du pilote — l'utilité de l'entraide (ET-10)", () => {
  type QuestionShape = { readonly at: number; readonly country?: string; readonly status?: Doc<"aidQuestions">["status"]; readonly accepted?: boolean; readonly answeredAfterHours?: number; readonly removed?: boolean }

  /** Une question d'entraide fictive, datée de sa création ; sa première réponse publiée, si elle en a une. */
  async function question(f: Fixture, shape: QuestionShape) {
    vi.setSystemTime(shape.at)
    await f.t.run(async (ctx) => {
      const questionId = await ctx.db.insert("aidQuestions", {
        networkId: f.networkId, authorPersonId: f.plain.personId, title: "Question privée de recette", detail: PRIVATE_NEED, theme: "housing",
        country: shape.country ?? "FR", status: shape.status ?? "open", answerCount: shape.answeredAfterHours === undefined ? 0 : 1, version: 1,
        createdAt: shape.at, updatedAt: shape.at,
      })
      if (shape.answeredAfterHours !== undefined) {
        const answeredAt = shape.at + shape.answeredAfterHours * HOUR_MS
        const answerId = await ctx.db.insert("aidAnswers", {
          networkId: f.networkId, questionId, authorPersonId: f.admin.personId, body: PRIVATE_DETAILS, status: "published", version: 1, createdAt: answeredAt, updatedAt: answeredAt,
        })
        if (shape.accepted) await ctx.db.patch(questionId, { acceptedAnswerId: answerId })
      }
      if (shape.removed) {
        await ctx.db.insert("moderationContentStates", { networkId: f.networkId, targetKind: "diasporaAidQuestion", targetId: questionId, ownerPersonId: f.plain.personId, status: "removed", createdAt: shape.at, updatedAt: shape.at })
      }
    })
  }

  async function signup(f: Fixture, at: number, status: Doc<"aidMissionSignups">["status"]) {
    vi.setSystemTime(at)
    await f.t.run(async (ctx) => {
      const missionId = await ctx.db.insert("aidMissions", {
        networkId: f.networkId, pageId: f.association, title: "Mission de recette", description: "Mission fictive de recette.", country: "BE", city: "Bruxelles", cityKey: "bruxelles",
        startsAt: at + 5 * DAY_MS, timeZone: "Europe/Brussels", places: 10, signupCount: status === "confirmed" ? 1 : 0, status: "open", version: 1, createdAt: at, updatedAt: at,
      })
      await ctx.db.insert("aidMissionSignups", { networkId: f.networkId, missionId, personId: f.plain.personId, status, nameConsentAt: at, signedUpAt: at, createdAt: at, updatedAt: at })
    })
  }

  async function mentoring(f: Fixture, at: number, accepted: boolean) {
    vi.setSystemTime(at)
    await f.t.run(async (ctx) => {
      const mentorProfileId = await ctx.db.insert("mentorProfiles", {
        networkId: f.networkId, personId: f.admin.personId, state: "active", domains: ["housing"], presentation: "Présentation fictive de recette pour le mentorat.", languages: ["fr"],
        country: "FR", availability: "Le soir", maxActiveMentees: 3, version: 1, optedInAt: at, listedAt: at, createdAt: at, updatedAt: at,
      })
      await ctx.db.insert("mentoringRequests", {
        networkId: f.networkId, mentorProfileId, mentorPersonId: f.admin.personId, menteePersonId: f.plain.personId, domain: "housing", goal: "Objectif privé", message: PRIVATE_MESSAGE,
        wishedSlots: [], timeZone: "Europe/Paris", consentAt: at, idempotencyKey: `cle-recette-${at}`, idempotencyFingerprint: `empreinte-${at}`, expiresAt: at + 14 * DAY_MS,
        status: accepted ? "accepted" : "sent", slotVersion: 0, ...(accepted ? { acceptedAt: at + HOUR_MS } : {}), createdAt: at, updatedAt: at,
      })
    })
  }

  async function kitResource(f: Fixture, country: string, lastVerifiedAt: number, status: Doc<"kitResources">["status"] = "published") {
    await f.t.run(async (ctx) => {
      await ctx.db.insert("kitResources", {
        networkId: f.networkId, authorPersonId: f.plain.personId, proposedByPersonId: f.plain.personId, revisedByPersonId: f.plain.personId, title: "Ressource de recette", summary: "Résumé fictif de recette.",
        body: "Contenu fictif de recette.", category: "housing", country, cityKey: "", sourceName: "Source fictive", sourceUrl: "https://www.exemple-public.fr/recette", lastVerifiedAt, status,
        listed: status === "published" || status === "needs_review", revision: 1, version: 1, outdatedFlags: 0, revisedAt: START, createdAt: START, updatedAt: START,
      })
    })
  }

  /** Vingt questions en France sur trois jours, une en Belgique, et ce qui ne compte pas. */
  async function seedAid(f: Fixture) {
    for (let index = 0; index < 20; index += 1) {
      await question(f, { at: daysAgo(2 + (index % 3), 8 + (index % 10)), accepted: index < 12, status: index < 12 ? "resolved" : "open", ...(index < 16 ? { answeredAfterHours: index + 1 } : {}) })
    }
    await question(f, { at: daysAgo(2, 20), country: "BE" })
    await question(f, { at: daysAgo(2, 21), status: "withdrawn", answeredAfterHours: 1 })
    await question(f, { at: daysAgo(2, 22), removed: true })
    for (let index = 0; index < 6; index += 1) await signup(f, daysAgo(3, 8 + index), index < 5 ? "confirmed" : "withdrawn")
    for (let index = 0; index < 7; index += 1) await mentoring(f, daysAgo(4, 8 + index), index < 2)
    vi.setSystemTime(START)
    for (let index = 0; index < 6; index += 1) await kitResource(f, "FR", NOW - 30 * DAY_MS)
    await kitResource(f, "FR", NOW - 400 * DAY_MS)
    await kitResource(f, "FR", NOW - 10 * DAY_MS, "needs_review")
    await kitResource(f, "FR", NOW - 10 * DAY_MS, "submitted")
  }

  it("la première aide aboutie se lit avec sa base ; délai, inscriptions, mentorat et kit ; sous le seuil, « moins de 5 »", async () => {
    const f = await fixture()
    await seedAid(f)
    await runPass(f)
    const { byId } = await measured(f.admin.as, { networkId: f.networkId, country: "FR", days: 7 })
    expect(byId.get("aid_questions_asked")).toEqual({ id: "aid_questions_asked", group: "mutual_aid", kind: "count", value: { kind: "value", value: 20 } })
    expect(byId.get("aid_questions_resolved")).toEqual({
      id: "aid_questions_resolved", group: "mutual_aid", kind: "ratio", denominatorId: "aid_questions_asked",
      value: { kind: "value", value: 12 }, denominator: { kind: "value", value: 20 }, rate: { kind: "value", percent: 60 },
    })
    expect(byId.get("aid_questions_answered")).toMatchObject({ value: { kind: "complement_below_threshold" }, denominator: { kind: "value", value: 20 }, rate: { kind: "withheld" } })
    expect(byId.get("aid_first_answer_hours")).toEqual({ id: "aid_first_answer_hours", group: "mutual_aid", kind: "duration", sample: { kind: "value", value: 16 }, median: { kind: "at_most", hours: 8 }, p75: { kind: "at_most", hours: 12 } })
    // Les inscriptions sont en Belgique : la France n'en compte aucune ; tout le réseau en compte cinq confirmées.
    expect(byId.get("aid_signups")).toMatchObject({ kind: "count", value: { kind: "below_threshold", threshold: PILOT_DISPLAY_THRESHOLD } })
    expect(byId.get("mentoring_requested")).toMatchObject({ kind: "count", value: { kind: "value", value: 7 } })
    expect(byId.get("mentoring_accepted")).toMatchObject({ kind: "ratio", value: { kind: "below_threshold" }, denominator: { kind: "value", value: 7 } })
    expect(byId.get("kit_resources_listed")).toEqual({ id: "kit_resources_listed", group: "mutual_aid", kind: "snapshot", value: { kind: "value", value: 8 } })
    expect(byId.get("kit_resources_to_review")).toMatchObject({ kind: "ratio", denominatorId: "kit_resources_listed", value: { kind: "below_threshold" }, denominator: { kind: "value", value: 8 } })

    const network = await measured(f.admin.as, { networkId: f.networkId, days: 7 })
    expect(network.byId.get("aid_signups")).toMatchObject({ value: { kind: "value", value: 5 } })
    // La question belge compte pour tout le réseau ; la retirée et la question retirée par la modération, jamais.
    expect(network.byId.get("aid_questions_asked")).toMatchObject({ value: { kind: "value", value: 21 } })
    // Aucun texte privé n'entre dans une ligne.
    expect(JSON.stringify(await storedRows(f))).not.toMatch(/privé|recette/i)
  })

  it("le passage rejoué, par petits lots ou non, rend les mêmes lignes de l'entraide", async () => {
    const f = await fixture()
    await seedAid(f)
    await runPass(f, 3)
    const paged = (await storedRows(f)).map((row) => ({ day: row.dayStartAt, country: row.country, counts: row.counts, aidFirstAnswer: row.aidFirstAnswer, kitListed: row.kitListed ?? null, kitToReview: row.kitToReview ?? null }))
    await runPass(f)
    const replayed = (await storedRows(f)).map((row) => ({ day: row.dayStartAt, country: row.country, counts: row.counts, aidFirstAnswer: row.aidFirstAnswer, kitListed: row.kitListed ?? null, kitToReview: row.kitToReview ?? null }))
    const order = (rows: typeof paged) => [...rows].sort((left, right) => left.day - right.day || String(left.country).localeCompare(String(right.country)))
    expect(order(replayed)).toEqual(order(paged))
    expect(replayed.some((row) => (row.counts.aidQuestionsAsked ?? 0) > 0)).toBe(true)
  })

  it("une ligne écrite avant ET-10, sans compteur de l'entraide, se lit zéro, sans erreur", async () => {
    const f = await fixture()
    await runPass(f)
    await f.t.run(async (ctx) => {
      const rows = await ctx.db.query("pilotMetricsDaily").withIndex("by_network_and_dayStartAt", (q) => q.eq("networkId", f.networkId)).take(500)
      for (const row of rows) {
        const { aidQuestionsAsked: _a, aidQuestionsAnswered: _b, aidQuestionsResolved: _c, aidSignups: _d, mentoringRequested: _e, mentoringAccepted: _f, ...legacy } = row.counts
        await ctx.db.replace(row._id, { networkId: row.networkId, country: row.country, dayStartAt: row.dayStartAt, counts: legacy, firstResponse: row.firstResponse, computedAt: row.computedAt, ...(row.offersActive === undefined ? {} : { offersActive: row.offersActive }) })
      }
    })
    const { byId } = await measured(f.admin.as, { networkId: f.networkId, days: 30 })
    expect(byId.get("aid_questions_asked")).toMatchObject({ value: { kind: "below_threshold" } })
    expect(byId.get("kit_resources_listed")).toMatchObject({ value: { kind: "below_threshold" } })
  })
})
