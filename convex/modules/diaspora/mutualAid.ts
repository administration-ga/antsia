/**
 * Entraide DIASPORALE (DG-024 a, lot G8 du plan global) — tranche `diaspora`,
 * écrite par la session DIASPORALE (chantier « entraide ») :
 *
 * - les QUESTIONS d'entraide d'un pays (et d'une ville saisie, sans GPS), leurs
 *   réponses et la « réponse retenue » choisie par l'auteur de la question
 *   (une seule, révocable) ;
 * - les MISSIONS bénévoles portées par une page d'ASSOCIATION, gérées par ses
 *   signataires VIVANTS (relus à chaque acte, `liveSignatoryRole`), et les
 *   inscriptions des bénévoles, avec places relues dans la transaction.
 *
 * Gardes, dans cet ordre, pour chaque écriture : adhésion au réseau DIASPORALE
 * (constructeur) → éligibilité (capacité du statut, règle du domaine) → débit
 * (`diaspora.aid.post`, `.answer`, `.manage` ; le seau renforcé s'applique seul
 * aux comptes légers) → droit sur la ressource → règles du domaine
 * (`@diasporale/domain`, codes fermés `MUTUAL_AID_REFUSALS`).
 *
 * Lectures : bornées au réseau et paginées (cinquante lignes, deux mégaoctets au
 * plus) ; un auteur bloqué (dans un sens ou dans l'autre) n'est pas servi ; un
 * nom affiché vient du profil PUBLIÉ d'un membre actif, sinon le nom neutre
 * (`null`). La liste des bénévoles n'existe que pour l'équipe vivante de la page
 * (refus indistinct sinon). Aucune coordonnée n'entre ni ne sort : le contact
 * privé passe par la messagerie. Aucune écriture dans `notifications` (rédacteur
 * unique du moteur) ; les avis à prévoir sont listés pour la session ANTSIA.
 *
 * Confiance (G9) : questions, réponses et missions sont des surfaces de
 * modération du moteur (`diasporaAidQuestion`, `diasporaAidAnswer`,
 * `diasporaAidMission`). Chaque écriture passe par `moderateDiasporaWrite`
 * (publiée dès l'écriture sauf politique explicite du réseau) ; les lectures
 * publiques ne servent que ce que la modération sert (`isServedTo`) ; l'auteur
 * garde la vue privée de sa question (« Mes questions », sa fiche), l'équipe
 * vivante celle des missions de sa page ; retirer, clore ou se désinscrire
 * restent possibles sur un contenu retiré, le modifier non. Ces vues de GESTION
 * disent l'état de modération (`moderation` : publié, en relecture, retiré) —
 * « Mes questions » et la fiche de l'auteur, les réponses lues par leur auteur,
 * les missions de la page et leur fiche pour l'équipe ; `null` partout ailleurs.
 */
import {
  AID_PAGE_MAX,
  aidSignupBlocker,
  aidStatusWithoutAcceptedAnswer,
  checkAidAcceptedAnswer,
  checkAidAnswerGesture,
  checkAidAnswering,
  checkAidMissionGesture,
  checkAidMissionPlacesChange,
  checkAidMissionTiming,
  checkAidQuestionGesture,
  checkAidSignup,
  checkAidSignupWithdrawal,
  hasCapability,
  MUTUAL_AID_REFUSALS,
  parseAidAnswer,
  parseAidMission,
  parseAidPlaceFilter,
  parseAidQuestion,
  parseAidReason,
  type AidMissionDraft,
  type AidQuestionGesture,
  type AidSignupFacts,
  type MemberCapability,
  type MutualAidRefusal,
  type Result,
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
import { isBlockedBetween } from "../graph/graph"
import { liveSignatoryRole, pageCardOf, readablePageOrNull } from "../pages/access"
import { type PageCard, pageCardValidator } from "../pages/validators"
import { miniProfileCache } from "../people/miniProfile"
import { noticeAidAnswerAccepted, noticeAidAnswerPublished, noticeAidMissionSignup } from "./communityNotifications"
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
  aidMissionStatusValidator,
  aidQuestionListStatusValidator,
  aidQuestionStatusValidator,
  aidThemeValidator,
} from "./mutualAidTables"

/** Octets lus au plus par page de liste. */
const LIST_PAGE_BYTES = 2 * 1024 * 1024

// ═══════════════════════════════════════════════════════════════
// Projections (allowlistées : aucun identifiant de personne, aucune coordonnée)
// ═══════════════════════════════════════════════════════════════

/** Une personne telle que l'entraide la montre : son profil PUBLIÉ, ou le nom neutre (`null`). */
const aidPersonValidator = v.object({
  displayName: v.union(v.string(), v.null()),
  handle: v.union(v.string(), v.null()),
})

/**
 * G9 — l'état de modération, pour les seules vues de GESTION : l'auteur (« Mes questions », sa
 * fiche, ses réponses), l'équipe vivante de la page (ses missions, leur fiche). `null` pour tout
 * autre lecteur et dans les listes publiques : jamais un état servi à un tiers.
 */
const managedStateValidator = v.union(managedModerationStateValidator, v.null())

const questionCardValidator = v.object({
  questionId: v.id("aidQuestions"),
  title: v.string(),
  detail: v.string(),
  theme: aidThemeValidator,
  country: v.string(),
  city: v.union(v.string(), v.null()),
  status: aidQuestionStatusValidator,
  /** Les réponses publiées. */
  answerCount: v.number(),
  hasAcceptedAnswer: v.boolean(),
  author: aidPersonValidator,
  isMine: v.boolean(),
  createdAt: v.number(),
  /** Pour son auteur seul, dans « Mes questions » et sa fiche ; `null` ailleurs (listes publiques comprises). */
  moderation: managedStateValidator,
})

const answerValidator = v.object({
  answerId: v.id("aidAnswers"),
  questionId: v.id("aidQuestions"),
  body: v.string(),
  /** La version lue : son auteur la cite pour la modifier ou la retirer. */
  version: v.number(),
  author: aidPersonValidator,
  isMine: v.boolean(),
  isAccepted: v.boolean(),
  createdAt: v.number(),
  editedAt: v.union(v.number(), v.null()),
  /** Pour son auteur seul (publiée ou en relecture : retirée, elle ne se sert à personne) ; `null` pour tout autre lecteur. */
  moderation: managedStateValidator,
})

const questionDetailValidator = v.object({
  ...questionCardValidator.fields,
  /** La version lue : l'auteur la cite pour modifier, retenir, clore ou retirer. */
  version: v.number(),
  updatedAt: v.number(),
  editedAt: v.union(v.number(), v.null()),
  /** La réponse retenue, encore publiée et lisible par ce lecteur ; `null` sinon. */
  acceptedAnswer: v.union(answerValidator, v.null()),
  /** Le lecteur peut répondre (droit de publier, question ni close ni pleine). */
  canAnswer: v.boolean(),
  /** L'auteur peut modifier, retenir une réponse ou clore (droit de publier, question ouverte ou résolue). */
  canEdit: v.boolean(),
})

const missionCardValidator = v.object({
  missionId: v.id("aidMissions"),
  /** La carte de la page d'association (badge calculé) ; aucun signataire. */
  page: pageCardValidator,
  title: v.string(),
  description: v.string(),
  country: v.string(),
  city: v.string(),
  area: v.union(v.string(), v.null()),
  startsAt: v.number(),
  endsAt: v.union(v.number(), v.null()),
  timeZone: v.string(),
  places: v.number(),
  signupCount: v.number(),
  status: aidMissionStatusValidator,
  /** Le lecteur y est inscrit (inscription confirmée). */
  signedUp: v.boolean(),
  /** Pour l'équipe vivante seule, dans les missions de sa page et leur fiche ; `null` ailleurs (bénévoles compris). */
  moderation: managedStateValidator,
})

/** Pourquoi le lecteur ne peut pas (encore) s'inscrire : une règle de la mission, ou son statut dans le réseau. */
const signupRefusalValidator = literals([...MUTUAL_AID_REFUSALS, "status_insufficient"] as const)

const missionDetailValidator = v.object({
  ...missionCardValidator.fields,
  version: v.number(),
  cancelReason: v.union(v.string(), v.null()),
  signup: v.object({ allowed: v.boolean(), refusal: v.union(signupRefusalValidator, v.null()) }),
  /** Le lecteur est signataire vivant de la page : il gère la mission et lit ses bénévoles. */
  canManage: v.boolean(),
  createdAt: v.number(),
  updatedAt: v.number(),
})

const aidItemValidator = v.union(
  v.object({ kind: v.literal("question"), question: questionDetailValidator }),
  v.object({ kind: v.literal("mission"), mission: missionDetailValidator }),
  v.null(),
)

const volunteerValidator = v.object({
  signupId: v.id("aidMissionSignups"),
  /** Le nom PUBLIÉ, montré à l'équipe avec le consentement de la personne ; aucune coordonnée. */
  person: aidPersonValidator,
  signedUpAt: v.number(),
})

const missionPageValidator = v.object({
  pageId: v.id("pages"),
  handle: v.string(),
  name: v.string(),
  country: v.union(v.string(), v.null()),
  city: v.union(v.string(), v.null()),
})

type AidPerson = Infer<typeof aidPersonValidator>
type QuestionCard = Infer<typeof questionCardValidator>
type AnswerView = Infer<typeof answerValidator>
type QuestionDetail = Infer<typeof questionDetailValidator>
type MissionCard = Infer<typeof missionCardValidator>
type MissionDetail = Infer<typeof missionDetailValidator>
type AidItem = Infer<typeof aidItemValidator>
type Volunteer = Infer<typeof volunteerValidator>
type MissionPage = Infer<typeof missionPageValidator>

export type AidQuestionCardDto = QuestionCard
export type AidQuestionDetailDto = QuestionDetail
export type AidAnswerDto = AnswerView
export type AidMissionCardDto = MissionCard
export type AidMissionDetailDto = MissionDetail
export type AidVolunteerDto = Volunteer

type Scope = QueryCtx & { network: Doc<"networks">; networkId: Id<"networks">; person: Doc<"persons">; membership: Doc<"networkMemberships"> }
type ReadCtx = Pick<QueryCtx, "db">

/** Le texte relu par la modération (G9) : ce que la question ou la mission montre ; jamais gardé. */
function questionText(draft: { readonly title: string; readonly detail: string }): string {
  return `${draft.title}\n${draft.detail}`
}

function missionText(draft: { readonly title: string; readonly description: string; readonly area: string | null }): string {
  return [draft.title, draft.description, draft.area ?? ""].join("\n")
}

// ═══════════════════════════════════════════════════════════════
// Gardes
// ═══════════════════════════════════════════════════════════════

/** Refus de conflit (l'état a changé) ou de règle ; tout autre code est une saisie refusée. */
const CONFLICT_REFUSALS: ReadonlySet<MutualAidRefusal> = new Set([
  "aid_answers_limit_reached",
  "aid_version_conflict",
  "aid_question_closed",
  "aid_question_withdrawn",
  "aid_question_not_resolved",
  "aid_answer_withdrawn",
  "aid_answer_locked",
  "aid_answer_unavailable",
  "aid_mission_places_below_signups",
  "aid_mission_closed",
  "aid_mission_cancelled",
  "aid_mission_started",
  "aid_mission_full",
  "aid_signup_exists",
  "aid_signup_missing",
])
const POLICY_REFUSALS: ReadonlySet<MutualAidRefusal> = new Set(["aid_not_author", "aid_page_kind_not_allowed"])

function refuseAid(code: MutualAidRefusal): never {
  return failAppRule(code, {}, CONFLICT_REFUSALS.has(code) ? "conflict" : POLICY_REFUSALS.has(code) ? "policyRefused" : "invalidArgument")
}

/** La valeur d'une règle du domaine, ou son refus fermé. */
function ruled<T>(result: Result<T, MutualAidRefusal>): T {
  return result.ok ? result.value : refuseAid(result.code)
}

/** Éligibilité : la capacité du STATUT courant (expiration d'une sanction comprise), règle du domaine. */
function assertCapability(ctx: { membership: Doc<"networkMemberships"> }, capability: MemberCapability): void {
  const status = effectiveMembershipStatus(ctx.membership)
  if (status === null || !hasCapability(status, capability)) fail("statusInsufficient")
}

function canPublish(ctx: { membership: Doc<"networkMemberships"> }): boolean {
  const status = effectiveMembershipStatus(ctx.membership)
  return status !== null && hasCapability(status, "publish")
}

/** Une page de lecture bornée : jamais plus de cinquante lignes, jamais plus d'octets que la borne. */
function bounded(options: PaginationOptions): PaginationOptions {
  const requested = Number.isFinite(options.numItems) ? Math.trunc(options.numItems) : AID_PAGE_MAX
  return {
    ...options,
    numItems: Math.min(Math.max(requested, 1), AID_PAGE_MAX),
    maximumBytesRead: Math.min(options.maximumBytesRead ?? LIST_PAGE_BYTES, LIST_PAGE_BYTES),
  }
}

/** Un blocage dans la paire écarte l'autre personne ; on ne s'écarte jamais soi-même. */
async function isSetAside(ctx: Scope, personId: Id<"persons">): Promise<boolean> {
  return personId !== ctx.person._id && (await isBlockedBetween(ctx, ctx.person._id, personId))
}

/**
 * Le nom PUBLIÉ d'une personne encore membre active du réseau, sinon le nom
 * neutre ; mémoïsé pour une lecture (une page de réponses cite souvent les mêmes).
 */
function peopleOf(ctx: Scope): (personId: Id<"persons">) => Promise<AidPerson> {
  const profileOf = miniProfileCache(ctx)
  const cache = new Map<string, AidPerson>()
  return async (personId) => {
    const hit = cache.get(personId)
    if (hit) return hit
    const profile = (await isActiveMember(ctx, ctx.networkId, personId)) ? await profileOf(personId) : null
    const view: AidPerson = { displayName: profile?.displayName ?? null, handle: profile?.displayName ? (profile.handle ?? null) : null }
    cache.set(personId, view)
    return view
  }
}

/**
 * Une question de ce réseau, non retirée par son auteur, d'un auteur que le
 * lecteur n'a pas écarté (blocage dans un sens ou dans l'autre). La modération
 * n'y est PAS jugée : c'est la base des gestes de l'auteur (on sort toujours).
 */
async function questionFor(ctx: ReadCtx, networkId: Id<"networks">, readerPersonId: Id<"persons">, questionId: Id<"aidQuestions">): Promise<Doc<"aidQuestions"> | null> {
  const question = await ctx.db.get(questionId)
  if (!question || question.networkId !== networkId || question.status === "withdrawn") return null
  if (question.authorPersonId !== readerPersonId && (await isBlockedBetween(ctx, readerPersonId, question.authorPersonId))) return null
  return question
}

/** Une question lisible d'ici : de ce réseau, non retirée, d'un auteur que le lecteur n'a pas écarté. Sinon `null`. */
async function readableQuestion(ctx: Scope, questionId: Id<"aidQuestions">): Promise<Doc<"aidQuestions"> | null> {
  return await questionFor(ctx, ctx.networkId, ctx.person._id, questionId)
}

/**
 * G9 — porte commune des lectures publiques et du signalement : la question
 * lisible par CE lecteur (`questionFor`) ET servie par la modération (publiée ;
 * en relecture pour son seul auteur ; jamais retirée ni déjà signalée par lui).
 * N'importe jamais `moderation/targets` (pas de cycle).
 */
export async function readableAidQuestionOrNull(ctx: ReadCtx, networkId: Id<"networks">, readerPersonId: Id<"persons">, questionId: Id<"aidQuestions">): Promise<Doc<"aidQuestions"> | null> {
  const question = await questionFor(ctx, networkId, readerPersonId, questionId)
  return question && (await isServedTo(ctx, "diasporaAidQuestion", question._id, readerPersonId)) ? question : null
}

/**
 * G9 — une réponse PUBLIÉE par son auteur, d'une question servie à ce lecteur,
 * d'un auteur qu'il n'a pas écarté, et servie par la modération ; avec sa question.
 */
export async function readableAidAnswerOrNull(
  ctx: ReadCtx,
  networkId: Id<"networks">,
  readerPersonId: Id<"persons">,
  answerId: Id<"aidAnswers">,
): Promise<{ answer: Doc<"aidAnswers">; question: Doc<"aidQuestions"> } | null> {
  const answer = await ctx.db.get(answerId)
  if (!answer || answer.networkId !== networkId || answer.status !== "published") return null
  const question = await readableAidQuestionOrNull(ctx, networkId, readerPersonId, answer.questionId)
  if (!question) return null
  if (answer.authorPersonId !== readerPersonId && (await isBlockedBetween(ctx, readerPersonId, answer.authorPersonId))) return null
  return (await isServedTo(ctx, "diasporaAidAnswer", answer._id, readerPersonId)) ? { answer, question } : null
}

/** Une réponse de ce réseau et sa question (même retirée) : le contexte d'un geste de son auteur. */
async function answerContext(ctx: Scope, answerId: Id<"aidAnswers">): Promise<{ answer: Doc<"aidAnswers">; question: Doc<"aidQuestions"> }> {
  const answer = await ctx.db.get(answerId)
  if (!answer || answer.networkId !== ctx.networkId) return notFound()
  const question = await ctx.db.get(answer.questionId)
  if (!question || question.networkId !== ctx.networkId) return notFound()
  return { answer, question }
}

/** Un geste de l'auteur sur sa question, jugé par le domaine sur la ligne relue. */
async function questionGesture(ctx: Scope, questionId: Id<"aidQuestions">, gesture: AidQuestionGesture, expectedVersion: number) {
  const question = await readableQuestion(ctx, questionId)
  if (!question) return notFound()
  const status = ruled(checkAidQuestionGesture({
    gesture,
    isAuthor: question.authorPersonId === ctx.person._id,
    status: question.status,
    expectedVersion,
    version: question.version,
  }))
  return { question, status }
}

/** La page d'ASSOCIATION lisible par ce lecteur et de CE réseau, ou `null` (inconnue, retirée, d'ailleurs, d'une autre nature). */
async function associationPageFor(ctx: ReadCtx, network: Doc<"networks">, readerPersonId: Id<"persons">, pageId: Id<"pages">): Promise<Doc<"pages"> | null> {
  const page = await readablePageOrNull(ctx, network, pageId, readerPersonId)
  return page !== null && page.networkId === network._id && page.ownerKind === "association" ? page : null
}

/** La page d'ASSOCIATION lisible d'ici et de CE réseau, ou `null` (inconnue, retirée, d'ailleurs, d'une autre nature). */
async function readableMissionPage(ctx: Scope, pageId: Id<"pages">): Promise<Doc<"pages"> | null> {
  return await associationPageFor(ctx, ctx.network, ctx.person._id, pageId)
}

/** Une mission de ce réseau, portée par une page d'association lisible par ce lecteur (modération non jugée). */
async function missionFor(ctx: ReadCtx, network: Doc<"networks">, readerPersonId: Id<"persons">, missionId: Id<"aidMissions">): Promise<{ mission: Doc<"aidMissions">; page: Doc<"pages"> } | null> {
  const mission = await ctx.db.get(missionId)
  if (!mission || mission.networkId !== network._id) return null
  const page = await associationPageFor(ctx, network, readerPersonId, mission.pageId)
  return page ? { mission, page } : null
}

/** Une mission lisible : de ce réseau, portée par une page d'association lisible. */
async function readableMission(ctx: Scope, missionId: Id<"aidMissions">): Promise<{ mission: Doc<"aidMissions">; page: Doc<"pages"> } | null> {
  return await missionFor(ctx, ctx.network, ctx.person._id, missionId)
}

/**
 * G9 — porte commune des lectures publiques et du signalement : la mission
 * lisible par CE lecteur ET servie par la modération (contenu de PAGE : en
 * relecture, elle ne se lit que dans la gestion de l'équipe).
 */
export async function readableAidMissionOrNull(
  ctx: ReadCtx,
  network: Doc<"networks">,
  readerPersonId: Id<"persons">,
  missionId: Id<"aidMissions">,
): Promise<{ mission: Doc<"aidMissions">; page: Doc<"pages"> } | null> {
  const found = await missionFor(ctx, network, readerPersonId, missionId)
  return found && (await isServedTo(ctx, "diasporaAidMission", found.mission._id, readerPersonId)) ? found : null
}

/**
 * La page GÉRÉE : du réseau, active, l'appelant y est signataire VIVANT (refus
 * indistinct sinon), puis de nature association (refus explicite : il la gère).
 */
async function managedMissionPage(ctx: Scope, pageId: Id<"pages">): Promise<Doc<"pages">> {
  const page = await ctx.db.get(pageId)
  if (!page || page.networkId !== ctx.networkId || page.status !== "active") return notFound()
  if ((await liveSignatoryRole(ctx, page, ctx.person._id)) === null) return notFound()
  if (page.ownerKind !== "association") return refuseAid("aid_page_kind_not_allowed")
  return page
}

async function managedMission(ctx: Scope, missionId: Id<"aidMissions">): Promise<Doc<"aidMissions">> {
  const mission = await ctx.db.get(missionId)
  if (!mission || mission.networkId !== ctx.networkId) return notFound()
  await managedMissionPage(ctx, mission.pageId)
  return mission
}

/** L'équipe VIVANTE de la page seulement ; pour tout autre membre, la ressource n'existe pas. */
async function requireTeam(ctx: Scope, page: Doc<"pages">): Promise<void> {
  if ((await liveSignatoryRole(ctx, page, ctx.person._id)) === null) notFound()
}

async function signupRowOf(ctx: Scope, missionId: Id<"aidMissions">, personId: Id<"persons">): Promise<Doc<"aidMissionSignups"> | null> {
  return await ctx.db
    .query("aidMissionSignups")
    .withIndex("by_network_mission_person", (q) => q.eq("networkId", ctx.networkId).eq("missionId", missionId).eq("personId", personId))
    .unique()
}

function signupFactsOf(mission: Doc<"aidMissions">, row: Doc<"aidMissionSignups"> | null): AidSignupFacts {
  return { status: mission.status, startsAt: mission.startsAt, places: mission.places, signupCount: mission.signupCount, signedUp: row?.status === "confirmed" }
}

/** Un CACHE des pages d'association d'une lecture : dix missions d'une page ne la résolvent qu'une fois. */
function missionPageCache(ctx: Scope): (pageId: Id<"pages">) => Promise<PageCard | null> {
  const cache = new Map<string, PageCard | null>()
  return async (pageId) => {
    const hit = cache.get(pageId)
    if (hit !== undefined) return hit
    const page = await readableMissionPage(ctx, pageId)
    const card = page ? await pageCardOf(ctx, page) : null
    cache.set(pageId, card)
    return card
  }
}

// ═══════════════════════════════════════════════════════════════
// Projections
// ═══════════════════════════════════════════════════════════════

/** `moderation` : l'état lu pour son auteur dans une vue de gestion ; `null` (défaut) partout ailleurs. */
async function toQuestionCard(
  ctx: Scope,
  question: Doc<"aidQuestions">,
  personOf: (personId: Id<"persons">) => Promise<AidPerson>,
  moderation: ManagedModerationState | null = null,
): Promise<QuestionCard> {
  return {
    questionId: question._id,
    title: question.title,
    detail: question.detail,
    theme: question.theme,
    country: question.country,
    city: question.city ?? null,
    status: question.status,
    answerCount: question.answerCount,
    hasAcceptedAnswer: question.acceptedAnswerId !== undefined,
    author: await personOf(question.authorPersonId),
    isMine: question.authorPersonId === ctx.person._id,
    createdAt: question.createdAt,
    moderation,
  }
}

/** Une réponse, liste ou réponse retenue : son auteur seul en lit l'état de modération (G9). */
async function toAnswer(ctx: Scope, answer: Doc<"aidAnswers">, question: Doc<"aidQuestions">, personOf: (personId: Id<"persons">) => Promise<AidPerson>): Promise<AnswerView> {
  const mine = answer.authorPersonId === ctx.person._id
  return {
    answerId: answer._id,
    questionId: answer.questionId,
    body: answer.body,
    version: answer.version,
    author: await personOf(answer.authorPersonId),
    isMine: mine,
    isAccepted: question.acceptedAnswerId === answer._id,
    createdAt: answer.createdAt,
    editedAt: answer.editedAt ?? null,
    moderation: mine ? await managedModerationState(ctx, "diasporaAidAnswer", answer._id) : null,
  }
}

/**
 * La fiche d'une question. `moderation` : l'état lu pour la seule vue privée de
 * son auteur (G9), `null` pour tout autre lecteur. Retirée (`removed`), la
 * question ne se lit que là — ni réponse ni modification ne s'y proposent ;
 * retirer ou clore restent possibles.
 */
async function toQuestionDetail(ctx: Scope, question: Doc<"aidQuestions">, moderation: ManagedModerationState | null = null): Promise<QuestionDetail> {
  const removed = moderation === "removed"
  const personOf = peopleOf(ctx)
  const publish = canPublish(ctx)
  let acceptedAnswer: AnswerView | null = null
  if (question.acceptedAnswerId !== undefined) {
    const answer = await ctx.db.get(question.acceptedAnswerId)
    // Retirée, effacée, d'un auteur écarté ou non servie par la modération : la réponse retenue ne se montre pas.
    if (answer && answer.networkId === ctx.networkId && answer.questionId === question._id && answer.status === "published" && !(await isSetAside(ctx, answer.authorPersonId))
      && (await isServedTo(ctx, "diasporaAidAnswer", answer._id, ctx.person._id))) {
      acceptedAnswer = await toAnswer(ctx, answer, question, personOf)
    }
  }
  const mine = question.authorPersonId === ctx.person._id
  return {
    ...(await toQuestionCard(ctx, question, personOf, moderation)),
    version: question.version,
    updatedAt: question.updatedAt,
    editedAt: question.editedAt ?? null,
    acceptedAnswer,
    canAnswer: !removed && publish && checkAidAnswering({ questionStatus: question.status, answerCount: question.answerCount }).ok,
    canEdit: !removed && mine && publish && (question.status === "open" || question.status === "resolved"),
  }
}

/** `moderation` : l'état lu pour l'équipe vivante dans sa gestion ; `null` (défaut) partout ailleurs. */
function toMissionCard(mission: Doc<"aidMissions">, page: PageCard, signedUp: boolean, moderation: ManagedModerationState | null = null): MissionCard {
  return {
    missionId: mission._id,
    page,
    title: mission.title,
    description: mission.description,
    country: mission.country,
    city: mission.city,
    area: mission.area ?? null,
    startsAt: mission.startsAt,
    endsAt: mission.endsAt ?? null,
    timeZone: mission.timeZone,
    places: mission.places,
    signupCount: mission.signupCount,
    status: mission.status,
    signedUp,
    moderation,
  }
}

async function toMissionDetail(ctx: Scope, mission: Doc<"aidMissions">, page: Doc<"pages">): Promise<MissionDetail> {
  const row = await signupRowOf(ctx, mission._id, ctx.person._id)
  const blocker = aidSignupBlocker(signupFactsOf(mission, row), Date.now())
  // Même ordre que l'inscription : la règle de la mission, puis le droit de publier du lecteur.
  const signup: MissionDetail["signup"] = blocker !== null
    ? { allowed: false, refusal: blocker }
    : canPublish(ctx) ? { allowed: true, refusal: null } : { allowed: false, refusal: "status_insufficient" }
  // G9 : l'équipe vivante gère la mission de sa page ; elle seule en lit l'état de modération.
  const canManage = (await liveSignatoryRole(ctx, page, ctx.person._id)) !== null
  const moderation = canManage ? await managedModerationState(ctx, "diasporaAidMission", mission._id) : null
  return {
    ...toMissionCard(mission, await pageCardOf(ctx, page), row?.status === "confirmed", moderation),
    version: mission.version,
    cancelReason: mission.cancelReason ?? null,
    signup,
    canManage,
    createdAt: mission.createdAt,
    updatedAt: mission.updatedAt,
  }
}

/** Les champs écrits d'une mission validée ; une valeur absente efface le champ (`undefined` au patch). */
function storedMission(draft: AidMissionDraft) {
  return {
    title: draft.title,
    description: draft.description,
    country: draft.country,
    city: draft.city,
    cityKey: draft.cityKey,
    area: draft.area ?? undefined,
    startsAt: draft.startsAt,
    endsAt: draft.endsAt ?? undefined,
    timeZone: draft.timeZone,
    places: draft.places,
  }
}

// ═══════════════════════════════════════════════════════════════
// Lire les questions
// ═══════════════════════════════════════════════════════════════

/**
 * Les questions d'un pays (et d'une ville saisie), dans un état — ouvertes,
 * résolues ou closes —, les plus récentes d'abord. Le filtre restreint : une
 * page filtrée peut être courte tout en annonçant sa suite (`isDone`).
 */
export const listQuestions = networkQuery({
  args: { country: v.string(), city: v.optional(v.string()), status: aidQuestionListStatusValidator, paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(questionCardValidator),
  handler: async (ctx, args): Promise<PaginationResult<QuestionCard>> => {
    assertDiasporaNetwork(ctx.network)
    assertCapability(ctx, "read_network")
    const { country, cityKey } = ruled(parseAidPlaceFilter({ country: args.country, city: args.city }))
    const query = cityKey === null
      ? ctx.db
        .query("aidQuestions")
        .withIndex("by_network_country_status_createdAt", (q) => q.eq("networkId", ctx.networkId).eq("country", country).eq("status", args.status))
      : ctx.db
        .query("aidQuestions")
        .withIndex("by_network_country_city_status_createdAt", (q) => q.eq("networkId", ctx.networkId).eq("country", country).eq("cityKey", cityKey).eq("status", args.status))
    const result = await query.order("desc").paginate(bounded(args.paginationOpts))
    const personOf = peopleOf(ctx)
    const page: QuestionCard[] = []
    for (const question of result.page) {
      // Défense en profondeur : l'index borne déjà, chaque ligne est rejugée.
      if (question.networkId !== ctx.networkId || question.status !== args.status || question.country !== country) continue
      if (cityKey !== null && question.cityKey !== cityKey) continue
      if (await isSetAside(ctx, question.authorPersonId)) continue
      // G9 : projection publique — ce que la modération sert à ce lecteur, rien d'autre.
      if (!(await isServedTo(ctx, "diasporaAidQuestion", question._id, ctx.person._id))) continue
      page.push(await toQuestionCard(ctx, question, personOf))
    }
    return { ...result, page }
  },
})

/**
 * Mes questions, des plus récentes aux plus anciennes ; une question retirée n'y
 * paraît plus. Vue de gestion : chacune dit son état de modération (G9).
 */
export const myQuestions = networkQuery({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(questionCardValidator),
  handler: async (ctx, { paginationOpts }): Promise<PaginationResult<QuestionCard>> => {
    assertDiasporaNetwork(ctx.network)
    assertCapability(ctx, "read_network")
    const result = await ctx.db
      .query("aidQuestions")
      .withIndex("by_network_author_createdAt", (q) => q.eq("networkId", ctx.networkId).eq("authorPersonId", ctx.person._id))
      .order("desc")
      .paginate(bounded(paginationOpts))
    const personOf = peopleOf(ctx)
    const page: QuestionCard[] = []
    for (const question of result.page) {
      if (question.networkId !== ctx.networkId || question.authorPersonId !== ctx.person._id || question.status === "withdrawn") continue
      page.push(await toQuestionCard(ctx, question, personOf, await managedModerationState(ctx, "diasporaAidQuestion", question._id)))
    }
    return { ...result, page }
  },
})

/**
 * Une entraide désignée par son adresse (`/entraide/<id>`) : une question (et sa
 * réponse retenue) ou une mission bénévole. Inconnue, d'ailleurs, retirée, d'un
 * auteur écarté ou d'une page devenue illisible : le même `null`.
 */
export const aidItem = networkQuery({
  args: { itemId: v.string() },
  returns: aidItemValidator,
  handler: async (ctx, { itemId }): Promise<AidItem> => {
    assertDiasporaNetwork(ctx.network)
    assertCapability(ctx, "read_network")
    const questionId = ctx.db.normalizeId("aidQuestions", itemId)
    if (questionId !== null) {
      const question = await readableQuestion(ctx, questionId)
      if (!question) return null
      // G9 : l'auteur garde la vue privée de sa question (en relecture ou retirée), avec son état ; tout autre lecteur, ce que la modération sert.
      if (question.authorPersonId !== ctx.person._id) {
        return (await isServedTo(ctx, "diasporaAidQuestion", question._id, ctx.person._id)) ? { kind: "question", question: await toQuestionDetail(ctx, question) } : null
      }
      return { kind: "question", question: await toQuestionDetail(ctx, question, await managedModerationState(ctx, "diasporaAidQuestion", question._id)) }
    }
    const missionId = ctx.db.normalizeId("aidMissions", itemId)
    if (missionId !== null) {
      const found = await readableMission(ctx, missionId)
      if (!found) return null
      // G9 : l'équipe vivante de la page garde la vue de gestion ; tout autre lecteur, ce que la modération sert.
      const manages = (await liveSignatoryRole(ctx, found.page, ctx.person._id)) !== null
      if (!manages && !(await isServedTo(ctx, "diasporaAidMission", found.mission._id, ctx.person._id))) return null
      return { kind: "mission", mission: await toMissionDetail(ctx, found.mission, found.page) }
    }
    return null
  },
})

/**
 * Les réponses publiées d'une question, dans l'ordre d'arrivée ; question
 * illisible : refus indistinct. L'auteur d'une réponse y lit l'état de
 * modération de la sienne (G9), personne d'autre.
 */
export const listAnswers = networkQuery({
  args: { questionId: v.id("aidQuestions"), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(answerValidator),
  handler: async (ctx, args): Promise<PaginationResult<AnswerView>> => {
    assertDiasporaNetwork(ctx.network)
    assertCapability(ctx, "read_network")
    const question = await readableQuestion(ctx, args.questionId)
    if (!question) return notFound()
    // G9 : la question servie par la modération, ou celle de l'auteur (sa vue privée).
    if (question.authorPersonId !== ctx.person._id && !(await isServedTo(ctx, "diasporaAidQuestion", question._id, ctx.person._id))) return notFound()
    const result = await ctx.db
      .query("aidAnswers")
      .withIndex("by_network_question_status_createdAt", (q) => q.eq("networkId", ctx.networkId).eq("questionId", question._id).eq("status", "published"))
      .order("asc")
      .paginate(bounded(args.paginationOpts))
    const personOf = peopleOf(ctx)
    const page: AnswerView[] = []
    for (const answer of result.page) {
      if (answer.networkId !== ctx.networkId || answer.questionId !== question._id || answer.status !== "published") continue
      if (await isSetAside(ctx, answer.authorPersonId)) continue
      // Une réponse en relecture ne se montre qu'à son auteur ; retirée, à personne.
      if (!(await isServedTo(ctx, "diasporaAidAnswer", answer._id, ctx.person._id))) continue
      page.push(await toAnswer(ctx, answer, question, personOf))
    }
    return { ...result, page }
  },
})

// ═══════════════════════════════════════════════════════════════
// Gestes sur les questions et les réponses
// ═══════════════════════════════════════════════════════════════

/** Poser une question d'entraide : le droit de publier, puis la règle du domaine (aucune coordonnée). */
export const askQuestion = networkMutation({
  args: { title: v.string(), detail: v.string(), theme: aidThemeValidator, country: v.string(), city: v.optional(v.string()) },
  returns: v.object({ questionId: v.id("aidQuestions"), version: v.number() }),
  handler: async (ctx, args) => {
    assertDiasporaNetwork(ctx.network)
    assertCapability(ctx, "publish")
    await enforceRateLimit(ctx, "diaspora.aid.post", ctx.person._id)
    const draft = ruled(parseAidQuestion(args))
    const now = Date.now()
    const questionId = await ctx.db.insert("aidQuestions", {
      networkId: ctx.networkId,
      authorPersonId: ctx.person._id,
      title: draft.title,
      detail: draft.detail,
      theme: draft.theme,
      country: draft.country,
      ...(draft.city !== null && draft.cityKey !== null ? { city: draft.city, cityKey: draft.cityKey } : {}),
      status: "open",
      answerCount: 0,
      version: 1,
      createdAt: now,
      updatedAt: now,
    })
    await moderateDiasporaWrite(ctx, { networkId: ctx.networkId, kind: "diasporaAidQuestion", id: questionId, text: questionText(draft), owner: { personId: ctx.person._id } })
    return { questionId, version: 1 }
  },
})

/** Modifier ma question (ouverte ou résolue), à la version lue ; son pays ne change pas. */
export const updateQuestion = networkMutation({
  args: {
    questionId: v.id("aidQuestions"),
    expectedVersion: v.number(),
    title: v.string(),
    detail: v.string(),
    theme: aidThemeValidator,
    city: v.optional(v.string()),
  },
  returns: v.object({ version: v.number() }),
  handler: async (ctx, args) => {
    assertDiasporaNetwork(ctx.network)
    assertCapability(ctx, "publish")
    await enforceRateLimit(ctx, "diaspora.aid.manage", ctx.person._id)
    const { question } = await questionGesture(ctx, args.questionId, "edit", args.expectedVersion)
    const draft = ruled(parseAidQuestion({ title: args.title, detail: args.detail, theme: args.theme, country: question.country, city: args.city }))
    // G9 : une question retirée par la modération ne se modifie plus ; sinon la modification est relue comme une écriture.
    await moderateDiasporaWrite(ctx, { networkId: ctx.networkId, kind: "diasporaAidQuestion", id: question._id, text: questionText(draft), owner: { personId: ctx.person._id } })
    const now = Date.now()
    const version = question.version + 1
    await ctx.db.patch(question._id, {
      title: draft.title,
      detail: draft.detail,
      theme: draft.theme,
      city: draft.city ?? undefined,
      cityKey: draft.cityKey ?? undefined,
      editedAt: now,
      updatedAt: now,
      version,
    })
    return { version }
  },
})

/** Clore ma question : plus aucune réponse ; la réponse retenue, s'il y en a une, reste montrée. */
export const closeQuestion = networkMutation({
  args: { questionId: v.id("aidQuestions"), expectedVersion: v.number() },
  returns: v.object({ version: v.number() }),
  handler: async (ctx, args) => {
    assertDiasporaNetwork(ctx.network)
    assertCapability(ctx, "publish")
    await enforceRateLimit(ctx, "diaspora.aid.manage", ctx.person._id)
    const { question, status } = await questionGesture(ctx, args.questionId, "close", args.expectedVersion)
    const now = Date.now()
    const version = question.version + 1
    await ctx.db.patch(question._id, { status, closedAt: now, updatedAt: now, version })
    return { version }
  },
})

/** Retirer ma question : terminal, elle n'est plus servie à personne. Possible même devenu « en attente » dans le réseau. */
export const withdrawQuestion = networkMutation({
  minStatus: "en_attente",
  args: { questionId: v.id("aidQuestions"), expectedVersion: v.number() },
  returns: v.object({ version: v.number() }),
  handler: async (ctx, args) => {
    assertDiasporaNetwork(ctx.network)
    assertCapability(ctx, "read_network")
    await enforceRateLimit(ctx, "diaspora.aid.manage", ctx.person._id)
    const { question, status } = await questionGesture(ctx, args.questionId, "withdraw", args.expectedVersion)
    const now = Date.now()
    const version = question.version + 1
    await ctx.db.patch(question._id, { status, withdrawnAt: now, updatedAt: now, version })
    return { version }
  },
})

/** Répondre à une question ouverte ou résolue : le droit de publier, puis la règle du domaine (aucune coordonnée). */
export const answerQuestion = networkMutation({
  args: { questionId: v.id("aidQuestions"), body: v.string() },
  returns: v.object({ answerId: v.id("aidAnswers"), version: v.number() }),
  handler: async (ctx, args) => {
    assertDiasporaNetwork(ctx.network)
    assertCapability(ctx, "publish")
    await enforceRateLimit(ctx, "diaspora.aid.answer", ctx.person._id)
    // G9 : on ne répond qu'à une question que la modération sert à ce lecteur.
    const question = await readableAidQuestionOrNull(ctx, ctx.networkId, ctx.person._id, args.questionId)
    if (!question) return notFound()
    ruled(checkAidAnswering({ questionStatus: question.status, answerCount: question.answerCount }))
    const body = ruled(parseAidAnswer(args.body))
    const now = Date.now()
    const answerId = await ctx.db.insert("aidAnswers", {
      networkId: ctx.networkId,
      questionId: question._id,
      authorPersonId: ctx.person._id,
      body,
      status: "published",
      version: 1,
      createdAt: now,
      updatedAt: now,
    })
    const moderation = await moderateDiasporaWrite(ctx, { networkId: ctx.networkId, kind: "diasporaAidAnswer", id: answerId, text: body, owner: { personId: ctx.person._id } })
    // Le compteur des réponses publiées ne périme pas la lecture de l'auteur (sa version reste).
    await ctx.db.patch(question._id, { answerCount: question.answerCount + 1, updatedAt: now })
    // Avis neutre à l'auteur de la question ; une réponse en relecture n'annonce rien.
    if (moderation === "published") await noticeAidAnswerPublished(ctx, answerId)
    return { answerId, version: 1 }
  },
})

/** Modifier ma réponse publiée (pas la réponse retenue), à la version lue. */
export const updateAnswer = networkMutation({
  args: { answerId: v.id("aidAnswers"), expectedVersion: v.number(), body: v.string() },
  returns: v.object({ version: v.number() }),
  handler: async (ctx, args) => {
    assertDiasporaNetwork(ctx.network)
    assertCapability(ctx, "publish")
    await enforceRateLimit(ctx, "diaspora.aid.answer", ctx.person._id)
    const { answer, question } = await answerContext(ctx, args.answerId)
    ruled(checkAidAnswerGesture({
      gesture: "edit",
      isAuthor: answer.authorPersonId === ctx.person._id,
      status: answer.status,
      isAccepted: question.acceptedAnswerId === answer._id,
      questionStatus: question.status,
      expectedVersion: args.expectedVersion,
      version: answer.version,
    }))
    const body = ruled(parseAidAnswer(args.body))
    // G9 : une réponse retirée par la modération ne se modifie plus ; sinon la modification est relue comme une écriture.
    await moderateDiasporaWrite(ctx, { networkId: ctx.networkId, kind: "diasporaAidAnswer", id: answer._id, text: body, owner: { personId: ctx.person._id } })
    const now = Date.now()
    const version = answer.version + 1
    await ctx.db.patch(answer._id, { body, editedAt: now, updatedAt: now, version })
    return { version }
  },
})

/**
 * Retirer ma réponse : terminal. Si c'était la réponse retenue, la question la
 * perd (résolue redevient ouverte) et sa version avance. Retrait personnel :
 * possible sur une question close, même devenu « en attente » dans le réseau.
 */
export const withdrawAnswer = networkMutation({
  minStatus: "en_attente",
  args: { answerId: v.id("aidAnswers"), expectedVersion: v.number() },
  returns: v.object({ version: v.number() }),
  handler: async (ctx, args) => {
    assertDiasporaNetwork(ctx.network)
    assertCapability(ctx, "read_network")
    await enforceRateLimit(ctx, "diaspora.aid.answer", ctx.person._id)
    const { answer, question } = await answerContext(ctx, args.answerId)
    const isAccepted = question.acceptedAnswerId === answer._id
    ruled(checkAidAnswerGesture({
      gesture: "withdraw",
      isAuthor: answer.authorPersonId === ctx.person._id,
      status: answer.status,
      isAccepted,
      questionStatus: question.status,
      expectedVersion: args.expectedVersion,
      version: answer.version,
    }))
    const now = Date.now()
    const version = answer.version + 1
    // G9 : une réponse retirée par la modération est déjà décomptée (et n'est plus retenue).
    const removed = await isRemovedByModeration(ctx, "diasporaAidAnswer", answer._id)
    await ctx.db.patch(answer._id, { status: "withdrawn", withdrawnAt: now, updatedAt: now, version })
    await ctx.db.patch(question._id, {
      answerCount: removed ? question.answerCount : Math.max(0, question.answerCount - 1),
      updatedAt: now,
      ...(isAccepted
        ? { acceptedAnswerId: undefined, resolvedAt: undefined, status: aidStatusWithoutAcceptedAnswer(question.status), version: question.version + 1 }
        : {}),
    })
    return { version }
  },
})

/**
 * Retenir UNE réponse publiée de ma question (l'auteur seul : un tiers est
 * refusé), à la version lue. Une autre réponse déjà retenue est remplacée ;
 * rejouer la même ne change rien.
 */
export const acceptAnswer = networkMutation({
  args: { questionId: v.id("aidQuestions"), answerId: v.id("aidAnswers"), expectedVersion: v.number() },
  returns: v.object({ version: v.number() }),
  handler: async (ctx, args) => {
    assertDiasporaNetwork(ctx.network)
    assertCapability(ctx, "publish")
    await enforceRateLimit(ctx, "diaspora.aid.manage", ctx.person._id)
    const { question, status } = await questionGesture(ctx, args.questionId, "accept", args.expectedVersion)
    const answer = await ctx.db.get(args.answerId)
    // G9 : une réponse en relecture ou retirée par la modération ne se retient pas.
    const candidate = answer && answer.networkId === ctx.networkId && !(await isSetAside(ctx, answer.authorPersonId))
      && (await isServedTo(ctx, "diasporaAidAnswer", answer._id, ctx.person._id)) ? answer : null
    ruled(checkAidAcceptedAnswer(candidate, question._id))
    if (question.acceptedAnswerId === args.answerId) return { version: question.version }
    const now = Date.now()
    const version = question.version + 1
    await ctx.db.patch(question._id, { status, acceptedAnswerId: args.answerId, resolvedAt: now, updatedAt: now, version })
    await noticeAidAnswerAccepted(ctx, question._id)
    return { version }
  },
})

/** Ne plus retenir de réponse : la question redevient ouverte. */
export const unacceptAnswer = networkMutation({
  args: { questionId: v.id("aidQuestions"), expectedVersion: v.number() },
  returns: v.object({ version: v.number() }),
  handler: async (ctx, args) => {
    assertDiasporaNetwork(ctx.network)
    assertCapability(ctx, "publish")
    await enforceRateLimit(ctx, "diaspora.aid.manage", ctx.person._id)
    const { question, status } = await questionGesture(ctx, args.questionId, "unaccept", args.expectedVersion)
    const now = Date.now()
    const version = question.version + 1
    await ctx.db.patch(question._id, { status, acceptedAnswerId: undefined, resolvedAt: undefined, updatedAt: now, version })
    return { version }
  },
})

// ═══════════════════════════════════════════════════════════════
// Lire les missions
// ═══════════════════════════════════════════════════════════════

/**
 * Les missions OUVERTES d'un pays (et d'une ville saisie) qui commencent après
 * `from` — un instant que l'écran fixe à l'ouverture de la liste, pour des
 * curseurs stables —, des plus proches aux plus lointaines. Une mission déjà
 * commencée n'y paraît plus.
 */
export const listMissions = networkQuery({
  args: { country: v.string(), city: v.optional(v.string()), from: v.number(), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(missionCardValidator),
  handler: async (ctx, args): Promise<PaginationResult<MissionCard>> => {
    assertDiasporaNetwork(ctx.network)
    assertCapability(ctx, "read_network")
    const { country, cityKey } = ruled(parseAidPlaceFilter({ country: args.country, city: args.city }))
    const from = Number.isFinite(args.from) ? args.from : 0
    const query = cityKey === null
      ? ctx.db
        .query("aidMissions")
        .withIndex("by_network_country_status_startsAt", (q) => q.eq("networkId", ctx.networkId).eq("country", country).eq("status", "open").gte("startsAt", from))
      : ctx.db
        .query("aidMissions")
        .withIndex("by_network_country_city_status_startsAt", (q) => q.eq("networkId", ctx.networkId).eq("country", country).eq("cityKey", cityKey).eq("status", "open").gte("startsAt", from))
    const result = await query.order("asc").paginate(bounded(args.paginationOpts))
    const now = Date.now()
    const pageOf = missionPageCache(ctx)
    const page: MissionCard[] = []
    for (const mission of result.page) {
      if (mission.networkId !== ctx.networkId || mission.status !== "open" || mission.country !== country || now >= mission.startsAt) continue
      if (cityKey !== null && mission.cityKey !== cityKey) continue
      const card = await pageOf(mission.pageId)
      if (!card) continue
      // G9 : projection publique — une mission en relecture ou retirée ne se liste pas (l'équipe la garde dans sa gestion).
      if (!(await isServedTo(ctx, "diasporaAidMission", mission._id, ctx.person._id))) continue
      const row = await signupRowOf(ctx, mission._id, ctx.person._id)
      page.push(toMissionCard(mission, card, row?.status === "confirmed"))
    }
    return { ...result, page }
  },
})

/** Mes inscriptions confirmées, les plus récentes d'abord ; une mission devenue illisible n'y paraît plus. */
export const mySignups = networkQuery({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(missionCardValidator),
  handler: async (ctx, { paginationOpts }): Promise<PaginationResult<MissionCard>> => {
    assertDiasporaNetwork(ctx.network)
    assertCapability(ctx, "read_network")
    const result = await ctx.db
      .query("aidMissionSignups")
      .withIndex("by_network_person_status_signedUpAt", (q) => q.eq("networkId", ctx.networkId).eq("personId", ctx.person._id).eq("status", "confirmed"))
      .order("desc")
      .paginate(bounded(paginationOpts))
    const pageOf = missionPageCache(ctx)
    const page: MissionCard[] = []
    for (const signup of result.page) {
      if (signup.networkId !== ctx.networkId || signup.personId !== ctx.person._id || signup.status !== "confirmed") continue
      const mission = await ctx.db.get(signup.missionId)
      if (!mission || mission.networkId !== ctx.networkId) continue
      // G9 : la mission est le contenu de la page ; retirée par la modération, elle ne se sert plus au bénévole.
      if (!(await isServedTo(ctx, "diasporaAidMission", mission._id, ctx.person._id))) continue
      const card = await pageOf(mission.pageId)
      if (card) page.push(toMissionCard(mission, card, true))
    }
    return { ...result, page }
  },
})

/** Les pages d'association dont je suis signataire VIVANT : celles au nom desquelles je peux proposer une mission. */
export const missionPages = networkQuery({
  args: {},
  returns: v.array(missionPageValidator),
  handler: async (ctx): Promise<MissionPage[]> => {
    assertDiasporaNetwork(ctx.network)
    assertCapability(ctx, "read_network")
    // Borné : une personne signe pour quelques pages ; lecture défensive au plafond des listes.
    const rows = await ctx.db
      .query("pageSignatories")
      .withIndex("by_network_person", (q) => q.eq("networkId", ctx.networkId).eq("personId", ctx.person._id))
      .take(AID_PAGE_MAX)
    const pages: MissionPage[] = []
    for (const row of rows) {
      if (row.acceptedAt === undefined) continue
      const page = await ctx.db.get(row.pageId)
      if (!page || page.networkId !== ctx.networkId || page.status !== "active" || page.ownerKind !== "association") continue
      if ((await liveSignatoryRole(ctx, page, ctx.person._id)) === null) continue
      pages.push({ pageId: page._id, handle: page.handle, name: page.name, country: page.country ?? null, city: page.city ?? null })
    }
    return pages
  },
})

/**
 * Toutes les missions d'une page que je gère (tous états), des plus lointaines
 * aux plus anciennes ; équipe vivante seulement. Vue de gestion : chacune dit
 * son état de modération (G9), en relecture ou retirée comprise.
 */
export const pageMissions = networkQuery({
  args: { pageId: v.id("pages"), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(missionCardValidator),
  handler: async (ctx, args): Promise<PaginationResult<MissionCard>> => {
    assertDiasporaNetwork(ctx.network)
    assertCapability(ctx, "read_network")
    const association = await readableMissionPage(ctx, args.pageId)
    if (!association) return notFound()
    await requireTeam(ctx, association)
    const result = await ctx.db
      .query("aidMissions")
      .withIndex("by_network_page_startsAt", (q) => q.eq("networkId", ctx.networkId).eq("pageId", association._id))
      .order("desc")
      .paginate(bounded(args.paginationOpts))
    const card = await pageCardOf(ctx, association)
    const page: MissionCard[] = []
    for (const mission of result.page) {
      if (mission.networkId !== ctx.networkId || mission.pageId !== association._id) continue
      const row = await signupRowOf(ctx, mission._id, ctx.person._id)
      page.push(toMissionCard(mission, card, row?.status === "confirmed", await managedModerationState(ctx, "diasporaAidMission", mission._id)))
    }
    return { ...result, page }
  },
})

/**
 * Les bénévoles inscrits à une mission, dans l'ordre d'arrivée — pour l'équipe
 * VIVANTE de la page seulement (refus indistinct sinon). Chacun a consenti à
 * montrer son nom publié ; aucune coordonnée : on écrit par la messagerie.
 */
export const missionVolunteers = networkQuery({
  args: { missionId: v.id("aidMissions"), paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(volunteerValidator),
  handler: async (ctx, args): Promise<PaginationResult<Volunteer>> => {
    assertDiasporaNetwork(ctx.network)
    assertCapability(ctx, "read_network")
    const found = await readableMission(ctx, args.missionId)
    if (!found) return notFound()
    await requireTeam(ctx, found.page)
    const result = await ctx.db
      .query("aidMissionSignups")
      .withIndex("by_network_mission_status_signedUpAt", (q) => q.eq("networkId", ctx.networkId).eq("missionId", found.mission._id).eq("status", "confirmed"))
      .order("asc")
      .paginate(bounded(args.paginationOpts))
    const personOf = peopleOf(ctx)
    const page: Volunteer[] = []
    for (const signup of result.page) {
      if (signup.networkId !== ctx.networkId || signup.missionId !== found.mission._id || signup.status !== "confirmed") continue
      page.push({ signupId: signup._id, person: await personOf(signup.personId), signedUpAt: signup.signedUpAt })
    }
    return { ...result, page }
  },
})

// ═══════════════════════════════════════════════════════════════
// Gestes de l'équipe sur une mission
// ═══════════════════════════════════════════════════════════════

/** Les champs saisis d'une mission : précis ici, jugés par le domaine ensuite. */
const missionInputFields = {
  title: v.string(),
  description: v.string(),
  country: v.string(),
  city: v.string(),
  area: v.optional(v.string()),
  startsAt: v.number(),
  endsAt: v.optional(v.number()),
  timeZone: v.string(),
  places: v.number(),
}

/** Proposer une mission au nom d'une page d'association que je gère : elle naît ouverte, sans inscrit. */
export const createMission = networkMutation({
  args: { pageId: v.id("pages"), ...missionInputFields },
  returns: v.object({ missionId: v.id("aidMissions"), version: v.number() }),
  handler: async (ctx, args) => {
    assertDiasporaNetwork(ctx.network)
    assertCapability(ctx, "publish")
    await enforceRateLimit(ctx, "diaspora.aid.post", ctx.person._id)
    const page = await managedMissionPage(ctx, args.pageId)
    const draft = ruled(parseAidMission(args))
    const now = Date.now()
    ruled(checkAidMissionTiming(draft.startsAt, now))
    const missionId = await ctx.db.insert("aidMissions", {
      networkId: ctx.networkId,
      pageId: page._id,
      title: draft.title,
      description: draft.description,
      country: draft.country,
      city: draft.city,
      cityKey: draft.cityKey,
      ...(draft.area !== null ? { area: draft.area } : {}),
      startsAt: draft.startsAt,
      ...(draft.endsAt !== null ? { endsAt: draft.endsAt } : {}),
      timeZone: draft.timeZone,
      places: draft.places,
      signupCount: 0,
      status: "open",
      version: 1,
      createdAt: now,
      updatedAt: now,
    })
    // G9 : contenu de la PAGE — l'état de modération appartient à la page, jamais au signataire qui la saisit.
    await moderateDiasporaWrite(ctx, { networkId: ctx.networkId, kind: "diasporaAidMission", id: missionId, text: missionText(draft), owner: { pageId: page._id } })
    return { missionId, version: 1 }
  },
})

/**
 * Modifier une mission ouverte ou complète, à la version lue. Replanifiée, elle
 * doit commencer dans le futur ; ses places ne descendent jamais sous les
 * inscrits, et son état les suit (complète ⇄ ouverte).
 */
export const updateMission = networkMutation({
  args: { missionId: v.id("aidMissions"), expectedVersion: v.number(), ...missionInputFields },
  returns: v.object({ version: v.number(), status: aidMissionStatusValidator }),
  handler: async (ctx, args) => {
    assertDiasporaNetwork(ctx.network)
    assertCapability(ctx, "publish")
    await enforceRateLimit(ctx, "diaspora.aid.manage", ctx.person._id)
    const mission = await managedMission(ctx, args.missionId)
    ruled(checkAidMissionGesture({ gesture: "edit", status: mission.status, expectedVersion: args.expectedVersion, version: mission.version }))
    const draft = ruled(parseAidMission(args))
    const now = Date.now()
    const rescheduled = draft.startsAt !== mission.startsAt || draft.endsAt !== (mission.endsAt ?? null) || draft.timeZone !== mission.timeZone
    if (rescheduled) ruled(checkAidMissionTiming(draft.startsAt, now))
    const status = ruled(checkAidMissionPlacesChange(draft.places, mission.signupCount))
    // G9 : une mission retirée par la modération ne se modifie plus ; sinon la modification est relue comme une écriture de la page.
    await moderateDiasporaWrite(ctx, { networkId: ctx.networkId, kind: "diasporaAidMission", id: mission._id, text: missionText(draft), owner: { pageId: mission.pageId } })
    const version = mission.version + 1
    await ctx.db.patch(mission._id, { ...storedMission(draft), status, updatedAt: now, version })
    return { version, status }
  },
})

/** Clore les inscriptions d'une mission : les inscrits restent inscrits, plus personne ne s'ajoute. */
export const closeMission = networkMutation({
  args: { missionId: v.id("aidMissions"), expectedVersion: v.number() },
  returns: v.object({ version: v.number() }),
  handler: async (ctx, args) => {
    assertDiasporaNetwork(ctx.network)
    assertCapability(ctx, "publish")
    await enforceRateLimit(ctx, "diaspora.aid.manage", ctx.person._id)
    const mission = await managedMission(ctx, args.missionId)
    const status = ruled(checkAidMissionGesture({ gesture: "close", status: mission.status, expectedVersion: args.expectedVersion, version: mission.version }))
    const now = Date.now()
    const version = mission.version + 1
    await ctx.db.patch(mission._id, { status, closedAt: now, updatedAt: now, version })
    return { version }
  },
})

/** Annuler une mission (terminal), avec un motif facultatif lu par les inscrits. */
export const cancelMission = networkMutation({
  args: { missionId: v.id("aidMissions"), expectedVersion: v.number(), reason: v.optional(v.string()) },
  returns: v.object({ version: v.number() }),
  handler: async (ctx, args) => {
    assertDiasporaNetwork(ctx.network)
    assertCapability(ctx, "publish")
    await enforceRateLimit(ctx, "diaspora.aid.manage", ctx.person._id)
    const mission = await managedMission(ctx, args.missionId)
    const status = ruled(checkAidMissionGesture({ gesture: "cancel", status: mission.status, expectedVersion: args.expectedVersion, version: mission.version }))
    const reason = ruled(parseAidReason(args.reason))
    const now = Date.now()
    const version = mission.version + 1
    await ctx.db.patch(mission._id, { status, cancelReason: reason ?? undefined, cancelledAt: now, updatedAt: now, version })
    return { version }
  },
})

// ═══════════════════════════════════════════════════════════════
// Gestes des bénévoles
// ═══════════════════════════════════════════════════════════════

/**
 * S'inscrire à une mission : le droit de publier, le consentement EXPLICITE à
 * montrer son nom publié à l'équipe de la page, une inscription par personne,
 * et les places restantes relues DANS la transaction (deux inscriptions
 * simultanées sur la dernière place : l'une est rejouée et refusée).
 */
export const signUpForMission = networkMutation({
  args: { missionId: v.id("aidMissions"), shareNameWithTeam: v.boolean() },
  returns: v.object({ status: aidMissionStatusValidator, signupCount: v.number() }),
  handler: async (ctx, args) => {
    assertDiasporaNetwork(ctx.network)
    assertCapability(ctx, "publish")
    await enforceRateLimit(ctx, "diaspora.aid.manage", ctx.person._id)
    // G9 : on ne s'inscrit qu'à une mission que la modération sert à ce lecteur.
    const found = await readableAidMissionOrNull(ctx, ctx.network, ctx.person._id, args.missionId)
    if (!found) return notFound()
    // RP-03 : toute l'équipe vivante de la page en blocage avec la personne, la mission se tait comme retirée.
    await assertPageOpenTo(ctx, found.page, ctx.person._id)
    const { mission } = found
    const row = await signupRowOf(ctx, mission._id, ctx.person._id)
    const now = Date.now()
    const next = ruled(checkAidSignup(signupFactsOf(mission, row), args.shareNameWithTeam, now))
    if (row) {
      await ctx.db.patch(row._id, { status: "confirmed", nameConsentAt: now, signedUpAt: now, withdrawnAt: undefined, updatedAt: now })
    } else {
      await ctx.db.insert("aidMissionSignups", {
        networkId: ctx.networkId,
        missionId: mission._id,
        personId: ctx.person._id,
        status: "confirmed",
        nameConsentAt: now,
        signedUpAt: now,
        createdAt: now,
        updatedAt: now,
      })
    }
    await ctx.db.patch(mission._id, { signupCount: next.signupCount, status: next.status, updatedAt: now })
    await noticeAidMissionSignup(ctx, mission._id, ctx.person._id)
    return { status: next.status, signupCount: next.signupCount }
  },
})

/**
 * Me retirer d'une mission, avant son début : la place se libère (une mission
 * complète se rouvre). Retrait personnel : possible même devenu « en attente »,
 * même si la page n'est plus lisible.
 */
export const withdrawFromMission = networkMutation({
  minStatus: "en_attente",
  args: { missionId: v.id("aidMissions") },
  returns: v.object({ status: aidMissionStatusValidator, signupCount: v.number() }),
  handler: async (ctx, args) => {
    assertDiasporaNetwork(ctx.network)
    assertCapability(ctx, "read_network")
    await enforceRateLimit(ctx, "diaspora.aid.manage", ctx.person._id)
    const mission = await ctx.db.get(args.missionId)
    if (!mission || mission.networkId !== ctx.networkId) return notFound()
    const row = await signupRowOf(ctx, mission._id, ctx.person._id)
    const now = Date.now()
    const next = ruled(checkAidSignupWithdrawal(signupFactsOf(mission, row), now))
    // Inatteignable : la règle refuse déjà l'absence d'inscription confirmée.
    if (!row) return notFound()
    await ctx.db.patch(row._id, { status: "withdrawn", withdrawnAt: now, updatedAt: now })
    await ctx.db.patch(mission._id, { signupCount: next.signupCount, status: next.status, updatedAt: now })
    return { status: next.status, signupCount: next.signupCount }
  },
})
