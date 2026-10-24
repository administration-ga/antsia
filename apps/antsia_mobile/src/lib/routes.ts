/** Table native fermée. Un lien est une référence à relire sous la session courante, jamais un droit. */
export type NativeRoute =
  | { name: "feed" }
  | { name: "messages" }
  | { name: "settings" }
  | { name: "explore" }
  | { name: "shop"; handle: string }
  | { name: "offer"; handle: string; offerRef: string }
  | { name: "page"; handle: string }
  | { name: "post"; id: string }
  | { name: "conversation"; id: string }

export function nativeRouteFromUrl(raw: string, scheme: string | null): NativeRoute | null {
  if (!scheme || raw.length > 512) return null
  try {
    const url = new URL(raw)
    if (url.protocol !== `${scheme}:` || url.username || url.password || url.port || url.search || url.hash) return null
    const segments = [url.hostname, ...url.pathname.split("/")].filter(Boolean)
    if (segments.length === 1) {
      if (segments[0] === "fil") return { name: "feed" }
      if (segments[0] === "messages") return { name: "messages" }
      if (segments[0] === "reglages") return { name: "settings" }
    }
    if (segments.length !== 2 || !/^[a-z0-9]{16,64}$/.test(segments[1] ?? "")) return null
    if (segments[0] === "publication") return { name: "post", id: segments[1]! }
    if (segments[0] === "conversation") return { name: "conversation", id: segments[1]! }
    // Aucun callback de session, jeton, appel ni achat accepté dans ce lot.
    return null
  } catch { return null }
}

function webRoute(origin: string, path: string, basePath: "" | "/demo" = ""): string {
  if (basePath !== "" && basePath !== "/demo") throw new Error("nativeWebBasePathInvalid")
  return new URL(`${basePath}${path}`, origin).href
}

export const nativeWebRoutes = {
  enter: (origin: string, basePath?: "" | "/demo") => webRoute(origin, "/entrer", basePath),
  profile: (origin: string, handle: string, basePath?: "" | "/demo") => webRoute(origin, `/@${encodeURIComponent(handle)}`, basePath),
  page: (origin: string, handle: string, basePath?: "" | "/demo") => webRoute(origin, `/page/${encodeURIComponent(handle)}`, basePath),
  offer: (origin: string, handle: string, offerRef: string, basePath?: "" | "/demo") => webRoute(origin, `/boutique/${encodeURIComponent(handle)}/offres/${encodeURIComponent(offerRef)}`, basePath),
}

/** Pile bornée, locale à UNE session ; les liens externes réinitialisent leur historique. */
export function pushNativeRoute(history: NativeRoute[], next: NativeRoute): NativeRoute[] {
  const previous = history[history.length - 1]
  if (previous && JSON.stringify(previous) === JSON.stringify(next)) return history
  return [...history.slice(-19), next]
}

export function nativeTab(route: NativeRoute): "feed" | "explore" | "messages" | "settings" {
  if (route.name === "shop" || route.name === "offer" || route.name === "page") return "explore"
  if (route.name === "post") return "feed"
  if (route.name === "conversation") return "messages"
  return route.name
}
