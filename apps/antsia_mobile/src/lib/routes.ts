/** Table native fermée. Un lien est une référence à relire sous la session courante, jamais un droit. */
export type NativeRoute =
  | { name: "feed"; tag?: string }
  | { name: "messages" }
  | { name: "clips" }
  | { name: "me" }
  | { name: "notifications" }
  | { name: "bookmarks" }
  | { name: "business" }
  | { name: "profile"; handle: string }
  | { name: "settings" }
  | { name: "explore" }
  | { name: "compose" }
  | { name: "search" }
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
      if (segments[0] === "clips") return { name: "clips" }
      if (segments[0] === "explorer") return { name: "explore" }
      if (segments[0] === "moi") return { name: "me" }
      if (segments[0] === "notifications") return { name: "notifications" }
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

export type NativeAccountSection = "stories" | "shop" | "cart" | "purchases" | "orders" | "payments" | "serviceRequests" | "applications" | "feedPreferences" | "moderation" | "personalData"
const accountPaths: Record<NativeAccountSection, string> = {
  stories: "/actus", shop: "/mes-boutiques", cart: "/panier", purchases: "/mes-achats", orders: "/mes-commandes", payments: "/mes-paiements", serviceRequests: "/mes-demandes", applications: "/mes-candidatures", feedPreferences: "/mon-fil", moderation: "/moderation", personalData: "/mes-donnees",
}
export const nativeWebRoutes = {
  storyCreate: (origin: string, basePath?: "" | "/demo") => webRoute(origin, "/actus/nouvelle", basePath),
  post: (origin: string, postId: string, basePath?: "" | "/demo") => webRoute(origin, `/fil?${new URLSearchParams({ post: postId })}`, basePath),
  accountSection: (origin: string, section: NativeAccountSection, basePath?: "" | "/demo") => webRoute(origin, accountPaths[section], basePath),
  notifications: (origin: string, basePath?: "" | "/demo") => webRoute(origin, "/fil?notifications=1", basePath),
  apdpvp: () => "https://www.apdpvp.ga/textes-et-decisions/",
  officialJournal: () => "https://journal-officiel.ga/20085-025-2023-/",
  gdpr: () => "https://eur-lex.europa.eu/eli/reg/2016/679/oj?locale=fr",
  enter: (origin: string, basePath?: "" | "/demo") => webRoute(origin, "/entrer", basePath),
  signUp: (origin: string, basePath?: "" | "/demo") => webRoute(origin, "/entrer?inscription=1", basePath),
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

export type NativeTab = "feed" | "clips" | "messages" | "explore" | "me"
/** Same five destinations as the enabled mobile web shell. Creation belongs in the header. */
export const NATIVE_MEMBER_TABS = [
  { name: "feed", icon: "home" }, { name: "clips", icon: "play" }, { name: "messages", icon: "messages" },
  { name: "explore", icon: "compass" }, { name: "me", icon: "user" },
] as const
export function nativeTab(route: NativeRoute, myHandle?: string): NativeTab {
  if (route.name === "profile") return route.handle === myHandle ? "me" : "explore"
  if (["settings", "bookmarks", "me"].includes(route.name)) return "me"
  if (["shop", "offer", "page", "search", "business", "explore"].includes(route.name)) return "explore"
  if (route.name === "conversation" || route.name === "messages") return "messages"
  if (route.name === "clips") return "clips"
  return "feed"
}
