// @ts-check
/**
 * Politique de sécurité du contenu (CSP) des applications du moteur.
 *
 * En JavaScript pur (.mjs) parce qu'elle est importée par `next.config.ts`, que
 * Next charge avant toute transpilation des paquets (même choix que
 * `@workspace/livekit/csp` au socle). Les origines du backend se DÉRIVENT de
 * `NEXT_PUBLIC_CONVEX_URL` : aucune URL de déploiement n'est écrite dans le code
 * (dépôt public, et une origine oubliée casse la connexion sans erreur visible).
 *
 * ⚠️ Palier PA0 : `script-src` tolère encore `'unsafe-inline'` (scripts
 * d'hydratation de Next). La CSP à jeton (nonce par requête, EXT-AN-02) arrive
 * avec la mise en ligne publique (PA8/PA10). Un seul script en ligne appartient
 * aux applications : l'amorçage de l'apparence (ADR-0026), qui reçoit déjà le
 * nonce de `CSP_NONCE_HEADER` quand la requête en porte un.
 */

/**
 * En-tête de REQUÊTE qui portera le nonce de la CSP à jeton : le proxy qui le tire
 * par requête le pose (avec la politique), la mise en page le relit pour les
 * scripts en ligne de l'application. Absent aujourd'hui : rien n'est changé.
 */
export const CSP_NONCE_HEADER = "x-nonce"

/**
 * Origines HTTP et WebSocket d'un déploiement Convex, déduites de son URL.
 * `https://x.convex.cloud` → https://x.convex.cloud, wss://x.convex.cloud et le
 * domaine `.convex.site` des actions HTTP ; `http://127.0.0.1:3210` (déploiement
 * local) → http://127.0.0.1:3210, ws://127.0.0.1:3210, et le port HTTP voisin.
 * @param {string | undefined} convexUrl
 * @returns {string[]}
 */
export function convexOrigins(convexUrl) {
  if (!convexUrl) return []
  let url
  try {
    url = new URL(convexUrl)
  } catch {
    return []
  }
  const origins = new Set([url.origin])
  const ws = url.protocol === "https:" ? "wss:" : "ws:"
  origins.add(`${ws}//${url.host}`)
  if (url.hostname.endsWith(".convex.cloud")) {
    origins.add(`${url.protocol}//${url.hostname.replace(/\.convex\.cloud$/, ".convex.site")}`)
  }
  if (url.hostname === "127.0.0.1" || url.hostname === "localhost") {
    const sitePort = Number(url.port || "80") + 1
    origins.add(`${url.protocol}//${url.hostname}:${sitePort}`)
  }
  return [...origins]
}

/**
 * Origines d'un serveur média LiveKit, déduites de son URL de signalisation
 * (`wss://media.exemple.ga` → wss://media.exemple.ga et https://media.exemple.ga,
 * que le client interroge aussi pour la région). Aucune URL par défaut : sans
 * variable, la couche d'appel n'ouvre aucune connexion (au socle, une URL de
 * serveur du programme était écrite dans `livekit/csp.mjs` — retirée, owner map §7.4).
 * @param {string | undefined} livekitUrl
 * @returns {string[]}
 */
export function livekitOrigins(livekitUrl) {
  if (!livekitUrl) return []
  let url
  try {
    url = new URL(livekitUrl)
  } catch {
    return []
  }
  if (!["wss:", "ws:", "https:", "http:"].includes(url.protocol)) return []
  const secure = url.protocol === "wss:" || url.protocol === "https:"
  return [`${secure ? "wss:" : "ws:"}//${url.host}`, `${secure ? "https:" : "http:"}//${url.host}`]
}

/**
 * Une permission d'iframe exige une origine HTTPS canonique exacte. Ne jamais
 * normaliser une entrée : cela admettrait notamment un chemin ou un port 443
 * explicite supprimé par URL.origin. Sans entrée admise, aucune permission.
 * @param {readonly string[] | undefined} origins
 * @returns {string[]}
 */
function exactHttpsFrameOrigins(origins) {
  if (!Array.isArray(origins)) return []
  const admitted = origins.filter((value) => {
    if (typeof value !== "string") return false
    try {
      const url = new URL(value)
      const hostname = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/u.test(url.hostname)
        || /^\[[0-9a-f:]+\]$/u.test(url.hostname)
      return hostname && url.protocol === "https:" && value === url.origin && !url.port && !url.username && !url.password
    } catch { return false }
  })
  return [...new Set(admitted)]
}

/**
 * @param {{ convexUrl?: string, livekitUrl?: string, isDev: boolean, extraConnect?: string[], iframeSources?: readonly string[], frameAncestors?: readonly string[] }} options
 * @returns {string}
 */
export function buildContentSecurityPolicy(options) {
  const backend = convexOrigins(options.convexUrl)
  const iframeSources = exactHttpsFrameOrigins(options.iframeSources)
  const frameAncestors = exactHttpsFrameOrigins(options.frameAncestors)
  const connect = [
    "'self'",
    ...backend,
    ...livekitOrigins(options.livekitUrl),
    ...(options.extraConnect ?? []),
    ...(options.isDev ? ["ws://localhost:*", "ws://127.0.0.1:*", "http://127.0.0.1:*"] : []),
  ]
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${options.isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${backend.filter((o) => o.startsWith("http")).join(" ")}`.trim(),
    "font-src 'self' data:",
    `connect-src ${connect.join(" ")}`,
    // Messages vocaux et messagerie vocale : servis par le stockage du déploiement.
    `media-src 'self' blob: ${backend.filter((o) => o.startsWith("http")).join(" ")}`.trim(),
    "worker-src 'self' blob:",
    ...(iframeSources.length ? [`frame-src ${iframeSources.join(" ")}`] : []),
    `frame-ancestors ${frameAncestors.length ? frameAncestors.join(" ") : "'none'"}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ]
  return directives.join("; ")
}

/**
 * En-têtes de sécurité statiques communs aux applications du moteur.
 * @param {{ convexUrl?: string, livekitUrl?: string, isDev: boolean, extraConnect?: string[], iframeSources?: readonly string[], frameAncestors?: readonly string[] }} options
 * @returns {{ key: string, value: string }[]}
 */
export function securityHeaders(options) {
  return [
    { key: "Content-Security-Policy", value: buildContentSecurityPolicy(options) },
    { key: "X-Content-Type-Options", value: "nosniff" },
    ...(exactHttpsFrameOrigins(options.frameAncestors).length ? [] : [{ key: "X-Frame-Options", value: "DENY" }]),
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=()" },
    ...(options.isDev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }]),
  ]
}
