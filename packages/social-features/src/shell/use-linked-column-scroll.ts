"use client"

import { useLayoutEffect, useRef } from "react"

/**
 * Le centre entraîne le contexte par le déplacement réellement effectué.
 * Le rail reste libre : sa propre lecture ne déplace jamais le fil, et sa
 * limite native empêche toute réserve de défilement après la dernière carte.
 */
export function useLinkedColumnScroll(enabled: boolean) {
  const centerRef = useRef<HTMLDivElement>(null)
  const contextRef = useRef<HTMLElement>(null)
  const composerRef = useRef<HTMLDivElement>(null)
  const toolsRef = useRef<HTMLElement>(null)

  useLayoutEffect(() => {
    const center = centerRef.current
    const context = contextRef.current
    if (!enabled || !center || !context) return

    const positions = new WeakMap<HTMLElement, number>([[center, center.scrollTop]])
    const follow = (event: Event) => {
      const scroller = event.target
      if (!(scroller instanceof HTMLElement)) return
      // Les lecteurs d'immersion défilent en eux-mêmes. Les champs de saisie
      // et les autres widgets du fil ne doivent pas entraîner le contexte.
      if (scroller !== center && !scroller.matches(".fil-imm-scroller, .fil-imm-slot")) return
      const delta = scroller.scrollTop - (positions.get(scroller) ?? 0)
      positions.set(scroller, scroller.scrollTop)
      // Un rail masqué sur tablette garde sa position, sans lecture de layout
      // ni abonnement React à chaque image du défilement.
      if (context.clientHeight === 0 || delta === 0) return
      context.scrollTop = Math.max(0, Math.min(context.scrollTop + delta, context.scrollHeight - context.clientHeight))
    }
    const measure = () => {
      center.style.setProperty("--rp-composer-height", `${composerRef.current?.getBoundingClientRect().height ?? 0}px`)
      center.style.setProperty("--rp-tools-height", `${toolsRef.current?.getBoundingClientRect().height ?? 0}px`)
    }
    measure()
    const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(measure)
    if (composerRef.current) observer?.observe(composerRef.current)
    if (toolsRef.current) observer?.observe(toolsRef.current)
    center.addEventListener("scroll", follow, { passive: true, capture: true })
    return () => {
      center.removeEventListener("scroll", follow, { capture: true })
      observer?.disconnect()
      center.style.removeProperty("--rp-composer-height")
      center.style.removeProperty("--rp-tools-height")
    }
  }, [enabled])

  return { centerRef, contextRef, composerRef, toolsRef }
}
