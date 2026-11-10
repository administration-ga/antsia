// @vitest-environment edge-runtime
/** Mentorat DIASPORALE (DG-024) : vraies sessions, opt-in, plafonds, paires, échéances, visibilité de la facette, blocages. */
import { engineErrorAppRule, engineErrorCode } from "@antsia/social-contracts/errors"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { api, internal } from "../../_generated/api"
import type { Id } from "../../_generated/dataModel"
import { SEED_CONFIRMATION } from "../../seeds/foundations"
import { createTestSession, testConvex } from "../../test.setup"

type T = ReturnType<typeof testConvex>
const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
/** Dimanche 18 octobre 2026, 10 h UTC. */
const NOW = Date.UTC(2026, 9, 18, 10)
/** Échéance des sessions de test : au-delà du plus long saut d'horloge (quinze jours) ; la session automatique du harnais ne dure que sept jours. */
const SESSION_END = NOW + 30 * DAY
const M = api.modules.diaspora.mentoring
const KEY = "2b4a7a0e-6a52-4c8e-9a52-7f1f0b6c2d11"
const PRESENTATION = "Arrivée à Paris en 2015, j'aide les nouveaux venus à trouver un logement et à faire leurs démarches."
const MESSAGE = "Je viens d'arriver à Paris pour mes études et je cherche des conseils pour le logement."
const PAGE_OPTS = { numItems: 20, cursor: null }

/** Une clé d'idempotence distincte par numéro (16 signes sûrs au moins). */
const key = (index: number) => `cle-de-test-${String(index).padStart(6, "0")}`

beforeEach(() => {
  vi.stubEnv("CONVEX_CLOUD_URL", "http://127.0.0.1:3210")
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

type FacetInput = { countryOfResidence: string; city?: string; arrivedAt?: number; visibility?: { city?: "only_me" | "connections" | "country" | "network"; arrivedAt?: "only_me" | "connections" | "country" | "network" } }

/** Un membre à identité forte (IDN loa 2), profil publié, facette diaspora en France par défaut ; sa session explicite survit aux sauts d'horloge. */
async function member(t: T, networkId: Id<"networks">, handle: string, displayName = handle, facet: FacetInput = { countryOfResidence: "FR", city: "Paris" }) {
  const subject = `auth-${handle}`
  const sessionId = await createTestSession(t, subject, SESSION_END)
  const as = t.withIdentity({ subject, sessionId })
  const personId = await as.mutation(api.modules.people.persons.ensureMyPerson, {})
  await as.mutation(api.modules.people.consents.recordConsent, { purpose: "social_profile", origin: "onboarding" })
  await as.mutation(api.modules.people.profile.publishMyProfile, { handle, displayName })
  await t.run(async (ctx) => {
    await ctx.db.insert("identityLinks", { personId, provider: "idn", subject: `idn-${personId}`, loa: 2, nationality: "GA", linkedAt: NOW })
  })
  await as.mutation(api.modules.diaspora.membership.joinDiasporale, { networkId, facet })
  return { as, personId }
}

type Member = Awaited<ReturnType<typeof member>>

type ProfileOverrides = Partial<{ domains: string[]; presentation: string; languages: string[]; country: string; city: string | null; availability: string; maxActiveMentees: number }>

function profileFields(overrides: ProfileOverrides = {}) {
  return {
    domains: ["housing", "admin"], presentation: PRESENTATION, languages: ["fr", "en"], country: "FR",
    city: "Paris 11e" as string | null, availability: "Le soir en semaine", maxActiveMentees: 2, ...overrides,
  }
}

/** Les arguments de `becomeMentor` : le profil et le consentement explicite (donné par défaut). */
function profileArgs(networkId: Id<"networks">, overrides: ProfileOverrides & { consent?: boolean } = {}) {
  const { consent, ...fields } = overrides
  return { networkId, ...profileFields(fields), consent: consent ?? true }
}

/** Les arguments de `updateMentorProfile` : le profil et la version lue, sans consentement. */
function updateArgs(networkId: Id<"networks">, expectedVersion: number, overrides: ProfileOverrides = {}) {
  return { networkId, expectedVersion, ...profileFields(overrides) }
}

function requestArgs(networkId: Id<"networks">, mentorId: Id<"mentorProfiles">, overrides: Partial<{ domain: string; goal: string; message: string; wishedSlots: { startAt: number; endAt: number }[]; timeZone: string; shareWithMentor: boolean; idempotencyKey: string }> = {}) {
  return {
    networkId, mentorId, domain: "housing", goal: "Trouver un logement étudiant", message: MESSAGE,
    wishedSlots: [{ startAt: NOW + DAY, endAt: NOW + DAY + HOUR }], timeZone: "Europe/Paris", shareWithMentor: true, idempotencyKey: KEY, ...overrides,
  }
}

async function fixture(options: { maxActiveMentees?: number } = {}) {
  const t = testConvex()
  const { root } = await t.mutation(internal.seeds.foundations.run, { confirmNonProduction: SEED_CONFIRMATION })
  const { network: networkId } = await t.mutation(internal.modules.diaspora.seed.run, { confirmNonProduction: SEED_CONFIRMATION })
  const mentor = await member(t, networkId, "awa", "Awa OGOOUÉ")
  const mentee = await member(t, networkId, "yannick", "Yannick NYANGA")
  const other = await member(t, networkId, "tiers", "Tiers MBA")
  const { mentorId } = await mentor.as.mutation(M.becomeMentor, profileArgs(networkId, { maxActiveMentees: options.maxActiveMentees ?? 2 }))
  return { t, root, networkId, mentor, mentee, other, mentorId }
}

type Fixture = Awaited<ReturnType<typeof fixture>>

/** Le code fermé d'un refus : celui de la tranche s'il existe, sinon celui du moteur. */
async function codeOf(promise: Promise<unknown>) {
  try { await promise } catch (error) { return engineErrorAppRule(error)?.appRule ?? engineErrorCode(error) }
  return null
}

async function rows(t: T) {
  return await t.run(async (ctx) => ({
    profiles: await ctx.db.query("mentorProfiles").take(50),
    listings: await ctx.db.query("mentorListings").take(50),
    requests: await ctx.db.query("mentoringRequests").take(50),
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

/** G9 : pose l'état de modération d'un contenu du mentorat (la ligne publiée écrite par `becomeMentor` ou `requestMentoring`). */
async function setModeration(t: T, targetKind: "diasporaMentorProfile" | "diasporaMentoringRequest", targetId: string, status: "published" | "pending_review" | "removed") {
  await t.run(async (ctx) => {
    const row = await ctx.db.query("moderationContentStates")
      .withIndex("by_target", (q) => q.eq("targetKind", targetKind).eq("targetId", targetId)).unique()
    if (!row) throw new Error("État de modération de fixture absent")
    await ctx.db.patch(row._id, { status, updatedAt: Date.now() })
  })
}

async function search(f: Fixture, as: Member, overrides: Partial<{ country: string; domain: string }> = {}) {
  return await as.as.query(M.searchMentors, { networkId: f.networkId, country: "FR", ...overrides, paginationOpts: PAGE_OPTS })
}

async function send(f: Fixture, as: Member, overrides: Parameters<typeof requestArgs>[2] = {}) {
  return await as.as.mutation(M.requestMentoring, requestArgs(f.networkId, f.mentorId, overrides))
}

describe("mentorat DIASPORALE", () => {
  it("parcours complet : opt-in, recherche par pays et domaine, demande consentie, acceptation avec créneau, clôture, sans relation ni avis créés", async () => {
    const f = await fixture()
    const before = await socialTrace(f.t)
    const found = await search(f, f.mentee)
    expect(found.page).toEqual([expect.objectContaining({
      mentorId: f.mentorId, personId: f.mentor.personId, displayName: "Awa OGOOUÉ", handle: "awa", country: "FR",
      domains: ["housing", "admin"], languages: ["fr", "en"], acceptsRequests: true,
      // Ville de la facette aux seules relations par défaut ; année d'arrivée non saisie.
      city: null, arrivedAt: null,
    })])
    expect((await search(f, f.mentee, { domain: "housing" })).page.map((card) => card.mentorId)).toEqual([f.mentorId])
    expect((await search(f, f.mentee, { domain: "work" })).page).toEqual([])
    expect((await search(f, f.mentee, { country: "BE" })).page).toEqual([])
    expect(JSON.stringify(found.page)).not.toMatch(/@|\+33|idn-/)
    expect(await f.mentee.as.query(M.getMentorProfile, { networkId: f.networkId, mentorId: f.mentorId })).toMatchObject({
      presentation: PRESENTATION, availability: "Le soir en semaine", state: "active", isSelf: false, viewerRequest: null,
    })

    const sent = await send(f, f.mentee, { goal: "  Trouver   un logement étudiant " })
    expect(sent.created).toBe(true)
    expect((await f.mentee.as.query(M.getMentorProfile, { networkId: f.networkId, mentorId: f.mentorId }))?.viewerRequest).toEqual({ requestId: sent.requestId, status: "sent" })
    const inbox = await f.mentor.as.query(M.mentorMentoringRequests, { networkId: f.networkId, status: "sent", paginationOpts: PAGE_OPTS })
    expect(inbox.page).toEqual([expect.objectContaining({
      requestId: sent.requestId, status: "sent", viewerRole: "mentor", counterpart: { displayName: "Yannick NYANGA", handle: "yannick" },
      domain: "housing", goal: "Trouver un logement étudiant", deadlineAt: NOW + 14 * DAY, slot: null,
    })])
    expect(await f.mentor.as.query(M.getMentoringRequest, { networkId: f.networkId, requestId: sent.requestId })).toMatchObject({ message: MESSAGE, actions: ["accept", "decline"] })
    expect(await f.mentee.as.query(M.getMentoringRequest, { networkId: f.networkId, requestId: sent.requestId })).toMatchObject({
      viewerRole: "mentee", counterpart: { displayName: "Awa OGOOUÉ", handle: "awa" }, actions: ["cancel"],
    })

    const slot = { startAt: NOW + 2 * DAY, endAt: NOW + 2 * DAY + 45 * MINUTE, timeZone: " Europe/Paris " }
    expect(await f.mentor.as.mutation(M.acceptMentoringRequest, { networkId: f.networkId, requestId: sent.requestId, slot })).toEqual({ slotVersion: 1 })
    const accepted = await f.mentee.as.query(M.getMentoringRequest, { networkId: f.networkId, requestId: sent.requestId })
    expect(accepted).toMatchObject({ status: "accepted", deadlineAt: null, acceptedAt: NOW, slotVersion: 1, actions: ["close"], slot: { startAt: slot.startAt, endAt: slot.endAt, timeZone: "Europe/Paris", proposedAt: NOW } })
    expect(await f.mentor.as.query(M.myMentorProfile, { networkId: f.networkId })).toMatchObject({ activeMentees: 1, pendingRequests: 0, maxActiveMentees: 2 })

    // Un second onglet qui propose sur une version périmée est refusé ; la version courante passe.
    const next = { networkId: f.networkId, requestId: sent.requestId, startAt: NOW + 3 * DAY, endAt: NOW + 3 * DAY + HOUR, timeZone: "America/Toronto" }
    expect(await f.mentor.as.mutation(M.proposeMentoringSlot, { ...next, expectedSlotVersion: 1 })).toEqual({ slotVersion: 2 })
    expect(await codeOf(f.mentor.as.mutation(M.proposeMentoringSlot, { ...next, expectedSlotVersion: 1 }))).toBe("mentoring_slot_version_changed")
    expect(await codeOf(f.mentee.as.mutation(M.proposeMentoringSlot, { ...next, expectedSlotVersion: 2 }))).toBe("notFound")

    await f.mentee.as.mutation(M.closeMentorship, { networkId: f.networkId, requestId: sent.requestId, reason: "  Merci pour  tout " })
    expect(await f.mentor.as.query(M.getMentoringRequest, { networkId: f.networkId, requestId: sent.requestId })).toMatchObject({ status: "closed", closedBy: "mentee", closedReason: "Merci pour tout", closedAt: NOW, actions: [] })
    expect(await f.mentor.as.query(M.myMentorProfile, { networkId: f.networkId })).toMatchObject({ activeMentees: 0 })
    const mine = await f.mentee.as.query(M.menteeMentoringRequests, { networkId: f.networkId, paginationOpts: PAGE_OPTS })
    expect(mine.page.map((request) => [request.requestId, request.status])).toEqual([[sent.requestId, "closed"]])
    expect((await f.other.as.query(M.menteeMentoringRequests, { networkId: f.networkId, paginationOpts: PAGE_OPTS })).page).toEqual([])
    expect(await f.other.as.query(M.getMentoringRequest, { networkId: f.networkId, requestId: sent.requestId })).toBeNull()
    // Aucune relation ni abonnement ; seuls s'ajoutent trois avis NEUTRES du rédacteur unique :
    // demande reçue (mentor), accord (mentoré), clôture par le mentoré (mentor).
    expect(await socialTrace(f.t)).toEqual({ ...before, notifications: before.notifications + 3 })
  })

  it("on ne se mentore pas soi-même ; un mentor en pause est introuvable, puis demandable à sa reprise", async () => {
    const f = await fixture()
    expect(await codeOf(send(f, f.mentor))).toBe("mentoring_self_request")
    expect(await f.mentor.as.mutation(M.setMentorState, { networkId: f.networkId, expectedVersion: 1, state: "paused" })).toEqual({ state: "paused", version: 2 })
    // Le même état ne change rien, même sur une version périmée.
    expect(await f.mentor.as.mutation(M.setMentorState, { networkId: f.networkId, expectedVersion: 1, state: "paused" })).toEqual({ state: "paused", version: 2 })
    expect((await search(f, f.mentee)).page).toEqual([])
    expect((await search(f, f.mentee, { domain: "housing" })).page).toEqual([])
    expect(await f.mentee.as.query(M.getMentorProfile, { networkId: f.networkId, mentorId: f.mentorId })).toBeNull()
    expect(await codeOf(send(f, f.mentee))).toBe("notFound")
    // Le mentor voit encore son propre profil en pause.
    expect(await f.mentor.as.query(M.getMentorProfile, { networkId: f.networkId, mentorId: f.mentorId })).toMatchObject({ isSelf: true, state: "paused" })
    expect((await rows(f.t)).listings.map((listing) => listing.state)).toEqual(["paused", "paused"])
    expect(await codeOf(f.mentor.as.mutation(M.setMentorState, { networkId: f.networkId, expectedVersion: 1, state: "active" }))).toBe("mentor_profile_version_changed")
    expect(await f.mentor.as.mutation(M.setMentorState, { networkId: f.networkId, expectedVersion: 2, state: "active" })).toEqual({ state: "active", version: 3 })
    expect((await send(f, f.mentee)).created).toBe(true)
    expect(await f.mentee.as.query(M.getMentorProfile, { networkId: f.networkId, mentorId: "pas-un-identifiant" })).toBeNull()
  })

  it("refuse un autre réseau et le profil d'un autre réseau", async () => {
    const f = await fixture()
    expect(await codeOf(f.mentee.as.mutation(M.requestMentoring, { ...requestArgs(f.networkId, f.mentorId), networkId: f.root }))).toBe("notFound")
    expect(await codeOf(f.mentee.as.query(M.searchMentors, { networkId: f.root, country: "FR", paginationOpts: PAGE_OPTS }))).toBe("notFound")
    expect(await codeOf(f.mentor.as.query(M.myMentorProfile, { networkId: f.root }))).toBe("notFound")
    expect(await codeOf(f.other.as.mutation(M.becomeMentor, { ...profileArgs(f.networkId), networkId: f.root }))).toBe("notFound")
    const foreign = await f.t.run(async (ctx) => ctx.db.insert("mentorProfiles", {
      networkId: f.root, personId: f.other.personId, state: "active", domains: ["housing"], presentation: PRESENTATION, languages: ["fr"],
      country: "FR", availability: "Le soir", maxActiveMentees: 2, version: 1, optedInAt: NOW, listedAt: NOW, createdAt: NOW, updatedAt: NOW,
    }))
    expect(await codeOf(f.mentee.as.mutation(M.requestMentoring, requestArgs(f.networkId, foreign, { idempotencyKey: key(1) })))).toBe("notFound")
    expect(await f.mentee.as.query(M.getMentorProfile, { networkId: f.networkId, mentorId: foreign })).toBeNull()
    expect((await rows(f.t)).requests).toEqual([])
  })

  it("plafond : deux acceptations sur la dernière place, une seule passe ; un mentor complet ne reçoit plus de demande", async () => {
    const f = await fixture({ maxActiveMentees: 1 })
    const first = await send(f, f.mentee)
    const second = await send(f, f.other, { idempotencyKey: key(2) })
    const outcomes = await Promise.allSettled([
      f.mentor.as.mutation(M.acceptMentoringRequest, { networkId: f.networkId, requestId: first.requestId }),
      f.mentor.as.mutation(M.acceptMentoringRequest, { networkId: f.networkId, requestId: second.requestId }),
    ])
    expect(outcomes.map((outcome) => outcome.status)).toEqual(["fulfilled", "rejected"])
    expect(await codeOf(f.mentor.as.mutation(M.acceptMentoringRequest, { networkId: f.networkId, requestId: second.requestId }))).toBe("mentoring_capacity_reached")
    expect((await rows(f.t)).requests.filter((request) => request.status === "accepted")).toHaveLength(1)
    const third = await member(f.t, f.networkId, "nadia", "Nadia MPASSA")
    expect((await search(f, third)).page[0]).toMatchObject({ mentorId: f.mentorId, acceptsRequests: false })
    expect(await codeOf(send(f, third, { idempotencyKey: key(3) }))).toBe("mentoring_mentor_full")
    // Le plafond ne descend pas sous les mentorés actifs ; il monte, et la place s'ouvre.
    const profile = await f.mentor.as.query(M.myMentorProfile, { networkId: f.networkId })
    expect(profile).toMatchObject({ activeMentees: 1, pendingRequests: 1 })
    expect(await codeOf(f.mentor.as.mutation(M.updateMentorProfile, updateArgs(f.networkId, 1, { maxActiveMentees: 0 })))).toBe("mentor_capacity_invalid")
    expect(await f.mentor.as.mutation(M.updateMentorProfile, updateArgs(f.networkId, 1, { maxActiveMentees: 2 }))).toEqual({ version: 2 })
    expect(await f.mentor.as.mutation(M.acceptMentoringRequest, { networkId: f.networkId, requestId: second.requestId })).toEqual({ slotVersion: 0 })
    expect(await codeOf(f.mentor.as.mutation(M.updateMentorProfile, updateArgs(f.networkId, 2, { maxActiveMentees: 1 })))).toBe("mentor_capacity_below_active")
  })

  it("R-G05 : un double envoi rend la même demande ; un autre corps sous la même clé est un conflit ; une seule demande ouverte par paire", async () => {
    const f = await fixture()
    const first = await send(f, f.mentee)
    expect(await send(f, f.mentee, { message: `\n${MESSAGE.replace(" ", "   ")}\n` })).toEqual({ requestId: first.requestId, created: false })
    expect(await codeOf(send(f, f.mentee, { message: `${MESSAGE} Merci.` }))).toBe("mentoring_idempotency_conflict")
    expect(await codeOf(send(f, f.mentee, { idempotencyKey: key(1) }))).toBe("mentoring_pair_open")
    // Le rejeu ne dépend ni de l'heure ni de l'état du mentor : la demande créée reste la réponse.
    await f.mentor.as.mutation(M.setMentorState, { networkId: f.networkId, expectedVersion: 1, state: "paused" })
    vi.setSystemTime(NOW + 2 * DAY)
    expect(await send(f, f.mentee)).toEqual({ requestId: first.requestId, created: false })
    expect(await codeOf(send(f, f.mentee, { idempotencyKey: "court" }))).toBe("invalidArgument")
    await f.mentor.as.mutation(M.setMentorState, { networkId: f.networkId, expectedVersion: 2, state: "active" })
    await f.mentor.as.mutation(M.acceptMentoringRequest, { networkId: f.networkId, requestId: first.requestId })
    // Un mentorat en cours ferme aussi la paire ; clos, il la rouvre.
    expect(await codeOf(send(f, f.mentee, { idempotencyKey: key(2), wishedSlots: [] }))).toBe("mentoring_pair_open")
    await f.mentor.as.mutation(M.closeMentorship, { networkId: f.networkId, requestId: first.requestId })
    expect((await send(f, f.mentee, { idempotencyKey: key(3), wishedSlots: [] })).created).toBe(true)
    expect((await rows(f.t)).requests).toHaveLength(2)
  })

  it("refuse le statut insuffisant, le consentement absent, un domaine non proposé, des coordonnées et un créneau passé, sans rien écrire", async () => {
    const f = await fixture()
    await setMembership(f.t, f.networkId, f.mentee.personId, "en_attente")
    expect(await codeOf(send(f, f.mentee))).toBe("statusInsufficient")
    expect(await codeOf(f.mentee.as.mutation(M.becomeMentor, profileArgs(f.networkId)))).toBe("statusInsufficient")
    // Un compte en attente lit le réseau : il trouve les mentors, il ne leur écrit pas encore.
    expect((await search(f, f.mentee)).page).toHaveLength(1)
    await setMembership(f.t, f.networkId, f.mentee.personId, "declaree")
    expect(await codeOf(send(f, f.mentee, { shareWithMentor: false }))).toBe("mentoring_consent_required")
    expect(await codeOf(f.other.as.mutation(M.becomeMentor, profileArgs(f.networkId, { consent: false })))).toBe("mentor_consent_required")
    expect(await codeOf(send(f, f.mentee, { domain: "work" }))).toBe("mentoring_domain_not_offered")
    expect(await codeOf(send(f, f.mentee, { domain: "legal" }))).toBe("mentor_domain_invalid")
    expect(await codeOf(send(f, f.mentee, { message: `${MESSAGE} Appelez le 06 12 34 56 78.` }))).toBe("mentoring_contact_forbidden")
    expect(await codeOf(send(f, f.mentee, { wishedSlots: [{ startAt: NOW - HOUR, endAt: NOW }] }))).toBe("mentoring_slot_past")
    expect(await codeOf(f.other.as.mutation(M.becomeMentor, profileArgs(f.networkId, { country: "GA" })))).toBe("mentor_country_invalid")
    expect(await codeOf(f.mentor.as.mutation(M.becomeMentor, profileArgs(f.networkId)))).toBe("mentor_profile_exists")
    await setMembership(f.t, f.networkId, f.mentee.personId, "suspendue")
    expect(await codeOf(send(f, f.mentee))).toBe("membershipSuspended")
    const after = await rows(f.t)
    expect(after.requests).toEqual([])
    expect(after.profiles).toHaveLength(1)
  })

  it("expiration constatée à la lecture et à l'écriture, puis écrite par le passage d'expiration", async () => {
    const f = await fixture()
    const { requestId } = await send(f, f.mentee)
    vi.setSystemTime(NOW + 14 * DAY)
    expect(await f.mentee.as.query(M.getMentoringRequest, { networkId: f.networkId, requestId })).toMatchObject({ status: "expired", deadlineAt: null, actions: [] })
    expect(await codeOf(f.mentor.as.mutation(M.acceptMentoringRequest, { networkId: f.networkId, requestId }))).toBe("mentoring_request_expired")
    expect(await codeOf(f.mentor.as.mutation(M.declineMentoringRequest, { networkId: f.networkId, requestId }))).toBe("mentoring_request_expired")
    expect(await codeOf(f.mentee.as.mutation(M.cancelMentoringRequest, { networkId: f.networkId, requestId }))).toBe("mentoring_request_expired")
    expect((await f.mentor.as.query(M.mentorMentoringRequests, { networkId: f.networkId, status: "sent", paginationOpts: PAGE_OPTS })).page).toEqual([])
    expect(await f.mentor.as.query(M.myMentorProfile, { networkId: f.networkId })).toMatchObject({ pendingRequests: 0 })
    // Une demande échue n'empêche pas d'en envoyer une nouvelle.
    const fresh = await send(f, f.mentee, { idempotencyKey: key(1), wishedSlots: [] })
    expect(fresh.created).toBe(true)
    expect(await f.t.mutation(internal.modules.diaspora.mentoring.expireDueMentoringRequests, {})).toEqual({ expired: 1, hasMore: false })
    expect(await f.t.run(async (ctx) => ctx.db.get(requestId))).toMatchObject({ status: "expired", closedBy: "system", closedAt: NOW + 14 * DAY })
    const expired = await f.mentor.as.query(M.mentorMentoringRequests, { networkId: f.networkId, status: "expired", paginationOpts: PAGE_OPTS })
    expect(expired.page.map((request) => request.requestId)).toEqual([requestId])
    expect(await f.t.mutation(internal.modules.diaspora.mentoring.expireDueMentoringRequests, { limit: 1 })).toEqual({ expired: 0, hasMore: false })
  })

  it("la ville et l'année d'arrivée suivent la visibilité de la facette du mentor ; un blocage cache le mentor et coupe la demande", async () => {
    const f = await fixture()
    const open = await member(f.t, f.networkId, "rodrigue", "Rodrigue KOMO", { countryOfResidence: "FR", city: "Lyon", arrivedAt: 2015, visibility: { city: "network", arrivedAt: "network" } })
    const { mentorId: openId } = await open.as.mutation(M.becomeMentor, profileArgs(f.networkId, { city: "Lyon 7e", domains: ["studies"] }))
    const cards = (await search(f, f.mentee)).page
    expect(cards.find((card) => card.mentorId === openId)).toMatchObject({ city: "Lyon 7e", arrivedAt: 2015 })
    expect(cards.find((card) => card.mentorId === f.mentorId)).toMatchObject({ city: null, arrivedAt: null })
    // Le mentor se voit tout entier.
    expect(await f.mentor.as.query(M.getMentorProfile, { networkId: f.networkId, mentorId: f.mentorId })).toMatchObject({ isSelf: true, city: "Paris 11e" })

    const { requestId } = await send(f, f.mentee)
    await f.mentee.as.mutation(api.modules.graph.connections.blockPerson, { networkId: f.networkId, targetPersonId: f.mentor.personId })
    expect((await search(f, f.mentee)).page.map((card) => card.mentorId)).toEqual([openId])
    expect(await f.mentee.as.query(M.getMentorProfile, { networkId: f.networkId, mentorId: f.mentorId })).toBeNull()
    expect(await codeOf(f.mentor.as.mutation(M.acceptMentoringRequest, { networkId: f.networkId, requestId }))).toBe("notFound")
    // Décliner reste possible : on sort toujours d'une demande.
    expect(await f.mentor.as.mutation(M.declineMentoringRequest, { networkId: f.networkId, requestId, reason: "Indisponible" })).toBeNull()
    expect(await f.mentee.as.query(M.getMentoringRequest, { networkId: f.networkId, requestId })).toMatchObject({ status: "declined", closedBy: "mentor", closedReason: "Indisponible" })
    expect(await codeOf(send(f, f.mentee, { idempotencyKey: key(1) }))).toBe("notFound")
  })

  it("le retrait décline les demandes en attente et clôt les mentorats ; un nouvel opt-in fait revivre le profil", async () => {
    const f = await fixture()
    const active = await send(f, f.mentee)
    const pending = await send(f, f.other, { idempotencyKey: key(1) })
    await f.mentor.as.mutation(M.acceptMentoringRequest, { networkId: f.networkId, requestId: active.requestId })
    expect(await f.mentor.as.mutation(M.setMentorState, { networkId: f.networkId, expectedVersion: 1, state: "retired" })).toEqual({ state: "retired", version: 2 })
    expect(await f.t.run(async (ctx) => [await ctx.db.get(active.requestId), await ctx.db.get(pending.requestId)])).toMatchObject([
      { status: "closed", closedBy: "mentor" },
      { status: "declined", closedBy: "mentor" },
    ])
    expect((await rows(f.t)).listings).toEqual([])
    expect((await search(f, f.mentee)).page).toEqual([])
    expect(await f.mentor.as.query(M.getMentorProfile, { networkId: f.networkId, mentorId: f.mentorId })).toBeNull()
    expect(await f.mentor.as.query(M.myMentorProfile, { networkId: f.networkId })).toMatchObject({ state: "retired", activeMentees: 0 })
    expect(await codeOf(f.mentor.as.mutation(M.setMentorState, { networkId: f.networkId, expectedVersion: 2, state: "active" }))).toBe("mentor_profile_retired")
    expect(await codeOf(f.mentor.as.mutation(M.updateMentorProfile, updateArgs(f.networkId, 2)))).toBe("mentor_profile_retired")
    // Un nouvel opt-in explicite : le même profil revit, version suivante, annuaire recopié.
    expect(await f.mentor.as.mutation(M.becomeMentor, profileArgs(f.networkId, { domains: ["work"], city: null }))).toEqual({ mentorId: f.mentorId, version: 3 })
    expect((await rows(f.t)).listings.map((listing) => [listing.domain, listing.state])).toEqual([["work", "active"]])
    expect(await f.mentor.as.query(M.myMentorProfile, { networkId: f.networkId })).toMatchObject({ state: "active", domains: ["work"], city: null, optedInAt: NOW })
    expect((await search(f, f.mentee, { domain: "work" })).page.map((card) => card.mentorId)).toEqual([f.mentorId])
  })

  it("un membre redevenu « en attente » retire sa demande, décline, clôt ou se met en pause ; il n'accepte pas", async () => {
    const f = await fixture()
    const first = await send(f, f.mentee)
    const second = await send(f, f.other, { idempotencyKey: key(1) })
    await setMembership(f.t, f.networkId, f.mentor.personId, "en_attente")
    expect(await codeOf(f.mentor.as.mutation(M.acceptMentoringRequest, { networkId: f.networkId, requestId: first.requestId }))).toBe("statusInsufficient")
    expect(await f.mentor.as.mutation(M.declineMentoringRequest, { networkId: f.networkId, requestId: second.requestId })).toBeNull()
    expect(await f.mentor.as.mutation(M.setMentorState, { networkId: f.networkId, expectedVersion: 1, state: "paused" })).toEqual({ state: "paused", version: 2 })
    expect(await codeOf(f.mentor.as.mutation(M.setMentorState, { networkId: f.networkId, expectedVersion: 2, state: "active" }))).toBe("statusInsufficient")
    // Un mentor qui n'agit plus sort de la recherche, même actif.
    await setMembership(f.t, f.networkId, f.mentor.personId, "declaree")
    await f.mentor.as.mutation(M.setMentorState, { networkId: f.networkId, expectedVersion: 2, state: "active" })
    await setMembership(f.t, f.networkId, f.mentor.personId, "en_attente")
    expect((await search(f, f.mentee)).page).toEqual([])
    await setMembership(f.t, f.networkId, f.mentee.personId, "en_attente")
    expect(await f.mentee.as.mutation(M.cancelMentoringRequest, { networkId: f.networkId, requestId: first.requestId, reason: "Trouvé ailleurs" })).toBeNull()
    expect(await f.mentee.as.query(M.getMentoringRequest, { networkId: f.networkId, requestId: first.requestId })).toMatchObject({ status: "cancelled", closedBy: "mentee", closedReason: "Trouvé ailleurs" })
    expect(await codeOf(f.mentee.as.mutation(M.cancelMentoringRequest, { networkId: f.networkId, requestId: first.requestId }))).toBe("mentoring_request_closed")
    expect(await codeOf(f.other.as.mutation(M.closeMentorship, { networkId: f.networkId, requestId: second.requestId }))).toBe("mentoring_request_closed")
    expect(await codeOf(f.other.as.mutation(M.cancelMentoringRequest, { networkId: f.networkId, requestId: first.requestId }))).toBe("notFound")
  })

  it("G9 : l'état de modération va à qui gère — le mentor pour son profil, le mentoré pour sa demande — jamais au mentor d'une demande ni à un tiers", async () => {
    const f = await fixture()
    const { requestId } = await send(f, f.mentee)
    const read = (as: Member) => as.as.query(M.getMentoringRequest, { networkId: f.networkId, requestId })
    const mine = async () => (await f.mentee.as.query(M.menteeMentoringRequests, { networkId: f.networkId, paginationOpts: PAGE_OPTS })).page
    const inbox = async () => (await f.mentor.as.query(M.mentorMentoringRequests, { networkId: f.networkId, paginationOpts: PAGE_OPTS })).page

    // Publiés dès l'écriture : chaque propriétaire lit l'état ; le mentor lit la demande, sans son état.
    expect(await f.mentor.as.query(M.myMentorProfile, { networkId: f.networkId })).toMatchObject({ mentorId: f.mentorId, moderation: "published" })
    expect(await mine()).toEqual([expect.objectContaining({ requestId, viewerRole: "mentee", moderation: "published" })])
    expect(await read(f.mentee)).toMatchObject({ viewerRole: "mentee", moderation: "published" })
    expect(await read(f.mentor)).toMatchObject({ viewerRole: "mentor", moderation: null })
    expect(await inbox()).toEqual([expect.objectContaining({ requestId, viewerRole: "mentor", moderation: null })])
    // La fiche d'un mentor n'est pas une vue de gestion : aucun état, pas même pour son mentor.
    expect(await f.mentee.as.query(M.getMentorProfile, { networkId: f.networkId, mentorId: f.mentorId })).not.toHaveProperty("moderation")
    expect(await f.mentor.as.query(M.getMentorProfile, { networkId: f.networkId, mentorId: f.mentorId })).not.toHaveProperty("moderation")

    // En relecture préalable : le mentoré le lit ; le mentor et un tiers ne lisent pas la demande.
    await setModeration(f.t, "diasporaMentoringRequest", requestId, "pending_review")
    expect(await mine()).toEqual([expect.objectContaining({ requestId, moderation: "pending_review" })])
    expect(await read(f.mentee)).toMatchObject({ moderation: "pending_review" })
    expect(await read(f.mentor)).toBeNull()
    expect(await inbox()).toEqual([])
    expect(await read(f.other)).toBeNull()

    // Retirée par la modération : le mentoré le lit encore, personne d'autre.
    await setModeration(f.t, "diasporaMentoringRequest", requestId, "removed")
    expect(await mine()).toEqual([expect.objectContaining({ requestId, moderation: "removed" })])
    expect(await read(f.mentee)).toMatchObject({ moderation: "removed" })
    expect(await read(f.mentor)).toBeNull()
    expect(await inbox()).toEqual([])
    expect(await read(f.other)).toBeNull()
    expect((await f.other.as.query(M.menteeMentoringRequests, { networkId: f.networkId, paginationOpts: PAGE_OPTS })).page).toEqual([])

    // Le profil, en relecture puis retiré : son mentor le lit dans sa vue privée ; un tiers ne trouve plus le mentor.
    await setModeration(f.t, "diasporaMentorProfile", f.mentorId, "pending_review")
    expect(await f.mentor.as.query(M.myMentorProfile, { networkId: f.networkId })).toMatchObject({ mentorId: f.mentorId, moderation: "pending_review" })
    expect(await f.other.as.query(M.getMentorProfile, { networkId: f.networkId, mentorId: f.mentorId })).toBeNull()
    await setModeration(f.t, "diasporaMentorProfile", f.mentorId, "removed")
    expect(await f.mentor.as.query(M.myMentorProfile, { networkId: f.networkId })).toMatchObject({ mentorId: f.mentorId, moderation: "removed" })
    expect(await f.other.as.query(M.getMentorProfile, { networkId: f.networkId, mentorId: f.mentorId })).toBeNull()
    expect((await search(f, f.other)).page).toEqual([])
  })
})

describe("mentorat — retrouver un mentor : langue et ville (ET-04)", () => {
  const ids = async (f: Fixture, who: Member, overrides: Partial<{ domain: string; language: string; city: string }>) =>
    (await who.as.query(M.searchMentors, { networkId: f.networkId, country: "FR", ...overrides, paginationOpts: PAGE_OPTS })).page.map((card) => card.mentorId)

  it("la langue restreint ; la ville se juge sur ce que le lecteur voit : une ville tenue cachée ne se devine pas", async () => {
    const f = await fixture()
    const lyon = await member(f.t, f.networkId, "bilal", "Bilal ESSONO", { countryOfResidence: "FR", city: "Lyon", visibility: { city: "network" } })
    const { mentorId: lyonId } = await lyon.as.mutation(M.becomeMentor, profileArgs(f.networkId, { languages: ["fr", "fan"], city: "Lyon", domains: ["work"] }))

    expect(await ids(f, f.other, { language: "fan" })).toEqual([lyonId])
    expect(await ids(f, f.other, { language: "en" })).toEqual([f.mentorId])
    expect(await ids(f, f.other, { language: "fan", domain: "housing" })).toEqual([])
    expect(await ids(f, f.other, { city: " LYON " })).toEqual([lyonId])
    expect(await ids(f, f.other, { city: "Lyon", domain: "work" })).toEqual([lyonId])
    // Awa tient sa ville à ses relations : un membre qui n'en est pas ne la trouve pas par « Paris 11e ».
    expect(await ids(f, f.other, { city: "Paris 11e" })).toEqual([])
    expect((await search(f, f.other)).page.map((card) => card.mentorId).sort()).toEqual([f.mentorId, lyonId].sort())

    expect(await codeOf(ids(f, f.other, { language: "klingon" }))).toBe("mentor_language_invalid")
    expect(await codeOf(ids(f, f.other, { city: "x".repeat(81) }))).toBe("mentor_city_invalid")
  })
})
