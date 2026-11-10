/**
 * Réponses simulées partagées par les tests de la publication (EX-01). Valeurs
 * manifestement fictives : aucun identifiant réel (cliquet no-deployment-identifiers).
 */

/** La CSP de production telle que `packages/api/csp.mjs` la construit, pour un moteur nommé. */
export function productionCsp(engine) {
  const http = `https://${engine}.convex.cloud https://${engine}.convex.site`
  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${http}`,
    `connect-src 'self' https://${engine}.convex.cloud wss://${engine}.convex.cloud https://${engine}.convex.site`,
    `media-src 'self' blob: ${http}`,
  ].join("; ")
}
