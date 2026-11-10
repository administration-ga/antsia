// Dupliqué de socle/convex/modules/fileGuard/policy.ts @ ad2e7fdc2 — adaptations : règles pures déplacées dans `@antsia/social-domain/filePolicy` (réexportées ici) ; restent les interrupteurs d'exploitation lus dans l'environnement ; triage IA retiré (V2).
/**
 * Garde des fichiers — interrupteurs d'exploitation (environnement du
 * déploiement), et réexport des règles pures pour les modules du backend.
 */
import { FILE_GUARD_QUARANTINE_RETENTION_DAYS_DEFAULT } from "@antsia/social-domain/filePolicy"

export {
  FILE_GUARD_MAX_ATTEMPTS,
  FILE_GUARD_MAX_INSPECT_BYTES,
  FILE_GUARD_QUARANTINE_RETENTION_DAYS_DEFAULT,
  FILE_GUARD_RUNNING_STALE_MS,
  FILE_SCAN_SOURCES,
  FILE_SCAN_STATUSES,
  type FileScanSource,
  type FileScanStatus,
  type Finding,
  type FindingSeverity,
  GENERATED_BLOB_SKIP_REASON,
  isReleasableStatus,
  isServableStatus,
  isUnanalyzedUpload,
  isWithinInspectCeiling,
  serviceStateOf,
  type ServiceState,
} from "@antsia/social-domain/filePolicy"

type Env = Record<string, string | undefined>

/**
 * `FILE_GUARD=off` SUSPEND les analyses (défaut : actif). Rien n'en devient
 * servable : les nouveaux fichiers naissent `pending` et attendent la levée.
 */
export function isKillSwitched(env: Env): boolean {
  return (env.FILE_GUARD ?? "on").trim().toLowerCase() === "off"
}

export function quarantineRetentionDays(env: Env): number {
  const raw = Number(env.FILE_GUARD_QUARANTINE_RETENTION_DAYS)
  if (!Number.isFinite(raw) || raw < 1) return FILE_GUARD_QUARANTINE_RETENTION_DAYS_DEFAULT
  return Math.floor(raw)
}
