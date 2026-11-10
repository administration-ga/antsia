// Dupliqué de socle/convex/modules/reseauPersonnel/tables.ts (l. 391-455, `reseauPersonnel_notifications`) @ ad2e7fdc2 — adaptations : UNE cloche sociale réseau/personne, références seules ; index de lecture et rétention active PA5 ; préférences par catégorie, abonnements quatre fournisseurs et file de livraison sans contenu, budgets hebdomadaires et reçus de digest.
/**
 * La cloche sociale d'un réseau : le RÉSIDU d'un geste social (quelqu'un a
 * réagi, commenté, demandé une connexion), jamais un contenu. Le sujet est une
 * RÉFÉRENCE, relue avec sa garde à l'ouverture. Dédoublonnage par `dedupKey`
 * (`genre|sujet|acteur`). Écrite par la porte unique `notify.ts` seulement.
 */
import { NOTIFICATION_KINDS, NOTIFICATION_RESOLUTIONS } from "@antsia/social-domain/notifications"
import { NOTIFICATION_CATEGORIES, PUSH_PROVIDERS } from "@antsia/social-domain/notificationDelivery"
import { COMMERCE_NOTIFICATION_KINDS } from "@antsia/social-domain/commerceNotifications"
import { defineTable } from "convex/server"
import { v } from "convex/values"

import { literals } from "../../lib/validators"

/**
 * Genres de la tranche `diaspora` — mise en relation (DG-010, DG-015, DG-016 ; plan
 * global DIASPORALE §7.4). HORS du domaine commun (`NOTIFICATION_KINDS`) : une cloche
 * qui ne les connaît pas les dit « nouvelle activité ». Émis par
 * `convex/modules/diaspora/serviceNotifications.ts` via `notifyPerson`, toujours SANS
 * acteur (avis du système), sans besoin, montant, créneau ni nom ; relus avec leur
 * garde à l'écriture, à la lecture de la cloche et avant tout transport.
 */
export const DIASPORA_SERVICE_NOTIFICATION_KINDS = [
  /** Équipe de la page : une demande de service est arrivée. */
  "service_request_received",
  /** Demandeur : une proposition (ou une nouvelle version) l'attend. */
  "service_proposal_received",
  /** Demandeur : la page a décliné la demande. */
  "service_request_declined",
  /** Équipe de la page : le demandeur a accepté la proposition courante. */
  "service_proposal_accepted",
  /** L'autre partie : la demande ou le rendez-vous a été annulé. */
  "service_request_cancelled",
  /** Demandeur, et l'équipe si elle avait proposé : l'échéance est passée sans accord. */
  "service_request_expired",
  /** Demandeur : la page a constaté la prestation réalisée. */
  "service_booking_completed",
  /** Demandeur : la page a constaté une absence. */
  "service_booking_no_show",
  /** Équipe de la page : la personne qui demande conteste l'absence constatée (ajout 19/10/2026, délégué par ANTSIA). */
  "service_no_show_contested",
  /** Responsables vivants de l'association : une demande d'adhésion est arrivée. */
  "association_membership_requested",
  /** La personne : sa demande d'adhésion est acceptée. */
  "association_membership_accepted",
  /** La personne : sa demande d'adhésion n'est pas retenue. */
  "association_membership_declined",
  /** La personne : les responsables ont mis fin à son adhésion. */
  "association_membership_removed",
  /** L'auteur d'un avis : la page lui a répondu (réponse publiée). */
  "service_review_replied",
] as const

export type DiasporaServiceNotificationKind = (typeof DIASPORA_SERVICE_NOTIFICATION_KINDS)[number]

/** Un genre de la tranche `diaspora` (mise en relation) ? Liste fermée, comparée telle quelle. */
export function isDiasporaServiceNotificationKind(kind: string): kind is DiasporaServiceNotificationKind {
  return (DIASPORA_SERVICE_NOTIFICATION_KINDS as readonly string[]).includes(kind)
}

/**
 * Genres de la tranche `diaspora` — vie communautaire (vague H du plan global DIASPORALE :
 * entraide, mentorat, emploi, kit d'arrivée), sur le modèle de la mise en relation. HORS du
 * domaine commun. Émis par `convex/modules/diaspora/communityNotifications.ts` via
 * `notifyPerson`, toujours SANS acteur (avis du système), sans contenu, motif ni nom ; relus
 * avec leur garde à l'écriture, à la lecture de la cloche et avant tout transport.
 * Ajout du 19/10/2026, délégué par ANTSIA (DIASPORALE docs/32 §8).
 */
export const DIASPORA_COMMUNITY_NOTIFICATION_KINDS = [
  /** Auteur d'une question d'entraide : une réponse y est publiée. */
  "aid_answer_received",
  /** Auteur d'une réponse : l'auteur de la question l'a retenue. */
  "aid_answer_retained",
  /** Équipe de la page : une personne s'inscrit à sa mission. */
  "aid_mission_signup",
  /** Mentor : une demande de mentorat lui arrive. */
  "mentoring_request_received",
  /** Mentoré : sa demande est acceptée. */
  "mentoring_request_accepted",
  /** Mentoré : sa demande est déclinée. */
  "mentoring_request_declined",
  /** L'autre partie : le mentorat est clos (y compris par le retrait du profil du mentor). */
  "mentoring_closed",
  /** Équipe de la page : une candidature arrive. */
  "job_application_received",
  /** Personne qui candidate : sa candidature est présélectionnée. */
  "job_application_shortlisted",
  /** Personne qui candidate : sa candidature n'est pas retenue (jamais le motif). */
  "job_application_not_selected",
  /** Personne qui a écrit la version relue d'une ressource du kit : publication ou renvoi. */
  "kit_resource_reviewed",
] as const

export type DiasporaCommunityNotificationKind = (typeof DIASPORA_COMMUNITY_NOTIFICATION_KINDS)[number]

/** Un genre de la tranche `diaspora` (vie communautaire) ? Liste fermée, comparée telle quelle. */
export function isDiasporaCommunityNotificationKind(kind: string): kind is DiasporaCommunityNotificationKind {
  return (DIASPORA_COMMUNITY_NOTIFICATION_KINDS as readonly string[]).includes(kind)
}

// Les genres du domaine commun, puis ceux de la tranche `diaspora` (mise en relation, ajout 18/10/2026 ;
// vie communautaire, ajout 19/10/2026 ; délégués par ANTSIA), puis les avis commerce P14/P15 (P14B,
// 19/10/2026 : `@antsia/social-domain/commerceNotifications`).
export const notificationKindValidator = literals([...NOTIFICATION_KINDS, ...DIASPORA_SERVICE_NOTIFICATION_KINDS, ...DIASPORA_COMMUNITY_NOTIFICATION_KINDS, ...COMMERCE_NOTIFICATION_KINDS] as const)

export const notificationResolutionValidator = literals(NOTIFICATION_RESOLUTIONS)
export const notificationCategoryValidator = literals(NOTIFICATION_CATEGORIES)
export const pushProviderValidator = literals(PUSH_PROVIDERS)
export const notificationCategorySettingsValidator = v.object({ social: v.boolean(), messages: v.boolean(), calls: v.boolean(), network: v.boolean(), moderation: v.boolean(), files: v.boolean() })
export const pushCredentialValidator = v.union(
  v.object({ provider: v.literal("web"), endpoint: v.string(), keys: v.object({ p256dh: v.string(), auth: v.string() }) }),
  v.object({ provider: v.literal("expo"), token: v.string() }),
  v.object({ provider: v.literal("fcm"), token: v.string() }),
  v.object({ provider: v.literal("apns"), token: v.string() }),
  v.object({ provider: v.literal("apns_voip"), token: v.string() }),
)
export const deliveryStateValidator = v.union(v.literal("queued"), v.literal("delivering"), v.literal("accepted"), v.literal("sent"), v.literal("unavailable"), v.literal("failed"), v.literal("cancelled"))

/** Le sujet d'une notification, tel que l'émetteur le désigne : une référence typée. */
export const notificationSubjectValidator = v.union(
  v.object({ commercialThread: v.id("commercialThreads") }),
  // CC-2b (ADR-0025) : la conversation contextuelle désignée, relue avec sa garde (référence seule).
  v.object({ contextualThread: v.id("contextualThreads") }),
  v.object({ post: v.id("posts") }),
  v.object({ connection: v.id("connections") }),
  v.object({ fileScan: v.id("fileScans") }),
  v.object({ thematicGroup: v.id("thematicGroups") }),
  v.object({ groupThread: v.id("groupThreads") }),
  v.object({ event: v.id("events") }),
  v.object({ album: v.id("albums") }),
  v.object({ call: v.id("calls") }),
  v.object({ voicemail: v.id("voicemails") }),
  v.object({ liveSession: v.id("liveSessions") }),
  v.object({ report: v.id("reports") }),
  // Tranche `diaspora` (mise en relation) : sujets propres, sans forme générique au domaine commun.
  v.object({ serviceRequest: v.id("serviceRequests") }),
  v.object({ associationMembership: v.id("associationMemberships") }),
  v.object({ serviceReview: v.id("serviceReviews") }),
  // Tranche `diaspora` (vie communautaire) : question, réponse et mission d'entraide, mentorat, candidature, ressource du kit.
  v.object({ aidQuestion: v.id("aidQuestions") }),
  v.object({ aidAnswer: v.id("aidAnswers") }),
  v.object({ aidMission: v.id("aidMissions") }),
  v.object({ mentoringRequest: v.id("mentoringRequests") }),
  v.object({ jobApplication: v.id("jobApplications") }),
  v.object({ kitResource: v.id("kitResources") }),
  // P14B : avis commerce — la demande privée de services (P14) ou la candidature (P15), références seules.
  v.object({ commerceServiceRequest: v.id("commerceServiceRequests") }),
  v.object({ commerceApplication: v.id("commerceApplications") }),
)

export const notificationsTables = {
  notifications: defineTable({
    networkId: v.id("networks"),
    recipientPersonId: v.id("persons"),
    /** L'auteur du geste ; absent pour un avis du système (garde des fichiers). */
    actorPersonId: v.optional(v.id("persons")),
    kind: notificationKindValidator,
    /** Ce que la notification DÉSIGNE — jamais ce qu'elle contient. */
    subjectPostId: v.optional(v.id("posts")),
    subjectConnectionId: v.optional(v.id("connections")),
    subjectFileScanId: v.optional(v.id("fileScans")),
    subjectThematicGroupId: v.optional(v.id("thematicGroups")),
    subjectCommercialThreadId: v.optional(v.id("commercialThreads")),
    /** CC-2b : la conversation contextuelle (`contextual_message`, `contextual_closed`). */
    subjectContextualThreadId: v.optional(v.id("contextualThreads")),
    subjectGroupThreadId: v.optional(v.id("groupThreads")),
    subjectEventId: v.optional(v.id("events")),
    subjectAlbumId: v.optional(v.id("albums")),
    subjectCallId: v.optional(v.id("calls")),
    subjectVoicemailId: v.optional(v.id("voicemails")),
    subjectLiveSessionId: v.optional(v.id("liveSessions")),
    subjectReportId: v.optional(v.id("reports")),
    /** Tranche `diaspora` : la demande de service, l'adhésion associative ou l'avis désignés (références seules). */
    subjectServiceRequestId: v.optional(v.id("serviceRequests")),
    subjectAssociationMembershipId: v.optional(v.id("associationMemberships")),
    subjectServiceReviewId: v.optional(v.id("serviceReviews")),
    /** Tranche `diaspora` (vie communautaire) : l'objet désigné par l'avis (références seules). */
    subjectAidQuestionId: v.optional(v.id("aidQuestions")),
    subjectAidAnswerId: v.optional(v.id("aidAnswers")),
    subjectAidMissionId: v.optional(v.id("aidMissions")),
    subjectMentoringRequestId: v.optional(v.id("mentoringRequests")),
    subjectJobApplicationId: v.optional(v.id("jobApplications")),
    subjectKitResourceId: v.optional(v.id("kitResources")),
    /** P14B : la demande privée de services (P14) ou la candidature (P15) désignées (références seules). */
    subjectCommerceServiceRequestId: v.optional(v.id("commerceServiceRequests")),
    subjectCommerceApplicationId: v.optional(v.id("commerceApplications")),
    dedupKey: v.string(),
    createdAt: v.number(),
    readAt: v.optional(v.number()),
    /** Résolution d'une notification actionnable, posée par le serveur ; une ligne résolue est lue d'office. */
    resolvedAt: v.optional(v.number()),
    resolution: v.optional(notificationResolutionValidator),
  })
    .index("by_network_recipient_createdAt", ["networkId", "recipientPersonId", "createdAt"])
    .index("by_network_recipient_readAt_createdAt", ["networkId", "recipientPersonId", "readAt", "createdAt"])
    .index("by_network_recipient_dedupKey", ["networkId", "recipientPersonId", "dedupKey"])
    .index("by_readAt_createdAt", ["readAt", "createdAt"]),

  notificationPreferences: defineTable({
    networkId: v.id("networks"), personId: v.id("persons"),
    pushCategories: notificationCategorySettingsValidator,
    digestCategories: notificationCategorySettingsValidator,
    emailDigest: v.boolean(), weeklyLimit: v.number(), updatedAt: v.number(),
  }).index("by_network_person", ["networkId", "personId"]),

  pushSubscriptions: defineTable({
    networkId: v.id("networks"), personId: v.id("persons"), applicationId: v.string(), deviceId: v.string(),
    provider: pushProviderValidator, credential: pushCredentialValidator,
    /** Empreinte stable du canal, jamais un endpoint réattribué à une autre personne. */
    credentialHash: v.string(), active: v.boolean(), createdAt: v.number(), updatedAt: v.number(),
    failureCount: v.number(),
    /** L’appareil ne reçoit rien après révocation de sa session PA4. */
    sessionId: v.optional(v.string()),
    nativeBindingId: v.optional(v.string()),
    sessionGeneration: v.optional(v.string()),
  })
    .index("by_provider_hash", ["provider", "credentialHash"])
    .index("by_network_person_active", ["networkId", "personId", "active"]),

  notificationWeeklyUsage: defineTable({
    networkId: v.id("networks"), personId: v.id("persons"), weekStart: v.number(), reserved: v.number(),
  }).index("by_network_person_week", ["networkId", "personId", "weekStart"])
    .index("by_week", ["weekStart"]),

  /** Aucune donnée de contenu ni de contact : une référence et un état de livraison. */
  notificationDeliveryJobs: defineTable({
    networkId: v.id("networks"), recipientPersonId: v.id("persons"), channel: v.union(v.literal("push"), v.literal("digest"), v.literal("call")),
    notificationId: v.optional(v.id("notifications")), callId: v.optional(v.id("calls")),
    subscriptionId: v.optional(v.id("pushSubscriptions")), applicationId: v.string(),
    /** Incarnation privée figée à l'admission ; une réinscription n'adopte pas les anciens jobs. */
    nativeBindingId: v.optional(v.string()), sessionGeneration: v.optional(v.string()), nativeExpiresAt: v.optional(v.number()),
    category: notificationCategoryValidator, dedupKey: v.string(), weekStart: v.number(),
    state: deliveryStateValidator, attempts: v.number(), nextAttemptAt: v.number(),
    leaseUntil: v.optional(v.number()), leaseToken: v.optional(v.string()),
    /** Expo : reçu opaque ; « accepté » n'est pas « livré ». */
    providerReceiptId: v.optional(v.string()),
    resultCode: v.optional(v.union(v.literal("configuration"), v.literal("invalid_subscription"), v.literal("transport"), v.literal("policy"), v.literal("expired"))),
    createdAt: v.number(), updatedAt: v.number(),
  }).index("by_dedup", ["dedupKey"])
    .index("by_notification", ["notificationId"])
    .index("by_call_recipient", ["callId", "recipientPersonId"])
    .index("by_state_due", ["state", "nextAttemptAt"])
    .index("by_createdAt", ["createdAt"])
    .index("by_network_recipient", ["networkId", "recipientPersonId"]),

  notificationDigestReceipts: defineTable({
    networkId: v.id("networks"), personId: v.id("persons"), weekStart: v.number(),
    jobId: v.id("notificationDeliveryJobs"), createdAt: v.number(),
  }).index("by_network_person_week", ["networkId", "personId", "weekStart"])
    .index("by_createdAt", ["createdAt"]),
}
