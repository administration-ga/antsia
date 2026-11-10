"use client"

import { useNetwork } from "@antsia/api/network"
import { isSigningOutEverywhere } from "@antsia/api/sign-out-everywhere"
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"
import { useCheckoutClock } from "@/components/checkout/use-checkout-clock"
import { CART_CHANGED_EVENT, CART_DRAFT_TTL_MS, cartDraftKey, type CartDraft } from "@/lib/cart-draft"
import { migrateCartBook, parseCartBook, saveCartBookDraft, selectCartBookDraft, type CartBookSaveError, type CartBookWriteResult } from "@/lib/cart-book"

function subscribe(callback: () => void) {
  window.addEventListener(CART_CHANGED_EVENT, callback)
  window.addEventListener("storage", callback)
  return () => { window.removeEventListener(CART_CHANGED_EVENT, callback); window.removeEventListener("storage", callback) }
}
const EMPTY_DRAFTS: CartDraft[] = []
export function useCartDraft(handle?: string) {
  const { networkId, personId } = useNetwork()
  const key = cartDraftKey(String(networkId), String(personId))
  const [readyKey, setReadyKey] = useState<string | null>(null)
  useEffect(() => { setReadyKey(key) }, [key])
  const snapshot = useCallback(() => { try { return window.sessionStorage.getItem(key) } catch { return null } }, [key])
  const raw = useSyncExternalStore(subscribe, snapshot, () => null)
  const initial = parseCartBook(raw, String(networkId), String(personId), Date.now())
  const expiresAt = initial?.drafts.length ? Math.min(...initial.drafts.map(draft => draft.updatedAt + CART_DRAFT_TTL_MS)) : null
  const now = useCheckoutClock(expiresAt)
  const book = parseCartBook(raw, String(networkId), String(personId), Math.max(now, Date.now()))
  const drafts = book?.drafts ?? EMPTY_DRAFTS
  const selectedHandle = book?.selectedHandle ?? null
  const draft = drafts.find(entry => entry.handle === (handle ?? selectedHandle)) ?? null
  const scope = JSON.stringify([key, handle ?? selectedHandle])
  const token = useMemo(() => ({ scope }), [scope])
  const active = useRef<typeof token | null>(null)
  useLayoutEffect(() => { active.current = token; return () => { if (active.current === token) active.current = null } }, [token])
  const errorRef = useRef<{ scope: string; value: CartBookSaveError | null }>({ scope, value: null })
  const [error, setError] = useState<{ scope: string; value: CartBookSaveError | null }>({ scope, value: null })
  const current = useCallback(() => active.current === token && readyKey === key && cartDraftKey(String(networkId), String(personId)) === key && !isSigningOutEverywhere(), [key, networkId, personId, readyKey, token])
  const finish = useCallback((result: CartBookWriteResult) => {
    const value = result.ok ? null : result.reason
    errorRef.current = { scope, value }; setError({ scope, value })
    if (result.ok && result.changed) window.dispatchEvent(new Event(CART_CHANGED_EVENT))
    return result.ok
  }, [scope])
  useEffect(() => {
    if (!current() || !raw) return
    try {
      const result = migrateCartBook(window.sessionStorage, String(networkId), String(personId), Date.now())
      if (result.ok && result.changed) window.dispatchEvent(new Event(CART_CHANGED_EVENT))
    } catch { /* Une migration empêchée laisse le panier V1 intact et lisible. */ }
  }, [current, raw, networkId, personId])
  const save = useCallback((next: CartDraft | null) => {
    if (!current()) { if (active.current === token) errorRef.current = { scope, value: "session_changed" }; return false }
    if (next && (next.networkId !== String(networkId) || next.personId !== String(personId) || handle !== undefined && next.handle !== handle)) return finish({ ok: false, reason: "invalid" })
    const target = next?.handle ?? handle ?? draft?.handle ?? null
    const expected = drafts.find(entry => entry.handle === target) ?? null
    try {
      return finish(saveCartBookDraft(window.sessionStorage, String(networkId), String(personId), next, target, Date.now(), expected))
    } catch { return finish({ ok: false, reason: "storage_unavailable" }) }
  }, [current, draft, drafts, finish, handle, networkId, personId, scope, token])
  const select = useCallback((nextHandle: string) => {
    if (!current()) { if (active.current === token) errorRef.current = { scope, value: "session_changed" }; return false }
    try { return finish(selectCartBookDraft(window.sessionStorage, String(networkId), String(personId), nextHandle, Date.now())) }
    catch { return finish({ ok: false, reason: "storage_unavailable" }) }
  }, [current, finish, networkId, personId, scope, token])
  const getSaveError = useCallback(() => errorRef.current.scope === scope ? errorRef.current.value : null, [scope])
  return { draft, drafts, selectedHandle, select, save, saveError: error.scope === scope ? error.value : null, getSaveError, ready: readyKey === key, networkId, personId }
}

/** Les lectures/écritures financières restent manuelles après le retour du réseau. */
export function useCartConnectivity() {
  const [state, setState] = useState({ online: true, generation: 0 })
  useEffect(() => {
    const update = () => setState((previous) => ({ online: navigator.onLine, generation: previous.generation + 1 }))
    setState((previous) => ({ ...previous, online: navigator.onLine }))
    window.addEventListener("online", update); window.addEventListener("offline", update)
    return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update) }
  }, [])
  return state
}
