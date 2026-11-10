import { z } from "zod"
import { CART_DRAFT_TTL_MS, cartDraftKey, cartDraftSchema, type CartDraft, type CartStorage } from "./cart-draft"

export const CART_DRAFTS_MAX = 8
export const CART_BOOK_BYTES_MAX = 128 * 1024
const ownerId = z.string().min(1).max(160).regex(/^[A-Za-z0-9_-]+$/)
export const cartBookSchema = z.object({
  version: z.literal(2), networkId: ownerId, personId: ownerId,
  selectedHandle: z.string().min(1).max(80).regex(/^[\p{L}\p{N}._-]+$/u).nullable(),
  drafts: z.array(cartDraftSchema).max(CART_DRAFTS_MAX),
}).strict().superRefine((book, context) => {
  if (new Set(book.drafts.map(draft => draft.handle)).size !== book.drafts.length) context.addIssue({ code: "custom", path: ["drafts"], message: "duplicate" })
  if (book.drafts.some(draft => draft.networkId !== book.networkId || draft.personId !== book.personId)) context.addIssue({ code: "custom", path: ["drafts"], message: "owner" })
  if (book.selectedHandle !== null && !book.drafts.some(draft => draft.handle === book.selectedHandle)) context.addIssue({ code: "custom", path: ["selectedHandle"], message: "missing" })
  const requests = book.drafts.flatMap(draft => draft.submitted ? [draft.submitted.clientRequestId] : [])
  if (new Set(requests).size !== requests.length) context.addIssue({ code: "custom", path: ["drafts"], message: "request" })
})
export type CartBook = z.infer<typeof cartBookSchema>
export type CartBookSaveError = "drafts_full" | "invalid" | "storage_unavailable" | "session_changed" | "conflict"
export type CartBookWriteResult = { ok: true; book: CartBook; changed: boolean } | { ok: false; reason: CartBookSaveError }
type Owner = { networkId: string; personId: string }

function emptyBook(owner: Owner): CartBook { return { version: 2, ...owner, selectedHandle: null, drafts: [] } }
function bounded(raw: string): boolean { return raw.length <= CART_BOOK_BYTES_MAX && new TextEncoder().encode(raw).byteLength <= CART_BOOK_BYTES_MAX }
function currentBook(book: CartBook, nowMs: number): CartBook {
  const drafts = book.drafts.filter(draft => nowMs - draft.updatedAt < CART_DRAFT_TTL_MS)
  return { ...book, drafts, selectedHandle: drafts.some(draft => draft.handle === book.selectedHandle) ? book.selectedHandle : drafts[0]?.handle ?? null }
}

/** Lecture compatible V1, sans suppression et sans proroger la vie d'un autre vendeur. */
export function parseCartBook(raw: string | null, networkId: string, personId: string, nowMs: number): CartBook | null {
  if (!raw || !bounded(raw) || !Number.isSafeInteger(nowMs)) return null
  try {
    const input: unknown = JSON.parse(raw)
    const legacy = cartDraftSchema.safeParse(input)
    if (legacy.success) {
      if (legacy.data.networkId !== networkId || legacy.data.personId !== personId || legacy.data.updatedAt > nowMs) return null
      return currentBook({ version: 2, networkId, personId, selectedHandle: legacy.data.handle, drafts: [legacy.data] }, nowMs)
    }
    const parsed = cartBookSchema.safeParse(input)
    if (!parsed.success || parsed.data.networkId !== networkId || parsed.data.personId !== personId || parsed.data.drafts.some(draft => draft.updatedAt > nowMs)) return null
    return currentBook(parsed.data, nowMs)
  } catch { return null }
}

export function readCartBook(storage: CartStorage, networkId: string, personId: string, nowMs: number): CartBook | null {
  try { return parseCartBook(storage.getItem(cartDraftKey(networkId, personId)), networkId, personId, nowMs) } catch { return null }
}

/** La valeur précédente reste intacte si la sérialisation ou l'écriture échoue. */
function changeBook(storage: CartStorage, owner: Owner, nowMs: number, change: (book: CartBook) => CartBook | CartBookSaveError, migrationOnly = false): CartBookWriteResult {
  if (!Number.isSafeInteger(nowMs) || !ownerId.safeParse(owner.networkId).success || !ownerId.safeParse(owner.personId).success) return { ok: false, reason: "invalid" }
  try {
    const key = cartDraftKey(owner.networkId, owner.personId)
    const raw = storage.getItem(key)
    const book = raw === null ? emptyBook(owner) : parseCartBook(raw, owner.networkId, owner.personId, nowMs)
    if (!book) return { ok: false, reason: "invalid" }
    if (migrationOnly && (raw === null || JSON.parse(raw).version !== 1)) return { ok: true, book, changed: false }
    const next = change(book)
    if (typeof next === "string") return { ok: false, reason: next }
    const parsed = cartBookSchema.safeParse(next)
    if (!parsed.success) return { ok: false, reason: "invalid" }
    const serialized = JSON.stringify(parsed.data)
    if (!bounded(serialized)) return { ok: false, reason: "invalid" }
    if (serialized === raw) return { ok: true, book: parsed.data, changed: false }
    if (storage.getItem(key) !== raw) return { ok: false, reason: "conflict" }
    storage.setItem(key, serialized)
    return { ok: true, book: parsed.data, changed: true }
  } catch { return { ok: false, reason: "storage_unavailable" } }
}

/** Migration atomique dans la même clé ; aucune suppression préalable du panier historique. */
export function migrateCartBook(storage: CartStorage, networkId: string, personId: string, nowMs: number): CartBookWriteResult {
  return changeBook(storage, { networkId, personId }, nowMs, book => book, true)
}

/** Relit la collection courante et ne remplace que le vendeur visé. */
export function saveCartBookDraft(storage: CartStorage, networkId: string, personId: string, next: CartDraft | null, handle: string | null, nowMs: number, expected?: CartDraft | null): CartBookWriteResult {
  if (next && (next.networkId !== networkId || next.personId !== personId || next.handle !== handle || next.updatedAt > nowMs || nowMs - next.updatedAt >= CART_DRAFT_TTL_MS)) return { ok: false, reason: "invalid" }
  return changeBook(storage, { networkId, personId }, nowMs, book => {
    const previous = book.drafts.find(draft => draft.handle === handle) ?? null
    if (expected !== undefined) {
      const parsedExpected = expected === null ? null : cartDraftSchema.safeParse(expected)
      if (parsedExpected !== null && !parsedExpected.success) return "invalid"
      if (JSON.stringify(previous) !== JSON.stringify(parsedExpected?.data ?? null)) return "conflict"
    }
    if (!next) {
      const drafts = book.drafts.filter(draft => draft.handle !== handle)
      return { ...book, drafts, selectedHandle: drafts.some(draft => draft.handle === book.selectedHandle) ? book.selectedHandle : drafts[0]?.handle ?? null }
    }
    if (!previous && book.drafts.length >= CART_DRAFTS_MAX) return "drafts_full"
    const drafts = previous ? book.drafts.map(draft => draft.handle === handle ? next : draft) : [...book.drafts, next]
    return { ...book, drafts, selectedHandle: handle }
  })
}

/** La sélection ne modifie ni les lignes, ni les intentions, ni leur échéance. */
export function selectCartBookDraft(storage: CartStorage, networkId: string, personId: string, handle: string, nowMs: number): CartBookWriteResult {
  return changeBook(storage, { networkId, personId }, nowMs, book => book.drafts.some(draft => draft.handle === handle) ? { ...book, selectedHandle: handle } : "invalid")
}
