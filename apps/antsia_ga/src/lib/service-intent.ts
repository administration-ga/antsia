import { z } from "zod"

import { demoStorageNamespace } from "./demo-storage"

export const SERVICE_INTENT_TTL_MS = 24 * 60 * 60_000
const reference = z.string().min(1).max(200)
const scopeSchema = z.object({ networkId: reference, personId: reference, mode: z.enum(["quote", "booking", "fixed_order", "quote_acceptance", "quote_rejection", "booking_change", "booking_cancel"]), handle: reference, offerRef: reference, requestRowId: reference.optional() }).strict()
const intentSchema = scopeSchema.extend({ version: z.literal(1), clientRequestId: z.string().min(16).max(128).regex(/^[A-Za-z0-9_-]+$/), createdAt: z.number().int().positive().safe() }).strict()
export type ServiceIntentScope = z.infer<typeof scopeSchema>
export type ServiceIntent = z.infer<typeof intentSchema>
export type ServiceIntentStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">
export function serviceIntentKey(scope: ServiceIntentScope): string { return `${demoStorageNamespace()}antsia:service-intent:${[scope.networkId, scope.personId, scope.mode, scope.handle, scope.offerRef, scope.requestRowId ?? ""].map(encodeURIComponent).join(":")}` }
/** Index de reprise seulement : aucun besoin, nom, note, pièce ou accord n'est admis. */
export function parseServiceIntent(raw: string | null, scope: ServiceIntentScope, nowMs: number, recoveryOnly = false): ServiceIntent | null {
  if (!raw || raw.length > 4096 || !Number.isSafeInteger(nowMs)) return null
  try {
    const parsed = intentSchema.safeParse(JSON.parse(raw))
    if (!parsed.success) return null
    const value = parsed.data
    if (serviceIntentKey(value) !== serviceIntentKey(scope) || value.createdAt > nowMs || !recoveryOnly && nowMs - value.createdAt >= SERVICE_INTENT_TTL_MS) return null
    return value
  } catch { return null }
}
export function readServiceIntent(storage: ServiceIntentStorage, scope: ServiceIntentScope, nowMs: number): ServiceIntent | null {
  const key = serviceIntentKey(scope), raw = storage.getItem(key)
  // Une échéance ferme les nouveaux envois ; les références restent réservées à la recherche/fence.
  const value = parseServiceIntent(raw, scope, nowMs, true)
  if (raw && !value) throw new Error("invalidServiceIntent")
  return value
}
export function writeServiceIntent(storage: ServiceIntentStorage, value: ServiceIntent, nowMs: number): boolean {
  const parsed = parseServiceIntent(JSON.stringify(value), value, nowMs)
  if (!parsed) return false
  try { storage.setItem(serviceIntentKey(value), JSON.stringify(parsed)); return storage.getItem(serviceIntentKey(value)) === JSON.stringify(parsed) } catch { return false }
}
export function removeServiceIntent(storage: ServiceIntentStorage, scope: ServiceIntentScope): boolean {
  try { storage.removeItem(serviceIntentKey(scope)); return storage.getItem(serviceIntentKey(scope)) === null } catch { return false }
}
