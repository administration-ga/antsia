/**
 * Les ÉVÈNEMENTS d'un hub pays (HB-02) : les prochains évènements OUVERTS AU
 * RÉSEAU des associations du pays, programmés et publiés par la modération.
 *
 * - `listCountryEvents` : une lecture BORNÉE et paginée. La même fenêtre de pages
 *   que `listCountryPages` (`HUB_PAGES_SCAN` pages actives du pays, par confiance
 *   puis récence) ; pour chaque association lisible, ses prochains évènements par
 *   l'index `by_network_page_startAt`, une fenêtre de plus que demandé ; fusion par
 *   date ; chaque évènement retenu repassé par LA garde des évènements de page
 *   (`pageEventAccess`, importée, jamais réécrite). Ne restent que les évènements
 *   d'audience `network`, programmés et PUBLIÉS : un évènement retenu par la
 *   modération n'y paraît pas, même pour l'équipe de sa page. Une fenêtre de pages
 *   incomplète le dit (`partial`) ; la lecture indexée par pays et par date viendra
 *   du moteur (EV-05, PG-10) et remplacera celle-ci.
 * - `countPageUpcomingEvents` : le compte d'une page pour le passage nocturne
 *   (`hubs.ts`), SANS lecteur, aux mêmes conditions ; au-delà de la borne par page,
 *   le compte n'est pas exact et le dit — il n'est alors pas publié.
 *
 * Rien n'est compté à la lecture ; aucun inscrit, aucune capacité, aucun état du
 * lecteur ne sort d'ici : la fiche de l'évènement les dit, sous sa propre garde.
 */
import { parseResidenceCountry } from "@diasporale/domain"
import { type Infer, v } from "convex/values"

import type { Doc } from "../../_generated/dataModel"
import type { QueryCtx } from "../../_generated/server"
import { fail, notFound } from "../../lib/errors"
import { networkQuery } from "../../lib/functions"
import { pageEventAccess } from "../events/pageEventAccess"
import { isFederatedPage } from "../federation/mirrorAccess"
import { contentState } from "../moderation/policy"
import { readablePageOrNull } from "../pages/access"
import { assertDiasporaNetwork } from "./facts"
import { HUB_PAGES_SCAN } from "./hubPages"
import { hubEventsPageValidator } from "./validators"

/** Évènements par fenêtre du hub, par défaut. */
export const HUB_EVENTS_PAGE_SIZE = 10

/** Plafond d'une fenêtre, quoi que demande l'écran. */
export const HUB_EVENTS_PAGE_MAX = 20

/** Évènements repassés par la garde, au plus, par lecture : la fenêtre suivante reprend après le dernier examiné. */
export const HUB_EVENTS_EXAMINED_MAX = 60

/** Évènements à venir relus par page au passage nocturne ; au-delà, le compte du pays n'est pas exact. */
export const HUB_EVENTS_COUNT_PER_PAGE = 50

type HubEvent = Infer<typeof hubEventsPageValidator>["items"][number]
type ReadCtx = Pick<QueryCtx, "db">

/**
 * La position d'un évènement dans l'ordre de l'index : son début, puis sa
 * création (le départage implicite de tout index Convex), puis son identifiant.
 */
interface EventKey {
  readonly startAt: number
  readonly createdAt: number
  readonly id: string
}

function keyOf(event: Doc<"events">): EventKey {
  return { startAt: event.startAt, createdAt: event._creationTime, id: event._id }
}

function compareKeys(a: EventKey, b: EventKey): number {
  if (a.startAt !== b.startAt) return a.startAt < b.startAt ? -1 : 1
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1
  return a.id === b.id ? 0 : a.id < b.id ? -1 : 1
}

const CURSOR_TAG = "hub-events"
const CURSOR_VERSION = 1
/** Création fictive d'un curseur qui saute tout un instant (aucune création réelle ne l'atteint). */
const SKIP_INSTANT = Number.MAX_VALUE

/** Le curseur reste attaché à son pays et à son instant de référence : il ne se réinterprète jamais ailleurs. */
function encodeCursor(country: string, anchor: number, key: EventKey): string {
  return JSON.stringify([CURSOR_TAG, CURSOR_VERSION, country, anchor, key.startAt, key.createdAt, key.id])
}

function decodeCursor(raw: string, country: string, anchor: number): EventKey {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return fail("invalidArgument")
  }
  if (!Array.isArray(parsed) || parsed.length !== 7) return fail("invalidArgument")
  const [tag, version, cursorCountry, cursorAnchor, startAt, createdAt, id] = parsed as readonly unknown[]
  if (tag !== CURSOR_TAG || version !== CURSOR_VERSION || cursorCountry !== country || cursorAnchor !== anchor) return fail("invalidArgument")
  if (typeof startAt !== "number" || !Number.isFinite(startAt) || typeof createdAt !== "number" || !Number.isFinite(createdAt) || typeof id !== "string") {
    return fail("invalidArgument")
  }
  return { startAt, createdAt, id }
}

function pageSizeOf(requested: number | undefined): number {
  if (requested === undefined || !Number.isFinite(requested)) return HUB_EVENTS_PAGE_SIZE
  return Math.min(Math.max(Math.trunc(requested), 1), HUB_EVENTS_PAGE_MAX)
}

/**
 * Ce que le hub peut montrer d'un évènement, avant toute garde : un évènement de
 * PAGE (aucun organisateur personnel), programmé, jamais annulé, ouvert au réseau.
 * Une audience absente vaut « réservé aux adhérents » (règle du moteur).
 */
export function isHubEventCandidate(event: Doc<"events">): boolean {
  return (
    event.organizerPageId !== undefined &&
    event.organizerPersonId === undefined &&
    event.status === "scheduled" &&
    event.cancelledAt === undefined &&
    event.pageAudience === "network"
  )
}

/** La carte d'un évènement du hub : allowlistée, l'organisateur lu sur la page que la garde a rendue. */
function hubEventOf(event: Doc<"events">, page: Doc<"pages">): HubEvent {
  return {
    eventId: event._id,
    pageId: page._id,
    title: event.title,
    location: event.location ?? "",
    startAt: event.startAt,
    endAt: event.endAt,
    timeZone: event.timeZone,
    organizer: { name: page.name, handle: page.handle },
  }
}

/**
 * Les prochains évènements publics des associations d'un pays, à partir de
 * l'instant `anchor` fixé par l'écran (le curseur lui reste attaché). Un pays
 * inconnu (ou le Gabon) reçoit le refus indistinct, comme le hub ; un curseur
 * d'un autre pays, d'un autre instant ou mal formé est refusé.
 *
 * Pagination par clé sur une fusion : chaque page relit au plus `numItems + 1`
 * évènements après le curseur. Une page qui en rend autant a peut-être une suite :
 * la dernière clé lue fixe alors une BORNE, et seuls les évènements jusqu'à elle
 * se montrent dans cette fenêtre — l'ordre par date reste exact d'une fenêtre à
 * l'autre, sans doublon ni trou. Une fenêtre peut être vide et annoncer sa suite.
 */
export const listCountryEvents = networkQuery({
  args: {
    country: v.string(),
    anchor: v.number(),
    cursor: v.union(v.string(), v.null()),
    numItems: v.optional(v.number()),
  },
  returns: hubEventsPageValidator,
  handler: async (ctx, args) => {
    assertDiasporaNetwork(ctx.network)
    const parsed = parseResidenceCountry(args.country)
    if (!parsed.ok) return notFound()
    const country = parsed.value
    if (!Number.isFinite(args.anchor)) return fail("invalidArgument")
    const anchor = args.anchor
    const numItems = pageSizeOf(args.numItems)
    const after = args.cursor === null ? null : decodeCursor(args.cursor, country, anchor)
    const reader = ctx.person._id

    // La même fenêtre que les pages du hub : les pages actives du pays, bornées.
    const window = await ctx.db
      .query("pages")
      .withIndex("by_network_status_country_trustRank_createdAt", (q) =>
        q.eq("networkId", ctx.networkId).eq("status", "active").eq("country", country),
      )
      .order("desc")
      .take(HUB_PAGES_SCAN + 1)
    const partial = window.length > HUB_PAGES_SCAN

    const perPage = numItems + 1
    const from = after === null ? anchor : Math.max(anchor, after.startAt)
    // Un curseur de saut (voir la fin) reprend STRICTEMENT après son instant.
    const skipInstant = after !== null && after.createdAt === SKIP_INSTANT
    const candidates: Doc<"events">[] = []
    // Tout évènement dont la clé ne dépasse pas cette borne a été lu, sur chaque page.
    let bound: EventKey | null = null
    for (const row of window.slice(0, HUB_PAGES_SCAN)) {
      if (row.ownerKind !== "association") continue
      // LA garde des pages, relue pour CE lecteur, avant de lire ses évènements.
      if (!(await readablePageOrNull(ctx, ctx.network, row._id, reader))) continue
      const rows = await ctx.db
        .query("events")
        .withIndex("by_network_page_startAt", (q) => {
          const base = q.eq("networkId", ctx.networkId).eq("organizerPageId", row._id)
          return skipInstant ? base.gt("startAt", from) : base.gte("startAt", from)
        })
        .take(perPage)
      const last = rows[rows.length - 1]
      if (rows.length === perPage && last !== undefined) {
        const key = keyOf(last)
        if (bound === null || compareKeys(key, bound) < 0) bound = key
      }
      for (const event of rows) {
        if (after !== null && compareKeys(keyOf(event), after) <= 0) continue
        if (isHubEventCandidate(event)) candidates.push(event)
      }
    }
    candidates.sort((a, b) => compareKeys(keyOf(a), keyOf(b)))

    const items: HubEvent[] = []
    let lastExamined: EventKey | null = null
    let stoppedEarly = false
    let examined = 0
    for (const event of candidates) {
      const key = keyOf(event)
      if (bound !== null && compareKeys(key, bound) > 0) break
      if (items.length >= numItems || examined >= HUB_EVENTS_EXAMINED_MAX) {
        stoppedEarly = true
        break
      }
      examined += 1
      lastExamined = key
      // LA garde des évènements de page : page native lisible, audience, modération, signalement du lecteur.
      const access = await pageEventAccess(ctx, event, reader)
      if (access === null || access.moderation !== "published") continue
      items.push(hubEventOf(event, access.page))
    }

    if (stoppedEarly && lastExamined !== null) {
      return { country, items, continueCursor: encodeCursor(country, anchor, lastExamined), isDone: false, partial }
    }
    if (bound === null) return { country, items, continueCursor: null, isDone: true, partial }
    // Tout ce qui précède la borne est examiné : la suite reprend après elle. Si une page
    // ne progresse plus (plus de `numItems` évènements au même instant), la suite saute cet instant.
    const next = after !== null && compareKeys(bound, after) <= 0 ? { startAt: after.startAt, createdAt: SKIP_INSTANT, id: "" } : bound
    return { country, items, continueCursor: encodeCursor(country, anchor, next), isDone: false, partial }
  },
})

export interface PageEventCount {
  readonly count: number
  /** `false` : la page a plus de `HUB_EVENTS_COUNT_PER_PAGE` évènements à venir, le compte n'est qu'une borne. */
  readonly exact: boolean
}

/**
 * Les évènements à venir qu'un hub montrerait d'une page, comptés SANS lecteur
 * (passage nocturne) : page d'association native (jamais un reflet), évènement de
 * page programmé, ouvert au réseau, publié par la modération pour CE réseau et
 * CETTE page. La page elle-même a déjà passé la garde des pages, sans lecteur.
 */
export async function countPageUpcomingEvents(ctx: ReadCtx, page: Doc<"pages">, from: number): Promise<PageEventCount> {
  if (page.ownerKind !== "association" || (await isFederatedPage(ctx, page._id))) return { count: 0, exact: true }
  const rows = await ctx.db
    .query("events")
    .withIndex("by_network_page_startAt", (q) => q.eq("networkId", page.networkId).eq("organizerPageId", page._id).gte("startAt", from))
    .take(HUB_EVENTS_COUNT_PER_PAGE + 1)
  let count = 0
  for (const event of rows.slice(0, HUB_EVENTS_COUNT_PER_PAGE)) {
    if (!isHubEventCandidate(event)) continue
    const state = await contentState(ctx, "event", event._id)
    // L'absence d'état n'est pas un accord ; un état d'un autre réseau ou d'une autre page non plus.
    if (state?.status !== "published" || state.networkId !== event.networkId) continue
    if (state.ownerPageId !== undefined && state.ownerPageId !== page._id) continue
    count += 1
  }
  return { count, exact: rows.length <= HUB_EVENTS_COUNT_PER_PAGE }
}
