import { z } from "zod"
import { commerceCanonicalJson, COMMERCE_MAX_AMOUNT_XAF } from "@antsia/social-domain/commerce/primitives"

import { demoStorageNamespace } from "./demo-storage"

export const CART_LINES_MAX = 10
export const CART_DRAFT_TTL_MS = 24 * 60 * 60 * 1000
export const CART_CHANGED_EVENT = "antsia:cart-changed"
const opaque = z.string().min(1).max(160).regex(/^[A-Za-z0-9_-]+$/)
const itemSchema = z.object({ offerRef: z.string().max(200).regex(/^pro\.ga:offer:[A-Za-z0-9_-]+$/), variantRef: z.string().max(200).regex(/^pro\.ga:offer_variant:[A-Za-z0-9_-]+$/).optional(), quantity: z.number().int().min(1).max(999) }).strict()
const expectedLineSchema = z.object({ offerRef: itemSchema.shape.offerRef, variantRef: itemSchema.shape.variantRef, quantity: itemSchema.shape.quantity, expectedCatalogRevision: z.number().int().positive().safe(), expectedUnitAmount: z.object({ amount: z.number().int().min(0).max(COMMERCE_MAX_AMOUNT_XAF), currency: z.literal("XAF") }).strict() }).strict()
const submittedSchema = z.object({ clientRequestId: z.string().min(16).max(128).regex(/^[A-Za-z0-9_-]+$/), submittedAt: z.number().int().positive().safe(), digest: z.string().regex(/^[a-f0-9]{64}$/), expectedLines: z.array(expectedLineSchema).min(1).max(CART_LINES_MAX), expectedPolicyVersion: z.number().int().positive().safe(), attemptId: opaque.optional() }).strict()
export const cartDraftSchema = z.object({ version: z.literal(1), networkId: opaque, personId: opaque, handle: z.string().min(1).max(80).regex(/^[\p{L}\p{N}._-]+$/u), updatedAt: z.number().int().positive().safe(), items: z.array(itemSchema).min(1).max(CART_LINES_MAX), submitted: submittedSchema.nullable() }).strict().superRefine((value, context) => {
  const keys = value.items.map(cartItemKey)
  if (new Set(keys).size !== keys.length) context.addIssue({ code: "custom", path: ["items"], message: "duplicate" })
  if (value.submitted && value.submitted.submittedAt > value.updatedAt) context.addIssue({ code: "custom", path: ["submitted"], message: "time" })
})
export type CartItem = z.infer<typeof itemSchema>
export type CartDraft = z.infer<typeof cartDraftSchema>
export type CartSubmittedIntent = z.infer<typeof submittedSchema>
export type CartStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">
export function cartItemKey(item: Pick<CartItem, "offerRef" | "variantRef">): string { return `${item.offerRef}#${item.variantRef ?? ""}` }
export function cartDraftKey(networkId: string, personId: string): string { return `${demoStorageNamespace()}antsia:cart:${encodeURIComponent(networkId)}:${encodeURIComponent(personId)}` }
/** Empreinte seulement : le texte d'adresse et l'accord ne sont jamais persistés. */
export async function cartIntentDigest(value: unknown): Promise<string | null> {
  const canonical = commerceCanonicalJson(value)
  if (canonical === null) return null
  try { return [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical)))].map((byte) => byte.toString(16).padStart(2, "0")).join("") } catch { return null }
}

/** Le JSON personnel ne contient jamais adresse, note, consentement ou jeton. */
export function parseCartDraft(raw: string | null, networkId: string, personId: string, nowMs: number): CartDraft | null {
  if (!raw || raw.length > 16_384 || !Number.isSafeInteger(nowMs)) return null
  try {
    const result = cartDraftSchema.safeParse(JSON.parse(raw))
    if (!result.success) return null
    const draft = result.data
    if (draft.networkId !== networkId || draft.personId !== personId || draft.updatedAt > nowMs || nowMs - draft.updatedAt >= CART_DRAFT_TTL_MS) return null
    return draft
  } catch { return null }
}
export function readCartDraft(storage: CartStorage, networkId: string, personId: string, nowMs: number): CartDraft | null {
  try {
    const key = cartDraftKey(networkId, personId)
    const raw = storage.getItem(key)
    const draft = parseCartDraft(raw, networkId, personId, nowMs)
    // Un ancien appelant ne détruit jamais une collection écrite par la version suivante.
    if (raw && !draft && !isProtectedCartPayload(raw)) storage.removeItem(key)
    return draft
  } catch { return null }
}
export function writeCartDraft(storage: CartStorage, draft: CartDraft, nowMs: number): boolean {
  const parsed = parseCartDraft(JSON.stringify(draft), draft.networkId, draft.personId, nowMs)
  if (!parsed) return false
  try {
    const key = cartDraftKey(draft.networkId, draft.personId)
    if (isProtectedCartPayload(storage.getItem(key))) return false
    storage.setItem(key, JSON.stringify(parsed)); return true
  } catch { return false }
}
function isProtectedCartPayload(raw: string | null): boolean {
  if (!raw) return false
  if (raw.length > 16_384) return true
  try { const value: unknown = JSON.parse(raw); return value !== null && typeof value === "object" && "version" in value && value.version === 2 } catch { return false }
}
export function removeCartDraft(storage: CartStorage, networkId: string, personId: string): boolean {
  try { storage.removeItem(cartDraftKey(networkId, personId)); return true } catch { return false }
}

export type CartEditResult = { ok: true; draft: CartDraft } | { ok: false; reason: "different_seller" | "submitted" | "full" | "invalid" }
export function addCartItem(current: CartDraft | null, owner: { networkId: string; personId: string }, handle: string, item: CartItem, nowMs: number): CartEditResult {
  if (current?.submitted) return { ok: false, reason: "submitted" }
  if (current && current.handle !== handle) return { ok: false, reason: "different_seller" }
  const previous = current?.items ?? []
  const existing = previous.find((entry) => cartItemKey(entry) === cartItemKey(item))
  if (!existing && previous.length >= CART_LINES_MAX) return { ok: false, reason: "full" }
  const items = existing ? previous.map((entry) => cartItemKey(entry) === cartItemKey(item) ? { ...entry, quantity: entry.quantity + item.quantity } : entry) : [...previous, item]
  const result = cartDraftSchema.safeParse({ version: 1, ...owner, handle, updatedAt: nowMs, items, submitted: null })
  return result.success ? { ok: true, draft: result.data } : { ok: false, reason: "invalid" }
}
