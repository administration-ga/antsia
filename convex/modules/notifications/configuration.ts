/** PA5 — les origines, fournisseurs et secrets restent dans l'environnement du propriétaire. */
import { devToolsAllowed } from "../../lib/devTools"

export type NotificationApplication = { applicationId: string; networkSlug: string; origin: string; entryPath: string; native?: { platform: "ios" | "android"; bundleId?: string; calls: boolean } }
export function notificationApplications(): NotificationApplication[] {
  const raw = process.env.NOTIFICATION_APPLICATIONS_JSON
  if (!raw) return []
  try {
    const rows: unknown = JSON.parse(raw)
    if (!Array.isArray(rows) || rows.length > 32) return []
    const result: NotificationApplication[] = []
    for (const row of rows) {
      if (!row || typeof row !== "object" || !("applicationId" in row) || !("networkSlug" in row) || !("origin" in row) || !("entryPath" in row)) return []
      const { applicationId, networkSlug, origin, entryPath } = row
      if (typeof applicationId !== "string" || !/^[a-z][a-z0-9_-]{1,63}$/u.test(applicationId) || typeof networkSlug !== "string" || typeof origin !== "string" || typeof entryPath !== "string") return []
      const url = new URL(origin)
      if (url.username || url.password || url.origin !== origin || (url.protocol !== "https:" && !(devToolsAllowed() && url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))) return []
      const target = new URL(entryPath, origin)
      if (!entryPath.startsWith("/") || entryPath.startsWith("//") || target.origin !== origin || target.hash || entryPath.length > 200) return []
      if (result.some((item) => item.applicationId === applicationId)) return []
      let native: NotificationApplication["native"]
      if ("native" in row) {
        const candidate = row.native
        if (!candidate || typeof candidate !== "object" || Array.isArray(candidate) || !("platform" in candidate) || !("calls" in candidate) ||
          (candidate.platform !== "ios" && candidate.platform !== "android") || typeof candidate.calls !== "boolean" ||
          Object.keys(candidate).some(key => !["platform", "bundleId", "calls"].includes(key))) return []
        const bundleId = "bundleId" in candidate ? candidate.bundleId : undefined
        if (bundleId !== undefined && (typeof bundleId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9.-]{2,254}$/u.test(bundleId))) return []
        native = { platform: candidate.platform, calls: candidate.calls, ...(typeof bundleId === "string" ? { bundleId } : {}) }
      }
      result.push({ applicationId, networkSlug, origin, entryPath, ...(native ? { native } : {}) })
    }
    return result
  } catch { return [] }
}

export function notificationApplication(applicationId: string, networkSlug: string): NotificationApplication | null {
  return notificationApplications().find((row) => row.applicationId === applicationId && row.networkSlug === networkSlug) ?? null
}

export function applicationNotificationUrl(application: NotificationApplication): string {
  return new URL(application.entryPath, application.origin).toString()
}

/** Même avec une clef correcte, aucun relais HTTP ni redirection de fournisseur. */
export function providerHttpsUrl(value: string | undefined): string | null {
  try { const url = new URL(value ?? ""); return url.protocol === "https:" && !url.username && !url.password && !url.hash ? url.toString() : null } catch { return null }
}

/** Aucun identifiant d'application ni fournisseur natif n'est activé par défaut. */
export function nativeCallApplication(applicationId: string, networkSlug: string): NotificationApplication | null {
  const application = notificationApplication(applicationId, networkSlug)
  if (!application?.native?.calls) return null
  if (!process.env.LIVEKIT_API_KEY?.trim() || !process.env.LIVEKIT_API_SECRET?.trim() || !process.env.LIVEKIT_WS_URL?.trim()) return null
  if (application.native.platform === "ios") {
    return application.native.bundleId && providerHttpsUrl(process.env.APNS_ENDPOINT) && process.env.APNS_PRIVATE_KEY?.trim() && process.env.APNS_KEY_ID?.trim() && process.env.APNS_TEAM_ID?.trim() ? application : null
  }
  if (!providerHttpsUrl(process.env.FCM_SEND_ENDPOINT) || !providerHttpsUrl(process.env.FCM_OAUTH_ENDPOINT) || !process.env.FCM_OAUTH_SCOPE?.trim()) return null
  try {
    const account: unknown = JSON.parse(process.env.FCM_SERVICE_ACCOUNT_JSON ?? "null")
    return account && typeof account === "object" && "client_email" in account && typeof account.client_email === "string" && account.client_email.trim() && "private_key" in account && typeof account.private_key === "string" && account.private_key.trim() ? application : null
  } catch { return null }
}
