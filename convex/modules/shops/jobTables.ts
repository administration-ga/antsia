/**
 * P15 — tables de l'EMPLOI : politique fermée par défaut, miroirs publics
 * d'offres (PRO.GA reste l'autorité), sujets candidats opaques, pièces admises
 * par la garde des fichiers et candidatures privées (octets signés transitoires).
 *
 * Préfixes réservés `commerceJob*` / `commerceApplication*` : aucun nom commun
 * avec l'emploi propre de la tranche DIASPORALE.
 */
import { COMMERCE_JOBS_ATTACHMENT_KINDS, COMMERCE_JOBS_CONTRACT } from "@antsia/social-domain/commerce-jobs"
import { COMMERCE_APPLICATION_STATES } from "@antsia/social-domain/commerce/lifecycle"
import { COMMERCE_ENVIRONMENTS, COMMERCE_PUBLIC_CONTRACT, COMMERCE_PUBLIC_CONTRACT_V2 } from "@antsia/social-domain/commerce/primitives"
import { COMMERCE_JOB_CONTRACT_TYPES } from "@antsia/social-domain/commerce/projection"
import { defineTable } from "convex/server"
import { v } from "convex/values"

import { literals } from "../../lib/validators"

export const jobContractTypeValidator = literals(COMMERCE_JOB_CONTRACT_TYPES)
export const jobAttachmentKindValidator = literals(COMMERCE_JOBS_ATTACHMENT_KINDS)
export const jobRemoteStateValidator = literals(COMMERCE_APPLICATION_STATES)
export const jobHeadContractValidator = v.union(v.literal(COMMERCE_PUBLIC_CONTRACT), v.literal(COMMERCE_PUBLIC_CONTRACT_V2), v.literal(COMMERCE_JOBS_CONTRACT))
export const jobHeadStateValidator = v.union(v.literal("active"), v.literal("withdrawn"), v.literal("closed"))
export const jobClosureValidator = v.union(v.literal("closed"), v.literal("filled"), v.literal("withdrawn"))
/** Candidature locale : file d'envoi, résultat distant, retrait. Aucun état ne prétend une décision RH. */
export const jobApplicationStateValidator = v.union(
  v.literal("queued"), v.literal("submitting"), v.literal("submitted"), v.literal("rejected"),
  v.literal("withdrawal_pending"), v.literal("withdrawn"), v.literal("failed"),
)
/** Refus fermés de COMMAND §6.9 (`application.submit`) : aucun motif libre, aucune note RH. */
export const JOB_APPLICATION_REJECTIONS = ["access_denied", "already_applied", "capability_disabled", "consent_invalid", "job_closed", "quota_exceeded", "request_expired"] as const
export type JobApplicationRejection = (typeof JOB_APPLICATION_REJECTIONS)[number]
export const jobApplicationRejectionValidator = literals(JOB_APPLICATION_REJECTIONS)
export const jobFileTransferValidator = v.union(v.literal("pending"), v.literal("stored"), v.literal("revoke_pending"), v.literal("revoked"), v.literal("failed"))
export const jobRevokeReasonValidator = v.union(v.literal("candidate_request"), v.literal("erasure"))
export const jobApplicationFileValidator = v.object({
  fileId: v.id("commerceApplicationFiles"), attachmentRef: v.string(), kind: jobAttachmentKindValidator,
  sha256: v.string(), byteSize: v.number(), transfer: jobFileTransferValidator, attempts: v.number(),
})

export const jobTables = {
  /** Clé abandonnée avant admission : aucun contenu candidat, conservée jusqu'à son effacement. */
  commerceApplicationIntentFences: defineTable({
    networkId: v.id("networks"), personId: v.id("persons"), idempotencyKey: v.string(), stoppedAt: v.number(),
  }).index("by_key", ["personId", "networkId", "idempotencyKey"]).index("by_person", ["personId"]),
  /** Politique d'un réseau, réglée par un opérateur ; aucune ligne : emplois et candidatures FERMÉS. */
  commerceJobPolicies: defineTable({
    networkId: v.id("networks"), jobsEnabled: v.boolean(), applicationsEnabled: v.boolean(),
    updatedAt: v.number(), updatedByPersonId: v.optional(v.id("persons")),
  }).index("by_network", ["networkId"]),

  /**
   * Tête d'une offre reflétée : dernière révision admise, tombe ou clôture.
   * `contentJson` garde le dernier contenu PUBLIÉ normalisé : un lien connu
   * affiche la clôture ; un retrait n'est jamais republié par un état ancien.
   */
  commerceJobHeads: defineTable({
    networkId: v.id("networks"), shopId: v.id("shops"), mappingId: v.id("commerceCatalogMappings"), mappingGeneration: v.number(),
    emitterId: v.id("federationEmitters"), environment: literals(COMMERCE_ENVIRONMENTS), contract: jobHeadContractValidator,
    objectRef: v.string(), shopRef: v.string(), state: jobHeadStateValidator, closure: v.optional(jobClosureValidator),
    revision: v.number(), digest: v.string(), body: v.string(), contentJson: v.optional(v.string()),
    changedAt: v.number(), receivedAt: v.number(), parentActivationRevision: v.number(), gap: v.boolean(),
    contractType: v.optional(jobContractTypeValidator), closesOn: v.optional(v.string()),
  }).index("by_emitter_object", ["emitterId", "objectRef"])
    .index("by_network_shop_state_changedAt", ["networkId", "shopId", "state", "changedAt"])
    .index("by_network_state_changedAt", ["networkId", "state", "changedAt"])
    .index("by_state_changedAt", ["state", "changedAt"]),

  /** Sujet `candidate` opaque par personne/réseau/boutique/source/environnement : jamais celui d'acheteur. */
  commerceApplicationSubjects: defineTable({
    networkId: v.id("networks"), personId: v.id("persons"), shopId: v.id("shops"), source: v.string(),
    environment: literals(COMMERCE_ENVIRONMENTS), subjectRef: v.string(), createdAt: v.number(),
  }).index("by_scope", ["networkId", "personId", "shopId", "source", "environment"]).index("by_person", ["personId"]),

  /**
   * Pièce personnelle admise (usage `job_application_document`, analyse complète
   * exigée) ; jamais d'URL servie. Sa référence transmise (`attachmentRef`) est
   * dérivée PAR CANDIDATURE du sujet candidat : deux structures ne peuvent pas
   * corréler une même pièce.
   */
  commerceApplicationFiles: defineTable({
    networkId: v.id("networks"), personId: v.id("persons"), storageId: v.id("_storage"),
    kind: jobAttachmentKindValidator, filename: v.optional(v.string()), sha256: v.string(), byteSize: v.number(),
    state: v.union(v.literal("ready"), v.literal("retired")), createdAt: v.number(), retiredAt: v.optional(v.number()),
  }).index("by_person_state", ["personId", "state"]).index("by_storage", ["storageId"]),

  /**
   * Candidature privée : intention du candidat, octets COMMAND persistés jusqu'à
   * résolution, puis seulement les références et états autorisés. Le nom civil
   * et la motivation restent la donnée du candidat (export, retrait, effacement).
   */
  commerceApplications: defineTable({
    networkId: v.id("networks"), personId: v.id("persons"), shopId: v.id("shops"), mappingId: v.id("commerceCatalogMappings"),
    jobRef: v.string(), shopRef: v.string(), linkRef: v.string(), jobTitle: v.string(),
    source: v.string(), environment: literals(COMMERCE_ENVIRONMENTS), configFingerprint: v.string(),
    subjectRef: v.string(), requestId: v.string(), requestSha256: v.string(), requestExpiresAt: v.number(), rawBody: v.optional(v.string()),
    idempotencyKey: v.string(), intentionSha256: v.string(), intentionVersion: v.optional(v.literal(2)), consentTextVersion: v.string(), consentedAt: v.number(),
    // Preuve privée prise UNIQUEMENT lors d'un geste authentifié ; jamais exportée ni renouvelée par cron.
    authorizationSessionId: v.optional(v.string()), authorizationAuthUserId: v.optional(v.string()),
    authorizedAt: v.optional(v.number()), authorizationUntil: v.optional(v.number()), authorizationRequired: v.optional(v.boolean()),
    leaseSessionId: v.optional(v.string()),
    // Absence distante corrélée : permet une nouvelle décision seulement après expiration + dérive d'horloge.
    unknownConfirmedAt: v.optional(v.number()), unknownRequestSha256: v.optional(v.string()),
    civilName: v.optional(v.object({ firstName: v.string(), lastName: v.string() })), motivation: v.optional(v.string()),
    files: v.array(jobApplicationFileValidator),
    state: jobApplicationStateValidator, rejection: v.optional(jobApplicationRejectionValidator), applicationRef: v.optional(v.string()), submittedAt: v.optional(v.number()),
    remoteState: v.optional(jobRemoteStateValidator), remoteRevision: v.optional(v.number()), remoteUpdatedAt: v.optional(v.number()),
    statusCheckedAt: v.optional(v.number()), statusRequestedAt: v.optional(v.number()),
    revokedAt: v.optional(v.number()), revokeReason: v.optional(jobRevokeReasonValidator),
    controlBody: v.optional(v.string()), controlExpiresAt: v.optional(v.number()), controlAttachmentRef: v.optional(v.string()),
    dispatchedAt: v.optional(v.number()), attempts: v.number(), nextAttemptAt: v.number(), generation: v.number(), leaseUntil: v.optional(v.number()),
    lastOutcome: v.optional(v.union(v.literal("unavailable"), v.literal("rejected"), v.literal("expired"))),
    remoteUnconfirmed: v.optional(v.boolean()),
    createdAt: v.number(), updatedAt: v.number(),
  }).index("by_person", ["personId"])
    .index("by_person_revoked", ["personId", "revokedAt"])
    .index("by_person_network_createdAt", ["personId", "networkId", "createdAt"])
    .index("by_person_network_key", ["personId", "networkId", "idempotencyKey"])
    .index("by_person_network_job", ["personId", "networkId", "jobRef"])
    .index("by_person_job", ["personId", "jobRef"])
    .index("by_request", ["requestId"])
    .index("by_person_state", ["personId", "state"])
    .index("by_state_nextAttemptAt", ["state", "nextAttemptAt"]),
}
