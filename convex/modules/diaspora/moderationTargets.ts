/**
 * Cibles de modération de la vague H DIASPORA.GA (lot G9) — tranche `diaspora`,
 * écrite par la session DIASPORA.GA (ajouts délégués par la session ANTSIA).
 * Aucune fonction Convex ici.
 *
 * Appelée par le moteur — `moderation/targets` (résolution de l'audience,
 * retrait, rétablissement) et `moderation/reviewProjection` (aperçu borné) —,
 * elle n'importe JAMAIS `moderation/targets` (pas de cycle) : chaque garde vit
 * dans son module (`readable…OrNull`) et y sert aussi les lectures publiques ;
 * deux définitions de « ce lecteur voit ce contenu » ne peuvent pas diverger.
 *
 * Propriétaire d'un dossier (`ownerPersonId`) : l'auteur d'une question ou d'une
 * réponse, le mentor de son profil, le MENTORÉ de sa demande (signalable par le
 * mentor seul), l'auteur d'une ressource personnelle, la personne d'un profil de
 * talent, la personne qui candidate (candidature signalable par l'équipe vivante
 * de la page seule). Une mission, une offre ou une ressource portée par une page
 * appartiennent à la PAGE : aucune personne n'en devient propriétaire, et un
 * signataire vivant ne signale pas le contenu de sa page (refus indistinct ; le
 * moteur lui refuse aussi de le trancher, par l'état de modération de la page).
 */
import { effectiveMentoringStatus } from "@diaspora-ga/domain"
import type { Infer } from "convex/values"

import { internal } from "../../_generated/api"
import type { Doc, Id } from "../../_generated/dataModel"
import type { MutationCtx, QueryCtx } from "../../_generated/server"
import { syncContextualConversation } from "../contextualMessaging/hooks"
import { contentState } from "../moderation/policy"
import type { moderationTargetValidator } from "../moderation/tables"
import { liveSignatoryRole } from "../pages/access"
import { readableKitResourceOrNull } from "./arrivalKit"
import { recountAidAnswer, releaseAidAnswer } from "./contentCounters"
import { isDiasporaNetwork } from "./facts"
import { readableJobOfferOrNull, readableTalentProfileOrNull, teamReadableJobApplicationOrNull } from "./jobs"
import { mentoringRequestForMentorOrNull, readableMentorProfileOrNull } from "./mentoring"
import { type DiasporaModerationSurface, isDiasporaSurface } from "./moderationContent"
import { readableAidAnswerOrNull, readableAidMissionOrNull, readableAidQuestionOrNull } from "./mutualAid"

type ReadCtx = Pick<QueryCtx, "db">
type ModerationTarget = Infer<typeof moderationTargetValidator>
type ModerationStatus = Doc<"moderationContentStates">["status"]

/** Une cible de la vague H : l'une des neuf natures gouvernées par cette tranche. */
export type DiasporaModerationTarget = Extract<ModerationTarget, { kind: DiasporaModerationSurface }>

export function isDiasporaTarget(target: ModerationTarget): target is DiasporaModerationTarget {
  return isDiasporaSurface(target.kind)
}

/** Bornes des extraits, en caractères : titres et corps comme le moteur. */
const TITLE_EXCERPT = 200
const BODY_EXCERPT = 2_000
const LONG_BODY_EXCERPT = 4_000
/** Une candidature : un extrait de son message, jamais le message entier (3 000 signes au plus). */
export const APPLICATION_MESSAGE_EXCERPT = 500
/** Une demande de mentorat : son objectif tronqué, ni message ni créneaux. */
export const MENTORING_GOAL_EXCERPT = 80

const excerpt = (value: string | undefined, maximum: number): string | null => (value ? value.slice(0, maximum) : null)

/** La personne parle-t-elle aujourd'hui au nom de cette page (signataire VIVANT, règle du moteur) ? */
async function signsFor(ctx: ReadCtx, page: Doc<"pages">, personId: Id<"persons">): Promise<boolean> {
  return (await liveSignatoryRole(ctx, page, personId)) !== null
}

/**
 * L'audience RÉELLE d'une cible de la vague H pour CE signaleur, et son
 * propriétaire. `null` : le refus indistinct — la cible ne se lit pas d'ici
 * (autre réseau, retirée, en relecture, bloquée, hors audience), ou c'est le
 * contenu de la page que le signaleur signe. Le moteur refuse ensuite le
 * signalement de son propre contenu (`ownerPersonId`).
 */
export async function resolveDiasporaTarget(
  ctx: ReadCtx,
  network: Doc<"networks">,
  personId: Id<"persons">,
  target: DiasporaModerationTarget,
): Promise<{ ownerPersonId?: Id<"persons"> } | null> {
  if (!isDiasporaNetwork(network)) return null
  switch (target.kind) {
    case "diasporaAidQuestion": {
      const question = await readableAidQuestionOrNull(ctx, network._id, personId, target.id)
      return question ? { ownerPersonId: question.authorPersonId } : null
    }
    case "diasporaAidAnswer": {
      const found = await readableAidAnswerOrNull(ctx, network._id, personId, target.id)
      return found ? { ownerPersonId: found.answer.authorPersonId } : null
    }
    case "diasporaAidMission": {
      const found = await readableAidMissionOrNull(ctx, network, personId, target.id)
      return found && !(await signsFor(ctx, found.page, personId)) ? {} : null
    }
    case "diasporaMentorProfile": {
      const profile = await readableMentorProfileOrNull(ctx, network._id, personId, target.id)
      return profile ? { ownerPersonId: profile.personId } : null
    }
    case "diasporaMentoringRequest": {
      const request = await mentoringRequestForMentorOrNull(ctx, network._id, personId, target.id)
      return request ? { ownerPersonId: request.menteePersonId } : null
    }
    case "diasporaKitResource": {
      const row = await readableKitResourceOrNull(ctx, network, personId, target.id)
      if (!row) return null
      if (row.pageId !== undefined) {
        const page = await ctx.db.get(row.pageId)
        return page && !(await signsFor(ctx, page, personId)) ? {} : null
      }
      return row.authorPersonId !== undefined ? { ownerPersonId: row.authorPersonId } : null
    }
    case "diasporaJobOffer": {
      const found = await readableJobOfferOrNull(ctx, network, personId, target.id)
      return found && !(await signsFor(ctx, found.page, personId)) ? {} : null
    }
    case "diasporaTalentProfile": {
      const profile = await readableTalentProfileOrNull(ctx, network._id, personId, target.id)
      return profile ? { ownerPersonId: profile.personId } : null
    }
    case "diasporaJobApplication": {
      const application = await teamReadableJobApplicationOrNull(ctx, network._id, personId, target.id)
      return application ? { ownerPersonId: application.candidatePersonId } : null
    }
  }
}

/**
 * Les effets du RETRAIT sur la tranche, jugés sur l'état AVANT retrait : un
 * second retrait (deux dossiers suivis d'effet) ne décompte rien. Ne lève
 * jamais : une décision motivée n'échoue pas sur une ligne disparue.
 *  - réponse d'entraide : elle ne compte plus parmi les réponses publiées et,
 *    retenue, sa question la perd (résolue → ouverte, version suivante) ;
 *  - demande de mentorat : rien ne reste ouvert au nom d'un contenu retiré — en
 *    attente, elle est déclinée ; en cours, close (par le système) : la boîte du
 *    mentor, le plafond du mentoré et la paire se libèrent ;
 *  - autres natures : le masque de modération suffit (lectures filtrées par
 *    `isServedTo`), aucun compteur stocké n'en dépend.
 * Conversations contextuelles (CC-3b) : la demande de mentorat déclinée ou close
 * resynchronise sa conversation aussitôt (son statut change). Une candidature, une
 * offre ou un profil de mentor retirés ne changent aucun statut : leur
 * resynchronisation est planifiée après la transaction, quand l'état « retiré »
 * est écrit (`conversationSync.ts`).
 */
export async function removeDiasporaTarget(ctx: MutationCtx, target: ModerationTarget): Promise<void> {
  if (!isDiasporaTarget(target)) return
  const before = await contentState(ctx, target.kind, target.id)
  if (before?.status === "removed") return
  const now = Date.now()
  if (target.kind === "diasporaAidAnswer") {
    const answer = await ctx.db.get(target.id)
    if (answer && answer.status === "published") await releaseAidAnswer(ctx, answer, now)
  } else if (target.kind === "diasporaMentoringRequest") {
    const request = await ctx.db.get(target.id)
    if (!request) return
    const status = effectiveMentoringStatus(request, now)
    if (status === "sent") await ctx.db.patch(request._id, { status: "declined", closedBy: "system", closedAt: now, updatedAt: now })
    else if (status === "accepted") await ctx.db.patch(request._id, { status: "closed", closedBy: "system", closedAt: now, updatedAt: now })
    await syncContextualConversation(ctx, { kind: "diasporaMentoring", id: request._id })
  }
  await scheduleConversationSync(ctx, target)
}

/** Planifie la resynchronisation des conversations d'un contenu dont la décision ne change aucun statut. */
async function scheduleConversationSync(ctx: MutationCtx, target: DiasporaModerationTarget): Promise<void> {
  if (target.kind === "diasporaJobApplication" || target.kind === "diasporaJobOffer" || target.kind === "diasporaMentorProfile") {
    await ctx.scheduler.runAfter(0, internal.modules.diaspora.conversationSync.syncConversationsAfterModeration, { target })
  }
}

/**
 * Les effets du RÉTABLISSEMENT (recours admis, retrait temporaire échu,
 * relecture préalable approuvée), jugés sur l'état précédent : seule une
 * réponse RETIRÉE (et non en relecture, déjà comptée) recompte, si son auteur
 * ne l'a pas retirée entre-temps. La réponse retenue n'est jamais rétablie
 * (geste de l'auteur de la question) ; une demande de mentorat close par le
 * retrait reste close (rétablir rend la lecture, ne rouvre rien). Ne lève jamais
 * (le passage d'échéance des sanctions traite cinquante dossiers par lot).
 * Conversations contextuelles (CC-3b) : une candidature, une offre ou un profil
 * de mentor rétablis rouvrent les conversations que rien d'autre ne ferme, après
 * la transaction (`conversationSync.ts`).
 */
export async function restoreDiasporaTarget(ctx: MutationCtx, target: ModerationTarget, previous: ModerationStatus | null): Promise<void> {
  if (!isDiasporaTarget(target) || previous !== "removed") return
  if (target.kind === "diasporaAidAnswer") {
    const answer = await ctx.db.get(target.id)
    if (answer && answer.status === "published") await recountAidAnswer(ctx, answer, Date.now())
  }
  await scheduleConversationSync(ctx, target)
}

/**
 * L'aperçu BORNÉ d'une cible assignée (PA8) : le seul contenu signalé — jamais
 * un auteur, un candidat, un mentoré, une coordonnée, une pièce, un créneau, un
 * lieu ni un contenu voisin (question d'une réponse, offre d'une candidature,
 * profil joint). Une candidature ne montre qu'un extrait de son message ; une
 * demande de mentorat, son objectif tronqué. `null` : indisponible (autre
 * réseau, ligne disparue, ou retirée par son auteur : question, réponse,
 * candidature, ressource archivée, offre close).
 */
export async function diasporaModerationExcerpt(ctx: ReadCtx, networkId: Id<"networks">, target: ModerationTarget): Promise<{ title: string | null; body: string | null } | null> {
  if (!isDiasporaTarget(target)) return null
  switch (target.kind) {
    case "diasporaAidQuestion": {
      const row = await ctx.db.get(target.id)
      return row && row.networkId === networkId && row.status !== "withdrawn" ? { title: excerpt(row.title, TITLE_EXCERPT), body: excerpt(row.detail, BODY_EXCERPT) } : null
    }
    case "diasporaAidAnswer": {
      const row = await ctx.db.get(target.id)
      return row && row.networkId === networkId && row.status === "published" ? { title: null, body: excerpt(row.body, BODY_EXCERPT) } : null
    }
    case "diasporaAidMission": {
      const row = await ctx.db.get(target.id)
      return row && row.networkId === networkId ? { title: excerpt(row.title, TITLE_EXCERPT), body: excerpt(row.description, BODY_EXCERPT) } : null
    }
    case "diasporaMentorProfile": {
      const row = await ctx.db.get(target.id)
      return row && row.networkId === networkId ? { title: null, body: excerpt(`${row.presentation}\n${row.availability}`, BODY_EXCERPT) } : null
    }
    case "diasporaMentoringRequest": {
      const row = await ctx.db.get(target.id)
      return row && row.networkId === networkId ? { title: null, body: excerpt(row.goal, MENTORING_GOAL_EXCERPT) } : null
    }
    case "diasporaKitResource": {
      const row = await ctx.db.get(target.id)
      return row && row.networkId === networkId && row.status !== "archived"
        ? { title: excerpt(row.title, TITLE_EXCERPT), body: excerpt(`${row.summary}\n${row.body}`, LONG_BODY_EXCERPT) }
        : null
    }
    case "diasporaJobOffer": {
      const row = await ctx.db.get(target.id)
      return row && row.networkId === networkId && row.status !== "closed" ? { title: excerpt(row.title, TITLE_EXCERPT), body: excerpt(row.description, LONG_BODY_EXCERPT) } : null
    }
    case "diasporaTalentProfile": {
      const row = await ctx.db.get(target.id)
      return row && row.networkId === networkId ? { title: excerpt(row.title, TITLE_EXCERPT), body: excerpt(row.skills.join(" · "), BODY_EXCERPT) } : null
    }
    case "diasporaJobApplication": {
      const row = await ctx.db.get(target.id)
      return row && row.networkId === networkId && row.status !== "withdrawn" ? { title: null, body: excerpt(row.message, APPLICATION_MESSAGE_EXCERPT) } : null
    }
  }
}
