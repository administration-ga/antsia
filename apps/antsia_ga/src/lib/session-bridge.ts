import { appBasePath } from "./app-path"

/** Pont propre à ANTSIA : ces noms ne sont ni les cookies Better Auth ni ceux des autres applications. */
export const BRIDGE_TTL_SECONDS = 60 * 60 * 24 * 7
export const BRIDGE_TIMEOUT_MS = 4_000
/** Le transport inclut réseau/préparation Next ; le travail serveur garde sa propre borne de 4 s. */
export const BRIDGE_CLIENT_TIMEOUT_MS = 15_000
export const BRIDGE_RESUME_EVENT = "antsia:public-session-resume"

export function bridgeCookieNames(secure: boolean) {
  const prefix = secure ? "__Host-" : ""
  const scope = appBasePath() ? "demo" : "public"
  return { receipt: `${prefix}antsia_${scope}_receipt`, generation: `${prefix}antsia_${scope}_generation` }
}

export type BridgeReceipt =
  | { kind: "anonymous"; generation: string }
  | { kind: "session"; generation: string; cookieName: string; cookieValue: string }

export function isBridgeGeneration(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

export function sdkSessionCookie(value: string): { name: string; value: string } | null {
  const pairs: { name: string; value: string }[] = []
  for (const part of value.split(";")) {
    const separator = part.indexOf("=")
    if (separator < 0) continue
    const name = part.slice(0, separator).trim()
    if (name !== "better-auth.session_token" && name !== "__Secure-better-auth.session_token") continue
    let token: string
    try { token = decodeURIComponent(part.slice(separator + 1).trim()) } catch { return null }
    if (!/^[A-Za-z0-9._~+/=-]{20,2048}$/.test(token) || !token.includes(".")) return null
    pairs.push({ name, value: token })
  }
  // Deux cookies de session, même identiques, rendent l'autorité ambiguë.
  return pairs.length === 1 ? pairs[0]! : null
}

export function parseBridgeReceipt(raw: string | undefined): BridgeReceipt | null {
  if (!raw || raw.length > 4096) return null
  try {
    const value: unknown = JSON.parse(raw)
    if (!value || typeof value !== "object" || !("kind" in value) || !("generation" in value) || !isBridgeGeneration(value.generation)) return null
    if (value.kind === "anonymous" && Object.keys(value).length === 2) return { kind: "anonymous", generation: value.generation }
    if (value.kind !== "session" || Object.keys(value).length !== 4 || !("cookieName" in value) || !("cookieValue" in value) || typeof value.cookieName !== "string" || typeof value.cookieValue !== "string") return null
    const cookie = sdkSessionCookie(`${value.cookieName}=${encodeURIComponent(value.cookieValue)}`)
    return cookie ? { kind: "session", generation: value.generation, cookieName: cookie.name, cookieValue: cookie.value } : null
  } catch { return null }
}

export type BridgeAdmission = { status: "anonymous" } | { status: "session"; receipt: Extract<BridgeReceipt, { kind: "session" }> } | { status: "closed" }

export function bridgeAdmission(generation: string | undefined, rawReceipt: string | undefined): BridgeAdmission {
  if (generation === undefined && rawReceipt === undefined) return { status: "anonymous" }
  const receipt = parseBridgeReceipt(rawReceipt)
  if (!isBridgeGeneration(generation) || !receipt || receipt.generation !== generation) return { status: "closed" }
  return receipt.kind === "anonymous" ? { status: "anonymous" } : { status: "session", receipt }
}
