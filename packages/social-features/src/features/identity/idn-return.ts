/**
 * Le retour d'un échec d'IDN à une porte (issue 122, EA-02). Le moteur ramène la personne à la porte
 * d'où elle est partie avec `?error=<code>` (liste fermée, `convex/betterAuth/idnRefusalReturn.ts`) ;
 * après la lecture de l'état, Better Auth y ajoute parfois sa propre `error_description`.
 *
 * Ce module PUR lit le code en un refus FERMÉ, traduit par `identity:idnReturn.<refus>` : la valeur
 * reçue, comme toute description, n'est jamais affichée. Sans dépendance cliente : une page serveur
 * l'appelle avant le rendu.
 */
export const IDN_RETURN_REFUSALS = ["refused", "unavailable", "accountExists", "failed"] as const
export type IdnReturnRefusal = (typeof IDN_RETURN_REFUSALS)[number]

/** Refus ou abandon chez IDN (codes OAuth 2.0 et OpenID Connect d'une autorisation non donnée). */
const REFUSED = new Set(["access_denied", "login_required", "consent_required", "interaction_required", "account_selection_required"])
/** IDN ou le moteur momentanément indisponibles (code OAuth, code du moteur). */
const UNAVAILABLE = new Set(["temporarily_unavailable", "idnUnavailable"])
/** Une adresse qui a déjà son compte par code : le moteur ne relie jamais d'office (ADR-0008). */
const ACCOUNT_EXISTS = new Set(["account_not_linked"])

/** Le refus à dire à la porte, ou `null` sans retour d'échec. Tout autre code devient l'échec générique. */
export function idnReturnRefusal(raw: unknown): IdnReturnRefusal | null {
  if (raw === undefined || raw === null || raw === "") return null
  if (typeof raw !== "string") return "failed"
  if (REFUSED.has(raw)) return "refused"
  if (UNAVAILABLE.has(raw)) return "unavailable"
  if (ACCOUNT_EXISTS.has(raw)) return "accountExists"
  return "failed"
}

/** La phrase du refus, dans l'espace de noms `identity`. */
export function idnReturnMessageKey(refusal: IdnReturnRefusal): `idnReturn.${IdnReturnRefusal}` {
  return `idnReturn.${refusal}`
}

/** Les paramètres d'un retour d'échec, retirés de l'adresse affichée une fois lus. */
const RETURN_PARAMS = ["error", "error_description", "error_uri"] as const

/**
 * L'adresse affichée sans les paramètres du retour d'échec (chemin, requête restante, fragment),
 * ou `null` s'il n'y a rien à retirer : un rechargement ou un lien copié ne redit pas l'échec.
 */
export function withoutIdnReturnParams(href: string): string | null {
  const url = new URL(href)
  if (!RETURN_PARAMS.some((name) => url.searchParams.has(name))) return null
  for (const name of RETURN_PARAMS) url.searchParams.delete(name)
  return `${url.pathname}${url.search}${url.hash}`
}
