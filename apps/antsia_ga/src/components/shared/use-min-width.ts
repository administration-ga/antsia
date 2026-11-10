"use client"

import { useCallback, useSyncExternalStore } from "react"

/** La fenêtre atteint-elle `px` de large ? Au serveur et au premier rendu : non (rendu du téléphone d'abord). */
export function useMinWidth(px: number): boolean {
  const query = `(min-width: ${px}px)`
  const subscribe = useCallback((callback: () => void) => {
    if (typeof window.matchMedia !== "function") return () => undefined
    const media = window.matchMedia(query)
    media.addEventListener("change", callback)
    return () => media.removeEventListener("change", callback)
  }, [query])
  const snapshot = useCallback(() => typeof window.matchMedia === "function" && window.matchMedia(query).matches, [query])
  return useSyncExternalStore(subscribe, snapshot, () => false)
}
