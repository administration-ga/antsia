import { timingSafeEqual } from "node:crypto"
import { appBasePath } from "./app-path"

const PROXY_HEADER = "x-antsia-demo-proxy"
/** Secret uniquement serveur ; aucune origine reçue ne choisit le backend. */
export function admittedDemoProxy(request: Request): boolean {
  if (!appBasePath()) return false
  const expected = process.env.ANTSIA_DEMO_PROXY_TOKEN
  const actual = request.headers.get(PROXY_HEADER)
  if (!expected || !/^[A-Za-z0-9_-]{32,256}$/u.test(expected) || !actual || !/^[A-Za-z0-9_-]{32,256}$/u.test(actual) || actual.length !== expected.length) return false
  return timingSafeEqual(Buffer.from(actual), Buffer.from(expected))
}

export function demoRuntimeOrigin(): string | null {
  const value = process.env.ANTSIA_DEMO_RUNTIME_ORIGIN
  if (!value || value.trim() !== value) return null
  try {
    const url = new URL(value)
    // Une cible technique Vercel exacte, sans alias public, chemin ni paramètres.
    if (url.protocol !== "https:" || url.port || url.origin !== value || value === process.env.NEXT_PUBLIC_SITE_URL || !/^[a-z0-9]+(?:-[a-z0-9]+)*\.vercel\.app$/u.test(url.hostname)) return null
    return url.origin
  } catch { return null }
}

export function demoProxyHeaders(incoming: Headers): Headers | null {
  const proxyToken = process.env.ANTSIA_DEMO_PROXY_TOKEN
  const hostingToken = process.env.ANTSIA_DEMO_HOSTING_BYPASS
  if (!proxyToken || proxyToken.length < 32 || !hostingToken || hostingToken.length < 20) return null
  const headers = new Headers(incoming)
  for (const key of [...headers.keys()]) {
    if (key.startsWith("x-middleware-") || key.startsWith("x-vercel-protection-") || key === "x-antsia-demo-proxy") headers.delete(key)
  }
  // Les cookies HTTP du vrai compte ne sont jamais remis au serveur démo.
  const cookies = (headers.get("cookie") ?? "").split(";").map((part) => part.trim()).filter((part) => /^__Host-antsia_demo_(?:receipt|generation)=/u.test(part))
  headers.delete("cookie")
  if (cookies.length) headers.set("cookie", cookies.join("; "))
  headers.set(PROXY_HEADER, proxyToken)
  headers.set("x-vercel-protection-bypass", hostingToken)
  return headers
}
