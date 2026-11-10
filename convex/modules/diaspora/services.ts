/**
 * Catalogue des services DIASPORALE (DG-011/012) — tranche `diaspora`, écrite par
 * la session DIASPORALE (chantier « catalogue des services »).
 *
 * Une offre appartient à une PAGE professionnelle (entreprise ou association) ;
 * ses SIGNATAIRES VIVANTS la gèrent (relus à chaque acte, `liveSignatoryRole`).
 * Mise en relation seulement : un tarif est ANNONCÉ, rien n'est encaissé ni
 * commandé ici ; le contact passe par la demande structurée (tranche des
 * demandes), jamais par une coordonnée.
 *
 * Gardes, dans cet ordre, pour chaque écriture : adhésion au réseau DIASPORALE
 * (constructeur) → éligibilité (capacité `publish` du domaine) → débit
 * (`diaspora.service.offer`) → droit (page active du réseau, signataire vivant,
 * nature admise) → règles du domaine (`@diasporale/domain`, codes fermés).
 *
 * Lectures : SEULES les offres `active` de pages actives, lisibles et admises
 * sortent du catalogue ; une offre en pause, en brouillon ou retirée n'est lue
 * que par les signataires vivants de sa page — un lien conservé n'ouvre rien.
 * Projection allowlistée : l'offre et la CARTE de sa page (badge calculé), sans
 * aucune identité de signataire ni coordonnée.
 */
import {
  checkOfferVersion,
  hasCapability,
  initialOfferStatus,
  isKeptByBudget,
  isOfferEditable,
  isOfferPublic,
  isServiceProviderOwnerKind,
  matchesDeliveryFilter,
  parseServiceOffer,
  parseServiceProviderSettings,
  parseServiceSearch,
  SERVICE_BUDGET_FITS,
  SERVICE_CATEGORIES,
  SERVICE_DELIVERY_MODES,
  SERVICE_LANGUAGE_CODES,
  SERVICE_OFFER_STATUS_TARGETS,
  SERVICE_OFFERS_PER_PAGE_MAX,
  SERVICE_SEARCH_PAGE_MAX,
  serviceBudgetFit,
  transitionOffer,
  type MemberCapability,
  type ServiceBudgetFit,
  type ServiceOfferDraft,
  type ServiceProviderSettings,
  type ServiceSearchFilters,
} from "@diasporale/domain"
import { type PaginationOptions, paginationOptsValidator, paginationResultValidator, type PaginationResult } from "convex/server"
import { type Infer, v } from "convex/values"

import type { Doc, Id } from "../../_generated/dataModel"
import type { QueryCtx } from "../../_generated/server"
import { effectiveMembershipStatus } from "../../lib/access"
import { fail, failAppRule, notFound } from "../../lib/errors"
import { networkMutation, networkQuery } from "../../lib/functions"
import { enforceRateLimit } from "../../lib/rateLimit"
import { literals } from "../../lib/validators"
import { liveSignatoryRole, pageCardOf, readablePageByHandle, readablePageOrNull } from "../pages/access"
import { type PageCard, pageCardValidator } from "../pages/validators"
import { assertDiasporaNetwork } from "./facts"
import { serviceLocationValidator } from "./serviceRequestsTables"
import { serviceOfferStatusValidator, servicePricingValidator } from "./servicesTables"

/** Lignes d'une page de « mes offres » (tous états) : plafond dur. */
const MANAGED_PAGE_MAX = 50
/** Octets lus au plus par page de résultats : une offre pèse quelques kilo-octets. */
const PAGE_BYTES = 1024 * 1024

// ═══════════════════════════════════════════════════════════════
// Projections
// ═══════════════════════════════════════════════════════════════

/** La carte d'une offre dans le catalogue : l'offre et la carte de sa page, rien d'autre. */
const offerCardValidator = v.object({
  offerId: v.id("serviceOffers"),
  /** La version lue : une demande la cite, une modification l'attend. */
  version: v.number(),
  title: v.string(),
  description: v.string(),
  category: literals(SERVICE_CATEGORIES),
  country: v.string(),
  city: v.string(),
  delivery: literals(SERVICE_DELIVERY_MODES),
  languages: v.array(v.string()),
  durationMinutes: v.union(v.number(), v.null()),
  pricing: servicePricingValidator,
  page: pageCardValidator,
  /** Ce que le budget demandé dit de l'offre (`null` sans budget) : la règle se montre, elle ne trie pas en silence. */
  budgetFit: v.union(literals(SERVICE_BUDGET_FITS), v.null()),
  updatedAt: v.number(),
})

/** SV-04 : les réglages de prestation, tels que l'équipe les lit et les écrit ; `null` : non réglé. */
export const providerSettingsValidator = v.object({
  timeZone: v.union(v.string(), v.null()),
  location: v.union(serviceLocationValidator, v.null()),
  cancellationTerms: v.union(v.string(), v.null()),
})

/** La fiche d'une offre : sa carte, son état, et si le lecteur peut la gérer (signataire vivant). */
const offerDetailValidator = v.object({
  ...offerCardValidator.fields,
  status: serviceOfferStatusValidator,
  viewerCanManage: v.boolean(),
  /** SV-04 : les réglages de prestation, pour l'équipe seulement ; `null` pour tout autre lecteur. */
  providerSettings: v.union(providerSettingsValidator, v.null()),
})

type OfferCard = Infer<typeof offerCardValidator>
type OfferDetail = Infer<typeof offerDetailValidator>
type ProviderSettingsView = Infer<typeof providerSettingsValidator>

/** Les réglages ÉCRITS d'une offre, lus par son équipe : un champ absent n'est pas réglé. */
export function providerSettingsOf(offer: Doc<"serviceOffers">): ProviderSettingsView {
  const settings = offer.providerSettings
  return { timeZone: settings?.timeZone ?? null, location: settings?.location ?? null, cancellationTerms: settings?.cancellationTerms ?? null }
}

function toOfferCard(offer: Doc<"serviceOffers">, page: PageCard, budgetFit: ServiceBudgetFit | null): OfferCard {
  return {
    offerId: offer._id,
    version: offer.version,
    title: offer.title,
    description: offer.description,
    category: offer.category,
    country: offer.country,
    city: offer.city,
    delivery: offer.delivery,
    languages: offer.languages,
    durationMinutes: offer.durationMinutes ?? null,
    pricing: offer.pricing,
    page,
    budgetFit,
    updatedAt: offer.updatedAt,
  }
}

function toOfferDetail(offer: Doc<"serviceOffers">, page: PageCard, viewerCanManage: boolean): OfferDetail {
  return { ...toOfferCard(offer, page, null), status: offer.status, viewerCanManage, providerSettings: viewerCanManage ? providerSettingsOf(offer) : null }
}

// ═══════════════════════════════════════════════════════════════
// Gardes
// ═══════════════════════════════════════════════════════════════

/** Éligibilité : la capacité du STATUT courant (expiration d'une sanction comprise), règle du domaine. */
function assertCapability(ctx: { membership: Doc<"networkMemberships"> }, capability: MemberCapability): void {
  const status = effectiveMembershipStatus(ctx.membership)
  if (status === null || !hasCapability(status, capability)) fail("statusInsufficient")
}

/** Une page du réseau, active, lisible par ce lecteur, et qui peut proposer des services — ou `null`. */
async function readableProviderPage(ctx: Pick<QueryCtx, "db">, network: Doc<"networks">, pageId: Id<"pages">, readerPersonId: Id<"persons">): Promise<Doc<"pages"> | null> {
  const page = await readablePageOrNull(ctx, network, pageId, readerPersonId)
  if (!page || page.networkId !== network._id || !isServiceProviderOwnerKind(page.ownerKind)) return null
  return page
}

/**
 * La page GÉRÉE : du réseau, active, l'appelant y est signataire VIVANT (refus
 * indistinct sinon), puis de nature admise (entreprise ou association).
 */
async function managedProviderPage(ctx: Pick<QueryCtx, "db"> & { networkId: Id<"networks">; person: Doc<"persons"> }, pageId: Id<"pages">): Promise<Doc<"pages">> {
  const page = await ctx.db.get(pageId)
  if (!page || page.networkId !== ctx.networkId || page.status !== "active") return notFound()
  if ((await liveSignatoryRole(ctx, page, ctx.person._id)) === null) return notFound()
  if (!isServiceProviderOwnerKind(page.ownerKind)) return failAppRule("service_page_kind_not_allowed")
  return page
}

/** L'offre gérée et sa page : offre du réseau, page gérée par l'appelant. */
async function managedOffer(ctx: Pick<QueryCtx, "db"> & { networkId: Id<"networks">; person: Doc<"persons"> }, offerId: Id<"serviceOffers">): Promise<Doc<"serviceOffers">> {
  const offer = await ctx.db.get(offerId)
  if (!offer || offer.networkId !== ctx.networkId) return notFound()
  await managedProviderPage(ctx, offer.pageId)
  return offer
}

/**
 * Pour la tranche des demandes : l'offre ACTIVE d'une page lisible et admise,
 * ou `null` (inconnue, d'ailleurs, en pause, retirée, page retirée : la même
 * réponse). Un lien conservé vers une offre qui n'est plus active ne mène à rien.
 */
export async function contactableOfferOrNull(
  ctx: Pick<QueryCtx, "db">,
  network: Doc<"networks">,
  offerId: Id<"serviceOffers">,
  readerPersonId: Id<"persons">,
): Promise<{ offer: Doc<"serviceOffers">; page: Doc<"pages"> } | null> {
  const offer = await ctx.db.get(offerId)
  if (!offer || offer.networkId !== network._id || !isOfferPublic(offer.status)) return null
  const page = await readableProviderPage(ctx, network, offer.pageId, readerPersonId)
  return page ? { offer, page } : null
}

/** Une page de lecture bornée : jamais plus que le plafond, jamais plus d'octets que la borne. */
function bounded(opts: PaginationOptions, max: number): PaginationOptions {
  const requested = Number.isFinite(opts.numItems) ? Math.trunc(opts.numItems) : max
  return {
    ...opts,
    numItems: Math.min(Math.max(requested, 1), max),
    maximumBytesRead: Math.min(opts.maximumBytesRead ?? PAGE_BYTES, PAGE_BYTES),
  }
}

// ═══════════════════════════════════════════════════════════════
// Lire le catalogue
// ═══════════════════════════════════════════════════════════════

/**
 * La requête du catalogue : la recherche plein texte (repliée sans accents) dès
 * deux caractères, sinon l'index le plus étroit des filtres posés — ville (avec
 * ou sans pays), pays (et catégorie), catégorie, ou le catalogue entier, les
 * plus récentes d'abord. Toujours bornée au réseau ET aux offres actives.
 */
function catalogQuery(ctx: Pick<QueryCtx, "db">, networkId: Id<"networks">, filters: ServiceSearchFilters) {
  const { query, country, cityKey, category } = filters
  if (query !== null) {
    return ctx.db.query("serviceOffers").withSearchIndex("search_by_text", (q) => {
      const base = q.search("searchText", query).eq("networkId", networkId).eq("status", "active")
      const inCountry = country === null ? base : base.eq("country", country)
      return category === null ? inCountry : inCountry.eq("category", category)
    })
  }
  if (cityKey !== null && country !== null) {
    return ctx.db
      .query("serviceOffers")
      .withIndex("by_network_and_status_and_country_and_cityKey", (q) => q.eq("networkId", networkId).eq("status", "active").eq("country", country).eq("cityKey", cityKey))
      .order("desc")
  }
  if (cityKey !== null) {
    return ctx.db
      .query("serviceOffers")
      .withIndex("by_network_and_status_and_cityKey", (q) => q.eq("networkId", networkId).eq("status", "active").eq("cityKey", cityKey))
      .order("desc")
  }
  if (country !== null && category !== null) {
    return ctx.db
      .query("serviceOffers")
      .withIndex("by_network_and_status_and_country_and_category", (q) => q.eq("networkId", networkId).eq("status", "active").eq("country", country).eq("category", category))
      .order("desc")
  }
  if (country !== null) {
    return ctx.db
      .query("serviceOffers")
      .withIndex("by_network_and_status_and_country_and_category", (q) => q.eq("networkId", networkId).eq("status", "active").eq("country", country))
      .order("desc")
  }
  if (category !== null) {
    return ctx.db
      .query("serviceOffers")
      .withIndex("by_network_and_status_and_category", (q) => q.eq("networkId", networkId).eq("status", "active").eq("category", category))
      .order("desc")
  }
  return ctx.db
    .query("serviceOffers")
    .withIndex("by_network_and_status", (q) => q.eq("networkId", networkId).eq("status", "active"))
    .order("desc")
}

/**
 * Chercher dans le catalogue : texte, pays, ville saisie (sans GPS), catégorie,
 * présentiel ou distance, budget. Chaque filtre RESTREINT ; une page filtrée
 * peut être courte, voire vide, tout en annonçant sa suite (`isDone`). Aucun
 * historique de recherche n'est gardé.
 */
export const searchOffers = networkQuery({
  args: {
    query: v.optional(v.string()),
    country: v.optional(v.string()),
    city: v.optional(v.string()),
    category: v.optional(v.string()),
    delivery: v.optional(v.string()),
    maxBudgetMinor: v.optional(v.number()),
    currency: v.optional(v.string()),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(offerCardValidator),
  handler: async (ctx, args): Promise<PaginationResult<OfferCard>> => {
    assertDiasporaNetwork(ctx.network)
    assertCapability(ctx, "read_network")
    const parsed = parseServiceSearch({
      query: args.query,
      country: args.country,
      city: args.city,
      category: args.category,
      delivery: args.delivery,
      ...(args.maxBudgetMinor !== undefined || args.currency !== undefined
        ? { budget: { amountMinor: args.maxBudgetMinor ?? Number.NaN, currency: args.currency ?? "" } }
        : {}),
    })
    if (!parsed.ok) return failAppRule(parsed.code, {}, "invalidArgument")
    const filters = parsed.value
    const result = await catalogQuery(ctx, ctx.networkId, filters).paginate(bounded(args.paginationOpts, SERVICE_SEARCH_PAGE_MAX))
    const cards = new Map<Id<"pages">, PageCard | null>()
    const page: OfferCard[] = []
    for (const offer of result.page) {
      // Défense en profondeur : l'index borne déjà, chaque ligne est rejugée.
      if (offer.networkId !== ctx.networkId || !isOfferPublic(offer.status)) continue
      if (filters.country !== null && offer.country !== filters.country) continue
      if (filters.cityKey !== null && offer.cityKey !== filters.cityKey) continue
      if (filters.category !== null && offer.category !== filters.category) continue
      if (!matchesDeliveryFilter(offer.delivery, filters.delivery)) continue
      const fit = filters.budget === null ? null : serviceBudgetFit(offer.pricing, filters.budget)
      if (fit !== null && !isKeptByBudget(fit)) continue
      let card = cards.get(offer.pageId)
      if (card === undefined) {
        const provider = await readableProviderPage(ctx, ctx.network, offer.pageId, ctx.person._id)
        card = provider ? await pageCardOf(ctx, provider) : null
        cards.set(offer.pageId, card)
      }
      if (card) page.push(toOfferCard(offer, card, fit))
    }
    return { ...result, page }
  },
})

/**
 * La fiche d'une offre : une offre ACTIVE d'une page lisible, ou TOUTE offre
 * d'une page dont le lecteur est signataire vivant (`viewerCanManage`). Sinon,
 * le même `null` : inconnue, d'ailleurs, en pause ou retirée ne se distinguent pas.
 */
export const getOffer = networkQuery({
  args: { offerId: v.string() },
  returns: v.union(offerDetailValidator, v.null()),
  handler: async (ctx, args): Promise<OfferDetail | null> => {
    assertDiasporaNetwork(ctx.network)
    assertCapability(ctx, "read_network")
    const offerId = ctx.db.normalizeId("serviceOffers", args.offerId)
    if (offerId === null) return null
    const offer = await ctx.db.get(offerId)
    if (!offer || offer.networkId !== ctx.networkId) return null
    const page = await ctx.db.get(offer.pageId)
    if (!page || page.networkId !== ctx.networkId || !isServiceProviderOwnerKind(page.ownerKind)) return null
    if ((await liveSignatoryRole(ctx, page, ctx.person._id)) !== null) return toOfferDetail(offer, await pageCardOf(ctx, page), true)
    if (!isOfferPublic(offer.status)) return null
    const readable = await readableProviderPage(ctx, ctx.network, offer.pageId, ctx.person._id)
    return readable ? toOfferDetail(offer, await pageCardOf(ctx, readable), false) : null
  },
})

/** Les offres ACTIVES d'une page, sur sa fiche, les plus récentes d'abord ; page illisible : `null`. */
export const pageOffers = networkQuery({
  args: {
    handle: v.string(),
    category: v.optional(v.string()),
    delivery: v.optional(v.string()),
    expectedPersonId: v.optional(v.id("persons")),
    paginationOpts: paginationOptsValidator,
  },
  returns: v.union(paginationResultValidator(offerCardValidator), v.null()),
  handler: async (ctx, args): Promise<PaginationResult<OfferCard> | null> => {
    assertDiasporaNetwork(ctx.network)
    assertCapability(ctx, "read_network")
    if (args.expectedPersonId !== undefined && args.expectedPersonId !== ctx.person._id) return notFound()
    const page = await readablePageByHandle(ctx, ctx.network, args.handle, ctx.person._id)
    if (!page || page.networkId !== ctx.networkId || !isServiceProviderOwnerKind(page.ownerKind)) return null
    const parsed = parseServiceSearch({ category: args.category, delivery: args.delivery })
    if (!parsed.ok) return failAppRule(parsed.code, {}, "invalidArgument")
    const { category, delivery } = parsed.value
    const filtered = category !== null || delivery !== null
    let query = ctx.db
      .query("serviceOffers")
      .withIndex("by_network_and_page_and_status", (q) => q.eq("networkId", ctx.networkId).eq("pageId", page._id).eq("status", "active"))
      .order("desc")
    if (category !== null) query = query.filter((q) => q.eq(q.field("category"), category))
    if (delivery !== null) query = query.filter((q) => q.or(q.eq(q.field("delivery"), delivery), q.eq(q.field("delivery"), "both")))
    let paginationOpts = bounded(args.paginationOpts, SERVICE_SEARCH_PAGE_MAX)
    if (filtered) {
      const readBudget = (requested: number | undefined, maximum: number) => requested === undefined || !Number.isFinite(requested)
        ? maximum
        : Math.min(Math.max(Math.trunc(requested), 1), maximum)
      paginationOpts = {
        ...paginationOpts,
        maximumRowsRead: readBudget(args.paginationOpts.maximumRowsRead, 200),
        maximumBytesRead: readBudget(args.paginationOpts.maximumBytesRead, PAGE_BYTES),
      }
    }
    const result = await query.paginate(paginationOpts)
    const card = await pageCardOf(ctx, page)
    const offers = filtered ? result.page.filter((offer) => offer.networkId === ctx.networkId && offer.pageId === page._id
      && isOfferPublic(offer.status) && (category === null || offer.category === category)
      && matchesDeliveryFilter(offer.delivery, delivery)) : result.page
    return { ...result, page: offers.map((offer) => toOfferCard(offer, card, null)) }
  },
})

/**
 * « Mon activité » : les offres d'une page que je gère, dans TOUS leurs états
 * (actives, brouillons, en pause, retirées), groupées par état. Signataire
 * vivant seulement ; sinon le refus indistinct.
 */
export const myPageOffers = networkQuery({
  args: {
    pageId: v.id("pages"),
    status: v.optional(serviceOfferStatusValidator),
    expectedPersonId: v.optional(v.id("persons")),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(offerDetailValidator),
  handler: async (ctx, args): Promise<PaginationResult<OfferDetail>> => {
    assertDiasporaNetwork(ctx.network)
    assertCapability(ctx, "read_network")
    if (args.expectedPersonId !== undefined && args.expectedPersonId !== ctx.person._id) return notFound()
    const page = await managedProviderPage(ctx, args.pageId)
    const { status } = args
    const result = await ctx.db
      .query("serviceOffers")
      .withIndex("by_network_and_page_and_status", (q) => {
        const inPage = q.eq("networkId", ctx.networkId).eq("pageId", page._id)
        return status === undefined ? inPage : inPage.eq("status", status)
      })
      .paginate(bounded(args.paginationOpts, MANAGED_PAGE_MAX))
    const card = await pageCardOf(ctx, page)
    const offers = result.page.filter((offer) => offer.networkId === ctx.networkId && offer.pageId === page._id
      && (status === undefined || offer.status === status))
    return { ...result, page: offers.map((offer) => toOfferDetail(offer, card, true)) }
  },
})

// ═══════════════════════════════════════════════════════════════
// Gérer une offre
// ═══════════════════════════════════════════════════════════════

/** Les champs saisis d'une offre : précis ici, jugés par le domaine ensuite. */
const offerInputFields = {
  title: v.string(),
  description: v.string(),
  category: literals(SERVICE_CATEGORIES),
  country: v.string(),
  city: v.string(),
  delivery: literals(SERVICE_DELIVERY_MODES),
  languages: v.array(literals(SERVICE_LANGUAGE_CODES)),
  durationMinutes: v.union(v.number(), v.null()),
  pricing: servicePricingValidator,
  /** SV-04 : les réglages de prestation ; absents, ceux déjà écrits restent tels quels. */
  providerSettings: v.optional(providerSettingsValidator),
}

type OfferInputArgs = { [K in keyof typeof offerInputFields]: Infer<(typeof offerInputFields)[K]> }

/** La saisie jugée par LA règle du domaine ; un refus devient un code d'application. */
function draftOf(args: OfferInputArgs): ServiceOfferDraft {
  const draft = parseServiceOffer({
    title: args.title,
    description: args.description,
    category: args.category,
    country: args.country,
    city: args.city,
    delivery: args.delivery,
    languages: args.languages,
    durationMinutes: args.durationMinutes,
    pricing: args.pricing,
  })
  if (!draft.ok) return failAppRule(draft.code, {}, "invalidArgument")
  return draft.value
}

/** Les champs écrits d'un brouillon validé (la durée absente reste absente). */
function storedFields(draft: ServiceOfferDraft) {
  return {
    title: draft.title,
    description: draft.description,
    category: draft.category,
    country: draft.country,
    city: draft.city,
    cityKey: draft.cityKey,
    delivery: draft.delivery,
    languages: [...draft.languages],
    pricing: draft.pricing.mode === "quote" ? { mode: "quote" as const } : { mode: draft.pricing.mode, amountMinor: draft.pricing.amountMinor, currency: draft.pricing.currency },
    searchText: draft.searchText,
  }
}

/**
 * SV-04 : les réglages saisis, jugés par LA règle du domaine (mêmes refus que la
 * proposition), en champs écrits ; `undefined` quand rien n'est réglé.
 */
function storedSettingsOf(input: ProviderSettingsView): Doc<"serviceOffers">["providerSettings"] {
  const parsed = parseServiceProviderSettings(input)
  if (!parsed.ok) return failAppRule(parsed.code, {}, "invalidArgument")
  const settings: ServiceProviderSettings = parsed.value
  const stored = {
    ...(settings.timeZone !== null ? { timeZone: settings.timeZone } : {}),
    ...(settings.location !== null ? { location: settings.location } : {}),
    ...(settings.cancellationTerms !== null ? { cancellationTerms: settings.cancellationTerms } : {}),
  }
  return Object.keys(stored).length > 0 ? stored : undefined
}

/** Une page ne porte pas plus de `SERVICE_OFFERS_PER_PAGE_MAX` offres non retirées (lecture bornée par état). */
async function assertOfferQuota(ctx: Pick<QueryCtx, "db">, networkId: Id<"networks">, pageId: Id<"pages">): Promise<void> {
  let count = 0
  for (const status of ["draft", "active", "paused"] as const) {
    const rows = await ctx.db
      .query("serviceOffers")
      .withIndex("by_network_and_page_and_status", (q) => q.eq("networkId", networkId).eq("pageId", pageId).eq("status", status))
      .take(SERVICE_OFFERS_PER_PAGE_MAX)
    count += rows.length
    if (count >= SERVICE_OFFERS_PER_PAGE_MAX) failAppRule("service_offer_limit_reached", { max: SERVICE_OFFERS_PER_PAGE_MAX }, "conflict")
  }
}

/** Créer une offre au nom d'une page que je gère : brouillon, ou active si je la publie aussitôt. */
export const createOffer = networkMutation({
  args: { pageId: v.id("pages"), ...offerInputFields, publish: v.boolean() },
  returns: v.object({ offerId: v.id("serviceOffers"), version: v.number(), status: serviceOfferStatusValidator }),
  handler: async (ctx, args) => {
    assertDiasporaNetwork(ctx.network)
    assertCapability(ctx, "publish")
    await enforceRateLimit(ctx, "diaspora.service.offer", ctx.person._id)
    const page = await managedProviderPage(ctx, args.pageId)
    const draft = draftOf(args)
    const settings = args.providerSettings === undefined ? undefined : storedSettingsOf(args.providerSettings)
    await assertOfferQuota(ctx, ctx.networkId, page._id)
    const now = Date.now()
    const status = initialOfferStatus(args.publish)
    const offerId = await ctx.db.insert("serviceOffers", {
      networkId: ctx.networkId,
      pageId: page._id,
      ...storedFields(draft),
      ...(draft.durationMinutes !== null ? { durationMinutes: draft.durationMinutes } : {}),
      ...(settings !== undefined ? { providerSettings: settings } : {}),
      status,
      version: 1,
      createdAt: now,
      updatedAt: now,
    })
    return { offerId, version: 1, status }
  },
})

/**
 * Modifier une offre (non retirée) : la modification cite la version lue
 * (`expectedVersion`) ; si l'offre a changé entre-temps, conflit, rien n'est
 * écrit. Toute modification incrémente la version.
 */
export const updateOffer = networkMutation({
  args: { offerId: v.id("serviceOffers"), expectedVersion: v.number(), ...offerInputFields },
  returns: v.object({ version: v.number() }),
  handler: async (ctx, args) => {
    assertDiasporaNetwork(ctx.network)
    assertCapability(ctx, "publish")
    await enforceRateLimit(ctx, "diaspora.service.offer", ctx.person._id)
    const offer = await managedOffer(ctx, args.offerId)
    if (!isOfferEditable(offer.status)) return failAppRule("service_offer_withdrawn", {}, "conflict")
    const version = checkOfferVersion(offer.version, args.expectedVersion)
    if (!version.ok) return failAppRule(version.code, { current: offer.version }, "conflict")
    const draft = draftOf(args)
    const settings = args.providerSettings === undefined ? null : { providerSettings: storedSettingsOf(args.providerSettings) }
    await ctx.db.patch(offer._id, {
      ...storedFields(draft),
      durationMinutes: draft.durationMinutes ?? undefined,
      // Des réglages envoyés remplacent les précédents (tout vide les efface) ; absents, rien ne change.
      ...(settings ?? {}),
      version: version.value,
      updatedAt: Date.now(),
    })
    return { version: version.value }
  },
})

/**
 * Publier, mettre en pause, reprendre ou retirer une offre. L'état demandé
 * déjà courant ne change rien (double clic, second gestionnaire) ; sinon la
 * version lue est exigée et incrémentée. Retirée est terminale.
 */
export const setOfferStatus = networkMutation({
  args: { offerId: v.id("serviceOffers"), expectedVersion: v.number(), status: literals(SERVICE_OFFER_STATUS_TARGETS) },
  returns: v.object({ status: serviceOfferStatusValidator, version: v.number() }),
  handler: async (ctx, args) => {
    assertDiasporaNetwork(ctx.network)
    assertCapability(ctx, "publish")
    await enforceRateLimit(ctx, "diaspora.service.offer", ctx.person._id)
    const offer = await managedOffer(ctx, args.offerId)
    const next = transitionOffer(offer.status, args.status)
    if (!next.ok) return failAppRule(next.code, {}, "conflict")
    if (!next.value.changed) return { status: offer.status, version: offer.version }
    const version = checkOfferVersion(offer.version, args.expectedVersion)
    if (!version.ok) return failAppRule(version.code, { current: offer.version }, "conflict")
    await ctx.db.patch(offer._id, { status: next.value.status, version: version.value, updatedAt: Date.now() })
    return { status: next.value.status, version: version.value }
  },
})

export type ServiceOfferCardDto = OfferCard
export type ServiceOfferDetailDto = OfferDetail
