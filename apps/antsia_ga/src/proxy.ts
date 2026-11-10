import { NextResponse, type NextRequest } from "next/server"
import { appBasePath } from "./lib/app-path"
import { admittedDemoProxy, demoProxyHeaders, demoRuntimeOrigin } from "./lib/demo-proxy"

/** Deux builds figés, deux backends ; seule la zone /demo traverse ce relais privé. */
export function proxy(request: NextRequest) {
  if (appBasePath()) return admittedDemoProxy(request) ? NextResponse.next() : new NextResponse(null, { status: 403 })
  const path = request.nextUrl.pathname
  if (path !== "/demo" && !path.startsWith("/demo/")) return NextResponse.next()
  const origin = demoRuntimeOrigin()
  const headers = demoProxyHeaders(request.headers)
  if (!origin) return NextResponse.next()
  if (!headers) return new NextResponse(null, { status: 503, headers: { "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'", "X-Frame-Options": "DENY", "Cache-Control": "no-store" } })
  const destination = new URL(origin)
  destination.pathname = path
  destination.search = request.nextUrl.search
  return NextResponse.rewrite(destination, { request: { headers } })
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] }
