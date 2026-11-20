/**
 * Les résolveurs DIASPORA.GA des conversations contextuelles : sous-lot CC-3a du contrat
 * CONVERSATION-CONTEXTUELLE-V1 (accepté le 19/10/2026, ADR-0025), au type de CC-2a
 * (`contextualMessaging/contract.ts`). Seul le registre du moteur
 * (`contextualMessaging/registry.ts`) importe ce fichier.
 *
 * Pour chaque nature, la tranche fournit :
 *   · `load` : l'instantané de l'objet, relu par index. Réseau, demandeur, répondant, phase
 *     calculée par la règle pure de `@diaspora-ga/domain` sur l'état EFFECTIF, appels engagés,
 *     premier mot, pièces, statut d'écriture, pays du guichet ;
 *   · `visibleTo` : la visibilité propre de l'objet pour une personne. Un objet en relecture
 *     préalable n'est visible que de sa personne propriétaire (absent pour l'autre côté, N09).
 *     Un objet retiré reste visible, en lecture seule : `load` rend alors une phase fermée.
 *     Le masque de la personne qui a signalé vaut pour les projections publiques, pas pour la
 *     conversation d'un objet dont elle est partie : elle doit pouvoir lire et clore ;
 *   · `textRule` : D8, l'adresse exacte refusée en voix de personne, admise en voix de page.
 *
 * Obligations (§10.3) : lecture seule, lectures bornées par identifiant ou par index,
 * déterminisme. Aucune lecture des signataires, des blocages ni des adhésions, qui restent au
 * moteur, et aucune liste de personnes. Tout refus prend la forme `null` ou `false`.
 */
import type { ContextualKind } from "@antsia/social-domain/contextualMessaging"
import {
  CONVERSATION_WRITE_MIN_STATUS,
  conversationTextRefusal,
  jobApplicationConversation,
  mentoringConversation,
  serviceRequestConversation,
  type ConversationFacts,
} from "@diaspora-ga/domain"

import type { Id } from "../../_generated/dataModel"
import type {
  ContextualReadCtx,
  ContextualResolvers,
  ContextualResponderRef,
  ContextualSnapshot,
  ContextualTextRuleInput,
  ContextualTextRuleResult,
} from "../contextualMessaging/contract"
import { contentState } from "../moderation/policy"
import { isDiasporaNetwork } from "./facts"
import { isRemovedByModeration, type DiasporaModerationSurface } from "./moderationContent"

/** Un code de pays ISO 3166-1 alpha-2, sinon `null` : le guichet ne reçoit jamais une valeur libre. */
function countryCode(value: string | undefined | null): string | null {
  return typeof value === "string" && /^[A-Z]{2}$/u.test(value) ? value : null
}

/** L'objet appartient-il à un réseau gouverné par la tranche (actif) ? */
async function inDiasporaNetwork(ctx: ContextualReadCtx, networkId: Id<"networks">): Promise<boolean> {
  return isDiasporaNetwork(await ctx.db.get(networkId))
}

function snapshot(input: {
  readonly networkId: Id<"networks">
  readonly requesterPersonId: Id<"persons">
  readonly responder: ContextualResponderRef
  readonly facts: ConversationFacts
  readonly country: string | undefined | null
}): ContextualSnapshot {
  return {
    networkId: input.networkId,
    requester: { personId: input.requesterPersonId },
    responder: input.responder,
    phase: input.facts.phase,
    callsEngaged: input.facts.callsEngaged,
    responderFirst: input.facts.responderFirst,
    attachments: { requester: input.facts.attachments.requester, responder: input.facts.attachments.responder },
    writeMinStatus: { requester: CONVERSATION_WRITE_MIN_STATUS, responder: CONVERSATION_WRITE_MIN_STATUS },
    moderationCountry: countryCode(input.country),
  }
}

/**
 * En relecture préalable, un objet n'est visible que de sa personne propriétaire ; publié,
 * retiré (lecture seule, phase fermée) ou sans état de modération : visible.
 */
async function visibleUnderReview(ctx: ContextualReadCtx, kind: DiasporaModerationSurface, id: string, personId: Id<"persons">): Promise<boolean> {
  const state = await contentState(ctx, kind, id)
  return state?.status !== "pending_review" || state.ownerPersonId === personId
}

/** D8, identique pour les trois natures : la voix de l'émetteur décide, jamais le côté. */
function textRule<K extends ContextualKind>(input: ContextualTextRuleInput<K>): ContextualTextRuleResult {
  const code = conversationTextRefusal({ text: input.text, voice: input.voice })
  return code === null ? { ok: true } : { ok: false, code }
}

export const DIASPORA_CONVERSATION_CONTEXTS = {
  /** Demande de service (DG-013, DG-014) : la personne qui demande, face à la page de l'offre. */
  diasporaServiceRequest: {
    kind: "diasporaServiceRequest",
    async load(ctx, requestId, now) {
      const request = await ctx.db.get(requestId)
      if (!request || !(await inDiasporaNetwork(ctx, request.networkId))) return null
      const offer = await ctx.db.get(request.offerId)
      return snapshot({
        networkId: request.networkId,
        requesterPersonId: request.requesterPersonId,
        responder: { pageId: request.pageId },
        facts: serviceRequestConversation({ status: request.status, deadlineAt: request.deadlineAt ?? null }, now),
        // Le guichet du pays de l'offre (zone du contenu).
        country: offer?.country,
      })
    },
    // Aucune nature de modération ne porte sur la demande elle-même : la page et les personnes sont relues par le moteur.
    async visibleTo(ctx, requestId) {
      const request = await ctx.db.get(requestId)
      return request !== null && (await inDiasporaNetwork(ctx, request.networkId))
    },
    textRule,
  },

  /** Mentorat (DG-024 c) : la personne mentorée, face à son mentor (voix de personne des deux côtés). */
  diasporaMentoring: {
    kind: "diasporaMentoring",
    async load(ctx, requestId, now) {
      const request = await ctx.db.get(requestId)
      if (!request || !(await inDiasporaNetwork(ctx, request.networkId))) return null
      const profile = await ctx.db.get(request.mentorProfileId)
      // La demande ou le profil du mentor retirés par la modération ferment la conversation.
      const removed = (await isRemovedByModeration(ctx, "diasporaMentoringRequest", request._id))
        || (await isRemovedByModeration(ctx, "diasporaMentorProfile", request.mentorProfileId))
      return snapshot({
        networkId: request.networkId,
        requesterPersonId: request.menteePersonId,
        responder: { personId: request.mentorPersonId },
        facts: mentoringConversation({ status: request.status, expiresAt: request.expiresAt }, now, removed),
        // Le guichet du pays déclaré par le profil du mentor.
        country: profile?.country,
      })
    },
    async visibleTo(ctx, requestId, personId) {
      const request = await ctx.db.get(requestId)
      if (!request || !(await inDiasporaNetwork(ctx, request.networkId))) return false
      return await visibleUnderReview(ctx, "diasporaMentoringRequest", request._id, personId)
    },
    textRule,
  },

  /** Candidature (DG-025) : la personne qui candidate, face à la page de l'offre. */
  diasporaJobApplication: {
    kind: "diasporaJobApplication",
    async load(ctx, applicationId) {
      const application = await ctx.db.get(applicationId)
      if (!application || !(await inDiasporaNetwork(ctx, application.networkId))) return null
      const offer = await ctx.db.get(application.offerId)
      // Clore l'offre ne ferme rien (D6) ; la candidature ou l'offre retirées par la modération ferment.
      const removed = {
        application: await isRemovedByModeration(ctx, "diasporaJobApplication", application._id),
        offer: await isRemovedByModeration(ctx, "diasporaJobOffer", application.offerId),
      }
      return snapshot({
        networkId: application.networkId,
        requesterPersonId: application.candidatePersonId,
        responder: { pageId: application.pageId },
        facts: jobApplicationConversation({ status: application.status }, removed),
        // Le guichet du pays de l'offre.
        country: offer?.country,
      })
    },
    async visibleTo(ctx, applicationId, personId) {
      const application = await ctx.db.get(applicationId)
      if (!application || !(await inDiasporaNetwork(ctx, application.networkId))) return false
      return await visibleUnderReview(ctx, "diasporaJobApplication", application._id, personId)
    },
    textRule,
  },
} satisfies ContextualResolvers
