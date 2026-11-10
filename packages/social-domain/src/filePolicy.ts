// Dupliqué de socle/convex/modules/fileGuard/policy.ts @ ad2e7fdc2 — adaptations : FAIL-CLOSED (aucune ligne d'analyse = fichier RETENU, jamais « antériorité servable », owner map §1.4 et D06) ; sources sociales du moteur au lieu des surfaces administratives ; libellés et phrases d'écran retirés (l'écran traduit le statut) ; interrupteurs d'environnement déplacés côté backend (`convex/modules/files/policy.ts`) ; triage IA retiré (option V2) ; EX-17 (décision du 9/11/2026) : aucun dépôt de membre au-delà du plafond d'analyse, et un `skipped` ne sert que s'il est produit par la plateforme (`isUnanalyzedUpload`).
/**
 * Garde des fichiers — règles PURES, partagées par le serveur et les écrans.
 *
 * Aucun import d'exécution : les écrans lisent ces règles pour dire pourquoi
 * un fichier manque (« analyse en cours », « bloqué »). Les décisions qui
 * lisent la base vivent dans `convex/modules/files/storageGuard.ts` ; celles
 * qui appellent un antivirus dans `convex/modules/files/avProviders.ts`.
 *
 * DOCTRINE DE SERVABILITÉ (fail-closed) :
 *   - pas de ligne d'analyse        → RETENU, comme `pending` : un fichier que
 *                                      la garde ne connaît pas n'a été vu par
 *                                      personne (le socle le servait, ce qui
 *                                      rendait chaque oubli d'admission public) ;
 *   - `pending` / `running`         → URL `null`, « analyse en cours » ;
 *   - `clean`                        → servable ;
 *   - `skipped`                      → servable SEULEMENT s'il est produit par
 *                                      la plateforme (`server_generated`) ; un
 *                                      dépôt sauté sans analyse (trop lourd,
 *                                      ligne d'avant EX-17) est retenu comme
 *                                      `error` (`isUnanalyzedUpload`) ;
 *   - `suspicious` / `infected`     → URL `null`, bloqué ;
 *   - `error`                        → URL `null`, libérable par un modérateur
 *                                      du réseau ou relancé.
 *
 * Le coupe-circuit `FILE_GUARD=off` n'ouvre rien : il suspend les analyses, et
 * les nouveaux fichiers restent `pending` (retenus) jusqu'à sa levée.
 */

export const FILE_SCAN_STATUSES = ["pending", "running", "clean", "suspicious", "infected", "error", "skipped"] as const

export type FileScanStatus = (typeof FILE_SCAN_STATUSES)[number]

/**
 * D'où le fichier est entré — une surface sociale du moteur, ou `generated`
 * (produit par la plateforme elle-même, jamais déposé par un client : un
 * enregistrement de direct rapatrié par le serveur, par exemple).
 */
export const FILE_SCAN_SOURCES = [
  "post_media",
  "profile",
  "story",
  "message",
  "group",
  "thematic_group",
  "event",
  "page",
  /** Pièces d'une revendication de page (EXF-AN-17), lues par la modération seule. */
  "page_claim",
  "album",
  "editorial",
  "voice",
  "live",
  /** P15 : pièces personnelles d'une candidature, sans réseau ni nom de fichier dans la garde. */
  "job_application",
  "generated",
] as const

export type FileScanSource = (typeof FILE_SCAN_SOURCES)[number]

/**
 * Motif d'un fichier généré, né `skipped` : ses octets sortent de la
 * plateforme, l'analyse n'est pas requise. Servable, mais TRACÉ.
 */
export const GENERATED_BLOB_SKIP_REASON = "server_generated"

export const FINDING_SEVERITIES = ["info", "warning", "critical"] as const

export type FindingSeverity = (typeof FINDING_SEVERITIES)[number]

/** Un signal levé par l'inspection déterministe ou par l'antivirus. */
export interface Finding {
  code: string
  severity: FindingSeverity
  detail?: string
}

/**
 * Le PLAFOND D'ANALYSE : au-delà, l'inspection et l'antivirus ne lisent pas le
 * fichier (`skipped:too_large`). Décision du propriétaire du 9/11/2026 (EX-17) :
 * aucun dépôt de membre ne le dépasse — l'admission le refuse
 * (`UPLOAD_SIZE_OUT_OF_RANGE`), et chaque usage de dépôt d'un membre est borné
 * en deçà (`uploadPolicy.ts`). Seuls les fichiers PRODUITS par la plateforme
 * (enregistrements de direct) vont au-delà, inscrits `skipped:server_generated`.
 */
export const FILE_GUARD_MAX_INSPECT_BYTES = 60 * 1024 * 1024

/** Une ligne `pending`/`running` plus vieille que ça est un job perdu. */
export const FILE_GUARD_RUNNING_STALE_MS = 5 * 60_000

/** Tentatives d'analyse avant de figer une ligne en `error`. */
export const FILE_GUARD_MAX_ATTEMPTS = 3

/** Rétention d'un fichier infecté avant purge, en jours. */
export const FILE_GUARD_QUARANTINE_RETENTION_DAYS_DEFAULT = 90

export type ServiceState = "servable" | "pending" | "blocked"

/** L'état de service d'un fichier d'après son statut (`null` = aucune ligne : retenu). */
export function serviceStateOf(status: FileScanStatus | null | undefined): ServiceState {
  switch (status) {
    case "clean":
    case "skipped":
      return "servable"
    case null:
    case undefined:
    case "pending":
    case "running":
      return "pending"
    case "suspicious":
    case "infected":
    case "error":
      return "blocked"
  }
}

export function isServableStatus(status: FileScanStatus | null | undefined): boolean {
  return serviceStateOf(status) === "servable"
}

/**
 * Un dépôt que l'analyse a SAUTÉ sans être produit par la plateforme : personne
 * n'en a lu un octet. Jamais servable (EX-17) — la garde de délivrance le
 * retient comme une analyse en échec (`error`). Un fichier produit par la
 * plateforme (`server_generated`) n'en est pas un : servable, et tracé.
 */
export function isUnanalyzedUpload(scan: { status: FileScanStatus; skipReason?: string | null }): boolean {
  return scan.status === "skipped" && scan.skipReason !== GENERATED_BLOB_SKIP_REASON
}

/** L'analyse de ce poids est-elle possible ? Au-delà du plafond, aucun dépôt n'est admis ni relancé. */
export function isWithinInspectCeiling(sizeBytes: number): boolean {
  return sizeBytes <= FILE_GUARD_MAX_INSPECT_BYTES
}

/** Un modérateur peut libérer ces statuts ; `infected` jamais. */
export function isReleasableStatus(status: FileScanStatus): boolean {
  return status === "suspicious" || status === "error"
}
