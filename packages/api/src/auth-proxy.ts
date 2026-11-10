// Dupliqué de plateforme/espace/espace_administration_ga/src/app/api/auth/[...path]/route.ts @ ad2e7fdc2 — adaptations : factorisé dans @antsia/api pour toutes les applications du moteur (antsia.ga, diasporale.com…), qui le réexportent ; configuration injectable pour les tests (`proxyToConvex`) ; réécriture des cookies `__Secure-` réservée au développement ; journal d'erreur sans détail de requête.
/**
 * Proxy Better Auth → actions HTTP Convex du moteur : l'application parle à
 * l'authentification par SA propre origine. Une application l'emploie par
 *
 *   // src/app/api/auth/[...path]/route.ts
 *   export { DELETE, GET, PATCH, POST, PUT } from "@antsia/api/auth-proxy"
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
}

const HOP_BY_HOP = new Set(["transfer-encoding", "connection", "keep-alive", "upgrade"])

/**
 * En-têtes qui décrivent CE saut-ci et qu'il ne faut jamais relayer.
 *
 * ⚠️ `x-forwarded-host` casse TOUTE l'authentification, silencieusement : Next
 * l'ajoute (`localhost:3030`), Better Auth le lit côté Convex pour reconstituer
 * sa base d'URL et ne reconnaît plus aucune de ses routes (404 sans journal).
 */
const PER_HOP_FORWARDING = new Set(["x-forwarded-host", "x-forwarded-proto", "x-forwarded-port", "x-forwarded-for"])

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

  const proxyHeaders: Record<string, string> = {}
  req.headers.forEach((value, key) => {
    const lower = key.toLowerCase()
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
      if (lower === "set-cookie" || HOP_BY_HOP.has(lower)) return
      headers.set(key, value)
    })
    for (const cookie of upstream.headers.getSetCookie()) headers.append("set-cookie", isDev ? devCookie(cookie) : cookie)

    return new NextResponse(responseBody, { status: upstream.status, headers })
  } catch (error) {
    console.error("[auth] proxy indisponible", error instanceof Error ? error.message : "inconnu")
    return NextResponse.json({ error: "auth_proxy_unavailable" }, { status: 502 })
  }
}

function fromEnvironment(): AuthProxyOptions {
  return { convexSiteUrl: process.env.CONVEX_SITE_URL, isDev: process.env.NODE_ENV !== "production" }
}

export async function GET(req: NextRequest) {
  return proxyToConvex(req, fromEnvironment())
}
export async function POST(req: NextRequest) {
  return proxyToConvex(req, fromEnvironment())
}
export async function PUT(req: NextRequest) {
  return proxyToConvex(req, fromEnvironment())
}
export async function PATCH(req: NextRequest) {
  return proxyToConvex(req, fromEnvironment())
}
export async function DELETE(req: NextRequest) {
  return proxyToConvex(req, fromEnvironment())
}
