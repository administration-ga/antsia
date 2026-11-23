// Dupliqué de plateforme/espace/espace_administration_ga/src/app/api/auth/[...path]/route.ts @ ad2e7fdc2 — adaptations : factorisé dans @antsia/api pour toutes les applications du moteur (antsia.ga, diaspora.ga…), qui le réexportent ; configuration injectable pour les tests (`proxyToConvex`) ; réécriture des cookies `__Secure-` réservée au développement ; journal d'erreur sans détail de requête ; option `browserCookies` (« relay » ou « drop ») et fabrique `createAuthProxyHandlers`, aucun cookie ni jeton porteur relayé sur un rappel OAuth (revue CH-815 A1b).
/**
 * Proxy Better Auth → actions HTTP Convex du moteur : l'application parle à
 * l'authentification par SA propre origine. Une application l'emploie par
 *
 *   // src/app/api/auth/[...path]/route.ts
 *   export { DELETE, GET, PATCH, POST, PUT } from "@antsia/api/auth-proxy"
 *
 * ou, sans aucun cookie du navigateur (revue CH-815 A1b) :
 *
 *   export const { DELETE, GET, PATCH, POST, PUT } = createAuthProxyHandlers({ browserCookies: "drop" })
 *
 * `CONVEX_SITE_URL` est inscrit par la configuration Next commune (`.env.local`
 * du moteur en développement, variable d'exécution en production).
 */
import { type NextRequest, NextResponse } from "next/server"

export type AuthProxyOptions = {
  /** Origine des actions HTTP Convex (`CONVEX_SITE_URL`). */
  convexSiteUrl: string | undefined
  /** Développement HTTP : cookies sans `__Secure-` ni `Secure`, `SameSite=Lax`. */
  isDev: boolean
  /** Préfixe public de l'application ; retiré du seul chemin /api/auth avant le saut Convex. */
  publicBasePath?: string
  /** Injectable pour les tests. */
  fetchImpl?: typeof fetch
  /**
   * Cookies du NAVIGATEUR (revue CH-815 A1b). `relay` (défaut, comportement historique) : le `Cookie`
   * entrant part vers le moteur, les `Set-Cookie` du moteur reviennent. `drop` : aucun des deux, pour une
   * application dont la session ne vit que dans `Better-Auth-Cookie` / `Set-Better-Auth-Cookie` (greffon
   * `crossDomain`, `credentials: "omit"`), qui passent toujours. Un `Cookie` entrant n'y viendrait que d'un
   * dépôt par un voisin du même site ou d'une navigation forgée ; un `Set-Cookie` poserait une session que
   * rien n'y lit.
   */
  browserCookies?: "relay" | "drop"
}

/** La fabrique : les réglages de `AuthProxyOptions`, `CONVEX_SITE_URL` et le mode lus à chaque requête à défaut. */
export type AuthProxyHandlerOptions = Partial<AuthProxyOptions>

export type AuthProxyHandler = (req: NextRequest) => Promise<NextResponse>
export type AuthProxyHandlers = { GET: AuthProxyHandler; POST: AuthProxyHandler; PUT: AuthProxyHandler; PATCH: AuthProxyHandler; DELETE: AuthProxyHandler }

const HOP_BY_HOP = new Set(["transfer-encoding", "connection", "keep-alive", "upgrade"])

/**
 * En-têtes qui décrivent CE saut-ci et qu'il ne faut jamais relayer.
 *
 * ⚠️ `x-forwarded-host` casse TOUTE l'authentification, silencieusement : Next
 * l'ajoute (`localhost:3030`), Better Auth le lit côté Convex pour reconstituer
 * sa base d'URL et ne reconnaît plus aucune de ses routes (404 sans journal).
 */
const PER_HOP_FORWARDING = new Set(["x-forwarded-host", "x-forwarded-proto", "x-forwarded-port", "x-forwarded-for"])

/**
 * Défense en profondeur (revue CH-815 A1b, constat F1) : un rappel OAuth est une NAVIGATION vers le moteur,
 * qui livre la session par le jeton à usage unique ajouté à l'adresse de retour. Aucun cookie ni jeton
 * porteur n'y est relayé, quel que soit le mode : le moteur ne les y pose plus, et un moteur d'avant ce
 * durcissement ne les déposerait pas sur l'origine de l'application.
 */
const OAUTH_CALLBACK_PREFIX = "/api/auth/oauth2/callback/"
const BEARER_HEADER = "set-auth-token"

/** Développement (HTTP) : retirer `__Secure-` et `Secure`, passer en `SameSite=Lax` (Chrome refuse `None` sans `Secure`). */
export function devCookie(cookie: string): string {
  return cookie.replaceAll("__Secure-", "").replace(/;\s*Secure/gi, "").replace(/SameSite=None/gi, "SameSite=Lax")
}

export async function proxyToConvex(req: NextRequest, options: AuthProxyOptions): Promise<NextResponse> {
  const { convexSiteUrl, isDev } = options
  if (!convexSiteUrl) return NextResponse.json({ error: "convex_site_url_missing" }, { status: 500 })

  const url = new URL(req.url)
  const publicBasePath = options.publicBasePath ?? ""
  let pathname = url.pathname
  if (publicBasePath !== "") {
    if (!/^\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/.test(publicBasePath)) return NextResponse.json({ error: "auth_proxy_path_refused" }, { status: 403 })
    const authPath = `${publicBasePath}/api/auth`
    if (pathname !== authPath && !pathname.startsWith(`${authPath}/`)) return NextResponse.json({ error: "auth_proxy_path_refused" }, { status: 403 })
    pathname = pathname.slice(publicBasePath.length)
  }
  const targetUrl = `${convexSiteUrl}${pathname}${url.search}`
  // Tout autre mode que le défaut historique ferme : aucun cookie du navigateur.
  const relayBrowserCookies = options.browserCookies === undefined || options.browserCookies === "relay"
  const oauthCallback = pathname.startsWith(OAUTH_CALLBACK_PREFIX)

  const proxyHeaders: Record<string, string> = {}
  req.headers.forEach((value, key) => {
    const lower = key.toLowerCase()
    if (!relayBrowserCookies && lower === "cookie") return
    if (!HOP_BY_HOP.has(lower) && !PER_HOP_FORWARDING.has(lower)) proxyHeaders[key] = value
  })
  proxyHeaders["accept-encoding"] = "application/json"
  proxyHeaders.host = new URL(convexSiteUrl).host

  try {
    const body = req.method !== "GET" && req.method !== "HEAD" ? await req.arrayBuffer() : undefined
    const doFetch = options.fetchImpl ?? fetch
    const upstream = await doFetch(targetUrl, {
      method: req.method,
      headers: proxyHeaders,
      redirect: "manual",
      ...(body !== undefined ? { body } : {}),
      // `duplex` est requis pour un corps en flux (Node), absent des types DOM.
      ...({ duplex: "half" } as Record<string, string>),
    })

    const responseBody = await upstream.arrayBuffer()
    const headers = new Headers()
    upstream.headers.forEach((value, key) => {
      const lower = key.toLowerCase()
      if (lower === "set-cookie" || HOP_BY_HOP.has(lower) || (oauthCallback && lower === BEARER_HEADER)) return
      headers.set(key, value)
    })
    if (relayBrowserCookies && !oauthCallback) {
      for (const cookie of upstream.headers.getSetCookie()) headers.append("set-cookie", isDev ? devCookie(cookie) : cookie)
    }

    return new NextResponse(responseBody, { status: upstream.status, headers })
  } catch (error) {
    console.error("[auth] proxy indisponible", error instanceof Error ? error.message : "inconnu")
    return NextResponse.json({ error: "auth_proxy_unavailable" }, { status: 502 })
  }
}

function fromEnvironment(): AuthProxyOptions {
  return { convexSiteUrl: process.env.CONVEX_SITE_URL, isDev: process.env.NODE_ENV !== "production" }
}

/**
 * Les cinq gestionnaires de la route `/api/auth/[...path]`, avec ces réglages ; à défaut, ceux de
 * l'environnement, relus à CHAQUE requête (`CONVEX_SITE_URL`, `NODE_ENV`). Sans option : les exports
 * historiques ci-dessous (`relay`).
 */
export function createAuthProxyHandlers(options: AuthProxyHandlerOptions = {}): AuthProxyHandlers {
  const handle: AuthProxyHandler = (req) => proxyToConvex(req, { ...fromEnvironment(), ...definedOptions(options) })
  return { GET: handle, POST: handle, PUT: handle, PATCH: handle, DELETE: handle }
}

/** Une option donnée `undefined` ne masque pas la valeur de l'environnement. */
function definedOptions(options: AuthProxyHandlerOptions): Partial<AuthProxyOptions> {
  return Object.fromEntries(Object.entries(options).filter(([, value]) => value !== undefined)) as Partial<AuthProxyOptions>
}

const defaultHandlers = createAuthProxyHandlers()

export async function GET(req: NextRequest) {
  return defaultHandlers.GET(req)
}
export async function POST(req: NextRequest) {
  return defaultHandlers.POST(req)
}
export async function PUT(req: NextRequest) {
  return defaultHandlers.PUT(req)
}
export async function PATCH(req: NextRequest) {
  return defaultHandlers.PATCH(req)
}
export async function DELETE(req: NextRequest) {
  return defaultHandlers.DELETE(req)
}
