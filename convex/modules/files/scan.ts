// Dupliqué de socle/convex/modules/fileGuard/scan.ts @ ad2e7fdc2 — adaptations : références internes du module `files` du moteur ; le reste tel quel (runtime Node, `jszip`, règles pures, fournisseur, une seule écriture de vérité) ; taille STOCKÉE jugée avant le téléchargement (un fichier au-delà du plafond n'est jamais chargé en mémoire, lot 16).
"use node"
/**
 * Garde des fichiers — l'ACTION D'ANALYSE.
 *
 * Runtime Node : `jszip` (lecture des archives Office) et le fournisseur
 * antivirus vivent ici sans se soucier des primitives du runtime par défaut.
 * L'action ne DÉCIDE rien elle-même : elle lit le blob, appelle les règles
 * pures (`inspect.ts`, `verdict.ts`), le fournisseur (`avProviders.ts`), puis
 * confie le résultat à `_record`, seule écriture de vérité.
 *
 * Tout `throw` après `_markRunning` finit dans `_record({ kind: "error" })` :
 * jamais de `running` orphelin hors crash pur du runtime, que le sweeper
 * rattrape.
 */
import { v } from "convex/values"
import { internal } from "../../_generated/api"
import { internalAction } from "../../_generated/server"
import { getFileScanProvider } from "./avProviders"
import { runDeterministicInspection, type ZipEntryInfo } from "./inspect"
import { FILE_GUARD_MAX_INSPECT_BYTES } from "./policy"
import { decideVerdict } from "./verdict"

const ZIP_TEXT_ENTRY_MAX_BYTES = 8 * 1024 * 1024

/** Les entrées d'une archive, telles que `inspectZipEntries` les attend. */
async function listZipEntries(bytes: Uint8Array): Promise<ZipEntryInfo[] | null> {
  try {
    const { default: JSZip } = await import("jszip")
    const archive = await JSZip.loadAsync(bytes)
    const entries: ZipEntryInfo[] = []
    archive.forEach((path, file) => {
      if (file.dir) return
      // `_data` est interne à jszip mais porte les tailles réelles de
      // l'entrée ; absentes, les bornes de bombe ne se calculent pas.
      const data = (file as unknown as { _data?: { compressedSize?: number; uncompressedSize?: number } })._data
      const uncompressedSize = data?.uncompressedSize ?? null
      entries.push({
        path,
        compressedSize: data?.compressedSize ?? null,
        uncompressedSize,
        readText:
          uncompressedSize !== null && uncompressedSize > ZIP_TEXT_ENTRY_MAX_BYTES
            ? undefined
            : () => file.async("string"),
      })
    })
    return entries
  } catch {
    return null
  }
}

export const runScan = internalAction({
  args: { scanId: v.id("fileScans") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const facts = await ctx.runMutation(internal.modules.files.mutations._markRunning, {
      scanId: args.scanId,
    })
    if (!facts) return null

    const record = (outcome: Parameters<typeof recordOutcome>[0]) =>
      recordOutcome(outcome)
    async function recordOutcome(
      outcome:
        | {
            kind: "verdict"
            status: "clean" | "suspicious" | "infected" | "error"
            reason: string
            detectedMimeType?: string
            findings: Array<{ code: string; severity: "info" | "warning" | "critical"; detail?: string }>
            av?: {
              provider: string
              verdict: "clean" | "infected" | "error" | "skipped"
              signature?: string
              durationMs?: number
              detail?: string
            }
            sizeBytes?: number
          }
        | { kind: "error"; reason: string }
        | { kind: "skipped"; reason: string; sizeBytes?: number }
    ): Promise<void> {
      await ctx.runMutation(internal.modules.files.mutations._record, {
        scanId: args.scanId,
        outcome,
      })
    }

    try {
      // La taille STOCKÉE d'abord : `storage.get` charge le fichier ENTIER en mémoire, et
      // un fichier de plus de 512 Mio ferait tomber l'action avant tout verdict (trois
      // tentatives, puis `error` bloqué). Au-delà du plafond, rien n'est téléchargé.
      // EX-17 : l'admission refuse désormais un tel fichier ; ce saut ne vise plus que
      // les lignes d'avant, que la garde de délivrance RETIENT (`isUnanalyzedUpload`).
      if (facts.sizeBytes !== null && facts.sizeBytes > FILE_GUARD_MAX_INSPECT_BYTES) {
        await record({ kind: "skipped", reason: "too_large", sizeBytes: facts.sizeBytes })
        return null
      }
      const blob = await ctx.storage.get(facts.storageId)
      if (!blob) {
        await record({ kind: "error", reason: "BLOB_MISSING" })
        return null
      }
      const bytes = new Uint8Array(await blob.arrayBuffer())
      if (bytes.length > FILE_GUARD_MAX_INSPECT_BYTES) {
        await record({ kind: "skipped", reason: "too_large", sizeBytes: bytes.length })
        return null
      }

      const isZip = bytes.length > 3 && bytes[0] === 0x50 && bytes[1] === 0x4b
      const zipEntries = isZip ? await listZipEntries(bytes) : undefined

      const report = await runDeterministicInspection({
        bytes,
        declaredMimeType: facts.declaredMimeType,
        filename: facts.filename,
        zipEntries,
      })

      const provider = getFileScanProvider()
      const av = await provider.scan({
        bytes,
        filename: facts.filename ?? "fichier",
        mimeType: report.detectedMimeType ?? facts.declaredMimeType ?? "application/octet-stream",
      })

      const verdict = decideVerdict({ findings: report.findings, av })
      await record({
        kind: "verdict",
        status: verdict.status,
        reason: verdict.reason,
        detectedMimeType: report.detectedMimeType ?? undefined,
        findings: report.findings,
        av: {
          provider: av.provider,
          verdict: av.verdict,
          signature: av.signature,
          durationMs: av.durationMs,
          detail: av.detail,
        },
        sizeBytes: bytes.length,
      })
    } catch (err) {
      await record({
        kind: "error",
        reason: err instanceof Error ? err.message.slice(0, 200) : "SCAN_FAILED",
      })
    }
    return null
  },
})
