/** Chemin physique du build démo ; les routes du routeur Next restent logiques. */
const DEMO_BACKEND_HOST = "vivid-hedgehog-655.convex.cloud"

/** Deux déclarations exactes sont nécessaires ; aucune origine normalisée n'ouvre la démo. */
export function appBasePath(): "" | "/demo" {
  if (process.env.NEXT_PUBLIC_APP_BASE_PATH !== "/demo") return ""
  const backend = process.env.NEXT_PUBLIC_CONVEX_URL
  if (!backend) return ""
  try {
    const url = new URL(backend)
    return url.protocol === "https:" && !url.port && backend === url.origin && url.hostname === DEMO_BACKEND_HOST ? "/demo" : ""
  } catch { return "" }
}

function assertInternalAppPath(path: string): void {
  const pathname = path.split(/[?#]/u, 1)[0] ?? ""
  if (!path.startsWith("/") || path.startsWith("//") || /[\u0000-\u0020\u007f\\]/u.test(path) || /(?:^|\/)(?:\.|%2e){1,2}(?:\/|$)/iu.test(pathname)) {
    throw new TypeError("invalidAppPath")
  }
}

function hasAppBasePath(path: string, basePath: string): boolean {
  return path === basePath || path.startsWith(`${basePath}/`) || path.startsWith(`${basePath}?`) || path.startsWith(`${basePath}#`)
}

/** Navigation document/fetch Next seulement : jamais Link/router ni une URL Convex. */
export function browserAppPath(path: string): string {
  assertInternalAppPath(path)
  const basePath = appBasePath()
  if (!basePath || hasAppBasePath(path, basePath)) return path
  return path === "/" ? basePath : `${basePath}${path}`
}

/** Pour comparer un chemin lu dans l'URL du navigateur aux routes logiques. */
export function logicalAppPath(path: string): string {
  assertInternalAppPath(path)
  const basePath = appBasePath()
  if (!basePath || !hasAppBasePath(path, basePath)) return path
  const logical = path.slice(basePath.length)
  return logical.startsWith("/") ? logical : `/${logical}`
}
