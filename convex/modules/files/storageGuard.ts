// Dupliqué de socle/convex/modules/fileGuard/storageGuard.ts @ ad2e7fdc2 — adaptations : FAIL-CLOSED (aucune ligne = retenu, jamais « antériorité servable ») ; table `fileScans` ; codes de retenue du moteur (`fileScanPending`, `fileQuarantined`) levés par `fail` ; `scanStateForFiles` (rows `documents`) retiré.
/**
 * Garde des fichiers — la GARDE DE DÉLIVRANCE, par fichier.
 *
 * Une lecture indexée par `storageId` décide si une URL peut sortir. C'est le
 * SEUL endroit du moteur qui appelle `ctx.storage.getUrl` (cliquet
 * `file-delivery-gate`, liste noire : tout autre appel est rouge).
 *
 * Absence de ligne = RETENU. Le socle servait un fichier inconnu de la garde
 * (« antériorité ») : chaque oubli d'admission devenait public. Le moteur naît
 * avec sa garde — tout fichier servi a été admis, puis analysé.
 */
import { v } from "convex/values"

import type { Doc, Id } from "../../_generated/dataModel"
import type { MutationCtx, QueryCtx } from "../../_generated/server"
import { fail } from "../../lib/errors"
import { type FileScanStatus, isServableStatus, serviceStateOf } from "./policy"

type ReadCtx = Pick<QueryCtx | MutationCtx, "db">
type UrlCtx = Pick<QueryCtx | MutationCtx, "db" | "storage">

export async function getScanForStorage(ctx: ReadCtx, storageId: Id<"_storage">): Promise<Doc<"fileScans"> | null> {
  return await ctx.db
    .query("fileScans")
    .withIndex("by_storageId", (q) => q.eq("storageId", storageId))
    .first()
}

/** `null` = aucune ligne (fichier inconnu de la garde : retenu). */
export async function getScanStatus(ctx: ReadCtx, storageId: Id<"_storage">): Promise<FileScanStatus | null> {
  const scan = await getScanForStorage(ctx, storageId)
  if (scan?.requiresFullScan && isServableStatus(scan.status) && !(scan.status === "clean" && scan.av?.verdict === "clean")) return "error"
  return scan?.status ?? null
}

export async function isServableStorage(ctx: ReadCtx, storageId: Id<"_storage">): Promise<boolean> {
  return isServableStatus(await getScanStatus(ctx, storageId))
}

export interface FileDelivery {
  url: string | null
  /** Statut d'analyse, `null` = aucune ligne (retenu). */
  scan: FileScanStatus | null
}

/**
 * L'URL d'un fichier ET son état d'analyse, en une lecture indexée et un
 * `storage.getUrl` : la forme à embarquer dans un DTO. L'écran voit POURQUOI
 * l'URL manque (« analyse en cours », « bloqué ») au lieu d'un lien mort.
 */
export async function resolveFileDelivery(ctx: UrlCtx, storageId: Id<"_storage">): Promise<FileDelivery> {
  const scan = await getScanStatus(ctx, storageId)
  if (!isServableStatus(scan)) return { url: null, scan }
  return { url: await ctx.storage.getUrl(storageId), scan }
}

/** L'URL seule — `null` si le fichier n'est pas servable, comme un fichier absent. */
export async function servableUrl(ctx: UrlCtx, storageId: Id<"_storage">): Promise<string | null> {
  return (await resolveFileDelivery(ctx, storageId)).url
}

/** Le code d'un fichier que la garde RETIENT : analyse en cours, indisponible, ou bloqué. */
export type WithheldCode = "fileScanPending" | "fileScanUnavailable" | "fileQuarantined"

/** Validateur du code de retenue, pour une réponse qui le rend en donnée. */
export const withheldCodeValidator = v.union(v.literal("fileScanPending"), v.literal("fileScanUnavailable"), v.literal("fileQuarantined"))

/** Pourquoi la garde retient ce fichier — `null` s'il est servable (sain ou sauté). */
export function withheldCodeOf(status: FileScanStatus | null | undefined): WithheldCode | null {
  // Une analyse en échec retient le fichier sans le déclarer dangereux (comportement des backends en ligne).
  if (status === "error") return "fileScanUnavailable"
  switch (serviceStateOf(status)) {
    case "servable":
      return null
    case "pending":
      return "fileScanPending"
    case "blocked":
      return "fileQuarantined"
  }
}

/**
 * Refus PARLANT pour un chemin qui doit interrompre (joindre à un envoi une
 * pièce non analysée) : le code voyage dans `error.data`, jamais un texte.
 */
export async function assertServableStorage(ctx: ReadCtx, storageId: Id<"_storage">): Promise<void> {
  const withheld = withheldCodeOf(await getScanStatus(ctx, storageId))
  if (withheld) fail(withheld)
}
