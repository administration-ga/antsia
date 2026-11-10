// Dupliqué de socle/convex/modules/fileGuard/queries.ts @ ad2e7fdc2 — adaptations : adhésion au réseau au lieu de `hasOrgAccess` (`statusByStorageIds` borné au réseau, l'ÉTAT seul) ; rapport lisible par le déposant, un modérateur du réseau du fichier ou un opérateur, refus INDISTINCT sinon ; console réservée aux opérateurs (`listForConsole`, `stats`) ; `getScanByStorageId` et `_reportForTriage` (triage IA, V2) non recopiées ; noms d'organisation retirés ; EX-17 : l'état rendu est celui que la garde APPLIQUE (`getScanStatus` : un dépôt sauté sans analyse se lit `error`), et le rapport porte le motif d'un saut (`skipReason`) pour la console.
/**
 * Garde des fichiers — QUERIES.
 *
 * Un membre voit l'ÉTAT d'un fichier (« analyse en cours », « bloqué »), jamais
 * le rapport détaillé : celui-ci n'est lisible que par le déposant, un
 * modérateur du réseau du fichier ou un opérateur (`getScan`), et sert la
 * console du moteur (`listForConsole`, `stats`).
 */
import { paginationOptsValidator } from "convex/server"
import { v } from "convex/values"

import type { Doc } from "../../_generated/dataModel"
import type { QueryCtx } from "../../_generated/server"
import { getMembership } from "../../lib/access"
import { fail, notFound } from "../../lib/errors"
import { networkQuery, operatorQuery, personQuery } from "../../lib/functions"
import { FILE_SCAN_STATUSES, type FileScanStatus } from "./policy"
import { getScanStatus } from "./storageGuard"
import { fileScanAvValidator, fileScanFindingValidator, fileScanSourceValidator, fileScanStatusValidator } from "./tables"

const STATUS_BATCH_MAX = 100
const STATS_SAMPLE_CAP = 1000

/**
 * L'état d'analyse de fichiers que l'appelant voit dans ce réseau — l'état
 * SEUL, qui ne révèle rien du contenu. Borné à 100 identifiants.
 */
export const statusByStorageIds = networkQuery({
  args: { storageIds: v.array(v.id("_storage")) },
  returns: v.array(v.object({ storageId: v.id("_storage"), status: v.union(fileScanStatusValidator, v.null()) })),
  handler: async (ctx, args) => {
    if (args.storageIds.length > STATUS_BATCH_MAX) return fail("invalidArgument", { field: "storageIds" })
    const out: { storageId: (typeof args.storageIds)[number]; status: FileScanStatus | null }[] = []
    for (const storageId of args.storageIds) {
      // L'état APPLIQUÉ par la garde de délivrance, jamais un « sauté » qui ne serait pas servi.
      out.push({ storageId, status: await getScanStatus(ctx, storageId) })
    }
    return out
  },
})

/** Le déposant, un modérateur du réseau du fichier, ou un opérateur. */
async function canReadReport(ctx: QueryCtx, scan: Doc<"fileScans">, personId: Doc<"persons">["_id"]): Promise<boolean> {
  if (scan.uploadedByPersonId === personId) return true
  const operator = await ctx.db
    .query("operators")
    .withIndex("by_person", (q) => q.eq("personId", personId))
    .unique()
  if (operator && operator.revokedAt === undefined) return true
  if (!scan.networkId) return false
  const membership = await getMembership(ctx, scan.networkId, personId)
  return membership !== null && (membership.status === "declaree" || membership.status === "verifiee") && (membership.role === "network_moderator" || membership.role === "network_admin")
}

const scanReportValidator = v.object({
  _id: v.id("fileScans"),
  status: fileScanStatusValidator,
  source: fileScanSourceValidator,
  networkId: v.optional(v.id("networks")),
  filename: v.optional(v.string()),
  declaredMimeType: v.optional(v.string()),
  detectedMimeType: v.optional(v.string()),
  sizeBytes: v.optional(v.number()),
  findings: v.array(fileScanFindingValidator),
  av: v.optional(fileScanAvValidator),
  verdictReason: v.optional(v.string()),
  /** Pourquoi l'analyse a sauté le fichier : `server_generated` (servi, tracé) ou `too_large` (retenu, EX-17). */
  skipReason: v.optional(v.string()),
  attempts: v.number(),
  releasedAt: v.optional(v.number()),
  createdAt: v.number(),
  updatedAt: v.number(),
})

function toReport(scan: Doc<"fileScans">) {
  return {
    _id: scan._id,
    status: scan.status,
    source: scan.source,
    ...(scan.networkId ? { networkId: scan.networkId } : {}),
    ...(scan.filename !== undefined ? { filename: scan.filename } : {}),
    ...(scan.declaredMimeType !== undefined ? { declaredMimeType: scan.declaredMimeType } : {}),
    ...(scan.detectedMimeType !== undefined ? { detectedMimeType: scan.detectedMimeType } : {}),
    ...(scan.sizeBytes !== undefined ? { sizeBytes: scan.sizeBytes } : {}),
    findings: scan.findings ?? [],
    ...(scan.av ? { av: scan.av } : {}),
    ...(scan.verdictReason !== undefined ? { verdictReason: scan.verdictReason } : {}),
    ...(scan.skipReason !== undefined ? { skipReason: scan.skipReason } : {}),
    attempts: scan.attempts,
    ...(scan.releasedAt !== undefined ? { releasedAt: scan.releasedAt } : {}),
    createdAt: scan.createdAt,
    updatedAt: scan.updatedAt,
  }
}

/**
 * Le rapport d'une analyse — déposant, modérateur du réseau ou opérateur.
 * Pour tout autre, la même réponse qu'une analyse inexistante.
 */
export const getScan = personQuery({
  args: { scanId: v.id("fileScans") },
  returns: scanReportValidator,
  handler: async (ctx, args) => {
    const scan = await ctx.db.get(args.scanId)
    if (!scan || !(await canReadReport(ctx, scan, ctx.person._id))) return notFound()
    return toReport(scan)
  },
})

/** Console : les analyses, par statut, les plus récentes d'abord. */
export const listForConsole = operatorQuery({
  args: { status: fileScanStatusValidator, paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("fileScans")
      .withIndex("by_status_updatedAt", (q) => q.eq("status", args.status))
      .order("desc")
      .paginate(args.paginationOpts)
    return { ...page, page: page.page.map(toReport) }
  },
})

/**
 * Console : compteurs par statut — BORNÉS et déclarés échantillon : au-delà de
 * `STATS_SAMPLE_CAP` lignes d'un statut, le chiffre est un plancher.
 */
export const stats = operatorQuery({
  args: {},
  returns: v.object({
    byStatus: v.array(v.object({ status: fileScanStatusValidator, count: v.number(), sampled: v.boolean() })),
    sampleCap: v.number(),
  }),
  handler: async (ctx) => {
    const byStatus: { status: FileScanStatus; count: number; sampled: boolean }[] = []
    for (const status of FILE_SCAN_STATUSES) {
      const rows = await ctx.db
        .query("fileScans")
        .withIndex("by_status_updatedAt", (q) => q.eq("status", status))
        .take(STATS_SAMPLE_CAP + 1)
      byStatus.push({ status, count: Math.min(rows.length, STATS_SAMPLE_CAP), sampled: rows.length > STATS_SAMPLE_CAP })
    }
    return { byStatus, sampleCap: STATS_SAMPLE_CAP }
  },
})
