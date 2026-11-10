import { isNativeCallUuid, type NativeCallBinding } from "@antsia/social-contracts/native-calls"
import type { NativeCallAuthority } from "./types"

export type StoredCallBinding = NativeCallBinding & {
  sessionId: string; personId: string; networkId: string; expiresAt: number
}
/** Cleanup may remove an expired descriptor, but only for the exact captured owner. */
export function ownedStoredBindingId(raw: string | null, owner: Pick<NativeCallAuthority, "sessionId" | "personId" | "networkId">): string | null {
  if (!raw || raw.length > 2_048) return null
  try {
    const value: unknown = JSON.parse(raw)
    if (!value || typeof value !== "object") return null
    const row = value as Record<string, unknown>
    return row.sessionId === owner.sessionId && row.personId === owner.personId && row.networkId === owner.networkId && isNativeCallUuid(row.bindingId) ? row.bindingId : null
  } catch { return null }
}
/** Same session agreement only. Incompatible, expired or malformed storage never enrolls another account. */
export function parseStoredCallBinding(raw: string | null, owner: Pick<NativeCallAuthority, "sessionId" | "personId" | "networkId" | "expiresAt">, applicationId: string, now: number): StoredCallBinding | null {
  if (!raw || raw.length > 2_048) return null
  try {
    const value: unknown = JSON.parse(raw)
    if (!value || typeof value !== "object" || Array.isArray(value)) return null
    const row = value as Record<string, unknown>
    if (Object.keys(row).sort().join("|") !== "applicationId|bindingId|deviceId|expiresAt|networkId|personId|sessionId") return null
    if (row.applicationId !== applicationId || row.sessionId !== owner.sessionId || row.personId !== owner.personId || row.networkId !== owner.networkId || !isNativeCallUuid(row.bindingId) || !isNativeCallUuid(row.deviceId)) return null
    if (typeof row.expiresAt !== "number" || !Number.isSafeInteger(row.expiresAt) || row.expiresAt <= now || row.expiresAt > owner.expiresAt) return null
    return row as StoredCallBinding
  } catch { return null }
}
