import { proxyToConvex } from "@antsia/api/auth-proxy"
import { NextResponse, type NextRequest } from "next/server"
import { appBasePath } from "@/lib/app-path"
import { admittedDemoProxy } from "@/lib/demo-proxy"
import { routes } from "@/lib/routes"

function handle(request: NextRequest) {
  const basePath = appBasePath()
  if (basePath && !admittedDemoProxy(request)) return new NextResponse(null, { status: 403 })
  const path = new URL(request.url).pathname
  const matches = (prefix: string) => path === prefix || path.startsWith(`${prefix}/`)
  // Next peut retirer son basePath AVANT l'appel de la Route Handler. Le
  // transport démo a déjà été admis : les deux formes exactes sont équivalentes.
  const physical = !!basePath && matches(`${basePath}${routes.authBase()}`)
  if (!physical && !matches(routes.authBase())) return new NextResponse(null, { status: 403 })
  return proxyToConvex(request, { convexSiteUrl: process.env.CONVEX_SITE_URL, isDev: process.env.NODE_ENV !== "production", publicBasePath: physical ? basePath : "" })
}
export { handle as GET, handle as POST, handle as PUT, handle as PATCH, handle as DELETE }
