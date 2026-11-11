/**
 * Talents et emploi DIASPORALE (DG-025, plan global §G8 point 4) — tranche
 * `diaspora`, écrite par la session DIASPORALE (chantier « talents et emploi »).
 *
 * Trois objets, trois frontières :
 *   · l'OFFRE appartient à une PAGE (entreprise ou association) ; ses
 *     signataires VIVANTS la gèrent, relus à chaque acte (`liveSignatoryRole`) ;
 *     seules les offres effectivement OUVERTES d'une page lisible se lisent ;
 *   · la CANDIDATURE est PRIVÉE : la personne qui candidate et l'équipe vivante
 *     de la page, personne d'autre. Elle exige le consentement explicite à
 *     transmettre son nom publié ; le motif de non-sélection reste une note de
 *     l'équipe, jamais montrée à la personne qui candidate ;
 *   · le PROFIL DE TALENT est un opt-in révocable (masquer, supprimer), visible
 *     dans le réseau seulement, cherché par pays et compétence, page par page
 *     sous un plafond strict — aucune liste exportable, aucun tri par donnée
 *     sensible, aucune coordonnée : le contact passera par la messagerie.
 *
 * Gardes, dans cet ordre, pour chaque écriture : adhésion au réseau DIASPORALE
 * (constructeur) → éligibilité (capacité du domaine) → débit (seaux
 * `diaspora.job.*`, `diaspora.talent.profile`) → droit (page active du réseau,
 * signataire vivant, nature admise ; ou personne qui candidate) → règles du
 * domaine (`@diasporale/domain`, codes fermés). Un objet d'autrui, d'un autre
 * réseau ou illisible rend le refus indistinct (`notFound`).
 *
 * Aucune écriture dans `notifications` (rédacteur unique du moteur) ; aucune
 * conversation ouverte ici. Le passage `closeExpiredJobOffers` écrit la
 * clôture des offres échues ; sa planification revient à ANTSIA.
 *
 * Confiance (G9) : l'offre (`diasporaJobOffer`, contenu de la PAGE), le profil de
 * talent (`diasporaTalentProfile`, à la personne) et la candidature
 * (`diasporaJobApplication`, à la personne qui candidate, signalable par l'équipe
 * VIVANTE de la page seulement) sont des surfaces de modération du moteur.
 * Chaque écriture passe par `moderateDiasporaWrite` (publiée dès l'écriture sauf
 * politique explicite du réseau) ; recherche, fiche, candidature et boîte de
 * l'équipe ne servent que ce que la modération sert (`isServedTo`). L'équipe garde
 * la gestion des offres de sa page, la personne la vue de ses candidatures et de
 * son profil ; une écriture sur un contenu retiré est refusée. Ces seules vues de
 * GESTION portent l'état de modération (`moderation`, `managedModerationState`) :
 * les offres pour l'équipe vivante de leur page (`pageJobOffers`, fiche de
 * l'équipe), la candidature et le profil pour leur personne propriétaire ; aucune
 * autre projection ne le sert (`null` dans la fiche d'un autre lecteur).
 */
import {
  availableJobApplicationActions,
  checkJobDeadline,
  checkJobOfferVersion,
  checkTalentProfileVersion,
  clampJobPageSize,
  effectiveJobOfferStatus,
  hasCapability,
  initialJobOfferStatus,
  isJobEmployerOwnerKind,
  isJobIdempotencyKey,
  isJobOfferEditable,
  isJobOfferOpen,
  isTalentAttachable,
  isTalentListed,
  JOB_APPLICATION_ACTIONS,
  JOB_APPLICATIONS_PAGE_MAX,
  JOB_OFFER_STATUS_TARGETS,
  JOB_OFFERS_PER_PAGE_MAX,
  JOB_SEARCH_PAGE_MAX,
  jobApplicationFingerprint,
  jobOfferPublishedAt,
  matchesJobFilters,
  normalizeJobApplication,
  parseJobDecisionReason,
  parseJobOffer,
  parseJobSearch,
  parseTalentProfile,
  parseTalentSearch,
  TALENT_SEARCH_PAGE_MAX,
  talentShortName,
  transitionJobApplication,
  transitionJobOffer,
  type JobApplicationAction,
  type JobApplicationStatus,
  type JobOfferDraft,
  type JobRefusal,
  type JobSearchFilters,
  type MemberCapability,
  type MoneyRefusal,
  type Result,
} from "@diasporale/domain"
import { type PaginationOptions, paginationOptsValidator, paginationResultValidator, type PaginationResult } from "convex/server"
import { type Infer, v } from "convex/values"

import type { Doc, Id } from "../../_generated/dataModel"
import { internalMutation, type MutationCtx, type QueryCtx } from "../../_generated/server"
import { effectiveMembershipStatus, getMembership, isActiveMember } from "../../lib/access"
import { fail, failAppRule, notFound } from "../../lib/errors"
import { networkMutation, networkQuery } from "../../lib/functions"
import { enforceRateLimit } from "../../lib/rateLimit"
import { literals } from "../../lib/validators"
import { openContextualConversation, syncContextualConversation } from "../contextualMessaging/hooks"
import { isBlockedBetween } from "../graph/graph"
import { liveSignatoryRole, pageCardOf, readablePageOrNull } from "../pages/access"
import { type PageCard, pageCardValidator } from "../pages/validators"
import { isDiscoverablePerson, livePersonProfile } from "../people/miniProfile"
import { noticeJobApplicationDecided, noticeJobApplicationReceived } from "./communityNotifications"
import { assertDiasporaNetwork, assertPageOpenTo } from "./facts"
import {
  isRemovedByModeration,
  isServedTo,
  type ManagedModerationState,
  managedModerationState,
  managedModerationStateValidator,
  moderateDiasporaWrite,
} from "./moderationContent"
import {
  jobApplicationStatusValidator,
  jobContractValidator,
  jobLanguageValidator,
  jobOfferStatusValidator,
  jobPayRangeValidator,
  jobWorkModeValidator,
  talentAvailabilityValidator,
  talentProfileStatusValidator,
  talentVisibilityValidator,
} from "./jobsTables"

/** Lignes d'une page de « mes offres » (tous états) : plafond dur. */
const MANAGED_PAGE_MAX = 50
/** Octets lus au plus par page de résultats : une offre ou une candidature pèse quelques kilo-octets. */
const PAGE_BYTES = 1024 * 1024
/** Offres échues écrites au plus par passage d'expiration, par état. */
const EXPIRY_BATCH_MAX = 100

// ═══════════════════════════════════════════════════════════════
// Projections (allowlistées : ce qui n'y figure pas ne sort pas)
// ═══════════════════════════════════════════════════════════════

/** Une offre : ses champs et la CARTE de sa page (badge calculé), aucune identité de signataire ni coordonnée. */
const jobOfferCardValidator = v.object({
  jobId: v.id("jobOffers"),
  /** La version lue : une candidature la cite, une modification l'attend. */
  version: v.number(),
  title: v.string(),
  description: v.string(),
  contract: jobContractValidator,
  country: v.string(),
  city: v.union(v.string(), v.null()),
  workMode: jobWorkModeValidator,
  languages: v.array(jobLanguageValidator),
  payRange: v.union(jobPayRangeValidator, v.null()),
  closesAt: v.union(v.number(), v.null()),
  publishedAt: v.number(),
  updatedAt: v.number(),
  page: pageCardValidator,
})

/** Ma candidature à cette offre, si j'en ai une : son identifiant et son état, rien d'autre. */
const myApplicationRefValidator = v.object({
  applicationId: v.id("jobApplications"),
  status: jobApplicationStatusValidator,
})

/** La fiche d'une offre : sa carte, son état EFFECTIF, la gestion (signataire vivant) et ma candidature. */
const jobOfferDetailValidator = v.object({
  ...jobOfferCardValidator.fields,
  status: jobOfferStatusValidator,
  viewerCanManage: v.boolean(),
  /** G9 : l'état de modération de l'offre, pour l'équipe vivante de sa page seulement ; `null` à tout autre lecteur. */
  moderation: v.union(managedModerationStateValidator, v.null()),
  myApplication: v.union(myApplicationRefValidator, v.null()),
})

/** Le profil de talent JOINT à une candidature, relu vivant : ce que la personne a choisi de montrer. */
const talentSummaryValidator = v.object({
  title: v.string(),
  skills: v.array(v.string()),
  availability: talentAvailabilityValidator,
  languages: v.array(jobLanguageValidator),
  country: v.string(),
})

/** Ma candidature, vue par moi : jamais le motif de l'équipe, jamais qui a décidé. */
const myApplicationValidator = v.object({
  applicationId: v.id("jobApplications"),
  status: jobApplicationStatusValidator,
  jobId: v.id("jobOffers"),
  /** Le titre et la version de l'offre lus au moment de candidater. */
  offerTitle: v.string(),
  offerVersion: v.number(),
  /** L'offre reçoit-elle encore des candidatures (lue maintenant) ? */
  offerOpen: v.boolean(),
  /** La page, si elle se lit encore d'ici ; `null` sinon. */
  page: v.union(pageCardValidator, v.null()),
  message: v.string(),
  sharedTalentProfile: v.boolean(),
  createdAt: v.number(),
  updatedAt: v.number(),
  /** Les gestes réellement ouverts à la personne qui candidate (calculés par le serveur). */
  actions: v.array(literals(JOB_APPLICATION_ACTIONS)),
  /** G9 : l'état de modération de MA candidature, lu par sa personne propriétaire ; l'équipe de la page ne le voit jamais. */
  moderation: managedModerationStateValidator,
})

/** La personne qui candidate, vue par l'équipe de la page (consentement explicite) : nom publié, jamais une coordonnée. */
const candidateLabelValidator = v.object({
  displayName: v.union(v.string(), v.null()),
  handle: v.union(v.string(), v.null()),
})

/** Une candidature reçue, pour les signataires vivants : retirée, elle ne montre plus rien de la personne. */
const receivedApplicationValidator = v.object({
  applicationId: v.id("jobApplications"),
  jobId: v.id("jobOffers"),
  status: jobApplicationStatusValidator,
  offerVersion: v.number(),
  candidate: v.union(candidateLabelValidator, v.null()),
  message: v.union(v.string(), v.null()),
  talentProfile: v.union(talentSummaryValidator, v.null()),
  /** Note de l'équipe : montrée à l'équipe seule. */
  notSelectedReason: v.union(v.string(), v.null()),
  createdAt: v.number(),
  updatedAt: v.number(),
  actions: v.array(literals(JOB_APPLICATION_ACTIONS)),
})

/** Mon profil de talent, tel que je le vois (et moi seul). */
const ownTalentValidator = v.object({
  talentId: v.id("talentProfiles"),
  title: v.string(),
  skills: v.array(v.string()),
  availability: talentAvailabilityValidator,
  languages: v.array(jobLanguageValidator),
  country: v.string(),
  visibility: talentVisibilityValidator,
  status: talentProfileStatusValidator,
  version: v.number(),
  createdAt: v.number(),
  updatedAt: v.number(),
  /** G9 : l'état de modération de mon profil, lu par sa personne propriétaire. */
  moderation: managedModerationStateValidator,
})

/** Un talent trouvé : nom COURT, compétences déclarées ; ni identifiant de personne, ni adresse, ni coordonnée. */
const talentHitValidator = v.object({
  talentId: v.id("talentProfiles"),
  shortName: v.string(),
  title: v.string(),
  skills: v.array(v.string()),
  availability: talentAvailabilityValidator,
  languages: v.array(jobLanguageValidator),
  country: v.string(),
  updatedAt: v.number(),
})

type JobOfferCard = Infer<typeof jobOfferCardValidator>
type JobOfferDetail = Infer<typeof jobOfferDetailValidator>
type MyApplication = Infer<typeof myApplicationValidator>
type ReceivedApplication = Infer<typeof receivedApplicationValidator>
type OwnTalent = Infer<typeof ownTalentValidator>
type TalentHit = Infer<typeof talentHitValidator>

export type JobOfferCardDto = JobOfferCard
export type JobOfferDetailDto = JobOfferDetail
export type MyJobApplicationDto = MyApplication
export type ReceivedJobApplicationDto = ReceivedApplication
export type OwnTalentProfileDto = OwnTalent
export type TalentHitDto = TalentHit

type Scope = { network: Doc<"networks">; networkId: Id<"networks">; person: Doc<"persons">; membership: Doc<"networkMemberships"> }
type ReadScope = QueryCtx & Scope
type WriteScope = MutationCtx & Scope & { rootNetwork: Doc<"networks"> }

/**
 * La conversation contextuelle d'une candidature (CC-3b, contrat CONVERSATION-CONTEXTUELLE-V1) :
 * ouverte à la présélection, resynchronisée après chaque autre transition de la candidature,
 * dans la même transaction. Le statut d'une offre ne la touche pas (D6).
 */
const conversationOf = (id: Id<"jobApplications">) => ({ kind: "diasporaJobApplication", id }) as const
type ReadCtx = Pick<QueryCtx, "db">

/** Le texte relu par la modération (G9) : ce que l'offre ou le profil montre ; jamais gardé. */
function offerText(draft: { readonly title: string; readonly description: string }): string {
  return `${draft.title}\n${draft.description}`
}

function talentText(draft: { readonly title: string; readonly skills: readonly string[] }): string {
  return `${draft.title}\n${draft.skills.join(", ")}`
}

// ═══════════════════════════════════════════════════════════════
// Refus et gardes
// ═══════════════════════════════════════════════════════════════

const CONFLICT_REFUSALS: ReadonlySet<string> = new Set<JobRefusal>([
  "job_offer_version_conflict",
  "job_offer_limit_reached",
  "job_offer_changed",
  "job_offer_closed",
  "job_offer_transition_invalid",
  "job_application_already_exists",
  "job_application_idempotency_conflict",
  "job_application_transition_invalid",
  "talent_profile_version_conflict",
])

const POLICY_REFUSALS: ReadonlySet<string> = new Set<JobRefusal>([
  "job_page_kind_not_allowed",
  "job_application_own_page",
  "job_application_consent_required",
  "job_talent_profile_unavailable",
])

/** Un refus de la tranche, traduit par DIASPORALE (`errors.<code>`) ; une saisie invalide est `invalidArgument`. */
function refuseRule(code: JobRefusal | MoneyRefusal): never {
  return failAppRule(code, {}, CONFLICT_REFUSALS.has(code) ? "conflict" : POLICY_REFUSALS.has(code) ? "policyRefused" : "invalidArgument")
}

function ruled<T>(result: Result<T, JobRefusal | MoneyRefusal>): T {
  if (result.ok) return result.value
  return refuseRule(result.code)
}

/** Éligibilité : la capacité du STATUT courant (expiration d'une sanction comprise), règle du domaine. */
function assertCapability(ctx: { membership: Doc<"networkMemberships"> }, capability: MemberCapability): void {
  const status = effectiveMembershipStatus(ctx.membership)
  if (status === null || !hasCapability(status, capability)) fail("statusInsufficient")
}

/** Une page de lecture bornée : jamais plus que le plafond, jamais plus d'octets que la borne. */
function bounded(opts: PaginationOptions, max: number): PaginationOptions {
  return {
    ...opts,
    numItems: clampJobPageSize(opts.numItems, max),
    maximumBytesRead: Math.min(opts.maximumBytesRead ?? PAGE_BYTES, PAGE_BYTES),
  }
}

function stateOf(offer: Doc<"jobOffers">): { status: Doc<"jobOffers">["status"]; closesAt: number | null } {
  return { status: offer.status, closesAt: offer.closesAt ?? null }
}

/** Une page EMPLOYEUSE (entreprise, association) du réseau, active et lisible par ce lecteur — ou `null`. */
async function readableEmployerPage(ctx: Pick<QueryCtx, "db">, network: Doc<"networks">, pageId: Id<"pages">, readerPersonId: Id<"persons">): Promise<Doc<"pages"> | null> {
  const page = await readablePageOrNull(ctx, network, pageId, readerPersonId)
  if (!page || page.networkId !== network._id || !isJobEmployerOwnerKind(page.ownerKind)) return null
  return page
}

/**
 * La page GÉRÉE : du réseau, active, l'appelant y est signataire VIVANT (refus
 * indistinct sinon), puis de nature admise (entreprise ou association).
 */
async function managedEmployerPage(ctx: Pick<QueryCtx, "db"> & Scope, pageId: Id<"pages">): Promise<Doc<"pages">> {
  const page = await ctx.db.get(pageId)
  if (!page || page.networkId !== ctx.networkId || page.status !== "active") return notFound()
  if ((await liveSignatoryRole(ctx, page, ctx.person._id)) === null) return notFound()
  if (!isJobEmployerOwnerKind(page.ownerKind)) return refuseRule("job_page_kind_not_allowed")
  return page
}

/** L'offre gérée : offre du réseau, page gérée par l'appelant. */
async function managedJobOffer(ctx: Pick<QueryCtx, "db"> & Scope, jobId: Id<"jobOffers">): Promise<Doc<"jobOffers">> {
  const offer = await ctx.db.get(jobId)
  if (!offer || offer.networkId !== ctx.networkId) return notFound()
  await managedEmployerPage(ctx, offer.pageId)
  return offer
}

/** Le geste de la PAGE sur une candidature : signataire vivant d'une page active du réseau, refus indistinct à tout autre. */
async function requirePageSide(ctx: ReadScope, applicationId: Id<"jobApplications">): Promise<Doc<"jobApplications">> {
  const application = await ctx.db.get(applicationId)
  if (!application || application.networkId !== ctx.networkId) return notFound()
  const page = await ctx.db.get(application.pageId)
  if (!page || page.networkId !== ctx.networkId || (await liveSignatoryRole(ctx, page, ctx.person._id)) === null) return notFound()
  return application
}

/** Le geste de la personne qui candidate, sur SA candidature : refus indistinct à tout autre. */
async function requireCandidateSide(ctx: ReadScope, applicationId: Id<"jobApplications">): Promise<Doc<"jobApplications">> {
  const application = await ctx.db.get(applicationId)
  if (!application || application.networkId !== ctx.networkId || application.candidatePersonId !== ctx.person._id) return notFound()
  return application
}

/**
 * G9 — porte commune de la fiche publique et du signalement : une offre
 * effectivement OUVERTE, d'une page employeuse lisible par ce lecteur, servie
 * par la modération (contenu de PAGE : en relecture, elle ne se lit que dans la
 * gestion de l'équipe). N'importe jamais `moderation/targets` (pas de cycle).
 */
export async function readableJobOfferOrNull(
  ctx: ReadCtx,
  network: Doc<"networks">,
  readerPersonId: Id<"persons">,
  jobId: Id<"jobOffers">,
): Promise<{ offer: Doc<"jobOffers">; page: Doc<"pages"> } | null> {
  const offer = await ctx.db.get(jobId)
  if (!offer || offer.networkId !== network._id || !isJobOfferOpen(stateOf(offer), Date.now())) return null
  const page = await readableEmployerPage(ctx, network, offer.pageId, readerPersonId)
  if (!page) return null
  return (await isServedTo(ctx, "diasporaJobOffer", offer._id, readerPersonId)) ? { offer, page } : null
}

/**
 * G9 — une candidature telle que l'ÉQUIPE VIVANTE de sa page la lit (page
 * active, employeuse, du réseau ; signataire vivant relu à l'acte) : la seule
 * audience d'une candidature après la personne qui candidate, qui en est la
 * propriétaire. Retirée par cette personne, elle ne montre plus rien : rien à
 * signaler. Servie par la modération (ni en relecture, ni retirée, ni signalée).
 */
export async function teamReadableJobApplicationOrNull(
  ctx: ReadCtx,
  networkId: Id<"networks">,
  readerPersonId: Id<"persons">,
  applicationId: Id<"jobApplications">,
): Promise<Doc<"jobApplications"> | null> {
  const application = await ctx.db.get(applicationId)
  if (!application || application.networkId !== networkId || application.status === "withdrawn") return null
  const page = await ctx.db.get(application.pageId)
  if (!page || page.networkId !== networkId || page.status !== "active" || !isJobEmployerOwnerKind(page.ownerKind)) return null
  if ((await liveSignatoryRole(ctx, page, readerPersonId)) === null) return null
  return (await isServedTo(ctx, "diasporaJobApplication", application._id, readerPersonId)) ? application : null
}

/**
 * G9 — un profil de talent tel que la RECHERCHE le montre à ce lecteur (actif et
 * visible dans le réseau, profil publié et découvrable, membre actif, aucun
 * blocage, servi par la modération), pour qui a le droit de voir l'annuaire —
 * l'audience du signalement. Le profil joint à une candidature ne porte pas
 * d'identifiant dans la vue de l'équipe : l'équipe signale la candidature.
 */
export async function readableTalentProfileOrNull(
  ctx: ReadCtx,
  networkId: Id<"networks">,
  readerPersonId: Id<"persons">,
  talentId: Id<"talentProfiles">,
): Promise<Doc<"talentProfiles"> | null> {
  const profile = await ctx.db.get(talentId)
  if (!profile || profile.networkId !== networkId || !isTalentListed(profile)) return null
  const status = effectiveMembershipStatus(await getMembership(ctx, networkId, readerPersonId))
  if (status === null || !hasCapability(status, "view_directory")) return null
  return (await listedTalentFor(ctx, networkId, readerPersonId, profile)) ? profile : null
}

/** Le profil de talent d'une personne dans ce réseau (un au plus). */
async function talentRowOf(ctx: Pick<QueryCtx, "db">, networkId: Id<"networks">, personId: Id<"persons">): Promise<Doc<"talentProfiles"> | null> {
  return await ctx.db
    .query("talentProfiles")
    .withIndex("by_network_and_person", (q) => q.eq("networkId", networkId).eq("personId", personId))
    .first()
}

/** Ma candidature à une offre (une au plus, par la règle d'unicité). */
async function myApplicationOf(ctx: Pick<QueryCtx, "db"> & Scope, offerId: Id<"jobOffers">): Promise<Doc<"jobApplications"> | null> {
  return await ctx.db
    .query("jobApplications")
    .withIndex("by_network_and_candidate_and_offer", (q) => q.eq("networkId", ctx.networkId).eq("candidatePersonId", ctx.person._id).eq("offerId", offerId))
    .first()
}

/** Un CACHE des cartes de pages employeuses lisibles, pour une lecture de liste. */
function employerCards(ctx: ReadScope): (pageId: Id<"pages">) => Promise<PageCard | null> {
  const cache = new Map<string, PageCard | null>()
  return async (pageId) => {
    const hit = cache.get(pageId)
    if (hit !== undefined) return hit
    const page = await readableEmployerPage(ctx, ctx.network, pageId, ctx.person._id)
    const card = page ? await pageCardOf(ctx, page) : null
    cache.set(pageId, card)
    return card
  }
}

// ═══════════════════════════════════════════════════════════════
// Projeter
// ═══════════════════════════════════════════════════════════════

function toJobOfferCard(offer: Doc<"jobOffers">, page: PageCard): JobOfferCard {
  return {
    jobId: offer._id,
    version: offer.version,
    title: offer.title,
    description: offer.description,
    contract: offer.contract,
    country: offer.country,
    city: offer.city ?? null,
    workMode: offer.workMode,
    languages: offer.languages,
    payRange: offer.payRange ?? null,
    closesAt: offer.closesAt ?? null,
    publishedAt: offer.publishedAt,
    updatedAt: offer.updatedAt,
    page,
  }
}

/**
 * La fiche d'une offre. `managed` : le lecteur est signataire vivant de la page — la gestion, et
 * l'état de modération de l'offre (G9) ; `null` pour tout autre lecteur, qui n'en reçoit aucun état.
 */
function toJobOfferDetail(
  offer: Doc<"jobOffers">,
  page: PageCard,
  now: number,
  managed: { readonly moderation: ManagedModerationState } | null,
  mine: Doc<"jobApplications"> | null,
): JobOfferDetail {
  return {
    ...toJobOfferCard(offer, page),
    status: effectiveJobOfferStatus(stateOf(offer), now),
    viewerCanManage: managed !== null,
    moderation: managed?.moderation ?? null,
    myApplication: mine ? { applicationId: mine._id, status: mine.status } : null,
  }
}

/** La vue de gestion de l'équipe vivante (G9) : l'état de modération de l'offre de sa page. */
async function managedOfferState(ctx: ReadCtx, offer: Doc<"jobOffers">): Promise<{ readonly moderation: ManagedModerationState }> {
  return { moderation: await managedModerationState(ctx, "diasporaJobOffer", offer._id) }
}

function toOwnTalent(row: Doc<"talentProfiles">, moderation: ManagedModerationState): OwnTalent {
  return {
    talentId: row._id,
    title: row.title,
    skills: row.skills,
    availability: row.availability,
    languages: row.languages,
    country: row.country,
    visibility: row.visibility,
    status: row.status,
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    moderation,
  }
}

/** Une candidature reçue : le nom publié (consentement), le message et le profil joint s'il reste actif. */
async function receivedApplicationOf(ctx: ReadScope, application: Doc<"jobApplications">): Promise<ReceivedApplication> {
  // Retirée : la personne a repris sa candidature ; il n'en reste que l'état.
  const withdrawn = application.status === "withdrawn"
  let candidate: ReceivedApplication["candidate"] = null
  let talentProfile: ReceivedApplication["talentProfile"] = null
  if (!withdrawn) {
    const person = await livePersonProfile(ctx, application.candidatePersonId)
    candidate = { displayName: person?.displayName ?? null, handle: person?.handle ?? null }
    if (application.shareTalentProfile) {
      const profile = await talentRowOf(ctx, ctx.networkId, application.candidatePersonId)
      // G9 : un profil retiré par la modération, en relecture ou signalé par ce signataire n'est plus joint.
      if (profile && isTalentAttachable(profile) && (await isServedTo(ctx, "diasporaTalentProfile", profile._id, ctx.person._id))) {
        talentProfile = { title: profile.title, skills: profile.skills, availability: profile.availability, languages: profile.languages, country: profile.country }
      }
    }
  }
  return {
    applicationId: application._id,
    jobId: application.offerId,
    status: application.status,
    offerVersion: application.offerVersion,
    candidate,
    message: withdrawn ? null : application.message,
    talentProfile,
    notSelectedReason: application.notSelectedReason ?? null,
    createdAt: application.createdAt,
    updatedAt: application.updatedAt,
    actions: availableJobApplicationActions("page", application.status),
  }
}

/** Un talent montrable à CE lecteur : profil publié et découvrable, membre actif du réseau, aucun blocage dans la paire. */
async function listedTalentOf(ctx: ReadScope, profile: Doc<"talentProfiles">): Promise<TalentHit | null> {
  return await listedTalentFor(ctx, ctx.networkId, ctx.person._id, profile)
}

/**
 * La règle de `listedTalentOf` sur des faits primitifs (réseau, lecteur),
 * partagée avec le signalement (G9) : un profil retiré par la modération, en
 * relecture ou déjà signalé par ce lecteur ne sort pas de la recherche.
 */
async function listedTalentFor(ctx: ReadCtx, networkId: Id<"networks">, readerPersonId: Id<"persons">, profile: Doc<"talentProfiles">): Promise<TalentHit | null> {
  const person = await livePersonProfile(ctx, profile.personId)
  if (!person || !isDiscoverablePerson(person)) return null
  if (!(await isActiveMember(ctx, networkId, profile.personId))) return null
  if (await isBlockedBetween(ctx, readerPersonId, profile.personId)) return null
  if (!(await isServedTo(ctx, "diasporaTalentProfile", profile._id, readerPersonId))) return null
  const shortName = talentShortName(person.displayName)
  if (shortName === null) return null
  return {
    talentId: profile._id,
    shortName,
    title: profile.title,
    skills: profile.skills,
    availability: profile.availability,
    languages: profile.languages,
    country: profile.country,
    updatedAt: profile.updatedAt,
  }
}

// ═══════════════════════════════════════════════════════════════
// Lire les offres
// ═══════════════════════════════════════════════════════════════

/**
 * La requête des offres OUVERTES : la recherche plein texte (repliée sans
 * accents) dès deux caractères, sinon l'index le plus étroit de la zone posée —
 * pays et ville, ville seule, pays, ou tout le réseau, les plus récentes d'abord.
 */
function openOffersQuery(ctx: Pick<QueryCtx, "db">, networkId: Id<"networks">, filters: JobSearchFilters) {
  const { query, country, cityKey } = filters
  if (query !== null) {
    return ctx.db.query("jobOffers").withSearchIndex("search_by_text", (q) => {
      const base = q.search("searchText", query).eq("networkId", networkId).eq("status", "open")
      return country === null ? base : base.eq("country", country)
    })
  }
  if (cityKey !== null && country !== null) {
    return ctx.db
      .query("jobOffers")
      .withIndex("by_network_and_status_and_country_and_cityKey_and_publishedAt", (q) => q.eq("networkId", networkId).eq("status", "open").eq("country", country).eq("cityKey", cityKey))
      .order("desc")
  }
  if (cityKey !== null) {
    return ctx.db
      .query("jobOffers")
      .withIndex("by_network_and_status_and_cityKey_and_publishedAt", (q) => q.eq("networkId", networkId).eq("status", "open").eq("cityKey", cityKey))
      .order("desc")
  }
  if (country !== null) {
    return ctx.db
      .query("jobOffers")
      .withIndex("by_network_and_status_and_country_and_publishedAt", (q) => q.eq("networkId", networkId).eq("status", "open").eq("country", country))
      .order("desc")
  }
  return ctx.db
    .query("jobOffers")
    .withIndex("by_network_and_status_and_publishedAt", (q) => q.eq("networkId", networkId).eq("status", "open"))
    .order("desc")
}

/**
 * Chercher des offres ouvertes : texte, pays, ville saisie (sans GPS), contrat,
 * mode de travail. Chaque filtre RESTREINT ; une page filtrée peut être courte,
 * voire vide, tout en annonçant sa suite (`isDone`). Aucun historique gardé.
 */
export const searchJobOffers = networkQuery({
  args: {
    query: v.optional(v.string()),
    country: v.optional(v.string()),
    city: v.optional(v.string()),
    contract: v.optional(v.string()),
    workMode: v.optional(v.string()),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(jobOfferCardValidator),
  handler: async (ctx, args): Promise<PaginationResult<JobOfferCard>> => {
    assertDiasporaNetwork(ctx.network)
    assertCapability(ctx, "read_network")
    const filters = ruled(parseJobSearch({ query: args.query, country: args.country, city: args.city, contract: args.contract, workMode: args.workMode }))
    const now = Date.now()
    const result = await openOffersQuery(ctx, ctx.networkId, filters).paginate(bounded(args.paginationOpts, JOB_SEARCH_PAGE_MAX))
    const cardOf = employerCards(ctx)
    const page: JobOfferCard[] = []
    for (const offer of result.page) {
      // Défense en profondeur : l'index borne déjà ; chaque ligne est rejugée (échue, filtres, page lisible).
      if (offer.networkId !== ctx.networkId || !isJobOfferOpen(stateOf(offer), now)) continue
      if (!matchesJobFilters({ country: offer.country, cityKey: offer.cityKey ?? null, contract: offer.contract, workMode: offer.workMode }, filters)) continue
      const card = await cardOf(offer.pageId)
      // G9 : projection publique — une offre en relecture ou retirée ne se cherche pas (l'équipe la garde dans sa gestion).
      if (card && (await isServedTo(ctx, "diasporaJobOffer", offer._id, ctx.person._id))) page.push(toJobOfferCard(offer, card))
    }
    return { ...result, page }
  },
})

/**
 * La fiche d'une offre : une offre OUVERTE d'une page lisible, ou TOUTE offre
 * d'une page dont le lecteur est signataire vivant (`viewerCanManage`). Sinon le
 * même `null` : inconnue, d'ailleurs, brouillon, suspendue, close ou échue ne se
 * distinguent pas. Ma candidature à l'offre, si j'en ai une, l'accompagne.
 */
export const getJobOffer = networkQuery({
  args: { jobId: v.string() },
  returns: v.union(jobOfferDetailValidator, v.null()),
  handler: async (ctx, args): Promise<JobOfferDetail | null> => {
    assertDiasporaNetwork(ctx.network)
    assertCapability(ctx, "read_network")
    const jobId = ctx.db.normalizeId("jobOffers", args.jobId)
    if (jobId === null) return null
    const offer = await ctx.db.get(jobId)
    if (!offer || offer.networkId !== ctx.networkId) return null
    const page = await ctx.db.get(offer.pageId)
    if (!page || page.networkId !== ctx.networkId || !isJobEmployerOwnerKind(page.ownerKind)) return null
    const now = Date.now()
    // G9 : la vue de gestion de l'équipe vivante porte l'état de modération de l'offre.
    if ((await liveSignatoryRole(ctx, page, ctx.person._id)) !== null) return toJobOfferDetail(offer, await pageCardOf(ctx, page), now, await managedOfferState(ctx, offer), null)
    if (!isJobOfferOpen(stateOf(offer), now)) return null
    const readable = await readableEmployerPage(ctx, ctx.network, page._id, ctx.person._id)
    // G9 : hors de l'équipe (vue de gestion ci-dessus), la fiche ne sert que ce que la modération sert, sans son état.
    if (!readable || !(await isServedTo(ctx, "diasporaJobOffer", offer._id, ctx.person._id))) return null
    return toJobOfferDetail(offer, await pageCardOf(ctx, readable), now, null, await myApplicationOf(ctx, offer._id))
  },
})

/**
 * Les offres d'une page que je gère, dans TOUS leurs états. Signataire vivant
 * seulement ; sinon le refus indistinct. Un filtre d'état juge l'état EFFECTIF :
 * une offre échue quitte les ouvertes avant même que le passage d'expiration
 * l'écrive (elle rejoint les closes une fois écrite).
 */
export const pageJobOffers = networkQuery({
  args: {
    pageId: v.id("pages"),
    status: v.optional(jobOfferStatusValidator),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(jobOfferDetailValidator),
  handler: async (ctx, args): Promise<PaginationResult<JobOfferDetail>> => {
    assertDiasporaNetwork(ctx.network)
    assertCapability(ctx, "read_network")
    const page = await managedEmployerPage(ctx, args.pageId)
    const { status } = args
    const result = await ctx.db
      .query("jobOffers")
      .withIndex("by_network_and_page_and_status", (q) => {
        const inPage = q.eq("networkId", ctx.networkId).eq("pageId", page._id)
        return status === undefined ? inPage : inPage.eq("status", status)
      })
      .order("desc")
      .paginate(bounded(args.paginationOpts, MANAGED_PAGE_MAX))
    const card = await pageCardOf(ctx, page)
    const now = Date.now()
    const rows: JobOfferDetail[] = []
    for (const offer of result.page) {
      if (offer.networkId !== ctx.networkId || offer.pageId !== page._id) continue
      if (status !== undefined && effectiveJobOfferStatus(stateOf(offer), now) !== status) continue
      // G9 : vue de gestion de l'équipe vivante — l'état de modération de chaque offre gardée (une lecture d'index par offre, page bornée).
      rows.push(toJobOfferDetail(offer, card, now, await managedOfferState(ctx, offer), null))
    }
    return { ...result, page: rows }
  },
})

// ═══════════════════════════════════════════════════════════════
// Gérer une offre (signataires vivants d'une page employeuse)
// ═══════════════════════════════════════════════════════════════

/** Les champs saisis d'une offre : précis ici, jugés par le domaine ensuite. */
const jobOfferInputFields = {
  title: v.string(),
  description: v.string(),
  contract: jobContractValidator,
  country: v.string(),
  city: v.union(v.string(), v.null()),
  workMode: jobWorkModeValidator,
  languages: v.array(jobLanguageValidator),
  payRange: v.union(jobPayRangeValidator, v.null()),
  closesAt: v.union(v.number(), v.null()),
}

type JobOfferInputArgs = { [K in keyof typeof jobOfferInputFields]: Infer<(typeof jobOfferInputFields)[K]> }

/** La saisie jugée par LA règle du domaine ; un refus devient un code d'application. */
function draftOf(args: JobOfferInputArgs, now: number): JobOfferDraft {
  return ruled(
    parseJobOffer(
      {
        title: args.title,
        description: args.description,
        contract: args.contract,
        country: args.country,
        city: args.city,
        workMode: args.workMode,
        languages: args.languages,
        payRange: args.payRange,
        closesAt: args.closesAt,
      },
      now,
    ),
  )
}

/** Les champs écrits toujours présents d'un brouillon validé. */
function storedFields(draft: JobOfferDraft) {
  return {
    title: draft.title,
    description: draft.description,
    contract: draft.contract,
    country: draft.country,
    workMode: draft.workMode,
    languages: [...draft.languages],
    searchText: draft.searchText,
  }
}

/** Une page ne porte pas plus de `JOB_OFFERS_PER_PAGE_MAX` offres non closes (lecture bornée par état). */
async function assertJobOfferQuota(ctx: Pick<QueryCtx, "db">, networkId: Id<"networks">, pageId: Id<"pages">): Promise<void> {
  let count = 0
  for (const status of ["draft", "open", "suspended"] as const) {
    const rows = await ctx.db
      .query("jobOffers")
      .withIndex("by_network_and_page_and_status", (q) => q.eq("networkId", networkId).eq("pageId", pageId).eq("status", status))
      .take(JOB_OFFERS_PER_PAGE_MAX)
    count += rows.length
    if (count >= JOB_OFFERS_PER_PAGE_MAX) failAppRule("job_offer_limit_reached", { max: JOB_OFFERS_PER_PAGE_MAX }, "conflict")
  }
}

/** Créer une offre au nom d'une page que je gère : brouillon, ou ouverte si je la publie aussitôt. */
export const createJobOffer = networkMutation({
  args: { pageId: v.id("pages"), ...jobOfferInputFields, publish: v.boolean() },
  returns: v.object({ jobId: v.id("jobOffers"), version: v.number(), status: jobOfferStatusValidator }),
  handler: async (ctx, args) => {
    assertDiasporaNetwork(ctx.network)
    assertCapability(ctx, "publish")
    await enforceRateLimit(ctx, "diaspora.job.offer", ctx.person._id)
    const page = await managedEmployerPage(ctx, args.pageId)
    const now = Date.now()
    const draft = draftOf(args, now)
    await assertJobOfferQuota(ctx, ctx.networkId, page._id)
    const status = initialJobOfferStatus(args.publish)
    const jobId = await ctx.db.insert("jobOffers", {
      networkId: ctx.networkId,
      pageId: page._id,
      ...storedFields(draft),
      ...(draft.city !== null ? { city: draft.city } : {}),
      ...(draft.cityKey !== null ? { cityKey: draft.cityKey } : {}),
      ...(draft.payRange !== null ? { payRange: { ...draft.payRange } } : {}),
      ...(draft.closesAt !== null ? { closesAt: draft.closesAt } : {}),
      status,
      version: 1,
      publishedAt: now,
      createdAt: now,
      updatedAt: now,
    })
    // G9 : contenu de la PAGE — l'état de modération appartient à la page, jamais au signataire qui la saisit.
    await moderateDiasporaWrite(ctx, { networkId: ctx.networkId, kind: "diasporaJobOffer", id: jobId, text: offerText(draft), owner: { pageId: page._id } })
    return { jobId, version: 1, status }
  },
})

/**
 * Modifier une offre (non close) : la modification cite la version lue
 * (`expectedVersion`) ; si l'offre a changé entre-temps, conflit, rien n'est
 * écrit. Toute modification incrémente la version.
 */
export const updateJobOffer = networkMutation({
  args: { jobId: v.id("jobOffers"), expectedVersion: v.number(), ...jobOfferInputFields },
  returns: v.object({ version: v.number() }),
  handler: async (ctx, args) => {
    assertDiasporaNetwork(ctx.network)
    assertCapability(ctx, "publish")
    await enforceRateLimit(ctx, "diaspora.job.offer", ctx.person._id)
    const offer = await managedJobOffer(ctx, args.jobId)
    const now = Date.now()
    if (!isJobOfferEditable(effectiveJobOfferStatus(stateOf(offer), now))) return refuseRule("job_offer_closed")
    const version = ruled(checkJobOfferVersion(offer.version, args.expectedVersion))
    const draft = draftOf(args, now)
    // G9 : une offre retirée par la modération ne se modifie plus ; sinon la modification est relue comme une écriture de la page.
    await moderateDiasporaWrite(ctx, { networkId: ctx.networkId, kind: "diasporaJobOffer", id: offer._id, text: offerText(draft), owner: { pageId: offer.pageId } })
    await ctx.db.patch(offer._id, {
      ...storedFields(draft),
      city: draft.city ?? undefined,
      cityKey: draft.cityKey ?? undefined,
      payRange: draft.payRange === null ? undefined : { ...draft.payRange },
      closesAt: draft.closesAt ?? undefined,
      version,
      updatedAt: now,
    })
    return { version }
  },
})

/**
 * Ouvrir, suspendre, reprendre ou clore une offre. L'état demandé déjà courant
 * ne change rien (double clic, second signataire) ; sinon la version lue est
 * exigée et incrémentée. Close est terminale ; ouvrir exige une date limite
 * encore à venir.
 */
export const setJobOfferStatus = networkMutation({
  args: { jobId: v.id("jobOffers"), expectedVersion: v.number(), status: literals(JOB_OFFER_STATUS_TARGETS) },
  returns: v.object({ status: jobOfferStatusValidator, version: v.number() }),
  handler: async (ctx, args) => {
    assertDiasporaNetwork(ctx.network)
    assertCapability(ctx, "publish")
    await enforceRateLimit(ctx, "diaspora.job.offer", ctx.person._id)
    const offer = await managedJobOffer(ctx, args.jobId)
    const now = Date.now()
    const current = effectiveJobOfferStatus(stateOf(offer), now)
    const next = ruled(transitionJobOffer(current, args.status))
    if (!next.changed) return { status: current, version: offer.version }
    if (next.status === "open") ruled(checkJobDeadline(offer.closesAt ?? null, now))
    const version = ruled(checkJobOfferVersion(offer.version, args.expectedVersion))
    // contextual-hooks-exempt: statut d'une offre, pas d'une candidature ; clore l'offre ne ferme aucune conversation (D6).
    await ctx.db.patch(offer._id, {
      status: next.status,
      version,
      publishedAt: jobOfferPublishedAt(current, next.status, offer.publishedAt, now),
      ...(next.status === "closed" ? { closedAt: now } : {}),
      updatedAt: now,
    })
    return { status: next.status, version }
  },
})

// ═══════════════════════════════════════════════════════════════
// Candidater (la personne qui candidate)
// ═══════════════════════════════════════════════════════════════

/**
 * Candidater à une offre OUVERTE d'une page lisible, à la version LUE. Le
 * consentement explicite à transmettre son nom publié est exigé ; le profil de
 * talent n'est joint que s'il est choisi et actif. Une candidature par personne
 * et par offre ; même clé et même corps rendent la candidature déjà créée.
 */
export const applyToJobOffer = networkMutation({
  args: {
    jobId: v.id("jobOffers"),
    offerVersion: v.number(),
    message: v.string(),
    shareName: v.boolean(),
    shareTalentProfile: v.boolean(),
    idempotencyKey: v.string(),
  },
  returns: v.object({ applicationId: v.id("jobApplications"), created: v.boolean() }),
  handler: async (ctx, args) => {
    assertDiasporaNetwork(ctx.network)
    assertCapability(ctx, "publish")
    await enforceRateLimit(ctx, "diaspora.job.apply", ctx.person._id)
    if (!isJobIdempotencyKey(args.idempotencyKey)) return fail("invalidArgument", { field: "idempotencyKey" })
    const draft = ruled(normalizeJobApplication({ message: args.message, shareName: args.shareName, shareTalentProfile: args.shareTalentProfile }))
    const fingerprint = jobApplicationFingerprint({ jobId: args.jobId, offerVersion: args.offerVersion, message: draft.message, shareTalentProfile: draft.shareTalentProfile })
    // Rejeu AVANT les gardes de l'offre : la candidature déjà créée est la réponse.
    const replay = await ctx.db
      .query("jobApplications")
      .withIndex("by_network_and_candidate_and_idempotencyKey", (q) =>
        q.eq("networkId", ctx.networkId).eq("candidatePersonId", ctx.person._id).eq("idempotencyKey", args.idempotencyKey),
      )
      .first()
    if (replay) return replay.idempotencyFingerprint === fingerprint ? { applicationId: replay._id, created: false } : refuseRule("job_application_idempotency_conflict")
    const now = Date.now()
    const offer = await ctx.db.get(args.jobId)
    if (!offer || offer.networkId !== ctx.networkId || !isJobOfferOpen(stateOf(offer), now)) return notFound()
    const page = await readableEmployerPage(ctx, ctx.network, offer.pageId, ctx.person._id)
    if (!page) return notFound()
    // RP-03 : toute l'équipe vivante en blocage avec la personne, l'offre se tait comme retirée.
    await assertPageOpenTo(ctx, page, ctx.person._id)
    // G9 : on ne candidate qu'à une offre que la modération sert à ce lecteur.
    if (!(await isServedTo(ctx, "diasporaJobOffer", offer._id, ctx.person._id))) return notFound()
    if (offer.version !== args.offerVersion) return refuseRule("job_offer_changed")
    if ((await liveSignatoryRole(ctx, page, ctx.person._id)) !== null) return refuseRule("job_application_own_page")
    if ((await myApplicationOf(ctx, offer._id)) !== null) return refuseRule("job_application_already_exists")
    if (draft.shareTalentProfile) {
      const profile = await talentRowOf(ctx, ctx.networkId, ctx.person._id)
      // Un profil retiré par la modération ne se joint plus : il ne serait montré à personne.
      if (!profile || !isTalentAttachable(profile) || (await isRemovedByModeration(ctx, "diasporaTalentProfile", profile._id))) return refuseRule("job_talent_profile_unavailable")
    }
    const applicationId = await ctx.db.insert("jobApplications", {
      networkId: ctx.networkId,
      offerId: offer._id,
      pageId: page._id,
      candidatePersonId: ctx.person._id,
      offerTitle: offer.title,
      offerVersion: offer.version,
      message: draft.message,
      status: "sent",
      identityConsentAt: now,
      shareTalentProfile: draft.shareTalentProfile,
      ...(draft.shareTalentProfile ? { talentConsentAt: now } : {}),
      idempotencyKey: args.idempotencyKey,
      idempotencyFingerprint: fingerprint,
      createdAt: now,
      updatedAt: now,
    })
    // G9 : la candidature appartient à la personne qui candidate ; relue comme une écriture (publiée sauf politique explicite du réseau).
    const moderation = await moderateDiasporaWrite(ctx, { networkId: ctx.networkId, kind: "diasporaJobApplication", id: applicationId, text: draft.message, owner: { personId: ctx.person._id } })
    // Avis neutre à l'équipe vivante de la page ; une candidature en relecture n'annonce rien.
    if (moderation === "published") await noticeJobApplicationReceived(ctx, applicationId)
    return { applicationId, created: true }
  },
})

/**
 * Retirer SA candidature (envoyée, vue ou présélectionnée) : c'est définitif,
 * l'équipe de la page n'en voit plus que l'état. Ouvert même à un statut
 * redescendu « en attente » : reprendre ses données ne demande aucun droit de
 * publier. Retirer deux fois ne change rien.
 */
export const withdrawJobApplication = networkMutation({
  minStatus: "en_attente",
  args: { applicationId: v.id("jobApplications") },
  returns: v.object({ status: jobApplicationStatusValidator }),
  handler: async (ctx, args) => {
    assertDiasporaNetwork(ctx.network)
    await enforceRateLimit(ctx, "diaspora.job.apply", ctx.person._id)
    const application = await requireCandidateSide(ctx, args.applicationId)
    const next = ruled(transitionJobApplication({ actor: "candidate", action: "withdraw", status: application.status }))
    if (!next.changed) return { status: application.status }
    const now = Date.now()
    await ctx.db.patch(application._id, { status: next.status, withdrawnAt: now, updatedAt: now })
    await syncContextualConversation(ctx, conversationOf(application._id))
    return { status: next.status }
  },
})

/** Mes candidatures, des plus récemment mises à jour : les miennes seulement, dans ce réseau. */
export const myJobApplications = networkQuery({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(myApplicationValidator),
  handler: async (ctx, args): Promise<PaginationResult<MyApplication>> => {
    assertDiasporaNetwork(ctx.network)
    assertCapability(ctx, "read_network")
    const result = await ctx.db
      .query("jobApplications")
      .withIndex("by_network_and_candidate_and_updatedAt", (q) => q.eq("networkId", ctx.networkId).eq("candidatePersonId", ctx.person._id))
      .order("desc")
      .paginate(bounded(args.paginationOpts, JOB_APPLICATIONS_PAGE_MAX))
    const cardOf = employerCards(ctx)
    const now = Date.now()
    const page: MyApplication[] = []
    for (const application of result.page) {
      if (application.networkId !== ctx.networkId || application.candidatePersonId !== ctx.person._id) continue
      const offer = await ctx.db.get(application.offerId)
      const card = await cardOf(application.pageId)
      // G9 : une offre que la modération ne sert plus ne reçoit plus de candidatures.
      const offerOpen = card !== null && offer !== null && offer.networkId === ctx.networkId && isJobOfferOpen(stateOf(offer), now)
        && (await isServedTo(ctx, "diasporaJobOffer", offer._id, ctx.person._id))
      // G9 : la personne qui candidate, propriétaire de sa candidature, en lit l'état de modération (jamais celui de l'offre).
      const moderation = await managedModerationState(ctx, "diasporaJobApplication", application._id)
      page.push({
        applicationId: application._id,
        status: application.status,
        jobId: application.offerId,
        offerTitle: application.offerTitle,
        offerVersion: application.offerVersion,
        offerOpen,
        page: card,
        message: application.message,
        sharedTalentProfile: application.shareTalentProfile,
        createdAt: application.createdAt,
        updatedAt: application.updatedAt,
        actions: availableJobApplicationActions("candidate", application.status),
        moderation,
      })
    }
    return { ...result, page }
  },
})

// ═══════════════════════════════════════════════════════════════
// L'équipe de la page : lire les candidatures, décider
// ═══════════════════════════════════════════════════════════════

/**
 * Les candidatures d'une offre, toutes ou par état, les plus récentes d'abord :
 * pour les signataires VIVANTS de sa page seulement (refus indistinct sinon).
 */
export const jobOfferApplications = networkQuery({
  args: {
    jobId: v.id("jobOffers"),
    status: v.optional(jobApplicationStatusValidator),
    paginationOpts: paginationOptsValidator,
  },
  returns: paginationResultValidator(receivedApplicationValidator),
  handler: async (ctx, args): Promise<PaginationResult<ReceivedApplication>> => {
    assertDiasporaNetwork(ctx.network)
    assertCapability(ctx, "read_network")
    const offer = await managedJobOffer(ctx, args.jobId)
    const { status } = args
    const result =
      status === undefined
        ? await ctx.db
            .query("jobApplications")
            .withIndex("by_network_and_offer_and_createdAt", (q) => q.eq("networkId", ctx.networkId).eq("offerId", offer._id))
            .order("desc")
            .paginate(bounded(args.paginationOpts, JOB_APPLICATIONS_PAGE_MAX))
        : await ctx.db
            .query("jobApplications")
            .withIndex("by_network_and_offer_and_status_and_createdAt", (q) => q.eq("networkId", ctx.networkId).eq("offerId", offer._id).eq("status", status))
            .order("desc")
            .paginate(bounded(args.paginationOpts, JOB_APPLICATIONS_PAGE_MAX))
    const page: ReceivedApplication[] = []
    for (const application of result.page) {
      if (application.networkId !== ctx.networkId || application.offerId !== offer._id) continue
      // G9 : une candidature en relecture, retirée par la modération ou signalée par ce signataire ne se sert plus à lui.
      if (!(await isServedTo(ctx, "diasporaJobApplication", application._id, ctx.person._id))) continue
      page.push(await receivedApplicationOf(ctx, application))
    }
    return { ...result, page }
  },
})

/**
 * Un geste de l'équipe : signataire vivant, puis le motif (non-sélection
 * seulement) et la transition du domaine ; un geste déjà acquis ne change rien.
 */
async function decide(
  ctx: WriteScope,
  applicationId: Id<"jobApplications">,
  action: Exclude<JobApplicationAction, "withdraw">,
  rawReason: string | undefined,
): Promise<{ status: JobApplicationStatus }> {
  assertDiasporaNetwork(ctx.network)
  assertCapability(ctx, "publish")
  await enforceRateLimit(ctx, "diaspora.job.review", ctx.person._id)
  const application = await requirePageSide(ctx, applicationId)
  const reason = action === "not_select" ? ruled(parseJobDecisionReason(rawReason)) : null
  const next = ruled(transitionJobApplication({ actor: "page", action, status: application.status }))
  if (!next.changed) return { status: application.status }
  const now = Date.now()
  await ctx.db.patch(application._id, {
    status: next.status,
    seenAt: application.seenAt ?? now,
    ...(action === "mark_seen" ? {} : { decidedAt: now, decidedByPersonId: ctx.person._id }),
    ...(reason !== null ? { notSelectedReason: reason } : {}),
    updatedAt: now,
  })
  // CC-3b : la présélection ouvre la conversation ; une autre décision la resynchronise.
  if (next.status === "shortlisted") await openContextualConversation(ctx, conversationOf(application._id))
  else await syncContextualConversation(ctx, conversationOf(application._id))
  // Avis neutre à la personne qui candidate (présélection ou non-sélection seulement, jamais le motif).
  await noticeJobApplicationDecided(ctx, application._id, ctx.person._id)
  return { status: next.status }
}

/** L'équipe a lu la candidature. */
export const markJobApplicationSeen = networkMutation({
  args: { applicationId: v.id("jobApplications") },
  returns: v.object({ status: jobApplicationStatusValidator }),
  handler: async (ctx, args) => await decide(ctx, args.applicationId, "mark_seen", undefined),
})

/** L'équipe présélectionne la candidature. */
export const shortlistJobApplication = networkMutation({
  args: { applicationId: v.id("jobApplications") },
  returns: v.object({ status: jobApplicationStatusValidator }),
  handler: async (ctx, args) => await decide(ctx, args.applicationId, "shortlist", undefined),
})

/**
 * L'équipe ne retient pas la candidature, motif facultatif : une note de
 * l'équipe, jamais montrée à la personne qui candidate sans relecture.
 */
export const markJobApplicationNotSelected = networkMutation({
  args: { applicationId: v.id("jobApplications"), reason: v.optional(v.string()) },
  returns: v.object({ status: jobApplicationStatusValidator }),
  handler: async (ctx, args) => await decide(ctx, args.applicationId, "not_select", args.reason),
})

// ═══════════════════════════════════════════════════════════════
// Profils de talent (opt-in, révocable)
// ═══════════════════════════════════════════════════════════════

/** Mon profil de talent dans ce réseau, ou `null` : je n'en ai pas créé (ou je l'ai supprimé). */
export const myTalentProfile = networkQuery({
  args: {},
  returns: v.union(ownTalentValidator, v.null()),
  handler: async (ctx): Promise<OwnTalent | null> => {
    assertDiasporaNetwork(ctx.network)
    assertCapability(ctx, "read_network")
    const row = await talentRowOf(ctx, ctx.networkId, ctx.person._id)
    // G9 : la personne propriétaire lit l'état de modération de son profil.
    return row ? toOwnTalent(row, await managedModerationState(ctx, "diasporaTalentProfile", row._id)) : null
  },
})

/**
 * Créer ou modifier MON profil de talent (opt-in explicite). Une création cite
 * `expectedVersion: null`, une modification la version lue ; sinon conflit.
 */
export const saveMyTalentProfile = networkMutation({
  args: {
    expectedVersion: v.union(v.number(), v.null()),
    title: v.string(),
    skills: v.array(v.string()),
    availability: talentAvailabilityValidator,
    languages: v.array(jobLanguageValidator),
    country: v.string(),
    visibility: talentVisibilityValidator,
  },
  returns: v.object({ talentId: v.id("talentProfiles"), version: v.number() }),
  handler: async (ctx, args) => {
    assertDiasporaNetwork(ctx.network)
    assertCapability(ctx, "appear_in_directory")
    await enforceRateLimit(ctx, "diaspora.talent.profile", ctx.person._id)
    const draft = ruled(
      parseTalentProfile({
        title: args.title,
        skills: args.skills,
        availability: args.availability,
        languages: args.languages,
        country: args.country,
        visibility: args.visibility,
      }),
    )
    const row = await talentRowOf(ctx, ctx.networkId, ctx.person._id)
    const version = ruled(checkTalentProfileVersion(row ? row.version : null, args.expectedVersion))
    const now = Date.now()
    const fields = {
      title: draft.title,
      skills: [...draft.skills],
      searchText: draft.searchText,
      availability: draft.availability,
      languages: [...draft.languages],
      country: draft.country,
      visibility: draft.visibility,
      version,
      updatedAt: now,
    }
    if (row) {
      // G9 : un profil retiré par la modération ne se modifie plus ; sinon la modification est relue comme une écriture.
      await moderateDiasporaWrite(ctx, { networkId: ctx.networkId, kind: "diasporaTalentProfile", id: row._id, text: talentText(draft), owner: { personId: ctx.person._id } })
      await ctx.db.patch(row._id, fields)
      return { talentId: row._id, version }
    }
    const talentId = await ctx.db.insert("talentProfiles", { networkId: ctx.networkId, personId: ctx.person._id, ...fields, status: "active", createdAt: now })
    await moderateDiasporaWrite(ctx, { networkId: ctx.networkId, kind: "diasporaTalentProfile", id: talentId, text: talentText(draft), owner: { personId: ctx.person._id } })
    return { talentId, version }
  },
})

/**
 * Masquer ou réactiver MON profil. Masquer est ouvert à un statut redescendu
 * « en attente » ; réactiver exige le droit d'apparaître dans l'annuaire.
 * L'état déjà courant ne change rien.
 */
export const setMyTalentProfileStatus = networkMutation({
  minStatus: "en_attente",
  args: { status: talentProfileStatusValidator, expectedVersion: v.number() },
  returns: v.object({ status: talentProfileStatusValidator, version: v.number() }),
  handler: async (ctx, args) => {
    assertDiasporaNetwork(ctx.network)
    if (args.status === "active") assertCapability(ctx, "appear_in_directory")
    await enforceRateLimit(ctx, "diaspora.talent.profile", ctx.person._id)
    const row = await talentRowOf(ctx, ctx.networkId, ctx.person._id)
    if (!row) return notFound()
    if (row.status === args.status) return { status: row.status, version: row.version }
    const version = ruled(checkTalentProfileVersion(row.version, args.expectedVersion))
    // contextual-hooks-exempt: statut d'un profil de talent, qui n'ouvre et ne ferme aucune conversation.
    await ctx.db.patch(row._id, { status: args.status, version, updatedAt: Date.now() })
    return { status: args.status, version }
  },
})

/**
 * Supprimer MON profil de talent : la révocation complète. Il quitte la
 * recherche et les candidatures où il était joint (relu vivant, jamais copié).
 * Supprimer un profil absent ne change rien.
 */
export const removeMyTalentProfile = networkMutation({
  minStatus: "en_attente",
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    assertDiasporaNetwork(ctx.network)
    await enforceRateLimit(ctx, "diaspora.talent.profile", ctx.person._id)
    const row = await talentRowOf(ctx, ctx.networkId, ctx.person._id)
    if (row) await ctx.db.delete(row._id)
    return null
  },
})

/**
 * Chercher des talents ACTIFS et VISIBLES du réseau, par pays (obligatoire) et
 * compétence (facultative) : page par page sous un plafond STRICT, sans tri par
 * donnée sensible ni export. Chaque ligne est rejugée : profil publié et
 * découvrable, membre actif, aucun blocage dans la paire ; mon propre profil
 * n'apparaît pas. Aucune coordonnée, aucun identifiant de personne.
 */
export const searchTalents = networkQuery({
  args: { country: v.string(), skill: v.optional(v.string()), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(talentHitValidator),
  handler: async (ctx, args): Promise<PaginationResult<TalentHit>> => {
    assertDiasporaNetwork(ctx.network)
    assertCapability(ctx, "view_directory")
    const { country, skill } = ruled(parseTalentSearch({ country: args.country, skill: args.skill }))
    const options = bounded(args.paginationOpts, TALENT_SEARCH_PAGE_MAX)
    const result =
      skill !== null
        ? await ctx.db
            .query("talentProfiles")
            .withSearchIndex("search_by_skills", (q) =>
              q.search("searchText", skill).eq("networkId", ctx.networkId).eq("country", country).eq("status", "active").eq("visibility", "network"),
            )
            .paginate(options)
        : await ctx.db
            .query("talentProfiles")
            .withIndex("by_network_and_country_and_status_and_visibility_and_updatedAt", (q) =>
              q.eq("networkId", ctx.networkId).eq("country", country).eq("status", "active").eq("visibility", "network"),
            )
            .order("desc")
            .paginate(options)
    const page: TalentHit[] = []
    for (const profile of result.page) {
      if (profile.networkId !== ctx.networkId || profile.country !== country || !isTalentListed(profile) || profile.personId === ctx.person._id) continue
      const hit = await listedTalentOf(ctx, profile)
      if (hit) page.push(hit)
    }
    return { ...result, page }
  },
})

// ═══════════════════════════════════════════════════════════════
// Passage d'expiration (planification : ANTSIA)
// ═══════════════════════════════════════════════════════════════

/**
 * Écrit la clôture des offres ouvertes ou suspendues dont la date limite est
 * atteinte, par lots bornés. Les lectures et les gestes la constatent déjà
 * (état effectif) ; ce passage garde les index d'état exacts. Toute clôture
 * incrémente la version (une modification en cours devient un conflit).
 */
export const closeExpiredJobOffers = internalMutation({
  args: { limit: v.optional(v.number()) },
  returns: v.object({ closed: v.number(), hasMore: v.boolean() }),
  handler: async (ctx, args) => {
    const now = Date.now()
    const limit = clampJobPageSize(args.limit ?? EXPIRY_BATCH_MAX, EXPIRY_BATCH_MAX)
    let closed = 0
    let hasMore = false
    for (const status of ["open", "suspended"] as const) {
      const due = await ctx.db
        .query("jobOffers")
        .withIndex("by_status_and_closesAt", (q) => q.eq("status", status).gte("closesAt", 0).lte("closesAt", now))
        .take(limit + 1)
      if (due.length > limit) hasMore = true
      for (const offer of due.slice(0, limit)) {
        // contextual-hooks-exempt: clôture d'une offre échue ; les candidatures présélectionnées gardent leur conversation (D6).
        await ctx.db.patch(offer._id, { status: "closed", closedAt: offer.closesAt ?? now, version: offer.version + 1, updatedAt: now })
        closed += 1
      }
    }
    return { closed, hasMore }
  },
})
