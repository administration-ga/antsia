/**
 * Guichet de modération par pays de DIASPORALE (PD6 · G9) — LECTURES seules.
 *
 * - Le moteur ne range pas ses dossiers par pays : cette tranche relit la file
 *   du réseau `diasporale` par fenêtres bornées (index du moteur, curseur opaque
 *   rendu tel quel, une fenêtre filtrée peut être vide et annoncer sa suite) et
 *   ne garde que les dossiers dont la CIBLE porte le pays demandé : publication
 *   (son pays, sinon celui de sa page), commentaire (celui de sa publication),
 *   page, évènement et direct d'une page, avis et réponse d'avis (zone de
 *   l'offre, sinon pays de la page). Vague H (G9) : question d'entraide et sa
 *   réponse (zone de la question), mission (zone de la mission, sinon pays de sa
 *   page), ressource du kit (son pays), offre d'emploi (zone de l'offre, sinon
 *   pays de la page) et candidature (pays de l'offre), profil de mentor ou de
 *   talent (le pays qu'il déclare), demande de mentorat (pays du profil du
 *   mentor). Les autres natures (compte, messages, statut, album, offre de
 *   boutique) ne portent aucun pays : « sans pays ». Le pays de résidence d'une
 *   personne (facette à visibilité choisie) n'est JAMAIS lu.
 * - Les gardes sont celles du moteur, importées et jamais recopiées :
 *   `teamCapacity` et `requireReportCapacity` (`moderation/cases`), `contentState`
 *   (`moderation/policy`), `liveSignatoryRole` (`pages/access`). Hors compétence,
 *   hors réseau gouverné ou pour une autre personne attendue : le refus
 *   indistinct. Aucun DTO ne porte de déclarant, d'auteur, de corps de contenu,
 *   de pièce privée ni de coordonnée ; l'aperçu reste `moderation/reviewProjection`.
 * - Aucune décision ici : elles passent par les mutations EXISTANTES du moteur
 *   (`cases.decide`, `cases.reviewContent`, `cases.reviewNetworkAppeal`,
 *   `cases.createTeam`, `cases.setTeamMember`), motivées et journalisées par lui ;
 *   les responsables du réseau (MD-01) se nomment par `membership.setResponsibleRole`,
 *   sur l'aide du moteur. `party` dit seulement à l'écran pourquoi la personne ne décide pas : ce que
 *   le moteur refuse (auteur, page signée, ancien décideur, auteur du recours),
 *   plus deux retenues de l'écran (déclarant du dossier ; signataire de la page
 *   visée par une page, une publication de page, un évènement ou un avis).
 * - Aucune table : le moteur ne rattache pas encore une équipe à un pays
 *   (`moderationTeams.scope` est une NATURE de contenu) ; le pays filtre la file,
 *   il ne délimite aucune compétence.
 * - AS-01 : les revendications de page en attente (« Pages à vérifier ») se
 *   relisent ici par fenêtres, filtrées par le pays de la PAGE, avec la garde du
 *   moteur (`pages/claims` n'admet que le rôle de réseau, `networkRoleCapacity`) ;
 *   la fiche, les pièces et la décision restent `pages/claims` (`getPageClaim`,
 *   `decidePageClaim`). `party` y dit le conflit d'intérêts : le demandeur, ou
 *   toute personne qui a une ligne de signataire sur la page, même invitée.
 */
import type { ModerationSurface } from "@antsia/social-domain/moderationPolicy"
import { isCountryCode, normalizeCountryCode } from "@diasporale/domain"
import { paginationOptsValidator, type PaginationOptions } from "convex/server"
import { v } from "convex/values"

import type { Doc, Id } from "../../_generated/dataModel"
import type { QueryCtx } from "../../_generated/server"
import { isActiveMember } from "../../lib/access"
import { fail, notFound } from "../../lib/errors"
import { networkQuery } from "../../lib/functions"
import { requireReportCapacity, teamCapacity } from "../moderation/cases"
import { contentState } from "../moderation/policy"
import { moderationSurfaceValidator, moderationTargetValidator, sanctionKindValidator } from "../moderation/tables"
import { liveSignatoryRole, pageCardOf, signatoryRowOf } from "../pages/access"
import { pageCardValidator } from "../pages/validators"
import { findPublishedPersonByHandle, livePersonProfile } from "../people/miniProfile"
import { canHoldNetworkRole, NETWORK_RESPONSIBLE_ROLES, NETWORK_ROLE_HOLDERS_MAX } from "../people/networkRoles"
import { networkRoleCapacity } from "../platform/audit"
import { assertDiasporaNetwork } from "./facts"

type ReadCtx = Pick<QueryCtx, "db">
/** Le contexte d'une lecture de guichet : celui de `networkQuery` (adhésion relue par le constructeur). */
type DeskCtx = ReadCtx & {
  networkId: Id<"networks">
  network: Doc<"networks">
  rootNetwork: Doc<"networks">
  person: Doc<"persons">
  membership: Doc<"networkMemberships">
}
type Target = Doc<"reports">["target"]
type Zone = { readonly kind: "all" } | { readonly kind: "none" } | { readonly kind: "country"; readonly country: string }
type TargetFacts = { readonly country: string | null; readonly pageIds: readonly Id<"pages">[] }
type Party = "author" | "reporter" | "page" | "decider"
type SignatureCache = Map<string, boolean>
type TeamNameCache = Map<string, string | null>

/** Lignes brutes relues par fenêtre de file (l'écran en demande vingt ; le moteur borne ses pages à cinquante). */
export const DESK_WINDOW_MAX = 25
/** Recours : la borne de `networkAppeals.paginate`. */
export const DESK_APPEALS_WINDOW_MAX = 20
/** Décisions antérieures montrées sur la même cible. */
export const DESK_HISTORY_MAX = 5
/** Membres actifs rendus pour la composition d'une équipe. */
export const DESK_ROSTER_MAX = 100
/** Octets relus par fenêtre. */
const DESK_WINDOW_BYTES = 1_048_576
/** Équipes actives relues : la borne du moteur (`myCapacity`, `report`, `paginatePending`). */
const TEAMS_SCAN = 100
/** Lignes d'équipe relues (actives et anciennes) pour en extraire les membres actifs. */
const ROSTER_SCAN = 200
/** Longueur au-delà de laquelle un identifiant saisi ne désigne personne. */
const HANDLE_INPUT_MAX = 80
/** Sanctions relues par dossier : le moteur en admet cinq au plus. */
const SANCTIONS_SCAN = 6

const NO_FACTS: TargetFacts = { country: null, pageIds: [] }

// ── Validateurs ────────────────────────────────────────────────────────────

const zoneValidator = v.union(
  v.object({ kind: v.literal("all") }),
  v.object({ kind: v.literal("none") }),
  v.object({ kind: v.literal("country"), country: v.string() }),
)
const openStatusValidator = v.union(v.literal("open"), v.literal("reviewing"))
const levelValidator = v.union(v.literal("team"), v.literal("network"), v.literal("platform"))
const partyValidator = v.union(v.literal("author"), v.literal("reporter"), v.literal("page"), v.literal("decider"), v.null())
const countryValidator = v.union(v.string(), v.null())
const cursorValidator = v.union(v.string(), v.null())

const deskTeamValidator = v.object({
  teamId: v.id("moderationTeams"),
  name: v.string(),
  scope: v.union(moderationSurfaceValidator, v.null()),
  isMember: v.boolean(),
})
type DeskTeamRow = typeof deskTeamValidator.type

const deskValidator = v.object({
  role: v.union(v.literal("network_admin"), v.literal("network_moderator"), v.literal("team_member")),
  networkWide: v.boolean(),
  canReviewAppeals: v.boolean(),
  canManageTeams: v.boolean(),
  /** MD-04 : régler la modération du réseau (relecture, liens, cadence, mots bloqués) — la règle de `cases.myCapacity` (MC-02). */
  canManagePolicy: v.boolean(),
  teams: v.array(deskTeamValidator),
})

const caseValidator = v.object({
  reportId: v.id("reports"),
  surface: moderationSurfaceValidator,
  country: countryValidator,
  /** Le code du motif de signalement (jamais la note du déclarant). */
  reason: v.string(),
  status: openStatusValidator,
  level: levelValidator,
  teamName: v.union(v.string(), v.null()),
  createdAt: v.number(),
  /** Une personne peut-elle recevoir une sanction (le moteur refuse sinon toute mesure autre que le retrait) ? */
  hasAuthor: v.boolean(),
  party: partyValidator,
})
type CaseRow = typeof caseValidator.type

const historyValidator = v.object({
  status: v.union(v.literal("dismissed"), v.literal("actioned")),
  origin: v.union(v.literal("reader"), v.literal("pre_review")),
  decidedAt: v.union(v.number(), v.null()),
  decisionReason: v.union(v.string(), v.null()),
  sanctions: v.array(sanctionKindValidator),
})
type HistoryRow = typeof historyValidator.type

const pendingValidator = v.object({
  target: moderationTargetValidator,
  surface: moderationSurfaceValidator,
  country: countryValidator,
  teamName: v.union(v.string(), v.null()),
  updatedAt: v.number(),
  party: partyValidator,
})
type PendingRow = typeof pendingValidator.type

const appealValidator = v.object({
  appealId: v.id("appeals"),
  reportId: v.id("reports"),
  surface: moderationSurfaceValidator,
  country: countryValidator,
  reason: v.string(),
  appealReason: v.string(),
  createdAt: v.number(),
  decisionReason: v.union(v.string(), v.null()),
  decidedAt: v.union(v.number(), v.null()),
  sanctions: v.array(v.object({ kind: sanctionKindValidator, until: v.union(v.number(), v.null()) })),
  party: partyValidator,
})
type AppealRow = typeof appealValidator.type

const memberValidator = v.object({
  personId: v.id("persons"),
  handle: v.union(v.string(), v.null()),
  displayName: v.union(v.string(), v.null()),
  inNetwork: v.boolean(),
  isMe: v.boolean(),
})
type MemberRow = typeof memberValidator.type

const responsibleValidator = v.object({
  personId: v.id("persons"),
  role: v.union(v.literal("network_admin"), v.literal("network_moderator")),
  handle: v.union(v.string(), v.null()),
  displayName: v.union(v.string(), v.null()),
  /** Le rôle s'exerce : adhésion active, « déclarée » au moins, sans suspension. */
  active: v.boolean(),
  isMe: v.boolean(),
})
type ResponsibleRow = typeof responsibleValidator.type

/** AS-01 : une revendication en attente, sans note ni pièce ni demandeur (la fiche est `pages/claims.getPageClaim`). */
const claimValidator = v.object({
  claimId: v.id("pageClaims"),
  page: pageCardValidator,
  country: countryValidator,
  evidenceCount: v.number(),
  createdAt: v.number(),
  party: v.union(v.literal("author"), v.literal("page"), v.null()),
})
type ClaimRow = typeof claimValidator.type

// ── Règles de lecture ──────────────────────────────────────────────────────

/** Un code ISO 3166-1 alpha-2 connu, ou `null` (absent ou illisible : « sans pays »). */
function countryCode(raw: string | undefined): string | null {
  if (raw === undefined) return null
  const code = normalizeCountryCode(raw)
  return isCountryCode(code) ? code : null
}

function zoneOf(zone: typeof zoneValidator.type): Zone {
  if (zone.kind !== "country") return zone
  const country = countryCode(zone.country)
  return country === null ? fail("invalidArgument", { field: "country" }) : { kind: "country" as const, country }
}

function inZone(zone: Zone, country: string | null): boolean {
  if (zone.kind === "all") return true
  if (zone.kind === "none") return country === null
  return country === zone.country
}

/** Une fenêtre : au plus `maximum` lignes brutes et un mégaoctet, quel que soit le budget demandé. */
function boundedWindow(options: PaginationOptions, maximum: number): PaginationOptions {
  const requested = Number.isFinite(options.numItems) ? Math.trunc(options.numItems) : maximum
  return {
    cursor: options.cursor,
    numItems: Math.min(Math.max(requested, 1), maximum),
    maximumRowsRead: maximum,
    maximumBytesRead: DESK_WINDOW_BYTES,
  }
}

async function pageFacts(ctx: ReadCtx, networkId: Id<"networks">, pageId: Id<"pages"> | undefined): Promise<TargetFacts> {
  if (pageId === undefined) return NO_FACTS
  const page = await ctx.db.get(pageId)
  if (!page || page.networkId !== networkId) return NO_FACTS
  return { country: countryCode(page.country), pageIds: [page._id] }
}

async function postFacts(ctx: ReadCtx, networkId: Id<"networks">, postId: Id<"posts">): Promise<TargetFacts> {
  const post = await ctx.db.get(postId)
  if (!post || post.networkId !== networkId) return NO_FACTS
  const page = await pageFacts(ctx, networkId, post.pageId)
  return { country: countryCode(post.country) ?? page.country, pageIds: page.pageIds }
}

async function offerFacts(ctx: ReadCtx, networkId: Id<"networks">, offerId: Id<"serviceOffers">, pageId: Id<"pages">): Promise<TargetFacts> {
  const offer = await ctx.db.get(offerId)
  const page = await pageFacts(ctx, networkId, pageId)
  const zone = offer && offer.networkId === networkId ? countryCode(offer.country) : null
  return { country: zone ?? page.country, pageIds: page.pageIds }
}

/** Le pays que porte la cible et les pages dont elle relève — jamais le pays d'une personne. */
async function targetFacts(ctx: ReadCtx, networkId: Id<"networks">, target: Target): Promise<TargetFacts> {
  switch (target.kind) {
    case "post":
      return await postFacts(ctx, networkId, target.id)
    case "comment": {
      const comment = await ctx.db.get(target.id)
      return comment && comment.networkId === networkId ? await postFacts(ctx, networkId, comment.postId) : NO_FACTS
    }
    case "page":
      return await pageFacts(ctx, networkId, target.id)
    case "event": {
      const event = await ctx.db.get(target.id)
      return event && event.networkId === networkId ? await pageFacts(ctx, networkId, event.organizerPageId) : NO_FACTS
    }
    case "live": {
      const session = await ctx.db.get(target.id)
      return session && session.networkId === networkId ? await pageFacts(ctx, networkId, session.pageId) : NO_FACTS
    }
    case "serviceReview": {
      const review = await ctx.db.get(target.id)
      return review && review.networkId === networkId ? await offerFacts(ctx, networkId, review.offerId, review.pageId) : NO_FACTS
    }
    case "serviceReviewReply": {
      const reply = await ctx.db.get(target.id)
      if (!reply || reply.networkId !== networkId) return NO_FACTS
      const review = await ctx.db.get(reply.reviewId)
      return review && review.networkId === networkId ? await offerFacts(ctx, networkId, review.offerId, reply.pageId) : NO_FACTS
    }
    // Vague H (G9) : la zone que porte le contenu, jamais le pays de résidence d'une personne.
    case "diasporaAidQuestion": {
      const question = await ctx.db.get(target.id)
      return question && question.networkId === networkId ? { country: countryCode(question.country), pageIds: [] } : NO_FACTS
    }
    case "diasporaAidAnswer": {
      const answer = await ctx.db.get(target.id)
      const question = answer && answer.networkId === networkId ? await ctx.db.get(answer.questionId) : null
      return question && question.networkId === networkId ? { country: countryCode(question.country), pageIds: [] } : NO_FACTS
    }
    case "diasporaAidMission": {
      const mission = await ctx.db.get(target.id)
      if (!mission || mission.networkId !== networkId) return NO_FACTS
      const page = await pageFacts(ctx, networkId, mission.pageId)
      return { country: countryCode(mission.country) ?? page.country, pageIds: page.pageIds }
    }
    case "diasporaMentorProfile": {
      const profile = await ctx.db.get(target.id)
      return profile && profile.networkId === networkId ? { country: countryCode(profile.country), pageIds: [] } : NO_FACTS
    }
    case "diasporaMentoringRequest": {
      const request = await ctx.db.get(target.id)
      const profile = request && request.networkId === networkId ? await ctx.db.get(request.mentorProfileId) : null
      return profile && profile.networkId === networkId ? { country: countryCode(profile.country), pageIds: [] } : NO_FACTS
    }
    case "diasporaKitResource": {
      const resource = await ctx.db.get(target.id)
      if (!resource || resource.networkId !== networkId) return NO_FACTS
      const page = await pageFacts(ctx, networkId, resource.pageId)
      return { country: countryCode(resource.country) ?? page.country, pageIds: page.pageIds }
    }
    case "diasporaJobOffer": {
      const offer = await ctx.db.get(target.id)
      if (!offer || offer.networkId !== networkId) return NO_FACTS
      const page = await pageFacts(ctx, networkId, offer.pageId)
      return { country: countryCode(offer.country) ?? page.country, pageIds: page.pageIds }
    }
    case "diasporaTalentProfile": {
      const profile = await ctx.db.get(target.id)
      return profile && profile.networkId === networkId ? { country: countryCode(profile.country), pageIds: [] } : NO_FACTS
    }
    case "diasporaJobApplication": {
      const application = await ctx.db.get(target.id)
      if (!application || application.networkId !== networkId) return NO_FACTS
      const offer = await ctx.db.get(application.offerId)
      const page = await pageFacts(ctx, networkId, application.pageId)
      const zone = offer && offer.networkId === networkId ? countryCode(offer.country) : null
      return { country: zone ?? page.country, pageIds: page.pageIds }
    }
    // Compte, messages, statut, album, offres de boutique et d'emploi reflétées : aucun pays porté.
    default:
      return NO_FACTS
  }
}

/** La cible typée d'un état de modération (identifiant relu dans SA table), ou `null`. */
function typedTarget(ctx: ReadCtx, kind: ModerationSurface, id: string): Target | null {
  switch (kind) {
    case "post": {
      const typed = ctx.db.normalizeId("posts", id)
      return typed === null ? null : { kind: "post" as const, id: typed }
    }
    case "comment": {
      const typed = ctx.db.normalizeId("postComments", id)
      return typed === null ? null : { kind: "comment" as const, id: typed }
    }
    case "groupMessage": {
      const typed = ctx.db.normalizeId("groupMessages", id)
      return typed === null ? null : { kind: "groupMessage" as const, id: typed }
    }
    case "event": {
      const typed = ctx.db.normalizeId("events", id)
      return typed === null ? null : { kind: "event" as const, id: typed }
    }
    case "page": {
      const typed = ctx.db.normalizeId("pages", id)
      return typed === null ? null : { kind: "page" as const, id: typed }
    }
    case "person": {
      const typed = ctx.db.normalizeId("persons", id)
      return typed === null ? null : { kind: "person" as const, id: typed }
    }
    case "live": {
      const typed = ctx.db.normalizeId("liveSessions", id)
      return typed === null ? null : { kind: "live" as const, id: typed }
    }
    case "story": {
      const typed = ctx.db.normalizeId("stories", id)
      return typed === null ? null : { kind: "story" as const, id: typed }
    }
    case "album": {
      const typed = ctx.db.normalizeId("albums", id)
      return typed === null ? null : { kind: "album" as const, id: typed }
    }
    case "serviceReview": {
      const typed = ctx.db.normalizeId("serviceReviews", id)
      return typed === null ? null : { kind: "serviceReview" as const, id: typed }
    }
    case "serviceReviewReply": {
      const typed = ctx.db.normalizeId("serviceReviewReplies", id)
      return typed === null ? null : { kind: "serviceReviewReply" as const, id: typed }
    }
    case "commerceOffer": {
      const typed = ctx.db.normalizeId("commerceCatalogHeads", id)
      return typed === null ? null : { kind: "commerceOffer" as const, id: typed }
    }
    case "commercialMessage": {
      const typed = ctx.db.normalizeId("commercialMessages", id)
      return typed === null ? null : { kind: "commercialMessage" as const, id: typed }
    }
    case "commerceJob": {
      const typed = ctx.db.normalizeId("commerceJobHeads", id)
      return typed === null ? null : { kind: "commerceJob" as const, id: typed }
    }
    // Vague H (G9) : chaque nature relue dans SA table.
    case "diasporaAidQuestion": {
      const typed = ctx.db.normalizeId("aidQuestions", id)
      return typed === null ? null : { kind: "diasporaAidQuestion" as const, id: typed }
    }
    case "diasporaAidAnswer": {
      const typed = ctx.db.normalizeId("aidAnswers", id)
      return typed === null ? null : { kind: "diasporaAidAnswer" as const, id: typed }
    }
    case "diasporaAidMission": {
      const typed = ctx.db.normalizeId("aidMissions", id)
      return typed === null ? null : { kind: "diasporaAidMission" as const, id: typed }
    }
    case "diasporaMentorProfile": {
      const typed = ctx.db.normalizeId("mentorProfiles", id)
      return typed === null ? null : { kind: "diasporaMentorProfile" as const, id: typed }
    }
    case "diasporaMentoringRequest": {
      const typed = ctx.db.normalizeId("mentoringRequests", id)
      return typed === null ? null : { kind: "diasporaMentoringRequest" as const, id: typed }
    }
    case "diasporaKitResource": {
      const typed = ctx.db.normalizeId("kitResources", id)
      return typed === null ? null : { kind: "diasporaKitResource" as const, id: typed }
    }
    case "diasporaJobOffer": {
      const typed = ctx.db.normalizeId("jobOffers", id)
      return typed === null ? null : { kind: "diasporaJobOffer" as const, id: typed }
    }
    case "diasporaTalentProfile": {
      const typed = ctx.db.normalizeId("talentProfiles", id)
      return typed === null ? null : { kind: "diasporaTalentProfile" as const, id: typed }
    }
    case "diasporaJobApplication": {
      const typed = ctx.db.normalizeId("jobApplications", id)
      return typed === null ? null : { kind: "diasporaJobApplication" as const, id: typed }
    }
    // Une nature ajoutée au moteur sans cas ici reste hors du guichet, jamais mal typée.
    default:
      return null
  }
}

/** La personne parle-t-elle au nom d'une de ces pages (signature VIVANTE, règle du moteur) ? */
async function signsAnyPage(ctx: ReadCtx, personId: Id<"persons">, pageIds: readonly Id<"pages">[], cache: SignatureCache): Promise<boolean> {
  for (const pageId of pageIds) {
    let signs = cache.get(pageId)
    if (signs === undefined) {
      const page = await ctx.db.get(pageId)
      signs = page !== null && (await liveSignatoryRole(ctx, page, personId)) !== null
      cache.set(pageId, signs)
    }
    if (signs) return true
  }
  return false
}

/** Les pages dont relève la cible : celle de son état de modération (écriture collective), puis les siennes. */
async function ownerPagesOf(ctx: ReadCtx, kind: ModerationSurface, id: string, facts: TargetFacts): Promise<readonly Id<"pages">[]> {
  const state = await contentState(ctx, kind, id)
  const owner = state?.ownerPageId
  return owner !== undefined ? [owner, ...facts.pageIds] : facts.pageIds
}

async function caseParty(ctx: DeskCtx, row: Doc<"reports">, facts: TargetFacts, cache: SignatureCache): Promise<Party | null> {
  if (row.ownerPersonId === ctx.person._id) return "author"
  if (row.reviewedByPersonId === ctx.person._id) return "decider"
  if (row.reporterPersonId === ctx.person._id) return "reporter"
  return (await signsAnyPage(ctx, ctx.person._id, await ownerPagesOf(ctx, row.targetKind, row.targetId, facts), cache)) ? "page" : null
}

async function appealParty(ctx: DeskCtx, appeal: Doc<"appeals">, row: Doc<"reports">, facts: TargetFacts, cache: SignatureCache): Promise<Party | null> {
  if (appeal.personId === ctx.person._id) return "author"
  return await caseParty(ctx, row, facts, cache)
}

async function teamNameOf(ctx: ReadCtx, teamId: Id<"moderationTeams"> | undefined, cache: TeamNameCache): Promise<string | null> {
  if (teamId === undefined) return null
  const known = cache.get(teamId)
  if (known !== undefined) return known
  const team = await ctx.db.get(teamId)
  const name = team?.name ?? null
  cache.set(teamId, name)
  return name
}

/** Un dossier OUVERT tel que la file le montre ; un dossier tranché n'a pas de ligne. */
async function caseRowOf(ctx: DeskCtx, row: Doc<"reports">, facts: TargetFacts, caches: { teams: TeamNameCache; signatures: SignatureCache }): Promise<CaseRow | null> {
  if (row.status !== "open" && row.status !== "reviewing") return null
  return {
    reportId: row._id,
    surface: row.targetKind,
    country: facts.country,
    reason: row.reason,
    status: row.status,
    level: row.level,
    teamName: await teamNameOf(ctx, row.teamId, caches.teams),
    createdAt: row.createdAt,
    hasAuthor: row.ownerPersonId !== undefined,
    party: await caseParty(ctx, row, facts, caches.signatures),
  }
}

/**
 * La file lue : celle d'une équipe (compétence d'équipe vivante, comme
 * `cases.paginateQueue`) ou celle du réseau (rôle réseau seulement).
 */
async function requireQueueScope(ctx: DeskCtx, teamId: Id<"moderationTeams"> | undefined): Promise<Doc<"moderationTeams"> | null> {
  if (teamId === undefined) {
    if (!networkRoleCapacity(ctx.membership.role)) return notFound()
    return null
  }
  const team = await ctx.db.get(teamId)
  if (!team || team.networkId !== ctx.networkId || !(await teamCapacity(ctx, ctx, team.scope ?? "", team._id))) return notFound()
  return team
}

function guardDesk(ctx: DeskCtx, expectedPersonId: Id<"persons">): void {
  assertDiasporaNetwork(ctx.network)
  if (expectedPersonId !== ctx.person._id) notFound()
}

// ── Fonctions ──────────────────────────────────────────────────────────────

/**
 * Ma capacité de modération dans DIASPORALE : rôle réseau, équipes vivantes
 * (toutes pour l'administration du réseau, les siennes sinon). `null` pour un
 * membre sans compétence : rien n'est dit des équipes ni de leurs membres.
 * Les réglages (MD-04) se lisent et se posent par les fonctions du moteur
 * (`cases.policies`, `cases.blockedTermsPage`, `cases.setPolicy`,
 * `cases.setBlockedTerm`), ouvertes à l'administration de CE réseau : le guichet
 * dit seulement qui y a droit.
 */
export const myDesk = networkQuery({
  minStatus: "declaree",
  args: { expectedPersonId: v.id("persons") },
  returns: v.union(deskValidator, v.null()),
  handler: async (ctx, { expectedPersonId }) => {
    guardDesk(ctx, expectedPersonId)
    const admin = ctx.membership.role === "network_admin"
    const networkWide = networkRoleCapacity(ctx.membership.role) !== null
    const rows = await ctx.db
      .query("moderationTeams")
      .withIndex("by_network_active", (q) => q.eq("networkId", ctx.networkId).eq("active", true))
      .take(TEAMS_SCAN + 1)
    if (rows.length > TEAMS_SCAN) return fail("policyRefused")
    const teams: DeskTeamRow[] = []
    for (const team of rows) {
      const member = await ctx.db
        .query("moderationTeamMembers")
        .withIndex("by_team_person", (q) => q.eq("teamId", team._id).eq("personId", ctx.person._id))
        .unique()
      const isMember = member?.active === true
      if (admin || isMember) teams.push({ teamId: team._id, name: team.name, scope: team.scope ?? null, isMember })
    }
    if (!networkWide && teams.length === 0) return null
    return {
      role: admin ? ("network_admin" as const) : networkWide ? ("network_moderator" as const) : ("team_member" as const),
      networkWide,
      canReviewAppeals: admin,
      canManageTeams: admin,
      // MD-04 : seule l'administration du réseau lit et pose les réglages (`cases.policies`, `cases.setPolicy`…).
      canManagePolicy: admin,
      teams,
    }
  },
})

/**
 * Une fenêtre de la file des signalements ouverts, filtrée par pays de la
 * cible, nature et équipe ; la plus ancienne d'abord. Chaque ligne repasse la
 * compétence du moteur (`teamCapacity`).
 */
export const queue = networkQuery({
  minStatus: "declaree",
  args: {
    expectedPersonId: v.id("persons"),
    zone: zoneValidator,
    surface: v.optional(moderationSurfaceValidator),
    teamId: v.optional(v.id("moderationTeams")),
    status: v.optional(openStatusValidator),
    paginationOpts: paginationOptsValidator,
  },
  returns: v.object({ items: v.array(caseValidator), continueCursor: cursorValidator, isDone: v.boolean() }),
  handler: async (ctx, args) => {
    guardDesk(ctx, args.expectedPersonId)
    const zone = zoneOf(args.zone)
    const team = await requireQueueScope(ctx, args.teamId)
    const status = args.status ?? "open"
    const options = boundedWindow(args.paginationOpts, DESK_WINDOW_MAX)
    const result = team
      ? await ctx.db
          .query("reports")
          .withIndex("by_team_status_createdAt", (q) => q.eq("teamId", team._id).eq("status", status))
          .paginate(options)
      : await ctx.db
          .query("reports")
          .withIndex("by_network_status_createdAt", (q) => q.eq("networkId", ctx.networkId).eq("status", status))
          .paginate(options)
    const caches = { teams: new Map<string, string | null>(), signatures: new Map<string, boolean>() }
    const items: CaseRow[] = []
    for (const row of result.page) {
      if (row.networkId !== ctx.networkId) continue
      if (args.surface !== undefined && row.targetKind !== args.surface) continue
      if (!(await teamCapacity(ctx, ctx, row.targetKind, row.teamId))) continue
      const facts = await targetFacts(ctx, ctx.networkId, row.target)
      if (!inZone(zone, facts.country)) continue
      const item = await caseRowOf(ctx, row, facts, caches)
      if (item) items.push(item)
    }
    return { items, continueCursor: result.isDone ? null : result.continueCursor, isDone: result.isDone }
  },
})

/**
 * Un dossier encore ouvert et de ma compétence, avec les décisions antérieures
 * prises sur la même cible (de ma compétence aussi). Tranché entre-temps : le
 * refus indistinct ; l'aperçu reste la projection bornée du moteur.
 */
export const caseDetail = networkQuery({
  minStatus: "declaree",
  args: { expectedPersonId: v.id("persons"), reportId: v.id("reports") },
  returns: v.object({ case: caseValidator, history: v.array(historyValidator), historyMore: v.boolean() }),
  handler: async (ctx, { expectedPersonId, reportId }) => {
    guardDesk(ctx, expectedPersonId)
    const row = await ctx.db.get(reportId)
    if (!row || row.networkId !== ctx.networkId || !(await requireReportCapacity(ctx, ctx, row))) return notFound()
    const facts = await targetFacts(ctx, ctx.networkId, row.target)
    const current = await caseRowOf(ctx, row, facts, { teams: new Map<string, string | null>(), signatures: new Map<string, boolean>() })
    if (!current) return notFound()
    const actioned = await ctx.db
      .query("reports")
      .withIndex("by_target_status", (q) => q.eq("targetKind", row.targetKind).eq("targetId", row.targetId).eq("status", "actioned"))
      .order("desc")
      .take(DESK_HISTORY_MAX + 1)
    const dismissed = await ctx.db
      .query("reports")
      .withIndex("by_target_status", (q) => q.eq("targetKind", row.targetKind).eq("targetId", row.targetId).eq("status", "dismissed"))
      .order("desc")
      .take(DESK_HISTORY_MAX + 1)
    const visible: Doc<"reports">[] = []
    for (const item of [...actioned, ...dismissed]) {
      if (item._id === row._id || item.networkId !== ctx.networkId) continue
      if (await teamCapacity(ctx, ctx, item.targetKind, item.teamId)) visible.push(item)
    }
    visible.sort((a, b) => (b.reviewedAt ?? b.updatedAt) - (a.reviewedAt ?? a.updatedAt))
    const history: HistoryRow[] = []
    for (const item of visible.slice(0, DESK_HISTORY_MAX)) {
      const sanctions = await ctx.db
        .query("sanctions")
        .withIndex("by_report", (q) => q.eq("reportId", item._id))
        .take(SANCTIONS_SCAN)
      history.push({
        status: item.status === "actioned" ? ("actioned" as const) : ("dismissed" as const),
        origin: item.source === "pre_review" ? ("pre_review" as const) : ("reader" as const),
        decidedAt: item.reviewedAt ?? null,
        decisionReason: item.decisionReason ?? null,
        sanctions: [...new Set(sanctions.map((sanction) => sanction.kind))],
      })
    }
    return { case: current, history, historyMore: visible.length > DESK_HISTORY_MAX }
  },
})

/**
 * Une fenêtre des contenus en relecture préalable (« pages à vérifier,
 * évènements en relecture »), filtrée comme la file ; l'équipe d'un contenu est
 * celle que choisit le moteur (`paginatePending`). Décision : `cases.reviewContent`.
 */
export const pendingQueue = networkQuery({
  minStatus: "declaree",
  args: {
    expectedPersonId: v.id("persons"),
    zone: zoneValidator,
    surface: v.optional(moderationSurfaceValidator),
    teamId: v.optional(v.id("moderationTeams")),
    paginationOpts: paginationOptsValidator,
  },
  returns: v.object({ items: v.array(pendingValidator), continueCursor: cursorValidator, isDone: v.boolean() }),
  handler: async (ctx, args) => {
    guardDesk(ctx, args.expectedPersonId)
    const zone = zoneOf(args.zone)
    const scoped = await requireQueueScope(ctx, args.teamId)
    const teams = await ctx.db
      .query("moderationTeams")
      .withIndex("by_network_active", (q) => q.eq("networkId", ctx.networkId).eq("active", true))
      .take(TEAMS_SCAN + 1)
    if (teams.length > TEAMS_SCAN) return notFound()
    const result = await ctx.db
      .query("moderationContentStates")
      .withIndex("by_network_status_updatedAt", (q) => q.eq("networkId", ctx.networkId).eq("status", "pending_review"))
      .paginate(boundedWindow(args.paginationOpts, DESK_WINDOW_MAX))
    const signatures: SignatureCache = new Map()
    const items: PendingRow[] = []
    for (const row of result.page) {
      if (args.surface !== undefined && row.targetKind !== args.surface) continue
      const team = teams.find((item) => item.scope === row.targetKind) ?? teams.find((item) => item.scope === undefined)
      if (scoped && team?._id !== scoped._id) continue
      if (!(await teamCapacity(ctx, ctx, row.targetKind, team?._id))) continue
      const target = typedTarget(ctx, row.targetKind, row.targetId)
      if (!target) continue
      const facts = await targetFacts(ctx, ctx.networkId, target)
      if (!inZone(zone, facts.country)) continue
      const owner = row.ownerPageId
      const pageIds = owner !== undefined ? [owner, ...facts.pageIds] : facts.pageIds
      const party: Party | null = row.ownerPersonId === ctx.person._id
        ? "author"
        : (await signsAnyPage(ctx, ctx.person._id, pageIds, signatures)) ? "page" : null
      items.push({ target, surface: row.targetKind, country: facts.country, teamName: team?.name ?? null, updatedAt: row.updatedAt, party })
    }
    return { items, continueCursor: result.isDone ? null : result.continueCursor, isDone: result.isDone }
  },
})

/**
 * Les recours du réseau à examiner, avec les gardes de `networkAppeals.paginate`
 * (administration du réseau, recours de niveau réseau sur un dossier d'équipe,
 * sanctions du même réseau), filtrés par pays et nature ; le plus ancien d'abord.
 * Décision : `cases.reviewNetworkAppeal`.
 */
export const appealQueue = networkQuery({
  minStatus: "declaree",
  args: {
    expectedPersonId: v.id("persons"),
    zone: zoneValidator,
    surface: v.optional(moderationSurfaceValidator),
    paginationOpts: paginationOptsValidator,
  },
  returns: v.object({ items: v.array(appealValidator), continueCursor: cursorValidator, isDone: v.boolean() }),
  handler: async (ctx, args) => {
    guardDesk(ctx, args.expectedPersonId)
    if (ctx.membership.role !== "network_admin") return notFound()
    if (ctx.network.kind === "closed" && ctx.network.parentId !== ctx.rootNetwork._id) return notFound()
    const zone = zoneOf(args.zone)
    const result = await ctx.db
      .query("appeals")
      .withIndex("by_network_status_createdAt", (q) => q.eq("networkId", ctx.networkId).eq("status", "open"))
      .paginate(boundedWindow(args.paginationOpts, DESK_APPEALS_WINDOW_MAX))
    const signatures: SignatureCache = new Map()
    const items: AppealRow[] = []
    for (const appeal of result.page) {
      if (appeal.level !== "network") continue
      const report = await ctx.db.get(appeal.reportId)
      if (!report || report.networkId !== ctx.networkId || report.level !== "team") continue
      if (args.surface !== undefined && report.targetKind !== args.surface) continue
      const sanctions = await ctx.db
        .query("sanctions")
        .withIndex("by_report", (q) => q.eq("reportId", report._id))
        .take(SANCTIONS_SCAN)
      if (sanctions.length > SANCTIONS_SCAN - 1) return fail("policyRefused")
      if (sanctions.some((sanction) => sanction.networkId !== ctx.networkId)) continue
      const facts = await targetFacts(ctx, ctx.networkId, report.target)
      if (!inZone(zone, facts.country)) continue
      items.push({
        appealId: appeal._id,
        reportId: report._id,
        surface: report.targetKind,
        country: facts.country,
        reason: report.reason,
        appealReason: appeal.reason,
        createdAt: appeal.createdAt,
        decisionReason: report.decisionReason ?? null,
        decidedAt: report.reviewedAt ?? null,
        sanctions: sanctions.map((sanction) => ({ kind: sanction.kind, until: sanction.until ?? null })),
        party: await appealParty(ctx, appeal, report, facts, signatures),
      })
    }
    return { items, continueCursor: result.isDone ? null : result.continueCursor, isDone: result.isDone }
  },
})

/**
 * La composition d'une équipe active, pour l'administration du réseau seule
 * (responsables identifiés par leur profil PUBLIÉ) ; `inNetwork` signale un
 * membre d'équipe qui n'est plus membre actif du réseau.
 */
export const teamRoster = networkQuery({
  minStatus: "declaree",
  args: { expectedPersonId: v.id("persons"), teamId: v.id("moderationTeams") },
  returns: v.object({ members: v.array(memberValidator), more: v.boolean() }),
  handler: async (ctx, { expectedPersonId, teamId }) => {
    guardDesk(ctx, expectedPersonId)
    if (ctx.membership.role !== "network_admin") return notFound()
    const team = await ctx.db.get(teamId)
    if (!team || team.networkId !== ctx.networkId || !team.active) return notFound()
    const rows = await ctx.db
      .query("moderationTeamMembers")
      .withIndex("by_team_person", (q) => q.eq("teamId", team._id))
      .take(ROSTER_SCAN)
    const active = rows.filter((row) => row.active && row.networkId === ctx.networkId)
    const members: MemberRow[] = []
    for (const row of active.slice(0, DESK_ROSTER_MAX)) {
      const person = await livePersonProfile(ctx, row.personId)
      members.push({
        personId: row.personId,
        handle: person?.handle ?? null,
        displayName: person?.displayName ?? null,
        inNetwork: await isActiveMember(ctx, ctx.networkId, row.personId),
        isMe: row.personId === ctx.person._id,
      })
    }
    return { members, more: active.length > DESK_ROSTER_MAX || rows.length === ROSTER_SCAN }
  },
})

/**
 * MD-01 et LX-03 — les responsables du réseau, administration d'abord puis
 * modération, pour l'administration du réseau seule (tout autre membre : le
 * refus indistinct). Chacun est identifié par son profil PUBLIÉ, jamais par une
 * coordonnée ni un nom civil ; `active` dit si le rôle s'exerce (une adhésion
 * en attente ou suspendue le garde sans le faire valoir). Lecture bornée par
 * l'index du rôle, au plus `NETWORK_ROLE_HOLDERS_MAX` titulaires par rôle (la
 * borne de l'aide du moteur) ; `more` dit qu'il en existe au-delà.
 */
export const responsibles = networkQuery({
  minStatus: "declaree",
  args: { expectedPersonId: v.id("persons") },
  returns: v.object({ members: v.array(responsibleValidator), more: v.boolean() }),
  handler: async (ctx, { expectedPersonId }) => {
    guardDesk(ctx, expectedPersonId)
    if (ctx.membership.role !== "network_admin") return notFound()
    const members: ResponsibleRow[] = []
    let more = false
    for (const role of NETWORK_RESPONSIBLE_ROLES) {
      const rows = await ctx.db
        .query("networkMemberships")
        .withIndex("by_network_and_role", (q) => q.eq("networkId", ctx.networkId).eq("role", role))
        .take(NETWORK_ROLE_HOLDERS_MAX + 1)
      if (rows.length > NETWORK_ROLE_HOLDERS_MAX) more = true
      for (const row of rows.slice(0, NETWORK_ROLE_HOLDERS_MAX)) {
        const person = await livePersonProfile(ctx, row.personId)
        members.push({
          personId: row.personId,
          role,
          handle: person?.handle ?? null,
          displayName: person?.displayName ?? null,
          active: await canHoldNetworkRole(ctx, ctx.networkId, row.personId),
          isMe: row.personId === ctx.person._id,
        })
      }
    }
    return { members, more }
  },
})

/**
 * Le membre actif du réseau désigné par son identifiant public, pour
 * l'administration du réseau qui compose une équipe ou nomme un responsable ;
 * `null` sinon (identifiant inconnu, profil retiré, non-membre : la même réponse).
 */
export const teamCandidate = networkQuery({
  minStatus: "declaree",
  args: { expectedPersonId: v.id("persons"), handle: v.string() },
  returns: v.union(v.object({ personId: v.id("persons"), handle: v.string(), displayName: v.string() }), v.null()),
  handler: async (ctx, { expectedPersonId, handle }) => {
    guardDesk(ctx, expectedPersonId)
    if (ctx.membership.role !== "network_admin") return notFound()
    const raw = handle.trim().replace(/^@/, "")
    if (raw.length === 0 || raw.length > HANDLE_INPUT_MAX) return null
    const person = await findPublishedPersonByHandle(ctx, ctx.networkId, raw)
    if (!person) return null
    const published = person.handle ?? raw
    return { personId: person._id, handle: published, displayName: person.displayName ?? published }
  },
})

/**
 * AS-01 — une fenêtre des revendications de page EN ATTENTE (« Pages à
 * vérifier »), filtrée par le pays de la page, la plus ancienne d'abord. La
 * garde est celle de `pages/claims.paginatePageClaims` (rôle de réseau, sinon
 * le refus indistinct) ; aucune note, aucune pièce, aucun demandeur ici : la
 * fiche et la décision restent `pages/claims`. `party` dit le conflit
 * d'intérêts : le demandeur (`author`) ou toute personne qui a une ligne de
 * signataire sur la page, même invitée (`page`) ; l'écran n'offre alors pas le
 * geste.
 */
export const pageClaimQueue = networkQuery({
  minStatus: "declaree",
  args: { expectedPersonId: v.id("persons"), zone: zoneValidator, paginationOpts: paginationOptsValidator },
  returns: v.object({ items: v.array(claimValidator), continueCursor: cursorValidator, isDone: v.boolean() }),
  handler: async (ctx, args) => {
    guardDesk(ctx, args.expectedPersonId)
    if (networkRoleCapacity(ctx.membership.role) === null) return notFound()
    const zone = zoneOf(args.zone)
    const result = await ctx.db
      .query("pageClaims")
      .withIndex("by_network_status_createdAt", (q) => q.eq("networkId", ctx.networkId).eq("status", "pending"))
      .order("asc")
      .paginate(boundedWindow(args.paginationOpts, DESK_WINDOW_MAX))
    const items: ClaimRow[] = []
    for (const claim of result.page) {
      const page = await ctx.db.get(claim.pageId)
      if (!page || page.networkId !== ctx.networkId) continue
      const country = countryCode(page.country)
      if (!inZone(zone, country)) continue
      const party = claim.claimantPersonId === ctx.person._id
        ? ("author" as const)
        : (await signatoryRowOf(ctx, page._id, ctx.person._id)) !== null ? ("page" as const) : null
      items.push({ claimId: claim._id, page: await pageCardOf(ctx, page), country, evidenceCount: claim.evidenceStorageIds.length, createdAt: claim.createdAt, party })
    }
    return { items, continueCursor: result.isDone ? null : result.continueCursor, isDone: result.isDone }
  },
})
