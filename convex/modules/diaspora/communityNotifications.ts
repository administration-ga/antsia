/**
 * DIASPORALE — avis NEUTRES de la vie communautaire (vague H du plan global : entraide,
 * mentorat, emploi, kit d'arrivée), sur le modèle des avis de mise en relation
 * (`serviceNotifications.ts`). PROPRIÉTAIRE : session DIASPORALE.
 *
 * Ce que l'avis apprend, et à qui :
 *   · entraide : à l'auteur d'une question, qu'une réponse y est publiée ; à l'auteur d'une
 *     réponse, qu'elle est retenue ; à l'équipe d'une page, qu'une personne s'inscrit à sa
 *     mission ; aux bénévoles inscrits (inscription CONFIRMÉE), que la mission est annulée ou
 *     que son horaire change (ET-01, issue antsia#101), jamais le motif ni l'horaire ;
 *   · mentorat : au mentor, qu'une demande lui arrive ; au mentoré, l'accord ou le refus ; à
 *     l'autre partie, la clôture (y compris par le retrait du profil du mentor) ;
 *   · emploi : à l'équipe d'une page, qu'une candidature arrive ; à la personne qui candidate,
 *     la présélection ou la non-sélection, jamais le motif ;
 *   · kit d'arrivée : à la personne qui a écrit la version relue, la publication ou le renvoi.
 *
 * Mêmes règles que les avis de mise en relation :
 * - Écriture par la porte unique (`notifyPerson`), dans la transaction du geste et juste
 *   après son écriture ; ce module n'écrit jamais lui-même dans `notifications`. Seule
 *   exception de calendrier : les bénévoles d'une mission (ET-01), avisés APRÈS la transaction
 *   du geste, par lots bornés chaînés par curseur (`noticeAidMissionVolunteers`).
 * - Avis du SYSTÈME : ni contenu, ni montant, ni nom. L'auteur du geste (`sourcePersonId`) ne
 *   sert qu'aux refus « soi-même » et « blocage » de la porte ; il n'est jamais stocké.
 * - Destinataire relu à l'écriture (`communityNoticeAdmission`), à la lecture de la cloche
 *   (`communityNoticeView`) et avant tout transport (`communityNoticeVisible`) ; un avis dont
 *   l'objet ne se lit plus ne se présente plus. Un contenu en relecture préalable n'annonce rien.
 * - Dédoublonnage : la clé porte le sujet et son état écrit ; un rejeu n'empile rien.
 * - Équipe : au plus `SERVICE_TEAM_NOTICE_MAX` signataires avisés par geste, administrateurs
 *   d'abord.
 *
 * Les genres, les sujets et leurs colonnes vivent dans le moteur (`notifications/tables.ts`),
 * ajoutés par délégation d'ANTSIA (19/10/2026) après son signal « notifications libres » ;
 * `aid_mission_cancelled` et `aid_mission_rescheduled` le 10/11/2026 (ET-01, exception de zone
 * accordée par la session du moteur). Une seule fonction Convex ici, INTERNE : la diffusion par
 * lots aux bénévoles d'une mission.
 */
import { v } from "convex/values"

import { internal } from "../../_generated/api"
import type { Doc, Id } from "../../_generated/dataModel"
import { internalMutation, type MutationCtx, type QueryCtx } from "../../_generated/server"
import { isActiveMember } from "../../lib/access"
import { isBlockedBetween } from "../graph/graph"
import { type NotificationSubjectRef, notifyPerson } from "../notifications/notify"
import { type DiasporaCommunityNotificationKind, isDiasporaCommunityNotificationKind } from "../notifications/tables"
import { liveSignatoryRole, readablePageOrNull, signatoryRowsOf } from "../pages/access"
import { isDiasporaNetwork } from "./facts"
import { teamReadableJobApplicationOrNull } from "./jobs"
import { isServedTo } from "./moderationContent"
import { readableAidAnswerOrNull, readableAidMissionOrNull, readableAidQuestionOrNull } from "./mutualAid"
import { SERVICE_TEAM_NOTICE_MAX } from "./serviceNotifications"

type ReadCtx = Pick<QueryCtx, "db">

/**
 * À qui parle un avis : l'auteur d'un contenu, l'équipe d'une page, le mentor, le mentoré, la
 * personne qui candidate, le bénévole inscrit à une mission (ET-01).
 */
export const COMMUNITY_NOTICE_AUDIENCES = ["author", "team", "mentor", "mentee", "candidate", "volunteer"] as const
export type CommunityNoticeAudience = (typeof COMMUNITY_NOTICE_AUDIENCES)[number]

/** L'objet qu'un avis ouvre, par sa route dans l'application. */
export const COMMUNITY_NOTICE_OPENS = ["aidQuestion", "aidMission", "mentoringRequest", "jobApplication", "kitResource"] as const
export type CommunityNoticeOpens = (typeof COMMUNITY_NOTICE_OPENS)[number]

/** Ce que la cloche projette d'un avis communautaire : des références relues, jamais un contenu. */
export type CommunityNoticeDto = {
  audience: CommunityNoticeAudience
  opens: CommunityNoticeOpens
  /** L'identifiant de l'objet ouvert (la question, pour une réponse retenue). */
  objectId: string
  /** L'adresse de la page concernée, si elle se lit encore pour ce lecteur ; `null` sinon. */
  pageHandle: string | null
}

/** Les sujets des avis communautaires, tels que la porte unique les stocke (références seules). */
export type CommunityNoticeSubject =
  | { aidQuestion: Id<"aidQuestions"> }
  | { aidAnswer: Id<"aidAnswers"> }
  | { aidMission: Id<"aidMissions"> }
  | { mentoringRequest: Id<"mentoringRequests"> }
  | { jobApplication: Id<"jobApplications"> }
  | { kitResource: Id<"kitResources"> }

// ═══════════════════════════════════════════════════════════════
// Règles : quel état écrit chaque genre annonce, et qui peut le lire
// ═══════════════════════════════════════════════════════════════

/** ET-01 : ce qu'un avis apprend au bénévole inscrit — la mission est annulée, ou son horaire a changé. */
type AidMissionVolunteerChange = "cancelled" | "rescheduled"

type CommunityRule =
  | { readonly family: "aidQuestion" }
  | { readonly family: "aidAnswer" }
  | { readonly family: "aidMission" }
  | { readonly family: "aidMissionVolunteer"; readonly change: AidMissionVolunteerChange }
  | { readonly family: "mentoring"; readonly status: Doc<"mentoringRequests">["status"]; readonly audience: "mentor" | "mentee" | "party" }
  | { readonly family: "jobApplication"; readonly status: Doc<"jobApplications">["status"]; readonly audience: "team" | "candidate" }
  | { readonly family: "kitResource" }

/** Chaque genre communautaire a SA règle : un genre ajouté sans elle ne compile pas. */
const COMMUNITY_RULES: Readonly<Record<DiasporaCommunityNotificationKind, CommunityRule>> = {
  aid_answer_received: { family: "aidQuestion" },
  aid_answer_retained: { family: "aidAnswer" },
  aid_mission_signup: { family: "aidMission" },
  aid_mission_cancelled: { family: "aidMissionVolunteer", change: "cancelled" },
  aid_mission_rescheduled: { family: "aidMissionVolunteer", change: "rescheduled" },
  mentoring_request_received: { family: "mentoring", status: "sent", audience: "mentor" },
  mentoring_request_accepted: { family: "mentoring", status: "accepted", audience: "mentee" },
  mentoring_request_declined: { family: "mentoring", status: "declined", audience: "mentee" },
  mentoring_closed: { family: "mentoring", status: "closed", audience: "party" },
  job_application_received: { family: "jobApplication", status: "sent", audience: "team" },
  job_application_shortlisted: { family: "jobApplication", status: "shortlisted", audience: "candidate" },
  job_application_not_selected: { family: "jobApplication", status: "not_selected", audience: "candidate" },
  kit_resource_reviewed: { family: "kitResource" },
}

type VolunteerRule = Extract<CommunityRule, { family: "aidMissionVolunteer" }>
type MentoringRule = Extract<CommunityRule, { family: "mentoring" }>
type JobApplicationRule = Extract<CommunityRule, { family: "jobApplication" }>

/** Les références d'un sujet, depuis l'émetteur ou depuis la ligne stockée. */
type SubjectIds = {
  readonly questionId?: Id<"aidQuestions"> | undefined
  readonly answerId?: Id<"aidAnswers"> | undefined
  readonly missionId?: Id<"aidMissions"> | undefined
  readonly mentoringRequestId?: Id<"mentoringRequests"> | undefined
  readonly applicationId?: Id<"jobApplications"> | undefined
  readonly resourceId?: Id<"kitResources"> | undefined
}

/** Ce qu'un avis désigne pour CE destinataire, relu maintenant. */
type CommunityTarget = {
  readonly audience: CommunityNoticeAudience
  readonly opens: CommunityNoticeOpens
  readonly objectId: string
  readonly pageHandle: string | null
  /** Le sujet et son état écrit : la part propre de la clé de dédoublonnage. */
  readonly reference: string
  /** L'état écrit relu, pour les genres qui en annoncent un ; `null` sinon. */
  readonly status: string | null
}

function idsOfSubject(subject: NotificationSubjectRef | undefined): SubjectIds | null {
  if (!subject) return null
  if ("aidQuestion" in subject) return { questionId: subject.aidQuestion }
  if ("aidAnswer" in subject) return { answerId: subject.aidAnswer }
  if ("aidMission" in subject) return { missionId: subject.aidMission }
  if ("mentoringRequest" in subject) return { mentoringRequestId: subject.mentoringRequest }
  if ("jobApplication" in subject) return { applicationId: subject.jobApplication }
  if ("kitResource" in subject) return { resourceId: subject.kitResource }
  return null
}

function idsOfRow(row: Doc<"notifications">): SubjectIds {
  return {
    questionId: row.subjectAidQuestionId,
    answerId: row.subjectAidAnswerId,
    missionId: row.subjectAidMissionId,
    mentoringRequestId: row.subjectMentoringRequestId,
    applicationId: row.subjectJobApplicationId,
    resourceId: row.subjectKitResourceId,
  }
}

/** L'adresse d'une page lisible d'ici pour ce lecteur, ou `null` : jamais un lien vers une page retirée. */
async function readableHandle(ctx: ReadCtx, network: Doc<"networks">, pageId: Id<"pages">, readerPersonId: Id<"persons">): Promise<string | null> {
  const page = await readablePageOrNull(ctx, network, pageId, readerPersonId)
  return page && page.networkId === network._id ? page.handle : null
}

/** Une question d'entraide servie à son AUTEUR : une réponse y est publiée. */
async function questionTarget(ctx: ReadCtx, network: Doc<"networks">, recipientPersonId: Id<"persons">, questionId: Id<"aidQuestions">): Promise<CommunityTarget | null> {
  const question = await readableAidQuestionOrNull(ctx, network._id, recipientPersonId, questionId)
  if (!question || question.authorPersonId !== recipientPersonId) return null
  return { audience: "author", opens: "aidQuestion", objectId: question._id, pageHandle: null, reference: `aidQuestion:${question._id}:${question.answerCount}`, status: null }
}

/** Une réponse servie à son AUTEUR et encore retenue par l'auteur de la question. */
async function answerTarget(ctx: ReadCtx, network: Doc<"networks">, recipientPersonId: Id<"persons">, answerId: Id<"aidAnswers">): Promise<CommunityTarget | null> {
  const found = await readableAidAnswerOrNull(ctx, network._id, recipientPersonId, answerId)
  if (!found || found.answer.authorPersonId !== recipientPersonId || found.question.acceptedAnswerId !== found.answer._id) return null
  if (await isBlockedBetween(ctx, recipientPersonId, found.question.authorPersonId)) return null
  return { audience: "author", opens: "aidQuestion", objectId: found.question._id, pageHandle: null, reference: `aidAnswer:${found.answer._id}:retained:${found.question.version}`, status: null }
}

/** Une mission servie à un signataire VIVANT de sa page : une personne s'y inscrit. */
async function missionTarget(ctx: ReadCtx, network: Doc<"networks">, recipientPersonId: Id<"persons">, missionId: Id<"aidMissions">): Promise<CommunityTarget | null> {
  const found = await readableAidMissionOrNull(ctx, network, recipientPersonId, missionId)
  if (!found || (await liveSignatoryRole(ctx, found.page, recipientPersonId)) === null) return null
  return {
    audience: "team",
    opens: "aidMission",
    objectId: found.mission._id,
    pageHandle: found.page.handle,
    reference: `aidMission:${found.mission._id}:${found.mission.signupCount}`,
    status: null,
  }
}

/**
 * ET-01 : une mission servie à un BÉNÉVOLE dont l'inscription est CONFIRMÉE — un inscrit retiré
 * n'est avisé de rien, et son avis ne se présente plus. L'état annoncé (annulée, ou encore en
 * cours pour un horaire changé) n'est exigé qu'à l'écriture (`communityNoticeAdmission`).
 * Clé : la mission, le changement et la VERSION écrite — un avis par mission et par version.
 */
async function volunteerTarget(ctx: ReadCtx, network: Doc<"networks">, recipientPersonId: Id<"persons">, rule: VolunteerRule, missionId: Id<"aidMissions">): Promise<CommunityTarget | null> {
  const found = await readableAidMissionOrNull(ctx, network, recipientPersonId, missionId)
  if (!found) return null
  const signup = await ctx.db
    .query("aidMissionSignups")
    .withIndex("by_network_mission_person", (q) => q.eq("networkId", network._id).eq("missionId", found.mission._id).eq("personId", recipientPersonId))
    .unique()
  if (signup?.status !== "confirmed") return null
  return {
    audience: "volunteer",
    opens: "aidMission",
    objectId: found.mission._id,
    pageHandle: found.page.handle,
    reference: `aidMission:${found.mission._id}:${rule.change}:${found.mission.version}`,
    status: found.mission.status,
  }
}

/**
 * Une demande de mentorat : le mentor ou le mentoré selon le genre, ou l'une des deux parties
 * pour une clôture. Servie à ce lecteur par la modération (une demande en relecture n'est
 * annoncée à personne d'autre que son auteur), et aucun blocage dans la paire.
 */
async function mentoringTarget(ctx: ReadCtx, network: Doc<"networks">, recipientPersonId: Id<"persons">, rule: MentoringRule, requestId: Id<"mentoringRequests">): Promise<CommunityTarget | null> {
  const request = await ctx.db.get(requestId)
  if (!request || request.networkId !== network._id) return null
  const isMentor = request.mentorPersonId === recipientPersonId
  const isMentee = request.menteePersonId === recipientPersonId
  const allowed = rule.audience === "mentor" ? isMentor : rule.audience === "mentee" ? isMentee : isMentor || isMentee
  if (!allowed) return null
  if (!(await isServedTo(ctx, "diasporaMentoringRequest", request._id, recipientPersonId))) return null
  if (await isBlockedBetween(ctx, request.mentorPersonId, request.menteePersonId)) return null
  return {
    audience: isMentor ? "mentor" : "mentee",
    opens: "mentoringRequest",
    objectId: request._id,
    pageHandle: null,
    reference: `mentoringRequest:${request._id}:${request.status}`,
    status: request.status,
  }
}

/**
 * Une candidature : l'équipe VIVANTE de la page (garde de l'équipe : page employeuse active,
 * signataire vivant, modération), ou la personne qui candidate pour une décision.
 */
async function applicationTarget(ctx: ReadCtx, network: Doc<"networks">, recipientPersonId: Id<"persons">, rule: JobApplicationRule, applicationId: Id<"jobApplications">): Promise<CommunityTarget | null> {
  if (rule.audience === "team") {
    const application = await teamReadableJobApplicationOrNull(ctx, network._id, recipientPersonId, applicationId)
    if (!application) return null
    return {
      audience: "team",
      opens: "jobApplication",
      objectId: application._id,
      pageHandle: await readableHandle(ctx, network, application.pageId, recipientPersonId),
      reference: `jobApplication:${application._id}:${application.status}`,
      status: application.status,
    }
  }
  const application = await ctx.db.get(applicationId)
  if (!application || application.networkId !== network._id || application.candidatePersonId !== recipientPersonId) return null
  return {
    audience: "candidate",
    opens: "jobApplication",
    objectId: application._id,
    pageHandle: await readableHandle(ctx, network, application.pageId, recipientPersonId),
    reference: `jobApplication:${application._id}:${application.status}`,
    status: application.status,
  }
}

/**
 * Une ressource du kit : la personne qui a écrit la version relue. Une ressource portée par
 * une page ne parle qu'à un signataire encore vivant de cette page.
 */
async function resourceTarget(ctx: ReadCtx, network: Doc<"networks">, recipientPersonId: Id<"persons">, resourceId: Id<"kitResources">): Promise<CommunityTarget | null> {
  const row = await ctx.db.get(resourceId)
  if (!row || row.networkId !== network._id || row.revisedByPersonId !== recipientPersonId) return null
  let pageHandle: string | null = null
  if (row.pageId !== undefined) {
    const page = await ctx.db.get(row.pageId)
    if (!page || page.networkId !== network._id || (await liveSignatoryRole(ctx, page, recipientPersonId)) === null) return null
    pageHandle = await readableHandle(ctx, network, page._id, recipientPersonId)
  }
  return { audience: "author", opens: "kitResource", objectId: row._id, pageHandle, reference: `kitResource:${row._id}:${row.status}:${row.version}`, status: row.status }
}

/**
 * Ce qu'un avis communautaire désigne pour son destinataire, ou `null` : réseau DIASPORALE
 * actif, personne présente (ni effacée ni en effacement), membre active du réseau, puis les
 * droits propres au sujet.
 */
async function noticeTarget(ctx: ReadCtx, networkId: Id<"networks">, recipientPersonId: Id<"persons">, kind: DiasporaCommunityNotificationKind, ids: SubjectIds): Promise<CommunityTarget | null> {
  const network = await ctx.db.get(networkId)
  if (!isDiasporaNetwork(network)) return null
  const person = await ctx.db.get(recipientPersonId)
  if (!person || person.erasedAt !== undefined || person.deletionRequestedAt !== undefined) return null
  if (!(await isActiveMember(ctx, networkId, recipientPersonId))) return null
  const rule = COMMUNITY_RULES[kind]
  switch (rule.family) {
    case "aidQuestion":
      return ids.questionId ? await questionTarget(ctx, network, recipientPersonId, ids.questionId) : null
    case "aidAnswer":
      return ids.answerId ? await answerTarget(ctx, network, recipientPersonId, ids.answerId) : null
    case "aidMission":
      return ids.missionId ? await missionTarget(ctx, network, recipientPersonId, ids.missionId) : null
    case "aidMissionVolunteer":
      return ids.missionId ? await volunteerTarget(ctx, network, recipientPersonId, rule, ids.missionId) : null
    case "mentoring":
      return ids.mentoringRequestId ? await mentoringTarget(ctx, network, recipientPersonId, rule, ids.mentoringRequestId) : null
    case "jobApplication":
      return ids.applicationId ? await applicationTarget(ctx, network, recipientPersonId, rule, ids.applicationId) : null
    case "kitResource":
      return ids.resourceId ? await resourceTarget(ctx, network, recipientPersonId, ids.resourceId) : null
  }
}

// ═══════════════════════════════════════════════════════════════
// Gardes lues par la porte unique, la cloche et les transports
// ═══════════════════════════════════════════════════════════════

/**
 * La garde d'ÉCRITURE (porte unique) : destinataire, droits, réseau, et l'état ÉCRIT que le
 * genre annonce (un rejeu tardif n'annonce rien). Rend la part propre de la clé de
 * dédoublonnage, ou `null` : rien n'est écrit.
 */
export async function communityNoticeAdmission(
  ctx: ReadCtx,
  networkId: Id<"networks">,
  recipientPersonId: Id<"persons">,
  kind: DiasporaCommunityNotificationKind,
  subject: NotificationSubjectRef | undefined,
): Promise<{ reference: string } | null> {
  const ids = idsOfSubject(subject)
  if (ids === null) return null
  const target = await noticeTarget(ctx, networkId, recipientPersonId, kind, ids)
  if (target === null) return null
  const rule = COMMUNITY_RULES[kind]
  if ((rule.family === "mentoring" || rule.family === "jobApplication") && rule.status !== target.status) return null
  // ET-01 : une annulation n'est annoncée que d'une mission annulée ; un horaire changé, que d'une mission qui ne l'est pas.
  if (rule.family === "aidMissionVolunteer" && (rule.change === "cancelled") !== (target.status === "cancelled")) return null
  return { reference: target.reference }
}

/** La garde de LECTURE (cloche, ouverture d'un avis poussé, transports) : les droits du destinataire, relus maintenant. */
export async function communityNoticeVisible(ctx: ReadCtx, row: Doc<"notifications">): Promise<boolean> {
  if (!isDiasporaCommunityNotificationKind(row.kind) || row.actorPersonId !== undefined) return false
  return (await noticeTarget(ctx, row.networkId, row.recipientPersonId, row.kind, idsOfRow(row))) !== null
}

/** La projection de la cloche : à qui parle l'avis et ce qu'il ouvre, ou `null` s'il ne se lit plus. */
export async function communityNoticeView(ctx: ReadCtx, row: Doc<"notifications">): Promise<CommunityNoticeDto | null> {
  if (!isDiasporaCommunityNotificationKind(row.kind) || row.actorPersonId !== undefined) return null
  const target = await noticeTarget(ctx, row.networkId, row.recipientPersonId, row.kind, idsOfRow(row))
  return target ? { audience: target.audience, opens: target.opens, objectId: target.objectId, pageHandle: target.pageHandle } : null
}

// ═══════════════════════════════════════════════════════════════
// Émission : appelée par les gestes, juste après leur écriture
// ═══════════════════════════════════════════════════════════════

type NoticeInput = {
  readonly networkId: Id<"networks">
  readonly recipientPersonId: Id<"persons">
  readonly kind: DiasporaCommunityNotificationKind
  readonly subject: CommunityNoticeSubject
  /** L'auteur du geste : jamais avisé lui-même, jamais à travers un blocage ; jamais stocké. */
  readonly sourcePersonId?: Id<"persons">
}

/** Un avis à UNE personne, par la porte unique ; `true` quand une ligne existe (écrite, ou déjà là). */
async function notice(ctx: MutationCtx, input: NoticeInput): Promise<boolean> {
  const written = await notifyPerson(ctx, {
    networkId: input.networkId,
    recipientPersonId: input.recipientPersonId,
    kind: input.kind,
    subject: input.subject,
    ...(input.sourcePersonId !== undefined ? { sourcePersonId: input.sourcePersonId } : {}),
  })
  return written !== null
}

/**
 * L'ÉQUIPE d'une page : ses signataires ACCEPTÉS, administrateurs d'abord, chacun relu par la
 * porte ; au plus `SERVICE_TEAM_NOTICE_MAX` avisés, jamais l'auteur du geste.
 */
async function noticeTeam(ctx: MutationCtx, input: Omit<NoticeInput, "recipientPersonId"> & { readonly pageId: Id<"pages"> }): Promise<number> {
  // Borné : au plus deux fois `PAGE_SIGNATORIES_MAX + 1` lignes (`signatoryRowsOf`).
  const rows = await signatoryRowsOf(ctx, input.pageId)
  const seen = new Set<Id<"persons">>()
  let notified = 0
  for (const row of rows) {
    if (notified >= SERVICE_TEAM_NOTICE_MAX) break
    if (row.acceptedAt === undefined || row.networkId !== input.networkId || row.personId === input.sourcePersonId || seen.has(row.personId)) continue
    seen.add(row.personId)
    const written = await notice(ctx, {
      networkId: input.networkId,
      recipientPersonId: row.personId,
      kind: input.kind,
      subject: input.subject,
      ...(input.sourcePersonId !== undefined ? { sourcePersonId: input.sourcePersonId } : {}),
    })
    if (written) notified += 1
  }
  return notified
}

/** Après une réponse PUBLIÉE (`answerQuestion`) : l'auteur de la question. Une réponse en relecture n'annonce rien. */
export async function noticeAidAnswerPublished(ctx: MutationCtx, answerId: Id<"aidAnswers">): Promise<void> {
  const answer = await ctx.db.get(answerId)
  if (!answer) return
  const question = await ctx.db.get(answer.questionId)
  if (!question) return
  await notice(ctx, {
    networkId: answer.networkId, recipientPersonId: question.authorPersonId, kind: "aid_answer_received",
    subject: { aidQuestion: question._id }, sourcePersonId: answer.authorPersonId,
  })
}

/** Après `acceptAnswer` : l'auteur de la réponse retenue. */
export async function noticeAidAnswerAccepted(ctx: MutationCtx, questionId: Id<"aidQuestions">): Promise<void> {
  const question = await ctx.db.get(questionId)
  if (!question || question.acceptedAnswerId === undefined) return
  const answer = await ctx.db.get(question.acceptedAnswerId)
  if (!answer) return
  await notice(ctx, {
    networkId: question.networkId, recipientPersonId: answer.authorPersonId, kind: "aid_answer_retained",
    subject: { aidAnswer: answer._id }, sourcePersonId: question.authorPersonId,
  })
}

/** Après `signUpForMission` : l'équipe vivante de la page de la mission. */
export async function noticeAidMissionSignup(ctx: MutationCtx, missionId: Id<"aidMissions">, volunteerPersonId: Id<"persons">): Promise<void> {
  const mission = await ctx.db.get(missionId)
  if (!mission) return
  await noticeTeam(ctx, {
    networkId: mission.networkId, pageId: mission.pageId, kind: "aid_mission_signup",
    subject: { aidMission: mission._id }, sourcePersonId: volunteerPersonId,
  })
}

/**
 * ET-01 : taille d'un lot de bénévoles avisés par passage — celle de la diffusion d'une
 * annulation d'évènement de page (`PAGE_EVENT_NOTICE_BATCH_SIZE`, 32) : chaque destinataire
 * relit la mission, son inscription, la porte unique et la file de livraison.
 */
export const AID_MISSION_VOLUNTEER_NOTICE_BATCH_SIZE = 32

/** Les deux avis d'une mission à ses bénévoles inscrits. */
export type AidMissionVolunteerNoticeKind = Extract<DiasporaCommunityNotificationKind, "aid_mission_cancelled" | "aid_mission_rescheduled">
const volunteerNoticeKindValidator = v.union(v.literal("aid_mission_cancelled"), v.literal("aid_mission_rescheduled"))

/**
 * ET-01 (issue antsia#101) : les bénévoles à l'inscription CONFIRMÉE d'une mission, avisés HORS
 * de la transaction du geste, par lots bornés chaînés par curseur (index
 * `by_network_mission_status_signedUpAt`). Chaque destinataire passe par la porte unique, qui
 * relit la garde (membre actif, mission servie, inscription confirmée, état annoncé) et refuse
 * l'auteur du geste ; un lot rejoué n'ajoute rien (clé par mission, changement et version). Le
 * job ne touche ni la mission ni les inscriptions : aucun conflit avec les gestes.
 */
export const noticeAidMissionVolunteers = internalMutation({
  args: {
    networkId: v.id("networks"),
    missionId: v.id("aidMissions"),
    kind: volunteerNoticeKindValidator,
    cursor: v.union(v.string(), v.null()),
    /** Le signataire qui a annulé ou déplacé la mission : jamais avisé de son propre geste, jamais stocké. */
    sourcePersonId: v.optional(v.id("persons")),
  },
  returns: v.object({ notified: v.number(), done: v.boolean() }),
  handler: async (ctx, args): Promise<{ notified: number; done: boolean }> => {
    const mission = await ctx.db.get(args.missionId)
    if (!mission || mission.networkId !== args.networkId) return { notified: 0, done: true }
    const page = await ctx.db
      .query("aidMissionSignups")
      .withIndex("by_network_mission_status_signedUpAt", (q) => q.eq("networkId", args.networkId).eq("missionId", mission._id).eq("status", "confirmed"))
      .paginate({ cursor: args.cursor, numItems: AID_MISSION_VOLUNTEER_NOTICE_BATCH_SIZE })
    const source = args.sourcePersonId !== undefined ? { sourcePersonId: args.sourcePersonId } : {}
    let notified = 0
    for (const row of page.page) {
      // Une ligne d'un autre réseau ou d'une autre mission n'est jamais une adresse ; l'auteur du geste n'est pas avisé.
      if (row.networkId !== args.networkId || row.missionId !== mission._id || row.status !== "confirmed" || row.personId === args.sourcePersonId) continue
      if (await notice(ctx, { networkId: args.networkId, recipientPersonId: row.personId, kind: args.kind, subject: { aidMission: mission._id }, ...source })) notified += 1
    }
    if (page.isDone) return { notified, done: true }
    await ctx.scheduler.runAfter(0, internal.modules.diaspora.communityNotifications.noticeAidMissionVolunteers, {
      networkId: args.networkId, missionId: mission._id, kind: args.kind, cursor: page.continueCursor, ...source,
    })
    return { notified, done: false }
  },
})

/**
 * ET-01 : après `cancelMission`, ou `updateMission` quand l'horaire change — programme l'avis
 * aux bénévoles inscrits, APRÈS la transaction du geste (rien n'est écrit si elle échoue). Une
 * mission sans inscrit ne programme rien.
 */
export async function scheduleAidMissionVolunteerNotices(
  ctx: Pick<MutationCtx, "scheduler">,
  input: { readonly mission: Doc<"aidMissions">; readonly kind: AidMissionVolunteerNoticeKind; readonly sourcePersonId: Id<"persons"> },
): Promise<void> {
  if (input.mission.signupCount <= 0) return
  await ctx.scheduler.runAfter(0, internal.modules.diaspora.communityNotifications.noticeAidMissionVolunteers, {
    networkId: input.mission.networkId, missionId: input.mission._id, kind: input.kind, cursor: null, sourcePersonId: input.sourcePersonId,
  })
}

/** Après une demande de mentorat PUBLIÉE (`requestMentoring`) : le mentor. */
export async function noticeMentoringRequested(ctx: MutationCtx, requestId: Id<"mentoringRequests">): Promise<void> {
  const request = await ctx.db.get(requestId)
  if (!request) return
  await notice(ctx, {
    networkId: request.networkId, recipientPersonId: request.mentorPersonId, kind: "mentoring_request_received",
    subject: { mentoringRequest: request._id }, sourcePersonId: request.menteePersonId,
  })
}

/** Après l'accord ou le refus du mentor : le mentoré. */
export async function noticeMentoringDecided(ctx: MutationCtx, requestId: Id<"mentoringRequests">): Promise<void> {
  const request = await ctx.db.get(requestId)
  if (!request) return
  const kind = request.status === "accepted" ? "mentoring_request_accepted" : request.status === "declined" ? "mentoring_request_declined" : null
  if (kind === null) return
  await notice(ctx, {
    networkId: request.networkId, recipientPersonId: request.menteePersonId, kind,
    subject: { mentoringRequest: request._id }, sourcePersonId: request.mentorPersonId,
  })
}

/** Après une clôture, par une partie ou par le retrait du profil du mentor : l'AUTRE partie. */
export async function noticeMentoringClosed(ctx: MutationCtx, requestId: Id<"mentoringRequests">, closerPersonId: Id<"persons">): Promise<void> {
  const request = await ctx.db.get(requestId)
  if (!request || request.status !== "closed") return
  const recipientPersonId = closerPersonId === request.menteePersonId ? request.mentorPersonId : request.menteePersonId
  await notice(ctx, {
    networkId: request.networkId, recipientPersonId, kind: "mentoring_closed",
    subject: { mentoringRequest: request._id }, sourcePersonId: closerPersonId,
  })
}

/** Après une candidature PUBLIÉE (`applyToJobOffer`) : l'équipe vivante de la page. */
export async function noticeJobApplicationReceived(ctx: MutationCtx, applicationId: Id<"jobApplications">): Promise<void> {
  const application = await ctx.db.get(applicationId)
  if (!application) return
  await noticeTeam(ctx, {
    networkId: application.networkId, pageId: application.pageId, kind: "job_application_received",
    subject: { jobApplication: application._id }, sourcePersonId: application.candidatePersonId,
  })
}

/** Après une présélection ou une non-sélection : la personne qui candidate, jamais le motif. */
export async function noticeJobApplicationDecided(ctx: MutationCtx, applicationId: Id<"jobApplications">, signatoryPersonId: Id<"persons">): Promise<void> {
  const application = await ctx.db.get(applicationId)
  if (!application) return
  const kind = application.status === "shortlisted" ? "job_application_shortlisted" : application.status === "not_selected" ? "job_application_not_selected" : null
  if (kind === null) return
  await notice(ctx, {
    networkId: application.networkId, recipientPersonId: application.candidatePersonId, kind,
    subject: { jobApplication: application._id }, sourcePersonId: signatoryPersonId,
  })
}

/** Après une relecture du kit, publication ou renvoi : la personne qui a écrit la version relue. */
export async function noticeKitResourceReviewed(ctx: MutationCtx, resourceId: Id<"kitResources">, reviewerPersonId: Id<"persons">): Promise<void> {
  const row = await ctx.db.get(resourceId)
  if (!row) return
  await notice(ctx, {
    networkId: row.networkId, recipientPersonId: row.revisedByPersonId, kind: "kit_resource_reviewed",
    subject: { kitResource: row._id }, sourcePersonId: reviewerPersonId,
  })
}
