/** P17c — transport système fermé : références opaques, aucune identité ni preuve d'accès. */
export const NATIVE_CALL_RING_MAX_MS = 45_000
export const NATIVE_CALL_EVENT_TTL_MS = 60_000
export const NATIVE_CALL_EVENT_LIMIT = 32

export type NativeCallBinding = { applicationId: string; deviceId: string; bindingId: string }
export type NativeCallPushPayload = {
  version: 1
  kind: "antsia.call"
  phase: "ring"
  networkId: string
  reference: string
  applicationId: string
  bindingId: string
  /** Vrai UUID aléatoire, attribué UNE fois par le moteur ; pas un droit de réponse. */
  uuid: string
  expiresAt: number
}
export function isNativeCallUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}
export function isNativeCallPushPayload(value: unknown, now?: number): value is NativeCallPushPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false
  const row = value as Record<string, unknown>
  if (Object.keys(row).sort().join("|") !== "applicationId|bindingId|expiresAt|kind|networkId|phase|reference|uuid|version") return false
  if (row.version !== 1 || row.kind !== "antsia.call" || row.phase !== "ring") return false
  if (typeof row.applicationId !== "string" || !/^[a-z][a-z0-9_-]{1,63}$/.test(row.applicationId)) return false
  if (typeof row.networkId !== "string" || !/^[a-z0-9]{16,64}$/.test(row.networkId) || typeof row.reference !== "string" || !/^[a-z0-9]{16,64}$/.test(row.reference)) return false
  if (!isNativeCallUuid(row.bindingId) || !isNativeCallUuid(row.uuid) || !Number.isSafeInteger(row.expiresAt) || (row.expiresAt as number) <= 0) return false
  return now === undefined || Number.isFinite(now) && (row.expiresAt as number) > now && (row.expiresAt as number) <= now + NATIVE_CALL_RING_MAX_MS + 5_000
}
