// @vitest-environment edge-runtime
/** Catalogue des services DIASPORALE : gardes, versions, états, recherche bornée et projections. */
import { engineErrorAppRule, engineErrorCode } from "@antsia/social-contracts/errors"
import { cityKeyOf, SERVICE_OFFERS_PER_PAGE_MAX, SERVICE_SEARCH_PAGE_MAX, serviceSearchTextOf } from "@diasporale/domain"
import type { FunctionReturnType } from "convex/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { api, internal } from "../../_generated/api"
import type { Doc, Id } from "../../_generated/dataModel"
import { SEED_CONFIRMATION } from "../../seeds/foundations"
import { testConvex } from "../../test.setup"

type T = ReturnType<typeof testConvex>
type Member = { as: ReturnType<T["withIdentity"]>; personId: Id<"persons"> }

const NOW = Date.UTC(2026, 9, 18, 10)
const S = api.modules.diaspora.services
const FIRST = { numItems: 10, cursor: null }

/** Une offre fictive complète : chaque test n'en change qu'un trait. */
const OFFER = {
  title: "Tresses et coiffure afro",
  description: "Coiffure afro à domicile, nattes et tresses, sur rendez-vous.",
  category: "beauty" as const,
  country: "FR",
  city: "Paris",
  delivery: "onsite" as const,
  languages: ["fr" as const],
  durationMinutes: 120,
  pricing: { mode: "from" as const, amountMinor: 6000, currency: "EUR" },
}

const CARD_KEYS = ["budgetFit", "category", "city", "country", "delivery", "description", "durationMinutes", "languages", "offerId", "page", "pricing", "title", "updatedAt", "version"]
const PAGE_CARD_KEYS = ["badge", "country", "handle", "logoUrl", "name", "networkId", "ownerKind", "pageId", "shortName"]

beforeEach(() => {
  vi.stubEnv("CONVEX_CLOUD_URL", "http://127.0.0.1:3210")
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

async function member(t: T, networkId: Id<"networks">, handle: string): Promise<Member> {
  const as = t.withIdentity({ subject: `auth-${handle}` })
  const personId = await as.mutation(api.modules.people.persons.ensureMyPerson, {})
  await as.mutation(api.modules.people.consents.recordConsent, { purpose: "social_profile", origin: "onboarding" })
  await as.mutation(api.modules.people.profile.publishMyProfile, { handle, displayName: handle })
  await t.run(async (ctx) => {
    await ctx.db.insert("identityLinks", { personId, provider: "idn", subject: `idn-${personId}`, loa: 1, nationality: "GA", linkedAt: NOW })
  })
  await as.mutation(api.modules.diaspora.membership.joinDiasporale, { networkId, facet: { countryOfResidence: "FR", city: "Paris" } })
  return { as, personId }
}

async function page(
  t: T,
  networkId: Id<"networks">,
  handle: string,
  options: { ownerKind?: Doc<"pages">["ownerKind"]; status?: Doc<"pages">["status"]; country?: string } = {},
): Promise<Id<"pages">> {
  return await t.run(async (ctx) => ctx.db.insert("pages", {
    networkId,
    handle,
    name: `Page ${handle}`,
    ownerKind: options.ownerKind ?? "company",
    trust: "community",
    trustRank: 0,
    ...(options.country !== undefined ? { country: options.country } : {}),
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

/**
 * Une offre posée directement (lots de pagination, quotas) : mêmes champs que
 * l'écriture du moteur, clé de ville et texte indexé calculés par le domaine.
 */
async function insertOffer(t: T, networkId: Id<"networks">, pageId: Id<"pages">, overrides: Partial<Omit<Doc<"serviceOffers">, "_id" | "_creationTime">> = {}): Promise<Id<"serviceOffers">> {
  const title = overrides.title ?? "Offre fictive"
  const description = overrides.description ?? "Description fictive de la prestation."
  const city = overrides.city ?? "Paris"
  return await t.run(async (ctx) => ctx.db.insert("serviceOffers", {
    networkId,
    pageId,
    category: "beauty",
    country: "FR",
    delivery: "onsite",
    languages: ["fr"],
    pricing: { mode: "quote" },
    status: "active",
    version: 1,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
    title,
    description,
    city,
    cityKey: cityKeyOf(city),
    searchText: serviceSearchTextOf({ title, description, city }),
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
  const pro = await member(t, networkId, "pro.coiffure")
  const reader = await member(t, networkId, "lectrice")
  const pageId = await page(t, networkId, "coiffure-paris-demo", { country: "FR" })
  await sign(t, networkId, pageId, pro.personId)
  return { t, root, networkId, pro, reader, pageId }
}

describe("catalogue des services — écrire", () => {
  it("un signataire vivant publie ; un membre trouve l'offre, projection allowlistée sans aucune identité", async () => {
    const { networkId, pro, reader, pageId } = await fixture()
    const created = await pro.as.mutation(S.createOffer, { networkId, pageId, ...OFFER, publish: true })
    expect(created).toMatchObject({ version: 1, status: "active" })

    const result = await reader.as.query(S.searchOffers, { networkId, paginationOpts: FIRST })
    expect(result.page).toHaveLength(1)
    const card = result.page[0]!
    expect(Object.keys(card).sort()).toEqual(CARD_KEYS)
    expect(Object.keys(card.page).sort()).toEqual(PAGE_CARD_KEYS)
    expect(card).toMatchObject({
      offerId: created.offerId, version: 1, title: OFFER.title, country: "FR", city: "Paris", delivery: "onsite", languages: ["fr"],
      durationMinutes: 120, pricing: OFFER.pricing, budgetFit: null, page: { handle: "coiffure-paris-demo", badge: "community", ownerKind: "company" },
    })
    // Aucune personne ne sort du catalogue : ni le signataire, ni le lecteur.
    expect(JSON.stringify(result)).not.toContain(pro.personId)
    expect(JSON.stringify(result)).not.toContain(reader.personId)

    expect(await reader.as.query(S.getOffer, { networkId, offerId: created.offerId })).toMatchObject({ status: "active", viewerCanManage: false })
    expect(await pro.as.query(S.getOffer, { networkId, offerId: created.offerId })).toMatchObject({ status: "active", viewerCanManage: true })
    expect(await reader.as.query(S.getOffer, { networkId, offerId: "pas-un-identifiant" })).toBeNull()
  })

  it("brouillon et pause restent invisibles ; une offre retirée est terminale et illisible par un lien conservé", async () => {
    const { networkId, pro, reader, pageId } = await fixture()
    const { offerId } = await pro.as.mutation(S.createOffer, { networkId, pageId, ...OFFER, publish: false })
    const visible = async () => (await reader.as.query(S.searchOffers, { networkId, paginationOpts: FIRST })).page.map((row) => row.offerId)

    expect(await visible()).toEqual([])
    expect(await reader.as.query(S.getOffer, { networkId, offerId })).toBeNull()
    expect(await pro.as.query(S.getOffer, { networkId, offerId })).toMatchObject({ status: "draft", viewerCanManage: true })

    expect(await pro.as.mutation(S.setOfferStatus, { networkId, offerId, expectedVersion: 1, status: "active" })).toEqual({ status: "active", version: 2 })
    expect(await visible()).toEqual([offerId])
    expect(await pro.as.mutation(S.setOfferStatus, { networkId, offerId, expectedVersion: 2, status: "paused" })).toEqual({ status: "paused", version: 3 })
    expect(await visible()).toEqual([])
    expect(await reader.as.query(S.getOffer, { networkId, offerId })).toBeNull()
    expect(await pro.as.mutation(S.setOfferStatus, { networkId, offerId, expectedVersion: 3, status: "active" })).toEqual({ status: "active", version: 4 })
    expect(await visible()).toEqual([offerId])

    expect(await pro.as.mutation(S.setOfferStatus, { networkId, offerId, expectedVersion: 4, status: "withdrawn" })).toEqual({ status: "withdrawn", version: 5 })
    expect(await visible()).toEqual([])
    expect(await reader.as.query(S.getOffer, { networkId, offerId })).toBeNull()
    expect(await pro.as.query(S.getOffer, { networkId, offerId })).toMatchObject({ status: "withdrawn", viewerCanManage: true })
    expect(await failure(pro.as.mutation(S.setOfferStatus, { networkId, offerId, expectedVersion: 5, status: "active" }))).toEqual({ code: "conflict", appRule: "service_offer_withdrawn" })
    expect(await failure(pro.as.mutation(S.updateOffer, { networkId, offerId, expectedVersion: 5, ...OFFER }))).toEqual({ code: "conflict", appRule: "service_offer_withdrawn" })
    // Redemander l'état courant ne change rien, même avec une version ancienne (double clic).
    expect(await pro.as.mutation(S.setOfferStatus, { networkId, offerId, expectedVersion: 1, status: "withdrawn" })).toEqual({ status: "withdrawn", version: 5 })
    // Un brouillon se publie ou se retire ; il ne se met pas en pause.
    const draft = await pro.as.mutation(S.createOffer, { networkId, pageId, ...OFFER, publish: false })
    expect(await failure(pro.as.mutation(S.setOfferStatus, { networkId, offerId: draft.offerId, expectedVersion: 1, status: "paused" }))).toEqual({ code: "conflict", appRule: "service_offer_transition_invalid" })
  })

  it("une modification cite la version lue : périmée, c'est un conflit et rien n'est écrit", async () => {
    const { t, networkId, pro, reader, pageId } = await fixture()
    const { offerId } = await pro.as.mutation(S.createOffer, { networkId, pageId, ...OFFER, publish: true })
    expect(await pro.as.mutation(S.updateOffer, { networkId, offerId, expectedVersion: 1, ...OFFER, title: "Nattes et vanilles", durationMinutes: null })).toEqual({ version: 2 })
    expect(await failure(pro.as.mutation(S.updateOffer, { networkId, offerId, expectedVersion: 1, ...OFFER, title: "Écrasement tardif" }))).toEqual({ code: "conflict", appRule: "service_offer_version_conflict" })
    expect(await failure(pro.as.mutation(S.setOfferStatus, { networkId, offerId, expectedVersion: 1, status: "paused" }))).toEqual({ code: "conflict", appRule: "service_offer_version_conflict" })
    const stored = await t.run(async (ctx) => ctx.db.get(offerId))
    expect(stored).toMatchObject({ title: "Nattes et vanilles", version: 2, status: "active" })
    expect(stored?.durationMinutes).toBeUndefined()
    const found = await reader.as.query(S.searchOffers, { networkId, query: "vanilles", paginationOpts: FIRST })
    expect(found.page.map((row) => [row.title, row.version, row.durationMinutes])).toEqual([["Nattes et vanilles", 2, null]])
    expect((await reader.as.query(S.searchOffers, { networkId, query: "écrasement", paginationOpts: FIRST })).page).toEqual([])
  })

  it("SV-04 : les réglages de prestation s'écrivent avec l'offre, se lisent par l'équipe seulement, sous les refus de la proposition", async () => {
    const { t, networkId, pro, reader, pageId } = await fixture()
    const providerSettings = { timeZone: " US/Eastern ", location: { mode: "onsite" as const, area: "  Paris   11e " }, cancellationTerms: " Annulation  libre jusqu'à la veille. ", bookingCapacity: 1 }
    const { offerId } = await pro.as.mutation(S.createOffer, { networkId, pageId, ...OFFER, providerSettings, publish: true })
    const written = { timeZone: "America/New_York", location: { mode: "onsite", area: "Paris 11e" }, cancellationTerms: "Annulation libre jusqu'à la veille.", bookingCapacity: 1 }
    expect((await pro.as.query(S.getOffer, { networkId, offerId }))?.providerSettings).toEqual(written)
    expect((await pro.as.query(S.myPageOffers, { networkId, pageId, paginationOpts: FIRST })).page[0]?.providerSettings).toEqual(written)
    // Le lecteur et le catalogue n'en voient rien : ce sont les réglages internes de l'équipe.
    expect((await reader.as.query(S.getOffer, { networkId, offerId }))?.providerSettings).toBeNull()
    const card = (await reader.as.query(S.searchOffers, { networkId, paginationOpts: FIRST })).page[0]!
    expect(Object.keys(card).sort()).toEqual(CARD_KEYS)

    // Une modification sans réglages les garde ; des réglages vides les effacent.
    await pro.as.mutation(S.updateOffer, { networkId, offerId, expectedVersion: 1, ...OFFER, title: "Nattes et vanilles" })
    expect((await pro.as.query(S.getOffer, { networkId, offerId }))?.providerSettings).toEqual(written)
    await pro.as.mutation(S.updateOffer, { networkId, offerId, expectedVersion: 2, ...OFFER, providerSettings: { timeZone: null, location: { mode: "remote" }, cancellationTerms: null, bookingCapacity: 3 } })
    expect((await pro.as.query(S.getOffer, { networkId, offerId }))?.providerSettings).toEqual({ timeZone: null, location: { mode: "remote" }, cancellationTerms: null, bookingCapacity: 3 })
    await pro.as.mutation(S.updateOffer, { networkId, offerId, expectedVersion: 3, ...OFFER, providerSettings: { timeZone: " ", location: null, cancellationTerms: "", bookingCapacity: 1 } })
    expect((await t.run(async (ctx) => ctx.db.get(offerId)))?.providerSettings).toBeUndefined()

    // Les mêmes refus que la proposition : ni adresse exacte, ni coordonnée, ni fuseau inconnu.
    const refused = async (settings: { timeZone: string | null; location: { mode: "onsite"; area: string } | null; cancellationTerms: string | null; bookingCapacity: number }) =>
      await failure(pro.as.mutation(S.updateOffer, { networkId, offerId, expectedVersion: 4, ...OFFER, providerSettings: settings }))
    expect(await refused({ timeZone: null, location: { mode: "onsite", area: "8 rue Oberkampf" }, cancellationTerms: null, bookingCapacity: 1 })).toEqual({ code: "invalidArgument", appRule: "request_address_forbidden" })
    expect(await refused({ timeZone: null, location: null, cancellationTerms: "Prévenir au 07 12 34 56 78", bookingCapacity: 1 })).toEqual({ code: "invalidArgument", appRule: "request_contact_forbidden" })
    expect(await refused({ timeZone: "+02:00", location: null, cancellationTerms: null, bookingCapacity: 1 })).toEqual({ code: "invalidArgument", appRule: "request_time_zone_invalid" })
    // SV-09 : de un à dix rendez-vous simultanés.
    expect(await refused({ timeZone: null, location: null, cancellationTerms: null, bookingCapacity: 11 })).toEqual({ code: "invalidArgument", appRule: "booking_capacity_invalid" })
    expect((await t.run(async (ctx) => ctx.db.get(offerId)))?.version).toBe(4)
  })

  it("refuse hors réseau, sans rôle vivant, sur une page retirée, pour une nature non admise et sous le statut requis", async () => {
    const { t, root, networkId, pro, reader, pageId } = await fixture()
    const args = { ...OFFER, publish: true }
    // Depuis la racine ANTSIA : refus (indistinct, ou statut insuffisant selon l'adhésion dérivée), rien d'écrit.
    expect(["notFound", "statusInsufficient"]).toContain((await failure(pro.as.mutation(S.createOffer, { networkId: root, pageId, ...args }))).code)
    expect(await t.run(async (ctx) => ctx.db.query("serviceOffers").take(1))).toEqual([])
    // Un membre qui ne signe pas pour la page : le même refus qu'une page inconnue.
    expect(await failure(reader.as.mutation(S.createOffer, { networkId, pageId, ...args }))).toMatchObject({ code: "notFound" })
    // Une invitation en attente ne donne aucun droit.
    const invited = await member(t, networkId, "invitee")
    await sign(t, networkId, pageId, invited.personId, false)
    expect(await failure(invited.as.mutation(S.createOffer, { networkId, pageId, ...args }))).toMatchObject({ code: "notFound" })
    // Une page retirée, ou d'une institution.
    const closed = await page(t, networkId, "page-retiree-demo", { status: "inactive" })
    await sign(t, networkId, closed, pro.personId)
    expect(await failure(pro.as.mutation(S.createOffer, { networkId, pageId: closed, ...args }))).toMatchObject({ code: "notFound" })
    const institution = await page(t, networkId, "poste-demo", { ownerKind: "institution" })
    await sign(t, networkId, institution, pro.personId)
    expect(await failure(pro.as.mutation(S.createOffer, { networkId, pageId: institution, ...args }))).toEqual({ code: "policyRefused", appRule: "service_page_kind_not_allowed" })
    // Un membre en attente ne publie pas, même signataire.
    await setMembership(t, networkId, pro.personId, "en_attente")
    expect(await failure(pro.as.mutation(S.createOffer, { networkId, pageId, ...args }))).toMatchObject({ code: "statusInsufficient" })
    // Les lectures aussi sont bornées au réseau et à la session.
    expect(await failure(reader.as.query(S.searchOffers, { networkId: root, paginationOpts: FIRST }))).toMatchObject({ code: "notFound" })
    expect(await failure(t.query(S.searchOffers, { networkId, paginationOpts: FIRST }))).toMatchObject({ code: "unauthenticated" })
    expect(await failure(reader.as.query(S.myPageOffers, { networkId, pageId, paginationOpts: FIRST }))).toMatchObject({ code: "notFound" })
  })

  it("un rôle retiré ferme aussitôt la gestion d'une offre existante", async () => {
    const { t, networkId, pro, pageId } = await fixture()
    const { offerId } = await pro.as.mutation(S.createOffer, { networkId, pageId, ...OFFER, publish: true })
    const row = await t.run(async (ctx) => ctx.db.query("pageSignatories").withIndex("by_page_person", (q) => q.eq("pageId", pageId).eq("personId", pro.personId)).unique())
    await t.run(async (ctx) => { await ctx.db.delete(row!._id) })
    expect(await failure(pro.as.mutation(S.updateOffer, { networkId, offerId, expectedVersion: 1, ...OFFER }))).toMatchObject({ code: "notFound" })
    expect(await failure(pro.as.mutation(S.setOfferStatus, { networkId, offerId, expectedVersion: 1, status: "paused" }))).toMatchObject({ code: "notFound" })
    expect(await failure(pro.as.query(S.myPageOffers, { networkId, pageId, paginationOpts: FIRST }))).toMatchObject({ code: "notFound" })
    // L'offre active reste lisible, mais plus gérable.
    expect(await pro.as.query(S.getOffer, { networkId, offerId })).toMatchObject({ viewerCanManage: false })
  })

  it.each([
    [{ title: "Ab" }, "service_title_too_short"],
    [{ description: "Appelez le 06 12 34 56 78 pour réserver." }, "service_contact_details_forbidden"],
    [{ country: "GA" }, "service_country_is_home"],
    [{ city: "  " }, "service_city_required"],
    [{ durationMinutes: 2 }, "service_duration_invalid"],
    [{ pricing: { mode: "from" as const, amountMinor: 0, currency: "EUR" } }, "service_price_from_zero"],
    [{ pricing: { mode: "fixed" as const, amountMinor: 100, currency: "BTC" } }, "currency_invalid"],
  ])("rend la règle du domaine %o avec son code fermé", async (change, appRule) => {
    const { networkId, pro, pageId } = await fixture()
    expect(await failure(pro.as.mutation(S.createOffer, { networkId, pageId, ...OFFER, ...change, publish: true }))).toEqual({ code: "invalidArgument", appRule })
  })

  it("plafonne les offres non retirées d'une page et limite le débit des écritures", async () => {
    const { t, networkId, pro, pageId } = await fixture()
    for (let index = 0; index < SERVICE_OFFERS_PER_PAGE_MAX - 1; index += 1) await insertOffer(t, networkId, pageId, { status: index % 3 === 0 ? "paused" : "active" })
    await insertOffer(t, networkId, pageId, { status: "withdrawn" })
    await pro.as.mutation(S.createOffer, { networkId, pageId, ...OFFER, publish: false })
    expect(await failure(pro.as.mutation(S.createOffer, { networkId, pageId, ...OFFER, publish: false }))).toEqual({ code: "conflict", appRule: "service_offer_limit_reached" })

    const other = await page(t, networkId, "photo-lyon-demo")
    await sign(t, networkId, other, pro.personId)
    const outcomes: (string | null)[] = []
    for (let index = 0; index < 10; index += 1) outcomes.push((await failure(pro.as.mutation(S.createOffer, { networkId, pageId: other, ...OFFER, publish: true }))).code)
    // Le seau de débit est celui de la PERSONNE : la création admise ci-dessus a déjà pris un jeton.
    expect(outcomes.filter((code) => code === null).length).toBeGreaterThan(0)
    expect(outcomes.at(-1)).toBe("rateLimited")
  })
})

describe("catalogue des services — chercher", () => {
  async function catalog() {
    const base = await fixture()
    const { t, networkId, pageId } = base
    const lyon = await page(t, networkId, "collectif-lyon-demo", { ownerKind: "association" })
    const ids = {
      parisBeauty: await insertOffer(t, networkId, pageId, { title: "Coiffure afro", category: "beauty", pricing: { mode: "fixed", amountMinor: 4000, currency: "EUR" } }),
      parisTranslation: await insertOffer(t, networkId, pageId, { title: "Traduction de courriers", category: "translation", delivery: "remote", pricing: { mode: "quote" } }),
      saintEtienne: await insertOffer(t, networkId, pageId, { title: "Photographie de mariage", city: "Saint-Étienne", category: "photography", delivery: "both", pricing: { mode: "from", amountMinor: 6000, currency: "EUR" } }),
      brussels: await insertOffer(t, networkId, lyon, { title: "Aide à l'installation", country: "BE", city: "Bruxelles", category: "settling_in", delivery: "both", pricing: { mode: "fixed", amountMinor: 20000, currency: "XAF" } }),
      lyonFree: await insertOffer(t, networkId, lyon, { title: "Affiches d'évènements", city: "Lyon", category: "digital_creation", delivery: "remote", pricing: { mode: "fixed", amountMinor: 0, currency: "EUR" } }),
    }
    // Hors du catalogue : une offre en pause, une offre d'un autre réseau.
    await insertOffer(t, networkId, pageId, { status: "paused", title: "Offre en pause" })
    await insertOffer(t, base.root, pageId, { title: "Offre d'un autre réseau" })
    return { ...base, lyon, ids }
  }

  async function search(base: Awaited<ReturnType<typeof catalog>>, filters: Record<string, unknown>) {
    const result = await base.reader.as.query(S.searchOffers, { networkId: base.networkId, ...filters, paginationOpts: { numItems: 20, cursor: null } })
    return result.page
  }

  it("trouve une ville saisie, sans GPS, avec ou sans pays, accents et tirets repliés", async () => {
    const base = await catalog()
    const ids = (rows: { offerId: Id<"serviceOffers"> }[]) => rows.map((row) => row.offerId).sort()
    expect(ids(await search(base, { city: " PARIS " }))).toEqual([base.ids.parisBeauty, base.ids.parisTranslation].sort())
    expect(ids(await search(base, { city: "paris", country: "fr" }))).toEqual([base.ids.parisBeauty, base.ids.parisTranslation].sort())
    expect(ids(await search(base, { city: "saint etienne" }))).toEqual([base.ids.saintEtienne])
    expect(ids(await search(base, { city: "Saint-Étienne", country: "BE" }))).toEqual([])
    expect(ids(await search(base, { country: "BE" }))).toEqual([base.ids.brussels])
  })

  it("filtre par catégorie, par mode (« les deux » répond aux deux) et par texte replié", async () => {
    const base = await catalog()
    const ids = (rows: { offerId: Id<"serviceOffers"> }[]) => rows.map((row) => row.offerId).sort()
    expect(ids(await search(base, { category: "beauty" }))).toEqual([base.ids.parisBeauty])
    expect(ids(await search(base, { category: "beauty", country: "FR" }))).toEqual([base.ids.parisBeauty])
    expect(ids(await search(base, { delivery: "remote" }))).toEqual([base.ids.parisTranslation, base.ids.saintEtienne, base.ids.brussels, base.ids.lyonFree].sort())
    expect(ids(await search(base, { delivery: "onsite" }))).toEqual([base.ids.parisBeauty, base.ids.saintEtienne, base.ids.brussels].sort())
    expect(ids(await search(base, { query: "Coiffure" }))).toEqual([base.ids.parisBeauty])
    expect(ids(await search(base, { query: "évènements" }))).toEqual([base.ids.lyonFree])
    expect(ids(await search(base, { query: "pause" }))).toEqual([])
    // Une requête d'un caractère ne cherche pas : le catalogue retombe sur ses filtres.
    expect((await search(base, { query: "z" })).length).toBe(5)
  })

  it("dit ce que le budget fait de chaque offre : au-dessus, écartée ; sur devis ou autre devise, gardée et signalée", async () => {
    const base = await catalog()
    const rows = await search(base, { maxBudgetMinor: 5000, currency: "EUR" })
    expect(Object.fromEntries(rows.map((row) => [row.offerId, row.budgetFit]))).toEqual({
      [base.ids.parisBeauty]: "within",
      [base.ids.parisTranslation]: "quote",
      [base.ids.brussels]: "other_currency",
      [base.ids.lyonFree]: "within",
    })
    expect(await failure(base.reader.as.query(S.searchOffers, { networkId: base.networkId, maxBudgetMinor: 5000, paginationOpts: FIRST }))).toEqual({ code: "invalidArgument", appRule: "currency_invalid" })
    expect(await failure(base.reader.as.query(S.searchOffers, { networkId: base.networkId, country: "GA", paginationOpts: FIRST }))).toEqual({ code: "invalidArgument", appRule: "service_country_is_home" })
    expect(await failure(base.reader.as.query(S.searchOffers, { networkId: base.networkId, query: "x".repeat(101), paginationOpts: FIRST }))).toEqual({ code: "invalidArgument", appRule: "service_query_too_long" })
  })

  it("une page retirée emporte ses offres ; la fiche d'une page ne liste que ses offres actives", async () => {
    const base = await catalog()
    const { t, networkId, reader, pageId } = base
    const listed = await reader.as.query(S.pageOffers, { networkId, handle: "coiffure-paris-demo", paginationOpts: FIRST })
    expect(listed?.page.map((row) => row.offerId).sort()).toEqual([base.ids.parisBeauty, base.ids.parisTranslation, base.ids.saintEtienne].sort())
    expect(await reader.as.query(S.pageOffers, { networkId, handle: "inconnue-demo", paginationOpts: FIRST })).toBeNull()
    await t.run(async (ctx) => { await ctx.db.patch(pageId, { status: "inactive" }) })
    expect(await reader.as.query(S.pageOffers, { networkId, handle: "coiffure-paris-demo", paginationOpts: FIRST })).toBeNull()
    expect((await search(base, {})).map((row) => row.offerId).sort()).toEqual([base.ids.brussels, base.ids.lyonFree].sort())
    expect(await reader.as.query(S.getOffer, { networkId, offerId: base.ids.parisBeauty })).toBeNull()
    const institution = await page(t, networkId, "poste-consulaire-demo", { ownerKind: "institution" })
    await insertOffer(t, networkId, institution)
    expect(await reader.as.query(S.pageOffers, { networkId, handle: "poste-consulaire-demo", paginationOpts: FIRST })).toBeNull()
  })

  it("pagine de façon stable, bornée à vingt, sans doublon ni offre hors catalogue", async () => {
    const { t, networkId, reader, pageId, root } = await fixture()
    const created: Id<"serviceOffers">[] = []
    for (let index = 0; index < 25; index += 1) created.push(await insertOffer(t, networkId, pageId, { title: `Offre ${index}`, createdAt: NOW + index }))
    await insertOffer(t, networkId, pageId, { status: "draft" })
    await insertOffer(t, root, pageId)
    const seen: Id<"serviceOffers">[] = []
    let cursor: string | null = null
    let pages = 0
    do {
      const result: FunctionReturnType<typeof S.searchOffers> = await reader.as.query(S.searchOffers, { networkId, paginationOpts: { numItems: 10, cursor } })
      seen.push(...result.page.map((row) => row.offerId))
      cursor = result.isDone ? null : result.continueCursor
      pages += 1
    } while (cursor !== null && pages < 10)
    expect(seen).toEqual([...created].reverse())
    expect((await reader.as.query(S.searchOffers, { networkId, paginationOpts: { numItems: 500, cursor: null } })).page).toHaveLength(SERVICE_SEARCH_PAGE_MAX)
    expect((await reader.as.query(S.searchOffers, { networkId, paginationOpts: { numItems: 0, cursor: null } })).page).toHaveLength(1)
  })

  it("mes offres : tous les états pour le signataire vivant, groupés par état", async () => {
    const { t, networkId, pro, pageId } = await fixture()
    const draft = await insertOffer(t, networkId, pageId, { status: "draft" })
    const active = await insertOffer(t, networkId, pageId, { status: "active" })
    const paused = await insertOffer(t, networkId, pageId, { status: "paused" })
    const withdrawn = await insertOffer(t, networkId, pageId, { status: "withdrawn" })
    const result = await pro.as.query(S.myPageOffers, { networkId, pageId, paginationOpts: { numItems: 50, cursor: null } })
    expect(result.page.map((row) => [row.offerId, row.status, row.viewerCanManage])).toEqual([
      [active, "active", true],
      [draft, "draft", true],
      [paused, "paused", true],
      [withdrawn, "withdrawn", true],
    ])
  })
})
