/**
 * Le PAYS que porte une cible de modération de DIASPORA.GA — tranche `diaspora`. Aucune fonction Convex ici.
 *
 * Une seule définition, lue par deux appelants qui ne doivent jamais diverger :
 *  · le guichet par pays (`diaspora/moderationDesk`), qui filtre ses files par le pays de la cible ;
 *  · le routage des dossiers du moteur (`moderation/routing`, CH-815, ADR-0042 : amendement « Routage des
 *    signalements par pays »), qui choisit l'équipe du pays du contenu.
 * Publication (son pays, sinon celui de sa page), commentaire (celui de sa publication), page, évènement et
 * direct d'une page (DL-03 : ses commentaires, le pays de la session), avis et réponse d'avis (zone de l'offre,
 * sinon pays de la page) ; vague H (G9) : question d'entraide et sa réponse (zone de la question), mission
 * (zone de la mission, sinon pays de sa page), ressource du kit (son pays, sinon celui de sa page), offre
 * d'emploi (zone de l'offre, sinon pays de la page) et candidature (pays de l'offre), profil de mentor ou de
 * talent (le pays qu'il déclare), demande de mentorat (pays du profil du mentor) ; MC-01 : groupe thématique
 * (son pays, sinon celui de sa page d'association). Les autres natures (compte, messages — message personnel
 * compris —, statut, album, offres de boutique) ne portent aucun pays : `null`. Le pays de résidence d'une
 * personne (facette à visibilité choisie) n'est JAMAIS lu. Un contenu d'un autre réseau n'a pas de pays ici.
 *
 * Déménagé tel quel de `diaspora/moderationDesk` (CH-815) ; seuls les noms exportés changent.
 */
import type { ModerationSurface } from "@antsia/social-domain/moderationPolicy"
import { isCountryCode, normalizeCountryCode } from "@diaspora-ga/domain"

import type { Doc, Id } from "../../_generated/dataModel"
import type { QueryCtx } from "../../_generated/server"

type ReadCtx = Pick<QueryCtx, "db">
type Target = Doc<"reports">["target"]

/** Le pays que porte la cible (ISO 3166-1 alpha-2, `null` : « sans pays ») et les pages dont elle relève. */
export type ModerationTargetFacts = { readonly country: string | null; readonly pageIds: readonly Id<"pages">[] }

const NO_FACTS: ModerationTargetFacts = { country: null, pageIds: [] }

/** Un code ISO 3166-1 alpha-2 connu, ou `null` (absent ou illisible : « sans pays »). */
export function moderationCountryCode(raw: string | undefined): string | null {
  if (raw === undefined) return null
  const code = normalizeCountryCode(raw)
  return isCountryCode(code) ? code : null
}

async function pageFacts(ctx: ReadCtx, networkId: Id<"networks">, pageId: Id<"pages"> | undefined): Promise<ModerationTargetFacts> {
  if (pageId === undefined) return NO_FACTS
  const page = await ctx.db.get(pageId)
  if (!page || page.networkId !== networkId) return NO_FACTS
  return { country: moderationCountryCode(page.country), pageIds: [page._id] }
}

async function postFacts(ctx: ReadCtx, networkId: Id<"networks">, postId: Id<"posts">): Promise<ModerationTargetFacts> {
  const post = await ctx.db.get(postId)
  if (!post || post.networkId !== networkId) return NO_FACTS
  const page = await pageFacts(ctx, networkId, post.pageId)
  return { country: moderationCountryCode(post.country) ?? page.country, pageIds: page.pageIds }
}

async function offerFacts(ctx: ReadCtx, networkId: Id<"networks">, offerId: Id<"serviceOffers">, pageId: Id<"pages">): Promise<ModerationTargetFacts> {
  const offer = await ctx.db.get(offerId)
  const page = await pageFacts(ctx, networkId, pageId)
  const zone = offer && offer.networkId === networkId ? moderationCountryCode(offer.country) : null
  return { country: zone ?? page.country, pageIds: page.pageIds }
}

/** Le pays que porte la cible et les pages dont elle relève — jamais le pays d'une personne. */
export async function moderationTargetFacts(ctx: ReadCtx, networkId: Id<"networks">, target: Target): Promise<ModerationTargetFacts> {
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
    // DL-03 : un commentaire de direct porte le pays et les pages de SA session, comme le direct lui-même.
    case "liveComment": {
      const comment = await ctx.db.get(target.id)
      if (!comment || comment.networkId !== networkId) return NO_FACTS
      const session = await ctx.db.get(comment.sessionId)
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
      return question && question.networkId === networkId ? { country: moderationCountryCode(question.country), pageIds: [] } : NO_FACTS
    }
    case "diasporaAidAnswer": {
      const answer = await ctx.db.get(target.id)
      const question = answer && answer.networkId === networkId ? await ctx.db.get(answer.questionId) : null
      return question && question.networkId === networkId ? { country: moderationCountryCode(question.country), pageIds: [] } : NO_FACTS
    }
    case "diasporaAidMission": {
      const mission = await ctx.db.get(target.id)
      if (!mission || mission.networkId !== networkId) return NO_FACTS
      const page = await pageFacts(ctx, networkId, mission.pageId)
      return { country: moderationCountryCode(mission.country) ?? page.country, pageIds: page.pageIds }
    }
    case "diasporaMentorProfile": {
      const profile = await ctx.db.get(target.id)
      return profile && profile.networkId === networkId ? { country: moderationCountryCode(profile.country), pageIds: [] } : NO_FACTS
    }
    case "diasporaMentoringRequest": {
      const request = await ctx.db.get(target.id)
      const profile = request && request.networkId === networkId ? await ctx.db.get(request.mentorProfileId) : null
      return profile && profile.networkId === networkId ? { country: moderationCountryCode(profile.country), pageIds: [] } : NO_FACTS
    }
    case "diasporaKitResource": {
      const resource = await ctx.db.get(target.id)
      if (!resource || resource.networkId !== networkId) return NO_FACTS
      const page = await pageFacts(ctx, networkId, resource.pageId)
      return { country: moderationCountryCode(resource.country) ?? page.country, pageIds: page.pageIds }
    }
    case "diasporaJobOffer": {
      const offer = await ctx.db.get(target.id)
      if (!offer || offer.networkId !== networkId) return NO_FACTS
      const page = await pageFacts(ctx, networkId, offer.pageId)
      return { country: moderationCountryCode(offer.country) ?? page.country, pageIds: page.pageIds }
    }
    case "diasporaTalentProfile": {
      const profile = await ctx.db.get(target.id)
      return profile && profile.networkId === networkId ? { country: moderationCountryCode(profile.country), pageIds: [] } : NO_FACTS
    }
    case "diasporaJobApplication": {
      const application = await ctx.db.get(target.id)
      if (!application || application.networkId !== networkId) return NO_FACTS
      const offer = await ctx.db.get(application.offerId)
      const page = await pageFacts(ctx, networkId, application.pageId)
      const zone = offer && offer.networkId === networkId ? moderationCountryCode(offer.country) : null
      return { country: zone ?? page.country, pageIds: page.pageIds }
    }
    // MC-01 : le pays du groupe, sinon celui de sa page d'association (groupe d'adhérents), dont les
    // signataires parlent pour lui ; jamais le pays d'un membre ni celui de son propriétaire.
    case "thematicGroup": {
      const group = await ctx.db.get(target.id)
      if (!group || group.networkId !== networkId) return NO_FACTS
      const page = await pageFacts(ctx, networkId, group.associationPageId)
      return { country: moderationCountryCode(group.country) ?? page.country, pageIds: page.pageIds }
    }
    // MC-01 : un fil 1:1 n'a ni lieu ni page, et le pays de ses deux parties n'est jamais lu : un message
    // personnel est « sans pays », sans rien relire du message ni du fil.
    case "personalMessage":
      return NO_FACTS
    // Compte, messages, statut, album, offres de boutique et d'emploi reflétées : aucun pays porté.
    default:
      return NO_FACTS
  }
}

/** La cible typée d'un état de modération (identifiant relu dans SA table), ou `null`. */
export function moderationTargetOf(ctx: ReadCtx, kind: ModerationSurface, id: string): Target | null {
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
    case "liveComment": {
      const typed = ctx.db.normalizeId("liveComments", id)
      return typed === null ? null : { kind: "liveComment" as const, id: typed }
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
    // MC-01 : surfaces signalables seulement (aucune écriture n'y passe la relecture préalable),
    // typées ici pour qu'un état de modération de ces natures ne reste jamais hors du guichet.
    case "thematicGroup": {
      const typed = ctx.db.normalizeId("thematicGroups", id)
      return typed === null ? null : { kind: "thematicGroup" as const, id: typed }
    }
    case "personalMessage": {
      const typed = ctx.db.normalizeId("personalMessages", id)
      return typed === null ? null : { kind: "personalMessage" as const, id: typed }
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

/**
 * Le pays que porte un contenu désigné par sa nature et son identifiant (ceux d'un dossier ou d'un état de
 * modération), ou `null` : identifiant illisible, nature sans pays, contenu absent ou d'un autre réseau.
 */
export async function moderationContentCountry(ctx: ReadCtx, networkId: Id<"networks">, kind: ModerationSurface, id: string): Promise<string | null> {
  const target = moderationTargetOf(ctx, kind, id)
  return target === null ? null : (await moderationTargetFacts(ctx, networkId, target)).country
}
