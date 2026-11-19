// @vitest-environment edge-runtime
/**
 * Talents et emploi DIASPORALE (DG-025) : offres des pages, candidatures PRIVÉES,
 * profils de talent opt-in — gardes, versions, états, recherche bornée,
 * projections allowlistées, état de modération des seules vues de gestion (G9)
 * et refus indistincts.
 */
import { engineErrorAppRule, engineErrorCode } from "@antsia/social-contracts/errors"
import { cityKeyOf, DAY_MS, JOB_OFFERS_PER_PAGE_MAX, jobSearchTextOf, TALENT_SEARCH_PAGE_MAX, talentSearchTextOf } from "@diasporale/domain"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { api, internal } from "../../_generated/api"
import type { Doc, Id } from "../../_generated/dataModel"
import { SEED_CONFIRMATION } from "../../seeds/foundations"
import { isBlockedBetween } from "../graph/graph"
import { testConvex } from "../../test.setup"

type T = ReturnType<typeof testConvex>
type Member = { as: ReturnType<T["withIdentity"]>; personId: Id<"persons"> }

const NOW = Date.UTC(2026, 9, 18, 10)
const J = api.modules.diaspora.jobs
const FIRST = { numItems: 10, cursor: null }

/** Une offre fictive complète : chaque test n'en change qu'un trait. */
const OFFER = {
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

const MESSAGE = "Bonjour, cinq ans de cuisine collective et l'envie de rejoindre votre équipe."
const APPLY = { message: MESSAGE, shareName: true, shareTalentProfile: false, idempotencyKey: "candidature-recette-0001" }

const TALENT = {
  expectedVersion: null,
  title: "Comptable bilingue",
  skills: ["Comptabilité", "Paie"],
  availability: "one_month" as const,
  languages: ["fr" as const, "en" as const],
  country: "FR",
  visibility: "network" as const,
}

const CARD_KEYS = ["city", "closesAt", "contract", "country", "description", "jobId", "languages", "page", "payRange", "publishedAt", "title", "updatedAt", "version", "workMode"]
const TALENT_KEYS = ["availability", "country", "languages", "shortName", "skills", "talentId", "title", "updatedAt"]

beforeEach(() => {
  vi.stubEnv("CONVEX_CLOUD_URL", "http://127.0.0.1:3210")
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

/**
 * Un membre à identité forte (IDN loa 2) : seaux de débit ordinaires, pas
 * renforcés — l'horloge est figée, aucun jeton ne revient pendant un test.
 */
async function member(t: T, networkId: Id<"networks">, handle: string, displayName = handle): Promise<Member> {
  const as = t.withIdentity({ subject: `auth-${handle}` })
  const personId = await as.mutation(api.modules.people.persons.ensureMyPerson, {})
  await as.mutation(api.modules.people.consents.recordConsent, { purpose: "social_profile", origin: "onboarding" })
  await as.mutation(api.modules.people.profile.publishMyProfile, { handle, displayName })
  await t.run(async (ctx) => {
    await ctx.db.insert("identityLinks", { personId, provider: "idn", subject: `idn-${personId}`, loa: 2, nationality: "GA", linkedAt: NOW })
  })
  await as.mutation(api.modules.diaspora.membership.joinDiasporale, { networkId, facet: { countryOfResidence: "FR", city: "Paris" } })
  return { as, personId }
}

async function page(
  t: T,
  networkId: Id<"networks">,
  handle: string,
  options: { ownerKind?: Doc<"pages">["ownerKind"]; status?: Doc<"pages">["status"] } = {},
): Promise<Id<"pages">> {
  return await t.run(async (ctx) => ctx.db.insert("pages", {
    networkId,
    handle,
    name: `Page ${handle}`,
    ownerKind: options.ownerKind ?? "company",
    trust: "community",
    trustRank: 0,
    country: "FR",
    visibility: "network",
    onRoot: false,
    status: options.status ?? "active",
    searchText: handle,
    createdAt: NOW,
    updatedAt: NOW,
  }))
}

async function sign(t: T, networkId: Id<"networks">, pageId: Id<"pages">, personId: Id<"persons">, accepted = true): Promise<Id<"pageSignatories">> {
  return await t.run(async (ctx) => ctx.db.insert("pageSignatories", {
    networkId, pageId, personId, role: "admin", ...(accepted ? { acceptedAt: NOW } : {}), createdAt: NOW, updatedAt: NOW,
  }))
}

/** Une offre posée directement (filtres, échéances, quotas) : texte indexé et clé de ville calculés par le domaine. */
async function insertOffer(t: T, networkId: Id<"networks">, pageId: Id<"pages">, overrides: Partial<Omit<Doc<"jobOffers">, "_id" | "_creationTime">> = {}): Promise<Id<"jobOffers">> {
  const title = overrides.title ?? "Offre fictive"
  const description = overrides.description ?? "Description fictive d'une offre d'emploi de recette."
  const city = overrides.city ?? "Paris"
  return await t.run(async (ctx) => ctx.db.insert("jobOffers", {
    networkId,
    pageId,
    contract: "cdi",
    country: "FR",
    workMode: "onsite",
    languages: ["fr"],
    status: "open",
    version: 1,
    publishedAt: NOW,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
    title,
    description,
    city,
    cityKey: cityKeyOf(city),
    searchText: jobSearchTextOf({ title, description, city }),
  }))
}

/** Un profil de talent posé directement, pour une personne déjà membre. */
async function insertTalent(t: T, networkId: Id<"networks">, personId: Id<"persons">, overrides: Partial<Omit<Doc<"talentProfiles">, "_id" | "_creationTime">> = {}): Promise<Id<"talentProfiles">> {
  const title = overrides.title ?? "Développeuse web"
  const skills = overrides.skills ?? ["TypeScript", "React"]
  return await t.run(async (ctx) => ctx.db.insert("talentProfiles", {
    networkId,
    personId,
    availability: "immediate",
    languages: ["fr"],
    country: "FR",
    visibility: "network",
    status: "active",
    version: 1,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
    title,
    skills,
    searchText: talentSearchTextOf(title, skills),
  }))
}

async function setMembership(t: T, networkId: Id<"networks">, personId: Id<"persons">, status: "en_attente" | "declaree") {
  await t.run(async (ctx) => {
    const row = await ctx.db.query("networkMemberships")
      .withIndex("by_network_and_person", (q) => q.eq("networkId", networkId).eq("personId", personId)).unique()
    if (!row) throw new Error("Adhésion de fixture absente")
    await ctx.db.patch(row._id, { status })
  })
}

async function removeSignatory(t: T, pageId: Id<"pages">, personId: Id<"persons">) {
  await t.run(async (ctx) => {
    const row = await ctx.db.query("pageSignatories").withIndex("by_page_person", (q) => q.eq("pageId", pageId).eq("personId", personId)).unique()
    if (row) await ctx.db.delete(row._id)
  })
}

/** L'état de modération d'un contenu de l'emploi, posé directement (relecture préalable ou retrait), comme la modération l'écrirait. */
async function moderate(
  t: T,
  networkId: Id<"networks">,
  targetKind: "diasporaJobOffer" | "diasporaTalentProfile" | "diasporaJobApplication",
  targetId: string,
  status: "pending_review" | "removed",
  owner: { ownerPersonId?: Id<"persons">; ownerPageId?: Id<"pages"> },
) {
  await t.run(async (ctx) => {
    const existing = await ctx.db.query("moderationContentStates").withIndex("by_target", (q) => q.eq("targetKind", targetKind).eq("targetId", targetId)).unique()
    if (existing) await ctx.db.patch(existing._id, { status, updatedAt: NOW })
    else await ctx.db.insert("moderationContentStates", { networkId, targetKind, targetId, ...owner, status, createdAt: NOW, updatedAt: NOW })
  })
}

async function failure(promise: Promise<unknown>): Promise<{ code: string | null; appRule: string | null }> {
  try {
    await promise
  } catch (error) {
    return { code: engineErrorCode(error), appRule: engineErrorAppRule(error)?.appRule ?? null }
  }
  return { code: null, appRule: null }
}

async function fixture() {
  const t = testConvex()
  const { root } = await t.mutation(internal.seeds.foundations.run, { confirmNonProduction: SEED_CONFIRMATION })
  const { network: networkId } = await t.mutation(internal.modules.diaspora.seed.run, { confirmNonProduction: SEED_CONFIRMATION })
  const pro = await member(t, networkId, "pro.recrute", "Nadia Mpassa")
  const candidate = await member(t, networkId, "candidate.demo", "Mireille Ivindo")
  const reader = await member(t, networkId, "lecteur.demo", "Steeve Ngounie")
  const pageId = await page(t, networkId, "traiteur-paris-demo")
  await sign(t, networkId, pageId, pro.personId)
  return { t, root, networkId, pro, candidate, reader, pageId }
}

/** Le fixture et une offre OUVERTE publiée par le signataire vivant. */
async function openOffer() {
  const base = await fixture()
  const { jobId } = await base.pro.as.mutation(J.createJobOffer, { networkId: base.networkId, pageId: base.pageId, ...OFFER, publish: true })
  return { ...base, jobId }
}

describe("offres d'emploi — écrire et lire", () => {
  it("un signataire vivant publie ; un membre la trouve, projection allowlistée sans aucune identité", async () => {
    const { networkId, pro, reader, pageId } = await fixture()
    const created = await pro.as.mutation(J.createJobOffer, { networkId, pageId, ...OFFER, publish: true })
    expect(created).toMatchObject({ version: 1, status: "open" })

    const result = await reader.as.query(J.searchJobOffers, { networkId, paginationOpts: FIRST })
    expect(result.page).toHaveLength(1)
    const card = result.page[0]!
    expect(Object.keys(card).sort()).toEqual(CARD_KEYS)
    expect(card).toMatchObject({
      jobId: created.jobId, version: 1, contract: "cdi", country: "FR", city: "Paris", workMode: "onsite", languages: ["fr"],
      payRange: OFFER.payRange, closesAt: null, page: { handle: "traiteur-paris-demo", badge: "community", ownerKind: "company" },
    })
    // Aucune personne ne sort d'une offre : ni le signataire, ni le lecteur.
    expect(JSON.stringify(result)).not.toContain(pro.personId)
    expect(JSON.stringify(result)).not.toContain(reader.personId)

    expect(await reader.as.query(J.getJobOffer, { networkId, jobId: created.jobId })).toMatchObject({ status: "open", viewerCanManage: false, myApplication: null })
    expect(await pro.as.query(J.getJobOffer, { networkId, jobId: created.jobId })).toMatchObject({ status: "open", viewerCanManage: true })
    expect(await reader.as.query(J.getJobOffer, { networkId, jobId: "pas-un-identifiant" })).toBeNull()
  })

  it("brouillon, suspendue et close restent hors de la recherche ; close est terminale", async () => {
    const { networkId, pro, reader, pageId } = await fixture()
    const { jobId } = await pro.as.mutation(J.createJobOffer, { networkId, pageId, ...OFFER, publish: false })
    const visible = async () => (await reader.as.query(J.searchJobOffers, { networkId, paginationOpts: FIRST })).page.map((row) => row.jobId)

    expect(await visible()).toEqual([])
    expect(await reader.as.query(J.getJobOffer, { networkId, jobId })).toBeNull()
    expect(await pro.as.query(J.getJobOffer, { networkId, jobId })).toMatchObject({ status: "draft", viewerCanManage: true })

    expect(await pro.as.mutation(J.setJobOfferStatus, { networkId, jobId, expectedVersion: 1, status: "open" })).toEqual({ status: "open", version: 2 })
    expect(await visible()).toEqual([jobId])
    expect(await pro.as.mutation(J.setJobOfferStatus, { networkId, jobId, expectedVersion: 2, status: "suspended" })).toEqual({ status: "suspended", version: 3 })
    expect(await visible()).toEqual([])
    expect(await reader.as.query(J.getJobOffer, { networkId, jobId })).toBeNull()
    expect(await pro.as.mutation(J.setJobOfferStatus, { networkId, jobId, expectedVersion: 3, status: "open" })).toEqual({ status: "open", version: 4 })
    expect(await pro.as.mutation(J.setJobOfferStatus, { networkId, jobId, expectedVersion: 4, status: "closed" })).toEqual({ status: "closed", version: 5 })
    expect(await visible()).toEqual([])
    expect(await failure(pro.as.mutation(J.setJobOfferStatus, { networkId, jobId, expectedVersion: 5, status: "open" }))).toEqual({ code: "conflict", appRule: "job_offer_closed" })
    expect(await failure(pro.as.mutation(J.updateJobOffer, { networkId, jobId, expectedVersion: 5, ...OFFER }))).toEqual({ code: "conflict", appRule: "job_offer_closed" })
    // Redemander l'état courant ne change rien, même avec une version ancienne (double clic).
    expect(await pro.as.mutation(J.setJobOfferStatus, { networkId, jobId, expectedVersion: 1, status: "closed" })).toEqual({ status: "closed", version: 5 })
    // Un brouillon s'ouvre ou se clôt ; il ne se suspend pas.
    const draft = await pro.as.mutation(J.createJobOffer, { networkId, pageId, ...OFFER, publish: false })
    expect(await failure(pro.as.mutation(J.setJobOfferStatus, { networkId, jobId: draft.jobId, expectedVersion: 1, status: "suspended" }))).toEqual({ code: "conflict", appRule: "job_offer_transition_invalid" })
  })

  it("une date limite atteinte vaut clôture : hors recherche, illisible des membres, close pour l'équipe, puis écrite par le passage", async () => {
    const { t, networkId, pro, reader, pageId } = await fixture()
    const expired = await insertOffer(t, networkId, pageId, { closesAt: NOW - 1 })
    const later = await insertOffer(t, networkId, pageId, { closesAt: NOW + 3 * DAY_MS, title: "Offre à venir" })
    const ids = (await reader.as.query(J.searchJobOffers, { networkId, paginationOpts: FIRST })).page.map((row) => row.jobId)
    expect(ids).toEqual([later])
    expect(await reader.as.query(J.getJobOffer, { networkId, jobId: expired })).toBeNull()
    expect(await pro.as.query(J.getJobOffer, { networkId, jobId: expired })).toMatchObject({ status: "closed" })
    expect(await failure(pro.as.mutation(J.setJobOfferStatus, { networkId, jobId: expired, expectedVersion: 1, status: "suspended" }))).toEqual({ code: "conflict", appRule: "job_offer_closed" })
    // Une date limite passée interdit d'ouvrir un brouillon.
    const staleDraft = await insertOffer(t, networkId, pageId, { status: "draft", closesAt: NOW - DAY_MS })
    expect(await failure(pro.as.mutation(J.setJobOfferStatus, { networkId, jobId: staleDraft, expectedVersion: 1, status: "open" }))).toEqual({ code: "invalidArgument", appRule: "job_deadline_invalid" })

    expect(await t.mutation(internal.modules.diaspora.jobs.closeExpiredJobOffers, {})).toEqual({ closed: 1, hasMore: false })
    expect(await t.run(async (ctx) => ctx.db.get(expired))).toMatchObject({ status: "closed", closedAt: NOW - 1, version: 2 })
    expect(await t.run(async (ctx) => ctx.db.get(later))).toMatchObject({ status: "open", version: 1 })
  })

  it("une modification cite la version lue : périmée, c'est un conflit et rien n'est écrit", async () => {
    const { t, networkId, pro, reader, pageId } = await fixture()
    const { jobId } = await pro.as.mutation(J.createJobOffer, { networkId, pageId, ...OFFER, publish: true })
    expect(await pro.as.mutation(J.updateJobOffer, { networkId, jobId, expectedVersion: 1, ...OFFER, title: "Chef de partie", payRange: null, city: null })).toEqual({ version: 2 })
    expect(await failure(pro.as.mutation(J.updateJobOffer, { networkId, jobId, expectedVersion: 1, ...OFFER, title: "Écrasement tardif" }))).toEqual({ code: "conflict", appRule: "job_offer_version_conflict" })
    expect(await failure(pro.as.mutation(J.setJobOfferStatus, { networkId, jobId, expectedVersion: 1, status: "suspended" }))).toEqual({ code: "conflict", appRule: "job_offer_version_conflict" })
    const stored = await t.run(async (ctx) => ctx.db.get(jobId))
    expect(stored).toMatchObject({ title: "Chef de partie", version: 2, status: "open" })
    expect(stored?.payRange).toBeUndefined()
    expect(stored?.city).toBeUndefined()
    const found = await reader.as.query(J.searchJobOffers, { networkId, query: "chef", paginationOpts: FIRST })
    expect(found.page.map((row) => [row.title, row.version, row.city, row.payRange])).toEqual([["Chef de partie", 2, null, null]])
  })

  it("refuse hors réseau, sans rôle vivant, sur une page inactive, pour une institution et sous le statut requis", async () => {
    const { t, root, networkId, pro, reader, pageId } = await fixture()
    const args = { ...OFFER, publish: true }
    expect(["notFound", "statusInsufficient"]).toContain((await failure(pro.as.mutation(J.createJobOffer, { networkId: root, pageId, ...args }))).code)
    expect(await t.run(async (ctx) => ctx.db.query("jobOffers").take(1))).toEqual([])
    // Un membre qui ne signe pas pour la page : le même refus qu'une page inconnue.
    expect(await failure(reader.as.mutation(J.createJobOffer, { networkId, pageId, ...args }))).toMatchObject({ code: "notFound" })
    // Une invitation en attente ne donne aucun droit.
    const invited = await member(t, networkId, "invitee.demo")
    await sign(t, networkId, pageId, invited.personId, false)
    expect(await failure(invited.as.mutation(J.createJobOffer, { networkId, pageId, ...args }))).toMatchObject({ code: "notFound" })
    // Une page inactive, ou d'une institution.
    const closed = await page(t, networkId, "page-inactive-demo", { status: "inactive" })
    await sign(t, networkId, closed, pro.personId)
    expect(await failure(pro.as.mutation(J.createJobOffer, { networkId, pageId: closed, ...args }))).toMatchObject({ code: "notFound" })
    const institution = await page(t, networkId, "poste-demo", { ownerKind: "institution" })
    await sign(t, networkId, institution, pro.personId)
    expect(await failure(pro.as.mutation(J.createJobOffer, { networkId, pageId: institution, ...args }))).toEqual({ code: "policyRefused", appRule: "job_page_kind_not_allowed" })
    // Un membre en attente ne publie pas, même signataire.
    await setMembership(t, networkId, pro.personId, "en_attente")
    expect(await failure(pro.as.mutation(J.createJobOffer, { networkId, pageId, ...args }))).toMatchObject({ code: "statusInsufficient" })
    // Les lectures aussi sont bornées au réseau et à la session.
    expect(await failure(reader.as.query(J.searchJobOffers, { networkId: root, paginationOpts: FIRST }))).toMatchObject({ code: "notFound" })
    expect(await failure(t.query(J.searchJobOffers, { networkId, paginationOpts: FIRST }))).toMatchObject({ code: "unauthenticated" })
    expect(await failure(reader.as.query(J.pageJobOffers, { networkId, pageId, paginationOpts: FIRST }))).toMatchObject({ code: "notFound" })
  })

  it("un rôle retiré ou une page désactivée ferment aussitôt la gestion ; la page désactivée emporte ses offres", async () => {
    const { t, networkId, pro, reader, pageId } = await fixture()
    const { jobId } = await pro.as.mutation(J.createJobOffer, { networkId, pageId, ...OFFER, publish: true })
    await removeSignatory(t, pageId, pro.personId)
    expect(await failure(pro.as.mutation(J.updateJobOffer, { networkId, jobId, expectedVersion: 1, ...OFFER }))).toMatchObject({ code: "notFound" })
    expect(await failure(pro.as.mutation(J.setJobOfferStatus, { networkId, jobId, expectedVersion: 1, status: "suspended" }))).toMatchObject({ code: "notFound" })
    expect(await failure(pro.as.query(J.pageJobOffers, { networkId, pageId, paginationOpts: FIRST }))).toMatchObject({ code: "notFound" })
    expect(await pro.as.query(J.getJobOffer, { networkId, jobId })).toMatchObject({ viewerCanManage: false })
    await t.run(async (ctx) => { await ctx.db.patch(pageId, { status: "inactive" }) })
    expect((await reader.as.query(J.searchJobOffers, { networkId, paginationOpts: FIRST })).page).toEqual([])
    expect(await reader.as.query(J.getJobOffer, { networkId, jobId })).toBeNull()
  })

  it.each([
    [{ title: "Ab" }, "job_title_too_short"],
    [{ description: "Appelez le 06 12 34 56 78 pour postuler dès aujourd'hui." }, "job_contact_details_forbidden"],
    [{ country: "GA" }, "job_country_is_home"],
    [{ payRange: { minMinor: 3000, maxMinor: 2000, currency: "EUR", period: "month" as const } }, "job_pay_range_invalid"],
    [{ payRange: { minMinor: 100, maxMinor: 200, currency: "BTC", period: "month" as const } }, "currency_invalid"],
    [{ closesAt: NOW - 1 }, "job_deadline_invalid"],
  ])("rend la règle du domaine %o avec son code fermé", async (change, appRule) => {
    const { networkId, pro, pageId } = await fixture()
    expect(await failure(pro.as.mutation(J.createJobOffer, { networkId, pageId, ...OFFER, ...change, publish: true }))).toEqual({ code: "invalidArgument", appRule })
  })

  it("plafonne les offres non closes d'une page", async () => {
    const { t, networkId, pro, pageId } = await fixture()
    for (let index = 0; index < JOB_OFFERS_PER_PAGE_MAX - 1; index += 1) await insertOffer(t, networkId, pageId, { status: index % 3 === 0 ? "suspended" : "open" })
    await insertOffer(t, networkId, pageId, { status: "closed" })
    await pro.as.mutation(J.createJobOffer, { networkId, pageId, ...OFFER, publish: false })
    expect(await failure(pro.as.mutation(J.createJobOffer, { networkId, pageId, ...OFFER, publish: false }))).toEqual({ code: "conflict", appRule: "job_offer_limit_reached" })
  })

  it("cherche par ville saisie, pays, contrat, mode et texte ; une offre d'un autre réseau n'apparaît jamais", async () => {
    const { t, root, networkId, reader, pageId } = await fixture()
    const association = await page(t, networkId, "collectif-lyon-demo", { ownerKind: "association" })
    const parisCdi = await insertOffer(t, networkId, pageId, { title: "Cuisinier", contract: "cdi", publishedAt: NOW - 3 })
    const parisRemote = await insertOffer(t, networkId, pageId, { title: "Graphiste", contract: "freelance", workMode: "remote", publishedAt: NOW - 2 })
    const lyonStage = await insertOffer(t, networkId, association, { title: "Stage communication", city: "Saint-Étienne", contract: "internship", workMode: "hybrid", publishedAt: NOW - 1 })
    const brussels = await insertOffer(t, networkId, pageId, { title: "Logisticien", country: "BE", city: "Bruxelles", publishedAt: NOW })
    await insertOffer(t, root, pageId, { title: "Offre d'un autre réseau" })
    const search = async (filters: Record<string, unknown>) =>
      (await reader.as.query(J.searchJobOffers, { networkId, ...filters, paginationOpts: { numItems: 20, cursor: null } })).page.map((row) => row.jobId)
    expect(await search({})).toEqual([brussels, lyonStage, parisRemote, parisCdi])
    expect(await search({ city: " PARIS " })).toEqual([parisRemote, parisCdi])
    expect(await search({ city: "saint etienne", country: "fr" })).toEqual([lyonStage])
    expect(await search({ country: "BE" })).toEqual([brussels])
    expect(await search({ contract: "internship" })).toEqual([lyonStage])
    expect(await search({ workMode: "remote" })).toEqual([parisRemote])
    expect(await search({ query: "graphiste" })).toEqual([parisRemote])
    expect(await failure(reader.as.query(J.searchJobOffers, { networkId, country: "GA", paginationOpts: FIRST }))).toEqual({ code: "invalidArgument", appRule: "job_country_is_home" })
    expect(await failure(reader.as.query(J.searchJobOffers, { networkId, contract: "benevolat", paginationOpts: FIRST }))).toEqual({ code: "invalidArgument", appRule: "job_contract_invalid" })
    // Une page plus grande que le plafond est ramenée au plafond.
    expect((await reader.as.query(J.searchJobOffers, { networkId, paginationOpts: { numItems: 0, cursor: null } })).page).toHaveLength(1)
  })
})

describe("rubrique « Emplois » d'une page (EM-04) — ses offres ouvertes, rien d'autre", () => {
  it("une page sans offre ouverte rend une fenêtre vide ; brouillon, suspendue, close et échue n'y paraissent pas", async () => {
    const { t, networkId, reader, pageId } = await fixture()
    const read = async () => await reader.as.query(J.pageOpenJobOffers, { networkId, pageId, paginationOpts: FIRST })
    expect(await read()).toMatchObject({ page: [], isDone: true })

    await insertOffer(t, networkId, pageId, { status: "draft" })
    await insertOffer(t, networkId, pageId, { status: "suspended" })
    await insertOffer(t, networkId, pageId, { status: "closed" })
    await insertOffer(t, networkId, pageId, { closesAt: NOW - 1 })
    expect((await read())?.page).toEqual([])

    // Deux offres ouvertes : les plus récemment créées d'abord, projection de la recherche, sans état de modération.
    const first = await insertOffer(t, networkId, pageId, { title: "Commis de cuisine" })
    const second = await insertOffer(t, networkId, pageId, { title: "Livreur à vélo", closesAt: NOW + DAY_MS })
    const result = await read()
    expect(result?.page.map((row) => row.jobId)).toEqual([second, first])
    expect(result?.page.map((row) => Object.keys(row).sort())).toEqual([CARD_KEYS, CARD_KEYS])
    expect(result?.page[0]).toMatchObject({ page: { handle: "traiteur-paris-demo", ownerKind: "company", badge: "community" } })
  })

  it("une offre en relecture ou retirée n'est servie qu'à la gestion de l'équipe, jamais à la fiche", async () => {
    const { t, networkId, pro, reader, pageId, jobId } = await openOffer()
    const visible = async () => (await reader.as.query(J.pageOpenJobOffers, { networkId, pageId, paginationOpts: FIRST }))?.page.map((row) => row.jobId)
    expect(await visible()).toEqual([jobId])
    const teamView = async () => (await pro.as.query(J.pageOpenJobOffers, { networkId, pageId, paginationOpts: FIRST }))?.page.map((row) => row.jobId)
    await moderate(t, networkId, "diasporaJobOffer", jobId, "pending_review", { ownerPageId: pageId })
    expect(await visible()).toEqual([])
    // La rubrique est la projection publique, pour l'équipe aussi : l'état se lit dans sa gestion, pas sur la fiche.
    expect(await teamView()).toEqual([])
    await moderate(t, networkId, "diasporaJobOffer", jobId, "removed", { ownerPageId: pageId })
    expect(await visible()).toEqual([])
    expect(await teamView()).toEqual([])
    // L'équipe la garde dans sa gestion, avec son état.
    expect((await pro.as.query(J.pageJobOffers, { networkId, pageId, paginationOpts: FIRST })).page.map((row) => [row.jobId, row.moderation])).toEqual([[jobId, "removed"]])
  })

  it("page inconnue, d'un autre réseau, inactive ou d'une institution : le même null ; la lecture reste bornée au réseau et à la session", async () => {
    const { t, root, networkId, reader, pageId } = await fixture()
    await insertOffer(t, networkId, pageId)
    const read = async (id: string) => await reader.as.query(J.pageOpenJobOffers, { networkId, pageId: id, paginationOpts: FIRST })

    const elsewhere = await page(t, root, "page-racine-demo")
    await insertOffer(t, root, elsewhere)
    const inactive = await page(t, networkId, "page-fermee-demo", { status: "inactive" })
    await insertOffer(t, networkId, inactive)
    const institution = await page(t, networkId, "poste-emploi-demo", { ownerKind: "institution" })
    const media = await page(t, networkId, "media-emploi-demo", { ownerKind: "media" })
    const community = await page(t, networkId, "communaute-emploi-demo", { ownerKind: "community" })
    const moderated = await page(t, networkId, "page-retiree-demo")
    await insertOffer(t, networkId, moderated)
    await t.run(async (ctx) => {
      await ctx.db.insert("moderationContentStates", { networkId, targetKind: "page", targetId: moderated, status: "removed", createdAt: NOW, updatedAt: NOW })
    })
    for (const id of ["pas-un-identifiant", elsewhere, inactive, institution, media, community, moderated]) expect(await read(id), id).toBeNull()
    // Une association recrute aussi : sa rubrique se lit comme celle d'une entreprise.
    const association = await page(t, networkId, "collectif-emploi-demo", { ownerKind: "association" })
    const volunteer = await insertOffer(t, networkId, association, { contract: "internship" })
    expect((await read(association))?.page.map((row) => row.jobId)).toEqual([volunteer])

    expect(await failure(reader.as.query(J.pageOpenJobOffers, { networkId: root, pageId, paginationOpts: FIRST }))).toMatchObject({ code: "notFound" })
    expect(await failure(t.query(J.pageOpenJobOffers, { networkId, pageId, paginationOpts: FIRST }))).toMatchObject({ code: "unauthenticated" })
    // Une personne d'ANTSIA seule, sans adhésion à DIASPORALE, ne lit pas la rubrique.
    const outsider = t.withIdentity({ subject: "auth-racine-seule" })
    await outsider.mutation(api.modules.people.persons.ensureMyPerson, {})
    await outsider.mutation(api.modules.people.consents.recordConsent, { purpose: "social_profile", origin: "onboarding" })
    await outsider.mutation(api.modules.people.profile.publishMyProfile, { handle: "racine.seule", displayName: "Racine Seule" })
    expect((await failure(outsider.query(J.pageOpenJobOffers, { networkId, pageId, paginationOpts: FIRST }))).code).not.toBeNull()
  })

  it("un blocage avec toute l'équipe ne ferme pas la lecture : la rubrique reste lue, comme la recherche (RP-03, docs/40)", async () => {
    const { t, root, networkId, pro, reader, pageId, jobId } = await openOffer()
    await t.run(async (ctx) => {
      await ctx.db.insert("personBlocks", { networkId: root, blockerPersonId: reader.personId, targetPersonId: pro.personId, createdAt: NOW, updatedAt: NOW })
    })
    // Le blocage est bien en vigueur dans la paire : seule la lecture de la page reste ouverte.
    expect(await t.run(async (ctx) => await isBlockedBetween(ctx, reader.personId, pro.personId))).toBe(true)
    expect((await reader.as.query(J.pageOpenJobOffers, { networkId, pageId, paginationOpts: FIRST }))?.page.map((row) => row.jobId)).toEqual([jobId])
    expect((await reader.as.query(J.searchJobOffers, { networkId, paginationOpts: FIRST })).page.map((row) => row.jobId)).toEqual([jobId])
  })
})

describe("candidatures — privées et bornées", () => {
  it("exige le consentement ; même clé et même corps rejouent, autre corps : conflit ; une seule par offre", async () => {
    const { t, networkId, candidate, reader, jobId } = await openOffer()
    // Cinq envois au plus par personne dans ce test : le seau ordinaire n'en tient pas davantage.
    expect(await failure(candidate.as.mutation(J.applyToJobOffer, { networkId, jobId, offerVersion: 1, ...APPLY, shareName: false }))).toEqual({ code: "policyRefused", appRule: "job_application_consent_required" })
    const first = await candidate.as.mutation(J.applyToJobOffer, { networkId, jobId, offerVersion: 1, ...APPLY })
    expect(first.created).toBe(true)
    expect(await candidate.as.mutation(J.applyToJobOffer, { networkId, jobId, offerVersion: 1, ...APPLY })).toEqual({ applicationId: first.applicationId, created: false })
    expect(await failure(candidate.as.mutation(J.applyToJobOffer, { networkId, jobId, offerVersion: 1, ...APPLY, message: `${MESSAGE} Autre corps.` }))).toEqual({ code: "conflict", appRule: "job_application_idempotency_conflict" })
    expect(await failure(candidate.as.mutation(J.applyToJobOffer, { networkId, jobId, offerVersion: 1, ...APPLY, idempotencyKey: "candidature-recette-0002" }))).toEqual({ code: "conflict", appRule: "job_application_already_exists" })
    expect(await failure(reader.as.mutation(J.applyToJobOffer, { networkId, jobId, offerVersion: 1, ...APPLY, message: "Appelez-moi au 06 12 34 56 78, merci." }))).toEqual({ code: "invalidArgument", appRule: "job_contact_details_forbidden" })
    expect(await failure(reader.as.mutation(J.applyToJobOffer, { networkId, jobId, offerVersion: 1, ...APPLY, idempotencyKey: "court" }))).toMatchObject({ code: "invalidArgument" })
    const stored = await t.run(async (ctx) => ctx.db.query("jobApplications").take(5))
    expect(stored).toHaveLength(1)
    expect(stored[0]).toMatchObject({ status: "sent", candidatePersonId: candidate.personId, offerVersion: 1, shareTalentProfile: false, identityConsentAt: NOW })
  })

  it("aucune candidature hors offre ouverte : brouillon, suspendue, close, échue, autre réseau ; version périmée et propre page refusées", async () => {
    const { t, root, networkId, pro, candidate, reader, pageId, jobId } = await openOffer()
    const apply = (who: Member, target: Id<"jobOffers">, key: string) =>
      failure(who.as.mutation(J.applyToJobOffer, { networkId, jobId: target, offerVersion: 1, ...APPLY, idempotencyKey: key }))
    expect(await apply(candidate, await insertOffer(t, networkId, pageId, { status: "draft" }), "candidature-brouillon-01")).toMatchObject({ code: "notFound" })
    expect(await apply(candidate, await insertOffer(t, networkId, pageId, { status: "suspended" }), "candidature-suspendue-01")).toMatchObject({ code: "notFound" })
    expect(await apply(candidate, await insertOffer(t, networkId, pageId, { status: "closed" }), "candidature-close-000001")).toMatchObject({ code: "notFound" })
    expect(await apply(candidate, await insertOffer(t, networkId, pageId, { closesAt: NOW }), "candidature-echue-000001")).toMatchObject({ code: "notFound" })
    expect(await apply(reader, await insertOffer(t, root, pageId), "candidature-ailleurs-0001")).toMatchObject({ code: "notFound" })
    // L'offre a changé depuis sa lecture : relire avant de candidater.
    await pro.as.mutation(J.updateJobOffer, { networkId, jobId, expectedVersion: 1, ...OFFER, title: "Cuisinier confirmé" })
    expect(await apply(reader, jobId, "candidature-perimee-0001")).toEqual({ code: "conflict", appRule: "job_offer_changed" })
    // On ne candidate pas aux offres de sa propre page.
    expect(await failure(pro.as.mutation(J.applyToJobOffer, { networkId, jobId, offerVersion: 2, ...APPLY }))).toEqual({ code: "policyRefused", appRule: "job_application_own_page" })
    expect(await t.run(async (ctx) => ctx.db.query("jobApplications").take(1))).toEqual([])
  })

  it("statut insuffisant : un membre en attente ne candidate pas, mais lit et retire ses candidatures", async () => {
    const { t, networkId, candidate, jobId } = await openOffer()
    const { applicationId } = await candidate.as.mutation(J.applyToJobOffer, { networkId, jobId, offerVersion: 1, ...APPLY })
    await setMembership(t, networkId, candidate.personId, "en_attente")
    expect(await failure(candidate.as.mutation(J.applyToJobOffer, { networkId, jobId, offerVersion: 1, ...APPLY, idempotencyKey: "candidature-attente-0001" }))).toMatchObject({ code: "statusInsufficient" })
    expect((await candidate.as.query(J.myJobApplications, { networkId, paginationOpts: FIRST })).page).toHaveLength(1)
    expect(await candidate.as.mutation(J.withdrawJobApplication, { networkId, applicationId })).toEqual({ status: "withdrawn" })
  })

  it("la candidature est privée : la personne et l'équipe vivante seulement, refus indistinct à tout autre", async () => {
    const { networkId, pro, candidate, reader, jobId } = await openOffer()
    const { applicationId } = await candidate.as.mutation(J.applyToJobOffer, { networkId, jobId, offerVersion: 1, ...APPLY })
    expect(await failure(reader.as.query(J.jobOfferApplications, { networkId, jobId, paginationOpts: FIRST }))).toMatchObject({ code: "notFound" })
    expect(await failure(reader.as.mutation(J.shortlistJobApplication, { networkId, applicationId }))).toMatchObject({ code: "notFound" })
    expect(await failure(reader.as.mutation(J.withdrawJobApplication, { networkId, applicationId }))).toMatchObject({ code: "notFound" })
    expect(await failure(pro.as.mutation(J.withdrawJobApplication, { networkId, applicationId }))).toMatchObject({ code: "notFound" })
    expect((await reader.as.query(J.myJobApplications, { networkId, paginationOpts: FIRST })).page).toEqual([])

    const received = await pro.as.query(J.jobOfferApplications, { networkId, jobId, paginationOpts: FIRST })
    expect(received.page).toEqual([expect.objectContaining({
      applicationId, status: "sent", candidate: { displayName: "Mireille Ivindo", handle: "candidate.demo" }, message: MESSAGE,
      talentProfile: null, notSelectedReason: null, actions: ["mark_seen", "shortlist", "not_select"],
    })])
    // L'équipe lit le nom publié consenti, jamais un identifiant de personne.
    expect(JSON.stringify(received)).not.toContain(candidate.personId)
    const mine = await candidate.as.query(J.myJobApplications, { networkId, paginationOpts: FIRST })
    expect(mine.page).toEqual([expect.objectContaining({ applicationId, status: "sent", jobId, offerOpen: true, message: MESSAGE, actions: ["withdraw"] })])
    expect(await candidate.as.query(J.getJobOffer, { networkId, jobId })).toMatchObject({ myApplication: { applicationId, status: "sent" } })
  })

  it("l'équipe décide : vue, présélectionnée, non retenue ; le motif n'est jamais montré à la personne", async () => {
    const { networkId, pro, candidate, jobId } = await openOffer()
    const { applicationId } = await candidate.as.mutation(J.applyToJobOffer, { networkId, jobId, offerVersion: 1, ...APPLY })
    expect(await pro.as.mutation(J.markJobApplicationSeen, { networkId, applicationId })).toEqual({ status: "seen" })
    expect(await pro.as.mutation(J.markJobApplicationSeen, { networkId, applicationId })).toEqual({ status: "seen" })
    expect(await pro.as.mutation(J.shortlistJobApplication, { networkId, applicationId })).toEqual({ status: "shortlisted" })
    expect(await failure(pro.as.mutation(J.markJobApplicationNotSelected, { networkId, applicationId, reason: "Rappeler au 06 12 34 56 78" }))).toEqual({ code: "invalidArgument", appRule: "job_contact_details_forbidden" })
    expect(await pro.as.mutation(J.markJobApplicationNotSelected, { networkId, applicationId, reason: "Profil plus junior que le poste." })).toEqual({ status: "not_selected" })
    expect(await failure(pro.as.mutation(J.shortlistJobApplication, { networkId, applicationId }))).toEqual({ code: "conflict", appRule: "job_application_transition_invalid" })

    const received = await pro.as.query(J.jobOfferApplications, { networkId, jobId, status: "not_selected", paginationOpts: FIRST })
    expect(received.page).toEqual([expect.objectContaining({ applicationId, status: "not_selected", notSelectedReason: "Profil plus junior que le poste.", actions: [] })])
    const mine = await candidate.as.query(J.myJobApplications, { networkId, paginationOpts: FIRST })
    expect(mine.page).toEqual([expect.objectContaining({ applicationId, status: "not_selected", actions: [] })])
    expect(JSON.stringify(mine)).not.toContain("junior")
    expect(JSON.stringify(mine)).not.toContain(pro.personId)
    expect(await failure(candidate.as.mutation(J.withdrawJobApplication, { networkId, applicationId }))).toEqual({ code: "conflict", appRule: "job_application_transition_invalid" })
  })

  it("retirer est définitif : l'équipe n'en voit plus que l'état, et ne décide plus", async () => {
    const { networkId, pro, candidate, jobId } = await openOffer()
    const { applicationId } = await candidate.as.mutation(J.applyToJobOffer, { networkId, jobId, offerVersion: 1, ...APPLY })
    expect(await candidate.as.mutation(J.withdrawJobApplication, { networkId, applicationId })).toEqual({ status: "withdrawn" })
    expect(await candidate.as.mutation(J.withdrawJobApplication, { networkId, applicationId })).toEqual({ status: "withdrawn" })
    const received = await pro.as.query(J.jobOfferApplications, { networkId, jobId, paginationOpts: FIRST })
    expect(received.page).toEqual([expect.objectContaining({ applicationId, status: "withdrawn", candidate: null, message: null, talentProfile: null, actions: [] })])
    expect(JSON.stringify(received)).not.toContain(MESSAGE)
    expect(await failure(pro.as.mutation(J.shortlistJobApplication, { networkId, applicationId }))).toEqual({ code: "conflict", appRule: "job_application_transition_invalid" })
    // Une seule candidature par personne et par offre, même retirée.
    expect(await failure(candidate.as.mutation(J.applyToJobOffer, { networkId, jobId, offerVersion: 1, ...APPLY, idempotencyKey: "candidature-recette-0003" }))).toEqual({ code: "conflict", appRule: "job_application_already_exists" })
  })

  it("un rôle retiré ou une page inactive ferment la lecture des candidatures et les décisions", async () => {
    const { t, networkId, pro, candidate, pageId, jobId } = await openOffer()
    const { applicationId } = await candidate.as.mutation(J.applyToJobOffer, { networkId, jobId, offerVersion: 1, ...APPLY })
    await t.run(async (ctx) => { await ctx.db.patch(pageId, { status: "inactive" }) })
    expect(await failure(pro.as.query(J.jobOfferApplications, { networkId, jobId, paginationOpts: FIRST }))).toMatchObject({ code: "notFound" })
    expect(await failure(pro.as.mutation(J.markJobApplicationSeen, { networkId, applicationId }))).toMatchObject({ code: "notFound" })
    // La candidature reste à la personne ; l'offre n'est plus ouverte d'ici.
    expect((await candidate.as.query(J.myJobApplications, { networkId, paginationOpts: FIRST })).page).toEqual([expect.objectContaining({ applicationId, offerOpen: false, page: null })])
    await t.run(async (ctx) => { await ctx.db.patch(pageId, { status: "active" }) })
    await removeSignatory(t, pageId, pro.personId)
    expect(await failure(pro.as.query(J.jobOfferApplications, { networkId, jobId, paginationOpts: FIRST }))).toMatchObject({ code: "notFound" })
    expect(await failure(pro.as.mutation(J.markJobApplicationNotSelected, { networkId, applicationId }))).toMatchObject({ code: "notFound" })
  })

  it("le profil de talent joint est relu vivant : masqué, il disparaît de la candidature ; absent, il ne se joint pas", async () => {
    const { networkId, pro, candidate, jobId } = await openOffer()
    expect(await failure(candidate.as.mutation(J.applyToJobOffer, { networkId, jobId, offerVersion: 1, ...APPLY, shareTalentProfile: true }))).toEqual({ code: "policyRefused", appRule: "job_talent_profile_unavailable" })
    const saved = await candidate.as.mutation(J.saveMyTalentProfile, { networkId, ...TALENT, visibility: "unlisted" })
    await candidate.as.mutation(J.applyToJobOffer, { networkId, jobId, offerVersion: 1, ...APPLY, shareTalentProfile: true, idempotencyKey: "candidature-profil-00001" })
    const shared = await pro.as.query(J.jobOfferApplications, { networkId, jobId, paginationOpts: FIRST })
    expect(shared.page[0]?.talentProfile).toEqual({ title: "Comptable bilingue", skills: ["Comptabilité", "Paie"], availability: "one_month", languages: ["fr", "en"], country: "FR" })
    await candidate.as.mutation(J.setMyTalentProfileStatus, { networkId, status: "hidden", expectedVersion: saved.version })
    expect((await pro.as.query(J.jobOfferApplications, { networkId, jobId, paginationOpts: FIRST })).page[0]?.talentProfile).toBeNull()
  })
})

describe("profils de talent — opt-in, révocables, recherche bornée", () => {
  it("créer, modifier à la version lue, masquer, réactiver, supprimer", async () => {
    const { networkId, candidate } = await fixture()
    expect(await candidate.as.query(J.myTalentProfile, { networkId })).toBeNull()
    const created = await candidate.as.mutation(J.saveMyTalentProfile, { networkId, ...TALENT })
    expect(created.version).toBe(1)
    expect(await failure(candidate.as.mutation(J.saveMyTalentProfile, { networkId, ...TALENT }))).toEqual({ code: "conflict", appRule: "talent_profile_version_conflict" })
    expect(await candidate.as.mutation(J.saveMyTalentProfile, { networkId, ...TALENT, expectedVersion: 1, title: "Comptable confirmée" })).toEqual({ talentId: created.talentId, version: 2 })
    expect(await candidate.as.query(J.myTalentProfile, { networkId })).toMatchObject({ title: "Comptable confirmée", status: "active", visibility: "network", version: 2 })
    expect(await candidate.as.mutation(J.setMyTalentProfileStatus, { networkId, status: "hidden", expectedVersion: 2 })).toEqual({ status: "hidden", version: 3 })
    expect(await candidate.as.mutation(J.setMyTalentProfileStatus, { networkId, status: "hidden", expectedVersion: 1 })).toEqual({ status: "hidden", version: 3 })
    expect(await failure(candidate.as.mutation(J.setMyTalentProfileStatus, { networkId, status: "active", expectedVersion: 2 }))).toEqual({ code: "conflict", appRule: "talent_profile_version_conflict" })
    expect(await candidate.as.mutation(J.setMyTalentProfileStatus, { networkId, status: "active", expectedVersion: 3 })).toEqual({ status: "active", version: 4 })
    expect(await candidate.as.mutation(J.removeMyTalentProfile, { networkId })).toBeNull()
    expect(await candidate.as.query(J.myTalentProfile, { networkId })).toBeNull()
    expect(await candidate.as.mutation(J.removeMyTalentProfile, { networkId })).toBeNull()
  })

  it("un profil absent ne se masque pas ; une saisie invalide rend la règle du domaine", async () => {
    const { networkId, reader } = await fixture()
    expect(await failure(reader.as.mutation(J.setMyTalentProfileStatus, { networkId, status: "hidden", expectedVersion: 1 }))).toMatchObject({ code: "notFound" })
    expect(await failure(reader.as.mutation(J.saveMyTalentProfile, { networkId, ...TALENT, skills: [] }))).toEqual({ code: "invalidArgument", appRule: "talent_skills_required" })
    expect(await failure(reader.as.mutation(J.saveMyTalentProfile, { networkId, ...TALENT, country: "GA" }))).toEqual({ code: "invalidArgument", appRule: "job_country_is_home" })
    expect(await reader.as.query(J.myTalentProfile, { networkId })).toBeNull()
  })

  it("trouve les talents actifs et visibles d'un pays ; masqué, hors recherche, autre pays, autre réseau et moi-même : introuvables", async () => {
    const { t, root, networkId, candidate, reader } = await fixture()
    const listed = await insertTalent(t, networkId, candidate.personId, { title: "Comptable", skills: ["Comptabilité", "Paie"] })
    const hidden = await member(t, networkId, "masquee.demo", "Prisca Abanga")
    await insertTalent(t, networkId, hidden.personId, { status: "hidden" })
    const unlisted = await member(t, networkId, "horsrecherche.demo", "Rodrigue Komo")
    await insertTalent(t, networkId, unlisted.personId, { visibility: "unlisted" })
    const belgium = await member(t, networkId, "belgique.demo", "Clarisse Mbei")
    await insertTalent(t, networkId, belgium.personId, { country: "BE" })
    await insertTalent(t, root, reader.personId, { title: "Autre réseau" })
    await insertTalent(t, networkId, reader.personId, { title: "Moi-même" })

    const result = await reader.as.query(J.searchTalents, { networkId, country: "fr", paginationOpts: FIRST })
    expect(result.page.map((row) => row.talentId)).toEqual([listed])
    expect(Object.keys(result.page[0]!).sort()).toEqual(TALENT_KEYS)
    expect(result.page[0]).toMatchObject({ shortName: "Mireille I.", title: "Comptable", skills: ["Comptabilité", "Paie"] })
    // Ni identifiant de personne, ni adresse publique, ni nom complet.
    expect(JSON.stringify(result)).not.toContain(candidate.personId)
    expect(JSON.stringify(result)).not.toContain("candidate.demo")
    expect(JSON.stringify(result)).not.toContain("Ivindo")
    expect((await reader.as.query(J.searchTalents, { networkId, country: "FR", skill: "paie", paginationOpts: FIRST })).page.map((row) => row.talentId)).toEqual([listed])
    expect((await reader.as.query(J.searchTalents, { networkId, country: "FR", skill: "plomberie", paginationOpts: FIRST })).page).toEqual([])
    expect(await failure(reader.as.query(J.searchTalents, { networkId, country: "", paginationOpts: FIRST }))).toEqual({ code: "invalidArgument", appRule: "job_country_required" })
    expect(await failure(reader.as.query(J.searchTalents, { networkId: root, country: "FR", paginationOpts: FIRST }))).toMatchObject({ code: "notFound" })
  })

  it("un blocage dans la paire, ou un profil retiré, sortent le talent de la recherche", async () => {
    const { t, networkId, candidate, reader } = await fixture()
    await insertTalent(t, networkId, candidate.personId)
    expect((await reader.as.query(J.searchTalents, { networkId, country: "FR", paginationOpts: FIRST })).page).toHaveLength(1)
    await candidate.as.mutation(api.modules.graph.connections.blockPerson, { networkId, targetPersonId: reader.personId })
    expect((await reader.as.query(J.searchTalents, { networkId, country: "FR", paginationOpts: FIRST })).page).toEqual([])
  })

  it("statut insuffisant : un membre en attente ne cherche pas de talents et n'en publie pas", async () => {
    const { t, networkId, reader } = await fixture()
    await setMembership(t, networkId, reader.personId, "en_attente")
    expect(await failure(reader.as.query(J.searchTalents, { networkId, country: "FR", paginationOpts: FIRST }))).toMatchObject({ code: "statusInsufficient" })
    expect(await failure(reader.as.mutation(J.saveMyTalentProfile, { networkId, ...TALENT }))).toMatchObject({ code: "statusInsufficient" })
  })

  it("plafond STRICT par page : on affine la recherche, on ne parcourt pas l'annuaire", async () => {
    const { t, networkId, reader } = await fixture()
    for (let index = 0; index < TALENT_SEARCH_PAGE_MAX + 1; index += 1) {
      const talent = await member(t, networkId, `talent${index}.demo`, `Talent Numero${index}`)
      await insertTalent(t, networkId, talent.personId, { updatedAt: NOW + index })
    }
    const result = await reader.as.query(J.searchTalents, { networkId, country: "FR", paginationOpts: { numItems: 500, cursor: null } })
    expect(result.page).toHaveLength(TALENT_SEARCH_PAGE_MAX)
    expect(result.isDone).toBe(false)
  })
})

describe("modération (G9) — l'état montré à qui gère, et à lui seul", () => {
  it("l'équipe vivante lit l'état de ses offres, la personne celui de sa candidature et de son profil ; un tiers ne le reçoit jamais", async () => {
    const { t, networkId, pro, candidate, reader, pageId, jobId } = await openOffer()
    const { applicationId } = await candidate.as.mutation(J.applyToJobOffer, { networkId, jobId, offerVersion: 1, ...APPLY })
    const { talentId } = await candidate.as.mutation(J.saveMyTalentProfile, { networkId, ...TALENT })
    const managed = async () => (await pro.as.query(J.pageJobOffers, { networkId, pageId, paginationOpts: FIRST })).page.map((row) => [row.jobId, row.moderation])
    const mine = async () => (await candidate.as.query(J.myJobApplications, { networkId, paginationOpts: FIRST })).page

    // Publiés dès l'écriture : la gestion lit « publié » ; la fiche d'un autre lecteur ne porte aucun état.
    expect(await managed()).toEqual([[jobId, "published"]])
    expect(await pro.as.query(J.getJobOffer, { networkId, jobId })).toMatchObject({ viewerCanManage: true, moderation: "published" })
    expect(await reader.as.query(J.getJobOffer, { networkId, jobId })).toMatchObject({ viewerCanManage: false, moderation: null })
    expect(await candidate.as.query(J.getJobOffer, { networkId, jobId })).toMatchObject({ viewerCanManage: false, moderation: null, myApplication: { applicationId } })
    expect(await mine()).toEqual([expect.objectContaining({ applicationId, moderation: "published" })])
    expect(await candidate.as.query(J.myTalentProfile, { networkId })).toMatchObject({ talentId, moderation: "published" })
    // Les projections publiques et la boîte de l'équipe n'ont pas le champ.
    expect((await reader.as.query(J.searchJobOffers, { networkId, paginationOpts: FIRST })).page.map((row) => Object.keys(row).sort())).toEqual([CARD_KEYS])
    expect((await reader.as.query(J.searchTalents, { networkId, country: "FR", paginationOpts: FIRST })).page.map((row) => Object.keys(row).sort())).toEqual([TALENT_KEYS])
    const received = await pro.as.query(J.jobOfferApplications, { networkId, jobId, paginationOpts: FIRST })
    expect(received.page.map((row) => row.applicationId)).toEqual([applicationId])
    expect(received.page.flatMap((row) => Object.keys(row))).not.toContain("moderation")

    // L'offre en relecture préalable, puis retirée : l'équipe le lit dans sa gestion ; un autre lecteur ne lit plus l'offre.
    await moderate(t, networkId, "diasporaJobOffer", jobId, "pending_review", { ownerPageId: pageId })
    expect(await managed()).toEqual([[jobId, "pending_review"]])
    expect(await pro.as.query(J.getJobOffer, { networkId, jobId })).toMatchObject({ moderation: "pending_review" })
    expect(await reader.as.query(J.getJobOffer, { networkId, jobId })).toBeNull()
    expect((await reader.as.query(J.searchJobOffers, { networkId, paginationOpts: FIRST })).page).toEqual([])
    await moderate(t, networkId, "diasporaJobOffer", jobId, "removed", { ownerPageId: pageId })
    expect(await managed()).toEqual([[jobId, "removed"]])
    expect(await pro.as.query(J.getJobOffer, { networkId, jobId })).toMatchObject({ viewerCanManage: true, moderation: "removed" })
    // La personne qui candidate ne reçoit jamais l'état de l'offre : seulement qu'elle ne reçoit plus de candidatures.
    expect(await mine()).toEqual([expect.objectContaining({ applicationId, offerOpen: false, moderation: "published" })])

    // La candidature retirée : sa personne le lit ; l'équipe ne la reçoit plus.
    await moderate(t, networkId, "diasporaJobApplication", applicationId, "removed", { ownerPersonId: candidate.personId })
    expect(await mine()).toEqual([expect.objectContaining({ applicationId, moderation: "removed" })])
    expect((await pro.as.query(J.jobOfferApplications, { networkId, jobId, paginationOpts: FIRST })).page).toEqual([])

    // Le profil en relecture préalable : sa personne le lit ; la recherche ne le sert plus à un tiers.
    await moderate(t, networkId, "diasporaTalentProfile", talentId, "pending_review", { ownerPersonId: candidate.personId })
    expect(await candidate.as.query(J.myTalentProfile, { networkId })).toMatchObject({ talentId, moderation: "pending_review" })
    expect((await reader.as.query(J.searchTalents, { networkId, country: "FR", paginationOpts: FIRST })).page).toEqual([])
  })
})
