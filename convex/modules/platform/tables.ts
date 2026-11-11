/**
 * Tables de la plateforme : les opérateurs de la console, le JOURNAL des
 * décisions du moteur (`engineAudit`, PA3 lot 6) et, en développement local
 * seulement, les codes à usage unique lisibles à l'écran. La console complète
 * (IDN `loa ≥ 2` obligatoire, double validation des actes irréversibles)
 * arrive au prompt PA7 ; son journal est la lecture de `engineAudit`.
 */
import { AUDIT_ACTIONS, AUDIT_CAPACITIES, AUDIT_SUBJECT_TABLES } from "@antsia/social-domain/audit"
import { defineTable } from "convex/server"
import { v } from "convex/values"

import { literals } from "../../lib/validators"

export const auditActionValidator = literals(AUDIT_ACTIONS)
export const auditCapacityValidator = literals(AUDIT_CAPACITIES)
export const auditSubjectTableValidator = literals(AUDIT_SUBJECT_TABLES)
/** Le détail d'une ligne : plat, des scalaires (bornes : `auditDetailsProblems`). */
export const auditDetailsValidator = v.record(v.string(), v.union(v.string(), v.number(), v.boolean(), v.null()))

export const platformTables = {
  operatorSessionProofs: defineTable({
    sessionId: v.string(), authUserId: v.string(), idnSubject: v.string(),
    loa: v.union(v.literal(1), v.literal(2), v.literal(3)),
    personId: v.optional(v.id("persons")), observedAt: v.number(), expiresAt: v.number(),
    accessLoggedAt: v.optional(v.number()),
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
