"use client"

import { useEffect, useState } from "react"
import { ICOM_WORKSPACE_SPLIT_MIN } from "./icom-workspace-styles"

/** L'hôte de présentation d'appel ne s'enregistre jamais dans un panneau masqué. */
export function useIcomWorkspaceWide(element: HTMLElement | null, adaptive: boolean): boolean {
  const [state, setState] = useState<{ element: HTMLElement | null; wide: boolean }>({ element: null, wide: false })
  useEffect(() => {
    if (!adaptive || !element) return
    let current = true
    const update = (width: number) => { if (current) setState({ element, wide: width >= ICOM_WORKSPACE_SPLIT_MIN }) }
    update(element.clientWidth)
    if (typeof ResizeObserver !== "function") return () => { current = false }
    const observer = new ResizeObserver((entries) => {
      const entry = entries.find((item) => item.target === element)
      if (entry) update(entry.contentRect.width)
    })
    observer.observe(element)
    return () => { current = false; observer.disconnect() }
  }, [element, adaptive])
  return !adaptive || state.element === element && state.wide
}
