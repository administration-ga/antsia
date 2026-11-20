/**
 * Compteurs des contenus de la vague H DIASPORA.GA (lot G9) — tranche `diaspora`,
 * écrite par la session DIASPORA.GA. Aucune fonction Convex ici.
 *
 * - Retrait par la modération et rétablissement (appelés par `moderationTargets`) :
 *   une réponse d'entraide retirée ne compte plus parmi les réponses publiées et,
 *   retenue, sa question la perd ; rétablie, elle compte de nouveau.
 * - Crochets d'effacement (`removeDiasporaCounters`, appelé par `removeCounters`
 *   de `people/erasure` AVANT la suppression de chaque ligne, sur le modèle des
 *   crochets du moteur) : ADDITIFS et limités à nos tables — une ligne d'une autre
 *   table est ignorée. Ils n'écrivent que des compteurs et des états dérivés de la
 *   ligne effacée, jamais une copie de son contenu.
 *
 * `answerCount` compte les réponses publiées par leur auteur et non retirées par
 * la modération (une réponse en relecture préalable compte : elle peut être
 * approuvée) ; `signupCount` les inscriptions confirmées ; `outdatedFlags` les
 * signalements « périmée » de la version COURANTE.
 */
import { aidMissionStatusFor, aidStatusWithoutAcceptedAnswer } from "@diaspora-ga/domain"

import type { Doc } from "../../_generated/dataModel"
import type { MutationCtx } from "../../_generated/server"
import { contentState } from "../moderation/policy"

type WriteCtx = Pick<MutationCtx, "db">

/**
 * Une réponse ne compte plus parmi les réponses publiées de sa question ; si
 * elle était la réponse retenue, la question la perd : résolue redevient ouverte
 * et sa version avance (la lecture de l'auteur est périmée).
 */
export async function releaseAidAnswer(ctx: WriteCtx, answer: Doc<"aidAnswers">, now: number): Promise<void> {
  const question = await ctx.db.get(answer.questionId)
  if (!question || question.networkId !== answer.networkId) return
  const accepted = question.acceptedAnswerId === answer._id
  await ctx.db.patch(question._id, {
    answerCount: Math.max(0, question.answerCount - 1),
    updatedAt: now,
    ...(accepted
      ? { acceptedAnswerId: undefined, resolvedAt: undefined, status: aidStatusWithoutAcceptedAnswer(question.status), version: question.version + 1 }
      : {}),
  })
}

/**
 * Une réponse rétablie compte de nouveau. Elle n'est jamais rétablie comme
 * réponse retenue : retenir reste le geste de l'auteur de la question.
 */
export async function recountAidAnswer(ctx: WriteCtx, answer: Doc<"aidAnswers">, now: number): Promise<void> {
  const question = await ctx.db.get(answer.questionId)
  if (!question || question.networkId !== answer.networkId || question.status === "withdrawn") return
  await ctx.db.patch(question._id, { answerCount: question.answerCount + 1, updatedAt: now })
}

/**
 * Crochet d'effacement de la vague H, appelé pour CHAQUE ligne effacée (toutes
 * tables) : seules `aidAnswers`, `aidMissionSignups` et `kitOutdatedFlags` ont
 * un effet.
 *  - une réponse PUBLIÉE (ni retirée par son auteur, ni retirée par la
 *    modération : déjà décomptées) décrémente `answerCount` ; retenue, la
 *    question la perd (résolue → ouverte, version suivante) ;
 *  - une inscription CONFIRMÉE décrémente `signupCount` et rouvre une mission
 *    complète (une mission close ou annulée le reste) ;
 *  - un signalement « périmée » de la version COURANTE décrémente `outdatedFlags`
 *    de sa ressource (un signalement d'une version passée ne compte déjà plus).
 * Une ligne parente déjà effacée (passe précédente) n'a plus rien à décompter.
 */
export async function removeDiasporaCounters(ctx: WriteCtx, table: string, row: Record<string, unknown>): Promise<void> {
  const now = Date.now()
  if (table === "aidAnswers") {
    const answer = row as unknown as Doc<"aidAnswers">
    if (answer.status !== "published") return
    if ((await contentState(ctx, "diasporaAidAnswer", answer._id))?.status === "removed") return
    await releaseAidAnswer(ctx, answer, now)
  } else if (table === "aidMissionSignups") {
    const signup = row as unknown as Doc<"aidMissionSignups">
    if (signup.status !== "confirmed") return
    const mission = await ctx.db.get(signup.missionId)
    if (!mission || mission.networkId !== signup.networkId) return
    const signupCount = Math.max(0, mission.signupCount - 1)
    await ctx.db.patch(mission._id, {
      signupCount,
      ...(mission.status === "full" ? { status: aidMissionStatusFor(mission.places, signupCount) } : {}),
      updatedAt: now,
    })
  } else if (table === "kitOutdatedFlags") {
    const flag = row as unknown as Doc<"kitOutdatedFlags">
    const resource = await ctx.db.get(flag.resourceId)
    if (!resource || resource.networkId !== flag.networkId || resource.revision !== flag.revision) return
    // Comme le signalement lui-même : la version de la ligne ne bouge pas.
    await ctx.db.patch(resource._id, { outdatedFlags: Math.max(0, resource.outdatedFlags - 1) })
  }
}
