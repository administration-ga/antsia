/**
 * Revue CH-815 A1b (constat F1) — le rappel IDN central ne pose AUCUN cookie, en parcours web.
 *
 * Le rappel est une navigation du navigateur vers `${SITE_URL}/api/auth/oauth2/callback/idn`, servie par
 * l'application de cette origine (son relais `/api/auth/*`). Better Auth y crée la session et pose ses
 * cookies (`setSessionCookie` : jeton de session de sept jours ; greffon `convex` : JWT Convex) ; le
 * greffon `crossDomain` ne les convertit en `Set-Better-Auth-Cookie` que pour une requête qui porte
 * l'en-tête `better-auth-cookie`, ce qu'une navigation ne fait jamais. Ces cookies restaient donc sur
 * l'origine de SITE_URL, que l'application de départ soit celle-là, celle des membres ou celle de
 * l'administration d'un réseau : avec eux seuls, `GET /api/auth/convex/token` rend un JWT de la session
 * scellée, à la portée de tout script de ce site.
 *
 * Aucune application web n'en a besoin : la session n'est livrée que par le jeton à usage unique ajouté
 * à l'adresse de retour (`crossDomain`), que l'application de départ échange sans aucun cookie du
 * navigateur (`credentials: "omit"`, session dans `Better-Auth-Cookie`). L'application servie à SITE_URL
 * (antsia.ga) entre de la même façon (recette `idnApplication.test.ts`).
 *
 * Ce greffon est le DERNIER de la chaîne (`auth.ts`) : il passe après le jeton à usage unique, après le
 * JWT Convex et après le jeton porteur (`bearer`, `set-auth-token`). Sur le rappel IDN d'un parcours web,
 * il retire de la réponse tout `Set-Cookie` et le jeton porteur. Le parcours natif (ADR-0031) ne change
 * pas : son retour délivre son propre code S256.
 */
import type { BetterAuthPlugin } from "better-auth"
import { createAuthMiddleware } from "better-auth/api"

import { isNativeIdnOAuth } from "./nativeIdn"

/** Le jeton porteur que le greffon `bearer` ajoute à toute réponse qui pose le cookie de session. */
const BEARER_HEADER = "set-auth-token"
const EXPOSE_HEADERS = "access-control-expose-headers"

type CallbackRoute = { path?: string; params?: Record<string, unknown> | undefined }

export function isIdnCallbackRoute(route: CallbackRoute): boolean {
  return route.path === "/oauth2/callback/idn" || (route.path === "/oauth2/callback/:providerId" && route.params?.providerId === "idn")
}

/** Le parcours natif, si l'état OAuth le dit ; un état illisible n'est pas natif (le retrait reste la règle). */
async function nativeFlow(): Promise<boolean> {
  try {
    return await isNativeIdnOAuth()
  } catch {
    return false
  }
}

/** Les en-têtes de la réponse, sans cookie ni jeton porteur. */
export function stripBrowserSession(headers: Headers): void {
  headers.delete("set-cookie")
  headers.delete(BEARER_HEADER)
  const exposed = headers.get(EXPOSE_HEADERS)
  if (exposed === null) return
  const kept = exposed.split(",").map((name) => name.trim()).filter((name) => name && name.toLowerCase() !== BEARER_HEADER)
  if (kept.length === 0) headers.delete(EXPOSE_HEADERS)
  else headers.set(EXPOSE_HEADERS, kept.join(", "))
}

export function idnWebCallbackWithoutCookies(): BetterAuthPlugin {
  return {
    id: "engine-idn-web-callback-without-cookies",
    hooks: {
      after: [{
        matcher: isIdnCallbackRoute,
        handler: createAuthMiddleware(async (ctx) => {
          // Les en-têtes ACCUMULÉS de la réponse (ceux du rappel et des greffons passés avant).
          const headers = ctx.context.responseHeaders
          if (!headers || await nativeFlow()) return
          stripBrowserSession(headers)
        }),
      }],
    },
  }
}
