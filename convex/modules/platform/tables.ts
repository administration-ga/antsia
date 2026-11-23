/**
 * Tables de la plateforme : les opérateurs de la console, le JOURNAL des
 * décisions du moteur (`engineAudit`, PA3 lot 6) et, en développement local
 * seulement, les codes à usage unique lisibles à l'écran. La console complète
 * (IDN `loa ≥ 2` obligatoire, double validation des actes irréversibles)
 * arrive au prompt PA7 ; son journal est la lecture de `engineAudit`.
 */
import { DEMO_GATE_SCOPES } from "@antsia/social-contracts/demoGate"
import { AUDIT_ACTIONS, AUDIT_CAPACITIES, AUDIT_SUBJECT_TABLES } from "@antsia/social-domain/audit"
import { defineTable } from "convex/server"
import { v } from "convex/values"

import { literals } from "../../lib/validators"

export const auditActionValidator = literals(AUDIT_ACTIONS)
export const auditCapacityValidator = literals(AUDIT_CAPACITIES)
export const auditSubjectTableValidator = literals(AUDIT_SUBJECT_TABLES)
/** Le détail d'une ligne : plat, des scalaires (bornes : `auditDetailsProblems`). */
export const auditDetailsValidator = v.record(v.string(), v.union(v.string(), v.number(), v.boolean(), v.null()))

/** La portée d'une ligne de la porte des comptes de démonstration (CH-817) : le site servi. */
export const demoGateScopeValidator = literals(DEMO_GATE_SCOPES)
export const demoGateChallengeStatusValidator = v.union(
  v.literal("active"),
  v.literal("superseded"),
  v.literal("verified"),
  v.literal("exhausted"),
  v.literal("expired"),
  v.literal("delivery_failed"),
)

export const platformTables = {
  /**
   * La preuve d'une session ouverte par le retour IDN (PA7), une par session Better Auth, scellée
   * par le serveur seul (`operatorAccess.recordIdnSession`). Elle sert la console du moteur
   * (`accessLoggedAt`) et, depuis ADR-0042, l'administration d'un réseau (`networkAdminAccess`) :
   * deux journalisations DISTINCTES, pour qu'une session ne vaille jamais pour l'autre porte.
   */
  operatorSessionProofs: defineTable({
    sessionId: v.string(), authUserId: v.string(), idnSubject: v.string(),
    loa: v.union(v.literal(1), v.literal(2), v.literal(3)),
    personId: v.optional(v.id("persons")), observedAt: v.number(), expiresAt: v.number(),
    accessLoggedAt: v.optional(v.number()),
    /**
     * ADR-0042 — la clé, au catalogue (`deploy/catalog.json`), de l'application web où le retour IDN
     * a LIVRÉ la session, établie par le serveur à partir de l'état OAuth qu'il avait lui-même
     * enregistré (`betterAuth/settings.applicationOfOAuthState`). Absente : preuve d'avant ADR-0042,
     * parcours natif, ou retour sans application de confiance — l'administration d'un réseau et,
     * depuis la revue CH-815 F3, la console la refusent (la console n'admet que sa propre clé). Une chaîne et non une liste fermée : retirer une application du catalogue ne doit pas
     * rendre invalides, au déploiement, des preuves qui expirent d'elles-mêmes en sept jours.
     */
    application: v.optional(v.string()),
    /** ADR-0042 — l'accès d'administration du réseau journalisé pour cette session (`network.admin_access`). */
    networkAdminAccess: v.optional(v.object({ networkId: v.id("networks"), loggedAt: v.number() })),
  }).index("by_session", ["sessionId"]).index("by_person", ["personId"]).index("by_expiry", ["expiresAt"]),

  operators: defineTable({
    personId: v.id("persons"),
    role: v.union(v.literal("platform_operator"), v.literal("platform_admin")),
    grantedAt: v.number(),
    grantedByPersonId: v.optional(v.id("persons")),
    revokedAt: v.optional(v.number()),
  }).index("by_person", ["personId"])
    .index("by_grantedByPersonId", ["grantedByPersonId"]),

  /**
   * Codes à usage unique de DÉVELOPPEMENT : écrits seulement quand les outils
   * de développement sont ouverts (variable ET déploiement local), pour que la
   * personne qui teste lise son code à l'écran sans service de courriel. Une
   * ligne par adresse, remplacée à chaque envoi. Toujours vide en production.
   */
  devOtpCodes: defineTable({
    email: v.string(),
    code: v.string(),
    expiresAt: v.number(),
    createdAt: v.number(),
  }).index("by_email", ["email"]),

  /**
   * Porte des comptes de démonstration (CH-817, `./demoGate.ts`). AUCUN numéro, code ni jeton en
   * clair : des empreintes HMAC-SHA256 liées au secret du déploiement (`ANTSIA_DEMO_GATE_SECRET`).
   * Changer le secret rend la liste et les sessions inopérantes : la liste se rejoue.
   *
   * La LISTE des numéros autorisés d'une portée (20 actifs au plus), alimentée par les fonctions
   * internes `allowPhones` / `revokePhones` que lance le propriétaire. Un retrait garde la ligne
   * (sujet du journal) ; une réinscription la rouvre.
   */
  demoGateAllowlist: defineTable({
    scope: demoGateScopeValidator,
    phoneHash: v.string(),
    addedAt: v.number(),
    revokedAt: v.optional(v.number()),
  }).index("by_scope_phoneHash", ["scope", "phoneHash"]),

  /**
   * Les DÉFIS : un par demande admise d'un numéro de la liste, le nouveau remplace l'ancien.
   * `codeDigest` lie le code au défi et à l'empreinte du numéro. Cinq essais, cinq minutes ;
   * un envoi WhatsApp échoué invalide le défi (`delivery_failed`). Purgés 24 h après expiration.
   */
  demoGateChallenges: defineTable({
    scope: demoGateScopeValidator,
    challengeId: v.string(),
    phoneHash: v.string(),
    codeDigest: v.string(),
    status: demoGateChallengeStatusValidator,
    attemptsUsed: v.number(),
    createdAt: v.number(),
    expiresAt: v.number(),
    invalidatedAt: v.optional(v.number()),
    verifiedAt: v.optional(v.number()),
  })
    .index("by_challengeId", ["challengeId"])
    .index("by_scope_phoneHash_status", ["scope", "phoneHash", "status"])
    .index("by_expiresAt", ["expiresAt"]),

  /**
   * Les SESSIONS de porte : trente minutes, non renouvelables, issues d'un défi consommé une fois.
   * Seule l'empreinte du jeton est indexée ; le jeton en clair ne vit que chez le navigateur
   * (`sessionStorage`). Une session ne vaut que tant que sa ligne de liste est active.
   */
  demoGateSessions: defineTable({
    scope: demoGateScopeValidator,
    tokenDigest: v.string(),
    allowlistId: v.id("demoGateAllowlist"),
    challengeId: v.id("demoGateChallenges"),
    createdAt: v.number(),
    expiresAt: v.number(),
  })
    .index("by_tokenDigest", ["tokenDigest"])
    .index("by_expiresAt", ["expiresAt"]),

  /**
   * Le journal des décisions du moteur (E9) : une ligne par décision de
   * console, de modération ou de page, AJOUTÉE dans la transaction de la
   * décision par `appendAudit` (`./audit.ts`), jamais modifiée. Remplace
   * `auditLog` et `archiveAuditLog` du socle (les tables `operatorAudit` et
   * `moderationAudit` du cahier en sont deux lectures).
   */
  engineAudit: defineTable({
    action: auditActionValidator,
    /** À quel titre l'acte a été posé (la qualité qui l'autorisait). */
    capacity: auditCapacityValidator,
    /** Absent : acte du système (cron, balayeur). */
    actorPersonId: v.optional(v.id("persons")),
    /** Le réseau de l'acte ; absent pour un acte de plateforme hors réseau. */
    networkId: v.optional(v.id("networks")),
    subjectTable: auditSubjectTableValidator,
    subjectId: v.string(),
    details: v.optional(auditDetailsValidator),
    at: v.number(),
  })
    .index("by_at", ["at"])
    .index("by_network_at", ["networkId", "at"])
    .index("by_subject_at", ["subjectTable", "subjectId", "at"])
    .index("by_actorPersonId", ["actorPersonId"]),
}
