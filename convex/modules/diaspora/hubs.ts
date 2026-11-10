/**
 * Hubs pays (EXF-DG-15, EXF-DG-17, EXT-DG-02).
 *
 * Les compteurs sont MATÉRIALISÉS par un passage nocturne paginé (cron
 * quotidien) : une lecture ne compte jamais rien. Le passage compte d'abord les
 * membres listés de chaque pays, puis les pages ACTIVES et lisibles du réseau,
 * par pays et par nature (associations, entreprises — DG-007), chacune relue par
 * LA garde des pages, puis les évènements à venir ouverts au réseau de chaque
 * association (HB-02, `hubEvents.ts`) : un compte inexact n'est pas publié, et la
 * date de ce comptage dit à l'écran que le compteur est mesuré. Le nombre de membres d'un pays sous le seuil de publication
 * ne quitte pas le serveur (anti-réidentification) : la projection rend la
 * PRÉSENTATION du compteur (`presentHubCounters`), jamais le chiffre brut ; ce
 * seuil ne concerne que les membres. L'ouverture d'un pays se lit dans
 * `networks.openCountries` ; les pages elles-mêmes se lisent par `hubPages.ts`.
 */
import {
  countsAsHubMember,
  DEFAULT_DIRECTORY_VISIBILITY,
  DIASPORALE_NETWORK_SLUG,
  type HubCounters,
  isResidenceCountry,
  parseResidenceCountry,
  presentHubCounters,
} from "@diasporale/domain"
import { v } from "convex/values"

import { internal } from "../../_generated/api"
import type { Doc, Id } from "../../_generated/dataModel"
import { internalMutation, type MutationCtx, query, type QueryCtx } from "../../_generated/server"
import { notFound } from "../../lib/errors"
import { networkQuery } from "../../lib/functions"
import { readablePageOrNull } from "../pages/access"
import { assertDiasporaNetwork, consentInForce, effectiveStatusIn, isDiasporaNetwork, privacyOf } from "./facts"
import { countPageUpcomingEvents } from "./hubEvents"
import { countryHubDetailValidator, countryHubViewValidator } from "./validators"

/** Une page du passage nocturne : quelques lectures par membre, loin des limites d'une transaction. */
export const HUB_COUNTERS_PAGE_SIZE = 200

/** Pages par page du passage des évènements : chacune relit jusqu'à une cinquantaine d'évènements et leur état. */
export const HUB_EVENT_COUNTERS_PAGE_SIZE = 20

/** Borne des pays d'un réseau (ISO 3166-1 : 249 codes). */
const COUNTRIES_MAX = 250

const EMPTY_COUNTERS: HubCounters = { members: 0, associations: 0, companies: 0, upcomingEvents: 0 }

export async function hubRow(ctx: QueryCtx, networkId: Id<"networks">, country: string): Promise<Doc<"countryHubs"> | null> {
  return await ctx.db
    .query("countryHubs")
    .withIndex("by_network_and_country", (q) => q.eq("networkId", networkId).eq("country", country))
    .unique()
}

function hubView(network: Doc<"networks">, country: string, row: Doc<"countryHubs"> | null) {
  return {
    country,
    open: (network.openCountries ?? []).includes(country),
    counters: presentHubCounters(row ?? EMPTY_COUNTERS),
    countersComputedAt: row?.countersComputedAt ?? null,
  }
}

/**
 * Le hub d'un pays : son ouverture et ses compteurs matérialisés (rien n'est compté
 * ici), et la date du dernier comptage exact des évènements à venir — sans elle, le
 * compteur des évènements n'est pas mesuré.
 */
export const getCountryHub = networkQuery({
  args: { country: v.string() },
  returns: countryHubDetailValidator,
  handler: async (ctx, { country }) => {
    assertDiasporaNetwork(ctx.network)
    const parsed = parseResidenceCountry(country)
    if (!parsed.ok) return notFound()
    const row = await hubRow(ctx, ctx.networkId, parsed.value)
    return { ...hubView(ctx.network, parsed.value, row), upcomingEventsComputedAt: row?.upcomingEventsComputedAt ?? null }
  },
})

/**
 * @publicProjection La vitrine publique (page d'accueil, sans compte) annonce les
 * pays OUVERTS du réseau, dans l'ordre de la console, et la présentation de leurs
 * compteurs matérialisés — sous le seuil, aucun chiffre de membres. Aucun membre,
 * aucun contenu, aucun pays fermé ; un réseau non gouverné par la tranche rend une liste vide.
 */
export const listOpenCountries = query({
  args: { networkId: v.id("networks") },
  returns: v.array(countryHubViewValidator),
  handler: async (ctx, { networkId }) => {
    const network = await ctx.db.get(networkId)
    if (!isDiasporaNetwork(network)) return []
    const views = []
    for (const country of (network.openCountries ?? []).slice(0, COUNTRIES_MAX)) {
      if (!isResidenceCountry(country)) continue
      views.push(hubView(network, country, await hubRow(ctx, network._id, country)))
    }
    return views
  },
})

/** Une personne compte-t-elle parmi les membres du hub de son pays ? Accords relus au comptage. */
async function countsInHub(ctx: QueryCtx, network: Doc<"networks">, personId: Id<"persons">): Promise<boolean> {
  const { status } = await effectiveStatusIn(ctx, network, personId)
  if (status === null) return false
  return countsAsHubMember({
    status,
    directoryVisibility: (await privacyOf(ctx, network._id, personId))?.directoryVisibility ?? DEFAULT_DIRECTORY_VISIBILITY,
    directoryConsent: await consentInForce(ctx, network._id, personId, "directory"),
  })
}

/** Ce que le passage accumule, par pays (ISO alpha-2). */
type CountryTally = Record<string, number>

interface HubPassCounts {
  readonly members: CountryTally
  readonly associations: CountryTally
  readonly companies: CountryTally
  /** Évènements à venir ouverts au réseau, par pays (HB-02). */
  readonly upcomingEvents: CountryTally
  /** Pays dont une association dépasse la borne de relecture : leur compte d'évènements n'est pas exact. */
  readonly inexactEvents: ReadonlySet<string>
}

/** Une page de passage, jamais plus large que `HUB_COUNTERS_PAGE_SIZE`. */
function passPageSize(pageSize: number): number {
  return Math.min(Math.max(1, Math.trunc(pageSize)), HUB_COUNTERS_PAGE_SIZE)
}

/** Fin du passage : chaque hub connu, ouvert ou compté reçoit ses compteurs (zéro s'il n'a plus rien). */
async function writeHubCounters(ctx: MutationCtx, network: Doc<"networks">, counts: HubPassCounts, computedAt: number) {
  const existing = await ctx.db
    .query("countryHubs")
    .withIndex("by_network_and_country", (q) => q.eq("networkId", network._id))
    .take(COUNTRIES_MAX)
  const byCountry = new Map(existing.map((row) => [row.country, row]))
  const countries = new Set([
    ...byCountry.keys(),
    ...(network.openCountries ?? []),
    ...Object.keys(counts.members),
    ...Object.keys(counts.associations),
    ...Object.keys(counts.companies),
    ...Object.keys(counts.upcomingEvents),
  ])
  const now = Date.now()
  for (const country of countries) {
    if (!isResidenceCountry(country)) continue
    // HB-02 : les évènements à venir ouverts au réseau ; un compte inexact n'est ni écrit ni daté.
    const eventsExact = !counts.inexactEvents.has(country)
    const counters = {
      members: counts.members[country] ?? 0,
      associations: counts.associations[country] ?? 0,
      companies: counts.companies[country] ?? 0,
      upcomingEvents: eventsExact ? counts.upcomingEvents[country] ?? 0 : 0,
      countersComputedAt: computedAt,
      updatedAt: now,
    }
    const row = byCountry.get(country)
    // `undefined` retire la date d'un comptage antérieur : le compteur redevient « non mesuré ».
    if (row) await ctx.db.patch(row._id, { ...counters, upcomingEventsComputedAt: eventsExact ? computedAt : undefined })
    else await ctx.db.insert("countryHubs", { networkId: network._id, country, ...counters, ...(eventsExact ? { upcomingEventsComputedAt: computedAt } : {}) })
  }
}

/** Passage nocturne (cron quotidien) : lance le comptage paginé des membres listés de chaque pays. */
export const refreshHubCounters = internalMutation({
  args: { pageSize: v.optional(v.number()) },
  returns: v.null(),
  handler: async (ctx, { pageSize }): Promise<null> => {
    const network = await ctx.db
      .query("networks")
      .withIndex("by_slug", (q) => q.eq("slug", DIASPORALE_NETWORK_SLUG))
      .unique()
    if (!isDiasporaNetwork(network)) return null
    await ctx.scheduler.runAfter(0, internal.modules.diaspora.hubs.refreshHubCountersPage, {
      networkId: network._id,
      cursor: null,
      members: {},
      startedAt: Date.now(),
      pageSize: pageSize ?? HUB_COUNTERS_PAGE_SIZE,
    })
    return null
  },
})

/** Une page du passage : accumule les membres listés par pays, puis passe la main ou écrit les compteurs. */
export const refreshHubCountersPage = internalMutation({
  args: {
    networkId: v.id("networks"),
    cursor: v.union(v.string(), v.null()),
    members: v.record(v.string(), v.number()),
    startedAt: v.number(),
    pageSize: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const network = await ctx.db.get(args.networkId)
    if (!isDiasporaNetwork(network)) return null
    const page = await ctx.db
      .query("personFacets")
      .withIndex("by_network_and_person", (q) => q.eq("networkId", network._id))
      .paginate({ cursor: args.cursor, numItems: passPageSize(args.pageSize) })
    const members = { ...args.members }
    for (const facet of page.page) {
      const country = facet.values.countryOfResidence
      if (typeof country !== "string" || !isResidenceCountry(country)) continue
      if (await countsInHub(ctx, network, facet.personId)) members[country] = (members[country] ?? 0) + 1
    }
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.modules.diaspora.hubs.refreshHubCountersPage, { ...args, cursor: page.continueCursor, members })
      return null
    }
    // Les membres comptés, le passage continue par les pages du réseau (DG-007).
    await ctx.scheduler.runAfter(0, internal.modules.diaspora.hubs.refreshHubPageCountersPage, {
      networkId: network._id,
      cursor: null,
      members,
      associations: {},
      companies: {},
      startedAt: args.startedAt,
      pageSize: args.pageSize,
    })
    return null
  },
})

/**
 * Une page du passage sur les PAGES : les pages actives du réseau, par pays et
 * par nature (associations, entreprises), chacune relue par LA garde des pages
 * sans lecteur — une page retirée, ou retenue par la modération, ne compte pas.
 * Une page sans pays, d'une autre nature ou d'un pays hors diaspora n'entre dans
 * aucun hub. À la dernière page, le passage continue par les évènements.
 */
export const refreshHubPageCountersPage = internalMutation({
  args: {
    networkId: v.id("networks"),
    cursor: v.union(v.string(), v.null()),
    members: v.record(v.string(), v.number()),
    associations: v.record(v.string(), v.number()),
    companies: v.record(v.string(), v.number()),
    startedAt: v.number(),
    pageSize: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const network = await ctx.db.get(args.networkId)
    if (!isDiasporaNetwork(network)) return null
    const page = await ctx.db
      .query("pages")
      .withIndex("by_network_status_trustRank_createdAt", (q) => q.eq("networkId", network._id).eq("status", "active"))
      .paginate({ cursor: args.cursor, numItems: passPageSize(args.pageSize) })
    const associations = { ...args.associations }
    const companies = { ...args.companies }
    for (const row of page.page) {
      const tally = row.ownerKind === "association" ? associations : row.ownerKind === "company" ? companies : null
      const country = row.country
      if (tally === null || country === undefined || !isResidenceCountry(country)) continue
      if (!(await readablePageOrNull(ctx, network, row._id))) continue
      tally[country] = (tally[country] ?? 0) + 1
    }
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.modules.diaspora.hubs.refreshHubPageCountersPage, {
        ...args,
        cursor: page.continueCursor,
        associations,
        companies,
      })
      return null
    }
    // Les pages comptées, le passage continue par les évènements à venir des associations (HB-02).
    await ctx.scheduler.runAfter(0, internal.modules.diaspora.hubs.refreshHubEventCountersPage, {
      networkId: network._id,
      cursor: null,
      members: args.members,
      associations,
      companies,
      upcomingEvents: {},
      inexactEvents: [],
      startedAt: args.startedAt,
      pageSize: args.pageSize,
    })
    return null
  },
})

/**
 * Une page du passage sur les ÉVÈNEMENTS (HB-02) : pour chaque association active
 * et lisible du réseau (garde des pages, sans lecteur), ses évènements à venir
 * ouverts au réseau, programmés et publiés (`countPageUpcomingEvents`), comptés
 * dans le hub de son pays. Une page plus étroite que les autres : chacune relit
 * ses évènements et leur état. Une association qui dépasse la borne de relecture
 * rend le compte de son pays inexact : il n'est pas publié. À la dernière page,
 * les compteurs du passage sont écrits ensemble.
 */
export const refreshHubEventCountersPage = internalMutation({
  args: {
    networkId: v.id("networks"),
    cursor: v.union(v.string(), v.null()),
    members: v.record(v.string(), v.number()),
    associations: v.record(v.string(), v.number()),
    companies: v.record(v.string(), v.number()),
    upcomingEvents: v.record(v.string(), v.number()),
    inexactEvents: v.array(v.string()),
    startedAt: v.number(),
    pageSize: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const network = await ctx.db.get(args.networkId)
    if (!isDiasporaNetwork(network)) return null
    const page = await ctx.db
      .query("pages")
      .withIndex("by_network_status_trustRank_createdAt", (q) => q.eq("networkId", network._id).eq("status", "active"))
      .paginate({ cursor: args.cursor, numItems: Math.min(passPageSize(args.pageSize), HUB_EVENT_COUNTERS_PAGE_SIZE) })
    const upcomingEvents = { ...args.upcomingEvents }
    const inexact = new Set(args.inexactEvents)
    for (const row of page.page) {
      const country = row.country
      if (row.ownerKind !== "association" || country === undefined || !isResidenceCountry(country)) continue
      if (!(await readablePageOrNull(ctx, network, row._id))) continue
      const { count, exact } = await countPageUpcomingEvents(ctx, row, args.startedAt)
      upcomingEvents[country] = (upcomingEvents[country] ?? 0) + count
      if (!exact) inexact.add(country)
    }
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.modules.diaspora.hubs.refreshHubEventCountersPage, {
        ...args,
        cursor: page.continueCursor,
        upcomingEvents,
        inexactEvents: [...inexact],
      })
      return null
    }
    await writeHubCounters(ctx, network, { members: args.members, associations: args.associations, companies: args.companies, upcomingEvents, inexactEvents: inexact }, args.startedAt)
    return null
  },
})
