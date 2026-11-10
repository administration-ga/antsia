"use client"

/**
 * layout-measure — mesurer la place du lecteur et retrouver les positions
 * (lot P04). Lecture seule du DOM ; aucune décision (voir
 * `immersive-reader-model.ts`).
 *
 * Le lecteur occupe la place RESTANTE de son défileur : au téléphone le
 * document (sous l'en-tête collant, au-dessus de la barre basse fixe repérée
 * par `[data-mobile-nav]`), au bureau la colonne de lecture qui défile pour
 * soi (`.rp-main-col`, ou la grille sur une colonne). Ainsi le défileur hôte
 * n'a plus rien à faire défiler et le lecteur est le SEUL défileur du fil.
 */

import { useLayoutEffect, useState, type RefObject } from "react"

import { SURFACE_BOTTOM_OBSTACLE_SELECTOR } from "../../shell/floating-surface/use-surface-insets"
import { fillHeight } from "./immersive-reader-model"

/** Plancher de hauteur du lecteur (pixels CSS) : en dessous, le mode Liste a déjà pris le relais. */
export const IMMERSIVE_MIN_STAGE_HEIGHT = 320

/** Planifie une mesure au prochain rafraîchissement ; rend l'annulation. */
export function scheduleFrame(callback: () => void): () => void {
  if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
    const frame = window.requestAnimationFrame(() => callback())
    return () => window.cancelAnimationFrame(frame)
  }
  const timer = setTimeout(callback, 16)
  return () => clearTimeout(timer)
}

/** Le premier ancêtre qui défile pour soi ; `null` : le document. */
export function findScrollContainer(element: HTMLElement): HTMLElement | null {
  if (typeof window === "undefined" || typeof window.getComputedStyle !== "function") return null
  let current = element.parentElement
  while (current !== null && current !== document.body && current !== document.documentElement) {
    const overflowY = window.getComputedStyle(current).overflowY
    if ((overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay") && current.clientHeight > 0) return current
    current = current.parentElement
  }
  return null
}

/** La place qu'une barre basse fixe (téléphone) prend au bas de la fenêtre, encoche comprise. */
export function bottomObstacleHeight(viewportHeight: number): number {
  if (typeof document === "undefined") return 0
  const bar = document.querySelector<HTMLElement>(SURFACE_BOTTOM_OBSTACLE_SELECTOR)
  if (bar === null) return 0
  const rect = bar.getBoundingClientRect()
  if (rect.height <= 0 || rect.top >= viewportHeight) return 0
  return Math.max(0, viewportHeight - rect.top)
}

/** La hauteur disponible sous le haut de l'élément, jusqu'au bas de son défileur. */
export function availableHeightFor(element: HTMLElement): number {
  const container = findScrollContainer(element)
  const rect = element.getBoundingClientRect()
  if (container !== null) {
    const containerRect = container.getBoundingClientRect()
    const paddingBottom = Number.parseFloat(window.getComputedStyle(container).paddingBottom) || 0
    // Position dans le CONTENU du défileur (défilement compris).
    const top = rect.top - containerRect.top + container.scrollTop
    return fillHeight({ available: container.clientHeight - top - paddingBottom, min: IMMERSIVE_MIN_STAGE_HEIGHT })
  }
  const viewport = window.innerHeight
  const documentTop = rect.top + window.scrollY
  return fillHeight({ available: viewport - documentTop - bottomObstacleHeight(viewport), min: IMMERSIVE_MIN_STAGE_HEIGHT })
}

/**
 * La hauteur de l'élément qui remplit la place restante, remesurée au
 * redimensionnement, à la rotation et quand le contenu au-dessus change.
 * `null` avant la première mesure (le style garde alors son repli CSS).
 */
export function useFillAvailableHeight(ref: RefObject<HTMLElement | null>, enabled: boolean): number | null {
  const [height, setHeight] = useState<number | null>(null)

  useLayoutEffect(() => {
    const element = ref.current
    if (!enabled || element === null || typeof window === "undefined") return
    let cancel: (() => void) | null = null
    const measure = () => {
      cancel = null
      const next = availableHeightFor(element)
      setHeight((current) => (current !== null && Math.abs(current - next) < 1 ? current : next))
    }
    const schedule = () => {
      if (cancel === null) cancel = scheduleFrame(measure)
    }
    measure()
    // Au téléphone, le lecteur prend la place SOUS l'en-tête : le document
    // revient en haut, plus rien d'autre n'y défile.
    if (findScrollContainer(element) === null && window.scrollY > 0 && typeof window.scrollTo === "function") {
      try {
        window.scrollTo({ top: 0 })
      } catch {
        // Environnement sans défilement de fenêtre : rien à rétablir.
      }
    }
    window.addEventListener("resize", schedule)
    window.addEventListener("orientationchange", schedule)
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule)
    if (observer !== null) {
      if (element.parentElement !== null) observer.observe(element.parentElement)
      const container = findScrollContainer(element)
      if (container !== null) observer.observe(container)
    }
    return () => {
      cancel?.()
      window.removeEventListener("resize", schedule)
      window.removeEventListener("orientationchange", schedule)
      observer?.disconnect()
    }
  }, [enabled, ref])

  return height
}

/** Le bord lisible du défileur : sous les outils épinglés du fil adaptatif, 0 pour le document. */
export function scrollContainerTop(container: HTMLElement | null): number {
  if (container === null) return 0
  const top = container.getBoundingClientRect().top
  const style = window.getComputedStyle(container)
  // Seul le fil adaptatif mesure ce composeur. Le padding de défilement des
  // autres surfaces ne change pas leur ancienne convention d'ancrage.
  if (!style.getPropertyValue("--rp-composer-height").trim()) return top
  const inset = Number.parseFloat(style.scrollPaddingTop)
  return top + (Number.isFinite(inset) ? Math.max(0, inset) : 0)
}

/** Fait défiler le défileur de l'élément (ou la fenêtre) de `delta` pixels, sans animation. */
export function scrollContainerBy(container: HTMLElement | null, delta: number): void {
  if (delta === 0) return
  if (container !== null) {
    container.scrollTop += delta
    return
  }
  if (typeof window.scrollBy === "function") {
    try {
      window.scrollBy(0, delta)
    } catch {
      // Environnement sans défilement de fenêtre.
    }
  }
}
