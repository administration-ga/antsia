// @vitest-environment edge-runtime
/**
 * AS-11a — garde de non-régression de la tranche DIASPORALE : une page EN SOMMEIL est absente
 * partout comme une page retirée, et son réveil rend TOUT, sans qu'aucun objet de la page ait été
 * écrit (décision du 19/11/2026 : la garde de page masque, le réveil rend).
 *
 * Pendant le sommeil : l'offre de service est absente et ne reçoit aucune demande, l'offre d'emploi
 * est absente et refuse la candidature, l'évènement est absent et refuse l'inscription, le groupe de
 * l'association se ferme à la lecture, la publication de la page sort du fil et de son lien, la
 * fiche, l'annuaire et le hub du pays se taisent. Au réveil, tout revient, et les adhésions
 * (association, groupe, abonnement) sont intactes.
 */
import { engineErrorAppRule, engineErrorCode, engineErrorRule } from "@antsia/social-contracts/errors"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { api, internal } from "../../_generated/api"
import type { Id } from "../../_generated/dataModel"
import { SEED_CONFIRMATION } from "../../seeds/foundations"
import { testConvex } from "../../test.setup"

type T = ReturnType<typeof testConvex>
type Member = { as: ReturnType<T["withIdentity"]>; personId: Id<"persons">; handle: string }

const NOW = Date.UTC(2026, 10, 19, 10)
const HOUR = 3_600_000
const DAY = 24 * HOUR
const FIRST = { numItems: 20, cursor: null }
const HANDLE = "association-sommeil-diaspora"

const SLEEP = api.modules.pages.sleep
const PAGES = api.modules.pages.pages
const POSTS = api.modules.posts.posts
const SERVICES = api.modules.diaspora.services
const REQUESTS = api.modules.diaspora.serviceRequests
const JOBS = api.modules.diaspora.jobs
const EVENTS = api.modules.events.pageEvents
const ASSOCIATIONS = api.modules.diaspora.associations
const GROUPS = api.modules.diaspora.associationGroups
const THEMATIC = api.modules.thematicGroups.thematicGroups
const HUB = api.modules.diaspora.hubPages

/** Données fictives, aux formes des tests de chaque tranche. */
const SERVICE = {
  title: "Accompagnement aux démarches",
  description: "Aide à constituer un dossier administratif, sur rendez-vous.",
  category: "beauty" as const,
  country: "FR",
  city: "Lyon",
  delivery: "onsite" as const,
  languages: ["fr" as const],
  durationMinutes: 60,
  pricing: { mode: "from" as const, amountMinor: 3000, currency: "EUR" },
}
const JOB = {
  title: "Animateur ou animatrice d'ateliers",
  description: "Animer les ateliers du samedi pour les familles nouvellement arrivées.",
  contract: "cdi" as const,
  country: "FR",
  city: "Lyon",
  workMode: "onsite" as const,
  languages: ["fr" as const],
  payRange: { minMinor: 200000, maxMinor: 240000, currency: "EUR", period: "month" as const },
  closesAt: null,
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

/** Un membre DÉCLARÉ de DIASPORALE (IDN de garantie 1), profil publié. */
async function member(t: T, networkId: Id<"networks">, handle: string): Promise<Member> {
  const as = t.withIdentity({ subject: `page-sleep-${handle}` })
  const personId = await as.mutation(api.modules.people.persons.ensureMyPerson, {})
  await as.mutation(api.modules.people.consents.recordConsent, { purpose: "social_profile", origin: "onboarding" })
  await as.mutation(api.modules.people.profile.publishMyProfile, { handle, displayName: handle })
  await t.run(async (ctx) => {
    await ctx.db.insert("identityLinks", { personId, provider: "idn", subject: `page-sleep-idn-${personId}`, loa: 1, nationality: "GA", linkedAt: NOW })
  })
  await as.mutation(api.modules.diaspora.membership.joinDiasporale, { networkId, facet: { countryOfResidence: "FR", city: "Lyon" } })
  return { as, personId, handle }
}

/** Le refus d'un appel — règle d'application, règle du domaine, puis code du moteur ; `null` s'il réussit. */
async function refusal(promise: Promise<unknown>): Promise<string | null> {
  try {
    await promise
  } catch (error) {
    return engineErrorAppRule(error)?.appRule ?? engineErrorRule(error)?.rule ?? engineErrorCode(error) ?? "unknown"
  }
  return null
}

/**
 * Une association de Lyon et tout ce qu'elle porte : une offre de service, une offre d'emploi, un
 * évènement ouvert au réseau, un communiqué, son groupe privé ; une adhérente acceptée (membre du
 * groupe) qui suit la page, et un membre du réseau qui ne lui est pas lié.
 */
async function fixture() {
  const t = testConvex()
  await t.mutation(internal.seeds.foundations.run, { confirmNonProduction: SEED_CONFIRMATION })
  const { network: networkId } = await t.mutation(internal.modules.diaspora.seed.run, { confirmNonProduction: SEED_CONFIRMATION })
  const admin = await member(t, networkId, "sommeil-presidente")
  const editor = await member(t, networkId, "sommeil-redacteur")
  const adherent = await member(t, networkId, "sommeil-adherente")
  const neighbour = await member(t, networkId, "sommeil-voisin")
  const pageId = await t.run(async (ctx) => {
    const pageId = await ctx.db.insert("pages", {
      networkId, handle: HANDLE, name: "Association du sommeil de Lyon", ownerKind: "association", country: "FR", city: "Lyon",
      trust: "community", trustRank: 0, visibility: "network", onRoot: false, status: "active",
      searchText: "association sommeil lyon", createdAt: NOW, updatedAt: NOW,
    })
    for (const [person, role] of [[admin, "admin"], [editor, "signatory"]] as const) {
      await ctx.db.insert("pageSignatories", { networkId, pageId, personId: person.personId, role, acceptedAt: NOW, createdAt: NOW, updatedAt: NOW })
    }
    await ctx.db.insert("moderationPolicies", { networkId, surface: "event", preReview: false, maxLinks: 2, maxWrites: 100, windowMs: 60_000, updatedAt: NOW })
    return pageId
  })
  const { offerId } = await editor.as.mutation(SERVICES.createOffer, { networkId, pageId, ...SERVICE, publish: true })
  const { jobId } = await editor.as.mutation(JOBS.createJobOffer, { networkId, pageId, ...JOB, publish: true })
  const { eventId } = await admin.as.mutation(EVENTS.create, {
    networkId, pageId, title: "Rencontre de rentrée", description: "Accueil des nouveaux arrivants.", location: "Lyon",
    startAt: NOW + 2 * DAY, endAt: NOW + 2 * DAY + 2 * HOUR, timeZone: "Europe/Paris", audience: "network", idempotencyKey: "rentree-sommeil",
  })
  const { postId } = await admin.as.mutation(PAGES.publishAsPage, { networkId, pageId, body: "L'association accueille les nouveaux arrivants samedi." })
  const request = await adherent.as.mutation(ASSOCIATIONS.requestAssociationMembership, { networkId, pageId })
  await admin.as.mutation(ASSOCIATIONS.decideAssociationMembership, { networkId, membershipId: request.membershipId, expectedVersion: request.version, decision: "accept" })
  const { groupId } = await admin.as.mutation(GROUPS.createGroupForPage, { networkId, pageId, idempotencyKey: "groupe-sommeil" })
  await adherent.as.mutation(THEMATIC.join, { networkId, groupId })
  await adherent.as.mutation(PAGES.follow, { networkId, handle: HANDLE })
  return { t, networkId, pageId, offerId, jobId, eventId, postId, groupId, membershipId: request.membershipId, admin, editor, adherent, neighbour }
}

type Fixture = Awaited<ReturnType<typeof fixture>>

/** Ce qu'un lecteur voit de la page et de ses objets, sans rien écrire. */
async function sight(f: Fixture, who: Member) {
  const [offer, job, event, page, standing, group, feed, directory, hub] = await Promise.all([
    who.as.query(SERVICES.getOffer, { networkId: f.networkId, offerId: f.offerId }),
    who.as.query(JOBS.getJobOffer, { networkId: f.networkId, jobId: f.jobId }),
    who.as.query(EVENTS.get, { networkId: f.networkId, eventId: f.eventId }),
    who.as.query(PAGES.getPage, { networkId: f.networkId, handle: HANDLE }),
    who.as.query(HUB.pageStanding, { networkId: f.networkId, handle: HANDLE }),
    who.as.query(GROUPS.groupForPage, { networkId: f.networkId, pageId: f.pageId }),
    who.as.query(POSTS.feed, { networkId: f.networkId, paginationOpts: FIRST }),
    who.as.query(PAGES.discover, { networkId: f.networkId }),
    who.as.query(HUB.listCountryPages, { networkId: f.networkId, country: "FR" }),
  ])
  return {
    offer: offer !== null,
    job: job !== null,
    event: event !== null,
    page: page !== null,
    standing: standing !== null,
    group: group !== null,
    feed: feed.page.some((item) => item._id === f.postId),
    directory: directory.some((row) => row.pageId === f.pageId),
    hub: hub.associations.some((row) => row.pageId === f.pageId),
  }
}

const EVERYWHERE = { offer: true, job: true, event: true, page: true, standing: true, group: true, feed: true, directory: true, hub: true }
const NOWHERE = { offer: false, job: false, event: false, page: false, standing: false, group: false, feed: false, directory: false, hub: false }

/** Les lignes d'appartenance de l'adhérente : adhésion à l'association, au groupe, abonnement à la page. */
async function belongings(f: Fixture) {
  return await f.t.run(async (ctx) => {
    const association = await ctx.db.get(f.membershipId)
    const group = await ctx.db.query("thematicGroupMembers").withIndex("by_group_and_person", (q) => q.eq("groupId", f.groupId).eq("personId", f.adherent.personId)).unique()
    const follow = await ctx.db.query("pageFollows").withIndex("by_page_person", (q) => q.eq("pageId", f.pageId).eq("personId", f.adherent.personId)).unique()
    return { association: association?.status ?? null, group: group !== null, follow: follow !== null }
  })
}

const serviceRequest = (f: Fixture, key: string) => f.neighbour.as.mutation(REQUESTS.createServiceRequest, {
  networkId: f.networkId, offerId: f.offerId, offerVersion: 1, need: "Constituer un dossier de titre de séjour.", windows: [{ startAt: NOW + DAY, endAt: NOW + DAY + 4 * HOUR }],
  timeZone: "Europe/Paris", shareIdentityWithPage: true, idempotencyKey: key,
})
const jobApplication = (f: Fixture, key: string) => f.neighbour.as.mutation(JOBS.applyToJobOffer, {
  networkId: f.networkId, jobId: f.jobId, offerVersion: 1, message: "Bonjour, cinq ans d'animation d'ateliers et l'envie de rejoindre l'association.", shareName: true, shareTalentProfile: false, idempotencyKey: key,
})

describe("AS-11a — une page en sommeil est absente partout, et son réveil rend tout", () => {
  it("avant le sommeil, l'adhérente et un voisin voient la page et tout ce qu'elle porte", async () => {
    const f = await fixture()
    expect(await sight(f, f.adherent)).toEqual(EVERYWHERE)
    // Le voisin n'est pas adhérent : il voit que le groupe existe (sans pouvoir le lire), comme le reste.
    expect(await sight(f, f.neighbour)).toEqual(EVERYWHERE)
  })

  it("pendant le sommeil : offre, emploi, évènement, groupe, fil, lien, fiche, annuaire et hub se taisent ; demandes, candidatures et inscriptions sont refusées", async () => {
    const f = await fixture()
    await f.admin.as.mutation(SLEEP.putPageToSleep, { networkId: f.networkId, pageId: f.pageId })
    expect(await sight(f, f.adherent)).toEqual(NOWHERE)
    expect(await sight(f, f.neighbour)).toEqual(NOWHERE)
    // L'équipe elle-même ne la voit plus que dans « En sommeil ».
    expect(await sight(f, f.editor)).toMatchObject({ offer: false, job: false, page: false, feed: false, directory: false })
    expect((await f.editor.as.query(SLEEP.mySleepingPages, { networkId: f.networkId })).map((row) => [row.pageId, row.teamRole, row.canWake])).toEqual([[f.pageId, "signatory", false]])
    // Non contactable : aucune demande de service, aucune candidature, aucune inscription.
    expect(await refusal(serviceRequest(f, "6f1c5c2e-2c8e-4a77-9d0e-6a1b2c3d4e11"))).toBe("notFound")
    expect(await refusal(jobApplication(f, "candidature-sommeil-0001"))).toBe("notFound")
    expect(await refusal(f.neighbour.as.mutation(EVENTS.register, { networkId: f.networkId, eventId: f.eventId }))).toBe("notFound")
    // Le lien de la publication et le groupe de l'association : fermés à la lecture.
    expect(await refusal(f.adherent.as.query(POSTS.getPost, { networkId: f.networkId, postId: f.postId }))).toBe("notFound")
    expect(await refusal(f.adherent.as.query(GROUPS.posts, { networkId: f.networkId, groupId: f.groupId, paginationOpts: FIRST }))).toBe("notFound")
    expect(await refusal(f.adherent.as.query(ASSOCIATIONS.myAssociationMembership, { networkId: f.networkId, pageId: f.pageId }))).toBe("notFound")
    // Rien n'est écrit sur les objets de la page : l'offre, l'emploi et l'évènement gardent leur état.
    const objects = await f.t.run(async (ctx) => ({ offer: (await ctx.db.get(f.offerId))?.status, job: (await ctx.db.get(f.jobId))?.status, event: (await ctx.db.get(f.eventId))?.status }))
    expect(objects).toEqual({ offer: "active", job: "open", event: "scheduled" })
    expect(await belongings(f)).toEqual({ association: "accepted", group: true, follow: true })
  })

  it("au réveil : tout revient, les adhésions sont intactes, demandes, candidatures et inscriptions repartent", async () => {
    const f = await fixture()
    await f.admin.as.mutation(SLEEP.putPageToSleep, { networkId: f.networkId, pageId: f.pageId })
    vi.setSystemTime(NOW + HOUR)
    expect(await f.admin.as.mutation(SLEEP.wakePage, { networkId: f.networkId, pageId: f.pageId })).toEqual({ status: "active" })
    expect(await sight(f, f.adherent)).toEqual(EVERYWHERE)
    expect(await sight(f, f.neighbour)).toEqual(EVERYWHERE)
    expect(await belongings(f)).toEqual({ association: "accepted", group: true, follow: true })
    expect((await f.adherent.as.query(GROUPS.groupForPage, { networkId: f.networkId, pageId: f.pageId }))?.isMember).toBe(true)
    expect(await refusal(f.adherent.as.query(GROUPS.posts, { networkId: f.networkId, groupId: f.groupId, paginationOpts: FIRST }))).toBeNull()
    expect(await refusal(serviceRequest(f, "6f1c5c2e-2c8e-4a77-9d0e-6a1b2c3d4e12"))).toBeNull()
    expect(await refusal(jobApplication(f, "candidature-sommeil-0002"))).toBeNull()
    expect(await refusal(f.neighbour.as.mutation(EVENTS.register, { networkId: f.networkId, eventId: f.eventId }))).toBeNull()
  })
})
