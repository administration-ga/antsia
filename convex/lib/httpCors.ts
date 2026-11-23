/**
 * En-têtes CORS des routes HTTP du moteur — extraits de `convex/http.ts` (CH-817) pour servir aussi
 * la porte des comptes de démonstration (`modules/platform/demoGateHttp.ts`), sans changement.
 *
 * Une origine de confiance seulement (`trustedOrigins` : `SITE_URL`, `TRUSTED_ORIGINS`, adresses
 * du catalogue, ports locaux quand les outils de développement sont ouverts) reçoit des en-têtes ;
 * une origine inconnue n'en reçoit aucun.
 */
import { DEMO_GATE_TOKEN_HEADER } from "@antsia/social-contracts/demoGate"

import { trustedOrigins } from "../betterAuth/settings"

/** En-têtes CORS pour une origine de confiance seulement ; une inconnue n'en reçoit aucun. */
export function buildCorsHeaders(requestOrigin: string | null): Record<string, string> {
  const origin = requestOrigin ?? ""
  if (!trustedOrigins().includes(origin)) return {}
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Credentials": "true",
    // Le greffon crossDomain transporte la session dans `Set-Better-Auth-Cookie` : un
    // client hors origine ne le lit pas sans cette exposition. `Retry-After` (EA-08,
    // issue #151) : le délai restant d'un refus de débit, lisible de même.
    "Access-Control-Expose-Headers": "Set-Better-Auth-Cookie, Retry-After",
  }
}

export function buildPreflightHeaders(requestOrigin: string | null): Record<string, string> {
  const cors = buildCorsHeaders(requestOrigin)
  if (!cors["Access-Control-Allow-Origin"]) return {}
  return {
    ...cors,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    // `Better-Auth-Cookie` : envoyé par le client crossDomain sur CHAQUE requête. L'en-tête du jeton
    // de session de porte (CH-817 E5) : posé par le site sur l'envoi du code et la connexion d'un
    // compte de démonstration gouverné par la porte.
    "Access-Control-Allow-Headers": `Authorization, Content-Type, Better-Auth-Cookie, ${DEMO_GATE_TOKEN_HEADER}`,
    "Access-Control-Max-Age": "86400",
  }
}

/**
 * Better Auth ne pose aucun en-tête CORS : on recopie la réponse avec ceux de la
 * liste blanche (les en-têtes d'une redirection sont immuables, d'où la copie).
 */
export function withCorsHeaders(response: Response, origin: string | null): Response {
  const cors = buildCorsHeaders(origin)
  if (!cors["Access-Control-Allow-Origin"]) return response
  const headers = new Headers(response.headers)
  for (const [name, value] of Object.entries(cors)) headers.set(name, value)
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
}
