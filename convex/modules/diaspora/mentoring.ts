/**
 * Mentorat bénévole DIASPORALE (DG-024, troisième tranche, lot G8 point 2).
 *
 * Être mentor est un OPT-IN explicite (consentement horodaté, révocable par le
 * retrait), jamais déduit de la facette (« disponible pour aider » ne fait de
 * personne un mentor). Le mentorat est BÉNÉVOLE : aucun tarif, aucun paiement.
 * Une demande porte un domaine, un objectif, un message sans coordonnée, zéro à
 * trois créneaux souhaités et le consentement EXPLICITE du mentoré à montrer son
 * nom et son message au mentor. Aucune conversation ici : une fois la demande
 * acceptée, le contact passe par la messagerie du moteur (ouverture à câbler par
 * ANTSIA, jamais par cette tranche).
 *
 * Gardes, dans l'ordre du moteur : adhésion (constructeurs) → éligibilité
 * (capacité du domaine) → limitation de débit (seaux `diaspora.mentor.*`) →
 * droit (le mentor sur son profil ; le mentoré ou le mentor sur LEUR demande ;
 * une demande d'autrui est introuvable) → règles de `@diasporale/domain`.
 * Retirer sa demande, décliner, clore, mettre en pause ou retirer son profil
 * restent possibles à un membre redevenu « en attente » : on sort toujours.
 *
 * Découverte bornée : seuls les profils ACTIFS de membres qui agissent
 * (« déclaré » ou « vérifié »), au profil publié et découvrable, sans blocage
 * dans la paire, sortent de la recherche ; la ville et l'année d'arrivée suivent
 * les niveaux de la facette du mentor (`memberPrivacy`). Aucune coordonnée.
 *
 * Plafonds RELUS dans la transaction (aucun compteur recopié) : mentorés actifs
 * (1 à 10, choisi par le mentor), demandes en attente d'un mentor (20) et d'un
 * mentoré (5) ; une seule demande ouverte par paire. Idempotence alignée sur le
 * contrat de commande du moteur. L'expiration (14 jours) est CONSTATÉE à la
 * lecture et à l'écriture ; le passage `expireDueMentoringRequests` l'écrit (sa
 * planification revient à ANTSIA). Aucune écriture dans `notifications`.
 *
 * Confiance (G9) : le profil de mentor (`diasporaMentorProfile`, au mentor) et la
 * demande (`diasporaMentoringRequest`, au mentoré, signalable par le mentor) sont
 * des surfaces de modération du moteur. Chaque écriture passe par
 * `moderateDiasporaWrite` (publiée dès l'écriture sauf politique explicite du
 * réseau) ; la recherche, la fiche et la boîte du mentor ne servent que ce que la
 * modération sert (`isServedTo`). Le mentor garde la vue de son profil, le mentoré
 * celle de ses demandes : ces seules vues de gestion portent l'état de modération
 * (`moderation`, relu par `managedModerationState`), jamais servi au mentor qui lit
 * une demande ni à un tiers. Une demande retirée par la modération est close par le
 * système (`moderationTargets`), aucun plafond ne reste occupé en son nom.
 */
import {
  availableMentoringActions,
  checkMentorCapacity,
  checkMentorCapacityChange,
  checkMentoringAdmission,
  checkMentoringRequestTiming,
  checkMentoringSlotVersion,
  checkMentoringTransition,
  checkMentorOptIn,
  checkMentorProfileEditable,
  checkMentorProfileVersion,
  type CountryCode,
  effectiveMentoringStatus,
  hasCapability,
  isMentoringDomain,
  isMentoringIdempotencyKey,
  matchesMentorSearch,
  type MemberCapability,
  MENTEE_OPEN_REQUESTS_MAX,
  MENTOR_CAPACITY_MAX,
  MENTOR_PENDING_REQUESTS_MAX,
  mentorAcceptsRequests,
  MENTORING_DOMAINS,
  MENTORING_REQUEST_ACTIONS,
  MENTORING_ROLES,
  mentoringRequestDeadline,
  mentoringRequestFingerprint,
  type MentoringDomain,
  type MentoringRefusal,
  type MentoringRole,
  type MentorProfileDraft,
  normalizeMentoringRequestDraft,
  parseMentoringReason,
  parseMentoringSlot,
  parseMentorProfile,
  parseMentorSearchFilters,
  parseResidenceCountry,
  projectMentorPlace,
  type Result,
  transitionMentorState,
} from "@diasporale/domain"
import { paginationOptsValidator, paginationResultValidator, type PaginationOptions, type PaginationResult } from "convex/server"
import { v } from "convex/values"

import type { Doc, Id } from "../../_generated/dataModel"
import { internalMutation, type MutationCtx, type QueryCtx } from "../../_generated/server"
import { effectiveMembershipStatus, isActiveMember, memberHasStatus } from "../../lib/access"
import { fail, failAppRule, notFound } from "../../lib/errors"
import { networkMutation, networkQuery } from "../../lib/functions"
import { enforceRateLimit } from "../../lib/rateLimit"
import { badgeValidator, literals } from "../../lib/validators"
import { openContextualConversation, syncContextualConversation } from "../contextualMessaging/hooks"
import { isBlockedBetween, isConnectedTo } from "../graph/graph"
import { isDiscoverablePerson, livePersonProfile } from "../people/miniProfile"
import { badgesOf } from "../people/persons"
import { noticeMentoringClosed, noticeMentoringDecided, noticeMentoringRequested } from "./communityNotifications"
import { assertDiasporaNetwork, effectiveStatusIn, facetOf } from "./facts"
import { isServedTo, managedModerationState, managedModerationStateValidator, moderateDiasporaWrite } from "./moderationContent"
import {
  mentoringCloserValidator,
  mentoringDomainValidator,
  mentoringProposedSlotValidator,
  mentoringRequestStatusValidator,
  mentoringSlotValidator,
  mentorProfileStateValidator,
} from "./mentoringTables"

/** Lignes au plus par page d'une liste de demandes. */
const LIST_PAGE_MAX = 50
/** Mentors au plus par page de recherche : chaque carte relit sa visibilité et ses plafonds. */
const SEARCH_PAGE_MAX = 24
/** Octets lus au plus par page : une ligne pèse quelques kilo-octets. */
const PAGE_BYTES = 1024 * 1024
/** Demandes échues écrites au plus par passage d'expiration. */
const EXPIRY_BATCH_MAX = 100
/** Lignes d'annuaire d'un profil : une par domaine au plus. */
const LISTINGS_PER_PROFILE_MAX = MENTORING_DOMAINS.length

// ═══════════════════════════════════════════════════════════════
// Projections
// ═══════════════════════════════════════════════════════════════

const mentoringRoleValidator = literals(MENTORING_ROLES)

/** Un mentor dans la recherche : ce que CE lecteur peut voir, aucune coordonnée, aucun compte de mentorés. */
const mentorCardValidator = v.object({
  mentorId: v.id("mentorProfiles"),
  personId: v.id("persons"),
  /** Le nom et l'identifiant PUBLIÉS par la personne. */
  displayName: v.string(),
  handle: v.string(),
  badges: v.array(badgeValidator),
  country: v.string(),
  /** La ville selon la visibilité de la facette du mentor, pour ce lecteur. */
  city: v.union(v.string(), v.null()),
  /** L'année d'arrivée selon la visibilité de la facette du mentor, pour ce lecteur. */
  arrivedAt: v.union(v.number(), v.null()),
  domains: v.array(mentoringDomainValidator),
  languages: v.array(v.string()),
  /** Reçoit une demande nouvelle (actif, sous son plafond, boîte non saturée) — jamais les nombres eux-mêmes. */
  acceptsRequests: v.boolean(),
})

/** La fiche d'un mentor : sa carte, sa présentation, et la demande ouverte du lecteur auprès de lui. */
const mentorDetailValidator = v.object({
  ...mentorCardValidator.fields,
  presentation: v.string(),
  availability: v.string(),
  state: mentorProfileStateValidator,
  isSelf: v.boolean(),
  viewerRequest: v.union(v.object({ requestId: v.id("mentoringRequests"), status: mentoringRequestStatusValidator }), v.null()),
})

/** Mon profil de mentor, tel que moi seul le vois : plafond et demandes en attente compris. */
const myMentorProfileValidator = v.object({
  mentorId: v.id("mentorProfiles"),
  state: mentorProfileStateValidator,
  domains: v.array(mentoringDomainValidator),
  presentation: v.string(),
  languages: v.array(v.string()),
  country: v.string(),
  city: v.union(v.string(), v.null()),
  availability: v.string(),
  maxActiveMentees: v.number(),
  activeMentees: v.number(),
  pendingRequests: v.number(),
  version: v.number(),
  optedInAt: v.number(),
  updatedAt: v.number(),
  /** G9 : l'état de modération de mon profil (publié, en relecture, retiré), à moi seul. */
  moderation: managedModerationStateValidator,
})

/** L'autre partie d'une demande : son nom publié, jamais une coordonnée. */
const partyValidator = v.object({
  displayName: v.union(v.string(), v.null()),
  handle: v.union(v.string(), v.null()),
})

const requestSummaryFields = {
  requestId: v.id("mentoringRequests"),
  /** L'état EFFECTIF (expiration constatée). */
  status: mentoringRequestStatusValidator,
  viewerRole: mentoringRoleValidator,
  mentorId: v.id("mentorProfiles"),
  /** Le mentor pour le mentoré ; le mentoré (consentement donné à l'envoi) pour le mentor. */
  counterpart: partyValidator,
  domain: mentoringDomainValidator,
  goal: v.string(),
  wishedSlots: v.array(mentoringSlotValidator),
  timeZone: v.string(),
  slot: v.union(mentoringProposedSlotValidator, v.null()),
  /** L'échéance qui court ; `null` une fois la demande acceptée ou close. */
  deadlineAt: v.union(v.number(), v.null()),
  createdAt: v.number(),
  updatedAt: v.number(),
  /** G9 : l'état de modération de la demande pour le seul mentoré, qui la porte ; `null` pour le mentor. */
  moderation: v.union(managedModerationStateValidator, v.null()),
}

const requestSummaryValidator = v.object(requestSummaryFields)

const requestDetailValidator = v.object({
  ...requestSummaryFields,
  message: v.string(),
  slotVersion: v.number(),
  acceptedAt: v.union(v.number(), v.null()),
  closedBy: v.union(mentoringCloserValidator, v.null()),
  closedReason: v.union(v.string(), v.null()),
  closedAt: v.union(v.number(), v.null()),
  /** Les gestes réellement ouverts à ce lecteur maintenant (calculés par le serveur). */
  actions: v.array(literals(MENTORING_REQUEST_ACTIONS)),
})

export type MentorCardDto = typeof mentorCardValidator.type
export type MentorDetailDto = typeof mentorDetailValidator.type
export type MyMentorProfileDto = typeof myMentorProfileValidator.type
export type MentoringRequestSummaryDto = typeof requestSummaryValidator.type
export type MentoringRequestDetailDto = typeof requestDetailValidator.type

type NetworkScope = {
  network: Doc<"networks">
  networkId: Id<"networks">
  person: Doc<"persons">
  membership: Doc<"networkMemberships">
}
type ReadScope = QueryCtx & NetworkScope
type ReadCtx = Pick<QueryCtx, "db">

/** Le texte relu par la modération (G9) : ce que le profil ou la demande montre ; jamais gardé. */
function profileText(draft: { readonly presentation: string; readonly availability: string }): string {
  return `${draft.presentation}\n${draft.availability}`
}

function requestText(draft: { readonly goal: string; readonly message: string }): string {
  return `${draft.goal}\n${draft.message}`
}

// ═══════════════════════════════════════════════════════════════
// Refus et gardes
// ═══════════════════════════════════════════════════════════════

const CONFLICT_REFUSALS: ReadonlySet<MentoringRefusal> = new Set<MentoringRefusal>([
  "mentor_profile_exists",
  "mentor_profile_version_changed",
  "mentor_capacity_below_active",
  "mentoring_pair_open",
  "mentoring_idempotency_conflict",
  "mentoring_capacity_reached",
  "mentoring_slot_version_changed",
])

const POLICY_REFUSALS: ReadonlySet<MentoringRefusal> = new Set<MentoringRefusal>([
  "mentor_profile_retired",
  "mentoring_self_request",
  "mentoring_domain_not_offered",
  "mentoring_mentee_limit",
  "mentoring_mentor_full",
  "mentoring_request_expired",
  "mentoring_request_closed",
  "mentoring_request_not_open",
  "mentoring_action_forbidden",
])

/** Un refus de la tranche, traduit par DIASPORALE (`errors.<code>`) ; une saisie invalide est `invalidArgument`. */
function refuseRule(code: MentoringRefusal): never {
  return failAppRule(code, {}, CONFLICT_REFUSALS.has(code) ? "conflict" : POLICY_REFUSALS.has(code) ? "policyRefused" : "invalidArgument")
}

function ruled<T>(result: Result<T, MentoringRefusal>): T {
  if (result.ok) return result.value
  return refuseRule(result.code)
}

/** Éligibilité : la capacité du STATUT courant (expiration d'une sanction comprise), règle du domaine. */
function assertCapability(ctx: { membership: Doc<"networkMemberships"> }, capability: MemberCapability): void {
  const status = effectiveMembershipStatus(ctx.membership)
  if (status === null || !hasCapability(status, capability)) fail("statusInsufficient")
}

function boundedPage(options: PaginationOptions, max: number): PaginationOptions {
  const requested = Number.isFinite(options.numItems) ? Math.trunc(options.numItems) : max
  return {
    ...options,
    numItems: Math.min(Math.max(requested, 1), max),
    maximumBytesRead: Math.min(options.maximumBytesRead ?? PAGE_BYTES, PAGE_BYTES),
  }
}

// ═══════════════════════════════════════════════════════════════
// Faits relus
// ═══════════════════════════════════════════════════════════════

/** Le profil de mentor d'une personne dans le réseau (tout état), ou `null`. */
async function profileOfPerson(ctx: Pick<QueryCtx, "db">, networkId: Id<"networks">, personId: Id<"persons">): Promise<Doc<"mentorProfiles"> | null> {
  return await ctx.db
    .query("mentorProfiles")
    .withIndex("by_network_and_person", (q) => q.eq("networkId", networkId).eq("personId", personId))
    .unique()
}

/** Mon profil de mentor, pour un geste : refus indistinct sans profil. */
async function requireOwnProfile(ctx: ReadScope): Promise<Doc<"mentorProfiles">> {
  const profile = await profileOfPerson(ctx, ctx.networkId, ctx.person._id)
  return profile ?? notFound()
}

/** Mentorés actifs d'un mentor, relus dans la transaction : deux acceptations concurrentes lisent la même plage. */
async function activeMenteeCount(ctx: Pick<QueryCtx, "db">, networkId: Id<"networks">, mentorPersonId: Id<"persons">): Promise<number> {
  // borné : le plafond le plus haut (dix) et une ligne témoin.
  const rows = await ctx.db
    .query("mentoringRequests")
    .withIndex("by_network_and_mentor_and_status_and_updatedAt", (q) => q.eq("networkId", networkId).eq("mentorPersonId", mentorPersonId).eq("status", "accepted"))
    .take(MENTOR_CAPACITY_MAX + 1)
  return rows.length
}

/** Demandes en attente NON échues reçues par un mentor (au plus la borne de sa boîte). */
async function pendingRequestCount(ctx: Pick<QueryCtx, "db">, networkId: Id<"networks">, mentorPersonId: Id<"persons">, now: number): Promise<number> {
  // borné : la boîte d'un mentor se ferme à vingt demandes en attente.
  const rows = await ctx.db
    .query("mentoringRequests")
    .withIndex("by_network_and_mentor_and_status_and_expiresAt", (q) => q.eq("networkId", networkId).eq("mentorPersonId", mentorPersonId).eq("status", "sent").gt("expiresAt", now))
    .take(MENTOR_PENDING_REQUESTS_MAX)
  return rows.length
}

/** Demandes en attente NON échues envoyées par un mentoré (au plus son plafond). */
async function menteeOpenCount(ctx: Pick<QueryCtx, "db">, networkId: Id<"networks">, menteePersonId: Id<"persons">, now: number): Promise<number> {
  // borné : un mentoré n'a jamais plus de cinq demandes en attente.
  const rows = await ctx.db
    .query("mentoringRequests")
    .withIndex("by_network_and_mentee_and_status_and_expiresAt", (q) => q.eq("networkId", networkId).eq("menteePersonId", menteePersonId).eq("status", "sent").gt("expiresAt", now))
    .take(MENTEE_OPEN_REQUESTS_MAX)
  return rows.length
}

/** La demande OUVERTE d'une paire mentoré → mentor : un mentorat en cours, ou une demande envoyée non échue. */
async function openPairRequest(
  ctx: Pick<QueryCtx, "db">,
  networkId: Id<"networks">,
  menteePersonId: Id<"persons">,
  mentorPersonId: Id<"persons">,
  now: number,
): Promise<Doc<"mentoringRequests"> | null> {
  const accepted = await ctx.db
    .query("mentoringRequests")
    .withIndex("by_network_and_mentee_and_mentor_and_status", (q) =>
      q.eq("networkId", networkId).eq("menteePersonId", menteePersonId).eq("mentorPersonId", mentorPersonId).eq("status", "accepted"),
    )
    .first()
  if (accepted) return accepted
  // Une demande nouvelle n'est admise que si les précédentes sont échues : la plus récente suffit.
  const sent = await ctx.db
    .query("mentoringRequests")
    .withIndex("by_network_and_mentee_and_mentor_and_status", (q) =>
      q.eq("networkId", networkId).eq("menteePersonId", menteePersonId).eq("mentorPersonId", mentorPersonId).eq("status", "sent"),
    )
    .order("desc")
    .first()
  return sent && effectiveMentoringStatus(sent, now) === "sent" ? sent : null
}

/** Le lecteur, tel que la visibilité de la facette d'un mentor le juge. */
interface MentorReader {
  readonly personId: Id<"persons">
  readonly isActiveMember: boolean
  readonly country: CountryCode | null
}

async function mentorReader(ctx: ReadScope): Promise<MentorReader> {
  const [{ status }, facet] = await Promise.all([effectiveStatusIn(ctx, ctx.network, ctx.person._id), facetOf(ctx, ctx.networkId, ctx.person._id)])
  return { personId: ctx.person._id, isActiveMember: status === "declaree" || status === "verifiee", country: facet?.countryOfResidence ?? null }
}

/**
 * Le mentor se montre-t-il à CE lecteur ? Profil publié (et découvrable, sauf
 * pour soi), membre qui agit (« déclaré » ou « vérifié », aucune sanction),
 * aucun blocage dans la paire. `null` : absent pour ce lecteur, sans distinction.
 */
async function visibleMentor(ctx: ReadScope, reader: MentorReader, profile: Doc<"mentorProfiles">): Promise<{ readonly displayName: string; readonly handle: string } | null> {
  return await visibleMentorFor(ctx, ctx.networkId, reader.personId, profile)
}

/**
 * La règle de `visibleMentor` sur des faits primitifs (réseau, lecteur), partagée
 * avec le signalement (G9). Un profil retiré par la modération, en relecture ou
 * déjà signalé par ce lecteur ne se montre plus qu'à son mentor (vue privée).
 */
async function visibleMentorFor(
  ctx: ReadCtx,
  networkId: Id<"networks">,
  readerPersonId: Id<"persons">,
  profile: Doc<"mentorProfiles">,
): Promise<{ readonly displayName: string; readonly handle: string } | null> {
  if (profile.networkId !== networkId || profile.state === "retired") return null
  const isSelf = profile.personId === readerPersonId
  const person = await livePersonProfile(ctx, profile.personId)
  if (!person || !person.handle || !person.displayName) return null
  if (!isSelf && !isDiscoverablePerson(person)) return null
  if (!isSelf && (await isBlockedBetween(ctx, readerPersonId, profile.personId))) return null
  if (!(await memberHasStatus(ctx, networkId, profile.personId, "declaree"))) return null
  if (!isSelf && !(await isServedTo(ctx, "diasporaMentorProfile", profile._id, readerPersonId))) return null
  return { displayName: person.displayName, handle: person.handle }
}

/**
 * G9 — porte commune du signalement : le profil de mentor tel que CE lecteur le
 * lit (actif pour un tiers, comme la fiche ; son propre profil non retiré pour le
 * mentor, que le moteur refuse ensuite de laisser signaler). N'importe jamais
 * `moderation/targets` (pas de cycle).
 */
export async function readableMentorProfileOrNull(
  ctx: ReadCtx,
  networkId: Id<"networks">,
  readerPersonId: Id<"persons">,
  mentorId: Id<"mentorProfiles">,
): Promise<Doc<"mentorProfiles"> | null> {
  const profile = await ctx.db.get(mentorId)
  if (!profile || profile.networkId !== networkId || profile.state === "retired") return null
  if (profile.personId !== readerPersonId && profile.state !== "active") return null
  return (await visibleMentorFor(ctx, networkId, readerPersonId, profile)) ? profile : null
}

/**
 * G9 — la demande telle que son MENTOR la lit (sa boîte) : le mentoré en est le
 * propriétaire, jamais un signaleur ; un tiers ne la lit pas. Servie par la
 * modération (ni en relecture, ni retirée, ni déjà signalée par le mentor).
 */
export async function mentoringRequestForMentorOrNull(
  ctx: ReadCtx,
  networkId: Id<"networks">,
  readerPersonId: Id<"persons">,
  requestId: Id<"mentoringRequests">,
): Promise<Doc<"mentoringRequests"> | null> {
  const request = await ctx.db.get(requestId)
  if (!request || request.networkId !== networkId || request.mentorPersonId !== readerPersonId) return null
  return (await isServedTo(ctx, "diasporaMentoringRequest", request._id, readerPersonId)) ? request : null
}

/** La carte d'un mentor pour CE lecteur, ou `null` s'il ne se montre pas à lui. */
async function mentorCardFor(ctx: ReadScope, reader: MentorReader, profile: Doc<"mentorProfiles">, now: number): Promise<MentorCardDto | null> {
  const identity = await visibleMentor(ctx, reader, profile)
  if (!identity) return null
  const isSelf = profile.personId === reader.personId
  const facet = await facetOf(ctx, ctx.networkId, profile.personId)
  const place = projectMentorPlace({
    city: profile.city ?? null,
    facet,
    viewer: {
      isSelf,
      isConnection: !isSelf && (await isConnectedTo(ctx, ctx.networkId, reader.personId, profile.personId)),
      isSameCountryMember: reader.isActiveMember && facet !== null && reader.country === facet.countryOfResidence,
      isActiveMember: reader.isActiveMember,
    },
  })
  const [activeMentees, pendingRequests] = await Promise.all([
    activeMenteeCount(ctx, ctx.networkId, profile.personId),
    pendingRequestCount(ctx, ctx.networkId, profile.personId, now),
  ])
  return {
    mentorId: profile._id,
    personId: profile.personId,
    displayName: identity.displayName,
    handle: identity.handle,
    badges: await badgesOf(ctx, profile.personId),
    country: profile.country,
    city: place.city,
    arrivedAt: place.arrivedAt,
    domains: [...profile.domains],
    languages: [...profile.languages],
    acceptsRequests: mentorAcceptsRequests({ state: profile.state, activeMentees, maxActiveMentees: profile.maxActiveMentees, pendingRequests }),
  }
}

/** Le rôle du lecteur dans une demande, ou `null` : il n'y participe pas. */
function roleOf(request: Doc<"mentoringRequests">, personId: Id<"persons">): MentoringRole | null {
  if (request.menteePersonId === personId) return "mentee"
  if (request.mentorPersonId === personId) return "mentor"
  return null
}

/** Le lecteur PARTICIPE à la demande (mentoré ou mentor) ; sinon `null`. */
async function participantOf(ctx: ReadScope, requestId: Id<"mentoringRequests">): Promise<{ request: Doc<"mentoringRequests">; role: MentoringRole } | null> {
  const request = await ctx.db.get(requestId)
  if (!request || request.networkId !== ctx.networkId) return null
  const role = roleOf(request, ctx.person._id)
  return role === null ? null : { request, role }
}

/** Le geste d'UN rôle sur sa demande : refus indistinct à tout autre. */
async function requireRole(ctx: ReadScope, requestId: Id<"mentoringRequests">, role: MentoringRole): Promise<Doc<"mentoringRequests">> {
  const access = await participantOf(ctx, requestId)
  if (!access || access.role !== role) return notFound()
  return access.request
}

async function partyOf(ctx: Pick<QueryCtx, "db">, personId: Id<"persons">): Promise<{ displayName: string | null; handle: string | null }> {
  const person = await livePersonProfile(ctx, personId)
  return { displayName: person?.displayName ?? null, handle: person?.handle ?? null }
}

async function summaryOf(ctx: ReadScope, request: Doc<"mentoringRequests">, role: MentoringRole, now: number): Promise<MentoringRequestSummaryDto> {
  const status = effectiveMentoringStatus(request, now)
  return {
    requestId: request._id,
    status,
    viewerRole: role,
    mentorId: request.mentorProfileId,
    counterpart: await partyOf(ctx, role === "mentee" ? request.mentorPersonId : request.menteePersonId),
    domain: request.domain,
    goal: request.goal,
    wishedSlots: request.wishedSlots.map((slot) => ({ startAt: slot.startAt, endAt: slot.endAt })),
    timeZone: request.timeZone,
    slot: request.slot ? { startAt: request.slot.startAt, endAt: request.slot.endAt, timeZone: request.slot.timeZone, proposedAt: request.slot.proposedAt } : null,
    deadlineAt: mentoringRequestDeadline({ status, expiresAt: request.expiresAt }),
    createdAt: request.createdAt,
    updatedAt: request.updatedAt,
    // G9 : vue de gestion du mentoré seulement ; le mentor ne lit jamais l'état d'une demande.
    moderation: role === "mentee" ? await managedModerationState(ctx, "diasporaMentoringRequest", request._id) : null,
  }
}

async function detailOf(ctx: ReadScope, request: Doc<"mentoringRequests">, role: MentoringRole, now: number): Promise<MentoringRequestDetailDto> {
  const summary = await summaryOf(ctx, request, role, now)
  return {
    ...summary,
    message: request.message,
    slotVersion: request.slotVersion,
    acceptedAt: request.acceptedAt ?? null,
    closedBy: request.closedBy ?? null,
    closedReason: request.closedReason ?? null,
    closedAt: request.closedAt ?? null,
    actions: availableMentoringActions({ role, status: summary.status }),
  }
}

// ═══════════════════════════════════════════════════════════════
// Profil : saisie et annuaire
// ═══════════════════════════════════════════════════════════════

const profileInputFields = {
  domains: v.array(v.string()),
  presentation: v.string(),
  languages: v.array(v.string()),
  country: v.string(),
  city: v.optional(v.union(v.string(), v.null())),
  availability: v.string(),
  maxActiveMentees: v.number(),
}

function profileInputOf(args: {
  domains: string[]
  presentation: string
  languages: string[]
  country: string
  city?: string | null
  availability: string
  maxActiveMentees: number
}) {
  return {
    domains: args.domains,
    presentation: args.presentation,
    languages: args.languages,
    country: args.country,
    city: args.city ?? null,
    availability: args.availability,
    maxActiveMentees: args.maxActiveMentees,
  }
}

/** Les champs saisis, tels qu'on les écrit (la ville absente n'est pas écrite). */
function draftFields(draft: MentorProfileDraft) {
  return {
    domains: [...draft.domains],
    presentation: draft.presentation,
    languages: [...draft.languages],
    country: draft.country,
    availability: draft.availability,
    maxActiveMentees: draft.maxActiveMentees,
  }
}

/** Recopie les lignes d'annuaire d'un profil : une par domaine tant qu'il n'est pas retiré, aucune ensuite. */
async function syncListings(ctx: MutationCtx, profileId: Id<"mentorProfiles">): Promise<void> {
  const profile = await ctx.db.get(profileId)
  // borné : une ligne par domaine au plus, et une ligne témoin.
  const existing = await ctx.db
    .query("mentorListings")
    .withIndex("by_mentor_profile", (q) => q.eq("mentorProfileId", profileId))
    .take(LISTINGS_PER_PROFILE_MAX + 1)
  for (const listing of existing) await ctx.db.delete(listing._id)
  if (!profile || profile.state === "retired") return
  const state = profile.state
  for (const domain of profile.domains) {
    await ctx.db.insert("mentorListings", {
      networkId: profile.networkId,
      mentorProfileId: profile._id,
      personId: profile.personId,
      state,
      country: profile.country,
      domain,
      listedAt: profile.listedAt,
    })
  }
}

/**
 * Le retrait d'un mentor : ses demandes en attente (non échues) sont déclinées,
 * ses mentorats en cours clos — rien ne reste ouvert au nom d'un opt-in révoqué.
 */
/**
 * La conversation contextuelle d'un mentorat (CC-3b, contrat CONVERSATION-CONTEXTUELLE-V1) :
 * ouverte à l'acceptation, resynchronisée après chaque autre transition, dans la même
 * transaction. Les crochets du moteur n'échouent jamais sur un refus.
 */
const conversationOf = (id: Id<"mentoringRequests">) => ({ kind: "diasporaMentoring", id }) as const

async function closeEverythingOnRetire(ctx: MutationCtx, profile: Doc<"mentorProfiles">, now: number): Promise<void> {
  // borné : la boîte d'un mentor se ferme à vingt demandes en attente non échues.
  const pending = await ctx.db
    .query("mentoringRequests")
    .withIndex("by_network_and_mentor_and_status_and_expiresAt", (q) => q.eq("networkId", profile.networkId).eq("mentorPersonId", profile.personId).eq("status", "sent").gt("expiresAt", now))
    .take(MENTOR_PENDING_REQUESTS_MAX + 1)
  for (const request of pending) {
    await ctx.db.patch(request._id, { status: "declined", closedBy: "mentor", closedAt: now, updatedAt: now })
    await syncContextualConversation(ctx, conversationOf(request._id))
    await noticeMentoringDecided(ctx, request._id)
  }
  // borné : le plafond le plus haut (dix) et une ligne témoin.
  const active = await ctx.db
    .query("mentoringRequests")
    .withIndex("by_network_and_mentor_and_status_and_updatedAt", (q) => q.eq("networkId", profile.networkId).eq("mentorPersonId", profile.personId).eq("status", "accepted"))
    .take(MENTOR_CAPACITY_MAX + 1)
  for (const request of active) {
    await ctx.db.patch(request._id, { status: "closed", closedBy: "mentor", closedAt: now, updatedAt: now })
    // Profil retiré : la conversation du mentorat se ferme avec lui (clôture système).
    await syncContextualConversation(ctx, conversationOf(request._id))
    await noticeMentoringClosed(ctx, request._id, profile.personId)
  }
}

// ═══════════════════════════════════════════════════════════════
// Lectures
// ═══════════════════════════════════════════════════════════════

/** Mon profil de mentor (tout état), avec mes mentorés actifs, mes demandes en attente et son état de modération ; `null` sans profil. */
export const myMentorProfile = networkQuery({
  args: {},
  returns: v.union(myMentorProfileValidator, v.null()),
  handler: async (ctx): Promise<MyMentorProfileDto | null> => {
    assertDiasporaNetwork(ctx.network)
    const profile = await profileOfPerson(ctx, ctx.networkId, ctx.person._id)
    if (!profile) return null
    const now = Date.now()
    const [activeMentees, pendingRequests, moderation] = await Promise.all([
      activeMenteeCount(ctx, ctx.networkId, ctx.person._id),
      pendingRequestCount(ctx, ctx.networkId, ctx.person._id, now),
      // G9 : l'état de modération de MON profil, une ligne lue par l'index de la cible.
      managedModerationState(ctx, "diasporaMentorProfile", profile._id),
    ])
    return {
      mentorId: profile._id,
      state: profile.state,
      domains: [...profile.domains],
      presentation: profile.presentation,
      languages: [...profile.languages],
      country: profile.country,
      city: profile.city ?? null,
      availability: profile.availability,
      maxActiveMentees: profile.maxActiveMentees,
      activeMentees,
      pendingRequests,
      version: profile.version,
      optedInAt: profile.optedInAt,
      updatedAt: profile.updatedAt,
      moderation,
    }
  },
})

/**
 * Chercher des mentors ACTIFS dans un pays, tous domaines ou un domaine, les
 * plus récemment listés d'abord ; ET-04 : d'une langue, d'une ville saisie (la
 * ville que CE lecteur voit : une ville cachée ne se devine pas par le filtre).
 * Une page peut être courte, voire vide, et annoncer sa suite : chaque mentor
 * est rejugé pour ce lecteur. Aucun historique de recherche n'est gardé.
 */
export const searchMentors = networkQuery({
  args: {
    country: v.string(),
    domain: v.optional(v.string()),
    /** ET-04 — une langue de la liste fermée : seuls les mentors qui la parlent. */
    language: v.optional(v.string()),
    /** ET-04 — une ville saisie (sans GPS), jugée sur ce que le lecteur voit de la ville du mentor. */
    city: v.optional(v.string()),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(mentorCardValidator),
  handler: async (ctx, args): Promise<PaginationResult<MentorCardDto>> => {
    assertDiasporaNetwork(ctx.network)
    assertCapability(ctx, "read_network")
    const parsedCountry = parseResidenceCountry(args.country)
    if (!parsedCountry.ok) return failAppRule("mentor_country_invalid", {}, "invalidArgument")
    const country: CountryCode = parsedCountry.value
    let domain: MentoringDomain | null = null
    if (args.domain !== undefined) {
      const candidate = args.domain.trim()
      if (!isMentoringDomain(candidate)) return failAppRule("mentor_domain_invalid", {}, "invalidArgument")
      domain = candidate
    }
    const parsedFilters = parseMentorSearchFilters({ language: args.language, city: args.city })
    if (!parsedFilters.ok) return failAppRule(parsedFilters.code, {}, "invalidArgument")
    const filters = parsedFilters.value
    const reader = await mentorReader(ctx)
    const now = Date.now()
    const options = boundedPage(args.paginationOpts, SEARCH_PAGE_MAX)
    const page: MentorCardDto[] = []
    /** ET-04 : la langue se juge sur le profil (aucune lecture de plus), la ville sur la carte projetée pour ce lecteur. */
    const keep = async (profile: Doc<"mentorProfiles">): Promise<void> => {
      if (filters.language !== null && !profile.languages.includes(filters.language)) return
      const card = await mentorCardFor(ctx, reader, profile, now)
      if (card && matchesMentorSearch({ languages: card.languages, visibleCity: card.city }, filters)) page.push(card)
    }
    if (domain === null) {
      const result = await ctx.db
        .query("mentorProfiles")
        .withIndex("by_network_and_state_and_country_and_listedAt", (q) => q.eq("networkId", ctx.networkId).eq("state", "active").eq("country", country))
        .order("desc")
        .paginate(options)
      for (const profile of result.page) {
        // Défense en profondeur : l'index borne déjà, chaque ligne est rejugée.
        if (profile.state !== "active" || profile.country !== country) continue
        await keep(profile)
      }
      return { ...result, page }
    }
    const wanted: MentoringDomain = domain
    const result = await ctx.db
      .query("mentorListings")
      .withIndex("by_network_and_state_and_country_and_domain_and_listedAt", (q) =>
        q.eq("networkId", ctx.networkId).eq("state", "active").eq("country", country).eq("domain", wanted),
      )
      .order("desc")
      .paginate(options)
    for (const listing of result.page) {
      const profile = await ctx.db.get(listing.mentorProfileId)
      if (!profile || profile.state !== "active" || profile.country !== country || !profile.domains.includes(wanted)) continue
      await keep(profile)
    }
    return { ...result, page }
  },
})

/**
 * La fiche d'un mentor : un profil ACTIF qui se montre à ce lecteur, ou son
 * propre profil non retiré. Sinon, le même `null` : inconnu, d'ailleurs, en
 * pause, retiré ou bloqué ne se distinguent pas.
 */
export const getMentorProfile = networkQuery({
  args: { mentorId: v.string() },
  returns: v.union(mentorDetailValidator, v.null()),
  handler: async (ctx, args): Promise<MentorDetailDto | null> => {
    assertDiasporaNetwork(ctx.network)
    assertCapability(ctx, "read_network")
    const mentorId = ctx.db.normalizeId("mentorProfiles", args.mentorId)
    if (mentorId === null) return null
    const profile = await ctx.db.get(mentorId)
    if (!profile || profile.networkId !== ctx.networkId || profile.state === "retired") return null
    const isSelf = profile.personId === ctx.person._id
    if (!isSelf && profile.state !== "active") return null
    const now = Date.now()
    const card = await mentorCardFor(ctx, await mentorReader(ctx), profile, now)
    if (!card) return null
    const open = isSelf ? null : await openPairRequest(ctx, ctx.networkId, ctx.person._id, profile.personId, now)
    return {
      ...card,
      presentation: profile.presentation,
      availability: profile.availability,
      state: profile.state,
      isSelf,
      viewerRequest: open ? { requestId: open._id, status: effectiveMentoringStatus(open, now) } : null,
    }
  },
})

/** Mes demandes de mentorat (comme mentoré), des plus récemment mises à jour : les miennes seulement, avec leur état de modération. */
export const menteeMentoringRequests = networkQuery({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(requestSummaryValidator),
  handler: async (ctx, { paginationOpts }): Promise<PaginationResult<MentoringRequestSummaryDto>> => {
    assertDiasporaNetwork(ctx.network)
    const result = await ctx.db
      .query("mentoringRequests")
      .withIndex("by_network_and_mentee_and_updatedAt", (q) => q.eq("networkId", ctx.networkId).eq("menteePersonId", ctx.person._id))
      .order("desc")
      .paginate(boundedPage(paginationOpts, LIST_PAGE_MAX))
    const now = Date.now()
    const page: MentoringRequestSummaryDto[] = []
    for (const request of result.page) page.push(await summaryOf(ctx, request, "mentee", now))
    return { ...result, page }
  },
})

/**
 * Les demandes reçues (comme mentor), toutes ou par état. Un filtre d'état
 * montre l'état EFFECTIF : une demande échue sort des demandes en attente avant
 * même que le passage d'expiration l'écrive.
 */
export const mentorMentoringRequests = networkQuery({
  args: { status: v.optional(mentoringRequestStatusValidator), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(requestSummaryValidator),
  handler: async (ctx, args): Promise<PaginationResult<MentoringRequestSummaryDto>> => {
    assertDiasporaNetwork(ctx.network)
    const status = args.status
    const options = boundedPage(args.paginationOpts, LIST_PAGE_MAX)
    const result =
      status === undefined
        ? await ctx.db
            .query("mentoringRequests")
            .withIndex("by_network_and_mentor_and_updatedAt", (q) => q.eq("networkId", ctx.networkId).eq("mentorPersonId", ctx.person._id))
            .order("desc")
            .paginate(options)
        : await ctx.db
            .query("mentoringRequests")
            .withIndex("by_network_and_mentor_and_status_and_updatedAt", (q) => q.eq("networkId", ctx.networkId).eq("mentorPersonId", ctx.person._id).eq("status", status))
            .order("desc")
            .paginate(options)
    const now = Date.now()
    const page: MentoringRequestSummaryDto[] = []
    for (const request of result.page) {
      // G9 : la boîte du mentor ne sert que ce que la modération sert (ni en relecture, ni retirée, ni signalée par lui).
      if (!(await isServedTo(ctx, "diasporaMentoringRequest", request._id, ctx.person._id))) continue
      const summary = await summaryOf(ctx, request, "mentor", now)
      if (status === undefined || summary.status === status) page.push(summary)
    }
    return { ...result, page }
  },
})

/** Une demande, pour ses deux parties seulement ; `null` pour tout autre. Son état de modération va au seul mentoré. */
export const getMentoringRequest = networkQuery({
  args: { requestId: v.id("mentoringRequests") },
  returns: v.union(requestDetailValidator, v.null()),
  handler: async (ctx, { requestId }): Promise<MentoringRequestDetailDto | null> => {
    assertDiasporaNetwork(ctx.network)
    const access = await participantOf(ctx, requestId)
    if (!access) return null
    // G9 : le mentoré garde la vue de sa demande ; le mentor, ce que la modération lui sert.
    if (access.role === "mentor" && !(await isServedTo(ctx, "diasporaMentoringRequest", access.request._id, ctx.person._id))) return null
    return await detailOf(ctx, access.request, access.role, Date.now())
  },
})

// ═══════════════════════════════════════════════════════════════
// Écritures : le profil de mentor
// ═══════════════════════════════════════════════════════════════

/**
 * Devenir mentor : un consentement EXPLICITE (`consent`), un profil complet.
 * Après un retrait, le même profil revit par ce nouvel opt-in (version
 * suivante) ; jamais par-dessus un profil actif ou en pause.
 */
export const becomeMentor = networkMutation({
  minStatus: "declaree",
  args: { ...profileInputFields, consent: v.boolean() },
  returns: v.object({ mentorId: v.id("mentorProfiles"), version: v.number() }),
  handler: async (ctx, args) => {
    assertDiasporaNetwork(ctx.network)
    assertCapability(ctx, "publish")
    await enforceRateLimit(ctx, "diaspora.mentor.profile", ctx.person._id)
    const draft = ruled(parseMentorProfile(profileInputOf(args)))
    const existing = await profileOfPerson(ctx, ctx.networkId, ctx.person._id)
    ruled(checkMentorOptIn({ consent: args.consent, existing: existing?.state ?? null }))
    const now = Date.now()
    if (existing) {
      // G9 : un profil retiré par la modération ne revit pas par un nouvel opt-in.
      await moderateDiasporaWrite(ctx, { networkId: ctx.networkId, kind: "diasporaMentorProfile", id: existing._id, text: profileText(draft), owner: { personId: ctx.person._id } })
      const version = existing.version + 1
      await ctx.db.patch(existing._id, {
        ...draftFields(draft),
        city: draft.city ?? undefined,
        state: "active",
        version,
        optedInAt: now,
        listedAt: now,
        pausedAt: undefined,
        retiredAt: undefined,
        updatedAt: now,
      })
      await syncListings(ctx, existing._id)
      return { mentorId: existing._id, version }
    }
    const mentorId = await ctx.db.insert("mentorProfiles", {
      networkId: ctx.networkId,
      personId: ctx.person._id,
      ...draftFields(draft),
      ...(draft.city !== null ? { city: draft.city } : {}),
      state: "active",
      version: 1,
      optedInAt: now,
      listedAt: now,
      createdAt: now,
      updatedAt: now,
    })
    await moderateDiasporaWrite(ctx, { networkId: ctx.networkId, kind: "diasporaMentorProfile", id: mentorId, text: profileText(draft), owner: { personId: ctx.person._id } })
    await syncListings(ctx, mentorId)
    return { mentorId, version: 1 }
  },
})

/**
 * Modifier mon profil (non retiré) à la version lue ; le plafond ne descend
 * jamais sous mes mentorés actifs. Toute modification incrémente la version.
 */
export const updateMentorProfile = networkMutation({
  minStatus: "declaree",
  args: { expectedVersion: v.number(), ...profileInputFields },
  returns: v.object({ version: v.number() }),
  handler: async (ctx, args) => {
    assertDiasporaNetwork(ctx.network)
    assertCapability(ctx, "publish")
    await enforceRateLimit(ctx, "diaspora.mentor.profile", ctx.person._id)
    const profile = await requireOwnProfile(ctx)
    ruled(checkMentorProfileEditable(profile.state))
    const version = ruled(checkMentorProfileVersion(args.expectedVersion, profile.version))
    const draft = ruled(parseMentorProfile(profileInputOf(args)))
    ruled(checkMentorCapacityChange(draft.maxActiveMentees, await activeMenteeCount(ctx, ctx.networkId, ctx.person._id)))
    // G9 : un profil retiré par la modération ne se modifie plus ; sinon la modification est relue comme une écriture.
    await moderateDiasporaWrite(ctx, { networkId: ctx.networkId, kind: "diasporaMentorProfile", id: profile._id, text: profileText(draft), owner: { personId: ctx.person._id } })
    await ctx.db.patch(profile._id, { ...draftFields(draft), city: draft.city ?? undefined, version, updatedAt: Date.now() })
    await syncListings(ctx, profile._id)
    return { version }
  },
})

/**
 * Mettre en pause, reprendre ou retirer mon profil. L'état demandé déjà
 * courant ne change rien ; sinon la version lue est exigée et incrémentée.
 * Pause et retrait restent possibles à un membre redevenu « en attente » ; la
 * reprise exige le droit de publier. Le retrait décline les demandes en
 * attente et clôt les mentorats en cours.
 */
export const setMentorState = networkMutation({
  minStatus: "en_attente",
  args: { expectedVersion: v.number(), state: mentorProfileStateValidator },
  returns: v.object({ state: mentorProfileStateValidator, version: v.number() }),
  handler: async (ctx, args) => {
    assertDiasporaNetwork(ctx.network)
    if (args.state === "active") assertCapability(ctx, "publish")
    await enforceRateLimit(ctx, "diaspora.mentor.profile", ctx.person._id)
    const profile = await requireOwnProfile(ctx)
    const next = ruled(transitionMentorState(profile.state, args.state))
    if (!next.changed) return { state: profile.state, version: profile.version }
    const version = ruled(checkMentorProfileVersion(args.expectedVersion, profile.version))
    const now = Date.now()
    if (next.state === "retired") await closeEverythingOnRetire(ctx, profile, now)
    await ctx.db.patch(profile._id, {
      state: next.state,
      version,
      pausedAt: next.state === "paused" ? now : undefined,
      retiredAt: next.state === "retired" ? now : undefined,
      updatedAt: now,
    })
    await syncListings(ctx, profile._id)
    return { state: next.state, version }
  },
})

// ═══════════════════════════════════════════════════════════════
// Écritures : les demandes
// ═══════════════════════════════════════════════════════════════

/**
 * Demander un mentorat à un mentor ACTIF qui se montre à moi : consentement
 * explicite à montrer mon nom et mon message, domaine proposé par le mentor,
 * une seule demande ouverte par paire, plafonds tenus. Idempotent : même clé et
 * même corps rendent la demande déjà créée.
 */
export const requestMentoring = networkMutation({
  minStatus: "declaree",
  args: {
    mentorId: v.id("mentorProfiles"),
    domain: v.string(),
    goal: v.string(),
    message: v.string(),
    wishedSlots: v.array(mentoringSlotValidator),
    timeZone: v.string(),
    shareWithMentor: v.boolean(),
    idempotencyKey: v.string(),
  },
  returns: v.object({ requestId: v.id("mentoringRequests"), created: v.boolean() }),
  handler: async (ctx, args) => {
    assertDiasporaNetwork(ctx.network)
    assertCapability(ctx, "publish")
    await enforceRateLimit(ctx, "diaspora.mentor.request", ctx.person._id)
    if (!isMentoringIdempotencyKey(args.idempotencyKey)) return fail("invalidArgument", { field: "idempotencyKey" })
    const draft = ruled(normalizeMentoringRequestDraft(args))
    const fingerprint = mentoringRequestFingerprint({ mentorId: args.mentorId, ...draft })
    // Rejeu AVANT les gardes du mentor et de l'heure : la demande déjà créée est la réponse.
    const replay = await ctx.db
      .query("mentoringRequests")
      .withIndex("by_network_and_mentee_and_idempotencyKey", (q) =>
        q.eq("networkId", ctx.networkId).eq("menteePersonId", ctx.person._id).eq("idempotencyKey", args.idempotencyKey),
      )
      .unique()
    if (replay) return replay.idempotencyFingerprint === fingerprint ? { requestId: replay._id, created: false } : refuseRule("mentoring_idempotency_conflict")
    if (!args.shareWithMentor) return refuseRule("mentoring_consent_required")
    const profile = await ctx.db.get(args.mentorId)
    if (!profile || profile.networkId !== ctx.networkId) return notFound()
    if (profile.personId === ctx.person._id) return refuseRule("mentoring_self_request")
    if (profile.state !== "active") return notFound()
    if (!(await visibleMentor(ctx, await mentorReader(ctx), profile))) return notFound()
    const now = Date.now()
    const [pair, menteeOpen, activeMentees, pendingRequests] = await Promise.all([
      openPairRequest(ctx, ctx.networkId, ctx.person._id, profile.personId, now),
      menteeOpenCount(ctx, ctx.networkId, ctx.person._id, now),
      activeMenteeCount(ctx, ctx.networkId, profile.personId),
      pendingRequestCount(ctx, ctx.networkId, profile.personId, now),
    ])
    ruled(
      checkMentoringAdmission({
        isSelf: false,
        domainOffered: profile.domains.includes(draft.domain),
        pairOpen: pair !== null,
        menteeOpenRequests: menteeOpen,
        mentorAccepts: mentorAcceptsRequests({ state: profile.state, activeMentees, maxActiveMentees: profile.maxActiveMentees, pendingRequests }),
      }),
    )
    const { expiresAt } = ruled(checkMentoringRequestTiming(draft, now))
    const requestId = await ctx.db.insert("mentoringRequests", {
      networkId: ctx.networkId,
      mentorProfileId: profile._id,
      mentorPersonId: profile.personId,
      menteePersonId: ctx.person._id,
      domain: draft.domain,
      goal: draft.goal,
      message: draft.message,
      wishedSlots: draft.wishedSlots.map((slot) => ({ startAt: slot.startAt, endAt: slot.endAt })),
      timeZone: draft.timeZone,
      status: "sent",
      consentAt: now,
      idempotencyKey: args.idempotencyKey,
      idempotencyFingerprint: fingerprint,
      expiresAt,
      slotVersion: 0,
      createdAt: now,
      updatedAt: now,
    })
    // G9 : la demande appartient au mentoré ; relue comme une écriture (publiée sauf politique explicite du réseau).
    const moderation = await moderateDiasporaWrite(ctx, { networkId: ctx.networkId, kind: "diasporaMentoringRequest", id: requestId, text: requestText(draft), owner: { personId: ctx.person._id } })
    // Avis neutre au mentor ; une demande en relecture n'annonce rien.
    if (moderation === "published") await noticeMentoringRequested(ctx, requestId)
    return { requestId, created: true }
  },
})

/** Le mentoré RETIRE sa demande tant qu'elle attend une réponse (motif facultatif). */
export const cancelMentoringRequest = networkMutation({
  minStatus: "en_attente",
  args: { requestId: v.id("mentoringRequests"), reason: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    assertDiasporaNetwork(ctx.network)
    await enforceRateLimit(ctx, "diaspora.mentor.request", ctx.person._id)
    const request = await requireRole(ctx, args.requestId, "mentee")
    const now = Date.now()
    ruled(checkMentoringTransition({ action: "cancel", role: "mentee", status: effectiveMentoringStatus(request, now) }))
    const reason = ruled(parseMentoringReason(args.reason))
    await ctx.db.patch(request._id, { status: "cancelled", closedBy: "mentee", closedReason: reason ?? undefined, closedAt: now, updatedAt: now })
    await syncContextualConversation(ctx, conversationOf(request._id))
    return null
  },
})

/**
 * Le mentor ACCEPTE une demande en attente, non échue : le plafond de mentorés
 * actifs se relit DANS la transaction (deux acceptations concurrentes ne le
 * dépassent jamais). Un créneau peut être proposé dans le même geste.
 */
export const acceptMentoringRequest = networkMutation({
  minStatus: "declaree",
  args: {
    requestId: v.id("mentoringRequests"),
    slot: v.optional(v.object({ startAt: v.number(), endAt: v.number(), timeZone: v.string() })),
  },
  returns: v.object({ slotVersion: v.number() }),
  handler: async (ctx, args) => {
    assertDiasporaNetwork(ctx.network)
    assertCapability(ctx, "publish")
    await enforceRateLimit(ctx, "diaspora.mentor.respond", ctx.person._id)
    const request = await requireRole(ctx, args.requestId, "mentor")
    // G9 : une demande en relecture ou retirée par la modération ne s'accepte pas (le mentor ne la lit pas).
    if (!(await isServedTo(ctx, "diasporaMentoringRequest", request._id, ctx.person._id))) return notFound()
    const now = Date.now()
    ruled(checkMentoringTransition({ action: "accept", role: "mentor", status: effectiveMentoringStatus(request, now) }))
    const profile = await ctx.db.get(request.mentorProfileId)
    if (!profile || profile.networkId !== ctx.networkId || profile.personId !== ctx.person._id || profile.state === "retired") return notFound()
    // Le mentoré doit encore être membre, et aucun blocage ne doit exister dans la paire.
    if (!(await isActiveMember(ctx, ctx.networkId, request.menteePersonId))) return notFound()
    if (await isBlockedBetween(ctx, request.menteePersonId, ctx.person._id)) return notFound()
    ruled(checkMentorCapacity(await activeMenteeCount(ctx, ctx.networkId, ctx.person._id), profile.maxActiveMentees))
    const slot = args.slot ? ruled(parseMentoringSlot(args.slot, now)) : null
    const slotVersion = slot ? 1 : 0
    await ctx.db.patch(request._id, {
      status: "accepted",
      acceptedAt: now,
      ...(slot ? { slot: { startAt: slot.startAt, endAt: slot.endAt, timeZone: slot.timeZone, proposedAt: now } } : {}),
      slotVersion,
      updatedAt: now,
    })
    // CC-3b : la conversation du mentorat naît à l'acceptation ; aucun appel ne sonne (D5).
    await openContextualConversation(ctx, conversationOf(request._id))
    await noticeMentoringDecided(ctx, request._id)
    return { slotVersion }
  },
})

/** Le mentor DÉCLINE une demande en attente (motif facultatif) : rien n'a été convenu. */
export const declineMentoringRequest = networkMutation({
  minStatus: "en_attente",
  args: { requestId: v.id("mentoringRequests"), reason: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    assertDiasporaNetwork(ctx.network)
    await enforceRateLimit(ctx, "diaspora.mentor.respond", ctx.person._id)
    const request = await requireRole(ctx, args.requestId, "mentor")
    const now = Date.now()
    ruled(checkMentoringTransition({ action: "decline", role: "mentor", status: effectiveMentoringStatus(request, now) }))
    const reason = ruled(parseMentoringReason(args.reason))
    await ctx.db.patch(request._id, { status: "declined", closedBy: "mentor", closedReason: reason ?? undefined, closedAt: now, updatedAt: now })
    await syncContextualConversation(ctx, conversationOf(request._id))
    await noticeMentoringDecided(ctx, request._id)
    return null
  },
})

/**
 * Le mentor propose (ou change) un créneau d'un mentorat en cours, à la version
 * lue du créneau (second onglet). Un créneau est une proposition : la réponse
 * passe par la messagerie.
 */
export const proposeMentoringSlot = networkMutation({
  minStatus: "declaree",
  args: {
    requestId: v.id("mentoringRequests"),
    expectedSlotVersion: v.number(),
    startAt: v.number(),
    endAt: v.number(),
    timeZone: v.string(),
  },
  returns: v.object({ slotVersion: v.number() }),
  handler: async (ctx, args) => {
    assertDiasporaNetwork(ctx.network)
    assertCapability(ctx, "publish")
    await enforceRateLimit(ctx, "diaspora.mentor.respond", ctx.person._id)
    const request = await requireRole(ctx, args.requestId, "mentor")
    const now = Date.now()
    ruled(checkMentoringTransition({ action: "propose_slot", role: "mentor", status: effectiveMentoringStatus(request, now) }))
    if (await isBlockedBetween(ctx, request.menteePersonId, ctx.person._id)) return notFound()
    const slotVersion = ruled(checkMentoringSlotVersion(args.expectedSlotVersion, request.slotVersion))
    const slot = ruled(parseMentoringSlot({ startAt: args.startAt, endAt: args.endAt, timeZone: args.timeZone }, now))
    await ctx.db.patch(request._id, {
      slot: { startAt: slot.startAt, endAt: slot.endAt, timeZone: slot.timeZone, proposedAt: now },
      slotVersion,
      updatedAt: now,
    })
    return { slotVersion }
  },
})

/** Clore un mentorat en cours : l'un ou l'autre, motif facultatif ; la place du mentor se libère. */
export const closeMentorship = networkMutation({
  minStatus: "en_attente",
  args: { requestId: v.id("mentoringRequests"), reason: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    assertDiasporaNetwork(ctx.network)
    await enforceRateLimit(ctx, "diaspora.mentor.respond", ctx.person._id)
    const access = await participantOf(ctx, args.requestId)
    if (!access) return notFound()
    const { request, role } = access
    const now = Date.now()
    ruled(checkMentoringTransition({ action: "close", role, status: effectiveMentoringStatus(request, now) }))
    const reason = ruled(parseMentoringReason(args.reason))
    await ctx.db.patch(request._id, { status: "closed", closedBy: role, closedReason: reason ?? undefined, closedAt: now, updatedAt: now })
    await syncContextualConversation(ctx, conversationOf(request._id))
    await noticeMentoringClosed(ctx, request._id, ctx.person._id)
    return null
  },
})

/**
 * Passage d'expiration : écrit l'état `expired` des demandes en attente dont
 * l'échéance est atteinte, par lots bornés. Les lectures et les gestes le
 * constatent déjà ; ce passage garde les filtres d'état exacts. Sa
 * planification (`convex/crons.ts`) revient à la session ANTSIA.
 */
export const expireDueMentoringRequests = internalMutation({
  args: { limit: v.optional(v.number()) },
  returns: v.object({ expired: v.number(), hasMore: v.boolean() }),
  handler: async (ctx, args) => {
    const now = Date.now()
    const requested = args.limit !== undefined && Number.isFinite(args.limit) ? Math.trunc(args.limit) : EXPIRY_BATCH_MAX
    const limit = Math.min(Math.max(requested, 1), EXPIRY_BATCH_MAX)
    const due = await ctx.db
      .query("mentoringRequests")
      .withIndex("by_status_and_expiresAt", (q) => q.eq("status", "sent").lte("expiresAt", now))
      .take(limit + 1)
    const batch = due.slice(0, limit)
    for (const request of batch) {
      await ctx.db.patch(request._id, { status: "expired", closedBy: "system", closedAt: request.expiresAt, updatedAt: now })
      // Jamais ouverte : la synchronisation ne crée rien, elle garde le cliquet des crochets exact.
      await syncContextualConversation(ctx, conversationOf(request._id))
    }
    return { expired: batch.length, hasMore: due.length > limit }
  },
})
