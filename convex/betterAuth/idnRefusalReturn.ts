/**
 * Retour d'un refus ou d'un abandon chez IDN vers la porte de départ (issue #122, EA-02).
 *
 * Le rappel OAuth générique de Better Auth renvoie toute réponse d'erreur (`error`, ou aucun
 * `code`) vers sa page par défaut AVANT de lire l'état : l'adresse d'erreur que l'application
 * de départ a donnée est ignorée. Ce greffon passe avant lui, sur le seul rappel IDN, et ne
 * fait qu'une chose : relire côté serveur l'état que le moteur a lui-même enregistré au départ,
 * le consommer, puis renvoyer vers l'adresse d'erreur de cet état si son origine EXACTE figure
 * parmi les origines de confiance, avec le seul paramètre `error`, pris dans une liste fermée.
 *
 * La cible ne vient jamais de la requête de rappel (ni paramètre, ni en-tête). Dans tous les
 * autres cas (état absent, illisible, introuvable, expiré ou déjà consommé ; parcours natif ;
 * adresse absente ou hors des origines de confiance), le greffon ne répond rien et Better Auth
 * garde son comportement : sa page par défaut.
 */
import type { BetterAuthPlugin } from "better-auth"
import { createAuthMiddleware } from "better-auth/api"
import { z } from "zod/v4"

import { trustedOrigins } from "./settings"

/**
 * Les seuls codes renvoyés à une porte : refus et abandons d'OAuth 2.0 (RFC 6749 § 4.1.2.1) et
 * d'OpenID Connect (Core § 3.1.2.6), indisponibilité passagère, et l'échec générique.
 */
export const IDN_RETURNED_ERRORS = [
  "access_denied", "login_required", "consent_required", "interaction_required",
  "account_selection_required", "temporarily_unavailable", "server_error",
] as const
export type IdnReturnedError = (typeof IDN_RETURNED_ERRORS)[number]

/** Toute autre valeur, absente comprise, devient ce code : la valeur reçue n'est jamais recopiée. */
export const IDN_GENERIC_ERROR: IdnReturnedError = "server_error"

function isReturnedError(value: unknown): value is IdnReturnedError {
  return typeof value === "string" && (IDN_RETURNED_ERRORS as readonly string[]).includes(value)
}

/** Le code à renvoyer : la valeur exacte d'une liste fermée, sinon le code générique. */
export function returnedErrorOf(raw: unknown): IdnReturnedError {
  return isReturnedError(raw) ? raw : IDN_GENERIC_ERROR
}

// L'état de Better Auth 1.6 : `generateRandomString(32)` (a-z, A-Z, 0-9, - et _). Toute autre
// forme n'est pas un état du moteur : aucune lecture en base.
const STATE = /^[A-Za-z0-9_-]{32}$/
const MAX_ERROR_URL_LENGTH = 2_048
// Un chemin simple : des segments de caractères non réservés, jamais de segment vide (« // »),
// ni barre oblique inverse, ni encodage, ni identifiants.
const SIMPLE_PATH = /^(?:\/[A-Za-z0-9._~-]+)+\/?$|^\/$/

/**
 * La porte de départ, si l'adresse d'erreur enregistrée est sûre : une adresse absolue déjà
 * normalisée, en http(s), sans identifiants, dont l'origine (schéma, hôte, port) figure
 * EXACTEMENT dans la liste des origines de confiance, au chemin simple. Seuls son origine et
 * son chemin ressortent : ni sa requête, ni son fragment. `null` sinon.
 */
export function refusalDestination(errorURL: unknown, allowlist: readonly string[]): string | null {
  if (typeof errorURL !== "string" || errorURL.length > MAX_ERROR_URL_LENGTH) return null
  let url: URL
  try { url = new URL(errorURL) } catch { return null }
  if ((url.protocol !== "https:" && url.protocol !== "http:") || url.username || url.password || url.href !== errorURL) return null
  if (!allowlist.includes(url.origin) || !SIMPLE_PATH.test(url.pathname)) return null
  return `${url.origin}${url.pathname}`
}

/** Les champs de l'état enregistré par `generateState` que ce retour relit. */
const storedStateSchema = z.object({
  errorURL: z.string().optional(),
  expiresAt: z.number(),
  oauthState: z.string().optional(),
}).loose()

type CallbackRoute = { path?: string; params?: Record<string, unknown> | undefined; query?: Record<string, unknown> | undefined }

function isIdnCallback(route: CallbackRoute): boolean {
  return route.path === "/oauth2/callback/idn" || (route.path === "/oauth2/callback/:providerId" && route.params?.providerId === "idn")
}

/** Les rappels que Better Auth envoie sur sa page par défaut sans lire l'état. */
function isErrorReturn(query: Record<string, unknown> | undefined): boolean {
  return Boolean(query?.error) || !query?.code
}

/**
 * Le moteur relit l'état qu'il a enregistré, en base (greffon `crossDomain` : état serveur,
 * sans cookie lié au navigateur). Il le CONSOMME avant toute décision : un état relu pour ce
 * renvoi n'est plus rejouable, qu'il serve ou non. `null` sans porte sûre.
 */
async function consumedDestination(ctx: {
  query?: Record<string, unknown> | undefined
  context: {
    oauthConfig: { storeStateStrategy: "database" | "cookie"; skipStateCookieCheck?: boolean | undefined }
    internalAdapter: { consumeVerificationValue: (identifier: string) => Promise<{ value: string } | null> }
  }
}): Promise<string | null> {
  const state = ctx.query?.state
  const oauth = ctx.context.oauthConfig
  if (typeof state !== "string" || !STATE.test(state) || oauth.storeStateStrategy !== "database" || !oauth.skipStateCookieCheck) return null
  // Atomique : introuvable, expiré (la ligne est alors supprimée) ou déjà consommé rendent null.
  const stored = await ctx.context.internalAdapter.consumeVerificationValue(state)
  if (!stored) return null
  let raw: unknown
  try { raw = JSON.parse(stored.value) } catch { return null }
  const parsed = storedStateSchema.safeParse(raw)
  if (!parsed.success || (parsed.data.oauthState !== undefined && parsed.data.oauthState !== state) || parsed.data.expiresAt <= Date.now()) return null
  // Le parcours natif garde le comportement de Better Auth (ADR-0031).
  if (Object.prototype.hasOwnProperty.call(parsed.data, "antsiaNative")) return null
  return refusalDestination(parsed.data.errorURL, trustedOrigins())
}

export function idnRefusalReturn(): BetterAuthPlugin {
  return {
    id: "engine-idn-refusal-return",
    hooks: {
      before: [{
        matcher: (ctx) => isIdnCallback(ctx) && isErrorReturn(ctx.query),
        handler: createAuthMiddleware(async (ctx) => {
          const destination = await consumedDestination(ctx)
          if (!destination) return
          const target = new URL(destination)
          target.searchParams.set("error", returnedErrorOf(ctx.query?.error))
          throw ctx.redirect(target.href)
        }),
      }],
    },
  }
}
