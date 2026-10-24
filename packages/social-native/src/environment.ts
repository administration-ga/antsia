/** P17b — pas d'origine dev implicite, de déduction cloud/site ou d'identité native inventée. */
export type NativeEnvironment = {
  convexUrl: string
  authUrl: string
  webUrl: string
  scheme: string | null
  webBasePath?: "/demo"
}

function endpoint(raw: string | undefined, allowLocalHttp: boolean): string | null {
  if (!raw) return null
  try {
    const url = new URL(raw)
    const privateHost = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    if (url.username || url.password || url.hash || url.search || url.pathname !== "/") return null
    if (url.protocol !== "https:" && !(allowLocalHttp && privateHost && url.protocol === "http:")) return null
    return url.origin
  } catch { return null }
}

export function nativeEnvironment(input: {
  convexUrl?: string; authUrl?: string; webUrl?: string; scheme?: string
  development: boolean; allowLocalHttp?: string; webBasePath?: string
}): NativeEnvironment | null {
  if (input.webBasePath !== undefined && input.webBasePath !== "" && input.webBasePath !== "/demo") return null
  const allowHttp = input.development && input.allowLocalHttp === "true"
  const convexUrl = endpoint(input.convexUrl, allowHttp)
  const authUrl = endpoint(input.authUrl, allowHttp)
  const webUrl = endpoint(input.webUrl, allowHttp)
  if (!convexUrl || !authUrl || !webUrl) return null
  const scheme = input.scheme?.trim() || null
  // Aucun schéma générique, joker ou protocole réseau n'est adopté comme lien applicatif.
  if (scheme && (!/^[a-z][a-z0-9+.-]{2,63}$/.test(scheme) || /^(?:https?|exp|exps|file|javascript|data)$/.test(scheme))) return null
  return { convexUrl, authUrl, webUrl, scheme, ...(input.webBasePath === "/demo" ? { webBasePath: "/demo" } : {}) }
}
