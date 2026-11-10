// Dupliqué de socle/convex/modules/direct/retention.ts @ ad2e7fdc2 — adaptations : module pur gardé dans le module du backend, comme au socle ; DL-02 : la durée (90 jours) vient du domaine (`DIRECT_REPLAY_RETENTION_DAYS`, que l'écran annonce à qui accepte l'enregistrement), même valeur.
/**
 * Politique de conservation des copies durables d'un DIRECT.
 *
 * La fenêtre commence quand l'Egress a effectivement livré le fichier : avant
 * cet instant, il n'existe aucun blob à conserver. Le délai est unique pour la
 * vidéo et ses éventuels sous-titres afin qu'aucun dérivé ne survive à la
 * copie principale.
 */
import { DIRECT_REPLAY_RETENTION_DAYS } from "@antsia/social-domain/live/domain"

/** Aligné sur la politique existante des enregistrements iAppel : 90 jours. */
export const DIRECT_REPLAY_RETENTION_MS = DIRECT_REPLAY_RETENTION_DAYS * 24 * 60 * 60 * 1000

/** Une transaction de purge ne lit et ne traite jamais plus de 50 lignes. */
export const DIRECT_REPLAY_PURGE_BATCH = 50

/**
 * Le harnais et certains runtimes bornent un timer à 2^31-1 ms. Les échéances
 * de 90 jours avancent donc par pas de 20 jours ; le cron horaire reste le
 * second filet.
 */
export const DIRECT_REPLAY_SCHEDULER_HOP_MS = 20 * 24 * 60 * 60 * 1000

export function directReplayRetentionUntil(readyAt: number): number {
  return readyAt + DIRECT_REPLAY_RETENTION_MS
}

export function nextDirectReplayRetentionCheck(
  now: number,
  retentionUntil: number,
): number {
  return Math.min(retentionUntil, now + DIRECT_REPLAY_SCHEDULER_HOP_MS)
}

/**
 * Fail-closed : un ancien replay `ready` sans échéance matérialisée n'est pas
 * servable. Le cron lui affectera une échéance explicite avant de le rouvrir.
 */
export function isDirectReplayRetained(input: {
  replayStatus?: string
  replayStorageId?: unknown
  replayRetentionUntil?: number
}): boolean {
  return (
    input.replayStatus === "ready" &&
    input.replayStorageId !== undefined &&
    input.replayRetentionUntil !== undefined
  )
}
