/**
 * Manifeste de la tranche `diaspora` — ce qu'elle apporte au moteur, en un lieu :
 * le réseau qu'elle gouverne, l'application qui le sert et sa marque, ses tables,
 * les seaux de débit qu'elle consomme, les finalités de consentement qu'elle lit,
 * les contrats qu'elle consomme, et son passage planifié. Aucune fonction ici ; le
 * test de la tranche vérifie que ce manifeste dit vrai (tables du schéma, seaux du
 * moteur, application du catalogue).
 */
import { ATTESTATION_CONTRACT, DIASPORALE_NETWORK_SEED, DIASPORALE_NETWORK_SLUG, DIASPORALE_SLICE } from "@diasporale/domain"

import type { RateLimitBucket } from "../../lib/rateLimit"

export const DIASPORA_SLICE_MANIFEST = {
  slice: DIASPORALE_SLICE,
  network: DIASPORALE_NETWORK_SLUG,
  /**
   * L'application du catalogue (`deploy/catalog.json`) qui sert le réseau, et le
   * nom du réseau dans les messages que le moteur envoie à qui vient d'elle (code
   * de connexion, `betterAuth/delivery`).
   */
  application: "diasporale_com",
  brand: DIASPORALE_NETWORK_SEED.name,
  tables: [
    "countryHubs",
    "sponsorships",
    "consularAttestations",
    "communityImports",
    "memberPrivacy",
    // Plan global (docs/14 de DIASPORALE) : catalogue des services (DG-011/012),
    // demandes et rendez-vous (DG-014/015), adhésions aux associations (DG-010).
    "serviceOffers",
    "serviceRequests",
    "serviceProposals",
    "serviceBookings",
    "serviceReviews",
    "serviceReviewReplies",
    "associationMemberships",
    // Vague H : entraide et mentorat (DG-024).
    "aidQuestions",
    "aidAnswers",
    "aidMissions",
    "aidMissionSignups",
    "mentorProfiles",
    "mentorListings",
    "mentoringRequests",
    // Mesure du pilote (G11, DG-027) : agrégats sans contenu privé.
    "pilotMetricsDaily",
    // Talents et emploi (DG-025).
    "jobOffers",
    "jobApplications",
    "talentProfiles",
    // Kit d'arrivée (DG-024 b).
    "kitResources",
    "kitResourceReviews",
    "kitOutdatedFlags",
  ],
  rateLimits: [
    "network.join",
    "network.leave",
    "person.facet",
    "diaspora.sponsor",
    "diaspora.sponsor.revoke",
    "diaspora.attestation.request",
    // Plan global : mise en relation et associations (seaux posés par ANTSIA le 18/10/2026).
    "diaspora.service.offer",
    "diaspora.service.request",
    "diaspora.service.respond",
    "diaspora.service.booking",
    "diaspora.service.review",
    "diaspora.association.membership",
    "diaspora.association.manage",
    // Vague H (entraide, kit d'arrivée, mentorat, emploi, modération par pays), seaux du 18/10/2026.
    "diaspora.aid.post",
    "diaspora.aid.answer",
    "diaspora.aid.manage",
    "diaspora.kit.write",
    "diaspora.kit.review",
    "diaspora.mentor.profile",
    "diaspora.mentor.request",
    "diaspora.mentor.respond",
    "diaspora.job.offer",
    "diaspora.job.apply",
    "diaspora.job.review",
    "diaspora.talent.profile",
    "diaspora.moderation.decide",
  ] as const satisfies readonly RateLimitBucket[],
  consentPurposes: ["social_profile", "directory", "consular_attestation"],
  contracts: [ATTESTATION_CONTRACT, "DIASPORA-COMMUNAUTE-V1"],
  /** Passages planifiés de la tranche (`convex/crons.ts`, fichier du moteur, lignes déléguées). */
  scheduled: [
    "modules/diaspora/hubs:refreshHubCounters",
    "modules/diaspora/serviceRequests:expireDueServiceRequests",
    "modules/diaspora/mentoring:expireDueMentoringRequests",
    "modules/diaspora/pilotMetrics:refreshPilotMetrics",
    "modules/diaspora/jobs:closeExpiredJobOffers",
  ],
} as const
