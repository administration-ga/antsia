/**
 * Kit d'arrivée DIASPORALE (DG-024 b, plan global §4 G8 point 3) — tranche `diaspora`,
 * écrite par la session DIASPORALE (chantier « kit d'arrivée »).
 *
 * Des ressources pratiques DATÉES par pays et par ville (démarches, logement, santé…),
 * chacune avec sa source citée (adresse https sans identifiant de suivi) et sa date de
 * dernière vérification. Une ressource est PERSONNELLE (son auteur la gère) ou portée
 * par une PAGE (ses signataires vivants la gèrent, relus à chaque acte).
 *
 * Cycle (règles pures de `@diasporale/domain`) : brouillon → soumise → publiée → à
 * revoir → archivée. Une version n'entre dans le kit public qu'après la relecture d'une
 * personne DIFFÉRENTE de celles qui l'ont écrite et de l'équipe de la page qui la
 * porte : un membre vérifié, ou le signataire vivant d'une page. Toute nouvelle version
 * repasse par la relecture. « À revoir » : marquée par une relecture, ou calculé à la
 * lecture (vérification de plus de douze mois, signalements « périmée » au seuil).
 *
 * Gardes, dans cet ordre, pour chaque écriture : adhésion au réseau (constructeur) →
 * éligibilité (capacité `publish`) → débit (`diaspora.kit.write` ou `diaspora.kit.review`)
 * → droit sur la ressource (refus indistinct si elle ne se lit pas) → règles du domaine.
 *
 * Projections allowlistées : la ressource, son porteur (nom PUBLIÉ de la personne, ou
 * CARTE de la page au badge calculé) et son relecteur (nom publié) ; aucune coordonnée.
 * Seule une page au badge « Officiel » calculé fait dire à une ressource qu'elle est
 * officielle (`official`). Aucune écriture dans `notifications`.
 *
 * Confiance (G9) : une ressource (`diasporaKitResource`, à son auteur, ou contenu de
 * la page qui la porte) est une surface de modération du moteur, en plus de la
 * relecture propre au kit. Chaque version écrite passe par `moderateDiasporaWrite`
 * (publiée dès l'écriture sauf politique explicite du réseau) ; le kit public, la
 * fiche, la file de relecture et le signalement « périmée » ne servent que ce que
 * la modération sert (`isServedTo`). Qui gère la ressource en garde la vue, et y lit
 * son état de modération (`moderation` : publiée, en relecture préalable ou retirée —
 * distinct du cycle du kit), dans la fiche et « Mes propositions » seulement ; tout
 * autre lecteur lit `null`. Une ressource retirée ne se modifie ni ne se soumet plus,
 * elle s'archive encore.
 */
import {
  ARRIVAL_KIT_PAGE_SIZE,
  ARRIVAL_KIT_REASON_MAX_LENGTH,
  ARRIVAL_KIT_REASON_MIN_LENGTH,
  ARRIVAL_KIT_RESOURCES_PER_PROPOSER_MAX,
  ARRIVAL_KIT_REVIEW_CAUSES,
  ARRIVAL_KIT_REVIEW_DECISIONS,
  arrivalKitReviewCause,
  arrivalKitReviewDueAt,
  arrivalKitSearchText,
  checkArrivalKitFlag,
  checkArrivalKitReviewer,
  checkArrivalKitVersion,
  effectiveArrivalKitStatus,
  hasCapability,
  isArrivalKitCarrierKind,
  isArrivalKitIndependent,
  isArrivalKitListed,
  isArrivalKitQuotaReached,
  isArrivalKitReviewer,
  matchesArrivalKitListing,
  parseArrivalKitCountry,
  parseArrivalKitListing,
  parseArrivalKitQuery,
  parseArrivalKitReason,
  parseArrivalKitResource,
  transitionArrivalKit,
  type ArrivalKitGesture,
  type ArrivalKitListing,
  type ArrivalKitRefusal,
  type ArrivalKitResourceDraft,
  type ArrivalKitResourceInput,
  type ArrivalKitReviewerFacts,
  type ArrivalKitStatus,
  type MemberCapability,
} from "@diasporale/domain"
import { type PaginationOptions, paginationOptsValidator, paginationResultValidator, type PaginationResult } from "convex/server"
import { type Infer, v } from "convex/values"

import type { Doc, Id } from "../../_generated/dataModel"
import type { QueryCtx } from "../../_generated/server"
import { effectiveMembershipStatus, isActiveMember } from "../../lib/access"
import { fail, failAppRule, notFound } from "../../lib/errors"
import { networkMutation, networkQuery } from "../../lib/functions"
import { enforceRateLimit } from "../../lib/rateLimit"
import { literals } from "../../lib/validators"
import { liveSignatoryRole, pageCardOf, readablePageOrNull } from "../pages/access"
import { type PageCard, pageCardValidator } from "../pages/validators"
import { miniProfileCache } from "../people/miniProfile"
import { arrivalKitCategoryValidator, arrivalKitStatusValidator } from "./arrivalKitTables"
import { noticeKitResourceReviewed } from "./communityNotifications"
import { assertDiasporaNetwork } from "./facts"
import {
  type ContentOwner,
  isRemovedByModeration,
  isServedTo,
  managedModerationState,
  managedModerationStateValidator,
  moderateDiasporaWrite,
} from "./moderationContent"

/** Octets lus au plus par page de lecture : une ressource pèse quelques kilo-octets. */
const PAGE_BYTES = 1024 * 1024
/** Lignes de signataire relues au plus pour une personne (relecture, pages porteuses). */
const SIGNATORY_SCAN_MAX = 20
/** Les états d'une ressource qui comptent dans le plafond de la personne qui propose. */
const LIVE_STATUSES = ["draft", "submitted", "published", "needs_review"] as const satisfies readonly ArrivalKitStatus[]

// ═══════════════════════════════════════════════════════════════
// Projections
// ═══════════════════════════════════════════════════════════════

/** Une personne citée (auteur, relecteur) : son profil PUBLIÉ ; `null` partout = nom neutre. */
const personLabelValidator = v.object({
  displayName: v.union(v.string(), v.null()),
  handle: v.union(v.string(), v.null()),
})

/** Qui porte la ressource : une personne (son nom publié) ou une page (sa carte, badge calculé). */
const carrierValidator = v.union(
  v.object({ kind: v.literal("person"), person: personLabelValidator }),
  v.object({ kind: v.literal("page"), page: pageCardValidator }),
)

/** La carte d'une ressource dans le kit, la file de relecture ou « Mes propositions ». */
const resourceCardValidator = v.object({
  resourceId: v.id("kitResources"),
  /** La version lue de la ligne : tout geste la cite. */
  version: v.number(),
  /** La version du contenu : un signalement la cite. */
  revision: v.number(),
  title: v.string(),
  summary: v.string(),
  category: arrivalKitCategoryValidator,
  country: v.string(),
  city: v.union(v.string(), v.null()),
  /** L'état EFFECTIF (ancienneté et signalements compris). */
  status: arrivalKitStatusValidator,
  /** Pourquoi « à revoir » (`null` sinon) : la règle se montre, elle ne trie pas en silence. */
  reviewCause: v.union(literals(ARRIVAL_KIT_REVIEW_CAUSES), v.null()),
  lastVerifiedAt: v.number(),
  /** À partir de quand la vérification ne vaut plus (douze mois). */
  reviewDueAt: v.number(),
  revisedAt: v.number(),
  reviewedAt: v.union(v.number(), v.null()),
  carrier: carrierValidator,
  /** Vrai SEULEMENT si la page qui porte la ressource a le badge « Officiel » calculé. */
  official: v.boolean(),
})

/** Ce que l'appelant peut faire de la ressource, jugé ici (l'écran ne fait que le dire). */
const viewerValidator = v.object({
  canManage: v.boolean(),
  canReview: v.boolean(),
  canFlag: v.boolean(),
  hasFlagged: v.boolean(),
})

/** La fiche d'une ressource : sa carte, son contenu, sa source, ses dates et son relecteur. */
const resourceDetailValidator = v.object({
  ...resourceCardValidator.fields,
  body: v.string(),
  sourceName: v.string(),
  sourceUrl: v.string(),
  createdAt: v.number(),
  submittedAt: v.union(v.number(), v.null()),
  /** Qui a relu et publié la version courante (publiée ou à revoir seulement). */
  reviewer: v.union(personLabelValidator, v.null()),
  /** Le motif d'un renvoi ou d'une mise « à revoir » : pour qui gère ou relit seulement. */
  statusReason: v.union(v.string(), v.null()),
  /** Signalements sur la version courante : pour qui gère ou relit seulement. */
  outdatedFlags: v.union(v.number(), v.null()),
  /** L'état de modération du moteur (G9), distinct du cycle du kit : pour qui GÈRE seulement (un relecteur lit `null`). */
  moderation: v.union(managedModerationStateValidator, v.null()),
  viewer: viewerValidator,
})

const queueItemValidator = v.object({ ...resourceCardValidator.fields, submittedAt: v.number() })

const ownItemValidator = v.object({
  ...resourceCardValidator.fields,
  statusReason: v.union(v.string(), v.null()),
  outdatedFlags: v.union(v.number(), v.null()),
  /** L'état de modération du moteur (G9) : si je gère la ressource seulement. */
  moderation: v.union(managedModerationStateValidator, v.null()),
})

/** Ce que la personne peut faire dans le kit, et les pages au nom desquelles elle peut proposer. */
const kitStandingValidator = v.object({
  canPropose: v.boolean(),
  canReview: v.boolean(),
  carrierPages: v.array(pageCardValidator),
})

type PersonLabel = Infer<typeof personLabelValidator>
type Carrier = Infer<typeof carrierValidator>
type ResourceCard = Infer<typeof resourceCardValidator>
type ResourceDetail = Infer<typeof resourceDetailValidator>
type QueueItem = Infer<typeof queueItemValidator>
type OwnItem = Infer<typeof ownItemValidator>
type KitStanding = Infer<typeof kitStandingValidator>

type NetworkCtx = QueryCtx & {
  network: Doc<"networks">
  networkId: Id<"networks">
  person: Doc<"persons">
  membership: Doc<"networkMemberships">
}
type ResourceRow = Doc<"kitResources">
type ReadCtx = Pick<QueryCtx, "db">

const NEUTRAL_PERSON: PersonLabel = { displayName: null, handle: null }

/** Le texte relu par la modération (G9) : ce que la version montre ; jamais gardé. */
function resourceText(draft: { readonly title: string; readonly summary: string; readonly body: string }): string {
  return `${draft.title}\n${draft.summary}\n${draft.body}`
}

/** Le propriétaire de l'état de modération : la page qui porte la ressource, sinon son auteur. */
function resourceOwner(row: { readonly pageId?: Id<"pages"> }, authorPersonId: Id<"persons">): ContentOwner {
  return row.pageId !== undefined ? { pageId: row.pageId } : { personId: authorPersonId }
}

/**
 * G9 — porte commune du signalement : une ressource du kit PUBLIC (publiée ou à
 * revoir) dont le porteur se lit d'ici (page lisible du réseau, ou auteur encore
 * membre actif — la règle de `labelsFor`), servie par la modération. N'importe
 * jamais `moderation/targets` (pas de cycle).
 */
export async function readableKitResourceOrNull(
  ctx: ReadCtx,
  network: Doc<"networks">,
  readerPersonId: Id<"persons">,
  resourceId: Id<"kitResources">,
): Promise<ResourceRow | null> {
  const row = await ctx.db.get(resourceId)
  if (!row || row.networkId !== network._id || !isArrivalKitListed(row.status)) return null
  if (row.pageId !== undefined) {
    const page = await readablePageOrNull(ctx, network, row.pageId, readerPersonId)
    if (!page || page.networkId !== network._id) return null
  } else if (!(await isActiveMember(ctx, network._id, row.authorPersonId ?? row.proposedByPersonId))) {
    return null
  }
  return (await isServedTo(ctx, "diasporaKitResource", row._id, readerPersonId)) ? row : null
}

// ═══════════════════════════════════════════════════════════════
// Refus et gardes
// ═══════════════════════════════════════════════════════════════

/** L'état a changé entre la lecture et le geste. */
const CONFLICT_REFUSALS: ReadonlySet<ArrivalKitRefusal> = new Set([
  "arrival_kit_version_conflict",
  "arrival_kit_transition_invalid",
  "arrival_kit_archived",
  "arrival_kit_already_flagged",
  "arrival_kit_resource_limit_reached",
])
/** La demande est bien formée, la règle du kit la refuse à cette personne. */
const POLICY_REFUSALS: ReadonlySet<ArrivalKitRefusal> = new Set([
  "arrival_kit_reviewer_not_eligible",
  "arrival_kit_review_own_resource",
  "arrival_kit_not_flaggable",
  "arrival_kit_flag_own_resource",
  "arrival_kit_page_kind_not_allowed",
])

/** Un refus du kit : son code fermé, et la nature du refus selon le code (saisie sinon). */
function refuseKit(code: ArrivalKitRefusal, params: Record<string, number> = {}): never {
  return failAppRule(code, params, CONFLICT_REFUSALS.has(code) ? "conflict" : POLICY_REFUSALS.has(code) ? "policyRefused" : "invalidArgument")
}

/** Éligibilité : la capacité du STATUT courant (expiration d'une sanction comprise), règle du domaine. */
function assertCapability(ctx: { membership: Doc<"networkMemberships"> }, capability: MemberCapability): void {
  const status = effectiveMembershipStatus(ctx.membership)
  if (status === null || !hasCapability(status, capability)) fail("statusInsufficient")
}

/** Une page de lecture bornée : jamais plus que le plafond, jamais plus d'octets que la borne. */
function bounded(options: PaginationOptions): PaginationOptions {
  const requested = Number.isFinite(options.numItems) ? Math.trunc(options.numItems) : ARRIVAL_KIT_PAGE_SIZE
  return {
    ...options,
    numItems: Math.min(Math.max(requested, 1), ARRIVAL_KIT_PAGE_SIZE),
    maximumBytesRead: Math.min(options.maximumBytesRead ?? PAGE_BYTES, PAGE_BYTES),
  }
}

/** Les pages ACTIVES du réseau dont l'appelant est signataire vivant (lecture bornée). */
async function livePagesOf(ctx: NetworkCtx): Promise<Doc<"pages">[]> {
  const rows = await ctx.db
    .query("pageSignatories")
    .withIndex("by_network_person", (q) => q.eq("networkId", ctx.networkId).eq("personId", ctx.person._id))
    .take(SIGNATORY_SCAN_MAX)
  const pages: Doc<"pages">[] = []
  for (const row of rows) {
    if (row.acceptedAt === undefined) continue
    const page = await ctx.db.get(row.pageId)
    if (page !== null && page.networkId === ctx.networkId && (await liveSignatoryRole(ctx, page, ctx.person._id)) !== null) pages.push(page)
  }
  return pages
}

/** Les faits de relecture de l'appelant : son statut effectif, et s'il signe pour une page vivante. */
async function reviewerFacts(ctx: NetworkCtx): Promise<ArrivalKitReviewerFacts> {
  const status = effectiveMembershipStatus(ctx.membership) ?? "partie"
  // Un membre vérifié relit sans autre lecture ; sans droit de publier, une page n'y change rien.
  if (status === "verifiee" || !hasCapability(status, "publish")) return { status, livePageSignatory: false }
  return { status, livePageSignatory: (await livePagesOf(ctx)).length > 0 }
}

/** Celles et ceux qui ont écrit la ressource : jamais ses relecteurs ni ses signalants. */
function writersOf(row: ResourceRow): Id<"persons">[] {
  return row.authorPersonId === undefined
    ? [row.proposedByPersonId, row.revisedByPersonId]
    : [row.authorPersonId, row.proposedByPersonId, row.revisedByPersonId]
}

/** Qui GÈRE la ressource : son auteur (personnelle), ou un signataire VIVANT de la page qui la porte. */
async function managesResource(ctx: NetworkCtx, row: ResourceRow): Promise<boolean> {
  if (row.pageId === undefined) return row.authorPersonId === ctx.person._id
  const page = await ctx.db.get(row.pageId)
  return page !== null && page.networkId === ctx.networkId && (await liveSignatoryRole(ctx, page, ctx.person._id)) !== null
}

/** L'appelant est-il étranger à la ressource (ni écrite par lui, ni portée par une page qu'il signe) ? */
function independentOf(ctx: NetworkCtx, row: ResourceRow, manages: boolean): boolean {
  return isArrivalKitIndependent({ actorId: ctx.person._id, writerIds: writersOf(row), onCarrierTeam: row.pageId !== undefined && manages })
}

/**
 * Les noms et cartes d'une lecture, MÉMORISÉS : une personne citée n'est nommée que
 * si elle est encore membre active du réseau (sinon le nom neutre) ; une page ne
 * porte une ressource que si elle se lit d'ici — retirée, la ressource n'est servie
 * par personne (jamais rabattue sur l'identité de son signataire).
 */
function labelsFor(ctx: NetworkCtx) {
  const profileOf = miniProfileCache(ctx)
  const members = new Map<string, boolean>()
  const pages = new Map<string, PageCard | null>()

  const isMember = async (personId: Id<"persons">): Promise<boolean> => {
    const hit = members.get(personId)
    if (hit !== undefined) return hit
    const member = await isActiveMember(ctx, ctx.networkId, personId)
    members.set(personId, member)
    return member
  }

  const person = async (personId: Id<"persons">): Promise<PersonLabel> => {
    if (!(await isMember(personId))) return NEUTRAL_PERSON
    const profile = await profileOf(personId)
    return { displayName: profile.displayName, handle: profile.handle }
  }

  const page = async (pageId: Id<"pages">): Promise<PageCard | null> => {
    const hit = pages.get(pageId)
    if (hit !== undefined) return hit
    const readable = await readablePageOrNull(ctx, ctx.network, pageId, ctx.person._id)
    const card = readable !== null && readable.networkId === ctx.networkId ? await pageCardOf(ctx, readable) : null
    pages.set(pageId, card)
    return card
  }

  /** Qui porte la ressource, ou `null` si elle ne se lit plus d'ici (page retirée, auteur parti du réseau). */
  const carrier = async (row: ResourceRow): Promise<Carrier | null> => {
    if (row.pageId !== undefined) {
      const card = await page(row.pageId)
      return card === null ? null : { kind: "page", page: card }
    }
    const authorId = row.authorPersonId ?? row.proposedByPersonId
    if (!(await isMember(authorId))) return null
    return { kind: "person", person: await person(authorId) }
  }

  return { person, carrier }
}

type Labels = ReturnType<typeof labelsFor>

interface Access {
  readonly row: ResourceRow
  readonly carrier: Carrier
  readonly manages: boolean
  readonly reviewer: ArrivalKitReviewerFacts
  readonly independent: boolean
}

/**
 * La ressource telle que l'appelant a le droit de la VOIR, ou `null` (refus
 * indistinct : inconnue, d'un autre réseau, porteur illisible, brouillon d'autrui) :
 * publiée ou à revoir, elle se lit par tout lecteur ; sinon par qui la gère, ou —
 * soumise — par une personne habilitée à la relire et étrangère à elle.
 */
async function accessOf(ctx: NetworkCtx, row: ResourceRow | null, labels: Labels): Promise<Access | null> {
  if (row === null || row.networkId !== ctx.networkId) return null
  const carrier = await labels.carrier(row)
  if (carrier === null) return null
  const manages = await managesResource(ctx, row)
  const reviewer = await reviewerFacts(ctx)
  const independent = independentOf(ctx, row, manages)
  const visible = isArrivalKitListed(row.status) || manages || (row.status === "submitted" && isArrivalKitReviewer(reviewer) && independent)
  return visible ? { row, carrier, manages, reviewer, independent } : null
}

function toCard(row: ResourceRow, carrier: Carrier, now: number): ResourceCard {
  const standing = { status: row.status, lastVerifiedAt: row.lastVerifiedAt, outdatedFlags: row.outdatedFlags }
  return {
    resourceId: row._id,
    version: row.version,
    revision: row.revision,
    title: row.title,
    summary: row.summary,
    category: row.category,
    country: row.country,
    city: row.city ?? null,
    status: effectiveArrivalKitStatus(standing, now),
    reviewCause: arrivalKitReviewCause(standing, now),
    lastVerifiedAt: row.lastVerifiedAt,
    reviewDueAt: arrivalKitReviewDueAt(row.lastVerifiedAt),
    revisedAt: row.revisedAt,
    reviewedAt: row.reviewedAt ?? null,
    carrier,
    official: carrier.kind === "page" && carrier.page.badge === "official",
  }
}

/** Le signalement de l'appelant sur la version COURANTE, s'il existe (un au plus). */
async function flagOf(ctx: NetworkCtx, row: ResourceRow): Promise<Doc<"kitOutdatedFlags"> | null> {
  return await ctx.db
    .query("kitOutdatedFlags")
    .withIndex("by_resource_and_revision_and_person", (q) => q.eq("resourceId", row._id).eq("revision", row.revision).eq("personId", ctx.person._id))
    .unique()
}

// ═══════════════════════════════════════════════════════════════
// Lire le kit
// ═══════════════════════════════════════════════════════════════

/**
 * La requête du kit public : la recherche plein texte (ET-04, mots repliés du titre
 * et du résumé) dès deux caractères, par pertinence ; sinon l'index le plus étroit de
 * la lecture — tout le pays, une ville (ou les seules ressources nationales, clé vide),
 * avec ou sans rubrique —, les plus récemment vérifiées d'abord. Toujours bornée au
 * réseau ET au kit public ; la zone d'une recherche se rejuge ligne à ligne.
 */
function listingQuery(ctx: Pick<QueryCtx, "db">, networkId: Id<"networks">, listing: ArrivalKitListing, query: string | null) {
  const { country, zone, category } = listing
  const resources = ctx.db.query("kitResources")
  if (query !== null) {
    return resources.withSearchIndex("search_by_text", (q) => {
      const base = q.search("searchText", query).eq("networkId", networkId).eq("listed", true).eq("country", country)
      return category === null ? base : base.eq("category", category)
    })
  }
  if (zone.kind === "country") {
    if (category === null) {
      return resources
        .withIndex("by_network_listed_country", (q) => q.eq("networkId", networkId).eq("listed", true).eq("country", country))
        .order("desc")
    }
    return resources
      .withIndex("by_network_listed_country_category", (q) => q.eq("networkId", networkId).eq("listed", true).eq("country", country).eq("category", category))
      .order("desc")
  }
  const cityKey = zone.kind === "city" ? zone.cityKey : ""
  if (category === null) {
    return resources
      .withIndex("by_network_listed_city", (q) => q.eq("networkId", networkId).eq("listed", true).eq("country", country).eq("cityKey", cityKey))
      .order("desc")
  }
  return resources
    .withIndex("by_network_listed_city_category", (q) => q.eq("networkId", networkId).eq("listed", true).eq("country", country).eq("cityKey", cityKey).eq("category", category))
    .order("desc")
}

/**
 * Le kit public d'un pays : tout le pays, une ville saisie (sans GPS) ou les seules
 * ressources nationales, par rubrique. Publiées et « à revoir » (avec leur cause),
 * paginées et bornées ; une page filtrée peut être courte tout en annonçant sa suite.
 */
export const listResources = networkQuery({
  args: {
    country: v.string(),
    city: v.optional(v.string()),
    nationalOnly: v.optional(v.boolean()),
    category: v.optional(v.string()),
    /** ET-04 — des mots cherchés dans le titre et le résumé ; aucune recherche n'est gardée. */
    query: v.optional(v.string()),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(resourceCardValidator),
  handler: async (ctx, args): Promise<PaginationResult<ResourceCard>> => {
    assertDiasporaNetwork(ctx.network)
    assertCapability(ctx, "read_network")
    const parsed = parseArrivalKitListing({ country: args.country, city: args.city, nationalOnly: args.nationalOnly, category: args.category })
    if (!parsed.ok) return refuseKit(parsed.code)
    const listing = parsed.value
    const query = parseArrivalKitQuery(args.query)
    if (!query.ok) return refuseKit(query.code)
    const result = await listingQuery(ctx, ctx.networkId, listing, query.value).paginate(bounded(args.paginationOpts))
    const labels = labelsFor(ctx)
    const now = Date.now()
    const page: ResourceCard[] = []
    for (const row of result.page) {
      // Défense en profondeur : l'index borne déjà, chaque ligne est rejugée.
      if (row.networkId !== ctx.networkId || !isArrivalKitListed(row.status) || !matchesArrivalKitListing(row, listing)) continue
      // G9 : projection publique — une ressource en relecture de modération ou retirée ne se liste pas.
      if (!(await isServedTo(ctx, "diasporaKitResource", row._id, ctx.person._id))) continue
      const carrier = await labels.carrier(row)
      if (carrier !== null) page.push(toCard(row, carrier, now))
    }
    return { ...result, page }
  },
})

/**
 * La fiche d'une ressource : publiée ou à revoir pour tout lecteur ; la sienne dans
 * tous ses états ; soumise pour une personne habilitée à la relire. Sinon le même
 * `null` : inconnue, d'ailleurs, brouillon d'autrui ou retirée ne se distinguent pas.
 */
export const getResource = networkQuery({
  args: { resourceId: v.string() },
  returns: v.union(resourceDetailValidator, v.null()),
  handler: async (ctx, args): Promise<ResourceDetail | null> => {
    assertDiasporaNetwork(ctx.network)
    assertCapability(ctx, "read_network")
    const resourceId = ctx.db.normalizeId("kitResources", args.resourceId)
    if (resourceId === null) return null
    const labels = labelsFor(ctx)
    const access = await accessOf(ctx, await ctx.db.get(resourceId), labels)
    if (access === null) return null
    // G9 : qui gère la ressource en garde la vue ; tout autre lecteur, ce que la modération sert.
    if (!access.manages && !(await isServedTo(ctx, "diasporaKitResource", access.row._id, ctx.person._id))) return null
    const { row, carrier, manages, reviewer, independent } = access
    const listed = isArrivalKitListed(row.status)
    const hasFlagged = listed ? (await flagOf(ctx, row)) !== null : false
    const canReview = isArrivalKitReviewer(reviewer) && independent
    const insider = manages || canReview
    const status = effectiveMembershipStatus(ctx.membership)
    return {
      ...toCard(row, carrier, Date.now()),
      body: row.body,
      sourceName: row.sourceName,
      sourceUrl: row.sourceUrl,
      createdAt: row.createdAt,
      submittedAt: row.submittedAt ?? null,
      reviewer: listed && row.reviewedByPersonId !== undefined ? await labels.person(row.reviewedByPersonId) : null,
      statusReason: insider ? (row.statusReason ?? null) : null,
      outdatedFlags: insider ? row.outdatedFlags : null,
      // G9 : l'état de modération se dit à qui gère la ressource, jamais à un relecteur ni à un lecteur.
      moderation: manages ? await managedModerationState(ctx, "diasporaKitResource", row._id) : null,
      viewer: {
        canManage: manages && row.status !== "archived",
        canReview: canReview && (row.status === "submitted" || row.status === "published"),
        canFlag: listed && independent && !hasFlagged && status !== null && hasCapability(status, "publish"),
        hasFlagged,
      },
    }
  },
})

/**
 * La file de relecture d'un pays, les plus anciennes soumissions d'abord — pour
 * une personne habilitée seulement (membre vérifié, ou signataire vivant d'une
 * page) ; ce qu'elle a écrit, ou ce que porte une page qu'elle signe, n'y paraît pas.
 */
export const reviewQueue = networkQuery({
  args: { country: v.string(), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(queueItemValidator),
  handler: async (ctx, args): Promise<PaginationResult<QueueItem>> => {
    assertDiasporaNetwork(ctx.network)
    assertCapability(ctx, "read_network")
    if (!isArrivalKitReviewer(await reviewerFacts(ctx))) return refuseKit("arrival_kit_reviewer_not_eligible")
    const country = parseArrivalKitCountry(args.country)
    if (!country.ok) return refuseKit(country.code)
    const code = country.value
    const result = await ctx.db
      .query("kitResources")
      .withIndex("by_network_status_country_submitted", (q) => q.eq("networkId", ctx.networkId).eq("status", "submitted").eq("country", code))
      .order("asc")
      .paginate(bounded(args.paginationOpts))
    const labels = labelsFor(ctx)
    const now = Date.now()
    const page: QueueItem[] = []
    for (const row of result.page) {
      if (row.networkId !== ctx.networkId || row.status !== "submitted" || row.country !== code) continue
      if (!independentOf(ctx, row, await managesResource(ctx, row))) continue
      // G9 : une version en relecture de modération ou retirée attend la modération, pas la relecture du kit.
      if (!(await isServedTo(ctx, "diasporaKitResource", row._id, ctx.person._id))) continue
      const carrier = await labels.carrier(row)
      if (carrier !== null) page.push({ ...toCard(row, carrier, now), submittedAt: row.submittedAt ?? row.revisedAt })
    }
    return { ...result, page }
  },
})

/**
 * « Mes propositions » : les ressources que j'ai proposées, les plus récemment
 * changées d'abord, dans tous leurs états — sauf celles d'une page dont je ne suis
 * plus signataire, qui n'y restent que tant qu'elles se lisent dans le kit public
 * (publiées ou à revoir, et servies par la modération). L'état de modération (G9)
 * ne se dit que sur celles que je gère.
 */
export const myResources = networkQuery({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(ownItemValidator),
  handler: async (ctx, args): Promise<PaginationResult<OwnItem>> => {
    assertDiasporaNetwork(ctx.network)
    assertCapability(ctx, "read_network")
    const result = await ctx.db
      .query("kitResources")
      .withIndex("by_network_proposer_updated", (q) => q.eq("networkId", ctx.networkId).eq("proposedByPersonId", ctx.person._id))
      .order("desc")
      .paginate(bounded(args.paginationOpts))
    const labels = labelsFor(ctx)
    const now = Date.now()
    const page: OwnItem[] = []
    for (const row of result.page) {
      if (row.networkId !== ctx.networkId || row.proposedByPersonId !== ctx.person._id) continue
      const manages = await managesResource(ctx, row)
      // G9 : une ressource que je ne gère plus n'y reste que si le kit public me la sert (ni en relecture préalable, ni retirée).
      if (!manages && !(isArrivalKitListed(row.status) && (await isServedTo(ctx, "diasporaKitResource", row._id, ctx.person._id)))) continue
      const carrier = await labels.carrier(row)
      if (carrier === null) continue
      page.push({
        ...toCard(row, carrier, now),
        statusReason: manages ? (row.statusReason ?? null) : null,
        outdatedFlags: manages ? row.outdatedFlags : null,
        moderation: manages ? await managedModerationState(ctx, "diasporaKitResource", row._id) : null,
      })
    }
    return { ...result, page }
  },
})

/** Ce que je peux faire dans le kit : proposer, relire, et au nom de quelles pages (signataire vivant). */
export const myKitStanding = networkQuery({
  args: {},
  returns: kitStandingValidator,
  handler: async (ctx): Promise<KitStanding> => {
    assertDiasporaNetwork(ctx.network)
    assertCapability(ctx, "read_network")
    const status = effectiveMembershipStatus(ctx.membership) ?? "partie"
    const canPropose = hasCapability(status, "publish")
    const pages = canPropose ? await livePagesOf(ctx) : []
    const carrierPages: PageCard[] = []
    for (const page of pages) {
      if (!isArrivalKitCarrierKind(page.ownerKind)) continue
      const readable = await readablePageOrNull(ctx, ctx.network, page._id, ctx.person._id)
      if (readable !== null) carrierPages.push(await pageCardOf(ctx, readable))
    }
    return { canPropose, canReview: isArrivalKitReviewer({ status, livePageSignatory: pages.length > 0 }), carrierPages }
  },
})

// ═══════════════════════════════════════════════════════════════
// Proposer, modifier, soumettre, retirer
// ═══════════════════════════════════════════════════════════════

/** Les champs saisis d'une version : jugés par LA règle du domaine (codes fermés). */
const resourceInputFields = {
  title: v.string(),
  summary: v.string(),
  body: v.string(),
  category: v.string(),
  country: v.string(),
  city: v.optional(v.string()),
  sourceName: v.string(),
  sourceUrl: v.string(),
  lastVerifiedAt: v.number(),
}

function draftOf(input: ArrivalKitResourceInput, now: number): ArrivalKitResourceDraft {
  const draft = parseArrivalKitResource(input, now)
  if (!draft.ok) return refuseKit(draft.code)
  return draft.value
}

/** Les champs écrits d'une version validée (la ville absente est traitée par l'appelant). */
function contentOf(draft: ArrivalKitResourceDraft) {
  return {
    title: draft.title,
    summary: draft.summary,
    body: draft.body,
    category: draft.category,
    country: draft.country,
    cityKey: draft.cityKey,
    sourceName: draft.sourceName,
    sourceUrl: draft.sourceUrl,
    lastVerifiedAt: draft.lastVerifiedAt,
    // ET-04 : le texte cherché suit la version courante.
    searchText: arrivalKitSearchText(draft),
  }
}

function nextStatus(from: ArrivalKitStatus, gesture: ArrivalKitGesture): ArrivalKitStatus {
  const next = transitionArrivalKit(from, gesture)
  if (!next.ok) return refuseKit(next.code)
  return next.value
}

function nextVersion(row: ResourceRow, expected: number): number {
  const version = checkArrivalKitVersion(row.version, expected)
  if (!version.ok) return refuseKit(version.code, { current: row.version })
  return version.value
}

/** La page au nom de laquelle on propose : lisible d'ici, du réseau, signée par l'appelant, de nature admise. */
async function carrierPageFor(ctx: NetworkCtx, pageId: Id<"pages">): Promise<Doc<"pages">> {
  const page = await readablePageOrNull(ctx, ctx.network, pageId, ctx.person._id)
  if (page === null || page.networkId !== ctx.networkId) return notFound()
  if ((await liveSignatoryRole(ctx, page, ctx.person._id)) === null) return notFound()
  if (!isArrivalKitCarrierKind(page.ownerKind)) return refuseKit("arrival_kit_page_kind_not_allowed")
  return page
}

/** Une personne ne garde pas plus de `ARRIVAL_KIT_RESOURCES_PER_PROPOSER_MAX` ressources non archivées (lecture bornée par état). */
async function assertProposerQuota(ctx: NetworkCtx): Promise<void> {
  let count = 0
  for (const status of LIVE_STATUSES) {
    const rows = await ctx.db
      .query("kitResources")
      .withIndex("by_network_proposer_status", (q) => q.eq("networkId", ctx.networkId).eq("proposedByPersonId", ctx.person._id).eq("status", status))
      .take(ARRIVAL_KIT_RESOURCES_PER_PROPOSER_MAX)
    count += rows.length
    if (isArrivalKitQuotaReached(count)) refuseKit("arrival_kit_resource_limit_reached", { max: ARRIVAL_KIT_RESOURCES_PER_PROPOSER_MAX })
  }
}

/** La ressource GÉRÉE par l'appelant (auteur, ou signataire vivant de sa page) ; sinon le refus indistinct. */
async function managedResource(ctx: NetworkCtx, resourceId: Id<"kitResources">): Promise<ResourceRow> {
  const row = await ctx.db.get(resourceId)
  if (row === null || row.networkId !== ctx.networkId || !(await managesResource(ctx, row))) return notFound()
  return row
}

/**
 * Proposer une ressource — en son nom, ou au nom d'une page qu'on signe : un
 * brouillon, ou soumise aussitôt à la relecture. Rien n'entre dans le kit public
 * sans la relecture d'une autre personne.
 */
export const proposeResource = networkMutation({
  args: { ...resourceInputFields, pageId: v.optional(v.id("pages")), submit: v.boolean() },
  returns: v.object({ resourceId: v.id("kitResources"), version: v.number(), revision: v.number(), status: arrivalKitStatusValidator }),
  handler: async (ctx, args) => {
    assertDiasporaNetwork(ctx.network)
    assertCapability(ctx, "publish")
    await enforceRateLimit(ctx, "diaspora.kit.write", ctx.person._id)
    const page = args.pageId === undefined ? null : await carrierPageFor(ctx, args.pageId)
    const now = Date.now()
    const draft = draftOf(args, now)
    await assertProposerQuota(ctx)
    const status: "submitted" | "draft" = args.submit ? "submitted" : "draft"
    const resourceId = await ctx.db.insert("kitResources", {
      networkId: ctx.networkId,
      ...(page === null ? { authorPersonId: ctx.person._id } : { pageId: page._id }),
      proposedByPersonId: ctx.person._id,
      revisedByPersonId: ctx.person._id,
      ...contentOf(draft),
      ...(draft.city === null ? {} : { city: draft.city }),
      status,
      listed: false,
      revision: 1,
      version: 1,
      outdatedFlags: 0,
      ...(args.submit ? { submittedAt: now } : {}),
      revisedAt: now,
      createdAt: now,
      updatedAt: now,
    })
    // G9 : l'état de modération appartient à la page qui porte la ressource, sinon à son auteur.
    await moderateDiasporaWrite(ctx, {
      networkId: ctx.networkId,
      kind: "diasporaKitResource",
      id: resourceId,
      text: resourceText(draft),
      owner: page === null ? { personId: ctx.person._id } : { pageId: page._id },
    })
    return { resourceId, version: 1, revision: 1, status }
  },
})

/**
 * Modifier une ressource (non archivée) : une NOUVELLE version, qui cite la version
 * lue (`expectedVersion`), quitte le kit public, remet ses signalements à zéro et
 * repasse par la relecture (soumise) — ou reste un brouillon.
 */
export const updateResource = networkMutation({
  args: { resourceId: v.id("kitResources"), expectedVersion: v.number(), ...resourceInputFields, submit: v.boolean() },
  returns: v.object({ version: v.number(), revision: v.number(), status: arrivalKitStatusValidator }),
  handler: async (ctx, args) => {
    assertDiasporaNetwork(ctx.network)
    assertCapability(ctx, "publish")
    await enforceRateLimit(ctx, "diaspora.kit.write", ctx.person._id)
    const row = await managedResource(ctx, args.resourceId)
    const status = nextStatus(row.status, args.submit ? "save_and_submit" : "save_draft")
    const version = nextVersion(row, args.expectedVersion)
    const now = Date.now()
    const draft = draftOf(args, now)
    // G9 : une ressource retirée par la modération ne se modifie plus ; sinon la nouvelle version est relue comme une écriture.
    await moderateDiasporaWrite(ctx, { networkId: ctx.networkId, kind: "diasporaKitResource", id: row._id, text: resourceText(draft), owner: resourceOwner(row, ctx.person._id) })
    const revision = row.revision + 1
    await ctx.db.patch(row._id, {
      ...contentOf(draft),
      city: draft.city ?? undefined,
      status,
      listed: isArrivalKitListed(status),
      statusReason: undefined,
      revisedByPersonId: ctx.person._id,
      revision,
      version,
      outdatedFlags: 0,
      reviewedByPersonId: undefined,
      reviewedAt: undefined,
      submittedAt: status === "submitted" ? now : undefined,
      revisedAt: now,
      updatedAt: now,
    })
    return { version, revision, status }
  },
})

/** Soumettre un brouillon tel quel à la relecture, à la version lue ; une vérification trop ancienne doit d'abord être refaite. */
export const submitResource = networkMutation({
  args: { resourceId: v.id("kitResources"), expectedVersion: v.number() },
  returns: v.object({ version: v.number(), status: arrivalKitStatusValidator }),
  handler: async (ctx, args) => {
    assertDiasporaNetwork(ctx.network)
    assertCapability(ctx, "publish")
    await enforceRateLimit(ctx, "diaspora.kit.write", ctx.person._id)
    const row = await managedResource(ctx, args.resourceId)
    const status = nextStatus(row.status, "submit")
    const version = nextVersion(row, args.expectedVersion)
    const now = Date.now()
    if (arrivalKitReviewDueAt(row.lastVerifiedAt) <= now) return refuseKit("arrival_kit_verified_at_too_old")
    // G9 : une ressource retirée par la modération ne repasse pas en relecture (aucune republication).
    if (await isRemovedByModeration(ctx, "diasporaKitResource", row._id)) return fail("policyRefused")
    await ctx.db.patch(row._id, { status, listed: false, statusReason: undefined, submittedAt: now, version, updatedAt: now })
    return { version, status }
  },
})

/** Retirer sa ressource : archivée, terminale ; elle quitte le kit public et ne se republie pas. */
export const withdrawResource = networkMutation({
  args: { resourceId: v.id("kitResources"), expectedVersion: v.number() },
  returns: v.object({ version: v.number(), status: arrivalKitStatusValidator }),
  handler: async (ctx, args) => {
    assertDiasporaNetwork(ctx.network)
    assertCapability(ctx, "publish")
    await enforceRateLimit(ctx, "diaspora.kit.write", ctx.person._id)
    const row = await managedResource(ctx, args.resourceId)
    const status = nextStatus(row.status, "archive")
    const version = nextVersion(row, args.expectedVersion)
    const now = Date.now()
    await ctx.db.patch(row._id, { status, listed: false, archivedAt: now, version, updatedAt: now })
    return { version, status }
  },
})

// ═══════════════════════════════════════════════════════════════
// Relire, marquer à revoir, signaler
// ═══════════════════════════════════════════════════════════════

/** La ressource que l'appelant peut voir ET relire (habilité, étranger à elle) ; sinon refus indistinct ou code fermé. */
async function reviewedResource(ctx: NetworkCtx, resourceId: Id<"kitResources">): Promise<ResourceRow> {
  const access = await accessOf(ctx, await ctx.db.get(resourceId), labelsFor(ctx))
  if (access === null) return notFound()
  // G9 : un relecteur (jamais l'équipe qui la porte) ne relit que ce que la modération lui sert.
  if (!access.manages && !(await isServedTo(ctx, "diasporaKitResource", access.row._id, ctx.person._id))) return notFound()
  const check = checkArrivalKitReviewer({
    reviewer: access.reviewer,
    actorId: ctx.person._id,
    writerIds: writersOf(access.row),
    onCarrierTeam: access.row.pageId !== undefined && access.manages,
  })
  if (!check.ok) return refuseKit(check.code)
  return access.row
}

function reasonOf(raw: string | undefined): string {
  const reason = parseArrivalKitReason(raw)
  if (!reason.ok) return refuseKit(reason.code, { min: ARRIVAL_KIT_REASON_MIN_LENGTH, max: ARRIVAL_KIT_REASON_MAX_LENGTH })
  return reason.value
}

/**
 * Relire une version soumise : la publier (elle entre dans le kit public, avec son
 * relecteur et la date) ou la renvoyer à qui l'a écrite, motif obligatoire (elle
 * redevient un brouillon). Toujours une personne habilitée et étrangère à la ressource.
 */
export const reviewResource = networkMutation({
  args: {
    resourceId: v.id("kitResources"),
    expectedVersion: v.number(),
    decision: literals(ARRIVAL_KIT_REVIEW_DECISIONS),
    reason: v.optional(v.string()),
  },
  returns: v.object({ version: v.number(), status: arrivalKitStatusValidator }),
  handler: async (ctx, args) => {
    assertDiasporaNetwork(ctx.network)
    assertCapability(ctx, "publish")
    await enforceRateLimit(ctx, "diaspora.kit.review", ctx.person._id)
    const row = await reviewedResource(ctx, args.resourceId)
    const status = nextStatus(row.status, args.decision)
    const version = nextVersion(row, args.expectedVersion)
    const now = Date.now()
    if (args.decision === "return") {
      const reason = reasonOf(args.reason)
      await ctx.db.patch(row._id, { status, listed: isArrivalKitListed(status), statusReason: reason, version, updatedAt: now })
      await ctx.db.insert("kitResourceReviews", {
        networkId: ctx.networkId, resourceId: row._id, revision: row.revision, reviewerPersonId: ctx.person._id, outcome: "returned", reason, createdAt: now,
      })
      await noticeKitResourceReviewed(ctx, row._id, ctx.person._id)
      return { version, status }
    }
    // Publier : la vérification déclarée doit encore valoir au moment de la relecture.
    if (arrivalKitReviewDueAt(row.lastVerifiedAt) <= now) return refuseKit("arrival_kit_verified_at_too_old")
    await ctx.db.patch(row._id, {
      status,
      listed: isArrivalKitListed(status),
      statusReason: undefined,
      reviewedByPersonId: ctx.person._id,
      reviewedAt: now,
      version,
      updatedAt: now,
    })
    await ctx.db.insert("kitResourceReviews", {
      networkId: ctx.networkId, resourceId: row._id, revision: row.revision, reviewerPersonId: ctx.person._id, outcome: "published", createdAt: now,
    })
    await noticeKitResourceReviewed(ctx, row._id, ctx.person._id)
    return { version, status }
  },
})

/** Marquer « à revoir » une ressource publiée, motif obligatoire : elle reste lue, avec son avertissement. */
export const markResourceForReview = networkMutation({
  args: { resourceId: v.id("kitResources"), expectedVersion: v.number(), reason: v.string() },
  returns: v.object({ version: v.number(), status: arrivalKitStatusValidator }),
  handler: async (ctx, args) => {
    assertDiasporaNetwork(ctx.network)
    assertCapability(ctx, "publish")
    await enforceRateLimit(ctx, "diaspora.kit.review", ctx.person._id)
    const row = await reviewedResource(ctx, args.resourceId)
    const status = nextStatus(row.status, "mark_needs_review")
    const version = nextVersion(row, args.expectedVersion)
    const reason = reasonOf(args.reason)
    const now = Date.now()
    await ctx.db.patch(row._id, { status, listed: isArrivalKitListed(status), statusReason: reason, version, updatedAt: now })
    await ctx.db.insert("kitResourceReviews", {
      networkId: ctx.networkId, resourceId: row._id, revision: row.revision, reviewerPersonId: ctx.person._id, outcome: "needs_review", reason, createdAt: now,
    })
    return { version, status }
  },
})

/**
 * Signaler une information périmée sur la version LUE (`revision`) : une ressource du
 * kit public, une fois par personne et par version, au motif fermé, jamais la
 * sienne. Au seuil, la ressource se lit « à revoir » ; la version de la ligne ne
 * bouge pas (aucun geste de qui la gère n'est rendu périmé par un signalement).
 */
export const flagResourceOutdated = networkMutation({
  args: { resourceId: v.id("kitResources"), revision: v.number(), reason: v.string() },
  returns: v.object({ outdatedFlags: v.number(), status: arrivalKitStatusValidator }),
  handler: async (ctx, args) => {
    assertDiasporaNetwork(ctx.network)
    assertCapability(ctx, "publish")
    await enforceRateLimit(ctx, "diaspora.kit.write", ctx.person._id)
    const access = await accessOf(ctx, await ctx.db.get(args.resourceId), labelsFor(ctx))
    if (access === null) return notFound()
    // G9 : on ne signale « périmée » qu'une ressource que la modération sert à ce lecteur.
    if (!access.manages && !(await isServedTo(ctx, "diasporaKitResource", access.row._id, ctx.person._id))) return notFound()
    const { row } = access
    if (args.revision !== row.revision) return refuseKit("arrival_kit_version_conflict", { current: row.revision })
    const check = checkArrivalKitFlag({
      status: row.status,
      actorId: ctx.person._id,
      writerIds: writersOf(row),
      onCarrierTeam: row.pageId !== undefined && access.manages,
      alreadyFlagged: (await flagOf(ctx, row)) !== null,
      reason: args.reason,
    })
    if (!check.ok) return refuseKit(check.code)
    const now = Date.now()
    const outdatedFlags = row.outdatedFlags + 1
    await ctx.db.insert("kitOutdatedFlags", {
      networkId: ctx.networkId, resourceId: row._id, revision: row.revision, personId: ctx.person._id, reason: check.value, createdAt: now,
    })
    await ctx.db.patch(row._id, { outdatedFlags })
    return { outdatedFlags, status: effectiveArrivalKitStatus({ status: row.status, lastVerifiedAt: row.lastVerifiedAt, outdatedFlags }, now) }
  },
})

export type ArrivalKitResourceCardDto = ResourceCard
export type ArrivalKitResourceDetailDto = ResourceDetail
export type ArrivalKitQueueItemDto = QueueItem
export type ArrivalKitOwnItemDto = OwnItem
export type ArrivalKitStandingDto = KitStanding
