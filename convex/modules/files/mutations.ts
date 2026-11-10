// Dupliqué de socle/convex/modules/fileGuard/mutations.ts @ ad2e7fdc2 — adaptations : table `fileScans` ; quarantaine iDocument et triage IA retirés (le statut bloquant EST la retenue ; l'avis part par la cloche sociale, `notify.ts`) ; libération par un MODÉRATEUR du réseau du fichier ou un opérateur (au lieu de `settings.manage` d'une administration), relance par un opérateur (au lieu du superadmin) ; `logAudit` (journal de l'archive iDocument) remplacé par le journal du moteur (`appendAudit` : libération, relance, purge, avec la qualité de l'acteur) ; débit sur les gestes humains ; coupe-circuit respecté par l'analyse et le balayeur (fail-closed) ; purge indexée sur `blobPurgedAt` (D31 : une ligne purgée ne bloque plus la file) ; `_ageScanForTests` non recopiée (les tests vieillissent la ligne eux-mêmes) ; refus à code du moteur. ; `_markRunning` rend la taille STOCKÉE (`sizeBytes`, table `_storage`) pour que l'analyse écarte un fichier trop gros AVANT de le télécharger (lot 16) ; lots pleins poursuivis par chaîne pour la relance et la purge (lot 17).
/**
 * Garde des fichiers — MUTATIONS.
 *
 * Machine d'états d'une analyse :
 *
 *   pending ─▶ running ─▶ clean | suspicious | infected | skipped
 *                  └─▶ error ─(attempts < max)─▶ pending (nouvelle tentative)
 *   suspicious | error ─(libération par un modérateur)─▶ clean
 *   infected            ─(relance par un opérateur)───▶ pending
 *
 * `_markRunning` et `_record` sont les DEUX seules écritures de l'action
 * d'analyse ; tout échec après `_markRunning` finit dans `_record`. Le balayeur
 * `retryStale` rattrape le crash pur du runtime.
 */
import { type AuditCapacity, assertDecisionReason } from "@antsia/social-domain/audit"
import { v } from "convex/values"

import { internal } from "../../_generated/api"
import type { Doc, Id } from "../../_generated/dataModel"
import { internalMutation, type MutationCtx } from "../../_generated/server"
import { getMembership } from "../../lib/access"
import { checked, fail, notFound } from "../../lib/errors"
import { operatorMutation, personMutation } from "../../lib/functions"
import { enforceRateLimit } from "../../lib/rateLimit"
import { appendAudit, networkRoleCapacity, operatorCapacity } from "../platform/audit"
import { deliverVerdictNotice } from "./notify"
import {
  FILE_GUARD_MAX_ATTEMPTS,
  FILE_GUARD_RUNNING_STALE_MS,
  isKillSwitched,
  isReleasableStatus,
  quarantineRetentionDays,
} from "./policy"
import { fileScanAvValidator, fileScanFindingValidator, fileScanStatusValidator } from "./tables"

const RETRY_BACKOFF_MS = 30_000
const SWEEP_TAKE = 50
const PURGE_TAKE = 50
const MIN_RELEASE_REASON_CHARS = 3

/** Ce que l'action d'analyse a besoin de savoir pour travailler. */
export const scanFactsValidator = v.object({
  scanId: v.id("fileScans"),
  storageId: v.id("_storage"),
  filename: v.union(v.string(), v.null()),
  declaredMimeType: v.union(v.string(), v.null()),
  attempts: v.number(),
  /** La taille STOCKÉE (table `_storage`), lue avant tout téléchargement ; `null` : inconnue. */
  sizeBytes: v.union(v.number(), v.null()),
})

/**
 * Passe la ligne en `running`. Rend `null` si l'analyse est terminale, ou
 * suspendue par le coupe-circuit — l'action s'arrête alors sans écrire.
 */
export const _markRunning = internalMutation({
  args: { scanId: v.id("fileScans") },
  returns: v.union(scanFactsValidator, v.null()),
  handler: async (ctx, args) => {
    if (isKillSwitched(process.env)) return null
    const scan = await ctx.db.get(args.scanId)
    if (!scan) return null
    if (scan.status !== "pending" && scan.status !== "running") return null
    const now = Date.now()
    const attempts = scan.attempts + 1
    await ctx.db.patch(scan._id, { status: "running", attempts, startedAt: now, updatedAt: now })
    const stored = await ctx.db.system.get(scan.storageId)
    return {
      scanId: scan._id,
      storageId: scan.storageId,
      filename: scan.filename ?? null,
      declaredMimeType: scan.declaredMimeType ?? null,
      attempts,
      sizeBytes: stored?.size ?? null,
    }
  },
})

export const scanOutcomeValidator = v.union(
  v.object({
    kind: v.literal("verdict"),
    status: v.union(v.literal("clean"), v.literal("suspicious"), v.literal("infected"), v.literal("error")),
    reason: v.string(),
    detectedMimeType: v.optional(v.string()),
    findings: v.array(fileScanFindingValidator),
    av: v.optional(fileScanAvValidator),
    sizeBytes: v.optional(v.number()),
  }),
  v.object({ kind: v.literal("error"), reason: v.string() }),
  v.object({ kind: v.literal("skipped"), reason: v.string(), sizeBytes: v.optional(v.number()) }),
)

async function settleError(ctx: MutationCtx, scan: Doc<"fileScans">, reason: string): Promise<void> {
  const now = Date.now()
  if (scan.attempts < FILE_GUARD_MAX_ATTEMPTS) {
    await ctx.db.patch(scan._id, { status: "pending", verdictReason: reason, updatedAt: now })
    await ctx.scheduler.runAfter(RETRY_BACKOFF_MS * scan.attempts, internal.modules.files.scan.runScan, { scanId: scan._id })
    return
  }
  await ctx.db.patch(scan._id, { status: "error", verdictReason: reason, completedAt: now, updatedAt: now })
  const settled = await ctx.db.get(scan._id)
  if (settled) await deliverVerdictNotice(ctx, settled)
}

/** Écrit le résultat de l'analyse. Un verdict bloquant EST la retenue : il est signalé, rien n'est déplacé. */
export const _record = internalMutation({
  args: { scanId: v.id("fileScans"), outcome: scanOutcomeValidator },
  returns: v.null(),
  handler: async (ctx, args) => {
    const scan = await ctx.db.get(args.scanId)
    if (!scan) return null
    // Une analyse libérée ou replanifiée pendant le travail garde sa décision.
    if (scan.status !== "running") return null
    const now = Date.now()
    const { outcome } = args

    if (scan.requiresFullScan && (outcome.kind === "skipped" || (outcome.kind === "verdict" && outcome.status === "clean" && outcome.av?.verdict !== "clean"))) {
      await settleError(ctx, scan, "FEDERATED_FULL_SCAN_REQUIRED")
      return null
    }

    if (outcome.kind === "skipped") {
      await ctx.db.patch(scan._id, {
        status: "skipped",
        skipReason: outcome.reason,
        ...(outcome.sizeBytes !== undefined ? { sizeBytes: outcome.sizeBytes } : {}),
        completedAt: now,
        updatedAt: now,
      })
      return null
    }

    if (outcome.kind === "error" || outcome.status === "error") {
      await settleError(ctx, scan, outcome.reason)
      return null
    }

    await ctx.db.patch(scan._id, {
      status: outcome.status,
      verdictReason: outcome.reason,
      ...(outcome.detectedMimeType !== undefined ? { detectedMimeType: outcome.detectedMimeType } : {}),
      findings: outcome.findings,
      ...(outcome.av ? { av: outcome.av } : {}),
      ...(outcome.sizeBytes !== undefined ? { sizeBytes: outcome.sizeBytes } : {}),
      completedAt: now,
      updatedAt: now,
    })
    if (outcome.status !== "clean") {
      const settled = await ctx.db.get(scan._id)
      if (settled) await deliverVerdictNotice(ctx, settled)
    }
    return null
  },
})

/**
 * La qualité qui autorise une personne à trancher sur ce fichier : opérateur de
 * plateforme, ou modérateur (administrateur) du réseau du fichier ; `null` sinon.
 */
async function moderationCapacityFor(ctx: MutationCtx, scan: Doc<"fileScans">, personId: Doc<"persons">["_id"]): Promise<AuditCapacity | null> {
  const operator = await ctx.db
    .query("operators")
    .withIndex("by_person", (q) => q.eq("personId", personId))
    .unique()
  if (operator && operator.revokedAt === undefined) return operatorCapacity(operator)
  if (!scan.networkId) return null
  const membership = await getMembership(ctx, scan.networkId, personId)
  if (!membership || (membership.status !== "declaree" && membership.status !== "verifiee")) return null
  return networkRoleCapacity(membership.role)
}

/**
 * Libération HUMAINE d'un fichier `suspicious` ou `error`, avec motif. Jamais un
 * `infected` : il ne redevient servable que par une nouvelle analyse saine.
 * Autorité : un modérateur du réseau du fichier, ou un opérateur ; un fichier
 * sans réseau (profil) ne se libère que par un opérateur. Refus indistinct.
 */
export const releaseScan = personMutation({
  args: { scanId: v.id("fileScans"), reason: v.string() },
  returns: v.object({ status: fileScanStatusValidator }),
  handler: async (ctx, args) => {
    const scan = await ctx.db.get(args.scanId)
    const capacity = scan ? await moderationCapacityFor(ctx, scan, ctx.person._id) : null
    if (!scan || !capacity) return notFound()
    await enforceRateLimit(ctx, "file.moderate", ctx.person._id)
    const reason = checked(() => assertDecisionReason(args.reason, MIN_RELEASE_REASON_CHARS))
    if (!isReleasableStatus(scan.status)) return fail("conflict")
    const now = Date.now()
    await ctx.db.patch(scan._id, {
      status: "clean",
      releasedByPersonId: ctx.person._id,
      releasedAt: now,
      releaseReason: reason,
      verdictReason: `${scan.verdictReason ?? scan.status} → RELEASED`,
      updatedAt: now,
    })
    await appendAudit(ctx, {
      action: "file.release",
      capacity,
      actorPersonId: ctx.person._id,
      ...(scan.networkId ? { networkId: scan.networkId } : {}),
      subject: { table: "fileScans", id: scan._id },
      details: { reason, from: scan.status },
      at: now,
    })
    return { status: "clean" as const }
  },
})

async function requeueForAnalysis(ctx: MutationCtx, scan: Doc<"fileScans">, now: number): Promise<void> {
  await ctx.db.patch(scan._id, {
    status: "pending",
    attempts: 0,
    findings: undefined,
    av: undefined,
    verdictReason: undefined,
    skipReason: undefined,
    completedAt: undefined,
    updatedAt: now,
  })
  if (!isKillSwitched(process.env)) await ctx.scheduler.runAfter(0, internal.modules.files.scan.runScan, { scanId: scan._id })
}

/** Relance une analyse depuis zéro (opérateur) — seule issue d'un `infected`. */
export const requeueScan = operatorMutation({
  args: { scanId: v.id("fileScans") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await enforceRateLimit(ctx, "file.moderate", ctx.person._id)
    const scan = await ctx.db.get(args.scanId)
    if (!scan) return notFound()
    if (scan.blobPurgedAt !== undefined) return fail("conflict")
    const now = Date.now()
    await requeueForAnalysis(ctx, scan, now)
    await appendAudit(ctx, {
      action: "file.requeue",
      capacity: operatorCapacity(ctx.operator),
      actorPersonId: ctx.person._id,
      ...(scan.networkId ? { networkId: scan.networkId } : {}),
      subject: { table: "fileScans", id: scan._id },
      details: { from: scan.status },
      at: now,
    })
    return null
  },
})

/** Réparation administrative bornée : vraie analyse après raccordement du fournisseur, sans identité humaine. */
export const requeueUnconfiguredScans = internalMutation({
  args: {
    scanIds: v.array(v.id("fileScans")),
    confirm: v.literal("ANTSIA_REQUEUE_PROVIDER_UNCONFIGURED"),
  },
  returns: v.object({ requeued: v.number(), scanIds: v.array(v.id("fileScans")) }),
  handler: async (ctx, args): Promise<{ requeued: number; scanIds: Id<"fileScans">[] }> => {
    if (args.scanIds.length < 1 || args.scanIds.length > 2 || new Set(args.scanIds).size !== args.scanIds.length) return fail("invalidArgument", { field: "scanIds" })
    if (isKillSwitched(process.env)
      || process.env.FILE_SCAN_PROVIDER?.trim().toLowerCase() !== "clamav-rest"
      || !process.env.FILE_SCAN_CLAMAV_URL?.trim()
      || !process.env.FILE_SCAN_CLAMAV_TOKEN?.trim()) return fail("conflict")

    // Tout le lot est validé AVANT la moindre écriture ou planification.
    const scans: Doc<"fileScans">[] = []
    for (const scanId of args.scanIds) {
      const scan = await ctx.db.get(scanId)
      if (!scan) return notFound()
      if (scan.status !== "error" || scan.verdictReason !== "AV_ERROR:provider_unconfigured" || scan.blobPurgedAt !== undefined) return fail("conflict")
      scans.push(scan)
    }
    const now = Date.now()
    for (const scan of scans) {
      await requeueForAnalysis(ctx, scan, now)
      await appendAudit(ctx, {
        action: "file.requeue",
        capacity: "system",
        ...(scan.networkId ? { networkId: scan.networkId } : {}),
        subject: { table: "fileScans", id: scan._id },
        details: { reason: "provider_configuration_restored", from: "error", previousReason: "AV_ERROR:provider_unconfigured" },
        at: now,
      })
    }
    return { requeued: scans.length, scanIds: scans.map((scan) => scan._id) }
  },
})

/**
 * Balayeur (cron) : un `pending`/`running` plus vieux que
 * `FILE_GUARD_RUNNING_STALE_MS` est un job perdu — replanifié tant que le
 * plafond de tentatives tient, figé en `error` sinon. Coupe-circuit : rien.
 */
export const retryStale = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    if (isKillSwitched(process.env)) return 0
    const threshold = Date.now() - FILE_GUARD_RUNNING_STALE_MS
    let touched = 0
    let saturated = false
    for (const status of ["pending", "running"] as const) {
      const stale = await ctx.db
        .query("fileScans")
        .withIndex("by_status_updatedAt", (q) => q.eq("status", status).lt("updatedAt", threshold))
        .take(SWEEP_TAKE)
      if (stale.length === SWEEP_TAKE) saturated = true
      for (const scan of stale) {
        touched += 1
        const now = Date.now()
        if (scan.attempts >= FILE_GUARD_MAX_ATTEMPTS) {
          await ctx.db.patch(scan._id, { status: "error", verdictReason: "STALE_JOB", completedAt: now, updatedAt: now })
          const settled = await ctx.db.get(scan._id)
          if (settled) await deliverVerdictNotice(ctx, settled)
          continue
        }
        await ctx.db.patch(scan._id, { status: "pending", updatedAt: now })
        await ctx.scheduler.runAfter(0, internal.modules.files.scan.runScan, { scanId: scan._id })
      }
    }
    // Chaque ligne a changé d'état ou d'updatedAt, donc sort de la file périmée.
    if (saturated) await ctx.scheduler.runAfter(0, internal.modules.files.mutations.retryStale, {})
    return touched
  },
})

/**
 * Purge (cron) : le fichier d'une analyse `infected` plus vieille que la
 * rétention est retiré du stockage ; la ligne reste (la trace survit au
 * contenu). Index sur `blobPurgedAt` : une ligne déjà purgée sort de la file
 * (D31 — au socle, cinquante lignes purgées bouchaient la purge pour toujours).
 */
export const purgeQuarantinedBlobs = internalMutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const threshold = Date.now() - quarantineRetentionDays(process.env) * 24 * 60 * 60_000
    const candidates = await ctx.db
      .query("fileScans")
      .withIndex("by_status_purged_updatedAt", (q) => q.eq("status", "infected").eq("blobPurgedAt", undefined).lt("updatedAt", threshold))
      .take(PURGE_TAKE)
    for (const scan of candidates) {
      try {
        await ctx.storage.delete(scan.storageId)
      } catch {
        // Fichier déjà absent : la purge est acquise.
      }
      const now = Date.now()
      await ctx.db.patch(scan._id, { blobPurgedAt: now })
      // Acte du SYSTÈME : la trace dit qu'un contenu retenu a quitté le stockage, et quand.
      await appendAudit(ctx, {
        action: "file.purge_blob",
        capacity: "system",
        ...(scan.networkId ? { networkId: scan.networkId } : {}),
        subject: { table: "fileScans", id: scan._id },
        at: now,
      })
    }
    // blobPurgedAt fait sortir les lignes traitées de cet index ; aucun ancien
    // verdict ne peut retenir la tête de la file jusqu'au cron du lendemain.
    if (candidates.length === PURGE_TAKE) await ctx.scheduler.runAfter(0, internal.modules.files.mutations.purgeQuarantinedBlobs, {})
    return candidates.length
  },
})
