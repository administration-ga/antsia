/**
 * Next augmente les piles V8 à 50 niveaux en développement. Le suivi React des
 * promesses les reconstruit très souvent pendant le SSR (profil CPU local).
 * Garder les 10 niveaux usuels de Node préserve les erreurs, les sources et HMR,
 * sans payer ce coût pour chaque opération asynchrone. Les piles longues restent
 * accessibles ponctuellement avec ANTSIA_DEV_EXTENDED_STACKS=1.
 */
export function register() {
  if (process.env.NODE_ENV === "development" && process.env.NEXT_RUNTIME === "nodejs") {
    Error.stackTraceLimit = process.env.ANTSIA_DEV_EXTENDED_STACKS === "1" ? 50 : 10
  }
}
