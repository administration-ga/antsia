// Dupliqué de socle/convex/modules/fileGuard/tables.ts @ ad2e7fdc2 — adaptations : table `fileScans` du moteur ; `networkId` (réseau où le fichier entre, absent pour un fichier de profil) et `uploadedByPersonId` indexés ; `orgId`, `subjectDocumentId`, `quarantineDocumentId`, `previousFolderId` (coffre iDocument) et `triage` (IA, V2) retirés ; validateurs dérivés des constantes du domaine ; index `by_sha256` non recopié (jamais lu, D35) ; index de purge par `blobPurgedAt` (D31).
/**
 * Garde des fichiers — la table de la tranche.
 *
 * `fileScans` : UNE ligne par fichier (`by_storageId`), quel que soit le nombre
 * de lignes qui le référencent : le verdict est celui du CONTENU, pas de la
 * surface. Table DÉDIÉE, jamais de champs sur les publications ou les messages :
 * la machine d'états d'un scan leur est étrangère.
 */
import { FILE_SCAN_SOURCES, FILE_SCAN_STATUSES, FINDING_SEVERITIES } from "@antsia/social-domain/filePolicy"
import { defineTable } from "convex/server"
import { v } from "convex/values"

import { literals } from "../../lib/validators"

export const fileScanStatusValidator = literals(FILE_SCAN_STATUSES)

export const fileScanSourceValidator = literals(FILE_SCAN_SOURCES)

export const fileScanSeverityValidator = literals(FINDING_SEVERITIES)

export const fileScanFindingValidator = v.object({
  code: v.string(),
  severity: fileScanSeverityValidator,
  detail: v.optional(v.string()),
})

export const fileScanAvValidator = v.object({
  provider: v.string(),
  verdict: v.union(v.literal("clean"), v.literal("infected"), v.literal("error"), v.literal("skipped")),
  signature: v.optional(v.string()),
  durationMs: v.optional(v.number()),
  detail: v.optional(v.string()),
})

export const filesTables = {
  /** Copie PA9 déposée par le serveur et réservée avant son admission. */
  fileStagingReservations: defineTable({
    networkId: v.id("networks"), storageId: v.id("_storage"), mirrorId: v.id("mirrors"), createdAt: v.number(),
  }).index("by_storageId", ["storageId"]).index("by_mirror", ["mirrorId"]),
  fileScans: defineTable({
    storageId: v.id("_storage"),
    status: fileScanStatusValidator,
    source: fileScanSourceValidator,
    /** Médias fédérés : aucun scan sauté ou verdict AV absent ne permet la délivrance. */
    requiresFullScan: v.optional(v.boolean()),
    /** Le réseau où le fichier entre — absent pour un fichier de profil (la personne est unique). */
    networkId: v.optional(v.id("networks")),
    uploadedByPersonId: v.optional(v.id("persons")),
    filename: v.optional(v.string()),
    declaredMimeType: v.optional(v.string()),
    /** Ce que les OCTETS disent du type (magic bytes), jamais l'en-tête HTTP. */
    detectedMimeType: v.optional(v.string()),
    sizeBytes: v.optional(v.number()),
    /** Empreinte réelle (`_storage.sha256`, normalisée en hexadécimal). */
    sha256: v.optional(v.string()),
    findings: v.optional(v.array(fileScanFindingValidator)),
    av: v.optional(fileScanAvValidator),
    verdictReason: v.optional(v.string()),
    skipReason: v.optional(v.string()),
    attempts: v.number(),
    /** Libération par un modérateur ou un opérateur : qui, pourquoi — un acte tracé. */
    releasedByPersonId: v.optional(v.id("persons")),
    releasedAt: v.optional(v.number()),
    releaseReason: v.optional(v.string()),
    /** Le fichier a été purgé du stockage (infecté, après la rétention). */
    blobPurgedAt: v.optional(v.number()),
    startedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_storageId", ["storageId"])
    .index("by_status_updatedAt", ["status", "updatedAt"])
    // Purge : une ligne déjà purgée ne bloque plus la file (D31, famine du socle).
    .index("by_status_purged_updatedAt", ["status", "blobPurgedAt", "updatedAt"])
    .index("by_network_status", ["networkId", "status"])
    // Effacement et lecture « mes fichiers » (PA5).
    .index("by_uploader", ["uploadedByPersonId"])
    .index("by_releasedByPersonId", ["releasedByPersonId"]),
}
