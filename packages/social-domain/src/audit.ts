// Dupliqué de socle/convex/lib/contextAudit.ts (types de l'acte et du détail) @ ad2e7fdc2 — adaptations : règles PURES sorties du backend ; actions, qualités (« à quel titre ») et sujets en listes FERMÉES qui s'allongent avec les modules ; détail PLAT et borné (le socle acceptait `v.any()`) ; motif de décision borné par une règle du domaine ; contexte institutionnel (organisation, rattachement, affectation, poste) remplacé par la QUALITÉ de l'acteur dans le moteur.
/**
 * Le journal des décisions du moteur — ce que dit une ligne d'audit.
 *
 * QUI a agi (`actorPersonId`, absent pour le système), À QUEL TITRE
 * (`capacity` : opérateur de plateforme, administrateur ou modérateur du
 * réseau, système), QUOI (`action`, verbe canonique `domaine.verbe`), SUR QUOI
 * (`subject`), DANS QUEL RÉSEAU (absent pour un acte de plateforme), POURQUOI
 * (`details.reason` quand la décision exige un motif).
 *
 * Le détail est PLAT et BORNÉ : des scalaires, jamais un contenu publié,
 * jamais une adresse ni un secret. Une décision se relit dans son sujet ;
 * l'audit dit qu'elle a eu lieu, par qui et pourquoi.
 */
import { DomainViolation } from "./violation"

export const AUDIT_ACTIONS = [
  // Console : réseaux
  "network.create",
  "network.update",
  "network.archive",
  "network.archive_request", "network.archive_cancel",
  "console.access", "console.incident_open", "console.incident_resolve", "console.metrics_refresh",
  // Console : adhésions (suspension à la racine, qui vaut partout)
  "membership.suspend_everywhere",
  "membership.lift_suspension",
  /**
   * Rôle de réseau d'une adhésion posé ou retiré (EX-08, cahier § 6.3) : par un administrateur
   * de la plateforme (console), ou par l'administration d'un réseau gouverné par une tranche.
   */
  "membership.role_set",
  // Modération d'un réseau
  "moderation.report_decide",
  "moderation.team_create", "moderation.team_member_set", "moderation.policy_set", "moderation.term_set",
  "moderation.appeal_file", "moderation.appeal_decide", "moderation.content_review",
  "moderation.sanction_expire", "moderation.transparency_compute",
  // SU01h : mesures sur ordre du juge (référé numérique, art. 39 à 44) — exécution par un opérateur,
  // confirmation par un second, action au fond notée, levée motivée ou à l'échéance (système).
  "judicial.measure_open", "judicial.measure_confirm", "judicial.merits_action_note", "judicial.measure_lift", "judicial.measure_expire",
  "data.erasure_request", "data.erasure_cancel", "data.erasure_complete", "data.export_request",
  "federation.emitter_set", "federation.replay", "federation.media_retry",
  "federation.agent_consent", "federation.agent_withdraw",
  // Geste de l'auteur : retrait de la diffusion publique, sans retrait du contenu.
  "post.root_withdraw",
  // Garde des fichiers
  "file.release",
  "file.requeue",
  "file.purge_blob",
  // Pages : décisions tracées (confiance, état, adresse, création d'une page
  // d'institution, habilitation des signataires, revendications)
  "page.create_official",
  "page.trust_set",
  "page.status_set",
  "page.handle_set",
  "page.signatory_grant",
  "page.signatory_revoke",
  "page.claim_decide",
  "page.post_edit",
  "page.post_pin",
  // Boutiques (P07, `convex/modules/shops/`) : politique de publication des
  // vitrines d'un réseau, décision sur une demande en file d'admission,
  // suspension et rétablissement d'une vitrine par l'équipe de la plateforme
  "shop.policy_set",
  "shop.storefront_decide",
  "shop.storefront_status_set",
  // Catalogue projeté P09 : configuration serveur et consentement de publication.
  "commercial.policy_set",
  "commercial.mandate_grant",
  "commercial.mandate_revoke",
  "commercial.mandate_accept",
  "commercial.shop_settings_set",
  "catalog.policy_set",
  "checkout.policy_set",
  "payment.policy_set",
  "catalog.mapping_set",
  // Emploi P15 : politique d'un réseau (offres publiques et candidatures), décision opérateur.
  "job.policy_set",
  // Services P14 : ouverture des devis, rendez-vous et prestations d'un réseau, décision opérateur.
  "service.policy_set",
  // Conversations contextuelles (CC-2b, ADR-0025) : politique d'une nature dans un réseau, décision opérateur motivée.
  "contextual.policy_set",
  // Tranche `diaspora` (émis par `convex/modules/diaspora/`)
  /** Un parrainage retiré par la MODÉRATION du réseau (le retrait par le parrain n'est pas une décision). */
  "diaspora.sponsorship_revoke",
] as const
export type AuditAction = (typeof AUDIT_ACTIONS)[number]

/**
 * À quel titre l'acte a été posé : la qualité qui l'AUTORISAIT au moment de l'acte.
 * AS-01 : `moderation_team_member`, le membre actif d'une équipe de modération vivante du réseau
 * qui n'y tient aucun rôle de réseau (il tranche une revendication de page par son équipe).
 */
export const AUDIT_CAPACITIES = ["platform_admin", "platform_operator", "network_admin", "network_moderator", "page_admin", "member", "system", "moderation_team_member"] as const
export type AuditCapacity = (typeof AUDIT_CAPACITIES)[number]

/** Les tables qu'une décision peut viser — une référence, jamais un contenu. */
export const AUDIT_SUBJECT_TABLES = ["networks", "networkArchiveRequests", "operators", "consoleIncidents", "consoleMetrics", "persons", "fileScans", "contentReports", "posts", "pages", "pageClaims", "reports", "moderationTeams", "sanctions", "appeals", "moderationPolicies", "blockedTerms", "moderationContentStates", "moderationTransparency", "dataErasureJobs", "dataExports", "federationEmitters", "federationDeadLetters", "mirrors", "shops", "judicialMeasures"] as const
export type AuditSubjectTable = (typeof AUDIT_SUBJECT_TABLES)[number]

export type AuditSubject = { table: AuditSubjectTable; id: string }

/** Une valeur du détail : un scalaire, rien d'autre. */
export type AuditDetailValue = string | number | boolean | null
export type AuditDetails = Readonly<Record<string, AuditDetailValue>>

export const AUDIT_DETAILS_MAX_KEYS = 12
export const AUDIT_DETAIL_STRING_MAX = 500
const AUDIT_DETAIL_KEY = /^[a-z][a-zA-Z0-9]{0,39}$/

/**
 * Les défauts d'un détail d'audit (liste vide : conforme). Une faute ici est
 * une faute de PROGRAMMATION — les motifs saisis sont bornés avant, par
 * `assertDecisionReason`.
 */
export function auditDetailsProblems(details: AuditDetails): string[] {
  const problems: string[] = []
  const entries = Object.entries(details)
  if (entries.length > AUDIT_DETAILS_MAX_KEYS) problems.push(`trop de clés (${entries.length} > ${AUDIT_DETAILS_MAX_KEYS})`)
  for (const [key, value] of entries) {
    if (!AUDIT_DETAIL_KEY.test(key)) problems.push(`clé mal formée : ${key}`)
    if (typeof value === "string" && value.length > AUDIT_DETAIL_STRING_MAX) problems.push(`valeur trop longue : ${key}`)
    if (typeof value === "number" && !Number.isFinite(value)) problems.push(`nombre non fini : ${key}`)
  }
  return problems
}

/** Un acte du système (cron, balayeur) n'a pas d'acteur ; un acte humain en a un. */
export function isSystemCapacity(capacity: AuditCapacity): capacity is "system" {
  return capacity === "system"
}

/** Borne haute commune à tous les motifs de décision. */
export const DECISION_REASON_MAX = AUDIT_DETAIL_STRING_MAX

/**
 * Le motif d'une décision, nettoyé : entre `min` et `DECISION_REASON_MAX`
 * caractères une fois les espaces retirés aux bords, sinon la règle
 * `DECISION_REASON_LENGTH` (le seuil bas dépend de la décision).
 */
export function assertDecisionReason(reason: string, min: number): string {
  const trimmed = reason.trim()
  if (trimmed.length < min || trimmed.length > DECISION_REASON_MAX) {
    throw new DomainViolation("DECISION_REASON_LENGTH", { min, max: DECISION_REASON_MAX })
  }
  return trimmed
}
