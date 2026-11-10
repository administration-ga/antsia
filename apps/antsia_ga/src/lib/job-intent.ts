import { z } from "zod"

import { demoStorageNamespace } from "./demo-storage"

export const JOB_INTENT_TTL_MS = 24 * 60 * 60_000
const reference = z.string().min(1).max(200)
const scopeSchema = z.object({ networkId: reference, personId: reference, handle: reference, jobRef: reference }).strict()
const intentSchema = scopeSchema.extend({ version: z.literal(1), idempotencyKey: z.string().min(16).max(128).regex(/^[A-Za-z0-9_-]+$/), createdAt: z.number().int().positive().safe() }).strict()
export type JobIntentScope = z.infer<typeof scopeSchema>
export type JobIntent = z.infer<typeof intentSchema>
export type JobIntentStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">
export function jobIntentKey(scope: JobIntentScope): string { return `${demoStorageNamespace()}antsia:job-intent:${[scope.networkId, scope.personId, scope.handle, scope.jobRef].map(encodeURIComponent).join(":")}` }
/** Index fermé : aucune identité civile, motivation, pièce ou preuve d'accord. */
export function parseJobIntent(raw: string | null, scope: JobIntentScope, now: number, recoveryOnly = false): JobIntent | null {
  if (!raw || raw.length > 4096 || !Number.isSafeInteger(now)) return null
  try {
    const parsed = intentSchema.safeParse(JSON.parse(raw))
    if (!parsed.success) return null
    const value = parsed.data
    return jobIntentKey(value) !== jobIntentKey(scope) || value.createdAt > now || !recoveryOnly && now - value.createdAt >= JOB_INTENT_TTL_MS ? null : value
  } catch { return null }
}
export function readJobIntent(storage: JobIntentStorage, scope: JobIntentScope, now: number): JobIntent | null {
  const raw = storage.getItem(jobIntentKey(scope)), value = parseJobIntent(raw, scope, now, true)
  // Un âge local ne prouve jamais que le serveur n'a créé aucune candidature.
  if (raw !== null && !value) throw new Error("invalidJobIntent")
  return value
}
export function writeJobIntent(storage: JobIntentStorage, value: JobIntent, now: number): boolean {
  const parsed = parseJobIntent(JSON.stringify(value), value, now)
  if (!parsed) return false
  try { const raw = JSON.stringify(parsed); storage.setItem(jobIntentKey(value), raw); return storage.getItem(jobIntentKey(value)) === raw } catch { return false }
}
export function removeJobIntent(storage: JobIntentStorage, scope: JobIntentScope): boolean {
  try { storage.removeItem(jobIntentKey(scope)); return storage.getItem(jobIntentKey(scope)) === null } catch { return false }
}
