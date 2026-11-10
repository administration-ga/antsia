import { personalStateKeys } from "@antsia/api/sign-out-everywhere"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { CART_DRAFT_TTL_MS, cartDraftKey, readCartDraft, writeCartDraft, type CartDraft } from "./cart-draft"
import { CART_BOOK_BYTES_MAX, CART_DRAFTS_MAX, migrateCartBook, parseCartBook, readCartBook, saveCartBookDraft, selectCartBookDraft } from "./cart-book"

const mocks = vi.hoisted(() => ({ namespace: "" }))
vi.mock("./demo-storage", () => ({ demoStorageNamespace: () => mocks.namespace }))
const now = Date.UTC(2026, 9, 21, 16)
const owner = { networkId: "network-a", personId: "person-a" }
function draft(handle = "atelier", updatedAt = now): CartDraft { return { version: 1, ...owner, handle, updatedAt, items: [{ offerRef: `pro.ga:offer:${handle}`, quantity: 2 }], submitted: null } }
function submitted(handle: string): CartDraft {
  const current = draft(handle)
  return { ...current, submitted: { clientRequestId: `request-for-${handle}-opaque`, digest: (handle === "atelier" ? "a" : "b").repeat(64), submittedAt: now, expectedPolicyVersion: 1, expectedLines: current.items.map(item => ({ ...item, expectedCatalogRevision: 1, expectedUnitAmount: { amount: 100, currency: "XAF" } })) } }
}
function memoryStorage() {
  const values = new Map<string, string>()
  return { values, get length() { return values.size }, key: (index: number) => [...values.keys()][index] ?? null, getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) }, removeItem: (key: string) => { values.delete(key) } }
}
function bookOf(storage: ReturnType<typeof memoryStorage>, at = now) { return readCartBook(storage, owner.networkId, owner.personId, at) }
beforeEach(() => { mocks.namespace = "" })

describe("collection de paniers par vendeur", () => {
  it("migre le panier V1 dans la même clé sans perdre son intention et sans effacer avant écriture", () => {
    const storage = memoryStorage(), legacy = submitted("atelier")
    const key = cartDraftKey(owner.networkId, owner.personId)
    storage.setItem(key, JSON.stringify(legacy))
    expect(bookOf(storage)).toMatchObject({ version: 2, drafts: [legacy], selectedHandle: "atelier" })
    expect(storage.getItem(key)).toBe(JSON.stringify(legacy))
    expect(migrateCartBook(storage, owner.networkId, owner.personId, now)).toMatchObject({ ok: true, changed: true })
    expect(JSON.parse(storage.getItem(key)!)).toEqual({ version: 2, ...owner, selectedHandle: "atelier", drafts: [legacy] })
    expect(storage.length).toBe(1)
    expect(readCartDraft(storage, owner.networkId, owner.personId, now)).toBeNull()
    expect(writeCartDraft(storage, draft("autre"), now)).toBe(false)
    expect(bookOf(storage)?.drafts).toEqual([legacy])
  })

  it("garde les octets V1 si la migration ou un ajout sont refusés par le stockage", () => {
    const storage = memoryStorage(), key = cartDraftKey(owner.networkId, owner.personId)
    const raw = JSON.stringify(submitted("atelier"))
    storage.setItem(key, raw)
    const blocked = { ...storage, setItem: () => { throw new Error("quota") } }
    expect(migrateCartBook(blocked, owner.networkId, owner.personId, now)).toEqual({ ok: false, reason: "storage_unavailable" })
    expect(saveCartBookDraft(blocked, owner.networkId, owner.personId, draft("autre"), "autre", now)).toEqual({ ok: false, reason: "storage_unavailable" })
    expect(storage.getItem(key)).toBe(raw)
    expect(bookOf(storage)?.drafts).toEqual([submitted("atelier")])
  })

  it("relit la dernière collection pour préserver les écritures de deux vendeurs et refuse un remplacement périmé", () => {
    const storage = memoryStorage()
    expect(saveCartBookDraft(storage, owner.networkId, owner.personId, draft("atelier"), "atelier", now, null).ok).toBe(true)
    expect(saveCartBookDraft(storage, owner.networkId, owner.personId, draft("epicerie"), "epicerie", now, null).ok).toBe(true)
    expect(bookOf(storage)?.drafts.map(item => item.handle)).toEqual(["atelier", "epicerie"])
    const stale = draft("atelier")
    const updated = { ...stale, items: [{ ...stale.items[0]!, quantity: 4 }] }
    expect(saveCartBookDraft(storage, owner.networkId, owner.personId, updated, "atelier", now, stale).ok).toBe(true)
    expect(saveCartBookDraft(storage, owner.networkId, owner.personId, stale, "atelier", now, stale)).toEqual({ ok: false, reason: "conflict" })
    expect(bookOf(storage)?.drafts.find(item => item.handle === "atelier")?.items[0]?.quantity).toBe(4)
    expect(bookOf(storage)?.drafts.find(item => item.handle === "epicerie")).toEqual(draft("epicerie"))
  })

  it("borne huit vendeurs sans éviction et permet encore de modifier un panier existant", () => {
    const storage = memoryStorage()
    for (let i = 0; i < CART_DRAFTS_MAX; i++) expect(saveCartBookDraft(storage, owner.networkId, owner.personId, draft(`seller-${i}`), `seller-${i}`, now).ok).toBe(true)
    const before = storage.getItem(cartDraftKey(owner.networkId, owner.personId))
    expect(saveCartBookDraft(storage, owner.networkId, owner.personId, draft("ninth"), "ninth", now)).toEqual({ ok: false, reason: "drafts_full" })
    expect(storage.getItem(cartDraftKey(owner.networkId, owner.personId))).toBe(before)
    const changed = { ...draft("seller-0"), items: [{ offerRef: "pro.ga:offer:seller-0", quantity: 3 }] }
    expect(saveCartBookDraft(storage, owner.networkId, owner.personId, changed, "seller-0", now).ok).toBe(true)
    expect(bookOf(storage)?.drafts).toHaveLength(8)
  })

  it("expire séparément chaque vendeur sans prolonger l'autre lors d'une sélection", () => {
    const storage = memoryStorage(), old = draft("ancien", now - CART_DRAFT_TTL_MS + 1000), fresh = draft("recent")
    expect(saveCartBookDraft(storage, owner.networkId, owner.personId, old, old.handle, now).ok).toBe(true)
    expect(saveCartBookDraft(storage, owner.networkId, owner.personId, fresh, fresh.handle, now).ok).toBe(true)
    expect(selectCartBookDraft(storage, owner.networkId, owner.personId, old.handle, now).ok).toBe(true)
    expect(bookOf(storage)?.drafts).toEqual([old, fresh])
    expect(bookOf(storage, now + 1000)).toMatchObject({ selectedHandle: fresh.handle, drafts: [fresh] })
    expect(selectCartBookDraft(storage, owner.networkId, owner.personId, fresh.handle, now + 1000).ok).toBe(true)
    expect(bookOf(storage, now + CART_DRAFT_TTL_MS)?.drafts).toEqual([])
  })

  it("isole les intentions et ne retire que le vendeur explicitement visé", () => {
    const storage = memoryStorage(), a = submitted("atelier"), b = submitted("epicerie")
    expect(saveCartBookDraft(storage, owner.networkId, owner.personId, a, a.handle, now).ok).toBe(true)
    expect(saveCartBookDraft(storage, owner.networkId, owner.personId, b, b.handle, now).ok).toBe(true)
    expect(selectCartBookDraft(storage, owner.networkId, owner.personId, a.handle, now).ok).toBe(true)
    expect(bookOf(storage)?.drafts).toEqual([a, b])
    expect(saveCartBookDraft(storage, owner.networkId, owner.personId, null, a.handle, now, a).ok).toBe(true)
    expect(bookOf(storage)).toMatchObject({ selectedHandle: b.handle, drafts: [b] })
  })

  it("refuse champs étrangers, acteur/réseau incohérents, vendeur dupliqué, date future et taille excessive", () => {
    const valid = { version: 2, ...owner, selectedHandle: "atelier", drafts: [draft()] }
    for (const value of [
      { ...valid, address: "private" }, { ...valid, drafts: [{ ...draft(), title: "private" }] },
      { ...valid, drafts: [{ ...draft(), personId: "other" }] }, { ...valid, drafts: [{ ...draft(), networkId: "other" }] },
      { ...valid, drafts: [draft(), draft()] }, { ...valid, selectedHandle: "unknown" },
      { ...valid, drafts: [draft("atelier", now + 1)] },
    ]) expect(parseCartBook(JSON.stringify(value), owner.networkId, owner.personId, now)).toBeNull()
    expect(parseCartBook(" ".repeat(CART_BOOK_BYTES_MAX + 1), owner.networkId, owner.personId, now)).toBeNull()
    expect(parseCartBook(JSON.stringify(valid), "other", owner.personId, now)).toBeNull()
    expect(parseCartBook(JSON.stringify(valid), owner.networkId, "other", now)).toBeNull()
    const storage = memoryStorage(), key = cartDraftKey("other", owner.personId)
    storage.setItem(key, JSON.stringify(valid))
    expect(saveCartBookDraft(storage, "other", owner.personId, null, "atelier", now)).toEqual({ ok: false, reason: "invalid" })
    expect(storage.getItem(key)).toBe(JSON.stringify(valid))
  })

  it("garde les espaces normal/démo distincts et la purge nominale existante", () => {
    const storage = memoryStorage(), normalKey = cartDraftKey(owner.networkId, owner.personId)
    expect(saveCartBookDraft(storage, owner.networkId, owner.personId, draft(), "atelier", now).ok).toBe(true)
    mocks.namespace = "antsia-demo-scope:"
    const demoKey = cartDraftKey(owner.networkId, owner.personId)
    expect(demoKey).not.toBe(normalKey)
    expect(bookOf(storage)).toBeNull()
    expect(saveCartBookDraft(storage, owner.networkId, owner.personId, draft("demo"), "demo", now).ok).toBe(true)
    expect(personalStateKeys(storage)).toEqual([normalKey])
    for (const key of personalStateKeys(storage)) storage.removeItem(key)
    expect(storage.getItem(normalKey)).toBeNull()
    expect(bookOf(storage)?.drafts.map(item => item.handle)).toEqual(["demo"])
    const demoView = { get length() { return storage.length }, key: (i: number) => storage.key(i)?.replace(/^antsia-demo-scope:/, "") ?? null, removeItem: (key: string) => storage.removeItem(`antsia-demo-scope:${key}`) }
    for (const key of personalStateKeys(demoView)) demoView.removeItem(key)
    expect(storage.getItem(demoKey)).toBeNull()
  })
})
