/**
 * Demandes de service, propositions et rendez-vous DIASPORALE (DG-014/015).
 *
 * Mise en relation SEULEMENT : aucun paiement, aucune facturation, aucune
 * conversation libre (elle attend le canal générique du moteur). L'échange est
 * STRUCTURÉ : un besoin et des fenêtres souhaitées, une proposition VERSIONNÉE
 * de la page, un accord du demandeur sur la version courante, puis le constat
 * (réalisation, absence) ou l'annulation motivée.
 *
 * Gardes, dans l'ordre du moteur : adhésion et éligibilité (constructeurs),
 * limitation de débit (seaux `diaspora.service.*`), puis droit sur la demande :
 * le DEMANDEUR, ou un SIGNATAIRE VIVANT de la page relu à chaque geste (un rôle
 * retiré, une page désactivée coupent aussitôt). Une demande d'autrui est
 * introuvable (refus indistinct). Les règles viennent de `@diasporale/domain`.
 *
 * Idempotence alignée sur le contrat de commande du moteur : même clé et même
 * corps normalisé rendent la demande déjà créée ; même clé et autre corps sont
 * un conflit. L'expiration est CONSTATÉE à la lecture et à l'écriture ; le
 * passage `expireDueServiceRequests` l'écrit (sa planification revient à ANTSIA).
 * Avis neutres (sans besoin, montant ni créneau) par `serviceNotifications.ts`, qui passe par
 * le rédacteur unique du moteur (`notifications/notify.ts`) ; la tranche n'écrit jamais `notifications`.
 */
import {
  availableServiceRequestActions,
  availableServiceRescheduleActions,
  bookingCapacityAllows,
  canContestNoShow,
  checkNoShowContest,
  checkProposalVersion,
  checkServiceRequestTiming,
  checkServiceRequestTransition,
  checkServiceRescheduleGesture,
  effectiveServiceRequestStatus,
  isServiceIdempotencyKey,
  isServiceRequestTerminal,
  MINUTE_MS,
  nextProposalVersion,
  normalizeServiceRequestDraft,
  openServiceReschedule,
  parseServiceProposal,
  parseServiceReason,
  parseServiceReschedule,
  type Result,
  SERVICE_PROPOSAL_MAX_VERSIONS,
  SERVICE_REQUEST_ACTIONS,
  SERVICE_REQUEST_OPEN_STATUSES,
  SERVICE_RESCHEDULE_ACTIONS,
  SERVICE_SLOT_MAX_MINUTES,
  serviceRequestFingerprint,
  serviceRequestTimeline,
  SERVICE_DELIVERY_MODES,
  slotsOverlap,
  type ServiceRequestAction,
  type ServiceRequestActor,
  type ServiceRequestRefusal,
  type ServiceRequestStatus,
} from "@diasporale/domain"
import { paginationOptsValidator, paginationResultValidator, type PaginationOptions, type PaginationResult } from "convex/server"
import { v } from "convex/values"

import type { Doc, Id } from "../../_generated/dataModel"
import { internalMutation, type MutationCtx, type QueryCtx } from "../../_generated/server"
import { fail, failAppRule, notFound } from "../../lib/errors"
import { networkMutation, networkQuery } from "../../lib/functions"
import { enforceRateLimit } from "../../lib/rateLimit"
import { literals } from "../../lib/validators"
import { openContextualConversation, syncContextualConversation } from "../contextualMessaging/hooks"
import { liveSignatoryRole, pageCardOf, readablePageOrNull } from "../pages/access"
import { livePersonProfile } from "../people/miniProfile"
import { assertDiasporaNetwork } from "./facts"
// Avis neutres de la cloche (DG-015), par la porte unique, juste après chaque écriture réussie.
import {
  noticeServiceNoShowContested,
  noticeServicePageGesture,
  noticeServiceProposalAccepted,
  noticeServiceRequestCancelled,
  noticeServiceRequestSent,
  scheduleServiceRequestExpiredNotices,
} from "./serviceNotifications"
import {
  serviceBookingStatusValidator,
  serviceLocationValidator,
  serviceProposalStateValidator,
  serviceRequestActorValidator,
  serviceRequestCloserValidator,
  serviceRequestStatusValidator,
  serviceRescheduleValidator,
  serviceWindowValidator,
} from "./serviceRequestsTables"
import { providerSettingsOf, providerSettingsValidator } from "./services"
import { servicePricingValidator } from "./servicesTables"

const LIST_PAGE_MAX = 50
const LIST_PAGE_BYTES = 2 * 1024 * 1024
/** Rendez-vous confirmés relus au plus pour un contrôle de collision (au-delà : créneau tenu pour pris). */
const SLOT_SCAN_MAX = 200
/** Demandes échues écrites au plus par passage d'expiration, par état. */
const EXPIRY_BATCH_MAX = 100

// ═══════════════════════════════════════════════════════════════
// Projections
// ═══════════════════════════════════════════════════════════════

const pageLabelValidator = v.object({
  pageId: v.id("pages"),
  handle: v.string(),
  name: v.string(),
  logoUrl: v.union(v.string(), v.null()),
})

/** Le demandeur vu par l'équipe de la page (consentement explicite) : nom publié, jamais une coordonnée. */
const requesterLabelValidator = v.object({
  displayName: v.union(v.string(), v.null()),
  handle: v.union(v.string(), v.null()),
})

const proposalSummaryValidator = v.object({
  version: v.number(),
  amountMinor: v.number(),
  currency: v.string(),
  startAt: v.number(),
  endAt: v.number(),
  timeZone: v.string(),
  expiresAt: v.number(),
})

const bookingSummaryValidator = v.object({
  startAt: v.number(),
  endAt: v.number(),
  timeZone: v.string(),
  status: serviceBookingStatusValidator,
})

const summaryFields = {
  requestId: v.id("serviceRequests"),
  /** L'état EFFECTIF (expiration constatée). */
  status: serviceRequestStatusValidator,
  offerId: v.id("serviceOffers"),
  offerTitle: v.string(),
  offerVersion: v.number(),
  /** La page, si elle se lit encore d'ici ; `null` sinon. */
  page: v.union(pageLabelValidator, v.null()),
  /** Pour l'équipe de la page seulement ; `null` dans la vue du demandeur. */
  requester: v.union(requesterLabelValidator, v.null()),
  windows: v.array(serviceWindowValidator),
  timeZone: v.string(),
  currentProposal: v.union(proposalSummaryValidator, v.null()),
  booking: v.union(bookingSummaryValidator, v.null()),
  /** SV-03 : le nouvel horaire proposé pour le rendez-vous confirmé, s'il est encore ouvert ; `null` sinon. */
  reschedule: v.union(serviceRescheduleValidator, v.null()),
  /** L'échéance qui court ; `null` après l'accord ou la clôture. */
  deadlineAt: v.union(v.number(), v.null()),
  createdAt: v.number(),
  updatedAt: v.number(),
}

const summaryValidator = v.object(summaryFields)

const proposalDetailValidator = v.object({
  version: v.number(),
  amountMinor: v.number(),
  currency: v.string(),
  durationMinutes: v.number(),
  startAt: v.number(),
  endAt: v.number(),
  timeZone: v.string(),
  location: serviceLocationValidator,
  details: v.string(),
  cancellationTerms: v.string(),
  expiresAt: v.number(),
  state: serviceProposalStateValidator,
  /** SV-03 : la version qu'un déplacement accepté a remplacée ; `null` pour une proposition. */
  rescheduledFrom: v.union(v.number(), v.null()),
  createdAt: v.number(),
})

/**
 * SV-04 : ce qu'une nouvelle proposition reprend de l'offre (tarif annoncé, durée,
 * mode, ville) et de ses réglages de prestation. Pour l'équipe de la page seulement ;
 * rien n'est envoyé sans que le signataire valide le formulaire.
 */
const proposalPrefillValidator = v.object({
  pricing: servicePricingValidator,
  durationMinutes: v.union(v.number(), v.null()),
  delivery: literals(SERVICE_DELIVERY_MODES),
  city: v.string(),
  settings: providerSettingsValidator,
})

const timelineEventValidator = v.object({
  status: serviceRequestStatusValidator,
  at: v.number(),
  version: v.union(v.number(), v.null()),
})

const detailValidator = v.object({
  ...summaryFields,
  viewerRole: serviceRequestActorValidator,
  need: v.string(),
  /** Les versions de proposition, de la plus récente à la plus ancienne. */
  proposals: v.array(proposalDetailValidator),
  timeline: v.array(timelineEventValidator),
  closedBy: v.union(serviceRequestCloserValidator, v.null()),
  closedReason: v.union(v.string(), v.null()),
  /** Les gestes réellement ouverts à ce lecteur maintenant (calculés par le serveur). */
  actions: v.array(literals(SERVICE_REQUEST_ACTIONS)),
  /** SV-03 : les gestes de déplacement ouverts à ce lecteur maintenant. */
  rescheduleActions: v.array(literals(SERVICE_RESCHEDULE_ACTIONS)),
  /** DG-015 : la contestation d'une absence par le demandeur, lisible des deux côtés ; `null` sinon. */
  noShowContest: v.union(v.object({ at: v.number(), reason: v.string() }), v.null()),
  /** Le demandeur peut-il contester l'absence maintenant (quatorze jours après le constat) ? */
  canContestNoShow: v.boolean(),
  /** SV-04 : la proposition préremplie depuis l'offre, pour l'équipe de la page ; `null` pour le demandeur. */
  proposalPrefill: v.union(proposalPrefillValidator, v.null()),
})

export type ServiceRequestSummaryDto = typeof summaryValidator.type
export type ServiceRequestDetailDto = typeof detailValidator.type

type NetworkScope = { network: Doc<"networks">; networkId: Id<"networks">; person: Doc<"persons"> }
type ReadScope = QueryCtx & NetworkScope
type WriteScope = MutationCtx & NetworkScope & { membership: Doc<"networkMemberships">; rootNetwork: Doc<"networks"> }

/**
 * La conversation contextuelle d'une demande (CC-3b, contrat CONVERSATION-CONTEXTUELLE-V1) :
 * ouverte avec la demande, resynchronisée après chaque transition, dans la même transaction.
 * Les crochets du moteur n'échouent jamais sur un refus et n'écrivent ni avis ni appel.
 */
const conversationOf = (id: Id<"serviceRequests">) => ({ kind: "diasporaServiceRequest", id }) as const

// ═══════════════════════════════════════════════════════════════
// Refus et gardes
// ═══════════════════════════════════════════════════════════════

const CONFLICT_REFUSALS: ReadonlySet<ServiceRequestRefusal> = new Set<ServiceRequestRefusal>([
  "request_offer_changed",
  "request_already_open",
  "request_idempotency_conflict",
  "proposal_version_changed",
  "booking_slot_unavailable",
  "reschedule_already_open",
  "reschedule_changed",
])

const POLICY_REFUSALS: ReadonlySet<ServiceRequestRefusal> = new Set<ServiceRequestRefusal>([
  "request_own_page",
  "request_expired",
  "request_closed",
  "request_not_open",
  "request_action_forbidden",
  "proposal_versions_exhausted",
  "booking_started",
  "booking_not_started",
  "request_contest_unavailable",
  "request_contest_window_closed",
  "reschedule_not_open",
])

/** Un refus de la tranche, traduit par DIASPORALE (`errors.<code>`) ; une saisie invalide est `invalidArgument`. */
function refuseRule(code: ServiceRequestRefusal): never {
  return failAppRule(code, {}, CONFLICT_REFUSALS.has(code) ? "conflict" : POLICY_REFUSALS.has(code) ? "policyRefused" : "invalidArgument")
}

function ruled<T>(result: Result<T, ServiceRequestRefusal>): T {
  if (result.ok) return result.value
  return refuseRule(result.code)
}

function boundedPage(options: PaginationOptions): PaginationOptions {
  return {
    ...options,
    numItems: Math.min(Math.max(Math.trunc(options.numItems), 1), LIST_PAGE_MAX),
    maximumBytesRead: Math.min(options.maximumBytesRead ?? LIST_PAGE_BYTES, LIST_PAGE_BYTES),
  }
}

/** L'état EFFECTIF d'une demande : l'échéance atteinte vaut expiration, écrite ou non. */
function effectiveStatusOf(request: Doc<"serviceRequests">, now: number): ServiceRequestStatus {
  return effectiveServiceRequestStatus({ status: request.status, deadlineAt: request.deadlineAt ?? null }, now)
}

/** La page de la demande, si l'appelant y parle encore : signataire VIVANT d'une page active du réseau. */
async function pageOfSignatory(ctx: ReadScope, request: Doc<"serviceRequests">): Promise<Doc<"pages"> | null> {
  const page = await ctx.db.get(request.pageId)
  if (!page || page.networkId !== ctx.networkId) return null
  return (await liveSignatoryRole(ctx, page, ctx.person._id)) === null ? null : page
}

/** Le lecteur PARTICIPE à la demande (demandeur, ou signataire vivant de la page) ; sinon `null`. */
async function participantOf(ctx: ReadScope, requestId: Id<"serviceRequests">): Promise<{ request: Doc<"serviceRequests">; actor: ServiceRequestActor } | null> {
  const request = await ctx.db.get(requestId)
  if (!request || request.networkId !== ctx.networkId) return null
  if (request.requesterPersonId === ctx.person._id) return { request, actor: "requester" }
  return (await pageOfSignatory(ctx, request)) === null ? null : { request, actor: "page" }
}

/** Le geste de la PAGE sur une demande : refus indistinct à tout autre. */
async function requirePageSide(ctx: ReadScope, requestId: Id<"serviceRequests">): Promise<Doc<"serviceRequests">> {
  const request = await ctx.db.get(requestId)
  if (!request || request.networkId !== ctx.networkId || (await pageOfSignatory(ctx, request)) === null) return notFound()
  return request
}

/** Le geste du DEMANDEUR sur SA demande : refus indistinct à tout autre. */
async function requireRequesterSide(ctx: ReadScope, requestId: Id<"serviceRequests">): Promise<Doc<"serviceRequests">> {
  const request = await ctx.db.get(requestId)
  if (!request || request.networkId !== ctx.networkId || request.requesterPersonId !== ctx.person._id) return notFound()
  return request
}

/** SV-09 : les rendez-vous simultanés que l'offre d'une demande admet (réglage de prestation ; un par défaut). */
async function offerCapacityOf(ctx: ReadScope, request: Doc<"serviceRequests">): Promise<number> {
  const offer = await ctx.db.get(request.offerId)
  return offer && offer.networkId === ctx.networkId && offer.pageId === request.pageId ? (offer.providerSettings?.bookingCapacity ?? 1) : 1
}

/**
 * Le créneau est-il PLEIN pour la page ? Lecture bornée des rendez-vous confirmés
 * commençant dans [début − durée maximale, fin) : deux acceptations concurrentes
 * lisent la même plage, la seconde est rejouée par Convex et voit la première.
 * SV-09 : la règle de capacité du domaine (`bookingCapacityAllows`) — à un partout,
 * aucun chevauchement. `exceptBookingId` : le rendez-vous qu'on déplace ne se
 * compte pas lui-même.
 */
async function slotTaken(
  ctx: ReadScope,
  pageId: Id<"pages">,
  slot: { startAt: number; endAt: number },
  capacity: number,
  exceptBookingId: Id<"serviceBookings"> | null = null,
): Promise<boolean> {
  const booked = await ctx.db
    .query("serviceBookings")
    .withIndex("by_network_and_page_and_status_and_startAt", (q) =>
      q.eq("networkId", ctx.networkId).eq("pageId", pageId).eq("status", "confirmed").gt("startAt", slot.startAt - SERVICE_SLOT_MAX_MINUTES * MINUTE_MS).lt("startAt", slot.endAt),
    )
    .take(SLOT_SCAN_MAX)
  if (booked.length >= SLOT_SCAN_MAX) return true
  const overlapping = booked.filter((booking) => booking._id !== exceptBookingId && slotsOverlap(booking, slot)).map((booking) => ({ capacity: booking.capacity ?? 1 }))
  return !bookingCapacityAllows({ capacity, overlapping })
}

// ═══════════════════════════════════════════════════════════════
// Lectures
// ═══════════════════════════════════════════════════════════════

type PageLabel = typeof pageLabelValidator.type

/** SV-03 : la proposition de déplacement d'un rendez-vous CONFIRMÉ, si elle est encore ouverte (échéance constatée). */
function openRescheduleOf(booking: Doc<"serviceBookings"> | null, status: ServiceRequestStatus, now: number) {
  return booking && booking.status === "confirmed" && status === "confirmed" ? openServiceReschedule(booking.reschedule ?? null, now) : null
}

/** Projeter des demandes pour un lecteur : la page par la garde de lecture, le demandeur pour l'équipe seulement. */
function summaryProjector(ctx: ReadScope, viewer: ServiceRequestActor, now: number) {
  const pages = new Map<string, PageLabel | null>()
  const pageLabel = async (pageId: Id<"pages">): Promise<PageLabel | null> => {
    const hit = pages.get(pageId)
    if (hit !== undefined) return hit
    const page = await readablePageOrNull(ctx, ctx.network, pageId, ctx.person._id)
    const card = page && page.networkId === ctx.networkId ? await pageCardOf(ctx, page) : null
    const label = card ? { pageId: card.pageId, handle: card.handle, name: card.name, logoUrl: card.logoUrl } : null
    pages.set(pageId, label)
    return label
  }
  return async (request: Doc<"serviceRequests">): Promise<ServiceRequestSummaryDto> => {
    const proposal = request.currentProposalId ? await ctx.db.get(request.currentProposalId) : null
    const booking = request.bookingId ? await ctx.db.get(request.bookingId) : null
    let requester: ServiceRequestSummaryDto["requester"] = null
    if (viewer === "page") {
      const person = await livePersonProfile(ctx, request.requesterPersonId)
      requester = { displayName: person?.displayName ?? null, handle: person?.handle ?? null }
    }
    const status = effectiveStatusOf(request, now)
    return {
      requestId: request._id,
      status,
      offerId: request.offerId,
      offerTitle: request.offerTitle,
      offerVersion: request.offerVersion,
      page: await pageLabel(request.pageId),
      requester,
      windows: request.windows,
      timeZone: request.timeZone,
      currentProposal: proposal
        ? {
            version: proposal.version,
            amountMinor: proposal.amountMinor,
            currency: proposal.currency,
            startAt: proposal.startAt,
            endAt: proposal.endAt,
            timeZone: proposal.timeZone,
            expiresAt: proposal.expiresAt,
          }
        : null,
      booking: booking ? { startAt: booking.startAt, endAt: booking.endAt, timeZone: booking.timeZone, status: booking.status } : null,
      reschedule: openRescheduleOf(booking, status, now),
      deadlineAt: status === "sent" || status === "proposed" ? (request.deadlineAt ?? null) : null,
      createdAt: request.createdAt,
      updatedAt: request.updatedAt,
    }
  }
}

async function detailOf(ctx: ReadScope, request: Doc<"serviceRequests">, viewer: ServiceRequestActor, now: number): Promise<ServiceRequestDetailDto> {
  const summary = await summaryProjector(ctx, viewer, now)(request)
  // borné : dix versions de proposition au plus par demande (`SERVICE_PROPOSAL_MAX_VERSIONS`).
  const proposals = await ctx.db
    .query("serviceProposals")
    .withIndex("by_request_and_version", (q) => q.eq("requestId", request._id))
    .order("desc")
    .take(SERVICE_PROPOSAL_MAX_VERSIONS)
  const booking = request.bookingId ? await ctx.db.get(request.bookingId) : null
  // SV-04 : l'offre de la demande, relue pour l'équipe seulement (même réseau, même page).
  const offer = viewer === "page" ? await ctx.db.get(request.offerId) : null
  const proposalPrefill = offer && offer.networkId === ctx.networkId && offer.pageId === request.pageId
    ? { pricing: offer.pricing, durationMinutes: offer.durationMinutes ?? null, delivery: offer.delivery, city: offer.city, settings: providerSettingsOf(offer) }
    : null
  return {
    ...summary,
    viewerRole: viewer,
    need: request.need,
    proposalPrefill,
    proposals: proposals.map((proposal) => ({
      version: proposal.version,
      amountMinor: proposal.amountMinor,
      currency: proposal.currency,
      durationMinutes: proposal.durationMinutes,
      startAt: proposal.startAt,
      endAt: proposal.endAt,
      timeZone: proposal.timeZone,
      location: proposal.location,
      details: proposal.details,
      cancellationTerms: proposal.cancellationTerms,
      expiresAt: proposal.expiresAt,
      state: proposal.state,
      rescheduledFrom: proposal.rescheduledFrom ?? null,
      createdAt: proposal.createdAt,
    })),
    timeline: serviceRequestTimeline({
      createdAt: request.createdAt,
      proposals: proposals.map((proposal) => ({ version: proposal.version, createdAt: proposal.createdAt, rescheduledFrom: proposal.rescheduledFrom ?? null })),
      confirmedAt: booking ? booking.createdAt : null,
      closed: request.closedAt !== undefined && isServiceRequestTerminal(request.status) ? { status: request.status, at: request.closedAt } : null,
      effectiveStatus: summary.status,
      deadlineAt: request.deadlineAt ?? null,
    }),
    closedBy: request.closedBy ?? null,
    closedReason: request.closedReason ?? null,
    actions: availableServiceRequestActions({
      actor: viewer,
      status: summary.status,
      now,
      bookingStartAt: booking ? booking.startAt : null,
      proposalVersion: request.proposalVersion,
    }),
    rescheduleActions: availableServiceRescheduleActions({
      actor: viewer,
      status: summary.status,
      now,
      bookingStartAt: booking && booking.status === "confirmed" ? booking.startAt : null,
      reschedule: booking?.reschedule ?? null,
      proposalVersion: request.proposalVersion,
    }),
    noShowContest: request.contestedAt !== undefined && request.contestReason !== undefined ? { at: request.contestedAt, reason: request.contestReason } : null,
    canContestNoShow: viewer === "requester" && canContestNoShow(noShowContestInput(request, summary.status, now)),
  }
}

/** Les faits de la contestation d'une absence : le constat de la page est l'instant de clôture `no_show`. */
function noShowContestInput(request: Doc<"serviceRequests">, status: ServiceRequestStatus, now: number) {
  return {
    status,
    declaredAt: status === "no_show" ? (request.closedAt ?? null) : null,
    contestedAt: request.contestedAt ?? null,
    now,
  }
}

/** Mes demandes, des plus récemment mises à jour : les miennes seulement, dans ce réseau. */
export const myServiceRequests = networkQuery({
  minStatus: "en_attente",
  args: { paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(summaryValidator),
  handler: async (ctx, { paginationOpts }): Promise<PaginationResult<ServiceRequestSummaryDto>> => {
    assertDiasporaNetwork(ctx.network)
    const result = await ctx.db
      .query("serviceRequests")
      .withIndex("by_network_and_requester_and_updatedAt", (q) => q.eq("networkId", ctx.networkId).eq("requesterPersonId", ctx.person._id))
      .order("desc")
      .paginate(boundedPage(paginationOpts))
    const project = summaryProjector(ctx, "requester", Date.now())
    const page: ServiceRequestSummaryDto[] = []
    for (const request of result.page) page.push(await project(request))
    return { ...result, page }
  },
})

/**
 * Les demandes reçues par une page, toutes ou par état : pour ses signataires
 * VIVANTS seulement (refus indistinct sinon). Un filtre d'état montre l'état
 * EFFECTIF : une demande échue sort des demandes ouvertes avant même que le
 * passage d'expiration l'écrive.
 */
export const pageServiceRequests = networkQuery({
  minStatus: "en_attente",
  args: { pageId: v.id("pages"), status: v.optional(serviceRequestStatusValidator), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(summaryValidator),
  handler: async (ctx, args): Promise<PaginationResult<ServiceRequestSummaryDto>> => {
    assertDiasporaNetwork(ctx.network)
    const page = await ctx.db.get(args.pageId)
    if (!page || page.networkId !== ctx.networkId || (await liveSignatoryRole(ctx, page, ctx.person._id)) === null) return notFound()
    const status = args.status
    const result =
      status === undefined
        ? await ctx.db
            .query("serviceRequests")
            .withIndex("by_network_and_page_and_updatedAt", (q) => q.eq("networkId", ctx.networkId).eq("pageId", page._id))
            .order("desc")
            .paginate(boundedPage(args.paginationOpts))
        : await ctx.db
            .query("serviceRequests")
            .withIndex("by_network_and_page_and_status_and_updatedAt", (q) => q.eq("networkId", ctx.networkId).eq("pageId", page._id).eq("status", status))
            .order("desc")
            .paginate(boundedPage(args.paginationOpts))
    const project = summaryProjector(ctx, "page", Date.now())
    const rows: ServiceRequestSummaryDto[] = []
    for (const request of result.page) {
      const summary = await project(request)
      if (status === undefined || summary.status === status) rows.push(summary)
    }
    return { ...result, page: rows }
  },
})

/** Une demande, pour ses participants seulement (demandeur, signataire vivant) ; `null` pour tout autre. */
export const getServiceRequest = networkQuery({
  minStatus: "en_attente",
  args: { requestId: v.id("serviceRequests") },
  returns: v.union(detailValidator, v.null()),
  handler: async (ctx, { requestId }) => {
    assertDiasporaNetwork(ctx.network)
    const access = await participantOf(ctx, requestId)
    return access ? await detailOf(ctx, access.request, access.actor, Date.now()) : null
  },
})

// ═══════════════════════════════════════════════════════════════
// Écritures
// ═══════════════════════════════════════════════════════════════

/**
 * Envoyer une demande sur une offre ACTIVE d'une page lisible du réseau, à la
 * version LUE. Consentement explicite à montrer son nom à l'équipe de la page ;
 * aucune relation sociale créée ; une seule demande ouverte par offre.
 */
export const createServiceRequest = networkMutation({
  minStatus: "declaree",
  args: {
    offerId: v.id("serviceOffers"),
    offerVersion: v.number(),
    need: v.string(),
    windows: v.array(serviceWindowValidator),
    timeZone: v.string(),
    shareIdentityWithPage: v.boolean(),
    idempotencyKey: v.string(),
  },
  returns: v.object({ requestId: v.id("serviceRequests"), created: v.boolean() }),
  handler: async (ctx, args) => {
    assertDiasporaNetwork(ctx.network)
    await enforceRateLimit(ctx, "diaspora.service.request", ctx.person._id)
    if (!isServiceIdempotencyKey(args.idempotencyKey)) return fail("invalidArgument", { field: "idempotencyKey" })
    const draft = ruled(normalizeServiceRequestDraft(args))
    const fingerprint = serviceRequestFingerprint({ offerId: args.offerId, offerVersion: args.offerVersion, ...draft })
    // Rejeu AVANT les gardes de l'offre et de l'heure : la demande déjà créée est la réponse.
    const replay = await ctx.db
      .query("serviceRequests")
      .withIndex("by_network_and_requester_and_idempotencyKey", (q) =>
        q.eq("networkId", ctx.networkId).eq("requesterPersonId", ctx.person._id).eq("idempotencyKey", args.idempotencyKey),
      )
      .unique()
    if (replay) return replay.idempotencyFingerprint === fingerprint ? { requestId: replay._id, created: false } : refuseRule("request_idempotency_conflict")
    if (!args.shareIdentityWithPage) return refuseRule("request_consent_required")
    const offer = await ctx.db.get(args.offerId)
    if (!offer || offer.networkId !== ctx.networkId || offer.status !== "active") return notFound()
    const page = await readablePageOrNull(ctx, ctx.network, offer.pageId, ctx.person._id)
    if (!page || page.networkId !== ctx.networkId) return notFound()
    if (offer.version !== args.offerVersion) return refuseRule("request_offer_changed")
    if ((await liveSignatoryRole(ctx, page, ctx.person._id)) !== null) return refuseRule("request_own_page")
    const now = Date.now()
    for (const status of SERVICE_REQUEST_OPEN_STATUSES) {
      // Une nouvelle demande n'est admise que si les précédentes sont échues : la plus récente suffit.
      const latest = await ctx.db
        .query("serviceRequests")
        .withIndex("by_network_and_requester_and_offer_and_status", (q) =>
          q.eq("networkId", ctx.networkId).eq("requesterPersonId", ctx.person._id).eq("offerId", offer._id).eq("status", status),
        )
        .order("desc")
        .first()
      if (latest && effectiveStatusOf(latest, now) !== "expired") return refuseRule("request_already_open")
    }
    const { expiresAt } = ruled(checkServiceRequestTiming(draft, now))
    const requestId = await ctx.db.insert("serviceRequests", {
      networkId: ctx.networkId,
      offerId: offer._id,
      offerVersion: offer.version,
      offerTitle: offer.title,
      pageId: page._id,
      requesterPersonId: ctx.person._id,
      need: draft.need,
      windows: [...draft.windows],
      timeZone: draft.timeZone,
      status: "sent",
      identityConsentAt: now,
      idempotencyKey: args.idempotencyKey,
      idempotencyFingerprint: fingerprint,
      expiresAt,
      deadlineAt: expiresAt,
      proposalVersion: 0,
      createdAt: now,
      updatedAt: now,
    })
    // CC-3b : la conversation naît avec la demande, sans boutique ; le répondant parle d'abord (D4).
    await openContextualConversation(ctx, conversationOf(requestId))
    await noticeServiceRequestSent(ctx, requestId)
    return { requestId, created: true }
  },
})

/**
 * Proposer (ou modifier) les conditions : une NOUVELLE version, la précédente
 * remplacée. La version attendue protège d'un second onglet ou d'un second
 * signataire ; un créneau déjà réservé par la page est refusé d'emblée.
 */
export const proposeService = networkMutation({
  args: {
    requestId: v.id("serviceRequests"),
    expectedVersion: v.number(),
    amountMinor: v.number(),
    currency: v.string(),
    durationMinutes: v.number(),
    startAt: v.number(),
    timeZone: v.string(),
    location: serviceLocationValidator,
    details: v.string(),
    cancellationTerms: v.string(),
    expiresAt: v.number(),
  },
  returns: v.object({ version: v.number() }),
  handler: async (ctx, args) => {
    assertDiasporaNetwork(ctx.network)
    await enforceRateLimit(ctx, "diaspora.service.respond", ctx.person._id)
    const request = await requirePageSide(ctx, args.requestId)
    const now = Date.now()
    ruled(checkServiceRequestTransition({ action: "propose", actor: "page", status: effectiveStatusOf(request, now), now, bookingStartAt: null }))
    ruled(checkProposalVersion(args.expectedVersion, request.proposalVersion))
    const version = ruled(nextProposalVersion(request.proposalVersion))
    const terms = ruled(parseServiceProposal(args, now))
    if (await slotTaken(ctx, request.pageId, terms, await offerCapacityOf(ctx, request))) return refuseRule("booking_slot_unavailable")
    if (request.currentProposalId) await ctx.db.patch(request.currentProposalId, { state: "superseded", updatedAt: now })
    const proposalId = await ctx.db.insert("serviceProposals", {
      networkId: ctx.networkId,
      requestId: request._id,
      pageId: request.pageId,
      version,
      authorPersonId: ctx.person._id,
      amountMinor: terms.amountMinor,
      currency: terms.currency,
      durationMinutes: terms.durationMinutes,
      startAt: terms.startAt,
      endAt: terms.endAt,
      timeZone: terms.timeZone,
      location: terms.location,
      details: terms.details,
      cancellationTerms: terms.cancellationTerms,
      expiresAt: terms.expiresAt,
      state: "current",
      createdAt: now,
      updatedAt: now,
    })
    await ctx.db.patch(request._id, { status: "proposed", currentProposalId: proposalId, proposalVersion: version, deadlineAt: terms.expiresAt, updatedAt: now })
    // Une proposition vaut premier mot (D4) et engage les appels (D5) : le moteur l'inscrit au fil.
    await syncContextualConversation(ctx, conversationOf(request._id))
    await noticeServicePageGesture(ctx, request._id, "service_proposal_received", ctx.person._id)
    return { version }
  },
})

/** La page DÉCLINE une demande ouverte (motif facultatif) : rien n'a été convenu. */
export const refuseServiceRequest = networkMutation({
  args: { requestId: v.id("serviceRequests"), reason: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    assertDiasporaNetwork(ctx.network)
    await enforceRateLimit(ctx, "diaspora.service.respond", ctx.person._id)
    const request = await requirePageSide(ctx, args.requestId)
    const now = Date.now()
    ruled(checkServiceRequestTransition({ action: "refuse", actor: "page", status: effectiveStatusOf(request, now), now, bookingStartAt: null }))
    const reason = ruled(parseServiceReason(args.reason, false))
    await ctx.db.patch(request._id, {
      status: "refused",
      closedBy: "page",
      closedByPersonId: ctx.person._id,
      closedReason: reason ?? undefined,
      closedAt: now,
      deadlineAt: undefined,
      updatedAt: now,
    })
    await syncContextualConversation(ctx, conversationOf(request._id))
    await noticeServicePageGesture(ctx, request._id, "service_request_declined", ctx.person._id)
    return null
  },
})

/**
 * Annuler : le demandeur retire sa demande tant que rien n'est convenu ; après
 * l'accord, l'une ou l'autre partie annule le rendez-vous AVANT son début, avec
 * un motif. Aucune facturation : le motif et les conditions acceptées restent
 * lisibles des deux parties.
 */
export const cancelServiceRequest = networkMutation({
  args: { requestId: v.id("serviceRequests"), reason: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    assertDiasporaNetwork(ctx.network)
    const access = await participantOf(ctx, args.requestId)
    if (!access) return notFound()
    const { request, actor } = access
    const now = Date.now()
    const status = effectiveStatusOf(request, now)
    await enforceRateLimit(ctx, status === "confirmed" ? "diaspora.service.booking" : "diaspora.service.request", ctx.person._id)
    const booking = status === "confirmed" && request.bookingId ? await ctx.db.get(request.bookingId) : null
    ruled(checkServiceRequestTransition({ action: "cancel", actor, status, now, bookingStartAt: booking ? booking.startAt : null }))
    const reason = ruled(parseServiceReason(args.reason, status === "confirmed"))
    if (booking) await ctx.db.patch(booking._id, { status: "cancelled", closedBy: actor, reason: reason ?? undefined, reschedule: undefined, closedAt: now, updatedAt: now })
    await ctx.db.patch(request._id, {
      status: "cancelled",
      closedBy: actor,
      closedByPersonId: ctx.person._id,
      closedReason: reason ?? undefined,
      closedAt: now,
      deadlineAt: undefined,
      updatedAt: now,
    })
    await syncContextualConversation(ctx, conversationOf(request._id))
    await noticeServiceRequestCancelled(ctx, request._id, actor, ctx.person._id)
    return null
  },
})

/**
 * Le demandeur ACCEPTE la version courante, non échue : le rendez-vous naît
 * confirmé si le créneau est encore libre pour la page (contrôle
 * transactionnel). Deux acceptations sur le même créneau : une seule réussit.
 */
export const acceptServiceProposal = networkMutation({
  args: { requestId: v.id("serviceRequests"), expectedProposalVersion: v.number() },
  returns: v.object({ bookingId: v.id("serviceBookings") }),
  handler: async (ctx, args) => {
    assertDiasporaNetwork(ctx.network)
    await enforceRateLimit(ctx, "diaspora.service.booking", ctx.person._id)
    const request = await requireRequesterSide(ctx, args.requestId)
    const now = Date.now()
    ruled(checkServiceRequestTransition({ action: "accept", actor: "requester", status: effectiveStatusOf(request, now), now, bookingStartAt: null }))
    ruled(checkProposalVersion(args.expectedProposalVersion, request.proposalVersion))
    const proposal = request.currentProposalId ? await ctx.db.get(request.currentProposalId) : null
    if (!proposal || proposal.state !== "current") return refuseRule("request_not_open")
    // La page doit encore se lire d'ici : une page retirée ne prend plus de rendez-vous.
    const page = await readablePageOrNull(ctx, ctx.network, request.pageId, ctx.person._id)
    if (!page || page.networkId !== ctx.networkId) return notFound()
    // SV-09 : la capacité de la prestation à l'accord, gardée avec le rendez-vous.
    const capacity = await offerCapacityOf(ctx, request)
    if (await slotTaken(ctx, request.pageId, proposal, capacity)) return refuseRule("booking_slot_unavailable")
    const bookingId = await ctx.db.insert("serviceBookings", {
      networkId: ctx.networkId,
      requestId: request._id,
      proposalId: proposal._id,
      pageId: request.pageId,
      startAt: proposal.startAt,
      endAt: proposal.endAt,
      timeZone: proposal.timeZone,
      status: "confirmed",
      ...(capacity > 1 ? { capacity } : {}),
      createdAt: now,
      updatedAt: now,
    })
    await ctx.db.patch(request._id, { status: "confirmed", bookingId, deadlineAt: undefined, updatedAt: now })
    await syncContextualConversation(ctx, conversationOf(request._id))
    await noticeServiceProposalAccepted(ctx, request._id)
    return { bookingId }
  },
})

// ═══════════════════════════════════════════════════════════════
// Déplacer un rendez-vous confirmé (SV-03)
// ═══════════════════════════════════════════════════════════════

/**
 * Le rendez-vous d'un participant pour un geste de déplacement : la demande, son
 * rôle, le rendez-vous et l'état effectif. Le demandeur ne déplace que vers une
 * page qui se lit encore d'ici ; un signataire est relu vivant (`participantOf`).
 */
async function rescheduleScope(ctx: WriteScope, requestId: Id<"serviceRequests">) {
  const access = await participantOf(ctx, requestId)
  if (!access) return notFound()
  const { request, actor } = access
  if (actor === "requester") {
    const page = await readablePageOrNull(ctx, ctx.network, request.pageId, ctx.person._id)
    if (!page || page.networkId !== ctx.networkId) return notFound()
  }
  const booking = request.bookingId ? await ctx.db.get(request.bookingId) : null
  const now = Date.now()
  const status = effectiveStatusOf(request, now)
  const gesture = (action: "propose_reschedule" | "accept_reschedule" | "decline_reschedule") => ruled(checkServiceRescheduleGesture({
    action,
    actor,
    status,
    now,
    bookingStartAt: booking && booking.status === "confirmed" ? booking.startAt : null,
    reschedule: booking?.reschedule ?? null,
    proposalVersion: request.proposalVersion,
  }))
  return { request, actor, booking, now, gesture }
}

/**
 * Proposer un autre horaire pour un rendez-vous CONFIRMÉ, avant son début : même
 * durée, mêmes conditions. L'une ou l'autre partie propose, une seule
 * proposition à la fois ; le créneau doit être libre pour la page (capacité du
 * rendez-vous, lui-même non compté). Rien ne change tant que l'autre partie
 * n'accepte pas ; à l'échéance, le rendez-vous reste tel quel.
 * Aucun avis de cloche : le genre manque au moteur (issue [S1]) ; la demande
 * remonte en tête des listes des deux parties et sa fiche montre la proposition.
 */
export const proposeServiceReschedule = networkMutation({
  args: { requestId: v.id("serviceRequests"), expectedProposalVersion: v.number(), startAt: v.number(), timeZone: v.string(), expiresAt: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    assertDiasporaNetwork(ctx.network)
    await enforceRateLimit(ctx, "diaspora.service.booking", ctx.person._id)
    const { request, actor, booking, now, gesture } = await rescheduleScope(ctx, args.requestId)
    gesture("propose_reschedule")
    ruled(checkProposalVersion(args.expectedProposalVersion, request.proposalVersion))
    if (!booking) return refuseRule("request_not_open")
    const slot = ruled(parseServiceReschedule(args, booking, now))
    if (await slotTaken(ctx, request.pageId, slot, booking.capacity ?? 1, booking._id)) return refuseRule("booking_slot_unavailable")
    await ctx.db.patch(booking._id, { reschedule: { ...slot, proposedBy: actor, proposedAt: now }, updatedAt: now })
    await ctx.db.patch(request._id, { updatedAt: now })
    await syncContextualConversation(ctx, conversationOf(request._id))
    return null
  },
})

/**
 * L'AUTRE partie accepte le nouvel horaire LU (`expectedStartAt`), sur la version
 * lue : contrôle transactionnel du créneau, puis une NOUVELLE version de la
 * proposition (mêmes conditions, nouvel horaire, auteur inchangé : le signataire
 * qui a fait accepter les conditions) devient celle du rendez-vous, qui garde
 * son identité. Deux accords concurrents : un seul réussit. L'avis du demandeur
 * reste admissible sur le rendez-vous déplacé.
 */
export const acceptServiceReschedule = networkMutation({
  args: { requestId: v.id("serviceRequests"), expectedProposalVersion: v.number(), expectedStartAt: v.number() },
  returns: v.object({ version: v.number() }),
  handler: async (ctx, args) => {
    assertDiasporaNetwork(ctx.network)
    await enforceRateLimit(ctx, "diaspora.service.booking", ctx.person._id)
    const { request, booking, now, gesture } = await rescheduleScope(ctx, args.requestId)
    gesture("accept_reschedule")
    ruled(checkProposalVersion(args.expectedProposalVersion, request.proposalVersion))
    const pending = booking?.reschedule
    if (!booking || !pending) return refuseRule("reschedule_not_open")
    if (pending.startAt !== args.expectedStartAt) return refuseRule("reschedule_changed")
    const current = request.currentProposalId ? await ctx.db.get(request.currentProposalId) : null
    if (!current || current.state !== "current" || current._id !== booking.proposalId) return refuseRule("request_not_open")
    const version = ruled(nextProposalVersion(request.proposalVersion))
    if (await slotTaken(ctx, request.pageId, pending, booking.capacity ?? 1, booking._id)) return refuseRule("booking_slot_unavailable")
    await ctx.db.patch(current._id, { state: "superseded", updatedAt: now })
    const proposalId = await ctx.db.insert("serviceProposals", {
      networkId: ctx.networkId,
      requestId: request._id,
      pageId: request.pageId,
      version,
      authorPersonId: current.authorPersonId,
      amountMinor: current.amountMinor,
      currency: current.currency,
      durationMinutes: current.durationMinutes,
      startAt: pending.startAt,
      endAt: pending.endAt,
      timeZone: pending.timeZone,
      location: current.location,
      details: current.details,
      cancellationTerms: current.cancellationTerms,
      expiresAt: pending.expiresAt,
      state: "current",
      rescheduledFrom: current.version,
      createdAt: now,
      updatedAt: now,
    })
    await ctx.db.patch(booking._id, { proposalId, startAt: pending.startAt, endAt: pending.endAt, timeZone: pending.timeZone, reschedule: undefined, updatedAt: now })
    await ctx.db.patch(request._id, { currentProposalId: proposalId, proposalVersion: version, updatedAt: now })
    await syncContextualConversation(ctx, conversationOf(request._id))
    return { version }
  },
})

/** Décliner le nouvel horaire (l'autre partie) ou retirer le sien (le proposant) : le rendez-vous reste tel quel. */
export const declineServiceReschedule = networkMutation({
  args: { requestId: v.id("serviceRequests") },
  returns: v.null(),
  handler: async (ctx, args) => {
    assertDiasporaNetwork(ctx.network)
    await enforceRateLimit(ctx, "diaspora.service.booking", ctx.person._id)
    const { request, booking, now, gesture } = await rescheduleScope(ctx, args.requestId)
    gesture("decline_reschedule")
    if (!booking) return refuseRule("reschedule_not_open")
    await ctx.db.patch(booking._id, { reschedule: undefined, updatedAt: now })
    await ctx.db.patch(request._id, { updatedAt: now })
    await syncContextualConversation(ctx, conversationOf(request._id))
    return null
  },
})

/** Le constat de la PAGE après le début : réalisation ou absence. Jamais déduit d'un silence. */
async function closeBooking(ctx: WriteScope, requestId: Id<"serviceRequests">, action: Extract<ServiceRequestAction, "complete" | "no_show">): Promise<null> {
  assertDiasporaNetwork(ctx.network)
  await enforceRateLimit(ctx, "diaspora.service.booking", ctx.person._id)
  const request = await requirePageSide(ctx, requestId)
  const now = Date.now()
  const booking = request.bookingId ? await ctx.db.get(request.bookingId) : null
  const next = ruled(checkServiceRequestTransition({ action, actor: "page", status: effectiveStatusOf(request, now), now, bookingStartAt: booking ? booking.startAt : null }))
  const status = next === "completed" ? "completed" : "no_show"
  if (booking) await ctx.db.patch(booking._id, { status, closedBy: "page", reschedule: undefined, closedAt: now, updatedAt: now })
  await ctx.db.patch(request._id, { status, closedBy: "page", closedByPersonId: ctx.person._id, closedAt: now, updatedAt: now })
  await syncContextualConversation(ctx, conversationOf(request._id))
  await noticeServicePageGesture(ctx, request._id, status === "completed" ? "service_booking_completed" : "service_booking_no_show", ctx.person._id)
  return null
}

/** La page constate la prestation RÉALISÉE, après le début du rendez-vous. */
export const completeServiceBooking = networkMutation({
  args: { requestId: v.id("serviceRequests") },
  returns: v.null(),
  handler: async (ctx, { requestId }) => await closeBooking(ctx, requestId, "complete"),
})

/** La page constate l'ABSENCE, après le début du rendez-vous (constat contestable). */
export const markServiceNoShow = networkMutation({
  args: { requestId: v.id("serviceRequests") },
  returns: v.null(),
  handler: async (ctx, { requestId }) => await closeBooking(ctx, requestId, "no_show"),
})

/**
 * DG-015 : la personne qui demande CONTESTE l'absence que la page a déclarée, une seule fois,
 * dans les quatorze jours, avec un motif (ni coordonnée ni adresse exacte). L'état reste
 * `no_show` : rien n'est réécrit, la contestation s'ajoute, lisible des deux côtés, et rend au
 * demandeur son droit d'avis (preuve « rendez-vous confirmé »). Rejouée, elle rend la première.
 * Aucun statut n'est écrit : la conversation contextuelle reste fermée, comme l'objet.
 */
export const contestServiceNoShow = networkMutation({
  args: { requestId: v.id("serviceRequests"), reason: v.string() },
  returns: v.object({ contestedAt: v.number(), created: v.boolean() }),
  handler: async (ctx, args) => {
    assertDiasporaNetwork(ctx.network)
    await enforceRateLimit(ctx, "diaspora.service.booking", ctx.person._id)
    const request = await requireRequesterSide(ctx, args.requestId)
    const now = Date.now()
    const verdict = ruled(checkNoShowContest(noShowContestInput(request, effectiveStatusOf(request, now), now)))
    if (verdict === "already" && request.contestedAt !== undefined) return { contestedAt: request.contestedAt, created: false }
    const reason = ruled(parseServiceReason(args.reason, true))
    await ctx.db.patch(request._id, { contestedAt: now, contestReason: reason ?? undefined, updatedAt: now })
    // Avis neutre à l'équipe vivante de la page : ni motif, ni nom.
    await noticeServiceNoShowContested(ctx, request._id)
    return { contestedAt: now, created: true }
  },
})

/**
 * Passage d'expiration : écrit l'état `expired` des demandes ouvertes dont
 * l'échéance est atteinte, par lots bornés. Les lectures et les gestes le
 * constatent déjà ; ce passage garde les filtres d'état exacts. Sa
 * planification (`convex/crons.ts`) revient à la session ANTSIA.
 */
export const expireDueServiceRequests = internalMutation({
  args: { limit: v.optional(v.number()) },
  returns: v.object({ expired: v.number(), hasMore: v.boolean() }),
  handler: async (ctx, args) => {
    const now = Date.now()
    const limit = Math.min(Math.max(Math.trunc(args.limit ?? EXPIRY_BATCH_MAX), 1), EXPIRY_BATCH_MAX)
    let expired = 0
    let hasMore = false
    for (const status of SERVICE_REQUEST_OPEN_STATUSES) {
      const due = await ctx.db
        .query("serviceRequests")
        .withIndex("by_status_and_deadlineAt", (q) => q.eq("status", status).gte("deadlineAt", 0).lte("deadlineAt", now))
        .take(limit + 1)
      if (due.length > limit) hasMore = true
      for (const request of due.slice(0, limit)) {
        await ctx.db.patch(request._id, { status: "expired", closedBy: "system", closedAt: request.deadlineAt ?? now, deadlineAt: undefined, updatedAt: now })
        await syncContextualConversation(ctx, conversationOf(request._id))
        await scheduleServiceRequestExpiredNotices(ctx, request._id)
        expired += 1
      }
    }
    return { expired, hasMore }
  },
})
