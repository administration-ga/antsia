/**
 * CC-3b (contrat CONVERSATION-CONTEXTUELLE-V1, ADR-0025) : resynchronisation des conversations
 * contextuelles APRÈS une décision de modération sur un contenu de la tranche.
 *
 * Le moteur appelle `removeDiasporaTarget` et `restoreDiasporaTarget` AVANT d'écrire le nouvel
 * état de modération (effets jugés sur l'état précédent, `moderation/targets.ts`). Un retrait ou
 * un rétablissement qui ne change pas le statut de l'objet ne serait donc pas vu par une
 * synchronisation immédiate, qui relirait l'ancien état. C'est le cas d'une candidature, d'une
 * offre d'emploi ou d'un profil de mentor. Ce passage, planifié dans la même transaction,
 * s'exécute après elle et relit l'état écrit.
 *
 * Bornes :
 *   · les candidatures présélectionnées d'une offre, cent au plus ;
 *   · les mentorats en cours d'un profil, au plafond du mentor (dix) et une ligne témoin.
 * Au-delà, l'accès reste juste, car le moteur relit l'objet à chaque requête ; seul le cache
 * attend le crochet suivant. Le passage n'écrit ni avis ni appel et n'échoue sur aucun refus.
 */
import { MENTOR_CAPACITY_MAX } from "@diaspora-ga/domain"
import { v } from "convex/values"

import { internalMutation } from "../../_generated/server"
import { syncContextualConversation } from "../contextualMessaging/hooks"

/** Les candidatures présélectionnées d'une offre resynchronisées par décision. */
export const OFFER_SHORTLIST_SYNC_MAX = 100

/** Les contenus dont un retrait ou un rétablissement change une phase sans changer un statut. */
export const conversationModerationTargetValidator = v.union(
  v.object({ kind: v.literal("diasporaMentorProfile"), id: v.id("mentorProfiles") }),
  v.object({ kind: v.literal("diasporaJobApplication"), id: v.id("jobApplications") }),
  v.object({ kind: v.literal("diasporaJobOffer"), id: v.id("jobOffers") }),
)

export const syncConversationsAfterModeration = internalMutation({
  args: { target: conversationModerationTargetValidator },
  returns: v.object({ synced: v.number() }),
  handler: async (ctx, { target }) => {
    switch (target.kind) {
      case "diasporaJobApplication": {
        await syncContextualConversation(ctx, { kind: "diasporaJobApplication", id: target.id })
        return { synced: 1 }
      }
      case "diasporaJobOffer": {
        const offer = await ctx.db.get(target.id)
        if (!offer) return { synced: 0 }
        // borné : cent candidatures présélectionnées par offre (voir l'en-tête).
        const shortlisted = await ctx.db
          .query("jobApplications")
          .withIndex("by_network_and_offer_and_status_and_createdAt", (q) => q.eq("networkId", offer.networkId).eq("offerId", offer._id).eq("status", "shortlisted"))
          .take(OFFER_SHORTLIST_SYNC_MAX)
        for (const application of shortlisted) await syncContextualConversation(ctx, { kind: "diasporaJobApplication", id: application._id })
        return { synced: shortlisted.length }
      }
      case "diasporaMentorProfile": {
        const profile = await ctx.db.get(target.id)
        if (!profile) return { synced: 0 }
        // borné : le plafond le plus haut d'un mentor (dix) et une ligne témoin.
        const active = await ctx.db
          .query("mentoringRequests")
          .withIndex("by_network_and_mentor_and_status_and_updatedAt", (q) => q.eq("networkId", profile.networkId).eq("mentorPersonId", profile.personId).eq("status", "accepted"))
          .take(MENTOR_CAPACITY_MAX + 1)
        let synced = 0
        for (const request of active) {
          if (request.mentorProfileId !== profile._id) continue
          await syncContextualConversation(ctx, { kind: "diasporaMentoring", id: request._id })
          synced += 1
        }
        return { synced }
      }
    }
  },
})
